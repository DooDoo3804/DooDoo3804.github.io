# UX Roast - Sprint 7

**Date:** 2026-03-31
**Commits:** `a9988ab` (dynamic OG tags + card dedup + new-post script), `0c73f62` (404 improvement + breadcrumb fix + lighthouse script)

---

## 1. Card Tag Dedup

**What was done:** CSS rule hides `.post-card-tags` pills when a thumbnail is present, to avoid duplication with the gradient thumb label.

### The Good
- Correct instinct. Showing "Algorithm" as a gradient label AND as a pill below is redundant visual noise.
- The gradient thumb labels are big, bold, and scannable — they do the job better than tiny pills.

### The Roast

**FIXED: Selector was too greedy.** The original rule targeted `.post-card-thumb + .post-card-body .post-card-tags` — which hides tags on ALL thumbnails, including real image thumbnails that have NO tag label. If someone adds a `thumbnail:` to a post tomorrow, their tags vanish for no reason. Fixed to `.post-card-thumb--gradient` only.

**Multi-tag posts lose discoverability.** The gradient label shows only the FIRST tag. "Floyd Warshall" is tagged `Algorithm, Graph` but the card only shows "Algorithm". "Kotlin vs Java" is tagged `Kotlin, Java` but only shows "Kotlin". The second tag is invisible on the homepage. With only 6 posts, every signal matters.

**Verdict: 5/10.** Right idea, wrong scope. The dedup reduces noise for single-tag posts but silently kills information for multi-tag posts. With 6 posts, losing a tag label means losing ~17% of your categorization surface.

**Recommendation:** Show secondary tags as small subtle pills below the gradient label, or add secondary tags to the gradient overlay itself.

---

## 2. 404 Page

**What was done:** Added search bar + recent posts list to the custom terminal-themed 404 page. Now has: terminal mockup + search + recent posts + subtitle + 4 action buttons.

### The Good
- Terminal theme is genuinely clever and on-brand for a dev blog. The `git log --grep` joke lands.
- Search on 404 is a legitimate recovery pattern (GitHub, Notion, Stripe all do this).
- Recent posts give concrete escape routes instead of just "go home."
- Dynamic path injection (`error-path`) is a nice detail.

### The Roast

**Information overload.** Count the escape hatches: search bar + 3 recent posts + "Lost? Don't worry" text + Home button + Posts button + About button + Projects button. That's **8 recovery options** on a page whose job is to say "wrong turn, here's the way back." You're treating a 404 like a landing page.

**Visual flow is disconnected.** The terminal says "Maybe try one of these?" and then... the search box? There's no visual connection between the terminal's prompt and the content below. The terminal ends with a blinking cursor suggesting more typing, but the actual interaction (search) is outside the terminal. It's a cognitive split.

**Search is over-engineered for 6 posts.** You built a full SimpleJekyllSearch instance for a blog with 6 posts. The recent posts section already shows 3 of them (50% of all content). The search adds complexity for marginal gain.

**The subtitle is buried.** "Lost? Don't worry — there's plenty of good stuff to explore" sits between the recent posts and the buttons, where nobody will read it. It's a dead sentence.

**Verdict: 6/10.** The terminal is the hero element and it's good. But everything below it is a wall of "please don't leave" that screams insecurity. Pick ONE recovery mechanism and commit to it. At 6 posts, recent posts alone are enough — the search bar is premature.

**Recommendation:** Cut the search bar for now. Move "Recent Posts" directly under the terminal (tighter coupling). Reduce buttons to 2 (Home + Posts). Re-add search when you hit 15+ posts.

---

## 3. Breadcrumb

**What was done:** Changed breadcrumb from tag-based (always shown) to series-based (only shown when post has `series` field AND 2+ posts share that series).

### The Good
- Correct diagnosis. A breadcrumb that says `Blog > Algorithm > Floyd Warshall` on every post added zero navigational value when clicking "Algorithm" just goes to a filtered archive.
- Gating on `series` with a 2+ threshold is the right pattern. Breadcrumbs should imply a hierarchy, and a single post in a "series" isn't a series.

### The Roast

**It's dead code.** Zero posts have the `series` field in their frontmatter. You shipped a breadcrumb system that literally never renders. This is architecture without execution.

**The series navigation (lines 47-74 in post.html) still uses tags, not series.** The breadcrumb uses `page.series` but the series nav block at the bottom still groups by `page.tags | first`. Now you have two systems: breadcrumbs care about `series`, series nav cares about first tag. Pick one source of truth.

**Verdict: 4/10.** Theoretically sound, practically zero impact. You wrote the system and didn't use it. The old tag-based breadcrumb at least showed up. This one is a ghost.

