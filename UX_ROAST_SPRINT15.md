# UX ROAST - Sprint 15

**Blog:** https://doodoo3804.github.io  
**Date:** 2026-04-03  
**Analyst:** UX Roaster (Tech Blog Reader Perspective)  
**Method:** Code-level analysis of `_layouts/`, `_includes/`, `css/custom.css`, `js/`

---

## Executive Summary

이 블로그는 **기술적으로 잘 만들어진 개인 블로그**다. Dark mode, TOC, Copy button, Related Posts, Search, Reading progress bar 등 "있어야 할 것"은 거의 다 갖추고 있다. 하지만 **기술 블로그로서의 습관 형성(Habit Loop)** 관점에서 보면, "다시 와야 하는 이유"를 독자에게 충분히 전달하지 못하고 있다.

전체 25개 포스트, 잘 정리된 시리즈 구조, 탄탄한 코드 품질. 문제는 UX가 아니라 **UX 전략의 부재**다.

---

## I. 첫 인상 3초 분석

### 랜딩 경험 (index.html)

| 요소 | 판정 | 비고 |
|------|------|------|
| Author Hero | Good | 타이핑 애니메이션 + 소셜 링크. "누구의 블로그인지" 즉시 파악 가능 |
| Quick Links (3장) | Good | Algorithms, Kotlin, About 직행 가능 |
| Featured Post Hero | OK | 최신 글이 고정되어 있음. 하지만 항상 첫 번째 글만 Featured |
| Scroll Indicator | Minor Issue | "Scroll" 텍스트 + 화살표. 2026년에 scroll indicator는 noise에 가까움 |
| Category Filter Bar | Good | 태그 필터, 잘 동작. 빈 상태 처리도 됨 |
| Post Cards Grid | Good | 2열 그리드, gradient thumbnail, hover 효과 |

**3초 판정:** "개발자 블로그구나" + "백엔드/알고리즘" 즉시 인지. **이탈 유발 요소 낮음.**
단, "이 블로그가 나에게 왜 유용한지"는 3초 안에 전달되지 않음.

---

## II. 이슈 목록 (Severity 순)

### [Critical] C1. 구독/알림 CTA 완전 부재

**문제:** RSS 아이콘이 네비게이션 바에 있지만, 어떤 페이지에서도 "이메일 구독", "뉴스레터", "알림 받기" 같은 CTA가 없다. Footer에도 없다. 포스트 하단에도 없다.

**영향:**
- 시니어 개발자(페르소나 2)가 좋은 글을 발견해도 "다음 글이 나오면 알려줘"를 설정할 방법이 RSS뿐
- RSS 아이콘은 `nav.html:34`에 `<i class="fa fa-rss">` 하나뿐. 대부분의 독자는 인지하지 못함
- RSS를 쓰는 개발자 비율은 점점 줄고 있음

**레퍼런스 비교:**
- **Hashnode:** 포스트 하단에 "Follow" 버튼 + 이메일 구독 위젯
- **Dev.to:** 작성자 프로필 카드에 "Follow" 버튼, 알림 시스템
- **Medium:** 포스트 하단 + 중간에 "Follow" CTA

**개선 방향:**
- 포스트 하단(Related Posts 직전)에 "Subscribe via RSS" or "Follow on GitHub" 미니 CTA 배치
- Footer에 뉴스레터 구독 폼 또는 RSS 설명 텍스트 추가
- Author Hero에 RSS 링크를 소셜 링크 옆에 명시적으로 추가

---

### [Critical] C2. Featured Post가 항상 최신 1개 고정

**문제:** `index.html:60`에서 `{% assign featured = site.posts.first %}`로 무조건 최신 글이 Featured.

**영향:**
- 모든 방문에서 동일한 Featured Post. 재방문자에게 "새로운 게 없다"는 인상
- 실제로 가장 중요한/인기 있는 글이 Featured되는 게 아님
- 새 글을 안 쓰면 수개월간 같은 Featured Post가 노출됨

**레퍼런스 비교:**
- **Hashnode:** 에디터가 선택한 Featured Post 또는 인기 글
- **Notion Blog:** 수동 큐레이션 가능

