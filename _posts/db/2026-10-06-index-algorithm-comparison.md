---
title: "인덱스 자료구조 알고리즘 비교: B-Tree vs Hash vs LSM-Tree"
subtitle: "탐색 비용과 시간복잡도부터 Write Amplification까지, 알고리즘 레벨에서 인덱스 고르기"
layout: post
date: "2026-10-06"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "index, b-tree, hash index, lsm-tree, write amplification, compaction, rocksdb, cassandra, innodb, database"
series: "Database"
tags:
  - Database
  - Algorithm
  - Backend
categories:
  - database
description: "인덱스 자료구조를 B-Tree, Hash, LSM-Tree 세 알고리즘 레벨에서 비교한다. 탐색 비용과 시간복잡도, Write Amplification·Compaction 트레이드오프, InnoDB/Redis/Cassandra·RocksDB 엔진별 매핑까지 정리."
---

## 인덱스가 푸는 문제: 탐색 비용

인덱스는 결국 "데이터를 어떻게 정렬/배치해두면 나중에 더 빨리 찾을 수 있을까"라는 질문에 대한 답이다. 인덱스가 없는 테이블에서 특정 값을 찾으려면 모든 행을 순서대로 비교하는 **Full Scan**, 즉 `O(n)`이 든다. 행이 100만 개면 최악의 경우 100만 번 비교해야 한다.

인덱스 알고리즘마다 이 비용을 줄이는 전략이 다르고, 그 전략의 차이가 곧 "언제 어떤 인덱스를 써야 하는가"의 답이 된다.

| 알고리즘 | 평균 동등 조회 | 범위 조회 | 정렬 지원 | 쓰기 비용 |
|---|---|---|---|---|
| B-Tree | `O(log n)` | `O(log n + m)` | O | 조회와 동일한 `O(log n)` (즉시 반영) |
| Hash | `O(1)` | 불가 (Full Scan) | X | `O(1)` (즉시 반영) |
| LSM-Tree | `O(log n)` ~ `O(k log n)` | `O(log n + m)` (레벨 수만큼 병합) | O | `O(1)` 수준 (지연 반영 + 백그라운드 Compaction) |

`m`은 범위 조회로 걸리는 결과 행 수, `k`는 LSM-Tree의 레벨 수다. 아래에서 각 알고리즘이 왜 이런 숫자를 갖는지 구조부터 살펴본다.

---

## B-Tree: 범용 인덱스의 표준

MySQL InnoDB, PostgreSQL, SQLite를 비롯한 대부분의 RDBMS가 기본 인덱스로 B-Tree(정확히는 변형인 B+Tree)를 쓰는 이유는 단 하나, **범용성**이다.

### 구조

B-Tree는 하나의 노드가 여러 개의 Key를 정렬된 상태로 들고 있고, Key와 Key 사이의 범위마다 자식 노드를 하나씩 연결하는 **균형 트리(Balanced Tree)**다. "균형"이 핵심이다 — 삽입/삭제가 일어나도 트리는 항상 재조정되어 루트에서 모든 리프까지의 깊이가 같게 유지된다.

```
                [ 30 | 60 ]
               /     |      \
         [10|20]  [40|50]  [70|80|90]
```

깊이가 항상 균등하기 때문에 **어떤 Key를 찾든 루트에서 리프까지 내려가는 비교 횟수가 같다.** 이 깊이가 `log n`에 비례하므로 동등 조회, 삽입, 삭제, 수정이 모두 `O(log n)`이다. 균형 트리이므로 이 `O(log n)`은 평균이 아니라 **최악의 경우에도 보장되는 값**이다 — 이게 Hash와 가장 크게 갈리는 지점이다.

단, 전체 데이터를 다 긁는 범위 조회(`SELECT * FROM t WHERE col > x`)는 리프 레벨을 옆으로 계속 순회해야 하므로 비용이 `O(log n + m)`이 된다. 조회 대상이 테이블 전체에 가까워질수록 이 비용은 `O(n)`에 수렴한다 — "B-Tree는 무조건 빠르다"가 아니라 "선택도(selectivity)가 낮을수록 B-Tree의 이점이 줄어든다"는 뜻이다.

