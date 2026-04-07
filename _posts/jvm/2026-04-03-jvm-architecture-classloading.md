---
layout: post
title: "JVM 아키텍처와 클래스 로딩 완벽 가이드"
subtitle: "Class Loader, Runtime Data Areas, Execution Engine의 구조와 동작 원리"
date: "2026-04-03"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "jvm, classloader, runtime data areas, execution engine, java"
series: "JVM 완전 정복"
tags:
  - JVM
  - Java
  - Backend
categories:
  - jvm
description: "JVM 아키텍처의 3대 구성 요소와 클래스 로딩 과정을 실전 예제와 함께 정리합니다. 커스텀 ClassLoader 구현까지 다루는 백엔드 개발자 필수 가이드."
---

## JVM, 왜 알아야 할까

Java 코드를 작성하면 컴파일러가 `.class` 바이트코드를 생성하고, JVM이 이를 실행한다. 이 과정을 이해하면 **성능 문제 진단**, **메모리 최적화**, **클래스 충돌 디버깅**이 한결 수월해진다. 이번 포스트에서는 JVM의 전체 아키텍처를 조감하고, 클래스 로딩의 세부 과정을 코드와 함께 살펴본다.

> 이 포스트는 **JVM 완전 정복** 시리즈의 첫 번째 글입니다.
> 다음 편: [GC 종류와 튜닝 전략](/jvm/2026/04/04/jvm-gc-tuning/)

---

## JVM 아키텍처 3대 구성 요소

JVM은 크게 세 가지 영역으로 나뉜다.

```
┌─────────────────────────────────────────────┐
│                   JVM                       │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Class Loader │→│  Runtime Data Areas   │  │
│  │   Subsystem  │  │                      │  │
│  └─────────────┘  │  ┌──────┐ ┌───────┐  │  │
│                    │  │Method│ │ Heap  │  │  │
│                    │  │ Area │ │       │  │  │
│                    │  └──────┘ └───────┘  │  │
│                    │  ┌──────┐ ┌───────┐  │  │
│                    │  │Stack │ │  PC   │  │  │
│                    │  │      │ │Register│ │  │
│                    │  └──────┘ └───────┘  │  │
│                    └──────────────────────┘  │
│  ┌─────────────────────────────────────┐    │
│  │       Execution Engine              │    │
│  │  Interpreter │ JIT Compiler │ GC    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 1. Class Loader Subsystem

`.class` 파일을 찾아서 메모리에 로드하는 역할을 한다. 아래에서 자세히 다룬다.

### 2. Runtime Data Areas

JVM이 프로그램을 실행하면서 사용하는 메모리 영역이다.

| 영역 | 공유 범위 | 저장 내용 |
|------|-----------|-----------|
| **Method Area** | 모든 스레드 공유 | 클래스 메타데이터, static 변수, 상수 풀 |
| **Heap** | 모든 스레드 공유 | 객체 인스턴스, 배열 |
| **Stack** | 스레드별 독립 | 지역 변수, 메서드 호출 프레임 |
| **PC Register** | 스레드별 독립 | 현재 실행 중인 명령어 주소 |
| **Native Method Stack** | 스레드별 독립 | JNI로 호출된 네이티브 메서드 정보 |

Heap 영역이 바로 [GC 튜닝](/jvm/2026/04/04/jvm-gc-tuning/)과 [힙 덤프 분석](/jvm/2026/04/05/jvm-heap-dump-analysis/)의 핵심 대상이다.

### 3. Execution Engine

바이트코드를 실제로 실행하는 엔진이다.

- **Interpreter**: 바이트코드를 한 줄씩 해석·실행한다. 초기 구동이 빠르지만 반복 실행에 비효율적이다.
- **JIT Compiler**: 자주 실행되는 코드(Hot Spot)를 네이티브 코드로 변환해 성능을 높인다.
- **Garbage Collector**: Heap의 미사용 객체를 자동으로 정리한다.

---

## 클래스 로딩 3단계

클래스 로딩은 **Loading → Linking → Initialization** 순서로 진행된다.

### Loading

`.class` 파일을 찾아 바이트코드를 읽어들이고, `java.lang.Class` 객체를 생성한다. 이때 ClassLoader의 **위임 모델(Delegation Model)**이 작동한다.

### Linking

세 가지 하위 단계로 나뉜다.

1. **Verification**: 바이트코드가 JVM 명세에 맞는지 검증한다.
2. **Preparation**: static 변수에 메모리를 할당하고 기본값으로 초기화한다.
3. **Resolution**: 심볼릭 레퍼런스를 실제 메모리 주소로 변환한다.

### Initialization

static 블록을 실행하고 static 변수에 프로그래머가 지정한 값을 대입한다.

```java
public class LoadingExample {
    // Preparation 단계: value = 0 (기본값)
    // Initialization 단계: value = 42
    static int value = 42;

    static {
        System.out.println("클래스가 초기화되었습니다. value = " + value);
    }
}
```

---

## ClassLoader 계층 구조

JVM은 세 가지 ClassLoader를 계층적으로 운용한다.

```
Bootstrap ClassLoader      ← java.lang.*, java.util.* 등 핵심 클래스
       ↑
