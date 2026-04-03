---
title: "MySQL vs PostgreSQL — 백엔드 개발자가 알아야 할 차이"
subtitle: "라이선스, 아키텍처, 성능 차이부터 실무 선택 기준까지"
layout: post
date: 2026-04-01
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
series: "Database"
categories: database
tags:
  - MySQL
  - PostgreSQL
  - Database
  - Backend
description: "MySQL과 PostgreSQL의 라이선스, 아키텍처, JSON 지원, MVCC 구현, 성능 차이를 비교하고 실무에서의 선택 기준을 정리합니다."
---

## 라이선스와 아키텍처 차이

### 라이선스

MySQL은 Oracle이 소유하고 있으며 **듀얼 라이선스** 정책을 따른다. Community Edition은 GPL v2로 무료이지만, 상용 라이선스가 별도로 존재한다. Oracle의 방향성에 따라 기능이 제한될 수 있다는 우려가 있어 MariaDB로 포크된 역사가 있다.

PostgreSQL은 **PostgreSQL License**(BSD 계열)로, 사실상 제한 없이 자유롭게 사용할 수 있다. 상용 제품에 포함해도 라이선스 비용이 없다. 기업 입장에서 법적 리스크가 가장 낮은 선택지다.

### 아키텍처

MySQL은 **멀티스레드** 기반이다. 하나의 프로세스 안에서 각 커넥션이 스레드로 처리된다. 메모리 사용 효율이 높고 커넥션 생성 비용이 낮다.

PostgreSQL은 **멀티프로세스** 기반이다. 각 커넥션마다 별도의 프로세스(backend process)가 생성된다. 프로세스 간 격리가 강해 안정적이지만, 커넥션 수가 많아지면 메모리 소모가 크다. 이 때문에 PostgreSQL에서는 **PgBouncer** 같은 커넥션 풀러를 사용하는 것이 일반적이다.

```bash
# PostgreSQL 커넥션 풀러 — PgBouncer 설정 예시
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

---

## JSON 지원 비교

두 데이터베이스 모두 JSON을 지원하지만, 깊이와 완성도에 차이가 있다.

### MySQL의 JSON

MySQL 5.7부터 `JSON` 타입을 지원한다. 내부적으로 바이너리 포맷으로 저장한다.

```sql
CREATE TABLE products (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255),
    attributes JSON
);

INSERT INTO products (name, attributes)
VALUES ('노트북', '{"brand": "Samsung", "ram": 16, "storage": "512GB"}');

-- JSON 필드 조회
SELECT name, attributes->>'$.brand' AS brand
FROM products
WHERE attributes->>'$.ram' = '16';

-- MySQL 8.0+: Multi-Valued Index
CREATE INDEX idx_tags ON products ((CAST(attributes->'$.tags' AS CHAR(50) ARRAY)));
```

### PostgreSQL의 JSON

PostgreSQL은 `JSON`과 `JSONB` 두 가지 타입을 제공한다. `JSONB`는 바이너리 포맷으로 저장하며, 인덱싱과 연산 성능이 뛰어나다.

```sql
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    attributes JSONB
);

INSERT INTO products (name, attributes)
VALUES ('노트북', '{"brand": "Samsung", "ram": 16, "tags": ["ultrabook", "2024"]}');

-- JSONB 연산자
SELECT name, attributes->>'brand' AS brand
FROM products
WHERE attributes @> '{"ram": 16}';    -- 포함 연산자

-- GIN 인덱스로 JSONB 전체 필드 인덱싱
CREATE INDEX idx_attributes ON products USING GIN (attributes);

-- JSONB 배열 요소 검색
SELECT * FROM products
WHERE attributes->'tags' ? 'ultrabook';
```

PostgreSQL의 `JSONB`가 `@>`, `?`, `?|` 같은 연산자와 GIN 인덱스를 제공하기 때문에 JSON 활용이 빈번한 프로젝트에서는 PostgreSQL이 유리하다.

---

## Full-Text Search 비교

### MySQL

MySQL은 InnoDB 엔진에서 `FULLTEXT` 인덱스를 지원한다.

```sql
CREATE TABLE articles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255),
    body TEXT,
    FULLTEXT INDEX ft_idx (title, body)
) ENGINE=InnoDB;

-- 자연어 검색
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('Redis 캐시 전략' IN NATURAL LANGUAGE MODE);

-- 불린 모드
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('+Redis -Memcached' IN BOOLEAN MODE);
```

한국어/중국어/일본어 등 CJK 문자는 기본적으로 N-gram 파서(`ngram`)를 설정해야 제대로 동작한다.

### PostgreSQL

PostgreSQL은 `tsvector`와 `tsquery`를 이용한 강력한 Full-Text Search를 내장하고 있다.

```sql
CREATE TABLE articles (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    body TEXT,
    search_vector TSVECTOR
);

-- tsvector 컬럼 자동 업데이트 트리거
CREATE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.body, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_search_vector
    BEFORE INSERT OR UPDATE ON articles
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- GIN 인덱스
CREATE INDEX idx_search ON articles USING GIN (search_vector);

-- 검색
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('simple', 'Redis & 캐시') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

PostgreSQL의 FTS는 랭킹, 하이라이팅, 사전(dictionary) 커스터마이징 등 더 세밀한 제어가 가능하다. 다만 한국어 형태소 분석을 위해서는 별도 확장(예: `textsearch_ko`)이 필요하다.

---

