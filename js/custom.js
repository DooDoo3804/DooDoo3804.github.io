/* ========================================
   DooDoo IT Blog - Custom JavaScript
   ======================================== */

(function() {
    'use strict';

    /* --- Dark Mode --- */
    var THEME_KEY = 'doodoo-blog-theme';

    function getStoredTheme() {
        try { return localStorage.getItem(THEME_KEY); } catch(e) { return null; }
    }

    function storeTheme(theme) {
        try { localStorage.setItem(THEME_KEY, theme); } catch(e) { /* silent */ }
    }

    function getPreferredTheme() {
        var stored = getStoredTheme();
        if (stored) return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        storeTheme(theme);
        updateToggleIcon(theme);
        updateGiscusTheme(theme);
    }

    function updateGiscusTheme(theme) {
        var giscusFrame = document.querySelector('iframe.giscus-frame');
        if (!giscusFrame) return;
        var giscusTheme = theme === 'dark' ? 'transparent_dark' : 'light';
        giscusFrame.contentWindow.postMessage(
            { giscus: { setConfig: { theme: giscusTheme } } },
            'https://giscus.app'
        );
    }

    function updateToggleIcon(theme) {
        var btn = document.querySelector('.dark-mode-toggle i');
        if (!btn) return;
        btn.className = theme === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    }

    function initDarkMode() {
        // Theme is already applied by inline script in head.html (FOUC prevention)
        // updateToggleIcon deferred to DOMContentLoaded to ensure toggle button exists

        document.addEventListener('click', function(e) {
            var toggle = e.target.closest('.dark-mode-toggle');
            if (toggle) {
                e.preventDefault();
                // Spin animation on toggle
                toggle.classList.add('toggling');
                var fallback = setTimeout(function() { toggle.classList.remove('toggling'); }, 600);
                toggle.addEventListener('animationend', function() {
                    clearTimeout(fallback);
                    toggle.classList.remove('toggling');
                }, { once: true });
                var current = document.documentElement.getAttribute('data-theme');
                setTheme(current === 'dark' ? 'light' : 'dark');
            }
        });

        // Follow OS theme changes when user hasn't set a manual preference
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (!getStoredTheme()) {
                var newTheme = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                updateToggleIcon(newTheme);
                updateGiscusTheme(newTheme);
            }
        });
    }

    /* --- Back to Top --- */
    function initBackToTop() {
        var btn = document.getElementById('back-to-top');
        if (!btn) return;

        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    if (window.scrollY > 300) {
                        btn.classList.add('visible');
                    } else {
                        btn.classList.remove('visible');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });

        btn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* --- Code Block Language Labels --- */
    function initCodeLabels() {
        var pres = document.querySelectorAll('.post-container pre');
        pres.forEach(function(pre) {
            var code = pre.querySelector('code');
            if (!code) return;

            // detect language from class
            var classes = code.className || '';
            var match = classes.match(/language-(\w+)/);
            if (match) {
                var lang = match[1].toUpperCase();
                var label = document.createElement('span');
                label.className = 'code-lang-label';
                label.textContent = lang;
                pre.insertBefore(label, pre.firstChild);
            }
        });
    }

    /* --- Code Block Line Numbers --- */
    function initLineNumbers() {
        var codeBlocks = document.querySelectorAll('.post-container pre > code');
        codeBlocks.forEach(function(code) {
            if (code.classList.contains('has-line-numbers')) return;
            var text = code.textContent;
            if (!text || text.split('\n').length <= 2) return;

            // Preserve syntax highlighting: split innerHTML on newlines,
            // wrap each line in a span (keeps Rouge <span> tags intact)
            var html = code.innerHTML;
            // Remove trailing newline to avoid empty last line
            html = html.replace(/\n$/, '');
            var lineHtmls = html.split('\n');

            code.innerHTML = lineHtmls.map(function(lineHtml) {
                return '<span class="code-line">' + lineHtml + '\n</span>';
            }).join('');
            code.classList.add('has-line-numbers');
        });
    }

    /* --- Screen Reader Announcement --- */
    function announceToSR(msg) {
        var el = document.getElementById("sr-status");
        if (el) { el.textContent = msg; setTimeout(function(){ el.textContent = ""; }, 2000); }
    }

    /* --- Enhanced Copy Button (replaces footer.html version) --- */
    function fallbackCopy(text, onSuccess, onFail) {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        try {
            if (document.execCommand("copy")) { onSuccess(); } else if (onFail) { onFail(); }
        } catch(e) {
            if (onFail) onFail();
        }
        document.body.removeChild(ta);
    }

    function copyToClipboard(text, btn) {
        var orig = btn.innerHTML;
        function onSuccess() {
            btn.innerHTML = "\u2713 Copied!";
            btn.classList.add('copy-btn--success');
            btn.setAttribute('aria-label', 'Copied!');
            announceToSR("클립보드에 복사됐습니다");
            setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copy-btn--success'); btn.setAttribute('aria-label', 'Copy code to clipboard'); }, 1500);
        }
        function onFail() {
            btn.textContent = "Failed";
            setTimeout(function() { btn.innerHTML = orig; }, 1500);
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(function() {
                fallbackCopy(text, onSuccess, onFail);
            });
        } else {
            fallbackCopy(text, onSuccess, onFail);
        }
    }

    function initCopyButtons() {
        var pres = document.querySelectorAll('.post-container pre');
        pres.forEach(function(pre) {
            // skip if already has copy button
            if (pre.querySelector('.copy-btn')) return;

            var btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copy';
            btn.setAttribute('aria-label', 'Copy code to clipboard');
            pre.appendChild(btn);

            btn.addEventListener('click', function() {
                var code = pre.querySelector('code');
                var text;
                if (code) {
                    text = code.textContent;
                } else {
                    var copyBtn = pre.querySelector('.copy-btn');
                    if (copyBtn) copyBtn.hidden = true;
                    text = pre.textContent;
                    if (copyBtn) copyBtn.hidden = false;
                }
                copyToClipboard(text, btn);
            });
        });
    }

    /* --- Reading Progress Bar --- */
    function initReadingProgress() {
        var bar = document.getElementById('reading-progress-bar');
        if (!bar) return;

        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    var scrollTop = window.scrollY || document.documentElement.scrollTop;
                    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                    if (docHeight < 50) { bar.style.display = "none"; return; }
                    var pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
                    bar.style.width = pct + '%';
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /* --- Image Lazy Loading --- */
    function initLazyImages() {
        var postContainer = document.querySelector('.post-container');
        var imgs = document.querySelectorAll('img:not([loading])');
        imgs.forEach(function(img, i) {
            var inPost = postContainer && postContainer.contains(img);
            // Skip first image in post content (likely above the fold)
            if (inPost && i === 0) {
                img.setAttribute('decoding', 'async');
                return;
            }
            img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
        });
    }

    /* --- Post Share Buttons --- */
    function initShareButtons() {
        var shareBtns = document.querySelectorAll('.share-btn--copy');
        shareBtns.forEach(function(btn) {
            btn._origHTML = btn.innerHTML;
        });
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.share-btn--copy');
            if (!btn) return;
            e.preventDefault();
            var url = btn.getAttribute('data-url');
            var origHTML = btn._origHTML || btn.innerHTML;
            function onSuccess() {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                btn.classList.add('share-btn--copied');
                announceToSR("클립보드에 복사됐습니다");
                setTimeout(function() {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('share-btn--copied');
                }, 2000);
            }
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(onSuccess).catch(function() {
                    fallbackCopy(url, onSuccess);
                });
            } else {
                fallbackCopy(url, onSuccess);
            }
        });
    }

    /* --- Mobile Floating Share Bar --- */
    function initMobileShareBar() {
        var bar = document.getElementById('mobile-share-bar');
        if (!bar) return;

        var copyBtn = bar.querySelector('.mobile-share-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                var url = this.getAttribute('data-url');
                var btn = this;
                var icon = btn.querySelector('i');
                function onSuccess() {
                    icon.className = 'fa-solid fa-check';
                    btn.classList.add('mobile-share-btn--copied');
                    announceToSR("클립보드에 복사됐습니다");
                    setTimeout(function() {
                        icon.className = 'fa-solid fa-link';
                        btn.classList.remove('mobile-share-btn--copied');
                    }, 1500);
                }
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(url).then(onSuccess).catch(function() {
                        fallbackCopy(url, onSuccess);
                    });
                } else {
                    fallbackCopy(url, onSuccess);
                }
            });
        }

        var ticking = false;
        var footer = document.querySelector('.site-footer') || document.querySelector('footer');

        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    var scrollY = window.scrollY || window.pageYOffset;
                    var docHeight = document.documentElement.scrollHeight;
                    var viewportHeight = window.innerHeight;
                    var scrollPct = docHeight > viewportHeight ? scrollY / (docHeight - viewportHeight) : 0;

                    var nearFooter = false;
                    if (footer) {
                        var footerRect = footer.getBoundingClientRect();
                        nearFooter = footerRect.top < viewportHeight + 60;
                    }

                    if (scrollPct >= 0.15 && !nearFooter) {
                        bar.classList.add('visible');
                    } else {
                        bar.classList.remove('visible');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /* --- Init --- */
    // Dark mode must init immediately (before DOMContentLoaded to prevent flash)
    initDarkMode();

    document.addEventListener('DOMContentLoaded', function() {
        updateToggleIcon(getPreferredTheme());
        initBackToTop();
        initReadingProgress();
        initCodeLabels();
        initLineNumbers();
        initCopyButtons();
        initLazyImages();
        initShareButtons();
        initMobileShareBar();

        // Mark body if mobile TOC exists (for back-to-top offset)
        if (document.querySelector('.mobile-toc-toggle')) {
            document.body.classList.add('has-mobile-toc');
        }

        // Enable dark mode transitions after page load (FOUC prevention)
        // Small delay ensures initial paint is complete before enabling transitions
        setTimeout(function() {
            document.documentElement.classList.add('transitions-enabled');
        }, 50);
    });
})();
