---
title: "데이터베이스 트랜잭션과 격리 수준"
subtitle: "ACID부터 격리 수준 4단계, 데드락, 낙관적/비관적 락까지 실무 완전 정리"
layout: post
date: "2026-04-06"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "database, transaction, isolation, postgresql, backend"
description: "데이터베이스 트랜잭션 ACID 특성, 격리 수준 4단계, PostgreSQL 실제 동작, Spring @Transactional, 데드락, 낙관적/비관적 락을 정리합니다."
series: "백엔드 심화"
tags:
  - Database
  - Transaction
  - Isolation
  - PostgreSQL
  - Backend
categories:
  - database
---

## 들어가며

트랜잭션은 데이터베이스의 가장 근본적인 개념이다. "데이터 정합성"이라는 단어를 들어봤다면, 그 정합성을 보장하는 메커니즘이 바로 트랜잭션이다.

하지만 트랜잭션을 단순히 "커밋 아니면 롤백"으로만 이해하면 실무에서 동시성 문제에 부딪힌다. 이 글에서는 ACID 특성부터 격리 수준, 데드락, 락 전략까지 **트랜잭션의 전체 그림**을 정리한다.

---

## 트랜잭션 ACID 특성

트랜잭션은 네 가지 특성을 보장해야 한다.

### Atomicity (원자성)

