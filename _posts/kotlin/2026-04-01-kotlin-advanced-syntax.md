---
title: "Kotlin 고급 문법"
subtitle: "Advanced Kotlin Syntax"
layout: post
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "kotlin, advanced, lambda, coroutine, extension"
description: "Kotlin 고급 문법 정리 — 람다, 고차 함수, 확장 함수, 코루틴, 스코프 함수 등 실무와 코딩 테스트에서 자주 쓰이는 패턴을 예제와 함께 설명합니다."
series: "Kotlin 마스터"
tags:
  - Kotlin
  - Java
categories:
  - kotlin
---

Kotlin 고급 문법
---

Kotlin의 [기본 문법]({% post_url kotlin/2023-06-20-kotlin-기본-문법 %})에 이어, 실무와 코딩 테스트에서 자주 활용되는 고급 문법을 정리한다.

<br>

### 1. Lambda

```kotlin
val square: (Int) -> Int = { number -> number * number }

fun main() {
    println(square(5)) // 25
}
```

람다식은 value처럼 다룰 수 있는 익명 함수이다. 변수에 저장하거나 함수의 인자로 전달할 수 있다.

#### 축약 표현

파라미터가 하나인 경우 `it` 키워드로 축약할 수 있다.

```kotlin
val double: (Int) -> Int = { it * 2 }
val names = listOf("Alice", "Bob", "Charlie")
val lengths = names.map { it.length } // [5, 3, 7]
```

#### 여러 줄 람다

마지막 표현식이 반환값이 된다.

```kotlin
val processName: (String) -> String = { name ->
    val trimmed = name.trim()
    val upper = trimmed.uppercase()
    upper // 이 값이 반환됨
}
```

<br>

### 2. Higher-Order Functions (고차 함수)

함수를 매개변수로 받거나 함수를 반환하는 함수이다.

```kotlin
fun operate(a: Int, b: Int, operation: (Int, Int) -> Int): Int {
    return operation(a, b)
}

fun main() {
    val sum = operate(3, 4) { x, y -> x + y }
    val product = operate(3, 4) { x, y -> x * y }
    println(sum)     // 7
    println(product) // 12
}
```

마지막 파라미터가 람다인 경우, 괄호 밖으로 뺄 수 있다 (trailing lambda).

```kotlin
// 아래 두 표현은 동일
listOf(1, 2, 3).filter({ it > 1 })
listOf(1, 2, 3).filter { it > 1 }
```

<br>

### 3. Extension Functions (확장 함수)

기존 클래스를 수정하지 않고 새로운 함수를 추가할 수 있다.

```kotlin
fun String.addExclamation(): String {
    return this + "!"
}

fun Int.isEven(): Boolean = this % 2 == 0

fun main() {
    println("Hello".addExclamation()) // Hello!
    println(4.isEven())               // true
    println(7.isEven())               // false
}
```

#### 실용적인 예시

```kotlin
fun <T> List<T>.secondOrNull(): T? {
    return if (this.size >= 2) this[1] else null
}

fun String.toSlug(): String {
    return this.lowercase()
        .replace(Regex("[^a-z0-9\\s-]"), "")
        .replace(Regex("\\s+"), "-")
        .trim('-')
}
```

<br>

### 4. Scope Functions (범위 함수)

Kotlin은 객체의 컨텍스트 내에서 코드 블록을 실행하는 5개의 scope function을 제공한다.

| 함수 | 객체 참조 | 반환값 | 사용 사례 |
|------|-----------|--------|-----------|
| `let` | `it` | 람다 결과 | null 체크 후 실행 |
| `run` | `this` | 람다 결과 | 객체 설정 + 결과 계산 |
| `with` | `this` | 람다 결과 | 객체의 여러 메서드 호출 |
| `apply` | `this` | 객체 자체 | 객체 초기화/설정 |
| `also` | `it` | 객체 자체 | 부수 효과 (로깅 등) |

```kotlin
data class Person(
    var name: String = "",
    var age: Int = 0,
    var email: String = ""
)

// let: null-safe 처리
val name: String? = "Kotlin"
name?.let {
    println("Name length: ${it.length}")
}

// apply: 객체 초기화
val person = Person().apply {
    this.name = "DooDoo"
    this.age = 25
    this.email = "doodoo@example.com"
}

// also: 디버깅/로깅
val numbers = mutableListOf(1, 2, 3)
    .also { println("Before: $it") }
    .apply { add(4) }
    .also { println("After: $it") }

// run: 객체 설정 + 결과
val greeting = person.run {
    "Hello, $name! You are $age years old."
}

// with: 여러 속성 접근
val info = with(person) {
    println(name)
    println(age)
    "$name ($age)"
}
```

<br>

### 5. Data Class & Destructuring

```kotlin
data class User(val name: String, val age: Int, val email: String)

fun main() {
    val user = User("DooDoo", 25, "doodoo@example.com")

    // 자동 생성: toString, equals, hashCode, copy
    println(user)                        // User(name=DooDoo, age=25, email=doodoo@example.com)
    val older = user.copy(age = 26)      // name, email은 유지

    // Destructuring
    val (name, age, email) = user
    println("$name is $age years old")   // DooDoo is 25 years old

    // Map에서도 활용
    val map = mapOf("a" to 1, "b" to 2)
    for ((key, value) in map) {
        println("$key -> $value")
    }
}
```

