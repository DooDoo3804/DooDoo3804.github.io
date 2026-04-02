# Sprint 11 QA 리포트

> 검토일: 2026-04-02 | 검토 대상: commit `e3e561d` ~ `3777f48`
> 5인 리뷰팀: QA Engineer, UX Reviewer, Design Critic, SEO Specialist, Content Editor

---

## 전체 요약

| 심각도 | 건수 | 핵심 항목 |
|--------|------|-----------|
| **Critical** | 6 | Giscus 플레이스홀더, Redis/Kafka 중복 포스트, 카드 접근성, Lightbox 접근성 |
| **Major** | 17 | backend 카테고리 미등록, 하드코딩 색상 토큰화 실패, feed.xml CDATA, 코드 예제 오류 등 |
| **Minor** | 30+ | 미사용 토큰, 네이밍 불일치, 모바일 세부사항, font/spacing 일관성 등 |

**즉시 수정 필요 TOP 5:**
1. `_config.yml` Giscus `repo_id`/`category_id` 플레이스홀더 상태 → 댓글 시스템 전혀 작동 안 함
2. Redis/Kafka 포스트 중복 (루트 `_posts/` vs 하위 디렉토리) → SEO duplicate content 이슈
3. `backend` 카테고리가 `categories.html`/`custom.css`에 미등록
4. `#c9d1d9` 23회 하드코딩 → 토큰화 필요
5. 카테고리 카드/Lightbox 닫기 버튼 키보드 접근성 전무

---

## 1. [QA] 기능 버그 검사

### BUG-1: Giscus repo_id, category_id 플레이스홀더 [Critical]

**파일:** `_config.yml` 라인 99, 101

```yaml
repo_id: "REPLACE_WITH_REPO_ID"
category_id: "REPLACE_WITH_CATEGORY_ID"
```

`_includes/comments.html` 라인 12, 14에서 이 값을 그대로 Giscus 스크립트에 주입한다. GitHub Discussions API 인증에 실패하여 댓글 위젯이 전혀 표시되지 않는다.

**수정:** https://giscus.app 에서 실제 repo_id, category_id 생성 후 교체.

---

### BUG-2: feed.xml CDATA 잠재적 파싱 오류 [Major]

**파일:** `feed.xml` 라인 20

```xml
<content:encoded><![CDATA[{{ post.content }}]]></content:encoded>
```

`post.content`에 `]]>` 문자열이 포함되면 CDATA 섹션이 조기 종료되어 XML 파싱이 깨진다.

**수정:** `{{ post.content | xml_escape }}` 사용 또는 CDATA 내에서 `]]>`를 `]]]]><![CDATA[>`로 치환.

---

### BUG-3: `backend` 카테고리 시스템 미등록 [Major]

**파일:** `_posts/2026-04-02-redis-caching-strategy.md`, `_posts/2026-04-03-kafka-introduction.md`

```yaml
categories:
  - backend
```

`categories.html`의 `{% case cat_name %}` 맵핑(라인 40~77)에 `backend`가 없다. 등록된 카테고리: `algo`, `cs`, `db`, `infra`, `kotlin`, `react`, `spring`, `system-design`. `else` 분기를 타서 기본 아이콘(폴더)과 빈 설명으로 표시되며, `css/custom.css`에도 `.cat-card--backend`/`.cat-group--backend` 스타일이 없어 accent bar가 기본값.

**수정:**
1. `categories.html`에 `{% when 'backend' %}` 케이스 추가, 또는
2. 기존 카테고리(`spring`, `system-design`, `db`)로 변경

---

### BUG-4: 신규 포스트 `header-mask` 필드 누락 [Minor]

기존 포스트 패턴에는 `header-mask: 0.4`가 있으나 신규 3개 포스트에는 누락. `header-style: text` 사용 시 영향 범위 확인 필요.

---

### BUG-5: Lightbox 닫기 버튼 키보드 접근성 누락 [Minor]

**파일:** `_layouts/post.html` 라인 218

```html
<span class="lightbox-close" aria-label="Close">&times;</span>
```

`<span>`은 포커스 불가. `role="button"`, `tabindex="0"` 없음. ESC 키 핸들러(라인 252-256)는 있으나 스크린 리더 사용자가 버튼을 포커스하여 Enter로 닫을 수 없다.

