# OneBetHub 블로그 파이프라인 v1.0

> **원본**: VOBET 매거진 블로그 파이프라인 v2.0 (`VOBET/blog-project/scripts/generate-post.mjs`, 읽기 전용 참고)
> **현재 스택**: WordPress (cPanel, 준비 예정) + GitHub Actions + Claude/GPT-4o-mini/Gemini + Polylang

이 문서는 "무엇을 그대로 재사용했는지"와 "무엇을 onebethub 전용으로 바꿨는지"를 구분해서 설명합니다.

---

## 전체 구조 요약

```
매주 화요일 오전 9:00 KST (GitHub Actions, 필요 시 빈도 조정)
        │
        ▼
  [클러스터 완결 체크] 직전 실행 이후 어떤 클러스터의 T2/T3가 전부 발행됐는지 확인
                       → 완결됐으면 해당 T1 허브 글에 하향링크 블록 추가(update) — 신규 스텝
        │
        ▼
  [Stage 1] 페이지 선택 — 클러스터 순서 고정(임대→분양→제작→가격→토토개발), 클러스터 내부는
                          T1 허브 먼저 → T2/T3는 week 오름차순. 로컬 원장(data/published-log.json)
                          + (라이브 모드) wp post list 로 이미 발행된 페이지 스킵
        │
        ▼
  [Serper]  아웃바운드 링크 검색 — 실제 출처 URL 3개 확보 (원본 그대로)
        │
        ▼
  [내부링크] link-map.json에서 이 페이지의 상향(up)/교차(cross) 링크 대상 URL을 해석해 "필수 링크"로
             확보 + 같은 클러스터·태그 겹침 기반 참고 내부링크 추가 (원본의 유사도 자동탐색 대신 고정 테이블)
        │
        ▼
  [Stage 2] 콘텐츠 생성 (Claude Sonnet) — SEO + GEO 최적화 한국어 초안, 상향링크 본문 첫 3문단 강제 지시 포함
        │
        ▼
  [Stage 3] 휴머나이징 (Claude Sonnet) — AI 패턴 제거 (원본과 동일 로직, 크립토 특정 지침 제거)
        │
        ▼
  [Stage 4] SEO 품질 게이트 (규칙 기반) — 11항목 자동 검사 (원본 10항목 + 상향링크 존재 여부, 신규)
        │ 실패 시 최대 2회 재생성
        ▼
  [Stage 5] 멀티모델 검증 — Claude-haiku + GPT-4o-mini + Gemini 동시 (원본과 동일 모델/구조)
        │ 미통과 시 최대 2회 재작성 루프
        ▼
  [이미지]  헤더/본문 — Gemini AI 생성 → Pexels(주제 사진) → 브랜드 자체제작 / 로고 합성 (원본과 동일 3단 폴백,
           테마만 크립토/스포츠/라이프스타일 → 임대/분양/제작/가격/토토개발 B2B 산업 테마로 교체)
        │
        ▼
  [발행]   라이브: WordPress KO 발행 + Rank Math 메타 + Polylang KO 지정 (원본과 동일 SSH+wp-cli 방식)
           DRY_RUN: data/dry-run-output/ 에 HTML+메타 JSON 저장 + 콘솔 출력 (신규)
        │
        ▼
  [번역]   Claude Sonnet → 영어 번역, 내부 링크 EN 글로 교체 (원본과 동일)
        │
        ▼
  [발행]   WordPress EN 발행 (or DRY_RUN 저장) + Polylang EN 지정 + KO↔EN 페어 연결
        │
        ▼
  [원장 기록] data/published-log.json 에 {id, publishedAt, lang, title, url, status} 추가 (신규)
        │
        ▼
  [ClickUp]   검수 태스크 생성 (KO 글만, 리스트 ID는 onebethub 전용 env로 분리)
        │
        ▼
  [Telegram]  파이프라인 결과 알림
```

---

## VOBET 원본 대비 변경점 (핵심 5가지)

