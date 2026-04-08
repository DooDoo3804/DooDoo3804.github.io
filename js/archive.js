/*
Credits: this script is shamelessly borrowed from
https://github.com/kitian616/jekyll-TeXt-theme
Rewritten to vanilla JS — Sprint 17
*/
(function() {
  'use strict';

  function queryString() {
    var i = 0, queryObj = {}, pair;
    var queryStr = window.location.search.substring(1);
    var queryArr = queryStr.split('&');
    for (i = 0; i < queryArr.length; i++) {
      pair = queryArr[i].split('=');
      if (typeof queryObj[pair[0]] === 'undefined') {
        queryObj[pair[0]] = pair[1];
      } else if (typeof queryObj[pair[0]] === 'string') {
        queryObj[pair[0]] = [queryObj[pair[0]], pair[1]];
      } else {
        queryObj[pair[0]].push(pair[1]);
      }
    }
    return queryObj;
  }

  var setUrlQuery = (function() {
    var baseUrl = window.location.href.split('?')[0];
    return function(query) {
      if (typeof query === 'string') {
        window.history.replaceState(null, '', baseUrl + query);
      } else {
        window.history.replaceState(null, '', baseUrl);
      }
    };
  })();

  document.addEventListener('DOMContentLoaded', function() {
    var tagsContainer = document.querySelector('.js-tags');
    if (!tagsContainer) return;

    var articleTags = Array.from(tagsContainer.querySelectorAll('.tag-button'));
    var tagShowAll = tagsContainer.querySelector('.tag-button--all');
    var resultContainer = document.querySelector('.js-result');
    if (!resultContainer) return;

    var sections = Array.from(resultContainer.querySelectorAll('section'));
    var sectionArticles = [];
    var lastFocusButton = null;
    var sectionTopArticleIndex = [];
    var hasInit = false;

    sections.forEach(function(section) {
      sectionArticles.push(Array.from(section.querySelectorAll('.item')));
    });

    function init() {
      var i, index = 0;
      for (i = 0; i < sections.length; i++) {
        sectionTopArticleIndex.push(index);
        index += sections[i].querySelectorAll('.item').length;
      }
      sectionTopArticleIndex.push(index);
    }

    function searchButtonsByTag(_tag) {
      if (!_tag) {
        return tagShowAll;
      }
      var matched = articleTags.filter(function(btn) {
        return btn.getAttribute('data-encode') === _tag;
      });
      if (matched.length === 0) {
        return tagShowAll;
      }
      return matched[0];
    }

    function buttonFocus(target) {
      if (target) {
        target.classList.add('focus');
        if (lastFocusButton && lastFocusButton !== target) {
          lastFocusButton.classList.remove('focus');
        }
        lastFocusButton = target;
      }
    }

    function tagSelect(tag, target) {
      var result = {};
      var i, j, k;

      for (i = 0; i < sectionArticles.length; i++) {
        var articles = sectionArticles[i];
        for (j = 0; j < articles.length; j++) {
          if (tag === '' || tag === undefined) {
            result[i] || (result[i] = {});
            result[i][j] = true;
          } else {
            var tags = (articles[j].getAttribute('data-tags') || '').split(',').filter(Boolean);
            for (k = 0; k < tags.length; k++) {
              if (tags[k] === tag) {
                result[i] || (result[i] = {});
                result[i][j] = true;
                break;
              }
            }
          }
        }
      }

      for (i = 0; i < sectionArticles.length; i++) {
        if (result[i]) {
          sections[i].classList.remove('d-none');
        } else {
          sections[i].classList.add('d-none');
        }
        for (j = 0; j < sectionArticles[i].length; j++) {
          if (result[i] && result[i][j]) {
            sectionArticles[i][j].classList.remove('d-none');
          } else {
            sectionArticles[i][j].classList.add('d-none');
          }
        }
      }

      if (!hasInit) {
        resultContainer.classList.remove('d-none');
        hasInit = true;
      }

      if (target) {
        buttonFocus(target);
        var _tag = target.getAttribute('data-encode');
        if (_tag === '' || typeof _tag !== 'string') {
          setUrlQuery();
        } else {
          setUrlQuery('?tag=' + _tag);
        }
      } else {
        buttonFocus(searchButtonsByTag(tag));
      }
    }

    var query = queryString(),
        _tag = query.tag;

    init();
    tagSelect(_tag);

    tagsContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.tag-button, .tag-button--all');
      if (!btn) return;
      e.preventDefault();
      tagSelect(btn.getAttribute('data-encode'), btn);
    });

  });
})();
