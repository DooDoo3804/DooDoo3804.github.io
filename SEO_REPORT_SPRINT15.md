# SEO Audit Report — Sprint 15

**Site**: https://doodoo3804.github.io  
**Date**: 2026-04-03  
**Auditor**: SEO Specialist Agent  
**Total Posts Analyzed**: 25  
**Pages Analyzed**: index, archive, categories, tags, about

---

## Summary Score

| Category | Score | Status |
|----------|-------|--------|
| Meta Tags & OG | 85/100 | Good |
| Structured Data (JSON-LD) | 90/100 | Excellent |
| Sitemap & Robots | 75/100 | Needs Attention |
| RSS Feed | 95/100 | Excellent |
| Internal Link Structure | 45/100 | Poor |
| Image SEO | 60/100 | Needs Work |
| URL Structure | 80/100 | Good |
| Core Web Vitals / Performance | 55/100 | Needs Work |
| Mobile Friendliness | 90/100 | Excellent |
| Content SEO (Frontmatter) | 50/100 | Poor |
| **Overall SEO Health** | **68/100** | **Needs Improvement** |

---

## 1. Head Meta Tags (`_includes/head.html`)

### [Minor] Missing `robots` meta tag — `_includes/head.html`
- **Problem**: No `<meta name="robots" content="index, follow">` tag present. While not strictly required (robots.txt handles it), explicit meta robots gives per-page control and is a best practice.
- **Fix**: Add `<meta name="robots" content="{% if page.noindex %}noindex{% else %}index, follow{% endif %}">` after line 7.

### [Minor] Title separator inconsistency — `_includes/head.html:69`
- **Problem**: Post titles use `page.title - site.SEOTitle` format. The dash separator is fine, but for post pages, `og:title` (line 13) uses only `page.title` without the site name, while `<title>` (line 69) appends it. This is actually correct practice (OG should be clean), but the `<title>` could benefit from `|` separator for readability: `Page Title | DooDoo IT Blog`.
- **Fix**: Optional — consider changing `-` to `|` in the title tag for visual clarity in SERPs.

### [OK] description meta tag — `_includes/head.html:6`
- Well-implemented with post description > excerpt > site description fallback chain.
- **Caveat**: 10 posts lack `description` frontmatter, so they fall back to auto-excerpt (truncated to 155 chars). Auto-excerpts often produce awkward snippets.

### [OK] OG tags — `_includes/head.html:10-47`
- `og:title`, `og:type`, `og:description`, `og:image`, `og:url`, `og:site_name`, `og:locale` all present.
- `article:published_time`, `article:author`, `article:tag` correctly set for posts.
- Image fallback chain: thumbnail > per-post OG > header-img > og-default.png.

### [OK] Twitter Card — `_includes/head.html:49-67`
- `summary_large_image` card type with proper title, description, image.

### [OK] Canonical URL — `_includes/head.html:192`
- Properly strips `index.html` and prepends full URL.

### [OK] Google Site Verification — `_includes/head.html:4`
- `google-site-verification` tag present.

---

## 2. JSON-LD Structured Data (`_includes/head.html:71-162`)

### [OK] BlogPosting schema — `_includes/head.html:72-106`
- Complete `BlogPosting` with: headline, description, datePublished, dateModified, author (Person), publisher (Organization with logo), mainEntityOfPage, image, keywords, url.
- `dateModified` uses `last_modified_at` with fallback to `date` — excellent.

### [OK] WebSite schema — `_includes/head.html:108-117`
- Present on non-post pages with name, description, url.

### [OK] CollectionPage schema — `_includes/head.html:119-133`
- Categories page has `CollectionPage` with `ItemList` — good for rich results.

### [OK] BreadcrumbList schema — `_includes/head.html:136-162`
- 3-level breadcrumb: Home > Tag > Post Title. Correct positioning and structure.

### [Minor] Missing `SearchAction` in WebSite schema — `_includes/head.html:108-117`
- **Problem**: Site has search functionality but the WebSite JSON-LD doesn't include a `SearchAction` (Sitelinks Search Box).
- **Fix**: Add `"potentialAction": {"@type": "SearchAction", "target": "https://doodoo3804.github.io/archive/?tag={search_term_string}", "query-input": "required name=search_term_string"}` to the WebSite schema.

---

## 3. Sitemap (`sitemap.xml` + `jekyll-sitemap` plugin)

