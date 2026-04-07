---
layout: post
title: "MSA 핵심 패턴 — Circuit Breaker, API Gateway, Service Discovery, Saga"
subtitle: "마이크로서비스 아키텍처의 안정성을 위한 4가지 필수 패턴과 실전 구현"
date: "2026-04-03"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
series: "System Design"
keywords: "msa, circuit breaker, api gateway, service discovery, saga, resilience4j"
tags:
  - MSA
  - Circuit Breaker
  - Resilience4j
  - Spring Cloud
  - System Design
categories:
  - system-design
description: "MSA 핵심 패턴 4가지 정리. Circuit Breaker(Resilience4j), API Gateway, Service Discovery, Saga 패턴의 개념과 Spring Boot 실전 코드를 다룹니다."
---

## 마이크로서비스의 복잡성

모놀리식에서 마이크로서비스로 전환하면 서비스별 독립 배포와 확장이 가능해진다. 하지만 서비스 수가 늘어나면서 새로운 종류의 문제가 나타난다.

```
모놀리식:  [서비스 A → 서비스 B]  (메서드 호출, 실패 = 예외)

MSA:      [서비스 A] ──HTTP──→ [서비스 B]  (네트워크 호출, 실패 = 타임아웃/장애 전파)
              │
              └──HTTP──→ [서비스 C] ──→ [서비스 D]
```

- **서비스 B가 느려지면?** → A도 스레드가 고갈되어 같이 죽는다 (Cascading Failure)
- **서비스 C의 주소가 바뀌면?** → 호출하는 모든 서비스를 수정해야 한다
- **여러 서비스에 걸친 트랜잭션은?** → DB 트랜잭션으로 묶을 수 없다
- **외부 클라이언트는 어디로 요청해야 하는가?** → 서비스별 엔드포인트를 다 알아야 한다

이 문제들을 해결하기 위해 MSA에서는 **검증된 패턴**들을 사용한다. 이 글에서는 가장 중요한 4가지 패턴을 다룬다.

---

## 1. Circuit Breaker — 장애 전파 차단

### 문제: Cascading Failure

서비스 B가 응답하지 않으면, 서비스 A는 타임아웃까지 스레드를 점유한 채 기다린다. 요청이 계속 쌓이면 A의 스레드 풀이 고갈되고, A에 의존하는 다른 서비스까지 연쇄적으로 장애가 전파된다.

```
정상:    A ──→ B (200ms 응답) ✓
장애:    A ──→ B (30초 타임아웃...) → A 스레드 고갈 → A도 장애
연쇄:    C ──→ A (응답 불가) → C도 장애 → D ──→ C → ...
```

### Circuit Breaker 동작 원리

전기 회로의 차단기처럼, 장애가 감지되면 호출을 차단하여 시스템을 보호한다.

```
         ┌──────────────────────────────────────────────┐
         │              Circuit Breaker                  │
         │                                              │
         │   CLOSED ──(실패율 임계치 초과)──→ OPEN       │
         │     ↑                                │       │
         │     │                         (대기 시간 후)  │
         │     │                                ↓       │
         │   CLOSED ←──(성공)── HALF_OPEN ──→ OPEN      │
         │                      (실패)                   │
         └──────────────────────────────────────────────┘
```

| 상태 | 동작 |
|------|------|
| **CLOSED** (정상) | 요청을 정상적으로 통과시킨다. 실패율을 모니터링한다. |
| **OPEN** (차단) | 요청을 즉시 거부하고 fallback을 반환한다. 빠르게 실패(Fail Fast). |
| **HALF_OPEN** (시험) | 제한된 요청만 통과시켜 복구 여부를 확인한다. |

### Resilience4j 구현

Resilience4j는 Java용 경량 장애 허용 라이브러리다. Netflix Hystrix의 후속으로, Spring Boot와 잘 통합된다.

