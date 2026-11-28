<script setup lang="ts">
import { Button, TextInput } from '@ba-dream/design-system'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import FigmaTokenField from '~/components/editor/FigmaTokenField.vue'
import type { SlotRow } from '~/composables/useIrisData'
import { figmaToLayers, figmaImageRefs, type FigmaFullNode } from '~/canvas/figmaImport'
// Nuxt 내장 useDevPreview 와 이름이 겹쳐 자동 import 가 내장 쪽으로 잡히므로 직접 가져와요
import { useDevPreview } from '~/composables/usePreview'

/**
 * 피그마 가져오기(4단계 — PRD/13 3장 · 3-1, 시안 https://claude.ai/artifact/6teGBmQcTi47jgB46toMrk)
 * 1 링크 → 2 미리보기 표(페이지 · 섹션) / 3 프레임 하나 → 4 가져오는 중(10개씩, 호출 한도면 잠시 뒤 이어서, 창을 닫아도 계속) → 5 끝(빠진 디자인)
 * 프레임 이름의 화면 ID(C-05 …, C-05/상태)로 화면 칸에 붙이고, 칸의 요청사항을 '확인 전'으로 이어요. 다시 불러올 때 ID 가 바뀌었으면 묻기(6)
 */
const props = defineProps<{ projectId: string; pageId: string; nextX: number }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: []; finished: [n: number]; focus: [screenId: string] }>()

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { linkMany, setScreenSlot } = useIrisMutations()
const slotsQ = useScreenSlots(props.projectId)
const { reqs: reqsQ, links: linksQ } = useRequirements(props.projectId)

interface ScanFrame { id: string; name: string; type: string; x: number; y: number; width: number; height: number; section: string | null; path?: string[] }
interface ScanResult { fileKey: string; fileName: string; kind: 'list' | 'frame' | 'inner' | 'pages'; container: { type: 'PAGE' | 'SECTION'; name: string } | null; innerName: string | null; frames: ScanFrame[]; pages?: { id: string; name: string }[] }
interface FrameComponent { name: string; count: number; key: string | null }
interface FrameOut { id: string; name: string; width: number; height: number; thumbnailUrl: string | null; components: FrameComponent[] }
type Match = 'new' | 'state' | 'again' | 'warn' | 'noid'
interface Row extends ScanFrame { match: Match; slot: SlotRow | null; state: string | null; existing: { id: string; slotCode: string | null; pageId: string; page: string } | null; checked: boolean }
type RunStatus = 'queued' | 'done' | 'waiting' | 'failed'

const FIGMA_ERROR: Record<string, string> = {
  forbidden: 'You don\'t have access to this file. Check the file\'s sharing settings or the Figma token',
  not_found: 'Couldn\'t find the Figma file or frame. Check the link again',
  rate_limited: 'Too many Figma requests. Try again in about a minute',
  figma_error: 'Couldn\'t import the frame from Figma. Try again in a moment',
  unauthorized: 'You need to log in. Please log in again',
  invalid_url: 'That isn\'t a Figma link. Paste a URL that starts with figma.com/design/…',
  no_token: 'The Figma token isn\'t set up yet. Let an admin know',
}
const errOf = (e: unknown) => {
  const d = (e as { data?: { data?: { code?: string; message?: string; retryAfter?: number } } }).data?.data
  return { code: d?.code ?? 'figma_error', retryAfter: d?.retryAfter ?? 60 }
}

// ---------------------------------------------------------------------------
// 1 링크
// ---------------------------------------------------------------------------
type Step = 'link' | 'pages' | 'list' | 'frame' | 'run' | 'done'
const step = ref<Step>('link')
const url = ref('')
const scanning = ref(false)
const error = ref<{ code: string; message: string } | null>(null)
const scan = ref<ScanResult | null>(null)
const rows = ref<Row[]>([])

/** 파일 링크(node-id 없음)면 페이지 목록 — 구분선 이름(----)은 빼요 */
const pageList = computed(() => (scan.value?.pages ?? []).filter((p) => !/^[\s\-–—_=·.]*$/.test(p.name)))
async function doScan(pageId?: string) {
  const raw = url.value.trim()
  if (!raw || scanning.value) return
  if (!/figma\.com\//i.test(raw)) { error.value = { code: 'invalid_url', message: FIGMA_ERROR.invalid_url! }; return }
  error.value = null
  scanning.value = true
  try {
    const r = preview ? await previewScan(raw) : await $fetch<ScanResult>('/api/figma/scan', { method: 'POST', body: { url: raw, ...(typeof pageId === 'string' ? { pageId } : {}) } })
    scan.value = r
    if (r.kind === 'pages') { rows.value = []; step.value = 'pages'; return }
    rows.value = await matchRows(r)
    filter.value = 'all'
    if (r.kind === 'list') step.value = 'list'
    else { step.value = 'frame'; await loadSingle() }
  } catch (e) {
    const { code } = errOf(e)
    error.value = { code, message: FIGMA_ERROR[code] ?? FIGMA_ERROR.figma_error! }
  } finally {
    scanning.value = false
  }
}
function onUrlKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doScan() } }
const pickPage = (id: string) => doScan(id)

/** 이 프로젝트에 이미 들어온 같은 파일의 화면(피그마 노드 id 기준 — 이름이 바뀌어도 같은 화면) */
async function existingOf(fileKey: string): Promise<Map<string, { id: string; slotCode: string | null; pageId: string; page: string }>> {
  const slotCode = (id: string | null) => (id ? slotsQ.data.value?.find((s) => s.id === id)?.code ?? null : null)
  if (preview) return new Map([['pv:6', { id: 'pv-existing', slotCode: 'C-06', pageId: 'pg-1', page: '홈 · 내 차고' }]])
  const { data } = await supabase.from('screens').select('id, figma_node_id, slot_id, page_id, pages!inner(project_id, name)').eq('pages.project_id', props.projectId).eq('figma_file_key', fileKey)
  return new Map(((data ?? []) as unknown as { id: string; figma_node_id: string; slot_id: string | null; page_id: string; pages: { name: string } }[]).map((s) => [s.figma_node_id, { id: s.id, slotCode: slotCode(s.slot_id), pageId: s.page_id, page: s.pages?.name ?? '' }]))
}
/** 프레임마다 붙을 화면 칸 · 결과(PRD/13 3장 표). ID 가 맞는 새 화면 · 상태만 미리 체크, 이미 연결된 것은 체크 안 함(3-1) */
async function matchRows(r: ScanResult): Promise<Row[]> {
  const ex = await existingOf(r.fileKey)
  const slots = (slotsQ.data.value ?? []).filter((s) => !s.removed_at)
  return r.frames.map((f): Row => {
    const m = slotFromName(f.name)
    const slot = m ? slots.find((s) => s.code === m.code) ?? null : null
    // 같은 페이지에 이미 있으면 그 화면을 다시 불러오기, 다른 페이지에 있으면 이 페이지에 새로(사용자 결정 2026-11-29)
    const e = ex.get(f.id)
    const existing = e && e.pageId === props.pageId ? e : null
    const match: Match = existing ? 'again' : !m ? 'noid' : !slot ? 'warn' : m.state ? 'state' : 'new'
    return { ...f, match, slot, state: m?.state ?? null, existing, checked: match === 'new' || match === 'state' }
  })
}

