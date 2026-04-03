# QA Report — Sprint 14

**Date:** 2026-04-03
**Reviewer:** QA Agent
**Scope:** `js/custom.js`, `js/toc.js`, `_includes/related-posts.html`, `css/custom.css`, `_layouts/post.html`, `_includes/footer.html`

---

## Critical

### C-01. `updateUtterancesTheme()` 호출 — 함수 미정의
- **파일:** `js/custom.js:67`
- **문제:** OS 테마 변경 리스너 내에서 `updateUtterancesTheme(newTheme)`을 호출하지만, 이 함수는 코드베이스 어디에도 정의되어 있지 않음. `localStorage`에 수동 테마가 저장되지 않은 상태에서 OS 다크모드가 토글되면 **`ReferenceError`** 발생, 이후 `updateToggleIcon` 등 후속 로직도 중단됨.
- **수정 방향:** `updateGiscusTheme(newTheme)` 으로 교체하거나, 함수를 삭제 (Utterances에서 Giscus로 마이그레이션 시 잔여 코드로 추정).

### C-02. Copy 버튼 텍스트가 복사 내용에 포함됨
- **파일:** `js/custom.js:179-180`
- **문제:** `pre` 안에 `<code>`가 없으면 `pre.textContent`로 폴백하는데, Copy 버튼 자체가 `pre`의 자식이므로 버튼 텍스트 "Copy" 또는 "✓ Copied!"가 복사 내용에 포함됨. `<code>` 없는 `<pre>` 블록(예: Jekyll highlight 없이 직접 작성한 코드)에서 재현.
- **수정 방향:** `code ? code.textContent : pre.querySelector('.copy-btn') ? pre.textContent.replace(/Copy$|✓ Copied!$/, '').trimEnd() : pre.textContent` 또는 Copy 버튼을 `pre` 외부 wrapper로 이동.

### C-03. `fallbackCopy()` 실패 시 사용자 피드백 없음
- **파일:** `js/custom.js:146-147`
- **문제:** `document.execCommand("copy")`가 `false`를 반환하거나 예외 발생 시 `catch(e) {}`로 조용히 무시. 사용자는 "Copy" 버튼을 눌렀지만 아무 반응 없이 끝남. 특히 HTTP 환경(로컬 개발, 일부 WebView)에서 `navigator.clipboard`가 없고 `execCommand`도 실패하는 케이스 발생.
- **수정 방향:** catch 블록에서 버튼에 "Failed" 상태 피드백 표시. 예: `btn.textContent = 'Failed'; setTimeout(() => btn.textContent = orig, 1500);`

---

## Major

### M-01. IntersectionObserver 폴백 없음
- **파일:** `js/toc.js:85`
- **문제:** `new IntersectionObserver()`를 guard 없이 직접 호출. IE11, Samsung Internet 4.x 등에서 `ReferenceError` 발생하여 TOC 전체 스크립트 크래시. TOC 생성 자체는 되지만 스크롤 하이라이트가 불가하고, 에러가 스크립트 실행을 중단시킬 수 있음.
- **수정 방향:** `if (!('IntersectionObserver' in window)) return;` 가드 추가.

### M-02. 이미지 lazy loading 중복 실행
- **파일:** `js/custom.js:207-212` + `_layouts/post.html:282-284`
- **문제:** `initLazyImages()`가 DOMContentLoaded에서 모든 이미지에 `loading="lazy"` 부여하고, `post.html` 하단 인라인 스크립트가 `.post-container img`에 동일 작업 수행. 2번 DOM 순회 + 중복 속성 설정.
- **수정 방향:** 인라인 스크립트(`post.html:281-285`) 제거. `initLazyImages()`가 이미 처리함.

### M-03. Mobile TOC 패널 — Escape 키 미지원, 포커스 트랩 없음
- **파일:** `js/toc.js:117-135`
- **문제:** 모바일 TOC 패널이 열린 상태에서 Escape 키로 닫을 수 없음. Tab 키로 패널 밖으로 포커스가 이탈해도 패널이 열린 채 남음. WAI-ARIA disclosure 패턴 미준수.
- **수정 방향:** `keydown` 리스너 추가 — Escape 시 `panel.style.display = 'none'` + `toggle.focus()`. 패널 외부 클릭 시에도 닫히도록 `document.addEventListener('click', ...)` 추가.