```groovy
// build.gradle
dependencies {
    implementation 'io.github.resilience4j:resilience4j-spring-boot3:2.2.0'
    implementation 'org.springframework.boot:spring-boot-starter-aop'
}
```

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      orderService:
        sliding-window-type: COUNT_BASED
        sliding-window-size: 10               # 최근 10개 호출 기준
        failure-rate-threshold: 50            # 실패율 50% 초과 시 OPEN
        wait-duration-in-open-state: 10s      # OPEN 상태 유지 시간
        permitted-number-of-calls-in-half-open-state: 3  # HALF_OPEN 시 시험 호출 수
        minimum-number-of-calls: 5            # 최소 5번 호출 후 판단
        record-exceptions:                    # 실패로 기록할 예외
          - java.io.IOException
          - java.util.concurrent.TimeoutException
          - org.springframework.web.client.HttpServerErrorException
```

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final RestClient restClient;

    @CircuitBreaker(name = "orderService", fallbackMethod = "getOrderFallback")
    public OrderResponse getOrder(Long orderId) {
        return restClient.get()
                .uri("http://order-service/api/orders/{id}", orderId)
                .retrieve()
                .body(OrderResponse.class);
    }

    // 서킷이 OPEN이거나 호출 실패 시 실행되는 fallback
    private OrderResponse getOrderFallback(Long orderId, Throwable throwable) {
        log.warn("Circuit Breaker fallback 실행: orderId={}, error={}",
                orderId, throwable.getMessage());

        // 캐시된 데이터 반환, 기본값 반환, 또는 대체 서비스 호출
        return OrderResponse.builder()
                .orderId(orderId)
                .status("UNKNOWN")
                .message("주문 서비스가 일시적으로 불가합니다. 잠시 후 다시 시도해주세요.")
                .build();
    }
}
```

### Circuit Breaker + Retry + TimeLimiter 조합

실무에서는 Circuit Breaker를 단독으로 쓰지 않고, Retry와 TimeLimiter를 함께 사용한다.

```yaml
resilience4j:
  retry:
    instances:
      orderService:
        max-attempts: 3
        wait-duration: 500ms
        retry-exceptions:
          - java.io.IOException
  timelimiter:
    instances:
      orderService:
        timeout-duration: 3s
```

```java
@CircuitBreaker(name = "orderService", fallbackMethod = "getOrderFallback")
@Retry(name = "orderService")
@TimeLimiter(name = "orderService")
public CompletableFuture<OrderResponse> getOrderAsync(Long orderId) {
    return CompletableFuture.supplyAsync(() ->
            restClient.get()
                    .uri("http://order-service/api/orders/{id}", orderId)
                    .retrieve()
                    .body(OrderResponse.class)
    );
}
```

**실행 순서**: `TimeLimiter → Retry → CircuitBreaker` — 가장 바깥의 Circuit Breaker가 마지막 방어선 역할을 한다.

### Circuit Breaker 모니터링

```java
@Component
@RequiredArgsConstructor
public class CircuitBreakerMonitor {

    private final CircuitBreakerRegistry registry;

    @EventListener(ApplicationReadyEvent.class)
    public void registerEventListeners() {
        CircuitBreaker cb = registry.circuitBreaker("orderService");

        cb.getEventPublisher()
                .onStateTransition(event ->
                        log.warn("Circuit Breaker 상태 변경: {} → {}",
                                event.getStateTransition().getFromState(),
                                event.getStateTransition().getToState()))
                .onFailureRateExceeded(event ->
                        log.error("실패율 임계치 초과: {}%",
                                event.getFailureRate()));
    }
}
```

---

## 2. API Gateway — 단일 진입점

### 문제: 클라이언트가 모든 서비스 주소를 알아야 한다

```
클라이언트가 직접 호출하면:
  Mobile App ──→ user-service:8081/api/users
              ──→ order-service:8082/api/orders
              ──→ payment-service:8083/api/payments
              ──→ notification-service:8084/api/notify

문제:
  - 서비스 주소/포트 변경 시 클라이언트 수정 필요
  - 인증/로깅을 각 서비스에서 중복 구현
  - CORS, Rate Limiting 등을 서비스마다 설정
```

### API Gateway 역할

