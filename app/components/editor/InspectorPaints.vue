<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { BindKey, LayerNode, LayerStyle, Paint } from '~/canvas/schema'
import { colorLabel, type CatalogToken } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc } from '~/canvas/images'
import { paintLayer } from '~/canvas/paint'
import { alphaOf, hexOf, normHex, withAlpha } from '~/canvas/color'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import StyleCreate from '~/components/editor/StyleCreate.vue'
import PaintPopover from '~/components/editor/PaintPopover.vue'

/**
 * Fill · Stroke 칠 목록(피그마와 같아요: 위에 있는 칠이 위에 그려져요).
 * 맨 아래 줄은 바탕 칠(fill · stroke · color) — 토큰을 연결할 수 있어요. 위 줄들은 덧붙인 칠(fills · strokes): 단색 · 그라디언트 · 이미지.
 * 견본을 누르면 피그마 같은 칠 편집 창(색 판 · 그라디언트 · 이미지)이 떠요.
 * frame: 화면(프레임) 자체의 모양(doc.frame)을 고쳐요 — 칠이 비어 있으면 흰 바탕, '' 이면 칠 없음
 */
const props = defineProps<{ sid: string; ids: string[]; kind: 'fill' | 'stroke' | 'text'; title: string; frame?: boolean }>()
const store = useLayerStore()
const imageSrc = useImageSrc()

const base = computed(() => (props.kind === 'fill' ? 'fill' : props.kind === 'stroke' ? 'stroke' : 'color') as 'fill' | 'stroke' | 'color')
const extraKey = computed(() => (props.kind === 'stroke' ? 'strokes' : 'fills') as 'fills' | 'strokes')
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const look = computed<LayerStyle>(() => store.doc(props.sid).frame ?? {})
const styles = computed<LayerStyle[]>(() => (props.frame ? [look.value] : nodes.value.map((n) => n.style)))
const firstStyle = computed<LayerStyle | undefined>(() => styles.value[0])
const baseVal = computed(() => {
  const s = firstStyle.value
  if (!s) return undefined
  if (props.frame && base.value === 'fill') return s.fill === '' ? undefined : s.fill ?? '#FFFFFF'
  return s[base.value]
})
const extras = computed<Paint[]>(() => firstStyle.value?.[extraKey.value] ?? [])
const mixed = computed(() => styles.value.some((s) => JSON.stringify([s[base.value], s[extraKey.value]]) !== JSON.stringify([firstStyle.value?.[base.value], firstStyle.value?.[extraKey.value]])))
/** 줄: 위(맨 위 칠)부터. -1 은 바탕 칠 */
const rows = computed(() => [...extras.value.map((_, i) => i).reverse(), ...(baseVal.value ? [-1] : [])])
const types = computed<Paint['type'][]>(() => (props.kind === 'stroke' ? ['solid'] : ['solid', 'linear', 'radial', 'angular', 'image']))
const TYPE_NAME: Record<Paint['type'], string> = { solid: 'Solid', linear: 'Linear', radial: 'Radial', angular: 'Angular', image: 'Image' }

function patchAll(fn: (s: LayerStyle) => Partial<LayerStyle>, vars?: Record<string, string | null>) {
  if (props.frame) store.frameStyle(props.sid, fn(look.value), vars)
  else store.update(props.sid, props.ids, (n) => ({ style: { ...n.style, ...fn(n.style) } }))
}
const setExtras = (fn: (list: Paint[]) => Paint[]) => patchAll((s) => { const l = fn([...(s[extraKey.value] ?? [])]); return { [extraKey.value]: l.length ? l : undefined } })

