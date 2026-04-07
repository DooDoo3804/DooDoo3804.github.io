---
layout: post
title: "GC 종류와 튜닝 전략 — 실전에서 바로 쓰는 JVM 가비지 컬렉션 가이드"
subtitle: "Serial부터 ZGC까지 비교하고 운영 환경 JVM 튜닝 옵션 정리"
date: "2026-04-04"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "jvm, garbage collection, gc tuning, zgc, g1gc, java"
series: "JVM 완전 정복"
tags:
  - JVM
  - Java
  - Backend
  - GC
categories:
  - jvm
description: "Serial부터 ZGC까지 GC 종류를 비교하고, GC 로그 분석법과 실전 JVM 튜닝 옵션을 정리합니다. 운영 환경에서 바로 적용할 수 있는 가이드."
---

## GC, 왜 직접 알아야 할까

Java는 개발자가 메모리를 직접 해제하지 않아도 된다. 하지만 **GC가 언제, 어떻게 동작하는지** 이해하지 못하면 운영 환경에서 갑작스러운 지연(Stop-the-World)이나 OOM을 만나게 된다. 이번 포스트에서는 GC의 종류를 비교하고, 실전 튜닝 옵션을 정리한다.

> 이 포스트는 **JVM 완전 정복** 시리즈의 두 번째 글입니다.
> 이전 편: [JVM 아키텍처와 클래스 로딩](/jvm/2026/04/03/jvm-architecture-classloading/)

---

## GC 기본 동작 원리

[이전 포스트](/jvm/2026/04/03/jvm-architecture-classloading/)에서 다룬 **Heap 영역**은 보통 두 세대로 나뉜다.

```
┌──────────────────────────────────────────┐
│                  Heap                    │
│  ┌────────────────┐  ┌────────────────┐  │
│  │  Young Gen     │  │   Old Gen      │  │
│  │ ┌────┐┌─────┐  │  │                │  │
│  │ │Eden││S0│S1│  │  │                │  │
│  │ └────┘└─────┘  │  │                │  │
│  └────────────────┘  └────────────────┘  │
└──────────────────────────────────────────┘
```

- **Young Generation**: 새로 생성된 객체가 할당된다. Minor GC가 여기서 발생한다.
- **Old Generation**: Young Gen에서 일정 횟수 이상 살아남은 객체가 이동한다. Major(Full) GC의 대상이다.

GC는 **Mark → Sweep → Compact** 과정을 거치며, 이 과정에서 애플리케이션 스레드가 일시 정지하는 **Stop-the-World(STW)**가 발생한다.

---

## GC 종류 비교

### 한눈에 보는 비교표

| GC | STW 시간 | 처리량 | 적합한 환경 | JVM 옵션 |
|----|----------|--------|-------------|----------|
| **Serial GC** | 길다 | 낮음 | 클라이언트 앱, 소규모 Heap | `-XX:+UseSerialGC` |
| **Parallel GC** | 중간 | 높음 | 배치 처리, 처리량 중시 | `-XX:+UseParallelGC` |
| **G1GC** | 짧다 | 높음 | 범용 서버 (Java 9+ 기본) | `-XX:+UseG1GC` |
| **ZGC** | 매우 짧다 (< 1ms) | 높음 | 대용량 Heap, 초저지연 | `-XX:+UseZGC` |

### Serial GC

싱글 스레드로 GC를 수행한다. 구현이 단순하고 오버헤드가 적어서 Heap이 작은 환경에 적합하다. 운영 서버에서는 거의 사용하지 않는다.

### Parallel GC

Serial GC의 멀티스레드 버전이다. Java 8까지 기본 GC였으며, **처리량(throughput)**을 최대화하는 데 초점을 둔다. 배치 작업처럼 응답 시간보다 전체 처리량이 중요한 경우에 유용하다.

### G1GC (Garbage First)

Heap을 **Region** 단위로 나누어 관리한다. 가비지가 많은 Region부터 우선 수거해서 이름이 "Garbage First"이다. Java 9부터 기본 GC이며, **대부분의 서버 애플리케이션에 권장**된다.

```
┌───┬───┬───┬───┬───┬───┬───┬───┐
│ E │ E │ S │   │ O │ O │ O │ H │
├───┼───┼───┼───┼───┼───┼───┼───┤
│ E │   │   │ O │ O │   │ E │   │
└───┴───┴───┴───┴───┴───┴───┴───┘
E=Eden  S=Survivor  O=Old  H=Humongous
```

핵심 특징:
- Region 기반으로 Young/Old 구분이 유동적이다.
- `-XX:MaxGCPauseMillis` 옵션으로 **목표 STW 시간**을 설정할 수 있다.
- 대용량 객체(Humongous Object)를 별도 Region에 할당한다.

### ZGC

Java 15+에서 정식 지원되는 초저지연 GC이다. Heap 크기와 무관하게 STW를 **1ms 이하**로 유지한다. 수 TB 규모의 Heap에서도 안정적으로 작동한다.

핵심 특징:
- **Colored Pointer**와 **Load Barrier**로 대부분의 작업을 동시(Concurrent) 처리한다.
- 별도의 세대 구분 없이 동작한다 (Generational ZGC는 Java 21+에서 도입).

---

## GC 로그 분석법

### GC 로그 활성화

```bash
# Java 9+ (Unified Logging)
java -Xlog:gc*:file=gc.log:time,uptime,level,tags \
     -jar myapp.jar

# 더 상세한 로그
java -Xlog:gc*,gc+heap=debug,gc+phases=debug:file=gc.log:time,uptime,level,tags \
     -jar myapp.jar
```

