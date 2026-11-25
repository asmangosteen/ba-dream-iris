<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Button, Skeleton, TextButton } from '@ba-dream/design-system'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import InspectorPlan from '~/components/editor/InspectorPlan.vue'
import InspectorDev from '~/components/editor/InspectorDev.vue'
import InspectorDesign from '~/components/editor/InspectorDesign.vue'
import ContextMenu from '~/components/editor/ContextMenu.vue'
import { importSvg } from '~/canvas/vector'
import InspectorLayer from '~/components/editor/InspectorLayer.vue'
import InspectorScale from '~/components/editor/InspectorScale.vue'
import InspectorExport from '~/components/editor/InspectorExport.vue'
import InspectorPage from '~/components/editor/InspectorPage.vue'
import { arrangeRects, type ArrangeOp } from '~/canvas/geom'
import LayerTree from '~/components/editor/LayerTree.vue'
import { useMixScreens } from '~/composables/useLayerMenu'
import { createLayerStore, LAYER_STORE } from '~/canvas/store'
import { isMediaFile, isVideoFile, mediaLimit, uploadImage } from '~/canvas/images'
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
const { project, pages, pageId, screens, addPage, renamePage, removePage, reorderScreen, updatePageSettings, addScreen, updateScreen, removeScreen } = useEditor(projectId)
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
  try { await removePage(c.id); say(tr('Deleted {name}', { name: c.name })) } catch { say(tr('Couldn\'t delete the page. Try again')) }
}
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const allScreens = useProjectScreens(projectId)
const { addRequirement, setLink } = useIrisMutations()

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------
const left = ref<'file' | 'assets' | 'docs'>('file')
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
const canvas = ref<{ fit: (ids?: string[]) => void; zoomAt: (z: number) => void; fitSelection: () => void; insertInstance: (name: string, at?: { x: number; y: number }) => void; sectionScreens: (ids?: string[]) => void } | null>(null)
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
    store.pushAction(null, () => updatePageSettings(p.id, before), () => updatePageSettings(p.id, patch))
  } catch { say(tr('Couldn\'t save page settings')) }
}
const canvasList = computed(() => (canvasScreen.value ? [...list.value, canvasScreen.value] : list.value))
const { tokens } = useDesignSystem()
const supabase = useSupabaseClient()
const preview = useDevPreview()
// 화면 안 레이어: 고르기 · 실행취소 · 자동저장
const store = createLayerStore({
  screens: canvasList,
  save: (sid, doc) => updateScreen(sid, { layers: doc }),
  tokens: computed(() => (tokens.data.value ?? []).map((t) => ({ name: t.name, value: t.value }))),
})
provide(LAYER_STORE, store)
const selected = store.screenId
const current = computed(() => list.value.find((s) => s.id === selected.value) ?? null)
const openDoc = computed(() => (docs.data.value ?? []).find((d) => d.id === docId.value) ?? null)
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
/** 문서에서 고른 요구사항에 연결된 화면을 캔버스에서 강조 */
const highlight = computed(() => (docReq.value ? (links.data.value ?? []).filter((l) => l.requirement_id === docReq.value).map((l) => l.screen_id) : []))

// 토스트
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3000)
}

// ---------------------------------------------------------------------------
// 페이지 · 화면
// ---------------------------------------------------------------------------
const views = new Map<string, Viewport>() // 페이지마다 보던 위치 기억
let fitted: string | null = null
watch(pageId, (next, prev) => {
  if (prev) views.set(prev, { ...vp.value })
  store.selectScreen(null)
  const v = next ? views.get(next) : undefined
  if (v) { vp.value = v; fitted = next }
})
watch(() => [pageId.value, screens.status.value] as const, ([pid, st]) => {
  if (!import.meta.client || st !== 'success' || !pid || fitted === pid) return
  fitted = pid
  nextTick(() => canvas.value?.fit())
}, { immediate: true })
onMounted(() => { if (screens.status.value === 'success' && fitted !== pageId.value) { fitted = pageId.value; canvas.value?.fit() } })

