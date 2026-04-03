---
title: "Kotlin Coroutines 실전 가이드"
subtitle: "suspend, launch, async부터 Flow와 예외 처리까지"
layout: post
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "kotlin, coroutines, async, concurrency"
description: "Kotlin Coroutines 핵심 개념과 실전 패턴을 코드 예제로 정리합니다."
series: "Kotlin 마스터"
tags:
  - Kotlin
  - Coroutines
  - Async
  - Concurrency
categories:
  - kotlin
---

Kotlin의 코루틴은 비동기 프로그래밍을 **동기 코드처럼** 작성할 수 있게 해주는 경량 동시성 프레임워크다. 이 글에서는 기본 개념부터 실전 패턴까지 정리한다.

<br>

## 1. Coroutine 기본 개념

### 1.1 suspend 함수

`suspend` 키워드는 함수가 **일시 중단(suspend)** 될 수 있음을 표시한다. suspend 함수는 코루틴 내부 또는 다른 suspend 함수에서만 호출할 수 있다.

```kotlin
suspend fun fetchUserData(userId: String): User {
    // 네트워크 호출 — 스레드를 블로킹하지 않고 일시 중단
    return apiService.getUser(userId)
}
```

일반 함수와의 차이:
- 일반 함수: 호출하면 완료될 때까지 스레드를 점유
- suspend 함수: 중간에 실행을 양보(suspend)하고, 나중에 재개(resume)할 수 있음

### 1.2 launch — Fire and Forget

`launch`는 결과를 반환하지 않는 코루틴을 시작한다. 반환 타입은 `Job`이다.

```kotlin
fun main() = runBlocking {
    val job: Job = launch {
        delay(1000L)
        println("World!")
    }
    println("Hello,")
    job.join() // 코루틴 완료 대기
}
// 출력:
// Hello,
// World!
```

### 1.3 async/await — 결과 반환

`async`는 결과를 반환하는 코루틴을 시작한다. 반환 타입은 `Deferred<T>`이며, `await()`로 결과를 받는다.

```kotlin
fun main() = runBlocking {
    val deferred: Deferred<Int> = async {
        delay(1000L)
        42
    }
    println("계산 결과: ${deferred.await()}")
}
```

| 빌더 | 반환 타입 | 용도 |
|------|-----------|------|
| `launch` | `Job` | 결과가 필요 없는 비동기 작업 |
| `async` | `Deferred<T>` | 결과를 반환하는 비동기 작업 |
| `runBlocking` | `T` | 메인 함수/테스트에서 코루틴 진입점 |

<br>

## 2. CoroutineScope, CoroutineContext, Dispatcher

### 2.1 CoroutineScope

모든 코루틴은 **CoroutineScope** 안에서 실행된다. Scope는 코루틴의 생명주기를 관리한다.

```kotlin
class UserRepository {
    // 자체 스코프 — 필요 시 전체 취소 가능
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun fetchUsers() {
        scope.launch {
            val users = apiService.getUsers()
            // ...
        }
    }

    fun clear() {
        scope.cancel() // 소속 코루틴 전체 취소
    }
}
```

Android에서는 `viewModelScope`, `lifecycleScope` 등 미리 정의된 스코프를 활용한다.

### 2.2 CoroutineContext

CoroutineContext는 코루틴의 실행 환경을 정의하는 **불변 요소 집합**이다.

주요 요소:
- **Job**: 코루틴의 생명주기 관리
- **Dispatcher**: 어떤 스레드에서 실행할지
- **CoroutineName**: 디버깅용 이름
- **CoroutineExceptionHandler**: 예외 처리기

```kotlin
val context = Dispatchers.IO + CoroutineName("data-loader") + exceptionHandler
launch(context) {
    // IO 디스패처에서 "data-loader"라는 이름으로 실행
}
```

### 2.3 Dispatcher 종류

| Dispatcher | 스레드 풀 | 용도 |
|------------|-----------|------|
| `Dispatchers.Main` | 메인(UI) 스레드 | UI 업데이트, 가벼운 작업 |
| `Dispatchers.IO` | 공유 스레드 풀 (64개) | 네트워크, DB, 파일 I/O |
| `Dispatchers.Default` | CPU 코어 수만큼 | CPU 집약적 연산 (정렬, JSON 파싱) |
| `Dispatchers.Unconfined` | 호출 스레드 → 재개 스레드 | 특수 케이스, 테스트 |

```kotlin
launch(Dispatchers.IO) {
    val data = fetchFromNetwork()        // IO 스레드
    withContext(Dispatchers.Main) {
        updateUI(data)                    // 메인 스레드로 전환
    }
}
```

<br>

## 3. Structured Concurrency 패턴 및 Job 계층 구조

### 3.1 Structured Concurrency 원칙

Kotlin 코루틴의 핵심 설계 철학은 **Structured Concurrency**다:

1. 모든 코루틴은 **부모 스코프** 안에서 실행된다.
2. 부모가 취소되면 **자식 코루틴도 모두 취소**된다.
3. 자식이 실패하면 **부모에게 전파**된다.
4. 부모는 **모든 자식이 완료될 때까지** 완료되지 않는다.

