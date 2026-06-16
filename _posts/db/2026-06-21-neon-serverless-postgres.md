---
title: "Neon 서버리스 Postgres: WAL이 곧 스토리지다"
subtitle: "오픈소스가 스토리지·컴퓨트 분리를 푸는 다른 방법"
layout: post
date: "2026-06-21"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "neon, serverless postgres, pageserver, safekeeper, wal, branching, scale to zero, getpage"
series: "PostgreSQL 마스터"
tags:
  - PostgreSQL
  - Database
  - Backend
categories:
  - database
description: "Neon 서버리스 Postgres의 내부 아키텍처. compute/Safekeeper/Pageserver 3계층, GetPage@LSN, Paxos WAL 내구성, copy-on-write 브랜칭, scale-to-zero를 Aurora와 비교한다."
---

[앞 편](/2026/06/20/postgresql-vs-aurora/)에서 Amazon Aurora가 "스토리지와 컴퓨트를 분리하고, 로그를 데이터베이스로 삼는다"는 발상으로 전통 PostgreSQL을 뒤집는 것을 봤다. 그런데 같은 문제를 푸는 길이 하나만 있는 것은 아니다.

**Neon**은 Aurora와 **똑같은 문제 의식**(스토리지·컴퓨트 분리, WAL 중심)에서 출발하지만, 이를 **오픈소스로, 그리고 다른 방식으로** 풀어낸 서버리스 Postgres다. Aurora가 AWS 내부의 폐쇄형 스토리지 서비스라면, Neon은 Apache 2.0 라이선스로 코드가 공개된(`neondatabase/neon`, 주로 Rust로 작성) 시스템이다. 이 편에서는 Neon의 내부 아키텍처를 Aurora와 **비교 중심**으로 본다.

---

## Aurora와 같은 출발점, 다른 길

두 시스템 모두 [Part 2에서 본 WAL의 명제](/2026/06/14/postgresql-wal-recovery/) — "WAL이 진실의 원본"이라는 원칙을 아키텍처 전체로 밀어붙인다. 차이는 그 위에 무엇을 올렸느냐다.

| | Amazon Aurora | Neon |
|---|---|---|
| 라이선스 | 폐쇄형(AWS 전용) | **오픈소스(Apache 2.0)** |
| 컴퓨트 | PostgreSQL **호환** 엔진 | **진짜 PostgreSQL**(smgr만 교체) |
| WAL 내구성 | 6중 복제 쿼럼(4/6) | **Safekeeper Paxos 합의**(보통 3대 다수결) |
| 페이지 저장 | 분산 스토리지 세그먼트 | **Pageserver + S3(bottomless)** |

같은 "WAL을 어떻게 다룰까"라는 질문에, Aurora는 *전용 분산 스토리지 + 쿼럼*으로, Neon은 *합의 계층 + 로그 구조 페이지 서버 + 오브젝트 스토리지*로 답한 셈이다.

---

## Neon의 3계층 아키텍처

Neon은 역할이 뚜렷하게 분리된 세 계층으로 구성된다.

```
        ┌──────────────────────────────────────────────┐
        │  Compute : 진짜 PostgreSQL (smgr 인터페이스 교체)  │
        └───────┬───────────────────────────┬──────────┘
       WAL 스트림 │                  GetPage@LSN │ (페이지 읽기 요청)
                ▼                              ▼
     ┌──────────────────────┐      ┌──────────────────────────┐
     │ Safekeeper × 3        │      │ Pageserver               │
     │ Paxos 합의로 WAL 내구성 │─WAL─>│ WAL ingest→페이지 재구성   │
     │ 다수결 ack → 커밋 확정  │      │ delta/image layer 저장    │
     └──────────────────────┘      └────────────┬─────────────┘
                                                 ▼
                                        ┌──────────────────┐
                                        │ S3 (bottomless)  │ ← 궁극의 진실
                                        └──────────────────┘
```

### ① Compute — 진짜 PostgreSQL, smgr만 교체

