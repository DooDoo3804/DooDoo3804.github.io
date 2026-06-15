---
title: "PostgreSQL 락과 동시성 제어 내부 동작"
subtitle: "테이블/로우 락 모드, 호환성 매트릭스, pg_locks, 데드락 탐지, SKIP LOCKED 작업 큐"
layout: post
date: "2026-06-16"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, lock, concurrency, pg_locks, deadlock, skip locked, advisory lock, for update, database"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL의 락 모드와 동시성 제어를 테이블/로우 락 8종·4종, 호환성 매트릭스, pg_locks 관찰, 데드락 탐지, advisory lock, SKIP LOCKED 작업 큐까지 깊이 있게 정리합니다."
---

## 들어가며

[Part 1: MVCC와 VACUUM](/2026/06/13/postgresql-mvcc-vacuum/)에서 PostgreSQL이 락 없이도 일관된 읽기를 제공하는 원리를 봤다. MVCC 덕분에 **읽기는 쓰기를 막지 않고, 쓰기는 읽기를 막지 않는다.** 그렇다면 PostgreSQL에는 락이 필요 없을까?

전혀 아니다. MVCC는 **읽기-쓰기** 충돌만 비차단으로 해결한다. **쓰기-쓰기** 충돌, 즉 두 트랜잭션이 같은 행을 동시에 갱신하려는 상황은 결국 한쪽이 기다려야 한다. 또 스키마를 바꾸거나(DDL), 애플리케이션 차원에서 "이 작업은 한 번에 하나만"을 강제하려면 명시적인 락이 필요하다. **MVCC와 명시적 락은 서로를 대체하는 게 아니라 다른 층위에서 협력한다.**

이 글은 **PostgreSQL 마스터** 시리즈 4부로, PostgreSQL의 락이 실제로 어떤 모드로 나뉘고, 무엇이 무엇과 충돌하며, 어떻게 관찰·진단하는지를 파고든다. 데드락이나 낙관적/비관적 락의 *개념*은 [트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/) 글에서 다뤘으니, 여기서는 **PostgreSQL의 실제 락 모드와 매트릭스, pg_locks, SKIP LOCKED 실전**에 집중한다.

> [!NOTE]
> 핵심 구분부터 잡자. PostgreSQL의 락은 크게 **테이블 레벨 락**(객체 전체에 대한 락)과 **로우 레벨 락**(개별 행에 대한 락) 두 층위로 나뉜다. 여기에 테이블/행과 무관한 **advisory lock**(애플리케이션 정의 락)이 더해진다. 대부분의 명령은 우리가 의식하지 않아도 적절한 락을 **자동으로** 잡는다.

---

## 테이블 레벨 락 8종

PostgreSQL은 테이블 레벨에서 무려 **8가지** 락 모드를 정의한다. 이름이 비슷해 헷갈리지만, "어떤 명령이 잡는가"를 기준으로 보면 정리된다.

| 락 모드 | 대표적으로 잡는 명령 |
|---------|---------------------|
| `ACCESS SHARE` | `SELECT` |
| `ROW SHARE` | `SELECT ... FOR UPDATE/SHARE` |
| `ROW EXCLUSIVE` | `INSERT`, `UPDATE`, `DELETE`, `MERGE` |
| `SHARE UPDATE EXCLUSIVE` | `VACUUM`(FULL 아님), `ANALYZE`, `CREATE INDEX CONCURRENTLY` |
| `SHARE` | `CREATE INDEX`(CONCURRENTLY 아님) |
| `SHARE ROW EXCLUSIVE` | `CREATE TRIGGER`, 일부 `ALTER TABLE` |
| `EXCLUSIVE` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| `ACCESS EXCLUSIVE` | `DROP TABLE`, `TRUNCATE`, `REINDEX`, `VACUUM FULL`, 대부분의 `ALTER TABLE`, `LOCK TABLE` 기본값 |

이름의 규칙을 알면 외우기 쉽다. **SHARE** 계열은 동시 읽기를 허용하는 약한 락, **EXCLUSIVE** 계열은 배타적인 강한 락이다. **ROW**가 붙으면 "행을 건드리는 작업과 관련"이라는 뉘앙스다. 가장 약한 것이 `ACCESS SHARE`(단순 읽기), 가장 강한 것이 `ACCESS EXCLUSIVE`(다른 모든 락과 충돌)다.

