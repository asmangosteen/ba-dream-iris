<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { BindKey, LayerNode, LayerStyle, Paint } from '~/canvas/schema'
import { colorLabel, parseColor, type CatalogToken } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc, uploadImage } from '~/canvas/images'
import { paintLayer } from '~/canvas/paint'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import StyleCreate from '~/components/editor/StyleCreate.vue'

/**
 * Fill · Stroke 칠 목록(피그마와 같아요: 위에 있는 칠이 위에 그려져요).
 * 맨 아래 줄은 바탕 칠(fill · stroke · color) — 토큰을 연결할 수 있어요. 위 줄들은 덧붙인 칠(fills · strokes): 단색 · 그라디언트 · 이미지.
 */
const props = defineProps<{ sid: string; ids: string[]; kind: 'fill' | 'stroke' | 'text'; title: string }>()
const store = useLayerStore()
const supabase = useSupabaseClient()
const preview = useDevPreview()
const imageSrc = useImageSrc()

const base = computed(() => (props.kind === 'fill' ? 'fill' : props.kind === 'stroke' ? 'stroke' : 'color') as 'fill' | 'stroke' | 'color')
const extraKey = computed(() => (props.kind === 'stroke' ? 'strokes' : 'fills') as 'fills' | 'strokes')
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const first = computed(() => nodes.value[0])
const baseVal = computed(() => first.value?.style[base.value])
const extras = computed<Paint[]>(() => first.value?.style[extraKey.value] ?? [])
const mixed = computed(() => nodes.value.some((n) => JSON.stringify([n.style[base.value], n.style[extraKey.value]]) !== JSON.stringify([baseVal.value, first.value?.style[extraKey.value]])))
/** 줄: 위(맨 위 칠)부터. -1 은 바탕 칠 */
const rows = computed(() => [...extras.value.map((_, i) => i).reverse(), ...(baseVal.value ? [-1] : [])])
const types = computed<Paint['type'][]>(() => (props.kind === 'stroke' ? ['solid'] : ['solid', 'linear', 'radial', 'image']))
const TYPE_NAME: Record<Paint['type'], string> = { solid: 'Solid', linear: 'Linear', radial: 'Radial', image: 'Image' }

function patchAll(fn: (s: LayerStyle) => Partial<LayerStyle>) {
  store.update(props.sid, props.ids, (n) => ({ style: { ...n.style, ...fn(n.style) } }))
}
const setExtras = (fn: (list: Paint[]) => Paint[]) => patchAll((s) => ({ [extraKey.value]: fn([...(s[extraKey.value] ?? [])]) }))

function add() {
  if (!baseVal.value && !extras.value.length) {
    if (props.kind === 'stroke') patchAll((s) => ({ stroke: '#000000', strokeWidth: s.strokeWidth || 1 }))
    else patchAll(() => ({ [base.value]: props.kind === 'text' ? '#000000' : '#D9D9D9' }))
    return
  }
  setExtras((l) => [...l, { type: 'solid', color: props.kind === 'stroke' ? '#000000' : '#D9D9D9' }])
}
function remove(i: number) {
  if (i < 0) {
    if (props.kind === 'text' && !extras.value.length) return
    patchAll((s) => ({ [base.value]: undefined, ...(props.kind === 'stroke' && !(s.strokes ?? []).length ? { strokeWidth: undefined } : {}) }))
  } else setExtras((l) => l.filter((_, k) => k !== i))
  if (open.value === i) open.value = null
}
/** 바탕 칠을 덧붙인 칠(맨 아래)로 옮기기 — 숨기기 · 그라디언트로 바꿀 때 */
function baseToExtra(change: (p: Paint) => Paint) {
  patchAll((s) => {
    const c = s[base.value]
    if (!c) return {}
    const vars = { ...s.vars }
    delete vars[base.value]
    return { [base.value]: undefined, [extraKey.value]: [change({ type: 'solid', color: store.color(c) ?? c }), ...(s[extraKey.value] ?? [])], vars: Object.keys(vars).length ? vars : undefined }
  })
}
function toggle(i: number) {
  if (i < 0) baseToExtra((p) => ({ ...p, visible: false }))
  else setExtras((l) => l.map((p, k) => (k === i ? { ...p, visible: p.visible === false ? undefined : false } : p)))
}
function setPaint(i: number, patch: Partial<Paint>) { setExtras((l) => l.map((p, k) => (k === i ? ({ ...p, ...patch } as Paint) : p))) }

