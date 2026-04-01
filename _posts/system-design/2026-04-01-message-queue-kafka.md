---
title: "메시지 큐와 Kafka — 비동기 아키텍처 설계"
subtitle: "RabbitMQ, Kafka, SQS 비교부터 Spring Kafka 실전 코드까지"
layout: post
date: 2026-04-01
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
series: "System Design"
categories: system-design
tags:
  - Kafka
  - MessageQueue
  - SystemDesign
  - Backend
  - Spring
description: "메시지 큐의 필요성과 RabbitMQ, Kafka, SQS 비교, Kafka 핵심 개념, Java/Spring Kafka 실전 코드, Dead Letter Queue와 Exactly-Once 패턴까지 정리합니다."
---

## 왜 메시지 큐가 필요한가

주문 서비스가 결제 완료 후 재고 차감, 알림 발송, 포인트 적립을 처리해야 한다고 하자. 동기 방식으로 구현하면 이렇게 된다.

```java
@Transactional
public OrderResponse createOrder(OrderRequest request) {
    Order order = orderRepository.save(request.toEntity());
    paymentService.process(order);       // 200ms
    inventoryService.deduct(order);      // 150ms
    notificationService.send(order);     // 300ms
    pointService.accumulate(order);      // 100ms
    return OrderResponse.from(order);    // 총 750ms+
}
```

문제가 여러 가지다.

- **응답 지연**: 모든 하위 서비스 호출이 직렬로 실행되어 총 응답 시간이 길어진다.
- **강한 결합**: 알림 서비스가 장애를 일으키면 주문 자체가 실패한다.
- **확장 어려움**: 새로운 후처리(예: 통계 집계)를 추가하려면 주문 서비스 코드를 수정해야 한다.

메시지 큐를 도입하면 주문 서비스는 "주문 완료" 이벤트만 발행하고 즉시 응답한다. 하위 서비스들은 각자 메시지를 소비하며 독립적으로 처리한다.

```java
@Transactional
public OrderResponse createOrder(OrderRequest request) {
    Order order = orderRepository.save(request.toEntity());
    paymentService.process(order);
    // 나머지는 비동기로 처리
    messagePublisher.publish("order.completed", OrderEvent.from(order));
    return OrderResponse.from(order);    // 200ms로 단축
}
```

---

## 메시지 큐 종류 비교

### RabbitMQ vs Kafka vs SQS

| 항목 | RabbitMQ | Kafka | AWS SQS |
|---|---|---|---|
| 모델 | 메시지 브로커 (Push) | 이벤트 로그 (Pull) | 관리형 큐 (Pull) |
| 처리량 | 중간 (~수만 msg/s) | 매우 높음 (~수백만 msg/s) | 높음 (자동 확장) |
| 메시지 보존 | 소비 후 삭제 | 설정 기간 동안 보존 | 소비 후 삭제 |
| 순서 보장 | 큐 단위 보장 | 파티션 단위 보장 | FIFO 큐만 보장 |
| 재처리 | 어려움 | 오프셋 되감기로 쉬움 | 어려움 |
| 운영 복잡도 | 중간 | 높음 (ZooKeeper/KRaft) | 낮음 (관리형) |
| 적합한 경우 | 복잡한 라우팅, 작업 큐 | 이벤트 스트리밍, 로그 수집 | AWS 네이티브 서비스 |

**RabbitMQ**는 Exchange-Queue 기반의 유연한 라우팅이 강점이다. 작업 큐(Task Queue) 패턴에 적합하다.

**Kafka**는 메시지를 로그로 저장하기 때문에 재처리가 가능하고, 높은 처리량이 필요한 이벤트 스트리밍에 적합하다.

**SQS**는 인프라 관리 부담 없이 AWS 생태계에서 빠르게 구축할 때 좋다.

---

## Kafka 핵심 개념

### Topic과 Partition

**Topic**은 메시지의 논리적 카테고리다. 하나의 토픽은 여러 **Partition**으로 나뉜다. 파티션은 순서가 보장되는 로그 구조이며, 병렬 처리의 단위다.

