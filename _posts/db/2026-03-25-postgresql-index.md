---
title: "PostgreSQL 인덱스 제대로 이해하기"
subtitle: "B-Tree 인덱스, EXPLAIN ANALYZE, 복합 인덱스 전략까지"
layout: post
author: "DooDoo"
header-style: text
catalog: true
tags:
  - PostgreSQL
  - Database
  - Backend
---

## 인덱스가 왜 필요한가

100만 건의 주문 데이터에서 특정 사용자의 주문을 찾는다고 하자.

```sql
SELECT * FROM orders WHERE user_id = 42;
```

인덱스가 없으면 PostgreSQL은 **Sequential Scan** — 테이블의 모든 행을 처음부터 끝까지 읽는다. 행이 100만 개라면 100만 번 비교한다. 인덱스가 있으면 **Index Scan**으로 필요한 행만 빠르게 찾을 수 있다. 책의 목차와 같은 원리다.

---

## B-Tree 인덱스

PostgreSQL의 기본 인덱스 타입은 **B-Tree(Balanced Tree)**다.

```sql
CREATE INDEX idx_orders_user_id ON orders (user_id);
```

B-Tree의 특징:
- **균형 트리** 구조로 어떤 값을 찾든 동일한 깊이만큼만 탐색
- 동등 비교(`=`), 범위 비교(`<`, `>`, `BETWEEN`), 정렬(`ORDER BY`)에 모두 효과적
- `NULL` 값도 인덱스에 포함됨
- 시간 복잡도: **O(log n)**

### 인덱스 종류 비교

| 타입 | 용도 | 예시 |
|------|------|------|
| B-Tree | 범용 (기본값) | 대부분의 컬럼 |
| Hash | 동등 비교만 | `WHERE status = 'ACTIVE'` |
| GIN | 배열, Full-text Search | JSONB, tsvector |
| GiST | 공간 데이터, 범위 타입 | PostGIS, tsrange |
| BRIN | 물리적 정렬된 대용량 데이터 | 시계열 데이터 |

---

## EXPLAIN ANALYZE로 쿼리 분석하기

인덱스를 만들었는데 정말 사용되고 있는 걸까? **EXPLAIN ANALYZE**로 확인할 수 있다.

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 42;
```

인덱스가 없을 때:

```
Seq Scan on orders  (cost=0.00..18726.00 rows=523 width=64)
  (actual time=0.031..92.145 rows=487 loops=1)
  Filter: (user_id = 42)
  Rows Removed by Filter: 999513
Planning Time: 0.089 ms
Execution Time: 92.312 ms
```

인덱스 생성 후:

```
Index Scan using idx_orders_user_id on orders  (cost=0.42..523.15 rows=523 width=64)
  (actual time=0.028..1.234 rows=487 loops=1)
  Index Cond: (user_id = 42)
Planning Time: 0.102 ms
Execution Time: 1.387 ms
```

92ms → 1.4ms로 **약 66배** 빨라졌다. 핵심 지표:

- **Seq Scan → Index Scan**: 인덱스가 사용되고 있음
- **actual time**: 실제 소요 시간 (ms)
- **Rows Removed by Filter**: Seq Scan에서 버려진 행 수 (높을수록 비효율)

---

## 복합 인덱스 전략

여러 컬럼을 조합한 쿼리가 자주 사용된다면 **복합 인덱스(Composite Index)**를 고려하자.

```sql
-- 특정 사용자의 최근 주문을 자주 조회하는 경우
CREATE INDEX idx_orders_user_created
    ON orders (user_id, created_at DESC);
```

```sql
-- 이 쿼리에 최적화됨
SELECT * FROM orders
WHERE user_id = 42
ORDER BY created_at DESC
LIMIT 10;
```

### 복합 인덱스의 핵심 규칙: 컬럼 순서

복합 인덱스는 **왼쪽 컬럼부터 순서대로** 사용된다. 이를 **Leftmost Prefix Rule**이라 한다.

인덱스 `(user_id, status, created_at)`가 있을 때:

```sql
-- ✅ 인덱스 사용됨
WHERE user_id = 42
WHERE user_id = 42 AND status = 'PAID'
WHERE user_id = 42 AND status = 'PAID' AND created_at > '2026-01-01'

-- ❌ 인덱스 사용 안 됨 (user_id 없이 중간 컬럼부터 시작)
WHERE status = 'PAID'
WHERE status = 'PAID' AND created_at > '2026-01-01'
```

### 컬럼 순서 결정 기준

1. **동등 조건(`=`)에 사용되는 컬럼** → 앞에 배치
2. **범위 조건(`>`, `<`, `BETWEEN`)에 사용되는 컬럼** → 뒤에 배치
3. **카디널리티(고유 값 수)가 높은 컬럼** → 앞에 배치

---

## 인덱스를 걸면 안 되는 경우

인덱스는 만능이 아니다. 오히려 성능을 떨어뜨리는 경우도 있다:

- **쓰기가 매우 빈번한 테이블**: INSERT/UPDATE/DELETE 시 인덱스도 함께 갱신되므로 오버헤드 발생
- **카디널리티가 극단적으로 낮은 컬럼**: `gender`처럼 값이 2~3개뿐이면 Full Scan이 더 빠를 수 있음
- **테이블 크기가 작은 경우**: 수천 건 이하라면 Seq Scan이 충분히 빠름

---

## 실무 팁

```sql
-- 사용되지 않는 인덱스 찾기
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 인덱스 크기 확인
SELECT pg_size_pretty(pg_indexes_size('orders'));

-- 테이블 + 인덱스 전체 크기
SELECT pg_size_pretty(pg_total_relation_size('orders'));
```

사용되지 않는 인덱스는 쓰기 성능만 떨어뜨리므로, 주기적으로 확인하고 정리하는 것이 좋다.

---

## 정리

1. 인덱스는 읽기 성능을 높이지만 쓰기 성능을 낮춘다 — **트레이드오프**를 이해하자
2. **EXPLAIN ANALYZE**로 항상 실제 실행 계획을 확인하자
3. 복합 인덱스는 **컬럼 순서**가 핵심이다
4. 불필요한 인덱스는 정리하자 — 인덱스도 디스크와 메모리를 소비한다