// ---------------------------------------------------------------------------
// 2 미리보기 표
// ---------------------------------------------------------------------------
type Filter = 'all' | 'attach' | 'check' | 'again'
const filter = ref<Filter>('all')
const inFilter = (r: Row, f: Filter) => f === 'all' || (f === 'attach' ? r.match === 'new' || r.match === 'state' : f === 'check' ? r.match === 'warn' || r.match === 'noid' : r.match === 'again')
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'attach', label: 'Will attach' }, { key: 'check', label: 'Check' }, { key: 'again', label: 'Already linked' }]
const fCount = (f: Filter) => rows.value.filter((r) => inFilter(r, f)).length
const segLine = (i: number) => { const on = FILTERS.findIndex((f) => f.key === filter.value); return i > 0 && i !== on && i - 1 !== on }
const shown = computed(() => rows.value.filter((r) => inFilter(r, filter.value)))
const picked = computed(() => rows.value.filter((r) => r.checked))
const allOn = computed(() => shown.value.length > 0 && shown.value.every((r) => r.checked))
const someOn = computed(() => !allOn.value && shown.value.some((r) => r.checked))
function toggleAll() { const v = !allOn.value; for (const r of shown.value) r.checked = v }
const RESULT: Record<Match, { label: string; cls: string }> = {
  new: { label: 'New screen', cls: 'new' },
  state: { label: 'State', cls: 'state' },
  again: { label: 'Linked · reimport', cls: 'again' },
  warn: { label: 'ID not in doc', cls: 'warn' },
  noid: { label: 'No ID', cls: 'noid' },
}
/** ID 없는 프레임: 화면 칸 고르기 */
const pickOpen = ref<string | null>(null)
/** 표 칸이 스크롤 칸 안이라 메뉴는 fixed 로(잘리지 않게) — 아래 자리가 모자라면 위로 */
const pickPos = ref<{ left: string; top: string; bottom: string }>({ left: '0px', top: 'auto', bottom: 'auto' })
function togglePick(r: Row, e: MouseEvent) {
  if (pickOpen.value === r.id) { pickOpen.value = null; return }
  const el = e.currentTarget as HTMLElement
  const b = el.getBoundingClientRect()
  // 팝업(.pop)에 filter 가 있어 fixed 의 기준이 팝업이에요 — 팝업 기준 좌표로
  const p = el.closest('.pop')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  // 메뉴 높이(최대 224 + 안쪽 여백) — 팝업 안에서 아래 자리가 모자라면 위로, 둘 다 모자라면 넓은 쪽
  const need = Math.min(232, Math.max(1, slotChoices.value.length) * 32 + 12)
  const down = p.bottom - b.bottom - 8, up = b.top - p.top - 8
  const below = down >= need || down >= up
  pickPos.value = below ? { left: b.left - p.left + 'px', top: b.bottom - p.top + 4 + 'px', bottom: 'auto' } : { left: b.left - p.left + 'px', top: 'auto', bottom: p.bottom - b.top + 4 + 'px' }
  pickOpen.value = r.id
}
const slotChoices = computed(() => (slotsQ.data.value ?? []).filter((s) => !s.removed_at))
const pickRow = computed(() => rows.value.find((r) => r.id === pickOpen.value) ?? null)
/** 바깥 누르기 = 닫기만(서비스 공통 규칙: pointerdown capture) · 표를 스크롤하면 닫기 */
function onPickOutside(e: PointerEvent) { if (pickOpen.value && !(e.target as HTMLElement).closest?.('.fi-pick, .fi-menu')) pickOpen.value = null }
onMounted(() => document.addEventListener('pointerdown', onPickOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPickOutside, true))
function chooseSlot(r: Row, s: SlotRow) { r.slot = s; r.state = null; r.match = "new"; r.checked = true; pickOpen.value = null }
const size = (r: { width: number; height: number }) => `${r.width} × ${r.height}`

// ---------------------------------------------------------------------------
// 3 프레임 하나
// ---------------------------------------------------------------------------
const single = ref<FrameOut | null>(null)
const singleLoading = ref(false)
const thumbFailed = ref(false)
const compOpen = ref(false)
async function loadSingle() {
  const r = rows.value[0]
  if (!r || !scan.value) return
  singleLoading.value = true
  thumbFailed.value = false
  try {
    single.value = await fetchFrames(scan.value.fileKey, [r.id]).then((x) => x.frames[0] ?? null)
  } catch (e) {
    const { code } = errOf(e)
    error.value = { code, message: FIGMA_ERROR[code] ?? FIGMA_ERROR.figma_error! }
  } finally {
    singleLoading.value = false
  }
  r.checked = true
}
const singleRow = computed(() => rows.value[0] ?? null)
/** 따라오는 요청사항(칸의 '요청사항' 열) */
const reqCodesOf = (slot: SlotRow | null) => slot?.policy_codes ?? []
const compTotal = computed(() => single.value?.components.reduce((n, c) => n + c.count, 0) ?? 0)

// ---------------------------------------------------------------------------
// 4 가져오는 중 — 10개씩, 429 면 retryAfter 초 기다렸다가 이어서
// ---------------------------------------------------------------------------
/** 한 번에 받는 프레임 수 — 프레임 안쪽까지 받아서(컴포넌트 요약) 크면 DB 8초 한도에 걸려요 */
const CHUNK = 4
const run = reactive({ total: 0, done: 0, waitUntil: 0, stopped: false, status: {} as Record<string, RunStatus> })
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
const waitLeft = computed(() => Math.max(0, Math.ceil((run.waitUntil - now.value) / 1000)))
const runRows = computed(() => rows.value.filter((r) => run.status[r.id]))
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
/** 썸네일이 빠진 화면 — 묶음으로 받을 때 피그마가 무거운 화면을 늦게 그려 빠지면, 끝에 한 장씩 다시 받아요 */
interface ThumbJob { screenId: string; fileKey: string; nodeId: string }
const pendingThumbs: ThumbJob[] = []
/** 끝 화면 [캔버스에서 보기]: 가져온(또는 다시 불러온) 첫 화면으로 — 다른 페이지에 있으면 그 페이지로 */
const firstSaved = ref<string | null>(null)
const thumbs = reactive({ active: false, total: 0, done: 0, failed: 0 })
async function fillThumbs(jobs: ThumbJob[]) {
  if (!jobs.length || preview) return
  Object.assign(thumbs, { active: true, total: jobs.length, done: 0, failed: 0 })
  for (const j of jobs) {
    if (run.stopped) break
    let url: string | null = null
    for (const scale of [1, 0.5]) {
      try {
        const r = await withRetry(() => $fetch<{ images: Record<string, string | null> }>('/api/figma/thumbs' as string, { method: 'POST', body: { fileKey: j.fileKey, ids: [j.nodeId], scale } }), [])
        url = r?.images?.[j.nodeId] ?? null
      } catch { url = null }
      if (url) break
    }
    if (url) {
      const path = await keepFigmaThumb(url, j.fileKey, j.nodeId)
      const { error: e } = await supabase.from('screens').update({ thumbnail_path: path }).eq('id', j.screenId)
      if (e) thumbs.failed++
    } else thumbs.failed++
    thumbs.done++
  }
  thumbs.active = false
  await refreshNuxtData([`all-screens-${props.projectId}`])
  emit('created')
}
/** 이 프로젝트에서 썸네일 없이 들어온 피그마 화면(예전 가져오기 포함) */
const missingThumbs = ref<ThumbJob[]>([])
async function loadMissingThumbs() {
  if (preview) { missingThumbs.value = []; return }
  const { data } = await supabase.from('screens').select('id, figma_file_key, figma_node_id, pages!inner(project_id)').eq('pages.project_id', props.projectId).is('thumbnail_path', null).not('figma_node_id', 'is', null)
  missingThumbs.value = ((data ?? []) as unknown as { id: string; figma_file_key: string | null; figma_node_id: string | null }[]).filter((x) => x.figma_file_key && x.figma_node_id).map((x) => ({ screenId: x.id, fileKey: x.figma_file_key!, nodeId: x.figma_node_id! }))
}
async function retryMissingThumbs() {
  run.stopped = false
  await fillThumbs(missingThumbs.value)
  await loadMissingThumbs()
}
const result = reactive({ added: 0, states: 0, again: 0, failed: 0, links: 0, skipped: 0, idChanged: [] as { screenId: string; from: string; to: SlotRow; name: string }[] })

