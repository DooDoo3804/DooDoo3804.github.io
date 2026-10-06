---
title: "pgvector로 구현하는 벡터 검색: HNSW vs IVFFlat 인덱싱 전략"
subtitle: "RAG 시대의 임베딩 검색을 Postgres 하나로 — 거리 함수 선택부터 인덱스 운영까지"
layout: post
date: "2026-10-06"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #0f766e 100%)"
catalog: true
series: "Database"
keywords: "pgvector, vector search, hnsw, ivfflat, embedding, rag, postgresql, database"
tags:
  - PostgreSQL
  - pgvector
  - Vector Search
  - Backend
categories:
  - database
description: "pgvector로 PostgreSQL에 벡터 검색을 추가하는 법. 거리 함수(L2/cosine/inner product) 선택 기준, IVFFlat과 HNSW 인덱스의 구조·파라미터·트레이드오프, 규모별 선택 기준과 운영 팁을 정리합니다."
---

RAG(Retrieval-Augmented Generation)를 쓰는 서비스라면 결국 같은 질문에 부딪힌다. "사용자 질문과 의미적으로 가까운 문서 조각을 어떻게 빠르게 찾을 것인가?" 답은 보통 **임베딩(embedding) 벡터 간 유사도 검색**이다. 그리고 2023년 전까지는 이 검색을 하려면 Pinecone, Weaviate, Milvus, Qdrant 같은 전용 벡터 DB를 새로 들이는 게 당연한 선택이었다. 지금은 다르다. **이미 운영 중인 PostgreSQL에 `pgvector` 확장 하나만 얹으면** 상당수의 RAG 워크로드를 별도 인프라 없이 처리할 수 있다.

이 글은 pgvector로 벡터 컬럼을 설계하고, 거리 함수를 고르고, **IVFFlat과 HNSW 두 근사 인덱스(ANN index)** 중 무엇을 언제 써야 하는지를 다룬다. 백엔드 개발자가 "벡터 DB를 새로 공부해야 하나"를 고민하기 전에 먼저 확인해볼 선택지로서다.

---

## 왜 벡터 검색이 백엔드 영역으로 들어왔는가

RAG 파이프라인의 검색(retrieval) 단계는 구조적으로 단순하다.

```
사용자 질문 → 임베딩 모델로 벡터화 → "가장 가까운 벡터 K개" 검색 → 그 문서/청크를 LLM 컨텍스트에 삽입
```

여기서 "가장 가까운 벡터 K개"를 찾는 문제가 바로 **k-최근접 이웃(k-NN) 검색**이다. 임베딩 모델(OpenAI, Cohere 등)은 텍스트를 보통 1024~3072차원의 실수 벡터로 바꾸고, 의미가 비슷한 문장일수록 벡터 공간에서 더 가깝게 놓이도록 학습되어 있다. 검색은 결국 "이 벡터와 거리가 가장 작은 벡터들을 찾아라"는 질의로 환원된다.

문제는 수백만~수천만 개의 벡터를 **정확하게(exact)** 전부 비교하면 느리다는 점이다. 그래서 전용 벡터 DB들은 **근사 최근접 이웃(ANN, Approximate Nearest Neighbor)** 인덱스 구조를 핵심 가치로 들고 나왔다.

그런데 백엔드 입장에서 전용 벡터 DB를 새로 들이는 데는 숨은 비용이 있다.

- 애플리케이션 데이터(사용자, 문서, 권한)와 벡터가 **다른 시스템에 흩어진다** — 조인/트랜잭션 일관성을 애플리케이션 레이어에서 다시 맞춰야 한다.
- 운영해야 할 시스템이 하나 더 늘어난다 — 백업, 모니터링, 장애 대응을 이중으로 갖춰야 한다.
- 메타데이터 필터(예: "이 테넌트의 문서 중에서만 검색") 같은 관계형 쿼리를 벡터 DB의 질의 언어로 다시 표현해야 한다.

