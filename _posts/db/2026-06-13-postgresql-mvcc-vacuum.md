---
title: "PostgreSQL MVCC와 VACUUM 내부 동작 원리"
subtitle: "튜플 버저닝, 가시성 판정, dead tuple과 bloat, autovacuum, XID wraparound까지"
layout: post
date: "2026-06-13"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, mvcc, vacuum, autovacuum, tuple, xmin, xmax, bloat, wraparound, database"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL의 MVCC 내부 동작을 튜플 버저닝(xmin/xmax), 가시성 판정, dead tuple과 bloat, VACUUM/autovacuum, HOT update, XID wraparound까지 깊이 있게 정리합니다."
---

## 들어가며

PostgreSQL은 락을 거의 쓰지 않고도 "읽기는 쓰기를 막지 않고, 쓰기는 읽기를 막지 않는다"는 동시성 모델을 제공한다. 이 마법의 정체가 바로 **MVCC(Multi-Version Concurrency Control)** — 다중 버전 동시성 제어다.

격리 수준(Read Committed, Repeatable Read 등)이 *논리적으로* 무엇을 보장하는지는 [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)에서 다뤘다. 이 글은 그 한 층 아래, **MVCC가 디스크 위에서 실제로 어떻게 구현되는가**를 파고든다. 모든 행이 들고 다니는 숨은 시스템 컬럼, 죽은 튜플이 쌓여 테이블이 부풀어 오르는 메커니즘, 그리고 그것을 청소하는 VACUUM의 정체까지.

이 글은 **PostgreSQL 마스터** 시리즈의 첫 편으로 MVCC와 VACUUM을 다룬다. 이후 편에서는 [WAL과 크래시 복구](/2026/06/14/postgresql-wal-recovery/), [쿼리 플래너와 실행 엔진](/2026/06/15/postgresql-query-planner/), 락과 동시성 제어, 복제와 고가용성, 커넥션 구조, 파티셔닝을 차례로 거쳐, 마지막엔 Aurora와 Neon 같은 클라우드 서버리스 Postgres가 이 내부 구조를 어떻게 다시 썼는지까지 파헤친다.

> [!NOTE]
> MVCC의 핵심 아이디어는 단순하다. **데이터를 덮어쓰지 않고, 새 버전을 추가한다.** UPDATE는 기존 행을 제자리에서 수정하는 게 아니라, 새 버전 튜플을 만들고 옛 버전은 "더 이상 유효하지 않음"으로 표시할 뿐이다. 이 한 문장에서 이 글의 거의 모든 내용이 파생된다.

---

## 튜플은 버전을 가진다 — xmin과 xmax

PostgreSQL에서 테이블의 한 행(row)은 물리적으로 **튜플(tuple)** 이라는 단위로 힙(heap) 페이지에 저장된다. 그리고 우리가 정의한 컬럼 외에, 모든 튜플은 눈에 보이지 않는 **시스템 컬럼**을 헤더에 달고 있다. 그중 MVCC의 심장은 두 개다.

| 시스템 컬럼 | 의미 |
|------------|------|
| `xmin` | 이 튜플 버전을 **삽입(INSERT)** 한 트랜잭션의 ID |
| `xmax` | 이 튜플 버전을 **삭제/갱신(DELETE/UPDATE)** 한 트랜잭션의 ID (없으면 0) |
| `cmin` | 삽입 트랜잭션 **내부**에서의 커맨드 번호 |
| `cmax` | 삭제 트랜잭션 **내부**에서의 커맨드 번호 |
| `ctid` | 튜플의 물리적 위치 `(페이지 번호, 페이지 내 인덱스)` |

`xmin`과 `xmax`는 실제로 SELECT로 조회할 수 있다.

```sql
CREATE TABLE accounts (id int PRIMARY KEY, balance int);
INSERT INTO accounts VALUES (1, 10000);

SELECT xmin, xmax, ctid, * FROM accounts WHERE id = 1;
```

```
 xmin | xmax | ctid  | id | balance
------+------+-------+----+---------
  742 |    0 | (0,1) |  1 |   10000
```