<br>

### 6. Sealed Class

상속 가능한 클래스들의 집합을 제한할 때 사용한다. `when` 표현식에서 `else` 분기가 필요 없어진다.

```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String) : Result<Nothing>()
    object Loading : Result<Nothing>()
}

fun handleResult(result: Result<String>) {
    when (result) {
        is Result.Success -> println("Data: ${result.data}")
        is Result.Error   -> println("Error: ${result.message}")
        is Result.Loading -> println("Loading...")
        // else 불필요 - 컴파일러가 모든 케이스를 확인
    }
}
```

<br>

### 7. Collection Operations

Kotlin의 컬렉션 API는 함수형 프로그래밍 스타일의 다양한 연산을 제공한다.

```kotlin
val numbers = listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)

// 기본 변환
val doubled = numbers.map { it * 2 }           // [2, 4, 6, ..., 20]
val evens = numbers.filter { it % 2 == 0 }     // [2, 4, 6, 8, 10]
val sum = numbers.reduce { acc, n -> acc + n }  // 55

// 그룹화 & 분할
val grouped = numbers.groupBy { if (it % 2 == 0) "even" else "odd" }
// {odd=[1, 3, 5, 7, 9], even=[2, 4, 6, 8, 10]}

val (small, large) = numbers.partition { it <= 5 }
// small=[1,2,3,4,5], large=[6,7,8,9,10]

// flatMap
val nested = listOf(listOf(1, 2), listOf(3, 4), listOf(5))
val flat = nested.flatMap { it } // [1, 2, 3, 4, 5]

// 체이닝
val result = numbers
    .filter { it % 2 == 0 }
    .map { it * it }
    .sortedDescending()
    .take(3)
// [100, 64, 36]
```

<br>

### 8. Coroutines 기초

Kotlin 코루틴은 비동기 프로그래밍을 순차적인 코드처럼 작성할 수 있게 해준다.

```kotlin
import kotlinx.coroutines.*

fun main() = runBlocking {
    // launch: 결과를 반환하지 않는 코루틴
    val job = launch {
        delay(1000L)
        println("World!")
    }
    println("Hello,")
    job.join()

    // async: 결과를 반환하는 코루틴
    val deferred1 = async { fetchUserName() }
    val deferred2 = async { fetchUserAge() }
    println("${deferred1.await()} is ${deferred2.await()} years old")
}

suspend fun fetchUserName(): String {
    delay(1000L) // 네트워크 호출 시뮬레이션
    return "DooDoo"
}

suspend fun fetchUserAge(): Int {
    delay(1000L)
    return 25
}
```

#### 주요 개념

- **`suspend`**: 일시 중단 가능한 함수를 표시하는 키워드
- **`launch`**: 결과를 반환하지 않는 코루틴 빌더 (`Job` 반환)
- **`async`**: 결과를 반환하는 코루틴 빌더 (`Deferred<T>` 반환)
- **`runBlocking`**: 코루틴이 완료될 때까지 현재 스레드를 차단

```kotlin
// 구조화된 동시성 (Structured Concurrency)
suspend fun loadData() = coroutineScope {
    val users = async { fetchUsers() }
    val posts = async { fetchPosts() }
    // 둘 다 완료될 때까지 대기
    processData(users.await(), posts.await())
}
```

#### Dispatchers

```kotlin
// Dispatchers 종류
launch(Dispatchers.Main) { /* UI 작업 */ }
launch(Dispatchers.IO) { /* 네트워크, DB I/O */ }
launch(Dispatchers.Default) { /* CPU 집약 작업 */ }
```

#### Exception Handling

```kotlin
val handler = CoroutineExceptionHandler { _, exception ->
    println("예외 처리: $exception")
}
val job = CoroutineScope(Dispatchers.IO + handler).launch {
    throw RuntimeException("에러 발생")
}
```

#### Flow 기초

```kotlin
fun numberFlow(): Flow<Int> = flow {
    for (i in 1..5) {
        delay(100)
        emit(i)
    }
}

// collect
numberFlow().collect { value -> println(value) }
```

<br>

### 9. Inline Functions & Reified Types

`inline` 키워드는 함수 호출 오버헤드를 줄이고, `reified`는 제네릭 타입 정보를 런타임에 유지한다.

```kotlin
inline fun <reified T> List<*>.filterByType(): List<T> {
    return this.filterIsInstance<T>()
}

fun main() {
    val mixed: List<Any> = listOf(1, "hello", 2.0, "world", 3)
    val strings = mixed.filterByType<String>() // [hello, world]
    val ints = mixed.filterByType<Int>()       // [1, 3]
}
```

<br>

관련 포스트
---

- [Kotlin 기본 문법](/kotlin/2023/06/20/kotlin-기본-문법/)
- [Kotlin vs Java — 핵심 차이점 비교](/kotlin/2023/06/21/kotlin-vs-Java/)
- [Kotlin Coroutines 실전 가이드](/kotlin/2026/04/01/kotlin-coroutines-guide/)

References
---

- [Kotlin 공식 문서](https://kotlinlang.org/docs/home.html)
- [Kotlin Coroutines Guide](https://kotlinlang.org/docs/coroutines-guide.html)
