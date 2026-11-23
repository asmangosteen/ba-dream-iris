export interface PageRow { id: string; name: string; sort_order: number; layers?: unknown }
/** 캔버스 위(화면 밖) 레이어를 담는 가상 화면 id */
export const pageCanvasId = (pageId: string) => 'page:' + pageId
export const isPageCanvas = (id: string | null | undefined) => !!id && id.startsWith('page:')
export interface ScreenRow { id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; status: 'draft' | 'review' | 'approved'; thumbnail_path?: string | null; figma_url?: string | null; layers?: unknown }

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
    if (preview) return PREVIEW_PAGES
    const { data, error } = await supabase.from('pages').select('id, name, sort_order, layers').eq('project_id', projectId).order('sort_order')
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
    const name = `페이지 ${list.length + 1}`
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

  async function renamePage(id: string, name: string) {
    const p = pages.data.value?.find((x) => x.id === id)
    if (!p || !name.trim() || p.name === name.trim()) return
    const before = p.name
    p.name = name.trim()
    if (preview) return
    const { error } = await supabase.from('pages').update({ name: p.name }).eq('id', id)
    if (error) { p.name = before; throw error }
  }

  /** 빈 화면(프레임) 추가 */
  async function addScreen(rect: { x: number; y: number; width: number; height: number }, name?: string): Promise<ScreenRow | null> {
    if (!pageId.value) return null
    const list = screens.data.value ?? []
    const row: ScreenRow = { id: tmpId(), name: name ?? `화면 ${list.length + 1}`, source: 'native', status: 'draft', ...rect }
    if (!preview) {
      const { data, error } = await supabase
        .from('screens')
        .insert({ page_id: pageId.value, name: row.name, source: 'native', x: row.x, y: row.y, width: row.width, height: row.height, sort_order: list.length, updated_by: me() })
        .select('id, name, source, x, y, width, height, status')
        .single()
      if (error) throw error
      Object.assign(row, data)
    } else (PREVIEW_SCREENS[pageId.value] ??= []).push(row)
    screens.data.value = preview ? [...(PREVIEW_SCREENS[pageId.value] ?? [])] : [...list, row]
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
    const list = screens.data.value ?? []
    if (!preview) {
      const { error } = await supabase.from('screens').delete().eq('id', id)
      if (error) throw error
    } else if (pageId.value) PREVIEW_SCREENS[pageId.value] = (PREVIEW_SCREENS[pageId.value] ?? []).filter((x) => x.id !== id)
    screens.data.value = list.filter((x) => x.id !== id)
  }

  return { project, pages, pageId, screens, addPage, renamePage, addScreen, updateScreen, removeScreen }
}
