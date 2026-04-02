---
title: "Apache Kafka 입문부터 실전까지"
subtitle: "핵심 개념, 메시지 보장, Spring Boot 연동, Dead Letter Queue까지"
layout: post
date: "2026-04-03"
author: "DooDoo"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "kafka, message-queue, event-streaming, backend"
description: "Apache Kafka 입문부터 실전까지. Topic, Partition, Consumer Group, 메시지 보장 수준, Spring Boot 연동, Dead Letter Queue, 이벤트 소싱과 CQRS까지 코드 예제와 함께 정리합니다."
series: Backend
tags:
  - Kafka
  - MessageQueue
  - EventStreaming
  - Backend
categories:
  - backend
---

Apache Kafka 입문부터 실전까지
---

Apache Kafka는 **분산 이벤트 스트리밍 플랫폼**이다. 단순한 메시지 큐를 넘어서 실시간 데이터 파이프라인과 이벤트 기반 아키텍처의 중심에 있다. 이 글에서는 핵심 개념부터 실전 패턴까지 정리한다.

<br>

## 1. Kafka 핵심 개념

### 1.1 아키텍처 개요

```
Producer ──→ [Broker Cluster] ──→ Consumer Group
                  │
            ┌─────┴─────┐
            │  Topic A   │
            │ ┌─────────┐│
            │ │Partition0││
            │ │Partition1││
            │ │Partition2││
            │ └─────────┘│
            └────────────┘
```

### 1.2 핵심 용어 정리

| 개념 | 설명 |
|------|------|
| **Topic** | 메시지를 분류하는 논리적 채널. 하나의 주제(예: `order-events`) |
| **Partition** | Topic을 물리적으로 나눈 단위. 각 파티션 내부는 순서 보장 |
| **Broker** | Kafka 서버 인스턴스. 클러스터는 여러 브로커로 구성 |
| **Consumer Group** | 동일 그룹의 컨슈머가 파티션을 분담하여 병렬 소비 |
| **Offset** | 파티션 내 메시지의 고유 순번(0, 1, 2, ...) |
| **Producer** | 메시지를 Topic에 발행하는 클라이언트 |
| **Consumer** | 메시지를 Topic에서 읽는 클라이언트 |

### 1.3 Partition과 순서 보장

```
Topic: order-events (3 partitions)

Partition 0: [주문A 생성] → [주문A 결제] → [주문A 배송]
Partition 1: [주문B 생성] → [주문B 결제]
Partition 2: [주문C 생성] → [주문C 취소]
```

- **파티션 내부**: 순서 보장 (같은 주문은 같은 파티션으로)
- **파티션 간**: 순서 보장 안 됨

```java
// 같은 키(orderId)를 가진 메시지는 동일 파티션으로
producer.send(new ProducerRecord<>("order-events", orderId, event));
```

### 1.4 Consumer Group 동작 방식

```
Topic: order-events (3 partitions)

Consumer Group "order-service":
  Consumer A ← Partition 0, 1
  Consumer B ← Partition 2

Consumer Group "analytics":
  Consumer C ← Partition 0, 1, 2  (독립적으로 전체 소비)
```

- **같은 그룹**: 파티션을 분담 → 메시지를 한 번만 처리
- **다른 그룹**: 독립적으로 전체 메시지를 소비

<br>

## 2. Producer/Consumer 동작 원리

### 2.1 Producer 동작

```java
Properties props = new Properties();
props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,
        StringSerializer.class.getName());
props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,
        StringSerializer.class.getName());

// acks 설정
props.put(ProducerConfig.ACKS_CONFIG, "all"); // 모든 레플리카 확인

KafkaProducer<String, String> producer = new KafkaProducer<>(props);

// 비동기 전송
producer.send(new ProducerRecord<>("order-events", orderId, orderJson),
    (metadata, exception) -> {
        if (exception != null) {
            log.error("전송 실패: {}", exception.getMessage());
        } else {
            log.info("전송 성공: topic={}, partition={}, offset={}",
                    metadata.topic(), metadata.partition(), metadata.offset());
        }
    });
```

