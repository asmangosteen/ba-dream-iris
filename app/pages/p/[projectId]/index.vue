<script setup lang="ts">
import { fmtNum } from '~/canvas/num'
import { guessReqLayers, matchReqLayers, reqLost } from '~/canvas/reqMatch'
import { topImagePaint } from '~/canvas/paint'
import { descendants } from '~/canvas/schema'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import IrisLoading, { IRIS_LOADING_MIN } from '~/components/app/IrisLoading.vue'
import { Button, Skeleton, TextButton } from '@ba-dream/design-system'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import InspectorPlan from '~/components/editor/InspectorPlan.vue'
import KeyboardShortcuts from '~/components/editor/KeyboardShortcuts.vue'
import InspectorDev from '~/components/editor/InspectorDev.vue'
import InspectorDesign from '~/components/editor/InspectorDesign.vue'
import { importSvg } from '~/canvas/vector'
import InspectorLayer from '~/components/editor/InspectorLayer.vue'
import InspectorScale from '~/components/editor/InspectorScale.vue'
import InspectorExport from '~/components/editor/InspectorExport.vue'
import InspectorPage from '~/components/editor/InspectorPage.vue'
import { arrangeRects, type ArrangeOp } from '~/canvas/geom'
import LayerTree from '~/components/editor/LayerTree.vue'
import { useMixScreens, useToastReq } from '~/composables/useLayerMenu'
import { createLayerStore, LAYER_STORE } from '~/canvas/store'
import { isMediaFile, isVideoFile, mediaLimit, MediaTooLargeError, pendingUploads, prepareImage } from '~/canvas/images'
import EditorAssets from '~/components/editor/EditorAssets.vue'
import EditorVariables from '~/components/editor/EditorVariables.vue'
import FigmaLinkModal from '~/components/editor/FigmaLinkModal.vue'
import DocReader from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import ProjectModal from '~/components/project/ProjectModal.vue'
import AppCommandPalette from '~/components/app/CommandPalette.vue'
import type { Viewport } from '~/components/editor/EditorCanvas.vue'
import type { PageSettings, ScreenRow } from '~/composables/useEditor'
import { docIcon, DOC_CATEGORY_LABEL, type DocCategory } from '~/composables/useIrisData'

const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
const { project, pages, pageId, screens, addPage, renamePage, removePage, setPageOrder, reorderScreen, setScreenOrder, updatePageSettings, addScreen, updateScreen, removeScreen } = useEditor(projectId)
// 좌우 사이드바 접기(위로 접혀서 탭 줄만 남아요): 왼쪽 패널의 접기 버튼 하나로 좌우가 함께 접히고 펼쳐져요. 이 브라우저에 기억
const collapsed = ref<{ left: boolean; right: boolean }>({ left: false, right: false })
onMounted(() => { try { const v = JSON.parse(localStorage.getItem('iris-panels') ?? '{}'); const c = !!(v.left || v.right); collapsed.value = { left: c, right: c } } catch { /* 저장소를 못 쓰면 펼친 채로 */ } })
function togglePanel() {
  const c = !(collapsed.value.left || collapsed.value.right)
  collapsed.value = { left: c, right: c }
  try { localStorage.setItem('iris-panels', JSON.stringify(collapsed.value)) } catch { /* 기억만 못 해요 */ }
}
/** 접힌 채로 탭을 누르면 좌우를 함께 펼쳐요 */
const expandPanels = () => { if (collapsed.value.left || collapsed.value.right) togglePanel() }
// 보기 설정(오른쪽 패널 위 ⚙): 피그마 보기 메뉴 중 Iris 가 그리는 것 — Pixel grid · Layout grids · Rulers
const viewOpen = ref(false)
const gridsShown = useLayoutGridsShown()
const rulersShown = useState('iris-rulers', () => false)
// 페이지 우클릭 메뉴 · 지우기 확인
const pageCtx = useContextMenu()
const confirmPage = ref<{ id: string; name: string; count: number } | null>(null)
/** 요구사항이 연결된 프레임 지우기 확인(공용 확인 창): 확인하면 연결도 함께 끊고 지워요 — ⌘Z 로 프레임 · 연결 함께 되살려요 */
const confirmFrames = ref<{ frames: ScreenRow[]; links: number; kept: number } | null>(null)
function pageMenu(p: { id: string; name: string }, e: MouseEvent) {
  pageCtx.open(e, [
    { label: tr('Rename'), action: () => (renaming.value = p.id) },
    'sep',
    { label: tr('Delete page'), danger: true, disabled: (pages.data.value?.length ?? 0) <= 1, action: () => (confirmPage.value = { id: p.id, name: p.name, count: p.id === pageId.value ? list.value.length : -1 }) },
  ])
}
async function doRemovePage() {
  const c = confirmPage.value
  confirmPage.value = null
  if (!c) return
  try { await removePage(c.id); say(tr('Deleted {name}', { name: c.name })) } catch { sayFail(tr('Couldn\'t delete the page. Try again')) }
}
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const allScreens = useProjectScreens(projectId)
const { addRequirement, setLink, removeLink } = useIrisMutations()

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------
const left = ref<'file' | 'assets' | 'docs'>('file')
/** 페이지 끌어서 순서 바꾸기(레이어 목록처럼): 줄 위쪽 반이면 그 위로, 아래쪽 반이면 그 아래로. 실행취소 한 번 */
const pageDrag = ref<string | null>(null)
const pageOver = ref<{ id: string; below: boolean; y: number } | null>(null)
function onPageOver(e: DragEvent, id: string) {
  if (!pageDrag.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const below = e.clientY > r.top + r.height / 2
  // 놓을 자리 선: 레이어 목록과 같은 선을 줄 사이에(줄 자체는 둥근 모양으로 잘려서 줄 위에 그리면 안 보여요)
  pageOver.value = { id, below, y: el.offsetTop + (below ? el.offsetHeight : 0) }
}
async function onPageDrop() {
  const from = pageDrag.value, ov = pageOver.value
  pageDrag.value = null
  pageOver.value = null
  if (!from || !ov || from === ov.id) return
  const before = (pages.data.value ?? []).map((p) => p.id)
  const rest = before.filter((id) => id !== from)
  const at = rest.indexOf(ov.id) + (ov.below ? 1 : 0)
  const after = [...rest.slice(0, at), from, ...rest.slice(at)]
  if (after.join() === before.join()) return
  try {
    await setPageOrder(after)
    store.pushAction(null, () => setPageOrder(before), () => setPageOrder(after))
  } catch { sayFail(tr('Something went wrong. Try again')) }
}
/** 페이지 구분선: 이름이 대시(-, –, —) 3개 이상뿐이면 */
const isDivider = (name: string) => /^\s*[-–—]{3,}\s*$/.test(name)
/**
 * 왼쪽 패널 Pages | Layers 나누기(피그마와 같아요): 사이 선에 올리면 ↕ 커서, 끌면 Pages 높이가 바뀌고 Layers 가 나머지를 써요. 높이는 이 브라우저에 기억해요
 */
const pagesEl = ref<HTMLElement | null>(null)
const pagesH = ref<number | null>(null)
onMounted(() => { try { const v = Number(localStorage.getItem('iris-pages-h')); if (v > 0) pagesH.value = v } catch { /* 저장소를 못 쓰면 기본 높이 */ } })
const splitting = ref(false)
function startSplit(e: PointerEvent) {
  const el = pagesEl.value
  if (!el) return
  e.preventDefault()
  const box = el.parentElement!.getBoundingClientRect()
  const y0 = e.clientY, h0 = el.getBoundingClientRect().height
  const max = Math.max(72, box.bottom - el.getBoundingClientRect().top - 120) // Layers 가 최소 120 은 남게
  splitting.value = true
  const move = (ev: PointerEvent) => { pagesH.value = Math.round(Math.min(max, Math.max(72, h0 + ev.clientY - y0))) }
  const up = () => {
    splitting.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    try { if (pagesH.value) localStorage.setItem('iris-pages-h', String(pagesH.value)) } catch { /* 기억 못 해도 괜찮아요 */ }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
/** 두 번 누르면 원래 높이(내용만큼, 최대 40%)로 */
function resetSplit() { pagesH.value = null; try { localStorage.removeItem('iris-pages-h') } catch { /* 무시 */ } }
const tab = ref<'design' | 'plan' | 'dev'>('design')
const tool = ref<Tool>('move')
const asset = ref<string | null>(null)
/** 변수 화면(좌측 패널 맨 아래 Variables) — 열면 편집기 전체를 덮어요 */
const varsOpen = ref(false)
const docId = ref<string | null>(null)
const docReq = ref<string | null>(null)
const addDocOpen = ref(false)
const figmaOpen = ref(false)
const vp = ref<Viewport>({ x: 352, y: 94, zoom: 0.5 })
const canvas = ref<{ fit: (ids?: string[]) => void; zoomAt: (z: number) => void; fitSelection: (maxZoom?: number) => void; reveal: (sid: string, ids: string[]) => void; focusOn: (sid: string, ids: string[]) => void; insertInstance: (name: string, at?: { x: number; y: number }) => void; sectionScreens: (ids?: string[]) => void; paste: () => void } | null>(null)
const plan = ref<{ openPicker: () => void } | null>(null)

const list = computed(() => screens.data.value ?? [])
/** 캔버스 위(화면 밖)에 그린 레이어: 페이지에 저장되는 가상 화면 하나로 다룹니다(좌표 = 캔버스 좌표) */
const canvasScreen = computed<ScreenRow | null>(() => {
  const p = pages.data.value?.find((x) => x.id === pageId.value)
  return p ? { id: pageCanvasId(p.id), name: tr('Canvas'), source: 'native', x: 0, y: 0, width: 0, height: 0, status: 'draft', layers: p.layers ?? null } : null
})
const currentPage = computed(() => pages.data.value?.find((x) => x.id === pageId.value) ?? null)
async function onPageSettings(patch: PageSettings) {
  const p = currentPage.value
  if (!p) return
  const before = { ...(p.viewport ?? {}) }
  try {
    await updatePageSettings(p.id, patch)
    // 보기 설정(픽셀 격자 · 픽셀에 맞추기)은 문서 내용이 아니라 실행취소에 넣지 않아요(피그마와 같아요)
    if (Object.keys(patch).every((k) => k === 'pixelGrid' || k === 'snapPixel')) return
    store.pushAction(null, () => updatePageSettings(p.id, before), () => updatePageSettings(p.id, patch))
  } catch { sayFail(tr('Couldn\'t save page settings')) }
}
const canvasList = computed(() => (canvasScreen.value ? [...list.value, canvasScreen.value] : list.value))
const { tokens } = useDesignSystem()
const supabase = useSupabaseClient()
const preview = useDevPreview()
// 저장하지 못한 화면 내용은 이 브라우저에 보관(새로 고치거나 닫아도 다시 열면 복구 — 피그마 autosave 처럼)
const backup = useUnsavedBackup(projectId)
let backupFailed = false
// 화면 안 레이어: 고르기 · 실행취소 · 자동저장
const store = createLayerStore({
  screens: canvasList,
  save: (sid, doc) => updateScreen(sid, { layers: doc }),
  tokens: computed(() => (tokens.data.value ?? []).map((t) => ({ name: t.name, value: t.value }))),
  onUnsaved: (sid, doc) => {
    if (backup.put(sid, doc)) { backupFailed = false; return }
    if (!backupFailed) say(tr('Couldn\'t keep your changes in this browser (storage is full). Keep this tab open until they\'re saved'), 6000)
    backupFailed = true
  },
  onSaved: (sid) => backup.drop(sid),
})
provide(LAYER_STORE, store)
const selected = store.screenId
const current = computed(() => list.value.find((s) => s.id === selected.value) ?? null)
const openDoc = computed(() => (docs.data.value ?? []).find((d) => d.id === docId.value) ?? null)
/** 문서를 왼쪽 Docs 탭에서 읽는 중인가(다른 탭으로 가면 청록 선 · 카드 포커스도 쉬어요 — 돌아오면 그대로) */
const docShown = computed(() => left.value === 'docs' && !!openDoc.value)
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
/** 화면이 하나라도 연결된 요구사항 — 문서에서 없는 것은 번호를 빨갛게(프레임을 지우면 연결이 끊겨요) */
/**
 * 그린 요소를 지운 요구사항(사용자 요청 2026-11-26): 프레임 안에서 그 REQ 를 그린 요소를 지우면 문서에서 번호 · 카드를 빨갛게(팝업 없이 지워요).
 * 처음 짝지을 때(직접 연결 · 이름 · 글자 짐작) 그 레이어를 문서 데이터에 기억해 둬요(reqBind) — 새로고침해도 유지, ⌘Z 로 요소가 돌아오면 원래 색
 */
const reqDocSig = computed(() => {
  const sids = [...new Set((links.data.value ?? []).map((l) => l.screen_id))].filter((sid) => store.docs[sid])
  return sids.map((sid) => sid + ':' + Object.keys(store.docs[sid]!.nodes).length).join('|') + '#' + (reqs.data.value ?? []).length
})
watch(reqDocSig, () => {
  for (const l of links.data.value ?? []) {
    const d = store.docs[l.screen_id]
    const scr = list.value.find((v) => v.id === l.screen_id)
    if (!d || scr?.source !== 'native' || d.reqBind?.[l.requirement_id]) continue
    const r = (reqs.data.value ?? []).find((x) => x.id === l.requirement_id)
    if (!r) continue
    const ids = guessReqLayers(d, r.id, [r.title, r.body ?? ''].join(' '))
    if (ids.length && !ids.every((id) => d.nodes[id]?.reqs?.includes(r.id))) store.setReqBind(l.screen_id, r.id, ids)
  }
}, { immediate: true })
const lostReqs = computed(() => {
  const out = new Set<string>()
  for (const l of links.data.value ?? []) { const d = store.docs[l.screen_id]; if (d && reqLost(d, l.requirement_id)) out.add(l.requirement_id) }
  return out
})
/** 그려지지 않은 REQ(연결된 프레임이 없거나 그린 요소를 지움): 고를 수 없고, 캔버스 청록 선 · 카드 선택선도 없어요(사용자 요청 2026-11-26) */
const reqGone = (id: string) => links.status.value === 'success' && (lostReqs.value.has(id) || !(links.data.value ?? []).some((l) => l.requirement_id === id))
watch(() => docReq.value && reqGone(docReq.value), (gone) => { if (gone) docReq.value = null })
/** 화면이 연결돼 있고, 그린 요소도 지우지 않은 요구사항 — 문서에서 나머지는 번호 · 카드를 빨갛게 */
const linkedReqIds = computed(() => (links.status.value === 'success' ? [...new Set((links.data.value ?? []).map((l) => l.requirement_id))].filter((id) => !lostReqs.value.has(id)) : null))
/**
 * 문서에서 고른 요구사항에 연결된 화면을 캔버스에서 강조 — 지금 고른 화면(REQ 를 눌러 그 안 항목으로 포커스한 화면)은 빼요.
 * 그 화면은 고른 항목만 선택선으로 보이고, 화면 전체 색 · 테두리는 덮지 않아요
 */
const highlight = computed(() => (docReq.value ? (links.data.value ?? []).filter((l) => l.requirement_id === docReq.value && l.screen_id !== selected.value).map((l) => l.screen_id) : []))
/**
 * 문서를 읽는 중에 다른 화면(프레임)을 고르면: 그 화면에 연결된 이 문서의 요구사항(문서 순서로 첫 번째)으로 포커스를 옮겨요.
 * 지금 고른 요구사항이 그 화면에도 연결돼 있으면 그대로, 연결된 게 없으면 포커스를 풀어요
 */
watch(selected, (sid, old) => {
  if (!sid || sid === old || !docShown.value || isPageCanvas(sid)) return
  const linked = new Set((links.data.value ?? []).filter((l) => l.screen_id === sid).map((l) => l.requirement_id))
  if (docReq.value && linked.has(docReq.value)) return
  const first = [...docReqs.value].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })).find((r) => linked.has(r.id) && !reqGone(r.id))
  docReq.value = first?.id ?? null
})

