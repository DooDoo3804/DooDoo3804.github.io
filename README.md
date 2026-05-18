# DooDoo IT Blog

Backend development blog by DoYoon Kim — notes on algorithms, data structures, Kotlin, Java, Spring Boot, and system design.

**Live:** [doodoo3804.github.io](https://doodoo3804.github.io)

## Tech Stack

- **Static Site Generator:** Jekyll (kramdown, jekyll-paginate)
- **Styling:** Bootstrap 3, Less, custom CSS (4400+ lines)
- **JavaScript:** jQuery, Simple Jekyll Search, custom modules
- **Hosting:** GitHub Pages (via GitHub Actions CI/CD)
- **Comments:** Giscus (GitHub Discussions-backed)
- **Fonts:** Inter, JetBrains Mono (Google Fonts)
- **Icons:** Custom SVG sprite (`icons.svg`)

## Features

- Dark mode with system preference detection and manual toggle
- PWA support (service worker, offline page, Web App Manifest)
- Full-text search overlay with keyboard shortcuts
- Series navigation for multi-part posts
- Tag-based category filtering on homepage
- Featured post hero section
- Reading progress bar and estimated read time
- Code block enhancements (language labels, copy button, line numbers)
- Responsive card-based layout
- Related posts and breadcrumb navigation
- Share buttons (copy link, X/Twitter, LinkedIn)
- Mobile floating share bar and mobile TOC
- SEO optimized (Open Graph, Twitter Card, JSON-LD structured data)
- Back-to-top button
- Giscus comment system (GitHub Discussions-backed, dark mode sync)
- Category page with unique color accent per category
- RSS feed with full content and author metadata
- CSS color token system (`--color-accent`, `--color-link`, etc.) for consistent theming

## Password-Protected Pages

Specific pages can be password-protected using [StatiCrypt](https://github.com/robinmoisson/staticrypt). This encrypts the page content client-side so a password prompt appears before the content is shown.

**How to protect a page:** Add `protected: true` to the page's front matter:

```yaml
---
layout: page
title: My Secret Page
protected: true
---
```

**How to build with encryption:**

```bash
PASSWORD=mypassword make build
```

This runs `jekyll build` then encrypts all pages marked `protected: true` in `_site/`.

> **Note:** This is client-side encryption. It protects against casual access but not determined attackers who inspect the page source. Do not use it for highly sensitive data.

## Deployment

The site is automatically built and deployed via GitHub Actions on every push to `master`. The workflow builds Jekyll, encrypts protected pages with StatiCrypt, and deploys to GitHub Pages.

### Initial Setup

1. **Set GitHub Pages source to Actions:**
   Go to repo `Settings → Pages → Source` and select **GitHub Actions**.

2. **Configure the encryption password (optional):**
   Go to repo `Settings → Secrets and variables → Actions → New repository secret`.
   Name: `PAGE_PASSWORD`, Value: your desired password.

3. **Verify deployment:**
   Check the `Actions` tab in the repo to see build/deploy status.

If `PAGE_PASSWORD` is not set, protected pages will be deployed without encryption.

## Local Development

```bash
# Install dependencies
bundle install

# Serve locally with live reload
bundle exec jekyll serve

# Site will be available at http://localhost:4000
```

## Giscus 댓글

Giscus 댓글 시스템은 `_config.yml`의 `giscus` 섹션에 설정 완료 상태. GitHub Discussions 기반으로 동작하며, 다크모드 자동 연동됨.

## License

Apache License 2.0. Copyright (c) 2015-present Huxpro

Derived from [Clean Blog Jekyll Theme (MIT License)](https://github.com/BlackrockDigital/startbootstrap-clean-blog-jekyll/) by Blackrock Digital LLC.
