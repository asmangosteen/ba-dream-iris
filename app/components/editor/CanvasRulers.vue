<script setup lang="ts">
/**
 * 눈금자(⇧R)와 가이드선(피그마와 같아요).
 * 눈금자에서 캔버스 쪽으로 끌면 가이드선이 생기고, 가이드선을 끌어 옮기거나 눈금자로 되돌려 놓으면 지워져요.
 * - 놓은 자리(마우스)가 화면(프레임) 위면 그 프레임의 가이드선(frame.guides, 프레임에서 잰 거리) — 프레임과 함께 옮겨지고 복사돼요.
 *   프레임 위는 실선, 프레임 밖으로 이어지는 부분은 점선. 숫자도 프레임에서 잰 값
 * - 빈 캔버스에 놓으면 페이지 가이드선(캔버스 좌표, pages.viewport.guides)
 * - 끄는 동안 프레임 · 레이어의 가장자리 · 가운데, 레이아웃 그리드 칸에 붙어요(⌘ 누르면 안 붙어요)
 * 눈금자는 가운데 캔버스(양쪽 패널 사이) 폭만큼만
 */
export interface Guides { x: number[]; y: number[] }
export interface GuideFrame { sid: string; x: number; y: number; w: number; h: number; g: Guides }
/** 바뀐 가이드선: page = 페이지 가이드선, frames = 프레임별(빈 목록이면 지우기) */
export interface GuideChange { page?: Guides; frames?: Record<string, Guides> }
const props = defineProps<{ vp: { x: number; y: number; zoom: number }; guides: Guides; frames: GuideFrame[]; /** 고른 프레임들 — 그 가이드선은 파랑 + 밖으로 점선 */ active: string[]; snaps: (axis: 'x' | 'y') => number[]; sel: { x: number; y: number; w: number; h: number } | null; rulers: boolean }>()
const emit = defineEmits<{ change: [c: GuideChange] }>()
const R = 18
const root = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
const inset = ref(0)
const insetR = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  const el = root.value?.parentElement
  if (!el) return
  const fit = () => {
    size.value = { w: el.clientWidth, h: el.clientHeight }
    // 눈금자는 늘 캔버스 전체(피그마와 같아요) — 대신 떠 있는 양쪽 패널이 눈금자 두께만큼 안으로 들어와요(editor.rulers, 사용자 요청 2026-11-26)
    inset.value = 0
    insetR.value = 0
  }
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(el)
  for (const p of document.querySelectorAll('.panel-left, .panel-right')) ro.observe(p)
  window.addEventListener('resize', fit)
  onBeforeUnmount(() => window.removeEventListener('resize', fit))
})
onBeforeUnmount(() => ro?.disconnect())

const sx = (v: number) => v * props.vp.zoom + props.vp.x
const sy = (v: number) => v * props.vp.zoom + props.vp.y
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
const step = computed(() => STEPS.find((s) => s * props.vp.zoom >= 50) ?? 10000)
function ticks(len: number, off: number) {
  const z = props.vp.zoom, s = step.value
  const a = Math.floor(-off / z / s) * s, b = (len - off) / z
  const out: number[] = []
  for (let v = a; v <= b && out.length < 400; v += s) out.push(v)
  return out
}
const xt = computed(() => ticks(size.value.w, props.vp.x))
const yt = computed(() => ticks(size.value.h, props.vp.y))
const fmt = (v: number) => String(Math.round(v * 100) / 100)
/** 고른 것의 시작 · 끝 숫자와 겹치는 눈금 숫자는 숨겨요(피그마와 같아요) */
const hideLb = (axis: 'x' | 'y', v: number) => {
  const at = axis === 'x' ? sx(v) : sy(v)
  // 가이드선 숫자(끄는 중 · 고른 프레임)와 겹쳐도 숨겨요
  if (marks.value.some((m) => m.axis === axis && Math.abs(at - (axis === 'x' ? sx(m.v) : sy(m.v))) < 28)) return true
  const sl = props.sel
  if (!sl) return false
  const a = axis === 'x' ? sx(sl.x) : sy(sl.y), b = axis === 'x' ? sx(sl.x + sl.w) : sy(sl.y + sl.h)
  return Math.abs(at - a) < 28 || Math.abs(at - b) < 28
}