### 호환성 매트릭스

두 락 모드가 같은 테이블에서 **공존할 수 있는지**를 정리한 것이 호환성 매트릭스다. `✓`는 공존 가능(호환), `✗`는 충돌(한쪽이 대기)을 뜻한다. 열·행 모두 위 8종을 약자로 표기했다.

| 보유 ↓ \ 요청 → | AS | RS | RE | SUE | S | SRE | E | AE |
|----------------|----|----|----|-----|---|-----|---|----|
| ACCESS SHARE (AS) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| ROW SHARE (RS) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| ROW EXCLUSIVE (RE) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| SHARE UPDATE EXCL (SUE) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| SHARE (S) | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| SHARE ROW EXCL (SRE) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| EXCLUSIVE (E) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| ACCESS EXCLUSIVE (AE) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

이 표에서 읽어낼 실무 포인트가 있다.

- **`ACCESS SHARE`는 `ACCESS EXCLUSIVE`하고만 충돌한다.** 즉 단순 `SELECT`는 `DROP`/`TRUNCATE`/대부분의 `ALTER TABLE` 같은 강한 DDL하고만 부딪힌다. 평범한 읽기끼리, 그리고 읽기와 `INSERT/UPDATE/DELETE`(ROW EXCLUSIVE)는 서로 막지 않는다 — 이것이 MVCC의 일상적 모습이다.
- **`ROW EXCLUSIVE`끼리는 호환된다.** 그래서 여러 트랜잭션이 *서로 다른 행*에 동시에 `UPDATE`할 수 있다. *같은 행*에 대한 경합은 테이블 락이 아니라 뒤에서 볼 **로우 레벨 락**이 처리한다.
- **`ACCESS EXCLUSIVE`는 모든 것과 충돌한다.** 운영 중 테이블에 `ALTER TABLE`을 거는 일이 위험한 이유다. 이 락을 잡으려고 대기하는 순간, 그 뒤로 들어오는 평범한 `SELECT`까지 줄줄이 막힐 수 있다.

> [!WARNING]
> 운영 DB에 `ALTER TABLE`을 걸 때는 `ACCESS EXCLUSIVE`를 얼마나, 언제 잡는지 반드시 확인하자. 예컨대 `lock_timeout`을 짧게 설정하지 않고 DDL을 던졌다가, 앞선 긴 트랜잭션이 락을 안 놓아 DDL이 대기하고, 그 DDL 뒤에 모든 쿼리가 쌓여 서비스가 멈추는 사고가 흔하다. (`lock_timeout`은 뒤에서 다룬다.)

### LOCK TABLE — 명시적 테이블 락

필요하면 `LOCK TABLE`로 직접 잡을 수도 있다.

```sql
BEGIN;
LOCK TABLE accounts IN SHARE MODE;   -- 모드를 명시하지 않으면 ACCESS EXCLUSIVE
-- ... 작업 ...
COMMIT;  -- 락은 트랜잭션 종료 시 해제
```

모든 락은 **트랜잭션이 끝날 때(COMMIT/ROLLBACK)** 자동으로 해제된다. 트랜잭션 도중에 일부 락만 골라 푸는 것은 (advisory lock을 제외하면) 불가능하다.

> [!TIP]
> PostgreSQL은 **락 에스컬레이션(lock escalation)이 없다.** SQL Server처럼 "행 락이 많아지면 테이블 락으로 승격"하는 동작이 없다는 뜻이다. 따라서 수백만 행을 `FOR UPDATE`로 잠가도 갑자기 테이블 전체가 잠기는 일은 없다. 대신 로우 락이 어디에 저장되는지가 중요해지는데, 이는 다음 절에서 본다.

---

## 로우 레벨 락 4종

같은 행을 동시에 수정하려는 경합은 **로우 레벨 락**이 조정한다. PostgreSQL은 9.3부터 행 락을 네 가지 강도로 세분화했다. 강한 순서대로다.

| 락 모드 | 획득 방법 | 강도 |
|---------|----------|------|
| `FOR UPDATE` | `SELECT ... FOR UPDATE`, `DELETE`, 키 컬럼을 바꾸는 `UPDATE` | 가장 강함 |
| `FOR NO KEY UPDATE` | 키가 아닌 컬럼만 바꾸는 `UPDATE`, `SELECT ... FOR NO KEY UPDATE` | 중간 |
| `FOR SHARE` | `SELECT ... FOR SHARE` | 공유 |
| `FOR KEY SHARE` | `SELECT ... FOR KEY SHARE`, **외래 키 검사** | 가장 약함 |

