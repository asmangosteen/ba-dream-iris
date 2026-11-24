<script setup lang="ts">
import { Avatar, Button, Icon, IconButton, Skeleton, TextButton } from '@ba-dream/design-system'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import InspectorPlan from '~/components/editor/InspectorPlan.vue'
import InspectorDev from '~/components/editor/InspectorDev.vue'
import InspectorDesign from '~/components/editor/InspectorDesign.vue'
import ContextMenu from '~/components/editor/ContextMenu.vue'
import { importSvg } from '~/canvas/vector'
import InspectorLayer from '~/components/editor/InspectorLayer.vue'
import InspectorPage from '~/components/editor/InspectorPage.vue'
import InspectorScreens from '~/components/editor/InspectorScreens.vue'
import { arrangeRects, type ArrangeOp } from '~/canvas/geom'
import LayerTree from '~/components/editor/LayerTree.vue'
import { createLayerStore, LAYER_STORE } from '~/canvas/store'
import { isMediaFile, isVideoFile, mediaLimit, uploadImage } from '~/canvas/images'
import EditorAssets from '~/components/editor/EditorAssets.vue'
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
// 좌우 사이드바 접기(위로 접혀서 탭 줄만 남아요). 이 브라우저에 기억
const collapsed = ref<{ left: boolean; right: boolean }>({ left: false, right: false })
onMounted(() => { try { const v = JSON.parse(localStorage.getItem('iris-panels') ?? '{}'); collapsed.value = { left: !!v.left, right: !!v.right } } catch { /* 저장소를 못 쓰면 펼친 채로 */ } })
function togglePanel(k: 'left' | 'right') {
  collapsed.value = { ...collapsed.value, [k]: !collapsed.value[k] }
  try { localStorage.setItem('iris-panels', JSON.stringify(collapsed.value)) } catch { /* 기억만 못 해요 */ }
}
// 페이지 우클릭 메뉴 · 지우기 확인
const pageCtx = useContextMenu()
const confirmPage = ref<{ id: string; name: string; count: number } | null>(null)
function pageMenu(p: { id: string; name: string }, e: MouseEvent) {
  pageCtx.open(e, [
    { label: 'Rename', action: () => (renaming.value = p.id) },
    'sep',
    { label: 'Delete page', danger: true, disabled: (pages.data.value?.length ?? 0) <= 1, action: () => (confirmPage.value = { id: p.id, name: p.name, count: p.id === pageId.value ? list.value.length : -1 }) },
  ])
}
async function doRemovePage() {
  const c = confirmPage.value
  confirmPage.value = null
  if (!c) return
  try { await removePage(c.id); say(`Deleted ${c.name}`) } catch { say('Couldn\'t delete the page. Try again') }
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
const docId = ref<string | null>(null)
const docReq = ref<string | null>(null)
const addDocOpen = ref(false)
const figmaOpen = ref(false)
const vp = ref<Viewport>({ x: 352, y: 94, zoom: 0.5 })
const canvas = ref<{ fit: (ids?: string[]) => void; zoomAt: (z: number) => void; fitSelection: () => void; insertInstance: (name: string, at?: { x: number; y: number }) => void } | null>(null)
const plan = ref<{ openPicker: () => void } | null>(null)

const list = computed(() => screens.data.value ?? [])
/** 캔버스 위(화면 밖)에 그린 레이어: 페이지에 저장되는 가상 화면 하나로 다룹니다(좌표 = 캔버스 좌표) */
const canvasScreen = computed<ScreenRow | null>(() => {
  const p = pages.data.value?.find((x) => x.id === pageId.value)
  return p ? { id: pageCanvasId(p.id), name: 'Canvas', source: 'native', x: 0, y: 0, width: 0, height: 0, status: 'draft', layers: p.layers ?? null } : null
})
const currentPage = computed(() => pages.data.value?.find((x) => x.id === pageId.value) ?? null)
async function onPageSettings(patch: PageSettings) {
  const p = currentPage.value
  if (!p) return
  const before = { ...(p.viewport ?? {}) }
  try {
    await updatePageSettings(p.id, patch)
    store.pushAction(null, () => updatePageSettings(p.id, before), () => updatePageSettings(p.id, patch))
  } catch { say('Couldn\'t save page settings') }
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
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
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
  try { await addPage() } catch { say('Couldn\'t add a page. Try again') }
}
const renaming = ref<string | null>(null)
async function onRename(id: string, e: Event) {
  renaming.value = null
  try { await renamePage(id, (e.target as HTMLInputElement).value) } catch { say('Couldn\'t rename') }
}

const moveFrom = new Map<string, { x: number; y: number }>()
function onMove(id: string, x: number, y: number, done: boolean) {
  const s = list.value.find((v) => v.id === id)
  if (!s) return
  if (!done) { if (!moveFrom.has(id)) moveFrom.set(id, { x: s.x, y: s.y }); s.x = x; s.y = y; return }
  const from = moveFrom.get(id) ?? { x, y }
  moveFrom.delete(id)
  const fail = () => say('Couldn\'t save the position. Try again')
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
  const fail = () => say('Couldn\'t save the size. Try again')
  updateScreen(id, r).catch(fail)
  store.pushAction(id, () => updateScreen(id, from).catch(fail), () => updateScreen(id, r).catch(fail))
}
/** 여러 화면 정렬 · 균등 분배 · 간격 맞추기: 한 번에 실행취소 */
const multiScreens = ref<string[]>([])
const multiList = computed(() => multiScreens.value.map((id) => list.value.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
function onArrangeScreens(op: ArrangeOp) {
  const rows = multiList.value
  if (rows.length < 2) return
  const out = arrangeRects(rows.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })), op)
  const before = rows.map((s) => ({ id: s.id, x: s.x, y: s.y }))
  const after = rows.map((s, i) => ({ id: s.id, x: out[i]!.x, y: out[i]!.y })).filter((p, i) => p.x !== before[i]!.x || p.y !== before[i]!.y)
  if (!after.length) return
  const fail = () => say('Couldn\'t save the position. Try again')
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
  } catch { say('Couldn\'t create the frame. Try again') }
}
function onUpdate(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>) {
  const s = current.value
  if (!s) return
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof typeof patch]])) as typeof patch
  const fail = () => say('Couldn\'t save. Try again')
  // 크기가 바뀌면 맨 위 레이어들이 제약대로 따라와요(실행취소는 레이어 기록이 따로)
  if (s.source === 'native' && ((patch.width ?? s.width) !== s.width || (patch.height ?? s.height) !== s.height)) store.constrainRoot(s.id, s.width, s.height, patch.width ?? s.width, patch.height ?? s.height)
  updateScreen(s.id, patch).catch(fail)
  store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, patch).catch(fail))
}
async function onRemove() {
  if (!current.value) return
  const name = current.value.name
  try { await removeScreen(current.value.id); store.selectScreen(null); say(`Deleted ${name}`) } catch { say('Couldn\'t delete the frame') }
}
const nextX = computed(() => (list.value.length ? Math.max(...list.value.map((s) => s.x + s.width)) + 80 : 0))

