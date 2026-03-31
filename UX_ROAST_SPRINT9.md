# UX Roast: Sprint 9

**Date:** 2026-03-31
**Commits:** b365c44, 99483e9, 012b7b4
**Roaster:** UX Roaster (no mercy mode)

---

## 1. Blog Posts (4 example posts) — "읽을 만한가?"

### Verdict: 7.5/10 — 기술적으로 훌륭하지만, 독자의 심장을 때리진 못한다

**칭찬할 점:**
- Spring Boot + JPA, Docker, PostgreSQL Index, Caching Strategy — 토픽 선정은 백엔드 개발자 포트폴리오 블로그로서 정석
- 코드 예제가 실제로 돌아가는 수준. Toy example이 아님
- 단계별 설명 (Entity → Repository → Service → Controller) 구조가 교과서적으로 좋음
- 각 포스트 170~226줄. 적당한 분량

**ROAST:**
- **제목이 전부 "교과서 목차"**. "Spring Boot + JPA로 REST API 만들기"는 Medium에 5만 개 있는 제목. "내가 JPA N+1 문제로 새벽 3시에 울었던 이야기"가 클릭을 부른다
- **모든 포스트가 같은 톤**. 설명 → 코드 → 설명 → 코드. 실수담, 삽질 경험, "이거 때문에 2시간 날렸다" 같은 인간적 요소가 0
- **Docker 포스트**: "제 컴퓨터에서는 되는데요?" 도입부만 인간적이고, 나머지는 다시 교과서 모드
- **Caching 포스트**: Cache Stampede 언급은 좋은데, 실제로 겪은 경험이 아닌 "교과서에서 봤어요" 느낌
- **날짜가 미래** (2026-03-15~28). `future: true` 설정이니 빌드는 되지만, 현실감이 떨어짐

**즉시 개선 가능:**
- 제목에 숫자, 결과, 감정을 넣어라: "PostgreSQL 인덱스로 쿼리 66배 빠르게 만든 방법"
- 각 포스트에 "삽질 포인트" 또는 "처음에 이렇게 했다가 망한 이유" 섹션 추가

---

## 2. Pagination — "10개 포스트에 페이지네이션이 필요한가?"

### Verdict: 과잉 엔지니어링. 지금은 해가 됨.

**현재 상태:**
- 총 포스트: **10개**
- `paginate: 6`
- Page 1: Featured post 1개 + 카드 5개 = 6개 표시 (첫 번째 카드 skip)
- Page 2: 나머지 4개

**ROAST:**
- 유저가 "Older →" 버튼을 눌러서 4개짜리 2페이지를 보러 갈 확률? **거의 0%**
- 페이지네이션은 콘텐츠가 30개+ 일 때 의미가 생김. 10개에 2페이지는 "있어 보이려고 넣은 기능"
- 카테고리 필터가 이미 있는데, 필터 + 페이지네이션이 동시에 있으면 UX가 혼란스러움. 필터는 JS로 DOM 조작하는데 페이지네이션은 서버 사이드(Jekyll). 필터로 "Spring"만 보겠다고 하면 2페이지의 Spring 포스트는 안 보임
- **필터와 페이지네이션의 충돌**: 이건 실제 버그 수준. 카테고리 필터는 현재 페이지의 카드만 필터링함. 2페이지에 있는 포스트는 필터에서 보이지 않음

**개선 방안:**
- 포스트 20개 넘을 때까지는 `paginate: 20` 이상으로 올려서 실질적으로 단일 페이지로 운영
- 또는 infinite scroll 방식으로 전환 (Jekyll에서는 어렵지만)
- 최소한 `paginate: 12`로 올려서 현재 모든 포스트가 한 페이지에 나오게

**FIX APPLIED: 없음** (paginate 값 변경은 콘텐츠 전략 결정이므로 Sprint 10에서 논의)

---

## 3. Search Snippets — "실제로 검색 경험이 나아졌는가?"

### Verdict: 5/10 — 방향은 맞지만 실행이 빈약했음

