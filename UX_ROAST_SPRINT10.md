# UX Roast — Sprint 10

**Roaster**: UX Roaster (No Mercy Mode)
**Date**: 2026-03-31
**Commits roasted**:
- `faef617` categories page + remove pagination + color tokens
- `d757469` remove hover preview + lightbox + internal links

---

## 1. Categories Page — Tags와 다른가?

**Verdict: 🔴 거의 동일한 페이지를 두 개 만들었다**

| | Tags | Categories |
|---|---|---|
| Data source | `site.tags` (frontmatter) | `site.categories` (folder structure) |
| Examples | Algorithm, Tree, PostgreSQL, Backend | algo, db, infra, kotlin |
| Post count | 10 | 10 (same posts, different grouping) |
| Layout | pill cloud → grouped posts | pill cloud → grouped posts |
| CSS classes | `tags-*` 재사용 | `tags-*` 재사용 |

**문제점**:
- Categories는 폴더 구조 기반이라 `algo`, `db` 같은 slug가 그대로 노출 → display name mapping을 하드코딩해야 함
- 그 mapping이 `categories.html` 안에서 **두 번 중복** (line 34-43, line 58-67) — DRY 위반
- Tags는 frontmatter에서 이미 깔끔한 이름(`Algorithm`, `Database`)을 사용
- Nav에 Tags와 Categories 둘 다 노출 → 10개 포스트 블로그에 **6개 nav link** (Home, About, Archive, Categories, Projects, Tags)
- 사용자 입장: "Tags랑 Categories 뭐가 다른 거지?" → 혼란

**Fix applied**: `categories.html`에 `hide-in-nav: true` 추가. 페이지는 유지하되 nav에서 제거. 10개 포스트에 두 가지 taxonomy nav는 과잉.

**Sprint 11 suggestion**: Categories 페이지를 삭제하고 Tags로 통합하거나, Tags를 broad topic (현재 categories)으로, Tags 페이지에서 세부 태그를 보여주는 hierarchy를 만들 것.

---

## 2. 페이지네이션 제거 — 포스트 늘어날 때 대비됐나?

**Verdict: 🟡 현재는 OK, 미래는 위험**

현재 상태:
- 10개 포스트 → pagination 불필요. 맞는 판단
- `site.posts` 전체를 렌더링 → 10개면 문제 없음
- Category filter bar로 클라이언트 사이드 필터링 → 괜찮음

**하지만**:
- 30개 이상이 되면 ALL post cards가 한 번에 렌더링
- 각 카드에 thumbnail, excerpt, read time 계산 포함 → DOM이 무거워짐
- 모바일에서 특히 스크롤 피로도 증가
- "Load More" 버튼이나 virtual scrolling 없음

**No fix needed now**. 20개 넘으면 "Show More" 패턴 도입 필요.

---

## 3. Lightbox — 개발 블로그에서 이미지 확대가 필요한가?

**Verdict: 🟢 합리적인 추가, 구현도 깔끔**

실제 사용 시나리오:
- DB 인덱스 포스트의 B-Tree 다이어그램
- System Design 포스트의 아키텍처 도식
- 알고리즘 포스트의 트리 시각화

구현 품질:
- ✅ Vanilla JS, 외부 의존성 없음
- ✅ ESC 키 + overlay 클릭으로 닫기
- ✅ `aria-modal`, `aria-label` 접근성 기본 충족
- ✅ `cursor: zoom-in` 시각적 힌트
- ❌ Pinch-to-zoom 미지원 (mobile)
- ❌ 여러 이미지 간 swipe 미지원
- ❌ `body.style.overflow = 'hidden'` 직접 조작 → scroll position 초기화 가능성

**No fix needed**. 현재 규모에서 적절. Mobile pinch-to-zoom은 Sprint 11에서 고려.

---

## 4. Related Posts — 독자 유지에 도움되나?

**Verdict: 🟡 로직은 좋으나 10개 포스트에서는 효과 미미**

개선된 로직:
```
1순위: same series posts
2순위: same tag posts
3순위: fallback to any other post
Max: 3 posts
```

**좋은 점**:
- Series 우선순위 → 연속 학습 유도 (ex: Algorithm 시리즈)
- `seen` 배열로 중복 방지

**문제점**:
- 10개 포스트에서 related posts는 거의 **항상 같은 3개**가 나옴
- O(n²) Liquid 루프 — 현재는 무의미하지만 100+ 포스트에서 빌드 시간 증가
- `rp-tag`이 `post.tags | first`를 보여주고, `rp-category`가 `post.tags | join: ", "`를 보여줌 → **같은 정보를 두 번 표시**

**Fix applied**: Related post card에서 중복된 tag 표시 제거 — `rp-tag`(첫 번째 태그)만 남기고 `rp-category`(전체 태그 나열)를 날짜로 대체.

---

## 5. Sprint 10 전체 평가

### 점수: 6.5/10

**잘한 것**:
- Color tokens 도입 (`--text-muted`, `--border-light` 등) — 디자인 시스템의 기초
- Hover preview 제거 — 모바일에서 broken이었으니 올바른 판단
- Lightbox — 깔끔한 vanilla 구현
- Pagination 제거 — 현재 규모에서 불필요한 복잡성 제거

**아쉬운 것**:
- Categories 페이지가 Tags의 사실상 복제본
- Nav 항목 과잉 (6개 for 10 posts)
- `categories.html` 내부 display name mapping 중복
- 확장성 준비 부족 (pagination 제거 후 대안 없음)

### Sprint 11 제안

| Priority | Task | Why |
|---|---|---|
| P0 | Categories 페이지 삭제 또는 Tags와 통합 | 중복 페이지는 사용자 혼란 유발 |
| P1 | "Load More" 패턴 (20+ posts 대비) | Pagination 제거의 후속 조치 |
| P1 | Lightbox mobile pinch-to-zoom | 모바일 UX 완성 |
| P2 | Related Posts에 "이 시리즈의 다음 글" CTA 추가 | 시리즈 완독률 향상 |
| P2 | Nav 항목 정리 (Archive + Tags 통합 검토) | 10개 포스트에 nav 5개는 과잉 |

---

## Fixes Applied in This Sprint

1. **`categories.html`**: `hide-in-nav: true` 추가 — nav에서 제거하여 Tags와의 중복 혼란 방지
2. **`_layouts/post.html`**: Related post card에서 중복 tag/category 표시 정리
