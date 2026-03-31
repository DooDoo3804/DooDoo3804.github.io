# Design Review — Sprint 9

**Reviewer:** Design Critic (10+ years visual design)
**Date:** 2026-03-31
**Scope:** Visual design only — color, typography, spacing, layout, dark mode, mobile

---

## Verdict: 7.5 / 10 — Solid foundation, sloppy in the details

This blog is well above average for a dev blog. The design system exists, dark mode is thorough, and the component library is cohesive. But a professional eye catches inconsistencies that erode the "polished" feeling you're clearly going for.

---

## 1. COLOR PALETTE

### What works
- **Light mode accent** `#0085a1` (teal) is distinctive without being garish. Good choice for a backend dev blog — technical, calm, trustworthy.
- **Dark mode** uses the GitHub dark palette (`#0d1117`, `#161b22`, `#30363d`, `#c9d1d9`, `#58a6ff`) — this is smart. Developers immediately feel at home. Extremely well-executed.
- **Tag-specific gradients** (Kotlin purple `#7b2ff7→#b388ff`, Algorithm blue `#1a73e8→#4fc3f7`) give visual variety without chaos.

### What's wrong

**Too many grays in light mode.** You have at least 8 distinct gray values used for "secondary text":

| Context | Color |
|---|---|
| `.post-card .post-subtitle` | `#666` |
| `.post-card-excerpt` | `#555` |
| `.author-hero-tagline` | `#555` |
| `.author-hero-topics` | `#666` |
| `.about-tagline` | `#666` |
| `.about-intro` | `#777` |
| `.error-subtitle` | `#777` |
| `.start-here-desc` | `#888` |
| `.post-card-meta` | `#999` |
| `.related-posts h4` | `#999` |
| `.filter-no-results-hint` | `#bbb` |

**Pick 3 and stick with them.** Suggestion: `#333` (primary), `#666` (secondary), `#999` (tertiary/muted). Kill `#555`, `#777`, `#888`, `#aaa`, `#bbb`.

**Same problem with border colors:**

| Color | Usage |
|---|---|
| `#e8e8e8` | post-card, related-post-card, contact-link |
| `#e0e0e0` | category-btn, tag pills |
| `#e1e4e8` | code blocks, pagination, series-card |
| `#eee` | category-filter divider, skill-category, timeline-content |
| `#f0f0f0` | post-card-meta, related-posts divider, about-section-title |
| `#f5f5f5` | archive year items, mini-post-list hr |

**That's 6 border shades.** You need 2: a structural border (`#e1e4e8`) and a subtle divider (`#f0f0f0`). The rest is visual noise.

**The secondary accent `#7b2ff7` (purple) feels orphaned.** It appears in the gradient, Kotlin badges, and `post-updated` text — but nowhere else. It's not earning its place as a true secondary color. Either commit to it (use it in CTAs, headings, or interactive states) or drop it and make `--accent-secondary` a darker shade of teal.

### Fixed
- No color hex fixes needed — the values themselves are fine, the problem is organizational.

---

## 2. TYPOGRAPHY

### What works
- **Inter** is an excellent choice. Clean, highly legible, large x-height. Perfect for a dev blog.
- **JetBrains Mono** for code — perfect pairing.
- **Heading letter-spacing** `-0.02em` is correct for tightening large text.
- **Post `line-height: 1.85`** — generous but works. Technical content needs breathing room.

### What's wrong

**CRITICAL BUG: Inter weight 800 is not loaded, but used in 3 places.**

```html
<!-- head.html line 124 -->
<link href="...family=Inter:wght@300;400;500;600;700..." />
```

But the CSS uses `font-weight: 800` on:
- `.author-hero-name` (line 130): `font-weight: 800`
- `.featured-post-title` (line 3928): `font-weight: 800`
- `.about-name` (line 2259): `font-weight: 800`

**The browser is faux-bolding these.** Faux bold looks terrible — the strokes are uniformly thickened instead of optically adjusted. On some browsers it's barely distinguishable from 700; on others it's a smudgy mess.