### [Major] Duplicate sitemap generation — `sitemap.xml` + `_config.yml:47`
- **Problem**: A custom `sitemap.xml` exists in the root AND `jekyll-sitemap` plugin is declared in `_config.yml:47`. The `jekyll-sitemap` gem auto-generates `/sitemap.xml`, which will be **overridden** by the custom file. This creates confusion — if the intent is to use the custom sitemap, the plugin is unnecessary; if the plugin is intended, the custom file shadows it.
- **Fix**: Remove `jekyll-sitemap` from `_config.yml` plugins since the custom sitemap is more feature-rich (includes `lastmod`, `changefreq`, `priority`), OR remove the custom `sitemap.xml` and let the plugin handle it.

### [Minor] `future: true` exposes unpublished content — `_config.yml:12`
- **Problem**: `future: true` publishes posts with future dates. Currently 5 posts have dates of 2026-04-04 through 2026-04-06 (future from today 2026-04-03). These appear in the sitemap and can be indexed by search engines before they're "ready."
- **Fix**: Set `future: false` or ensure all posts have correct dates.

---

## 4. Robots.txt (`robots.txt`)

### [OK] Well-configured — `robots.txt`
- `User-agent: *`, `Allow: /`, `Disallow: /private/`, `Sitemap` reference.
- Clean and appropriate.

---

## 5. RSS Feed (`feed.xml`)

### [OK] Comprehensive RSS 2.0 feed — `feed.xml`
- Includes `content:encoded` for full content, `atom:link` self-reference, language (`ko`), author, categories from both tags and Jekyll categories.
- Proper XML escaping.

### [Minor] No `jekyll-feed` plugin — `_config.yml`
- **Problem**: Manual feed.xml works fine but won't auto-add `<link rel="alternate" type="application/rss+xml">` to `<head>`. Currently missing from `head.html`.
- **Fix**: Add `<link rel="alternate" type="application/rss+xml" title="{{ site.title }}" href="{{ '/feed.xml' | absolute_url }}">` to `_includes/head.html`.

---

## 6. Internal Link Structure

### [Critical] 17/25 posts have ZERO internal links in content
- **Problem**: 68% of posts contain no links to other posts within the body content. This severely limits crawl depth, link equity distribution, and user engagement.
- **Posts with 0 internal links**:
  - `2026-04-02-redis-caching-strategy.md`
  - `2026-04-03-kafka-introduction.md`
  - `2026-04-04-jpa-n-plus-one-problem.md`
  - `2026-04-05-spring-security-architecture.md`
  - `2026-04-06-database-transaction-isolation.md`
  - `algo/2023-06-19-Segment-tree.md`
  - `algo/2023-07-11-floyd-warshall.md`
  - `algo/2023-07-12-minimun-spanning-tree-kruskal.md`
  - `algo/2026-04-01-trie.md`
  - `db/2026-03-25-postgresql-index.md`
  - `db/2026-04-01-mysql-vs-postgresql.md`
  - `kotlin/2023-06-20-kotlin-기본-문법.md`
  - `kotlin/2026-04-01-kotlin-coroutines-guide.md`
  - `react/2023-08-04-how-to-use-react-in-jekyll-app.md`
  - `react/2026-04-01-react-hooks-deep-dive.md`
  - `system-design/2026-03-28-caching-strategy.md`
  - `system-design/2026-04-01-api-rate-limiting.md`
- **Fix**: Add 2-3 contextual internal links per post to related content. Priority pairs:
  - redis-caching-strategy <-> caching-strategy
  - jpa-n-plus-one-problem <-> spring-boot-jpa-basics
  - spring-security-architecture <-> spring-security-jwt
  - database-transaction-isolation <-> postgresql-index
  - kafka-introduction <-> api-rate-limiting
  - trie <-> Segment-tree (same series)

### [OK] Automated linking mechanisms
- **Related Posts** (`_includes/related-posts.html`): Shows up to 3 related posts by tag overlap/series/category. Well-implemented.
- **Series Navigation** (`_layouts/post.html:48-74`): Shows all posts with same primary tag. Good.
- **Previous/Next** (`_layouts/post.html:91-108`): Chronological navigation. Good.
- **Category/Tag pages**: Link to all posts within. Good.

---

## 7. Image SEO

### [Major] Empty alt text — `_posts/kotlin/2023-06-21-kotlin-vs-Java.md:31`
- **Problem**: `![](https://kruschecompany.com/wp-content/uploads/2022/01/overview-2048x1603.png)` has completely empty alt text.
- **Fix**: Change to `![Kotlin vs Java feature comparison overview](...)`.

