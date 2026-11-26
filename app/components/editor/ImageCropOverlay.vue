<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import { normAngle, type ImageCrop, type LayerNode } from '~/canvas/schema'
import { rotCursor, type Corner } from '~/canvas/cursors'
import { coverCrop, radiiOf, rectPath } from '~/canvas/paint'
import { squirclePath } from '~/canvas/squircle'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc } from '~/canvas/images'
import { endCrop, imagePaintAt, patchImage, useImageEdit, type ImageEdit } from '~/composables/useImageEdit'

/**
 * 이미지 자르기 화면(피그마 Crop). EditorCanvas 가 자르는 동안 고른 레이어 자리에 띄워요.
 * mat: 레이어 안 좌표 → 캔버스 화면 좌표(확대 · 이동 · 회전 포함)
 * - 레이어 상자(자르는 창): 가장자리 · 모서리를 끌면 창 크기(이미지는 그 자리 그대로) — 돌린 레이어는 창 크기를 못 바꿔요
 * - 이미지(파란 상자): 안을 끌면 옮기기, 네 모서리로 크기(비율 그대로). 창 밖 부분은 흐리게 보여요
 * - 아래 막대: 확대 · 비율 · 처음처럼 덮기 · Cancel · ✓
 */
const props = defineProps<{ edit: ImageEdit; node: LayerNode; mat: { a: number; b: number; c: number; d: number; e: number; f: number } }>()
const store = useLayerStore()
const imageSrc = useImageSrc()
const state = useImageEdit()