// 토스트
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string, ms = 3000) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), ms)
}
// 패널 · 레이어 목록 등 다른 부품이 보낸 안내(useToastReq)
const toastReq = useToastReq()
watch(toastReq, (v) => { if (v) say(v.text) })
/** 실패 알림: 인터넷이 끊겨 있으면 그 이유를 붙여요 */
function sayFail(text: string) {
  say(online.value ? text : `${text} · ${tr('You\'re offline')}`, 4000)
}

// ---------------------------------------------------------------------------
// 페이지 · 화면
// ---------------------------------------------------------------------------
// 탭 막대의 도는 표시: 페이지 · 화면을 다 읽을 때까지
const tabBusy = useState<boolean>('iris-tab-busy', () => false)
watch(() => [pages.status.value, screens.status.value] as const, ([a, b]) => { tabBusy.value = a === 'pending' || b === 'pending' || a === 'idle' }, { immediate: true })
onBeforeUnmount(() => { tabBusy.value = false })
const views = new Map<string, Viewport>() // 페이지마다 보던 위치 기억(이 브라우저에 저장 — 다시 열어도 그 자리, 피그마와 같아요)
const VIEW_KEY = (pid: string) => `iris-view:${projectId}:${pid}`
function savedView(pid: string): Viewport | undefined {
  if (views.has(pid)) return views.get(pid)
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY(pid)) ?? 'null'); return v && Number.isFinite(v.zoom) ? v : undefined } catch { return undefined }
}
let viewTimer: ReturnType<typeof setTimeout> | null = null
watch(vp, (v) => {
  const pid = pageId.value
  if (!pid || !import.meta.client) return
  views.set(pid, { ...v })
  if (viewTimer) clearTimeout(viewTimer)
  viewTimer = setTimeout(() => { try { localStorage.setItem(VIEW_KEY(pid), JSON.stringify(v)) } catch { /* 기억만 못 해요 */ } }, 300)
}, { deep: true })
let fitted: string | null = null
/**
 * 캔버스는 보던 자리(저장한 보기)를 놓은 뒤에 부드럽게 나타나요 — 새로 고칠 때 서버가 그린 기본 자리에서 툭 옮겨 가지 않게,
 * 페이지를 바꿀 때도 이전 페이지 화면이 새 자리로 튀지 않게(사라질 땐 바로, 나타날 땐 .28s)
 */
/** 탭을 옮겨 다시 왔을 때(이미 불러온 프로젝트): 로딩 화면 · 나타나기 없이 바로 */
const tabReload = useTabReload()
/** ⌘R · 탭 메뉴 Reload 로 새로 고친 경우: 로딩 화면을 띄우고 프로젝트 · 페이지 · 화면을 다시 받아요(같은 열쇠의 데이터를 그대로 쓰지 않게) */
const forced = import.meta.client && tabReload.consume(projectId)
if (forced) { project.refresh(); pages.refresh(); screens.refresh() }
const warm = !forced && import.meta.client && !useNuxtApp().isHydrating && pages.status.value === 'success' && screens.status.value === 'success'
const viewReady = ref(warm)
let mounted = false
let revealT: ReturnType<typeof setTimeout> | null = null
function revealCanvas() {
  if (revealT) { clearTimeout(revealT); revealT = null }
  nextTick(() => requestAnimationFrame(() => { viewReady.value = true }))
}
watch(pageId, (next, prev) => {
  if (prev && import.meta.client) { viewReady.value = false; if (revealT) clearTimeout(revealT); revealT = setTimeout(revealCanvas, 800) }
  if (prev) views.set(prev, { ...vp.value })
  store.selectScreen(null)
  const v = next ? savedView(next) : undefined
  if (v) { vp.value = v; fitted = next }
})
watch(() => [pageId.value, screens.status.value] as const, ([pid, st]) => {
  if (!import.meta.client || st !== 'success' || !pid) return
  if (fitted !== pid) {
    fitted = pid
    const v = savedView(pid)
    if (v) vp.value = { ...v }
    else nextTick(() => canvas.value?.fit())
  }
  if (mounted) revealCanvas()
}, { immediate: true })
onMounted(() => {
  mounted = true
  if (screens.status.value === 'success' && fitted !== pageId.value) { fitted = pageId.value; const v = pageId.value ? savedView(pageId.value) : undefined; if (v) vp.value = { ...v }; else canvas.value?.fit() }
  revealCanvas()
})
onBeforeUnmount(() => { if (revealT) clearTimeout(revealT) })
/**
 * 로딩 화면(새로 고침 · 처음 여는 프로젝트 — 피그마처럼): 서버가 그린 첫 화면부터 덮고, 단계마다 막대가 차요. 이미 불러온 탭으로 옮길 땐 안 떠요
 * 화면 붙이기 55% → 글꼴 85% → 보던 자리 놓기 · 최소 2초 → 100% → 다 찬 막대를 잠깐 보여 주고 .35s 로 사라져요
 */
const booting = ref(!warm)
const hydrated = import.meta.client && useNuxtApp().isHydrating
const bootP = ref(0)
onMounted(async () => {
  if (!booting.value) return
  // 로고가 돌기 시작한 때: 새로 고침이면 첫 그림(서버가 그린 로딩 화면), 탭에서 처음 열면 지금 — 2초 뒤 한 바퀴가 딱 끝날 때 사라져요
  const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
  const t0 = hydrated && paint != null ? paint : performance.now()
  bootP.value = 0.55
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))])
  bootP.value = 0.85
  if (!viewReady.value && !loadErr.value) await new Promise<void>((r) => { const stop = watch([viewReady, loadErr], ([v, e]) => { if (v || e) { stop(); r() } }); setTimeout(() => { stop(); r() }, 3000) })
  // 아무리 빨라도 최소 2초는 보여요(로고가 딱 한 바퀴 — IrisLoading 의 회전 2s · IRIS_LOADING_MIN 과 같아요). 막대는 그 끝에 맞춰 다 차요
  const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))
  await wait(IRIS_LOADING_MIN - 500 - (performance.now() - t0))
  bootP.value = 1
  await wait(500)
  booting.value = false
})

async function onAddPage() {
  try {
    const prev = pageId.value
    const row = await addPage()
    // 실행취소: 방금 만든 빈 페이지를 지우고 원래 페이지로(피그마와 같아요)
    if (row) {
      let cur = row.id
      store.pushAction(null, async () => { await removePage(cur); if (prev) pageId.value = prev }, async () => { const r = await addPage(); if (r) { cur = r.id; await renamePage(r.id, row.name) } })
    }
  } catch { sayFail(tr('Couldn\'t add a page. Try again')) }
}
/** 페이지 이름 바꾸기(실행취소 가능) */
async function renamePageUndoable(id: string, name: string) {
  const before = pages.data.value?.find((x) => x.id === id)?.name
  if (!before || !name.trim() || name.trim() === before) return
  await renamePage(id, name)
  store.pushAction(null, () => renamePage(id, before), () => renamePage(id, name))
}
const renaming = ref<string | null>(null)
async function onRename(id: string, e: Event) {
  // Esc 로 취소한 뒤 따라오는 blur 는 무시해요
  if (renaming.value !== id) return
  renaming.value = null
  const name = (e.target as HTMLInputElement).value.trim()
  const before = pages.data.value?.find((x) => x.id === id)?.name
  if (!name || name === before) return
  try { await renamePageUndoable(id, name) } catch { sayFail(tr('Couldn\'t rename')) }
}
/** 프로젝트 이름: 왼쪽 위 이름을 두 번 누르면 바로 고쳐요(피그마 파일 이름과 같아요). Enter · 바깥 누르기 = 저장, Esc = 취소 */
const projRenaming = ref(false)
const projActions = useProjectActions()
async function onProjRename(e: Event) {
  if (!projRenaming.value) return
  projRenaming.value = false
  const name = (e.target as HTMLInputElement).value.trim()
  if (!name || name === project.data.value?.name) return
  try { await projActions.update(projectId, { name }) } catch { sayFail(tr('Couldn\'t rename the project')) }
}
/** 프레임 우클릭 'Set as thumbnail' · 'Restore default thumbnail': 홈 목록 카드에 보일 화면(null 이면 첫 페이지의 첫 화면) */
async function onThumbnail(id: string | null) {
  try {
    await projActions.update(projectId, { cover_screen_id: id })
    say(id ? tr('Set as the project thumbnail') : tr('Restored the default thumbnail'))
  } catch { sayFail(tr('Couldn\'t change the thumbnail. Try again')) }
}
/** 이름 바꾸기 입력칸: 열리면 바로 포커스하고 글자를 모두 골라요(피그마와 같아요) */
const vSelect = { mounted: (el: HTMLInputElement) => nextTick(() => { el.focus(); el.select() }) }

const moveFrom = new Map<string, { x: number; y: number }>()
function onMove(id: string, x: number, y: number, done: boolean) {
  const s = list.value.find((v) => v.id === id)
  if (!s) return
  if (!done) { if (!moveFrom.has(id)) moveFrom.set(id, { x: s.x, y: s.y }); s.x = x; s.y = y; return }
  const from = moveFrom.get(id) ?? { x, y }
  moveFrom.delete(id)
  const fail = () => sayFail(tr('Couldn\'t save the position. Try again'))
  updateScreen(id, { x, y }).catch(fail)
  store.pushAction(id, () => updateScreen(id, from).catch(fail), () => updateScreen(id, { x, y }).catch(fail))
}
/** 화면 변 · 모서리 끌어 크기: 끄는 동안은 바로 반영, 놓을 때 저장하고 실행취소 한 번 */
type ScreenRect = { x: number; y: number; width: number; height: number }
const resizeFrom = new Map<string, ScreenRect>()
function onResizeScreen(id: string, r: ScreenRect, done: boolean) {
  const s = list.value.find((v) => v.id === id)
  if (!s) return
  if (!done) { if (!resizeFrom.has(id)) resizeFrom.set(id, { x: s.x, y: s.y, width: s.width, height: s.height }); Object.assign(s, r); return }
  const from = resizeFrom.get(id) ?? r
  resizeFrom.delete(id)
  const fail = () => sayFail(tr('Couldn\'t save the size. Try again'))
  updateScreen(id, r).catch(fail)
  store.pushAction(id, () => updateScreen(id, from).catch(fail), () => updateScreen(id, r).catch(fail))
}
/** 여러 화면 정렬 · 균등 분배 · 간격 맞추기: 한 번에 실행취소 */
const multiScreens = ref<string[]>([])
/** 캔버스에서 뭔가 골랐는지(프레임 · 여러 프레임 · 레이어). 사이드바를 접어 둬도 고르면 오른쪽 Design 패널은 펼쳐 보여요(피그마처럼).
    문서를 열어 둔 오른쪽 패널도 접기와 상관없이 그대로 — 문서 패널 위 X 로 닫아야 접혀요 */
