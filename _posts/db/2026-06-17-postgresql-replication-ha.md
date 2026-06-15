---
title: "PostgreSQL 복제와 고가용성(HA) 내부 동작"
subtitle: "스트리밍 복제, 물리/논리 복제, 동기 복제와 페일오버까지"
layout: post
date: "2026-06-17"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, replication, streaming replication, logical replication, synchronous, failover, high availability"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL 복제와 고가용성 정리. 스트리밍 복제 동작, 물리 vs 논리 복제, replication slot, 동기/비동기 트레이드오프, replica lag 측정, pg_promote 페일오버까지 다룬다."
---

## 복제는 무엇을 해결하는가

데이터베이스 한 대로 운영하면 세 가지가 늘 불안하다.

- **가용성** — 그 서버가 죽으면 서비스 전체가 멈춘다.
- **읽기 확장** — 트래픽이 몰리면 단일 서버의 CPU/디스크가 병목이 된다.
- **재해 복구** — 디스크가 통째로 날아가면 마지막 백업 이후의 데이터를 잃는다.

**복제(replication)**는 같은 데이터를 여러 서버에 유지함으로써 이 셋을 동시에 공략한다. 한 대(프라이머리)가 죽으면 다른 대(스탠바이)를 승격시키고, 읽기 쿼리는 복제본으로 분산하며, 물리적으로 떨어진 곳에 사본을 둔다.

그런데 PostgreSQL은 이 복제를 어떻게 구현할까? 답은 이미 이 시리즈에서 깔아둔 토대 위에 있다 — **WAL**이다.

> [!IMPORTANT]
> 복제의 본질은 **"프라이머리가 만든 WAL을 스탠바이에게 재생시키는 것"**이다. WAL이 "데이터베이스에 일어난 모든 변경의 순서 있는 완전한 기록"이기 때문에, 같은 WAL을 적용한 스탠바이는 프라이머리와 같은 상태로 수렴한다.

WAL의 내부 동작(WAL 레코드, LSN, fsync, REDO 재생)은 이 시리즈 [Part 2. WAL과 크래시 복구](/2026/06/14/postgresql-wal-recovery/)에서 깊이 다뤘다. 이 글은 그 WAL을 **네트워크 너머로 흘려보내 복제와 HA를 구성·운영하는 방법**에 집중한다.

---

## 스트리밍 복제는 어떻게 동작하는가

PostgreSQL의 기본 복제 방식은 **스트리밍 복제(streaming replication)**다. WAL을 파일 단위로 늦게 복사하는 대신, WAL 레코드를 **실시간 스트림**으로 보낸다. 여기엔 세 종류의 프로세스가 등장한다.

```
[ Primary ]                              [ Standby ]
  백엔드가 변경 → WAL 생성
       │
   ┌───┴────────┐   WAL 스트림(TCP)   ┌──────────────┐
   │ walsender  │ ──────────────────> │ walreceiver  │
   └────────────┘                     └──────┬───────┘
   (스탠바이당 1개)                           │ WAL을 디스크에 기록
                                              ▼
                                       ┌──────────────┐
                                       │ startup 프로세스│  WAL을 REDO 재생
                                       └──────────────┘
                                       → 프라이머리와 같은 상태 유지
```

1. **walsender** — 프라이머리에서 스탠바이 연결마다 하나씩 뜨는 프로세스. 생성되는 WAL 레코드를 스탠바이로 흘려보낸다.
2. **walreceiver** — 스탠바이에서 WAL 스트림을 받아 로컬 WAL에 기록하는 프로세스.
3. **startup 프로세스** — 스탠바이에서 받은 WAL을 끊임없이 **REDO 재생(replay)**한다. 크래시 복구의 재생과 같은 메커니즘이지만, 끝나지 않고 계속 이어진다.

즉 스탠바이는 "영원히 복구 모드에 머물면서 프라이머리가 보내주는 WAL을 계속 따라 재생하는 서버"라고 이해하면 정확하다. `pg_is_in_recovery()`가 스탠바이에서 `true`를 반환하는 이유다.

```sql
-- 이 서버가 스탠바이인지 확인
SELECT pg_is_in_recovery();
--  pg_is_in_recovery
-- -------------------
--  t
```

---

## 물리 복제 vs 논리 복제

PostgreSQL의 복제는 크게 두 갈래다. 둘은 "WAL을 어떤 수준에서 해석하는가"가 다르다.

- **물리 복제(physical)** — WAL을 **바이트 그대로** 재생한다. 스탠바이는 프라이머리의 블록 단위 사본이 된다. 스트리밍 복제가 여기에 해당한다.
- **논리 복제(logical)** — WAL을 **논리적 변경(행 단위 INSERT/UPDATE/DELETE)으로 디코딩**해 전송한다. **publication / subscription** 모델로 구성한다.