const paint = computed(() => imagePaintAt(props.node, props.edit.i))
const W = computed(() => props.node.w)
const H = computed(() => props.node.h)
const ar = computed(() => { const p = paint.value; return p?.iw && p.ih ? p.iw / p.ih : W.value / H.value })
/** 이미지 자리(레이어 안 px) */
const R = computed(() => {
  const c = paint.value?.crop ?? coverCrop(ar.value, W.value / H.value)
  return { x: c.x * W.value, y: c.y * H.value, w: c.w * W.value, h: c.h * H.value }
})
const url = computed(() => imageSrc(paint.value?.src))
/** 이미지 돌린 각도(도, 이미지 가운데 기준) */
const rot = computed(() => paint.value?.rotation ?? 0)
/** 이미지 안 비율 자리(u, v: 0~1) → 레이어 안 좌표(돌린 것 포함) */
function ipt(u: number, v: number, r = R.value, deg = rot.value) {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = (u - 0.5) * r.w, dy = (v - 0.5) * r.h
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

// --- 좌표 ---
const pt = (x: number, y: number) => { const m = props.mat; return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } }
/** 화면에서 끈 만큼 → 레이어 안 거리 */
function toLocal(dx: number, dy: number) {
  const m = props.mat
  const det = m.a * m.d - m.b * m.c || 1
  return { x: (m.d * dx - m.c * dy) / det, y: (-m.b * dx + m.a * dy) / det }
}
const tf = computed(() => { const m = props.mat; return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})` })
const zoomNow = computed(() => Math.hypot(props.mat.a, props.mat.b))
const poly = (x: number, y: number, w: number, h: number) => [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)].map((p) => `${p.x},${p.y}`).join(' ')
const imgPoly = computed(() => [ipt(0, 0), ipt(1, 0), ipt(1, 1), ipt(0, 1)].map((q) => pt(q.x, q.y)).map((p) => `${p.x},${p.y}`).join(' '))
/** 흐린 이미지 가림 판(mask) 범위: 돌린 이미지 · 창을 모두 덮게 */
const maskBox = computed(() => {
  const ps = [ipt(0, 0), ipt(1, 0), ipt(1, 1), ipt(0, 1), { x: 0, y: 0 }, { x: W.value, y: H.value }]
  const x0 = Math.min(...ps.map((q) => q.x)) - 2, y0 = Math.min(...ps.map((q) => q.y)) - 2
  return { x: x0, y: y0, w: Math.max(...ps.map((q) => q.x)) + 2 - x0, h: Math.max(...ps.map((q) => q.y)) + 2 - y0 }
})
const imgRot = computed(() => (rot.value ? `rotate(${rot.value} ${R.value.x + R.value.w / 2} ${R.value.y + R.value.h / 2})` : undefined))
/** 레이어가 화면에서 돈 각도(커서 방향) */
const nodeAngle = computed(() => (Math.atan2(props.mat.b, props.mat.a) * 180) / Math.PI)
const winPoly = computed(() => poly(0, 0, W.value, H.value))
/** 자르는 창 모양: 레이어 그대로(모서리 둥글기 + Corner smoothing) — 테두리 · 흐린 이미지의 구멍이 같은 모양 */
const shapeD = computed(() => {
  const r = radiiOf(props.node.style)
  const sm = props.node.style.smoothing ?? 0
  return sm > 0 && r.some(Boolean) ? squirclePath(W.value, H.value, r, sm) : rectPath(W.value, H.value, r)
})
const uid = `crop-${Math.random().toString(36).slice(2, 8)}`
const CORNERS = [['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]] as const
const EDGES = [['n', 0, 0, 1, 0], ['e', 1, 0, 1, 1], ['s', 0, 1, 1, 1], ['w', 0, 0, 0, 1]] as const
const imgHandles = computed(() => CORNERS.map(([k, u, v]) => { const q = ipt(u, v); return { k, ...pt(q.x, q.y) } }))
/** 이미지 돌리기 자리: 이미지 모서리 바로 바깥(화면 14px, 대각선 바깥쪽) — 커서는 모서리마다 다른 돌리기 화살표 */
const imgRotHandles = computed(() => {
  const c = pt(R.value.x + R.value.w / 2, R.value.y + R.value.h / 2)
  return imgHandles.value.map((h) => {
    const dx = h.x - c.x, dy = h.y - c.y, l = Math.hypot(dx, dy) || 1
    return { k: h.k as Corner, x: h.x + (dx / l) * 14, y: h.y + (dy / l) * 14 }
  })
})
/** 창 크기 손잡이(프레임 선택과 같은 모양): 모서리 네모 + 가장자리는 보이지 않는 잡는 띠. 돌리거나 뒤집은 레이어는 빼요 */
const canResize = computed(() => !props.node.rotation && !props.node.flipX && !props.node.flipY)
const winHandles = computed(() => (canResize.value ? CORNERS.map(([k, u, v]) => ({ k, ...pt(u * W.value, v * H.value) })) : []))
const winEdges = computed(() => (canResize.value ? EDGES.map(([k, u0, v0, u1, v1]) => { const a = pt(u0 * W.value, v0 * H.value), b = pt(u1 * W.value, v1 * H.value); return { k, x1: a.x, y1: a.y, x2: b.x, y2: b.y } }) : []))
/** 모서리 둥글기 손잡이(프레임 선택과 같아요): 모서리에서 안쪽으로 둥글기만큼(최소 화면 12px), 창이 작으면 숨겨요 */
const radHandles = computed(() => {
  const z = zoomNow.value, w = W.value * z, h = H.value * z
  if (w < 40 || h < 40) return []
  const r = radiiOf(props.node.style)
  return CORNERS.map(([k, u, v], c) => {
    const off = Math.min(Math.max(12, (r[c] ?? 0) * z), w / 2, h / 2) / z
    return { c, k, ...pt(u ? W.value - off : off, v ? H.value - off : off) }
  })
})
const CURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

// --- 고치기 ---
function setCrop(c: ImageCrop, geom?: Parameters<typeof patchImage>[3], stylePatch?: Parameters<typeof patchImage>[4]) {
  patchImage(store, props.edit, (p) => ({ ...p, fit: 'crop', crop: c }), geom, stylePatch)
}
const toCrop = (r: { x: number; y: number; w: number; h: number }, w = W.value, h = H.value): ImageCrop => ({ x: r.x / w, y: r.y / h, w: r.w / w, h: r.h / h })

/** 끌기 공통: 시작 값을 받아 두고, 움직일 때마다 레이어 안 거리로 */
function drag(e: PointerEvent, on: (d: { x: number; y: number }, ev: PointerEvent) => void) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const sx = e.clientX, sy = e.clientY
  const move = (ev: PointerEvent) => on(toLocal(ev.clientX - sx, ev.clientY - sy), ev)
  const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true) }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
/** 이미지 옮기기: 창 가장자리 · 가운데에 붙어요(화면 6px 안) */
function startMove(e: PointerEvent) {
  const r0 = { ...R.value }
  drag(e, (d) => {
    const snap = 6 / zoomNow.value
    let x = r0.x + d.x, y = r0.y + d.y
    for (const t of [0, W.value - r0.w, (W.value - r0.w) / 2]) if (Math.abs(x - t) < snap) { x = t; break }
    for (const t of [0, H.value - r0.h, (H.value - r0.h) / 2]) if (Math.abs(y - t) < snap) { y = t; break }
    setCrop(toCrop({ ...r0, x, y }))
  })
}
/** 이미지 크기: 맞은편 모서리 고정, 비율 그대로(돌린 이미지는 이미지 방향 기준) */
function startImgResize(e: PointerEvent, k: string) {
  const r0 = { ...R.value }
  const a = r0.w / r0.h
  const sx = k.includes('w') ? -1 : 1, sy = k.includes('n') ? -1 : 1
  const t = (rot.value * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
  const A = ipt((1 - sx) / 2 === 0 ? 0 : 1, (1 - sy) / 2 === 0 ? 0 : 1, r0)
  const P0 = ipt(sx > 0 ? 1 : 0, sy > 0 ? 1 : 0, r0)
  drag(e, (d) => {
    const px = P0.x + d.x - A.x, py = P0.y + d.y - A.y
    // 이미지 방향 좌표로
    const vx = (px * cos + py * sin) * sx, vy = (-px * sin + py * cos) * sy
    const w = Math.max(8, Math.max(vx, vy * a)), h = w / a
    const cx = A.x + ((sx * w) / 2) * cos - ((sy * h) / 2) * sin, cy = A.y + ((sx * w) / 2) * sin + ((sy * h) / 2) * cos
    setCrop(toCrop({ x: cx - w / 2, y: cy - h / 2, w, h }))
  })
}
/** 이미지 돌리기: 이미지 가운데 기준, ⇧ 15° 씩 */
const svgEl = ref<SVGSVGElement | null>(null)
function startImgRotate(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const box = svgEl.value?.getBoundingClientRect()
  const c = pt(R.value.x + R.value.w / 2, R.value.y + R.value.h / 2)
  const cx = (box?.left ?? 0) + c.x, cy = (box?.top ?? 0) + c.y
  const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), r0 = rot.value
  const sign = props.mat.a * props.mat.d - props.mat.b * props.mat.c < 0 ? -1 : 1
  rotating.value = true
  const move = (ev: PointerEvent) => {
    let deg = r0 + (sign * (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180) / Math.PI
    deg = ev.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10
    const v = normAngle(deg)
    patchImage(store, props.edit, (p) => ({ ...p, fit: 'crop', crop: p.crop ?? toCrop(R.value), rotation: v || undefined }))
  }
  const up = () => { rotating.value = false; window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true) }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
const rotating = ref(false)
/** 창 크기: 레이어 상자를 바꾸고 이미지는 화면 그 자리 그대로 */
function startWinResize(e: PointerEvent, k: string) {
  const r0 = { ...R.value }
  const n0 = { x: props.node.x, y: props.node.y, w: W.value, h: H.value }
  drag(e, (d) => {
    let l = 0, t = 0, r = n0.w, b = n0.h
    if (k.includes('w')) l = Math.min(d.x, n0.w - 1)
    if (k.includes('e')) r = Math.max(1, n0.w + d.x)
    if (k.includes('n')) t = Math.min(d.y, n0.h - 1)
    if (k.includes('s')) b = Math.max(1, n0.h + d.y)
    l = Math.round(l); t = Math.round(t); r = Math.round(r); b = Math.round(b)
    const w = r - l, h = b - t
    setCrop(toCrop({ x: r0.x - l, y: r0.y - t, w: r0.w, h: r0.h }, w, h), { x: n0.x + l, y: n0.y + t, w, h })
  })
}

/** 모서리 둥글기 끌기(⌥ = 한 모서리) — 프레임 선택의 둥글기 손잡이와 같아요 */
function startRadius(e: PointerEvent, c: number) {
  const max = Math.min(W.value, H.value) / 2
  const r0 = Math.min(max, radiiOf(props.node.style)[c] ?? 0)
  const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][c]!
  drag(e, (d, ev) => {
    const v = Math.round(Math.max(0, Math.min(max, r0 + (d.x * inward[0]! + d.y * inward[1]!) / 2)))
    store.update(props.edit.sid, [props.edit.id], (nn) => {
      if (ev.altKey) { const rr = [...radiiOf(nn.style)] as [number, number, number, number]; rr[c] = v; return { style: { ...nn.style, radii: rr } } }
      return { style: { ...nn.style, radius: v, radii: undefined } }
    })
  })
}

// --- 아래 막대 ---
/** 확대: 덮기(Fill) 크기 = 1, 최대 5배. 창 가운데에 있던 이미지 자리를 그대로 두고 키워요 */
const coverW = computed(() => coverCrop(ar.value, W.value / H.value).w * W.value)
const zoom = computed(() => Math.max(1, Math.min(5, R.value.w / coverW.value)))
function onZoom(e: Event) {
  const z = Number((e.target as HTMLInputElement).value)
  const r = R.value
  const nw = z * coverW.value, nh = nw / (r.w / r.h)
  const u = (W.value / 2 - r.x) / r.w, v = (H.value / 2 - r.y) / r.h
  setCrop(toCrop({ x: W.value / 2 - u * nw, y: H.value / 2 - v * nh, w: nw, h: nh }))
}
/**
 * 비율(피그마 Crop 비율 메뉴): 이미지는 그 자리 · 크기 그대로, 창만 그 비율로 — 이미지 안에 들어가는 가장 큰 상자를 이미지 가운데에.
 * 원(1:1)은 둥글기를 반지름 끝까지, 다른 비율을 고르면 둥글기를 들어오기 전으로(그때도 원이었으면 0)
 */
const ASPECTS = [
  { value: 'orig', label: 'Original' },
  { value: '1:1', label: 'Square (1:1)' },
  { value: 'circle', label: 'Circle (1:1)' },
  { value: '4:3', label: 'Landscape 4:3', sep: true },
  { value: '16:9', label: 'Landscape 16:9' },
  { value: '3:2', label: 'Landscape 3:2' },
  { value: '3:4', label: 'Portrait 3:4', sep: true },
  { value: '9:16', label: 'Portrait 9:16' },
  { value: '2:3', label: 'Portrait 2:3' },
]
const isCircle = (st: { radius?: number; radii?: unknown }, w: number, h: number) => !st.radii && (st.radius ?? 0) >= Math.min(w, h) / 2 - 0.5
function setAspect(v: string | null) {
  if (!v) return
  const circle = v === 'circle'
  const ratio = v === 'orig' ? ar.value : circle ? 1 : (() => { const [a, b] = v.split(':').map(Number); return a! / b! })()
  const r = R.value
  let w: number, h: number, c: ImageCrop, geom: Parameters<typeof patchImage>[3]
  if (canResize.value) {
    w = r.w; h = w / ratio
    if (h > r.h) { h = r.h; w = h * ratio }
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
    const l = Math.round(r.x + (r.w - w) / 2), t = Math.round(r.y + (r.h - h) / 2)
    c = { x: (r.x - l) / w, y: (r.y - t) / h, w: r.w / w, h: r.h / h }
    geom = { x: props.node.x + l, y: props.node.y + t, w, h }
  } else {
    // 돌린 레이어: 폭은 그대로 높이만, 이미지는 새 창을 덮게
    w = W.value; h = Math.max(1, Math.round(w / ratio))
    c = coverCrop(ar.value, w / h)
    geom = { h }
  }
  const b = props.edit.before
  const corner = circle
    ? { radius: Math.round(Math.min(w, h) / 2), radii: undefined }
    : isCircle(props.node.style, W.value, H.value)
      ? (isCircle(b.style, b.w, b.h) ? { radius: 0, radii: undefined } : { radius: b.style.radius, radii: b.style.radii })
      : undefined
  setCrop(c, geom, corner)
}
/** 처음처럼: 창을 꼭 덮게 */
function reset() { patchImage(store, props.edit, (p) => ({ ...p, fit: 'crop', crop: coverCrop(ar.value, W.value / H.value), rotation: undefined })) }
const apply = () => endCrop(store, true)
const cancel = () => endCrop(store, false)

// Enter = 적용, Esc = 취소(칠 창이 열려 있으면 Esc 는 칠 창 먼저). 바깥을 누르면 적용
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); apply() }
  else if (e.key === 'Escape') {
    if (document.querySelector('.paint-pop, .esel-m')) return
    e.preventDefault(); e.stopImmediatePropagation(); cancel()
  }
}
function onDown(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (!t || t.closest('.crop-ui, .paint-pop, .panel-right, .esel-m, .menu, [role="dialog"]')) return
  apply()
}
// 칠 창이 막대를 가리면 막대를 왼쪽으로 비켜요(칠 창 왼쪽 8px 까지, 캔버스 왼쪽 끝은 넘지 않게)
const barEl = ref<HTMLElement | null>(null)
const shift = ref(0)
let timer = 0
function fitBar() {
  const b = barEl.value
  const pop = document.querySelector('.paint-pop')
  if (!b) return
  const box = b.offsetParent?.getBoundingClientRect()
  const r = b.getBoundingClientRect()
  const right0 = r.right - shift.value, left0 = r.left - shift.value
  const lim = pop ? pop.getBoundingClientRect().left - 8 : Infinity
  const want = right0 > lim ? lim - right0 : 0
  shift.value = Math.max(want, (box ? box.left + 8 : 0) - left0)
  if (!pop) shift.value = 0
}
onMounted(() => { window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onDown, true); timer = window.setInterval(fitBar, 150); fitBar() })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); window.clearInterval(timer) })
// 다른 것을 고르거나, 칠을 다른 맞춤으로 바꾸거나, 레이어가 사라지면 적용하고 끝내요
watch(() => [store.screenId.value, store.layerIds.value.join(','), paint.value?.fit ?? 'gone'] as const, ([sid, ids, fit]) => {
  if (state.value !== props.edit) return
  if (sid !== props.edit.sid || ids !== props.edit.id || fit !== 'crop') apply()
})
</script>

<template>
  <div class="crop-root">
    <svg ref="svgEl" class="crop-svg" width="100%" height="100%">
      <defs>
        <!-- 흐린 이미지에서 창 자리는 구멍(창 모양 그대로) — 돌린 이미지도 덮게 넉넉히 -->
        <mask :id="uid" maskUnits="userSpaceOnUse" :x="maskBox.x" :y="maskBox.y" :width="maskBox.w" :height="maskBox.h">
          <rect :x="maskBox.x" :y="maskBox.y" :width="maskBox.w" :height="maskBox.h" fill="#fff" />
          <path :d="shapeD" fill="#000" />
        </mask>
      </defs>
      <g :transform="tf">
        <g :mask="`url(#${uid})`"><image v-if="url" :href="url" :x="R.x" :y="R.y" :width="R.w" :height="R.h" preserveAspectRatio="none" opacity="0.4" :transform="imgRot" /></g>
      </g>
      <!-- 이미지 돌리기: 이미지 모서리 바로 바깥(레이어와 같아요 — ⇧ 15° 씩) -->
      <circle v-for="h in imgRotHandles" :key="'ir' + h.k" class="rot-hit crop-ui" :cx="h.x" :cy="h.y" r="9" :style="{ cursor: rotCursor(h.k, rot + nodeAngle) }" @pointerdown="startImgRotate" />
      <!-- 옮기기: 이미지 · 창 어디를 잡아도 -->
      <polygon class="hit move crop-ui" :points="imgPoly" @pointerdown="startMove" />
      <polygon class="hit move crop-ui" :points="winPoly" @pointerdown="startMove" />
      <g :transform="tf">
        <rect class="img-line" :x="R.x" :y="R.y" :width="R.w" :height="R.h" :transform="imgRot" vector-effect="non-scaling-stroke" />
        <path class="win-line" :d="shapeD" vector-effect="non-scaling-stroke" />
      </g>
      <!-- 창 가장자리: 보이지 않는 잡는 띠(프레임 선택과 같아요) -->
      <line v-for="h in winEdges" :key="'e' + h.k" class="edge crop-ui" :x1="h.x1" :y1="h.y1" :x2="h.x2" :y2="h.y2" :style="{ cursor: CURSOR[h.k] }" @pointerdown="startWinResize($event, h.k)" />
      <!-- 손잡이: 프레임 선택과 같은 흰 네모(7 · 파란 1px 테두리) — 창 모서리 · 이미지 모서리 -->
      <g v-for="h in imgHandles" :key="'i' + h.k" class="crop-ui" :style="{ cursor: CURSOR[h.k] }" @pointerdown="startImgResize($event, h.k)">
        <rect class="hd-hit" :x="h.x - 7.5" :y="h.y - 7.5" width="15" height="15" />
        <rect class="hd" :x="h.x - 3.5" :y="h.y - 3.5" width="7" height="7" rx="1" />
      </g>
      <g v-for="h in winHandles" :key="'w' + h.k" class="crop-ui" :style="{ cursor: CURSOR[h.k] }" @pointerdown="startWinResize($event, h.k)">
        <rect class="hd-hit" :x="h.x - 7.5" :y="h.y - 7.5" width="15" height="15" />
        <rect class="hd" :x="h.x - 3.5" :y="h.y - 3.5" width="7" height="7" rx="1" />
      </g>
      <!-- 모서리 둥글기 손잡이: 흰 동그라미(프레임 선택과 같아요) -->
      <g v-for="h in radHandles" :key="'r' + h.c" class="crop-ui" @pointerdown="startRadius($event, h.c)">
        <title>{{ tr('Corner radius (⌥ one corner)') }}</title>
        <circle class="hd-hit" :cx="h.x" :cy="h.y" r="9" />
        <circle class="hd" :cx="h.x" :cy="h.y" r="4" />
      </g>
    </svg>
    <!-- 아래 막대(피그마 Crop 막대): Crop · 확대 · 비율 · 처음처럼 | Cancel · ✓ -->
    <div ref="barEl" class="sq float cbar crop-ui" role="toolbar" :aria-label="tr('Crop image')" :style="{ transform: `translateX(calc(-50% + ${shift}px))` }" @pointerdown.stop>
      <span class="cl">{{ tr('Crop') }}</span>
      <span class="sep" aria-hidden="true" />
      <input class="zoom" type="range" min="1" max="5" step="0.01" :value="zoom" :aria-label="tr('Image zoom')" :style="{ '--p': ((zoom - 1) / 4) * 100 + '%' }" @input="onZoom">
      <EditorSelect variant="icon" :model-value="null" :options="ASPECTS" aria-label="Aspect ratio" @update:model-value="setAspect">
        <!-- 비율: 겹친 두 상자 + ▾ 자리 -->
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="keep"><rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M6.5 3.25V12.75M6.5 8H13.75" fill="none" stroke="currentColor" stroke-width="1.25" /></svg>
      </EditorSelect>
      <button type="button" class="ib s28" :aria-label="tr('Reset crop')" :data-tip="tr('Reset crop')" @click="reset">
        <!-- 처음처럼 덮기: 네 모서리에서 안으로 -->
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="keep"><path d="M2.5 6H6V2.5M13.5 6H10V2.5M2.5 10H6V13.5M13.5 10H10V13.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <span class="sep" aria-hidden="true" />
      <button type="button" class="sq cancel" @click="cancel">{{ tr('Cancel') }}</button>
      <button type="button" class="sq ok" :aria-label="tr('Apply crop')" :data-tip="tr('Apply crop')" @click="apply"><EditorIcon name="check" :size="16" /></button>
    </div>
  </div>
</template>

<style scoped>
.crop-root { position: absolute; inset: 0; pointer-events: none; z-index: 3; } /* 좌우 패널(4 · 3, 뒤에 그려져요) 아래 */
.crop-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.crop-svg image { pointer-events: none; }
.hit { fill: transparent; pointer-events: all; cursor: move; }
.img-line { fill: none; stroke: var(--iris-select); stroke-width: 1; }
.win-line { fill: none; stroke: var(--iris-select); stroke-width: 1; }
/* 손잡이: 캔버스 선택 손잡이(.handle.live · .rh)와 같은 모양 */
.hd { fill: #FFFFFF; stroke: var(--iris-select); stroke-width: 1; pointer-events: none; }
.hd-hit { fill: transparent; pointer-events: all; }
.rot-hit { fill: transparent; pointer-events: all; }
.edge { stroke: transparent; stroke-width: 8; pointer-events: stroke; }
/* 아래 막대: 도구 막대 위(토스트 자리), 도구 막대와 같은 떠 있는 상자 */
.cbar { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); height: 44px; box-sizing: border-box; border-radius: 14px; padding: 0 var(--ref-spacing-05) 0 var(--ref-spacing-08); display: flex; align-items: center; gap: var(--ref-spacing-04); pointer-events: auto; z-index: 9; font-size: 12px; }
.cl { font-weight: 600; color: var(--sys-color-neutral-800); }
.sep { width: 1px; align-self: stretch; background: var(--iris-line); margin: 0 var(--ref-spacing-02); }
.s28 { width: 28px; height: 28px; }
.zoom { -webkit-appearance: none; appearance: none; width: 112px; height: 16px; margin: 0 var(--ref-spacing-02); background: transparent; cursor: pointer; }
.zoom::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--sys-color-neutral-500) var(--p), var(--sys-color-neutral-200) var(--p)); }
.zoom::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 20%); }
.zoom::-moz-range-track { height: 4px; border-radius: 2px; background: var(--sys-color-neutral-200); }
.zoom::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 20%); }
.cancel { height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; color: var(--sys-color-neutral-800); font-weight: 500; }
.cancel:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.ok { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-brand-primary-default); color: #FFFFFF; }
.ok:hover { filter: brightness(0.94); }
</style>
