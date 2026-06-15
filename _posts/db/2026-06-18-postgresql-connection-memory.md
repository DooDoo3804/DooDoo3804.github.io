---
title: "PostgreSQL 커넥션과 메모리 구조의 내부 동작"
subtitle: "프로세스 모델, 공유 메모리 vs per-backend 메모리, 그리고 커넥션 풀링"
layout: post
date: "2026-06-18"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "postgresql, connection, memory, shared_buffers, work_mem, pgbouncer, hikaricp, max_connections, connection pooling"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "PostgreSQL의 프로세스 기반 커넥션 모델과 메모리 구조를 파헤친다. backend 프로세스 fork, 공유 메모리(shared_buffers), per-backend 메모리(work_mem) 폭발 위험, 커넥션 풀링(PgBouncer·HikariCP)까지."
---

## "커넥션 좀 늘려주세요"가 위험한 이유

운영을 하다 보면 이런 요청을 받는다. "트래픽이 늘어서 커넥션이 부족합니다. `max_connections`를 500에서 2000으로 올려주세요." 가장 간단해 보이는 해결책이고, 실제로 숫자만 바꾸면 당장은 에러가 사라진다. 그리고 며칠 뒤, 데이터베이스 서버가 메모리 부족(OOM)으로 죽거나 CPU가 컨텍스트 스위칭으로 불타오른다.

왜 이런 일이 벌어질까? MySQL 같은 스레드 기반 DB만 다뤄 봤다면 직관에 어긋난다. 답은 PostgreSQL이 커넥션을 다루는 **근본 구조**에 있다. PostgreSQL에서 커넥션 하나는 가벼운 스레드가 아니라 **독립된 운영체제 프로세스**이고, 각 프로세스는 자기만의 메모리를 들고 다닌다. 이 글은 그 프로세스 모델과 메모리 구조를 파헤치고, 왜 커넥션 풀링이 선택이 아니라 필수인지를 끝까지 설명한다.

> [!NOTE]
> 이 글에서 `shared_buffers`를 다루지만, [Part 2 WAL](/2026/06/14/postgresql-wal-recovery/)에서 다룬 "버퍼가 디스크에 어떻게 flush되는가"라는 I/O 관점이 아니라, **여러 프로세스가 메모리를 어떻게 나눠 쓰는가**라는 구조 관점으로 본다. 같은 파라미터라도 보는 각도가 다르다.

---

## process-per-connection — 커넥션 하나가 프로세스 하나다

PostgreSQL 서버가 떠 있을 때 가장 먼저 실행되는 프로세스는 **postmaster**다. 이 녀석은 직접 쿼리를 처리하지 않는다. 대신 지정된 포트(기본 5432)에서 클라이언트의 접속 요청을 듣고 있다가, 연결이 들어올 때마다 자기 자신을 **`fork()`** 해서 **backend 프로세스**를 하나 만든다. 그리고 그 backend가 해당 클라이언트의 모든 쿼리를 전담한다.

```
                    ┌──────────────┐
   클라이언트 A ───▶│  postmaster  │  (포트 5432에서 listen)
                    └──────┬───────┘
                           │ fork()
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ backend  │  │ backend  │  │ backend  │   ← 커넥션 1개당 1개
      │ (PID 101)│  │ (PID 102)│  │ (PID 103)│
      └──────────┘  └──────────┘  └──────────┘
```

실제로 OS에서 프로세스 목록을 보면 커넥션 수만큼 `postgres` 프로세스가 떠 있는 것을 확인할 수 있다.

```bash
$ ps -ef | grep postgres
postgres  9001     1  postgres: postmaster
postgres  9012  9001  postgres: checkpointer
postgres  9013  9001  postgres: background writer
postgres  9014  9001  postgres: walwriter
postgres  9015  9001  postgres: autovacuum launcher
postgres  9120  9001  postgres: app appdb 10.0.1.5(51234) idle
postgres  9121  9001  postgres: app appdb 10.0.1.6(51240) SELECT
```

