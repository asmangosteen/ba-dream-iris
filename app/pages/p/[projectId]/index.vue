<script setup lang="ts">
import { fmtNum } from '~/canvas/num'
import { guessReqLayers, matchReqLayers, reqLost } from '~/canvas/reqMatch'
import { topImagePaint } from '~/canvas/paint'
import { descendants, DEFAULT_STYLE, SCHEMA_VERSION, type LayerNode } from '~/canvas/schema'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import IrisLoading, { IRIS_LOADING_MIN } from '~/components/app/IrisLoading.vue'
import { Button, Skeleton, TextButton } from '@ba-dream/design-system'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import InspectorPlan from '~/components/editor/InspectorPlan.vue'
import KeyboardShortcuts from '~/components/editor/KeyboardShortcuts.vue'
import FramePresets from '~/components/editor/FramePresets.vue'
import InspectorDev from '~/components/editor/InspectorDev.vue'
import InspectorDesign from '~/components/editor/InspectorDesign.vue'
import { importSvg } from '~/canvas/vector'
import InspectorLayer from '~/components/editor/InspectorLayer.vue'
import InspectorScale from '~/components/editor/InspectorScale.vue'
import InspectorExport from '~/components/editor/InspectorExport.vue'
import InspectorPage from '~/components/editor/InspectorPage.vue'
import { arrangeRects, type ArrangeOp } from '~/canvas/geom'
import LayerTree from '~/components/editor/LayerTree.vue'
import { IRIS_CLIP, isFigmaClip, isMyClip, myLastClip, readIrisClip, setIrisDupHook, setIrisPasteHook, setIrisScreenSource, unsetIrisDupHook, unsetIrisPasteHook, unsetIrisScreenSource, useLastCopy, type IrisClipPayload, useMixScreens, useToastReq } from '~/composables/useLayerMenu'
import { createLayerStore, LAYER_STORE, type LayerClip } from '~/canvas/store'
import { isMediaFile, isVideoFile, mediaLimit, MediaTooLargeError, pendingUploads, prepareImage } from '~/canvas/images'
import EditorAssets from '~/components/editor/EditorAssets.vue'
import EditorVariables from '~/components/editor/EditorVariables.vue'
import FigmaLinkModal from '~/components/editor/FigmaLinkModal.vue'
import DocReader from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import ProjectModal from '~/components/project/ProjectModal.vue'
import ShareModal from '~/components/project/ShareModal.vue'
import AccessGate from '~/components/project/AccessGate.vue'
import ConflictDialog from '~/components/editor/ConflictDialog.vue'
import { ScreenConflict, pageCanvasId } from '~/composables/useEditor'
import CanvasPresence from '~/components/editor/CanvasPresence.vue'
import CommentLayer from '~/components/editor/CommentLayer.vue'
import CommentPanel from '~/components/editor/CommentPanel.vue'
import { useComments, type Thread, type CommentRow, type CommentArea } from '~/composables/useComments'
import PresenceStack from '~/components/editor/PresenceStack.vue'
import { ROLE_NAME } from '~/composables/useProjectAccess'
import AppCommandPalette from '~/components/app/CommandPalette.vue'
import type { Viewport } from '~/components/editor/canvas/types'
import type { PageSettings, ScreenCopySource, ScreenRow } from '~/composables/useEditor'
import { docIcon, DOC_CATEGORY_LABEL, type DocCategory } from '~/composables/useIrisData'

const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
const { project, pages, pageId, screens, liveScreens, rememberScreen, addPage, renamePage, removePage, setPageOrder, reorderScreen, setScreenOrder, updatePageSettings, addScreen, addScreenCopy, updateScreen, removeScreen } = useEditor(projectId)
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
// 보기 설정(오른쪽 패널 위 ⚙): 피그마 보기 메뉴 중 Iris 가 그리는 것 — Pixel grid · Layout grids · Rulers · Comments
const viewOpen = ref(false)
const gridsShown = useLayoutGridsShown()
const rulersShown = useState('iris-rulers', () => false)
/** 캔버스 코멘트(핀 · 영역) 보이기 — 보기 설정 'Comments' · ⇧C(피그마와 같아요). 끈 채로 코멘트 도구를 누르면 다시 켜져요 */
const pinsShown = useState('iris-comments-shown', () => true)
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
const canvas = ref<{ fit: (ids?: string[]) => void; viewWorld: () => { x: number; y: number; w: number; h: number } | null; zoomAt: (z: number) => void; fitSelection: (maxZoom?: number) => void; reveal: (sid: string, ids: string[]) => void; focusOn: (sid: string, ids: string[]) => void; insertInstance: (name: string, at?: { x: number; y: number }) => void; sectionScreens: (ids?: string[]) => void; paste: () => void } | null>(null)
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
  // 저장 충돌(다른 사람이 먼저 저장)은 실패가 아니라 묻기 — 충돌 창을 띄우고 저장 대기에서는 빼요
  save: async (sid, doc, edited) => {
    try { await updateScreen(sid, { layers: doc }) } catch (e) {
      if (!(e instanceof ScreenConflict)) throw e
      // 자동 저장(크기 재기 등)만 있었으면 묻지 않고 그 사람 것으로
      if (!edited) { store.loadRemote(sid, e.remote.layers); rememberScreen(sid, e.remote.updated_at, e.remote.layers); return }
      openConflict(e)
    }
  },
  tokens: computed(() => (tokens.data.value ?? []).map((t) => ({ name: t.name, value: t.value }))),
  onUnsaved: (sid, doc) => {
    if (backup.put(sid, doc)) { backupFailed = false; return }
    if (!backupFailed) say(tr('Couldn\'t keep your changes in this browser (storage is full). Keep this tab open until they\'re saved'), 6000)
    backupFailed = true
  },
  onSaved: (sid) => backup.drop(sid),
  onBlocked: () => blockEdit(),
})
provide(LAYER_STORE, store)
// 역할 · 보기 전용(PRD/12, 16 E): 디자인 편집 권한이 없으면 캔버스 · 디자인 패널을 잠가요(진짜로 막는 건 DB 규칙)
const access = useProjectAccess(projectId)
const readOnly = computed(() => access.data.status.value === 'success' && !access.can.value.editDesign && !access.gate.value)
watchEffect(() => { store.readonly.value = readOnly.value })
/** 권한 안내 화면이 떠 있나(그때는 코멘트 핀도 숨겨요) */
const gateActive = computed(() => !!access.gate.value)
// 저장 충돌(PRD/16 J-2): 같은 화면을 다른 사람이 먼저 저장했어요 — 그 사람 것 / 내 것
const members = useMembers()
const conflict = ref<{ sid: string; remote: ScreenConflict['remote'] } | null>(null)
const conflictBusy = ref(false)
function openConflict(e: ScreenConflict) { conflict.value = { sid: e.screenId, remote: e.remote } }
const conflictScreen = computed(() => (conflict.value ? list.value.find((x) => x.id === conflict.value!.sid) ?? null : null))
const conflictBy = computed(() => (members.data.value ?? []).find((m) => m.id === conflict.value?.remote.updated_by) ?? null)
async function keepMine() {
  const c = conflict.value
  if (!c) return
  conflictBusy.value = true
  try { await updateScreen(c.sid, { layers: JSON.parse(JSON.stringify(store.doc(c.sid))) }, { force: true }); conflict.value = null; say(tr('Saved your version')) } catch { sayFail(tr('Couldn\'t save. Try again')) }
  conflictBusy.value = false
}
function useTheirs() {
  const c = conflict.value
  if (!c) return
  store.loadRemote(c.sid, c.remote.layers)
  rememberScreen(c.sid, c.remote.updated_at, c.remote.layers)
  conflict.value = null
  say(tr('Switched to their version'))
}
// 실시간 반영: 다른 사람이 저장한 화면을 바로 받아요(내 저장 대기가 있는 화면은 저장할 때 충돌 창으로)
liveScreens((id, layers) => { if (store.hasPending(id)) return false; store.loadRemote(id, layers); return true })
// 코멘트(2단계): C 로 켜고 끄기, 켜면 캔버스를 눌러(또는 끌어 영역을 그려) 핀을 달아요
const comments = useComments(projectId)
const commentMode = ref(false)
const openThread = ref<string | null>(null)
const draft = ref<{ screenId: string | null; layerId: string | null; x: number; y: number; area: CommentArea | null } | null>(null)
const confirmThread = ref<CommentRow | null>(null)
const mentionPeople = computed(() => access.members.value.map((m) => ({ id: m.member_id, name: m.member?.name || m.member?.email || '?', avatar: m.member?.avatar_url ?? null, role: ROLE_NAME[m.role] })))
/** 코멘트 글쓴이 · 멘션 이름표: 지금 멤버 + 프로젝트를 나간 사람(워크스페이스 멤버 정보로 이름 · 사진을 그대로 — '이전 멤버'로 바꾸지 않아요) */
const commentAuthors = computed(() => {
  const list: { id: string; name: string; avatar?: string | null }[] = [...mentionPeople.value]
  for (const m of members.data.value ?? []) if (!list.some((p) => p.id === m.id)) list.push({ id: m.id, name: m.name || m.email, avatar: m.avatar_url ?? null })
  return list
})
/**
 * 오른쪽 패널을 코멘트 목록으로(피그마와 같아요): 코멘트 모드(도구 막대 · C)면 계속, 아니면 핀을 열었거나 새 코멘트를 쓰는 동안만 —
 * 캔버스 빈 곳을 누르면 스레드가 닫히고 원래 패널로 돌아와요
 */
const commentsShown = computed(() => commentMode.value || !!openThread.value || !!draft.value)
// 핀 · 스레드는 늘 보여요. 코멘트 모드는 '새 코멘트 달기'만: 커서가 말풍선으로 바뀌고 어디든 누르거나 끌면 달아요
watch(commentMode, (on) => { if (on) { tool.value = 'move'; following.value = null; pinsShown.value = true } else draft.value = null })
// 코멘트를 숨기면 코멘트 모드 · 열린 스레드 · 쓰던 새 코멘트도 함께 닫아요
watch(pinsShown, (on) => { if (!on) { commentMode.value = false; openThread.value = null; draft.value = null } })
/**
 * 코멘트 달기 커서: 흰 말풍선 + 진한 테두리(피그마 코멘트 커서 — 누르는 점 = 왼쪽 아래 뾰족한 끝).
 * 브라우저 이미지 커서는 화면이 계속 다시 그려질 때(다른 사람 커서 · 호버 표시) 움직이는 동안 화살표로 바뀌었다가 멈추면 돌아왔어요 →
 * 캔버스 위에서는 브라우저 커서를 숨기고(cursor: none) 같은 그림을 마우스 자리에 직접 그려요. 화면 다시 그리기를 거치지 않게 바로 옮겨요
 */
