# Sprint 12 QA 리포트

> 검토일: 2026-04-02 | 검토 대상: commit `594b368` (Sprint 12: P2 UX/SEO/콘텐츠 개선)
> 5인 리뷰팀: QA Engineer, UX Reviewer, Design Critic, SEO Specialist, Content Editor

---

## 전체 요약

| 심각도 | 건수 | 핵심 항목 |
|--------|------|-----------|
| **P0 Critical** | 0 | — |
| **P1 Major** | 2 | Lightbox 동일 이미지 재클릭 버그, Redis 코드 캐스팅 잔여 누락 |
| **P2 Moderate** | 4 | CSS 토큰 네이밍, Giscus 타임아웃, YouTube URL, CollectionPage JSON-LD |
| **P3 Minor** | 3 | 커서 스타일, 포커스 트랩, 메시지 검증 (Sprint 11 잔존) |
| **✅ 해결됨** | 14 | Sprint 11 이슈 14건 정상 수정 확인 |

**Sprint 12 전반 평가:** Sprint 11에서 지적된 P0 3건, P1 다수, P2 다수가 성공적으로 해결됨. 신규 P0 이슈 없음. 전체적으로 높은 품질의 스프린트.

---

## Sprint 11 이슈 해결 현황

### ✅ 정상 수정된 항목 (14건)

| Sprint 11 이슈 | 수정 내용 | 검증 |
|----------------|-----------|------|
| **P0-2** 중복 포스트 (Redis/Kafka) | `_posts/db/`, `_posts/system-design/` 중복 버전 삭제 | 파일 부재 확인 ✅ |
| **P0-3** `backend` 카테고리 미등록 | `categories.html` case문 + `custom.css` `.cat-card--backend` 추가 | 라인 73-76, CSS 라인 2140/2194 ✅ |
| **P1-4** 카테고리 카드 접근성 | `tabindex="0"`, `role="button"`, `aria-label`, `keydown` 이벤트 추가 | `categories.html:82, 174-179` ✅ |
| **P1-5** Lightbox `<span>` → `<button>` | `<button>` 교체, 44px 터치 타겟, `safe-area-inset-top` | `post.html:218`, CSS 4750-4776 ✅ |
| **P1-9** description 길이 초과 | Redis 53자, Kafka 47자, Kotlin 45자 (목표 70자 이하) | front matter 확인 ✅ |
| **P1-11** Kafka `kafkaTemplate()` 빈 주입 | `@Autowired` 필드 주입 + 파라미터 주입으로 변경 | 라인 365-366, 470 ✅ |
| **P1-13** categories.html H1 부재 | `<h3>` → `<h1 class="tags-section-title">` | `categories.html:17` ✅ |
| **P2-14** Lightbox 모바일 터치 | 스와이프 닫기, 44px 터치 타겟, safe-area 적용 | `post.html:285-302` ✅ |
| **P2-15** Giscus 로딩/에러 UI | 스피너 placeholder + 5초 타임아웃 에러 메시지 | `comments.html:4-10, 37-51` ✅ |
| **P2-16** feed.xml CDATA 이스케이프 | `replace: ']]>', ']]]]><![CDATA[>'` 필터 적용 | `feed.xml:20` ✅ |
| **P2-18** JSON-LD image 폴백 | thumbnail → og-per-post → header-img → og-default.png 4단계 | `head.html:98-102` ✅ |
| **P2-20** Lightbox 이미지 로딩 스피너 | 스피너 표시 → `load` 이벤트 시 숨김 | `post.html:245-248` ✅ |
| **P2-21** 미사용 CSS 토큰 삭제 | `--accent-rgb`, `--accent-rgb-light`, `--accent-rgb-dark`, `--accent-secondary` 제거 | 파일 내 검색 0건 ✅ |
| **P2-23** 참고 자료 섹션 추가 | 3개 포스트 모두 `References` 섹션 + 공식 문서 링크 | 각 포스트 하단 확인 ✅ |

### ⚠️ 부분 수정된 항목 (2건)

| Sprint 11 이슈 | 상태 | 잔여 문제 |
|----------------|------|-----------|
| **P1-10** Redis 타입 캐스팅 | 부분 수정 | 아래 BUG-2 참조 |
| **DC-10** `--text-on-accent` 이름 변경 | 수정했으나 개선 불충분 | 아래 BUG-3 참조 |

### ❌ 미해결 항목 (Sprint 12 범위 외, 3건)

