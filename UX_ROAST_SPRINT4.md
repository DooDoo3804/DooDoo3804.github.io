# UX Roast — Sprint 4

**Roaster:** Claude (Brutally Honest Mode)
**Date:** 2026-03-31
**Commits:** `3b82d1d`, `6058f9c`
**Verdict:** Lipstick on a ghost town. The UI upgrades are legitimately good, but they're decorating a blog that hasn't had a new post in nearly 3 years.

---

## 1. Featured Post Hero

**Score: 6/10** — Good idea, flawed execution

### What works
- The gradient overlay on the background image is tasteful. Not the usual "darken everything to black" approach.
- Read time + relative date in the meta line is smart. Shows you care about the reader's time.
- The CTA button has solid visual weight — white pill on dark bg pops correctly.
- Dark mode variant is well done. The `#58a6ff` CTA against `#0d1117` is clean.

### What doesn't
- **"Featured Post" is a lie.** It's `site.posts.first` — the latest post. That's not "featured," that's "most recent." You're using prestige language for a default sort. Either rename it to "Latest Post" or add a `featured: true` frontmatter flag and actually curate it.
- **Immediate duplication.** The featured post appears as the hero, then AGAIN as the first card in the "More Posts" grid directly below. The user sees the exact same title, excerpt, and tags twice in ~400px of scrolling. This is the kind of thing that makes a site feel auto-generated.
- **The excerpt is raw `content | strip_html | truncate: 200`.** On algorithm posts with code blocks, this will produce gibberish like "import java.util.* fun main() { val n = readLine()!!..." — that's not an excerpt, that's a code dump.
- **Hover lift on the entire hero is weird.** A 700px-wide card lifting 4px on hover feels like a UI glitch, not an interaction. Hero sections shouldn't bounce.
- **"Read Post →" is generic.** For a single featured item, you have room to be more specific. "Dive into Segment Trees →" would actually pull someone in.

### Fix applied
- ~~Skip the featured post from the "More Posts" grid to eliminate duplication~~ **FIXED** — first post now excluded from the card grid.

---

## 2. About Page Portfolio Cards

**Score: 5/10** — Still feels like homework, just with better CSS

### What works
- The skill badge color coding (Kotlin purple, Spring green, Java orange) is a nice touch. Instantly scannable.
- Project cards have a clean structure: icon → title → description → tags → link.
- The timeline component for education/experience is well-styled.

### What doesn't
- **All three "projects" are this blog or content from this blog.** "DooDoo IT Blog" is a project. "Algorithm Deep Dives" links to... posts on this blog. "Kotlin Study Notes" links to... a tag filter on this blog. You have one project pretending to be three. A recruiter will notice this in 2 seconds.
- **Experience section: "Personal Projects & Open Source, 2023~"** — that's not experience, that's a hobby disclaimer. If you don't have professional experience, remove the section entirely rather than filling it with a euphemism. An empty Experience section is less damaging than one that screams "I have nothing to put here."
- **"Currently Learning" overlaps with Tech Stack.** Spring Boot is in both "Backend" skill badges AND "Currently Learning" pills. Are you proficient or learning? Pick one. This inconsistency undermines credibility.
- **GitHub stats cards load from an external API** (`github-readme-stats.vercel.app`) — if that service is slow or down, your About page has two broken images in the middle of it. Also, these stats are a meme in serious dev circles. Contribution graphs don't prove skill.
- **The ☸ icon for Tech Stack and 🌱 for both Projects and Currently Learning** — you're reusing the seedling emoji for two different sections. It reads as sloppy.

### Fix applied
- ~~Deduplicated "Currently Learning" items that already appear in Tech Stack~~ **FIXED** — removed Spring Boot from Currently Learning since it's prominently listed in the Tech Stack Backend section.

---

## 3. Search UX

**Score: 8/10** — Genuinely the best thing in Sprint 4

### What works
- Keyboard shortcut `/` to open search is power-user gold. The hint bar below the input advertising it is the right call.
- Arrow key navigation with scroll-into-view is well-implemented. The active highlight state is clear.
- Staggered fade-in animations on results (`0.04s` per item) add polish without being slow.
- Empty state with "Browse by tags" and "View all posts" suggestions is exactly right — don't dead-end the user.
- The 150ms debounce is appropriate. Fast enough to feel instant, slow enough to not thrash.

### What doesn't
- **You have 6 posts.** The search infrastructure (full-page overlay, keyboard nav, 50-result limit, debounced input) is built for a 200-post blog. Right now it's a guided missile aimed at a hamster. But this is future-proofing done right, so no real complaint.
- **No search from the tag cloud page.** If someone is on `/tags/` and can't find what they want, there's no obvious path to search. The `/` shortcut works globally, but discoverability on the tags page is zero.
- **The close button is a chevron-down `fa-chevron-down`.** That's "expand more" in most design systems, not "close." Use `fa-times` or `fa-xmark`. A down-arrow to close an overlay is confusing.

### Fix applied
- ~~Changed close icon from chevron-down to times (×)~~ **FIXED** — close button now uses the universally understood × icon.

---

## 4. Tag Cloud

**Score: 4/10** — More like a tag drizzle

### What works
- Sorting by frequency (most-used first) is the correct default.
- Smooth scroll + highlight on click is a satisfying micro-interaction.
- The pluralization logic on post counts (`1 post` vs `3 posts`) is a small detail that shows care.