핵심은 `FOR NO KEY UPDATE`와 `FOR KEY SHARE`가 9.3에서 추가된 이유다. **외래 키 검사**(자식 행이 부모 행을 참조할 때)는 부모 행의 *키 컬럼*만 안 바뀌면 된다. 그래서 FK 검사는 부모 행에 `FOR KEY SHARE`라는 약한 락만 건다. 이렇게 하면 부모 행의 *키가 아닌* 컬럼을 갱신하는 `UPDATE`(이것은 `FOR NO KEY UPDATE`를 잡는다)와 **충돌하지 않아** 동시성이 크게 개선된다.

### 로우 락 호환성 매트릭스

| 보유 ↓ \ 요청 → | FOR KEY SHARE | FOR SHARE | FOR NO KEY UPDATE | FOR UPDATE |
|----------------|:-:|:-:|:-:|:-:|
| FOR KEY SHARE | ✓ | ✓ | ✓ | ✗ |
| FOR SHARE | ✓ | ✓ | ✗ | ✗ |
| FOR NO KEY UPDATE | ✓ | ✗ | ✗ | ✗ |
| FOR UPDATE | ✗ | ✗ | ✗ | ✗ |

읽는 법: `FOR KEY SHARE`는 `FOR UPDATE`하고만 충돌한다. `FOR SHARE` 둘은 공존한다(여러 트랜잭션이 같은 행을 읽기 잠금). `FOR UPDATE`는 무엇과도 공존하지 못한다.

```sql
-- TX1: 이 행을 갱신할 거니까 선점
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;

-- TX2: 같은 행에 FOR UPDATE 시도 → TX1이 커밋/롤백할 때까지 대기
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- 블로킹
```

### 로우 락은 어디에 저장되는가 — multixact

여기가 PostgreSQL의 묘미다. 테이블 락은 공유 메모리의 **락 매니저(lock manager)** 테이블에 저장되지만, **로우 락은 메모리가 아니라 튜플 자체에 기록된다.** [Part 1](/2026/06/13/postgresql-mvcc-vacuum/)에서 본 튜플 헤더의 `xmax` 필드와 정보 비트(infomask)에 "이 행은 누가 잠갔다"가 새겨진다.

이 설계 덕분에 행을 아무리 많이 잠가도 **락 메모리가 고갈되지 않는다.** 락 에스컬레이션이 필요 없는 이유이기도 하다.

그런데 문제가 하나 있다. `xmax`는 트랜잭션 ID 하나만 담을 수 있는데, **여러 트랜잭션이 같은 행에 `FOR SHARE`/`FOR KEY SHARE`를 동시에** 걸면 어떻게 할까? 이때 PostgreSQL은 **MultiXact ID(다중 트랜잭션 ID)** 를 발급해 `xmax`에 넣고, 실제 잠근 트랜잭션 목록은 별도 영역에 저장한다.

> [!WARNING]
> MultiXact ID도 [Part 1의 XID](/2026/06/13/postgresql-mvcc-vacuum/)처럼 32비트라 **wraparound 위험**이 있다. 공유 락(FK가 많은 스키마 등)이 폭발적으로 쌓이는 워크로드에서는 `autovacuum_multixact_freeze_max_age`(기본 4억)에 도달해 anti-wraparound autovacuum이 강제로 도는 일이 생긴다. `pg_stat_activity`에서 `MultiXact` 관련 대기가 보이면 이 신호를 의심하자.

---

## 락 대기와 큐

락 요청이 이미 잡힌(또는 먼저 대기 중인) 충돌 락과 부딪히면, 요청자는 **대기 큐**에 들어가 기다린다. PostgreSQL의 대기 큐는 대체로 **선입선출(FIFO)** 로 동작한다.

여기서 중요한 안전장치가 있다. 새 락 요청은 이미 **대기 중인** 요청과도 충돌하면 그 뒤에 줄을 선다. 이렇게 하지 않으면, 강한 락을 기다리는 트랜잭션 앞으로 약한 락 요청이 계속 끼어들어 강한 락이 영원히 못 잡는 **기아(starvation)** 가 생길 수 있기 때문이다.