**수정:** `<button class="lightbox-close" aria-label="Close">&times;</button>`

---

### BUG-6: Lightbox 내 이미지에 잘못된 cursor 스타일 [Minor]

**파일:** `css/custom.css` 라인 4712, 4722

`.lightbox-overlay { cursor: pointer }` 가 `.lightbox-img`에도 상속됨. 이미지 클릭 시 아무 동작 없음(`e.target !== lbImg` 체크)에도 pointer cursor 표시.

**수정:** `.lightbox-img { cursor: default; }` 추가.

---

### BUG-7~9: 미사용/중복 CSS 변수 [Minor]

| 변수 | 위치 | 상태 |
|------|------|------|
| `--accent-rgb`, `--accent-rgb-light`, `--accent-rgb-dark` | 라인 11-12, 32-33 | 정의만 있고 `var()` 참조 없음. `--accent-color-raw`와 중복 |
| `--accent-secondary` | 라인 26, 45 | 정의만 있고 사용처 없음 |
| `--text-on-accent` | 라인 1255, 1586 | body 배경색으로 사용 — 이름과 용도 불일치 |

---

## 2. [UX Roast] UX 문제 지적

### UX-1: 카테고리 카드가 `<div>` — 키보드/스크린리더 접근 불가 [Critical]

**파일:** `categories.html` 라인 78

```html
<div class="cat-card cat-card--{{ cat_name }}" data-target="#cat-{{ cat_name | slugify }}">
```

`cursor: pointer` 스타일과 JS 클릭 이벤트가 있지만, `<div>`라서 Tab 키로 포커스 불가, 스크린 리더 인식 불가. CSS의 `.cat-card:focus` 스타일(라인 2209)은 죽은 코드.

**수정:** `<button>` 또는 `<a>`로 변경, 최소한 `tabindex="0"` + `role="button"` + `aria-label` + Enter/Space 키보드 이벤트 처리 추가.

---

### UX-2: 카드 클릭 동선 혼란 — 스크롤 vs 링크 이동 구분 불명확 [Major]

**파일:** `categories.html` 라인 91-96, 153

카드 전체 `cursor: pointer`로 "어딘가로 이동"할 것 같지만, 실제로는 같은 페이지 내 스크롤. 카드 안에 포스트 링크도 있어 인터랙션 모델이 불명확.

**수정:** "See all N posts ↓" 같은 명시적 CTA 추가로 스크롤 동작임을 시각적으로 표현.

---

### UX-3: Lightbox 모바일 터치 지원 전무 [Critical]

**파일:** `_layouts/post.html` 라인 222-258

- 핀치 줌 불가
- 스와이프 닫기 불가
- 닫기 버튼 36px — 모바일 터치 타겟 최소 44x44px 미달
- `top: 20px; right: 24px` — 모바일 노치/상태바 영역 겹침 가능

**수정:** 터치 타겟 44px 이상 확대, `safe-area-inset-top` 적용, 스와이프 닫기 구현.

---

### UX-4: `color-mix()` CSS 함수 브라우저 호환성 [Major]

**파일:** `css/custom.css` 라인 2225, 2231, 2259, 2266

```css
background: color-mix(in srgb, var(--cat-accent) 14%, transparent);
```

Safari 16.2+, Chrome 111+ 에서만 지원. 구형 브라우저에서 카테고리 카드 아이콘/뱃지 배경이 사라짐. fallback 없음.

**수정:** `color-mix()` 앞에 `background: rgba(...)` fallback 선언.

---

### UX-5: 카테고리 섹션에서 카드 그리드로 돌아가는 방법 없음 [Major]

**파일:** `categories.html` 라인 104-143

카드 클릭 → 포스트 목록 스크롤 → **다른 카테고리 보려면 긴 스크롤로 복귀 필요**. "Back to top" 버튼이나 sticky 내비게이션 없음.

**수정:** 각 카테고리 섹션에 "↑ Back to categories" 링크 추가.

---

### UX-6: Lightbox 포커스 트랩 없음 [Major]

**파일:** `_layouts/post.html` 라인 217-221

`role="dialog"` + `aria-modal="true"` 설정되어 있으나, 포커스를 dialog 안으로 이동/가두는 코드 없음. Tab 키로 뒤의 페이지 요소 순회 가능. 닫힌 후 원래 이미지로 포커스 미복원.

