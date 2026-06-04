---
layout: post
title: "select()에서 epoll까지 — I/O 멀티플렉싱 40년의 진화"
subtitle: "왜 select()로 시작했고, 왜 지금은 epoll을 쓰는가"
date: "2026-06-04"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
keywords: "select, poll, epoll, io multiplexing, c10k, io_uring, kqueue, iocp"
series: "Computer Science"
tags:
  - OS
  - Network
  - Linux
  - Backend
categories:
  - cs
description: "I/O 멀티플렉싱의 40년 역사를 추적합니다. select()가 1983년에 탄생한 배경, poll()이 해결한 것과 못한 것, epoll의 커널 내부 구조, 그리고 io_uring까지. 시스템콜 수준의 동작 원리와 실제 프레임워크들의 선택까지 정리합니다."
---

## 왜 이 글을 쓰는가

레거시 C++ 네트워킹 라이브러리(commoncpp2)에서 `select()` 기반 코드를 `poll()`로 마이그레이션하는 작업을 하다가 의문이 들었다. **왜 진작 poll()로 만들지 않았을까?** 답은 단순하지 않았다. 40년에 걸친 OS API 진화, 이식성 전쟁, 그리고 하드웨어 성능 곡선이 얽혀 있었다.

```
1983         1987         1994    1999    2000    2002         2019
  │            │            │       │       │       │            │
  select()     poll()      IOCP   C10K   kqueue   epoll      io_uring
  (4.2BSD)     (SVR3)    (WinNT)  문제   (FreeBSD) (Linux)    (Linux)
```

---

## select() — 모든 것의 시작 (1983)

### 탄생 배경

1983년, **4.2BSD**가 BSD 소켓 API와 TCP/IP 스택을 세상에 내놓았다. 동시에 등장한 것이 `select()` 시스템콜이다. 당시 4.2BSD는 프로세스당 파일 디스크립터(fd)를 **20개**까지만 허용했다. 비트맵으로 fd를 추적해도 전혀 문제가 없는 규모였다.

`select()`의 핵심 사용처는 **rlogin**(원격 로그인)이었다. 터미널 입력과 네트워크 소켓을 동시에 감시해야 했고, 하나의 프로세스에서 여러 fd를 블로킹 없이 모니터링하는 방법이 필요했다. 이후 4.3BSD에서 등장한 `inetd` 슈퍼 데몬도 `select()`의 주요 사용자가 되었다.

### 내부 동작 원리

```c
int select(int nfds, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout);
```

`fd_set`은 **비트맵**이다. 32개의 32비트 정수 배열, 총 1024비트. 각 비트 위치가 fd 번호에 대응된다.

```
fd_set (1024 bits):
┌─────────────────────────────────────────────────┐
│ bit 0 │ bit 1 │ bit 2 │ ... │ bit 1023          │
│   0   │   1   │   0   │     │    0              │
└─────────────────────────────────────────────────┘
         ↑ fd=1 감시 중
```

커널의 동작은 단순하다.

1. 유저 스페이스에서 `fd_set` 3개(read/write/except)를 커널로 **복사**
2. fd 0부터 `nfds-1`까지 **선형 스캔** — 각 fd에 대해 이벤트 확인
3. 이벤트가 있는 fd의 비트만 남기고 나머지를 **0으로 덮어씀**
4. 결과를 유저 스페이스로 복사

핵심 문제는 **3번**이다. `select()`는 `fd_set`을 **파괴적으로 수정**한다. 매 호출마다 `fd_set`을 다시 구성해야 한다.

### 한계

| 한계 | 설명 |
|------|------|
| **FD_SETSIZE = 1024** | 컴파일 타임에 고정. fd > 1024를 감시하면 **버퍼 오버플로우** 발생 (조용히 스택이 깨진다) |
| **O(n) 선형 스캔** | 매 호출마다 0~nfds를 전부 순회. fd 10,000개 중 2개만 활성이어도 10,000번 확인 |
| **파괴적 수정** | 매번 fd_set을 복사해서 넘겨야 함 |
| **비트맵의 비효율** | fd 4000과 8000만 감시해도 ~1000바이트 비트맵에 비트 2개만 세팅 |
| **3개의 분리된 집합** | read, write, except를 각각 관리 |