```
테이블 accounts에 대한 대기 큐 (예시)
  [보유] TX_A: ACCESS SHARE (긴 SELECT 진행 중)
  [대기] TX_B: ACCESS EXCLUSIVE (ALTER TABLE)  ← TX_A와 충돌, 대기
  [대기] TX_C: ACCESS SHARE (평범한 SELECT)    ← 본래 A와는 호환되지만,
                                                  앞의 B와 충돌해 함께 대기
```

위 예시가 운영 사고의 전형이다. 가벼운 `SELECT`(TX_C)는 진행 중인 `SELECT`(TX_A)와 아무 문제가 없는데도, 그 사이에 낀 `ALTER TABLE`(TX_B) 때문에 줄줄이 막힌다. **DDL 하나가 읽기 트래픽 전체를 멈추는** 구조다.

---

## pg_locks로 락 관찰하기

현재 어떤 락이 잡혀 있고 누가 대기 중인지는 **`pg_locks`** 뷰로 들여다본다.

```sql
SELECT locktype, relation::regclass AS table, mode, granted, pid
FROM pg_locks
WHERE relation = 'accounts'::regclass
ORDER BY granted DESC;
```

```
  locktype  |  table   |        mode         | granted |  pid
------------+----------+---------------------+---------+-------
 relation   | accounts | AccessShareLock     | t       | 12345
 relation   | accounts | AccessExclusiveLock | f       | 12346
```

`granted = t`는 락을 획득한 것, `granted = f`는 **대기 중**이라는 뜻이다. 위 결과는 12346 프로세스가 `ACCESS EXCLUSIVE`를 기다리고 있음을 보여준다.

누가 누구를 막고 있는지는 `pg_blocking_pids()`로 한 번에 찾는 게 편하다.

```sql
SELECT
    blocked.pid              AS blocked_pid,
    blocked.query            AS blocked_query,
    blocking.pid             AS blocking_pid,
    blocking.query           AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking
     ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

이 쿼리는 "대기 중인 세션과 그 세션을 막고 있는 세션의 쿼리"를 짝지어 보여준다. 락 경합 장애가 터졌을 때 가장 먼저 돌릴 진단 쿼리다.

> [!TIP]
> `pg_locks`의 `locktype`은 `relation`(테이블/인덱스), `tuple`(특정 행), `transactionid`/`virtualxid`(트랜잭션 ID 락), `advisory`(advisory lock) 등으로 구분된다. 로우 락 경합은 종종 `transactionid` 락의 대기로 나타난다 — 한 트랜잭션이 상대 트랜잭션의 **종료**를 기다리는 형태이기 때문이다.

---

## 데드락 탐지

두 트랜잭션이 서로가 쥔 락을 기다리면 영원히 풀리지 않는 **데드락(교착)** 이 된다(개념과 예방 전략은 [격리 수준 글](/2026/04/06/database-transaction-isolation/)에서 다뤘다). 여기서는 PostgreSQL이 *실제로 어떻게 탐지하는가*를 본다.

PostgreSQL은 데드락을 **상시 감시하지 않는다.** 검사 비용이 아깝기 때문이다. 대신 어떤 트랜잭션이 락을 기다리기 시작하면, **`deadlock_timeout`(기본 1초)** 만큼 일단 기다린다. 그 시간이 지나도 락을 못 얻으면, 그제서야 **wait-for 그래프**(누가 누구를 기다리는가)를 그려 **사이클(순환)** 이 있는지 검사한다.

```
TX1: id=1 락 보유 → id=2 락 대기 (TX2가 보유)
TX2: id=2 락 보유 → id=1 락 대기 (TX1이 보유)
→ wait-for 그래프에 사이클 발견 → 데드락!
```

사이클이 발견되면 PostgreSQL은 **한쪽 트랜잭션을 강제로 abort(롤백)** 시켜 교착을 깬다. 희생된 쪽은 다음 에러를 받는다.

```
ERROR:  deadlock detected
DETAIL:  Process 12345 waits for ShareLock on transaction 67890;
         blocked by process 67891.
         Process 67891 waits for ShareLock on transaction 12345;
         blocked by process 12345.
