# OneBetHub 블로그 파이프라인 v1.0

> **원본**: VOBET 매거진 블로그 파이프라인 v2.0 (`VOBET/blog-project/scripts/generate-post.mjs`, 읽기 전용 참고)
> **현재 스택**: WordPress (Cloudways) + GitHub Actions + Claude/GPT-4o-mini/Gemini + Polylang + Rank Math (2026-09-18 둘 다 설치 완료)
> **최종 갱신**: 2026-09-18 · Drive 문서(회사 SOP용 사본): `[BD][M2-개발] OneBetHub 콘텐츠 자동화 파이프라인_v1.0`

이 문서는 "무엇을 그대로 재사용했는지", "무엇을 onebethub 전용으로 바꿨는지", 그리고 "실제
Cloudways 호스팅에 배포하면서 겪은 문제와 수정 내역"을 함께 기록한다.

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
        │ 미통과 시 최대 2회 재작성 루프, 그래도 미통과면 draft로 저장(사람 검수 후 수동 발행)
        ▼
  [이미지]  헤더/본문 — Gemini AI 생성 → Pexels(주제 사진) → 브랜드 자체제작 / 로고 합성 (원본과 동일 3단 폴백,
           테마만 크립토/스포츠/라이프스타일 → 임대/분양/제작/가격/토토개발 B2B 산업 테마로 교체)
        │
        ▼
  [발행]   라이브: WordPress KO 발행 + Rank Math 메타(postmeta로 저장) + Polylang KO 지정(설치 시)
           DRY_RUN: data/dry-run-output/ 에 HTML+메타 JSON 저장 + 콘솔 출력, 발행 원장도 별도 파일에 기록
        │
        ▼
  [번역]   Claude Sonnet → 영어 번역, 내부 링크 EN 글로 교체 (원본과 동일)
        │
        ▼
  [발행]   WordPress EN 발행 (or DRY_RUN 저장) + Polylang EN 지정(설치 시) + KO↔EN 페어 연결
        │
        ▼
  [원장 기록] data/published-log.json 에 {id, publishedAt, lang, title, url, status} 추가 (신규,
             DRY_RUN은 절대 이 파일에 쓰지 않음 — data/dry-run-output/published-log.json 별도)
        │
        ▼
  [ClickUp]   검수 태스크 생성 (KO 글만, 리스트 ID는 onebethub 전용 env로 분리)
        │
        ▼
  [Telegram]  파이프라인 결과 알림
```

---

## VOBET 원본 대비 변경점 (핵심 6가지)

1. **Stage 1 완전 교체** — 원본은 "카테고리(스포츠/크립토/라이프스타일) 날짜 시드 로테이션 + 발행 수 최소
   카테고리 우선"이었다. onebethub는 22페이지 키워드맵(`scripts/keyword-map.json`)이 클러스터별 완결
   순서가 고정돼 있어야 하므로(임대→분양→제작→가격→토토개발, 각 클러스터 내 T1 허브 → T2/T3 week순),
   `sortedPages()` + `pickPage()`로 결정적 순서를 그대로 따르게 바꿨다. 중복 체크도 원본의 `wp post list`
   단독 대조에서 **로컬 원장(`data/published-log.json`) + wp post list 이중 대조**로 강화했다(WP가 아직
   없는 DRY_RUN 단계에서도 중복 발행을 막기 위함). `pickPage()`에는 `pushesTo` 대상이 아직 미발행이면
   건너뛰는 안전망도 있다(정상 순서라면 발동 안 해야 하지만, 2026-09-18에 이 안전망이 실제로 뚫린 적이
   있었다 — 아래 "겪은 문제와 수정" 1번 참고).

2. **내부링크: 자동 유사도 탐색 → 고정 매핑 테이블 + 상향링크 필수 게이트** — 원본은 발행된 글 전체를
   가져와 카테고리+키워드 겹침으로 관련도 점수화했다. onebethub는 `scripts/link-map.json`(고정 내부링크
   매핑표, `build-link-map.mjs`로 `keyword-map.json`에서 재생성)에서 각 페이지의 상향(up)/하향(down)/
   교차(cross) 링크를 결정적으로 읽어온다. 상향링크는 Stage 2 프롬프트에서 "본문 첫 3문단 안에 필수
   삽입"으로 강제하고, **Stage 4 SEO 게이트에 11번째 항목("상향 링크 존재 여부")을 신규 추가**해 실제로
   지켜졌는지 규칙 기반으로 검사한다. 단, 이 게이트는 URL 문자열이 본문에 있는지만 확인하고 그 대상이
   실제로 200을 반환하는지는 확인하지 않는다 — 라이브 검수 시 별도로 `curl` 확인 필요. 하향링크는
   클러스터의 모든 T2/T3가 발행된 뒤에만 허브 글을 업데이트하며 일괄 삽입한다
   (`maybeUpdateCompletedHubs()`, 원본에 없던 완전 신규 로직).

3. **브랜드/카테고리 → 클러스터 + 콘텐츠 믹스 가드레일** — 원본은 "크립토 네이티브 프리미엄 매거진,
   도박/베팅 직접 언급 금지" 페르소나였다. onebethub는 "특정 브랜드 홍보가 아닌 카지노·스포츠북 B2B
   산업 인사이트 미디어" 페르소나로 교체했고, `brandGuidance(page)`가 페이지 태그에 `브랜드비교`가
   있는지에 따라 "비교글(7Play 포함 객관적 비교, 일방적 칭찬 금지, 콘텐츠 믹스의 10~20%)" 또는
   "브랜드 무관 정보/기술 해설(특정 업체명 억지 언급 금지, 70~90%)" 지침을 프롬프트에 주입한다. 도박
   언급 금지 제약은 제거했다(이 블로그의 목적 자체가 카지노 솔루션 산업을 다루는 것이므로 해당 없음).

4. **CTA — 텔레그램 초대링크 → 역할 기반 분기(2026-09-18 개편) → 개별 btag 우선순위 추가(2026-09-18)** —
   처음엔 원본 CTA(`TELEGRAM_INVITE_LINK`)를 제거하고 클러스터별 `CTA_URL_MAP`(전부 plain
   `https://7play.co/`)로 단순 교체했었는데, 이러면 **콘텐츠 믹스와 무관하게 모든 글이 예외 없이 같은
   외부 링크로 귀결**돼서 도어웨이 페이지 스팸 패턴으로 읽힐 위험이 있었다(`/seo검수`로 첫 실발행 글
   검수 중 발견, Claude·Gemini 교차검수 양쪽 다 동일 지적). `isConversionPage(page)`(role에 "전환"
   포함 — 클러스터당 1개, keyword-map.json에 이미 이렇게 설계돼 있었음)로 분기해서:
   - **전환 페이지**(임대=T1-01, 분양=T1-02, 제작=T1-03, 가격=T1-04, 토토개발=T1-05): `CTA_URL_MAP
     [cluster]`로 7Play 직접 연결(개별 btag 없는 경우의 폴백).
   - **그 외 지원/허브 페이지**: `resolveCtaUrl()`이 같은 클러스터의 전환 페이지로 가는 내부 링크를
     해석해서 CTA로 사용(그 전환 페이지가 아직 미발행이면 임시로 7Play 직접 링크 폴백).
   - Stage 4 게이트 10번 항목(CTA 존재 확인)도 이 분기를 반영 — 전환 페이지는 `7play.co` 문자열,
     그 외는 `ctaUrl`(내부 링크) 문자열 포함 여부로 검사(KO/EN 둘 다).

   **개별 btag 우선순위(2026-09-18 추가)** — ClickUp의 "키워드 70개" 리스트(New_7PLAY 통합 스페이스,
   Kevin의 A.M 스페이스에 태스크를 만들면 자동화로 미러링됨)에서 Kevin에게 실제로 배정·발급된 btag
   10개를 확인해 `keyword-map.json`의 해당 10개 페이지(T1-02·T1-03·T1-04·T1-05·T2-01·T2-02·T2-03·
   T2-05·T2-09·T2-10)에 `page.btag` 필드로 반영했다. `resolveCtaUrl(page, pages, log)`는 이제
   **`page.btag`가 있으면 role/클러스터 분기보다 먼저 그 값을 그대로 반환**한다 — 개별 발급된 btag는
   페이지마다 고유한 추적 링크라 "모든 글이 같은 목적지로 귀결"되는 도어웨이 우려에 해당하지 않기
   때문에, 전환 페이지가 아닌 T2 지원 글이어도 자기만의 btag가 있으면 내부링크 대신 직접 CTA를 쓴다.
   `ctaBlock()`과 Stage 4/EN 게이트 10번 항목의 조건도 `isConversionPage(page) || page.btag`로 확장.
   btag이 없는 나머지 12개 페이지는 기존 로직 그대로 동작(변경 없음).

