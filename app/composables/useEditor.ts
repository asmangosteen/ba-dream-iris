/** 페이지 설정(pages.viewport jsonb): 캔버스 배경색 · 픽셀 격자 */
/** pixelGrid: 픽셀 격자 보이기(⇧'), snapPixel: 픽셀에 맞추기(⇧⌘' — 끄면 소수점 이동 · 크기). 둘 다 기본 켬 */
export interface PageSettings { background?: string | null; pixelGrid?: boolean; snapPixel?: boolean; /** 가이드선(캔버스 좌표) */ guides?: { x: number[]; y: number[] } }
export interface PageRow { id: string; name: string; sort_order: number; layers?: unknown; viewport?: PageSettings | null }
/** 캔버스 위(화면 밖) 레이어를 담는 가상 화면 id */
export const pageCanvasId = (pageId: string) => 'page:' + pageId
export const isPageCanvas = (id: string | null | undefined) => !!id && id.startsWith('page:')
/** 피그마 프레임 주소 → 파일 키 · 노드 ID(figma.com/design|file|proto/:key/…?node-id=1-2 → '1:2', 브랜치 주소는 브랜치 키) */
export function parseFigmaFrameUrl(raw: string | null | undefined): { fileKey: string; nodeId: string } | null {
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!/(^|\.)figma\.com$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (!['design', 'file', 'proto'].includes(parts[0] ?? '') || !parts[1]) return null
    const fileKey = parts[2] === 'branch' && parts[3] ? parts[3] : parts[1]
    const nodeId = (u.searchParams.get('node-id') ?? '').replace(/-/g, ':')
    return fileKey && /^[\w:;]+$/.test(nodeId) ? { fileKey, nodeId } : null
  } catch { return null }
}
/** 화면 복사본의 원본(같은 탭이면 화면 목록에서, 다른 파일 · 탭이면 클립보드에 실려 온 것) */
export interface ScreenCopySource { id?: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; layers?: unknown; thumbnail_path?: string | null; figma_url?: string | null }
export interface ScreenRow { id: string; name: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; status: 'draft' | 'review' | 'approved'; thumbnail_path?: string | null; figma_url?: string | null; layers?: unknown; updated_at?: string; updated_by?: string | null }

/**
 * 저장 충돌(PRD/16 J-2): 내가 고치는 동안 다른 사람이 같은 화면(프레임)의 레이어를 먼저 저장했어요.
 * 그 사람 것(layers · 누가 · 언제)을 담아 던지고, 편집기가 '그 사람 것 / 내 것' 을 묻는 창을 띄워요
 */
export class ScreenConflict extends Error {
  constructor(public screenId: string, public remote: { layers: unknown; updated_by: string | null; updated_at: string }) { super('screen_conflict') }
}

import { moveOrder } from '~/canvas/order'
import type { NuxtApp } from '#app'

/**
 * 이 브라우저 창에서 한 번 불러온 편집기 데이터(프로젝트 · 페이지 · 화면)를 탭을 옮겨 다녀도 들고 있어요.
 * 다시 그 탭으로 오면 다시 받지 않고 바로 보여요(로딩 화면 없이 — 피그마 탭처럼). 새로 고치면 새로 받아요.
 * 내 수정은 같은 객체를 고치거나 data 를 바꿔 끼우므로 여기에도 그대로 남아요
 * TODO(협업): 여러 명이 함께 편집하게 되면 실시간 구독으로 다른 사람 변경을 바로 반영하고 자동 저장으로 바꿔야 해요 — 지금은 다른 사람 수정이 새로 고쳐야 보여요
 */
const editorCache = new Map<string, unknown>()
/** 이 프로젝트를 다시 받게(탭 새로 고침) */
export function forgetEditorCache(projectId: string) {
  for (const k of [...editorCache.keys()]) if (k === `project-${projectId}` || k === `pages-${projectId}` || k.startsWith(`screens-${projectId}:`)) editorCache.delete(k)
}
function fromCache(cacheKey: () => string) {
  return (key: string, nuxtApp: NuxtApp, ctx?: { cause?: string }) => {
    if (nuxtApp.isHydrating) return nuxtApp.payload.data[key]
    if (ctx?.cause && ctx.cause !== 'initial') return undefined
    return editorCache.get(cacheKey())
  }
}

