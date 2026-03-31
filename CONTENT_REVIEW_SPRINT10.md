# Content Review — Sprint 10

**Reviewer**: Content Editor (Claude)
**Date**: 2026-03-31
**Commits reviewed**:
- `faef617`: categories page + remove pagination + color tokens
- `d757469`: remove hover preview + lightbox + internal links

---

## 1. Categories Page — 카테고리명 표기 검토

| Folder slug | Display name | Verdict |
|-------------|-------------|---------|
| algo | Algorithm | OK |
| db | Database | OK |
| infra | Infrastructure | OK |
| kotlin | Kotlin | OK |
| react | React | OK |
| spring | Spring | OK |
| system-design | System Design | OK |

**결론**: 모든 카테고리에 명확한 display name 매핑이 있고, fallback (`capitalize`)도 작동함. 문제 없음.

---

## 2. Related Posts — 관련성 검토

Related Posts 로직: series 우선 → tag 매칭 → fallback (전체 포스트).

| Post | Related posts shown | 관련성 |
|------|-------------------|--------|
| Segment tree | Floyd Warshall, MST (series: Algorithm) | **높음** — 동일 시리즈 |
| Floyd Warshall | Segment tree, MST (series: Algorithm) | **높음** — 동일 시리즈 |
| MST | Segment tree, Floyd Warshall (series: Algorithm) | **높음** — 동일 시리즈 |
| Kotlin 기본 문법 | Kotlin vs Java (series: Kotlin) | **높음** — 동일 시리즈 |
| Kotlin vs Java | Kotlin 기본 문법 (series), Spring Boot (Java tag) | **적절** |
| Spring Boot + JPA | Docker, PostgreSQL, Caching (Backend tag) | **적절** — 모두 백엔드 주제 |
| Docker 입문 | Spring Boot, PostgreSQL, Caching (Backend tag) | **적절** |
| PostgreSQL 인덱스 | Spring Boot, Docker, Caching (Backend tag) | **적절** |
| Caching 전략 | Spring Boot, Docker, PostgreSQL (Backend tag) | **적절** |
| React in Jekyll | Caching, PostgreSQL, Docker (fallback) | **낮음** — React 포스트가 1개뿐이라 fallback 동작. 콘텐츠 부족이 원인. |

**결론**: React 포스트를 제외하면 모두 적절한 관련 포스트가 표시됨. React 관련 콘텐츠가 추가되면 자연히 해결됨.

---

## 3. 기존 포스트 재검토 — Sprint 9에서 놓친 오류

### FIXED

| Post | Issue | Fix |
|------|-------|-----|
| React in Jekyll (line 15) | "Create **reat** app" 오타 | → "Create **react** app" |
| Kotlin vs Java (subtitle) | 끝에 불필요한 공백 (`"...Java "`) | → 공백 제거 |

### FLAGGED (not fixed — URL/structure change required)

| Post | Issue | Note |
|------|-------|------|
| MST | 파일명 오타: `minimun-spanning-tree` → `minimum-spanning-tree` | URL이 변경되므로 redirect 설정과 함께 별도 처리 권장 |

---

## 4. 새 포스트 4개 — 카테고리 분류 검토

| Post | Folder (category) | Tags | Series | Verdict |
|------|-------------------|------|--------|---------|
| Spring Boot + JPA | spring | Spring, Backend, Java | Spring | OK |
| Docker 입문 | infra | Docker, DevOps, Backend | Infra | OK |
| PostgreSQL 인덱스 | db | PostgreSQL, Database, Backend | Database | OK |
| 캐싱 전략 | system-design | ~~SystemDesign~~→System Design, Backend, Redis | System Design | **FIXED** |

### FIXED

| Post | Issue | Fix |
|------|-------|-----|
| Caching 전략 | Tag `SystemDesign` (CamelCase, 공백 없음) — 카테고리 페이지와 Related Posts에서 "SystemDesign"으로 표시됨 | → `System Design` (공백 포함)으로 수정 |

---

## Summary

| Category | Count |
|----------|-------|
| Issues fixed | 3 |
| Issues flagged | 1 |
| Posts reviewed | 10 |
| Category mappings verified | 7 |
| Related posts accuracy | 9/10 적절 (React fallback 제외) |
