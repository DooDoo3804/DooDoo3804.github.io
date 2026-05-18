/* ========================================
   TOC (Table of Contents) - Auto Generation + Scroll Highlight
   ======================================== */
(function () {
    'use strict';

    var HEADING_SELECTOR = 'h2[id], h3[id]';
    var MIN_HEADINGS = 2;
    // rootMargin: 상단 80px 오프셋(navbar 높이), 하단 66% 제외(현재 섹션 감지 범위)
    var OBSERVER_ROOT_MARGIN = '-80px 0px -66%';

    function getPostContainer() {
        // Support multilingual pages where the active container matters
        var multilingual = document.querySelector('div.post-container.active');
        return multilingual || document.querySelector('div.post-container');
    }

    /**
     * Build TOC list items from headings.
     * Returns an array of <li> elements (empty if fewer than MIN_HEADINGS).
     */
    function buildTocItems(container) {
        var headings = container.querySelectorAll(HEADING_SELECTOR);
        if (headings.length < MIN_HEADINGS) return [];

        var items = [];
        headings.forEach(function (h) {
            var tag = h.tagName.toLowerCase(); // h2 or h3
            var id = h.id;
            var text = h.textContent;

            var a = document.createElement('a');
            a.href = '#' + id;
            a.rel = 'nofollow';
            a.textContent = text;

            var li = document.createElement('li');
            li.className = tag + '_nav';
            li.appendChild(a);
            items.push(li);
        });
        return items;
    }

    /**
     * Populate a <ul> element with TOC items (cloned).
     */
    function populateList(ul, items) {
        ul.innerHTML = '';
        items.forEach(function (li) {
            ul.appendChild(li.cloneNode(true));
        });
    }

    /**
     * Cached TOC link lists — populated once after TOC is built.
     * Avoids repeated querySelectorAll on every IntersectionObserver callback.
     */
    var cachedDesktopLis = [];
    var cachedMobileLis = [];
    var cachedSidebar = null;

    function cacheTocElements() {
        var desktopBody = document.querySelector('.catalog-body');
        cachedDesktopLis = desktopBody ? desktopBody.querySelectorAll('li') : [];

        var mobileBody = document.querySelector('.mobile-catalog-body');
        cachedMobileLis = mobileBody ? mobileBody.querySelectorAll('li') : [];

        cachedSidebar = document.querySelector('.side-catalog');
    }

    /**
     * Set the active TOC link by heading id across desktop + mobile lists.
     * Uses cached NodeLists instead of querying the DOM each time.
     */
    function setActiveTocLink(id) {
        var lists = [cachedDesktopLis, cachedMobileLis];
        lists.forEach(function (lis) {
            var passedActive = false;

            for (var i = 0; i < lis.length; i++) {
                var li = lis[i];
                var a = li.querySelector('a');
                if (a && a.getAttribute('href') === '#' + id) {
                    li.classList.add('active');
                    li.classList.remove('completed');
                    passedActive = true;
                } else if (!passedActive) {
                    // Before active = already read section
                    li.classList.remove('active');
                    li.classList.add('completed');
                } else {
                    // After active = not yet read section
                    li.classList.remove('active');
                    li.classList.remove('completed');
                }
            }
        });

        // Auto-scroll sidebar to keep active item visible
        // Manual scroll instead of scrollIntoView to prevent page-level scroll jumps
        if (cachedSidebar && cachedSidebar.offsetParent !== null && cachedSidebar.scrollHeight > cachedSidebar.clientHeight) {
            var activeLi = cachedSidebar.querySelector('.active');
            if (activeLi) {
                var liTop = activeLi.offsetTop - cachedSidebar.offsetTop;
                var viewTop = cachedSidebar.scrollTop;
                var viewBottom = viewTop + cachedSidebar.clientHeight;
                if (liTop < viewTop || liTop > viewBottom - 30) {
                    cachedSidebar.scrollTop = liTop - cachedSidebar.clientHeight / 3;
                }
            }
        }
    }

    /**
     * Set up IntersectionObserver for scroll-based highlight.
     */
    function initScrollHighlight(container) {
        var headings = container.querySelectorAll(HEADING_SELECTOR);
        if (!headings.length) return;
        if (!('IntersectionObserver' in window)) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    setActiveTocLink(entry.target.id);
                }
            });
        }, {
            rootMargin: OBSERVER_ROOT_MARGIN,
            threshold: 0
        });

        headings.forEach(function (h) {
            observer.observe(h);
        });
    }

    /**
     * Desktop catalog toggle (fold/unfold).
     */
    function initCatalogToggle() {
        var toggle = document.querySelector('.catalog-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            var catalog = document.querySelector('.side-catalog');
            if (catalog) catalog.classList.toggle('fold');
        });
    }

    /**
     * Mobile TOC toggle panel.
     */
    function initMobileToc() {
        var toggle = document.querySelector('.mobile-toc-toggle');
        var panel = document.querySelector('.mobile-toc-panel');
        if (!toggle || !panel) return;

        function closePanel() {
            panel.classList.remove('mobile-toc-panel--open');
            toggle.setAttribute('aria-expanded', 'false');
        }

        function openPanel() {
            panel.classList.add('mobile-toc-panel--open');
            toggle.setAttribute('aria-expanded', 'true');
        }

        function isOpen() {
            return panel.classList.contains('mobile-toc-panel--open');
        }

        toggle.addEventListener('click', function () {
            if (isOpen()) {
                closePanel();
            } else {
                openPanel();
            }
        });

        // Close on link click
        panel.addEventListener('click', function (e) {
            if (e.target.tagName === 'A' || e.target.closest('a')) {
                closePanel();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) {
                closePanel();
                toggle.focus();
            }
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (isOpen() && !panel.contains(e.target) && !toggle.contains(e.target)) {
                closePanel();
            }
        });
    }

    /**
     * Hide TOC containers when there are not enough headings.
     */
    function hideToc() {
        var catalogContainer = document.querySelector('.catalog-container');
        if (catalogContainer) catalogContainer.style.display = 'none';

        var mobileTocWrapper = document.querySelector('.mobile-toc-wrapper');
        if (mobileTocWrapper) mobileTocWrapper.style.display = 'none';
    }

    /**
     * Main init: generate TOC, wire up observers and toggles.
     */
    function init() {
        var container = getPostContainer();
        if (!container) return;

        var items = buildTocItems(container);

        // Hide TOC if fewer than MIN_HEADINGS
        if (items.length === 0) {
            hideToc();
            return;
        }

        // Populate desktop catalog
        var desktopUl = document.querySelector('.catalog-body');
        if (desktopUl) populateList(desktopUl, items);

        // Populate mobile catalog
        var mobileUl = document.querySelector('.mobile-catalog-body');
        if (mobileUl) populateList(mobileUl, items);

        // Cache TOC elements for scroll highlight performance
        cacheTocElements();

        // Wire up interactions
        initCatalogToggle();
        initMobileToc();
        initScrollHighlight(container);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
