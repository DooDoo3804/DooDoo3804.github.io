# Design Review — Sprint 15

**Reviewer:** Design Critic Agent  
**Date:** 2026-04-03  
**Target:** https://doodoo3804.github.io  
**Reference:** Josh Comeau, Lee Robinson, Overreacted, Vercel Blog, Stripe Blog, Linear Blog

---

## Executive Summary

전체적으로 체계적인 디자인 시스템(CSS 변수, 토큰, 다크 모드)이 갖춰져 있고, 코드블록 UX(복사 버튼, 언어 라벨, 라인 넘버)와 접근성(ARIA, 키보드 네비게이션)은 레퍼런스 블로그 대비 경쟁력이 있다. 그러나 **타이포그래피 계층 구조 부재**, **과잉 장식 요소**, **Bootstrap 3 의존성으로 인한 레이아웃 경직성**이 전체적인 현대적 인상을 깎아먹고 있다.

---

## [Critical] Issues — 즉시 수정 권장

### C1. 타이포그래피 계층 구조 붕괴

**현재 상태:**
- `.post-container`의 h1/h2/h3에 `font-size` 미지정 (브라우저 기본값 상속)
- 브라우저 기본: h1 ~33px, h2 ~25px, h3 ~19px (16.5px base 기준)
- LESS에서 h4: `22px`, h5/h6: `20px`
- **결과: h4(22px)가 h3(~19px)보다 크다** — 계층 역전

**레퍼런스 대비:**
| 요소 | 이 블로그 | Josh Comeau | Overreacted | Lee Robinson |
|------|----------|-------------|-------------|--------------|
| h1   | ~33px (implicit) | 40-48px | 40px | 36px |
| h2   | ~25px (implicit) | 28-32px | 28px | 30px |
| h3   | ~19px (implicit) | 22-24px | 22px | 24px |
| body | 16.5px | 18px | 18-20px | 16px |

**개선 방향:**
```css
.post-container h1 { font-size: 2rem; }    /* 32px */
.post-container h2 { font-size: 1.625rem; } /* 26px */
.post-container h3 { font-size: 1.375rem; } /* 22px */
.post-container h4 { font-size: 1.125rem; } /* 18px */
```
명확한 감소 리듬(1.25 ratio scale)을 적용할 것. 모든 heading에 명시적 `font-size` 선언 필수.

---

### C2. Serif 혼용 부재 — 2025~2026 트렌드 미반영

**현재 상태:** 전체 Inter(sans-serif) 단일 서체. `Lora`를 가져오지만 메타데이터에만 사용(hux-blog.less 참고).

**트렌드:** Josh Comeau, Stripe Blog, Linear Blog 모두 heading이나 강조 영역에 serif를 혼용. 특히 h1이나 hero 타이틀에 serif를 사용하면 개성과 격조를 동시에 얻을 수 있다.

**개선 방향:**
- 포스트 제목(h1)이나 featured post hero에 `'Newsreader'`, `'Source Serif 4'`, `'Playfair Display'` 등 serif 적용
- 혹은 `.intro-header h1`에만 serif를 사용해 대비 효과 생성
- body text는 Inter 유지 (가독성 우수)

---

### C3. 콘텐츠 본문 `line-height` 1.85 — 과도하게 넓음

**현재:** `.post-container { line-height: 1.85; }`

**레퍼런스 기준:**
- Josh Comeau: 1.65
- Overreacted: 1.7
- Lee Robinson: 1.7
- Vercel Blog: 1.6

1.85는 한글 콘텐츠에서도 지나치게 넓어 읽기 흐름이 끊긴다. 특히 코드 설명 같은 기술 문서에서는 밀도감이 중요하다.

**개선 방향:** `line-height: 1.7` 또는 `1.72` 권장. 한글 특성 감안해도 1.75 이하가 적절.

---

## [Major] Issues — Sprint 내 수정 권장

### M1. Accent Color 남용 — "Accent Fatigue"

`--accent-primary (#0085a1)`이 사용되는 곳:
- 포스트 카드 상단 gradient bar (::before)
- 코드블록 좌측 3px 보더
- blockquote 좌측 보더
- 시리즈 네비게이션 좌측 보더
- 카테고리 버튼 active 상태
- 태그 pill 배경
- 인라인 코드 텍스트 색상 + 보더
- back-to-top 버튼 배경
- reading progress bar
- TOC active 상태
- 히어로 아바타 shadow
- 링크 hover 색상
- 카드 hover 보더
- ...총 20곳 이상

