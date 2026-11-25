/** 페이지 설정(pages.viewport jsonb): 캔버스 배경색 · 픽셀 격자 */
/** pixelGrid: 픽셀 격자 보이기(⇧'), snapPixel: 픽셀에 맞추기(⇧⌘' — 끄면 소수점 이동 · 크기). 둘 다 기본 켬 */
export interface PageSettings { background?: string | null; pixelGrid?: boolean; snapPixel?: boolean; /** 가이드선(캔버스 좌표) */ guides?: { x: number[]; y: number[] } }
export interface PageRow { id: string; name: string; sort_order: number; layers?: unknown; viewport?: PageSettings | null }
/** 캔버스 위(화면 밖) 레이어를 담는 가상 화면 id */
export const pageCanvasId = (pageId: string) => 'page:' + pageId
export const isPageCanvas = (id: string | null | undefined) => !!id && id.startsWith('page:')
export interface ScreenRow { id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; status: 'draft' | 'review' | 'approved'; thumbnail_path?: string | null; figma_url?: string | null; layers?: unknown }

import { moveOrder } from '~/canvas/order'

/** 에디터 데이터: 프로젝트 · 페이지 · 선택한 페이지의 화면 */
export function useEditor(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const project = useAsyncData(`project-${projectId}`, async () => {
    if (preview) return PREVIEW_PROJECTS.find((p) => p.id === projectId) ?? PREVIEW_PROJECTS[0]!
    const { data, error } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
    if (error) throw error
    return data as { id: string; name: string }
  }, { deep: true })
  const pages = useAsyncData(`pages-${projectId}`, async () => {
    if (preview) return PREVIEW_PROJECT_PAGES[projectId] ?? PREVIEW_PAGES
    const { data, error } = await supabase.from('pages').select('id, name, sort_order, layers, viewport').eq('project_id', projectId).order('sort_order')
    if (error) throw error
    return (data ?? []) as PageRow[]
  }, { deep: true })
  // 서버에서 고른 페이지가 브라우저로 그대로 넘어가도록 useState 로 둡니다
  const pageId = useState<string | null>(`page-${projectId}`, () => null)
  const screens = useAsyncData(`screens-${projectId}`, async () => {
    if (!pageId.value) {
      await pages
      pageId.value = pages.data.value?.[0]?.id ?? null
    }
    if (!pageId.value) return [] as ScreenRow[]
    if (preview) return PREVIEW_SCREENS[pageId.value] ?? []
    const { data, error } = await supabase.from('screens').select('id, name, source, x, y, width, height, status, thumbnail_path, figma_url, layers').eq('page_id', pageId.value).order('sort_order')
    if (error) throw error
    return (data ?? []) as ScreenRow[]
  }, { watch: [pageId], deep: true })

  const user = useSupabaseUser()
  const me = () => (user.value?.sub ?? user.value?.id) as string | undefined
  const tmpId = () => (globalThis.crypto?.randomUUID?.() ?? 'tmp-' + Math.random().toString(36).slice(2))

  /** 페이지 추가 → 새 페이지로 이동 */
  async function addPage() {
    const list = pages.data.value ?? []
    const name = `Page ${list.length + 1}`
    const sort_order = list.length ? Math.max(...list.map((p) => p.sort_order)) + 1 : 0
    let row: PageRow = { id: tmpId(), name, sort_order }
    if (!preview) {
      const { data, error } = await supabase.from('pages').insert({ project_id: projectId, name, sort_order }).select('id, name, sort_order').single()
      if (error) throw error
      row = data as PageRow
    } else PREVIEW_SCREENS[row.id] = []
    pages.data.value = [...list, row]
    pageId.value = row.id
  }

  /** 페이지 설정 저장 (배경색 · 픽셀 격자) */
  async function updatePageSettings(id: string, patch: PageSettings) {
    const p = pages.data.value?.find((x) => x.id === id)
    if (!p) return
    const before = p.viewport ?? null
    p.viewport = { ...(p.viewport ?? {}), ...patch }
    if (preview) return
    const { error } = await supabase.from('pages').update({ viewport: p.viewport }).eq('id', id)
    if (error) { p.viewport = before; throw error }
  }

  /** 페이지 순서를 통째로 정해 저장(레이어처럼 끌어서 바꾸기 · 실행취소에도 써요) */
  async function setPageOrder(order: string[]) {
    const cur = pages.data.value ?? []
    const at = new Map(order.map((v, k) => [v, k]))
    const list = [...cur].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9)).map((p, k) => ({ ...p, sort_order: k }))
    if (list.every((x, k) => x.id === cur[k]?.id)) return
    pages.data.value = list
    if (preview) return
    const results = await Promise.all(list.map((x) => supabase.from('pages').update({ sort_order: x.sort_order }).eq('id', x.id)))
    const err = results.find((r) => r.error)?.error
    if (err) throw err
  }

  async function renamePage(id: string, name: string) {
    const p = pages.data.value?.find((x) => x.id === id)
    if (!p || !name.trim() || p.name === name.trim()) return
    const before = p.name
    p.name = name.trim()
    if (preview) return
    const { error } = await supabase.from('pages').update({ name: p.name }).eq('id', id)
    if (error) { p.name = before; throw error }
  }

  /** 페이지 지우기(안의 화면 · 캔버스 레이어도 함께, DB cascade). 마지막 한 장은 지울 수 없어요 */
  async function removePage(id: string) {
    const list = pages.data.value ?? []
    if (list.length <= 1) return
    if (!preview) {
      const { error } = await supabase.from('pages').delete().eq('id', id)
      if (error) throw error
    } else delete PREVIEW_SCREENS[id]
    const next = list.filter((p) => p.id !== id)
    pages.data.value = next
    if (pageId.value === id) pageId.value = next[0]?.id ?? null
  }

  /**
   * 화면(프레임) 앞뒤 순서: 뒤에 있을수록 위에 그려져요(레이어 목록에선 위쪽). 여러 개를 고르면 함께, 서로의 순서는 그대로(피그마와 같아요)
   */
  async function reorderScreen(id: string | string[], to: 'front' | 'back' | 'forward' | 'backward') {
    const ids = new Set(Array.isArray(id) ? id : [id])
    await setScreenOrder(moveOrder((screens.data.value ?? []).map((x) => x.id), ids, to))
  }
  /** 화면 순서를 통째로 정해 저장(실행취소에도 써요) */
  async function setScreenOrder(order: string[]) {
    const cur = screens.data.value ?? []
    const at = new Map(order.map((v, k) => [v, k]))
    const list = [...cur].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9))
    if (list.every((x, k) => x.id === cur[k]?.id)) return
    screens.data.value = list
    if (preview) { if (pageId.value) PREVIEW_SCREENS[pageId.value] = list as never; return }
    const results = await Promise.all(list.map((x, k) => supabase.from('screens').update({ sort_order: k }).eq('id', x.id)))
    const err = results.find((r) => r.error)?.error
    if (err) throw err
  }

  /** 빈 화면(프레임) 추가 */
  async function addScreen(rect: { x: number; y: number; width: number; height: number }, name?: string): Promise<ScreenRow | null> {
    if (!pageId.value) return null
    const list = screens.data.value ?? []
    // 피그마처럼 'Frame N' — 지금 있는 'Frame 숫자' 중 가장 큰 수 다음
    const nums = list.map((v) => /^Frame (\d+)$/.exec(v.name)?.[1]).filter(Boolean).map(Number)
    const next = nums.length ? Math.max(...nums) + 1 : 1
    const row: ScreenRow = { id: tmpId(), name: name ?? `Frame ${next}`, source: 'native', status: 'draft', ...rect }
    if (!preview) {
      const { data, error } = await supabase
        .from('screens')
        .insert({ page_id: pageId.value, name: row.name, source: 'native', x: row.x, y: row.y, width: row.width, height: row.height, sort_order: list.length, updated_by: me() })
        .select('id, name, source, x, y, width, height, status')
        .single()
      if (error) throw error
      Object.assign(row, data)
    } else (PREVIEW_SCREENS[pageId.value] ??= []).push(row)
    screens.data.value = preview ? [...(PREVIEW_SCREENS[pageId.value] ?? [])] : [...(screens.data.value ?? []), row] // 여러 개를 한꺼번에 더할 때도 맞게 최신 목록에
    return row
  }

  /** 화면 속성 저장 (위치 · 크기 · 이름 · 상태). 화면에는 먼저 반영하고, 저장이 실패하면 되돌립니다 */
  async function updateScreen(id: string, patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status' | 'layers'>>) {
    // 캔버스 위 레이어 → pages.layers
    if (isPageCanvas(id)) {
      const pid = id.slice(5)
      const p = pages.data.value?.find((x) => x.id === pid)
      if (p && 'layers' in patch) p.layers = patch.layers
      if (preview || !('layers' in patch)) return
      const { error } = await supabase.from('pages').update({ layers: patch.layers }).eq('id', pid)
      if (error) throw error
      return
    }
    const s = screens.data.value?.find((x) => x.id === id)
    if (!s) {
      // 다른 페이지로 옮긴 뒤 늦게 도착한 저장(레이어 자동저장 등)
      if (preview) { for (const list of Object.values(PREVIEW_SCREENS)) { const p = list.find((x) => x.id === id); if (p) Object.assign(p, patch) } return }
      const { error } = await supabase.from('screens').update({ ...patch, updated_by: me() }).eq('id', id)
      if (error) throw error
      return
    }
    const before = { ...s }
    Object.assign(s, patch)
    if (preview) return
    const { error } = await supabase.from('screens').update({ ...patch, updated_by: me() }).eq('id', id)
    if (error) { Object.assign(s, before); throw error }
  }

  async function removeScreen(id: string) {
    if (!preview) {
      const { error } = await supabase.from('screens').delete().eq('id', id)
      if (error) throw error
    } else if (pageId.value) PREVIEW_SCREENS[pageId.value] = (PREVIEW_SCREENS[pageId.value] ?? []).filter((x) => x.id !== id)
    // 여러 개를 한꺼번에 지울 때도 맞게: 지운 뒤의 최신 목록에서 빼요
    screens.data.value = (screens.data.value ?? []).filter((x) => x.id !== id)
  }

  return { project, pages, pageId, screens, addPage, renamePage, removePage, setPageOrder, reorderScreen, setScreenOrder, updatePageSettings, addScreen, updateScreen, removeScreen }
}