**`font-size: 16.5px`** on `.post-container` (line 24) is a non-standard value. It's not wrong per se, but `16px` or `17px` aligns better with the 4px/8px spacing grid everything else is built on. This is minor.

### Fixed
- **Added `800` weight to Inter font load** in `head.html` (line 124). This is the highest-impact visual fix in this review.

---

## 3. SPACING & WHITESPACE

### What works
- Card internal padding (`24px 28px 28px`) is generous — cards don't feel cramped.
- Grid gaps are consistent: `24px` for main grids, `8-10px` for tight pill groups.
- Section margins (`40-48px`) provide good rhythm.
- Mobile breakpoints reduce padding proportionally — well handled.

### What's wrong

**`.filter-no-results-reset` has `border-radius: 6px`** (line 4449) while literally every other button/pill in the system uses `20px+` border-radius. This button looks like it was forgotten during a design system pass.

**`.about-hero` padding inversion on mobile.** Desktop has `padding: 20px 0 40px` (line 2253), but the mobile override at 768px changes it to `padding: 40px 20px` (line 4493). The mobile version has **double** the top padding of desktop. Feels like an oversight — mobile should have less top padding, not more.

### Fixed
- **`.filter-no-results-reset` border-radius** changed from `6px` to `20px` to match system pill buttons.
- **`.about-hero` mobile padding** changed from `40px 20px` to `20px 20px` to be proportional to desktop.

---

## 4. LAYOUT & GRID

### What works
- **Progressive column system**: 1→2 columns (post cards), 1→2→4 (related posts), 1→2→3 (projects). Responsive and logical.
- **CSS Grid everywhere** — no float hacks, no flexbox grid substitutes. Modern and clean.
- **Bootstrap grid** for main layout containers (col-lg-8 offset-2) works fine with the newer CSS Grid components nested inside.

### What's wrong
- Nothing major. The grid is solid.
- Minor: the `col-lg-8 col-lg-offset-2` approach means post content maxes out at ~730px wide. This is fine for text but code blocks often need more horizontal space. Not a CSS fix — more of an architectural observation.

---

## 5. COMPONENT DESIGN

### What works
- **Post cards**: The gradient accent bar (`::before` with 3px height) is a nice touch. Tag-specific gradient colors (Kotlin purple, Algorithm blue) add personality. Hover animations are smooth (0.25s ease).
- **Featured post hero**: Bold, confident. Dark gradient overlay on images works well. CTA button is high-contrast.
- **404 terminal**: Delightful. The macOS-style dots, monospace font, blinking cursor — this is the best-designed component on the site.
- **Pagination**: Clean numbered design. Current page indicator is clear.
- **Search overlay**: Keyboard hints, empty state with suggestions, staggered result animations — this is well-thought-out.
- **Share buttons**: Pill shape with brand colors on hover (Twitter black, LinkedIn blue).
- **Reading progress bar**: Thin (3px), gradient accent, stays out of the way.

### What's wrong
- **Hover excerpt preview** (`.post-card-hover-excerpt`) uses `max-height` animation which can cause janky rendering if the content height doesn't match. The `max-height: 80px` is arbitrary — if the actual content is 40px, there's a perceptible delay before the animation "catches up." Use `grid-template-rows: 0fr → 1fr` for smoother height animation in modern browsers.
- **Mobile floating share bar** is a nice idea but `border-radius: 28px` feels slightly overdone. At `padding: 8px 16px` with 40px buttons, the aspect ratio makes it look like a capsule. `border-radius: 20px` would look more intentional.

---

## 6. DARK MODE

### What works
- **Arguably the best part of this site.** The GitHub dark palette is executed with surgical precision. Every component has a dark override. The color mappings are consistent:
  - `#0d1117` → page bg
  - `#161b22` → card/elevated bg
  - `#30363d` → borders
  - `#c9d1d9` → body text
  - `#8b949e` → secondary text
  - `#e6edf3` → headings
  - `#58a6ff` → accent/links
  - `#21262d` → subtle dividers
