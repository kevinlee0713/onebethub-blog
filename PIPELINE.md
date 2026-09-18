# OneBetHub 블로그 파이프라인 v1.0

> **원본**: VOBET 매거진 블로그 파이프라인 v2.0 (`VOBET/blog-project/scripts/generate-post.mjs`, 읽기 전용 참고)
> **현재 스택**: WordPress (Cloudways) + GitHub Actions + Claude/GPT-4o-mini/Gemini + (Polylang/Rank Math는 아직 미설치)
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

4. **CTA — 텔레그램 초대링크 → 역할 기반 분기(2026-09-18 개편)** — 처음엔 원본 CTA
   (`TELEGRAM_INVITE_LINK`)를 제거하고 클러스터별 `CTA_URL_MAP`(전부 plain `https://7play.co/`)로
   단순 교체했었는데, 이러면 **콘텐츠 믹스와 무관하게 모든 글이 예외 없이 같은 외부 링크로 귀결**돼서
   도어웨이 페이지 스팸 패턴으로 읽힐 위험이 있었다(`/seo검수`로 첫 실발행 글 검수 중 발견, Claude·
   Gemini 교차검수 양쪽 다 동일 지적). 지금은 `isConversionPage(page)`(role에 "전환" 포함 — 클러스터당
   1개, keyword-map.json에 이미 이렇게 설계돼 있었음)로 분기한다:
   - **전환 페이지**(임대=T1-01, 분양=T1-02, 제작=T1-03, 가격=T1-04, 토토개발=T1-05): `CTA_URL_MAP
     [cluster]`로 7Play 직접 연결 (btag 미발급 상태라 지금은 plain URL — 7번 항목 참고).
   - **그 외 지원/허브 페이지**: `resolveCtaUrl()`이 같은 클러스터의 전환 페이지로 가는 내부 링크를
     해석해서 CTA로 사용(그 전환 페이지가 아직 미발행이면 임시로 7Play 직접 링크 폴백).
   - Stage 4 게이트 10번 항목(CTA 존재 확인)도 이 분기를 반영 — 전환 페이지는 `7play.co` 문자열,
     그 외는 `ctaUrl`(내부 링크) 문자열 포함 여부로 검사(KO/EN 둘 다).

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
| 10 | CTA 섹션 | 전환 페이지는 `7play.co`, 그 외는 내부 전환 링크(`ctaUrl`) 포함 |
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

## 알려진 이슈 / 참고사항

- **Stage5 검증 모델(Claude)이 실시간 웹 접근 없이 "출처 검증 불가"를 감점 사유로 삼는 경향** — 2026-09-18
  T1-01 재발행 시 Claude가 인용된 3개 업체(루미솔루션/노드솔루션/우카솔루션)를 "부실 인증"으로 지적해
  5/10으로 FAIL(GPT 8/10·Gemini 9/10은 PASS) 처리했는데, 직접 확인해보니 전부 Serper로 찾은 실재
  업체였다(false positive). 이런 draft가 나오면 **무조건 재작성하지 말고 먼저 내용을 직접 확인**할 것 —
  실제 문제(이땐 근거 없는 "SLA 99% 이상 가동률" 통계 하나였음)만 고쳐서 수동 발행하면 된다.
- Rank Math, Polylang 미설치 — Kevin이 WP 대시보드에서 직접 설치 예정. 설치되면 테마의 폴백들은 자동으로
  물러난다(코드 변경 불필요).
- Gemini API 무료 티어 쿼터가 자주 소진돼 이미지 생성·3중 검증 중 Gemini 쪽이 종종 실패한다 — Pexels/
  브랜드 이미지 폴백과 Claude+GPT 2개 모델 검증으로 자동 대체되므로 파이프라인 자체는 죽지 않는다.
- 저자 페르소나 미정(`AUTHOR_ONEBETHUB` 미설정 → 첫 admin 계정 이름으로 표시 중, E-E-A-T 개선 여지).
- 허브 하향링크 업데이트(`appendHubDownlinksLive`)는 라이브 모드에서 본문 끝에 마커 주석과 함께 링크
  블록을 추가하는 방식으로 구현했다. JSON-LD/메타를 함께 재생성하지는 않는다.
- GitHub Actions 워크플로우는 실행 후 `data/published-log.json` 변경분을 자동 커밋한다(러너가 매번
  새로 뜨는 휘발성 환경이라, 로컬 원장을 리포지토리에 영속시켜야 다음 실행에서 중복 체크가 유효하다).

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
