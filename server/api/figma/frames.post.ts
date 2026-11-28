// 피그마 프레임 여러 개 받기(4단계 — PRD/13 3장): 이름 · 크기 · 썸네일 주소 · 컴포넌트 요약을 한 번에.
// 피그마 호출은 묶음마다 2번(노드 · 썸네일, Tier 1). 화면에서 10개씩 나눠 부르고, 429 면 retryAfter 초 뒤 이어서 불러요
interface FrameOut { id: string; name: string; width: number; height: number; thumbnailUrl: string | null; components: FigmaFrameComponent[] }

const MAX = 20

export default defineEventHandler(async (event): Promise<{ fileKey: string; frames: FrameOut[]; missing: string[] }> => {
  const caller = await figmaAuth(event)
  const body = await readBody<{ fileKey?: unknown; ids?: unknown }>(event).catch(() => null)
  const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.replace(/[^\w-]/g, '') : ''
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === 'string' && /^[\w:;]+$/.test(x)).slice(0, MAX) : []
  if (!fileKey || !ids.length) figmaFail(400, 'invalid_url', '가져올 프레임이 없어요')
  const key = encodeURIComponent(fileKey)
  const q = encodeURIComponent(ids.join(','))

  const nodes = await figmaGet<{ nodes: Record<string, FigmaNodeEntry | null> }>(caller, `/files/${key}/nodes?ids=${q}`)
  // 썸네일은 실패해도 화면은 가져와요(피그마 이미지 주소는 일정 기간 뒤 만료 — 화면에서 Iris 저장소로 옮겨요)
  const images = await figmaGet<{ images: Record<string, string | null> }>(caller, `/images/${key}?ids=${q}&format=png&scale=1`).catch((e) => {
    if ((e as { statusCode?: number })?.statusCode === 429) throw e
    return { images: {} as Record<string, string | null> }
  })

  const frames: FrameOut[] = []
  const missing: string[] = []
  for (const id of ids) {
    const entry = nodes.nodes?.[id]
    if (!entry?.document) { missing.push(id); continue }
    const b = entry.document.absoluteBoundingBox
    frames.push({ id, name: entry.document.name, width: Math.round(b?.width ?? 375), height: Math.round(b?.height ?? 812), thumbnailUrl: images.images?.[id] ?? null, components: summarizeComponents(entry) })
  }
  return { fileKey, frames, missing }
})
