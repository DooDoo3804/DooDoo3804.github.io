# TODO

나중에 직접 처리해야 할 것들.

---

## Giscus 댓글 활성화

`_config.yml`에 플레이스홀더가 있음. 댓글 기능 실제로 쓰려면 교체 필요.

**순서:**
1. GitHub 레포 Settings → **Discussions 탭 활성화**
2. [giscus.app](https://giscus.app) 접속 → 레포 `DooDoo3804/DooDoo3804.github.io` 입력 → 값 발급
3. `_config.yml` 수정:

```yaml
giscus:
  repo_id: "여기에 발급된 값"
  category_id: "여기에 발급된 값"
```

4. 커밋 & 푸시

---

## GoatCounter 방문자 통계 활성화

`_config.yml`에 GoatCounter 설정이 비활성 상태로 준비되어 있음. 실제 통계 수집하려면 설정 필요.

**순서:**
1. [GoatCounter](https://www.goatcounter.com) 가입 → 사이트 코드 발급 (예: `doodoo-blog`)
2. `_config.yml` 수정:

```yaml
goatcounter:
  enabled: true
  code: "doodoo-blog"  # 발급받은 코드로 교체
```

3. 커밋 & 푸시 → `https://doodoo-blog.goatcounter.com` 에서 통계 확인

---
