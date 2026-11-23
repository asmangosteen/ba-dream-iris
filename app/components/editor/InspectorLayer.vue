<script setup lang="ts">
import { Button, Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { normAngle, ratioLocked, TYPE_LABEL, type BindKey, type LayerNode, type LayerStyle } from '~/canvas/schema'
import { colorLabel, parseColor, useTokenCatalog, WEIGHT_LABEL, type CatalogToken } from '~/canvas/tokens'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import { useLayerStore } from '~/canvas/store'
import { currentGap, guessAxis, type ArrangeOp } from '~/canvas/geom'
import ArrangeControls from '~/components/editor/ArrangeControls.vue'
import InspectorPaints from '~/components/editor/InspectorPaints.vue'
import InspectorEffects from '~/components/editor/InspectorEffects.vue'
import StyleCreate from '~/components/editor/StyleCreate.vue'
import { BLEND_MODES, defaultAlign } from '~/canvas/paint'
import { isContainer, isVector } from '~/canvas/schema'

/**
 * 오른쪽 패널 · 디자인 탭(레이어를 골랐을 때): 위치 · 크기(비율 고정) · 회전 · 뒤집기 · 정렬 · 균등 분배 · 모양(모서리 따로) · 채우기 · 선 · 텍스트 · 순서
 * 값마다 디자인 시스템 변수(토큰)를 연결할 수 있어요(TokenPicker). 연결하면 입력칸 대신 토큰 칩이 보입니다.
 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ 'replace-image': [id: string] }>()
const store = useLayerStore()
const catalog = useTokenCatalog()

const sid = computed(() => props.screen.id)
const ids = computed(() => store.layerIds.value)
const nodes = computed(() => ids.value.map((id) => store.node(sid.value, id)).filter((n): n is LayerNode => !!n))
const one = computed(() => (nodes.value.length === 1 ? nodes.value[0]! : null))
const types = computed(() => new Set(nodes.value.map((n) => n.type)))
const has = (...t: LayerNode['type'][]) => t.some((x) => types.value.has(x))
/** 고른 레이어들의 값이 모두 같으면 그 값, 다르면 'Mixed' */
function same<T>(get: (n: LayerNode) => T): T | 'Mixed' {
  const v = nodes.value.map(get)
  return v.every((x) => x === v[0]) ? v[0]! : 'Mixed'
}
const show = (v: unknown) => (v === 'Mixed' ? '' : v === undefined || v === null ? '' : String(typeof v === 'number' ? Math.round(v * 100) / 100 : v))

/** 크기 바꾸기: 비율을 고정했으면 다른 쪽도 같은 비율로 */
function sized(n: LayerNode, key: 'w' | 'h', v: number): Partial<LayerNode> {
  const val = Math.max(1, Math.round(v))
  const patch: Partial<LayerNode> = { [key]: val }
  if (ratioLocked(n) && n.w > 0 && n.h > 0) {
    if (key === 'w') patch.h = Math.max(1, Math.round((n.h * val) / n.w))
    else patch.w = Math.max(1, Math.round((n.w * val) / n.h))
  }
  if (n.type === 'text' && patch.w !== undefined) n.style.autoWidth = false
  return patch
}
function setNum(key: 'x' | 'y' | 'w' | 'h', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(same((n) => n[key])); return }
  store.update(sid.value, ids.value, (n) => (key === 'w' || key === 'h' ? sized(n, key, v) : { [key]: Math.max(-1e6, Math.round(v)) }))
}
const locked = computed(() => same((n) => ratioLocked(n)) === true)
function toggleRatio() { const on = !locked.value; store.update(sid.value, ids.value, { lockRatio: on }) }

// 회전 · 뒤집기
function setRotation(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace('°', ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(same((n) => n.rotation ?? 0)); return }
  store.update(sid.value, ids.value, { rotation: normAngle(v) || undefined })
}

