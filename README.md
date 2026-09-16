# onebethub-blog

`onebethub.com` B2B SEO 블로그의 자동 발행 파이프라인.

VOBET 매거진 블로그 자동 발행 파이프라인(`C:\project\oh-my-claudecode\oh-my-claudecode\VOBET\blog-project`)에서
로직을 추출·재사용해, onebethub 전용(브랜드/토픽/CTA/게이트)으로 개조한 프로젝트입니다.
VOBET 원본은 읽기 전용 참고 대상이며 이 저장소는 완전히 별도의 GitHub 레포·WordPress·시크릿을 사용합니다
(같은 팀이 운영하는 여러 블로그가 인프라를 공유하면 검색엔진이 네트워크로 묶어 인식하는 리스크 방지).

## 빠른 시작

```bash
npm install
cp .env.example .env   # 값 채우기 (최소 ANTHROPIC_API_KEY)

# WordPress/SSH가 아직 없는 상태 — DRY_RUN으로 콘텐츠 파이프라인만 검증
npm run generate:dry

# WordPress/SSH 준비 완료 후 — 실제 발행
npm run generate
```

## 구조

```
onebethub-blog/
├── scripts/
│   ├── generate-post.mjs   # 메인 파이프라인 (Stage 1~5 + 이미지 + 번역 + 발행)
│   ├── keyword-map.json    # 22페이지 키워드맵 (5클러스터: 임대/분양/제작/가격/토토개발)
│   ├── link-map.json       # 내부링크 매핑표 (상향/하향/교차) — build-link-map.mjs 산출물
│   ├── build-link-map.mjs  # keyword-map.json → link-map.json 재생성 스크립트(유지보수용)
│   └── assets/             # 로고 등 브랜드 자산 (onebethub-logo.png 준비 전엔 자동 생략)
├── data/
│   ├── published-log.json  # 로컬 발행 원장 — {id, publishedAt, lang, title, url, status}
│   └── dry-run-output/     # DRY_RUN 산출물 (git 추적 안 함)
├── .github/workflows/weekly-post.yml
├── PIPELINE.md             # 파이프라인 상세 설계 문서 (VOBET 대비 변경점)
└── SECRETS.md              # 필요 시크릿 체크리스트
```

자세한 파이프라인 설계와 VOBET 대비 변경점은 [PIPELINE.md](./PIPELINE.md), 시크릿 체크리스트는
[SECRETS.md](./SECRETS.md)를 참고하세요.
