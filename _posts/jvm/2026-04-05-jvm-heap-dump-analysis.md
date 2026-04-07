---
layout: post
title: "JVM 힙 덤프 분석으로 메모리 누수 잡기 — OOM 디버깅 실전 가이드"
subtitle: "jmap, Eclipse MAT, VisualVM으로 메모리 누수 원인 추적하기"
date: "2026-04-05"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "jvm, heap dump, oom, memory leak, eclipse mat, visualvm"
series: "JVM 완전 정복"
tags:
  - JVM
  - Java
  - Backend
  - OOM
categories:
  - jvm
description: "jmap과 HeapDumpOnOutOfMemoryError로 힙 덤프를 생성하고, Eclipse MAT과 VisualVM으로 메모리 누수 원인을 분석하는 실전 가이드."
---

## OOM, 언제 만나게 될까

운영 중인 서버에서 `java.lang.OutOfMemoryError: Java heap space`가 발생하면 당황하기 마련이다. [GC 튜닝](/jvm/2026/04/04/jvm-gc-tuning/)으로 버틸 수 있는 한계를 넘어선 상황이기 때문이다. 이때 필요한 것이 **힙 덤프 분석**이다.

힙 덤프는 특정 시점의 Heap 메모리 스냅샷으로, 어떤 객체가 메모리를 얼마나 차지하고 있는지 확인할 수 있다. 이번 포스트에서는 힙 덤프 생성부터 분석, 메모리 누수 원인 추적까지 실전 과정을 다룬다.

> 이 포스트는 **JVM 완전 정복** 시리즈의 세 번째 글입니다.
> 이전 편: [GC 종류와 튜닝 전략](/jvm/2026/04/04/jvm-gc-tuning/)

---

## 힙 덤프 생성 방법

### 방법 1: OOM 발생 시 자동 생성 (권장)

운영 환경에서는 OOM이 발생하는 순간의 메모리 상태가 가장 중요하다. JVM 옵션으로 자동 생성을 설정해 두자.

```bash
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/var/log/heapdump/ \
     -jar myapp.jar
```

| 옵션 | 설명 |
|------|------|
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 발생 시 힙 덤프 자동 생성 |
| `-XX:HeapDumpPath` | 덤프 파일 저장 경로 (디렉터리 또는 파일명) |

> **운영 서버에는 반드시 이 옵션을 설정**해 두자. 설정하지 않으면 OOM 발생 후 재현이 어려워 원인 분석이 불가능해진다.

### 방법 2: jmap으로 수동 생성

실행 중인 프로세스에서 즉시 덤프를 생성할 때 사용한다.

```bash
# PID 확인
jps -l

# 힙 덤프 생성
jmap -dump:format=b,file=heapdump.hprof <PID>

# live 옵션: GC 수행 후 살아 있는 객체만 덤프
jmap -dump:live,format=b,file=heapdump_live.hprof <PID>
```

**주의**: `jmap`은 대상 프로세스를 일시 정지시킨다. Heap이 클수록 오래 걸리므로, 운영 서버에서는 트래픽이 적은 시간에 실행하거나 **로드밸런서에서 제외 후** 수행하는 것이 안전하다.

### 방법 3: jcmd (Java 9+)

`jcmd`는 `jmap`보다 안전하고 다양한 진단 명령을 제공한다.

```bash
jcmd <PID> GC.heap_dump /tmp/heapdump.hprof
```

---

## 분석 도구 활용

### Eclipse MAT (Memory Analyzer Tool)

가장 강력한 힙 덤프 분석 도구이다. 대용량 덤프(수 GB)도 효율적으로 처리한다.

**핵심 기능:**

1. **Leak Suspects Report**: 열자마자 자동으로 메모리 누수 의심 지점을 보여준다.
2. **Dominator Tree**: 메모리를 가장 많이 점유한 객체를 트리 형태로 표시한다.
3. **Histogram**: 클래스별 인스턴스 수와 메모리 사용량을 확인한다.
4. **OQL (Object Query Language)**: SQL과 유사한 쿼리로 객체를 검색한다.

