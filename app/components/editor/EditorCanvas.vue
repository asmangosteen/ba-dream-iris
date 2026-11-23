<script setup lang="ts">
import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import type { LayerType } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import LayerView from '~/components/editor/LayerView.vue'

/**
 * 무한 캔버스 + 화면 안 레이어 편집.
 * - 이동: 빈 곳 드래그 · 스페이스+드래그 · 가운데 버튼 · 트랙패드 스크롤 / 확대: ⌘·Ctrl+휠 · 핀치 · 단축키
 * - 화면: 고르기 · 끌어 옮기기, 빈 곳에 프레임 도구 → 새 화면
 * - 레이어: 고르기(Shift 여러 개) · 끌어 옮기기 · 모서리로 크기 · 두 번 눌러 글자 고치기, 화면 안에 사각형 · 프레임 · 텍스트 그리기
 * 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y). 레이어 좌표는 화면(또는 부모 프레임) 왼쪽 위 기준
 */
export interface Viewport { x: number; y: number; zoom: number }

const props = defineProps<{ screens: ScreenRow[]; highlight?: string[] }>()
const tool = defineModel<Tool>('tool', { required: true })
const vp = defineModel<Viewport>('viewport', { required: true })
const emit = defineEmits<{
  move: [id: string, x: number, y: number, done: boolean]
  create: [rect: { x: number; y: number; width: number; height: number }]
  hint: [text: string]
  /** 화면(프레임) 단위 동작 — 레이어를 고르지 않고 화면만 골랐을 때 */
  'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge', dx?: number, dy?: number]
}>()
const store = useLayerStore()

const el = ref<HTMLElement | null>(null)
const space = ref(false)
const panning = ref(false)
const draft = ref<{ x: number; y: number; width: number; height: number } | null>(null) // 캔버스 좌표

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
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'screen'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'draw'; wx: number; wy: number; moved: boolean }
  | { kind: 'layers'; sid: string; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; before: string; moved: boolean }
  | { kind: 'resize'; sid: string; id: string; corner: Corner; sx: number; sy: number; o: { x: number; y: number; w: number; h: number }; before: string; moved: boolean }
  | { kind: 'drawLayer'; sid: string; type: LayerType; parentId: string | null; px: number; py: number; lx: number; ly: number; moved: boolean }
  | { kind: 'marquee'; sid: string; wx: number; wy: number; base: string[]; moved: boolean }
  | { kind: 'marqueeCanvas'; wx: number; wy: number; moved: boolean }
  | { kind: 'screens'; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; moved: boolean }
let drag: Drag | null = null

const isNative = (s: ScreenRow) => s.source === 'native'
const isCanvas = (s: { id: string }) => isPageCanvas(s.id)
const realScreens = computed(() => props.screens.filter((s) => !isCanvas(s)))
const canvasDoc = computed(() => props.screens.find(isCanvas) ?? null)
function toggleMulti(id: string) {
  const cur = multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) && store.screenId.value !== id ? [store.screenId.value] : []
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
}
/** 상자 선택 · Shift 클릭으로 함께 고른 화면들(첫 번째가 store.screenId) */
const multi = ref<string[]>([])
watch(() => store.screenId.value, (id) => { if (!id || !multi.value.includes(id)) multi.value = [] })
const drawType = (t: Tool): LayerType | null => (t === 'rect' ? 'rect' : t === 'text' ? 'text' : t === 'frame' ? 'frame' : null)

/** 화면 안 좌표에서, 그 위치를 품는 가장 안쪽 프레임 레이어 */
function frameAt(sid: string, lx: number, ly: number): string | null {
  const d = store.doc(sid)
  let found: string | null = null
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const n = d.nodes[id]
      if (!n || n.type !== 'frame' || n.hidden || n.locked) continue
      const p = store.absPos(sid, id)
      if (lx >= p.x && ly >= p.y && lx <= p.x + n.w && ly <= p.y + n.h) { found = id; walk(n.children ?? []) }
    }
  }
  walk(d.rootIds)
  return found
}

