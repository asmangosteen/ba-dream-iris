<script setup lang="ts">
import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import { descendants, isContainer, normAngle, ratioLocked, frameCss, type LayerNode, type LayerType } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { radiiOf, simplify } from '~/canvas/paint'
import { boxes0, constrain, slotIndex } from '~/canvas/layout'
import GridOverlay from '~/components/editor/GridOverlay.vue'
import CanvasRulers from '~/components/editor/CanvasRulers.vue'
import { layerMenuItems, svgOf, useLastCopy } from '~/composables/useLayerMenu'
import type { MenuItem } from '~/composables/useContextMenu'
import { DS_DRAG } from '~/composables/useDsInstances'
import { denorm, normalize } from '~/canvas/vector'
import { aabb, alignGuides, angleOf, apply, applyVec, handed, handleCursor, handleDir, invert, layerMatrix, measureGuides, mul, resizeLocal, snapAxis, snapMove, translate, union, type AlignKind, type ArrangeOp, type Guides, type Handle, type Mat, type Rect } from '~/canvas/geom'
import LayerView from '~/components/editor/LayerView.vue'
import { GHOST_KEY } from '~/canvas/ghost'
import { useImageSrc } from '~/canvas/images'

/**
 * 무한 캔버스 + 화면 안 레이어 편집.
 * - 이동: 빈 곳 드래그 · 스페이스+드래그 · 가운데 버튼 · 트랙패드 스크롤 / 확대: ⌘·Ctrl+휠 · 핀치 · 단축키
 * - 화면: 고르기 · 끌어 옮기기, 빈 곳에 프레임 도구 → 새 화면
 * - 레이어: 고르기(Shift 여러 개) · 끌어 옮기기 · 변 · 모서리로 크기(⇧ 비율, ⌥ 가운데 기준) · 모서리 바깥으로 돌리기(⇧ 15°) · 두 번 눌러 글자 고치기, 화면 안에 사각형 · 프레임 · 텍스트 그리기
 * - 스냅: 옮기거나 크기를 바꿀 때 형제 · 부모의 가장자리 · 가운데 · 같은 간격에 붙어요(⌘ · Ctrl 누르면 끔) / ⌥ 호버: 고른 레이어와의 거리
 * 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y). 레이어 좌표는 화면(또는 부모 프레임) 왼쪽 위 기준
 */
export interface Viewport { x: number; y: number; zoom: number }

const props = defineProps<{ screens: ScreenRow[]; highlight?: string[]; background?: string | null; pixelGrid?: boolean; guides?: { x: number[]; y: number[] } }>()
const tool = defineModel<Tool>('tool', { required: true })
const vp = defineModel<Viewport>('viewport', { required: true })
const emit = defineEmits<{
  move: [id: string, x: number, y: number, done: boolean]
  /** 화면(프레임) 변 · 모서리 끌어 크기 바꾸기 */
  'resize-screen': [id: string, rect: { x: number; y: number; width: number; height: number }, done: boolean]
  /** 여러 화면 정렬 · 균등 분배 (단축키) */
  'arrange-screens': [op: ArrangeOp]
  create: [rect: { x: number; y: number; width: number; height: number }]
  hint: [text: string]
  /** 화면(프레임) 단위 동작 — 레이어를 고르지 않고 화면만 골랐을 때 */
  /** 캔버스에 파일을 끌어 놓았을 때(캔버스 좌표) */
  /** place: 놓은 자리의 화면(또는 캔버스) · 가장 안쪽 프레임 */
  'drop-files': [files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }]
  'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward', dx?: number, dy?: number]
  /** 가이드선 바뀜 */
  guides: [g: { x: number[]; y: number[] }]
  /** ⌥ 끌어서 화면 복제(놓은 자리) */
  'clone-screen': [id: string, x: number, y: number]
}>()
const store = useLayerStore()

const el = ref<HTMLElement | null>(null)
const space = ref(false)
const panning = ref(false)
const draft = ref<{ x: number; y: number; width: number; height: number } | null>(null) // 캔버스 좌표
/** 선 · 연필 미리보기(캔버스 좌표 점들) */
const draftPts = ref<[number, number][] | null>(null)

const MIN = 0.05
const MAX = 8
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
/** 패널에 가리지 않는 가운데 영역에 맞추기 */
function fitRect(x0: number, y0: number, x1: number, y1: number, maxZoom = 1) {
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  const area = { left: 288, right: r.width - 312, top: 72, bottom: r.height - 72 }
  const w = Math.max(1, area.right - area.left), h = Math.max(1, area.bottom - area.top)
  const zoom = clamp(Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0), maxZoom) * 0.92)
  vp.value = { zoom, x: area.left + (w - (x1 - x0) * zoom) / 2 - x0 * zoom, y: area.top + (h - (y1 - y0) * zoom) / 2 - y0 * zoom }
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
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'screen'; id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; targets: Rect[]; moved: boolean; clickLayer?: string; dup?: boolean }
  | { kind: 'draw'; wx: number; wy: number; moved: boolean }
  | { kind: 'layers'; sid: string; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; inv: Record<string, Mat>; b0: Rect | null; targets: Targets; before: string; moved: boolean; carry: { id: string; x: number; y: number }[]; clickLayer?: string; out?: boolean; parent0?: string | null }
  | { kind: 'drawLine'; sid: string; parentId: string | null; px: number; py: number; lx: number; ly: number; ex: number; ey: number; arrow: boolean; moved: boolean }
  | { kind: 'pencil'; sid: string; parentId: string | null; px: number; py: number; pts: [number, number][]; moved: boolean }
  | { kind: 'resize'; sid: string; id: string; handle: Handle; sx: number; sy: number; g: { cx: number; cy: number; w: number; h: number; angle: number }; pinv: Mat; ratio: boolean; targets: Targets; before: string; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; sub0?: string }
  | { kind: 'pen'; moved: boolean }
  | { kind: 'vpt'; sid: string; id: string; pi: number; qi: number; part: 'a' | 'i' | 'o'; sx: number; sy: number; abs0: ReturnType<typeof denorm>; inv: Mat; x0: number; y0: number; before: string; moved: boolean }
  | { kind: 'resizeMany'; sid: string; handle: Handle; sx: number; sy: number; u0: Rect; items: { id: string; b: Rect; p: { x: number; y: number } }[]; before: string; moved: boolean }
  | { kind: 'resizeScreen'; id: string; handle: Handle; sx: number; sy: number; o: Rect; targets: Rect[]; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; before?: string }
  | { kind: 'rotate'; sid: string; id: string; cx: number; cy: number; a0: number; r0: number; sign: number; before: string; moved: boolean }
  | { kind: 'drawLayer'; sid: string; type: LayerType; parentId: string | null; px: number; py: number; lx: number; ly: number; moved: boolean }
  | { kind: 'marquee'; sid: string; wx: number; wy: number; base: string[]; moved: boolean }
  | { kind: 'marqueeCanvas'; wx: number; wy: number; moved: boolean }
  | { kind: 'screens'; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; b0: Rect; targets: Rect[]; moved: boolean }
let drag: Drag | null = null

