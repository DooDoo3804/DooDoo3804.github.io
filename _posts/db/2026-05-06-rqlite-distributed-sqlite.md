---
title: "rqlite — SQLite 위에 세운 분산 데이터베이스"
subtitle: "Raft 합의 알고리즘으로 SQLite를 분산시킨 경량 DB의 구조와 활용"
layout: post
date: "2026-05-06"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "rqlite, sqlite, distributed database, raft, consensus, backend"
description: "rqlite는 SQLite를 Raft 합의 알고리즘으로 분산시킨 경량 데이터베이스다. 아키텍처, 읽기/쓰기 동작, 일관성 모델, 실전 활용법까지 정리한다."
series: "백엔드 심화"
tags:
  - Database
  - Distributed
  - SQLite
  - Backend
categories:
  - database
---

## rqlite란 무엇인가

rqlite는 **SQLite를 분산 환경에서 사용할 수 있게 만든 경량 관계형 데이터베이스**다. Go로 작성되어 있고, Raft 합의 알고리즘을 사용해 여러 노드 간 데이터를 복제한다.

핵심 아이디어는 단순하다:

> SQLite의 단순함은 유지하면서, 단일 장애점(SPOF)만 제거하자.

PostgreSQL이나 MySQL 같은 무거운 분산 DB가 필요 없는 상황 — 설정값 저장, 경량 메타데이터, IoT 디바이스 관리 등 — 에서 빛을 발한다.

---

## 왜 rqlite인가

### SQLite의 한계

SQLite는 세계에서 가장 많이 배포된 데이터베이스지만, 근본적인 한계가 있다:

- **단일 파일** 기반 → 노드가 죽으면 데이터도 사라짐
- **복제 없음** → 고가용성(HA) 불가
- **단일 Writer** → 다중 프로세스 쓰기 불가

### rqlite가 해결하는 것

| 문제 | SQLite | rqlite |
|------|--------|--------|
| 고가용성 | X | O (Raft 복제) |
| 데이터 복제 | X | O (자동) |
| 노드 장애 복구 | X | O (리더 자동 선출) |
| HTTP API | X | O (REST) |
| 단일 바이너리 배포 | O | O |

rqlite는 SQLite의 장점(단순함, 제로 설정, SQL 호환)은 그대로 가져가면서 분산 시스템의 핵심 속성만 추가한다.

---

## 아키텍처

rqlite의 구조는 3개 계층으로 나뉜다:

```
┌────────────────────────────────┐
│         HTTP API Layer         │ ← 클라이언트 요청 수신
├────────────────────────────────┤
│        Raft Consensus          │ ← 노드 간 합의
├────────────────────────────────┤
│           SQLite               │ ← 실제 데이터 저장
└────────────────────────────────┘
```

### Raft 합의 계층