그런데도 `select()`가 **20년 넘게** 기본 선택이었다. 이유는 뒤에서 다룬다.

> **Windows의 fd_set은 다르다.** Windows 소켓 핸들은 연속적인 작은 정수가 아니므로, `fd_set`을 `{count, SOCKET[]}` 구조체로 구현했다. 비트맵이 아니라 배열이다. 이 차이가 이식성 문제의 근원이 되었다.

---

## poll() — select()의 명확한 개선 (1987)

### 탄생 배경

1987년, **AT&T System V Release 3(SVR3)**에서 `poll()`이 등장했다. 초기에는 STREAMS 디바이스 전용이었지만, SVR4(1988)에서 모든 디스크립터로 확장되었다. Linux에는 커널 2.1.23(1997년)에 추가되었다.

### select()와 무엇이 달라졌나

```c
struct pollfd {
    int   fd;       /* 파일 디스크립터 */
    short events;   /* 감시할 이벤트 (입력) */
    short revents;  /* 발생한 이벤트 (출력) */
};

int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

`poll()`은 세 가지 핵심 문제를 해결했다.

**1. FD_SETSIZE 제한 없음**

유저가 할당한 `pollfd` 배열을 사용하므로, 감시할 fd 수는 시스템 리소스가 허용하는 만큼 늘릴 수 있다.

**2. 비파괴적 동작**

입력(`events`)과 출력(`revents`)이 분리되어 있다. 배열을 매번 다시 구성할 필요가 없다.

```
select():  입력 → [1,0,1,1,0] → select() → [0,0,1,0,0]  (파괴됨, 재구성 필요)
poll():    입력 → events 필드 유지, revents만 업데이트  (재사용 가능)
```

**3. 더 세밀한 이벤트 타입**

`POLLIN`, `POLLOUT`, `POLLHUP`, `POLLERR`, `POLLNVAL` 등 세분화된 이벤트 플래그를 지원한다.

### 여전히 남은 한계

```
poll()도 O(n)이다.

감시 fd 수:  100    1,000    10,000    100,000
커널 순회:   100    1,000    10,000    100,000  ← 전부 스캔
```

| 한계 | 설명 |
|------|------|
| **O(n) 선형 스캔** | 매 호출마다 전체 배열을 순회. select()와 동일한 근본 문제 |
| **배열 전체 복사** | 매 호출마다 유저↔커널 간 전체 pollfd 배열 복사 (fd당 64비트, select()의 3비트보다 큼) |
| **커널에 상태 없음** | 커널은 이전 호출을 기억하지 못함. 매번 전체 목록을 다시 제출 |

curl 작성자 Daniel Stenberg의 분석에 따르면, select()와 poll() 모두 **fd 수백 개를 넘으면 급격히 느려진다**. select()는 비트맵이 가볍지만 FD_SETSIZE에 걸리고, poll()은 제한이 없지만 fd당 복사 비용이 더 크다.

### 왜 poll()이 보편화되지 못했나

여기가 핵심이다. `poll()`이 1987년에 나왔는데, 2000년대 초반 라이브러리들이 여전히 `select()`를 쓴 이유:

| 플랫폼 | poll() 지원 시기 |
|---------|-----------------|
| Linux | 1997 (커널 2.1.23) |
| Solaris | SVR4부터 지원 |
| FreeBSD | 지원 |
| **Mac OS X** | **10.4까지 poll()이 깨져 있었다** (2005년) |
| **Windows** | **WSAPoll은 Vista(2007)부터** |

commoncpp2 같은 라이브러리는 Linux, FreeBSD, Solaris, Tru64 Unix, **그리고 Win32**를 동시에 지원해야 했다. `select()`는 네트워크 지원이 있는 **모든 플랫폼**에서 동작하는 유일한 선택지였다. 이식성이 곧 생존이었던 시대에, FD_SETSIZE 1024개 제한은 감수할 만한 트레이드오프였다.

게다가 2000년대 초반에는 **프로세스당 동시 연결 1024개면 충분했다**. C10K 문제는 아직 소수의 고성능 서버만의 관심사였다.

---

## C10K 문제 — 패러다임 전환의 신호탄 (1999)

1999년, **Dan Kegel**이 "The C10K Problem"이라는 글을 발표했다.

> "하드웨어는 이미 10,000개의 동시 연결을 처리할 수 있다. 1 GHz CPU, 2 GB RAM, 기가비트 이더넷. 병목은 소프트웨어와 OS다."

Kegel은 당시 cdrom.com(Simtel FTP 호스팅)에서 1 Gbps 회선으로 10,000개의 동시 클라이언트를 서비스하려는 실전 경험에서 이 문제를 정의했다. 그의 웹 페이지(kegel.com/c10k.html)는 모든 알려진 접근법을 정리한 레퍼런스가 되었다.

```
1999년 하드웨어로 10,000 연결:
- 메모리: 연결당 ~50KB × 10,000 = ~500MB (2GB 중)  ✓
- CPU: 이벤트 처리 비용이 문제                       ✗
- OS: select()로 10,000 fd 관리?                     ✗✗✗
```

select()로 10,000개 fd를 감시하면:
- 매 호출마다 10,000비트 스캔
- FD_SETSIZE 1024 초과로 **사용 자체가 불가능**
- poll()로 해도 매번 10,000개 pollfd 구조체를 커널에 복사

이 문제가 epoll, kqueue, IOCP 같은 **O(1) 이벤트 통지 메커니즘**의 개발을 촉발했다.

---

## epoll — 리눅스의 답 (2002)

### 탄생 배경

**Davide Libenzi**가 2001년 7월에 epoll의 첫 번째 초안을 작성했다. Linux 2.5.44(개발 커널, 2002년 10월)에 병합되었고, Linux 2.6.0(2003년 12월)에서 안정 버전으로 배포되었다.

핵심 통찰: **감시 목록을 커널에 유지하라.** 매번 다시 보내지 말고, 한 번 등록하면 변경이 있을 때만 수정하라.

### 세 개의 시스템콜

```c
// 1. epoll 인스턴스 생성
int epoll_create1(int flags);

