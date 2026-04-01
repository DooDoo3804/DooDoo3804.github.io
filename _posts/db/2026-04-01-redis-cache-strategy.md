---
title: "Redis 캐시 전략 — 백엔드 개발자 실전 가이드"
subtitle: "데이터 구조부터 Cache Stampede 해결까지, Spring Boot 실전 코드 포함"
layout: post
date: 2026-04-01
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
series: "Database"
categories: db
tags:
  - Redis
  - Cache
  - Database
  - Backend
  - Spring
description: "Redis 캐시 전략 실전 가이드. 데이터 구조, 캐시 패턴(Cache-Aside, Write-Through, Write-Behind, Read-Through), TTL 전략, Cache Stampede 해결법, Spring Boot 연동까지 정리합니다."
---

## Redis 데이터 구조 간단 정리

Redis는 단순한 키-값 저장소가 아니다. 다양한 데이터 구조를 지원하며, 각 구조를 상황에 맞게 선택하는 것이 캐시 성능의 첫걸음이다.

### String

가장 기본적인 타입이다. 단순 값 캐싱에 적합하다.

```bash
SET user:1:name "DoYoon"
GET user:1:name    # "DoYoon"

# 카운터로도 활용
INCR page:view:count    # 원자적 증가
```

### Hash

객체를 필드 단위로 저장한다. 사용자 프로필처럼 여러 속성을 가진 데이터에 적합하다.

```bash
HSET user:1 name "DoYoon" email "doyoon@example.com" age 28
HGET user:1 name        # "DoYoon"
HGETALL user:1          # 모든 필드-값 반환
```

### List

순서가 있는 요소의 컬렉션이다. 최근 활동 로그, 메시지 큐 등에 활용된다.

```bash
LPUSH recent:orders "order:1001" "order:1002"
LRANGE recent:orders 0 9    # 최근 10개 조회
```

### Set과 Sorted Set(ZSet)

Set은 중복 없는 컬렉션이고, ZSet은 각 요소에 점수(score)를 부여해 정렬된 상태를 유지한다.

```bash
# Set — 태그, 좋아요한 사용자 목록
SADD post:1:likes "user:1" "user:2"
SISMEMBER post:1:likes "user:1"    # 1 (존재)

# ZSet — 랭킹 보드
ZADD leaderboard 1500 "player:A" 2300 "player:B" 1800 "player:C"
ZREVRANGE leaderboard 0 2 WITHSCORES    # 상위 3명
```

---

## 캐시 전략 패턴

캐시를 어떻게 읽고 쓰느냐에 따라 일관성, 성능, 복잡도가 크게 달라진다.

### Cache-Aside (Lazy Loading)

애플리케이션이 직접 캐시를 관리한다. 캐시에 데이터가 없으면 DB에서 읽어와 캐시에 저장한다.

```
1. 캐시 조회 → Hit → 반환
2. 캐시 Miss → DB 조회 → 캐시에 저장 → 반환
3. 데이터 변경 시 → DB 업데이트 → 캐시 삭제(또는 갱신)
```

가장 널리 사용되는 패턴이다. 캐시 장애 시에도 DB에서 직접 데이터를 가져올 수 있어 장애 격리가 된다. 단점은 최초 요청 시 항상 캐시 미스가 발생하고, 캐시와 DB 사이의 일관성 보장이 애플리케이션 책임이라는 점이다.

### Read-Through

Cache-Aside와 비슷하지만, 캐시 라이브러리가 DB 조회까지 자동으로 처리한다. 애플리케이션은 항상 캐시만 바라본다. 코드가 단순해지는 장점이 있으나, 캐시 라이브러리에 대한 의존도가 높아진다.

### Write-Through

데이터를 쓸 때 캐시와 DB에 동시에 기록한다.

```
1. 애플리케이션 → 캐시에 쓰기
2. 캐시 → DB에 동기적으로 쓰기
```

캐시와 DB의 일관성이 항상 보장된다. 하지만 모든 쓰기에 캐시를 거치므로 쓰기가 느려질 수 있고, 읽히지 않는 데이터도 캐시에 올라가는 낭비가 발생한다.

