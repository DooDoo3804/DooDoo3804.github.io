/*!
 * Hux Blog v1.6.0
 * Copyright 2016 @huxpro
 * Licensed under Apache 2.0
 * Rewritten to vanilla JS — Sprint 17
 */

(function () {
    'use strict';

    // responsive tables
    function wrapTables() {
        var tables = document.querySelectorAll('table');
        tables.forEach(function (table) {
            if (!table.classList.contains('table')) {
                table.classList.add('table');
            }
            if (!table.parentElement || !table.parentElement.classList.contains('table-responsive')) {
                var wrapper = document.createElement('div');
                wrapper.className = 'table-responsive';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    // responsive embed videos (YouTube, YouTube Privacy-Enhanced, Vimeo)
    function wrapVideos() {
        var iframes = document.querySelectorAll(
            'iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"], iframe[src*="vimeo.com"]'
        );
        iframes.forEach(function (iframe) {
            if (!iframe.classList.contains('embed-responsive-item')) {
                iframe.classList.add('embed-responsive-item');
            }
            if (!iframe.parentElement || !iframe.parentElement.classList.contains('embed-responsive')) {
                var wrapper = document.createElement('div');
                wrapper.className = 'embed-responsive embed-responsive-16by9';
                iframe.parentNode.insertBefore(wrapper, iframe);
                wrapper.appendChild(iframe);
            }
        });
    }

    // Navigation Scripts to Show Header on Scroll-Up
    function initNavbarScroll() {
        // Matches the CSS breakpoint in hux-blog.min.css for navbar transition
        var MQL = 1170;
        // px gap between banner bottom and catalog fixed position trigger
        var CATALOG_OFFSET = 41;

        var navbar = document.querySelector('.navbar-custom');
        if (!navbar) return;

        var introContainer = document.querySelector('.intro-header .container');
        var headerHeight = navbar.offsetHeight;
        var bannerHeight = introContainer ? introContainer.offsetHeight : 0;
        var previousTop = 0;
        var ticking = false;
        var catalogInitialized = false;

        window.addEventListener('scroll', function () {
            if (!ticking) {
                window.requestAnimationFrame(function () {
                    var currentTop = window.scrollY || window.pageYOffset;

                    // Only apply scroll-hide on wide screens (re-evaluated on every frame for resize support)
                    if (window.innerWidth > MQL) {
                        var catalog = document.querySelector('.side-catalog');

                        if (currentTop < previousTop) {
                            if (currentTop > 0 && navbar.classList.contains('is-fixed')) {
                                navbar.classList.add('is-visible');
                            } else {
                                navbar.classList.remove('is-visible', 'is-fixed');
                            }
                        } else {
                            navbar.classList.remove('is-visible');
                            if (currentTop > headerHeight && !navbar.classList.contains('is-fixed')) {
                                navbar.classList.add('is-fixed');
                            }
                        }

                        // adjust the appearance of side-catalog
                        if (catalog) {
                            if (!catalogInitialized) {
                                catalog.style.display = '';
                                catalogInitialized = true;
                            }
                            if (currentTop > (bannerHeight + CATALOG_OFFSET)) {
                                catalog.classList.add('fixed');
                            } else {
                                catalog.classList.remove('fixed');
                            }
                        }
                    } else {
                        // On narrow screens, reset navbar state
                        navbar.classList.remove('is-visible', 'is-fixed');
                    }

                    previousTop = currentTop;
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // Init on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        wrapTables();
        wrapVideos();
        initNavbarScroll();
    });
})();
