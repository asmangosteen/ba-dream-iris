/** 피그마 썸네일을 Iris 저장소에 복사해 'storage://' 주소로. 실패하면 피그마 주소 그대로(만료될 수 있어요) */
export async function keepFigmaThumb(url: string, fileKey: string, nodeId: string): Promise<string> {
  try {
    const r = await $fetch<{ path: string }>('/api/figma/keep-thumb', { method: 'POST', body: { url, fileKey, nodeId } })
    return r.path
  } catch { return url }
}

/** 피그마 링크 → { fileKey, nodeId }(썸네일 보관 경로용). 못 읽으면 null */
export function figmaIds(url?: string | null): { fileKey: string; nodeId: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const m = /\/(?:design|file|proto)\/([\w-]+)(?:\/branch\/([\w-]+))?/.exec(u.pathname)
    const node = u.searchParams.get('node-id')
    return m && node ? { fileKey: m[2] ?? m[1]!, nodeId: node } : null
  } catch { return null }
}
