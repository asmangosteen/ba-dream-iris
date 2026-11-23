<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import { KIND_LABEL, nameFromId, parseColor, useTokenCatalog, type CatalogToken, type TokenKind } from '~/canvas/tokens'

/**
 * 변수(토큰) 고르기 — 피그마 변수 버튼처럼 속성 줄 끝(또는 입력칸 안)에 둡니다.
 * - 연결 안 됨: 작은 변수 버튼(◇) → 누르면 그 종류의 모든 값을 검색 · 묶음 · 스크롤 목록으로
 * - 연결됨: 입력칸 대신 토큰 이름 칩 → 누르면 같은 목록(맨 위 '연결 끊기')
 * - variant 'dropdown': 입력칸 너비의 드롭다운(텍스트 스타일)
 * 목록은 body 에 띄워서 패널 스크롤에 잘리지 않습니다. ↑↓ · Enter · Esc · 바깥 누르기로 닫기
 */
const props = withDefaults(defineProps<{
  kinds: TokenKind[]
  /** 연결된 토큰 id, 고른 레이어마다 다르면 '여러 값' */
  bound?: string | null
  variant?: 'auto' | 'icon' | 'dropdown'
  /** 드롭다운에서 연결이 없을 때 보이는 글 */
  placeholder?: string
  label?: string
  /** 입력칸 안에 둘 때: 마우스를 올리거나 포커스가 있을 때만 버튼이 보여요 */
  reveal?: boolean
  /** 좁은 칸: 칩에 이름 끝 마디만('radius/04' → '04') */
  short?: boolean
}>(), { bound: null, variant: 'auto', placeholder: '', label: '', reveal: false, short: false })
const emit = defineEmits<{ pick: [t: CatalogToken]; unbind: []; step: [d: number] }>()

const catalog = useTokenCatalog()
const kindLabel = computed(() => KIND_LABEL[props.kinds[0]!])
const mixed = computed(() => props.bound === '여러 값')
const boundToken = computed(() => (props.bound && !mixed.value ? catalog.find(props.bound) : undefined))
const boundName = computed(() => (mixed.value ? '여러 값' : props.bound ? boundToken.value?.name ?? nameFromId(props.bound) : ''))
const chipName = computed(() => (props.short && !mixed.value ? boundName.value.split('/').pop()! : boundName.value))
const asChip = computed(() => props.variant === 'auto' && !!props.bound)

const open = ref(false)
const q = ref('')
const active = ref(0)
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({})
const uid = useId()

const items = computed(() => {
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const all = catalog.list(props.kinds)
  // 같은 묶음끼리 모아요(팔레트의 투명도 값은 CSS 에서 따로 떨어져 있어요). 묶음 순서는 처음 나온 순서
  const order = new Map<string, number>()
  all.forEach((t) => { if (!order.has(t.group)) order.set(t.group, order.size) })
  return all
    .map((t, k) => ({ t, k }))
    .filter(({ t }) => { const hay = `${t.name} ${t.group} ${t.value} ${t.id}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
    .sort((a, b) => order.get(a.t.group)! - order.get(b.t.group)! || a.k - b.k)
    .map(({ t }) => t)
})
const groups = computed(() => {
  const out: { name: string; items: { t: CatalogToken; i: number }[] }[] = []
  const base = props.bound ? 1 : 0 // 0번은 '연결 끊기'
  items.value.forEach((t, k) => {
    let g = out[out.length - 1]
    if (!g || g.name !== t.group) out.push((g = { name: t.group, items: [] }))
    g.items.push({ t, i: k + base })
  })
  return out
})
const count = computed(() => items.value.length + (props.bound ? 1 : 0))

function place() {
  const el = trigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const W = 256, H = 372, vw = window.innerWidth, vh = window.innerHeight
  const left = Math.max(8, Math.min(vw - W - 8, r.right - W))
  const below = vh - r.bottom - 8
  pos.value = below >= Math.min(H, r.top - 8) || below >= H
    ? { left: left + 'px', top: r.bottom + 4 + 'px', maxHeight: Math.max(160, below - 4) + 'px' }
    : { left: left + 'px', bottom: vh - r.top + 4 + 'px', maxHeight: Math.max(160, r.top - 12) + 'px' }
}
async function show() {
  catalog.ensure()
  q.value = ''
  open.value = true
  place()
  const cur = props.bound && !mixed.value ? items.value.findIndex((t) => t.id === props.bound) : -1
  active.value = cur >= 0 ? cur + 1 : props.bound ? 1 : 0
  await nextTick()
  search.value?.focus()
  scrollActive('center')
}
function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) trigger.value?.focus()
}
const toggle = () => (open.value ? close() : show())
defineExpose({ show, close })

function choose(i: number) {
  if (props.bound && i === 0) emit('unbind')
  else {
    const t = items.value[i - (props.bound ? 1 : 0)]
    if (!t) return
    emit('pick', t)
  }
  close(true)
}
function scrollActive(block: ScrollLogicalPosition = 'nearest') {
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-i="${active.value}"]`)?.scrollIntoView({ block }))
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!count.value) return
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + count.value) % count.value
    scrollActive()
  } else if (e.key === 'Enter') { e.preventDefault(); choose(active.value) }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
  else if (e.key === 'Tab') close()
}
watch(q, () => { active.value = props.bound ? (items.value.length ? 1 : 0) : 0; nextTick(() => { if (list.value) list.value.scrollTop = 0 }) })

