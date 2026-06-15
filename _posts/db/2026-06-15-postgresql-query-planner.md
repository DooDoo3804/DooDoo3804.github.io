---
title: "PostgreSQL 쿼리 플래너는 어떻게 플랜을 고르나"
subtitle: "통계·비용 모델·조인 전략으로 보는 옵티마이저 내부 동작"
layout: post
date: "2026-06-15"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, query planner, optimizer, cost model, selectivity, join, nested loop, hash join, merge join, explain"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL 쿼리 플래너의 내부 동작을 파헤친다. 통계 기반 선택도 추정, 비용 모델, 스캔·조인 알고리즘 선택 기준, EXPLAIN으로 플랜을 진단하는 법까지."
---

같은 결과를 내는 SQL이라도 PostgreSQL은 매번 **다른 실행 계획(plan)**을 고를 수 있다. 어제는 Index Scan을 쓰던 쿼리가 오늘은 Seq Scan을 고른다. 인덱스를 분명히 만들었는데도 옵티마이저가 무시한다. 이건 버그가 아니라 **비용 기반 옵티마이저(cost-based optimizer)**가 의도대로 동작하는 모습이다.

이 글은 PostgreSQL 마스터 시리즈의 마지막 편으로, 플래너가 *왜* 그리고 *어떻게* 특정 플랜을 선택하는지 그 내부 동작을 다룬다. 인덱스의 종류나 `EXPLAIN ANALYZE` 출력을 읽는 기초는 [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)에서 이미 다뤘으니, 여기서는 그 위에서 동작하는 **플래너의 의사결정 과정**에 집중한다.

---

## 쿼리 한 줄이 결과가 되기까지

우리가 `SELECT`를 던지면 PostgreSQL은 그것을 곧장 실행하지 않는다. 네 단계의 파이프라인을 거친다.

```
SQL 텍스트
   │
   ▼
[1] 파서 (Parser)      ── 문법 검사 → 파스 트리(parse tree)
   │
   ▼
[2] 리라이터 (Rewriter) ── 뷰·룰 전개 → 쿼리 트리(query tree)
   │
   ▼
[3] 플래너 (Planner)    ── 비용 비교 → 실행 계획(plan tree)
   │
   ▼
[4] 익스큐터 (Executor) ── 플랜 트리 실행 → 결과 행
```

각 단계를 짧게 짚어 보자.

**[1] 파서.** SQL 텍스트가 문법에 맞는지 검사하고 토큰을 파스 트리로 만든다. 이 단계는 순수하게 구문(syntax)만 본다. 테이블이 실제로 존재하는지, 컬럼 타입이 맞는지 같은 의미 분석(semantic analysis)은 그다음 트랜스폼 단계에서 시스템 카탈로그(`pg_class`, `pg_attribute` 등)를 조회해 처리한다.

**[2] 리라이터.** 룰 시스템(rule system)이 동작하는 곳이다. 뷰(view)는 사실 `SELECT` 룰로 구현돼 있어서, 뷰를 참조하는 쿼리는 이 단계에서 원본 테이블에 대한 쿼리로 **전개(expand)**된다. 사용자가 정의한 `CREATE RULE`도 여기서 적용된다.

**[3] 플래너/옵티마이저.** 이 글의 주인공이다. 리라이트된 쿼리 트리를 받아 **실행 가능한 여러 플랜을 생성하고, 각각의 비용을 추정한 뒤 가장 싼 것을 고른다.** 어떤 스캔 방식을 쓸지, 조인 순서와 조인 알고리즘은 무엇으로 할지가 모두 여기서 결정된다.

**[4] 익스큐터.** 플래너가 만든 플랜 트리를 받아 실제로 행을 뽑아낸다. 뒤에서 보겠지만, 익스큐터는 트리의 위쪽 노드가 아래쪽 노드에게 "행 하나 더 줘"라고 요청하는 **demand-pull 방식**으로 동작한다.

> [!IMPORTANT]
> 플래너의 입력은 "정답이 정해진 문제"가 아니다. 같은 쿼리 트리에서 수십~수백 개의 후보 플랜이 나올 수 있고, 플래너는 그중 **추정 비용이 최소**인 것을 고른다. 추정이 틀리면 플랜도 틀린다 — 그래서 통계가 중요하다.