### M-04. Mobile TOC — `style.display` 직접 조작
- **파일:** `js/toc.js:124-125`
- **문제:** `panel.style.display = 'block' | 'none'`으로 인라인 스타일 직접 토글. CSS에서 `display` 트랜지션 불가, 미디어쿼리 오버라이드 불가, `!important` 전쟁 유발. 현재 CSS에는 애니메이션 정의 없지만 확장성 제로.
- **수정 방향:** `.mobile-toc-panel--open` 클래스를 토글하고, CSS에서 `display` 제어.

### M-05. Copy 버튼 접근성 누락
- **파일:** `js/custom.js:173-175`
- **문제:** 동적 생성된 Copy 버튼에 `aria-label` 없음. 버튼 텍스트 "Copy"만 있고, 성공 시 `innerHTML`을 `"✓ Copied!"`로 교체하면서 `aria-live` 알림 없음. 스크린리더 사용자에게 복사 성공 여부 전달 불가.
- **수정 방향:** `btn.setAttribute('aria-label', 'Copy code to clipboard')` 추가. 성공 시 `aria-label`도 업데이트하거나 `aria-live="polite"` 영역 사용.

### M-06. `related-posts.html` — Liquid 템플릿 4회 전체 순회
- **파일:** `_includes/related-posts.html:14-78`
- **문제:** Phase 1~4에서 `site.posts`를 최대 4번 순회. 포스트 200개 기준 최대 800회 반복. Jekyll 빌드 시간에 직접 영향.
- **수정 방향:** 단일 순회로 통합 — 각 포스트를 한 번 검사하면서 commonTags 수에 따라 버킷에 분류하고, 우선순위대로 pick.

### M-07. `footer.html` — `async` 함수명이 예약어와 충돌
- **파일:** `_includes/footer.html:60-69`
- **문제:** `function async(u, c)` — `async`는 ES2017 예약어. strict mode에서 `SyntaxError` 발생 가능. 현재 non-strict이라 동작하지만, 번들러/미니파이어가 strict mode로 변환 시 즉시 깨짐.
- **수정 방향:** `loadScript(u, c)` 등으로 이름 변경. `post.html:297-304`의 동일 함수도 함께 수정.

---

## Minor

### m-01. CSS 하드코딩 — `.copy-btn` 배경/테두리
- **파일:** `css/custom.css:623-624`
- **문제:** `background: rgba(255, 255, 255, 0.9)`, `border: 1px solid #ddd` — 디자인 토큰 미사용. 다크모드 `[data-theme="dark"] .copy-btn`에서 별도 오버라이드 필요해진 원인.
- **수정 방향:** `background: rgba(var(--bg-surface), 0.9)` 또는 새 토큰 `--bg-overlay` 정의.

### m-02. CSS 하드코딩 — `.copy-btn--success` 색상
- **파일:** `css/custom.css:643-646`
- **문제:** `#2ea043` (success green) 3회 하드코딩 + `!important` 4개. 디자인 토큰에 success 색상 없음.
- **수정 방향:** `:root`에 `--color-success: #2ea043` 토큰 추가, `!important` 제거 (specificity로 해결).

### m-03. CSS 하드코딩 — 라인넘버 색상
- **파일:** `css/custom.css:667, 675`
- **문제:** `#636d83` (라이트), `#5a6270` (다크) 하드코딩. `var(--text-tertiary)` 또는 `var(--text-muted)` 사용해야 함.
- **수정 방향:** 해당 color를 `var(--text-tertiary)`로 교체.

### m-04. CSS 하드코딩 — Mobile TOC toggle `!important` 남용
- **파일:** `css/custom.css:1696-1701`
- **문제:** `.mobile-toc-toggle`에 `!important` 6개. Bootstrap `.btn` 스타일을 덮어쓰기 위한 것이나, 별도 클래스 사용 시 specificity로 해결 가능.
- **수정 방향:** Bootstrap `.btn` 클래스 제거 후 독립 스타일링, 또는 `.mobile-toc-wrapper .mobile-toc-toggle`으로 specificity 확보.

### m-05. `fallbackCopy()` 미사용 매개변수
- **파일:** `js/custom.js:142`
- **문제:** `fallbackCopy(text, btn, orig, onSuccess)` — `btn`과 `orig` 매개변수를 함수 내부에서 사용하지 않음. 호출부에서 4개 인자를 전달하지만 2개는 무시됨.
- **수정 방향:** 시그니처를 `fallbackCopy(text, onSuccess)`로 축소하고 호출부 수정.

