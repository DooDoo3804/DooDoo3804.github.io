---
title: "Kotlin vs Java"
subtitle: "What is difference between Kotlin and Java "
layout: post
author: "DooDoo"
header-img: "img/post-bg-kotlin-java.png"
header-mask: 0.4
keywords: "kotlin, java, difference"
tags:
    kotlin
    java
# hidden: true
---

> 개발자들은 평생동안 코드를 쓰는 것 보다 읽는 것에 더 많은 시간을 할애한다. 코틀린은 가독성에 초점을 뒀다. 「이사코바」

많은 서비스의 Backend 시스템은 자바로 이루어져 있습니다. 몇몇 회사와 개발자들이 Backend에 코틀린을 사용하려는 모습을 보이고 있습니다. 코틀린은 자바와 완벽하게 호환이 되므로 대체될 수 있습니다. 또 구글에서 코틀린을 1 언어로 채택하고 있는 걸 보면 코틀린은 여러 면에서 유리합니다.

Why we should learn kotlin?
---

### 정적 타입
동적 타입 언어에서 발생할 수 있는 런타임 오류를 어느 정도 예방이 가능하다. **NPE**(NullPointException)을 컴파일 단계에서 예방할 수 있습니다.

### 간결성
자바에 비해서 코드가 간결하고 직관적입니다. 그렇기에 배우기 쉽습니다. (~~물론 자바에 비해서..~~) Jetbrain 에서 만든 언어이기 때문에 Intellij IDEA에 적용하기 좋습니다. 일례로 자바로 작성된 코드를 코틀린 파일에 붙여 넣으면 IDEA에서 자동으로 코틀린으로 변환해줍니다.

Kotlin vs Java
---
![](https://kruschecompany.com/wp-content/uploads/2022/01/overview-2048x1603.png)
### 변수 상수

Java  
\- 변수 : 그냥 선언  
\- 상수 : **final**을 사용함
```java
String str = "";
final String str = "";
```

<br>
kotlin  
\- 변수 : **var**(variable)로 선언  
\- 상수 : **val**(value)로 선언
```kotlin
var str = ""
val str = ""
```

### 객체 초기화
java  
\- **new**로 객체를 초기화하고 초기화된 객체를 이용하여 초기 작업을 진행합니다.  
여러 객체를 생성해야 하는 상황이라면 불편해지고, 가독성이 떨어집니다.
```java
Intent testIntent = new Intent(this, SecondActivity.class);
testIntent.putExtra("ext1", 1);
testIntent.putExtra("ext2", 2);
testIntent.putExtra("ext3", "3");
testIntent.putExtra("ext4", "4");
testIntent.putExtra("ext5", false);
```

kotlin  
\- **apply block**을 이용하여 초기화 작업을 수행합니다. 초기화된 객체 자신을 `this`로 칭하기 때문에 따로 선언하지 않고 초기화 작업을 진행해 줄 수 있습니다. 여러 객체를 생성하더라도 block으로 감싸서 진행하기 때문에 가독성이 좋고, 코드를 관리하기 수월합니다.
```kotlin
val testIntent = Intent(this, SecondActivity::class.java).apply {
    putExtra("ext1", 1)
    putExtra("ext2", 2)
    putExtra("ext3", "3")
    putExtra("ext4", "4")
    putExtra("ext5", false)
}
```

### Lambda
kotlin  
자바에서는 람다를 사용할 때 매개변수를 사용했지만, 코틀린에서는 이를 생략하고 `it`이라는 암묵적 변수로 작성할 수 있습니다. (~~예시가 좀 잘못됐다...~~) 아래 2번 코드의 3줄 모두 같은 기능을 수행합니다.
```kotlin
// 1
class User {
    val name : String
}
fun main() {
    val user = listOf {
        user1 = User("A"),
        user2 = User("B")
    }
    val selectUser = user.filter {it.name == "A"}
    println("Selected user is ${selectUser.joinToString(seperator = ", ") { it.name }}")
}
// 2
people.mayBy(Person::age)
people.mayBy(p -> p.age)
people.mayBy(it.age)
```

### NPE(NullPointException)
java  
\- 자바는 기본적으로 Nullable로 선언됩니다. `@Nullable`과 `@NonNull`을 사용하여 Null타입을 구분합니다.  
\- 자바 변수에 Null이 들어오는 경우를 체크하고 NPE를 방지하고 싶다면 `if`를 사용합니다.
```java
@Nullable String strNullable = null;
@NonNull String strNonNull = "";

if (strNullable != null) {
    strNullable.split("/");
}
```

kotlin  
\- `?`를 사용하여 null이 가능함을 구분할 수 있습니다.  
\- 코틀린에서는 NPE를 방지하기 위해 `?`를 사용합니다. 만약 Null이라면 `split()`은 실행되지 않습니다.
```kotlin
var strNullable: String? = null
var strNonNull: String = ""

strNullable?.split("/")
```

### 생성자
java  
\- getter setter 등 Lombok의 `@`(Annotation)을 많이 선언해 주어야 하는 불편함이 있습니다.
```java
@Getter
@Builder
@AllArgsConstructor
public class User {
  @NotNull(message = "name is required")
  private String name;
  @Nullable
  private String lastName;  
 
  public User(String name) {
    this.name = name;
    this.lastName = "NO LASTNAME";
  }
}
```
kotlin
\- 코틀린은 @(Annotation)이 내장되어 있어 Lombok을 사용하지 않습니다. `var`를 통해 선언하는 것으로 DTO로 사용할 수 있습니다.
```kotlin
class User(
    var name,
    var lastName : String? = "NO LASTNAME",
)
```

Conclusion
---
자바와 코틀린은 완벽 호환이 되다고는 하지만 많은 부분 코틀린이 더 간결한 방식으로 다릅니다. 위에서 다 다루지 못한 내용들이 많이 있지만 다음 글들을 통해서 확인하면 좋습니다.  
[「Kotlin 기본 문법」](https://doodoo3804.github.io/2023/06/20/kotlin-%EA%B8%B0%EB%B3%B8/)
<!-- [「Kotlin 고급 문법」](https://doodoo3804.github.io/2023/06/20/kotlin-%EA%B8%B0%EB%B3%B8/) -->

참고
--
1. 백엔드 개발자의 코틀린 입문기 - 코틀린이 얼마나 좋길래? 자바에서 옮겨가도 될까?[https://seolin.tistory.com/146](https://seolin.tistory.com/146)  
2. Kotlin vs Java: strengths, weaknesses and when to use which [https://kruschecompany.com/kotlin-vs-java/](https://kruschecompany.com/kotlin-vs-java/)  
3. [Kotlin] Kotlin vs. Java - 코틀린, 자바 차이점 비교 [https://dev-imaec.tistory.com/36](https://dev-imaec.tistory.com/36)  
4. Java vs Kotlin 비교 / 안드로이드 앱 개발 승자는??? [https://mondayless.tistory.com/25](https://mondayless.tistory.com/25)  
5. [kotlin vs java ] 코틀린과 자바의 차이, 코틀린의 장점 [https://juhi.tistory.com/72](https://juhi.tistory.com/72)  
6. Kotlin으로 프로젝트 하기 [https://brunch.co.kr/@purpledev/5](https://brunch.co.kr/@purpledev/5)  