`xmin = 742`은 "742번 트랜잭션이 이 행을 만들었다"는 뜻이다. `xmax = 0`은 "아직 아무도 이 버전을 지우거나 갱신하지 않았다 = 살아 있는 최신 버전"이라는 뜻이다. `ctid = (0,1)`은 0번 페이지의 1번 슬롯에 있다는 물리 주소다.

### UPDATE는 사실 INSERT + 논리적 DELETE다

이제 핵심이다. 값을 하나 바꿔 보자.

```sql
-- 현재 트랜잭션 ID가 743이라고 가정
UPDATE accounts SET balance = 9000 WHERE id = 1;

SELECT xmin, xmax, ctid, * FROM accounts WHERE id = 1;
```

```
 xmin | xmax | ctid  | id | balance
------+------+-------+----+---------
  743 |    0 | (0,2) |  1 |    9000
```

겉보기엔 그냥 값이 9000으로 바뀐 것 같다. 하지만 물리적으로는 전혀 다른 일이 벌어졌다. 디스크 위에는 지금 **두 개의 튜플**이 존재한다.

| ctid | xmin | xmax | balance | 상태 |
|------|------|------|---------|------|
| (0,1) | 742 | **743** | 10000 | 옛 버전 — 743이 만료시킴 |
| (0,2) | 743 | 0 | 9000 | 새 버전 — 현재 유효 |

UPDATE는 옛 튜플 `(0,1)`을 제자리에서 고치지 않았다. 대신:

1. 옛 튜플의 `xmax`를 **743**으로 채운다 → "743번 트랜잭션 이후로 이 버전은 죽었다"는 표시
2. 새 튜플 `(0,2)`를 만들어 `xmin = 743`, `balance = 9000`으로 기록

DELETE는 더 단순하다. 새 버전을 만들지 않고 기존 튜플의 `xmax`만 채운다. 즉 **PostgreSQL의 DELETE는 데이터를 즉시 지우지 않는다.** 그저 "이 트랜잭션부터는 죽은 것으로 쳐라"고 도장을 찍을 뿐이다.

> [!TIP]
> `cmin`/`cmax`는 **같은 트랜잭션 내부**의 여러 커맨드 사이 가시성을 가른다. 한 트랜잭션이 INSERT 후 같은 행을 UPDATE하면, 첫 커맨드가 만든 버전을 두 번째 커맨드가 봐야 하는지를 커맨드 번호로 판정한다. 트랜잭션 간 가시성은 `xmin`/`xmax`가, 트랜잭션 내 가시성은 `cmin`/`cmax`가 담당한다고 이해하면 된다.

---

## 가시성 판정 — 스냅샷이 진실을 고른다

디스크에 같은 행의 여러 버전이 공존한다면, 내 트랜잭션은 어느 버전을 "진짜"로 봐야 할까? 이 결정을 내리는 것이 **스냅샷(snapshot)** 이다.

스냅샷은 "이 시점에 어떤 트랜잭션이 커밋되어 있었는가"를 담은 사진이다. PostgreSQL은 스냅샷을 세 가지 요소로 표현한다.

```
xmin:xmax:xip_list
```

| 요소 | 의미 |
|------|------|
| `xmin` | 아직 실행 중인 가장 오래된 트랜잭션 ID. 이보다 작은 XID는 **모두 종료**됨 |
| `xmax` | 아직 할당되지 않은 첫 트랜잭션 ID. 이보다 크거나 같은 XID는 **아직 시작 안 됨** |
| `xip_list` | `xmin`과 `xmax` 사이에서 스냅샷 생성 시점에 **실행 중이던** 트랜잭션 ID 목록 |

> [!NOTE]
> 여기서의 `xmin`/`xmax`는 **스냅샷의** 필드이고, 앞 절의 **튜플의** `xmin`/`xmax`와는 다른 개념이다. 이름이 같아 헷갈리기 쉬우니 "스냅샷 xmin"과 "튜플 xmin"을 구분해서 읽자.