/** 가이드선 하나: owner = 프레임 id(없으면 페이지), i = 그 목록 안 번호, v = 캔버스 좌표 */
type GRef = { owner: string | null; axis: 'x' | 'y'; i: number }
type GLine = GRef & { v: number; f: GuideFrame | null }
const frameOf = (sid: string | null) => (sid ? props.frames.find((f) => f.sid === sid) ?? null : null)
const listOf = (owner: string | null, axis: 'x' | 'y') => (owner ? frameOf(owner)?.g[axis] ?? [] : props.guides[axis])
const lines = computed<GLine[]>(() => {
  const out: GLine[] = []
  for (const axis of ['x', 'y'] as const) {
    props.guides[axis].forEach((v, i) => out.push({ owner: null, axis, i, v, f: null }))
    for (const f of props.frames) f.g[axis].forEach((v, i) => out.push({ owner: f.sid, axis, i, v: v + (axis === 'x' ? f.x : f.y), f }))
  }
  return out
})
const same = (a: GRef | null | undefined, b: GRef) => !!a && a.owner === b.owner && a.axis === b.axis && a.i === b.i
/** 프레임에서 잰 값(프레임 가이드선) · 캔버스 값(페이지 가이드선) */
const label = (g: { axis: 'x' | 'y'; v: number; f: GuideFrame | null }) => fmt(g.f ? g.v - (g.axis === 'x' ? g.f.x : g.f.y) : g.v)

