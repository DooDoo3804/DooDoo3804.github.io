---
layout: post
title: "gRPC 기초 — Protocol Buffers부터 Spring Boot 연동까지"
subtitle: "REST를 넘어 고성능 서비스 간 통신, gRPC의 핵심 개념과 실전 구현"
date: "2026-04-03"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
keywords: "grpc, protocol buffers, spring boot, http2, rpc"
series: "Container & Infra"
tags:
  - gRPC
  - Protocol Buffers
  - Spring Boot
  - Backend
categories:
  - infra
description: "gRPC 핵심 개념과 REST 비교, Protocol Buffers 작성법, Spring Boot 연동 및 양방향 스트리밍까지. 실전 코드와 함께 고성능 서비스 간 통신을 정리합니다."
---

## REST만으로 충분할까

마이크로서비스 간 통신을 설계할 때 가장 먼저 떠오르는 것은 REST API다. JSON을 주고받는 HTTP/1.1 기반 통신은 이해하기 쉽고 도구도 풍부하다. 하지만 서비스 수가 늘어나고 내부 트래픽이 증가하면 한계가 드러난다.

- **직렬화 오버헤드**: JSON은 텍스트 기반이라 파싱 비용이 크다
- **스키마 부재**: API 변경 시 양쪽 모두 수동으로 맞춰야 한다
- **단방향 통신**: HTTP/1.1은 요청-응답 모델만 지원한다
- **연결 비효율**: 요청마다 새 TCP 연결을 맺거나 제한적으로 재사용한다

**gRPC**는 Google이 내부에서 사용하던 Stubby를 오픈소스로 공개한 고성능 RPC 프레임워크다. HTTP/2와 Protocol Buffers를 기반으로 위 문제를 해결한다.

---

## REST vs gRPC 비교

| 기준 | REST | gRPC |
|------|------|------|
| **프로토콜** | HTTP/1.1 (주로) | HTTP/2 |
| **데이터 형식** | JSON (텍스트) | Protocol Buffers (바이너리) |
| **스키마** | OpenAPI/Swagger (선택) | `.proto` 파일 (필수) |
| **코드 생성** | 수동 또는 codegen 도구 | protoc 컴파일러로 자동 생성 |
| **스트리밍** | 제한적 (SSE, WebSocket 별도) | 네이티브 양방향 스트리밍 |
| **직렬화 속도** | 느림 | 빠름 (바이너리) |
| **페이로드 크기** | 큼 | 작음 (약 30~50% 절감) |
| **브라우저 지원** | 우수 | 제한적 (gRPC-Web 필요) |
| **디버깅** | curl로 간단 | 별도 도구 필요 (grpcurl 등) |
| **적합한 용도** | 외부 API, 웹 클라이언트 | 서비스 간 내부 통신 |

> gRPC는 REST를 대체하는 것이 아니라 **보완**하는 기술이다. 외부 API는 REST로, 내부 서비스 간 통신은 gRPC로 구성하는 것이 일반적인 패턴이다.

---

## Protocol Buffers 기초

Protocol Buffers(protobuf)는 gRPC의 **인터페이스 정의 언어(IDL)**이자 **직렬화 포맷**이다. `.proto` 파일 하나로 메시지 구조와 서비스 인터페이스를 정의하면, 다양한 언어의 코드가 자동 생성된다.

### .proto 파일 작성

```protobuf
// hello.proto
syntax = "proto3";

package com.example.grpc;

option java_multiple_files = true;
option java_package = "com.example.grpc.hello";

// 메시지 정의
message HelloRequest {
  string name = 1;           // 필드 번호 (직렬화에 사용)
  int32 age = 2;
  repeated string tags = 3;  // 배열(리스트)
}

message HelloResponse {
  string message = 1;
  int64 timestamp = 2;
}

// 서비스 정의
service HelloService {
  // Unary RPC — 일반 요청-응답
  rpc SayHello (HelloRequest) returns (HelloResponse);

  // Server Streaming — 서버가 여러 응답을 스트리밍
  rpc SayHelloStream (HelloRequest) returns (stream HelloResponse);
}
```

### 필드 번호 규칙

필드 번호는 직렬화 시 필드를 식별하는 데 사용된다. **한번 정한 번호는 변경하면 안 된다.**

