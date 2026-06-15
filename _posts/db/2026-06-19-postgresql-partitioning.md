---
title: "PostgreSQL 파티셔닝과 파티션 프루닝"
subtitle: "선언적 파티셔닝 RANGE·LIST·HASH와 플래너의 파티션 가지치기"
layout: post
date: "2026-06-19"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, partitioning, partition pruning, declarative partitioning, range, list, hash, constraint exclusion, attach partition"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL 선언적 파티셔닝을 파헤친다. RANGE·LIST·HASH 전략, 플래너의 파티션 프루닝, 무중단 ATTACH/DETACH 운영, 파티션 키 선택과 주의점까지."
---

한 테이블에 10억 행이 쌓였다고 하자. 인덱스를 아무리 잘 걸어도 테이블 자체가 거대하면 `VACUUM`은 하루 종일 돌고, 오래된 데이터를 지우는 `DELETE`는 테이블을 부풀리며, 통계는 갱신될 때마다 비싸진다. 이럴 때 꺼내는 카드가 **파티셔닝(partitioning)** — 하나의 논리 테이블을 여러 개의 물리 조각으로 쪼개는 것이다.

이 글은 PostgreSQL 마스터 시리즈의 파티셔닝 편이다. 단순히 "테이블을 나눈다"가 아니라, **플래너가 어떻게 불필요한 파티션을 건너뛰는가(파티션 프루닝)**에 무게를 둔다. 프루닝은 [Part 3: 쿼리 플래너](/2026/06/15/postgresql-query-planner/)에서 다룬 플랜 결정 과정의 연장선이다 — 플래너 기초가 가물가물하면 먼저 그 글을 보고 오자.

---

## 선언적 파티셔닝이란

PostgreSQL 10부터 **선언적 파티셔닝(declarative partitioning)**이 들어왔다. 부모 테이블을 "파티션의 틀"로 선언하고, 그 아래에 실제 데이터를 담는 자식 파티션을 붙이는 방식이다.

```sql
-- 부모: 데이터를 직접 갖지 않는 '틀'
CREATE TABLE measurements (
    id          bigint        NOT NULL,
    device_id   int           NOT NULL,
    logged_at   timestamptz   NOT NULL,
    value       numeric
) PARTITION BY RANGE (logged_at);

-- 자식: 실제 행이 저장되는 파티션
CREATE TABLE measurements_2026_06
    PARTITION OF measurements
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE measurements_2026_07
    PARTITION OF measurements
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

이제 `measurements`에 `INSERT`하면 PostgreSQL이 `logged_at` 값을 보고 알맞은 파티션으로 자동 **라우팅(tuple routing)**한다. 조회도 부모 테이블 하나만 보면 된다. 애플리케이션 입장에서는 여전히 테이블 하나처럼 보인다.

> [!IMPORTANT]
> PG10 이전에는 테이블 **상속(inheritance)** + 트리거/룰 + `CHECK` 제약을 손으로 엮어 파티셔닝을 흉내 냈다(레거시 상속 파티셔닝). 선언적 파티셔닝은 라우팅·프루닝을 엔진이 직접 처리하므로 훨씬 빠르고 안전하다. 신규 설계라면 선택의 여지가 없다 — 선언적 파티셔닝을 쓴다.

---

## 세 가지 파티셔닝 전략

파티션을 나누는 기준은 세 가지다.

| 전략 | 기준 | 적합한 데이터 | 도입 |
|------|------|---------------|------|
| **RANGE** | 값의 범위 구간 | 시계열(날짜), 연속된 ID | PG10 |
| **LIST** | 값의 열거 목록 | 지역·국가 등 범주형 | PG10 |
| **HASH** | 키의 해시 나머지 | 균등 분산이 필요한 경우 | PG11 |

### RANGE — 시계열의 정석

```sql
PARTITION BY RANGE (logged_at)
-- 월 단위 구간으로 분할 (하한 포함, 상한 제외)
FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

날짜·시간 기반 대용량 로그/이벤트 테이블의 표준이다. 오래된 파티션을 통째로 `DROP`하면 대량 `DELETE` 없이 한순간에 데이터를 비울 수 있다.

### LIST — 범주로 나누기

```sql
CREATE TABLE orders (
    id int, region text, amount numeric
) PARTITION BY LIST (region);

CREATE TABLE orders_asia
    PARTITION OF orders FOR VALUES IN ('KR', 'JP', 'CN');
CREATE TABLE orders_eu
    PARTITION OF orders FOR VALUES IN ('DE', 'FR', 'UK');
```

