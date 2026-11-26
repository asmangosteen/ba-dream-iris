<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import { KIND_LABEL, groupLabel, nameFromId, parseColor, useTokenCatalog, type CatalogToken, type TokenKind } from '~/canvas/tokens'

/**
 * 변수(토큰) 고르기 — 피그마 변수 버튼처럼 속성 줄 끝(또는 입력칸 안)에 둡니다.
 * - 연결 안 됨: 작은 변수 버튼(◇) → 누르면 그 종류의 모든 값을 검색 · 묶음 · 스크롤 목록으로
 * - 연결됨: 입력칸 대신 토큰 이름 칩 → 누르면 같은 목록(맨 위 '연결 끊기')
 * - variant 'dropdown': 입력칸 너비의 드롭다운
 * - variant 'style': 글자 스타일이 걸린 칸(피그마: [Ag Body 1/16 SB · 16/24] — 흰 칸, 누르면 Text styles 창)
 * - 글자 스타일 목록(kinds = textStyle)은 피그마 Text styles 창처럼 오른쪽 패널 왼쪽에, 제목 · 닫기 · 묶음(Body 1) · 행(Ag 16 SB · 16/24)
 * 목록은 body 에 띄워서 패널 스크롤에 잘리지 않습니다. ↑↓ · Enter · Esc · 바깥 누르기로 닫기
 */
const props = withDefaults(defineProps<{
  kinds: TokenKind[]
  /** 연결된 토큰 id, 고른 레이어마다 다르면 '여러 값' */
  bound?: string | null
  variant?: 'auto' | 'icon' | 'dropdown' | 'style'
  /** variant 'icon' 의 아이콘(EditorIcon 이름) — 비우면 변수 아이콘 */
  icon?: string
  /** 드롭다운에서 연결이 없을 때 보이는 글 */
  placeholder?: string
  label?: string
  /** 입력칸 안에 둘 때: 마우스를 올리거나 포커스가 있을 때만 버튼이 보여요 */
  reveal?: boolean
  /** 좁은 칸: 칩에 이름 끝 마디만('radius/04' → '04') */
  short?: boolean
}>(), { bound: null, variant: 'auto', placeholder: '', label: '', reveal: false, short: false, icon: '' })
const emit = defineEmits<{ pick: [t: CatalogToken]; unbind: []; step: [d: number] }>()

const catalog = useTokenCatalog()
const kindLabel = computed(() => tr(KIND_LABEL[props.kinds[0]!]))
/** 칸 이름: 부모는 영어 원문을 넘기고 여기서 지금 언어로 바꿔요 */
const lbl = computed(() => (props.label ? tr(props.label) : kindLabel.value))
const mixed = computed(() => props.bound === 'Mixed')
const boundToken = computed(() => (props.bound && !mixed.value ? catalog.find(props.bound) : undefined))
const boundName = computed(() => (mixed.value ? tr('Mixed') : props.bound ? boundToken.value?.name ?? nameFromId(props.bound) : ''))
/** 숫자 토큰(모서리 · 간격 · 크기 · 투명도 · 선 두께 · 글자 크기 · 줄 높이 · 자간)은 칩에 실제 값. 색 · 글자 스타일 · 굵기 · 그림자는 이름 */
const TEXTY = ['color', 'fontWeight', 'textStyle', 'shadow'] // 굵기는 이름(Medium) 그대로
const numericShort = computed(() => props.kinds.every((k) => !TEXTY.includes(k)))
/** 칩 글자: 숫자 토큰은 늘 실제 값(피그마와 같아요), 글자 속성 · 색 등은 이름(좁은 칸은 끝 마디) */
const chipName = computed(() => (mixed.value ? tr('Mixed') : numericShort.value && chipValue.value ? chipValue.value : props.short ? boundName.value.split('/').pop()! : boundName.value))
/** 토큰의 실제 값('radius/04' → '8') */
const chipValue = computed(() => (boundToken.value ? (boundToken.value.num !== undefined ? String(boundToken.value.num) : boundToken.value.value) : ''))
const asChip = computed(() => props.variant === 'auto' && !!props.bound)
/** 글자 스타일 목록: 피그마 Text styles 창 모양. 떼기는 목록이 아니라 칸 옆 버튼으로(피그마와 같아요) */
const isTS = computed(() => props.kinds[0] === 'textStyle')
const hasDetach = computed(() => !!props.bound && !isTS.value)

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
  const base = hasDetach.value ? 1 : 0 // 0번은 '연결 끊기'
  items.value.forEach((t, k) => {
    let g = out[out.length - 1]
    if (!g || g.name !== t.group) out.push((g = { name: t.group, items: [] }))
    g.items.push({ t, i: k + base })
  })
  return out
})
const count = computed(() => items.value.length + (hasDetach.value ? 1 : 0))