현재 스냅샷은 직접 확인할 수 있다.

```sql
SELECT pg_current_snapshot();
```

```
 pg_current_snapshot
---------------------
 742:756:743,748
```

이 스냅샷은 "742 이전은 다 끝났고, 756부터는 아직 안 시작했으며, 그 사이 743과 748은 아직 실행 중"이라는 뜻이다.

### 가시성 규칙

한 튜플 버전이 내 스냅샷에 **보이려면** 두 조건을 모두 만족해야 한다.

1. **삽입이 보여야 한다** — 튜플의 `xmin`(을 만든 트랜잭션)이 **커밋**되었고, 그 커밋이 내 스냅샷 기준 과거여야 한다.
2. **삭제가 안 보여야 한다** — 튜플의 `xmax`가 비어 있거나(0), 아직 커밋되지 않았거나, 내 스냅샷 기준 미래여야 한다.

판정 로직을 의사 결정으로 풀면 이렇다.

```
어떤 XID가 "내 스냅샷에 보이는 커밋"인가?  (전제: 커밋 여부는 clog로 확인)
  XID < snapshot.xmin                → 종료됨 (커밋됐다면 보임)
  XID >= snapshot.xmax               → 안 보임 (아직 시작 안 한 미래)
  XID ∈ snapshot.xip_list            → 안 보임 (생성 시점에 실행 중이었음)
  그 외 (사이에 있고 xip에 없음)      → 커밋됐다면 보임
```

여기서 한 가지 짚을 점이 있다. 스냅샷은 어떤 XID가 **시작했는지/종료됐는지**만 가른다. 그 트랜잭션이 **커밋됐는지 어보트(abort)됐는지**는 스냅샷이 모른다. 그래서 `XID < snapshot.xmin`이라도 그 트랜잭션이 롤백됐다면 그 튜플은 보이면 안 된다. 실제 가시성 판정은 **커밋 로그(clog, `pg_xact`)** 에서 해당 XID의 커밋/어보트 상태를 추가로 확인한 뒤 확정된다. (이 비용을 줄이려고 튜플 헤더에 커밋 여부를 캐싱하는 것이 **힌트 비트**다.)

이 규칙이 격리 수준의 차이를 만든다. **Read Committed**는 매 SQL문마다 새 스냅샷을 뜨므로 그사이 커밋된 변경이 보인다. **Repeatable Read**는 트랜잭션 시작 시점의 스냅샷을 끝까지 고정하므로 중간에 다른 트랜잭션이 커밋해도 보이지 않는다. 같은 튜플 더미를 놓고 **어느 스냅샷으로 바라보느냐**가 다를 뿐, 물리 저장 구조는 동일하다. (격리 수준별 동작의 자세한 예시는 [트랜잭션 격리 수준 글](/2026/04/06/database-transaction-isolation/)을 참고하자.)

핵심은 이것이다. **PostgreSQL은 락 없이도 일관된 읽기를 제공한다.** 읽는 쪽은 자기 스냅샷에 맞는 버전을 고를 뿐, 쓰는 쪽이 만든 새 버전을 무시하면 그만이기 때문이다.

---

## dead tuple과 bloat — 청소하지 않으면 부푼다

여기서 자연스러운 문제가 생긴다. UPDATE와 DELETE가 옛 버전을 물리적으로 지우지 않는다면, 그 죽은 튜플들은 어디로 갈까? **아무 데도 안 간다. 그냥 페이지에 남는다.**

어떤 튜플 버전이 **모든 활성 트랜잭션 어느 누구에게도 더 이상 보이지 않게** 되면, 그것을 **dead tuple(죽은 튜플)** 이라 부른다. 누구의 스냅샷에도 잡히지 않으므로 데이터로서는 무의미하지만, 디스크 공간은 여전히 차지하고 있다.

```sql
-- 한 행을 10만 번 갱신하면?
UPDATE accounts SET balance = balance + 1 WHERE id = 1;  -- × 100000
```