function onDocPointer(e: PointerEvent) {
  const t = e.target as Node | null
  if (open.value && t && !menu.value?.contains(t) && !trigger.value?.contains(t)) close()
}
const onReflow = (e: Event) => { if (open.value && !(e.target instanceof Node && menu.value?.contains(e.target))) place() }
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('scroll', onReflow, true)
  window.addEventListener('resize', onReflow)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('scroll', onReflow, true)
  window.removeEventListener('resize', onReflow)
})

const alpha = (c?: string) => (parseColor(c)?.a ?? 1) < 1
const sampleSize = (n: number) => Math.min(n, 20)
const title = computed(() => (boundToken.value ? `${boundToken.value.name} · ${boundToken.value.value}` : boundName.value))
</script>

<template>
  <button
    v-if="variant === 'dropdown'"
    ref="trigger"
    :class="['sq', 'dd', { open }]"
    :aria-label="label || kindLabel"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? uid : undefined"
    :title="title || undefined"
    @click="toggle"
  ><span class="dd-l"><span :class="{ ph: !bound }">{{ boundName || placeholder }}</span><span v-if="boundToken" class="dd-v">{{ boundToken.value }}</span></span><Icon name="chevron_down" :size="12" class="muted" /></button>
  <span v-else-if="asChip" :class="['tchip-w', { short }]">
    <button
      ref="trigger"
      :class="['sq', 'tchip', { open, mixed }]"
      :aria-label="`${label || kindLabel} 변수 ${boundName} — 바꾸기`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? uid : undefined"
      :title="title"
      @click.prevent="toggle"
      @keydown.up.prevent.stop="emit('step', $event.shiftKey ? 10 : 1)"
      @keydown.down.prevent.stop="emit('step', $event.shiftKey ? -10 : -1)"
    ><svg v-if="!short" class="tchip-i" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4 4-4 4-4-4z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg><span class="tchip-t">{{ chipName }}</span></button>
    <button v-if="!short" class="ib tchip-x" :aria-label="`${label || kindLabel} 변수 연결 끊기`" title="연결 끊기" @click.prevent="emit('unbind')"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 7.5l3-3M3.6 5.4l-.9.9a1.9 1.9 0 0 0 2.7 2.7l.9-.9M8.4 6.6l.9-.9a1.9 1.9 0 0 0-2.7-2.7l-.9.9M1.5 1.5l9 9" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" /></svg></button>
  </span>
  <button
    v-else
    ref="trigger"
    :class="['ib', 'vb', { reveal, open }]"
    :aria-label="`${label || kindLabel} 변수 연결`"
    :title="`${label || kindLabel} 변수 연결`"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? uid : undefined"
    @click.prevent="toggle"
  ><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="3" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M7 4.2L9.8 7 7 9.8 4.2 7z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>

  <Teleport to="body">
    <div v-if="open" ref="menu" class="sq menu tp" :style="pos" @keydown="onKey">
      <label class="sq fld tp-s"><Icon name="search" :size="14" class="muted" /><input ref="search" v-model="q" :placeholder="`${kindLabel} 변수 검색`" :aria-label="`${kindLabel} 변수 검색`" role="combobox" aria-expanded="true" :aria-controls="uid" :aria-activedescendant="`${uid}-${active}`" autocomplete="off" spellcheck="false"></label>
      <div :id="uid" ref="list" class="tp-l" role="listbox" :aria-label="`${kindLabel} 변수`">
        <button v-if="bound" :id="`${uid}-0`" data-i="0" role="option" :aria-selected="active === 0" :class="['sq', 'menu-item', { cur: active === 0 }]" @click="choose(0)" @pointermove="active = 0">
          <svg class="pv" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 8.5l3-3M4.5 6.5l-1 1a2.1 2.1 0 0 0 3 3l1-1M9.5 7.5l1-1a2.1 2.1 0 0 0-3-3l-1 1M2 2l10 10" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
          <span class="nm">연결 끊기</span>
        </button>
        <template v-for="g in groups" :key="g.name">
          <div class="tp-g" role="presentation">{{ g.name }}</div>
          <button
            v-for="{ t, i } in g.items"
            :id="`${uid}-${i}`"
            :key="t.id"
            :data-i="i"
            role="option"
            :aria-selected="t.id === bound"
            :class="['sq', 'menu-item', { on: t.id === bound, cur: active === i }]"
            :title="`${t.name} · ${t.value}`"
            @click="choose(i)"
            @pointermove="active = i"
          >
            <span v-if="t.kind === 'color'" :class="['pv', 'sw', { al: alpha(t.color) }]"><i :style="{ background: t.color }" /></span>
            <span v-else-if="t.kind === 'textStyle'" class="pv ts" data-preview :style="{ fontSize: sampleSize(t.text!.size) + 'px', fontWeight: t.text!.weight ?? 400 }">Ag</span>
            <span v-else-if="t.kind === 'fontWeight'" class="pv ts" :style="{ fontWeight: t.num }">Ag</span>
            <span v-else-if="t.kind === 'shadow'" class="pv sh" :style="{ boxShadow: t.css }" />
            <span class="nm">{{ t.name }}</span>
            <span class="vl">{{ t.value }}</span>
          </button>
        </template>
        <span v-if="!items.length" class="tp-e">{{ q ? '맞는 변수가 없어요' : `${kindLabel} 변수가 없어요` }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 변수 버튼: 촘촘한 줄 아이콘 버튼 24 (입력칸 안에서는 20) */
.vb { width: 24px; height: 24px; color: var(--sys-color-neutral-500); }
.vb:hover, .vb.open { color: var(--sys-color-neutral-800); }
.vb.open { --sq-fill: var(--sys-color-neutral-300); }
.vb.reveal { width: 20px; height: 20px; margin-right: calc(-1 * var(--ref-spacing-04)); opacity: 0; transition: opacity .12s ease, background-color .12s ease, color .12s ease; }
:global(.fld:hover) .vb.reveal, :global(.fld:focus-within) .vb.reveal, .vb.reveal.open, .vb.reveal:focus-visible { opacity: 1; }

/* 연결된 값: 입력칸 자리를 채우는 칩 */
.tchip-w { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; }
/* 연결 끊기: 마우스를 올리면 칩 오른쪽 끝에 겹쳐 보여요(자리를 차지하지 않게) */
.tchip-x { position: absolute; right: 0; top: 50%; width: 20px; height: 20px; margin-top: -10px; --sq-fill: var(--sys-color-common-white-emphasis); color: var(--sys-color-neutral-500); opacity: 0; transition: opacity .12s ease, background-color .12s ease; }
.tchip-x:hover { color: var(--sys-color-neutral-800); }
:global(.fld:hover) .tchip-x, .tchip-x:focus-visible { opacity: 1; }
.tchip { flex: 1; min-width: 0; height: 20px; display: flex; align-items: center; gap: var(--ref-spacing-03); padding: 0 var(--ref-spacing-04); margin-left: calc(-1 * var(--ref-spacing-02)); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 0.5px; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); text-align: left; transition: box-shadow .12s ease; }
.tchip:hover { --sq-line: var(--ref-color-gray-900-20); }
.tchip.open { --sq-line: var(--sys-color-brand-primary-default); }
.tchip.mixed { color: var(--sys-color-neutral-600); }
.short .tchip { padding: 0 var(--ref-spacing-03); margin-left: 0; }
.tchip:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.tchip-i { flex: none; color: var(--sys-color-neutral-500); }
.tchip-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dd-l { min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-04); overflow: hidden; }
.dd-l > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd-v { flex: none; color: var(--sys-color-neutral-500); }
.ph { color: var(--sys-color-neutral-600); }
.muted { color: var(--sys-color-neutral-500); flex: none; }