트랜잭션의 모든 연산은 **전부 성공하거나 전부 실패**한다. 중간 상태는 없다.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 10000 WHERE id = 1;  -- 출금
UPDATE accounts SET balance = balance + 10000 WHERE id = 2;  -- 입금
COMMIT;
-- 둘 중 하나라도 실패하면 ROLLBACK → 둘 다 취소
```

### Consistency (일관성)

트랜잭션 전후로 데이터베이스는 항상 **일관된 상태**를 유지한다. 제약 조건(NOT NULL, UNIQUE, FK 등)이 깨지지 않는다.

### Isolation (격리성)

동시에 실행되는 트랜잭션들이 서로 **간섭하지 않아야** 한다. 격리 수준에 따라 간섭의 정도가 달라진다.

### Durability (지속성)

커밋된 트랜잭션의 결과는 **영구적으로 보존**된다. 시스템 장애가 발생해도 커밋된 데이터는 유지된다 (WAL, redo log 등을 통해).

---

## 동시성 문제

격리성이 완벽하지 않을 때 발생하는 세 가지 대표적인 문제:

### Dirty Read (더티 리드)

다른 트랜잭션이 **커밋하지 않은** 데이터를 읽는 것.

```
TX1: UPDATE accounts SET balance = 0 WHERE id = 1;  -- 아직 커밋 안 함
TX2: SELECT balance FROM accounts WHERE id = 1;      -- 0을 읽음 (Dirty Read)
TX1: ROLLBACK;                                        -- 원래 값으로 되돌아감
-- TX2는 존재하지 않는 데이터를 읽은 셈
```

### Non-Repeatable Read (반복 불가능 읽기)

같은 쿼리를 두 번 실행했을 때 **결과가 다른** 것. 다른 트랜잭션이 **커밋한 UPDATE** 때문에 발생.

```
TX1: SELECT balance FROM accounts WHERE id = 1;  -- 10000
TX2: UPDATE accounts SET balance = 5000 WHERE id = 1; COMMIT;
TX1: SELECT balance FROM accounts WHERE id = 1;  -- 5000 (값이 바뀜!)
```

### Phantom Read (팬텀 리드)

같은 조건으로 조회했을 때 **행의 수가 달라지는** 것. 다른 트랜잭션이 **커밋한 INSERT/DELETE** 때문에 발생.

```
TX1: SELECT COUNT(*) FROM orders WHERE status = 'PENDING';  -- 5건
TX2: INSERT INTO orders (status) VALUES ('PENDING'); COMMIT;
TX1: SELECT COUNT(*) FROM orders WHERE status = 'PENDING';  -- 6건 (유령 행!)
```

---

## 격리 수준 4단계

SQL 표준은 네 가지 격리 수준을 정의한다. 아래로 갈수록 격리성이 높고, 동시성(성능)은 떨어진다.

### READ UNCOMMITTED

가장 낮은 격리 수준. 커밋되지 않은 데이터를 읽을 수 있다.

```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
```

- Dirty Read: **발생**
- Non-Repeatable Read: **발생**
- Phantom Read: **발생**

실무에서 거의 사용하지 않는다.

### READ COMMITTED

**대부분의 RDBMS 기본 격리 수준** (PostgreSQL, Oracle, SQL Server 포함). 커밋된 데이터만 읽는다.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

- Dirty Read: **방지**
- Non-Repeatable Read: **발생**
- Phantom Read: **발생**

### REPEATABLE READ

트랜잭션 시작 시점의 스냅샷을 기준으로 읽는다. **MySQL InnoDB의 기본 격리 수준**이다.

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

- Dirty Read: **방지**
- Non-Repeatable Read: **방지**
- Phantom Read: **발생** (MySQL InnoDB는 Gap Lock으로 대부분 방지)

### SERIALIZABLE

가장 높은 격리 수준. 트랜잭션을 **직렬로 실행한 것과 동일한 결과**를 보장한다.

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

- Dirty Read: **방지**
- Non-Repeatable Read: **방지**
- Phantom Read: **방지**

성능 오버헤드가 크므로 꼭 필요한 경우에만 사용한다.

### 격리 수준 비교표

| 격리 수준 | Dirty Read | Non-Repeatable Read | Phantom Read |
|----------|-----------|-------------------|-------------|
| READ UNCOMMITTED | O | O | O |
| READ COMMITTED | X | O | O |
| REPEATABLE READ | X | X | O |
| SERIALIZABLE | X | X | X |

---

## PostgreSQL 격리 수준 실제 동작

PostgreSQL은 내부적으로 **MVCC(Multi-Version Concurrency Control)** 를 사용한다. PostgreSQL의 쿼리 성능 최적화가 필요하다면 [PostgreSQL 인덱스 제대로 이해하기](/database/2026/03/25/postgresql-index/)도 함께 참고하자. 각 트랜잭션에 스냅샷을 할당하여 락 없이도 격리성을 제공한다.

### PostgreSQL의 특이점

PostgreSQL은 실제로 **3단계** 격리 수준만 구현한다:

| 설정값 | 실제 동작 |
|--------|----------|
| READ UNCOMMITTED | **READ COMMITTED**로 동작 (Dirty Read 허용 안 함) |
| READ COMMITTED | READ COMMITTED |
| REPEATABLE READ | Snapshot Isolation (REPEATABLE READ) |
| SERIALIZABLE | Serializable Snapshot Isolation (SSI) |

PostgreSQL은 어떤 격리 수준에서도 **Dirty Read를 허용하지 않는다.**

### READ COMMITTED에서의 동작

```sql
-- TX1
BEGIN;
SELECT balance FROM accounts WHERE id = 1;  -- 10000

-- TX2
BEGIN;
UPDATE accounts SET balance = 5000 WHERE id = 1;
COMMIT;

-- TX1 (계속)
SELECT balance FROM accounts WHERE id = 1;  -- 5000 (TX2의 커밋 반영)
COMMIT;
```

각 **SQL문 실행 시점**에 새로운 스냅샷을 가져온다. 같은 트랜잭션 내에서도 다른 트랜잭션의 커밋이 보인다.

### REPEATABLE READ에서의 동작

```sql
-- TX1
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;  -- 10000

-- TX2
BEGIN;
UPDATE accounts SET balance = 5000 WHERE id = 1;
COMMIT;

-- TX1 (계속)
SELECT balance FROM accounts WHERE id = 1;  -- 10000 (스냅샷 유지!)
COMMIT;
```

트랜잭션 **시작 시점**의 스냅샷을 계속 사용한다. 다른 트랜잭션의 커밋을 볼 수 없다.

### REPEATABLE READ에서의 충돌 감지

```sql
-- TX1
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
UPDATE accounts SET balance = balance - 1000 WHERE id = 1;

-- TX2
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
UPDATE accounts SET balance = balance - 2000 WHERE id = 1;
-- TX2는 TX1이 커밋할 때까지 대기

-- TX1
COMMIT;

