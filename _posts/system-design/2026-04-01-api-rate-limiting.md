---
title: "API Rate Limiting — 설계와 구현 전략"
subtitle: "Token Bucket부터 분산 Redis Rate Limiter까지, Spring Boot 실전 구현"
layout: post
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
keywords: "rate limiting, token bucket, sliding window, redis, api"
series: "System Design"
categories:
  - system-design
tags:
  - Rate Limiting
  - System Design
  - Redis
  - Backend
  - Spring
description: "API Rate Limiting의 필요성, 알고리즘 비교(Token Bucket, Leaky Bucket, Sliding Window), Redis 기반 분산 구현, Spring Boot 실전 코드를 정리합니다."
---

## Rate Limiting이 필요한 이유

공개 API를 운영하면 예상치 못한 트래픽 폭주를 경험하게 된다. 의도적인 DDoS 공격이 아니더라도, 클라이언트의 버그나 잘못된 재시도 로직만으로 서버가 과부하에 빠질 수 있다.

Rate Limiting은 세 가지 문제를 해결한다.

1. **서비스 보호**: 과도한 요청으로부터 서버 리소스를 보호한다.
2. **공정한 사용**: 특정 사용자가 리소스를 독점하지 못하게 한다.
3. **비용 제어**: 클라우드 환경에서 불필요한 트래픽으로 인한 비용 폭증을 방지한다.

```
정상 트래픽:   ████████░░░░░░░  (60% 용량)  ✓ 안정
트래픽 폭주:   ████████████████████████████  (200% 용량)  ✗ 장애
Rate Limit:   ████████████████░░░░░░░░░░░  (100% 이하 유지)  ✓ 안정
```

---

## 알고리즘 비교

### Token Bucket

버킷에 일정 속도로 토큰이 채워진다. 요청이 들어오면 토큰을 소비한다. 토큰이 없으면 요청을 거부한다.

```
[버킷 용량: 10, 충전 속도: 1개/초]

t=0   토큰: 10  → 요청 5개 처리 → 토큰: 5
t=1   토큰: 6   → 요청 2개 처리 → 토큰: 4
t=2   토큰: 5   → 요청 0개      → 토큰: 5 (최대 10까지만 충전)
t=3   토큰: 6   → 요청 8개 시도 → 6개 처리, 2개 거부
```

**특징**: 버스트 트래픽을 허용한다. 버킷에 토큰이 쌓여 있으면 일시적으로 높은 트래픽을 처리할 수 있다. Amazon API Gateway, Stripe 등 많은 서비스에서 사용한다.

```java
public class TokenBucket {
    private final int maxTokens;
    private final double refillRate;    // tokens per second
    private double currentTokens;
    private long lastRefillTime;

    public TokenBucket(int maxTokens, double refillRate) {
        this.maxTokens = maxTokens;
        this.refillRate = refillRate;
        this.currentTokens = maxTokens;
        this.lastRefillTime = System.nanoTime();
    }

    public synchronized boolean tryConsume() {
        refill();
        if (currentTokens >= 1) {
            currentTokens -= 1;
            return true;
        }
        return false;
    }

    private void refill() {
        long now = System.nanoTime();
        double elapsed = (now - lastRefillTime) / 1_000_000_000.0;
        currentTokens = Math.min(maxTokens, currentTokens + elapsed * refillRate);
        lastRefillTime = now;
    }
}
```

### Leaky Bucket

요청이 버킷에 들어가고, 일정 속도로 빠져나간다. 버킷이 가득 차면 새 요청은 버려진다.

```
[버킷 용량: 10, 유출 속도: 2개/초]

요청 유입:  ████████████████  (버스트)
버킷 내부:  ██████████        (최대 10개 대기)
유출(처리): ██  ██  ██  ██    (일정 속도로 처리)
```

