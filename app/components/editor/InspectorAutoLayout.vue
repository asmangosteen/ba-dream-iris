<script setup lang="ts">
import type { AutoLayout, BindKey, LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import type { CatalogToken } from '~/canvas/tokens'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import { useAlHint, type AlHint } from '~/composables/useLayerMenu'

/**
 * Layout 칸(피그마 UI3와 같아요): 기본은 [Flow(프레임만) · Dimensions · Clip content], 오토 레이아웃이면 같은 칸이 'Auto layout' 으로 바뀌어
 * [Flow · Dimensions · Alignment | Gap · Padding · Clip content]. Dimensions · Clip content 는 InspectorLayer 가 슬롯으로 넣어요
 */
const props = defineProps<{ sid: string; ids: string[] }>()
/** 간격 · 여백 칸에 올리거나(호버) 고치는 동안(포커스) 캔버스에 그 자리 표시 */
const alHint = useAlHint()
const hovH = ref<AlHint | null>(null), focH = ref<AlHint | null>(null)
watchEffect(() => { alHint.value = hovH.value ?? focH.value })
onBeforeUnmount(() => { alHint.value = null })
const hintOn = (h: AlHint) => ({ onPointerenter: () => (hovH.value = h), onPointerleave: () => { if (hovH.value === h) hovH.value = null }, onFocusin: () => (focH.value = h), onFocusout: () => { if (focH.value === h) focH.value = null } })
const store = useLayerStore()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
/**
 * 오토 레이아웃 조절 칸('Auto layout')은 오토 레이아웃 하나를 골랐을 때만. 각자 오토 레이아웃인 것 여럿을 골라도 서로 관계없는 것이라
 * 기본 'Layout' 칸 — + 로 새 오토 레이아웃 프레임에 함께 감싸야(⇧A) 그 프레임의 'Auto layout' 칸이 떠요(사용자 요청 2026-11-26)
 */
const l = computed(() => (nodes.value.length === 1 ? nodes.value[0]!.style.layout : undefined))
const sepPad = ref(false)
watch(() => props.ids.join(), () => { const p = l.value?.padding; sepPad.value = !!p && !(p[0] === p[2] && p[1] === p[3]) }, { immediate: true })

// 섹션도 프레임처럼 오토 레이아웃을 넣을 수 있어요
const allFrames = computed(() => nodes.value.length > 0 && nodes.value.every((n) => n.type === 'frame' || n.type === 'section'))
/** Flow 줄: 프레임(섹션) 하나이거나 이미 오토 레이아웃일 때 — 여러 개는 + 로 감싸요 */
const flowOk = computed(() => !!l.value || (allFrames.value && nodes.value.length === 1))
/** 오토 레이아웃 넣기 버튼: 프레임 · 여러 개(새 프레임으로 감싸요) */
const addOk = computed(() => !!l.value || allFrames.value || nodes.value.length > 1)
/** 내용에 맞추기: 안에 레이어가 있는 일반 프레임 */
const fitOk = computed(() => !l.value && nodes.value.some((n) => (n.type === 'frame' || n.type === 'section') && !!n.children?.length))
type Flow = 'free' | 'vertical' | 'horizontal' | 'grid'
const flowNow = computed<Flow>(() => (!l.value ? 'free' : l.value.wrap ? 'grid' : l.value.mode))
/** Flow 고르기: Freeform = 오토 레이아웃 빼기, 나머지는 (없으면 넣고) 방향 바꾸기. Grid 는 가로 줄바꿈 */
function setFlow(f: Flow) {
  if (f === 'free') { if (l.value) store.removeAutoLayout(props.sid, props.ids); return }
  if (!l.value) store.addAutoLayout(props.sid, props.ids)
  if (f === 'grid') store.setWrap(props.sid, props.ids, true)
  else set({ mode: f, wrap: undefined })
}
const FLOW: { k: Flow; label: string; icon: string }[] = [
  { k: 'free', label: 'Freeform', icon: 'layout_free' },
  { k: 'vertical', label: 'Vertical layout', icon: 'layout_vertical' },
  { k: 'horizontal', label: 'Horizontal layout', icon: 'layout_horizontal' },
  { k: 'grid', label: 'Grid (wrap)', icon: 'layout_grid_wrap' },
]
function set(patch: Partial<AutoLayout>) {
  store.update(props.sid, props.ids, (n) => (n.style.layout ? { style: { ...n.style, layout: { ...n.style.layout, ...patch } } } : {}))
}
function num(e: Event, fn: (v: number) => void, min = 0) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) fn(Math.max(min, Math.round(v * 10) / 10))
}
const pad = (i: number, v: number) => { const p = [...(l.value?.padding ?? [0, 0, 0, 0])] as AutoLayout['padding']; p[i] = v; set({ padding: p }) }
const padHV = (axis: 'h' | 'v', v: number) => { const p = [...(l.value?.padding ?? [0, 0, 0, 0])] as AutoLayout['padding']; if (axis === 'h') { p[1] = v; p[3] = v } else { p[0] = v; p[2] = v } set({ padding: p }) }
/** 간격 ▾ (피그마 Gap 메뉴): 고정 값 · Auto(사이 띄우기) */
const GAP_OPTS = [{ value: 'fixed', label: 'Fixed spacing', short: '' }, { value: 'auto', label: 'Auto (space between)', short: '' }]
function setGapMode(v: string) { if (v === 'auto') set({ gap: 'auto' }); else if (l.value?.gap === 'auto') set({ gap: 10 }) }
/** 개별 패딩 4칸: 피그마처럼 왼쪽 · 위 / 오른쪽 · 아래 (padding 순서는 위 · 오른 · 아래 · 왼) */
const PAD4 = [[{ i: 3, nm: 'Left' }, { i: 0, nm: 'Top' }], [{ i: 1, nm: 'Right' }, { i: 2, nm: 'Bottom' }]] as const
/** 변 아이콘 — 위 · 오른 · 아래 · 왼 */
const PAD_ICON: Record<number, string> = { 0: 'padding_top', 1: 'padding_right', 2: 'padding_bottom', 3: 'padding_left' }
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }

/**
 * 토큰(변수) 연결 — Gap · Padding 도 X · Y 처럼 spacing 토큰을 걸 수 있어요(피그마 변수와 같아요).
 * 연결하면 숫자 대신 토큰 칩, 값을 직접 바꾸면 연결이 풀려요(store 의 record)
 */
const PAD_KEYS = ['padding.0', 'padding.1', 'padding.2', 'padding.3'] as const
/** 고른 레이어들 · 여러 키(가로 = 왼 · 오른)가 모두 같은 토큰이면 그 id, 다르면 'Mixed', 없으면 null */
function vb(keys: BindKey[]): string | null {
  const vals = nodes.value.flatMap((n) => keys.map((k) => n.style.vars?.[k] ?? null))
  if (!vals.length || vals.every((v) => v === null)) return null
  return vals.every((v) => v === vals[0]) ? vals[0] ?? null : 'Mixed'
}
function pickGap(t: CatalogToken) {
  if (t.num === undefined) return
  store.bind(props.sid, props.ids, 'gap', t.id, (n) => ({ style: n.style.layout ? { layout: { ...n.style.layout, gap: t.num! } } : {} }))
}
function pickRowGap(t: CatalogToken) {
  if (t.num === undefined) return
  store.bind(props.sid, props.ids, 'rowGap', t.id, (n) => ({ style: n.style.layout ? { layout: { ...n.style.layout, rowGap: t.num! } } : {} }))
}
function pickPad(idx: number[], t: CatalogToken) {
  if (t.num === undefined) return
  store.bind(props.sid, props.ids, idx.map((i) => PAD_KEYS[i]!), t.id, (n) => {
    if (!n.style.layout) return {}
    const p = [...n.style.layout.padding] as AutoLayout['padding']
    for (const i of idx) p[i] = t.num!
    return { style: { layout: { ...n.style.layout, padding: p } } }
  })
}
const unbind = (keys: BindKey[]) => store.unbind(props.sid, props.ids, keys)
const padKeys = (idx: number[]) => idx.map((i) => PAD_KEYS[i]!) as BindKey[]
/** ↑↓ 1씩, Shift 10씩 */
function step(e: KeyboardEvent, apply: (d: number) => void) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  apply((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}
/** Esc: 고치던 값을 버리고 칸에서 나가요 */
function onFocusIn(e: FocusEvent) { const t = e.target as HTMLInputElement; if (t.tagName === 'INPUT') t.dataset.orig = t.value }
function onEsc(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement
  if (e.key !== 'Escape' || t.tagName !== 'INPUT') return
  e.stopPropagation()
  t.dataset.esc = '1'
  t.value = t.dataset.orig ?? t.value
  t.blur()
  delete t.dataset.esc
}
function onChangeCap(e: Event) { if ((e.target as HTMLElement).dataset?.esc) e.stopPropagation() }
/** 3 × 3 정렬: 가로(왼 · 가운데 · 오른) × 세로(위 · 가운데 · 아래) → 진행 · 수직 정렬 */
const AL = ['start', 'center', 'end'] as const
function pick(col: number, row: number) {
  const h = l.value?.mode === 'horizontal'
  set(h ? { align: AL[col], cross: AL[row] } : { align: AL[row], cross: AL[col] })
}
/** 정렬판 두 번 누르기: 간격 Auto(사이 띄우기) ↔ 고정 간격(전에 쓰던 값) — 피그마와 같아요 */
let lastGap = 10
function toggleAuto() {
  const v = l.value
  if (!v) return
  if (v.gap === 'auto') set({ gap: lastGap })
  else { lastGap = v.gap; set({ gap: 'auto' }) }
}
const isOn = (col: number, row: number) => {
  const v = l.value
  if (!v) return false
  return v.mode === 'horizontal' ? (v.gap === 'auto' || v.align === AL[col]) && v.cross === AL[row] : (v.gap === 'auto' || v.align === AL[row]) && v.cross === AL[col]
}
</script>

<template>
  <section class="s" @focusin="onFocusIn" @keydown="onEsc" @change.capture="onChangeCap">
    <div class="sec-h h24">
      <span>{{ l ? tr('Auto layout') : tr('Layout') }}</span>
      <span class="hacts">
        <button v-if="fitOk" class="ib s24" :aria-label="tr('Resize to fit')" :title="tr('Resize to fit')" @click="store.resizeToFit(sid, ids)"><EditorIcon name="resize_to_fit" /></button>
        <button v-if="addOk" :class="['ib', 's24', 'tog', { on: !!l }]" :aria-pressed="!!l" :aria-label="l ? tr('Remove auto layout') + ' (⌥⇧A)' : tr('Add auto layout') + ' (⇧A)'" :title="l ? tr('Remove auto layout') + ' ⌥⇧A' : tr('Add auto layout') + ' ⇧A'" @click="l ? store.removeAutoLayout(sid, ids) : store.addAutoLayout(sid, ids)">
          <EditorIcon :name="l ? 'autolayout_on' : 'autolayout_add'" />
        </button>
      </span>
    </div>
    <!-- Flow: Freeform · 세로 · 가로 · Grid(가로 줄바꿈) + 오토 레이아웃이면 줄바꿈 토글 -->
    <template v-if="flowOk">
      <div class="ig-l"><span>{{ tr('Flow') }}</span></div>
      <div class="ig">
        <div class="grp span2 flow" role="radiogroup" :aria-label="tr('Flow')">
          <button v-for="f in FLOW" :key="f.k" role="radio" :aria-checked="flowNow === f.k" :class="['ib', { on: flowNow === f.k }]" :aria-label="tr(f.label)" :title="tr(f.label)" @click="setFlow(f.k)"><EditorIcon :name="f.icon" /></button>
        </div>
        <button v-if="l" :class="['ib', 's24', 'tog', { on: !!l.wrap }]" :aria-pressed="!!l.wrap" :aria-label="tr('Wrap')" :title="tr('Wrap')" @click="store.setWrap(sid, ids, !l.wrap)"><EditorIcon name="wrap" /></button>
        <span v-else />
      </div>
    </template>
    <slot name="dims" />
    <template v-if="l">
      <!-- Alignment | Gap -->
      <div class="ig-l"><span>{{ tr('Alignment') }}</span><span>{{ tr('Gap') }}</span></div>
      <div class="ig top">
        <div :class="['sq', 'align', { spread: l.gap === 'auto' }]" role="group" :aria-label="tr('Alignment')" :title="tr('Double-click for auto spacing')" @dblclick="toggleAuto">
          <template v-for="row in 3" :key="row">
            <button v-for="col in 3" :key="col" :class="['dot', l.mode === 'horizontal' ? 'hz' : 'vt', ['c0', 'c1', 'c2'][col - 1], ['r0', 'r1', 'r2'][row - 1], { on: isOn(col - 1, row - 1) }]" :aria-pressed="isOn(col - 1, row - 1)" :aria-label="tr(`Align ${['top', 'middle', 'bottom'][row - 1]} ${['left', 'center', 'right'][col - 1]}`)" :title="tr(`Align ${['top', 'middle', 'bottom'][row - 1]} ${['left', 'center', 'right'][col - 1]}`)" @click="pick(col - 1, row - 1)"><i class="pt" /><span class="bars" aria-hidden="true"><i /><i /><i /></span></button>
          </template>
        </div>
        <div class="side">
          <label class="sq fld" :title="tr('Gap between items')" v-bind="hintOn('gap')">
            <EditorIcon :name="l.mode === 'horizontal' ? 'gap_horizontal' : 'gap_vertical'" />
            <template v-if="l.gap !== 'auto'">
              <input v-if="!vb(['gap'])" :key="'g' + l.gap" :value="l.gap" inputmode="decimal" :aria-label="tr('Gap between items')" @change="num($event, (v) => set({ gap: v }))" @keydown="blur($event); step($event, (d) => set({ gap: Math.max(0, (l!.gap === 'auto' ? 0 : l!.gap) + d) }))">
              <TokenPicker :kinds="['spacing']" :bound="vb(['gap'])" reveal short label="Gap between items" @pick="pickGap" @unbind="unbind(['gap'])" @step="(d) => set({ gap: Math.max(0, (l!.gap === 'auto' ? 0 : l!.gap) + d) })" />
            </template>
            <span v-else class="auto">{{ tr('Auto') }}</span>
            <EditorSelect variant="inline" :model-value="l.gap === 'auto' ? 'auto' : 'fixed'" :options="GAP_OPTS" ariaLabel="Gap mode" @update:model-value="setGapMode" />
          </label>
          <label v-if="l.wrap" class="sq fld" :title="tr('Gap between rows')" v-bind="hintOn('rowGap')">
            <EditorIcon name="gap_vertical" />
            <input v-if="!vb(['rowGap'])" :key="'rg' + l.rowGap" :value="l.rowGap ?? (l.gap === 'auto' ? 0 : l.gap)" inputmode="decimal" :aria-label="tr('Gap between rows')" @change="num($event, (v) => set({ rowGap: v }))" @keydown="blur($event); step($event, (d) => set({ rowGap: Math.max(0, (l!.rowGap ?? (l!.gap === 'auto' ? 0 : l!.gap)) + d) }))">
            <!-- 줄 간격도 간격 · 패딩처럼 spacing 토큰(칩을 누르면 커서, 다시 누르면 토큰 창) -->
            <TokenPicker :kinds="['spacing']" :bound="vb(['rowGap'])" reveal short label="Gap between rows" @pick="pickRowGap" @unbind="unbind(['rowGap'])" @step="(d) => set({ rowGap: Math.max(0, (l!.rowGap ?? (l!.gap === 'auto' ? 0 : l!.gap)) + d) })" />
          </label>
        </div>
        <span />
      </div>
      <!-- Padding: 가로 | 세로 + 개별 패딩 토글, 켜면 왼 · 위 / 오른 · 아래 -->
      <div class="ig-l"><span>{{ tr('Padding') }}</span></div>
      <div v-if="!sepPad" class="ig">
        <label class="sq fld" :title="tr('Horizontal padding')" v-bind="hintOn('padH')"><EditorIcon name="padding_horizontal" /><input v-if="!vb(padKeys([1, 3]))" :key="'ph' + l.padding[3]" :value="l.padding[3] === l.padding[1] ? l.padding[3] : ''" :placeholder="l.padding[3] === l.padding[1] ? '' : tr('Mixed')" inputmode="decimal" :aria-label="tr('Horizontal padding')" @change="num($event, (v) => padHV('h', v))" @keydown="blur($event); step($event, (d) => padHV('h', Math.max(0, l!.padding[3] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([1, 3]))" reveal short label="Horizontal padding" @pick="(t) => pickPad([1, 3], t)" @unbind="unbind(padKeys([1, 3]))" @step="(d) => padHV('h', Math.max(0, l!.padding[3] + d))" /></label>
        <label class="sq fld" :title="tr('Vertical padding')" v-bind="hintOn('padV')"><EditorIcon name="padding_vertical" /><input v-if="!vb(padKeys([0, 2]))" :key="'pv' + l.padding[0]" :value="l.padding[0] === l.padding[2] ? l.padding[0] : ''" :placeholder="l.padding[0] === l.padding[2] ? '' : tr('Mixed')" inputmode="decimal" :aria-label="tr('Vertical padding')" @change="num($event, (v) => padHV('v', v))" @keydown="blur($event); step($event, (d) => padHV('v', Math.max(0, l!.padding[0] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([0, 2]))" reveal short label="Vertical padding" @pick="(t) => pickPad([0, 2], t)" @unbind="unbind(padKeys([0, 2]))" @step="(d) => padHV('v', Math.max(0, l!.padding[0] + d))" /></label>
        <button class="ib s24 tog" :aria-pressed="false" :aria-label="tr('Individual padding')" :title="tr('Individual padding')" @click="sepPad = true"><EditorIcon name="padding_individual" /></button>
      </div>
      <template v-else>
        <div v-for="(pair, r) in PAD4" :key="r" class="ig">
          <label v-for="p in pair" :key="p.nm" class="sq fld" :title="tr(`${p.nm} padding`)" v-bind="hintOn(p.i as 0 | 1 | 2 | 3)"><EditorIcon :name="PAD_ICON[p.i]!" /><input v-if="!vb(padKeys([p.i]))" :key="p.nm + l.padding[p.i]" :value="l.padding[p.i]" inputmode="decimal" :aria-label="tr(`${p.nm} padding`)" @change="num($event, (v) => pad(p.i, v))" @keydown="blur($event); step($event, (d) => pad(p.i, Math.max(0, l!.padding[p.i] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([p.i]))" reveal short :label="`${p.nm} padding`" @pick="(t) => pickPad([p.i], t)" @unbind="unbind(padKeys([p.i]))" @step="(d) => pad(p.i, Math.max(0, l!.padding[p.i] + d))" /></label>
          <button v-if="r === 0" class="ib s24 tog on" :aria-pressed="true" :aria-label="tr('Individual padding')" :title="tr('Individual padding')" @click="sepPad = false"><EditorIcon name="padding_individual" /></button>
          <span v-else />
        </div>
      </template>
    </template>
    <slot name="clip" />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.s:has(> .sec-h:only-child) { padding-bottom: var(--ref-spacing-08); }
.hacts { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.h24 { height: 28px; padding: 0; }
/* 꺼져 있으면 빈 섹션(Stroke · Effects)처럼 제목을 옅게 */
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s24 { width: 28px; height: 28px; }
.ig.top { align-items: start; }
/* 정렬판: 왼쪽 칸 폭 × 64(칸 두 줄 높이), 점 3 × 3. 고른 칸 · 올린 칸은 흐름 방향 막대 3개로 미리 보여요(피그마) */
.align { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); width: 100%; height: 64px; padding: 4px; box-sizing: border-box; border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); }
.dot { position: relative; display: grid; place-items: center; border-radius: 3px; min-width: 0; }
.dot .pt { width: 3px; height: 3px; border-radius: 1px; background: var(--sys-color-neutral-400); }
.dot .bars { display: none; gap: 2px; }
.dot.vt .bars { flex-direction: column; }
.dot.vt .bars > i { height: 2px; border-radius: 1px; background: currentColor; }
.dot.vt .bars > i:nth-child(1) { width: 12px; } .dot.vt .bars > i:nth-child(2) { width: 8px; } .dot.vt .bars > i:nth-child(3) { width: 10px; }
.dot.vt.c0 .bars { align-items: flex-start; } .dot.vt.c1 .bars { align-items: center; } .dot.vt.c2 .bars { align-items: flex-end; }
.dot.hz .bars > i { width: 2px; border-radius: 1px; background: currentColor; }
.dot.hz .bars > i:nth-child(1) { height: 12px; } .dot.hz .bars > i:nth-child(2) { height: 8px; } .dot.hz .bars > i:nth-child(3) { height: 10px; }
.dot.hz.r0 .bars { align-items: flex-start; } .dot.hz.r1 .bars { align-items: center; } .dot.hz.r2 .bars { align-items: flex-end; }
.dot:hover .pt, .dot.on .pt { display: none; }
.dot:hover .bars, .dot.on .bars { display: flex; }
.dot:hover { color: var(--sys-color-neutral-500); }
.dot.on { color: var(--iris-select, #0D99FF); }
/* 간격 Auto: 고른 줄의 세 칸에 막대 하나씩(양끝은 길게, 가운데는 짧게) — 피그마와 같아요 */
.spread .dot.on .bars > i:nth-child(n + 2) { display: none; }
.spread .dot.vt.on .bars > i:first-child { width: 12px; } .spread .dot.vt.on.r1 .bars > i:first-child { width: 6px; }
.spread .dot.hz.on .bars > i:first-child { height: 12px; } .spread .dot.hz.on.c1 .bars > i:first-child { height: 6px; }
.dot:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -1px; }
.side { display: flex; flex-direction: column; gap: var(--ref-spacing-06); min-width: 0; }
.auto { flex: 1; min-width: 0; font-size: 12px; color: var(--sys-color-neutral-800) !important; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
</style>
