# QA Report — Sprint 13

**Date**: 2026-04-02
**Reviewer**: 5-Person QA Team (AI-Assisted)
**Scope**: Design System tokens, Lightbox focus trap, Giscus validation, Lighthouse optimization, 3 new posts

---

## 1. [QA] Functional Bug Review

### 1-1. `--text-base` Token Definition & References

| Item | Status |
|------|--------|
| `:root` definition | `--text-base: #c9d1d9` (line 27) |
| `[data-theme="dark"]` definition | `--text-base: #c9d1d9` (line 59) |
| Total `var(--text-base)` references | **22 occurrences** |
| References inside `[data-theme="dark"]` selectors | 21/22 |
| References on dark-background components | 1/22 (`.error-terminal-body`, line 840) |

**Result: PASS (P2 design smell noted)**

All 22 usages of `var(--text-base)` are within dark-mode selectors or dark-background components. No rendering bug occurs. However, `:root`(light mode)에서도 `--text-base`가 `#c9d1d9`(연한 회색)로 정의되어 있어, 향후 light-mode context에서 실수로 사용하면 흰 배경에 거의 보이지 않는 텍스트가 될 위험이 있다.

> **P2 권장**: `:root`의 `--text-base` 값을 `#333` 등 dark text로 변경하거나, 라이트 모드 전용 값 분리 검토

### 1-2. Spacing / Border-Radius Tokens

| Token Type | Defined | Usages |
|-----------|---------|--------|
| `--space-1` ~ `--space-8` | 6 tokens (line 29-35) | 12 references |
| `--radius-sm` ~ `--radius-xl` | 4 tokens (line 38-41) | 16 references |

**Result: PASS**

- 토큰 정의 정상, `var()` 참조 모두 매칭됨
- 주요 컴포넌트에 적용 확인: `.post-card`(radius-lg), `.post-container pre`(radius-md), `.series-nav`(radius-lg), `.search-tag`(radius-xl)
- 일부 컴포넌트는 아직 하드코딩된 px 값 사용 (e.g., `.category-btn`: `border-radius: 20px`)
- **P3 참고**: 토큰 마이그레이션 미완 컴포넌트 잔존 (기능 버그 아님)

### 1-3. Lightbox Focus Trap (`_layouts/post.html:279-301`)

| Test Case | Result |
|-----------|--------|
| Tab 순환: last → first | PASS (line 297-299) |
| Shift+Tab 역순환: first → last | PASS (line 292-294) |
| ESC 키로 닫기 | PASS (line 282-284) |
| 열 때 close 버튼에 포커스 | PASS (line 267) |
| 닫을 때 trigger 이미지로 포커스 복원 | PASS (line 239-241) |
| focusable 요소 0개 방어 | PASS (line 288) |
| focusable 셀렉터 범위 | `button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])` — 적절 |

**Result: PASS — 로직 오류 없음**

### 1-4. Giscus Payload Validation (`_includes/comments.html:39-43`)

```javascript
if (e.origin !== 'https://giscus.app' || loaded) return;
if (!e.data || typeof e.data !== 'object' || !e.data.giscus) return;
if (e.data.giscus.error) return;
```

| Validation Layer | Check |
|-----------------|-------|
| Origin 검증 | `e.origin !== 'https://giscus.app'` — PASS |
| null/undefined 방어 | `!e.data` — PASS |
| 타입 검증 | `typeof e.data !== 'object'` — PASS |
| giscus 프로퍼티 존재 | `!e.data.giscus` — PASS |
| error response 처리 | `e.data.giscus.error` → 무시하여 timeout fallback으로 에러 UI 표시 — PASS |
| 중복 처리 방지 | `loaded` flag — PASS |
| Timeout fallback | 9000ms 후 에러 UI 표시 — PASS |

**Result: PASS — 5중 검증 로직 정상**

### 1-5. `head.html` Preload/Defer Syntax