5. **DRY_RUN 모드 신규 추가, 그리고 실제 발행 원장과 완전 분리(2026-09-18 수정)** — `DRY_RUN=true`면
   필수 env 체크에서 SSH/WORDPRESS_URL을 제외하고, `createWordPressPost`/`uploadMediaToWordPress`/
   Polylang 연동을 전부 로컬 파일 저장 + 콘솔 출력으로 대체한다. Stage 1~5와 이미지 생성은 DRY_RUN
   에서도 실제로 API를 호출해 동작한다 — WordPress/SSH가 준비되기 전에도 콘텐츠 품질을 끝까지 검증할
   수 있게 하는 것이 목적. **처음엔 DRY_RUN도 실제 `data/published-log.json`에 draft 항목을 남겼는데,
   이게 나중에 실제(non-DRY_RUN) 실행의 `pickPage()`를 속여서 아직 발행되지 않은 허브 페이지를
   "이미 발행됨"으로 착각하게 만든 사고가 있었다** — 지금은 `PUBLISHED_LOG_FILE` 자체가 DRY_RUN이면
   `data/dry-run-output/published-log.json`으로, 아니면 `data/published-log.json`으로 갈라져서
   두 로그가 절대 섞이지 않는다(아래 "겪은 문제와 수정" 1번 참고).

6. **Cloudways 호스팅 대응 — SSH/SFTP 경로 처리 전면 수정(2026-09-17~18)** — VOBET 원본은 다른 호스팅
   환경을 전제로 작성돼서, onebethub의 실제 Cloudways 서버에 그대로 쓰면 안 되는 부분이 여럿 있었다.
   아래 "겪은 문제와 수정" 섹션 전체가 이 항목에 해당한다.

기타 세부 변경: 저자 페르소나 3명(`AUTHOR_CRYPTO/SPORTS/LIFESTYLE`) → 단일 `AUTHOR_ONEBETHUB` 환경변수
(아직 미설정 — 첫 admin 계정 이름으로 폴백 중, 페르소나 결정 보류 상태), ClickUp 리스트 ID 하드코딩 →
`CLICKUP_LIST_ID` env로 분리(VOBET과 워크스페이스 공유 금지), 이미지 테마 크립토/스포츠/라이프스타일 →
임대/분양/제작/가격/토토개발 B2B 테마, `_vobet_gen_trace` 메타 키 → `_onebethub_gen_trace`.

---

## 그대로 재사용한 것 (로직 변경 없음)

- SSH/WP-CLI 유틸(`getSSH`/`wpCli`/`sshPutBuffer`/`sshRm`/`getOrCreateTaxonomy`) 및 `createWordPressPost`의
  PHP eval-file 발행 방식(wp_slash 처리 포함) — 단, 아래 6번 항목대로 Cloudways 대응 코드가 추가됐다.
- 이미지 3단 폴백(Gemini AI → Pexels → 브랜드 자체제작 SVG/그라데이션) + 헤더/본문 합성(로고, 제목 오버레이)
- SEO `<title>`/메타설명 하드 컷 안전망(`seoTitle`/`seoDescription`)
- Stage 4 규칙 기반 게이트의 1~9번 항목(원본 그대로, 10번은 5번 항목대로 로직 확장) + Stage 5 3중 검증
  프롬프트 구조와 모델(`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`,
  `gemini-3.6-flash`/`gemini-3.1-pro-preview`)
- 영문 번역 로직(포커스 키워드 추출·검증, 제목-키워드 정합성 재시도, 외부 링크 로케일 치환) — URL을
  절대 변형/발명하지 말라는 지시를 2026-09-18에 더 명시적으로 강화했다(아래 2번 항목 참고).
- JSON-LD 결정적 생성(BlogPosting + FAQPage, 최종 본문 기준 — LLM 생성분 미사용)
- ClickUp 커스텀 필드 동적 조회 방식(필드명으로 매핑) 자체는 재사용 — 단 대상 리스트와 필드 구성은
  onebethub 전용으로 교체(아래 "ClickUp 연동" 절 참고), 텔레그램 알림

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
| 10 | CTA 섹션 | 전환 페이지 또는 개별 btag(`page.btag`) 배정 페이지는 `7play.co`, 그 외는 내부 전환 링크(`ctaUrl`) 포함 |
| **11 (신규)** | **상향 링크** | `pushesTo`가 있으면 본문 첫 3문단 안에 상위 페이지 링크 필수 |

