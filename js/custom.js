/* ========================================
   DooDoo IT Blog - Custom JavaScript
   ========================================
   Note: No removeEventListener needed — MPA (full page reload on navigation).
   Event delegation is used where practical for code quality, not leak prevention.
   ======================================== */

(function() {
    'use strict';

    /* --- Constants --- */
    var SCROLL_THRESHOLD = 300;           // back-to-top 버튼 표시 스크롤 위치(px)
    var COPY_FEEDBACK_MS = 1500;          // 복사 성공/실패 메시지 표시 시간(ms)
    var SHARE_FEEDBACK_MS = 2000;         // 공유 복사 메시지 표시 시간(ms)
    var MOBILE_SHARE_SCROLL_PCT = 0.15;   // 모바일 공유바 표시 스크롤 비율
    var FOOTER_PROXIMITY_PX = 60;         // 모바일 공유바 숨김 footer 근접 거리(px)

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
        var btn = document.querySelector('.dark-mode-toggle');
        if (!btn) return;
        var svg = btn.querySelector('svg.icon');
        if (!svg) return;
        var use = svg.querySelector('use');
        if (use) use.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
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

        // rAF-based throttle: at most one frame queued at a time
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    if (window.scrollY > SCROLL_THRESHOLD) {
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

    /* --- Code Block Line Highlighting --- */
    function initLineHighlight() {
        var pres = document.querySelectorAll('.post-container pre[data-highlight]');
        pres.forEach(function(pre) {
            var highlightAttr = pre.getAttribute('data-highlight');
            if (!highlightAttr) return;

            // 파싱: "3,5-7,10" → Set(3,5,6,7,10)
            var lines = new Set();
            highlightAttr.split(',').forEach(function(part) {
                part = part.trim();
                if (part.indexOf('-') > -1) {
                    var range = part.split('-');
                    var start = parseInt(range[0], 10);
                    var end = parseInt(range[1], 10);
                    for (var i = start; i <= end; i++) lines.add(i);
                } else {
                    lines.add(parseInt(part, 10));
                }
            });

            // .code-line span들에 하이라이트 적용
            var codeLines = pre.querySelectorAll('.code-line');
            codeLines.forEach(function(line, idx) {
                if (lines.has(idx + 1)) {
                    line.classList.add('highlighted');
                }
            });
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
            console.warn('Copy failed:', e.message);
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
            setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copy-btn--success'); btn.setAttribute('aria-label', 'Copy code to clipboard'); }, COPY_FEEDBACK_MS);
        }
        function onFail() {
            btn.textContent = "Failed";
            setTimeout(function() { btn.innerHTML = orig; }, COPY_FEEDBACK_MS);
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
        var container = document.querySelector('.post-container');
        if (!container) return;

        // Create buttons (no individual listeners — delegation below handles clicks)
        var pres = container.querySelectorAll('pre');
        pres.forEach(function(pre) {
            if (pre.querySelector('.copy-btn')) return;

            var btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copy';
            btn.setAttribute('aria-label', 'Copy code to clipboard');
            pre.appendChild(btn);
        });

        // Single delegated listener for all copy buttons
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('.copy-btn');
            if (!btn) return;

            var pre = btn.closest('pre');
            if (!pre) return;

            var code = pre.querySelector('code');
            var text;
            if (code) {
                text = code.textContent;
            } else {
                btn.hidden = true;
                text = pre.textContent;
                btn.hidden = false;
            }
            copyToClipboard(text, btn);
        });
    }

    /* --- Reading Progress Bar --- */
    function initReadingProgress() {
        var bar = document.getElementById('reading-progress-bar');
        if (!bar) return;

        // rAF-based throttle: at most one frame queued at a time
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    var scrollTop = window.scrollY || document.documentElement.scrollTop;
                    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                    if (docHeight < 50) { bar.style.display = "none"; ticking = false; return; }
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
                btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-check"/></svg> Copied!';
                btn.classList.add('share-btn--copied');
                announceToSR("클립보드에 복사됐습니다");
                setTimeout(function() {
                    btn.innerHTML = origHTML;
                    btn.classList.remove('share-btn--copied');
                }, SHARE_FEEDBACK_MS);
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
                var icon = btn.querySelector('svg.icon');
                function onSuccess() {
                    var use = icon.querySelector('use');
                    if (use) use.setAttribute('href', '#icon-check');
                    btn.classList.add('mobile-share-btn--copied');
                    announceToSR("클립보드에 복사됐습니다");
                    setTimeout(function() {
                        if (use) use.setAttribute('href', '#icon-link');
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

        // rAF-based throttle: at most one frame queued at a time
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
                        nearFooter = footerRect.top < viewportHeight + FOOTER_PROXIMITY_PX;
                    }

                    if (scrollPct >= MOBILE_SHARE_SCROLL_PCT && !nearFooter) {
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

    /* --- Code Diff Viewer --- */
    function escapeHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function generateDiff(before, after) {
        var beforeLines = before.split('\n');
        var afterLines = after.split('\n');
        var result = [];

        var bi = 0, ai = 0;

        while (bi < beforeLines.length || ai < afterLines.length) {
            if (bi < beforeLines.length && ai < afterLines.length && beforeLines[bi] === afterLines[ai]) {
                result.push('<span class="diff-line diff-same">  ' + escapeHtml(beforeLines[bi]) + '</span>');
                bi++; ai++;
            } else {
                if (bi < beforeLines.length) {
                    result.push('<span class="diff-line diff-del">- ' + escapeHtml(beforeLines[bi]) + '</span>');
                    bi++;
                }
                if (ai < afterLines.length) {
                    result.push('<span class="diff-line diff-add">+ ' + escapeHtml(afterLines[ai]) + '</span>');
                    ai++;
                }
            }
        }

        return result.join('\n');
    }

    function initDiffBlocks() {
        var diffs = document.querySelectorAll('.code-diff');
        diffs.forEach(function(container) {
            var pres = container.querySelectorAll('pre');
            if (pres.length < 2) return;

            var lang = container.getAttribute('data-lang') || '';
            var beforeCode = pres[0].textContent;
            var afterCode = pres[1].textContent;

            // 탭 버튼 생성
            var tabs = document.createElement('div');
            tabs.className = 'diff-tabs';
            tabs.innerHTML = '<button class="diff-tab active" data-view="before">Before</button>' +
                             '<button class="diff-tab" data-view="after">After</button>' +
                             '<button class="diff-tab" data-view="diff">Diff</button>';

            // 뷰 컨테이너
            var views = document.createElement('div');
            views.className = 'diff-views';

            // Before 뷰
            var beforeView = document.createElement('div');
            beforeView.className = 'diff-view active';
            beforeView.setAttribute('data-view', 'before');
            beforeView.appendChild(pres[0].cloneNode(true));

            // After 뷰
            var afterView = document.createElement('div');
            afterView.className = 'diff-view';
            afterView.setAttribute('data-view', 'after');
            afterView.appendChild(pres[1].cloneNode(true));

            // Diff 뷰
            var diffView = document.createElement('div');
            diffView.className = 'diff-view';
            diffView.setAttribute('data-view', 'diff');
            var diffPre = document.createElement('pre');
            var diffCode = document.createElement('code');
            diffCode.innerHTML = generateDiff(beforeCode, afterCode);
            diffPre.appendChild(diffCode);
            diffView.appendChild(diffPre);

            views.appendChild(beforeView);
            views.appendChild(afterView);
            views.appendChild(diffView);

            // 원본 pre들 제거하고 탭+뷰로 교체
            container.innerHTML = '';
            if (lang) {
                var label = document.createElement('span');
                label.className = 'diff-lang-label';
                label.textContent = lang.toUpperCase();
                container.appendChild(label);
            }
            container.appendChild(tabs);
            container.appendChild(views);

            // 탭 클릭 이벤트
            tabs.addEventListener('click', function(e) {
                var tab = e.target.closest('.diff-tab');
                if (!tab) return;
                var view = tab.getAttribute('data-view');
                tabs.querySelectorAll('.diff-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                views.querySelectorAll('.diff-view').forEach(function(v) { v.classList.remove('active'); });
                views.querySelector('.diff-view[data-view="' + view + '"]').classList.add('active');
            });
        });
    }

    /* --- Reading Stats Tracker --- */
    function initReadingTracker() {
        var postContainer = document.querySelector('.post-container[data-pagefind-body]');
        if (!postContainer) return; // 포스트 페이지가 아니면 무시

        var slug = window.location.pathname;
        var titleEl = document.querySelector('.intro-header .post-heading h1');
        var title = titleEl ? titleEl.textContent.trim() : document.title;

        // 읽기 기록 가져오기
        var STORAGE_KEY = 'doodoo-reading-stats';
        var stats;
        try {
            stats = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch(e) {
            stats = {};
        }

        // 이미 방문한 포스트면 방문 횟수만 증가
        if (!stats[slug]) {
            stats[slug] = { title: title, visits: 0, maxScroll: 0, readAt: null };
        }
        stats[slug].visits++;
        stats[slug].lastVisit = new Date().toISOString();

        // 스크롤 추적 (기존 reading progress bar와 연동)
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    var scrollTop = window.scrollY || document.documentElement.scrollTop;
                    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                    if (docHeight > 50) {
                        var pct = Math.round(Math.min(100, (scrollTop / docHeight) * 100));
                        if (pct > (stats[slug].maxScroll || 0)) {
                            stats[slug].maxScroll = pct;
                            if (pct >= 70 && !stats[slug].readAt) {
                                stats[slug].readAt = new Date().toISOString();
                            }
                            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch(e) {}
                        }
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });

        // 초기 저장
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch(e) {}
    }

    /* --- Init --- */
    // Dark mode must init immediately (before DOMContentLoaded to prevent flash)
    initDarkMode();

    document.addEventListener('DOMContentLoaded', function() {
        updateToggleIcon(getPreferredTheme());
        initBackToTop();
        initReadingProgress();
        initReadingTracker();
        initCodeLabels();
        initLineNumbers();
        initLineHighlight();
        initCopyButtons();
        initLazyImages();
        initShareButtons();
        initMobileShareBar();
        initDiffBlocks();

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
