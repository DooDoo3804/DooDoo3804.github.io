---
layout: post
title: "Spring 트랜잭션 전파 레벨 완전 정복"
subtitle: "REQUIRED부터 NESTED까지 — 7가지 전파 레벨의 실제 동작과 함정"
date: "2026-04-04"
author: "DoYoon Kim"
header-style: text
catalog: true
series: "Spring 심화"
keywords: "spring, transaction, propagation, required, nested, rollback"
tags:
  - Spring
  - Transaction
  - Backend
  - Java
categories:
  - spring
description: "Spring 트랜잭션 전파(Propagation) 7가지 레벨의 실제 동작을 코드와 ASCII 다이어그램으로 설명합니다. 체크드 예외와 롤백 규칙 등 실수하기 쉬운 케이스도 다룹니다."
---

## 들어가며

`@Transactional`을 붙이면 트랜잭션이 걸린다는 건 알겠는데, 트랜잭션이 이미 존재하는 상태에서 또 `@Transactional` 메서드를 호출하면 어떻게 될까? 이 질문에 대한 답이 바로 **트랜잭션 전파(Transaction Propagation)** 다.

[이전 글(Spring AOP 내부 동작)](/spring/2026/04/03/spring-aop-internals/)에서 `@Transactional`이 AOP 프록시를 통해 동작하는 원리를 살펴봤다. 이번에는 그 안에서 트랜잭션 전파가 어떻게 결정되는지 깊이 파고들어 본다.

---

## 7가지 전파 레벨

Spring은 `Propagation` enum으로 7가지 전파 레벨을 제공한다.

| 레벨 | 기존 트랜잭션 있을 때 | 기존 트랜잭션 없을 때 |
|------|----------------------|----------------------|
| **REQUIRED** (기본값) | 기존 트랜잭션에 참여 | 새 트랜잭션 생성 |
| **REQUIRES_NEW** | 기존 트랜잭션 보류 + 새 트랜잭션 생성 | 새 트랜잭션 생성 |
| **NESTED** | 중첩 트랜잭션 (Savepoint) 생성 | 새 트랜잭션 생성 |
| **SUPPORTS** | 기존 트랜잭션에 참여 | 트랜잭션 없이 실행 |
| **NOT_SUPPORTED** | 기존 트랜잭션 보류 + 트랜잭션 없이 실행 | 트랜잭션 없이 실행 |
| **MANDATORY** | 기존 트랜잭션에 참여 | **예외 발생** |
| **NEVER** | **예외 발생** | 트랜잭션 없이 실행 |

실무에서 가장 많이 사용하는 것은 `REQUIRED`, `REQUIRES_NEW`, `NESTED` 세 가지다. 하나씩 동작을 살펴보자.

---

## REQUIRED (기본값)

가장 흔하게 쓰이고, `@Transactional`의 기본 전파 레벨이다.

```
[REQUIRED — 기존 트랜잭션이 있는 경우]

ServiceA.methodA()            ServiceB.methodB()
┌──── TX-1 ─────────────────────────────────────┐
│  시작                                          │
│  ├── A 로직 실행                                │
│  ├── B.methodB() 호출 ──→ TX-1에 참여           │
│  │                        ├── B 로직 실행       │
│  │                        └── (돌아옴)          │
│  └── A 나머지 로직                              │
│  커밋 or 롤백                                   │
└────────────────────────────────────────────────┘
```

**핵심**: 하나의 트랜잭션을 공유하기 때문에, B에서 예외가 발생하면 **A도 함께 롤백**된다.

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final PaymentService paymentService;
    private final OrderRepository orderRepository;

    @Transactional // REQUIRED (기본값)
    public void createOrder(OrderRequest request) {
        orderRepository.save(request.toEntity());
        paymentService.processPayment(request.getPaymentInfo());
        // ↑ 여기서 예외 발생 시 주문 저장도 롤백됨
    }
}

@Service
public class PaymentService {

    @Transactional // REQUIRED — 기존 트랜잭션에 참여
    public void processPayment(PaymentInfo info) {
        // 결제 처리
    }
}
```

---

## REQUIRES_NEW

기존 트랜잭션과 **완전히 독립된** 새 트랜잭션을 생성한다. 기존 트랜잭션은 새 트랜잭션이 끝날 때까지 보류(suspend)된다.

```
[REQUIRES_NEW]