const hasPick = computed(() => store.layerIds.value.length > 0 || multiScreens.value.length > 0 || (!!selected.value && selected.value !== canvasScreen.value?.id))
watch(hasPick, (v) => { if (v && collapsed.value.right) tab.value = 'design' })
const multiList = computed(() => multiScreens.value.map((id) => list.value.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
/** 레이어 목록에서 ⇧ · ⌘ 클릭: 화면 여러 개 고르기(더하기 · 빼기) */
function toggleScreen(id: string) {
  // 레이어를 고른 채면: 레이어는 그대로 두고 화면을 함께(섞어 고르기)
  if (store.layerIds.value.length && selected.value !== id) { mixScreens.value = mixScreens.value.includes(id) ? mixScreens.value.filter((v) => v !== id) : [...mixScreens.value, id]; return }
  const cid = canvasScreen.value?.id
  const cur = multiScreens.value.length ? multiScreens.value : selected.value && selected.value !== cid && !store.layerIds.value.length ? [selected.value] : []
  const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
  if (!next.length) { store.selectScreen(null); multiScreens.value = []; return }
  store.selectScreen(next[0]!)
  multiScreens.value = next.length > 1 ? next : []
}
function onArrangeScreens(op: ArrangeOp) {
  const rows = multiList.value
  if (rows.length < 2) return
  const out = arrangeRects(rows.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })), op)
  const before = rows.map((s) => ({ id: s.id, x: s.x, y: s.y }))
  const after = rows.map((s, i) => ({ id: s.id, x: out[i]!.x, y: out[i]!.y })).filter((p, i) => p.x !== before[i]!.x || p.y !== before[i]!.y)
  if (!after.length) return
  const fail = () => sayFail(tr('Couldn\'t save the position. Try again'))
  const apply = (ps: { id: string; x: number; y: number }[]) => Promise.all(ps.map((p) => updateScreen(p.id, { x: p.x, y: p.y }))).catch(fail)
  const back = before.filter((b) => after.some((a) => a.id === b.id))
  apply(after)
  store.pushAction(null, () => apply(back), () => apply(after))
}
async function onCreate(rect: { x: number; y: number; width: number; height: number }) {
  try {
    // 이름은 캔버스 레이어 · 화면을 통틀어 'Frame' 가장 큰 번호 + 1(store.nextLabel)
    const row = await addScreen(rect, store.nextLabel('Frame'))
    if (row) {
      store.selectScreen(row.id); tab.value = 'design'
      let cur = row.id
      store.pushAction(null, async () => { await removeScreen(cur); store.selectScreen(null) }, async () => { const r = await addScreen(rect, row.name); if (r) cur = r.id })
    }
  } catch { sayFail(tr('Couldn\'t create the frame. Try again')) }
}
/** 값이 서로 다른(Mixed) 프레임들의 칸에서 ↑ ↓: 각자 값에 더해요(실행취소 한 번) */
function onStepMany(key: 'x' | 'y' | 'width' | 'height', d: number) {
  const min = key === 'width' || key === 'height' ? 1 : -1e9
  store.batch(() => { for (const s of multiList.value) onUpdate({ [key]: Math.max(min, s[key] + d) }, s) })
}
/** 프레임 여러 개를 한꺼번에(실행취소 한 번) */
function onUpdateMany(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>) {
  const rows = multiList.value
  store.batch(() => { for (const s of rows) onUpdate(patch, s) })
}
/** 프레임 값 칸을 끄는 동안(scrub): 화면에는 바로 보이고, 손을 뗄 때 한 번 저장 · 실행취소 한 번(레이어 칸과 같아요) */
let scrubbing = false
const frameScrub = new Map<string, Record<string, unknown>>()
function onUpdate(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>, target?: ScreenRow) {
  const s = target ?? current.value
  if (!s) return
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof typeof patch]])) as typeof patch
  const fail = () => sayFail(tr('Couldn\'t save. Try again'))
  // 크기가 바뀌면 맨 위 레이어들이 제약대로 따라와요(실행취소는 레이어 기록이 따로)
  if (s.source === 'native' && ((patch.width ?? s.width) !== s.width || (patch.height ?? s.height) !== s.height)) store.constrainRoot(s.id, s.width, s.height, patch.width ?? s.width, patch.height ?? s.height)
  if (scrubbing) {
    const b = frameScrub.get(s.id) ?? {}
    for (const [k, v] of Object.entries(before)) if (!(k in b)) b[k] = v
    frameScrub.set(s.id, b)
    Object.assign(s, patch)
    return
  }
  updateScreen(s.id, patch).catch(fail)
  store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, patch).catch(fail))
}
/** 스케일(K) Scale 칸에서 화면(프레임) 키우기 · 줄이기: 안의 내용(레이어 기록) + 화면 크기 · 자리(화면 기록) */
function onScaleScreen(k: number, anchor: [number, number]) {
  const s = current.value
  if (!s || s.source !== 'native') return
  const w = Math.max(1, Math.round(s.width * k)), h = Math.max(1, Math.round(s.height * k))
  const before = { x: s.x, y: s.y, width: s.width, height: s.height }
  const after = { x: Math.round(s.x + (s.width - w) * anchor[0]), y: Math.round(s.y + (s.height - h) * anchor[1]), width: w, height: h }
  const fail = () => sayFail(tr('Couldn\'t save. Try again'))
  store.scaleScreenContent(s.id, w / s.width)
  updateScreen(s.id, after).catch(fail)
  store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, after).catch(fail))
}
/** 캔버스 이름표에서 바로 고친 화면 이름 (실행 취소 가능) */
function onRenameScreen(id: string, name: string) {
  const s = canvasList.value.find((v) => v.id === id)
  if (!s) return
  const before = s.name
  const fail = () => sayFail(tr('Couldn\'t rename the frame. Try again'))
  updateScreen(id, { name }).catch(fail)
  store.pushAction(id, () => updateScreen(id, { name: before }).catch(fail), () => updateScreen(id, { name }).catch(fail))
}
async function onRemove() {
  if (!current.value) return
  const name = current.value.name
  try { await removeScreen(current.value.id); store.selectScreen(null); say(tr('Deleted {name}', { name })) } catch { sayFail(tr('Couldn\'t delete the frame')) }
}
const nextX = computed(() => (list.value.length ? Math.max(...list.value.map((s) => s.x + s.width)) + 80 : 0))

// ---------------------------------------------------------------------------
// 화면 단위 단축키 (레이어 없이 화면만 골랐을 때): Delete · ⌘D · ⌘C/⌘V · 화살표
// ---------------------------------------------------------------------------
const screenClip = ref<string[]>([])
/** 화면 스마트 복제 기억(⌘D · ⌥ 끌기 복제): 원본 → 복제본 */
const screenDup = ref<{ src: string; copy: string } | null>(null)
const mixScreens = useMixScreens()
/** 화면 복제: 레이어까지 그대로, 오른쪽(또는 지정한 자리)에 */
async function cloneScreen(srcId: string, at?: { x: number; y: number }, select = true) {
  const src = list.value.find((v) => v.id === srcId)
  if (!src) return null
  if (src.source !== 'native') { say(tr('Figma frames can\'t be duplicated. Import it again from Figma')); return null }
  const rect = { x: at?.x ?? src.x + src.width + 40, y: at?.y ?? src.y, width: src.width, height: src.height }
  // 이름: 기본 이름('Frame 3')이면 다음 번호, 바꾼 이름은 그대로(피그마와 같아요)
  const row = await addScreen(rect, /^Frame \d+$/.test(src.name) ? store.nextLabel('Frame') : src.name)
  if (!row) return null
  const layers = JSON.parse(JSON.stringify(store.doc(src.id)))
  await updateScreen(row.id, { layers })
  delete store.docs[row.id] // 새 레이어로 다시 읽기
  if (select) store.selectScreen(row.id)
  let cur = row.id
  store.pushAction(null, async () => { await removeScreen(cur); store.selectScreen(src.id) }, async () => { const r = await addScreen(rect, row.name); if (r) { cur = r.id; await updateScreen(r.id, { layers }); delete store.docs[r.id] } })
  return row
}
/** 피그마처럼 원래 화면 바로 오른쪽(40px 띄워서). 그 자리에 다른 화면이 있으면 맨 오른쪽 끝 */
function spotRightOf(id: string): { x: number; y: number } {
  const src = list.value.find((v) => v.id === id)
  if (!src) return { x: nextX.value, y: 0 }
  const r = { x: src.x + src.width + 40, y: src.y, w: src.width, h: src.height }
  const hit = list.value.some((v) => v.x < r.x + r.w && v.x + v.width > r.x && v.y < r.y + r.h && v.y + v.height > r.y)
  return hit ? { x: nextX.value, y: src.y } : { x: r.x, y: r.y }
}
/**
 * 여러 화면 복제(⌥ 끌기 · 붙여넣기): 한 번에 만들고 새 화면들을 골라 둬요.
 * withLayers: 레이어와 섞어 고른 경우 — 레이어 선택은 그대로 두고 새 화면들을 함께 골라요
 */
async function cloneMany(items: { id: string; x: number; y: number }[], withLayers: boolean) {
  const rows = (await Promise.all(items.map((it) => cloneScreen(it.id, { x: it.x, y: it.y }, false)))).filter((r): r is NonNullable<typeof r> => !!r)
  const ids = rows.map((r) => r.id)
  if (!ids.length) return
  if (withLayers) { mixScreens.value = ids; return }
  store.selectScreen(ids[0]!)
  multiScreens.value = ids.length > 1 ? ids : []
}
/** 복사한 화면들 붙여넣기(피그마처럼): 배치는 그대로, 원래 자리 바로 오른쪽 — 비어 있지 않으면 맨 오른쪽 끝 */
async function pasteScreens(withLayers: boolean) {
  const src = screenClip.value.map((id) => list.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v)
  if (!src.length) return
  const minX = Math.min(...src.map((v) => v.x)), maxX = Math.max(...src.map((v) => v.x + v.width))
  let dx = maxX + 40 - minX
  const hit = src.some((v) => list.value.some((o) => o.x < v.x + dx + v.width && o.x + o.width > v.x + dx && o.y < v.y + v.height && o.y + o.height > v.y))
  if (hit) dx = nextX.value - minX
  await cloneMany(src.map((v) => ({ id: v.id, x: v.x + dx, y: v.y })), withLayers)
}
async function onScreenAction(action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward' | 'section', dx = 0, dy = 0) {
  const s = current.value
  // 고른 화면 전부: 여러 화면을 골랐으면 그 화면들, 레이어와 섞어 골랐으면 함께 고른 화면들, 아니면 지금 화면
  const pickIds = multiScreens.value.length > 1 ? multiScreens.value : store.layerIds.value.length ? mixScreens.value : s ? [s.id] : []
  const targets = pickIds.map((id) => list.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v && !isPageCanvas(v.id))
  if (action === 'section') { canvas.value?.sectionScreens(); return }
  try {
    if (targets.length && (action === 'front' || action === 'back' || action === 'forward' || action === 'backward')) {
      // 여러 화면을 고르면 함께, 서로의 순서는 그대로(피그마와 같아요)
      const before = list.value.map((v) => v.id)
      await reorderScreen(targets.map((v) => v.id), action)
      const after = list.value.map((v) => v.id)
      if (before.join() !== after.join()) store.pushAction(targets[0]!.id, () => setScreenOrder(before), () => setScreenOrder(after))
      return
    }
    if (action === 'copy' && s) { screenClip.value = [s.id]; say(tr('Copied {name}', { name: s.name })); return }
    if (action === 'paste') { await pasteScreens(false); return }
    if (!s) return
    if (action === 'duplicate') {
      // 스마트 복제: 방금 복제한 화면을 옮긴 뒤 다시 ⌘D 면 같은 간격으로
      const m = screenDup.value
      const src = m && m.copy === s.id ? list.value.find((v) => v.id === m.src) : undefined
      const at = src && (s.x !== src.x || s.y !== src.y) ? { x: s.x + (s.x - src.x), y: s.y + (s.y - src.y) } : undefined
      const row = await cloneScreen(s.id, at)
      if (row) screenDup.value = { src: s.id, copy: row.id }
      return
    }
    if (action === 'nudge') {
      const from = { x: s.x, y: s.y }, to = { x: s.x + dx, y: s.y + dy }
      await updateScreen(s.id, to)
      store.pushAction(s.id, () => updateScreen(s.id, from), () => updateScreen(s.id, to))
      return
    }
    if (action === 'remove') {
      // 고른 화면 전부 지우기. 피그마 화면은 남기고 알려요. 요구사항이 연결된 화면이 있으면 확인 창으로 물은 뒤 연결도 함께 끊고 지워요
      const linkedIds = new Set((links.data.value ?? []).map((l) => l.screen_id))
      const ok = targets.filter((v) => v.source === 'native')
      const kept = targets.length - ok.length
      if (!ok.length) { tab.value = 'design'; say(tr('Figma frames can be deleted from the Design tab')); return }
      const nLinks = (links.data.value ?? []).filter((l) => ok.some((v) => v.id === l.screen_id)).length
      if (ok.some((v) => linkedIds.has(v.id))) { confirmFrames.value = { frames: ok, links: nLinks, kept }; return }
      await removeFrames(ok, kept)
    }
  } catch { sayFail(tr('Something went wrong. Try again')) }
}
/** 프레임 지우기(⌘Z 로 같은 자리 · 같은 순서로 되살려요). 연결된 요구사항은 함께 끊고, 되살릴 때 연결도 다시 이어요 */
async function removeFrames(ok: ScreenRow[], kept: number) {
  const okIds = new Set(ok.map((v) => v.id))
  const linkSnap = (links.data.value ?? []).filter((l) => okIds.has(l.screen_id)).map((l) => ({ ...l }))
  if (linkSnap.length) await Promise.all(linkSnap.map((l) => removeLink(l.screen_id, l.requirement_id)))
  const order = list.value.map((v) => v.id)
  const snaps = ok.map((v) => ({ id: v.id, rect: { x: v.x, y: v.y, width: v.width, height: v.height }, name: v.name, status: v.status, layers: JSON.parse(JSON.stringify(store.doc(v.id))) }))
  let cur = snaps.map((v) => v.id)
  await Promise.all(cur.map((id) => removeScreen(id)))
  store.selectScreen(null)
  multiScreens.value = []
  say(ok.length === 1 ? tr('Deleted {name} · ⌘Z to undo', { name: ok[0]!.name }) : tr('Deleted {n} frames · ⌘Z to undo', { n: ok.length }))
  if (linkSnap.length) await links.refresh()
  if (kept) setTimeout(() => say(tr('Figma frames were kept')), 1600)
  store.pushAction(null, async () => {
    // 되살리기: 같은 자리 · 같은 앞뒤 순서로
    const made = await Promise.all(snaps.map(async (sn) => {
      const r = await addScreen(sn.rect, sn.name)
      if (r) { await updateScreen(r.id, { layers: sn.layers, status: sn.status }); delete store.docs[r.id] }
      return r?.id ?? null
    }))
    const swap = new Map(snaps.map((sn, k) => [sn.id, made[k]]))
    // 연결도 새 화면으로 다시 이어요
    await Promise.all(linkSnap.filter((l) => swap.get(l.screen_id)).map((l) => setLink({ ...l, screen_id: swap.get(l.screen_id)! })))
    if (linkSnap.length) await links.refresh()
    cur = made.filter((v): v is string => !!v)
    await setScreenOrder(order.map((id) => swap.get(id) ?? id).filter((v): v is string => !!v))
    if (cur.length) { store.selectScreen(cur[0]!); multiScreens.value = cur.length > 1 ? cur : [] }
  }, async () => {
    // 다시 하기: 연결도 다시 끊고 지워요
    const again = (links.data.value ?? []).filter((l) => cur.includes(l.screen_id))
    if (again.length) await Promise.all(again.map((l) => removeLink(l.screen_id, l.requirement_id)))
    await Promise.all(cur.map((id) => removeScreen(id))); store.selectScreen(null); multiScreens.value = []
    if (again.length) await links.refresh()
  })
}
/** 확인 창에서 '지우기' */
async function doConfirmFrames() {
  const c = confirmFrames.value
  confirmFrames.value = null
  if (!c) return
  try { await removeFrames(c.frames, c.kept) } catch { sayFail(tr('Couldn\'t delete the frame')) }
}
/** 레이어 목록에서 화면을 끌어 순서를 바꿨을 때(그리는 순서 그대로) — 실행취소 한 번 */
async function onScreenOrder(order: string[]) {
  const before = list.value.map((v) => v.id)
  try {
    await setScreenOrder(order)
    const after = list.value.map((v) => v.id)
    if (before.join() !== after.join()) store.pushAction(null, () => setScreenOrder(before), () => setScreenOrder(after))
  } catch { sayFail(tr('Something went wrong. Try again')) }
}
async function onFigmaCreated() {
  await screens.refresh()
  say(tr('Imported from Figma'))
}