## 라이브 사이트 직접 조회 — `scripts/wp-remote.mjs`

비밀번호 기반 SSH라 VOBET처럼 `ssh vobet-wp` 같은 SSH config 별칭을 못 쓴다. 대신 `.env`를 직접
파싱해서 동작하는 최소 wp-cli 실행 헬퍼를 만들었다 — `source` 불필요.

```bash
cd C:\project\7play-seo\onebethub-blog
node scripts/wp-remote.mjs "post list --fields=ID,post_title,post_status,post_name --format=table"
node scripts/wp-remote.mjs "post get <id> --fields=ID,post_title,post_status,post_name"
node scripts/wp-remote.mjs "post meta get <id> _onebethub_gen_trace"   # 생성 트레이스(검증 점수 등)
node scripts/wp-remote.mjs "eval \"echo url_to_postid('<URL>');\""
node scripts/wp-remote.mjs "breeze purge --cache=all"                   # 캐시 퍼지(테마/설정 변경 후 필수)
```

`_onebethub_gen_trace` 반환 필드: `pageId, cluster, focusKeyword, stage2Attempts, stage4SeoIssues,
revisions, verificationPassed, postStatus, runEnv, dryRun, verification.{claude,gpt4oMini,gemini}.
{score,verdict,issues}`.

## 테마 (`wp-theme/onebethub/`)

Stitch로 디자인("OneBetHub Enterprise Intelligence" — Bloomberg/FT 스타일 B2B 트레이드 저널, 카테고리별
색상 토큰: 임대=코발트/분양=틸/제작=인디고/가격=앰버/토토개발=슬레이트)한 목업(`stitch-export/` 원본
보관)을 기반으로 제작. Tailwind는 빌드 없이 CDN 스크립트로 로드.

Rank Math·Polylang 미설치 상태를 전제로 설계 — 두 플러그인 없이도 정상 동작하도록 가드 처리된 폴백을
넣었고, 나중에 설치되면 자동으로 그쪽에 넘어간다:
- `onebethub_meta_description_fallback()`: `rank_math_description` postmeta로 `<meta
  name="description">` 직접 출력. `defined('RANK_MATH_VERSION')`이면 스킵.
- `onebethub_html_lang_attribute()` / `onebethub_hreflang_fallback()`: EN 슬러그가 항상
  `{ko슬러그}-en`이라는 파이프라인 규칙으로 KO/EN을 구분해 `<html lang>`과 상호 hreflang을 출력.
  `function_exists('pll_current_language')`면 스킵.

**테마/설정 변경 후 반드시 Breeze 캐시 퍼지**(`wp-remote.mjs "breeze purge --cache=all"`) — 안 하면
반영된 수정사항이 몇 시간씩 예전 버전으로 보인다. object-cache-pro도 같이 쓰므로 `wp-remote.mjs
"cache flush"`도 함께 실행할 것 — 둘 중 하나만 지우면 여전히 옛 버전이 보일 수 있다.

배포: `set -a && source .env && set +a && MSYS_NO_PATHCONV=1 node scripts/_deploy-theme.mjs`
(업로드 → PHP 문법 검사 → 활성화 → 실패 시 twentytwentyfive로 자동 롤백까지 자동화)

**KO/EN 언어 분리 + 전환 버튼(2026-09-19)** — Polylang 미설치 상태에선 KO/EN 글이 그냥 같은 카테고리의
평범한 WP 글이라, 모든 목록(홈 히어로/피드, 사이드바 "카테고리별 최신", 카테고리 아카이브, 관련 글)에
두 언어가 무작위로 섞여 나왔다(실제 라이브에서 발견됨 — 언어 전환 버튼도 아예 없었음). 파이프라인의
"{ko슬러그}-en" 명명 규칙을 이용한 `onebethub_lang` 커스텀 쿼리 변수 + `posts_where` 필터를 추가해서,
모든 목록 쿼리가 기본적으로 한 언어만 보여주게 했다(개별 글은 그 글의 언어, 그 외 페이지는 `?lang=en`
토글). `onebethub_language_switcher()`도 Polylang 없을 때 그냥 아무것도 안 그리던 것을, 같은 슬러그
규칙으로 실제 작동하는 KO/EN 버튼을 그리도록 교체.
⚠️ **디버깅에 시간 걸렸던 함정**: `get_posts()`는 `new WP_Query()`와 달리 **`suppress_filters`
기본값이 `true`**라서, 똑같은 쿼리 인자를 줘도 `posts_where` 필터가 조용히 무시된다. `get_posts()`를
쓰는 자리(사이드바 위젯, 카테고리 "최근 업데이트")는 전부 `'suppress_filters' => false`를 명시로
추가해야 했다 — `new WP_Query()`로 쓴 자리(히어로/피드/관련글)는 처음부터 정상 작동했음.

**정적 UI 텍스트 영문화(2026-09-18)** — 위 언어 분리 작업 이후에도, 본문(글)은 언어별로 잘 나뉘지만
테마 자체의 고정 UI 문구("리포트 열람하기", "카테고리별 최신 리포트", 푸터 면책 문구 등)는 전부 하드코딩된
한국어라 EN 뷰(`?lang=en`)에서도 한국어로 보이는 문제가 있었다. 진짜 WordPress i18n(.po/.mo +
`switch_to_locale()`)을 새로 붙이는 대신, 테마가 이미 전부 올바른 텍스트 도메인('onebethub')으로
`__()/_e()/esc_html_e()/esc_attr_e()/_n()/_x()`를 쓰고 있었으므로 그 호출들을 가로채는 방식을 택함:
- `onebethub_ko_en_dictionary()` — 테마의 모든 번역 가능 문자열을 담은 KO→EN 배열(functions.php)
- `gettext`/`ngettext`/`gettext_with_context` 필터 3개(`onebethub_translate_ui_text*`) — 도메인이
  'onebethub'이고 `onebethub_current_view_lang() === 'en'`이고 Polylang(`pll__`)이 없을 때만 사전에서
  치환. Polylang 설치 시 자동으로 비활성화(그쪽이 우선).
- `grep -rnoE "(esc_html_e|esc_attr_e|_e|__|_n|_x)\(...)"`로 전체 문자열을 뽑고, 한글 유니코드 범위
  정규식(`[가-힣]`)으로 번역 함수 호출에 안 걸린 **날것 텍스트**가 남아있는지 재검사하는 방식으로
  누락을 찾음 — `footer.php`에 `bloginfo('name')` 뒤에 `_e()` 래핑 없이 직접 붙어있던 면책 문구 한 건을
  찾아 래핑 + 사전 등록. 배포 후 KO/EN 양쪽 curl로 렌더링 확인 완료.

