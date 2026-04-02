---
title: "Redis 캐싱 전략 완전 정복"
subtitle: "캐시 패턴 비교부터 Cache Stampede 해결, Spring Boot 연동까지"
layout: post
date: "2026-04-02"
author: "DooDoo"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "redis, caching, backend, performance"
description: "Redis 캐싱 전략 비교와 Cache Stampede 해결, Spring Boot 연동 정리."
series: "백엔드 심화"
tags:
  - Redis
  - Caching
  - Backend
  - Performance
categories:
  - backend
---

캐싱은 백엔드 성능 최적화의 핵심이다. 이 글에서는 Redis를 활용한 캐싱 전략을 패턴별로 비교하고, 실전에서 마주치는 문제와 해결책을 정리한다.

<br>

## 1. 캐시 전략 비교

### 1.1 전략 비교 표

| 전략 | 읽기 흐름 | 쓰기 흐름 | 장점 | 단점 | 적합한 상황 |
|------|-----------|-----------|------|------|------------|
| **Cache-Aside** | 캐시 조회 → miss 시 DB 조회 → 캐시 저장 | DB 직접 쓰기 → 캐시 무효화 | 구현 단순, 필요한 데이터만 캐싱 | 첫 요청 항상 miss, 일관성 위험 | 읽기 비중 높은 일반 서비스 |
| **Read-Through** | 캐시에 위임 → miss 시 캐시가 DB 조회 | DB 직접 쓰기 | 애플리케이션 코드 단순 | 캐시 라이브러리 의존 | 캐시 미들웨어 사용 시 |
| **Write-Through** | 캐시 조회 | 캐시 쓰기 → 캐시가 DB에 동기 쓰기 | 캐시-DB 항상 일관 | 쓰기 지연 증가 | 데이터 일관성이 중요할 때 |
| **Write-Behind** | 캐시 조회 | 캐시 쓰기 → 비동기로 DB에 쓰기 | 쓰기 성능 극대화 | 데이터 유실 위험 | 쓰기 빈도 높고 유실 허용 시 |

### 1.2 Cache-Aside (Lazy Loading)

가장 널리 사용되는 전략이다. 애플리케이션이 캐시를 직접 관리한다.

```java
public User getUser(String userId) {
    // 1. 캐시 조회
    String cacheKey = "user:" + userId;
    User cached = (User) redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        return cached; // Cache Hit
    }

    // 2. Cache Miss → DB 조회
    User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException(userId));

    // 3. 캐시에 저장
    redisTemplate.opsForValue().set(cacheKey, user, Duration.ofMinutes(30));
    return user;
}
```

**쓰기 시 캐시 무효화:**

```java
public User updateUser(String userId, UserUpdateRequest request) {
    User user = userRepository.save(toEntity(userId, request));

    // 캐시 삭제 (다음 읽기에서 최신 데이터로 갱신)
    redisTemplate.delete("user:" + userId);
    return user;
}
```

### 1.3 Write-Through

```java
public User updateUser(String userId, UserUpdateRequest request) {
    User user = userRepository.save(toEntity(userId, request));

    // DB 저장 직후 캐시도 동기적으로 업데이트
    String cacheKey = "user:" + userId;
    redisTemplate.opsForValue().set(cacheKey, user, Duration.ofMinutes(30));
    return user;
}
```

### 1.4 Write-Behind (Write-Back)

```java
public void updateUserAsync(String userId, UserUpdateRequest request) {
    String cacheKey = "user:" + userId;
    User user = toEntity(userId, request);

    // 1. 캐시에 즉시 반영
    redisTemplate.opsForValue().set(cacheKey, user);

    // 2. 변경 사항을 큐에 등록 → 비동기로 DB에 쓰기
    redisTemplate.opsForList().rightPush("write-behind:queue",
            new WriteTask(cacheKey, user));
}

// 별도 스케줄러가 큐를 소비하여 DB에 배치 저장
@Scheduled(fixedDelay = 5000)
public void flushWriteBehindQueue() {
    List<WriteTask> tasks = new ArrayList<>();
    WriteTask task;
    while ((task = redisTemplate.opsForList()
            .leftPop("write-behind:queue")) != null) {
        tasks.add(task);
    }
    if (!tasks.isEmpty()) {
        userRepository.batchUpdate(tasks);
    }
}
```

