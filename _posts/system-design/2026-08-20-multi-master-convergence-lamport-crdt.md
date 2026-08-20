---
layout: post
title: "멀티마스터 수렴: Lamport 시계부터 CRDT까지"
subtitle: "동시 쓰기 충돌을 결정론적으로 녹여 모든 복제본을 하나로"
date: "2026-08-20"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #24313f 100%)"
catalog: true
series: "System Design"
keywords: "distributed systems, lamport clock, vector clock, crdt, hlc, last-write-wins, eventual consistency, multi-master"
tags:
  - Distributed Systems
  - CRDT
  - Consistency
  - System Design
categories:
  - system-design
description: "멀티마스터에서 동시 쓰기 충돌을 어떻게 결정론적으로 수렴시키나. Lamport 논리시계, LWW, 벡터시계, CRDT(G-Counter·OR-Set), HLC, 합의 vs 수렴을 원전 기반으로 정리한다."
---

## 멀티마스터는 왜 발산하는가

복제본이 여럿이어도 쓰기를 한 노드(단일 마스터)로만 받으면 순서는 늘 명확하다. [PostgreSQL 스트리밍 복제](/2026/06/17/postgresql-replication-ha/)처럼 프라이머리가 정한 순서를 나머지가 따라가면 된다.

문제는 **멀티마스터(multi-master)** — 여러 노드가 **동시에** 쓰기를 받을 때다. 다중 리전 데이터베이스, 오프라인을 지원하는 모바일 앱 동기화, Dynamo류 AP 스토어가 모두 이 구조다. 여기서는 두 노드가 같은 키를 거의 동시에 바꾸는 일이 필연적으로 생긴다.

```
   시각 →
   Node A:  set x = 1  ───────────────► (A는 x=1이라 믿음)
   Node B:  set x = 2  ───────────────► (B는 x=2라 믿음)
              두 쓰기가 서로를 모른 채 교차 전파
              → A는 x=1, B는 x=2 로 발산(diverge)
```

네트워크에는 전역 시계도, 전역 순서도 없다. 그렇다면 **"동시에 일어난 충돌 쓰기를 어떻게 처리해야, 모든 복제본이 결국 똑같은 하나의 상태로 수렴(converge)하는가?"** 이 글은 그 질문에 대한 40년의 답 — Lamport 논리 시계에서 CRDT, HLC까지 — 을 원리 중심으로 따라간다.

> [!NOTE]
> 수렴의 최소 조건은 하나다. 충돌 해소 규칙(merge)이 **결정론적**이어서, 각 복제본이 **어떤 순서로 업데이트를 받든** 같은 결과에 도달해야 한다. 이 글의 모든 기법은 결국 "결정론적 merge를 어떻게 만드느냐"의 변주다.

---

## Lamport 논리 시계 (1978)

전역 물리 시계가 없으니, Leslie Lamport는 1978년 논문 *"Time, Clocks, and the Ordering of Events in a Distributed System"*에서 **사건의 인과 순서**를 시계 없이 정의했다.

### happens-before (→)

두 사건 사이의 **happens-before** 관계 `a → b`는 세 규칙으로 정의된다.

1. 같은 프로세스 안에서 `a`가 `b`보다 먼저면 `a → b`
2. `a`가 메시지 send, `b`가 그 메시지의 receive면 `a → b`
3. `a → b`이고 `b → c`면 `a → c` (이행성)

`a → b`도 `b → a`도 아니면 두 사건은 **동시(concurrent)**, `a ∥ b`라 쓴다. happens-before는 전체 순서가 아니라 **부분 순서(partial order)**다.

### 논리 시계 규칙

각 프로세스가 정수 카운터 `C`를 갖고 다음처럼 갱신한다.

```
IR1) 프로세스 내에서 사건이 일어날 때마다:  C = C + 1
IR2) 메시지 send 시:  타임스탬프로 현재 C를 실어 보냄
     메시지 recv 시:  C = max(C_local, C_msg) + 1
```

### 워크드 예제

```
        P1:   x(1)
                         (P1과 P2 사이엔 아직 메시지 없음)
        P2:   f1(1) ── f2(2)

   C(x)=1,  C(f1)=1,  C(f2)=2
```