### What doesn't
- **5 tags. That's not a cloud, it's a puddle.** Algorithm (3), Graph (2), kotlin (2), java (1), react (1), Tree (1). The "cloud" is a single row of pills. It looks lonely, not organized.
- **The counts actively hurt you.** When every count badge says "1" or "2", you're advertising that the blog is empty. The counts would be valuable at 15+ posts per tag. At 1-2, they're just sad little numbers.
- **Inconsistent tag casing.** `Algorithm` (capitalized) vs `kotlin` (lowercase) vs `react` (lowercase). This comes from your frontmatter — some posts use `- Algorithm` and others use `kotlin`. The cloud inherits this mess and displays it proudly.
- **Tag category labels redundantly show the first tag** of each post (`tags-post-category`), which is the same as the group header you're already under. "Algorithm > [Algorithm] 2023.06.19 Segment Tree" — yes, we know it's Algorithm, you just told us.

### Fixes applied
- ~~Normalized tag casing in post frontmatter~~ **FIXED** — all tags now use consistent Title Case.
- ~~Hid post counts when total is under 5~~ Skipped — this requires Jekyll/Liquid logic changes that could break the layout. Recommend addressing when you have more content.

---

## 5. Footer

**Score: 7/10** — Clean, minimal, appropriate

### What works
- Circular icon buttons with hover lift are industry-standard done well.
- Four links (GitHub, LinkedIn, Email, RSS) is the right number. Not too sparse, not cluttered.
- "Built with Jekyll & ❤️" is inoffensive and honest.
- Dark mode treatment is solid — `#8b949e` to `#58a6ff` on hover feels native to GitHub's dark theme.

### What doesn't
- **It's a footer. It does footer things.** There's nothing wrong here, but there's also nothing memorable. It's the default Bootstrap-era centered-icons-and-copyright layout that 10,000 other Jekyll blogs use.
- **The RSS icon is the same visual weight as GitHub/LinkedIn.** RSS is a niche feature in 2026. It shouldn't be equal prominence with your primary social links. Consider making it text-only or smaller.
- **Copyright says "© 2026 DooDoo IT Blog"** — the blog name in a copyright line is fine, but the mismatch between "DooDoo IT Blog" in the footer and "DoYoon Kim" in the hero/about creates a split identity. Are you a person or a brand? Pick one for the footer.

---

## 6. Overall Verdict

### The elephant in the room

**You have 6 posts from 2023. It is now 2026.**

Every Sprint 4 improvement — the hero, the search, the tag cloud, the footer polish — is optimizing the container while the content is bone-dry. A visitor lands on your Featured Post Hero, sees "2 years ago" as the date, and immediately thinks "this blog is dead." No amount of smooth scroll animations or keyboard shortcuts fixes that signal.

The UX is now *ahead* of the content. That's backwards for a blog.

### What Sprint 4 got right
1. **Search UX is production-grade.** Keyboard nav, debounce, empty states — this is better than most professional blogs.
2. **Dark mode consistency.** Every new component has proper dark mode. No gaps.
3. **Responsive design is solid.** Mobile breakpoints are appropriate across all new components.

### What Sprint 4 got wrong
1. **The featured post duplication was an obvious miss** (now fixed).
2. **The About page oversells and underdelivers.** Three "projects" that are all this blog. "Experience" that's just hobby coding. "Currently Learning" that overlaps with "Tech Stack."
3. **The tag cloud highlights the content problem** instead of hiding it.

---

## Sprint 5 Recommendations (Priority Order)

### P0 — Write new content
Nothing else matters until you have 10+ posts. The entire site is a showcase for content that doesn't exist. Write 3-4 posts about Spring Boot, system design, or Docker — the things you say you're learning. Prove it.

### P1 — Fix the About page identity crisis
- Replace the three blog-link "projects" with at least one real project (even a small one — a REST API, a CLI tool, anything with its own repo that isn't this blog)
- Remove the Experience section or replace it with something real (internship, freelance, open source contribution with PR links)
- Remove GitHub stats cards — they add no credible signal
- Deduplicate Tech Stack vs Currently Learning completely

### P2 — Add a "Latest Activity" signal
- Show last commit date or last post date prominently on the homepage
- If the blog is actively maintained (you're sprinting on it!), surface that activity. Otherwise visitors assume it's abandoned.

### P3 — Reading experience
- Add proper excerpts in frontmatter instead of auto-truncating content (code blocks become gibberish excerpts)
- Add estimated read time to post cards (you have it in the hero but not in the grid)
- Consider a "series" feature for connected posts (your algorithm posts form a natural series)

### P4 — Kill the RSS CTA
The RSS subscribe banner between the author hero and featured post is prime real estate being wasted on a feature almost nobody uses. Replace it with a "Latest topics" or "Start here" section that actually helps new visitors navigate.

---

## Fixes Applied in This Roast

| Fix | File | What changed |
|-----|------|-------------|
| Featured post duplication | `index.html` | Skip first post from card grid since it's already shown in hero |
| Search close icon | `_includes/search.html` | Changed `fa-chevron-down` → `fa-times` (universal close icon) |
| Tag casing consistency | `_posts/kotlin/*.md`, `_posts/react/*.md` | Normalized tags to Title Case |
| Currently Learning overlap | `_includes/about/en.md`, `kr.md`, `ja.md` | Removed Spring Boot from Currently Learning (already in Tech Stack) |

---

*"Your blog's UX is now a sports car with no gas in the tank. Sprint 5 should be about fuel, not chrome."*