아래쪽 두 줄이 클라이언트 커넥션을 처리하는 backend다. `idle`은 연결만 되어 있고 노는 중, `SELECT`는 쿼리 실행 중이라는 뜻이다. PostgreSQL 안에서도 `pg_stat_activity` 뷰로 같은 정보를 볼 수 있다.

```sql
SELECT pid, usename, client_addr, state, query
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

> [!NOTE]
> 여기서 **스레드가 아니라 프로세스**라는 점이 핵심이다. MySQL은 커넥션마다 스레드를 만들어 하나의 프로세스 안에서 메모리를 공유하지만, PostgreSQL은 OS 프로세스를 통째로 `fork`한다. (Windows에는 진짜 `fork`가 없어 내부적으로 흉내 내지만, 모델은 동일하게 "커넥션 = 프로세스"다.)

### 프로세스 모델이 주는 것 — 격리

왜 굳이 무거운 프로세스를 쓸까? 가장 큰 이유는 **격리(isolation)** 다. 각 backend는 독립된 주소 공간을 가지므로:

- 한 backend가 세그멘테이션 폴트로 죽어도, 다른 커넥션과 서버 전체를 끌어내리지 않는다. postmaster가 비정상 종료를 감지하고 정리한다.
- 메모리 관리가 단순하고, 한 쿼리의 메모리 누수가 다른 커넥션에 새어 나가지 않는다.
- 구현이 견고하다 — 락 없이도 프로세스 간 간섭이 적다.

안정성 측면에서 이 모델은 강력하다. 문제는 **비용**이다.

---

## 커넥션 1개의 진짜 비용

프로세스 격리는 공짜가 아니다. 커넥션 하나를 맺을 때마다 다음 비용이 발생한다.

**1) fork 비용 (연결 시점)** — 새 backend를 `fork`하고, 인증을 거치고, 카탈로그를 로드하고, 메모리 컨텍스트를 초기화하는 과정은 스레드 생성보다 훨씬 무겁다. 그래서 "요청마다 새로 연결하고 끊는" 패턴은 PostgreSQL에서 특히 치명적이다. 매 요청이 수 ms의 연결 셋업 비용을 떠안는다.

**2) 메모리 비용 (연결 유지 동안)** — 각 backend는 살아 있는 동안 자기 몫의 메모리를 점유한다. 실행 계획, 카탈로그 캐시, 임시 버퍼 등으로 idle 상태여도 수 MB, 쿼리가 무거우면 수십~수백 MB까지 쓴다. 커넥션이 노는 중이어도 이 메모리는 잡혀 있다.

**3) 경합 비용 (커넥션 수에 비례)** — backend가 많아질수록 운영체제의 컨텍스트 스위칭이 늘고, PostgreSQL 내부의 공유 자료구조(특히 모든 활성 트랜잭션을 추적하는 **ProcArray**) 스캔 비용이 커진다. 스냅샷을 뜰 때마다 활성 backend를 훑어야 하므로([Part 1 MVCC](/2026/06/13/postgresql-mvcc-vacuum/)의 스냅샷을 떠올리자), 커넥션 수 자체가 오버헤드의 원천이 된다.

> [!WARNING]
> 그래서 **수천 개의 idle 커넥션**은 그 자체로 위험하다. 실제로 일하는 커넥션이 50개뿐이어도, 연결만 맺어둔 2000개의 backend가 각각 메모리를 잡고 ProcArray를 부풀린다. "연결은 해두고 대부분 노는" 웹 애플리케이션의 전형적인 패턴이 PostgreSQL의 약점을 정확히 찌른다. 경험적으로 backend 수는 **CPU 코어 수의 수 배** 수준으로 묶는 것이 건강하다.

이 지점에서 자연스럽게 두 갈래의 메모리 이야기로 들어간다. PostgreSQL의 메모리는 **모든 backend가 함께 쓰는 공유 메모리**와 **각 backend가 따로 쓰는 메모리**로 나뉜다. 이 구분을 정확히 잡는 것이 이 글의 핵심이다.

---

## 공유 메모리 — 모든 backend가 함께 쓴다

서버가 시작될 때 postmaster는 거대한 **공유 메모리 세그먼트**를 한 번 할당한다. 이후 `fork`되는 모든 backend는 이 영역을 **attach**해서 공유한다. 즉 커넥션 수와 무관하게 **딱 한 덩어리**만 존재하는 메모리다.

| 영역 | 파라미터 | 역할 |
|------|----------|------|
| **공유 버퍼 풀** | `shared_buffers` | 테이블/인덱스 데이터 페이지 캐시. 모든 backend가 디스크 대신 여기서 페이지를 읽고 쓴다 |
| **WAL 버퍼** | `wal_buffers` | 디스크에 기록되기 전의 WAL 레코드를 모으는 버퍼 |
| **커밋 로그(clog)** | (자동) | 각 트랜잭션의 커밋/어보트 상태. 가시성 판정에 쓰인다 |
| **락 테이블** | `max_locks_per_transaction` 기반 | 객체 락 정보 (Part 4 참고) |
| **ProcArray** | `max_connections` 기반 | 현재 활성 트랜잭션/backend 목록 |

가장 큰 비중은 **`shared_buffers`** 다. PostgreSQL은 디스크 페이지를 직접 만지지 않고, 항상 이 공유 버퍼 풀에 올린 뒤 읽고 쓴다. 어떤 backend가 자주 쓰는 테이블 페이지를 올려두면, 다른 backend도 그 캐시의 혜택을 본다. **한 번 올라온 페이지를 모두가 공유**한다는 게 핵심이다.

```sql
-- 현재 공유 메모리 관련 설정 확인
SHOW shared_buffers;     -- 예: 4GB
SHOW wal_buffers;        -- 예: 16MB
SHOW max_connections;    -- 예: 200
```

> [!TIP]
> `shared_buffers`의 출발점은 보통 **물리 메모리의 약 25%** 다. 무작정 키운다고 좋아지지 않는데, PostgreSQL은 OS 페이지 캐시도 함께 활용하는 이중 캐시 구조라서 둘 사이의 균형이 필요하기 때문이다. 중요한 건 이 값이 **커넥션 수와 무관하게 고정**이라는 점이다. 커넥션 1000개든 10개든 `shared_buffers`는 그대로다.

공유 메모리가 "고정비"라면, 진짜 문제는 다음에 나오는 "변동비" — 커넥션과 쿼리에 따라 늘어나는 per-backend 메모리다.

---

## per-backend 메모리 — 커넥션마다, 쿼리마다 따로 잡는다

각 backend는 공유 메모리와 별개로, 자기 작업을 위한 **로컬 메모리**를 할당한다. 정렬·해시·임시 테이블 같은 작업이 여기서 일어난다. 공유 메모리와 결정적으로 다른 점은 — 이건 **backend 수에 비례해서, 때로는 그보다 더 빠르게 불어난다.**

| 파라미터 | 기본값 | 할당 단위 | 용도 |
|----------|--------|-----------|------|
| `work_mem` | 4MB | **쿼리 내 연산 노드마다** | 정렬(sort), 해시(hash join/agg) |
| `maintenance_work_mem` | 64MB | 유지보수 작업당 | `CREATE INDEX`, `VACUUM` |
| `temp_buffers` | 8MB | 세션당 | 임시 테이블 접근 버퍼 |

`maintenance_work_mem`과 `temp_buffers`는 비교적 직관적이다. 문제는 **`work_mem`** 이고, 여기서 대부분의 사고가 난다.

### work_mem은 "커넥션당"이 아니라 "연산 노드당"이다

가장 흔한 오해는 "`work_mem`은 커넥션당 한 번 잡힌다"는 것이다. **틀렸다.** `work_mem`은 쿼리 하나가 아니라, **쿼리 실행 계획 안의 정렬/해시 연산 하나하나마다** 따로 할당될 수 있다.

복잡한 쿼리 하나를 생각해 보자.

```sql
SELECT u.name, o.total, p.method
FROM users u
JOIN orders o   ON o.user_id = u.id     -- Hash Join #1
JOIN payments p ON p.order_id = o.id    -- Hash Join #2
WHERE u.created_at > '2026-01-01'
ORDER BY o.total DESC;                  -- Sort
```

이 쿼리의 실행 계획에는 해시 조인 2개와 정렬 1개가 들어갈 수 있다. 그러면 이 **단 하나의 쿼리가 `work_mem`을 최대 3배** 잡는다. `work_mem`이 4MB면 12MB다. `EXPLAIN`으로 노드를 보면 확인된다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ... ;   -- Hash, Hash, Sort 노드가 각각 등장
```