-- TX2
-- ERROR: could not serialize access due to concurrent update
ROLLBACK;
```

같은 행을 동시에 수정하면 **먼저 커밋한 쪽이 승리**하고, 나중 트랜잭션은 에러가 발생한다. 애플리케이션에서 재시도 로직이 필요하다.

### SERIALIZABLE (SSI)

PostgreSQL의 SERIALIZABLE은 **Serializable Snapshot Isolation(SSI)** 알고리즘을 사용한다. 전통적인 락 기반이 아닌, 스냅샷 격리에 직렬화 충돌 감지를 추가한 방식이다.

```sql
-- TX1
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT SUM(balance) FROM accounts WHERE branch = 'A';  -- 결과를 기반으로 작업
INSERT INTO audit_log (total) VALUES (50000);

-- TX2
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT SUM(balance) FROM accounts WHERE branch = 'A';  -- 같은 데이터를 읽음
UPDATE accounts SET balance = balance + 1000 WHERE id = 1;

-- 둘 다 커밋 시도 → 직렬화 불가능하면 한쪽이 실패
```

읽기-쓰기 의존성(rw-dependency)을 추적하여 직렬화 불가능한 패턴을 감지하면 한쪽 트랜잭션을 롤백한다.

---

## Spring @Transactional 옵션

### propagation (전파 속성)

트랜잭션이 이미 존재할 때 새 트랜잭션을 어떻게 처리할지 결정한다:

```java
@Transactional(propagation = Propagation.REQUIRED)  // 기본값
public void methodA() {
    // 기존 트랜잭션이 있으면 참여, 없으면 새로 생성
}

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void methodB() {
    // 항상 새 트랜잭션 생성 (기존 트랜잭션은 일시 중단)
}

@Transactional(propagation = Propagation.MANDATORY)
public void methodC() {
    // 기존 트랜잭션이 반드시 있어야 함 (없으면 예외)
}
```

| 전파 속성 | 기존 TX 있음 | 기존 TX 없음 |
|----------|------------|------------|
| REQUIRED (기본) | 참여 | 새로 생성 |
| REQUIRES_NEW | 새로 생성 (기존 중단) | 새로 생성 |
| MANDATORY | 참여 | 예외 발생 |
| SUPPORTS | 참여 | TX 없이 실행 |
| NOT_SUPPORTED | TX 없이 실행 (기존 중단) | TX 없이 실행 |
| NEVER | 예외 발생 | TX 없이 실행 |
| NESTED | 중첩 TX (세이브포인트) | 새로 생성 |

### isolation (격리 수준)

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void readData() {
    // READ COMMITTED 격리 수준으로 실행
}

@Transactional(isolation = Isolation.REPEATABLE_READ)
public void consistentRead() {
    // REPEATABLE READ 격리 수준으로 실행
}

@Transactional(isolation = Isolation.SERIALIZABLE)
public void criticalOperation() {
    // SERIALIZABLE 격리 수준으로 실행 (가장 엄격)
}
```

### readOnly

```java
@Transactional(readOnly = true)
public List<Order> findOrders() {
    // Hibernate: 더티 체킹 비활성화 → 성능 향상
    // DB: 읽기 전용 힌트 전달 → 일부 DB에서 최적화
    return orderRepository.findAll();
}
```

**읽기 전용 메서드에는 `readOnly = true`를 반드시 설정하자.** Hibernate의 더티 체킹 비용을 절약하고, DB 레플리카로 라우팅할 수도 있다.

### timeout과 rollbackFor

```java
@Transactional(
    timeout = 5,                          // 5초 초과 시 롤백
    rollbackFor = BusinessException.class  // Checked 예외에도 롤백
)
public void processOrder(Long orderId) {
    // ...
}
```

기본적으로 `@Transactional`은 **Unchecked 예외(RuntimeException)에만 롤백**한다. Checked 예외에도 롤백하려면 `rollbackFor`를 지정해야 한다.

### 주의: 프록시 기반 동작

Spring의 `@Transactional`은 **AOP 프록시**를 통해 동작한다 ([Spring AOP 내부 동작 원리](/spring/2026/04/03/spring-aop-internals/) 참고). 같은 클래스 내부에서 호출하면 프록시를 거치지 않아 트랜잭션이 적용되지 않는다:

