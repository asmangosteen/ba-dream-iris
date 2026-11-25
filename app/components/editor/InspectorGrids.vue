<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { LayoutGrid } from '~/canvas/schema'
import { colorLabel, parseColor } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import ColorField from '~/components/editor/ColorField.vue'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import type { CatalogToken } from '~/canvas/tokens'
import EditorSelect from '~/components/editor/EditorSelect.vue'

/** Layout grid (피그마와 같아요): Columns · Rows · Grid. ⌃G 로 모두 숨기기 · 보이기 */
/** mixed: 고른 프레임들의 격자가 서로 달라요 — 목록 대신 안내, + 로 모두 같은 격자 하나로 */
const props = defineProps<{ grids: LayoutGrid[]; mixed?: boolean }>()
const emit = defineEmits<{ change: [grids: LayoutGrid[] | undefined] }>()
const open = ref<number | null>(null)
/** 피그마 순서: Grid · Columns · Rows */
const TYPES: { value: LayoutGrid['type']; label: string }[] = [{ value: 'grid', label: 'Grid' }, { value: 'columns', label: 'Columns' }, { value: 'rows', label: 'Rows' }]
const store = useLayerStore()
const out = (l: LayoutGrid[]) => emit('change', l.length ? l : undefined)
function add() { const g: LayoutGrid = { type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF000019' }; if (props.mixed) { out([g]); open.value = 0; return } out([...props.grids, g]); open.value = props.grids.length }
/** 색을 직접 바꾸면 토큰 연결은 풀려요 — 토큰을 고를 때만 token 을 함께 넘겨요 */
function set(i: number, patch: Partial<LayoutGrid>) {
  const p = 'color' in patch && !('token' in patch) ? { ...patch, token: undefined } : patch
  out(props.grids.map((g, k) => (k === i ? { ...g, ...p } : g)))
}
/** 토큰 색은 격자 투명도를 지켜요(격자는 늘 옅게) */
const bindGrid = (i: number, t: CatalogToken) => { const g = props.grids[i]; if (g && t.color) set(i, { color: withA(hex(t.color), alpha(g.color)), token: t.id }) }
function setType(i: number, t: LayoutGrid['type']) { set(i, t === 'grid' ? { type: t, size: 8, color: '#FF000019' } : { type: t, count: props.grids[i]?.count ?? 4, gutter: props.grids[i]?.gutter ?? 16, margin: props.grids[i]?.margin ?? 16 }) }
function num(i: number, key: 'count' | 'gutter' | 'margin' | 'size', e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) set(i, { [key]: Math.max(key === 'count' || key === 'size' ? 1 : 0, Math.round(v)) })
}
const hex = (c?: string) => parseColor(c)?.hex ?? '#FF0000'
const alpha = (c?: string) => parseColor(c)?.a ?? 0.1
const withA = (h: string, a: number) => (a >= 1 ? h : h + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase())
const label = (g: LayoutGrid) => (g.type === 'grid' ? tr('Grid ({n}px)', { n: g.size ?? 8 }) : g.type === 'columns' ? tr('{n} columns', { n: g.count ?? 4 }) : tr('{n} rows', { n: g.count ?? 4 }))
/* 설정 창: 피그마 팝오버(§9.1)처럼 오른쪽 패널 왼쪽에 붙고, 위쪽은 연 행에 맞춰요. 바깥 누르기 · Esc 로 닫기(Esc 는 설정 버튼으로 포커스) */
const rowEls = new Map<number, HTMLElement>()
const rowRef = (i: number) => (el: unknown) => { if (el) rowEls.set(i, el as HTMLElement); else rowEls.delete(i) }
const pop = ref<HTMLElement | null>(null)
const setPop = (el: unknown) => { pop.value = (el as HTMLElement | null) ?? null }
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
function place() {
  const row = open.value === null ? null : rowEls.get(open.value)
  if (!row) return
  const r = row.getBoundingClientRect()
  const panel = row.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const h = pop.value?.offsetHeight ?? 240
  pos.value = { left: Math.max(8, panel.left - 240 - 8) + 'px', top: Math.max(8, Math.min(window.innerHeight - h - 8, r.top - 8)) + 'px' }
}
watch(open, (v) => { pos.value = { visibility: 'hidden' }; if (v !== null) nextTick(() => { place(); nextTick(place) }) }, { flush: 'post' })
watch(() => props.grids, () => { if (open.value !== null) { if (!props.grids[open.value]) open.value = null; else nextTick(place) } }, { deep: true })
function closePop(refocus = false) {
  const i = open.value
  open.value = null
  if (refocus && i !== null) rowEls.get(i)?.querySelector<HTMLElement>('.tog')?.focus()
}
function onDoc(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (open.value === null || !t) return
  if (pop.value?.contains(t) || rowEls.get(open.value)?.contains(t) || t.closest?.('.paint-pop, .tp, .esel-m')) return
  closePop()
}
const onReflow = (e: Event) => { if (open.value !== null && !(e.target instanceof Node && pop.value?.contains(e.target))) place() }
onMounted(() => { document.addEventListener('pointerdown', onDoc, true); window.addEventListener('resize', onReflow); window.addEventListener('scroll', onReflow, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc, true); window.removeEventListener('resize', onReflow); window.removeEventListener('scroll', onReflow, true) })
/** 끌어서 순서 바꾸기 */
const { box: dragBox, drag, start: dragStart, key: dragKey } = useRowDrag((from, to) => { open.value = null; out(moveItem(props.grids, from, to)) })
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <section ref="dragBox" class="s drag-box">
    <div :class="['sec-h', 'h24', { empty: !grids.length && !mixed }]"><span>{{ tr('Layout grid') }}</span><button class="ib s24" :aria-label="tr('Add layout grid')" :data-tip="tr('Add layout grid')" @click="add"><EditorIcon name="plus" :size="16" /></button></div>
    <p v-if="mixed" class="tx-meta m0">{{ tr('Click + to replace mixed content') }}</p>
    <div v-for="(g, i) in mixed ? [] : grids" :key="i">
      <!-- 피그마 Layout guide 행: [설정 + 이름] [👁 24] [− 24] -->
      <div :ref="rowRef(i)" class="prow" data-drag-row :class="{ off: g.visible === false, dragging: drag?.from === i }">
        <button v-if="grids.length > 1" type="button" class="drag-h" :aria-label="tr('Drag to reorder')" @pointerdown="dragStart($event, i)" @keydown="dragKey($event, i, grids.length)"><EditorIcon class="keep" name="menu_hamburger" :size="10" /></button>
        <div class="ef">
          <button :class="['ib', 's24', 'tog', { on: open === i }]" :aria-expanded="open === i" aria-haspopup="dialog" :aria-label="tr('Layout grid settings')" :data-tip="tr('Layout grid settings')" @click="open = open === i ? null : i">
            <EditorIcon :name="g.type === 'columns' ? 'grid_columns' : g.type === 'rows' ? 'grid_rows' : 'grid_square'" />
          </button>
          <button class="name" @click="open = open === i ? null : i">{{ label(g) }}</button>
        </div>
        <button class="ib s24" :aria-label="g.visible === false ? tr('Show layout grid') : tr('Hide layout grid')" :data-tip="g.visible === false ? tr('Show') : tr('Hide')" @click="set(i, { visible: g.visible === false ? undefined : false })">
          <EditorIcon :name="g.visible === false ? 'eye_off' : 'eye'" :size="16" />
        </button>
        <button class="ib s24" :aria-label="tr('Remove layout grid')" :data-tip="tr('Remove')" @click="out(grids.filter((_, k) => k !== i)); open = null"><EditorIcon name="minus" :size="16" /></button>
      </div>
      <Teleport v-if="open === i" to="body">
      <div :ref="setPop" v-front class="sq fx-pop editor" role="dialog" :aria-label="tr('Layout grid settings')" :style="pos" @keydown.esc.stop.prevent="closePop(true)">
        <div class="pop-h"><span class="pop-t">{{ tr('Layout grid') }}</span><button type="button" class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="closePop(true)"><EditorIcon name="close" :size="16" /></button></div>
        <div class="pop-b">
        <div class="ig">
          <EditorSelect class="span2" :model-value="g.type" :options="TYPES" ariaLabel="Layout grid type" @update:model-value="(v) => setType(i, v as LayoutGrid['type'])" />
          <span />
        </div>
        <template v-if="g.type === 'grid'">
          <div class="ig-l"><span>{{ tr('Size') }}</span></div>
          <div class="ig">
            <label class="sq fld"><input :key="'s' + g.size" :value="g.size ?? 8" inputmode="numeric" :aria-label="tr('Grid size')"@change="num(i, 'size', $event)" @keydown="blur"><span class="unit">px</span></label>
            <span /><span />
          </div>
        </template>
        <template v-else>
          <div class="ig-l"><span>{{ tr('Count') }}</span><span>{{ tr('Gutter') }}</span></div>
          <div class="ig">
            <label class="sq fld"><input :key="'c' + g.count" :value="g.count ?? 4" inputmode="numeric" :aria-label="tr('Count')"@change="num(i, 'count', $event)" @keydown="blur"></label>
            <label class="sq fld"><input :key="'g' + g.gutter" :value="g.gutter ?? 16" inputmode="numeric" :aria-label="tr('Gutter')"@change="num(i, 'gutter', $event)" @keydown="blur"></label>
            <span />
          </div>
          <div class="ig-l"><span>{{ tr('Margin') }}</span></div>
          <div class="ig">
            <label class="sq fld"><input :key="'m' + g.margin" :value="g.margin ?? 16" inputmode="numeric" :aria-label="tr('Margin')"@change="num(i, 'margin', $event)" @keydown="blur"></label>
            <span /><span />
          </div>
        </template>
        <div class="ig-l"><span>{{ tr('Color') }}</span></div>
        <div class="ig">
          <div class="sq fld pf span2">
            <ColorField :model-value="withA(hex(g.color), alpha(g.color))" :sid="store.screenId.value" bindable label="Grid color" @update:model-value="(v) => set(i, { color: v })" @token="(t: CatalogToken) => bindGrid(i, t)" />
            <TokenPicker v-if="g.token" :kinds="['color']" :bound="g.token" label="Grid color" @pick="(t) => bindGrid(i, t)" @unbind="set(i, { token: undefined })" />
            <template v-else>
            <input :key="'h' + g.color" class="hex" :value="colorLabel(hex(g.color)).replace('#', '')" :aria-label="tr('Grid hex')"spellcheck="false" @change="(e) => { const v = (e.target as HTMLInputElement).value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) set(i, { color: withA(v.toUpperCase(), alpha(g.color)) }); else (e.target as HTMLInputElement).value = hex(g.color).slice(1) }" @keydown="blur" @focus="($event.target as HTMLInputElement).select()">
            <TokenPicker :kinds="['color']" reveal label="Grid color" @pick="(t) => bindGrid(i, t)" />
            <span class="vsep" aria-hidden="true" />
            <span class="op"><input :key="'a' + g.color" class="pct" :value="Math.round(alpha(g.color) * 100)" inputmode="numeric" :aria-label="tr('Grid opacity')"@change="(e) => { const a = Number((e.target as HTMLInputElement).value.replace('%', '')); if (Number.isFinite(a)) set(i, { color: withA(hex(g.color), Math.min(100, Math.max(0, a)) / 100) }) }" @keydown="blur"><i class="unit">%</i></span>
            </template>
          </div>
          <span />
        </div>
        </div>
      </div>
      </Teleport>
    </div>
    <div v-if="drag" class="row-drop" :style="{ top: drag.y + 'px', left: drag.x + 'px', width: drag.w + 'px' }" />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.h24 { height: 28px; padding: 0; }
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s24 { width: 28px; height: 28px; }
/* 피그마 Layout guide 행: [설정 24 + 이름] 8 [👁 24][− 24] — Fill 행과 같은 열 */
.prow { display: grid; grid-template-columns: minmax(0, 1fr) 28px 28px; gap: 0; align-items: center; min-width: 0; }
.prow > .ef { margin-right: var(--ref-spacing-06); }
.prow.off .ef { opacity: 0.45; }
.ef { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.name { flex: 1; min-width: 0; height: 24px; padding: 0 var(--ref-spacing-02); text-align: left; font-size: 12px; color: var(--sys-color-neutral-800); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 설정 창(§9.1): 폭 240 · 머리 40(종류 ▾ + ✕, 아래 선) · 본문 안쪽 12 16 16 · 줄 사이 8 · 2칸 격자. 테두리 · 그림자는 사이드바(.float)와 같아요 */
.fx-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; text-align: left; }
.pop-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pop-t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.pop-b { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.pop-b > .ig, .pop-b > .ig-l { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pop-b > .ig > span:empty:last-child, .pop-b > .ig-l > span:empty:last-child { display: none; }
.unit { color: var(--sys-color-neutral-500) !important; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 색 칸: [견본 16 · hex] | [불투명도 48 %] (Fill 행과 같아요) */
.pf { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; }
.m0 { margin: 0; }
</style>