```sql
-- 크기가 1MB 이상인 byte[] 찾기
SELECT * FROM byte[] b WHERE b.@retainedHeapSize > 1048576

-- 특정 클래스의 인스턴스 확인
SELECT toString(s) FROM java.lang.String s
    WHERE s.@retainedHeapSize > 10240
```

**분석 순서:**

```
힙 덤프 열기
  → Leak Suspects 확인
  → Dominator Tree에서 큰 객체 탐색
  → 해당 객체의 GC Root까지의 경로 확인
  → 코드에서 원인 파악
```

### VisualVM

JDK에 내장된(또는 별도 다운로드) 경량 분석 도구이다. 실시간 모니터링과 덤프 분석을 모두 지원한다.

**주요 활용:**

- **Monitor 탭**: Heap 사용량, 스레드 수, CPU 실시간 모니터링
- **Sampler/Profiler**: 메모리 할당 핫스팟 확인
- **힙 덤프 비교**: 두 시점의 덤프를 비교하여 증가한 객체 확인

```bash
# VisualVM 실행 (JDK 8 내장)
jvisualvm

# JDK 9+는 별도 다운로드 후
visualvm --jdkhome /path/to/jdk
```

**분석 팁**: MAT은 깊이 있는 분석에, VisualVM은 실시간 모니터링과 간단한 점검에 적합하다. 두 도구를 병행하는 것이 효과적이다.

---

## OOM 원인 찾기 실전

### 흔한 메모리 누수 패턴

| 패턴 | 설명 | 확인 방법 |
|------|------|-----------|
| **컬렉션 무한 증가** | Map/List에 데이터를 계속 추가하고 제거하지 않음 | Histogram에서 특정 컬렉션 크기 확인 |
| **리스너 미해제** | 이벤트 리스너를 등록하고 해제하지 않음 | GC Root 경로에서 리스너 체인 확인 |
| **캐시 만료 없음** | 캐시에 데이터를 넣고 TTL 없이 방치 | Dominator Tree에서 캐시 객체 크기 확인 |
| **스트림/커넥션 미종료** | I/O 자원을 close하지 않음 | Histogram에서 스트림 인스턴스 수 확인 |
| **static 컬렉션** | static 필드의 컬렉션이 계속 커짐 | GC Root가 Class인 경로 확인 |

### Dominator Tree 읽는 법

```
[1.2GB] java.util.HashMap
  └── [1.1GB] java.util.HashMap$Node[]
       └── [800MB] com.example.UserSession (x50,000)
            └── [600MB] byte[] (x50,000)
```

위 트리는 `HashMap`이 1.2GB를 차지하며, 내부에 5만 개의 `UserSession` 객체가 있고, 각 세션이 큰 `byte[]`를 보유하고 있음을 보여준다. **세션 만료 처리가 되지 않아** 메모리가 누적된 전형적인 패턴이다.

---

## 메모리 누수 재현 코드

아래 코드는 의도적으로 메모리 누수를 발생시키는 예제이다. 힙 덤프 분석을 연습하기에 적합하다.

```java
import java.util.*;

public class MemoryLeakDemo {

    // static Map은 GC 대상이 되지 않는다
    private static final Map<String, byte[]> cache = new HashMap<>();

    public static void main(String[] args) {
        System.out.println("메모리 누수 데모 시작...");
        System.out.println("JVM 옵션 예시:");
        System.out.println("  java -Xmx128m \\");
        System.out.println("       -XX:+HeapDumpOnOutOfMemoryError \\");
        System.out.println("       -XX:HeapDumpPath=./heapdump.hprof \\");
        System.out.println("       MemoryLeakDemo");

        int count = 0;
        try {
            while (true) {
                // 키가 매번 다르므로 기존 엔트리가 교체되지 않고 계속 쌓인다
                String key = "session-" + count;
                byte[] data = new byte[1024 * 100]; // 100KB
                cache.put(key, data);
                count++;

                if (count % 100 == 0) {
                    long used = Runtime.getRuntime().totalMemory()
                              - Runtime.getRuntime().freeMemory();
                    System.out.printf("캐시 항목: %d개, 메모리 사용: %dMB%n",
                        count, used / (1024 * 1024));
                }
            }
        } catch (OutOfMemoryError e) {
            System.out.printf("OOM 발생! 캐시 항목 %d개에서 메모리 소진%n", count);
            throw e;
        }
    }
}
```