<br>

## 2. TTL 설계 전략 및 만료 패턴

### 2.1 TTL 설계 가이드라인

| 데이터 유형 | 권장 TTL | 이유 |
|-------------|---------|------|
| 세션 정보 | 30분 ~ 2시간 | 사용자 세션 라이프사이클 |
| 사용자 프로필 | 10분 ~ 1시간 | 변경 빈도 낮음 |
| 상품 목록 | 5분 ~ 15분 | 가격/재고 변동 반영 |
| 인기 검색어 / 랭킹 | 1분 ~ 5분 | 실시간성 중요 |
| 설정 / 코드 테이블 | 1시간 ~ 24시간 | 거의 변경되지 않음 |
| API Rate Limit 카운터 | 1분 (sliding window) | 정확한 윈도우 필요 |

### 2.2 TTL 안티패턴

```java
// ❌ Bad: 모든 캐시에 동일한 TTL → 동시 만료 (Stampede 유발)
redisTemplate.opsForValue().set(key, value, Duration.ofMinutes(30));

// ✅ Good: TTL에 지터(jitter) 추가
long baseTtl = 30 * 60; // 30분
long jitter = ThreadLocalRandom.current().nextLong(0, 5 * 60); // 0~5분
redisTemplate.opsForValue().set(key, value, Duration.ofSeconds(baseTtl + jitter));
```

### 2.3 만료 패턴

**Passive Expiration**: 키에 접근할 때 만료 확인 → 삭제
**Active Expiration**: Redis가 주기적으로 만료된 키 샘플링 → 삭제

```java
// Sliding TTL — 접근할 때마다 TTL 갱신
public User getUser(String userId) {
    String cacheKey = "user:" + userId;
    User cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        // 접근 시 TTL 리셋
        redisTemplate.expire(cacheKey, Duration.ofMinutes(30));
        return cached;
    }
    // ... DB 조회 및 캐시 저장
}
```

<br>

## 3. Cache Stampede / Thundering Herd 문제와 해결책

### 3.1 문제 정의

**Cache Stampede**: 인기 키가 만료되는 순간, 수백 개의 요청이 동시에 DB를 조회하는 현상

```
시간 T: 인기 상품 캐시 만료
→ 요청 1: cache miss → DB 조회
→ 요청 2: cache miss → DB 조회
→ 요청 3: cache miss → DB 조회
→ ... 수백 요청이 동시에 DB hit
→ DB 과부하 / 장애
```

### 3.2 해결책 1: Mutex Lock (분산 락)

오직 하나의 요청만 DB를 조회하고, 나머지는 대기한다.

```java
public User getUserWithLock(String userId) {
    String cacheKey = "user:" + userId;
    String lockKey = "lock:" + cacheKey;

    User cached = redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) {
        return cached;
    }

    // 분산 락 획득 시도 (SETNX + TTL)
    Boolean acquired = redisTemplate.opsForValue()
            .setIfAbsent(lockKey, "1", Duration.ofSeconds(10));

    if (Boolean.TRUE.equals(acquired)) {
        try {
            // 락 획득 성공 → DB 조회 후 캐시 갱신
            User user = userRepository.findById(userId).orElseThrow();
            redisTemplate.opsForValue().set(cacheKey, user, Duration.ofMinutes(30));
            return user;
        } finally {
            redisTemplate.delete(lockKey);
        }
    } else {
        // 락 획득 실패 → 짧은 대기 후 재시도
        Thread.sleep(50);
        return getUserWithLock(userId);
    }
}
```

### 3.3 해결책 2: Probabilistic Early Expiration

캐시 만료 전에 확률적으로 미리 갱신한다.