// --- 색 ---
const hex = (v?: string) => parseColor(store.color(v))?.hex ?? '#000000'
const alphaOf = (v?: string) => parseColor(store.color(v))?.a ?? 1
const withA = (h: string, a: number) => (a >= 1 ? h : h + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase())
function normHex(v: string): string | null {
  let s = v.trim()
  if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('')
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? s.toUpperCase() : null
}
function setBase(v: string) { store.style(props.sid, props.ids, { [base.value]: v }) }
function onBaseHex(e: Event) { const v = normHex((e.target as HTMLInputElement).value); if (v) setBase(v); else (e.target as HTMLInputElement).value = colorLabel(baseVal.value ?? '') }
function onBaseAlpha(e: Event) {
  const a = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(a) && baseVal.value) setBase(withA(hex(baseVal.value), Math.min(100, Math.max(0, a)) / 100))
}
function onExtraHex(i: number, e: Event) { const v = normHex((e.target as HTMLInputElement).value); if (v) setPaint(i, { color: v } as Partial<Paint>) }
function onExtraAlpha(i: number, e: Event) {
  const a = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(a)) setPaint(i, { opacity: Math.min(100, Math.max(0, a)) / 100 === 1 ? undefined : Math.min(100, Math.max(0, a)) / 100 })
}
// 토큰(바탕 칠만)
const bound = computed(() => {
  const v = first.value?.style.vars?.[base.value as BindKey]
  if (v) return v
  const c = baseVal.value
  return c?.startsWith('token:') ? 'db:' + c.slice(6) : null
})
function pick(t: CatalogToken) { store.bind(props.sid, props.ids, base.value, t.id, () => ({ style: { [base.value]: t.color } })) }
function unbind() { store.unbind(props.sid, props.ids, [base.value], (n) => ({ style: n.style[base.value]?.startsWith('token:') ? { [base.value]: store.color(n.style[base.value]) } : {} })) }

// --- 칠 편집 창(덧붙인 칠) ---
const open = ref<number | null>(null)
watch(() => props.ids.join(), () => (open.value = null))
function setType(i: number, t: Paint['type']) {
  const cur = extras.value[i]
  if (!cur || cur.type === t) return
  const c = cur.type === 'solid' ? cur.color : cur.type === 'image' ? '#D9D9D9' : cur.stops[0]?.color ?? '#D9D9D9'
  const next: Paint = t === 'solid' ? { type: 'solid', color: c } : t === 'image' ? { type: 'image', src: '', fit: 'fill' } : { type: t, angle: t === 'linear' ? 180 : undefined, stops: cur.type === 'linear' || cur.type === 'radial' ? cur.stops : [{ pos: 0, color: c }, { pos: 1, color: withA(hex(c), 0) }] }
  setExtras((l) => l.map((p, k) => (k === i ? { ...next, visible: p.visible, opacity: p.opacity } as Paint : p)))
}
function baseType(t: Paint['type']) {
  if (t === 'solid') return
  baseToExtra((p) => p)
  nextTick(() => { setType(0, t); open.value = 0 })
}
function setStop(i: number, k: number, patch: Partial<{ pos: number; color: string }>) {
  const p = extras.value[i]
  if (!p || (p.type !== 'linear' && p.type !== 'radial')) return
  setPaint(i, { stops: p.stops.map((s, j) => (j === k ? { ...s, ...patch } : s)) } as Partial<Paint>)
}
function addStop(i: number) {
  const p = extras.value[i]
  if (!p || (p.type !== 'linear' && p.type !== 'radial')) return
  const last = p.stops[p.stops.length - 1]
  setPaint(i, { stops: [...p.stops, { pos: 1, color: last?.color ?? '#000000' }].map((s, j, a) => (j === a.length - 2 && a.length > 2 ? { ...s, pos: Math.min(s.pos, 0.5) } : s)) } as Partial<Paint>)
}
function removeStop(i: number, k: number) {
  const p = extras.value[i]
  if (!p || (p.type !== 'linear' && p.type !== 'radial') || p.stops.length <= 2) return
  setPaint(i, { stops: p.stops.filter((_, j) => j !== k) } as Partial<Paint>)
}
const fileEl = ref<HTMLInputElement | null>(null)
let fileFor = -1
function chooseImage(i: number) { fileFor = i; fileEl.value?.click() }
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f || fileFor < 0) return
  const img = await uploadImage(f, props.sid.replace(':', '-'), { supabase, preview })
  setPaint(fileFor, { src: img.src } as Partial<Paint>)
}

