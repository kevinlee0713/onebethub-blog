/**
 * OneBetHub 블로그 자동 포스트 생성 파이프라인 v1.0
 * (VOBET 매거진 블로그 파이프라인에서 추출·재사용 — 로직은 그대로, 브랜드/토픽/CTA/게이트만 onebethub 전용으로 개조)
 *
 * 원본: VOBET/blog-project/scripts/generate-post.mjs (읽기 전용 참고, 절대 미수정)
 * 재사용: SSH/WP-CLI 유틸, 이미지 3단 폴백, SEO 게이트 골격, 3중 검증(Claude-haiku/GPT-4o-mini/Gemini),
 *         Stage2/3 Claude 프롬프트 구조, Polylang/RankMath 연동, ClickUp 태스크 생성, 텔레그램 알림.
 * 신규(원본에 없음): 고정 22페이지 키워드맵 + 내부링크 매핑표 기반 Stage1(카테고리 로테이션 대신 클러스터
 *         완결 순서 고정), 상향링크 SEO 게이트 항목, 클러스터 완결 후 허브 하향링크 업데이트 스텝, DRY_RUN 모드,
 *         로컬 발행 원장(data/published-log.json), CTA_URL_MAP 상수화.
 *
 * [Stage 1] 토픽 선택       — 클러스터 순서 고정(임대→분양→제작→가격→토토개발) 로테이션, 로컬 원장+WP 대조로 중복 스킵
 * [Serper]  아웃바운드 링크  — Google 검색으로 실제 출처 URL 확보
 * [Stage 2] 콘텐츠 생성     — Claude: SEO + GEO 최적화 초안 (JSON-LD 포함, 2,500~3,500자)
 * [Stage 3] 휴머나이징      — Claude: AI 티 제거 + 키워드 밀도 유지
 * [Stage 4] SEO 품질 게이트 — 규칙 기반 자동 검사 (11항목: 원본 10항목 + 상향링크 존재 여부)
 * [Stage 5] 멀티모델 검증   — Claude-haiku + GPT-4o-mini + Gemini (최대 2회 재작성 + 재검증 루프)
 * [이미지]  헤더/본문 — Gemini AI 생성 우선, 실패 시 Pexels, 최후 브랜드 자체제작 이미지 + 로고
 * [번역]    영문 동시 발행  — Claude 번역 후 EN Draft 별도 저장
 * [하향링크] 클러스터 완결(하위 페이지 전부 발행) 감지 시 허브 글에 하향링크 일괄 업데이트
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { marked } from 'marked'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { NodeSSH } from 'node-ssh'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEYWORD_MAP_FILE = path.join(__dirname, 'keyword-map.json')
const LINK_MAP_FILE = path.join(__dirname, 'link-map.json')
const DATA_DIR = path.join(__dirname, '..', 'data')
const DRY_RUN_OUTPUT_DIR = path.join(DATA_DIR, 'dry-run-output')

const DRY_RUN = (process.env.DRY_RUN ?? '').toLowerCase() === 'true'

// DRY_RUN은 반드시 별도 파일에 기록한다 — 예전엔 DRY_RUN도 실제 published-log.json에 draft 항목을
// 남겨서, 그 뒤 실제(non-DRY_RUN) 실행의 pickPage()/resolvePageUrlSync()가 "이미 발행됨"으로 착각하고
// 실제로는 존재하지 않는 허브 페이지 URL(DRY_RUN 전용 `/en/` 프리픽스 포함)을 상향/내부 링크로 삽입하는
// 사고가 있었다(2026-09-18 발견·수정). DRY_RUN 로그는 실제 발행 판단에 절대 영향을 주면 안 된다.
const PUBLISHED_LOG_FILE = DRY_RUN
  ? path.join(DRY_RUN_OUTPUT_DIR, 'published-log.json')
  : path.join(DATA_DIR, 'published-log.json')

// OpenAI SDK는 apiKey가 비어 있으면 생성자에서 즉시 throw한다(Anthropic/Gemini SDK는 그렇지 않음).
// OPENAI_API_KEY/GEMINI_API_KEY는 원래 선택 사항(없으면 해당 검증만 skip)이므로, 미설정 시 더미 값으로
// 생성해 모듈 로드 자체는 항상 성공시키고 실제 실패는 각 API 호출부의 try/catch(skipped 처리)에 맡긴다.
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-not-configured' })
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'not-configured')

const WP_URL  = (process.env.WORDPRESS_URL ?? (DRY_RUN ? 'https://onebethub.com' : '')).replace(/\/$/, '')
const WP_PATH = process.env.SSH_WP_PATH ?? '/home/1555616.cloudwaysapps.com/trqundhprt/public_html'

// 이 Cloudways 서버는 SFTP 서브시스템과 exec/wp-cli 쉘이 서로 다른 절대경로 기준을 본다(경험적으로 확인,
// diag-ssh-path.mjs로 검증 — SFTP putFile('/tmp/x')는 실제로는 APP_HOME + '/tmp/x'에 쓰여지는데
// exec 쉘의 '/tmp/x'는 진짜 시스템 /tmp이므로 서로 다른 파일을 가리킴). WP_PATH가 APP_HOME/public_html이라는
// 것도 확인됐으므로, WP_PATH 부모 디렉터리를 APP_HOME(= SFTP 루트 "/"가 실제 대응하는 절대경로)으로 삼는다.
const APP_HOME = path.posix.dirname(WP_PATH)
// wp-cli/eval-file 등 exec 쉘에서 사용할 절대경로는 항상 이 디렉터리를 기준으로 한다(WP 설치 안쪽이라
// 이미 쓰기 권한이 보장되고, /tmp보다 SFTP↔exec 오프셋 버그에 안전하다).
const STAGING_DIR = path.posix.join(WP_PATH, 'wp-content', 'uploads', '_pipeline-tmp')

// exec 쉘 기준 절대경로 → 이 서버의 SFTP 서브시스템이 이해하는 경로로 변환.
// (SFTP 루트 "/" == APP_HOME 이므로, APP_HOME 기준 상대경로 앞에 '/'를 붙이면 된다.)
function toSftpPath(execAbsolutePath) {
  const rel = path.posix.relative(APP_HOME, execAbsolutePath)
  if (rel.startsWith('..')) {
    throw new Error(`toSftpPath: "${execAbsolutePath}"가 APP_HOME("${APP_HOME}") 하위 경로가 아니라 SFTP 오프셋을 적용할 수 없음`)
  }
  return '/' + rel.split(path.sep).join('/')
}

const PASS_SCORE = 7       // 이 점수 이상이면 통과
const MAX_RETRIES = 2      // SEO 게이트 재시도 최대 횟수
const MAX_AI_REVISIONS = 2 // 멀티모델 검증 후 재작성 최대 횟수

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID

// 클러스터 순서 고정 — 임대(도입) → 분양 → 제작 → 가격 → 토토개발. Stage 1이 이 순서를 강제한다.
const CLUSTER_ORDER = ['임대', '분양', '제작', '가격', '토토개발']
const EN_CLUSTER_MAP = { '임대': 'Lease', '분양': 'Distribution', '제작': 'Development', '가격': 'Pricing', '토토개발': 'Toto Development' }

// CTA — 원본은 텔레그램 초대링크였으나, onebethub는 7play.co 랜딩으로 연결한다.
// btag(발급 담당: "찬")이 아직 미발급 상태(2026-09-16 기준 보류)이므로 지금은 전부 plain URL.
// btag이 확정되면 이 상수의 값만 `https://7play.co/?btag=kv-onebethub-{lease|dist|build|price|toto}` 형태로 교체하면 된다.
const CTA_URL_MAP = {
  '임대': 'https://7play.co/',
  '분양': 'https://7play.co/',
  '제작': 'https://7play.co/',
  '가격': 'https://7play.co/',
  '토토개발': 'https://7play.co/',
}

// 카테고리별 작성자(원본: AUTHOR_CRYPTO/SPORTS/LIFESTYLE 3명) 대신 onebethub는 저자 페르소나가
// 아직 미정이라 단일 WordPress username 환경변수 하나만 쓴다. 미설정 시 첫 번째 admin으로 폴백(원본 로직 유지).
const AUTHOR_LOGIN = process.env.AUTHOR_ONEBETHUB ?? null

// SEO <title>은 60자 이내 권장 — 초과 시 단어 경계에서 자름 (Ahrefs "Title too long" 방지)
const SEO_TITLE_MAX = 60
function seoTitle(title) {
  const t = (title ?? '').trim()
  if (t.length <= SEO_TITLE_MAX) return t
  const cut = t.slice(0, SEO_TITLE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  let out = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()
  out = out.replace(/[\s:;,\-–—]+$/, '').trim()
  const lastColon = out.lastIndexOf(':')
  if (lastColon > 30 && out.slice(lastColon + 1).trim().split(/\s+/).length <= 3) {
    out = out.slice(0, lastColon).trim()
  }
  while (/\s(the|a|an|and|or|of|for|to|with|in|on|by)$/i.test(out)) {
    out = out.replace(/\s+\S+$/, '').replace(/[\s:;,\-–—]+$/, '').trim()
  }
  return out
}

// 메타 설명 100~160자 하드 한도 (목표 120~155자) — 저장 직전 결정적 안전망
const SEO_DESC_MAX = 155
const SEO_DESC_HARD_MAX = 160
const SEO_DESC_HARD_MIN = 100
function seoDescription(desc) {
  const d = (desc ?? '').trim().replace(/\s+/g, ' ')
  if (d.length <= SEO_DESC_HARD_MAX) return d
  const window = d.slice(0, SEO_DESC_MAX)
  const lastSentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('다. '), window.lastIndexOf('요. '))
  if (lastSentence > 80) return window.slice(0, lastSentence + 1).trim()
  const lastSpace = window.lastIndexOf(' ')
  let out = (lastSpace > 80 ? window.slice(0, lastSpace) : window).trim()
  out = out.replace(/[\s:;,\-–—]+$/, '').trim()
  while (/\s(the|a|an|and|or|of|for|to|with|in|on|by)$/i.test(out)) {
    out = out.replace(/\s+\S+$/, '').replace(/[\s:;,\-–—]+$/, '').trim()
  }
  return out
}

async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' }),
    })
  } catch { /* 알림 실패는 파이프라인 중단 안 함 */ }
}

// ── 로컬 발행 원장 (data/published-log.json) ────────────────────
// WordPress/SSH가 아직 준비되지 않은 상태에서도(DRY_RUN) 중복 발행을 막기 위한 원장.
// 라이브 모드에서는 원본처럼 `wp post list` 대조도 함께 수행한다(이중 체크).
// 항목 형태(최소): { id, publishedAt, lang } — 실제 URL 재구성을 위해 title/slug/url도 함께 남긴다.
function loadPublishedLog() {
  try {
    if (!fs.existsSync(PUBLISHED_LOG_FILE)) return []
    return JSON.parse(fs.readFileSync(PUBLISHED_LOG_FILE, 'utf-8'))
  } catch (e) {
    console.log(`  ⚠ 발행 원장 로드 실패: ${e.message} — 빈 원장으로 시작`)
    return []
  }
}

function appendPublishedLog(entry) {
  const log = loadPublishedLog()
  log.push(entry)
  fs.mkdirSync(path.dirname(PUBLISHED_LOG_FILE), { recursive: true })
  fs.writeFileSync(PUBLISHED_LOG_FILE, JSON.stringify(log, null, 2) + '\n', 'utf-8')
  return log
}

function isLoggedPublished(log, id, lang) {
  return log.some(e => e.id === id && e.lang === lang)
}

// ── SSH / WP-CLI (DRY_RUN에서는 전부 우회) ──────────────────────

let _ssh = null

async function getSSH() {
  if (_ssh) return _ssh
  _ssh = new NodeSSH()
  const auth = process.env.SSH_PRIVATE_KEY
    ? { privateKey: process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n') }
    : { password: process.env.SSH_PASSWORD }
  await _ssh.connect({
    host: process.env.SSH_HOST,
    username: process.env.SSH_USER,
    port: parseInt(process.env.SSH_PORT ?? '22'),
    readyTimeout: 30000,
    hostVerifier: () => true,
    ...auth,
  })
  return _ssh
}

async function sshClose() {
  if (_ssh) { _ssh.dispose(); _ssh = null }
}

// ── 전송 계층 일시 오류(채널 고갈 등) 재시도 ─────────────────────
// 실제 라이브 실행에서 "(SSH) Channel open failure: open failed"가 관측됐다. 원인은 경로 불일치가
// 아니라(경로 문제는 wp-cli가 "File doesn't exist" 같은 논리적 오류 메시지를 stdout/stderr로 반환하는
// 형태로 나타남), 하나의 SSH 연결(_ssh 싱글턴) 위에서 동시에 여러 채널(exec/sftp)을 한꺼번에 여는
// 지점(예: Promise.all로 태그마다 wp-cli를 동시 호출)이 이 제한적인 Cloudways 게이트웨이의 동시 채널
// 한도를 넘겨서 발생하는 것으로 확인됐다(아래 태그 처리 Promise.all → 순차 처리로 수정, 이 재시도는
// 그래도 남아있을 수 있는 일시적 채널/연결 오류에 대한 최소한의 안전망).
function isTransientSshChannelError(err) {
  const msg = String(err?.message || err || '')
  return /channel open failure/i.test(msg) ||
    /\bnot connected\b/i.test(msg) ||
    /ECONNRESET|EPIPE|ETIMEDOUT/i.test(msg)
}

async function withSshRetry(fn, label, maxAttempts = 2) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (attempt < maxAttempts && isTransientSshChannelError(e)) {
        console.log(`  ⚠ SSH 전송 오류 감지(${label}) — 연결 재생성 후 재시도: ${e.message}`)
        await sshClose()
        continue
      }
      throw e
    }
  }
  throw lastErr
}

async function wpCli(args) {
  return withSshRetry(async () => {
    const ssh = await getSSH()
    const result = await ssh.execCommand(`wp ${args} --path="${WP_PATH}"`, { cwd: WP_PATH })
    if (result.code !== 0 && !result.stdout.trim()) {
      throw new Error(`WP-CLI(${result.code}): ${result.stderr || 'no output'}`)
    }
    return result.stdout.trim()
  }, `wpCli`)
}