// 2. fd 등록/수정/삭제
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
//   op: EPOLL_CTL_ADD, EPOLL_CTL_MOD, EPOLL_CTL_DEL

// 3. 이벤트 대기 — ready fd만 반환
int epoll_wait(int epfd, struct epoll_event *events,
               int maxevents, int timeout);
```

select/poll과의 결정적 차이: `epoll_wait()`는 **활성화된 fd만 반환**한다. 10,000개를 감시하고 있어도 3개만 이벤트가 발생하면 3개만 돌려준다.

### 커널 내부 구조

epoll 인스턴스를 생성하면, 커널은 `eventpoll` 구조체를 할당한다.

```
eventpoll (커널 내부)
┌─────────────────────────────────────────┐
│  Red-Black Tree (rbr)                    │ ← 감시 중인 모든 fd
│  ┌───┐   ┌───┐   ┌───┐                  │    (epitem 노드)
│  │fd3│───│fd7│───│fd12│                  │    O(log n) 탐색/삽입/삭제
│  └───┘   └───┘   └───┘                  │
│                                          │
│  Ready List (rdllist)                    │ ← 이벤트 발생한 fd만
│  [fd7] → [fd12]                          │    이중 연결 리스트
│                                          │
│  Wait Queue                              │ ← epoll_wait()로 대기 중인 프로세스
│  Overflow List (ovflist)                 │ ← ready list 전송 중 도착한 이벤트
│  Spinlock + Mutex                        │
└─────────────────────────────────────────┘
```

각 감시 대상 fd는 `epitem` 구조체로 표현된다:

```
epitem
┌──────────────────────────┐
│  RB-tree node            │ ← 트리 내 위치
│  Ready list link         │ ← rdllist 연결
│  owning eventpoll ref    │ ← 소속 epoll 인스턴스
│  fd info (tree key)      │
│  event mask              │ ← EPOLLIN, EPOLLOUT 등
│  poll wait queue         │
└──────────────────────────┘
```

### 이벤트 전달 흐름

네트워크 패킷이 도착했을 때 커널 내부에서 일어나는 일:

```
① 하드웨어 인터럽트 발생 (NIC에 패킷 도착)
        │
② 네트워크 드라이버가 패킷 처리, 소켓 버퍼에 데이터 적재
        │
③ ep_poll_callback() 호출  ← epoll_ctl()로 등록 시 소켓의 poll 메커니즘에 콜백 등록
        │