```java
@Service
public class OrderService {

    public void outer() {
        // 같은 클래스의 inner() 호출 → 프록시를 안 거침
        // inner()의 @Transactional이 동작하지 않음!
        this.inner();
    }

    @Transactional
    public void inner() {
        // ...
    }
}
```

해결 방법:
1. `inner()`를 별도 클래스로 분리
2. `self-injection` 사용 (`@Lazy` 등)
3. `TransactionTemplate` 프로그래밍 방식 사용

---

## 데드락 발생 원인과 해결

### 데드락이란

두 개 이상의 트랜잭션이 서로가 보유한 락을 기다리며 **무한 대기** 상태에 빠지는 것.

```
TX1: Lock(A) → Lock(B) 시도 → 대기 (TX2가 B를 보유)
TX2: Lock(B) → Lock(A) 시도 → 대기 (TX1이 A를 보유)
→ 교착 상태!
```

### SQL 예시

```sql
-- TX1
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- id=1 락
-- (잠시 후)
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- id=2 락 대기

-- TX2
BEGIN;
UPDATE accounts SET balance = balance - 200 WHERE id = 2;  -- id=2 락
-- (잠시 후)
UPDATE accounts SET balance = balance + 200 WHERE id = 1;  -- id=1 락 대기

-- 데드락! DB가 한쪽을 강제 롤백
```

### 데드락 감지

PostgreSQL은 `deadlock_timeout`(기본 1초) 후 데드락을 감지하고, 비용이 적은 트랜잭션을 롤백한다:

```
ERROR: deadlock detected
DETAIL: Process 12345 waits for ShareLock on transaction 67890;
        blocked by process 67891.
        Process 67891 waits for ShareLock on transaction 12345;
        blocked by process 12345.
```

### 데드락 예방 전략

**1. 락 순서 통일**

가장 효과적인 방법. 모든 트랜잭션이 동일한 순서로 리소스에 접근하면 데드락이 발생하지 않는다:

```java
public void transfer(Long fromId, Long toId, int amount) {
    // 항상 작은 ID 먼저 락
    Long firstId = Math.min(fromId, toId);
    Long secondId = Math.max(fromId, toId);

    Account first = accountRepository.findByIdWithLock(firstId);
    Account second = accountRepository.findByIdWithLock(secondId);

    // 이체 로직
}
```

**2. 트랜잭션 범위 최소화**

```java
// Bad: 외부 API 호출까지 트랜잭션에 포함
@Transactional
public void processOrder(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    paymentGateway.charge(order.getAmount());  // 외부 API (수 초 소요)
    order.complete();
}

// Good: 트랜잭션 범위를 DB 작업만으로 제한
public void processOrder(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    paymentGateway.charge(order.getAmount());  // 트랜잭션 밖

    completeOrder(orderId);  // 별도 트랜잭션
}

@Transactional
public void completeOrder(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    order.complete();
}
```

**3. 타임아웃 설정**

```java
@Transactional(timeout = 5)
public void criticalUpdate() {
    // 5초 내에 완료되지 않으면 롤백
}
```

---

## 낙관적 락 vs 비관적 락

동시성 제어를 위한 두 가지 전략이다.

### 비관적 락 (Pessimistic Lock)

**"충돌이 자주 발생할 것"**이라고 가정하고, 데이터를 읽는 시점에 **락을 건다.**

```java
public interface AccountRepository extends JpaRepository<Account, Long> {

    // SELECT ... FOR UPDATE
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Account a WHERE a.id = :id")
    Account findByIdWithLock(@Param("id") Long id);
}
```

실행되는 SQL:

```sql
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- 이 행에 대해 다른 트랜잭션의 UPDATE/DELETE를 블로킹
```

**사용 시점:**
- 충돌이 빈번한 경우 (재고 차감, 선착순 이벤트)
- 데이터 정합성이 반드시 보장되어야 하는 경우
- 트랜잭션이 짧은 경우

