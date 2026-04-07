---
layout: post
title: "부동소수점(Floating Point) 표현 — IEEE 754 완전 정복"
subtitle: "IEEE 754 단정도/배정도 구조와 백엔드 개발자가 알아야 할 함정들"
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
series: "CS Fundamentals"
keywords: "ieee 754, floating point, single precision, double precision, NaN"
tags:
  - CS
  - CS Fundamentals
categories:
  - cs
description: "IEEE 754 부동소수점 표현 완전 정복. 단정도·배정도 구조, 변환 예제, 특수 값(NaN, Infinity), 0.1+0.2≠0.3 함정과 BigDecimal 등 백엔드 실무 가이드를 정리합니다."
---

[이전 글(Data Representation - Integer)](/cs/2026/04/01/data-representation-integer/)에서 정수의 표현 방식을 알아보았다. 정수는 _fixed-point_(고정소수점)으로 표현된다고 했는데, 이번에는 실수를 표현하는 방식인 **부동소수점(floating-point)** 을 다룬다.

핵심 주제는 현대 거의 모든 하드웨어가 채택한 **IEEE 754** 표준이다.

---

## 왜 부동소수점인가?

고정소수점(fixed-point)은 소수점의 위치가 고정되어 있다. 예를 들어 32비트 중 16비트를 정수부, 16비트를 소수부에 할당하면 표현 가능한 범위가 매우 좁다.

부동소수점은 **소수점이 떠다닌다(float)**. 과학적 표기법(scientific notation)과 같은 원리로, 극도로 큰 수와 극도로 작은 수를 같은 비트 수로 표현할 수 있다.

```
과학적 표기법:  -2.625 = -1.0101 × 2^1

                 ↑ sign   ↑ significand  ↑ exponent
```

---

## IEEE 754 구조

IEEE 754는 부동소수점 수를 세 부분으로 나눈다:

```
 [Sign] [Exponent (biased)] [Mantissa (fraction)]
```

| 형식 | 총 비트 | Sign | Exponent | Mantissa | Bias |
|------|---------|------|----------|----------|------|
| **단정도 (Single, `float`)** | 32 | 1 | 8 | 23 | 127 |
| **배정도 (Double, `double`)** | 64 | 1 | 11 | 52 | 1023 |

### 각 필드의 의미

1. **Sign bit (부호 비트)** — `0`이면 양수, `1`이면 음수
2. **Exponent (지수)** — _biased_ 표현 사용. 실제 지수 = 저장된 값 - Bias
3. **Mantissa (가수, fraction)** — 정규화된 이진수의 소수 부분. 앞의 `1.`은 _implicit leading bit_ 로 생략된다 (정규화된 수의 경우)

즉, 값은 다음 공식으로 계산된다:

```
(-1)^sign × 1.mantissa × 2^(exponent - bias)
```

---

## 10진수 → IEEE 754 변환 예제

### 예제 1: `-6.75`를 단정도(32-bit)로 변환

**Step 1. 부호 결정**

음수이므로 Sign = `1`

**Step 2. 절대값을 이진수로 변환**

```
6   = 110 (2진수)
0.75 → 0.75 × 2 = 1.5  → 1
       0.5  × 2 = 1.0  → 1
∴ 0.75 = .11
```

따라서 `6.75 = 110.11`

**Step 3. 정규화 (Normalize)**

```
110.11 = 1.1011 × 2^2
```

**Step 4. Exponent 계산 (biased)**

```
실제 지수 = 2
biased exponent = 2 + 127 = 129 = 1000 0001
```

**Step 5. Mantissa 추출**

`1.1011`에서 leading `1.`을 제거 → `1011`

23비트로 패딩: `1011 0000 0000 0000 0000 000`

**최종 결과:**

```
Sign | Exponent  | Mantissa
  1  | 1000 0001 | 1011 0000 0000 0000 0000 000

Hex: 0xC0D80000
```

### 예제 2: IEEE 754 비트 → 10진수 역변환

```
0 | 0111 1110 | 1000 0000 0000 0000 0000 000
```

1. Sign = `0` → 양수
2. Exponent = `0111 1110` = 126 → 실제 지수 = 126 - 127 = **-1**
3. Mantissa = `1.1` (implicit leading 1 복원)
4. 값 = `+1.1 × 2^(-1)` = `0.11` (2진) = **0.75**

---

## C 코드로 확인하기

```c
#include <stdio.h>
#include <stdint.h>
#include <string.h>

void print_float_bits(float f) {
    uint32_t bits;
    memcpy(&bits, &f, sizeof(bits));

    uint32_t sign     = (bits >> 31) & 1;
    uint32_t exponent = (bits >> 23) & 0xFF;
    uint32_t mantissa = bits & 0x7FFFFF;

    printf("값: %f\n", f);
    printf("  Sign:     %u\n", sign);
    printf("  Exponent: %u (biased), %d (실제)\n", exponent, (int)exponent - 127);
    printf("  Mantissa: 0x%06X\n", mantissa);
    printf("  Hex:      0x%08X\n", bits);
    printf("\n");
}

int main(void) {
    print_float_bits(-6.75f);   // 예제 1 검증
    print_float_bits(0.75f);    // 예제 2 검증
    print_float_bits(0.1f);     // 무한소수 케이스
    return 0;
}
```