async function fetchFrames(fileKey: string, ids: string[]): Promise<{ frames: FrameOut[]; missing: string[] }> {
  if (preview) { await sleep(500); return { frames: ids.map((id) => { const r = rows.value.find((x) => x.id === id)!; return { id, name: r.name, width: r.width, height: r.height, thumbnailUrl: null, components: PREVIEW_COMPONENTS } }), missing: [] } }
  return $fetch<{ frames: FrameOut[]; missing: string[] }>('/api/figma/frames' as string, { method: 'POST', body: { fileKey, ids } })
}

/** 피그마 호출: 호출 한도(429)면 Retry-After 만큼 기다렸다 다시 — 기다리는 동안 그 줄은 '기다림' */
async function withRetry<T>(fn: () => Promise<T>, ids: string[]): Promise<T | null> {
  while (!run.stopped) {
    try { return await fn() } catch (e) {
      const { code, retryAfter } = errOf(e)
      if (code !== 'rate_limited') throw e
      run.waitUntil = Date.now() + retryAfter * 1000
      for (const id of ids) run.status[id] = 'waiting'
      while (Date.now() < run.waitUntil && !run.stopped) await sleep(500)
      for (const id of ids) if (run.status[id] === 'waiting') run.status[id] = 'queued'
    }
  }
  return null
}
/** 편집 가능한 레이어: 프레임 노드 전체 → Iris 레이어(이미지 칠은 Iris 저장소로 옮겨서) */
async function fetchLayers(fileKey: string, id: string): Promise<{ doc: ReturnType<typeof figmaToLayers>['doc']; skipped: number } | null> {
  const r = await withRetry(() => $fetch<{ document: FigmaFullNode; images: Record<string, string> }>('/api/figma/layers' as string, { method: 'POST', body: { fileKey, id } }), [id])
  if (!r) return null
  const kept: Record<string, string> = {}
  for (const ref of figmaImageRefs(r.document)) {
    const url = r.images[ref]
    if (url) kept[ref] = await keepFigmaThumb(url, fileKey, ref)
  }
  const out = figmaToLayers(r.document, (ref) => kept[ref])
  return { doc: out.doc, skipped: out.skipped }
}

async function startImport() {
  const sc = scan.value
  const list = picked.value
  if (!sc || !list.length) return
  step.value = 'run'
  Object.assign(run, { total: list.length, done: 0, waitUntil: 0, stopped: false, status: Object.fromEntries(list.map((r) => [r.id, 'queued' as RunStatus])) })
  Object.assign(result, { added: 0, states: 0, again: 0, failed: 0, links: 0, skipped: 0, idChanged: [] })
  pendingThumbs.length = 0
  firstSaved.value = null
  Object.assign(thumbs, { active: false, total: 0, done: 0, failed: 0 })
  ticker = setInterval(() => { now.value = Date.now() }, 500)
  // 캔버스 자리: 함께 보기 'ID 순서 보기'와 같은 규칙(사용자 결정 2026-11-29) — 지금 페이지 오른쪽 끝(nextX)부터
  const at = idOrderLayout(list.filter((r) => !r.existing), props.nextX)
  const catalog = await loadCatalog()
  for (let i = 0; i < list.length && !run.stopped; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK)
    let got: { frames: FrameOut[]; missing: string[] } | null = null
    while (!got && !run.stopped) {
      try {
        got = await fetchFrames(sc.fileKey, chunk.map((r) => r.id))
      } catch (e) {
        const { code, retryAfter } = errOf(e)
        if (code !== 'rate_limited') { for (const r of chunk) run.status[r.id] = 'failed'; result.failed += chunk.length; run.done += chunk.length; break }
        // 호출 한도: 잠시 뒤 이어서(아무것도 버리지 않아요)
        run.waitUntil = Date.now() + retryAfter * 1000
        for (const r of chunk) run.status[r.id] = 'waiting'
        while (Date.now() < run.waitUntil && !run.stopped) await sleep(500)
        for (const r of chunk) if (run.status[r.id] === 'waiting') run.status[r.id] = 'queued'
      }
    }
    if (!got) continue
    for (const f of got.frames) {
      const r = chunk.find((x) => x.id === f.id)!
      try {
        await saveFrame(sc.fileKey, r, f, catalog, at.get(r.id) ?? { x: Math.round(props.nextX), y: 0 })
        run.status[r.id] = 'done'
      } catch {
        run.status[r.id] = 'failed'
        result.failed++
      }
      run.done++
    }
    for (const id of got.missing) { run.status[id] = 'failed'; result.failed++; run.done++ }
  }
  // 빠진 썸네일은 한 장씩 다시(무거우면 절반 크기로)
  if (!run.stopped) await fillThumbs(pendingThumbs)
  clearInterval(ticker)
  if (!preview) await refreshNuxtData([`all-screens-${props.projectId}`, `links-${props.projectId}`])
  emit('created')
  if (!open.value) emit('finished', run.done - result.failed)
  step.value = 'done'
  nextIdChange()
}
function stopImport() { run.stopped = true }
function viewOnCanvas() { const id = firstSaved.value; close(); if (id) emit('focus', id) }

/**
 * ID 순서 배치(함께 보기 'ID 순서 보기'와 같은 규칙 · 같은 간격): 종류(C · A · S · N · CMP · 그 밖)마다 한 줄,
 * 줄 안은 화면 번호 순 → 같은 번호면 기본 화면 먼저 · 상태 변형 뒤 → 피그마 순서(위 → 아래, 왼 → 오른쪽). 화면 사이 120, 줄 사이 600
 */
const KIND_ORDER = ['C', 'A', 'S', 'N', 'CMP', 'etc'] as const
function idOrderLayout(list: Row[], x0: number): Map<string, { x: number; y: number }> {
  const keyOf = (r: Row) => {
    const code = r.slot?.code ?? slotFromName(r.name)?.code ?? null
    const m = code?.match(/^([A-Z]+)-(\d+)/)
    const kind = (m && (KIND_ORDER as readonly string[]).includes(m[1]!) ? m[1]! : 'etc') as (typeof KIND_ORDER)[number]
    return { kind, num: m ? Number(m[2]) : Number.MAX_SAFE_INTEGER, variant: r.state ? 1 : 0 }
  }
  const rows = new Map<string, { r: Row; k: ReturnType<typeof keyOf> }[]>()
  for (const r of list) { const k = keyOf(r); const g = rows.get(k.kind) ?? []; g.push({ r, k }); rows.set(k.kind, g) }
  const out = new Map<string, { x: number; y: number }>()
  let y = 0
  for (const kind of KIND_ORDER) {
    const g = rows.get(kind)
    if (!g?.length) continue
    g.sort((a, b) => a.k.num - b.k.num || a.k.variant - b.k.variant || a.r.y - b.r.y || a.r.x - b.r.x)
    let x = x0, rowH = 0
    for (const { r } of g) { out.set(r.id, { x: Math.round(x), y: Math.round(y) }); x += r.width + 120; rowH = Math.max(rowH, r.height) }
    y += rowH + 600
  }
  return out
}