function add() {
  if (!baseVal.value && !extras.value.length) {
    if (props.kind === 'stroke') patchAll((s) => ({ stroke: '#000000', strokeWidth: s.strokeWidth || 1 }))
    else patchAll(() => ({ [base.value]: props.kind === 'text' ? '#000000' : props.frame ? '#FFFFFF' : '#D9D9D9' }))
    return
  }
  setExtras((l) => [...l, { type: 'solid', color: props.kind === 'stroke' ? '#000000' : '#D9D9D9' }])
}
function remove(i: number) {
  if (open.value === i) open.value = null
  if (i < 0) {
    if (props.kind === 'text' && !extras.value.length) return
    if (props.frame) patchAll(() => ({ fill: '' }), { fill: null })
    else patchAll((s) => ({ [base.value]: undefined, ...(props.kind === 'stroke' && !(s.strokes ?? []).length ? { strokeWidth: undefined } : {}) }))
  } else setExtras((l) => l.filter((_, k) => k !== i))
}
/** 바탕 칠을 덧붙인 칠(맨 아래)로 옮기기 — 숨기기 · 그라디언트로 바꿀 때 */
function baseToExtra(change: (p: Paint) => Paint) {
  const c = baseVal.value
  if (!c) return
  const p = change({ type: 'solid', color: hexOf(store.color(c) ?? c), opacity: alphaOf(store.color(c) ?? c) < 1 ? alphaOf(store.color(c) ?? c) : undefined })
  if (props.frame) { patchAll((s) => ({ fill: '', fills: [p, ...(s.fills ?? [])] }), { fill: null }); return }
  patchAll((s) => {
    const vars = { ...s.vars }
    delete vars[base.value]
    return { [base.value]: undefined, [extraKey.value]: [p, ...(s[extraKey.value] ?? [])], vars: Object.keys(vars).length ? vars : undefined }
  })
}
function toggle(i: number) {
  if (i < 0) baseToExtra((p) => ({ ...p, visible: false }))
  else setExtras((l) => l.map((p, k) => (k === i ? { ...p, visible: p.visible === false ? undefined : false } : p)))
}
function setPaint(i: number, p: Paint) { setExtras((l) => l.map((x, k) => (k === i ? p : x))) }

// --- 색 ---
function setBase(v: string) { patchAll(() => ({ [base.value]: v })) }
function onBaseHex(e: Event) {
  const input = e.target as HTMLInputElement
  const v = normHex(input.value)
  if (v) setBase(v.length > 7 ? v : withAlpha(v, alphaOf(store.color(baseVal.value))))
  else input.value = hexOf(store.color(baseVal.value)).slice(1)
}
function onBaseAlpha(e: Event) {
  const a = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(a) && baseVal.value) setBase(withAlpha(hexOf(store.color(baseVal.value)), Math.min(100, Math.max(0, a)) / 100))
}
function onExtraHex(i: number, e: Event) {
  const p = extras.value[i]
  const v = normHex((e.target as HTMLInputElement).value)
  if (p?.type === 'solid' && v) setPaint(i, { ...p, color: v.slice(0, 7), opacity: v.length > 7 ? alphaOf(v) : p.opacity })
}
function onExtraAlpha(i: number, e: Event) {
  const p = extras.value[i]
  const a = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (p && Number.isFinite(a)) { const o = Math.min(100, Math.max(0, a)) / 100; setPaint(i, { ...p, opacity: o === 1 ? undefined : o }) }
}
// 토큰(바탕 칠만)
const bound = computed(() => {
  const v = (firstStyle.value?.vars as Record<string, string> | undefined)?.[base.value as BindKey]
  if (v) return v
  const c = baseVal.value
  return c?.startsWith('token:') ? 'db:' + c.slice(6) : null
})
function pick(t: CatalogToken) {
  if (props.frame) store.frameStyle(props.sid, { fill: t.color }, { fill: t.id })
  else store.bind(props.sid, props.ids, base.value, t.id, () => ({ style: { [base.value]: t.color } }))
}
function unbind() {
  if (props.frame) store.frameStyle(props.sid, { fill: store.color(look.value.fill) ?? look.value.fill }, { fill: null })
  else store.unbind(props.sid, props.ids, [base.value], (n) => ({ style: n.style[base.value]?.startsWith('token:') ? { [base.value]: store.color(n.style[base.value]) } : {} }))
}
function createdStyle(id: string) {
  const v = store.color(baseVal.value) ?? baseVal.value
  if (props.frame) store.frameStyle(props.sid, { fill: v }, { fill: id })
  else store.bind(props.sid, props.ids, base.value, id, () => ({ style: { [base.value]: v } }))
}