실행 후 생성된 `heapdump.hprof`를 MAT으로 열면:

1. **Leak Suspects**: `MemoryLeakDemo` 클래스의 `cache` 필드가 지목된다.
2. **Dominator Tree**: `HashMap` → `Node[]` → `byte[]` 체인이 메모리 대부분을 차지한다.
3. **해결**: TTL이 있는 캐시로 교체하거나, 최대 크기를 제한한다.

### 수정된 코드 (해결 예시)

```java
import java.util.*;

public class MemoryLeakFixed {

    private static final int MAX_CACHE_SIZE = 500;

    // LinkedHashMap으로 LRU 캐시 구현
    private static final Map<String, byte[]> cache =
        new LinkedHashMap<>(MAX_CACHE_SIZE, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, byte[]> eldest) {
                return size() > MAX_CACHE_SIZE;
            }
        };

    public static void main(String[] args) throws InterruptedException {
        System.out.println("LRU 캐시로 메모리 누수 방지");

        for (int i = 0; i < 5000; i++) {
            cache.put("session-" + i, new byte[1024 * 100]);

            if (i % 500 == 0) {
                long used = Runtime.getRuntime().totalMemory()
                          - Runtime.getRuntime().freeMemory();
                System.out.printf("반복: %d, 캐시 크기: %d, 메모리: %dMB%n",
                    i, cache.size(), used / (1024 * 1024));
            }
        }
        System.out.println("완료! 캐시 크기: " + cache.size());
    }
}
```

---

## 실전 디버깅 체크리스트

OOM이 발생했을 때 다음 순서로 대응하자.

1. **힙 덤프 확보**: `-XX:+HeapDumpOnOutOfMemoryError`가 설정되어 있는지 확인
2. **MAT으로 Leak Suspects 확인**: 자동 분석 결과부터 살펴본다
3. **Dominator Tree 분석**: 가장 큰 객체의 GC Root 경로를 추적한다
4. **코드 확인**: 해당 객체를 참조하는 코드에서 해제 로직 점검
5. **재배포 후 모니터링**: [GC 로그](/jvm/2026/04/04/jvm-gc-tuning/)를 통해 개선 여부 확인

```bash
# 운영 서버 JVM 권장 옵션 (종합)
java -Xms4g -Xmx4g \
     -XX:+UseG1GC \
     -XX:MaxGCPauseMillis=200 \
     -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/var/log/heapdump/ \
     -Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags \
     -jar myapp.jar
```

---

## 마무리

힙 덤프 분석은 OOM 문제 해결의 핵심 기술이다. **운영 서버에는 반드시 `HeapDumpOnOutOfMemoryError` 옵션을 설정**하고, MAT과 같은 도구로 분석하는 연습을 해 두자.

이 시리즈에서 다룬 [JVM 아키텍처](/jvm/2026/04/03/jvm-architecture-classloading/), [GC 튜닝](/jvm/2026/04/04/jvm-gc-tuning/), 힙 덤프 분석을 종합하면 대부분의 JVM 메모리 문제에 대응할 수 있다. Spring Boot 애플리케이션에서 OOM이 빈번하다면 [JPA N+1 문제](/spring/2026/04/04/jpa-n-plus-one-problem/)로 인한 대량 객체 생성이 원인일 수 있으니 함께 점검해 보자. 또한 [Redis 캐싱 전략](/backend/2026/04/02/redis-caching-strategy/)을 도입하면 DB 조회를 줄여 Heap 사용량 자체를 낮출 수 있다.

---

**JVM 완전 정복 시리즈**
1. [JVM 아키텍처와 클래스 로딩](/jvm/2026/04/03/jvm-architecture-classloading/)
2. [GC 종류와 튜닝 전략](/jvm/2026/04/04/jvm-gc-tuning/)
3. **JVM 힙 덤프 분석** ← 현재 글