```sql
-- 논리 복제: 발행자(primary) 쪽
CREATE PUBLICATION orders_pub FOR TABLE orders, order_items;

-- 구독자(replica) 쪽
CREATE SUBSCRIPTION orders_sub
    CONNECTION 'host=primary dbname=shop'
    PUBLICATION orders_pub;
```

### 비교

| 항목 | 물리 복제 (스트리밍) | 논리 복제 (pub/sub) |
|------|----------------------|---------------------|
| 복제 단위 | 클러스터 전체(블록 단위) | 선택한 테이블(행 단위) |
| 복제본 쓰기 | 읽기 전용 | **쓰기 가능** |
| 버전/아키텍처 | 같은 메이저 버전·같은 플랫폼 | **서로 달라도 됨** (업그레이드용) |
| DDL(스키마 변경) | 자동 복제됨 | **복제 안 됨** (양쪽 수동 적용) |
| 시퀀스 값 | 복제됨 | **복제 안 됨** |
| 주 용도 | HA, 읽기 확장, 재해 복구 | 부분 복제, 무중단 업그레이드, 이기종 통합 |

> [!WARNING]
> 논리 복제는 **DDL과 시퀀스 값을 복제하지 않는다.** 구독 측 테이블의 스키마는 직접 맞춰야 하고, `UPDATE`/`DELETE`를 복제하려면 테이블에 **레플리카 식별자(REPLICA IDENTITY, 기본은 기본키)**가 있어야 한다. 대형 객체(large object)도 복제되지 않는다.

> [!NOTE]
> PostgreSQL 17부터는 운영 편의가 크게 좋아졌다. **논리 복제 슬롯 동기화(failover slots)**로 프라이머리 장애 시에도 논리 복제가 끊기지 않게 되었고, **`pg_createsubscriber`**로 물리 스탠바이를 빠르게 논리 복제본으로 전환할 수 있다(초기 데이터 복사를 건너뛰므로 대용량에 유리).

---

## Replication Slot: WAL을 언제까지 보존할 것인가

스탠바이가 잠깐 끊겼다가 돌아왔다고 하자. 그 사이 프라이머리가 필요한 WAL을 이미 지워버렸다면, 스탠바이는 따라잡지 못하고 처음부터 다시 베이스 백업을 떠야 한다. 이 문제를 막는 장치가 **replication slot(복제 슬롯)**이다.

복제 슬롯은 프라이머리에 "이 스탠바이가 아직 어디까지밖에 못 받아갔다"는 진행 상황을 영속적으로 기록한다. 프라이머리는 **모든 슬롯이 소비하지 못한 WAL은 지우지 않고 보존**한다.

```sql
-- 물리 복제 슬롯 생성
SELECT pg_create_physical_replication_slot('standby1_slot');

-- 슬롯 상태와 보존 중인 WAL 확인
SELECT slot_name, active,
       pg_size_pretty(
         pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
       ) AS retained_wal
FROM pg_replication_slots;
```

여기엔 양날의 검이 있다.

> [!WARNING]
> 슬롯을 만든 스탠바이가 **죽은 채로 방치되면**, 프라이머리는 그 스탠바이를 위해 WAL을 무한정 쌓아두다가 **`pg_wal` 디스크가 가득 차 프라이머리까지 멈출 수 있다.** PostgreSQL 13+의 **`max_slot_wal_keep_size`**로 슬롯이 보존할 WAL 상한을 두어 이 사고를 방지하자(상한을 넘으면 그 슬롯은 무효화된다).

---

## 동기 복제 vs 비동기 복제

복제의 가장 중요한 운영 결정은 **"프라이머리가 커밋을 반환하기 전에 스탠바이의 응답을 기다릴 것인가"**다.

- **비동기 복제(기본값)** — 프라이머리는 로컬 WAL flush만 끝나면 곧바로 커밋을 반환한다. 스탠바이는 약간 뒤처져 따라온다. 빠르지만, 프라이머리가 죽고 스탠바이로 페일오버하면 **아직 전달 안 된 최근 커밋이 사라질 수 있다.**
- **동기 복제** — 프라이머리는 지정한 스탠바이가 WAL을 받았다(또는 적용했다)고 확인할 때까지 커밋을 **기다린다.** 데이터 손실이 없는 대신 지연과 처리량을 희생한다.

동기 복제는 `synchronous_standby_names`로 어떤 스탠바이를 동기 대상으로 삼을지 지정하고, 어느 수준까지 기다릴지는 [Part 2에서 다룬](/2026/06/14/postgresql-wal-recovery/) `synchronous_commit` 값으로 정한다.

### synchronous_commit 수준 (복제 관점)