## 실제 배포하면서 겪은 문제와 수정 (Cloudways 호스팅)

이 서버(`SSH_WP_PATH=/home/1555616.cloudwaysapps.com/trqundhprt/public_html`)는 일반적인 WP 호스팅과
다른 점이 있어서, VOBET 원본 코드를 그대로 가져다 쓰면 안 됐다. 전부 실제로 겪고 수정한 것들이다.

1. **wp-config.php의 상대경로 require** — `require('wp-salt.php')`가 절대경로가 아니라서, PHP 프로세스의
   실제 cwd가 WP 루트여야만 정상 동작한다. `--path=` 옵션만으로는 부족함. → 모든 `wp`/`php` 실행 시
   `ssh.execCommand(cmd, { cwd: WP_PATH })`로 cwd 명시.
2. **SFTP ↔ exec 쉘의 절대경로 기준이 다름** — SFTP 서브시스템 루트("/")가 실제로는 `dirname(WP_PATH)`
   (앱 홈 디렉터리)에 대응하는데, exec/wp-cli 쉘은 진짜 절대경로를 그대로 본다. SFTP로 `/tmp/x`에 올린
   파일이 실제로는 `<앱홈>/tmp/x`에 쓰여지고, wp-cli가 보는 `/tmp/x`는 완전히 다른(존재하지 않는)
   경로였다 — 이미지 업로드·글 저장이 전부 이 이유로 실패했었다. → `APP_HOME`/`toSftpPath()` 추가,
   모든 임시 업로드를 `wp-content/uploads/_pipeline-tmp/`(WP 설치 내부, 양쪽 경로 체계가 합의되는 곳)로
   통일.
3. **SSH 동시 채널 제한** — 태그 생성 시 `Promise.all`로 여러 wp-cli 명령을 동시에 날리다가 서버의
   동시 채널 한도를 넘겨 "Channel open failure"가 간헐적으로 발생. → 순차 처리로 변경 + 진짜 일시적
   연결 오류(channel/connection 관련 에러 메시지)일 때만 1회 재시도하는 `withSshRetry()` 추가(로직
   버그는 재시도로 덮지 않도록 에러 메시지 패턴으로만 구분).
4. **Git Bash/MSYS 환경변수 경로 변환** — Windows에서 Git Bash로 `.env`를 `source`한 뒤 `node`(네이티브
   Windows exe)를 실행하면, MSYS가 POSIX처럼 생긴 경로 값(`SSH_WP_PATH` 등)을 Windows 경로로 자동
   변환해버려서 완전히 엉뚱한 경로가 됨. → 실행 시 항상 `MSYS_NO_PATHCONV=1` 환경변수를 함께 준다.
5. **비밀번호 기반 SSH** — 담당자가 키가 아닌 비밀번호로 발급해서 SSH config 별칭을 못 씀. → `getSSH()`가
   `SSH_PRIVATE_KEY` 없으면 `SSH_PASSWORD`로 폴백, 라이브 조회용 `scripts/wp-remote.mjs` 작성.
6. **DRY_RUN 로그가 실제 원장을 오염시킨 사고(2026-09-18)** — 위 "VOBET 원본 대비 변경점" 5번 항목 참고.
   허브 페이지(T1-01)가 미발행인데 DRY_RUN 시절의 stale 로그 때문에 "이미 발행됨"으로 착각돼, 하위 글
   (T2-06)의 필수 상향링크가 실제로 존재하지 않는 URL(게다가 `/en/` 같은 잘못된 패턴)을 가리키는 채로
   라이브 발행됐었다. DRY_RUN 로그 완전 분리 + 오염 데이터 정리 + 재발행으로 해결, `resolvePageUrlSync`/
   `enPostUrl`의 DRY_RUN 전용 잘못된 `/en/` 프리픽스도 함께 제거.
7. **GitHub Actions 워크플로우가 SSH_PASSWORD를 안 넘기고 있었음(2026-09-18)** — `weekly-post.yml`의
   env 블록이 `SSH_PRIVATE_KEY`만 참조하고 있었는데, 이 서버는 애초에 키가 아니라 비밀번호 인증이라
   `SSH_PRIVATE_KEY` 시크릿 자체가 등록된 적이 없었다. `getSSH()`는 `SSH_PRIVATE_KEY`가 없으면
   `SSH_PASSWORD`로 폴백하는데, 워크플로우가 `SSH_PASSWORD`를 env로 넘기지 않아서 그 폴백 값 자체가
   없는 상태 — 즉 **스케줄이 "active"로 떠 있어도 실제 화요일 자동 실행 때 SSH 연결부터 실패했을
   상황**이었다. `gh run list`로 지금까지 실행 이력이 0건인 걸로 처음 의심을 확인했고,
   `SSH_PASSWORD: ${{ secrets.SSH_PASSWORD }}`를 env에 추가해서 수정. `vars.DRY_RUN=true`로 임시
   전환 후 `gh workflow run`으로 수동 트리거해 GitHub 러너에서 정상 동작하는지 검증함(검증 후 변수
   원복).
8. **위 DRY_RUN 검증이 실제 ClickUp 포스팅 태스크를 덮어쓴 사고(2026-09-18)** — `syncClickUpPostingTask()`
   는 `setPolylangLanguage`/`createWordPressPost`처럼 DRY_RUN 스킵 가드가 없어서, 방금 위 7번을 검증하려고
   돌린 DRY_RUN 실행이 T1-01의 실제 ClickUp 태스크(Status를 "published"→"pending", Name을 그 실행에서
   재생성된 살짝 다른 제목으로)를 덮어써버렸다. 발견 즉시 수동으로 원상복구(Status/Name)하고,
   `syncClickUpPostingTask()` 맨 앞에 `if (DRY_RUN) return` 가드를 추가해 재발을 막았다. **교훈: 안전
   검증(DRY_RUN)이라도 실제 외부 시스템(ClickUp 등)에 쓰기 작업을 하는 함수는 전부 DRY_RUN 가드가
   있는지 개별 확인해야 한다** — WordPress/Polylang 발행 계열은 원래부터 가드가 있었지만 이후에 추가된
   ClickUp 동기화는 놓쳤었다.