### HASH — 균등 분산

특정 구간이나 범주로 쏠리지 않게 키를 해시해 고르게 흩뿌린다. 핫스팟을 막고 싶을 때 쓴다.

```sql
CREATE TABLE sessions (
    id bigint, user_id bigint
) PARTITION BY HASH (user_id);

CREATE TABLE sessions_p0 PARTITION OF sessions
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_p1 PARTITION OF sessions
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
-- ... p2, p3
```

> [!TIP]
> 매칭되는 파티션이 없는 행이 들어오면 `INSERT`는 실패한다. 이를 받아 줄 **DEFAULT 파티션**을 두면 안전망이 된다(HASH 제외).
> ```sql
> CREATE TABLE measurements_default
>     PARTITION OF measurements DEFAULT;
> ```

---

## 파티션 프루닝: 플래너의 가지치기

파티셔닝의 진짜 위력은 여기서 나온다. **파티션 프루닝(partition pruning)**은 쿼리 조건을 보고 **스캔할 필요가 없는 파티션을 플래너가 아예 플랜에서 제외**하는 최적화다. `enable_partition_pruning`은 기본값이 `on`이다.

월별로 12개 파티션을 둔 테이블에 6월 데이터만 조회한다고 하자.

```sql
EXPLAIN
SELECT * FROM measurements
WHERE logged_at >= '2026-06-10' AND logged_at < '2026-06-20';
```

```
Seq Scan on measurements_2026_06 measurements
  (cost=0.00..210.00 rows=480 width=32)
  Filter: ((logged_at >= '2026-06-10') AND (logged_at < '2026-06-20'))
```

플랜에 **`measurements_2026_06` 단 하나만** 등장한다. 나머지 11개 파티션은 조건상 6월 범위와 겹칠 수 없으므로 플래너가 잘라낸 것이다. 12분의 1만 읽는다.

프루닝이 일어나지 않으면 모든 파티션이 `Append` 아래에 줄줄이 나열된다 — 그게 보이면 조건이 파티션 키와 안 맞거나 프루닝이 막힌 것이다.

```
Append
  ->  Seq Scan on measurements_2026_01
  ->  Seq Scan on measurements_2026_02
  ...   (12개 전부)
```

> [!NOTE]
> 프루닝이 효과를 보려면 **WHERE 조건이 파티션 키를 직접 겨냥**해야 한다. `WHERE date_trunc('month', logged_at) = ...`처럼 키를 함수로 감싸면 플래너가 구간을 추론하지 못해 프루닝이 깨진다. 가능하면 `logged_at >= ... AND logged_at < ...` 형태의 원본 컬럼 비교를 쓰자.

---

## 실행시 프루닝(execution-time pruning)

플래너가 플랜을 짜는 시점에는 값을 모르는 경우가 있다 — 프리페어드 스테이트먼트의 파라미터(`$1`), 또는 조인 중에 바깥 행에서 흘러드는 값. 이때 PostgreSQL은 **실행 시점에** 실제 값을 받아 파티션을 잘라낸다(PG11+).

```sql
EXPLAIN ANALYZE
SELECT * FROM measurements WHERE logged_at = $1;   -- 파라미터
```

```
Append  (actual rows=12 loops=1)
  Subplans Removed: 11
  ->  Seq Scan on measurements_2026_06 ...
```

`Subplans Removed: 11`이 실행시 프루닝의 증거다. 플랜 트리에는 12개 파티션이 다 들어 있었지만, 실행 중 `$1` 값이 정해지자 11개를 건너뛰었다. 플랜 캐시를 재사용하는 프리페어드 쿼리에서 특히 빛난다.

| 구분 | 시점 | 트리거 |
|------|------|--------|
| 플랜타임 프루닝 | 플래닝 중 | WHERE의 상수 조건 |
| 실행시 프루닝 | 실행 중 | 파라미터(`$1`), 조인 키 등 런타임 값 |

---

## constraint exclusion: 레거시와의 비교

선언적 파티셔닝 이전의 상속 기반 파티셔닝은 **constraint exclusion**이라는 다른 메커니즘으로 파티션을 걸러냈다. 각 자식 테이블의 `CHECK` 제약을 플래너가 쿼리 조건과 대조해, 모순되는 자식을 제외하는 방식이다.

```sql
SET constraint_exclusion = partition;  -- 기본값
-- 옵션: on(모든 테이블) / off / partition(상속·UNION ALL만)
```

둘은 목적이 같지만 결이 다르다.

