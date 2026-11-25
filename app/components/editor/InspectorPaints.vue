<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { BindKey, LayerNode, LayerStyle, Paint } from '~/canvas/schema'
import { colorLabel, type CatalogToken } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc } from '~/canvas/images'
import { paintLayer } from '~/canvas/paint'
import { alphaOf, hexOf, normHex, withAlpha } from '~/canvas/color'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import PaintPopover from '~/components/editor/PaintPopover.vue'

/**
 * Fill · Stroke 칠 목록(피그마와 같아요: 위에 있는 칠이 위에 그려져요).
 * 맨 아래 줄은 바탕 칠(fill · stroke · color) — 토큰을 연결할 수 있어요. 위 줄들은 덧붙인 칠(fills · strokes): 단색 · 그라디언트 · 이미지.
 * 견본을 누르면 피그마 같은 칠 편집 창(색 판 · 그라디언트 · 이미지)이 떠요.
 * frame: 화면(프레임) 자체의 모양(doc.frame)을 고쳐요 — 칠이 비어 있으면 흰 바탕, '' 이면 칠 없음
 */
/** sids: 프레임 여러 개를 함께 고칠 때(frame) — 값이 다르면 Mixed, 고치면 모두에 */
const props = defineProps<{ sid: string; ids: string[]; kind: 'fill' | 'stroke' | 'text'; title: string; frame?: boolean; sids?: string[] }>()
const store = useLayerStore()
const imageSrc = useImageSrc()

const base = computed(() => (props.kind === 'fill' ? 'fill' : props.kind === 'stroke' ? 'stroke' : 'color') as 'fill' | 'stroke' | 'color')
const extraKey = computed(() => (props.kind === 'stroke' ? 'strokes' : 'fills') as 'fills' | 'strokes')
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const look = computed<LayerStyle>(() => store.doc(props.sid).frame ?? {})
const frameIds = computed(() => (props.sids?.length ? props.sids : [props.sid]))
const styles = computed<LayerStyle[]>(() => (props.frame ? frameIds.value.map((id) => store.doc(id).frame ?? {}) : nodes.value.map((n) => n.style)))
/** 프레임 모양 고치기: 고른 프레임 모두에(실행취소 한 번) */
function frameAll(patch: Partial<LayerStyle> | ((s: LayerStyle) => Partial<LayerStyle>), vars?: Record<string, string | null>) {
  store.batch(() => { for (const id of frameIds.value) store.frameStyle(id, typeof patch === 'function' ? patch(store.doc(id).frame ?? {}) : patch, vars) })
}
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
const rows = computed(() => (mixed.value ? [] : [...extras.value.map((_, i) => i).reverse(), ...(baseVal.value ? [-1] : [])]))
const types = computed<Paint['type'][]>(() => (props.kind === 'stroke' ? ['solid'] : ['solid', 'linear', 'radial', 'angular', 'image']))
const TYPE_NAME: Record<Paint['type'], string> = { solid: 'Solid', linear: 'Linear', radial: 'Radial', angular: 'Angular', image: 'Image' }

function patchAll(fn: (s: LayerStyle) => Partial<LayerStyle>, vars?: Record<string, string | null>) {
  if (props.frame) frameAll(fn, vars)
  else store.update(props.sid, props.ids, (n) => ({ style: { ...n.style, ...fn(n.style) } }))
}
const setExtras = (fn: (list: Paint[]) => Paint[]) => patchAll((s) => { const l = fn([...(s[extraKey.value] ?? [])]); return { [extraKey.value]: l.length ? l : undefined } })