/** 다른 페이지의 화면이면 그 페이지로 옮긴 뒤 고르기 */
async function pickScreen(id: string, focus = false) {
  const s = allScreens.data.value?.find((v) => v.id === id)
  if (s && s.page_id !== pageId.value) {
    focus = true
    pageId.value = s.page_id
    await until(() => screens.status.value === 'success' && list.value.some((v) => v.id === id))
  }
  store.selectScreen(id)
  if (focus) setTimeout(() => canvas.value?.fit([id]), 60)
}
function until(ok: () => boolean, ms = 3000) {
  return new Promise<void>((resolve) => {
    const t0 = Date.now()
    const tick = () => (ok() || Date.now() - t0 > ms ? resolve() : setTimeout(tick, 50))
    tick()
  })
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------
// 문서 묶음 이름: DOC_CATEGORY_LABEL(영어 원문)을 보여 줄 때 tr 로 감싸요
const docGroups = computed(() => {
  const order: DocCategory[] = ['planning', 'design', 'dev', 'etc']
  return order
    .map((k) => ({ k, label: tr(DOC_CATEGORY_LABEL[k]), items: (docs.data.value ?? []).filter((d) => d.category === k) }))
    .filter((g) => g.items.length)
})
const reqCount = (id: string) => (reqs.data.value ?? []).filter((r) => r.document_id === id).length
function showDoc(id: string, reqId?: string | null) {
  // 문서는 왼쪽 Docs 탭(목록 자리)에서 읽어요 — 오른쪽 패널은 그대로(사용자 요청 2026-11-26)
  left.value = 'docs'
  docId.value = id
  docReq.value = reqId ?? null
}
function closeDoc() { docId.value = null; docReq.value = null }
/**
 * 문서에서 REQ 에 마우스를 올리면: 연결된 화면마다 그 REQ 를 그린 항목(못 찾으면 화면)을 캔버스에 청록 선으로 미리 보여 줘요(누르지 않아도)
 */
const hoverReq = ref<string | null>(null)
watch(docId, () => (hoverReq.value = null))
const peek = computed(() => {
  // 문서를 열어 두면 고른(포커스된) REQ 도 늘 청록 선으로 — 마우스를 올린 REQ 가 있으면 그것(사용자 요청 2026-11-26)
  const id0 = hoverReq.value ?? (docShown.value ? docReq.value : null)
  const id = id0 && !reqGone(id0) ? id0 : null
  const r = id ? (reqs.data.value ?? []).find((x) => x.id === id) : null
  if (!id || !r) return null
  const sids = (links.data.value ?? []).filter((l) => l.requirement_id === id).map((l) => l.screen_id).filter((sid) => list.value.some((s) => s.id === sid))
  return { label: r.code, items: sids.map((sid) => ({ sid, ids: matchReqLayers(store.doc(sid), id, [r.title, r.body ?? ''].join(' ')) })) }
})
// 마우스를 올린 REQ 항목이 멀리 있으면(가운데 영역 밖) 잠깐 머문 뒤 스르륵 그쪽으로 — 훑고 지나갈 때는 움직이지 않게 180ms 기다려요
let peekTimer = 0
watch(peek, (p) => {
  clearTimeout(peekTimer)
  const it = p?.items[0]
  if (!it) return
  peekTimer = window.setTimeout(() => canvas.value?.reveal(it.sid, it.ids), 180)
})
/** 문서에서 REQ 를 누르면: 그 REQ 로 포커스(다시 누르면 풀기) + 캔버스도 그 REQ 를 그린 레이어(컴포넌트 · 항목)로 */
// 빈 캔버스를 눌러 선택이 모두 풀리면 문서에서 고른 요구사항(카드 강조)도 함께 풀어요(사용자 요청 2026-11-26)
watch(() => [store.screenId.value, store.layerIds.value.length, multiScreens.value.length] as const, ([sid, n, m]) => { if (!sid && !n && !m && docReq.value) docReq.value = null })
/**
 * 문서를 연 채 캔버스에서 요소 · 프레임을 고르면 오른쪽 문서에서 연결된 REQ 카드로 포커스(화면은 움직이지 않아요) — 사용자 요청 2026-11-26.
 * 요소: 그 요소(또는 그 안 · 바깥 레이어)를 그린 REQ, 프레임: 그 프레임에 연결된 REQ 중 이 문서의 첫 번째
 */
watch(() => [docShown.value, store.screenId.value, store.layerIds.value.join(',')] as const, ([did, sid, ids]) => {
  if (!did || !sid) return
  const d = store.docs[sid]
  const mine = docReqs.value.filter((r) => !reqGone(r.id) && (links.data.value ?? []).some((l) => l.requirement_id === r.id && l.screen_id === sid))
  if (!d || !mine.length) return
  const sel = ids ? ids.split(',') : []
  const sorted = [...mine].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
  let hit: string | undefined
  if (sel.length) {
    const ms = new Map(sorted.map((r) => [r.id, matchReqLayers(d, r.id, [r.title, r.body ?? ''].join(' '))]))
    const near = (a: string, b: string) => a === b || descendants(d, a).includes(b) || descendants(d, b).includes(a)
    const exact = (id: string) => ms.get(id)!.some((m) => sel.includes(m))
    const close = (id: string) => ms.get(id)!.some((m) => sel.some((x) => near(m, x)))
    // 고른 요소를 딱 그린 REQ 가 먼저(지금 것이 딱 맞으면 그대로) → 없으면 안 · 바깥으로 맞는 것(지금 것이 맞으면 그대로)
    const cur = docReq.value && ms.has(docReq.value) ? docReq.value : null
    if (cur && exact(cur)) return
    hit = sorted.find((r) => exact(r.id))?.id
    if (!hit) { if (cur && close(cur)) return; hit = sorted.find((r) => close(r.id))?.id }
  } else {
    if (docReq.value && mine.some((r) => r.id === docReq.value)) return
    hit = sorted[0]?.id
  }
  if (hit && hit !== docReq.value) docReq.value = hit
})
function pickReq(id: string) {
  if (reqGone(id)) { say(tr('Not drawn in any frame')); return }
  docReq.value = docReq.value === id ? null : id
  if (docReq.value) focusReq(docReq.value)
}
/**
 * REQ 가 연결된 화면(지금 고른 화면이 연결돼 있으면 그것, 아니면 첫 번째)에서 그 REQ 를 그린 레이어를 골라 그 자리로 확대해요.
 * 레이어는 직접 연결(레이어 reqs) → 없으면 REQ 문장과 레이어 이름 · 글자로 짐작(app/canvas/reqMatch.ts). 못 찾으면 화면을 골라요
 */
function focusReq(id: string) {
  const r = (reqs.data.value ?? []).find((x) => x.id === id)
  const linked = (links.data.value ?? []).filter((l) => l.requirement_id === id).map((l) => l.screen_id).filter((sid) => list.value.some((s) => s.id === sid))
  if (!r || !linked.length) return
  const sid = selected.value && linked.includes(selected.value) ? selected.value : linked[0]!
  const ids = matchReqLayers(store.doc(sid), id, [r.title, r.body ?? ''].join(' '))
  if (ids.length) ids.forEach((lid, i) => store.selectLayer(sid, lid, i > 0))
  else store.selectScreen(sid)
  // 누르면 그 항목을 화면 가운데로 크게 확대해 보여 줘요(마우스 올림은 미리보기 선만 — 사용자 요청 2026-11-26)
  nextTick(() => canvas.value?.focusOn(sid, ids))
}

async function onCreateReq(p: { text: string; block: string | null }) {
  if (!docId.value) return
  const nums = (reqs.data.value ?? []).map((r) => Number(r.code.match(/(\d+)$/)?.[1] ?? 0))
  const code = 'REQ-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')
  const title = p.text.replace(/\s+/g, ' ').trim().slice(0, 80)
  try {
    const id = await addRequirement(projectId, { document_id: docId.value, code, title, anchor: p.block ? { block: p.block } : null })
    if (current.value) await setLink({ screen_id: current.value.id, requirement_id: id, status: 'missing', note: null })
    // 레이어를 고른 채 만들면 그 레이어가 이 REQ 를 그린 것으로 기억해요(REQ 를 누르면 그 레이어로 포커스)
    if (current.value && store.screenId.value === current.value.id && store.layerIds.value.length) store.update(current.value.id, [...store.layerIds.value], (n) => ({ reqs: [...new Set([...(n.reqs ?? []), id])] }))
    await Promise.all([reqs.refresh(), links.refresh()])
    docReq.value = id
    say(current.value ? tr('Created {code} and linked it to {name}', { code, name: current.value.name }) : tr('Created {code}', { code }))
  } catch { sayFail(tr('Couldn\'t create the requirement. Try again')) }
}
async function onDocCreated(id: string) {
  await Promise.all([docs.refresh(), reqs.refresh()])
  left.value = 'docs'
  showDoc(id)
}

// 주소로 들어온 경우: ?doc=&req= (요구사항 보드의 '원문'), ?screen= (화면 바로 열기), ?asset= (에셋 상세)
onMounted(async () => {
  const q = route.query
  if (typeof q.doc === 'string') { left.value = 'docs'; showDoc(q.doc, typeof q.req === 'string' ? q.req : null) }
  if (typeof q.screen === 'string') { await until(() => !!allScreens.data.value); pickScreen(q.screen, true) }
  // ?asset=<컴포넌트 id>: ⌘K 에서 컴포넌트를 고르면 에셋 탭의 그 컴포넌트 상세로(디자인 시스템 화면 대신)
  if (typeof q.asset === 'string') { left.value = 'assets'; asset.value = q.asset; expandPanels() }
  if (q.doc || q.screen || q.asset) router.replace({ query: {} })
})

// ---------------------------------------------------------------------------
// 그리기 도구: 그린 뒤에는 디자인 탭, 이미지는 파일 고르기
// ---------------------------------------------------------------------------
watch(tool, (t, prev) => {
  if (t === 'move' && prev !== 'move' && prev !== 'hand' && prev !== 'image' && store.layerIds.value.length) tab.value = 'design'
  // 이미지 넣기(⇧⌘K, 피그마와 같아요): 파일을 여러 개 고르고, 캔버스를 누를 때마다 하나씩 놓아요(끌면 그 크기로). Esc · 다른 도구면 그만
  if (t === 'image' && !placing.value.length) pickImage()
  if (t !== 'image') placing.value = []
})
/** ⌘\ 로 UI 를 모두 숨겼는지 */
const uiHidden = ref(false)
/** 놓을 차례를 기다리는 이미지들 */
const placing = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
let replaceId: string | null = null
function pickImage(replace?: string) {
  const s = current.value
  if (s && s.source !== 'native') return say(tr('Images can\'t be added to Figma frames'))
  replaceId = typeof replace === 'string' ? replace : null
  fileInput.value?.click()
}
async function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) { if (tool.value === 'image') tool.value = 'move'; return }
  // 칠 바꾸기(Replace)는 바로, 새로 넣기는 캔버스를 눌러 놓기
  if (replaceId) { await insertImage(files[0]!); return }
  placing.value = files
  tool.value = 'image'
  say(files.length > 1 ? tr('Click to place {n} images', { n: files.length }) : tr('Click to place the image'))
}
/** 캔버스를 눌러 이미지 놓기: 누른 점이 가운데, 끌었으면 그 너비로(비율 그대로) */
async function onPlaceImage(at: { x: number; y: number }, width: number | null, place?: { sid: string; parentId: string | null }) {
  const f = placing.value.shift()
  if (!placing.value.length) tool.value = 'move'
  if (f) await insertImage(f, at, place, width)
}
/**
 * 이미지 넣기(도구 · 끌어 놓기 · 붙여넣기 공용). at 이 있으면 그 캔버스 좌표에, 없으면 고른 화면 가운데(없으면 보이는 캔버스 가운데)에.
 * at 이 Iris 화면 위면 그 화면 안으로, 아니면 캔버스 위로 들어가요.
 */
