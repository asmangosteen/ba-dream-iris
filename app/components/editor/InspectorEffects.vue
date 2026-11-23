<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { Effect, LayerNode } from '~/canvas/schema'
import { colorLabel, parseColor } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import ColorField from '~/components/editor/ColorField.vue'

/** Effects: Drop shadow · Inner shadow · Layer blur · Background blur (피그마와 같아요) */
const props = defineProps<{ sid: string; ids: string[] }>()
const store = useLayerStore()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const list = computed<Effect[]>(() => nodes.value[0]?.style.effects ?? [])
const TYPES: { k: Effect['type']; label: string }[] = [
  { k: 'drop', label: 'Drop shadow' }, { k: 'inner', label: 'Inner shadow' }, { k: 'blur', label: 'Layer blur' }, { k: 'bgblur', label: 'Background blur' },
]
const open = ref<number | null>(null)
const menu = ref<number | null>(null)
watch(() => props.ids.join(), () => { open.value = null; menu.value = null })

function setList(fn: (l: Effect[]) => Effect[]) {
  store.update(props.sid, props.ids, (n) => { const next = fn([...(n.style.effects ?? [])]); return { style: { ...n.style, effects: next.length ? next : undefined } } })
}
function add() { setList((l) => [...l, { type: 'drop', x: 0, y: 4, blur: 4, spread: 0, color: '#00000040' }]); open.value = list.value.length }
function setType(i: number, t: Effect['type']) {
  setList((l) => l.map((e, k) => {
    if (k !== i || e.type === t) return e
    if (t === 'blur' || t === 'bgblur') return { type: t, blur: e.type === 'blur' || e.type === 'bgblur' ? e.blur : 4, visible: e.visible }
    return e.type === 'drop' || e.type === 'inner' ? { ...e, type: t } : { type: t, x: 0, y: 4, blur: 4, spread: 0, color: '#00000040', visible: e.visible }
  }))
  menu.value = null
}
function set(i: number, patch: Partial<Record<'x' | 'y' | 'blur' | 'spread', number>> | { color: string } | { visible: boolean | undefined }) {
  setList((l) => l.map((e, k) => (k === i ? ({ ...e, ...patch } as Effect) : e)))
}
function num(i: number, key: 'x' | 'y' | 'blur' | 'spread', ev: Event) {
  const v = Number((ev.target as HTMLInputElement).value)
  if (Number.isFinite(v)) set(i, { [key]: key === 'blur' ? Math.max(0, v) : v })
}
const hex = (c: string) => parseColor(c)?.hex ?? '#000000'
const alpha = (c: string) => parseColor(c)?.a ?? 1
const withA = (h: string, a: number) => (a >= 1 ? h : h + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase())
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
const shadow = (e: Effect): e is Extract<Effect, { type: 'drop' | 'inner' }> => e.type === 'drop' || e.type === 'inner'
</script>

<template>
  <section class="s">
    <div class="sec-h h24"><span>Effects</span><button class="ib s24" aria-label="Add effect" title="Add effect" @click="add"><Icon name="plus" :size="14" /></button></div>
    <div v-for="(e, i) in list" :key="i" class="item">
      <div class="row" :class="{ off: e.visible === false }">
        <button class="ib s24" :class="{ on: open === i }" aria-label="Effect settings" title="Effect settings" @click="open = open === i ? null : i">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path v-if="e.type === 'drop'" d="M3 3h6v6H3z M5 11h6V5" fill="none" stroke="currentColor" stroke-width="1.2" /><path v-else-if="e.type === 'inner'" d="M2.5 2.5h9v9h-9z M4.5 4.5h5" fill="none" stroke="currentColor" stroke-width="1.2" /><path v-else d="M7 2a5 5 0 1 0 0 10A5 5 0 1 0 7 2z M7 4.5v5 M4.5 7h5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.4" /></svg>
        </button>
        <div class="rel grow">
          <button :class="['sq', 'dd', { open: menu === i }]" :aria-expanded="menu === i" @click="menu = menu === i ? null : i"><span>{{ TYPES.find((t) => t.k === e.type)?.label }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
          <div v-if="menu === i" class="sq menu"><button v-for="t in TYPES" :key="t.k" :class="['sq', 'menu-item', { on: e.type === t.k }]" @click="setType(i, t.k)">{{ t.label }}</button></div>
        </div>
        <button class="ib s24" :aria-label="e.visible === false ? 'Show effect' : 'Hide effect'" :title="e.visible === false ? 'Show' : 'Hide'" @click="set(i, { visible: e.visible === false ? undefined : false })">
          <svg v-if="e.visible !== false" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M5.2 3.3A6 6 0 0 1 7 3c3.5 0 5.5 4 5.5 4a9 9 0 0 1-1.6 2.1M8.8 10.7A6 6 0 0 1 7 11c-3.5 0-5.5-4-5.5-4a9 9 0 0 1 1.6-2.1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        </button>
        <button class="ib s24" aria-label="Remove effect" title="Remove" @click="setList((l) => l.filter((_, k) => k !== i)); open = null"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
      </div>
      <div v-if="open === i" class="sq editor">
        <template v-if="shadow(e)">
          <div class="grid2">
            <label class="sq fld"><span>X</span><input :key="'x' + e.x" :value="e.x" inputmode="numeric" aria-label="X" @change="num(i, 'x', $event)" @keydown="blur"></label>
            <label class="sq fld"><span>Y</span><input :key="'y' + e.y" :value="e.y" inputmode="numeric" aria-label="Y" @change="num(i, 'y', $event)" @keydown="blur"></label>
            <label class="sq fld"><span>Blur</span><input :key="'b' + e.blur" :value="e.blur" inputmode="numeric" aria-label="Blur" @change="num(i, 'blur', $event)" @keydown="blur"></label>
            <label class="sq fld"><span>Spread</span><input :key="'s' + e.spread" :value="e.spread ?? 0" inputmode="numeric" aria-label="Spread" @change="num(i, 'spread', $event)" @keydown="blur"></label>
          </div>
          <label class="sq fld">
            <ColorField :model-value="e.color" :sid="sid" label="Shadow color" @update:model-value="(v) => set(i, { color: v })" />
            <input :key="'c' + e.color" :value="colorLabel(e.color).split(' ')[0]" aria-label="Shadow hex" @change="(ev) => { const v = (ev.target as HTMLInputElement).value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) set(i, { color: withA(v.toUpperCase(), alpha(e.color)) }) }" @keydown="blur">
            <input :key="'a' + e.color" class="pct" :value="Math.round(alpha(e.color) * 100) + '%'" aria-label="Shadow opacity" @change="(ev) => { const a = Number((ev.target as HTMLInputElement).value.replace('%', '')); if (Number.isFinite(a)) set(i, { color: withA(hex(e.color), Math.min(100, Math.max(0, a)) / 100) }) }" @keydown="blur">
          </label>
        </template>
        <label v-else class="sq fld"><span>Blur</span><input :key="'b' + e.blur" :value="e.blur" inputmode="numeric" aria-label="Blur" @change="num(i, 'blur', $event)" @keydown="blur"></label>
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
.grow { flex: 1; min-width: 0; }
.rel { position: relative; }
.muted { color: var(--sys-color-neutral-500); }
.ib.on { --sq-fill: var(--sys-color-neutral-200); }
.editor { margin-top: var(--ref-spacing-04); padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.pct { width: 40px !important; flex: none; text-align: right; color: var(--sys-color-neutral-600) !important; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