### m-06. `post.html` 인라인 스타일
- **파일:** `_layouts/post.html:90, 111`
- **문제:** `<hr style="visibility: hidden;">` — 인라인 스타일. CSS 클래스 `.sr-spacer` 또는 margin으로 대체해야 함.
- **수정 방향:** `<hr class="spacer-hidden">` + CSS `.spacer-hidden { visibility: hidden; }`

### m-07. `toc.js` 전역 변수 오염
- **파일:** `js/toc.js:178`
- **문제:** `window.generateCatalog`을 전역에 노출. 다국어 페이지 interop용이지만, 다국어 미사용 시 불필요한 전역 오염.
- **수정 방향:** 다국어 페이지에서만 필요하므로, `footer.html`의 multilingual 블록에서 직접 import하거나, CustomEvent 기반 통신으로 전환 검토.

### m-08. `pre.style.position = 'relative'` 중복 설정
- **파일:** `js/custom.js:112, 172`
- **문제:** `initCodeLabels()`와 `initCopyButtons()` 모두 `pre.style.position = 'relative'` 인라인 설정. CSS에서 한 번만 선언하면 됨.
- **수정 방향:** CSS에 `.post-container pre { position: relative; }` 추가하고 JS에서 두 줄 제거.

### m-09. Related Posts — excerpt 없는 포스트 빈 div 렌더링
- **파일:** `_includes/related-posts.html:90`
- **문제:** `post.excerpt | strip_html | truncate: 80`이 빈 문자열이면 `.rp-excerpt` div가 빈 채 렌더링. 레이아웃 shift는 없지만 불필요한 빈 요소.
- **수정 방향:** `{% assign ex = post.excerpt | strip_html | truncate: 80 %}{% if ex != "" %}<div class="rp-excerpt">{{ ex }}</div>{% endif %}`

### m-10. `initDarkMode()` — DOMContentLoaded 이전 DOM 쿼리
- **파일:** `js/custom.js:35, 305`
- **문제:** `initDarkMode()`이 IIFE 즉시 실행에서 호출되며 `document.querySelector('.dark-mode-toggle i')` 실행. `<script defer>`로 로드되므로 DOM은 파싱 완료 상태이지만, `defer` 스크립트 실행 순서에 따라 토글 버튼이 아직 없을 수 있음. 현재 null guard가 있어 크래시는 아니지만 첫 렌더 시 아이콘 미반영 가능.
- **수정 방향:** `updateToggleIcon()`도 DOMContentLoaded 내로 이동.

### m-11. Mobile TOC panel width 고정값
- **파일:** `css/custom.css:1709`
- **문제:** `width: 260px` 하드코딩. 320px 미만 뷰포트에서 패널이 화면 밖으로 넘침.
- **수정 방향:** `width: min(260px, calc(100vw - 40px))` 또는 `max-width: calc(100vw - 40px)` 추가.

### m-12. Related Posts 카드 전체가 `<a>` 내부 `<div>` 중첩
- **파일:** `_includes/related-posts.html:87-97`
- **문제:** `<a>` 안에 4개 `<div>` 중첩. HTML5에서 유효하지만, 스크린리더에서 카드 전체 텍스트를 한 번에 읽음(tag + title + excerpt + date + category 연속). 포커스 가능 영역이 카드 전체라 Tab 내비게이션 시 verbose함.
- **수정 방향:** 제목에만 `<a>` 적용하고 카드 클릭은 JS로 위임, 또는 `aria-labelledby`로 제목만 읽히게 처리.

### m-13. `side-catalog` — `scrollIntoView` smooth 스크롤 성능
- **파일:** `js/toc.js:74`
- **문제:** IntersectionObserver 콜백 내에서 `scrollIntoView({ behavior: 'smooth' })`를 매 heading 교차 시 호출. 빠르게 스크롤할 경우 smooth 스크롤이 큐잉되어 사이드바가 뒤늦게 따라옴.
- **수정 방향:** `behavior: 'smooth'` → `behavior: 'instant'` 또는 debounce 적용.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| Major    | 7     |
| Minor    | 13    |
| **Total**| **23**|

**즉시 수정 필요:** C-01 (`updateUtterancesTheme` ReferenceError), C-02 (Copy 내용 오염), C-03 (fallback 무응답)
**Sprint 내 수정 권장:** M-01 ~ M-07 (IntersectionObserver 가드, 중복 제거, 접근성, Liquid 성능, 예약어 충돌)