// ---------------------------------------------------------------------------
// 화면 단위 단축키 (레이어 없이 화면만 골랐을 때): Delete · ⌘D · ⌘C/⌘V · 화살표
// ---------------------------------------------------------------------------
const screenClip = ref<string | null>(null)
/** 화면 복제: 레이어까지 그대로, 오른쪽(또는 지정한 자리)에 */
async function cloneScreen(srcId: string, at?: { x: number; y: number }) {
  const src = list.value.find((v) => v.id === srcId)
  if (!src) return null
  if (src.source !== 'native') { say('Figma frames can\'t be duplicated. Import it again from Figma'); return null }
  const rect = { x: at?.x ?? src.x + src.width + 40, y: at?.y ?? src.y, width: src.width, height: src.height }
  const row = await addScreen(rect, `${src.name} 사본`)
  if (!row) return null
  const layers = JSON.parse(JSON.stringify(store.doc(src.id)))
  await updateScreen(row.id, { layers })
  delete store.docs[row.id] // 새 레이어로 다시 읽기
  store.selectScreen(row.id)
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
async function onScreenAction(action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward', dx = 0, dy = 0) {
  const s = current.value
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
    if (action === 'copy' && s) { screenClip.value = s.id; say(`Copied ${s.name}`); return }
    if (action === 'paste') { if (screenClip.value) await cloneScreen(screenClip.value, spotRightOf(screenClip.value)); return }
    if (!s) return
    if (action === 'duplicate') { await cloneScreen(s.id); return }
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
        say(linked ? '요구사항이 연결된 화면이에요. 디자인 탭에서 확인하고 지워주세요' : '피그마 화면은 디자인 탭에서 확인하고 지워주세요')
        return
      }
      const snap = { rect: { x: s.x, y: s.y, width: s.width, height: s.height }, name: s.name, status: s.status, layers: JSON.parse(JSON.stringify(store.doc(s.id))) }
      let cur = s.id
      await removeScreen(cur)
      store.selectScreen(null)
      say(`Deleted ${s.name} · ⌘Z to undo`)
      store.pushAction(null, async () => {
        const r = await addScreen(snap.rect, snap.name)
        if (r) { cur = r.id; await updateScreen(r.id, { layers: snap.layers, status: snap.status }); delete store.docs[r.id]; store.selectScreen(r.id) }
      }, async () => { await removeScreen(cur); store.selectScreen(null) })
    }
  } catch { say('Something went wrong. Try again') }
}
async function onFigmaCreated() {
  await screens.refresh()
  say('Imported from Figma')
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
const docGroups = computed(() => {
  const order: DocCategory[] = ['planning', 'design', 'dev', 'etc']
  return order
    .map((k) => ({ k, label: DOC_CATEGORY_LABEL[k], items: (docs.data.value ?? []).filter((d) => d.category === k) }))
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
    say(current.value ? `${code}를 만들고 '${current.value.name}'에 연결했어요` : `${code}를 만들었어요`)
  } catch { say('Couldn\'t create the requirement. Try again') }
}
async function onDocCreated(id: string) {
  await Promise.all([docs.refresh(), reqs.refresh()])
  left.value = 'docs'
  showDoc(id)
}

// 주소로 들어온 경우: ?doc=&req= (요구사항 보드의 '원문'), ?screen= (화면 바로 열기)
onMounted(async () => {
  const q = route.query
  if (typeof q.doc === 'string') { left.value = 'docs'; showDoc(q.doc, typeof q.req === 'string' ? q.req : null) }
  if (typeof q.screen === 'string') { await until(() => !!allScreens.data.value); pickScreen(q.screen, true) }
  if (q.doc || q.screen) router.replace({ query: {} })
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
  if (s && s.source !== 'native') return say('Images can\'t be added to Figma frames')
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
  if (!isMediaFile(file)) return say('Only image or video files can be added')
  if (file.size > mediaLimit(file)) return say(isVideoFile(file) ? 'Videos must be smaller than 50MB' : 'Images must be smaller than 10MB')
  const hitScreen = at ? list.value.find((v) => v.source === 'native' && at.x >= v.x && at.y >= v.y && at.x <= v.x + v.width && at.y <= v.y + v.height) : null
  const s = (place ? list.value.find((v) => v.id === place.sid) : null) ?? (at ? hitScreen : current.value) ?? canvasScreen.value
  if (!s) return
  try {
    const img = await uploadImage(file, s.id.replace(':', '-'), { supabase, preview })
    if (replaceId && !at) { const target = store.screenId.value ?? s.id; const id = replaceId; replaceId = null; store.update(target, [id], { src: img.src }); return }
    const onCanvas = isPageCanvas(s.id)
    // 놓은 프레임 안이면 그 프레임 크기에 맞춰 줄여요
    const parentId = place?.sid === s.id ? place.parentId : null
    const pn = parentId ? store.node(s.id, parentId) : null
    const box = pn ? { w: pn.w, h: pn.h } : onCanvas ? null : { w: s.width, h: s.height }
    const k = box ? Math.min(1, (box.w * 0.9) / img.w, (box.h * 0.9) / img.h) : Math.min(1, 480 / img.w, 480 / img.h)
    const w = Math.max(1, Math.round(img.w * k)), h = Math.max(1, Math.round(img.h * k))
    let cx: number, cy: number
    if (at) { cx = Math.round(at.x - (onCanvas ? 0 : s.x)); cy = Math.round(at.y - (onCanvas ? 0 : s.y)) }
    else if (onCanvas) { cx = Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom); cy = Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) }
    else { cx = Math.round(s.width / 2); cy = Math.round(s.height / 2) }
    const p0 = parentId ? store.absPos(s.id, parentId) : { x: 0, y: 0 }
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || (img.video ? 'Video' : 'Image')
    store.add(s.id, parentId, { type: 'image', name, src: img.src, x: cx - p0.x - Math.round(w / 2), y: cy - p0.y - Math.round(h / 2), w, h, lockRatio: true })
    tab.value = 'design'
  } catch { say(isVideoFile(file) ? 'Couldn\'t upload the video. Try again' : 'Couldn\'t upload the image. Try again') }
}
/** 캔버스에 파일 끌어 놓기: 이미지 · 영상. 놓은 화면 · 프레임 안으로 */
async function onDropFiles(files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }) {
  const media = files.filter(isMediaFile)
  if (!media.length) return say('Only image or video files (PNG, JPG, SVG, MP4…) can be added')
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
  const k = onCanvas ? Math.min(1, 480 / r.w, 480 / r.h) : Math.min(1, (s.width * 0.7) / r.w, (s.height * 0.5) / r.h)
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
    if (!current.value) return say('Select a frame on the canvas first')
    closeDoc(); tab.value = 'plan'; nextTick(() => plan.value?.openPicker())
  } else say('Comments are coming soon')
}

