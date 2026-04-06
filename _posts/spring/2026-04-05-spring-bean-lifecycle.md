---
layout: post
title: "Spring Bean 라이프사이클 완전 정복"
subtitle: "생성부터 소멸까지 — Bean이 거치는 모든 단계를 코드로 확인하기"
date: 2026-04-05 09:00:00 +0900
author: "DoYoon Kim"
header-style: text
catalog: true
series: "Spring 심화"
tags:
  - Spring
  - Backend
  - Java
categories: [spring]
description: "Spring Bean의 생성부터 소멸까지 전체 라이프사이클을 단계별로 설명합니다. @PostConstruct, InitializingBean, BeanPostProcessor의 실행 순서와 활용법을 코드 예제로 다룹니다."
---

## 들어가며

Spring을 사용하면 대부분의 객체 생명주기를 컨테이너가 관리한다. `new`로 직접 생성하지 않고 `@Component`나 `@Bean`으로 등록하면, Spring이 알아서 객체를 만들고, 의존성을 주입하고, 초기화하고, 소멸시킨다.

하지만 "정확히 어떤 순서로?" 라는 질문에 답하려면 Bean 라이프사이클을 제대로 이해해야 한다. 특히 [AOP 프록시 생성 시점](/spring/2026/04/03/spring-aop-internals/)이나 초기화 로직을 넣을 위치를 결정할 때 이 지식이 직접적으로 필요하다.

---

## Bean 라이프사이클 전체 흐름

Spring Bean이 생성되고 소멸되기까지의 전체 흐름은 다음과 같다.

```
1. 빈 인스턴스화 (Instantiation)
       ↓
2. 의존성 주입 (Dependency Injection)
       ↓
3. BeanNameAware.setBeanName()
       ↓
4. BeanFactoryAware.setBeanFactory()
       ↓
5. ApplicationContextAware.setApplicationContext()
       ↓
6. BeanPostProcessor.postProcessBeforeInitialization()
       ↓
7. @PostConstruct
       ↓
8. InitializingBean.afterPropertiesSet()
       ↓
9. @Bean(initMethod = "...")
       ↓
10. BeanPostProcessor.postProcessAfterInitialization()
    ← AOP 프록시가 여기서 생성됨
       ↓
    ===== 빈 사용 =====
       ↓
11. @PreDestroy
       ↓
12. DisposableBean.destroy()
       ↓
13. @Bean(destroyMethod = "...")
```

단계가 많아 보이지만, 실무에서 주로 사용하는 것은 **@PostConstruct / @PreDestroy**, **InitializingBean / DisposableBean**, **BeanPostProcessor** 세 가지 그룹이다.

---

## 초기화 콜백: 세 가지 방법

### 1. @PostConstruct / @PreDestroy (권장)

Jakarta EE 표준 어노테이션으로, 가장 간결하고 가독성이 좋다.

```java
@Component
@Slf4j
public class CacheWarmer {

    private final ProductRepository productRepository;
    private Map<Long, Product> cache;

    @Autowired
    public CacheWarmer(ProductRepository productRepository) {
        this.productRepository = productRepository;
        // 이 시점에서는 아직 DI가 완료되지 않았을 수 있음
        log.info("[1] 생성자 호출 — productRepository: {}", productRepository);
    }

    @PostConstruct
    public void warmUp() {
        // DI 완료 후 호출 — 안전하게 의존 객체를 사용할 수 있다
        log.info("[2] @PostConstruct — 캐시 워밍업 시작");
        cache = productRepository.findAll().stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        log.info("[2] @PostConstruct — {}개 상품 캐시 완료", cache.size());
    }

    @PreDestroy
    public void clearCache() {
        log.info("[3] @PreDestroy — 캐시 정리");
        cache.clear();
    }
}
```

**왜 생성자가 아닌 @PostConstruct에서 초기화하는가?** 생성자 호출 시점에는 필드 주입(`@Autowired` 필드)이 아직 완료되지 않았을 수 있다. `@PostConstruct`는 모든 의존성 주입이 끝난 후 호출되므로 안전하다. 위 예시처럼 생성자 주입을 사용하면 생성자에서도 의존 객체에 접근할 수 있지만, 다른 빈의 `@PostConstruct`가 아직 실행되지 않았을 수 있으므로 **초기화 로직은 @PostConstruct에 두는 것이 원칙**이다.

