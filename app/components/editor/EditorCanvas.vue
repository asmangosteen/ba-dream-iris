<script setup lang="ts">
import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import { DEFAULT_STYLE, descendants, isGroupNode, isContainer, normAngle, ratioLocked, frameCss, frameDashStroke, frameSmoothLayers, frameStroke, gridBands, type LayoutGrid, type LayerNode, type LayerStyle, type LayerType } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { ellipsePath, radiiOf, rectPath, simplify, topImagePaint, vectorPath } from '~/canvas/paint'
import { squirclePath } from '~/canvas/squircle'
import { nodePathIn } from '~/canvas/vector'
import { booleanPath } from '~/canvas/boolean'
import { boxes0, constrain, slotIndex } from '~/canvas/layout'
import GridOverlay from '~/components/editor/GridOverlay.vue'
import CanvasRulers, { type GuideChange, type GuideFrame } from '~/components/editor/CanvasRulers.vue'
import { layerMenuItems, markIrisClip, pickedLayers, selectMatchingSay, svgOf, useAlHint, useLastCopy, useMixScreens, useRenameReq } from '~/composables/useLayerMenu'
import type { MenuItem } from '~/composables/useContextMenu'
import { DS_DRAG } from '~/composables/useDsInstances'
import { denorm, normalize, shapeVnet } from '~/canvas/vector'
import { vk, vselPoints, type VEdit, type VKey } from '~/canvas/vsel'
import { aabb, alignGuides, angleOf, apply, applyVec, handed, handleCursor, handleDir, invert, layerMatrix, localMatrix, measureGuides, mul, resizeLocal, snapAxis, snapMove, translate, union, type AlignKind, type ArrangeOp, type Guides, type Handle, type Mat, type Rect } from '~/canvas/geom'
import LayerView from '~/components/editor/LayerView.vue'
import { INSERT_SIZE, STORY_SIZE } from '~/components/editor/InstanceView.vue'
import { GHOST_KEY, ZOOM_KEY } from '~/canvas/ghost'
import { fmtNum } from '~/canvas/num'
import { scaledStyle } from '~/canvas/scale'
import { useImageSrc } from '~/canvas/images'
import { textShortcut } from '~/canvas/textKeys'
import { download, fileNameOf, renderExport } from '~/canvas/exporter'
import type { ExportSetting, Paint } from '~/canvas/schema'
import ImageCropOverlay from '~/components/editor/ImageCropOverlay.vue'
import { rotCursor } from '~/canvas/cursors'
import { cropFromFit, startCrop, useImageEdit } from '~/composables/useImageEdit'
import { subHover } from '~/composables/useInstanceTree'

/**
 * 무한 캔버스 + 화면 안 레이어 편집.
 * - 이동: 빈 곳 드래그 · 스페이스+드래그 · 가운데 버튼 · 트랙패드 스크롤 / 확대: ⌘·Ctrl+휠 · 핀치 · 단축키
 * - 화면: 고르기 · 끌어 옮기기, 빈 곳에 프레임 도구 → 새 화면
 * - 레이어: 고르기(Shift 여러 개) · 끌어 옮기기 · 변 · 모서리로 크기(⇧ 비율, ⌥ 가운데 기준) · 모서리 바깥으로 돌리기(⇧ 15°) · 두 번 눌러 글자 고치기, 화면 안에 사각형 · 프레임 · 텍스트 그리기
 * - 스냅: 옮기거나 크기를 바꿀 때 형제 · 부모의 가장자리 · 가운데 · 같은 간격에 붙어요(⌘ · Ctrl 누르면 끔) / ⌥ 호버: 고른 레이어와의 거리
 * 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y). 레이어 좌표는 화면(또는 부모 프레임) 왼쪽 위 기준
 */
export interface Viewport { x: number; y: number; zoom: number }

const props = defineProps<{ screens: ScreenRow[]; /** 프로젝트 썸네일로 정한 화면(없으면 첫 페이지의 첫 화면) */ coverId?: string | null; highlight?: string[]; /** 문서에서 마우스를 올린 REQ 가 가리키는 항목들(화면 · 레이어) — 청록 선 */ peek?: { label: string; items: { sid: string; ids: string[] }[] } | null; background?: string | null; pixelGrid?: boolean; snapPixel?: boolean; guides?: { x: number[]; y: number[] } }>()
const tool = defineModel<Tool>('tool', { required: true })
const vp = defineModel<Viewport>('viewport', { required: true })
const emit = defineEmits<{
  /** 프레임 우클릭 'Set as thumbnail'(그 화면 id) · 'Restore default thumbnail'(null) — 홈 목록의 프로젝트 썸네일 */
  thumbnail: [screenId: string | null]
  /** ⌘R 인데 이름 바꿀 게 없을 때: 이 탭만 새로 고침(피그마 데스크톱과 같아요) */
  reload: []
  move: [id: string, x: number, y: number, done: boolean]
  /** 화면(프레임) 변 · 모서리 끌어 크기 바꾸기 */
  'resize-screen': [id: string, rect: { x: number; y: number; width: number; height: number }, done: boolean]
  /** 여러 화면 정렬 · 균등 분배 (단축키) */
  'arrange-screens': [op: ArrangeOp]
  /** 캔버스 이름표에서 화면 이름 고치기 */
  'rename-screen': [id: string, name: string]
  create: [rect: { x: number; y: number; width: number; height: number }]
  hint: [text: string]
  /** 화면(프레임) 단위 동작 — 레이어를 고르지 않고 화면만 골랐을 때 */
  /** 캔버스에 파일을 끌어 놓았을 때(캔버스 좌표) */
  /** place: 놓은 자리의 화면(또는 캔버스) · 가장 안쪽 프레임 */
  'drop-files': [files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }]
  'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward', dx?: number, dy?: number]
  /** 가이드선 바뀜 */
  guides: [g: { x: number[]; y: number[] }]
  /** 보기 설정 단축키: ⇧' 픽셀 격자 · ⇧⌘' 픽셀에 맞추기 */
  view: [k: 'pixelGrid' | 'snapPixel']
  /** ⌥ 끌어서 화면 복제(놓은 자리) */
  'clone-screen': [id: string, x: number, y: number]
  /** 레이어와 섞어 고른 화면들 — 복제해서 놓기 · 복사 · 붙여넣기(새 화면들은 레이어 선택과 함께 골라 둬요) */
  'clone-screens': [items: { id: string; x: number; y: number }[]]
  'clip-screens': [ids: string[]]
  'paste-screens': [withLayers: boolean]
  /** 화면 단축키(피그마와 같아요): ⌘\\ UI 숨기기 · ⌥1 레이어 · ⌥2 에셋 · ⌥8 디자인 탭 · PageUp/PageDown 이전 · 다음 페이지 */
  ui: [k: 'toggle-ui' | 'left-file' | 'left-assets' | 'design' | 'prev-page' | 'next-page']
  /** 이미지 도구(⇧⌘K)로 누르거나 끌어서 놓을 자리(캔버스 좌표 · 끈 너비) */
  'place-image': [at: { x: number; y: number }, width: number | null, place?: { sid: string; parentId: string | null }]
}>()
const store = useLayerStore()
/** 더블클릭으로 글자 편집을 시작한 자리(LayerView 가 그 자리 단어를 골라요) */
const editAt = useState<{ x: number; y: number } | null>('iris-edit-at', () => null)

const el = ref<HTMLElement | null>(null)
const space = ref(false)
const panning = ref(false)
const draft = ref<{ x: number; y: number; width: number; height: number } | null>(null) // 캔버스 좌표
/** 그리는 중인 도형 종류(사각형 · 원 · 다각형 · 별): 그 모양 그대로 미리 보여요(피그마와 같아요) */
const draftType = ref<LayerType | null>(null)
const DRAFT_SHAPES = new Set<LayerType>(['rect', 'ellipse', 'polygon', 'star'])
const draftShape = computed(() => {
  const r = draft.value, t = draftType.value
  if (!r || !t || !DRAFT_SHAPES.has(t) || marqueeOn.value) return null
  const st = DEFAULT_STYLE[t] ?? {}
  const d = t === 'rect' ? rectPath(r.width, r.height, radiiOf(st)) : t === 'ellipse' ? ellipsePath(r.width, r.height) : vectorPath(t, st, r.width, r.height)
  return { d, fill: st.fill ?? '#E9EBED' }
})
/** ⌥ 끌기로 복제될 화면들의 자리(놓으면 복제) */
const mixGhosts = ref<{ x: number; y: number; width: number; height: number }[]>([])
/** 선 · 연필 미리보기(캔버스 좌표 점들) */
const draftPts = ref<[number, number][] | null>(null)

/** 줌 범위: 피그마와 같아요(2% ~ 25600%) */
const MIN = 0.02
const MAX = 256
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z))

function toWorld(clientX: number, clientY: number) {
  const r = el.value!.getBoundingClientRect()
  return { x: (clientX - r.left - vp.value.x) / vp.value.zoom, y: (clientY - r.top - vp.value.y) / vp.value.zoom }
}
function zoomAt(z: number, cx?: number, cy?: number) {
  const r = el.value?.getBoundingClientRect()
  const px = cx ?? (r ? r.width / 2 : 0)
  const py = cy ?? (r ? r.height / 2 : 0)
  const nz = clamp(z)
  const k = nz / vp.value.zoom
  vp.value = { zoom: nz, x: px - (px - vp.value.x) * k, y: py - (py - vp.value.y) * k }
}
/** 패널에 가리지 않는 가운데 영역(캔버스 좌표가 아닌 화면 좌표) */
function viewArea() {
  const r = el.value?.getBoundingClientRect()
  if (!r) return null
  return { left: 288, right: r.width - 312, top: 72, bottom: r.height - 72 }
}
/** 그 영역에 맞춘 자리 · 배율(바꾸지는 않아요) */
function fitTarget(x0: number, y0: number, x1: number, y1: number, maxZoom = 1) {
  const area = viewArea()
  if (!area) return null
  const w = Math.max(1, area.right - area.left), h = Math.max(1, area.bottom - area.top)
  const zoom = clamp(Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0), maxZoom) * 0.92)
  return { zoom, x: area.left + (w - (x1 - x0) * zoom) / 2 - x0 * zoom, y: area.top + (h - (y1 - y0) * zoom) / 2 - y0 * zoom }
}
/** 패널에 가리지 않는 가운데 영역에 맞추기 */
function fitRect(x0: number, y0: number, x1: number, y1: number, maxZoom = 1) {
  const t = fitTarget(x0, y0, x1, y1, maxZoom)
  if (t) vp.value = t
}
/** 보는 자리를 스르륵 옮기기(320ms · ease-out). 동작 줄이기면 바로. 새로 부르면 하던 움직임은 멈추고 이어서 */
let vpAnim = 0
function animateVp(to: { x: number; y: number; zoom: number }, ms = 320) {
  cancelAnimationFrame(vpAnim)
  if (ms <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { vp.value = to; return }
  const from = { ...vp.value }
  const t0 = performance.now()
  // 배율은 로그로 섞어야 확대 · 축소가 고르게 보여요. 화면 가운데의 캔버스 점을 기준으로 섞어요
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms)
    const e = 1 - Math.pow(1 - k, 3)
    const z = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e)
    const area = viewArea()
    const cx = area ? (area.left + area.right) / 2 : 0, cy = area ? (area.top + area.bottom) / 2 : 0
    const w0 = { x: (cx - from.x) / from.zoom, y: (cy - from.y) / from.zoom }, w1 = { x: (cx - to.x) / to.zoom, y: (cy - to.y) / to.zoom }
    const wx = w0.x + (w1.x - w0.x) * e, wy = w0.y + (w1.y - w0.y) * e
    vp.value = { zoom: z, x: cx - wx * z, y: cy - wy * z }
    if (k < 1) vpAnim = requestAnimationFrame(step)
    else vp.value = to
  }
  vpAnim = requestAnimationFrame(step)
}
/**
 * 문서 REQ 로 그 항목 보여 주기(누름 · 마우스 올림 공통) — 배율은 절대 바꾸지 않아요(화면 크기 유지).
 * - 프레임 안 항목(ids): 가운데 영역(양쪽 패널 사이, 가장자리 24 안쪽)에 다 보이면 그대로, 아니면 그 항목이 가운데 오게 스르륵 옮겨요
 * - 화면(프레임) 단위(ids 없음 · 못 찾음): 이미 절반 넘게 보이면 그대로, 아니면 화면 가운데로 옮겨요
 */
/**
 * 문서 REQ 를 눌렀을 때(사용자 요청 2026-11-26): 그 항목(레이어들, 없으면 화면)을 가운데 영역 한가운데로, 크게 확대해 보여 줘요.
 * 항목이 가운데 영역의 60%(화면 단위는 90%)를 채우는 배율 — 레이어는 최대 400%, 화면은 최대 100%. 스르륵 움직여요
 */
function focusOn(sid: string, ids: string[]) {
  const s = props.screens.find((v) => v.id === sid)
  const area = viewArea()
  if (!s || !area) return
  const boxes = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  const rs = boxes.length ? boxes : [rectOf(s)]
  const x0 = Math.min(...rs.map((b) => b.x)), y0 = Math.min(...rs.map((b) => b.y)), x1 = Math.max(...rs.map((b) => b.x + b.w)), y1 = Math.max(...rs.map((b) => b.y + b.h))
  const aw = area.right - area.left, ah = area.bottom - area.top
  const fill = boxes.length ? 0.6 : 0.9
  const z = Math.min(boxes.length ? 4 : 1, Math.max(0.02, Math.min((aw * fill) / Math.max(1, x1 - x0), (ah * fill) / Math.max(1, y1 - y0))))
  const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2
  animateVp({ zoom: z, x: cx - ((x0 + x1) / 2) * z, y: cy - ((y0 + y1) / 2) * z }, 420)
}
function reveal(sid: string, ids: string[]) {
  const s = props.screens.find((v) => v.id === sid)
  const area = viewArea()
  if (!s || !area) return
  const boxes = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  const rs = boxes.length ? boxes : [rectOf(s)]
  const x0 = Math.min(...rs.map((b) => b.x)), y0 = Math.min(...rs.map((b) => b.y)), x1 = Math.max(...rs.map((b) => b.x + b.w)), y1 = Math.max(...rs.map((b) => b.y + b.h))
  const { zoom: z, x: vx, y: vy } = vp.value
  const sx0 = x0 * z + vx, sy0 = y0 * z + vy, sx1 = x1 * z + vx, sy1 = y1 * z + vy
  const M = 24
  if (boxes.length) {
    if (sx0 >= area.left + M && sx1 <= area.right - M && sy0 >= area.top + M && sy1 <= area.bottom - M) return
  } else {
    // 화면: 보이는 부분이 (화면 · 가운데 영역 중 작은 쪽의) 절반을 넘으면 그대로
    const ox = Math.max(0, Math.min(sx1, area.right) - Math.max(sx0, area.left)), oy = Math.max(0, Math.min(sy1, area.bottom) - Math.max(sy0, area.top))
    const need = Math.min((sx1 - sx0) * (sy1 - sy0), (area.right - area.left) * (area.bottom - area.top)) * 0.5
    if (ox * oy >= need) return
  }
  const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2
  animateVp({ zoom: z, x: cx - ((x0 + x1) / 2) * z, y: cy - ((y0 + y1) / 2) * z })
}
function fit(ids?: string[]) {
  const list = ids?.length ? props.screens.filter((s) => ids.includes(s.id)) : props.screens
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  if (!list.length) { vp.value = { zoom: 0.5, x: 352, y: 104 }; return }
  fitRect(Math.min(...list.map((s) => s.x)), Math.min(...list.map((s) => s.y)), Math.max(...list.map((s) => s.x + s.width)), Math.max(...list.map((s) => s.y + s.height)))
}
function onWheel(e: WheelEvent) {
  if ((e.target as HTMLElement).closest?.('[contenteditable="true"]')) return
  e.preventDefault()
  const r = el.value!.getBoundingClientRect()
  if (e.ctrlKey || e.metaKey) zoomAt(vp.value.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top)
  else {
    const k = e.deltaMode ? 16 : 1
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
    vp.value = { ...vp.value, x: vp.value.x - dx * k, y: vp.value.y - dy * k }
  }
}

// ---------------------------------------------------------------------------
// 끌기
// ---------------------------------------------------------------------------
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const
const EDGES = ['n', 's', 'e', 'w'] as const
type Targets = { sibs: Rect[]; parents: Rect[] }
/** 그리는 중 Space(피그마와 같아요): 누른 순간의 포인터 · 시작점 — 손을 뗄 때까지 그리던 것을 통째로 옮겨요 */
type SpaceMove = { x: number; y: number; ox: number; oy: number }
/**
 * 끌어 그린 상자(피그마와 같아요): ⇧ 정비율, ⌥ 누른 점이 가운데
 */
function boxFrom(ax: number, ay: number, bx: number, by: number, square: boolean, center: boolean) {
  let dx = bx - ax, dy = by - ay
  if (square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m }
  if (center) return { x: ax - Math.abs(dx), y: ay - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 }
  return { x: Math.min(ax, ax + dx), y: Math.min(ay, ay + dy), w: Math.abs(dx), h: Math.abs(dy) }
}
/** 그리는 중 Space 로 시작점 옮기기: 누르고 있는 동안 시작점이 포인터를 따라가요 */
function spaceShift(dg: { sp?: SpaceMove }, start: { x: number; y: number }, px: number, py: number): { x: number; y: number } {
  if (!space.value) { dg.sp = undefined; return start }
  if (!dg.sp) dg.sp = { x: px, y: py, ox: start.x, oy: start.y }
  return { x: dg.sp.ox + px - dg.sp.x, y: dg.sp.oy + py - dg.sp.y }
}
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'screen'; id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; targets: Rect[]; moved: boolean; clickLayer?: string; dup?: boolean; canDup?: boolean }
  | { kind: 'draw'; wx: number; wy: number; moved: boolean; sp?: SpaceMove }
  | { kind: 'placeImage'; wx: number; wy: number; moved: boolean }
  | { kind: 'layers'; xcarry?: { sid: string; id: string; x: number; y: number; inv: Mat }[]; xbefore?: [string, string][]; sid: string; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; inv: Record<string, Mat>; b0: Rect | null; targets: Targets; before: string; moved: boolean; carry: { id: string; x: number; y: number }[]; clickLayer?: string; out?: boolean; parent0?: string | null; duped?: boolean; mixIds?: string[]; carryDup?: boolean ; prevDup?: { ids: string[]; orig: Record<string, { x: number; y: number }>; inv: Record<string, Mat>; targets: Targets; carry: { id: string; x: number; y: number }[] } }
  | { kind: 'drawLine'; sid: string; parentId: string | null; px: number; py: number; lx: number; ly: number; ex: number; ey: number; arrow: boolean; moved: boolean; sp?: SpaceMove; c?: { x: number; y: number } }
  | { kind: 'pencil'; sid: string; parentId: string | null; px: number; py: number; pts: [number, number][]; moved: boolean }
  | { kind: 'resize'; sid: string; id: string; handle: Handle; sx: number; sy: number; g: { cx: number; cy: number; w: number; h: number; angle: number }; pinv: Mat; ratio: boolean; targets: Targets; before: string; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; sub0?: string; img0?: { i: number; x: number; y: number; R: { x: number; y: number; w: number; h: number }; p: Paint } }
  | { kind: 'pen'; moved: boolean }
  | { kind: 'vpt'; sid: string; id: string; pi: number; qi: number; part: 'a' | 'i' | 'o'; sx: number; sy: number; abs0: ReturnType<typeof denorm>; inv: Mat; x0: number; y0: number; before: string; moved: boolean; virtual?: { cx: number; cy: number; r: number; qi: number }[]; group?: [number, number][]; collapse?: VKey }
  | { kind: 'resizeMany'; sid: string; handle: Handle; sx: number; sy: number; u0: Rect; items: { id: string; b: Rect; p: { x: number; y: number }; w0: number; h0: number; rot: number; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; sub0?: string }[]; targets: Targets; before: string; moved: boolean }
  | { kind: 'resizeScreen'; id: string; handle: Handle; sx: number; sy: number; o: Rect; targets: Rect[]; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; before?: string; scale0?: string }
  | { kind: 'rotate'; sid: string; id: string; cx: number; cy: number; a0: number; r0: number; sign: number; before: string; moved: boolean }
  | { kind: 'rotateScreen'; sid: string; cx: number; cy: number; a0: number; r0: number; before: string; moved: boolean }
  | { kind: 'drawLayer'; sid: string; type: LayerType; parentId: string | null; px: number; py: number; lx: number; ly: number; moved: boolean; sp?: SpaceMove }
  | { kind: 'marquee'; sid: string; wx: number; wy: number; base: string[]; moved: boolean; deep?: boolean; click?: string; add?: boolean; pick?: boolean; within?: string }
  | { kind: 'vmarquee'; x0: number; y0: number; base: VKey[]; moved: boolean }
  | { kind: 'marqueeCanvas'; wx: number; wy: number; moved: boolean; baseScreens: string[]; baseLayers: string[]; deep?: boolean }
  | { kind: 'screens'; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; b0: Rect; targets: Rect[]; moved: boolean; dup?: boolean }
let drag: Drag | null = null

const isNative = (s: ScreenRow) => s.source === 'native'
const isCanvas = (s: { id: string }) => isPageCanvas(s.id)
/** 캔버스에 그리는 화면들: 캔버스 층 · 숨긴 화면(레이어 목록 눈)은 빼요 — 숨긴 화면은 그리지도, 붙지도, 잡히지도 않아요 */
const realScreens = computed(() => props.screens.filter((s) => !isCanvas(s) && !store.doc(s.id).frame?.hidden))
const canvasDoc = computed(() => props.screens.find(isCanvas) ?? null)
/** 캔버스 위 맨 위 단계 레이어: 섹션은 화면 아래(under), 나머지는 화면 위(over) */
const canvasRoots = computed(() => {
  const c = canvasDoc.value
  if (!c) return { under: [] as string[], over: [] as string[] }
  const d = store.doc(c.id)
  return { under: d.rootIds.filter((id) => d.nodes[id]?.type === 'section'), over: d.rootIds.filter((id) => d.nodes[id]?.type !== 'section') }
})
function toggleMulti(id: string) {
  // 레이어를 고른 채 다른 화면을 Shift 클릭: 레이어는 그대로 두고 화면을 함께(피그마와 같아요)
  if (store.layerIds.value.length && store.screenId.value !== id) { mix.value = mix.value.includes(id) ? mix.value.filter((x) => x !== id) : [...mix.value, id]; return }
  const cur = multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) && store.screenId.value !== id ? [store.screenId.value] : []
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
}
/** 상자 선택 · Shift 클릭으로 함께 고른 화면들(첫 번째가 store.screenId). 페이지가 v-model:multi 로 받아 '화면 n개' 패널을 그려요 */
const multi = defineModel<string[]>('multi', { default: () => [] })
watch(() => store.screenId.value, (id) => { if ((!id || !multi.value.includes(id)) && multi.value.length) multi.value = [] })
/** 레이어와 섞어 고른 화면들: 레이어 선택이 비거나 다른 화면으로 바뀌면 곧바로(sync) 비워요 — 섞어 고르는 쪽은 바꾼 뒤에 다시 채워요 */
const mix = useMixScreens()
watch(() => store.screenId.value, () => { if (mix.value.length) mix.value = [] }, { flush: 'sync' })
watch(() => store.layerIds.value, (now, was) => {
  if (!mix.value.length) return
  // Shift 로 더하거나 뺀 것(한쪽이 다른 쪽을 다 품으면)은 그대로, 새로 고르면 비워요
  const sub = (a: string[], b: string[]) => a.every((x) => b.includes(x))
  if (!now.length || !(sub(was, now) || sub(now, was))) mix.value = []
}, { flush: 'sync' })
/** 선택을 바꾸는 일(⌥ 복제 등)을 하는 동안에도 함께 고른 화면은 그대로 */
function keepMix(fn: () => void) { const saved = [...mix.value]; fn(); mix.value = saved }
/** 섞어 고른 화면들이 함께 따라갈 자리 */
const mixCarry = () => mix.value.map((id) => props.screens.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v).map((v) => ({ id: v.id, x: v.x, y: v.y }))
const BOX_TOOLS: Partial<Record<Tool, LayerType>> = { rect: 'rect', ellipse: 'ellipse', polygon: 'polygon', star: 'star', text: 'text', frame: 'frame', section: 'section' }
const drawType = (t: Tool): LayerType | null => BOX_TOOLS[t] ?? null
const pointTool = (t: Tool) => t === 'line' || t === 'arrow' || t === 'pencil'
/** 선 · 화살표 · 연필 그리기 시작 */
function startPoints(sid: string, lx: number, ly: number) {
  const parentId = frameAt(sid, lx, ly)
  const p = parentId ? store.absPos(sid, parentId) : { x: 0, y: 0 }
  if (tool.value === 'pencil') drag = { kind: 'pencil', sid, parentId, px: p.x, py: p.y, pts: [[lx, ly]], moved: false }
  else drag = { kind: 'drawLine', sid, parentId, px: p.x, py: p.y, lx, ly, ex: lx, ey: ly, arrow: tool.value === 'arrow', moved: false }
}

/** 화면 안 좌표에서, 그 위치를 품는 가장 안쪽 프레임 레이어 */
function frameAt(sid: string, lx: number, ly: number, exclude?: Set<string>): string | null {
  const d = store.doc(sid)
  let found: string | null = null
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const n = d.nodes[id]
      if (!n || !isContainer(n) || n.hidden || n.locked || exclude?.has(id)) continue
      const p = store.absPos(sid, id)
      // 그룹 · 불리언은 들어갈 곳이 아니에요(피그마와 같아요) — 그룹 안의 프레임은 돼요
      if (lx >= p.x && ly >= p.y && lx <= p.x + n.w && ly <= p.y + n.h) { if (!isGroupNode(n) && n.type !== 'boolean') found = id; if (n.type !== 'boolean') walk(n.children ?? []) }
    }
  }
  walk(d.rootIds)
  return found
}

/**
 * 끄는 중 부모 바꾸기(피그마와 같아요): 포인터가 프레임 밖으로 나가면 바깥 프레임(또는 화면)으로, 다른 프레임 위면 그 안으로.
 * 화면 밖(다른 화면 · 캔버스)으로 나가면 놓을 때 옮겨요(out)
 */
const dragOut = ref<string | null>(null)
const dragOutIds = ref<string[]>([])
/**
 * 화면 밖으로 끄는 레이어는 화면 자르기와 상관없이 맨 위에 따로 그려요(원래 자리는 숨김).
 * 화면은 계속 잘린 채라 같은 화면의 다른 레이어(넘친 이미지 등)가 함께 딸려 나와 보이지 않아요
 */
/** 끌어 들어갈 다른 화면: 놓기 전에도 그 화면 모양대로 잘라 보여요(놓은 뒤와 똑같이 — 피그마와 같아요) */
const dropScreen = ref<string | null>(null)
const ghost = computed(() => {
  const sid = dragOut.value
  const s = sid ? props.screens.find((v) => v.id === sid) : null
  if (!sid || !s) return null
  const d = store.doc(sid)
  const items = dragOutIds.value.filter((id) => d.nodes[id]).map((id) => {
    const p = d.nodes[id]!.parentId
    const o = p ? store.absPos(sid, p) : { x: 0, y: 0 }
    return { id, x: o.x, y: o.y }
  })
  const t = dropScreen.value ? props.screens.find((v) => v.id === dropScreen.value) : null
  const tf = t ? store.doc(t.id).frame : undefined
  const clip = t && tf?.clip !== false
    ? { x: t.x, y: t.y, w: t.width, h: t.height, r: tf?.radii ? tf.radii.map((r) => r + 'px').join(' ') : tf?.radius ? tf.radius + 'px' : undefined }
    : null
  return { sid, x: s.x ?? 0, y: s.y ?? 0, items, clip }
})
provide(GHOST_KEY, computed(() => (ghost.value ? { sid: ghost.value.sid, ids: new Set(dragOutIds.value) } : null)))
provide(ZOOM_KEY, computed(() => vp.value.zoom))
function screenUnder(wx: number, wy: number) {
  return [...realScreens.value].reverse().find((v) => isNative(v) && wx >= v.x && wy >= v.y && wx <= v.x + v.width && wy <= v.y + v.height) ?? null
}
/** 포인터 아래가 피그마에서 가져온 화면(그림이라 레이어를 넣을 수 없어요)뿐이면 놓은 뒤 안내 */
const FIGMA_DROP_HINT = 'Figma frames can\'t hold layers · placed on the canvas'
function overFigmaOnly(wx: number, wy: number) {
  return !screenUnder(wx, wy) && realScreens.value.some((v) => !isNative(v) && wx >= v.x && wy >= v.y && wx <= v.x + v.width && wy <= v.y + v.height)
}
function retarget(dg: Extract<Drag, { kind: 'layers' }>, e: PointerEvent, dx: number, dy: number) {
  const sc = props.screens.find((v) => v.id === dg.sid)
  if (!sc || dg.carry.length) return
  // 끄는 중 Space: 프레임 안팎으로 넣고 빼지 않고 그 자리 부모 그대로 옮기기(피그마와 같아요)
  if (space.value) { setDropLine(null); return }
  const w = toWorld(e.clientX, e.clientY)
  const under = screenUnder(w.x, w.y)
  const out = isCanvas(sc) ? !!under : under?.id !== sc.id
  dg.out = out
  const d = store.doc(sc.id)
  const roots = dg.ids.filter((id) => !dg.ids.some((o) => o !== id && descendants(d, o).includes(id)))
  // 화면 밖으로 끌거나(캔버스 · 다른 화면), 캔버스 위 레이어를 화면 안으로 끌면 맨 위 고스트 층에 그려요
  dragOut.value = out ? sc.id : null
  dragOutIds.value = dragOut.value ? roots : []
  dropScreen.value = out && under && under.id !== sc.id ? under.id : null
  // 들어갈 프레임 · 화면에 파란 테두리(피그마와 같아요): 다른 화면으로 나가면 그 화면, 같은 화면이면 부모가 바뀔 때 새 부모
  if (out) { setDropLine(under ? rectOf(under) : null); return }
  const ex = new Set(roots.flatMap((id) => descendants(d, id)))
  const target = frameAt(sc.id, w.x - sc.x, w.y - sc.y, ex)
  // 그룹 · 불리언 안의 레이어는 같은 프레임 안에서 끄는 동안 그대로 그 안에(피그마와 같아요)
  const frameOf = (pid: string | null | undefined) => { let q = pid ?? null; while (q && (isGroupNode(d.nodes[q]) || d.nodes[q]?.type === 'boolean')) q = d.nodes[q]!.parentId ?? null; return q }
  setDropLine(target !== frameOf(dg.parent0) ? (target ? layerWorld(sc, target) : isCanvas(sc) ? null : rectOf(sc)) : null)
  const moving = roots.filter((id) => d.nodes[id] && d.nodes[id]!.parentId !== target && frameOf(d.nodes[id]!.parentId) !== target)
  if (moving.length) store.reparent(sc.id, moving, target)
  for (const id of moving) {
    const n = d.nodes[id]
    if (!n) continue
    dg.inv[id] = invert(parentWorld(sc, id))
    const v = applyVec(dg.inv[id]!, dx, dy)
    dg.orig[id] = { x: n.x - v.x, y: n.y - v.y }
  }
  // 오토 레이아웃 안: 포인터 자리로 순서 바꾸기(자리는 레이아웃이 정해요)
  const p = target ? d.nodes[target] : null
  if (p?.style.layout) {
    const flow = roots.filter((id) => d.nodes[id]?.parentId === target && !d.nodes[id]!.absolute)
    if (flow.length) {
      const pp = store.absPos(sc.id, p.id)
      // 자리: 포인터 대신 끌고 있는 것의 가운데로 — ⌥ 복제본이 원본과 자리를 바꿨다 돌아오지 않고 원본 바로 아래에서 시작해요
      const c = dg.b0 ? { x: dg.b0.x + dg.b0.w / 2 + dx, y: dg.b0.y + dg.b0.h / 2 + dy } : w
      const idx = slotIndex(d, p, { x: c.x - sc.x - pp.x, y: c.y - sc.y - pp.y }, new Set(flow))
      const rest = (p.children ?? []).filter((c) => !flow.includes(c))
      const next = [...rest.slice(0, idx), ...flow, ...rest.slice(idx)]
      if (next.join() !== (p.children ?? []).join()) p.children = next
    }
  }
  store.relayout(sc.id)
}

