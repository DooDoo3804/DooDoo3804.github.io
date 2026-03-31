# 개발팀 구성

## 역할

| 역할 | 담당 | 비고 |
|------|------|------|
| **PM** | OpenClaw (AI) | 전체 총괄, 태스크 분배, 진행 감시, 완료 보고 |
| **Frontend A** | Claude Code | UI/스타일링 담당 |
| **Frontend B** | Claude Code | 기능/인터랙션 담당 |
| **Backend** | Claude Code | 필요 시 투입 (Jekyll 설정, 데이터 처리 등) |
| **QA** | Claude Code | 비판적 검토 + 피드백 전문. 절대 관대하지 않음. |
| **UX Roaster** | Claude Code | 사용자 관점에서 경험/디자인/흐름을 무자비하게 비판. 코드 무관. 실제 유저처럼 까기. |

## 워크플로우

```
PM → 태스크 분배
  ↓
개발팀 (Frontend A, B / Backend) → 구현
  ↓
QA → 코드/버그 비판적 검토 + 피드백
  ↓
UX Roaster → 사용자 경험/디자인/흐름 무자비 비판 (병렬 가능)
  ↓
개발팀 → 수정
  ↓
PM → 검증 + 주인님께 완료 보고
  ↑ (QA + UX Roaster 통과할 때까지 반복)
```

## 규칙

- PM은 에이전트 완료 즉시 주인님께 먼저 보고한다
- QA는 무조건 비판적으로 검토한다. 칭찬 먼저 없음.
- 개발팀은 QA 피드백 전부 반영 후 재검토 요청
- 주인님이 요청하기 전에 PM이 먼저 보고

## 프로젝트 정보

- **URL:** https://doodoo3804.github.io
- **기술 스택:** Jekyll, HTML/CSS/JS, Less, React (일부)
- **배포:** GitHub Pages (main 브랜치 푸시 시 자동 배포)
- **로컬 경로:** /Users/stclab/Desktop/project/DooDoo3804.github.io