HINT:  See server log for query details.
```

여기서 `deadlock_timeout`은 "데드락이 풀리는 데 걸리는 시간"이 아니라 "데드락인지 **검사를 시작하기까지** 기다리는 시간"임에 주의하자. 대부분의 락 대기는 데드락이 아니라 곧 풀리므로, 1초를 먼저 기다려 불필요한 그래프 검사를 피하는 설계다.

> [!NOTE]
> 데드락은 애플리케이션이 **락 획득 순서**를 통일하면 대부분 예방된다. 예컨대 항상 작은 ID부터 잠그면 위 예시의 순환이 생기지 않는다. 구체적 전략은 [격리 수준 글](/2026/04/06/database-transaction-isolation/)의 "데드락 예방" 절을 참고하자.

---

## lock_timeout과 statement_timeout

락을 무한정 기다리지 않도록 제한하는 두 파라미터가 있다. 이름이 비슷하지만 동작이 다르다.

| 파라미터 | 무엇을 제한하나 | 초과 시 |
|----------|----------------|---------|
| `lock_timeout` | **락 획득 대기** 시간 | 락을 기다리다 초과하면 해당 문장만 에러 |
| `statement_timeout` | **문장 전체 실행** 시간 | 실행이 길어지면(락과 무관해도) 에러 |
| `deadlock_timeout` | 데드락 **검사 시작**까지 대기 | 검사 수행(에러는 데드락일 때만) |

```sql
-- 운영 DDL의 모범 패턴: 락을 3초 이상 못 잡으면 깔끔히 포기
SET lock_timeout = '3s';
ALTER TABLE accounts ADD COLUMN memo text;
-- 실패하면: ERROR: canceling statement due to lock timeout
```

`lock_timeout`을 짧게 걸고 DDL을 던지면, 앞선 긴 트랜잭션 때문에 락을 못 잡을 때 **대기 큐를 막는 대신 바로 실패**한다. 그러면 뒤따르는 평범한 쿼리들이 줄줄이 막히는 사고를 막을 수 있다. 실패하면 잠시 후 재시도하면 된다.

---

## Advisory Lock — 애플리케이션 정의 락

테이블이나 행과 무관하게, **애플리케이션이 의미를 부여하는 임의의 락**이 필요할 때가 있다. "이 배치 작업은 전 서버에서 한 번에 하나만", "이 사용자 계정에 대한 정산은 동시에 하나만" 같은 요구다. PostgreSQL은 이를 위해 **advisory lock**을 제공한다.

키는 64비트 정수 하나(또는 32비트 두 개)로 지정한다. 두 가지 수명이 있다.

| 함수 | 수명 | 해제 |
|------|------|------|
| `pg_advisory_lock(key)` | **세션** 단위 | `pg_advisory_unlock(key)` 또는 세션 종료 |
| `pg_advisory_xact_lock(key)` | **트랜잭션** 단위 | 트랜잭션 종료 시 자동 (수동 해제 불가) |

블로킹 없이 시도만 하려면 `try` 계열을 쓴다. 즉시 `true`/`false`를 반환한다.

```sql
-- 워커가 잡을 수 있으면 잡고, 이미 누가 잡았으면 즉시 false
SELECT pg_try_advisory_lock(42);