// ---------------------------------------------------------------------------
// 펜(P) · 벡터 점 편집 — 피그마와 같아요: 누르면 점, 끌면 곡선 핸들, 첫 점을 누르면 닫기, Enter · Esc 로 끝내기
// ---------------------------------------------------------------------------
type APt = { x: number; y: number; i?: [number, number]; o?: [number, number] }
const pen = ref<{ sid: string; parentId: string | null; px: number; py: number; pts: APt[]; hover: [number, number] | null } | null>(null)
/** 점 편집 상태(오른쪽 패널의 편집 칸도 같이 봐요). sel[0] 이 -1 이면 아직 도형인 꼭짓점 */
const vedit = useState<VEdit | null>('iris-vedit', () => null)
/** 아직 도형인 레이어의 꼭짓점(편집 손잡이 자리): 사각형은 상자 네 귀퉁이, 나머지는 도형 경로의 점들 */
function shapeCorners(n: LayerNode): [number, number][] {
  return n.type === 'rect' ? [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]] : denorm(shapeVnet(n), n.w, n.h).flatMap((p) => p.pts.map((q) => [q.x, q.y] as [number, number]))
}
/** 지금 고른 점 전부(고른 선의 양 끝 포함) */
function vselOf(ve: VEdit): VKey[] {
  const n = store.node(ve.sid, ve.id)
  if (!n) return []
  const corners = n.type === 'vector' ? [] : shapeCorners(n)
  return vselPoints(ve, (pi) => (pi < 0 ? corners.length : n.vnet?.[pi]?.pts.length ?? 0), (pi) => (pi < 0 ? n.type !== 'line' : !!n.vnet?.[pi]?.closed))
}
/** 곡선 손잡이 대칭(Mirroring): none · angle(각도만) · both(각도 + 길이) — 패널에서 골라요 */
const mirror = useState<'none' | 'angle' | 'both'>('iris-mirror', () => 'both')
/** 패널에서 고친 점 자리(부모 좌표): 캔버스가 받아서 옮겨요 */
const vptSet = useState<{ x?: number; y?: number; t: number } | null>('iris-vpt-set', () => null)
const screenOrigin = (sid: string) => { const v = props.screens.find((x) => x.id === sid); return v && !isCanvas(v) ? { x: v.x, y: v.y } : { x: 0, y: 0 } }
function penDown(e: PointerEvent, screen?: ScreenRow) {
  const w = toWorld(e.clientX, e.clientY)
  if (!pen.value) {
    const target = screen && isNative(screen) && !isCanvas(screen) ? screen : screenUnder(w.x, w.y) ?? canvasDoc.value
    if (!target) return
    const o = screenOrigin(target.id)
    const parentId = frameAt(target.id, w.x - o.x, w.y - o.y)
    const pp = parentId ? store.absPos(target.id, parentId) : { x: 0, y: 0 }
    pen.value = { sid: target.id, parentId, px: pp.x, py: pp.y, pts: [], hover: null }
  }
  const pn = pen.value
  const o = screenOrigin(pn.sid)
  const sp = snapPoint(w.x, w.y, pn.pts.map((q) => ({ x: q.x + o.x, y: q.y + o.y })), pointTargets(pn.sid), snapOff(e) || e.shiftKey)
  let lx = sp.x - o.x, ly = sp.y - o.y
  // ⇧: 앞 점에서 45° 단위(피그마와 같아요)
  const prev = pn.pts[pn.pts.length - 1]
  if (e.shiftKey && prev) ({ x: lx, y: ly } = snap45(prev.x, prev.y, lx, ly))
  const first = pn.pts[0]
  if (first && pn.pts.length >= 2 && Math.hypot(first.x - lx, first.y - ly) * vp.value.zoom < 8) { finishPen(true); return }
  pn.pts.push({ x: lx, y: ly })
  drag = { kind: 'pen', moved: false }
}
/** 앞 점에서 45° 단위로 맞춘 자리 */
function snap45(ax: number, ay: number, bx: number, by: number) {
  const a = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4)
  const len = Math.hypot(bx - ax, by - ay)
  return { x: ax + Math.cos(a) * len, y: ay + Math.sin(a) * len }
}
function finishPen(closed: boolean) {
  const pn = pen.value
  pen.value = null
  guides.value = null
  if (!pn || pn.pts.length < 2) return
  const box = normalize([{ pts: pn.pts, closed }])
  const id = store.add(pn.sid, pn.parentId, { type: 'vector', x: Math.round((box.x - pn.px) * 100) / 100, y: Math.round((box.y - pn.py) * 100) / 100, w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100, vnet: box.vnet })
  // 다 그리면 이동 도구로, 그린 벡터를 골라 둬요(피그마와 같아요 — Enter 한 번 더 = 점 편집)
  store.selectLayer(pn.sid, id)
  tool.value = 'move'
}
watch(tool, (t) => { if (t !== 'pen' && pen.value) finishPen(false); if (t !== 'move') vedit.value = null })
watch(() => store.layerIds.value.join(), () => { if (vedit.value && (store.layerIds.value.length !== 1 || store.layerIds.value[0] !== vedit.value.id)) vedit.value = null })
/** 점 편집 들어가기: 벡터가 아니면 벡터로 바꿔서(피그마와 같아요) */
const EDITABLE = new Set(['vector', 'line', 'path', 'polygon', 'star', 'ellipse', 'rect'])
function enterVectorEdit(sid: string, id: string) {
  const n = store.node(sid, id)
  if (!n || n.locked || !EDITABLE.has(n.type)) return false
  // 도형(사각형 · 원 등)은 그대로 둬요 — 점을 실제로 옮기는 순간에만 벡터로 바꿔요(피그마와 같아요)
  store.selectLayer(sid, id)
  vedit.value = { sid, id, sel: null, pts: [], segs: [] }
  return true
}
/** 도형 점 편집 중 회색 상자(피그마처럼 모양 대신 상자 선) */
/** 선 · 벡터 · 다각형처럼 상자가 아닌 모양: 화면 좌표로 그릴 경로(모양선) */
const OUTLINE_TYPES = new Set(['vector', 'path', 'line', 'polygon', 'star', 'boolean'])
function outlineOf(sid: string, id: string) {
  const s = props.screens.find((v) => v.id === sid)
  const n = s ? store.node(sid, id) : undefined
  if (!s || !n || !OUTLINE_TYPES.has(n.type)) return null
  const d = n.type === 'boolean' ? booleanPath(store.doc(sid), n) : vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
  if (!d) return null
  const m = worldMat(s, id), z = vp.value.zoom
  return { d, tf: `matrix(${m.a * z} ${m.b * z} ${m.c * z} ${m.d * z} ${m.e * z + vp.value.x} ${m.f * z + vp.value.y})` }
}
/** 마우스를 올렸을 때 모양선은 쓰지 않아요 — 어떤 레이어든 네모 상자(hoverOutline)로 잡혀요(사용자 요청 2026-11-24). 고른 펜 · 선의 모양선(selShape)은 그대로 */
const hoverShape = computed(() => {
  if (HOVER_BOX_ONLY) return null
  void tick.value
  void vp.value
  const h = hover.value
  if (!h?.id || vedit.value || moving.value || marqueeOn.value || draft.value || guides.value || (tool.value !== 'move' && tool.value !== 'scale')) return null
  if (store.screenId.value === h.sid && store.layerIds.value.includes(h.id)) return null
  const n = store.node(h.sid, h.id)
  return n && !n.locked ? outlineOf(h.sid, h.id) : null
})
/** 고른 펜 · 선 레이어: 상자 + 안에 모양선 1px */
const selShape = computed(() => {
  void tick.value
  void vp.value
  const sg = single.value, s = selScreen.value
  return sg && s && !vedit.value ? outlineOf(s.id, sg.id) : null
})
/** 편집 중인 도형 위 파란 빗금(피그마처럼 편집 중인 모양을 표시) */
const vshape = computed(() => {
  void tick.value
  const ve = vedit.value
  const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
  const n = ve && s ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !s || !n) return null
  const d = n.type === 'rect' ? rectPath(n.w, n.h, radiiOf(n.style)) : n.type === 'ellipse' ? ellipsePath(n.w, n.h) : vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
  const m = worldMat(s, ve.id), z = vp.value.zoom
  const filled = !!n.style.fill || !!n.style.fills?.some((f) => f.visible !== false)
  return { d, tf: `matrix(${m.a * z} ${m.b * z} ${m.c * z} ${m.d * z} ${m.e * z + vp.value.x} ${m.f * z + vp.value.y})`, pw: 6 / z, filled }
})
// 정해진 점 자리(패널 X · Y): 고른 점들(고른 선의 양 끝 포함)을 함께 옮겨요 — X · Y 는 고른 점들 상자의 왼쪽 위.
// 아직 도형이면 벡터로 바꾸고 고른 꼭짓점들(둥근 모서리면 양 끝 점들)을, 벡터면 그 점들을
watch(vptSet, (r) => {
  if (!r) return
  vptSet.value = null
  moveVsel({ x: r.x, y: r.y })
})
/** 고른 점들 옮기기: x · y = 고른 점들 상자 왼쪽 위를 그 자리로(패널), dx · dy = 그만큼(방향키) */
function moveVsel(r: { x?: number; y?: number; dx?: number; dy?: number }) {
  const ve = vedit.value
  if (!ve) return
  const keys = vselOf(ve)
  if (!keys.length) return
  let n = store.node(ve.sid, ve.id)
  if (!n) return
  let group: [number, number][]
  let cur: { x: number; y: number }
  if (keys[0]![0] < 0) {
    const corners = shapeCorners(n)
    const rads = n.type === 'rect' ? radiiOf(n.style) : []
    const cs = keys.map(([, qi]) => ({ c: corners[qi] ?? [0, 0], r: rads[qi] ?? 0 }))
    cur = { x: Math.min(...cs.map((v) => v.c[0])), y: Math.min(...cs.map((v) => v.c[1])) }
    // 사각형은 꼭짓점 네 개 그대로 벡터로(모서리 둥글기는 꼭짓점 r), 다른 도형은 곡선 점으로
    const corner = store.toCornerVector(ve.sid, ve.id)
    if (!corner) store.flatten(ve.sid, [ve.id])
    n = store.node(ve.sid, ve.id)!
    const abs = denorm(n.vnet ?? [], n.w, n.h)
    group = []
    if (corner) group = keys.map(([, qi]) => [0, qi] as [number, number])
    else abs.forEach((p, pi) => p.pts.forEach((q, qj) => { if (cs.some((v) => Math.abs(q.x - v.c[0]) <= v.r + 0.5 && Math.abs(q.y - v.c[1]) <= v.r + 0.5)) group.push([pi, qj]) }))
    if (!group.length) return
    ve.pts = group
    ve.segs = []
    ve.sel = group[0]!
  } else {
    const abs = denorm(n.vnet ?? [], n.w, n.h)
    group = keys.filter(([pi, qi]) => abs[pi]?.pts[qi])
    if (!group.length) return
    const qs = group.map(([pi, qi]) => abs[pi]!.pts[qi]!)
    cur = { x: Math.min(...qs.map((q) => q.x)), y: Math.min(...qs.map((q) => q.y)) }
  }
  const dx = r.dx ?? (r.x === undefined ? 0 : r.x - (n.x + cur.x)), dy = r.dy ?? (r.y === undefined ? 0 : r.y - (n.y + cur.y))
  const abs = denorm(n.vnet ?? [], n.w, n.h)
  const mv = (p?: [number, number]) => (p ? [p[0] + dx, p[1] + dy] as [number, number] : p)
  for (const [pi, qj] of group) { const q = abs[pi]?.pts[qj]; if (q) { q.x += dx; q.y += dy; q.i = mv(q.i); q.o = mv(q.o) } }
  const box = normalize(abs)
  store.update(ve.sid, [ve.id], { x: n.x + box.x, y: n.y + box.y, w: box.w, h: box.h, vnet: box.vnet })
}
/** 점 편집 중 모든 점 고르기(⌘A) */
function selectAllVpts() {
  const ve = vedit.value
  const n = ve ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !n) return
  const all: VKey[] = n.type === 'vector' ? (n.vnet ?? []).flatMap((p, pi) => p.pts.map((_, qi) => [pi, qi] as VKey)) : shapeCorners(n).map((_, qi) => [-1, qi] as VKey)
  ve.pts = all
  ve.segs = []
  ve.sel = all[0] ?? null
}
/** 점 편집 중 빈 곳 끌기: 상자 안 점 고르기(⇧ 면 더하기) — 화면(캔버스 요소) 좌표 */
const vmarq = ref<{ x: number; y: number; w: number; h: number } | null>(null)
/**
 * 모서리 원형 손잡이(피그마와 같아요): 고른 사각형 · 프레임 · 이미지에 마우스를 올리면 모서리 안쪽에 — 끌면 Corner radius,
 * ⌥ 를 누르고 끌면 그 모서리만. 끄는 동안 'Radius n' 표시, 실행 취소 한 번
 */
const RAD_TYPES = new Set(['rect', 'frame', 'image'])
const radDrag = ref<{ x: number; y: number; v: number } | null>(null)
/** 화면 좌표의 마우스(ptr)가 돌린 선택 상자 안인지(margin 만큼 바깥도) */
function ptrInBox(g: { cx: number; cy: number; w: number; h: number; angle: number }, margin = 0) {
  const p = ptr.value
  if (!p) return false
  const z = vp.value.zoom, cx = g.cx * z + vp.value.x, cy = g.cy * z + vp.value.y
  const a = (-(g.angle || 0) * Math.PI) / 180, dx = p.x - cx, dy = p.y - cy
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= (g.w * z) / 2 + margin && Math.abs(ly) <= (g.h * z) / 2 + margin
}
const radHandles = computed(() => {
  void tick.value
  const sg = single.value
  const s = selScreen.value
  if (!sg || !s || sg.locked || store.editing.value || tool.value !== 'move') return null
  const n = store.node(s.id, sg.id)
  if (!n || !RAD_TYPES.has(n.type)) return null
  const z = vp.value.zoom, W = sg.w * z, H = sg.h * z
  if (W < 40 || H < 40) return null
  // 마우스가 선택 상자 안(바깥 8px 여유 포함)이면 보여요 — 손잡이 위로 올라가도 사라지지 않게(깜박이다 레이어가 잡히던 문제)
  if (!radDrag.value && !(hover.value?.sid === s.id && hover.value?.id === sg.id) && !ptrInBox(sg, 8)) return null
  const r = radiiOf(n.style)
  return (['nw', 'ne', 'se', 'sw'] as const).map((c, i) => {
    const off = Math.min(Math.max(12, (r[i] ?? 0) * z), W / 2, H / 2)
    return { c: i, x: c === 'nw' || c === 'sw' ? off : W - off, y: c === 'nw' || c === 'ne' ? off : H - off }
  })
})
function startRadius(e: PointerEvent, c: number) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const sg = single.value
  const s = selScreen.value
  const n = sg && s ? store.node(s.id, sg.id) : undefined
  if (!sg || !s || !n) return
  const sid = s.id, id = n.id, z = vp.value.zoom
  const max = Math.min(n.w, n.h) / 2, r0 = Math.min(max, radiiOf(n.style)[c] ?? 0)
  // 끝까지 둥글면 손잡이가 짧은 변 가운데로 모여 겹쳐요 — 그때는 긴 쪽 방향으로만 재요(겹친 다른 모서리 손잡이를 잡아도 끌리게)
  const pinned = r0 >= max - 0.5
  const sx0 = e.clientX, sy0 = e.clientY, t = (-sg.angle * Math.PI) / 180
  const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][c]!
  store.hold(sid)
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - sx0, dy = ev.clientY - sy0
    const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t)
    const along = pinned ? (n.w >= n.h ? lx * inward[0]! : ly * inward[1]!) : (lx * inward[0]! + ly * inward[1]!) / 2
    const v = Math.round(Math.max(0, Math.min(max, r0 + along / z)))
    store.update(sid, [id], (nn) => {
      if (ev.altKey) { const rr = [...radiiOf(nn.style)] as [number, number, number, number]; rr[c] = v; return { style: { ...nn.style, radii: rr } } }
      return { style: { ...nn.style, radius: v, radii: undefined } }
    })
    radDrag.value = { x: ev.clientX, y: ev.clientY, v }
  }
  const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); store.release(sid); radDrag.value = null }
  radDrag.value = { x: e.clientX, y: e.clientY, v: r0 }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
/**
 * 화면(맨 위 프레임)도 모서리 둥글기 손잡이(피그마와 같아요): 고른 화면 안에 마우스가 있으면 네 모서리 안쪽에 동그라미.
 * 끌면 네 모서리 함께(⌥ 는 한 모서리), 실행취소 한 번
 */
const screenRad = computed(() => {
  void tick.value
  const f = selFrame.value
  if (!f || multi.value.length || store.layerIds.value.length || !isNative(f) || store.editing.value || tool.value !== 'move') return null
  const z = vp.value.zoom, W = f.width * z, H = f.height * z
  if (W < 40 || H < 40) return null
  const g = { cx: f.x + f.width / 2, cy: f.y + f.height / 2, w: f.width, h: f.height, angle: 0 }
  if (!radDrag.value && !ptrInBox(g, 8)) return null
  const r = radiiOf(store.doc(f.id).frame ?? {})
  return (['nw', 'ne', 'se', 'sw'] as const).map((c, i) => {
    const off = Math.min(Math.max(12, (r[i] ?? 0) * z), W / 2, H / 2)
    return { c: i, x: c === 'nw' || c === 'sw' ? off : W - off, y: c === 'nw' || c === 'ne' ? off : H - off }
  })
})
function startScreenRadius(e: PointerEvent, c: number) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const f = selFrame.value
  if (!f) return
  const sid = f.id, z = vp.value.zoom
  const max = Math.min(f.width, f.height) / 2, r0 = Math.min(max, radiiOf(store.doc(sid).frame ?? {})[c] ?? 0)
  const pinned = r0 >= max - 0.5
  const sx0 = e.clientX, sy0 = e.clientY
  const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][c]!
  store.hold(sid)
  const move = (ev: PointerEvent) => {
    const lx = ev.clientX - sx0, ly = ev.clientY - sy0
    const along = pinned ? (f.width >= f.height ? lx * inward[0]! : ly * inward[1]!) : (lx * inward[0]! + ly * inward[1]!) / 2
    const v = Math.round(Math.max(0, Math.min(max, r0 + along / z)))
    if (ev.altKey) { const rr = [...radiiOf(store.doc(sid).frame ?? {})] as [number, number, number, number]; rr[c] = v; store.frameStyle(sid, { radii: rr }) }
    else store.frameStyle(sid, { radius: v, radii: undefined })
    radDrag.value = { x: ev.clientX, y: ev.clientY, v }
  }
  const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); store.release(sid); radDrag.value = null }
  radDrag.value = { x: e.clientX, y: e.clientY, v: r0 }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
const radLabel = computed(() => { const r = radDrag.value, h = el.value?.getBoundingClientRect(); return r && h ? { left: r.x - h.left + 'px', top: r.y - h.top + 22 + 'px' } : null })
/** 점 편집 손잡이(화면 좌표) */
const vhandles = computed(() => {
  void tick.value
  const ve = vedit.value
  if (!ve) return null
  const s = props.screens.find((v) => v.id === ve.sid)
  const n = s ? store.node(ve.sid, ve.id) : undefined
  if (!s || !n) return null
  const m = worldMat(s, ve.id)
  const P = (lx: number, ly: number) => { const q = apply(m, lx, ly); return { x: sx(q.x), y: sy(q.y) } }
  if (n.type !== 'vector') {
    // 아직 도형: 꼭짓점만(사각형은 상자 네 귀퉁이 — 둥근 모서리여도 깨지지 않아요)
    const pts = n.type === 'rect' ? [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]] : denorm(shapeVnet(n), n.w, n.h).flatMap((p) => p.pts.map((q) => [q.x, q.y]))
    return pts.map(([x, y], qi) => ({ pi: -1, qi, a: P(x!, y!), i: null as null | { x: number; y: number }, o: null as null | { x: number; y: number } }))
  }
  // 핸들은 고른 점과 그 이웃 점에만(피그마와 같아요 — 모든 점의 핸들이 다 보이면 복잡해요)
  const show = new Set<string>()
  const vnet = n.vnet ?? []
  for (const [pi, qi] of vselOf(ve)) {
    const len = vnet[pi]?.pts.length ?? 0
    if (!len) continue
    for (const d of [-1, 0, 1]) { const k = qi + d; if (k >= 0 && k < len) show.add(pi + ':' + k); else if (vnet[pi]?.closed) show.add(pi + ':' + ((k + len) % len)) }
  }
  for (const [pi, qi] of ve.segs ?? []) { const len = vnet[pi]?.pts.length ?? 0; show.add(pi + ':' + qi); show.add(pi + ':' + ((qi + 1) % Math.max(1, len))) }
  return vnet.map((p, pi) => p.pts.map((q, qi) => {
    const on = show.has(pi + ':' + qi)
    return { pi, qi, a: P(q.x * n.w, q.y * n.h), i: on && q.i ? P(q.i[0] * n.w, q.i[1] * n.h) : null, o: on && q.o ? P(q.o[0] * n.w, q.o[1] * n.h) : null }
  })).flat()
})
/**
 * 점 누르기(피그마와 같아요): 그 점만 고르고 끌면 옮겨요. ⇧ 누르고 누르면 고른 점에 더하거나 빼요.
 * 여러 개 고른 가운데 하나를 누르고 끌면 고른 것 전부를 함께 옮기고, 끌지 않고 떼면 그 점만 남겨요.
 * 핸들(i · o)은 그 점의 핸들만
 */
function startVpt(e: PointerEvent, pi: number, qi: number, part: 'a' | 'i' | 'o') {
  const ve = vedit.value
  const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
  const n = ve && s ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !s || !n) return
  const key: VKey = [pi, qi]
  if (part === 'a') {
    if (e.shiftKey) {
      const pts = [...(ve.pts?.length ? ve.pts : ve.sel ? [ve.sel] : [])]
      const i = pts.findIndex((k) => k[0] === pi && k[1] === qi)
      if (i >= 0) pts.splice(i, 1)
      else pts.push(key)
      ve.pts = pts
      ve.sel = i >= 0 ? pts[pts.length - 1] ?? null : key
      return
    }
    const cur = vselOf(ve)
    const inSel = cur.some((k) => k[0] === pi && k[1] === qi)
    if (!(inSel && cur.length > 1)) { ve.pts = [key]; ve.segs = [] }
    ve.sel = key
    beginGroupDrag(e, ve, s, n, key, inSel && cur.length > 1 ? key : undefined)
    return
  }
  ve.sel = key
  ve.pts = [key]
  ve.segs = []
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  drag = { kind: 'vpt', sid: ve.sid, id: ve.id, pi, qi, part, sx: e.clientX, sy: e.clientY, abs0: denorm(n.vnet ?? [], n.w, n.h), inv: invert(worldMat(s, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false }
}
/** 고른 점들(고른 선의 양 끝 포함)을 함께 끌기 시작 — at: 누른 점(스마트 가이드 기준). collapse: 끌지 않고 떼면 이 점만 남겨요 */
function beginGroupDrag(e: PointerEvent, ve: VEdit, s: { id: string }, n: LayerNode, at: VKey, collapse?: VKey) {
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const keys = vselOf(ve)
  const sc = props.screens.find((v) => v.id === s.id)!
  if (at[0] < 0) {
    // 아직 도형: 고른 꼭짓점들만 기억해 두고, 실제로 끌기 시작하면 벡터로 바꿔요(누른 꼭짓점이 맨 앞)
    const corners = shapeCorners(n)
    const rads = n.type === 'rect' ? radiiOf(n.style) : []
    const order = [at[1], ...keys.filter((k) => k[0] < 0 && k[1] !== at[1]).map((k) => k[1])]
    const virtual = order.map((qi) => ({ cx: corners[qi]?.[0] ?? 0, cy: corners[qi]?.[1] ?? 0, r: rads[qi] ?? 0, qi }))
    drag = { kind: 'vpt', sid: ve.sid, id: ve.id, pi: -1, qi: at[1], part: 'a', sx: e.clientX, sy: e.clientY, abs0: [], inv: invert(worldMat(sc, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false, virtual, collapse }
    return
  }
  drag = { kind: 'vpt', sid: ve.sid, id: ve.id, pi: at[0], qi: at[1], part: 'a', sx: e.clientX, sy: e.clientY, abs0: denorm(n.vnet ?? [], n.w, n.h), inv: invert(worldMat(sc, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false, group: keys.length > 1 ? keys : undefined, collapse }
}
/** 선(두 점 사이) 손잡이: 화면 좌표 경로 — 누르면 그 선을 골라요(⇧ 로 더하기 · 빼기), 끌면 양 끝 점을 함께 옮겨요 */
const vsegs = computed(() => {
  void tick.value
  const ve = vedit.value
  if (!ve) return null
  const s = props.screens.find((v) => v.id === ve.sid)
  const n = s ? store.node(ve.sid, ve.id) : undefined
  if (!s || !n) return null
  const m = worldMat(s, ve.id)
  const P = (lx: number, ly: number) => { const q = apply(m, lx, ly); return `${sx(q.x)} ${sy(q.y)}` }
  const out: { pi: number; qi: number; d: string }[] = []
  const seg = (pi: number, qi: number, a: { x: number; y: number; o?: [number, number] }, b: { x: number; y: number; i?: [number, number] }) => {
    const d = a.o || b.i ? `M ${P(a.x, a.y)} C ${P(...(a.o ?? [a.x, a.y]))} ${P(...(b.i ?? [b.x, b.y]))} ${P(b.x, b.y)}` : `M ${P(a.x, a.y)} L ${P(b.x, b.y)}`
    out.push({ pi, qi, d })
  }
  const ring = (pi: number, pts: { x: number; y: number; i?: [number, number]; o?: [number, number] }[], closed: boolean, base = 0) => {
    for (let k = 0; k < pts.length; k++) {
      const nx = k + 1 < pts.length ? k + 1 : closed ? 0 : -1
      if (nx < 0 || nx === k) continue
      seg(pi, base + k, pts[k]!, pts[nx]!)
    }
  }
  if (n.type === 'rect') ring(-1, shapeCorners(n).map(([x, y]) => ({ x, y })), true)
  else if (n.type !== 'vector') {
    let base = 0
    for (const p of denorm(shapeVnet(n), n.w, n.h)) { ring(-1, p.pts, n.type !== 'line' && p.closed !== false, base); base += p.pts.length }
  } else denorm(n.vnet ?? [], n.w, n.h).forEach((p, pi) => ring(pi, p.pts, !!p.closed))
  return out
})
const segOn = (pi: number, qi: number) => !!vedit.value?.segs?.some((k) => k[0] === pi && k[1] === qi)
const ptOn = computed(() => { const ve = vedit.value; return new Set(ve ? vselOf(ve).map(vk) : []) })
function startVseg(e: PointerEvent, pi: number, qi: number) {
  const ve = vedit.value
  const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
  const n = ve && s ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !s || !n) return
  const key: VKey = [pi, qi]
  const segs = [...(ve.segs ?? [])]
  const i = segs.findIndex((k) => k[0] === pi && k[1] === qi)
  if (e.shiftKey) {
    if (i >= 0) segs.splice(i, 1)
    else segs.push(key)
    ve.segs = segs
    if (!ve.pts?.length && ve.sel) ve.pts = [ve.sel]
    return
  }
  const many = vselOf(ve).length > 2
  if (!(i >= 0 && many)) { ve.segs = [key]; ve.pts = []; ve.sel = null }
  const ends = vselOf({ ...ve, pts: [], segs: [key] })
  beginGroupDrag(e, ve, s, n, ends[0] ?? key, undefined)
}
/** 고른 점 지우기(벡터): 고른 점 · 고른 선의 양 끝을 모두 */
/**
 * 고른 점 지우기(피그마와 같아요): ⌫ 는 점과 이어진 선까지 지워 경로가 끊기고, ⇧⌫(heal)는 이웃 점끼리 다시 이어요.
 * 아직 사각형인 꼭짓점이면 먼저 벡터로 바꿔요
 */
function deleteVpt(heal = false) {
  const ve = vedit.value
  let n = ve ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !n) return
  let keys = vselOf(ve)
  if (keys.some((k) => k[0] < 0) && n.type === 'rect' && store.toCornerVector(ve.sid, ve.id)) { keys = keys.map((k) => (k[0] < 0 ? [0, k[1]] as VKey : k)); n = store.node(ve.sid, ve.id)! }
  keys = keys.filter((k) => k[0] >= 0)
  if (!keys.length) return
  const abs = denorm(n.vnet ?? [], n.w, n.h)
  if (heal) {
    // 뒤 번호부터 지워야 앞 번호가 밀리지 않아요
    for (const [pi, qi] of [...keys].sort((a, b) => b[0] - a[0] || b[1] - a[1])) abs[pi]?.pts.splice(qi, 1)
  } else {
    // 지운 점 자리에서 경로를 끊어요: 열린 경로는 남은 점들이 이어진 토막마다 따로, 닫힌 경로는 지운 점 다음부터 시작하는 열린 경로로
    const gone = new Map<number, Set<number>>()
    for (const [pi, qi] of keys) gone.set(pi, (gone.get(pi) ?? new Set()).add(qi))
    for (let pi = abs.length - 1; pi >= 0; pi--) {
      const g = gone.get(pi)
      const p = abs[pi]
      if (!g || !p) continue
      const pts = p.pts
      const order = p.closed ? (() => { const start = [...g][0]!; return Array.from({ length: pts.length }, (_, k) => (start + 1 + k) % pts.length) })() : pts.map((_, k) => k)
      const runs: (typeof pts)[] = []
      let cur: typeof pts = []
      for (const k of order) { if (g.has(k)) { if (cur.length) runs.push(cur); cur = [] } else cur.push(pts[k]!) }
      if (cur.length) runs.push(cur)
      // 끊긴 끝의 바깥쪽 핸들은 필요 없어요
      const pieces = runs.filter((r) => r.length >= 2).map((r) => ({ ...p, closed: false, pts: r.map((q, k) => ({ ...q, i: k === 0 ? undefined : q.i, o: k === r.length - 1 ? undefined : q.o })) }))
      abs.splice(pi, 1, ...pieces)
    }
  }
  for (let pi = abs.length - 1; pi >= 0; pi--) if ((abs[pi]?.pts.length ?? 0) < 2) abs.splice(pi, 1)
  ve.sel = null
  ve.pts = []
  ve.segs = []
  if (!abs.length) { vedit.value = null; store.remove(ve.sid, [ve.id]); return }
  const box = normalize(abs)
  store.update(ve.sid, [ve.id], { x: n.x + box.x, y: n.y + box.y, w: box.w, h: box.h, vnet: box.vnet })
}
/** 펜 미리보기(화면 좌표) */
const penView = computed(() => {
  const pn = pen.value
  if (!pn) return null
  const o = screenOrigin(pn.sid)
  const P = (x: number, y: number) => `${sx(x + o.x)} ${sy(y + o.y)}`
  const box = { pts: pn.pts }
  let d = ''
  box.pts.forEach((q, k) => {
    if (!k) { d += `M${P(q.x, q.y)}`; return }
    const a = box.pts[k - 1]!
    d += a.o || q.i ? `C${P(...(a.o ?? [a.x, a.y]))} ${P(...(q.i ?? [q.x, q.y]))} ${P(q.x, q.y)}` : `L${P(q.x, q.y)}`
  })
  const last = pn.pts[pn.pts.length - 1]
  const rubber = last && pn.hover ? `M${P(last.x, last.y)}${last.o ? `C${P(...last.o)} ${P(...pn.hover)} ${P(...pn.hover)}` : `L${P(...pn.hover)}`}` : ''
  return { d, rubber, pts: pn.pts.map((q) => ({ a: { x: sx(q.x + o.x), y: sy(q.y + o.y) }, i: q.i ? { x: sx(q.i[0] + o.x), y: sy(q.i[1] + o.y) } : null, o: q.o ? { x: sx(q.o[0] + o.x), y: sy(q.o[1] + o.y) } : null })) }
})

/** 스케일 도구(K): 끌기 전 모습(sub0)에서 k 배로 — 안쪽 레이어 자리 · 크기와 선 · 글자 · 모서리 · 효과까지 */
function scaleSubtree(sid: string, sub0: string, k: number, x: number, y: number) {
  const d = store.doc(sid)
  const orig = JSON.parse(sub0) as LayerNode[]
  const sc = (v?: number) => (v === undefined ? v : Math.round(v * k * 100) / 100)
  orig.forEach((o, i) => {
    const n = d.nodes[o.id]
    if (!n) return
    n.style = scaledStyle(o.style, k) // app/canvas/scale.ts — 오른쪽 Scale 칸과 같은 계산
    if (o.type === 'instance') n.instScale = Math.round((o.instScale ?? 1) * k * 10000) / 10000 // 컴포넌트는 안까지 확대해서
    if (i === 0) { n.x = x; n.y = y; return }
    n.x = sc(o.x)!; n.y = sc(o.y)!; n.w = Math.max(1, sc(o.w)!); n.h = Math.max(1, sc(o.h)!)
  })
}

/** 캔버스 위 섹션을 옮기면 그 안에 완전히 들어간 화면도 함께 */
function sectionCarry(sc: ScreenRow, ids: string[]) {
  if (!isCanvas(sc)) return []
  const d = store.doc(sc.id)
  const boxes = ids.filter((id) => d.nodes[id]?.type === 'section').map((id) => layerWorld(sc, id)!).filter(Boolean)
  if (!boxes.length) return []
  return realScreens.value.filter((v) => boxes.some((b) => v.x >= b.x && v.y >= b.y && v.x + v.width <= b.x + b.w && v.y + v.height <= b.y + b.h)).map((v) => ({ id: v.id, x: v.x, y: v.y }))
}

/** 두 번 누르기 판단용: 그 두 번 누르기의 첫 번째 누름 직전에 골라져 있던 것 */
let pressSel: string[] = []
let pressSid: string | null = null
let lastPress: { t: number; x: number; y: number } | null = null
function start(e: PointerEvent, screen?: ScreenRow) {
  // pointerdown 의 detail 은 늘 0 이라 시간 · 자리로 판단: 0.5초 안 · 6px 안이면 같은 두 번 누르기의 둘째 누름(선택을 다시 기억하지 않아요)
  const now = performance.now()
  const second = !!lastPress && now - lastPress.t < 500 && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 6
  if (!second) { pressSel = [...store.layerIds.value]; pressSid = store.screenId.value }
  lastPress = second ? null : { t: now, x: e.clientX, y: e.clientY }
  if (e.button !== 0 && e.button !== 1) return
  if (store.editing.value) (document.activeElement as HTMLElement | null)?.blur?.()
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  hover.value = null
  // 캔버스 위 레이어 층에서 레이어가 아닌 곳을 누르면 빈 캔버스와 같아요
  if (screen && isCanvas(screen) && !(e.target as HTMLElement).closest('[data-layer]')) screen = undefined
  // 잠근 화면(프레임): 캔버스에서는 빈 곳처럼 — 화면 · 안의 레이어가 잡히지 않아요(피그마와 같아요, 레이어 목록에서만 골라요)
  if (screen && !isCanvas(screen) && store.doc(screen.id).frame?.locked && (tool.value === 'move' || tool.value === 'scale')) screen = undefined
  if (e.button === 1 || space.value || tool.value === 'hand') {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.value.x, vy: vp.value.y, moved: false }
    panning.value = true
    return
  }
  if (tool.value === 'pen') { penDown(e, screen); return }
  // 이미지 놓기(⇧⌘K 로 고른 파일): 누르면 그 자리, 끌면 그 너비로
  if (tool.value === 'image') { const w0 = toWorld(e.clientX, e.clientY); drag = { kind: 'placeImage', wx: w0.x, wy: w0.y, moved: false }; return }
  // 점 편집 중 빈 곳을 누르면(피그마와 같아요): 편집은 그대로 — 끌면 상자 안 점 고르기, 그냥 누르면 고른 점 풀기. 끝내기는 Esc · Enter
  if (vedit.value) {
    // 편집 중인 모양 상자(바깥 8px 여유) 밖을 누르면 편집 끝(피그마와 같아요) — 누른 자리는 평소처럼(다른 레이어 · 화면 고르기 등)
    const ve = vedit.value
    const vs = props.screens.find((v) => v.id === ve.sid)
    const vg = vs ? layerGeom(vs, ve.id) : null
    const vw = toWorld(e.clientX, e.clientY), vm = 8 / vp.value.zoom
    const va = vg ? (-vg.angle * Math.PI) / 180 : 0
    const vdx = vg ? vw.x - vg.cx : 0, vdy = vg ? vw.y - vg.cy : 0
    const inBox = !!vg && Math.abs(vdx * Math.cos(va) - vdy * Math.sin(va)) <= vg.w / 2 + vm && Math.abs(vdx * Math.sin(va) + vdy * Math.cos(va)) <= vg.h / 2 + vm
    if (!inBox) vedit.value = null
    else {
      const box = el.value!.getBoundingClientRect()
      drag = { kind: 'vmarquee', x0: e.clientX - box.left, y0: e.clientY - box.top, base: e.shiftKey ? vselOf(vedit.value) : [], moved: false }
      return
    }
  }
  const t = drawType(tool.value)
  // 그리기 시작점도 주변에 붙어요(피그마와 같아요, ⌘ 끔)
  const drawing = !!t || pointTool(tool.value) || tool.value === 'frame' || tool.value === 'section'
  const w0 = toWorld(e.clientX, e.clientY)
  const startAt = (sid: string | null) => (drawing && !snapOff(e) ? snapPoint(w0.x, w0.y, [], sid ? pointTargets(sid) : [...realScreens.value.map(rectOf), ...guideRects()]) : { x: w0.x, y: w0.y })
  // 빈 캔버스에 프레임 도구 → 새 화면
  if (!screen) {
    const w = tool.value === 'frame' ? startAt(null) : canvasDoc.value ? startAt(canvasDoc.value.id) : w0
    // 프레임 도구 → 새 화면
    if (tool.value === 'frame') { drag = { kind: 'draw', wx: w.x, wy: w.y, moved: false }; return }
    if (pointTool(tool.value) && canvasDoc.value) { startPoints(canvasDoc.value.id, w.x, w.y); return }
    // 사각형 · 텍스트 등 → 캔버스 위에 바로(페이지 레이어)
    if (t && canvasDoc.value) {
      const cid = canvasDoc.value.id
      const parentId = frameAt(cid, w.x, w.y)
      const p = parentId ? store.absPos(cid, parentId) : { x: 0, y: 0 }
      drag = { kind: 'drawLayer', sid: cid, type: t, parentId, px: p.x, py: p.y, lx: w.x, ly: w.y, moved: false }
      return
    }
    // 이동 도구 → 상자 선택 (피그마와 같아요. 화면 이동은 스페이스 · 손 도구 H · 스크롤)
    if (tool.value === 'move' || tool.value === 'scale') {
      // Shift + 끌기: 지금 고른 것에 더하기(화면들 · 캔버스 위 레이어들)
      const add = e.shiftKey && !e.altKey
      const cid = canvasDoc.value?.id
      const baseScreens = add ? (multi.value.length ? [...multi.value] : store.screenId.value && store.screenId.value !== cid && !store.layerIds.value.length ? [store.screenId.value] : []) : []
      const baseLayers = add && cid && store.screenId.value === cid ? [...store.layerIds.value] : []
      drag = { kind: 'marqueeCanvas', wx: w.x, wy: w.y, moved: false, baseScreens, baseLayers, deep: e.metaKey && !e.altKey }
      marqueeOn.value = true
      return
    }
    return
  }
  const w = startAt(drawing ? screen.id : null)
  const lx = w.x - screen.x, ly = w.y - screen.y
  // 섹션은 늘 캔버스 위에(화면을 묶는 바탕)
  if (tool.value === 'section' && canvasDoc.value) {
    drag = { kind: 'drawLayer', sid: canvasDoc.value.id, type: 'section', parentId: null, px: 0, py: 0, lx: w.x, ly: w.y, moved: false }
    return
  }
  if (pointTool(tool.value)) {
    if (!isNative(screen)) { emit('hint', tr('Figma frames are edited in Figma')); tool.value = 'move'; return }
    startPoints(screen.id, lx, ly)
    return
  }
  // 화면 안에 그리기
  if (t) {
    if (!isNative(screen)) { emit('hint', tr('Figma frames are edited in Figma')); tool.value = 'move'; return }
    const parentId = frameAt(screen.id, lx, ly)
    const p = parentId ? store.absPos(screen.id, parentId) : { x: 0, y: 0 }
    drag = { kind: 'drawLayer', sid: screen.id, type: t, parentId, px: p.x, py: p.y, lx, ly, moved: false }
    return
  }
  if (tool.value !== 'move' && tool.value !== 'scale') return
  // ⌘ + 끌기(피그마와 같아요): 무엇 위에서 누르든 상자 고르기 — 프레임 · 그룹 안쪽 레이어까지(가장 안쪽) 골라요.
  // 끌지 않고 떼면 지금처럼 ⌘ 클릭(가장 안쪽 레이어, 빈 곳이면 그 화면) 고르기
  if (e.metaKey && !e.altKey && isNative(screen)) {
    const el0 = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
    const add = e.shiftKey
    const base = add && store.screenId.value === screen.id ? [...store.layerIds.value] : []
    drag = { kind: 'marquee', sid: screen.id, wx: w.x, wy: w.y, base, moved: false, deep: true, click: diveBoolean(screen, pickLayer(screen.id, el0?.dataset.layer, true), e.clientX, e.clientY, true), add }
    marqueeOn.value = true
    return
  }
  // 레이어 고르기 · 끌기
  const layerEl = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
  // 피그마처럼 화면 바로 아래 것부터(⌘ 를 누르면 가장 안쪽)
  const lid = diveBoolean(screen, pickLayer(screen.id, layerEl?.dataset.layer, e.metaKey), e.clientX, e.clientY, e.metaKey)
  // 캔버스에 바로 놓인 프레임 · 도형: 고르지 않았어도 누르고 끌면 곧바로 골라서 그 방향으로 옮겨요(사용자 요청 — 상자 고르기는 캔버스 빈 곳에서)
  // 피그마처럼: 고른 화면 안을 끌면 화면째 옮기기(누르고 떼기만 하면 그 레이어를 골라요)
  const screenGrab = !!lid && !isCanvas(screen) && store.screenId.value === screen.id && !store.layerIds.value.length && !multi.value.length && !(e.shiftKey && !e.altKey)
  if (lid && isNative(screen) && !screenGrab) {
    // Shift+클릭은 여러 개 고르기. ⌥⇧ 는 복제해서 끌기(가로 · 세로로만)
    if (e.shiftKey && !e.altKey) {
      if (store.screenId.value === screen.id && store.layerIds.value.length) { store.selectLayer(screen.id, lid, true); return }
      // 다른 문서(캔버스 ↔ 프레임 안)의 레이어를 고른 채 ⇧ 클릭: 함께 고르기(피그마와 같아요)
      if (store.layerIds.value.length && store.screenId.value !== screen.id) { store.toggleX(screen.id, lid); return }
      // 화면(들)을 고른 채 다른 화면 안 레이어를 Shift 클릭: 화면은 그대로, 그 레이어를 함께(자식 선택 유지 — 부모 화면을 대신 고르지 않아요)
      const cur = store.layerIds.value.length ? mix.value : multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) ? [store.screenId.value] : []
      const keep = cur.filter((id) => id !== screen.id)
      multi.value = []
      store.selectLayer(screen.id, lid)
      mix.value = keep
      return
    }
    // 함께 고른 다른 문서의 레이어를 누르면: 그 문서를 지금 문서로(고른 것 전부 그대로 — 끌면 함께 옮겨요)
    if (store.xsel.value.some((x) => x.sid === screen.id && x.id === lid)) store.promoteX(screen.id)
    const d0 = store.doc(screen.id)
    // 고른 프레임 안의 레이어를 끌면 프레임째(누르고 떼기만 하면 안쪽 레이어를 골라요)
    const anc = store.screenId.value === screen.id ? store.layerIds.value.find((id) => id !== lid && descendants(d0, id).includes(lid)) : undefined
    const wasSel = store.screenId.value === screen.id && store.layerIds.value.includes(lid)
    // 여러 개 중 하나를 누르면: 끌면 함께 옮기고, 그냥 떼면 그 하나만 골라요(피그마와 같아요)
    const pickOne = wasSel && (store.layerIds.value.length > 1 || store.xsel.value.length > 0) ? lid : undefined
    // 고른 것의 상자 안을 누르면(위에 다른 레이어가 겹쳐 있어도) 고른 것을 끌어요 — 끌지 않고 떼면 누른 레이어를 골라요(피그마와 같아요)
    const selBoxes = !anc && !wasSel && store.screenId.value === screen.id ? store.layerIds.value.map((id) => layerWorld(screen!, id)).filter((b): b is Rect => !!b) : []
    const sb = selBoxes.length ? union(selBoxes) : null
    const inSel = !!sb && w.x >= sb.x && w.x <= sb.x + sb.w && w.y >= sb.y && w.y <= sb.y + sb.h
    if (!anc && !wasSel && !inSel) store.selectLayer(screen.id, lid)
    // ⌥ 끌기 복제는 실제로 끌 때 해요(move) — ⌥ 를 누른 채 누르기만 하면(거리 재기) 아무것도 생기지 않게(피그마와 같아요)
    const d = store.doc(screen.id)
    // 부모와 자식을 함께 골랐으면 부모만 옮겨요(자식은 따라와요 — 두 번 움직이지 않게)
    const ids = store.topIds(screen.id, store.layerIds.value).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
    const sc = screen
    drag = {
      kind: 'layers', sid: sc.id, ids, sx: e.clientX, sy: e.clientY,
      orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])),
      inv: Object.fromEntries(ids.map((id) => [id, invert(parentWorld(sc, id))])),
      b0: ids.length ? union(ids.map((id) => layerWorld(sc, id)!)) : null,
      targets: snapTargets(sc, ids),
      before: store.begin(sc.id), moved: false,
      carry: [...sectionCarry(sc, ids), ...mixCarry()],
      clickLayer: anc || inSel ? lid : pickOne,
      parent0: ids[0] ? d.nodes[ids[0]]?.parentId ?? null : null,
      duped: false,
      mixIds: [...mix.value],
      carryDup: false,
      ...xCarryStart(),
    }
    return
  }
  // Shift + 화면 빈 곳 끌기: 상자 안의 레이어 고르기
  if (e.shiftKey && !e.altKey && isNative(screen)) {
    const base = store.screenId.value === screen.id ? [...store.layerIds.value] : []
    // 화면 고르기는 실제로 끌 때 — 그냥 Shift+클릭이면 여러 화면 고르기(toggleMulti)라 지금 고른 화면을 지키려고
    drag = { kind: 'marquee', sid: screen.id, wx: w.x, wy: w.y, base, moved: false }
    marqueeOn.value = true
    return
  }
  // Shift+클릭: 화면 여러 개 고르기 · 고른 화면들 함께 옮기기
  if (e.shiftKey && !e.altKey && !isCanvas(screen)) {
    if (store.layerIds.value.length && store.screenId.value !== screen.id) { toggleMulti(screen.id); return }
    const cur = multi.value.length ? multi.value : store.screenId.value && !isCanvas({ id: store.screenId.value }) ? [store.screenId.value] : []
    const next = cur.includes(screen.id) ? cur.filter((x) => x !== screen.id) : [...cur, screen.id]
    if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
    return
  }
  // 섞어 고른 화면을 누르고 끌기: 고른 레이어(제자리 부모 안)와 화면들을 함께 옮겨요. ⌥ 면 함께 복제
  if (mix.value.includes(screen.id) && store.screenId.value && store.layerIds.value.length) {
    const sc = props.screens.find((v) => v.id === store.screenId.value)
    if (sc) {
      const d = store.doc(sc.id)
      const ids = store.topIds(sc.id, store.layerIds.value).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
      drag = {
        kind: 'layers', sid: sc.id, ids, sx: e.clientX, sy: e.clientY,
        orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])),
        inv: Object.fromEntries(ids.map((id) => [id, invert(parentWorld(sc, id))])),
        b0: union([...ids.map((id) => layerWorld(sc, id)!), ...mixCarry().map((c) => rectOf(props.screens.find((v) => v.id === c.id)!))]),
        targets: snapTargets(sc, ids), before: store.begin(sc.id), moved: false,
        carry: mixCarry(), parent0: ids[0] ? d.nodes[ids[0]]?.parentId ?? null : null,
        duped: false, mixIds: [...mix.value], carryDup: false,
      }
      return
    }
  }
  if (multi.value.length > 1 && multi.value.includes(screen.id)) {
    const orig = Object.fromEntries(multi.value.map((id) => { const v = props.screens.find((x) => x.id === id)!; return [id, { x: v.x, y: v.y }] }))
    const moving = realScreens.value.filter((v) => multi.value.includes(v.id))
    drag = { kind: 'screens', ids: [...multi.value], sx: e.clientX, sy: e.clientY, orig, b0: union(moving.map(rectOf)), targets: realScreens.value.filter((v) => !multi.value.includes(v.id)).map(rectOf), moved: false, dup: e.altKey }
    return
  }
  // 고르지 않은 화면(맨 위 프레임)의 빈 곳 · 이름표: 누르면 곧바로 골라서, 끌면 그 방향으로 옮겨요(먼저 고를 필요 없이 — 사용자 요청). ⌥ 면 복제
  store.selectScreen(screen.id)
  const sid0 = screen.id
  drag = { kind: 'screen', id: sid0, sx: e.clientX, sy: e.clientY, ox: screen.x, oy: screen.y, w: screen.width, h: screen.height, targets: isCanvas(screen) ? [] : [...realScreens.value.filter((v) => v.id !== sid0).map(rectOf), ...guideRects()], moved: false, clickLayer: screenGrab ? lid : undefined, dup: e.altKey && isNative(screen) && !isCanvas(screen), canDup: isNative(screen) && !isCanvas(screen) }
}

