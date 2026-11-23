import type { ProjectStatus } from './useProjects'

export type ProjectKind = 'app' | 'web' | 'detail_page'
export const KIND_INFO: Record<ProjectKind, { label: string; desc: string; w: number; h: number }> = {
  app: { label: '앱', desc: '모바일 화면 375 × 812', w: 375, h: 812 },
  web: { label: '웹', desc: '데스크톱 화면 1440 × 900', w: 1440, h: 900 },
  detail_page: { label: '상세페이지', desc: '긴 세로 화면 860 × 3000', w: 860, h: 3000 },
}

export interface ProjectDetail { id: string; name: string; description: string | null; kind: ProjectKind; status: ProjectStatus }

/** 프로젝트 만들기 · 고치기 · 지우기 */
export function useProjectActions() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const preview = useDevPreview()

  /** 프로젝트 + 첫 페이지 + 종류에 맞는 첫 화면을 만들고 id 를 돌려줍니다 */
  async function create(name: string, kind: ProjectKind): Promise<string> {
    if (preview) {
      const id = 'preview-' + Math.random().toString(36).slice(2, 7)
      PREVIEW_PROJECTS.unshift({ id, name, status: 'planning', updated_at: new Date().toISOString() })
      await refreshNuxtData('projects')
      return 'preview-1' // 미리보기에는 페이지 · 화면 예시가 하나뿐이라 첫 예시 프로젝트로 엽니다
    }
    const me = (user.value?.sub ?? user.value?.id) as string
    const { data: ws, error: e0 } = await supabase.from('workspaces').select('id').limit(1).single()
    if (e0) throw e0
    const { data: p, error: e1 } = await supabase.from('projects').insert({ name, kind, workspace_id: ws.id, created_by: me }).select('id').single()
    if (e1) throw e1
    const { data: pg, error: e2 } = await supabase.from('pages').insert({ project_id: p.id, name: '페이지 1', sort_order: 0 }).select('id').single()
    if (e2) throw e2
    const k = KIND_INFO[kind]
    await supabase.from('screens').insert({ page_id: pg.id, name: '화면 1', source: 'native', x: 0, y: 0, width: k.w, height: k.h, sort_order: 0, updated_by: me })
    await refreshNuxtData('projects')
    return p.id as string
  }

  async function detail(id: string): Promise<ProjectDetail> {
    if (preview) {
      const p = PREVIEW_PROJECTS.find((x) => x.id === id) ?? PREVIEW_PROJECTS[0]!
      return { id: p.id, name: p.name, description: null, kind: 'app', status: p.status }
    }
    const { data, error } = await supabase.from('projects').select('id, name, description, kind, status').eq('id', id).single()
    if (error) throw error
    return data as ProjectDetail
  }

  async function update(id: string, patch: Partial<Omit<ProjectDetail, 'id'>>) {
    if (preview) {
      const p = PREVIEW_PROJECTS.find((x) => x.id === id)
      if (p) Object.assign(p, { ...(patch.name ? { name: patch.name } : {}), ...(patch.status ? { status: patch.status } : {}), updated_at: new Date().toISOString() })
    } else {
      const { error } = await supabase.from('projects').update(patch).eq('id', id)
      if (error) throw error
    }
    await Promise.all([refreshNuxtData('projects'), refreshNuxtData(`project-${id}`)])
  }

  /** 페이지 · 화면 · 문서 · 요구사항이 함께 지워집니다(DB cascade) */
  async function remove(id: string) {
    if (preview) {
      const i = PREVIEW_PROJECTS.findIndex((x) => x.id === id)
      if (i >= 0) PREVIEW_PROJECTS.splice(i, 1)
    } else {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    }
    await refreshNuxtData('projects')
  }

  return { create, detail, update, remove }
}

export interface CoverScreen { project_id: string; id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path: string | null; layers: unknown }

/** 홈 카드 썸네일: 프로젝트마다 대표 화면(cover_screen_id, 없으면 첫 페이지의 첫 화면) */
export function useProjectCovers() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData('project-covers', async () => {
    const out: Record<string, CoverScreen> = {}
    if (preview) {
      const s = PREVIEW_SCREENS['pg-1']?.[0]
      if (s) out['preview-1'] = { project_id: 'preview-1', id: s.id, source: s.source, width: s.width, height: s.height, thumbnail_path: s.thumbnail_path ?? null, layers: s.layers ?? null }
      return out
    }
    const { data, error } = await supabase
      .from('screens')
      .select('id, source, width, height, thumbnail_path, layers, sort_order, pages!inner(project_id, sort_order)')
      .eq('pages.sort_order', 0)
      .order('sort_order')
      .limit(500)
    if (error) throw error
    for (const s of (data ?? []) as unknown as (CoverScreen & { pages: { project_id: string } })[]) {
      const pid = s.pages.project_id
      if (!out[pid]) out[pid] = { project_id: pid, id: s.id, source: s.source, width: s.width, height: s.height, thumbnail_path: s.thumbnail_path, layers: s.layers }
    }
    return out
  }, { server: false })
}