여기서 핵심 성질과 **한계**가 동시에 드러난다.

> [!IMPORTANT]
> Lamport 시계는 **클럭 조건**을 만족한다 — `a → b` 이면 반드시 `C(a) < C(b)`.
> 하지만 **역은 성립하지 않는다.** 위에서 `C(x)=1 < C(f2)=2`지만 `x`와 `f2` 사이엔 인과 경로가 없다 — 둘은 **동시**다. 즉 타임스탬프 대소만으로는 "진짜 인과"와 "우연한 동시"를 구별할 수 없다.

### 전체 순서 만들기

수렴을 위해선 "누가 이겼는지"를 모두가 똑같이 정해야 하니, 부분 순서를 **전체 순서(total order)**로 확장한다. 방법은 간단하다 — 타임스탬프가 같으면 **프로세스 ID로 타이브레이크**한다.

```
a ≺ b  ⟺  C(a) < C(b)  또는  ( C(a) = C(b) 이고 pid(a) < pid(b) )
```

이제 `(C, pid)` 쌍은 모든 사건에 유일한 전순위를 부여한다. 이 결정론적 전체 순서가 다음 절 LWW의 토대다.

---

## LWW: Last-Write-Wins 수렴

가장 단순한 충돌 해소는 **타임스탬프가 큰 쪽이 이긴다(Last-Write-Wins)**. 동점이면 노드 ID로 가른다.

```
merge(v1, v2):
    if  ts(v1) > ts(v2):                 return v1
    if  ts(v1) < ts(v2):                 return v2
    return  nodeId(v1) > nodeId(v2) ? v1 : v2   # 동점 타이브레이크
```

이 merge는 **교환법칙·결합법칙·멱등법칙**을 만족한다. 그래서 각 복제본이 충돌 버전들을 **어떤 순서로 받든** 같은 승자를 뽑고, 결국 같은 상태로 수렴한다.

```
   A: set x=1 @ ts=5,nodeA        B: set x=2 @ ts=7,nodeB
   ── 서로 전파 후 ──
   A: merge(x=1@5, x=2@7) → x=2   B: merge(x=2@7, x=1@5) → x=2
   두 노드 모두 x=2 로 수렴 ✓ (도착 순서 무관)
```

### LWW의 치명적 약점: 조용한 데이터 손실

LWW는 수렴하지만, **진 쪽의 쓰기를 통째로 버린다.** 이게 "동시" 쓰기에서 데이터 손실로 이어진다.

```
   장바구니 담기 (동시):
   A: add "우유"   @ ts=10,nodeA
   B: add "빵"     @ ts=11,nodeB
   LWW 결과 → ts 큰 B가 승 → 장바구니 = {빵}
   "우유"는 흔적도 없이 사라짐 ✗
```

카운터라면 더 노골적이다. 잔액 100에서 A가 +10, B가 +10을 동시에 하면, 두 쓰기가 각각 "110"이라는 결과 상태를 쓰고, LWW는 그 중 하나만 남겨 **최종 110** — 한 번의 증가가 증발한다(정답은 120). 동시성이 곧 손실이다.

실제로 **Apache Cassandra**가 이 방식이다 — 셀(컬럼) 단위 타임스탬프로 LWW를 적용해, 최신 타임스탬프를 단 쓰기가 이기고 진 쪽 업데이트는 위 예시처럼 조용히 사라질 수 있다. Amazon DynamoDB의 기본 충돌 해소도 last-writer-wins다.

이 한계의 뿌리는 Lamport 시계와 같다 — **"동시"를 인식하지 못하기 때문**이다. 그래서 다음 단계는 동시를 제대로 감지하는 것이다.

---

## 벡터 시계: 인과와 동시를 구별한다

Lamport 시계의 한계(동시 판별 불가)를 푼 것이 **벡터 시계(vector clock)**다. Colin Fidge와 Friedemann Mattern이 1988년 각각 제안했다. 노드가 `N`개면, 각 노드는 길이 `N`의 벡터를 유지한다.

```
IR1) 로컬 사건: V[self] += 1
IR2) send: 벡터 V를 실어 보냄
     recv: 성분별 max 후 자기 성분 +1
           for k: V[k] = max(V[k], V_msg[k]);  V[self] += 1
```