여기에 두 가지가 더 곱해진다.

- **병렬 쿼리**: 쿼리가 병렬 워커 4개를 띄우면, 각 워커가 또 자기 몫의 `work_mem`을 잡는다. 정렬 1개짜리 쿼리도 `work_mem × (워커 수 + 1)`이 될 수 있다.
- **해시 연산의 가중치**: PostgreSQL 13부터 해시 기반 연산은 `work_mem × hash_mem_multiplier`(기본 2.0)까지 쓸 수 있다. 즉 해시 노드 하나가 `work_mem`의 2배를 잡는다.

> [!WARNING]
> 정리하면, 한 커넥션이 실제로 쓰는 작업 메모리는 `work_mem`이 아니라
> **`work_mem × 쿼리 내 정렬·해시 노드 수 × 병렬 워커 수 × (해시면 hash_mem_multiplier)`** 에 가깝다.
> `work_mem`을 "넉넉하게" 256MB로 잡아두면, 복잡한 쿼리 하나가 수 GB를 삼킬 수 있다. 이게 `work_mem`을 함부로 올리면 안 되는 이유다.

### work_mem을 넘으면? 디스크로 흘러간다

`work_mem` 안에서 정렬·해시가 끝나지 않으면 PostgreSQL은 **임시 파일(temp file)** 을 만들어 디스크에서 작업을 이어간다. 결과는 맞지만 느려진다. `EXPLAIN ANALYZE`에 `Sort Method: external merge Disk: 12000kB`처럼 찍히면 이 쿼리는 `work_mem`이 모자란 것이다.