const isNative = (s: ScreenRow) => s.source === 'native'
const isCanvas = (s: { id: string }) => isPageCanvas(s.id)
const realScreens = computed(() => props.screens.filter((s) => !isCanvas(s)))
const canvasDoc = computed(() => props.screens.find(isCanvas) ?? null)
/** 캔버스 위 맨 위 단계 레이어: 섹션은 화면 아래(under), 나머지는 화면 위(over) */
const canvasRoots = computed(() => {
  const c = canvasDoc.value
  if (!c) return { under: [] as string[], over: [] as string[] }
  const d = store.doc(c.id)
  return { under: d.rootIds.filter((id) => d.nodes[id]?.type === 'section'), over: d.rootIds.filter((id) => d.nodes[id]?.type !== 'section') }
})
function toggleMulti(id: string) {
  const cur = multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) && store.screenId.value !== id ? [store.screenId.value] : []
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
}
/** 상자 선택 · Shift 클릭으로 함께 고른 화면들(첫 번째가 store.screenId). 페이지가 v-model:multi 로 받아 '화면 n개' 패널을 그려요 */
const multi = defineModel<string[]>('multi', { default: () => [] })
watch(() => store.screenId.value, (id) => { if ((!id || !multi.value.includes(id)) && multi.value.length) multi.value = [] })
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
      if (lx >= p.x && ly >= p.y && lx <= p.x + n.w && ly <= p.y + n.h) { found = id; walk(n.children ?? []) }
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
  return { sid, x: s.x, y: s.y, items }
})
provide(GHOST_KEY, computed(() => (ghost.value ? { sid: ghost.value.sid, ids: new Set(dragOutIds.value) } : null)))
function screenUnder(wx: number, wy: number) {
  return [...realScreens.value].reverse().find((v) => isNative(v) && wx >= v.x && wy >= v.y && wx <= v.x + v.width && wy <= v.y + v.height) ?? null
}
function retarget(dg: Extract<Drag, { kind: 'layers' }>, e: PointerEvent, dx: number, dy: number) {
  const sc = props.screens.find((v) => v.id === dg.sid)
  if (!sc || dg.carry.length) return
  const w = toWorld(e.clientX, e.clientY)
  const under = screenUnder(w.x, w.y)
  const out = isCanvas(sc) ? !!under : under?.id !== sc.id
  dg.out = out
  const d = store.doc(sc.id)
  const roots = dg.ids.filter((id) => !dg.ids.some((o) => o !== id && descendants(d, o).includes(id)))
  dragOut.value = out && !isCanvas(sc) ? sc.id : null
  dragOutIds.value = dragOut.value ? roots : []
  // 들어갈 프레임 · 화면에 파란 테두리(피그마와 같아요): 다른 화면으로 나가면 그 화면, 같은 화면이면 부모가 바뀔 때 새 부모
  if (out) { setDropLine(under ? rectOf(under) : null); return }
  const ex = new Set(roots.flatMap((id) => descendants(d, id)))
  const target = frameAt(sc.id, w.x - sc.x, w.y - sc.y, ex)
  setDropLine(target !== dg.parent0 ? (target ? layerWorld(sc, target) : isCanvas(sc) ? null : rectOf(sc)) : null)
  const moving = roots.filter((id) => d.nodes[id] && d.nodes[id]!.parentId !== target)
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
      const idx = slotIndex(d, p, { x: w.x - sc.x - pp.x, y: w.y - sc.y - pp.y }, new Set(flow))
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
const vedit = ref<{ sid: string; id: string; sel: [number, number] | null } | null>(null)
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
  const lx = w.x - o.x, ly = w.y - o.y
  const first = pn.pts[0]
  if (first && pn.pts.length >= 2 && Math.hypot(first.x - lx, first.y - ly) * vp.value.zoom < 8) { finishPen(true); return }
  pn.pts.push({ x: lx, y: ly })
  drag = { kind: 'pen', moved: false }
}
function finishPen(closed: boolean) {
  const pn = pen.value
  pen.value = null
  if (!pn || pn.pts.length < 2) return
  const box = normalize([{ pts: pn.pts, closed }])
  store.add(pn.sid, pn.parentId, { type: 'vector', x: Math.round((box.x - pn.px) * 100) / 100, y: Math.round((box.y - pn.py) * 100) / 100, w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100, vnet: box.vnet })
  tool.value = 'move'
}
watch(tool, (t) => { if (t !== 'pen' && pen.value) finishPen(false); if (t !== 'move') vedit.value = null })
watch(() => store.layerIds.value.join(), () => { if (vedit.value && (store.layerIds.value.length !== 1 || store.layerIds.value[0] !== vedit.value.id)) vedit.value = null })
/** 점 편집 들어가기: 벡터가 아니면 벡터로 바꿔서(피그마와 같아요) */
const EDITABLE = new Set(['vector', 'line', 'path', 'polygon', 'star', 'ellipse', 'rect'])
function enterVectorEdit(sid: string, id: string) {
  const n = store.node(sid, id)
  if (!n || n.locked || !EDITABLE.has(n.type)) return false
  if (n.type !== 'vector') store.flatten(sid, [id])
  store.selectLayer(sid, id)
  vedit.value = { sid, id, sel: null }
  return true
}
/** 점 편집 손잡이(화면 좌표) */
const vhandles = computed(() => {
  void tick.value
  const ve = vedit.value
  if (!ve) return null
  const s = props.screens.find((v) => v.id === ve.sid)
  const n = s ? store.node(ve.sid, ve.id) : undefined
  if (!s || !n || n.type !== 'vector') return null
  const m = worldMat(s, ve.id)
  const P = (lx: number, ly: number) => { const q = apply(m, lx, ly); return { x: sx(q.x), y: sy(q.y) } }
  return (n.vnet ?? []).map((p, pi) => p.pts.map((q, qi) => ({ pi, qi, a: P(q.x * n.w, q.y * n.h), i: q.i ? P(q.i[0] * n.w, q.i[1] * n.h) : null, o: q.o ? P(q.o[0] * n.w, q.o[1] * n.h) : null }))).flat()
})
function startVpt(e: PointerEvent, pi: number, qi: number, part: 'a' | 'i' | 'o') {
  const ve = vedit.value
  const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
  const n = ve && s ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !s || !n) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  ve.sel = [pi, qi]
  drag = { kind: 'vpt', sid: ve.sid, id: ve.id, pi, qi, part, sx: e.clientX, sy: e.clientY, abs0: denorm(n.vnet ?? [], n.w, n.h), inv: invert(worldMat(s, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false }
}
function deleteVpt() {
  const ve = vedit.value
  const n = ve ? store.node(ve.sid, ve.id) : undefined
  if (!ve || !n || !ve.sel) return
  const [pi, qi] = ve.sel
  const abs = denorm(n.vnet ?? [], n.w, n.h)
  const p = abs[pi]
  if (!p) return
  p.pts.splice(qi, 1)
  if (p.pts.length < 2) abs.splice(pi, 1)
  ve.sel = null
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
    const st = { ...o.style }
    st.strokeWidth = sc(o.style.strokeWidth); st.radius = sc(o.style.radius); st.fontSize = sc(o.style.fontSize); st.lineHeight = sc(o.style.lineHeight)
    st.letterSpacing = sc(o.style.letterSpacing); st.paraSpacing = sc(o.style.paraSpacing)
    if (o.style.radii) st.radii = o.style.radii.map((r) => sc(r)!) as [number, number, number, number]
    if (o.style.dash) st.dash = [sc(o.style.dash[0])!, sc(o.style.dash[1])!]
    if (o.style.effects) st.effects = o.style.effects.map((e) => (e.type === 'drop' || e.type === 'inner' ? { ...e, x: sc(e.x)!, y: sc(e.y)!, blur: sc(e.blur)!, spread: sc(e.spread) } : { ...e, blur: sc(e.blur)! }))
    if (o.style.layout) st.layout = { ...o.style.layout, gap: o.style.layout.gap === 'auto' ? 'auto' : sc(o.style.layout.gap)!, padding: o.style.layout.padding.map((p) => sc(p)!) as [number, number, number, number] }
    for (const key of Object.keys(st) as (keyof typeof st)[]) if (st[key] === undefined) delete st[key]
    n.style = st
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

function start(e: PointerEvent, screen?: ScreenRow) {
  if (e.button !== 0 && e.button !== 1) return
  if (store.editing.value) (document.activeElement as HTMLElement | null)?.blur?.()
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  hover.value = null
  // 캔버스 위 레이어 층에서 레이어가 아닌 곳을 누르면 빈 캔버스와 같아요
  if (screen && isCanvas(screen) && !(e.target as HTMLElement).closest('[data-layer]')) screen = undefined
  if (e.button === 1 || space.value || tool.value === 'hand') {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.value.x, vy: vp.value.y, moved: false }
    panning.value = true
    return
  }
  if (tool.value === 'pen') { penDown(e, screen); return }
  // 점 편집 중에 다른 곳을 누르면 끝내요
  if (vedit.value) vedit.value = null
  const t = drawType(tool.value)
  // 빈 캔버스에 프레임 도구 → 새 화면
  if (!screen) {
    const w = toWorld(e.clientX, e.clientY)
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
    if (tool.value === 'move' || tool.value === 'scale') { drag = { kind: 'marqueeCanvas', wx: w.x, wy: w.y, moved: false }; marqueeOn.value = true; return }
    return
  }
  const w = toWorld(e.clientX, e.clientY)
  const lx = w.x - screen.x, ly = w.y - screen.y
  // 섹션은 늘 캔버스 위에(화면을 묶는 바탕)
  if (tool.value === 'section' && canvasDoc.value) {
    drag = { kind: 'drawLayer', sid: canvasDoc.value.id, type: 'section', parentId: null, px: 0, py: 0, lx: w.x, ly: w.y, moved: false }
    return
  }
  if (pointTool(tool.value)) {
    if (!isNative(screen)) { emit('hint', 'Figma frames are edited in Figma'); tool.value = 'move'; return }
    startPoints(screen.id, lx, ly)
    return
  }
  // 화면 안에 그리기
  if (t) {
    if (!isNative(screen)) { emit('hint', 'Figma frames are edited in Figma'); tool.value = 'move'; return }
    const parentId = frameAt(screen.id, lx, ly)
    const p = parentId ? store.absPos(screen.id, parentId) : { x: 0, y: 0 }
    drag = { kind: 'drawLayer', sid: screen.id, type: t, parentId, px: p.x, py: p.y, lx, ly, moved: false }
    return
  }
  if (tool.value !== 'move' && tool.value !== 'scale') return
  // 레이어 고르기 · 끌기
  const layerEl = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
  const lid = layerEl?.dataset.layer
  // 피그마처럼: 고른 화면 안을 끌면 화면째 옮기기(누르고 떼기만 하면 그 레이어를 골라요)
  const screenGrab = !!lid && !isCanvas(screen) && store.screenId.value === screen.id && !store.layerIds.value.length && !multi.value.length && !(e.shiftKey && !e.altKey)
  if (lid && isNative(screen) && !screenGrab) {
    // Shift+클릭은 여러 개 고르기. ⌥⇧ 는 복제해서 끌기(가로 · 세로로만)
    if (e.shiftKey && !e.altKey) { store.selectLayer(screen.id, lid, true); return }
    const d0 = store.doc(screen.id)
    // 고른 프레임 안의 레이어를 끌면 프레임째(누르고 떼기만 하면 안쪽 레이어를 골라요)
    const anc = store.screenId.value === screen.id ? store.layerIds.value.find((id) => id !== lid && descendants(d0, id).includes(lid)) : undefined
    const wasSel = store.screenId.value === screen.id && store.layerIds.value.includes(lid)
    // 여러 개 중 하나를 누르면: 끌면 함께 옮기고, 그냥 떼면 그 하나만 골라요(피그마와 같아요)
    const pickOne = wasSel && store.layerIds.value.length > 1 ? lid : undefined
    if (!anc && !wasSel) store.selectLayer(screen.id, lid)
    if (e.altKey) store.duplicateInPlace() // ⌥ 끌기: 복제해서 옮기기
    const d = store.doc(screen.id)
    const ids = store.layerIds.value.filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
    const sc = screen
    drag = {
      kind: 'layers', sid: sc.id, ids, sx: e.clientX, sy: e.clientY,
      orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])),
      inv: Object.fromEntries(ids.map((id) => [id, invert(parentWorld(sc, id))])),
      b0: ids.length ? union(ids.map((id) => layerWorld(sc, id)!)) : null,
      targets: snapTargets(sc, ids),
      before: store.begin(sc.id), moved: false,
      carry: sectionCarry(sc, ids),
      clickLayer: anc ? lid : pickOne,
      parent0: ids[0] ? d.nodes[ids[0]]?.parentId ?? null : null,
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
    const cur = multi.value.length ? multi.value : store.screenId.value && !isCanvas({ id: store.screenId.value }) ? [store.screenId.value] : []
    const next = cur.includes(screen.id) ? cur.filter((x) => x !== screen.id) : [...cur, screen.id]
    if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
    return
  }
  if (multi.value.length > 1 && multi.value.includes(screen.id)) {
    const orig = Object.fromEntries(multi.value.map((id) => { const v = props.screens.find((x) => x.id === id)!; return [id, { x: v.x, y: v.y }] }))
    const moving = realScreens.value.filter((v) => multi.value.includes(v.id))
    drag = { kind: 'screens', ids: [...multi.value], sx: e.clientX, sy: e.clientY, orig, b0: union(moving.map(rectOf)), targets: realScreens.value.filter((v) => !multi.value.includes(v.id)).map(rectOf), moved: false }
    return
  }
  store.selectScreen(screen.id)
  const sid0 = screen.id
  drag = { kind: 'screen', id: sid0, sx: e.clientX, sy: e.clientY, ox: screen.x, oy: screen.y, w: screen.width, h: screen.height, targets: isCanvas(screen) ? [] : [...realScreens.value.filter((v) => v.id !== sid0).map(rectOf), ...guideRects()], moved: false, clickLayer: screenGrab ? lid : undefined, dup: e.altKey && isNative(screen) && !isCanvas(screen) }
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
/** 가이드선도 붙는 대상(폭 0 인 긴 상자) */
const guideRects = (): Rect[] => [...(props.guides?.x ?? []).map((x) => ({ x, y: -1e6, w: 0, h: 2e6 })), ...(props.guides?.y ?? []).map((y) => ({ x: -1e6, y, w: 2e6, h: 0 }))]
const snapOff = (e: PointerEvent) => e.metaKey || e.ctrlKey
const thr = () => 6 / vp.value.zoom