```
Topic: order-events
├── Partition 0: [msg0, msg1, msg4, msg7, ...]
├── Partition 1: [msg2, msg3, msg5, ...]
└── Partition 2: [msg6, msg8, msg9, ...]
```

메시지는 **키(key)**에 따라 특정 파티션에 할당된다. 같은 키를 가진 메시지는 항상 같은 파티션에 들어가므로 순서가 보장된다.

### Consumer Group

같은 **Consumer Group** 내의 컨슈머들은 파티션을 나누어 소비한다. 하나의 파티션은 그룹 내 하나의 컨슈머에게만 할당된다.

```
Consumer Group: order-service-group
├── Consumer A ← Partition 0
├── Consumer B ← Partition 1
└── Consumer C ← Partition 2
```

컨슈머를 추가하면 파티션이 리밸런싱된다. 단, 파티션 수보다 컨슈머가 많으면 놀고 있는 컨슈머가 생긴다.

### Offset

각 파티션 내에서 메시지의 위치를 나타내는 순차 번호다. 컨슈머는 자신이 어디까지 읽었는지 오프셋을 커밋한다. 장애 복구 시 마지막 커밋된 오프셋부터 다시 읽으면 된다.

```
Partition 0: [0] [1] [2] [3] [4] [5] [6] [7]
                              ^
                    committed offset = 4
                    → 재시작 시 offset 4부터 소비
```

---

## Kafka 프로듀서/컨슈머 Java 코드

### 프로듀서

```java
import org.apache.kafka.clients.producer.*;
import java.util.Properties;

public class OrderEventProducer {

    private final KafkaProducer<String, String> producer;

    public OrderEventProducer() {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,
            "org.apache.kafka.common.serialization.StringSerializer");
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,
            "org.apache.kafka.common.serialization.StringSerializer");
        props.put(ProducerConfig.ACKS_CONFIG, "all");    // 모든 복제본 확인
        props.put(ProducerConfig.RETRIES_CONFIG, 3);
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);

        this.producer = new KafkaProducer<>(props);
    }

    public void sendOrderEvent(String orderId, String eventJson) {
        ProducerRecord<String, String> record =
            new ProducerRecord<>("order-events", orderId, eventJson);

        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                System.err.println("메시지 전송 실패: " + exception.getMessage());
            } else {
                System.out.printf("전송 성공 — topic: %s, partition: %d, offset: %d%n",
                    metadata.topic(), metadata.partition(), metadata.offset());
            }
        });
    }

    public void close() {
        producer.close();
    }
}
```

### 컨슈머

```java
import org.apache.kafka.clients.consumer.*;
import java.time.Duration;
import java.util.List;
import java.util.Properties;

public class OrderEventConsumer {

    public void startConsuming() {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "order-service-group");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,
            "org.apache.kafka.common.serialization.StringDeserializer");
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
            "org.apache.kafka.common.serialization.StringDeserializer");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of("order-events"));

            while (true) {
                ConsumerRecords<String, String> records =
                    consumer.poll(Duration.ofMillis(1000));

                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("수신 — key: %s, value: %s, partition: %d, offset: %d%n",
                        record.key(), record.value(), record.partition(), record.offset());

                    processOrder(record.value());
                }

                consumer.commitSync();    // 수동 커밋
            }
        }
    }

    private void processOrder(String eventJson) {
        // 주문 이벤트 처리 로직
    }
}
```

---

## Spring Kafka 실전 코드

### 의존성과 설정

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
    consumer:
      group-id: order-service-group
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      auto-offset-reset: earliest
      properties:
        spring.json.trusted.packages: "com.example.event"
```

### KafkaTemplate으로 메시지 발행

```java
@Service
@RequiredArgsConstructor
public class OrderEventPublisher {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void publishOrderCompleted(Order order) {
        OrderEvent event = new OrderEvent(
            order.getId(),
            order.getUserId(),
            order.getTotalAmount(),
            LocalDateTime.now()
        );