## 트랜잭션과 MVCC 구현 차이

두 데이터베이스 모두 MVCC(Multi-Version Concurrency Control)를 지원하지만 구현 방식이 다르다.

### MySQL (InnoDB)

InnoDB는 **Undo Log** 기반 MVCC를 사용한다. 행이 수정되면 이전 버전을 Undo Log에 보관하고, 다른 트랜잭션이 이전 버전을 읽어야 할 때 Undo Log를 참조한다.

```sql
-- MySQL 기본 격리 수준: REPEATABLE READ
SHOW VARIABLES LIKE 'transaction_isolation';
-- 'REPEATABLE-READ'

-- InnoDB는 REPEATABLE READ에서도 Phantom Read를 방지한다 (Gap Lock)
START TRANSACTION;
SELECT * FROM orders WHERE amount > 1000 FOR UPDATE;
-- Gap Lock으로 범위 내 INSERT 차단
COMMIT;
```

MySQL의 REPEATABLE READ는 Gap Lock 덕분에 Phantom Read를 사실상 방지하지만, 이로 인해 동시성이 떨어질 수 있다.

### PostgreSQL

PostgreSQL은 **테이블 내부에 다중 버전을 직접 저장**하는 방식이다. 수정 시 기존 행을 삭제 표시하고 새 행을 삽입한다. 이 때문에 `VACUUM`으로 죽은 행(dead tuple)을 주기적으로 정리해야 한다.

```sql
-- PostgreSQL 기본 격리 수준: READ COMMITTED
SHOW default_transaction_isolation;
-- 'read committed'

-- SERIALIZABLE 격리 수준 사용
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT SUM(balance) FROM accounts WHERE branch = 'gangnam';
UPDATE accounts SET balance = balance - 1000 WHERE id = 1;
COMMIT;
-- 직렬화 충돌 시 에러 발생 → 애플리케이션에서 재시도 필요
```

PostgreSQL의 SERIALIZABLE은 SSI(Serializable Snapshot Isolation) 알고리즘을 사용하며, Lock 대신 충돌 감지 방식이라 동시성이 높다.

---

## 성능 비교

### MySQL이 유리한 경우

- **단순 읽기 중심 워크로드**: 단순 SELECT, 기본 키 조회가 많은 서비스
- **높은 커넥션 수**: 멀티스레드 구조로 많은 동시 접속 처리에 유리
- **복제(Replication)**: 읽기 복제본 구성이 간단하고 안정적

```sql
-- MySQL: 기본 키 조회는 매우 빠르다
SELECT * FROM users WHERE id = 42;
-- Clustered Index 구조로 PK 조회 = 데이터 직접 접근
```

### PostgreSQL이 유리한 경우

- **복잡한 쿼리**: 서브쿼리, CTE, 윈도우 함수 등 복잡한 분석 쿼리
- **쓰기 중심 워크로드**: MVCC 구현 특성상 쓰기 동시성이 높음
- **확장성**: 사용자 정의 타입, 함수, 연산자 등 확장이 자유로움

```sql
-- PostgreSQL: CTE + 윈도우 함수 조합
WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        category,
        SUM(amount) AS total
    FROM orders
    GROUP BY 1, 2
)
SELECT
    month,
    category,
    total,
    LAG(total) OVER (PARTITION BY category ORDER BY month) AS prev_month,
    ROUND((total - LAG(total) OVER (PARTITION BY category ORDER BY month))
        / LAG(total) OVER (PARTITION BY category ORDER BY month) * 100, 2) AS growth_pct
FROM monthly_sales
ORDER BY category, month;
```

---

## 실무 선택 기준

| 기준 | MySQL | PostgreSQL |
|---|---|---|
| 단순 CRUD 서비스 | 적합 | 적합 |
| 복잡한 분석 쿼리 | 보통 | 우수 |
| JSON 활용 비중 높음 | 보통 | 우수 |
| 지리 데이터(GIS) | 제한적 | PostGIS로 우수 |
| 레거시/기존 인프라 | MySQL이 이미 있다면 유지 | — |
| 라이선스 민감 | 주의 필요 | 자유 |
| 커뮤니티/생태계 | 매우 큼 | 크고 빠르게 성장 중 |

**실무에서의 판단 기준**: 기존에 MySQL 인프라가 갖춰져 있고 단순 CRUD가 대부분이라면 MySQL을 유지한다. 새 프로젝트를 시작하고, 복잡한 쿼리나 JSON 활용이 예상되며, 라이선스에 민감하다면 PostgreSQL을 선택한다.

---

## Spring Boot 설정

### MySQL 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    runtimeOnly 'com.mysql:mysql-connector-j'
}
```

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mydb?useSSL=false&serverTimezone=Asia/Seoul&characterEncoding=UTF-8
    username: root
    password: password
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQLDialect
```

### PostgreSQL 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    runtimeOnly 'org.postgresql:postgresql'
}
```

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: postgres
    password: password
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
```

---

## 정리

MySQL과 PostgreSQL은 모두 검증된 RDBMS이며, "어느 것이 더 좋다"는 단정은 무의미하다. 중요한 것은 프로젝트의 요구사항, 팀의 숙련도, 기존 인프라를 종합적으로 고려해 선택하는 것이다. 최근 업계 트렌드로는 PostgreSQL의 채택이 빠르게 늘고 있지만, MySQL이 여전히 거대한 생태계를 가지고 있다는 점도 무시할 수 없다.
