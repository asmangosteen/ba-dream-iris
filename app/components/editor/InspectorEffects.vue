<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { Effect, LayerNode } from '~/canvas/schema'
import { colorLabel, parseColor } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import ColorField from '~/components/editor/ColorField.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'

/** Effects: Drop shadow · Inner shadow · Layer blur · Background blur (피그마와 같아요) */
/** frame: 화면(프레임) 자체의 효과(doc.frame) */
const props = defineProps<{ sid: string; ids: string[]; frame?: boolean }>()
const store = useLayerStore()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const list = computed<Effect[]>(() => (props.frame ? store.doc(props.sid).frame?.effects : nodes.value[0]?.style.effects) ?? [])
/** 피그마 효과 메뉴 순서: Inner shadow · Drop shadow · Layer blur · Background blur */
const TYPES: { value: Effect['type']; label: string }[] = [
  { value: 'inner', label: 'Inner shadow' }, { value: 'drop', label: 'Drop shadow' }, { value: 'blur', label: 'Layer blur' }, { value: 'bgblur', label: 'Background blur' },
]
const open = ref<number | null>(null)
watch(() => props.ids.join(), () => { open.value = null })

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
watch(list, () => { if (open.value !== null) { if (!list.value[open.value]) open.value = null; else nextTick(place) } }, { deep: true })
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
const typeLabel = (t: Effect['type']) => TYPES.find((x) => x.value === t)?.label ?? 'Effect'