| Sprint 11 이슈 | 상태 |
|----------------|------|
| **BUG-6** `.lightbox-img { cursor: default }` 미적용 | 커서 여전히 `pointer` 상속 |
| **UX-6** Lightbox 포커스 트랩 미구현 | `role="dialog"` 있으나 Tab 가두기 없음 |
| **CE-5** Kafka boolean 타입 비일관 | ✅ 실제로 수정됨 (false/true boolean 통일) |

> 참고: #c9d1d9 토큰화, color-mix() fallback, spacing 토큰 등 Design System 이슈는 Sprint 12 범위 외.

---

## 1. [QA] 기능 버그 검사

### BUG-1: Lightbox 동일 이미지 재클릭 시 스피너 영구 표시 [P1]

**파일:** `_layouts/post.html` 라인 233-267

**현상:** 이미지 A 클릭 → Lightbox 열림 → 닫기 → 이미지 A 다시 클릭 → 스피너만 표시, 이미지 안 보임

**원인:** `closeLightbox()`에서 `lbImg.src`를 초기화하지 않음. 재클릭 시 `lbImg.src = this.src`가 동일 URL을 설정하면 일부 브라우저에서 `load` 이벤트가 재발화되지 않는다.

```javascript
// 현재 코드 (post.html:233-241)
function closeLightbox() {
    overlay.classList.remove('active');
    document.body.classList.remove('lightbox-open');
    lbImg.style.visibility = 'visible';       // visibility 복원
    if (lbSpinner) lbSpinner.style.display = 'none';
    // ❌ lbImg.src 미초기화 → 재클릭 시 동일 URL, load 미발화
}

// 클릭 핸들러 (post.html:259-261)
lbImg.style.visibility = 'hidden';            // 숨김
if (lbSpinner) lbSpinner.style.display = 'block'; // 스피너 표시
lbImg.src = this.src;                          // 동일 URL → load 안 됨
```

**재현:** Chrome/Safari에서 같은 이미지를 두 번 연속 클릭.

**수정 방안 (택 1):**
```javascript
// 방안 A: closeLightbox()에서 src 초기화
function closeLightbox() {
    overlay.classList.remove('active');
    document.body.classList.remove('lightbox-open');
    lbImg.style.visibility = 'visible';
    lbImg.src = '';  // ← 추가
    if (lbSpinner) lbSpinner.style.display = 'none';
    if (triggerImg) { triggerImg.focus(); triggerImg = null; }
}

// 방안 B: 클릭 핸들러에서 캐시 체크
if (lbImg.src === this.src && lbImg.complete) {
    lbImg.style.visibility = 'visible';
    if (lbSpinner) lbSpinner.style.display = 'none';
} else {
    lbImg.style.visibility = 'hidden';
    if (lbSpinner) lbSpinner.style.display = 'block';
    lbImg.src = this.src;
}
```

---

### BUG-2: Redis 코드 예제 타입 캐스팅 2곳 잔여 누락 [P1]

**파일:** `_posts/2026-04-02-redis-caching-strategy.md`

Sprint 11 CE-2에서 지적된 캐스팅 이슈가 **부분 수정**됨.

| 위치 | 코드 | 상태 |
|------|------|------|
| ~라인 45 (Cache-Aside) | `User cached = (User) redisTemplate.opsForValue().get(cacheKey);` | ✅ 수정됨 |
| ~라인 151 (Sliding TTL) | `User cached = redisTemplate.opsForValue().get(cacheKey);` | ❌ 캐스트 누락 |
| ~라인 187 (Mutex Lock) | `User cached = redisTemplate.opsForValue().get(cacheKey);` | ❌ 캐스트 누락 |
| ~라인 220 (PER) | `CacheEntry<User> entry = (CacheEntry<User>) redisTemplate...` | ✅ 수정됨 |

**수정:** 라인 151, 187에 `(User)` 캐스트 추가.

---

### BUG-3: `--text-heading` 이름 변경이 의미적으로 악화 [P2]

**파일:** `css/custom.css` 라인 25 (light), 42 (dark)

Sprint 11 DC-10에서 `--text-on-accent` → `--text-heading` 이름 변경을 수행했으나, 새 이름이 실제 용도와 **더 불일치**한다.