출력:

```
값: -6.750000
  Sign:     1
  Exponent: 129 (biased), 2 (실제)
  Mantissa: 0x580000
  Hex:      0xC0D80000

값: 0.750000
  Sign:     0
  Exponent: 126 (biased), -1 (실제)
  Mantissa: 0x400000
  Hex:      0x3F400000

값: 0.100000
  Sign:     0
  Exponent: 123 (biased), -4 (실제)
  Mantissa: 0x4CCCCD
  Hex:      0x3DCCCCCD
```

`0.1`의 mantissa가 `0x4CCCCD`인 것을 볼 수 있다. `0.1`은 이진수로 `0.0001100110011...`로 무한 반복소수이기 때문에, 23비트에서 잘려 나가면서 오차가 발생한다.

---

## 특수 값 (Special Values)

IEEE 754는 exponent와 mantissa의 특정 조합으로 특수한 값을 표현한다.

```
  Exponent   |  Mantissa  |  의미
-------------|------------|------------------
  0000 0000  |  000...0   |  ±0 (부호 비트에 따라)
  0000 0000  |  ≠ 0       |  비정규화수 (denormalized)
  1111 1111  |  000...0   |  ±Infinity
  1111 1111  |  ≠ 0       |  NaN (Not a Number)
  그 외       |  any       |  정규화수 (normalized)
```

### +0과 -0

IEEE 754는 **양의 0**과 **음의 0**을 구분한다. 대부분의 비교 연산에서 `+0 == -0`은 `true`지만, 비트 레벨에서는 다르다.

```c
float pos_zero = 0.0f;
float neg_zero = -0.0f;

printf("%d\n", pos_zero == neg_zero); // 1 (true)
printf("%f\n", 1.0f / pos_zero);     // inf
printf("%f\n", 1.0f / neg_zero);     // -inf  ← 부호가 다르다!
```

### Infinity

오버플로우 또는 0으로 나눌 때 발생한다. 산술 연산에서 전파된다:

```c
float inf = 1.0f / 0.0f;     // +inf
float neg_inf = -1.0f / 0.0f; // -inf

printf("%f\n", inf + 1.0f);   // inf
printf("%f\n", inf + neg_inf); // nan (inf - inf는 정의 불가)
```

### NaN (Not a Number)

정의 불가한 연산의 결과다. **NaN은 자기 자신과도 같지 않다** — 이것이 NaN 탐지의 핵심이다.

```c
#include <math.h>

float nan_val = 0.0f / 0.0f;

printf("%d\n", nan_val == nan_val);  // 0 (false!)
printf("%d\n", isnan(nan_val));      // 1 (true)
```

Java에서도 동일한 동작을 한다:

```java
double nan = Double.NaN;

System.out.println(nan == nan);           // false
System.out.println(Double.isNaN(nan));    // true
```

### 비정규화수 (Denormalized / Subnormal Numbers)

Exponent가 전부 `0`이고 Mantissa가 `0`이 아닌 경우, **implicit leading bit이 `0`** 이 된다. 이를 통해 0에 매우 가까운 아주 작은 수를 표현한다.

```
값 = (-1)^sign × 0.mantissa × 2^(1 - bias)
```

단정도 기준으로 표현 가능한 가장 작은 양수:

- 정규화: `1.0 × 2^(-126)` ≈ `1.175e-38`
- 비정규화: `0.000...1 × 2^(-126)` ≈ `1.401e-45`

비정규화수 덕분에 0으로의 _gradual underflow_ 가 가능하다.

---

## 정밀도 한계와 부동소수점 함정

### 0.1 + 0.2 != 0.3

부동소수점의 가장 유명한 함정이다.

```java
System.out.println(0.1 + 0.2);           // 0.30000000000000004
System.out.println(0.1 + 0.2 == 0.3);    // false
```

```c
printf("%.20f\n", 0.1 + 0.2);  // 0.30000000000000004441
printf("%.20f\n", 0.3);        // 0.29999999999999998890
```

원인: `0.1`, `0.2`, `0.3` 모두 이진수로 무한반복소수이다. 유한 비트로 표현하면서 각각 미세한 오차가 발생하고, 이 오차들이 합산되면서 결과가 달라진다.

### 큰 수와 작은 수의 덧셈

```java
float big   = 16777216.0f;  // 2^24, 정확히 표현 가능
float small = 1.0f;

System.out.println(big + small == big);  // true!
```

단정도의 mantissa가 23비트이므로 `2^24`에 `1`을 더해도 mantissa에 담을 수 없어 반올림되어 사라진다. 이를 **absorption** 현상이라 한다.

### 결합법칙이 성립하지 않는다

