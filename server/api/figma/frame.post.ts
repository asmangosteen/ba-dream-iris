// 피그마 프레임 불러오기 (서버 전용) — PRD/04_PROJECT_SPEC.md "피그마 연동"
// 토큰은 runtimeConfig.figmaAccessToken(NUXT_FIGMA_ACCESS_TOKEN) 또는 별칭 figmaToken(NUXT_FIGMA_TOKEN)에서만 읽고, 브라우저로 보내지 않습니다.
// TODO(PRD): 토큰을 figma_connections 에 암호화해 저장하고 그 값을 읽도록 바꿉니다.
import { serverSupabaseUser } from '#supabase/server'

interface FigmaFrameComponent { name: string; count: number; key: string | null }
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
type FigmaFrameErrorCode = 'unauthorized' | 'invalid_url' | 'no_node' | 'no_token' | 'forbidden' | 'not_found' | 'rate_limited' | 'figma_error'

const FIGMA = 'https://api.figma.com/v1'

function fail(statusCode: number, code: FigmaFrameErrorCode, message: string): never {
  throw createError({ statusCode, statusMessage: message, message, data: { code, message } })
}

/** figma.com/design|file/:fileKey/...?node-id=1-2 → { fileKey, nodeId: '1:2' } (branch 링크는 branchKey 를 씁니다) */
function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string | null } | null {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    return null
  }
  if (!/(^|\.)figma\.com$/i.test(u.hostname)) return null
  const parts = u.pathname.split('/').filter(Boolean)
  if (!['design', 'file', 'proto'].includes(parts[0] ?? '') || !parts[1]) return null
  const fileKey = parts[2] === 'branch' && parts[3] ? parts[3] : parts[1]
  const node = u.searchParams.get('node-id')
  const nodeId = node ? node.replace(/-/g, ':') : null
  return { fileKey, nodeId: nodeId && /^[\w:;]+$/.test(nodeId) ? nodeId : null }
}

interface FigmaNode {
  id: string
  name: string
  type: string
  componentId?: string
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null
  children?: FigmaNode[]
}
interface FigmaComponentMeta { key: string; name: string; componentSetId?: string }
interface FigmaNodesResponse {
  nodes: Record<string, {
    document: FigmaNode
    components?: Record<string, FigmaComponentMeta>
    componentSets?: Record<string, { key: string; name: string }>
  } | null>
}

/** 프레임 안의 인스턴스를 메인 컴포넌트 이름(변형이면 컴포넌트 세트 이름)으로 셉니다. 인스턴스 안쪽은 내려가지 않습니다. */
function summarize(entry: NonNullable<FigmaNodesResponse['nodes'][string]>): FigmaFrameComponent[] {
  const counts = new Map<string, FigmaFrameComponent>()
  const walk = (n: FigmaNode) => {
    if (n.type === 'INSTANCE') {
      const meta = n.componentId ? entry.components?.[n.componentId] : undefined
      const set = meta?.componentSetId ? entry.componentSets?.[meta.componentSetId] : undefined
      const name = (set?.name ?? meta?.name ?? n.name).trim()
      const key = set?.key ?? meta?.key ?? null
      const hit = counts.get(name)
      if (hit) hit.count++
      else counts.set(name, { name, count: 1, key })
      return
    }
    n.children?.forEach(walk)
  }
  entry.document.children?.forEach(walk)
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
}

function figmaStatus(e: unknown): number {
  const err = e as { status?: number; statusCode?: number; response?: { status?: number } }
  return err?.status ?? err?.statusCode ?? err?.response?.status ?? 0
}

function failFromFigma(e: unknown): never {
  const status = figmaStatus(e)
  if (status === 403) fail(403, 'forbidden', '이 파일을 볼 권한이 없어요. 파일 공유 설정이나 피그마 토큰을 확인해주세요.')
  if (status === 404) fail(404, 'not_found', '피그마 파일이나 프레임을 찾지 못했어요. 링크를 다시 확인해주세요.')
  if (status === 429) fail(429, 'rate_limited', '피그마 요청이 많아요. 1분 정도 뒤에 다시 시도해주세요.')
  fail(502, 'figma_error', '피그마에서 화면을 불러오지 못했어요. 잠시 뒤 다시 시도해주세요.')
}

export default defineEventHandler(async (event): Promise<FigmaFrameResult> => {
  const config = useRuntimeConfig(event)

  // 로그인한 사람만 (개발용 미리보기에서는 건너뜁니다)
  if (!(import.meta.dev && config.public.devPreview)) {
    const user = await serverSupabaseUser(event).catch(() => null)
    if (!user) fail(401, 'unauthorized', '로그인이 필요해요. 다시 로그인해주세요.')
  }

  const body = await readBody<{ url?: unknown }>(event).catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const parsed = url ? parseFigmaUrl(url) : null
  if (!parsed) fail(400, 'invalid_url', '피그마 링크가 아니에요. figma.com/design/… 으로 시작하는 주소를 붙여주세요.')
  if (!parsed.nodeId) fail(400, 'no_node', '프레임 링크가 아니에요. 피그마에서 프레임을 고르고 "링크 복사"한 주소를 붙여주세요.')
  const { fileKey, nodeId } = parsed

  const token = String(config.figmaAccessToken || config.figmaToken || '')
  if (!token) fail(503, 'no_token', '피그마 토큰이 아직 설정되지 않았어요. 관리자에게 알려주세요.')

  const headers = { 'X-Figma-Token': token }
  const ids = encodeURIComponent(nodeId)
  const [nodesRes, imagesRes] = await Promise.allSettled([
    $fetch<FigmaNodesResponse>(`${FIGMA}/files/${encodeURIComponent(fileKey)}/nodes?ids=${ids}`, { headers }),
    $fetch<{ err: string | null; images: Record<string, string | null> }>(`${FIGMA}/images/${encodeURIComponent(fileKey)}?ids=${ids}&format=png&scale=1`, { headers }),
  ])
  if (nodesRes.status === 'rejected') failFromFigma(nodesRes.reason)

  const entry = nodesRes.value.nodes?.[nodeId]
  if (!entry?.document) fail(404, 'not_found', '피그마 파일이나 프레임을 찾지 못했어요. 링크를 다시 확인해주세요.')
  const doc = entry.document
  if (doc.type === 'CANVAS' || doc.type === 'DOCUMENT') fail(400, 'no_node', '페이지 전체가 아니라 프레임 하나의 링크를 붙여주세요.')

  const box = doc.absoluteBoundingBox
  // 썸네일은 실패해도 화면은 가져옵니다 (피그마 이미지 주소는 일정 기간 뒤 만료돼요)
  const thumbnailUrl = imagesRes.status === 'fulfilled' ? imagesRes.value.images?.[nodeId] ?? null : null

  return {
    fileKey,
    nodeId,
    url,
    name: doc.name,
    width: Math.round(box?.width ?? 375),
    height: Math.round(box?.height ?? 812),
    thumbnailUrl,
    components: summarize(entry),
  }
})