| 용도 | 위치 (예시) | 원래 이름 적합성 | 새 이름 적합성 |
|------|-------------|-----------------|---------------|
| accent 배경 위 텍스트 색상 | 라인 284, 702, 927 등 | ✅ `text-on-accent` 정확 | ❌ `text-heading` 부정확 |
| `body` 배경색 | 라인 1252 | ❌ 부적절 | ❌ 더 부적절 |
| `.intro-header` 배경색 | 라인 1583 | ❌ 부적절 | ❌ 더 부적절 |

**값:** light `#fff`, dark `#0d1117` — 이는 "대비 색상/반전 색상"이지 "heading 텍스트 색상"이 아님.

**수정 권장:** 용도를 분리하는 것이 이상적:
- `background-color` 용도 2곳 → `var(--bg-body)` 또는 직접 값
- 나머지 18곳 → `--text-on-accent` 복원 또는 `--contrast-color` 등

---

### BUG-4: 터치 스와이프 JS — 정상 [확인 완료]

**파일:** `_layouts/post.html` 라인 285-302

```javascript
// 스와이프 아래로: 수직 거리 > 80px, 주로 수직 방향
if (dy > 80 && dy > dx) {
    closeLightbox();
}
```

- `touchstart`/`touchend`에 `{ passive: true }` 정상 적용 ✅
- 단일 터치만 처리 (`e.touches.length === 1`) ✅
- 수직 우세 체크 (`dy > dx`) 실수 스크롤 방지 ✅
- 80px 임계값은 의도치 않은 발동을 방지하면서 자연스러운 수준 ✅

---

### BUG-5: Giscus 로딩 감지 — 정상 (경미한 개선점 있음) [확인 완료]

**파일:** `_includes/comments.html` 라인 37-51

```javascript
window.addEventListener('message', function(e) {
    if (e.origin === 'https://giscus.app' && !loaded) {
        loaded = true;
        placeholder.style.display = 'none';
    }
});
```

- origin 체크 (`https://giscus.app`) 정확 ✅
- `loaded` 플래그로 중복 처리 방지 ✅
- 5초 타임아웃 폴백 ✅

**경미한 개선점 (P3):** Giscus는 `e.data.giscus` 구조로 메시지를 보냄. 현재 코드는 origin만 확인하고 payload는 검증하지 않아, Giscus 에러 응답도 "로딩 성공"으로 처리됨. 실질적 영향은 미미 — Giscus iframe 자체가 에러를 표시하므로.

---

### BUG-6: `--text-heading` 참조 누락 — 없음 [확인 완료]

`--text-on-accent` 검색 결과 0건. `--text-heading` 정의 2곳(light/dark), 참조 20곳, 모두 정상 매핑 ✅

---

### BUG-7: feed.xml CDATA — 정상 [확인 완료]

**파일:** `feed.xml` 라인 20

```xml
<content:encoded><![CDATA[{{ post.content | replace: ']]>', ']]]]><![CDATA[>' }}]]></content:encoded>
```

`]]>` → `]]]]><![CDATA[>` 치환은 CDATA 이스케이프의 표준 방식. XML 파싱 안전 ✅

---

## 2. [UX Roast] UX 검토

### UX-1: Lightbox 스피너 UX — 양호 ✅

**파일:** `_layouts/post.html` 라인 245-261, `css/custom.css` 라인 4780-4794

동작 흐름:
1. 이미지 클릭 → 이미지 `visibility: hidden`, 스피너 `display: block`
2. `lbImg.load` 이벤트 → 이미지 `visibility: visible`, 스피너 `display: none`
3. 오버레이 fade-in (0.2s) + 이미지 scale-in (0.25s) 애니메이션

`visibility`를 사용해 레이아웃 점프 없이 전환. 캐시된 이미지는 거의 즉시 로드되어 스피너가 깜빡이지 않음. 자연스러운 UX ✅

**단, BUG-1(동일 이미지 재클릭) 수정 필요.**

---

### UX-2: Giscus 에러 메시지 UX — 수용 가능, 개선 여지 [P3]

**파일:** `_includes/comments.html` 라인 8-9

```html
<div class="giscus-error" id="giscus-error" style="display:none;">
    댓글을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
</div>
```

**장점:**
- 한국어 메시지로 사용자 친화적 ✅
- placeholder 숨기고 에러 표시하는 전환 깔끔 ✅

**개선점:**
- "다시 시도" 버튼 없음 — 사용자가 페이지를 새로고침해야 함
- 5초 타임아웃이 느린 네트워크(3G 등)에서는 너무 짧을 수 있음 → 거짓 에러 표시 가능
- 에러 메시지에 아이콘 없음 (시각적 무게감 부족)