**수정:** open 시 close 버튼 focus, Tab 키 lightbox 내 가두기, 닫을 때 트리거 이미지로 focus 복원.

---

### UX-7: Lightbox/Giscus 로딩 상태 없음 [Major]

- Lightbox: 큰 이미지 클릭 시 로딩 중 빈 화면. 스피너/placeholder 없음
- Giscus: iframe 로드 중 빈 `<div>`. 실패 시 아무 피드백 없음. `<script>` onerror 미처리

**수정:** Lightbox에 `lbImg.onload` 콜백, Giscus에 "Loading comments..." placeholder + 타임아웃 에러 메시지.

---

### UX-8: 하이라이트 애니메이션 타이밍 불일치 [Minor]

**파일:** `categories.html` 라인 160-163

1.5초 후 하이라이트 제거 — 스무스 스크롤 완료 전에 시작되어 사라질 수 있음.

---

### UX-9: Giscus 컨테이너 스타일 전무 [Minor]

`css/custom.css` 전체에 `giscus` 관련 CSS가 0건. 포스트 본문 끝나고 갑자기 댓글 입력창 등장. 간격, 구분선, 제목 없음.

---

## 3. [Design Critic] 디자인 일관성 검사

### DC-1: `#c9d1d9` 23회 하드코딩 — 토큰화 실패 [Critical]

**파일:** `css/custom.css` 라인 827, 1256, 1267, 1316, 1360, 1381, 1404, 1473, 1496, 1569, 1579, 1875, 1891, 1930, 2930, 3251, 3822, 4003, 4189, 4303, 4433 등

다크 모드에서 범용 텍스트 색상으로 사용되지만 어떤 토큰에도 매핑되지 않음. `--text-primary`(다크)는 `#e6edf3`이고 `#c9d1d9`는 더 어두운 톤.

**수정:** `--text-base` 등 새 토큰 도입 후 23곳 교체, 또는 `var(--text-primary)` 통일.

---

### DC-2: `--accent-gradient` 다크 모드 미정의 [Major]

**파일:** `css/custom.css` 라인 9 (:root에서만 정의)

다크 모드에서 오버라이드가 없어 라이트 모드 색상 `#0085a1`이 그대로 적용됨.

**수정:** `[data-theme="dark"]` 블록에 `--accent-gradient: linear-gradient(135deg, #58a6ff, #b07fff)` 추가.

---

### DC-3: `#999` 16회 하드코딩 — 다크 모드 대비비 미충족 [Major]

**파일:** `css/custom.css` 라인 499, 720, 775, 1557, 1673, 1778, 2354, 2358, 2395, 2505, 3108, 3193, 3527, 3682, 4274, 4581

다크 배경(`#0d1117`) 위에 `#999` 텍스트 대비비 약 4.1:1 — WCAG AA 본문(4.5:1) 미충족.

**수정:** `var(--text-muted)` 또는 `var(--text-secondary)`로 교체하여 다크 모드 자동 대응.

---

### DC-4: `#555` 8회, `#777` 3회 하드코딩 — 유사 역할 색상 난립 [Major]

`--text-tertiary`(`#666`)와 `--text-muted`(`#6c757d`)가 있는데, `#555`, `#777`이 같은 역할로 혼재.

**수정:** `#555` → `var(--text-tertiary)`, `#777` → `var(--text-muted)` 통일.

---

### DC-5: 라이트 모드 배경/보더 하드코딩 난립 [Major]

`#f8f9fa`(2회), `#fafbfc`(2회), `#fafafa`(1회), `#f5f5f5`(2회), `#eee`(3회), `#e0e0e0`(4회), `#ddd`(1회) — 토큰 사용 안 함. 같은 요소의 다크 모드에서는 토큰을 쓰는 비대칭 패턴도 존재(예: `.series-nav` 라이트 `#f8f9fa` → 다크 `var(--bg-surface-raised)`).

**수정:** 기존 토큰으로 교체하거나 `--bg-subtle: #f8f9fa` (다크: `#161b22`) 토큰 추가.

---

### DC-6: 카테고리 악센트 색상 다크 모드 밝기 미조정 [Major]

**파일:** `css/custom.css` 라인 2188~2195