async function insertImage(file: File, at?: { x: number; y: number }, place?: { sid: string; parentId: string | null }, width?: number | null) {
  if (!isMediaFile(file)) return say(tr('Only image or video files can be added'))
  const tooLarge = () => say(isVideoFile(file) ? tr('Videos must be smaller than 50MB') : tr('Images must be smaller than 10MB'))
  // 영상은 바로 잽니다. 이미지는 4096px 로 줄인 뒤의 크기로 uploadImage 가 잽니다
  if (isVideoFile(file) && file.size > mediaLimit(file)) return tooLarge()
  const hitScreen = at ? list.value.find((v) => v.source === 'native' && at.x >= v.x && at.y >= v.y && at.x <= v.x + v.width && at.y <= v.y + v.height) : null
  const s = (place ? list.value.find((v) => v.id === place.sid) : null) ?? (at ? hitScreen : current.value) ?? canvasScreen.value
  if (!s) return
  const failMsg = () => say(isVideoFile(file) ? tr('Couldn\'t upload the video. Try again') : tr('Couldn\'t upload the image. Try again'))
  try {
    // 크기 재기 · 4096 줄이기만 기다리고 바로 캔버스에 넣어요. 올리기는 뒤에서(img.done) — 피그마처럼 놓자마자 보여요
    const img = await prepareImage(file, s.id.replace(':', '-'), { supabase, preview })
    if (replaceId && !at) {
      const target = store.screenId.value ?? s.id; const id = replaceId; replaceId = null
      // 사각형 + 이미지 칠: 맨 위 이미지 칠의 그림만 바꿔요(맞춤 · 자르기는 그대로). 동영상 레이어는 src
      const n = store.node(target, id)
      const top = n && !img.video ? topImagePaint(n.style) : null
      const before = n?.src
      if (n && top) store.update(target, [id], (nn) => ({ style: { ...nn.style, fills: (nn.style.fills ?? []).map((p, k) => (k === top.i ? { ...top.p, src: img.src, iw: img.w, ih: img.h } : p)) } }))
      else store.update(target, [id], { src: img.src })
      // 올리기에 실패하면 원래 그림으로 되돌려요(그새 다른 그림으로 바꿨으면 그대로)
      img.done.catch(() => {
        const nn = store.node(target, id)
        if (!nn) return failMsg()
        if (top) { const was = top.p.src; store.update(target, [id], (x) => ({ style: { ...x.style, fills: (x.style.fills ?? []).map((p) => (p.type === 'image' && p.src === img.src ? { ...p, src: was } : p)) } })) }
        else if (nn.src === img.src) store.update(target, [id], { src: before })
        failMsg()
      })
      return
    }
    const onCanvas = isPageCanvas(s.id)
    // 원래 픽셀 크기 그대로(피그마와 같아요). 프레임보다 크면 프레임이 잘라 보여요
    const parentId = place?.sid === s.id ? place.parentId : null
    // 끌어서 놓았으면 그 너비로(비율 그대로)
    const k = width && img.w ? width / img.w : 1
    const w = Math.max(1, Math.round(img.w * k)), h = Math.max(1, Math.round(img.h * k))
    let cx: number, cy: number
    if (at) { cx = Math.round(at.x - (onCanvas ? 0 : s.x)); cy = Math.round(at.y - (onCanvas ? 0 : s.y)) }
    else if (onCanvas) { cx = Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom); cy = Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) }
    else { cx = Math.round(s.width / 2); cy = Math.round(s.height / 2) }
    const p0 = parentId ? store.absPos(s.id, parentId) : { x: 0, y: 0 }
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || (img.video ? 'Video' : 'Image')
    const box = { name, x: cx - p0.x - Math.round(w / 2), y: cy - p0.y - Math.round(h / 2), w, h, lockRatio: true }
    // 이미지는 사각형 + 이미지 칠(피그마와 같아요 — Fill 패널에서 이미지 · 맞춤을 고쳐요). 동영상은 영상 레이어
    const id = img.video
      ? store.add(s.id, parentId, { type: 'image', src: img.src, ...box })
      : store.add(s.id, parentId, { type: 'rect', ...box, style: { fill: undefined, fills: [{ type: 'image', src: img.src, iw: img.w, ih: img.h }] } })
    tab.value = 'design'
    // 올리기에 실패하면 방금 넣은 레이어를 빼고 알려요(그새 지웠으면 안내만)
    img.done.catch(() => {
      if (store.node(s.id, id)) store.remove(s.id, [id])
      failMsg()
    })
  } catch (e) {
    if (e instanceof MediaTooLargeError) return tooLarge()
    failMsg()
  }
}
/** 캔버스에 파일 끌어 놓기: 이미지 · 영상. 놓은 화면 · 프레임 안으로 */
async function onDropFiles(files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }) {
  const media = files.filter(isMediaFile)
  if (!media.length) return say(tr('Only image or video files (PNG, JPG, SVG, MP4…) can be added'))
  for (const [i, f] of media.entries()) {
    const p = { x: at.x + i * 24, y: at.y + i * 24 }
    // SVG 파일은 고칠 수 있는 벡터로(SVG 코드 붙여넣기와 같아요 — 피그마와 같아요). 읽지 못하면 이미지로
    if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) { const text = await f.text().catch(() => ''); if (text && importSvgVectors(text, p, place?.sid)) continue }
    await insertImage(f, p, place)
  }
}
/** 붙여넣기: 이미지 파일 · SVG 코드(피그마 'Copy as SVG' 등) */
function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
  const cd = e.clipboardData
  if (!cd) return
  const files = [...cd.files].filter((f) => f.type.startsWith('image/'))
  const text = cd.getData('text/plain').trim()
  const center = { x: Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom), y: Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) }
  if (files.length) { e.preventDefault(); onDropFiles(files, current.value ? { x: current.value.x + current.value.width / 2, y: current.value.y + current.value.height / 2 } : center); return }
  if (/^<svg[\s>]/i.test(text) || (/^<\?xml/i.test(text) && text.includes('<svg'))) {
    e.preventDefault()
    // 피그마처럼 벡터 레이어들로(안쪽 도형까지 고칠 수 있게). 읽지 못하면 이미지로
    if (!importSvgVectors(text, current.value ? undefined : center)) insertImage(new File([text], 'svg.svg', { type: 'image/svg+xml' }), current.value ? undefined : center)
    return
  }
  // 그 밖에는 Iris 안에서 복사한 것(레이어 · 화면) — ⌘V 키는 캔버스가 막지 않고 이 이벤트로 와요
  e.preventDefault()
  canvas.value?.paste()
}
/** SVG 코드 → 'svg' 프레임 안 벡터 레이어들. 고른 Iris 화면(없으면 캔버스) 가운데에. 실패하면 false */
function importSvgVectors(text: string, at?: { x: number; y: number }, intoSid?: string): boolean {
  const r = importSvg(text)
  if (!r) return false
  const into = intoSid ? canvasList.value.find((v) => v.id === intoSid && v.source === 'native') : undefined
  const s = into ?? (at ? null : current.value?.source === 'native' ? current.value : null) ?? canvasScreen.value
  if (!s) return false
  const onCanvas = isPageCanvas(s.id)
  const k = 1 // SVG 도 원래 크기 그대로
  const w = r.w * k, h = r.h * k
  const c = at ? (onCanvas ? at : { x: at.x - s.x, y: at.y - s.y }) : (onCanvas ? { x: Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom), y: Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) } : { x: s.width / 2, y: s.height / 2 })
  const r2 = (v: number) => Math.round(v * 100) / 100
  store.insertTree(s.id, null, { type: 'frame', name: 'svg', x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w: r2(w), h: r2(h), style: { fill: undefined, clip: false } },
    r.layers.map((l) => ({ type: 'vector' as const, name: l.name, x: r2(l.x * k), y: r2(l.y * k), w: r2(l.w * k), h: r2(l.h * k), vnet: l.vnet, evenodd: l.evenodd || undefined, style: { fill: l.fill, stroke: l.stroke, strokeWidth: l.strokeWidth ? r2(l.strokeWidth * k) : undefined, opacity: l.opacity } })))
  tab.value = 'design'
  return true
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
// 저장이 끝나기 전에 떠나면 알리기
// 저장 중 · 저장 실패 · 이미지를 뒤에서 올리는 중이면 닫기 전에 물어요(다 올라가기 전에 닫으면 그 이미지가 비어요)
function onBeforeUnload(e: BeforeUnloadEvent) { if (store.saveState.state === 'saving' || store.saveState.state === 'error' || pendingUploads.value > 0) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => { window.removeEventListener('beforeunload', onBeforeUnload); store.dispose() })

// ---------------------------------------------------------------------------
// 연결 · 저장 위험 알림(PRD/10_ERROR_STATES.md) — 피그마처럼: 오프라인 표시 · 저장 실패 알림 · 다시 연결되면 저장 · 복구 · 로그인 만료
// ---------------------------------------------------------------------------
const online = ref(true)
/** 저장 실패 원인: offline(인터넷 끊김) · auth(로그인 끝남) · server(그 밖의 서버 오류) */
const saveErr = computed<'offline' | 'auth' | 'server' | null>(() => {
  if (store.saveState.state !== 'error') return null
  if (!online.value) return 'offline'
  const e = store.saveState.error as { message?: string; code?: string; status?: number } | undefined
  const msg = String(e?.message ?? e ?? '')
  if (e?.status === 401 || e?.code === 'PGRST301' || /jwt|not authenticated|unauthori/i.test(msg)) return 'auth'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'offline'
  return 'server'
})
/** 아래 알림 막대를 닫으면 상태가 바뀔 때까지 숨겨요 */
const bannerClosed = ref<string | null>(null)
const banner = computed<'offline' | 'server' | null>(() => {
  const k = !online.value ? (store.hasUnsaved() || saveErr.value ? 'offline' : null) : saveErr.value === 'offline' ? 'offline' : saveErr.value === 'server' ? 'server' : null
  return k && bannerClosed.value !== k ? k : null
})
watch(() => online.value + '|' + saveErr.value, () => { bannerClosed.value = null })
let wentOffline = false
function onOnline() {
  online.value = true
  if (!wentOffline) return
  wentOffline = false
  if (!store.hasUnsaved()) return say(tr('Back online'))
  store.flushAll().then(() => { if (store.saveState.state === 'saved') say(tr('Back online. Your changes are saved')) })
}
function onOffline() { online.value = false; wentOffline = true }
onMounted(() => {
  online.value = navigator.onLine
  wentOffline = !navigator.onLine
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})
onBeforeUnmount(() => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) })

// 로그인이 끝났을 때(다른 곳에서 로그아웃 · 갱신 실패): 창으로 알리고 다시 로그인하면 이 화면으로 돌아와요(보관한 변경은 그때 복구)
const authLost = ref(false)
if (import.meta.client && !preview) {
  const { data: authSub } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') authLost.value = true })
  onBeforeUnmount(() => authSub.subscription.unsubscribe())
}
watch(saveErr, (k) => { if (k === 'auth') authLost.value = true })
function signInAgain() { navigateTo(`/login?signedout=1&next=${encodeURIComponent(route.fullPath)}`) }

// 지난번에 저장하지 못하고 보관해 둔 변경: 열 때 복구할지 물어봐요
const recover = ref<{ n: number; at: number } | null>(null)
onMounted(() => {
  const all = backup.read(), ids = Object.keys(all)
  if (ids.length && !store.hasUnsaved()) recover.value = { n: ids.length, at: Math.max(...ids.map((i) => all[i]!.at)) }
})
const agoText = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000)
  return m < 1 ? tr('just now') : m < 60 ? tr('{n} min ago', { n: m }) : m < 60 * 24 ? tr('{n} hr ago', { n: Math.round(m / 60) }) : tr('{n} days ago', { n: Math.round(m / 1440) })
}
async function doRecover() {
  const all = backup.read()
  recover.value = null
  let bad = 0
  const here = new Set(canvasList.value.map((x) => x.id))
  for (const [sid, e] of Object.entries(all)) {
    if (here.has(sid)) { store.recoverDoc(sid, e.doc); continue }
    // 다른 페이지의 화면: 바로 저장
    try { await updateScreen(sid, { layers: e.doc as ScreenRow['layers'] }); backup.drop(sid) } catch { bad++ }
  }
  if (bad) sayFail(tr('Couldn\'t restore some changes. Try again'))
  else say(tr('Restored your unsaved changes'))
}
function discardRecover() { backup.clear(); recover.value = null; say(tr('Discarded the unsaved changes')) }

// 불러오기 실패: 프로젝트가 없거나(지워짐 · 권한 없음) 연결 문제
const loadErr = computed(() => project.error.value ?? pages.error.value ?? screens.error.value ?? null)
const notFound = computed(() => (project.error.value as { code?: string } | null)?.code === 'PGRST116')
const retrying = ref(false)
async function retryLoad() {
  retrying.value = true
  try { await Promise.all([project.refresh(), pages.refresh(), screens.refresh()]) } finally { retrying.value = false }
}
// 다른 화면으로 옮길 때 아직 저장 중이면 잠깐(최대 2.5초) 기다려 마저 저장해요. 그래도 못 하면 보관해 둔 내용으로 다음에 복구.
// 보관도 못 한 경우(저장 공간 가득)만 묻고 나가요
onBeforeRouteLeave(async () => {
  if (!store.hasUnsaved()) return true
  await Promise.race([store.flushAll(), new Promise((r) => setTimeout(r, 2500))])
  if (!store.hasUnsaved() || !backupFailed) return true
  return window.confirm(tr('Some changes aren\'t saved and couldn\'t be kept in this browser. Leave anyway? They\'ll be lost'))
})

/** 화면 단축키(피그마와 같아요): ⌘\\ UI 숨기기 · ⌥1 레이어 · ⌥2 에셋 · ⌥8 디자인 탭 · PageUp · PageDown 이전 · 다음 페이지 */
function onUiKey(k: 'toggle-ui' | 'left-file' | 'left-assets' | 'design' | 'prev-page' | 'next-page') {
  // ⌘\ UI 숨기기(피그마와 같아요): 양쪽 패널 · 도구 막대를 모두 숨기고 캔버스만 — 다시 누르면 돌아와요
  if (k === 'toggle-ui') { uiHidden.value = !uiHidden.value; return }
  if (k === 'left-file' || k === 'left-assets') { left.value = k === 'left-file' ? 'file' : 'assets'; expandPanels(); return }
  if (k === 'design') { tab.value = 'design'; expandPanels(); return }
  const ps = pages.data.value ?? []
  const i = ps.findIndex((p) => p.id === pageId.value)
  const next = ps[i + (k === 'prev-page' ? -1 : 1)]
  if (next) pageId.value = next.id
}
// 툴바 버튼
function onRail(k: 'assets' | 'link' | 'figma' | 'comment') {
  if (k === 'assets') { left.value = 'assets'; asset.value = null }
  else if (k === 'figma') figmaOpen.value = true
  else if (k === 'link') {
    if (!current.value) return say(tr('Select a frame on the canvas first'))
    closeDoc(); tab.value = 'plan'; nextTick(() => plan.value?.openPicker())
  } else say(tr('Comments are coming soon'))
}