### 2. InitializingBean / DisposableBean

Spring 전용 인터페이스를 구현하는 방식이다.

```java
@Component
@Slf4j
public class DatabaseHealthChecker implements InitializingBean, DisposableBean {

    private final DataSource dataSource;
    private ScheduledExecutorService scheduler;

    public DatabaseHealthChecker(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void afterPropertiesSet() throws Exception {
        log.info("InitializingBean.afterPropertiesSet() — DB 헬스체크 스케줄러 시작");
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(this::checkHealth, 0, 30, TimeUnit.SECONDS);
    }

    @Override
    public void destroy() throws Exception {
        log.info("DisposableBean.destroy() — 스케줄러 종료");
        scheduler.shutdown();
    }

    private void checkHealth() {
        try (Connection conn = dataSource.getConnection()) {
            conn.isValid(3);
        } catch (SQLException e) {
            log.error("DB 헬스체크 실패", e);
        }
    }
}
```

이 방식은 Spring 프레임워크에 직접 의존하게 되므로, **프레임워크 독립적인 코드가 필요할 때는 @PostConstruct/@PreDestroy를 사용하는 것이 좋다.**

### 3. @Bean(initMethod, destroyMethod)

외부 라이브러리 클래스처럼 소스를 수정할 수 없는 경우에 유용하다.

```java
@Configuration
public class AppConfig {

    @Bean(initMethod = "init", destroyMethod = "close")
    public ExternalConnectionPool connectionPool() {
        return new ExternalConnectionPool("jdbc:mysql://localhost/mydb");
    }
}
```

```java
// 외부 라이브러리 클래스 — 어노테이션을 붙일 수 없음
public class ExternalConnectionPool {

    public ExternalConnectionPool(String url) { /* ... */ }

    public void init() {
        // 커넥션 풀 초기화
    }

    public void close() {
        // 커넥션 풀 정리
    }
}
```

---

## 실행 순서 확인: 전체 라이프사이클 로그

세 가지 방식을 모두 적용한 빈을 만들어 실행 순서를 확인해 보자.

```java
@Component
@Slf4j
public class LifecycleDemo implements InitializingBean, DisposableBean,
        BeanNameAware, ApplicationContextAware {

    private String beanName;

    public LifecycleDemo() {
        log.info("[1] 생성자 호출");
    }

    @Override
    public void setBeanName(String name) {
        this.beanName = name;
        log.info("[2] BeanNameAware.setBeanName() — {}", name);
    }

    @Override
    public void setApplicationContext(ApplicationContext ctx) {
        log.info("[3] ApplicationContextAware.setApplicationContext()");
    }

    @PostConstruct
    public void postConstruct() {
        log.info("[4] @PostConstruct");
    }

    @Override
    public void afterPropertiesSet() {
        log.info("[5] InitializingBean.afterPropertiesSet()");
    }

    @PreDestroy
    public void preDestroy() {
        log.info("[6] @PreDestroy");
    }

    @Override
    public void destroy() {
        log.info("[7] DisposableBean.destroy()");
    }
}
```

실행 결과:

```
[1] 생성자 호출
[2] BeanNameAware.setBeanName() — lifecycleDemo
[3] ApplicationContextAware.setApplicationContext()
[4] @PostConstruct
[5] InitializingBean.afterPropertiesSet()
===== 애플리케이션 실행 =====
[6] @PreDestroy
[7] DisposableBean.destroy()
```

`@PostConstruct`가 `InitializingBean.afterPropertiesSet()`보다 **먼저** 호출된다는 점을 기억하자. 이는 `@PostConstruct`가 `BeanPostProcessor`의 `postProcessBeforeInitialization` 단계에서 처리되기 때문이다.

---

## BeanPostProcessor 활용

`BeanPostProcessor`는 **모든 빈**의 초기화 전후에 개입할 수 있는 강력한 확장 포인트다. Spring 내부적으로도 AOP 프록시 생성, `@Autowired` 처리, `@PostConstruct` 처리 등이 모두 `BeanPostProcessor`를 통해 이루어진다.