/* 목록 카드 */
.tp { position: fixed; right: auto; top: auto; width: 256px; z-index: 50; gap: var(--ref-spacing-02); box-sizing: border-box; }
.tp-s { flex: none; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04); }
.tp-l { display: flex; flex-direction: column; min-height: 0; max-height: 320px; overflow-y: auto; overscroll-behavior: contain; scroll-padding: var(--ref-spacing-12) 0 var(--ref-spacing-02); }
.tp-l > * { flex: none; }
.tp-g { position: sticky; top: 0; z-index: 1; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-02); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); background: var(--sys-color-common-white-default); }
.tp-e { padding: var(--ref-spacing-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); }
.menu-item { min-height: 26px; height: auto; }
.menu-item.cur { --sq-fill: var(--sys-color-neutral-100); }
.menu-item.on { font-weight: 400; }
.menu-item.on.cur { --sq-fill: var(--sys-color-brand-primary-lightest); }
.nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vl { flex: none; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sys-color-neutral-500); font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
.menu-item.on .vl { color: var(--sys-color-brand-primary-default); }
.pv { flex: none; width: 14px; height: 14px; display: grid; place-items: center; color: var(--sys-color-neutral-600); }
.sw { position: relative; border-radius: 3px; overflow: hidden; }
.sw.al { background: repeating-conic-gradient(var(--iris-paper) 0 25%, #D6D9DD 0 50%) 0 0 / 6px 6px; }
.sw i { position: absolute; inset: 0; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); border-radius: inherit; }
.ts { width: 28px; height: auto; min-height: 18px; line-height: 1.2; color: var(--sys-color-neutral-800); font-family: var(--font-family-base); }
.sh { border-radius: 3px; background: var(--iris-paper); margin: 0 2px; width: 12px; height: 12px; }
</style>