논리적으로 행은 여전히 1개다. 하지만 물리적으로는 dead tuple 10만 개 + live tuple 1개가 쌓인다. 이렇게 죽은 튜플이 누적되어 테이블/인덱스가 실제 데이터량보다 비대해지는 현상이 **bloat(블로트, 부풀음)** 다.

bloat가 나쁜 이유는 명확하다.

- **Seq Scan이 느려진다** — 죽은 튜플까지 디스크에서 읽고 가시성 검사를 거쳐 버려야 한다
- **인덱스도 부푼다** — (HOT이 아닌) 각 새 버전은 인덱스 엔트리를 새로 만든다
- **캐시 효율 저하** — shared_buffers에 쓸모없는 죽은 데이터가 올라온다
- **디스크 사용량 증가** — 안 쓰는 공간이 계속 점유된다

> [!WARNING]
> bloat는 조용히 쌓인다. 갱신/삭제가 잦은 테이블에서 autovacuum이 제때 돌지 못하면, 행 수는 그대로인데 테이블 크기만 몇 배로 불어나는 일이 흔하다. 어느 날 갑자기 느려진 쿼리의 범인이 인덱스가 아니라 bloat인 경우가 많다.

---

## VACUUM — 죽은 튜플을 청소한다

이 죽은 튜플을 회수하는 작업이 **VACUUM**이다. VACUUM은 테이블을 훑으며 "이제 누구에게도 보이지 않는" dead tuple을 찾아 그 공간을 **재사용 가능 상태**로 표시한다.

```sql
VACUUM accounts;            -- 일반 VACUUM
VACUUM VERBOSE accounts;    -- 처리 내역 출력
```

VACUUM이 하는 일을 정리하면 다음과 같다.

1. dead tuple이 차지하던 공간을 **회수**하여 같은 테이블의 미래 INSERT/UPDATE가 쓸 수 있게 한다
2. **Free Space Map(FSM)** 을 갱신해 어느 페이지에 빈 공간이 있는지 기록한다
3. **Visibility Map(VM)** 을 갱신한다
4. 죽은 튜플을 가리키던 **인덱스 엔트리를 제거**한다
5. 필요하면 오래된 튜플을 **FREEZE**한다 (뒤에서 다룸)

### 함정: VACUUM은 보통 디스크를 OS에 돌려주지 않는다

가장 많이 오해하는 지점이다. **일반 VACUUM은 회수한 공간을 운영체제에 반납하지 않는다.** 죽은 튜플 공간을 "이 테이블 안에서 재사용 가능"으로 표시할 뿐, 파일 크기 자체는 거의 줄지 않는다.

즉 100GB까지 부푼 테이블을 VACUUM해도 디스크 사용량은 여전히 100GB에 가깝다. 다만 그 안의 빈 공간을 앞으로의 쓰기가 채워 나가므로 **더 부풀지는 않는다.** bloat를 *제거*한다기보다 *멈춘다*에 가깝다.

(예외: 테이블 **맨 끝**의 페이지들이 통째로 비면 그 부분만 OS에 반환되기도 한다. 하지만 중간에 흩어진 빈 공간은 반환되지 않는다.)

### VACUUM FULL — 진짜로 줄이지만 비싸다

파일 크기까지 실제로 줄이려면 **VACUUM FULL**이 필요하다.

```sql
VACUUM FULL accounts;
```

VACUUM FULL은 살아 있는 튜플만 모아 **테이블을 통째로 새 파일에 다시 쓴다.** 결과적으로 bloat가 사라지고 디스크가 OS로 반환된다. 하지만 대가가 크다.

| 항목 | 일반 VACUUM | VACUUM FULL |
|------|-------------|-------------|
| 락 수준 | `SHARE UPDATE EXCLUSIVE` (읽기/쓰기 동시 가능) | `ACCESS EXCLUSIVE` (테이블 완전 잠금) |
| 디스크 반환 | 거의 안 함 (재사용 표시만) | 함 (테이블 재작성) |
| 추가 공간 | 불필요 | 테이블 크기만큼 임시 공간 필요 |
| 운영 영향 | 낮음 (상시 가능) | 높음 (서비스 중단 수준) |