Neon의 컴퓨트는 PostgreSQL의 **포크가 아니다.** 거의 그대로의 PostgreSQL에 약간의 수정만 더해, **storage manager(smgr) 인터페이스**를 Neon 구현으로 갈아끼운다. 전통 PostgreSQL이라면 smgr이 로컬 디스크에 페이지를 읽고 썼겠지만, Neon에서는 그 자리에서 WAL을 Safekeeper로 흘려보내고 페이지는 Pageserver에 요청한다.

> [!IMPORTANT]
> 컴퓨트 노드는 **상태가 없다(stateless).** 영속 상태는 전부 스토리지 계층(Safekeeper·Pageserver·S3)에 있다. 이 "상태 없는 컴퓨트"가 뒤에서 볼 scale-to-zero와 브랜칭을 가능하게 하는 핵심 전제다.

"호환 엔진이 아니라 진짜 PostgreSQL"이라는 점은 실무에서 차이를 만든다. 컴퓨트가 거의 upstream 그대로이므로, 새 PostgreSQL 메이저 버전을 비교적 빨리 따라가고, 표준 확장(extension)과 도구 호환성에서 놀랄 일이 적다. 재설계의 무게를 **storage manager 한 인터페이스에 집중**시키고 나머지 PostgreSQL은 손대지 않은 설계의 보상이다.

### ② Safekeeper — Paxos로 WAL 내구성

컴퓨트가 만든 WAL은 곧바로 디스크가 아니라 **Safekeeper 클러스터**(보통 3대)로 스트리밍된다. Safekeeper들은 **Paxos 기반 합의**로 WAL을 복제하고, **다수결 정족수(3대 중 2대)**가 기록을 확인하면 그 트랜잭션을 커밋으로 인정한다.

여기서 [Part 8 Aurora](/2026/06/20/postgresql-vs-aurora/)와의 차이가 선명하다. Aurora는 단일 SQL 엔진이 정한 로그 순서를 **합의 없이 쿼럼(4/6)**으로 복제했다. Neon은 WAL 내구성에 **명시적 합의(Paxos)**를 둔다 — 소수의 Safekeeper로 강한 내구성을 얻는 대신, 합의 프로토콜의 비용을 진다.

### ③ Pageserver — WAL을 페이지로 재구성하는 로그 구조 스토리지

Pageserver는 Safekeeper를 거친 WAL을 **계속 ingest**하면서, 이를 키(릴레이션·페이지) 단위로 잘라 저장한다. 컴퓨트가 `GetPage@LSN(key, LSN)`으로 "이 페이지의 이 LSN 시점 상태"를 요청하면, Pageserver가 그 버전을 재구성해 돌려준다.

저장은 **레이어드 스토리지(layered storage)**로 한다.

| 레이어 | 내용 |
|--------|------|
| **Image layer** | 특정 LSN 시점의 키 범위 전체 스냅샷(페이지 이미지) |
| **Delta layer** | 특정 LSN 구간 동안의 WAL 레코드/변경 모음 |

페이지를 만들 때는 가장 가까운 image layer를 기반으로 그 위에 delta layer의 WAL을 덧입혀(replay) 원하는 LSN의 페이지를 구체화한다. 자주 안 쓰는 콜드 데이터 레이어는 **S3로 오프로드**되고, S3가 **궁극의 진실(ultimate source of truth)**이 된다. Pageserver의 로컬 SSD는 사실상 캐시다 — 그래서 "바닥이 없는(bottomless)" 스토리지라 부른다.

---

## WAL = 스토리지 인터페이스, 그 극단

[Part 2](/2026/06/14/postgresql-wal-recovery/)에서 WAL은 "변경을 먼저 기록하는 로그"였고, [Part 8 Aurora](/2026/06/20/postgresql-vs-aurora/)는 그 로그를 데이터베이스로 삼았다. Neon은 한 걸음 더 나아가 **WAL을 스토리지 계층의 인터페이스 그 자체**로 만든다.

- 컴퓨트가 스토리지에 **쓰는 것**은 오직 WAL 스트림이다(→ Safekeeper).
- 컴퓨트가 스토리지에서 **읽는 것**은 `GetPage@LSN` 한 종류다(→ Pageserver).