---

## 통계: 플래너의 눈

플래너가 비용을 추정하려면 "이 조건에 맞는 행이 대략 몇 개나 될까?"를 알아야 한다. 이 추정의 근거가 바로 **통계(statistics)**이고, 통계는 `ANALYZE`가 수집해 `pg_statistic` 카탈로그에 저장한다. (`AUTOVACUUM`이 백그라운드에서 `ANALYZE`도 함께 돌린다.)

```sql
ANALYZE orders;   -- orders 테이블의 통계를 갱신
```

사람이 읽기 좋은 뷰는 `pg_stats`다.

```sql
SELECT attname, n_distinct, null_frac,
       most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

수집되는 핵심 통계는 다음과 같다.

| 통계 항목 | 의미 | 쓰임새 |
|-----------|------|--------|
| `null_frac` | NULL 값 비율 | `IS NULL` 선택도 |
| `n_distinct` | 고유 값 개수(또는 비율) | 균등 분포 가정 시 선택도 |
| `most_common_vals` (MCV) | 가장 흔한 값 목록 | 자주 나오는 값의 정확한 빈도 |
| `most_common_freqs` | MCV 각각의 출현 빈도 | MCV와 짝을 이룸 |
| `histogram_bounds` | 값 분포를 같은 빈도로 나눈 경계 | 범위 조건(`>`, `<`, `BETWEEN`) 선택도 |
| `correlation` | 물리적 저장 순서와 값 순서의 상관도 | Index Scan vs Bitmap 비용 추정 |

### 선택도(selectivity) 추정

**선택도**는 "조건을 통과하는 행의 비율(0~1)"이다. 예를 들어 `status = 'PAID'`라는 조건을 만났을 때 플래너의 판단은 이렇다.

- `'PAID'`가 MCV 목록에 있으면 → `most_common_freqs`의 정확한 빈도를 그대로 쓴다.
- MCV에 없으면 → MCV가 차지하지 않는 나머지 빈도를 `n_distinct` 기반으로 균등 분배해 추정한다.

범위 조건 `created_at > '2026-01-01'`이라면 `histogram_bounds`를 보고 경계 너머에 몇 개의 버킷이 걸리는지로 비율을 계산한다. 추정 행 수는 `전체 행 수 × 선택도`다.

> [!TIP]
> 통계의 해상도는 `default_statistics_target`(기본값 100)이 정한다. MCV 개수와 히스토그램 버킷 수가 이 값을 따른다. 분포가 치우친 컬럼이라면 컬럼 단위로 높여 정확도를 끌어올릴 수 있다.
> ```sql
> ALTER TABLE orders ALTER COLUMN status SET STATISTICS 500;
> ANALYZE orders;
> ```

여러 컬럼이 서로 상관관계가 있을 때(예: `city`와 `zipcode`)는 단일 컬럼 통계만으로는 곱셈 가정이 깨져 추정이 빗나간다. 이럴 땐 **확장 통계(extended statistics)**를 쓴다.

```sql
CREATE STATISTICS stx_city_zip (dependencies)
    ON city, zipcode FROM addresses;