// --- 칠 편집 창 ---
const open = ref<number | null>(null)
watch(() => props.ids.join() + props.sid, () => (open.value = null))
// 반응형: 칠 종류를 바꿔 줄이 새로 생겨도(바탕 → 덧붙인 칠) 창이 새 견본을 따라가요
const anchors = shallowReactive(new Map<number, HTMLElement>())
const anchorRef = (i: number) => (el: unknown) => { if (el) anchors.set(i, el as HTMLElement); else anchors.delete(i) }
const popAnchor = computed(() => (open.value === null ? null : anchors.get(open.value) ?? null))
const popPaint = computed<Paint | null>(() => {
  if (open.value === null) return null
  if (open.value < 0) {
    const c = store.color(baseVal.value) ?? baseVal.value
    if (!c) return null
    const a = alphaOf(c)
    return { type: 'solid', color: hexOf(c), opacity: a < 1 ? a : undefined }
  }
  return extras.value[open.value] ?? null
})
function onPopUpdate(p: Paint) {
  if (open.value === null) return
  if (open.value < 0) { if (p.type === 'solid') setBase(withAlpha(p.color, p.opacity ?? 1)); return }
  setPaint(open.value, p)
}
function setType(i: number, t: Paint['type']) {
  const cur = extras.value[i]
  if (!cur || cur.type === t) return
  const c = cur.type === 'solid' ? withAlpha(cur.color, cur.opacity ?? 1) : cur.type === 'image' ? '#D9D9D9' : cur.stops[0]?.color ?? '#D9D9D9'
  const grad = cur.type === 'linear' || cur.type === 'radial' || cur.type === 'angular'
  const next: Paint = t === 'solid'
    ? { type: 'solid', color: hexOf(c), opacity: alphaOf(c) < 1 ? alphaOf(c) : undefined }
    : t === 'image'
      ? { type: 'image', src: '', fit: 'fill' }
      : { type: t, angle: t === 'linear' ? 180 : t === 'angular' ? 0 : undefined, stops: grad ? cur.stops : [{ pos: 0, color: hexOf(c) }, { pos: 1, color: withAlpha(hexOf(c), 0) }] }
  setPaint(i, { ...next, visible: cur.visible, ...(t === 'solid' ? {} : { opacity: grad || cur.type === 'image' ? cur.opacity : undefined }) } as Paint)
}
function onPopType(t: Paint['type']) {
  if (open.value === null) return
  if (open.value < 0) {
    if (t === 'solid') return
    baseToExtra((p) => p)
    setType(0, t)
    open.value = 0
    return
  }
  setType(open.value, t)
}