VACUUM FULL은 테이블을 통째로 잠그기 때문에 운영 중인 서비스에서 함부로 돌리면 안 된다. 무중단으로 bloat를 제거해야 한다면 `pg_repack` 같은 확장이나 테이블 재생성 전략을 검토하는 편이 낫다.

---

## autovacuum — 알아서 청소하는 백그라운드 일꾼

매번 손으로 VACUUM을 돌릴 수는 없다. 그래서 PostgreSQL은 **autovacuum** 데몬을 띄워 테이블별로 죽은 튜플이 충분히 쌓이면 자동으로 VACUUM(과 ANALYZE)을 수행한다.

언제 발동하는지가 핵심이다. autovacuum은 다음 임계값을 넘을 때 트리거된다.

```
vacuum 임계값 = autovacuum_vacuum_threshold
              + autovacuum_vacuum_scale_factor × 테이블의 튜플 수
```

기본값은 다음과 같다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `autovacuum_vacuum_threshold` | 50 | 기본 가산값 (행 수) |
| `autovacuum_vacuum_scale_factor` | 0.2 | 전체 행 수 대비 비율 (20%) |
| `autovacuum_analyze_threshold` | 50 | ANALYZE 기본 가산값 |
| `autovacuum_analyze_scale_factor` | 0.1 | ANALYZE 비율 (10%) |

예를 들어 100만 행 테이블이라면 `50 + 0.2 × 1,000,000 = 200,050` 개의 dead tuple이 쌓여야 autovacuum이 돈다.

> [!TIP]
> 대용량 테이블에서 `scale_factor` 0.2(20%)는 너무 느슨하다. 1억 행이면 2천만 개가 죽어야 청소가 시작된다는 뜻이라 그동안 bloat가 심해진다. 이런 테이블은 테이블 단위로 `scale_factor`를 낮추는 것이 정석이다.
>
> ```sql
> ALTER TABLE big_table SET (
>     autovacuum_vacuum_scale_factor = 0.02,   -- 2%로 강화
>     autovacuum_vacuum_threshold = 1000
> );
> ```

PostgreSQL 13부터는 INSERT만 일어나는 테이블을 위한 `autovacuum_vacuum_insert_threshold`(기본 1000)도 추가되어, 갱신/삭제가 없어도 가시성 맵 유지와 FREEZE를 위해 주기적으로 VACUUM이 돌도록 개선됐다.

---

## HOT update — 인덱스를 건드리지 않는 갱신

UPDATE가 매번 새 튜플과 새 인덱스 엔트리를 만든다면, 인덱스 bloat가 빠르게 누적될 것이다. PostgreSQL은 이를 완화하기 위해 **HOT(Heap-Only Tuple) update** 최적화를 둔다.

HOT update는 두 조건이 맞을 때 발동한다.

1. **갱신된 컬럼 중 인덱스가 걸린 컬럼이 없다** (인덱스 키가 안 바뀜)
2. 새 버전이 **같은 페이지 안**에 들어갈 빈 공간이 있다

이 조건이 맞으면, 새 튜플을 같은 페이지에 만들되 **인덱스 엔트리는 새로 만들지 않는다.** 대신 옛 튜플의 `ctid`가 같은 페이지의 새 튜플을 가리키는 **HOT 체인**을 만든다. 인덱스는 여전히 옛 튜플을 가리키지만, 거기서 체인을 따라가면 최신 버전에 도달한다.

```sql
-- balance에는 인덱스가 없다고 가정 → HOT 가능
UPDATE accounts SET balance = balance - 100 WHERE id = 1;

-- email에 인덱스가 있고 email을 바꾼다면 → HOT 불가, 인덱스 엔트리 새로 생성
UPDATE accounts SET email = 'new@x.com' WHERE id = 1;
```

