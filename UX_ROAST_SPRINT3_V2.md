# UX ROAST V2 - Sprint 3 Post-Fix Audit | DooDoo IT Blog

**Date:** 2026-03-31
**Reviewer:** Brutally Honest UX Consultant (Second Pass)
**Scope:** Verify Sprint 3 UX fixes + find new issues
**Based on:** UX_FIX_SPRINT3.md applied changes

---

## Part A: Sprint 3 Fix Verification

### Fix #1 — Reading Stats Widget Removed from Posts
**Status: ✅ VERIFIED**
- `reading-stats.html` include is no longer in `_layouts/post.html`
- The widget still exists as a component (`_includes/reading-stats.html`) and has full CSS in `custom.css` (lines 3335–3435), but it's dead code now
- **Minor issue:** ~100 lines of orphaned CSS for `.reading-stats*` remain. Not user-facing, but bloat

### Fix #2 — Related Posts Header: Korean → English
**Status: ✅ VERIFIED**
- `post.html:97` → `<h4>Related Posts</h4>` ✓
- `post.html:129` → `No related posts found.` ✓
- Consistent with CATALOG, Share, Previous/Next labels

### Fix #3 — Post Title Truncation Relaxed (30 → 55 chars)
**Status: ✅ VERIFIED**
- `post.html:82,90` → `truncate:55` ✓
- Korean titles like `Kotlin 기본 문법 - 변수, 함수, 조건문, 반복문` will now show meaningful text

### Fix #4 — Language Inconsistency Fixed
**Status: ⚠️ PARTIALLY FIXED**
- ✅ Homepage description: `Software Developer` (was `「SW 개발자」`)
- ✅ Projects page description: `Projects & Learning Records`
- ✅ Projects empty state: English
- ❌ **Series page description still in Korean:** `"시리즈별로 묶어 보는 포스트 모음"` (`series.html:4`)
- ❌ **404 page subtitle still in Korean:** `"길을 잃었나요? 걱정 마세요, 좋은 곳들이 많습니다."` (`404.html:40`)
- ❌ **About page description still in Korean:** `"「변화를 두려워하지 않는 개발자」"` (`about.html:5`)
- ❌ **SEOTitle in `_config.yml` still Korean-first:** `개발 블로그 | DooDoo IT Blog`
- ❌ **`sidebar-about-description` still Korean:** `백엔드 개발자를 향한 여정` — this renders in the Author Hero on the homepage as the tagline, defeating the purpose of the English fix
- ❌ **`description` in `_config.yml` still all Korean** — used in meta tags and SEO
- ❌ **`keyword` in `_config.yml` still Korean** — `백엔드 개발, 알고리즘...`
- ❌ **PWA manifest description still Korean:** `백엔드 개발자를 향한 여정 - IT 개발 블로그`

**Verdict:** Only the most visible labels were touched. The meta/SEO layer and secondary pages remain Korean. The fix is skin-deep.

### Fix #5 — Friends Blog Empty Section
**Status: ✅ VERIFIED**
- `friends.html` properly guarded with `{% if site.friends %}`
- No empty section renders

### Fix #6 — Homepage Author Identity Hero
**Status: ✅ IMPLEMENTED (with issues — see Part B)**

### Fix #7 — Sidebar Avatar Hosted Locally
**Status: ⚠️ IMPLEMENTED BUT PROBLEMATIC**
- ✅ `img/avatar.gif` exists locally (627KB)
- ✅ `_config.yml` points to `/img/avatar.gif`
- ❌ **627KB for an avatar GIF is absurd.** That's larger than most hero images. A GIF avatar loaded on every page (homepage hero, sidebar, about page, short-about in page layout) means ~2.5MB of avatar downloads per session. This should be converted to WebP/AVIF or at minimum compressed. A 64x64 avatar should be <20KB.
- ❌ **No `width`/`height` on the Author Hero avatar image** (`index.html:11`) — the CSS sets `80x80` but without HTML attributes the browser can't reserve space, causing layout shift when the image loads

---

## Part B: Author Hero Section — Critical Review