async function onAddPage() {
  try { await addPage() } catch { say(tr('Couldn\'t add a page. Try again')) }
}
const renaming = ref<string | null>(null)
async function onRename(id: string, e: Event) {
  // Esc 로 취소한 뒤 따라오는 blur 는 무시해요
  if (renaming.value !== id) return
  renaming.value = null
  const name = (e.target as HTMLInputElement).value.trim()
  const before = pages.data.value?.find((x) => x.id === id)?.name
  if (!name || name === before) return
  try { await renamePage(id, name) } catch { say(tr('Couldn\'t rename')) }
}
/** 프로젝트 이름: 왼쪽 위 이름을 두 번 누르면 바로 고쳐요(피그마 파일 이름과 같아요). Enter · 바깥 누르기 = 저장, Esc = 취소 */
const projRenaming = ref(false)
const projActions = useProjectActions()
async function onProjRename(e: Event) {
  if (!projRenaming.value) return
  projRenaming.value = false
  const name = (e.target as HTMLInputElement).value.trim()
  if (!name || name === project.data.value?.name) return
  try { await projActions.update(projectId, { name }) } catch { say(tr('Couldn\'t rename the project')) }
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
  const fail = () => say(tr('Couldn\'t save the position. Try again'))
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
  const fail = () => say(tr('Couldn\'t save the size. Try again'))
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
  const fail = () => say(tr('Couldn\'t save the position. Try again'))
  const apply = (ps: { id: string; x: number; y: number }[]) => Promise.all(ps.map((p) => updateScreen(p.id, { x: p.x, y: p.y }))).catch(fail)
  const back = before.filter((b) => after.some((a) => a.id === b.id))
  apply(after)
  store.pushAction(null, () => apply(back), () => apply(after))
}
async function onCreate(rect: { x: number; y: number; width: number; height: number }) {
  try {
    const row = await addScreen(rect)
    if (row) {
      store.selectScreen(row.id); tab.value = 'design'
      let cur = row.id
      store.pushAction(null, async () => { await removeScreen(cur); store.selectScreen(null) }, async () => { const r = await addScreen(rect, row.name); if (r) cur = r.id })
    }
  } catch { say(tr('Couldn\'t create the frame. Try again')) }
}
/** 프레임 여러 개를 한꺼번에(실행취소 한 번) */
function onUpdateMany(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>) {
  const rows = multiList.value
  store.batch(() => { for (const s of rows) onUpdate(patch, s) })
}
function onUpdate(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>, target?: ScreenRow) {
  const s = target ?? current.value
  if (!s) return
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof typeof patch]])) as typeof patch
  const fail = () => say(tr('Couldn\'t save. Try again'))
  // 크기가 바뀌면 맨 위 레이어들이 제약대로 따라와요(실행취소는 레이어 기록이 따로)
  if (s.source === 'native' && ((patch.width ?? s.width) !== s.width || (patch.height ?? s.height) !== s.height)) store.constrainRoot(s.id, s.width, s.height, patch.width ?? s.width, patch.height ?? s.height)
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
  const fail = () => say(tr('Couldn\'t save. Try again'))
  store.scaleScreenContent(s.id, w / s.width)
  updateScreen(s.id, after).catch(fail)
  store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, after).catch(fail))
}
/** 캔버스 이름표에서 바로 고친 화면 이름 (실행 취소 가능) */
function onRenameScreen(id: string, name: string) {
  const s = canvasList.value.find((v) => v.id === id)
  if (!s) return
  const before = s.name
  const fail = () => say(tr('Couldn\'t rename the frame. Try again'))
  updateScreen(id, { name }).catch(fail)
  store.pushAction(id, () => updateScreen(id, { name: before }).catch(fail), () => updateScreen(id, { name }).catch(fail))
}
async function onRemove() {
  if (!current.value) return
  const name = current.value.name
  try { await removeScreen(current.value.id); store.selectScreen(null); say(tr('Deleted {name}', { name })) } catch { say(tr('Couldn\'t delete the frame')) }
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
  const row = await addScreen(rect, src.name) // 피그마처럼 복제본도 같은 이름
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
  if (action === 'section') { canvas.value?.sectionScreens(); return }
  try {
    if (s && (action === 'front' || action === 'back' || action === 'forward' || action === 'backward')) {
      const before = list.value.map((v) => v.id)
      await reorderScreen(s.id, action)
      const after = list.value.map((v) => v.id)
      // 실행취소: 원래 순서로 되돌리기
      const restore = async (ids: string[]) => { for (const [k, id] of ids.entries()) { const cur = list.value.findIndex((v) => v.id === id); if (cur !== k) { const arr = [...list.value]; const [m] = arr.splice(cur, 1); arr.splice(k, 0, m!); screens.data.value = arr } } await reorderScreen(ids[ids.length - 1]!, 'front') }
      store.pushAction(s.id, () => restore(before), () => restore(after))
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
      const linked = (links.data.value ?? []).some((l) => l.screen_id === s.id)
      if (s.source !== 'native' || linked) {
        tab.value = 'design'
        say(linked ? tr('This frame has linked requirements. Delete it from the Design tab') : tr('Figma frames can be deleted from the Design tab'))
        return
      }
      const snap = { rect: { x: s.x, y: s.y, width: s.width, height: s.height }, name: s.name, status: s.status, layers: JSON.parse(JSON.stringify(store.doc(s.id))) }
      let cur = s.id
      await removeScreen(cur)
      store.selectScreen(null)
      say(tr('Deleted {name} · ⌘Z to undo', { name: s.name }))
      store.pushAction(null, async () => {
        const r = await addScreen(snap.rect, snap.name)
        if (r) { cur = r.id; await updateScreen(r.id, { layers: snap.layers, status: snap.status }); delete store.docs[r.id]; store.selectScreen(r.id) }
      }, async () => { await removeScreen(cur); store.selectScreen(null) })
    }
  } catch { say(tr('Something went wrong. Try again')) }
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
  docId.value = id
  docReq.value = reqId ?? null
}
function closeDoc() { docId.value = null; docReq.value = null }

