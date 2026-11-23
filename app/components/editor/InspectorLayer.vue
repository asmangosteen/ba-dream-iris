<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { TYPE_LABEL, type LayerNode, type LayerStyle } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'

/** 오른쪽 패널 · 디자인 탭(레이어를 골랐을 때): 위치 · 크기 · 정렬 · 모양 · 채우기 · 선 · 텍스트 · 순서 */
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

function setNum(key: 'x' | 'y' | 'w' | 'h', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(same((n) => n[key])); return }
  store.update(sid.value, ids.value, (n) => {
    const patch: Partial<LayerNode> = { [key]: Math.max(key === 'w' || key === 'h' ? 1 : -1e6, Math.round(v)) }
    if (n.type === 'text' && key === 'w') n.style.autoWidth = false
    return patch
  })
}
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

// 정렬: 하나면 부모(화면 · 프레임) 기준, 여러 개면 고른 범위 기준
function align(kind: 'l' | 'c' | 'r' | 't' | 'm' | 'b') {
  const d = store.doc(sid.value)
  const list = nodes.value
  if (!list.length) return
  const absBox = (n: LayerNode) => ({ ...store.absPos(sid.value, n.id), w: n.w, h: n.h })
  let area: { x: number; y: number; w: number; h: number }
  if (list.length === 1) {
    const p = list[0]!.parentId ? d.nodes[list[0]!.parentId!] : null
    area = p ? absBox(p) : { x: 0, y: 0, w: props.screen.width, h: props.screen.height }
  } else {
    const bs = list.map(absBox)
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y))
    area = { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 }
  }
  store.update(sid.value, ids.value, (n) => {
    const a = absBox(n)
    const off = { x: a.x - n.x, y: a.y - n.y } // 부모 위치
    if (kind === 'l') return { x: area.x - off.x }
    if (kind === 'c') return { x: Math.round(area.x + (area.w - n.w) / 2 - off.x) }
    if (kind === 'r') return { x: area.x + area.w - n.w - off.x }
    if (kind === 't') return { y: area.y - off.y }
    if (kind === 'm') return { y: Math.round(area.y + (area.h - n.h) / 2 - off.y) }
    return { y: area.y + area.h - n.h - off.y }
  })
}
const WEIGHTS = [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']] as const
watch(ids, () => (menu.value = null))
</script>

<template>
  <div class="li">
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
      <span class="sub">정렬</span>
      <div class="grp">
        <button class="ib" aria-label="왼쪽 맞춤" @click="align('l')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1.5v11M4.5 4h7M4.5 9h4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        <button class="ib" aria-label="가로 가운데" @click="align('c')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M3.5 4h7M4.5 9h5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        <button class="ib" aria-label="오른쪽 맞춤" @click="align('r')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M12 1.5v11M2.5 4h7M5.5 9h4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        <button class="ib" aria-label="위쪽 맞춤" @click="align('t')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 2h11M4 4.5v7M9 4.5v4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        <button class="ib" aria-label="세로 가운데" @click="align('m')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7h11M4 3.5v7M9 4.5v5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        <button class="ib" aria-label="아래쪽 맞춤" @click="align('b')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 12h11M4 2.5v7M9 5.5v4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
      </div>
      <div class="grid2">
        <label class="sq fld"><span>X</span><input :value="show(same((n) => n.x))" :placeholder="same((n) => n.x) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="X" @change="setNum('x', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ x: n.x + d })))"></label>
        <label class="sq fld"><span>Y</span><input :value="show(same((n) => n.y))" :placeholder="same((n) => n.y) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="Y" @change="setNum('y', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ y: n.y + d })))"></label>
        <label class="sq fld"><span>W</span><input :value="show(same((n) => n.w))" :placeholder="same((n) => n.w) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="너비" @change="setNum('w', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ w: Math.max(1, n.w + d) })))"></label>
        <label class="sq fld"><span>H</span><input :value="show(same((n) => n.h))" :placeholder="same((n) => n.h) === '여러 값' ? '여러 값' : ''" inputmode="numeric" aria-label="높이" @change="setNum('h', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ h: Math.max(1, n.h + d) })))"></label>
      </div>
      <button v-if="has('frame')" :class="['cb', { on: same((n) => n.style.clip !== false) === true }]" @click="setStyle('clip', same((n) => n.style.clip !== false) !== true)"><i />내용 자르기</button>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>모양</span></div>
      <div class="grid2"><span class="sub">투명도</span><span v-if="!has('text')" class="sub">모서리</span></div>
      <div class="grid2">
        <label class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M2.5 11.5l9-9" stroke="currentColor" stroke-width="1.2" /></svg><input :value="same((n) => Math.round((n.style.opacity ?? 1) * 100)) === '여러 값' ? '' : same((n) => Math.round((n.style.opacity ?? 1) * 100))" inputmode="numeric" aria-label="투명도" @change="setOpacity" @keydown="blurOnEnter"><span>%</span></label>
        <label v-if="!has('text')" class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input :value="show(same((n) => n.style.radius ?? 0))" inputmode="numeric" aria-label="모서리" @change="setStyleNum('radius', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => ({ style: { ...n.style, radius: Math.max(0, (n.style.radius ?? 0) + d) } })))"></label>
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
          <div v-if="menu === 'color'" class="sq menu tok"><button v-for="t in colorTokens" :key="t.id" class="sq menu-item" @click="setStyle('color', 'token:' + t.name); menu = null"><span class="sw" :style="{ background: t.value }" />{{ t.name }}</button></div>
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
      <button class="act line" @click="emit('replace-image', one.id)"><Icon name="image" :size="12" />다른 이미지로 바꾸기</button>
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
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); align-items: center; }
.color-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ref-spacing-04); align-items: center; }
.w64 { width: 64px; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.rel { position: relative; min-width: 0; }
.tok { left: auto; right: 0; width: 220px; max-height: 240px; overflow: auto; }
.muted { color: var(--sys-color-neutral-500); }
.p6 { padding: var(--ref-spacing-04) var(--ref-spacing-06); }
</style>