const rectOf = (s: { x: number; y: number; width: number; height: number }): Rect => ({ x: s.x, y: s.y, w: s.width, h: s.height })
/** 스냅 기준: 같은 부모의 다른 레이어 + 부모(프레임 · 화면). 캔버스 위 레이어는 화면들도 */
function snapTargets(s: ScreenRow, ids: string[]): Targets {
  const d = store.doc(s.id)
  const pid = d.nodes[ids[0]!]?.parentId ?? null
  const sibIds = (pid ? d.nodes[pid]?.children ?? [] : d.rootIds).filter((id) => !ids.includes(id) && d.nodes[id] && !d.nodes[id]!.hidden)
  const sibs = sibIds.map((id) => layerWorld(s, id)!).filter(Boolean)
  const parents: Rect[] = []
  if (pid) { const p = layerWorld(s, pid); if (p) parents.push(p) }
  else if (isCanvas(s)) sibs.push(...realScreens.value.map(rectOf))
  else parents.push(rectOf(s))
  sibs.push(...guideRects())
  return { sibs, parents }
}
/** 가이드선도 붙는 대상(폭 0 인 긴 상자) — 페이지 가이드선은 캔버스 끝까지, 프레임 가이드선은 그 프레임 위에서만 */
const guideRects = (): Rect[] => [
  ...(props.guides?.x ?? []).map((x) => ({ x, y: -1e6, w: 0, h: 2e6 })),
  ...(props.guides?.y ?? []).map((y) => ({ x: -1e6, y, w: 2e6, h: 0 })),
  ...guideFrames.value.flatMap((f) => [...f.g.x.map((x) => ({ x: f.x + x, y: f.y, w: 0, h: f.h })), ...f.g.y.map((y) => ({ x: f.x, y: f.y + y, w: f.w, h: 0 }))]),
]
/** 가이드선을 놓을 수 있는 화면들(피그마 프레임 가이드) — 위치 · 크기 · 그 프레임의 가이드선 */
const guideFrames = computed<GuideFrame[]>(() => realScreens.value.filter(isNative).map((s) => {
  const g = store.doc(s.id).frame?.guides
  return { sid: s.id, x: s.x, y: s.y, w: s.width, h: s.height, g: { x: g?.x ?? [], y: g?.y ?? [] } }
}))
/**
 * 가이드선을 끌 때 붙는 자리(캔버스 좌표): 화면 · 레이어의 가장자리 · 가운데, 레이아웃 그리드 칸(Columns · Rows)의 양 끝,
 * 다른 가이드선. axis 'x' = 세로 가이드선(x 값)
 */
function guideSnaps(axis: 'x' | 'y'): number[] {
  const out = new Set<number>()
  const add = (r: Rect) => { const [a, l] = axis === 'x' ? [r.x, r.w] : [r.y, r.h]; out.add(a); out.add(a + l / 2); out.add(a + l) }
  const grid = (ox: number, oy: number, w: number, h: number, grids?: LayoutGrid[]) => {
    for (const b of gridBands(grids, w, h)) { if (axis === 'x' ? b.h === h && b.w < w : b.w === w && b.h < h) { out.add((axis === 'x' ? ox + b.x : oy + b.y)); out.add(axis === 'x' ? ox + b.x + b.w : oy + b.y + b.h) } }
  }
  let n = 0
  for (const s of props.screens) {
    if (!isCanvas(s)) { add(rectOf(s)); if (isNative(s)) grid(s.x, s.y, s.width, s.height, store.doc(s.id).frame?.grids) }
    if (!isNative(s)) continue
    const d = store.doc(s.id)
    for (const id of Object.keys(d.nodes)) {
      const nd = d.nodes[id]!
      if (nd.hidden || n++ > 3000) continue
      const r = layerWorld(s, id)
      if (!r) continue
      add(r)
      if (nd.style.grids?.length) grid(r.x, r.y, r.w, r.h, nd.style.grids)
    }
  }
  for (const v of props.guides?.[axis] ?? []) out.add(v)
  return [...out]
}
/** 고른 프레임들(프레임 자체를 골랐을 때) — 그 가이드선은 파랑 + 밖으로 점선 */
const guideActive = computed(() => [...new Set([...(selFrame.value && !store.layerIds.value.length ? [selFrame.value.id] : []), ...multi.value])])
/** 가이드선이 바뀌면: 페이지 가이드선은 페이지 설정으로, 프레임 가이드선은 그 프레임 모양으로(실행 취소 한 번) */
function onGuides(c: GuideChange) {
  if (c.frames) store.batch(() => { for (const [sid, g] of Object.entries(c.frames!)) store.frameStyle(sid, { guides: g.x.length || g.y.length ? g : undefined }) })
  if (c.page) emit('guides', c.page)
}
const snapOff = (e: PointerEvent) => e.metaKey || e.ctrlKey
const thr = () => 6 / vp.value.zoom
/**
 * 점 하나 스마트 가이드(펜 · 점 편집): 같은 경로의 다른 점, 주변 레이어 · 부모의 가장자리 · 가운데에 가로 · 세로로 붙고 점선을 보여요.
 * pts · rects 는 캔버스 좌표. 반환: 붙은 자리 + 가이드
 */
function snapPoint(wx: number, wy: number, pts: { x: number; y: number }[], rects: Rect[], off = false): { x: number; y: number; g: Guides | null } {
  if (off) return { x: wx, y: wy, g: null }
  const t = thr()
  const xs: { v: number; y0: number; y1: number }[] = [], ys: { v: number; x0: number; x1: number }[] = []
  for (const p of pts) { xs.push({ v: p.x, y0: p.y, y1: p.y }); ys.push({ v: p.y, x0: p.x, x1: p.x }) }
  for (const r of rects) {
    for (const v of [r.x, r.x + r.w / 2, r.x + r.w]) xs.push({ v, y0: r.y, y1: r.y + r.h })
    for (const v of [r.y, r.y + r.h / 2, r.y + r.h]) ys.push({ v, x0: r.x, x1: r.x + r.w })
  }
  const bx = xs.reduce<typeof xs[0] | null>((b, c) => (Math.abs(c.v - wx) <= t && (!b || Math.abs(c.v - wx) < Math.abs(b.v - wx)) ? c : b), null)
  const by = ys.reduce<typeof ys[0] | null>((b, c) => (Math.abs(c.v - wy) <= t && (!b || Math.abs(c.v - wy) < Math.abs(b.v - wy)) ? c : b), null)
  const x = bx ? bx.v : wx, y = by ? by.v : wy
  const lines: Guides['lines'] = []
  if (bx) lines.push({ x1: x, y1: Math.min(bx.y0, y), x2: x, y2: Math.max(bx.y1, y), dash: true })
  if (by) lines.push({ x1: Math.min(by.x0, x), y1: y, x2: Math.max(by.x1, x), y2: y, dash: true })
  return { x, y, g: lines.length ? { lines, labels: [] } : null }
}
/** 펜 · 점 편집이 붙는 주변: 그 화면(또는 부모 프레임) 안 레이어들 · 화면 자체 */
function pointTargets(sid: string, skip?: string): Rect[] {
  const s = props.screens.find((v) => v.id === sid)
  if (!s) return []
  const d = store.doc(sid)
  const rs = Object.keys(d.nodes).filter((id) => id !== skip && !d.nodes[id]!.hidden).slice(0, 200).map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  if (!isCanvas(s)) rs.push(rectOf(s))
  return [...rs, ...guideRects()]
}

/**
 * 크기 조절 때 붙는 안쪽 기준(피그마와 같아요): 안 레이어들의 가장자리 · 가운데, 오토 레이아웃이면 내용 + 안쪽 여백(Hug 크기)까지 —
 * 끝을 내용 끝에 '착' 붙일 수 있어요
 */
function innerTargets(s: ScreenRow, ids: string[], pad?: [number, number, number, number] | null): Rect[] {
  const rs = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  if (!rs.length) return rs
  if (pad) { const u = union(rs); rs.push({ x: u.x - pad[3], y: u.y - pad[0], w: u.w + pad[1] + pad[3], h: u.h + pad[0] + pad[2] }) }
  return rs
}
/**
 * ⌘ 상자 고르기: 상자와 겹치는 가장 안쪽 레이어들. 프레임 · 그룹은 안에서 걸린 게 있으면 그것들, 없으면 상자 안에 다 들어올 때만 그 프레임.
 * 불리언 · 인스턴스는 한 덩어리
 */
function deepHits(s: ScreenRow, ids: string[], r: { x: number; y: number; width: number; height: number }): string[] {
  const d = store.doc(s.id)
  const out: string[] = []
  for (const id of ids) {
    const n = d.nodes[id]
    if (!n || n.hidden || n.locked) continue
    const b = layerWorld(s, id)
    if (!b || !(b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y)) continue
    if (isContainer(n) && n.type !== 'boolean' && n.children?.length) {
      const sub = deepHits(s, n.children, r)
      if (sub.length) { out.push(...sub); continue }
      if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.width && b.y + b.h <= r.y + r.height) out.push(id)
      continue
    }
    out.push(id)
  }
  return out
}
function startResize(e: PointerEvent, handle: Handle) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const s = selScreen.value
  const id = store.layerIds.value[0]
  if (!s || !id) return
  const n = store.node(s.id, id)
  if (!n) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const g = layerGeom(s, id)!
  const d0 = store.doc(s.id)
  const kids = isContainer(n) && !n.style.layout ? (n.children ?? []).map((c) => d0.nodes[c]!).filter(Boolean) : []
  const tg = snapTargets(s, [id])
  if (isContainer(n) && n.children?.length) tg.sibs.push(...innerTargets(s, n.children.filter((c) => d0.nodes[c] && !d0.nodes[c]!.hidden && !d0.nodes[c]!.absolute), n.style.layout?.padding))
  // 이미지 칠 사각형: ⌘ 를 누른 채 끌면 자르기(이미지는 그 자리 그대로) — 시작 때 이미지 자리를 받아 둬요
  const top = n.type === 'rect' && !n.rotation && !n.flipX && !n.flipY ? topImagePaint(n.style) : null
  const img0 = top ? { i: top.i, x: n.x, y: n.y, R: (() => { const c = cropFromFit(top.p, n.w, n.h); return { x: c.x * n.w, y: c.y * n.h, w: c.w * n.w, h: c.h * n.h } })(), p: JSON.parse(JSON.stringify(top.p)) as Paint } : undefined
  drag = { kind: 'resize', sid: s.id, id, handle, sx: e.clientX, sy: e.clientY, g: { cx: g.cx, cy: g.cy, w: g.w, h: g.h, angle: g.angle }, pinv: invert(parentWorld(s, id)), ratio: ratioLocked(n) || tool.value === 'scale', targets: tg, before: store.begin(s.id), moved: false, kids0: kids.length ? boxes0(kids) : undefined, sub0: tool.value === 'scale' ? JSON.stringify(descendants(d0, id).map((k) => d0.nodes[k])) : undefined, img0 }
  // 예전 파일의 이미지 칠은 원래 크기(iw · ih)가 없어요 — 읽어 와서 이번 끌기의 자석에 써요
  const p0 = img0?.p
  if (p0?.type === 'image' && (!p0.iw || !p0.ih)) {
    const d = drag
    const im = new Image()
    im.onload = () => { if (drag === d && im.naturalWidth && im.naturalHeight) { p0.iw = im.naturalWidth; p0.ih = im.naturalHeight } }
    im.src = frameImg(p0.src) ?? ''
  }
}
/** 여러 개 고른 상자의 변 · 모서리: 모두 같은 비율로(피그마와 같아요) */
function startResizeMany(e: PointerEvent, handle: Handle) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const s = selScreen.value
  if (!s || store.layerIds.value.length < 2) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const d = store.doc(s.id)
  const ids = store.layerIds.value.filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
  const items = ids.map((id) => {
    const n = d.nodes[id]!
    const pw = n.parentId ? layerWorld(s, n.parentId) : null
    const kids = isContainer(n) && !n.style.layout ? (n.children ?? []).map((c) => d.nodes[c]!).filter(Boolean) : []
    return { id, b: layerWorld(s, id)!, p: pw ? { x: pw.x, y: pw.y } : { x: s.x, y: s.y }, w0: n.w, h0: n.h, rot: n.rotation ?? 0, kids0: kids.length ? boxes0(kids) : undefined, sub0: tool.value === 'scale' ? JSON.stringify(descendants(d, id).map((k) => d.nodes[k])) : undefined }
  }).filter((x) => x.b)
  if (!items.length) return
  drag = { kind: 'resizeMany', sid: s.id, handle, sx: e.clientX, sy: e.clientY, u0: union(items.map((x) => x.b)), items, targets: snapTargets(s, ids), before: store.begin(s.id), moved: false }
}
/**
 * 글자 상자 변 두 번 누르기(피그마와 같아요): 왼쪽 · 오른쪽 변은 Auto width(글자 길이에 맞춰), 위 · 아래 변은 Auto height(내용 높이에 맞춰)
 */