async function onCreateReq(p: { text: string; block: string | null }) {
  if (!docId.value) return
  const nums = (reqs.data.value ?? []).map((r) => Number(r.code.match(/(\d+)$/)?.[1] ?? 0))
  const code = 'REQ-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')
  const title = p.text.replace(/\s+/g, ' ').trim().slice(0, 80)
  try {
    const id = await addRequirement(projectId, { document_id: docId.value, code, title, anchor: p.block ? { block: p.block } : null })
    if (current.value) await setLink({ screen_id: current.value.id, requirement_id: id, status: 'missing', note: null })
    await Promise.all([reqs.refresh(), links.refresh()])
    docReq.value = id
    say(current.value ? tr('Created {code} and linked it to {name}', { code, name: current.value.name }) : tr('Created {code}', { code }))
  } catch { say(tr('Couldn\'t create the requirement. Try again')) }
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
  if (t === 'image') { tool.value = 'move'; pickImage() }
})
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
  const file = input.files?.[0]
  input.value = ''
  if (file) await insertImage(file)
}
/**
 * 이미지 넣기(도구 · 끌어 놓기 · 붙여넣기 공용). at 이 있으면 그 캔버스 좌표에, 없으면 고른 화면 가운데(없으면 보이는 캔버스 가운데)에.
 * at 이 Iris 화면 위면 그 화면 안으로, 아니면 캔버스 위로 들어가요.
 */
