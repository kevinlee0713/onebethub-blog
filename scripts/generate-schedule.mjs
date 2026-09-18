#!/usr/bin/env node
/**
 * PUBLISHING_SCHEDULE.md를 keyword-map.json + data/published-log.json에서 매번 다시 계산해서 쓴다.
 * generate-post.mjs가 실발행(!DRY_RUN) 성공 후 regenerateSchedule()을 그대로 호출하므로, 별도 손질
 * 없이도 다음 실행마다 최신 상태로 갱신된다 — 수동 실행도 가능: `node scripts/generate-schedule.mjs`.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const KEYWORD_MAP_FILE = path.join(__dirname, 'keyword-map.json')
const PUBLISHED_LOG_FILE = path.join(ROOT, 'data', 'published-log.json')
const OUT_FILE = path.join(ROOT, 'PUBLISHING_SCHEDULE.md')

const CLUSTER_ORDER = ['임대', '분양', '제작', '가격', '토토개발']
const clusterIdx = (c) => { const i = CLUSTER_ORDER.indexOf(c); return i === -1 ? 999 : i }
const tierRank = (p) => (p.tier === 'T1' ? 0 : 1)

function sortedPages(pages) {
  return [...pages].sort((a, b) =>
    clusterIdx(a.cluster) - clusterIdx(b.cluster) ||
    tierRank(a) - tierRank(b) ||
    (a.week ?? 999) - (b.week ?? 999)
  )
}

// 다음 화요일부터 매주 1페이지씩 발행된다고 가정한 예상일 — 실제 발행 트리거가 아니라 참고용 추정치.
function nextTuesdayFrom(date) {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun..6=Sat
  const daysAhead = ((2 - day) + 7) % 7 || 7
  d.setDate(d.getDate() + daysAhead)
  return d
}

function fmt(date) {
  return date.toISOString().slice(0, 10)
}

export function regenerateSchedule() {
  const pages = JSON.parse(fs.readFileSync(KEYWORD_MAP_FILE, 'utf-8'))
  const log = fs.existsSync(PUBLISHED_LOG_FILE) ? JSON.parse(fs.readFileSync(PUBLISHED_LOG_FILE, 'utf-8')) : []
  const ordered = sortedPages(pages)

  let estimateCursor = nextTuesdayFrom(new Date())
  const rows = []
  let publishedCount = 0

  for (const [i, page] of ordered.entries()) {
    const koEntry = log.find((e) => e.id === page.id && e.lang === 'ko' && e.status === 'publish')
    const isPublished = !!koEntry
    if (isPublished) publishedCount++

    const dateStr = isPublished ? fmt(new Date(koEntry.publishedAt)) : fmt(estimateCursor)
    if (!isPublished) estimateCursor.setDate(estimateCursor.getDate() + 7)

    const status = isPublished ? '✅ 발행완료' : '⏳ 예정'
    const assignee = page.clickupCode ? `⭐ Kevin (${page.clickupCode})` : '—'
    const btag = page.btag ? page.btag.replace('https://7play.co/?btag=', '') : '—'
    const url = isPublished ? koEntry.url : '—'

    rows.push({
      order: i + 1,
      cluster: page.cluster,
      tier: page.tier,
      id: page.id,
      title: page.title,
      status,
      date: dateStr,
      assignee,
      btag,
      url,
    })
  }

  const lines = []
  lines.push('# OneBetHub 발행 스케줄표')
  lines.push('')
  lines.push('> 자동 생성 파일 — 직접 수정하지 말 것. `node scripts/generate-schedule.mjs`로 재생성되며,')
  lines.push('> 실발행 파이프라인(`generate-post.mjs`) 실행 시마다 자동으로 다시 계산됨.')
  lines.push(`> 마지막 갱신: ${new Date().toISOString()} · 발행완료 ${publishedCount}/${ordered.length}`)
  lines.push('')
  lines.push('⚠️ "발행완료" 날짜는 실제 발행일이지만, "예정" 날짜는 매주 화요일 GitHub Actions cron 기준')
  lines.push('**추정치**일 뿐이다 — ClickUp due date와 마찬가지로 실제 발행을 트리거하지 않으며, 파이프라인이')
  lines.push('건너뛰거나 실패하면 실제 발행일과 어긋날 수 있다. 실제 발행 순서는 항상 보장됨(클러스터 고정')
  lines.push('순서 → T1 허브 먼저 → week 오름차순).')
  lines.push('')
  lines.push('| # | 클러스터/티어 | ID | 제목 | 상태 | 날짜 | 담당 | Btag 코드 | 발행 URL |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    lines.push(`| ${r.order} | ${r.cluster}/${r.tier} | ${r.id} | ${r.title} | ${r.status} | ${r.date} | ${r.assignee} | ${r.btag} | ${r.url === '—' ? '—' : `[링크](${r.url})`} |`)
  }
  lines.push('')

  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf-8')
  return { publishedCount, total: ordered.length }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const { publishedCount, total } = regenerateSchedule()
  console.log(`✓ PUBLISHING_SCHEDULE.md 갱신 완료 (발행완료 ${publishedCount}/${total})`)
}