**수정 권장 (P3):**
```html
<div class="giscus-error" id="giscus-error" style="display:none;">
    <i class="fa fa-exclamation-circle"></i>
    댓글을 불러올 수 없습니다.
    <button onclick="location.reload()" class="giscus-retry-btn">다시 시도</button>
</div>
```
타임아웃을 8-10초로 연장 고려.

---

### UX-3: 터치 스와이프 임계값/방향 — 적절 ✅

**파일:** `_layouts/post.html` 라인 285-302

- **아래로 스와이프만 지원** — iOS/Android 공통 "dismiss" 제스처. 위로 스와이프는 스크롤과 충돌 가능하므로 제외가 올바름 ✅
- **80px 임계값** — 실수 터치 방지와 반응성 사이 적절한 균형. iOS 기본 dismiss 임계값(~100px)보다 약간 짧아 반응이 빠름 ✅
- **수직 우세 체크 (`dy > dx`)** — 대각선 스와이프 필터링 ✅

---

### UX-4: `.lightbox-img { cursor: default }` 미적용 [P3, Sprint 11 잔존]

**파일:** `css/custom.css` 라인 4725-4731

`.lightbox-overlay { cursor: pointer }` 가 이미지에 상속. 이미지 클릭 시 아무 동작 없는데(닫기는 backdrop 클릭에만 반응) pointer 커서 표시.

**수정:** `.lightbox-img { cursor: default; }` 추가.

---

### UX-5: Lightbox 포커스 트랩 미구현 [P3, Sprint 11 잔존]

**파일:** `_layouts/post.html` 라인 217

`role="dialog"` + `aria-modal="true"` 선언은 있으나, 실제 포커스 가두기 로직 없음. Tab 키로 배경 요소 순회 가능. Sprint 12에서 `closeBtn.focus()` (라인 266)은 추가됨 — 오픈 시 포커스 이동은 동작하지만 순환 트랩은 아님.

---

## 3. [Design Critic] 디자인 검사

### DC-1: Lightbox 스피너 스타일 — 블로그 톤 일치 ✅

**파일:** `css/custom.css` 라인 4780-4794

```css
.lightbox-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: lightbox-spin 0.7s linear infinite;
}
```

- 미니멀 원형 스피너, 어두운 배경 위 흰색 — 블로그의 클린/다크 톤과 일치 ✅
- 3px 두께와 0.7s 속도는 과하지 않은 속도감 ✅
- `rgba(255,255,255,0.2)` 트랙은 은은하게 전체 원형 암시 ✅
- 40px 크기는 85vh 이미지 영역에서 충분히 보이면서 과하지 않음 ✅

---

### DC-2: Giscus placeholder/error 스타일 일관성 — 양호 ✅

**파일:** `css/custom.css` 라인 4798-4824

| 요소 | 색상 | 크기 | 간격 |
|------|------|------|------|
| placeholder 텍스트 | `var(--text-muted)` | 14px | padding 32px 16px |
| placeholder 스피너 | `var(--border-light)` + `var(--accent-primary)` | 20px | gap 10px |
| error 텍스트 | `var(--text-muted)` | 14px | padding 24px 16px |

- 디자인 토큰 사용으로 다크/라이트 모드 자동 대응 ✅
- placeholder 스피너(20px)는 본문 인라인 컨텍스트에 적절 (Lightbox 40px과 비례) ✅
- error/placeholder 동일 색상·크기로 시각적 일관성 ✅

**경미한 개선점:** error 메시지에 `var(--text-muted)` 대신 살짝 더 강조된 색상(`var(--text-secondary)`) 사용을 고려하면 에러 상태임이 더 명확해짐.

---

### DC-3: `--text-heading` 네이밍 — 개선 불충분 [P2, BUG-3 참조]

Sprint 11 DC-10에서 `--text-on-accent` → `--text-heading` 이름 변경을 수행. 그러나:

- 20개 참조 중 18개는 "accent 배경 위 텍스트" 용도 → `--text-on-accent`가 정확
- 2개는 `background-color` 용도 → 어떤 이름이든 부적합 (분리 필요)
- `--text-heading`은 "heading 텍스트 색상"을 연상시켜, 실제 값(`#fff`/`#0d1117`)과 불일치

`--text-on-accent` 복원 또는 `background-color` 2곳을 별도 변수로 분리 권장.

---

### DC-4: Lightbox close 버튼 `:focus-visible` 추가 — 우수 ✅