**Recommendation:** Either add `series:` to your Kotlin and Algorithm posts right now (they're natural series), or remove the breadcrumb code until you're ready. Dead code is tech debt that looks like a feature.

---

## 4. Dynamic OG Tags

**What was done:** Split OG/Twitter meta tags into `post` vs `else` branches. Posts get `article` type, excerpt-based descriptions (150 chars), published_time, author, and per-tag `article:tag` metas. Non-posts get `website` type with page/site description fallback.

### The Good
- Proper `og:type` differentiation (article vs website) — this is what Facebook/LinkedIn crawlers want.
- `article:published_time`, `article:author`, `article:tag` — full Article Object compliance.
- Truncating to 150 chars for OG description is correct (Facebook truncates at ~155).
- Dropping site name from `og:title` for posts is right — social previews show `og:site_name` separately.
- The `| {{ site.title }}` separator for non-post pages is better than ` - {{ site.SEOTitle }}` for brand consistency.

### The Roast

**All roads lead to `og-default.png`.** Zero posts have `thumbnail` or `header-img`. Every social share shows the same generic fallback image. You optimized the description and title while the image — which drives 90% of click-through on social — is identical across all posts. The OG tags are technically correct and visually useless.

**Description inconsistency.** The `<meta name="description">` tag (line 6) truncates at 160 chars. The `og:description` truncates at 150 chars. The `twitter:description` truncates at 150 chars. The JSON-LD `description` truncates at 200 chars. Four different truncation lengths for the same content. Pick one.

**No `og:locale` variation.** You have Korean posts (`Kotlin 기본 문법`) but `og:locale` is hardcoded to `en_US`. This doesn't break anything but it's a missed signal for Korean social platforms.

**Verdict: 7/10.** This is the best Sprint 7 change. The implementation is structurally correct and follows platform specs. But it's like putting premium tires on a car with no engine — the missing per-post images mean the fancy metadata doesn't translate to better social previews in practice.

**Recommendation:** Create per-post OG images (even auto-generated text-on-gradient images would beat a generic fallback). That's where the real social sharing ROI lives.

---

## 5. Overall Sprint 7 Assessment

| Feature | Impact | Execution | Verdict |
|---------|--------|-----------|---------|
| Card tag dedup | Medium | Buggy selector | 5/10 |
| 404 page | Low | Over-engineered | 6/10 |
| Breadcrumb fix | Zero | Dead code | 4/10 |
| Dynamic OG | Medium | Solid but no images | 7/10 |
| **Sprint average** | | | **5.5/10** |

**Sprint 7 theme: Infrastructure without activation.** You built the OG system but didn't add images. You built the series breadcrumb but didn't add series. You built 404 search for 6 posts. There's a pattern of over-investing in systems before you have the content to justify them.

**The 385 lines added this sprint are 60% CSS for the 404 page.** That's a lot of visual polish for a page most users will never see. Meanwhile, the actual reading experience (the posts themselves) got zero attention.

### Fixes Applied This Sprint
1. **Card tag dedup selector** — Changed `.post-card-thumb` to `.post-card-thumb--gradient` so image thumbnails retain visible tags
2. **Duplicate dark mode CSS** — Removed redundant `[data-theme="dark"] .error-404-content .btn-home` rule (line ~1440) that was a weaker duplicate of the rule at line ~894

---

## 6. Sprint 8 Recommendations

**Focus: Content-level impact over infrastructure.**

### P0 — High Impact, Low Effort
1. **Per-post OG images** — Auto-generate text-on-gradient images (title + tag + blog name). Use a build script or even static SVG-to-PNG. This single change makes your OG tag work actually pay off. ROI: massive for social sharing.
2. **Add `series:` frontmatter to existing posts** — Your Kotlin posts (2) and Algorithm/Graph posts (2) are natural series. Add the field, activate the breadcrumb you already built. ROI: free, code already exists.
3. **Multi-tag visibility on cards** — Show secondary tags as subtle text or small pills below the gradient label. Don't let multi-tag posts lose discoverability.

### P1 — Medium Impact
4. **Content: write a new post** — 6 posts in 3 years. The best UX improvement for a blog is more content. All these infrastructure investments (search, series nav, tag filtering) are designed for 20+ posts. You're at 6.
5. **404 simplification** — Remove search bar, keep terminal + recent posts + 2 buttons (Home, Posts). Re-add search at 15+ posts.
6. **Description truncation consistency** — Pick 155 chars for all description meta tags (meta description, og:description, twitter:description, JSON-LD).

### P2 — Nice to Have
7. **Korean locale support** — Add `og:locale:alternate` for Korean posts, or auto-detect based on content.
8. **Image thumbnails for posts** — Even simple header images would differentiate cards visually and activate the image-thumb code path.
9. **Lighthouse CI integration** — You shipped `lighthouse-check.sh` but it's manual. Hook it into a pre-push or CI workflow.

**TL;DR for Sprint 8: Stop building systems for content you don't have. Write posts, generate OG images, activate the series you already built.**
