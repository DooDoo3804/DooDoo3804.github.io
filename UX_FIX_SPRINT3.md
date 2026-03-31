# UX Fix Report - Sprint 3

**Date:** 2026-03-31
**Based on:** UX_ROAST_SPRINT3.md

---

## Changes Made

### 1. Reading Stats Widget Removed
**File:** `_layouts/post.html`
- Removed `{% include reading-stats.html %}` from post pages
- Blog-level stats (total posts, total read time, top tags) don't belong on individual post pages — they distract from the content

### 2. Related Posts Header: Korean → English
**File:** `_layouts/post.html`
- Changed `<h4>관련 글</h4>` → `<h4>Related Posts</h4>`
- Changed `관련 글이 없습니다.` → `No related posts found.`
- Consistent with other English UI labels (CATALOG, Share, Previous/Next)

### 3. Post Title Truncation Relaxed
**File:** `_layouts/post.html`
- Previous/Next pager title truncation increased from 30 → 55 characters
- 30-char truncation was too aggressive for Korean post titles (e.g., `"Kotlin 기본 문법..."` is useless)

### 4. Language Inconsistency Fixed
**Files:** `_layouts/post.html`, `projects.html`, `index.html`
- Projects page empty state: `해당 기술 스택의 프로젝트가 없습니다.` → `No projects found for this tech stack.`
- Projects page description: `개발 프로젝트 & 학습 기록` → `Projects & Learning Records`
- Homepage description: `「SW 개발자」` → `Software Developer`

### 5. Friends Blog Empty Section
**File:** `_includes/friends.html`
- Already correctly guarded with `{% if site.friends %}` — no empty section renders when `friends` is not configured in `_config.yml`
- No code change needed

### 6. Homepage Author Identity Hero
**Files:** `index.html`, `css/custom.css`
- Added author hero section below the header with: avatar, tagline, topic summary, and social links (GitHub, LinkedIn, Email)
- Pulls data from existing `_config.yml` fields (`sidebar-avatar`, `sidebar-about-description`, `github_username`, etc.)
- Responsive layout: side-by-side on desktop, stacked on mobile
- Dark mode support included

### 7. Sidebar Avatar Hosted Locally
**Files:** `_config.yml`, `img/avatar.gif` (new)
- Downloaded avatar GIF from `noticon-static.tammolo.com` CDN to `img/avatar.gif`
- Updated `sidebar-avatar` config from external URL to `/img/avatar.gif`
- Eliminates dependency on third-party CDN that could go down

---

## Files Changed

| File | Change |
|------|--------|
| `_layouts/post.html` | Removed reading-stats include, English labels, title truncation 55 chars |
| `_config.yml` | Local avatar path |
| `index.html` | Author hero section, English description |
| `projects.html` | English empty state and description |
| `css/custom.css` | Author hero styles + dark mode + responsive |
| `img/avatar.gif` | New — locally hosted avatar |