```java
public User getUserWithEarlyExpire(String userId) {
    String cacheKey = "user:" + userId;
    CacheEntry<User> entry = (CacheEntry<User>) redisTemplate.opsForValue().get(cacheKey);

    if (entry != null) {
        long ttlRemaining = redisTemplate.getExpire(cacheKey, TimeUnit.SECONDS);
        long delta = entry.getComputeTime(); // 원래 계산 소요 시간(초)
        double beta = 1.0;

        // 남은 TTL이 짧을수록 갱신 확률 증가
        boolean shouldRefresh = (delta * beta * Math.log(Math.random())) * -1
                >= ttlRemaining;

        if (!shouldRefresh) {
            return entry.getData();
        }
        // 확률적으로 선택된 요청만 갱신 수행 (아래로 계속)
    }

    // Cache miss 또는 갱신 대상 → DB 조회
    long start = System.currentTimeMillis();
    User user = userRepository.findById(userId).orElseThrow();
    long computeTime = (System.currentTimeMillis() - start) / 1000;

    CacheEntry<User> newEntry = new CacheEntry<>(user, computeTime);
    redisTemplate.opsForValue().set(cacheKey, newEntry, Duration.ofMinutes(30));
    return user;
}
```

### 3.4 해결책 3: 백그라운드 갱신

인기 키를 TTL 만료 전에 백그라운드에서 주기적으로 갱신한다.

```java
@Scheduled(fixedRate = 60_000) // 1분마다
public void refreshHotKeys() {
    List<String> hotKeys = List.of("product:best-seller", "ranking:daily");
    for (String key : hotKeys) {
        Object freshData = loadFromDB(key);
        redisTemplate.opsForValue().set(key, freshData, Duration.ofMinutes(5));
    }
}
```

<br>

## 4. Redis 자료구조 활용

### 4.1 언제 뭘 쓸지

| 자료구조 | 용도 | 예시 |
|----------|------|------|
| **String** | 단순 K-V, 카운터, 세션 | `user:123 → JSON`, `counter:page → 42` |
| **Hash** | 객체 필드별 접근 | `user:123 → {name, email, age}` |
| **List** | 큐, 최근 기록 | 최근 본 상품, 메시지 큐 |
| **Set** | 고유 집합, 태그 | 좋아요 사용자 목록, 태그 필터 |
| **Sorted Set** | 랭킹, 스코어 기반 정렬 | 리더보드, 인기 검색어 |

### 4.2 String — 세션 & 카운터

```bash
# 세션 저장
SET session:abc123 '{"userId":"u1","role":"admin"}' EX 1800

# 페이지 조회수 카운터
INCR page:views:home
INCRBY page:views:home 5
```

```java
// Spring Boot
redisTemplate.opsForValue().set("session:" + sessionId, sessionData,
        Duration.ofMinutes(30));

Long views = redisTemplate.opsForValue().increment("page:views:" + pageId);
```

### 4.3 Hash — 객체 필드별 접근

전체 객체 대신 필요한 필드만 읽고 수정할 수 있다.

```bash
HSET user:123 name "홍길동" email "hong@example.com" age 28
HGET user:123 name          # "홍길동"
HINCRBY user:123 age 1      # 나이 1 증가
HGETALL user:123             # 전체 필드
```

```java
HashOperations<String, String, String> hashOps = redisTemplate.opsForHash();
hashOps.put("user:123", "name", "홍길동");
hashOps.put("user:123", "email", "hong@example.com");

String name = hashOps.get("user:123", "name");
Map<String, String> user = hashOps.entries("user:123");
```

### 4.4 Set — 좋아요, 태그

```bash
SADD post:456:likes user:1 user:2 user:3
SISMEMBER post:456:likes user:1    # 좋아요 여부: 1 (true)
SCARD post:456:likes               # 좋아요 수: 3
SINTER post:456:likes post:789:likes  # 두 게시물 모두 좋아요한 사용자
```