function edgeDbl(h: Handle) {
  const sid = store.screenId.value
  const id = store.layerIds.value[0]
  const n = sid && id ? store.node(sid, id) : undefined
  if (!sid || !n || n.type !== 'text') return
  if (h === 'e' || h === 'w') store.update(sid, [n.id], (m) => ({ sizeV: undefined, style: { ...m.style, autoWidth: true } }))
  else store.update(sid, [n.id], { sizeV: undefined })
}
/** 고른 화면(프레임)의 변 · 모서리 */
function startScreenResize(e: PointerEvent, handle: Handle) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const s = selFrame.value
  if (!s) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const kids = isNative(s) ? store.doc(s.id).rootIds.map((c) => store.doc(s.id).nodes[c]!).filter(Boolean) : []
  const ds = store.doc(s.id)
  const inner = isNative(s) ? innerTargets(s, ds.rootIds.filter((c) => ds.nodes[c] && !ds.nodes[c]!.hidden && !ds.nodes[c]!.absolute), ds.frame?.layout?.padding) : []
  const scale0 = tool.value === 'scale' && isNative(s) ? JSON.stringify({ nodes: ds.nodes, frame: ds.frame ?? null }) : undefined
  drag = { kind: 'resizeScreen', id: s.id, handle, sx: e.clientX, sy: e.clientY, o: rectOf(s), targets: [...realScreens.value.filter((v) => v.id !== s.id).map(rectOf), ...inner], moved: false, kids0: kids.length ? boxes0(kids) : undefined, before: kids.length || scale0 ? store.begin(s.id) : undefined, scale0 }
}
/** 모서리 바로 바깥을 끌어 돌리기 */
function startRotate(e: PointerEvent) {
  if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
  const s = selScreen.value
  const id = store.layerIds.value[0]
  if (!s || !id || !el.value) return
  const n = store.node(s.id, id)
  if (!n) return
  try { el.value.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const g = layerGeom(s, id)!
  const r = el.value.getBoundingClientRect()
  const cx = r.left + g.cx * vp.value.zoom + vp.value.x, cy = r.top + g.cy * vp.value.zoom + vp.value.y
  drag = { kind: 'rotate', sid: s.id, id, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: n.rotation ?? 0, sign: handed(parentWorld(s, id)), before: store.begin(s.id), moved: false }
  rotating.value = true
}

/** 화면(맨 위 프레임) 돌리기: 화면 가운데 기준, ⇧ 15° 씩 — 실행취소 한 번 */
function startScreenRotate(e: PointerEvent) {
  if (e.button !== 0) return
  const f = selFrame.value
  if (!f || !el.value || !isNative(f)) return
  try { el.value.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const r = el.value.getBoundingClientRect()
  const cx = r.left + (f.x + f.width / 2) * vp.value.zoom + vp.value.x, cy = r.top + (f.y + f.height / 2) * vp.value.zoom + vp.value.y
  drag = { kind: 'rotateScreen', sid: f.id, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: scrRot(f), before: store.begin(f.id), moved: false }
  rotating.value = true
}

/**
 * 크기 바꾸기 공통: 상자 자신의 좌표(angle 만큼 돈)에서 손잡이를 (du, dv) 끌었을 때 새 상자.
 * 돌지 않은 상자면 형제 · 부모 가장자리에 붙이고 가이드를 그려요
 */
/** natural: 이미지 칠(Fill) 사각형의 원래 사진 크기 — 그 폭 · 높이 근처(화면 6px)면 붙어요(어느 손잡이든) */
function resizeBox(g: { cx: number; cy: number; w: number; h: number; angle: number }, handle: Handle, dxw: number, dyw: number, e: PointerEvent, ratio: boolean, targets: Rect[], natural?: { w: number; h: number }) {
  const t = (g.angle * Math.PI) / 180
  const cos = Math.cos(t), sin = Math.sin(t)
  let du = dxw * cos + dyw * sin, dv = -dxw * sin + dyw * cos
  const keep = ratio || e.shiftKey
  const center = e.altKey
  const { sx, sy } = handleDir(handle)
  const flat = Math.abs(normAngle(g.angle)) < 0.01
  const boxOf = (r: { w: number; h: number; ox: number; oy: number }): Rect => ({ x: g.cx + r.ox - r.w / 2, y: g.cy + r.oy - r.h / 2, w: r.w, h: r.h })
  let guide: Guides | null = null
  if (flat && !snapOff(e)) {
    const b = boxOf(resizeLocal(g.w, g.h, handle, du, dv, keep, center))
    const xs = targets.flatMap((r) => [r.x, r.x + r.w / 2, r.x + r.w]), ys = targets.flatMap((r) => [r.y, r.y + r.h / 2, r.y + r.h])
    const ex = sx ? (sx > 0 ? b.x + b.w : b.x) : null, ey = sy ? (sy > 0 ? b.y + b.h : b.y) : null
    let ddx = ex === null ? null : snapAxis([ex], xs, thr()), ddy = ey === null ? null : snapAxis([ey], ys, thr())
    // 비율을 지키면 한 축만 붙여요(가까운 쪽)
    if (keep && ddx !== null && ddy !== null) { if (Math.abs(ddx) <= Math.abs(ddy)) ddy = null; else ddx = null }
    if (keep && sx && sy) { if (ddx !== null) dv = 0; if (ddy !== null) du = 0 }
    if (ddx !== null) du += ddx
    if (ddy !== null) dv += ddy
    const fb = boxOf(resizeLocal(g.w, g.h, handle, du, dv, keep, center))
    guide = alignGuides(fb, targets, { x: ex === null ? [] : [sx > 0 ? fb.x + fb.w : fb.x], y: ey === null ? [] : [sy > 0 ? fb.y + fb.h : fb.y] })
  }
  const r = resizeLocal(g.w, g.h, handle, du, dv, keep, center)
  // 원래 사진 크기에 붙기: 비율을 지키면 폭 · 높이 중 가까운 쪽으로 함께, 아니면 축마다 따로
  let rw = r.w, rh = r.h
  if (natural && !snapOff(e)) {
    const t0 = thr()
    const nx = sx !== 0 && Math.abs(rw - natural.w) < t0, ny = sy !== 0 && Math.abs(rh - natural.h) < t0
    if (keep) {
      const k = nx && (!ny || Math.abs(rw - natural.w) <= Math.abs(rh - natural.h)) ? natural.w / rw : ny ? natural.h / rh : 1
      rw *= k; rh *= k
      if (k !== 1) guide = null
    } else {
      if (nx) { rw = natural.w; guide = null }
      if (ny) { rh = natural.h; guide = null }
    }
  }
  // 정수 크기로(픽셀 그리드를 끄면 소수 둘째 자리까지) 맞춘 뒤 붙어 있는 쪽이 그대로이도록 가운데를 다시 계산
  const w = Math.max(store.pixelSnap.value ? 1 : 0.01, store.snapPx(rw)), h = Math.max(store.pixelSnap.value ? 1 : 0.01, store.snapPx(rh))
  const ox = center || !sx ? 0 : (sx * (w - g.w)) / 2, oy = center || !sy ? 0 : (sy * (h - g.h)) / 2
  return { w, h, cx: g.cx + ox * cos - oy * sin, cy: g.cy + ox * sin + oy * cos, guide }
}

function move(e: PointerEvent) {
  // ⌥ 를 누른 채 옮기기 · 크기 바꾸기(⇧⌥ 가운데 기준 포함): 포인터 아래 레이어 · 부모와의 간격을 계속 보여요
  if (drag && (drag.kind === 'layers' || drag.kind === 'resize' || drag.kind === 'resizeMany')) {
    if (altOn.value !== e.altKey) altOn.value = e.altKey
    dragHover.value = e.altKey ? dragTarget(e, drag.sid) : null
  }
  if (!drag) {
    trackHover(e)
    if (pen.value) {
      const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pen.value.sid)
      const sp = snapPoint(w.x, w.y, pen.value.pts.map((q) => ({ x: q.x + o.x, y: q.y + o.y })), pointTargets(pen.value.sid), snapOff(e) || e.shiftKey)
      const last = pen.value.pts[pen.value.pts.length - 1]
      const hp = e.shiftKey && last ? snap45(last.x, last.y, sp.x - o.x, sp.y - o.y) : { x: sp.x - o.x, y: sp.y - o.y }
      pen.value.hover = [hp.x, hp.y]
      guides.value = e.shiftKey ? null : sp.g
    }
    return
  }
  if (drag.kind === 'pen') {
    // 끌면 마지막 점의 곡선 핸들(반대쪽은 대칭)
    const pn = pen.value
    const q = pn?.pts[pn.pts.length - 1]
    if (!pn || !q) return
    const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pn.sid)
    let hx = w.x - o.x, hy = w.y - o.y
    if (!drag.moved && Math.hypot(hx - q.x, hy - q.y) * vp.value.zoom < 3) return
    drag.moved = true
    // ⇧ 핸들 45° 단위, ⌥ 반대쪽 핸들은 그대로 두고 이쪽만(피그마와 같아요 — 꺾인 곡선)
    if (e.shiftKey) ({ x: hx, y: hy } = snap45(q.x, q.y, hx, hy))
    q.o = [hx, hy]
    if (!e.altKey) q.i = [2 * q.x - hx, 2 * q.y - hy]
    pn.hover = [hx, hy]
    return
  }
  if (drag.kind === 'vmarquee') {
    const box = el.value!.getBoundingClientRect()
    const x = e.clientX - box.left, y = e.clientY - box.top
    if (!drag.moved && Math.abs(x - drag.x0) + Math.abs(y - drag.y0) < 4) return
    drag.moved = true
    const r = { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) }
    vmarq.value = r
    const ve = vedit.value
    if (!ve) return
    const inside = (vhandles.value ?? []).filter((q) => q.a.x >= r.x && q.a.x <= r.x + r.w && q.a.y >= r.y && q.a.y <= r.y + r.h).map((q) => [q.pi, q.qi] as VKey)
    const all = new Map<string, VKey>()
    for (const k of [...drag.base, ...inside]) all.set(vk(k), k)
    ve.pts = [...all.values()]
    ve.segs = []
    ve.sel = ve.pts[ve.pts.length - 1] ?? null
    return
  }
  if (drag.kind === 'vpt') {
    const dx = (e.clientX - drag.sx) / vp.value.zoom, dy = (e.clientY - drag.sy) / vp.value.zoom
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1 / vp.value.zoom) return
    drag.moved = true
    // 도형 꼭짓점을 처음 끄는 순간: 벡터로 바꾸고, 그 꼭짓점(둥근 모서리면 모서리 양 끝 점들)을 함께 옮겨요
    if (drag.virtual) {
      const vts = drag.virtual
      drag.virtual = undefined
      // 사각형: 꼭짓점 네 개 그대로 벡터로(모서리 둥글기는 꼭짓점 r 로 — 피그마와 같아요). 다른 도형: 곡선 점으로 바꿔요
      const corner = store.toCornerVector(drag.sid, drag.id)
      if (!corner) store.flatten(drag.sid, [drag.id])
      const n2 = store.node(drag.sid, drag.id)
      if (!n2?.vnet) return
      drag.abs0 = denorm(n2.vnet, n2.w, n2.h)
      drag.x0 = n2.x; drag.y0 = n2.y
      const near = (q: { x: number; y: number }, vt: { cx: number; cy: number; r: number }) => Math.abs(q.x - vt.cx) <= vt.r + 0.5 && Math.abs(q.y - vt.cy) <= vt.r + 0.5
      const g: [number, number][] = []
      // 누른 꼭짓점(맨 앞)의 점이 먼저 오게
      if (corner) for (const vt of vts) g.push([0, vt.qi])
      else for (const vt of vts) drag.abs0.forEach((p, pi) => p.pts.forEach((q, qi) => { if (near(q, vt) && !g.some((k) => k[0] === pi && k[1] === qi)) g.push([pi, qi]) }))
      if (!g.length) return
      drag.group = g
      drag.pi = g[0]![0]; drag.qi = g[0]![1]
      if (vedit.value) { vedit.value.sel = [drag.pi, drag.qi]; vedit.value.pts = g; vedit.value.segs = [] }
      drag.collapse = undefined
    }
    // ⇧: 점은 가로 · 세로로만(피그마와 같아요)
    const lockA = e.shiftKey && drag.part === 'a' ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null
    const v = applyVec(drag.inv, lockA === 'x' ? 0 : dx, lockA === 'y' ? 0 : dy)
    // 스마트 가이드: 옮기는 점이 같은 경로의 다른 점 · 주변 레이어에 붙어요(⌘ 누르면 끔)
    if (drag.part === 'a') {
      const dsid = drag.sid
      const sc = props.screens.find((x) => x.id === dsid)
      const q0 = drag.abs0[drag.pi]?.pts[drag.qi]
      if (sc && q0) {
        const m = worldMat(sc, drag.id)
        const moving = new Set((drag.group ?? [[drag.pi, drag.qi]]).map(([a, b]) => a + ':' + b))
        const others = drag.abs0.flatMap((p, pi) => p.pts.filter((_, qi) => !moving.has(pi + ':' + qi)).map((q) => { const w = apply(m, q.x, q.y); return { x: w.x, y: w.y } }))
        const cur = apply(m, q0.x + v.x, q0.y + v.y)
        const sp = snapPoint(cur.x, cur.y, others, pointTargets(drag.sid, drag.id), snapOff(e) || !!lockA)
        const back = applyVec(drag.inv, sp.x - cur.x, sp.y - cur.y)
        v.x += back.x; v.y += back.y
        guides.value = sp.g
      }
    }
    const abs = JSON.parse(JSON.stringify(drag.abs0)) as typeof drag.abs0
    const mv = (p?: [number, number]) => (p ? [p[0] + v.x, p[1] + v.y] as [number, number] : p)
    for (const [gi, gq] of drag.group ?? []) { const r = abs[gi]?.pts[gq]; if (r) { r.x += v.x; r.y += v.y; r.i = mv(r.i); r.o = mv(r.o) } }
    const q = abs[drag.pi]?.pts[drag.qi]
    if (!q) return
    if (drag.group) { /* 이미 위에서 옮겼어요 */ } else if (drag.part === 'a') { q.x += v.x; q.y += v.y; q.i = mv(q.i); q.o = mv(q.o) }
    else {
      const h = drag.part === 'i' ? 'i' : 'o', other = h === 'i' ? 'o' : 'i'
      q[h] = mv(q[h])
      // 반대쪽 핸들은 대칭으로(⌥ 를 누르면 따로)
      // Mirroring(패널): both = 각도 · 길이 대칭, angle = 각도만(반대쪽 길이 그대로), none = 따로. ⌥ 를 누르면 늘 따로
      if (q[other] && !e.altKey && mirror.value !== 'none') {
        if (mirror.value === 'both') q[other] = [2 * q.x - q[h]![0], 2 * q.y - q[h]![1]]
        else {
          const len = Math.hypot(q[other]![0] - q.x, q[other]![1] - q.y), dx = q.x - q[h]![0], dy = q.y - q[h]![1], dl = Math.hypot(dx, dy) || 1
          q[other] = [q.x + (dx / dl) * len, q.y + (dy / dl) * len]
        }
      }
    }
    const box = normalize(abs)
    const n = store.node(drag.sid, drag.id)
    if (n) Object.assign(n, { x: Math.round((drag.x0 + box.x) * 100) / 100, y: Math.round((drag.y0 + box.y) * 100) / 100, w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100, vnet: box.vnet })
    return
  }
  const z = vp.value.zoom
  if (drag.kind === 'pan') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    vp.value = { ...vp.value, x: drag.vx + dx, y: drag.vy + dy }
  } else if (drag.kind === 'screen') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    drag.moved = true
    // 끄는 도중 ⌥: 원래 화면은 제자리로 돌리고 복제로 바꿔요(피그마와 같아요)
    if (e.altKey && !drag.dup && drag.canDup) { drag.dup = true; emit('move', drag.id, drag.ox, drag.oy, false) }
    // ⌥ 를 떼면 복제 취소: 파란 미리보기를 지우고 원래 화면이 다시 따라와요(피그마와 같아요)
    else if (!e.altKey && drag.dup) { drag.dup = false; draft.value = null }
    // Shift: 가로나 세로로만
    const lockS = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null
    let nx = drag.ox + (lockS === 'x' ? 0 : dx / z), ny = drag.oy + (lockS === 'y' ? 0 : dy / z)
    if (!snapOff(e) && drag.targets.length) {
      const r = snapMove({ x: nx, y: ny, w: drag.w, h: drag.h }, drag.targets, [], thr(), { x: lockS !== 'x', y: lockS !== 'y' })
      nx += r.dx; ny += r.dy; guides.value = r.guides
    } else guides.value = null
    // ⌥ 끌기: 원래 화면은 그대로 두고 복제될 자리를 보여 줘요(놓으면 복제)
    if (drag.dup) { draft.value = { x: store.snapPx(nx), y: store.snapPx(ny), width: drag.w, height: drag.h }; return }
    emit('move', drag.id, store.snapPx(nx), store.snapPx(ny), false) // 픽셀에 맞추기를 끄면 소수점까지
  } else if (drag.kind === 'layers') {
    let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 3) return
    drag.moved = true
    // 끄는 도중 ⌥(⇧⌥ 포함): 원본은 제자리로 돌리고, 속성까지 그대로인 복제본을 끌어요(피그마와 같아요)
    // 끄는 도중 ⌥ 를 떼면 복제 취소(피그마와 같아요): 복제본을 지우고(방금 기록한 복제를 되돌려요) 원본이 다시 따라와요
    if (!e.altKey && drag.duped && drag.prevDup) {
      const dg = drag, pv = drag.prevDup
      store.undo()
      dg.ids = pv.ids; dg.orig = pv.orig; dg.inv = pv.inv; dg.targets = pv.targets; dg.carry = pv.carry
      keepMix(() => { store.layerIds.value = [...pv.ids] })
      dg.duped = false
      dg.prevDup = undefined
      dg.carryDup = false
    }
    if (e.altKey && !drag.duped && drag.ids.length) {
      const dg = drag
      dg.prevDup = { ids: [...dg.ids], orig: { ...dg.orig }, inv: { ...dg.inv }, targets: dg.targets, carry: [...dg.carry] }
      const d0 = store.doc(dg.sid)
      for (const id of dg.ids) { const n = d0.nodes[id]; if (n) { n.x = dg.orig[id]!.x; n.y = dg.orig[id]!.y } }
      keepMix(() => { store.layerIds.value = [...dg.ids]; store.duplicateInPlace() })
      const sc = props.screens.find((v) => v.id === dg.sid)
      const nd = store.doc(dg.sid)
      const nids = store.topIds(dg.sid, store.layerIds.value).filter((id) => nd.nodes[id])
      if (sc && nids.length) {
        dg.ids = nids
        dg.orig = Object.fromEntries(nids.map((id) => [id, { x: nd.nodes[id]!.x, y: nd.nodes[id]!.y }]))
        dg.inv = Object.fromEntries(nids.map((id) => [id, invert(parentWorld(sc, id))]))
        dg.targets = snapTargets(sc, nids)
        dg.carry = []
      }
      dg.duped = true
      // 함께 끌던 화면들도 복제로: 원래 화면은 제자리로
      if (dg.mixIds?.length && !dg.carryDup) { dg.carryDup = true; for (const c of dg.carry) if (dg.mixIds.includes(c.id)) emit('move', c.id, c.x, c.y, false) }
    }
    const lock = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null // Shift: 가로나 세로로만
    if (lock === 'y') dy = 0
    if (lock === 'x') dx = 0
    const dl = store.doc(drag.sid)
    const inFlow = drag.ids.some((id) => { const n = dl.nodes[id]; return !!n && !n.absolute && !!n.parentId && !!dl.nodes[n.parentId]?.style.layout })
    if (drag.b0 && !snapOff(e) && !inFlow) {
      const r = snapMove({ ...drag.b0, x: drag.b0.x + dx, y: drag.b0.y + dy }, drag.targets.sibs, drag.targets.parents, thr(), { x: lock !== 'x', y: lock !== 'y' })
      dx += r.dx; dy += r.dy; guides.value = r.guides
    } else guides.value = null
    const d = store.doc(drag.sid)
    for (const id of drag.ids) {
      const n = d.nodes[id]
      if (!n) continue
      const v = applyVec(drag.inv[id]!, dx, dy) // 돌린 부모 안이면 부모 좌표로
      n.x = store.snapPx(drag.orig[id]!.x + v.x); n.y = store.snapPx(drag.orig[id]!.y + v.y) // 픽셀 그리드를 끄면 소수점까지
    }
    // 함께 고른 다른 문서의 레이어도 같은 만큼
    for (const c of drag.xcarry ?? []) {
      const n = store.doc(c.sid).nodes[c.id]
      if (!n) continue
      const v = applyVec(c.inv, dx, dy)
      n.x = store.snapPx(c.x + v.x); n.y = store.snapPx(c.y + v.y)
    }
    const dupScreens = drag.carryDup ? drag.mixIds ?? [] : []
    for (const c of drag.carry) if (!dupScreens.includes(c.id)) emit('move', c.id, store.snapPx(c.x + dx), store.snapPx(c.y + dy), false)
    // 복제로 끄는 화면들: 놓일 자리만 보여 줘요(놓으면 복제)
    mixGhosts.value = drag.carry.filter((c) => dupScreens.includes(c.id)).map((c) => { const v = props.screens.find((x) => x.id === c.id)!; return { x: store.snapPx(c.x + dx), y: store.snapPx(c.y + dy), width: v.width, height: v.height } })
    retarget(drag, e, dx, dy)
  } else if (drag.kind === 'resize') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    // 이미지 자르기(⌘ + 이미지 칠 사각형): 끈 변만 잘리거나 넓어지고 이미지는 그대로 — 비율 잠금도 풀려요
    const cropping = !!drag.img0 && e.metaKey
    // 비율이 잠겨 있어도 ⌃ 를 누르는 동안은 풀려요(피그마와 같아요)
    // 이미지 칠(Fill) 사각형: 원래 사진 크기 근처에서 붙어요(자석)
    const ip = drag.img0?.p
    const natural = !cropping && ip?.type === 'image' && (ip.fit ?? 'fill') === 'fill' && ip.iw && ip.ih ? { w: ip.iw, h: ip.ih } : undefined
    const r = resizeBox(drag.g, drag.handle, dx, dy, e, drag.ratio && !e.ctrlKey && !cropping, [...drag.targets.sibs, ...drag.targets.parents], natural)
    guides.value = r.guide
    const c = apply(drag.pinv, r.cx, r.cy)
    const n = store.node(drag.sid, drag.id)
    if (n) {
      Object.assign(n, { x: store.snapPx(c.x - r.w / 2), y: store.snapPx(c.y - r.h / 2), w: r.w, h: r.h })
      // 이미지 칠: ⌘ 면 Crop 으로 바꾸고 이미지 자리를 그대로(넓힌 쪽은 빈 영역), ⌘ 를 떼면 원래 칠로
      if (drag.img0 && n.style.fills?.[drag.img0.i]) {
        const o = drag.img0
        n.style.fills[o.i] = cropping && o.p.type === 'image'
          ? { ...o.p, fit: 'crop', crop: { x: (o.x + o.R.x - n.x) / n.w, y: (o.y + o.R.y - n.y) / n.h, w: o.R.w / n.w, h: o.R.h / n.h } }
          : o.p
      }
      if (drag.sub0) scaleSubtree(drag.sid, drag.sub0, r.w / drag.g.w, n.x, n.y) // 스케일 도구(K): 안쪽까지 같은 비율로
      else {
        if (n.type === 'text') {
          // 글자 상자(피그마와 같아요): 너비만 바꾸면 Auto height, 높이를 바꾸면 Fixed size
          n.style.autoWidth = false
          if (r.h !== drag.g.h) n.sizeV = 'fixed'
        }
        // 직접 크기를 바꾸면 그 방향은 고정 크기로(피그마와 같아요)
        if (r.w !== drag.g.w && n.sizeH && n.sizeH !== 'fixed') n.sizeH = 'fixed'
        if (r.h !== drag.g.h && n.sizeV && n.sizeV !== 'fixed') n.sizeV = 'fixed'
        // 제약: 안쪽 레이어가 따라와요(⌘ 를 누르면 무시)
        if (drag.kids0 && !e.metaKey) {
          const d = store.doc(drag.sid)
          // 그룹은 안의 레이어가 비율대로 커져요(피그마와 같아요), 프레임은 각자의 제약대로
          constrain((n.children ?? []).map((k) => d.nodes[k]!).filter(Boolean), drag.kids0, drag.g.w, drag.g.h, r.w, r.h, isGroupNode(n) ? { h: 'scale', v: 'scale' } : undefined)
        }
      }
      store.relayout(drag.sid)
    }
  } else if (drag.kind === 'resizeMany') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    const u = drag.u0
    // 묶음 크기: 형제 · 부모에 붙어요(⌘ 끔)
    const scaling = tool.value === 'scale'
    const r = resizeBox({ cx: u.x + u.w / 2, cy: u.y + u.h / 2, w: u.w, h: u.h, angle: 0 }, drag.handle, dx, dy, e, e.shiftKey || scaling, [...drag.targets.sibs, ...drag.targets.parents])
    guides.value = r.guide
    const x1 = r.cx - r.w / 2, y1 = r.cy - r.h / 2, kx = r.w / (u.w || 1), ky = r.h / (u.h || 1)
    const d = store.doc(drag.sid)
    const minS = store.pixelSnap.value ? 1 : 0.01
    for (const it of drag.items) {
      const n = d.nodes[it.id]
      if (!n) continue
      // 가운데 자리는 묶음 비율대로, 크기는 돌린 레이어면 자기 축으로 나눠서(모양이 틀어지지 않게)
      const cx = x1 + (it.b.x + it.b.w / 2 - u.x) * kx, cy = y1 + (it.b.y + it.b.h / 2 - u.y) * ky
      const t = (it.rot * Math.PI) / 180, c2 = Math.cos(t) ** 2, s2 = Math.sin(t) ** 2
      const w = it.rot ? it.w0 * (c2 * kx + s2 * ky) : it.b.w * kx
      const h = it.rot ? it.h0 * (s2 * kx + c2 * ky) : it.b.h * ky
      n.w = Math.max(minS, store.snapPx(w)); n.h = Math.max(minS, store.snapPx(h))
      n.x = store.snapPx(cx - it.p.x - n.w / 2)
      n.y = store.snapPx(cy - it.p.y - n.h / 2)
      // 스케일 도구(K): 선 · 글자 · 효과까지 같은 비율로(피그마와 같아요)
      if (scaling && it.sub0) { scaleSubtree(drag.sid, it.sub0, kx, n.x, n.y); continue }
      if (n.type === 'text') n.style.autoWidth = false
      // 프레임은 안의 레이어가 제약대로, 그룹은 비율대로(⌘ 무시)
      if (it.kids0 && !e.metaKey) constrain((n.children ?? []).map((k) => d.nodes[k]!).filter(Boolean), it.kids0, it.w0, it.h0, n.w, n.h, isGroupNode(n) ? { h: 'scale', v: 'scale' } : undefined)
    }
    store.relayout(drag.sid)
  } else if (drag.kind === 'resizeScreen') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    const o = drag.o
    // 스케일 도구 · 비율 잠금(⌃ 누르면 잠깐 풀림)이면 비율 그대로
    const lockR = !!drag.scale0 || (!!store.doc(drag.id).frame?.lockRatio && !e.ctrlKey)
    const r = resizeBox({ cx: o.x + o.w / 2, cy: o.y + o.h / 2, w: o.w, h: o.h, angle: 0 }, drag.handle, dx, dy, e, lockR, drag.targets)
    guides.value = r.guide
    emit('resize-screen', drag.id, { x: store.snapPx(r.cx - r.w / 2), y: store.snapPx(r.cy - r.h / 2), width: r.w, height: r.h }, false)
    // 스케일 도구(K): 화면 안 모든 레이어를 선 · 글자까지 같은 비율로(피그마와 같아요)
    if (drag.scale0) {
      const k = r.w / (o.w || 1)
      const snap = JSON.parse(drag.scale0) as { nodes: Record<string, LayerNode>; frame: LayerStyle | null }
      const dd = store.doc(drag.id)
      const r2 = (v: number) => Math.round(v * 100) / 100
      for (const [id, o0] of Object.entries(snap.nodes)) {
        const n = dd.nodes[id]
        if (!n) continue
        n.style = scaledStyle(o0.style, k)
        if (o0.type === 'instance') n.instScale = Math.round((o0.instScale ?? 1) * k * 10000) / 10000
        n.x = r2(o0.x * k); n.y = r2(o0.y * k); n.w = Math.max(1, r2(o0.w * k)); n.h = Math.max(1, r2(o0.h * k))
      }
      if (snap.frame) dd.frame = scaledStyle(snap.frame, k)
    } else if (drag.kids0 && !e.metaKey) store.constrainRoot(drag.id, o.w, o.h, r.w, r.h, drag.kids0, false)
  } else if (drag.kind === 'rotate') {
    drag.moved = true
    let deg = drag.r0 + (drag.sign * (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI
    deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10 // Shift: 15° 씩
    const n = store.node(drag.sid, drag.id)
    if (n) n.rotation = normAngle(deg) || undefined
  } else if (drag.kind === 'rotateScreen') {
    drag.moved = true
    let deg = drag.r0 + ((Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI
    deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10 // Shift: 15° 씩
    const d = store.doc(drag.sid)
    const v = normAngle(deg)
    const f = { ...(d.frame ?? {}) }
    if (v) f.rotation = v; else delete f.rotation
    d.frame = f
  } else if (drag.kind === 'placeImage') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    const b = boxFrom(drag.wx, drag.wy, w.x, w.y, e.shiftKey, e.altKey)
    draft.value = { x: b.x, y: b.y, width: b.w, height: b.h }
  } else if (drag.kind === 'draw') {
    // 빈 캔버스에 프레임(화면) 그리기: 다른 화면 · 가이드에 붙고(⌘ 끔), ⇧ 정비율 · ⌥ 가운데 · Space 옮기기(피그마와 같아요)
    const sp = snapPoint(toWorld(e.clientX, e.clientY).x, toWorld(e.clientX, e.clientY).y, [], [...realScreens.value.map(rectOf), ...guideRects()], snapOff(e))
    const w = { x: sp.x, y: sp.y }
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    guides.value = sp.g
    const o = spaceShift(drag, { x: drag.wx, y: drag.wy }, w.x, w.y)
    drag.wx = o.x; drag.wy = o.y
    if (drag.sp) { drag.sp = { x: w.x, y: w.y, ox: o.x, oy: o.y } }
    const b = boxFrom(drag.wx, drag.wy, w.x, w.y, e.shiftKey, e.altKey)
    draft.value = { x: store.snapPx(b.x), y: store.snapPx(b.y), width: store.snapPx(b.w), height: store.snapPx(b.h) }
  } else if (drag.kind === 'screens') {
    let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && (Math.abs(dx) + Math.abs(dy)) * z < 3) return
    drag.moved = true
    // 끄는 도중 ⌥: 원래 화면들은 제자리로, 복제로 바꿔요
    if (e.altKey && !drag.dup) { drag.dup = true; for (const id of drag.ids) emit('move', id, drag.orig[id]!.x, drag.orig[id]!.y, false) }
    else if (!e.altKey && drag.dup) { drag.dup = false; mixGhosts.value = [] }
    const lock = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null // Shift: 가로나 세로로만
    if (lock === 'y') dy = 0
    if (lock === 'x') dx = 0
    if (!snapOff(e) && drag.targets.length) {
      const r = snapMove({ ...drag.b0, x: drag.b0.x + dx, y: drag.b0.y + dy }, drag.targets, [], thr(), { x: lock !== 'x', y: lock !== 'y' })
      dx += r.dx; dy += r.dy; guides.value = r.guides
    } else guides.value = null
    if (drag.dup) {
      const dg = drag
      mixGhosts.value = dg.ids.map((id) => { const v = props.screens.find((x) => x.id === id)!; return { x: store.snapPx(dg.orig[id]!.x + dx), y: store.snapPx(dg.orig[id]!.y + dy), width: v.width, height: v.height } })
      return
    }
    for (const id of drag.ids) emit('move', id, store.snapPx(drag.orig[id]!.x + dx), store.snapPx(drag.orig[id]!.y + dy), false)
  } else if (drag.kind === 'marqueeCanvas') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
    draft.value = { x: store.snapPx(r.x), y: store.snapPx(r.y), width: store.snapPx(r.width), height: store.snapPx(r.height) }
    const hitBox = (b: { x: number; y: number; w: number; h: number }) => b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y
    // ⌘: 화면 · 프레임 안쪽 레이어까지(가장 안쪽) — 여러 화면에 걸치면 함께 고르기(xsel)
    if (drag.deep) {
      const groups: [string, string[]][] = []
      if (canvasDoc.value) { const c = canvasDoc.value; const hs = deepHits(c, store.doc(c.id).rootIds, r); if (hs.length) groups.push([c.id, hs]) }
      for (const v of realScreens.value) {
        if (!isNative(v) || store.doc(v.id).frame?.locked || !hitBox({ x: v.x, y: v.y, w: v.width, h: v.height })) continue
        const hs = deepHits(v, store.doc(v.id).rootIds, r)
        if (hs.length) groups.push([v.id, hs])
      }
      multi.value = []
      if (!groups.length) { store.selectScreen(null); return }
      const [sid0, ids0] = groups[0]!
      store.selectLayer(sid0, ids0[0]!)
      store.layerIds.value = ids0
      store.xsel.value = groups.slice(1).flatMap(([sid, ids]) => ids.map((id) => ({ sid, id })))
      return
    }
    // 화면이 걸리면 화면들, 아니면 캔버스 위 레이어들
    const scr = [...new Set([...drag.baseScreens, ...realScreens.value.filter((v) => !store.doc(v.id).frame?.locked && hitBox({ x: v.x, y: v.y, w: v.width, h: v.height })).map((v) => v.id)])]
    if (scr.length) {
      store.selectScreen(scr[0]!)
      multi.value = scr.length > 1 ? scr : []
    } else if (canvasDoc.value) {
      const c = canvasDoc.value
      const d = store.doc(c.id)
      const hits = d.rootIds.filter((id) => { const n = d.nodes[id]; if (!n || n.hidden || n.locked) return false; return hitBox(layerWorld(c, id)!) })
      const ids = [...new Set([...drag.baseLayers, ...hits])]
      multi.value = []
      if (ids.length) { store.selectLayer(c.id, ids[0]!); store.layerIds.value = ids } else store.selectScreen(null)
    }
  } else if (drag.kind === 'marquee') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    if (!drag.moved && store.screenId.value !== drag.sid) store.selectScreen(drag.sid)
    drag.moved = true
    const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
    draft.value = { x: store.snapPx(r.x), y: store.snapPx(r.y), width: store.snapPx(r.width), height: store.snapPx(r.height) }
    const msid = drag.sid
    const s = props.screens.find((v) => v.id === msid)
    if (!s) return
    const d = store.doc(s.id)
    // ⌘: 가장 안쪽 레이어까지
    if (drag.deep) { store.layerIds.value = [...new Set([...drag.base, ...deepHits(s, d.rootIds, r)])]; return }
    // 맨 위 단계 레이어 중 상자와 겹치는 것 (프레임 안쪽은 프레임째로). 캔버스 위 프레임 빈 곳에서 시작했으면 그 프레임 안 레이어
    const pool = drag.within ? d.nodes[drag.within]?.children ?? [] : d.rootIds
    const hit = pool.filter((id) => {
      const n = d.nodes[id]
      if (!n || n.hidden || n.locked) return false
      const b = layerWorld(s, id)!
      return b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y
    })
    store.layerIds.value = [...new Set([...drag.base, ...hit])]
  } else if (drag.kind === 'drawLine' || drag.kind === 'pencil') {
    const dsid = drag.sid
    const s = props.screens.find((v) => v.id === dsid)
    if (!s) return
    const w = toWorld(e.clientX, e.clientY)
    let lx = w.x - s.x, ly = w.y - s.y
    if (drag.kind === 'pencil') {
      const last = drag.pts[drag.pts.length - 1]!
      if (Math.hypot(lx - last[0], ly - last[1]) * z < 2) return
      drag.moved = true
      drag.pts.push([lx, ly])
      draftPts.value = drag.pts.map(([x, y]) => [x + s.x, y + s.y])
      return
    }
    if (!drag.moved && Math.hypot(lx - drag.lx, ly - drag.ly) * z < 4) return
    drag.moved = true
    drag.c ??= { x: drag.lx, y: drag.ly }
    // 끝점이 주변 레이어 가장자리 · 가운데에 붙어요(⌘ 끔)
    const spt = snapPoint(lx + s.x, ly + s.y, [], pointTargets(dsid), snapOff(e) || e.shiftKey)
    lx = spt.x - s.x; ly = spt.y - s.y
    guides.value = spt.g
    // Space: 그리던 선째 옮기기
    const c = spaceShift(drag, drag.c, lx, ly)
    if (drag.sp) drag.sp = { x: lx, y: ly, ox: c.x, oy: c.y }
    drag.c = c
    // Shift: 45° 단위
    if (e.shiftKey) {
      const a = Math.round(Math.atan2(ly - c.y, lx - c.x) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(lx - c.x, ly - c.y)
      lx = c.x + Math.cos(a) * len; ly = c.y + Math.sin(a) * len
    }
    // ⌥: 누른 점이 선의 가운데
    drag.lx = e.altKey ? 2 * c.x - lx : c.x
    drag.ly = e.altKey ? 2 * c.y - ly : c.y
    drag.ex = lx; drag.ey = ly
    draftPts.value = [[drag.lx + s.x, drag.ly + s.y], [lx + s.x, ly + s.y]]
  } else if (drag.kind === 'drawLayer') {
    const dsid = drag.sid
    const s = props.screens.find((v) => v.id === dsid)
    if (!s) return
    // 끄는 모서리가 주변 레이어 가장자리 · 가운데에 붙어요(⌘ 끔, ⇧ 정비율일 때는 끔)
    const w0 = toWorld(e.clientX, e.clientY)
    const spt = snapPoint(w0.x, w0.y, [], pointTargets(dsid), snapOff(e) || e.shiftKey)
    const lx = spt.x - s.x, ly = spt.y - s.y
    if (!drag.moved && (Math.abs(lx - drag.lx) + Math.abs(ly - drag.ly)) * z < 4) return
    drag.moved = true
    guides.value = spt.g
    // Space: 그리던 상자째 옮기기
    const o = spaceShift(drag, { x: drag.lx, y: drag.ly }, lx, ly)
    if (drag.sp) drag.sp = { x: lx, y: ly, ox: o.x, oy: o.y }
    drag.lx = o.x; drag.ly = o.y
    // ⇧ 정비율 · ⌥ 누른 점이 가운데(피그마와 같아요)
    const b = boxFrom(drag.lx, drag.ly, lx, ly, e.shiftKey, e.altKey)
    draft.value = { x: store.snapPx(s.x + b.x), y: store.snapPx(s.y + b.y), width: store.snapPx(b.w), height: store.snapPx(b.h) }
    draftType.value = drag.type
  }
}

function end(e: PointerEvent) {
  dragHover.value = null
  draftType.value = null
  if (!drag) return
  const d = drag
  drag = null
  // 레이어 끌기 한 번 = 실행취소 한 번: 옮기기 · 다른 프레임(캔버스)으로 넘기기 · 함께 옮긴 화면을 묶어요
  // (따로 기록하면 ⌘Z 첫 번에 원래 프레임 밖 잘린 자리로 돌아가 사라진 것처럼 보였어요)
  if (d.kind === 'layers' && d.moved) store.batch(() => endDrag(e, d))
  else endDrag(e, d)
}
function endDrag(e: PointerEvent, d: NonNullable<typeof drag>) {
  panning.value = false
  guides.value = null
  rotating.value = false
  if (d.kind === 'pan' && !d.moved && e.target === el.value) store.selectScreen(null)
  if (d.kind === 'screen' && d.moved && d.dup) { const r = draft.value; draft.value = null; if (r) emit('clone-screen', d.id, r.x, r.y) }
  else if (d.kind === 'screen' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('move', d.id, s.x, s.y, true)
  }
  if (d.kind === 'layers' && d.moved && d.xbefore?.length) { const xb = d.xbefore; store.batch(() => { store.commit(d.sid, d.before); for (const [s2, b2] of xb) store.commit(s2, b2) }) }
  else if ((d.kind === 'layers' || d.kind === 'resize' || d.kind === 'rotate' || d.kind === 'rotateScreen' || d.kind === 'resizeMany' || d.kind === 'vpt') && d.moved) store.commit(d.sid, d.before)
  // 여러 점을 고른 채 하나를 끌지 않고 눌렀다 떼면: 그 점만 남겨요(피그마와 같아요)
  if (d.kind === 'vpt' && !d.moved && d.collapse && vedit.value) { vedit.value.pts = [d.collapse]; vedit.value.segs = []; vedit.value.sel = d.collapse }
  dragOut.value = null
  dropScreen.value = null
  if (d.kind === 'layers') setDropLine(null)
  dragOutIds.value = []
  // 화면 밖으로 끌어 놓기: 다른 화면 안으로, 아니면 캔버스 위로
  if (d.kind === 'layers' && d.moved && d.out) {
    const src = props.screens.find((v) => v.id === d.sid)
    const w = toWorld(e.clientX, e.clientY)
    const dest = screenUnder(w.x, w.y) ?? canvasDoc.value
    if (src && dest && dest.id !== src.id) {
      const sd = store.doc(src.id)
      const roots = d.ids.filter((id) => !d.ids.some((o) => o !== id && descendants(sd, o).includes(id)))
      const parentId = isCanvas(dest) ? frameAt(dest.id, w.x, w.y) : frameAt(dest.id, w.x - dest.x, w.y - dest.y)
      store.transfer(src.id, roots, dest.id, parentId, { x: src.x - dest.x, y: src.y - dest.y })
    }
  }
  if (d.kind === 'layers' && d.moved && !d.carry.length) { const w = toWorld(e.clientX, e.clientY); if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT)) }
  if ((d.kind === 'layers' || d.kind === 'screen') && !d.moved && d.clickLayer) store.selectLayer(d.kind === 'layers' ? d.sid : d.id, d.clickLayer)
  if (d.kind === 'layers' && d.moved) {
    const dupScreens = d.carryDup ? d.mixIds ?? [] : []
    for (const c of d.carry) { if (dupScreens.includes(c.id)) continue; const v = props.screens.find((x) => x.id === c.id); if (v) emit('move', c.id, v.x, v.y, true) }
    if (dupScreens.length) {
      const items = d.carry.filter((c) => dupScreens.includes(c.id)).map((c, i) => ({ id: c.id, x: mixGhosts.value[i]?.x ?? c.x, y: mixGhosts.value[i]?.y ?? c.y }))
      emit('clone-screens', items)
    }
  }
  if (d.kind === 'layers') mixGhosts.value = []
  // 선 · 화살표는 한 번 긋고 선택 도구로, 연필은 계속 연필(피그마와 같아요)
  if (d.kind === 'drawLine' || d.kind === 'pencil') { draftPts.value = null; if (d.kind === 'drawLine') tool.value = 'move'; finishPoints(d) }
  if (d.kind === 'resizeScreen' && d.moved && d.before) store.commit(d.id, d.before)
  if (d.kind === 'resizeScreen' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('resize-screen', d.id, { x: s.x, y: s.y, width: s.width, height: s.height }, true)
  }
  if (d.kind === 'marquee') {
    draft.value = null; marqueeOn.value = false
    if (!d.moved && d.deep) {
      // ⌘ 클릭(끌지 않음): 가장 안쪽 레이어(⇧ 면 더하기), 빈 곳이면 그 화면
      if (d.click) store.selectLayer(d.sid, d.click, d.add && store.screenId.value === d.sid)
      else if (!d.add) store.selectScreen(d.sid)
    } else if (!d.moved && d.pick && d.within) store.selectLayer(d.sid, d.within)
    else if (!d.moved && d.pick) { store.selectScreen(d.sid); multi.value = [] }
    else if (!d.moved) toggleMulti(d.sid)
    // 빈 곳에서 끌었는데 아무것도 안 걸렸으면 아무것도 안 고른 상태(피그마와 같아요)
    else if (d.pick && !store.layerIds.value.length) store.selectScreen(null)
  }
  if (d.kind === 'vmarquee') { vmarq.value = null; if (!d.moved && !d.base.length && vedit.value) { vedit.value.pts = []; vedit.value.segs = []; vedit.value.sel = null } }
  if (d.kind === 'marqueeCanvas') { draft.value = null; marqueeOn.value = false; if (!d.moved && !d.baseScreens.length && !d.baseLayers.length) { store.selectScreen(null); multi.value = [] } }
  if (d.kind === 'screens' && d.moved && d.dup) {
    const items = d.ids.map((id, i) => ({ id, x: mixGhosts.value[i]?.x ?? d.orig[id]!.x, y: mixGhosts.value[i]?.y ?? d.orig[id]!.y }))
    mixGhosts.value = []
    emit('clone-screens', items)
  } else if (d.kind === 'screens' && d.moved) for (const id of d.ids) { const v = props.screens.find((x) => x.id === id); if (v) emit('move', id, v.x, v.y, true) }
  if (d.kind === 'placeImage') {
    const r = d.moved ? draft.value : null
    draft.value = null
    const c = r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: d.wx, y: d.wy }
    const sc = screenUnder(c.x, c.y)
    const target = sc && isNative(sc) ? sc : canvasDoc.value
    const place = target ? { sid: target.id, parentId: isCanvas(target) ? frameAt(target.id, c.x, c.y) : frameAt(target.id, c.x - target.x, c.y - target.y) } : undefined
    emit('place-image', c, r && r.width >= 2 ? r.width : null, place)
  }
  if (d.kind === 'draw') {
    // 끌지 않고 누르기만 하면 누른 점이 가운데인 100×100(피그마와 같아요)
    const rect = d.moved && draft.value && draft.value.width >= 1 && draft.value.height >= 1 ? draft.value : { x: store.snapPx(d.wx - 50), y: store.snapPx(d.wy - 50), width: 100, height: 100 }
    draft.value = null
    emit('create', rect)
    tool.value = 'move'
  }
  if (d.kind === 'drawLayer') {
    const s = props.screens.find((v) => v.id === d.sid)
    const r = draft.value
    draft.value = null
    tool.value = 'move'
    if (!s) return
    const big = d.moved && r && r.width >= 2 && r.height >= 2
    if (d.type === 'text') {
      // 비어 있는 글자 상자로 시작해요 — 치지 않고 나가면 레이어가 사라져요(피그마와 같아요). 끌어 그리면 그 크기의 고정 상자
      const id = big
        ? store.add(d.sid, d.parentId, { type: 'text', text: '', x: store.snapPx(r!.x - s.x - d.px), y: store.snapPx(r!.y - s.y - d.py), w: r!.width, h: r!.height, sizeV: 'fixed', style: { autoWidth: false } })
        : store.add(d.sid, d.parentId, { type: 'text', text: '', x: store.snapPx(d.lx - d.px), y: store.snapPx(d.ly - d.py), w: 1, h: 24, style: {} })
      store.editing.value = id
      return
    }
    // 누르기만 하면 누른 점이 가운데인 기본 크기(피그마와 같아요: 섹션 496×496, 나머지 100×100)
    const size = d.type === 'section' ? { w: 496, h: 496 } : { w: 100, h: 100 }
    const x = big ? r!.x - s.x - d.px : store.snapPx(d.lx - d.px - size.w / 2)
    const y = big ? r!.y - s.y - d.py : store.snapPx(d.ly - d.py - size.h / 2)
    const part = { type: d.type, x, y, w: big ? r!.width : size.w, h: big ? r!.height : size.h }
    // 프레임 · 섹션을 끌어 그리면 그 안에 통째로 드는 레이어를 안으로(피그마와 같아요). 눌러서 만든 기본 크기는 그대로
    if (big && (d.type === 'frame' || d.type === 'section')) store.addAround(d.sid, d.parentId, part)
    else store.add(d.sid, d.parentId, part)
  }
}