```protobuf
message User {
  string name = 1;      // 1~15: 1바이트로 인코딩 (자주 쓰는 필드에)
  string email = 2;
  int32 age = 3;
  string address = 16;  // 16 이상: 2바이트로 인코딩
  // reserved 4, 5;     // 삭제된 필드 번호는 reserved로 보호
}
```

### 주요 데이터 타입

| proto 타입 | Java 타입 | 설명 |
|-----------|-----------|------|
| `string` | `String` | UTF-8 문자열 |
| `int32` / `int64` | `int` / `long` | 정수 |
| `float` / `double` | `float` / `double` | 부동소수점 |
| `bool` | `boolean` | 불리언 |
| `bytes` | `ByteString` | 바이트 배열 |
| `repeated T` | `List<T>` | 리스트 |
| `map<K, V>` | `Map<K, V>` | 맵 |

---

## gRPC 통신 패턴 4가지

```
1. Unary (단일)       Client ──req──→ Server ──res──→ Client
2. Server Streaming   Client ──req──→ Server ══res══→ Client (여러 응답)
3. Client Streaming   Client ══req══→ Server ──res──→ Client (여러 요청)
4. Bidirectional      Client ══req══→ Server
                      Client ←══res══ Server (양방향 동시 스트리밍)
```

| 패턴 | 사용 사례 |
|------|-----------|
| **Unary** | 일반 CRUD, 인증 |
| **Server Streaming** | 실시간 알림, 로그 스트리밍, 주식 시세 |
| **Client Streaming** | 파일 업로드, 센서 데이터 수집 |
| **Bidirectional** | 채팅, 실시간 게임, 양방향 동기화 |

---

## Spring Boot + gRPC 연동

### 프로젝트 설정

`grpc-spring-boot-starter`를 사용하면 Spring Boot와 gRPC를 쉽게 통합할 수 있다.

```groovy
// build.gradle
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.5'
    id 'com.google.protobuf' version '0.9.4'
}

dependencies {
    implementation 'net.devh:grpc-spring-boot-starter:3.1.0.RELEASE'
    implementation 'io.grpc:grpc-protobuf:1.62.2'
    implementation 'io.grpc:grpc-stub:1.62.2'

    // protobuf 직렬화
    implementation 'com.google.protobuf:protobuf-java:3.25.3'
}

protobuf {
    protoc {
        artifact = 'com.google.protobuf:protoc:3.25.3'
    }
    plugins {
        grpc {
            artifact = 'io.grpc:protoc-gen-grpc-java:1.62.2'
        }
    }
    generateProtoTasks {
        all()*.plugins {
            grpc {}
        }
    }
}
```

```yaml
# application.yml
grpc:
  server:
    port: 9090
  client:
    hello-service:
      address: 'static://localhost:9090'
      negotiation-type: plaintext
```

### .proto 파일 배치

```
src/
  main/
    proto/
      hello.proto     ← 여기에 .proto 파일 배치
    java/
      com.example/
        ...
```

`./gradlew generateProto`를 실행하면 `build/generated/source/proto/` 아래에 Java 코드가 자동 생성된다.

### gRPC 서버 구현

```java
@GrpcService
public class HelloGrpcService extends HelloServiceGrpc.HelloServiceImplBase {

    @Override
    public void sayHello(HelloRequest request,
                         StreamObserver<HelloResponse> responseObserver) {
        String message = String.format("안녕하세요, %s님! (나이: %d)",
                request.getName(), request.getAge());

        HelloResponse response = HelloResponse.newBuilder()
                .setMessage(message)
                .setTimestamp(System.currentTimeMillis())
                .build();

        responseObserver.onNext(response);     // 응답 전송
        responseObserver.onCompleted();         // 스트림 종료
    }

    @Override
    public void sayHelloStream(HelloRequest request,
                               StreamObserver<HelloResponse> responseObserver) {
        // Server Streaming: 3번에 걸쳐 응답 전송
        for (int i = 1; i <= 3; i++) {
            HelloResponse response = HelloResponse.newBuilder()
                    .setMessage(String.format("[%d/3] 안녕하세요, %s님!",
                            i, request.getName()))
                    .setTimestamp(System.currentTimeMillis())
                    .build();

            responseObserver.onNext(response);

            try {
                Thread.sleep(1000); // 1초 간격으로 전송
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                responseObserver.onError(e);
                return;
            }
        }
        responseObserver.onCompleted();
    }
}
```

