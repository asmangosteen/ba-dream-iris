<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { LayoutGrid } from '~/canvas/schema'
import { colorLabel, parseColor } from '~/canvas/tokens'

/** Layout grid (피그마와 같아요): Columns · Rows · Grid. ⌃G 로 모두 숨기기 · 보이기 */
const props = defineProps<{ grids: LayoutGrid[] }>()
const emit = defineEmits<{ change: [grids: LayoutGrid[] | undefined] }>()
const open = ref<number | null>(null)
const TYPES: { k: LayoutGrid['type']; label: string }[] = [{ k: 'columns', label: 'Columns' }, { k: 'rows', label: 'Rows' }, { k: 'grid', label: 'Grid' }]
const out = (l: LayoutGrid[]) => emit('change', l.length ? l : undefined)
function add() { out([...props.grids, { type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF000019' }]); open.value = props.grids.length }
function set(i: number, patch: Partial<LayoutGrid>) { out(props.grids.map((g, k) => (k === i ? { ...g, ...patch } : g))) }
function setType(i: number, t: LayoutGrid['type']) { set(i, t === 'grid' ? { type: t, size: 8, color: '#FF000019' } : { type: t, count: props.grids[i]?.count ?? 4, gutter: props.grids[i]?.gutter ?? 16, margin: props.grids[i]?.margin ?? 16 }) }
function num(i: number, key: 'count' | 'gutter' | 'margin' | 'size', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) set(i, { [key]: Math.max(key === 'count' || key === 'size' ? 1 : 0, Math.round(v)) })
}
const hex = (c?: string) => parseColor(c)?.hex ?? '#FF0000'
const alpha = (c?: string) => parseColor(c)?.a ?? 0.1
const withA = (h: string, a: number) => (a >= 1 ? h : h + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase())
const label = (g: LayoutGrid) => (g.type === 'grid' ? `Grid (${g.size ?? 8}px)` : `${g.count ?? 4} ${g.type === 'columns' ? 'columns' : 'rows'}`)
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <section class="s">
    <div class="sec-h h24"><span>Layout grid</span><button class="ib s24" aria-label="Add layout grid" title="Add layout grid" @click="add"><Icon name="plus" :size="14" /></button></div>
    <div v-for="(g, i) in grids" :key="i">
      <div class="row" :class="{ off: g.visible === false }">
        <button class="ib s24" :class="{ on: open === i }" aria-label="Layout grid settings" title="Layout grid settings" @click="open = open === i ? null : i">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path :d="g.type === 'columns' ? 'M2.5 2v10M7 2v10M11.5 2v10' : g.type === 'rows' ? 'M2 2.5h10M2 7h10M2 11.5h10' : 'M2 4.5h10M2 9.5h10M4.5 2v10M9.5 2v10'" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
        </button>
        <span class="name" @click="open = open === i ? null : i">{{ label(g) }}</span>
        <button class="ib s24" :aria-label="g.visible === false ? 'Show layout grid' : 'Hide layout grid'" :title="g.visible === false ? 'Show' : 'Hide'" @click="set(i, { visible: g.visible === false ? undefined : false })">
          <svg v-if="g.visible !== false" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M5.2 3.3A6 6 0 0 1 7 3c3.5 0 5.5 4 5.5 4a9 9 0 0 1-1.6 2.1M8.8 10.7A6 6 0 0 1 7 11c-3.5 0-5.5-4-5.5-4a9 9 0 0 1 1.6-2.1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        </button>
        <button class="ib s24" aria-label="Remove layout grid" title="Remove" @click="out(grids.filter((_, k) => k !== i)); open = null"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
      </div>
      <div v-if="open === i" class="sq editor">
        <div class="seg"><button v-for="t in TYPES" :key="t.k" :class="['seg-b', { on: g.type === t.k }]" @click="setType(i, t.k)">{{ t.label }}</button></div>
        <div v-if="g.type === 'grid'" class="grid2"><label class="sq fld"><span>Size</span><input :key="'s' + g.size" :value="g.size ?? 8" inputmode="numeric" aria-label="Grid size" @change="num(i, 'size', $event)" @keydown="blur"></label></div>
        <div v-else class="grid2">
          <label class="sq fld"><span>Count</span><input :key="'c' + g.count" :value="g.count ?? 4" inputmode="numeric" aria-label="Count" @change="num(i, 'count', $event)" @keydown="blur"></label>
          <label class="sq fld"><span>Gutter</span><input :key="'g' + g.gutter" :value="g.gutter ?? 16" inputmode="numeric" aria-label="Gutter" @change="num(i, 'gutter', $event)" @keydown="blur"></label>
          <label class="sq fld"><span>Margin</span><input :key="'m' + g.margin" :value="g.margin ?? 16" inputmode="numeric" aria-label="Margin" @change="num(i, 'margin', $event)" @keydown="blur"></label>
        </div>
        <label class="sq fld">
          <input type="color" class="swatch" :value="hex(g.color)" aria-label="Grid color" @change="set(i, { color: withA(($event.target as HTMLInputElement).value.toUpperCase(), alpha(g.color)) })">
          <span class="grow">{{ colorLabel(hex(g.color)) }}</span>
          <input :key="'a' + g.color" class="pct" :value="Math.round(alpha(g.color) * 100) + '%'" aria-label="Grid opacity" @change="(e) => { const a = Number((e.target as HTMLInputElement).value.replace('%', '')); if (Number.isFinite(a)) set(i, { color: withA(hex(g.color), Math.min(100, Math.max(0, a)) / 100) }) }" @keydown="blur">
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.row { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.row.off { opacity: 0.45; }
.name { flex: 1; font-size: 12px; color: var(--sys-color-neutral-800); cursor: pointer; }
.grow { flex: 1; font-size: 12px; color: var(--sys-color-neutral-800); }
.ib.on { --sq-fill: var(--sys-color-neutral-200); }
.editor { margin-top: var(--ref-spacing-04); padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 2px; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); }
.seg-b { height: 24px; border-radius: var(--ref-radius-02); font-size: 11px; color: var(--sys-color-neutral-600); }
.seg-b.on { background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); font-weight: 500; box-shadow: 0 1px 2px rgb(0 0 0 / 8%); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.pct { width: 40px !important; flex: none; text-align: right; color: var(--sys-color-neutral-600) !important; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
