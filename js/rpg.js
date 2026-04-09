(function() {
    'use strict';

    // Shared localStorage keys:
    // 'doodoo-reading-stats' — read/write by custom.js, read by rpg.js & index.html
    // 'doodoo-rpg'           — read/write by rpg.js; written by custom.js (typing challenge XP)
    // 'doodoo-blog-theme'    — read/write by custom.js only
    var STORAGE_KEY = 'doodoo-rpg';
    var READING_KEY = 'doodoo-reading-stats';

    // 레벨 테이블
    var LEVELS = [
        { xp: 0, title: 'Visitor', emoji: '👤' },
        { xp: 100, title: 'Reader', emoji: '📖' },
        { xp: 300, title: 'Learner', emoji: '🎓' },
        { xp: 600, title: 'Developer', emoji: '💻' },
        { xp: 1000, title: 'Engineer', emoji: '⚙️' },
        { xp: 1500, title: 'Senior Dev', emoji: '🚀' },
        { xp: 2500, title: 'Architect', emoji: '🏗️' },
        { xp: 4000, title: 'Principal', emoji: '👑' },
        { xp: 6000, title: 'CTO', emoji: '🌟' }
    ];

    // 업적
    var ACHIEVEMENTS = {
        'first-blood': { name: 'First Blood', desc: 'Read your first post', check: function(s) { return s.postsRead >= 1; } },
        'bookworm': { name: 'Bookworm', desc: 'Read 5 posts', check: function(s) { return s.postsRead >= 5; } },
        'scholar': { name: 'Scholar', desc: 'Read 10 posts', check: function(s) { return s.postsRead >= 10; } },
        'completionist': { name: 'Completionist', desc: 'Read 20 posts', check: function(s) { return s.postsRead >= 20; } },
        'spring-master': { name: 'Spring Master', desc: 'Read all Spring posts', check: function(s) { return (s.catReads.spring || 0) >= 8; } },
        'jvm-diver': { name: 'JVM Deep Diver', desc: 'Read all JVM posts', check: function(s) { return (s.catReads.jvm || 0) >= 3; } },
        'polyglot': { name: 'Polyglot', desc: 'Read posts in 5+ categories', check: function(s) { return Object.keys(s.catReads).filter(function(k) { return s.catReads[k] > 0; }).length >= 5; } },
        'night-owl': { name: 'Night Owl', desc: 'Visit after midnight', check: function(s) { return new Date().getHours() < 5; } },
        'streak-3': { name: 'On Fire', desc: '3-day reading streak', check: function(s) { return s.streak >= 3; } }
    };

    function getState() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || createDefault(); }
        catch(e) { return createDefault(); }
    }

    function createDefault() {
        return { xp: 0, achievements: [], lastVisitDate: null, streak: 0 };
    }

    function saveState(state) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
    }

    function getLevel(xp) {
        var level = LEVELS[0];
        for (var i = LEVELS.length - 1; i >= 0; i--) {
            if (xp >= LEVELS[i].xp) { level = LEVELS[i]; level.index = i; break; }
        }
        var nextLevel = LEVELS[Math.min(level.index + 1, LEVELS.length - 1)];
        var progress = nextLevel.xp > level.xp ? ((xp - level.xp) / (nextLevel.xp - level.xp)) * 100 : 100;
        return { current: level, next: nextLevel, progress: Math.round(progress) };
    }

    function getReadingStats() {
        try {
            var stats = JSON.parse(localStorage.getItem(READING_KEY)) || {};
            var postsRead = 0;
            var catReads = {};
            Object.keys(stats).forEach(function(k) {
                if (stats[k].readAt) {
                    postsRead++;
                    // URL에서 카테고리 추출: /category/year/month/day/slug/
                    var parts = k.split('/').filter(Boolean);
                    if (parts.length >= 1) {
                        var cat = parts[0];
                        catReads[cat] = (catReads[cat] || 0) + 1;
                    }
                }
            });
            return { postsRead: postsRead, catReads: catReads };
        } catch(e) {
            return { postsRead: 0, catReads: {} };
        }
    }

    // XP 부여 (포스트 읽기 기반)
    function syncXP(state) {
        var readStats = getReadingStats();
        // 포스트당 50 XP + 카테고리 다양성 보너스
        var baseXP = readStats.postsRead * 50;
        var catCount = Object.keys(readStats.catReads).filter(function(k) { return readStats.catReads[k] > 0; }).length;
        var diversityBonus = catCount * 30;
        state.xp = baseXP + diversityBonus;

        // 연속 방문 streak 계산
        var today = new Date().toISOString().split('T')[0];
        if (state.lastVisitDate) {
            var yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            var yesterdayStr = yesterday.toISOString().split('T')[0];
            if (state.lastVisitDate === today) {
                // 오늘 이미 방문
            } else if (state.lastVisitDate === yesterdayStr) {
                state.streak = (state.streak || 0) + 1;
            } else {
                state.streak = 1;
            }
        } else {
            state.streak = 1;
        }
        state.lastVisitDate = today;

        // 업적 체크
        var summary = { postsRead: readStats.postsRead, catReads: readStats.catReads, streak: state.streak };
        Object.keys(ACHIEVEMENTS).forEach(function(id) {
            if (state.achievements.indexOf(id) === -1 && ACHIEVEMENTS[id].check(summary)) {
                state.achievements.push(id);
            }
        });

        return readStats;
    }

    // 홈페이지 위젯 렌더링
    function renderWidget() {
        var widget = document.getElementById('rpg-widget');
        if (!widget) return;

        var state = getState();
        var readStats = syncXP(state);
        saveState(state);

        var level = getLevel(state.xp);

        // 주간 읽기 목표 계산 (월~일 기준)
        var weeklyGoal = 5;
        var weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1)); // 월요일
        weekStart.setHours(0, 0, 0, 0);
        var weeklyRead = 0;
        var rawStats;
        try { rawStats = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch(e) { rawStats = {}; }
        Object.keys(rawStats).forEach(function(k) {
            if (rawStats[k].readAt && new Date(rawStats[k].readAt) >= weekStart) weeklyRead++;
        });

        widget.innerHTML =
            '<div class="rpg-level">' + level.current.emoji + ' <span class="rpg-title">' + level.current.title + '</span> <span class="rpg-xp">' + state.xp + ' XP</span></div>' +
            '<div class="rpg-bar"><div class="rpg-bar-fill" style="width:' + level.progress + '%"></div></div>' +
            '<div class="rpg-meta">' +
                '<span>' + readStats.postsRead + ' posts read</span>' +
                (state.streak > 1 ? '<span>\uD83D\uDD25 ' + state.streak + ' day streak</span>' : '') +
                '<span>\uD83D\uDCDA ' + weeklyRead + '/' + weeklyGoal + ' this week</span>' +
                '<span>' + state.achievements.length + ' achievements</span>' +
            '</div>';
    }

    // 카테고리 마스터리 뱃지 렌더링
    function renderCategoryBadges() {
        var cards = document.querySelectorAll('.post-card');
        if (cards.length === 0) return;

        var stats;
        try { stats = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch(e) { return; }

        // 카테고리별 전체/읽은 수 카운트
        var catTotal = {};
        var catRead = {};

        cards.forEach(function(card) {
            var tagAttr = card.getAttribute('data-tag');
            if (!tagAttr) return;
            var cat = tagAttr.toLowerCase();
            catTotal[cat] = (catTotal[cat] || 0) + 1;

            var link = card.querySelector('a');
            if (link) {
                var href = link.getAttribute('href');
                if (stats[href] && stats[href].readAt) {
                    catRead[cat] = (catRead[cat] || 0) + 1;
                }
            }
        });

        // 카테고리 필터 버튼에 마스터리 표시
        var filterBtns = document.querySelectorAll('.category-btn[data-filter]');
        filterBtns.forEach(function(btn) {
            var filter = btn.getAttribute('data-filter');
            if (filter === 'all') return;

            var total = catTotal[filter] || 0;
            var read = catRead[filter] || 0;

            if (total > 0 && read >= total) {
                var badge = document.createElement('span');
                badge.className = 'cat-mastery-badge';
                badge.textContent = '\uD83C\uDFC6';
                badge.title = 'All ' + total + ' posts read!';
                btn.appendChild(badge);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        renderWidget();
        renderCategoryBadges();
    });
})();
