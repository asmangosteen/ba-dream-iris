<script setup lang="ts">
import { Button, Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { normAngle, ratioLocked, TYPE_LABEL, type LayerNode, type LayerStyle } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { currentGap, guessAxis, type ArrangeOp } from '~/canvas/geom'
import ArrangeControls from '~/components/editor/ArrangeControls.vue'

/** 오른쪽 패널 · 디자인 탭(레이어를 골랐을 때): 위치 · 크기(비율 고정) · 회전 · 뒤집기 · 정렬 · 균등 분배 · 모양(모서리 따로) · 채우기 · 선 · 텍스트 · 순서 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ 'replace-image': [id: string] }>()
const store = useLayerStore()
const { tokens } = useDesignSystem()

const sid = computed(() => props.screen.id)
const ids = computed(() => store.layerIds.value)
const nodes = computed(() => ids.value.map((id) => store.node(sid.value, id)).filter((n): n is LayerNode => !!n))
const one = computed(() => (nodes.value.length === 1 ? nodes.value[0]! : null))
const types = computed(() => new Set(nodes.value.map((n) => n.type)))
const has = (...t: LayerNode['type'][]) => t.some((x) => types.value.has(x))
/** 고른 레이어들의 값이 모두 같으면 그 값, 다르면 '여러 값' */
function same<T>(get: (n: LayerNode) => T): T | '여러 값' {
  const v = nodes.value.map(get)
  return v.every((x) => x === v[0]) ? v[0]! : '여러 값'
}
const show = (v: unknown) => (v === '여러 값' ? '' : v === undefined || v === null ? '' : String(typeof v === 'number' ? Math.round(v * 100) / 100 : v))

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
    return { style: on ? { ...n.style, radii: [r, r, r, r] } : { ...n.style, radius: n.style.radii?.[0] ?? r, radii: undefined } }
  })
}
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
const allCorners = computed(() => same((n) => (n.style.radii ? (n.style.radii.every((r) => r === n.style.radii![0]) ? n.style.radii[0] : '여러 값') : n.style.radius ?? 0)))
const CORNER_LABEL = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래']
function setStyle(key: keyof LayerStyle, value: LayerStyle[keyof LayerStyle]) { store.style(sid.value, ids.value, { [key]: value }) }
function setStyleNum(key: 'radius' | 'strokeWidth' | 'fontSize' | 'lineHeight', e: Event, min = 0) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) return
  setStyle(key, Math.max(min, Math.round(v * 10) / 10))
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