function setList(fn: (l: Effect[]) => Effect[]) {
  if (props.frame) { const next = fn([...(store.doc(props.sid).frame?.effects ?? [])]); store.frameStyle(props.sid, { effects: next.length ? next : undefined }); return }
  store.update(props.sid, props.ids, (n) => { const next = fn([...(n.style.effects ?? [])]); return { style: { ...n.style, effects: next.length ? next : undefined } } })
}
/** 피그마처럼 새 효과(Drop shadow)를 넣고 설정을 바로 열어요 */
function add() { const i = list.value.length; setList((l) => [...l, { type: 'drop', x: 0, y: 4, blur: 4, spread: 0, color: '#00000040' }]); open.value = i }
function setType(i: number, t: Effect['type']) {
  setList((l) => l.map((e, k) => {
    if (k !== i || e.type === t) return e
    if (t === 'blur' || t === 'bgblur') return { type: t, blur: e.type === 'blur' || e.type === 'bgblur' ? e.blur : 4, visible: e.visible }
    return e.type === 'drop' || e.type === 'inner' ? { ...e, type: t } : { type: t, x: 0, y: 4, blur: 4, spread: 0, color: '#00000040', visible: e.visible }
  }))
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
    <div :class="['sec-h', 'h24', { empty: !list.length }]"><span>Effects</span><button class="ib s24" aria-label="Add effect" data-tip="Add effect" @click="add"><EditorIcon name="plus" :size="16" /></button></div>
    <div v-for="(e, i) in list" :key="i" class="item">
      <!-- 피그마 Effects 행: [설정 · 종류 ▾] [👁 24] [− 24] -->
      <div :ref="rowRef(i)" class="prow" :class="{ off: e.visible === false }">
        <div class="ef">
          <button :class="['ib', 's24', 'tog', { on: open === i }]" :aria-expanded="open === i" aria-haspopup="dialog" aria-label="Effect settings" data-tip="Effect settings" @click="open = open === i ? null : i">
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path v-if="e.type === 'drop'" d="M3 3h6v6H3z M5 11h6V5" fill="none" stroke="currentColor" stroke-width="1.2" /><path v-else-if="e.type === 'inner'" d="M2.5 2.5h9v9h-9z M4.5 4.5h5" fill="none" stroke="currentColor" stroke-width="1.2" /><path v-else d="M7 2a5 5 0 1 0 0 10A5 5 0 1 0 7 2z M7 4.5v5 M4.5 7h5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.4" /></svg>
          </button>
          <EditorSelect class="grow" :model-value="e.type" :options="TYPES" ariaLabel="Effect type" @update:model-value="(v) => setType(i, v as Effect['type'])" />
        </div>
        <button class="ib s24" :aria-label="e.visible === false ? 'Show effect' : 'Hide effect'" :data-tip="e.visible === false ? 'Show' : 'Hide'" @click="set(i, { visible: e.visible === false ? undefined : false })">
          <EditorIcon :name="e.visible === false ? 'eye_off' : 'eye'" :size="16" />
        </button>
        <button class="ib s24" aria-label="Remove effect" data-tip="Remove" @click="setList((l) => l.filter((_, k) => k !== i)); open = null"><EditorIcon name="minus" :size="16" /></button>
      </div>
      <Teleport v-if="open === i" to="body">
      <div :ref="setPop" class="sq fx-pop editor" role="dialog" :aria-label="`${typeLabel(e.type)} settings`" :style="pos" @keydown.esc.stop.prevent="closePop(true)">
        <div class="pop-h"><span class="pop-t">{{ typeLabel(e.type) }}</span><button type="button" class="ib s24" aria-label="Close" data-tip="Close" @click="closePop(true)"><EditorIcon name="close" :size="16" /></button></div>
        <div class="pop-b">
        <template v-if="shadow(e)">
          <div class="ig-l"><span>Position</span><span /></div>
          <div class="ig">
            <label class="sq fld"><span>X</span><input :key="'x' + e.x" :value="e.x" inputmode="numeric" aria-label="X" @change="num(i, 'x', $event)" @keydown="blur"></label>
            <label class="sq fld"><span>Y</span><input :key="'y' + e.y" :value="e.y" inputmode="numeric" aria-label="Y" @change="num(i, 'y', $event)" @keydown="blur"></label>
            <span />
          </div>
          <div class="ig-l"><span>Blur</span><span>Spread</span></div>
          <div class="ig">
            <label class="sq fld"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.4" /></svg><input :key="'b' + e.blur" :value="e.blur" inputmode="numeric" aria-label="Blur" @change="num(i, 'blur', $event)" @keydown="blur"></label>
            <label class="sq fld"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M2 2h2M10 2h2M2 12h2M10 12h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg><input :key="'s' + e.spread" :value="e.spread ?? 0" inputmode="numeric" aria-label="Spread" @change="num(i, 'spread', $event)" @keydown="blur"></label>
            <span />
          </div>
          <div class="ig-l"><span>Color</span></div>
          <div class="ig">
            <div class="sq fld pf span2">
              <ColorField :model-value="e.color" :sid="sid" label="Shadow color" @update:model-value="(v) => set(i, { color: v })" />
              <input :key="'c' + e.color" class="hex" :value="colorLabel(e.color).split(' ')[0]!.replace('#', '')" aria-label="Shadow hex" spellcheck="false" @change="(ev) => { const v = (ev.target as HTMLInputElement).value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) set(i, { color: withA(v.toUpperCase(), alpha(e.color)) }); else (ev.target as HTMLInputElement).value = hex(e.color).slice(1) }" @keydown="blur" @focus="(ev) => (ev.target as HTMLInputElement).select()">
              <span class="vsep" aria-hidden="true" />
              <span class="op"><input :key="'a' + e.color" class="pct" :value="Math.round(alpha(e.color) * 100)" inputmode="numeric" aria-label="Shadow opacity" @change="(ev) => { const a = Number((ev.target as HTMLInputElement).value.replace('%', '')); if (Number.isFinite(a)) set(i, { color: withA(hex(e.color), Math.min(100, Math.max(0, a)) / 100) }) }" @keydown="blur"><i class="unit">%</i></span>
            </div>
            <span />
          </div>
        </template>
        <template v-else>
          <div class="ig-l"><span>Blur</span></div>
          <div class="ig">
            <label class="sq fld"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.4" /></svg><input :key="'b' + e.blur" :value="e.blur" inputmode="numeric" aria-label="Blur" @change="num(i, 'blur', $event)" @keydown="blur"></label>
            <span /><span />
          </div>
        </template>
        </div>
      </div>
    </Teleport>
    </div>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.h24 { height: 24px; padding: 0; }
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s24 { width: 24px; height: 24px; }
/* 피그마 Effects 행: [설정 24 + 종류 ▾] 8 [👁 24][− 24] — Fill 행과 같은 열 */
.prow { display: grid; grid-template-columns: minmax(0, 1fr) 24px 24px; gap: 0; align-items: center; min-width: 0; }
.prow > .ef { margin-right: var(--ref-spacing-06); }
.prow.off .ef { opacity: 0.45; }
.ef { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.grow { flex: 1; min-width: 0; }
/* 설정 창(§9.1): 폭 240 · 머리 40(제목 + ✕, 아래 선) · 본문 안쪽 12 16 16 · 줄 사이 8 · 2칸 격자. 테두리 · 그림자는 사이드바(.float)와 같아요 */
.fx-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; text-align: left; }
.pop-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pop-t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pop-b { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.pop-b > .ig, .pop-b > .ig-l { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pop-b > .ig > span:empty:last-child, .pop-b > .ig-l > span:empty:last-child { display: none; }
.fld > svg { flex: none; color: var(--sys-color-neutral-500); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 색 칸: [견본 16 · hex] | [불투명도 48 %] (Fill 행과 같아요) */
.pf { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
</style>