const cmCursor = ref<HTMLImageElement | null>(null)
function onCmCursorMove(e: PointerEvent) {
  const el = cmCursor.value
  if (!el) return
  const cv = canvasEl()
  const over = commentMode.value && !!cv && e.target instanceof Node && cv.contains(e.target)
  el.style.opacity = over ? '1' : '0'
  if (over) el.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 17}px)`
}
const hideCmCursor = () => { if (cmCursor.value) cmCursor.value.style.opacity = '0' }
onMounted(() => { window.addEventListener('pointermove', onCmCursorMove, { capture: true, passive: true }); document.documentElement.addEventListener('pointerleave', hideCmCursor) })
onBeforeUnmount(() => { window.removeEventListener('pointermove', onCmCursorMove, { capture: true }); document.documentElement.removeEventListener('pointerleave', hideCmCursor) })
watch(commentMode, (on) => { if (!on) hideCmCursor() })
/** 캔버스 섹션 · 프레임 레이어(페이지 캔버스)의 캔버스 위 자리 — 핀이 그 안에 있으면 그걸 기준으로 붙어 같이 움직여요 */
function layerBox(id: string) {
  if (!pageId.value) return null
  const d = store.doc(pageCanvasId(pageId.value))
  let n = d.nodes[id]
  if (!n) return null
  const w = n.w, h = n.h
  let x = 0, y = 0
  while (n) { x += n.x; y += n.y; n = n.parentId ? d.nodes[n.parentId] : undefined }
  return { x, y, w, h }
}
/** 캔버스 좌표 → 핀 기준: 맨 위 화면(프레임) → 가장 안쪽 캔버스 섹션 · 프레임 레이어 → 캔버스 */
function anchorAt(wx: number, wy: number): { screenId: string | null; layerId: string | null; ox: number; oy: number } {
  const s = [...list.value].reverse().find((v) => wx >= v.x && wx <= v.x + v.width && wy >= v.y && wy <= v.y + v.height)
  if (s) return { screenId: s.id, layerId: null, ox: s.x, oy: s.y }
  if (pageId.value) {
    const d = store.doc(pageCanvasId(pageId.value))
    const depth = (id: string) => { let k = 0, c = d.nodes[id]; while (c?.parentId) { k++; c = d.nodes[c.parentId] } return k }
    const hits = Object.values(d.nodes)
      .filter((n) => (n.type === 'section' || n.type === 'frame') && !n.hidden)
      .map((n) => ({ id: n.id, b: layerBox(n.id) }))
      .filter((v) => v.b && wx >= v.b.x && wx <= v.b.x + v.b.w && wy >= v.b.y && wy <= v.b.y + v.b.h)
      .sort((p, q) => depth(q.id) - depth(p.id))
    const top = hits[0]
    if (top?.b) return { screenId: null, layerId: top.id, ox: top.b.x, oy: top.b.y }
  }
  return { screenId: null, layerId: null, ox: 0, oy: 0 }
}
/** 새 영역 코멘트의 영역을 점으로 끌어 바꿨어요: 캔버스 좌표 → 그 코멘트 기준(화면 · 레이어 · 캔버스) 좌표 */
function setDraftArea(a: { x: number; y: number; w: number; h: number }) {
  const d = draft.value
  if (!d) return
  const s = d.screenId ? list.value.find((v) => v.id === d.screenId) : null
  const lb = !s && d.layerId ? layerBox(d.layerId) : null
  const ox = s?.x ?? lb?.x ?? 0, oy = s?.y ?? lb?.y ?? 0
  draft.value = { ...d, area: { x: a.x - ox, y: a.y - oy, w: a.w, h: a.h } }
}
/** 새 코멘트 · 옮긴 핀: 캔버스 좌표 핀 · 영역 → 기준 좌표 */
function placeAt(p: { x: number; y: number }, area: { x: number; y: number; w: number; h: number } | null) {
  const a = anchorAt(p.x, p.y)
  return { screenId: a.screenId, layerId: a.layerId, x: p.x - a.ox, y: p.y - a.oy, area: area ? { x: area.x - a.ox, y: area.y - a.oy, w: area.w, h: area.h } : null }
}
const toWorld = (e: { clientX: number; clientY: number }, el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left - vp.value.x) / vp.value.zoom, y: (e.clientY - r.top - vp.value.y) / vp.value.zoom } }
/** 새 코멘트 입력칸에 쓰던 게 있는지 · 바깥을 한 번 눌러 알려 줬는지 · 알려 주기 신호 */
const draftDirty = ref(false)
const draftWarned = ref(false)
const draftNudge = ref(0)
watch(draft, () => { draftWarned.value = false; if (!draft.value) draftDirty.value = false })
watch(draftDirty, () => { draftWarned.value = false })
/** 답글 입력칸도 같은 방식(열린 스레드가 바뀌면 처음부터) */
const replyDirty = ref(false)
const replyWarned = ref(false)
const replyNudge = ref(0)
watch(openThread, () => { replyWarned.value = false; replyDirty.value = false })
watch(replyDirty, () => { replyWarned.value = false })
/** 코멘트 커서로 끄는 중인 영역(캔버스 좌표) */
const drawing = ref<{ x: number; y: number; w: number; h: number } | null>(null)
/**
 * 캔버스를 누르면: 코멘트 모드면 그 자리에 새 코멘트(끌면 점선 영역 — 놓은 자리에 핀).
 * 코멘트 모드가 아니면 열린 스레드 · 새 코멘트를 닫아요(오른쪽 패널도 원래대로)
 */
function onCommentDown(e: PointerEvent) {
  if (e.button !== 0) return
  // 다른 창(알림 · 메뉴 · 팝오버 …)이 열려 있으면 이번 누름은 그 창 닫기만(utils/dismiss.ts) — 코멘트를 달지 않아요
  if (dismissPress(e)) return
  const el = canvasEl()
  if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return
  // 답글 · 새 코멘트에 쓰던 게 있으면(피그마와 같아요): 처음 누름은 글을 골라 흔들어 알려 주기만, 한 번 더 누르면 닫아요
  if (openThread.value && replyDirty.value && !replyWarned.value) { e.preventDefault(); e.stopPropagation(); replyWarned.value = true; replyNudge.value++; return }
  if (!commentMode.value && draft.value && draftDirty.value && !draftWarned.value) { e.preventDefault(); e.stopPropagation(); draftWarned.value = true; draftNudge.value++; return }
  if (!commentMode.value) { if (openThread.value || draft.value) { openThread.value = null; draft.value = null } return }
  e.preventDefault(); e.stopPropagation()
  // 피그마와 같아요: 열린 스레드가 있으면 이번 누름은 닫기만(새 코멘트는 한 번 더 눌러야)
  if (openThread.value) { openThread.value = null; return }
  // 새 코멘트에 쓰던 게 있으면: 처음엔 글을 골라 흔들어 알려 주고, 한 번 더 누르면 닫기만(새 입력칸은 안 생겨요)
  if (draft.value && draftDirty.value) {
    if (!draftWarned.value) { draftWarned.value = true; draftNudge.value++; return }
    draft.value = null
    return
  }
  // 빈 입력창이 열려 있어도 이번 누름은 닫기만(새 입력창은 한 번 더 눌러야 — 사용자 요청 2026-11-27)
  if (draft.value) { draft.value = null; return }
  const start = toWorld(e, el)
  let end = start
  const move = (ev: PointerEvent) => {
    end = toWorld(ev, el)
    const far = Math.hypot((end.x - start.x) * vp.value.zoom, (end.y - start.y) * vp.value.zoom) > 4
    drawing.value = far ? { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) } : null
  }
  const up = () => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    const area = drawing.value
    drawing.value = null
    draft.value = placeAt(area ? end : start, area)
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
onMounted(() => window.addEventListener('pointerdown', onCommentDown, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onCommentDown, true))
function onCommentKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); commentMode.value = !commentMode.value; return }
  // 코멘트 모드 중 도구 단축키(V K H F R L O P T · ⇧S ⇧L ⇧P)를 누르면 코멘트 모드를 끄고 그 도구로(툴바를 누를 때와 같아요) — 키는 그대로 캔버스로 넘겨요
  if (commentMode.value && !e.metaKey && !e.ctrlKey && !e.altKey && (e.shiftKey ? ['KeyS', 'KeyL', 'KeyP'] : ['KeyV', 'KeyK', 'KeyH', 'KeyF', 'KeyR', 'KeyL', 'KeyO', 'KeyP', 'KeyT']).includes(e.code)) commentMode.value = false
  // ⇧C: 코멘트 보이기 · 숨기기(피그마와 같아요)
  if (e.code === 'KeyC' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); pinsShown.value = !pinsShown.value; return }
  if (e.key === 'Escape' && (commentMode.value || openThread.value || draft.value)) {
    e.stopPropagation()
    if (draft.value) draft.value = null
    else if (openThread.value) openThread.value = null
    else commentMode.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onCommentKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onCommentKey, true))
async function createComment(body: string, mentions: string[], attachments: string[]) {
  const d = draft.value
  if (!d) return
  try {
    const row = await comments.create({ pageId: pageId.value, screenId: d.screenId, layerId: d.layerId, x: d.x, y: d.y, area: d.area }, body, mentions, attachments)
    draft.value = null; openThread.value = row.id
    // DB 업데이트 전이라 영역 없이 점 코멘트로 남겼어요
    if (d.area && comments.dbBehind.value) say(tr('Posted as a pin — area comments need a database update'))
  }
  catch { sayFail(tr('Couldn\'t post the comment. Try again')) }
}
async function replyComment(root: CommentRow, body: string, mentions: string[], attachments: string[]) {
  try { await comments.reply(root, body, mentions, attachments) } catch { sayFail(tr('Couldn\'t post the reply. Try again')) }
}
async function resolveComment(root: CommentRow, done: boolean) {
  try { await comments.resolve(root, done); if (done) { if (openThread.value === root.id) openThread.value = null; say(tr('Resolved comment')) } } catch { sayFail(tr('Something went wrong. Try again')) }
}
/** 모두 읽음으로(코멘트 패널 ⋯) */
function readAllComments() { for (const t of comments.threads.value) if (t.unread) comments.markRead(t.root.id) }
/** 핀을 끌어 놓으면: 놓은 자리의 화면 · 섹션 · 프레임 기준으로 다시 붙여요 */
async function moveComment(root: CommentRow, at: { x: number; y: number }, area: { x: number; y: number; w: number; h: number } | null) {
  try { await comments.movePin(root, placeAt(at, area)) } catch { sayFail(tr('Couldn\'t move the comment. Try again')) }
}
/** 글 고치기(내 글) */
async function editComment(c: CommentRow, body: string, mentions: string[]) {
  try { await comments.edit(c, body, mentions) } catch { sayFail(tr('Couldn\'t save. Try again')) }
}
/** 이모지 반응 넣기 · 빼기 */
async function reactComment(c: CommentRow, emoji: string) {
  try { await comments.react(c, emoji) } catch { sayFail(tr('Something went wrong. Try again')) }
}
/** 답글 하나 지우기(확인 창 뒤) */
const confirmMsg = ref<CommentRow | null>(null)
async function removeMsg() {
  const c = confirmMsg.value
  confirmMsg.value = null
  if (!c) return
  try { await comments.remove(c) } catch { sayFail(tr('Couldn\'t delete. Try again')) }
}
/** 읽지 않음으로 표시: 스레드를 닫아요(열려 있으면 바로 다시 읽음이 되니까) */
function unreadThread(root: CommentRow) { openThread.value = null; comments.markUnread(root.id); say(tr('Marked as unread')) }
/** 스레드 링크 복사: 열면 그 스레드로 바로(?comment=) */
async function copyCommentLink(root: CommentRow) {
  try { await navigator.clipboard.writeText(`${location.origin}/p/${projectId}?comment=${root.id}`); say(tr('Link copied')) } catch { sayFail(tr('Couldn\'t copy the link')) }
}
async function removeThread() {
  const r = confirmThread.value
  confirmThread.value = null
  if (!r) return
  try { await comments.remove(r); openThread.value = null } catch { sayFail(tr('Couldn\'t delete. Try again')) }
}
/** 목록 · 알림에서 스레드로: 그 페이지로 가서 핀이 보이게 옮기고 열어요 */
function goThread(t: Thread) {
  if (t.root.page_id && t.root.page_id !== pageId.value) pageId.value = t.root.page_id
  draft.value = null
  openThread.value = t.root.id
  comments.markRead(t.root.id)
  nextTick(() => {
    const s = list.value.find((v) => v.id === t.root.screen_id)
    const lb = !s && t.root.layer_id ? layerBox(t.root.layer_id) : null
    const wx = (s?.x ?? lb?.x ?? 0) + (t.root.x ?? 0), wy = (s?.y ?? lb?.y ?? 0) + (t.root.y ?? 0)
    const el = canvasEl()
    if (!el) return
    const r = el.getBoundingClientRect()
    const z = vp.value.zoom
    const px = vp.value.x + wx * z, py = vp.value.y + wy * z
    if (px < 280 || px > r.width - 680 || py < 80 || py > r.height - 120) vp.value = { ...vp.value, x: r.width / 2 - 160 - wx * z, y: r.height / 2 - wy * z }
  })
}
// 알림에서 왔을 때(?comment=스레드)
watch([() => route.query.comment, () => comments.threads.value.length, () => list.value.length], ([id]) => {
  if (typeof id !== 'string') return
  const t = comments.threads.value.find((x) => x.root.id === id)
  if (!t || (t.root.screen_id && !list.value.some((v) => v.id === t.root.screen_id) && t.root.page_id === pageId.value)) return
  goThread(t)
  router.replace({ query: { ...route.query, comment: undefined } })
}, { immediate: true })
// 함께 보는 중(PRD/16 J-1): 접속자 · 커서 · 따라가기
const editingAt = ref(0)
watch(() => store.saveState.state, (v) => { if (v === 'saving') editingAt.value = Date.now() })
const following = ref<string | null>(null)
const room = useRoom(projectId, { pageId, screenId: store.screenId, editingAt, following })
function canvasEl() { return document.querySelector<HTMLElement>('main.canvas') }
function onRoomMove(e: PointerEvent) {
  lastPt = { x: e.clientX, y: e.clientY }
  if (chatOpen.value) chatPt.value = lastPt
  const el = canvasEl()
  if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return
  const r = el.getBoundingClientRect()
  const z = vp.value.zoom
  room.sendCursor({ x: (e.clientX - r.left - vp.value.x) / z, y: (e.clientY - r.top - vp.value.y) / z, view: { cx: (r.width / 2 - vp.value.x) / z, cy: (r.height / 2 - vp.value.y) / z, zoom: z } })
}
onMounted(() => window.addEventListener('pointermove', onRoomMove, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('pointermove', onRoomMove))
/** 따라가기: 그 사람 화면 가운데 · 배율을 그대로(다른 페이지면 그 페이지로). 캔버스를 직접 움직이면 멈춰요 */
let followVp: Viewport | null = null
watch(() => (following.value ? room.cursors[following.value] : null), (c) => {
  if (!c?.view) return
  const p = room.peers.value.find((x) => x.key === following.value)
  if (p?.pageId && p.pageId !== pageId.value) { pageId.value = p.pageId; return }
  const el = canvasEl()
  if (!el) return
  const r = el.getBoundingClientRect()
  followVp = { x: r.width / 2 - c.view.cx * c.view.zoom, y: r.height / 2 - c.view.cy * c.view.zoom, zoom: c.view.zoom }
  vp.value = followVp
}, { deep: true })
watch(vp, (v) => { if (following.value && followVp && (v.x !== followVp.x || v.y !== followVp.y || v.zoom !== followVp.zoom)) following.value = null })
watch(following, (k) => { followVp = null; if (!k) followBySpot.value = false })
// 커서 채팅(피그마 '/'): 캔버스 위에서 / 를 누르면 내 커서 옆 말풍선에 쳐요. 치는 대로 다른 사람에게 보여요.
// 말풍선은 글자만큼 늘고 줄어요(줄이 넘치면 높이도). 5초 동안 안 치면 스르륵 사라지고, 다시 치면 이어서 써요.
// Enter 는 쓰지 않아요(치는 대로 보내져요). Esc · 다른 곳 누르기 = 닫기
const CHAT_IDLE = 5000
let lastPt: { x: number; y: number } | null = null
const chatOpen = ref(false)
const chatText = ref('')
/** 한 번이라도 쳤나 — 그 뒤로는 비어도 'Say something' 대신 작은 네모 칸 */
const chatTyped = ref(false)
/** 5초 동안 안 쳐서 사라지는 중(투명) */
const chatFading = ref(false)
const chatPt = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const chatEl = ref<HTMLTextAreaElement | null>(null)
let chatIdleT: ReturnType<typeof setTimeout> | null = null
let chatClearT: ReturnType<typeof setTimeout> | null = null
function chatTimers() {
  if (chatIdleT) clearTimeout(chatIdleT)
  if (chatClearT) clearTimeout(chatClearT)
  chatIdleT = setTimeout(() => {
    chatFading.value = true
    // 다 사라지면 글을 비워요(다른 사람 화면에서도 같은 때 사라져요). 칸은 열린 채 — 다시 치면 이어서
    chatClearT = setTimeout(() => { chatText.value = ''; if (chatEl.value) chatEl.value.value = '' }, 500)
  }, CHAT_IDLE)
}
function openChat() {
  const el = canvasEl()
  if (!el) return
  const r = el.getBoundingClientRect()
  const p = lastPt && lastPt.x >= r.left && lastPt.x <= r.right && lastPt.y >= r.top && lastPt.y <= r.bottom ? lastPt : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  chatPt.value = p
  chatText.value = ''
  chatTyped.value = false
  chatFading.value = false
  chatOpen.value = true
  chatTimers()
  nextTick(() => chatEl.value?.focus())
}
function closeChat(clear = true) {
  if (clear) room.sendChat('')
  if (chatIdleT) clearTimeout(chatIdleT)
  if (chatClearT) clearTimeout(chatClearT)
  chatOpen.value = false
  chatText.value = ''
}
/** v-model 대신 input 으로 읽어요 — 한글을 조합하는 중에도 폭 · 보내기가 바로 따라오게 */
function onChatInput(e: Event) {
  chatText.value = (e.target as HTMLTextAreaElement).value
  chatTyped.value = true
  chatFading.value = false
  room.sendChat(chatText.value)
  chatTimers()
}
function onChatKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChat(); return }
  if (e.key === 'Enter') e.preventDefault() // 보내기는 따로 없어요 — 치는 대로 보이고, 멈추면 5초 뒤 사라져요(줄바꿈도 막아요)
}
function onSlashKey(e: KeyboardEvent) {
  if (e.code !== 'Slash' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || chatOpen.value || commentMode.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  if (store.editing.value) return
  e.preventDefault(); e.stopPropagation()
  openChat()
}
onMounted(() => window.addEventListener('keydown', onSlashKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onSlashKey, true))
/** 따라가는 사람(편집기 테두리를 그 사람 색으로) */
const followPeer = computed(() => (following.value ? room.peers.value.find((p) => p.key === following.value) ?? null : null))
watch(followPeer, (p) => { if (following.value && !p) following.value = null }) // 그 사람이 나가면 멈춤
function stopFollowKey(e: KeyboardEvent) {
  if (!following.value) return
  if (e.key === 'Escape') { following.value = null; return }
  // 확대 · 맞춤 단축키(⌘+ · ⌘− · ⌘0 · ⇧1 · ⇧2 …)로 화면을 직접 바꾸면 멈춰요
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  if (((e.metaKey || e.ctrlKey) && ['=', '+', '-', '0'].includes(e.key)) || (e.shiftKey && /^Digit[0-9]$/.test(e.code))) following.value = null
}
onMounted(() => window.addEventListener('keydown', stopFollowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', stopFollowKey))
/**
 * 따라가는 중에 내가 캔버스를 직접 움직이면(휠 · 트랙패드 스크롤 · 확대 · 끌기 · 누르기) 바로 멈춰요(피그마와 같아요).
 * 그 사람이 한동안 안 움직여 '따라간 자리'가 아직 없을 때도 멈추게, 화면 값 비교가 아니라 내 입력으로 판단해요
 */
function stopFollowInput(e: Event) {
  if (!following.value) return
  if (e.type === 'pointerdown' && dismissPress(e)) return
  const el = canvasEl()
  if (el && e.target instanceof Node && el.contains(e.target)) following.value = null
}
onMounted(() => { window.addEventListener('wheel', stopFollowInput, { capture: true, passive: true }); window.addEventListener('pointerdown', stopFollowInput, true) })
onBeforeUnmount(() => { window.removeEventListener('wheel', stopFollowInput, { capture: true }); window.removeEventListener('pointerdown', stopFollowInput, true) })
/**
 * Spotlight me(피그마와 같아요): 내 아바타를 누르면 켜고 끄기. 켜면 같은 파일을 보는 사람에게 위쪽에 '따라갈까요?' 안내가 떠요.
 * 받는 쪽: 15초 안에 Follow 를 누르면 그 사람을 따라가요(띠 바탕이 15초 동안 차오르고, 다 차면 사라져요).
 * Spotlight 로 따라가던 중 그 사람이 끄면 따라가기도 멈춰요
 */
function toggleSpotlight() {
  room.spot.value = room.spot.value ? 0 : Date.now()
  if (room.spot.value) following.value = null
}
const followBySpot = ref(false)
const spotPrompt = ref<{ key: string; spot: number; name: string; avatar: string | null; color: string } | null>(null)
const SPOT_MS = 15_000
const seenSpots = new Set<string>()
let spotTimer: ReturnType<typeof setTimeout> | undefined
watch(() => room.peers.value.map((p) => `${p.key}:${p.spot ?? 0}`).join(), () => {
  const peers = room.peers.value
  // 안내 중이던 사람이 껐거나 나갔으면 안내를 닫아요
  const sp = spotPrompt.value
  if (sp && !peers.some((p) => p.key === sp.key && p.spot === sp.spot)) spotPrompt.value = null
  // Spotlight 로 따라가던 사람이 끄면 따라가기도 멈춰요
  if (following.value && followBySpot.value && !peers.find((p) => p.key === following.value)?.spot) { following.value = null; followBySpot.value = false }
  // 새로 켠 사람: 한 번만 안내(이미 그 사람을 따라가는 중이면 생략)
  const p = peers.find((x) => x.spot && !seenSpots.has(`${x.key}:${x.spot}`))
  if (!p) return
  seenSpots.add(`${p.key}:${p.spot}`)
  if (following.value === p.key || room.spot.value) return
  spotPrompt.value = { key: p.key, spot: p.spot!, name: p.name, avatar: p.avatar, color: p.color }
  clearTimeout(spotTimer)
  spotTimer = setTimeout(() => { if (spotPrompt.value?.key === p.key) spotPrompt.value = null }, SPOT_MS)
})
onBeforeUnmount(() => clearTimeout(spotTimer))
function acceptSpot() {
  const sp = spotPrompt.value
  if (!sp) return
  spotPrompt.value = null
  following.value = sp.key
  followBySpot.value = true
}
/** 보기 전용에서 쓸 수 있는 도구: 이동 · 손 */
watch([tool, readOnly], () => { if (readOnly.value && tool.value !== 'move' && tool.value !== 'hand') tool.value = 'move' })
let blockedAt = 0
/** 보기 전용이면 안내하고 true(고치는 동작 맨 앞에서 불러요) */
function blockEdit() {
  if (!readOnly.value) return false
  if (Date.now() - blockedAt > 2500) { blockedAt = Date.now(); say(tr('View only — only people who can edit design can change this')) }
  return true
}
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
  if (blockEdit()) return
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
  if (blockEdit()) return
  try {
    await projActions.update(projectId, { cover_screen_id: id })
    say(id ? tr('Set as the project thumbnail') : tr('Restored the default thumbnail'))
  } catch { sayFail(tr('Couldn\'t change the thumbnail. Try again')) }
}
/** 이름 바꾸기 입력칸: 열리면 바로 포커스하고 글자를 모두 골라요(피그마와 같아요) */
const vSelect = { mounted: (el: HTMLInputElement) => nextTick(() => { el.focus(); el.select() }) }

const moveFrom = new Map<string, { x: number; y: number }>()
function onMove(id: string, x: number, y: number, done: boolean) {
  if (blockEdit()) return
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
  if (blockEdit()) return
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
  if (blockEdit()) return
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
/** 프레임 템플릿(오른쪽 패널): 그 크기 · 이름으로 맨 오른쪽 프레임 옆(80px)에 만들고 그리로 화면을 옮겨요(실행취소 한 번) */
async function onPreset(p: { name: string; w: number; h: number }) {
  if (blockEdit()) return
  const top = list.value.length ? Math.min(...list.value.map((s) => s.y)) : 0
  const rect = { x: Math.round(nextX.value), y: Math.round(top), width: p.w, height: p.h }
  tool.value = 'move'
  try {
    const row = await addScreen(rect, p.name)
    if (row) {
      store.selectScreen(row.id); tab.value = 'design'
      let cur = row.id
      store.pushAction(null, async () => { await removeScreen(cur); store.selectScreen(null) }, async () => { const r = await addScreen(rect, row.name); if (r) cur = r.id })
      nextTick(() => canvas.value?.fitSelection(1))
    }
  } catch { sayFail(tr('Couldn\'t create the frame. Try again')) }
}
/**
 * 캔버스에 프레임 그리기 → 새 화면. 그 자리 안에 통째로 드는 캔버스 요소(도형 · 글자 · 섹션 안 요소 …)는 새 프레임 안으로(피그마와 같아요 — 보이는 자리 그대로).
 * 실행취소 한 번이면 요소는 캔버스로 돌아가고 프레임은 지워져요
 */
async function onCreate(rect: { x: number; y: number; width: number; height: number }) {
  if (blockEdit()) return
  try {
    // 이름은 캔버스 레이어 · 화면을 통틀어 'Frame' 가장 큰 번호 + 1(store.nextLabel)
    const name = store.nextLabel('Frame')
    const cid = canvasScreen.value?.id ?? null
    const inside = cid ? canvasLayersIn(cid, rect) : []
    const layers = cid && inside.length ? layersFromCanvas(cid, inside, rect) : null
    const row = await addScreen(rect, name)
    if (!row) return
    if (layers) { await updateScreen(row.id, { layers }); delete store.docs[row.id] } // 먼저 프레임에 넣고(저장 실패로 잃지 않게) 캔버스에서 빼요
    let cur = row.id
    const action = () => store.pushAction(null, async () => { await removeScreen(cur); store.selectScreen(null) }, async () => {
      const r = await addScreen(rect, row.name)
      if (!r) return
      cur = r.id
      if (layers) { await updateScreen(r.id, { layers: JSON.parse(JSON.stringify(layers)) }); delete store.docs[r.id] }
    })
    store.batch(() => {
      action()
      if (cid && inside.length) store.mutate(cid, (d) => {
        for (const id of inside) {
          const n = d.nodes[id]
          if (!n) continue
          const sib = n.parentId ? d.nodes[n.parentId]?.children ?? [] : d.rootIds
          const i = sib.indexOf(id)
          if (i >= 0) sib.splice(i, 1)
          for (const k of descendants(d, id)) delete d.nodes[k]
        }
      })
    })
    store.selectScreen(row.id); tab.value = 'design'
  } catch { sayFail(tr('Couldn\'t create the frame. Try again')) }
}
/** 새 프레임 자리 안에 통째로 드는 캔버스 요소: 맨 위 · 섹션 바로 안 요소, 잠기거나 숨기거나 돌린 것은 빼요(프레임 안에 그릴 때와 같아요). 앞뒤 순서대로 */
function canvasLayersIn(cid: string, rect: { x: number; y: number; width: number; height: number }): string[] {
  const d = store.doc(cid)
  const out: string[] = []
  const e = 0.01
  const visit = (ids: string[]) => {
    for (const id of ids) {
      const n = d.nodes[id]
      if (!n) continue
      const a = store.absPos(cid, id)
      const fits = !n.locked && !n.hidden && !((n.rotation ?? 0) % 360) && a.x >= rect.x - e && a.y >= rect.y - e && a.x + n.w <= rect.x + rect.width + e && a.y + n.h <= rect.y + rect.height + e
      if (fits) out.push(id)
      else if (n.type === 'section' && n.children?.length) visit(n.children)
    }
  }
  visit(d.rootIds)
  return out
}
/** 캔버스 요소들 → 새 프레임의 레이어 문서(프레임 왼쪽 위 기준 자리, 앞뒤 순서 그대로) */
function layersFromCanvas(cid: string, ids: string[], rect: { x: number; y: number }) {
  const d = store.doc(cid)
  const nodes: Record<string, LayerNode> = {}
  for (const id of ids) {
    const a = store.absPos(cid, id)
    for (const k of descendants(d, id)) {
      const n = JSON.parse(JSON.stringify(d.nodes[k])) as LayerNode
      if (k === id) { n.parentId = null; n.x = Math.round((a.x - rect.x) * 100) / 100; n.y = Math.round((a.y - rect.y) * 100) / 100 }
      nodes[k] = n
    }
  }
  return { rootIds: [...ids], nodes, schemaVersion: SCHEMA_VERSION }
}
/** 값이 서로 다른(Mixed) 프레임들의 칸에서 ↑ ↓: 각자 값에 더해요(실행취소 한 번) */
function onStepMany(key: 'x' | 'y' | 'width' | 'height', d: number) {
  if (blockEdit()) return
  const min = key === 'width' || key === 'height' ? 1 : -1e9
  store.batch(() => { for (const s of multiList.value) onUpdate({ [key]: Math.max(min, s[key] + d) }, s) })
}
/** 프레임 여러 개를 한꺼번에(실행취소 한 번) */
function onUpdateMany(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>) {
  if (blockEdit()) return
  const rows = multiList.value
  store.batch(() => { for (const s of rows) onUpdate(patch, s) })
}
/** 프레임 값 칸을 끄는 동안(scrub): 화면에는 바로 보이고, 손을 뗄 때 한 번 저장 · 실행취소 한 번(레이어 칸과 같아요) */
let scrubbing = false
const frameScrub = new Map<string, Record<string, unknown>>()
function onUpdate(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>, target?: ScreenRow) {
  if (blockEdit()) return
  const s = target ?? current.value
  if (!s) return
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k as keyof typeof patch]])) as typeof patch
  const fail = () => sayFail(tr('Couldn\'t save. Try again'))
  // 크기가 바뀌면 맨 위 레이어들이 제약대로 따라와요 — 화면 크기와 함께 실행취소 한 번으로
  const resized = s.source === 'native' && ((patch.width ?? s.width) !== s.width || (patch.height ?? s.height) !== s.height)
  if (resized && scrubbing) store.constrainRoot(s.id, s.width, s.height, patch.width ?? s.width, patch.height ?? s.height)
  if (scrubbing) {
    const b = frameScrub.get(s.id) ?? {}
    for (const [k, v] of Object.entries(before)) if (!(k in b)) b[k] = v
    frameScrub.set(s.id, b)
    Object.assign(s, patch)
    return
  }
  store.batch(() => {
    if (resized) store.constrainRoot(s.id, s.width, s.height, patch.width ?? s.width, patch.height ?? s.height)
    updateScreen(s.id, patch).catch(fail)
    store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, patch).catch(fail))
  })
}
/** 스케일(K) Scale 칸에서 화면(프레임) 키우기 · 줄이기: 안의 내용(레이어 기록) + 화면 크기 · 자리(화면 기록) */
function onScaleScreen(k: number, anchor: [number, number]) {
  const s = current.value
  if (!s || s.source !== 'native') return
  const w = Math.max(1, Math.round(s.width * k)), h = Math.max(1, Math.round(s.height * k))
  const before = { x: s.x, y: s.y, width: s.width, height: s.height }
  const after = { x: Math.round(s.x + (s.width - w) * anchor[0]), y: Math.round(s.y + (s.height - h) * anchor[1]), width: w, height: h }
  const fail = () => sayFail(tr('Couldn\'t save. Try again'))
  // 안의 내용 + 화면 크기 · 자리를 실행취소 한 번으로(⌘Z 하면 내용까지 함께 돌아와요)
  store.batch(() => {
    store.scaleScreenContent(s.id, w / s.width)
    updateScreen(s.id, after).catch(fail)
    store.pushAction(s.id, () => updateScreen(s.id, before).catch(fail), () => updateScreen(s.id, after).catch(fail))
  })
}
/** 캔버스 이름표에서 바로 고친 화면 이름 (실행 취소 가능) */
function onRenameScreen(id: string, name: string) {
  if (blockEdit()) return
  const s = canvasList.value.find((v) => v.id === id)
  if (!s) return
  const before = s.name
  const fail = () => sayFail(tr('Couldn\'t rename the frame. Try again'))
  updateScreen(id, { name }).catch(fail)
  store.pushAction(id, () => updateScreen(id, { name: before }).catch(fail), () => updateScreen(id, { name }).catch(fail))
}
async function onRemove() {
  if (blockEdit()) return
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
const lastCopy = useLastCopy()
// 화면을 복사하면(⌘C · 우클릭) 클립보드에 그 화면들 데이터도 함께 써요 — 다른 페이지 · 파일 · 탭에서도 속성 그대로 붙게.
// 캔버스의 섹션을 복사하면 그 안에 든 화면들도 함께(피그마와 같아요)
const irisScreens = (clip: LayerClip | null, withScreens: boolean) => {
  const ids = new Set(withScreens ? screenClip.value : [])
  for (const v of sectionScreensOf(clip)) ids.add(v.id)
  return [...ids].map((id) => list.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v && !isPageCanvas(v.id)).map(screenSource)
}
const irisMenuHook = () => { const p = myLastClip(); return !!p && !pastingIris && pasteIris(p) }
setIrisScreenSource(irisScreens)
setIrisPasteHook(irisMenuHook)
/** ⌘D 로 캔버스의 섹션을 복제하면 안의 화면까지 함께, 서로 자리 그대로 바로 오른쪽에(피그마와 같아요). 안에 화면이 없으면 원래 복제 */
const irisDupHook = (): boolean => {
  const cid = canvasScreen.value?.id
  if (!cid || store.screenId.value !== cid || !store.layerIds.value.length) return false
  const keep = store.clipData()
  if (!store.copy()) return false
  const clip = store.clipData()!
  store.setClipboard(keep) // 복사해 둔 것은 그대로(⌘D 는 클립보드를 건드리지 않아요)
  const inside = sectionScreensOf(clip)
  if (!inside.length) return false
  if (blockEdit()) return true
  void pasteGroup(clip, inside.map(screenSource), cid)
  return true
}
setIrisDupHook(irisDupHook)
onBeforeUnmount(() => { unsetIrisScreenSource(irisScreens); unsetIrisPasteHook(irisMenuHook); unsetIrisDupHook(irisDupHook) })
/** 복사한 캔버스 레이어 안 섹션(안쪽 섹션까지)에 통째로 든 화면들 */
function sectionScreensOf(clip: LayerClip | null): ScreenRow[] {
  if (!clip || !isPageCanvas(clip.sid)) return []
  const byId = new Map(clip.nodes.map((n) => [n.id, n]))
  const at = (n: LayerNode): { x: number; y: number } => {
    if (clip.rootIds.includes(n.id)) return clip.abs[n.id] ?? { x: n.x, y: n.y }
    const p = n.parentId ? byId.get(n.parentId) : undefined
    if (!p) return { x: n.x, y: n.y }
    const pa = at(p)
    return { x: pa.x + n.x, y: pa.y + n.y }
  }
  const boxes = clip.nodes.filter((n) => n.type === 'section').map((n) => ({ ...at(n), w: n.w, h: n.h }))
  if (!boxes.length) return []
  return list.value.filter((v) => !isPageCanvas(v.id) && boxes.some((b) => v.x >= b.x && v.y >= b.y && v.x + v.width <= b.x + b.w && v.y + v.height <= b.y + b.h))
}
/** 복사 · 복제할 화면 데이터: 지금 레이어(저장 전 것까지) · 피그마 연결 · 썸네일 */
function screenSource(v: ScreenRow): ScreenCopySource {
  return { id: v.id, name: v.name, source: v.source, x: v.x, y: v.y, width: v.width, height: v.height, layers: JSON.parse(JSON.stringify(store.doc(v.id))), thumbnail_path: v.thumbnail_path ?? null, figma_url: v.figma_url ?? null }
}
/** 화면 복제: 레이어 · 속성 그대로(피그마 화면도), 오른쪽(또는 지정한 자리)에 */
async function cloneScreen(srcId: string, at?: { x: number; y: number }, select = true) {
  const src = list.value.find((v) => v.id === srcId)
  return src ? cloneFrom(screenSource(src), at, select) : null
}
/** 화면 데이터로 새 화면(같은 파일 · 다른 파일 모두). 실행취소 한 번 */
async function cloneFrom(src: ScreenCopySource, at?: { x: number; y: number }, select = true, record = true) {
  const rect = { x: at?.x ?? src.x + src.width + 40, y: at?.y ?? src.y, width: src.width, height: src.height }
  // 이름: 기본 이름('Frame 3')이면 다음 번호, 바꾼 이름은 그대로(피그마와 같아요)
  const name = /^Frame \d+$/.test(src.name) ? store.nextLabel('Frame') : src.name
  const row = await addScreenCopy(src, rect, name)
  if (!row) return null
  delete store.docs[row.id] // 새 레이어로 다시 읽기
  if (select) store.selectScreen(row.id)
  let cur = row.id
  if (record) store.pushAction(null, async () => { await removeScreen(cur); if (src.id && list.value.some((v) => v.id === src.id)) store.selectScreen(src.id); else store.selectScreen(null) }, async () => { const r = await addScreenCopy(src, rect, row.name); if (r) { cur = r.id; delete store.docs[r.id] } })
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
async function cloneMany(items: { id?: string; src?: ScreenCopySource; x: number; y: number }[], withLayers: boolean, after?: (record: () => void) => void): Promise<string[]> {
  if (blockEdit()) return []
  const srcs = items.map((it) => it.src ?? (() => { const v = list.value.find((o) => o.id === it.id); return v ? screenSource(v) : null })())
  // 하나가 저장에 실패해도 나머지는 붙이고(실행취소도 붙은 것만), 실패한 수를 알려요
  let failed = 0
  const rows = await Promise.all(srcs.map((src, i) => (src ? cloneFrom(src, { x: items[i]!.x, y: items[i]!.y }, false, false).catch(() => { failed++; return null }) : null)))
  if (failed) sayFail(failed === srcs.length ? tr('Couldn\'t paste the frames. Try again') : tr('Couldn\'t paste {n} of the frames', { n: failed }))
  // 실행취소 한 번에 전부(after 가 있으면 그 안에서 레이어 붙이기와 함께 한 번)
  const made = rows.flatMap((r, i) => (r ? [{ src: srcs[i]!, rect: { x: items[i]!.x, y: items[i]!.y, width: srcs[i]!.width, height: srcs[i]!.height }, name: r.name, cur: r.id }] : []))
  const record = () => {
    if (made.length) store.pushAction(null, async () => { await Promise.all(made.map((m) => removeScreen(m.cur))); store.selectScreen(null); multiScreens.value = []; mixScreens.value = [] }, async () => {
      await Promise.all(made.map(async (m) => { const r = await addScreenCopy(m.src, m.rect, m.name); if (r) { m.cur = r.id; delete store.docs[r.id] } }))
    })
  }
  if (after) after(record); else record()
  const ids = made.map((m) => m.cur)
  if (!ids.length) return []
  if (withLayers) { mixScreens.value = ids; return ids }
  store.selectScreen(ids[0]!)
  multiScreens.value = ids.length > 1 ? ids : []
  return ids
}
/** 복사한 화면들 붙여넣기(피그마처럼): 배치는 그대로, 원래 자리 바로 오른쪽 — 비어 있지 않으면 맨 오른쪽 끝 */
async function pasteScreens(withLayers: boolean) {
  if (blockEdit()) return
  const src = screenClip.value.map((id) => list.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v)
  if (!src.length) return
  const dx = pasteShift(src, false)
  await cloneMany(src.map((v) => ({ id: v.id, x: v.x + dx, y: v.y })), withLayers)
}
/**
 * 붙일 화면들을 옮길 거리(피그마와 같아요 — 사용자 요청 2026-11-27):
 * - 다른 페이지 · 파일 · 탭에서 처음 붙이면: 원래 좌표 그대로
 * - 같은 페이지에서 처음 붙이면: 원래 자리 바로 오른쪽(묶음 폭 + 40)
 * - 같은 것을 같은 페이지에 연달아 붙이면: 직전에 붙인 것 바로 오른쪽으로 같은 간격씩 — 자리가 비었는지 보지 않아요(겹쳐도 일정하게, 건너뛰지 않게)
 */
let pasteSeq: { key: string; n: number } | null = null
function pasteShift(src: { x: number; y: number; width: number; height: number }[], tryOrigin: boolean) {
  const minX = Math.min(...src.map((v) => v.x)), maxX = Math.max(...src.map((v) => v.x + v.width))
  const step = maxX - minX + 40
  const key = src.map((v) => `${v.x},${v.y},${v.width},${v.height}`).join('|') + '@' + (pageId.value ?? '')
  const n = pasteSeq?.key === key ? pasteSeq.n + 1 : tryOrigin ? 0 : 1
  pasteSeq = { key, n }
  return n * step
}
/** 빈 페이지에 붙였으면 붙인 것이 가운데에 다 보이게(최대 100%) — 그 밖에는 시점을 옮기지 않아요 */
function showIfWasEmpty(wasEmpty: boolean, ids: string[]) {
  if (wasEmpty && ids.length) nextTick(() => canvas.value?.fit(ids))
}
/** 다른 페이지 · 파일 · 탭에서 복사한 화면들 붙여넣기(속성 그대로 — 피그마 화면도): 원래 좌표 그대로(막히면 오른쪽으로 같은 간격). 시점은 그대로, 빈 페이지면 붙인 것이 보이게 */
async function pasteScreenData(items: ScreenCopySource[], withLayers: boolean) {
  if (blockEdit() || !items.length) return
  const wasEmpty = !list.value.length
  const dx = pasteShift(items, true)
  showIfWasEmpty(wasEmpty, await cloneMany(items.map((v) => ({ src: v, x: v.x + dx, y: v.y })), withLayers))
}
async function onScreenAction(action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward' | 'section', dx = 0, dy = 0) {
  if (action !== 'copy' && blockEdit()) return
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
      // 고른 화면 전부 지우기 — 피그마에서 가져온 화면도 같이(사용자 요청 2026-11-27). 요구사항이 연결된 화면이 있으면 확인 창으로 물은 뒤 연결도 함께 끊고 지워요
      const linkedIds = new Set((links.data.value ?? []).map((l) => l.screen_id))
      const ok = targets
      const kept = 0
      if (!ok.length) return
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
  // 되살릴 때 피그마 연결 · 썸네일 · 레이어까지 그대로(screenSource)
  const snaps = ok.map((v) => ({ id: v.id, rect: { x: v.x, y: v.y, width: v.width, height: v.height }, name: v.name, status: v.status, src: screenSource(v) }))
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
      const r = await addScreenCopy(sn.src, sn.rect, sn.name)
      if (r) { await updateScreen(r.id, { status: sn.status }); delete store.docs[r.id] }
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
  if (blockEdit()) return
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
  if (blockEdit()) return
  const media = files.filter(isMediaFile)
  if (!media.length) return say(tr('Only image or video files (PNG, JPG, SVG, MP4…) can be added'))
  for (const [i, f] of media.entries()) {
    const p = { x: at.x + i * 24, y: at.y + i * 24 }
    // SVG 파일은 고칠 수 있는 벡터로(SVG 코드 붙여넣기와 같아요 — 피그마와 같아요). 읽지 못하면 이미지로
    if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) { const text = await f.text().catch(() => ''); if (text && importSvgVectors(text, p, place?.sid)) continue }
    await insertImage(f, p, place)
  }
}
let pastingIris = false
/**
 * Iris 에서 복사한 것 붙여넣기 — 어느 페이지 · 파일 · 탭에서 복사했든 같아요(피그마와 같아요).
 * 이 탭에서 이 페이지 것만 복사했으면 false(캔버스의 원래 붙여넣기 — 원래 자리 · 고른 프레임 안 · 섞어 고른 것 그대로).
 * 그 밖에는 여기서: 다른 페이지 · 파일이면 화면은 원래 자리(비어 있으면), 섹션은 안의 화면과 함께 옮겨요
 */
function pasteIris(iris: IrisClipPayload): boolean {
  const mine = isMyClip(iris)
  const screensIn = Array.isArray(iris.screens) ? iris.screens.filter((v) => v && typeof v.name === 'string' && (v.source === 'native' || v.source === 'figma') && v.width > 0 && v.height > 0) : []
  const clip = iris.clip ?? null
  const cid = canvasScreen.value?.id ?? null
  const here = (sid: string) => sid === cid || list.value.some((v) => v.id === sid)
  // 캔버스 레이어(섹션 등)와 화면을 함께 복사했으면 한 덩어리로 옮겨요
  const grouped = !!clip && isPageCanvas(clip.sid) && screensIn.length > 0
  const allHere = (!clip || here(clip.sid)) && screensIn.every((v) => !!v.id && list.value.some((o) => o.id === v.id))
  if (mine && allHere && !grouped) return false
  if (blockEdit()) return true
  // 다른 탭 · 파일이거나, 이 탭이라도 다른 프로젝트에서 복사했으면(프로젝트마다 편집기를 새로 열어요) 클립보드에 실려 온 레이어로
  if (clip && (!mine || !store.hasClipboard()) && !store.setClipboard(clip)) return screensIn.length ? (pasteScreenData(screensIn, false), true) : true
  pastingIris = true
  try {
    if (grouped && clip && cid) { pasteGroup(clip, screensIn, cid); return true }
    if (clip) { const keep = lastCopy.value; lastCopy.value = 'layers'; canvas.value?.paste(); lastCopy.value = keep }
    if (screensIn.length) pasteScreenData(screensIn, !!clip)
  } finally { pastingIris = false }
  return true
}
/**
 * 섹션(캔버스 레이어) + 안의 화면들: 서로 자리는 그대로, 함께 옮겨요.
 * 다른 페이지 · 파일이면 원래 자리(비어 있으면), 같은 페이지면 바로 오른쪽(막히면 맨 오른쪽 끝)
 */
function pasteGroup(clip: LayerClip, items: ScreenCopySource[], cid: string) {
  const roots = clip.nodes.filter((n) => clip.rootIds.includes(n.id))
  const rects = [...roots.map((n) => ({ x: clip.abs[n.id]?.x ?? n.x, y: clip.abs[n.id]?.y ?? n.y, width: n.w, height: n.h })), ...items]
  const wasEmpty = !list.value.length
  // 다른 페이지 · 파일이면 원래 좌표 그대로(막히면 오른쪽으로 같은 간격), 같은 페이지면 오른쪽으로 — 시점은 그대로
  const dx = pasteShift(rects, clip.sid !== cid)
  // 화면들을 다 만든 뒤 섹션(레이어)을 붙이고, 화면 · 섹션을 실행취소 한 번으로 묶어요. 붙이는 동안만 이 클립을 써요(지금 클립보드는 그대로)
  return cloneMany(items.map((v) => ({ src: v, x: v.x + dx, y: v.y })), true, (record) => store.batch(() => {
    record()
    const prev = store.clipData()
    store.setClipboard(clip)
    store.layerIds.value = []
    store.paste(cid)
    store.setClipboard(prev)
    const fresh = [...store.layerIds.value]
    if (dx && fresh.length) store.update(cid, fresh, (n) => ({ x: Math.round((n.x + dx) * 100) / 100 }))
  })).then((ids) => showIfWasEmpty(wasEmpty, ids))
}
/**
 * 붙여넣기(⌘V — 피그마와 같아요, 마지막에 복사한 것이 붙어요)
 * 1) Iris 에서 복사한 레이어: 이 탭이면 이 탭 클립보드, 다른 파일 · 탭 · 새로고침 전이면 클립보드에 실려 온 데이터로
 * 2) 이미지 파일 3) SVG 코드(피그마 'Copy as SVG' 등) 4) 그 밖의 글자 → 텍스트 레이어
 */
function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
  const cd = e.clipboardData
  if (!cd) return
  clearTimeout(pasteWait) // 붙여넣기 이벤트가 왔으니 예비 경로는 쓰지 않아요
  e.preventDefault()
  applyClipboard({ html: cd.getData('text/html'), text: cd.getData('text/plain'), files: [...cd.files] })
}
/** 클립보드 내용 붙이기 — 붙여넣기 이벤트와 예비 경로(클립보드 직접 읽기)가 함께 써요 */
function applyClipboard(cd: { html: string; text: string; files: File[] }) {
  const html = cd.html
  const iris = html ? readIrisClip(html) : null
  if (iris) {
    if (!pasteIris(iris)) canvas.value?.paste()
    return
  }
  const files = cd.files.filter((f) => f.type.startsWith('image/'))
  const text = cd.text.trim()
  const center = { x: Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom), y: Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) }
  if (files.length) { onDropFiles(files, current.value ? { x: current.value.x + current.value.width / 2, y: current.value.y + current.value.height / 2 } : center); return }
  if (/^<svg[\s>]/i.test(text) || (/^<\?xml/i.test(text) && text.includes('<svg'))) {
    // 피그마처럼 벡터 레이어들로(안쪽 도형까지 고칠 수 있게). 읽지 못하면 이미지로
    if (!importSvgVectors(text, current.value ? undefined : center)) insertImage(new File([text], 'svg.svg', { type: 'image/svg+xml' }), current.value ? undefined : center)
    return
  }
  // 피그마 ⌘C 는 피그마만 읽는 형식이에요 — 엉뚱한 것을 붙이지 않고 다른 복사 방법을 알려요
  if (html && isFigmaClip(html)) return say(tr('Figma copies can’t be pasted yet. In Figma, use Copy as SVG or Copy as PNG'), 5000)
  // 옛 표시(이 탭 클립보드) 이거나, 클립보드에 쓰지 못했을 때는 이 탭 클립보드
  if (!text || text === IRIS_CLIP) return canvas.value?.paste()
  insertPlainText(cd.text, current.value ? undefined : center)
}
/**
 * 예비 경로: ⌘V 를 눌렀는데 붙여넣기 이벤트가 오지 않으면(메뉴에 붙여넣기가 없는 창 · 자동 조작 등) 클립보드를 직접 읽어 붙여요.
 * 붙여넣기 이벤트는 키를 누른 바로 뒤에 오니까 잠깐(150ms) 기다렸다가요. 읽기를 막아 두면 이 탭 클립보드로
 */
let pasteWait: ReturnType<typeof setTimeout> | undefined
function onPasteKey(e: KeyboardEvent) {
  // 키 자리(KeyV) · 글자(v · 한글 자판 ㅍ) 어느 쪽으로든
  const isV = e.code === 'KeyV' || e.key === 'v' || e.key === 'V' || e.key === 'ㅍ'
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || !isV || e.repeat) return
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
  clearTimeout(pasteWait)
  pasteWait = setTimeout(() => { void pasteFromClipboardApi() }, 150)
}
/** 클립보드를 못 읽을 때: 이 탭에서 마지막으로 복사한 것(다른 페이지 · 프로젝트 · 섹션까지) → 없으면 이 편집기 클립보드 */
function pasteInTab() { if (!irisMenuHook()) canvas.value?.paste() }
async function pasteFromClipboardApi() {
  if (!navigator.clipboard?.read) return pasteInTab()
  try {
    const items = await navigator.clipboard.read()
    let html = '', text = ''
    const files: File[] = []
    for (const it of items) {
      for (const type of it.types) {
        const b = await it.getType(type)
        if (type === 'text/html') html = await b.text()
        else if (type === 'text/plain') text = await b.text()
        else if (type.startsWith('image/')) files.push(new File([b], `pasted.${type.split('/')[1] ?? 'png'}`, { type }))
      }
    }
    applyClipboard({ html, text, files })
  } catch { pasteInTab() }
}
/** 다른 앱에서 복사한 글자 → 텍스트 레이어(피그마와 같아요: 글자 폭에 맞춘 텍스트, 줄바꿈 그대로). 고른 Iris 화면(없으면 캔버스) 가운데에 */
function insertPlainText(raw: string, at?: { x: number; y: number }) {
  if (blockEdit()) return
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
  if (!text) return
  const s = (at ? null : current.value?.source === 'native' ? current.value : null) ?? canvasScreen.value
  if (!s) return
  const onCanvas = isPageCanvas(s.id)
  // 붙인 뒤 글자에 맞춰 크기가 다시 재져요 — 처음 자리를 가운데로 잡으려고 대강 재요
  const st = DEFAULT_STYLE.text
  const ctx = document.createElement('canvas').getContext('2d')
  if (ctx) ctx.font = `${st.fontWeight} ${st.fontSize}px Pretendard, sans-serif`
  const lines = text.split('\n')
  const w = Math.max(1, Math.ceil(Math.max(...lines.map((l) => ctx?.measureText(l).width ?? l.length * 8))))
  const h = Math.round(lines.length * (st.fontSize ?? 16) * ((st.lineHeight ?? 100) / 100))
  const c = at ? (onCanvas ? at : { x: at.x - s.x, y: at.y - s.y }) : (onCanvas ? { x: Math.round((window.innerWidth / 2 - vp.value.x) / vp.value.zoom), y: Math.round((window.innerHeight / 2 - vp.value.y) / vp.value.zoom) } : { x: s.width / 2, y: s.height / 2 })
  store.add(s.id, null, { type: 'text', text, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h, style: {} })
  tab.value = 'design'
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
onMounted(() => { window.addEventListener('paste', onPaste); window.addEventListener('keydown', onPasteKey, true) })
onBeforeUnmount(() => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onPasteKey, true); clearTimeout(pasteWait) })
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
  // 공용 확인 창으로 묻고 고를 때까지 기다려요(브라우저 기본 창은 쓰지 않아요)
  return new Promise<boolean>((resolve) => { leaveAsk.value = resolve })
})
const leaveAsk = ref<((ok: boolean) => void) | null>(null)
function answerLeave(ok: boolean) { const r = leaveAsk.value; leaveAsk.value = null; r?.(ok) }

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
  } else commentMode.value = !commentMode.value
}

/** 공유 창(초대 · 승인 · 멤버 역할 · 링크 복사) */
const shareOpen = ref(false)
function share() { shareOpen.value = true }
// 알림(초대 요청)에서 왔으면 공유 창을 바로 열어요
watch(() => route.query.share, (v) => { if (v === '1') { shareOpen.value = true; router.replace({ query: { ...route.query, share: undefined } }) } }, { immediate: true })

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
  <div :class="['editor', { 'ui-hidden': uiHidden, unready: !viewReady, rulers: rulersShown, commenting: commentMode }]" >
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
      @clone-screen="async (id: string, x: number, y: number) => { if (blockEdit()) return; const r = await cloneScreen(id, { x, y }); if (r) screenDup = { src: id, copy: r.id } }"
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
 <CommentLayer
      v-if="!gateActive && pinsShown"
      :vp="vp" :threads="comments.threads.value" :screens="list" :page-id="pageId" :people="mentionPeople" :authors="commentAuthors" :my-id="comments.myId.value"
      :can-moderate="access.can.value.manage" :draft="draft" :drawing="drawing" :open-id="openThread" :layer-box="layerBox"
      @open="(id) => { openThread = id; draft = null; if (id) comments.markRead(id) }"
      :draft-nudge="draftNudge" @draft-dirty="(v) => (draftDirty = v)" @draft-area="setDraftArea" :reply-nudge="replyNudge" @reply-dirty="(v) => (replyDirty = v)"
      @create="createComment" @cancel-draft="draft = null"
      @reply="replyComment" @resolve="resolveComment" @remove="(r) => (confirmThread = r)" @move="moveComment"
      @edit="editComment" @remove-msg="(c) => (confirmMsg = c)" @unread="unreadThread" @copy-link="copyCommentLink" @react="reactComment"
    />
    <img ref="cmCursor" class="cm-cursor" src="/cursors/comment@2x.png" width="20" height="20" alt="" aria-hidden="true" draggable="false">
    <div v-if="commentMode && !followPeer && !room.spot.value && !spotPrompt" class="sq cm-band" role="status"><EditorIcon name="comment" :size="16" />{{ tr('Click anywhere to comment') }}<span class="dimt">{{ tr('Esc to exit') }}</span></div>
 <!-- 커서 채팅: 내 커서 옆(내 색) -->
    <div v-if="chatOpen" :class="['sq', 'cchat', { empty: !chatText && chatTyped, fading: chatFading }]" :style="{ left: chatPt.x + 14 + 'px', top: chatPt.y + 16 + 'px', '--c': room.myColor.value }">
      <div class="cchat-grow" :data-value="chatText || (chatTyped ? '' : tr('Say something'))">
        <textarea ref="chatEl" rows="1" cols="1" class="cchat-in" :value="chatText" maxlength="120" :placeholder="chatTyped ? '' : tr('Say something')" :aria-label="tr('Cursor chat')" @input="onChatInput" @keydown="onChatKey" @blur="closeChat()" />
      </div>
    </div>
    <div v-if="followPeer" class="follow-ring" :style="{ '--c': followPeer.color }" aria-hidden="true" />
    <!-- Spotlight 중인 나(피그마와 같아요): 편집기 테두리를 내 색으로 -->
    <div v-else-if="room.spot.value" class="follow-ring" :style="{ '--c': room.myColor.value }" aria-hidden="true" />
    <!-- 따라가는 중: 위 가운데에 계속(그만두면 바로 사라져요) -->
    <div v-if="followPeer" class="sq follow-band" role="status" :style="{ '--c': followPeer.color }">
      <MemberAvatar :name="followPeer.name" :src="followPeer.avatar" :size="20" />
      <span>{{ tr('Following {name}', { name: followPeer.name }) }}</span>
      <button type="button" class="sq fb-stop" @click="following = null">{{ tr('Stop') }}</button>
    </div>
    <!-- Spotlight 중인 나: 위 가운데 띠 — 아무도 안 따라오면 'Waiting for followers…', 따라오면 그 사람들 -->
    <div v-else-if="room.spot.value" :key="'spot' + room.spot.value" :class="['sq', 'follow-band', { 'spot-ask': !room.followers.value.length }]" role="status" :style="{ '--c': room.myColor.value, '--t': SPOT_MS + 'ms' }">
      <!-- 아무도 안 따라왔을 때: 다른 사람이 Follow 를 누를 수 있는 15초 동안 바탕이 차올라요(받는 쪽 안내와 같은 시간) -->
      <i v-if="!room.followers.value.length" class="gauge" aria-hidden="true" />
      <template v-if="room.followers.value.length">
        <span class="fav"><MemberAvatar v-for="f in room.followers.value.slice(0, 3)" :key="f.key" :name="f.name" :src="f.avatar" :size="20" /></span>
        <span>{{ room.followers.value.length === 1 ? tr('{name} is following you', { name: room.followers.value[0]!.name }) : tr('{n} people are following you', { n: room.followers.value.length }) }}</span>
      </template>
      <span v-else class="fb-l">{{ tr('Waiting for followers…') }}</span>
      <button type="button" class="sq fb-stop dark" @click="toggleSpotlight">{{ room.followers.value.length ? tr('Stop') : tr('Cancel') }}</button>
    </div>
    <!-- 다른 사람이 Spotlight 를 켰어요: 15초 동안 바탕이 차오르고, Follow 를 누르면 따라가요 -->
    <div v-else-if="spotPrompt" :key="spotPrompt.key + spotPrompt.spot" class="sq follow-band spot-ask" role="alertdialog" :aria-label="tr('{name} is spotlighting', { name: spotPrompt.name })" :style="{ '--c': spotPrompt.color, '--t': SPOT_MS + 'ms' }">
      <i class="gauge" aria-hidden="true" />
      <MemberAvatar :name="spotPrompt.name" :src="spotPrompt.avatar" :size="20" />
      <span>{{ tr('{name} is spotlighting', { name: spotPrompt.name }) }}</span>
      <button type="button" class="sq fb-stop ok" @click="acceptSpot">{{ tr('Follow') }}</button>
      <button type="button" class="sq fb-x" :aria-label="tr('Dismiss')" @click="spotPrompt = null"><EditorIcon name="close" :size="12" /></button>
    </div>
    <CanvasPresence :vp="vp" :cursors="room.liveCursors.value" :peers="room.peers.value" :page-id="pageId" :screens="list" />
    <div v-if="screens.status.value === 'success' && !list.length" class="sq float s canvas-empty">
      <span class="tx-head">{{ tr('This page is empty') }}</span>
      <span class="tx-meta ce-sub">{{ tr('Draw a frame with the Frame tool (F) or import one from Figma') }}</span>
      <span class="row">
        <Button size="s" type="tertiary" stroke @click="tool = 'frame'">{{ tr('Draw frame') }}</Button>
        <Button size="s" type="tertiary" stroke @click="figmaOpen = true">{{ tr('Import from Figma') }}</Button>
      </span>
    </div>

    <!-- 왼쪽 패널 -->
    <!-- 패널 칸(숫자 · 이름 · 설정)은 맞춤법 검사 빨간 줄이 필요 없어요(예: Scale 칸 '1x') — 안쪽 입력칸이 모두 물려받아요 -->
    <aside spellcheck="false" :aria-label="tr('Left sidebar')" :class="['sq', 'float', 'panel-left', { collapsed: collapsed.left }]">
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
    <aside spellcheck="false" :aria-label="tr('Right sidebar')" :class="['sq', 'float', 'panel-right', { collapsed: collapsed.right && !hasPick }]">
      <!-- 맨 위: 나 · Share — 예전 떠 있던 알약을 사이드바에 합쳤어요(아래 구분선) -->
      <div class="panel-top r line-b">
        <PresenceStack
          :people="room.people.value" :following="following" :pages="pages.data.value ?? []" :screens="list"
          :me="{ name: myName, avatar: me?.avatar_url, color: room.myColor.value }" :spotlight="!!room.spot.value"
          @follow="(k) => { following = k; followBySpot = false }" @spotlight="toggleSpotlight"
        />
        <span class="pill-acts">
          <Button size="s" type="primary" @click="share">{{ tr('Share') }}</Button>
        </span>
      </div>
      <p v-if="readOnly && tab === 'design' && !commentsShown" class="sq ro-note"><EditorIcon name="lock" :size="16" />{{ tr('View only. Only people who can edit design can change these') }}</p>
      <!-- 인스펙터(문서를 열어도 그대로) — 코멘트 모드면 코멘트 목록 -->
      <template v-if="!commentsShown">
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
              <button class="sq menu-item" role="menuitemcheckbox" :aria-checked="pinsShown" @click="pinsShown = !pinsShown"><EditorIcon name="check" :size="12" :class="['zck', { off: !pinsShown }]" /><span class="f1">{{ tr('Comments') }}</span><span class="tx-meta">⇧C</span></button>
            </div>
          </div>
        </div>

        <!-- 프레임 도구(F): 오른쪽 패널이 크기 템플릿으로(피그마와 같아요) — 누르면 그 크기로 바로 그려요 -->
        <div v-if="tool === 'frame' && tab === 'design' && !readOnly" class="scroll insp"><FramePresets @pick="onPreset" /></div>
        <template v-else-if="current">
          <div v-if="tab !== 'design'" class="obj">
            <div class="obj-row">
              <span class="tx-head ellipsis">{{ current.name }}</span>
              <span class="sq badge">{{ tr(STATUS_BADGE[current.status]) }}</span>
            </div>
            <span class="tx-meta">{{ current.source === 'figma' ? tr('Figma frame') : tr('Iris frame') }} · <span class="num">{{ fmtNum(current.width) }} × {{ fmtNum(current.height) }}</span></span>
          </div>
          <div :class="['scroll', 'insp', { ro: readOnly && tab === 'design' }]" :inert="(readOnly && tab === 'design') || undefined">
            <InspectorPlan v-if="tab === 'plan'" ref="plan" :key="current.id" :project-id="projectId" :screen="current" @open-doc="(id: string, req?: string) => showDoc(id, req)" @toast="say" @add-doc="addDocOpen = true" />
            <InspectorDev v-else-if="tab === 'dev'" :screen="current" @synced="screens.refresh()" @open-asset="(id: string) => { left = 'assets'; asset = id }" @toast="say" />
            <template v-else-if="store.layerIds.value.length">
              <InspectorLayer :screen="current" :scale-mode="tool === 'scale'" @replace-image="pickImage" />
              <!-- 스케일 도구(K): Position · Layout 만 남기고 아래 Scale 칸이 주인공(피그마와 같아요) -->
              <InspectorScale v-if="tool === 'scale'" :sid="current.id" :ids="store.layerIds.value" @close="tool = 'move'" />
              <InspectorExport v-else :sid="current.id" :ids="store.layerIds.value" @toast="say" />
            </template>
            <!-- 프레임 여러 개: 한 개일 때와 같은 패널(값이 다르면 Mixed) — 고치면 모두에 한꺼번에(피그마와 같아요) -->
            <template v-else-if="multiList.length > 1">
              <InspectorDesign :screen="multiList[0]!" :multi="multiList" @update="onUpdateMany" @step="onStepMany" @arrange="onArrangeScreens" />
              <InspectorExport :sid="multiList[0]!.id" :ids="[]" :screen="multiList[0]" :screens="multiList" @toast="say" />
            </template>
            <template v-else>
              <InspectorDesign :screen="current" :scale-mode="tool === 'scale' && current.source === 'native'" @update="onUpdate" @remove="onRemove" />
              <!-- 스케일 도구(K) + 화면(프레임) 고름: 화면과 안의 내용을 같은 비율로 -->
              <InspectorScale v-if="tool === 'scale' && current.source === 'native'" :sid="current.id" :ids="[]" :screen="current" @scale-screen="onScaleScreen" @close="tool = 'move'" />
              <!-- 완성한 화면 내보내기(피그마 Export) -->
              <InspectorExport v-else :sid="current.id" :ids="[]" :screen="current" @toast="say" />
            </template>
          </div>
        </template>
        <!-- 캔버스 위 레이어를 골랐을 때: 디자인 속성만 -->
        <div v-else-if="canvasScreen && selected === canvasScreen.id && store.layerIds.value.length" :class="['scroll', 'insp', { ro: readOnly }]" :inert="readOnly || undefined">
          <InspectorLayer :screen="canvasScreen" :scale-mode="tool === 'scale'" @replace-image="pickImage" />
          <InspectorScale v-if="tool === 'scale'" :sid="canvasScreen.id" :ids="store.layerIds.value" @close="tool = 'move'" />
          <InspectorExport v-else :sid="canvasScreen.id" :ids="store.layerIds.value" @toast="say" />
        </div>
        <!-- 아무것도 안 골랐을 때: 피그마의 Page 패널처럼 페이지 · 캔버스 설정 -->
        <div v-else-if="tab === 'design' && currentPage" :class="['scroll', 'insp', { ro: readOnly }]" :inert="readOnly || undefined">
          <InspectorPage :page="currentPage" :zoom="vp.zoom" :screen-count="list.length" @rename="(n: string) => currentPage && renamePageUndoable(currentPage.id, n).catch(() => sayFail(tr('Couldn\'t rename the page')))" @settings="onPageSettings" @zoom="(z: number | 'fit') => (z === 'fit' ? canvas?.fit() : canvas?.zoomAt(z))" />
        </div>
        <div v-else class="none">
          <span class="tx-head">{{ tr('Select a frame') }}</span>
          <span class="tx-meta">{{ tr('Select a frame on the canvas or in Layers to see its requirements, design and dev info here') }}</span>
          <TextButton v-if="list.length" size="s" color="blue" class="self-start" @click="pickScreen(list[0]!.id, true)">{{ tr('Select first frame') }}</TextButton>
        </div>
      </template>
      <CommentPanel v-else :threads="comments.threads.value" :page-id="pageId" :pages="pages.data.value ?? []" :screens="list" :people="mentionPeople" :authors="commentAuthors" :my-id="comments.myId.value" :open-id="openThread" @open="goThread" @close="commentMode = false; openThread = null; draft = null" @resolve="resolveComment" @read-all="readAllComments" />
    </aside>

    <EditorToolbar v-model="tool" :readonly="readOnly" :commenting="commentMode" :unread="comments.threads.value.some((t) => t.unread && !t.root.resolved_at)" @rail="onRail" />
    <!-- 보기 전용 띠(PRD/16 E): 캔버스 위 가운데 -->
    <div v-if="readOnly && !commentMode && !followPeer" class="sq ro-band" role="status">
      <EditorIcon name="visibility_on" :size="16" />
      <span>{{ tr('You\'re viewing · {role}', { role: tr(ROLE_NAME[access.role.value ?? 'viewer']) }) }}</span>
    </div>

    <!-- 알림: 공유 창 같은 어두운 바탕(팝업) 위에도 보이게 body 맨 위층으로 -->
    <Teleport to="body">
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
    </Teleport>

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
    <ShareModal v-model:open="shareOpen" :project-id="projectId" :project-name="project.data.value?.name ?? ''" />
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
      v-if="leaveAsk"
      :title="tr('Leave without saving?')"
      :desc="tr('Some changes aren\'t saved and couldn\'t be kept in this browser. Leave anyway? They\'ll be lost')"
      :actions="[{ label: tr('Stay'), kind: 'primary', onClick: () => answerLeave(false) }, { label: tr('Leave anyway'), kind: 'destructed', onClick: () => answerLeave(true) }]"
      @close="answerLeave(false)"
    />
    <AppConfirm
      v-if="confirmPage"
      :title="tr('Delete &quot;{name}&quot;?', { name: confirmPage.name })"
      :desc="confirmPage.count >= 0 ? tr('All frames and layers on this page will be deleted ({n} frames). This can\'t be undone.', { n: confirmPage.count }) : tr('All frames and layers on this page will be deleted. This can\'t be undone.')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmPage = null) }, { label: tr('Delete page'), kind: 'destructed', onClick: doRemovePage }]"
      @close="confirmPage = null"
    />
    <ConflictDialog
      v-if="conflict && conflictScreen"
      :screen="conflictScreen"
      :mine="store.doc(conflict.sid)"
      :theirs="conflict.remote.layers"
      :by-name="conflictBy?.name ?? tr('Someone')"
      :by-avatar="conflictBy?.avatar_url"
      :at="conflict.remote.updated_at"
      :my-name="myName"
      :my-avatar="me?.avatar_url"
      :busy="conflictBusy"
      @keep-mine="keepMine"
      @use-theirs="useTheirs"
    />
    <AppConfirm
      v-if="confirmThread"
      :title="tr('Delete this thread?')"
      :desc="tr('The comment and all its replies are deleted for everyone')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmThread = null) }, { label: tr('Delete thread'), kind: 'destructed', onClick: removeThread }]"
      @close="confirmThread = null"
    />
    <AppConfirm
      v-if="confirmMsg"
      :title="tr('Delete this comment?')"
      :desc="tr('It\'s deleted for everyone')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmMsg = null) }, { label: tr('Delete'), kind: 'destructed', onClick: removeMsg }]"
      @close="confirmMsg = null"
    />
    <!-- 멤버가 아니거나 처음 초대받은 경우: 편집기 대신 안내(PRD/16 B) -->
    <AccessGate :project-id="projectId" :project-name="project.data.value?.name" />
  </div>
</template>

<style scoped>
.editor.commenting :deep(.canvas), .editor.commenting :deep(.canvas *) { cursor: none !important; }
/* 코멘트 모드: 캔버스 안쪽 요소는 마우스를 받지 않아요 — 마우스 아래 요소가 늘 캔버스(main) 하나라 브라우저가 커서를 다시 정하지 않아요.
   (움직일 때마다 프레임 · 글자 · 다른 사람 커서 등 아래 요소가 바뀌면 그 사이 잠깐 기본 화살표가 보였어요 — 사용자 지적 2026-11-27)
   코멘트 달기 · 영역 끌기는 창(capture)에서, 휠 확대 · 이동은 캔버스(main)에서 받아서 그대로예요 */
.editor.commenting :deep(.canvas *) { pointer-events: none !important; }
/* 코멘트 커서: 브라우저 커서 대신 마우스 자리에 직접 그려요(움직이는 동안 화살표로 바뀌던 것 — 사용자 요청 2026-11-27). 누르는 점 = 말풍선 왼쪽 아래(3, 17) */
.cm-cursor { position: fixed; left: 0; top: 0; z-index: 45; width: 20px; height: 20px; pointer-events: none; opacity: 0; will-change: transform; }
/* 따라가는 중: 탭 줄 아래 편집기 영역 테두리를 그 사람 색 3px 로(피그마와 같아요) */
.follow-ring { position: fixed; top: var(--iris-tabs-h, 44px); left: 0; right: 0; bottom: 0; z-index: 40; pointer-events: none; box-shadow: inset 0 0 0 3px var(--c); }
.follow-band { position: fixed; top: calc(var(--iris-tabs-h, 44px) + 12px); left: 50%; transform: translateX(-50%); z-index: 41; height: 32px; display: flex; align-items: center; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-03, 3px) 0 var(--ref-spacing-05); border-radius: var(--ref-radius-05); --sq-fill: var(--c); color: #FFFFFF; font-size: 12px; font-weight: 500; white-space: nowrap; filter: drop-shadow(0 2px 6px rgb(3 9 26 / 18%)); }
/* Spotlight 안내(받는 쪽): 연한 그 사람 색 바탕 위로 15초 동안 진한 색이 왼쪽부터 차올라요 — 다 차면 사라져요 */
.spot-ask { --sq-fill: color-mix(in srgb, var(--c) 55%, #FFFFFF); overflow: hidden; padding-right: var(--ref-spacing-02); }
.spot-ask > :not(.gauge) { position: relative; z-index: 1; }
.spot-ask .gauge { position: absolute; inset: 0; z-index: 0; background: var(--c); transform-origin: 0 50%; transform: scaleX(0); animation: spot-fill var(--t) linear forwards; border-radius: inherit; }
@keyframes spot-fill { to { transform: scaleX(1); } }
.fb-l { padding-left: var(--ref-spacing-02); }
.fb-stop.dark { --sq-fill: rgb(3 9 26 / 85%); }
.fb-stop.dark:hover { --sq-fill: rgb(3 9 26); }
.fav { display: flex; }
.fav > * + * { margin-left: -4px; }
.fav :deep(> *) { box-shadow: 0 0 0 1.5px var(--c); border-radius: 50%; }
.fb-x { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: #FFFFFF; }
.fb-x:hover { --sq-fill: rgb(255 255 255 / 18%); }
@media (prefers-reduced-motion: reduce) { .spot-ask .gauge { animation-duration: 0s; animation-delay: var(--t); } }
.fb-stop { height: 24px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); --sq-fill: rgb(255 255 255 / 18%); color: #FFFFFF; font-size: 12px; font-weight: 500; }
.fb-stop:hover { --sq-fill: rgb(255 255 255 / 28%); }
.fb-stop:focus-visible { outline: 2px solid #FFFFFF; outline-offset: 1px; }
/* 코멘트 모드 안내: 위 가운데 — 따라가는 중 · Spotlight 띠가 뜨면 그동안 숨겨요(겹치지 않게 — 사용자 요청 2026-11-27) */
.cchat { position: fixed; z-index: 45; box-sizing: border-box; padding: 5px 10px; border-radius: var(--ref-radius-05); --sq-fill: var(--c); filter: drop-shadow(0 1px 2px rgb(3 9 26 / 24%)) drop-shadow(0 2px 6px rgb(3 9 26 / 12%)); pointer-events: auto; transition: opacity .5s ease; }
/* 다 지운 뒤: 작은 네모(28×28) — 커서는 그대로 깜빡여요 */
.cchat.empty { min-width: 28px; text-align: center; }
.cchat.empty .cchat-grow { min-width: 8px; }
.cchat.fading { opacity: 0; }
/* 글자만큼 늘고 줄어요: 보이지 않는 같은 글자(::after)가 칸 크기를 정하고, 입력칸은 그 위에 겹쳐요(최대 240, 넘치면 줄바꿈 · 높이도) */
.cchat-grow { position: relative; display: inline-block; max-width: 240px; vertical-align: top; }
.cchat-grow::after { content: attr(data-value) ' '; display: block; visibility: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.cchat-grow::after, .cchat-in { font: inherit; font-size: 13px; line-height: 18px; font-weight: 500; letter-spacing: 0; padding: 0; margin: 0; }
/* 입력칸은 위에 겹치기만(크기에 끼어들지 않게 — 입력칸 기본 폭 때문에 빈 칸이 넓어지던 것) */
.cchat-in { position: absolute; inset: 0; width: 100%; height: 100%; min-width: 0; resize: none; overflow: hidden; border: 0; outline: 0; background: none; color: #FFFFFF; caret-color: #FFFFFF; white-space: pre-wrap; overflow-wrap: anywhere; }
.cchat-in::placeholder { color: rgb(255 255 255 / 70%); }
@media (prefers-reduced-motion: reduce) { .cchat { transition: none; } }
.cm-band { position: absolute; top: calc(var(--iris-gap, 8px) + 8px); left: 50%; transform: translateX(-50%); z-index: 7; height: 32px; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-size: 12px; font-weight: 500; pointer-events: none; }
.cm-band .dimt { opacity: .6; }
.ro-band { position: absolute; top: calc(var(--iris-gap, 8px) + 8px); left: 50%; transform: translateX(-50%); z-index: 7; height: 32px; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-size: 12px; font-weight: 500; pointer-events: none; }
.insp.ro { opacity: .64; }
.ro-note { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); margin: var(--ref-spacing-06) var(--ref-spacing-08) 0; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-size: 12px; line-height: 18px; }
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
.vars-btn { display: flex; align-items: center; gap: var(--ref-spacing-06); width: 100%; height: 32px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); text-align: left; }
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
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); padding: var(--ref-spacing-02) var(--ref-spacing-06); }
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
.obj { flex: none; display: flex; flex-direction: column; padding: var(--ref-spacing-02) var(--ref-spacing-10) var(--ref-spacing-08) var(--iris-insp-x); box-shadow: inset 0 -1px 0 var(--iris-line); }
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
.none { padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-08) var(--iris-insp-x); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
/* 토스트: 도구 막대(아래 16 + 높이 44 = 60) 위로 16 띄워서 */
.toast-wrap { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 300; pointer-events: none; font-size: 12px; line-height: 18px; } /* body 로 옮겨서 편집기 글자 크기(12 · 18)를 직접 정해요 — 예전 모양 그대로 */
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