async function insertImage(file: File, at?: { x: number; y: number }, place?: { sid: string; parentId: string | null }) {
  if (!isMediaFile(file)) return say(tr('Only image or video files can be added'))
  if (file.size > mediaLimit(file)) return say(isVideoFile(file) ? tr('Videos must be smaller than 50MB') : tr('Images must be smaller than 10MB'))
  const hitScreen = at ? list.value.find((v) => v.source === 'native' && at.x >= v.x && at.y >= v.y && at.x <= v.x + v.width && at.y <= v.y + v.height) : null
  const s = (place ? list.value.find((v) => v.id === place.sid) : null) ?? (at ? hitScreen : current.value) ?? canvasScreen.value
  if (!s) return
  try {
    const img = await uploadImage(file, s.id.replace(':', '-'), { supabase, preview })
    if (replaceId && !at) { const target = store.screenId.value ?? s.id; const id = replaceId; replaceId = null; store.update(target, [id], { src: img.src }); return }
    const onCanvas = isPageCanvas(s.id)
    // 원래 픽셀 크기 그대로(피그마와 같아요). 프레임보다 크면 프레임이 잘라 보여요
    const parentId = place?.sid === s.id ? place.parentId : null
    const w = Math.max(1, Math.round(img.w)), h = Math.max(1, Math.round(img.h))
    let cx: number, cy: number
    if (at) { cx = Math.round(at.x - (onCanvas ? 0 : s.x)); cy = Math.round(at.y - (onCanvas ? 0 : s.y)) }
    else if (onCanvas) { cx = Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom); cy = Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) }
    else { cx = Math.round(s.width / 2); cy = Math.round(s.height / 2) }
    const p0 = parentId ? store.absPos(s.id, parentId) : { x: 0, y: 0 }
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || (img.video ? 'Video' : 'Image')
    store.add(s.id, parentId, { type: 'image', name, src: img.src, x: cx - p0.x - Math.round(w / 2), y: cy - p0.y - Math.round(h / 2), w, h, lockRatio: true })
    tab.value = 'design'
  } catch { say(isVideoFile(file) ? tr('Couldn\'t upload the video. Try again') : tr('Couldn\'t upload the image. Try again')) }
}
/** 캔버스에 파일 끌어 놓기: 이미지 · 영상. 놓은 화면 · 프레임 안으로 */
async function onDropFiles(files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }) {
  const media = files.filter(isMediaFile)
  if (!media.length) return say(tr('Only image or video files (PNG, JPG, SVG, MP4…) can be added'))
  for (const [i, f] of media.entries()) await insertImage(f, { x: at.x + i * 24, y: at.y + i * 24 }, place)
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
  }
}
/** SVG 코드 → 'svg' 프레임 안 벡터 레이어들. 고른 Iris 화면(없으면 캔버스) 가운데에. 실패하면 false */
function importSvgVectors(text: string, at?: { x: number; y: number }): boolean {
  const r = importSvg(text)
  if (!r) return false
  const s = (at ? null : current.value?.source === 'native' ? current.value : null) ?? canvasScreen.value
  if (!s) return false
  const onCanvas = isPageCanvas(s.id)
  const k = 1 // SVG 도 원래 크기 그대로
  const w = r.w * k, h = r.h * k
  const c = at ?? (onCanvas ? { x: Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom), y: Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) } : { x: s.width / 2, y: s.height / 2 })
  const r2 = (v: number) => Math.round(v * 100) / 100
  store.insertTree(s.id, null, { type: 'frame', name: 'svg', x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w: r2(w), h: r2(h), style: { fill: undefined, clip: false } },
    r.layers.map((l) => ({ type: 'vector' as const, name: l.name, x: r2(l.x * k), y: r2(l.y * k), w: r2(l.w * k), h: r2(l.h * k), vnet: l.vnet, evenodd: l.evenodd || undefined, style: { fill: l.fill, stroke: l.stroke, strokeWidth: l.strokeWidth ? r2(l.strokeWidth * k) : undefined, opacity: l.opacity } })))
  tab.value = 'design'
  return true
}
onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
// 저장이 끝나기 전에 떠나면 알리기
function onBeforeUnload(e: BeforeUnloadEvent) { if (store.saveState.state === 'saving' || store.saveState.state === 'error') { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => { window.removeEventListener('beforeunload', onBeforeUnload); store.flushAll() })

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
  catch { say(tr('Couldn\'t copy the link')) }
}

const zoomOpen = ref(false)
const projMenu = ref(false)
const settingsOpen = ref(false)
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
const confirmCancel = ref<{ $el?: HTMLElement } | null>(null)
watch(confirmPage, (v) => { if (v) nextTick(() => confirmCancel.value?.$el?.focus?.()) })
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })
// 숫자 칸 계산식(784-6 → 778)
useMathInputs()
// 수치 칸 앞쪽을 좌우로 끌어 값 바꾸기: 끄는 동안은 기록 하나로 묶어요
let scrubSids: string[] = []
useScrub(
  () => { scrubSids = [...new Set([current.value?.id, canvasScreen.value?.id].filter((v): v is string => !!v))]; scrubSids.forEach((s) => store.hold(s)) },
  () => { scrubSids.forEach((s) => store.release(s)); scrubSids = [] },
)

// 문서는 왼쪽 사이드바 Docs 탭에서 열어요(오른쪽 위 '문서' 토글은 뺐어요)
const screenName = (id: string) => allScreens.data.value?.find((s) => s.id === id)?.name ?? list.value.find((s) => s.id === id)?.name ?? tr('Frame')
// 디자인 탭 Status 드롭다운(InspectorDesign)과 같은 영어 라벨
const STATUS_BADGE: Record<ScreenRow['status'], string> = { draft: 'In progress', review: 'Ready for review', approved: 'Approved' }
</script>

