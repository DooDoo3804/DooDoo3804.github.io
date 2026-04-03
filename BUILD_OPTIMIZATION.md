# Build Optimization Status

## Current CSS Bundle Sizes

| File                  | Size (bytes) | Notes                              |
|-----------------------|-------------:|-------------------------------------|
| `bootstrap.min.css`   |      117,150 | Already minified                    |
| `hux-blog.min.css`    |       28,463 | Minified via Grunt LESS             |
| `custom.css`          |      119,421 | Source (not served)                 |
| `custom.min.css`      |       ~89 KB | Minified via Grunt cssmin           |
| **Total served**      |    ~235 KB   |                                     |

## What Was Done (Sprint 16)

### 1. `custom.css` Minification
- Added `grunt-contrib-cssmin` to `Gruntfile.js` + `package.json`
- `custom.css` -> `custom.min.css` (saves ~25%)
- `head.html` now references `custom.min.css`
- Grunt `watch` monitors `css/custom.css` and re-minifies on change

**Action required**: Run `npm install` then `npx grunt cssmin` to regenerate with proper clean-css minification.

### 2. GoatCounter Analytics
- Conditional loading: only when `goatcounter.enabled: true` and code is not placeholder
- Localhost/127.0.0.1 skip guard (no tracking in dev)
- Placeholder warning comment when code is not yet set

## Recommended Next Steps

### PurgeCSS for Bootstrap (High Impact)

Bootstrap is 117KB but this blog likely uses <30% of its classes. PurgeCSS could reduce it to ~20-30KB.

**Why it's not done yet**: PurgeCSS needs to scan all HTML output (_site/) after Jekyll build, which means it must run as a post-build step. The current Grunt workflow runs independently of Jekyll.

**Recommended approach**:
```bash
npm install --save-dev @fullhuman/postcss-purgecss postcss postcss-cli
```

Add a `postcss.config.js`:
```js
module.exports = {
  plugins: [
    require('@fullhuman/postcss-purgecss')({
      content: ['_site/**/*.html'],
      safelist: {
        // Keep dynamically-added classes
        greedy: [/^hljs/, /^rouge/, /^giscus/, /^fa-/, /^col-/, /^navbar/,
                 /dark/, /show/, /active/, /collapse/, /modal/]
      }
    })
  ]
}
```

Add to Makefile:
```makefile
build-prod:
	bundle exec jekyll build
	npx postcss _site/css/bootstrap.min.css -o _site/css/bootstrap.min.css
	bash scripts/encrypt-pages.sh "$(PASSWORD)"
```

**Risk**: PurgeCSS can remove classes that are added dynamically via JS. The `safelist` above covers known dynamic patterns, but requires testing.

### Image Optimization (Medium Impact)

Not in scope for this sprint, but worth noting:
- Consider adding `grunt-contrib-imagemin` or using an external tool
- WebP conversion for post header images

### Font Subsetting (Low Impact)

Google Fonts are already loaded with `display=swap`. Further optimization would involve self-hosting subsetted font files, which adds maintenance burden for marginal gain.