그렇다고 `work_mem`을 전역으로 키우는 건 위험하다. 가장 안전한 방법은 **무거운 쿼리에서만 세션 단위로** 올리는 것이다.

```sql
-- 이 세션의 이 작업에서만 크게 — 전역 설정은 건드리지 않는다
SET work_mem = '256MB';
SELECT ... ORDER BY ...;   -- 큰 정렬
RESET work_mem;
```

---

## max_connections를 무작정 올리면 안 되는 이유

이제 처음의 질문으로 돌아오자. "`max_connections`를 2000으로 올려주세요." 왜 위험한지 이제 숫자로 보인다.

서버가 감당해야 하는 메모리를 거칠게 계산하면 이렇다.

```
전체 메모리 ≈ shared_buffers (고정)
           + max_connections × (backend 기본 메모리 + work_mem 최악치)
```

`work_mem`이 backend마다, 쿼리 안에서 여러 번 잡힐 수 있다는 걸 떠올리면, 두 번째 항은 **커넥션 수와 함께 폭발적으로** 커진다. 예를 들어 `work_mem = 16MB`, 평균적으로 커넥션당 무거운 쿼리가 work_mem을 4번 잡는다고 보면:

| max_connections | work_mem 최악치 (× 64MB/커넥션) | 비고 |
|-----------------|-------------------------------|------|
| 100 | 약 6.4GB | 관리 가능 |
| 500 | 약 32GB | 위험 |
| 2000 | 약 128GB | 대부분의 서버에서 OOM |

물론 모든 커넥션이 동시에 최악치를 쓰진 않는다. 하지만 트래픽이 몰리는 순간 동시에 무거운 쿼리가 실행되면 이 최악치에 근접하고, 그 순간 서버가 OOM으로 죽는다. **`max_connections`를 키운다는 건 메모리 폭탄의 뇌관을 키우는 것**과 같다.