async function share() {
  try { await navigator.clipboard.writeText(location.origin + route.path); say(tr('Link copied')) }
  catch { sayFail(tr('Couldn\'t copy the link')) }
}

const zoomOpen = ref(false)
const projMenu = ref(false)
const settingsOpen = ref(false)
/** 단축키 모음 창(메인 메뉴 · ⌃⇧? — 피그마와 같아요) */
const shortcutsOpen = ref(false)
function onShortcutsKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'Slash') { e.preventDefault(); e.stopPropagation(); shortcutsOpen.value = !shortcutsOpen.value }
}
onMounted(() => window.addEventListener('keydown', onShortcutsKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcutsKey, true))
const ZOOMS = [0.25, 0.5, 1, 2]
const { data: me } = useMe()
const myName = computed(() => me.value?.name || me.value?.email || tr('Me'))

// 메뉴: 바깥을 누르거나 Esc 로 닫기
function onDocPointer(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (projMenu.value && !t?.closest('.home-wrap')) projMenu.value = false
  if (zoomOpen.value && !t?.closest('.zoom-wrap')) zoomOpen.value = false
  if (viewOpen.value && !t?.closest('.view-wrap')) viewOpen.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (confirmPage.value) { confirmPage.value = null; return }
  if (!(projMenu.value || zoomOpen.value || viewOpen.value)) return
  projMenu.value = false
  zoomOpen.value = false
  viewOpen.value = false
}
// 페이지 지우기 확인: 열리면 Cancel 에 포커스(실수로 Enter 를 눌러도 지워지지 않게)
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })
// 숫자 칸 계산식(784-6 → 778)
useMathInputs()
// 수치 칸 앞쪽을 좌우로 끌어 값 바꾸기: 끄는 동안은 기록 하나로 묶어요
let scrubSids: string[] = []
useScrub(
  () => { scrubbing = true; frameScrub.clear(); scrubSids = [...new Set([current.value?.id, canvasScreen.value?.id, ...multiList.value.map((v) => v.id)].filter((v): v is string => !!v))]; scrubSids.forEach((s) => store.hold(s)) },
  () => {
    scrubbing = false
    const fail = () => sayFail(tr('Couldn\'t save. Try again'))
    // 레이어 기록 + 프레임 값 기록을 실행취소 한 번으로
    store.batch(() => {
      scrubSids.forEach((s) => store.release(s))
      for (const [id, before] of frameScrub) {
        const s = canvasList.value.find((v) => v.id === id)
        if (!s) continue
        const after = Object.fromEntries(Object.keys(before).map((k) => [k, s[k as keyof ScreenRow]])) as Partial<ScreenRow>
        updateScreen(id, after).catch(fail)
        store.pushAction(id, () => updateScreen(id, before as Partial<ScreenRow>).catch(fail), () => updateScreen(id, after).catch(fail))
      }
    })
    frameScrub.clear()
    scrubSids = []
  },
)

// 문서는 왼쪽 사이드바 Docs 탭에서 열어요(오른쪽 위 '문서' 토글은 뺐어요)
const screenName = (id: string) => allScreens.data.value?.find((s) => s.id === id)?.name ?? list.value.find((s) => s.id === id)?.name ?? tr('Frame')
// 디자인 탭 Status 드롭다운(InspectorDesign)과 같은 영어 라벨
const STATUS_BADGE: Record<ScreenRow['status'], string> = { draft: 'In progress', review: 'Ready for review', approved: 'Approved' }
</script>

