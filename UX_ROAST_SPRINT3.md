# UX ROAST - Sprint 3 | DooDoo IT Blog

**Date:** 2026-03-31
**Reviewer:** Brutally Honest UX Consultant
**Site:** https://doodoo3804.github.io

---

## Gut Reaction

I landed on this blog and thought "decent-looking Jekyll blog that's trying hard to be modern" — but within 5 seconds I noticed the homepage tells me absolutely nothing about who you are or why I should read your posts, and the 6-post library spread across scattered categories makes the entire site feel like a ghost town pretending to be a content hub.

---

## 1. First Impression (0-3 seconds)

**Rating: 2/5**

- **The homepage has zero identity.** The header says `「SW 개발자」` which is a cryptic subtitle that means nothing to an international visitor and barely anything to a Korean one. There's no author photo, no name, no "Hi, I'm DoYoon, I write about backend engineering." Nothing. I have to click About to learn who runs this blog.
- **The hero gradient header takes up the entire viewport** on most screens — a massive band of dark blue-to-teal with just a blog title and that one subtitle. Below the fold? Post cards. So your first impression is essentially a screensaver with a title bar.
- **No value proposition above the fold.** Compare this to dev.to — within 1 second you see posts, community, topics. Here I see a gradient wall and have to scroll to discover anything exists.
- **The description in `_config.yml` is entirely in Korean** (`백엔드 개발을 향한 여정...`). For SEO and for anyone arriving from an English Google result, this is invisible content. The SEOTitle says "개발 블로그 | DooDoo IT Blog" — the English part is buried behind Korean text.
- **Category filter pills on the homepage** — nice idea, but with only ~6 posts total across 3 categories, filtering makes the blog look emptier than it is. When I click "Kotlin" and see 2 cards, the reaction is "that's it?"

---

## 2. Navigation & Wayfinding

**Rating: 3/5**