```java
SetOperations<String, String> setOps = redisTemplate.opsForSet();
setOps.add("post:456:likes", "user:1", "user:2");

Boolean isLiked = setOps.isMember("post:456:likes", "user:1");
Long likeCount = setOps.size("post:456:likes");
```

### 4.5 Sorted Set — 리더보드

```bash
ZADD leaderboard 1500 "player:A" 2300 "player:B" 1800 "player:C"
ZREVRANGE leaderboard 0 2 WITHSCORES   # 상위 3명 (높은 점수순)
ZRANK leaderboard "player:A"            # 순위 조회
ZINCRBY leaderboard 200 "player:A"      # 점수 증가
```

```java
ZSetOperations<String, String> zSetOps = redisTemplate.opsForZSet();
zSetOps.add("leaderboard", "player:A", 1500);
zSetOps.add("leaderboard", "player:B", 2300);

// 상위 10명
Set<ZSetOperations.TypedTuple<String>> top10 =
        zSetOps.reverseRangeWithScores("leaderboard", 0, 9);

// 점수 증가
zSetOps.incrementScore("leaderboard", "player:A", 200);
```

<br>

## 5. Spring Boot + Redis 연동

### 5.1 의존성 및 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-redis'
}
```

```yaml
# application.yml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      password: mypassword
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 2
```

### 5.2 RedisTemplate 설정

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Key: String, Value: JSON 직렬화
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(
                new GenericJackson2JsonRedisSerializer());

        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(
                new GenericJackson2JsonRedisSerializer());

        return template;
    }
}
```

### 5.3 @Cacheable 기반 선언적 캐싱

```java
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(
            RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration
                .defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(30))
                .serializeKeysWith(
                        SerializationPair.fromSerializer(
                                new StringRedisSerializer()))
                .serializeValuesWith(
                        SerializationPair.fromSerializer(
                                new GenericJackson2JsonRedisSerializer()))
                .disableCachingNullValues();

        // 캐시별 TTL 커스터마이징
        Map<String, RedisCacheConfiguration> perCacheConfig = Map.of(
                "users", config.entryTtl(Duration.ofMinutes(60)),
                "products", config.entryTtl(Duration.ofMinutes(10)),
                "rankings", config.entryTtl(Duration.ofMinutes(1))
        );

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                .withInitialCacheConfigurations(perCacheConfig)
                .build();
    }
}
```

```java
@Service
public class UserService {

    @Cacheable(value = "users", key = "#userId")
    public User getUser(String userId) {
        // Cache miss 시에만 실행
        return userRepository.findById(userId).orElseThrow();
    }

    @CachePut(value = "users", key = "#userId")
    public User updateUser(String userId, UserUpdateRequest request) {
        // 항상 실행, 결과를 캐시에 저장
        return userRepository.save(toEntity(userId, request));
    }

    @CacheEvict(value = "users", key = "#userId")
    public void deleteUser(String userId) {
        // 실행 후 캐시에서 삭제
        userRepository.deleteById(userId);
    }

    @CacheEvict(value = "users", allEntries = true)
    public void clearAllUserCache() {
        // 모든 users 캐시 삭제
    }
}
```

<br>

## 6. 캐시 일관성 문제 (Cache Invalidation 전략)

> *"There are only two hard things in Computer Science: cache invalidation and naming things."*
> — Phil Karlton

### 6.1 일관성 문제 시나리오

```
Thread A: DB 업데이트 (v2) → 캐시 삭제 예정
Thread B:                      캐시 miss → DB 조회 (v2) → 캐시 저장 (v2)
Thread A:                                                    캐시 삭제!
→ 캐시 비어 있음 → 다음 요청에서 다시 DB 조회 (괜찮음)

그러나 타이밍이 꼬이면:
Thread A: DB 업데이트 (v2)
Thread B:                   캐시 miss → DB 조회 (v1, 아직 커밋 안 됨)
Thread A: 캐시 삭제
Thread B:                   캐시 저장 (v1) ← 오래된 데이터!
```