/** 에디터 데이터: 프로젝트 · 페이지 · 선택한 페이지의 화면 */
export function useEditor(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const project = useAsyncData(`project-${projectId}`, async () => {
    // 미리보기에서도 오프라인이면 실제처럼 불러오기가 실패해요(불러오기 실패 화면 확인용)
    if (preview && import.meta.client && !navigator.onLine) throw new TypeError('Failed to fetch')
    if (preview) {
      // 미리보기: 메모리에만 있어 새로 고침하면 사라진 프로젝트는 빈 이름으로 다시 만들어 둬요(다른 프로젝트 이름이 보이지 않게)
      let p = PREVIEW_PROJECTS.find((x) => x.id === projectId)
      if (!p) { p = { id: projectId, name: 'Untitled', status: 'planning', updated_at: new Date().toISOString() }; PREVIEW_PROJECTS.push(p); refreshNuxtData('projects') }
      return p
    }
    const { data, error } = await supabase.from('projects').select('id, name, cover_screen_id').eq('id', projectId).single()
    if (error) throw error
    return data as { id: string; name: string; cover_screen_id?: string | null }
  }, { deep: true, getCachedData: fromCache(() => `project-${projectId}`) })
  const pages = useAsyncData(`pages-${projectId}`, async () => {
    if (preview) return PREVIEW_PROJECT_PAGES[projectId] ?? PREVIEW_PAGES
    const { data, error } = await supabase.from('pages').select('id, name, sort_order, layers, viewport').eq('project_id', projectId).order('sort_order')
    if (error) throw error
    return (data ?? []) as PageRow[]
  }, { deep: true, getCachedData: fromCache(() => `pages-${projectId}`) })
  // 서버에서 고른 페이지가 브라우저로 그대로 넘어가도록 useState 로 둡니다
  const route = useRoute()
  const pageId = useState<string | null>(`page-${projectId}`, () => null)
  /** 화면마다 마지막으로 안 판(updated_at)과 그때 레이어 — 저장할 때 그 판이 그대로인지 확인해요(다른 사람이 먼저 저장했으면 충돌) */
  const known = new Map<string, { at: string; layers: string }>()
  function remember(id: string, at: string | undefined, layers: unknown) { if (at) known.set(id, { at, layers: JSON.stringify(layers ?? null) }) }
  /** 미리보기: ?conflict=1 이면 첫 레이어 저장에서 충돌을 흉내 내요(충돌 창 확인용) */
  let fakeConflict = preview && import.meta.client && new URLSearchParams(location.search).get('conflict') === '1'
  const fakeAfter = Date.now() + 4000 // 불러온 직후 자동 저장(크기 재기)은 건너뛰고 직접 고친 저장에서
  const screens = useAsyncData(`screens-${projectId}`, async () => {
    if (!pageId.value) {
      await pages
      // 처음 고를 페이지: 주소의 ?page= (개요에서 페이지 썸네일을 눌렀을 때) → 없으면 첫 페이지.
      // 기다리는 동안 다른 곳(주소 처리)에서 이미 골랐으면 그대로 둬요 — 덮어쓰면 기본 페이지로 돌아가요(2026-11-29)
      const want = typeof route.query.page === 'string' ? route.query.page : null
      const list = pages.data.value ?? []
      if (!pageId.value) pageId.value = (want && list.some((p) => p.id === want) ? want : list[0]?.id) ?? null
    }
    if (!pageId.value) return [] as ScreenRow[]
    if (preview) return PREVIEW_SCREENS[pageId.value] ?? []
    const { data, error } = await supabase.from('screens').select('id, name, source, x, y, width, height, status, thumbnail_path, figma_url, layers, updated_at, updated_by').eq('page_id', pageId.value).order('sort_order')
    if (error) throw error
    for (const r of (data ?? []) as ScreenRow[]) remember(r.id, r.updated_at, r.layers)
    return (data ?? []) as ScreenRow[]
  }, { watch: [pageId], deep: true, getCachedData: fromCache(() => `screens-${projectId}:${pageId.value}`) })
  if (import.meta.client) {
    watch(project.data, (v) => { if (v) editorCache.set(`project-${projectId}`, v) }, { immediate: true })
    watch(pages.data, (v) => { if (v) editorCache.set(`pages-${projectId}`, v) }, { immediate: true })
    watch(screens.data, (v) => { if (v && pageId.value) editorCache.set(`screens-${projectId}:${pageId.value}`, v) }, { immediate: true })
  }

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
    return row
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
        .select('id, name, source, x, y, width, height, status, updated_at')
        .single()
      if (error) throw error
      Object.assign(row, data)
      remember(row.id, row.updated_at, null)
    } else (PREVIEW_SCREENS[pageId.value] ??= []).push(row)
    screens.data.value = preview ? [...(PREVIEW_SCREENS[pageId.value] ?? [])] : [...(screens.data.value ?? []), row] // 여러 개를 한꺼번에 더할 때도 맞게 최신 목록에
    return row
  }

  /**
   * 화면 복사본 만들기(복제 · 붙여넣기 — 피그마와 같아요, 속성 그대로): 레이어 · 화면 모양 · 내보내기 설정 + 피그마 화면이면 피그마 연결 · 썸네일 · 컴포넌트 기록까지.
   * src.id 가 있으면 저장된 원본에서 피그마 연결 · 기기 값을 읽어 오고(다른 파일 · 탭에서 복사한 것도), 없거나 못 읽으면 src 값으로.
   * 썸네일 파일은 같이 써요(화면을 지워도 파일은 지우지 않아요)
   */
  async function addScreenCopy(src: ScreenCopySource, rect: { x: number; y: number; width: number; height: number }, name: string): Promise<ScreenRow | null> {
    if (!pageId.value) return null
    const list = screens.data.value ?? []
    const layers = src.layers ?? null
    const row: ScreenRow = { id: tmpId(), name, source: src.source, status: 'draft', ...rect, thumbnail_path: src.thumbnail_path ?? null, figma_url: src.figma_url ?? null, layers }
    if (!preview) {
      type Full = { device: string | null; figma_file_key: string | null; figma_node_id: string | null; figma_url: string | null; thumbnail_path: string | null; figma_layer_summary: unknown; figma_synced_at: string | null }
      const orig = src.id && !src.id.startsWith('tmp')
        ? ((await supabase.from('screens').select('device, figma_file_key, figma_node_id, figma_url, thumbnail_path, figma_layer_summary, figma_synced_at').eq('id', src.id).maybeSingle()).data as Full | null)
        : null
      // 피그마 화면은 파일 키 · 노드 ID · 주소가 꼭 있어야 저장돼요(DB 규칙 screens_figma_fields).
      // 원본을 못 읽으면(다른 프로젝트 권한 · 지워짐) 피그마 주소에서 뽑아요
      const fromUrl = parseFigmaFrameUrl(orig?.figma_url ?? src.figma_url ?? null)
      const fileKey = orig?.figma_file_key ?? fromUrl?.fileKey ?? null
      const nodeId = orig?.figma_node_id ?? fromUrl?.nodeId ?? null
      const figmaUrl = orig?.figma_url ?? src.figma_url ?? null
      if (src.source === 'figma' && !(fileKey && nodeId && figmaUrl)) throw new Error('figma_link_missing')
      const { data, error } = await supabase
        .from('screens')
        .insert({
          page_id: pageId.value, name, source: src.source, x: rect.x, y: rect.y, width: rect.width, height: rect.height, sort_order: list.length, updated_by: me(), layers,
          device: orig?.device ?? null,
          figma_file_key: fileKey, figma_node_id: nodeId, figma_url: figmaUrl,
          thumbnail_path: orig?.thumbnail_path ?? src.thumbnail_path ?? null, figma_layer_summary: orig?.figma_layer_summary ?? null, figma_synced_at: orig?.figma_synced_at ?? null,
        })
        .select('id, name, source, x, y, width, height, status, thumbnail_path, figma_url, layers, updated_at, updated_by')
        .single()
      if (error) throw error
      Object.assign(row, data)
      remember(row.id, row.updated_at, layers)
      // 피그마 화면의 컴포넌트 기록(검수 · 개발 탭)도 함께 — 못 옮겨도 화면은 그대로 둬요
      if (src.id && src.source === 'figma') {
        const { data: uses } = await supabase.from('screen_component_usages').select('component_id, detected_name, count, source').eq('screen_id', src.id)
        if (uses?.length) await supabase.from('screen_component_usages').insert((uses as { component_id: string | null; detected_name: string; count: number; source: 'figma' | 'native' }[]).map((u) => ({ ...u, screen_id: row.id })))
      }
    } else (PREVIEW_SCREENS[pageId.value] ??= []).push(row)
    screens.data.value = preview ? [...(PREVIEW_SCREENS[pageId.value] ?? [])] : [...(screens.data.value ?? []), row]
    return row
  }

  /** 화면 속성 저장 (위치 · 크기 · 이름 · 상태). 화면에는 먼저 반영하고, 저장이 실패하면 되돌립니다 */
  /**
   * 레이어 저장: 내가 안 판 그대로일 때만. 다른 사람이 먼저 저장했으면 —
   * 그 사람 레이어가 내가 알던 것과 같으면(위치 · 이름만 바뀜) 새 판으로 다시 저장, 다르면 ScreenConflict
   * force = '내 것으로 저장'(판 확인 없이)
   */
  async function saveLayers(id: string, layers: unknown, force = false) {
    const k = known.get(id)
    let q = supabase.from('screens').update({ layers, updated_by: me() }).eq('id', id)
    if (k && !force) q = q.eq('updated_at', k.at)
    const { data, error } = await q.select('updated_at')
    if (error) throw error
    const row = (data ?? [])[0] as { updated_at: string } | undefined
    if (row) { remember(id, row.updated_at, layers); return }
    // 판이 바뀌었어요: 지금 서버에 있는 것을 보고 정해요
    const { data: cur, error: e2 } = await supabase.from('screens').select('layers, updated_by, updated_at').eq('id', id).maybeSingle()
    if (e2) throw e2
    if (!cur) return // 그새 지워진 화면
    const remote = cur as { layers: unknown; updated_by: string | null; updated_at: string }
    if (k && JSON.stringify(remote.layers ?? null) === k.layers) { known.set(id, { at: remote.updated_at, layers: k.layers }); return saveLayers(id, layers) }
    throw new ScreenConflict(id, remote)
  }

  async function updateScreen(id: string, patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status' | 'layers'>>, opts: { force?: boolean } = {}) {
    // 미리보기에서도 오프라인이면 실제처럼 저장이 실패해요(연결 · 저장 오류 화면 확인용)
    if (preview && import.meta.client && !navigator.onLine) throw new TypeError('Failed to fetch')
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
    if (preview) {
      if (fakeConflict && 'layers' in patch && Date.now() > fakeAfter) { fakeConflict = false; throw new ScreenConflict(id, { layers: before.layers, updated_by: 'preview-2', updated_at: new Date().toISOString() }) }
      return
    }
    if ('layers' in patch && Object.keys(patch).length === 1) {
      try { await saveLayers(id, patch.layers, opts.force) } catch (e) { if (!(e instanceof ScreenConflict)) Object.assign(s, before); throw e }
      s.updated_at = known.get(id)?.at
      return
    }
    const { data, error } = await supabase.from('screens').update({ ...patch, updated_by: me() }).eq('id', id).select('updated_at')
    if (error) { Object.assign(s, before); throw error }
    // 위치 · 이름 등만 바꾼 저장도 새 판이에요(레이어는 그대로라 알던 레이어 유지)
    const at = (data?.[0] as { updated_at?: string } | undefined)?.updated_at
    if (at) known.set(id, { at, layers: 'layers' in patch ? JSON.stringify(patch.layers ?? null) : known.get(id)?.layers ?? JSON.stringify(s.layers ?? null) })
  }

  async function removeScreen(id: string) {
    if (!preview) {
      const { error } = await supabase.from('screens').delete().eq('id', id)
      if (error) throw error
    } else if (pageId.value) PREVIEW_SCREENS[pageId.value] = (PREVIEW_SCREENS[pageId.value] ?? []).filter((x) => x.id !== id)
    // 여러 개를 한꺼번에 지울 때도 맞게: 지운 뒤의 최신 목록에서 빼요
    screens.data.value = (screens.data.value ?? []).filter((x) => x.id !== id)
  }

  /**
   * 실시간 반영(2단계): 다른 사람이 이 페이지 화면을 저장하면 바로 받아요.
   * onLayers(id, layers) — 그 화면에 내 저장 대기가 없으면 편집기가 레이어를 바꿔 끼워요(있으면 저장할 때 충돌로 물어봐요)
   */
  function liveScreens(onLayers: (id: string, layers: unknown) => boolean) {
    if (preview || !import.meta.client) return
    let ch: ReturnType<typeof supabase.channel> | null = null
    const off = () => { if (ch) { supabase.removeChannel(ch); ch = null } }
    watch(pageId, (pid) => {
      off()
      if (!pid) return
      ch = supabase.channel(`iris-screens-${pid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'screens', filter: `page_id=eq.${pid}` }, (msg) => {
          const row = (msg.new ?? {}) as ScreenRow & { page_id?: string }
          if (msg.eventType === 'DELETE' || msg.eventType === 'INSERT') {
            if (msg.eventType === 'INSERT' && (screens.data.value ?? []).some((x) => x.id === row.id)) return
            screens.refresh()
            return
          }
          if (!row.id || row.updated_by === me()) return
          const k = known.get(row.id)
          if (k && row.updated_at && row.updated_at <= k.at) return
          const s = (screens.data.value ?? []).find((x) => x.id === row.id)
          if (!s) return
          const layersChanged = JSON.stringify(row.layers ?? null) !== (k?.layers ?? JSON.stringify(s.layers ?? null))
          Object.assign(s, { name: row.name, x: row.x, y: row.y, width: row.width, height: row.height, status: row.status, thumbnail_path: row.thumbnail_path, updated_by: row.updated_by })
          if (layersChanged && !onLayers(row.id, row.layers)) return // 내 저장 대기가 있어 그대로(저장할 때 충돌 창)
          s.layers = row.layers
          remember(row.id, row.updated_at, row.layers)
        })
        // 지우기 신호는 page_id 로 거를 수 없어서(Supabase) 따로 받아요 — 이 페이지 화면이면 목록을 다시 읽어요
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'screens' }, (msg) => {
          const id = (msg.old as { id?: string }).id
          if (id && (screens.data.value ?? []).some((x) => x.id === id)) screens.refresh()
        })
        .subscribe()
    }, { immediate: true })
    onBeforeUnmount(off)
  }

  /** 충돌에서 '그 사람 것'을 골랐을 때: 그 판을 내가 아는 판으로 */
  const rememberScreen = (id: string, at: string, layers: unknown) => { remember(id, at, layers); const s = (screens.data.value ?? []).find((x) => x.id === id); if (s) { s.layers = layers; s.updated_at = at } }

  return { project, pages, pageId, screens, saveLayers, liveScreens, rememberScreen, addPage, renamePage, removePage, setPageOrder, reorderScreen, setScreenOrder, updatePageSettings, addScreen, addScreenCopy, updateScreen, removeScreen }
}