**개선 방향:**
- `_config.yml`에 `featured_post` 필드 추가하여 수동 지정 가능하게
- 또는 front matter에 `featured: true` 플래그 도입

---

### [Major] M1. 포스트 진입 후 "다음 액션" 흐름이 약함

**문제:** 포스트를 끝까지 읽은 독자의 흐름:
1. Share 버튼 (Copy Link, Twitter, LinkedIn)
2. Previous/Next 네비게이션 (시간 순서)
3. Related Posts (최대 3개)
4. Comments (Giscus)
5. Featured Tags (사이드바)

이 순서가 **독자의 관심 순서와 맞지 않음**.

**영향:**
- Share 버튼이 Related Posts보다 먼저 나옴. 독자는 공유하기 전에 "더 읽을 게 있나" 확인하고 싶음
- Previous/Next는 시간 순이라 주제와 무관한 글로 연결될 수 있음
- Related Posts 아래에 "이 시리즈의 다른 글"이나 "이 주제의 전체 글 보기" CTA 없음

**레퍼런스 비교:**
- **Medium:** 글 끝 → Author Bio → Related → Comments. Share는 floating
- **Dev.to:** Related → Comments → Read Next

**개선 방향:**
- 포스트 하단 순서 조정: Series Nav → Related Posts → Share → Comments
- Share 버튼은 이미 모바일 floating bar (`mobile-share-bar`)가 있으므로, 고정 Share 섹션의 위치를 Related 아래로

---

### [Major] M2. 모바일 Copy 버튼 사용성

**문제:** `css/custom.css:629`에서 Copy 버튼은 `opacity: 0`이고 `pre:hover .copy-btn`에서만 `opacity: 1`이 됨.

**영향:**
- 모바일에서는 `:hover`가 없으므로, **코드 블록을 탭해야** Copy 버튼이 나타남
- 그러나 코드 블록을 탭하면 텍스트 선택이 시작됨 (경쟁 인터랙션)
- 첫 방문 모바일 독자(페르소나 3)는 Copy 버튼의 존재를 모를 가능성 높음

**레퍼런스 비교:**
- **Dev.to:** Copy 버튼 항상 visible
- **Hashnode:** Copy 버튼 항상 visible, 우측 상단 고정

**개선 방향:**
```css
/* 모바일에서 Copy 버튼 항상 표시 */
@media (hover: none) {
    .copy-btn { opacity: 0.7; }
}
```

---

### [Major] M3. 검색 → 포스트 → 관련글 내비게이션 단절

**문제:** 구글 검색으로 포스트에 진입한 독자(페르소나 1)의 흐름:

1. 구글 → 포스트 직접 진입
2. 포스트 상단에 Breadcrumb은 시리즈가 2개 이상일 때만 표시 (`post.html:29`)
3. 블로그의 다른 콘텐츠를 탐색할 방법이 포스트 내에서 제한적

**영향:**
- 시리즈가 아닌 단독 포스트에서는 breadcrumb 없음
- Header에 tag 링크가 있지만 (`intro-header.html`), 스크롤 후에는 다시 올라가야 접근 가능
- Footer의 Featured Tags는 포스트 하단 사이드바에 있지만 모바일에서는 매우 아래에 위치

**개선 방향:**
- 모든 포스트에 Breadcrumb 표시: `Blog > [Category] > [Title]`
- Related Posts 아래에 "Browse more [tag] posts" 링크 추가

---

### [Major] M4. 카테고리 필터 바의 태그 폭발 가능성

**문제:** `index.html:96-109`에서 모든 태그를 동적으로 버튼으로 생성.

**영향:**
- 현재 태그가 소수라 괜찮지만, 포스트 수가 늘면 필터 바가 2-3줄로 확장
- 각 버튼의 padding이 `7px 18px`이므로 모바일에서 3줄 이상이면 콘텐츠를 가림
- 태그별 포스트 수가 표시되지 않아, 클릭 전에 "이 태그에 글이 있는지" 모름

**레퍼런스 비교:**
- **Dev.to:** 태그 옆에 포스트 수 표시
- **Hashnode:** 인기 태그 상위 5-6개만 노출 + "More" 옵션