`@GrpcService` 어노테이션 하나로 Spring Bean으로 등록되며, gRPC 서버가 자동으로 해당 서비스를 노출한다.

### gRPC 클라이언트 구현

```java
@Service
public class HelloGrpcClient {

    private final HelloServiceGrpc.HelloServiceBlockingStub blockingStub;

    public HelloGrpcClient(
            @GrpcClient("hello-service")
            HelloServiceGrpc.HelloServiceBlockingStub blockingStub) {
        this.blockingStub = blockingStub;
    }

    // Unary 호출
    public String sayHello(String name, int age) {
        HelloRequest request = HelloRequest.newBuilder()
                .setName(name)
                .setAge(age)
                .build();

        HelloResponse response = blockingStub.sayHello(request);
        return response.getMessage();
    }

    // Server Streaming 호출
    public List<String> sayHelloStream(String name) {
        HelloRequest request = HelloRequest.newBuilder()
                .setName(name)
                .build();

        List<String> messages = new ArrayList<>();
        Iterator<HelloResponse> responses =
                blockingStub.sayHelloStream(request);

        while (responses.hasNext()) {
            messages.add(responses.next().getMessage());
        }
        return messages;
    }
}
```

`@GrpcClient("hello-service")`는 `application.yml`에 설정한 클라이언트 채널 이름과 매핑된다.

### REST API 래핑 (외부 노출용)

내부는 gRPC로 통신하고, 외부 클라이언트를 위해 REST 엔드포인트를 제공하는 패턴이다.

```java
@RestController
@RequestMapping("/api/hello")
@RequiredArgsConstructor
public class HelloController {

    private final HelloGrpcClient helloGrpcClient;

    @GetMapping("/{name}")
    public ResponseEntity<Map<String, String>> hello(
            @PathVariable String name,
            @RequestParam(defaultValue = "0") int age) {

        String message = helloGrpcClient.sayHello(name, age);
        return ResponseEntity.ok(Map.of("message", message));
    }

    @GetMapping("/{name}/stream")
    public ResponseEntity<List<String>> helloStream(
            @PathVariable String name) {

        List<String> messages = helloGrpcClient.sayHelloStream(name);
        return ResponseEntity.ok(messages);
    }
}
```

---

## 양방향 스트리밍 예제

양방향 스트리밍은 gRPC의 가장 강력한 기능이다. 클라이언트와 서버가 **동시에** 메시지를 주고받을 수 있다.

### .proto 정의

```protobuf
service ChatService {
  rpc Chat (stream ChatMessage) returns (stream ChatMessage);
}

message ChatMessage {
  string sender = 1;
  string content = 2;
  int64 timestamp = 3;
}
```

### 서버 구현

```java
@GrpcService
public class ChatGrpcService extends ChatServiceGrpc.ChatServiceImplBase {

    private final Set<StreamObserver<ChatMessage>> clients =
            ConcurrentHashMap.newKeySet();

    @Override
    public StreamObserver<ChatMessage> chat(
            StreamObserver<ChatMessage> responseObserver) {

        clients.add(responseObserver);

        return new StreamObserver<>() {
            @Override
            public void onNext(ChatMessage message) {
                // 모든 클라이언트에 브로드캐스트
                for (StreamObserver<ChatMessage> client : clients) {
                    if (client != responseObserver) {
                        client.onNext(message);
                    }
                }
            }

            @Override
            public void onError(Throwable t) {
                clients.remove(responseObserver);
            }

            @Override
            public void onCompleted() {
                clients.remove(responseObserver);
                responseObserver.onCompleted();
            }
        };
    }
}
```

---

## 실전 팁

### 1. 에러 처리

gRPC는 자체 상태 코드 체계를 가진다. HTTP 상태 코드와 다르므로 주의하자.

| gRPC 상태 | HTTP 매핑 | 의미 |
|-----------|-----------|------|
| `OK` | 200 | 성공 |
| `INVALID_ARGUMENT` | 400 | 잘못된 요청 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `ALREADY_EXISTS` | 409 | 중복 |
| `PERMISSION_DENIED` | 403 | 권한 없음 |
| `UNAVAILABLE` | 503 | 서비스 불가 |

```java
@Override
public void sayHello(HelloRequest request,
                     StreamObserver<HelloResponse> responseObserver) {
    if (request.getName().isBlank()) {
        responseObserver.onError(Status.INVALID_ARGUMENT
                .withDescription("이름은 필수입니다.")
                .asRuntimeException());
        return;
    }
    // 정상 처리...
}
```