`#61dafb`(react), `#2ecc71`(algo) 등 라이트/다크 구분 없이 동일하게 적용. `.cat-card-count`에서 텍스트 색상으로 사용 시 흰 배경 대비비 부족(2.5~2.7:1).

**수정:** 다크 모드용 카테고리 악센트 색상 세트 별도 정의 또는 밝기 조정.

---

### DC-7: Lightbox close 버튼 focus/active 상태 미정의 [Major]

**파일:** `css/custom.css` 라인 4746~4758

`:hover`만 있고 `:focus-visible`, `:active` 없음. 어두운 오버레이 위에서 글로벌 accent outline이 잘 안 보일 수 있음.

**수정:** `.lightbox-close:focus-visible { color: #fff; outline: 2px solid #fff; outline-offset: 4px; }` 추가.

---

### DC-8: 호버 색상 `#006d85`/`#006b85` 미세 불일치 [Minor]

**파일:** 라인 464/907 (`#006d85`) vs 라인 4631 (`#006b85`) — 오타로 추정.

---

### DC-9: `--bg-surface`와 `--bg-surface-raised`가 라이트 모드에서 동일 (`#fff`) [Minor]

다크 모드에서는 `#0d1117` vs `#161b22`로 구분되지만 라이트에서 elevation 계층 무너짐.

**수정:** 라이트 `--bg-surface-raised`를 `#f8f9fa` 등으로 미세 구분.

---

### DC-10: `--heading-dark` 네이밍 부적절 [Minor]

다크 모드에서 밝은 색상(`#c9d1d9`)인데 이름이 "dark". 다른 토큰의 시맨틱 네이밍(`--text-primary` 등)과 불일치.

**수정:** `--heading-color` 또는 `--text-heading`으로 이름 변경.

---

### DC-11: Spacing, Font Size, Border-radius, Transition 일관성 [Minor]

| 항목 | 현황 |
|------|------|
| Spacing | `7px`, `9px` 등 4px 스케일 이탈 값 다수 |
| Font size | 25종 이상. `11.5px`, `12.5px`, `16.5px` 등 0.5px 일회성 값 |
| Border-radius | 14종 혼재. 카드에 `10px`/`12px`/`14px` 혼용 |
| Transition | `0.15s`~`0.4s` 혼재, `transition: all` 12회 남용 |

**수정:** spacing/font/radius/transition 토큰 도입 고려.

---

## 4. [SEO Specialist] SEO 검사

### SEO-1: Redis/Kafka 중복 포스트 — Duplicate Content [Critical]

| 주제 | 하위 디렉토리 버전 | 루트 버전 |
|------|-------------------|-----------|
| Redis | `_posts/db/2026-04-01-redis-cache-strategy.md` | `_posts/2026-04-02-redis-caching-strategy.md` |
| Kafka | `_posts/system-design/2026-04-01-message-queue-kafka.md` | `_posts/2026-04-03-kafka-introduction.md` |

동일 주제 유사 콘텐츠 2개씩 존재. Google이 둘 중 하나를 임의 선택하거나 둘 다 순위 하락시킬 수 있음.

**수정:** 한쪽 삭제 또는 canonical URL 명시.

---

### SEO-2: 모든 신규 포스트 description 길이 초과 [Medium-High]

| 포스트 | 현재 길이 | 권장 |
|--------|-----------|------|
| Kotlin Coroutines | 184자 | 70-80자(한국어) |
| Redis (루트) | 225자 | 70-80자(한국어) |
| Redis (db/) | 206자 | 70-80자(한국어) |
| Kafka (루트) | 209자 | 70-80자(한국어) |
| Kafka (system-design/) | 176자 | 70-80자(한국어) |

Google SERP에서 155-160자(영문 기준)에서 잘림. 한국어는 바이트 기준으로 더 짧아야 함.

---

### SEO-3: db/redis, system-design/kafka 포스트에 keywords 필드 누락 [Medium]

`head.html` 라인 7에서 `page.keywords`를 참조. 없으면 `site.keyword`로 폴백되어 포스트별 키워드 차별화 불가.

---

### SEO-4: categories.html에 H1 태그 부재 [High]

`<h3>`으로 시작. SEO에서 각 페이지는 하나의 H1 필수.

