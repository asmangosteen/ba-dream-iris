<script setup lang="ts">
import type { Paint } from '~/canvas/schema'
import { gradHandles } from '~/canvas/paint'
import { useLayerStore } from '~/canvas/store'
import type { GradEdit } from '~/composables/useGradEdit'

/**
 * 캔버스 위 그라디언트 점(피그마와 같아요): 칠 창에서 그라디언트를 고치는 동안 레이어 위에 시작 · 끝 점과 색 칩을 보여요.
 * 점(또는 칩)을 끌면 방향 · 길이가 바뀌어요 — 선형은 시작 → 끝, 원형 · 각도형은 가운데 → 가장자리. 끄는 동안 기록은 한 번(실행취소 한 번)
 * mat: 레이어 안 px → 캔버스 화면 좌표(EditorCanvas 바깥 층 기준)
 */
type Grad = Extract<Paint, { type: 'linear' | 'radial' | 'angular' }>
type Mat = { a: number; b: number; c: number; d: number; e: number; f: number }
const props = defineProps<{ edit: GradEdit; paint: Grad; w: number; h: number; mat: Mat }>()
const store = useLayerStore()

const ap = (m: Mat, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })
const pts = computed(() => {
  const { from, to } = gradHandles(props.paint)
  return { from: ap(props.mat, from[0] * props.w, from[1] * props.h), to: ap(props.mat, to[0] * props.w, to[1] * props.h) }
})
const sorted = computed(() => [...props.paint.stops].sort((a, b) => a.pos - b.pos))
const colorOf = (c?: string) => (c ? store.color(c) ?? c : 'transparent')
/** 칩 색: 시작 점 = 첫 색, 끝 점 = 마지막 색 */
const chips = computed(() => ({ from: colorOf(sorted.value[0]?.color), to: colorOf(sorted.value[sorted.value.length - 1]?.color) }))

/** 화면 좌표 → 레이어 상자 비율(0~1) */
function toLocal(x: number, y: number): [number, number] {
  const m = props.mat
  const det = m.a * m.d - m.b * m.c || 1
  const lx = (m.d * (x - m.e) - m.c * (y - m.f)) / det
  const ly = (-m.b * (x - m.e) + m.a * (y - m.f)) / det
  const r4 = (v: number) => Math.round(v * 10000) / 10000
  return [r4(props.w ? lx / props.w : 0.5), r4(props.h ? ly / props.h : 0.5)]
}
const root = ref<HTMLElement | null>(null)
function down(which: 'from' | 'to', e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault(); e.stopPropagation()
  const host = root.value?.parentElement?.getBoundingClientRect()
  if (!host) return
  const { sid, ids, key, index } = props.edit
  store.hold(sid)
  const move = (ev: PointerEvent) => {
    const pt = toLocal(ev.clientX - host.left, ev.clientY - host.top)
    for (const id of ids) {
      const n = store.node(sid, id)
      const list = [...((n?.style[key] ?? []) as Paint[])]
      const p = list[index]
      if (!p || (p.type !== 'linear' && p.type !== 'radial' && p.type !== 'angular')) continue
      const cur = gradHandles(p)
      list[index] = { ...p, from: which === 'from' ? pt : cur.from, to: which === 'to' ? pt : cur.to, angle: undefined }
      store.style(sid, [id], { [key]: list })
    }
  }
  const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); store.release(sid) }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}
</script>

<template>
  <div ref="root" class="gh" aria-hidden="true">
    <svg class="gh-line" width="100%" height="100%">
      <line :x1="pts.from.x" :y1="pts.from.y" :x2="pts.to.x" :y2="pts.to.y" />
    </svg>
    <template v-for="k in (['from', 'to'] as const)" :key="k">
      <span class="dot" :style="{ left: pts[k].x + 'px', top: pts[k].y + 'px' }" @pointerdown="down(k, $event)" />
      <span class="chip" :style="{ left: pts[k].x + 'px', top: pts[k].y + 'px', '--c': chips[k] }" @pointerdown="down(k, $event)"><i /></span>
    </template>
  </div>
</template>

<style scoped>
.gh { position: absolute; inset: 0; pointer-events: none; z-index: 30; } /* 선택 상자 손잡이(크기 조절)보다 위 — 점을 누르면 점이 잡혀요 */
.gh-line { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
/* 선: 흰 선 + 어두운 테두리(어떤 바탕에서도 보이게) */
.gh-line line { stroke: #FFFFFF; stroke-width: 1.5; filter: drop-shadow(0 0 1px rgb(3 9 26 / 55%)); }
/* 끝 점: 흰 동그라미 */
.dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 1px rgb(3 9 26 / 35%), 0 1px 3px rgb(3 9 26 / 25%); pointer-events: auto; cursor: move; touch-action: none; }
/* 색 칩: 점 오른쪽에 그 끝의 색(피그마와 같아요) — 끌어도 같은 점이 움직여요 */
.chip { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 10px; box-sizing: border-box; border-radius: 4px; background: #FFFFFF; padding: 2px; box-shadow: 0 0 0 1px rgb(3 9 26 / 18%), 0 2px 6px rgb(3 9 26 / 20%); pointer-events: auto; cursor: move; touch-action: none; }
.chip i { display: block; width: 100%; height: 100%; border-radius: 2px; background: var(--c); box-shadow: inset 0 0 0 1px rgb(3 9 26 / 10%); }
</style>