### 6.2 전략 1: Delete After Write (기본)

```java
public void updateUser(String userId, UserUpdateRequest request) {
    userRepository.save(toEntity(userId, request));
    redisTemplate.delete("user:" + userId); // 쓰기 후 삭제
}
```

단순하지만 위 경합 상황에서 stale 데이터 가능성이 있다.

### 6.3 전략 2: 짧은 TTL + 삭제

```java
public void updateUser(String userId, UserUpdateRequest request) {
    userRepository.save(toEntity(userId, request));
    // 즉시 삭제 대신 매우 짧은 TTL로 교체 → 경합 윈도우 최소화
    redisTemplate.expire("user:" + userId, Duration.ofSeconds(1));
}
```

### 6.4 전략 3: 버전 기반 무효화

```java
public void updateUser(String userId, UserUpdateRequest request) {
    User user = userRepository.save(toEntity(userId, request));

    // 버전 번호로 캐시 키 분리
    String versionKey = "user:version:" + userId;
    Long newVersion = redisTemplate.opsForValue().increment(versionKey);

    String cacheKey = "user:" + userId + ":v" + newVersion;
    redisTemplate.opsForValue().set(cacheKey, user, Duration.ofMinutes(30));
}
```

### 6.5 전략 4: CDC (Change Data Capture) 기반

데이터 변경을 이벤트로 발행하여 캐시를 비동기 갱신한다.

```
DB 변경 → Debezium (CDC) → Kafka → Cache Updater → Redis 갱신
```

```java
@KafkaListener(topics = "dbserver.public.users")
public void onUserChange(ConsumerRecord<String, String> record) {
    UserChangeEvent event = objectMapper.readValue(
            record.value(), UserChangeEvent.class);

    String cacheKey = "user:" + event.getUserId();

    if ("DELETE".equals(event.getOperation())) {
        redisTemplate.delete(cacheKey);
    } else {
        redisTemplate.opsForValue().set(cacheKey,
                event.getAfter(), Duration.ofMinutes(30));
    }
}
```

### 6.6 전략 선택 가이드

| 상황 | 권장 전략 |
|------|-----------|
| 단순 CRUD, 약간의 stale 허용 | Delete After Write + 짧은 TTL |
| 높은 일관성 필요 | Write-Through 또는 버전 기반 |
| 대규모 분산 시스템 | CDC 기반 비동기 무효화 |
| 읽기 극단적 부하 | Cache-Aside + Mutex Lock + Jitter TTL |

<br>

## 정리

| 개념 | 핵심 |
|------|------|
| Cache-Aside | 가장 범용적, 애플리케이션이 캐시 직접 관리 |
| Write-Through / Behind | 쓰기 일관성 vs 쓰기 성능 트레이드오프 |
| TTL Jitter | 동시 만료 방지의 핵심 |
| Cache Stampede 방지 | Mutex Lock 또는 확률적 조기 갱신 |
| Redis 자료구조 | 데이터 특성에 맞는 자료구조 선택이 성능 좌우 |
| @Cacheable | Spring의 선언적 캐싱으로 보일러플레이트 제거 |
| Cache Invalidation | 삭제 + 짧은 TTL이 실용적, 대규모는 CDC |

캐싱은 단순히 "Redis에 저장"이 아니라, **데이터 특성에 맞는 전략을 선택하고 일관성과 성능 사이의 트레이드오프를 관리**하는 것이다.

<br>

References
----------

- [Redis Documentation](https://redis.io/docs/)
- [Redis Caching — Redis Best Practices](https://redis.io/docs/latest/develop/use/client-side-caching/)
- [Redis Data Types](https://redis.io/docs/latest/develop/data-types/)
- [Spring Data Redis — Reference Documentation](https://docs.spring.io/spring-data/redis/reference/)
- [Cache Abstraction — Spring Framework Documentation](https://docs.spring.io/spring-framework/reference/integration/cache.html)
- [Optimal Probabilistic Cache Stampede Prevention — XFetch Paper](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf)
