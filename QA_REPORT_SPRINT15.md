# QA Report — Sprint 15

**Date**: 2026-04-03
**Reviewer**: QA Agent
**Scope**: Sprint 15 Design / UX / SEO 수정 사항 전수 검토

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| Major    | 9     |
| Minor    | 8     |
| **Total** | **19** |

---

## Critical

### C1. [Critical] CSS 문법 오류 — `.search-highlight` 닫는 중괄호 누락

**파일**: `css/custom.css:3250-3268`

`.search-highlight` 블록의 `}`가 빠져 있어 `mark`와 `[data-theme="dark"] mark` 규칙이 `.search-highlight` 내부에 중첩됨. CSS nesting 해석 시 `[data-theme="dark"] mark`가 `.search-highlight [data-theme="dark"] mark`로 해석되어 **dark mode에서 `mark` 스타일이 적용되지 않음**.

```css
/* 현재 (잘못됨) */
.search-highlight {
    background: rgba(var(--accent-color-raw), 0.35);
    ...
    border-radius: 2px;
                            /* ← } 누락 */
/* Generic mark element */
mark { ... }
[data-theme="dark"] mark { ... }
}
```

**수정**: 3255행 `border-radius: 2px;` 다음에 `}` 추가.

---

### C2. [Critical] 내부링크 2건 — 카테고리 prefix 누락으로 404

1. **`_posts/spring/2026-04-01-spring-security-jwt.md:23`**
   - 현재: `[이전 글](/2026/03/15/spring-boot-jpa-basics/)`
   - 대상 포스트 카테고리: `Spring` → 생성 URL `/Spring/2026/03/15/spring-boot-jpa-basics/`
   - **수정**: `/Spring/2026/03/15/spring-boot-jpa-basics/`

2. **`_posts/cs/2026-04-01-data-representation-float.md:19`**
   - 현재: `[이전 글](/2026/04/01/data-representation-integer/)`
   - 대상 포스트 카테고리: `cs` → 생성 URL `/cs/2026/04/01/data-representation-integer/`
   - **수정**: `/cs/2026/04/01/data-representation-integer/`

---

## Major

### M1. [Major] 내부링크 카테고리 대소문자 불일치 — 3건

Jekyll `permalink: pretty`는 카테고리를 **case-sensitive**하게 URL에 포함. GitHub Pages도 URL 대소문자를 구분. 아래 링크들은 링크의 카테고리와 실제 포스트 카테고리의 대소문자가 불일치하여 404 가능.

1. **`_posts/2026-04-06-database-transaction-isolation.md:167`**
   - 링크: `/database/2026/03/25/postgresql-index/`
   - 대상 카테고리: `Database` (대문자 D) → 실제 URL `/Database/...`
   - **수정**: `/Database/2026/03/25/postgresql-index/`

2. **`_posts/algo/2026-04-01-trie.md:247`**
   - 링크: `/algorithm/2023/06/19/Segment-tree/`
   - 대상 카테고리: `Algorithm` (대문자 A) → 실제 URL `/Algorithm/...`
   - **수정**: `/Algorithm/2023/06/19/Segment-tree/`

3. **`_posts/2026-04-02-redis-caching-strategy.md:22`**
   - 링크: `/system%20design/2026/03/28/caching-strategy/`
   - 대상 카테고리: `System Design` (대문자) → 실제 URL `/System%20Design/...`
   - **수정**: `/System%20Design/2026/03/28/caching-strategy/`

---

### M2. [Major] 카테고리 대소문자 통일 안 됨 — URL 파편화

Sprint 15에서 author/categories 통일 지시가 있었으나, 기존 포스트와 신규 포스트 간 카테고리 대소문자가 혼재:

| 포스트 | categories 값 | Jekyll 생성 URL prefix |
|--------|--------------|----------------------|
| Segment-tree.md | `Algorithm` | `/Algorithm/` |
| trie.md | `algo` | `/algo/` |
| docker-getting-started.md | `Infra` | `/Infra/` |
| kubernetes-basics.md | `infra` | `/infra/` |
| spring-boot-jpa-basics.md | `Spring` | `/Spring/` |
| spring-security-jwt.md | `spring` | `/spring/` |
| postgresql-index.md | `Database` | `/Database/` |
| caching-strategy.md | `System Design` | `/System%20Design/` |
| api-rate-limiting.md | `system-design` | `/system-design/` |

**같은 주제의 포스트가 서로 다른 URL prefix**를 가짐. Series nav, Related Posts, 카테고리 필터 등에서 그룹핑 실패 원인.

**수정 방향**: 모든 포스트의 categories를 소문자 kebab-case로 통일 (e.g., `algorithm`, `infra`, `spring`, `database`, `system-design`).

---

### M3. [Major] `_config.yml:47` — `plugins: []` 빈 배열

`jekyll-sitemap` 제거 후 `plugins: []`만 남음. 의도된 것이면 문제 없으나, `jekyll-feed`도 포함되어 있지 않아 `/feed.xml`이 자동 생성되지 않을 수 있음. RSS CTA(`subscribe-cta.html`)에서 `/feed.xml`로 링크하고 있고, `head.html:229`에서도 RSS feed link를 선언.