### [Major] No posts have OG images (thumbnail/header-img) — All 25 posts
- **Problem**: Every post falls back to `og-default.png` for social sharing. All posts use CSS gradients (`header-bg-css`) or `header-style: text` instead of actual images. When shared on social media, all posts look identical.
- **OG image coverage**: Only 6 legacy posts have per-post OG images in `/assets/img/og/`:
  - `Segment-tree.png`, `floyd-warshall.png`, `how-to-use-react-in-jekyll-app.png`, `kotlin-vs-Java.png`, `kotlin-기본-문법.png`, `minimun-spanning-tree-kruskal.png`
- **Fix**: Generate unique OG images for each post. Consider using a build-time OG image generator (e.g., `satori` or a simple template with post title + tag).

### [Minor] External image hotlinking — `_posts/kotlin/2023-06-21-kotlin-vs-Java.md:31`
- **Problem**: Image is loaded from `kruschecompany.com` — external hotlinking can break if the source removes the image, and adds a network dependency.
- **Fix**: Download and host the image locally in `/assets/img/`.

### [OK] Index page avatar has proper alt text — `index.html:13`
- `alt="{{ site.title }} avatar"` with width/height and lazy loading.

---

## 8. Post URL Structure

### [OK] Permalink configuration — `_config.yml:25`
- `permalink: pretty` generates `/yyyy/mm/dd/post-slug/` format. Clean, hierarchical URLs.

### [Minor] Filename typo affecting permanent URL — `_posts/algo/2023-07-12-minimun-spanning-tree-kruskal.md`
- **Problem**: "minimun" instead of "minimum" in the filename. This creates a permanent URL with a typo: `/2023/07/12/minimun-spanning-tree-kruskal/`.
- **Fix**: Rename file to `2023-07-12-minimum-spanning-tree-kruskal.md` and set up a redirect from the old URL (add `jekyll-redirect-from` plugin or manual redirect).

---

## 9. Content SEO — Frontmatter Issues

### [Critical] 10/25 posts missing `description` frontmatter
- **Problem**: Without an explicit `description`, the meta description falls back to auto-generated excerpt (first ~155 chars of content). Auto-excerpts often include code blocks, headers, or fragmented sentences — poor SERP snippets.
- **Affected posts**:
  1. `algo/2023-06-19-Segment-tree.md`
  2. `algo/2023-07-11-floyd-warshall.md`
  3. `algo/2023-07-12-minimun-spanning-tree-kruskal.md`
  4. `cs/2026-04-01-data-representation-float.md`
  5. `infra/2026-04-01-kubernetes-basics.md`
  6. `kotlin/2023-06-20-kotlin-기본-문법.md`
  7. `kotlin/2023-06-21-kotlin-vs-Java.md`
  8. `react/2023-08-04-how-to-use-react-in-jekyll-app.md`
  9. `react/2026-04-01-react-hooks-deep-dive.md`
  10. `spring/2026-04-01-spring-security-jwt.md`
- **Fix**: Write a compelling 120-155 character Korean description for each post with target keywords.

### [Major] 10/25 posts missing `categories` frontmatter
- **Problem**: Posts in subdirectories (`algo/`, `db/`, etc.) without explicit `categories` may not be properly categorized by Jekyll, weakening the category taxonomy.
- **Affected posts**:
  1. `algo/2023-06-19-Segment-tree.md`
  2. `algo/2023-07-11-floyd-warshall.md`
  3. `algo/2023-07-12-minimun-spanning-tree-kruskal.md`
  4. `db/2026-03-25-postgresql-index.md`
  5. `infra/2026-03-20-docker-getting-started.md`
  6. `kotlin/2023-06-20-kotlin-기본-문법.md`
  7. `kotlin/2023-06-21-kotlin-vs-Java.md`
  8. `react/2023-08-04-how-to-use-react-in-jekyll-app.md`
  9. `spring/2026-03-15-spring-boot-jpa-basics.md`
  10. `system-design/2026-03-28-caching-strategy.md`
- **Fix**: Add `categories: [algo]`, `categories: [db]`, etc. matching the subdirectory name.

### [Major] Author name inconsistency — Multiple posts
- **Problem**: 16 posts use `author: DooDoo`, 9 posts use `author: DoYoon Kim`. Google's E-E-A-T signals benefit from consistent author identity. The JSON-LD `author.name` inherits this inconsistency.
- **Fix**: Standardize to one name across all posts. Recommendation: `"DoYoon Kim"` (real name) for E-E-A-T, with "DooDoo" as a site/brand name.