**수정:** `<h3 class="tags-section-title">` → `<h1>`, 하위 `<h4>` → `<h2>`. CSS로 시각적 크기 조정.

---

### SEO-5: categories.html description 영문 전용, title 너무 일반적 [Medium]

- description: 영문만 — 한국어 검색 CTR 저하
- title: `"Categories"` — 타겟 키워드 미포함

**수정:** `title: "카테고리 — 백엔드 개발 블로그 포스트 모음"`, description 한국어 추가.

---

### SEO-6: feed.xml XML 선언 앞 빈 줄 가능성 [High]

**파일:** `feed.xml` 라인 1-4

Jekyll front matter 처리 후 `<?xml?>` 선언 앞에 빈 줄이 삽입될 수 있음. XML 표준에 따르면 선언은 반드시 파일 첫 줄이어야 함.

**수정:** 빌드 결과물 검증. 필요시 front matter와 XML 선언 사이 줄바꿈 제거.

---

### SEO-7: JSON-LD image 필드 조건부 누락 [Medium]

**파일:** `_includes/head.html` 라인 98

`header-img`가 없는 포스트(신규 3개 포함)는 JSON-LD에 image 필드 아예 없음.

**수정:** og:image와 동일한 폴백 로직(og-default.png)을 JSON-LD에도 적용.

---

### SEO-8: meta description truncate 길이 불일치 [Low]

| 위치 | truncate |
|------|----------|
| meta description | 160자 |
| OG description | 150자 |
| JSON-LD description | 200자 |

**수정:** 모든 곳 155자로 통일.

---

### SEO-9: author 이름 비일관 [Medium]

루트 포스트: `"DooDoo"` / db/, system-design/ 하위 포스트: `"DoYoon Kim"`. JSON-LD structured data에서 author name 불일치.

---

## 5. [Content Editor] 콘텐츠 품질 검사

### CE-1: Redis/Kafka 포스트 중복 [Critical]

| 주제 | Sprint 11 (루트) | 이전 커밋 (하위 디렉토리) | 비교 |
|------|-----------------|-------------------------|------|
| Redis | 583행, 상세 | 344행, 간결 | Sprint 11이 더 완성도 높음 |
| Kafka | 663행, 이벤트 소싱/CQRS 섹션 포함 | 400행, 기본 내용 | Sprint 11이 더 포괄적 |

두 버전 모두 게시되면 독자에게 혼란. 카테고리도 불일치(루트: `backend`, 하위: `db`/`system-design`).

**수정:** 기존 하위 디렉토리 버전을 삭제/리다이렉트하고 Sprint 11 버전으로 통합.

---

### CE-2: Redis 포스트 코드 예제 타입 캐스팅 누락 [Major]

**파일:** `_posts/2026-04-02-redis-caching-strategy.md`

- 라인 48: `User cached = redisTemplate.opsForValue().get(cacheKey)` — `(User)` 캐스트 필요
- 라인 223: `CacheEntry<User> entry = redisTemplate.opsForValue().get(cacheKey)` — 동일 이슈

`RedisTemplate<String, Object>` 사용 시 반환값 캐스팅 없이 직접 할당 불가.

---

### CE-3: Kafka 포스트 `kafkaTemplate()` 빈 주입 오류 [Major]

**파일:** `_posts/2026-04-03-kafka-introduction.md` 라인 383

```java
new DeadLetterPublishingRecoverer(kafkaTemplate())
```

`kafkaTemplate()` 메서드가 해당 설정 클래스에 정의되어 있지 않음. 파라미터 주입 또는 필드 주입으로 변경 필요.

---

### CE-4: 인라인 제목 중복 (3개 포스트 공통) [Minor]

3개 포스트 모두 front matter `title`과 동일한 인라인 제목 + `---`가 본문에 있음. 페이지에서 제목이 2번 표시될 수 있음.

---

### CE-5: Kafka 포스트 boolean 타입 비일관성 [Minor]

**파일:** `_posts/2026-04-03-kafka-introduction.md`

- 라인 141: `ENABLE_AUTO_COMMIT_CONFIG` → `"false"` (문자열)
- 라인 232: `ENABLE_IDEMPOTENCE_CONFIG` → `"true"` (문자열)
- 다른 코드 블록에서는 boolean `true`/`false` 사용