**특징**: 유출 속도가 일정하므로 트래픽을 평탄화(smoothing)한다. 버스트를 허용하지 않고 균일한 처리율을 보장해야 할 때 적합하다.

### Fixed Window Counter

시간 윈도우(예: 1분)를 고정하고, 윈도우 내 요청 수를 카운트한다.

```
[1분당 100개 제한]

12:00:00 ~ 12:00:59  → 카운트: 0 ... 100 → 100 이후 거부
12:01:00 ~ 12:01:59  → 카운트: 0 (리셋)
```

**문제점**: 윈도우 경계에서 버스트가 발생할 수 있다. 12:00:55에 100개, 12:01:00에 100개가 들어오면 10초 사이에 200개가 처리된다.

### Sliding Window Log

각 요청의 타임스탬프를 기록하고, 현재 시점에서 윈도우 크기만큼 뒤로 가서 요청 수를 센다.

```java
public class SlidingWindowLog {
    private final int maxRequests;
    private final long windowSizeMs;
    private final LinkedList<Long> requestLog = new LinkedList<>();

    public SlidingWindowLog(int maxRequests, long windowSizeMs) {
        this.maxRequests = maxRequests;
        this.windowSizeMs = windowSizeMs;
    }

    public synchronized boolean tryAcquire() {
        long now = System.currentTimeMillis();
        long windowStart = now - windowSizeMs;

        // 윈도우 밖의 오래된 기록 제거
        while (!requestLog.isEmpty() && requestLog.peekFirst() <= windowStart) {
            requestLog.pollFirst();
        }

        if (requestLog.size() < maxRequests) {
            requestLog.addLast(now);
            return true;
        }
        return false;
    }
}
```

**특징**: 경계 문제가 없어 가장 정확하지만, 요청마다 타임스탬프를 저장하므로 메모리 사용량이 높다.

### Sliding Window Counter

Fixed Window와 Sliding Window Log의 절충안이다. 이전 윈도우와 현재 윈도우의 카운트를 가중 평균으로 계산한다.

```
[1분당 100개 제한, 현재 12:00:45]

이전 윈도우(11:59:00~11:59:59) 카운트: 80
현재 윈도우(12:00:00~12:00:59) 카운트: 30

가중치 = (60 - 45) / 60 = 0.25
예상 카운트 = 80 * 0.25 + 30 = 50  → 허용
```

메모리 효율적이면서 경계 문제를 완화한다. 실무에서 가장 많이 채택되는 방식이다.

---

## 분산 환경에서의 Rate Limiting

서버가 여러 대인 분산 환경에서는 각 서버가 독립적으로 카운트하면 전체 제한이 깨진다. **Redis**를 중앙 저장소로 활용해 분산 Rate Limiting을 구현한다.

### Redis 기반 Fixed Window 구현

```lua
-- rate_limit.lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)

if current == 1 then
    redis.call('EXPIRE', key, window)
end

if current > limit then
    return 0    -- 거부
else
    return 1    -- 허용
end
```

```java
@Service
@RequiredArgsConstructor
public class RedisRateLimiter {

    private final RedisTemplate<String, String> redisTemplate;
    private final RedisScript<Long> rateLimitScript;

    public boolean isAllowed(String clientId, int limit, int windowSeconds) {
        String key = "rate_limit:" + clientId + ":" + (System.currentTimeMillis() / (windowSeconds * 1000));

        Long result = redisTemplate.execute(
            rateLimitScript,
            List.of(key),
            String.valueOf(limit),
            String.valueOf(windowSeconds)
        );

        return result != null && result == 1;
    }
}
```

### Redis 기반 Sliding Window 구현

Sorted Set을 활용하면 Sliding Window를 구현할 수 있다.