function start(e: PointerEvent, screen?: ScreenRow) {
  if (e.button !== 0 && e.button !== 1) return
  if (store.editing.value) (document.activeElement as HTMLElement | null)?.blur?.()
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  // 캔버스 위 레이어 층에서 레이어가 아닌 곳을 누르면 빈 캔버스와 같아요
  if (screen && isCanvas(screen) && !(e.target as HTMLElement).closest('[data-layer]')) screen = undefined
  if (e.button === 1 || space.value || tool.value === 'hand') {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.value.x, vy: vp.value.y, moved: false }
    panning.value = true
    return
  }
  const t = drawType(tool.value)
  // 빈 캔버스에 프레임 도구 → 새 화면
  if (!screen) {
    const w = toWorld(e.clientX, e.clientY)
    // 프레임 도구 → 새 화면
    if (tool.value === 'frame') { drag = { kind: 'draw', wx: w.x, wy: w.y, moved: false }; return }
    // 사각형 · 텍스트 등 → 캔버스 위에 바로(페이지 레이어)
    if (t && canvasDoc.value) {
      const cid = canvasDoc.value.id
      const parentId = frameAt(cid, w.x, w.y)
      const p = parentId ? store.absPos(cid, parentId) : { x: 0, y: 0 }
      drag = { kind: 'drawLayer', sid: cid, type: t, parentId, px: p.x, py: p.y, lx: w.x, ly: w.y, moved: false }
      return
    }
    // 이동 도구 → 상자 선택 (피그마와 같아요. 화면 이동은 스페이스 · 손 도구 H · 스크롤)
    if (tool.value === 'move') { drag = { kind: 'marqueeCanvas', wx: w.x, wy: w.y, moved: false }; marqueeOn.value = true; return }
    return
  }
  const w = toWorld(e.clientX, e.clientY)
  const lx = w.x - screen.x, ly = w.y - screen.y
  // 화면 안에 그리기
  if (t) {
    if (!isNative(screen)) { emit('hint', '피그마 화면은 피그마에서 고쳐요'); tool.value = 'move'; return }
    const parentId = frameAt(screen.id, lx, ly)
    const p = parentId ? store.absPos(screen.id, parentId) : { x: 0, y: 0 }
    drag = { kind: 'drawLayer', sid: screen.id, type: t, parentId, px: p.x, py: p.y, lx, ly, moved: false }
    return
  }
  if (tool.value !== 'move') return
  // 레이어 고르기 · 끌기
  const layerEl = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
  const lid = layerEl?.dataset.layer
  if (lid && isNative(screen)) {
    if (e.shiftKey) { store.selectLayer(screen.id, lid, true); return }
    if (!(store.screenId.value === screen.id && store.layerIds.value.includes(lid))) store.selectLayer(screen.id, lid)
    if (e.altKey) store.duplicateInPlace() // ⌥ 끌기: 복제해서 옮기기
    const d = store.doc(screen.id)
    const ids = store.layerIds.value.filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
    drag = { kind: 'layers', sid: screen.id, ids, sx: e.clientX, sy: e.clientY, orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])), before: store.begin(screen.id), moved: false }
    return
  }
  // Shift + 화면 빈 곳 끌기: 상자 안의 레이어 고르기
  if (e.shiftKey && isNative(screen)) {
    const base = store.screenId.value === screen.id ? [...store.layerIds.value] : []
    if (store.screenId.value !== screen.id) store.selectScreen(screen.id)
    drag = { kind: 'marquee', sid: screen.id, wx: w.x, wy: w.y, base, moved: false }
    marqueeOn.value = true
    return
  }
  // Shift+클릭: 화면 여러 개 고르기 · 고른 화면들 함께 옮기기
  if (e.shiftKey && !isCanvas(screen)) {
    const cur = multi.value.length ? multi.value : store.screenId.value && !isCanvas({ id: store.screenId.value }) ? [store.screenId.value] : []
    const next = cur.includes(screen.id) ? cur.filter((x) => x !== screen.id) : [...cur, screen.id]
    if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
    return
  }
  if (multi.value.length > 1 && multi.value.includes(screen.id)) {
    const orig = Object.fromEntries(multi.value.map((id) => { const v = props.screens.find((x) => x.id === id)!; return [id, { x: v.x, y: v.y }] }))
    drag = { kind: 'screens', ids: [...multi.value], sx: e.clientX, sy: e.clientY, orig, moved: false }
    return
  }
  store.selectScreen(screen.id)
  drag = { kind: 'screen', id: screen.id, sx: e.clientX, sy: e.clientY, ox: screen.x, oy: screen.y, moved: false }
}

