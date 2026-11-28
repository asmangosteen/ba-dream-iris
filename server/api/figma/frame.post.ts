// 피그마 프레임 하나 불러오기(서버 전용) — 화면 '다시 불러오기'(InspectorDev)가 써요. 새 가져오기 창은 scan · frames · layers 를 써요
// 토큰: Vercel 환경 변수가 있으면 그것, 없으면 Iris 화면에서 넣은 토큰(DB Vault — server/utils/figma.ts)
interface FigmaFrameResult {
  fileKey: string
  nodeId: string
  url: string
  name: string
  width: number
  height: number
  thumbnailUrl: string | null
  components: FigmaFrameComponent[]
}

export default defineEventHandler(async (event): Promise<FigmaFrameResult> => {
  const caller = await figmaAuth(event)
  const body = await readBody<{ url?: unknown }>(event).catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const parsed = url ? parseFigmaUrl(url) : null
  if (!parsed) figmaFail(400, 'invalid_url', '피그마 링크가 아니에요. figma.com/design/… 으로 시작하는 주소를 붙여주세요')
  if (!parsed.nodeId) figmaFail(400, 'no_node', '프레임 링크가 아니에요. 피그마에서 프레임을 고르고 "링크 복사"한 주소를 붙여주세요')
  const { fileKey, nodeId } = parsed
  const key = encodeURIComponent(fileKey)
  const ids = encodeURIComponent(nodeId)

  const nodes = await figmaGet<{ nodes: Record<string, FigmaNodeEntry | null> }>(caller, `/files/${key}/nodes?ids=${ids}`)
  const entry = nodes.nodes?.[nodeId]
  if (!entry?.document) figmaFail(404, 'not_found', '피그마 파일이나 프레임을 찾지 못했어요. 링크를 다시 확인해주세요')
  const doc = entry.document
  if (doc.type === 'CANVAS' || doc.type === 'DOCUMENT') figmaFail(400, 'no_node', '페이지 전체가 아니라 프레임 하나의 링크를 붙여주세요')
  // 썸네일은 실패해도 화면은 가져와요(피그마 이미지 주소는 일정 기간 뒤 만료 — 화면에서 Iris 저장소로 옮겨요)
  const images = await figmaGet<{ images: Record<string, string | null> }>(caller, `/images/${key}?ids=${ids}&format=png&scale=1`).catch(() => ({ images: {} as Record<string, string | null> }))
  const box = doc.absoluteBoundingBox
  return {
    fileKey, nodeId, url, name: doc.name,
    width: Math.round(box?.width ?? 375), height: Math.round(box?.height ?? 812),
    thumbnailUrl: images.images?.[nodeId] ?? null,
    components: summarizeComponents(entry),
  }
})