/** 견본 미리보기 */
function swatch(p: Paint) {
  const l = paintLayer(p, store.color, imageSrc)
  return l ? { backgroundImage: l.image, backgroundSize: l.size === 'auto' ? '100% 100%' : l.size, backgroundPosition: l.position, backgroundRepeat: l.repeat } : {}
}
function label(p: Paint) {
  if (p.type === 'solid') return colorLabel(store.color(p.color) ?? p.color).split(' ')[0]
  return p.type === 'image' ? 'Image' : TYPE_NAME[p.type]
}
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <section class="s">
    <div class="sec-h h24">
      <span>{{ title }}</span>
      <button class="ib s24" :aria-label="`Add ${title.toLowerCase()}`" :title="`Add ${title.toLowerCase()}`" @click="add"><Icon name="plus" :size="14" /></button>
    </div>
    <p v-if="mixed" class="tx-meta m0">Click + to replace mixed content</p>
    <template v-for="i in rows" :key="i">
      <!-- 바탕 칠 -->
      <div v-if="i < 0" class="row">
        <label class="sq fld grow">
          <input type="color" class="swatch" :value="hex(baseVal)" :aria-label="`${title} color`" @change="setBase(($event.target as HTMLInputElement).value.toUpperCase())">
          <template v-if="!bound">
            <input :key="'h' + baseVal" :value="colorLabel(store.color(baseVal) ?? '').split(' ')[0]" :aria-label="`${title} hex`" @change="onBaseHex" @keydown="blur">
            <input :key="'a' + baseVal" class="pct" :value="Math.round(alphaOf(baseVal) * 100) + '%'" :aria-label="`${title} opacity`" @change="onBaseAlpha" @keydown="blur">
          </template>
          <TokenPicker v-else :kinds="['color']" :bound="bound" :label="`${title} color`" @pick="pick" @unbind="unbind" />
        </label>
        <TokenPicker v-if="!bound" :kinds="['color']" :label="`${title} color`" @pick="pick" />
        <StyleCreate v-if="!bound && baseVal" type="color" :value="store.color(baseVal) ?? baseVal" label="Create color style" @created="(id) => store.bind(sid, ids, base, id, () => ({ style: { [base]: store.color(baseVal) ?? baseVal } }))" />
        <div v-if="types.length > 1" class="rel">
          <button class="ib s24" :class="{ on: open === -1 }" aria-label="Paint type" title="Paint type" @click="open = open === -1 ? null : -1"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M2 9l10-6" stroke="currentColor" stroke-width="1.2" /></svg></button>
          <div v-if="open === -1" class="sq menu pop">
            <button v-for="t in types" :key="t" :class="['sq', 'menu-item', { on: t === 'solid' }]" @click="open = null; baseType(t)">{{ TYPE_NAME[t] }}</button>
          </div>
        </div>
        <button class="ib s24" :aria-label="`Hide ${title.toLowerCase()}`" title="Hide" @click="toggle(-1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg></button>
        <button class="ib s24" :aria-label="`Remove ${title.toLowerCase()}`" title="Remove" :disabled="kind === 'text' && !extras.length" @click="remove(-1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
      </div>
      <!-- 덧붙인 칠 -->
      <div v-else-if="extras[i]" class="rel">
        <div class="row" :class="{ off: extras[i]!.visible === false }">
          <label class="sq fld grow">
            <button class="swatch sw-btn" :style="swatch(extras[i]!)" :aria-label="`Edit ${title.toLowerCase()}`" @click.prevent="open = open === i ? null : i" />
            <template v-if="extras[i]!.type === 'solid'">
              <input :key="'h' + i + (extras[i] as { color: string }).color" :value="label(extras[i]!)" :aria-label="`${title} hex`" @change="onExtraHex(i, $event)" @keydown="blur">
            </template>
            <span v-else class="pname" @click="open = open === i ? null : i">{{ label(extras[i]!) }}</span>
            <input :key="'a' + i + extras[i]!.opacity" class="pct" :value="Math.round((extras[i]!.opacity ?? 1) * 100) + '%'" :aria-label="`${title} opacity`" @change="onExtraAlpha(i, $event)" @keydown="blur">
          </label>
          <button class="ib s24" :aria-label="extras[i]!.visible === false ? `Show ${title.toLowerCase()}` : `Hide ${title.toLowerCase()}`" :title="extras[i]!.visible === false ? 'Show' : 'Hide'" @click="toggle(i)">
            <svg v-if="extras[i]!.visible !== false" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M5.2 3.3A6 6 0 0 1 7 3c3.5 0 5.5 4 5.5 4a9 9 0 0 1-1.6 2.1M8.8 10.7A6 6 0 0 1 7 11c-3.5 0-5.5-4-5.5-4a9 9 0 0 1 1.6-2.1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          </button>
          <button class="ib s24" :aria-label="`Remove ${title.toLowerCase()}`" title="Remove" @click="remove(i)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
        </div>
        <!-- 편집 창 -->
        <div v-if="open === i" class="sq editor">
          <div v-if="types.length > 1" class="seg">
            <button v-for="t in types" :key="t" :class="['seg-b', { on: extras[i]!.type === t }]" @click="setType(i, t)">{{ TYPE_NAME[t] }}</button>
          </div>
          <template v-if="extras[i]!.type === 'solid'">
            <label class="sq fld"><input type="color" class="swatch" :value="hex((extras[i] as { color: string }).color)" aria-label="Color" @change="setPaint(i, { color: ($event.target as HTMLInputElement).value.toUpperCase() } as Partial<Paint>)"><input :value="label(extras[i]!)" aria-label="Hex" @change="onExtraHex(i, $event)" @keydown="blur"></label>
          </template>
          <template v-else-if="extras[i]!.type === 'linear' || extras[i]!.type === 'radial'">
            <div class="grad" :style="swatch({ ...(extras[i] as Paint), type: 'linear', angle: 90 } as Paint)" />
            <label v-if="extras[i]!.type === 'linear'" class="sq fld"><span>Angle</span><input :key="'g' + (extras[i] as { angle?: number }).angle" :value="(extras[i] as { angle?: number }).angle ?? 180" inputmode="numeric" aria-label="Angle" @change="setPaint(i, { angle: Number(($event.target as HTMLInputElement).value) || 0 } as Partial<Paint>)" @keydown="blur"><span>°</span></label>
            <div class="sub-h"><span class="sub">Stops</span><button class="ib s24" aria-label="Add stop" title="Add stop" @click="addStop(i)"><Icon name="plus" :size="12" /></button></div>
            <div v-for="(st, k) in (extras[i] as { stops: { pos: number; color: string }[] }).stops" :key="k" class="stop">
              <label class="sq fld pos"><input :value="Math.round(st.pos * 100)" inputmode="numeric" :aria-label="`Stop ${k + 1} position`" @change="setStop(i, k, { pos: Math.min(100, Math.max(0, Number(($event.target as HTMLInputElement).value) || 0)) / 100 })" @keydown="blur"><span>%</span></label>
              <label class="sq fld grow"><input type="color" class="swatch" :value="hex(st.color)" :aria-label="`Stop ${k + 1} color`" @change="setStop(i, k, { color: withA(($event.target as HTMLInputElement).value.toUpperCase(), alphaOf(st.color)) })"><input :value="colorLabel(st.color)" :aria-label="`Stop ${k + 1} hex`" @change="(e) => { const v = normHex((e.target as HTMLInputElement).value); if (v) setStop(i, k, { color: v }) }" @keydown="blur"></label>
              <button class="ib s24" aria-label="Remove stop" title="Remove stop" :disabled="(extras[i] as { stops: unknown[] }).stops.length <= 2" @click="removeStop(i, k)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
            </div>
          </template>
          <template v-else-if="extras[i]!.type === 'image'">
            <div class="img-prev" :style="swatch(extras[i]!)"><span v-if="!(extras[i] as { src: string }).src" class="tx-meta">No image</span></div>
            <div class="seg">
              <button v-for="f in (['fill', 'fit', 'crop', 'tile'] as const)" :key="f" :class="['seg-b', { on: ((extras[i] as { fit?: string }).fit ?? 'fill') === f }]" @click="setPaint(i, { fit: f } as Partial<Paint>)">{{ { fill: 'Fill', fit: 'Fit', crop: 'Crop', tile: 'Tile' }[f] }}</button>
            </div>
            <button class="sq act full" @click="chooseImage(i)">Choose image…</button>
          </template>
        </div>
      </div>
    </template>
    <input ref="fileEl" type="file" accept="image/*" hidden @change="onFile">
    <slot />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.m0 { margin: 0; }