function startResize(e: PointerEvent, handle: Handle) {
  const s = selScreen.value
  const id = store.layerIds.value[0]
  if (!s || !id) return
  const n = store.node(s.id, id)
  if (!n) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const g = layerGeom(s, id)!
  const d0 = store.doc(s.id)
  const kids = isContainer(n) && !n.style.layout ? (n.children ?? []).map((c) => d0.nodes[c]!).filter(Boolean) : []
  drag = { kind: 'resize', sid: s.id, id, handle, sx: e.clientX, sy: e.clientY, g: { cx: g.cx, cy: g.cy, w: g.w, h: g.h, angle: g.angle }, pinv: invert(parentWorld(s, id)), ratio: ratioLocked(n) || tool.value === 'scale', targets: snapTargets(s, [id]), before: store.begin(s.id), moved: false, kids0: kids.length ? boxes0(kids) : undefined, sub0: tool.value === 'scale' ? JSON.stringify(descendants(d0, id).map((k) => d0.nodes[k])) : undefined }
}
/** 여러 개 고른 상자의 변 · 모서리: 모두 같은 비율로(피그마와 같아요) */
function startResizeMany(e: PointerEvent, handle: Handle) {
  const s = selScreen.value
  if (!s || store.layerIds.value.length < 2) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const d = store.doc(s.id)
  const ids = store.layerIds.value.filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
  const items = ids.map((id) => {
    const n = d.nodes[id]!
    const pw = n.parentId ? layerWorld(s, n.parentId) : null
    return { id, b: layerWorld(s, id)!, p: pw ? { x: pw.x, y: pw.y } : { x: s.x, y: s.y } }
  }).filter((x) => x.b)
  if (!items.length) return
  drag = { kind: 'resizeMany', sid: s.id, handle, sx: e.clientX, sy: e.clientY, u0: union(items.map((x) => x.b)), items, before: store.begin(s.id), moved: false }
}
/** 고른 화면(프레임)의 변 · 모서리 */
function startScreenResize(e: PointerEvent, handle: Handle) {
  const s = selFrame.value
  if (!s) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  const kids = isNative(s) ? store.doc(s.id).rootIds.map((c) => store.doc(s.id).nodes[c]!).filter(Boolean) : []
  drag = { kind: 'resizeScreen', id: s.id, handle, sx: e.clientX, sy: e.clientY, o: rectOf(s), targets: realScreens.value.filter((v) => v.id !== s.id).map(rectOf), moved: false, kids0: kids.length ? boxes0(kids) : undefined, before: kids.length ? store.begin(s.id) : undefined }
}
/** 모서리 바로 바깥을 끌어 돌리기 */
function startRotate(e: PointerEvent) {
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

/**
 * 크기 바꾸기 공통: 상자 자신의 좌표(angle 만큼 돈)에서 손잡이를 (du, dv) 끌었을 때 새 상자.
 * 돌지 않은 상자면 형제 · 부모 가장자리에 붙이고 가이드를 그려요
 */
function resizeBox(g: { cx: number; cy: number; w: number; h: number; angle: number }, handle: Handle, dxw: number, dyw: number, e: PointerEvent, ratio: boolean, targets: Rect[]) {
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
  // 정수 크기로 맞춘 뒤 붙어 있는 쪽이 그대로이도록 가운데를 다시 계산
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h))
  const ox = center || !sx ? 0 : (sx * (w - g.w)) / 2, oy = center || !sy ? 0 : (sy * (h - g.h)) / 2
  return { w, h, cx: g.cx + ox * cos - oy * sin, cy: g.cy + ox * sin + oy * cos, guide }
}

