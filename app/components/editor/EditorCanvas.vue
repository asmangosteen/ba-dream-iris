<script setup lang="ts">
import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'

/**
 * 무한 캔버스: 이동(빈 곳 드래그 · 스페이스+드래그 · 가운데 버튼 · 트랙패드 스크롤), 확대(⌘/Ctrl+휠 · 핀치 · 단축키),
 * 화면 선택 · 끌어서 옮기기, 프레임 도구로 새 화면 그리기.
 * 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y)
 */
export interface Viewport { x: number; y: number; zoom: number }

const props = defineProps<{ screens: ScreenRow[]; selected: string | null; highlight?: string[] }>()
const tool = defineModel<Tool>('tool', { required: true })
const vp = defineModel<Viewport>('viewport', { required: true })
const emit = defineEmits<{
  select: [id: string | null]
  move: [id: string, x: number, y: number, done: boolean]
  create: [rect: { x: number; y: number; width: number; height: number }]
  hint: [text: string]
}>()

const el = ref<HTMLElement | null>(null)
const space = ref(false)
const panning = ref(false)
const draft = ref<{ x: number; y: number; width: number; height: number } | null>(null)

const MIN = 0.05
const MAX = 8
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z))

function toWorld(clientX: number, clientY: number) {
  const r = el.value!.getBoundingClientRect()
  return { x: (clientX - r.left - vp.value.x) / vp.value.zoom, y: (clientY - r.top - vp.value.y) / vp.value.zoom }
}

/** (cx, cy) 화면 지점을 고정한 채 확대 비율 바꾸기 */
function zoomAt(z: number, cx?: number, cy?: number) {
  const r = el.value?.getBoundingClientRect()
  const px = cx ?? (r ? r.width / 2 : 0)
  const py = cy ?? (r ? r.height / 2 : 0)
  const nz = clamp(z)
  const k = nz / vp.value.zoom
  vp.value = { zoom: nz, x: px - (px - vp.value.x) * k, y: py - (py - vp.value.y) * k }
}

/** 패널에 가리지 않는 가운데 영역에 화면 전체 맞추기 */
function fit(ids?: string[]) {
  const list = ids?.length ? props.screens.filter((s) => ids.includes(s.id)) : props.screens
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  const area = { left: 288, right: r.width - 312, top: 72, bottom: r.height - 72 }
  if (!list.length) { vp.value = { zoom: 0.5, x: area.left + 64, y: area.top + 32 }; return }
  const x0 = Math.min(...list.map((s) => s.x)), y0 = Math.min(...list.map((s) => s.y))
  const x1 = Math.max(...list.map((s) => s.x + s.width)), y1 = Math.max(...list.map((s) => s.y + s.height))
  const w = Math.max(1, area.right - area.left), h = Math.max(1, area.bottom - area.top)
  const zoom = clamp(Math.min(w / (x1 - x0), h / (y1 - y0), 1) * 0.92)
  vp.value = { zoom, x: area.left + (w - (x1 - x0) * zoom) / 2 - x0 * zoom, y: area.top + (h - (y1 - y0) * zoom) / 2 - y0 * zoom }
}
defineExpose({ fit, zoomAt })

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const r = el.value!.getBoundingClientRect()
  if (e.ctrlKey || e.metaKey) {
    // 트랙패드 핀치는 ctrlKey 가 붙은 휠로 들어옵니다
    zoomAt(vp.value.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top)
  } else {
    const k = e.deltaMode ? 16 : 1
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
    vp.value = { ...vp.value, x: vp.value.x - dx * k, y: vp.value.y - dy * k }
  }
}

// ---------------------------------------------------------------------------
// 끌기: 이동 · 화면 옮기기 · 프레임 그리기
// ---------------------------------------------------------------------------
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'frame'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'draw'; wx: number; wy: number; moved: boolean }
let drag: Drag | null = null