### 비교 규칙

```
V(a) ≤ V(b)     ⟺  모든 k에 대해 V(a)[k] ≤ V(b)[k]
a → b (인과)    ⟺  V(a) ≤ V(b) 이고 V(a) ≠ V(b)
a ∥ b (동시)    ⟺  서로 ≤ 가 아님 (어떤 성분은 크고 어떤 성분은 작음)
```

### 워크드 예제

```
   노드 [A,B,C]
   A:  a1 [1,0,0] ── a2(send m)[2,0,0] ─────────────┐
                                                     │ m=[2,0,0]
   B:  b1 [0,1,0] ──────────── b2(recv m)[2,2,0]  ◄──┘
   C:  c1 [0,0,1]

   비교:
     a1[1,0,0] vs b2[2,2,0] → a1 ≤ b2, ≠  ⇒  a1 → b2  (인과)
     b1[0,1,0] vs c1[0,0,1] → 서로 ≤ 아님  ⇒  b1 ∥ c1  (동시)
```

이제 시스템은 "이 두 버전이 진짜 동시 충돌인지"를 **정확히** 안다. Amazon **Dynamo(2007)**가 바로 이 방식이다 — 충돌하는 버전들을 **siblings**로 보존해 애플리케이션(또는 다음 읽기)에게 병합을 위임한다. Riak도 같은 계열이다.

| 기법 | 동시 감지 | 저장 비용 | 충돌 시 |
|------|-----------|-----------|---------|
| Lamport 시계 | ✗ (전순위만) | O(1) | LWW로 임의 승자 |
| 벡터 시계 | ✓ 정확 | O(노드 수) | siblings 노출/앱 병합 |

> [!NOTE]
> 벡터 시계는 충돌을 **감지**할 뿐, **해소**하지는 않는다. "우유 vs 빵"이 동시임을 알려줄 뿐, 둘을 어떻게 합칠지는 여전히 앱의 몫이다. 그 병합까지 자동화·무손실로 끌어올린 것이 CRDT다.

---

## CRDT: 손실 없이 수렴하는 자료구조

**CRDT(Conflict-free Replicated Data Type)**는 Marc Shapiro 등이 2011년 정식화했다. 핵심 보장은 **강한 최종 일관성(Strong Eventual Consistency, SEC)** — *같은 업데이트 집합을 받은 두 복제본은 (롤백·합의 없이) 즉시 같은 상태다.*

CRDT는 두 갈래다.

- **상태 기반(CvRDT)**: 복제본이 주기적으로 자기 **상태**를 교환하고, `merge`로 합친다. 상태들이 **join-semilattice**를 이루고 `merge`가 그 **최소상계(LUB)**이면, `merge`가 **결합·교환·멱등**을 만족해 순서·중복과 무관하게 같은 LUB로 수렴한다.
- **연산 기반(CmRDT)**: 상태 대신 **연산**을 전파하되, 동시 연산들이 **교환 가능(commutative)**하도록 설계한다.

### G-Counter (증가 전용 카운터)

노드별 카운트를 벡터로 둔다. 자기 것만 올리고, merge는 **성분별 max**, 값은 **전 성분의 합**이다.

```
G-Counter (노드 [A,B,C]):
   increment@A:  P[A] += 1
   value       = P[A] + P[B] + P[C]
   merge(P,Q)  = [ max(P[k],Q[k]) for k ]     # 성분별 max = LUB

   A: +10 → [10,0,0]       B: +10 → [0,10,0]  (앞의 잔액 예시, 동시)
   merge → [10,10,0]       value = 20         # 두 증가 모두 보존 → 잔액 120 ✓
```

LWW가 잃어버린 동시 증가를, G-Counter는 **성분을 분리**해 무손실로 합친다. 감소가 필요하면 증가용 `P`와 감소용 `N` 두 G-Counter를 쓰는 **PN-Counter**로 확장한다(`value = sum(P) − sum(N)`).

### OR-Set (Observed-Remove Set)

집합에서 "동시 add와 remove"가 부딪히면 무엇이 이겨야 할까? OR-Set은 **고유 태그**로 이를 결정론화한다.

