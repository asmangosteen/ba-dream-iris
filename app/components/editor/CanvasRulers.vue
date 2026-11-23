<script setup lang="ts">
/**
 * 눈금자(⇧R)와 가이드선(피그마와 같아요).
 * 눈금자에서 캔버스 쪽으로 끌면 가이드선이 생기고, 가이드선을 끌어 옮기거나 눈금자로 되돌려 놓으면 지워져요.
 * 가이드선은 캔버스 좌표로 페이지 설정(pages.viewport.guides)에 저장됩니다.
 */
export interface Guides { x: number[]; y: number[] }
const props = defineProps<{ vp: { x: number; y: number; zoom: number }; guides: Guides; sel: { x: number; y: number; w: number; h: number } | null; rulers: boolean }>()
const emit = defineEmits<{ change: [g: Guides] }>()
const R = 18
const root = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
const inset = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  const el = root.value?.parentElement
  if (!el) return
  const fit = () => {
    size.value = { w: el.clientWidth, h: el.clientHeight }
    // 떠 있는 왼쪽 패널에 가리지 않게 그 오른쪽에 붙여요
    const pl = document.querySelector('.panel-left')?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    inset.value = pl && pl.width ? Math.max(0, Math.round(pl.right - r.left + 8)) : 0
  }
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(el)
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
const fmt = (v: number) => String(Math.round(v))

// 끌기: 새 가이드 · 옮기기
const drag = ref<{ axis: 'x' | 'y'; i: number | null; v: number; out: boolean; moved: boolean; v0: number } | null>(null)
/** 고른 가이드선: Backspace · Delete 로 지워요 */
const picked = ref<{ axis: 'x' | 'y'; i: number } | null>(null)
watch(() => props.guides, () => { if (picked.value && props.guides[picked.value.axis][picked.value.i] === undefined) picked.value = null })
function onKey(e: KeyboardEvent) {
  if (!picked.value || (e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault(); e.stopImmediatePropagation()
    const { axis, i } = picked.value
    picked.value = null
    emit('change', { ...props.guides, [axis]: props.guides[axis].filter((_, k) => k !== i) })
  } else if (e.key === 'Escape') picked.value = null
}
function onDocDown(e: PointerEvent) { if (!(e.target as HTMLElement).closest?.('.guide')) picked.value = null }
onMounted(() => { window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onDocDown, true) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDocDown, true) })
function toWorld(axis: 'x' | 'y', e: PointerEvent) {
  const r = root.value!.getBoundingClientRect()
  return axis === 'x' ? Math.round((e.clientX - r.left - props.vp.x) / props.vp.zoom) : Math.round((e.clientY - r.top - props.vp.y) / props.vp.zoom)
}
function inRuler(axis: 'x' | 'y', e: PointerEvent) {
  const r = root.value!.getBoundingClientRect()
  return axis === 'x' ? e.clientX - r.left - inset.value < R && e.clientX - r.left >= inset.value - 4 : e.clientY - r.top < R
}
function start(axis: 'x' | 'y', i: number | null, e: PointerEvent) {
  e.preventDefault(); e.stopPropagation()
  const v = i === null ? toWorld(axis, e) : props.guides[axis][i]!
  drag.value = { axis, i, v, v0: v, out: i === null, moved: false }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  d.v = toWorld(d.axis, e)
  if (d.v !== d.v0) d.moved = true
  d.out = props.rulers && inRuler(d.axis, e)
}
function end() {
  window.removeEventListener('pointermove', move)
  const d = drag.value
  drag.value = null
  if (!d) return
  // 끌지 않고 누르기만 하면 고르기
  if (d.i !== null && !d.moved) { picked.value = { axis: d.axis, i: d.i }; return }
  if (d.i === null && !d.moved) return
  const list = [...props.guides[d.axis]]
  if (d.i !== null) list.splice(d.i, 1)
  if (!d.out) list.push(d.v)
  emit('change', { ...props.guides, [d.axis]: list })
}
const shownX = computed(() => props.guides.x.map((v, i) => ({ v, i })).filter((g) => !(drag.value?.axis === 'x' && drag.value.i === g.i)))
const shownY = computed(() => props.guides.y.map((v, i) => ({ v, i })).filter((g) => !(drag.value?.axis === 'y' && drag.value.i === g.i)))
</script>