1. **Stage 1 완전 교체** — 원본은 "카테고리(스포츠/크립토/라이프스타일) 날짜 시드 로테이션 + 발행 수 최소
   카테고리 우선"이었다. onebethub는 22페이지 키워드맵(`scripts/keyword-map.json`)이 클러스터별 완결
   순서가 고정돼 있어야 하므로(임대→분양→제작→가격→토토개발, 각 클러스터 내 T1 허브 → T2/T3 week순),
   `sortedPages()` + `pickPage()`로 결정적 순서를 그대로 따르게 바꿨다. 중복 체크도 원본의 `wp post list`
   단독 대조에서 **로컬 원장(`data/published-log.json`) + wp post list 이중 대조**로 강화했다(WP가 아직
   없는 DRY_RUN 단계에서도 중복 발행을 막기 위함).

2. **내부링크: 자동 유사도 탐색 → 고정 매핑 테이블 + 상향링크 필수 게이트** — 원본은 발행된 글 전체를
   가져와 카테고리+키워드 겹침으로 관련도 점수화했다. onebethub는 `scripts/link-map.json`(고정 내부링크
   매핑표, `build-link-map.mjs`로 `keyword-map.json`에서 재생성)에서 각 페이지의 상향(up)/하향(down)/
   교차(cross) 링크를 결정적으로 읽어온다. 상향링크는 Stage 2 프롬프트에서 "본문 첫 3문단 안에 필수
   삽입"으로 강제하고, **Stage 4 SEO 게이트에 11번째 항목("상향 링크 존재 여부")을 신규 추가**해 실제로
   지켜졌는지 규칙 기반으로 검사한다. 하향링크는 클러스터의 모든 T2/T3가 발행된 뒤에만 허브 글을
   업데이트하며 일괄 삽입한다(`maybeUpdateCompletedHubs()`, 원본에 없던 완전 신규 로직).

3. **브랜드/카테고리 → 클러스터 + 콘텐츠 믹스 가드레일** — 원본은 "크립토 네이티브 프리미엄 매거진,
   도박/베팅 직접 언급 금지" 페르소나였다. onebethub는 "특정 브랜드 홍보가 아닌 카지노·스포츠북 B2B
   산업 인사이트 미디어" 페르소나로 교체했고, `brandGuidance(page)`가 페이지 태그에 `브랜드비교`가
   있는지에 따라 "비교글(7Play 포함 객관적 비교, 일방적 칭찬 금지)" 또는 "브랜드 무관 정보/기술 해설
   (특정 업체명 억지 언급 금지)" 지침을 프롬프트에 주입한다. 도박 언급 금지 제약은 제거했다(이 블로그의
   목적 자체가 카지노 솔루션 산업을 다루는 것이므로 해당 없음).

4. **CTA — 텔레그램 초대링크 → CTA_URL_MAP(클러스터별 7play.co)** — 원본 CTA(`TELEGRAM_INVITE_LINK`)를
   제거하고, 클러스터별 `CTA_URL_MAP` 상수(현재는 전부 plain `https://7play.co/`)로 교체했다. btag은
   담당자("찬") 발급 대기 중이라 값만 나중에 교체하면 되도록 상수 하나로 분리해뒀다. SEO 게이트의
   "CTA 섹션 누락" 검사도 `텔레그램` 문자열 대신 `7play.co` 포함 여부로 교체했다.

5. **DRY_RUN 모드 신규 추가** — 원본에는 없던 개념. `DRY_RUN=true`면 필수 env 체크에서 SSH/WORDPRESS_URL을
   제외하고, `createWordPressPost`/`uploadMediaToWordPress`/Polylang 연동을 전부 로컬 파일 저장 +
   콘솔 출력으로 대체한다(`data/dry-run-output/`). Stage 1~5(토픽선택·초안·휴머나이징·SEO게이트·3중검증)와
   이미지 생성은 DRY_RUN에서도 실제로 API를 호출해 동작한다 — WordPress/SSH가 준비되기 전에도 콘텐츠
   품질을 끝까지 검증할 수 있게 하는 것이 목적.

