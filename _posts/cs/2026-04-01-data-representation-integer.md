---
title: "Data Representation - Integer"
subtitle: "정수의 데이터 표현 방식"
layout: post
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "data representation, integer, binary, twos complement, computer science"
description: "정수의 데이터 표현 방식을 정리합니다. 부호 없는 정수, 2의 보수, 고정소수점 등 컴퓨터가 정수를 인코딩하는 방법을 C 예제와 함께 설명합니다."
series: "CS Fundamentals"
tags:
  - CS
  - CS Fundamentals
categories:
  - cs
---

Integers, or _whole number_ from elemental mathematics, are the most common and
fundamental numbers used in the computers. It's represented as
_fixed-point numbers_, contrast to _floating-point numbers_ in the machine.
Today we are going to learn a whole bunch of way to encode it.

There are mainly two properties to make a integer representation different:

1. **Size, of the number of bits used**.
usually the power of 2. e.g. 8-bit, 16-bit, 32-bit, 64-bit.

2. **Signed or unsigned**.
there are also multiple schemas to encode a signed integers.

We are also gonna use the below terminologies throughout the post:

- _MSB_: Most Significant Bit
- _LSB_: Least Significant Bit


Prerequisite - `printf` Recap
----------------------------------------

We will quickly recap the integers subset of usages of `printf`.
Basically, we used _format specifier_ to interpolate values into strings:

### [Format Specifier](http://www.cplusplus.com/reference/cstdio/printf/)

> `%[flags][width][.precision][length]specifier`

- `specifier`
  - `d`, `i` : signed decimal
  - `u` : unsigned decimal
  - `c` : char
  - `p`: pointer addr
  - `x` / `X` : lower/upper unsigned hex
- `length`
  - `l` : long (at least 32)
  - `ll` : long long (at least 64)
  - `h` : short (usually 16)
  - `hh` : short short (usually 8)

```cpp
using namespace std;
int main()  {
  cout << "Size of int = "<< sizeof(int) << endl;
  cout << "Size of long = " << sizeof(long) << endl;
  cout << "Size of long long = " << sizeof(long long);
}
Output in 32 bit gcc compiler: 4 4 8
Output in 64 bit gcc compiler: 4 8 8
```

### [`inttypes.h` from C99](http://www.qnx.com/developers/docs/6.5.0/index.jsp?topic=%2Fcom.qnx.doc.dinkum_en_c99%2Finttypes.html)

