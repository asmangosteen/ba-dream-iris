import type { ProjectStatus } from './useProjects'

export type ProjectKind = 'app' | 'web' | 'detail_page'
export const KIND_INFO: Record<ProjectKind, { label: string; desc: string; w: number; h: number }> = {
  app: { label: 'App', desc: 'Mobile 390 × 844', w: 390, h: 844 },
  web: { label: 'Web', desc: 'Desktop 1440 × 900', w: 1440, h: 900 },
  detail_page: { label: 'Detail page', desc: 'Long page 860 × 3000', w: 860, h: 3000 },
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
      // 미리보기도 실제처럼: 새 프로젝트에 Page 1 + 고른 종류 크기의 빈 Frame 1 을 만들어 바로 그 프로젝트로 열어요
      const k = KIND_INFO[kind]
      PREVIEW_PROJECT_PAGES[id] = [{ id: `pg-${id}`, name: 'Page 1', sort_order: 0 }]
      PREVIEW_SCREENS[`pg-${id}`] = [{ id: `sc-${id}`, name: 'Frame 1', source: 'native', x: 0, y: 0, width: k.w, height: k.h, status: 'draft' }]
      await refreshNuxtData('projects')
      return id
    }
    const me = (user.value?.sub ?? user.value?.id) as string
    const { data: ws, error: e0 } = await supabase.from('workspaces').select('id').limit(1).single()
    if (e0) throw e0
    const { data: p, error: e1 } = await supabase.from('projects').insert({ name, kind, workspace_id: ws.id, created_by: me }).select('id').single()
    if (e1) throw e1
    const { data: pg, error: e2 } = await supabase.from('pages').insert({ project_id: p.id, name: 'Page 1', sort_order: 0 }).select('id').single()
    if (e2) throw e2
    const k = KIND_INFO[kind]
    await supabase.from('screens').insert({ page_id: pg.id, name: 'Frame 1', source: 'native', x: 0, y: 0, width: k.w, height: k.h, sort_order: 0, updated_by: me })
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

  /** cover_screen_id: 홈 카드 썸네일로 쓸 화면(null 이면 기본 — 첫 페이지의 첫 화면) */
  async function update(id: string, patch: Partial<Omit<ProjectDetail, 'id'>> & { cover_screen_id?: string | null }) {
    if (preview) {
      let p = PREVIEW_PROJECTS.find((x) => x.id === id)
      if (!p) { p = { id, name: 'Untitled', status: 'planning', updated_at: new Date().toISOString() }; PREVIEW_PROJECTS.push(p) }
      Object.assign(p, { ...(patch.name ? { name: patch.name } : {}), ...(patch.status ? { status: patch.status } : {}), ...('cover_screen_id' in patch ? { cover_screen_id: patch.cover_screen_id ?? null } : {}), updated_at: new Date().toISOString() })
    } else {
      const { error } = await supabase.from('projects').update(patch).eq('id', id)
      if (error) throw error
    }
    await Promise.all([refreshNuxtData('projects'), refreshNuxtData(`project-${id}`), ...('cover_screen_id' in patch ? [refreshNuxtData('project-covers')] : [])])
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

/** custom: 프레임 우클릭 'Set as thumbnail' 로 정한 화면(홈 카드에 꽉 차게) */
export interface CoverScreen { project_id: string; id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path: string | null; layers: unknown; custom?: boolean }

/** 홈 카드 썸네일: 프로젝트마다 대표 화면(cover_screen_id, 없으면 첫 페이지의 첫 화면) */
export function useProjectCovers() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData('project-covers', async () => {
    const out: Record<string, CoverScreen> = {}
    if (preview) {
      const s = PREVIEW_SCREENS['pg-1']?.[0]
      if (s) out['preview-1'] = { project_id: 'preview-1', id: s.id, source: s.source, width: s.width, height: s.height, thumbnail_path: s.thumbnail_path ?? null, layers: s.layers ?? null }
      // 썸네일로 정한 화면(미리보기 화면 어디서든)
      const all = Object.values(PREVIEW_SCREENS).flat()
      for (const p of PREVIEW_PROJECTS) {
        const c = p.cover_screen_id ? all.find((x) => x.id === p.cover_screen_id) : null
        if (c) out[p.id] = { project_id: p.id, id: c.id, source: c.source, width: c.width, height: c.height, thumbnail_path: c.thumbnail_path ?? null, layers: c.layers ?? null, custom: true }
      }
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
    // 썸네일로 정한 화면이 있으면 그것으로(지워진 화면이면 기본 그대로)
    const { data: ps } = await supabase.from('projects').select('id, cover_screen_id').not('cover_screen_id', 'is', null)
    const want = (ps ?? []) as { id: string; cover_screen_id: string }[]
    if (want.length) {
      const { data: cs } = await supabase.from('screens').select('id, source, width, height, thumbnail_path, layers').in('id', want.map((p) => p.cover_screen_id))
      const byId = new Map(((cs ?? []) as Omit<CoverScreen, 'project_id'>[]).map((c) => [c.id, c]))
      for (const p of want) { const c = byId.get(p.cover_screen_id); if (c) out[p.id] = { ...c, project_id: p.id, custom: true } }
    }
    return out
  }, { server: false })
}