- **The accent shift** from teal (`#0085a1`) to blue (`#58a6ff`) in dark mode is smart — blue has better contrast against dark backgrounds.
- **Navbar glassmorphism** (`backdrop-filter: blur(14px)`) works in both modes.
- **Dark mode flash prevention** in head.html is properly implemented.

### What's wrong
- **Disqus dark mode uses `filter: invert(0.88) hue-rotate(180deg)`** (line 1513). This is a hack and it shows — images, avatars, and colored elements inside Disqus will look inverted and wrong. However, you've switched to Utterances (which has native theming), so this Disqus rule is dead code. **Remove it.**
- **The brand identity changes between modes.** Teal in light, blue in dark. A visitor who bookmarks the site in light mode and returns in dark mode might not immediately recognize it. This is a conscious trade-off and acceptable, but worth acknowledging.

### Fixed
- **Removed dead Disqus dark mode filter hack** (was line 1512-1514).

---

## 7. BRAND CONSISTENCY

### Overall
The site feels cohesive. The Inter + JetBrains Mono pairing, teal accent, and card-based layout create a recognizable identity. The "developer terminal" aesthetic (404 page, code blocks with language labels) is consistent with the backend dev positioning.

### What's weak
- The secondary purple (`#7b2ff7`) doesn't feel integrated. It appears in 4 places across 4663 lines of CSS. Either promote it or demote it.
- The `.author-hero-updated` text (line 4157, `font-size: 12.5px`) is another non-round value. `12px` or `13px` please.

### Fixed
- **`.author-hero-updated` font-size** changed from `12.5px` to `13px`.

---

## 8. MOBILE VISUAL DESIGN

### What works
- Breakpoints are thoughtful. Cards go single-column, hero text scales down, filters become horizontally scrollable.
- Touch targets: category buttons get `min-height: 44px` — correct per Apple HIG.
- Mobile floating share bar with glassmorphism looks great.
- Start-here cards collapse to single column below 480px.

### What's wrong
- **Category filter horizontal scroll** (line 4498) removes `flex-wrap` on mobile. This is functionally correct but the `overflow-x: auto` doesn't have a visual scrollbar indicator. Users won't know there are more filters. Consider adding a gradient fade on the right edge or `scrollbar-width: thin`.
- **`.post-card-body` padding stays at `24px 28px 28px`** on mobile — no mobile override. On a 320px screen, that's `28px * 2 = 56px` of horizontal padding on a card that's already inside Bootstrap's container padding. Text gets squeezed. Should reduce to `16px 20px 20px` below 576px.

### Fixed
- **Added mobile padding reduction** for `.post-card-body` at 576px breakpoint.

---

## Summary of Fixes Applied

| Issue | File | Fix |
|---|---|---|
| Inter weight 800 not loaded | `_includes/head.html:124` | Added `800` to font weight range |
| `.filter-no-results-reset` border-radius `6px` | `css/custom.css:4449` | Changed to `20px` |
| `.about-hero` mobile padding inverted | `css/custom.css:4493` | `40px 20px` → `20px 20px` |
| Dead Disqus `filter: invert` hack | `css/custom.css:1512-1514` | Removed |
| `.author-hero-updated` font-size `12.5px` | `css/custom.css:4157` | Changed to `13px` |
| `.post-card-body` no mobile padding | `css/custom.css` | Added 576px breakpoint |

## Not Fixed (Require Broader Refactor)

| Issue | Why |
|---|---|
| 8+ gray text values in light mode | Needs CSS variable audit across full file |
| 6+ border color values | Same — needs variable consolidation |
| Orphaned purple secondary accent | Design decision, not a bug |
| `font-size: 16.5px` on post-container | Intentional? Leave for now |
| Hover excerpt `max-height` jank | Needs JS + CSS refactor |
| Category filter no scroll indicator on mobile | Needs additional CSS + pseudo-element |