### GC 로그 읽기

```
[2026-04-04T09:15:32.123+0900][0.456s] GC(3) Pause Young (Normal)
    (G1 Evacuation Pause) 256M->128M(512M) 12.345ms
```

| 항목 | 의미 |
|------|------|
| `GC(3)` | 3번째 GC 이벤트 |
| `Pause Young` | Young Generation GC |
| `256M->128M` | GC 전 256MB → GC 후 128MB |
| `(512M)` | 현재 Heap 크기 |
| `12.345ms` | STW 시간 |

**팁**: 로그를 직접 읽기 어렵다면 [GCEasy](https://gceasy.io)나 [GCViewer](https://github.com/chewiebug/GCViewer) 같은 도구를 활용하면 시각적으로 분석할 수 있다.

---

## 실전 JVM 튜닝 옵션

### 기본 Heap 설정

```bash
java -Xms2g -Xmx2g -jar myapp.jar
```

| 옵션 | 설명 | 권장 |
|------|------|------|
| `-Xms` | 초기 Heap 크기 | `-Xmx`와 동일하게 설정 |
| `-Xmx` | 최대 Heap 크기 | 가용 메모리의 50~75% |
| `-XX:NewRatio` | Old/Young 비율 | G1GC 사용 시 JVM에 위임 |

> `-Xms`와 `-Xmx`를 동일하게 설정하면 런타임에 Heap 크기를 조정하는 오버헤드를 줄일 수 있다.

### G1GC 튜닝

```bash
java -XX:+UseG1GC \
     -XX:MaxGCPauseMillis=200 \
     -XX:G1HeapRegionSize=8m \
     -XX:InitiatingHeapOccupancyPercent=45 \
     -Xms4g -Xmx4g \
     -jar myapp.jar
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `MaxGCPauseMillis` | 목표 STW 시간(ms) | 200 |
| `G1HeapRegionSize` | Region 크기 (1~32MB) | 자동 |
| `InitiatingHeapOccupancyPercent` | Old Gen 사용률이 이 값을 넘으면 Mixed GC 시작 | 45 |

### ZGC 튜닝

```bash
java -XX:+UseZGC \
     -XX:SoftMaxHeapSize=4g \
     -Xms8g -Xmx8g \
     -jar myapp.jar
```

ZGC는 설정이 간단한 것이 장점이다. 대부분의 경우 Heap 크기만 적절히 잡으면 된다.

---

## 실전 GC 로그 모니터링 코드

운영 환경에서 GC 이벤트를 프로그래밍 방식으로 모니터링하는 예제이다.

```java
import java.lang.management.*;
import javax.management.NotificationEmitter;
import javax.management.NotificationListener;

public class GcMonitor {

    public static void main(String[] args) throws InterruptedException {
        // GC 알림 리스너 등록
        for (GarbageCollectorMXBean gcBean :
                ManagementFactory.getGarbageCollectorMXBeans()) {

            NotificationEmitter emitter = (NotificationEmitter) gcBean;
            NotificationListener listener = (notification, handback) -> {
                System.out.printf("[GC 발생] %s - 총 횟수: %d, 총 시간: %dms%n",
                    gcBean.getName(),
                    gcBean.getCollectionCount(),
                    gcBean.getCollectionTime());
            };
            emitter.addNotificationListener(listener, null, null);
        }

        System.out.println("GC 모니터링 시작...");
        System.out.println("사용 중인 GC:");
        ManagementFactory.getGarbageCollectorMXBeans()
            .forEach(gc -> System.out.println("  - " + gc.getName()));

        // 메모리 압박을 유발하여 GC 트리거
        for (int i = 0; i < 100; i++) {
            byte[] chunk = new byte[1024 * 1024]; // 1MB
            Thread.sleep(50);
        }
    }
}
```

실행 결과 예시:

```
GC 모니터링 시작...
사용 중인 GC:
  - G1 Young Generation
  - G1 Old Generation
[GC 발생] G1 Young Generation - 총 횟수: 1, 총 시간: 5ms
[GC 발생] G1 Young Generation - 총 횟수: 2, 총 시간: 9ms
```

---

## 어떤 GC를 선택해야 할까

실전에서의 선택 가이드:

- **Java 8 이하 + 처리량 중시** → Parallel GC
- **Java 9+ 범용 서버** → G1GC (기본값이므로 별도 설정 불필요)
- **대용량 Heap + 초저지연 필수** → ZGC
- **컨테이너 환경 (Heap ≤ 512MB)** → Serial GC도 고려

GC를 변경한 후에는 반드시 **GC 로그를 분석**하고, 실제 워크로드로 성능 테스트를 수행해야 한다.

---

## 마무리

GC 튜닝의 핵심은 **"측정 먼저, 최적화는 나중에"**이다. GC 로그를 켜고, 현재 상태를 파악한 다음, 목표에 맞는 옵션을 조정하자. 대부분의 경우 G1GC 기본 설정과 적절한 Heap 크기 설정만으로 충분하다.

GC가 아무리 잘 동작해도 메모리 누수가 있으면 결국 OOM이 발생한다. 다음 포스트에서는 [JVM 힙 덤프 분석](/jvm/2026/04/05/jvm-heap-dump-analysis/)을 통해 메모리 누수를 찾아내는 방법을 다룬다.

---

**JVM 완전 정복 시리즈**
1. [JVM 아키텍처와 클래스 로딩](/jvm/2026/04/03/jvm-architecture-classloading/)
2. **GC 종류와 튜닝 전략** ← 현재 글
3. [JVM 힙 덤프 분석](/jvm/2026/04/05/jvm-heap-dump-analysis/)