**pgvector**는 PostgreSQL에 `vector` 타입과 거리 연산자, ANN 인덱스 타입을 추가하는 오픈소스 확장이다. "벡터 전용 시스템"의 검색 성능을 완벽히 복제하지는 못하지만, **이미 쓰는 Postgres 안에서 벡터 컬럼을 일반 컬럼처럼 다루고, `WHERE`로 필터링하면서 벡터 거리로 `ORDER BY`할 수 있다**는 점이 결정적이다. 데이터 규모가 아주 크지 않다면(대략 수천만 행 이하, 워크로드에 따라 다르다) 새 시스템을 들이기 전에 먼저 검토할 선택지다.

---

## 설치와 컬럼 설계

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id          bigserial PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents(id),
    content     text NOT NULL,
    embedding   vector(1536),           -- 임베딩 모델의 출력 차원과 반드시 일치
    created_at  timestamptz DEFAULT now()
);
```

`vector(1536)`의 `1536`은 **임베딩 모델이 출력하는 차원 수**다(예: OpenAI `text-embedding-3-small`). 이 값은 컬럼 생성 시 고정되고, 임베딩 모델을 교체하면 보통 차원 수도 바뀌므로 **마이그레이션이 필요하다** — "모델 바꾸기"가 가벼운 작업이 아니라는 뜻이다.

> [!NOTE]
> pgvector는 벡터 자체는 꽤 큰 차원까지 저장할 수 있지만, **인덱스를 걸 수 있는 차원 수에는 상한이 있다.** 정확한 상한은 pgvector 버전마다 조정되어 왔으므로, 고차원 임베딩(4000차원 이상 등)을 쓴다면 배포된 pgvector 버전의 공식 문서에서 인덱스 차원 제한을 먼저 확인하자. 이 글에서 구체적인 숫자를 단정하지 않는 이유다.

---

## 거리 함수 선택: L2 vs Cosine vs Inner Product

pgvector는 세 가지 거리 연산자를 기본으로 제공한다.

| 연산자 | 의미 | 연산자 클래스(인덱스용) |
|--------|------|--------------------------|
| `<->` | L2(유클리드) 거리 | `vector_l2_ops` |
| `<=>` | 코사인 거리(`1 - cosine similarity`) | `vector_cosine_ops` |
| `<#>` | 음의 내적(negative inner product) | `vector_ip_ops` |

```sql
-- 코사인 거리로 상위 10개 찾기
SELECT id, content
FROM document_chunks
ORDER BY embedding <=> '[0.012, -0.034, ...]'
LIMIT 10;
```

어떤 걸 골라야 할까. 기준은 **임베딩이 정규화(normalize)되어 있는가**다.

- OpenAI, Cohere 등 대부분의 상용 임베딩 모델은 **출력 벡터의 길이(norm)를 1로 정규화**한다. 이 경우 코사인 유사도와 내적의 **순위(ranking)가 동일**해진다 — 코사인 거리는 정규화 과정(제곱근 계산)이 추가로 들어가므로, 같은 결과를 더 적은 연산으로 얻으려면 **내적(`<#>`)이 근소하게 더 저렴**하다.
- 벡터가 정규화되어 있지 않다면(커스텀 임베딩, 일부 피처 벡터) **코사인 거리**가 안전한 기본값이다. 벡터의 크기(magnitude) 차이가 유사도 판단을 왜곡하지 않도록 방향만 비교하기 때문이다.
- **L2 거리**는 벡터 공간에서의 실제 유클리드 거리 자체가 의미를 갖는 경우(좌표형 데이터, 일부 이미지 피처 공간)에 적합하다. 텍스트 임베딩 검색에서는 상대적으로 덜 쓰인다.