```
   add(e)    : 유일 태그 t 생성 → {(e, t)} 추가
   remove(e) : "현재 관측된" (e,*) 태그들만 tombstone 처리
   contains(e) ⟺  tombstone 안 된 (e, t) 태그가 하나라도 존재

   동시 시나리오:
     A: add("x") → (x, a1)
     B: remove("x")  (B가 관측한 태그는 없음/과거 것만)
     A': add("x") → (x, a2)
   merge 결과: a2 는 remove가 관측 못 함 → x 존재 ✓  (add-wins)
```

remove는 **자기가 실제로 본 태그만** 지우므로, 그와 동시에 일어난 add는 살아남는다. 순서와 무관하게 같은 결과 → 수렴. **LWW-Register**(값+타임스탬프, merge는 큰 ts 채택)까지 포함해, CRDT는 "merge를 semilattice의 LUB로 설계"하는 한 가지 아이디어의 여러 구현이다.

> [!IMPORTANT]
> CRDT 수렴의 직관: `merge`가 **결합·교환·멱등**이면, 어떤 복제본이 어떤 순서로 무엇을 몇 번 받든 결과는 "받은 상태들의 LUB" 하나로 고정된다. 그래서 **조율(coordination) 없이** 항상 같은 값에 도달한다. **Redis Enterprise Active-Active**(CRDB)가 이 CRDT 기반 멀티마스터의 대표 사례다.

---

## HLC: 물리 시계와 논리 시계의 결합 (2014)

LWW를 **물리 벽시계**로 돌리면 편하지만 위험하다. 노드 간 **클럭 스큐(clock skew)** 때문에, 인과적으로 나중에 일어난 쓰기가 더 작은 물리 타임스탬프를 달고 와서 **지는** 일이 생긴다 — 인과 역전이다.

**HLC(Hybrid Logical Clock)**는 Kulkarni·Demirbas 등이 2014년 *"Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases"*에서 제안했다. 각 타임스탬프를 `(l, c)` 쌍으로 둔다.

- `l` — 관측한 **물리 시각의 최댓값**(벽시계 근사)
- `c` — 같은 `l` 안에서 순서를 가르는 **논리 카운터**

```
   로컬/송신 이벤트 j:
     l_old = l
     l = max(l_old, pt())                 # pt() = 현재 물리 시각
     c = (l == l_old) ? c + 1 : 0

   수신(메시지 m 의 (l_m, c_m)):
     l_old = l
     l = max(l_old, l_m, pt())
     if   l == l_old == l_m:  c = max(c, c_m) + 1
     elif l == l_old:         c = c + 1
     elif l == l_m:           c = c_m + 1
     else:                    c = 0

   비교: (l, c) 사전식 — 물리부 l 이 우선, 같으면 c 로 타이브레이크
```

HLC는 **happens-before를 보존**하면서(논리 시계의 장점) 값이 **벽시계에서 크게 벗어나지 않는다**(물리 시계의 장점). 덕분에 HLC 타임스탬프로 LWW를 돌려도 인과가 역전되지 않고, 스냅샷·시간 질의도 자연스럽다. **CockroachDB, YugabyteDB**가 HLC를 트랜잭션 타임스탬프로 쓰고, **MongoDB**도 인과 일관성에 하이브리드 논리 시계를 사용한다.

| 시계 | 인과 보존 | 벽시계 근사 | 크기 |
|------|-----------|-------------|------|
| 물리 시계 | ✗ (스큐로 역전) | ✓ | O(1) |
| Lamport | ✓ (부분) | ✗ | O(1) |
| 벡터 시계 | ✓ (동시까지 정확) | ✗ | O(노드 수) |
| **HLC** | ✓ | ✓ | O(1) |

---

## 합의 vs 수렴: 두 갈래 길

지금까지의 기법(LWW·벡터시계·CRDT·HLC)은 모두 **무조율 수렴** 진영이다. 노드들이 서로 기다리지 않고 각자 쓰기를 받은 뒤, 나중에 결정론적으로 merge해 하나가 된다. 그 반대편에는 **합의(consensus)** 진영이 있다.