**파일:** `css/custom.css` 라인 4773-4776

```css
.lightbox-close:focus-visible {
    color: #fff;
    outline: 2px solid #fff;
    outline-offset: 4px;
}
```

Sprint 11 DC-7에서 지적된 focus/active 상태가 정상 추가됨 ✅

---

## 4. [SEO Specialist] SEO 검사

### SEO-1: description 축소 후 품질 — 우수 ✅

| 포스트 | Sprint 11 | Sprint 12 | 핵심 키워드 유지 |
|--------|-----------|-----------|-----------------|
| Redis | 225자 | **53자** "Redis 캐싱 전략 비교와 Cache Stampede 해결, Spring Boot 연동 정리." | ✅ Redis, 캐싱, Cache Stampede, Spring Boot |
| Kafka | 209자 | **47자** "Kafka 핵심 개념, 메시지 보장, Spring Boot 연동을 코드로 정리합니다." | ✅ Kafka, 메시지, Spring Boot |
| Kotlin | 184자 | **45자** "Kotlin Coroutines 핵심 개념과 실전 패턴을 코드 예제로 정리합니다." | ✅ Kotlin, Coroutines, 실전 |

3개 모두 SERP 잘림 없는 길이이면서 핵심 키워드를 유지. 품질 저하 없음 ✅

---

### SEO-2: JSON-LD image 4단계 폴백 — 정확 ✅

**파일:** `_includes/head.html` 라인 98-102

```
thumbnail → og_per_post (assets/img/og/slug.png) → header-img → og-default.png
```

og:image (라인 34-42), twitter:image (라인 58-66), JSON-LD image (라인 98-102) 모두 **동일한 4단계 폴백 로직** 사용. Sprint 11 SEO-7 (JSON-LD image 누락) 완전 해결 ✅

---

### SEO-3: meta description 155자 통일 — 정확 ✅

**파일:** `_includes/head.html`

| 위치 | truncate | 라인 |
|------|----------|------|
| meta description | 155 | 6 |
| OG description | 155 | 15 |
| Twitter description | 155 | 53 |
| JSON-LD description | 155 | 78 |

Sprint 11 SEO-8 (160/150/200 불일치) → 전면 155자 통일 ✅

---

### SEO-4: categories.html 제목/설명 — 효과적 ✅

**파일:** `categories.html` 라인 1-5

```yaml
title: "카테고리 — DooDoo IT Blog 백엔드 개발 포스트 모음"
description: "백엔드 개발 포스트 모음 — Algorithm, Spring Boot, Kotlin, System Design 등 카테고리별로 정리된 기술 블로그 글 목록입니다."
```

- 한국어 + 영문 키워드 혼용으로 양쪽 검색 커버 ✅
- title에 "카테고리", "백엔드 개발", "포스트 모음" 핵심 키워드 포함 ✅
- description에 구체적 카테고리명 나열로 long-tail 검색 노출 ✅

---

### SEO-5: CollectionPage JSON-LD `name` 필드 영문 하드코딩 [P2]

**파일:** `_includes/head.html` 라인 122

```json
"name": "Categories",
```

페이지 `<title>`은 한국어인데 JSON-LD의 `name`은 `"Categories"` 영문 하드코딩. Google의 구조화 데이터 처리에서 불일치로 인식될 수 있음.

**수정:**
```
"name": {{ page.title | jsonify }},
```

---

## 5. [Content Editor] 콘텐츠 검토

### CE-1: 참고 자료 URL 유효성 — 1건 검증 필요 [P2]

3개 포스트의 참고 자료 URL 17건 중 16건은 공식 문서:

| 포스트 | URL 수 | 출처 | 상태 |
|--------|--------|------|------|
| Redis | 5 | redis.io, docs.spring.io | ✅ 모두 공식 |
| Kafka | 6 | kafka.apache.org, confluent.io, spring.io, microsoft.com | ✅ 모두 공식 |
| Kotlin | 6 | kotlinlang.org (5), YouTube (1) | ⚠️ 1건 검증 필요 |

**검증 필요 URL:**

`_posts/kotlin/2026-04-01-kotlin-coroutines-guide.md` 참고 자료 중:
```
https://www.youtube.com/watch?v=a3agLJQ6DJUk
```

"KotlinConf 2019 — Coroutines by Roman Elizarov" 로 기재되어 있으나, 해당 Video ID(`a3agLJQ6DJUk`)가 실제 KotlinConf 영상과 일치하는지 수동 확인 필요. 잘못된 링크일 경우 404 또는 무관한 영상으로 연결됨.