- **Nav items are auto-generated from pages** and the order is unpredictable. I see: Home, About, Projects, Series, Tags. That's 5 top-level items for a blog with 6 posts. The navigation-to-content ratio is absurd.
- **"Series" vs "Tags" — what's the difference?** Series is "tags that have 2+ posts." Tags is "all tags." So they overlap almost entirely. A new user has no idea which one to click. This is confusing IA. Pick one.
- **No "Archive" link in the main nav** even though archive functionality exists (the footer has an RSS link but the main nav doesn't expose an obvious chronological view).
- **Search is hidden behind an icon** with no text label. The keyboard shortcut (`/`) is nice for power users, but most visitors will never discover it. The search icon is the same size as the dark mode toggle, making both look like utility icons rather than primary navigation.
- **The nav hamburger menu on mobile** uses custom JS that replaces Bootstrap's built-in toggle. If this breaks, mobile users have zero navigation. Risky.
- **Positive:** The dark mode toggle in the nav is well-placed and the glassmorphism effect on scroll-fixed navbar looks decent.

---

## 3. Reading Experience

**Rating: 3/5**

- **Typography is solid.** Inter at 16.5px with 1.85 line-height is very readable. JetBrains Mono for code is a good choice. No complaints on font selection.
- **But the post header is overwhelming.** Every post page shows: a full-viewport gradient header, then a "Reading Stats" widget (total blog posts, total read time, top tags), then the actual content. The reading stats widget is blog-level metadata on a post page — who cares about your total post count when I'm trying to read about Segment Trees?
- **Code blocks are well-styled** — language labels, copy button on hover, left accent border. This is one of the better-executed features.
- **The reading progress bar** at the top of post pages is nice but barely visible at 3px height. It works, but most users won't notice it.
- **Mobile reading should be okay** based on the CSS — you have responsive grid breakpoints and the mobile TOC toggle is a good touch. But the mobile TOC button at `bottom: 20px; right: 20px` will likely overlap with the back-to-top button (`bottom: 30px; right: 30px`) — the CSS tries to offset this with `.has-mobile-toc` but this is fragile.
- **Related posts section title is in Korean** (`관련 글`) even when the rest of the page structure uses English labels (CATALOG, Share, etc.). Inconsistent language mixing throughout.
- **Post pager shows "Previous/Next"** with truncated titles at 30 characters. Truncating post titles to 30 chars is too aggressive — `"Kotlin 기본 문법..."` tells me nothing.

---

## 4. Trust & Credibility

**Rating: 2/5**

- **Only 6 posts total**, all from mid-2023. It's now March 2026. That's over 2.5 years with no new content. This blog looks abandoned. No amount of UI polish fixes a dead blog.
- **The About page is impressive in structure** but thin on substance. You list "Personal Projects & Open Source" under Experience, but the only evidence is this blog itself and an algorithm repo. That's not a portfolio; that's homework.
- **Skill bars are a red flag.** Self-assessed skill bars (Kotlin: 85%, Java: 80%) are universally mocked in the dev community. They communicate nothing useful and actively hurt credibility. Every senior dev who sees "REST API: 80%" will cringe.
- **GitHub stats cards** embedded as images from `github-readme-stats.vercel.app` are a nice touch but they load from a third-party service that frequently goes down. When it's down, you get broken images right in your About page.
- **The education section says "재학 중" (Currently enrolled)** with no university name, no expected graduation date. This is the vaguest possible education entry.
- **The "Experience" section lists one entry:** personal projects since 2023. If you have no professional experience, that's fine — but framing personal projects as "Experience" in a professional-looking timeline creates a credibility gap.
- **No blog post dates on the homepage cards** that would make the staleness obvious... wait, they ARE there. `June 19, 2023`, `July 11, 2023`. Yeah, this screams abandoned blog.

---

## 5. Engagement & Retention

**Rating: 2/5**

- **After reading a post, what do I do next?** The post footer throws everything at you: Series Navigation, Share buttons, Previous/Next pager, Related Posts, Featured Tags, and a Friends section. It's a wall of CTAs with no clear hierarchy. The one thing you want me to do (read another post) is buried under all this noise.
- **Series Navigation is duplicated** — it appears both inline in the post AND as a concept on the dedicated Series page. Within a post, it's useful. But the "Series" nav page itself is just a worse version of the Tags page.
- **Comments use Utterances** (GitHub-backed), which means only people with GitHub accounts can comment. That's a deliberate choice for a dev blog, but it limits engagement.
- **No email subscription, no RSS prominently featured, no "follow me" CTA** anywhere on the homepage. RSS exists in the footer but it's tiny and nobody reads footers.
- **The share buttons (Copy Link, Twitter/X, LinkedIn)** are a good set, but they're at the bottom of the post. By the time someone scrolls to them, they've already moved on.
- **There is literally no reason to come back.** The most recent post is from August 2023. No content cadence, no upcoming series teased, no "subscribe for updates."

---

## 6. Content Discovery

**Rating: 2/5**

- **With 6 posts, you don't need a content discovery system. You need content.** The homepage filter, the Tags page, the Series page, and the Archive page are all different ways to browse the same 6 posts. It's over-engineered infrastructure for a Hello World amount of content.
- **The tag system is confusing.** Posts use tags like `algorithm`, `kotlin`, `react`. But the Tags page, Series page, and homepage filter all present them differently. The Tags page groups posts under each tag. The Series page only shows tags with 2+ posts. The homepage filter does client-side filtering. Three UI paradigms for the same data.
- **Search works** and the implementation (Simple Jekyll Search with highlight matching) is decent. But with 6 posts, search is overkill.
- **The filter pills on the homepage use lowercase tag names** while the Tags page uses original casing. `kotlin` vs `Kotlin`. Inconsistent.

---

## 7. Micro-interactions & Polish

**Rating: 4/5**

- **This is where the blog actually shines.** The CSS work is genuinely good:
  - Post cards lift on hover with smooth shadow transitions
  - The gradient accent bar on post cards is a nice detail
  - Back-to-top button with smooth appearance
  - Dark mode implementation is thorough (every component has dark variants)
  - Page content fade-in animation
  - Code copy button that appears on hover with success state
  - Tag pills with hover lift effects
  - The 404 page terminal mockup is creative and well-executed
  - Keyboard shortcut for search (`/` and `Esc`)
  - Dark mode respects system preference AND saves to localStorage
  - No flash of wrong theme on load (the inline script in `<head>` handles this)
- **The "No posts found" empty state** on the homepage filter is bare — just a plain text `<p>`. Compare this to the delightful 404 page. The empty state deserves better.
- **The projects page "no results" message is in Korean** while filter buttons are in English. Language inconsistency strikes again.
- **Loading states are missing.** When Utterances comments load, there's no skeleton or spinner. When GitHub stats images load on the About page, there's no placeholder. Images have lazy loading attributes but no visual loading state beyond the opacity transition.

---

## Overall Score: 2.6/5

| Area | Score |
|------|-------|
| First Impression | 2/5 |
| Navigation & Wayfinding | 3/5 |
| Reading Experience | 3/5 |
| Trust & Credibility | 2/5 |
| Engagement & Retention | 2/5 |
| Content Discovery | 2/5 |
| Micro-interactions & Polish | 4/5 |

---

## TOP 5 UX Improvements (Prioritized by Impact)

### 1. WRITE MORE CONTENT (Critical)
**Impact: Everything depends on this.**
No UX improvement matters if the blog has 6 posts from 2023. Write at least 2-3 posts per month. A beautiful empty restaurant is still an empty restaurant. Until you have 20+ posts, most of the infrastructure you've built (Series, Tags, filters, search) is wasted scaffolding. The single most impactful "UX improvement" is clicking New Post in your editor.

### 2. Add a Homepage Hero with Author Identity
**Impact: First impression goes from "generic blog" to "someone's blog."**
Replace the anonymous gradient header with a compact hero section that includes:
- Your name and a one-line tagline (in English, or bilingual)
- A brief "I write about X, Y, Z" value proposition
- Links to GitHub/LinkedIn
- Your avatar (you already have it in the sidebar config)

The current homepage makes visitors guess what this blog is about and who writes it. This should take 30 minutes to implement and it changes everything about the first 3 seconds.

### 3. Consolidate Navigation — Kill "Series" Page, Simplify Tags
**Impact: Reduces confusion, makes the site feel intentional instead of over-built.**
You have 5 nav items for 6 posts. Merge:
- Remove the dedicated "Series" page. The in-post series nav already handles this.
- Keep "Tags" but make it the primary discovery mechanism.
- Consider combining Homepage + Tags into one unified view.
- The goal: Home, About, Projects, Tags. Four items. Clean.

### 4. Remove Self-Assessed Skill Bars from About Page
**Impact: Stops actively hurting your credibility.**
Replace the percentage skill bars with a simple tech stack grid (icons + names, no percentages). Or better yet, let your projects and blog posts demonstrate your skills instead of self-reporting numbers. "Kotlin: 85%" means nothing. A blog post solving a hard Kotlin problem means everything.

### 5. Fix Language Inconsistency
**Impact: Makes the blog feel polished instead of half-translated.**
The blog is a jarring mix of Korean and English with no clear pattern:
- Config description: Korean
- Nav items: English
- Post titles: Korean
- Related posts header: Korean (`관련 글`)
- Empty states: Korean
- Share buttons: English
- Page titles: English
- 404 subtitle: Korean

Pick a primary language and be consistent. Since the About page already has a multilingual toggle (KR/EN/JA), use that pattern site-wide, or commit to Korean with English technical terms. The current random mix looks unfinished.

---

## Honorable Mentions (Fix These Too)

- **Remove the Reading Stats widget from post pages.** Blog-level stats don't belong on individual posts.
- **Make the RSS feed more visible** if you want subscribers — put it in the nav or homepage hero, not buried in the footer.
- **The "Friends Blog" include** in the post layout is empty (no friends configured). Either add friends or remove the include to avoid rendering an empty section.
- **Post title truncation at 30 chars** in the Previous/Next pager is too aggressive. Bump it to 50-60.
- **The sidebar avatar** is a Noticon GIF hosted on tammolo.com. If that CDN goes down, your avatar disappears everywhere. Host it locally.
- **PWA manifest exists** but with 6 posts, nobody is "installing" your blog as an app. The service worker adds complexity for zero real-world benefit at this scale.

---

*Bottom line: You've built a sports car chassis and forgot to put an engine in it. The CSS is clean, the dark mode is thorough, the micro-interactions are polished. But the content is nonexistent, the information architecture is over-engineered for 6 posts, and the identity crisis (Korean? English? Both?) makes the whole thing feel like a demo template rather than a real developer's blog. Ship content, not features.*