| Item | Code | Status |
|------|------|--------|
| Google Fonts preload | `<link rel="preload" ... as="style">` (line 176) | PASS |
| Google Fonts stylesheet | `<link rel="stylesheet" ...>` (line 177) | PASS |
| Font Awesome defer | `<script ... defer></script>` (line 226) | PASS |
| dns-prefetch (6 domains) | lines 165-170 | PASS |
| preconnect (3 domains) | lines 171-173 | PASS |
| `display=swap` on fonts | Included | PASS |
| Critical CSS inline | lines 195-211 | PASS |

**Result: PASS — 문법 오류 없음, 순서 정상**

### 1-6. New Posts Front Matter

| Field | JPA N+1 | Spring Security | DB Transaction |
|-------|---------|----------------|---------------|
| title | O | O | O |
| subtitle | O | O | O |
| layout | `post` | `post` | `post` |
| date | `2026-04-04` | `2026-04-05` | `2026-04-06` |
| author | `DooDoo` | `DooDoo` | `DooDoo` |
| header-style | `text` | `text` | `text` |
| header-bg-css | O | O | O |
| catalog | `true` | `true` | `true` |
| keywords | O (5개) | O (6개) | O (5개) |
| description | O (79자+) | O (85자+) | O (80자+) |
| series | `백엔드 심화` | `백엔드 심화` | `백엔드 심화` |
| tags | 5개 | 6개 | 5개 |
| categories | O | O | O |

**Result: PASS — 누락 필드 없음, 3개 포스트 모두 동일 구조**

---

## 2. [UX Roast] UX Review

### 2-1. Focus Trap 자연스러움

- **열기**: overlay 활성화 → close 버튼에 즉시 포커스 이동 → 스크린 리더 사용자 즉시 인지 가능
- **순환**: Tab 마지막 요소 → 첫 요소로 자연스럽게 순환, Shift+Tab도 역순환
- **닫기**: ESC 또는 backdrop 클릭 → 원래 이미지로 포커스 복원 → 컨텍스트 유지
- **터치**: swipe-down 80px 이상 시 닫기 → 모바일 사용자 친화적

**Result: PASS — WCAG 2.1 dialog pattern 준수**

### 2-2. Lighthouse 최적화 영향

- `preload` + `display=swap` → FOIT(Flash of Invisible Text) 방지, 폰트 로딩 중에도 fallback 폰트 표시
- `defer` on Font Awesome → 렌더링 차단 없이 아이콘 비동기 로드
- Critical CSS inline → FCP 개선, 초기 렌더링에 필요한 스타일 즉시 적용
- dark mode flash prevention script (line 222) → 깜빡임 없이 테마 적용

**Result: PASS — UX 저하 없음, 체감 로딩 속도 개선 기대**

---

## 3. [Design Critic] Design Review

### 3-1. Transition 교체 결과

`transition: all` → 구체적 속성으로 **100% 교체 완료**. `custom.css` 전체에서 `transition: all` 0건 확인.

대표 교체 예시:

| Component | Transition |
|-----------|-----------|
| `.category-btn` | `color 0.2s, background-color 0.2s, border-color 0.2s, box-shadow 0.2s` |
| `.post-card` | `transform 0.25s ease, box-shadow 0.25s ease` |
| `#back-to-top` | `opacity 0.3s ease, visibility 0.3s ease, background-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease` |
| `.copy-btn` | `opacity 0.2s, background 0.2s` |

- 의도하지 않은 속성(width, height, padding 등)의 애니메이션이 제거됨
- GPU 가속 대상만 animate → 성능 개선
- 각 컴포넌트별 timing이 0.15s~0.3s로 자연스러운 범위

**Result: PASS — 시각적 어색함 없음, 성능 개선**

### 3-2. Spacing/Radius Token 시각적 일관성

| Token | Value | 적용 컴포넌트 |
|-------|-------|-------------|
| `--radius-sm` | 4px | (미사용 확인 — 향후 소형 요소용) |
| `--radius-md` | 8px | code blocks, search tags, mobile nav |
| `--radius-lg` | 12px | post-card, series-nav, project sections |
| `--radius-xl` | 16px | pill tags, search tags |
| `--space-4` | 16px | search input, mobile share padding |
| `--space-6` | 24px | series-nav, sections padding |

