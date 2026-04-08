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
     * Set the active TOC link by heading id across desktop + mobile lists.
     */
    function setActiveTocLink(id) {
        var selectors = ['.catalog-body li', '.mobile-catalog-body li'];
        selectors.forEach(function (sel) {
            var lis = document.querySelectorAll(sel);
            lis.forEach(function (li) {
                var a = li.querySelector('a');
                if (a && a.getAttribute('href') === '#' + id) {
                    li.classList.add('active');
                } else {
                    li.classList.remove('active');
                }
            });
        });

        // Auto-scroll sidebar to keep active item visible
        var activeLi = document.querySelector('.catalog-body .active');
        if (activeLi) {
            activeLi.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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

        // Wire up interactions
        initCatalogToggle();
        initMobileToc();
        initScrollHighlight(container);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