```java
public boolean isAllowedSlidingWindow(String clientId, int limit, int windowSeconds) {
    String key = "rate_limit:sliding:" + clientId;
    long now = System.currentTimeMillis();
    long windowStart = now - (windowSeconds * 1000L);

    redisTemplate.execute(new SessionCallback<>() {
        @Override
        public Object execute(RedisOperations operations) {
            operations.multi();
            // 윈도우 밖의 오래된 항목 제거
            operations.opsForZSet().removeRangeByScore(key, 0, windowStart);
            // 현재 요청 추가
            operations.opsForZSet().add(key, UUID.randomUUID().toString(), now);
            // 현재 윈도우 내 요청 수 조회
            operations.opsForZSet().zCard(key);
            // TTL 설정
            operations.expire(key, Duration.ofSeconds(windowSeconds));
            return operations.exec();
        }
    });

    Long count = redisTemplate.opsForZSet().zCard(key);
    return count != null && count <= limit;
}
```

---

## Spring Boot + Redis Rate Limiter 구현

### Bucket4j 라이브러리 활용

Bucket4j는 Token Bucket 알고리즘을 구현한 Java 라이브러리다. Redis 백엔드를 지원한다.

```groovy
// build.gradle
dependencies {
    implementation 'com.bucket4j:bucket4j-core:8.7.0'
    implementation 'com.bucket4j:bucket4j-redis:8.7.0'
}
```

```java
@Configuration
public class RateLimitConfig {

    @Bean
    public ProxyManager<String> proxyManager(RedisConnectionFactory factory) {
        LettuceBasedProxyManager<String> proxyManager = LettuceBasedProxyManager
            .builderFor(RedisClient.create("redis://localhost:6379"))
            .withExpirationStrategy(
                ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(
                    Duration.ofMinutes(1)))
            .build();
        return proxyManager;
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class RateLimitInterceptor implements HandlerInterceptor {

    private final ProxyManager<String> proxyManager;

    private static final BucketConfiguration BUCKET_CONFIG = BucketConfiguration.builder()
        .addLimit(Bandwidth.builder()
            .capacity(100)
            .refillGreedy(100, Duration.ofMinutes(1))
            .build())
        .build();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String clientId = resolveClientId(request);
        BucketProxy bucket = proxyManager.builder()
            .build(clientId, () -> BUCKET_CONFIG);

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);

        if (probe.isConsumed()) {
            response.setHeader("X-Rate-Limit-Remaining",
                String.valueOf(probe.getRemainingTokens()));
            return true;
        } else {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After",
                String.valueOf(probe.getNanosToWaitForRefill() / 1_000_000_000));
            response.getWriter().write("""
                {"error": "Too Many Requests", "message": "Rate limit exceeded. Please try again later."}
                """);
            return false;
        }
    }

    private String resolveClientId(HttpServletRequest request) {
        // API Key 우선, 없으면 IP 기반
        String apiKey = request.getHeader("X-API-Key");
        if (apiKey != null && !apiKey.isEmpty()) {
            return "api_key:" + apiKey;
        }
        return "ip:" + request.getRemoteAddr();
    }
}
```

### 커스텀 어노테이션 기반 구현

더 세밀한 제어를 위해 어노테이션 기반으로 구현할 수도 있다.

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    int requests() default 100;
    int windowSeconds() default 60;
    String key() default "";    // SpEL 지원
}
```

```java
@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {

    private final RedisTemplate<String, String> redisTemplate;

    @Around("@annotation(rateLimit)")
    public Object enforce(ProceedingJoinPoint joinPoint, RateLimit rateLimit) throws Throwable {
        String key = resolveKey(joinPoint, rateLimit);
        int limit = rateLimit.requests();
        int window = rateLimit.windowSeconds();

        String redisKey = "rate:" + key + ":" + (System.currentTimeMillis() / (window * 1000));
        Long count = redisTemplate.opsForValue().increment(redisKey);

        if (count == 1) {
            redisTemplate.expire(redisKey, Duration.ofSeconds(window));
        }

        if (count != null && count > limit) {
            throw new RateLimitExceededException("요청 한도를 초과했습니다.");
        }

        return joinPoint.proceed();
    }

    private String resolveKey(ProceedingJoinPoint joinPoint, RateLimit rateLimit) {
        if (!rateLimit.key().isEmpty()) {
            return rateLimit.key();
        }
        return joinPoint.getSignature().toShortString();
    }
}
```

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @RateLimit(requests = 50, windowSeconds = 60)
    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@RequestBody OrderRequest request) {
        // ...
    }

    @RateLimit(requests = 200, windowSeconds = 60)
    @GetMapping("/{id}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable Long id) {
        // ...
    }
}
```

