import type { LayerDoc, LayerNode } from './schema'

/**
 * 요구사항(REQ) → 화면 안 레이어(컴포넌트 · 항목) 찾기. 문서에서 REQ 를 누르면 캔버스가 그 레이어로 포커스해요.
 * 1. 직접 연결: 레이어의 reqs 에 그 REQ 가 있으면 그것(문서 기반으로 화면을 만들 때 · 레이어를 고른 채 REQ 를 만들 때 붙어요)
 * 2. 짐작: REQ 문장과 레이어 이름 · 글자를 맞춰 가장 비슷한 레이어 하나 —
 *    이름이 문장에 그대로 들어 있으면(예: '차량 카드') 가장 높게, 아니면 두 글자 묶음(바이그램)이 겹치는 만큼.
 *    기본 이름(Rectangle 3 · Frame 2 · Text …)은 이름으로 치지 않아요. 점수가 낮으면 못 찾은 것(빈 목록)
 */
const compact = (s: string) => s.replace(/[\s·・\-_/.,()[\]:;!?'"“”‘’]+/g, '').toLowerCase()
const DEFAULT_NAME = /^(rectangle|ellipse|frame|group|text|line|arrow|vector|polygon|star|section|image|boolean|union|subtract|intersect|exclude|component|instance)( \d+)?$/i
function bigrams(s: string): Set<string> {
  const c = compact(s)
  const out = new Set<string>()
  for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2))
  return out
}
/** 레이어 안 글자: 텍스트 레이어 글자, 인스턴스는 글자 속성 값들 */
function contentOf(n: LayerNode): string {
  if (n.text) return n.text
  if (n.props) return Object.values(n.props).filter((v): v is string => typeof v === 'string' && v.length > 1 && !/^#|^[a-z_]+$/.test(v)).join(' ')
  return ''
}

export function matchReqLayers(doc: LayerDoc, reqId: string, reqText: string): string[] {
  const nodes = Object.values(doc.nodes).filter((n) => !n.hidden)
  const direct = nodes.filter((n) => n.reqs?.includes(reqId)).map((n) => n.id)
  if (direct.length) return direct
  // 기억해 둔 짝이 있으면 그것만(그린 요소를 지웠으면 빈 목록 — 다른 레이어로 다시 짐작하지 않아요)
  const bound = doc.reqBind?.[reqId]
  if (bound) return bound.filter((id) => doc.nodes[id] && !doc.nodes[id]!.hidden)
  return guessReqLayers(doc, reqId, reqText)
}
/** 그린 요소를 지워서 '그려지지 않음'인가: 짝을 기억해 뒀는데 그 요소가 모두 사라졌고, 직접 연결도 없을 때 */
export function reqLost(doc: LayerDoc, reqId: string): boolean {
  const bound = doc.reqBind?.[reqId]
  if (!bound?.length || bound.some((id) => doc.nodes[id])) return false
  return !Object.values(doc.nodes).some((n) => n.reqs?.includes(reqId))
}
/** 짝을 아직 기억하지 않았을 때: 직접 연결 → 이름 · 글자 짐작 */
export function guessReqLayers(doc: LayerDoc, reqId: string, reqText: string): string[] {
  const nodes = Object.values(doc.nodes).filter((n) => !n.hidden)
  const direct = nodes.filter((n) => n.reqs?.includes(reqId)).map((n) => n.id)
  if (direct.length) return direct
  const text = compact(reqText)
  const grams = bigrams(reqText)
  if (!text) return []
  let best: { id: string; score: number; area: number } | null = null
  for (const n of nodes) {
    let score = 0
    const name = n.name?.trim() ?? ''
    if (name && !DEFAULT_NAME.test(name)) {
      const cn = compact(name)
      if (cn.length >= 2 && text.includes(cn)) score += 10 + cn.length
      else {
        const g = [...bigrams(name)].filter((x) => grams.has(x)).length
        if (g >= 2) score += 3 * g
      }
    }
    const c = contentOf(n)
    if (c) score += Math.min(12, 2 * [...bigrams(c)].filter((x) => grams.has(x)).length)
    const area = n.w * n.h
    // 같은 점수면 더 작은(구체적인) 레이어
    if (score > 0 && (!best || score > best.score || (score === best.score && area < best.area))) best = { id: n.id, score, area }
  }
  return best && best.score >= 6 ? [best.id] : []
}