**개선 방향:**
- `_config.yml`의 `featured-condition-size` 설정을 활용하여 최소 2개 이상 포스트 있는 태그만 노출
- 태그 옆에 포스트 수 badge 추가: `Algorithm (4)`

---

### [Major] M5. 폰트 가독성 - 줄 길이(Measure) 과다

**문제:** 포스트 레이아웃이 `col-lg-8` (Bootstrap 3, ~66.67% width). 컨테이너 최대 폭이 1170px이므로 포스트 영역은 약 780px.

- `font-size: 16.5px`, `line-height: 1.85`는 적절
- 하지만 780px 너비에서 한 줄당 약 **85-90 영문자**, 한글 약 **45-50자** 가능

**영향:**
- 영문 기준 이상적 줄 길이는 60-75자. 현재 약간 넘음
- 한글은 35-40자가 이상적이므로 약간 넓지만 수용 범위 내
- TOC 사이드바가 있는 `col-lg-8`은 실질적으로 더 좁아지므로 큰 문제는 아닐 수 있음

**개선 방향:**
- `post-container`에 `max-width: 720px` 추가하여 줄 길이 제한
- 또는 `font-size`를 17px로 올려 자연스럽게 줄 길이 줄이기

---

### [Minor] m1. Scroll Indicator ("Scroll" + 화살표)

**문제:** `index.html:82-87` + `css/custom.css:291-318`

**영향:** 2026년 기준으로 스크롤 인디케이터는 불필요. 모든 사용자가 스크롤을 알고 있음. 시니어 개발자(페르소나 2)에게는 "이 블로그가 나를 초보 취급한다"는 느낌을 줄 수 있음.

**개선 방향:** 제거 권장. Hero 영역이 뷰포트 전체를 차지하지 않으므로 콘텐츠가 이미 보임.

---

### [Minor] m2. Giscus 댓글 로딩 타임아웃 9초

**문제:** `_includes/comments.html`에서 9초 타임아웃 후 에러 UI 표시.

**영향:**
- 느린 네트워크(3G)에서는 9초 이내 로딩 실패 가능
- 모바일 데이터(페르소나 3)에서 불필요한 에러 경험
- 댓글은 페이지 하단이므로 lazy load가 더 적절

**개선 방향:**
- 타임아웃 15초로 확대
- 또는 IntersectionObserver로 댓글 영역이 뷰포트에 진입할 때 로딩 시작

---

### [Minor] m3. 포스트 카드 `post-card-excerpt` 120자 고정 truncate

**문제:** `index.html:135`에서 `truncate:120`. Liquid의 `truncate`는 바이트가 아닌 문자 단위이지만, 한글과 영문이 섞이면 시각적 길이 차이 발생.

**영향:**
- 한글 120자는 꽤 긴 excerpt (약 4줄)
- 영문 120자는 약 2줄
- 카드 높이가 콘텐츠에 따라 들쑥날쑥

**개선 방향:**
- CSS `-webkit-line-clamp: 3`으로 시각적 일관성 확보 (Related Posts에서는 이미 사용 중: `custom.css:891`)

---

### [Minor] m4. Previous/Next 포스트 제목 55자 truncate

**문제:** `post.html:96`에서 `truncate:55`. 한글 55자면 거의 전체 제목이 나오지만, 긴 영문 제목은 잘림.

**영향:** 미미. 하지만 truncate 대신 CSS `text-overflow: ellipsis`가 반응형에 더 유연.

---

### [Minor] m5. Author Hero "Last updated" 타임스탬프

**문제:** `index.html:32`에서 `site.time | date: "%B %Y"`. 이것은 **사이트 빌드 시간**이지 마지막 포스트 작성 시간이 아님.

**영향:**
- 빌드만 다시 하면 "Last updated: April 2026"이 되어 실제 업데이트가 없었더라도 최신으로 보임
- 독자를 오도할 수 있음

**개선 방향:**
- `site.posts.first.date`로 교체하여 실제 마지막 포스트 날짜 표시
- 또는 "Last post: [date]"로 명칭 변경

---

### [Minor] m6. 404 페이지 터미널 UI의 하드코딩 색상