function start(e: PointerEvent, screen?: ScreenRow) {
  if (e.button !== 0 && e.button !== 1) return
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  if (e.button === 1 || space.value || (!screen && tool.value === 'move')) {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.value.x, vy: vp.value.y, moved: false }
    panning.value = true
    return
  }
  if (tool.value === 'frame') {
    const w = toWorld(e.clientX, e.clientY)
    drag = { kind: 'draw', wx: w.x, wy: w.y, moved: false }
    return
  }
  if (screen && tool.value === 'move') {
    emit('select', screen.id)
    drag = { kind: 'frame', id: screen.id, sx: e.clientX, sy: e.clientY, ox: screen.x, oy: screen.y, moved: false }
    return
  }
  // 사각형 · 텍스트 · 이미지는 화면 안 편집(다음 단계)에서 열립니다
  emit('hint', '사각형 · 텍스트 · 이미지 도구는 화면 안 편집과 함께 열려요')
  tool.value = 'move'
}

function move(e: PointerEvent) {
  if (!drag) return
  const dx = e.clientX - (drag.kind === 'draw' ? 0 : drag.sx)
  const dy = e.clientY - (drag.kind === 'draw' ? 0 : drag.sy)
  if (drag.kind === 'pan') {
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    vp.value = { ...vp.value, x: drag.vx + dx, y: drag.vy + dy }
  } else if (drag.kind === 'frame') {
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    drag.moved = true
    emit('move', drag.id, Math.round(drag.ox + dx / vp.value.zoom), Math.round(drag.oy + dy / vp.value.zoom), false)
  } else {
    const w = toWorld(e.clientX, e.clientY)
    if (!drag.moved && Math.abs(w.x - drag.wx) * vp.value.zoom + Math.abs(w.y - drag.wy) * vp.value.zoom < 4) return
    drag.moved = true
    draft.value = { x: Math.round(Math.min(w.x, drag.wx)), y: Math.round(Math.min(w.y, drag.wy)), width: Math.round(Math.abs(w.x - drag.wx)), height: Math.round(Math.abs(w.y - drag.wy)) }
  }
}

function end(e: PointerEvent) {
  if (!drag) return
  const d = drag
  drag = null
  panning.value = false
  if (d.kind === 'pan' && !d.moved && e.target === el.value) emit('select', null)
  if (d.kind === 'frame' && d.moved) {
    const s = props.screens.find((x) => x.id === d.id)
    if (s) emit('move', d.id, s.x, s.y, true)
  }
  if (d.kind === 'draw') {
    const rect = d.moved && draft.value && draft.value.width >= 16 && draft.value.height >= 16
      ? draft.value
      : { x: Math.round(d.wx), y: Math.round(d.wy), width: 375, height: 812 } // 한 번 누르면 모바일 화면 크기
    draft.value = null
    emit('create', rect)
    tool.value = 'move'
  }
}

// ---------------------------------------------------------------------------
// 단축키: 스페이스(손), ⌘/Ctrl + = − 0, Shift+1(전체 맞추기), Shift+2(선택 맞추기)
// ---------------------------------------------------------------------------
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')
function onKeyDown(e: KeyboardEvent) {
  if (typing(e)) return
  if (e.code === 'Space') { space.value = true; e.preventDefault(); return }
  const mod = e.metaKey || e.ctrlKey
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(vp.value.zoom * 1.25) }
  else if (mod && e.key === '-') { e.preventDefault(); zoomAt(vp.value.zoom / 1.25) }
  else if (mod && e.key === '0') { e.preventDefault(); zoomAt(1) }
  else if (e.shiftKey && e.code === 'Digit1') fit()
  else if (e.shiftKey && e.code === 'Digit2' && props.selected) fit([props.selected])
  else if (e.shiftKey && e.code === 'Digit0') zoomAt(1)
  else if (e.key === 'Escape') { emit('select', null); tool.value = 'move' }
}
function onKeyUp(e: KeyboardEvent) { if (e.code === 'Space') space.value = false }
// Safari 핀치(gesture 이벤트)
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