**acks 설정별 동작:**

| acks | 동작 | 성능 | 안정성 |
|------|------|------|--------|
| `0` | 전송 후 확인 안 함 | 최고 | 최저 |
| `1` | 리더 브로커 기록 확인 | 중간 | 중간 |
| `all` (`-1`) | 모든 ISR 레플리카 기록 확인 | 최저 | 최고 |

### 2.2 Consumer 동작

```java
Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
props.put(ConsumerConfig.GROUP_ID_CONFIG, "order-service");
props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
        StringDeserializer.class.getName());
props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
        StringDeserializer.class.getName());
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // 수동 커밋

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
consumer.subscribe(List.of("order-events"));

while (true) {
    ConsumerRecords<String, String> records =
            consumer.poll(Duration.ofMillis(1000));

    for (ConsumerRecord<String, String> record : records) {
        processOrder(record.value());
    }

    // 처리 완료 후 오프셋 커밋
    consumer.commitSync();
}
```

### 2.3 Commit 방식

| 방식 | 설정 | 특징 |
|------|------|------|
| **Auto Commit** | `enable.auto.commit=true` | 주기적 자동 커밋, 중복/유실 가능 |
| **Sync Commit** | `commitSync()` | 커밋 완료까지 블로킹, 안전 |
| **Async Commit** | `commitAsync()` | 논블로킹, 실패 시 재시도 어려움 |

```java
// 레코드 단위 커밋 (가장 정밀)
for (ConsumerRecord<String, String> record : records) {
    processOrder(record.value());

    consumer.commitSync(Map.of(
            new TopicPartition(record.topic(), record.partition()),
            new OffsetAndMetadata(record.offset() + 1)
    ));
}
```

<br>

## 3. 메시지 보장 수준 비교

### 3.1 At-least-once, At-most-once, Exactly-once

| 보장 수준 | 설명 | 중복 | 유실 | 설정 |
|-----------|------|------|------|------|
| **At-most-once** | 최대 한 번 전달 | ✗ | ✓ | 처리 전 커밋 |
| **At-least-once** | 최소 한 번 전달 | ✓ | ✗ | 처리 후 커밋 |
| **Exactly-once** | 정확히 한 번 전달 | ✗ | ✗ | 트랜잭션 + 멱등성 |

### 3.2 At-most-once 구현

```java
// 먼저 커밋 → 처리 중 실패하면 메시지 유실
ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
consumer.commitSync(); // 먼저 커밋!
for (ConsumerRecord<String, String> record : records) {
    processOrder(record.value()); // 여기서 실패하면 유실
}
```

### 3.3 At-least-once 구현

```java
// 처리 후 커밋 → 커밋 전 실패하면 재처리(중복)
ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
for (ConsumerRecord<String, String> record : records) {
    processOrder(record.value()); // 먼저 처리!
}
consumer.commitSync(); // 처리 완료 후 커밋
// 여기서 실패하면 → 다음 poll에서 같은 메시지 다시 수신
```

**멱등성(Idempotency)** 으로 중복 처리 방어:

```java
public void processOrder(OrderEvent event) {
    // 이미 처리한 이벤트인지 확인
    if (processedEventRepository.existsById(event.getEventId())) {
        log.info("이미 처리된 이벤트: {}", event.getEventId());
        return;
    }
    orderService.createOrder(event);
    processedEventRepository.save(new ProcessedEvent(event.getEventId()));
}
```

### 3.4 Exactly-once (Kafka Transactions)

```java
// Producer: 트랜잭션 설정
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-tx-1");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("order-events", key, value));
    producer.send(new ProducerRecord<>("payment-events", key, paymentValue));
    producer.commitTransaction(); // 두 메시지 모두 성공 또는 모두 실패
} catch (Exception e) {
    producer.abortTransaction();
    throw e;
}
```