**문제:** `css/custom.css:1094`에서 `color: #24292f` (GitHub light 텍스트 색상)가 하드코딩.

**영향:** Dark mode에서 404 검색 결과 텍스트와 Recent Posts 링크가 `#24292f`(어두운 색)로, 다크 배경에서 가독성 문제. 다크 모드 override가 있긴 하지만 (`css/custom.css:1237-1264`), 일부 요소가 빠져 있을 수 있음.

**개선 방향:** `var(--text-primary)` 토큰 사용으로 통일.

---

### [Minor] m7. Mobile Share Bar 진입 조건

**문제:** `js/custom.js:305`에서 스크롤 15% 이상에서 표시, 푸터 근처에서 숨김.

**영향:**
- 짧은 포스트에서는 거의 즉시 나타나서 방해가 될 수 있음
- 긴 포스트에서는 적절하게 동작

**개선 방향:** 최소 스크롤 거리(예: 500px) 조건 추가.

---

## III. 페르소나별 판정

### 페르소나 1: 구글 검색으로 처음 유입된 백엔드 주니어 개발자

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| 포스트 가독성 | 8/10 | Inter + JetBrains Mono 조합 우수. line-height 1.85 적절 |
| 코드블록 경험 | 7/10 | Language label + line number + copy 버튼 모두 있음. 모바일 copy 발견 어려움 |
| TOC 사용성 | 8/10 | Desktop sticky sidebar 우수. Mobile TOC toggle 존재. 최소 2개 heading부터 표시 |
| "이 사람 다른 글도 볼까" 유도 | 5/10 | Related Posts는 있으나, 태그 기반 탐색이 포스트 내에서 약함 |
| 시리즈 연결 | 7/10 | Series Nav 존재하고 current 표시. 하지만 시리즈 아닌 글에서는 없음 |
| 재방문 동기 | 4/10 | 구독 CTA 없음. RSS만 있고 눈에 안 띔 |

**종합:** "좋은 글이었다. 근데 다시 올 이유를 못 만들어줬다."

---

### 페르소나 2: RSS/소셜로 구독하는 시니어 개발자

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| 콘텐츠 밀도 | 6/10 | 25개 포스트. 시니어가 기대하는 깊이(심화 사례, 벤치마크)는 UX가 아닌 콘텐츠 영역 |
| 기술적 신뢰감 | 8/10 | 코드 품질, 다크모드, PWA 등 "이 사람 프론트엔드도 할 줄 안다" 전달 |
| 피드 가독성 | 7/10 | RSS feed.xml 존재. 카테고리 필터로 관심 주제 필터 가능 |
| 검색 경험 | 8/10 | `/` 단축키, 키보드 네비게이션, 하이라이트. 시니어에게 익숙한 패턴 |
| Noise 수준 | 9/10 | 광고 없음, 팝업 없음, 깔끔. **이건 큰 장점** |

**종합:** "깔끔하고 꽤 괜찮은데, 내 RSS 리더에 넣을 만큼 글이 자주 올라오나?"

---

### 페르소나 3: 모바일로 빠르게 훑는 독자

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| 모바일 로딩 | 8/10 | Gradient header (이미지 없음), deferred scripts, lazy loading |
| 터치 타겟 | 7/10 | Back-to-top 44px, mobile TOC toggle 45px. 카테고리 버튼 padding `7px 18px`은 약간 작음 |
| 모바일 네비게이션 | 7/10 | 햄버거 메뉴 동작. 하지만 메뉴 항목 간 간격이 좁을 수 있음 |
| 모바일 TOC | 7/10 | 우측 하단 floating 버튼. 패널 max-height 60vh. Escape 닫기 지원 |
| 모바일 Share | 7/10 | Floating bar (Copy + Twitter). 하지만 LinkedIn 없음 |
| 스크롤 중 방해 요소 | 9/10 | Reading progress bar는 얇고(3px) 방해되지 않음. 광고/팝업 없음 |
| 코드블록 | 5/10 | Copy 버튼 hover only → 모바일에서 발견 어려움. 긴 코드 가로 스크롤 필요 |

**종합:** "읽기 편한데, 코드 복사가 좀 불편하고, 이 블로그를 '저장'할 방법이 마땅치 않다."