<template>
  <div :class="['editor', { 'ui-hidden': uiHidden, unready: !viewReady, rulers: rulersShown }]">
    <Transition name="ld"><IrisLoading v-if="booting" :progress="bootP" /></Transition>
    <EditorCanvas
      ref="canvas"
      v-model:tool="tool"
      v-model:viewport="vp"
      v-model:multi="multiScreens"
      :screens="canvasList"
      :background="currentPage?.viewport?.background ?? null"
      :pixel-grid="currentPage?.viewport?.pixelGrid !== false"
      :snap-pixel="currentPage?.viewport?.snapPixel !== false"
      @view="(k: 'pixelGrid' | 'snapPixel') => onPageSettings({ [k]: currentPage?.viewport?.[k] === false })"
      :cover-id="project.data.value?.cover_screen_id ?? null"
      @thumbnail="onThumbnail"
      :highlight="highlight"
      :peek="peek"
      :guides="currentPage?.viewport?.guides ?? { x: [], y: [] }"
      @guides="(g) => onPageSettings({ guides: g })"
      @clone-screen="async (id: string, x: number, y: number) => { const r = await cloneScreen(id, { x, y }); if (r) screenDup = { src: id, copy: r.id } }"
      @clone-screens="(items: { id: string; x: number; y: number }[]) => cloneMany(items, store.layerIds.value.length > 0)"
      @clip-screens="(ids: string[]) => { screenClip = ids; say(ids.length > 1 ? tr('Copied {n} frames', { n: ids.length }) : tr('Copied')) }"
      @paste-screens="pasteScreens"
      @move="onMove"
      @resize-screen="onResizeScreen"
      @arrange-screens="onArrangeScreens"
      @rename-screen="onRenameScreen"
      @create="onCreate"
      @hint="say"
      @screen-action="onScreenAction"
      @drop-files="onDropFiles"
      @place-image="onPlaceImage"
      @ui="onUiKey"
      @reload="tabReload.reload(projectId)"
    />
    <div v-if="screens.status.value === 'success' && !list.length" class="sq float s canvas-empty">
      <span class="tx-head">{{ tr('This page is empty') }}</span>
      <span class="tx-meta ce-sub">{{ tr('Draw a frame with the Frame tool (F) or import one from Figma') }}</span>
      <span class="row">
        <Button size="s" type="tertiary" stroke @click="tool = 'frame'">{{ tr('Draw frame') }}</Button>
        <Button size="s" type="tertiary" stroke @click="figmaOpen = true">{{ tr('Import from Figma') }}</Button>
      </span>
    </div>

    <!-- 왼쪽 패널 -->
    <aside :aria-label="tr('Left sidebar')" :class="['sq', 'float', 'panel-left', { collapsed: collapsed.left }]">
      <!-- 맨 위: 파일 줄(메인 메뉴 · 프로젝트 이름 · 저장 상태) — 예전 떠 있던 알약을 사이드바에 합쳤어요(아래 구분선) -->
      <div class="panel-top line-b">
        <div class="home-wrap">
          <button class="sq hov home" :aria-label="tr('Main menu')" :aria-expanded="projMenu" @click="projMenu = !projMenu"><IrisLogo kind="symbol" :height="16" /><EditorIcon name="chevron_down" :size="12" /></button>
          <div v-if="projMenu" class="sq menu pmenu" role="menu" @click="projMenu = false">
            <NuxtLink to="/" class="sq menu-item" role="menuitem">{{ tr('Back to files') }}</NuxtLink>
            <button class="sq menu-item" role="menuitem" @click="settingsOpen = true">{{ tr('Project settings') }}</button>
            <NuxtLink to="/requirements" class="sq menu-item" role="menuitem">{{ tr('Requirements board') }}</NuxtLink>
            <button class="sq menu-item ks-mi" role="menuitem" @click="shortcutsOpen = true"><span>{{ tr('Keyboard shortcuts') }}</span><span class="mi-key">⌃⇧?</span></button>
            <div class="msep" role="separator" />
            <ThemeSwitch compact />
            <LangSwitch />
          </div>
        </div>
        <input v-if="projRenaming" v-select class="sqc txt-in rename prename" :value="project.data.value?.name ?? ''" :aria-label="tr('Project name')" maxlength="80" @blur="onProjRename" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="projRenaming = false">
        <span v-else class="tx-head ellipsis fname" :title="project.data.value?.name ? tr('{name} — double-click to rename', { name: project.data.value.name }) : undefined" @dblclick="projRenaming = true">{{ project.data.value?.name ?? '' }}</span>
        <!-- 연결 · 저장 상태(피그마 왼쪽 아래 구름 표시처럼): 오프라인 → 저장 중 → 저장 실패(다시 시도) -->
        <span v-if="!online" class="tx-meta save offline" :data-tip="tr('Offline. Changes are kept in this browser and saved when you\'re back online')"><EditorIcon name="warning" :size="16" />{{ tr('Offline') }}</span>
        <span v-else-if="store.saveState.state === 'saving'" class="tx-meta save">{{ tr('Saving…') }}</span>
        <TextButton v-else-if="store.saveState.state === 'error'" size="s" color="red" class="save" @click="store.flushAll()">{{ tr('Couldn\'t save · Retry') }}</TextButton>
      </div>
      <div class="pbody">
      <div role="tablist" :aria-label="tr('Left sidebar')" class="seg tabs">
        <button v-for="t in [['file', 'File'], ['assets', 'Assets'], ['docs', 'Docs']] as const" :key="t[0]" role="tab" :aria-selected="left === t[0]" :class="['sq', 'seg-item', { on: left === t[0] }]" @click="left = t[0]; expandPanels()">{{ tr(t[1]) }}</button>
        <button class="sq hov fold" :aria-label="collapsed.left ? tr('Expand sidebars') : tr('Collapse sidebars')" :data-tip="collapsed.left ? tr('Expand sidebars') : tr('Collapse sidebars')" :aria-expanded="!collapsed.left" @click="togglePanel()"><EditorIcon :name="collapsed.left ? 'sidebar_expand' : 'sidebar_collapse'" :size="16" /></button>
      </div>

      <template v-if="left === 'file'">
        <!-- 페이지 · 레이어 · 문서 목록: 팝오버와 같은 얇은 스크롤 막대(v-ovscroll) -->
        <section ref="pagesEl" v-ovscroll class="pages" :style="pagesH ? { height: pagesH + 'px', maxHeight: 'none' } : undefined">
          <div class="sec-h"><span>{{ tr('Pages') }}</span><button class="ib s24" :aria-label="tr('Add new page')" :title="tr('Add new page')" @click="onAddPage"><EditorIcon name="plus" /></button></div>
          <Skeleton v-if="pages.status.value === 'pending'" shape="text" />
          <div v-if="pageOver" class="pdrop" :style="{ top: pageOver.y - 1 + 'px' }" aria-hidden="true" />
          <template v-for="p in pages.data.value ?? []" :key="p.id">
            <input v-if="renaming === p.id" v-select class="sqc txt-in rename" :value="p.name" :aria-label="tr('Page name')" @blur="onRename(p.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = null">
            <!-- 이름이 '---'(대시 3개 이상)뿐인 페이지는 구분선(피그마와 같아요) — 누를 수 없고, 두 번 누르거나 우클릭으로 이름 바꾸기 · 지우기 -->
            <div v-else-if="isDivider(p.name)" :class="['pdiv']" role="separator" :aria-label="tr('Divider')" draggable="true" @dragstart="pageDrag = p.id" @dragover="onPageOver($event, p.id)" @dragleave="pageOver = null" @drop.prevent="onPageDrop" @dragend="pageDrag = null; pageOver = null" @dblclick="renaming = p.id" @contextmenu="pageMenu(p, $event)"><i /></div>
            <button v-else :class="['sq', 'nav-item', 's', 'prow', { on: pageId === p.id }]" draggable="true" @dragstart="pageDrag = p.id" @dragover="onPageOver($event, p.id)" @dragleave="pageOver = null" @drop.prevent="onPageDrop" @dragend="pageDrag = null; pageOver = null" @click="pageId = p.id" @dblclick="renaming = p.id" @keydown.f2.prevent="renaming = p.id" @contextmenu="pageMenu(p, $event)"><span class="ellipsis">{{ p.name }}</span></button>
          </template>
        </section>
        <div :class="['split', { on: splitting }]" role="separator" aria-orientation="horizontal" :aria-label="tr('Resize pages and layers')" :title="tr('Drag to resize · double-click to reset')" @pointerdown="startSplit" @dblclick="resetSplit" />
        <section v-ovscroll class="layers">
          <div class="sec-h"><span>{{ tr('Layers') }}</span></div>
          <LayerTree :screens="canvasScreen && store.doc(canvasScreen.id).rootIds.length ? [canvasScreen, ...list] : list" :multi="multiScreens" :canvas-id="canvasScreen?.id ?? null" :cover-id="project.data.value?.cover_screen_id ?? null" @thumbnail="onThumbnail" @pick-screen="pickScreen" @toggle-screen="toggleScreen" @screen-action="onScreenAction" @screen-order="onScreenOrder" />
          <div v-if="screens.status.value === 'success' && !list.length" class="empty-col">
            <span class="tx-meta">{{ tr('No frames yet') }}</span>
            <TextButton size="s" color="blue" @click="tool = 'frame'">{{ tr('Draw frame') }}</TextButton>
          </div>
        </section>
      </template>

      <EditorAssets v-else-if="left === 'assets'" v-model:open="asset" :screen-ids="list.map((s) => s.id)" :screen-name="screenName" @pick-screen="(id: string) => pickScreen(id, true)" @insert="(name: string) => canvas?.insertInstance(name)" />

      <!-- 문서 읽기(왼쪽): 위에 뒤로(목록으로) · 같이 보는 화면 -->
      <div v-else-if="openDoc" class="docs-read">
        <div class="sec-h doc-h">
          <!-- ‹ Docs 를 한 덩어리 뒤로 버튼으로(사용자 요청 2026-11-26) -->
          <button type="button" class="sq hov back" :aria-label="tr('Back to docs')" @click="closeDoc"><EditorIcon name="chevron_right" :size="16" class="flip" /><span>{{ tr('Docs') }}</span></button>
          <span class="f1" />
          <span v-if="current" class="tx-meta ellipsis doc-with">{{ tr('Viewing with {name}', { name: current.name }) }}</span>
        </div>
        <!-- 문서 본문은 팝오버 목록처럼 내용 위에 뜨는 얇은 스크롤 막대(올리거나 스크롤할 때만) -->
        <div v-ovscroll class="scroll doc-scroll">
          <DocReader :doc="openDoc" :reqs="docReqs" :highlight="docReq" :linked="linkedReqIds" compact @pick-req="pickReq" @hover-req="(id: string | null) => (hoverReq = id)" @create-req="onCreateReq" />
        </div>
      </div>
      <div v-else v-ovscroll class="docs">
        <div class="sec-h"><span>{{ tr('Docs') }}</span><button class="ib s24" :aria-label="tr('Add doc')" :title="tr('Add doc')" @click="addDocOpen = true"><EditorIcon name="plus" /></button></div>
        <Skeleton v-if="docs.status.value === 'pending'" shape="text" />
        <div v-for="g in docGroups" :key="g.k" class="dgroup">
          <span class="nav-label">{{ g.label }}</span>
          <button v-for="d in g.items" :key="d.id" :class="['sq', 'nav-item', 's', 'drow', { on: docId === d.id }]" :aria-current="docId === d.id ? 'true' : undefined" @click="showDoc(d.id)">
            <EditorIcon :name="docIcon(d)" :size="16" class="flex-none muted" />
            <span class="ellipsis f1">{{ d.title }}</span>
            <span v-if="reqCount(d.id)" class="tx-meta num" :aria-label="tr('{n} requirements', { n: reqCount(d.id) })">{{ reqCount(d.id) }}</span>
            <span v-if="d.fetch_status === 'failed'" class="warn" role="img" :aria-label="tr('Couldn\'t fetch this doc')"><EditorIcon name="warning" :size="16" /></span>
          </button>
        </div>
        <div v-if="docs.status.value === 'success' && !docGroups.length" class="empty-col">
          <span class="tx-meta">{{ tr('No docs yet') }}</span>
          <button class="sq act line" @click="addDocOpen = true"><EditorIcon name="plus" :size="16" />{{ tr('Add doc') }}</button>
        </div>
      </div>
      <!-- 맨 아래: 변수(토큰) — 누르면 캔버스 대신 변수 화면(다른 페이지처럼) -->
      <div class="vars-foot">
        <button type="button" :class="['sq', 'vars-btn', { on: varsOpen }]" :aria-pressed="varsOpen" @click="varsOpen = !varsOpen">
          <EditorIcon name="variable" :size="16" /><span class="f1">{{ tr('Variables') }}</span><EditorIcon name="chevron_right" :size="16" class="muted" />
        </button>
      </div>
      </div>
    </aside>

    <!-- 오른쪽 패널 -->
    <aside :aria-label="tr('Right sidebar')" :class="['sq', 'float', 'panel-right', { collapsed: collapsed.right && !hasPick }]">
      <!-- 맨 위: 나 · Share — 예전 떠 있던 알약을 사이드바에 합쳤어요(아래 구분선) -->
      <div class="panel-top r line-b">
        <MemberAvatar :size="24" :name="myName" :src="me?.avatar_url" :title="myName" />
        <span class="pill-acts">
          <Button size="s" type="primary" @click="share">{{ tr('Share') }}</Button>
        </span>
      </div>
      <!-- 인스펙터(문서를 열어도 그대로) -->
      <template v-if="true">
        <div role="tablist" :aria-label="tr('Properties tabs')" class="seg tabs">
          <button v-for="t in [['design', 'Design'], ['plan', 'Plan'], ['dev', 'Dev']] as const" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]; expandPanels()">{{ tr(t[1]) }}</button>
          <div class="zoom-wrap">
            <button class="sq hov zoom" :aria-label="tr('Zoom')" :aria-expanded="zoomOpen" @click="zoomOpen = !zoomOpen"><span class="num">{{ Math.round(vp.zoom * 100) }}%</span><EditorIcon name="chevron_down" :size="12" class="muted" /></button>
            <div v-if="zoomOpen" class="sq menu zmenu" role="menu" @click="zoomOpen = false">
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom * 2)"><span class="f1">{{ tr('Zoom in') }}</span><span class="tx-meta">⌘+</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom / 2)"><span class="f1">{{ tr('Zoom out') }}</span><span class="tx-meta">⌘−</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.fit()"><span class="f1">{{ tr('Zoom to fit') }}</span><span class="tx-meta">1</span></button>
              <button v-if="selected" class="sq menu-item" role="menuitem" @click="canvas?.fitSelection()"><span class="f1">{{ tr('Zoom to selection') }}</span><span class="tx-meta">2</span></button>
              <div class="msep" role="separator" />
              <button v-for="z in ZOOMS" :key="z" class="sq menu-item num" role="menuitem" @click="canvas?.zoomAt(z)"><span class="f1">{{ tr('Zoom to {n}%', { n: z * 100 }) }}</span><span v-if="z === 1" class="tx-meta">⌘0</span></button>
            </div>
          </div>
          <!-- 보기 설정(피그마 보기 메뉴에서 Iris 가 그리는 것만). 나머지는 PRD/07 §20 -->
          <div class="view-wrap">
            <button class="sq hov fold" :aria-label="tr('View settings')" :data-tip="tr('View settings')" aria-haspopup="menu" :aria-expanded="viewOpen" @click="viewOpen = !viewOpen"><EditorIcon name="setting" :size="16" /></button>
            <div v-if="viewOpen" class="sq menu zmenu vmenu" role="menu" @click="viewOpen = false">
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="currentPage?.viewport?.pixelGrid !== false" @click="onPageSettings({ pixelGrid: currentPage?.viewport?.pixelGrid === false })"><EditorIcon name="check" :size="12" :class="['zck', { off: currentPage?.viewport?.pixelGrid === false }]" /><span class="f1">{{ tr('Pixel grid') }}</span><span class="tx-meta">⇧'</span></button>
              <!-- 픽셀에 맞추기(피그마 Snap to pixel grid): 격자 보이기와 따로 — 끄면 소수점으로 옮기고 크기를 바꿔요 -->
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="currentPage?.viewport?.snapPixel !== false" @click="onPageSettings({ snapPixel: currentPage?.viewport?.snapPixel === false })"><EditorIcon name="check" :size="12" :class="['zck', { off: currentPage?.viewport?.snapPixel === false }]" /><span class="f1">{{ tr('Snap to pixel grid') }}</span><span class="tx-meta">⇧⌘'</span></button>
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="gridsShown" @click="gridsShown = !gridsShown"><EditorIcon name="check" :size="12" :class="['zck', { off: !gridsShown }]" /><span class="f1">{{ tr('Layout grids') }}</span><span class="tx-meta">⇧G</span></button>
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="rulersShown" @click="rulersShown = !rulersShown"><EditorIcon name="check" :size="12" :class="['zck', { off: !rulersShown }]" /><span class="f1">{{ tr('Rulers') }}</span><span class="tx-meta">⇧R</span></button>
            </div>
          </div>
        </div>

        <template v-if="current">
          <div v-if="tab !== 'design'" class="obj">
            <div class="obj-row">
              <span class="tx-head ellipsis">{{ current.name }}</span>
              <span class="sq badge">{{ tr(STATUS_BADGE[current.status]) }}</span>
            </div>
            <span class="tx-meta">{{ current.source === 'figma' ? tr('Figma frame') : tr('Iris frame') }} · <span class="num">{{ fmtNum(current.width) }} × {{ fmtNum(current.height) }}</span></span>
          </div>
          <div class="scroll insp">
            <InspectorPlan v-if="tab === 'plan'" ref="plan" :key="current.id" :project-id="projectId" :screen="current" @open-doc="(id: string, req?: string) => showDoc(id, req)" @toast="say" @add-doc="addDocOpen = true" />
            <InspectorDev v-else-if="tab === 'dev'" :screen="current" @synced="screens.refresh()" @open-asset="(id: string) => { left = 'assets'; asset = id }" @toast="say" />
            <template v-else-if="store.layerIds.value.length">
              <InspectorLayer :screen="current" @replace-image="pickImage" />
              <!-- 스케일 도구(K): 패널 아래 Scale 칸(피그마와 같아요) -->
              <InspectorScale v-if="tool === 'scale'" :sid="current.id" :ids="store.layerIds.value" />
              <InspectorExport :sid="current.id" :ids="store.layerIds.value" @toast="say" />
            </template>
            <!-- 프레임 여러 개: 한 개일 때와 같은 패널(값이 다르면 Mixed) — 고치면 모두에 한꺼번에(피그마와 같아요) -->
            <template v-else-if="multiList.length > 1">
              <InspectorDesign :screen="multiList[0]!" :multi="multiList" @update="onUpdateMany" @step="onStepMany" @arrange="onArrangeScreens" />
              <InspectorExport :sid="multiList[0]!.id" :ids="[]" :screen="multiList[0]" :screens="multiList" @toast="say" />
            </template>
            <template v-else>
              <InspectorDesign :screen="current" @update="onUpdate" @remove="onRemove" />
              <!-- 스케일 도구(K) + 화면(프레임) 고름: 화면과 안의 내용을 같은 비율로 -->
              <InspectorScale v-if="tool === 'scale' && current.source === 'native'" :sid="current.id" :ids="[]" :screen="current" @scale-screen="onScaleScreen" />
              <!-- 완성한 화면 내보내기(피그마 Export) -->
              <InspectorExport :sid="current.id" :ids="[]" :screen="current" @toast="say" />
            </template>
          </div>
        </template>
        <!-- 캔버스 위 레이어를 골랐을 때: 디자인 속성만 -->
        <div v-else-if="canvasScreen && selected === canvasScreen.id && store.layerIds.value.length" class="scroll insp">
          <InspectorLayer :screen="canvasScreen" @replace-image="pickImage" />
          <InspectorScale v-if="tool === 'scale'" :sid="canvasScreen.id" :ids="store.layerIds.value" />
          <InspectorExport :sid="canvasScreen.id" :ids="store.layerIds.value" @toast="say" />
        </div>
        <!-- 아무것도 안 골랐을 때: 피그마의 Page 패널처럼 페이지 · 캔버스 설정 -->
        <div v-else-if="tab === 'design' && currentPage" class="scroll insp">
          <InspectorPage :page="currentPage" :zoom="vp.zoom" :screen-count="list.length" @rename="(n: string) => currentPage && renamePageUndoable(currentPage.id, n).catch(() => sayFail(tr('Couldn\'t rename the page')))" @settings="onPageSettings" @zoom="(z: number | 'fit') => (z === 'fit' ? canvas?.fit() : canvas?.zoomAt(z))" />
        </div>
        <div v-else class="none">
          <span class="tx-head">{{ tr('Select a frame') }}</span>
          <span class="tx-meta">{{ tr('Select a frame on the canvas or in Layers to see its requirements, design and dev info here') }}</span>
          <TextButton v-if="list.length" size="s" color="blue" class="self-start" @click="pickScreen(list[0]!.id, true)">{{ tr('Select first frame') }}</TextButton>
        </div>
      </template>
    </aside>

    <EditorToolbar v-model="tool" @rail="onRail" />

    <div class="toast-wrap" role="status" aria-live="polite">
      <!-- 오래 남는 알림(닫을 때까지): 인터넷 끊김 · 저장 실패 — 피그마 'This file has unsaved changes' 처럼 도구 막대 위 -->
      <div v-if="banner" class="sq toast bell" role="alert">
        <EditorIcon name="warning" :size="16" class="bell-ic" />
        <span>{{ banner === 'offline' ? tr('You\'re offline. Changes are kept in this browser and saved when you reconnect') : tr('Couldn\'t save your changes. Retrying automatically') }}</span>
        <button v-if="banner === 'server'" type="button" class="sq bell-act" @click="store.flushAll()">{{ tr('Retry now') }}</button>
        <button type="button" class="sq bell-x" :aria-label="tr('Close')" @click="bannerClosed = banner"><EditorIcon name="close" :size="12" /></button>
      </div>
      <Transition name="toast"><div v-if="toast" class="sq toast">{{ toast }}</div></Transition>
    </div>

    <!-- 불러오기 실패: 캔버스 자리에 안내 · 다시 시도(없거나 권한이 없으면 홈으로) -->
    <div v-if="loadErr && !booting" class="load-err" role="alert">
      <EditorIcon name="warning" :size="24" class="le-ic" />
      <span class="tx-head">{{ notFound ? tr('This project can\'t be found') : tr('Couldn\'t load this project') }}</span>
      <span class="le-desc">{{ notFound ? tr('It may have been deleted, or you don\'t have access') : online ? tr('Something went wrong on our side. Try again in a moment') : tr('You\'re offline. Check your internet connection and try again') }}</span>
      <span class="le-row">
        <Button size="s" type="tertiary" @click="navigateTo('/')">{{ tr('Go to files') }}</Button>
        <Button v-if="!notFound" size="s" type="primary" :loading="retrying" @click="retryLoad">{{ tr('Retry') }}</Button>
      </span>
    </div>

    <!-- 지난번에 저장하지 못한 변경 복구 -->
    <AppConfirm
      v-if="recover && !booting && !loadErr"
      :title="tr('You have unsaved changes')"
      :desc="tr('Changes to {n} frames weren\'t saved last time and were kept in this browser ({ago}). Restore them? This replaces what\'s there now.', { n: recover.n, ago: agoText(recover.at) })"
      :closable="false"
      :actions="[{ label: tr('Discard'), onClick: discardRecover }, { label: tr('Restore'), kind: 'primary', onClick: doRecover }]"
    />

    <!-- 로그인이 끝났을 때 -->
    <AppConfirm
      v-if="authLost"
      :title="tr('You\'ve been signed out')"
      :desc="tr('You signed out somewhere else, or your session ended. Changes that weren\'t saved are kept in this browser — sign in again to save them.')"
      :closable="false"
      :actions="[{ label: tr('Sign in again'), kind: 'primary', onClick: signInAgain }]"
    />

    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime" class="sr" tabindex="-1" aria-hidden="true" multiple @change="onImageFile" @cancel="tool === 'image' && (tool = 'move')">
    <AppCommandPalette />
    <ProjectModal v-model:open="settingsOpen" :project-id="projectId" @removed="navigateTo('/')" />
    <KeyboardShortcuts v-if="shortcutsOpen" @close="shortcutsOpen = false" />
    <AddDocModal v-model:open="addDocOpen" :project-id="projectId" @created="onDocCreated" />
    <FigmaLinkModal v-if="pageId" v-model:open="figmaOpen" :page-id="pageId" :next-x="nextX" @created="onFigmaCreated" />
    <EditorVariables v-if="varsOpen" @close="varsOpen = false" />
    <AppConfirm
      v-if="confirmFrames"
      :title="confirmFrames.frames.length === 1 ? tr('Delete the frame &quot;{name}&quot;?', { name: confirmFrames.frames[0]!.name }) : tr('Delete {n} frames?', { n: confirmFrames.frames.length })"
      :desc="tr('{n} linked requirements will be unlinked from this frame. You can undo with ⌘Z.', { n: confirmFrames.links })"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmFrames = null) }, { label: confirmFrames.frames.length === 1 ? tr('Delete frame') : tr('Delete frames'), kind: 'destructed', onClick: doConfirmFrames }]"
      @close="confirmFrames = null"
    />
    <AppConfirm
      v-if="confirmPage"
      :title="tr('Delete &quot;{name}&quot;?', { name: confirmPage.name })"
      :desc="confirmPage.count >= 0 ? tr('All frames and layers on this page will be deleted ({n} frames). This can\'t be undone.', { n: confirmPage.count }) : tr('All frames and layers on this page will be deleted. This can\'t be undone.')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmPage = null) }, { label: tr('Delete page'), kind: 'destructed', onClick: doRemovePage }]"
      @close="confirmPage = null"
    />
  </div>