**레퍼런스 대비:** Overreacted는 accent 색상을 링크와 hover에만 사용. Lee Robinson은 accent 없이 grayscale 중심. Josh Comeau는 다양한 색상을 쓰되 각각의 맥락이 다르다.

**개선 방향:**
- accent를 **인터랙티브 요소(링크, 버튼, active 상태)**에만 한정
- 코드블록 좌측 보더 → 제거하거나 `var(--border-medium)` 사용
- 카드 상단 gradient bar → 제거 (카드에 이미 gradient thumbnail이 있음)
- 인라인 코드 → neutral color (예: `#555` + light gray background)

---

### M2. 포스트 카드 Hover 효과 과잉

**현재:**
```css
.post-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12),
                0 4px 12px rgba(var(--accent-color-raw), 0.08);
    border-color: rgba(var(--accent-color-raw), 0.35);
}
```

- `translateY(-6px)`: 과도한 lift. 카드가 "튀어나오는" 느낌.
- 40px blur shadow: 매우 공격적.
- 거기에 accent-tinted border까지.

**레퍼런스 대비:**
- Vercel Blog: hover시 `box-shadow: 0 4px 8px rgba(0,0,0,0.04)` 수준
- Lee Robinson: hover시 border-color만 변경
- Overreacted: 카드 없음 (리스트 형태)

**개선 방향:**
```css
.post-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
```
Subtle is sophisticated.

---

### M3. 타이핑 애니메이션 + Scroll 인디케이터 — 구시대 패턴

**타이핑 애니메이션** (`author-hero-typing`):
- "Backend Developer" → "Kotlin & Java Enthusiast" 등 순환
- 80ms/char 타이핑, 35ms/char 삭제, 2s 딜레이
- **2019~2020년 트렌드.** 2025~2026 레퍼런스 블로그 중 타이핑 애니메이션을 사용하는 곳은 없음.

**Scroll 인디케이터** (bouncing arrow):
- 2016~2018년 랜딩 페이지에서 유행
- Josh Comeau, Lee Robinson, Overreacted 어디에도 없음

**개선 방향:**
- 타이핑 애니메이션 → 정적 텍스트로 교체 (간결한 한 줄 소개)
- Scroll 인디케이터 → 완전 제거. 콘텐츠가 보이면 자연스럽게 스크롤함.

---

### M4. Box Shadow 과다 (15종 이상)

시스템 내 확인된 box-shadow 변형:
1. `0 2px 5px rgba(0,0,0,0.26)` — paper shadow z1
2. `0 6px 20px rgba(0,0,0,0.19)` — paper shadow z2
3. `0 16px 40px rgba(0,0,0,0.12)` — card hover
4. `0 3px 10px rgba(accent, 0.3)` — back-to-top
5. `0 6px 16px rgba(accent, 0.4)` — back-to-top hover
6. `0 4px 12px rgba(0,0,0,0.15)` — mobile TOC panel
7. `0 2px 6px rgba(0,0,0,0.3)` — mobile TOC toggle
8. `0 4px 20px rgba(accent, 0.2)` — hero avatar
9. `0 2px 8px rgba(accent, 0.25)` — category button hover
10. `0 20px 60px rgba(0,0,0,0.3)` — error terminal
11. `0 6px 16px rgba(0,0,0,0.08)` — related post hover
12. `0 4px 10px rgba(accent, 0.25)` — tag pill hover
13. `0 5px 10px 2px rgba(0,0,0,0.2)` — mobile navbar
14. `0 0 0 3px rgba(accent, 0.12)` — focus ring
15. (다크모드 변형 별도)

**레퍼런스 대비:** Overreacted = shadow 0개. Lee Robinson = 1~2개. Linear Blog = 2~3개 통일된 elevation.

**개선 방향:** Shadow를 3단계로 정리:
```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
```
모든 컴포넌트가 이 3개 중 하나만 사용하도록 통일.

---

### M5. 카드 상단 Gradient Accent Bar (::before 3px)

```css
.post-card::before {
    content: '';
    height: 3px;
    background: var(--accent-gradient);
}
```

카드에 이미 16:9 gradient thumbnail이 있는데, 그 위에 3px gradient bar가 또 있다. 시각적 노이즈.

- Linear Blog, Vercel Blog: accent bar 없음
- Stripe Blog: accent bar 없음

**개선 방향:** `::before` accent bar 제거. 카테고리 구분은 gradient thumbnail 색상으로 충분.