### [Minor] 10 posts missing explicit `date` frontmatter
- **Problem**: Jekyll infers date from filename, but explicit `date` in frontmatter is more reliable and allows time-of-day specification (affects `datePublished` in JSON-LD).
- **Fix**: Add `date: YYYY-MM-DD HH:MM:SS +0900` to each post.

### [Minor] Older posts have weak/English-only titles
- **Problem**: `Segment tree`, `Floyd Warshall`, `Minimum Spanning Tree`, `Kotlin vs Java`, `How to use React in Jekyll app` — English-only titles miss Korean search traffic.
- **Fix**: Consider bilingual titles like `"세그먼트 트리(Segment Tree) — 구간 합, 구간 최솟값 구현"`.

---

## 10. Core Web Vitals & Performance

### [Major] Excessive CSS payload — 263KB total
- **Problem**:
  - `css/bootstrap.min.css`: 117KB (full Bootstrap — most rules unused)
  - `css/custom.css`: 116KB (not minified)
  - `css/hux-blog.min.css`: 28KB
  - Total: **263KB of render-blocking CSS**
- **Fix**:
  1. Minify `custom.css` (could reduce by 30-40%)
  2. Purge unused Bootstrap CSS (PurgeCSS) — typical reduction: 80-90%
  3. Consider inlining critical CSS and deferring the rest

### [Major] jQuery dependency — `js/jquery.min.js` (84KB)
- **Problem**: jQuery (84KB) is loaded on every page but only used for search overlay (`$()` selectors in `footer.html`). Bootstrap.min.js (35KB) also depends on it.
- **Fix**: Long-term: replace jQuery usage with vanilla JS (much of the codebase already uses vanilla JS). Short-term: defer is already applied, so impact is on total download size, not render-blocking.

### [Minor] Font Awesome loaded externally — `_includes/head.html:226`
- **Problem**: `kit.fontawesome.com` is a third-party dependency. If the CDN is slow, icons delay. The `defer` attribute helps but the request is still made.
- **Fix**: Consider self-hosting a subset of Font Awesome icons used, or using SVG icons inline.

### [OK] Google Fonts optimization — `_includes/head.html:176-177`
- Preloaded + `display=swap` — good approach.

### [OK] JS defer — `_includes/footer.html:41-56`
- All scripts use `defer` attribute — excellent.

### [OK] Critical CSS inlined — `_includes/head.html:195-211`
- Root CSS variables and base styles inlined for faster FCP.

### [OK] DNS prefetch / Preconnect — `_includes/head.html:165-173`
- All external domains have DNS prefetch and preconnect where appropriate.

---

## 11. Mobile Friendliness

### [OK] Viewport — `_includes/head.html:5`
- `width=device-width, initial-scale=1, viewport-fit=cover` — correct, includes safe area support.

### [OK] Touch targets
- Mobile share bar (`_layouts/post.html:161-168`) with proper buttons.
- Mobile TOC toggle (`_layouts/post.html:133-141`) with adequate size.
- Lightbox with swipe-to-close (`_layouts/post.html:259-276`).

### [OK] Responsive layout
- Bootstrap grid system with proper breakpoints.
- Sidebar hidden on mobile (`hidden-sm hidden-xs` in `archive.html:82`).

### [OK] PWA support — `pwa/manifest.json`
- Manifest, service worker, apple-mobile-web-app meta tags all present.

### [Minor] PWA manifest language mismatch — `pwa/manifest.json`
- **Problem**: `"lang": "en"` but the blog is primarily in Korean.
- **Fix**: Change to `"lang": "ko"`.

---

## 12. `_config.yml` SEO Settings

### [OK] SEOTitle — `_config.yml:3`
- `"DooDoo IT Blog | Backend Dev Blog by DoYoon Kim"` — descriptive with keywords.

### [OK] Description — `_config.yml:6`
- Bilingual (English + Korean), keyword-rich. Good.

### [OK] Keywords — `_config.yml:7`
- Comprehensive keyword list covering both English and Korean terms.

### [Major] No analytics configured — `_config.yml:69-75, 107-109`
- **Problem**: Google Analytics is commented out. GoatCounter is disabled with placeholder. **No analytics are active** — there is no way to measure SEO performance, traffic sources, or user behavior.
- **Fix**: Enable GoatCounter (privacy-friendly) or Google Analytics 4. Without analytics, SEO improvements cannot be measured.

### [Minor] Giscus placeholder values — `_config.yml:99-100`
- **Problem**: `repo_id: "REPLACE_WITH_REPO_ID"` and `category_id: "REPLACE_WITH_CATEGORY_ID"` — comments system is not functional.
- **Fix**: Generate actual values from https://giscus.app and replace placeholders.