// 모서리 따로
const separate = computed(() => same((n) => !!n.style.radii) === true)
function toggleCorners() {
  const on = !separate.value
  store.update(sid.value, ids.value, (n) => {
    const r = n.style.radius ?? 0
    // 연결도 함께 옮겨요: 하나 → 네 모서리, 네 모서리 → 왼쪽 위 것
    const vars = { ...n.style.vars }
    if (on && vars.radius) for (const k of CORNER_KEYS) vars[k] = vars.radius
    if (!on) { if (vars['radii.0']) vars.radius = vars['radii.0']; else delete vars.radius; for (const k of CORNER_KEYS) delete vars[k] }
    const v = Object.keys(vars).length ? vars : undefined
    return { style: on ? { ...n.style, radii: [r, r, r, r], vars: v } : { ...n.style, radius: n.style.radii?.[0] ?? r, radii: undefined, vars: v } }
  })
}
const CORNER_KEYS = ['radii.0', 'radii.1', 'radii.2', 'radii.3'] as const
/** i: 0 왼쪽 위 · 1 오른쪽 위 · 2 오른쪽 아래 · 3 왼쪽 아래, 없으면 네 모서리 모두 */
function setCorner(e: Event, i?: number) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) return
  const val = Math.max(0, Math.round(v * 10) / 10)
  store.update(sid.value, ids.value, (n) => {
    const cur = n.style.radii ?? [n.style.radius ?? 0, n.style.radius ?? 0, n.style.radius ?? 0, n.style.radius ?? 0]
    const radii = cur.map((r, k) => (i === undefined || i === k ? val : r)) as [number, number, number, number]
    return { style: { ...n.style, radii, radius: i === undefined ? val : n.style.radius } }
  })
}
const corner = (i: number) => same((n) => n.style.radii?.[i] ?? n.style.radius ?? 0)
const allCorners = computed(() => same((n) => (n.style.radii ? (n.style.radii.every((r) => r === n.style.radii![0]) ? n.style.radii[0] : 'Mixed') : n.style.radius ?? 0)))
const CORNER_LABEL = ['Top left', 'Top right', 'Bottom right', 'Bottom left']
function setStyle(key: keyof LayerStyle, value: LayerStyle[keyof LayerStyle]) { store.style(sid.value, ids.value, { [key]: value }) }
function setStyleNum(key: 'radius' | 'strokeWidth' | 'fontSize' | 'lineHeight' | 'letterSpacing', e: Event, min = 0) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) return
  setStyle(key, Math.max(min, Math.round(v * 100) / 100))
}
function setOpacity(e: Event) {
  const v = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(v)) setStyle('opacity', Math.min(1, Math.max(0, v / 100)))
}
function step(e: KeyboardEvent, apply: (d: number) => void) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  apply((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}
const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }

// 색: '#RRGGBB' · 'rgb(…)' (옛 문서의 'token:<이름>' 은 그 토큰에 연결된 것으로 봅니다)
const menu = ref<string | null>(null)
const hex = (v?: string) => parseColor(store.color(v))?.hex ?? '#000000'
const label = (v?: string | 'Mixed') => (v === 'Mixed' ? 'Mixed' : !v ? 'None' : v.startsWith('token:') ? v.slice(6) : colorLabel(v))
function setHex(key: 'fill' | 'stroke' | 'color', e: Event) {
  let v = (e.target as HTMLInputElement).value.trim()
  if (!v) { setStyle(key, undefined); return }
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) setStyle(key, v.toUpperCase())
}

// --- 변수(토큰) 연결 ---
const COLOR_KEYS = ['fill', 'stroke', 'color'] as const
/** 레이어 하나의 연결 토큰 id */
function boundOf(n: LayerNode, key: BindKey): string | undefined {
  const v = n.style.vars?.[key]
  if (v) return v
  if ((COLOR_KEYS as readonly string[]).includes(key)) { const c = n.style[key as 'fill']; if (c?.startsWith('token:')) return 'db:' + c.slice(6) }
  return undefined
}
/** 고른 레이어들의 연결: 토큰 id · 'Mixed' · null */
const vb = (key: BindKey) => same((n) => boundOf(n, key)) ?? null
/** 모서리 따로일 때 '모두' 칸: 네 모서리가 같은 토큰이면 그것 */
const vbCorners = computed(() => { const v = CORNER_KEYS.map((k) => vb(k)); return v.every((x) => x === v[0]) ? v[0]! : 'Mixed' })
const S = () => [sid.value, ids.value] as const

function pickColor(key: 'fill' | 'stroke' | 'color', t: CatalogToken) {
  store.bind(...S(), key, t.id, () => ({ style: { [key]: t.color } }))
}
function pickNum(key: BindKey, t: CatalogToken) {
  const v = t.num!
  if (key === 'x' || key === 'y') store.bind(...S(), key, t.id, () => ({ node: { [key]: Math.round(v) } }))
  else if (key === 'w' || key === 'h') store.bind(...S(), key, t.id, (n) => ({ node: sized(n, key, v) }))
  else if (key === 'radius') {
    // 모서리 따로를 켠 레이어는 네 모서리 모두
    store.bind(...S(), separate.value ? [...CORNER_KEYS, 'radius'] : 'radius', t.id, (n) => ({ style: n.style.radii ? { radius: v, radii: [v, v, v, v] } : { radius: v } }))
  } else if (key.startsWith('radii.')) {
    const i = Number(key.slice(6))
    store.bind(...S(), key, t.id, (n) => {
      const r = n.style.radius ?? 0
      const radii = [...(n.style.radii ?? [r, r, r, r])] as [number, number, number, number]
      radii[i] = v
      return { style: { radii } }
    })
  } else store.bind(...S(), key, t.id, () => ({ style: { [key]: v } }))
}
function pickTextStyle(t: CatalogToken) {
  const x = t.text!
  store.bind(...S(), 'textStyle', t.id, () => ({ style: { fontSize: x.size, lineHeight: x.lineHeight, letterSpacing: x.letterSpacing, ...(x.weight ? { fontWeight: x.weight } : {}) } }))
}
function unbind(key: BindKey | BindKey[]) {
  const keys = Array.isArray(key) ? key : [key]
  // 옛 'token:<이름>' 색은 실제 색으로 바꿔 둡니다
  store.unbind(...S(), keys, (n) => {
    const style: Partial<LayerStyle> = {}
    for (const k of keys) if ((COLOR_KEYS as readonly string[]).includes(k) && n.style[k as 'fill']?.startsWith('token:')) style[k as 'fill'] = store.color(n.style[k as 'fill'])
    return { style }
  })
}
/** 연결된 칩에서 ↑↓: 값을 바꾸면 연결이 풀려요 */
function stepNum(key: 'x' | 'y' | 'w' | 'h', d: number) {
  store.update(sid.value, ids.value, (n) => (key === 'w' || key === 'h' ? sized(n, key, n[key] + d) : { [key]: n[key] + d }))
}
function stepStyle(key: 'radius' | 'strokeWidth' | 'fontSize' | 'lineHeight' | 'letterSpacing', d: number, min = 0) {
  store.update(sid.value, ids.value, (n) => ({ style: { ...n.style, [key]: Math.max(min, Math.round(((n.style[key] ?? 0) + d) * 100) / 100) } }))
}
function stepCorner(i: number, d: number) {
  store.update(sid.value, ids.value, (n) => { const r0 = n.style.radius ?? 0; const r = [...(n.style.radii ?? [r0, r0, r0, r0])] as [number, number, number, number]; r[i] = Math.max(0, r[i]! + d); return { style: { ...n.style, radii: r } } })
}
const stepOpacity = (d: number) => store.update(sid.value, ids.value, (n) => ({ style: { ...n.style, opacity: Math.min(1, Math.max(0, Math.round((n.style.opacity ?? 1) * 100 + d) / 100)) } }))

