---
layout: post
title: "Spring AOP 내부 동작 원리"
subtitle: "프록시 기반 AOP의 동작 방식부터 Self-invocation 함정까지"
date: "2026-04-03"
author: "DoYoon Kim"
header-style: text
catalog: true
series: "Spring 심화"
keywords: "spring, aop, proxy, cglib, jdk dynamic proxy, transactional"
tags:
  - Spring
  - AOP
  - Backend
  - Java
categories:
  - spring
description: "Spring AOP의 내부 동작 원리를 파헤칩니다. JDK Dynamic Proxy와 CGLIB의 차이, @Transactional이 AOP로 동작하는 메커니즘, Self-invocation 문제와 해결법까지 다룹니다."
---

## 들어가며

Spring을 쓰다 보면 `@Transactional`, `@Cacheable`, `@Async` 같은 어노테이션을 자연스럽게 사용하게 된다. 이 어노테이션들의 공통점은 **AOP(Aspect-Oriented Programming)** 기반으로 동작한다는 것이다. 하지만 AOP의 내부 구조를 이해하지 못하면 "분명 `@Transactional`을 붙였는데 왜 롤백이 안 되지?" 같은 상황에서 한참을 헤매게 된다.

이번 글에서는 Spring AOP가 프록시를 통해 어떻게 동작하는지, 그리고 실무에서 자주 마주치는 함정들을 살펴본다.

---

## AOP 핵심 용어 정리

본격적인 내용에 앞서 AOP의 핵심 개념 네 가지를 짚고 넘어가자.

| 용어 | 설명 | 예시 |
|------|------|------|
| **Aspect** | 횡단 관심사를 모듈화한 단위 | 로깅, 트랜잭션, 보안 |
| **Pointcut** | Advice가 적용될 JoinPoint를 선별하는 표현식 | `@annotation(Transactional)` |
| **Advice** | 실제 수행할 부가 로직 | `@Before`, `@After`, `@Around` |
| **JoinPoint** | Advice가 적용될 수 있는 지점 | 메서드 실행 시점 |

Spring AOP는 **메서드 실행 시점**만 JoinPoint로 지원한다. 필드 접근이나 생성자 호출 시점에 AOP를 적용하려면 AspectJ를 직접 사용해야 한다.

---

## 프록시 기반 AOP

Spring AOP의 핵심은 **프록시 패턴**이다. 빈을 등록할 때 원본 객체 대신 프록시 객체를 생성하고, 메서드 호출 시 프록시가 먼저 Advice를 실행한 뒤 원본 메서드를 호출한다.

```
Client → [Proxy] → Target(원본 Bean)
            │
            ├── Before Advice 실행
            ├── Target 메서드 호출
            └── After Advice 실행
```

### JDK Dynamic Proxy vs CGLIB Proxy

Spring은 두 가지 방식으로 프록시를 생성한다.

| 구분 | JDK Dynamic Proxy | CGLIB Proxy |
|------|-------------------|-------------|
| **방식** | 인터페이스 기반 | 클래스 상속 기반 |
| **요구사항** | 대상 클래스가 인터페이스를 구현해야 함 | final 클래스가 아니면 됨 |
| **성능** | 리플렉션 사용 (상대적으로 느림) | 바이트코드 조작 (상대적으로 빠름) |
| **Spring Boot 기본값** | X | **O** (2.0부터 기본) |

Spring Boot 2.0부터는 `spring.aop.proxy-target-class=true`가 기본값이므로 인터페이스 유무와 관계없이 **CGLIB**으로 프록시를 생성한다. CGLIB은 런타임에 바이트코드를 조작하여 서브클래스를 생성하는데, 이 과정은 [JVM 클래스 로딩 메커니즘](/jvm/2026/04/03/jvm-architecture-classloading/)의 Application ClassLoader를 통해 이루어진다.

```java
// CGLIB 프록시가 생성되는 과정 (개념적 표현)
public class PostService$$EnhancerBySpringCGLIB extends PostService {

    private PostService target;
    private TransactionInterceptor txInterceptor;

    @Override
    public void save(Post post) {
        // 1. 트랜잭션 시작 (Advice)
        txInterceptor.begin();
        try {
            // 2. 원본 메서드 호출
            target.save(post);
            // 3. 커밋
            txInterceptor.commit();
        } catch (RuntimeException e) {
            // 4. 롤백
            txInterceptor.rollback();
            throw e;
        }
    }
}
```

---

## @Transactional이 AOP로 동작하는 원리

[이전 글(Spring Boot + JPA 기초)](/spring/2026/03/15/spring-boot-jpa-basics/)에서 `@Transactional`을 사용했다. 이 어노테이션이 실제로 동작하는 과정은 다음과 같다.

```
1. Spring 컨테이너 기동
2. @Transactional이 붙은 클래스 발견
3. 해당 클래스의 CGLIB 프록시 생성
4. 프록시를 빈으로 등록 (원본 대신)
5. 클라이언트가 메서드 호출
6. 프록시가 TransactionInterceptor를 통해 트랜잭션 시작
7. 원본 메서드 실행
8. 정상이면 커밋, RuntimeException이면 롤백
```

`TransactionInterceptor`는 `MethodInterceptor`를 구현한 Spring의 내장 Advice다. `@Transactional`의 속성(`propagation`, `isolation`, `rollbackFor` 등)을 읽어서 트랜잭션 동작을 결정한다. 트랜잭션 전파 레벨에 대한 자세한 내용은 [Spring 트랜잭션 전파 레벨 완전 정복](/spring/2026/04/04/spring-transaction-propagation/)에서 다룬다.

