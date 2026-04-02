# Sprint 12 QA Fix 검증 리포트

> 검증일: 2026-04-02 | 검증 대상: commit `feac2d7` (Sprint 12 QA fix: P1+P2+P3 7건 수정)
> 검증 기준: QA_REPORT_SPRINT12.md 지적 항목 7건

---

## 검증 결과 요약

| # | 이슈 | 심각도 | 결과 |
|---|------|--------|------|
| 1 | Lightbox `closeLightbox()` src 초기화 | P1 | ✅ |
| 2 | Redis 캐스팅 2곳 추가 | P1 | ✅ |
| 3 | `--text-on-accent` 복원 + `--bg-body` 분리 | P2 | ✅ |
| 4 | JSON-LD `name` → `page.title \| jsonify` | P2 | ✅ |
| 5 | Giscus setTimeout 9000ms | P2 | ✅ |
| 6 | `.lightbox-img { cursor: default }` | P3 | ✅ |
| 7 | Giscus 다시 시도 버튼 | P3 | ✅ |

**전체: 7/7 통과**

---

## 항목별 상세 검증

### 1. ✅ Lightbox `closeLightbox()` — `lbImg.src = ''` 추가 [P1]

**파일:** `_layouts/post.html` 라인 237

```javascript
function closeLightbox() {
    overlay.classList.remove('active');
    document.body.classList.remove('lightbox-open');
    lbImg.style.visibility = 'visible';
    lbImg.src = '';  // ← 정상 추가됨
    if (lbSpinner) lbSpinner.style.display = 'none';
    if (triggerImg) {
        triggerImg.focus();
        triggerImg = null;
    }
}
```

QA 리포트 BUG-1 "방안 A"와 일치. 동일 이미지 재클릭 시 `src`가 빈 문자열에서 새 URL로 설정되므로 `load` 이벤트가 정상 발화됨.

---

### 2. ✅ Redis 코드 캐스팅 2곳 추가 [P1]

**파일:** `_posts/2026-04-02-redis-caching-strategy.md`

| 위치 | 코드 | 결과 |
|------|------|------|
| 라인 151 (Sliding TTL) | `User cached = (User) redisTemplate.opsForValue().get(cacheKey);` | ✅ `(User)` 캐스트 추가됨 |
| 라인 187 (Mutex Lock) | `User cached = (User) redisTemplate.opsForValue().get(cacheKey);` | ✅ `(User)` 캐스트 추가됨 |

4곳 모두 일관된 `(User)` 캐스팅 적용 완료.

---

### 3. ✅ `--text-on-accent` 복원 + `--bg-body` 토큰 분리 [P2]

**파일:** `css/custom.css`

**토큰 정의 확인:**

| 토큰 | Light (라인 25-26) | Dark (라인 43-44) |
|------|-------------------|-------------------|
| `--text-on-accent` | `#fff` | `#0d1117` |
| `--bg-body` | `#fff` | `#0d1117` |

- `--text-heading` 참조: 0건 (완전 제거됨) ✅
- `--text-on-accent` 참조: 20곳 — accent 배경 위 텍스트 용도로 정상 사용 ✅
- `--bg-body` 참조: 2곳 — `background-color` 전용으로 분리됨 ✅

**background-color 교체 확인:**

| 위치 | 코드 | 결과 |
|------|------|------|
| 라인 1254 (`[data-theme="dark"] body`) | `background-color: var(--bg-body);` | ✅ |
| 라인 1585 (`.intro-header`) | `background-color: var(--bg-body);` | ✅ |

QA 리포트 BUG-3/DC-3 권장사항(용도 분리) 정확히 반영됨.

---

### 4. ✅ CollectionPage JSON-LD `name` → `page.title | jsonify` [P2]

**파일:** `_includes/head.html` 라인 124

```json
"name": {{ page.title | jsonify }},
```

QA 리포트 SEO-5 지적사항 해결. 영문 하드코딩 `"Categories"` → 동적 `page.title` 출력으로 변경됨. `jsonify` 필터로 JSON 이스케이프 안전.

---

### 5. ✅ Giscus setTimeout 9000ms [P2]

**파일:** `_includes/comments.html` 라인 52

```javascript
}, 9000);
```

QA 리포트 UX-2 권장(5초 → 8-10초)에 따라 9초로 변경됨. 느린 네트워크에서 거짓 에러 표시 가능성 감소.

---

### 6. ✅ `.lightbox-img { cursor: default }` [P3]

**파일:** `css/custom.css` 라인 4727-4736

```css
.lightbox-img {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
    animation: lightbox-scale-in 0.25s ease;
    touch-action: pinch-zoom;
    cursor: default;  /* ← 정상 추가됨 */
}
```

QA 리포트 UX-4/BUG-6 해결. 이미지 위에서 `pointer` 커서가 아닌 `default` 커서 표시.

---

### 7. ✅ Giscus 에러 다시 시도 버튼 [P3]

**파일 1:** `_includes/comments.html` 라인 10

```html
<button onclick="location.reload()" class="giscus-retry-btn">다시 시도</button>
```

**파일 2:** `css/custom.css` 라인 4828-4842

```css
.giscus-retry-btn {
    display: inline-block;
    margin-top: 10px;
    padding: 6px 16px;
    font-size: 13px;
    color: var(--text-on-accent);
    background: var(--accent-primary);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.2s ease;
}
.giscus-retry-btn:hover {
    opacity: 0.85;
}
```

QA 리포트 UX-2 권장사항 반영. 디자인 토큰 사용으로 다크/라이트 모드 자동 대응.

---

## 추가 발견 사항

검증 과정에서 신규 버그나 리그레션은 발견되지 않았습니다.

**관찰 사항 (조치 불필요):**
- `--text-on-accent`와 `--bg-body`가 동일한 값(`#fff` / `#0d1117`)을 가지나, 의미적 분리(텍스트 vs 배경)가 목적이므로 정상
- Giscus 다시 시도 버튼이 `location.reload()`를 사용하여 전체 페이지를 새로고침하는 방식 — Giscus iframe만 재로드하는 것이 이상적이나, 현재 구현도 기능적으로 문제없음

---

## 결론

Sprint 12 QA 리포트에서 지적된 P1 2건, P2 3건, P3 2건 총 7건의 수정 항목이 모두 올바르게 처리되었습니다. 리그레션 없음.

---

*Verified on 2026-04-02 against commit `feac2d7`*