**수정:** `"true"` → `true`, `"false"` → `false`로 통일.

---

### CE-6: Kotlin Flow 섹션 import 문 누락 [Minor]

**파일:** `_posts/kotlin/2026-04-01-kotlin-coroutines-guide.md` 라인 310

`kotlinx.coroutines.flow.*`는 별도 패키지. Flow 섹션(5.1) 도입부에 import 한 줄 추가 권장.

---

### CE-7: 참고 자료 섹션 부재 [Minor]

기존 포스트에는 외부 이미지/참고 링크/참고 문헌 섹션이 있었으나, Sprint 11 신규 3개 포스트에는 없음.

---

### 톤앤매너 비교

| 항목 | 기존 포스트 | Sprint 11 | 평가 |
|------|------------|-----------|------|
| 문체 | 존칭/평서 혼용 | 평서체 통일 | **개선** — 일관적이고 전문적 |
| 설명 깊이 | 얕음~중간 | 깊음 | **개선** — 기술 블로그로서 훨씬 유용 |
| 구조화 | 비체계적 | 번호+계층 체계적 | **개선** — 가독성 우수 |
| 길이 | 100~180행 | 500~663행 | 3~6배 증가 — 포괄적 |
| 참고 자료 | 있음 | 없음 | **후퇴** — 추가 권장 |
| 개성/비격식 표현 | 있음 (`~~취소선~~` 등) | 없음 | 기술 블로그로 적절하나 기존 개성 감소 (취향 영역) |

**전반적 평가:** Sprint 11 신규 포스트는 기존 대비 품질이 대폭 향상됨. 기술적 깊이, 코드 예제 실전성, 구조화 수준 모두 우수.

---

## 조치 우선순위 정리

### P0 — 즉시 수정 (서비스 장애/심각한 SEO 이슈)

| # | 이슈 | 담당 영역 |
|---|------|-----------|
| 1 | Giscus `repo_id`/`category_id` 플레이스홀더 교체 | QA |
| 2 | Redis/Kafka 중복 포스트 정리 (하위 디렉토리 버전 삭제 또는 통합) | SEO, Content |
| 3 | `backend` 카테고리를 categories.html/custom.css에 등록 또는 기존 카테고리로 변경 | QA |

### P1 — 가능한 빨리 수정 (접근성/디자인 시스템/코드 정확성)

| # | 이슈 | 담당 영역 |
|---|------|-----------|
| 4 | 카테고리 카드 키보드 접근성 (`tabindex`, `role`, 키보드 이벤트) | UX |
| 5 | Lightbox 닫기 버튼 `<button>` 교체 + 포커스 트랩 | UX |
| 6 | `#c9d1d9` 23회 → 토큰화 | Design |
| 7 | `#999`/`#555`/`#777`/`#f8f9fa` 등 → 기존 토큰 교체 | Design |
| 8 | `--accent-gradient` 다크 모드 정의 추가 | Design |
| 9 | 신규 포스트 description 길이 축소 | SEO |
| 10 | Redis 코드 예제 타입 캐스팅 수정 | Content |
| 11 | Kafka `kafkaTemplate()` 빈 주입 수정 | Content |
| 12 | `color-mix()` fallback 추가 | UX |
| 13 | categories.html H1 태그 추가 | SEO |

### P2 — 개선 권장 (품질 향상)

| # | 이슈 | 담당 영역 |
|---|------|-----------|
| 14 | Lightbox 모바일 터치 지원 (터치 타겟, safe-area) | UX |
| 15 | Giscus 로딩/에러 상태 UI | UX |
| 16 | feed.xml CDATA 안전성 + XML 선언 위치 | QA, SEO |
| 17 | 카테고리 악센트 다크 모드 최적화 | Design |
| 18 | JSON-LD image 폴백 | SEO |
| 19 | author/keywords/date 형식 통일 | SEO, Content |
| 20 | Lightbox 닫기 애니메이션, 이미지 로딩 상태 | UX |
| 21 | 미사용 토큰 정리 (`--accent-rgb*`, `--accent-secondary`) | Design |
| 22 | spacing/font/radius/transition 토큰 도입 | Design |
| 23 | 참고 자료 섹션 추가 | Content |

---

*Generated by 5-reviewer QA team on 2026-04-02*