④ 이벤트 마스크 확인 → 매칭되면 epitem을 ready list에 추가
        │
⑤ epoll_wait()로 대기 중인 프로세스 깨움
        │
⑥ epoll_wait()가 ready list를 splice하여 유저 스페이스로 복사, 반환
```

### 시간 복잡도 비교

| 연산 | select() | poll() | epoll |
|------|----------|--------|-------|
| 초기화 | - | - | `epoll_create` O(1) |
| fd 등록 | 매 호출마다 fd_set 재구성 | 매 호출마다 배열 전달 | `epoll_ctl` O(log n) — 한 번만 |
| 이벤트 대기 | O(n) — 전체 스캔 | O(n) — 전체 스캔 | O(k) — ready fd 수만큼 |
| 유저↔커널 복사 | 매번 fd_set 3개 | 매번 pollfd 배열 | 매번 ready 이벤트만 |

여기서 n은 전체 감시 fd 수, k는 이벤트가 발생한 fd 수다.

### Level-Triggered vs Edge-Triggered

epoll은 두 가지 모드를 지원한다.

**Level-Triggered (LT, 기본값)**

```
소켓 버퍼: [████████░░]  (데이터 있음)
epoll_wait → fd 반환
read(100 bytes)
소켓 버퍼: [███░░░░░░░]  (아직 데이터 남음)
epoll_wait → fd 다시 반환  ← 조건이 지속되는 한 계속 알림
```

- `poll()`과 동일한 의미론. drop-in 교체 가능
- 블로킹/논블로킹 소켓 모두 사용 가능
- 안전하고 이벤트 손실 위험이 적음

**Edge-Triggered (ET, `EPOLLET` 플래그)**

```
소켓 버퍼: [░░░░░░░░░░]  (비어있음)
패킷 도착 → [████████░░]  ← 상태 전이 발생!
epoll_wait → fd 반환
read(100 bytes)
소켓 버퍼: [███░░░░░░░]  (아직 데이터 남음)
epoll_wait → fd 반환하지 않음  ← 새로운 상태 전이가 없으므로
```

- **EAGAIN이 나올 때까지 반복해서 read/write해야 함**. 안 하면 데이터가 소켓 버퍼에 남아서 연결이 멈춤
- 논블로킹 소켓 필수
- `epoll_wait` wakeup 횟수가 줄어 고부하에서 처리량 향상
- nginx 등 고성능 서버가 사용

### 벤치마크

libevent 저자 Niels Provos의 벤치마크와 OLS 2004 논문(University of Waterloo, Brecht et al.)이 대표적이다.

OLS 2004 논문의 테스트 방법론:
- 활성 연결 수를 고정하고, **비활성(idle) 연결**을 0에서 60,000까지 증가
- epoll은 비활성 연결 수와 무관하게 **일정한 성능**
- select와 poll은 비활성 연결이 늘수록 **급격히 성능 저하**

```
이벤트 처리 시간 (비활성 연결 증가 시)

시간 │
     │  select ╱
     │        ╱
     │  poll ╱         ← 비활성 연결에 비례하여 악화
     │      ╱
     │     ╱
     │    ╱
     │   ╱  ────────── epoll (일정)
     └──────────────────── 비활성 연결 수
          0   10K  20K  30K  40K  50K  60K
```

교차 지점은 대략 **동시 연결 수백 개**. 그 이하에서는 select/poll도 충분하다.

---

## 다른 OS들의 해결책

### kqueue (BSD, 2000)

**Jonathan Lemon**이 만들어 FreeBSD 4.1(2000년 7월)에 도입했다. epoll보다 **2년 먼저** 나왔다.

```c
int kqueue(void);  // 커널 이벤트 큐 생성
int kevent(int kq, const struct kevent *changelist, int nchanges,
           struct kevent *eventlist, int nevents,
           const struct timespec *timeout);
```

epoll 대비 장점: `kevent()` 한 번의 호출로 **변경 등록과 이벤트 수신을 동시에** 할 수 있다. epoll은 `epoll_ctl` + `epoll_wait` 두 번 호출해야 한다.

또한 소켓뿐 아니라 파일, 타이머, 시그널, 프로세스까지 감시할 수 있어 범용성이 높다. macOS, FreeBSD, OpenBSD, NetBSD에서 사용 가능.

### IOCP (Windows, 1994)

**Windows NT 3.5**에서 도입. epoll/kqueue와 근본적으로 다른 **Proactor 패턴**을 사용한다.

```
Reactor (epoll/kqueue):
  "I/O 준비되면 알려줘 → 내가 I/O 수행"
  