---

## IV. 레퍼런스 대비 비교

| 항목 | 이 블로그 | Medium | Dev.to | Hashnode | Notion Blog |
|------|-----------|--------|--------|----------|-------------|
| 구독 CTA | RSS만 (숨김) | Follow + Subscribe | Follow + 알림 | Follow + Newsletter | N/A |
| 검색 | Client-side, `/` 단축키 | 서버 검색 | 서버 검색 | 서버 검색 | 없음 |
| 다크 모드 | 완벽 (FOUC 방지) | 있음 | 있음 | 있음 | 제한적 |
| 코드블록 | Label + Line # + Copy | 기본 | Label + Copy (항상 visible) | Label + Copy (항상 visible) | 기본 |
| TOC | Desktop sidebar + Mobile panel | 없음 | 없음 | 있음 | 있음 |
| Related Posts | Tag 기반 3개 | 알고리즘 추천 | 태그 기반 | AI 추천 | 없음 |
| 광고/Noise | 없음 | 많음 | 약간 | 약간 | 없음 |
| Reading Progress | 있음 | 있음 | 없음 | 있음 | 없음 |
| 시리즈 | Tag 기반 자동 그룹핑 | 없음 | Series 기능 | Series 기능 | 수동 |

**밀리는 곳:**
1. **구독/Follow 체계** — Medium, Dev.to, Hashnode 모두 대비 완전히 부재
2. **검색 정교함** — 25개 글이면 OK이나, 서버사이드 대비 fuzzy matching 약함
3. **소셜 증거** — 조회수, 좋아요, 댓글 수가 카드에 없음 (Dev.to의 핵심 동기 부여 요소)

**이기는 곳:**
1. **Noise 제로** — 광고, 팝업, 로그인 유도 없음. **개발자가 가장 원하는 읽기 경험**
2. **다크 모드 완성도** — FOUC 방지, Giscus 연동, 토글 애니메이션까지
3. **코드블록 총체적 경험** — Language label + line number + copy + left accent border
4. **TOC 구현** — Desktop sticky + Mobile panel. Medium, Dev.to에는 없는 기능
5. **404 페이지** — 터미널 UI는 독창적이고 개발자 타겟에 적합

---

## V. 스크롤 중 방해 요소 분석

| 요소 | 방해 수준 | 판정 |
|------|-----------|------|
| Reading Progress Bar (3px, top) | 매우 낮음 | Pass |
| Mobile Share Bar (하단 floating) | 낮음 | 15% 이후 표시, 푸터 근처 숨김. 적절 |
| Mobile TOC Toggle (우하단) | 낮음 | 45px 원형 버튼. Back-to-top과 겹치지 않도록 offset 설정됨 |
| Back-to-Top (우하단) | 낮음 | 300px 이후 표시. mobile TOC 있으면 위로 80px offset |
| Lightbox (이미지 클릭) | 없음 | 의도적 클릭 시에만 활성. 좋음 |
| 팝업/배너/광고 | 없음 | **최대 장점** |

**판정: 스크롤 방해 요소 거의 없음.** 이건 이 블로그의 핵심 경쟁력이다.

---

## VI. TOC / Copy Button / Related Posts 사용성 상세

### TOC (Table of Contents)

**Desktop (`side-catalog`):**
- `position: sticky; top: 80px` — 네비바 아래 고정. 잘 동작
- IntersectionObserver로 현재 섹션 하이라이트
- h3 들여쓰기 (`padding-left: 24px`) — 계층 구조 표현
- `max-height: calc(100vh - 100px)` + `overflow-y: auto` — 긴 TOC 스크롤 가능
- Collapse/Fold 토글 가능

**Mobile (`mobile-toc-panel`):**
- 우하단 45px 원형 버튼
- 패널: `width: min(260px, calc(100vw - 40px))`, `max-height: 60vh`
- Escape 키 닫기, 외부 클릭 닫기
- `aria-expanded` 상태 관리

**이슈:** 없음. TOC는 이 블로그의 **가장 완성도 높은 기능** 중 하나.

### Copy Button

