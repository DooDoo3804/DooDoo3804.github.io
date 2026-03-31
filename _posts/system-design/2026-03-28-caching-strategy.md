---
title: "시스템 디자인: 캐싱 전략 (Cache-Aside, Write-Through, Write-Behind)"
subtitle: "Redis 기반 캐싱 패턴 비교와 실무 선택 기준"
layout: post
author: "DooDoo"
header-style: text
catalog: true
series: System Design
tags:
  - SystemDesign
  - Backend
  - Redis
description: "캐싱 전략 비교 가이드. Cache-Aside, Write-Through, Write-Behind 패턴의 동작 원리와 Redis 구현 예제, 실무 선택 기준을 정리합니다."
---

## 캐싱이 필요한 이유

데이터베이스는 신뢰성과 일관성에 최적화된 저장소다. 하지만 모든 요청이 DB까지 도달하면 응답 지연이 발생하고, 트래픽이 몰리면 DB가 병목이 된다. **캐시**는 자주 접근하는 데이터를 메모리에 올려두어 응답 속도를 높이고 DB 부하를 줄이는 역할을 한다.

대표적인 인메모리 캐시 솔루션으로 **Redis**가 많이 사용된다.

---

## 1. Cache-Aside (Lazy Loading)

가장 널리 사용되는 패턴이다. 애플리케이션이 직접 캐시를 관리한다.

### 동작 흐름

```
읽기:
1. 캐시에서 데이터 조회 (Cache Hit?)
2. Hit → 캐시 데이터 반환
3. Miss → DB에서 조회 → 캐시에 저장 → 반환

쓰기:
1. DB에 데이터 쓰기
2. 캐시에서 해당 키 삭제 (invalidate)
```

### Spring Boot + Redis 구현 예제

```java
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final RedisTemplate<String, Product> redisTemplate;

    private static final String KEY_PREFIX = "product:";
    private static final Duration TTL = Duration.ofMinutes(30);

    public Product findById(Long id) {
        String key = KEY_PREFIX + id;

        // 1. 캐시 조회
        Product cached = redisTemplate.opsForValue().get(key);
        if (cached != null) {
            return cached; // Cache Hit
        }

        // 2. Cache Miss → DB 조회
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("상품이 없습니다."));

        // 3. 캐시에 저장
        redisTemplate.opsForValue().set(key, product, TTL);
        return product;
    }

    @Transactional
    public void update(Long id, ProductUpdateRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("상품이 없습니다."));
        product.update(request);

        // DB 업데이트 후 캐시 무효화
        redisTemplate.delete(KEY_PREFIX + id);
    }
}
```

### 장단점

| 장점 | 단점 |
|------|------|
| 구현이 단순하고 직관적 | 첫 요청은 항상 Cache Miss (Cold Start) |
| 실제로 요청된 데이터만 캐싱 | 캐시 만료 전까지 stale 데이터 가능 |
| 캐시 장애 시에도 DB에서 조회 가능 | 애플리케이션에 캐시 로직이 침투 |

---

## 2. Write-Through

데이터를 쓸 때 **캐시와 DB에 동시에** 쓰는 패턴이다.

### 동작 흐름

```
쓰기:
1. 캐시에 데이터 저장
2. 캐시가 동기적으로 DB에도 저장
→ 두 저장소가 항상 동기화됨

읽기:
1. 항상 캐시에서 읽기 (캐시에 최신 데이터 보장)
```

### 의사 코드

```java
public void saveProduct(Product product) {
    // 캐시와 DB에 동시 저장
    redisTemplate.opsForValue().set(
        KEY_PREFIX + product.getId(), product, TTL
    );
    productRepository.save(product);
}

public Product findById(Long id) {
    // 캐시에서 바로 조회 (항상 최신)
    Product cached = redisTemplate.opsForValue().get(KEY_PREFIX + id);
    if (cached != null) {
        return cached;
    }
    // Fallback (캐시 장애 등)
    return productRepository.findById(id).orElseThrow();
}
```

### 장단점

| 장점 | 단점 |
|------|------|
| 캐시 데이터 일관성 보장 | **쓰기 지연 증가** (캐시 + DB 모두 기다림) |
| 읽기 시 항상 Cache Hit | 사용되지 않는 데이터까지 캐싱 (메모리 낭비) |

---

## 3. Write-Behind (Write-Back)

데이터를 **캐시에만 먼저 쓰고**, DB 반영은 **비동기로 나중에** 하는 패턴이다.

### 동작 흐름

```
쓰기:
1. 캐시에 데이터 저장 (즉시 반환)
2. 백그라운드에서 일정 주기/조건에 따라 DB에 반영

읽기:
1. 캐시에서 읽기
```

### 개념 코드

```java
// 쓰기 — 캐시에만 저장하고 큐에 등록
public void saveProduct(Product product) {
    redisTemplate.opsForValue().set(KEY_PREFIX + product.getId(), product);
    writeQueue.add(product); // 비동기 처리 큐
}

// 별도 스레드/스케줄러에서 주기적으로 DB 반영
@Scheduled(fixedDelay = 5000)
public void flushToDatabase() {
    List<Product> batch = writeQueue.drain();
    if (!batch.isEmpty()) {
        productRepository.saveAll(batch);
    }
}
```

### 장단점

| 장점 | 단점 |
|------|------|
| **쓰기 속도가 매우 빠름** | 캐시 장애 시 데이터 유실 위험 |
| DB 부하 분산 (배치 처리) | 구현 복잡도 높음 |
| 짧은 시간에 같은 키를 여러 번 업데이트하면 마지막 값만 DB에 반영 (write 최적화) | 데이터 일관성 보장 어려움 |

---

## 어떤 전략을 언제 쓸까?

| 시나리오 | 추천 전략 | 이유 |
|----------|-----------|------|
| 일반적인 읽기 중심 API | **Cache-Aside** | 구현 간단, 필요한 데이터만 캐싱 |
| 데이터 정합성이 중요한 서비스 | **Write-Through** | 캐시 = DB 동기화 보장 |
| 쓰기가 매우 빈번한 서비스 (조회수, 좋아요) | **Write-Behind** | 쓰기 성능 극대화, 배치 처리 |
| 세션 스토어 | **Write-Through** | 세션 유실 방지 |
| 랭킹/리더보드 | **Write-Behind** | 실시간 반영은 캐시, DB는 주기적 동기화 |

---

## 실무에서 흔히 하는 실수

1. **TTL 설정 누락** — 캐시가 영원히 남아 메모리가 부족해진다
2. **Cache Stampede** — 인기 키의 TTL이 동시에 만료되어 DB에 요청이 몰린다 → TTL에 랜덤 값을 추가하자
3. **캐시 무효화 순서 실수** — 캐시 삭제 후 DB 업데이트 vs DB 업데이트 후 캐시 삭제. 후자가 안전하다
4. **직렬화 비용 무시** — 큰 객체를 매번 JSON 직렬화/역직렬화하면 오히려 느려질 수 있다

---

## 정리

캐싱은 시스템 성능을 크게 향상시킬 수 있지만, **일관성과 복잡도 사이의 트레이드오프**가 항상 존재한다. 서비스의 읽기/쓰기 비율, 데이터 정합성 요구 수준, 장애 허용 범위를 고려해서 적절한 전략을 선택하자. 대부분의 경우 **Cache-Aside로 시작하고**, 필요에 따라 Write-Through나 Write-Behind를 부분적으로 도입하는 것이 현실적인 접근이다.