-- 트랜잭션 종료 시 자동 해제되는 버전 (해제를 깜빡할 위험이 없어 권장)
BEGIN;
SELECT pg_try_advisory_xact_lock(42);
-- ... 단독 작업 ...
COMMIT;  -- 여기서 자동 해제
```

> [!TIP]
> advisory lock은 "**권고**(advisory)"라는 이름대로, PostgreSQL이 강제로 데이터 접근을 막아주지는 않는다. 약속한 코드들이 모두 같은 키로 락을 잡아야 의미가 있다. 분산 환경에서 별도 락 서버(Redis 등) 없이 **DB만으로 가벼운 뮤텍스**를 구현할 때 특히 유용하다. 단, 잡힌 advisory lock도 `pg_locks`(locktype='advisory')에 보이므로 모니터링이 된다.

---

## SELECT ... FOR UPDATE SKIP LOCKED — 작업 큐 패턴

락 글의 하이라이트다. 여러 워커가 하나의 `jobs` 테이블에서 일감을 꺼내 처리하는 **작업 큐**를 DB만으로 안전하게 구현하는 법이다.

순진하게 `SELECT ... FOR UPDATE LIMIT 1`을 여러 워커가 돌리면, 모두 같은(가장 앞선) 행을 노리다가 한 워커만 잡고 나머지는 **대기**한다. 직렬화되어 병렬성이 사라진다. 여기서 **`SKIP LOCKED`** 가 등장한다.

`SKIP LOCKED`는 "이미 잠긴 행은 **기다리지 말고 건너뛰라**"는 옵션이다. 그래서 각 워커는 다른 워커가 잡지 않은 *다음* 행을 집어 든다. 경합도, 중복 처리도 없다.

```sql
-- 각 워커가 실행: 안 잠긴 가장 오래된 pending 작업 1건을 원자적으로 선점
WITH next_job AS (
    SELECT id
    FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED      -- 핵심: 잠긴 행은 건너뜀
    LIMIT 1
)
UPDATE jobs AS j
SET status = 'processing', picked_at = now()
FROM next_job
WHERE j.id = next_job.id
RETURNING j.*;
```

이 한 쿼리가 보장하는 것:

1. **중복 처리 없음** — 한 행은 한 워커만 잠그므로 두 워커가 같은 작업을 가져가지 않는다
2. **대기 없음** — 잠긴 행을 건너뛰므로 워커들이 서로 기다리지 않는다 (높은 처리량)
3. **원자성** — `FOR UPDATE`로 선점하고 같은 트랜잭션에서 `status`를 바꾸므로, 선점과 상태 변경 사이에 끼어들 틈이 없다

`SKIP LOCKED`의 형제로 **`NOWAIT`** 도 있다. 차이는 명확하다.

| 옵션 | 잠긴 행을 만나면 | 용도 |
|------|----------------|------|
| (기본) | 잠금이 풀릴 때까지 **대기** | 반드시 그 행을 처리해야 할 때 |
| `SKIP LOCKED` | 그 행을 **건너뜀**(결과에서 제외) | 작업 큐 — 아무 일감이나 하나 |
| `NOWAIT` | 즉시 **에러** | 빠른 실패가 필요할 때 |

> [!NOTE]
> `SKIP LOCKED`가 등장하기 전에는 작업 큐를 위해 RabbitMQ·Kafka 같은 별도 메시지 브로커를 두거나, 복잡한 상태 플래그와 폴링을 직접 구현해야 했다. 트래픽이 아주 크지 않다면, **PostgreSQL 한 대로 신뢰성 있는 작업 큐**를 만들 수 있다는 점은 백엔드 설계에서 꽤 강력한 카드다.

---

## 정리

1. **MVCC와 명시적 락은 다른 층위다.** MVCC는 읽기-쓰기 비차단을 담당하고, 쓰기-쓰기 경합과 DDL·애플리케이션 제어는 락이 담당한다.
2. **테이블 레벨 락은 8종**이며 호환성 매트릭스가 동작을 규정한다. `ACCESS SHARE`(읽기)는 `ACCESS EXCLUSIVE`(강한 DDL)하고만 충돌하고, `ACCESS EXCLUSIVE`는 모든 것과 충돌한다.
3. **로우 레벨 락은 4종**(`FOR UPDATE` > `FOR NO KEY UPDATE` > `FOR SHARE` > `FOR KEY SHARE`)이며, FK 검사를 위해 약한 락이 도입됐다. 로우 락은 **튜플의 `xmax`에 저장**되고, 공유 락이 겹치면 **MultiXact**가 쓰인다.
4. PostgreSQL은 **락 에스컬레이션이 없다.** 행을 많이 잠가도 테이블 락으로 승격되지 않는다.
5. 락 경합은 **`pg_locks` + `pg_blocking_pids()`** 로 진단한다. `granted = f`가 대기 중인 락이다.
6. **데드락은 상시 감시가 아니라 `deadlock_timeout`(기본 1초) 후 wait-for 그래프 검사**로 탐지하고, 한쪽을 자동 abort한다.
7. 운영 DDL에는 **`lock_timeout`** 을 짧게 걸어 대기 큐가 트래픽을 막는 사고를 예방하자.
8. **`SELECT ... FOR UPDATE SKIP LOCKED`** 로 별도 브로커 없이 PostgreSQL만으로 경합 없는 작업 큐를 만들 수 있다.

---

## 관련 포스트

- [PostgreSQL MVCC와 VACUUM 내부 동작 원리 (PostgreSQL 마스터 1부)](/2026/06/13/postgresql-mvcc-vacuum/)
- [PostgreSQL 복제와 고가용성 (PostgreSQL 마스터 5부)](/2026/06/17/postgresql-replication-ha/)
- [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