### Write-Behind (Write-Back)

캐시에만 즉시 쓰고, DB에는 비동기로 나중에 기록한다.

```
1. 애플리케이션 → 캐시에 쓰기 (즉시 반환)
2. 캐시 → 일정 주기/조건으로 DB에 배치 쓰기
```

쓰기 성능이 뛰어나지만, 캐시가 날아가면 데이터를 잃을 수 있다. 좋아요 수, 조회 수처럼 유실이 허용되는 데이터에 적합하다.

---

## TTL 설정 전략과 캐시 무효화

### TTL(Time To Live) 설정

모든 캐시 키에 TTL을 설정하는 것이 원칙이다. TTL 없는 키는 메모리 누수의 원인이 된다.

```bash
SET product:1:detail "{...}" EX 3600    # 1시간 TTL
```

TTL은 데이터 특성에 따라 다르게 설정한다.

| 데이터 유형 | 추천 TTL | 이유 |
|---|---|---|
| 사용자 세션 | 30분 | 보안 요구사항 |
| 상품 상세 | 1~6시간 | 변경 빈도 낮음 |
| 실시간 랭킹 | 30초~1분 | 자주 변경됨 |
| 설정/코드 테이블 | 24시간+ | 거의 변경 안 됨 |

### 캐시 무효화(Invalidation)

캐시에서 가장 어려운 문제다. "컴퓨터 과학에서 어려운 두 가지: 캐시 무효화와 이름 짓기"라는 말이 있을 정도다.

주요 전략:
- **TTL 기반 만료**: 가장 단순. 일정 시간 후 자동 삭제.
- **이벤트 기반 삭제**: 데이터 변경 시 관련 캐시 키를 명시적으로 삭제.
- **버전 키**: 캐시 키에 버전 번호를 포함시켜, 데이터 변경 시 버전을 올린다.

```bash
# 버전 키 예시
SET product:1:v3:detail "{...}" EX 3600
# 버전 업 시 새 키로 저장 → 이전 키는 TTL 만료로 자연 삭제
```

---

## Cache Stampede 현상과 해결법

**Cache Stampede**(또는 Thundering Herd)는 인기 있는 캐시 키가 만료되는 순간, 수많은 요청이 동시에 DB로 몰려드는 현상이다. 순간적으로 DB에 엄청난 부하가 걸린다.

### 해결법 1: Mutex Lock

캐시 미스가 발생하면 하나의 요청만 DB를 조회하게 잠금을 건다. 나머지 요청은 대기 후 캐시된 결과를 사용한다.

```java
public String getProductWithMutex(String productId) {
    String cacheKey = "product:" + productId;
    String lockKey = cacheKey + ":lock";

    String cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        return cached;
    }

    // SETNX로 락 획득 시도 (5초 TTL)
    Boolean acquired = redisTemplate.opsForValue()
        .setIfAbsent(lockKey, "1", Duration.ofSeconds(5));

    if (Boolean.TRUE.equals(acquired)) {
        try {
            // DB 조회 후 캐시 저장
            String data = productRepository.findById(productId);
            redisTemplate.opsForValue().set(cacheKey, data, Duration.ofHours(1));
            return data;
        } finally {
            redisTemplate.delete(lockKey);
        }
    } else {
        // 락 획득 실패 → 잠시 대기 후 재시도
        Thread.sleep(50);
        return getProductWithMutex(productId);
    }
}
```

### 해결법 2: Probabilistic Early Expiration

TTL이 만료되기 전에 확률적으로 미리 갱신한다. 만료 시점이 가까워질수록 갱신 확률이 높아진다.

```java
public String getWithProbabilisticRefresh(String key, long ttlSeconds) {
    String cached = redisTemplate.opsForValue().get(key);
    Long remainTtl = redisTemplate.getExpire(key, TimeUnit.SECONDS);

    if (cached != null && remainTtl != null && remainTtl > 0) {
        // 남은 TTL이 짧을수록 갱신 확률 증가
        double probability = Math.exp(-remainTtl / (ttlSeconds * 0.1));
        if (Math.random() < probability) {
            // 비동기로 캐시 갱신
            CompletableFuture.runAsync(() -> refreshCache(key, ttlSeconds));
        }
        return cached;
    }

    return refreshCache(key, ttlSeconds);
}
```