| | 합의 (Paxos/Raft) | 수렴 (LWW/CRDT) |
|---|---|---|
| 쓰기 시점 조율 | **필요** (정족수 동의 후 확정) | **불필요** (일단 로컬 커밋) |
| 일관성 | 강한 일관성(선형화) | 최종 일관성(SEC) |
| 가용성/지연 | 정족수 못 모으면 멈춤 | 분단 중에도 쓰기 수용 |
| CAP | CP 성향 | **AP 성향** |
| 대표 | [Neon Safekeeper(Paxos)](/2026/06/21/neon-serverless-postgres/), etcd/Raft | Dynamo, Riak, Redis Active-Active |

[Aurora의 4/6 쿼럼](/2026/06/20/postgresql-vs-aurora/)이나 [Neon의 Safekeeper Paxos](/2026/06/21/neon-serverless-postgres/)는 "쓰기를 확정하기 전에 조율"하는 쪽이다 — 단, 조율의 성격은 다르다. Neon Safekeeper는 실제 **Paxos 합의**지만, **Aurora의 4/6은 합의(Paxos)가 아니라 내구성 쿼럼**이다. Aurora는 단일 라이터로 로그 순서를 정하므로 Paxos·2PC를 **명시적으로 회피**한다. 그래도 둘 다 쿼럼 ack를 기다리므로 "쓰기 전 조율" 축에는 함께 놓인다. 반면 멀티마스터 AP 스토어는 "일단 받고 나중에 수렴"하는 이 글의 기법을 쓴다.

> [!NOTE]
> 흥미롭게도 **Leslie Lamport는 양쪽 길을 모두 닦았다** — 조율의 정석 **Paxos**와, 무조율 수렴의 뿌리인 **논리 시계**. 강한 일관성이 꼭 필요하면 합의로 조율 비용을 치르고, 가용성과 지연이 우선이면 수렴으로 조율을 없앤다. 정답은 워크로드가 정한다.

---

## 정리

1. 멀티마스터는 동시 쓰기로 **발산**한다. 수렴의 조건은 **결정론적 merge** — 도착 순서와 무관하게 같은 결과.
2. **Lamport 시계(1978)**: happens-before를 시계 없이 정의. `a→b ⟹ C(a)<C(b)`지만 **역은 거짓** — 동시를 구별 못 한다. `(C, pid)`로 전체 순서를 만든다.
3. **LWW**: ts 큰 쪽 승. 결정론적이라 수렴하지만, 동시 쓰기에서 **진 쪽을 조용히 버린다**(데이터 손실).
4. **벡터 시계**: 인과와 동시를 **정확히 구별**. Dynamo/Riak의 siblings. 단 감지일 뿐, 해소는 앱 몫.
5. **CRDT(2011)**: `merge`를 semilattice의 **LUB**로 설계 → 결합·교환·멱등 → **무손실·무조율 수렴(SEC)**. G-Counter(성분별 max), PN-Counter, OR-Set(태그로 add-wins). Redis Active-Active.
6. **HLC(2014)**: 물리+논리 결합. 클럭 스큐로 인한 **인과 역전을 막으면서** 벽시계를 근사. CockroachDB·YugabyteDB.
7. **합의 vs 수렴**: 조율해서 강한 일관성(Paxos/Raft, CP) vs 무조율로 최종 일관성(CRDT, AP). Lamport가 두 길을 다 만들었다.

한 줄로 줄이면 — **"모든 복제본이 같은 답에 도달하려면, 충돌을 푸는 규칙이 순서에 흔들리지 않아야 한다."** 논리 시계도, 벡터 시계도, CRDT도, HLC도 결국 이 결정론을 어디까지·어떤 비용으로 보장하느냐의 서로 다른 선택이다.

---

## 관련 포스트

- [PostgreSQL 복제와 고가용성(HA)](/2026/06/17/postgresql-replication-ha/) — 단일 마스터 복제와 동기/비동기 트레이드오프
- [PostgreSQL vs Aurora: 클라우드가 뒤집은 DB 내부](/2026/06/20/postgresql-vs-aurora/) — 쿼럼 기반 스토리지 복제
- [Neon 서버리스 Postgres](/2026/06/21/neon-serverless-postgres/) — Safekeeper의 Paxos 합의
- [MSA 핵심 패턴 — Circuit Breaker, Gateway, Discovery, Saga](/2026/04/03/msa-patterns/) — 분산 시스템 안정성 패턴