```kotlin
fun main() = runBlocking {       // 부모
    launch {                      // 자식 1
        delay(2000L)
        println("자식 1 완료")
    }
    launch {                      // 자식 2
        delay(1000L)
        println("자식 2 완료")
    }
    // runBlocking은 두 자식이 모두 완료될 때까지 대기
}
```

### 3.2 Job 계층 구조

```
runBlocking (Job)
├── launch (Job - 자식 1)
│   └── launch (Job - 손자 1)
└── launch (Job - 자식 2)
```

**취소 전파**: 부모 Job 취소 → 모든 자식 취소

```kotlin
fun main() = runBlocking {
    val parentJob = launch {
        val child1 = launch {
            repeat(1000) { i ->
                println("자식 1: $i")
                delay(500L)
            }
        }
        val child2 = launch {
            repeat(1000) { i ->
                println("자식 2: $i")
                delay(300L)
            }
        }
    }
    delay(1300L)
    parentJob.cancel()  // 자식 1, 자식 2 모두 취소됨
    println("부모 취소 완료")
}
```

### 3.3 coroutineScope vs supervisorScope

```kotlin
// coroutineScope: 자식 하나가 실패하면 나머지도 취소
suspend fun failFast() = coroutineScope {
    launch { throw RuntimeException("실패!") }  // 전체 스코프 취소
    launch { delay(Long.MAX_VALUE) }             // 같이 취소됨
}

// supervisorScope: 자식 실패가 형제에게 전파되지 않음
suspend fun failIsolated() = supervisorScope {
    launch { throw RuntimeException("실패!") }  // 이것만 실패
    launch {
        delay(1000L)
        println("나는 계속 실행됨")              // 정상 실행
    }
}
```

<br>

## 4. 실전 예제

### 4.1 여러 API 병렬 호출 (async/await)

```kotlin
suspend fun loadDashboard(userId: String): Dashboard = coroutineScope {
    // 세 API를 병렬로 호출
    val userDeferred = async { userApi.getUser(userId) }
    val ordersDeferred = async { orderApi.getOrders(userId) }
    val recommendsDeferred = async { recommendApi.getRecommendations(userId) }

    // 모든 결과를 모아서 반환
    Dashboard(
        user = userDeferred.await(),
        orders = ordersDeferred.await(),
        recommendations = recommendsDeferred.await()
    )
}
```

순차 실행 시 3초 걸리는 작업이 병렬로 **1초**에 완료된다 (각 API가 1초라고 가정).

### 4.2 타임아웃 처리 (withTimeout)

```kotlin
suspend fun fetchWithTimeout(): String {
    return try {
        withTimeout(3000L) {
            // 3초 안에 완료되지 않으면 TimeoutCancellationException
            slowApi.fetchData()
        }
    } catch (e: TimeoutCancellationException) {
        "기본값 (타임아웃)"
    }
}

// null 반환 버전
suspend fun fetchOrNull(): String? {
    return withTimeoutOrNull(3000L) {
        slowApi.fetchData()
    }
}
```

### 4.3 재시도 패턴

```kotlin
suspend fun <T> retry(
    times: Int = 3,
    initialDelay: Long = 100L,
    factor: Double = 2.0,
    block: suspend () -> T
): T {
    var currentDelay = initialDelay
    repeat(times - 1) {
        try {
            return block()
        } catch (e: Exception) {
            println("재시도 ${it + 1}/$times — ${e.message}")
        }
        delay(currentDelay)
        currentDelay = (currentDelay * factor).toLong()
    }
    return block() // 마지막 시도 — 실패 시 예외 전파
}

// 사용
val result = retry(times = 3) {
    apiService.getUser("user-123")
}
```

<br>

## 5. Flow 기초

Flow는 **비동기 데이터 스트림**이다. RxJava의 Observable과 유사하지만 코루틴 기반이다.

### 5.1 Cold Stream

Flow는 **cold stream**이다 — `collect`가 호출될 때까지 실행되지 않는다.

```kotlin
import kotlinx.coroutines.flow.*

fun numberFlow(): Flow<Int> = flow {
    for (i in 1..5) {
        delay(100L)
        emit(i)  // 값 방출
    }
}

fun main() = runBlocking {
    numberFlow().collect { value ->
        println("수신: $value")
    }
}
```

### 5.2 Flow 연산자

```kotlin
fun main() = runBlocking {
    (1..10).asFlow()
        .filter { it % 2 == 0 }           // 짝수만
        .map { it * it }                    // 제곱
        .take(3)                            // 처음 3개만
        .collect { println(it) }            // 4, 16, 36
}
```

주요 연산자 정리:

| 연산자 | 설명 |
|--------|------|
| `map` | 각 값 변환 |
| `filter` | 조건에 맞는 값만 통과 |
| `take` | 처음 N개만 |
| `drop` | 처음 N개 건너뛰기 |
| `onEach` | 각 값에 대해 부수 효과 실행 |
| `flatMapConcat` | 각 값을 새 Flow로 변환 후 순차 연결 |
| `flatMapMerge` | 각 값을 새 Flow로 변환 후 병렬 수집 |
| `combine` | 두 Flow의 최신 값 조합 |
| `zip` | 두 Flow의 값을 1:1 매칭 |