**주의사항:**
- 락 대기로 인한 성능 저하
- 데드락 가능성
- 타임아웃 설정 필수

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@QueryHints({@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000")})
@Query("SELECT a FROM Account a WHERE a.id = :id")
Account findByIdWithLock(@Param("id") Long id);
```

### 낙관적 락 (Optimistic Lock)

**"충돌이 드물 것"**이라고 가정하고, 실제 업데이트 시점에 **충돌을 감지**한다.

```java
@Entity
public class Product {
    @Id @GeneratedValue
    private Long id;

    private String name;
    private int stock;

    @Version
    private Long version;  // 버전 필드
}
```

동작 방식:

```sql
-- 조회 시: version = 1
SELECT * FROM products WHERE id = 1;

-- 업데이트 시: WHERE에 version 조건 추가
UPDATE products
SET stock = 99, version = 2
WHERE id = 1 AND version = 1;

-- 영향받은 행이 0이면 → 다른 트랜잭션이 먼저 수정한 것
-- → ObjectOptimisticLockingFailureException 발생
```

**서비스 계층에서 재시도 처리:**

```java
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    @Retryable(
        retryFor = ObjectOptimisticLockingFailureException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 100)
    )
    @Transactional
    public void decreaseStock(Long productId, int quantity) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new EntityNotFoundException("상품이 없습니다"));

        product.decreaseStock(quantity);
    }
}
```

`@Retryable`을 사용하려면 `spring-retry` 의존성과 `@EnableRetry` 설정이 필요하다.

**사용 시점:**
- 충돌이 드문 경우 (일반적인 게시글 수정 등)
- 락으로 인한 성능 저하를 피하고 싶은 경우
- 읽기가 많고 쓰기가 적은 경우

### 비교 정리

| 항목 | 비관적 락 | 낙관적 락 |
|------|---------|---------|
| 전략 | 충돌 예방 (락 선점) | 충돌 감지 (버전 체크) |
| 구현 | `SELECT FOR UPDATE` | `@Version` 필드 |
| 성능 | 락 대기 오버헤드 | 충돌 시 재시도 오버헤드 |
| 데드락 | 가능 | 불가능 |
| 적합한 상황 | 충돌 빈번, 짧은 TX | 충돌 드묾, 읽기 위주 |
| 실패 시 | 대기 후 실행 | 예외 발생 → 재시도 |

### 실무 의사결정 가이드

```
동시 수정이 발생하는가?
├── 거의 없음 → 낙관적 락 (@Version)
└── 빈번함
    ├── 정합성이 절대적 → 비관적 락 (SELECT FOR UPDATE)
    └── 약간의 지연 허용 → 낙관적 락 + 재시도
```

---

## 마무리

트랜잭션은 단순히 `@Transactional`을 붙이는 것으로 끝나지 않는다.

1. **ACID**를 이해하고, 특히 **Isolation이 성능과 트레이드오프** 관계임을 인지하자.
2. **격리 수준**은 기본값(READ COMMITTED)을 유지하되, 특정 비즈니스 로직에서 REPEATABLE READ가 필요한지 검토하자.
3. **데드락**은 락 순서 통일과 트랜잭션 범위 최소화로 예방하자.
4. **낙관적 락 vs 비관적 락**은 충돌 빈도에 따라 선택하자. 대부분의 경우 낙관적 락으로 시작하는 것이 좋다.
5. Spring의 `@Transactional`은 **프록시 기반**임을 잊지 말고, 내부 호출 시 트랜잭션이 적용되지 않는 함정을 주의하자.

항상 `spring.jpa.show-sql=true`와 로그 레벨 설정을 통해 실제 실행되는 SQL과 트랜잭션 경계를 확인하는 습관을 들이자.

---

## 관련 포스트

- [Spring 트랜잭션 전파 레벨 완전 정복](/spring/2026/04/04/spring-transaction-propagation/)
- [PostgreSQL 인덱스 제대로 이해하기](/database/2026/03/25/postgresql-index/)
- [JPA N+1 문제 완전 정복](/spring/2026/04/04/jpa-n-plus-one-problem/)
- [MySQL vs PostgreSQL — 백엔드 개발자가 알아야 할 차이](/database/2026/04/01/mysql-vs-postgresql/)