[Raft](https://raft.github.io/)는 분산 시스템에서 **로그 복제**를 보장하는 합의 알고리즘이다. rqlite는 HashiCorp의 `raft` 라이브러리를 사용한다.

핵심 동작:

1. 클러스터에서 **리더 1개**가 선출된다
2. 모든 쓰기는 리더를 통해 처리된다
3. 리더는 SQL 문을 **Raft 로그**에 기록한다
4. 로그가 과반수(quorum) 노드에 복제되면 **커밋**된다
5. 각 노드는 커밋된 SQL을 자신의 SQLite에 실행한다

```
Client ──write──▶ Leader
                    │
                    ├──replicate──▶ Follower 1 ✓
                    ├──replicate──▶ Follower 2 ✓  ← quorum 달성
                    └──replicate──▶ Follower 3
                    │
                    ▼
              Commit & Apply
```

### 중요한 설계 결정

rqlite는 **SQL 문 자체를 복제**한다. 데이터(행)를 복제하는 것이 아니라, SQL 명령어를 모든 노드에서 동일하게 실행하는 방식이다.

이 때문에 주의할 점이 있다:

```sql
-- 이런 쿼리는 노드마다 결과가 다를 수 있다
INSERT INTO logs (created_at) VALUES (datetime('now'));

-- 대신 이렇게 써야 한다
INSERT INTO logs (created_at) VALUES ('2026-05-06T14:30:00');
```

`datetime('now')`, `random()` 같은 **비결정적 함수**는 노드마다 다른 결과를 만들 수 있다. 클라이언트에서 값을 미리 계산해서 넣어야 한다.

---

## 읽기와 쓰기

### 쓰기 (Write)

모든 쓰기는 리더 노드를 통해 처리된다. 팔로워에 쓰기 요청을 보내면 리더로 자동 리다이렉트된다.

```bash
# 테이블 생성
curl -XPOST 'http://localhost:4001/db/execute' \
  -H "Content-Type: application/json" \
  -d '[
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)"
  ]'

# 데이터 삽입
curl -XPOST 'http://localhost:4001/db/execute' \
  -H "Content-Type: application/json" \
  -d '[
    ["INSERT INTO users (name, email) VALUES (?, ?)", "Kim", "kim@example.com"]
  ]'
```

응답:

```json
{
  "results": [
    {
      "last_insert_id": 1,
      "rows_affected": 1
    }
  ]
}
```

### 읽기 (Read)

읽기에는 **일관성 수준**을 선택할 수 있다.

```bash
# 기본 읽기 (리더에서)
curl -XPOST 'http://localhost:4001/db/query' \
  -H "Content-Type: application/json" \
  -d '["SELECT * FROM users WHERE id = 1"]'
```

응답:

```json
{
  "results": [
    {
      "columns": ["id", "name", "email"],
      "types": ["integer", "text", "text"],
      "values": [[1, "Kim", "kim@example.com"]]
    }
  ]
}
```

---

## 일관성 모델

rqlite의 핵심 개념이다. 읽기 요청 시 **4가지 일관성 수준**을 선택할 수 있다:

### None

```bash
curl 'http://localhost:4001/db/query?level=none' \
  -H "Content-Type: application/json" \
  -d '["SELECT * FROM users"]'
```

어떤 노드든 로컬 SQLite에서 바로 읽는다. **가장 빠르지만 stale 데이터를 읽을 수 있다.** 팔로워 노드가 아직 최신 로그를 적용하지 않았을 수 있기 때문이다.

### Weak (기본값)

```bash
curl 'http://localhost:4001/db/query?level=weak' \
  -H "Content-Type: application/json" \
  -d '["SELECT * FROM users"]'
```

리더 노드에서만 읽는다. 리더는 **자신이 리더인지 확인한 후** 로컬 SQLite에서 읽는다. 대부분의 경우 최신 데이터를 반환하지만, 네트워크 파티션 상황에서 stale 리더가 응답할 가능성이 있다.

### Strong

```bash
curl 'http://localhost:4001/db/query?level=strong' \
  -H "Content-Type: application/json" \
  -d '["SELECT * FROM users"]'
```

리더가 **Raft 합의를 통해 자신이 여전히 리더임을 확인**한 후 읽는다. 가장 강한 일관성을 보장하지만, 합의 과정 때문에 느리다.

### 비교표

| 수준 | 읽기 위치 | 리더 확인 | Stale 가능성 | 성능 |
|------|----------|----------|-------------|------|
| None | 아무 노드 | X | 높음 | 가장 빠름 |
| Weak | 리더 | 로컬 확인 | 낮음 | 빠름 |
| Strong | 리더 | Raft 합의 | 없음 | 느림 |

**실무 가이드**: 대부분의 읽기는 `weak`로 충분하다. 금융 데이터나 카운터처럼 정확성이 중요한 경우에만 `strong`을 사용한다.

---

## 클러스터 구성

### 3노드 클러스터 시작

최소 3노드가 권장된다 (1노드 장애 허용).

```bash
# 노드 1 (리더 후보)
rqlited -node-id 1 -http-addr localhost:4001 -raft-addr localhost:4002 \
  ~/node.1

# 노드 2
rqlited -node-id 2 -http-addr localhost:4003 -raft-addr localhost:4004 \
  -join http://localhost:4001 ~/node.2

# 노드 3
rqlited -node-id 3 -http-addr localhost:4005 -raft-addr localhost:4006 \
  -join http://localhost:4001 ~/node.3
```

### 클러스터 상태 확인

```bash
curl http://localhost:4001/status | python3 -m json.tool
```

```json
{
  "store": {
    "raft": {
      "state": "Leader",
      "num_peers": 2,
      "commit_index": 42,
      "applied_index": 42
    },
    "sqlite3": {
      "db_size": 8192,
      "mem_stats": { ... }
    }
  }
}
```

### 노드 장애 시나리오

```
3노드 클러스터: [Leader] [Follower1] [Follower2]

1. Follower1 다운
   → 정상 동작 (quorum 2/3 유지)

2. Leader 다운
   → Follower1 또는 Follower2가 새 리더로 선출
   → 자동 복구 (수 초 이내)

3. 2노드 동시 다운
   → quorum 상실 → 클러스터 읽기 전용 또는 중단
```

---

## 트랜잭션

rqlite는 **하나의 HTTP 요청 내에서 다수의 SQL 문을 트랜잭션으로 묶을 수 있다.**

```bash
curl -XPOST 'http://localhost:4001/db/execute?transaction' \
  -H "Content-Type: application/json" \
  -d '[
    "BEGIN",
    ["INSERT INTO orders (user_id, amount) VALUES (?, ?)", 1, 50000],
    ["UPDATE users SET total_spent = total_spent + ? WHERE id = ?", 50000, 1],
    "COMMIT"
  ]'
```

단, 일반적인 RDBMS와 다른 점이 있다:

- 트랜잭션은 **단일 HTTP 요청** 내에서만 가능하다
- 여러 요청에 걸친 `BEGIN ... COMMIT`은 지원하지 않는다
- 이것은 의도적인 설계 — 분산 환경에서 장기 트랜잭션은 합의 프로토콜과 충돌하기 때문이다

---

## 성능 특성

### 벤치마크 (참고용)

rqlite는 성능보다 **정확성과 단순함**을 우선한다. 공식 벤치마크 기준:

| 작업 | 성능 (3노드) |
|------|-------------|
| 쓰기 (단건) | ~1,000 ops/sec |
| 쓰기 (배치 100건) | ~10,000 ops/sec |
| 읽기 (none) | ~50,000 ops/sec |
| 읽기 (strong) | ~5,000 ops/sec |

### 배치 쓰기

성능이 중요하면 배치 요청을 활용한다:

```bash
curl -XPOST 'http://localhost:4001/db/execute' \
  -H "Content-Type: application/json" \
  -d '[
    ["INSERT INTO events (type, data) VALUES (?, ?)", "click", "btn_1"],
    ["INSERT INTO events (type, data) VALUES (?, ?)", "view", "page_home"],
    ["INSERT INTO events (type, data) VALUES (?, ?)", "click", "btn_2"]
  ]'
```

배치 내의 모든 SQL 문은 하나의 Raft 로그 엔트리로 처리되므로, 합의 오버헤드가 1회만 발생한다.

---

## rqlite가 적합한 경우

### 적합한 사용 사례

- **설정/메타데이터 저장소**: 분산 시스템의 설정값, 피처 플래그
- **서비스 디스커버리**: 경량 서비스 레지스트리
- **IoT 데이터 수집**: 엣지 노드에서 센서 데이터 수집
- **소규모 SaaS 백엔드**: 트래픽이 높지 않은 서비스의 메인 DB
- **에지 컴퓨팅**: 인터넷 연결이 불안정한 환경에서 로컬 DB + 복제

### 적합하지 않은 경우

- **대량 쓰기 워크로드**: 모든 쓰기가 리더 → Raft 합의를 거치므로 병목
- **대용량 데이터**: SQLite 기반이라 수십 GB 이상은 비효율적
- **복잡한 트랜잭션**: 여러 요청에 걸친 트랜잭션 불가
- **강력한 SQL 기능 필요**: 저장 프로시저, 트리거, CTE 등은 SQLite 수준에 제한

---

## etcd / Consul과의 비교

rqlite는 종종 etcd나 Consul과 비교된다. 모두 Raft 기반 분산 저장소이지만, 데이터 모델이 다르다.

| | rqlite | etcd | Consul KV |
|---|--------|------|-----------|
| 데이터 모델 | **관계형 (SQL)** | Key-Value | Key-Value |
| 쿼리 언어 | SQL | gRPC / HTTP | HTTP |
| JOIN, GROUP BY | O | X | X |
| 스키마 | O (테이블) | X | X |
| 대상 | 경량 애플리케이션 DB | 쿠버네티스 설정 | 서비스 디스커버리 |

**rqlite를 고르는 이유**: Key-Value로는 부족하고, 관계형 쿼리가 필요한데 PostgreSQL은 과한 경우.

---

## Spring Boot 연동

rqlite는 HTTP API 기반이므로, JDBC 드라이버 없이 REST 클라이언트로 사용한다.

```kotlin
@Service
class RqliteClient(
    private val restTemplate: RestTemplate,
) {
    private val baseUrl = "http://localhost:4001"

    fun execute(vararg statements: Any): ResponseEntity<String> {
        return restTemplate.postForEntity(
            "$baseUrl/db/execute",
            statements.toList(),
            String::class.java
        )
    }

    fun query(sql: String, level: String = "weak"): ResponseEntity<String> {
        return restTemplate.postForEntity(
            "$baseUrl/db/query?level=$level",
            listOf(sql),
            String::class.java
        )
    }
}
```

```kotlin
// 사용 예시
rqliteClient.execute(
    listOf("INSERT INTO configs (key, value) VALUES (?, ?)", "feature.dark_mode", "true")
)

val result = rqliteClient.query("SELECT * FROM configs WHERE key = 'feature.dark_mode'")
```

> 커뮤니티에서 만든 [rqlite JDBC 드라이버](https://github.com/rqlite/rqlite-java)도 있지만, 아직 실험적 단계다.

---

## 마치며

rqlite는 "분산 데이터베이스"라는 단어에서 떠오르는 복잡함과는 거리가 멀다. 단일 바이너리, HTTP API, SQL — 이 세 가지로 분산 데이터 저장 문제를 해결한다.

모든 시스템에 PostgreSQL 클러스터가 필요한 건 아니다. 설정 저장소, 메타데이터 DB, 작은 서비스의 메인 DB가 필요하다면, rqlite는 매우 실용적인 선택이다.

분산 시스템의 기본 개념이 궁금하다면 [데이터베이스 트랜잭션과 격리 수준](/2026/04/06/database-transaction-isolation/)에서 트랜잭션의 기초를 먼저 정리하는 것을 추천한다.