**현재 상태:**
- search.json에서 excerpt를 `truncate:80`으로 생성 → **80자**
- 검색 결과에 title + excerpt + date + tags 표시
- 하이라이팅 있음 (검색어를 `<mark>`로 감싸기)
- 키보드 네비게이션 (/, Esc, 화살표, Enter)

**ROAST:**
- **80자 excerpt는 쓸모없다**. 한국어 기준으로 약 40글자. "Spring Boot와 JPA를 사용하여 REST API를 만드는 방법을 단계별로 정..." 여기서 끊김. 유저가 이걸 보고 "아 이 글이구나!" 할 수 없음
- Fuzzy search가 꺼져 있음 (`fuzzy: false`). "Dokcer"로 오타 내면 결과 0. 개발자는 오타 왕이다
- 검색 결과 50개 제한인데, 포스트가 10개임. 무의미한 설정

**FIX APPLIED:**
- `search.json`: excerpt `truncate:80` → `truncate:160`으로 증가 (한국어 기준 ~80글자)

**추가 권장:**
- Fuzzy search 켜기 (`fuzzy: true`)
- 검색어가 포함된 문장 주변을 동적으로 보여주는 contextual snippet이 이상적이나, Simple Jekyll Search의 한계

---

## 4. Hover Preview — "실제 유저가 쓸 기능인가?"

### Verdict: 3/10 — 기능적으로 깨져 있었고, 존재 이유도 불분명

**발견한 버그 (수정됨):**
- `post-card-excerpt` (항상 보이는 excerpt): **120자**
- `post-card-hover-excerpt` (hover 시 나타나는 excerpt): **100자**
- Hover 했더니 **이미 보이는 것보다 짧은 텍스트**가 아래에 나타남. 이건 기능이 아니라 버그

**ROAST:**
- 이 블로그의 모바일 비율을 생각해 보자. 개발자 블로그 방문자의 50-70%가 모바일. Hover는 모바일에서 **존재하지 않는 인터랙션**
- `@media (hover: hover)`로 모바일을 제외한 건 좋은데, 그러면 유저의 절반 이상은 이 기능을 못 봄
- 데스크톱에서도: 카드에 이미 title + subtitle + excerpt(120자) + tags + date + read time이 보임. 정보 과잉. Hover로 또 excerpt를 보여줘봐야 눈이 안 감
- **`max-height: 80px`**: 250자 텍스트가 80px에 다 들어갈까? overflow: hidden이라 잘릴 수 있음

**FIX APPLIED:**
- `index.html`: hover excerpt `truncate:100` → `truncate:250`으로 증가. 이제 hover 시 항상 보이는 excerpt보다 더 많은 내용을 보여줌

**근본적 문제:**
- 이 기능의 존재 자체를 재고해야 함. 카드에 이미 충분한 정보가 있고, hover preview가 추가하는 가치가 거의 없음
- 차라리 hover 시 카드가 살짝 올라오는 elevation 효과만 주는 게 더 깔끔

---

## 5. About Contact Section — "실제로 누가 연락하겠는가?"

### Verdict: 6/10 — 있어야 하지만, 지금은 "방명록" 수준

**현재 상태:**
- Email (doodoo3804@gmail.com) + GitHub + LinkedIn
- 깔끔한 pill 버튼 스타일, 다크모드 대응
- 3개 국어 동일 구조 (en/kr/ja)

**ROAST:**
- **Gmail 주소는 프로페셔널하지 않다**. 도메인이 `doodoo3804.github.io`인데 커스텀 이메일을 안 쓴다고? (물론 GitHub Pages라 어렵지만 최소한 Google Workspace 정도는)
- **GitHub 링크가 Contact에도 있고, GitHub Activity 섹션에도 있음**. 중복. 위에서 이미 본 걸 아래에서 또 보여주는 건 UX가 아니라 padding
- **"누가 연락하겠는가?"에 대한 답**: 리크루터. 그런데 리크루터는 LinkedIn DM을 보내지, About 페이지에서 이메일을 복사해서 메일을 쓰지 않음
- CTA(Call to Action)가 없음. "프로젝트 협업 제안 환영합니다" 한 줄이면 연락 의향이 2배가 됨