ANALYZE addresses;
```

---

## 비용(cost)은 시간이 아니라 상대값이다

플래너가 후보 플랜을 비교하는 단위가 **비용(cost)**이다. 여기서 가장 많이 오해하는 지점: **cost는 밀리초가 아니다.** 시간 단위가 전혀 아니고, 플랜끼리 비교하기 위한 **추상적인 상대값**이다. cost 1.0은 "순차적으로 디스크 페이지 한 장을 읽는 작업"을 기준으로 잡은 단위일 뿐이다.

비용은 다음 파라미터들의 가중 합으로 계산된다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `seq_page_cost` | 1.0 | 순차적으로 페이지 1장 읽는 비용 (**기준점**) |
| `random_page_cost` | 4.0 | 임의 위치 페이지 1장 읽는 비용 |
| `cpu_tuple_cost` | 0.01 | 행 1개를 처리하는 CPU 비용 |
| `cpu_index_tuple_cost` | 0.005 | 인덱스 엔트리 1개 처리 비용 |
| `cpu_operator_cost` | 0.0025 | 연산자/함수 1회 실행 비용 |

`random_page_cost`가 `seq_page_cost`의 4배라는 점이 핵심이다. 이는 회전 디스크(HDD)에서 임의 접근이 순차 접근보다 느리다는 가정을 담은 값이다. 그래서 인덱스를 통한 임의 접근은 순차 스캔보다 페이지당 비용이 비싸게 매겨진다.

> [!NOTE]
> SSD/NVMe 환경에서는 임의 접근 페널티가 거의 없다. 그래서 실무에서는 `random_page_cost`를 1.1 안팎으로 낮춰 플래너가 인덱스 스캔을 더 적극적으로 선택하게 만드는 튜닝을 흔히 한다. 또한 `effective_cache_size`(OS+PG 캐시 추정치)를 실제 메모리에 맞춰 주면, 반복 접근되는 페이지가 캐시에 있다고 가정해 인덱스 비용을 더 낮게 잡는다.

### Seq Scan 비용을 직접 계산해 보기

페이지 1,000장, 행 100,000개인 테이블을 풀스캔하면 추정 비용은 대략 이렇다.

```
총 비용 = (페이지 수 × seq_page_cost) + (행 수 × cpu_tuple_cost)
        = (1000 × 1.0)              + (100000 × 0.01)
        = 1000 + 1000
        = 2000
```

`EXPLAIN` 출력의 `cost=0.00..2000.00`에서 앞 숫자는 **startup cost**(첫 행이 나오기까지의 비용), 뒤 숫자는 **total cost**(마지막 행까지의 비용)다. 플래너는 보통 total cost로 플랜을 비교하지만, `LIMIT`이 붙으면 startup cost가 낮은 플랜이 유리해진다.

---

## 어떤 스캔을 고를까

테이블에서 행을 읽는 방법은 하나가 아니다. 플래너는 선택도와 비용을 따져 네 가지 중 하나를 고른다.

| 스캔 방식 | 동작 | 유리한 상황 |
|-----------|------|-------------|
| **Seq Scan** | 테이블 전체를 처음부터 끝까지 읽음 | 선택도가 높음(많은 행 반환), 작은 테이블 |
| **Index Scan** | 인덱스로 위치를 찾고 → 힙에서 행을 가져옴 | 선택도가 낮음(소수 행), 정렬 필요 |
| **Index-Only Scan** | 인덱스만 읽고 힙 접근 생략 | 필요한 컬럼이 모두 인덱스에 있고 페이지가 all-visible |
| **Bitmap Heap Scan** | 인덱스로 비트맵 만들고 → 힙을 페이지 순서로 한 번에 | 선택도가 중간, 여러 인덱스 조합 |

### Index Scan vs Bitmap Heap Scan

이 둘의 차이가 플래너 동작을 이해하는 핵심이다.

**Index Scan**은 인덱스 엔트리를 하나 찾을 때마다 곧바로 힙의 해당 행을 가지러 간다. 매칭되는 행이 물리적으로 흩어져 있으면 이 힙 접근이 전부 **임의 접근(random I/O)**이 된다. 매칭 행이 적을 때는 괜찮지만, 많아지면 임의 접근 횟수가 폭발한다.

**Bitmap Heap Scan**은 두 단계로 나눠 이 문제를 푼다. 먼저 `Bitmap Index Scan`이 인덱스를 훑어 **매칭되는 힙 페이지들의 비트맵**을 만든다. 그다음 `Bitmap Heap Scan`이 그 비트맵을 **물리적 페이지 순서대로** 정렬해 각 페이지를 딱 한 번씩 읽는다. 임의 접근이 순차 접근에 가까워지고, 같은 페이지를 중복해서 읽지 않는다.

```
EXPLAIN
SELECT * FROM orders WHERE amount BETWEEN 100 AND 500;

Bitmap Heap Scan on orders  (cost=215.43..4521.10 rows=18200 width=64)
  Recheck Cond: ((amount >= 100) AND (amount <= 500))
  ->  Bitmap Index Scan on idx_orders_amount  (cost=0.00..210.88 rows=18200 width=0)
        Index Cond: ((amount >= 100) AND (amount <= 500))