### 범위 검색에 강한 이유

Hash와 달리 B-Tree는 원래 값을 변형하지 않고 그대로 정렬해서 저장한다. 그래서 부등호 연산(`<`, `>`, `BETWEEN`)과 `ORDER BY`에 인덱스를 그대로 활용할 수 있다.

```sql
-- B-Tree 인덱스가 있으면 리프 노드를 순서대로 읽기만 하면 된다
CREATE INDEX idx_orders_created_at ON orders (created_at);

SELECT * FROM orders
WHERE created_at BETWEEN '2026-09-01' AND '2026-09-30'
ORDER BY created_at;
```

값을 해시로 뭉개버리는 순간 "40보다 큰 값"이라는 질문에 답할 방법이 없어진다. 이 차이가 다음 절의 핵심이다.

---

## Hash: 동등 비교에 한정된 속도

Hash 인덱스는 컬럼 값을 해시 함수에 넣어 나온 결과(보통 4~8바이트)만 인덱스에 저장한다. 원래 값이 아무리 길어도 인덱스 엔트리 크기는 고정이고, 조회는 해시 버킷으로 바로 점프하므로 평균 `O(1)`이다. B-Tree의 `O(log n)`보다 이론상 빠르다.

하지만 대가가 있다.

- **동등 비교(`=`)만 가능하다.** 해시 값은 원래 값의 순서 정보를 전혀 보존하지 않으므로 "크다/작다"를 판단할 수 없다.
- **정렬에 쓸 수 없다.** `ORDER BY`는 해시 인덱스를 아예 사용하지 못한다.
- **해시 충돌(Collision)이 발생하면** 같은 버킷에 여러 키가 몰리고, 체이닝으로 처리하는 구조에서는 최악의 경우 조회가 `O(n)`까지 느려질 수 있다.

```sql
-- PostgreSQL: Hash 인덱스 생성
CREATE INDEX idx_hash_status ON orders USING hash (status);

-- ✅ 동등 비교 — 인덱스 사용됨
SELECT * FROM orders WHERE status = 'PAID';

-- ❌ 범위 비교 — Hash 인덱스가 아예 후보에서 제외됨
SELECT * FROM orders WHERE status > 'PAID';
```

그래서 Hash는 "이 컬럼은 영원히 `=` 조회만 할 것"이라는 확신이 있을 때만 쓰는 특수 목적 인덱스다. 범용 RDBMS 인덱스로는 B-Tree가 기본값인 이유이자, Redis처럼 **키-값 조회가 사실상 전부인 시스템**에서 메인 자료구조로 해시 테이블을 쓰는 이유이기도 하다.

---

## LSM-Tree: 쓰기 중심 워크로드의 선택

B-Tree와 Hash는 모두 **쓰기 즉시 최종 위치에 반영**된다는 공통점이 있다 — 삽입/수정 때마다 트리를 재조정하거나 해시 버킷을 갱신한다. 쓰기가 몰리는 워크로드(로그 적재, 시계열, 이벤트 스트림)에서는 이 "즉시 반영"이 랜덤 I/O 비용으로 돌아온다.

LSM-Tree(Log-Structured Merge-Tree)는 반대로 접근한다. **쓰기는 메모리에만 순차적으로 쌓고, 디스크 반영은 나중에 한꺼번에, 그것도 항상 순차 쓰기로 처리한다.**

### 구조: Memtable → SSTable → Compaction

1. 쓰기는 먼저 **Memtable**(메모리 내 정렬된 버퍼, 보통 Skip List)에 추가된다. 이 단계는 랜덤 I/O가 전혀 없는 메모리 연산이라 `O(1)`에 가깝다.
2. Memtable이 가득 차면 통째로 디스크에 **SSTable(Sorted String Table)**로 플러시한다. SSTable은 한번 쓰면 바뀌지 않는(immutable) 정렬된 파일이다.
3. 같은 키라도 SSTable이 여러 개로 쌓이면 조회 시 여러 파일을 다 확인해야 한다. 이를 주기적으로 병합해 정리하는 백그라운드 작업이 **Compaction**이다.