```java
// Consumer: read_committed로 커밋된 메시지만 소비
props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
```

<br>

## 4. Spring Boot Kafka 연동

### 4.1 의존성 및 설정

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.kafka:spring-kafka'
}
```

```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      retries: 3
    consumer:
      group-id: order-service
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      auto-offset-reset: earliest
      enable-auto-commit: false
      properties:
        spring.json.trusted.packages: "com.example.event"
    listener:
      ack-mode: manual
```

### 4.2 KafkaTemplate — 메시지 발행

```java
@Service
@RequiredArgsConstructor
public class OrderEventProducer {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void publishOrderCreated(Order order) {
        OrderEvent event = new OrderEvent(
                UUID.randomUUID().toString(),
                order.getId(),
                "ORDER_CREATED",
                order
        );

        CompletableFuture<SendResult<String, OrderEvent>> future =
                kafkaTemplate.send("order-events", order.getId(), event);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("메시지 전송 실패: {}", ex.getMessage());
            } else {
                log.info("메시지 전송 성공: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            }
        });
    }
}
```

### 4.3 @KafkaListener — 메시지 소비

```java
@Service
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final OrderService orderService;

    @KafkaListener(
            topics = "order-events",
            groupId = "order-service",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleOrderEvent(
            @Payload OrderEvent event,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset,
            Acknowledgment ack) {

        log.info("수신: event={}, partition={}, offset={}",
                event.getType(), partition, offset);

        try {
            switch (event.getType()) {
                case "ORDER_CREATED" -> orderService.handleCreated(event);
                case "ORDER_PAID" -> orderService.handlePaid(event);
                case "ORDER_CANCELLED" -> orderService.handleCancelled(event);
                default -> log.warn("알 수 없는 이벤트: {}", event.getType());
            }
            ack.acknowledge(); // 수동 커밋
        } catch (Exception e) {
            log.error("이벤트 처리 실패: {}", e.getMessage());
            // ack 하지 않음 → 재시도 또는 DLQ로 이동
        }
    }
}
```

### 4.4 Listener Container Factory 설정

```java
@Configuration
public class KafkaConfig {

    @Autowired
    private KafkaTemplate<String, OrderEvent> kafkaTemplate;

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, OrderEvent>
            kafkaListenerContainerFactory(
                    ConsumerFactory<String, OrderEvent> consumerFactory) {

        ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setConcurrency(3); // 3개 스레드로 병렬 소비
        factory.getContainerProperties()
                .setAckMode(ContainerProperties.AckMode.MANUAL);

        // 에러 핸들러 + DLQ
        factory.setCommonErrorHandler(
                new DefaultErrorHandler(
                        new DeadLetterPublishingRecoverer(kafkaTemplate),
                        new FixedBackOff(1000L, 3) // 1초 간격, 3번 재시도
                ));

        return factory;
    }
}
```

<br>

## 5. Consumer Group Rebalancing

### 5.1 Rebalancing이 발생하는 시점

- 컨슈머가 그룹에 **새로 참가**하거나 **이탈**할 때
- 컨슈머가 **heartbeat 타임아웃** (세션 만료)
- 토픽의 **파티션 수가 변경**될 때

```
Before Rebalancing:
  Consumer A ← P0, P1
  Consumer B ← P2

Consumer C 참가 → Rebalancing 발생

After Rebalancing:
  Consumer A ← P0
  Consumer B ← P1
  Consumer C ← P2
```

### 5.2 Rebalancing 전략

| 전략 | 동작 | 장점 | 단점 |
|------|------|------|------|
| **Eager (Range/RoundRobin)** | 모든 파티션 해제 → 재할당 | 구현 단순 | 전체 중단(Stop-the-World) |
| **Cooperative (Incremental)** | 이동이 필요한 파티션만 재할당 | 중단 최소화 | 여러 라운드 필요 |

```yaml
# Cooperative Rebalancing 활성화
spring:
  kafka:
    consumer:
      properties:
        partition.assignment.strategy: org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

