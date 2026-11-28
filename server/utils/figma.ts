// 피그마 서버 공용(4단계 — PRD/13 3장): 링크 읽기 · 토큰 · 호출 · 오류(호출 한도면 몇 초 뒤 다시인지까지)
// 토큰은 runtimeConfig.figmaAccessToken(NUXT_FIGMA_ACCESS_TOKEN) 또는 figmaToken(NUXT_FIGMA_TOKEN)에서만 읽고 브라우저로 보내지 않아요
import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export const FIGMA_API = 'https://api.figma.com/v1'
export type FigmaErrorCode = 'unauthorized' | 'invalid_url' | 'no_node' | 'no_token' | 'forbidden' | 'not_found' | 'rate_limited' | 'figma_error'

export function figmaFail(statusCode: number, code: FigmaErrorCode, message: string, extra: Record<string, unknown> = {}): never {
  throw createError({ statusCode, statusMessage: message, message, data: { code, message, ...extra } })
}

/** figma.com/design|file|proto/:fileKey/...?node-id=1-2 → { fileKey, nodeId: '1:2' } (branch 링크는 branchKey) */
export function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string | null } | null {
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

/**
 * 피그마를 부르는 쪽: Vercel 환경 변수 토큰(env)이 있으면 그걸, 없으면 Iris 화면에서 넣은 토큰(DB Vault)을 DB 함수 figma_fetch 로 —
 * DB 쪽 토큰은 서버로도 꺼내지 않아요(PRD/13, 2026-11-29)
 */
export type FigmaCaller = { kind: 'env'; token: string } | { kind: 'db'; event: H3Event }

/** 로그인한 사람만(개발용 미리보기는 건너뜀) + 부를 방법 */
export async function figmaAuth(event: H3Event): Promise<FigmaCaller> {
  const config = useRuntimeConfig(event)
  if (!(import.meta.dev && config.public.devPreview)) {
    const user = await serverSupabaseUser(event).catch(() => null)
    if (!user) figmaFail(401, 'unauthorized', '로그인이 필요해요. 다시 로그인해주세요')
  }
  const token = String(config.figmaAccessToken || config.figmaToken || '')
  return token ? { kind: 'env', token } : { kind: 'db', event }
}

function failStatus(status: number, retryAfter?: number): never {
  if (status === 401 || status === 403) figmaFail(403, 'forbidden', '이 파일을 볼 권한이 없어요. 파일 공유 설정이나 피그마 토큰을 확인해주세요')
  if (status === 404) figmaFail(404, 'not_found', '피그마 파일이나 프레임을 찾지 못했어요. 링크를 다시 확인해주세요')
  // 하루가 넘는 대기(무료 팀 파일 등)도 그대로 알려 줘요
  if (status === 429) figmaFail(429, 'rate_limited', '피그마 요청이 많아요. 잠시 뒤 이어서 받아요', { retryAfter: retryAfter && retryAfter > 0 ? Math.round(retryAfter) : 60 })
  figmaFail(502, 'figma_error', '피그마에서 화면을 불러오지 못했어요. 잠시 뒤 다시 시도해주세요')
}

type FetchRpc = (fn: 'figma_fetch', args: { p_path: string }) => Promise<{ data: { status: number; code?: string; retry_after?: string | null; body?: unknown } | null; error: { code?: string; message?: string } | null }>

/** 피그마 GET(path 는 '/files/…' 처럼 /v1 뒤) — 실패하면 코드로 바꿔 던져요. 429 면 Retry-After(초)를 함께 */
export async function figmaGet<T>(caller: FigmaCaller, path: string): Promise<T> {
  if (caller.kind === 'env') {
    try {
      return await $fetch<T>(`${FIGMA_API}${path}`, { headers: { 'X-Figma-Token': caller.token } })
    } catch (e) {
      const err = e as { status?: number; statusCode?: number; response?: { status?: number; headers?: Headers } }
      failStatus(err?.status ?? err?.statusCode ?? err?.response?.status ?? 0, Number(err?.response?.headers?.get?.('retry-after')))
    }
  }
  const sb = await serverSupabaseClient(caller.event)
  const { data, error } = await (sb.rpc as unknown as FetchRpc)('figma_fetch', { p_path: `/v1${path}` })
  // 함수가 아직 없으면(마이그레이션 전) 토큰이 없는 것과 같아요
  if (error) { if (error.code === 'PGRST202' || error.code === '42883') figmaFail(503, 'no_token', '피그마 토큰이 아직 설정되지 않았어요. 관리자에게 알려주세요'); failStatus(error.code === '42501' ? 403 : 502) }
  if (!data || data.code === 'no_token') figmaFail(503, 'no_token', '피그마 토큰이 아직 설정되지 않았어요. 관리자에게 알려주세요')
  if (data.status !== 200) failStatus(data.status, Number(data.retry_after))
  return data.body as T
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  componentId?: string
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null
  children?: FigmaNode[]
}
/** 화면(프레임)으로 보는 노드 종류 */
export const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'])

export interface FigmaFrameComponent { name: string; count: number; key: string | null }
export interface FigmaComponentMeta { key: string; name: string; componentSetId?: string }
export interface FigmaNodeEntry { document: FigmaNode; components?: Record<string, FigmaComponentMeta>; componentSets?: Record<string, { key: string; name: string }> }

/** 프레임 안의 인스턴스를 메인 컴포넌트 이름(변형이면 컴포넌트 세트 이름)으로 세요. 인스턴스 안쪽은 내려가지 않아요 */
export function summarizeComponents(entry: FigmaNodeEntry): FigmaFrameComponent[] {
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