**수정 방향**: `jekyll-feed` 플러그인이 별도로 설치/설정되어 있는지 확인. 없다면 `plugins: [jekyll-feed]` 추가, 또는 커스텀 feed.xml 존재 여부 확인.

---

### M4. [Major] CSS 하드코딩 색상 — 토큰 미사용 다수

`css/custom.css`에서 디자인 토큰 대신 하드코딩된 색상 다수 발견:

| 라인 | 선택자 | 하드코딩 값 | 대체 토큰 |
|------|--------|-----------|----------|
| 273 | `[data-theme="dark"] .author-hero-topics` | `#aaa` | `var(--text-secondary)` |
| 545 | `#back-to-top:hover` | `#006d85` | 토큰 없음 — 필요 시 `--accent-hover` 정의 |
| 668 | `.series-nav` | `#f8f9fa` | `var(--bg-surface-raised)` |
| 1067 | `.error-search input` | `color: #24292f` | `var(--text-primary)` |
| 1093 | `.error-search-result-item` | `color: #24292f` | `var(--text-primary)` |
| 1136 | `.error-recent-title` | `color: #57606a` | `var(--text-muted)` |
| 1168 | `.error-recent-list a` | `color: #24292f` | `var(--text-primary)` |
| 1876 | `.archive-year-item` | `border-bottom: 1px solid #f5f5f5` | `var(--border-divider)` |
| 2005 | `.mini-post-list hr` | `border-color: #f5f5f5` | `var(--border-divider)` |
| 2020 | `.archive-tag-item` | `border: 1px solid #e0e0e0` | `var(--border-medium)` |
| 2026 | `.archive-tag-item` | `background: #fafafa` | `var(--bg-surface-raised)` |
| 2682-2683 | `.skill-category` | `#fafbfc`, `#eee` | tokens |
| 2886-2888 | `.timeline-content` | `#fafbfc`, `#eee` | tokens |
| 4184 | `.start-here-desc` | `#888` | `var(--text-secondary)` |

**수정 방향**: 모든 하드코딩 색상을 기존 토큰으로 대체.

---

### M5. [Major] `_posts/2026-04-02-redis-caching-strategy.md` — `categories` 누락 의심

```yaml
categories:
  - backend
```

해당 포스트는 `_posts/` 루트에 위치하면서 `categories: backend`. 반면 `caching-strategy.md`는 `_posts/system-design/`에 위치하면서 `categories: [System Design]`. 같은 캐싱 주제인데 카테고리가 `backend` vs `System Design`으로 다름. 내부링크가 서로를 참조하고 있어 혼란 발생.

---

### M6. [Major] 제거 대상 코드 잔류 — `.scroll-indicator`, `.author-hero-typing` 전환 셀렉터

`css/custom.css:4786-4798` — `.transitions-enabled .scroll-indicator`와 `.transitions-enabled .author-hero-typing`이 dark mode transition 목록에 남아 있음. Sprint 15 M3에서 타이핑 애니메이션과 scroll indicator를 제거했으나 transition 셀렉터에서 삭제되지 않음.

**수정**: 해당 2개 셀렉터 삭제.

---

### M7. [Major] Subscribe CTA — `feed.xml` 경로 미검증

`_includes/subscribe-cta.html:5`에서 `{{ site.baseurl }}/feed.xml` 참조.
`_includes/head.html:229`에서 `{{ '/feed.xml' | absolute_url }}` 참조.

두 곳의 URL 구성 방식이 다름. `baseurl`이 빈 문자열이면 둘 다 `/feed.xml`로 동일하지만, `baseurl` 설정 시 결과가 다를 수 있음. 더 중요한 것은 `feed.xml`이 실제로 존재/생성되는지 확인 필요 (M3 참조).

---

### M8. [Major] `_config.yml:102-104` — Giscus placeholder 값

```yaml
giscus:
  repo_id: "REPLACE_WITH_REPO_ID"
  category_id: "REPLACE_WITH_CATEGORY_ID"
```

Sprint 15과 무관하나, Comments 시스템이 동작하지 않는 상태. 포스트 하단 순서 수정(Sprint 15)으로 인해 comments.html이 포함되어 있는데, 설정값이 placeholder.

---

### M9. [Major] `post.html` — Series Nav 로직이 `tags` 기반

`_layouts/post.html:51-77` — Series Navigation이 `page.tags | first`로 같은 첫 번째 태그를 공유하는 포스트를 모두 시리즈로 묶음. 이 로직은 `Algorithm` 같은 범용 태그가 첫 번째 태그인 모든 포스트를 하나의 "시리즈"로 표시. 예를 들어 `Algorithm` 태그 포스트 4개가 전부 하나의 시리즈로 뜸.

**수정 방향**: `page.series` frontmatter가 있을 때만 시리즈 표시하거나, 더 엄격한 매칭 기준 적용.

---

## Minor

### m1. [Minor] CSS `post-card-thumb--gradient` 하드코딩 그라디언트