// 끌기: 새 가이드 · 옮기기
const drag = ref<{ axis: 'x' | 'y'; g: GRef | null; v: number; out: boolean; moved: boolean; v0: number; f: GuideFrame | null } | null>(null)
let snapList: number[] = []
/** 고른 가이드선: Backspace · Delete 로 지워요 */
const picked = ref<GRef | null>(null)
watch(() => [props.guides, props.frames], () => { const p = picked.value; if (p && listOf(p.owner, p.axis)[p.i] === undefined) picked.value = null })
function remove(g: GRef): GuideChange {
  const list = listOf(g.owner, g.axis).filter((_, k) => k !== g.i)
  if (!g.owner) return { page: { ...props.guides, [g.axis]: list } }
  const f = frameOf(g.owner)!
  return { frames: { [g.owner]: { ...f.g, [g.axis]: list } } }
}
function onKey(e: KeyboardEvent) {
  if (!picked.value || (e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault(); e.stopImmediatePropagation()
    const g = picked.value
    picked.value = null
    emit('change', remove(g))
  } else if (e.key === 'Escape') picked.value = null
}
function onDocDown(e: PointerEvent) { if (!(e.target as HTMLElement).closest?.('.guide')) picked.value = null }
onMounted(() => { window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onDocDown, true) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDocDown, true) })
function world(e: PointerEvent) {
  const r = root.value!.getBoundingClientRect()
  return { x: (e.clientX - r.left - props.vp.x) / props.vp.zoom, y: (e.clientY - r.top - props.vp.y) / props.vp.zoom }
}
/** 마우스 아래 화면(맨 위 것) */
const frameAt = (p: { x: number; y: number }) => [...props.frames].reverse().find((f) => p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) ?? null
function inRuler(axis: 'x' | 'y', e: PointerEvent) {
  const r = root.value!.getBoundingClientRect()
  return axis === 'x' ? e.clientX - r.left - inset.value < R && e.clientX - r.left >= inset.value - 4 : e.clientY - r.top < R
}
function start(axis: 'x' | 'y', g: GLine | null, e: PointerEvent) {
  e.preventDefault(); e.stopPropagation()
  const v = g ? g.v : Math.round(world(e)[axis])
  drag.value = { axis, g: g ? { owner: g.owner, axis: g.axis, i: g.i } : null, v, v0: v, out: !g, moved: false, f: g?.f ?? null }
  snapList = props.snaps(axis)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = world(e)
  let v = p[d.axis]
  // 붙기: 화면 6px 안의 가장 가까운 대상(⌘ · Ctrl 이면 안 붙어요)
  const t = 6 / props.vp.zoom
  let best: number | null = null
  if (!e.metaKey && !e.ctrlKey) for (const c of snapList) if (Math.abs(c - v) <= t && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c
  v = best ?? Math.round(v)
  d.v = Math.round(v * 100) / 100
  if (d.v !== d.v0) d.moved = true
  d.out = props.rulers && inRuler(d.axis, e)
  d.f = frameAt(p)
}
function end() {
  window.removeEventListener('pointermove', move)
  const d = drag.value
  drag.value = null
  if (!d) return
  // 끌지 않고 누르기만 하면 고르기
  if (d.g && !d.moved) { picked.value = d.g; return }
  if (!d.g && !d.moved) return
  // 원래 자리에서 빼고(옮기기), 놓은 곳(프레임 · 페이지)에 넣어요
  const c: GuideChange = d.g ? remove(d.g) : {}
  if (!d.out) {
    if (d.f) {
      const base = c.frames?.[d.f.sid] ?? d.f.g
      const rel = Math.round((d.v - (d.axis === 'x' ? d.f.x : d.f.y)) * 100) / 100
      c.frames = { ...c.frames, [d.f.sid]: { ...base, [d.axis]: [...base[d.axis], rel] } }
    } else {
      const base = c.page ?? props.guides
      c.page = { ...base, [d.axis]: [...base[d.axis], d.v] }
    }
  }
  emit('change', c)
}
const shown = computed(() => lines.value.filter((g) => !same(drag.value?.g, g)))
/** 고른 프레임의 가이드선 · 고른 가이드선(피그마와 같아요: 파랑, 프레임 밖으로 점선이 이어지고 숫자는 눈금자에만) */
const isAct = (g: GLine) => (!!g.owner && props.active.includes(g.owner)) || same(picked.value, g)
/** 눈금자 위 가이드선 숫자: 끄는 중인 것 · 고른 프레임의 것(프레임에서 잰 값) */
const marks = computed(() => {
  const out: { axis: 'x' | 'y'; v: number; t: string }[] = []
  const d = drag.value
  if (d && !d.out) out.push({ axis: d.axis, v: d.v, t: label(d) })
  for (const g of shown.value) if (isAct(g)) out.push({ axis: g.axis, v: g.v, t: label(g) })
  return out
})
/** 놓인 프레임 가이드선: 선 자체(누르는 자리 포함)를 프레임 위로만 */
const span = (g: { axis: 'x' | 'y'; f: GuideFrame | null }) => (!g.f ? {} : g.axis === 'x' ? { top: sy(g.f.y) + 'px', bottom: 'auto', height: g.f.h * props.vp.zoom + 'px' } : { left: sx(g.f.x) + 'px', right: 'auto', width: g.f.w * props.vp.zoom + 'px' })
/** 끄는 중인 프레임 가이드선의 실선 부분(프레임 위) */
const seg = (g: { axis: 'x' | 'y'; f: GuideFrame | null }) => (!g.f ? null : g.axis === 'x' ? { top: sy(g.f.y) + 'px', height: g.f.h * props.vp.zoom + 'px' } : { left: sx(g.f.x) + 'px', width: g.f.w * props.vp.zoom + 'px' })
</script>

<template>
  <div ref="root" class="rul" aria-hidden="true">
    <!--
      가이드선(피그마와 같아요)
      - 평소: 얇은 선(0.5) — 페이지 것은 캔버스 끝까지, 프레임 것은 그 프레임 위에만. 올리면 1
      - 프레임 · 가이드선을 고르면: 그 가이드선은 파랑 1, 프레임 위 실선 + 밖으로 점선, 눈금자에 숫자
      - 숫자는 눈금자 위에만(캔버스에 칩을 띄우지 않아요)
      - 끄는 동안: 빨강 1, 프레임 위 실선 + 밖으로 점선, 눈금자에 숫자
    -->
    <div v-for="g in shown" :key="(g.owner ?? '') + g.axis + g.i" :class="['guide', g.axis === 'x' ? 'gx' : 'gy', { gsel: isAct(g), fr: isAct(g) && !!g.f, thin: !isAct(g) }]" :style="{ ...(g.axis === 'x' ? { left: sx(g.v) + 'px' } : { top: sy(g.v) + 'px' }), ...(g.f && !isAct(g) ? span(g) : {}) }" @pointerdown="start(g.axis, g, $event)">
      <i v-if="isAct(g) && g.f" class="seg" :style="seg(g)!" />
    </div>
    <div v-if="drag && !drag.out" :class="['guide', 'live', drag.axis === 'x' ? 'gx' : 'gy', { fr: !!drag.f }]" :style="drag.axis === 'x' ? { left: sx(drag.v) + 'px' } : { top: sy(drag.v) + 'px' }">
      <i v-if="drag.f" class="seg" :style="seg(drag)!" />
    </div>

    <!-- 눈금자: 캔버스 전체(가로 · 세로). 양쪽 패널은 눈금자 두께만큼 안으로 들어와요 -->
    <template v-if="rulers">
      <div class="bar top" :style="{ left: inset + 'px', right: insetR + 'px' }" @pointerdown="start('y', null, $event)">
        <div v-if="sel" class="band" :style="{ left: sx(sel.x) - inset + 'px', width: sel.w * vp.zoom + 'px' }" />
        <template v-for="v in xt" :key="'x' + v"><i class="tk" :style="{ left: sx(v) - inset + 'px' }" /><span v-if="!hideLb('x', v)" class="lb" :style="{ left: sx(v) - inset + 3 + 'px' }">{{ fmt(v) }}</span></template>
        <template v-if="sel"><span class="lb sv" :style="{ left: sx(sel.x) - inset + 'px' }">{{ fmt(sel.x) }}</span><span class="lb sv end" :style="{ left: sx(sel.x + sel.w) - inset + 'px' }">{{ fmt(sel.x + sel.w) }}</span></template>
        <span v-for="(m, k) in marks.filter((m) => m.axis === 'x')" :key="'mx' + k" class="lb gm" :style="{ left: sx(m.v) - inset + 'px' }">{{ m.t }}</span>
      </div>
      <div class="bar left" :style="{ left: inset + 'px' }" @pointerdown="start('x', null, $event)">
        <div v-if="sel" class="band" :style="{ top: sy(sel.y) + 'px', height: sel.h * vp.zoom + 'px' }" />
        <template v-for="v in yt" :key="'y' + v"><i class="tk" :style="{ top: sy(v) + 'px' }" /><span v-if="!hideLb('y', v)" class="lb" :style="{ top: sy(v) + 3 + 'px' }">{{ fmt(v) }}</span></template>
        <template v-if="sel"><span class="lb sv" :style="{ top: sy(sel.y) + 'px' }">{{ fmt(sel.y) }}</span><span class="lb sv end" :style="{ top: sy(sel.y + sel.h) + 'px' }">{{ fmt(sel.y + sel.h) }}</span></template>
        <span v-for="(m, k) in marks.filter((m) => m.axis === 'y')" :key="'my' + k" class="lb gm" :style="{ top: sy(m.v) + 'px' }">{{ m.t }}</span>
      </div>
      <div class="corner" :style="{ left: inset + 'px' }" />
    </template>
  </div>
</template>

<style scoped>
.rul { position: absolute; inset: 0; pointer-events: none; z-index: 2; overflow: hidden; }
.guide { position: absolute; pointer-events: auto; }
.guide::after { content: ''; position: absolute; background: var(--g-c, #F04A26); }
.gx { top: 0; bottom: 0; width: 7px; margin-left: -3px; cursor: ew-resize; }
.gx::after { left: 3px; top: 0; bottom: 0; width: 1px; }
.gy { left: 0; right: 0; height: 7px; margin-top: -3px; cursor: ns-resize; }
.gy::after { top: 3px; left: 0; right: 0; height: 1px; }
.live { pointer-events: none; }
/* 끄는 중인 프레임 가이드선: 밖은 점선(4 · 4), 프레임 위(.seg)는 실선 */
.guide.fr::after { background: repeating-linear-gradient(var(--g-dir), var(--g-c, #F04A26) 0 4px, transparent 4px 8px); }
.gx.fr { --g-dir: to bottom; }
.gy.fr { --g-dir: to right; }
.seg { position: absolute; background: var(--g-c, #F04A26); pointer-events: none; }
.gx .seg { left: 3px; width: 1px; }
.gy .seg { top: 3px; height: 1px; }
/* 올리면 조금 굵게 — 프레임 가이드선은 점선 사이를 메우지 않게 실선 부분만 */
/* 평소엔 얇게(0.5), 올리면 1 */
.gx.thin::after { transform: scaleX(0.5); }
.gy.thin::after { transform: scaleY(0.5); }
.guide.thin:hover::after { transform: none; }
.guide.gsel { --g-c: var(--iris-select, #0E97FC); }
.bar { position: absolute; background: var(--sys-color-common-white-default); pointer-events: auto; font-family: var(--font-family-base); color: var(--sys-color-neutral-500); overflow: hidden; }
.bar.top { top: 0; height: 18px; box-shadow: 0 1px 0 var(--iris-line); cursor: ns-resize; }
.bar.left { top: 0; bottom: 0; left: 0; width: 18px; box-shadow: 1px 0 0 var(--iris-line); cursor: ew-resize; }
.corner { position: absolute; left: 0; top: 0; width: 18px; height: 18px; background: var(--sys-color-common-white-default); box-shadow: 1px 1px 0 var(--iris-line); }
.tk { position: absolute; background: var(--sys-color-neutral-300); }
.top .tk { bottom: 0; width: 1px; height: 6px; }
.left .tk { right: 0; height: 1px; width: 6px; }
.lb { position: absolute; font-size: 10px; line-height: 12px; white-space: nowrap; font-variant-numeric: proportional-nums; }
.top .lb { top: 1px; }
.left .lb { left: 1px; writing-mode: vertical-rl; transform: rotate(180deg); }
/* 가이드선 숫자: 빨강 500, 선 오른쪽(아래)에 흰 바탕 */
.lb.gm { color: #F04A26; font-weight: 500; background: var(--sys-color-common-white-default); padding: 0 2px; margin-left: 2px; }
.left .lb.gm { margin: 2px 0 0; }
.band { position: absolute; background: color-mix(in srgb, var(--iris-select, #0E97FC) 14%, transparent); }
.top .band { top: 0; bottom: 0; }
.left .band { left: 0; right: 0; }
.lb.sv { color: var(--iris-select, #0E97FC); font-weight: 500; background: var(--sys-color-common-white-default); padding: 0 2px; }
.top .lb.sv.end { transform: translateX(-100%); }
.left .lb.sv.end { transform: rotate(180deg) translateY(100%); }
</style>