function startResize(e: PointerEvent, corner: Corner) {
  const sid = store.screenId.value
  const id = store.layerIds.value[0]
  if (!sid || !id) return
  const n = store.node(sid, id)
  if (!n) return
  try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
  drag = { kind: 'resize', sid, id, corner, sx: e.clientX, sy: e.clientY, o: { x: n.x, y: n.y, w: n.w, h: n.h }, before: store.begin(sid), moved: false }
}

function move(e: PointerEvent) {
  if (!drag) return
  const z = vp.value.zoom
  if (drag.kind === 'pan') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    vp.value = { ...vp.value, x: drag.vx + dx, y: drag.vy + dy }
  } else if (drag.kind === 'screen') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    drag.moved = true
    emit('move', drag.id, Math.round(drag.ox + dx / z), Math.round(drag.oy + dy / z), false)
  } else if (drag.kind === 'layers') {
    let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 3) return
    drag.moved = true
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 } // Shift: 가로나 세로로만
    const d = store.doc(drag.sid)
    for (const id of drag.ids) { const n = d.nodes[id]; if (n) { n.x = Math.round(drag.orig[id]!.x + dx); n.y = Math.round(drag.orig[id]!.y + dy) } }
  } else if (drag.kind === 'resize') {
    const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
    drag.moved = true
    const o = drag.o
    let { x, y, w, h } = o
    if (drag.corner.includes('e')) w = o.w + dx
    if (drag.corner.includes('s')) h = o.h + dy
    if (drag.corner.includes('w')) { w = o.w - dx; x = o.x + dx }
    if (drag.corner.includes('n')) { h = o.h - dy; y = o.y + dy }
    if (e.shiftKey && o.w && o.h) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; if (drag.corner.includes('w')) x = o.x + o.w - w; if (drag.corner.includes('n')) y = o.y + o.h - h }
    if (w < 1) { x += w - 1; w = 1 }
    if (h < 1) { y += h - 1; h = 1 }
    const n = store.node(drag.sid, drag.id)
    if (n) { Object.assign(n, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }); if (n.type === 'text') n.style.autoWidth = false }
  } else if (drag.kind === 'draw') {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
    drag.moved = true
    draft.value = { x: Math.round(Math.min(w.x, drag.wx)), y: Math.round(Math.min(w.y, drag.wy)), width: Math.round(Math.abs(w.x - drag.wx)), height: Math.round(Math.abs(w.y - drag.wy)) }
  } else if (drag.kind === 'screens') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    drag.moved = true
    for (const id of drag.ids) emit('move', id, Math.round(drag.orig[id]!.x + dx / z), Math.round(drag.orig[id]!.y + dy / z), false)
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
  if (d.kind === 'pan' && !d.moved && e.target === el.value) store.selectScreen(null)
  if (d.kind === 'screen' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('move', d.id, s.x, s.y, true)
  }
  if ((d.kind === 'layers' || d.kind === 'resize') && d.moved) store.commit(d.sid, d.before)
  if (d.kind === 'marquee') { draft.value = null; marqueeOn.value = false; if (!d.moved) toggleMulti(d.sid) }
  if (d.kind === 'marqueeCanvas') { draft.value = null; marqueeOn.value = false; if (!d.moved) { store.selectScreen(null); multi.value = [] } }
  if (d.kind === 'screens' && d.moved) for (const id of d.ids) { const v = props.screens.find((x) => x.id === id); if (v) emit('move', id, v.x, v.y, true) }
  if (d.kind === 'draw') {
    const rect = d.moved && draft.value && draft.value.width >= 16 && draft.value.height >= 16 ? draft.value : { x: Math.round(d.wx), y: Math.round(d.wy), width: 375, height: 812 }
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
      const id = store.add(d.sid, d.parentId, { type: 'text', text: '텍스트', x: Math.round(d.lx - d.px), y: Math.round(d.ly - d.py), w: big ? r!.width : 60, h: 24, style: big ? { autoWidth: false } : {} })
      store.editing.value = id
      return
    }
    const size = d.type === 'frame' ? { w: 200, h: 200 } : { w: 100, h: 100 }
    const x = big ? r!.x - s.x - d.px : Math.round(d.lx - d.px - size.w / 2)
    const y = big ? r!.y - s.y - d.py : Math.round(d.ly - d.py - size.h / 2)
    store.add(d.sid, d.parentId, { type: d.type, x, y, w: big ? r!.width : size.w, h: big ? r!.height : size.h })
  }
}

