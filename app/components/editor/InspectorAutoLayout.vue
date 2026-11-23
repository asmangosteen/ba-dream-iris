<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { AutoLayout, LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'

/** Auto layout (피그마와 같아요): 방향 · 간격(Auto = 사이 띄우기) · 안쪽 여백 · 정렬 */
const props = defineProps<{ sid: string; ids: string[] }>()
const store = useLayerStore()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
/** 고른 것이 모두 오토 레이아웃일 때만 조절 칸, 아니면 + (여러 개 · 프레임 아닌 것은 새 프레임으로 감싸서 걸어요) */
const l = computed(() => (nodes.value.length && nodes.value.every((n) => n.style.layout) ? nodes.value[0]!.style.layout : undefined))
const sepPad = ref(false)
watch(() => props.ids.join(), () => { const p = l.value?.padding; sepPad.value = !!p && !(p[0] === p[2] && p[1] === p[3]) }, { immediate: true })

function set(patch: Partial<AutoLayout>) {
  store.update(props.sid, props.ids, (n) => (n.style.layout ? { style: { ...n.style, layout: { ...n.style.layout, ...patch } } } : {}))
}
function num(e: Event, fn: (v: number) => void, min = 0) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) fn(Math.max(min, Math.round(v * 10) / 10))
}
const pad = (i: number, v: number) => { const p = [...(l.value?.padding ?? [0, 0, 0, 0])] as AutoLayout['padding']; p[i] = v; set({ padding: p }) }
const padHV = (axis: 'h' | 'v', v: number) => { const p = [...(l.value?.padding ?? [0, 0, 0, 0])] as AutoLayout['padding']; if (axis === 'h') { p[1] = v; p[3] = v } else { p[0] = v; p[2] = v } set({ padding: p }) }
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
/** 3 × 3 정렬: 가로(왼 · 가운데 · 오른) × 세로(위 · 가운데 · 아래) → 진행 · 수직 정렬 */
const AL = ['start', 'center', 'end'] as const
function pick(col: number, row: number) {
  const h = l.value?.mode === 'horizontal'
  set(h ? { align: AL[col], cross: AL[row] } : { align: AL[row], cross: AL[col] })
}
const isOn = (col: number, row: number) => {
  const v = l.value
  if (!v) return false
  return v.mode === 'horizontal' ? (v.gap === 'auto' || v.align === AL[col]) && v.cross === AL[row] : (v.gap === 'auto' || v.align === AL[row]) && v.cross === AL[col]
}
</script>