```

게다가 비트맵은 합칠 수 있다. 두 인덱스의 비트맵을 `BitmapAnd`/`BitmapOr`로 결합하면, 단일 컬럼 인덱스 여러 개만으로도 복합 조건을 효율적으로 처리한다 — 복합 인덱스가 없어도 된다.

### Index-Only Scan의 조건

Index-Only Scan은 이름 그대로 힙을 건드리지 않아 가장 빠를 수 있지만, 조건이 까다롭다.

1. 쿼리가 필요로 하는 **모든 컬럼이 인덱스에 포함**돼 있어야 한다 (`INCLUDE` 컬럼 활용).
2. 읽으려는 힙 페이지가 **가시성 맵(visibility map)에서 all-visible**로 표시돼 있어야 한다.

2번이 중요하다. PostgreSQL의 인덱스 엔트리는 그 행이 현재 트랜잭션에게 보이는지(visibility) 정보를 갖고 있지 않다. 그래서 보통은 힙을 찾아가 확인해야 하는데, **가시성 맵**이 "이 페이지의 모든 행은 모두에게 보인다"고 보장하면 힙 확인을 생략할 수 있다. 이 가시성 맵은 `VACUUM`이 갱신한다.

> [!WARNING]
> 즉, Index-Only Scan은 `VACUUM`이 충분히 돌아 가시성 맵이 최신일 때 잘 동작한다. 방금 대량 갱신/삽입이 일어난 테이블은 all-visible 비트가 꺼져 있어, 인덱스에 컬럼이 다 있어도 힙을 다시 찾아가는 "Heap Fetches"가 발생한다. 가시성 맵과 VACUUM의 관계는 [Part 1: MVCC와 VACUUM](/2026/06/13/postgresql-mvcc-vacuum/)에서 자세히 다뤘다.

---

## 조인 알고리즘: 세 가지 전략

여러 테이블을 조인할 때 플래너가 고를 수 있는 알고리즘은 세 가지다. 각각 비용 특성이 완전히 달라서, "어떤 조인이 빠르다"는 절대 규칙은 없고 **데이터 크기와 정렬·인덱스 유무에 따라** 결정된다.

### Nested Loop Join

가장 단순하다. 바깥 테이블(outer)의 행 하나마다 안쪽 테이블(inner)을 뒤져 매칭을 찾는다.

```
for each row R in outer:
    for each row S in inner:
        if R.key = S.key: emit (R, S)
```

순수하게는 `O(N × M)`이지만, **inner 쪽에 조인 키 인덱스가 있으면** 안쪽 루프가 인덱스 조회로 바뀌어 `O(N × log M)`이 된다. 그래서 Nested Loop는 **바깥 결과 집합이 작을 때**(예: 강한 필터로 몇 행만 남았을 때) + **안쪽에 인덱스가 있을 때** 가장 강력하다. 반대로 양쪽 다 큰 테이블이면 최악이다.

### Hash Join

먼저 두 테이블 중 **작은 쪽으로 해시 테이블을 메모리에 짓고(build)**, 큰 쪽을 한 행씩 흘리며 해시로 매칭을 찾는다(probe).

```
build:  작은 테이블 → 해시 테이블 (조인 키로 해싱)
probe:  큰 테이블의 각 행 → 해시 테이블에서 O(1) 조회
```

양쪽을 한 번씩만 읽으므로 큰 테이블 두 개를 **등치 조인(`=`)**할 때 압도적으로 유리하다. 단, 해시 테이블이 `work_mem`을 넘으면 디스크로 배치(batch)를 쪼개 쓰게 되고 비용이 오른다. 그리고 해시 특성상 **등치 조인에만** 쓸 수 있다 — 부등호·범위 조인은 불가능하다.

### Merge Join

양쪽 입력을 **조인 키로 정렬한 뒤**, 정렬된 두 스트림을 동시에 훑으며 병합한다(마치 합병 정렬의 머지 단계처럼).

```
정렬된 outer ─┐
              ├─→ 양쪽 포인터를 키 순서로 전진시키며 매칭