```java
double a = 1e15, b = -1e15, c = 1.0;
System.out.println((a + b) + c);  // 1.0
System.out.println(a + (b + c));  // 0.0  ← 다르다!
```

부동소수점 연산은 `(a + b) + c ≠ a + (b + c)`일 수 있다. 이것이 수치 계산 라이브러리가 덧셈 순서까지 신경 쓰는 이유다 (Kahan summation 등).

### 정밀도 비교: epsilon 방식

부동소수점 비교는 `==` 대신 **epsilon 비교**를 사용해야 한다:

```java
private static final double EPSILON = 1e-10;

public static boolean nearlyEqual(double a, double b) {
    return Math.abs(a - b) < EPSILON;
}
```

단, 값의 크기에 따라 적절한 epsilon이 달라지므로, 더 정교한 비교가 필요할 때는 **relative epsilon** 또는 **ULP(Unit in the Last Place)** 기반 비교를 사용한다:

```java
// Java의 Math.ulp 활용
public static boolean nearlyEqual(double a, double b) {
    return Math.abs(a - b) <= Math.max(Math.ulp(a), Math.ulp(b));
}
```

---

## 단정도 vs 배정도 비교

| 속성 | `float` (32-bit) | `double` (64-bit) |
|------|-------------------|---------------------|
| Mantissa 비트 | 23 | 52 |
| 유효 십진 자릿수 | ~7자리 | ~15-16자리 |
| 최대값 | ~3.4 × 10^38 | ~1.8 × 10^308 |
| 최소 정규화 양수 | ~1.2 × 10^-38 | ~2.2 × 10^-308 |
| Exponent 범위 | -126 ~ +127 | -1022 ~ +1023 |

---

## 백엔드 개발자를 위한 실무 가이드

### DB: FLOAT vs DECIMAL

```sql
-- FLOAT/DOUBLE: IEEE 754 기반, 근사값 저장
CREATE TABLE products (
    price FLOAT  -- 절대 하지 마세요!
);

-- DECIMAL: 고정소수점, 정확한 값 저장
CREATE TABLE products (
    price DECIMAL(10, 2)  -- 소수점 이하 2자리까지 정확
);
```

**금액(money)은 절대 FLOAT/DOUBLE로 저장하지 않는다.** 반올림 오차가 누적되면 회계 장부에서 수 원~수십 원의 차이가 발생한다.

- **FLOAT/DOUBLE** — 과학 계산, 통계, 좌표(위도/경도) 등 _근사값이 허용되는_ 경우에 사용
- **DECIMAL** — 금액, 세율, 환율 등 _정확한 값이 필요한_ 경우에 사용

### Java: `double` vs `BigDecimal`

```java
// 절대 이렇게 하면 안 된다
double price = 0.1;
double quantity = 3;
System.out.println(price * quantity);  // 0.30000000000000004

// BigDecimal 사용 (문자열 생성자 필수!)
BigDecimal price = new BigDecimal("0.1");
BigDecimal quantity = new BigDecimal("3");
System.out.println(price.multiply(quantity));  // 0.3
```

주의: `new BigDecimal(0.1)`은 이미 오차가 있는 double 값을 그대로 가져오므로 **반드시 문자열 생성자** `new BigDecimal("0.1")`을 사용해야 한다.

```java
System.out.println(new BigDecimal(0.1));
// 0.1000000000000000055511151231257827021181583404541015625

System.out.println(new BigDecimal("0.1"));
// 0.1
```

### 정리: 타입 선택 가이드

```
금액 계산       → BigDecimal (Java), DECIMAL (DB)
과학/통계 계산  → double
ML/그래픽스     → float (메모리/속도 중시)
좌표(위경도)    → double (FLOAT도 가능하나 정밀도 주의)
```

---

## 마무리

IEEE 754는 한정된 비트로 실수를 표현하기 위한 정교한 타협이다. 대부분의 경우 잘 작동하지만, **정밀도의 한계**를 이해하지 못하면 디버깅하기 어려운 버그를 만들게 된다.

핵심 정리:

1. **구조**: Sign(1) + Exponent(biased) + Mantissa(implicit leading 1)
2. **특수 값**: ±0, ±Infinity, NaN — 각각 고유한 비트 패턴
3. **함정**: `0.1 + 0.2 != 0.3`, absorption, 결합법칙 깨짐
4. **실무 원칙**: 돈은 `BigDecimal`/`DECIMAL`, 비교는 epsilon 방식

다음 글에서는 문자(Character)와 문자열(String) 인코딩 — ASCII, Unicode, UTF-8 — 을 다룰 예정이다.

---

References
----------

- [IEEE 754 — Wikipedia](https://en.wikipedia.org/wiki/IEEE_754)
- [What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)
- [Float Exposed — Interactive IEEE 754 Visualization](https://float.exposed/)
- [Java BigDecimal — Oracle Docs](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/math/BigDecimal.html)

---

## 관련 포스트

- [정수 표현 방식 완전 정복](/cs/2026/04/01/data-representation-integer/)