        kafkaTemplate.send("order-events", order.getId().toString(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("이벤트 발행 실패: orderId={}", order.getId(), ex);
                } else {
                    log.info("이벤트 발행 성공: topic={}, partition={}, offset={}",
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
                }
            });
    }
}
```

### @KafkaListener로 메시지 소비

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryEventConsumer {

    private final InventoryService inventoryService;

    @KafkaListener(
        topics = "order-events",
        groupId = "inventory-service-group",
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleOrderEvent(
            @Payload OrderEvent event,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset,
            Acknowledgment ack) {

        log.info("주문 이벤트 수신: orderId={}, partition={}, offset={}",
            event.getOrderId(), partition, offset);

        try {
            inventoryService.deductStock(event);
            ack.acknowledge();    // 수동 커밋
        } catch (Exception e) {
            log.error("재고 차감 실패: orderId={}", event.getOrderId(), e);
            // 재시도 또는 DLQ로 전송
            throw e;
        }
    }
}
```

---

## 실무 패턴

### Dead Letter Queue (DLQ)

처리에 실패한 메시지를 별도 토픽으로 보내 나중에 분석하거나 재처리한다.

```java
@Bean
public ConcurrentKafkaListenerContainerFactory<String, OrderEvent>
        kafkaListenerContainerFactory(ConsumerFactory<String, OrderEvent> consumerFactory,
                                     KafkaTemplate<String, OrderEvent> kafkaTemplate) {

    DefaultErrorHandler errorHandler = new DefaultErrorHandler(
        new DeadLetterPublishingRecoverer(kafkaTemplate),
        new FixedBackOff(1000L, 3)    // 1초 간격, 최대 3회 재시도
    );

    ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(consumerFactory);
    factory.setCommonErrorHandler(errorHandler);
    factory.getContainerProperties().setAckMode(AckMode.MANUAL);

    return factory;
}
```

3번 재시도 후에도 실패하면 `order-events.DLT` 토픽으로 메시지가 이동한다.

### Exactly-Once Semantics

Kafka는 프로듀서의 멱등성(Idempotence)과 트랜잭션을 조합해 Exactly-Once를 지원한다.

```yaml
spring:
  kafka:
    producer:
      transaction-id-prefix: tx-order-
      properties:
        enable.idempotence: true
```

```java
@Transactional
public void processAndPublish(OrderEvent event) {
    // DB 작업과 Kafka 발행을 하나의 트랜잭션으로
    orderRepository.save(event.toEntity());
    kafkaTemplate.send("order-processed", event);
}
```

### Idempotent Consumer

네트워크 장애로 메시지가 중복 전달될 수 있다. 컨슈머 측에서 멱등성을 보장해야 한다.

```java
@Service
@RequiredArgsConstructor
public class IdempotentOrderConsumer {

    private final ProcessedEventRepository processedEventRepository;
    private final InventoryService inventoryService;

    @KafkaListener(topics = "order-events", groupId = "inventory-group")
    @Transactional
    public void handle(OrderEvent event, Acknowledgment ack) {
        String eventId = event.getOrderId() + ":" + event.getTimestamp();

        // 이미 처리된 이벤트인지 확인
        if (processedEventRepository.existsByEventId(eventId)) {
            log.info("중복 이벤트 무시: {}", eventId);
            ack.acknowledge();
            return;
        }

        inventoryService.deductStock(event);
        processedEventRepository.save(new ProcessedEvent(eventId));
        ack.acknowledge();
    }
}
```

---

## 정리

메시지 큐는 서비스 간 결합도를 낮추고 비동기 처리로 응답 속도를 높이는 핵심 아키텍처 도구다. Kafka는 높은 처리량과 메시지 재처리가 필요한 이벤트 스트리밍에 강점이 있으며, Spring Kafka를 통해 비교적 간편하게 통합할 수 있다. 다만 DLQ, 멱등성 보장, Exactly-Once 같은 실무 패턴을 함께 적용해야 안정적인 비동기 아키텍처를 구축할 수 있다.