> [!WARNING]
> 인덱스를 만들 때 지정하는 연산자 클래스(`vector_cosine_ops` 등)는 **쿼리의 `ORDER BY`에 쓰는 연산자와 반드시 일치**해야 한다. 인덱스는 `vector_cosine_ops`로 만들고 쿼리는 `<->`(L2)로 정렬하면, PostgreSQL은 그 인덱스를 쓰지 못하고 **시퀀셜 스캔으로 떨어진다.** 거리 함수는 테이블 설계 초기에 한 번 정하고 전체 애플리케이션에서 일관되게 써야 한다.

---

## IVFFlat — 클러스터링 기반 근사 검색

**IVFFlat**(Inverted File with Flat compression)은 pgvector가 가장 먼저 지원한 ANN 인덱스다. 아이디어는 단순하다.

1. 테이블의 벡터들을 **k-평균(k-means) 클러스터링**으로 `lists`개의 그룹으로 나눈다.
2. 검색 시, 질의 벡터와 가까운 **일부 클러스터(`probes`개)만** 훑어서 그 안에서 최근접 이웃을 찾는다.

```sql
CREATE INDEX ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 쿼리 시 몇 개 클러스터를 훑을지 지정 (세션 단위)
SET ivfflat.probes = 10;

SELECT id, content
FROM document_chunks
ORDER BY embedding <=> '[0.012, -0.034, ...]'
LIMIT 10;
```

### 파라미터

- **`lists`**: 클러스터 개수. pgvector가 제시하는 경험 규칙은 다음과 같다.
  - 행 수가 100만 이하면 `lists = 행 수 / 1000`
  - 행 수가 100만을 넘으면 `lists = sqrt(행 수)`
- **`probes`**: 질의 시 훑는 클러스터 수(기본값 1). 늘리면 recall(정확도)은 올라가지만 지연시간도 함께 올라간다 — 전형적인 **recall-latency 트레이드오프**다.

### 트레이드오프

> [!WARNING]
> IVFFlat은 **데이터가 어느 정도 쌓인 뒤에 인덱스를 만드는 것**이 중요하다. 클러스터 중심(centroid)을 인덱스 생성 시점의 데이터 분포로 k-means 학습하기 때문에, 빈 테이블이나 소량의 데이터에서 인덱스를 만들고 그 뒤에 대량으로 적재하면 새 데이터의 클러스터 배치가 부정확해져 **recall이 서서히 떨어진다.** 데이터 분포가 크게 바뀌었다면(대량 삽입, 테넌트 추가 등) 주기적으로 `REINDEX`해 클러스터를 다시 학습시켜야 한다.

빌드 자체는 빠르고 메모리도 적게 쓰지만, 그 대가가 "데이터가 늘어날 때마다 재학습이 필요하다"는 운영 부담으로 돌아온다.

---

## HNSW — 그래프 기반 근사 검색

**HNSW**(Hierarchical Navigable Small World)는 pgvector 0.5.0(2023년)에 추가된 인덱스로, 2026년 현재는 **대부분의 신규 pgvector 도입에서 기본으로 권장되는 인덱스**다. IVFFlat보다 뒤늦게 들어왔지만, 짧은 기간에 사실상의 표준으로 자리잡았다.

구조는 클러스터링이 아니라 **다층 그래프**다. 위쪽 레이어는 노드가 적고 연결이 길어 공간을 빠르게 건너뛰고, 아래쪽 레이어로 내려갈수록 노드가 많고 연결이 촘촘해져 정밀하게 탐색한다. 검색은 최상위 레이어에서 시작해 질의 벡터와 가까운 방향으로 그래프를 타고 내려오는 방식이다.

```sql
CREATE INDEX ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 쿼리 시 탐색 폭 지정 (세션 단위)
SET hnsw.ef_search = 100;

SELECT id, content
FROM document_chunks
ORDER BY embedding <=> '[0.012, -0.034, ...]'
LIMIT 10;
```

### 파라미터

