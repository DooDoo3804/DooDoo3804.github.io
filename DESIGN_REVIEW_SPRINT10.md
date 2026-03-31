# Design Review — Sprint 10

**Reviewer**: Design Critic (harsh mode)
**Commits reviewed**:
- `faef617` categories page + remove pagination + color tokens
- `d757469` remove hover preview + lightbox + internal links

**Date**: 2026-03-31

---

## 1. Categories Page vs Tags Page — Visual Differentiation

**Verdict: FAIL — Copy-paste design**

categories.html and tags.html share 100% of the same CSS classes (`.tags-*`). The ONLY differences are the icon (folder vs tags), header text, and display name mapping. A user navigating between these two pages cannot tell them apart without reading the title.

**Issues found:**
- Same pill cloud layout, same group card layout, same post item layout, same colors
- Even the CSS class names say "tags" on the categories page — semantic confusion
- Heading levels were inconsistent: categories used `<h2>/<h3>`, tags used `<h3>/<h4>`

**Fixed now:**
- [x] Added `category-group` class with `border-left: 3px solid var(--accent-primary)` — categories groups now have an accent left border as a wayfinding signal
- [x] Normalized heading levels (`<h3>` for section title, `<h4>` for group titles) to match tags page

**Still needed (future sprint):**
- [ ] Categories deserve a fundamentally different layout — consider a grid of category cards with icons, post counts, and a brief description, rather than a clone of the tags pill+list pattern
- [ ] Rename `.tags-*` CSS classes to `.taxonomy-*` or extract shared styles so both pages can diverge without duplication

---

## 2. CSS Color Tokens — Consistency Audit

**Verdict: FAIL — Token system is decorative, not functional**

The token system existed in `:root` but was barely used in practice. Critical findings:

| Problem | Count |
|---------|-------|
| Hardcoded `#58a6ff` (dark accent) | **76+** occurrences, despite `--accent` token existing |
| Hardcoded `#0085a1` (light accent) | 17 occurrences in gradients/rgba |
| Hardcoded `#fff` (backgrounds) | 15+ with no surface token |
| Hardcoded `#333` (text) | 5+ with no text-primary token |
| Dead dark mode tokens (`--bg`, `--text`, `--card-bg`, `--border`, `--accent`) | **Defined but NEVER referenced** — 7 dead variables |

The second `[data-theme="dark"]` block (line ~1227) was entirely dead code — none of its tokens were used anywhere.

**Fixed now:**
- [x] Expanded `:root` with `--text-primary`, `--bg-surface`, `--bg-surface-raised`
- [x] Added `--accent-primary: #58a6ff` to dark mode — this is the single highest-impact change. All existing `var(--accent-primary)` references now automatically resolve correctly in dark mode
- [x] Added `--text-primary`, `--bg-surface`, `--bg-surface-raised` to dark mode
- [x] Updated `--border-light` dark value from `#333` to `#30363d` (matches actual GitHub dark border used throughout)
- [x] Updated `--text-secondary` dark value to `#8b949e` (was already overridden by dead block)
- [x] Removed dead second `[data-theme="dark"]` block (7 unused variables)
- [x] Tags/categories section fully tokenized — replaced all `#fff`, `#333` with tokens
- [x] Eliminated **50+ lines** of redundant dark mode overrides in tags section (from 68 lines down to ~18)

**Still needed (future sprint — estimated 4-6 hours):**
- [ ] Replace remaining 76 hardcoded `#58a6ff` values with `var(--accent-primary)` across ALL dark mode sections
- [ ] Tokenize post-card backgrounds (`#fff` → `var(--bg-surface-raised)`, eliminate dark overrides)
- [ ] Add `--accent-primary-alpha-*` tokens for rgba-based accent tints (shadows, highlights)
- [ ] Add semantic tokens: `--color-success`, `--color-warning`, `--color-error`
- [ ] Tokenize language/category gradient colors (currently inline hardcoded)

---

## 3. Lightbox Design

**Verdict: Acceptable, with polish issues**

The lightbox is functional and well-coded (vanilla JS, ESC close, body scroll lock, a11y attributes). However several design details were rough.

**Issues found:**
- Overlay at 0.85 opacity was slightly too light — content behind bled through
- No open animation — abrupt appearance felt cheap
- Caption: `#ccc` color had poor contrast against dark overlay, 14px too small for a modal context
- No visible close affordance — user had to discover click-to-close or ESC, not discoverable

**Fixed now:**
- [x] Increased overlay opacity to 0.92 — much stronger focus isolation
- [x] Added fade-in animation (0.2s ease) for overlay appearance
- [x] Added scale-in animation (0.25s, from 92% scale) for image entrance — feels intentional
- [x] Caption improved: `rgba(255,255,255,0.7)` color (better contrast), 15px font, italic style, tighter line-height
- [x] Added visible close button (X) top-right with hover state — immediately discoverable

**Still needed (future sprint):**
- [ ] Consider adding left/right arrow navigation if post has multiple images
- [ ] Move lightbox CSS to custom.css (currently inline `<style>` in post.html — architectural smell)

---

## 4. Card Design After Hover Preview Removal

**Verdict: PASS — Clean removal, no visual damage**

The hover excerpt was collapsed by default (`max-height: 0; opacity: 0`), so removing it leaves zero visible gap. Card structure is solid:

```
[Thumbnail: 16/9 aspect ratio]
[Body: tags → title → subtitle → excerpt → meta]
```

- Vertical rhythm intact: consistent 24px/28px padding
- Hover effect preserved: `translateY(-4px)` lift still provides satisfying feedback
- No orphaned spacing, no empty container divs
- Mobile-correct: the removed hover preview never worked on touch devices

**No fix needed.**

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `css/custom.css` | Expanded design token system (+8 new tokens in :root/dark) |
| `css/custom.css` | Removed 7 dead dark mode token definitions |
| `css/custom.css` | Tags section: replaced hardcoded colors with tokens, eliminated ~50 lines of redundant dark overrides |
| `css/custom.css` | Added `.category-group` left border accent |
| `_layouts/post.html` | Lightbox: fade/scale animations, improved caption, close button |
| `categories.html` | Added `category-group` class, fixed heading levels |

**Lines of CSS removed (net)**: ~55 lines of redundant dark mode overrides
**New tokens added**: `--text-primary`, `--bg-surface`, `--bg-surface-raised`, `--accent-primary` (dark override)

---

## Design Debt Backlog (ordered by impact)

1. **Token migration** — 76+ hardcoded `#58a6ff` values remain outside the tags section
2. **Categories page identity** — needs its own layout, not a tags-page clone
3. **Lightbox CSS extraction** — move from inline to custom.css
4. **Semantic class naming** — `.tags-*` used for both tags and categories is confusing
5. **Language gradient tokenization** — category thumbnail gradients are hardcoded