HOT의 이점은 두 가지다. **인덱스 쓰기 비용이 사라지고**, 죽은 HOT 튜플은 VACUUM을 기다리지 않고도 일반 페이지 접근 중에 가볍게 정리(HOT pruning)될 수 있다. 따라서 자주 갱신되는 컬럼에 불필요한 인덱스를 걸지 않는 것만으로도 HOT 비율이 올라가 성능과 bloat 모두 좋아진다.

```sql
-- HOT update가 얼마나 일어나는지 확인
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_ratio
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY n_tup_upd DESC;
```

`hot_ratio`가 높을수록 좋다. 이 값이 낮다면 자주 갱신하는 컬럼에 인덱스가 걸려 있거나, 페이지에 빈 공간(`fillfactor`)이 부족한 것이다.

---

## Visibility Map과 Free Space Map

VACUUM 효율과 가시성 판정을 떠받치는 두 개의 보조 자료구조가 있다. 각각 테이블 옆에 별도 파일(fork)로 저장된다.

### Visibility Map (VM)

페이지 단위로 두 개의 비트를 관리한다.

- **all-visible 비트**: 이 페이지의 **모든 튜플이 모든 트랜잭션에 보인다**(죽은 튜플 없음, 진행 중 트랜잭션과 무관) — 이 비트가 켜진 페이지는 VACUUM이 건너뛸 수 있다
- **all-frozen 비트**: 이 페이지의 모든 튜플이 **FREEZE**되어 있다 — anti-wraparound VACUUM도 건너뛸 수 있다

VM은 두 가지를 가속한다. 첫째, **VACUUM이 변경 없는 페이지를 통째로 스킵**하게 해 청소 비용을 크게 줄인다. 둘째, **Index-Only Scan**을 가능하게 한다. 인덱스만 읽고 힙은 안 읽어도 되는 쿼리에서, 해당 페이지가 all-visible이면 가시성 확인을 위한 힙 접근(heap fetch)을 생략할 수 있다. (Index-Only Scan은 [인덱스 글](/2026/03/25/postgresql-index/)과 3부 [쿼리 플래너](/2026/06/15/postgresql-query-planner/)에서 더 다룬다.)

### Free Space Map (FSM)

각 페이지에 **얼마나 빈 공간이 남았는지**를 기록한다. INSERT나 non-HOT UPDATE로 새 튜플을 넣을 자리를 찾을 때, PostgreSQL은 FSM을 보고 충분한 공간이 있는 페이지를 골라 재사용한다. VACUUM이 회수한 공간이 "테이블 안에서 재사용된다"고 했던 그 메커니즘의 실체가 바로 FSM이다.

---

## FREEZE와 트랜잭션 ID Wraparound

MVCC를 끝까지 이해하려면 마지막 관문, **트랜잭션 ID wraparound(XID 순환)** 를 알아야 한다. 이건 단순한 성능 문제가 아니라 **데이터 손실로 이어질 수 있는** 위험이다.

### 32비트의 함정

트랜잭션 ID(XID)는 **32비트** 정수다. 즉 약 42억(2³²) 개를 쓰면 0으로 되돌아간다(wraparound). PostgreSQL의 가시성 판정은 "이 XID가 내 XID보다 과거인가 미래인가"를 비교하는데, XID 공간을 **원형**으로 보고 임의의 XID 기준 **약 21억 개는 과거, 약 21억 개는 미래**로 해석한다.

문제는 여기서 발생한다. 시간이 흘러 XID가 계속 소비되면, 아주 오래전에 삽입된 튜플의 `xmin`이 어느 순간 "21억 개 미래"로 넘어가 버린다. 그러면 **분명히 과거에 커밋된 행이 갑자기 미래의 것으로 보여 사라진다.** 데이터가 통째로 안 보이게 되는 재앙이다.

### FREEZE — "이건 영원히 과거다"라는 도장

이를 막는 장치가 **FREEZE(동결)** 다. VACUUM은 충분히 오래된 튜플을 발견하면 그 튜플을 **frozen**으로 표시한다. frozen 튜플의 `xmin`은 XID 비교를 거치지 않고 **무조건 "모두에게 보이는 과거"** 로 취급된다. 따라서 XID가 아무리 순환해도 동결된 행은 영향을 받지 않는다.