> [!NOTE]
> 핵심은 이것이다. **애플리케이션이 필요로 하는 동시 "클라이언트 연결" 수**와, **DB가 효율적으로 처리할 수 있는 "backend" 수**는 다른 숫자다. 앞은 수천 개일 수 있지만, 뒤는 보통 CPU 코어의 수 배(수십~수백 개)가 한계다. 이 둘 사이의 간극을 메우는 장치가 바로 **커넥션 풀링**이다.

---

## 커넥션 풀링 — 적은 backend로 많은 클라이언트를 받는다

커넥션 풀링의 발상은 단순하다. **DB로 가는 backend 커넥션은 소수로 고정해 두고, 여러 클라이언트가 그것을 돌려 쓴다.** 클라이언트 2000개가 붙어도 실제 PostgreSQL backend는 50개만 유지한다. 풀러(pooler)가 그 사이에서 교통정리를 한다.

```
  app 인스턴스들           pooler              PostgreSQL
 (수천 개 클라이언트)   (커넥션 멀티플렉싱)    (소수 backend)
  ●●●●●●●●●●●●●●●  ───▶  ┌─────────┐  ───▶   ┌────────────┐
  ●●●●●●●●●●●●●●●         │ PgBouncer│         │ 50 backend │
  ●●●●●●●●●●●●●●●  ───▶  └─────────┘  ───▶   └────────────┘
```

대표적인 서버측 풀러가 **PgBouncer**다. 가볍고(자체도 단일 프로세스), 어떤 풀 모드로 동작하느냐에 따라 효율과 제약이 크게 달라진다.

### PgBouncer 풀 모드 3종

```ini
# pgbouncer.ini
[databases]
appdb = host=127.0.0.1 port=5432 dbname=appdb

[pgbouncer]
pool_mode = transaction      # session | transaction | statement
max_client_conn = 2000       # 받아들일 클라이언트 연결 수
default_pool_size = 50       # 실제 DB backend 수
```

| 모드 | 서버 커넥션 반환 시점 | 풀 효율 | 주요 제약 |
|------|---------------------|---------|-----------|
| **session** | 클라이언트가 **연결을 끊을 때** | 낮음 | 사실상 직접 연결과 동일. 제약 거의 없음 |
| **transaction** | **매 트랜잭션이 끝날 때** | 높음 (권장) | 세션 상태에 의존하는 기능 제약 (아래) |
| **statement** | **매 SQL문이 끝날 때** | 가장 높음 | 멀티 스테이트먼트 트랜잭션 자체가 불가 |

**session 모드**는 클라이언트가 연결되어 있는 내내 backend 하나를 점유한다. 직접 연결과 똑같이 동작하므로 호환성은 완벽하지만, 풀링의 이점(소수 backend 공유)이 거의 사라진다. idle 클라이언트가 backend를 붙잡고 있기 때문이다.

**transaction 모드**가 실전에서 가장 많이 쓰인다. backend를 **트랜잭션 경계에서** 반납하므로, 트랜잭션 사이에 노는 클라이언트는 backend를 점유하지 않는다. 이 덕분에 50개 backend로 수천 클라이언트를 받을 수 있다. 대신 **트랜잭션을 넘어 유지되는 세션 상태**를 신뢰할 수 없게 된다 — 다음 트랜잭션은 전혀 다른 backend에서 실행될 수 있기 때문이다.

**statement 모드**는 SQL문 하나가 끝날 때마다 반납한다. 가장 공격적이지만, **여러 문장에 걸친 트랜잭션 자체가 금지**(autocommit 강제)되어 사용처가 매우 제한적이다. 보통 읽기 전용 분석 트래픽 같은 특수한 경우에만 쓴다.

### transaction 모드의 제약 — 정확히 알아야 사고를 막는다

transaction 모드는 강력하지만, "세션에 걸쳐 살아 있어야 하는 것"들이 깨진다. 다음이 의도대로 동작하지 않는다.

