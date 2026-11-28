// 피그마 링크 읽기(4단계 — PRD/13 3-1): 무엇의 링크인지 판별하고 가져올 프레임 목록을 돌려줘요. 썸네일은 아직 만들지 않아요(호출 아끼기)
// - node-id 가 페이지(CANVAS) · 섹션 → 그 안의 최상위 프레임(섹션 안 프레임 포함) = 'list'
// - 최상위 프레임 → 'frame', 프레임 안의 요소 → 그 요소가 있는 최상위 프레임 = 'inner'
// - node-id 가 없으면 파일의 첫 페이지 = 'list'
// 피그마 호출: 1~2번(Tier 1)

interface ScanFrame { id: string; name: string; type: string; x: number; y: number; width: number; height: number; section: string | null }
export interface FigmaScanResult {
  fileKey: string
  fileName: string
  kind: 'list' | 'frame' | 'inner'
  container: { type: 'PAGE' | 'SECTION'; name: string } | null
  /** 'inner' 일 때 링크가 가리킨 요소 이름 */
  innerName: string | null
  frames: ScanFrame[]
}

const toFrame = (n: FigmaNode, section: string | null): ScanFrame => {
  const b = n.absoluteBoundingBox
  return { id: n.id, name: n.name, type: n.type, x: Math.round(b?.x ?? 0), y: Math.round(b?.y ?? 0), width: Math.round(b?.width ?? 375), height: Math.round(b?.height ?? 812), section }
}
/** 페이지 · 섹션 안의 최상위 프레임들(섹션은 한 단계 안까지) */
function framesIn(container: FigmaNode): ScanFrame[] {
  const out: ScanFrame[] = []
  for (const c of container.children ?? []) {
    if (FRAME_TYPES.has(c.type)) out.push(toFrame(c, container.type === 'SECTION' ? container.name : null))
    else if (c.type === 'SECTION') for (const f of c.children ?? []) if (FRAME_TYPES.has(f.type)) out.push(toFrame(f, c.name))
  }
  return out
}

export default defineEventHandler(async (event): Promise<FigmaScanResult> => {
  const token = await figmaAuth(event)
  const body = await readBody<{ url?: unknown }>(event).catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const parsed = url ? parseFigmaUrl(url) : null
  if (!parsed) figmaFail(400, 'invalid_url', '피그마 링크가 아니에요. figma.com/design/… 으로 시작하는 주소를 붙여주세요')
  const { fileKey, nodeId } = parsed
  const key = encodeURIComponent(fileKey)

  // node-id 없음 → 첫 페이지
  if (!nodeId || nodeId === '0:0') {
    const file = await figmaGet<{ name: string; document: FigmaNode }>(token, `/files/${key}?depth=3`)
    const page = file.document.children?.find((c) => c.type === 'CANVAS')
    if (!page) figmaFail(404, 'not_found', '피그마 파일에서 페이지를 찾지 못했어요')
    return { fileKey, fileName: file.name, kind: 'list', container: { type: 'PAGE', name: page.name }, innerName: null, frames: framesIn(page) }
  }

  const ids = encodeURIComponent(nodeId)
  const nodes = await figmaGet<{ name: string; nodes: Record<string, { document: FigmaNode } | null> }>(token, `/files/${key}/nodes?ids=${ids}&depth=2`)
  const doc = nodes.nodes?.[nodeId]?.document
  if (!doc) figmaFail(404, 'not_found', '피그마 파일이나 프레임을 찾지 못했어요. 링크를 다시 확인해주세요')
  if (doc.type === 'CANVAS' || doc.type === 'SECTION') {
    return { fileKey, fileName: nodes.name, kind: 'list', container: { type: doc.type === 'CANVAS' ? 'PAGE' : 'SECTION', name: doc.name }, innerName: null, frames: framesIn(doc) }
  }

  // 프레임이거나 그 안의 요소: 문서 맨 위에서 이 노드까지의 길을 받아 최상위 프레임을 찾아요
  // ids 를 주면 맨 위 ~ 이 노드까지의 길과 이 노드 안쪽만 와요(프레임 하나 크기)
  const file = await figmaGet<{ document: FigmaNode }>(token, `/files/${key}?ids=${ids}`)
  const path: FigmaNode[] = []
  const walk = (n: FigmaNode, trail: FigmaNode[]): boolean => {
    if (n.id === nodeId) { path.push(...trail, n); return true }
    return (n.children ?? []).some((c) => walk(c, [...trail, n]))
  }
  walk(file.document, [])
  // 최상위 프레임 = 부모가 페이지 · 섹션인 첫 프레임
  let top: FigmaNode | null = null
  let section: string | null = null
  for (let i = 1; i < path.length; i++) {
    const parent = path[i - 1]!
    const n = path[i]!
    if ((parent.type === 'CANVAS' || parent.type === 'SECTION') && FRAME_TYPES.has(n.type)) { top = n; section = parent.type === 'SECTION' ? parent.name : null; break }
  }
  // 길을 못 찾으면(피그마가 잘라서 줌) 링크 노드를 프레임으로 봐요
  if (!top) return { fileKey, fileName: nodes.name, kind: 'frame', container: null, innerName: null, frames: [toFrame(doc, null)] }
  const isTop = top.id === nodeId
  return { fileKey, fileName: nodes.name, kind: isTop ? 'frame' : 'inner', container: null, innerName: isTop ? null : doc.name, frames: [toFrame(isTop ? doc : top, section)] }
})
