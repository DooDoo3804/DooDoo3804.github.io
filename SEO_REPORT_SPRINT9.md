# SEO Audit Report — Sprint 9

**Date:** 2026-03-31
**Scope:** 4 new posts (Spring Boot JPA, Docker, PostgreSQL Index, Caching Strategy) + site-wide templates

---

## Fixes Applied

### 1. og:locale mismatch (CRITICAL)
- **File:** `_includes/head.html`
- **Issue:** `og:locale` was `en_US` but `<html lang="ko">` and content is Korean
- **Fix:** Changed to `ko_KR`

### 2. JSON-LD publisher logo — relative URL
- **File:** `_includes/head.html`
- **Issue:** `publisher.logo.url` used relative path `/img/avatar.gif`
- **Fix:** Prepended `site.url + site.baseurl` for absolute URL

### 3. JSON-LD dateModified always missing
- **File:** `_includes/head.html`
- **Issue:** `dateModified` only rendered if `page.last_modified_at` existed (none of the new posts had it)
- **Fix:** Changed to `{{ page.last_modified_at | default: page.date }}` — always outputs a value

### 4. BreadcrumbList JSON-LD added
- **File:** `_includes/head.html`
- **Issue:** Breadcrumb HTML existed for series posts, but no structured data for Google rich results
- **Fix:** Added `BreadcrumbList` schema: Home > Primary Tag > Post Title

### 5. Sitemap lastmod improvement
- **File:** `sitemap.xml`
- **Issue:** Used `post.date` only; updated posts wouldn't signal freshness
- **Fix:** Changed to `post.last_modified_at | default: post.date`

### 6. Render-blocking JS removed
- **File:** `_includes/footer.html`
- **Issue:** `simple-jekyll-search.min.js` loaded without `defer`
- **Fix:** Added `defer` attribute

### 7. Custom meta descriptions for 4 new posts
- **Files:** All 4 Sprint 9 posts
- **Issue:** Posts relied on auto-excerpts (first paragraph) — not optimized for search
- **Fix:** Added targeted `description` front matter to each post:
  - `spring-boot-jpa-basics.md` — "Spring Boot와 JPA로 REST API를 만드는 방법..."
  - `docker-getting-started.md` — "Docker 입문 가이드. Dockerfile 작성..."
  - `postgresql-index.md` — "PostgreSQL 인덱스 완전 정리..."
  - `caching-strategy.md` — "캐싱 전략 비교 가이드..."

---

## Current SEO Status (What's Working Well)

| Area | Status | Notes |
|------|--------|-------|
| Title tags | Good | `page.title - site.SEOTitle` pattern |
| Canonical URLs | Good | Properly set with `site.url` prefix |
| Open Graph | Good | Full og:title, og:type, og:description, og:image with fallbacks |
| Twitter Cards | Good | `summary_large_image` with proper fallbacks |
| JSON-LD (BlogPosting) | Fixed | Now has absolute logo URL, guaranteed dateModified |
| JSON-LD (WebSite) | Good | Present on non-post pages |
| JSON-LD (BreadcrumbList) | Added | New for post pages |
| robots.txt | Good | Allows all, points to sitemap |
| sitemap.xml | Fixed | Now uses last_modified_at when available |
| Heading hierarchy | Good | h1 for post title, h2 for subtitle, content uses h2/h3 |
| Image alt text | Good | All `<img>` tags have alt attributes |
| Internal linking | Good | Series nav, related posts, prev/next navigation |
| Page speed | Good | Critical CSS inlined, defer on JS, preconnect, lazy loading |
| `permalink: pretty` | Good | Clean URL structure |

---

## Recommendations (Future Sprints)

### High Priority
1. **Add `last_modified_at` to posts when updating** — enables accurate sitemap signals and "Updated" badges
2. **Enable Google Analytics** — `ga_track_id` is commented out in `_config.yml`
3. **Add hreflang tags** if planning English content alongside Korean

### Medium Priority
4. **Add OG images per post** — posts using `header-style: text` have no post-specific image; consider auto-generating OG images
5. **Cross-link between Sprint 9 posts** — e.g., Spring Boot post → PostgreSQL index post, Docker post → Spring Boot post
6. **Add `inLanguage: "ko"` to JSON-LD** — explicit language signal

### Low Priority
7. **Add Person schema on About page** — structured data for the author
8. **Consider `article:section` OG tag** — maps to primary tag/category
9. **Add pagination URLs to sitemap** — `/page/2/`, `/page/3/` etc.