### 2. Deadline (타임아웃) 설정

```java
HelloResponse response = blockingStub
        .withDeadlineAfter(3, TimeUnit.SECONDS)  // 3초 타임아웃
        .sayHello(request);
```

클라이언트에서 Deadline을 설정하면 서버 측에서도 남은 시간을 확인할 수 있다. 체인 호출 시 Deadline이 전파되어 전체 호출 경로의 타임아웃을 제어한다.

### 3. Interceptor (미들웨어)

```java
@GrpcGlobalServerInterceptor
public class LoggingInterceptor implements ServerInterceptor {

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        String method = call.getMethodDescriptor().getFullMethodName();
        long start = System.currentTimeMillis();

        ServerCall.Listener<ReqT> listener = next.startCall(call, headers);

        return new ForwardingServerCallListener.SimpleForwardingServerCallListener<>(
                listener) {
            @Override
            public void onComplete() {
                long elapsed = System.currentTimeMillis() - start;
                log.info("gRPC {} — {}ms", method, elapsed);
                super.onComplete();
            }
        };
    }
}
```

### 4. 성능 최적화

- **연결 풀링**: gRPC는 HTTP/2 멀티플렉싱을 사용하므로 단일 연결로 여러 요청을 동시에 처리할 수 있다. 별도의 커넥션 풀이 필요 없다.
- **메시지 크기 제한**: 기본 최대 메시지 크기는 4MB다. 큰 데이터는 스트리밍으로 분할 전송하자.
- **Keep-Alive**: 장시간 유휴 연결이 끊기는 것을 방지한다.

```yaml
grpc:
  server:
    max-inbound-message-size: 10485760  # 10MB
    keep-alive-time: 30s
    keep-alive-timeout: 5s
```

---

## 언제 gRPC를 쓸까

### gRPC가 적합한 경우

- 마이크로서비스 간 내부 통신 (특히 [Kubernetes 환경](/infra/2026/04/01/kubernetes-basics/)에서)
- 실시간 양방향 통신이 필요한 서비스
- 스키마 관리와 타입 안정성이 중요한 경우
- 다양한 언어의 서비스가 혼합된 환경 (polyglot)

### REST가 여전히 나은 경우

- 브라우저에서 직접 호출하는 공개 API
- 간단한 CRUD 서비스
- curl이나 Postman 같은 도구로 빠르게 테스트해야 할 때

실무에서는 **외부 API Gateway는 REST**, **내부 서비스 메시는 gRPC**로 구성하는 하이브리드 패턴이 가장 많이 사용된다. API Gateway 설계에 대해서는 [API Rate Limiting](/system-design/2026/04/01/api-rate-limiting/) 포스트도 참고하자.

---

## 마무리

gRPC는 높은 성능과 강력한 타입 시스템을 갖춘 현대적 RPC 프레임워크다. 이번 포스트에서 다룬 내용을 정리하면:

1. **Protocol Buffers** — 바이너리 직렬화로 JSON 대비 빠르고 작은 페이로드
2. **HTTP/2 기반** — 멀티플렉싱, 헤더 압축으로 네트워크 효율 극대화
3. **4가지 통신 패턴** — Unary, Server/Client/Bidirectional Streaming
4. **Spring Boot 연동** — `grpc-spring-boot-starter`로 간편한 설정

[Kafka](/backend/2026/04/03/kafka-introduction/)와 gRPC를 조합하면, Kafka는 비동기 이벤트 기반 통신을, gRPC는 동기 서비스 간 호출을 담당하는 견고한 마이크로서비스 통신 아키텍처를 구성할 수 있다.

---

## 관련 포스트

- [Kubernetes 핵심 개념 — Pod부터 Deployment까지](/infra/2026/04/01/kubernetes-basics/)
- [Apache Kafka 입문부터 실전까지](/backend/2026/04/03/kafka-introduction/)
- [API Rate Limiting — 설계와 구현 전략](/system-design/2026/04/01/api-rate-limiting/)
- [MSA 핵심 패턴 — Circuit Breaker, API Gateway, Saga](/system-design/2026/04/03/msa-patterns/)
- [Docker 입문](/infra/2026/03/20/docker-getting-started/)