// 색: '#RRGGBB' 또는 토큰 참조
const colorTokens = computed(() => (tokens.data.value ?? []).filter((t) => t.type === 'color' && /^#|^rgb/.test(t.value)))
const menu = ref<string | null>(null)
const hex = (v?: string) => { const c = store.color(v); return c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000' }
const label = (v?: string | '여러 값') => (v === '여러 값' ? '여러 값' : !v ? '없음' : v.startsWith('token:') ? v.slice(6) : v.toUpperCase())
function setHex(key: 'fill' | 'stroke' | 'color', e: Event) {
  let v = (e.target as HTMLInputElement).value.trim()
  if (!v) { setStyle(key, undefined); return }
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) setStyle(key, v.toUpperCase())
}
function addStroke() { store.style(sid.value, ids.value, { stroke: '#202837', strokeWidth: 1 }) }

// 정렬(하나면 부모 기준, 여러 개면 고른 범위 기준) · 균등 분배 · 간격 맞추기
const rects = computed(() => store.boxes(sid.value, ids.value))
const axis = computed(() => (rects.value.length >= 2 ? guessAxis(rects.value) : 'x'))
const gap = computed(() => currentGap(rects.value, axis.value))
function onArrange(op: ArrangeOp) {
  if (op.kind === 'align') store.align(sid.value, ids.value, op.k)
  else if (op.kind === 'distribute') store.distribute(sid.value, ids.value, op.axis)
  else store.space(sid.value, ids.value, op.axis, op.gap)
}
const WEIGHTS = [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']] as const
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
        <span class="tx-head">{{ one ? TYPE_LABEL[one.type] : `${nodes.length}개 고름` }}</span>
        <span class="row0">
          <button class="ib s24" aria-label="맨 앞으로 (⌥⌘])" title="맨 앞으로" @click="store.arrange(sid, ids, 'top')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5M3 1.5h8" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="앞으로 (⌘])" title="앞으로" @click="store.arrange(sid, ids, 1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="뒤로 (⌘[)" title="뒤로" @click="store.arrange(sid, ids, -1)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3v8M3.5 7.5L7 11l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="지우기 (Delete)" title="지우기" @click="store.remove(sid, ids)"><Icon name="trashbin" :size="14" /></button>
        </span>
      </div>
      <label v-if="one" class="sq fld"><span>이름</span><input :key="one.id + one.name" :value="one.name" aria-label="레이어 이름" @change="store.update(sid, ids, { name: ($event.target as HTMLInputElement).value.trim() || one.name })" @keydown="blurOnEnter"></label>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>위치</span></div>
      <ArrangeControls :count="nodes.length" :gap="gap" :axis="axis" @op="onArrange" />
      <div class="grid3">
        <label class="sq fld"><span>X</span><input :value="show(same((n) => n.x))" :placeholder="same((n) => n.x) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="X" @change="setNum('x', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ x: n.x + d })))"></label>
        <span />
        <label class="sq fld"><span>Y</span><input :value="show(same((n) => n.y))" :placeholder="same((n) => n.y) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="Y" @change="setNum('y', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ y: n.y + d })))"></label>
        <label class="sq fld"><span>W</span><input :value="show(same((n) => n.w))" :placeholder="same((n) => n.w) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="너비" @change="setNum('w', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => sized(n, 'w', n.w + d)))"></label>
        <button :class="['ib', 's24', 'tog', { on: locked }]" :aria-pressed="locked" :aria-label="locked ? '비율 고정 풀기' : '비율 고정'" :title="locked ? '비율 고정 풀기' : '비율 고정'" @click="toggleRatio">
          <svg v-if="locked" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1M5.5 8.5l3-3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
        </button>
        <label class="sq fld"><span>H</span><input :value="show(same((n) => n.h))" :placeholder="same((n) => n.h) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="높이" @change="setNum('h', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => sized(n, 'h', n.h + d)))"></label>
      </div>
      <div class="grid2">
        <label class="sq fld" title="회전"><span>∠</span><input :value="show(same((n) => n.rotation ?? 0))" :placeholder="same((n) => n.rotation ?? 0) === '여러 값' ? '여러 값' : ''" inputmode="decimal" aria-label="회전" @change="setRotation" @keydown="blurOnEnter($event); step($event, (d) => store.rotateBy(sid, ids, d))"><span>°</span></label>
        <div class="grp">
          <button class="ib" aria-label="90° 돌리기" title="90° 돌리기" @click="store.rotateBy(sid, ids, 90)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5a4.5 4.5 0 1 0 1.6-3.5M4.5 1.5v2.7h2.7" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipX) === true }]" aria-label="좌우 뒤집기 (⇧H)" title="좌우 뒤집기 ⇧H" @click="store.flip(sid, ids, 'x')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M5 3.5v7L1.5 10.5zM9 3.5v7l3.5 0z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipY) === true }]" aria-label="상하 뒤집기 (⇧V)" title="상하 뒤집기 ⇧V" @click="store.flip(sid, ids, 'y')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7h11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M3.5 5h7L10.5 1.5zM3.5 9h7l0 3.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
        </div>
      </div>
      <button v-if="has('frame')" :class="['cb', { on: same((n) => n.style.clip !== false) === true }]" @click="setStyle('clip', same((n) => n.style.clip !== false) !== true)"><i />내용 자르기</button>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>모양</span></div>
      <div class="grid2"><span class="sub">투명도</span><span v-if="!has('text')" class="sub">모서리</span></div>
      <div class="grid2">
        <label class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M2.5 11.5l9-9" stroke="currentColor" stroke-width="1.2" /></svg><input :value="same((n) => Math.round((n.style.opacity ?? 1) * 100)) === '여러 값' ? '' : same((n) => Math.round((n.style.opacity ?? 1) * 100))" inputmode="numeric" aria-label="투명도" @change="setOpacity" @keydown="blurOnEnter"><span>%</span></label>
        <div v-if="!has('text')" class="rad">
          <label v-if="separate" class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input :key="'all' + String(allCorners)" :value="show(allCorners)" :placeholder="allCorners === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="모서리" @change="setCorner($event)" @keydown="blurOnEnter"></label>
          <label v-else class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input :value="show(same((n) => n.style.radius ?? 0))" inputmode="numeric" aria-label="모서리" @change="setStyleNum('radius', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ style: { ...n.style, radius: Math.max(0, (n.style.radius ?? 0) + d) } })))"></label>
          <button :class="['ib', 's28', 'tog', { on: separate }]" :aria-pressed="separate" aria-label="모서리 따로" title="모서리 따로" @click="toggleCorners"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5V3.5a2 2 0 0 1 2-2H5M9 1.5h1.5a2 2 0 0 1 2 2V5M12.5 9v1.5a2 2 0 0 1-2 2H9M5 12.5H3.5a2 2 0 0 1-2-2V9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        </div>
      </div>
      <div v-if="!has('text') && separate" class="grid4">
        <label v-for="(c, i) in CORNER_LABEL" :key="c" class="sq fld" :title="`${c} 모서리`"><svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" :style="{ transform: `rotate(${i * 90}deg)` }"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.4" fill="none" /></svg><input :value="show(corner(i))" :placeholder="corner(i) === '여러 값' ? '여러 값' : ''" inputmode="numeric" :aria-label="`${c} 모서리`" @change="setCorner($event, i)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => { const r = [...(n.style.radii ?? [0, 0, 0, 0])] as [number, number, number, number]; r[i] = Math.max(0, r[i]! + d); return { style: { ...n.style, radii: r } } }))"></label>
      </div>
    </section>

    <section v-if="has('frame', 'rect')" class="s">
      <div class="sec-h h24"><span>채우기</span></div>
      <div class="color-row">
        <label class="sq fld"><input type="color" class="swatch" :value="hex(nodes[0]?.style.fill)" aria-label="채우기 색" @change="setStyle('fill', ($event.target as HTMLInputElement).value.toUpperCase())"><input :value="label(same((n) => n.style.fill))" aria-label="채우기 값" @change="setHex('fill', $event)" @keydown="blurOnEnter"></label>
        <div class="rel"><button class="ib s28" aria-label="색 토큰" :aria-expanded="menu === 'fill'" @click="menu = menu === 'fill' ? null : 'fill'"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="4.5" cy="4.5" r="1.6" fill="currentColor" /><circle cx="9.5" cy="4.5" r="1.6" fill="currentColor" /><circle cx="4.5" cy="9.5" r="1.6" fill="currentColor" /><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor" /></svg></button>
          <div v-if="menu === 'fill'" class="sq menu tok"><button v-for="t in colorTokens" :key="t.id" class="sq menu-item" @click="setStyle('fill', 'token:' + t.name); menu = null"><span class="sw" :style="{ background: t.value }" />{{ t.name }}</button><span v-if="!colorTokens.length" class="tx-meta p6">색 토큰이 없어요</span></div>
        </div>
      </div>
    </section>

    <section v-if="!has('text')" class="s">
      <div class="sec-h h24"><span>선</span><button v-if="!nodes.some((n) => n.style.stroke && n.style.strokeWidth)" class="ib s24" aria-label="선 더하기" @click="addStroke"><Icon name="plus" :size="14" /></button><button v-else class="ib s24" aria-label="선 빼기" @click="store.style(sid, ids, { stroke: undefined, strokeWidth: undefined })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button></div>
      <div v-if="nodes.some((n) => n.style.stroke && n.style.strokeWidth)" class="color-row">
        <label class="sq fld"><input type="color" class="swatch" :value="hex(nodes[0]?.style.stroke)" aria-label="선 색" @change="setStyle('stroke', ($event.target as HTMLInputElement).value.toUpperCase())"><input :value="label(same((n) => n.style.stroke))" aria-label="선 색 값" @change="setHex('stroke', $event)" @keydown="blurOnEnter"></label>
        <label class="sq fld w64"><input :value="show(same((n) => n.style.strokeWidth ?? 0))" inputmode="numeric" aria-label="선 두께" @change="setStyleNum('strokeWidth', $event)" @keydown="blurOnEnter"><span>px</span></label>
      </div>
    </section>

    <section v-if="has('text')" class="s">
      <div class="sec-h h24"><span>텍스트</span></div>
      <div class="rel">
        <button :class="['sq', 'dd', { open: menu === 'weight' }]" :aria-expanded="menu === 'weight'" @click="menu = menu === 'weight' ? null : 'weight'"><span>Pretendard · {{ WEIGHTS.find((w) => w[0] === same((n) => n.style.fontWeight ?? 400))?.[1] ?? '여러 값' }}</span><Icon name="chevron_down" :size="12" class="muted" /></button>
        <div v-if="menu === 'weight'" class="sq menu"><button v-for="w in WEIGHTS" :key="w[0]" :class="['sq', 'menu-item', { on: same((n) => n.style.fontWeight ?? 400) === w[0] }]" @click="setStyle('fontWeight', w[0]); menu = null">{{ w[1] }}</button></div>
      </div>
      <div class="grid2">
        <label class="sq fld"><span>크기</span><input :value="show(same((n) => n.style.fontSize ?? 16))" inputmode="numeric" aria-label="글자 크기" @change="setStyleNum('fontSize', $event, 1)" @keydown="blurOnEnter"></label>
        <label class="sq fld"><span>행간</span><input :value="show(same((n) => n.style.lineHeight ?? ''))" inputmode="numeric" aria-label="행간" @change="setStyleNum('lineHeight', $event, 1)" @keydown="blurOnEnter"></label>
      </div>
      <div class="color-row">
        <label class="sq fld"><input type="color" class="swatch" :value="hex(nodes[0]?.style.color)" aria-label="글자 색" @change="setStyle('color', ($event.target as HTMLInputElement).value.toUpperCase())"><input :value="label(same((n) => n.style.color))" aria-label="글자 색 값" @change="setHex('color', $event)" @keydown="blurOnEnter"></label>
        <div class="rel"><button class="ib s28" aria-label="색 토큰" :aria-expanded="menu === 'color'" @click="menu = menu === 'color' ? null : 'color'"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="4.5" cy="4.5" r="1.6" fill="currentColor" /><circle cx="9.5" cy="4.5" r="1.6" fill="currentColor" /><circle cx="4.5" cy="9.5" r="1.6" fill="currentColor" /><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor" /></svg></button>
          <div v-if="menu === 'color'" class="sq menu tok"><button v-for="t in colorTokens" :key="t.id" class="sq menu-item" @click="setStyle('color', 'token:' + t.name); menu = null"><span class="sw" :style="{ background: t.value }" />{{ t.name }}</button><span v-if="!colorTokens.length" class="tx-meta p6">색 토큰이 없어요</span></div>
        </div>
      </div>
      <div class="grp">
        <button v-for="a in (['left', 'center', 'right'] as const)" :key="a" :class="['ib', { on: same((n) => n.style.align ?? 'left') === a }]" :aria-label="{ left: '왼쪽 정렬', center: '가운데 정렬', right: '오른쪽 정렬' }[a]" @click="setStyle('align', a)">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path :d="a === 'left' ? 'M2 3.5h10M2 7h6M2 10.5h8' : a === 'center' ? 'M2 3.5h10M4 7h6M3 10.5h8' : 'M2 3.5h10M6 7h6M4 10.5h8'" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
        </button>
      </div>
      <button :class="['cb', { on: same((n) => !!n.style.autoWidth) === true }]" @click="setStyle('autoWidth', same((n) => !!n.style.autoWidth) !== true)"><i />글자 길이에 맞춰 너비 늘리기</button>
      <span v-if="one" class="tx-meta">두 번 누르거나 Enter 로 글자를 고쳐요</span>
    </section>

    <section v-if="one?.type === 'image'" class="s">
      <div class="sec-h h24"><span>이미지</span></div>
      <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="image" class="full" @click="emit('replace-image', one.id)">다른 이미지로 바꾸기</Button>
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
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.grid4 .fld { padding: 0 var(--ref-spacing-04); gap: var(--ref-spacing-02); }
.grid4 .fld svg { flex: none; color: var(--sys-color-neutral-600); }
.rad { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: var(--ref-spacing-02); align-items: center; min-width: 0; }
.tog { color: var(--sys-color-neutral-500); }
.tog.on { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
.tog:hover { color: var(--sys-color-neutral-800); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); align-items: center; }
.color-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ref-spacing-04); align-items: center; }
.w64 { width: 64px; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.rel { position: relative; min-width: 0; }
.tok { left: auto; right: 0; width: 220px; max-height: 240px; overflow: auto; }
.tok > * { flex: none; }
.muted { color: var(--sys-color-neutral-500); }
.p6 { padding: var(--ref-spacing-04) var(--ref-spacing-06); }
.full { width: 100%; }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { box-shadow: inset 0 0 0 1px var(--sys-color-neutral-600); }
.cb:focus-visible, .swatch:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