function move(e: PointerEvent) {
  if (!drag) {
    trackHover(e)
    if (pen.value) { const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pen.value.sid); pen.value.hover = [w.x - o.x, w.y - o.y] }
    return
  }
  if (drag.kind === 'pen') {
    // 끌면 마지막 점의 곡선 핸들(반대쪽은 대칭)
    const pn = pen.value
    const q = pn?.pts[pn.pts.length - 1]
    if (!pn || !q) return
    const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pn.sid)
    const hx = w.x - o.x, hy = w.y - o.y
    if (!drag.moved && Math.hypot(hx - q.x, hy - q.y) * vp.value.zoom < 3) return
    drag.moved = true
    q.o = [hx, hy]; q.i = [2 * q.x - hx, 2 * q.y - hy]
    pn.hover = [hx, hy]
    return
  }
  if (drag.kind === 'vpt') {
    const dx = (e.clientX - drag.sx) / vp.value.zoom, dy = (e.clientY - drag.sy) / vp.value.zoom
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1 / vp.value.zoom) return
    drag.moved = true
    const v = applyVec(drag.inv, dx * vp.value.zoom / vp.value.zoom, dy)
    const abs = JSON.parse(JSON.stringify(drag.abs0)) as typeof drag.abs0
    const q = abs[drag.pi]?.pts[drag.qi]
    if (!q) return
    const mv = (p?: [number, number]) => (p ? [p[0] + v.x, p[1] + v.y] as [number, number] : p)
    if (drag.part === 'a') { q.x += v.x; q.y += v.y; q.i = mv(q.i); q.o = mv(q.o) }
    else {
      const h = drag.part === 'i' ? 'i' : 'o', other = h === 'i' ? 'o' : 'i'
      q[h] = mv(q[h])
      // 반대쪽 핸들은 대칭으로(⌥ 를 누르면 따로)
      if (q[other] && !e.altKey) q[other] = [2 * q.x - q[h]![0], 2 * q.y - q[h]![1]]
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
    // Shift: 가로나 세로로만
    const lockS = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null
    let nx = drag.ox + (lockS === 'x' ? 0 : dx / z), ny = drag.oy + (lockS === 'y' ? 0 : dy / z)
    if (!snapOff(e) && drag.targets.length) {
      const r = snapMove({ x: nx, y: ny, w: drag.w, h: drag.h }, drag.targets, [], thr(), { x: lockS !== 'x', y: lockS !== 'y' })
      nx += r.dx; ny += r.dy; guides.value = r.guides
    } else guides.value = null
    // ⌥ 끌기: 원래 화면은 그대로 두고 복제될 자리를 보여 줘요(놓으면 복제)
    if (drag.dup) { draft.value = { x: Math.round(nx), y: Math.round(ny), width: drag.w, height: drag.h }; return }
    emit('move', drag.id, Math.round(nx), Math.round(ny), false)
  } else if (drag.kind === 'layers') {
    let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 3) return
    drag.moved = true
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
      n.x = Math.round(drag.orig[id]!.x + v.x); n.y = Math.round(drag.orig[id]!.y + v.y)
    }
    for (const c of drag.carry) emit('move', c.id, Math.round(c.x + dx), Math.round(c.y + dy), false)
    retarget(drag, e, dx, dy)
  } else if (drag.kind === 'resize') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    const r = resizeBox(drag.g, drag.handle, dx, dy, e, drag.ratio, [...drag.targets.sibs, ...drag.targets.parents])
    guides.value = r.guide
    const c = apply(drag.pinv, r.cx, r.cy)
    const n = store.node(drag.sid, drag.id)
    if (n) {
      Object.assign(n, { x: Math.round(c.x - r.w / 2), y: Math.round(c.y - r.h / 2), w: r.w, h: r.h })
      if (drag.sub0) scaleSubtree(drag.sid, drag.sub0, r.w / drag.g.w, n.x, n.y) // 스케일 도구(K): 안쪽까지 같은 비율로
      else {
        if (n.type === 'text') n.style.autoWidth = false
        // 직접 크기를 바꾸면 그 방향은 고정 크기로(피그마와 같아요)
        if (r.w !== drag.g.w && n.sizeH && n.sizeH !== 'fixed') n.sizeH = 'fixed'
        if (r.h !== drag.g.h && n.sizeV && n.sizeV !== 'fixed') n.sizeV = 'fixed'
        // 제약: 안쪽 레이어가 따라와요(⌘ 를 누르면 무시)
        if (drag.kids0 && !e.metaKey) {
          const d = store.doc(drag.sid)
          constrain((n.children ?? []).map((k) => d.nodes[k]!).filter(Boolean), drag.kids0, drag.g.w, drag.g.h, r.w, r.h)
        }
      }
      store.relayout(drag.sid)
    }
  } else if (drag.kind === 'resizeMany') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    const u = drag.u0
    const r = resizeBox({ cx: u.x + u.w / 2, cy: u.y + u.h / 2, w: u.w, h: u.h, angle: 0 }, drag.handle, dx, dy, e, e.shiftKey, [])
    const x1 = r.cx - r.w / 2, y1 = r.cy - r.h / 2, kx = r.w / (u.w || 1), ky = r.h / (u.h || 1)
    const d = store.doc(drag.sid)
    for (const it of drag.items) {
      const n = d.nodes[it.id]
      if (!n) continue
      n.x = Math.round(x1 + (it.b.x - u.x) * kx - it.p.x)
      n.y = Math.round(y1 + (it.b.y - u.y) * ky - it.p.y)
      n.w = Math.max(1, Math.round(it.b.w * kx)); n.h = Math.max(1, Math.round(it.b.h * ky))
      if (n.type === 'text') n.style.autoWidth = false
    }
    store.relayout(drag.sid)
  } else if (drag.kind === 'resizeScreen') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
    drag.moved = true
    const o = drag.o
    const r = resizeBox({ cx: o.x + o.w / 2, cy: o.y + o.h / 2, w: o.w, h: o.h, angle: 0 }, drag.handle, dx, dy, e, false, drag.targets)
    guides.value = r.guide
    emit('resize-screen', drag.id, { x: Math.round(r.cx - r.w / 2), y: Math.round(r.cy - r.h / 2), width: r.w, height: r.h }, false)
    if (drag.kids0 && !e.metaKey) store.constrainRoot(drag.id, o.w, o.h, r.w, r.h, drag.kids0, false)
  } else if (drag.kind === 'rotate') {
    drag.moved = true
    let deg = drag.r0 + (drag.sign * (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI
    deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10 // Shift: 15° 씩
    const n = store.node(drag.sid, drag.id)
    if (n) n.rotation = normAngle(deg) || undefined
  } else if (drag.kind === 'draw') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    draft.value = { x: Math.round(Math.min(w.x, drag.wx)), y: Math.round(Math.min(w.y, drag.wy)), width: Math.round(Math.abs(w.x - drag.wx)), height: Math.round(Math.abs(w.y - drag.wy)) }
  } else if (drag.kind === 'screens') {
    let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && (Math.abs(dx) + Math.abs(dy)) * z < 3) return
    drag.moved = true
    if (!snapOff(e) && drag.targets.length) {
      const r = snapMove({ ...drag.b0, x: drag.b0.x + dx, y: drag.b0.y + dy }, drag.targets, [], thr())
      dx += r.dx; dy += r.dy; guides.value = r.guides
    } else guides.value = null
    for (const id of drag.ids) emit('move', id, Math.round(drag.orig[id]!.x + dx), Math.round(drag.orig[id]!.y + dy), false)
  } else if (drag.kind === 'marqueeCanvas') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
    draft.value = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    const hitBox = (b: { x: number; y: number; w: number; h: number }) => b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y
    // 화면이 걸리면 화면들, 아니면 캔버스 위 레이어들
    const scr = realScreens.value.filter((v) => hitBox({ x: v.x, y: v.y, w: v.width, h: v.height })).map((v) => v.id)
    if (scr.length) {
      store.selectScreen(scr[0]!)
      multi.value = scr.length > 1 ? scr : []
    } else if (canvasDoc.value) {
      const c = canvasDoc.value
      const d = store.doc(c.id)
      const ids = d.rootIds.filter((id) => { const n = d.nodes[id]; if (!n || n.hidden || n.locked) return false; return hitBox(layerWorld(c, id)!) })
      multi.value = []
      if (ids.length) { store.selectLayer(c.id, ids[0]!); store.layerIds.value = ids } else store.selectScreen(null)
    }
  } else if (drag.kind === 'marquee') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    if (!drag.moved && store.screenId.value !== drag.sid) store.selectScreen(drag.sid)
    drag.moved = true
    const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
    draft.value = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    const msid = drag.sid
    const s = props.screens.find((v) => v.id === msid)
    if (!s) return
    const d = store.doc(s.id)
    // 맨 위 단계 레이어 중 상자와 겹치는 것 (프레임 안쪽은 프레임째로)
    const hit = d.rootIds.filter((id) => {
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
    // Shift: 45° 단위
    if (e.shiftKey) {
      const a = Math.round(Math.atan2(ly - drag.ly, lx - drag.lx) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(lx - drag.lx, ly - drag.ly)
      lx = drag.lx + Math.cos(a) * len; ly = drag.ly + Math.sin(a) * len
    }
    drag.ex = lx; drag.ey = ly
    draftPts.value = [[drag.lx + s.x, drag.ly + s.y], [lx + s.x, ly + s.y]]
  } else if (drag.kind === 'drawLayer') {
    const dsid = drag.sid
    const s = props.screens.find((v) => v.id === dsid)
    if (!s) return
    const w = toWorld(e.clientX, e.clientY)
    const lx = w.x - s.x, ly = w.y - s.y
    if (!drag.moved && (Math.abs(lx - drag.lx) + Math.abs(ly - drag.ly)) * z < 4) return
    drag.moved = true
    let x0 = drag.lx, y0 = drag.ly, ww = lx - drag.lx, hh = ly - drag.ly
    if (e.shiftKey) { const m = Math.max(Math.abs(ww), Math.abs(hh)); ww = Math.sign(ww || 1) * m; hh = Math.sign(hh || 1) * m }
    if (ww < 0) { x0 += ww; ww = -ww }
    if (hh < 0) { y0 += hh; hh = -hh }
    draft.value = { x: Math.round(s.x + x0), y: Math.round(s.y + y0), width: Math.round(ww), height: Math.round(hh) }
  }
}

function end(e: PointerEvent) {
  if (!drag) return
  const d = drag
  drag = null
  panning.value = false
  guides.value = null
  rotating.value = false
  if (d.kind === 'pan' && !d.moved && e.target === el.value) store.selectScreen(null)
  if (d.kind === 'screen' && d.moved && d.dup) { const r = draft.value; draft.value = null; if (r) emit('clone-screen', d.id, r.x, r.y) }
  else if (d.kind === 'screen' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('move', d.id, s.x, s.y, true)
  }
  if ((d.kind === 'layers' || d.kind === 'resize' || d.kind === 'rotate' || d.kind === 'resizeMany' || d.kind === 'vpt') && d.moved) store.commit(d.sid, d.before)
  dragOut.value = null
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
  if ((d.kind === 'layers' || d.kind === 'screen') && !d.moved && d.clickLayer) store.selectLayer(d.kind === 'layers' ? d.sid : d.id, d.clickLayer)
  if (d.kind === 'layers' && d.moved) for (const c of d.carry) { const v = props.screens.find((x) => x.id === c.id); if (v) emit('move', c.id, v.x, v.y, true) }
  if (d.kind === 'drawLine' || d.kind === 'pencil') { draftPts.value = null; tool.value = 'move'; finishPoints(d) }
  if (d.kind === 'resizeScreen' && d.moved && d.before) store.commit(d.id, d.before)
  if (d.kind === 'resizeScreen' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('resize-screen', d.id, { x: s.x, y: s.y, width: s.width, height: s.height }, true)
  }
  if (d.kind === 'marquee') { draft.value = null; marqueeOn.value = false; if (!d.moved) toggleMulti(d.sid) }
  if (d.kind === 'marqueeCanvas') { draft.value = null; marqueeOn.value = false; if (!d.moved) { store.selectScreen(null); multi.value = [] } }
  if (d.kind === 'screens' && d.moved) for (const id of d.ids) { const v = props.screens.find((x) => x.id === id); if (v) emit('move', id, v.x, v.y, true) }
  if (d.kind === 'draw') {
    const rect = d.moved && draft.value && draft.value.width >= 16 && draft.value.height >= 16 ? draft.value : { x: Math.round(d.wx), y: Math.round(d.wy), width: 390, height: 844 }
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
      const id = store.add(d.sid, d.parentId, { type: 'text', text: 'Text', x: Math.round(d.lx - d.px), y: Math.round(d.ly - d.py), w: big ? r!.width : 60, h: 24, style: big ? { autoWidth: false } : {} })
      store.editing.value = id
      return
    }
    const size = d.type === 'frame' ? { w: 200, h: 200 } : d.type === 'section' ? { w: 400, h: 300 } : { w: 100, h: 100 }
    const x = big ? r!.x - s.x - d.px : Math.round(d.lx - d.px - size.w / 2)
    const y = big ? r!.y - s.y - d.py : Math.round(d.ly - d.py - size.h / 2)
    store.add(d.sid, d.parentId, { type: d.type, x, y, w: big ? r!.width : size.w, h: big ? r!.height : size.h })
  }
}

