# onebethub-blog — Secrets 체크리스트

GitHub 레포 → Settings → Secrets and variables → Actions → New repository secret

VOBET과 완전히 분리된 별도 GitHub 레포·WordPress·시크릿을 사용한다(호스팅/네트워크 지문 분리 원칙).
VOBET에서 발급된 어떤 키·시크릿도 재사용하지 않는다.

## 필수 Secrets

```
ANTHROPIC_API_KEY     = sk-ant-...
```

## WordPress / SSH — ⚠ 아직 준비 안 됨

```
WORDPRESS_URL         = (미정 — 담당자에게 요청 예정)
SSH_HOST              = (미정)
SSH_USER              = (미정)
SSH_PRIVATE_KEY       = (미정, -----BEGIN 포함 전체 내용)
SSH_WP_PATH           = /home2/[계정명]/public_html
SSH_PORT              = 22
```

**케빈이 담당자에게 WordPress/SSH 환경 구축을 요청할 예정이며, 이 문서 작성 시점(2026-09-16)에는
아직 아무것도 준비되지 않았다.** 이 시크릿들이 준비되기 전까지는 GitHub Actions 워크플로우의
`DRY_RUN` repository variable을 `true`로 설정해 실행하거나(`.github/workflows/weekly-post.yml`
참고), 로컬에서 `npm run generate:dry`로만 파이프라인을 운영한다. `DRY_RUN=true`일 때는 이 섹션의
시크릿이 전혀 필요 없다.

## 선택 Secrets (없으면 해당 기능 자동 건너뜀)

```
OPENAI_API_KEY        = sk-...        (Stage 5 GPT-4o-mini 검증. 없으면 이 검증만 skip)
GEMINI_API_KEY        = AIza...       (Stage 5 Gemini 검증 + AI 이미지 생성 1순위. 없으면 Pexels/브랜드 폴백)
SERPER_API_KEY        = (serper.dev)  (아웃바운드 링크 검색. 없으면 아웃바운드 링크 생략)
PEXELS_API_KEY        = (pexels.com)  (이미지 2순위 폴백. 없으면 브랜드 자체제작 이미지만 사용)
CLICKUP_API_KEY       = pk_...        (검수 태스크 자동 생성. onebethub 전용 워크스페이스 키 — VOBET 키 재사용 금지)
CLICKUP_LIST_ID       = (onebethub 전용 검수 리스트 ID)
TELEGRAM_BOT_TOKEN    = 123456:ABC-...
TELEGRAM_CHAT_ID      = -100...
AUTHOR_ONEBETHUB      = WordPress 사용자명 (저자 페르소나 확정 전까지 미설정 — 첫 admin으로 자동 폴백)
```

> `SSH_PRIVATE_KEY`에 개인키 붙여넣을 때 `-----BEGIN ... KEY-----` 줄 포함, 줄바꿈 그대로 유지.
> btag은 CTA에 사용하지 않는다(코드에도 하드코딩하지 않음) — "찬"이 발급하면 `scripts/generate-post.mjs`의
> `CTA_URL_MAP` 값만 교체한다. 별도 시크릿으로 관리할 필요는 없다(URL 자체가 비밀 정보는 아님).

## 체크리스트

- [ ] `ANTHROPIC_API_KEY` 발급 및 등록
- [ ] WordPress/SSH 환경 구축 요청 (담당자) — 완료 전까지 DRY_RUN 운영
- [ ] onebethub 전용 ClickUp 워크스페이스/리스트 생성 + 커스텀 필드(Department/Channel/URL/키워드) 구성
- [ ] onebethub 전용 텔레그램 봇/채널 생성 (VOBET 봇 재사용 금지)
- [ ] 모든 GitHub Secrets 값 전달 (보안 채널로)
- [ ] `scripts/assets/onebethub-logo.png` 로고 파일 준비 (없으면 로고 합성 자동 생략, 발행 자체는 가능)