- **`SET`/`RESET` 세션 변수** — `SET SESSION ...`은 다음 트랜잭션엔 다른 backend라 사라진다. 트랜잭션 범위로 제한되는 **`SET LOCAL`**을 써야 한다. (특정 파라미터는 `track_extra_parameters`로 예외 허용 가능)
- **`LISTEN`/`NOTIFY`** — `LISTEN`은 세션에 묶이므로 동작하지 않는다. (`NOTIFY`는 단일 문장이라 괜찮다)
- **세션 수준 advisory lock**, **`WITH HOLD` 커서**, 세션에 걸친 임시 테이블 등.
- **Prepared statement** — 역사적으로 transaction 모드에서 깨졌다. **PgBouncer 1.21+** 부터 프로토콜 레벨 prepared statement를 지원하는데(`max_prepared_statements > 0` 설정 필요), 이는 JDBC의 `PreparedStatement`나 libpq의 `PQprepare`처럼 **프로토콜 기반**일 때만이고, SQL의 `PREPARE`/`DEALLOCATE` 문은 여전히 제약된다.

```ini
# transaction 모드에서 prepared statement 쓰려면 (PgBouncer 1.21+)
[pgbouncer]
pool_mode = transaction
max_prepared_statements = 200   # 0이면 비활성
```

> [!WARNING]
> transaction 모드로 전환할 때 가장 흔한 사고가 **`SET SESSION`에 의존하던 코드**와 **prepared statement**다. 애플리케이션이 세션 타임존, 검색 경로(`search_path`) 등을 `SET`으로 한 번 정해두고 재사용하고 있었다면, 풀 모드 전환 후 조용히 깨진다. 전환 전에 세션 상태 의존성을 반드시 점검하자.

---

## 애플리케이션 풀(HikariCP)과 PgBouncer는 경쟁이 아니다

여기서 백엔드 개발자들이 자주 헷갈린다. "우리는 이미 HikariCP를 쓰는데 PgBouncer도 필요한가?" 둘은 **다른 층위**의 풀이고, 역할이 겹치지 않는다.

| 구분 | 애플리케이션 풀 (HikariCP 등) | 서버측 풀 (PgBouncer) |
|------|------------------------------|----------------------|
| 위치 | 각 앱 인스턴스(JVM) 내부 | DB 앞단의 별도 프로세스 |
| 해결하는 문제 | **연결 셋업 비용** 제거 (재사용) | **전체 backend 수** 통제 |
| 풀의 범위 | 그 인스턴스 하나 | 모든 앱 인스턴스를 합친 전역 |
| 한계 | 인스턴스 N개 × 풀 크기만큼 DB에 연결 | (단독으론 셋업 비용을 줄이진 않음) |

핵심 차이는 **풀의 범위**다. HikariCP는 **한 앱 인스턴스 안에서만** 커넥션을 재사용한다. 매 요청마다 연결을 새로 맺는 비용을 없애주지만, 인스턴스가 늘어나면 문제가 다시 커진다. 인스턴스 20개가 각각 풀 크기 50으로 떠 있으면, DB 입장에서는 **20 × 50 = 1000개**의 backend 요청이 들어온다. HikariCP는 인스턴스끼리는 서로 모르기 때문에, 이 전역 합계를 통제할 수 없다.

**PgBouncer는 바로 이 전역 합계를 묶는 유일한 층**이다. 모든 앱 인스턴스의 연결을 한곳에서 받아, 소수의 backend로 멀티플렉싱한다. 그래서 둘은 함께 쓴다 — 직렬로 쌓는다.

```
HikariCP (앱 인스턴스 내 재사용)  →  PgBouncer (전역 backend 통제)  →  PostgreSQL
```

> [!TIP]
> 둘을 함께 쓸 때의 실전 팁: PgBouncer를 transaction 모드로 둔다면, **HikariCP 풀 크기를 과하게 키우지 말 것**(어차피 PgBouncer가 전역에서 묶는다). 그리고 HikariCP의 연결 검증 쿼리나 세션 변수 설정이 transaction 모드 제약과 충돌하지 않는지 확인하자. 유명한 가이드의 결론처럼, 적정 풀 크기는 의외로 **작다** — "코어 수 × 2 + 디스크 스핀들 수" 같은 공식이 출발점이다.

