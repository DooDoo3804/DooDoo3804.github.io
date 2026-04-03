# QA Report — Sprint 16

**Date:** 2026-04-03
**Reviewer:** QA Agent
**Scope:** Reading Progress Bar, Series Nav Redesign, --text-base Fix, CSS Token Migration, GoatCounter + Build Optimization

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Major | 7 |
| Minor | 10 |

---

## Critical

### C1. `prefers-reduced-motion` 미대응 — 사이트 전역
- **File:** `css/custom.css` (전체)
- **Problem:** `@media (prefers-reduced-motion: reduce)` 선언이 **전혀 없다.** Reading Progress Bar의 `transition: width 0.1s linear` (line 1674), post-card hover의 `transform` transition (line 369-371), author-hero mesh 애니메이션 (line 183-191) 등 모든 애니메이션/트랜지션이 motion sensitivity 사용자에게 그대로 노출된다.
- **Impact:** WCAG 2.1 Level AA (2.3.3) 위반. 전정기관 장애 사용자 접근 불가.
- **Fix:**
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

---

## Major

### M1. Series frontmatter 누락 — React 시리즈 불완전
- **File:** `_posts/react/2023-08-04-how-to-use-react-in-jekyll-app.md`
- **Problem:** `series:` frontmatter가 없다. 동일 카테고리의 `2026-04-01-react-hooks-deep-dive.md`는 `series: "React"`가 있다. React 시리즈가 1편으로만 표시되어 `series_posts.size > 1` 조건(post.html:58)에 의해 시리즈 내비가 아예 렌더링되지 않는다.
- **Impact:** React 시리즈 내비게이션 완전 미작동.
- **Fix:** `_posts/react/2023-08-04-how-to-use-react-in-jekyll-app.md`에 `series: "React"` 추가.

### M2. Series nav에 `<nav>` 시맨틱 태그 및 aria-label 없음
- **File:** `_layouts/post.html:66`
- **Problem:** Series 내비게이션이 `<div class="series-nav">`로 구현됨. `<nav aria-label="시리즈 내비게이션">` 이어야 한다. 스크린리더가 이 영역을 네비게이션 랜드마크로 인식하지 못한다.
- **Impact:** 접근성 — 스크린리더 사용자가 시리즈 내비를 탐색 불가.
- **Fix:** `<div class="series-nav">` → `<nav class="series-nav" aria-label="Series navigation">`로 교체. 닫는 태그도 `</nav>`로.

### M3. Reading Progress Bar — `aria-hidden` 미설정
- **File:** `_layouts/post.html:10`
- **Problem:** `<div id="reading-progress-bar"></div>`에 `aria-hidden="true"`가 없다. 이 요소는 순수 시각적 장식이지만 스크린리더가 빈 div를 탐색한다.
- **Fix:** `<div id="reading-progress-bar" aria-hidden="true"></div>`

### M4. `#e0e0e0` 하드코딩 — 다크모드 미대응 border
- **File:** `css/custom.css:1913`, `css/custom.css:3407`, `css/custom.css:3564`
- **Problem:** `#tag_cloud .tag-button` (line 1913), `.share-btn` (line 3407), `.projects-filter-btn` (line 3564)의 `border: 1px solid #e0e0e0`가 하드코딩. 다크모드에서 이 라이트 그레이 테두리가 다크 배경과 어울리지 않는다. `[data-theme="dark"]` 오버라이드가 tag-button과 projects-filter-btn에 **없다.**
- **Impact:** 다크모드에서 tag cloud 버튼과 projects filter 버튼의 border가 라이트모드 색상 그대로 노출.
- **Fix:** `#e0e0e0` → `var(--border-medium)`. 또는 다크모드 오버라이드 추가.

### M5. `#eee` 하드코딩 — projects-filter border
- **File:** `css/custom.css:3558`
- **Problem:** `.projects-filter { border-bottom: 1px solid #eee; }` — 다크모드 대응 없음.
- **Impact:** 다크모드에서 하단 구분선이 라이트 그레이로 표시.
- **Fix:** `#eee` → `var(--border-light)`.