function add() {
  // 여러 값(Mixed): 모두 같은 칠 하나로 바꿔요(피그마와 같아요)
  if (mixed.value) {
    const v = props.kind === 'stroke' ? '#000000' : props.kind === 'text' ? '#000000' : props.frame ? '#FFFFFF' : '#D9D9D9'
    const unbound = (s: LayerStyle) => { const vars: Record<string, string> = { ...(s.vars as Record<string, string> | undefined) }; delete vars[base.value]; return Object.keys(vars).length ? vars : undefined }
    if (props.frame) frameAll({ fill: v, fills: undefined }, { fill: null })
    else patchAll((s) => ({ [base.value]: v, [extraKey.value]: undefined, vars: unbound(s), ...(props.kind === 'stroke' ? { strokeWidth: s.strokeWidth || 1 } : {}) }))
    return
  }
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
  const p = change({ type: 'solid', color: hexOf(store.color(c) ?? c), opacity: alphaOf(store.color(c) ?? c) < 1 ? alphaOf(store.color(c) ?? c) : undefined, ...(bound.value ? { token: bound.value } : {}) })
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
/** 덧붙인 단색의 색을 직접 바꾸면 토큰 연결은 풀려요 */
function setPaint(i: number, p: Paint) {
  setExtras((l) => l.map((x, k) => {
    if (k !== i) return x
    if (p.type === 'solid' && x.type === 'solid' && x.token && p.token === x.token && hexOf(p.color) !== hexOf(x.color)) { const { token: _t, ...rest } = p; return rest }
    return p
  }))
}
function bindExtra(i: number, t: CatalogToken) { const p = extras.value[i]; if (p?.type === 'solid' && t.color) setPaint(i, { ...p, color: hexOf(t.color), opacity: alphaOf(t.color) < 1 ? alphaOf(t.color) : p.opacity, token: t.id }) }
function unbindExtra(i: number) { const p = extras.value[i]; if (p?.type === 'solid') { const { token: _t, ...rest } = p; setExtras((l) => l.map((x, k) => (k === i ? rest : x))) } }

// --- 끌어서 순서 바꾸기(피그마와 같아요): 보이는 줄 순서(위 → 아래)로 옮겨요 ---
const { box: dragBox, drag, start: dragStart, key: dragKey } = useRowDrag(reorder)
function reorder(from: number, to: number) {
  open.value = null
  const order = moveItem(rows.value, from, to).reverse() // 아래 → 위
  if (!order.includes(-1) || order[0] === -1) { setExtras(() => order.filter((i) => i >= 0).map((i) => extras.value[i]!)); return }
  // 바탕 칠이 위로 올라갔어요: 모두 칠 목록으로 놓고 다시 나눠요
  const c = store.color(baseVal.value) ?? baseVal.value ?? '#000000'
  const basePaint: Paint = { type: 'solid', color: hexOf(c), opacity: alphaOf(c) < 1 ? alphaOf(c) : undefined, ...(bound.value ? { token: bound.value } : {}) }
  applyList(order.map((i) => (i < 0 ? basePaint : extras.value[i]!)))
}
/** 아래 → 위 칠 목록을 바탕 칠 + 덧붙인 칠로: 맨 아래가 보이는 단색이면 바탕 칠(토큰도 다시 연결), 아니면 모두 덧붙인 칠 */
function applyList(list: Paint[]) {
  const b = list[0]
  const solidB = b && b.type === 'solid' && b.visible !== false ? b : null
  const ex = solidB ? list.slice(1) : list
  const val = solidB ? withAlpha(solidB.color, solidB.opacity ?? 1) : undefined
  const tok = solidB?.token
  if (props.frame) { frameAll({ fill: val ?? '', fills: ex.length ? ex : undefined }, { fill: tok ?? null }); return }
  patchAll((s) => {
    const vars: Record<string, string> = { ...(s.vars as Record<string, string> | undefined) }
    delete vars[base.value]
    if (tok) vars[base.value] = tok
    return { [base.value]: val, [extraKey.value]: ex.length ? ex : undefined, vars: Object.keys(vars).length ? vars : undefined }
  })
}

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
  if (props.frame) frameAll({ fill: t.color }, { fill: t.id })
  else store.bind(props.sid, props.ids, base.value, t.id, () => ({ style: { [base.value]: t.color } }))
}
function unbind() {
  if (props.frame) frameAll({ fill: store.color(look.value.fill) ?? look.value.fill }, { fill: null })
  else store.unbind(props.sid, props.ids, [base.value], (n) => ({ style: n.style[base.value]?.startsWith('token:') ? { [base.value]: store.color(n.style[base.value]) } : {} }))
}
function createdStyle(id: string) {
  const v = store.color(baseVal.value) ?? baseVal.value
  if (props.frame) frameAll({ fill: v }, { fill: id })
  else store.bind(props.sid, props.ids, base.value, id, () => ({ style: { [base.value]: v } }))
}