ServiceA.methodA()            ServiceB.methodB()
┌──── TX-1 ──────────┐
│  시작               │
│  ├── A 로직 실행     │
│  ├── B.methodB() ───┼──→ ┌──── TX-2 (새로 생성) ──┐
│  │   (TX-1 보류)    │    │  ├── B 로직 실행        │
│  │                  │    │  └── 커밋 or 롤백       │
│  │   (TX-1 재개) ←──┼────└─────────────────────────┘
│  └── A 나머지 로직   │
│  커밋 or 롤백        │
└─────────────────────┘
```

**핵심**: TX-2가 롤백되어도 TX-1에는 영향이 없다. 반대로 TX-1이 롤백되어도 이미 커밋된 TX-2는 유지된다.

대표적인 사용 사례는 **로그 저장**이다.

```java
@Service
public class AuditService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveAuditLog(String action, String detail) {
        // 감사 로그는 비즈니스 트랜잭션이 롤백되더라도 반드시 저장되어야 한다
        auditLogRepository.save(new AuditLog(action, detail));
    }
}
```

```java
@Service
public class OrderService {

    @Transactional
    public void cancelOrder(Long orderId) {
        auditService.saveAuditLog("ORDER_CANCEL", "주문 " + orderId + " 취소 시도");

        Order order = orderRepository.findById(orderId).orElseThrow();
        order.cancel();
        // 여기서 예외 발생 → 주문 취소는 롤백
        // 하지만 감사 로그는 이미 별도 트랜잭션으로 커밋됨
    }
}
```

---

## NESTED

기존 트랜잭션 내에서 **Savepoint**를 설정하고, 중첩 트랜잭션을 시작한다. REQUIRES_NEW와 달리 부모 트랜잭션의 일부로 동작한다.

```
[NESTED]

ServiceA.methodA()            ServiceB.methodB()
┌──── TX-1 ──────────────────────────────────────┐
│  시작                                           │
│  ├── A 로직 실행                                 │
│  ├── [SAVEPOINT sp1 생성]                        │
│  ├── B.methodB() 호출                            │
│  │   ├── B 로직 실행                             │
│  │   └── 실패 시 → sp1까지만 롤백                 │
│  └── A 나머지 로직 계속 실행 가능                   │
│  커밋 (전체)                                     │
└────────────────────────────────────────────────┘
```

**핵심 차이점**:
- `REQUIRES_NEW`: 물리적으로 별도의 DB 커넥션 + 독립 트랜잭션
- `NESTED`: 같은 DB 커넥션, 같은 물리 트랜잭션 안에서 Savepoint로 부분 롤백

```java
@Service
public class OrderService {

    @Transactional
    public void createOrderWithCoupon(OrderRequest request) {
        orderRepository.save(request.toEntity());

        try {
            couponService.applyCoupon(request.getCouponId());
        } catch (CouponException e) {
            // 쿠폰 적용 실패 → 쿠폰 부분만 롤백
            // 주문 자체는 쿠폰 없이 진행
            log.warn("쿠폰 적용 실패, 쿠폰 없이 주문 진행: {}", e.getMessage());
        }
    }
}

@Service
public class CouponService {

    @Transactional(propagation = Propagation.NESTED)
    public void applyCoupon(Long couponId) {
        // 쿠폰 적용 로직
        // 실패 시 Savepoint까지만 롤백
    }
}
```

> **주의**: NESTED는 JPA/Hibernate에서 공식적으로 지원하지 않는 경우가 많다. JDBC의 Savepoint를 직접 사용하는 환경에서만 동작한다. JPA를 사용한다면 `REQUIRES_NEW`가 더 안전한 선택이다.

---

## 체크드 예외 vs 언체크드 예외

Spring 트랜잭션에서 가장 실수하기 쉬운 부분이 **롤백 규칙**이다.

```java
// 기본 롤백 규칙
@Transactional
public void doSomething() {
    throw new RuntimeException();        // 롤백 O (언체크드 예외)
    throw new IOException();             // 롤백 X (체크드 예외)
    throw new Error();                   // 롤백 O
}
```

**기본 동작**: `RuntimeException`과 `Error`에서만 롤백하고, **체크드 예외(Checked Exception)는 롤백하지 않는다.**

이 규칙이 놓치기 쉬운 이유는, 개발자가 "예외가 발생하면 당연히 롤백되겠지"라고 생각하기 때문이다.

### 명시적 롤백 규칙 설정

```java
// 체크드 예외에서도 롤백하고 싶다면
@Transactional(rollbackFor = Exception.class)
public void transferMoney(TransferRequest request) throws InsufficientBalanceException {
    // InsufficientBalanceException이 체크드 예외여도 롤백됨
}