<template>
  <section class="s">
    <div class="sec-h h24">
      <span>Auto layout</span>
      <button v-if="!l" class="ib s24" aria-label="Add auto layout (⇧A)" title="Add auto layout ⇧A" @click="store.addAutoLayout(sid, ids)"><Icon name="plus" :size="14" /></button>
      <button v-else class="ib s24" aria-label="Remove auto layout (⌥⇧A)" title="Remove auto layout ⌥⇧A" @click="store.removeAutoLayout(sid, ids)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
    </div>
    <template v-if="l">
      <div class="row">
        <div class="grp">
          <button :class="['ib', { on: l.mode === 'vertical' && !l.wrap }]" aria-label="Vertical layout" title="Vertical layout" @click="set({ mode: 'vertical', wrap: undefined })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M4 9l3 3 3-3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: l.mode === 'horizontal' && !l.wrap }]" aria-label="Horizontal layout" title="Horizontal layout" @click="set({ mode: 'horizontal', wrap: undefined })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M9 4l3 3-3 3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: !!l.wrap }]" aria-label="Wrap" title="Wrap" @click="set({ mode: 'horizontal', wrap: true })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 4h8a2.5 2.5 0 0 1 0 5H5M7 7l-2 2 2 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        </div>
      </div>
      <div class="cols">
        <div class="align" role="group" aria-label="Alignment">
          <template v-for="row in 3" :key="row">
            <button v-for="col in 3" :key="col" :class="['dot', { on: isOn(col - 1, row - 1) }]" :aria-label="`Align ${['top', 'middle', 'bottom'][row - 1]} ${['left', 'center', 'right'][col - 1]}`" @click="pick(col - 1, row - 1)"><i /></button>
          </template>
        </div>
        <div class="side">
          <label class="sq fld" title="Gap between items">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path :d="l.mode === 'horizontal' ? 'M2 3v8M12 3v8M5.5 7h3' : 'M3 2h8M3 12h8M7 5.5v3'" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
            <input v-if="l.gap !== 'auto'" :key="'g' + l.gap" :value="l.gap" inputmode="decimal" aria-label="Gap between items" @change="num($event, (v) => set({ gap: v }))" @keydown="blur">
            <span v-else class="auto">Auto</span>
          </label>
          <button :class="['cb', { on: l.gap === 'auto' }]" @click="set({ gap: l.gap === 'auto' ? 10 : 'auto' })"><i />Space between</button>
          <label v-if="l.wrap" class="sq fld" title="Gap between rows"><span>Row</span><input :key="'rg' + l.rowGap" :value="l.rowGap ?? (l.gap === 'auto' ? 0 : l.gap)" inputmode="decimal" aria-label="Gap between rows" @change="num($event, (v) => set({ rowGap: v }))" @keydown="blur"></label>
        </div>
      </div>
      <div class="pad-h"><span class="sub">Padding</span><button :class="['ib', 's24', { on: sepPad }]" aria-label="Individual padding" title="Individual padding" @click="sepPad = !sepPad"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M5 5h4v4H5z" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1" /></svg></button></div>
      <div v-if="!sepPad" class="grid2">
        <label class="sq fld" title="Horizontal padding"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2v10M12 2v10M5 7h4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg><input :key="'ph' + l.padding[3]" :value="l.padding[3] === l.padding[1] ? l.padding[3] : ''" :placeholder="l.padding[3] === l.padding[1] ? '' : 'Mixed'" inputmode="decimal" aria-label="Horizontal padding" @change="num($event, (v) => padHV('h', v))" @keydown="blur"></label>
        <label class="sq fld" title="Vertical padding"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2h10M2 12h10M7 5v4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg><input :key="'pv' + l.padding[0]" :value="l.padding[0] === l.padding[2] ? l.padding[0] : ''" :placeholder="l.padding[0] === l.padding[2] ? '' : 'Mixed'" inputmode="decimal" aria-label="Vertical padding" @change="num($event, (v) => padHV('v', v))" @keydown="blur"></label>
      </div>
      <div v-else class="grid4">
        <label v-for="(nm, i) in ['Top', 'Right', 'Bottom', 'Left']" :key="nm" class="sq fld" :title="`${nm} padding`"><span>{{ nm[0] }}</span><input :key="nm + l.padding[i]" :value="l.padding[i]" inputmode="decimal" :aria-label="`${nm} padding`" @change="num($event, (v) => pad(i, v))" @keydown="blur"></label>
      </div>
    </template>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.row { display: flex; }
.cols { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: var(--ref-spacing-04); align-items: start; }
.align { display: grid; grid-template-columns: repeat(3, 1fr); width: 72px; height: 72px; padding: 4px; box-sizing: border-box; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); }
.dot { display: grid; place-items: center; border-radius: 3px; }
.dot i { width: 4px; height: 4px; border-radius: 1px; background: var(--sys-color-neutral-400); }
.dot:hover i { background: var(--sys-color-neutral-700); }
.dot.on i { width: 12px; height: 4px; background: var(--iris-select, #0D99FF); }
.side { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.auto { font-size: 12px; color: var(--sys-color-neutral-600); }
.pad-h { display: flex; align-items: center; justify-content: space-between; }
.sub { font-size: 11px; color: var(--sys-color-neutral-500); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.grid4 .fld { padding: 0 var(--ref-spacing-04); gap: var(--ref-spacing-02); }
.fld > svg { flex: none; color: var(--sys-color-neutral-600); }
.ib.on { --sq-fill: var(--sys-color-neutral-200); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