async function share() {
  try { await navigator.clipboard.writeText(location.origin + route.path); say('Link copied') }
  catch { say('Couldn\'t copy the link') }
}

const zoomOpen = ref(false)
const projMenu = ref(false)
const settingsOpen = ref(false)
const ZOOMS = [0.25, 0.5, 1, 2]
const { data: me } = useMe()
const myName = computed(() => me.value?.name || me.value?.email || '나')

// 메뉴: 바깥을 누르거나 Esc 로 닫기
function onDocPointer(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (projMenu.value && !t?.closest('.home-wrap')) projMenu.value = false
  if (zoomOpen.value && !t?.closest('.zoom-wrap')) zoomOpen.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !(projMenu.value || zoomOpen.value)) return
  projMenu.value = false
  zoomOpen.value = false
}
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })

// 오른쪽 위 '문서': 문서 읽기 패널을 열고 닫는 토글. 열 때는 마지막에 본 문서(없으면 첫 문서)
const lastDoc = ref<string | null>(null)
watch(docId, (v) => { if (v) lastDoc.value = v })
function toggleDocs() {
  if (docId.value) return closeDoc()
  left.value = 'docs'
  const all = docs.data.value ?? []
  const next = (lastDoc.value && all.some((d) => d.id === lastDoc.value) ? lastDoc.value : null) ?? docGroups.value[0]?.items[0]?.id
  if (next) showDoc(next)
}
const screenName = (id: string) => allScreens.data.value?.find((s) => s.id === id)?.name ?? list.value.find((s) => s.id === id)?.name ?? '화면'
const STATUS_BADGE: Record<ScreenRow['status'], string> = { draft: '작업 중', review: '검토 요청', approved: '확정' }
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
      @clone-screen="(id: string, x: number, y: number) => cloneScreen(id, { x, y })"
      @move="onMove"
      @resize-screen="onResizeScreen"
      @arrange-screens="onArrangeScreens"
      @create="onCreate"
      @hint="say"
      @screen-action="onScreenAction"
      @drop-files="onDropFiles"
    />
    <div v-if="screens.status.value === 'success' && !list.length" class="canvas-empty">
      <span class="tx-head">This page is empty</span>
      <span class="tx-meta">Draw a frame with the Frame tool (F) or import one from Figma</span>
      <span class="row">
        <Button size="s" type="tertiary" stroke @click="tool = 'frame'">Draw frame</Button>
        <Button size="s" type="tertiary" stroke @click="figmaOpen = true">Import from Figma</Button>
      </span>
    </div>

    <!-- 왼쪽 위: 파일 알약 -->
    <div class="sq float s pill-left">
      <div class="home-wrap">
        <button class="sq hov home" aria-label="Main menu" :aria-expanded="projMenu" @click="projMenu = !projMenu"><IrisLogo kind="symbol" :height="16" /><Icon name="chevron_down" :size="12" /></button>
        <div v-if="projMenu" class="sq menu pmenu" role="menu" @click="projMenu = false">
          <NuxtLink to="/" class="sq menu-item" role="menuitem">Back to files</NuxtLink>
          <button class="sq menu-item" role="menuitem" @click="settingsOpen = true">Project settings</button>
          <NuxtLink to="/requirements" class="sq menu-item" role="menuitem">Requirements board</NuxtLink>
          <NuxtLink to="/design-system" class="sq menu-item" role="menuitem">Design system</NuxtLink>
          <div class="psep" role="separator" />
          <ThemeSwitch />
        </div>
      </div>
      <span class="tx-head ellipsis">{{ project.data.value?.name ?? '' }}</span>
      <span v-if="store.saveState.state === 'saving'" class="tx-meta save">Saving…</span>
      <TextButton v-else-if="store.saveState.state === 'error'" size="s" color="red" class="save" @click="store.flushAll()">Couldn't save · Retry</TextButton>
    </div>

    <!-- 왼쪽 패널 -->
    <aside aria-label="Left sidebar" :class="['sq', 'float', 'panel-left', { collapsed: collapsed.left }]">
      <div role="tablist" aria-label="Left sidebar" class="seg tabs">
        <button v-for="t in [['file', 'File'], ['assets', 'Assets'], ['docs', 'Docs']] as const" :key="t[0]" role="tab" :aria-selected="left === t[0]" :class="['sq', 'seg-item', { on: left === t[0] }]" @click="left = t[0]; collapsed.left && togglePanel('left')">{{ t[1] }}</button>
        <button class="sq hov fold" :aria-label="collapsed.left ? 'Expand sidebar' : 'Collapse sidebar'" :title="collapsed.left ? 'Expand sidebar' : 'Collapse sidebar'" :aria-expanded="!collapsed.left" @click="togglePanel('left')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M1.5 5h11" stroke="currentColor" stroke-width="1.2" /><path :d="collapsed.left ? 'M5 7.5l2 2 2-2' : 'M5 9.5l2-2 2 2'" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      </div>

      <template v-if="left === 'file'">
        <section class="pages">
          <div class="sec-h"><span>Pages</span><IconButton size="s" type="ghost" icon-name="plus" ariaLabel="Add new page" @click="onAddPage" /></div>
          <Skeleton v-if="pages.status.value === 'pending'" shape="text" />
          <template v-for="p in pages.data.value ?? []" :key="p.id">
            <input v-if="renaming === p.id" class="sqc txt-in rename" :value="p.name" aria-label="Page name" autofocus @blur="onRename(p.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null">
            <button v-else :class="['sq', 'nav-item', 's', { on: pageId === p.id }]" :title="'Double-click to rename'" @click="pageId = p.id" @dblclick="renaming = p.id" @contextmenu="pageMenu(p, $event)">{{ p.name }}</button>
          </template>
        </section>
        <section class="layers">
          <span class="nav-label">Layers</span>
          <LayerTree :screens="canvasScreen && store.doc(canvasScreen.id).rootIds.length ? [canvasScreen, ...list] : list" @pick-screen="pickScreen" @screen-action="onScreenAction" />
          <div v-if="screens.status.value === 'success' && !list.length" class="empty-col">
            <span class="tx-meta">No frames yet</span>
            <TextButton size="s" color="blue" @click="tool = 'frame'">Draw frame</TextButton>
          </div>
        </section>
      </template>

      <EditorAssets v-else-if="left === 'assets'" v-model:open="asset" :screen-ids="list.map((s) => s.id)" :screen-name="screenName" @pick-screen="(id: string) => pickScreen(id, true)" @insert="(name: string) => canvas?.insertInstance(name)" />

      <div v-else class="docs">
        <div class="sec-h"><span>Docs</span><IconButton size="s" type="ghost" icon-name="plus" ariaLabel="Add doc" @click="addDocOpen = true" /></div>
        <Skeleton v-if="docs.status.value === 'pending'" shape="text" />
        <div v-for="g in docGroups" :key="g.k" class="dgroup">
          <span class="nav-label">{{ g.label }}</span>
          <button v-for="d in g.items" :key="d.id" :class="['sq', 'nav-item', 's', { on: docId === d.id }]" @click="showDoc(d.id)">
            <Icon :name="docIcon(d)" :size="12" class="flex-none" />
            <span class="ellipsis f1">{{ d.title }}</span>
            <span v-if="reqCount(d.id)" class="tx-meta num">{{ reqCount(d.id) }}</span>
            <Icon v-if="d.fetch_status === 'failed'" name="warning" :size="12" class="muted" />
          </button>
        </div>
        <div v-if="docs.status.value === 'success' && !docGroups.length" class="empty-col">
          <span class="tx-meta">No docs yet</span>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="plus" @click="addDocOpen = true">Add doc</Button>
        </div>
      </div>
    </aside>

    <!-- 오른쪽 위 알약 -->
    <div class="sq float s pill-right">
      <Avatar :size="24" :alt="myName" :title="myName" />
      <span class="pill-acts">
        <Button size="s" type="tertiary" :text-color="docId ? 'blue' : 'gray'" :class="['doc-toggle', { 'is-on': !!docId }]" :aria-pressed="!!docId" @click="toggleDocs">Docs</Button>
        <Button size="s" type="primary" @click="share">Share</Button>
      </span>
    </div>

    <!-- 오른쪽 패널 -->
    <aside aria-label="Right sidebar" :class="['sq', 'float', 'panel-right', { collapsed: collapsed.right && !docId }]">
      <!-- 문서 읽기 -->
      <template v-if="openDoc">
        <div class="panel-h line-b">
          <span class="tx-head flex-none">Docs</span>
          <span class="tx-meta ellipsis f1">{{ current ? `Viewing with ${current.name}` : '' }}</span>
          <IconButton size="s" type="ghost" icon-name="close" ariaLabel="Close doc" @click="closeDoc" />
        </div>
        <div class="scroll reader">
          <DocReader :doc="openDoc" :reqs="docReqs" :highlight="docReq" compact @pick-req="(id: string) => (docReq = docReq === id ? null : id)" @create-req="onCreateReq" />
        </div>
      </template>

      <!-- 인스펙터 -->
      <template v-else>
        <div role="tablist" aria-label="Properties tabs" class="seg tabs">
          <button v-for="t in [['design', 'Design'], ['plan', 'Plan'], ['dev', 'Dev']] as const" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]; collapsed.right && togglePanel('right')">{{ t[1] }}</button>
          <div class="zoom-wrap">
            <button class="sq hov zoom" aria-label="Zoom" :aria-expanded="zoomOpen" @click="zoomOpen = !zoomOpen"><span class="num">{{ Math.round(vp.zoom * 100) }}%</span><Icon name="chevron_down" :size="12" class="muted" /></button>
            <div v-if="zoomOpen" class="sq menu zmenu" role="menu" @click="zoomOpen = false">
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom * 1.25)"><span class="f1">Zoom in</span><span class="tx-meta">⌘ +</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom / 1.25)"><span class="f1">Zoom out</span><span class="tx-meta">⌘ −</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.fit()"><span class="f1">Zoom to fit</span><span class="tx-meta">⇧ 1</span></button>
              <button v-if="selected" class="sq menu-item" role="menuitem" @click="canvas?.fitSelection()"><span class="f1">Zoom to selection</span><span class="tx-meta">⇧ 2</span></button>
              <button v-for="z in ZOOMS" :key="z" class="sq menu-item num" role="menuitem" @click="canvas?.zoomAt(z)">{{ z * 100 }}%</button>
            </div>
          </div>
          <button class="sq hov fold" :aria-label="collapsed.right ? 'Expand sidebar' : 'Collapse sidebar'" :title="collapsed.right ? 'Expand sidebar' : 'Collapse sidebar'" :aria-expanded="!collapsed.right" @click="togglePanel('right')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M1.5 5h11" stroke="currentColor" stroke-width="1.2" /><path :d="collapsed.right ? 'M5 7.5l2 2 2-2' : 'M5 9.5l2-2 2 2'" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        </div>

        <template v-if="current">
          <div v-if="tab !== 'design'" class="obj">
            <div class="obj-row">
              <span class="tx-head ellipsis">{{ current.name }}</span>
              <span class="sq badge">{{ STATUS_BADGE[current.status] }}</span>
            </div>
            <span class="tx-meta">{{ current.source === 'figma' ? 'Figma frame' : 'Iris frame' }} · <span class="num">{{ Math.round(current.width) }} × {{ Math.round(current.height) }}</span></span>
          </div>
          <div class="scroll">
            <InspectorPlan v-if="tab === 'plan'" ref="plan" :key="current.id" :project-id="projectId" :screen="current" @open-doc="(id: string, req?: string) => showDoc(id, req)" @toast="say" @add-doc="addDocOpen = true" />
            <InspectorDev v-else-if="tab === 'dev'" :screen="current" @synced="screens.refresh()" @open-asset="(id: string) => { left = 'assets'; asset = id }" @toast="say" />
            <InspectorLayer v-else-if="store.layerIds.value.length" :screen="current" @replace-image="pickImage" />
            <InspectorScreens v-else-if="multiList.length > 1" :screens="multiList" @arrange="onArrangeScreens" />
            <InspectorDesign v-else :screen="current" @update="onUpdate" @remove="onRemove" />
          </div>
        </template>
        <!-- 캔버스 위 레이어를 골랐을 때: 디자인 속성만 -->
        <div v-else-if="canvasScreen && selected === canvasScreen.id && store.layerIds.value.length" class="scroll">
          <InspectorLayer :screen="canvasScreen" @replace-image="pickImage" />
        </div>
        <!-- 아무것도 안 골랐을 때: 피그마의 Page 패널처럼 페이지 · 캔버스 설정 -->
        <div v-else-if="tab === 'design' && currentPage" class="scroll">
          <InspectorPage :page="currentPage" :zoom="vp.zoom" :screen-count="list.length" @rename="(n: string) => currentPage && renamePage(currentPage.id, n).catch(() => say('Couldn\'t rename the page'))" @settings="onPageSettings" @zoom="(z: number | 'fit') => (z === 'fit' ? canvas?.fit() : canvas?.zoomAt(z))" />
        </div>
        <div v-else class="none">
          <span class="tx-head">Select a frame</span>
          <span class="tx-meta">Select a frame on the canvas or in Layers to see its requirements, design and dev info here</span>
          <TextButton v-if="list.length" size="s" color="blue" class="self-start" @click="pickScreen(list[0]!.id, true)">Select first frame</TextButton>
          <dl class="sq keys">
            <dt>Pan</dt><dd>Space + drag · H</dd>
            <dt>Zoom</dt><dd>⌘ + scroll · pinch</dd>
            <dt>Zoom to fit</dt><dd>⇧ 1</dd>
          </dl>
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
    <ContextMenu />
    <div v-if="confirmPage" class="pg-dim" @click.self="confirmPage = null" @keydown.esc="confirmPage = null">
      <div class="sq float pg-confirm" role="alertdialog" aria-labelledby="pg-del-t">
        <span id="pg-del-t" class="tx-head">Delete "{{ confirmPage.name }}"?</span>
        <span class="tx-meta">All frames and layers on this page will be deleted{{ confirmPage.count >= 0 ? ` (${confirmPage.count} frames)` : '' }}. This can't be undone.</span>
        <span class="pg-row"><Button size="s" type="tertiary" @click="confirmPage = null">Cancel</Button><Button size="s" type="destructed" @click="doRemovePage">Delete page</Button></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor { height: 100vh; position: relative; overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.canvas-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-02); pointer-events: none; }