| 값 | 프라이머리가 기다리는 시점 | 보장 |
|------|------|------|
| `local` | 로컬 디스크 flush만 | 복제본은 안 기다림(사실상 비동기) |
| `remote_write` | 스탠바이 OS가 WAL을 받아 씀 | 스탠바이 프로세스 죽음엔 안전, OS 크래시엔 손실 가능 |
| `on` (기본) | 스탠바이가 WAL을 디스크에 flush | 동기 스탠바이 기준 커밋 손실 없음 |
| `remote_apply` | 스탠바이가 WAL을 **재생까지** 완료 | 복제본에서 곧바로 읽어도 최신 보장 |

### synchronous_standby_names: FIRST vs ANY

```ini
# 우선순위 기반: 나열 순서대로 앞쪽 2개가 응답할 때까지 대기
synchronous_standby_names = 'FIRST 2 (s1, s2, s3)'

# 정족수(quorum) 기반: 나열된 것 중 아무 2개나 응답하면 커밋
synchronous_standby_names = 'ANY 2 (s1, s2, s3)'
```

- **`FIRST k (...)`** — 나열 우선순위가 높은 `k`개의 응답을 기다린다(우선순위 기반).
- **`ANY k (...)`** — 나열된 것 중 **아무 `k`개**의 응답이면 충분하다(정족수 기반). 특정 노드 한 대의 지연에 덜 민감하다.

> [!IMPORTANT]
> 동기 복제에서 동기 스탠바이가 응답하지 못하면 **프라이머리의 커밋이 그대로 멈춘다.** 그래서 동기 대상은 보통 **2대 이상**(`ANY 1 (s1, s2)` 등)으로 묶어, 한 대가 빠져도 쓰기가 막히지 않게 구성한다. "데이터 한 건도 잃지 않기"와 "한 대 빠져도 쓰기 가능" 사이의 균형이 핵심이다.

---

## Hot Standby: 읽기 복제본

기본 설정(`hot_standby=on`)에서 물리 스탠바이는 WAL을 재생하는 **동시에 읽기 전용 쿼리를 받을 수 있다.** 이를 **hot standby**라 하며, 읽기 트래픽을 복제본으로 분산하는 읽기 확장의 토대다.

```sql
-- 스탠바이에서 (읽기는 되지만)
SELECT count(*) FROM orders;   -- ✅ OK

INSERT INTO orders ...;        -- ❌ ERROR: cannot execute INSERT
                               --    in a read-only transaction
```

여기엔 **재생 vs 읽기의 충돌**이라는 미묘한 문제가 있다. 스탠바이에서 오래 도는 쿼리가 보고 있는 행을, 프라이머리에서 온 WAL이 VACUUM으로 정리하려 들면 충돌이 난다. ([Part 4 락과 동시성](/2026/06/16/postgresql-lock-concurrency/)에서 다룬 동시성 문제의 분산 버전이다.) PostgreSQL은 두 가지 손잡이를 준다.

- **`max_standby_streaming_delay`** — 재생을 잠시 늦춰 읽기 쿼리에 시간을 준다. 한계를 넘으면 쿼리를 취소한다(그래야 복제 지연이 무한정 벌어지지 않는다).
- **`hot_standby_feedback=on`** — 스탠바이가 자신이 보고 있는 가장 오래된 트랜잭션 정보를 프라이머리에 알려, 프라이머리가 그 행을 너무 일찍 VACUUM하지 않게 한다. 쿼리 취소는 줄지만, 프라이머리 쪽 테이블 부풀음(bloat)을 키울 수 있다.

---

## Replica Lag 측정

복제 지연(lag)은 HA의 핵심 지표다. 지연이 크면 페일오버 시 손실이 커지고, 복제본 읽기는 더 오래된 데이터를 돌려준다.

### 프라이머리에서 — pg_stat_replication

프라이머리의 `pg_stat_replication`은 각 스탠바이가 WAL을 어디까지 **받고(sent) / 쓰고(write) / flush하고 / 재생(replay)**했는지를 LSN으로 보여준다.

```sql
SELECT application_name,
       state,
       pg_size_pretty(
         pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)
       ) AS replay_lag_bytes,
       write_lag, flush_lag, replay_lag      -- 시간 기준 지연(PG10+)
FROM pg_stat_replication;
```

- **sent_lsn / write_lsn / flush_lsn / replay_lsn** — 단계별로 스탠바이가 도달한 WAL 위치.
- **write_lag / flush_lag / replay_lag** — 프라이머리가 WAL을 쓴 뒤 스탠바이가 같은 지점을 쓰고/flush하고/재생하기까지의 **시간 간격**.
- 바이트 기준 지연은 `pg_wal_lsn_diff(현재 LSN, replay_lsn)`으로 직접 계산한다.

### 스탠바이에서

```sql
-- 마지막으로 받은/재생한 WAL 위치
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();

-- 마지막으로 재생한 트랜잭션의 커밋 시각 → 시간 지연 추정
SELECT now() - pg_last_xact_replay_timestamp() AS time_lag;
```

