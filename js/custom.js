/* ========================================
   DooDoo IT Blog - Custom JavaScript
   ========================================
   Note: No removeEventListener needed — MPA (full page reload on navigation).
   Event delegation is used where practical for code quality, not leak prevention.

   Shared localStorage keys:
   'doodoo-reading-stats' — read/write by custom.js, read by index.html
   'doodoo-blog-theme'    — read/write by custom.js only
   ======================================== */

(function() {
    'use strict';

    /* --- Constants --- */
    var SCROLL_THRESHOLD = 300;           // back-to-top 버튼 표시 스크롤 위치(px)
    var COPY_FEEDBACK_MS = 1500;          // 복사 성공/실패 메시지 표시 시간(ms)
    var SHARE_FEEDBACK_MS = 2000;         // 공유 복사 메시지 표시 시간(ms)
    var MOBILE_SHARE_SCROLL_PCT = 0.15;   // 모바일 공유바 표시 스크롤 비율
    var FOOTER_PROXIMITY_PX = 60;         // 모바일 공유바 숨김 footer 근접 거리(px)

    /* --- Central Scroll Dispatcher ---
       Single rAF throttle for all scroll handlers.
       Each handler receives (scrollTop, scrollPct, docHeight). */
    var scrollHandlers = [];

    function registerScrollHandler(fn) {
        scrollHandlers.push(fn);
    }

    (function() {
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    var scrollTop = window.scrollY || document.documentElement.scrollTop;
                    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                    var scrollPct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
                    for (var i = 0; i < scrollHandlers.length; i++) {
                        scrollHandlers[i](scrollTop, scrollPct, docHeight);
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    })();

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

        registerScrollHandler(function(scrollTop) {
            if (scrollTop > SCROLL_THRESHOLD) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
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
                pre.classList.add('has-lang-label');
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
        function onSuccess() {
            btn.textContent = 'Copied!';
            btn.classList.add('code-copy-btn--success');
            btn.setAttribute('aria-label', 'Copied!');
            announceToSR("클립보드에 복사됐습니다");
            setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('code-copy-btn--success'); btn.setAttribute('aria-label', 'Copy code to clipboard'); }, COPY_FEEDBACK_MS);
        }
        function onFail() {
            btn.textContent = 'Error';
            setTimeout(function() { btn.textContent = 'Copy'; }, COPY_FEEDBACK_MS);
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

        // Create copy buttons on each .highlighter-rouge block
        var codeBlocks = container.querySelectorAll('.highlighter-rouge');
        codeBlocks.forEach(function(block) {
            if (block.querySelector('.code-copy-btn')) return;

            var btn = document.createElement('button');
            btn.className = 'code-copy-btn';
            btn.textContent = 'Copy';
            btn.setAttribute('aria-label', 'Copy code to clipboard');
            block.appendChild(btn);
        });

        // Single delegated listener for all copy buttons
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('.code-copy-btn');
            if (!btn) return;

            var block = btn.closest('.highlighter-rouge');
            if (!block) return;

            // Get code text from the rouge-code cell (excludes line numbers)
            var codeCell = block.querySelector('.rouge-code code') || block.querySelector('code');
            var text;
            if (codeCell) {
                text = codeCell.textContent;
            } else {
                var pre = block.querySelector('pre');
                text = pre ? pre.textContent : '';
            }
            copyToClipboard(text, btn);
        });
    }

    /* --- Reading Progress Bar --- */
    function initReadingProgress() {
        var bar = document.getElementById('reading-progress-bar');
        if (!bar) return;

        registerScrollHandler(function(scrollTop, scrollPct, docHeight) {
            if (docHeight < 50) { bar.style.display = "none"; return; }
            bar.style.width = Math.min(100, scrollPct) + '%';
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

        var footer = document.querySelector('.site-footer') || document.querySelector('footer');

        registerScrollHandler(function(scrollTop, scrollPct, docHeight) {
            var viewportHeight = window.innerHeight;
            // Mobile share bar uses 0-1 ratio, convert from 0-100 pct
            var ratio = scrollPct / 100;

            var nearFooter = false;
            if (footer) {
                var footerRect = footer.getBoundingClientRect();
                nearFooter = footerRect.top < viewportHeight + FOOTER_PROXIMITY_PX;
            }

            if (ratio >= MOBILE_SHARE_SCROLL_PCT && !nearFooter) {
                bar.classList.add('visible');
            } else {
                bar.classList.remove('visible');
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
        var titleEl = document.querySelector('.post-header .post-heading');
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

        // 스크롤 추적 (중앙 디스패처 사용)
        registerScrollHandler(function(scrollTop, scrollPct, docHeight) {
            if (docHeight > 50) {
                var pct = Math.round(Math.min(100, scrollPct));
                if (pct > (stats[slug].maxScroll || 0)) {
                    stats[slug].maxScroll = pct;
                    if (pct >= 70 && !stats[slug].readAt) {
                        stats[slug].readAt = new Date().toISOString();
                    }
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch(e) {}
                }
            }
        });

        // 초기 저장
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch(e) {}
    }

    /* --- Text Share Popup --- */
    function initTextSharePopup() {
        var postContainer = document.querySelector('.post-container[data-pagefind-body]');
        if (!postContainer) return;

        var popup = document.createElement('div');
        popup.className = 'text-share-popup';
        popup.innerHTML = '<button class="text-share-btn" data-action="copy">📋 Copy</button>' +
                          '<button class="text-share-btn" data-action="tweet">𝕏 Tweet</button>';
        popup.style.display = 'none';
        document.body.appendChild(popup);

        var selectedText = '';

        postContainer.addEventListener('mouseup', function(e) {
            var selection = window.getSelection();
            var text = selection.toString().trim();

            if (text.length > 10 && text.length < 500) {
                selectedText = text;
                popup.style.display = 'flex';
                var left = e.pageX;
                var top = e.pageY - 45;
                // 화면 밖 방지
                if (left + 200 > window.innerWidth + window.scrollX) left = window.innerWidth + window.scrollX - 210;
                if (top < window.scrollY) top = e.pageY + 15;
                popup.style.left = left + 'px';
                popup.style.top = top + 'px';
            } else {
                popup.style.display = 'none';
            }
        });

        document.addEventListener('mousedown', function(e) {
            if (!popup.contains(e.target)) {
                popup.style.display = 'none';
            }
        });

        popup.addEventListener('click', function(e) {
            var btn = e.target.closest('.text-share-btn');
            if (!btn) return;
            var action = btn.getAttribute('data-action');

            if (action === 'copy') {
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(selectedText).then(function() {
                        btn.textContent = '✓ Copied';
                        setTimeout(function() { btn.textContent = '📋 Copy'; }, 1500);
                    }).catch(function() {
                        fallbackCopy(selectedText, function() {
                            btn.textContent = '✓ Copied';
                            setTimeout(function() { btn.textContent = '📋 Copy'; }, 1500);
                        });
                    });
                } else {
                    fallbackCopy(selectedText, function() {
                        btn.textContent = '✓ Copied';
                        setTimeout(function() { btn.textContent = '📋 Copy'; }, 1500);
                    });
                }
            } else if (action === 'tweet') {
                var url = encodeURIComponent(window.location.href);
                var tweetText = encodeURIComponent('"' + selectedText.substring(0, 200) + '…"');
                window.open('https://twitter.com/intent/tweet?text=' + tweetText + '&url=' + url, '_blank');
            }

            popup.style.display = 'none';
        });
    }

    /* --- GitHub-style Callouts --- */
    function initCallouts() {
        var container = document.querySelector('.post-container');
        if (!container) return;

        var CALLOUT_TYPES = {
            NOTE:      { icon: '\u2139',  label: 'Note' },
            TIP:       { icon: '\u2731',  label: 'Tip' },
            IMPORTANT: { icon: '\u2757',  label: 'Important' },
            WARNING:   { icon: '\u26A0',  label: 'Warning' },
            CAUTION:   { icon: '\u2718',  label: 'Caution' }
        };
        var PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

        var blockquotes = container.querySelectorAll('blockquote');
        blockquotes.forEach(function(bq) {
            var firstP = bq.querySelector('p');
            if (!firstP) return;

            // Check text content of the first paragraph
            var textContent = firstP.textContent;
            var match = textContent.match(PATTERN);
            if (!match) return;

            var type = match[1];
            var config = CALLOUT_TYPES[type];
            if (!config) return;

            var typeLower = type.toLowerCase();

            // Add callout classes
            bq.classList.add('callout', 'callout-' + typeLower);

            // Build title element
            var titleEl = document.createElement('div');
            titleEl.className = 'callout-title';
            titleEl.innerHTML = '<span class="callout-icon">' + config.icon + '</span> ' + config.label;

            // Remove [!TYPE] text from the paragraph
            // Walk through child nodes to find and remove the pattern
            var walker = document.createTreeWalker(firstP, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while (node = walker.nextNode()) {
                var nodeMatch = node.textContent.match(PATTERN);
                if (nodeMatch) {
                    node.textContent = node.textContent.replace(PATTERN, '');
                    break;
                }
            }

            // Insert title before the first paragraph
            bq.insertBefore(titleEl, firstP);

            // If firstP is now empty, remove it
            if (!firstP.textContent.trim() && !firstP.querySelector('img, code, a')) {
                firstP.remove();
            }
        });
    }

    /* --- Smart Recommendation: Read badge on Related Posts --- */
    function initSmartRecommendation() {
        var relatedSection = document.querySelector('.related-posts');
        if (!relatedSection) return;

        var READING_KEY = 'doodoo-reading-stats';
        var stats;
        try { stats = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch(e) { stats = {}; }

        // 읽은 포스트 URL 목록
        var readUrls = new Set();
        Object.keys(stats).forEach(function(k) {
            if (stats[k].readAt) readUrls.add(k);
        });

        if (readUrls.size === 0) return; // 아직 읽은 게 없으면 패스

        // 관련 포스트 카드에서 읽은 것 표시
        var cards = relatedSection.querySelectorAll('.related-post-card');
        cards.forEach(function(card) {
            var link = card.querySelector('a');
            if (!link) return;
            var href = link.getAttribute('href');
            if (readUrls.has(href)) {
                card.classList.add('rp-read');
                // "✓ Read" 뱃지 추가
                var badge = document.createElement('span');
                badge.className = 'rp-read-badge';
                badge.textContent = '\u2713 Read';
                card.appendChild(badge);
            }
        });
    }

    /* --- Post Content Responsive Wrappers (table + iframe) --- */
    function initResponsiveWrappers() {
        // Wrap tables for horizontal scroll
        document.querySelectorAll('.post-container table').forEach(function(table) {
            if (!table.parentElement.classList.contains('table-responsive')) {
                var wrapper = document.createElement('div');
                wrapper.className = 'table-responsive';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
        // Wrap iframes (videos) for responsive sizing
        document.querySelectorAll('.post-container iframe').forEach(function(iframe) {
            if (!iframe.parentElement.classList.contains('responsive-video')) {
                var wrapper = document.createElement('div');
                wrapper.className = 'responsive-video';
                iframe.parentNode.insertBefore(wrapper, iframe);
                wrapper.appendChild(iframe);
            }
        });
    }

    /* --- Init --- */
    // Dark mode must init immediately (before DOMContentLoaded to prevent flash)
    initDarkMode();

    document.addEventListener('DOMContentLoaded', function() {
        updateToggleIcon(getPreferredTheme());
        initResponsiveWrappers();
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
        initCallouts();
        initTextSharePopup();
        initSmartRecommendation();

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