---

### M6. 인라인 코드 스타일 과장

**현재:**
```css
.post-container code {
    background: rgba(var(--accent-color-raw), 0.08);
    color: var(--accent-primary);
    border: 1px solid rgba(var(--accent-color-raw), 0.2);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 13px;
}
```

accent 배경 + accent 텍스트 + accent 보더 = 인라인 코드가 강조 배지처럼 보임. 기술 블로그에서 인라인 코드는 문장 안에서 자연스럽게 녹아들어야 한다.

**레퍼런스:**
- Josh Comeau: `background: hsl(45, 100%, 90%)`, 보더 없음
- Overreacted: `background: rgba(0,0,0,0.05)`, 보더 없음
- Lee Robinson: `background: #f1f1f1`, 보더 없음

**개선 방향:**
```css
.post-container code {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text-primary);
    border: none;
    padding: 2px 6px;
}
```

---

### M7. Bootstrap 3 레이아웃 제약

`.col-lg-8.col-lg-offset-2` 패턴으로 콘텐츠 폭이 **~750px**로 고정. 이 자체는 적절하지만:
- 코드블록이 넓은 코드에서 horizontal scroll 발생
- 이미지가 본문 폭을 넘어 확장될 수 없음 (Josh Comeau의 "full bleed" 패턴 불가)
- 12-column offset 기반 레이아웃이 유연성을 제한

**개선 방향 (장기):**
- Bootstrap 의존 제거, CSS Grid/Flexbox 기반 레이아웃으로 전환
- 코드블록과 이미지에 `breakout` 클래스 도입 (본문보다 넓게)
```css
.post-container .breakout {
    margin-left: -80px;
    margin-right: -80px;
    width: calc(100% + 160px);
}
```

---

## [Minor] Issues — 점진적 개선

### m1. 본문 `font-size: 16.5px` — 어중간한 값

16px 또는 17px이 표준. 0.5px 단위는 서브픽셀 렌더링 이슈를 유발할 수 있다.  
**개선:** `17px` 또는 `1.0625rem`으로 반올림.

---

### m2. SNS 링크 Font Awesome Stack 패턴 — 구식

```html
<span class="fa-stack fa-lg">
    <i class="fa fa-circle fa-stack-2x"></i>
    <i class="fa fa-github fa-stack-1x fa-inverse"></i>
</span>
```
아이콘 위에 원형 배경을 겹치는 패턴은 Font Awesome 4 시절(2015~2017) 패턴.

**레퍼런스:** Josh Comeau, Lee Robinson 모두 단순 SVG 아이콘 사용.

**개선:** `fa-stack` 제거, 단순 아이콘 + hover 효과로 교체.

---

### m3. 다크 모드 전환 `transition` 없음 (body-level)

`head.html`에 body 전환 CSS가 있지만:
```css
body { transition: background-color 0.3s ease, color 0.3s ease; }
```
카드, 보더, 코드블록 등 **개별 컴포넌트에 color/background transition이 없어** 토글 시 일부 요소가 즉시 변경됨.

**개선:** 주요 컴포넌트에 `transition: background-color 0.3s, color 0.3s, border-color 0.3s` 추가하거나, `* { transition: background-color 0.3s, color 0.3s, border-color 0.3s; }` (성능 주의) 적용.

---

### m4. Copy 버튼 hover 시에만 표시 — 터치 디바이스 미고려

```css
.copy-btn { opacity: 0; }
pre:hover .copy-btn { opacity: 1; }
```
모바일/태블릿에서는 hover가 없으므로 복사 버튼이 보이지 않음.

**개선:**
```css
@media (hover: none) {
    .copy-btn { opacity: 0.7; }
}
```

---

### m5. Reading Progress Bar 높이 `3px` — 존재감 미약하거나 과하거나

3px는 레퍼런스 대비 적절하지만, gradient 배경(`--accent-gradient`)이 attention-grabbing. 단색이 더 조용하다.

**개선:** `background: var(--accent-primary)` 단색으로 변경.

---

### m6. 카테고리 Gradient 클래스 하드코딩

```css
.post-card-thumb--algorithm { background: linear-gradient(135deg, #1a73e8 0%, #4fc3f7 100%); }
.post-card-thumb--kotlin { background: linear-gradient(135deg, #7b2ff7 0%, #b388ff 100%); }
.post-card-thumb--react { background: linear-gradient(135deg, #00b4d8 0%, #90e0ef 100%); }
```
새 카테고리 추가 시 CSS 수정 필요. 확장성이 낮다.