즉 컴퓨트와 스토리지 사이의 모든 대화가 "WAL을 보낸다 / 특정 LSN의 페이지를 받는다"로 환원된다. 페이지는 더 이상 1차 저장 단위가 아니라 **WAL로부터 임의 시점에 재구성되는 파생물**이다. 이 관점이 다음에 볼 브랜칭과 타임트래블을 자연스럽게 만든다.

---

## 쓰기와 읽기 경로를 따라가 보자

추상적인 그림을 실제 경로로 내려보면 Neon의 성능 특성이 분명해진다.

**쓰기·커밋 경로**

```
 컴퓨트(PG)            Safekeeper × 3              Pageserver
    │ WAL 생성
    ├── WAL 스트림 ───────> ① 수신·복제
    │                       ② Paxos 다수결(2/3) ack
    │ <── 커밋 확정 ──────────┘
    │                                    ┌─ (비동기) WAL ingest
    └────────────────────────────────────> ③ delta layer로 적재
```

커밋이 기다리는 것은 **Safekeeper의 다수결 ack까지**다. 페이지를 만드는 일(Pageserver의 ingest·재구성)은 그 경로 **밖에서 비동기로** 일어난다 — [Part 8 Aurora에서 스토리지 노드의 페이지 구체화가 포그라운드 밖이었던 것](/2026/06/20/postgresql-vs-aurora/)과 같은 철학이다.

**읽기 경로 — `GetPage@LSN`이 풀리는 순서**

컴퓨트가 버퍼 캐시에 없는 페이지를 찾으면 `GetPage@LSN`을 Pageserver로 보낸다. Pageserver는 다음 순서로 그 페이지를 만든다.

```
 ① Pageserver 메모리 캐시 확인 → 있으면 즉시 반환
 ② 없으면 Layer Storage에서 재구성:
      가장 가까운 image layer(기준 스냅샷)
        + 그 위 delta layer들의 WAL을 replay
 ③ 필요한 layer가 로컬에 없으면 S3에서 다운로드
```

| | 전통 PostgreSQL | Neon |
|---|---|---|
| 페이지 못 찾으면 | 로컬 디스크에서 읽음 | `GetPage@LSN`으로 Pageserver에 요청 |
| 페이지 출처 | 디스크의 그 페이지 | image layer + delta replay로 재구성 |
| 콜드 데이터 | 로컬 디스크 | S3에서 layer 다운로드 |

> [!NOTE]
> delta layer가 계속 쌓이면 재구성 시 replay할 WAL이 길어진다. 그래서 Pageserver는 주기적으로 delta를 **image layer로 합치는 컴팩션(compaction)**으로 재구성 비용을 일정하게 유지한다. [Part 2의 체크포인트](/2026/06/14/postgresql-wal-recovery/)가 "재생 구간을 줄여 복구를 빠르게" 했던 목적과 닮았다.

---

## 브랜칭: copy-on-write로 즉시 분기

페이지가 "특정 LSN에서 재구성되는 로그의 함수"라면, **과거의 어느 LSN에서 새 갈래를 트는 것**도 데이터 복사 없이 가능하다. Neon의 브랜칭이 바로 그것이다.

```sql
-- 운영 브랜치의 현재(또는 과거 임의 시점)에서 즉시 분기
-- (개념적 예시 — 실제로는 Neon API/CLI/콘솔로 수행)
-- main 브랜치 → dev 브랜치 생성: 데이터 복사 0, 수 밀리초
```

Neon 브랜칭은 **copy-on-write**다. 브랜치를 만들어도 데이터를 복사하지 않고, 부모의 레이어를 공유하다가 변경이 생긴 부분만 새로 쌓는다.

```
 main ──●────────●────────●  (현재 LSN)
         \        \
          \        ●──●     dev 브랜치 (LSN_b에서 분기)
           \
            ●──●──●          test 브랜치 (과거 LSN_a에서 분기)
   분기 시점까지의 레이어는 공유(복사 0),
   분기 후 변경분만 각 브랜치에 새로 쌓임 (copy-on-write)
```