9. **화요일 정규 실행이 SSH 유휴 구간 미처리 'error' 이벤트로 조용히 크래시(2026-09-22)** — T2-00 발행
   시도 중 Stage3(휴머나이징) 2차 재시도 도중 Cloudways SSH 커넥션이 ECONNRESET으로 끊겼는데, 그 시점엔
   진행 중인 exec가 없어 `connection`에 걸린 에러 리스너가 하나도 없는 상태였다(node-ssh는 `connect()`
   중에만 `error` 리스너를 걸고 `ready` 즉시 떼어내며, exec 중에만 일시적으로 다시 건다). 리스너 없는
   `error` 이벤트는 Node가 프로세스를 강제 종료시키는데, 이건 **Promise rejection이 아니라 동기 throw라
   `main().catch()`도 못 잡고 실패 텔레그램도 안 나갔다** — Kevin이 ClickUp에서 발행 여부를 확인할
   방법이 없었던 원인. `getSSH()`에서 연결 직후 `connection.on('error', ...)`를 연결 수명 내내 걸어두고
   (끊기면 `_ssh`만 비워 다음 호출에서 재연결) 크래시 자체를 막았고, 추가로 `process.on('uncaughtException'
   /'unhandledRejection')` 최후 안전망을 걸어 어떤 원인으로 죽든 최소 하나의 실패 텔레그램은 반드시 나가게
   했다.
10. **위 사고 조사 중 GitHub Actions bot 커밋이 한 번도 성공한 적 없었던 것 발견(상시 버그, 2026-09-22
    확인)** — `weekly-post.yml` 마지막 스텝(`git push`)이 매 실행 `403 Permission to .../onebethub-blog.git
    denied to github-actions[bot]`로 실패 중이었다(`|| true`로 삼켜져서 잡 자체는 "success"로 표시돼
    안 보였음). `git log -- data/published-log.json`으로 대조해보니 지금까지의 커밋 전부 author가
    `onebethub-bot`이 아니라 `kevin`(수동 커밋)이었다. 리포지토리 기본 `GITHUB_TOKEN` 권한이 read-only로
    설정돼 있던 것으로 추정 — 잡 레벨에 `permissions: contents: write`를 명시해 해결. **잠재 위험**: 이
    push가 계속 실패하는 상태로 방치됐다면, 다음 주 실행이 매번 "새로 체크아웃한 stale 로그"에서 시작해
    방금 발행한 페이지를 다시 published-log에 못 남기고 넘어갔을 수 있고, 그 경우 다다음 주 실행이 같은
    페이지를 중복 발행할 위험이 있었다(다행히 지금까지는 Kevin이 매번 수동 커밋해서 실제 중복은 없었음).
11. **Gemini 검증 apiVersion 'v1' → 'v1beta', 텔레그램 알림 VOBET 형식으로 통일(2026-09-22)** — 위 SSH
    수동 재실행 검증 중 Gemini 검증이 두 모델 다 실패하는 걸 발견: `gemini-3.6-flash`는 일시적 503(과부하),
    `gemini-3.1-pro-preview`는 확정적 404였다 — ListModels로 직접 대조해보니 이 모델은 v1beta에만 존재하는데
    코드가 `apiVersion: 'v1'`로 호출하고 있었다. 이미지 생성 호출부는 이미 v1beta를 쓰고 있어서(v1beta는
    v1 슈퍼셋) `verifyWithGemini()`도 v1beta로 통일. 겸사겸사 Kevin이 VOBET 매거진 파이프라인의 텔레그램
    알림(모델별 아이콘+점수 줄바꿈, 이미지/본문/아웃바운드 요약 블록)을 보여주며 OneBetHub도 같은 형식을
    요청 — `verdictIcon()`/`scoreLabel()` 공용 헬퍼를 추가하고 발행완료/draft저장 메시지를 그 형식으로
    재작성, Stage5 재작성 라운드마다도(예전엔 최종 결과만 알림) VOBET처럼 중간 진행상황 텔레그램을
    추가했다. OneBetHub는 VOBET과 달리 검증 통과 시 바로 공개 발행하므로(VOBET은 항상 draft+사람 검수)
    "검수 필요" 문구 대신 실제 공개 URL을 그대로 유지.
12. **9번의 "재연결로 크래시는 막았다"가 실전에서 불충분했던 것으로 확인(2026-09-22, 같은 날 수동 재실행
    2회로 재현)** — 9번 배포 직후 실제 라이브 실행 2회를 돌려보니, SSH가 유휴 중 끊기는 것(Claude/GPT/
    Gemini 응답 대기로 몇 분씩 완전히 유휴) 자체는 계속 발생했고, 크래시는 확실히 안 났지만(성공), **재연결된
    세션에서는 이후 모든 wp-cli 호출이 `cd: <WP_PATH>: No such file or directory`로 실패**해 이미지 업로드와
    최종 글 저장이 전부 막혔다 — 2회 다 100% 재현. 재연결 세션 자체가 이 Cloudways 호스트에서 신뢰할 수 없는
    상태로 보여서(정확한 원인은 원격 쉘 직접 조사 없이는 확정 불가), 사후 재연결에 의존하는 대신 애초에
    끊기지 않도록 `getSSH()`의 `connect()`에 `keepaliveInterval: 15000` / `keepaliveCountMax: 10`을 추가해
    유휴 구간에도 주기적으로 살아있다는 신호를 보내게 했다. **다음 실행에서 여전히 "SSH 연결 유휴 중 오류"
    로그가 뜨면 keepalive로도 못 막은 것이니, 그때는 Cloudways 쪽 세션/방화벽 idle timeout 설정을 직접
    확인해야 한다.**

## 알려진 이슈 / 참고사항

- **Stage5 검증 모델(Claude)이 실시간 웹 접근 없이 "출처 검증 불가"를 감점 사유로 삼는 경향** — 2026-09-18
  T1-01 재발행 시 Claude가 인용된 3개 업체(루미솔루션/노드솔루션/우카솔루션)를 "부실 인증"으로 지적해
  5/10으로 FAIL(GPT 8/10·Gemini 9/10은 PASS) 처리했는데, 직접 확인해보니 전부 Serper로 찾은 실재
  업체였다(false positive). 이런 draft가 나오면 **무조건 재작성하지 말고 먼저 내용을 직접 확인**할 것 —
  실제 문제(이땐 근거 없는 "SLA 99% 이상 가동률" 통계 하나였음)만 고쳐서 수동 발행하면 된다.
- ~~Rank Math, Polylang 미설치~~ → 2026-09-18 Kevin이 WP 대시보드에서 직접 설치 완료. 테마의 폴백들은
  설계대로 자동으로 물러났음(코드 변경 불필요, `function_exists('pll_current_language')` 등으로 가드됨).