### What works
- Side-by-side layout on desktop, stacked on mobile — good responsive pattern
- Pulls from existing `_config.yml` fields — DRY
- Dark mode support included
- Social links (GitHub, LinkedIn, Email) with icons

### Problems

#### B1. Tagline renders in Korean 🔴 (Severity: High)
The `sidebar-about-description` config value is `"백엔드 개발자를 향한 여정"` — the author hero displays this as the tagline. So the fix that was supposed to add English identity to the homepage... displays a Korean tagline. The `author-hero-topics` line is hardcoded English ("Writing about Backend Development, Algorithms..."), creating a Korean-then-English sandwich that's worse than fully Korean.

**Fix:** Either change `sidebar-about-description` to English or hardcode the hero tagline separately.

#### B2. No author name displayed 🔴 (Severity: High)
The hero has: avatar, tagline, topics, links. But **no name**. The whole point of the hero is "Hi, I'm DoYoon Kim, I write about..." — there's no name element. The user's identity is still anonymous on the homepage. The About page has `김도윤 (DoYoon Kim)` but the homepage hero skips the most important identity element.

#### B3. Avatar is a GIF of a cartoon character 🟡 (Severity: Medium)
For a personal developer portfolio blog, using a Noticon cartoon GIF instead of a real photo creates a mismatch with the professional tone of the rest of the site (LinkedIn link, skill bars, timeline). The About page reads like a resume, but the avatar says "casual anonymous internet user." This isn't necessarily wrong — but it's an identity inconsistency.

#### B4. Hero has no CTA 🟡 (Severity: Medium)
Three social links are nice, but there's no "Read my latest post" or "View all posts" call-to-action. The hero is a dead end — users see the tagline and then must scroll past it to find content. The hero introduces the author but doesn't guide the user anywhere.

#### B5. Hero lacks visual weight 🟡 (Severity: Medium)
The hero card (`rgba(0, 133, 161, 0.04)` background, `1px` border) is extremely subtle. On light mode, it's barely distinguishable from the page background. For the centerpiece of the homepage redesign, it should have more visual presence.

---

## Part C: NEW UX Issues Found

### C1. Mobile Category Filter Horizontal Scroll — No Scroll Indicator 🔴
**File:** `custom.css:3457`
The category filter on mobile uses `overflow-x: auto` with `flex-wrap: nowrap`. This creates a horizontally scrollable pill bar, but there's **no visual indicator that more pills exist off-screen**. Users won't know they can scroll. Same issue with `projects-filter` (line 3458).

**Fix:** Add a fade/gradient mask on the right edge, or use `flex-wrap: wrap` on mobile instead.

### C2. `<html lang="ko">` hardcoded 🟡
**File:** `_layouts/default.html:2`
The `lang` attribute is hardcoded to `ko`, but:
- Post content is mixed Korean/English
- The About page has KR/EN/JA language versions
- Many UI labels are now English
- International visitors get `lang="ko"` which tells screen readers and translation tools to treat everything as Korean

This should be `ko` if the blog is primarily Korean, but with the English-ification happening, it's becoming incorrect for accessibility tools.

### C3. OG Image Falls Back to Avatar GIF 🔴
**File:** `_includes/head.html:34`
When posts don't have `header-img` (none of the 6 posts do), the Open Graph image falls back to `{{ site.sidebar-avatar }}` which is `/img/avatar.gif`. When someone shares a post on Twitter/LinkedIn/Slack, the preview will show a 627KB cartoon GIF. This is a terrible social sharing experience. OG images should be 1200x630px static images, not tiny animated GIFs.

### C4. Post Cards Have No `data-tag` Attribute 🟡
**File:** `index.html:49`
The CSS defines tag-based gradient bars for post cards (`.post-card[data-tag="kotlin"]::before`, lines 1309-1317), but `index.html` never sets a `data-tag` attribute on `.post-card` elements. The tag-specific gradients (Kotlin: purple, Algorithm: dark blue, React: navy) never activate. Every card gets the default gradient.