<template>
  <div ref="root" class="rul" aria-hidden="true">
    <!-- 가이드선 -->
    <template v-for="g in shownX" :key="'gx' + g.i">
      <div :class="['guide', 'gx', { on: picked?.axis === 'x' && picked.i === g.i }]" :style="{ left: sx(g.v) + 'px' }" @pointerdown="start('x', g.i, $event)"><span v-if="picked?.axis === 'x' && picked.i === g.i" class="gv">{{ fmt(g.v) }}</span></div>
    </template>
    <template v-for="g in shownY" :key="'gy' + g.i">
      <div :class="['guide', 'gy', { on: picked?.axis === 'y' && picked.i === g.i }]" :style="{ top: sy(g.v) + 'px' }" @pointerdown="start('y', g.i, $event)"><span v-if="picked?.axis === 'y' && picked.i === g.i" class="gv">{{ fmt(g.v) }}</span></div>
    </template>
    <div v-if="drag && !drag.out" :class="['guide', 'live', drag.axis === 'x' ? 'gx' : 'gy']" :style="drag.axis === 'x' ? { left: sx(drag.v) + 'px' } : { top: sy(drag.v) + 'px' }"><span class="gv">{{ fmt(drag.v) }}</span></div>

    <!-- 눈금자 -->
    <template v-if="rulers">
      <div class="bar top" @pointerdown="start('y', null, $event)">
        <div v-if="sel" class="band" :style="{ left: sx(sel.x) + 'px', width: sel.w * vp.zoom + 'px' }" />
        <template v-for="v in xt" :key="'x' + v"><i class="tk" :style="{ left: sx(v) + 'px' }" /><span class="lb" :style="{ left: sx(v) + 3 + 'px' }">{{ fmt(v) }}</span></template>
        <template v-if="sel"><span class="lb sv" :style="{ left: sx(sel.x) + 'px' }">{{ fmt(sel.x) }}</span><span class="lb sv end" :style="{ left: sx(sel.x + sel.w) + 'px' }">{{ fmt(sel.x + sel.w) }}</span></template>
      </div>
      <div class="bar left" :style="{ left: inset + 'px' }" @pointerdown="start('x', null, $event)">
        <div v-if="sel" class="band" :style="{ top: sy(sel.y) + 'px', height: sel.h * vp.zoom + 'px' }" />
        <template v-for="v in yt" :key="'y' + v"><i class="tk" :style="{ top: sy(v) + 'px' }" /><span class="lb" :style="{ top: sy(v) + 3 + 'px' }">{{ fmt(v) }}</span></template>
        <template v-if="sel"><span class="lb sv" :style="{ top: sy(sel.y) + 'px' }">{{ fmt(sel.y) }}</span><span class="lb sv end" :style="{ top: sy(sel.y + sel.h) + 'px' }">{{ fmt(sel.y + sel.h) }}</span></template>
      </div>
      <div class="corner" :style="{ left: inset + 'px' }" />
    </template>
  </div>
</template>

<style scoped>
.rul { position: absolute; inset: 0; pointer-events: none; z-index: 2; overflow: hidden; }
.guide { position: absolute; pointer-events: auto; }
.guide::after { content: ''; position: absolute; background: #F24822; }
.gx { top: 0; bottom: 0; width: 7px; margin-left: -3px; cursor: ew-resize; }
.gx::after { left: 3px; top: 0; bottom: 0; width: 1px; }
.gy { left: 0; right: 0; height: 7px; margin-top: -3px; cursor: ns-resize; }
.gy::after { top: 3px; left: 0; right: 0; height: 1px; }
.live { pointer-events: none; }
.guide.on::after { background: var(--iris-select, #0D99FF); }
.guide.on .gv { background: var(--iris-select, #0D99FF); }
.guide:hover::after { box-shadow: 0 0 0 0.5px #F24822; }
.gv { position: absolute; left: 8px; top: 24px; padding: 0 4px; border-radius: 3px; background: #F24822; color: #FFF; font-size: 11px; line-height: 16px; font-family: var(--font-family-base); }
.gy .gv { top: 8px; left: 24px; }
.bar { position: absolute; background: var(--sys-color-common-white-default); pointer-events: auto; font-family: var(--font-family-base); color: var(--sys-color-neutral-500); overflow: hidden; }
.bar.top { left: 0; right: 0; top: 0; height: 18px; box-shadow: 0 1px 0 var(--iris-line); cursor: ns-resize; }
.bar.left { top: 0; bottom: 0; left: 0; width: 18px; box-shadow: 1px 0 0 var(--iris-line); cursor: ew-resize; }
.corner { position: absolute; left: 0; top: 0; width: 18px; height: 18px; background: var(--sys-color-common-white-default); box-shadow: 1px 1px 0 var(--iris-line); }
.tk { position: absolute; background: var(--sys-color-neutral-300); }
.top .tk { bottom: 0; width: 1px; height: 6px; }
.left .tk { right: 0; height: 1px; width: 6px; }
.lb { position: absolute; font-size: 9px; line-height: 10px; white-space: nowrap; }
.top .lb { top: 2px; }
.left .lb { left: 2px; writing-mode: vertical-rl; transform: rotate(180deg); }
.band { position: absolute; background: color-mix(in srgb, var(--iris-select, #0D99FF) 14%, transparent); }
.top .band { top: 0; bottom: 0; }
.left .band { left: 0; right: 0; }
.lb.sv { color: var(--iris-select, #0D99FF); font-weight: 600; background: var(--sys-color-common-white-default); padding: 0 2px; }
.top .lb.sv.end { transform: translateX(-100%); }
.left .lb.sv.end { transform: rotate(180deg) translateY(100%); }
</style>