async function loadCatalog() {
  if (preview) return [] as { id: string; name: string; code_name: string | null; match_aliases: string[] | null; figma_component_key: string | null }[]
  const { data } = await supabase.from('components').select('id, name, code_name, match_aliases, figma_component_key')
  return (data ?? []) as { id: string; name: string; code_name: string | null; match_aliases: string[] | null; figma_component_key: string | null }[]
}
function matchComponent(catalog: Awaited<ReturnType<typeof loadCatalog>>, c: FrameComponent): string | null {
  const k = c.name.trim().toLowerCase()
  return catalog.find((x) => (c.key && x.figma_component_key === c.key) || [x.name, x.code_name, ...(x.match_aliases ?? [])].some((n) => n?.trim().toLowerCase() === k))?.id ?? null
}

/** 화면 한 장 저장: 새로 넣거나(다시 불러오기면) 고치고, 칸에 붙이고, 칸의 요청사항을 '확인 전'으로 */
async function saveFrame(fileKey: string, r: Row, f: FrameOut, catalog: Awaited<ReturnType<typeof loadCatalog>>, at: { x: number; y: number }) {
  if (preview) {
    await sleep(120)
    if (r.match === 'again') result.again++
    else if (r.state) result.states++
    else result.added++
    result.links += reqCodesOf(r.slot).length
    return
  }
  const thumb = f.thumbnailUrl ? await keepFigmaThumb(f.thumbnailUrl, fileKey, f.id) : null
  // 편집 가능한 레이어로: Iris 화면(native) + 레이어, 피그마 연결(파일 · 노드)은 남겨 다시 불러오기에 써요
  const lay = importAs.value === 'layers' ? await fetchLayers(fileKey, f.id) : null
  if (lay) result.skipped += lay.skipped
  const layerFields = lay ? { source: 'native' as const, layers: lay.doc } : {}
  const figmaUrl = `https://www.figma.com/design/${fileKey}/?node-id=${f.id.replace(/:/g, '-')}`
  let screenId: string
  if (r.existing) {
    const { error: e } = await supabase.from('screens').update({ name: f.name, width: f.width, height: f.height, ...layerFields, ...(thumb ? { thumbnail_path: thumb } : {}), figma_layer_summary: { components: f.components }, figma_synced_at: new Date().toISOString() }).eq('id', r.existing.id)
    if (e) throw e
    screenId = r.existing.id
    firstSaved.value ??= screenId
    if (!thumb && !lay) pendingThumbs.push({ screenId, fileKey, nodeId: f.id })
    result.again++
    // 이름의 ID 가 바뀌었으면 끝난 뒤 물어요(6)
    const m = slotFromName(f.name)
    const to = m ? slotChoices.value.find((s) => s.code === m.code) : null
    if (to && r.existing.slotCode && to.code !== r.existing.slotCode) result.idChanged.push({ screenId, from: r.existing.slotCode, to, name: f.name })
    return
  }
  const { data, error: e1 } = await supabase.from('screens').insert({
    page_id: props.pageId, source: 'figma', ...layerFields, name: f.name, x: at.x, y: at.y, width: f.width, height: f.height,
    figma_file_key: fileKey, figma_node_id: f.id, figma_url: figmaUrl, thumbnail_path: thumb,
    figma_layer_summary: { components: f.components }, figma_synced_at: new Date().toISOString(),
  }).select('id').single()
  if (e1 || !data) throw e1 ?? new Error('insert')
  screenId = (data as { id: string }).id
  firstSaved.value ??= screenId
  if (!thumb) pendingThumbs.push({ screenId, fileKey, nodeId: f.id })
  if (f.components.length) {
    await supabase.from('screen_component_usages').insert(f.components.map((c) => ({ screen_id: screenId, component_id: matchComponent(catalog, c), detected_name: c.name, count: c.count, source: 'figma' as const })))
  }
  if (r.slot) {
    await setScreenSlot(screenId, r.slot.id, r.state)
    result.links += await linkSlotReqs(screenId, r.slot)
  }
  if (r.state) result.states++
  else result.added++
}
/** 칸의 '요청사항' 열 → 이 화면에 '확인 전' 연결(이미 있으면 그대로) */
async function linkSlotReqs(screenId: string, slot: SlotRow): Promise<number> {
  const reqs = (reqsQ.data.value ?? []).filter((q) => q.document_id === slot.document_id && !q.removed_at)
  const ids = slot.policy_codes.map((c) => reqs.find((q) => q.code.toUpperCase() === c.toUpperCase())?.id).filter((x): x is string => !!x)
  if (!ids.length) return 0
  try { return (await linkMany(ids.map((requirement_id) => ({ screen_id: screenId, requirement_id })), linksQ.data.value ?? [], 'doc_table')).length } catch { return 0 }
}

// ---------------------------------------------------------------------------
// 5 끝 — 빠진 디자인 · 빠진 상태 · 기획서에 없는 ID
// ---------------------------------------------------------------------------
const screensQ = useProjectScreens(props.projectId)
const attention = computed(() => {
  const out: { kind: 'missing' | 'state' | 'warn'; code?: string; name: string; extra?: string }[] = []
  const screens = screensQ.data.value ?? []
  for (const s of slotChoices.value) {
    const on = screens.filter((x) => x.slot_id === s.id)
    if (!on.length) { out.push({ kind: 'missing', code: s.code, name: s.name }); continue }
    for (const st of s.states) if (!on.some((x) => x.slot_state === st)) out.push({ kind: 'state', code: s.code, name: s.name, extra: st })
  }
  for (const r of rows.value) if (r.match === 'warn') out.push({ kind: 'warn', name: r.name })
  return out
})
const ATT: Record<'missing' | 'state' | 'warn', string> = { missing: 'Missing design', state: 'Missing state', warn: 'Not in doc' }

// 6 ID 바뀜 확인 — 끝난 뒤 하나씩
const idAsk = ref<(typeof result.idChanged)[number] | null>(null)
function nextIdChange() { idAsk.value = result.idChanged.shift() ?? null }
async function moveSlot() {
  const a = idAsk.value
  if (!a) return
  try { await setScreenSlot(a.screenId, a.to.id, slotFromName(a.name)?.state ?? null); await linkSlotReqs(a.screenId, a.to) } catch { /* 권한 없음 */ }
  await refreshNuxtData([`all-screens-${props.projectId}`, `links-${props.projectId}`])
  nextIdChange()
}

// ---------------------------------------------------------------------------
// 열기 · 닫기 — 가져오는 중이면 닫아도 계속(다시 열면 진행 화면)
// ---------------------------------------------------------------------------
const importAs = ref<'thumb' | 'layers'>('thumb')
function reset() {
  step.value = 'link'; url.value = ''; error.value = null; scan.value = null; rows.value = []; single.value = null; filter.value = 'all'; pickOpen.value = null; compOpen.value = false; importAs.value = 'thumb'
}
function close() { open.value = false }
watch(open, async (v) => {
  if (!v || import.meta.server) return
  if (step.value === 'run') return
  reset()
  loadMissingThumbs()
  await nextTick()
  document.getElementById('figmaUrl')?.focus()
}, { immediate: true })
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && !idAsk.value) { e.preventDefault(); close() } }
onBeforeUnmount(() => clearInterval(ticker))
function backToLink() { step.value = 'link'; error.value = null }

const primaryLabel = computed(() => {
  if (step.value === 'list') return picked.value.length === 1 ? tr('Import 1 frame') : tr('Import {n} frames', { n: picked.value.length })
  if (step.value === 'frame') return singleRow.value?.existing ? tr('Reimport frame') : tr('Add frame')
  return tr('Next')
})

