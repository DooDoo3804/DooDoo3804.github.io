# QA Report - Sprint 4

**Date:** 2026-03-31
**Branch:** master
**Commits reviewed:** `3b82d1d`, `6058f9c`
**Reviewer:** QA Engineer (automated)

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| CRITICAL | 1     | 1     |
| HIGH     | 2     | 2     |
| MEDIUM   | 2     | 2     |
| LOW      | 1     | 1     |
| **Total** | **6** | **6** |

---

## CRITICAL

### BUG-1: Featured post duplicated in "More Posts" grid
- **File:** `index.html:82`
- **Description:** `site.posts.first` is used for the featured hero (line 40), but `paginator.posts` in the grid below (line 82) also includes this same post on page 1. The newest post appears twice on the homepage.
- **Impact:** Content duplication, poor UX, looks broken.
- **Fix:** Added `{% if paginator.page == 1 and forloop.first %}{% continue %}{% endif %}` to skip the first post on page 1 in the grid loop.

---

## HIGH

### BUG-2: Search results double-escape HTML entities in titles
- **File:** `_includes/footer.html:336`
- **Description:** `highlightMatch()` escapes `&`, `<`, `>` in text. But `templateMiddleware` only calls `htmlDecode()` on titles containing the literal substring `"code"`. For all other titles, the already-escaped value from `search.json` (via `| escape`) gets double-escaped. A title like "Java & Spring" renders as `Java &amp; Spring` in search results.
- **Impact:** Garbled text in search results for any post with special characters in title/subtitle.
- **Fix:** Changed to always call `htmlDecode(value)` instead of conditional decode.

### BUG-3: Trailing slash in `_config.yml` URL causes double-slash in meta tags
- **File:** `_config.yml:8`
- **Description:** `url: "https://doodoo3804.github.io/"` ends with `/`. When combined with paths starting with `/` (e.g., `{{ site.url }}{{ page.url }}`), this produces `https://doodoo3804.github.io//about/` in OG URLs, canonical links, and JSON-LD structured data.
- **Impact:** Malformed URLs in all SEO-critical meta tags. Search engines may index duplicate URLs.
- **Fix:** Removed trailing slash: `url: "https://doodoo3804.github.io"`.

---

## MEDIUM

### BUG-4: About page project links missing `target="_blank"`
- **Files:** `_includes/about/kr.md`, `en.md`, `ja.md`
- **Description:** External GitHub links in project cards (`project-link` class) don't have `target="_blank"` or `rel="noopener noreferrer"`. Clicking navigates away from the site.
- **Impact:** Users lose their place on the about page when clicking project links.
- **Fix:** Added `target="_blank" rel="noopener noreferrer"` to all external project links across all 3 locale files (6 links total).

### BUG-5: "More Posts" heading shown unconditionally
- **File:** `index.html:62`
- **Description:** The `<h3>More Posts</h3>` heading renders even when there are no additional posts to display (e.g., if only 1 post exists on the site).
- **Impact:** Empty section heading with no content below it.
- **Fix:** Wrapped in `{% if paginator.posts.size > 1 or paginator.page != 1 %}`.

---

## LOW

### BUG-6: Featured post date not converted to relative time
- **File:** `index.html:53`
- **Description:** The featured hero date uses class `.featured-post-date`, but the relative time JS (line 185) only targets `.post-date[data-date]`. The hero shows an absolute date while grid cards show relative time ("3 days ago").
- **Impact:** Visual inconsistency between hero and grid dates.
- **Fix:** Added `post-date` class alongside `featured-post-date` so the relative time JS picks it up.

---

## Verified - No Issues Found

### Featured Post Hero
- `site.posts.first` Liquid syntax is correct
- Graceful degradation with `{% if featured %}` guard
- Dark mode styles present (`[data-theme="dark"] .featured-post-hero`)
- HTML structure valid, no unclosed tags

### About Page Portfolio Cards
- HTML structure is correct with proper `project-grid` / `project-card` hierarchy
- Cards use CSS grid with mobile fallback (`grid-template-columns: 1fr` at <768px)
- "Currently Learning" section properly styled with `.learning-pill` dark mode support
- GitHub stats images have `loading="lazy"` and explicit dimensions

### Search UX
- Keyboard navigation: Arrow key logic is correct (wraps around with modulo-style bounds)
- Result count pluralization correct (`_searchResultCount !== 1 ? 's' : ''`)
- Empty state shown only when query exists AND result count is 0
- No null reference risks (`$searchInput`, `$resultsContainer` guarded by jQuery)
- `setActiveResult` bounds-checks `idx >= 0 && idx < items.length`

### Tag Cloud
- Post count badges use `{{ tag_posts.size }}` which is correct
- Click-to-scroll works: `href="#tag-{{ tag_name | slugify }}"` matches `id="tag-{{ tag_name | slugify }}"`
- Tags sorted by count via zero-padded prefix sort (`prepend: "0000" | slice: -4, 4`) - correct
- Responsive: mobile padding adjustments at 767px breakpoint

### Footer
- Copyright year: `{{ site.time | date: '%Y' }}` renders correctly
- Social links use `site.github_username`, `site.linkedin_username`, `site.email_address` from `_config.yml` - all present
- Dark mode: `[data-theme="dark"] .site-footer` styles defined
- RSS link uses `{{ "/feed.xml" | prepend: site.baseurl }}` - correct

### Cross-cutting
- No broken CSS class references found
- No hardcoded URLs that should use `site.url`/`site.baseurl` (about page project links use full GitHub URLs appropriately)
- Font Awesome Kit loaded via `kit.fontawesome.com` supports both `fa fa-*` (FA4/5 compat) and `fa-brands fa-*` (FA6)