**개선 방안:**
- GitHub 링크를 Contact에서 제거하고, GitHub Activity 섹션에만 유지
- "협업 제안, 기술 질문, 커피챗 환영합니다" 같은 CTA 한 줄 추가
- (선택) Calendly 링크 추가 — 리크루터가 미팅 잡기 쉽게

---

## 6. Sprint 9 전체 평가

### Overall: 6/10

| 항목 | 점수 | 한줄평 |
|------|------|--------|
| Blog Posts | 7.5 | 기술력은 보이지만 개성이 없다 |
| Pagination | 4 | 10개 포스트에 과잉. 필터와 충돌 |
| Search Snippets | 5 | 80자는 너무 짧았다 (수정됨 → 160) |
| Hover Preview | 3 | 버그 + 모바일 무용 + 존재 이유 불분명 |
| Contact | 6 | 있어야 하지만 CTA 부재 |
| Dark Mode Default | 8 | FOUC 방지 + OS 연동 + 잘 구현됨 |
| Sitemap | 7 | 기본에 충실. priority 값 조정 가능 |
| robots.txt | 7 | 존재만으로도 OK |

**Sprint 9의 가장 큰 문제:**
기능을 많이 넣었지만 "이 기능이 지금 이 블로그에 필요한가?"를 묻지 않았다. 10개 포스트 블로그에 페이지네이션, 검색 snippet, hover preview... 이건 100개 포스트 블로그의 기능을 10개 포스트 블로그에 이식한 것. 기능의 수보다 기존 기능의 품질을 올리는 데 시간을 써야 했다.

**잘한 점:**
- Dark mode system default 구현은 깔끔. FOUC 방지, OS 변경 감지, utterances 테마 연동까지
- 검색 키보드 네비게이션 (`/`, `Esc`, 화살표) — 개발자 블로그답게 키보드 중심 UX
- Sitemap + robots.txt — SEO 기본기 챙긴 것은 좋음

---

## 7. Sprint 10 기획 제안

### Priority 1: 콘텐츠 (가장 중요)
- [ ] 포스트 5개 이상 추가. 20개가 되기 전까지는 인프라보다 콘텐츠
- [ ] 포스트 제목 리라이팅: 교과서 제목 → 결과/숫자/감정이 있는 제목
- [ ] 각 포스트에 "삽질 포인트" 또는 TIL(Today I Learned) 섹션 추가

### Priority 2: 기존 기능 개선
- [ ] `paginate: 12` 이상으로 변경 (또는 포스트 20개까지 사실상 단일 페이지)
- [ ] Hover preview 기능 제거 또는 → 카드 elevation 효과로 대체
- [ ] 검색 fuzzy mode 활성화 (`fuzzy: true`)
- [ ] Contact 섹션에서 GitHub 중복 제거 + CTA 문구 추가

### Priority 3: 새 기능 (콘텐츠 충분할 때)
- [ ] Reading progress bar (포스트 읽을 때 상단 진행 바)
- [ ] 관련 포스트 추천 (같은 시리즈/태그 기반)
- [ ] 포스트 목차(TOC) 자동 생성 — 긴 포스트에 필수
- [ ] Google Analytics 연동 — 실제 유저 데이터 없이 UX 개선은 눈감고 걷기

### Anti-priority (하지 마라)
- [ ] ~~댓글 시스템 추가 기능~~ — 포스트 10개에 댓글 기능 강화는 과잉
- [ ] ~~다국어 포스트~~ — 한 언어로 깊이 있는 콘텐츠가 먼저
- [ ] ~~Newsletter~~ — 구독자 0명인 뉴스레터를 만들지 마라

---

## Fixes Applied

| File | Change | Reason |
|------|--------|--------|
| `search.json` | excerpt truncate 80 → 160 | 80자는 검색 결과로서 의미 없는 길이 |
| `index.html` | hover excerpt truncate 100 → 250 | hover excerpt가 항상 보이는 excerpt(120자)보다 짧았던 버그 수정 |

---

*"기능이 많은 블로그가 좋은 블로그가 아니다. 읽을 게 많은 블로그가 좋은 블로그다."*