- 카드 계열 12px, 인라인 요소 8px, 필 요소 16px — 시각 위계 일관성 있음
- spacing도 4px grid 기반 (`4, 8, 12, 16, 24, 32`)으로 깔끔

**Result: PASS**

---

## 4. [SEO Specialist] SEO Review

### 4-1. Description / Keywords Quality

| Post | Description Length | Keywords | Quality |
|------|-------------------|----------|---------|
| JPA N+1 | 79자 — "JPA N+1 문제의 발생 원인을 이해하고...정리합니다" | `jpa, spring, hibernate, performance, backend` | GOOD — 핵심 키워드 포함, 행동 유도 |
| Spring Security | 85자 — "필터 체인 구조, 인증/인가...정리합니다" | `spring, security, authentication, authorization, jwt, backend` | GOOD — 기술 키워드 풍부 |
| Transaction | 80자 — "ACID 특성, 격리 수준...정리합니다" | `database, transaction, isolation, postgresql, backend` | GOOD — DB 특화 키워드 |

- 모든 description이 `meta name="description"`에 반영됨 (head.html line 6)
- Open Graph / Twitter Card에도 동일 description 전달 확인
- JSON-LD structured data에 description 포함 확인

**Result: PASS**

### 4-2. `head.html` 순서 적절성

```
1. meta charset/viewport/description/keywords  → 필수 메타 우선
2. Open Graph / Twitter Card                    → 소셜 공유 메타
3. title                                        → 페이지 제목
4. JSON-LD structured data                      → 검색엔진 리치 결과
5. dns-prefetch → preconnect                    → 리소스 힌트 (정순서)
6. Google Fonts preload → stylesheet            → 폰트 최적화
7. manifest / apple-touch-icon / favicon        → PWA/앱
8. canonical URL                                → 중복 방지
9. Critical CSS inline                          → FCP 최적화
10. CSS files                                   → 스타일시트
11. Dark mode prevention script                 → 렌더링 전 실행
12. Font Awesome (defer)                        → 비동기 아이콘
```

- `dns-prefetch` → `preconnect` 순서: CORRECT (best practice)
- `preload` → `stylesheet` 순서: CORRECT
- Critical CSS가 외부 CSS 전에 위치: CORRECT

**Result: PASS — SEO 최적 순서**

---

## 5. [Content Editor] Content Review

### 5-1. Code Examples Accuracy

#### JPA N+1 문제 완전 정복
| Section | Code | Verdict |
|---------|------|---------|
| Entity 정의 (`Team`, `Member`) | `@OneToMany(mappedBy)`, `@ManyToOne @JoinColumn` | CORRECT |
| N+1 발생 예시 | `findAll()` + loop access | CORRECT |
| EAGER로도 JPQL N+1 발생 | `@Query` + `EAGER` 조합 | CORRECT — 흔한 오해 잘 짚음 |
| Fetch Join | `JOIN FETCH` + `DISTINCT` | CORRECT |
| 페이징 제한 | 1:N fetch join + paging 경고 | CORRECT (`HHH90003004`) |
| `@EntityGraph` | `attributePaths`, Named EntityGraph | CORRECT |
| Batch Size | `@BatchSize(size=100)`, `default_batch_fetch_size` | CORRECT |
| QueryDSL | `leftJoin().fetchJoin().distinct()` | CORRECT |
| DTO Projection | `Projections.constructor` | CORRECT |

#### Spring Security Architecture
| Section | Code | Verdict |
|---------|------|---------|
| SecurityFilterChain Bean 등록 | Lambda DSL (6.x 스타일) | CORRECT |
| 다중 FilterChain `@Order` | `/api/**` vs `/**` 분리 | CORRECT |
| SecurityContextHolder / Authentication | ThreadLocal, 인터페이스 구조 | CORRECT |
| CustomUserDetails / UserDetailsService | `implements UserDetails`, `loadUserByUsername` | CORRECT |
| JWT 구현 | `Jwts.builder()`, `parseSignedClaims()` (jjwt 0.12.x) | CORRECT |
| JwtAuthenticationFilter | `OncePerRequestFilter`, `resolveToken` | CORRECT |
| Method Security | `@PreAuthorize` SpEL, `@PostAuthorize` | CORRECT |
| CSRF/CORS 설정 | `CookieCsrfTokenRepository`, `CorsConfiguration` | CORRECT |