/** 목록 자리: 트리거가 든 칸(.fld · .dd) 왼쪽 끝 · 바로 아래(+4). 아래 자리가 모자라면 위로 뒤집어요 */
const W = 240
function place() {
  const el = trigger.value
  if (!el) return
  const box = (el.closest('.fld, .dd, .field, .tp-anchor') as HTMLElement | null) ?? el
  const r = box.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  // 편집기 팝오버 양식(Text styles 창 기준): 오른쪽 패널(또는 설정 창) 바로 왼쪽, 칸 위쪽에 맞춰서(칠 창과 같은 자리)
  const panel = el.closest('aside, [role="dialog"], [data-inspector]')?.getBoundingClientRect()
  if (panel) {
    const h = menu.value?.offsetHeight || 420
    pos.value = { left: Math.max(8, panel.left - W - 8) + 'px', top: Math.max(8, Math.min(vh - h - 8, r.top - 48)) + 'px', maxHeight: Math.min(vh - 16, 560) + 'px' }
    return
  }
  const H = Math.min(372, (menu.value?.offsetHeight || 372))
  const left = Math.max(8, Math.min(vw - W - 8, r.left))
  const below = vh - r.bottom - 12
  const above = r.top - 12
  pos.value = below >= H || below >= above
    ? { left: left + 'px', top: r.bottom + 4 + 'px', maxHeight: Math.max(120, below) + 'px' }
    : { left: left + 'px', bottom: vh - r.top + 4 + 'px', maxHeight: Math.max(120, above) + 'px' }
}
async function show(focusSearch = true) {
  catalog.ensure()
  q.value = ''
  open.value = true
  place()
  nextTick(place)
  const cur = props.bound && !mixed.value ? items.value.findIndex((t) => t.id === props.bound) : -1
  active.value = cur >= 0 ? cur + (hasDetach.value ? 1 : 0) : hasDetach.value ? 1 : 0
  await nextTick()
  // 검색칸은 눌러야 켜져요(사용자 요청) — 대신 창에 포커스를 둬서 ↑↓ · Enter · Esc 는 바로 돼요
  if (focusSearch) menu.value?.focus({ preventScroll: true })
  scrollActive('center')
}
function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) trigger.value?.focus()
}
const toggle = () => (open.value ? close() : show())
defineExpose({ show, close })

/**
 * 칩 편집(피그마와 같아요): 칩을 누르면 칩 오른쪽에 커서. Backspace 한 번 → 연결 끊고 그 칸 숫자 입력으로(이어서 지우고 새 값),
 * 글자를 치면 그 글자로 토큰 검색 목록 → 새 토큰. Enter · ↓ 는 목록 열기, ↑ · ↓ + 값 단계는 칩에서처럼
 */
const caret = ref<HTMLInputElement | null>(null)
const caretOn = ref(false)
function focusCaret() { caretOn.value = true; nextTick(() => caret.value?.focus()) }
/**
 * 칩 누르기: 처음엔 칩 오른쪽 커서(Backspace = 연결 끊기, 글자 = 찾기), 커서가 떠 있을 때 다시 누르면 토큰 목록 창(피그마와 같아요).
 * 누르는 순간 커서 칸이 blur 로 꺼지니까 누르기 전(pointerdown) 상태를 기억해요
 */