// 굵기: 디자인 시스템의 모든 굵기(+ 지금 쓰는 값)
const weights = computed(() => {
  const list = catalog.list(['fontWeight']).map((t) => t.num!)
  const base = list.length ? list : [400, 500, 600, 700]
  const cur = nodes.value.map((n) => n.style.fontWeight ?? 400)
  return [...new Set([...base, ...cur])].sort((a, b) => a - b)
})
const weightNow = computed(() => same((n) => n.style.fontWeight ?? 400))
// --- v5: 선 위치 · 점선 · 끝 모양 · 화살표, 다각형 · 별, 혼합 모드, 이미지 채우기 방식 · 자르기, 텍스트 고급 ---
const hasStroke = computed(() => nodes.value.some((n) => n.style.strokeWidth && (n.style.stroke || n.style.strokes?.length)))
const alignNow = computed(() => same((n) => n.style.strokeAlign ?? defaultAlign(n.type)))
const closedShape = computed(() => nodes.value.every((n) => !isVector(n.type) || n.type === 'polygon' || n.type === 'star' || !!n.closed))
const openPath = computed(() => nodes.value.every((n) => n.type === 'line' || n.type === 'path'))
const dashed = computed(() => nodes.value.some((n) => !!n.style.dash))
function setDash(i: 0 | 1, e: Event) {
  const v = Math.max(0, Number((e.target as HTMLInputElement).value) || 0)
  store.update(sid.value, ids.value, (n) => { const d = [...(n.style.dash ?? [4, 4])] as [number, number]; d[i] = v; return { style: { ...n.style, dash: d } } })
}
const ARROWS = [{ k: 'none', label: 'None' }, { k: 'arrow', label: 'Line arrow' }, { k: 'triangle', label: 'Triangle arrow' }, { k: 'circle', label: 'Circle' }] as const
const blendNow = computed(() => same((n) => n.style.blend ?? 'normal'))
const noRadius = computed(() => has('text', 'ellipse', 'line', 'path', 'polygon', 'star'))
function setCount(key: 'sides' | 'points', e: Event) {
  const v = Math.round(Number((e.target as HTMLInputElement).value))
  if (Number.isFinite(v)) setStyle(key, Math.max(3, Math.min(60, v)))
}
function setRatio(e: Event) {
  const v = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(v)) setStyle('inner', Math.max(1, Math.min(100, v)) / 100)
}
const fitNow = computed(() => same((n) => n.style.fit ?? 'fill'))
const cropNow = computed(() => one.value?.style.crop ?? { scale: 1, x: 50, y: 50 })
function setCrop(key: 'scale' | 'x' | 'y', e: Event) {
  const raw = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (!Number.isFinite(raw)) return
  const v = key === 'scale' ? Math.max(1, Math.min(10, raw / 100)) : Math.max(0, Math.min(100, raw))
  setStyle('crop', { ...cropNow.value, [key]: v })
}
function toggleStyle<K extends 'decoration' | 'textCase' | 'list'>(key: K, v: NonNullable<LayerStyle[K]>) { setStyle(key, same((n) => n.style[key]) === v ? undefined : v) }

// 정렬(하나면 부모 기준, 여러 개면 고른 범위 기준) · 균등 분배 · 간격 맞추기
const rects = computed(() => store.boxes(sid.value, ids.value))
const axis = computed(() => (rects.value.length >= 2 ? guessAxis(rects.value) : 'x'))
const gap = computed(() => currentGap(rects.value, axis.value))
function onArrange(op: ArrangeOp) {
  if (op.kind === 'align') store.align(sid.value, ids.value, op.k)
  else if (op.kind === 'distribute') store.distribute(sid.value, ids.value, op.axis)
  else store.space(sid.value, ids.value, op.axis, op.gap)
}
watch(ids, () => (menu.value = null))
// 메뉴: 바깥을 누르거나 Esc 로 닫기
const root = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  const rel = (e.target as HTMLElement | null)?.closest('.rel')
  if (menu.value && (!rel || !root.value?.contains(rel))) menu.value = null
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape' && menu.value) menu.value = null }
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })
</script>