// 특정 런타임 예외에서 롤백하지 않으려면
@Transactional(noRollbackFor = DuplicateKeyException.class)
public void importData(List<DataRow> rows) {
    // DuplicateKeyException이 발생해도 롤백하지 않음
}
```

### REQUIRED에서 체크드 예외 함정

```java
@Service
public class ServiceA {

    @Transactional
    public void methodA() {
        try {
            serviceB.methodB(); // REQUIRED로 같은 TX 참여
        } catch (SomeCheckedException e) {
            // B에서 체크드 예외 발생 → 잡아서 처리
            // "이제 괜찮겠지" 라고 생각하지만...
        }
        // A 나머지 로직 실행
    }
    // → 정상 커밋됨 (체크드 예외는 기본적으로 롤백 마크를 안 함)
}
```

하지만 `methodB`에서 **언체크드 예외**가 발생한 경우는 다르다.

```java
@Service
public class ServiceA {

    @Transactional
    public void methodA() {
        try {
            serviceB.methodB(); // REQUIRED로 같은 TX 참여
        } catch (RuntimeException e) {
            // B에서 런타임 예외 → 트랜잭션에 rollback-only 마크
            // catch로 잡았어도 이미 늦었다!
        }
        // A 나머지 로직 실행
    }
    // → 커밋 시도 → UnexpectedRollbackException 발생!
}
```

`REQUIRED` 전파에서 같은 트랜잭션을 공유하는 경우, 내부 메서드에서 `RuntimeException`이 발생하면 트랜잭션에 **rollback-only** 마크가 찍힌다. 외부에서 예외를 `catch`로 잡아도 소용없다. 이 상황을 피하려면 `REQUIRES_NEW`로 분리하거나, 내부 메서드에서 예외를 던지지 않도록 설계해야 한다.

---

## 전파 레벨 선택 가이드

```
"기본 비즈니스 로직?"
    → REQUIRED (기본값으로 충분)

"실패해도 독립적으로 커밋되어야 하는 로직?"
    → REQUIRES_NEW (감사 로그, 알림, 이벤트 발행)

"실패하면 부분 롤백하고 부모는 계속 진행?"
    → NESTED (단, JPA에서는 지원 제한적)

"트랜잭션이 반드시 있어야 하는 메서드?"
    → MANDATORY (호출자가 TX를 열어야 함을 강제)

"트랜잭션 없이 실행되어야 하는 메서드?"
    → NOT_SUPPORTED (대량 조회 등에서 불필요한 TX 오버헤드 제거)
```

---

## 실전 주의사항

1. **Self-invocation에서는 전파 레벨이 무시된다** — [AOP 내부 동작](/spring/2026/04/03/spring-aop-internals/) 글에서 다룬 것처럼, 같은 클래스 내부 호출은 프록시를 거치지 않으므로 전파 레벨 설정이 아무 의미가 없다.

2. **REQUIRES_NEW는 DB 커넥션을 추가로 사용한다** — 기존 커넥션은 보류(suspend)되고 새 커넥션을 가져온다. 커넥션 풀 고갈에 주의해야 한다.

3. **readOnly 트랜잭션에서 쓰기 호출** — `@Transactional(readOnly = true)` 안에서 `REQUIRED`로 쓰기 메서드를 호출하면, 기존 읽기 트랜잭션에 참여하므로 쓰기가 무시되거나 예외가 발생할 수 있다.

4. **테스트 환경의 롤백** — `@SpringBootTest`에서 `@Transactional`을 붙이면 테스트 끝에 자동 롤백된다. 이때 `REQUIRES_NEW`로 열린 트랜잭션은 테스트 롤백의 대상이 아니므로 실제 DB에 데이터가 남을 수 있다.

---

## 마무리

트랜잭션 전파 레벨은 "어떤 상황에서 어떤 레벨을 쓰는지" 보다 **"각 레벨이 실제로 어떻게 동작하는지"** 를 이해하는 것이 중요하다. 특히 `REQUIRED`에서의 rollback-only 마크, `REQUIRES_NEW`의 커넥션 사용량, 체크드 예외의 기본 롤백 규칙은 실무에서 정말 자주 문제가 되는 부분이니 꼭 기억해 두자.

---

## 관련 포스트

- [Spring AOP 내부 동작 원리](/spring/2026/04/03/spring-aop-internals/)
- [Spring Boot + JPA 기초](/spring/2026/03/15/spring-boot-jpa-basics/)
- [Spring Bean 라이프사이클 완전 정복](/spring/2026/04/05/spring-bean-lifecycle/)
- [데이터베이스 트랜잭션과 격리 수준](/database/2026/04/06/database-transaction-isolation/)