정렬된 inner ─┘
```

정렬 비용이 들지만, **양쪽이 이미 인덱스로 정렬돼 있으면** 정렬을 건너뛰어 매우 싸진다. 큰 테이블 둘을 조인하는데 양쪽에 조인 키 인덱스가 있다면 Merge Join이 Hash Join을 이기기도 한다. 정렬 순서를 그대로 이용하므로 후속 `ORDER BY`에도 유리하다.

### 정리하면

| 조인 | 빌드/사전작업 | 적합한 상황 | 조인 조건 |
|------|--------------|-------------|-----------|
| **Nested Loop** | 없음 | outer가 작고 inner에 인덱스 | 등치·부등호 모두 |
| **Hash Join** | 작은 쪽 해시 빌드 | 큰 테이블 등치 조인, 정렬 불필요 | 등치(`=`)만 |
| **Merge Join** | 양쪽 정렬 | 큰 테이블 + 양쪽 정렬돼 있음 | 등치(mergejoinable 키) |

> [!NOTE]
> 조인 테이블이 많아지면 가능한 조인 순서의 경우의 수가 폭발한다(`n!`에 가깝게). PostgreSQL은 보통 동적 계획법으로 최적 순서를 찾지만, 조인 테이블 수가 `geqo_threshold`(기본 12)를 넘으면 **유전 알고리즘 기반 옵티마이저(GEQO)**로 전환해 근사 최적해를 빠르게 찾는다.

---

## 플랜은 노드 트리다

플래너의 최종 산출물은 **플랜 노드 트리**다. 각 노드는 스캔이나 조인 같은 하나의 연산이고, 자식 노드의 출력을 입력으로 받는다. 익스큐터는 이 트리를 **demand-pull(Volcano/iterator 모델)**로 실행한다 — 최상위 노드가 `next()`를 호출하면, 그 호출이 필요한 만큼 자식에게 전파되어 아래에서 행이 한 개씩 올라온다.

읽을 때는 **가장 안쪽으로 들여 쓰인 노드부터(아래에서 위로)** 데이터가 흐른다고 보면 된다.

```
EXPLAIN
SELECT u.name, o.amount
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.country = 'KR';

Hash Join  (cost=33.50..1845.20 rows=4200 width=40)        ← (4) 최종 결과
  Hash Cond: (o.user_id = u.id)
  ->  Seq Scan on orders o  (cost=0.00..1500.00 rows=80000 width=12)   ← (3) probe
  ->  Hash  (cost=28.00..28.00 rows=440 width=36)                      ← (2) 해시 빌드
        ->  Index Scan using idx_users_country on users u  ← (1) 빌드 입력
              Index Cond: (country = 'KR')
```

흐름을 풀어 보면:

1. `users`를 `country='KR'` 조건으로 Index Scan → 소수의 한국 사용자만 추림.
2. 그 결과로 해시 테이블을 빌드(`Hash` 노드).
3. `orders`를 Seq Scan하며 해시 테이블에 probe → 최종 결과.

플래너가 작은 `users`(필터된) 쪽을 해시 빌드 대상으로, 큰 `orders`를 probe 대상으로 고른 것에 주목하자. 빌드는 작은 쪽이 메모리에 유리하기 때문이다. `EXPLAIN` 출력을 읽는 더 기초적인 문법은 [인덱스 글](/2026/03/25/postgresql-index/)을 참고하자.

---

## estimate vs actual: 플랜을 진단하는 법

플래너의 모든 판단은 **추정 행 수(estimate)** 위에 서 있다. 추정이 실제와 크게 어긋나면 잘못된 알고리즘을 골라 쿼리가 느려진다. 이걸 잡아내는 도구가 `EXPLAIN ANALYZE`다 — 추정값과 **실제 실행값(actual)**을 나란히 보여 준다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE status = 'REFUNDED';
```

```
Seq Scan on orders  (cost=0.00..1875.00 rows=50 width=64)
                    (actual time=12.3..201.5 rows=48000 loops=1)
  Filter: (status = 'REFUNDED')
  Rows Removed by Filter: 52000
Planning Time: 0.10 ms
Execution Time: 245.8 ms
```

여기서 `rows=50`(추정)과 `actual ... rows=48000`(실제)의 **차이가 무려 960배**다. 플래너는 `REFUNDED` 행이 50개뿐이라 믿고 플랜을 짰는데 실제로는 4만 8천 개였다. 통계가 현실과 어긋나 있다는 신호다.