### C5. Skill Bars STILL on the About Page 🟡
**File:** `_includes/about/kr.md:17-42`
The original UX Roast recommended: "Replace the percentage skill bars with a simple tech stack grid." The fix report didn't address this. The About page still shows animated percentage bars like `Kotlin: 85%`, `REST API: 80%`. These are universally mocked in the dev community. The CSS exists for both a badge-based layout (`.skill-badge*`) AND the bar-based layout (`.skill-bar*`) — the badge system was built but never adopted.

### C6. Search Input Placeholder Color in Light Mode 🟡
**File:** `custom.css:2758-2761`
The search hint fix (`color: rgba(0,0,0,0.4)`) only targets `.search-hint` and `.search-hint kbd`. But the search overlay background isn't styled for light mode — `search-page` has a dark background by default (from `hux-blog.min.css`), so light-mode users get white text on a dark overlay, which actually works. But the `search-hint` override makes the hint text appear as **dark text on a dark background** in light mode. This needs verification.

### C7. Mobile TOC & Back-to-Top Button Overlap Risk 🟡
**File:** `custom.css:1198-1212, 350-387`
- Mobile TOC toggle: `bottom: 20px; right: 20px; width: 45px; height: 45px`
- Back-to-top (with `.has-mobile-toc`): `bottom: 80px; right: 30px; width: 44px; height: 44px`

The offset works mathematically (80px vs 20px gives 60px gap), but both buttons are in the bottom-right corner. On phones with gesture navigation bars (most modern Android/iOS), `bottom: 20px` may overlap with the system gesture zone. Also, two floating buttons stacked vertically in the same corner is a cluttered pattern.

### C8. `async` Function Name Collides with JS Reserved Word 🟡
**File:** `_includes/footer.html:41-50`
The codebase defines a global function named `async` for script loading. While `async` isn't technically a reserved word in ES5 (it became one in ES2017), this is a ticking time bomb — any modern linting tool will flag it, and it can cause issues with strict-mode code or build tools that parse it as a keyword.

### C9. jQuery and Bootstrap Still Loaded Sync 🟡
**File:** `_includes/footer.html:22-28`
- jQuery loads synchronously (render-blocking)
- Bootstrap has `defer` but depends on jQuery
- `simple-jekyll-search.min.js` loads synchronously

With jQuery being ~87KB minified, this blocks first meaningful paint on every page. The blog uses jQuery for catalog generation, mobile TOC, and search — all non-critical. These should be deferred.

### C10. Series Page Description in Korean 🔴
**File:** `series.html:4`
`description: "시리즈별로 묶어 보는 포스트 모음"` — this renders in the page header. Given the English-ification effort, this was missed.

### C11. Empty State UX for Filter Is Bare 🟡
**File:** `index.html:73-75`
```html
<div class="filter-no-results" style="display:none;">
    <p>No posts found for this category.</p>
</div>
```
Compare this to the Projects page empty state which has an icon (`<i class="fa fa-search">`), or the 404 page terminal mockup. The homepage empty state is just a paragraph with no icon, no suggestion to try "All", no personality. Inconsistent with other empty states.

### C12. Post Excerpt on Cards Shows Raw Stripped HTML Artifacts 🟡
**File:** `index.html:61`
`{{ post.content | strip_html | truncate:120 }}` — `strip_html` can leave behind artifact whitespace, double spaces, or partial entities. For code-heavy posts (like the Segment Tree post), the excerpt may show `코드 for (int i = 0; i n; i++) tree...` — stripped code without context.

---

## Part D: Performance Concerns

### D1. Avatar GIF: 627KB
Already flagged. This is the single biggest performance issue. On a 3G connection, the avatar alone takes ~3 seconds.

### D2. Font Awesome Kit (Remote JS)
**File:** `_includes/head.html:152`
Font Awesome loads via a JS kit (`kit.fontawesome.com`), which:
1. Makes a network request to FA's CDN
2. Downloads and injects CSS dynamically
3. Has `defer` but still blocks icon rendering until JS executes
This adds ~150-250ms to icon rendering. For the ~15 icons used across the site, a subset SVG sprite or self-hosted CSS would be faster.

### D3. Google Fonts (External)
**File:** `_includes/head.html:106`
Inter (5 weights) + JetBrains Mono (2 weights) load from Google Fonts. This is render-blocking even with `display=swap` because the CSS itself blocks. Consider self-hosting the fonts.