`css/custom.css:410-422` — `.post-card-thumb--gradient`, `--algorithm`, `--kotlin`, `--react`의 그라디언트 배경색이 하드코딩. category accent color 토큰 (`--cat-accent`)이 이미 카테고리 페이지에 정의되어 있으므로 재사용 가능.

---

### m2. [Minor] `index.html:115` — Featured Post 제외 로직 fragile

```liquid
{% if forloop.first %}{% continue %}{% endif %}
```

`featured_post_slug`가 설정되어 최신이 아닌 특정 포스트가 featured인 경우에도, 카드 목록에서 항상 첫 번째 포스트를 건너뜀. featured가 아닌 최신 포스트가 누락됨.

**수정 방향**: `{% if post.url == featured.url %}{% continue %}{% endif %}` 로 변경.

---

### m3. [Minor] `index.html:109` — 태그 `capitalize` 처리 불완전

```liquid
{{ tag | capitalize }}
```

`system-design` → `System-design` (kebab-case 두 번째 단어 소문자). `System Design`으로 표시되어야 함.

---

### m4. [Minor] Subscribe CTA — `min-height: 44px` touch target 미설정

`css/custom.css:5228-5240` — `.subscribe-cta-btn`에 `min-height` 미설정. `padding: 8px 18px`로 약 36px 높이. WCAG 터치 타겟 권장 44px 미달.

(cf. `.post-share a, .post-share button`에는 `min-height: 44px` 적용되어 있음, `.category-btn`도 적용됨)

---

### m5. [Minor] `pwa/manifest.json` — `start_url` 미반영

`start_url: "/"` — `baseurl`이 빈 문자열이므로 현재는 문제 없으나, 향후 `baseurl` 변경 시 PWA 시작 경로 불일치 가능.

---

### m6. [Minor] `_includes/subscribe-cta.html` — 한국어 텍스트인데 `lang` 속성 없음

CTA 텍스트가 한국어(`새 글이 올라오면 알려드릴게요`)인데 블로그 전체 `html lang`이 설정되지 않았거나 영어. 스크린 리더가 한국어 텍스트를 영어로 읽을 수 있음.

**수정 방향**: `<p>` 태그에 `lang="ko"` 추가, 또는 `_config.yml`에 `lang: ko` 설정.

---

### m7. [Minor] CSS dead code — `border-left: 3px solid` accent bar 주석만 남음

`css/custom.css:1819` — `/* Post card accent bar removed — Sprint 15 M5 */` 주석만 있고, `.post-card { position: relative; }` (line 1815-1817)는 accent bar의 `::before` pseudo-element를 위해 추가된 것이나 이제 불필요한 `position: relative` 선언이 됨. 다른 용도로 필요하지 않다면 제거.

---

### m8. [Minor] `_posts/kotlin/2023-06-21-kotlin-vs-Java.md` — 내부링크가 absolute URL

해당 포스트에서 다른 블로그 포스트를 `https://doodoo3804.github.io/2023/06/20/kotlin-%EA%B8%B0%EB%B3%B8/`처럼 절대 URL로 참조. 로컬 개발 시 링크가 프로덕션으로 이동. 상대 경로(`/Kotlin/2023/06/20/...`)로 변경 필요.

---

## Checklist 확인 결과

| 항목 | 결과 |
|------|------|
| 10개 포스트 description 추가 | **Pass** — 전체 24개 포스트 모두 description 존재 |
| description 내용 일치 | **Pass** — 전반적으로 포스트 내용과 부합 |
| categories 통일 | **Fail** — 대소문자 혼재 (M2) |
| author 통일 | **Pass** — 전체 "DoYoon Kim" |
| 내부링크 6쌍 12개 | **Fail** — 5건 경로 오류 (C2, M1) |
| `head.html` RSS link | **Pass** — line 229 |
| `_config.yml` jekyll-sitemap 제거 | **Pass** — plugins: [] |
| `pwa/manifest.json` lang ko | **Pass** — line 29 |
| Subscribe CTA 추가 | **Pass** |
| 포스트 하단 순서 | **Pass** — Series → Related → Subscribe → Share → Pager → Comments |
| Featured Post 수동 지정 | **Pass** (config에 slug 필드 존재, 현재 주석 처리) |
| 카테고리 badge | **Pass** — tag-count badge 적용 |
| 타이핑 애니메이션 제거 | **Pass** (CSS 주석 + 코드 제거) |
| Scroll indicator 제거 | **Pass** (CSS 주석 + 코드 제거) |
| Accent bar 제거 | **Pass** (CSS 주석) |
| Dark mode transition | **Pass** — 주요 컴포넌트에 transition 적용 |
| 신규 컴포넌트 다크모드 | **Pass** — subscribe-cta, breadcrumb 모두 dark mode 있음 |

---

## 우선 수정 권장

1. **즉시**: C1 (CSS 문법), C2 (404 링크)
2. **이번 Sprint**: M1 (링크 대소문자), M2 (카테고리 통일), M6 (dead selector)
3. **다음 Sprint**: M3 (feed plugin), M4 (하드코딩 색상), M9 (series 로직)