---

## Self-invocation 문제

Spring AOP에서 가장 빈번하게 마주치는 함정이 **Self-invocation(자기 호출)** 문제다.

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;

    public void createOrder(OrderRequest request) {
        // 내부 메서드 호출 — @Transactional이 동작하지 않는다!
        saveOrder(request);
    }

    @Transactional
    public void saveOrder(OrderRequest request) {
        orderRepository.save(request.toEntity());
    }
}
```

`createOrder()`에서 `saveOrder()`를 호출할 때, 이 호출은 **프록시를 거치지 않고 `this`를 통해 직접** 이루어진다. 프록시를 거치지 않으므로 `@Transactional` Advice가 실행되지 않는다.

```
외부 호출:  Client → [Proxy] → target.createOrder()
내부 호출:                      target.createOrder() → this.saveOrder()  ← 프록시 우회!
```

### 해결 방법

**1. 클래스 분리 (권장)**

가장 깔끔한 방법은 트랜잭션이 필요한 로직을 별도 클래스로 분리하는 것이다.

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderSaveService orderSaveService;

    public void createOrder(OrderRequest request) {
        // 외부 빈 호출 → 프록시를 거친다
        orderSaveService.saveOrder(request);
    }
}

@Service
@RequiredArgsConstructor
public class OrderSaveService {

    private final OrderRepository orderRepository;

    @Transactional
    public void saveOrder(OrderRequest request) {
        orderRepository.save(request.toEntity());
    }
}
```

**2. `ApplicationContext`에서 자기 자신을 주입**

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;

    @Lazy
    @Autowired
    private OrderService self; // 프록시 객체가 주입됨

    public void createOrder(OrderRequest request) {
        self.saveOrder(request); // 프록시를 통해 호출
    }

    @Transactional
    public void saveOrder(OrderRequest request) {
        orderRepository.save(request.toEntity());
    }
}
```

첫 번째 방법이 설계 측면에서 더 권장된다. 자기 자신을 주입하는 패턴은 순환 참조를 유발할 수 있고, 코드 가독성도 떨어진다.

---

## 커스텀 @Around Advice 예제

실무에서 자주 사용하는 패턴인 **메서드 실행 시간 측정 Aspect**를 만들어 보자.

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ExecutionTimer {
}
```

```java
@Aspect
@Component
@Slf4j
public class ExecutionTimerAspect {

    @Around("@annotation(com.example.annotation.ExecutionTimer)")
    public Object measureExecutionTime(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        long start = System.nanoTime();

        try {
            Object result = joinPoint.proceed(); // 원본 메서드 실행
            return result;
        } finally {
            long elapsed = (System.nanoTime() - start) / 1_000_000;
            log.info("[ExecutionTimer] {} — {}ms", methodName, elapsed);
        }
    }
}
```

사용 예시:

```java
@Service
public class ProductService {

    @ExecutionTimer
    public List<Product> searchProducts(String keyword) {
        // 복잡한 검색 로직
        return productRepository.findByKeywordWithFilters(keyword);
    }
}
```

```
// 로그 출력
[ExecutionTimer] ProductService.searchProducts(..) — 142ms
```

`@Around` Advice의 핵심은 `ProceedingJoinPoint.proceed()`다. 이 메서드를 호출해야 원본 메서드가 실행되고, 호출하지 않으면 원본 메서드가 실행되지 않는다. `try-finally`로 감싸면 예외가 발생해도 실행 시간을 측정할 수 있다.

---

## 실전 주의사항

1. **private 메서드에는 AOP가 적용되지 않는다** — 프록시가 오버라이드할 수 없기 때문이다. CGLIB은 상속 기반이므로 `private`, `final` 메서드에는 프록시가 개입할 수 없다.

2. **같은 클래스 내부 호출은 프록시를 우회한다** — 위에서 다룬 Self-invocation 문제. `@Transactional`, `@Cacheable`, `@Async` 모두 동일한 원리로 영향을 받는다.

3. **프록시 객체와 원본 객체는 다르다** — `getClass()`를 찍어보면 `$$EnhancerBySpringCGLIB$$` 같은 접미사가 붙는다. `instanceof`는 정상 동작하지만, `==` 비교는 실패할 수 있다.

4. **Advice 실행 순서** — 여러 Aspect가 같은 메서드에 적용될 때 `@Order` 어노테이션으로 순서를 제어한다. 숫자가 작을수록 먼저 실행된다.

---

## 마무리

Spring AOP는 프록시 패턴을 기반으로 동작하며, 이를 이해하면 `@Transactional`을 비롯한 대부분의 Spring 어노테이션이 어떻게 동작하는지 명확해진다. 특히 Self-invocation 문제는 실무에서 정말 자주 만나는 버그 원인이니 반드시 기억해 두자. [Spring Bean 라이프사이클](/spring/2026/04/05/spring-bean-lifecycle/)에서 프록시 빈이 생성되는 시점을 더 자세히 다룰 예정이다.

---

## 관련 포스트

- [Spring Boot + JPA 기초](/spring/2026/03/15/spring-boot-jpa-basics/)
- [Spring Security 6 + JWT 인증 구현](/spring/2026/04/01/spring-security-jwt/)
- [Spring 트랜잭션 전파 레벨 완전 정복](/spring/2026/04/04/spring-transaction-propagation/)
- [Spring Bean 라이프사이클 완전 정복](/spring/2026/04/05/spring-bean-lifecycle/)
