# QA Report: Sprint 3

**Branch:** `feature/sprint-3`
**Date:** 2026-03-31
**Reviewer:** QA Engineer (automated)
**Commits reviewed:** `5513187` (FE-A: Tag Index + Related Posts), `5eba564` (FE-B: Performance + PWA)

---

## CRITICAL BUGS (Fixed)

### CRIT-1: Search completely broken by `defer` on SimpleJekyllSearch

**File:** `_includes/footer.html:31`
**What:** `simple-jekyll-search.min.js` was changed to `defer`, but `SimpleJekyllSearch()` is called in an inline `<script>` at line 301 of the same file. Inline scripts execute during HTML parsing; deferred scripts execute after parsing completes. Result: `ReferenceError: SimpleJekyllSearch is not defined` on every page load. Search is 100% broken.

**Fix applied:** Removed `defer` from `simple-jekyll-search.min.js`. This script MUST load synchronously because the inline initialization code at line 301 depends on it.

### CRIT-2: Service worker double-fetches every navigation request

**File:** `sw.js:198-213`
**What:** The network-first handler for navigation requests called `fetch()` inside `event.respondWith()` (line 200) and then created a SECOND `fetch()` for revalidation (line 211). Every page navigation triggered two full network requests to the server, doubling bandwidth usage and server load.

**Fix applied:** Refactored to share a single `fetch()` promise between `event.respondWith()` and the revalidation check. One fetch, two consumers.

---

## HIGH SEVERITY

### HIGH-1: Service worker `isNavigationReq` can crash on null Accept header

**File:** `sw.js:62`
**Line:** `const isNavigationReq = (req) => (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept').includes('text/html')))`
**What:** `req.headers.get('accept')` returns `null` if the header is absent. Calling `.includes()` on `null` throws `TypeError: Cannot read properties of null`. Some browser-internal requests and preflight requests may lack an Accept header.
**Fix:** Change to:
```js
const isNavigationReq = (req) => (req.mode === 'navigate' || (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html')))
```

### HIGH-2: Service worker uses implicit global variables

**File:** `sw.js:41` and `sw.js:88`
**What:** `url = new URL(req.url)` in both `getCacheBustingUrl()` and `getRedirectUrl()` omits `let`/`const`, creating an implicit global variable. In strict mode this would throw. In sloppy mode it works but is a latent bug — concurrent calls could clobber each other's `url` variable.
**Fix:** Change both to `const url = new URL(req.url)`.

*Note: These are pre-existing issues, not introduced in Sprint 3, but were found during review of the modified sw.js.*

---

## MEDIUM SEVERITY

### MED-1: Related posts "empty" message is unreachable dead code

**File:** `_layouts/post.html:131-133`
**What:** The second `{% if related.size == 0 %}` check at line 131 can never be true. If no tag-matched posts are found, the fallback at line 117 assigns ALL other site posts to `related`. The empty message `관련 글이 없습니다.` will never render unless the site has exactly one post total.
**Fix:** Either remove the dead code, or restructure to check before the fallback assignment:
```liquid
{% if related.size == 0 %}
    {% assign related = site.posts | where_exp: "p", "p.url != page.url" %}
    {% if related.size == 0 %}
        <p class="related-posts-empty">관련 글이 없습니다.</p>
    {% endif %}
{% endif %}
```

### MED-2: Tags page shows wrong tag label per post

**File:** `tags.html:52`
**What:** Inside each tag group, each post shows `{{ post.tags | first }}` as its category label. If a post's first tag is "Java" but it appears under the "Spring" group (because it also has "Spring"), the label shows "Java" — not the tag the user is currently browsing.
**Fix:** Show the current group tag name instead:
```liquid
<span class="tags-post-category">{{ tag_name }}</span>
```

### MED-3: Google Fonts `<link>` is still render-blocking

**File:** `_includes/head.html:106`
**What:** The comment says "non-blocking with display=swap" but `<link rel="stylesheet">` is inherently render-blocking. `display=swap` only affects font rendering behavior, not stylesheet loading. The font CSS file blocks first paint.
**Fix:** Use the `media` attribute trick for truly non-blocking loading:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"></noscript>
```

### MED-4: PWA manifest missing 192x192 icon

**File:** `pwa/manifest.json`
**What:** Chrome requires a 192x192 icon for "Add to Home Screen" prompts. The manifest only has 128x128 and 512x512. Chrome DevTools will flag this as a PWA installability error.
**Fix:** Add a 192x192 icon entry and generate the image file.

### MED-5: Maskable icon uses same image as regular icon

**File:** `pwa/manifest.json:17-22`
**What:** The maskable icon entry reuses `icons/512.png`. Maskable icons require extra padding (safe zone) — the inner 80% circle is what's guaranteed visible. Using a regular icon means the edges will get clipped on devices that use shaped masks.
**Fix:** Create a separate maskable icon with appropriate padding, or remove the maskable entry if no proper asset exists.

---

## LOW SEVERITY

### LOW-1: Critical CSS duplicated in two places

**Files:** `_includes/head.html:124-137` and `css/custom.css:8-21`
**What:** The CSS variables (`:root` block), `html { scroll-behavior }`, and `body { font-family, transition }` are defined identically in both the inline critical CSS and the external stylesheet. If one is updated without the other, styles will diverge.
**Fix:** Add a comment in both locations referencing the other, or extract the shared values.

### LOW-2: `.rp-date` style orphaned / `.rp-meta` styles may conflict

**File:** `css/custom.css:574`
**What:** The old `.related-post-card .rp-date` style at line 574 still exists, but the HTML now wraps the date inside `.rp-meta`. The new `.rp-meta` styles are added at line 1794. Both `.rp-date` definitions apply, which is harmless but creates maintenance confusion.
**Fix:** Remove the orphaned `.rp-date` rule at line 574 or consolidate with the new rules at line 1794+.

### LOW-3: Tags page scroll offset hardcoded

**File:** `tags.html:77`
**What:** `var offset = 80;` hardcodes the navbar height. If the navbar height changes (e.g., on mobile where it may collapse differently), the scroll offset will be wrong.
**Fix:** Dynamically calculate: `var offset = document.querySelector('.navbar').offsetHeight + 10;`

---

## SUMMARY

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 2 | 2 | 0 |
| High | 2 | 0 | 2 |
| Medium | 5 | 0 | 5 |
| Low | 3 | 0 | 3 |
| **Total** | **12** | **2** | **10** |

### Fixed in this QA pass:
- **CRIT-1:** Removed `defer` from `simple-jekyll-search.min.js` (search was completely broken)
- **CRIT-2:** Eliminated double-fetch in SW navigation handler

### Remaining action items for dev team:
1. **HIGH-1/HIGH-2:** Fix SW null safety and implicit globals
2. **MED-3:** Make Google Fonts truly non-blocking
3. **MED-4/MED-5:** Fix PWA icon requirements
4. **MED-1:** Clean up unreachable related posts empty state
5. **MED-2:** Fix tags page category label