- **`m`**(기본 16): 노드당 유지하는 최대 연결 수. 클수록 그래프가 촘촘해져 recall은 올라가지만 메모리와 빌드 시간도 늘어난다.
- **`ef_construction`**(기본 64): 인덱스를 지을 때 각 노드가 연결을 고를 후보 집합의 크기. 클수록 그래프 품질(결과적으로 recall)이 좋아지지만 빌드가 느려진다.
- **`ef_search`**(기본 40, 쿼리 시 `SET`): 검색할 때 유지하는 후보 집합 크기. 클수록 recall은 올라가되 쿼리 지연시간도 늘어난다.

### IVFFlat과의 핵심 차이 — "학습"이 없다

IVFFlat의 k-means와 달리, HNSW 그래프는 벡터가 삽입될 때마다 **점진적으로** 확장된다. 즉 **빈 테이블에 인덱스를 먼저 만들고 그 뒤에 데이터를 적재해도 품질이 떨어지지 않는다.** IVFFlat이 "데이터가 쌓인 뒤 재학습이 필요한" 구조라면, HNSW는 "계속 삽입해도 그래프가 스스로 자라나는" 구조다. 이 점이 지속적으로 데이터가 유입되는 RAG 파이프라인(문서가 계속 추가되는 지식베이스 등)에서 운영 부담을 크게 줄여준다.

대가는 **빌드 시간과 메모리**다. 그래프 구조는 k-means 클러스터보다 생성 비용이 높고, 인덱스 자체도 더 많은 메모리를 차지한다. 그럼에도 같은 recall 목표에서 쿼리 지연시간이 IVFFlat보다 낮은 경우가 많다는 것이 HNSW가 기본값으로 자리잡은 이유다.

| | IVFFlat | HNSW |
|---|---------|------|
| 구조 | k-means 클러스터(inverted file) | 다층 proximity 그래프 |
| 빌드 전 데이터 필요 여부 | 필요(클러스터 학습) | 불필요(점진적 구성) |
| 빌드 시간/메모리 | 상대적으로 낮음 | 상대적으로 높음 |
| 삽입이 잦을 때 recall 유지 | 재학습(REINDEX) 필요 | 추가 재학습 없이 유지 |
| 같은 recall에서의 쿼리 속도 | 상대적으로 느림 | 상대적으로 빠른 경향 |
| pgvector 지원 시점 | 초기 버전부터 | 0.5.0(2023)부터 |

> [!IMPORTANT]
> "HNSW가 거의 항상 더 낫다"는 2026년 기준 업계의 대체적인 합의이지만, 이는 **빌드 시간과 메모리를 쿼리 성능과 교환**한 결과라는 점을 잊지 말자. 빌드 비용이 중요한 제약(예: 매우 자주 전체 재구축이 필요한 배치 파이프라인, 메모리가 빡빡한 인스턴스)이라면 IVFFlat이 여전히 합리적인 선택일 수 있다.

---

## 규모·업데이트 빈도별 선택 기준

| 상황 | 권장 |
|------|------|
| 데이터가 작고(수만~수십만 행) 쿼리량도 적음 | 인덱스 없이 정확 검색(sequential scan)도 충분할 수 있다. 성능 문제가 실제로 확인된 뒤에 인덱스를 고려한다 |
| 수백만~수천만 행, 배치/주기적 업데이트 | **HNSW**를 기본으로 — 빌드는 한 번(또는 배치 주기로) 하고, 쿼리 성능을 최우선할 때 유리하다 |
| 데이터가 끊임없이 스트리밍으로 삽입되는 지식베이스 | **HNSW** — 재학습 없이 그래프가 자라나는 특성이 운영 부담을 줄인다 |
| 빌드 시간/메모리가 빡빡하고, 자주 전체 재구축이 필요 | **IVFFlat** — 빌드가 가볍다는 장점이 쿼리 성능 손실을 상쇄할 수 있다 |
| 수억 행 이상, 메모리에 다 올리기 어려운 초대형 규모 | 순수 pgvector의 HNSW/IVFFlat만으로는 한계에 부딪힐 수 있다. Timescale의 `pgvectorscale`처럼 디스크 기반 ANN 인덱스를 더한 확장을 검토할 가치가 있다 |