#### DB Transaction Isolation
| Section | Code | Verdict |
|---------|------|---------|
| ACID SQL 예시 | `BEGIN/UPDATE/COMMIT` | CORRECT |
| Dirty/Non-Repeatable/Phantom Read 시나리오 | TX1/TX2 시퀀스 다이어그램 | CORRECT |
| 격리 수준 4단계 비교표 | O/X 매트릭스 | CORRECT |
| PostgreSQL MVCC 특이점 | READ UNCOMMITTED → READ COMMITTED 동작 | CORRECT |
| PostgreSQL REPEATABLE READ 충돌 감지 | concurrent update error | CORRECT |
| SSI (Serializable Snapshot Isolation) | rw-dependency 추적 | CORRECT |
| Spring `@Transactional` propagation | 7가지 전파 속성 표 | CORRECT |
| 프록시 기반 내부 호출 주의 | `this.inner()` 문제 | CORRECT |
| 비관적/낙관적 락 | `@Lock(PESSIMISTIC_WRITE)`, `@Version` | CORRECT |
| `@Retryable` 재시도 패턴 | spring-retry + `@EnableRetry` | CORRECT |

**Result: PASS — 코드 예제 모두 기술적으로 정확**

### 5-2. Technical Accuracy

- **JPA N+1**: Hibernate 6(Boot 3.x) 자동 DISTINCT 언급 — 정확
- **Spring Security**: Lambda DSL이 Spring Security 6.x 기본 — 정확. `WebSecurityConfigurerAdapter` deprecated 언급 없이 현대 방식만 사용 — 적절
- **Transaction**: PostgreSQL이 READ UNCOMMITTED를 READ COMMITTED로 처리한다는 점 — 정확 (공식 문서 일치)

**Result: PASS**

### 5-3. References

| Post | 참고 자료 | Status |
|------|----------|--------|
| JPA N+1 | 김영한 JPA 강의 언급 (line 301) | 간접 참조 O |
| Spring Security | 공식 문서 기반 설명 | 명시적 링크 없음 |
| Transaction | PostgreSQL 공식 동작 기반 설명 | 명시적 링크 없음 |

**P3 권장**: 각 포스트 하단에 "참고 자료" 섹션 추가 검토 (공식 문서, 관련 서적 링크)

---

## Summary

| Category | Items | PASS | FAIL | P2 | P3 |
|----------|-------|------|------|-----|-----|
| Functional Bug | 6 | 6 | 0 | 1 | 0 |
| UX Review | 2 | 2 | 0 | 0 | 0 |
| Design Review | 2 | 2 | 0 | 0 | 0 |
| SEO Review | 2 | 2 | 0 | 0 | 0 |
| Content Review | 3 | 3 | 0 | 0 | 1 |
| **Total** | **15** | **15** | **0** | **1** | **1** |

### Open Items

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| S13-QA-01 | **P2** | `:root`의 `--text-base: #c9d1d9`가 light mode에서 위험 (현재 실제 사용처는 모두 dark context) | light mode 값을 `#333` 또는 `var(--text-primary)`로 변경 |
| S13-QA-02 | **P3** | spacing/radius 토큰 마이그레이션 미완 (`.category-btn` 등 하드코딩 잔존) | 다음 sprint에서 나머지 컴포넌트 토큰화 |
| S13-QA-03 | **P3** | 신규 포스트 3개에 명시적 참고 자료 링크 없음 | "참고 자료" 섹션 추가 검토 |

### Verdict: **Sprint 13 — PASS (ship-ready)**

P0/P1 이슈 0건. P2 1건은 현재 실제 렌더링 문제 없으므로 다음 sprint에서 수정 가능.
