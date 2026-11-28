// 썸네일만 다시 받기(4단계): 묶어서 받을 때 피그마가 무거운 화면(지도 · 큰 사진)을 그리는 데 오래 걸려 빠진 썸네일을 한두 장씩.
// 호출 한도(429)는 retryAfter 를 함께 돌려줘서 화면이 기다렸다 이어요
export default defineEventHandler(async (event): Promise<{ images: Record<string, string | null> }> => {
  const caller = await figmaAuth(event)
  const body = await readBody<{ fileKey?: unknown; ids?: unknown; scale?: unknown }>(event).catch(() => null)
  const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.replace(/[^\w-]/g, '') : ''
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === 'string' && /^[\w:;]+$/.test(x)).slice(0, 2) : []
  const scale = body?.scale === 0.5 ? 0.5 : 1
  if (!fileKey || !ids.length) figmaFail(400, 'invalid_url', '썸네일을 받을 프레임이 없어요')
  const r = await figmaGet<{ images: Record<string, string | null> }>(caller, `/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(ids.join(','))}&format=png&scale=${scale}`)
  return { images: r.images ?? {} }
})