Proactor (IOCP):
  "I/O 시작할게 → 완료되면 알려줘"
  ↑ 커널이 I/O를 대신 수행
```

IOCP는 완료 포트 객체에 소켓/파일 핸들을 연결하고, 비동기 I/O가 완료되면 완료 패킷을 큐에 넣는다. 스레드 풀이 이 패킷을 꺼내 처리한다. 커널이 동시 실행 스레드 수를 제어하여 컨텍스트 스위치를 최소화한다.

### 비교 요약

| 특성 | select | poll | epoll | kqueue | IOCP |
|------|--------|------|-------|--------|------|
| **등장 연도** | 1983 | 1987 | 2002 | 2000 | 1994 |
| **플랫폼** | 전체 | 대부분 Unix | Linux 전용 | BSD/macOS | Windows |
| **모델** | Reactor | Reactor | Reactor | Reactor | Proactor |
| **시간 복잡도** | O(n) | O(n) | O(k) | O(k) | O(1) |
| **fd 제한** | 1024 | 없음 | 없음 | 없음 | 없음 |
| **커널 상태 유지** | 없음 | 없음 | 있음 | 있음 | 있음 |

---

## 실제 프레임워크들의 선택

이론은 이론이고, 실제 고성능 프로젝트들은 어떤 메커니즘을 사용할까?

| 프로젝트 | I/O 멀티플렉싱 | 비고 |
|----------|---------------|------|
| **nginx** | epoll(Linux), kqueue(BSD/macOS) | 단일 스레드 워커, 이벤트 드리븐 |
| **Redis** | ae.c 추상화: epoll > kqueue > evport > select | 우선순위 기반 자동 선택 |
| **Node.js** | libuv: epoll/kqueue/IOCP | 크로스 플랫폼 추상화 계층 |
| **Java NIO** | Selector: epoll(Linux), kqueue(macOS), poll(fallback) | `java.nio.channels.Selector` |
| **Netty** | NioEventLoop 또는 EpollEventLoop(Linux JNI) | JNI 직접 epoll이 Selector보다 빠름 |
| **Go** | netpoll: epoll(Linux), kqueue(BSD/macOS) | 고루틴 스케줄러와 통합 |
| **Python asyncio** | selectors 모듈: epoll > kqueue > poll > select | `DefaultSelector`가 최선 선택 |
| **Rust (Tokio)** | mio: epoll/kqueue/IOCP | mio가 저수준 추상화 담당 |
| **curl** | poll() 기본, select() 폴백 | 이식성 우선 |

패턴이 보인다. **모든 현대 프레임워크는 추상화 계층을 두고, 플랫폼별로 최적의 메커니즘을 자동 선택한다.** Redis의 ae.c, Node.js의 libuv, Python의 selectors 모듈이 같은 전략이다.

---

## io_uring — 다음 세대 (2019)

### 탄생 배경

**Jens Axboe**(Meta 커널 개발자)가 Linux 5.1(2019년 5월)에 도입했다. 동기: NVMe SSD가 수백만 IOPS에 도달하면서, **시스템콜 오버헤드 자체**가 병목이 되었다.

epoll도 `epoll_wait()` 호출마다 시스템콜이 발생한다. 초당 백만 번의 이벤트를 처리하면 백만 번의 컨텍스트 스위치. io_uring은 이 마지막 병목을 제거한다.

### 동작 원리

```
유저 스페이스                     커널
┌──────────────┐              ┌──────────────┐
│ Submission   │  ← mmap() → │              │
│ Queue (SQ)   │   공유 메모리  │  커널이       │
│              │              │  SQ 소비      │
│ [SQE][SQE]   │              │              │
└──────────────┘              │              │
                              │              │
┌──────────────┐              │  커널이       │
│ Completion   │  ← mmap() → │  CQ 생산      │
│ Queue (CQ)   │   공유 메모리  │              │
│              │              │              │
│ [CQE][CQE]   │              └──────────────┘
└──────────────┘