쓰기 시점에는 비용이 거의 없지만, 그 대가를 Compaction이 나중에 치른다. 이 트레이드오프를 정량화한 게 **Write Amplification(쓰기 증폭)** — 애플리케이션이 실제로 쓴 바이트 대비, 디스크에 물리적으로 쓰여지는 총 바이트의 비율이다.

### Compaction 전략과 Write Amplification

Compaction 전략에 따라 이 증폭의 크기가 달라진다. RocksDB 공식 문서는 두 전략을 다음과 같이 구분한다.

- **Leveled Compaction**: 레벨마다 크기가 정해져 있고(보통 레벨당 10배), 상위 레벨로 병합될 때 겹치는 데이터를 다시 써서 레벨을 정리한다. 레벨 간 크기 비율(fanout)만큼 데이터가 반복해서 다시 쓰이므로 쓰기 증폭이 커지는 대신, 레벨마다 키 범위가 겹치지 않아 **읽기 증폭과 공간 증폭이 작다.**
- **Universal(Tiered) Compaction**: 비슷한 크기의 SSTable들을 모아 병합만 하고, 상위 레벨 데이터를 다시 읽어서 쓰지 않는다. 레벨당 쓰기 증폭이 1에 가깝게 떨어지는 대신, 병합이 끝나기 전까지 데이터가 중복 보관되어 **일시적인 공간 증폭이 커질 수 있다.**

즉 "쓰기를 더 아낄지, 읽기·공간을 더 아낄지"의 트레이드오프이고, 둘 다 가질 수는 없다. RocksDB의 기본 "Leveled Compaction"은 사실 작은 레벨(L0)은 Tiered 방식으로, 큰 레벨은 Leveled 방식으로 처리하는 하이브리드다.

Cassandra도 같은 트레이드오프를 전략 선택으로 노출한다. 공식 문서 기준:

- **Size-Tiered Compaction Strategy(STCS, 기본값)**: 비슷한 크기의 SSTable을 모아 병합. 쓰기 중심 워크로드에 유리하지만 데이터셋이 커지면 공간 증폭이 문제가 된다.
- **Leveled Compaction Strategy(LCS)**: 레벨당 10배 크기로 구성해 읽기 시 레벨당 SSTable 1개만 확인하면 되도록 최적화. 읽기 중심 워크로드에 유리하지만 Compaction에 디스크 I/O·CPU를 더 많이 쓰고, 여유 디스크도 추가로 필요하다.
- **Time-Window Compaction Strategy(TWCS)**: 시간 윈도우 단위로 SSTable을 묶어, TTL이 지난 윈도우를 통째로 버릴 수 있게 한다(시계열 데이터에 적합).

> 최신 동향: Cassandra 공식 문서는 최근 위 세 전략 대부분의 用도를 포괄하는 **Unified Compaction Strategy(UCS)**를 권장 기본값으로 안내하고 있다. 전략 자체의 트레이드오프(읽기 vs 쓰기 vs 공간)는 동일하지만, 설정 하나로 조정 가능하도록 통합된 형태다. 신규로 Cassandra LSM 튜닝을 검토한다면 STCS/LCS를 먼저 고정하기보다 UCS 설정값 조정을 우선 검토할 것.

### 요약하면

LSM-Tree는 "쓰기를 순차 I/O로 뒤로 미루고, 그 정리 비용(Compaction)을 백그라운드로 분산 처리"하는 구조다. 쓰기가 압도적으로 많은 워크로드에서 B-Tree/Hash보다 유리하지만, 공짜는 아니다 — Compaction이 밀리면 쓰기 증폭과 함께 읽기 지연(여러 SSTable을 다 훑어야 하는 상황)도 같이 나빠진다.

---

## 엔진별 매핑: 누가 어떤 알고리즘을 쓰나