// 미리보기(개발용): 시안과 같은 프레임 목록
const PREVIEW_COMPONENTS: FrameComponent[] = [{ name: 'Button', count: 6, key: null }, { name: 'Card', count: 3, key: null }, { name: 'Badge', count: 2, key: null }]
async function previewScan(raw: string): Promise<ScanResult> {
  await sleep(400)
  const f = (id: string, name: string, x: number, w = 390, h = 844): ScanFrame => ({ id, name, type: 'FRAME', x, y: 0, width: w, height: h, section: null })
  if (/node-id=12-345/.test(raw)) return { fileKey: 'pv', fileName: '착한구독 앱', kind: 'frame', container: null, innerName: null, frames: [f('pv:1', 'C-04 요금제 선택', 0)] }
  return {
    fileKey: 'pv', fileName: '착한구독 앱', kind: 'list', container: { type: 'PAGE', name: '구독 신청' }, innerName: null,
    frames: [f('pv:1', 'C-04 요금제 선택', 0), f('pv:2', 'C-04/로딩', 470), f('pv:3', 'C-05 서류 제출', 940), f('pv:4', 'C-05/오류', 1410), f('pv:5', 'A-01 신청 심사', 1880, 1440, 900), f('pv:9', 'N-01 심사 결과 알림', 3400, 390, 200), f('pv:6', 'C-06 신청 완료', 3870), f('pv:7', 'C-40 이벤트 배너', 4340), f('pv:8', 'Frame 128', 4810)],
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pop-overlay" @mousedown.self="close" @keydown="onKeydown">
      <section role="dialog" aria-modal="true" aria-labelledby="figmaTitle" class="sq pop" :style="{ '--pop-w': step === 'list' ? '760px' : '560px' }">
        <header class="pop-top">
          <h2 id="figmaTitle" class="pop-ttl">{{ step === 'run' ? tr('Importing from Figma') : tr('Import from Figma') }}</h2>
          <button type="button" class="sq pop-x" :aria-label="step === 'run' ? tr('Close — import keeps going') : tr('Close')" @click="close"><EditorIcon name="close" :size="16" /></button>
        </header>

        <div v-ovscroll class="pop-body fi-body">
          <!-- 링크(1 · 2 · 3 공통) -->
          <div v-if="step === 'link' || step === 'pages' || step === 'list' || step === 'frame'" class="fi-link">
            <TextInput
              v-model:value="url"
              size="s"
              :label="tr('Figma link')"
              placeholder="figma.com/design/…"
              show-left-icon
              left-icon-name="link"
              :show-right-icon="false"
              :show-button="false"
              :show-supporting-text="step === 'link'"
              :supporting-text="tr('Paste a frame, section or page link — in Figma, right-click → Copy link to selection')"
              :destructed="error?.code === 'invalid_url'"
              :input-props="{ id: 'figmaUrl', inputmode: 'url', autocomplete: 'off', spellcheck: false, onKeydown: onUrlKey }"
              :label-props="{ htmlFor: 'figmaUrl' }"
            />
            <!-- 토큰이 없으면: 관리자는 여기서 바로 넣고(가려진 칸), 넣으면 그 링크를 다시 읽어요 -->
            <FigmaTokenField v-if="error?.code === 'no_token'" @saved="doScan" />
            <p v-else-if="error" class="sq fi-note warn" role="alert">
              <EditorIcon name="warning" :size="16" class="fi-note-ic" /><span>{{ tr(error.message) }}</span>
            </p>
            <!-- 무엇을 읽었는지 -->
            <span v-if="scan && step === 'list'" class="fi-src">
              <span class="sq fi-chip">{{ scan.container?.type === 'SECTION' ? tr('Section') : tr('Page') }}</span>
              <b>{{ scan.container?.name }}</b>
              <span class="tx-meta">{{ scan.fileName }} · {{ scan.frames.length === 1 ? tr('1 frame') : tr('{n} frames', { n: scan.frames.length }) }}</span>
            </span>
          </div>

          <!-- 파일 링크: 페이지 고르기 -->
          <div v-if="step === 'pages'" class="fi-pages">
            <span class="tx-meta">{{ tr('{file} — choose a page', { file: scan?.fileName ?? '' }) }}</span>
            <div class="sqc fi-box"><div v-ovscroll class="sqc fi-box-in fi-rows">
              <button v-for="p in pageList" :key="p.id" type="button" class="fi-page" :disabled="scanning" @click="pickPage(p.id)">
                <EditorIcon name="document" :size="16" class="fi-dim" /><span class="ellipsis">{{ p.name }}</span><EditorIcon name="chevron_right" :size="12" class="fi-dim" />
              </button>
            </div></div>
          </div>

          <!-- 예전에 썸네일 없이 들어온 피그마 화면: 한 장씩 다시 받기 -->
          <div v-if="step === 'link' && (missingThumbs.length || thumbs.active)" class="sq fi-miss">
            <EditorIcon name="image" :size="16" class="fi-dim" />
            <span class="fi-col fi-f1">
              <b>{{ thumbs.active ? tr('Making thumbnails — {done} of {total}', { done: thumbs.done, total: thumbs.total }) : missingThumbs.length === 1 ? tr('1 Figma screen has no thumbnail') : tr('{n} Figma screens have no thumbnail', { n: missingThumbs.length }) }}</b>
              <span class="tx-meta">{{ tr('Heavy screens (maps, big photos) can take Figma too long to draw. They’re made again one at a time') }}</span>
            </span>
            <Button size="s" type="tertiary" stroke :loading="thumbs.active" @click="retryMissingThumbs">{{ tr('Make again') }}</Button>
          </div>

          <!-- 1 무엇을 가져오나 -->
          <div v-if="step === 'link'" class="sq fi-guide">
            <div class="fi-kind"><span class="sq fi-chip w">{{ tr('Frame') }}</span><span>{{ tr('That one screen') }}</span></div>
            <div class="fi-kind"><span class="sq fi-chip w">{{ tr('Section') }}</span><span>{{ tr('Every frame inside — you pick which ones in a list') }}</span></div>
            <div class="fi-kind"><span class="sq fi-chip w">{{ tr('Page') }}</span><span>{{ tr('Every top-level frame on the page') }}</span></div>
            <div class="fi-hr" />
            <b>{{ tr('Name frames with a screen ID and they attach on their own') }}</b>
            <span class="fi-ex"><span class="sq fi-sid">C-05</span>상품 상세<span class="tx-meta">— {{ tr('the screen') }}</span></span>
            <span class="fi-ex"><span class="sq fi-sid">C-05</span>/ 일시품절<span class="tx-meta">— {{ tr('a state of it') }}</span></span>
          </div>

          <!-- 2 미리보기 표 -->
          <template v-if="step === 'list'">
            <div v-if="!rows.length" class="page-empty"><p class="tx-meta">{{ tr('No frames found here') }}</p></div>
            <template v-else>
              <div class="sq segc" role="radiogroup" :aria-label="tr('Filter frames')" style="grid-template-columns: repeat(4, minmax(0, 1fr)); width: 100%">
                <button v-for="(f, i) in FILTERS" :key="f.key" type="button" role="radio" :aria-checked="filter === f.key" :class="['sq', 'segc-i', { on: filter === f.key }]" @click="filter = f.key">
                  <span v-if="segLine(i)" class="segc-sep" aria-hidden="true" /><span>{{ tr(f.label) }}</span><span class="n num">{{ fCount(f.key) }}</span>
                </button>
              </div>
              <div class="sqc fi-box"><div class="sqc fi-box-in">
                <div class="fi-tr fi-th">
                  <span class="fi-c"><button type="button" role="checkbox" :aria-checked="someOn ? 'mixed' : allOn" :aria-label="tr('Select all')" :class="['cb', { on: allOn, mix: someOn }]" @click="toggleAll"><i class="sq" /></button></span>
                  <span>{{ tr('Frame') }}</span><span>{{ tr('Screen slot') }}</span><span>{{ tr('Result') }}</span>
                </div>
                <div v-ovscroll class="fi-rows" @scroll="pickOpen = null">
                  <div v-for="r in shown" :key="r.id" :class="['fi-tr', { off: !r.checked }]">
                    <span class="fi-c"><button type="button" role="checkbox" :aria-checked="r.checked" :aria-label="r.name" :class="['cb', { on: r.checked }]" @click="r.checked = !r.checked"><i class="sq" /></button></span>
                    <span class="fi-frame">
                      <span class="sq fi-mini" :style="{ aspectRatio: `${r.width} / ${r.height}` }" aria-hidden="true" />
                      <span class="fi-col"><span class="fi-name ellipsis" :title="r.name">{{ r.name }}</span><span class="tx-meta num">{{ size(r) }}<template v-if="r.section"> · {{ r.section }}</template></span></span>
                    </span>
                    <span class="fi-slot">
                      <template v-if="r.slot"><span class="sq fi-sid">{{ r.slot.code }}</span><span class="ellipsis">{{ r.slot.name }}<span v-if="r.state" class="tx-meta"> · {{ r.state }}</span></span></template>
                      <span v-else-if="r.match === 'warn'" class="tx-meta">{{ tr('Not in any document') }}</span>
                      <span v-else-if="r.match === 'again'" class="tx-meta ellipsis">{{ r.existing?.slotCode ?? tr('Not attached') }} · {{ tr('on this page') }}</span>
                      <div v-else class="fi-pick">
                        <button type="button" class="sq fi-pick-b" :aria-expanded="pickOpen === r.id" @click="togglePick(r, $event)">{{ tr('Choose a slot') }}<EditorIcon name="chevron_down" :size="12" /></button>
                      </div>
                    </span>
                    <span><span :class="['sq', 'fi-res', RESULT[r.match].cls]">{{ tr(RESULT[r.match].label) }}</span></span>
                  </div>
                </div>
              </div></div>
            </template>
          </template>

          <!-- 3 프레임 하나 -->
          <template v-if="step === 'frame' && singleRow">
            <p v-if="scan?.kind === 'inner'" class="sq fi-note"><EditorIcon name="info" :size="16" class="fi-note-ic" /><span>{{ tr('This link points to “{name}” inside a screen — the whole screen will be imported', { name: scan.innerName ?? '' }) }}</span></p>
            <div class="sq fi-card">
              <div class="sq fi-thumb" data-preview>
                <img v-if="single?.thumbnailUrl && !thumbFailed" :src="single.thumbnailUrl" :alt="tr('{name} thumbnail', { name: singleRow.name })" @error="thumbFailed = true">
                <span v-else-if="singleLoading" class="tx-meta">{{ tr('Loading…') }}</span>
                <EditorIcon v-else name="image" :size="20" class="fi-dim" />
              </div>
              <div class="fi-info">
                <div class="fi-col"><b class="fi-name">{{ singleRow.name }}</b><span class="tx-meta num">{{ size(singleRow) }}</span></div>
                <div class="fi-sec">
                  <span class="tx-meta">{{ tr('Attaches to') }}</span>
                  <span v-if="singleRow.slot" class="fi-slot"><span class="sq fi-sid">{{ singleRow.slot.code }}</span><span class="ellipsis">{{ singleRow.slot.name }}<span v-if="singleRow.state" class="tx-meta"> · {{ singleRow.state }}</span></span><span :class="['sq', 'fi-res', RESULT[singleRow.match].cls]">{{ tr(RESULT[singleRow.match].label) }}</span></span>
                  <span v-else class="fi-slot"><span class="tx-meta">{{ singleRow.match === 'again' ? tr('Already on this page — reimporting updates that screen') : singleRow.match === 'warn' ? tr('Its ID isn’t in any document') : tr('No screen ID in its name — it comes in as an unattached screen') }}</span></span>
                </div>
                <div v-if="reqCodesOf(singleRow.slot).length" class="fi-sec">
                  <span class="tx-meta">{{ tr('Requests that come along · Unchecked') }}</span>
                  <span class="fi-pids"><span v-for="c in reqCodesOf(singleRow.slot)" :key="c" class="sq fi-pid">{{ c }}</span></span>
                </div>
                <template v-if="single">
                  <div class="fi-hr" />
                  <button type="button" class="fi-comp-h" :aria-expanded="compOpen" @click="compOpen = !compOpen">
                    <b>{{ tr('Components found') }}</b><span class="tx-meta num">{{ tr('{n} types · {m} instances', { n: single.components.length, m: compTotal }) }}</span>
                    <span class="fi-f1" /><EditorIcon name="chevron_down" :size="12" :class="['fi-car', { up: compOpen }]" />
                  </button>
                  <ul v-if="compOpen" v-ovscroll class="fi-comps">
                    <li v-for="c in single.components" :key="c.name"><span class="ellipsis">{{ c.name }}</span><span class="tx-meta num">{{ c.count }}</span></li>
                    <li v-if="!single.components.length" class="tx-meta">{{ tr('This frame has no component instances') }}</li>
                  </ul>
                </template>
              </div>
            </div>
          </template>

          <!-- 편집 가능한 레이어: 무엇이 어떻게 바뀌는지 미리 알려요 -->
          <p v-if="importAs === 'layers' && (step === 'list' || step === 'frame')" class="sq fi-note"><EditorIcon name="info" :size="16" class="fi-note-ic" /><span>{{ tr('Frames come in as Iris layers you can edit — text uses the Iris font and instances are detached. Takes longer and uses more Figma requests') }}</span></p>

          <!-- 4 가져오는 중 -->
          <template v-if="step === 'run'">
            <div class="fi-prog">
              <div class="fi-prog-h"><b class="num">{{ tr('{done} of {total}', { done: run.done, total: run.total }) }}</b><span class="tx-meta">{{ tr('frames') }}<template v-if="scan?.container"> · {{ scan.container.name }}</template></span></div>
              <div class="sq fi-bar" role="progressbar" :aria-valuenow="run.done" aria-valuemin="0" :aria-valuemax="run.total" :aria-label="tr('Import progress')"><b :style="{ width: (run.total ? (run.done / run.total) * 100 : 0) + '%' }" /></div>
            </div>
            <div v-if="waitLeft" class="sq fi-wait" role="status">
              <EditorIcon name="clock" :size="16" class="fi-note-ic" />
              <span class="fi-col"><b>{{ tr('Figma asked us to slow down — continuing in {s}s', { s: waitLeft }) }}</b><span>{{ tr('Nothing is lost. The rest picks up on its own.') }}</span></span>
            </div>
            <div class="sqc fi-box"><div class="sqc fi-box-in">
              <div v-ovscroll class="fi-rows">
                <div v-for="r in runRows" :key="r.id" class="fi-tr run">
                  <span class="fi-c"><span :class="['fi-st', run.status[r.id]]" aria-hidden="true"><EditorIcon v-if="run.status[r.id] === 'done'" name="check" :size="12" /><EditorIcon v-else-if="run.status[r.id] === 'failed'" name="close" :size="12" /></span></span>
                  <span class="fi-slot"><span v-if="r.slot" class="sq fi-sid">{{ r.slot.code }}</span><span class="ellipsis">{{ r.slot ? r.slot.name : r.name }}<span v-if="r.state" class="tx-meta"> · {{ r.state }}</span></span></span>
                  <span :class="['tx-meta', { warnt: run.status[r.id] === 'waiting' }]">{{ run.status[r.id] === 'done' ? tr('Done') : run.status[r.id] === 'failed' ? tr('Failed') : run.status[r.id] === 'waiting' ? tr('Waiting {s}s', { s: waitLeft }) : tr('Next') }}</span>
                </div>
              </div>
            </div></div>
            <p v-if="thumbs.active" class="sq fi-note" role="status"><EditorIcon name="image" :size="16" class="fi-note-ic" /><span>{{ tr('Making the thumbnails Figma was slow to draw — {done} of {total}', { done: thumbs.done, total: thumbs.total }) }}</span></p>
            <span class="tx-meta">{{ tr('You can close this window — import keeps going and you’ll be told when it’s done') }}</span>
          </template>

          <!-- 5 끝 -->
          <template v-if="step === 'done'">
            <div class="fi-done">
              <span class="fi-ok"><EditorIcon name="check" :size="20" /></span>
              <span class="fi-col fi-gap4">
                <b class="fi-big">{{ (run.done - result.failed) === 1 ? tr('1 frame imported') : tr('{n} frames imported', { n: run.done - result.failed }) }}</b>
                <span class="fi-pids">
                  <span v-if="result.added" class="sq fi-res new">{{ result.added === 1 ? tr('1 new screen') : tr('{n} new screens', { n: result.added }) }}</span>
                  <span v-if="result.states" class="sq fi-res state">{{ result.states === 1 ? tr('1 state') : tr('{n} states', { n: result.states }) }}</span>
                  <span v-if="result.again" class="sq fi-res again">{{ result.again === 1 ? tr('1 reimported') : tr('{n} reimported', { n: result.again }) }}</span>
                  <span v-if="result.failed" class="sq fi-res warn">{{ tr('{n} failed', { n: result.failed }) }}</span>
                  <span v-if="thumbs.failed" class="sq fi-res warn">{{ tr('{n} without thumbnail', { n: thumbs.failed }) }}</span>
                </span>
              </span>
            </div>
            <div v-if="attention.length" class="fi-att">
              <b>{{ tr('Needs a look') }}</b>
              <div class="sqc fi-box"><div class="sqc fi-box-in">
                <div v-ovscroll class="fi-rows short">
                  <div v-for="(a, i) in attention" :key="i" class="fi-tr att">
                    <span class="fi-slot"><span class="sq fi-res warn">{{ tr(ATT[a.kind]) }}</span><span v-if="a.code" class="sq fi-sid">{{ a.code }}</span><span class="ellipsis">{{ a.name }}<span v-if="a.extra" class="tx-meta"> · {{ a.extra }}</span></span></span>
                  </div>
                </div>
              </div></div>
            </div>
            <div v-if="result.links" class="sq fi-links">
              <span class="sq fi-pid num">{{ result.links }}</span><span>{{ tr('requests are now linked to these screens as Unchecked') }}</span>
            </div>
          </template>
        </div>

        <!-- 화면 칸 고르기 메뉴: 표(스크롤 · 잘라내기 칸) 밖, 팝업 바로 아래에 둬요 — 아래 자리가 모자라면 위로 -->
        <div v-if="pickRow" class="sq menu fi-menu" role="menu" :style="pickPos">
          <div class="menu-sc">
            <p v-if="!slotChoices.length" class="tx-meta fi-menu-empty">{{ tr('No screen slots yet — add a document with a screen table') }}</p>
            <button v-for="s in slotChoices" :key="s.id" type="button" role="menuitem" class="sq menu-item" @click="chooseSlot(pickRow, s)"><span class="ellipsis">{{ s.code }} {{ s.name }}</span></button>
          </div>
        </div>
        <footer class="pop-foot" :class="{ 'fi-foot': step === 'list' || step === 'frame' }">
          <!-- 가져오는 방식: 그림만(기본) — 편집 가능한 레이어는 다음에 열려요 -->
          <div v-if="step === 'list' || step === 'frame'" class="fi-as">
            <span class="tx-meta">{{ tr('Import as') }}</span>
            <div class="sq segc fi-as-seg" role="radiogroup" :aria-label="tr('Import as')">
              <button type="button" role="radio" :aria-checked="importAs === 'thumb'" :class="['sq', 'segc-i', { on: importAs === 'thumb' }]" @click="importAs = 'thumb'">{{ tr('Thumbnail') }}</button>
              <button type="button" role="radio" :aria-checked="importAs === 'layers'" :class="['sq', 'segc-i', { on: importAs === 'layers' }]" @click="importAs = 'layers'">{{ tr('Editable layers') }}</button>
            </div>
          </div>
          <div class="fi-btns">
            <template v-if="step === 'run'">
              <Button size="s" type="tertiary" @click="stopImport">{{ tr('Stop') }}</Button>
              <Button size="s" type="tertiary" stroke @click="close">{{ tr('Close') }}</Button>
            </template>
            <template v-else-if="step === 'done'">
              <Button size="s" type="tertiary" @click="close">{{ tr('Close') }}</Button>
              <Button size="s" type="primary" @click="viewOnCanvas">{{ tr('View on canvas') }}</Button>
            </template>
            <template v-else>
              <Button v-if="step !== 'link'" size="s" type="tertiary" @click="backToLink">{{ tr('Back') }}</Button>
              <Button v-else size="s" type="tertiary" @click="close">{{ tr('Cancel') }}</Button>
              <Button v-if="step === 'link'" size="s" type="primary" :loading="scanning" :disabled="!url.trim()" @click="doScan()">{{ tr('Next') }}</Button>
              <Button v-else-if="step !== 'pages'" size="s" type="primary" :disabled="step === 'list' ? !picked.length : !singleRow || singleLoading" @click="startImport">{{ primaryLabel }}</Button>
            </template>
          </div>
        </footer>
      </section>
    </div>
    <AppConfirm
      v-if="idAsk"
      :title="tr('Screen ID changed in Figma')"
      :desc="tr('This frame was renamed. Move it to the new screen slot too?')"
      :actions="[{ label: tr('Keep in {code}', { code: idAsk.from }), onClick: nextIdChange }, { label: tr('Move to {code}', { code: idAsk.to.code }), kind: 'primary', onClick: moveSlot }]"
      @close="nextIdChange"
    >
      <div class="sq fi-idc"><span class="sq fi-sid">{{ idAsk.from }}</span><EditorIcon name="chevron_right" :size="16" class="fi-dim" /><span class="sq fi-sid">{{ idAsk.to.code }}</span><span class="ellipsis">{{ idAsk.to.name }}</span></div>
    </AppConfirm>
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준). 여기에는 안쪽 내용만 — 클래스는 fi- 로 시작(다른 부품과 겹치지 않게) */
.fi-body { gap: var(--ref-spacing-08); }
/* 창이 낮으면 안쪽이 줄어들지 않고 본문이 스크롤돼요(표가 눌려 사라지지 않게) */
.fi-body > * { flex: none; }
.fi-link { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.fi-miss { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: #FFF6EC; }
.fi-miss b { font-weight: 600; }
.fi-miss :deep(.bd-button) { flex: none; }
.fi-pages { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.fi-page { width: 100%; display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 40px; padding: 0 var(--ref-spacing-07); border: 0; background: none; font: inherit; color: var(--sys-color-neutral-800); text-align: left; cursor: pointer; box-shadow: inset 0 -1px 0 var(--iris-line); transition: background-color .12s ease; }
.fi-page:last-child { box-shadow: none; }
.fi-page:hover { background: var(--interaction-light-gray-hover); }
.fi-page:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.fi-page > .ellipsis { flex: 1; }
.fi-note { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); margin: 0; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.fi-note.warn { color: var(--sys-color-theme-error-default); }
.fi-note-ic { flex: none; margin-top: 1px; }
.fi-src { display: flex; align-items: center; gap: var(--ref-spacing-05); min-width: 0; color: var(--sys-color-neutral-600); }
.fi-src b { font-weight: 600; color: var(--sys-color-neutral-800); }
.fi-chip { display: inline-flex; align-items: center; justify-content: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.fi-chip.w { width: 64px; flex: none; --sq-fill: var(--sys-color-common-white-default); }
/* 1: 링크 종류 안내 — 문서 추가 창 가이드 칸과 같은 옅은 바탕 · 모서리 16 */
.fi-guide { display: flex; flex-direction: column; gap: var(--ref-spacing-07); padding: var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); }
.fi-guide b { font-weight: 600; }
.fi-kind { display: flex; align-items: center; gap: var(--ref-spacing-07); color: var(--sys-color-neutral-700); }
.fi-hr { height: 1px; background: var(--iris-line); flex: none; }
.fi-ex { display: flex; align-items: center; gap: var(--ref-spacing-05); color: var(--sys-color-neutral-600); margin-top: calc(-1 * var(--ref-spacing-04)); }
.fi-sid { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: var(--ref-radius-02); font-size: 10px; font-weight: 600; color: #1F63BD; --sq-fill: var(--sys-color-common-white-default); --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }
.fi-pid { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); }
.fi-pids { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }

/* 2: 표 — 옅은 테두리 칸 안, 머리 줄 회색 */
.fi-box { border-radius: var(--ref-radius-06); padding: 1px; background: var(--iris-line-strong); }
/* 테두리 = 바깥 칸 바탕 1px(선 그림자 대신 — 안에 스크롤 칸이 있으면 squircle 선이 두껍게 번지는 문제가 있어서) */
.fi-box-in { border-radius: calc(var(--ref-radius-06) - 1px); background: var(--sys-color-common-white-default); overflow: hidden; }
.fi-tr { display: grid; grid-template-columns: 36px minmax(0, 1.25fr) minmax(0, 1fr) 128px; align-items: center; min-height: 52px; box-shadow: inset 0 -1px 0 var(--iris-line); }
.fi-tr > span { min-width: 0; padding: 0 var(--ref-spacing-06); }
.fi-tr > .fi-c { display: grid; place-items: center; padding: 0; }
.fi-th { min-height: 32px; background: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-weight: 500; box-shadow: inset 0 -1px 0 var(--iris-line-strong); }
.fi-rows { max-height: 380px; overflow-x: hidden; overflow-y: auto; }
.fi-rows.short { max-height: 196px; }
.fi-rows > .fi-tr:last-child { box-shadow: none; }
.fi-tr.off .fi-name { color: var(--sys-color-neutral-600); }
.fi-tr.run { grid-template-columns: 36px minmax(0, 1fr) 120px; min-height: 40px; }
.fi-tr.att { grid-template-columns: minmax(0, 1fr); min-height: 44px; }
.fi-tr.att > span { padding: 0 var(--ref-spacing-07); }
.fi-tr .cb { min-height: 16px; }
.fi-frame { display: flex; align-items: center; gap: var(--ref-spacing-06); }
.fi-mini { flex: none; width: 28px; max-height: 40px; border-radius: var(--ref-radius-02); --sq-fill: var(--iris-paper); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.fi-col { display: flex; flex-direction: column; min-width: 0; }
.fi-gap4 { gap: var(--ref-spacing-04); }
.fi-name { font-weight: 500; color: var(--sys-color-neutral-800); }
.fi-slot { display: flex; align-items: center; gap: var(--ref-spacing-05); min-width: 0; }
.fi-res { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.fi-res.new { color: #1F63BD; --sq-fill: var(--sys-color-brand-primary-lightest); }
.fi-res.state { color: #4A7FC4; --sq-fill: #F1F6FD; --sq-line: #D6E5F8; --sq-line-w: 1px; }
.fi-res.warn { color: #B44A0E; --sq-fill: #FFF1E8; }
.fi-res.noid { --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.fi-pick { position: relative; }
.fi-pick-b { display: inline-flex; align-items: center; gap: var(--ref-spacing-03); height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.fi-pick-b:hover { color: var(--sys-color-neutral-800); }
.fi-menu { position: fixed; right: auto; width: 240px; z-index: 120; }
.fi-menu .menu-sc { max-height: 224px; }
.fi-menu-empty { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); }

/* 3: 프레임 카드 */
.fi-card { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--ref-spacing-10); padding: var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.fi-thumb { height: 200px; display: grid; place-items: center; overflow: hidden; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); }
.fi-thumb img { width: 100%; height: 100%; object-fit: contain; object-position: top center; }
.fi-dim { color: var(--sys-color-neutral-500); flex: none; }
.fi-info { min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-07); }
.fi-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-03); }
.fi-comp-h { display: flex; align-items: center; gap: var(--ref-spacing-05); padding: 0; border: 0; background: none; font: inherit; color: var(--sys-color-neutral-700); text-align: left; cursor: pointer; }
.fi-comp-h b { font-weight: 600; }
.fi-f1 { flex: 1; }
.fi-car { transition: transform .16s ease; }
.fi-car.up { transform: rotate(180deg); }
.fi-comps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 132px; overflow-x: hidden; overflow-y: auto; }
.fi-comps li { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-04); min-height: 22px; }

/* 4: 진행률 · 기다림 */
.fi-prog { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.fi-prog-h { display: flex; align-items: baseline; gap: var(--ref-spacing-05); }
.fi-prog-h b, .fi-big { font-size: 14px; line-height: 20px; font-weight: 600; }
.fi-bar { height: 6px; border-radius: 3px; --sq-fill: var(--sys-color-neutral-200); overflow: hidden; }
.fi-bar > b { display: block; height: 100%; background: var(--sys-color-brand-primary-default); transition: width .3s ease; }
.fi-wait { display: flex; align-items: flex-start; gap: var(--ref-spacing-05); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: #FFF6EC; color: #8A4A12; }
.fi-wait b { font-weight: 600; }
.fi-st { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; box-shadow: inset 0 0 0 1.5px var(--sys-color-neutral-300); }
.fi-st.done { background: #E9F6EC; color: #1B7A2B; box-shadow: none; }
.fi-st.failed { background: var(--sys-color-theme-error-lightest, #FFEDEB); color: var(--sys-color-theme-error-default); box-shadow: none; }
.fi-st.waiting { box-shadow: inset 0 0 0 1.5px #F2C59E; }
.warnt { color: #B44A0E; }

/* 5: 끝 */
.fi-done { display: flex; align-items: center; gap: var(--ref-spacing-08); }
.fi-ok { width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
.fi-att { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.fi-att > b { font-weight: 600; }
.fi-links { display: flex; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.fi-idc { display: flex; align-items: center; gap: var(--ref-spacing-05); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); min-width: 0; }

/* 아래 줄: 왼쪽 가져오는 방식, 오른쪽 버튼 */
.fi-foot { justify-content: space-between; }
.fi-as { display: flex; align-items: center; gap: var(--ref-spacing-06); }
.fi-btns { display: flex; align-items: center; gap: var(--ref-spacing-04); }
/* 가져오는 방식 세그먼트: 두 칸 같은 폭, 글자 좌우 여백 넉넉히(다른 세그먼트와 같은 높이 32) */
.fi-as-seg { grid-template-columns: repeat(2, minmax(0, 1fr)); width: 248px; }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
