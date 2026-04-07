/* index.js — Category filter + relative dates for homepage */
(function() {
    'use strict';

    function init() {
        initCategoryFilter();
        initRelativeDates();
    }

    /* --- Category Filter --- */
    function initCategoryFilter() {
        var buttons = document.querySelectorAll('.category-btn');
        var cards = document.querySelectorAll('.post-card');
        var noResults = document.querySelector('.filter-no-results');

        buttons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var filter = this.getAttribute('data-filter');

                buttons.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');

                var visibleCount = 0;
                cards.forEach(function(card) {
                    var tags = (card.getAttribute('data-tags') || '').split(',');
                    if (filter === 'all' || tags.indexOf(filter) !== -1) {
                        card.style.display = '';
                        card.classList.remove('filter-hidden');
                        card.style.animationDelay = (visibleCount * 0.04) + 's';
                        card.classList.add('filter-enter');
                        visibleCount++;
                    } else {
                        card.classList.add('filter-hidden');
                        card.classList.remove('filter-enter');
                        card.style.display = 'none';
                    }
                });

                if (noResults) {
                    noResults.style.display = visibleCount === 0 ? 'block' : 'none';
                }
            });
        });

        var resetBtn = document.getElementById('filter-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                var allBtn = document.querySelector('.category-btn[data-filter="all"]');
                if (allBtn) allBtn.click();
            });
        }
    }

    /* --- Relative Dates --- */
    function initRelativeDates() {
        var rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
            ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
            : null;

        function timeAgo(dateStr) {
            var now = new Date();
            var date = new Date(dateStr);
            var diffMs = now - date;
            var seconds = Math.floor(diffMs / 1000);
            var minutes = Math.floor(seconds / 60);
            var hours = Math.floor(minutes / 60);
            var days = Math.floor(hours / 24);

            if (rtf) {
                if (days >= 365) { return rtf.format(-Math.round(days / 365.25), 'year'); }
                if (days >= 30) { return rtf.format(-Math.round(days / 30.44), 'month'); }
                if (days >= 1) return rtf.format(-days, 'day');
                if (hours >= 1) return rtf.format(-hours, 'hour');
                return rtf.format(-minutes, 'minute');
            }

            if (days >= 365) { var y = Math.round(days / 365.25); return y === 1 ? '1 year ago' : y + ' years ago'; }
            if (days >= 30) { var m = Math.round(days / 30.44); return m === 1 ? '1 month ago' : m + ' months ago'; }
            if (days >= 1) return days === 1 ? '1 day ago' : days + ' days ago';
            if (hours >= 1) return hours === 1 ? '1 hour ago' : hours + ' hours ago';
            return 'just now';
        }

        document.querySelectorAll('.post-date[data-date]').forEach(function(el) {
            var iso = el.getAttribute('data-date');
            el.textContent = timeAgo(iso);
        });

        document.querySelectorAll('.post-updated[data-date]').forEach(function(el) {
            var iso = el.getAttribute('data-date');
            el.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-arrows-rotate"/></svg> Updated ' + timeAgo(iso);
        });
    }

    /* --- Init --- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