function onDbl(e: MouseEvent, screen: ScreenRow) {
  const lid = ((e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null)?.dataset.layer
  if (!lid || !isNative(screen)) return
  const n = store.node(screen.id, lid)
  if (n?.type === 'text' && !n.locked) { store.selectLayer(screen.id, lid); store.editing.value = lid }
}

// ---------------------------------------------------------------------------
// 단축키
// ---------------------------------------------------------------------------
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')
/**
 * 피그마와 같은 단축키. 레이어를 골랐으면 레이어에, 화면만 골랐으면 화면에 적용합니다.
 * 이동 V · 프레임 F/A · 사각형 R · 텍스트 T 는 EditorToolbar 가 받습니다.
 */
function onKeyDown(e: KeyboardEvent) {
  if (typing(e)) return
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  const sid = store.screenId.value
  const ids = store.layerIds.value
  const screen = props.screens.find((v) => v.id === sid)
  const native = !!screen && isNative(screen)
  const layerMode = !!sid && ids.length > 0
  const stop = () => e.preventDefault()

  if (e.code === 'Space') { space.value = true; stop(); return }
  // 실행취소 · 확대
  if (mod && key === 'z') { stop(); if (e.shiftKey) store.redo(); else store.undo(); return }
  if (mod && key === 'y') { stop(); store.redo(); return }
  if (mod && (e.key === '=' || e.key === '+')) { stop(); zoomAt(vp.value.zoom * 1.25); return }
  if (mod && e.key === '-') { stop(); zoomAt(vp.value.zoom / 1.25); return }
  if (mod && e.key === '0') { stop(); zoomAt(1); return }
  if (e.shiftKey && !mod && e.code === 'Digit1') { fit(); return }
  if (e.shiftKey && !mod && e.code === 'Digit2' && sid) { fitSelection(); return }
  if (e.shiftKey && !mod && e.code === 'Digit0') { zoomAt(1); return }
  // 속성 복사 · 붙여넣기 ⌥⌘C / ⌥⌘V
  if (mod && e.altKey && e.code === 'KeyC') { if (layerMode && store.copyStyle()) { stop(); emit('hint', '속성을 복사했어요') } return }
  if (mod && e.altKey && e.code === 'KeyV') { if (layerMode) { stop(); store.pasteStyle() } return }
  // 복사 · 잘라내기 · 붙여넣기 · 복제
  if (mod && key === 'c') { if (layerMode ? store.copy() : sid ? (emit('screen-action', 'copy'), true) : false) stop(); return }
  if (mod && key === 'x') { if (layerMode && store.copy()) { stop(); store.remove(sid!, ids) } return }
  if (mod && key === 'v') {
    stop()
    if (native && store.hasClipboard()) store.paste()
    else emit('screen-action', 'paste')
    return
  }
  if (mod && key === 'd') { stop(); if (layerMode) store.duplicate(); else if (sid) emit('screen-action', 'duplicate'); return }
  // 모두 고르기 ⌘A
  if (mod && key === 'a') { if (native) { stop(); store.selectAll(sid!) } return }
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
  if (layerMode && mod && e.key === ']') { stop(); store.arrange(sid, ids, e.altKey ? 'top' : 1); return }
  if (layerMode && mod && e.key === '[') { stop(); store.arrange(sid, ids, e.altKey ? 'bottom' : -1); return }
  // 고르기 이동: Enter(안으로 · 텍스트면 고치기) · Shift+Enter(부모로) · Tab(다음 레이어)
  if (e.key === 'Enter' && native) {
    stop()
    if (e.shiftKey) { store.selectParent(sid); return }
    const n = ids.length === 1 ? store.node(sid, ids[0]!) : undefined
    if (n?.type === 'text') store.editing.value = n.id
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
function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') space.value = false }
function fitSelection() {
  const sid = store.screenId.value
  const s = props.screens.find((v) => v.id === sid)
  if (!s) return
  const boxes = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b) => !!b)
  if (!boxes.length) return fit([s.id])
  fitRect(Math.min(...boxes.map((b) => b!.x)), Math.min(...boxes.map((b) => b!.y)), Math.max(...boxes.map((b) => b!.x + b!.w)), Math.max(...boxes.map((b) => b!.y + b!.h)), 4)
}
defineExpose({ fit, zoomAt, fitSelection })

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
})
onBeforeUnmount(() => {
  el.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
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
/** 레이어의 캔버스 좌표 상자. 글자 길이에 맞추는 텍스트는 실제 그려진 크기를 씁니다 */
function layerWorld(s: ScreenRow, id: string) {
  const n = store.node(s.id, id)
  if (!n) return null
  const p = store.absPos(s.id, id)
  let w = n.w, h = n.h
  if (n.type === 'text' && import.meta.client) {
    const node = el.value?.querySelector(`[data-screen="${s.id}"] [data-layer="${id}"]`) as HTMLElement | null
    if (node) { w = node.offsetWidth; h = node.offsetHeight }
  }
  return { x: s.x + p.x, y: s.y + p.y, w, h }
}
const tick = ref(0) // 텍스트 크기 다시 재기
watch(() => [store.docs, store.editing.value], () => nextTick(() => tick.value++), { deep: true })
const selScreen = computed(() => props.screens.find((s) => s.id === store.screenId.value) ?? null)
const selFrame = computed(() => (selScreen.value && !isCanvas(selScreen.value) ? selScreen.value : null))
const multiBoxes = computed(() => multi.value.map((id) => props.screens.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
const selBoxes = computed(() => {
  void tick.value
  const s = selScreen.value
  if (!s) return []
  return store.layerIds.value.map((id) => ({ id, b: layerWorld(s, id) })).filter((x) => x.b).map((x) => ({ id: x.id, ...x.b! }))
})
const single = computed(() => {
  if (selBoxes.value.length !== 1 || store.editing.value) return null
  const b = selBoxes.value[0]!
  return { ...b, locked: !!store.node(selScreen.value!.id, b.id)?.locked }
})
const marqueeOn = ref(false)
const cursor = computed(() => (panning.value ? 'grabbing' : space.value || tool.value === 'hand' ? 'grab' : tool.value === 'move' ? 'default' : tool.value === 'text' ? 'text' : 'crosshair'))
</script>

<template>
  <main
    ref="el"
    aria-label="캔버스"
    class="canvas canvas-dots"
    :style="{ cursor, backgroundPosition: `${vp.x}px ${vp.y}px`, backgroundSize: `${24 * vp.zoom}px ${24 * vp.zoom}px` }"
    @pointerdown.self="start($event)"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
  >
    <div class="world" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, '--z': vp.zoom }">
      <div
        v-for="s in realScreens"
        :key="s.id"
        class="frame"
        role="button"
        tabindex="-1"
        :data-screen="s.id"
        :style="{ left: s.x + 'px', top: s.y + 'px', width: s.width + 'px', height: s.height + 'px', cursor: space || panning ? 'inherit' : cursor }"
        :aria-label="`${s.name} 화면`"
        @pointerdown.stop="start($event, s)"
        @dblclick="onDbl($event, s)"
      >
        <img v-if="s.thumbnail_path && s.source === 'figma'" :src="s.thumbnail_path" alt="" draggable="false" class="thumb">
        <template v-else>
          <LayerView v-for="id in store.doc(s.id).rootIds" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
        </template>
      </div>
      <!-- 캔버스 위(화면 밖) 레이어: 화면들 위에 그려요 -->
      <div v-if="canvasDoc" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)" @dblclick="onDbl($event, canvasDoc)">
        <LayerView v-for="id in store.doc(canvasDoc.id).rootIds" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
 <div v-if="draft && !marqueeOn" class="draft" :style="{ left: draft.x + 'px', top: draft.y + 'px', width: draft.width + 'px', height: draft.height + 'px' }" />
    </div>

    <div class="overlay" aria-hidden="true">
      <span
        v-for="s in realScreens"
        :key="'l' + s.id"
        class="label"
        :class="{ on: store.screenId.value === s.id }"
        :style="{ left: box(s).left, top: `calc(${box(s).top} - 20px)`, maxWidth: box(s).width }"
        @pointerdown.stop="tool = 'move'; start($event, s)"
      >{{ s.name }}</span>
      <div v-for="id in highlight ?? []" :key="'h' + id" class="hl" :style="screens.find((s) => s.id === id) ? box(screens.find((s) => s.id === id)!) : { display: 'none' }" />
      <div v-for="m in multiBoxes" :key="'m' + m.id" class="sel" :style="box(m)" />
      <div v-if="selFrame && !multi.length" class="sel" :class="{ dim: selBoxes.length }" :style="box(selFrame)">
        <template v-if="!selBoxes.length">
          <span class="handle" style="left: -4px; top: -4px" /><span class="handle" style="right: -4px; top: -4px" />
          <span class="handle" style="left: -4px; bottom: -4px" /><span class="handle" style="right: -4px; bottom: -4px" />
          <span class="size num">{{ Math.round(selFrame.width) }} × {{ Math.round(selFrame.height) }}</span>
        </template>
      </div>
      <div v-for="b in selBoxes" :key="'s' + b.id" class="sel" :style="box({ x: b.x, y: b.y, width: b.w, height: b.h })" />
      <div v-if="single" class="sel none" :style="box({ x: single.x, y: single.y, width: single.w, height: single.h })">
        <template v-if="!single.locked">
          <span v-for="c in (['nw', 'ne', 'sw', 'se'] as const)" :key="c" :class="['handle', 'live', c]" @pointerdown.stop.prevent="startResize($event, c)" />
        </template>
        <span class="size num">{{ Math.round(single.w) }} × {{ Math.round(single.h) }}</span>
      </div>
      <div v-if="draft && !marqueeOn" class="sel" :style="box(draft)"><span class="size num">{{ draft.width }} × {{ draft.height }}</span></div>
      <div v-if="draft && marqueeOn" class="marq" :style="box(draft)" />
    </div>
  </main>
</template>

<style scoped>
.canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; background-image: radial-gradient(circle, var(--ref-color-gray-900-10) 1px, transparent 1.2px); }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; pointer-events: none; }
.free { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none; }
.free :deep(.ly:not(.lk)) { pointer-events: auto; }
.frame { position: absolute; pointer-events: auto; background: var(--iris-paper); box-shadow: 0 0 0 1px var(--iris-line-strong), 0 1px 3px rgb(3 9 26 / 6%); overflow: hidden; outline: none; }
.thumb { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; pointer-events: none; }
.draft { position: absolute; background: color-mix(in srgb, var(--sys-color-brand-primary-default) 8%, transparent); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.label { position: absolute; pointer-events: auto; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.label.on { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.sel { position: absolute; box-shadow: 0 0 0 1.5px var(--sys-color-brand-primary-default); }
.sel.dim { box-shadow: 0 0 0 1px color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); }
.sel.none { box-shadow: none; }
.hl { position: absolute; box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); background: color-mix(in srgb, var(--sys-color-brand-primary-default) 6%, transparent); }
.handle.live { pointer-events: auto; width: 8px; height: 8px; }
.handle.nw { left: -4px; top: -4px; cursor: nwse-resize; }
.handle.se { right: -4px; bottom: -4px; cursor: nwse-resize; }
.handle.ne { right: -4px; top: -4px; cursor: nesw-resize; }
.handle.sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.size { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: var(--ref-spacing-04); padding: 0 var(--ref-spacing-02); border-radius: var(--ref-radius-02); background: var(--sys-color-brand-primary-default); color: var(--sys-color-common-white-default); font-size: 10px; line-height: 16px; font-weight: 500; white-space: nowrap; }
.marq { position: absolute; box-shadow: 0 0 0 1px var(--sys-color-brand-primary-default); background: color-mix(in srgb, var(--sys-color-brand-primary-default) 8%, transparent); }
</style>