// --- 칠 편집 창 ---
const open = ref<number | null>(null)
/** 칠 창을 Libraries 탭으로 열기(머리의 스타일 · 변수 버튼) */
const libTab = ref(false)
watch(() => props.ids.join() + props.sid, () => (open.value = null))
watch(open, (v, old) => { if (v === null || (old !== null && v !== old)) libTab.value = false })
const openAt = (i: number) => { libTab.value = false; open.value = open.value === i ? null : i }
/** 스타일 · 변수 적용(피그마 Fill 머리의 ⁘): 칠이 없으면 하나 만들고, 바탕 칠(없으면 맨 위 칠)의 창을 Libraries 탭으로 */
function openLibraries() {
  if (!baseVal.value && !extras.value.length) add()
  const i = baseVal.value ? -1 : extras.value.length - 1
  if (i < -1 || (i >= 0 && !extras.value[i])) return
  libTab.value = true
  open.value = i
}
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
  <section ref="dragBox" class="s drag-box">
    <div :class="['sec-h', 'h24', { empty: !rows.length && !mixed }]">
      <span>{{ tr(title) }}</span>
      <span class="acts">
        <!-- Create color style 은 뺐어요: 로컬 스타일은 고르는 목록에 나오지 않아요(디자인 시스템 변수만) -->
        <button class="ib s24 styl" :aria-label="tr('Apply styles and variables')" :data-tip="tr('Apply styles and variables')" @click="openLibraries"><EditorIcon name="apply_styles" /></button>
        <button class="ib s24" :aria-label="tr(`Add ${title.toLowerCase()}`)" :data-tip="tr(`Add ${title.toLowerCase()}`)" @click="add"><EditorIcon name="plus" :size="16" /></button>
      </span>
    </div>
    <p v-if="mixed" class="tx-meta m0">{{ tr('Click + to replace mixed content') }}</p>
    <template v-for="(i, vi) in rows" :key="i">
      <!-- 바탕 칠: [견본 + 값] · 👁 · − (피그마 Fill 행) -->
      <div v-if="i < 0" class="prow" data-drag-row :class="{ dragging: drag?.from === vi }">
        <button v-if="rows.length > 1" type="button" class="drag-h" :aria-label="tr('Drag to reorder')" @pointerdown="dragStart($event, vi)" @keydown="dragKey($event, vi, rows.length)"><EditorIcon class="keep" name="menu_hamburger" :size="10" /></button>
        <div :class="['sq', 'fld', 'pf', { open: open === -1, bound: !!bound }]">
          <button :ref="anchorRef(-1)" class="sq sq-clip swatch" :style="baseSwatch" :aria-label="tr(`Edit ${title.toLowerCase()} color`)" :aria-expanded="open === -1" @click="openAt(-1)" />
          <template v-if="!bound">
            <input :key="'h' + baseVal" class="hex" :value="colorLabel(store.color(baseVal) ?? '').split(' ')[0]!.replace('#', '')" :aria-label="tr(`${title} hex`)" spellcheck="false" @change="onBaseHex" @keydown="blur" @focus="sel">
            <TokenPicker :kinds="['color']" reveal :label="`${title} color`" @pick="pick" />
            <span class="vsep" aria-hidden="true" />
            <span class="op"><input :key="'a' + baseVal" class="pct" :value="Math.round(alphaOf(store.color(baseVal)) * 100)" inputmode="numeric" :aria-label="tr(`${title} opacity`)" @change="onBaseAlpha" @keydown="blur" @focus="sel"><i class="unit">%</i></span>
          </template>
          <TokenPicker v-else :kinds="['color']" :bound="bound" :label="`${title} color`" @pick="pick" @unbind="unbind" />
        </div>
        <button class="ib s24" :aria-label="tr(`Hide ${title.toLowerCase()}`)" :data-tip="tr('Hide')" @click="toggle(-1)"><EditorIcon name="eye" :size="16" /></button>
        <button class="ib s24" :aria-label="tr(`Remove ${title.toLowerCase()}`)" :data-tip="tr('Remove')" :disabled="kind === 'text' && !extras.length" @click="remove(-1)"><EditorIcon name="minus" :size="16" /></button>
      </div>
      <!-- 덧붙인 칠 -->
      <div v-else-if="extras[i]" class="prow" data-drag-row :class="{ off: extras[i]!.visible === false, dragging: drag?.from === vi }">
        <button v-if="rows.length > 1" type="button" class="drag-h" :aria-label="tr('Drag to reorder')" @pointerdown="dragStart($event, vi)" @keydown="dragKey($event, vi, rows.length)"><EditorIcon class="keep" name="menu_hamburger" :size="10" /></button>
        <div :class="['sq', 'fld', 'pf', { open: open === i, bound: !!(extras[i] as { token?: string }).token }]">
          <button :ref="anchorRef(i)" class="sq sq-clip swatch" :style="swatch(extras[i]!)" :aria-label="tr(`Edit ${title.toLowerCase()}`)" :aria-expanded="open === i" @click="openAt(i)" />
          <TokenPicker v-if="extras[i]!.type === 'solid' && (extras[i] as { token?: string }).token" :kinds="['color']" :bound="(extras[i] as { token?: string }).token" :label="`${title} color`" @pick="(t) => bindExtra(i, t)" @unbind="unbindExtra(i)" />
          <input v-else-if="extras[i]!.type === 'solid'" :key="'h' + i + (extras[i] as { color: string }).color" class="hex" :value="hexOf((extras[i] as { color: string }).color).slice(1)" :aria-label="tr(`${title} hex`)" spellcheck="false" @change="onExtraHex(i, $event)" @keydown="blur" @focus="sel">
          <button v-else class="pname" @click="openAt(i)">{{ tr(TYPE_NAME[extras[i]!.type]) }}</button>
          <TokenPicker v-if="extras[i]!.type === 'solid' && !(extras[i] as { token?: string }).token" :kinds="['color']" reveal :label="`${title} color`" @pick="(t) => bindExtra(i, t)" />
          <template v-if="!(extras[i] as { token?: string }).token">
          <span class="vsep" aria-hidden="true" />
          <span class="op"><input :key="'a' + i + extras[i]!.opacity" class="pct" :value="Math.round((extras[i]!.opacity ?? 1) * 100)" inputmode="numeric" :aria-label="tr(`${title} opacity`)" @change="onExtraAlpha(i, $event)" @keydown="blur" @focus="sel"><i class="unit">%</i></span>
          </template>
        </div>
        <button class="ib s24" :aria-label="extras[i]!.visible === false ? tr(`Show ${title.toLowerCase()}`) : tr(`Hide ${title.toLowerCase()}`)" :data-tip="extras[i]!.visible === false ? tr('Show') : tr('Hide')" @click="toggle(i)">
          <EditorIcon :name="extras[i]!.visible === false ? 'eye_off' : 'eye'" :size="16" />
        </button>
        <button class="ib s24" :aria-label="tr(`Remove ${title.toLowerCase()}`)" :data-tip="tr('Remove')" @click="remove(i)"><EditorIcon name="minus" :size="16" /></button>
      </div>
    </template>
    <div v-if="drag" class="row-drop" :style="{ top: drag.y + 'px', left: drag.x + 'px', width: drag.w + 'px' }" />
    <PaintPopover
      v-if="open !== null && popPaint"
      :key="String(open) + (libTab ? 'L' : '')"
      :anchor="popAnchor"
      :paint="popPaint"
      :types="types"
      :sid="sid"
      :sids="frame ? frameIds : undefined"
      :bindable="open === -1 || popPaint.type === 'solid'"
      :bound-id="open === -1 ? bound : popPaint.type === 'solid' ? popPaint.token ?? null : null"
      :initial-tab="libTab ? 'libraries' : 'custom'"
      :title="title"
      @update="onPopUpdate"
      @type="onPopType"
      @token="(t) => (open === -1 ? pick(t) : open !== null && bindExtra(open, t))"
      @close="open = null"
    />
    <slot />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 28px; padding: 0; }