SQE: Submission Queue Entry (요청)
CQE: Completion Queue Entry (완료)
```

- 유저 스페이스가 SQ에 요청을 추가
- `io_uring_enter()` 한 번으로 배치 제출 (또는 폴링 모드에서는 **시스템콜 없이**)
- 커널이 완료 시 CQ에 결과 적재
- 유저 스페이스가 CQ에서 결과 소비

### epoll과의 차이

| 특성 | epoll | io_uring |
|------|-------|----------|
| **대상** | 네트워크 I/O 전용 | 네트워크 + 디스크 + 타이머 통합 |
| **시스템콜** | 매 이벤트 루프마다 | 배치 제출, 폴링 모드에서 0 |
| **복사** | ready 이벤트 복사 | 공유 메모리로 제로카피 |
| **모델** | Reactor (준비 알림) | Proactor (완료 알림) |

벤치마크에서 io_uring 폴링 모드는 **170만 4K IOPS**(Linux AIO 60만 대비 약 3배)를 달성했다.

### 보안 우려

2023년 Google은 자사 버그 바운티에 보고된 Linux 커널 익스플로잇 42건 중 **60%가 io_uring 취약점**이었다고 밝혔다 (io_uring 관련 바운티만 약 $1M). Google은 ChromeOS, Android, 프로덕션 서버에서 io_uring을 **비활성화**했다.

io_uring은 사실상 많은 커널 서브시스템을 새로운 코드 경로로 재구현하기 때문에 공격 표면이 넓다. 보안 강화 작업이 계속되고 있지만, 순수 네트워크 이벤트 통지에는 여전히 epoll이 더 단순하고 검증된 선택이다.

---

## 정리

### 왜 select()로 시작했나

- 1983년에는 프로세스당 fd 20개. 비트맵이 합리적이었다
- 모든 플랫폼에서 동작하는 유일한 I/O 멀티플렉싱 API
- Mac OS X의 poll()은 2005년까지 깨져 있었고, Windows는 2007년까지 poll()이 없었다

### 왜 지금은 epoll을 쓰는가

- 동시 연결 수만~수십만이 일상
- 커널에 상태를 유지하여 매 호출마다 목록을 다시 보내지 않음
- O(k)로 활성 이벤트만 처리
- Linux 서버 전용이면 이식성 걱정 불필요

### 연대표

```
1983  select()       4.2BSD        — 20개 fd면 충분하던 시대
1987  poll()         SVR3          — FD_SETSIZE 제거, 여전히 O(n)
1994  IOCP           Windows NT    — Proactor 모델의 선구자
1999  C10K 문제      Dan Kegel     — 소프트웨어가 하드웨어를 못 따라감
2000  kqueue         FreeBSD 4.1   — 첫 O(1) Reactor
2002  epoll          Linux 2.5.44  — 리눅스의 C10K 해답
2019  io_uring       Linux 5.1     — 시스템콜마저 제거
```

돌아보면, **각 시대의 API는 그 시대의 제약 조건에 최적이었다.** select()가 나쁜 설계가 아니라, 40년 동안 세상이 바뀐 것이다.

---

## 참고 자료

- [A brief history of select(2) — popcount.org](https://idea.popcount.org/2016-11-01-a-brief-history-of-select2/)
- [The C10K problem — Dan Kegel](http://www.kegel.com/c10k.html)
- [Comparing and Evaluating epoll, select, and poll — OLS 2004](https://www.kernel.org/doc/ols/2004/ols2004v1-pages-215-226.pdf)
- [poll vs select vs event-based — Daniel Stenberg](https://daniel.haxx.se/docs/poll-vs-select.html)
- [epoll(7) — Linux manual page](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [Understanding Epoll in Linux Kernel — Server.HK](https://server.hk/blog/understanding-epoll-in-linux-kernel-a-deep-dive-into-efficient-i-o-multiplexing/)
- [Kqueue: A generic and scalable event notification facility — Jonathan Lemon](https://people.freebsd.org/~jlemon/papers/kqueue.pdf)
- [What is io_uring? — Lord of the io_uring](https://unixism.net/loti/what_is_io_uring.html)
- [Google Restricting io_uring — Phoronix](https://www.phoronix.com/news/Google-Restricting-IO_uring)