---

## Rate Limit 응답 설계

### 표준 HTTP 응답

Rate Limit 초과 시 `429 Too Many Requests`를 반환한다.

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30
X-Rate-Limit-Limit: 100
X-Rate-Limit-Remaining: 0
X-Rate-Limit-Reset: 1714531200

{
    "error": "Too Many Requests",
    "message": "Rate limit exceeded. Please retry after 30 seconds.",
    "limit": 100,
    "remaining": 0,
    "retryAfter": 30
}
```

주요 응답 헤더:

| 헤더 | 설명 |
|---|---|
| `Retry-After` | 다음 요청까지 대기 시간(초) |
| `X-Rate-Limit-Limit` | 윈도우당 최대 요청 수 |
| `X-Rate-Limit-Remaining` | 남은 요청 수 |
| `X-Rate-Limit-Reset` | 윈도우 리셋 시각(Unix timestamp) |

정상 요청에도 `X-Rate-Limit-Remaining` 헤더를 포함시켜 클라이언트가 자체적으로 요청 속도를 조절할 수 있게 한다.

---

## 실무 고려사항

### per-user vs per-IP vs per-API-key

| 기준 | 장점 | 단점 |
|---|---|---|
| per-IP | 구현 간단, 인증 불필요 | NAT/프록시 뒤 사용자 구분 불가 |
| per-user | 정확한 사용자별 제한 | 인증 필수 |
| per-API-key | 서비스/클라이언트별 제한 | 키 관리 필요 |

실무에서는 **계층적 Rate Limiting**을 적용한다.

```
1차: per-IP (DDoS 방어, 인증 전 단계)  — 1000 req/min
2차: per-user (공정 사용)              — 100 req/min
3차: per-API-key (플랜별 차등)          — Free: 60, Pro: 600, Enterprise: 무제한
```

### 그 외 고려사항

- **Graceful Degradation**: Rate Limit 저장소(Redis)에 장애가 발생하면 요청을 통과시킬지 차단할지 결정해야 한다. 보통은 통과시키는 것이 서비스 가용성 측면에서 낫다.
- **분산 환경 시간 동기화**: 서버 간 시각이 다르면 윈도우 계산이 틀어진다. NTP로 시각을 동기화하거나, Redis 서버의 시각을 기준으로 삼는다.
- **API별 차등 제한**: 리소스 소모가 큰 API(검색, 리포트 생성)는 더 낮은 제한을 두고, 가벼운 API(상태 조회)는 높은 제한을 둔다.

---

## 정리

Rate Limiting은 API 서비스의 안정성과 공정성을 보장하는 핵심 메커니즘이다. 대규모 트래픽을 비동기로 처리하려면 [Apache Kafka](/backend/2026/04/03/kafka-introduction/)와 조합하는 것도 효과적인 전략이다. Token Bucket이 가장 범용적으로 쓰이지만, 요구사항에 따라 Sliding Window Counter도 좋은 선택이다. 분산 환경에서는 Redis가 사실상 표준이며, Spring Boot에서는 Bucket4j 라이브러리나 커스텀 어노테이션 기반 AOP로 깔끔하게 구현할 수 있다. 무엇보다 중요한 것은 클라이언트에게 명확한 Rate Limit 정보를 제공해 협력적인 트래픽 관리를 유도하는 것이다.