```
                    ┌─── API Gateway ───┐
  Client ──req──→   │  라우팅            │ ──→ user-service
                    │  인증/인가         │ ──→ order-service
                    │  Rate Limiting    │ ──→ payment-service
                    │  로깅/모니터링     │ ──→ notification-service
                    │  로드밸런싱        │
                    └───────────────────┘
```

| 기능 | 설명 |
|------|------|
| **라우팅** | URL 경로 기반으로 요청을 적절한 서비스로 전달 |
| **인증/인가** | JWT 검증 등을 게이트웨이에서 일괄 처리 |
| **Rate Limiting** | [Rate Limiting 전략](/system-design/2026/04/01/api-rate-limiting/)을 중앙에서 적용 |
| **로드밸런싱** | 동일 서비스의 여러 인스턴스에 트래픽 분산 |
| **응답 캐싱** | 자주 요청되는 데이터를 [캐시](/system-design/2026/03/28/caching-strategy/)하여 백엔드 부하 감소 |

### Spring Cloud Gateway 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.cloud:spring-cloud-starter-gateway'
}
```

```yaml
# application.yml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://USER-SERVICE           # Service Discovery 연동
          predicates:
            - Path=/api/users/**
          filters:
            - StripPrefix=0
            - name: CircuitBreaker
              args:
                name: userService
                fallbackUri: forward:/fallback/users

        - id: order-service
          uri: lb://ORDER-SERVICE
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter     # Rate Limiting 필터
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
                key-resolver: "#{@apiKeyResolver}"

      default-filters:
        - name: Retry
          args:
            retries: 3
            statuses: BAD_GATEWAY, SERVICE_UNAVAILABLE
```

```java
// 커스텀 필터: JWT 인증
@Component
public class JwtAuthFilter implements GatewayFilterFactory<JwtAuthFilter.Config> {

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            String token = exchange.getRequest()
                    .getHeaders().getFirst("Authorization");

            if (token == null || !token.startsWith("Bearer ")) {
                exchange.getResponse()
                        .setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }

            // JWT 검증 로직
            String jwt = token.substring(7);
            Claims claims = validateToken(jwt);

            // 검증된 사용자 정보를 헤더에 추가하여 하위 서비스로 전달
            ServerHttpRequest modifiedRequest = exchange.getRequest()
                    .mutate()
                    .header("X-User-Id", claims.getSubject())
                    .header("X-User-Role", claims.get("role", String.class))
                    .build();

            return chain.filter(
                    exchange.mutate().request(modifiedRequest).build());
        };
    }

    public static class Config {}
}
```

---

## 3. Service Discovery — 동적 서비스 탐색

### 문제: IP 주소 하드코딩의 한계

컨테이너 환경에서는 서비스 인스턴스가 동적으로 생성·삭제된다. IP 주소를 하드코딩하면 인스턴스가 바뀔 때마다 설정을 수정해야 한다.

```
하드코딩:
  order-service.url=http://192.168.1.10:8082  → 인스턴스 교체 시 수정 필요

Service Discovery:
  order-service.url=http://ORDER-SERVICE       → 자동으로 가용 인스턴스로 연결
```

### Eureka 아키텍처

Spring Cloud Netflix Eureka는 가장 널리 사용되는 Service Discovery 솔루션이다.

```
  ┌────────────────── Eureka Server ──────────────────┐
  │                                                    │
  │  서비스 레지스트리:                                  │
  │    USER-SERVICE    → [192.168.1.10:8081,           │
  │                       192.168.1.11:8081]           │
  │    ORDER-SERVICE   → [192.168.1.20:8082,           │
  │                       192.168.1.21:8082,           │
  │                       192.168.1.22:8082]           │
  │    PAYMENT-SERVICE → [192.168.1.30:8083]           │
  └────────────────────────────────────────────────────┘
         ↑ 등록(Register)        ↓ 조회(Fetch)
         ↑ 하트비트(Heartbeat)
  ┌──────┴──────┐          ┌──────┴──────┐
  │ Order Svc   │          │ User Svc    │
  │ (Client)    │          │ (Client)    │
  └─────────────┘          └─────────────┘
```

| 동작 | 설명 |
|------|------|
| **등록(Register)** | 서비스 시작 시 자신의 정보(이름, IP, 포트)를 Eureka에 등록 |
| **하트비트(Heartbeat)** | 30초마다 Eureka에 하트비트 전송. 미전송 시 레지스트리에서 제거 |
| **조회(Fetch)** | 다른 서비스를 호출할 때 Eureka에서 가용 인스턴스 목록을 가져옴 |
| **캐싱** | 클라이언트가 레지스트리를 로컬 캐시하여 Eureka 장애 시에도 동작 |

### Eureka Server 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.cloud:spring-cloud-starter-netflix-eureka-server'
}
```

```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

```yaml
# application.yml
server:
  port: 8761

eureka:
  client:
    register-with-eureka: false    # 자기 자신은 등록하지 않음
    fetch-registry: false
```

### Eureka Client 설정

```groovy
dependencies {
    implementation 'org.springframework.cloud:spring-cloud-starter-netflix-eureka-client'
}
```

```yaml
spring:
  application:
    name: ORDER-SERVICE              # Eureka에 등록될 이름

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true          # 호스트명 대신 IP 사용
```

이렇게 설정하면 `lb://ORDER-SERVICE`로 호출 시 Eureka에서 가용 인스턴스를 자동으로 찾아 로드밸런싱한다.

> **참고**: [Kubernetes 환경](/infra/2026/04/01/kubernetes-basics/)에서는 k8s Service가 Service Discovery 역할을 하므로 Eureka 없이도 동작한다. 다만 Spring Cloud와의 통합이 필요하면 Eureka 또는 Consul을 함께 사용하기도 한다.

---

## 4. Saga 패턴 — 분산 트랜잭션 관리

### 문제: 분산 트랜잭션

모놀리식에서는 하나의 DB 트랜잭션으로 여러 테이블을 원자적으로 업데이트할 수 있었다. 하지만 MSA에서는 서비스마다 독립된 DB를 가지므로 **단일 트랜잭션으로 묶을 수 없다.**

```
주문 생성 프로세스:
  1. Order Service    → 주문 생성 (Order DB)
  2. Payment Service  → 결제 처리 (Payment DB)
  3. Inventory Service → 재고 차감 (Inventory DB)

결제는 성공했는데 재고 차감이 실패하면? → 결제를 취소해야 한다
```

**2PC(Two-Phase Commit)**는 분산 DB 간 원자적 커밋을 보장하지만, 성능이 낮고 단일 장애점이 생기며, NoSQL은 지원하지 않는 경우가 많아 MSA에서는 잘 사용하지 않는다.

### Saga 패턴 개요

Saga는 **로컬 트랜잭션의 시퀀스**로 분산 트랜잭션을 구현한다. 각 단계가 성공하면 다음 단계를 실행하고, 실패하면 **보상 트랜잭션(Compensating Transaction)**을 역순으로 실행하여 이전 단계를 취소한다.

```
정상 플로우:
  주문생성 ──→ 결제처리 ──→ 재고차감 ──→ 배송요청 ✓

실패 플로우 (재고차감 실패):
  주문생성 ──→ 결제처리 ──→ 재고차감 ✗
                            │
  주문취소 ←── 결제취소 ←───┘  (보상 트랜잭션 역순 실행)
```

### 구현 방식: Choreography vs Orchestration

#### Choreography (이벤트 기반)

각 서비스가 이벤트를 발행하고, 다음 서비스가 이벤트를 구독하여 처리한다. 중앙 조정자가 없다.

```
Order Svc ──(OrderCreated)──→ Payment Svc ──(PaymentCompleted)──→ Inventory Svc
    ↑                              │                                    │
    └──(PaymentFailed)─────────────┘                                    │
    └──(InventoryFailed + PaymentRefunded)──────────────────────────────┘
```

[Kafka](/backend/2026/04/03/kafka-introduction/)가 이벤트 전달 채널로 자주 사용된다.

```java
// Order Service — 주문 생성 후 이벤트 발행
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = Order.create(request);
        order.setStatus(OrderStatus.PENDING);
        orderRepository.save(order);

        kafkaTemplate.send("order-events", order.getId(),
                new OrderCreatedEvent(order.getId(), order.getAmount(),
                        order.getItems()));
        return order;
    }

    // Payment 실패 시 보상 트랜잭션
    @KafkaListener(topics = "payment-events", groupId = "order-service")
    public void handlePaymentEvent(PaymentEvent event) {
        if (event instanceof PaymentFailedEvent failed) {
            Order order = orderRepository.findById(failed.getOrderId())
                    .orElseThrow();
            order.setStatus(OrderStatus.CANCELLED);
            order.setCancelReason("결제 실패: " + failed.getReason());
            orderRepository.save(order);
        }
    }
}
```

```java
// Payment Service — 결제 처리 후 이벤트 발행
@Service
@RequiredArgsConstructor
public class PaymentService {

    @KafkaListener(topics = "order-events", groupId = "payment-service")
    public void handleOrderCreated(OrderCreatedEvent event) {
        try {
            Payment payment = processPayment(event.getOrderId(),
                    event.getAmount());

            kafkaTemplate.send("payment-events", event.getOrderId(),
                    new PaymentCompletedEvent(event.getOrderId(),
                            payment.getId()));
        } catch (PaymentException e) {
            kafkaTemplate.send("payment-events", event.getOrderId(),
                    new PaymentFailedEvent(event.getOrderId(),
                            e.getMessage()));
        }
    }
}
```

#### Orchestration (중앙 조정자)

Saga Orchestrator가 전체 플로우를 관리하고, 각 단계의 성공/실패에 따라 다음 액션을 결정한다.

```
                  ┌── Saga Orchestrator ──┐
                  │  1. 주문 생성 요청     │
                  │  2. 결제 처리 요청     │
                  │  3. 재고 차감 요청     │
                  │  4. 배송 요청          │
                  │  실패 시: 보상 트랜잭션  │
                  └────────────────────────┘
                    ↕         ↕         ↕
              Order Svc  Payment Svc  Inventory Svc
```

```java
@Service
@RequiredArgsConstructor
public class OrderSagaOrchestrator {

    private final OrderService orderService;
    private final PaymentClient paymentClient;
    private final InventoryClient inventoryClient;

    public OrderResult executeOrderSaga(CreateOrderRequest request) {
        Order order = null;
        String paymentId = null;

        try {
            // Step 1: 주문 생성
            order = orderService.createOrder(request);

            // Step 2: 결제 처리
            paymentId = paymentClient.processPayment(
                    order.getId(), order.getAmount());

            // Step 3: 재고 차감
            inventoryClient.reserveStock(order.getId(), order.getItems());

            // 모든 단계 성공
            order.setStatus(OrderStatus.CONFIRMED);
            orderService.save(order);

            return OrderResult.success(order);

        } catch (PaymentException e) {
            // 결제 실패 → 주문 취소
            if (order != null) {
                orderService.cancelOrder(order.getId(),
                        "결제 실패: " + e.getMessage());
            }
            return OrderResult.failure("결제 실패");

        } catch (InventoryException e) {
            // 재고 부족 → 결제 취소 → 주문 취소 (역순 보상)
            if (paymentId != null) {
                paymentClient.refundPayment(paymentId);
            }
            if (order != null) {
                orderService.cancelOrder(order.getId(),
                        "재고 부족: " + e.getMessage());
            }
            return OrderResult.failure("재고 부족");
        }
    }
}
```

### Choreography vs Orchestration 비교

| 기준 | Choreography | Orchestration |
|------|-------------|---------------|
| **결합도** | 느슨 (이벤트 기반) | 상대적으로 높음 (오케스트레이터 의존) |
| **흐름 파악** | 어려움 (이벤트 추적 필요) | 쉬움 (오케스트레이터에 집중) |
| **디버깅** | 어려움 | 상대적으로 쉬움 |
| **확장성** | 서비스 추가가 쉬움 | 오케스트레이터 수정 필요 |
| **적합한 상황** | 단계가 적고 단순한 플로우 | 복잡한 비즈니스 로직, 조건 분기 |

> 실무에서는 3~4단계 이하의 단순한 플로우에는 Choreography를, 복잡한 비즈니스 로직이 포함된 플로우에는 Orchestration을 사용하는 경우가 많다.

---

## 패턴 간 관계 정리

4가지 패턴은 독립적으로 사용할 수도 있지만, 실제로는 함께 동작한다.

```
┌─────────────────── MSA 아키텍처 ───────────────────┐
│                                                     │
│  Client ──→ [API Gateway]                           │
│                 │  인증, Rate Limit, 라우팅          │
│                 ↓                                    │
│         [Service Discovery] (Eureka)                │
│              서비스 위치 조회                         │
│                 ↓                                    │
│     ┌──────────┼──────────┐                         │
│     ↓          ↓          ↓                         │
│  [Order]   [Payment]  [Inventory]                   │
│     │  Circuit Breaker  │                           │
│     └───── Saga ────────┘                           │
│       (분산 트랜잭션 관리)                            │
└─────────────────────────────────────────────────────┘
```

| 패턴 | 해결하는 문제 |
|------|--------------|
| **Circuit Breaker** | 장애 전파 차단, 빠른 실패 |
| **API Gateway** | 단일 진입점, 인증/라우팅 중앙화 |
| **Service Discovery** | 동적 서비스 탐색, IP 하드코딩 제거 |
| **Saga** | 분산 환경의 데이터 일관성 |

---

## 실전 팁

### Circuit Breaker 임계값 설정

- 실패율 임계치가 **너무 낮으면** (예: 10%) 일시적 네트워크 지연에도 서킷이 열린다
- 실패율 임계치가 **너무 높으면** (예: 90%) 장애 전파를 막는 의미가 없다
- **50~60%**가 일반적인 시작점이며, 모니터링을 통해 서비스별로 조정한다

### API Gateway 주의사항

- **단일 장애점(SPoF)**이 되지 않도록 고가용성 구성 필수 (최소 2대 이상)
- Gateway에 비즈니스 로직을 넣지 말 것 — 라우팅, 인증, 모니터링에 집중
- 응답 변환(Response Transformation)은 최소화 — Gateway가 병목이 될 수 있다

### Saga 패턴 적용 시

- 보상 트랜잭션은 **멱등성**을 보장해야 한다 (같은 취소 요청을 여러 번 보내도 안전)
- 보상 트랜잭션이 실패하면? → Dead Letter Queue에 저장하고 수동 처리
- Saga의 상태를 DB에 저장하여 장애 복구 시 이어서 처리할 수 있게 한다

---

## 마무리

MSA에서 서비스 간 통신은 네트워크를 경유하기 때문에, 모놀리식에서는 없던 장애 모드가 등장한다. 이번 포스트에서 다룬 4가지 패턴은 이 문제에 대한 업계의 검증된 해법이다.

1. **Circuit Breaker** — Resilience4j로 장애 전파를 차단하고 빠르게 실패한다
2. **API Gateway** — Spring Cloud Gateway로 인증, 라우팅, Rate Limiting을 중앙화한다
3. **Service Discovery** — Eureka로 서비스 인스턴스를 동적으로 관리한다
4. **Saga** — 보상 트랜잭션으로 분산 환경의 데이터 일관성을 유지한다

이 패턴들의 효과를 극대화하려면 비동기 메시징([Kafka](/backend/2026/04/03/kafka-introduction/))과 적절한 캐싱 전략([캐싱 패턴](/system-design/2026/03/28/caching-strategy/))을 함께 설계하는 것이 중요하다.

---

## 관련 포스트

- [Apache Kafka 입문부터 실전까지](/backend/2026/04/03/kafka-introduction/)
- [API Rate Limiting — 설계와 구현 전략](/system-design/2026/04/01/api-rate-limiting/)
- [캐싱 전략 — Cache-Aside, Write-Through, Write-Behind](/system-design/2026/03/28/caching-strategy/)
- [Kubernetes 핵심 개념 — Pod부터 Deployment까지](/infra/2026/04/01/kubernetes-basics/)