> [!NOTE]
> **벤치마크에 대한 솔직한 당부.** "HNSW가 IVFFlat보다 몇 배 빠르다" 같은 구체적인 수치는 하드웨어, 데이터 분포, 차원 수, 동시성 수준에 따라 크게 달라진다. 공개된 ANN 벤치마크들(ann-benchmarks류)은 대체로 **같은 recall 목표에서 HNSW가 더 높은 QPS를 낸다**는 방향성은 일관되게 보여주지만, 이 글에서 구체적인 처리량/지연시간 숫자를 단정하지는 않겠다 — 운영 환경의 실제 데이터와 하드웨어로 직접 벤치마크해 보는 것이 유일하게 신뢰할 수 있는 방법이다. `lists`/`probes`, `m`/`ef_construction`/`ef_search` 조합별로 recall과 지연시간을 같이 측정하는 것을 권한다.

---

## 운영 팁

### 인덱스 빌드와 재빌드 비용

- `CREATE INDEX`(특히 HNSW)는 CPU와 메모리를 많이 쓴다. 빌드 중 `maintenance_work_mem`을 평소보다 높여주면 빌드 시간이 줄어든다.
- 기본 `CREATE INDEX`는 빌드 중 테이블에 대한 쓰기를 막는다. 운영 중인 테이블에 처음 인덱스를 거는 경우라면 `CREATE INDEX CONCURRENTLY`로 쓰기 차단을 피할 수 있다 — 다만 빌드 시간이 더 걸리고 스캔을 두 번 하므로 그만큼의 비용은 감수해야 한다. (일반적인 PostgreSQL 락 동작의 배경은 [PostgreSQL 락과 동시성 제어](/2026/06/16/postgresql-lock-concurrency/)에서 다뤘다.)
- IVFFlat은 데이터 분포가 바뀌면 recall이 조용히 떨어진다. 삽입량이 많은 테이블이라면 주기적으로 recall을 측정하고 필요시 `REINDEX`(가능하면 `CONCURRENTLY`)하는 루틴을 운영에 넣어두자.
- HNSW는 재학습이 필요 없지만, 대량 삭제가 일어나면 그래프에 죽은 노드가 남는다. 일반적인 `VACUUM`으로 정리되지만, 삭제 비율이 매우 높은 테이블이라면 인덱스 크기와 쿼리 성능을 함께 관찰하자.

### 키워드 + 벡터 하이브리드 검색

벡터 검색만으로는 부족한 경우가 많다. 사용자가 제품 코드나 고유명사처럼 **정확히 일치해야 하는 키워드**로 검색할 때, 임베딩 유사도만으로는 그 정확한 일치를 보장하지 못한다. 그래서 실무에서는 Postgres의 전문 검색(`tsvector`/`tsquery`)과 벡터 검색을 함께 쓰는 **하이브리드 검색**이 일반적이다.

```sql
-- 메타데이터로 먼저 필터링한 뒤 벡터 거리로 정렬 (filtered vector search)
SELECT id, content
FROM document_chunks
WHERE document_id IN (SELECT id FROM documents WHERE tenant_id = 42)
ORDER BY embedding <=> '[0.012, -0.034, ...]'
LIMIT 10;
```

```sql
-- 키워드 점수와 벡터 거리를 각각 구해 애플리케이션/쿼리 레벨에서 합산
SELECT id, content,
       ts_rank(content_tsv, query) AS keyword_score,
       embedding <=> '[0.012, -0.034, ...]' AS vector_distance
FROM document_chunks, to_tsquery('korean', 'pgvector & 인덱스') AS query
WHERE content_tsv @@ query
ORDER BY vector_distance
LIMIT 50;
```