> [!TIP]
> **진단 체크리스트**
> 1. estimate vs actual `rows` 차이가 한 자릿수 배율을 넘는 노드를 찾는다 — 거기가 오판의 진원지다.
> 2. 가장 먼저 `ANALYZE 테이블;`을 실행해 통계를 갱신하고 다시 본다.
> 3. 그래도 어긋나면 해당 컬럼의 `STATISTICS` 타깃을 높이거나, 상관 컬럼은 확장 통계를 만든다.
> 4. `loops` 값이 큰 Nested Loop가 보이면, 안쪽이 수천 번 반복 실행되고 있다는 뜻 — 인덱스나 조인 방식을 의심한다.

`Rows Removed by Filter`가 크다는 건 읽어 들인 행 대부분을 버렸다는 뜻이고, 이는 더 선택적인 인덱스가 필요하다는 힌트가 된다.

---

## 왜 인덱스를 두고 Seq Scan을 고를까

가장 흔한 질문이자, 지금까지의 내용을 종합하는 사례다. 인덱스가 멀쩡히 있는데도 플래너가 Seq Scan을 고르는 건 대개 **그게 정말로 더 싸기 때문**이다.

조건의 **선택도가 높을 때**(= 테이블의 큰 비중을 반환할 때)를 생각해 보자. 전체의 30%를 반환하는 쿼리라면, Index Scan은 그 30%만큼 힙으로 임의 접근을 반복해야 한다. `random_page_cost`(4.0)가 곱해진 이 비용은, 차라리 테이블을 순차로 한 번 훑는(`seq_page_cost` 1.0) 비용보다 비싸진다. 플래너의 계산이 맞는 것이다.

```sql
-- 거의 모든 행이 'ACTIVE'인 컬럼: 인덱스가 있어도 Seq Scan이 정답
SELECT * FROM users WHERE status = 'ACTIVE';
```

플래너가 **틀려서** Seq Scan을 고르는 경우도 있다. 통계가 낡아 선택도를 과대평가했을 때다. 이때의 처방은 인덱스 추가가 아니라 통계 갱신이다.

```sql
ANALYZE users;   -- 먼저 이것부터
```

> [!WARNING]
> `SET enable_seqscan = off;`로 Seq Scan을 강제로 끄고 싶은 유혹이 있다. 이건 디버깅 용도로는 유용하지만(플래너가 인덱스를 *쓸 수는* 있는지 확인) 운영 환경의 해법은 아니다. 근본 원인은 거의 항상 통계이거나 비용 파라미터(`random_page_cost`)다. 증상이 아니라 원인을 고치자.

---

## 정리

1. 쿼리는 **파서 → 리라이터 → 플래너 → 익스큐터**의 4단계를 거치며, 플랜 선택은 전적으로 플래너가 한다.
2. 플래너의 눈은 **통계**다. `ANALYZE`가 `pg_statistic`에 모은 MCV·히스토그램으로 **선택도**를 추정한다.
3. **cost는 시간이 아니라 상대값**이다. `seq_page_cost`(1.0)를 기준으로 `random_page_cost`(4.0) 등이 가중된다.
4. 스캔 방식은 선택도가 가른다 — 소수면 Index, 중간이면 Bitmap, 다수면 Seq. Index-Only Scan은 **가시성 맵**이 받쳐 줄 때만 빛난다.
5. 조인은 절대 강자가 없다 — outer가 작으면 **Nested Loop**, 큰 등치 조인이면 **Hash**, 양쪽이 정렬돼 있으면 **Merge**.
6. `EXPLAIN ANALYZE`로 **estimate vs actual**을 비교하라. 차이가 크면 통계부터 갱신하는 게 정석이다.

플래너는 마법이 아니라 **통계 위에서 비용을 계산하는 기계**다. 그 입력(통계)을 정확히 유지해 주는 것이 우리가 할 일의 절반이고, 나머지 절반은 그 계산을 `EXPLAIN`으로 읽어 내는 능력이다.

---

## 관련 포스트

- [PostgreSQL MVCC와 VACUUM 내부 동작 (Part 1)](/2026/06/13/postgresql-mvcc-vacuum/)
- [PostgreSQL WAL과 크래시 복구 (Part 2)](/2026/06/14/postgresql-wal-recovery/)
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
- [MySQL vs PostgreSQL — 백엔드 개발자가 알아야 할 차이](/2026/04/01/mysql-vs-postgresql/)
- [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)
