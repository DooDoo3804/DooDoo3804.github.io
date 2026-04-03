# QA Report — Sprint 16 Round 2

**Date:** 2026-04-03
**Reviewer:** QA Agent
**Scope:** Round 1 수정 검증 + 신규 이슈 발굴

---

## Round 1 수정 검증 결과

| ID | 항목 | 결과 | 비고 |
|----|------|------|------|
| C1 | `prefers-reduced-motion` 미디어쿼리 추가 | PASS | `custom.css:5314` — 전역 `*` 셀렉터로 animation/transition 무력화 |
| M1 | React 포스트 `series: "React"` 추가 | PASS | `_posts/react/2023-08-04-...md:10` |
| M2 | Series nav `<nav aria-label>` 변경 | PASS | `post.html:66` — `<nav class="series-nav" aria-label="Series navigation">` |
| M3 | Reading progress bar `aria-hidden="true"` | PASS | `post.html:10` |
| M4 | `#e0e0e0` → `var(--border-medium)` | PASS | grep 결과 0건 |
| M5 | `#eee` → `var(--border-light)` | PASS | grep 결과 0건 |
| M6 | `#28a745` → `var(--color-success)` | PASS | grep 결과 0건, `var(--color-success)` 9회 사용 |
| M7 | `package.json` build 스크립트 | PASS | `"build": "grunt"` (line 21) |
| m1 | Series frontmatter 인용부호 통일 | PASS | 전체 25개 포스트 `"..."` 통일 확인 |
| m2 | `#1f2937` → 토큰화 | PASS | `--bg-surface-hover: #1f2937` 변수 정의에만 존재 |
| m3 | `#484f58` → 토큰화 | PASS | grep 결과 0건 |
| m4 | `#aaa` → 토큰화 | PASS | grep 결과 0건 |
| m5 | `#3fb950` → 토큰화 | PASS | `--color-success: #3fb950` 변수 정의에만 존재 |
| m6 | Accent 하드코딩 | PARTIAL | gradient 내 `#0085a1`, `#00b4d8` 잔존 (lines 414, 426 등) — R1에서 decorative 허용 판정 |
| m7 | GoatCounter placeholder 코멘트 | N/A | `enabled: false` 상태이므로 미노출 |
| m8 | `#0d1117` subscribe CTA | PASS | `var(--bg-body)` 사용 (line 5277) |
| m9 | `#333` fallback | PASS | 변수 정의에만 존재 (`--text-primary: #333`, line 14) |
| m10 | 짧은 포스트 progress bar | PASS | `docHeight < 50` threshold 존재 (`custom.js:211`) |
| `custom.min.css` 동기화 | PASS | 89KB, `prefers-reduced-motion` / `--bg-surface-hover` (3회) / `--border-light` (70회) / `--color-success` (9회) 모두 source와 일치 |

**검증 결과: 17 PASS / 1 PARTIAL (허용) / 1 N/A — Round 1 수정 사항 전량 적용 확인**

---

## 신규 발견 이슈

### Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Major | 4 |
| Minor | 6 |

---

## Critical

### C1-NEW. `localStorage` 미보호 — 전체 JS 초기화 실패 위험
- **File:** `js/custom.js:12, 19, 61` / `_includes/head.html:225`
- **Problem:** `localStorage.getItem()` / `setItem()`이 try-catch 없이 호출된다. Safari 구버전 private browsing, storage quota 초과, 일부 WebView 컨텍스트에서 `localStorage` 접근 시 예외가 발생한다. `custom.js`의 `initDarkMode()`는 IIFE 내부 line 320에서 `DOMContentLoaded` 전에 호출되므로, 여기서 예외가 발생하면 **IIFE 전체가 중단**된다.
- **Impact:** dark mode 토글, back-to-top, copy 버튼, reading progress bar, share 버튼 등 **모든 JS 기능이 초기화되지 않는다.** `head.html` 인라인 스크립트도 동일 문제.
- **Fix:**
```js
// custom.js
function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch(e) { return null; }
}
function storeTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch(e) { /* silent */ }
}

// head.html inline
(function(){try{var t=localStorage.getItem('doodoo-blog-theme')}catch(e){}; ...})();
```

---

## Major