.row { display: flex; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
.row.off { opacity: 0.45; }
.grow { flex: 1; min-width: 0; }
.rel { position: relative; min-width: 0; }
.pct { width: 40px !important; flex: none; text-align: right; color: var(--sys-color-neutral-600) !important; }
.pname { flex: 1; font-size: 12px; color: var(--sys-color-neutral-800); cursor: pointer; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.sw-btn { background-color: var(--iris-paper); }
.swatch:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.pop { left: auto; right: 0; min-width: 120px; }
.editor { margin-top: var(--ref-spacing-04); padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 2px; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); }
.seg-b { height: 24px; border-radius: var(--ref-radius-02); font-size: 11px; color: var(--sys-color-neutral-600); }
.seg-b.on { background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); font-weight: 500; box-shadow: 0 1px 2px rgb(0 0 0 / 8%); }
.grad { height: 16px; border-radius: 3px; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.sub-h { display: flex; align-items: center; justify-content: space-between; }
.sub { font-size: 11px; color: var(--sys-color-neutral-500); }
.stop { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.pos { width: 64px; flex: none; }
.img-prev { height: 96px; border-radius: var(--ref-radius-03); background-color: var(--sys-color-neutral-100); display: grid; place-items: center; }
.act { height: 28px; border-radius: var(--ref-radius-03); font-size: 12px; --sq-fill: var(--sys-color-neutral-200); }
.act:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.full { width: 100%; }
button:disabled { opacity: 0.35; pointer-events: none; }
</style>