### 5.3 StateFlow와 SharedFlow

```kotlin
class UserViewModel : ViewModel() {
    // StateFlow — 항상 최신 값을 가지고 있음 (LiveData 대체)
    private val _uiState = MutableStateFlow(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    // SharedFlow — 이벤트 전달 (일회성 이벤트)
    private val _events = MutableSharedFlow<Event>()
    val events: SharedFlow<Event> = _events.asSharedFlow()

    fun loadUser(id: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val user = userRepository.getUser(id)
                _uiState.value = UiState.Success(user)
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message)
                _events.emit(Event.ShowSnackbar("로드 실패"))
            }
        }
    }
}
```

<br>

## 6. 코루틴 예외 처리

### 6.1 launch vs async 예외 전파 차이

```kotlin
fun main() = runBlocking {
    // launch: 예외가 즉시 부모로 전파됨
    val job = launch {
        throw RuntimeException("launch 에러")
        // → 부모 코루틴까지 전파, try-catch로 잡을 수 없음
    }

    // async: await() 호출 시 예외 발생
    val deferred = async {
        throw RuntimeException("async 에러")
    }
    try {
        deferred.await()  // 여기서 예외 발생
    } catch (e: RuntimeException) {
        println("잡았다: ${e.message}")
    }
}
```

### 6.2 CoroutineExceptionHandler

`launch`의 예외를 잡기 위해 **CoroutineExceptionHandler**를 사용한다. 이 핸들러는 **루트 코루틴**에만 적용된다.

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    println("예외 발생: ${exception.message}")
    // 로깅, 알림 등 처리
}

fun main() = runBlocking {
    val scope = CoroutineScope(SupervisorJob() + handler)

    scope.launch {
        throw RuntimeException("문제 발생!")
        // → handler에서 처리됨
    }

    scope.launch {
        delay(1000L)
        println("나는 정상 실행")  // SupervisorJob 덕분에 영향 없음
    }

    delay(2000L)
}
```

### 6.3 SupervisorJob

`SupervisorJob`은 자식의 실패가 다른 자식에게 전파되지 않게 한다.

```kotlin
val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

scope.launch {
    // 자식 1 — 실패해도 자식 2에 영향 없음
    throw RuntimeException("자식 1 실패")
}

scope.launch {
    // 자식 2 — 정상 실행 계속
    delay(1000L)
    println("자식 2 완료")
}
```

**일반 Job vs SupervisorJob 비교:**

| 특성 | Job | SupervisorJob |
|------|-----|---------------|
| 자식 실패 시 | 다른 자식 모두 취소 | 실패한 자식만 취소 |
| 부모 영향 | 부모도 취소 | 부모 유지 |
| 사용 시점 | 전체가 하나의 작업일 때 | 독립적인 작업들을 관리할 때 |

### 6.4 실전 예외 처리 패턴

```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
}

suspend fun <T> safeApiCall(block: suspend () -> T): Result<T> {
    return try {
        Result.Success(block())
    } catch (e: CancellationException) {
        throw e  // 취소 예외는 반드시 재던져야 함!
    } catch (e: Exception) {
        Result.Error(e)
    }
}

// 사용
val result = safeApiCall { apiService.getUser(userId) }
when (result) {
    is Result.Success -> showUser(result.data)
    is Result.Error -> showError(result.exception.message)
}
```

> **주의**: `CancellationException`을 삼키면 코루틴 취소가 작동하지 않는다. 반드시 재던져야 한다.

<br>

## 정리

| 개념 | 핵심 |
|------|------|
| `suspend` | 일시 중단 가능한 함수 |
| `launch` / `async` | 코루틴 빌더 (fire-and-forget / 결과 반환) |
| `Dispatcher` | 실행 스레드 제어 (Main, IO, Default) |
| Structured Concurrency | 부모-자식 관계로 생명주기 관리 |
| `Flow` | 비동기 cold stream |
| `SupervisorJob` | 자식 실패 격리 |
| `CoroutineExceptionHandler` | 루트 코루틴 예외 처리 |

코루틴은 단순히 스레드를 대체하는 도구가 아니라, **구조화된 동시성**을 통해 안전하고 관리 가능한 비동기 코드를 작성하게 해주는 설계 패러다임이다.

<br>

References
----------

- [Coroutines overview — Kotlin Documentation](https://kotlinlang.org/docs/coroutines-overview.html)
- [Coroutines guide — Kotlin Documentation](https://kotlinlang.org/docs/coroutines-guide.html)
- [Asynchronous Flow — Kotlin Documentation](https://kotlinlang.org/docs/flow.html)
- [Coroutine context and dispatchers — Kotlin Documentation](https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html)
- [Coroutine exceptions handling — Kotlin Documentation](https://kotlinlang.org/docs/exception-handling.html)
- [KotlinConf 2019 — Coroutines! — Roman Elizarov](https://www.youtube.com/watch?v=a3agLJQ6DJUk)
- [kotlinx.coroutines — GitHub](https://github.com/Kotlin/kotlinx.coroutines)