| 엔진 | 기본 인덱스 알고리즘 | 비고 |
|---|---|---|
| MySQL InnoDB | B-Tree (Clustered Index) | PK 기준으로 데이터 자체가 B-Tree로 클러스터링되고, 세컨더리 인덱스도 B-Tree + PK 참조 구조 |
| PostgreSQL | B-Tree(기본) / Hash / GiST / GIN / BRIN | Hash 인덱스는 PostgreSQL 10부터 WAL 로깅을 지원해 복제·충돌 복구가 안전해졌다 |
| Redis | Hash Table (dict) | 키 조회가 핵심 워크로드라 자료구조 자체가 Hash. 정렬·범위 조회가 필요하면 Sorted Set(Skip List) 등 별도 자료구조를 쓴다 |
| Cassandra | LSM-Tree (Memtable + SSTable) | Compaction 전략(STCS/LCS/TWCS/UCS)을 테이블 단위로 선택 가능 |
| RocksDB | LSM-Tree | Leveled / Universal(Tiered) Compaction 선택 가능. MySQL용 MyRocks 스토리지 엔진의 기반이기도 하다 |

같은 "인덱스"라는 말을 쓰지만 InnoDB와 Cassandra는 애초에 다른 쓰기 모델을 전제로 설계됐다는 걸 기억해두면, "왜 이 DB는 느린데 저 DB는 빠르지?" 같은 질문에 엔진 튜닝 이전에 알고리즘 레벨에서 먼저 답할 수 있다.

---

## 이 글과 [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)의 역할 구분

이전에 쓴 [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)는 "PostgreSQL이라는 특정 엔진에서 B-Tree 인덱스를 어떻게 실무에 적용하는가"를 다룬다 — `EXPLAIN ANALYZE`로 실행 계획을 읽고, 복합 인덱스의 컬럼 순서(Leftmost Prefix Rule)를 정하는 법 같은 **운영/튜닝 레벨** 내용이다.

이 글은 한 단계 아래로 내려가 "B-Tree/Hash/LSM-Tree라는 자료구조 자체가 왜 그런 성능 특성을 갖는가"를 다룬다. PostgreSQL 글에서 "B-Tree가 범용적이고 Hash는 동등 비교에만 쓴다"고 결론만 가져다 쓴 부분을, 이 글에서는 그 결론이 나오는 구조적 이유(균형 트리의 깊이, 해시의 순서 정보 손실, LSM의 지연 쓰기)까지 설명한다. 즉 PostgreSQL 글은 "무엇을 어떻게 설정할까", 이 글은 "그 설정이 왜 그렇게 동작하는가"에 해당한다.

---

## 정리

1. B-Tree는 **균형 트리**라서 최악의 경우에도 `O(log n)`을 보장하고, 값을 그대로 저장해 범위 조회·정렬에 강하다 — 범용 인덱스의 기본값인 이유.
2. Hash는 평균 `O(1)`로 가장 빠르지만 순서 정보를 버리기 때문에 **동등 비교 전용**이다 — 범위 조회·정렬에는 쓸 수 없다.
3. LSM-Tree는 쓰기를 메모리 버퍼 + 순차 쓰기로 미루고, 정리 비용을 **Compaction**으로 나중에 분산시킨다 — 쓰기 중심 워크로드에 유리한 대신 Write Amplification과 읽기 지연이라는 트레이드오프가 생긴다.
4. Compaction 전략(Leveled vs Tiered/Size-Tiered)은 "쓰기 증폭을 줄일지, 읽기·공간 증폭을 줄일지"를 고르는 문제이지 공짜 최적화가 아니다.
5. 인덱스 알고리즘 선택은 엔진 선택과 직결된다 — InnoDB/PostgreSQL(B-Tree), Redis(Hash), Cassandra/RocksDB(LSM-Tree)는 애초에 다른 쓰기 모델을 전제로 설계됐다.

---

## 참고 자료

LSM-Tree의 Compaction·Write Amplification 설명은 second-brain 노트에 없는 내용으로, 아래 1차 문서를 바탕으로 신규 작성했다.

- [RocksDB Wiki — Compaction](https://github.com/facebook/rocksdb/wiki/Compaction) (Leveled/Universal Compaction의 쓰기·읽기·공간 증폭 트레이드오프)
- [Apache Cassandra 공식 문서 — Leveled Compaction Strategy (LCS)](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/lcs.html) (STCS/LCS/TWCS/UCS 비교)

## 관련 포스트

- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/)
- [MySQL vs PostgreSQL — 백엔드 개발자가 알아야 할 차이](/2026/04/01/mysql-vs-postgresql/)