### 5.3 Rebalancing 최적화

```yaml
spring:
  kafka:
    consumer:
      properties:
        # Heartbeat 간격 (기본 3초)
        heartbeat.interval.ms: 3000
        # 세션 타임아웃 (기본 45초)
        session.timeout.ms: 45000
        # poll 최대 간격 — 이 시간 내 poll() 호출 필수
        max.poll.interval.ms: 300000
        # 한 번에 가져오는 레코드 수
        max.poll.records: 500
```

> **Tip**: `max.poll.records`를 줄이면 처리 시간이 `max.poll.interval.ms`를 넘기는 것을 방지할 수 있다.

<br>

## 6. 실전 패턴: Dead Letter Queue & Retry 전략

### 6.1 Dead Letter Queue (DLQ)

처리에 반복적으로 실패한 메시지를 **별도 토픽**으로 이동시켜 메인 처리 흐름을 보호한다.

```
order-events → Consumer (처리 시도)
    ├── 성공 → ack
    └── 3회 실패 → order-events.DLT (Dead Letter Topic)
                      └── DLQ 모니터링 & 수동 처리
```

```java
@Configuration
public class KafkaConfig {

    @Bean
    public DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
        // DLQ로 보내는 Recoverer
        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(template,
                        (record, ex) -> new TopicPartition(
                                record.topic() + ".DLT", record.partition()));

        // 1초, 2초, 4초 간격으로 3번 재시도 후 DLQ
        ExponentialBackOff backOff = new ExponentialBackOff(1000L, 2.0);
        backOff.setMaxElapsedTime(10000L);

        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);

        // 특정 예외는 재시도 없이 바로 DLQ로
        handler.addNotRetryableExceptions(
                InvalidMessageException.class,
                DeserializationException.class
        );

        return handler;
    }
}
```

### 6.2 DLQ 메시지 모니터링 & 재처리

```java
@KafkaListener(topics = "order-events.DLT", groupId = "dlq-handler")
public void handleDlq(
        ConsumerRecord<String, OrderEvent> record,
        @Header(KafkaHeaders.DLT_EXCEPTION_MESSAGE) String errorMessage,
        @Header(KafkaHeaders.DLT_ORIGINAL_TOPIC) String originalTopic) {

    log.error("DLQ 수신: key={}, error={}, originalTopic={}",
            record.key(), errorMessage, originalTopic);

    // 알림 발송 (Slack, PagerDuty 등)
    alertService.sendDlqAlert(record, errorMessage);

    // 필요 시 수동 재처리 큐에 저장
    dlqRepository.save(new DlqRecord(record, errorMessage, originalTopic));
}
```

### 6.3 Retry Topic 패턴

DLQ 대신 **단계별 재시도 토픽**을 사용하는 고급 패턴:

```
order-events → 실패 → order-events-retry-1 (1분 후)
                         → 실패 → order-events-retry-2 (10분 후)
                                    → 실패 → order-events-DLT
```

```java
@RetryableTopic(
        attempts = "4",
        backoff = @Backoff(delay = 60000, multiplier = 10, maxDelay = 600000),
        dltStrategy = DltStrategy.FAIL_ON_ERROR,
        topicSuffixingStrategy = TopicSuffixingStrategy.SUFFIX_WITH_INDEX_VALUE
)
@KafkaListener(topics = "order-events", groupId = "order-service")
public void handleOrderEvent(OrderEvent event, Acknowledgment ack) {
    orderService.process(event);
    ack.acknowledge();
}

@DltHandler
public void handleDlt(OrderEvent event) {
    log.error("최종 실패 — DLT 도착: {}", event);
    alertService.sendCriticalAlert(event);
}
```

<br>

## 7. 이벤트 소싱, CQRS와의 조합

### 7.1 이벤트 소싱 (Event Sourcing)

상태를 직접 저장하는 대신 **상태 변경 이벤트를 순차적으로 저장**하고, 이벤트를 재생하여 현재 상태를 도출한다.

