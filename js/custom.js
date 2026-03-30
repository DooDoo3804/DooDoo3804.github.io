/* ========================================
   DooDoo IT Blog - Custom JavaScript
   ======================================== */

(function() {
    'use strict';

    /* --- Dark Mode --- */
    var THEME_KEY = 'doodoo-blog-theme';

    function getPreferredTheme() {
        var stored = localStorage.getItem(THEME_KEY);
        if (stored) return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        updateToggleIcon(theme);
    }

    function updateToggleIcon(theme) {
        var btn = document.querySelector('.dark-mode-toggle i');
        if (!btn) return;
        btn.className = theme === 'dark' ? 'fa fa-sun-o' : 'fa fa-moon-o';
    }

    function initDarkMode() {
        // Theme is already applied by inline script in head.html (FOUC prevention)
        // Only update toggle icon and bind click handler here
        var theme = getPreferredTheme();
        updateToggleIcon(theme);

        document.addEventListener('click', function(e) {
            var toggle = e.target.closest('.dark-mode-toggle');
            if (toggle) {
                e.preventDefault();
                var current = document.documentElement.getAttribute('data-theme');
                setTheme(current === 'dark' ? 'light' : 'dark');
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
                pre.style.position = 'relative';
                pre.insertBefore(label, pre.firstChild);
            }
        });
    }

    /* --- Enhanced Copy Button (replaces footer.html version) --- */
    function initCopyButtons() {
        var pres = document.querySelectorAll('.post-container pre');
        pres.forEach(function(pre) {
            // skip if already has copy button
            if (pre.querySelector('.copy-btn')) return;

            pre.style.position = 'relative';
            var btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copy';
            pre.appendChild(btn);

            btn.addEventListener('click', function() {
                var code = pre.querySelector('code');
                var text = code ? code.textContent : pre.textContent;
                navigator.clipboard.writeText(text).then(function() {
                    btn.textContent = '\u2713 Copied!';
                    btn.classList.add('copy-btn--success');
                    setTimeout(function() {
                        btn.textContent = 'Copy';
                        btn.classList.remove('copy-btn--success');
                    }, 1500);
                });
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
                    var pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
                    bar.style.width = pct + '%';
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /* --- Image Lazy Loading (all images site-wide) --- */
    function initLazyImages() {
        var imgs = document.querySelectorAll('img');
        imgs.forEach(function(img) {
            if (!img.hasAttribute('loading')) {
                img.setAttribute('loading', 'lazy');
            }
        });
    }

    /* --- Post Share Buttons --- */
    function initShareButtons() {
        document.addEventListener('click', function(e) {
            var btn = e.target.closest('.share-btn--copy');
            if (!btn) return;
            e.preventDefault();
            var url = btn.getAttribute('data-url');
            navigator.clipboard.writeText(url).then(function() {
                var icon = btn.querySelector('i');
                var origHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fa fa-check"></i> Copied!';
                btn.classList.add('share-btn--copied');
                setTimeout(function() {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('share-btn--copied');
                }, 2000);
            });
        });
    }

    /* --- Init --- */
    // Dark mode must init immediately (before DOMContentLoaded to prevent flash)
    initDarkMode();

    document.addEventListener('DOMContentLoaded', function() {
        initBackToTop();
        initReadingProgress();
        initCodeLabels();
        initCopyButtons();
        initLazyImages();
        initShareButtons();

        // Mark body if mobile TOC exists (for back-to-top offset)
        if (document.querySelector('.mobile-toc-toggle')) {
            document.body.classList.add('has-mobile-toc');
        }
    });
})();