---

## 현장 진단 — 지금 내 DB의 커넥션은 건강한가

마지막으로, 지금까지의 개념을 점검하는 쿼리들이다.

```sql
-- 1) 상태별 커넥션 수 — idle / idle in transaction 비중을 본다
SELECT state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY count(*) DESC;
```

```sql
-- 2) max_connections 대비 현재 사용률
SELECT count(*) AS used,
       current_setting('max_connections')::int AS max_conn,
       round(100.0 * count(*)
             / current_setting('max_connections')::int, 1) AS pct
FROM pg_stat_activity;
```

```sql
-- 3) 임시 파일을 많이 쓰는가? (work_mem 부족 신호)
SELECT datname, temp_files, pg_size_pretty(temp_bytes) AS temp_size
FROM pg_stat_database
WHERE temp_files > 0
ORDER BY temp_bytes DESC;
```

읽는 법은 이렇다.

- **`idle`이 압도적으로 많다** → 클라이언트가 연결만 잡고 논다는 뜻. 커넥션 풀링(특히 transaction 모드)으로 backend를 줄일 여지가 크다.
- **`idle in transaction`이 쌓인다** → 트랜잭션을 열어둔 채 방치 중. backend 점유는 물론이고, [Part 1](/2026/06/13/postgresql-mvcc-vacuum/)에서 봤듯 VACUUM까지 막는 이중고다. `idle_in_transaction_session_timeout`을 걸자.
- **`temp_files`/`temp_bytes`가 크다** → 정렬·해시가 `work_mem`을 넘쳐 디스크로 흘렀다는 신호. 무거운 쿼리에서 세션 단위로 `work_mem`을 올리는 걸 검토하자.

---

## 정리

1. PostgreSQL은 **커넥션 1개당 OS 프로세스(backend) 1개**를 `fork`한다. 스레드가 아니다. 이 모델은 강력한 **격리**를 주지만, 커넥션마다 **fork 비용 + 메모리 + 경합 비용**을 치른다.
2. 메모리는 두 갈래다. **공유 메모리**(`shared_buffers`, WAL 버퍼, clog 등)는 커넥션 수와 무관한 **고정비**이고, 모든 backend가 함께 쓴다.
3. **per-backend 메모리**(`work_mem`, `maintenance_work_mem`, `temp_buffers`)는 커넥션·쿼리에 따라 늘어나는 **변동비**다.
4. **`work_mem`은 커넥션당이 아니라 쿼리 내 정렬·해시 노드마다** 잡힌다. 병렬 워커와 `hash_mem_multiplier`까지 곱해지면 한 쿼리가 `work_mem`의 수~수십 배를 삼킬 수 있다.
5. 그래서 **`max_connections`를 무작정 올리면 메모리가 폭발**한다. 필요한 "클라이언트 연결 수"와 DB가 감당하는 "backend 수"는 다른 숫자다.
6. 이 간극은 **커넥션 풀링**으로 메운다. **PgBouncer**의 풀 모드는 session / transaction / statement이고, **transaction 모드**가 실전 표준이되 세션 상태(`SET SESSION`, `LISTEN`, prepared statement 등)에 제약이 따른다.
7. **HikariCP(앱 풀)와 PgBouncer(서버 풀)는 층위가 다르다.** 앞은 인스턴스 내 재사용, 뒤는 전역 backend 통제. 함께 직렬로 쓴다.

---

## 관련 포스트

- [PostgreSQL 복제와 고가용성(HA) (PostgreSQL 마스터 5부)](/2026/06/17/postgresql-replication-ha/)
- [PostgreSQL 파티셔닝 (PostgreSQL 마스터 7부)](/2026/06/19/postgresql-partitioning/)
- [PostgreSQL MVCC와 VACUUM 내부 동작 (PostgreSQL 마스터 1부)](/2026/06/13/postgresql-mvcc-vacuum/)
- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