**데스크톱:** `pre:hover`에서 우측 상단에 나타남. Clipboard API + fallback. "Copied!" 피드백 1.5초.
**모바일:** `:hover` 없으므로 발견 어려움. **[Major] M2 참조.**

### Related Posts

**매칭 알고리즘:** 시리즈 > 태그 2개 이상 겹침 > 태그 1개 > 같은 카테고리. 잘 설계됨.
**카드 UI:** Tag + Title + Excerpt(80자, 2-line clamp) + Date. 전체 카드 클릭 가능.
**그리드:** 1열(모바일) → 2열(768px) → 3열(992px). 적절.

**이슈:** excerpt 80자가 짧아 카드가 높이가 낮을 수 있음. 하지만 일관성 측면에서 나쁘지 않음.

---

## VII. 최종 판정: "이 블로그를 북마크할 이유가 있는가?"

### 북마크 할 이유 (YES)

1. **Noise-free 읽기 경험** — 광고, 팝업, 로그인 강제 없음. 개발 블로그의 이상적 형태
2. **시리즈 구조** — 같은 주제의 글을 순서대로 읽을 수 있음
3. **코드 경험** — Language label, line number, copy button, syntax highlighting 모두 갖춤
4. **다크 모드** — 밤에 코딩하다가 참고할 때 눈이 편함
5. **검색** — `/` 단축키로 빠르게 검색 가능
6. **모바일 최적화** — 출퇴근길에 읽기 좋은 수준

### 북마크 안 할 이유 (NO)

1. **구독 수단 부재** — 북마크해도 새 글이 나왔는지 알 방법이 없음
2. **콘텐츠 업데이트 빈도 불투명** — "이 블로그가 살아있는가?" 신호가 약함
3. **차별화 포인트 불명확** — "백엔드 개발 블로그"는 많음. "이 블로그만의 시각"이 UX에서 전달되지 않음
4. **25개 포스트** — 아카이브가 아직 얇아서 "레퍼런스 사이트"로는 부족

### 최종 등급

```
┌──────────────────────────────────────┐
│                                      │
│   북마크 가능성:  ★★★☆☆ (3/5)       │
│   재방문 가능성:  ★★☆☆☆ (2/5)       │
│   추천 가능성:    ★★★☆☆ (3/5)       │
│                                      │
│   종합: "좋은 블로그인데,            │
│          다시 올 이유를 만들어야 한다" │
│                                      │
└──────────────────────────────────────┘
```

**한 줄 요약:** 기술 구현은 Hashnode급, 하지만 독자 리텐션 전략은 정적 사이트의 한계에 머물러 있다. **구독 CTA, Featured Post 큐레이션, 모바일 Copy 버튼 개선**이 Sprint 15의 핵심 타겟이 되어야 한다.

---

## Appendix: Issue Summary Table

| ID | Severity | Issue | File Reference |
|----|----------|-------|----------------|
| C1 | Critical | 구독/알림 CTA 완전 부재 | nav.html:34, footer.html, post.html |
| C2 | Critical | Featured Post 항상 최신 1개 고정 | index.html:60 |
| M1 | Major | 포스트 하단 흐름 순서 부적절 (Share > Related) | post.html:77-109 |
| M2 | Major | 모바일 Copy 버튼 hover-only | custom.css:629, custom.js:172 |
| M3 | Major | 검색→포스트→관련글 내비게이션 단절 | post.html:27-38 |
| M4 | Major | 카테고리 필터 태그 폭발 가능성 | index.html:96-109 |
| M5 | Major | 포스트 줄 길이(measure) 과다 | custom.css:73-76 |
| m1 | Minor | 불필요한 Scroll Indicator | index.html:82-87, custom.css:291 |
| m2 | Minor | Giscus 타임아웃 9초 (느린 네트워크) | comments.html |
| m3 | Minor | Excerpt 120자 고정 truncate | index.html:135 |
| m4 | Minor | Prev/Next 제목 55자 truncate | post.html:96 |
| m5 | Minor | "Last updated" = 빌드 시간 | index.html:32 |
| m6 | Minor | 404 검색 결과 하드코딩 색상 | custom.css:1094, 1120 |
| m7 | Minor | Mobile Share Bar 짧은 글에서 즉시 표시 | custom.js:305 |
