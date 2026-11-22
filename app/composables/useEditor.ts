export interface PageRow { id: string; name: string; sort_order: number }
export interface ScreenRow { id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; status: 'draft' | 'review' | 'approved' }

/** 에디터 데이터: 프로젝트 · 페이지 · 선택한 페이지의 화면 */
export function useEditor(projectId: string) {
  const supabase = useSupabaseClient()
  const project = useAsyncData(`project-${projectId}`, async () => {
    const { data, error } = await supabase.from('projects').select('id, name').eq('id', projectId).single()
    if (error) throw error
    return data as { id: string; name: string }
  })
  const pages = useAsyncData(`pages-${projectId}`, async () => {
    const { data, error } = await supabase.from('pages').select('id, name, sort_order').eq('project_id', projectId).order('sort_order')
    if (error) throw error
    return (data ?? []) as PageRow[]
  })
  const pageId = ref<string | null>(null)
  watch(() => pages.data.value, (list) => { const first = list?.[0]; if (first && !pageId.value) pageId.value = first.id }, { immediate: true })
  const screens = useAsyncData(`screens-${projectId}`, async () => {
    if (!pageId.value) return [] as ScreenRow[]
    const { data, error } = await supabase.from('screens').select('id, name, source, x, y, width, height, status').eq('page_id', pageId.value).order('sort_order')
    if (error) throw error
    return (data ?? []) as ScreenRow[]
  }, { watch: [pageId] })
  return { project, pages, pageId, screens }
}