/** 선 · 연필: 상자(x · y · w · h)와 그 안 비율 점으로 저장 */
function finishPoints(d: Extract<Drag, { kind: 'drawLine' | 'pencil' }>) {
  let pts: [number, number][]
  if (d.kind === 'drawLine') pts = d.moved ? [[d.lx, d.ly], [d.ex, d.ey]] : [[d.lx, d.ly], [d.lx + 100, d.ly]]
  else {
    if (!d.moved || d.pts.length < 2) return
    pts = simplify(d.pts, 1 / vp.value.zoom)
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
  const norm = pts.flatMap(([x, y]) => [w ? Math.round(((x - x0) / w) * 1e4) / 1e4 : 0, h ? Math.round(((y - y0) / h) * 1e4) / 1e4 : 0])
  const type = d.kind === 'pencil' ? 'path' : 'line'
  store.add(d.sid, d.parentId, { type, x: Math.round((x0 - d.px) * 100) / 100, y: Math.round((y0 - d.py) * 100) / 100, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100, pts: norm, ...(d.kind === 'drawLine' && d.arrow ? { name: `Arrow ${Object.values(store.doc(d.sid).nodes).filter((v) => v.name.startsWith('Arrow ')).length + 1}`, style: { arrowEnd: 'arrow' } } : {}) })
}

/**
 * 두 번 누르기: 텍스트는 글자 고치기, 벡터 · 도형은 점 편집.
 * 캔버스가 포인터를 붙잡고 있으면(setPointerCapture) dblclick 이 레이어가 아니라 캔버스로 와서, 누른 자리 아래 요소를 직접 찾아요
 */
function onDblAny(e: MouseEvent) {
  const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const scrEl = hit?.closest('[data-screen]') as HTMLElement | null
  const screen = scrEl ? props.screens.find((v) => v.id === scrEl.dataset.screen) : undefined
  if (screen && hit) onDbl(hit, screen)
}
function onDbl(target: HTMLElement, screen: ScreenRow) {
  const lid = (target.closest('[data-layer]') as HTMLElement | null)?.dataset.layer
  if (!lid || !isNative(screen)) return
  const n = store.node(screen.id, lid)
  if (n?.type === 'text' && !n.locked) { store.selectLayer(screen.id, lid); store.editing.value = lid; return }
  if (n && tool.value === 'move') enterVectorEdit(screen.id, lid)
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
  const s = selScreen.value
  if (!s) return null
  if (store.layerIds.value.length) { const bs = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b); return bs.length ? union(bs) : null }
  return isCanvas(s) ? null : rectOf(s)
})
const lastCopy = useLastCopy()
const ctx = useContextMenu()
/** 붙여넣기: 마지막에 복사한 것(화면이면 화면, 레이어면 레이어) */
function doPaste() {
  const sid = store.screenId.value
  const screen = props.screens.find((v) => v.id === sid)
  const native = !!screen && isNative(screen)
  if (lastCopy.value !== 'screen' && store.hasClipboard()) store.paste(native || (sid && isPageCanvas(sid)) ? undefined : canvasDoc.value?.id)
  else emit('screen-action', 'paste')
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
/** 이름 바꾸기: 오른쪽 패널의 이름 칸으로 */
function focusName() {
  nextTick(() => { const i = document.querySelector<HTMLInputElement>('input[aria-label="Layer name"], input[aria-label="Frame name"]'); i?.focus(); i?.select() })
}
/** 화면(프레임) 우클릭 메뉴 */
function screenMenuItems(screen: ScreenRow, at: { x: number; y: number }): MenuItem[] {
  const native = isNative(screen)
  return [
    { label: 'Copy', shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy') } },
    { label: 'Paste', shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    ...(native ? [{ label: 'Paste here', action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' }] : []),
    { label: 'Duplicate', shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
    'sep',
    { label: 'Bring to front', shortcut: '⌥⌘]', action: () => emit('screen-action', 'front') },
    { label: 'Bring forward', shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
    { label: 'Send backward', shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
    { label: 'Send to back', shortcut: '⌥⌘[', action: () => emit('screen-action', 'back') },
    'sep',
    ...(native ? [
      { label: 'Select all layers', shortcut: '⌘A', action: () => store.selectAll(screen.id), disabled: !store.doc(screen.id).rootIds.length },
      { label: (store.doc(screen.id).frame?.grids?.length ? 'Remove' : 'Add') + ' layout grid', action: () => store.frameStyle(screen.id, { grids: store.doc(screen.id).frame?.grids?.length ? undefined : [{ type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF000019' }] }) },
      { label: 'Copy as SVG', action: () => { const d = store.doc(screen.id); const svg = svgOf(d, d.rootIds.map((id) => d.nodes[id]!).filter(Boolean), store.color); if (svg) navigator.clipboard.writeText(svg).then(() => emit('hint', 'Copied to clipboard'), () => emit('hint', 'Couldn\'t copy to the clipboard')); else emit('hint', 'Nothing to copy as SVG') } },
    ] : []),
    { label: 'Rename', action: focusName },
    { label: 'Zoom to selection', shortcut: '⇧2', action: fitSelection },
    'sep',
    { label: 'Delete', shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
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
  if (screen && lid && isNative(screen)) {
    if (!(store.screenId.value === screen.id && store.layerIds.value.includes(lid))) store.selectLayer(screen.id, lid)
    const n0 = store.node(screen.id, lid)
    const items = layerMenuItems(store, screen.id, [...store.layerIds.value], { lastCopy, paste: doPaste, pasteHere: () => pasteAt(at), fit: fitSelection, hint: (t) => emit('hint', t) })
    // 이름 바꾸기 · 점 편집은 Delete 위에(Delete 가 늘 맨 끝)
    const extra: MenuItem[] = n0 && store.layerIds.value.length === 1 ? [{ label: 'Rename', action: focusName }, ...(EDITABLE.has(n0.type) ? [{ label: 'Edit vector', shortcut: '↵', action: () => enterVectorEdit(screen.id, lid) }] : [])] : []
    items.splice(Math.max(0, items.length - 2), 0, ...extra)
    ctx.open(e, items)
    return
  }
  if (screen && !isCanvas(screen)) {
    if (!multi.value.includes(screen.id)) store.selectScreen(screen.id)
    ctx.open(e, screenMenuItems(screen, at))
    return
  }
  ctx.open(e, [
    { label: 'Paste', shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    { label: 'Paste here', action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' },
    'sep',
    { label: 'Zoom in', shortcut: '⌘+', action: () => zoomAt(vp.value.zoom * 1.25) },
    { label: 'Zoom out', shortcut: '⌘−', action: () => zoomAt(vp.value.zoom / 1.25) },
    { label: 'Zoom to 100%', shortcut: '⇧0', action: () => zoomAt(1) },
    { label: 'Zoom to fit', shortcut: '⇧1', action: () => fit() },
    'sep',
    { label: rulersShown.value ? 'Hide rulers' : 'Show rulers', shortcut: '⇧R', action: () => (rulersShown.value = !rulersShown.value) },
    { label: gridsShown.value ? 'Hide layout grids' : 'Show layout grids', shortcut: '⌃G', action: () => (gridsShown.value = !gridsShown.value) },
  ])
}
function onKeyDown(e: KeyboardEvent) {
  if (typing(e)) return
  // 펜으로 그리는 중: Enter · Esc 끝내기, Backspace 마지막 점 지우기
  if (pen.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'Backspace' || e.key === 'Delete') { pen.value.pts.pop(); if (!pen.value.pts.length) pen.value = null }
    else finishPen(false)
    return
  }
  // 점 편집 중: Enter · Esc 끝내기, Backspace 고른 점 지우기
  if (vedit.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
    e.preventDefault()
    if (e.key === 'Backspace' || e.key === 'Delete') { if (vedit.value.sel) deleteVpt() } else vedit.value = null
    return
  }
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  const sid = store.screenId.value
  const ids = store.layerIds.value
  const screen = props.screens.find((v) => v.id === sid)
  const native = !!screen && isNative(screen)
  const layerMode = !!sid && ids.length > 0
  const stop = () => e.preventDefault()

  if (e.code === 'Space') { space.value = true; stop(); return }
  if (e.key === 'Alt') altOn.value = true
  // 정렬 ⌥A · ⌥D · ⌥W · ⌥S · ⌥H · ⌥V / 균등 분배 ⌃⌥H · ⌃⌥V (macOS 는 ⌥ 가 e.key 를 바꿔서 e.code 로)
  if (e.altKey && !e.metaKey && !e.shiftKey) {
    const many = multi.value.length > 1
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
  }
  // 뒤집기 ⇧H · ⇧V (⇧⌘H 숨기기와 다름)
  if (e.shiftKey && !mod && !e.altKey && (e.code === 'KeyH' || e.code === 'KeyV')) { if (layerMode) { stop(); store.flip(sid!, ids, e.code === 'KeyH' ? 'x' : 'y') } return }
  // 실행취소 · 확대
  if (mod && key === 'z') { stop(); if (e.shiftKey) store.redo(); else store.undo(); return }
  if (mod && key === 'y') { stop(); store.redo(); return }
  if (mod && (e.key === '=' || e.key === '+')) { stop(); zoomAt(vp.value.zoom * 1.25); return }
  if (mod && e.key === '-') { stop(); zoomAt(vp.value.zoom / 1.25); return }
  if (mod && e.key === '0') { stop(); zoomAt(1); return }
  if (e.shiftKey && !mod && e.code === 'Digit1') { fit(); return }
  if (e.shiftKey && !mod && e.code === 'Digit2' && sid) { fitSelection(); return }
  if (e.shiftKey && !mod && e.code === 'Digit0') { zoomAt(1); return }
  // 눈금자 ⇧R
  if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyR') { stop(); rulersShown.value = !rulersShown.value; return }
  // 레이아웃 그리드 보이기 · 숨기기 ⌃G
  if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.code === 'KeyG') { stop(); gridsShown.value = !gridsShown.value; emit('hint', gridsShown.value ? 'Layout grids shown' : 'Layout grids hidden'); return }
  // 오토 레이아웃 ⇧A · 빼기 ⌥⇧A
  if (e.shiftKey && !mod && e.code === 'KeyA') { if (layerMode && native) { stop(); if (e.altKey) store.removeAutoLayout(sid!, ids); else store.addAutoLayout(sid!, ids) } return }
  // 속성 복사 · 붙여넣기 ⌥⌘C / ⌥⌘V
  if (mod && e.altKey && e.code === 'KeyC') { if (layerMode && store.copyStyle()) { stop(); emit('hint', 'Copied properties') } return }
  if (mod && e.altKey && e.code === 'KeyV') { if (layerMode) { stop(); store.pasteStyle() } return }
  // 복사 · 잘라내기 · 붙여넣기 · 복제
  if (mod && key === 'c') {
    if (layerMode && store.copy()) { lastCopy.value = 'layers'; stop() }
    else if (sid && !layerMode && !isPageCanvas(sid)) { lastCopy.value = 'screen'; emit('screen-action', 'copy'); stop() }
    return
  }
  if (mod && key === 'x') { if (layerMode && store.copy()) { lastCopy.value = 'layers'; stop(); store.remove(sid!, ids) } return }
  if (mod && key === 'v') {
    stop()
    doPaste()
    return
  }
  if (mod && key === 'd') { stop(); if (layerMode) store.duplicate(); else if (sid) emit('screen-action', 'duplicate'); return }
  // 모두 고르기 ⌘A
  if (mod && key === 'a') { if (native) { stop(); store.selectAll(sid!) } return }
  // 평탄화 ⌘E · 마스크 ⌃⌘M · 불리언 ⌥⇧U 합치기 · ⌥⇧S 빼기 · ⌥⇧I 교차 · ⌥⇧E 제외
  if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyE') { if (layerMode && native) { stop(); store.flatten(sid!, ids) } return }
  if (e.metaKey && e.ctrlKey && e.code === 'KeyM') { if (layerMode && native) { stop(); store.toggleMask(sid!, ids) } return }
  if (e.altKey && e.shiftKey && !mod) {
    const OPS: Record<string, 'union' | 'subtract' | 'intersect' | 'exclude'> = { KeyU: 'union', KeyS: 'subtract', KeyI: 'intersect', KeyE: 'exclude' }
    const op = OPS[e.code]
    if (op) { if (layerMode && native && ids.length > 1) { stop(); store.booleanOp(sid!, ids, op) } return }
  }
  // 묶기 ⌘G(그룹) · ⌥⌘G(프레임으로 감싸기) · ⇧⌘G(풀기)
  if (mod && e.code === 'KeyG') { if (!layerMode) return; stop(); if (e.shiftKey) store.unwrap(sid!, ids); else store.wrap(sid!, ids, e.altKey ? 'frame' : 'group'); return }
  // 숨기기 ⇧⌘H · 잠그기 ⇧⌘L
  if (mod && e.shiftKey && e.code === 'KeyH') { if (layerMode) { stop(); const hide = !store.node(sid!, ids[0]!)?.hidden; store.update(sid!, ids, { hidden: hide }) } return }
  if (mod && e.shiftKey && e.code === 'KeyL') { if (layerMode) { stop(); const lock = !store.node(sid!, ids[0]!)?.locked; store.update(sid!, ids, { locked: lock }) } return }
  if (e.key === 'Escape') {
    if (layerMode) store.selectLayer(sid!, null)
    else store.selectScreen(null)
    tool.value = 'move'
    return
  }
  if (!sid) return
  // 지우기
  if (e.key === 'Delete' || e.key === 'Backspace') { stop(); if (layerMode) store.remove(sid, ids); else emit('screen-action', 'remove'); return }
  // 순서
  // ⌥ 가 e.key 를 바꾸는 맥에서도 되게 e.code 로. 화면만 골랐으면 화면 순서
  if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    stop()
    const up = e.code === 'BracketRight'
    if (layerMode) store.arrange(sid, ids, up ? (e.altKey ? 'top' : 1) : (e.altKey ? 'bottom' : -1))
    else if (!isPageCanvas(sid)) emit('screen-action', up ? (e.altKey ? 'front' : 'forward') : (e.altKey ? 'back' : 'backward'))
    return
  }
  // 고르기 이동: Enter(안으로 · 텍스트면 고치기) · Shift+Enter(부모로) · Tab(다음 레이어)
  if (e.key === 'Enter' && native) {
    stop()
    if (e.shiftKey) { store.selectParent(sid); return }
    const n = ids.length === 1 ? store.node(sid, ids[0]!) : undefined
    if (n?.type === 'text') store.editing.value = n.id
    else if (n && n.type === 'vector') enterVectorEdit(sid, n.id)
    else store.selectChildren(sid)
    return
  }
  if (e.key === 'Tab' && native) { stop(); store.selectSibling(sid, e.shiftKey ? -1 : 1); return }
  // 화살표로 옮기기(Shift 10px)
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const a = arrows[e.key]
  if (a) {
    stop()
    const k = e.shiftKey ? 10 : 1
    if (layerMode) store.update(sid, ids, (n) => ({ x: n.x + a[0] * k, y: n.y + a[1] * k }))
    else emit('screen-action', 'nudge', a[0] * k, a[1] * k)
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') space.value = false
  if (e.key === 'Alt') altOn.value = false
}
const onBlur = () => { altOn.value = false; space.value = false }
function fitSelection() {
  const sid = store.screenId.value
  const s = props.screens.find((v) => v.id === sid)
  if (!s) return
  const boxes = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b) => !!b)
  if (!boxes.length) return fit([s.id])
  fitRect(Math.min(...boxes.map((b) => b!.x)), Math.min(...boxes.map((b) => b!.y)), Math.max(...boxes.map((b) => b!.x + b!.w)), Math.max(...boxes.map((b) => b!.y + b!.h)), 4)
}
defineExpose({ fit, zoomAt, fitSelection, insertInstance })

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
const worldMat = (s: ScreenRow, id: string) => mul(translate(s.x, s.y), layerMatrix(store.doc(s.id), id, (k) => layerSize(s.id, k)))
function parentWorld(s: ScreenRow, id: string): Mat {
  const d = store.doc(s.id)
  const p = d.nodes[id]?.parentId
  return p && d.nodes[p] ? worldMat(s, p) : translate(s.x, s.y)
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
const selFrame = computed(() => (selScreen.value && !isCanvas(selScreen.value) ? selScreen.value : null))
const multiBoxes = computed(() => multi.value.map((id) => props.screens.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
type Geom = NonNullable<ReturnType<typeof layerGeom>>
const selBoxes = computed<Geom[]>(() => {
  void tick.value
  const s = selScreen.value
  if (!s) return []
  return store.layerIds.value.map((id) => layerGeom(s, id)).filter((g): g is Geom => !!g)
})
const single = computed(() => {
  if (selBoxes.value.length !== 1 || store.editing.value) return null
  const b = selBoxes.value[0]!
  const n = store.node(selScreen.value!.id, b.id)
  return { ...b, locked: !!n?.locked, rotation: n?.rotation ?? 0 }
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
const hover = ref<{ sid: string; id: string | null } | null>(null)
function trackHover(e: PointerEvent) {
  if (altOn.value !== e.altKey) altOn.value = e.altKey
  const t = e.target as HTMLElement | null
  const scr = t?.closest?.('[data-screen]') as HTMLElement | null
  const next = scr?.dataset.screen ? { sid: scr.dataset.screen, id: (t!.closest('[data-layer]') as HTMLElement | null)?.dataset.layer ?? null } : null
  if (next?.sid !== hover.value?.sid || next?.id !== hover.value?.id) hover.value = next
  const r = el.value?.getBoundingClientRect()
  ptr.value = r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null
}

// ---------------------------------------------------------------------------
// 피그마식 표시: 마우스 올림 테두리 · 고른 레이어의 부모 점선 · 오토 레이아웃 간격
// 모두 바깥 층(화면 좌표)에 그려서 확대 · 축소와 상관없이 늘 1px
// ---------------------------------------------------------------------------
const ptr = ref<{ x: number; y: number } | null>(null)
const hoverOutline = computed(() => {
  void tick.value
  const h = hover.value
  if (!h || moving.value || marqueeOn.value || draft.value || guides.value || store.editing.value || (tool.value !== 'move' && tool.value !== 'scale')) return null
  const s = props.screens.find((v) => v.id === h.sid)
  if (!s) return null
  if (!h.id) {
    // 화면(프레임): 이미 고른 화면이면 선택 상자가 있으니 생략
    if (isCanvas(s) || (store.screenId.value === s.id && !store.layerIds.value.length) || multi.value.includes(s.id)) return null
    return { frame: s.id, style: box(s) }
  }
  if (store.screenId.value === s.id && store.layerIds.value.includes(h.id)) return null
  const n = store.node(s.id, h.id)
  if (!n || n.locked || n.type === 'line' || n.type === 'path') return null
  const g = layerGeom(s, h.id)
  if (!g) return null
  const z = vp.value.zoom
  const r = n.type === 'ellipse' ? '50%' : (() => { const v = radiiOf(n.style); return v.some(Boolean) ? v.map((x) => x * z + 'px').join(' ') : undefined })()
  return { frame: null, style: { ...rbox(g), borderRadius: r } }
})
/** 하나 고르면 그 부모(프레임 · 그룹, 맨 위면 화면)의 테두리를 점선으로 */
const parentOutline = computed(() => {
  void tick.value
  const sg = single.value
  const s = selScreen.value
  if (!sg || !s || rotating.value) return null
  const p = store.node(s.id, sg.id)?.parentId
  if (p) { const g = layerGeom(s, p); return g ? rbox(g) : null }
  return isCanvas(s) ? null : box(s)
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
  const out: { left: string; top: string; width: string; height: string; v: boolean }[] = []
  for (let i = 0; i + 1 < kids.length; i++) {
    const a = kids[i]!, b = kids[i + 1]!
    const s0 = v ? a.y + a.h : a.x + a.w, s1 = v ? b.y : b.x
    if (s1 - s0 < 1) continue
    out.push(v
      ? { left: f.x + 'px', top: s0 + 'px', width: f.w + 'px', height: s1 - s0 + 'px', v }
      : { left: s0 + 'px', top: f.y + 'px', width: s1 - s0 + 'px', height: f.h + 'px', v })
  }
  return out
})
const gapHot = computed(() => {
  const p = ptr.value
  return !!p && gapBands.value.some((b) => {
    const x = parseFloat(b.left), y = parseFloat(b.top)
    return p.x >= x && p.x <= x + parseFloat(b.width) && p.y >= y && p.y <= y + parseFloat(b.height)
  })
})
const measure = computed<Guides | null>(() => {
  void tick.value
  const s = selScreen.value
  const h = hover.value
  if (!altOn.value || !h || guides.value || !s || store.editing.value) return null
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
const shown = computed(() => guides.value ?? measure.value)
const sx = (v: number) => v * vp.value.zoom + vp.value.x
const sy = (v: number) => v * vp.value.zoom + vp.value.y
/** 간격 표시 양 끝 눈금 */
function ticks(l: { x1: number; y1: number; x2: number; y2: number }) {
  const horiz = Math.abs(l.y1 - l.y2) < Math.abs(l.x1 - l.x2)
  const k = 3
  return [[l.x1, l.y1], [l.x2, l.y2]].map(([x, y]) => (horiz ? { x1: sx(x!), y1: sy(y!) - k, x2: sx(x!), y2: sy(y!) + k } : { x1: sx(x!) - k, y1: sy(y!), x2: sx(x!) + k, y2: sy(y!) }))
}
/**
 * 캔버스 배경(피그마와 같아요): 평소엔 단색, 800% 이상 확대하면 1px 픽셀 격자가 아주 옅게 나와요.
 * 배경색은 페이지 설정(오른쪽 패널, 아무것도 안 골랐을 때)에서 바꿔요.
 */
const gridStyle = computed(() => {
  const z = vp.value.zoom
  const style: Record<string, string> = {}
  if (props.background) style.backgroundColor = props.background
  if (props.pixelGrid !== false && z >= 8) {
    const pos = `${vp.value.x}px ${vp.value.y}px`
    style.backgroundImage = 'linear-gradient(to right, var(--grid-pixel) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-pixel) 1px, transparent 1px)'
    style.backgroundSize = `${z}px ${z}px, ${z}px ${z}px`
    style.backgroundPosition = `${pos}, ${pos}`
  } else style.backgroundImage = 'none'
  return style
})
/** 확대 · 이동 중인지: 멈춘 뒤 160ms 가 지나면 false → 브라우저가 지금 배율로 다시 그려 흐림이 없어요 */
const moving = ref(false)
let movingTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [vp.value.x, vp.value.y, vp.value.zoom], () => {
  moving.value = true
  clearTimeout(movingTimer)
  movingTimer = setTimeout(() => (moving.value = false), 160)
})
/** 크기 숫자: 정수면 그대로, 아니면 소수 한 자리(피그마와 같아요) */
const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1))
/** 고른 텍스트가 글자 길이에 맞춰 늘어나는(Hug) 상태인지 */
const singleHug = computed(() => {
  const sid = store.screenId.value
  const id = store.layerIds.value.length === 1 ? store.layerIds.value[0] : null
  const n = sid && id ? store.node(sid, id) : null
  return !!n && n.type === 'text' && !!n.style.autoWidth
})
// 파일 끌어 놓기(이미지 · SVG)
function onDragOver(e: DragEvent) { if (e.dataTransfer) e.dataTransfer.dropEffect = [...e.dataTransfer.types].some((t) => t === 'Files' || t === DS_DRAG) ? 'copy' : 'none' }
function onDrop(e: DragEvent) {
  dropAt.value = null
  // 디자인 시스템 컴포넌트 끌어 놓기 → 인스턴스(놓은 자리, Iris 화면 위면 그 안 · 가장 안쪽 프레임으로)
  const comp = e.dataTransfer?.getData(DS_DRAG)
  if (comp) { insertInstance(comp, toWorld(e.clientX, e.clientY)); return }
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!files.length) return
  const w = toWorld(e.clientX, e.clientY)
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
const FULL_WIDTH = new Set(['BottomSheet', 'BottomBar', 'TopBar', 'NavBarTop', 'ListCommon', 'TextInput', 'TextArea', 'SearchField', 'ButtonGroup', 'Tab', 'NoticeBox', 'Divider', 'Footer', 'StatusBar'])
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
  const full = FULL_WIDTH.has(component)
  const pw = parentId ? store.node(target.id, parentId)?.w : scr ? scr.width : 375
  // 가운데에 여러 번 넣으면 조금씩 비켜서
  const nudge = at ? 0 : (Object.values(store.doc(target.id).nodes).filter((n) => n.type === 'instance').length % 8) * 16
  store.add(target.id, parentId, { type: 'instance', name: component, component, props: {}, x: full ? 0 : Math.round(lx - p.x + nudge), y: Math.round(ly - p.y + nudge), w: full ? pw ?? 375 : 120, h: 48, sizeH: full ? undefined : 'hug', sizeV: 'hug' })
  tool.value = 'move'
}
/** 화면(프레임) 자체의 모양: 채우기 · 선(안쪽) · 모서리 · 투명도 · 내용 자르기 */
const frameImg = useImageSrc()
const frameLook = (s: ScreenRow) => (s.source === 'native' ? frameCss(store.doc(s.id).frame, store.color, frameImg) : {})
const marqueeOn = ref(false)
const cursor = computed(() => (panning.value ? 'grabbing' : space.value || tool.value === 'hand' ? 'grab' : tool.value === 'move' || tool.value === 'scale' ? 'default' : tool.value === 'text' ? 'text' : 'crosshair'))
</script>

<template>
  <main
    ref="el"
    aria-label="Canvas"
    class="canvas canvas-dots"
    :style="{ cursor, ...gridStyle }"
    @pointerdown.self="start($event)"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @dragover.prevent="onDragOver($event); onFileDragOver($event)"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @contextmenu="onContext"
    @dblclick="onDblAny"
  >
    <div class="world" :class="{ moving }" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, '--z': vp.zoom }">
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
        :style="{ left: s.x + 'px', top: s.y + 'px', width: s.width + 'px', height: s.height + 'px', cursor: space || panning ? 'inherit' : cursor, ...frameLook(s) }"
        :aria-label="`${s.name} 화면`"
        @pointerdown.stop="start($event, s)"
      >
        <img v-if="s.thumbnail_path && s.source === 'figma'" :src="s.thumbnail_path" alt="" draggable="false" class="thumb">
        <template v-else>
          <LayerView v-for="id in store.doc(s.id).rootIds" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
          <GridOverlay v-if="store.doc(s.id).frame?.grids" :grids="store.doc(s.id).frame?.grids" :w="s.width" :h="s.height" />
        </template>
      </div>
      <!-- 캔버스 위(화면 밖) 레이어: 화면들 위에 그려요 -->
      <div v-if="canvasDoc" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)">
        <LayerView v-for="id in canvasRoots.over" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
      <!-- 화면 밖으로 끄는 레이어: 잘리지 않게 맨 위에 -->
      <div v-if="ghost" class="ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }">
        <div v-for="g in ghost.items" :key="g.id" class="ghost-at" :style="{ left: g.x + 'px', top: g.y + 'px' }">
          <LayerView :doc="store.doc(ghost.sid)" :id="g.id" :screen-id="ghost.sid" ghost />
        </div>
      </div>
      <!-- 파일 끌어 놓을 자리 -->
      <div v-if="dropAt" class="drop-at" :class="{ line: dropLine }" :style="{ left: dropAt.x + 'px', top: dropAt.y + 'px', width: dropAt.w + 'px', height: dropAt.h + 'px' }" />
 <div v-if="draft && !marqueeOn" class="draft" :style="{ left: draft.x + 'px', top: draft.y + 'px', width: draft.width + 'px', height: draft.height + 'px' }" />
    </div>

    <div class="overlay" aria-hidden="true">
      <span
        v-for="s in realScreens"
        :key="'l' + s.id"
        class="label"
        :data-screen="s.id"
        :class="{ on: (store.screenId.value === s.id && !store.layerIds.value.length) || hoverOutline?.frame === s.id }"
        :style="{ left: box(s).left, top: `calc(${box(s).top} - 20px)`, maxWidth: box(s).width }"
        @pointerdown.stop="tool = 'move'; start($event, s)"
      >{{ s.name }}</span>
      <div v-if="parentOutline" class="parent" :style="parentOutline" />
      <template v-if="gapHot"><div v-for="(b, i) in gapBands" :key="'gap' + i" class="gap" :class="{ v: b.v }" :style="b"><i /></div></template>
      <div v-if="hoverOutline && !gapHot" class="hov" :style="hoverOutline.style" />
      <div v-for="id in highlight ?? []" :key="'h' + id" class="hl" :style="screens.find((s) => s.id === id) ? box(screens.find((s) => s.id === id)!) : { display: 'none' }" />
      <div v-for="m in multiBoxes" :key="'m' + m.id" class="sel" :style="box(m)" />
      <div v-if="selFrame && !multi.length && !selBoxes.length" class="sel" :style="box(selFrame)">
        <template v-if="!selBoxes.length">
          <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startScreenResize($event, h)" />
          <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" @pointerdown.stop.prevent="startScreenResize($event, c)" />
          <span class="size">{{ fmt(selFrame.width) }} × {{ fmt(selFrame.height) }}</span>
        </template>
      </div>
      <div v-for="b in selBoxes" :key="'s' + b.id" class="sel" :style="rbox(b)" />
      <!-- 여러 개 고름: 전체를 감싸는 상자(손잡이로 함께 크기 바꾸기) + 크기 -->
      <div v-if="selBoxes.length > 1 && selWorld && !multi.length" class="sel group" :style="box({ x: selWorld.x, y: selWorld.y, width: selWorld.w, height: selWorld.h })">
        <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startResizeMany($event, h)" />
        <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, 0) }" @pointerdown.stop.prevent="startResizeMany($event, c)" />
        <span class="size">{{ fmt(selWorld.w) }} × {{ fmt(selWorld.h) }}</span>
      </div>
      <template v-if="single">
        <div class="sel none" :style="rbox(single)">
          <template v-if="!single.locked">
            <span v-for="c in CORNERS" :key="'r' + c" :class="['rot', 'at-' + c]" @pointerdown.stop.prevent="startRotate($event)" />
            <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, single.angle) }" @pointerdown.stop.prevent="startResize($event, h)" />
            <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, single.angle) }" @pointerdown.stop.prevent="startResize($event, c)" />
          </template>
        </div>
        <span class="size below" :style="belowBox(single)">
          <template v-if="rotating">{{ fmt(single.rotation) }}°</template>
          <template v-else>{{ fmt(single.w) }}<span v-if="singleHug" class="mode">Hug</span> × {{ fmt(single.h) }}<span v-if="singleHug" class="mode">Hug</span></template>
        </span>
      </template>
      <svg v-if="shown" class="guides" width="100%" height="100%">
        <template v-for="(l, i) in shown.lines" :key="i">
          <line :x1="sx(l.x1)" :y1="sy(l.y1)" :x2="sx(l.x2)" :y2="sy(l.y2)" :stroke-dasharray="l.dash ? '3 3' : undefined" />
          <template v-if="l.tick"><line v-for="(t, j) in ticks(l)" :key="j" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" /></template>
        </template>
      </svg>
      <template v-if="shown"><span v-for="(lb, i) in shown.labels" :key="'g' + i" class="glabel" :style="{ left: sx(lb.x) + 'px', top: sy(lb.y) + 'px' }">{{ lb.text }}</span></template>
      <div v-if="draft && !marqueeOn" class="sel" :style="box(draft)"><span class="size">{{ fmt(draft.width) }} × {{ fmt(draft.height) }}</span></div>
      <div v-if="draft && marqueeOn" class="marq" :style="box(draft)" />
      <!-- 펜 미리보기 -->
      <svg v-if="penView" class="pen" width="100%" height="100%">
        <path :d="penView.d" class="pp" />
        <path v-if="penView.rubber" :d="penView.rubber" class="pr" />
        <template v-for="(q, k) in penView.pts" :key="k">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3" class="hd" /><circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3" class="hd" />
          <rect :x="q.a.x - 3.5" :y="q.a.y - 3.5" width="7" height="7" class="an" :class="{ first: k === 0 }" />
        </template>
      </svg>
      <!-- 벡터 점 편집 -->
      <svg v-if="vhandles" class="vedit" width="100%" height="100%">
        <template v-for="q in vhandles" :key="q.pi + ':' + q.qi">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'i')" />
          <circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'o')" />
          <rect :x="q.a.x - 4" :y="q.a.y - 4" width="8" height="8" class="an" :class="{ on: vedit?.sel?.[0] === q.pi && vedit?.sel?.[1] === q.qi }" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'a')" />
        </template>
      </svg>
      <svg v-if="draftPts" class="guides draw" width="100%" height="100%"><polyline :points="draftPts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')" /></svg>
    </div>
    <CanvasRulers :vp="vp" :guides="props.guides ?? { x: [], y: [] }" :sel="selWorld" :rulers="rulersShown" @change="(g) => emit('guides', g)" />
  </main>
</template>

<style scoped>
.canvas { --grid-pixel: var(--iris-grid-pixel); --iris-select: #0D99FF; --iris-measure: #F24822; position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none;  }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
/* 움직이는 동안만 GPU 층으로(부드럽게), 멈추면 풀어서 확대 비율대로 다시 그려요 — 글자 · 도형이 늘 선명한 벡터 */
.world.moving { will-change: transform; }
.free { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none; }
.free :deep(.ly:not(.lk)) { pointer-events: auto; }
.frame { position: absolute; pointer-events: auto; background: var(--iris-paper); overflow: hidden; outline: none; }
/* 피그마처럼 기본 테두리 · 그림자 없음. 마우스를 올리면 얇은 파란 선(확대와 상관없이 1px) */
.ghost { position: absolute; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: 3; }
.ghost-at { position: absolute; width: 0; height: 0; overflow: visible; }
.ghost :deep(.ly) { pointer-events: none !important; }
.drop-at.line { outline-width: calc(1.5px / var(--z, 1)); background: none; }
.drop-at { position: absolute; pointer-events: none; outline: calc(2px / var(--z, 1)) solid var(--iris-select); background: color-mix(in srgb, var(--iris-select) 6%, transparent); z-index: 4; }
.thumb { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; pointer-events: none; }
.draft { position: absolute; background: color-mix(in srgb, var(--iris-select) 8%, transparent); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.label { position: absolute; pointer-events: auto; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.label.on { color: var(--iris-select); font-weight: 500; }
.sel { position: absolute; box-shadow: 0 0 0 1px var(--iris-select); }
/* 마우스 올림: 모양(둥근 모서리 · 원)을 따라 1px */
.hov { position: absolute; pointer-events: none; box-shadow: 0 0 0 1px var(--iris-select); }
/* 고른 레이어의 부모: 옅은 1px 점선 */
.parent { position: absolute; pointer-events: none; outline: 1px dashed color-mix(in srgb, var(--iris-select) 70%, transparent); }
/* 오토 레이아웃 간격: 분홍 빗금 + 가운데 짧은 손잡이 선 */
.gap { position: absolute; pointer-events: none; display: grid; place-items: center; background: repeating-linear-gradient(-45deg, rgb(242 72 156 / 32%) 0 1px, transparent 1px 4px), rgb(242 72 156 / 8%); }
.gap i { width: 8px; height: 1px; background: rgb(242 72 156); }
.gap:not(.v) i { width: 1px; height: 8px; }
.sel.dim { box-shadow: 0 0 0 1px color-mix(in srgb, var(--iris-select) 45%, transparent); }
.sel.none { box-shadow: none; }
.hl { position: absolute; box-shadow: 0 0 0 2px var(--iris-select); background: color-mix(in srgb, var(--iris-select) 6%, transparent); }
.handle.live { pointer-events: auto; width: 6px; height: 6px; box-shadow: 0 0 0 1px var(--iris-select); }
/* 보이는 건 6px, 잡는 범위는 14px */
.handle.live::after { content: ""; position: absolute; inset: -4px; }
.handle.at-nw { left: -3px; top: -3px; cursor: nwse-resize; }
.handle.at-se { right: -3px; bottom: -3px; cursor: nwse-resize; }
.handle.at-ne { right: -3px; top: -3px; cursor: nesw-resize; }
.handle.at-sw { left: -3px; bottom: -3px; cursor: nesw-resize; }
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
.pen .pp { fill: none; stroke: var(--iris-select); stroke-width: 1.5; }
.pen .pr { fill: none; stroke: var(--iris-select); stroke-width: 1; stroke-dasharray: 3 3; }
.pen .hl, .vedit .hl { stroke: var(--iris-select); stroke-width: 1; }
.pen .hd, .vedit .hd { fill: #FFFFFF; stroke: var(--iris-select); stroke-width: 1; }
.pen .an, .vedit .an { fill: #FFFFFF; stroke: var(--iris-select); stroke-width: 1; }
.pen .an.first { fill: var(--iris-select); }
.vedit .an, .vedit .hd { pointer-events: auto; cursor: default; }
.vedit .an.on { fill: var(--iris-select); }
.guides.draw polyline { fill: none; stroke: var(--iris-select); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.guides line { stroke: var(--iris-measure); stroke-width: 1; shape-rendering: crispEdges; }
/* 간격 · 맞춤선 숫자: 피그마처럼 빨간 바탕 흰 글자(라이트 · 다크 같음) */
.glabel { position: absolute; transform: translate(-50%, -50%); padding: 0 4px; border-radius: 3px; background: var(--iris-measure); color: #FFFFFF; font-family: var(--font-family-base); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; pointer-events: none; }
/* 크기 표시: 파란 바탕, 넉넉한 안쪽 여백, 크기 방식(Hug) 표시 */
.size { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 6px; padding: 0 4px; border-radius: 3px; background: var(--iris-select); color: #FFFFFF; font-family: var(--font-family-base); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; }
.size .mode { font-weight: 500; opacity: .8; margin-left: 2px; }
.marq { position: absolute; box-shadow: 0 0 0 1px var(--iris-select); background: color-mix(in srgb, var(--iris-select) 8%, transparent); }
</style>