---

## Spring Boot + Redis 실전 코드

### 의존성 추가

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-redis'
    implementation 'org.springframework.boot:spring-boot-starter-cache'
}
```

### Redis 설정

```yaml
# application.yml
spring:
  redis:
    host: localhost
    port: 6379
    timeout: 3000
  cache:
    type: redis
    redis:
      time-to-live: 3600000    # 1시간 (밀리초)
```

```java
@Configuration
@EnableCaching
public class RedisConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1))
            .serializeValuesWith(
                SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer())
            );

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .build();
    }
}
```

### @Cacheable, @CacheEvict 활용

```java
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    @Cacheable(value = "product", key = "#id")
    public ProductResponse getProduct(Long id) {
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new NotFoundException("상품을 찾을 수 없습니다."));
        return ProductResponse.from(product);
    }

    @CacheEvict(value = "product", key = "#id")
    public void updateProduct(Long id, ProductUpdateRequest request) {
        Product product = productRepository.findById(id)
            .orElseThrow(() -> new NotFoundException("상품을 찾을 수 없습니다."));
        product.update(request);
        productRepository.save(product);
    }

    @CacheEvict(value = "product", allEntries = true)
    public void clearAllProductCache() {
        // 전체 상품 캐시 삭제
    }
}
```

### RedisTemplate 직접 사용

세밀한 제어가 필요할 때는 `RedisTemplate`을 직접 사용한다.

```java
@Service
@RequiredArgsConstructor
public class RankingService {

    private final RedisTemplate<String, String> redisTemplate;
    private static final String RANKING_KEY = "game:ranking";

    public void addScore(String playerId, double score) {
        redisTemplate.opsForZSet().add(RANKING_KEY, playerId, score);
    }

    public List<String> getTopPlayers(int count) {
        Set<String> topPlayers = redisTemplate.opsForZSet()
            .reverseRange(RANKING_KEY, 0, count - 1);
        return topPlayers != null ? new ArrayList<>(topPlayers) : List.of();
    }

    public Long getPlayerRank(String playerId) {
        return redisTemplate.opsForZSet().reverseRank(RANKING_KEY, playerId);
    }
}
```

---

## Redis vs Memcached 비교

| 항목 | Redis | Memcached |
|---|---|---|
| 데이터 구조 | String, Hash, List, Set, ZSet 등 | String만 |
| 영속성 | RDB, AOF로 디스크 저장 가능 | 없음 (순수 메모리) |
| 복제 | Master-Replica 지원 | 지원 안 함 |
| 클러스터 | Redis Cluster 내장 | 클라이언트 샤딩 |
| Pub/Sub | 지원 | 지원 안 함 |
| 멀티스레드 | 단일 스레드 (I/O 스레드는 6.0+) | 멀티스레드 |
| 메모리 효율 | 상대적으로 높은 오버헤드 | 단순 키-값이라 효율적 |

**Memcached 선택 기준**: 단순 키-값 캐싱만 필요하고 멀티스레드로 높은 처리량이 필요한 경우.

**Redis 선택 기준**: 다양한 데이터 구조, 영속성, Pub/Sub, Lua 스크립팅 등 풍부한 기능이 필요한 경우. 대부분의 프로젝트에서는 Redis가 더 범용적이다.

---

## 정리

Redis 캐시 전략은 단순히 "캐시에 넣고 빼는 것"이 아니다. 데이터 특성에 맞는 구조 선택, 적절한 캐시 패턴 적용, TTL 전략 수립, 그리고 Cache Stampede 같은 엣지 케이스 대응까지 고려해야 한다. Spring Boot에서는 `@Cacheable`로 간편하게 시작하되, 세밀한 제어가 필요한 곳에서는 `RedisTemplate`을 직접 활용하는 것이 실무에서의 균형 잡힌 접근이다.