기타 세부 변경: 저자 페르소나 3명(`AUTHOR_CRYPTO/SPORTS/LIFESTYLE`) → 단일 `AUTHOR_ONEBETHUB` 환경변수,
ClickUp 리스트 ID 하드코딩 → `CLICKUP_LIST_ID` env로 분리(VOBET과 워크스페이스 공유 금지), 이미지 테마
크립토/스포츠/라이프스타일 → 임대/분양/제작/가격/토토개발 B2B 테마, `_vobet_gen_trace` 메타 키 →
`_onebethub_gen_trace`.

---

## 그대로 재사용한 것 (로직 변경 없음)

- SSH/WP-CLI 유틸(`getSSH`/`wpCli`/`sshPutBuffer`/`sshRm`/`getOrCreateTaxonomy`) 및 `createWordPressPost`의
  PHP eval-file 발행 방식(wp_slash 처리 포함)
- 이미지 3단 폴백(Gemini AI → Pexels → 브랜드 자체제작 SVG/그라데이션) + 헤더/본문 합성(로고, 제목 오버레이)
- SEO <title>/메타설명 하드 컷 안전망(`seoTitle`/`seoDescription`)
- Stage 4 규칙 기반 게이트의 1~10번 항목(원본 그대로) + Stage 5 3중 검증 프롬프트 구조와 모델
  (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `gemini-3.6-flash`/`gemini-3.1-pro-preview`)
- 영문 번역 로직(포커스 키워드 추출·검증, 제목-키워드 정합성 재시도, 외부 링크 로케일 치환)
- JSON-LD 결정적 생성(BlogPosting + FAQPage, 최종 본문 기준 — LLM 생성분 미사용)
- ClickUp 태스크 생성(커스텀 필드 조회 → Department/Channel/URL/키워드 매핑), 텔레그램 알림

## Stage 4 — SEO 품질 게이트 (11항목)

| # | 검사 항목 | 기준 |
|---|-----------|------|
| 1 | 제목에 키워드 | 포함 필수 |
| 2 | 메타 설명 최소 길이 | 100자 이상 |
| 3 | 메타 설명 최대 길이 | 160자 이하 |
| 4 | 메타 설명에 키워드 | 포함 필수 |
| 5 | 첫 문단에 키워드 | 포함 필수 |
| 6 | 키워드 등장 횟수 | 5회 이상 |
| 7 | H2 소제목 개수 | 4개 이상 |
| 7-1 | H2에 키워드 포함 | 최소 1개 |
| 8 | FAQ 섹션 | "## 자주 묻는 질문" 필수 |
| 9 | 본문 길이 | 2,000자 이상 |
| 10 | CTA 섹션 | `7play.co` 링크 포함 |
| **11 (신규)** | **상향 링크** | `pushesTo`가 있으면 본문 첫 3문단 안에 상위 페이지 링크 필수 |

## 알려진 단순화 (향후 개선 여지)

- 허브 하향링크 업데이트(`appendHubDownlinksLive`)는 라이브 모드에서 본문 끝에 마커 주석과 함께 링크
  블록을 추가하는 방식으로 구현했다. JSON-LD/메타를 함께 재생성하지는 않는다(허브 글 자체의 SEO 메타는
  최초 발행 시점 값을 유지). 필요하면 추후 JSON-LD 재생성 로직을 추가할 수 있다.
- `data/published-log.json`은 스펙상 최소 `{id, publishedAt, lang}` 셋을 보장하되, 내부링크 URL 해석을
  위해 `title`/`url`/`status`를 추가로 기록한다(라이브 모드에서 URL 재조회를 매번 wp-cli로 하지 않기 위함).
- GitHub Actions 워크플로우는 실행 후 `data/published-log.json` 변경분을 자동 커밋한다(러너가 매번
  새로 뜨는 휘발성 환경이라, 로컬 원장을 리포지토리에 영속시켜야 다음 실행에서 중복 체크가 유효하다).