<template>
  <div ref="root" class="li">
    <section class="s first">
      <div class="head">
        <span class="tx-head">{{ one ? TYPE_LABEL[one.type] : `${nodes.length} layers` }}</span>
        <span class="row0">
          <button class="ib s24" aria-label="Bring to front (⌥⌘])" title="Bring to front ⌥⌘]" @click="store.arrange(sid, ids, 'top')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5M3 1.5h8" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="Bring forward (⌘])" title="Bring forward ⌘]" @click="store.arrange(sid, ids, 1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="Send backward (⌘[)" title="Send backward ⌘[" @click="store.arrange(sid, ids, -1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3v8M3.5 7.5L7 11l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="Delete" title="Delete ⌫" @click="store.remove(sid, ids)"><Icon name="trashbin" :size="14" /></button>
        </span>
      </div>
      <label v-if="one" class="sq fld"><span>Name</span><input :key="one.id + one.name" :value="one.name" aria-label="Layer name" @change="store.update(sid, ids, { name: ($event.target as HTMLInputElement).value.trim() || one.name })" @keydown="blurOnEnter"></label>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>Position</span></div>
      <ArrangeControls :count="nodes.length" :gap="gap" :axis="axis" @op="onArrange" />
      <div class="grid2">
        <label class="sq fld"><span>X</span><input v-if="!vb('x')" :value="show(same((n) => n.x))" :placeholder="same((n) => n.x) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="X" @change="setNum('x', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ x: n.x + d })))"><TokenPicker :kinds="['spacing']" :bound="vb('x')" reveal label="X" @pick="(t) => pickNum('x', t)" @unbind="unbind('x')" @step="(d) => stepNum('x', d)" /></label>
        <label class="sq fld"><span>Y</span><input v-if="!vb('y')" :value="show(same((n) => n.y))" :placeholder="same((n) => n.y) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Y" @change="setNum('y', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ y: n.y + d })))"><TokenPicker :kinds="['spacing']" :bound="vb('y')" reveal label="Y" @pick="(t) => pickNum('y', t)" @unbind="unbind('y')" @step="(d) => stepNum('y', d)" /></label>
      </div>
      <div class="grid2">
        <label class="sq fld" title="Rotation"><span>∠</span><input :value="show(same((n) => n.rotation ?? 0))" :placeholder="same((n) => n.rotation ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Rotation" @change="setRotation" @keydown="blurOnEnter($event); step($event, (d) => store.rotateBy(sid, ids, d))"><span>°</span></label>
        <div class="grp">
          <button class="ib" aria-label="Rotate 90°" title="Rotate 90°" @click="store.rotateBy(sid, ids, 90)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5a4.5 4.5 0 1 0 1.6-3.5M4.5 1.5v2.7h2.7" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipX) === true }]" aria-label="Flip horizontal (⇧H)" title="Flip horizontal ⇧H" @click="store.flip(sid, ids, 'x')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M5 3.5v7L1.5 10.5zM9 3.5v7l3.5 0z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipY) === true }]" aria-label="Flip vertical (⇧V)" title="Flip vertical ⇧V" @click="store.flip(sid, ids, 'y')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7h11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M3.5 5h7L10.5 1.5zM3.5 9h7l0 3.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
        </div>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>Layout</span></div>
      <div class="grid3">
        <label class="sq fld"><span>W</span><input v-if="!vb('w')" :value="show(same((n) => n.w))" :placeholder="same((n) => n.w) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Width" @change="setNum('w', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => sized(n, 'w', n.w + d)))"><TokenPicker :kinds="['spacing']" :bound="vb('w')" reveal label="Width" @pick="(t) => pickNum('w', t)" @unbind="unbind('w')" @step="(d) => stepNum('w', d)" /></label>
        <button :class="['ib', 's24', 'tog', { on: locked }]" :aria-pressed="locked" :aria-label="locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'" :title="locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'" @click="toggleRatio">
          <svg v-if="locked" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1M5.5 8.5l3-3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
        </button>
        <label class="sq fld"><span>H</span><input v-if="!vb('h')" :value="show(same((n) => n.h))" :placeholder="same((n) => n.h) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Height" @change="setNum('h', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => sized(n, 'h', n.h + d)))"><TokenPicker :kinds="['spacing']" :bound="vb('h')" reveal label="Height" @pick="(t) => pickNum('h', t)" @unbind="unbind('h')" @step="(d) => stepNum('h', d)" /></label>
      </div>
      <button v-if="has('frame')" :class="['cb', { on: same((n) => n.style.clip !== false) === true }]" @click="setStyle('clip', same((n) => n.style.clip !== false) !== true)"><i />Clip content</button>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>Appearance</span></div>
      <div class="grid2"><span class="sub">Opacity</span><span class="sub">Blend</span></div>
      <div class="grid2">
        <label class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M2.5 11.5l9-9" stroke="currentColor" stroke-width="1.2" /></svg><template v-if="!vb('opacity')"><input :value="same((n) => Math.round((n.style.opacity ?? 1) * 100)) === 'Mixed' ? '' : same((n) => Math.round((n.style.opacity ?? 1) * 100))" :placeholder="same((n) => n.style.opacity ?? 1) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Opacity" @change="setOpacity" @keydown="blurOnEnter($event); step($event, stepOpacity)"><span>%</span></template><TokenPicker :kinds="['opacity']" :bound="vb('opacity')" reveal label="Opacity" @pick="(t) => pickNum('opacity', t)" @unbind="unbind('opacity')" @step="stepOpacity" /></label>
        <div class="rel">
          <button :class="['sq', 'dd', { open: menu === 'blend' }]" aria-label="Blend mode" :aria-expanded="menu === 'blend'" @click="menu = menu === 'blend' ? null : 'blend'"><span>{{ blendNow === 'Mixed' ? 'Mixed' : BLEND_MODES.find((b) => b.k === blendNow)?.label }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
          <div v-if="menu === 'blend'" class="sq menu blend"><button v-for="b in BLEND_MODES" :key="b.k" :class="['sq', 'menu-item', { on: blendNow === b.k }]" @click="setStyle('blend', b.k === 'normal' ? undefined : b.k); menu = null">{{ b.label }}</button></div>
        </div>
      </div>
      <template v-if="!noRadius">
        <span class="sub">Corner radius</span>
        <div class="rad">
          <label v-if="separate" class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input v-if="!vbCorners" :key="'all' + String(allCorners)" :value="show(allCorners)" :placeholder="allCorners === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Corner radius" @change="setCorner($event)" @keydown="blurOnEnter"><TokenPicker :kinds="['radius']" :bound="vbCorners" reveal label="Corner radius" @pick="(t) => pickNum('radius', t)" @unbind="unbind([...CORNER_KEYS, 'radius'])" /></label>
          <label v-else class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input v-if="!vb('radius')" :value="show(same((n) => n.style.radius ?? 0))" :placeholder="same((n) => n.style.radius ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Corner radius" @change="setStyleNum('radius', $event)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('radius', d))"><TokenPicker :kinds="['radius']" :bound="vb('radius')" reveal label="Corner radius" @pick="(t) => pickNum('radius', t)" @unbind="unbind('radius')" @step="(d) => stepStyle('radius', d)" /></label>
          <button :class="['ib', 's28', 'tog', { on: separate }]" :aria-pressed="separate" aria-label="Independent corners" title="Independent corners" @click="toggleCorners"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5V3.5a2 2 0 0 1 2-2H5M9 1.5h1.5a2 2 0 0 1 2 2V5M12.5 9v1.5a2 2 0 0 1-2 2H9M5 12.5H3.5a2 2 0 0 1-2-2V9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        </div>
        <div v-if="separate" class="grid4">
          <label v-for="(c, i) in CORNER_LABEL" :key="c" class="sq fld" :title="c"><svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" :style="{ transform: `rotate(${i * 90}deg)` }"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.4" fill="none" /></svg><input v-if="!vb(CORNER_KEYS[i]!)" :value="show(corner(i))" :placeholder="corner(i) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" :aria-label="c" @change="setCorner($event, i)" @keydown="blurOnEnter($event); step($event, (d) => stepCorner(i, d))"><TokenPicker :kinds="['radius']" :bound="vb(CORNER_KEYS[i]!)" reveal short :label="c" @pick="(t) => pickNum(CORNER_KEYS[i]!, t)" @unbind="unbind(CORNER_KEYS[i]!)" @step="(d) => stepCorner(i, d)" /></label>
        </div>
      </template>
      <div v-if="one?.type === 'polygon'" class="grid2">
        <label class="sq fld" title="Point count"><span>Count</span><input :key="'p' + one.style.sides" :value="one.style.sides ?? 3" inputmode="numeric" aria-label="Point count" @change="setCount('sides', $event)" @keydown="blurOnEnter($event); step($event, (d) => setStyle('sides', Math.max(3, Math.min(60, (one!.style.sides ?? 3) + Math.sign(d)))))"></label>
      </div>
      <div v-if="one?.type === 'star'" class="grid2">
        <label class="sq fld" title="Point count"><span>Count</span><input :key="'s' + one.style.points" :value="one.style.points ?? 5" inputmode="numeric" aria-label="Point count" @change="setCount('points', $event)" @keydown="blurOnEnter($event); step($event, (d) => setStyle('points', Math.max(3, Math.min(60, (one!.style.points ?? 5) + Math.sign(d)))))"></label>
        <label class="sq fld" title="Ratio"><span>Ratio</span><input :key="'r' + one.style.inner" :value="Math.round((one.style.inner ?? 0.38) * 100) + '%'" inputmode="numeric" aria-label="Ratio" @change="setRatio" @keydown="blurOnEnter"></label>
      </div>
    </section>

    <section v-if="has('text')" class="s">
      <div class="sec-h h24"><span>Typography</span></div>
      <div class="ts-row">
        <TokenPicker variant="dropdown" :kinds="['textStyle']" :bound="vb('textStyle')" placeholder="No text style" label="Text style" @pick="pickTextStyle" @unbind="unbind('textStyle')" />
        <StyleCreate v-if="one && !vb('textStyle')" type="typography" :value="JSON.stringify({ fontSize: one.style.fontSize ?? 16, lineHeight: one.style.lineHeight, letterSpacing: one.style.letterSpacing, fontWeight: one.style.fontWeight ?? 400 })" label="Create text style" @created="(id) => store.bind(sid, ids, 'textStyle', id)" />
      </div>
      <div class="color-row">
        <div v-if="!vb('fontWeight')" class="rel">
          <button :class="['sq', 'dd', { open: menu === 'weight' }]" aria-label="Font weight" :aria-expanded="menu === 'weight'" @click="menu = menu === 'weight' ? null : 'weight'"><span>Pretendard · {{ weightNow === 'Mixed' ? 'Mixed' : WEIGHT_LABEL(weightNow) }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
          <div v-if="menu === 'weight'" class="sq menu"><button v-for="w in weights" :key="w" :class="['sq', 'menu-item', { on: weightNow === w }]" @click="setStyle('fontWeight', w); menu = null"><span class="grow" :style="{ fontWeight: w }">{{ WEIGHT_LABEL(w) }}</span><span class="muted">{{ w }}</span></button></div>
        </div>
        <label v-else class="sq fld"><span>Weight</span><TokenPicker :kinds="['fontWeight']" :bound="vb('fontWeight')" label="Font weight" @pick="(t) => pickNum('fontWeight', t)" @unbind="unbind('fontWeight')" /></label>
        <TokenPicker v-if="!vb('fontWeight')" :kinds="['fontWeight']" label="Font weight" @pick="(t) => pickNum('fontWeight', t)" />
      </div>
      <div class="grid2">
        <label class="sq fld" title="Font size"><span>Size</span><input v-if="!vb('fontSize')" :value="show(same((n) => n.style.fontSize ?? 16))" :placeholder="same((n) => n.style.fontSize ?? 16) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Font size" @change="setStyleNum('fontSize', $event, 1)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('fontSize', d, 1))"><TokenPicker :kinds="['fontSize']" :bound="vb('fontSize')" reveal label="Font size" @pick="(t) => pickNum('fontSize', t)" @unbind="unbind('fontSize')" @step="(d) => stepStyle('fontSize', d, 1)" /></label>
        <label class="sq fld" title="Line height"><span>Line</span><input v-if="!vb('lineHeight')" :value="show(same((n) => n.style.lineHeight ?? ''))" :placeholder="same((n) => n.style.lineHeight ?? '') === 'Mixed' ? 'Mixed' : 'Auto'" inputmode="decimal" aria-label="Line height" @change="setStyleNum('lineHeight', $event, 1)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('lineHeight', d, 1))"><TokenPicker :kinds="['lineHeight']" :bound="vb('lineHeight')" reveal label="Line height" @pick="(t) => pickNum('lineHeight', t)" @unbind="unbind('lineHeight')" @step="(d) => stepStyle('lineHeight', d, 1)" /></label>
        <label class="sq fld" title="Letter spacing"><span>Letter</span><template v-if="!vb('letterSpacing')"><input :value="show(same((n) => n.style.letterSpacing ?? 0))" :placeholder="same((n) => n.style.letterSpacing ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Letter spacing" @change="setStyleNum('letterSpacing', $event, -100)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('letterSpacing', d / 10, -100))"><span>px</span></template><TokenPicker :kinds="['letterSpacing']" :bound="vb('letterSpacing')" reveal label="Letter spacing" @pick="(t) => pickNum('letterSpacing', t)" @unbind="unbind('letterSpacing')" @step="(d) => stepStyle('letterSpacing', d / 10, -100)" /></label>
        <label class="sq fld" title="Paragraph spacing"><span>Para</span><input :value="show(same((n) => n.style.paraSpacing ?? 0))" :placeholder="same((n) => n.style.paraSpacing ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Paragraph spacing" @change="(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) setStyle('paraSpacing', v > 0 ? v : undefined) }" @keydown="blurOnEnter"></label>
      </div>
      <div class="tools">
        <div class="grp">
          <button v-for="a in (['left', 'center', 'right'] as const)" :key="a" :class="['ib', { on: same((n) => n.style.align ?? 'left') === a }]" :aria-label="{ left: 'Align left', center: 'Align center', right: 'Align right' }[a]" :title="{ left: 'Align left', center: 'Align center', right: 'Align right' }[a]" @click="setStyle('align', a)">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path :d="a === 'left' ? 'M2 3.5h10M2 7h6M2 10.5h8' : a === 'center' ? 'M2 3.5h10M4 7h6M3 10.5h8' : 'M2 3.5h10M6 7h6M4 10.5h8'" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="grp">
          <button :class="['ib', { on: same((n) => n.style.decoration) === 'underline' }]" aria-label="Underline" title="Underline ⌘U" @click="toggleStyle('decoration', 'underline')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2v4.5a3 3 0 0 0 6 0V2M3 12h8" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button :class="['ib', { on: same((n) => n.style.decoration) === 'strike' }]" aria-label="Strikethrough" title="Strikethrough ⇧⌘X" @click="toggleStyle('decoration', 'strike')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M9.5 4C9 2.8 8 2.3 7 2.3c-1.5 0-2.6.8-2.6 2 0 .9.6 1.5 1.6 1.9M4.5 10c.5 1.2 1.5 1.7 2.5 1.7 1.6 0 2.7-.9 2.7-2.1 0-.6-.2-1-.6-1.4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        </div>
        <div class="grp">
          <button v-for="c in ([['upper', 'AG', 'Uppercase'], ['lower', 'ag', 'Lowercase'], ['title', 'Ag', 'Title case']] as const)" :key="c[0]" :class="['ib', 'txt-b', { on: same((n) => n.style.textCase) === c[0] }]" :aria-label="c[2]" :title="c[2]" @click="toggleStyle('textCase', c[0])">{{ c[1] }}</button>
        </div>
        <div class="grp">
          <button :class="['ib', { on: same((n) => n.style.list) === 'bullet' }]" aria-label="Bulleted list" title="Bulleted list" @click="toggleStyle('list', 'bullet')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="2.5" cy="3.5" r="1" fill="currentColor" /><circle cx="2.5" cy="7" r="1" fill="currentColor" /><circle cx="2.5" cy="10.5" r="1" fill="currentColor" /><path d="M5 3.5h7M5 7h7M5 10.5h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
          <button :class="['ib', { on: same((n) => n.style.list) === 'number' }]" aria-label="Numbered list" title="Numbered list" @click="toggleStyle('list', 'number')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2.5h1v2.5M1.8 8.2c.2-.5.6-.7 1-.7.5 0 .9.3.9.8 0 .7-1.9 1.4-1.9 2.2h1.9M5 3.5h7M5 7h7M5 10.5h7" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        </div>
      </div>
      <button :class="['cb', { on: same((n) => !!n.style.autoWidth) === true }]" @click="setStyle('autoWidth', same((n) => !!n.style.autoWidth) !== true)"><i />Auto width</button>
      <span v-if="one" class="tx-meta">Double-click or press Enter to edit text</span>
    </section>

    <InspectorPaints v-if="!has('line', 'path') || has('path')" :sid="sid" :ids="ids" :kind="has('text') ? 'text' : 'fill'" title="Fill" />

    <InspectorPaints :sid="sid" :ids="ids" kind="stroke" title="Stroke">
      <template v-if="hasStroke">
        <div class="grid2">
          <div v-if="closedShape && !has('text')" class="rel">
            <button :class="['sq', 'dd', { open: menu === 'align' }]" aria-label="Stroke position" :aria-expanded="menu === 'align'" @click="menu = menu === 'align' ? null : 'align'"><span>{{ alignNow === 'Mixed' ? 'Mixed' : { inside: 'Inside', center: 'Center', outside: 'Outside' }[alignNow] }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
            <div v-if="menu === 'align'" class="sq menu"><button v-for="a in (['inside', 'center', 'outside'] as const)" :key="a" :class="['sq', 'menu-item', { on: alignNow === a }]" @click="setStyle('strokeAlign', a); menu = null">{{ { inside: 'Inside', center: 'Center', outside: 'Outside' }[a] }}</button></div>
          </div>
          <label class="sq fld" title="Stroke weight"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 3.5h10" stroke="currentColor" stroke-width="1" /><path d="M2 7h10" stroke="currentColor" stroke-width="1.6" /><path d="M2 10.5h10" stroke="currentColor" stroke-width="2.4" /></svg><template v-if="!vb('strokeWidth')"><input :value="show(same((n) => n.style.strokeWidth ?? 0))" :placeholder="same((n) => n.style.strokeWidth ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Stroke weight" @change="setStyleNum('strokeWidth', $event)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('strokeWidth', d))"><span>px</span></template><TokenPicker :kinds="['borderWidth']" :bound="vb('strokeWidth')" reveal label="Stroke weight" @pick="(t) => pickNum('strokeWidth', t)" @unbind="unbind('strokeWidth')" @step="(d) => stepStyle('strokeWidth', d)" /></label>
        </div>
        <button v-if="!has('text')" :class="['cb', { on: dashed }]" @click="setStyle('dash', dashed ? undefined : [4, 4])"><i />Dashed</button>
        <div v-if="dashed" class="grid2">
          <label class="sq fld"><span>Dash</span><input :key="'d' + one?.style.dash?.[0]" :value="nodes[0]?.style.dash?.[0] ?? 4" inputmode="numeric" aria-label="Dash" @change="setDash(0, $event)" @keydown="blurOnEnter"></label>
          <label class="sq fld"><span>Gap</span><input :key="'g' + one?.style.dash?.[1]" :value="nodes[0]?.style.dash?.[1] ?? 4" inputmode="numeric" aria-label="Gap" @change="setDash(1, $event)" @keydown="blurOnEnter"></label>
        </div>
        <template v-if="openPath">
          <div class="grid2"><span class="sub">Start point</span><span class="sub">End point</span></div>
          <div class="grid2">
            <div v-for="k in (['arrowStart', 'arrowEnd'] as const)" :key="k" class="rel">
              <button :class="['sq', 'dd', { open: menu === k }]" :aria-label="k === 'arrowStart' ? 'Start point' : 'End point'" :aria-expanded="menu === k" @click="menu = menu === k ? null : k"><span>{{ ARROWS.find((a) => a.k === (same((n) => n.style[k] ?? 'none')))?.label ?? 'Mixed' }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
              <div v-if="menu === k" class="sq menu"><button v-for="a in ARROWS" :key="a.k" :class="['sq', 'menu-item', { on: same((n) => n.style[k] ?? 'none') === a.k }]" @click="setStyle(k, a.k === 'none' ? undefined : a.k); menu = null">{{ a.label }}</button></div>
            </div>
          </div>
          <div class="grp caps">
            <button v-for="c in (['butt', 'round', 'square'] as const)" :key="c" :class="['ib', 'txt-b', { on: same((n) => n.style.cap ?? (n.type === 'path' ? 'round' : 'butt')) === c }]" :aria-label="`${c} cap`" :title="{ butt: 'Butt cap', round: 'Round cap', square: 'Square cap' }[c]" @click="setStyle('cap', c)">{{ { butt: 'Butt', round: 'Round', square: 'Square' }[c] }}</button>
          </div>
        </template>
      </template>
    </InspectorPaints>

    <InspectorEffects :sid="sid" :ids="ids" />

    <section v-if="one?.type === 'image'" class="s">
      <div class="sec-h h24"><span>Image</span></div>
      <div class="seg4">
        <button v-for="f in (['fill', 'fit', 'crop', 'tile'] as const)" :key="f" :class="['seg-b', { on: fitNow === f }]" @click="setStyle('fit', f === 'fill' ? undefined : f)">{{ { fill: 'Fill', fit: 'Fit', crop: 'Crop', tile: 'Tile' }[f] }}</button>
      </div>
      <div v-if="fitNow === 'crop'" class="grid3c">
        <label class="sq fld" title="Zoom"><span>Zoom</span><input :key="'z' + cropNow.scale" :value="Math.round(cropNow.scale * 100) + '%'" inputmode="numeric" aria-label="Crop zoom" @change="setCrop('scale', $event)" @keydown="blurOnEnter"></label>
        <label class="sq fld" title="Horizontal position"><span>X</span><input :key="'cx' + cropNow.x" :value="Math.round(cropNow.x) + '%'" inputmode="numeric" aria-label="Crop X" @change="setCrop('x', $event)" @keydown="blurOnEnter"></label>
        <label class="sq fld" title="Vertical position"><span>Y</span><input :key="'cy' + cropNow.y" :value="Math.round(cropNow.y) + '%'" inputmode="numeric" aria-label="Crop Y" @change="setCrop('y', $event)" @keydown="blurOnEnter"></label>
      </div>
      <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="image" class="full" @click="emit('replace-image', one.id)">Replace image</Button>
    </section>
  </div>
</template>

<style scoped>
.li { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s.first { box-shadow: none; padding-top: var(--ref-spacing-02); }
.head { display: flex; align-items: center; justify-content: space-between; }
.row0 { display: flex; }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.s28 { width: 28px; height: 28px; }
.grid3 { display: grid; grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr); gap: var(--ref-spacing-04); align-items: center; }
.sub { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.grid4 .fld { padding: 0 var(--ref-spacing-04); gap: var(--ref-spacing-02); }
.grid4 .fld svg { flex: none; color: var(--sys-color-neutral-600); }
.rad { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: var(--ref-spacing-02); align-items: center; min-width: 0; }
.tog { color: var(--sys-color-neutral-500); }
.tog.on { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
.tog:hover { color: var(--sys-color-neutral-800); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); align-items: center; }
.ts-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ref-spacing-02); align-items: center; }
.tools { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }
.txt-b { width: auto; min-width: 24px; padding: 0 4px; font-size: 11px; font-weight: 500; }
.caps { align-self: flex-start; }
.blend { max-height: 280px; overflow: auto; }
.seg4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 2px; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); }
.seg-b { height: 24px; border-radius: var(--ref-radius-02); font-size: 11px; color: var(--sys-color-neutral-600); }
.seg-b.on { background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); font-weight: 500; box-shadow: 0 1px 2px rgb(0 0 0 / 8%); }
.grid3c { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: var(--ref-spacing-04); }
.color-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ref-spacing-04); align-items: center; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.rel { position: relative; min-width: 0; }
.muted { color: var(--sys-color-neutral-500); }
.grow { flex: 1; min-width: 0; }
.fld > svg { flex: none; color: var(--sys-color-neutral-600); }
.full { width: 100%; }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { box-shadow: inset 0 0 0 1px var(--sys-color-neutral-600); }
.cb:focus-visible, .swatch:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