Platform(Extension) ClassLoader  ← javax.*, java.sql.* 등 확장 클래스
       ↑
Application ClassLoader    ← classpath에 있는 애플리케이션 클래스
       ↑
Custom ClassLoader         ← 개발자가 직접 구현
```

**위임 모델**: 하위 ClassLoader가 클래스 로딩을 요청받으면, 먼저 상위 ClassLoader에 위임한다. 상위에서 찾지 못하면 자기가 직접 로드한다. 이 구조 덕분에 핵심 클래스가 다른 버전으로 대체되는 것을 방지할 수 있다.

```java
public class ClassLoaderHierarchy {
    public static void main(String[] args) {
        // Application ClassLoader
        ClassLoader appLoader = ClassLoaderHierarchy.class.getClassLoader();
        System.out.println("App ClassLoader: " + appLoader);

        // Platform(Extension) ClassLoader
        ClassLoader platformLoader = appLoader.getParent();
        System.out.println("Platform ClassLoader: " + platformLoader);

        // Bootstrap ClassLoader (네이티브 구현이므로 null 반환)
        ClassLoader bootstrapLoader = platformLoader.getParent();
        System.out.println("Bootstrap ClassLoader: " + bootstrapLoader);
    }
}
```

출력 예시:

```
App ClassLoader: jdk.internal.loader.ClassLoaders$AppClassLoader@...
Platform ClassLoader: jdk.internal.loader.ClassLoaders$PlatformClassLoader@...
Bootstrap ClassLoader: null
```

---

## 실전: 커스텀 ClassLoader 구현

외부 경로에서 `.class` 파일을 직접 로드하는 커스텀 ClassLoader를 만들어보자. 플러그인 시스템이나 핫 리로드 기능을 구현할 때 이 패턴이 활용된다.

```java
import java.io.*;
import java.nio.file.*;

public class PluginClassLoader extends ClassLoader {

    private final Path pluginDir;

    public PluginClassLoader(Path pluginDir, ClassLoader parent) {
        super(parent);
        this.pluginDir = pluginDir;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        // com.example.MyPlugin → com/example/MyPlugin.class
        String fileName = name.replace('.', File.separatorChar) + ".class";
        Path classFile = pluginDir.resolve(fileName);

        if (!Files.exists(classFile)) {
            throw new ClassNotFoundException("클래스를 찾을 수 없습니다: " + name);
        }

        try {
            byte[] bytes = Files.readAllBytes(classFile);
            return defineClass(name, bytes, 0, bytes.length);
        } catch (IOException e) {
            throw new ClassNotFoundException("클래스 로드 실패: " + name, e);
        }
    }

    public static void main(String[] args) throws Exception {
        Path pluginPath = Paths.get("/opt/app/plugins");
        PluginClassLoader loader = new PluginClassLoader(pluginPath,
            ClassLoader.getSystemClassLoader());

        Class<?> pluginClass = loader.loadClass("com.example.MyPlugin");
        Object plugin = pluginClass.getDeclaredConstructor().newInstance();
        System.out.println("플러그인 로드 성공: " + plugin.getClass().getName());
        System.out.println("사용된 ClassLoader: " + plugin.getClass().getClassLoader());
    }
}
```

---

## 실전 디버깅 팁

### ClassNotFoundException vs NoClassDefFoundError

| 구분 | ClassNotFoundException | NoClassDefFoundError |
|------|----------------------|---------------------|
| 발생 시점 | 런타임에 동적 로드 시 | 컴파일은 됐으나 런타임에 클래스 없을 때 |
| 원인 | `Class.forName()`, `ClassLoader.loadClass()` 실패 | classpath에서 `.class` 파일 누락 |
| 해결 | 의존성 확인, classpath 점검 | 빌드 설정 및 패키징 점검 |

### 클래스 로딩 과정 확인

JVM 옵션으로 어떤 클래스가 언제 로드되는지 추적할 수 있다.

```bash
# Java 9+
java -verbose:class -jar myapp.jar

# 특정 클래스만 확인
java -Xlog:class+load=info -jar myapp.jar
```

---

## 마무리

JVM은 **Class Loader → Runtime Data Areas → Execution Engine**의 구조로 바이트코드를 실행한다. 클래스 로딩은 **위임 모델**을 통해 안전하게 이루어지며, 필요에 따라 커스텀 ClassLoader로 확장할 수 있다.

다음 포스트에서는 Runtime Data Areas 중 Heap 영역을 관리하는 핵심 메커니즘인 [Garbage Collection과 튜닝 전략](/jvm/2026/04/04/jvm-gc-tuning/)을 다룬다.

---

**JVM 완전 정복 시리즈**
1. **JVM 아키텍처와 클래스 로딩** ← 현재 글
2. [GC 종류와 튜닝 전략](/jvm/2026/04/04/jvm-gc-tuning/)
3. [JVM 힙 덤프 분석](/jvm/2026/04/05/jvm-heap-dump-analysis/)