> [!NOTE]
> 그래서 브랜칭은 데이터베이스 크기와 무관하게 **O(1), 보통 수 밀리초~1초 미만**에 끝난다. dev/preview/test 환경을 git 브랜치처럼 즉석에서 따고 버리는 워크플로가 가능하다. Aurora의 fast clone도 copy-on-write 복제를 제공하지만, Neon은 이를 **git 같은 1급 브랜치 모델**로 전면에 내세운다는 점이 다르다.

---

## Scale to Zero: 진짜 서버리스

컴퓨트가 상태 없는(stateless) PostgreSQL이라는 사실이 여기서 결정적으로 작동한다. 유휴 상태가 이어지면 Neon은 **컴퓨트를 통째로 정지(scale to zero)**시킨다. 영속 상태는 전부 스토리지 계층에 있으니 컴퓨트는 언제든 버려도 된다.

다시 접속이 들어오면 컴퓨트를 **콜드 스타트**로 깨운다(보통 수백 ms~수초). 정지된 동안에는 컴퓨트 비용이 들지 않는다 — 사용량이 들쭉날쭉한 개발/프리뷰 환경에 잘 맞는 모델이다.

scale-to-zero는 0과 1 사이의 스위치만은 아니다. Neon은 깨어 있는 동안에도 **부하에 따라 컴퓨트(vCPU/메모리)를 자동으로 키우고 줄이는 오토스케일링**을 함께 제공한다. 설정한 최소~최대 한도 안에서 트래픽에 맞춰 용량이 움직이고, 트래픽이 끊기면 그제서야 0까지 내려간다. "쓰는 만큼만"이라는 서버리스의 약속을 컴퓨트 차원에서 구현한 셈이다.

| | Aurora Serverless v2 | Neon |
|---|---|---|
| 스케일 단위 | ACU 단위 자동 조절 | 컴퓨트 인스턴스 기동/정지 |
| 완전 정지 | 최소 용량 유지(자동 일시정지 옵션) | **0으로 완전 정지가 기본 모델** |
| 재기동 | 거의 즉시 | 콜드 스타트(수백 ms~수초) |

> [!WARNING]
> scale-to-zero의 대가는 **콜드 스타트 지연**이다. 정지 상태에서 첫 쿼리는 컴퓨트 기동 시간을 기다린다. 지연에 민감한 상시 트래픽 서비스라면 이 특성을 반드시 고려해야 한다.

---

## PITR와 타임트래블

로그 구조 스토리지의 또 다른 선물이 **시점 복구(PITR)**다. Pageserver는 보존 기간 내의 WAL과 레이어를 갖고 있으므로, 임의의 LSN/시각의 페이지를 재구성할 수 있다.

[Part 2의 PITR](/2026/06/14/postgresql-wal-recovery/)이 "베이스 백업 + WAL 재생"이었다면, Neon에서는 페이지 자체가 늘 "어떤 LSN의 함수"이므로 **별도 복원 작업 없이 과거 시점을 곧바로 조회하거나 그 시점으로 브랜치**할 수 있다.

```
 운영 중 사고: 06-21 14:03에 실수로 DELETE
  → 그 직전 시점(LSN 또는 타임스탬프)에서 브랜치 생성
  → 새 브랜치에서 지워진 데이터를 조회/추출
  → 본 브랜치는 그대로, 복구는 곁가지에서 안전하게
```

전통적인 "전체 복원 후 확인"과 달리, 보존 기간(retention) 안의 어느 시점이든 **곁가지 브랜치로 즉시 들여다보는** 방식이다. 운영 본류를 멈추거나 되감지 않고도 사고 직전을 살필 수 있다 — 타임트래블에 가깝다.

---

## Aurora vs Neon: 한눈에 보는 비교

같은 문제(스토리지·컴퓨트 분리)에 대한 두 답을 정리하면 이렇다.