<template>
  <div class="editor">
    <EditorCanvas
      ref="canvas"
      v-model:tool="tool"
      v-model:viewport="vp"
      v-model:multi="multiScreens"
      :screens="canvasList"
      :background="currentPage?.viewport?.background ?? null"
      :pixel-grid="currentPage?.viewport?.pixelGrid !== false"
      :highlight="highlight"
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
            <div class="msep" role="separator" />
            <ThemeSwitch compact />
            <LangSwitch />
          </div>
        </div>
        <input v-if="projRenaming" v-select class="sqc txt-in rename prename" :value="project.data.value?.name ?? ''" :aria-label="tr('Project name')" maxlength="80" @blur="onProjRename" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="projRenaming = false">
        <span v-else class="tx-head ellipsis fname" :title="project.data.value?.name ? tr('{name} — double-click to rename', { name: project.data.value.name }) : undefined" @dblclick="projRenaming = true">{{ project.data.value?.name ?? '' }}</span>
        <span v-if="store.saveState.state === 'saving'" class="tx-meta save">{{ tr('Saving…') }}</span>
        <TextButton v-else-if="store.saveState.state === 'error'" size="s" color="red" class="save" @click="store.flushAll()">{{ tr('Couldn\'t save · Retry') }}</TextButton>
      </div>
      <div class="pbody">
      <div role="tablist" :aria-label="tr('Left sidebar')" class="seg tabs">
        <button v-for="t in [['file', 'File'], ['assets', 'Assets'], ['docs', 'Docs']] as const" :key="t[0]" role="tab" :aria-selected="left === t[0]" :class="['sq', 'seg-item', { on: left === t[0] }]" @click="left = t[0]; expandPanels()">{{ tr(t[1]) }}</button>
        <button class="sq hov fold" :aria-label="collapsed.left ? tr('Expand sidebars') : tr('Collapse sidebars')" :data-tip="collapsed.left ? tr('Expand sidebars') : tr('Collapse sidebars')" :aria-expanded="!collapsed.left" @click="togglePanel()"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M1.5 5h11" stroke="currentColor" stroke-width="1.2" /><path :d="collapsed.left ? 'M5 7.5l2 2 2-2' : 'M5 9.5l2-2 2 2'" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      </div>

      <template v-if="left === 'file'">
        <section class="pages">
          <div class="sec-h"><span>{{ tr('Pages') }}</span><button class="ib s24" :aria-label="tr('Add new page')" :title="tr('Add new page')" @click="onAddPage"><EditorIcon name="plus" /></button></div>
          <Skeleton v-if="pages.status.value === 'pending'" shape="text" />
          <template v-for="p in pages.data.value ?? []" :key="p.id">
            <input v-if="renaming === p.id" v-select class="sqc txt-in rename" :value="p.name" :aria-label="tr('Page name')" @blur="onRename(p.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = null">
            <button v-else :class="['sq', 'nav-item', 's', 'prow', { on: pageId === p.id }]" :title="p.name" @click="pageId = p.id" @dblclick="renaming = p.id" @keydown.f2.prevent="renaming = p.id" @contextmenu="pageMenu(p, $event)"><span class="ellipsis">{{ p.name }}</span></button>
          </template>
        </section>
        <section class="layers">
          <div class="sec-h"><span>{{ tr('Layers') }}</span></div>
          <LayerTree :screens="canvasScreen && store.doc(canvasScreen.id).rootIds.length ? [canvasScreen, ...list] : list" :multi="multiScreens" :canvas-id="canvasScreen?.id ?? null" @pick-screen="pickScreen" @toggle-screen="toggleScreen" @screen-action="onScreenAction" />
          <div v-if="screens.status.value === 'success' && !list.length" class="empty-col">
            <span class="tx-meta">{{ tr('No frames yet') }}</span>
            <TextButton size="s" color="blue" @click="tool = 'frame'">{{ tr('Draw frame') }}</TextButton>
          </div>
        </section>
      </template>

      <EditorAssets v-else-if="left === 'assets'" v-model:open="asset" :screen-ids="list.map((s) => s.id)" :screen-name="screenName" @pick-screen="(id: string) => pickScreen(id, true)" @insert="(name: string) => canvas?.insertInstance(name)" />

      <div v-else class="docs">
        <div class="sec-h"><span>{{ tr('Docs') }}</span><button class="ib s24" :aria-label="tr('Add doc')" :title="tr('Add doc')" @click="addDocOpen = true"><EditorIcon name="plus" /></button></div>
        <Skeleton v-if="docs.status.value === 'pending'" shape="text" />
        <div v-for="g in docGroups" :key="g.k" class="dgroup">
          <span class="nav-label">{{ g.label }}</span>
          <button v-for="d in g.items" :key="d.id" :class="['sq', 'nav-item', 's', 'drow', { on: docId === d.id }]" :title="d.title" :aria-current="docId === d.id ? 'true' : undefined" @click="showDoc(d.id)">
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
          <EditorIcon name="variable" :size="16" /><span class="f1">{{ tr('Variables') }}</span><EditorIcon name="chevron_right" :size="12" class="muted" />
        </button>
      </div>
      </div>
    </aside>

    <!-- 오른쪽 패널 -->
    <aside :aria-label="tr('Right sidebar')" :class="['sq', 'float', 'panel-right', { collapsed: collapsed.right && !hasPick && !docId }]">
      <!-- 맨 위: 나 · Share — 예전 떠 있던 알약을 사이드바에 합쳤어요(아래 구분선) -->
      <div class="panel-top r line-b">
        <MemberAvatar :size="24" :name="myName" :src="me?.avatar_url" :title="myName" />
        <span class="pill-acts">
          <Button size="s" type="primary" @click="share">{{ tr('Share') }}</Button>
        </span>
      </div>
      <!-- 문서 읽기 -->
      <template v-if="openDoc">
        <div class="panel-h line-b">
          <span class="tx-head flex-none">{{ tr('Docs') }}</span>
          <span class="tx-meta ellipsis f1">{{ current ? tr('Viewing with {name}', { name: current.name }) : '' }}</span>
          <button class="ib s24" :aria-label="tr('Close doc')" :title="tr('Close doc')" @click="closeDoc"><EditorIcon name="close" /></button>
        </div>
        <div class="scroll reader">
          <DocReader :doc="openDoc" :reqs="docReqs" :highlight="docReq" compact @pick-req="(id: string) => (docReq = docReq === id ? null : id)" @create-req="onCreateReq" />
        </div>
      </template>

      <!-- 인스펙터 -->
      <template v-else>
        <div role="tablist" :aria-label="tr('Properties tabs')" class="seg tabs">
          <button v-for="t in [['design', 'Design'], ['plan', 'Plan'], ['dev', 'Dev']] as const" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]; expandPanels()">{{ tr(t[1]) }}</button>
          <div class="zoom-wrap">
            <button class="sq hov zoom" :aria-label="tr('Zoom')" :aria-expanded="zoomOpen" @click="zoomOpen = !zoomOpen"><span class="num">{{ Math.round(vp.zoom * 100) }}%</span><EditorIcon name="chevron_down" :size="12" class="muted" /></button>
            <div v-if="zoomOpen" class="sq menu zmenu" role="menu" @click="zoomOpen = false">
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom * 1.25)"><span class="f1">{{ tr('Zoom in') }}</span><span class="tx-meta">⌘+</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom / 1.25)"><span class="f1">{{ tr('Zoom out') }}</span><span class="tx-meta">⌘−</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.fit()"><span class="f1">{{ tr('Zoom to fit') }}</span><span class="tx-meta">⇧1</span></button>
              <button v-if="selected" class="sq menu-item" role="menuitem" @click="canvas?.fitSelection()"><span class="f1">{{ tr('Zoom to selection') }}</span><span class="tx-meta">⇧2</span></button>
              <div class="msep" role="separator" />
              <button v-for="z in ZOOMS" :key="z" class="sq menu-item num" role="menuitem" @click="canvas?.zoomAt(z)">{{ tr('Zoom to {n}%', { n: z * 100 }) }}</button>
            </div>
          </div>
          <!-- 보기 설정(피그마 보기 메뉴에서 Iris 가 그리는 것만). 나머지는 PRD/07 §20 -->
          <div class="view-wrap">
            <button class="sq hov fold" :aria-label="tr('View settings')" :data-tip="tr('View settings')" aria-haspopup="menu" :aria-expanded="viewOpen" @click="viewOpen = !viewOpen"><EditorIcon name="setting" :size="16" /></button>
            <div v-if="viewOpen" class="sq menu zmenu vmenu" role="menu" @click="viewOpen = false">
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="currentPage?.viewport?.pixelGrid !== false" @click="onPageSettings({ pixelGrid: currentPage?.viewport?.pixelGrid === false })"><EditorIcon name="check" :size="12" :class="['zck', { off: currentPage?.viewport?.pixelGrid === false }]" /><span class="f1">{{ tr('Pixel grid') }}</span></button>
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="gridsShown" @click="gridsShown = !gridsShown"><EditorIcon name="check" :size="12" :class="['zck', { off: !gridsShown }]" /><span class="f1">{{ tr('Layout grids') }}</span><span class="tx-meta">⌃G</span></button>
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
            <span class="tx-meta">{{ current.source === 'figma' ? tr('Figma frame') : tr('Iris frame') }} · <span class="num">{{ Math.round(current.width) }} × {{ Math.round(current.height) }}</span></span>
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
              <InspectorDesign :screen="multiList[0]!" :multi="multiList" @update="onUpdateMany" @arrange="onArrangeScreens" />
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
          <InspectorPage :page="currentPage" :zoom="vp.zoom" :screen-count="list.length" @rename="(n: string) => currentPage && renamePage(currentPage.id, n).catch(() => say(tr('Couldn\'t rename the page')))" @settings="onPageSettings" @zoom="(z: number | 'fit') => (z === 'fit' ? canvas?.fit() : canvas?.zoomAt(z))" />
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
      <Transition name="toast"><div v-if="toast" class="sq toast">{{ toast }}</div></Transition>
    </div>

    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime" class="sr" tabindex="-1" aria-hidden="true" @change="onImageFile">
    <AppCommandPalette />
    <ProjectModal v-model:open="settingsOpen" :project-id="projectId" @removed="navigateTo('/')" />
    <AddDocModal v-model:open="addDocOpen" :project-id="projectId" @created="onDocCreated" />
    <FigmaLinkModal v-if="pageId" v-model:open="figmaOpen" :page-id="pageId" :next-x="nextX" @created="onFigmaCreated" />
    <EditorVariables v-if="varsOpen" @close="varsOpen = false" />
    <ContextMenu />
    <div v-if="confirmPage" class="pg-dim" @click.self="confirmPage = null">
      <div class="sq float pg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pg-del-t" aria-describedby="pg-del-d">
        <span id="pg-del-t" class="tx-head">{{ tr('Delete "{name}"?', { name: confirmPage.name }) }}</span>
        <span id="pg-del-d" class="pg-desc">{{ confirmPage.count >= 0 ? tr('All frames and layers on this page will be deleted ({n} frames). This can\'t be undone.', { n: confirmPage.count }) : tr('All frames and layers on this page will be deleted. This can\'t be undone.') }}</span>
        <span class="pg-row"><Button ref="confirmCancel" size="s" type="tertiary" @click="confirmPage = null">{{ tr('Cancel') }}</Button><Button size="s" type="destructed" @click="doRemovePage">{{ tr('Delete page') }}</Button></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor { height: calc(100vh - var(--iris-tabs-h, 0px)); position: relative; overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.canvas-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 280px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-10) var(--ref-spacing-11); text-align: center; pointer-events: none; }