### M1-NEW. `prefers-reduced-motion` 블록에 `scroll-behavior: auto` 누락
- **File:** `css/custom.css:5314-5320`
- **Problem:** C1 수정으로 `animation-duration`과 `transition-duration`은 무력화했으나, `html { scroll-behavior: smooth; }` (line 124)는 **그대로 유지**된다. `scroll-behavior`는 CSS transition/animation이 아닌 별도 속성이므로, 현재 `prefers-reduced-motion` 블록으로는 해제되지 않는다. Back-to-top 버튼(`window.scrollTo({ behavior: 'smooth' })`), 앵커 링크 등에서 smooth scroll이 계속 작동한다.
- **Impact:** WCAG 2.3.3 — 전정기관 장애 사용자에게 smooth scroll 모션 노출.
- **Fix:**
```css
@media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    /* existing rules... */
}
```

### M2-NEW. `head.html` 인라인 CSS `--text-secondary` 토큰값 불일치
- **File:** `_includes/head.html:205` vs `css/custom.css:16`
- **Problem:** head.html 인라인 critical CSS에서 `--text-secondary: #888`로 정의하지만, custom.css에서는 `--text-secondary: #767676`이다. 페이지 로드 시 `--text-secondary`를 사용하는 요소가 `#888`으로 먼저 렌더링된 후 external CSS 로드 완료 시 `#767676`으로 전환된다.
- **Impact:** FOUC (Flash of Unstyled Content) — `#888` (#888 on #fff = 3.54:1)은 **WCAG AA 미달**. 외부 CSS 로드 전 수백ms 동안 접근성 기준 미충족 텍스트가 노출된다.
- **Fix:** `head.html:205`의 `--text-secondary: #888` → `--text-secondary: #767676`으로 동기화.

### M3-NEW. Lightbox 이미지 — 키보드 활성화 불가 + role 누락
- **File:** `_layouts/post.html:219-221`
- **Problem:** post content 이미지에 `tabindex="0"`을 부여해 키보드 포커스는 가능하지만:
  1. `role="button"` 없음 — 스크린리더가 이미지를 "clickable"로 인식하지 못함
  2. `keydown` 핸들러 없음 — Enter/Space 키로 lightbox를 열 수 없음 (click 이벤트만 존재)
- **Impact:** 키보드 전용 사용자가 이미지 lightbox에 접근 불가. WCAG 2.1.1 위반.
- **Fix:**
```js
// post.html lightbox script 내 img.addEventListener('click', ...) 직후
img.setAttribute('role', 'button');
img.setAttribute('aria-label', (img.alt || 'Image') + ' — click to enlarge');
img.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
    }
});
```

### M4-NEW. GoatCounter localhost 체크 — `0.0.0.0` / `::1` 미포함
- **File:** `_includes/analytics.html:7`
- **Problem:** `location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'`만 체크한다. `jekyll serve --host 0.0.0.0`으로 개발 시 hostname이 `0.0.0.0`이 되고, IPv6 loopback `::1`도 미체크. 로컬 개발 환경에서 analytics가 발송되어 프로덕션 데이터가 오염될 수 있다.
- **Fix:**
```js
var devHosts = ['localhost','127.0.0.1','0.0.0.0','::1',''];
if (devHosts.indexOf(location.hostname) === -1) {
```

---

## Minor

### m1-NEW. Post card thumbnail gradient — 다크모드 오버라이드 없음
- **File:** `css/custom.css:414, 418, 422, 426`
- **Problem:** `.post-card-thumb--gradient`, `--algorithm`, `--kotlin`, `--react` 클래스의 gradient 배경이 라이트모드 전용 색상으로 하드코딩. `[data-theme="dark"]` 오버라이드가 없어 다크모드에서도 동일한 밝은 gradient가 표시된다.
- **Impact:** 다크모드 시각적 부조화 (기능 문제 아님).
- **Fix:** 다크모드에서 gradient의 밝기를 낮추는 오버라이드 추가, 또는 `opacity: 0.85` 등으로 톤다운.

### m2-NEW. Reading progress bar / lightbox z-index 충돌
- **File:** `css/custom.css:1675, 4938`
- **Problem:** `#reading-progress-bar`와 `.lightbox-overlay` 모두 `z-index: 9999`. lightbox 오픈 시 progress bar(2px 높이)가 lightbox 위에 겹칠 수 있다.
- **Fix:** lightbox z-index를 `10000`으로 올리거나, progress bar를 `9998`로 낮추기. 또는 lightbox 오픈 시 progress bar를 `display: none` 처리.

### m3-NEW. Dark mode toggle `animationend` — reduced-motion fallback 없음
- **File:** `js/custom.js:49-53`
- **Problem:** `.toggling` 클래스 추가 후 `animationend` 이벤트로 제거. `prefers-reduced-motion` 환경에서 `animation-duration: 0.01ms`이므로 대부분 브라우저에서 이벤트가 발생하지만, 일부 브라우저가 near-zero duration 애니메이션을 최적화(skip)하면 이벤트 미발생 → `.toggling` 클래스 잔존 가능.
- **Fix:** `setTimeout(600)` fallback 추가:
```js
var fallback = setTimeout(function() { toggle.classList.remove('toggling'); }, 600);
toggle.addEventListener('animationend', function handler() {
    clearTimeout(fallback);
    toggle.classList.remove('toggling');
}, { once: true });
```

### m4-NEW. Series nav — 장편 시리즈 UI overflow 미대응
- **File:** `css/custom.css:702-706`
- **Problem:** `.series-list`에 `max-height`/`overflow-y` 없음. 현재 최대 시리즈는 5편이라 문제 없으나, 20편 이상 시리즈 작성 시 목록이 과도하게 길어져 본문을 밀어냄.
- **Fix:** `max-height: 400px; overflow-y: auto;` 추가, 또는 8편 이상 시 accordion collapse 처리.

### m5-NEW. `--text-muted` 명암비 — AA 경계값
- **File:** `css/custom.css:15` (정의), 30+ 사용처
- **Problem:** 라이트모드 `--text-muted: #6c757d` on `--bg-surface: #fff` = **4.69:1**. WCAG AA 최소 기준 4.5:1을 간신히 통과(마진 0.19). 14px 이하 텍스트에서 체감 대비가 부족할 수 있다. AAA (7:1) 미달.
- **Impact:** 접근성 경계 사례. 기술적으로는 AA PASS이나 anti-aliasing, sub-pixel 렌더링에 따라 체감 미달 가능.
- **Fix:** `#6c757d` → `#5a6268` (약 5.5:1) 또는 `#495057` (약 7.0:1, AAA) 고려.

### m6-NEW. `analytics.html` `s.async = true` 불필요
- **File:** `_includes/analytics.html:9`
- **Problem:** `document.createElement('script')`로 동적 생성된 스크립트는 HTML 스펙상 기본적으로 async. `s.async = true` 설정은 중복이다.
- **Impact:** 기능 문제 없음. 코드 정리 수준.
- **Fix:** `s.async = true;` 라인 삭제.

---

## Passed (Round 2 재확인 — 문제 없음)

| 항목 | 결과 |
|------|------|
| `custom.min.css` ↔ `custom.css` 동기화 | OK — 89,120 bytes, 토큰 사용 횟수 일치 (`--border-light` 70회, `--bg-surface-hover` 3회, `--color-success` 9회) |
| `prefers-reduced-motion` + Reading Progress Bar JS | OK — CSS가 transition-duration을 0.01ms로 만들어 JS의 `bar.style.width` 업데이트가 즉시 snap. 추가 JS 처리 불필요 |
| Series frontmatter 전체 통일 | OK — 25개 포스트 전량 `"..."` 인용부호 사용 |
| 모든 포스트 `description:` frontmatter 존재 | OK — 25개 전량 확인 |
| `:focus-visible` 전역 규칙 | OK — `custom.css:3483`에 전역 `*:focus-visible` 정의 |
| `transition: all` 안티패턴 | OK — 전체 CSS에 `transition: all` 0건 |
| Copy button innerHTML XSS | OK — 정적 문자열만 저장/복원, 사용자 입력 미관여 |
| Mobile share bar scroll 성능 | OK — rAF + ticking flag + layout read-only 패턴. 강제 reflow 우려 없음 |

---

## 전체 현황

| 라운드 | Critical | Major | Minor | 총계 |
|--------|----------|-------|-------|------|
| R1 발견 | 1 | 7 | 10 | 18 |
| R1 수정 적용 | 1 | 7 | 9 | 17 (m6 허용) |
| R2 신규 발견 | 1 | 4 | 6 | 11 |
| **잔존 이슈** | **1** | **4** | **6** | **11** |

---

*End of QA Report — Sprint 16 Round 2*