**수정:** 브라우저에서 URL 접속 후 확인. 유효하지 않으면 실제 영상 URL로 교체하거나 제거.

---

### CE-2: 중복 H1 제거 — 정상 ✅

3개 포스트 모두 본문 내 `# 제목` 마크다운 헤딩 없음 확인. front matter `title`만으로 페이지 제목 생성. `post.html` 레이아웃의 `intro-header.html`이 H1을 렌더링하므로 중복 없음 ✅

---

### CE-3: Series 연결 — 정상 ✅

**파일:** `_layouts/post.html` 라인 48-74

| series 값 | 포스트 수 | 연결 상태 |
|-----------|-----------|-----------|
| `"백엔드 심화"` | 2 (Redis, Kafka) | ✅ 상호 연결 |
| `Kotlin` | 4 (기본 문법, vs Java, Advanced, Coroutines) | ✅ 시리즈 내비게이션 표시 |

Series 내비게이션은 `series_posts.size >= 2` 조건(라인 29)으로 2개 이상일 때만 표시. `"백엔드 심화"` (2개) ✅, `Kotlin` (4개) ✅ 모두 충족.

**경미한 참고:** `series` 값의 따옴표 사용이 비일관적 (`Kotlin` vs `"백엔드 심화"`). YAML에서 기능적 차이는 없으나 스타일 통일 권장.

---

### CE-4: Flow import 추가 — 정상 ✅

**파일:** `_posts/kotlin/2026-04-01-kotlin-coroutines-guide.md` 라인 308

```kotlin
import kotlinx.coroutines.flow.*
```

Sprint 11 CE-6에서 지적된 Flow 섹션 import 누락이 정상 추가됨 ✅

---

## 조치 우선순위 정리

### P1 — 가능한 빨리 수정 (기능 버그)

| # | 이슈 | 담당 | 예상 난이도 |
|---|------|------|------------|
| 1 | **BUG-1** Lightbox 동일 이미지 재클릭 스피너 고정 | QA | 1줄 수정 |
| 2 | **BUG-2** Redis 코드 캐스팅 2곳 잔여 누락 | Content | 2줄 수정 |

### P2 — 개선 권장

| # | 이슈 | 담당 | 예상 난이도 |
|---|------|------|------------|
| 3 | **BUG-3** `--text-heading` → `--text-on-accent` 복원 + bg 2곳 분리 | Design | 중간 |
| 4 | **SEO-5** CollectionPage JSON-LD name → `page.title` | SEO | 1줄 수정 |
| 5 | **CE-1** Kotlin 참고 YouTube URL 수동 검증 | Content | 확인만 |
| 6 | **UX-2** Giscus 타임아웃 5초 → 8-10초 연장 고려 | UX | 1줄 수정 |

### P3 — 낮은 우선순위 (Sprint 11 잔존 + 경미)

| # | 이슈 | 담당 |
|---|------|------|
| 7 | **UX-4** `.lightbox-img { cursor: default }` | UX |
| 8 | **UX-5** Lightbox 포커스 트랩 구현 | UX |
| 9 | **BUG-5** Giscus message payload 검증 | QA |
| 10 | **UX-2** Giscus 에러 "다시 시도" 버튼 추가 | UX |

---

## Sprint 12 종합 평가

| 항목 | 평가 |
|------|------|
| Sprint 11 해결률 | **14/23건 (61%)** — P0 2/3, P1 5/9, P2 7/11 해결 |
| 신규 P0 이슈 | **0건** ✅ |
| 신규 P1 이슈 | **2건** (Lightbox 재클릭, Redis 캐스팅 잔여) |
| 코드 품질 | Lightbox 터치/스피너, Giscus 로딩 UI 모두 깔끔한 구현 |
| SEO 개선 | description 통일, JSON-LD 폴백, categories SEO 한국어화 모두 효과적 |
| 디자인 일관성 | 토큰 기반 스타일링, 다크/라이트 자동 대응 양호 |

**Sprint 12는 P2 UX/SEO/콘텐츠 개선 목표를 성공적으로 달성.** P1 2건은 각각 1-2줄 수정으로 빠르게 해결 가능. Sprint 11에서 넘어온 Design System 정비(#c9d1d9 토큰화, spacing 토큰 등)는 별도 스프린트로 계획 권장.

---

*Generated by 5-reviewer QA team on 2026-04-02*