### D4. No `width`/`height` on Images = Layout Shift
- Author Hero avatar (`index.html:11`): no HTML width/height
- About page GitHub stats cards: no fixed dimensions, loaded from external CDN
- Post card grid: no images, so this is fine
- Short-about avatar (`short-about.html:6`): has `width="100" height="100"` ✓

### D5. CSS is ~3,400 lines, Unminified
`custom.css` is 3,462 lines of unminified CSS. That's ~90KB+ of CSS. On top of `hux-blog.min.css` and `bootstrap.min.css`, this is a heavy payload. The reading-stats CSS (~100 lines), skill-badge CSS (not used), and other dead code add to this.

---

## Part E: Accessibility Quick Scan

### E1. Focus Visible ✅
`:focus-visible` is defined (`custom.css:2753`). Good.

### E2. Touch Targets ✅ (Mostly)
- Category buttons: `min-height: 44px` ✓
- Share buttons: `min-height: 44px` ✓
- Back-to-top: `44x44` ✓
- Mobile TOC toggle: `45x45` ✓
- **But:** Nav links in collapsed mobile menu have no explicit min-height. The hamburger `icon-bar` spans are default Bootstrap size which may be <44px.

### E3. ARIA Labels ✅ (Mostly)
- Back-to-top: has `aria-label` ✓
- Search input: has `aria-label` ✓
- Mobile TOC toggle: has `aria-label` and `aria-expanded` ✓
- Skill bars: have full ARIA progressbar attributes ✓
- **Missing:** Dark mode toggle has `title` but no `aria-label`

### E4. Color Contrast 🟡
- Post card excerpt text: `#555` on `#fff` = 7.5:1 ✓
- Post card meta date: `#999` on `#fff` = 2.8:1 ❌ (fails WCAG AA for normal text)
- Author hero topics: `#666` on `rgba(0,133,161,0.04)` ≈ `#666` on `#fcfefe` = 5.7:1 ✓
- Category filter inactive: `#666` on `#fff` = 5.7:1 ✓
- Tag pill count: `#999` on subtle bg ≈ fails AA

---

## Updated Scores

| Area | V1 Score | V2 Score | Notes |
|------|----------|----------|-------|
| First Impression | 2/5 | 3/5 | Hero helps, but missing name + Korean tagline undercut it |
| Navigation & Wayfinding | 3/5 | 3/5 | Series page still exists, same 5 nav items |
| Reading Experience | 3/5 | 3.5/5 | Reading stats removed, truncation fixed — improvements landed |
| Trust & Credibility | 2/5 | 2/5 | Skill bars still there, content still stale |
| Engagement & Retention | 2/5 | 2/5 | No new engagement mechanism added |
| Content Discovery | 2/5 | 2/5 | Same structure, same 6 posts |
| Micro-interactions & Polish | 4/5 | 4/5 | Maintained quality, no regressions |

**Overall: 2.8/5** (was 2.6/5 — marginal improvement)

---

## TOP 5 Actionable Fixes (Code-level, can be done now)

### 1. Fix Author Hero — Add Name, Fix Korean Tagline
Add the author's name to the hero. Change the tagline to English or add a dedicated English field.

### 2. Fix Remaining Language Inconsistencies
- `series.html:4` → English description
- `404.html:40` → English subtitle
- `about.html:5` → English or bilingual description
- `_config.yml` → English-first SEOTitle, keyword, sidebar-about-description

### 3. Add `data-tag` to Post Cards for Gradient Activation
The CSS is already written for tag-specific card gradients — just needs the HTML attribute.

### 4. Fix Homepage Empty State
Add icon, improve messaging, match the quality of other empty states.

### 5. Add `width`/`height` to Author Hero Avatar
Prevent layout shift with explicit dimensions.

---

*The Sprint 3 fixes addressed surface-level English labels but didn't touch the deeper issues: SEO metadata is still all Korean, the author hero is missing the author's name (its raison d'être), skill bars remain, and the avatar GIF is now locally hosted but at 627KB. The fixes were correct in direction but shallow in execution. The blog went from 2.6 to 2.8 — a polishing pass, not a transformation.*