</template>

<style scoped>
.editor { height: calc(100vh - var(--iris-tabs-h, 0px)); position: relative; overflow: clip; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
/* 캔버스 나타나기: 보던 자리를 놓은 뒤 .28s 로 옅게 → 또렷이. 페이지를 바꿀 땐 바로 감췄다가 다시 나타나요 */
.editor :deep(.canvas) { transition: opacity .28s cubic-bezier(.2, .7, .2, 1); }
.editor.unready :deep(.canvas) { opacity: 0; transition: none; }
.ld-leave-active { transition: opacity .35s ease; }
.ld-leave-to { opacity: 0; }
.canvas-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 280px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-10) var(--ref-spacing-11); text-align: center; pointer-events: none; }
.ce-sub { color: var(--sys-color-neutral-600); }
.canvas-empty .row { display: flex; gap: var(--ref-spacing-06); margin-top: var(--ref-spacing-06); pointer-events: auto; }
.save { margin-left: auto; flex: none; padding-right: var(--ref-spacing-04); }
/* 사이드바 맨 위 줄(파일 줄 · 나 · Docs · Share): 높이 40, 아래 구분선 1px 로 탭 줄과 나눠요 — 예전 위에 따로 떠 있던 알약 둘을 합쳤어요 */
.panel-top { flex: none; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); position: relative; z-index: 2; }
/* 메뉴는 늘 맨 위: 메인 메뉴 · 확대 메뉴가 열리면 이 줄을 패널 안 다른 것(Pages | Layers 크기 조절 선 · 끌기 선)보다 위로 */
.panel-top:has(.menu) { z-index: 10; }
.panel-top.r { padding: 0 var(--ref-spacing-06); }
/* 왼쪽 패널 본문: 메인 메뉴(검은 메뉴)가 접힌 패널 밖으로도 보이게 패널은 넘침을 보이고, 본문만 잘라요 */
/* clip: hidden 과 달리 코드로도 스크롤되지 않아요 — 접힌 채 레이어를 고르면 scrollIntoView 가 이 칸을 밀어 올려 탭 줄 대신 페이지 · 레이어가 보이던 문제 */
.pbody { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: clip; }
/* 좌측 패널 맨 아래 Variables: 위 구분선 + 안쪽 6 · 8 여백 안에 행 32(모서리 6, 호버 · 연 상태 회색) — 패널 둥근 모서리 밖으로 칠이 나가지 않게 */
.vars-foot { flex: none; margin-top: auto; padding: var(--ref-spacing-05) var(--ref-spacing-06) var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.vars-btn { display: flex; align-items: center; gap: var(--ref-spacing-04); width: 100%; height: 32px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); text-align: left; }
.vars-btn:hover, .vars-btn.on { --sq-fill: var(--sys-color-neutral-100); }
.vars-btn .muted { color: var(--sys-color-neutral-500); }
.home-wrap { position: relative; flex: none; }
.pmenu { left: 0; right: auto; width: 232px; }
/* 메뉴 줄 오른쪽 끝 단축키(흐리게) */
.pmenu .ks-mi { justify-content: space-between; }
.pmenu .mi-key { color: var(--sys-color-neutral-500); font-size: 11px; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* 눈금자를 켜면(⇧R) 피그마처럼 양쪽 패널이 눈금자 두께(18)만큼 안으로 — 왼쪽 패널은 위 · 왼쪽, 오른쪽 패널은 위만 */
.editor.rulers { --iris-rul: 18px; }
.panel-left { position: absolute; left: calc(var(--iris-gap) + var(--iris-rul, 0px)); top: calc(var(--iris-gap) + var(--iris-rul, 0px)); bottom: var(--iris-gap); width: 264px; display: flex; flex-direction: column; z-index: 4; overflow: visible; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
/* 접기: 아래 변이 위로 올라가서 맨 위 줄(40) + 탭 줄(42)만 남아요 */
.editor.ui-hidden .panel-left, .editor.ui-hidden .panel-right, .editor.ui-hidden :deep(.bar[role="toolbar"]) { display: none; }
.panel-left.collapsed, .panel-right.collapsed { bottom: calc(100% - var(--iris-gap) - var(--iris-rul, 0px) - 40px - 42px); }
/* 접힌 오른쪽 패널: 자르지 않아서 머리 줄의 펼침 메뉴(줌 · 보기 설정)가 패널 밖 맨 위로 보여요 — 대신 머리 아래 내용은 숨겨요 */
.panel-right.collapsed { overflow: visible; }
.panel-right.collapsed > :not(.panel-top):not(.tabs) { visibility: hidden; }
.fold { flex: none; width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-500); margin-left: var(--ref-spacing-02); }
.panel-left .fold { margin-left: auto; }
/* 탭(26)과 같은 높이 · 아이콘 18 */
.fold > svg { width: 18px; height: 18px; }
.fold:hover, .fold[aria-expanded="true"]:not(.panel-left .fold) { color: var(--sys-color-neutral-800); }
.pill-acts { margin-left: auto; display: flex; align-items: center; gap: var(--ref-spacing-04); }
/* 왼쪽 위 로고 버튼(24)과 같은 높이 */
.pill-acts :deep(.bd-button) { height: 24px; min-height: 24px; }
.panel-h { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); height: 42px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); }
.panel-right { position: absolute; right: var(--iris-gap); top: calc(var(--iris-gap) + var(--iris-rul, 0px)); bottom: var(--iris-gap); width: 288px; display: flex; flex-direction: column; z-index: 3; overflow: clip; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
.tabs { padding: var(--ref-spacing-06); flex: none; }
.line-b { box-shadow: 0 1px 0 var(--iris-line); }
/* 왼쪽 패널 열: 행 바탕은 패널 안쪽 8(탭 줄과 같아요), 글자 · 섹션 제목 · ▸ 는 x 16+8 한 줄에 맞춰요 */
.pages { display: flex; flex-direction: column; box-sizing: border-box; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); box-shadow: inset 0 -1px 0 var(--iris-line); flex: none; max-height: 40%; overflow: auto; }
.pages > .sec-h, .layers > .sec-h, .docs > .sec-h { flex: none; height: 32px; padding: 0 0 0 var(--ref-spacing-06); }
.docs-read { padding-top: var(--ref-spacing-04); }
.docs-read > .sec-h { flex: none; height: 32px; padding: 0 var(--ref-spacing-10) 0 var(--ref-spacing-06); }
.prow, .drow { padding: 5px var(--ref-spacing-06); }
/* 페이지 끌기: 놓을 자리에 레이어 목록과 같은 선(2px · 파랑 55% · 행 좌우 안쪽 4) */
.pages { position: relative; }
.pdrop { position: absolute; left: calc(var(--ref-spacing-06) + var(--ref-spacing-04)); right: calc(var(--ref-spacing-06) + var(--ref-spacing-04)); height: 2px; z-index: 3; pointer-events: none; background: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); }
.pdiv { flex: none; height: 13px; display: flex; align-items: center; padding: 0 var(--ref-spacing-06); cursor: default; }
.pdiv > i { flex: 1; height: 1px; background: var(--iris-line-strong); }
.prow { min-width: 0; }
.ib.s24 { width: 28px; height: 28px; }
/* 페이지 이름 바꾸기: 피그마처럼 흰 바탕 + 1px 파란 선, 글자 자리 그대로(x+8), 행 28 안에 24 */
.rename, .rename:focus { flex: none; margin: 2px 0; height: 24px; padding: 0 7px; background: var(--sys-color-common-white-emphasis); box-shadow: inset 0 0 0 1px var(--sys-color-brand-primary-default); }
/* 프로젝트 이름 칸: 알약 안 남은 폭을 다 써요. 글자는 이름과 같은 12/600, 안쪽 여백만큼 왼쪽으로 당겨 글자 자리가 그대로예요 */
.prename, .prename:focus { flex: 1 1 auto; min-width: 0; margin: 0 0 0 -7px; font-size: 12px; font-weight: 600; }
/* Pages | Layers 사이 끌기 자리: 선 위아래 4px 씩, 올리면 ↕ · 끄는 동안 파란 선 */
.split { flex: none; position: relative; z-index: 2; height: 9px; margin: -5px 0 -4px; cursor: row-resize; touch-action: none; }
.split::after { content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 1px; background: transparent; transition: background-color 0.12s; }
.split:hover::after { background: var(--sys-color-neutral-300); }
.split.on::after { background: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); } /* 레이어 목록 끌기 선과 같은 색 */
.layers { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); }
.docs { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-10); }
.dgroup { display: flex; flex-direction: column; }
/* 묶음 라벨(Planning · Design …): 섹션 제목보다 한 단계 아래 — 12 · 500 · neutral-500, 글자 열 x+8 */
.dgroup .nav-label { padding: 0 var(--ref-spacing-06) var(--ref-spacing-04); color: var(--sys-color-neutral-500); font-weight: 500; }
.warn { flex: none; display: grid; color: var(--sys-color-theme-warning-default); }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); padding: var(--ref-spacing-02) var(--ref-spacing-06); }
.flex-none { flex: none; }
.f1 { flex: 1; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.zoom-wrap { margin-left: auto; position: relative; }
/* 줌 버튼: 탭 · 접기 버튼과 같은 줄 높이 24, 피그마처럼 오른쪽 ▾ 쪽 안쪽을 좁게 */
.zoom { display: flex; align-items: center; gap: var(--ref-spacing-02); height: 26px; box-sizing: border-box; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.zmenu { left: auto; right: 0; width: 200px; }
.zmenu .menu-item { padding-left: 26px; }
.zck { position: absolute; left: 8px; top: 8px; }
/* 보기 설정 ⚙: 줌 옆 24 버튼, 메뉴는 오른쪽 끝에 맞춰서 */
.view-wrap { position: relative; flex: none; }
.vmenu { width: 184px; }
.zck.off { visibility: hidden; }
.obj { flex: none; display: flex; flex-direction: column; padding: var(--ref-spacing-02) var(--ref-spacing-10) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.obj-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.badge { flex: none; height: 20px; line-height: 20px; white-space: nowrap; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-weight: 500; }
.scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; }
/* 왼쪽 문서 읽기: 머리(뒤로 · Docs · 같이 보는 화면) 아래 본문이 스크롤 */
.docs-read { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 본문 좌우 16 — 오른쪽 패널 섹션과 같아요(DocReader 안쪽에도 .reader 가 있어 이름을 따로 둬요) */
.doc-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-16); }
.doc-h { gap: var(--ref-spacing-02); }
/* 뒤로(‹ Docs): 화살표 왼쪽 간격을 Pages 의 + 오른쪽 간격(13)과 같게 */
.doc-h .back { display: flex; align-items: center; gap: var(--ref-spacing-02); height: 24px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-02); margin-left: 3px; border-radius: var(--ref-radius-03); font-weight: 600; color: var(--sys-color-neutral-800); }
.doc-h .back .flip { transform: scaleX(-1); color: var(--sys-color-neutral-600); }
.doc-with { flex: none; max-width: 50%; }
.none { padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
/* 토스트: 도구 막대(아래 16 + 높이 44 = 60) 위로 16 띄워서 */
.toast-wrap { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 10; pointer-events: none; }
/* 라이트 · 다크 모두 어두운 토스트(neutral-800 · white 토큰은 다크에서 뒤집혀서 고정값을 써요). 다크에선 옅은 흰 테두리로 캔버스와 구분 */
.toast { display: flex; align-items: center; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--iris-black); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--iris-paper); font-weight: 500; white-space: nowrap; filter: var(--iris-float-shadow); }
/* 피그마 UI3 토스트: 도구 막대 바로 위, 3초, 애니메이션 없이 바로 나타나고 사라져요 */
/* 오래 남는 알림(인터넷 끊김 · 저장 실패): 토스트와 같은 검은 면, 왼쪽 경고 아이콘 · 오른쪽 동작 · 닫기 */
.toast.bell { gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); pointer-events: auto; margin-bottom: var(--ref-spacing-04); }
.bell-ic { flex: none; color: #FFC53D; }
.bell-act { flex: none; height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); color: #7CC4FF; font: inherit; font-weight: 500; --sq-fill: transparent; }
.bell-act:hover { --sq-fill: rgb(255 255 255 / 10%); }
.bell-x { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: rgb(255 255 255 / 70%); --sq-fill: transparent; }
.bell-x:hover { --sq-fill: rgb(255 255 255 / 10%); color: #FFFFFF; }
/* 머리줄의 오프라인 표시 */
.save.offline { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-neutral-600); }
/* 불러오기 실패: 캔버스 가운데 안내 */
.load-err { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ref-spacing-04); background: var(--iris-canvas); text-align: center; padding: 0 var(--ref-spacing-10); }
.le-ic { color: var(--sys-color-neutral-500); margin-bottom: var(--ref-spacing-04); }
.le-desc { max-width: 320px; color: var(--sys-color-neutral-600); }
.le-row { display: flex; justify-content: center; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-06); }
</style>