// remotePath는 항상 exec/wp-cli 기준 절대경로(예: STAGING_DIR 하위)로 전달한다. SFTP 전송 시에만
// toSftpPath()로 이 서버의 SFTP↔exec 오프셋을 보정한다 — 호출부는 오프셋을 몰라도 된다.
let _stagingDirReady = null
async function ensureStagingDir() {
  if (_stagingDirReady) return _stagingDirReady
  _stagingDirReady = withSshRetry(async () => {
    const ssh = await getSSH()
    await ssh.execCommand(`mkdir -p "${STAGING_DIR}"`, { cwd: WP_PATH })
    // wp-content/uploads 하위라 웹에서 직접 접근 가능할 수 있으므로, PHP가 실행되지 않도록 최소 보호막.
    await ssh.execCommand(
      `[ -f "${STAGING_DIR}/.htaccess" ] || printf 'Deny from all\\n' > "${STAGING_DIR}/.htaccess"; ` +
      `[ -f "${STAGING_DIR}/index.php" ] || printf '<?php // silence is golden\\n' > "${STAGING_DIR}/index.php"`,
      { cwd: WP_PATH }
    )
  }, `ensureStagingDir`).catch(e => { _stagingDirReady = null; throw e })
  return _stagingDirReady
}

async function sshPutBuffer(buffer, remotePath) {
  await ensureStagingDir()
  return withSshRetry(async () => {
    const ssh = await getSSH()
    const tmpFile = path.join(os.tmpdir(), `onebethub_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(tmpFile, buffer)
    try {
      await ssh.putFile(tmpFile, toSftpPath(remotePath))
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  }, `sshPutBuffer:${remotePath}`)
}

async function sshRm(remotePath) {
  return withSshRetry(async () => {
    const ssh = await getSSH()
    await ssh.execCommand(`rm -f "${remotePath}"`, { cwd: WP_PATH })
  }, `sshRm:${remotePath}`)
}

async function getOrCreateTaxonomy(type, name) {
  if (DRY_RUN) return 0 // DRY_RUN에서는 실제 term이 없으므로 자리표시 id만 반환
  const wpType = type === 'categories' ? 'category' : 'post_tag'
  try {
    const out = await wpCli(`term list ${wpType} --search="${name}" --format=json --fields=term_id,name`)
    const list = JSON.parse(out || '[]')
    const found = list.find(t => t.name === name)
    if (found) return parseInt(found.term_id)
  } catch { /* term not found — create below */ }
  try {
    const id = await wpCli(`term create ${wpType} "${name}" --porcelain`)
    return parseInt(id)
  } catch (e) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9가-힣\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    for (const lookup of [`--name="${name}"`, `--slug="${slug}"`]) {
      const id = (await wpCli(`term list ${wpType} ${lookup} --field=term_id`).catch(() => '')).split(/\s+/)[0]
      if (id) return parseInt(id)
    }
    throw e
  }
}

async function createWordPressPost(postData) {
  if (DRY_RUN) return createDryRunPost(postData)
  const ts = `${Date.now()}_${Math.floor(Math.random() * 9999)}`
  const dataFile = `${STAGING_DIR}/onebethub_data_${ts}.json`
  const phpFile  = `${STAGING_DIR}/onebethub_php_${ts}.php`

  const phpScript = `<?php
$d = json_decode(file_get_contents('${dataFile}'), true);
if (!empty($d['author_login'])) {
  $user = get_user_by('login', $d['author_login']);
  $author_id = $user ? $user->ID : 1;
} else {
  $admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
  $author_id = !empty($admins) ? (int)$admins[0] : 1;
}
// wp_slash 필수 — wp_insert_post()도 update_post_meta()와 마찬가지로 wp_unslash()를 적용한다.
$post_arr = [
  'post_title'    => wp_slash($d['title']),
  'post_content'  => wp_slash($d['content']),
  'post_status'   => (!empty($d['status']) ? $d['status'] : 'publish'),
  'post_category' => $d['categories'],
  'post_author'   => $author_id,
];
if (!empty($d['slug'])) $post_arr['post_name'] = $d['slug'];
$id = wp_insert_post($post_arr, true);
if (is_wp_error($id)) { fwrite(STDERR, 'ERROR:'.$id->get_error_message()); exit(1); }
if (!empty($d['tags'])) wp_set_post_tags($id, $d['tags'], false);
foreach ($d['meta'] as $k => $v) update_post_meta($id, $k, wp_slash($v));
if (!empty($d['featured_media'])) set_post_thumbnail($id, (int)$d['featured_media']);
echo $id;
`
  await sshPutBuffer(Buffer.from(JSON.stringify(postData), 'utf-8'), dataFile)
  await sshPutBuffer(Buffer.from(phpScript, 'utf-8'), phpFile)
  const idStr = await wpCli(`eval-file "${phpFile}"`)
  // 동시 채널 개방으로 인한 "Channel open failure"를 피하기 위해 순차 실행(이 서버는 동시 채널 한도가
  // 낮은 것으로 확인됨 — 아래 태그 처리 Promise.all 수정 사유 참고).
  await sshRm(dataFile)
  await sshRm(phpFile)
  const id = parseInt(idStr)
  if (isNaN(id)) throw new Error(`createWordPressPost: WP-CLI returned: ${idStr}`)
  return { id }
}

// DRY_RUN 발행 대체 — 발행될 내용을 콘솔에 출력하고 data/dry-run-output/에 파일로 저장.
let _dryRunSeq = 0
function createDryRunPost(postData) {
  fs.mkdirSync(DRY_RUN_OUTPUT_DIR, { recursive: true })
  _dryRunSeq++
  const id = 900000 + _dryRunSeq // WP post_id처럼 보이는 로컬 전용 가짜 id
  const langGuess = /^[\x00-\x7F\s]*$/.test(postData.title) ? 'en' : 'ko'
  const base = `${postData.slug || `post-${id}`}.${langGuess}`
  const mdPath = path.join(DRY_RUN_OUTPUT_DIR, `${base}.html`)
  const metaPath = path.join(DRY_RUN_OUTPUT_DIR, `${base}.meta.json`)
  fs.writeFileSync(mdPath, postData.content, 'utf-8')
  fs.writeFileSync(metaPath, JSON.stringify({ ...postData, content: undefined, id }, null, 2), 'utf-8')
  console.log(`\n  ─── [DRY_RUN] 발행될 내용 미리보기 (${langGuess.toUpperCase()}) ───────────────`)
  console.log(`  제목: ${postData.title}`)
  console.log(`  슬러그: ${postData.slug}`)
  console.log(`  상태: ${postData.status}`)
  console.log(`  meta: ${JSON.stringify(postData.meta, null, 2).slice(0, 400)}...`)
  console.log(`  본문 저장 위치: ${mdPath}`)
  console.log(`  ────────────────────────────────────────────────────────────`)
  return { id, dryRun: true, slug: postData.slug, lang: langGuess }
}

// ── Stage 1: 토픽 선택 (클러스터 완결 순서 고정 로테이션) ────────
// 원본은 "카테고리 강제 로테이션(날짜 시드) + wp post list 대조"였다. onebethub는 22페이지가
// 클러스터별로 완결 순서가 고정돼 있어야 하므로(임대→분양→제작→가격→토토개발, 각 클러스터 내
// T1 허브 먼저 → T2/T3는 week 오름차순) 날짜 시드 로테이션 대신 결정적 순서를 그대로 따른다.

function loadKeywordMap() {
  return JSON.parse(fs.readFileSync(KEYWORD_MAP_FILE, 'utf-8'))
}

function loadLinkMap() {
  return JSON.parse(fs.readFileSync(LINK_MAP_FILE, 'utf-8'))
}

// 클러스터 순서 고정 + 클러스터 내부는 T1 허브 우선, 그다음 week 오름차순.
// T2-00(유입 허브)은 cluster:'임대'로 분류돼 있지만 실제로는 임대 클러스터의 T1보다도 더 넓은
// "전체 도입방식 비교" 유입 허브라, 임대 클러스터 안에서 week 값(13)이 커서 이 정렬만으로도
// 자연히 임대 클러스터의 T1/T2/T3보다 뒤로 밀린다(= 임대 클러스터 개별 페이지들이 먼저 채워진 뒤 발행).
function sortedPages(pages) {
  const clusterIdx = c => { const i = CLUSTER_ORDER.indexOf(c); return i === -1 ? 999 : i }
  const tierRank = p => (p.tier === 'T1' ? 0 : 1)
  return [...pages].sort((a, b) =>
    clusterIdx(a.cluster) - clusterIdx(b.cluster) ||
    tierRank(a) - tierRank(b) ||
    (a.week ?? 999) - (b.week ?? 999)
  )
}

async function fetchExistingSlugsLive() {
  try {
    const out = await wpCli('post list --post_status=publish,draft --fields=post_name --format=csv --posts_per_page=1000')
    return new Set(out.split('\n').slice(1).map(l => l.replace(/^"|"$/g, '').toLowerCase()).filter(Boolean))
  } catch {
    return new Set()
  }
}

async function isPagePublished(page, lang, log, liveSlugSet) {
  if (isLoggedPublished(log, page.id, lang)) return true
  if (!DRY_RUN && liveSlugSet) {
    const slug = lang === 'en' ? `${page.slug}` : page.slug // KO/EN 슬러그 체계는 실제 배포시 확정, 우선 slug 그대로 대조
    if (liveSlugSet.has(slug.toLowerCase())) return true
  }
  return false
}

async function pickPage(pages, log) {
  const ordered = sortedPages(pages)
  const liveSlugSet = DRY_RUN ? null : await fetchExistingSlugsLive()

  for (const page of ordered) {
    const koDone = await isPagePublished(page, 'ko', log, liveSlugSet)
    if (koDone) continue

    // 순서 안전망: pushesTo 대상이 아직 발행 전이면(정상 순서라면 발생하지 않아야 함) 건너뛰고 경고.
    if (page.pushesTo) {
      const target = pages.find(p => p.id === page.pushesTo)
      const targetDone = target ? await isPagePublished(target, 'ko', log, liveSlugSet) : false
      if (!targetDone) {
        console.log(`  ⚠ [${page.id}] 상향링크 대상(${page.pushesTo})이 아직 미발행 — 순서 이상, 건너뛰고 다음 페이지 탐색`)
        continue
      }
    }
    console.log(`  선택된 페이지: [${page.cluster}/${page.tier}] ${page.id} — ${page.title}`)
    return page
  }
  return null // 22페이지 전부 발행 완료
}

// ── 클러스터 완결 감지 + 허브 하향링크 업데이트 (원본에는 없는 신규 스텝) ──
// 하향 링크(허브→하위)는 클러스터의 모든 하위 페이지가 발행된 뒤에만 건다.
// 매 실행마다 "이 클러스터가 완결됐는가"를 판단해 완결된 클러스터의 허브 글을 갱신(update)한다.
function clusterChildren(linkMap, hubId) {
  return linkMap.filter(e => e.from === hubId && e.type === 'down').map(e => e.to)
}

async function maybeUpdateCompletedHubs(pages, linkMap, log) {
  const hubs = pages.filter(p => p.tier === 'T1')
  const liveSlugSet = DRY_RUN ? null : await fetchExistingSlugsLive()
  for (const hub of hubs) {
    const hubDone = await isPagePublished(hub, 'ko', log, liveSlugSet)
    if (!hubDone) continue
    const childIds = clusterChildren(linkMap, hub.id)
    if (!childIds.length) continue
    const allChildrenDone = await Promise.all(
      childIds.map(id => isPagePublished(pages.find(p => p.id === id), 'ko', log, liveSlugSet))
    )
    if (!allChildrenDone.every(Boolean)) continue
    if (isLoggedPublished(log, hub.id, 'hub-updated')) continue // 이미 갱신 완료

    console.log(`\n[클러스터 완결] "${hub.cluster}" 클러스터의 모든 하위 페이지 발행 완료 — 허브(${hub.id}) 하향링크 업데이트`)
    const links = childIds.map(id => {
      const child = pages.find(p => p.id === id)
      const edge = linkMap.find(e => e.from === hub.id && e.to === id)
      const url = resolvePageUrlSync(child, 'ko', log)
      return { title: child.title, anchor: edge?.anchorHint || child.title, url }
    }).filter(l => l.url)

    if (!links.length) {
      console.log('  ⚠ 하위 페이지 URL을 아직 확정할 수 없음(로그에 url 없음) — 다음 실행에서 재시도')
      continue
    }

    const block = `\n\n<!-- onebethub:downlinks:${hub.id} -->\n## 관련 페이지\n\n${links.map(l => `- [${l.anchor}](${l.url})`).join('\n')}\n`

    if (DRY_RUN) {
      fs.mkdirSync(DRY_RUN_OUTPUT_DIR, { recursive: true })
      const outPath = path.join(DRY_RUN_OUTPUT_DIR, `${hub.slug}.hub-update.ko.md`)
      fs.writeFileSync(outPath, block, 'utf-8')
      console.log(`  ✓ [DRY_RUN] 허브 하향링크 블록 저장: ${outPath}`)
    } else {
      try {
        await appendHubDownlinksLive(hub, log, block)
        console.log(`  ✓ 허브(${hub.id}) 글 본문에 하향링크 ${links.length}개 추가`)
      } catch (e) {
        console.log(`  ⚠ 허브 하향링크 라이브 업데이트 실패: ${e.message}`)
        continue
      }
    }
    appendPublishedLog({ id: hub.id, publishedAt: new Date().toISOString(), lang: 'hub-updated' })
    await tg(`🔗 <b>클러스터 완결 — 허브 업데이트</b>\n[${hub.cluster}] ${hub.title}\n하향링크 ${links.length}개 추가`)
  }
}

// 라이브 모드: wp post get으로 기존 본문을 가져와 마커 중복 없이 하향링크 블록을 덧붙인다.
async function appendHubDownlinksLive(hub, log, block) {
  const url = resolvePageUrlSync(hub, 'ko', log)
  if (!url) throw new Error('허브 KO URL을 찾을 수 없음')
  const idOut = await wpCli(`post list --post_status=publish,draft --name="${hub.slug}" --field=ID --format=ids`)
  const postId = parseInt((idOut || '').trim())
  if (!postId) throw new Error(`허브 슬러그(${hub.slug})로 post ID를 찾지 못함`)
  const marker = `onebethub:downlinks:${hub.id}`
  const existing = await wpCli(`post get ${postId} --field=content`)
  if (existing.includes(marker)) { console.log('  ⓘ 하향링크 블록이 이미 존재 — 재삽입 생략'); return }
  const ts = `${Date.now()}_${Math.floor(Math.random() * 9999)}`
  const dataFile = `${STAGING_DIR}/onebethub_hubupd_${ts}.json`
  const phpFile = `${STAGING_DIR}/onebethub_hubupd_${ts}.php`
  const php = `<?php
$d = json_decode(file_get_contents('${dataFile}'), true);
$post = get_post($d['id']);
if (!$post) { fwrite(STDERR, 'ERROR: post not found'); exit(1); }
$new = $post->post_content . wp_slash($d['block']);
$r = wp_update_post(['ID' => $d['id'], 'post_content' => $new], true);
if (is_wp_error($r)) { fwrite(STDERR, 'ERROR:'.$r->get_error_message()); exit(1); }
echo 'ok';
`
  await sshPutBuffer(Buffer.from(JSON.stringify({ id: postId, block: await marked(block) }), 'utf-8'), dataFile)
  await sshPutBuffer(Buffer.from(php, 'utf-8'), phpFile)
  await wpCli(`eval-file "${phpFile}"`)
  await sshRm(dataFile)
  await sshRm(phpFile)
}

// ── URL 해석 (내부링크/상향링크용) ───────────────────────────────
// DRY_RUN: 로컬 원장에 저장된 url이 있으면 사용, 없으면 slug 기반 결정적 가짜 URL 생성.
// 라이브: 로컬 원장의 url(발행 시 기록됨)을 우선 사용 — 없으면 null(다음 실행에서 재시도).
function resolvePageUrlSync(page, lang, log) {
  const entry = log.find(e => e.id === page.id && e.lang === lang)
  if (entry?.url) return entry.url
  if (DRY_RUN) {
    // Polylang 설치 전(~2026-09-18)에는 실제 퍼머링크에 언어 접두 디렉터리가 없어서 여기 en 분기에
    // `/en/`을 붙이면 틀린 값이었다(당시 이 프리픽스가 DRY_RUN 원장에 기록됐다가 실제 실행에서
    // 재사용되며 존재하지 않는 URL이 삽입되는 사고로 이어졌던 적 있음 — 그래서 DRY_RUN 원장을 별도
    // 파일로 분리). Polylang 활성화 이후로는 반대로 en에 `/en/` 접두가 실제 정답이 됐으므로(기본
    // 언어 ko는 접두 없음) 아래처럼 다시 붙인다 — createWordPressPost 호출부의 실제 실행 분기와
    // 일치시켜야 DRY_RUN 미리보기가 실제 발행 URL과 어긋나지 않는다.
    const slug = lang === 'en' ? `${page.slug}-en` : page.slug
    const prefix = lang === 'en' ? 'en/' : ''
    return `${WP_URL}/${prefix}${slug}/`
  }
  return null
}

function getUpwardEdge(linkMap, pageId) {
  return linkMap.find(e => e.from === pageId && e.type === 'up')
}

function getCrossEdges(linkMap, pageId) {
  return linkMap.filter(e => e.from === pageId && e.type === 'cross')
}

// ── 아웃바운드 링크 검색 (Serper API) ───────────────────────────

const OUTBOUND_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const DEAD_STATUS = new Set([400, 404, 410, 451])
async function isUrlAlive(url, timeoutMs = 12000) {
  const tryOnce = async (method) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': OUTBOUND_UA, 'Accept': 'text/html,*/*' },
        signal: ctrl.signal,
      })
      return res.status
    } catch { return 0 } finally { clearTimeout(t) }
  }
  let code = await tryOnce('HEAD')
  if ([0, 403, 405, 501].includes(code)) code = await tryOnce('GET')
  return !DEAD_STATUS.has(code)
}

async function searchOutboundLinks(keyword) {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: keyword, gl: 'kr', hl: 'ko', num: 10 }),
    })
    if (!res.ok) throw new Error(`Serper API ${res.status}`)
    const data = await res.json()
    const candidates = (data.organic ?? [])
      .filter(r => r.link && !r.link.includes('onebethub') && /^https?:\/\//i.test(r.link))
      .map(r => ({ title: r.title, url: r.link, snippet: r.snippet }))

    const alive = []
    for (const c of candidates) {
      if (alive.length >= 3) break
      if (await isUrlAlive(c.url)) alive.push(c)
      else console.log(`  ⚠ 아웃바운드 후보 제외 (응답 불량): ${c.url}`)
    }
    return alive
  } catch (e) {
    console.log(`  ⚠ Serper 검색 실패: ${e.message}`)
    return []
  }
}

// ── 내부 링크 후보 (관련도 스코어링 — 클러스터/태그 기반) ────────

const RELEVANCE_STOPWORDS = new Set([
  '비교', '분석', '전략', '방법', '가이드', '완전', '완벽', '핵심', '추천', '정리', '총정리',
  '활용', '이해', '시작', '단계', '최신', '최고', '정복', '입문', '실전', '평가', '기술', '구조',
  'guide', 'complete', 'best', 'full', 'step', 'steps', 'analysis', 'strategy', 'comparison',
  'top', 'review', 'your', 'what', 'why', 'how', 'the', 'and', 'for', 'with', 'from', 'into', 'vs',
])

function relevanceTerms(page) {
  return [...new Set(
    [page.primaryKeyword || '', page.title, ...(page.tags || [])]
      .join(' ').toLowerCase().split(/[\s,]+/)
      .filter(w => w.length > 1 && !RELEVANCE_STOPWORDS.has(w))
  )]
}

function termOverlap(candTags, page) {
  const hay = (candTags || []).join(' ').toLowerCase()
  let n = 0
  for (const t of relevanceTerms(page)) if (hay.includes(t)) n++
  return n
}

// 발행된(로그에 있는) 다른 페이지 중 같은 클러스터 우선, 태그 겹침 점수로 정렬해 관련 글 후보를 고른다.
// 원본의 "발행 글 전체를 wp에서 긁어와 제목/카테고리로 스코어링"을 로컬 keyword-map 기반으로 대체.
function fetchInternalLinkCandidates(page, pages, log, lang, limit = 3, excludeIds = []) {
  const candidates = pages.filter(p =>
    p.id !== page.id &&
    !excludeIds.includes(p.id) &&
    isLoggedPublished(log, p.id, lang)
  )
  const scored = candidates.map(p => ({
    p,
    sameCluster: p.cluster === page.cluster,
    hits: termOverlap(p.tags, page),
  }))
  const tier = x => (x.sameCluster ? (x.hits > 0 ? 0 : 1) : (x.hits > 0 ? 2 : 3))
  scored.sort((a, b) => tier(a) - tier(b) || b.hits - a.hits)
  return scored.slice(0, limit).map(x => ({
    title: x.p.title,
    url: resolvePageUrlSync(x.p, lang, log),
  })).filter(l => l.url)
}

// ── Stage 2: 콘텐츠 생성 ────────────────────────────────────────

// 페이지 태그로 콘텐츠 성격(브랜드 비교 vs 브랜드 무관 정보/기술) 판정 후 지침 문구를 반환.
// 세션 합의 콘텐츠 믹스: 순수 정보성 50~60% / 기술·구조 해설 20~30% / 비교·가격 10~20%.
// "브랜드비교" 태그가 붙은 페이지만 비교글 모드 — 그 외에는 특정 업체명을 억지로 언급하지 않는다.
function brandGuidance(page) {
  const isComparison = (page.tags || []).includes('브랜드비교')
  if (isComparison) {
    return `이 페이지는 "비교·가격" 성격의 콘텐츠입니다(전체 콘텐츠 믹스 중 10~20% 비중).
- 7Play를 포함한 여러 솔루션사를 공개된 가격·기능·계약조건만 놓고 객관적으로 비교하세요.
- 특정 업체(7Play 포함)를 일방적으로 칭찬하거나 경쟁사를 깎아내리지 마세요.
- 장단점을 균형 있게 제시하고, 최종 선택은 독자의 상황(예산·라이선스·기술 요구사항)에 맡기세요.`
  }
  return `이 페이지는 "브랜드 무관 정보성/기술·구조 해설" 콘텐츠입니다(전체 콘텐츠 믹스 중 70~90% 비중).
- 특정 업체명(7Play 포함)을 억지로 언급하지 마세요. 언급이 필요하면 여러 업체 사례를 함께 드는 방식으로 균형을 맞추세요.
- 카지노·스포츠북 B2B 솔루션 산업 자체의 구조·기술·절차·규제를 설명하는 데 집중하세요.`
}

function buildBrandSystemPrompt() {
  return `당신은 OneBetHub의 에디터입니다.
OneBetHub(onebethub.com)는 특정 브랜드 홍보 채널이 아니라 카지노·스포츠북 B2B 솔루션 산업을 다루는
독립적인 인사이트 미디어입니다. 임대·분양·제작·가격·토토개발 도입 방식을 검토하는 운영사·에이전시
의사결정자(대표, CTO, 사업개발 담당)가 핵심 독자입니다.
브랜드 무드: 실무적, 신뢰할 수 있는 전문성, 데이터/구조 기반 설명. 과장된 홍보 톤을 피하세요.
이 산업(카지노 솔루션, 배팅사이트 제작, 라이선스, 결제, API 연동 등) 자체를 다루는 것이 이 매체의
목적이므로 관련 용어를 자유롭게 사용하되, 특정 브랜드를 일방적으로 편애하는 서술은 피하세요(어뷰징/스팸
패턴 방지 — 반드시 지켜야 할 원칙).`
}

// 전환 페이지(role에 "전환" 포함 — keyword-map.json상 클러스터당 T1 한 곳, 임대는 T1-01)만 7Play로
// 직접 연결한다. 그 외 지원/허브 페이지(T2-00 "유입 허브(전환 아님)" 포함 대다수)는 클러스터의 전환
// 페이지로 가는 내부 링크를 CTA로 쓴다 — 사이트의 모든 글이 매번 동일한 외부 상업 링크로 귀결되는
// 도어웨이 패턴을 피하기 위한 설계(세션 합의, 2026-09-18). keyword-map.json의 role 구분이 애초에
// 이 의도를 전제하고 있었는데 CTA 하드코딩이 그걸 반영하지 못했던 것을 바로잡음.
function isConversionPage(page) {
  return (page.role || '').includes('전환')
}

// 지원/허브 페이지의 CTA 목적지 — 같은 클러스터의 전환 페이지(T1, role="전환")로 가는 내부 링크.
// 그 전환 페이지가 아직 발행 전이면(사이트 초기 한정) 안전망으로 7Play 직접 링크를 임시로 쓴다 —
// 전환 페이지가 발행되는 순간 다음 실행부터 자동으로 내부 링크로 전환된다(CTA는 매번 재생성되므로
// 과거에 이미 나간 글은 고정되지만, 이 파일 개별 실행 시점 기준 최신 상태를 반영한다).
function resolveCtaUrl(page, pages, log) {
  if (isConversionPage(page)) return CTA_URL_MAP[page.cluster] ?? 'https://7play.co/'
  const target = pages.find(p => p.cluster === page.cluster && p.id !== page.id && isConversionPage(p))
  const url = target ? resolvePageUrlSync(target, 'ko', log) : null
  return url ?? (CTA_URL_MAP[page.cluster] ?? 'https://7play.co/')
}

function ctaBlock(page, ctaUrl) {
  if (isConversionPage(page)) {
    return `---
## 카지노 솔루션 도입을 검토 중이라면

이 글이 도움이 됐다면, 7Play의 솔루션 라인업을 함께 살펴보고 필요한 옵션을 비교해보세요.

[→ 7Play 솔루션 보기](${ctaUrl})

---`
  }
  return `---
## 더 깊이 알아보고 싶다면

이 주제와 직접 관련된 도입·비용 비교 글에서 실무적으로 확인해야 할 체크포인트를 이어서 확인해보세요.

[→ 관련 글 더 보기](${ctaUrl})

---`
}

async function generatePost(page, outboundLinks = [], internalLinks = [], requiredUpwardLink = null, ctaUrl) {
  const systemPrompt = buildBrandSystemPrompt()

  const focusKeyword = page.primaryKeyword || page.title
  const upwardRule = requiredUpwardLink
    ? `\n7. [필수] 상향 링크: 이 글은 상위 페이지로 반드시 링크해야 합니다. 본문 첫 3문단 중 한 곳에 아래 URL을 자연스러운 서술형 앵커텍스트로 삽입하세요(URL은 그대로 사용, 변형·생성 금지):\n   * 앵커 힌트: "${requiredUpwardLink.anchorHint}" → ${requiredUpwardLink.url}`
    : ''

  const userPrompt = `다음 페이지 기획에 맞춰 SEO + GEO 최적화된 한국어 블로그 포스트를 작성해주세요.

페이지 ID: ${page.id} (${page.tier} / 클러스터: ${page.cluster})
포커스 키워드: ${focusKeyword}
제목 가이드: ${page.title}
태그: ${(page.tags || []).join(', ')}

${brandGuidance(page)}

요구사항:
1. 제목: 포커스 키워드 "${focusKeyword}"가 반드시 포함된 SEO 제목 (40자 이내). 위 "제목 가이드"를 참고하되 그대로 베끼지 말고 SEO 제목 규칙에 맞게 다듬으세요.
2. 메타 설명: 반드시 "${focusKeyword}"를 그대로 포함한 검색결과 설명 (120~155자)
3. 본문: 2,500~3,500자 분량의 마크다운
   - 첫 번째 문단의 첫 1~2문장 안에 반드시 "${focusKeyword}"를 그대로 포함할 것
   - 본문 전체에서 "${focusKeyword}"를 최소 5회 이상 자연스럽게 사용
   - ## 소제목 4~5개 (최소 2개의 H2 소제목에 "${focusKeyword}" 또는 핵심 단어 포함)

   [GEO 5요소 필수 — AI 검색엔진 최적화]
   a) 직접 답변: 첫 문단에서 "${focusKeyword}"의 핵심 정의 또는 결론을 바로 제시
   b) Key Facts 박스: <aside> 태그로 핵심 사실 5가지 (숫자·비율·기간은 외부 출처에 근거하거나 일반적으로 알려진 사실만 — 지어낸 통계 금지)
      예시: <aside><strong>Key Facts</strong><ul><li>...</li></ul></aside>
   c) FAQ 섹션: 반드시 "## 자주 묻는 질문" H2 제목 + Q&A 형식 3개 이상
      예시: **Q: 질문?** → A: 답변...
   d) 체크리스트: - [ ] 형식으로 독자 실행 체크리스트 (최소 3개)
   e) 외부 출처 링크: ${outboundLinks.length > 0
     ? `본문 중간에 아래 실제 검색된 출처 URL을 자연스럽게 2~3개 링크로 삽입하세요:\n${outboundLinks.map(l => `        * [${l.title}](${l.url})`).join('\n')}`
     : '외부 출처 링크는 이번 글에서 생략합니다. 절대로 가상의 URL을 만들거나 추측으로 링크를 삽입하지 마세요.'}
   f) 내부 링크 (OneBetHub 관련 글): ${internalLinks.length > 0
     ? `본문 중간 서로 다른 위치에 아래 우리 사이트 관련 글을 2~3개 자연스럽게 링크하세요. 규칙:\n        - URL은 아래 값을 그대로 사용 (변형·생성 금지)\n        - 제목을 그대로 앵커로 쓰지 말고, 문맥에 어울리는 서술형 앵커텍스트를 만들 것\n        - 외부 링크와 구분되게, 글 흐름상 관련 주제를 언급하는 문장에 끼워 넣을 것\n${internalLinks.map(l => `        * ${l.title} → ${l.url}`).join('\n')}`
     : '내부 링크로 쓸 관련 기존 글이 아직 없습니다. 내부 링크는 생략하세요 (가상 URL 금지).'}
${upwardRule}

   [사실·수치 정확성 — 매우 중요. 검증 게이트에서 감점·발행 차단 사유]
   - 구체적 통계·퍼센트·가격·기간을 단정하려면 위 (e) 외부 출처에 실제로 근거한 것만 쓰세요.
   - 출처로 뒷받침되지 않는 구체 수치를 절대 지어내지 마세요. 불확실하면 단정 대신 경향·범위로 표현하세요.
   - 미확정 사안(법규 개정, 특정 업체의 비공개 가격 등)은 단정하지 말고 "전망/일반적으로/사업자에 따라 다름"으로 표현하세요.

   - 글 마지막에 반드시 아래 CTA 섹션을 그대로(문구·URL 변형 없이) 포함:

${ctaBlock(page, ctaUrl)}

4. 키워드: SEO 키워드 5~8개 (쉼표 구분, 첫 번째는 "${focusKeyword}")

반드시 아래 형식으로만 응답하세요:

---TITLE---
[제목]
---DESCRIPTION---
[메타 설명]
---KEYWORDS---
[키워드1, 키워드2, ...]
---CONTENT---
[마크다운 본문 내용 — GEO 5요소 + CTA 섹션 포함]
---END---`

  const message = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const parsed = parseResponse(message.content[0].type === 'text' ? message.content[0].text : '')
  parsed.content = stripLeadingTitle(parsed.content, parsed.title)
  return parsed
}

// ── Stage 3: 휴머나이징 ──────────────────────────────────────────

async function humanizePost(post, page, ctaUrl) {
  const focusKeyword = page.primaryKeyword || page.title
  const prompt = `아래는 AI가 초안으로 작성한 블로그 글입니다.
실제 카지노·스포츠북 솔루션 업계 실무 경험이 있는 전문가가 직접 쓴 것처럼 자연스럽게 다듬어 주세요.

포커스 키워드: ${focusKeyword}

수정 지침:
- AI 특유의 반복적이고 균일한 문장 구조를 깨뜨리세요 (짧은 문장과 긴 문장을 섞어라)
- 구체적 수치·통계를 추가할 때는 반드시 본문의 외부 출처에 근거한 것만 쓰세요. 출처 없는 수치를 새로 지어내지 말고, 근거가 없으면 경향·범위 표현이나 필자의 실무 경험 사례로 대체하세요
- 한 군데에 필자의 개인적인 견해나 실무 관점을 넣으세요
- "중요합니다", "필수입니다", "반드시" 같은 AI 관용구를 줄이세요
- CTA 섹션(마지막 링크 블록)은 절대 수정하지 마세요
- 본문의 모든 링크(내부 onebethub.com 링크 + 외부 출처 링크)의 URL은 절대 삭제·변경하지 마세요. 앵커텍스트 문장은 자연스럽게 다듬어도 되지만 링크 자체는 유지하세요
- <aside> Key Facts 박스, FAQ 섹션, 체크리스트는 구조를 유지하되 문장은 자연스럽게 다듬으세요
- 제목, 메타 설명, 키워드는 유지하고 본문(CONTENT)만 수정하세요
- 첫 번째 문단의 첫 1~2문장에 키워드 "${focusKeyword}"가 반드시 유지되어야 합니다
- 본문에서 키워드 "${focusKeyword}"가 최소 5회 이상 등장해야 합니다
- ## 소제목 중 최소 2개에 "${focusKeyword}" 또는 핵심 단어가 포함되어야 합니다
- 상향 링크(있는 경우, 본문 첫 3문단 안의 링크)를 절대 삭제하지 마세요
- 분량을 줄이지 마세요 — 2,500자 이상 유지

---TITLE---
${post.title}
---DESCRIPTION---
${post.description}
---KEYWORDS---
${post.keywords}
---CONTENT---
${post.content}
---END---

동일한 형식으로 응답하세요 (TITLE, DESCRIPTION, KEYWORDS, CONTENT만 — JSONLD는 포함하지 마세요).`

  const message = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const humanizedContent = extractTag('CONTENT', raw)
  const cleaned = fixChecklist(stripLeadingTitle(humanizedContent || post.content, post.title))
  return { ...post, content: cleaned }
}

// ── Stage 4: SEO 품질 게이트 (규칙 기반, 11항목) ─────────────────

function firstParagraphs(content, n) {
  return content.split(/\n{2,}/).filter(p => p.trim() && !p.trim().startsWith('#')).slice(0, n).join('\n\n')
}

function runSeoChecks(post, page, requiredUpwardLink, ctaUrl) {
  const issues = []
  const focusKeyword = (page.primaryKeyword || page.title).toLowerCase()
  const title = post.title.toLowerCase()
  const desc = post.description.toLowerCase()
  const content = post.content

  // 1. 제목에 키워드
  if (!title.includes(focusKeyword) && !focusKeyword.split(' ').some(w => w.length > 1 && title.includes(w)))
    issues.push(`제목에 키워드 없음: "${page.primaryKeyword || page.title}"`)

  // 2+3. 메타 설명 길이
  if (post.description.length < 100) issues.push(`메타 설명 너무 짧음: ${post.description.length}자 (최소 100자)`)
  if (post.description.length > 160) issues.push(`메타 설명 너무 김: ${post.description.length}자 (최대 160자)`)

  // 4. 메타 설명에 키워드 포함
  if (!desc.includes(focusKeyword) && !focusKeyword.split(' ').filter(w => w.length > 1).every(w => desc.includes(w)))
    issues.push(`메타 설명에 키워드 없음: "${page.primaryKeyword || page.title}"`)

  // 5. 첫 문단에 키워드 포함
  const firstPara = content.split(/\n+/).find(l => l.trim() && !l.startsWith('#')) ?? ''
  if (!firstPara.toLowerCase().includes(focusKeyword) &&
      !focusKeyword.split(' ').filter(w => w.length > 1).every(w => firstPara.toLowerCase().includes(w)))
    issues.push(`첫 문단에 키워드 없음: "${page.primaryKeyword || page.title}"`)

  // 6. 키워드 최소 등장 횟수
  const escaped = focusKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const kwCount = (content.toLowerCase().match(new RegExp(escaped, 'g')) ?? []).length
  if (kwCount < 5) issues.push(`키워드 등장 횟수 부족: ${kwCount}회 (최소 5회)`)

  // 7. H2 소제목 4개 이상
  const h2Lines = content.match(/^## .+$/gm) ?? []
  if (h2Lines.length < 4) issues.push(`H2 소제목 부족: ${h2Lines.length}개 (최소 4개)`)

  // 7-1. H2 소제목에 키워드 포함
  const kwParts = focusKeyword.split(' ').filter(w => w.length > 1)
  const h2WithKw = h2Lines.some(h => h.toLowerCase().includes(focusKeyword) || kwParts.some(w => h.toLowerCase().includes(w)))
  if (!h2WithKw) issues.push(`H2 소제목에 키워드 없음: 최소 1개의 H2에 "${page.primaryKeyword || page.title}" 포함 필요`)

  // 8. FAQ 섹션 필수
  if (!content.includes('## 자주 묻는 질문'))
    issues.push('FAQ 섹션 누락: "## 자주 묻는 질문" H2 필요')

  // 9. 본문 길이 2,000자 이상
  if (content.length < 2000) issues.push(`본문 너무 짧음: ${content.length}자 (최소 2,000자)`)

  // 10. CTA 섹션 — 전환 페이지(role="전환")는 7play.co 직접 링크, 그 외 지원/허브 페이지는 클러스터
  // 전환 페이지로 가는 내부 링크(ctaUrl)만 있으면 통과 (ctaBlock/resolveCtaUrl 참고 — 도어웨이 패턴 방지)
  if (isConversionPage(page)) {
    if (!content.includes('7play.co')) issues.push('CTA 섹션 누락: 7play.co 링크 필요 (전환 페이지)')
  } else if (!content.includes(ctaUrl)) {
    issues.push(`CTA 섹션 누락: 내부 전환 링크(${ctaUrl}) 필요`)
  }

  // 11. [신규] 상향 링크 존재 여부 — pushesTo가 있는 페이지는 본문 첫 3문단 안에 상향링크 필수.
  // (세션 합의: 원본 파이프라인에는 없던 게이트 항목. 고정 내부링크 테이블의 "상향링크 필수" 규칙을 강제한다.)
  if (requiredUpwardLink) {
    const early = firstParagraphs(content, 3)
    if (!early.includes(requiredUpwardLink.url)) {
      issues.push(`상향 링크 누락: 본문 첫 3문단 안에 상위 페이지 링크(${requiredUpwardLink.url}) 필요`)
    }
  }

  return issues
}

// EN 번역본용 룰 게이트 — runSeoChecks의 영문판.
function runSeoChecksEn(post, focusKeyword, requiredUpwardLinkEn, page, ctaUrl) {
  const issues = []
  const keyword = (focusKeyword ?? '').toLowerCase()
  const title = (post.title ?? '').toLowerCase()
  const desc = (post.description ?? '').toLowerCase()
  const content = post.content ?? ''
  if (!keyword) return ['EN 포커스 키워드 없음']

  if (!title.includes(keyword)) issues.push(`EN 제목에 키워드 없음: "${focusKeyword}"`)

  const dLen = (post.description ?? '').length
  if (dLen < SEO_DESC_HARD_MIN) issues.push(`EN 메타 설명 너무 짧음: ${dLen}자 (최소 ${SEO_DESC_HARD_MIN}자)`)
  if (dLen > SEO_DESC_HARD_MAX) issues.push(`EN 메타 설명 너무 김: ${dLen}자 (최대 ${SEO_DESC_HARD_MAX}자)`)

  if (!desc.includes(keyword)) issues.push(`EN 메타 설명에 키워드 없음: "${focusKeyword}"`)

  const firstPara = content.split(/\n+/).find(l => l.trim() && !l.startsWith('#')) ?? ''
  if (!firstPara.toLowerCase().includes(keyword)) issues.push(`EN 첫 문단에 키워드 없음: "${focusKeyword}"`)

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const kwCount = (content.toLowerCase().match(new RegExp(escaped, 'g')) ?? []).length
  if (kwCount < 5) issues.push(`EN 키워드 등장 횟수 부족: ${kwCount}회 (최소 5회)`)

  const h2Lines = content.match(/^## .+$/gm) ?? []
  if (h2Lines.length < 4) issues.push(`EN H2 소제목 부족: ${h2Lines.length}개 (최소 4개)`)
  const kwParts = keyword.split(' ').filter(w => w.length > 1)
  const h2WithKw = h2Lines.some(h => h.toLowerCase().includes(keyword) || kwParts.some(w => h.toLowerCase().includes(w)))
  if (!h2WithKw) issues.push(`EN H2 소제목에 키워드 없음: 최소 1개 필요`)

  if (!/^##\s+Frequently Asked Questions/mi.test(content))
    issues.push('EN FAQ 섹션 누락: "## Frequently Asked Questions" H2 필요')

  if (content.length < 2000) issues.push(`EN 본문 너무 짧음: ${content.length}자 (최소 2,000자)`)

  if (isConversionPage(page)) {
    if (!content.includes('7play.co')) issues.push('EN CTA 섹션 누락: 7play.co 링크 필요 (전환 페이지)')
  } else if (!content.includes(ctaUrl)) {
    issues.push(`EN CTA 섹션 누락: 내부 전환 링크(${ctaUrl}) 필요`)
  }

  // 11. [신규] EN 상향 링크
  if (requiredUpwardLinkEn) {
    const early = firstParagraphs(content, 3)
    if (!early.includes(requiredUpwardLinkEn)) {
      issues.push(`EN 상향 링크 누락: 본문 첫 3문단 안에 상위 페이지 링크(${requiredUpwardLinkEn}) 필요`)
    }
  }

  return issues
}

// CTA 섹션을 결정적으로 보장 — 생성/재작성 과정에서 잘리거나 누락돼도 표준 CTA를 덧붙임.
function ensureCta(content, page, ctaUrl) {
  if (content.includes(ctaUrl)) return content
  return content.trimEnd() + `

${ctaBlock(page, ctaUrl)}
`
}

// Claude가 생성한 콘텐츠에서 결정적으로 JSON-LD 생성 (LLM 생성분 미사용 — 원본과 동일 방침)
function stripMdInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFaqFromContent(content) {
  let scope = content
  const heading = content.match(/^##\s*(?:자주 묻는 질문|Frequently Asked Questions)[^\n]*$/mi)
  if (heading) {
    const rest = content.slice(heading.index + heading[0].length)
    const next = rest.search(/\n##\s/)
    scope = next >= 0 ? rest.slice(0, next) : rest
  }
  const faqs = []
  const re = /\*\*\s*Q:?\s*([\s\S]+?)\*\*\s*(?:→\s*)?A:?\s*([\s\S]+?)(?=\n\s*\*\*\s*Q|\n\s*#{1,6}\s|\n\s*---|$)/g
  let m
  while ((m = re.exec(scope)) !== null) {
    const q = stripMdInline(m[1])
    const a = stripMdInline(m[2])
    if (q && a) faqs.push({ q, a })
  }
  return faqs
}

function buildJsonld(post, { lang, section, imageUrl = null }) {
  const blog = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: new Date().toISOString().slice(0, 10),
    author: { '@type': 'Organization', name: 'OneBetHub' },
    publisher: { '@type': 'Organization', name: 'OneBetHub' },
    keywords: post.keywords,
    articleSection: section,
    inLanguage: lang,
  }
  if (imageUrl) blog.image = imageUrl
  const out = [blog]
  const faqs = parseFaqFromContent(post.content)
  if (faqs.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
  }
  return JSON.stringify(out, null, 2)
}

// ── Stage 5: 멀티모델 검증 ──────────────────────────────────────

function buildVerificationPrompt(post, page, role) {
  const focusKeyword = page.primaryKeyword || page.title
  return `당신은 한국어 콘텐츠 품질 검증 전문가입니다.
아래 블로그 글을 ${role} 관점에서 평가해주세요.

포커스 키워드: ${focusKeyword}
클러스터: ${page.cluster}
타겟 독자: 카지노·스포츠북 솔루션 도입을 검토하는 B2B 의사결정자(운영사/에이전시 대표, CTO, 사업개발 담당)

평가 지침:
- 다음은 이 매체의 의도된 편집 포맷이므로 감점·AI패턴 사유가 아닙니다 — 구조 자체는 지적하지 마세요: FAQ 섹션, Key Facts/핵심 요약 박스, 비교 표, 체크리스트, JSON-LD 구조화 데이터, CTA.
- AI 패턴 감지는 "문장 차원"에만 적용하세요: 반복되는 상투적 수사, 출처 없는 수치 단정, 과도한 일반화.
- 사실 정확성을 최우선으로 평가하세요. 특히 미확정 사안(법규, 비공개 가격 등)을 확정된 것처럼 단정하거나, 통계·인용에 출처가 없으면 반드시 ISSUES에 명시하고 감점하세요.
- 이 매체는 특정 브랜드 홍보가 목적이 아닙니다. 특정 업체를 근거 없이 일방적으로 칭찬하거나 폄하하면 ISSUES에 명시하고 감점하세요.

--- 글 시작 ---
제목: ${post.title}
메타 설명: ${post.description}

${post.content}
--- 글 끝 ---

반드시 아래 형식으로만 응답하세요 (다른 말 없이):

SCORE: [1~10 숫자만]
ISSUES:
- [문제점 1]
- [문제점 2]
VERDICT: [PASS 또는 FAIL]

점수 기준:
8~10: 우수 — 사람이 쓴 것처럼 자연스럽고 유익함
6~7: 보통 — 발행 가능하나 개선 여지 있음
1~5: 미흡 — 재작성 필요`
}

async function verifyWithClaudeAgent(post, page) {
  try {
    const prompt = buildVerificationPrompt(post, page,
      '한국어 문장 품질 비평가 (논리 일관성, 문장 자연스러움, 정보 정확성, AI 패턴 감지)'
    )
    const message = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: '당신은 한국어 콘텐츠 품질 검증 전문가입니다. 글 작성자가 아닌 독립적인 비평가 역할로만 응답하세요. 지시된 형식 외에 다른 말은 하지 마세요.',
      messages: [{ role: 'user', content: prompt }],
    })
    return parseVerificationResult(message.content[0].type === 'text' ? message.content[0].text : '', 'Claude-검증')
  } catch (e) {
    console.log(`  ⚠ Claude 검증 에이전트 실패: ${e.message} — 건너뜀`)
    return { score: 8, issues: [], verdict: 'PASS', skipped: true }
  }
}

async function verifyWithGPT4(post, page) {
  try {
    const prompt = buildVerificationPrompt(post, page,
      'SEO 전문가 + AI 감지 (문장 자연스러움, 키워드 통합, 가독성)'
    )
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    return parseVerificationResult(res.choices[0].message.content ?? '', 'GPT-4o-mini')
  } catch (e) {
    console.log(`  ⚠ GPT-4o-mini 검증 실패: ${e.message} — 건너뜀`)
    return { score: 8, issues: [], verdict: 'PASS', skipped: true }
  }
}

async function verifyWithGemini(post, page) {
  const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.1-pro-preview']
  const prompt = buildVerificationPrompt(post, page,
    '브랜드 전략가 + 독자 관점 (브랜드 톤, 내용 신뢰도, 타겟 독자 적합성)'
  )
  let lastError = null
  for (const modelName of GEMINI_MODELS) {
    try {
      const model = gemini.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' })
      const res = await model.generateContent(prompt)
      const text = res.response.text() ?? ''
      if (!text) throw new Error('빈 응답')
      console.log(`  ✓ Gemini 검증 성공 (${modelName})`)
      return parseVerificationResult(text, 'Gemini')
    } catch (e) {
      lastError = e
      console.log(`  ⚠ Gemini 검증 실패 (${modelName}): ${e.message}`)
    }
  }
  const errMsg = lastError?.message ?? '알 수 없는 오류'
  console.log(`  ✗ Gemini 검증 전체 실패 — 건너뜀: ${errMsg}`)
  await tg(`⚠️ <b>Gemini 검증 실패 (모든 모델 시도)</b>\n<code>${errMsg}</code>`)
  return { score: 8, issues: [], verdict: 'PASS', skipped: true }
}

function parseVerificationResult(raw, modelName) {
  const scoreMatch = raw.match(/SCORE:\s*(\d+)/)
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5
  const issuesMatch = raw.match(/ISSUES:\n([\s\S]*?)(?=VERDICT:|$)/)
  const issues = issuesMatch
    ? issuesMatch[1].split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean)
    : []
  const verdict = score >= PASS_SCORE ? 'PASS' : 'FAIL'
  return { score, issues, verdict, modelName }
}

async function reviseWithFeedback(post, page, claudeResult, gptResult, geminiResult, ctaUrl) {
  const focusKeyword = page.primaryKeyword || page.title
  const allIssues = [
    ...claudeResult.issues.map(i => `[Claude-검증] ${i}`),
    ...gptResult.issues.map(i => `[GPT-4o-mini] ${i}`),
    ...geminiResult.issues.map(i => `[Gemini] ${i}`),
  ]

  const prompt = `아래 블로그 글이 세 AI 검증 모델에서 낮은 점수를 받았습니다.
지적된 문제점을 반영해서 본문(CONTENT)을 개선해주세요.

포커스 키워드: ${focusKeyword}

Claude-검증 점수: ${claudeResult.score}/10
GPT-4o-mini 점수: ${gptResult.score}/10
Gemini 점수: ${geminiResult.score}/10

개선이 필요한 문제점:
${allIssues.map(i => `- ${i}`).join('\n')}

개선 지침:
- 위 문제점을 구체적으로 수정하세요
- CTA 섹션(마지막 링크 블록, ${ctaUrl})은 절대 수정하지 마세요
- 본문의 모든 링크(내부 onebethub.com 링크 + 외부 출처 링크 + 상향 링크)의 URL과 개수를 절대 삭제·변경하지 마세요. 앵커텍스트 문장은 더 자연스럽게 다듬어도 되지만, 링크 자체는 반드시 그대로 유지하세요.
- <aside> Key Facts 박스, FAQ 섹션, 체크리스트 구조는 유지하세요
- 제목, 메타 설명, 키워드는 유지하세요
- 분량을 줄이지 마세요 — 2,500자 이상 유지
- 포커스 키워드가 본문에 최소 3회 이상 등장해야 합니다
- 최소 1개의 H2 소제목에 포커스 키워드 또는 핵심 단어가 포함되어야 합니다

---TITLE---
${post.title}
---DESCRIPTION---
${post.description}
---KEYWORDS---
${post.keywords}
---CONTENT---
${post.content}
---END---

동일한 형식으로 응답하세요 (JSONLD는 포함하지 마세요).`

  const message = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const revisedContent = extractTag('CONTENT', raw)
  return { ...post, content: revisedContent || post.content }
}

// ── 이미지 처리 ─────────────────────────────────────────────────
// 원본은 크립토/스포츠/라이프스타일 테마였다. onebethub는 B2B SaaS/산업 인사이트 매체이므로
// 클러스터별로 "카지노 솔루션 업계 실무" 장면(대시보드, 개발팀, 계약, 파트너십, 스포츠 데이터)으로 교체.

function buildImagePrompt(cluster, subject) {
  const noText = 'CRITICAL: render absolutely NO text, NO letters, NO words, NO numbers, NO captions, NO labels, NO signage, NO banners, NO typography, and NO watermarks of any language (no Korean, no English) anywhere in the image. Pure photographic visual only — empty of all writing.'
  const style = `Cinematic premium business/tech photography, dark navy blue tones, no recognizable faces. ${noText}`
  const scene = (subject && subject.trim()) ? `A realistic editorial photograph clearly depicting ${subject.trim()}. ` : ''
  const themes = {
    '임대': `${scene}SaaS platform dashboard, cloud infrastructure, B2B software subscription concept. ${style}`,
    '분양': `${scene}Business partnership handshake, distribution network, agency negotiation meeting. ${style}`,
    '제작': `${scene}Software development team, coding screens, system architecture, API integration diagram. ${style}`,
    '가격': `${scene}Financial pricing chart, contract cost calculation, business budget analytics. ${style}`,
    '토토개발': `${scene}Sports data analytics dashboard, mobile app development, live sports technology. ${style}`,
  }
  return themes[cluster] ?? `${scene}Professional B2B technology blog concept image. Clean modern aesthetic. ${style}`
}

const CLUSTER_QUERIES = {
  '임대':     ['saas dashboard technology', 'cloud server data center', 'business software interface', 'fintech office screen', 'digital contract signing'],
  '분양':     ['business partnership handshake', 'agency meeting negotiation', 'corporate contract table', 'distribution network map', 'sales team meeting'],
  '제작':     ['software development team', 'programmer coding screen', 'api integration diagram', 'tech startup office', 'system architecture whiteboard'],
  '가격':     ['financial pricing chart', 'business budget spreadsheet', 'invoice finance document', 'growth chart office', 'cost calculation meeting'],
  '토토개발': ['sports data analytics screen', 'mobile app development', 'sports technology dashboard', 'live score data feed', 'developer sports app'],
}

async function getImageSubject(page) {
  const fallback = (CLUSTER_QUERIES[page.cluster] ?? ['professional business concept'])[0]
  if (!process.env.GEMINI_API_KEY) return fallback
  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-3.6-flash' }, { apiVersion: 'v1' })
    const q = `You are picking a stock-photo search query for a B2B blog article about the casino/sportsbook solutions industry.
Article topic (Korean): "${page.title}"
Cluster: ${page.cluster}
Reply with ONLY a 2-4 word English photo search phrase naming the concrete real-world photographic subject (e.g. "software dashboard screen", "business handshake meeting", "developer coding laptop"). No quotes, no punctuation, no explanation, English only.`
    const res = await model.generateContent(q)
    const raw = (res.response.text() ?? '').trim().split('\n')[0]
    const clean = raw.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const words = clean.split(' ').filter(Boolean)
    if (words.length >= 2 && words.length <= 6) {
      console.log(`  이미지 주제 서술자: "${clean}" (페이지: ${page.id})`)
      return clean
    }
    return fallback
  } catch (e) {
    console.log(`  ⚠ 이미지 주제 생성 실패 — 클러스터 폴백("${fallback}"): ${e.message}`)
    return fallback
  }
}

function brandAccent(cluster) {
  const map = { '임대': '#00B4FF', '분양': '#22C55E', '제작': '#8B5CF6', '가격': '#FFC900', '토토개발': '#F97316' }
  return map[cluster] ?? '#00B4FF'
}

async function generateBrandedBg(keyword, cluster, index = 0) {
  const accent = brandAccent(cluster)
  const W = 1200, H = 675
  const spots = [
    { gx: '80%', gy: '26%', c1x: 0.18, c1y: 0.82, c2x: 0.85, c2y: 0.30 },
    { gx: '22%', gy: '70%', c1x: 0.80, c1y: 0.20, c2x: 0.30, c2y: 0.75 },
    { gx: '50%', gy: '18%', c1x: 0.15, c1y: 0.30, c2x: 0.88, c2y: 0.78 },
    { gx: '68%', gy: '62%', c1x: 0.25, c1y: 0.25, c2x: 0.78, c2y: 0.70 },
  ]
  const s = spots[index % spots.length]
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#091230"/>
        <stop offset="55%" stop-color="#0C1538"/>
        <stop offset="100%" stop-color="#111D45"/>
      </linearGradient>
      <radialGradient id="glow" cx="${s.gx}" cy="${s.gy}" r="58%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <circle cx="${Math.round(W * s.c1x)}" cy="${Math.round(H * s.c1y)}" r="230" fill="${accent}" fill-opacity="0.07"/>
    <circle cx="${Math.round(W * s.c2x)}" cy="${Math.round(H * s.c2y)}" r="150" fill="${accent}" fill-opacity="0.10"/>
    <text x="64" y="${H - 46}" font-family="'Noto Sans CJK KR','Noto Sans KR','NanumGothic',sans-serif" font-size="38" font-weight="800" fill="#ffffff" fill-opacity="0.07">${esc(cluster)}</text>
  </svg>`
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer()
  return {
    buffer,
    mimeType: 'image/png',
    filename: `branded-${index}-${Date.now()}.png`,
    alt: `${keyword} 관련 이미지`,
    credit: null,
    creditUrl: null,
  }
}

async function fetchGeminiHeaderImage(keyword, cluster, subject = '') {
  if (!process.env.GEMINI_API_KEY) return null
  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-image' }, { apiVersion: 'v1beta' })
    const prompt = buildImagePrompt(cluster, subject)
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['Text', 'Image'] },
    })
    for (const part of (result.response.candidates?.[0]?.content?.parts ?? [])) {
      if (part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64')
        return {
          buffer,
          mimeType: part.inlineData.mimeType ?? 'image/png',
          filename: `gemini-header-${Date.now()}.png`,
          alt: `${keyword} 관련 AI 생성 이미지`,
          credit: null,
          creditUrl: null,
        }
      }
    }
    throw new Error('이미지 데이터 없음')
  } catch (e) {
    console.log(`  ⚠ Gemini 이미지 생성 실패: ${e.message} — Pexels/브랜드 폴백으로 대체`)
    return null
  }
}

async function fetchGeminiBodyImage(keyword, cluster, index = 0, subject = '') {
  if (!process.env.GEMINI_API_KEY) return null
  const variations = [
    'wide establishing shot, atmospheric depth',
    'close-up detail, shallow depth of field',
    'overhead flat-lay composition, balanced symmetry',
  ]
  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-image' }, { apiVersion: 'v1beta' })
    const prompt = `${buildImagePrompt(cluster, subject)}. ${variations[index % variations.length]}`
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['Text', 'Image'] },
    })
    for (const part of (result.response.candidates?.[0]?.content?.parts ?? [])) {
      if (part.inlineData?.data) {
        return {
          buffer: Buffer.from(part.inlineData.data, 'base64'),
          mimeType: part.inlineData.mimeType ?? 'image/png',
          filename: `gemini-body-${index}-${Date.now()}.png`,
          alt: `${keyword} 관련 AI 생성 이미지`,
          credit: null,
          creditUrl: null,
        }
      }
    }
    throw new Error('이미지 데이터 없음')
  } catch (e) {
    console.log(`  ⚠ Gemini 본문 이미지 생성 실패 (${index}): ${e.message}`)
    return null
  }
}

async function fetchPexelsImage(keyword, cluster, index = 0, subject = '') {
  if (!process.env.PEXELS_API_KEY) return null
  const base = (subject && subject.trim()) ? subject.trim() : (CLUSTER_QUERIES[cluster] ?? ['business technology'])[0]
  const query = encodeURIComponent(base)
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=15&orientation=landscape&page=${(index % 3) + 1}`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    )
    if (!res.ok) throw new Error(`Pexels API ${res.status}`)
    const data = await res.json()
    const photos = data.photos ?? []
    if (!photos.length) throw new Error('검색 결과 없음')
    const photo = photos[(index * 3) % photos.length]
    const imgUrl = photo.src?.large2x || photo.src?.large || photo.src?.original
    const imageRes = await fetch(imgUrl)
    const buffer = Buffer.from(await imageRes.arrayBuffer())
    return {
      buffer,
      mimeType: 'image/jpeg',
      filename: `pexels-${index}-${Date.now()}.jpg`,
      alt: `${keyword} 관련 이미지`,
      credit: null,
      creditUrl: null,
    }
  } catch (e) {
    console.log(`  ⚠ Pexels 이미지 실패 (${index}): ${e.message}`)
    return null
  }
}

async function uploadMediaToWordPress(imageData) {
  if (DRY_RUN) {
    fs.mkdirSync(path.join(DRY_RUN_OUTPUT_DIR, 'images'), { recursive: true })
    const localPath = path.join(DRY_RUN_OUTPUT_DIR, 'images', imageData.filename)
    fs.writeFileSync(localPath, imageData.buffer)
    console.log(`  ✓ [DRY_RUN] 이미지 로컬 저장: ${localPath}`)
    return { id: 0, url: `file://${localPath.replace(/\\/g, '/')}` }
  }
  const ts = `${Date.now()}_${Math.floor(Math.random() * 9999)}`
  const remotePath = `${STAGING_DIR}/onebethub_img_${ts}_${imageData.filename}`
  await sshPutBuffer(imageData.buffer, remotePath)
  const safeAlt = imageData.alt.replace(/"/g, '\\"')
  const mediaId = parseInt(await wpCli(`media import "${remotePath}" --title="${safeAlt}" --alt="${safeAlt}" --porcelain`))
  await wpCli(`post meta update ${mediaId} _wp_attachment_image_alt "${safeAlt}"`)
  const url = await wpCli(`eval "echo wp_get_attachment_url(${mediaId});"`)
  await sshRm(remotePath)
  return { id: mediaId, url }
}

// ── 대표 이미지 합성 (로고 + 제목 오버레이) ─────────────────────
const LOGO_PATH = path.join(__dirname, 'assets', 'onebethub-logo.png') // 미준비 시 자동 생략(경고만 출력)
const HEADER_W  = 1200
const HEADER_H  = 675

function splitTitleLines(title, maxCharsPerLine = null) {
  const isCJK = /[㐀-鿿가-힯]/.test(title)
  if (!isCJK) {
    const limit = maxCharsPerLine ?? 32
    const words = title.split(' ')
    const lines = []
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (test.length > limit && current) { lines.push(current); current = word }
      else current = test
    }
    if (current) lines.push(current)
    return lines.length ? lines : [title]
  }
  const limit = maxCharsPerLine ?? 18
  const chars = title.split('')
  const lines = []
  let current = ''
  for (const ch of chars) {
    current += ch
    if (current.length >= limit) { lines.push(current); current = '' }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [title]
}

async function compositeHeaderImage(imgData, title) {
  try {
    const bg = await sharp(imgData.buffer)
      .resize(HEADER_W, HEADER_H, { fit: 'cover', position: 'centre' })
      .toBuffer()

    let logoBuffer = null, logoW = 0, logoH = 0
    if (fs.existsSync(LOGO_PATH)) {
      logoBuffer = await sharp(fs.readFileSync(LOGO_PATH))
        .resize(200, null, { fit: 'inside', withoutEnlargement: true })
        .toBuffer()
      const logoMeta = await sharp(logoBuffer).metadata()
      logoW = logoMeta.width ?? 200
      logoH = logoMeta.height ?? 80
    } else {
      console.log('  ⚠ 로고 파일 없음 (scripts/assets/onebethub-logo.png) — 로고 생략')
    }

    const lines = splitTitleLines(title)
    const lineH = 68
    const titleH = lines.length * lineH
    const gap = logoBuffer ? 24 : 0
    const blockH = (logoBuffer ? logoH + gap : 0) + titleH
    const blockTop = Math.round((HEADER_H - blockH) / 2)
    const textY = blockTop + (logoBuffer ? logoH + gap : 0) + lineH

    const textEls = lines.map((line, i) =>
      `<text
        x="${HEADER_W / 2}" y="${textY + i * lineH}"
        font-family="'Noto Sans CJK KR','Noto Sans KR','NanumGothic',sans-serif"
        font-size="52" font-weight="700" fill="#ffffff"
        text-anchor="middle" filter="url(#ts)"
      >${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
    ).join('\n')

    const svg = `<svg width="${HEADER_W}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="ts">
          <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(0,0,0,0.9)"/>
        </filter>
      </defs>
      <rect width="${HEADER_W}" height="${HEADER_H}" fill="rgba(0,0,0,0.45)"/>
      ${textEls}
    </svg>`

    const composites = [{ input: Buffer.from(svg), top: 0, left: 0 }]
    if (logoBuffer) {
      composites.push({ input: logoBuffer, left: Math.round((HEADER_W - logoW) / 2), top: blockTop })
    }

    const finalBuffer = await sharp(bg).composite(composites).jpeg({ quality: 92 }).toBuffer()
    return { ...imgData, buffer: finalBuffer, mimeType: 'image/jpeg', filename: `header-composed-${Date.now()}.jpg` }
  } catch (e) {
    console.log(`  ⚠ 이미지 합성 실패: ${e.message} — 원본 이미지 사용`)
    return imgData
  }
}

const BODY_W = 1200
const BODY_H = 675

async function compositeBodyLogo(imgData) {
  try {
    const bg = await sharp(imgData.buffer)
      .resize(BODY_W, BODY_H, { fit: 'cover', position: 'centre' })
      .toBuffer()

    if (!fs.existsSync(LOGO_PATH)) {
      return { ...imgData, buffer: await sharp(bg).jpeg({ quality: 90 }).toBuffer(), mimeType: 'image/jpeg', filename: `body-${Date.now()}.jpg` }
    }

    const logoBuffer = await sharp(fs.readFileSync(LOGO_PATH))
      .resize(150, null, { fit: 'inside', withoutEnlargement: true })
      .toBuffer()
    const lm = await sharp(logoBuffer).metadata()
    const logoW = lm.width ?? 150
    const logoH = lm.height ?? 60

    const padX = 28, padY = 24, padBox = 14
    const left = padX
    const top = BODY_H - logoH - padY
    const svg = `<svg width="${BODY_W}" height="${BODY_H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${left - padBox}" y="${top - padBox}" width="${logoW + padBox * 2}" height="${logoH + padBox * 2}"
            rx="12" ry="12" fill="rgba(12,21,56,0.55)"/>
    </svg>`

    const finalBuffer = await sharp(bg)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: logoBuffer, left, top }])
      .jpeg({ quality: 90 })
      .toBuffer()

    return { ...imgData, buffer: finalBuffer, mimeType: 'image/jpeg', filename: `body-logo-${Date.now()}.jpg` }
  } catch (e) {
    console.log(`  ⚠ 본문 이미지 로고 합성 실패: ${e.message} — 원본 사용`)
    return imgData
  }
}

function insertImagesIntoContent(content, images) {
  if (!images.length) return content
  const lines = content.split('\n')
  const h2Indices = []
  for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('## ')) h2Indices.push(i)
  const pairs = images.map((img, idx) => ({ idx: h2Indices[idx], img }))
    .filter(p => p.idx !== undefined)
    .reverse()
  for (const { idx, img } of pairs) {
    const heading = lines[idx].replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/["\[\]]/g, '').trim()
    const alt = heading || img.alt
    let imageBlock
    if (img.credit && img.creditUrl) {
      imageBlock = `<figure>\n<img src="${img.url}" alt="${alt}" />\n<figcaption>Photo by <a href="${img.creditUrl}" target="_blank" rel="noopener noreferrer">${img.credit}</a></figcaption>\n</figure>`
    } else {
      imageBlock = `![${alt}](${img.url})`
    }
    lines.splice(idx + 1, 0, '', imageBlock, '')
  }
  return lines.join('\n')
}

// ── 영문 번역 ────────────────────────────────────────────────────

async function translateToEnglish(post, page, internalLinks = [], attempt = 1, seoIssues = [], requiredUpwardLinkEn = null) {
  const internalRule = internalLinks.length > 0
    ? `- The Korean content contains internal links to our own site (onebethub.com), which point to Korean articles — this includes both in-body links and the "관련 글" list near the end. REPLACE each one with a DIFFERENT article from the list below (one-to-one, no repeats). Use natural descriptive anchor text (never the raw article title verbatim). Keep ALL external (non-onebethub) links unchanged.\n${internalLinks.map(l => `    * ${l.title} → ${l.url}`).join('\n')}`
    : `- Keep any internal onebethub.com links unchanged.`
  const retryRule = attempt > 1
    ? `\n- CRITICAL — your previous attempt FAILED this rule: the FOCUS_KEYWORD did not appear verbatim in the TITLE. Pick the FOCUS_KEYWORD first, then write the TITLE so it literally contains that exact phrase.`
    : ''
  const seoRule = seoIssues.length > 0
    ? `\n- CRITICAL — your previous attempt FAILED these SEO rules. Fix every one of them:\n${seoIssues.map(i => `    * ${i}`).join('\n')}`
    : ''
  const upwardRule = requiredUpwardLinkEn
    ? `\n- CRITICAL: keep the upward link to ${requiredUpwardLinkEn} inside the first 3 paragraphs of the content. Do not remove or move it out of the first 3 paragraphs.`
    : ''
  const prompt = `Translate the following Korean blog post to natural English.

Rules:${retryRule}${seoRule}${upwardRule}
- Keep all markdown formatting, headings, links, and HTML tags (<aside>, <figure>, etc.)
- Keep the CTA section but translate the surrounding text (preserve its link URL exactly)
- Keep the FAQ section structure ("## Frequently Asked Questions")
- Keep the checklist format (- [ ])
- CRITICAL: Do NOT translate, localize, or modify any URL in any way — never add or remove path segments (e.g. never turn "onebethub.com/slug/" into "onebethub.com/en/slug/" or similar). Every URL must be copied character-for-character from the source, except for the internal-link replacements explicitly listed below (and even those must be copied character-for-character from the list, not invented).
${internalRule}
- Write naturally — not a literal word-for-word translation
- The TITLE must be at most 60 characters — write a complete, natural title within that limit.
- Meta description must be 120~155 characters
- Choose a 2-5 word FOCUS_KEYWORD phrase that: (a) appears verbatim in the title, (b) appears verbatim in the meta description, (c) appears verbatim at least 6 times in the content.

---TITLE---
${post.title}
---DESCRIPTION---
${post.description}
---KEYWORDS---
${post.keywords}
---CONTENT---
${post.content}
---END---

Respond in this exact format:

---TITLE---
[English title — ≤60 characters, a complete phrase, must contain the focus keyword verbatim]
---DESCRIPTION---
[English meta description 120~155 chars — must contain focus keyword verbatim]
---KEYWORDS---
[English keywords, comma separated — first keyword must be the focus keyword]
---FOCUS_KEYWORD---
[2-5 word exact phrase used verbatim in the title, description, and 6+ times in content]
---CONTENT---
[English markdown content — focus keyword must appear verbatim 6+ times]
---END---`

  const message = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const parsed = parseResponse(raw)
  const focusKeyword = extractTag('FOCUS_KEYWORD', raw) || parsed.keywords.split(',')[0]?.trim() || (page.primaryKeyword || page.title)

  if (parsed.title && !parsed.title.toLowerCase().includes(focusKeyword.toLowerCase())) {
    if (attempt < 2) {
      console.log(`  ⚠ EN 제목에 포커스 키워드 없음 → 번역 재시도`)
      return translateToEnglish(post, page, internalLinks, attempt + 1, seoIssues, requiredUpwardLinkEn)
    }
    console.log(`  ⚠ EN 제목-키워드 불일치 지속(재시도 후에도) — 수동 검수 필요`)
  }

  return { ...parsed, focusKeyword }
}

async function localizeExternalLinksToEn(content) {
  const urls = [...content.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map(m => m[1])
  const swap = new Map()
  for (const url of urls) {
    if (url.includes('onebethub.com') || url.includes('7play.co') || swap.has(url)) continue
    const en = url.replace(/:\/\/ko\./, '://www.').replace(/\/kr\//g, '/en/')
    if (en !== url && await isUrlAlive(en)) {
      swap.set(url, en)
      console.log(`  ✓ EN 외부 링크 로케일 치환: ${url} → ${en}`)
    }
  }
  let out = content
  for (const [ko, en] of swap) out = out.split(`](${ko})`).join(`](${en})`)
  return out
}

// ── 유틸리티 ────────────────────────────────────────────────────

function parseResponse(raw) {
  return {
    title: extractTag('TITLE', raw),
    description: extractTag('DESCRIPTION', raw),
    keywords: extractTag('KEYWORDS', raw),
    content: extractTag('CONTENT', raw),
  }
}

function fixChecklist(content) {
  return content.replace(/^- \[x\]/gim, '- [ ]')
}

function stripLeadingTitle(content, title) {
  if (!content || !title) return content
  const lines = content.split('\n')
  const first = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
  const clean = title.replace(/\*\*/g, '').trim()
  if (first === clean || first.startsWith(clean)) return lines.slice(1).join('\n').trimStart()
  return content
}

function extractTag(tag, text) {
  const openTag = `---${tag}---`
  const start = text.indexOf(openTag)
  if (start === -1) return ''
  const contentStart = start + openTag.length
  const nextTag = text.slice(contentStart).match(/---[A-Z_]+---/)
  const end = nextTag ? contentStart + nextTag.index : text.length
  return text.slice(contentStart, end).trim()
}

// ── ClickUp 태스크 생성 ──────────────────────────────────────────
// VOBET과 워크스페이스/리스트를 공유하지 않도록(호스팅/네트워크 지문 분리 원칙) 리스트 ID를 env로 분리.

async function createClickUpTask(title, postUrl, keyword, publishDate) {
  const apiKey = process.env.CLICKUP_API_KEY
  const listId = process.env.CLICKUP_LIST_ID
  if (!apiKey || !listId) {
    console.log('  ⚠ CLICKUP_API_KEY 또는 CLICKUP_LIST_ID 없음 — ClickUp 태스크 생성 건너뜀')
    return
  }

  try {
    const fieldsRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}/field`, {
      headers: { 'Authorization': apiKey },
    })
    const fieldsData = await fieldsRes.json()
    const fields = fieldsData.fields ?? []
    const fieldMap = {}
    for (const f of fields) if (f.name) fieldMap[f.name.toLowerCase()] = f

    const customFields = []
    const getOptLabel = (o) => o.label ?? o.name ?? ''
    const makeValue = (field, opt) => field.type === 'labels' ? [opt.id] : parseInt(opt.orderindex ?? 0)

    const deptField = fieldMap['department'] ?? fieldMap['부서'] ?? fieldMap['dept']
    if (deptField) {
      const opt = (deptField.type_config?.options ?? []).find(o => getOptLabel(o).toLowerCase() === 'seo')
      if (opt) customFields.push({ id: deptField.id, value: makeValue(deptField, opt) })
    }
    const channelField = fieldMap['channel'] ?? fieldMap['채널']
    if (channelField) {
      const opt = (channelField.type_config?.options ?? []).find(o => getOptLabel(o).toLowerCase() === 'blog')
      if (opt) customFields.push({ id: channelField.id, value: makeValue(channelField, opt) })
    }
    const urlField = fieldMap['url']
    if (urlField) customFields.push({ id: urlField.id, value: postUrl })
    const kwField = fieldMap['키워드'] ?? fieldMap['keyword']
    if (kwField) customFields.push({ id: kwField.id, value: keyword })

    const dueTs = new Date(publishDate).setHours(23, 59, 0, 0)

    const listRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, { headers: { 'Authorization': apiKey } })
    const listData = await listRes.json()
    const statuses = listData.statuses ?? []
    const reviewStatus = statuses.find(s => ['in review', 'review', 'in_review'].includes(s.status?.toLowerCase() ?? ''))
      ?? statuses.find(s => (s.status?.toLowerCase() ?? '') === 'open')
      ?? statuses[0]
    const statusName = reviewStatus?.status ?? 'Open'

    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: title,
        status: statusName,
        markdown_description:
          `**포커스 키워드:** ${keyword}\n\n` +
          `**발행 URL:** ${postUrl}\n\n` +
          `**검수 체크리스트**\n` +
          `- [ ] 제목이 자연스러운가?\n` +
          `- [ ] 브랜드 방향과 맞는가? (특정 업체 일방 홍보 없는지 — 어뷰징 방지)\n` +
          `- [ ] 사람이 쓴 것처럼 자연스러운가?\n` +
          `- [ ] FAQ 섹션이 있는가?\n` +
          `- [ ] CTA(7play.co 링크)가 있는가?\n` +
          `- [ ] 상향 링크(있는 경우)가 본문 첫 3문단 안에 있는가?\n` +
          `- [ ] 아웃바운드 링크가 실제로 열리는가?`,
        due_date: dueTs,
        due_date_time: false,
        custom_fields: customFields,
      }),
    })
    const data = await res.json()
    if (data.id) console.log(`  ✓ ClickUp 태스크 생성 완료 (ID: ${data.id}, 상태: ${statusName})`)
    else console.log(`  ⚠ ClickUp 태스크 생성 실패 (HTTP ${res.status}): ${JSON.stringify(data)}`)
  } catch (e) {
    console.log(`  ⚠ ClickUp 태스크 생성 실패: ${e.message}`)
  }
}

// ── Polylang 언어 설정 ───────────────────────────────────────────

async function setPolylangLanguage(postId, langSlug) {
  if (DRY_RUN) { console.log(`  ⓘ [DRY_RUN] Polylang 언어 설정 생략: ${postId} → ${langSlug}`); return }
  try {
    await wpCli(`eval "if(function_exists('pll_set_post_language')) pll_set_post_language(${postId}, '${langSlug}');"`)
    console.log(`  ✓ Polylang 언어 설정: Post ${postId} → ${langSlug}`)
  } catch (e) {
    console.log(`  ⚠ Polylang 언어 설정 실패 (${postId}): ${e.message}`)
  }
}

async function linkPolylangTranslations(koId, enId) {
  if (DRY_RUN) { console.log(`  ⓘ [DRY_RUN] Polylang KO↔EN 연결 생략 (${koId} ↔ ${enId})`); return }
  try {
    await wpCli(`eval "if(function_exists('pll_save_post_translations')) pll_save_post_translations(array('ko' => ${koId}, 'en' => ${enId}));"`)
    console.log(`  ✓ Polylang KO↔EN 번역 페어 연결 (${koId} ↔ ${enId})`)
  } catch (e) {
    console.log(`  ⚠ Polylang 번역 연결 실패: ${e.message}`)
  }
}

// ── 메인 ────────────────────────────────────────────────────────

async function main() {
  const required = DRY_RUN
    ? ['ANTHROPIC_API_KEY']
    : ['ANTHROPIC_API_KEY', 'WORDPRESS_URL', 'SSH_HOST', 'SSH_USER']
  if (!DRY_RUN && !process.env.SSH_PRIVATE_KEY && !process.env.SSH_PASSWORD) {
    console.error('Missing required env: SSH_PRIVATE_KEY or SSH_PASSWORD')
    process.exit(1)
  }
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`${key} 환경변수가 설정되지 않았습니다.`)
      process.exit(1)
    }
  }
  if (DRY_RUN) console.log('  🧪 DRY_RUN 모드 — WordPress/SSH 발행 없이 콘텐츠 파이프라인만 로컬로 실행합니다.')

  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasGemini = !!process.env.GEMINI_API_KEY
  const hasPexels = !!process.env.PEXELS_API_KEY
  const hasSerper = !!process.env.SERPER_API_KEY
  if (!hasOpenAI) console.log('  ⚠ OPENAI_API_KEY 없음 — GPT-4o-mini 검증 건너뜀')
  if (!hasGemini) console.log('  ⚠ GEMINI_API_KEY 없음 — AI 이미지 생성 건너뜀 (Pexels/브랜드로 폴백)')
  if (!hasPexels) console.log('  ⚠ PEXELS_API_KEY 없음 — 주제 맞춤 사진 생략, 브랜드 그라데이션만 사용')
  if (!hasSerper) console.log('  ⚠ SERPER_API_KEY 없음 — 아웃바운드 링크 생략 (hallucination 방지)')

  const pages = loadKeywordMap()
  const linkMap = loadLinkMap()

  await tg(`🚀 <b>OneBetHub 블로그 파이프라인 시작</b>${DRY_RUN ? ' (DRY_RUN)' : ''}`)

  // 클러스터 완결 감지 — 신규 발행 전에 먼저 처리(하위 페이지가 방금 막 다 채워졌을 수 있음)
  let log = loadPublishedLog()
  await maybeUpdateCompletedHubs(pages, linkMap, log)
  log = loadPublishedLog()

  // Stage 1
  console.log('\n[Stage 1] 페이지 선택 (클러스터 순서 고정: 임대→분양→제작→가격→토토개발)')
  const page = await pickPage(pages, log)
  if (!page) {
    console.log('  ✓ 22개 페이지 전부 발행 완료 — 더 이상 발행할 페이지 없음')
    await tg('✅ <b>키워드맵 22페이지 전부 발행 완료</b>\n추가 페이지가 필요하면 keyword-map.json/link-map.json을 확장하세요.')
    return
  }

  const ctaUrl = resolveCtaUrl(page, pages, log)
  const focusKeyword = page.primaryKeyword || page.title

  // 상향 링크 대상 해석 (SEO 게이트 11항목 + 프롬프트 강제 주입)
  const upEdge = getUpwardEdge(linkMap, page.id)
  let requiredUpwardLink = null
  if (upEdge) {
    const targetPage = pages.find(p => p.id === upEdge.to)
    const url = resolvePageUrlSync(targetPage, 'ko', log)
    if (url) requiredUpwardLink = { url, anchorHint: upEdge.anchorHint }
    else console.log(`  ⚠ 상향링크 대상(${upEdge.to}) URL 해석 실패 — 이번 글은 상향링크 게이트 생략`)
  }
  // T2-00(유입 허브)의 cross 링크도 "필수 상향 성격" 링크로 취급해 함께 강제한다.
  const crossEdges = getCrossEdges(linkMap, page.id)
  const crossLinks = crossEdges.map(e => {
    const t = pages.find(p => p.id === e.to)
    const url = resolvePageUrlSync(t, 'ko', log)
    return url ? { title: t.title, url, anchor: e.anchorHint } : null
  }).filter(Boolean)

  console.log('\n[아웃바운드링크] 실제 출처 검색 중...')
  const outboundLinks = await searchOutboundLinks(focusKeyword)
  if (outboundLinks.length > 0) {
    console.log(`  ✓ ${outboundLinks.length}개 출처 확보`)
  } else {
    console.log('  ⚠ 출처 없음 — 이번 글 아웃바운드 링크 생략 (hallucination 방지)')
  }

  console.log('\n[내부링크] 관련 발행 글 검색 중...')
  const internalLinks = [
    ...crossLinks.map(l => ({ title: l.title, url: l.url })),
    ...fetchInternalLinkCandidates(page, pages, log, 'ko', 3, [upEdge?.to].filter(Boolean)),
  ].slice(0, 5)
  if (internalLinks.length > 0) console.log(`  ✓ 내부 링크 후보 ${internalLinks.length}개`)
  else console.log('  ⚠ 관련 내부 글 없음 — 내부 링크 생략 (초기 발행분에서는 정상)')

  let post = null
  let attempt = 0
  let seoGateIssues = []

  while (attempt <= MAX_RETRIES) {
    attempt++
    if (attempt > 1) console.log(`\n  재시도 ${attempt - 1}/${MAX_RETRIES}...`)

    console.log(`\n[Stage 2] 콘텐츠 생성 (시도 ${attempt})`)
    const draft = await generatePost(page, outboundLinks, internalLinks, requiredUpwardLink, ctaUrl)

    if (!draft.title || !draft.content) {
      console.error('  응답 파싱 실패')
      if (attempt > MAX_RETRIES) process.exit(1)
      continue
    }

    console.log('\n[Stage 3] 휴머나이징')
    post = await humanizePost(draft, page, ctaUrl)
    post = { ...post, content: ensureCta(post.content, page, ctaUrl) }

    console.log('\n[Stage 4] SEO 품질 검사 (11항목)')
    const seoIssues = runSeoChecks(post, page, requiredUpwardLink, ctaUrl)
    seoGateIssues = seoIssues

    if (seoIssues.length > 0) {
      console.log(`  ✗ SEO 검사 실패 (${seoIssues.length}건):`)
      seoIssues.forEach(i => console.log(`    - ${i}`))
      if (attempt > MAX_RETRIES) { console.log('  ⚠ 최대 재시도 초과 — 현재 버전으로 진행'); break }
      continue
    }
    console.log('  ✓ SEO 검사 통과')
    break
  }

  // Stage 5
  let claudeAgentResult, gptResult, geminiResult
  let revisionCount = 0
  let verificationPassed = false

  for (let round = 1; round <= MAX_AI_REVISIONS + 1; round++) {
    console.log(`\n[Stage 5] 멀티모델 검증 (${round > 1 ? `재검증 ${round - 1}회차` : '1차'}) — Claude-검증 + GPT-4o-mini + Gemini 동시 실행`)
    ;[claudeAgentResult, gptResult, geminiResult] = await Promise.all([
      verifyWithClaudeAgent(post, page),
      verifyWithGPT4(post, page),
      verifyWithGemini(post, page),
    ])

    const claudeLabel = claudeAgentResult.skipped ? '건너뜀' : `${claudeAgentResult.score}/10 (${claudeAgentResult.verdict})`
    const gptLabel = gptResult.skipped ? '건너뜀' : `${gptResult.score}/10 (${gptResult.verdict})`
    const geminiLabel = geminiResult.skipped ? '건너뜀' : `${geminiResult.score}/10 (${geminiResult.verdict})`
    console.log(`  Claude-검증: ${claudeLabel}`)
    console.log(`  GPT-4o-mini: ${gptLabel}`)
    console.log(`  Gemini: ${geminiLabel}`)

    const allPass = claudeAgentResult.verdict === 'PASS' && gptResult.verdict === 'PASS' && geminiResult.verdict === 'PASS'
    if (allPass) { verificationPassed = true; console.log(`  ✓ 멀티모델 검증 통과 (3/3)`); break }
    if (revisionCount >= MAX_AI_REVISIONS) { console.log(`  ⚠ 최대 재작성 횟수 도달 — 검증 미통과 → draft로 저장`); break }

    revisionCount++
    console.log(`\n  ✗ 검증 미통과 — 재작성 ${revisionCount}/${MAX_AI_REVISIONS}회차`)
    post = await reviseWithFeedback(post, page, claudeAgentResult, gptResult, geminiResult, ctaUrl)
    post = { ...post, content: ensureCta(post.content, page, ctaUrl) }
  }

  post = { ...post, description: seoDescription(post.description) }
  const postStatus = verificationPassed ? 'publish' : 'draft'
  if (!verificationPassed) {
    console.log(`  ⚠ 검증 미통과 → KO·EN 모두 draft 저장 (검수 후 수동 발행 필요)`)
  }

  const mkVer = r => r.skipped ? { skipped: true } : { score: r.score, verdict: r.verdict, issues: (r.issues || []).slice(0, 12) }
  const genTrace = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    runEnv: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
    runId: process.env.GITHUB_RUN_ID || null,
    pageId: page.id,
    cluster: page.cluster,
    focusKeyword,
    stage2Attempts: attempt,
    stage4SeoIssues: seoGateIssues,
    revisions: revisionCount,
    verificationPassed,
    postStatus,
    dryRun: DRY_RUN,
    verification: { claude: mkVer(claudeAgentResult), gpt4oMini: mkVer(gptResult), gemini: mkVer(geminiResult) },
  }
  const genTraceJson = JSON.stringify(genTrace)

  const imageSubject = await getImageSubject(page)

  console.log('\n[이미지] 헤더 이미지 준비 중...')
  let featuredImg = null
  if (hasGemini) {
    featuredImg = await fetchGeminiHeaderImage(focusKeyword, page.cluster, imageSubject)
    if (featuredImg) console.log('  ✓ Gemini AI 헤더 이미지 생성 성공')
  }
  if (!featuredImg) {
    featuredImg = await fetchPexelsImage(focusKeyword, page.cluster, 0, imageSubject)
    if (featuredImg) console.log('  ✓ Pexels 헤더 이미지')
  }
  if (!featuredImg) {
    featuredImg = await generateBrandedBg(focusKeyword, page.cluster, 0)
    console.log('  ✓ 브랜드 자체 제작 헤더 이미지 (AI·Pexels 모두 실패 폴백)')
  }

  console.log('  본문 이미지 준비 중 (AI→Pexels→브랜드 + 좌하단 로고)...')
  const [bodyImg1, bodyImg2, bodyImg3] = await Promise.all([1, 2, 3].map(async i => {
    let img = hasGemini ? await fetchGeminiBodyImage(focusKeyword, page.cluster, i, imageSubject) : null
    if (!img) img = await fetchPexelsImage(focusKeyword, page.cluster, i, imageSubject)
    if (!img) img = await generateBrandedBg(focusKeyword, page.cluster, i)
    return img
  }))

  const rawFeaturedImg = featuredImg
  if (featuredImg) {
    featuredImg = await compositeHeaderImage(featuredImg, post.title)
    console.log('  ✓ 이미지 합성 완료')
  }

  let featuredMediaId, featuredMediaUrl = null
  if (featuredImg) {
    try {
      const uploaded = await uploadMediaToWordPress(featuredImg)
      featuredMediaId = uploaded.id
      featuredMediaUrl = uploaded.url ?? null
      console.log(`  ✓ 헤더 이미지 업로드 (ID: ${uploaded.id})`)
    } catch (e) {
      console.log(`  ⚠ 헤더 이미지 업로드 실패: ${e.message}`)
    }
  }

  let bodyImageCount = 0
  const bodyImageData = []
  for (const img of [bodyImg1, bodyImg2, bodyImg3]) {
    if (!img) continue
    try {
      const finalImg = img.credit === null ? await compositeBodyLogo(img) : img
      const uploaded = await uploadMediaToWordPress(finalImg)
      bodyImageData.push({ url: uploaded.url, alt: finalImg.alt, credit: img.credit, creditUrl: img.creditUrl })
      bodyImageCount++
    } catch (e) {
      console.log(`  ⚠ 본문 이미지 업로드 실패: ${e.message}`)
    }
  }
  const bodyImageInserted = bodyImageCount > 0

  const contentForTranslation = post.content
  if (bodyImageData.length > 0) {
    post = { ...post, content: insertImagesIntoContent(post.content, bodyImageData) }
  }

  console.log('\n[저장] WordPress KO 저장 중...')
  let htmlContent = await marked(post.content)
  const injectedKoJsonld = buildJsonld(post, { lang: 'ko', section: page.cluster, imageUrl: featuredMediaUrl })
  htmlContent = `<script type="application/ld+json">\n${injectedKoJsonld}\n</script>\n\n${htmlContent}`

  const categoryId = await getOrCreateTaxonomy('categories', page.cluster)
  const koTagNames = [...(page.tags || []), ...post.keywords.split(',').map(k => k.trim()).filter(Boolean)]
    .filter((tag, i, arr) => arr.indexOf(tag) === i).slice(0, 7)
  // 태그마다 wp-cli 채널을 동시에(Promise.all) 여는 방식은 이 서버(Cloudways)의 동시 SSH 채널 한도를
  // 넘겨 "Channel open failure: open failed"를 유발하는 것으로 실측 확인됐다 — 순차 처리로 변경.
  const tagIds = []
  if (!DRY_RUN) {
    for (const tag of koTagNames) tagIds.push(await getOrCreateTaxonomy('tags', tag))
  }

  const koSlug = page.slug // keyword-map.json에 이미 SEO 슬러그가 고정돼 있으므로 그대로 사용

  const result = await createWordPressPost({
    title: post.title,
    content: htmlContent,
    categories: [categoryId],
    tags: tagIds,
    slug: koSlug,
    status: postStatus,
    meta: {
      rank_math_description: post.description,
      rank_math_focus_keyword: focusKeyword,
      rank_math_title: seoTitle(post.title),
      _onebethub_gen_trace: genTraceJson,
    },
    featured_media: featuredMediaId ?? null,
    author_login: AUTHOR_LOGIN,
  })

  let koPostUrl
  if (DRY_RUN) {
    koPostUrl = `${WP_URL}/${koSlug}/`
  } else {
    const editLink = `${WP_URL}/wp-admin/post.php?post=${result.id}&action=edit`
    // Polylang 언어 지정을 먼저 해야 get_permalink()가 올바른 URL을 돌려준다(기본 언어인 ko는
    // 접두 디렉터리가 없어 순서 무관하지만, en은 아래에서 접두 디렉터리 여부가 순서에 좌우되므로
    // 이 시점부터 양쪽 다 "언어 지정 → permalink 조회" 순서로 통일해둔다).
    await setPolylangLanguage(result.id, 'ko')
    koPostUrl = await wpCli(`eval "echo get_permalink(${result.id});"`)
    console.log(`  ✓ KO ${postStatus === 'publish' ? '공개 발행' : 'draft 저장'} 완료 (ID: ${result.id})`)
    console.log(`  KO 검토: ${editLink}`)
  }

  log = appendPublishedLog({ id: page.id, publishedAt: new Date().toISOString(), lang: 'ko', title: post.title, url: koPostUrl, status: postStatus })

  console.log('\n[ClickUp] 검수 태스크 생성 중...')
  await createClickUpTask(post.title, koPostUrl, focusKeyword, new Date().toISOString())

  console.log('\n[번역] 영문 번역 중...')
  let enPostUrl = null
  try {
    const enInternalLinks = fetchInternalLinkCandidates(page, pages, log, 'en', 6, [upEdge?.to].filter(Boolean))
    const upEdgeEnUrl = upEdge ? resolvePageUrlSync(pages.find(p => p.id === upEdge.to), 'en', log) : null

    let enPost = await translateToEnglish({ ...post, content: contentForTranslation }, page, enInternalLinks, 1, [], upEdgeEnUrl)

    let enSeoIssues = []
    if (enPost.title && enPost.content) {
      console.log('\n[번역-게이트] EN SEO 품질 검사 (11항목)')
      enSeoIssues = runSeoChecksEn(enPost, enPost.focusKeyword || focusKeyword, upEdgeEnUrl, page, ctaUrl)
      if (enSeoIssues.length > 0) {
        console.log(`  ✗ EN SEO 검사 실패 (${enSeoIssues.length}건) — 재번역 1회`)
        const enRetry = await translateToEnglish({ ...post, content: contentForTranslation }, page, enInternalLinks, 1, enSeoIssues, upEdgeEnUrl)
        if (enRetry.title && enRetry.content) {
          const retryIssues = runSeoChecksEn(enRetry, enRetry.focusKeyword || focusKeyword, upEdgeEnUrl, page, ctaUrl)
          if (retryIssues.length < enSeoIssues.length) { enPost = enRetry; enSeoIssues = retryIssues }
        }
      }
      enPost = { ...enPost, description: seoDescription(enPost.description) }
    }

    if (enPost.title && enPost.content) {
      enPost.content = await localizeExternalLinksToEn(enPost.content)
      if (bodyImageData.length > 0) {
        const enBodyImages = bodyImageData.map(d => ({ ...d, alt: `Image related to ${enPost.focusKeyword || focusKeyword}` }))
        enPost.content = insertImagesIntoContent(enPost.content, enBodyImages)
      }
      const enClusterName = EN_CLUSTER_MAP[page.cluster] ?? page.cluster
      const enCategoryId = await getOrCreateTaxonomy('categories', enClusterName)
      const enTagNames = enPost.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5)
      // KO 태그와 동일한 이유(동시 채널 한도)로 순차 처리.
      const enTagIds = []
      if (!DRY_RUN) {
        for (const tag of enTagNames) enTagIds.push(await getOrCreateTaxonomy('tags', tag))
      }

      let enFeaturedMediaId = featuredMediaId ?? null
      let enFeaturedMediaUrl = featuredMediaUrl
      if (rawFeaturedImg) {
        try {
          const enFeaturedImg = await compositeHeaderImage(rawFeaturedImg, enPost.title)
          const enUploaded = await uploadMediaToWordPress({ ...enFeaturedImg, alt: `Image related to ${enPost.focusKeyword || enPost.title}` })
          enFeaturedMediaId = enUploaded.id
          enFeaturedMediaUrl = enUploaded.url ?? enFeaturedMediaUrl
        } catch (e) {
          console.log(`  ⚠ EN 헤더 이미지 합성 실패: ${e.message} — KO 이미지 공유`)
        }
      }

      let enHtml = await marked(enPost.content)
      const enJsonld = buildJsonld(enPost, { lang: 'en', section: enClusterName, imageUrl: enFeaturedMediaUrl })
      enHtml = `<script type="application/ld+json">\n${enJsonld}\n</script>\n\n${enHtml}`

      const enFocusKeyword = enPost.focusKeyword || enTagNames[0] || focusKeyword
      const enSlug = `${page.slug}-en`.slice(0, 60) // KO 슬러그가 고정 SEO 슬러그이므로 EN은 접미사로 구분

      const enResult = await createWordPressPost({
        title: enPost.title,
        content: enHtml,
        categories: [enCategoryId],
        tags: enTagIds,
        slug: enSlug,
        status: postStatus,
        meta: {
          rank_math_description: enPost.description,
          rank_math_focus_keyword: enFocusKeyword,
          rank_math_title: seoTitle(enPost.title),
          _onebethub_gen_trace: genTraceJson,
          _onebethub_en_seo_issues: JSON.stringify(enSeoIssues),
        },
        featured_media: enFeaturedMediaId,
        author_login: AUTHOR_LOGIN,
      })

      if (DRY_RUN) {
        // Polylang 활성화(2026-09-18) 이후 실제 퍼머링크는 기본 언어(ko)가 아닌 en에 `/en/` 접두
        // 디렉터리가 붙는다(directory 방식 URL 모디피케이션이 기본값) — 예전엔 접두 없음이 맞았지만
        // 지금은 아래 실제 실행 분기와 동일하게 접두를 반영해야 DRY_RUN 미리보기가 실제와 일치한다.
        enPostUrl = `${WP_URL}/en/${enSlug}/`
      } else {
        // KO와 마찬가지로 언어 지정을 먼저 해야 get_permalink()가 `/en/` 접두 URL을 돌려준다 —
        // 순서가 바뀌면(언어 지정 전에 permalink부터 조회) 접두 없는 옛 URL이 원장에 기록되는 버그가 남는다.
        await setPolylangLanguage(enResult.id, 'en')
        await linkPolylangTranslations(result.id, enResult.id)
        enPostUrl = await wpCli(`eval "echo get_permalink(${enResult.id});"`)
        console.log(`  ✓ EN ${postStatus === 'publish' ? '공개 발행' : 'draft 저장'} 완료 (ID: ${enResult.id})`)
      }
      appendPublishedLog({ id: page.id, publishedAt: new Date().toISOString(), lang: 'en', title: enPost.title, url: enPostUrl, status: postStatus })
    }
  } catch (e) {
    console.log(`  ⚠ 영문 번역/저장 실패: ${e.message}`)
  }

  console.log('\n✅ 파이프라인 완료')
  console.log(`  페이지: [${page.cluster}/${page.tier}] ${page.id} — ${post.title}`)
  console.log(`  상태: ${postStatus} | 재작성: ${revisionCount}회`)
  console.log(`  KO: ${koPostUrl}`)
  if (enPostUrl) console.log(`  EN: ${enPostUrl}`)

  const vi = (r) => r.skipped ? '⚠️' : r.verdict === 'PASS' ? '✅' : '❌'
  await tg(
    `✅ <b>새 글 처리 완료${DRY_RUN ? ' (DRY_RUN)' : ''}</b>\n\n` +
    `📝 <b>${post.title}</b>\n[${page.cluster}/${page.tier}] ${page.id}\n\n` +
    `🤖 검증: ${vi(claudeAgentResult)}Claude ${vi(gptResult)}GPT ${vi(geminiResult)}Gemini\n` +
    `상태: ${postStatus}\n\n` +
    `🇰🇷 ${koPostUrl}` + (enPostUrl ? `\n🇺🇸 ${enPostUrl}` : '')
  )
}

main()
  .then(() => sshClose())
  .catch(async err => {
    console.error('\n오류:', err.message)
    await tg(`❌ <b>파이프라인 오류 발생</b>\n\n<code>${err.message}</code>`)
    await sshClose()
    process.exit(1)
  })