> [!NOTE]
> 예전(9.4 이전) 버전은 동결 시 튜플의 `xmin`을 특수값 `FrozenTransactionId(2)`로 덮어썼지만, 지금은 원래 `xmin`을 보존한 채 튜플 헤더의 **힌트 비트**로 frozen 여부를 표시한다. 그래서 `SELECT xmin`으로 봤을 때 동결된 행도 원래 트랜잭션 ID가 그대로 보인다.

동결을 제어하는 주요 파라미터는 다음과 같다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `vacuum_freeze_min_age` | 5천만 | 이보다 오래된 튜플은 VACUUM 중 동결 |
| `autovacuum_freeze_max_age` | 2억 | 테이블의 최고령 XID가 이 나이를 넘으면 **강제 anti-wraparound VACUUM** 발동 |
| `vacuum_failsafe_age` | 16억 | 위험이 임박하면 인덱스 정리를 건너뛰고 동결에만 집중 |

`autovacuum_freeze_max_age`가 핵심이다. autovacuum이 꺼져 있어도, 테이블의 가장 오래된 동결되지 않은 XID의 나이가 2억을 넘으면 PostgreSQL은 **강제로** anti-wraparound VACUUM을 돌린다. 이건 끌 수 없는 안전장치다.

### 위험 신호와 진단

wraparound가 정말 임박하면(남은 XID가 약 300만 개 수준) PostgreSQL은 데이터 보호를 위해 **새 트랜잭션 자체를 거부**한다.

```
ERROR: database is not accepting commands to avoid wraparound data loss in database "mydb"
HINT: Stop the postmaster and vacuum that database in single-user mode.
```

이 지경까지 가면 서비스가 멈추므로, 평소에 XID 나이를 모니터링해야 한다.

```sql
-- 데이터베이스별 XID 나이 (2억 근처면 경계, 10억 넘으면 위험)
SELECT datname,
       age(datfrozenxid) AS xid_age,
       2147483648 - age(datfrozenxid) AS xids_left
FROM pg_database
ORDER BY xid_age DESC;

-- 동결이 가장 시급한 테이블 Top 10
SELECT relname, age(relfrozenxid) AS xid_age
FROM pg_class
WHERE relkind = 'r'
ORDER BY xid_age DESC
LIMIT 10;
```

> [!WARNING]
> 대량 적재(bulk load)나 매우 잦은 쓰기로 XID를 빠르게 소비하는 시스템, 또는 autovacuum을 임의로 꺼 둔 시스템에서 wraparound 사고가 난다. **autovacuum은 끄지 말자.** 정 부담되면 임계값을 조정할 일이지 비활성화할 일이 아니다.

---

## 실무 진단 — pg_stat_user_tables 읽기

지금까지의 개념을 실무에서 진단하는 핵심 뷰가 **`pg_stat_user_tables`** 다. 죽은 튜플과 autovacuum 동작을 한눈에 볼 수 있다.

```sql
SELECT
    relname,
    n_live_tup,                              -- 살아 있는 튜플 수
    n_dead_tup,                              -- 죽은 튜플 수
    round(100.0 * n_dead_tup
          / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_ratio,
    last_autovacuum,                         -- 마지막 autovacuum 시각
    last_autoanalyze,                        -- 마지막 autoanalyze 시각
    autovacuum_count                         -- autovacuum 누적 횟수
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

```
   relname   | n_live_tup | n_dead_tup | dead_ratio |    last_autovacuum     | autovacuum_count
-------------+------------+------------+------------+------------------------+------------------
 orders      |    1284301 |     312880 |       19.6 | 2026-06-13 02:14:07+09 |              412
 payments    |     843120 |       1204 |        0.1 | 2026-06-13 09:02:31+09 |              198
 audit_logs  |   18230011 |    4521900 |       19.9 | 2026-06-11 23:51:10+09 |               12