### M6. `#28a745` 하드코딩 — `--color-success` 토큰 미사용
- **File:** `css/custom.css:3429`, `css/custom.css:3431`, `css/custom.css:4647`
- **Problem:** `.share-btn--copied`와 `.mobile-share-btn--copied`에서 `#28a745`를 하드코딩. `:root`에 `--color-success: #2ea043`이 이미 정의되어 있고, 다크모드에는 `--color-success: #3fb950`이 있다. 토큰을 쓰지 않아 다크모드에서 success 색상이 라이트 값(#28a745)으로 고정된다.
- **Impact:** 다크모드 시각적 불일치. 디자인 시스템 토큰 무시.
- **Fix:** `#28a745` → `var(--color-success)`.

### M7. `custom.min.css` 동기화 불확실 — 빌드 파이프라인 미자동화
- **File:** `css/custom.min.css`, `Gruntfile.js`
- **Problem:** `custom.min.css`는 `grunt cssmin`으로 수동 빌드해야 한다. 현재 파일 타임스탬프가 source와 14초 차이로 빌드 직후 상태이나, CI/CD에 grunt 빌드 단계가 없으면 배포 시 stale minified CSS가 올라갈 수 있다. `package.json`에 `build` 스크립트가 없다.
- **Impact:** 배포 시 소스 변경사항이 minified CSS에 반영되지 않을 위험.
- **Fix:** `package.json`에 `"build": "grunt"` 스크립트 추가. CI/GitHub Actions에서 빌드 단계 포함.

---

## Minor

### m1. Series frontmatter 인용부호 불일치
- **File:** `_posts/db/2026-03-25-postgresql-index.md:8`, `_posts/system-design/2026-03-28-caching-strategy.md:8`
- **Problem:** `series: Database` (인용부호 없음) vs `series: "Database"` (인용부호 있음). YAML 파서는 동일하게 처리하지만, 코드 일관성 위반. 향후 시리즈명에 특수문자가 포함되면 파싱 오류 발생 가능.
- **Fix:** 전체 포스트의 series 값을 쌍따옴표로 통일.

### m2. `#1f2937` 하드코딩 — pager hover
- **File:** `css/custom.css:1555`
- **Problem:** `[data-theme="dark"] .pager li > a:hover { background: #1f2937; }` — 다크모드 전용이지만 토큰이 아닌 하드코딩. `--bg-surface-raised`(`#161b22`)와 다른 값이라 의도적일 수 있으나 디자인 시스템 밖의 값.
- **Fix:** 토큰화 검토. hover 전용 surface 토큰(`--bg-surface-hover`) 추가 고려.

### m3. `#484f58` 하드코딩 — placeholder/separator 색상
- **File:** `css/custom.css:1209`, `css/custom.css:1222`, `css/custom.css:4743`
- **Problem:** 다크모드 placeholder, breadcrumb separator 색상이 하드코딩. `--text-tertiary`(`#6e7681`)와도 다른 값.
- **Fix:** 다크모드 전용 placeholder 토큰 또는 `--text-tertiary` 사용.

### m4. `#aaa` 하드코딩 — breadcrumb separator
- **File:** `css/custom.css:4700`
- **Problem:** `.post-breadcrumb li:not(:last-child)::after { color: #aaa; }` — 라이트모드 전용이지만 토큰 미사용.
- **Fix:** `var(--text-muted)` 또는 `var(--text-secondary)`.

### m5. `#3fb950` 하드코딩 — `--color-success` 토큰 중복
- **File:** `css/custom.css:934`, `css/custom.css:3862`
- **Problem:** `.prompt` 색상과 dark 프로젝트 badge에서 `#3fb950` 직접 사용. 이미 `[data-theme="dark"]`에서 `--color-success: #3fb950` 토큰이 존재.
- **Fix:** `var(--color-success)` 사용.

### m6. Accent 색상 하드코딩 — gradient 내
- **File:** `css/custom.css:412`, `css/custom.css:424`, `css/custom.css:4249`
- **Problem:** `.post-card-thumb--gradient` 등에서 `#0085a1`, `#00b4d8`를 직접 사용. `--accent-gradient` 토큰이 존재하지만 미사용.
- **Fix:** 가능한 곳은 `var(--accent-gradient)` 사용. 개별 gradient는 category-specific이므로 감수할 수 있으나, 기본 gradient는 토큰 활용 권장.

### m7. GoatCounter — placeholder 상태에서 HTML 코멘트 노출
- **File:** `_includes/analytics.html:3`
- **Problem:** `goatcounter.code == "REPLACE_WITH_YOUR_CODE"`일 때 HTML 주석이 소스에 노출된다: `<!-- [GoatCounter] code is still a placeholder... -->`. 보안 위험은 아니나 불필요한 정보 노출.
- **Fix:** 주석 삭제하거나 `enabled: false` 시 렌더링 자체를 건너뛰도록 (현재 `enabled: false`이므로 실제 노출 안됨 — 향후 enabled: true + placeholder 조합 시 노출).

### m8. `#0d1117` 하드코딩 — subscribe CTA hover
- **File:** `css/custom.css:5275`
- **Problem:** `[data-theme="dark"] .subscribe-cta-github:hover { color: #0d1117; }` — `--bg-body`(`#0d1117`)와 동일 값이지만 토큰 미사용.
- **Fix:** `var(--bg-body)`.

### m9. `#333` fallback — mobile TOC toggle
- **File:** `css/custom.css:1697`
- **Problem:** `color: var(--text-base, #333)` — fallback에 `#333` 사용. 라이트모드 `--text-base`는 `#1a1a2e`이므로 fallback과 불일치. CSS 변수 미지원 브라우저(IE11)에서만 해당되지만 정확한 fallback이 아님.
- **Fix:** fallback을 `#1a1a2e`로 교체하거나, IE11 미지원이면 fallback 제거.

### m10. Reading Progress Bar — 극단적으로 짧은 포스트 동작
- **File:** `js/custom.js:210-211`
- **Problem:** `scrollHeight - clientHeight`이 0에 가까운 짧은 포스트에서 미세 스크롤에도 bar가 100%로 점프. `docHeight > 0` 체크는 있지만, `docHeight < 100` 같은 threshold에서 bar를 숨기는 로직이 없다.
- **Impact:** 시각적으로 어색하나 기능 파손은 아님.
- **Fix:** `if (docHeight < 50) { bar.style.display = 'none'; return; }` 추가 고려.

---

## Passed (문제 없음)

| 항목 | 결과 |
|------|------|
| Reading Progress Bar HTML 삽입 | OK — `post.html:10` |
| Reading Progress Bar JS `requestAnimationFrame` 사용 | OK — scroll 성능 최적화 |
| Reading Progress Bar 가로 스크롤 미발생 | OK — `position:fixed; width: 0%~100%` 범위, `Math.min(100)` |
| Series nav `page.series` 기반 전환 | OK — 태그 기반 로직 완전 제거 확인 |
| Series nav 1편 포스트 숨김 | OK — `series_posts.size > 1` (post.html:58) |
| Series nav series 미설정 포스트 | OK — `{% if page.series %}` guard (post.html:51) |
| `--text-base` 라이트모드 값 | OK — `#1a1a2e` (충분한 명암비) |
| `--text-base` 다크모드 값 | OK — `#c9d1d9` |
| `var(--text-base)` 23곳 전수 사용 | OK |
| GoatCounter localhost 제외 | OK — `analytics.html:7` |
| GoatCounter placeholder 체크 | OK — `analytics.html:2` |
| `head.html` → `custom.min.css` 참조 | OK — line 221, 비minified 중복 로드 없음 |
| `grunt-contrib-cssmin` 설정 | OK — `package.json` + `Gruntfile.js` |
| Grunt watch → cssmin 연동 | OK — `Gruntfile.js:68-74` |
| `:focus-visible` 전역 스타일 | OK — `css/custom.css:3481` |

---

## 하드코딩 색상 잔존 전체 목록 (토큰화 대상)

| Line | Value | Context | Suggested Token |
|------|-------|---------|-----------------|
| 1555 | `#1f2937` | dark pager hover | `--bg-surface-hover` (new) |
| 1209, 1222 | `#484f58` | dark placeholder | `--text-tertiary` |
| 1913, 3407, 3564 | `#e0e0e0` | border | `var(--border-medium)` |
| 3558 | `#eee` | border | `var(--border-light)` |
| 3429, 3431, 4647 | `#28a745` | success | `var(--color-success)` |
| 4700 | `#aaa` | separator | `var(--text-muted)` |
| 4743 | `#484f58` | dark separator | `var(--text-tertiary)` |
| 934, 3862 | `#3fb950` | dark success | `var(--color-success)` |
| 5275 | `#0d1117` | dark bg | `var(--bg-body)` |

Brand colors (Twitter `#0f1419`, LinkedIn `#0a66c2`/`#378fe9`) and decorative terminal dots (`#ff5f57`, `#febc2e`, `#28c840`) are excluded — hardcoding acceptable.

---

*End of QA Report — Sprint 16*
