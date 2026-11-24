<script setup lang="ts">
import type { AutoLayout, BindKey, LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import type { CatalogToken } from '~/canvas/tokens'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import TokenPicker from '~/components/editor/TokenPicker.vue'

/**
 * Layout 칸(피그마 UI3와 같아요): 기본은 [Flow(프레임만) · Dimensions · Clip content], 오토 레이아웃이면 같은 칸이 'Auto layout' 으로 바뀌어
 * [Flow · Dimensions · Alignment | Gap · Padding · Clip content]. Dimensions · Clip content 는 InspectorLayer 가 슬롯으로 넣어요
 */
const props = defineProps<{ sid: string; ids: string[] }>()
const store = useLayerStore()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
/** 고른 것이 모두 오토 레이아웃일 때만 조절 칸, 아니면 + (여러 개 · 프레임 아닌 것은 새 프레임으로 감싸서 걸어요) */
const l = computed(() => (nodes.value.length && nodes.value.every((n) => n.style.layout) ? nodes.value[0]!.style.layout : undefined))
const sepPad = ref(false)
watch(() => props.ids.join(), () => { const p = l.value?.padding; sepPad.value = !!p && !(p[0] === p[2] && p[1] === p[3]) }, { immediate: true })

const allFrames = computed(() => nodes.value.length > 0 && nodes.value.every((n) => n.type === 'frame'))
/** Flow 줄: 프레임이거나 이미 오토 레이아웃일 때 */
const flowOk = computed(() => !!l.value || allFrames.value)
/** 오토 레이아웃 넣기 버튼: 프레임 · 여러 개(새 프레임으로 감싸요) */
const addOk = computed(() => !!l.value || allFrames.value || nodes.value.length > 1)
/** 내용에 맞추기: 안에 레이어가 있는 일반 프레임 */
const fitOk = computed(() => !l.value && nodes.value.some((n) => n.type === 'frame' && !!n.children?.length))
type Flow = 'free' | 'vertical' | 'horizontal' | 'grid'
const flowNow = computed<Flow>(() => (!l.value ? 'free' : l.value.wrap ? 'grid' : l.value.mode))
/** Flow 고르기: Freeform = 오토 레이아웃 빼기, 나머지는 (없으면 넣고) 방향 바꾸기. Grid 는 가로 줄바꿈 */
function setFlow(f: Flow) {
  if (f === 'free') { if (l.value) store.removeAutoLayout(props.sid, props.ids); return }
  if (!l.value) store.addAutoLayout(props.sid, props.ids)
  if (f === 'grid') store.setWrap(props.sid, props.ids, true)
  else set({ mode: f, wrap: undefined })
}
const FLOW: { k: Flow; label: string; d: string }[] = [
  { k: 'free', label: 'Freeform', d: 'M3 3.5h4v4H3zM9 9h4v4H9zM11 3.5a2 2 0 1 1 0 4a2 2 0 0 1 0-4z' },
  { k: 'vertical', label: 'Vertical layout', d: 'M2.5 2.5h5v4.5h-5zM2.5 9h5v4.5h-5zM11.5 3v10M9.5 11l2 2 2-2' },
  { k: 'horizontal', label: 'Horizontal layout', d: 'M2.5 3h4.5v5H2.5zM9 3h4.5v5H9zM3 11.5h10M11 9.5l2 2-2 2' },
  { k: 'grid', label: 'Grid (wrap)', d: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z' },
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
/** 변 아이콘(16 그리드): 그 변의 선 + 안쪽 상자 — 위 · 오른 · 아래 · 왼 */
const PAD_ICON: Record<number, string> = { 0: 'M3 2.5h10M5.5 6h5v5.5h-5z', 1: 'M13.5 3v10M4.5 5.5H10v5H4.5z', 2: 'M3 13.5h10M5.5 4.5h5V10h-5z', 3: 'M2.5 3v10M6 5.5h5.5v5H6z' }
/** 간격 아이콘: 두 막대 사이 양쪽 화살표(세로 흐름 · 가로 흐름) — 패딩 아이콘(막대 + 상자)과 구별돼요 */
const GAP_ICON = { v: 'M3 2.5h10M3 13.5h10M8 5v6M6.5 6.5L8 5l1.5 1.5M6.5 9.5L8 11l1.5-1.5', h: 'M2.5 3v10M13.5 3v10M5 8h6M6.5 6.5L5 8l1.5 1.5M9.5 6.5L11 8l-1.5 1.5' }
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
        <button v-if="fitOk" class="ib s24" :aria-label="tr('Resize to fit')" :title="tr('Resize to fit')" @click="store.resizeToFit(sid, ids)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5L6 6M6 3.5V6H3.5M13.5 2.5L10 6M10 3.5V6h2.5M2.5 13.5L6 10M6 12.5V10H3.5M13.5 13.5L10 10M10 12.5V10h2.5" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button v-if="addOk" :class="['ib', 's24', 'tog', { on: !!l }]" :aria-pressed="!!l" :aria-label="l ? tr('Remove auto layout') + ' (⌥⇧A)' : tr('Add auto layout') + ' (⇧A)'" :title="l ? tr('Remove auto layout') + ' ⌥⇧A' : tr('Add auto layout') + ' ⇧A'" @click="l ? store.removeAutoLayout(sid, ids) : store.addAutoLayout(sid, ids)">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h4v11h-4zM9.5 2.5h4v4.5h-4z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" /><path v-if="!l" d="M11.5 9.5v4M9.5 11.5h4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><path v-else d="M9.5 11.5l1.5 1.5 2.5-3" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </span>
    </div>
    <!-- Flow: Freeform · 세로 · 가로 · Grid(가로 줄바꿈) + 오토 레이아웃이면 줄바꿈 토글 -->
    <template v-if="flowOk">
      <div class="ig-l"><span>{{ tr('Flow') }}</span></div>
      <div class="ig">
        <div class="grp span2 flow" role="radiogroup" :aria-label="tr('Flow')">
          <button v-for="f in FLOW" :key="f.k" role="radio" :aria-checked="flowNow === f.k" :class="['ib', { on: flowNow === f.k }]" :aria-label="tr(f.label)" :title="tr(f.label)" @click="setFlow(f.k)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="f.d" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        </div>
        <button v-if="l" :class="['ib', 's24', 'tog', { on: !!l.wrap }]" :aria-pressed="!!l.wrap" :aria-label="tr('Wrap')" :title="tr('Wrap')" @click="store.setWrap(sid, ids, !l.wrap)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h8.5a2.75 2.75 0 0 1 0 5.5H5.5M8 7.5L5.5 10 8 12.5" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
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
          <label class="sq fld" :title="tr('Gap between items')">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="l.mode === 'horizontal' ? GAP_ICON.h : GAP_ICON.v" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <template v-if="l.gap !== 'auto'">
              <input v-if="!vb(['gap'])" :key="'g' + l.gap" :value="l.gap" inputmode="decimal" :aria-label="tr('Gap between items')" @change="num($event, (v) => set({ gap: v }))" @keydown="blur($event); step($event, (d) => set({ gap: Math.max(0, (l!.gap === 'auto' ? 0 : l!.gap) + d) }))">
              <TokenPicker :kinds="['spacing']" :bound="vb(['gap'])" reveal short label="Gap between items" @pick="pickGap" @unbind="unbind(['gap'])" @step="(d) => set({ gap: Math.max(0, (l!.gap === 'auto' ? 0 : l!.gap) + d) })" />
            </template>
            <span v-else class="auto">{{ tr('Auto') }}</span>
            <EditorSelect variant="inline" :model-value="l.gap === 'auto' ? 'auto' : 'fixed'" :options="GAP_OPTS" ariaLabel="Gap mode" @update:model-value="setGapMode" />
          </label>
          <label v-if="l.wrap" class="sq fld" :title="tr('Gap between rows')">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="GAP_ICON.v" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
        <label class="sq fld" :title="tr('Horizontal padding')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3v10M13.5 3v10M6 5.5h4v5H6z" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><input v-if="!vb(padKeys([1, 3]))" :key="'ph' + l.padding[3]" :value="l.padding[3] === l.padding[1] ? l.padding[3] : ''" :placeholder="l.padding[3] === l.padding[1] ? '' : tr('Mixed')" inputmode="decimal" :aria-label="tr('Horizontal padding')" @change="num($event, (v) => padHV('h', v))" @keydown="blur($event); step($event, (d) => padHV('h', Math.max(0, l!.padding[3] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([1, 3]))" reveal short label="Horizontal padding" @pick="(t) => pickPad([1, 3], t)" @unbind="unbind(padKeys([1, 3]))" @step="(d) => padHV('h', Math.max(0, l!.padding[3] + d))" /></label>
        <label class="sq fld" :title="tr('Vertical padding')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h10M3 13.5h10M5.5 6h5v4h-5z" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><input v-if="!vb(padKeys([0, 2]))" :key="'pv' + l.padding[0]" :value="l.padding[0] === l.padding[2] ? l.padding[0] : ''" :placeholder="l.padding[0] === l.padding[2] ? '' : tr('Mixed')" inputmode="decimal" :aria-label="tr('Vertical padding')" @change="num($event, (v) => padHV('v', v))" @keydown="blur($event); step($event, (d) => padHV('v', Math.max(0, l!.padding[0] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([0, 2]))" reveal short label="Vertical padding" @pick="(t) => pickPad([0, 2], t)" @unbind="unbind(padKeys([0, 2]))" @step="(d) => padHV('v', Math.max(0, l!.padding[0] + d))" /></label>
        <button class="ib s24 tog" :aria-pressed="false" :aria-label="tr('Individual padding')" :title="tr('Individual padding')" @click="sepPad = true"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5V3.5a1 1 0 0 1 1-1H5M11 2.5h1.5a1 1 0 0 1 1 1V5M13.5 11v1.5a1 1 0 0 1-1 1H11M5 13.5H3.5a1 1 0 0 1-1-1V11M6 6h4v4H6z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      </div>
      <template v-else>
        <div v-for="(pair, r) in PAD4" :key="r" class="ig">
          <label v-for="p in pair" :key="p.nm" class="sq fld" :title="tr(`${p.nm} padding`)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="PAD_ICON[p.i]" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><input v-if="!vb(padKeys([p.i]))" :key="p.nm + l.padding[p.i]" :value="l.padding[p.i]" inputmode="decimal" :aria-label="tr(`${p.nm} padding`)" @change="num($event, (v) => pad(p.i, v))" @keydown="blur($event); step($event, (d) => pad(p.i, Math.max(0, l!.padding[p.i] + d)))"><TokenPicker :kinds="['spacing']" :bound="vb(padKeys([p.i]))" reveal short :label="`${p.nm} padding`" @pick="(t) => pickPad([p.i], t)" @unbind="unbind(padKeys([p.i]))" @step="(d) => pad(p.i, Math.max(0, l!.padding[p.i] + d))" /></label>
          <button v-if="r === 0" class="ib s24 tog on" :aria-pressed="true" :aria-label="tr('Individual padding')" :title="tr('Individual padding')" @click="sepPad = false"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5V3.5a1 1 0 0 1 1-1H5M11 2.5h1.5a1 1 0 0 1 1 1V5M13.5 11v1.5a1 1 0 0 1-1 1H11M5 13.5H3.5a1 1 0 0 1-1-1V11M6 6h4v4H6z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
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
.h24 { height: 24px; padding: 0; }
/* 꺼져 있으면 빈 섹션(Stroke · Effects)처럼 제목을 옅게 */
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s24 { width: 24px; height: 24px; }
.ig.top { align-items: start; }
/* 정렬판: 왼쪽 칸 폭 × 64(칸 두 줄 높이), 점 3 × 3. 고른 칸 · 올린 칸은 흐름 방향 막대 3개로 미리 보여요(피그마) */
.align { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); width: 100%; height: 64px; padding: 4px; box-sizing: border-box; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-200); }
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