```
주문 #123의 이벤트 로그:
  1. OrderCreated  {items: [...], total: 50000}
  2. PaymentCompleted {paymentId: "pay-1"}
  3. ItemAdded {item: "keyboard", amount: 30000}
  4. OrderShipped {trackingNo: "T-456"}

현재 상태 = 이벤트 1~4를 순차 적용한 결과
```

```java
// Kafka를 이벤트 저장소로 활용
@Service
public class OrderEventStore {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void append(String orderId, OrderEvent event) {
        // 주문 ID를 키로 → 같은 파티션에 순서대로 저장
        kafkaTemplate.send("order-event-store", orderId, event);
    }
}
```

### 7.2 CQRS (Command Query Responsibility Segregation)

**쓰기 모델**과 **읽기 모델**을 분리하여 각각 최적화한다.

```
[Command Side]                    [Query Side]
  Order Command ──→ Event Store   Event Store ──→ Kafka ──→ Read Model
  (정규화 DB)      (Kafka)                                  (비정규화, Elasticsearch 등)
```

```java
// Command: 주문 생성
@Service
public class OrderCommandService {
    public void createOrder(CreateOrderCommand command) {
        Order order = Order.create(command);
        orderRepository.save(order);

        // 이벤트 발행
        kafkaTemplate.send("order-events", order.getId(),
                new OrderCreatedEvent(order));
    }
}

// Query: 읽기 모델 업데이트
@Service
public class OrderQueryProjector {

    @KafkaListener(topics = "order-events", groupId = "order-query")
    public void project(OrderEvent event) {
        switch (event) {
            case OrderCreatedEvent e -> {
                OrderView view = new OrderView(
                        e.getOrderId(), e.getCustomerName(),
                        e.getItems(), e.getTotal(), "CREATED"
                );
                orderViewRepository.save(view); // Elasticsearch, MongoDB 등
            }
            case OrderShippedEvent e -> {
                orderViewRepository.updateStatus(
                        e.getOrderId(), "SHIPPED", e.getTrackingNo());
            }
            // ...
        }
    }
}

// Query: 읽기 전용 API
@RestController
public class OrderQueryController {

    @GetMapping("/orders/{orderId}")
    public OrderView getOrder(@PathVariable String orderId) {
        return orderViewRepository.findById(orderId).orElseThrow();
    }

    @GetMapping("/orders/search")
    public List<OrderView> searchOrders(@RequestParam String keyword) {
        return orderViewRepository.searchByKeyword(keyword);
    }
}
```

### 7.3 조합의 장단점

| 장점 | 단점 |
|------|------|
| 이벤트 이력 완전 보존 | 시스템 복잡도 증가 |
| 읽기/쓰기 독립 확장 | 최종 일관성(Eventual Consistency) |
| 다양한 읽기 모델 구축 가능 | 이벤트 스키마 버전 관리 필요 |
| 감사 로그 자동 확보 | 이벤트 재생 시간 |

<br>

## 정리

| 개념 | 핵심 |
|------|------|
| Topic / Partition | 논리적 채널과 물리적 분산 단위 |
| Consumer Group | 파티션 분담으로 병렬 처리 |
| Offset Commit | 메시지 처리 위치 관리, 보장 수준 결정 |
| acks | Producer의 안정성-성능 트레이드오프 |
| At-least-once + 멱등성 | 실전에서 가장 많이 사용되는 보장 전략 |
| @KafkaListener | Spring Boot의 선언적 메시지 소비 |
| Dead Letter Queue | 실패 메시지 격리로 안정성 확보 |
| Event Sourcing + CQRS | Kafka를 중심으로 한 이벤트 기반 아키텍처 |

Kafka는 단순한 메시지 전달이 아니라, **이벤트 기반 시스템의 근간**이다. 메시지 보장 수준과 장애 처리 전략을 올바르게 설계하는 것이 안정적인 시스템의 핵심이다.
