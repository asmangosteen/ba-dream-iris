export interface PageRow { id: string; name: string; sort_order: number }
export interface ScreenRow { id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; status: 'draft' | 'review' | 'approved' }

/** 에디터 데이터: 프로젝트 · 페이지 · 선택한 페이지의 화면 */
export function useEditor(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = usePreviewMode()
  const project = useAsyncData(`project-${projectId}`, async () => {
    if (preview) return PREVIEW_PROJECTS.find((p) => p.id === projectId) ?? PREVIEW_PROJECTS[0]!
    const { data, error } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
    if (error) throw error
    return data as { id: string; name: string }
  })
  const pages = useAsyncData(`pages-${projectId}`, async () => {
    if (preview) return PREVIEW_PAGES
    const { data, error } = await supabase.from('pages').select('id, name, sort_order').eq('project_id', projectId).order('sort_order')
    if (error) throw error
    return (data ?? []) as PageRow[]
  })
  // 서버에서 고른 페이지가 브라우저로 그대로 넘어가도록 useState 로 둡니다
  const pageId = useState<string | null>(`page-${projectId}`, () => null)
  const screens = useAsyncData(`screens-${projectId}`, async () => {
    if (!pageId.value) {
      await pages
      pageId.value = pages.data.value?.[0]?.id ?? null
    }
    if (!pageId.value) return [] as ScreenRow[]
    if (preview) return PREVIEW_SCREENS[pageId.value] ?? []
    const { data, error } = await supabase.from('screens').select('id, name, source, x, y, width, height, status').eq('page_id', pageId.value).order('sort_order')
    if (error) throw error
    return (data ?? []) as ScreenRow[]
  }, { watch: [pageId] })
  return { project, pages, pageId, screens }
}