| 항목 | 파티션 프루닝 | constraint exclusion |
|------|----------------|----------------------|
| 대상 | 선언적 파티셔닝 | 레거시 상속 파티셔닝 |
| 근거 | 파티션 경계 메타데이터 | 자식의 `CHECK` 제약 |
| 실행시 프루닝 | 지원 | 미지원(플래닝 타임만) |
| 속도 | 빠름(경계 직접 비교) | 상대적으로 느림 |

신규 설계에서 상속 파티셔닝을 쓸 이유는 거의 없다. constraint exclusion은 레거시를 유지보수할 때나 만나는 개념으로 알아 두면 된다.

---

## 파티션 키는 어떻게 고르나

파티션 키 선택이 파티셔닝 성패의 절반이다. 기준은 이렇다.

1. **자주 쓰는 WHERE 조건의 컬럼**을 키로 — 그래야 프루닝이 작동한다. 조회에 안 쓰이는 컬럼으로 나누면 매 쿼리가 전체 파티션을 훑는다.
2. **데이터가 고르게 분산**되는 키 — 한 파티션에만 행이 쏠리면(데이터 스큐) 파티셔닝 효과가 사라진다.
3. **파티션 관리 단위와 일치** — 시계열이면 "월/일 단위로 보관·삭제"하는 운영 주기에 키를 맞춘다.

> [!WARNING]
> 파티션 테이블의 **PRIMARY KEY 또는 UNIQUE 제약에는 파티션 키 컬럼이 반드시 포함**돼야 한다. PostgreSQL은 파티션을 가로지르는 전역 유니크 인덱스를 만들지 않기 때문이다. 예컨대 `logged_at`으로 파티션하면서 `id`만으로 PK를 걸 수는 없고, `PRIMARY KEY (id, logged_at)`처럼 키를 포함해야 한다.

---

## 무중단 운영: ATTACH / DETACH

운영 중인 시스템에서 파티션을 붙이고 떼는 일은 일상이다. PostgreSQL은 이를 락 부담 없이 처리하도록 진화해 왔다.

```sql
-- 1) 독립 테이블로 미리 데이터를 채워 둔다
CREATE TABLE measurements_2026_08 (LIKE measurements INCLUDING ALL);
-- ... 적재 ...

-- 2) 검증 스캔을 건너뛰도록 경계와 일치하는 CHECK를 먼저 건다
ALTER TABLE measurements_2026_08
    ADD CONSTRAINT ck_2026_08
    CHECK (logged_at >= '2026-08-01' AND logged_at < '2026-09-01');

-- 3) 붙인다
ALTER TABLE measurements
    ATTACH PARTITION measurements_2026_08
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

> [!TIP]
> `ATTACH PARTITION`은 새 파티션이 경계 조건을 위반하는 행을 갖고 있지 않은지 **전체 스캔으로 검증**한다. 2번처럼 경계와 똑같은 `CHECK` 제약을 미리 걸어 두면 PostgreSQL이 "이미 보장됨"으로 판단해 이 스캔을 건너뛴다. 대용량 파티션을 붙일 때 락 시간을 크게 줄여 준다.

오래된 파티션을 뗄 때는 `DETACH`다. 일반 `DETACH`는 짧지만 강한 락(ACCESS EXCLUSIVE)을 잡는다. 무중단이 중요하면 `CONCURRENTLY`(PG14+)를 쓴다.

```sql
-- 읽기/쓰기를 막지 않고 분리 (PG14+)
ALTER TABLE measurements DETACH PARTITION measurements_2026_01 CONCURRENTLY;