---

## 13. Additional Findings

### [Minor] Missing RSS `<link>` in `<head>` — `_includes/head.html`
- **Problem**: No `<link rel="alternate" type="application/rss+xml">` tag in `<head>`. Browsers and feed readers won't auto-discover the RSS feed.
- **Fix**: Add before `</head>`:
  ```html
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }}" href="{{ '/feed.xml' | absolute_url }}">
  ```

### [Minor] `hux-blog.css` (37KB) included alongside `hux-blog.min.css` (28KB)
- **Problem**: Both the unminified and minified versions exist in `/css/`. Verify only the minified version is loaded. Currently `head.html:217` loads `hux-blog.min.css` — correct, but the unminified file adds to repo size.
- **Fix**: Remove `hux-blog.css` if only the min version is used.

### [Minor] External links in post content lack `target="_blank"` and `rel="noopener"`
- **Problem**: Markdown-rendered external links don't get security/UX attributes. Users clicking external links leave the blog without opening a new tab.
- **Fix**: Add a kramdown or Jekyll plugin to auto-add `target="_blank" rel="noopener noreferrer"` to external links, or use the `{:target="_blank" rel="noopener"}` kramdown attribute after links.

---

## Priority Action Items

### P0 — Critical (Do First)
| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | Add `description` to 10 posts | SERP snippets, CTR | Low |
| 2 | Add internal links to 17 posts (2-3 each) | Crawlability, link equity | Medium |
| 3 | Enable analytics (GoatCounter or GA4) | SEO measurement | Low |

### P1 — Major (Do Soon)
| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 4 | Add `categories` to 10 posts | Site taxonomy, navigation | Low |
| 5 | Fix empty alt text in kotlin-vs-Java.md | Accessibility, image SEO | Trivial |
| 6 | Generate per-post OG images | Social sharing CTR | Medium |
| 7 | Standardize author name across posts | E-E-A-T signals | Low |
| 8 | Resolve sitemap.xml / jekyll-sitemap conflict | Crawl budget | Trivial |
| 9 | Minify custom.css + purge Bootstrap | CWV (LCP, FCP) | Medium |
| 10 | Add RSS `<link>` to head.html | Feed discoverability | Trivial |

### P2 — Minor (Nice to Have)
| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 11 | Add `robots` meta tag | Per-page control | Trivial |
| 12 | Fix filename typo (minimun -> minimum) | URL cleanliness | Low |
| 13 | Add explicit `date` to 10 posts | JSON-LD accuracy | Low |
| 14 | Improve English-only post titles with Korean | Korean search traffic | Low |
| 15 | PWA manifest `lang: "ko"` | PWA correctness | Trivial |
| 16 | Replace jQuery with vanilla JS | Page weight (-84KB) | High |
| 17 | Self-host Font Awesome subset | CDN independence | Medium |
| 18 | Add SearchAction to WebSite JSON-LD | Sitelinks search box | Low |
| 19 | Fix Giscus placeholder values | User engagement | Low |
| 20 | Add `target="_blank"` to external links | UX, session duration | Low |

---

## Overall Assessment

**Score: 68/100 — Needs Improvement**

**Strengths**:
- Excellent structured data (JSON-LD) with BlogPosting, BreadcrumbList, WebSite, and CollectionPage schemas
- Well-implemented OG tags and Twitter Cards with proper fallback chains
- Good technical SEO foundation: canonical URLs, clean permalink structure, proper viewport
- Strong mobile experience with PWA support, touch-friendly UI, responsive layout
- Automated related posts, series navigation, and prev/next linking
- RSS feed is comprehensive with full content

**Critical Weaknesses**:
- **Content SEO gap**: 40% of posts lack `description` — the single most impactful meta tag for SERP CTR
- **Internal linking crisis**: 68% of posts have zero in-content links — severely limits crawl depth and page authority distribution
- **No analytics**: Impossible to measure any SEO improvement without tracking
- **No unique OG images**: All posts share the same social preview — kills share CTR
- **CSS bloat**: 263KB of CSS is excessive for a blog — hurts Core Web Vitals

**Quick Wins** (high impact, low effort):
1. Write `description` for 10 posts (~30 min)
2. Add `categories` to 10 posts (~10 min)
3. Enable GoatCounter analytics (~5 min)
4. Add RSS `<link>` to head.html (~1 min)
5. Fix empty alt text (~1 min)
6. Remove `jekyll-sitemap` from plugins (~1 min)

Addressing the P0 items alone would raise the score to approximately **78/100**.