```

읽는 법은 이렇다.

- **`dead_ratio`가 높다(20% 근처 이상)** → bloat가 쌓이는 중. `audit_logs`처럼 거대한데 autovacuum 간격이 길면(`autovacuum_count`가 적으면) `scale_factor`를 낮춰야 한다
- **`last_autovacuum`이 오래전** → autovacuum이 임계값에 도달하지 못하거나, 워커가 부족하거나, long-running 트랜잭션이 청소를 막고 있을 수 있다
- **`n_dead_tup`이 계속 증가만 함** → VACUUM이 죽은 튜플을 회수하지 못하는 상황. 십중팔구 **오래 살아 있는 트랜잭션** 때문이다

마지막 항목은 중요하다. VACUUM은 **모든 활성 트랜잭션 중 가장 오래된 스냅샷보다 과거인** 튜플만 죽었다고 판정할 수 있다. 따라서 누군가 트랜잭션을 열어 둔 채 몇 시간씩 방치하면(예: 커밋 안 한 세션, 유휴 `idle in transaction`), 그동안 만들어진 죽은 튜플을 **어떤 VACUUM도 회수하지 못한다.** bloat의 흔한 진범이다.

```sql
-- 오래 떠 있는 트랜잭션 찾기 (VACUUM을 막는 범인)
SELECT pid, state, now() - xact_start AS xact_age, query
FROM pg_stat_activity
WHERE state <> 'idle' AND xact_start IS NOT NULL
ORDER BY xact_age DESC
LIMIT 5;
```

> [!TIP]
> `idle in transaction` 세션이 bloat의 원인인 경우가 정말 많다. 애플리케이션에서 트랜잭션을 짧게 유지하고, `idle_in_transaction_session_timeout`을 설정해 방치된 트랜잭션을 자동 종료하면 VACUUM이 제 일을 할 수 있다.

---

## 정리

1. PostgreSQL의 MVCC는 **데이터를 덮어쓰지 않고 새 버전을 추가**하는 방식이다. UPDATE는 사실상 새 튜플 INSERT + 옛 튜플의 `xmax` 표시이고, DELETE는 `xmax`만 채운다.
2. 모든 튜플은 **`xmin`(삽입 트랜잭션)과 `xmax`(삭제/갱신 트랜잭션)** 를 헤더에 들고 다닌다. 어떤 버전이 보이는지는 **스냅샷(`xmin:xmax:xip`)** 의 가시성 규칙이 결정한다.
3. 옛 버전이 누구에게도 안 보이게 되면 **dead tuple**이 되고, 쌓이면 테이블/인덱스가 부푸는 **bloat**가 된다.
4. **VACUUM**은 죽은 튜플 공간을 회수하지만 보통 OS에 디스크를 반환하지 않는다(재사용 표시만). 파일 크기까지 줄이려면 테이블을 잠그는 **VACUUM FULL**이 필요하다.
5. **autovacuum**은 `threshold + scale_factor × 행 수`를 넘으면 자동으로 돈다. 대용량 테이블은 `scale_factor`를 낮춰 더 자주 청소하게 하자.
6. **HOT update**는 인덱스 컬럼을 안 바꾸고 같은 페이지에 여유가 있으면 인덱스 엔트리 없이 갱신해 bloat를 줄인다.
7. **FREEZE**는 오래된 튜플을 "영원한 과거"로 표시해 **XID wraparound**(약 21억 한계)로 인한 데이터 실종을 막는다. **autovacuum을 끄지 말자.**
8. 진단은 **`pg_stat_user_tables`의 `n_dead_tup`, `last_autovacuum`** 으로 시작하고, bloat가 안 줄면 **오래 살아 있는 트랜잭션**부터 의심하자.

---

## 관련 포스트

- [PostgreSQL WAL과 크래시 복구 (PostgreSQL 마스터 2부)](/2026/06/14/postgresql-wal-recovery/)
- [PostgreSQL 쿼리 플래너와 실행 엔진 (PostgreSQL 마스터 3부)](/2026/06/15/postgresql-query-planner/)
- [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