- ~~KO/EN 글이 목록에서 섞여 보이고 언어 전환 버튼이 없던 문제~~ → 2026-09-19 해결(위 "KO/EN 언어 분리 +
  전환 버튼" 절 참고). ~~테마 고정 UI 문구가 EN 뷰에서도 한국어로 보이던 문제~~ → 2026-09-18 해결(위
  "정적 UI 텍스트 영문화" 절 참고).
- **Polylang 실제 설치 후 URL 구조 변경(2026-09-18)** — Polylang 활성화 전엔 EN 글 URL이
  `onebethub.com/{ko슬러그}-en/`(접두 디렉터리 없음)였는데, Polylang의 기본 URL 모디피케이션 방식(디렉터리)
  때문에 실제로는 `onebethub.com/en/{ko슬러그}-en/`으로 바뀌었다(ko는 기본 언어라 접두 없이 그대로).
  기존에 발행된 URL은 301 리다이렉트되어 안 깨지지만, 파이프라인이 URL을 스스로 만들던 두 지점을
  고쳤다: ① `createWordPressPost()` 이후 KO/EN 각각 `setPolylangLanguage()`(이미 있던 함수, 이번에
  처음 실제로 작동 확인)를 **`get_permalink()` 조회보다 먼저** 호출하도록 순서를 바꿈 — 언어 지정 전에
  permalink부터 물어보면 아직 접두 없는 옛 URL이 반환돼 원장(`published-log.json`)에 틀린 값이 박히는
  버그가 있었음. ② `resolvePageUrlSync()`의 DRY_RUN 분기도 en에 `/en/` 접두를 다시 붙이도록 수정(이전
  세션에서는 반대로 "접두 없음이 정답"이라 제거했던 로직인데, Polylang이 실제로 켜지면서 상황이
  뒤집힘 — 코드 히스토리 볼 때 헷갈리지 않도록 주석에 양쪽 사정을 다 남겨둠). 기존 `published-log.json`의
  EN 두 건도 새 canonical URL로 갱신. 신규 발행 글의 KO↔EN Polylang 번역쌍 연결은 `linkPolylangTranslations()`
  가 그대로 처리(기존 코드, 이번에 처음 실제 Polylang 대상으로 검증됨). 이미 발행돼 있던 2쌍(T1-01,
  T2-06 = post ID 11/13/20/22)은 Polylang 설치 마법사가 전부 'ko'로 일괄 배정해버려서 `pll_set_post_language()`
  /`pll_save_post_translations()`로 수동 재지정·연결함(일회성 스크립트, 완료 후 삭제).
- Gemini API 무료 티어 쿼터가 자주 소진돼 이미지 생성·3중 검증 중 Gemini 쪽이 종종 실패한다 — Pexels/
  브랜드 이미지 폴백과 Claude+GPT 2개 모델 검증으로 자동 대체되므로 파이프라인 자체는 죽지 않는다.
- 저자 페르소나 미정(`AUTHOR_ONEBETHUB` 미설정 → 첫 admin 계정 이름으로 표시 중, E-E-A-T 개선 여지).
- 허브 하향링크 업데이트(`appendHubDownlinksLive`)는 라이브 모드에서 본문 끝에 마커 주석과 함께 링크
  블록을 추가하는 방식으로 구현했다. JSON-LD/메타를 함께 재생성하지는 않는다.
- GitHub Actions 워크플로우는 실행 후 `data/published-log.json` 변경분을 자동 커밋한다(러너가 매번
  새로 뜨는 휘발성 환경이라, 로컬 원장을 리포지토리에 영속시켜야 다음 실행에서 중복 체크가 유효하다).
- **미해결 (2026-09-18 `/seo검수` 재점검에서 발견, 아직 수정 안 함)**:
  - EN 개별 글 페이지(`/en/{slug}-en/`)에서 정적 UI 텍스트가 같은 페이지 안에서 한/영 혼재로 나타남
    (예: "카테고리"와 "Category"가 한 페이지에 동시 존재). `onebethub_current_view_lang()`
    (`pll_current_language()` 우선 호출)이 한 요청 안에서 값이 불안정한 것으로 추정 — single.php의
    "관련 리포트" 보조 WP_Query가 원인일 가능성이 높으나 미확정. 홈페이지(`front-page.php`)에서는
    문제없이 확인됨 — 개별 글 템플릿에서만 재현.
  - Rank Math가 페이지마다 자체 JSON-LD 스키마(`class="rank-math-schema"`, author=Person "Developer")를
    자동 생성해서, 파이프라인이 직접 주입하는 BlogPosting(author=Organization "OneBetHub")과 중복·
    상충한다. WP 관리자 → Rank Math → Titles & Meta → Posts → Schema Type을 "None"으로 바꾸면 해결(코드
    변경 불필요).
  - T2-06(비전환 페이지, CTA 역할분기 이전인 2026-09-17 발행)에 아직 구버전 직접 7play.co CTA가 남아있음
    — 역할분기 로직 자체는 이후 정상 작동하나 과거 발행물엔 소급 적용 안 됨. 수동 교체 권장.

## ClickUp 연동 — 로드맵 vs 포스팅 추적 (2026-09-18)

Kevin의 A.M 스페이스 `B2B SEO PROJECT - KEVIN` 폴더 안에 목적이 다른 리스트 두 개를 각각 채웠다 —
처음엔 이 둘을 헷갈려서 22페이지 발행 목록을 "로드맵"에 넣었다가, "로드맵은 블로그를 구축하고 발행을
시작한 과정 자체의 마일스톤이어야 하고, 실제 개별 글 발행 추적은 포스팅 리스트가 따로 있다"는 정정을
받고 다시 나눴다:

- **"📅 로드맵"** (https://app.clickup.com/9008183571/v/l/li/901821678683) — 프로젝트 진행 단계 11개
  마일스톤(파이프라인 구축 → 테마 배포 → 첫 발행 → 품질 보정 → SEO 플러그인 설치 → btag 연동 →
  잔여 이슈 보정 → 주간 자동발행 가동 → Kevin 배정 키워드 완료 → 22페이지 전체 완료). "블로그 제작은
  끝났지만 발행은 시작 전이었던" 2026-09-16~18 시점부터 지금까지 실제로 겪은 과정을 그대로 기록하고,
  아직 안 끝난 것(잔여 품질 이슈 보정, 향후 발행 단계)은 planned/pending review로 남겨뒀다.
- **"✍️ 포스팅"** (https://app.clickup.com/9008183571/v/l/li/901821678685) — 22페이지 각각을 개별
  태스크로 등록해 실제 발행 여부를 추적한다. `sortedPages()`와 동일한 정렬 기준(클러스터 고정 순서 →
  T1 우선 → week 오름차순)으로 발행 순번을 매겼고, 이미 발행된 2건(T1-01·T2-06)은 status=published,
  나머지 20건은 status=to do + GitHub Actions 주간 cron(매주 화요일) 기준 예상 발행일을 due_date로
  채웠다.

포스팅 리스트의 10페이지(T1-02·T1-03·T1-04·T1-05·T2-01·T2-02·T2-03·T2-05·T2-09·T2-10)는 ClickUp의
별도 통합 스페이스 "New_7PLAY"(Kevin이 절대 직접 건드리면 안 되는 공유 스페이스 — A.M 스페이스에서
태스크를 만들면 자동화로 그쪽에 미러링되는 구조)에서 Kevin에게 개별 배정되고 btag까지 이미 발급된
키워드와 정확히 1:1로 매칭됐다(예: B-45 "카지노 솔루션 분양" = T1-02). 각 태스크 설명에 해당 btag
URL을 적어뒀고, `keyword-map.json`의 `page.btag` 필드에도 반영해 파이프라인이 발행 시 자동으로 그
btag를 CTA로 쓴다(위 "CTA — 개별 btag 우선순위" 절 참고).

### 포스팅 리스트 실시간 동기화 (`syncClickUpPostingTask()`, 2026-09-18)

처음엔 22개 태스크를 전부 수동으로 만들고 끝냈는데, Kevin이 "글이 실제로 발행되면 Name(제목)·Status·
Post url이 자동으로 채워져야 하고, 검수 단계에서 제목이 바뀌면 그것도 반영돼야 한다"고 요청해서
`generate-post.mjs`에 실시간 동기화를 추가했다:

- `keyword-map.json`의 22페이지 전부 `page.clickupTaskId`(위에서 만든 포스팅 리스트 태스크 ID)를
  미리 채워뒀다. **새 페이지를 keyword-map.json에 추가할 땐 포스팅 리스트에 태스크를 먼저 만들고
  그 ID를 `clickupTaskId`로 반드시 채울 것** — 안 채우면 매 실행마다 새 태스크가 중복 생성된다(안전망
  fallback 경로, 아래 참고).
- KO 글이 WordPress에 저장된 직후(`createWordPressPost` 이후, Stage5 재작성까지 전부 끝나 제목이
  최종 확정된 시점) `syncClickUpPostingTask(page, post.title, koPostUrl, focusKeyword, postStatus)`를
  호출한다. `page.clickupTaskId`가 있으면:
  - `PUT /api/v2/task/{id}` — Name=최종 제목, Status=`postStatus==='publish' ? 'published' : 'pending'`.
  - 커스텀 필드(Website/Keyword/Post url/Btag)는 ClickUp API 특성상 일반 update에 못 묶고 필드별로
    `POST /api/v2/task/{id}/field/{fieldId}`를 따로 호출해야 한다 — Website=`WP_URL`, Keyword=
    `keywordLabel`(아래 참고), Post url=KO 발행 URL(EN은 별도 필드 없어 추적 안 함, 페이지 단위 1행
    설계), Btag=`page.btag`(있는 페이지만).
  - `page.clickupTaskId`가 없으면 새 태스크를 생성만 하고(안전망), 콘솔에 "keyword-map.json에
    clickupTaskId 추가 필요"를 경고로 남긴다.
- **Keyword 필드 코드 접두어(2026-09-18)** — New_7PLAY 통합 스페이스의 "키워드 70개" 트래커와 나중에
  대조하기 쉽도록, 그 트래커의 코드가 확인된 10개 페이지는 `page.clickupCode`(예: `"B-45"`)를
  `keyword-map.json`에 저장해뒀고 `keywordLabel = page.clickupCode ? \`${page.clickupCode}. ${keyword}\`
  : keyword`로 "B-45. 카지노 솔루션 분양" 형태를 만들어 Keyword 필드에 넣는다. 코드가 없는 나머지
  12페이지는 키워드만 그대로 들어간다.
- **due_date 자동 갱신(2026-09-18)** — 22개 태스크에 처음 적어둔 due_date는 "매주 화요일 1개씩
  나온다"고 가정한 예상치일 뿐, 실제 발행을 트리거하지도 실제 발행일과 자동으로 맞춰지지도 않는다는
  걸 Kevin에게 명확히 하고, 실제 발행 시점에 반영되도록 개선했다: `postStatus === 'publish'`일 때만
  (draft면 아직 발행된 게 아니므로 건드리지 않음) `PUT` 바디에 `due_date: Date.now()`를 같이 실어
  보내 "오늘 실제로 발행됨"으로 갱신한다. 실제 발행 트리거 자체는 여전히 GitHub Actions 주간 cron +
  `sortedPages()`의 고정 순서이고, ClickUp의 이 필드는 순전히 기록용이다.
- 필요 env: `CLICKUP_API_KEY`(ClickUp 개인 API 토큰), `CLICKUP_LIST_ID`(포스팅 리스트 ID
  `901821678685`). 둘 다 `.env`와 GitHub Actions secret에 등록 완료(2026-09-18, 실제 API 호출로
  인증·업데이트 둘 다 동작 확인됨). 둘 중 하나라도 없으면 함수가 조용히 스킵(콘솔 경고만 남김,
  파이프라인 자체는 안 죽음).
- 제목이 Stage5에서 재작성돼도 이 호출은 그 이후에 일어나므로 최종 제목이 자동으로 반영된다. 다만
  **발행 후 사람이 WordPress에서 직접 제목을 수정하는 경우**는 별도 동기화 로직이 없어 ClickUp에
  반영 안 됨(웹훅/폴링이 필요한 별개 기능 — 필요하면 추후 추가).

## 발행 전/후 검증 강화 — "무인 실행판 `/seo검수`" (2026-09-18)

Kevin이 "발행하기 전에 `/seo검수`를 돌려보고 문제 있으면 고치고, 발행 못 할 정도면 발행하지 말고
물어봐달라"고 요청했다. **중요한 제약**: `/seo검수`는 Claude Code 스킬(Claude가 직접 읽고 그 지침대로
행동하는 마크다운 지시문 + Gemini CLI 교차검수 + 대화형 판단)이라, GitHub Actions에서 도는 무인
Node 스크립트가 "스킬을 실행"할 방법이 없다(호출 가능한 API가 아니라 에이전트에게 주는 지침이기
때문). 그래서 다음처럼 실질적으로 같은 효과를 내는 걸로 나눠서 구현했다:

- **"문제 있으면 고치고"** → 이미 있던 기능이었다: Stage 4(규칙 11항목) 실패 시 `MAX_RETRIES`까지
  재작성, Stage 5(Claude/GPT-4o-mini/Gemini 3중 검증) 실패 시 `MAX_AI_REVISIONS`(2회)까지 피드백
  반영 재작성. 새로 한 일은 없음 — 원래 구조가 이미 이 요구를 만족하고 있었다.
- **"발행 못 할 정도면 발행하지 말고"** → 이것도 이미 있었다: 재작성 다 해봐도 3모델 전부 PASS
  못 하면 `postStatus = 'draft'`로 WordPress에 비공개 저장(발행 안 됨).
- **"물어보고"** → **여기가 실제로 부족했던 부분**. 기존엔 draft로 빠져도 텔레그램 메시지가 성공
  케이스와 똑같이 "✅ 완료"로 시작해서 문제가 있었는지 한눈에 안 보였다. 지금은 `postStatus`에 따라
  완전히 다른 메시지를 보낸다:
  - 발행 성공: `✅ 새 글 발행 완료` (기존과 동일한 형식)
  - draft 보류: `🚨 검증 미통과 — 자동 발행 보류(draft)` + Claude/GPT/Gemini 각각의 점수·verdict·
    구체적 issues 전문 + Stage4 미해결 항목 + WP 관리자 draft 편집 링크. 무인 cron이라 실시간으로
    "물어보고 대답 기다리기"는 못 하지만, 사람이 확인해서 직접 발행해야만 실제로 라이브가 되는
    구조라 실질적으로는 "물어보고" 조건을 만족한다.
- **발행 후 라이브 점검(신규, `postPublishSanityCheck()`)** — Stage4는 아직 WordPress에 올라가기
  전의 마크다운만 보므로, **테마/플러그인 렌더링 단계에서만 생기는 문제**(2026-09-18에 실제로 겪은
  Rank Math 스키마 중복, Polylang 활성화 후 EN 페이지 언어 혼재 같은 것들)를 못 잡는다.
  `/seo검수`가 라이브 URL에 대해 확인하는 항목 중 **curl만으로 결정적으로 검증 가능한 것만** 골라
  발행 직후 자동 실행: meta description 존재, canonical self-reference, hreflang 존재(EN 있을 때),
  CTA 링크가 실제 렌더링에 있는지, 상향링크 대상 실제 200인지, 대표이미지 실제 200인지. 문제
  발견 시 **발행을 되돌리지 않고**(이미 라이브인 걸 자동으로 되돌리는 게 더 위험할 수 있어서) 별도
  `⚠️ 발행 후 라이브 점검에서 이상 발견` 텔레그램 알림만 보낸다.
- `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` 등록 완료(2026-09-18, `.env` + GitHub Actions secret 둘 다,
  실제 발송 테스트로 확인됨). **VOBET 파이프라인과 같은 봇을 공유**하기로 해서(Kevin이 신규 발급 대신
  재사용 선택), `tg()` 함수 자체가 모든 메시지 맨 앞에 `🟦 [원벳허브 블로그]` 라벨을 무조건 붙인다 —
  개별 호출부마다 챙길 필요 없이 한 곳에서 보장됨. 봇 표시 이름은 여전히 "VOBET Blog Bot"으로
  뜨므로(공유 봇이라 이름은 못 바꿈), 메시지 본문의 이 라벨로만 구분 가능하다는 점 유의.
- **완전히 자동화되지 않은 부분(의도적)**: `/seo검수`의 진짜 강점(브랜드 편향·콘텐츠 믹스·E-E-A-T
  Who/How/Why 같은 정성적 판단, Gemini와의 교차검수)은 이미 Stage 5의 3모델 검증이 상당 부분
  대체하고 있어서 4번째 LLM 호출을 추가하진 않았다 — 비용 대비 효과가 낮다고 판단. 필요하면
  나중에 추가 가능.

## PUBLISHING_SCHEDULE.md — 저장소 안 발행 스케줄표 (2026-09-18)

ClickUp을 열지 않고도 VS Code에서 바로 볼 수 있게, 저장소 루트에 `PUBLISHING_SCHEDULE.md`를 둔다.
**직접 수정하지 않는 자동 생성 파일** — `scripts/generate-schedule.mjs`가 `keyword-map.json` +
`data/published-log.json`에서 매번 다시 계산해서 통째로 새로 쓴다. 표 구성은 ClickUp "포스팅" 리스트와
동일: 순번, 클러스터/티어, ID, 제목, 상태(✅ 발행완료/⏳ 예정), 날짜, 담당(Kevin 배정 키워드는
⭐ 표시), Btag 코드, 발행 URL.

- `generate-post.mjs`의 `main()` 끝에서 **실발행(`!DRY_RUN`)일 때만** `regenerateSchedule()`을 호출해
  자동 갱신한다(ClickUp 동기화와 같은 이유로 DRY_RUN 가드 필수 — DRY_RUN 로그로 계산하면 파일이 테스트
  데이터로 오염됨). GitHub Actions의 "Commit updated published-log.json and schedule" 스텝이
  `PUBLISHING_SCHEDULE.md`도 함께 커밋·푸시하므로, 매주 화요일 자동 실행 후 저절로 최신화된다.
- 수동 재생성: `node scripts/generate-schedule.mjs`.
- "예정" 행의 날짜는 매주 화요일 1페이지씩 나온다고 가정한 추정치일 뿐 실제 발행을 트리거하지 않는다
  (ClickUp due date와 동일한 성격 — 위 "ClickUp 연동" 절 참고). 발행완료 행의 날짜는
  `published-log.json`의 실제 `publishedAt`을 그대로 쓴다.

## 검수

`/seo검수` 슬래시 커맨드(`~/.claude/commands/seo검수.md`)에 VOBET Magazine·Sports News Blog와 나란히
OneBetHub 전용 섹션(C)이 있다 — 이 파이프라인의 실제 규칙(콘텐츠 믹스, CTA 분기, 상향링크, 트레이스
메타키 등)을 반영해서 발행된 글을 검수한다.

## 문서 동기화 훅

`scripts/generate-post.mjs`를 Edit/Write로 수정하면, Claude Code의 PostToolUse 훅이 "이 문서와
Drive 문서(`[BD][M2-개발] OneBetHub 콘텐츠 자동화 파이프라인_v1.0`)를 같이 갱신하라"는 리마인더를
자동으로 띄운다. **훅 설정은 이 저장소 안이 아니라 `C:\project\7play-seo\.claude\settings.json`
(프로젝트 루트)에 있다** — onebethub-blog는 7play-seo 하위 폴더라서, 실제 세션이 열리는 루트
기준으로 등록해야 작동한다. 훅 스크립트: `C:\project\7play-seo\.claude\hooks\check-pipeline-doc.mjs`.