// 화면 좌표(라벨 · 선택 상자는 확대해도 글자 크기가 그대로이도록 바깥 층에 그립니다)
const box = (s: { x: number; y: number; width: number; height: number }) => ({
  left: s.x * vp.value.zoom + vp.value.x + 'px',
  top: s.y * vp.value.zoom + vp.value.y + 'px',
  width: s.width * vp.value.zoom + 'px',
  height: s.height * vp.value.zoom + 'px',
})
const cursor = computed(() => (panning.value ? 'grabbing' : space.value ? 'grab' : tool.value === 'frame' ? 'crosshair' : 'default'))
const selectedScreen = computed(() => props.screens.find((s) => s.id === props.selected) ?? null)
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
    <div class="world" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }">
      <button
        v-for="s in screens"
        :key="s.id"
        class="frame"
        :style="{ left: s.x + 'px', top: s.y + 'px', width: s.width + 'px', height: s.height + 'px', cursor: space || panning ? 'inherit' : tool === 'move' ? 'default' : 'crosshair' }"
        :aria-label="`${s.name} 화면 선택`"
        :aria-pressed="selected === s.id"
        @pointerdown.stop="start($event, s)"
        @keydown.enter="emit('select', s.id)"
      >
        <img v-if="s.thumbnail_path" :src="s.thumbnail_path" alt="" draggable="false">
      </button>
      <div v-if="draft" class="draft" :style="{ left: draft.x + 'px', top: draft.y + 'px', width: draft.width + 'px', height: draft.height + 'px' }" />
    </div>

    <!-- 화면 이름 · 선택 상자 · 연결 강조 (확대와 상관없이 같은 크기) -->
    <div class="overlay" aria-hidden="true">
      <span
        v-for="s in screens"
        :key="'l' + s.id"
        class="label"
        :class="{ on: selected === s.id }"
        :style="{ left: box(s).left, top: `calc(${box(s).top} - 20px)`, maxWidth: box(s).width }"
        @pointerdown.stop="start($event, s)"
      >{{ s.name }}</span>
      <div v-for="id in highlight ?? []" :key="'h' + id" class="hl" :style="screens.find((s) => s.id === id) ? box(screens.find((s) => s.id === id)!) : { display: 'none' }" />
      <div v-if="selectedScreen" class="sel" :style="box(selectedScreen)">
        <span class="handle" style="left: -4px; top: -4px" /><span class="handle" style="right: -4px; top: -4px" />
        <span class="handle" style="left: -4px; bottom: -4px" /><span class="handle" style="right: -4px; bottom: -4px" />
        <span class="size num">{{ Math.round(selectedScreen.width) }} × {{ Math.round(selectedScreen.height) }}</span>
      </div>
      <div v-if="draft" class="sel" :style="box(draft)"><span class="size num">{{ draft.width }} × {{ draft.height }}</span></div>
    </div>
  </main>
</template>

<style scoped>
.canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; background-image: radial-gradient(circle, var(--ref-color-gray-900-10) 1px, transparent 1.2px); }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; pointer-events: none; }
.frame { position: absolute; pointer-events: auto; background: var(--sys-color-common-white-default); box-shadow: 0 0 0 1px var(--iris-line-strong), 0 1px 3px rgb(3 9 26 / 6%); overflow: hidden; }
.frame img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; pointer-events: none; }
.draft { position: absolute; background: rgb(255 255 255 / 70%); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.label { position: absolute; pointer-events: auto; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.label.on { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.sel { position: absolute; box-shadow: 0 0 0 1.5px var(--sys-color-brand-primary-default); }
.hl { position: absolute; box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); background: color-mix(in srgb, var(--sys-color-brand-primary-default) 6%, transparent); }
.size { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: var(--ref-spacing-04); padding: 0 var(--ref-spacing-02); border-radius: var(--ref-radius-02); background: var(--sys-color-brand-primary-default); color: var(--sys-color-common-white-default); font-size: 10px; line-height: 16px; font-weight: 500; white-space: nowrap; }
</style>
