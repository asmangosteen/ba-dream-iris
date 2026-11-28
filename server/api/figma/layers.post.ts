// 편집 가능한 레이어로 가져오기(4단계): 프레임 하나의 노드 전체(벡터 모양 포함)와 그 안 이미지 칠 주소를 돌려줘요.
// 변환(피그마 노드 → Iris 레이어)은 화면에서(app/canvas/figmaImport.ts). 피그마 호출: 노드 1번(Tier 1) + 이미지 칠이 있으면 1번(Tier 2)
export default defineEventHandler(async (event): Promise<{ document: unknown; images: Record<string, string> }> => {
  const caller = await figmaAuth(event)
  const body = await readBody<{ fileKey?: unknown; id?: unknown }>(event).catch(() => null)
  const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.replace(/[^\w-]/g, '') : ''
  const id = typeof body?.id === 'string' && /^[\w:;]+$/.test(body.id) ? body.id : ''
  if (!fileKey || !id) figmaFail(400, 'invalid_url', '가져올 프레임이 없어요')
  const key = encodeURIComponent(fileKey)

  const nodes = await figmaGet<{ nodes: Record<string, { document: FigmaNodeWithPaints } | null> }>(caller, `/files/${key}/nodes?ids=${encodeURIComponent(id)}&geometry=paths`)
  const doc = nodes.nodes?.[id]?.document
  if (!doc) figmaFail(404, 'not_found', '피그마 프레임을 찾지 못했어요')

  // 이미지 칠이 있을 때만 이미지 주소 받기(파일 전체 이미지 ref → 주소, 일정 기간 뒤 만료 — 화면에서 Iris 저장소로 옮겨요)
  let images: Record<string, string> = {}
  if (hasImage(doc)) {
    const r = await figmaGet<{ meta?: { images?: Record<string, string> } }>(caller, `/files/${key}/images`).catch((e) => {
      if ((e as { statusCode?: number })?.statusCode === 429) throw e
      return { meta: { images: {} } }
    })
    const all: Record<string, string> = r.meta?.images ?? {}
    const used = new Set<string>()
    collectRefs(doc, used)
    images = Object.fromEntries([...used].filter((k) => all[k]).map((k) => [k, all[k]!]))
  }
  return { document: doc, images }
})

interface FigmaNodeWithPaints { type: string; fills?: { type: string; imageRef?: string }[]; children?: FigmaNodeWithPaints[] }
function collectRefs(n: FigmaNodeWithPaints, out: Set<string>) {
  for (const p of n.fills ?? []) if (p.type === 'IMAGE' && p.imageRef) out.add(p.imageRef)
  for (const c of n.children ?? []) collectRefs(c, out)
}
function hasImage(n: FigmaNodeWithPaints): boolean {
  if (n.fills?.some((p) => p.type === 'IMAGE' && p.imageRef)) return true
  return (n.children ?? []).some(hasImage)
}