.ce-sub { color: var(--sys-color-neutral-600); }
.canvas-empty .row { display: flex; gap: var(--ref-spacing-06); margin-top: var(--ref-spacing-06); pointer-events: auto; }
.save { margin-left: auto; flex: none; padding-right: var(--ref-spacing-04); }
/* 사이드바 맨 위 줄(파일 줄 · 나 · Docs · Share): 높이 40, 아래 구분선 1px 로 탭 줄과 나눠요 — 예전 위에 따로 떠 있던 알약 둘을 합쳤어요 */
.panel-top { flex: none; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); position: relative; z-index: 2; }
.panel-top.r { padding: 0 var(--ref-spacing-06); }
/* 왼쪽 패널 본문: 메인 메뉴(검은 메뉴)가 접힌 패널 밖으로도 보이게 패널은 넘침을 보이고, 본문만 잘라요 */
.pbody { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
/* 좌측 패널 맨 아래 Variables: 위 구분선 + 안쪽 6 · 8 여백 안에 행 32(모서리 6, 호버 · 연 상태 회색) — 패널 둥근 모서리 밖으로 칠이 나가지 않게 */
.vars-foot { flex: none; margin-top: auto; padding: var(--ref-spacing-05) var(--ref-spacing-06) var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.vars-btn { display: flex; align-items: center; gap: var(--ref-spacing-04); width: 100%; height: 32px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); text-align: left; }
.vars-btn:hover, .vars-btn.on { --sq-fill: var(--sys-color-neutral-100); }
.vars-btn .muted { color: var(--sys-color-neutral-500); }
.home-wrap { position: relative; flex: none; }
.pmenu { left: 0; right: auto; width: 232px; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.panel-left { position: absolute; left: var(--iris-gap); top: var(--iris-gap); bottom: var(--iris-gap); width: 264px; display: flex; flex-direction: column; z-index: 4; overflow: visible; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
/* 접기: 아래 변이 위로 올라가서 맨 위 줄(40) + 탭 줄(42)만 남아요 */
.panel-left.collapsed, .panel-right.collapsed { bottom: calc(100% - var(--iris-gap) - 40px - 42px); }
.fold { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-500); margin-left: var(--ref-spacing-02); }
.panel-left .fold { margin-left: auto; }
.fold:hover, .fold[aria-expanded="true"]:not(.panel-left .fold) { color: var(--sys-color-neutral-800); }
.pill-acts { margin-left: auto; display: flex; align-items: center; gap: var(--ref-spacing-04); }
.panel-h { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); height: 42px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); }
.panel-right { position: absolute; right: var(--iris-gap); top: var(--iris-gap); bottom: var(--iris-gap); width: 288px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
.tabs { padding: var(--ref-spacing-06); flex: none; }
.line-b { box-shadow: 0 1px 0 var(--iris-line); }
/* 왼쪽 패널 열: 행 바탕은 패널 안쪽 8(탭 줄과 같아요), 글자 · 섹션 제목 · ▸ 는 x 16+8 한 줄에 맞춰요 */
.pages { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); box-shadow: inset 0 -1px 0 var(--iris-line); flex: none; max-height: 40%; overflow: auto; }
.pages > .sec-h, .layers > .sec-h, .docs > .sec-h { flex: none; height: 32px; padding: 0 0 0 var(--ref-spacing-06); }
.prow, .drow { padding: 5px var(--ref-spacing-06); }
.prow { min-width: 0; }
.ib.s24 { width: 24px; height: 24px; }
/* 페이지 이름 바꾸기: 피그마처럼 흰 바탕 + 1px 파란 선, 글자 자리 그대로(x+8), 행 28 안에 24 */
.rename, .rename:focus { flex: none; margin: 2px 0; height: 24px; padding: 0 7px; background: var(--sys-color-common-white-emphasis); box-shadow: inset 0 0 0 1px var(--sys-color-brand-primary-default); }
/* 프로젝트 이름 칸: 알약 안 남은 폭을 다 써요. 글자는 이름과 같은 12/600, 안쪽 여백만큼 왼쪽으로 당겨 글자 자리가 그대로예요 */
.prename, .prename:focus { flex: 1 1 auto; min-width: 0; margin: 0 0 0 -7px; font-size: 12px; font-weight: 600; }
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
.zoom { display: flex; align-items: center; gap: var(--ref-spacing-02); height: 24px; box-sizing: border-box; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
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
.scroll { flex: 1; min-height: 0; overflow: auto; }
.reader { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-16); }
.none { padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
.toast-wrap { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 10; pointer-events: none; }
/* 라이트 · 다크 모두 어두운 토스트(neutral-800 · white 토큰은 다크에서 뒤집혀서 고정값을 써요). 다크에선 옅은 흰 테두리로 캔버스와 구분 */
.toast { display: flex; align-items: center; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--iris-black); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--iris-paper); font-weight: 500; white-space: nowrap; filter: var(--iris-float-shadow); }
/* 피그마 UI3 토스트: 도구 막대 바로 위, 3초, 애니메이션 없이 바로 나타나고 사라져요 */
.pg-dim { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; background: var(--dimmed-bg, rgb(0 0 0 / 40%)); }
.pg-confirm { width: 320px; box-sizing: border-box; padding: var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-default); }
.pg-desc { color: var(--sys-color-neutral-600); }
.pg-row { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-06); }
</style>