/** 견본 미리보기(투명은 체크 무늬 위에) */
const CHECK = 'repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px'
function swatch(p: Paint) {
  const l = paintLayer(p, store.color, imageSrc)
  if (!l) return { background: CHECK }
  return { backgroundImage: `${l.image}, ${CHECK.split(' 0 0 /')[0]}`, backgroundSize: `${l.size === 'auto' ? (p.type === 'image' ? '8px 8px' : '100% 100%') : l.size}, 6px 6px`, backgroundPosition: `${l.position}, 0 0`, backgroundRepeat: `${l.repeat}, repeat` }
}
const baseSwatch = computed(() => { const c = store.color(baseVal.value) ?? baseVal.value ?? '#000000'; return { background: `linear-gradient(${c}, ${c}), ${CHECK}` } })
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
const sel = (e: FocusEvent) => (e.target as HTMLInputElement).select()
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
        <div class="sq fld grow" :class="{ act: open === -1 }">
          <button :ref="anchorRef(-1)" class="sq sq-clip swatch" :style="baseSwatch" :aria-label="`Edit ${title.toLowerCase()} color`" :aria-expanded="open === -1" @click="open = open === -1 ? null : -1" />
          <template v-if="!bound">
            <input :key="'h' + baseVal" class="hex" :value="colorLabel(store.color(baseVal) ?? '').split(' ')[0]!.replace('#', '')" :aria-label="`${title} hex`" spellcheck="false" @change="onBaseHex" @keydown="blur" @focus="sel">
            <span class="vsep" aria-hidden="true" />
            <input :key="'a' + baseVal" class="pct" :value="Math.round(alphaOf(store.color(baseVal)) * 100)" inputmode="numeric" :aria-label="`${title} opacity`" @change="onBaseAlpha" @keydown="blur" @focus="sel"><span class="unit">%</span>
          </template>
          <TokenPicker v-else :kinds="['color']" :bound="bound" :label="`${title} color`" @pick="pick" @unbind="unbind" />
        </div>
        <TokenPicker v-if="!bound" :kinds="['color']" :label="`${title} color`" @pick="pick" />
        <StyleCreate v-if="!bound && baseVal" type="color" :value="store.color(baseVal) ?? baseVal" label="Create color style" @created="createdStyle" />
        <button class="ib s24" :aria-label="`Hide ${title.toLowerCase()}`" title="Hide" @click="toggle(-1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg></button>
        <button class="ib s24" :aria-label="`Remove ${title.toLowerCase()}`" title="Remove" :disabled="kind === 'text' && !extras.length" @click="remove(-1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
      </div>
      <!-- 덧붙인 칠 -->
      <div v-else-if="extras[i]" class="row" :class="{ off: extras[i]!.visible === false }">
        <div class="sq fld grow" :class="{ act: open === i }">
          <button :ref="anchorRef(i)" class="sq sq-clip swatch" :style="swatch(extras[i]!)" :aria-label="`Edit ${title.toLowerCase()}`" :aria-expanded="open === i" @click="open = open === i ? null : i" />
          <input v-if="extras[i]!.type === 'solid'" :key="'h' + i + (extras[i] as { color: string }).color" class="hex" :value="hexOf((extras[i] as { color: string }).color).slice(1)" :aria-label="`${title} hex`" spellcheck="false" @change="onExtraHex(i, $event)" @keydown="blur" @focus="sel">
          <button v-else class="pname" @click="open = open === i ? null : i">{{ TYPE_NAME[extras[i]!.type] }}</button>
          <span class="vsep" aria-hidden="true" />
          <input :key="'a' + i + extras[i]!.opacity" class="pct" :value="Math.round((extras[i]!.opacity ?? 1) * 100)" inputmode="numeric" :aria-label="`${title} opacity`" @change="onExtraAlpha(i, $event)" @keydown="blur" @focus="sel"><span class="unit">%</span>
        </div>
        <button class="ib s24" :aria-label="extras[i]!.visible === false ? `Show ${title.toLowerCase()}` : `Hide ${title.toLowerCase()}`" :title="extras[i]!.visible === false ? 'Show' : 'Hide'" @click="toggle(i)">
          <svg v-if="extras[i]!.visible !== false" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="7" cy="7" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M5.2 3.3A6 6 0 0 1 7 3c3.5 0 5.5 4 5.5 4a9 9 0 0 1-1.6 2.1M8.8 10.7A6 6 0 0 1 7 11c-3.5 0-5.5-4-5.5-4a9 9 0 0 1 1.6-2.1" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        </button>
        <button class="ib s24" :aria-label="`Remove ${title.toLowerCase()}`" title="Remove" @click="remove(i)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
      </div>
    </template>
    <PaintPopover
      v-if="open !== null && popPaint"
      :key="open"
      :anchor="popAnchor"
      :paint="popPaint"
      :types="types"
      :sid="sid"
      :bindable="open === -1"
      :title="title"
      @update="onPopUpdate"
      @type="onPopType"
      @token="(t) => { pick(t); open = null }"
      @close="open = null"
    />
    <slot />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.m0 { margin: 0; }
.row { display: flex; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
.row.off .fld { opacity: 0.45; }
.grow { flex: 1; min-width: 0; }
.fld { gap: var(--ref-spacing-04); padding-right: var(--ref-spacing-05); }
.fld.act, .fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.hex { flex: 1; min-width: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; background: var(--sys-color-common-white-default); flex: none; }
.pct { width: 28px !important; flex: none; text-align: right; }
.unit { color: var(--sys-color-neutral-500) !important; margin-left: calc(-1 * var(--ref-spacing-04)); }
.pname { flex: 1; min-width: 0; text-align: left; font-size: 12px; color: var(--sys-color-neutral-800); cursor: pointer; }
.swatch { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.swatch:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); }
button:disabled { opacity: 0.35; pointer-events: none; }
</style>