```java
@Component
@Slf4j
public class CustomBeanPostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName)
            throws BeansException {
        if (bean.getClass().isAnnotationPresent(MonitoredComponent.class)) {
            log.info("[BPP Before] {} — 모니터링 대상 빈 감지", beanName);
        }
        return bean;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName)
            throws BeansException {
        if (bean.getClass().isAnnotationPresent(MonitoredComponent.class)) {
            log.info("[BPP After] {} — 초기화 완료, 모니터링 등록", beanName);
            MonitoringRegistry.register(beanName, bean);
        }
        return bean;
    }
}
```

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface MonitoredComponent {
}
```

```java
@Component
@MonitoredComponent
public class PaymentGateway {
    // 이 빈이 생성될 때 CustomBeanPostProcessor가 개입한다
}
```

### AOP 프록시와 BeanPostProcessor

[Spring AOP 글](/spring/2026/04/03/spring-aop-internals/)에서 설명했듯이, AOP 프록시는 `BeanPostProcessor`의 `postProcessAfterInitialization` 단계에서 생성된다. 즉, `@PostConstruct`가 실행되는 시점에는 아직 프록시가 아닌 원본 객체다.

```
@PostConstruct        → 원본 객체에서 실행
  ↓
postProcessAfterInit  → 여기서 프록시로 교체
  ↓
빈 등록               → 프록시 객체가 빈으로 등록됨
```

이 때문에 `@PostConstruct`에서 `this`를 출력하면 프록시가 아닌 원본 클래스명이 나온다.

---

## 스코프별 라이프사이클 차이

| 스코프 | 생성 시점 | 소멸 시점 |
|--------|----------|----------|
| **singleton** (기본) | 컨테이너 시작 시 | 컨테이너 종료 시 |
| **prototype** | 요청할 때마다 | **컨테이너가 관리하지 않음** |
| **request** | HTTP 요청 시 | HTTP 응답 완료 시 |
| **session** | 세션 생성 시 | 세션 종료 시 |

**prototype 스코프 주의**: Spring은 prototype 빈의 소멸을 관리하지 않는다. `@PreDestroy`가 호출되지 않으므로, 리소스 정리가 필요하다면 직접 처리해야 한다.

```java
@Component
@Scope("prototype")
public class PrototypeBean {

    @PreDestroy
    public void cleanup() {
        // 이 메서드는 호출되지 않는다!
    }
}
```

---

## 실전 주의사항

1. **생성자에서 무거운 작업을 하지 마라** — 생성자는 빈 인스턴스화 단계이므로, 아직 다른 빈이 초기화되지 않았을 수 있다. 무거운 초기화는 `@PostConstruct`에서 수행하자.

2. **@PostConstruct에서 예외가 발생하면 애플리케이션이 기동되지 않는다** — 초기화 실패 시 빈 등록이 취소되고, 의존하는 다른 빈도 연쇄적으로 실패한다. 외부 시스템 연결 같은 불안정한 작업은 `@PostConstruct` 대신 별도의 헬스체크 메커니즘을 고려하자.

3. **순환 참조와 라이프사이클** — A → B → A 순환 참조가 있으면 Spring은 아직 완전히 초기화되지 않은 빈의 참조를 주입할 수 있다. 생성자 주입을 사용하면 순환 참조를 컴파일 타임에 감지할 수 있다.

4. **@Lazy와 초기화 시점** — `@Lazy`가 붙은 빈은 처음 사용될 때까지 초기화가 지연된다. 애플리케이션 기동 시간을 줄이는 데 유용하지만, 런타임에 초기화 에러가 발생할 수 있다는 단점이 있다.

---

## 마무리

Spring Bean 라이프사이클의 핵심은 **"의존성 주입 완료 후 초기화"** 라는 원칙이다. 생성자는 객체 생성만, 비즈니스 초기화 로직은 `@PostConstruct`에서 처리하는 패턴을 기본으로 삼자. `BeanPostProcessor`는 프레임워크 확장이나 커스텀 어노테이션 처리에 강력한 도구이며, AOP 프록시가 여기서 생성된다는 점은 Spring 내부를 이해하는 데 중요한 열쇠다.

---

## 관련 포스트

- [Spring AOP 내부 동작 원리](/spring/2026/04/03/spring-aop-internals/)
- [Spring 트랜잭션 전파 레벨 완전 정복](/spring/2026/04/04/spring-transaction-propagation/)
- [Spring Boot + JPA 기초](/spring/2026/03/15/spring-boot-jpa-basics/)
- [Spring Security 6 + JWT 인증 구현](/spring/2026/04/01/spring-security-jwt/)