-- 분리 후엔 일반 테이블이므로 즉시 DROP/아카이브 가능
DROP TABLE measurements_2026_01;
```

이렇게 **떼어내고 버리는** 방식은 거대 테이블에서 `DELETE`로 행을 지우는 것과 차원이 다르다. `DELETE`는 죽은 튜플을 남겨 `VACUUM` 부담을 키우지만(자세한 내용은 [Part 1](/2026/06/13/postgresql-mvcc-vacuum/)), 파티션 `DROP`은 파일을 통째로 제거해 즉시 끝난다.

---

## 파티션별 인덱스와 VACUUM

### 인덱스 전파

PG11부터 파티션 부모에 인덱스를 만들면 **모든 자식 파티션에 자동으로 같은 인덱스가 생긴다**. 앞으로 붙는 파티션에도 자동 적용된다.

```sql
-- 부모에 한 번 선언 → 전 파티션에 전파
CREATE INDEX idx_meas_device ON measurements (device_id);
```

각 파티션은 자기만의 물리적 인덱스를 갖는다. 인덱스가 파티션별로 쪼개지므로 하나하나가 작아 `O(log n)` 탐색이 더 얕아진다. 인덱스 일반론은 [인덱스 글](/2026/03/25/postgresql-index/)을 참고하자.

### VACUUM이 가벼워진다

파티셔닝의 운영상 최대 이점 중 하나가 **`VACUUM`의 분할**이다. 10억 행 단일 테이블의 `VACUUM`은 하나의 거대한 작업이지만, 파티셔닝하면 파티션 단위로 나뉜다.

- 쓰기가 몰리는 **최신 파티션만 자주** `VACUUM`/`ANALYZE` 하고, 변하지 않는 과거 파티션은 건드리지 않는다.
- `autovacuum`이 파티션별로 병렬·독립적으로 돈다.
- 통계도 파티션별로 수집돼, 분포가 시기마다 다른 데이터의 추정 정확도가 올라간다.

---

## 주의점 — 파티셔닝이 독이 되는 경우

> [!WARNING]
> 파티셔닝은 만능이 아니다. 다음을 기억하자.
> - **너무 많은 파티션은 플래닝을 무겁게 한다.** 파티션마다 락을 잡고 메타데이터를 검토하므로, 수천~수만 개로 잘게 쪼개면 프루닝으로 걸러지기 전 단계의 플래닝 오버헤드가 커진다. 보관 주기에 맞춰 *적당한 수*로 유지하자.
> - **파티션 키의 NULL 처리.** RANGE 파티션은 어떤 구간에도 안 맞는 NULL을 거부한다(`INSERT` 실패). 파티션 키에 `NOT NULL`을 걸거나 DEFAULT 파티션으로 받아 내자.
> - **전역 유니크 제약 불가.** 파티션 키를 포함하지 않는 컬럼만으로 전역 유일성을 보장할 수 없다.
> - **크로스 파티션 UPDATE 비용.** 파티션 키 값을 바꾸는 `UPDATE`는 행을 다른 파티션으로 이동(DELETE+INSERT)시키므로 일반 `UPDATE`보다 비싸다.

작은 테이블에는 파티셔닝이 오히려 오버헤드다. 일반적으로 단일 테이블이 수억 행 또는 수십 GB를 넘어 `VACUUM`·인덱스·보관 정책이 버거워질 때 도입을 검토한다.

---

## 정리

1. **선언적 파티셔닝(PG10+)**으로 하나의 논리 테이블을 RANGE·LIST·HASH로 쪼갠다. 라우팅·프루닝을 엔진이 직접 처리한다.
2. **파티션 프루닝**이 핵심 가치다 — 플래너가 WHERE 조건과 안 맞는 파티션을 플랜에서 제외한다(`enable_partition_pruning`, 기본 `on`).
3. 파라미터·조인 키처럼 런타임에 정해지는 값은 **실행시 프루닝**(`Subplans Removed`)으로 잘라낸다.
4. 레거시 상속 파티셔닝의 **constraint exclusion**과 달리, 선언적 프루닝은 경계 메타데이터를 직접 보고 실행시 프루닝까지 지원한다.
5. **파티션 키는 WHERE에 자주 쓰이고 고르게 분산되는 컬럼**으로. PK/UNIQUE에는 파티션 키를 포함해야 한다.
6. `ATTACH`(CHECK 선행으로 검증 스캔 생략) / `DETACH CONCURRENTLY`로 무중단 운영하고, 오래된 데이터는 `DROP`으로 즉시 비운다.
7. 과다 파티션·NULL 키·크로스 파티션 UPDATE는 함정이다. 작은 테이블엔 쓰지 말자.

파티셔닝은 결국 **플래너에게 "여기는 볼 필요 없다"고 알려 주는 구조**다. 프루닝이 작동하도록 키를 고르고 쿼리를 쓰는 것 — 그게 파티셔닝을 잘 쓰는 법의 전부다.

---

## 관련 포스트

- [PostgreSQL 쿼리 플래너와 실행 엔진 (Part 3)](/2026/06/15/postgresql-query-planner/)
- [PostgreSQL MVCC와 VACUUM 내부 동작 (Part 1)](/2026/06/13/postgresql-mvcc-vacuum/)
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
- [MySQL vs PostgreSQL — 백엔드 개발자가 알아야 할 차이](/2026/04/01/mysql-vs-postgresql/)
- [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)
