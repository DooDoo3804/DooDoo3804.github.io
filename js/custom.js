/* ========================================
   DooDoo IT Blog - Custom JavaScript
   ========================================
   Note: No removeEventListener needed — MPA (full page reload on navigation).
   Event delegation is used where practical for code quality, not leak prevention.

   Shared localStorage keys:
   'doodoo-reading-stats' — read/write by custom.js, read by rpg.js & index.html
   'doodoo-rpg'           — read/write by rpg.js; written by custom.js (typing challenge XP)
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

    /* --- Mindmap --- */
    function escapeText(str, maxLen) {
        str = str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        if (maxLen && str.length > maxLen) str = str.substring(0, maxLen) + '\u2026';
        return str;
    }

    function renderMindmap(container, root) {
        var width = container.clientWidth || 700;
        var nodeHeight = 28;

        // 전체 노드 수로 높이 계산
        var totalNodes = root.children.length;
        root.children.forEach(function(c) { totalNodes += (c.children ? c.children.length : 0); });
        var height = Math.max(300, totalNodes * nodeHeight + 60);

        var svg = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';

        var centerX = 20;
        var centerY = height / 2;
        var h2X = 220;
        var h3X = 440;

        // 루트 노드
        svg += '<rect x="' + centerX + '" y="' + (centerY - 14) + '" width="180" height="28" rx="14" fill="var(--accent-primary)" />';
        svg += '<text x="' + (centerX + 90) + '" y="' + (centerY + 5) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="var(--font-mono)">' + escapeText(root.name, 22) + '</text>';

        // H2 노드 배치
        var h2Spacing = height / (root.children.length + 1);

        root.children.forEach(function(h2, i) {
            var y = h2Spacing * (i + 1);

            // 루트 → H2 연결선
            svg += '<path d="M' + (centerX + 180) + ',' + centerY + ' C' + (centerX + 200) + ',' + centerY + ' ' + (h2X - 20) + ',' + y + ' ' + h2X + ',' + y + '" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-opacity="0.4" />';

            // H2 노드
            svg += '<rect x="' + h2X + '" y="' + (y - 12) + '" width="180" height="24" rx="12" fill="var(--bg-surface-raised)" stroke="var(--accent-primary)" stroke-width="1.5" />';
            svg += '<a href="#' + (h2.id || '') + '">';
            svg += '<text x="' + (h2X + 90) + '" y="' + (y + 4) + '" text-anchor="middle" font-size="11" font-weight="600" fill="var(--accent-primary)" font-family="var(--font-mono)" style="cursor:pointer">' + escapeText(h2.name, 24) + '</text>';
            svg += '</a>';

            // H3 자식 노드
            if (h2.children && h2.children.length > 0) {
                var h3Spacing = Math.min(nodeHeight, 60 / h2.children.length);
                var h3StartY = y - ((h2.children.length - 1) * h3Spacing) / 2;

                h2.children.forEach(function(h3, j) {
                    var h3Y = h3StartY + j * h3Spacing;

                    // H2 → H3 연결선
                    svg += '<path d="M' + (h2X + 180) + ',' + y + ' C' + (h2X + 200) + ',' + y + ' ' + (h3X - 20) + ',' + h3Y + ' ' + h3X + ',' + h3Y + '" fill="none" stroke="var(--border-medium)" stroke-width="1" stroke-opacity="0.4" />';

                    // H3 노드
                    svg += '<a href="#' + (h3.id || '') + '">';
                    svg += '<text x="' + h3X + '" y="' + (h3Y + 3) + '" font-size="10" fill="var(--text-secondary)" font-family="var(--font-mono)" style="cursor:pointer">' + escapeText(h3.name, 30) + '</text>';
                    svg += '</a>';
                });
            }
        });

        svg += '</svg>';
        container.innerHTML = svg;
    }

    var mindmapInitialized = false;
    function initMindmap() {
        if (mindmapInitialized) return;
        mindmapInitialized = true;

        var container = document.querySelector('.post-container[data-pagefind-body]');
        if (!container) return;

        var headings = container.querySelectorAll('h2[id], h3[id]');
        if (headings.length < 3) return; // 헤딩 3개 미만이면 마인드맵 불필요

        // 트리 구조 빌드
        var titleEl = document.querySelector('.intro-header .post-heading h1');
        var root = { name: titleEl ? titleEl.textContent.trim() : 'Post', children: [] };
        var currentH2 = null;

        headings.forEach(function(h) {
            var node = { name: h.textContent.trim(), id: h.id };
            if (h.tagName === 'H2') {
                node.children = [];
                root.children.push(node);
                currentH2 = node;
            } else if (h.tagName === 'H3' && currentH2) {
                currentH2.children.push(node);
            }
        });

        // 토글 버튼 — breadcrumb 바로 뒤에 삽입
        var breadcrumb = container.querySelector('.post-breadcrumb');
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'mindmap-toggle';
        toggleBtn.innerHTML = '\uD83E\uDDE0 Mindmap';
        toggleBtn.setAttribute('aria-label', 'Toggle mindmap view');

        var mapContainer = document.createElement('div');
        mapContainer.className = 'mindmap-container';
        mapContainer.style.display = 'none';

        if (breadcrumb) {
            breadcrumb.after(toggleBtn);
            toggleBtn.after(mapContainer);
        } else {
            container.prepend(mapContainer);
            container.prepend(toggleBtn);
        }

        var rendered = false;

        toggleBtn.addEventListener('click', function() {
            var isOpen = mapContainer.style.display !== 'none';
            mapContainer.style.display = isOpen ? 'none' : 'block';
            toggleBtn.classList.toggle('active', !isOpen);

            if (!rendered) {
                renderMindmap(mapContainer, root);
                rendered = true;
            }
        });
    }

    /* --- Typing Challenge Mini-Game --- */
    function initTypingChallenge() {
        var pres = document.querySelectorAll('.post-container pre');
        pres.forEach(function(pre) {
            var code = pre.querySelector('code');
            if (!code) return;
            var text = code.textContent.trim();
            if (!text || text.split('\n').length < 3) return; // 3줄 미만은 스킵

            var btn = document.createElement('button');
            btn.className = 'typing-challenge-btn';
            btn.textContent = '\u2328 Type';
            btn.setAttribute('aria-label', 'Start typing challenge');
            pre.style.position = 'relative';
            pre.appendChild(btn);

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                startTypingChallenge(text, pre);
            });
        });
    }

    function startTypingChallenge(targetText, preElement) {
        var overlay = document.createElement('div');
        overlay.className = 'typing-overlay';

        var lines = targetText.split('\n').slice(0, 10); // 최대 10줄
        var target = lines.join('\n');

        overlay.innerHTML =
            '<div class="typing-header">' +
                '<span class="typing-title">\u2328 Typing Challenge</span>' +
                '<button class="typing-close" aria-label="Close">\u2715</button>' +
            '</div>' +
            '<div class="typing-stats">' +
                '<span class="typing-wpm">0 WPM</span>' +
                '<span class="typing-acc">100%</span>' +
                '<span class="typing-timer">0.0s</span>' +
            '</div>' +
            '<pre class="typing-target"><code></code></pre>' +
            '<textarea class="typing-input" spellcheck="false" autocomplete="off" placeholder="Start typing..."></textarea>';

        preElement.style.position = 'relative';
        preElement.appendChild(overlay);

        var targetEl = overlay.querySelector('.typing-target code');
        var inputEl = overlay.querySelector('.typing-input');
        var wpmEl = overlay.querySelector('.typing-wpm');
        var accEl = overlay.querySelector('.typing-acc');
        var timerEl = overlay.querySelector('.typing-timer');
        var closeBtn = overlay.querySelector('.typing-close');

        renderTypingTarget(targetEl, target, '');

        var startTime = null;
        var timerInterval = null;

        inputEl.focus();

        inputEl.addEventListener('input', function() {
            var typed = inputEl.value;

            if (!startTime) {
                startTime = Date.now();
                timerInterval = setInterval(function() {
                    var elapsed = (Date.now() - startTime) / 1000;
                    timerEl.textContent = elapsed.toFixed(1) + 's';
                }, 100);
            }

            renderTypingTarget(targetEl, target, typed);

            // WPM 계산
            var elapsed = (Date.now() - startTime) / 1000 / 60;
            var words = typed.length / 5;
            var wpm = elapsed > 0 ? Math.round(words / elapsed) : 0;
            wpmEl.textContent = wpm + ' WPM';

            // 정확도 계산
            var correct = 0;
            for (var i = 0; i < typed.length; i++) {
                if (typed[i] === target[i]) correct++;
            }
            var acc = typed.length > 0 ? Math.round((correct / typed.length) * 100) : 100;
            accEl.textContent = acc + '%';

            // 완료 체크
            if (typed.length >= target.length) {
                clearInterval(timerInterval);
                var finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                inputEl.disabled = true;
                overlay.querySelector('.typing-header .typing-title').textContent =
                    '\u2705 Complete! ' + wpm + ' WPM \u00b7 ' + acc + '% \u00b7 ' + finalTime + 's';

                // RPG XP 보너스 (있으면)
                try {
                    var rpgState = JSON.parse(localStorage.getItem('doodoo-rpg')) || {};
                    rpgState.xp = (rpgState.xp || 0) + 20;
                    localStorage.setItem('doodoo-rpg', JSON.stringify(rpgState));
                } catch(e) {}
            }
        });

        closeBtn.addEventListener('click', function() {
            clearInterval(timerInterval);
            overlay.remove();
        });
    }

    function renderTypingTarget(el, target, typed) {
        var html = '';
        for (var i = 0; i < target.length; i++) {
            var char = target[i] === '\n' ? '\u21b5\n' : (target[i] === ' ' ? ' ' : target[i]);
            var safeChar = char.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            if (i < typed.length) {
                if (typed[i] === target[i]) {
                    html += '<span class="typing-correct">' + safeChar + '</span>';
                } else {
                    html += '<span class="typing-wrong">' + safeChar + '</span>';
                }
            } else if (i === typed.length) {
                html += '<span class="typing-cursor">' + safeChar + '</span>';
            } else {
                html += '<span class="typing-pending">' + safeChar + '</span>';
            }
        }
        el.innerHTML = html;
    }

    /* --- VS Code Style Minimap --- */
    function initMinimap() {
        var postContainer = document.querySelector('.post-container[data-pagefind-body]');
        if (!postContainer) return;
        if (window.innerWidth < 1400) return; // 넓은 화면에서만

        var minimap = document.createElement('div');
        minimap.className = 'post-minimap';
        minimap.setAttribute('aria-hidden', 'true');

        var viewport = document.createElement('div');
        viewport.className = 'minimap-viewport';
        minimap.appendChild(viewport);

        // 포스트 내용의 각 섹션을 블록으로 표현
        var headings = postContainer.querySelectorAll('h2, h3');
        var codeBlocks = postContainer.querySelectorAll('pre');
        var totalHeight = postContainer.scrollHeight;

        // 헤딩 마커
        headings.forEach(function(h) {
            var marker = document.createElement('div');
            marker.className = 'minimap-heading';
            marker.style.top = ((h.offsetTop / totalHeight) * 100) + '%';
            marker.style.width = h.tagName === 'H2' ? '60%' : '40%';
            minimap.appendChild(marker);
        });

        // 코드블록 영역
        codeBlocks.forEach(function(pre) {
            var block = document.createElement('div');
            block.className = 'minimap-code';
            block.style.top = ((pre.offsetTop / totalHeight) * 100) + '%';
            block.style.height = ((pre.offsetHeight / totalHeight) * 100) + '%';
            minimap.appendChild(block);
        });

        document.body.appendChild(minimap);

        // 뷰포트 위치 업데이트
        var ticking = false;
        function updateViewport() {
            var scrollY = window.scrollY;
            var viewH = window.innerHeight;
            var docH = document.documentElement.scrollHeight;
            var minimapH = minimap.clientHeight;

            var top = (scrollY / docH) * minimapH;
            var height = (viewH / docH) * minimapH;

            viewport.style.top = top + 'px';
            viewport.style.height = height + 'px';
        }

        window.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    updateViewport();
                    ticking = false;
                });
                ticking = true;
            }
        });

        updateViewport();

        // 클릭으로 점프
        minimap.addEventListener('click', function(e) {
            var rect = minimap.getBoundingClientRect();
            var clickPct = (e.clientY - rect.top) / rect.height;
            var scrollTarget = clickPct * document.documentElement.scrollHeight;
            window.scrollTo({ top: scrollTarget });
        });
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
                navigator.clipboard.writeText(selectedText).then(function() {
                    btn.textContent = '✓ Copied';
                    setTimeout(function() { btn.textContent = '📋 Copy'; }, 1500);
                });
            } else if (action === 'tweet') {
                var url = encodeURIComponent(window.location.href);
                var tweetText = encodeURIComponent('"' + selectedText.substring(0, 200) + '…"');
                window.open('https://twitter.com/intent/tweet?text=' + tweetText + '&url=' + url, '_blank');
            }

            popup.style.display = 'none';
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
        initMindmap();
        initTypingChallenge();
        initMinimap();
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