/* 비어 있는 섹션: 머리 줄만, 제목은 보통 굵기(피그마 §2.4) */
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.acts { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.s24 { width: 28px; height: 28px; }
.m0 { margin: 0; }
/* 피그마 Fill · Stroke 행: [견본 16 · 값 | 불투명도 48 %] 8 [👁 24][− 24] */
.prow { display: grid; grid-template-columns: minmax(0, 1fr) 28px 28px; gap: 0; align-items: center; min-width: 0; }
.prow > .fld { margin-right: var(--ref-spacing-06); }
.prow.off .fld { opacity: 0.45; }
/* 칸 하나: 왼쪽 [견본 + 이름 · hex](안쪽 8, 사이 8) · 1px 칸막이(패널 색) · 오른쪽 불투명도(48, 안쪽 8, 오른쪽 정렬). 열림 · 포커스는 칸 전체에 1px 파란 선만 */
.pf { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); min-width: 0; }
.pf.bound { padding-right: var(--ref-spacing-06); }
/* 파란 선은 열림 · 입력 중일 때만(칩 · 버튼에 포커스가 남은 것만으로는 그리지 않아요 — 그건 각자 focus-visible 링) */
.pf.open, .pf:has(input:focus) { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
/* 칸막이는 위아래 1px 비워서 열림 선을 가리지 않아요 */
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
.pname { flex: 1; min-width: 0; text-align: left; font-size: 12px; color: var(--sys-color-neutral-800); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.swatch { width: 16px; height: 16px; padding: 0; border: 0; border-radius: var(--ref-radius-02); flex: none; cursor: pointer; --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.swatch:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); }
button:disabled:not(.ib) { opacity: 0.35; pointer-events: none; }
.ib:disabled { pointer-events: none; }
</style>
