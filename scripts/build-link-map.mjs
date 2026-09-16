/**
 * link-map.json 생성기 (유지보수용) — keyword-map.json의 cluster/pushesTo/tier 로부터
 * 내부링크 매핑표를 재구성한다. keyword-map.json이 바뀌면 이 스크립트를 다시 돌려
 * link-map.json을 재생성한다 (수동 편집 대신 이 스크립트를 소스로 유지).
 *
 * 엣지 타입:
 *   up    — 하위 페이지(T2/T3) → pushesTo 대상. 본문 첫 3문단 안에 앵커 필수(SEO 게이트 강제 항목).
 *   down  — 클러스터 허브(T1) → 같은 클러스터의 모든 T2/T3. 클러스터가 "완결"(모든 하위 발행)된 뒤
 *           허브 글을 업데이트하며 일괄 삽입. 본문 위치는 자유(문맥).
 *   cross — T2-00(유입 허브) → T1-01/T1-02/T1-03. 클러스터 경계를 넘는 허브 간 홍보 링크.
 *
 * 실행: node scripts/build-link-map.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pages = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyword-map.json'), 'utf-8'))
const byId = new Map(pages.map(p => [p.id, p]))

const edges = []

// 1. 상향 링크(up) — pushesTo가 있는 모든 페이지 → 대상. 본문 첫 3문단 필수.
for (const p of pages) {
  if (!p.pushesTo) continue
  const target = byId.get(p.pushesTo)
  if (!target) { console.warn(`⚠ pushesTo 대상 없음: ${p.id} → ${p.pushesTo}`); continue }
  edges.push({
    from: p.id,
    to: p.pushesTo,
    type: 'up',
    required: true,
    position: 'early', // 본문 첫 3문단 안
    anchorHint: `${target.primaryKeyword || target.title} 자세히 보기`,
  })
}

// 2. 하향 링크(down) — 각 클러스터의 T1 허브 → 같은 클러스터의 나머지 모든 페이지(T2/T3).
//    클러스터 완결(그 클러스터의 모든 페이지가 발행됨) 후에만 허브 글을 업데이트하며 일괄 삽입.
const clusters = [...new Set(pages.map(p => p.cluster))]
for (const cluster of clusters) {
  const clusterPages = pages.filter(p => p.cluster === cluster)
  const hub = clusterPages.find(p => p.tier === 'T1')
  if (!hub) continue
  for (const child of clusterPages) {
    if (child.id === hub.id) continue
    // T2-00(유입 허브)은 클러스터 하향 대상에서 제외 — 이 글은 클러스터 하위 페이지가 아니라
    // 전체 도입방식을 비교하는 상위 유입 허브다. T2-00 관련 링크는 아래 3번(cross)에서 별도 처리.
    if (child.id === 'T2-00') continue
    edges.push({
      from: hub.id,
      to: child.id,
      type: 'down',
      required: false,
      position: 'cluster_complete', // 클러스터 전체 발행 완료 후 허브 글 update 스텝에서 일괄 삽입
      anchorHint: `${child.primaryKeyword || child.title}`,
    })
  }
}

// 3. 교차 링크(cross) — T2-00(유입 허브) → T1-01/T1-02/T1-03.
const inflowHub = byId.get('T2-00')
if (inflowHub) {
  for (const targetId of ['T1-01', 'T1-02', 'T1-03']) {
    const target = byId.get(targetId)
    if (!target) continue
    edges.push({
      from: 'T2-00',
      to: targetId,
      type: 'cross',
      required: true,
      position: 'contextual', // 문맥상 자연스러운 위치(임대/분양/제작 방식 설명 구간)
      anchorHint: `${target.primaryKeyword || target.title}`,
    })
  }
}

fs.writeFileSync(
  path.join(__dirname, 'link-map.json'),
  JSON.stringify(edges, null, 2) + '\n',
  'utf-8'
)
console.log(`✓ link-map.json 생성 완료 — 엣지 ${edges.length}개 (up: ${edges.filter(e=>e.type==='up').length}, down: ${edges.filter(e=>e.type==='down').length}, cross: ${edges.filter(e=>e.type==='cross').length})`)