/** 칩 한 번 누르기: 칩 오른쪽 커서 + 토큰 목록 창을 함께 — 바로 다른 값을 고르거나 Backspace(연결 끊기) · 글자(찾기) */
let caretWas = false
function chipDown() { caretWas = caretOn.value || open.value }
function chipClick() {
  if (caretWas && open.value) { close(); caretOn.value = false; return }
  focusCaret()
  show(false)
}
async function caretKey(e: KeyboardEvent) {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    const fld = caret.value?.closest('.fld, label')
    close()
    caretOn.value = false
    emit('unbind')
    await nextTick()
    // 연결이 풀리면 칸에 숫자 입력이 다시 생겨요 — 거기로 커서(끝에)
    const inp = fld?.querySelector<HTMLInputElement>('input:not(.tchip-caret)')
    if (inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange?.(n, n) }
    return
  }
  if (e.key === 'Escape') { close(); caretOn.value = false; caret.value?.blur(); return }
  // 목록이 떠 있으면 ↑ ↓ · Enter 는 목록에서(다른 값 고르기)
  if (open.value && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) { onKey(e); return }
  if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.altKey)) { e.preventDefault(); caretOn.value = false; show(); return }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); emit('step', (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); return }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    caretOn.value = false
    await show()
    q.value = e.key
  }
}