Also in [cppreference.com](https://en.cppreference.com/w/c/types/integer)

```cpp
// signed int (d or i)
#define PRId8     "hhd"
#define PRId16    "hd"
#define PRId32    "ld"
#define PRId64    "lld"

// unsigned int (u)
#define PRIu8     "hhu"
#define PRIu16    "hu"
#define PRIu32    "u"
#define PRIu64    "llu"

// unsigned hex
#define PRIx8     "hhx"
#define PRIx16    "hx"
#define PRIx32    "x"
#define PRIx64    "llx"

// uintptr_t (64 bit machine word len)
#define PRIxPTR   "llx"
```


Unsigned Integers
-----------------

The conversion between unsigned integers and binaries are trivial.
Here, we can represent 8 bits (i.e. a _byte_) as a _hex pair_, e.g.
`255 == 0xff == 0b11111111`.

```cpp
#include <stdint.h>    // uintN_t
#include <inttypes.h>  // PRI macros

uint8_t u8 = 255;
printf("0x%02" PRIx8 "\n", u8); // 0xff
printf(  "%"   PRId8 "\n", u8); // 255
```


Signed Integers
-----------------

Signed integers are more complicated. We need to cut those bits to halves
to represent both positive and negative integers somehow.

There are four well-known schemas to encode it, according to
[signed number representation of wikipedia](https://en.wikipedia.org/wiki/Signed_number_representations).

### Sign magnitude 원码

It's also called _"sign and magnitude"_. From the name we can see how straightforward it is:
it's basically put one bit (often the _MSB_) as the _sign bit_ to represent _sign_ and the remaining bits indicating
the magnitude (or absolute value), e.g.

```cpp
  binary   | sign-magn |  unsigned
-----------|-----------|------------
0 000 0000 |    +0     |     0
0 111 1111 |    127    |    127
...
1 000 0000 |    -0     |    128
1 111 1111 |   -127    |    255
```

It was used in early computer (IBM 7090) and now mainly used in the
_significand_ part in floating-point number

Pros:
- simple and natural for human

Cons:
- 2 ways to represent zeros (`+0` and `-0`)
- not as good for machine
  - add/sub/cmp require knowing the sign
    - complicate CPU ALU design; potentially more cycles


### [Ones' complement](https://en.wikipedia.org/wiki/Ones%27_complement) 반码

It forms a negative integer by applying a _bitwise NOT_
i.e. _complement_ of its positive counterpart.

```cpp
  binary   |  1s comp  |  unsigned
-----------|-----------|------------
0000 0000  |     0     |     0
0000 0001  |     1     |     1
...
0111 1111  |    127    |    127
1000 0000  |   -127    |    128
...
1111 1110  |    -1     |    254
1111 1111  |    -0     |    255
```

N.B. _MSB_ can still be signified by MSB.

It's referred to as _ones'_ complement because the negative can be formed
by subtracting the positive **from** _ones_: `1111 1111 (-0)`

```cpp
  1111 1111       -0
- 0111 1111       127
---------------------
  1000 0000      -127
```

The benefits of the complement nature is that adding becomes simple,
except we need to do an _end-around carry_ to add resulting carry
back to get the correct result.

```cpp
  0111 1111       127
+ 1000 0001      -126
---------------------
1 0000 0000        0
          1       +1     <- add carry "1" back
---------------------
  0000 0001        1
```

Pros:
- Arithmetics on machine are fast.

Cons:
- still 2 zeros!


### [Two's complement](https://en.wikipedia.org/wiki/Two%27s_complement) 보码

Most of the current architecture adopted this, including x86, MIPS, ARM, etc.
It differs from one's complement by one.

```cpp
  binary   |  2s comp  |  unsigned
-----------|-----------|------------
0000 0000  |     0     |     0
0000 0001  |     1     |     1
...
0111 1111  |    127    |    127
1000 0000  |   -128    |    128
1000 0001  |   -127    |    129
...
1111 1110  |    -2     |    254
1111 1111  |    -1     |    255
```

N.B. _MSB_ can still be signified by MSB.

It's referred to as _two's_ complement because the negative can be formed
by subtracting the positive **from** `2 ** N` (congruent to `0000 0000 (+0)`),
where `N` is the number of bits.

E.g., for a `uint8_t`, the _sum_ of any number and its two's complement would
be `256 (1 0000 0000)`:

```cpp
1 0000 0000       256  = 2 ** 8
- 0111 1111       127
---------------------
  1000 0001      -127
```

Because of this, arithmetics become really easier, for any number `x` e.g. `127`
we can get its two's complement by:

1. `~x => 1000 0000` bitwise NOT (like ones' complement)
2. `+1 => 1000 0001` add 1 (the one differed from ones' complement)

Pros:
- fast machine arithmetics
- only 1 zero!
- the minimal negative is `-128`

Cons:
- asymmetric range: `-128` to `127` for 8-bit


### [Offset binary](https://en.wikipedia.org/wiki/Offset_binary) 이동码

It's also called _excess-K_ or _biased representation_, where `K` is
the _biasing value_ (the new `0`), e.g. in _excess-128_:

```cpp
  binary   |  K = 128  |  unsigned
-----------|-----------|------------
0000 0000  |   -128(-K)|     0
0000 0001  |   -127    |     1
...
0111 1111  |    -1     |    127
1000 0000  |     0     |    128  (K)
1000 0001  |     1     |    129
...
1111 1111  |    127    |    255
```

It's now mainly used for the _exponent_ part of floating-point number.


Type Conversion & `printf`
----------------------------------------------

This might be a little bit off topic, but I want to note down what I observed
from experimenting. Basically, `printf` would not perform an implicit type
conversion but merely _interpret_ the bits arrangement of your arguments as you
told it.

- _UB!_ stands for _undefined behaviors_

```cpp
uint8_t u8 = 0b10000000; // 128
 int8_t s8 = 0b10000000; // -128

printf("%"PRIu8 "\n", u8);          // 128
printf("%"PRId8 "\n", u8);          // 128
printf("%"PRId8 "\n", (int8_t)u8);  // -128

printf("%"PRId8 "\n", s8);          // -128
printf("%"PRIu8 "\n", s8);          // 4294967168
printf("%"PRId8 "\n", (uint8_t)s8); // 128

printf("%"PRIxPTR "\n", s8);             // ffffff80
printf("%"PRIxPTR "\n", (uintptr_t)s8);  // ffffffffffffff80
```


Char & [ASCII](https://en.wikipedia.org/wiki/ASCII)
-----------------

Traditionally, `char` is represented in the computer as 8 bits as well. And
really, ASCII is only defined between `0` and `127` and require 7 bits.
(8-bit Extended ASCII is not quite well popularized and supported.)

It's more complicated in extension such as _Unicode_ nowadays, but we'll ignore
it for future posts dedicated for char and string representation.

So how is a `char` different with a _byte_?

Well, the answer is whether a `char` is a `signed char` (backed by `int8_t`)
or a `unsigned char` (backed by `uint8_t`) is... _implementation-defined_.
And most systems made it _signed_ since most types (e.g. `int`) were signed
by default.

N.B. `int` is standard-defined to be equivalent to `signed int`. This is
not the case of `char`.

That's why you often see such `typedef` such as:

```cpp
typedef unsigned char Byte_t;
typedef uint8_t byte_t;
```

to emphasize the nature of byte should be just plain, unsigned, bits.


References
----------

- [Wikipedia - Integer (computer science)](https://en.wikipedia.org/wiki/Integer_(computer_science))
- [NTU - Data Representation](https://www3.ntu.edu.sg/home/ehchua/programming/java/datarepresentation.html)

---

## 관련 포스트

- [부동소수점 IEEE 754 완전 정복](/cs/2026/04/01/data-representation-float/)