| 차원 | Amazon Aurora | Neon |
|------|---------------|------|
| 라이선스/공개 | 폐쇄형(AWS 매니지드) | 오픈소스(Apache 2.0, Rust) |
| 컴퓨트 | PostgreSQL 호환 엔진 | 진짜 PostgreSQL + 커스텀 smgr |
| WAL 내구성 | 분산 스토리지 6중 복제, 4/6 쿼럼 | Safekeeper Paxos 합의(보통 2/3) |
| 페이지 저장 | 다중 AZ 분산 세그먼트(10GB) | Pageserver 레이어 + S3 bottomless |
| 읽기 인터페이스 | 스토리지가 페이지 제공 | `GetPage@LSN` |
| 브랜칭 | fast clone(copy-on-write) | git 같은 1급 브랜치(copy-on-write) |
| Scale to zero | 최소 용량 유지(옵션) | 완전 정지 + 콜드 스타트 |
| 복제/읽기 확장 | 공유 스토리지 리더 최대 15 | 공유 스토리지 read replica |
| 강점 | 검증된 매니지드 OLTP, AZ+1 내결함 | 오픈소스, 브랜칭/서버리스 개발 경험 |

어느 쪽이 절대적으로 낫다기보다, **무엇을 우선했는가**가 다르다. Aurora는 대규모 OLTP의 가용성·성숙도를, Neon은 오픈소스 개방성과 개발자 워크플로(브랜칭·서버리스)를 앞세운다.

---

## 트레이드오프와 한계

- **콜드 스타트 지연** — scale-to-zero의 이면. 상시 저지연이 필요한 워크로드에는 불리할 수 있다.
- **멀티테넌시** — Pageserver/Safekeeper는 여러 테넌트를 함께 호스팅하므로, 격리와 시끄러운 이웃(noisy neighbor) 관리가 설계상 중요하다.
- **상대적으로 신생 생태계** — Aurora 같은 오랜 운영 레퍼런스 축적은 아직 적다. 운영 도구·사례가 빠르게 늘고는 있다.
- **워크로드 적합성** — 브랜칭·프리뷰·간헐적 트래픽엔 탁월하지만, 모든 경우의 정답은 아니다. [Part 6의 커넥션/메모리 특성](/2026/06/18/postgresql-connection-memory/)도 서버리스 환경에서 함께 고려해야 한다.

---

## 정리

1. Neon은 Aurora와 **같은 문제**(스토리지·컴퓨트 분리, WAL 중심)를 **오픈소스로 다르게** 푼다.
2. **3계층** — 진짜 PostgreSQL 컴퓨트(smgr 교체), Paxos 합의로 WAL을 지키는 **Safekeeper**, WAL을 페이지로 재구성하고 S3로 오프로드하는 **Pageserver**.
3. 컴퓨트↔스토리지 대화가 **"WAL을 보낸다 / `GetPage@LSN`으로 받는다"**로 환원된다 — 페이지는 로그의 파생물.
4. 페이지가 로그의 함수이므로 **copy-on-write 브랜칭**(O(1), 수 ms)과 **즉시 PITR/타임트래블**이 자연스럽다.
5. 상태 없는 컴퓨트 덕에 **scale-to-zero**가 가능하다 — 대가는 콜드 스타트 지연.
6. Aurora의 *쿼럼*과 Neon의 *Paxos*, *분산 세그먼트*와 *S3 bottomless*는 같은 질문에 대한 서로 다른 답이다.

이 시리즈를 관통하는 결론은 처음부터 하나였다 — **WAL을 이해하면 그 위에 세운 모든 설계가 같은 언어로 읽힌다.** 전통 PostgreSQL의 크래시 복구도, Aurora의 분산 스토리지도, Neon의 브랜칭도 결국 "변경을 먼저 로그에 적는다"는 한 줄에서 갈라져 나온 이야기였다.

---

## 관련 포스트

- [PostgreSQL vs Aurora: 클라우드가 뒤집은 DB 내부](/2026/06/20/postgresql-vs-aurora/) — Part 8. 같은 문제를 푼 또 다른 답
- [PostgreSQL WAL과 크래시 복구](/2026/06/14/postgresql-wal-recovery/) — Part 2. Neon이 인터페이스로 삼은 WAL의 원형
- [PostgreSQL 복제와 고가용성(HA)](/2026/06/17/postgresql-replication-ha/) — Part 5. 공유 스토리지 복제와의 대비
- [PostgreSQL 커넥션과 메모리 구조](/2026/06/18/postgresql-connection-memory/) — Part 6. 서버리스 컴퓨트의 리소스 모델