/** 선 · 연필: 상자(x · y · w · h)와 그 안 비율 점으로 저장 */
function finishPoints(d: Extract<Drag, { kind: 'drawLine' | 'pencil' }>) {
  let pts: [number, number][]
  if (d.kind === 'drawLine') pts = d.moved ? [[d.lx, d.ly], [d.ex, d.ey]] : [[d.lx, d.ly], [d.lx + 100, d.ly]]
  else {
    if (!d.moved || d.pts.length < 2) return
    // 손떨림 정도는 펴서 점을 줄여요(화면 2px 안쪽 흔들림)
    pts = simplify(d.pts, 2 / vp.value.zoom)
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const norm = pts.flatMap(([x, y]) => [w ? Math.round(((x - x0) / w) * 1e4) / 1e4 : 0, h ? Math.round(((y - y0) / h) * 1e4) / 1e4 : 0])
  const type = d.kind === 'pencil' ? 'path' : 'line'
  store.add(d.sid, d.parentId, { type, x: store.snapPx(x0 - d.px), y: store.snapPx(y0 - d.py), w: store.snapPx(w), h: store.snapPx(h), pts: norm, ...(d.kind === 'drawLine' && d.arrow ? { name: `Arrow ${Object.values(store.doc(d.sid).nodes).filter((v) => v.name.startsWith('Arrow ')).length + 1}`, style: { arrowEnd: 'arrow' } } : {}) })
}

/**
 * 두 번 누르기: 텍스트는 글자 고치기, 벡터 · 도형은 점 편집.
 * 캔버스가 포인터를 붙잡고 있으면(setPointerCapture) dblclick 이 레이어가 아니라 캔버스로 와서, 누른 자리 아래 요소를 직접 찾아요
 */
/** 프레임 이름표 두 번 누르기: 그 자리에서 이름 고치기(피그마처럼) */
const renamingScreen = ref<string | null>(null)
const renameSection = useState<{ sid: string; id: string } | null>('iris-rename-section', () => null)
const vSelectAll = { mounted: (el: HTMLInputElement) => { el.focus(); el.select() } }
function commitScreenName(id: string, e: Event) {
  if (renamingScreen.value !== id) return
  renamingScreen.value = null
  const name = (e.target as HTMLInputElement).value.trim()
  const s = props.screens.find((v) => v.id === id)
  if (s && name && name !== s.name) emit('rename-screen', id, name)
}
/**
 * 캔버스 위(화면 밖) 프레임 레이어 이름표: 피그마처럼 맨 위 단계(섹션 안 포함) 프레임 위에 이름. 그룹(자르기 없음 · 칠 없음)은 이름표 없음.
 * 누르면 그 프레임을 고르고, 두 번 누르면 그 자리에서 이름 고치기
 */
const frameLabels = computed(() => {
  void tick.value
  void vp.value
  const c = canvasDoc.value
  if (!c) return []
  const d = store.doc(c.id)
  return Object.values(d.nodes)
    .filter((n) => n.type === 'frame' && !n.hidden && !(n.style.clip === false && !n.style.fill && !n.style.fills?.length) && (!n.parentId || d.nodes[n.parentId]?.type === 'section'))
    .map((n) => { const b = layerWorld(c, n.id); return b ? { id: n.id, name: n.name, box: box({ x: b.x, y: b.y, width: b.w, height: b.h }) } : null })
    .filter((v): v is NonNullable<typeof v> => !!v)
})
const renamingFrame = ref<string | null>(null)
function pickFrameLabel(id: string) { const c = canvasDoc.value; if (c) { tool.value = 'move'; store.selectLayer(c.id, id) } }
function commitFrameName(id: string, e: Event) {
  if (renamingFrame.value !== id) return
  renamingFrame.value = null
  const c = canvasDoc.value
  const name = (e.target as HTMLInputElement).value.trim()
  if (c && name && name !== store.node(c.id, id)?.name) store.update(c.id, [id], { name })
}
function onDblAny(e: MouseEvent) {
  // 점 편집 중 두 번 누르기(점 · 선 손잡이 말고): 편집 끝(피그마와 같아요)
  if (vedit.value) { if (!(e.target as Element | null)?.closest?.('.an, .hd, .vs-hit')) vedit.value = null; return }
  const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const lab = hit?.closest('.label') as HTMLElement | null
  if (lab?.dataset.screen) { renamingScreen.value = lab.dataset.screen; return }
  // 섹션 이름표 두 번 누르기 → 그 자리에서 이름 고치기(LayerView)
  const sec = hit?.closest('[data-sec]') as HTMLElement | null
  const secScr = sec?.closest('[data-screen]') as HTMLElement | null
  if (sec?.dataset.sec && secScr?.dataset.screen) { renameSection.value = { sid: secScr.dataset.screen, id: sec.dataset.sec }; return }
  const scrEl = hit?.closest('[data-screen]') as HTMLElement | null
  const screen = scrEl ? props.screens.find((v) => v.id === scrEl.dataset.screen) : undefined
  if (screen && hit) onDbl(hit, screen, e)
}
/**
 * 불리언 안쪽 도형 찾기(두 번 누르기): 불리언은 결과 모양 하나로 그려서 안쪽 도형 요소가 없어요 — 누른 자리가 어느 도형 모양 안인지 경로로 재요(맨 위 것부터)
 */
let hitCtx: CanvasRenderingContext2D | null = null
function booleanChildAt(screen: ScreenRow, bid: string, cx: number, cy: number, only?: (c: LayerNode) => boolean): string | null {
  const d = store.doc(screen.id)
  const b = d.nodes[bid]
  if (!b?.children?.length) return null
  hitCtx ??= document.createElement('canvas').getContext('2d')
  const w = toWorld(cx, cy)
  for (const k of [...b.children].reverse()) {
    const c = d.nodes[k]
    if (!c || c.hidden || (only && !only(c))) continue
    const p = apply(invert(worldMat(screen, k)), w.x, w.y)
    const path = nodePathIn(d, c, -c.x, -c.y)
    if (path && hitCtx?.isPointInPath(new Path2D(path), p.x, p.y)) return k
    if (!path && p.x >= 0 && p.y >= 0 && p.x <= c.w && p.y <= c.h) return k
  }
  return null
}
/**
 * 불리언 안으로 들어가 고르기(피그마와 같아요): 불리언은 모양 하나로 그려져서 누르면 늘 불리언이 잡혀요.
 * - ⌘(가장 안쪽 고르기)이면: 누른 자리의 안쪽 도형
 * - 불리언 안 도형을 이미 골라 둔 상태(불리언이 열린 상태)면: ⇧ · ⌘ · ⌘⇧ · 그냥 누르기 모두 누른 자리의 안쪽 도형
 * 불리언 안에 불리언이 있으면 같은 규칙으로 더 안으로 들어가요
 */
function diveBoolean(screen: ScreenRow, lid: string | undefined, cx: number, cy: number, deep: boolean): string | undefined {
  if (!lid) return lid
  const d = store.doc(screen.id)
  const sel = store.screenId.value === screen.id ? store.layerIds.value : []
  let cur = lid
  for (let i = 0; i < 8; i++) {
    if (d.nodes[cur]?.type !== 'boolean') break
    const inner = descendants(d, cur)
    if (!deep && !sel.some((id) => id !== cur && inner.includes(id))) break
    const c = booleanChildAt(screen, cur, cx, cy)
    // 안쪽 도형이 없는 자리(불리언 상자 안 빈 곳): 불리언을 잡지 않아요 — 아무것도 안 골라요(피그마와 같아요)
    if (!c) return i === 0 ? undefined : cur
    cur = c
  }
  return cur
}
function onDbl(target: HTMLElement, screen: ScreenRow, ev?: MouseEvent) {
  const deepest = (target.closest('[data-layer]') as HTMLElement | null)?.dataset.layer
  if (!deepest || !isNative(screen)) return
  // 판단은 '두 번 누르기 직전'(첫 누름 전) 선택 기준 — 빠르게 누르는 사이 첫 누름이 부모를, 둘째 누름이 안쪽을 골라도
  // 결과가 천천히 두 번 누른 것과 같아요(피그마와 같아요)
  const before = pressSid === screen.id ? pressSel : []
  const lid = pickLayer(screen.id, deepest, false, before)
  if (!lid) return
  const n = store.node(screen.id, lid)
  if (!n) return
  // 불리언(피그마와 같아요): 한 번 누르면 합친 면, 두 번 누르면 누른 자리의 안쪽 도형
  if (n.type === 'boolean' && ev) {
    const child = booleanChildAt(screen, lid, ev.clientX, ev.clientY)
    if (child) { store.selectLayer(screen.id, child); return }
  }
  // 마스크 그룹(피그마와 같아요): 마스크는 그려지지 않아 요소로 안 잡혀요 — 보이는 내용이 없는 자리를 두 번 누르면, 그 자리가 마스크 모양 안일 때 마스크를 골라요
  if (isContainer(n) && lid === deepest && ev) {
    const m = booleanChildAt(screen, lid, ev.clientX, ev.clientY, (c) => !!c.isMask)
    if (m) { store.selectLayer(screen.id, m); return }
  }
  // 프레임 · 그룹(오토 레이아웃 포함): 한 단계만 안으로 — 누른 자리의 바로 아래 레이어를 골라요
  if (isContainer(n) && n.type !== 'section' && lid !== deepest) {
    const d = store.doc(screen.id)
    let c: string | null | undefined = deepest
    while (c && d.nodes[c]?.parentId !== lid) c = d.nodes[c]?.parentId
    if (c) { store.selectLayer(screen.id, c); return }
  }
  if (n.type === 'text' && !n.locked) {
    // 여러 글자를 함께 골라 둔 채면 선택은 그대로 — 고치는 글자가 함께 고른 글자에도 똑같이 들어가요(다른 프레임 것도)
    const inX = store.xsel.value.some((x) => x.sid === screen.id && x.id === lid)
    const many = store.layerIds.value.length + store.xsel.value.length > 1
    const picked = inX || (store.screenId.value === screen.id && store.layerIds.value.includes(lid))
    if (many && picked) { if (inX) store.promoteX(screen.id) } else store.selectLayer(screen.id, lid)
    // 누른 자리의 단어를 골라 고치기 시작(피그마와 같아요) — Enter 로 들어가면 전체
    if (ev) editAt.value = { x: ev.clientX, y: ev.clientY }
    store.editing.value = lid
    return
  }
  // 도형: 이미 골라 둔 것이거나 맨 위 단계에서 바로 잡히는 것이면 편집, 막 안으로 들어가 골라진 것이면 고르기만
  const direct = before.includes(lid) || pickLayer(screen.id, deepest, false, []) === lid
  if (!direct) { store.selectLayer(screen.id, lid); return }
  if (tool.value !== 'move' && tool.value !== 'scale') return
  // 이미지 칠이 있는 사각형: 이미지 자르기 편집 + 칠 창(피그마와 같아요 — 두 번 누르면 이미지 편집)
  if (n.type === 'rect' && !n.locked && topImagePaint(n.style)) { store.selectLayer(screen.id, lid); void startCrop(store, frameImg, screen.id, lid, { open: true }); return }
  enterVectorEdit(screen.id, lid)
}

// ---------------------------------------------------------------------------
// 단축키
// ---------------------------------------------------------------------------
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')
/**
 * 피그마와 같은 단축키. 레이어를 골랐으면 레이어에, 화면만 골랐으면 화면에 적용합니다.
 * 이동 V · 프레임 F/A · 사각형 R · 텍스트 T 는 EditorToolbar 가 받습니다.
 */
const gridsShown = useLayoutGridsShown()
const rulersShown = useState('iris-rulers', () => false)
/** 고른 것의 캔버스 좌표 상자(눈금자에 표시) */
const selWorld = computed(() => {
  void tick.value
  // 펜으로 그리는 중: 지금까지 찍은 점(+ 마우스 자리)을 감싸는 상자를 눈금자에(피그마와 같아요)
  const pn = pen.value
  if (pn && (pn.pts.length || pn.hover)) {
    const o = screenOrigin(pn.sid)
    const ps = [...pn.pts.map((q) => [q.x, q.y] as const), ...(pn.hover ? [pn.hover] : [])]
    const xs = ps.map((q) => q[0] + o.x), ys = ps.map((q) => q[1] + o.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  const s = selScreen.value
  if (!s) return null
  if (store.layerIds.value.length) { const bs = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b); return bs.length ? union(bs) : null }
  return isCanvas(s) ? null : rectOf(s)
})
const lastCopy = useLastCopy()
const renameReq = useRenameReq()
const ctx = useContextMenu()
/** 붙여넣을 때 문서끼리 자리 환산: 화면 · 캔버스의 캔버스 좌표와 크기 */
const pasteGeo = {
  origin: (id: string) => { const v = props.screens.find((x) => x.id === id); return v ? { x: v.x, y: v.y } : null },
  isCanvas: (id: string) => isPageCanvas(id),
  size: (id: string) => { const v = props.screens.find((x) => x.id === id); return v ? { w: v.width, h: v.height } : null },
}
store.setPasteGeo(pasteGeo)
onBeforeUnmount(() => store.setPasteGeo(undefined))
/** 붙여넣기: 마지막에 복사한 것(화면이면 화면, 레이어면 레이어) */
function doPaste() {
  const sid = store.screenId.value
  const screen = props.screens.find((v) => v.id === sid)
  const native = !!screen && isNative(screen)
  // 레이어 + 화면을 함께 복사했으면: 레이어는 원래 부모 안 같은 자리, 화면들은 오른쪽에(새 레이어 · 화면을 함께 골라 둬요)
  if (lastCopy.value === 'mixed' && store.hasClipboard()) {
    const cs = store.clipSid()
    store.layerIds.value = []
    store.paste(cs ?? undefined)
    emit('paste-screens', true)
    return
  }
  if (lastCopy.value !== 'screen' && store.hasClipboard()) store.batch(() => { store.paste(native || (sid && isPageCanvas(sid)) ? undefined : canvasDoc.value?.id); bringIntoView() })
  else emit('screen-action', 'paste')
}
/**
 * 붙인 레이어가 지금 보이는 곳 밖이면 보이는 곳 가운데로(피그마와 같아요). 들어간 화면 자체가 안 보이면 캔버스 위로 꺼내요
 */
function bringIntoView() {
  const sid = store.screenId.value
  const s = props.screens.find((v) => v.id === sid)
  const r = el.value?.getBoundingClientRect()
  if (!s || !r) return
  const ids = store.topIds(s.id, store.layerIds.value)
  const bs = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  if (!bs.length) return
  const u = union(bs)
  const z = vp.value.zoom
  const view = { x: -vp.value.x / z, y: -vp.value.y / z, w: r.width / z, h: r.height / z }
  const meets = (b: Rect) => b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y
  if (meets(u)) return
  const dx = Math.round(view.x + view.w / 2 - (u.x + u.w / 2)), dy = Math.round(view.y + view.h / 2 - (u.y + u.h / 2))
  // 화면 안이고 그 화면도 안 보이면 캔버스 위로 꺼내서
  if (!isCanvas(s) && !meets(rectOf(s)) && canvasDoc.value) {
    const c = canvasDoc.value
    store.transfer(s.id, ids, c.id, null, { x: s.x + dx, y: s.y + dy })
    return
  }
  store.update(s.id, ids, (n) => ({ x: n.x + dx, y: n.y + dy }))
}
/** 붙여넣고 누른 자리(캔버스 좌표)로 옮기기 */
function pasteAt(w: { x: number; y: number }) {
  doPaste()
  const sid = store.screenId.value
  const s = props.screens.find((v) => v.id === sid)
  if (!s || !store.layerIds.value.length) return
  const bs = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
  if (!bs.length) return
  const u = union(bs)
  const dx = Math.round(w.x - u.x), dy = Math.round(w.y - u.y)
  store.update(s.id, [...store.layerIds.value], (n) => ({ x: n.x + dx, y: n.y + dy }))
}
/** 화면(프레임) 우클릭 메뉴 */
/** 고른 화면(프레임)들을 감싸는 섹션을 캔버스에 만들어요(둘레 80 여백). 섹션을 옮기면 안의 화면도 함께 움직여요 */
function sectionScreens(ids?: string[]) {
  const list = (ids ?? (multi.value.length ? multi.value : store.screenId.value ? [store.screenId.value] : []))
    .map((id) => realScreens.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v)
  const c = canvasDoc.value
  if (!list.length || !c) return
  const pad = 80
  const x0 = Math.min(...list.map((v) => v.x)) - pad, y0 = Math.min(...list.map((v) => v.y)) - pad
  const x1 = Math.max(...list.map((v) => v.x + v.width)) + pad, y1 = Math.max(...list.map((v) => v.y + v.height)) + pad
  const id = store.add(c.id, null, { type: 'section', x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) })
  multi.value = []
  store.selectLayer(c.id, id)
}
function screenMenuItems(screen: ScreenRow, at: { x: number; y: number }): MenuItem[] {
  const native = isNative(screen)
  return [
    { label: tr('Copy'), shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy'); markIrisClip() } },
    { label: tr('Paste'), shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    ...(native ? [{ label: tr('Paste here'), action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' }] : []),
    { label: tr('Duplicate'), shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
    { label: tr('Wrap in section'), shortcut: '⌥⌘S', action: () => sectionScreens(multi.value.includes(screen.id) ? multi.value : [screen.id]) },
    'sep',
    { label: tr('Bring to front'), shortcut: ']', action: () => emit('screen-action', 'front') },
    { label: tr('Bring forward'), shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
    { label: tr('Send backward'), shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
    { label: tr('Send to back'), shortcut: '[', action: () => emit('screen-action', 'back') },
    'sep',
    ...(native ? [
      { label: tr('Select all layers'), action: () => store.selectAll(screen.id), disabled: !store.doc(screen.id).rootIds.length },
      { label: store.doc(screen.id).frame?.grids?.length ? tr('Remove layout grid') : tr('Add layout grid'), action: () => store.frameStyle(screen.id, { grids: store.doc(screen.id).frame?.grids?.length ? undefined : [{ type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF000019' }] }) },
      { label: tr('Copy as SVG'), action: () => { const d = store.doc(screen.id); const svg = svgOf(d, d.rootIds.map((id) => d.nodes[id]!).filter(Boolean), store.color); if (svg) navigator.clipboard.writeText(svg).then(() => emit('hint', tr('Copied to clipboard')), () => emit('hint', tr('Couldn\'t copy to the clipboard'))); else emit('hint', tr('Nothing to copy as SVG')) } },
    ] : []),
    // 프로젝트 썸네일(피그마 Set as thumbnail): 홈 목록 카드에 이 프레임을 보여 줘요. 이미 썸네일이면 기본(첫 페이지의 첫 화면)으로 되돌리기
    props.coverId === screen.id
      ? { label: tr('Restore default thumbnail'), action: () => emit('thumbnail', null) }
      : { label: tr('Set as thumbnail'), action: () => emit('thumbnail', screen.id) },
    { label: tr('Rename'), shortcut: '⌘R', action: () => (renamingFrame.value = screen.id) },
    { label: tr('Zoom to selection'), shortcut: '2', action: fitSelection },
    'sep',
    { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
  ]
}
/** 우클릭 메뉴(피그마와 같아요): 레이어 · 화면 · 빈 캔버스 */
function onContext(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, [contenteditable="true"]')) return
  const scrEl = t.closest('[data-screen]') as HTMLElement | null
  const screen = scrEl ? props.screens.find((v) => v.id === scrEl.dataset.screen) : undefined
  const lid = (t.closest('[data-layer]') as HTMLElement | null)?.dataset.layer
  const at = toWorld(e.clientX, e.clientY)
  // 누른 자리에 겹친 레이어들(맨 위부터) — 'Select layer' 로 골라요(피그마와 같아요, ⌘ 우클릭은 바로 이 목록)
  const under = screen ? [...new Set(document.elementsFromPoint(e.clientX, e.clientY).filter((x) => (x as HTMLElement).closest?.('[data-screen]')?.getAttribute('data-screen') === screen.id).map((x) => (x.closest('[data-layer]') as HTMLElement | null)?.dataset.layer).filter((v): v is string => !!v))] : []
  const pickMenu = (sid: string) => ctx.open(e, under.map((id) => ({ label: store.node(sid, id)?.name ?? id, action: () => store.selectLayer(sid, id) })))
  if (screen && lid && isNative(screen) && e.metaKey && under.length) { pickMenu(screen.id); return }
  // 왼쪽 클릭과 같은 레이어를 골라요(그룹 안이면 그룹) — 고른 것의 상자 안이면 그대로
  const picked = screen && lid && isNative(screen) ? pickLayer(screen.id, lid) : undefined
  if (screen && picked) {
    const lid = picked
    const selB = store.screenId.value === screen.id ? store.layerIds.value.map((id) => layerWorld(screen, id)).filter((b): b is Rect => !!b) : []
    const sb = selB.length ? union(selB) : null
    const inSel = store.screenId.value === screen.id && (store.layerIds.value.includes(lid) || (!!sb && at.x >= sb.x && at.x <= sb.x + sb.w && at.y >= sb.y && at.y <= sb.y + sb.h))
    if (!inSel) store.selectLayer(screen.id, lid)
    const n0 = store.node(screen.id, lid)
    const items = layerMenuItems(store, screen.id, [...store.layerIds.value], { lastCopy, paste: doPaste, pasteHere: () => pasteAt(at), fit: fitSelection, hint: (t) => emit('hint', t) })
    // 이름 바꾸기 · 점 편집은 Delete 위에(Delete 가 늘 맨 끝)
    const extra: MenuItem[] = n0 && store.layerIds.value.length === 1 && EDITABLE.has(n0.type) ? [{ label: tr('Edit vector'), shortcut: '↵', action: () => enterVectorEdit(screen.id, lid) }] : []
    items.splice(Math.max(0, items.length - 2), 0, ...extra)
    if (under.length > 1) items.unshift({ label: tr('Select layer'), action: () => pickMenu(screen.id) }, 'sep')
    ctx.open(e, items)
    return
  }
  if (screen && !isCanvas(screen)) {
    if (!multi.value.includes(screen.id)) store.selectScreen(screen.id)
    ctx.open(e, screenMenuItems(screen, at))
    return
  }
  ctx.open(e, [
    { label: tr('Paste'), shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    { label: tr('Paste here'), action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' },
    'sep',
    { label: tr('Zoom in'), shortcut: '⌘+', action: () => zoomAt(vp.value.zoom * 2) },
    { label: tr('Zoom out'), shortcut: '⌘−', action: () => zoomAt(vp.value.zoom / 2) },
    { label: tr('Zoom to {n}%', { n: 100 }), shortcut: '⌘0', action: () => zoomAt(1) },
    { label: tr('Zoom to fit'), shortcut: '1', action: () => fit() },
    'sep',
    { label: rulersShown.value ? tr('Hide rulers') : tr('Show rulers'), shortcut: '⇧R', action: () => (rulersShown.value = !rulersShown.value) },
    { label: gridsShown.value ? tr('Hide layout grids') : tr('Show layout grids'), shortcut: '⇧G', action: () => (gridsShown.value = !gridsShown.value) },
  ])
}
const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform)
/** 불투명도 숫자키(피그마 한국어 자판과 같아요): ⇧1 = 10% … ⇧9 = 90%, ⇧0 = 100%, 빠르게 두 번(⇧5 ⇧5 = 55%, ⇧0 ⇧0 = 0%) */
let opBuf: { s: string; t: number } | null = null
function setOpacity(v: number) {
  const sid = store.screenId.value
  if (!sid) return
  const ids = store.layerIds.value
  if (ids.length) { store.style(sid, ids, { opacity: v }); return }
  const list = multi.value.length ? multi.value : [sid]
  store.batch(() => { for (const id of list) { const s = props.screens.find((x) => x.id === id); if (s && isNative(s) && !isCanvas(s)) store.frameStyle(id, { opacity: v }) } })
}
/** 칠 · 선 단축키: ⇧X 맞바꾸기 · ⌥/ 칠 지우기 · ⇧/ 선 지우기(피그마와 같아요). 글자의 칠은 글자 색 */
function paintKey(kind: 'swap' | 'noFill' | 'noStroke') {
  const sid = store.screenId.value
  if (!sid) return
  const ids = store.layerIds.value
  store.batch(() => {
    for (const id of ids) {
      const n = store.node(sid, id)
      if (!n) continue
      const s = n.style
      const fk = n.type === 'text' ? 'color' : 'fill'
      if (kind === 'swap') store.style(sid, [id], { [fk]: s.stroke, stroke: s[fk], fills: s.strokes, strokes: s.fills, strokeWidth: s[fk] && !s.strokeWidth ? 1 : s.strokeWidth })
      else if (kind === 'noFill') store.style(sid, [id], { [fk]: n.type === 'text' ? 'transparent' : undefined, fills: undefined })
      else store.style(sid, [id], { stroke: undefined, strokes: undefined })
    }
  })
}
/** ⌃C 색 추출(피그마와 같아요): 화면에서 색을 집어 고른 것의 칠로. 아무것도 안 골랐으면 HEX 를 복사 */
async function pickColor() {
  const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
  if (!ED) { emit('hint', tr('This browser can’t pick colors from the screen. Try Chrome or Edge')); return }
  let hex: string
  try { hex = (await new ED().open()).sRGBHex.toUpperCase() } catch { return }
  const sid = store.screenId.value
  const ids = store.layerIds.value
  if (sid && ids.length) {
    store.batch(() => { for (const id of ids) { const n = store.node(sid, id); if (n) store.style(sid, [id], n.type === 'text' ? { color: hex } : { fill: hex, fills: undefined }) } })
  } else if (sid && !isPageCanvas(sid)) store.frameStyle(sid, { fill: hex, fills: undefined })
  else navigator.clipboard?.writeText(hex).then(() => emit('hint', tr('Copied {v}', { v: hex })), () => {})
}
/** 내보내기 대상 요소: 고른 레이어(여럿이면 각각) 또는 고른 화면 */
function exportTargets(): { el: HTMLElement; name: string; exports?: ExportSetting[] }[] {
  const sid = store.screenId.value
  const world = el.value?.querySelector('.world')
  if (!sid || !world) return []
  const ids = store.layerIds.value
  if (ids.length) return ids.map((id) => ({ el: world.querySelector<HTMLElement>(`[data-screen="${sid}"] [data-layer="${id}"]`), n: store.node(sid, id) })).filter((t) => t.el && t.n).map((t) => ({ el: t.el!, name: t.n!.name, exports: t.n!.exports }))
  const list = multi.value.length ? multi.value : [sid]
  return list.map((id) => ({ el: world.querySelector<HTMLElement>(`.frame[data-screen="${id}"]`), s: props.screens.find((x) => x.id === id) })).filter((t) => t.el && t.s).map((t) => ({ el: t.el!, name: t.s!.name, exports: store.doc(t.s!.id).exports }))
}
/** ⇧⌘C PNG 로 복사(피그마와 같아요, 2배) */
async function copyPng() {
  const t = exportTargets()[0]
  if (!t) return
  try {
    const blob = renderExport(t.el, { scale: '2x', format: 'PNG' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    emit('hint', tr('Copied as PNG'))
  } catch { emit('hint', tr('Couldn\'t copy to the clipboard')) }
}
/** ⇧⌘E 내보내기(피그마와 같아요): 고른 것의 Export 설정대로, 없으면 PNG 1x 로 내려받기 */
async function exportNow() {
  const ts = exportTargets()
  if (!ts.length) { emit('hint', tr('Nothing to export')); return }
  try {
    for (const t of ts) for (const e of t.exports?.length ? t.exports : [{ scale: '1x', format: 'PNG' } as ExportSetting]) download(await renderExport(t.el, e), fileNameOf(t.name, e))
  } catch { emit('hint', tr('Couldn’t export. Try again')) }
}
/** N · ⇧N 다음 · 이전 화면으로 맞춰 보기, End · Home 은 확대는 그대로 두고 찾아가기(피그마와 같아요) */
function stepScreen(back: boolean, zoom: boolean) {
  const list = realScreens.value
  if (!list.length) return
  const cur = list.findIndex((s) => s.id === store.screenId.value)
  const next = list[cur < 0 ? (back ? list.length - 1 : 0) : (cur + (back ? -1 : 1) + list.length) % list.length]!
  store.selectScreen(next.id)
  multi.value = []
  if (zoom) { fit([next.id]); return }
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  const z = vp.value.zoom
  vp.value = { zoom: z, x: r.width / 2 - (next.x + next.width / 2) * z, y: r.height / 2 - (next.y + next.height / 2) * z }
}
function onKeyDown(e: KeyboardEvent) {
  const cmdKey = e.metaKey || e.ctrlKey
  const handled = e.defaultPrevented
  // 글자를 고치는 중에도 확대 · 축소는 캔버스로(브라우저 화면 확대 대신)
  if (cmdKey && !e.altKey && (e.target as HTMLElement).closest?.('[contenteditable="true"]')) {
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); zoomAt(vp.value.zoom * 2); return }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomAt(vp.value.zoom / 2); return }
    if (e.code === 'Digit0') { e.preventDefault(); zoomAt(1); return }
  }
  // 브라우저 · 데스크톱 앱 기본 동작이 새지 않게(편집기에서는 늘): ⌘S 저장 창 · ⌘P 인쇄 · ⌘R · ⇧⌘R 새로고침 · ⌥⌘B 북마크
  if (cmdKey && !e.altKey && ['KeyS', 'KeyP', 'KeyR'].includes(e.code)) e.preventDefault()
  if (cmdKey && e.altKey && e.code === 'KeyB') e.preventDefault()
  if (typing(e)) return
  // 이미지 자르기 중: Enter · Esc 는 자르기 화면이 받아요(점 편집 · 선택 풀기로 새지 않게)
  if (imgEdit.value && (e.key === 'Enter' || e.key === 'Escape')) return
  // 다른 곳(색 고르기 · 메뉴 등)이 이미 처리한 키, 변수 화면처럼 캔버스를 덮는 창이 열려 있을 때는 캔버스 단축키를 쓰지 않아요
  if (handled || document.querySelector('.vars[role="dialog"]')) return
  if (e.key === 'Meta' && !metaHeld.value) { metaHeld.value = true; updateCmd() }
  // 펜으로 그리는 중: Enter · Esc 끝내기, Backspace 마지막 점 지우기
  if (pen.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'Backspace' || e.key === 'Delete') { pen.value.pts.pop(); if (!pen.value.pts.length) pen.value = null }
    else finishPen(false)
    return
  }
  // 점 편집 중(피그마와 같아요): ⌘A 모든 점, 방향키 고른 점 1 씩(⇧ 10)
  if (vedit.value) {
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyA') { e.preventDefault(); selectAllVpts(); return }
    const ar = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
    if (ar && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const k = e.shiftKey ? 10 : 1
      if (vselOf(vedit.value).length) moveVsel({ dx: ar[0] * k, dy: ar[1] * k })
      return
    }
  }
  // 점 편집 중: Enter · Esc 끝내기, Backspace 고른 점 지우기
  if (vedit.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'Backspace' || e.key === 'Delete') { if (vselOf(vedit.value).length) deleteVpt(e.shiftKey) } else vedit.value = null
    return
  }
  const mod = e.metaKey || e.ctrlKey
  // 자판 위치(KeyZ)로 찾아요 — 한글 입력 상태에서도 ⌘Z · ⌘C · ⌘V 등이 먹게
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
  const sid = store.screenId.value
  const ids = store.layerIds.value
  const screen = props.screens.find((v) => v.id === sid)
  const native = !!screen && isNative(screen)
  const layerMode = !!sid && ids.length > 0
  const stop = () => e.preventDefault()
  const bare = !mod && !e.altKey && !e.shiftKey

  if (e.code === 'Space') { space.value = true; stop(); return }
  if (e.key === 'Alt') altOn.value = true
  // 글자 단축키(글자 레이어를 골랐을 때): ⌘B · ⌘U · ⇧⌘X · ⌥⌘L/T/R/J · ⇧⌘< > · ⌥⌘< > · ⌥< > · ⌥⇧< > · ⇧⌘7 · ⇧⌘8
  if (layerMode && textShortcut(e, store, sid, ids)) { stop(); return }
  // 패널(피그마와 같아요): ⌥1 레이어 · ⌥2 에셋 · ⌥8 디자인 탭, ⌘\ UI 숨기기
  if (e.altKey && !mod && !e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit8')) { stop(); emit('ui', e.code === 'Digit1' ? 'left-file' : e.code === 'Digit2' ? 'left-assets' : 'design'); return }
  if (mod && !e.altKey && !e.shiftKey && (e.code === 'Backslash' || e.code === 'IntlYen')) { stop(); emit('ui', 'toggle-ui'); return }
  // 페이지 · 화면 찾아가기: PageUp · PageDown 이전 · 다음 페이지, N · ⇧N 다음 · 이전 화면, Home · End 이전 · 다음 화면(확대 그대로)
  if (!mod && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) { stop(); emit('ui', e.key === 'PageUp' ? 'prev-page' : 'next-page'); return }
  if (!mod && !e.altKey && e.code === 'KeyN') { stop(); stepScreen(e.shiftKey, true); return }
  if (bare && (e.key === 'Home' || e.key === 'End')) { stop(); stepScreen(e.key === 'Home', false); return }
  // 불투명도 ⇧0~⇧9(피그마 한국어 자판과 같아요)
  if (e.shiftKey && !mod && !e.altKey && /^Digit\d$/.test(e.code)) {
    stop()
    const dg = e.code.slice(5)
    const now = Date.now()
    const two = !!opBuf && now - opBuf.t < 700 && opBuf.s.length === 1
    const v = two ? Number(opBuf!.s + dg) / 100 : dg === '0' ? 1 : Number(dg) / 10
    opBuf = two ? null : { s: dg, t: now }
    setOpacity(v)
    return
  }
  // ⌃C 색 추출(맥)
  if (isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyC') { stop(); pickColor(); return }
  // 정렬 ⌥A · ⌥D · ⌥W · ⌥S · ⌥H · ⌥V / 균등 분배 ⌃⌥H · ⌃⌥V (macOS 는 ⌥ 가 e.key 를 바꿔서 e.code 로)
  if (e.altKey && !e.metaKey && !e.shiftKey) {
    const many = multi.value.length > 1
    // 정리(Tidy up) ⌃⌥T
    if (e.ctrlKey && e.code === 'KeyT') {
      if (layerMode && ids.length > 1) { stop(); store.tidy(sid!, ids) } else if (many) { stop(); emit('arrange-screens', { kind: 'tidy' }) }
      return
    }
    if (e.ctrlKey && (e.code === 'KeyH' || e.code === 'KeyV')) {
      const axis = e.code === 'KeyH' ? 'x' : 'y'
      if (layerMode) { stop(); store.distribute(sid!, ids, axis) } else if (many) { stop(); emit('arrange-screens', { kind: 'distribute', axis }) }
      return
    }
    const ALIGN: Record<string, AlignKind> = { KeyA: 'l', KeyD: 'r', KeyW: 't', KeyS: 'b', KeyH: 'c', KeyV: 'm' }
    const k = !e.ctrlKey ? ALIGN[e.code] : undefined
    if (k) {
      if (layerMode) { stop(); store.align(sid!, ids, k) } else if (many) { stop(); emit('arrange-screens', { kind: 'align', k }) }
      return
    }
    // ⌥/ 칠 지우기
    if (e.code === 'Slash' && !e.ctrlKey) { if (layerMode) { stop(); paintKey('noFill') } return }
  }
  // 뒤집기 ⇧H · ⇧V (⇧⌘H 숨기기와 다름)
  if (e.shiftKey && !mod && !e.altKey && (e.code === 'KeyH' || e.code === 'KeyV')) { if (layerMode) { stop(); store.flip(sid!, ids, e.code === 'KeyH' ? 'x' : 'y') } return }
  // 칠 · 선 맞바꾸기 ⇧X · 선 지우기 ⇧/
  if (e.shiftKey && !mod && !e.altKey && (e.code === 'KeyX' || e.code === 'Slash')) { if (layerMode) { stop(); paintKey(e.code === 'KeyX' ? 'swap' : 'noStroke') } return }
  // 실행취소 · 확대
  if (mod && key === 'z') { stop(); if (e.shiftKey) store.redo(); else store.undo(); return }
  if (mod && key === 'y') { stop(); store.redo(); return }
  if (!e.altKey && !e.shiftKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) { stop(); zoomAt(vp.value.zoom * 2); return }
  if (!e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { stop(); zoomAt(vp.value.zoom / 2); return }
  if (mod && !e.shiftKey && e.code === 'Digit0') { stop(); zoomAt(1); return }
  // 1 모두 보이게 · 2 고른 것에 맞추기(피그마 한국어 자판과 같아요 — ⇧ 숫자는 불투명도)
  if (bare && e.code === 'Digit1') { stop(); fit(); return }
  if (bare && e.code === 'Digit2') { stop(); if (sid) fitSelection(); return }
  // 이름 바꾸기 ⌘R(피그마와 같아요): 레이어 하나면 레이어 목록에서 바로, 여러 개면 창, 화면이면 이름표에서.
  // 고른 게 없으면 이 탭만 새로 고침(탭 막대 · 다른 탭은 그대로 — 브라우저 전체 새로고침 대신)
  if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyR') {
    if (layerMode) renameReq.value = pickedLayers(store, sid!, ids)
    else if (sid && !isPageCanvas(sid) && !multi.value.length) renamingFrame.value = sid
    else if (!sid && !multi.value.length) emit('reload')
    return
  }
  // 내용에 맞게 크기 ⌥⇧⌘R(피그마 Resize to fit)
  if (mod && e.shiftKey && e.altKey && e.code === 'KeyR') { if (layerMode && native) store.resizeToFit(sid!, ids); return }
  // 바꿔 붙여넣기 ⇧⌘R · 고른 것 위에 붙여넣기 ⇧⌘V(피그마와 같아요)
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyR') {
    if (layerMode && lastCopy.value !== 'screen' && store.pasteOnSelection(true)) return
    emit('hint', layerMode ? tr('Copy something first') : tr('Select layers to replace'))
    return
  }
  if (mod && e.shiftKey && !e.altKey && key === 'v') {
    stop()
    if (layerMode && lastCopy.value !== 'screen' && store.pasteOnSelection(false)) return
    doPaste()
    return
  }
  if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyR') { stop(); rulersShown.value = !rulersShown.value; return }
  // ⇧' 픽셀 격자 보이기 · ⇧⌘' 픽셀에 맞추기(피그마와 같아요)
  if (e.shiftKey && !e.altKey && e.code === 'Quote') { stop(); emit('view', mod ? 'snapPixel' : 'pixelGrid'); return }
  // 레이아웃 그리드 보이기 · 숨기기 ⇧G(피그마 Layout guides) · ⌃G
  if (((e.shiftKey && !mod) || (e.ctrlKey && !e.metaKey && !e.shiftKey)) && !e.altKey && e.code === 'KeyG') { stop(); gridsShown.value = !gridsShown.value; emit('hint', gridsShown.value ? tr('Layout grids shown') : tr('Layout grids hidden')); return }
  // 오토 레이아웃 ⇧A · 빼기 ⌥⇧A
  if (e.shiftKey && !mod && e.code === 'KeyA') { if (layerMode && native) { stop(); if (e.altKey) store.removeAutoLayout(sid!, ids); else store.addAutoLayout(sid!, ids) } return }
  // 속성 복사 · 붙여넣기 ⌥⌘C / ⌥⌘V (레이어 · 화면)
  if (mod && e.altKey && e.code === 'KeyC') { stop(); if (sid && !isPageCanvas(sid) || layerMode) { if (store.copyStyle()) emit('hint', tr('Copied properties')) } return }
  if (mod && e.altKey && e.code === 'KeyV') { stop(); if (sid) store.pasteStyle(); return }
  // PNG 로 복사 ⇧⌘C
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyC') { stop(); copyPng(); return }
  // 내보내기 ⇧⌘E
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyE') { stop(); exportNow(); return }
  // 복사 · 잘라내기 · 붙여넣기 · 복제
  if (mod && key === 'c') {
    // 레이어 + 섞어 고른 화면 · 여러 화면: 고른 것 전부(피그마와 같아요)
    if (layerMode && store.copy()) { stop(); if (mix.value.length) { lastCopy.value = 'mixed'; emit('clip-screens', [...mix.value]) } else lastCopy.value = 'layers' }
    else if (!layerMode && multi.value.length > 1) { lastCopy.value = 'screen'; emit('clip-screens', [...multi.value]); stop() }
    else if (sid && !layerMode && !isPageCanvas(sid)) { lastCopy.value = 'screen'; emit('screen-action', 'copy'); stop() }
    else return
    markIrisClip()
    return
  }
  if (mod && key === 'x') { if (layerMode && store.copy()) { lastCopy.value = 'layers'; stop(); markIrisClip(); store.remove(sid!, ids) } return }
  // ⌘V 는 막지 않아요: 붙여넣기 이벤트(onPaste)가 다른 앱에서 복사한 그림 · SVG 를 먼저 보고, 없으면 Iris 클립보드를 붙여요
  if (mod && key === 'v') return
  if (mod && key === 'd') {
    stop()
    // 섞어 고른 것 · 여러 화면은 복사 + 붙여넣기와 같아요(고른 것 전부)
    if ((layerMode && mix.value.length) || (!layerMode && multi.value.length > 1)) {
      const keep = lastCopy.value
      if (layerMode && store.copy()) { lastCopy.value = 'mixed'; emit('clip-screens', [...mix.value]) } else { lastCopy.value = 'screen'; emit('clip-screens', [...multi.value]) }
      doPaste()
      lastCopy.value = keep
      return
    }
    if (layerMode) store.duplicate(); else if (sid) emit('screen-action', 'duplicate')
    return
  }
  // 모두 고르기 ⌘A(같은 단계 — 레이어를 골랐으면 그 형제, 화면이나 아무것도 안 골랐으면 모든 화면) · 반전 ⇧⌘A · 같은 것 모두 ⌥⌘A
  if (mod && e.code === 'KeyA') {
    stop()
    if (e.altKey) { if (layerMode) selectMatchingSay(store, sid!, (t) => emit('hint', t)); return }
    if (layerMode) { if (e.shiftKey) store.selectInverse(sid!); else store.selectAll(sid!); return }
    const all = realScreens.value.map((v) => v.id)
    const cur = new Set(multi.value.length ? multi.value : sid ? [sid] : [])
    const next = e.shiftKey ? all.filter((id) => !cur.has(id)) : all
    if (!next.length) { store.selectScreen(null); multi.value = []; return }
    store.selectScreen(next[0]!)
    multi.value = next.length > 1 ? next : []
    return
  }
  // 평탄화 ⌥⇧F(피그마) · ⌘E · 마스크 ⌃⌘M · 불리언 ⌥⇧U 합치기 · ⌥⇧S 빼기 · ⌥⇧I 교차 · ⌥⇧E 제외
  if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyE') { if (layerMode && native) { stop(); store.flatten(sid!, ids) } return }
  if (e.metaKey && e.ctrlKey && e.code === 'KeyM') { if (layerMode && native) { stop(); store.toggleMask(sid!, ids) } return }
  if (e.altKey && e.shiftKey && !mod) {
    if (e.code === 'KeyF') { if (layerMode && native) { stop(); store.flatten(sid!, ids) } return }
    const OPS: Record<string, 'union' | 'subtract' | 'intersect' | 'exclude'> = { KeyU: 'union', KeyS: 'subtract', KeyI: 'intersect', KeyE: 'exclude' }
    const op = OPS[e.code]
    if (op) { if (layerMode && native && ids.length > 1) { stop(); store.booleanOp(sid!, ids, op) } return }
  }
  // 섹션으로 감싸기 ⌥⌘S(Iris 단축키 — 피그마는 단축키 없이 메뉴로만): 캔버스 위 레이어 → 섹션, 화면(프레임) → 그 화면들을 감싸는 섹션
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
    stop()
    if (layerMode) {
      const d = store.doc(sid!)
      if (isPageCanvas(sid!) && ids.every((id) => !d.nodes[id]?.parentId)) store.wrap(sid!, ids, 'section')
      else emit('hint', tr('Sections can only be placed on the canvas'))
    } else sectionScreens()
    return
  }
  // 묶기 ⌘G(그룹) · ⌥⌘G(프레임으로 감싸기) · ⇧⌘G(풀기)
  if (mod && e.code === 'KeyG') { if (!layerMode) return; stop(); if (e.shiftKey) store.unwrap(sid!, ids); else store.wrap(sid!, ids, e.altKey ? 'frame' : 'group'); return }
  // 숨기기 ⇧⌘H · 잠그기 ⇧⌘L
  if (mod && e.shiftKey && e.code === 'KeyH') { if (layerMode) { stop(); const hide = !store.node(sid!, ids[0]!)?.hidden; store.update(sid!, ids, { hidden: hide }) } return }
  if (mod && e.shiftKey && e.code === 'KeyL') { if (layerMode) { stop(); const lock = !store.node(sid!, ids[0]!)?.locked; store.update(sid!, ids, { locked: lock }) } return }
  // Esc: 선택 모두 풀기(피그마와 같아요 — 안쪽 레이어를 골랐어도 바깥 프레임으로 돌아가지 않고 아무것도 안 고른 상태로)
  if (e.key === 'Escape') {
    store.selectScreen(null)
    multi.value = []
    tool.value = 'move'
    return
  }
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const a = arrows[e.key]
  // 아무것도 안 골랐을 때 방향키: 캔버스 옮기기(피그마와 같아요, ⇧ 크게)
  if (!sid) {
    if (a && !mod && !e.altKey) { stop(); const k = e.shiftKey ? 200 : 40; vp.value = { ...vp.value, x: vp.value.x - a[0] * k, y: vp.value.y - a[1] * k } }
    return
  }
  // 그룹 · 프레임 · 섹션 풀기 ⌘⌫(피그마와 같아요 — 안의 내용은 남겨요)
  if (mod && (e.key === 'Delete' || e.key === 'Backspace')) { stop(); if (layerMode) store.unwrap(sid, ids); return }
  // 지우기
  if (e.key === 'Delete' || e.key === 'Backspace') { stop(); if (layerMode) { if (mix.value.length) emit('screen-action', 'remove'); store.remove(sid, ids) } else emit('screen-action', 'remove'); return }
  // 순서: ⌘] · ⌘[ 한 칸, ] · [ 맨 앞 · 맨 뒤(피그마와 같아요), ⌥⌘] · ⌥⌘[ 도 맨 앞 · 맨 뒤
  // ⌥ 가 e.key 를 바꾸는 맥에서도 되게 e.code 로. 화면만 골랐으면 화면 순서
  if ((e.code === 'BracketRight' || e.code === 'BracketLeft') && !e.shiftKey && (mod || !e.altKey)) {
    stop()
    const up = e.code === 'BracketRight'
    const toEnd = !mod || e.altKey
    if (layerMode) store.arrange(sid, ids, up ? (toEnd ? 'top' : 1) : (toEnd ? 'bottom' : -1))
    else if (!isPageCanvas(sid)) emit('screen-action', up ? (toEnd ? 'front' : 'forward') : (toEnd ? 'back' : 'backward'))
    return
  }
  // 고르기 이동: Enter(안으로 · 텍스트면 고치기) · Shift+Enter · \(부모로) · Tab(다음 레이어)
  if (bare && e.code === 'Backslash' && native) { stop(); store.selectParent(sid); return }
  if (e.key === 'Enter' && native) {
    stop()
    if (e.shiftKey) { store.selectParent(sid); return }
    const n = ids.length === 1 ? store.node(sid, ids[0]!) : undefined
    // 글자 여러 개(이 프레임 · 다른 프레임)를 골랐으면 첫 글자를 고치고, 치는 대로 나머지에도 똑같이
    const texts = ids.map((id) => store.node(sid, id)).filter((v) => v?.type === 'text')
    if (n?.type === 'text') store.editing.value = n.id
    else if (texts.length && texts.length === ids.length) store.editing.value = texts[0]!.id
    else if (n && EDITABLE.has(n.type)) enterVectorEdit(sid, n.id) // 도형 · 벡터: Enter = 편집(피그마와 같아요)
    else store.selectChildren(sid)
    return
  }
  if (e.key === 'Tab' && native) { stop(); store.selectSibling(sid, e.shiftKey ? -1 : 1); return }
  if (a) {
    stop()
    const k = e.shiftKey ? 10 : 1
    // ⌘ 방향키: 크기(피그마와 같아요) — → 너비 +, ← 너비 −, ↓ 높이 +, ↑ 높이 −
    if (mod) {
      if (e.altKey) return
      if (layerMode) store.sizeTo(sid, store.topIds(sid, ids).filter((id) => !store.node(sid, id)?.locked), (n) => ({ w: Math.max(1, n.w + a[0] * k), h: Math.max(1, n.h + a[1] * k), ...(n.type === 'text' && a[0] && n.style.autoWidth ? { style: { ...n.style, autoWidth: false } } : {}) }))
      else if (screen && !isPageCanvas(sid)) emit('resize-screen', sid, { x: screen.x, y: screen.y, width: Math.max(1, screen.width + a[0] * k), height: Math.max(1, screen.height + a[1] * k) }, true)
      return
    }
    if (e.altKey) return
    // 오토 레이아웃 안이면 옮기지 않고 순서를 바꿔요(피그마와 같아요)
    const dirOf = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
    if (layerMode && store.moveInFlow(sid, ids, dirOf[e.key as keyof typeof dirOf])) return
    // 함께 고른 다른 문서의 레이어도 같이(실행취소 한 번)
    if (layerMode) store.batch(() => { store.update(sid, store.topIds(sid, ids), (n) => ({ x: n.x + a[0] * k, y: n.y + a[1] * k })); for (const [s2, ids2] of store.xGroups()) store.update(s2, store.topIds(s2, ids2), (n) => ({ x: n.x + a[0] * k, y: n.y + a[1] * k })) })
    else emit('screen-action', 'nudge', a[0] * k, a[1] * k)
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') space.value = false
  if (e.key === 'Alt') altOn.value = false
  if (e.key === 'Meta') { metaHeld.value = false; cmdMarks.value = null }
}
const onBlur = () => { altOn.value = false; space.value = false; metaHeld.value = false; cmdMarks.value = null }
/** 고른 것으로 확대(maxZoom: 가장 크게 — 기본 400%) */
function fitSelection(maxZoom = 4) {
  const sid = store.screenId.value
  const s = props.screens.find((v) => v.id === sid)
  if (!s) return
  const boxes = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b) => !!b)
  if (!boxes.length) return fit([s.id])
  fitRect(Math.min(...boxes.map((b) => b!.x)), Math.min(...boxes.map((b) => b!.y)), Math.max(...boxes.map((b) => b!.x + b!.w)), Math.max(...boxes.map((b) => b!.y + b!.h)), maxZoom)
}
defineExpose({ fit, zoomAt, fitSelection, reveal, focusOn, insertInstance, sectionScreens, paste: doPaste })

let gz = 1
const onGestureStart = (e: Event) => { e.preventDefault(); gz = vp.value.zoom }
const onGestureChange = (e: Event) => {
  e.preventDefault()
  const g = e as Event & { scale: number; clientX: number; clientY: number }
  const r = el.value!.getBoundingClientRect()
  zoomAt(gz * g.scale, g.clientX - r.left, g.clientY - r.top)
}
onMounted(() => {
  el.value?.addEventListener('wheel', onWheel, { passive: false })
  el.value?.addEventListener('gesturestart', onGestureStart)
  el.value?.addEventListener('gesturechange', onGestureChange)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
})
onBeforeUnmount(() => {
  el.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
})

// ---------------------------------------------------------------------------
// 화면 좌표 계산 (라벨 · 선택 상자는 확대해도 같은 크기로 바깥 층에)
// ---------------------------------------------------------------------------
/** 피그마 연결 표시(로고)가 차지할 폭: 16, 화면이 아주 작게 보이면 숨김(0) */
const figTagW = (s: { width: number }) => (s.width * vp.value.zoom >= 40 ? 16 : 0)
const box = (s: { x: number; y: number; width: number; height: number }) => ({
  left: s.x * vp.value.zoom + vp.value.x + 'px',
  top: s.y * vp.value.zoom + vp.value.y + 'px',
  width: s.width * vp.value.zoom + 'px',
  height: s.height * vp.value.zoom + 'px',
})
/** 레이어 크기. 글자 길이에 맞추는 텍스트는 실제 그려진 크기를 씁니다 */
function layerSize(sid: string, id: string) {
  const n = store.node(sid, id)
  if (!n) return null
  if (n.type === 'text' && import.meta.client) {
    const node = el.value?.querySelector(`[data-screen="${sid}"] [data-layer="${id}"]`) as HTMLElement | null
    if (node) return { w: node.offsetWidth, h: node.offsetHeight }
  }
  return { w: n.w, h: n.h }
}
/** 레이어 안쪽 좌표 → 캔버스 좌표 (부모들의 회전 · 뒤집기까지) */
/** 화면 이름표 자리: 돌린 화면은 돌린 왼쪽 위 모서리에서 같은 각도로(피그마와 같아요) */
function labelPos(s: ScreenRow) {
  const t = frameTags(s)
  return t ? t.label : { left: box(s).left, top: `calc(${box(s).top} - 20px)` }
}
/**
 * 돌린 화면의 이름표 · 크기 표시(피그마와 같아요): 화면 각도를 따라 기울되 거꾸로 서지 않게 — 각도를 ±45° 안으로 줄이고
 * 그때 위에 오는 변의 왼쪽 끝에 이름표, 아래에 오는 변 가운데 아래에 크기 표시
 */
function frameTags(s: ScreenRow) {
  const rot = scrRot(s)
  return rot ? tagsFor({ cx: s.x + s.width / 2, cy: s.y + s.height / 2, w: s.width, h: s.height, angle: rot }) : null
}
/** 돌린 상자(화면 · 레이어 공통)의 이름표 · 크기 표시 자리: 각도를 ±45° 안으로 줄여 위 · 아래에 오는 변을 따라(거꾸로 서지 않게) */
function tagsFor(g: { cx: number; cy: number; w: number; h: number; angle: number }) {
  const rot = g.angle
  const k = Math.round(rot / 90), eff = rot - k * 90
  const odd = Math.abs(k) % 2 === 1
  const W = odd ? g.h : g.w, H = odd ? g.w : g.h
  const t = (eff * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const at = (u: number, v: number) => ({ x: (g.cx + u * cos - v * sin) * vp.value.zoom + vp.value.x, y: (g.cy + u * sin + v * cos) * vp.value.zoom + vp.value.y })
  const tl = at(-W / 2, -H / 2), bc = at(0, H / 2)
  return {
    label: { left: tl.x + 'px', top: tl.y - 20 + 'px', transform: eff ? `rotate(${eff}deg)` : undefined, transformOrigin: '0 20px' },
    size: { left: bc.x + 'px', top: bc.y + 'px', marginTop: '0', transformOrigin: '0 0', transform: `rotate(${eff}deg) translate(-50%, 8px)` },
  }
}
/** 화면(맨 위 프레임) 회전(도) — Iris 화면만 */
const scrRot = (s: { id: string; source?: string }) => (s.source === 'native' && !isPageCanvas(s.id) ? store.doc(s.id).frame?.rotation ?? 0 : 0)
/** 화면 안쪽 좌표 → 캔버스 좌표(돌린 화면은 가운데 기준으로 돌려요) */
/** 화면 뒤집기(Iris 화면만) */
const scrFlip = (s: { id: string; source?: string }) => { const f = s.source === 'native' && !isPageCanvas(s.id) ? store.doc(s.id).frame : undefined; return { x: !!f?.flipX, y: !!f?.flipY } }
/** 화면 모양 변환(CSS): 돌리기 · 뒤집기, 가운데 기준 */
const scrTf = (s: ScreenRow) => { const r = scrRot(s), f = scrFlip(s); const t = [r ? `rotate(${r}deg)` : '', f.x ? 'scaleX(-1)' : '', f.y ? 'scaleY(-1)' : ''].filter(Boolean).join(' '); return t || undefined }
const screenMat = (s: ScreenRow): Mat => { const r = scrRot(s), f = scrFlip(s); return r || f.x || f.y ? localMatrix({ x: s.x, y: s.y, rotation: r, flipX: f.x, flipY: f.y }, s.width, s.height) : translate(s.x, s.y) }
const worldMat = (s: ScreenRow, id: string) => mul(screenMat(s), layerMatrix(store.doc(s.id), id, (k) => layerSize(s.id, k)))
function parentWorld(s: ScreenRow, id: string): Mat {
  const d = store.doc(s.id)
  const p = d.nodes[id]?.parentId
  return p && d.nodes[p] ? worldMat(s, p) : screenMat(s)
}
/** 레이어의 가운데 · 크기 · 캔버스에서 돈 각도 */
function layerGeom(s: ScreenRow, id: string) {
  const sz = layerSize(s.id, id)
  if (!sz) return null
  const m = worldMat(s, id)
  const c = apply(m, sz.w / 2, sz.h / 2)
  return { id, cx: c.x, cy: c.y, w: sz.w, h: sz.h, angle: angleOf(m) }
}
/** 레이어를 감싸는 캔버스 좌표 상자(돌렸으면 돌린 모양을 감싸는) */
function layerWorld(s: ScreenRow, id: string): Rect | null {
  const sz = layerSize(s.id, id)
  return sz ? aabb(worldMat(s, id), sz.w, sz.h) : null
}
const tick = ref(0) // 텍스트 크기 다시 재기
watch(() => [store.docs, store.editing.value], () => nextTick(() => tick.value++), { deep: true })
const selScreen = computed(() => props.screens.find((s) => s.id === store.screenId.value) ?? null)
const selFrame = computed(() => (selScreen.value && !isCanvas(selScreen.value) && !store.doc(selScreen.value.id).frame?.hidden ? selScreen.value : null))
const multiBoxes = computed(() => [...multi.value, ...mix.value].map((id) => props.screens.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
/** 함께 고른 다른 문서의 레이어(맨 위 것만)를 끌기 시작할 때의 자리 · 부모 행렬 · 기록 시작점 */
function xCarryStart() {
  const xcarry: { sid: string; id: string; x: number; y: number; inv: Mat }[] = []
  const xbefore: [string, string][] = []
  for (const [sid, ids] of store.xGroups()) {
    const sc = props.screens.find((v) => v.id === sid)
    if (!sc) continue
    const d = store.doc(sid)
    const top = store.topIds(sid, ids).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
    if (!top.length) continue
    xbefore.push([sid, store.begin(sid)])
    for (const id of top) xcarry.push({ sid, id, x: d.nodes[id]!.x, y: d.nodes[id]!.y, inv: invert(parentWorld(sc, id)) })
  }
  return xcarry.length ? { xcarry, xbefore } : {}
}
/** 함께 고른 것까지 감싸는 상자(캔버스 좌표) — 문서를 넘어 고르면 큰 상자 하나 + 크기(손잡이는 없어요) */
const xAllWorld = computed(() => {
  void tick.value
  if (!store.xsel.value.length) return null
  const s = selScreen.value
  const bs: Rect[] = []
  if (s) for (const id of store.layerIds.value) { const b = layerWorld(s, id); if (b) bs.push(b) }
  for (const x of store.xsel.value) { const sc = props.screens.find((v) => v.id === x.sid); const b = sc ? layerWorld(sc, x.id) : null; if (b) bs.push(b) }
  return bs.length ? union(bs) : null
})
/** 함께 고른 다른 문서 레이어의 선택선 */
const xBoxes = computed<Geom[]>(() => {
  void tick.value
  return store.xsel.value.map((x) => { const sc = props.screens.find((v) => v.id === x.sid); return sc ? layerGeom(sc, x.id) : null }).filter((g): g is Geom => !!g)
})
type Geom = NonNullable<ReturnType<typeof layerGeom>>
const selBoxes = computed<Geom[]>(() => {
  void tick.value
  const s = selScreen.value
  if (!s) return []
  return store.layerIds.value.map((id) => layerGeom(s, id)).filter((g): g is Geom => !!g)
})
/**
 * 오토 레이아웃 간격 표시(피그마와 같아요): 오른쪽 패널의 간격 · 여백 칸에 올리면 고른 오토 레이아웃 프레임마다 그 자리를 분홍으로.
 * 자리는 프레임 안 좌표(돌린 프레임은 상자째 돌려요) — 항목 사이 간격은 실제 놓인 자리로 재요(Auto 간격도 맞게)
 */
const alHint = useAlHint()
type Zone = { x: number; y: number; w: number; h: number }
const alZones = computed(() => {
  void tick.value
  const hint = alHint.value
  if (hint === null) return []
  const picks: { sid: string; id: string }[] = [...(selScreen.value ? store.layerIds.value.map((id) => ({ sid: selScreen.value!.id, id })) : []), ...store.xsel.value]
  const out: { key: string; g: Geom; zones: Zone[] }[] = []
  for (const p of picks) {
    const sc = props.screens.find((v) => v.id === p.sid)
    const d = store.doc(p.sid)
    const n = d.nodes[p.id]
    const l = n?.style.layout
    const g = sc ? layerGeom(sc, p.id) : null
    if (!n || !l || !g) continue
    const [pt, pr, pb, pl] = l.padding
    const zones: Zone[] = []
    const W = n.w, H = n.h
    if (hint === 'padH' || hint === 3) zones.push({ x: 0, y: 0, w: pl, h: H })
    if (hint === 'padH' || hint === 1) zones.push({ x: W - pr, y: 0, w: pr, h: H })
    if (hint === 'padV' || hint === 0) zones.push({ x: 0, y: 0, w: W, h: pt })
    if (hint === 'padV' || hint === 2) zones.push({ x: 0, y: H - pb, w: W, h: pb })
    if (hint === 'gap' || hint === 'rowGap') {
      const kids = (n.children ?? []).map((k) => d.nodes[k]).filter((c): c is LayerNode => !!c && !c.hidden && !c.absolute)
      const hz = l.mode === 'horizontal'
      // 줄 나누기(줄바꿈일 때): 가로면 위쪽 자리로, 세로면 왼쪽 자리로 묶어요
      const rows: LayerNode[][] = []
      if (l.wrap) {
        for (const c of [...kids].sort((a, b) => (hz ? a.y - b.y : a.x - b.x))) {
          const row = rows.find((r) => Math.abs((hz ? r[0]!.y : r[0]!.x) - (hz ? c.y : c.x)) < 0.5)
          if (row) row.push(c); else rows.push([c])
        }
      } else rows.push(kids)
      if (hint === 'gap') {
        for (const row of rows) {
          const r = [...row].sort((a, b) => (hz ? a.x - b.x : a.y - b.y))
          // 줄의 옆 방향 범위(줄바꿈이면 그 줄, 아니면 여백 안 전체)
          const c0 = l.wrap ? Math.min(...r.map((c) => (hz ? c.y : c.x))) : hz ? pt : pl
          const c1 = l.wrap ? Math.max(...r.map((c) => (hz ? c.y + c.h : c.x + c.w))) : hz ? H - pb : W - pr
          for (let i = 0; i + 1 < r.length; i++) {
            const a = r[i]!, b = r[i + 1]!
            const s0 = hz ? a.x + a.w : a.y + a.h, s1 = hz ? b.x : b.y
            if (s1 - s0 <= 0.01) continue
            zones.push(hz ? { x: s0, y: c0, w: s1 - s0, h: c1 - c0 } : { x: c0, y: s0, w: c1 - c0, h: s1 - s0 })
          }
        }
      } else {
        const bands = rows.map((r) => ({ a: Math.min(...r.map((c) => (hz ? c.y : c.x))), b: Math.max(...r.map((c) => (hz ? c.y + c.h : c.x + c.w))) })).sort((p, q) => p.a - q.a)
        for (let i = 0; i + 1 < bands.length; i++) {
          const s0 = bands[i]!.b, s1 = bands[i + 1]!.a
          if (s1 - s0 <= 0.01) continue
          zones.push(hz ? { x: pl, y: s0, w: W - pl - pr, h: s1 - s0 } : { x: s0, y: pt, w: s1 - s0, h: H - pt - pb })
        }
      }
    }
    const shown = zones.filter((z) => z.w > 0.01 && z.h > 0.01)
    if (shown.length) out.push({ key: p.sid + ':' + p.id, g, zones: shown })
  }
  return out
})
/** 고른 컴포넌트(인스턴스): 피그마처럼 선택선 · 손잡이 · 크기 표시를 보라색으로 */
const compIds = computed(() => { const s = selScreen.value; return new Set(s ? store.layerIds.value.filter((id) => store.node(s.id, id)?.type === 'instance') : []) })
const selComp = computed(() => selBoxes.value.length > 0 && selBoxes.value.every((b) => compIds.value.has(b.id)))
const single = computed(() => {
  if (selBoxes.value.length !== 1 || store.editing.value || store.xsel.value.length) return null
  const b = selBoxes.value[0]!
  const n = store.node(selScreen.value!.id, b.id)
  return { ...b, locked: !!n?.locked, rotation: n?.rotation ?? 0 }
})
/** 문서 REQ 미리 보기 상자: 항목(레이어)이 있으면 그 상자들, 없으면 화면 전체 */
const peekBoxes = computed(() => {
  const out: Record<string, string | undefined>[] = []
  for (const it of props.peek?.items ?? []) {
    const s = props.screens.find((v) => v.id === it.sid)
    if (!s) continue
    const gs = it.ids.map((id) => layerGeom(s, id)).filter((g): g is NonNullable<typeof g> => !!g)
    if (gs.length) for (const g of gs) out.push(rbox(g))
    else out.push(box(s))
  }
  return out
})
/** 돌린 상자를 화면 좌표로: 가운데에 놓고 angle 만큼 돌려요 */
const rbox = (g: { cx: number; cy: number; w: number; h: number; angle: number }) => ({
  left: (g.cx - g.w / 2) * vp.value.zoom + vp.value.x + 'px',
  top: (g.cy - g.h / 2) * vp.value.zoom + vp.value.y + 'px',
  width: g.w * vp.value.zoom + 'px',
  height: g.h * vp.value.zoom + 'px',
  transform: g.angle ? `rotate(${g.angle}deg)` : undefined,
})
/** 크기 · 각도 표시: 돌려도 상자 아래 가운데에 똑바로 */
function belowBox(g: { cx: number; cy: number; w: number; h: number; angle: number }) {
  const t = (g.angle * Math.PI) / 180
  const half = (Math.abs(Math.sin(t)) * g.w + Math.abs(Math.cos(t)) * g.h) / 2
  return { left: g.cx * vp.value.zoom + vp.value.x + 'px', top: (g.cy + half) * vp.value.zoom + vp.value.y + 'px' }
}
const rotating = ref(false)

// ---------------------------------------------------------------------------
// 스마트 가이드(끄는 동안) · 간격 측정(⌥ 호버)
// ---------------------------------------------------------------------------
const guides = ref<Guides | null>(null)
const altOn = ref(false)
/** 마우스를 올린 레이어 — 레이어 목록 줄에 올려도 캔버스에 테두리가 보여요(피그마와 같아요) */
const hover = useState<{ sid: string; id: string | null } | null>('iris-hover', () => null)
/** 마우스를 올린 레이어는 모양과 상관없이 늘 네모 상자로(모양선 · 둥근 상자 · 글자 밑줄 대신). false 로 바꾸면 피그마식 모양 따라가기 */
const HOVER_BOX_ONLY = true
/**
 * 누르거나 올렸을 때 잡히는 레이어(피그마와 같아요): 화면 바로 아래 것부터 — 고른 레이어(와 그 조상) 안쪽, 섹션 안쪽만 한 단계씩 열려요.
 * 프레임 · 그룹 안 레이어는 그 프레임을 고른 뒤 · 두 번 눌러서 · ⌘ 를 누른 채(deep) 잡아요
 */
function pickLayer(sid: string, deepId: string | undefined, deep = false, selAt?: string[]): string | undefined {
  if (!deepId || deep) return deepId
  const d = store.doc(sid)
  const chain: string[] = []
  for (let id: string | null | undefined = deepId; id && d.nodes[id]; id = d.nodes[id]!.parentId) chain.unshift(id)
  const open = new Set<string>()
  // selAt: 이 선택 기준으로(두 번 누르기는 첫 누름 직전 선택으로 판단해요)
  const selNow = selAt ?? (store.screenId.value === sid ? store.layerIds.value : [])
  for (const id of selNow) for (let p: string | null | undefined = id; p && d.nodes[p]; p = d.nodes[p]!.parentId) open.add(p)
  // 캔버스에 바로 놓인 프레임도 맨 위 프레임이에요(피그마와 같아요): 안을 누르면 안쪽 레이어가 바로 골라져요
  const top = d.nodes[chain[0]!]
  const s0 = isPageCanvas(sid) && chain.length > 1 && top?.type === 'frame' && !isGroupNode(top) ? 1 : 0
  if (s0) open.add(chain[0]!)
  let target = chain[0]
  for (let i = 1; i < chain.length; i++) {
    const parent = d.nodes[chain[i - 1]!]
    if (open.has(chain[i - 1]!) || parent?.type === 'section') target = chain[i]
    else break
  }
  // 부모 → 자식(피그마와 같아요): 화면을 통째로 덮는 레이어(프레임보다 큰 사진 등)는 화면을 먼저 골라요.
  // 화면을 고른 뒤 다시 누르면 그 레이어가 골라져요
  if (target === chain[0]) {
    const scr = props.screens.find((v) => v.id === sid)
    const screenSelected = store.screenId.value === sid && !store.layerIds.value.length
    const b = scr && !isCanvas(scr) && !screenSelected ? layerWorld(scr, target!) : null
    if (scr && b && b.x <= scr.x + 0.5 && b.y <= scr.y + 0.5 && b.x + b.w >= scr.x + scr.width - 0.5 && b.y + b.h >= scr.y + scr.height - 0.5) return undefined
  }
  return target
}
type PointerLike = Pick<PointerEvent, 'target' | 'clientX' | 'clientY' | 'altKey' | 'metaKey'>
function trackHover(e: PointerLike) {
  if (altOn.value !== e.altKey) altOn.value = e.altKey
  const t = e.target as HTMLElement | null
  const scr = t?.closest?.('[data-screen]') as HTMLElement | null
  // 캔버스 위 프레임 이름표에 올리면 그 프레임(화면 이름표와 같아요)
  const lab = t?.closest?.('[data-label-layer]') as HTMLElement | null
  const hscr = scr?.dataset.screen ? props.screens.find((v) => v.id === scr.dataset.screen) : undefined
  // 불리언 안 도형: ⌘ 이거나 안쪽 도형을 고른 상태면 불리언 대신 그 자리의 안쪽 도형에 올린 것으로(누르기와 같아요)
  const hid = hscr ? diveBoolean(hscr, pickLayer(hscr.id, (t!.closest('[data-layer]') as HTMLElement | null)?.dataset.layer, e.metaKey), e.clientX, e.clientY, e.metaKey) : undefined
  const next = lab && canvasDoc.value ? { sid: canvasDoc.value.id, id: lab.dataset.labelLayer! } : scr?.dataset.screen ? { sid: scr.dataset.screen, id: hid ?? null } : null
  if (next?.sid !== hover.value?.sid || next?.id !== hover.value?.id) hover.value = next
  const r = el.value?.getBoundingClientRect()
  ptr.value = r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null
  lastClient = { x: e.clientX, y: e.clientY }
  if (metaHeld.value !== e.metaKey) metaHeld.value = e.metaKey
  updateCmd()
}
/**
 * 스크롤 · 확대로 캔버스가 움직이면 마우스는 그대로여도 그 아래 레이어가 바뀌어요 — 피그마처럼 그 자리를 다시 찾아 호버를 옮겨요.
 * (pointermove 는 마우스가 움직일 때만 와서, 이게 없으면 스크롤 전에 올렸던 레이어에 테두리가 남아요)
 * 화면이 새 배율로 그려진 직후(flush: 'post')에 같은 프레임 안에서 처리해요
 */
watch(() => [vp.value.x, vp.value.y, vp.value.zoom], () => {
  if (drag || !lastClient || !el.value) return
  const t = document.elementFromPoint(lastClient.x, lastClient.y)
  // 마우스가 캔버스 밖(레이어 목록 등)이면 그쪽 호버를 건드리지 않아요
  if (!t || !el.value.contains(t)) return
  trackHover({ target: t, clientX: lastClient.x, clientY: lastClient.y, altKey: altOn.value, metaKey: metaHeld.value })
}, { flush: 'post' })
/** 캔버스 밖으로 나가면 캔버스 호버를 지워요(피그마와 같아요). 끄는 중이면 그대로 */
function leave() {
  if (drag) return
  lastClient = null
  ptr.value = null
  hover.value = null
  cmdMarks.value = null
}

// ---------------------------------------------------------------------------
// ⌘ + 마우스 올림(피그마와 같아요): 포인터 아래 가장 안쪽 요소를 표시.
// 글자는 줄마다 밑줄(기본 파랑, 컴포넌트 안 글자는 보라), 도형 · 컴포넌트 · 그 안쪽 요소는 1px 테두리
// ---------------------------------------------------------------------------
type MarkBox = { left: string; top: string; width: string; height: string; borderRadius?: string; path?: string }
const metaHeld = ref(false)
const cmdMarks = ref<{ lines: MarkBox[]; boxes: MarkBox[]; comp: boolean } | null>(null)
let lastClient: { x: number; y: number } | null = null
/** 컴포넌트 안은 마우스를 받지 않아서(inert) 자리로 가장 안쪽 요소를 찾아요 */
function deepestAt(root: Element | null, x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null
  const walk = (e: Element) => {
    for (const c of e.children) {
      const r = c.getBoundingClientRect()
      if (r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { best = c as HTMLElement; walk(c) }
    }
  }
  if (root) walk(root)
  return best
}
const ownText = (e: Element) => [...e.childNodes].some((n) => n.nodeType === 3 && !!n.textContent?.trim())
let measureCtx: CanvasRenderingContext2D | null = null
/** 글자 줄마다 기준선(baseline)에 밑줄(같은 줄 조각은 하나로). thick: 1(고른 글자) · 2(마우스 올림) — 피그마와 같아요 */
function baselineLines(e: Element, thick: number, hr: DOMRect): MarkBox[] {
  const cs = getComputedStyle(e)
  measureCtx ??= document.createElement('canvas').getContext('2d')
  let asc = 0.8, desc = 0.2
  if (measureCtx) {
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const m = measureCtx.measureText('Hg')
    if (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent > 0) { asc = m.fontBoundingBoxAscent; desc = m.fontBoundingBoxDescent }
  }
  const rg = document.createRange()
  rg.selectNodeContents(e)
  const byLine = new Map<number, { l: number; r: number; base: number }>()
  for (const r of rg.getClientRects()) {
    if (!r.width || !r.height) continue
    const base = r.bottom - desc * (r.height / (asc + desc)) // 글자 칸 높이 = ascent + descent(확대 반영)
    const key = Math.round(base)
    const cur = byLine.get(key)
    byLine.set(key, cur ? { l: Math.min(cur.l, r.left), r: Math.max(cur.r, r.right), base: cur.base } : { l: r.left, r: r.right, base })
  }
  return [...byLine.values()].map((v) => ({ left: v.l - hr.left + 'px', top: v.base - hr.top - thick / 2 + 'px', width: v.r - v.l + 'px', height: thick + 'px' }))
}
function updateCmd() {
  const host = el.value
  if (!metaHeld.value || !lastClient || !host || drag || moving.value || store.editing.value || (tool.value !== 'move' && tool.value !== 'scale')) { cmdMarks.value = null; return }
  const hr = host.getBoundingClientRect()
  const box = (e: Element): MarkBox => {
    const r = e.getBoundingClientRect()
    const k = (e as HTMLElement).offsetWidth ? r.width / (e as HTMLElement).offsetWidth : 1
    const rad = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
    const out: MarkBox = { left: r.left - hr.left + 'px', top: r.top - hr.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: rad ? rad * k + 'px' : undefined }
    // Corner smoothing 레이어: 그 모양(squircle) 그대로 1px
    const lid = (e as HTMLElement).dataset?.layer
    const sid = lid ? (e.closest('[data-screen]') as HTMLElement | null)?.dataset.screen : undefined
    const n = lid && sid ? store.node(sid, lid) : null
    const rv = n ? radiiOf(n.style) : null
    if (n && rv && n.type !== 'ellipse' && (n.style.smoothing ?? 0) > 0 && rv.some(Boolean)) {
      const z = vp.value.zoom
      out.path = squirclePath(r.width, r.height, rv.map((x) => x * z) as [number, number, number, number], n.style.smoothing!, -0.5)
      out.borderRadius = undefined
    }
    return out
  }
  // ⌘ 마우스 올림은 '올린 경우'라 굵은 밑줄(2px)
  const lines = (e: Element): MarkBox[] => baselineLines(e, 2, hr)
  const under = document.elementFromPoint(lastClient.x, lastClient.y) as HTMLElement | null
  const ly = under?.closest('.world [data-layer]') as HTMLElement | null
  if (!ly || ly.classList.contains('lk')) { cmdMarks.value = null; return }
  if (ly.classList.contains('instance')) {
    const deep = deepestAt(ly.querySelector('.inst .box'), lastClient.x, lastClient.y)
    cmdMarks.value = deep && ownText(deep) ? { lines: lines(deep), boxes: [], comp: true } : { lines: [], boxes: [box(deep ?? ly)], comp: true }
    return
  }
  if (ly.classList.contains('text')) { cmdMarks.value = { lines: lines(ly.querySelector('.txt') ?? ly), boxes: [], comp: false }; return }
  // 불리언(Union 등)은 모양 하나로 그려져요 — ⌘ 면 불리언 테두리 대신 그 자리의 안쪽 도형 테두리만(누르면 그 도형이 골라져요)
  const lsid = (ly.closest('[data-screen]') as HTMLElement | null)?.dataset.screen
  const lscr = lsid ? props.screens.find((v) => v.id === lsid) : undefined
  if (lscr && ly.dataset.layer && store.node(lscr.id, ly.dataset.layer)?.type === 'boolean') {
    const inner = diveBoolean(lscr, ly.dataset.layer, lastClient.x, lastClient.y, true)
    if (inner && inner !== ly.dataset.layer) {
      const g = layerGeom(lscr, inner)
      cmdMarks.value = g && !g.angle ? { lines: [], boxes: [rbox(g)], comp: false } : null
      return
    }
  }
  cmdMarks.value = { lines: [], boxes: [box(ly)], comp: false }
}
watch(() => [vp.value.x, vp.value.y, vp.value.zoom], () => { cmdMarks.value = null })
/** 고른 글자 레이어: 줄마다 기준선 밑줄 — 마우스를 안 올리면 얇게(1px), 올리면 굵게(2px) */
const selTextLines = computed<MarkBox[]>(() => {
  void tick.value
  void vp.value
  const s = selScreen.value
  const host = el.value
  if (!s || !host || moving.value || store.editing.value || guides.value) return []
  const hr = host.getBoundingClientRect()
  const out: MarkBox[] = []
  for (const id of store.layerIds.value) {
    if (store.node(s.id, id)?.type !== 'text') continue
    const t = host.querySelector(`.world [data-screen="${s.id}"] [data-layer="${id}"] .txt`)
    if (!t) continue
    const hot = hover.value?.sid === s.id && hover.value?.id === id
    out.push(...baselineLines(t, hot ? 2 : 1, hr))
  }
  return out
})

// ---------------------------------------------------------------------------
// 피그마식 표시: 마우스 올림 테두리 · 고른 레이어의 부모 점선 · 오토 레이아웃 간격
// 모두 바깥 층(화면 좌표)에 그려서 확대 · 축소와 상관없이 늘 1px
// ---------------------------------------------------------------------------
const ptr = ref<{ x: number; y: number } | null>(null)
const hoverOutline = computed(() => {
  void tick.value
  const h = hover.value
  if (!h || marqueeOn.value || draft.value || guides.value || store.editing.value || (tool.value !== 'move' && tool.value !== 'scale')) return null
  const s = props.screens.find((v) => v.id === h.sid)
  if (!s) return null
  if (!h.id) {
    // 화면(프레임): 이미 고른 화면이면 선택 상자가 있으니 생략
    if (isCanvas(s) || (store.screenId.value === s.id && !store.layerIds.value.length) || multi.value.includes(s.id)) return null
    return { frame: s.id, comp: false, style: box(s) }
  }
  if (store.screenId.value === s.id && store.layerIds.value.includes(h.id)) return null
  const n = store.node(s.id, h.id)
  if (!n || n.locked || (!HOVER_BOX_ONLY && OUTLINE_TYPES.has(n.type))) return null
  const g = layerGeom(s, h.id)
  if (!g) return null
  // 어떤 레이어든(둥근 모서리 · 원 · 선 · 벡터 · 글자) 마우스를 올리면 네모 상자 2px — 모양을 따라가지 않아요
  if (HOVER_BOX_ONLY) return { frame: null, comp: n.type === 'instance', style: rbox(g) }
  const z = vp.value.zoom
  const rv = radiiOf(n.style)
  // Corner smoothing 이 있으면 그 모양(squircle) 그대로 2px — 바깥으로 1px 밀어 선 가운데가 모양 밖 1px 에 오게
  const sm = n.type !== 'ellipse' && (n.style.smoothing ?? 0) > 0 && rv.some(Boolean) ? n.style.smoothing! : 0
  if (sm) {
    const path = squirclePath(g.w * z, g.h * z, rv.map((x) => x * z) as [number, number, number, number], sm, -1)
    return { frame: null, comp: n.type === 'instance', path, style: rbox(g) }
  }
  const r = n.type === 'ellipse' ? '50%' : rv.some(Boolean) ? rv.map((x) => x * z + 'px').join(' ') : undefined
  return { frame: null, comp: n.type === 'instance', style: { ...rbox(g), borderRadius: r } }
})
/** 마우스를 올린 것이 일반 글자 레이어면(그룹 · 오토 레이아웃 안이 아니면): 상자 대신 줄마다 기준선 밑줄 2px(피그마와 같아요) */
const hoverTextLines = computed<MarkBox[]>(() => {
  void tick.value
  void vp.value
  const h = hover.value
  const host = el.value
  if (!h?.id || !hoverOutline.value || !host) return []
  const d = store.doc(h.sid)
  const n = d.nodes[h.id]
  if (n?.type !== 'text') return []
  // 그룹 · 오토 레이아웃 안 글자는 상자 그대로, 화면 · 일반 프레임에 바로 놓인 글자만 밑줄(사용자 요청 2026-11-25)
  const p = n.parentId ? d.nodes[n.parentId] : null
  if (p && (isGroupNode(p) || p.style.layout || p.type === 'boolean')) return []
  if (!p && d.frame?.layout) return []
  const t = host.querySelector(`.world [data-screen="${h.sid}"] [data-layer="${h.id}"] .txt`)
  return t ? baselineLines(t, 2, host.getBoundingClientRect()) : []
})
/** 마우스를 올린 오토 레이아웃 프레임의 바로 아래 자식들: 피그마처럼 1px 점선. 일반 프레임 · 화면은 점선 없이 테두리만 */
const hoverKids = computed(() => {
  void tick.value
  const h = hover.value
  const ho = hoverOutline.value
  if (!h || !ho) return []
  const s = props.screens.find((v) => v.id === h.sid)
  if (!s) return []
  const d = store.doc(s.id)
  const hn = h.id ? d.nodes[h.id] : null
  const lay = h.id ? hn?.style.layout : d.frame?.layout
  if (!lay) return []
  const ids = h.id ? (hn && isContainer(hn) ? hn.children ?? [] : []) : d.rootIds
  return ids
    .filter((id) => d.nodes[id] && !d.nodes[id]!.hidden)
    .slice(0, 80)
    .map((id) => layerGeom(s, id))
    .filter((g): g is NonNullable<ReturnType<typeof layerGeom>> => !!g)
    .map((g) => rbox(g))
})
/** 하나 고르면 그 부모가 오토 레이아웃 프레임일 때만 테두리를 점선으로. 일반 프레임 · 그룹 · 화면은 표시 없음 — 피그마와 같아요 */
const parentOutline = computed(() => {
  void tick.value
  const sg = single.value
  const s = selScreen.value
  if (!sg || !s || rotating.value) return null
  const p = store.node(s.id, sg.id)?.parentId
  // 부모가 오토 레이아웃일 때만(자리를 레이아웃이 정하니까) — 일반 프레임 · 그룹은 점선 없음(피그마와 같아요)
  if (!p || !store.node(s.id, p)?.style.layout) return null
  const g = layerGeom(s, p)
  return g ? rbox(g) : null
})
/** 고른 오토 레이아웃 프레임의 간격: 마우스를 간격 위에 올리면 모든 간격을 분홍 빗금으로 */
const gapBands = computed(() => {
  void tick.value
  void vp.value
  const sg = single.value
  const s = selScreen.value
  const host = el.value
  if (!sg || !s || !host || sg.angle || moving.value || guides.value) return []
  const n = store.node(s.id, sg.id)
  const lay = n?.style.layout
  if (!lay || lay.wrap) return []
  const fel = host.querySelector(`[data-screen="${s.id}"] [data-layer="${sg.id}"]`) as HTMLElement | null
  if (!fel) return []
  const hr = host.getBoundingClientRect()
  const rel = (r: DOMRect) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height })
  const f = rel(fel.getBoundingClientRect())
  const d = store.doc(s.id)
  const kids = (n.children ?? [])
    .filter((id) => d.nodes[id] && !d.nodes[id]!.hidden && !d.nodes[id]!.absolute)
    .map((id) => fel.querySelector(`:scope [data-layer="${id}"]`) as HTMLElement | null)
    .filter((k): k is HTMLElement => !!k)
    .map((k) => rel(k.getBoundingClientRect()))
  const v = lay.mode === 'vertical'
  kids.sort((a, b) => (v ? a.y - b.y : a.x - b.x))
  // 간격 빗금은 안쪽 여백을 뺀 내용 폭(높이)만큼 — 양옆 여백 빗금(파랑)과 겹치지 않아야 여백 손잡이를 잡을 수 있어요
  const z = vp.value.zoom
  const [pt, pr, pb, pl] = lay.padding.map((p) => p * z) as [number, number, number, number]
  const ix = f.x + pl, iw = Math.max(0, f.w - pl - pr), iy = f.y + pt, ih = Math.max(0, f.h - pt - pb)
  const out: { left: string; top: string; width: string; height: string; v: boolean }[] = []
  for (let i = 0; i + 1 < kids.length; i++) {
    const a = kids[i]!, b = kids[i + 1]!
    const s0 = v ? a.y + a.h : a.x + a.w, s1 = v ? b.y : b.x
    if (s1 - s0 < 1) continue
    out.push(v
      ? { left: ix + 'px', top: s0 + 'px', width: iw + 'px', height: s1 - s0 + 'px', v }
      : { left: s0 + 'px', top: iy + 'px', width: s1 - s0 + 'px', height: ih + 'px', v })
  }
  return out
})
/** 고른 오토 레이아웃 프레임의 안쪽 여백: 여백 위에 마우스를 올리면 파란 빗금(피그마 padding 표시) */
const padBands = computed(() => {
  void tick.value
  void vp.value
  const sg = single.value
  const s = selScreen.value
  const host = el.value
  if (!sg || !s || !host || sg.angle || moving.value || guides.value) return []
  const lay = store.node(s.id, sg.id)?.style.layout
  if (!lay) return []
  const fel = host.querySelector(`[data-screen="${s.id}"] [data-layer="${sg.id}"]`) as HTMLElement | null
  if (!fel) return []
  const hr = host.getBoundingClientRect()
  const r = fel.getBoundingClientRect()
  const x = r.left - hr.left, y = r.top - hr.top, z = vp.value.zoom
  const [pt, pr, pb, pl] = lay.padding.map((p) => p * z) as [number, number, number, number]
  const out: { left: string; top: string; width: string; height: string; side: number }[] = []
  const add = (side: number, l: number, t: number, w: number, h: number) => { if (w >= 1 && h >= 1) out.push({ left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px', side }) }
  add(0, x, y, r.width, pt)
  add(2, x, y + r.height - pb, r.width, pb)
  add(3, x, y + pt, pl, r.height - pt - pb)
  add(1, x + r.width - pr, y + pt, pr, r.height - pt - pb)
  return out
})
const padHot = computed(() => {
  const p = ptr.value
  return !!p && padBands.value.some((b) => {
    const x = parseFloat(b.left), y = parseFloat(b.top)
    return p.x >= x && p.x <= x + parseFloat(b.width) && p.y >= y && p.y <= y + parseFloat(b.height)
  })
})
const gapHot = computed(() => {
  const p = ptr.value
  return !!p && gapBands.value.some((b) => {
    const x = parseFloat(b.left), y = parseFloat(b.top)
    return p.x >= x && p.x <= x + parseFloat(b.width) && p.y >= y && p.y <= y + parseFloat(b.height)
  })
})
/**
 * 간격 · 안쪽 여백 손잡이(빗금 가운데 '-')를 끌어 값 바꾸기(피그마와 같아요).
 * 여백: ⌥ 는 마주 보는 쪽도 같이, ⇧ 는 네 쪽 모두. 끄는 동안 값 표시, 실행 취소 한 번
 */
const bandDrag = ref<{ kind: 'gap' | 'pad'; value: number; x: number; y: number } | null>(null)
function startBand(e: PointerEvent, kind: 'gap' | 'pad', side = 0) {
  const sg = single.value
  const s = selScreen.value
  const lay = sg && s ? store.node(s.id, sg.id)?.style.layout : undefined
  if (!sg || !s || !lay || e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  const z = vp.value.zoom
  const v = lay.mode === 'vertical'
  const g0 = kind === 'gap' ? (typeof lay.gap === 'number' ? lay.gap : parseFloat(gapBands.value[0]?.[v ? 'height' : 'width'] ?? '0') / z) : lay.padding[side]!
  const sx = e.clientX, sy = e.clientY, sid = s.id, id = sg.id
  const ns = kind === 'gap' ? v : side === 0 || side === 2
  store.hold(sid)
  document.documentElement.classList.add(ns ? 'band-ns' : 'band-ew')
  bandDrag.value = { kind, value: Math.round(g0), x: e.clientX, y: e.clientY }
  const move = (ev: PointerEvent) => {
    const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z
    const d = kind === 'gap' ? (v ? dy : dx) : side === 0 ? dy : side === 2 ? -dy : side === 3 ? dx : -dx
    const val = Math.max(0, Math.round(g0 + d))
    store.update(sid, [id], (n) => {
      const L = n.style.layout!
      if (kind === 'gap') return { style: { ...n.style, layout: { ...L, gap: val } } }
      const p = [...L.padding] as [number, number, number, number]
      if (ev.shiftKey) p.fill(val)
      else { p[side] = val; if (ev.altKey) p[(side + 2) % 4] = val }
      return { style: { ...n.style, layout: { ...L, padding: p } } }
    })
    bandDrag.value = { kind, value: val, x: ev.clientX, y: ev.clientY }
  }
  const up = () => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    document.documentElement.classList.remove('band-ns', 'band-ew')
    store.release(sid)
    bandDrag.value = null
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
}
const bandLabel = computed(() => {
  const b = bandDrag.value
  const r = el.value?.getBoundingClientRect()
  return b && r ? { left: b.x - r.left + 'px', top: b.y - r.top - 18 + 'px' } : null
})
/** ⌥ 를 누른 채 옮기거나 크기를 바꾸는 동안 잴 상대(피그마와 같아요): 포인터 아래 고르지 않은 레이어, 없으면 고른 것의 부모(프레임) */
const dragHover = ref<{ sid: string; id: string | null } | null>(null)
function dragTarget(e: PointerEvent, sid: string): { sid: string; id: string | null } {
  const d = store.doc(sid)
  const sel = store.layerIds.value
  const mine = (id: string) => sel.some((k) => k === id || descendants(d, k).includes(id))
  for (const node of document.elementsFromPoint(e.clientX, e.clientY)) {
    const lay = (node as HTMLElement).closest?.('[data-layer]') as HTMLElement | null
    const scr = lay?.closest('[data-screen]') as HTMLElement | null
    const id = lay?.dataset.layer
    if (id && scr?.dataset.screen === sid && d.nodes[id] && !mine(id)) return { sid, id }
  }
  const parent = sel.length ? d.nodes[sel[0]!]?.parentId ?? null : null
  return { sid, id: parent }
}
const measure = computed<Guides | null>(() => {
  void tick.value
  const s = selScreen.value
  const h = dragHover.value ?? hover.value
  if (!altOn.value || !h || (guides.value && !dragHover.value) || !s || store.editing.value) return null
  const hs = props.screens.find((v) => v.id === h.sid)
  if (!hs) return null
  // 고른 것: 레이어들, 없으면 고른 화면(프레임)들 — 프레임끼리 · 캔버스 위에서도 재요
  const sel = store.layerIds.value.length
    ? store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    : isCanvas(s) ? [] : (multi.value.length ? multiBoxes.value : [s]).map(rectOf)
  if (!sel.length) return null
  // 화면만 골랐을 때 그 화면 자신(이나 그 안)을 가리키면 잴 것이 없어요
  if (!store.layerIds.value.length && (multi.value.length ? multi.value.includes(hs.id) : hs.id === s.id) && !h.id) return null
  let id = h.id
  // 고른 레이어(나 그 안)를 가리키면 부모와 견줘요
  if (id && hs.id === s.id) {
    const d = store.doc(s.id)
    const own = store.layerIds.value.find((k) => descendants(d, k).includes(id!))
    if (own) id = d.nodes[own]?.parentId ?? null
  }
  // 화면(프레임)을 골랐으면 다른 화면은 화면째로 재요(피그마와 같아요). 안쪽 레이어는 화면을 고르지 않았을 때만
  if (!store.layerIds.value.length && !isCanvas(hs)) id = null
  let target = id ? layerWorld(hs, id) : isCanvas(hs) ? null : rectOf(hs)
  // 화면 밖으로 넘쳐 잘린 부분은 빼고 보이는 만큼만
  if (target && id && !isCanvas(hs)) {
    const f = rectOf(hs)
    const x0 = Math.max(target.x, f.x), y0 = Math.max(target.y, f.y), x1 = Math.min(target.x + target.w, f.x + f.w), y1 = Math.min(target.y + target.h, f.y + f.h)
    target = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
  }
  return target ? measureGuides(union(sel), target) : null
})
// ⌥ 를 누른 채 끄는 중이면 붙는 선 대신 간격 재기를 보여요
const shown = computed(() => (dragHover.value && measure.value ? measure.value : guides.value ?? measure.value))
const sx = (v: number) => v * vp.value.zoom + vp.value.x
/** 1px 선을 화면 픽셀에 딱 맞게(자 가이드 선과 같은 굵기 · 진하기 — 반 픽셀에 걸쳐 두껍게 번지지 않게) */
const crisp = (v: number) => { const d = import.meta.client ? window.devicePixelRatio || 1 : 1; return Math.round(d) % 2 === 0 ? Math.round(v * d) / d : (Math.floor(v * d) + 0.5) / d }
const sy = (v: number) => v * vp.value.zoom + vp.value.y
/** 간격 표시 양 끝 눈금 */
function ticks(l: { x1: number; y1: number; x2: number; y2: number }) {
  const horiz = Math.abs(l.y1 - l.y2) < Math.abs(l.x1 - l.x2)
  const k = 3
  return [[l.x1, l.y1], [l.x2, l.y2]].map(([x, y]) => (horiz ? { x1: sx(x!), y1: sy(y!) - k, x2: sx(x!), y2: sy(y!) + k } : { x1: sx(x!) - k, y1: sy(y!), x2: sx(x!) + k, y2: sy(y!) }))
}
/** 캔버스 배경: 단색. 배경색은 페이지 설정(오른쪽 패널, 아무것도 안 골랐을 때)에서 바꿔요 */
const gridStyle = computed(() => (props.background ? { backgroundColor: props.background } : {}))
/**
 * 픽셀 격자(피그마와 같아요): 400% 부터 서서히 나타나 800% 에서 다 보여요. 캔버스 · 화면 · 레이어 모두 위에 1px 선.
 * 선은 흰색을 difference 로 섞어서 밝은 바탕에선 살짝 어둡게, 어두운 바탕에선 살짝 밝게 — 어떤 배경 · 내용 위에서도 은은하게 보여요.
 */
const PX_FROM = 4, PX_FULL = 8
/** 격자가 보이는 정도: 400% 에서 0 → 800% 에서 1 (꺼져 있거나 400% 미만이면 0) */
// 픽셀에 맞추기(Snap to pixel grid ⇧⌘', 피그마와 같아요): 격자 보이기(Pixel grid)와 따로 — 끄면 소수점 이동 · 크기
watch(() => props.snapPixel, (v) => { store.pixelSnap.value = v !== false }, { immediate: true })
const pxAlpha = computed(() => (props.pixelGrid === false ? 0 : Math.max(0, Math.min(1, (vp.value.zoom - PX_FROM) / (PX_FULL - PX_FROM)))))
/**
 * 픽셀 격자는 <canvas> 에 직접 그려요: 선마다 기기 픽셀 1칸에 딱 맞춰서(피그마와 같아요) — 배율이 딱 떨어지지 않아도 선 진하기가 고르게.
 * 두 장: 흰 선(difference) · 중간 회색 선(보통). 아래 CSS 주석 참고
 */
const pxDif = ref<HTMLCanvasElement | null>(null)
const pxMid = ref<HTMLCanvasElement | null>(null)
let pxRaf = 0
function drawPx() {
  pxRaf = 0
  const host = el.value
  const cvs = [pxDif.value, pxMid.value]
  if (!host || cvs.some((c) => !c)) return
  const dpr = window.devicePixelRatio || 1
  const W = Math.round(host.clientWidth * dpr), H = Math.round(host.clientHeight * dpr)
  const { x, y, zoom: z } = vp.value
  const colors = ['rgb(255 255 255 / 5%)', 'rgb(128 128 128 / 6%)']
  cvs.forEach((c, k) => {
    if (c!.width !== W || c!.height !== H) { c!.width = W; c!.height = H }
    const g = c!.getContext('2d')!
    g.clearRect(0, 0, W, H)
    g.fillStyle = colors[k]!
    // 화면에 보이는 캔버스 정수 좌표마다 세로 · 가로 선 1 기기 픽셀
    const x0 = Math.ceil(-x / z), x1 = Math.floor((host.clientWidth - x) / z)
    for (let i = x0; i <= x1; i++) g.fillRect(Math.round((x + i * z) * dpr), 0, 1, H)
    const y0 = Math.ceil(-y / z), y1 = Math.floor((host.clientHeight - y) / z)
    for (let i = y0; i <= y1; i++) g.fillRect(0, Math.round((y + i * z) * dpr), W, 1)
  })
}
const pxOn = computed(() => pxAlpha.value > 0)
watch([() => vp.value.x, () => vp.value.y, () => vp.value.zoom, pxOn], () => { if (pxOn.value && !pxRaf) pxRaf = requestAnimationFrame(() => nextTick(drawPx)) }, { immediate: true })
const onPxResize = () => { if (pxOn.value && !pxRaf) pxRaf = requestAnimationFrame(drawPx) }
onMounted(() => window.addEventListener('resize', onPxResize))
onBeforeUnmount(() => { window.removeEventListener('resize', onPxResize); if (pxRaf) cancelAnimationFrame(pxRaf) })
/** 확대 · 이동 중인지: 멈춘 뒤 160ms 가 지나면 false → 브라우저가 지금 배율로 다시 그려 흐림이 없어요 */
const moving = ref(false)
/**
 * 확대 · 축소 중인지. 이때는 캔버스를 그림 한 장으로 키우지 않고(will-change 끔) 매 프레임 지금 배율로 다시 그려요 —
 * 그림으로 키우면 글자 · 선이 흐려졌다가 멈출 때 '툭' 선명해져요(피그마는 확대 중에도 선명). 옮기기만 할 때는 배율이 같아 흐림이 없으니 그림으로 빠르게
 */
const zooming = ref(false)
let movingTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [vp.value.x, vp.value.y, vp.value.zoom] as const, (now, before) => {
  moving.value = true
  if (now[2] !== before?.[2]) zooming.value = true
  clearTimeout(movingTimer)
  movingTimer = setTimeout(() => { moving.value = false; zooming.value = false }, 160)
})
/** 크기 숫자: 정수면 그대로, 아니면 소수 한 자리(피그마와 같아요) */
// 크기 · 각도 표시: 피그마처럼 정수로(실제 크기는 소수 그대로) — app/canvas/num.ts
const fmt = fmtNum
/** 크기 표시 옆 크기 방식: 피그마처럼 "120 Hug × 40 Fill". 고정이면 비워요(인스펙터 W · H ▾ 와 같은 규칙) */
const singleModes = computed(() => {
  const sid = store.screenId.value
  const id = store.layerIds.value.length === 1 ? store.layerIds.value[0] : null
  const n = sid && id ? store.node(sid, id) : null
  if (!n) return { w: '', h: '' }
  const label = (v?: string) => (v === 'hug' ? tr('Hug') : v === 'fill' ? tr('Fill') : '')
  const text = n.type === 'text'
  return { w: label(n.sizeH ?? (text && n.style.autoWidth ? 'hug' : undefined)), h: label(n.sizeV ?? (text ? 'hug' : undefined)) }
})
// 파일 끌어 놓기(이미지 · SVG)
function onDragOver(e: DragEvent) { if (e.dataTransfer) e.dataTransfer.dropEffect = [...e.dataTransfer.types].some((t) => t === 'Files' || t === DS_DRAG) ? 'copy' : 'none' }
function onDrop(e: DragEvent) {
  dropAt.value = null
  // 디자인 시스템 컴포넌트 끌어 놓기 → 인스턴스(놓은 자리, Iris 화면 위면 그 안 · 가장 안쪽 프레임으로)
  const comp = e.dataTransfer?.getData(DS_DRAG)
  const w = toWorld(e.clientX, e.clientY)
  if (comp) { insertInstance(comp, w); if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT)); return }
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!files.length) return
  if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT))
  const t = dropTarget(w.x, w.y)
  emit('drop-files', files, w, t ? { sid: t.sid, parentId: t.parentId } : undefined)
}
/**
 * 이미지 · 영상 파일을 놓을 곳(피그마와 같아요): 포인터 아래 Iris 화면 → 그 안 가장 안쪽 프레임, 화면 밖이면 캔버스 위 프레임 · 캔버스.
 * 피그마에서 가져온 화면 위는 넣을 수 없어서 캔버스 위로
 */
function dropTarget(wx: number, wy: number) {
  const scr = screenUnder(wx, wy)
  const target = scr ?? canvasDoc.value
  if (!target) return null
  const lx = scr ? wx - scr.x : wx, ly = scr ? wy - scr.y : wy
  const parentId = frameAt(target.id, lx, ly)
  return { sid: target.id, screen: scr, parentId }
}
/** 파일을 끌고 있는 동안 놓일 자리(화면 · 프레임) 테두리 */
const dropAt = ref<Rect | null>(null)
/** 레이어를 끌 때는 테두리만(파일 끌어 놓기는 옅은 바탕까지) */
const dropLine = ref(false)
function setDropLine(r: Rect | null) {
  dropLine.value = !!r
  if (r?.x !== dropAt.value?.x || r?.y !== dropAt.value?.y || r?.w !== dropAt.value?.w || r?.h !== dropAt.value?.h) dropAt.value = r
}
function onFileDragOver(e: DragEvent) {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
  const w = toWorld(e.clientX, e.clientY)
  const t = dropTarget(w.x, w.y)
  const sc = t ? props.screens.find((v) => v.id === t.sid) : null
  const r = t && sc ? (t.parentId ? layerWorld(sc, t.parentId) : t.screen ? rectOf(t.screen) : null) : null
  if (r?.x !== dropAt.value?.x || r?.y !== dropAt.value?.y || r?.w !== dropAt.value?.w || r?.h !== dropAt.value?.h) dropAt.value = r ?? null
}
function onDragLeave(e: DragEvent) { if (!e.relatedTarget || !el.value?.contains(e.relatedTarget as Node)) dropAt.value = null }
const FULL_WIDTH = new Set(['BottomSheet', 'BottomBar', 'TopBar', 'NavBarTop', 'ListCommon', 'TextInput', 'TextArea', 'SearchField', 'ButtonGroup', 'Tab', 'SegmentedControl', 'NoticeBox', 'Divider', 'Footer', 'StatusBar', 'InputBar', 'ListSelect', 'ListSort', 'FileRow', 'MapBottomBar', 'MapBottomGuide', 'PostComment', 'PostReply'])
/** 디자인 시스템 컴포넌트 인스턴스 넣기(캔버스 좌표). at 이 없으면 보이는 캔버스 가운데 */
function insertInstance(component: string, at?: { x: number; y: number }) {
  const c = at ?? toWorld(window.innerWidth / 2, window.innerHeight / 2)
  const scr = screenUnder(c.x, c.y)
  const target = scr ?? canvasDoc.value
  if (!target) return
  const lx = scr ? c.x - scr.x : c.x, ly = scr ? c.y - scr.y : c.y
  const parentId = frameAt(target.id, lx, ly)
  const p = parentId ? store.absPos(target.id, parentId) : { x: 0, y: 0 }
  // 화면 폭을 채우는 컴포넌트는 부모(없으면 화면) 폭에 맞춰 고정 폭으로
  const full = !STORY_SIZE[component] && FULL_WIDTH.has(component)
  const pw = parentId ? store.node(target.id, parentId)?.w : scr ? scr.width : 375
  // 스토리북 기준 크기(InstanceView STORY_SIZE): 고정 폭(높이까지 정해진 것은 높이도) · 나머지는 Hug. 목록에 없으면 예전처럼(화면 폭 채우기 · Hug)
  const fixed = INSERT_SIZE[component]
  // 가운데에 여러 번 넣으면 조금씩 비켜서
  const nudge = at ? 0 : (Object.values(store.doc(target.id).nodes).filter((n) => n.type === 'instance').length % 8) * 16
  const w0 = fixed ? fixed.w : full ? pw ?? 375 : 120, h0 = fixed?.h ?? 48
  // 끌어 놓기(at): 놓은 자리가 가운데(사용자 요청 — 왼쪽 위가 아니라). 부모 안 좌표
  const cx = lx - p.x, cy = ly - p.y
  const sid = target.id
  const id = store.add(sid, parentId, { type: 'instance', name: component, component, props: {}, x: full ? 0 : Math.round(at ? cx - w0 / 2 : cx + nudge), y: Math.round(at ? cy - h0 / 2 : cy + nudge), w: w0, h: h0, sizeH: full || fixed ? undefined : 'hug', sizeV: fixed?.h ? undefined : 'hug' })
  // 내용 크기(Hug)는 그려진 뒤 정해져요 — 크기가 정해지면 다시 가운데로(기록 없이 자리만, 잠깐 동안만 지켜봐요)
  if (at) {
    const stop = watch(() => { const n = store.node(sid, id); return n ? `${n.w}x${n.h}` : '' }, () => {
      const n = store.node(sid, id)
      if (!n) return
      if (!full) n.x = Math.round(cx - n.w / 2)
      n.y = Math.round(cy - n.h / 2)
    })
    setTimeout(stop, 1500)
  }
  tool.value = 'move'
}
/** 화면(프레임) 자체의 모양: 채우기 · 선(안쪽) · 모서리 · 투명도 · 내용 자르기 */
const frameImg = useImageSrc()
/** 레이어 목록의 인스턴스 하위 줄에 올렸을 때: 그 부분을 캔버스에서 보라 테두리로(피그마와 같아요) */
const subBox = computed(() => {
  void vp.value
  const t = subHover.value
  if (!t || !t.isConnected || !el.value) return null
  const r = t.getBoundingClientRect(), c = el.value.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { left: r.left - c.left + 'px', top: r.top - c.top + 'px', width: r.width + 'px', height: r.height + 'px' }
})
/** 이미지 자르기 화면: 자르는 레이어 자리(레이어 안 좌표 → 캔버스 화면 좌표) */
const imgEdit = useImageEdit()
const cropView = computed(() => {
  void tick.value
  void vp.value
  const e = imgEdit.value
  const s = e ? props.screens.find((v) => v.id === e.sid) : undefined
  const n = e && s ? store.node(e.sid, e.id) : undefined
  if (!e || !s || !n) return null
  const m = worldMat(s, e.id), z = vp.value.zoom
  return { e, n, mat: { a: m.a * z, b: m.b * z, c: m.c * z, d: m.d * z, e: m.e * z + vp.value.x, f: m.f * z + vp.value.y } }
})
/** 화면 바로 아래 마스크(하나만 골라 Use as mask): 그 위 레이어들을 마스크 모양으로 가려요(LayerView 의 프레임 안 마스크와 같아요) */
function rootMask(sid: string) {
  const d = store.doc(sid)
  const i = d.rootIds.findIndex((c) => d.nodes[c]?.isMask && !d.nodes[c]?.hidden)
  if (i < 0) return null
  const m = d.nodes[d.rootIds[i]!]!
  return { below: d.rootIds.slice(0, i), mask: m.id, above: d.rootIds.slice(i + 1), clip: `path(${m.evenodd ? 'evenodd, ' : ''}'${nodePathIn(d, m, 0, 0)}')` }
}
// 점 편집(Edit object): 오른쪽 패널 머리 버튼에서
const editReq = useState<{ sid: string; id: string; t: number } | null>('iris-edit-object', () => null)
watch(editReq, (r) => { if (r) { enterVectorEdit(r.sid, r.id); editReq.value = null } })
const frameLook = (s: ScreenRow) => (s.source === 'native' ? frameCss(store.doc(s.id).frame, store.color, frameImg, s.width, s.height) : {})
/** Corner smoothing 화면: 바탕 · 그림자 · 선을 squircle 모양으로 그리는 층 */
const frameDash = (s: ScreenRow) => (s.source === 'native' ? frameDashStroke(store.doc(s.id).frame, s.width, s.height, store.color) : null)
const frameSm = (s: ScreenRow) => (s.source === 'native' ? frameSmoothLayers(store.doc(s.id).frame, s.width, s.height, store.color, frameImg) : null)
const marqueeOn = ref(false)
const cursor = computed(() => (panning.value ? 'grabbing' : space.value || tool.value === 'hand' ? 'grab' : tool.value === 'move' || tool.value === 'scale' ? 'default' : tool.value === 'text' ? 'text' : 'crosshair'))
</script>

<template>
  <main
    ref="el"
    :aria-label="tr('Canvas')"
    class="canvas canvas-dots"
    :style="{ cursor, ...gridStyle }"
    @pointerdown.self="start($event)"
    @pointermove="move"
    @pointerleave="leave"
    @pointerup="end"
    @pointercancel="end"
    @dragover.prevent="onDragOver($event); onFileDragOver($event)"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @contextmenu="onContext"
    @dblclick="onDblAny"
  >
    <div class="world" :class="{ moving: moving && !zooming }" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }">
      <!-- 캔버스 위 섹션: 화면들 아래에 깔아요(피그마처럼 화면을 묶는 바탕) -->
      <div v-if="canvasDoc && canvasRoots.under.length" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)">
        <LayerView v-for="id in canvasRoots.under" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
      <div
        v-for="s in realScreens"
        :key="s.id"
        class="frame"
        role="button"
        tabindex="-1"
        :data-screen="s.id"
        :style="{ left: s.x + 'px', top: s.y + 'px', width: s.width + 'px', height: s.height + 'px', cursor: space || panning ? 'inherit' : cursor, ...frameLook(s), transform: scrTf(s) }"
        :aria-label="tr('{name} frame', { name: s.name })"
        @pointerdown.stop="start($event, s)"
      >
        <img v-if="s.thumbnail_path && s.source === 'figma'" :src="s.thumbnail_path" alt="" draggable="false" class="thumb">
        <template v-else>
          <template v-for="sm in [frameSm(s)]" :key="'fsm'"><i v-if="sm" class="fsmw"><i class="fsmb" :style="sm.bg" /></i></template>
          <template v-for="rm in [rootMask(s.id)]" :key="'rm'">
            <template v-if="rm">
              <LayerView v-for="id in rm.below" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
              <!-- 마스크 자체는 그리지 않아요(프레임 안 마스크와 같아요) -->
              <div class="rmask" :style="{ clipPath: rm.clip }"><LayerView v-for="id in rm.above" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" /></div>
            </template>
            <LayerView v-for="id in rm ? [] : store.doc(s.id).rootIds" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
          </template>
          <GridOverlay v-if="store.doc(s.id).frame?.grids" :grids="store.doc(s.id).frame?.grids" :w="s.width" :h="s.height" />
          <!-- 화면 스트로크(안쪽): 자식 레이어 위에 — 피그마처럼 안에 든 레이어가 테두리를 덮지 않아요 -->
          <i v-if="s.source === 'native' && frameStroke(store.doc(s.id).frame, store.color, s.width, s.height)" class="frame-stk" :style="{ boxShadow: frameStroke(store.doc(s.id).frame, store.color, s.width, s.height) }" />
          <template v-for="sk in [frameSm(s)?.stroke ?? frameDash(s)]" :key="'fsk'"><svg v-if="sk" class="frame-sqk" :width="s.width" :height="s.height" overflow="visible" aria-hidden="true"><path v-for="(c, i) in sk.colors" :key="i" :d="sk.d" fill="none" :stroke="c" :stroke-width="sk.w" :stroke-dasharray="sk.dash" :stroke-linecap="sk.cap" /></svg></template>
        </template>
      </div>
      <!-- 캔버스 위(화면 밖) 레이어: 화면들 위에 그려요 -->
      <div v-if="canvasDoc" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)">
        <LayerView v-for="id in canvasRoots.over" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
      <!-- 화면 밖으로 끄는 레이어: 맨 위에. 다른 화면 위면 그 화면 모양대로 잘라서(놓은 뒤와 같게) -->
      <div
        v-if="ghost"
        class="ghost"
        :class="{ clipped: !!ghost.clip }"
        :style="ghost.clip ? { left: ghost.clip.x + 'px', top: ghost.clip.y + 'px', width: ghost.clip.w + 'px', height: ghost.clip.h + 'px', borderRadius: ghost.clip.r } : { left: ghost.x + 'px', top: ghost.y + 'px' }"
      >
        <div v-for="g in ghost.items" :key="g.id" class="ghost-at" :style="{ left: g.x + (ghost.clip ? ghost.x - ghost.clip.x : 0) + 'px', top: g.y + (ghost.clip ? ghost.y - ghost.clip.y : 0) + 'px' }">
          <LayerView :doc="store.doc(ghost.sid)" :id="g.id" :screen-id="ghost.sid" ghost />
        </div>
      </div>
      <!-- 파일 끌어 놓을 자리 -->
      <div v-if="dropAt" class="drop-at" :class="{ line: dropLine }" :style="{ '--z': vp.zoom, left: dropAt.x + 'px', top: dropAt.y + 'px', width: dropAt.w + 'px', height: dropAt.h + 'px' }" />
 <div v-if="draft && !marqueeOn" :class="['draft', { shape: !!draftShape }]" :style="{ left: draft.x + 'px', top: draft.y + 'px', width: draft.width + 'px', height: draft.height + 'px' }">
        <!-- 도형은 그리는 동안에도 그 모양 · 기본 칠 그대로 -->
        <svg v-if="draftShape" class="draft-svg" :width="draft.width" :height="draft.height" aria-hidden="true"><path :d="draftShape.d" :fill="draftShape.fill" /></svg>
      </div>
    </div>

    <template v-if="pxOn"><canvas ref="pxDif" class="pxgrid dif" :style="{ opacity: pxAlpha }" aria-hidden="true" /><canvas ref="pxMid" class="pxgrid mid" :style="{ opacity: pxAlpha }" aria-hidden="true" /></template>
    <div class="overlay" aria-hidden="true">
      <span
        v-for="f in frameLabels"
        :key="'fl' + f.id"
        class="label"
        :data-label-layer="f.id"
        :class="{ on: canvasDoc && ((store.screenId.value === canvasDoc.id && store.layerIds.value.includes(f.id)) || (hover?.sid === canvasDoc.id && hover?.id === f.id)) }"
        :style="{ left: f.box.left, top: `calc(${f.box.top} - 20px)`, maxWidth: f.box.width }"
        @pointerdown.stop="pickFrameLabel(f.id)"
        @dblclick.stop="renamingFrame = f.id"
      >
        <input
          v-if="renamingFrame === f.id"
          v-select-all
          class="label-in"
          :value="f.name"
          :aria-label="tr('Frame name')"
          spellcheck="false"
          @pointerdown.stop
          @dblclick.stop
          @keydown.stop="($event.key === 'Enter' && ($event.target as HTMLInputElement).blur()) || ($event.key === 'Escape' && (renamingFrame = null))"
          @blur="commitFrameName(f.id, $event)"
        >
        <template v-else>{{ f.name }}</template>
      </span>
      <span
        v-for="s in realScreens"
        :key="'l' + s.id"
        class="label"
        :data-screen="s.id"
        :class="{ on: (store.screenId.value === s.id && !store.layerIds.value.length) || hoverOutline?.frame === s.id }"
        :style="{ ...labelPos(s), maxWidth: s.source === 'figma' ? `calc(${box(s).width} - ${figTagW(s)}px)` : box(s).width }"
        @pointerdown.stop="tool = 'move'; start($event, s)"
      >
        <input
          v-if="renamingScreen === s.id"
          v-select-all
          class="label-in"
          :value="s.name"
          :aria-label="tr('Frame name')"
          spellcheck="false"
          @pointerdown.stop
          @dblclick.stop
          @keydown.stop="($event.key === 'Enter' && ($event.target as HTMLInputElement).blur()) || ($event.key === 'Escape' && (renamingScreen = null))"
          @blur="commitScreenName(s.id, $event)"
        >
        <!-- 프로젝트 썸네일로 정한 프레임: 이름 앞에 네모 아이콘 -->
        <template v-else><svg v-if="coverId === s.id" class="lb-ic" width="12" height="12" viewBox="0 0 12 12" role="img" :aria-label="tr('Project thumbnail')" :data-tip="tr('Project thumbnail')"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>{{ s.name }}</template>
      </span>
      <!-- 피그마 연결 화면: 이름 줄 오른쪽 끝에 표시. 누르면 피그마에서 그 프레임 열기(편집은 피그마에서) -->
      <component
        :is="s.figma_url ? 'a' : 'span'"
        v-for="s in realScreens.filter((v) => v.source === 'figma' && figTagW(v))"
        :key="'f' + s.id"
        class="fig-tag"
        :href="s.figma_url || undefined"
        :target="s.figma_url ? '_blank' : undefined"
        :rel="s.figma_url ? 'noopener noreferrer' : undefined"
        tabindex="-1"
        :title="s.figma_url ? tr('Linked from Figma · Open in Figma') : tr('Linked from Figma')"
        :style="{ left: `calc(${box(s).left} + ${box(s).width})`, top: `calc(${box(s).top} - 20px)` }"
        @pointerdown.stop
      >
        <!-- 피그마 표시 7 × 10.5(로고 비율 2:3) --><svg width="7" height="10.5" viewBox="0 0 38 57" aria-hidden="true"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE" /><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83" /><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262" /><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E" /><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF" /></svg>
      </component>
      <div v-if="parentOutline" class="parent" :style="parentOutline" />
      <template v-if="gapHot || bandDrag?.kind === 'gap'"><div v-for="(b, i) in gapBands" :key="'gap' + i" class="gap" :class="{ v: b.v }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height }"><i :style="{ cursor: b.v ? 'ns-resize' : 'ew-resize' }" @pointerdown="startBand($event, 'gap')" /></div></template>
      <template v-else-if="padHot || bandDrag?.kind === 'pad'"><div v-for="(b, i) in padBands" :key="'pad' + i" class="pad" :class="{ v: b.side === 0 || b.side === 2 }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height }"><i :style="{ cursor: b.side === 0 || b.side === 2 ? 'ns-resize' : 'ew-resize' }" @pointerdown="startBand($event, 'pad', b.side)" /></div></template>
      <span v-if="radLabel && radDrag" class="sq size rlabel" :style="radLabel">{{ tr('Radius {n}', { n: radDrag.v }) }}</span>
      <span v-if="bandLabel && bandDrag" class="sq glabel" :class="{ gapl: bandDrag.kind === 'gap' }" :style="bandLabel">{{ bandDrag.value }}</span>
      <template v-if="hoverOutline && !gapHot && !padHot && !cmdMarks"><div v-for="(k, i) in hoverKids" :key="'hk' + i" class="kid" :style="k" /></template>
      <template v-if="hoverTextLines.length && !gapHot && !padHot && !cmdMarks"><div v-for="(l, i) in hoverTextLines" :key="'ht' + i" class="cmd-ul" :style="l" /></template>
      <div v-else-if="hoverOutline && !gapHot && !padHot && !cmdMarks" class="hover-ol" :class="{ comp: hoverOutline.comp, shaped: 'path' in hoverOutline }" :style="hoverOutline.style"><svg v-if="'path' in hoverOutline" class="shape-line" aria-hidden="true"><path :d="hoverOutline.path" stroke-width="2" /></svg></div>
      <!-- 고른 글자: 기준선 밑줄(마우스 올리면 굵게) -->
      <template v-if="!cmdMarks"><div v-for="(l, i) in selTextLines" :key="'st' + i" class="cmd-ul" :style="l" /></template>
      <!-- ⌘ + 마우스 올림: 글자 밑줄 · 요소 테두리(컴포넌트 안은 보라) -->
      <template v-if="cmdMarks">
        <div v-for="(b, i) in cmdMarks.boxes" :key="'cb' + i" class="cmd-box" :class="{ comp: cmdMarks.comp, shaped: !!b.path }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height, borderRadius: b.borderRadius }"><svg v-if="b.path" class="shape-line" aria-hidden="true"><path :d="b.path" stroke-width="1" /></svg></div>
        <div v-for="(l, i) in cmdMarks.lines" :key="'cl' + i" class="cmd-ul" :class="{ comp: cmdMarks.comp }" :style="l" />
      </template>
      <div v-for="(b, i) in peekBoxes" :key="'pk' + i" class="peek" :style="b"><span class="peek-tag num">{{ peek?.label }}</span></div>
      <div v-for="id in highlight ?? []" :key="'h' + id" class="hl" :style="screens.find((s) => s.id === id) ? box(screens.find((s) => s.id === id)!) : { display: 'none' }" />
      <div v-for="m in multiBoxes" :key="'m' + m.id" class="sel" :style="box(m)" />
      <div v-if="selFrame && !multi.length && !selBoxes.length" class="sel" :style="{ ...box(selFrame), transform: scrRot(selFrame) ? `rotate(${scrRot(selFrame)}deg)` : undefined }">
        <template v-if="!selBoxes.length">
          <!-- 모서리 바깥: 돌리기(레이어와 같아요 — ⇧ 15° 씩) -->
          <span v-for="c in CORNERS" :key="'r' + c" :class="['rot', 'at-' + c]" :style="{ cursor: rotCursor(c, scrRot(selFrame)) }" @pointerdown.stop.prevent="startScreenRotate($event)" />
          <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startScreenResize($event, h)" />
          <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" @pointerdown.stop.prevent="startScreenResize($event, c)" />
          <span v-if="!scrRot(selFrame)" class="sq size">{{ rotating ? fmt(scrRot(selFrame)) + '°' : `${fmt(selFrame.width)} × ${fmt(selFrame.height)}` }}</span>
          <span v-for="h in screenRad ?? []" :key="'srh' + h.c" class="rh" :style="{ left: h.x + 'px', top: h.y + 'px' }" :title="tr('Corner radius (⌥ one corner)')" @pointerdown.stop.prevent="startScreenRadius($event, h.c)" />
        </template>
      </div>
      <!-- 돌린 화면의 크기 · 각도 표시: 아래에 오는 변 가운데 아래, 각도를 따라 기울되 거꾸로 서지 않게(피그마와 같아요) -->
      <span v-if="selFrame && !multi.length && !selBoxes.length && scrRot(selFrame)" class="sq size below" :style="frameTags(selFrame)!.size">{{ rotating ? fmt(scrRot(selFrame)) + '°' : `${fmt(selFrame.width)} × ${fmt(selFrame.height)}` }}</span>
      <!-- 점 편집 중에는 선택 상자 · 크기를 감춰요(피그마와 같아요 — 점 · 선만) -->
      <div v-for="b in vedit ? [] : selBoxes" :key="'s' + b.id" class="sel" :class="{ comp: compIds.has(b.id) }" :style="rbox(b)" />
      <div v-for="b in vedit ? [] : xBoxes" :key="'x' + b.id" class="sel" :style="rbox(b)" />
      <!-- 오토 레이아웃 간격 · 여백 표시(오른쪽 패널 칸에 올렸을 때) -->
      <div v-for="a in alZones" :key="'al' + a.key" class="al-hint" :style="rbox(a.g)" aria-hidden="true">
        <span v-for="(z, k) in a.zones" :key="k" class="al-zone" :style="{ left: z.x * vp.zoom + 'px', top: z.y * vp.zoom + 'px', width: z.w * vp.zoom + 'px', height: z.h * vp.zoom + 'px' }" />
      </div>
      <!-- 여러 개 고름: 전체를 감싸는 상자(손잡이로 함께 크기 바꾸기) + 크기 -->
      <div v-if="xAllWorld && !multi.length && !vedit" class="sel group" :style="box({ x: xAllWorld.x, y: xAllWorld.y, width: xAllWorld.w, height: xAllWorld.h })"><span class="sq size">{{ fmt(xAllWorld.w) }} × {{ fmt(xAllWorld.h) }}</span></div>
      <div v-else-if="selBoxes.length > 1 && selWorld && !multi.length && !vedit" class="sel group" :class="{ comp: selComp }" :style="box({ x: selWorld.x, y: selWorld.y, width: selWorld.w, height: selWorld.h })">
        <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startResizeMany($event, h)" />
        <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, 0) }" @pointerdown.stop.prevent="startResizeMany($event, c)" />
        <span class="sq size">{{ fmt(selWorld.w) }} × {{ fmt(selWorld.h) }}</span>
      </div>
      <!-- 점 편집 중에는 상자 · 손잡이 · 크기 표시를 숨겨요(피그마와 같아요) -->
      <div v-if="subBox" class="hover-ol comp" :style="subBox" />
      <ImageCropOverlay v-if="cropView" :edit="cropView.e" :node="cropView.n" :mat="cropView.mat" />
      <template v-if="single && !vhandles && !cropView">
        <div class="sel none" :class="{ comp: selComp }" :style="rbox(single)">
          <template v-if="!single.locked">
            <span v-for="c in CORNERS" :key="'r' + c" :class="['rot', 'at-' + c]" :style="{ cursor: rotCursor(c, single.angle) }" @pointerdown.stop.prevent="startRotate($event)" />
            <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, single.angle) }" @pointerdown.stop.prevent="startResize($event, h)" @dblclick.stop="edgeDbl(h)" />
            <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, single.angle) }" @pointerdown.stop.prevent="startResize($event, c)" />
            <span v-for="h in radHandles ?? []" :key="'rh' + h.c" class="rh" :style="{ left: h.x + 'px', top: h.y + 'px' }" :title="tr('Corner radius (⌥ one corner)')" @pointerdown.stop.prevent="startRadius($event, h.c)" />
          </template>
        </div>
        <span class="sq size below" :class="{ comp: selComp }" :style="single.angle ? tagsFor(single).size : belowBox(single)">
          <template v-if="rotating">{{ fmt(single.rotation) }}°</template>
          <template v-else>{{ fmt(single.w) }}<span v-if="singleModes.w" class="mode">{{ singleModes.w }}</span> × {{ fmt(single.h) }}<span v-if="singleModes.h" class="mode">{{ singleModes.h }}</span></template>
        </span>
      </template>
      <svg v-if="shown" class="guides" width="100%" height="100%">
        <template v-for="(l, i) in shown.lines" :key="i">
          <line :x1="l.x1 === l.x2 ? crisp(sx(l.x1)) : sx(l.x1)" :y1="l.y1 === l.y2 ? crisp(sy(l.y1)) : sy(l.y1)" :x2="l.x1 === l.x2 ? crisp(sx(l.x2)) : sx(l.x2)" :y2="l.y1 === l.y2 ? crisp(sy(l.y2)) : sy(l.y2)" :stroke-dasharray="l.dash ? '3 3' : undefined" />
          <template v-if="l.tick"><line v-for="(t, j) in ticks(l)" :key="j" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" /></template>
          <!-- 맞춰진 점마다 작은 ×(피그마와 같아요) -->
          <path v-if="l.marks?.length" class="gmark" :d="l.marks.map((m) => `M${sx(m.x) - 3} ${sy(m.y) - 3}l6 6M${sx(m.x) + 3} ${sy(m.y) - 3}l-6 6`).join('')" />
        </template>
      </svg>
      <template v-if="shown"><span v-for="(lb, i) in shown.labels" :key="'g' + i" class="sq glabel" :style="{ left: sx(lb.x) + 'px', top: sy(lb.y) + 'px' }">{{ lb.text }}</span></template>
      <div v-for="(g, i) in mixGhosts" :key="'mg' + i" class="sel" :style="box(g)" />
      <div v-if="draft && !marqueeOn" class="sel" :style="box(draft)"><span class="sq size">{{ fmt(draft.width) }} × {{ fmt(draft.height) }}</span></div>
      <div v-if="draft && marqueeOn" class="marq" :style="box(draft)" />
      <!-- 펜 미리보기 -->
      <svg v-if="penView" class="pen" width="100%" height="100%">
        <path :d="penView.d" class="pp" />
        <path v-if="penView.rubber" :d="penView.rubber" class="pr" />
        <template v-for="(q, k) in penView.pts" :key="k">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3" class="hd" /><circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3" class="hd" />
          <circle :cx="q.a.x" :cy="q.a.y" r="3.5" class="an" :class="{ cur: k === penView.pts.length - 1 }" />
        </template>
      </svg>
      <!-- 벡터 점 편집 -->
      <svg v-if="hoverShape || selShape" class="shape-ol" width="100%" height="100%" aria-hidden="true">
        <path v-if="selShape" :d="selShape.d" :transform="selShape.tf" vector-effect="non-scaling-stroke" stroke-width="1" />
        <path v-if="hoverShape" :d="hoverShape.d" :transform="hoverShape.tf" vector-effect="non-scaling-stroke" stroke-width="2" />
      </svg>
      <svg v-if="vhandles" class="vedit" width="100%" height="100%">
        <defs><pattern id="vhatch" :width="vshape?.pw ?? 6" :height="vshape?.pw ?? 6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" :y2="vshape?.pw ?? 6" class="vh-line" :stroke-width="(vshape?.pw ?? 6) / 6" /></pattern></defs>
        <!-- 편집 중: 모양은 회색 선, 칠이 있으면 파란 빗금(피그마와 같아요) -->
        <!-- 피그마와 같아요: 모양 칠 위에 마우스를 올렸을 때만 파란 빗금. 둥근 모양 윤곽선 · 바깥 상자는 그리지 않고 점 사이 선(회색)만 -->
        <path v-if="vshape?.filled" :d="vshape.d" :transform="vshape.tf" class="vhatch" />
        <rect v-if="vmarq" :x="vmarq.x" :y="vmarq.y" :width="vmarq.w" :height="vmarq.h" class="vmarq" />
        <!-- 선 손잡이: 보이지 않는 굵은 선(누르기 쉬움) · 고른 선은 파란 2px -->
        <g v-for="g in vsegs ?? []" :key="'s' + g.pi + ':' + g.qi" :class="['vseg', { on: segOn(g.pi, g.qi) }]">
          <path :d="g.d" class="vs-line" />
          <path :d="g.d" class="vs-hit" @pointerdown.stop.prevent="startVseg($event, g.pi, g.qi)" />
        </g>
        <template v-for="q in vhandles" :key="q.pi + ':' + q.qi">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'i')" />
          <circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'o')" />
          <circle :cx="q.a.x" :cy="q.a.y" r="4" class="an" :class="{ on: ptOn.has(q.pi + ':' + q.qi) }" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'a')" />
        </template>
      </svg>
      <svg v-if="draftPts" class="guides draw" width="100%" height="100%"><polyline :points="draftPts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')" /></svg>
    </div>
    <CanvasRulers :vp="vp" :guides="props.guides ?? { x: [], y: [] }" :frames="guideFrames" :active="guideActive" :snaps="guideSnaps" :sel="selWorld" :rulers="rulersShown" @change="onGuides" />
  </main>