function choose(i: number) {
  if (hasDetach.value && i === 0) emit('unbind')
  else {
    const t = items.value[i - (hasDetach.value ? 1 : 0)]
    if (!t) return
    emit('pick', t)
  }
  close(true)
}
function scrollActive(block: ScrollLogicalPosition = 'nearest') {
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-i="${active.value}"]`)?.scrollIntoView({ block }))
}
function onKey(e: KeyboardEvent) {
  // 창 안에서 누른 키는 캔버스 단축키로 가지 않게(창에 포커스가 있을 때 ⌫ 가 레이어를 지우지 않게)
  e.stopPropagation()
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!count.value || !libOpen.value) return
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + count.value) % count.value
    scrollActive()
  } else if (e.key === 'Enter') { e.preventDefault(); choose(active.value) }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
  else if (e.key === 'Tab') close()
}
watch(q, () => { active.value = hasDetach.value ? (items.value.length ? 1 : 0) : 0; nextTick(() => { if (list.value) list.value.scrollTop = 0 }) })

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

/** 색 행 이름: 묶음 머리(System · brand …)가 위에 있으니 마지막 조각만 — 값 열 없이 이름이 잘리지 않게 */
const leaf = (n: string) => n.split('/').pop() || n
/** 피그마 변수 창처럼: 라이브러리 고르기(지금은 바드림 디자인 시스템 하나) · 라이브러리 묶음은 접고 펼 수 있어요 */
const LIB_NAME = '바드림 Design System'
const LIB_OPTS = [{ value: 'all', label: 'All libraries' }, { value: 'bd', label: LIB_NAME, raw: true }]
const libSel = ref('all')
const libOpen = ref(true)
const alpha = (c?: string) => (parseColor(c)?.a ?? 1) < 1
const sampleSize = (n: number) => Math.min(n, 20)
/** 글자 스타일 행의 Ag: 피그마처럼 크기는 고르게(16), 굵기만 스타일대로 */
const boundWeight = computed(() => boundToken.value?.text?.weight ?? 400)
const title = computed(() => (boundToken.value ? `${boundToken.value.name} · ${boundToken.value.value}` : boundName.value))
/** 숫자 변수 행 앞 아이콘(피그마 변수 목록처럼 종류가 먼저 보이게) */
const KIND_ICON: Partial<Record<string, string>> = { spacing: 'var_spacing', radius: 'var_radius', borderWidth: 'var_border', opacity: 'var_opacity', fontSize: 'var_number', lineHeight: 'var_number', letterSpacing: 'var_number' }
</script>

<template>
  <button
    v-if="variant === 'dropdown'"
    ref="trigger"
    :class="['sq', 'dd', { open }]"
    :aria-label="lbl"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? uid : undefined"
    :title="title || undefined"
    @click="toggle"
  ><span class="dd-l"><span v-if="bound" :class="['sq', 'tchip', 'dd-chip', { mixed }]"><span class="tchip-t">{{ chipName }}</span></span><span v-else class="ph">{{ placeholder ? tr(placeholder) : '' }}</span><span v-if="boundToken && !numericShort" class="dd-v">{{ boundToken.value }}</span></span><EditorIcon name="chevron_down" :size="12" class="muted" /></button>
  <button
    v-else-if="variant === 'style'"
    ref="trigger"
    type="button"
    :class="['sq', 'tsf', { open, mixed }]"
    :aria-label="tr('{label}: {name} — change', { label: lbl, name: boundName })"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? uid : undefined"
    :title="title || undefined"
    @click="toggle"
  ><span class="tsf-ag" aria-hidden="true" :style="{ fontWeight: boundWeight }">Ag</span><span class="tsf-n">{{ boundName }}<span v-if="boundToken" class="tsf-v"> · {{ boundToken.value }}</span></span></button>
  <span v-else-if="asChip" :class="['tchip-w', { short }]">
    <button
      ref="trigger"
      :class="['sq', 'tchip', { open, mixed }]"
      :aria-label="tr('{label} variable {name} — change', { label: lbl, name: boundName })"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? uid : undefined"
      :title="title"
      @pointerdown="chipDown"
      @click.prevent="chipClick"
      @keydown.up.prevent.stop="emit('step', $event.shiftKey ? 10 : 1)"
      @keydown.down.prevent.stop="emit('step', $event.shiftKey ? -10 : -1)"
      @keydown.enter.prevent="toggle"
    ><span class="tchip-t"><bdi>{{ chipName }}</bdi></span></button>
    <!-- 칩 오른쪽 커서: 누르면 여기로. Backspace = 연결 끊기, 글자 = 새 토큰 찾기 -->
    <input v-show="caretOn" ref="caret" class="tchip-caret" :aria-label="tr('{label}: Backspace to detach, type to search', { label: lbl })" @keydown="caretKey" @blur="caretOn = false">
    <button v-if="!short" type="button" class="ib tchip-x" :aria-label="tr('Detach variable: {label}', { label: lbl })" :title="tr('Detach variable')" @click.prevent="emit('unbind')"><EditorIcon name="unlink" /></button>
  </span>
  <button
    v-else
    ref="trigger"
    :class="['ib', 'vb', { reveal, open }]"
    :tabindex="reveal ? -1 : undefined"
    :aria-label="icon ? lbl : tr('Apply variable: {label}', { label: lbl })"
    :data-tip="icon ? lbl : tr('Apply variable: {label}', { label: lbl })"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="open ? uid : undefined"
    @click.prevent="toggle"
  ><EditorIcon v-if="icon" :name="icon" :size="16" /><EditorIcon v-else name="variable" /></button>

  <Teleport to="body">
    <div v-if="open" ref="menu" v-front tabindex="-1" :class="['sq', 'menu', 'tp', 'tsp']" :style="pos" @keydown="onKey">
      <!-- 피그마 변수 창: 머리 줄 = 검색(눌러야 켜져요) + 닫기 / 라이브러리 줄 / 목록(라이브러리 묶음 ▾ → 모음 이름 → 행) -->
      <div class="tp-h" :aria-label="isTS ? tr('Text styles') : tr('{kind} variables', { kind: kindLabel })" role="group" @click="!($event.target as HTMLElement).closest('button') && search?.focus()">
        <EditorIcon name="search" :size="16" class="tp-hi" />
        <input ref="search" v-model="q" :placeholder="tr('Search')" :aria-label="tr('Search {kind} variables', { kind: kindLabel.toLowerCase() })" role="combobox" aria-expanded="true" :aria-controls="uid" :aria-activedescendant="`${uid}-${active}`" autocomplete="off" spellcheck="false">
        <button type="button" class="ib tsp-x" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="close(true)"><EditorIcon name="close" :size="16" /></button>
      </div>
      <div class="tp-top"><EditorSelect class="tp-lib" :model-value="libSel" :options="LIB_OPTS" ariaLabel="Library" @update:model-value="(v) => (libSel = v)" /></div>
      <div :id="uid" ref="list" v-ovscroll class="tp-l" role="listbox" :aria-label="tr('{kind} variables', { kind: kindLabel })">
        <button v-if="hasDetach" :id="`${uid}-0`" data-i="0" role="option" :aria-selected="active === 0" :class="['sq', 'menu-item', { cur: active === 0 }]" @click="choose(0)" @pointermove="active = 0">
          <EditorIcon class="pv" name="unlink" />
          <span class="nm">{{ tr('Detach variable') }}</span>
        </button>
        <button v-if="groups.length" type="button" class="sq tp-libh" :aria-expanded="libOpen" @click="libOpen = !libOpen"><EditorIcon name="chevron_down" :size="12" :class="['tp-chev', { rot: !libOpen }]" /><span>{{ LIB_NAME }}</span></button>
        <template v-for="g in libOpen ? groups : []" :key="g.name">
          <div class="tp-g" role="presentation">{{ groupLabel(g.name) }}</div>
          <button
            v-for="{ t, i } in g.items"
            :id="`${uid}-${i}`"
            :key="t.id"
            :data-i="i"
            role="option"
            :aria-selected="t.id === bound"
            :class="['sq', 'menu-item', { on: t.id === bound, cur: active === i }]"
            :title="t.kind === 'color' ? t.name : `${t.name} · ${t.value}`"
            @click="choose(i)"
            @pointermove="active = i"
          >
            <span v-if="t.kind === 'color'" :class="['sqc', 'pv', 'sw', { al: alpha(t.color) }]"><i class="sq" :style="{ '--sq-fill': t.color }" /></span>
            <span v-else-if="t.kind === 'textStyle'" class="pv ts" data-preview :style="{ fontWeight: t.text!.weight ?? 400 }">Ag</span>
            <span v-else-if="t.kind === 'fontWeight'" class="pv ts" :style="{ fontWeight: t.num }">Ag</span>
            <span v-else-if="t.kind === 'shadow'" class="sq pv sh" :style="{ boxShadow: t.css }" />
            <EditorIcon v-else :name="KIND_ICON[t.kind] ?? 'var_number'" :size="16" class="pv" />
            <span v-if="t.kind === 'textStyle'" class="nm">{{ leaf(t.name) }}<span class="tsv"> · {{ t.value }}</span></span>
            <template v-else>
              <span class="nm">{{ leaf(t.name) }}</span>
              <span v-if="t.kind !== 'color'" class="vl">{{ t.value }}</span>
            </template>
          </button>
        </template>
        <span v-if="!items.length" class="tp-e">{{ isTS ? (q ? tr('No styles found') : tr('No text styles')) : q ? tr('No variables found') : tr('No {kind} variables', { kind: kindLabel.toLowerCase() }) }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 변수 버튼: 줄 끝 아이콘 버튼 24 · 아이콘 16. 누르는 아이콘 색 neutral-600 → 호버 · 열림 700 (PRD/08 색 규칙, 사용자 요청으로 한 단계 옅게) */
.eic { flex: none; display: block; }
.vb { width: 24px; height: 24px; color: var(--sys-color-neutral-600); }
.vb:hover, .vb.open { color: var(--sys-color-neutral-700); }
.vb.open { --sq-fill: var(--sys-color-neutral-300); }
/* 입력칸 안: 칸 오른쪽 안쪽 8 에 아이콘 끝이 오게(버튼 24 − 아이콘 16 = 4 를 당겨요). 칸에 올리거나 포커스가 있을 때만, 바로(애니메이션 없음) */
.vb.reveal { margin-right: calc(-1 * var(--ref-spacing-04)); opacity: 0; }
.fld:hover .vb.reveal, .fld:focus-within .vb.reveal, .vb.reveal.open, .vb.reveal:focus-visible { opacity: 1; }

/* 연결된 값: 입력칸 자리에 [칩(내용만큼, 넘치면 …)] — 칸에 올리면 오른쪽 끝에 연결 끊기 24 가 생기고 칩 글자는 그 앞에서 잘려요(피그마와 같아요) */
.tchip-w { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-04); }
.tchip { flex: 0 1 auto; min-width: 0; height: 20px; display: flex; align-items: center; padding: 0 var(--ref-spacing-05); margin-left: calc(-1 * var(--ref-spacing-02)); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--sys-color-neutral-400); --sq-line-w: 0.5px; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); text-align: left; }
.tchip:hover { --sq-line: var(--sys-color-neutral-500); }
.tchip.open { --sq-line: var(--iris-open-line); }
.tchip.mixed { color: var(--sys-color-neutral-600); }
.short .tchip { padding: 0 var(--ref-spacing-04); margin-left: 0; }
.tchip:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.tchip-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 칩 이름이 넘치면 앞을 줄여요(피그마: "…ight/600") — 뒤쪽 마디가 값을 구분해 줘요 */
.tchip-w .tchip-t { direction: rtl; text-align: left; }
.tchip-t > bdi { direction: ltr; unicode-bidi: isolate; }
/* 연결 끊기(피그마 ⛓ 분리): 바탕 없는 아이콘 버튼 24 · 아이콘 16, neutral-500 → 호버 800. 아이콘 끝이 칸 안쪽 8 에 맞게 −4 */
.tchip-caret { flex: none; width: 2px; min-width: 2px; height: 16px; padding: 0; margin-left: -2px; border: 0; outline: none; background: transparent; caret-color: var(--sys-color-brand-primary-default); color: transparent; }
.tchip:has(+ .tchip-caret:focus) { --sq-line: var(--sys-color-brand-primary-default); }
.tchip-x { flex: none; width: 24px; height: 24px; margin: 0 calc(-1 * var(--ref-spacing-04)) 0 auto; color: var(--sys-color-neutral-500); }
.tchip-x:hover { color: var(--sys-color-neutral-800); }
.fld:not(:hover):not(:focus-within) .tchip-x:not(:focus-visible) { display: none; }

.dd-l { min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-04); overflow: hidden; }
.dd-l > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 드롭다운(텍스트 스타일)에 연결된 값: 다른 칸과 같은 흰 칩 — 칩 자체는 버튼이 아니라 드롭다운 전체가 눌려요 */
.dd-chip { flex: 0 1 auto; }
.dd:hover .dd-chip { --sq-line: var(--ref-color-gray-900-20); }
.dd-v { flex: none; color: var(--sys-color-neutral-500); }
.ph { color: var(--sys-color-neutral-600); }
.muted { color: var(--sys-color-neutral-500); flex: none; }

/* 목록 카드 — 피그마 변수 창 그대로: 폭 240
   머리 40(검색 아이콘 16 · 글자 · 닫기 24, 아래 선) / 라이브러리 줄 44(아래 선) / 목록 위아래 8
   라이브러리 묶음 32(회색 바탕 · ▾ · 진하게) / 모음 이름 32(x 16) / 행 32(아이콘 x 24 · 이름 x 48 · 값 오른쪽 16, 칠은 창 끝까지)
   (body 로 옮겨져서 .editor 규칙을 받지 않아요: 값을 여기서 모두 정해요) */
.tp:focus { outline: none; }
.tp { position: fixed; right: auto; top: auto; width: 240px; z-index: 50; padding: 0; gap: 0; box-sizing: border-box; border-radius: var(--ref-radius-06); /* 테두리 · 그림자는 .menu 공통(= 사이드바 .float) 그대로 */ }
.tp-h { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); box-shadow: inset 0 -1px 0 var(--iris-line); cursor: text; }
.tp-hi { flex: none; color: var(--sys-color-neutral-700); }
.tp-h input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; font-family: var(--font-family-base); font-size: 12px; color: var(--sys-color-neutral-800); }
.tp-h input::placeholder { color: var(--sys-color-neutral-500); }
.tp-top { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); height: 44px; box-sizing: border-box; padding: 0 var(--ref-spacing-08) 0 var(--ref-spacing-06); box-shadow: inset 0 -1px 0 var(--iris-line); }
.tp-lib { width: 120px; flex: none; }
.tp-l { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; max-height: 360px; padding: var(--ref-spacing-06) 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.tp-l > * { flex: none; }
.tp-libh { display: flex; align-items: center; height: 32px; padding: 0 var(--ref-spacing-08) 0 var(--ref-spacing-02); border-radius: 0; --sq-fill: var(--sys-color-neutral-100); font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); text-align: left; }
.tp-libh:hover { --sq-fill: var(--sys-color-neutral-200); }
.tp-libh:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.tp-chev { flex: none; color: var(--sys-color-neutral-600); transition: transform 0.12s; }
.tp-chev.rot { transform: rotate(-90deg); }
.tp-g { display: flex; align-items: center; height: 32px; padding: 0 var(--ref-spacing-10); font-size: 12px; line-height: 18px; font-weight: 400; color: var(--sys-color-neutral-800); }
.tp-e { padding: var(--ref-spacing-06) var(--ref-spacing-10); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); }
.tp .menu-item { flex: none; height: 32px; min-height: 32px; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-10) 0 24px; border-radius: 0; font-size: 12px; line-height: 18px; font-weight: 400; color: var(--sys-color-neutral-800); transition: none; }
.tp .menu-item::before { transition: none; }
.tp .menu-item:hover, .tp .menu-item.cur { --sq-fill: var(--sys-color-neutral-100); }
/* 고른 행: 레이어 패널에서 고른 행과 같은 옅은 파랑(--iris-sel), 올려도 그대로 · 글자는 그대로 */
.tp .menu-item.on, .tp .menu-item.on:hover, .tp .menu-item.on.cur { --sq-fill: var(--iris-sel); color: var(--sys-color-neutral-800); font-weight: 400; }
.nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vl { flex: none; max-width: 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); font-variant-numeric: proportional-nums; }

.pv { flex: none; width: 16px; height: 16px; display: grid; place-items: center; color: var(--sys-color-neutral-500); }
.sw { position: relative; border-radius: var(--ref-radius-02); overflow: hidden; }
.sw.al { background: repeating-conic-gradient(var(--iris-paper) 0 25%, #D6D9DD 0 50%) 0 0 / 6px 6px; }
.sw i { position: absolute; inset: 0; --sq-line: var(--ref-color-gray-900-20); --sq-line-w: 0.5px; border-radius: inherit; }
.ts { width: 24px; height: auto; min-height: 18px; line-height: 1.2; color: var(--sys-color-neutral-800); font-family: var(--font-family-base); overflow: hidden; }
/* 글자 스타일이 걸린 칸(피그마): 흰 칸 · 0.5px 선 · 28h, [Ag(스타일 굵기) 이름 · 값]. 열면 파란 바탕 · 파란 선 · 파란 글자 */
.tsf { width: 100%; min-width: 0; height: 28px; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06); box-sizing: border-box; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); text-align: left; }
.tsf:hover { --sq-line: var(--sys-color-neutral-400); }
.tsf.open { --sq-line: var(--iris-open-line); }
.tsf:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.tsf-ag { flex: none; font-size: 14px; line-height: 18px; }
.tsf-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tsf-v { color: var(--sys-color-neutral-600); }
.tsf.open .tsf-v { color: inherit; }
.tsp-x { flex: none; width: 24px; height: 24px; color: var(--sys-color-neutral-700); }
.tsp .ts { width: 20px; font-size: 14px; line-height: 18px; }
.tsv { color: var(--sys-color-neutral-500); }

.sh { border-radius: var(--ref-radius-02); --sq-fill: var(--iris-paper); width: 12px; height: 12px; margin: 0 2px; }
</style>