**개선:** CSS 변수로 카테고리 색상을 관리하거나, inline style로 gradient 주입.

---

### m7. `h2::before` 구분선 — 이중 시각 단서

```css
.post-container h2::before {
    content: " ";
    border-bottom: 1px solid #ececec;
    margin-top: 44px;
    margin-bottom: 30px;
}
```
h2의 기본 `margin-top: 50px`에 더해 `::before`로 44px+30px 추가 = **총 ~124px의 간격**. 과도한 여백으로 읽기 흐름이 끊긴다.

**레퍼런스:** Josh Comeau는 h2 위에 구분선 없이 `margin-top: 64px`만. Overreacted는 `margin-top: 40px`만.

**개선:** `h2::before` 제거하고, `margin-top: 2.5em` (41px)으로 통일. 혹은 유지하되 margin을 대폭 줄일 것.

---

### m8. `letter-spacing: 1px` 네비게이션

```css
.nav li a { text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
```
`1px`은 12px 텍스트에서 `0.083em` — 너무 넓다. Modern convention은 `0.04~0.06em`.

**개선:** `letter-spacing: 0.05em`으로 줄일 것.

---

## Trend Checklist (2025~2026)

| 기준 | 상태 | 비고 |
|------|------|------|
| 넓은 여백, 큰 타이포 | **Partial** | 여백은 과도할 정도이나 heading 크기가 작음 |
| Serif 혼용 | **Fail** | 전체 Sans-serif (Inter) |
| 코드블록 디자인 | **Good** | 복사 버튼, 언어 라벨, 라인 넘버 모두 구현 |
| 다크/라이트 전환 부드러움 | **Partial** | body는 되지만 개별 컴포넌트 깜빡임 있음 |
| 스크롤 집중도 (읽기 흐름) | **Partial** | typing animation, scroll indicator가 방해 |
| 미니멀과 개성 균형 | **Over-decorated** | shadow 15종, accent bar, gradient bar 등 과잉 |
| 컬러 팔레트 일관성 | **Fail** | Accent 색상 20곳 이상 남용 |
| 타이포 계층구조 | **Fail** | h3 < h4 역전, 명시적 크기 미지정 |
| 카드 여백 밀도 | **OK** | `24px 28px` padding 적절 |
| 촌스러운 패턴 | **Several** | typing anim, scroll arrow, fa-stack, 과한 hover |

---

## Scoring (100점 만점)

| 항목 | 점수 | 비고 |
|------|------|------|
| Typography | 45/100 | 계층 역전, serif 부재, line-height 과도 |
| Color System | 60/100 | 토큰 체계 우수하나 accent 남용 |
| Layout & Spacing | 65/100 | Bootstrap 3 한계, 카드 간격 적절 |
| Code Blocks | 85/100 | 레퍼런스급 UX. 좌측 보더만 제거 |
| Dark Mode | 72/100 | FOUC 방지 우수, 전환 애니메이션 부족 |
| Interactions | 55/100 | hover 과잉, 구식 애니메이션 |
| Accessibility | 82/100 | ARIA, 키보드 지원 우수 |
| Modernity | 50/100 | typing anim, scroll indicator, fa-stack |
| **Total** | **64/100** | |

---

## 한 줄 판정

> **"체계적 디자인 시스템 위에 2019년 장식이 덮여 있다. 토큰과 다크 모드 인프라는 2026년 수준이지만, 시각적 표현은 Medium-era 블로그에서 벗어나지 못했다. 빼기의 미학이 필요하다."**

---

## Priority Matrix

```
           높은 임팩트
               │
   C1(타이포)  │  M1(accent 남용)
   C2(serif)   │  M2(hover 과잉)
               │  M4(shadow 정리)
  ─────────────┼──────────────── 높은 노력
               │
   C3(line-ht) │  M7(Bootstrap 탈피)
   M5(bar제거) │
   M6(inline)  │
               │
           낮은 임팩트
```

**Quick Wins (높은 임팩트 + 낮은 노력):**
1. C1 — heading font-size 명시 (CSS 5줄)
2. C3 — line-height 1.85 → 1.7 (CSS 1줄)
3. M5 — 카드 accent bar 제거 (CSS 삭제)
4. M6 — 인라인 코드 스타일 수정 (CSS 3줄)
5. M3 — typing animation + scroll indicator 제거 (HTML/JS 삭제)
