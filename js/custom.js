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
        updateUtterancesTheme(theme);
    }

    function updateUtterancesTheme(theme) {
        var utterancesFrame = document.querySelector('.utterances-frame');
        if (!utterancesFrame) return;
        var utterancesTheme = theme === 'dark' ? 'github-dark' : 'github-light';
        utterancesFrame.contentWindow.postMessage(
            { type: 'set-theme', theme: utterancesTheme },
            'https://utteranc.es'
        );
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

    /* --- Code Block Line Numbers --- */
    function initLineNumbers() {
        var codeBlocks = document.querySelectorAll('.post-container pre > code');
        codeBlocks.forEach(function(code) {
            // skip if already processed
            if (code.classList.contains('has-line-numbers')) return;
            var text = code.textContent;
            // skip single-line or empty blocks
            if (!text || text.split('\n').length <= 2) return;

            var lines = text.replace(/\n$/, '').split('\n');
            code.textContent = '';
            code.classList.add('has-line-numbers');

            lines.forEach(function(line) {
                var span = document.createElement('span');
                span.className = 'code-line';
                span.textContent = line + '\n';
                code.appendChild(span);
            });
        });
    }

    /* --- Enhanced Copy Button (replaces footer.html version) --- */
    function fallbackCopy(text, btn, orig, onSuccess) {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { if (document.execCommand("copy")) onSuccess(); } catch(e) {}
        document.body.removeChild(ta);
    }

    function copyToClipboard(text, btn) {
        var orig = btn.innerHTML;
        function onSuccess() {
            btn.innerHTML = "\u2713 Copied!";
            btn.classList.add('copy-btn--success');
            setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copy-btn--success'); }, 1500);
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(function() {
                fallbackCopy(text, btn, orig, onSuccess);
            });
        } else {
            fallbackCopy(text, btn, orig, onSuccess);
        }
    }

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
                    var pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
                    bar.style.width = pct + '%';
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    /* --- Image Lazy Loading (skip first 3 above-the-fold) --- */
    function initLazyImages() {
        var imgs = document.querySelectorAll('img:not([loading])');
        imgs.forEach(function(img, i) {
            if (i >= 3) img.setAttribute('loading', 'lazy');
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
                btn.innerHTML = '<i class="fa fa-check"></i> Copied!';
                btn.classList.add('share-btn--copied');
                setTimeout(function() {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('share-btn--copied');
                }, 2000);
            }
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(onSuccess).catch(function() {
                    fallbackCopy(url, btn, origHTML, onSuccess);
                });
            } else {
                fallbackCopy(url, btn, origHTML, onSuccess);
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
                    icon.className = 'fa fa-check';
                    btn.classList.add('mobile-share-btn--copied');
                    setTimeout(function() {
                        icon.className = 'fa fa-link';
                        btn.classList.remove('mobile-share-btn--copied');
                    }, 1500);
                }
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(url).then(onSuccess).catch(function() {
                        fallbackCopy(url, btn, '', onSuccess);
                    });
                } else {
                    fallbackCopy(url, btn, '', onSuccess);
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
        initBackToTop();
        initReadingProgress();
        initCodeLabels();
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
