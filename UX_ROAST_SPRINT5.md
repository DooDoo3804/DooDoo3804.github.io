# UX Roast — Sprint 5

**Date:** 2026-03-31
**Commit:** f1c43b7 (Sprint 5 - activity signal + mobile share + tag stats + Start Here section)
**Roaster:** UX Roaster (automated)

---

## The Uncomfortable Truth

You have **6 posts from 2023** and you just built a Start Here section, a floating share bar, tag stats, and an activity signal. That's like installing a chandelier in a studio apartment. The infrastructure-to-content ratio is wildly inverted.

---

## 1. Start Here Section

**Verdict: Noise, bordering on harmful**

- **"Where to Begin"** implies there's a rich content maze to navigate. There are 6 posts. A visitor can see all of them without scrolling.
- **"Most popular posts"** under Algorithms — popular according to what? You don't have analytics displayed. There are exactly 3 algo posts. That's the *entire* catalog, not a curated selection.
- **"Kotlin Series — From basics to JVM"** — there are 2 Kotlin posts. Two posts is not a series. "From basics to JVM" overpromises what is actually "one syntax post and one comparison."
- The 3-card grid directly above the Featured Post hero creates a visual stack of: hero bio + Start Here + Featured Post + category filter + post grid. That's **5 layers of navigation** before a user sees the second post card. For 6 posts.

**Fixes applied:**
- "Where to Begin" -> "Quick Links" (honest, low-commitment label)
- "Most popular posts" -> "Trees, graphs & more" (describes actual content)
- "Kotlin Series / From basics to JVM" -> "Kotlin / Syntax & Java comparison" (matches reality)

**Remaining concern:** Consider removing this section entirely until you have 15+ posts. Right now it's a speed bump, not a shortcut.

---

## 2. Mobile Floating Share Bar

**Verdict: Over-engineered for 2 buttons**

- A floating pill bar with backdrop-filter blur, box-shadow, and slide-up animation... for a copy-link button and an X/Twitter icon. Two buttons don't justify a persistent floating element.
- **Appears at 50% scroll** — this is way too late. If someone wants to share, they've already decided before the halfway mark. By 50% they're either committed to finishing or already bounced.
- The copy-link duplicates the static share section already embedded in the post layout.
- On iOS Safari with the bottom address bar, `bottom: 24px` may collide with browser chrome on some scroll states.

**Fix applied:**
- Threshold lowered from 50% to 15% scroll — catches readers while they're still engaged, not after they've mentally checked out.

**Remaining concern:** Two icon-only buttons with no labels on mobile is an accessibility gap. Users may not recognize what the icons do without tapping. Consider adding a LinkedIn button to justify the bar's existence, or removing the bar and enhancing the static share section instead.

---

## 3. Last Updated Signal

**Verdict: Helpful now, ticking time bomb**

- `last_updated: "March 2026"` in `_config.yml` is a **manually maintained** value. The moment you forget to update it after a deploy, it becomes a lie.
- Right now it's useful — it signals "yes, this 2023-era blog is still alive." For a small blog with old posts, that reassurance matters.
- But "March 2026" with no day is vague. Is it March 1 or March 31? For a freshness signal, imprecision works against you.
- This will absolutely go stale. You'll push a commit in May and forget to change the string. Then it *actively hurts* — "Last updated: March 2026" in June tells visitors the blog is abandoned.

**No fix applied** — the value is currently accurate. But strongly recommend:
- Auto-deriving this from `site.time` (Jekyll build timestamp) so it's always truthful
- Or deriving from `site.posts.first.date` (most recent post date) for content-based freshness

---

## 4. Tag Stats

**Verdict: Actively harmful — highlights low content count**

- Tags page displayed: **"Showing 6 posts across 6 tags"** — this mathematically proves you average 1 post per tag. It screams "scattered and thin."
- Individual tag pill counts: Algorithm (3), Kotlin (2), React (1), Graph (2), Tree (1), Java (1). Half your tags have exactly 1 post. Showing "1" next to a tag badge is the equivalent of a restaurant proudly displaying "1 review."
- The tag cloud sorted by frequency with counts works great at scale (50+ posts). At 6 posts, it's a microscope on your emptiness.

**Fixes applied:**
- Summary line changed from exposing raw numbers ("Showing 6 posts across 6 tags") to neutral "Browse posts by topic"
- Tag pill count badges hidden via CSS when count is 1 — no point advertising single-post tags

---

## 5. Single Biggest Remaining UX Gap

**The blog over-promises and under-delivers.**

Every Sprint adds polished UI features: hero sections, category filters, series navigation, floating share bars, Start Here sections, tag clouds. The blog *looks* like it has 50+ posts. Then you scroll and find 6. This creates a trust gap — the visitor's first impression is "this looks professional and active" but their second impression is "wait, there's nothing here."

**The fix isn't UX — it's content.** But until content catches up, the UX strategy should be *minimizing navigation layers*, not adding them. Every new navigation feature (Start Here, tag cloud, category filter) makes the content-to-chrome ratio worse.

**Tactical recommendation:** Freeze all new UI features until you hit 15 posts. Spend Sprint 6 writing posts, not polishing the container.

---

## Fixes Applied in This Sprint

| # | Issue | Fix |
|---|-------|-----|
| 1 | "Where to Begin" overpromises | Changed to "Quick Links" |
| 2 | "Most popular posts" is unverifiable | Changed to "Trees, graphs & more" |
| 3 | "Kotlin Series / From basics to JVM" implies depth that doesn't exist | Changed to "Kotlin / Syntax & Java comparison" |
| 4 | Tags page "Showing 6 posts across 6 tags" highlights emptiness | Changed to "Browse posts by topic" |
| 5 | Tag pill count "1" badges advertise thin content | Hidden via CSS when count is 1 |
| 6 | Mobile share bar appears at 50% (too late to be useful) | Threshold lowered to 15% |

---

## Severity Summary

| Feature | Severity | Status |
|---------|----------|--------|
| Start Here labels misleading | Medium | Fixed |
| Tag stats self-defeating | High | Fixed |
| Mobile share bar timing | Low | Fixed |
| Last updated will go stale | Medium | Noted (needs auto-derive) |
| Over-navigation for content volume | High | Structural — needs content |