.canvas-empty .row { display: flex; gap: var(--ref-spacing-06); margin-top: var(--ref-spacing-06); pointer-events: auto; }
.save { margin-left: auto; flex: none; padding-right: var(--ref-spacing-04); }
.pill-left { position: absolute; left: var(--iris-gap); top: var(--iris-gap); width: 264px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); z-index: 4; }
.home-wrap { position: relative; flex: none; }
.psep { height: 1px; margin: var(--ref-spacing-02) 0; background: var(--iris-line); }
.pmenu { left: 0; right: auto; width: 232px; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.panel-left { position: absolute; left: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 264px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
/* 접기: 아래 변이 위로 올라가서 탭 줄(42px)만 남아요 */
.panel-left.collapsed, .panel-right.collapsed { bottom: calc(100% - 56px - 42px); }
.fold { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-500); margin-left: var(--ref-spacing-02); }
.panel-left .fold { margin-left: auto; }
.fold:hover { color: var(--sys-color-neutral-800); }
.pill-right { position: absolute; right: var(--iris-gap); top: var(--iris-gap); width: 288px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); z-index: 3; }
.pill-acts { margin-left: auto; display: flex; align-items: center; gap: var(--ref-spacing-04); }
.bd-button.doc-toggle.is-on { --bd-btn-bg: var(--sys-color-brand-primary-lightest); }
.panel-h { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); height: 42px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); }
.panel-right { position: absolute; right: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 288px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; transition: bottom 0.24s cubic-bezier(0.2, 0, 0, 1); }
.tabs { padding: var(--ref-spacing-06); flex: none; }
.line-b { box-shadow: 0 1px 0 var(--iris-line); }
.pages { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); flex: none; max-height: 40%; overflow: auto; }
.pages .sec-h, .docs > .sec-h { padding: 0 var(--ref-spacing-02) 0 var(--ref-spacing-08); }
.rename { margin: 1px 0; height: 28px; }
.layers { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: var(--ref-spacing-10) var(--ref-spacing-04); }
.layers .nav-label { padding-bottom: var(--ref-spacing-06); }
.docs { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: 0 var(--ref-spacing-04) var(--ref-spacing-10); }
.dgroup { display: flex; flex-direction: column; }
.dgroup .nav-label { color: var(--sys-color-neutral-500); font-weight: 500; }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-08); }
.flex-none { flex: none; }
.f1 { flex: 1; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.zoom-wrap { margin-left: auto; position: relative; }
.zoom { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-02) var(--ref-spacing-04); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.zmenu { left: auto; right: 0; width: 168px; }
.obj { flex: none; display: flex; flex-direction: column; padding: var(--ref-spacing-02) var(--ref-spacing-10) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.obj-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.badge { flex: none; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-weight: 500; }
.scroll { flex: 1; min-height: 0; overflow: auto; }
.reader { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-16); }
.none { padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
.keys { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--ref-spacing-02) var(--ref-spacing-08); margin: var(--ref-spacing-06) 0 0; padding: var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); }
.keys dt { color: var(--sys-color-neutral-500); }
.keys dd { margin: 0; color: var(--sys-color-neutral-700); }
.toast-wrap { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 10; pointer-events: none; }
.toast { padding: var(--ref-spacing-05) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-weight: 500; white-space: nowrap; filter: drop-shadow(0 8px 16px rgb(3 9 26 / 16%)); }
.toast-enter-active, .toast-leave-active { transition: opacity .16s ease, transform .16s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(4px); }
.pg-dim { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; background: var(--dimmed-bg, rgb(0 0 0 / 40%)); }
.pg-confirm { width: 320px; padding: var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-default); }
.pg-row { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-06); }
</style>