> [!NOTE]
> lag의 위험은 셋이다. ① 뒤처진 복제본을 읽으면 **오래된 데이터**가 나온다. ② 동기 복제본이 지연되면 **프라이머리 커밋이 막힌다.** ③ 지연된 스탠바이로 페일오버하면 **최근 트랜잭션을 잃는다.** 그래서 lag는 항상 알람을 걸어 감시한다.

---

## 페일오버와 프로모션

프라이머리가 죽으면, 스탠바이 하나를 **새 프라이머리로 승격(promote)**시켜야 한다. PostgreSQL 12+에서는 SQL 함수 하나로 가능하다.

```sql
-- 스탠바이에서 실행 → 이 서버를 프라이머리로 승격
SELECT pg_promote();
--  pg_promote
-- ------------
--  t
```

승격된 서버는 복구 모드를 빠져나와 쓰기를 받기 시작한다. `pg_ctl promote` 명령으로도 같은 일을 할 수 있다.

하지만 자동 페일오버는 함수 호출 한 번보다 훨씬 까다롭다.

> [!WARNING]
> **스플릿 브레인(split-brain)** — 옛 프라이머리가 실제로는 살아있는데 네트워크만 끊긴 상황에서 스탠바이를 승격하면, **프라이머리가 둘이 되어** 양쪽에 서로 다른 쓰기가 쌓인다. 데이터 정합성이 깨지는 최악의 사고다. 이를 막으려면 **펜싱(fencing)**과 합의(consensus) 기반의 리더 선출이 필요하다.

그래서 실무의 자동 HA는 보통 외부 오케스트레이터에 맡긴다.

| 도구 | 방식 |
|------|------|
| **Patroni** | etcd/Consul 등 분산 합의 저장소로 리더 선출 + 자동 페일오버 |
| **repmgr** | 복제 구성·모니터링·수동/자동 페일오버 관리 |
| **pg_auto_failover** | 모니터 노드가 상태를 감시해 자동 전환 |
| **클라우드 매니지드** | RDS/Cloud SQL 등이 페일오버를 내부적으로 처리 |

핵심 원칙은 단순하다 — **승격은 한 번에 하나의 프라이머리만 존재함을 보장한 뒤에 한다.** PostgreSQL은 승격 메커니즘(`pg_promote`)을 제공하고, "언제·안전하게 승격할지"의 판단은 이 합의 계층이 책임진다.

---

## 정리

1. 복제의 본질은 **프라이머리의 WAL을 스탠바이가 재생하는 것**이다. WAL이 모든 변경의 완전한 기록이기에 가능하다([Part 2](/2026/06/14/postgresql-wal-recovery/)).
2. 스트리밍 복제는 **walsender → walreceiver → startup(재생)** 3프로세스로 동작한다. 스탠바이는 "영원히 복구 모드"에 머문다.
3. **물리 복제**는 블록 단위 전체 사본(읽기 전용, HA·읽기 확장), **논리 복제**는 행 단위 선택 복제(쓰기 가능, 버전 간 이전). 논리 복제는 DDL·시퀀스를 복제하지 않는다.
4. **replication slot**은 스탠바이가 필요로 하는 WAL을 보존하지만, 죽은 슬롯은 프라이머리 디스크를 채울 수 있다 — `max_slot_wal_keep_size`로 막자.
5. **동기 복제**는 손실을 없애는 대신 지연을 감수한다. `synchronous_commit` 수준과 `synchronous_standby_names`의 **FIRST(우선순위) / ANY(정족수)**로 강도를 조절한다.
6. **replica lag**은 `pg_stat_replication`(프라이머리)과 재생 LSN/타임스탬프(스탠바이)로 측정하고 반드시 감시한다.
7. **페일오버**는 `pg_promote()`로 수행하지만, **스플릿 브레인**을 막으려면 Patroni 같은 합의 기반 오케스트레이터가 필요하다.

복제는 결국 WAL이라는 한 줄기 로그를 어디까지·얼마나 엄격하게 흘려보낼지를 설계하는 일이다. 그 흐름을 이해하면 HA 구성의 모든 트레이드오프가 같은 언어로 읽힌다.

---

## 관련 포스트

- [PostgreSQL WAL과 크래시 복구](/2026/06/14/postgresql-wal-recovery/) — Part 2. 복제의 토대가 되는 WAL 내부 동작
- [PostgreSQL 락과 동시성 제어](/2026/06/16/postgresql-lock-concurrency/) — Part 4. hot standby 쿼리 충돌의 뿌리
- [PostgreSQL 커넥션과 메모리 구조](/2026/06/18/postgresql-connection-memory/) — Part 6. 복제본 커넥션과 리소스 관리
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/) — 읽기 복제본 성능의 기본기