두 점수를 합치는 방법은 가중합이나 **Reciprocal Rank Fusion(RRF)** 처럼 각 방식의 순위를 합산하는 방식이 흔히 쓰인다. 어떤 공식을 쓰든, 핵심은 "임베딩 유사도"와 "정확한 키워드 일치"가 서로 다른 실패 모드를 보완한다는 점이다.

> [!WARNING]
> `WHERE` 필터와 ANN 인덱스(HNSW/IVFFlat)를 함께 쓰는 **filtered search**는 근사 인덱스 특유의 함정이 있다. 인덱스가 먼저 "벡터상 가까운 후보"를 찾고 그중 필터를 통과하는 것만 추리는 구조이기 때문에, 필터가 매우 좁으면 `LIMIT`으로 요청한 개수보다 적은 결과가 나올 수 있다. 이 동작은 pgvector 버전별로 개선되어 온 영역이므로, 테넌트/권한 필터를 벡터 검색과 결합하는 설계라면 **배포된 pgvector 버전의 변경 로그에서 filtered search 관련 동작을 반드시 확인**하고, 직접 recall을 측정해보자 — 이 글에서 특정 버전의 정확한 동작을 단정하지는 않겠다.

---

## 정리

1. RAG의 검색 단계는 임베딩 벡터의 k-NN 검색으로 환원된다. **별도 벡터 DB 없이 PostgreSQL + pgvector**로도 상당수의 워크로드를 처리할 수 있다 — 애플리케이션 데이터와 벡터를 같은 트랜잭션 경계 안에 둘 수 있다는 게 가장 큰 이점이다.
2. 거리 함수는 **임베딩이 정규화되어 있는가**로 고른다. 정규화된 임베딩이면 코사인과 내적의 순위가 같으므로 더 가벼운 내적(`<#>`)을, 아니면 코사인(`<=>`)을 기본으로 삼는다. 인덱스의 연산자 클래스는 쿼리의 연산자와 반드시 맞춘다.
3. **IVFFlat**은 k-means 클러스터링 기반이다. 빌드는 가볍지만 데이터가 쌓인 뒤 만들어야 하고, 분포가 바뀌면 재학습(REINDEX)이 필요하다.
4. **HNSW**(pgvector 0.5.0, 2023년 도입)는 다층 그래프 기반이다. 빌드 비용과 메모리는 더 들지만 점진적으로 구성되어 재학습이 필요 없고, 같은 recall에서 쿼리가 더 빠른 경향이 있다 — 2026년 현재 신규 도입의 기본값으로 자리잡았다.
5. 선택은 데이터 규모와 업데이트 패턴에 따른다. 정적/배치 업데이트 위주라면 HNSW, 빌드 비용이 제약이라면 IVFFlat, 초대형 규모라면 `pgvectorscale` 같은 보조 확장도 검토 대상이다. **구체적인 벤치마크 수치는 자신의 데이터와 하드웨어로 직접 측정**하자.
6. 운영에서는 `maintenance_work_mem` 조정, `CREATE INDEX CONCURRENTLY`/`REINDEX CONCURRENTLY`로 쓰기 차단 최소화, 키워드+벡터 하이브리드 검색, filtered search의 recall 함정을 함께 챙겨야 한다.

---

## 관련 포스트

- [PostgreSQL 인덱스 제대로 이해하기](/2026/03/25/postgresql-index/) — B-Tree 인덱스의 기본 개념. ANN 인덱스도 결국 "전체 스캔을 피하기 위한 자료구조"라는 같은 동기에서 출발한다
- [PostgreSQL 락과 동시성 제어 내부 동작](/2026/06/16/postgresql-lock-concurrency/) — `CREATE INDEX CONCURRENTLY`가 피하는 락의 배경
