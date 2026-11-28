/**
 * 피그마 토큰(Iris 화면에서 넣기 — 2026-11-29): 토큰은 DB Vault 에만, 화면은 연결 여부 · 끝 4자리 · 마지막 오류만 봐요.
 * 저장 · 지우기는 관리자만(DB 함수 set_figma_token 이 막아요). 미리보기에서는 이 화면 안에서만
 */
import { useDevPreview } from '~/composables/usePreview'

export interface FigmaTokenStatus { connected: boolean; last4?: string | null; last_error?: string | null; updated_at?: string | null }
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

export function useFigmaToken() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const pv = useState<FigmaTokenStatus>('pv-figma-token', () => ({ connected: false }))
  const status = useState<FigmaTokenStatus | null>('figma-token-status', () => null)
  const rpc = supabase.rpc as unknown as Rpc

  async function refresh(): Promise<FigmaTokenStatus> {
    if (preview) { status.value = { ...pv.value }; return status.value }
    const { data, error } = await rpc('figma_status')
    // 함수가 아직 없으면(DB 적용 전) 연결 안 됨으로
    status.value = error ? { connected: false } : ((data as FigmaTokenStatus | null) ?? { connected: false })
    return status.value
  }
  /** 저장 · 바꾸기. 빈 값이면 지우기 */
  async function save(token: string): Promise<void> {
    const t = token.trim()
    if (preview) { pv.value = t ? { connected: true, last4: t.slice(-4), updated_at: new Date().toISOString() } : { connected: false }; await refresh(); return }
    const { error } = await rpc('set_figma_token', { p_token: t })
    if (error) throw new Error(error.code === '42501' ? 'forbidden' : error.code === '22023' ? 'invalid' : error.code === 'PGRST202' ? 'not_ready' : 'failed')
    await refresh()
  }
  return { status, refresh, save, remove: () => save('') }
}