</template>

<style scoped>
.canvas { --iris-select: #0E97FC; --iris-measure: #F04A26; position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;  }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
/* 움직이는 동안만 GPU 층으로(부드럽게), 멈추면 풀어서 확대 비율대로 다시 그려요 — 글자 · 도형이 늘 선명한 벡터 */
.world.moving { will-change: transform; }
.free { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none; }
.free :deep(.ly:not(.lk)) { pointer-events: auto; }
/* 화면(screen) 요소만 — 맨 위 단계 프레임 레이어(.ly.frame)도 이 컴포넌트의 scope 를 받아서, 화면에만 걸리게 [data-screen] 으로 */
.frame[data-screen] { position: absolute; pointer-events: auto; background: var(--iris-paper); overflow: hidden; outline: none; }
/* 피그마처럼 기본 테두리 · 그림자 없음. 마우스를 올리면 얇은 파란 선(확대와 상관없이 1px) */
.ghost { position: absolute; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: 3; }
.ghost.clipped { overflow: hidden; }
.ghost-at { position: absolute; width: 0; height: 0; overflow: visible; }
.ghost :deep(.ly) { pointer-events: none !important; }
.drop-at.line { outline-width: calc(1.5px / var(--z, 1)); background: none; }
.drop-at { position: absolute; pointer-events: none; outline: calc(2px / var(--z, 1)) solid var(--iris-select); background: color-mix(in srgb, var(--iris-select) 6%, transparent); z-index: 4; }
.thumb { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; pointer-events: none; }
.frame-stk { position: absolute; inset: 0; z-index: 3; border-radius: inherit; pointer-events: none; }
/* Corner smoothing 화면: 바탕 · 그림자 층은 내용 뒤, 선은 내용 위 */
.fsmw { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.rmask { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.rmask > * { pointer-events: auto; }
.fsmb { position: absolute; inset: 0; }
.frame-sqk { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none; }
.draft { position: absolute; background: color-mix(in srgb, var(--iris-select) 8%, transparent); }
.draft.shape { background: none; }
.draft-svg { position: absolute; inset: 0; overflow: visible; }
.overlay { position: absolute; inset: 0; pointer-events: none; }
/* 픽셀 격자 두 겹(줌 400–800% 사이는 opacity 로 서서히):
   1) 흰 선 5% difference — 밝은 바탕은 살짝 어둡게, 어두운 바탕은 살짝 밝게
   2) 중간 회색 선 6% — 파랑 · 빨강 같은 중간 밝기 색 위에서도 옅게 보이게
   선 굵기는 기기 픽셀 1칸(<canvas> 에 선마다 기기 픽셀로 맞춰 그려요). 캔버스 #F5F5F5 위 ≈ #E3E3E3(피그마와 같아요), 검은 바탕 ≈ #121212, 파랑 위는 살짝 바랜 선 */
.pxgrid { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
.pxgrid.dif { mix-blend-mode: difference; }
.label { position: absolute; pointer-events: auto; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.label.on { color: var(--iris-select); font-weight: 500; }
.lb-ic { display: inline-block; vertical-align: -2px; margin-right: 3px; }
.label:has(.label-in) { overflow: visible; }
/* 이름 고치기: 이름표 자리 그대로, 파란 1px 테두리 */
.label-in { display: block; width: 160px; height: 18px; margin: -1px 0 0 -3px; padding: 0 2px; border: 0; outline: 1px solid var(--iris-select); border-radius: 2px; background: var(--sys-color-common-white-emphasis); font: inherit; font-weight: 500; color: var(--sys-color-neutral-800); }
/* 피그마 연결 표시: 프레임 이름 줄 오른쪽 끝 */
.fig-tag { position: absolute; transform: translateX(-100%); pointer-events: auto; display: grid; place-items: center end; width: 16px; height: 16px; cursor: default; }
a.fig-tag { cursor: pointer; }
a.fig-tag:hover svg { transform: scale(1.15); }
.fig-tag svg { flex: none; transition: transform .12s ease; }
.sel { position: absolute; box-shadow: 0 0 0 1px var(--iris-select); }
/* 오토 레이아웃 간격 표시(피그마와 같아요): 분홍 칠 + 테두리 */
.al-hint { position: absolute; pointer-events: none; transform-origin: center; }
.al-zone { position: absolute; box-sizing: border-box; background: color-mix(in srgb, var(--iris-spacing, #E5399F) 16%, transparent); box-shadow: inset 0 0 0 1px var(--iris-spacing, #E5399F); }
/* 컴포넌트(인스턴스) 선택 · 마우스 올림: 피그마 보라 */
.comp { --iris-select: var(--iris-component); }
/* ⌘ + 마우스 올림: 요소 1px 테두리 · 글자 밑줄 1px */
.cmd-box { position: absolute; pointer-events: none; box-shadow: 0 0 0 1px var(--iris-select); }
.cmd-ul { position: absolute; pointer-events: none; background: var(--iris-select); }
/* 마우스 올림: 모양(둥근 모서리 · 원)을 따라 2px — 피그마 UI3(선택 상자는 1px) */
/* 이름은 .hover-ol — 앱 공용 .hov(목록 줄 호버)에 걸린 0.12초 전환이 캔버스 테두리에 묻지 않게(피그마처럼 바로 바뀌어요) */
.hover-ol { position: absolute; pointer-events: none; box-shadow: 0 0 0 2px var(--iris-select); }
/* Corner smoothing 모양: 상자 대신 squircle 경로로 그려요 */
.hover-ol.shaped, .cmd-box.shaped { box-shadow: none; }
.shape-line { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.shape-line path { fill: none; stroke: var(--iris-select); }
/* 올린 프레임 · 그룹의 바로 아래 자식: 1px 점선 */
/* 점선 상자(그룹 · 프레임 안 레이어 표시): 브라우저 dashed 는 마디가 길어서, 2 칠 · 2 빔의 짧고 촘촘한 점선을 직접 그려요(가장자리 1px 네 줄) */
.kid, .parent { --dl: var(--iris-select); background:
  repeating-linear-gradient(90deg, var(--dl) 0 2px, transparent 2px 4px) top left / 100% 1px no-repeat,
  repeating-linear-gradient(90deg, var(--dl) 0 2px, transparent 2px 4px) bottom left / 100% 1px no-repeat,
  repeating-linear-gradient(180deg, var(--dl) 0 2px, transparent 2px 4px) top left / 1px 100% no-repeat,
  repeating-linear-gradient(180deg, var(--dl) 0 2px, transparent 2px 4px) top right / 1px 100% no-repeat; }
.kid { position: absolute; pointer-events: none; }
/* 오토 레이아웃 안쪽 여백: 파란 빗금 */
.pad { position: absolute; pointer-events: none; background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--iris-select) 30%, transparent) 0 1px, transparent 1px 4px), color-mix(in srgb, var(--iris-select) 8%, transparent); }
/* 고른 레이어의 부모: 옅은 1px 점선 */
.parent { position: absolute; pointer-events: none; --dl: color-mix(in srgb, var(--iris-select) 70%, transparent); }
/* 오토 레이아웃 간격: 분홍 빗금 + 가운데 짧은 손잡이 선 */
.gap { position: absolute; pointer-events: none; display: grid; place-items: center; background: repeating-linear-gradient(-45deg, rgb(242 72 156 / 32%) 0 1px, transparent 1px 4px), rgb(242 72 156 / 8%); }
.gap i { position: relative; width: 8px; height: 1px; background: rgb(242 72 156); pointer-events: auto; }
.gap:not(.v) i { width: 1px; height: 8px; }
/* 손잡이: 잡기 쉬운 넓은 자리(보이는 선은 그대로) */
.gap i::before, .pad i::before { content: ''; position: absolute; inset: -6px -4px; }
.pad { display: grid; place-items: center; }
.pad i { position: relative; width: 1px; height: 8px; background: var(--iris-select); pointer-events: auto; }
.pad.v i { width: 8px; height: 1px; }
.glabel.gapl { --sq-fill: rgb(242 72 156); }
.sel.dim { box-shadow: 0 0 0 1px color-mix(in srgb, var(--iris-select) 45%, transparent); }
.sel.none { box-shadow: none; }
/* 문서 REQ 미리 보기(마우스 올림): 청록(turquoise) 2px 선 + 바깥 은은한 번짐 + 옅은 칠, 왼쪽 위에 REQ 번호 꼬리표 — 파란 선택선과 겹쳐도 잘 보이게 */
/* 문서 REQ 가 가리키는 항목: 청록 선만(안은 칠하지 않아요 — 사용자 요청 2026-11-26) */
.peek { position: absolute; pointer-events: none; box-shadow: 0 0 0 2px var(--iris-peek), 0 0 0 5px color-mix(in srgb, var(--iris-peek) 28%, transparent); border-radius: 2px; }
.peek-tag { position: absolute; left: -2px; bottom: calc(100% + 4px); padding: 0 6px; border-radius: 4px; background: var(--iris-peek); color: #fff; font-size: 11px; line-height: 18px; font-weight: 600; white-space: nowrap; box-shadow: 0 1px 3px rgb(3 9 26 / 18%); }
.hl { position: absolute; box-shadow: 0 0 0 2px var(--iris-select); background: color-mix(in srgb, var(--iris-select) 6%, transparent); }
.handle.live { pointer-events: auto; width: 7px; height: 7px; border-radius: 1px; box-shadow: 0 0 0 1px var(--iris-select); }
/* 보이는 건 7px(피그마 UI3), 잡는 범위는 15px */
.handle.live::after { content: ""; position: absolute; inset: -4px; }
.handle.at-nw { left: -3.5px; top: -3.5px; cursor: nwse-resize; }
.handle.at-se { right: -3.5px; bottom: -3.5px; cursor: nwse-resize; }
.handle.at-ne { right: -3.5px; top: -3.5px; cursor: nesw-resize; }
.handle.at-sw { left: -3.5px; bottom: -3.5px; cursor: nesw-resize; }
.edge { position: absolute; pointer-events: auto; }
.edge.n { left: 4px; right: 4px; top: -4px; height: 8px; }
.edge.s { left: 4px; right: 4px; bottom: -4px; height: 8px; }
.edge.e { top: 4px; bottom: 4px; right: -4px; width: 8px; }
.edge.w { top: 4px; bottom: 4px; left: -4px; width: 8px; }
/* 모서리 바로 바깥: 끌어서 돌리기 */
.rot { position: absolute; pointer-events: auto; width: 16px; height: 16px; cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6.5 16.5a7 7 0 0 1 10-10M17.5 3v4h-4' stroke='white' stroke-width='4'/%3E%3Cpath d='M6.5 16.5a7 7 0 0 1 10-10M17.5 3v4h-4' stroke='black' stroke-width='1.5'/%3E%3C/g%3E%3C/svg%3E") 12 12, alias; }
.rot.at-nw { left: -18px; top: -18px; }
.rot.at-ne { right: -18px; top: -18px; }
.rot.at-sw { left: -18px; bottom: -18px; }
.rot.at-se { right: -18px; bottom: -18px; }
.size.below { top: auto; }
.guides { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.pen, .vedit { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.pen .pp { fill: none; stroke: var(--iris-select); stroke-width: 1; }
.pen .pr { fill: none; stroke: var(--iris-select); stroke-width: 1; stroke-dasharray: 3 3; }
.pen .hl, .vedit .hl { stroke: var(--iris-select); stroke-width: 1; }
.pen .hd, .vedit .hd { fill: #FFFFFF; stroke: var(--iris-select); stroke-width: 1; }
.pen .an, .vedit .an { fill: #FFFFFF; stroke: var(--iris-select); stroke-width: 1; }
/* 펜 · 점 편집: 점은 흰 원(파란 테), 지금 찍은 점 · 고른 점은 파랑 — 피그마 UI3 */
.pen .an.cur { fill: var(--iris-select); }
.vedit .an, .vedit .hd { pointer-events: auto; cursor: default; }
.vedit .an.on { fill: var(--iris-select); }
/* 점 고르기 상자(빈 곳 끌기) */
.vedit .vmarq { fill: color-mix(in srgb, var(--iris-select) 8%, transparent); stroke: var(--iris-select); stroke-width: 1; pointer-events: none; }
/* 선 손잡이: 누를 자리는 12px 굵기(투명), 마우스를 올리면 파란 1px, 고르면 파란 2px(피그마와 같아요) */
.vedit .vs-hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: default; }
.vedit .vs-line { fill: none; stroke: #B3B3B3; stroke-width: 1; pointer-events: none; }
.vedit .vseg:hover .vs-line { stroke: var(--iris-select); }
.vedit .vseg.on .vs-line { stroke: var(--iris-select); stroke-width: 2; }
/* 아직 도형인 채 점 편집: 모양 대신 회색 상자 선(피그마와 같아요) */
.vedit .vhatch { fill: transparent; pointer-events: fill; }
.vedit .vhatch:hover { fill: url(#vhatch); }
.shape-ol { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.shape-ol path { fill: none; stroke: var(--iris-select); }
.vedit .vh-line { stroke: var(--iris-select); opacity: .7; }
/* 모서리 원형 손잡이(Corner radius 끌기) */
.rh { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 1px var(--iris-select); pointer-events: auto; cursor: default; }
.rh::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; }
.rlabel { position: absolute; left: auto; top: auto; margin: 0; transform: translateX(-50%); }
.guides.draw polyline { fill: none; stroke: var(--iris-select); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
/* 스마트 가이드(자석) 선: 자 가이드를 잡았을 때의 빨간 선과 같은 1px — crispEdges 는 소수 자리에서 2px 로 번져 진해 보여서 빼고 자리를 픽셀에 맞춰요 */
.guides line { stroke: var(--iris-measure); stroke-width: 1; }
.guides .gmark { fill: none; stroke: var(--iris-measure); stroke-width: 1; }
/* 간격 · 맞춤선 숫자: 피그마처럼 빨간 바탕 흰 글자(라이트 · 다크 같음) */
.glabel { position: absolute; transform: translate(-50%, -50%); padding: 0 4px; border-radius: 2px; font-variant-numeric: proportional-nums; font-feature-settings: 'pnum'; --sq-fill: var(--iris-measure); color: #FFFFFF; font-family: var(--font-family-base); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; pointer-events: none; }
/* 크기 표시: 파란 바탕, 넉넉한 안쪽 여백, 크기 방식(Hug) 표시 */
.size { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 8px; padding: 0 4px; border-radius: 2px; font-variant-numeric: proportional-nums; font-feature-settings: 'pnum'; pointer-events: none; --sq-fill: var(--iris-select); color: #FFFFFF; font-family: var(--font-family-base); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; }
.size .mode { font-weight: 500; opacity: .8; margin-left: 3px; }
.marq { position: absolute; box-shadow: 0 0 0 1px var(--iris-select); background: color-mix(in srgb, var(--iris-select) 8%, transparent); }
</style>
