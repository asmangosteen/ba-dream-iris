<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'

/** 편집기 기본 드롭다운 — 브라우저 <select> 대신 써요(PRD/07 §7.1 메뉴 규격을 Iris 흰 메뉴로).
    버튼은 .dd(28h · neutral-200), 메뉴는 아래(자리가 없으면 위)에 4px 띄워서. 고른 항목은 ✓ 칸, 묶음 사이는 구분선.
    키보드: ↑ ↓ 로 옮기고 Enter · Space 로 고르기, Esc 로 닫기. 열고 닫을 때 애니메이션 없음(피그마와 같아요) */
/** raw = 이 항목 글자는 번역하지 않기(글꼴 굵기 이름 · 이미 번역한 글자 등) */
/** person = 사람 고르기(코멘트 멘션처럼 앞에 프로필 사진), hint = 오른쪽 옅은 글자(예: 지금 역할 — 번역해서 보여 줘요) */
export interface SelectOption { value: string; label: string; short?: string; sep?: boolean; disabled?: boolean; raw?: boolean; person?: { name: string; src?: string | null }; hint?: string }
/** variant: field = 칸 모양 드롭다운(기본) · inline = 입력칸 안의 작은 글자 버튼(W 칸의 Hug ▾) · icon = 24 아이콘 버튼(슬롯) */
/** 글자(label · short · placeholder · ariaLabel)는 부모가 영어 원문으로 넘기고 여기서 지금 언어로 바꿔요. raw = 사용자 · 컴포넌트 값이라 번역하지 않기 */
const props = withDefaults(defineProps<{ modelValue: string | null | undefined; options: readonly SelectOption[]; ariaLabel?: string; placeholder?: string; variant?: 'field' | 'inline' | 'icon'; raw?: boolean }>(), { variant: 'field', placeholder: undefined, ariaLabel: '', raw: false })
const L = (s: string | undefined, raw = false) => (s && !props.raw && !raw ? tr(s) : s)
/** 사람 고르기 메뉴(프로필 사진이 있는 항목): 줄을 32 로 — 코멘트 멘션 목록과 같아요 */
const hasPeople = computed(() => props.options.some((o) => !!o.person))
/** 아직 아무것도 안 골랐으면 ✓ 칸을 비워 두지 않아요(왼쪽 빈자리 없이) */
const hasPick = computed(() => props.options.some((o) => o.value === props.modelValue))
const aria = computed(() => L(props.ariaLabel) ?? '')
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const open = ref(false)
const up = ref(false)
const active = ref(-1)
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
/** 메뉴 바깥 상자(자리 맞추기 · 포커스 확인) — 스크롤은 안쪽 list 만 */
const menuEl = ref<HTMLElement | null>(null)
const uid = useId()
/** 메뉴를 닫을 때 포커스를 버튼으로 돌려줘요(항목을 눌러 포커스가 메뉴 안으로 갔을 때도) */
const focusTrigger = () => (root.value?.querySelector(':scope > button') as HTMLElement | null)?.focus()
const current = computed(() => props.options.find((o) => o.value === props.modelValue))

function toggle() { open.value ? close() : show() }
/** 메뉴가 사이드바 · 설정 창 밖으로 나가면(오른쪽 칸의 메뉴 등) 안쪽 8 에 맞게 당겨요 — 밖으로 나가면 패널이 옆으로 밀려 스크롤돼요 */
const shift = ref<Record<string, string>>({})
function fit() {
  const m = menuEl.value
  if (!m) return
  const box = root.value?.closest('aside, [role="dialog"], .float')?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth }
  const r = m.getBoundingClientRect()
  const lo = box.left + 8, hi = box.right - 8
  const room = hi - lo
  const st: Record<string, string> = {}
  if (r.width > room) { st.maxWidth = room + 'px'; st.minWidth = '0' }
  const w = Math.min(r.width, room)
  let dx = 0
  if (r.left + w > hi) dx = hi - (r.left + w)
  if (r.left + dx < lo) dx = lo - r.left
  if (dx) st.transform = `translateX(${Math.round(dx)}px)`
  shift.value = st
}
function show() {
  const r = root.value?.getBoundingClientRect()
  // 아래 자리가 메뉴(행 28 × 개수 + 안쪽 여백)보다 좁으면 위로
  const need = Math.min(320, props.options.length * 28 + 8)
  up.value = !!r && window.innerHeight - r.bottom < need + 12 && r.top > window.innerHeight - r.bottom
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  shift.value = {}
  open.value = true
  // 자리를 먼저 맞추고(한 번 더 그린 뒤) 고른 항목으로 스크롤 — 순서가 바뀌면 밖으로 나간 메뉴 때문에 패널이 옆으로 밀려요
  nextTick(() => {
    fit()
    nextTick(() => {
      (list.value?.querySelector('.on') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' })
      // 패널은 가로로 스크롤하지 않아요(소수점 폭 차이로 1px 밀리는 것까지 되돌려요)
      const host = root.value?.closest('aside, [role="dialog"]') as HTMLElement | null
      if (host?.scrollLeft) host.scrollLeft = 0
    })
  })
}
function close(refocus = false) {
  if (!open.value) return
  const inside = !!menuEl.value?.contains(document.activeElement)
  open.value = false
  if (refocus || inside) focusTrigger()
}
function pick(o: SelectOption) {
  if (o.disabled) return
  close(true)
  if (o.value !== props.modelValue) emit('update:modelValue', o.value)
}
function move(d: number) {
  const n = props.options.length
  for (let i = 1; i <= n; i++) {
    const k = (((active.value + d * i) % n) + n) % n
    if (!props.options[k]!.disabled) { active.value = k; break }
  }
  nextTick(() => (list.value?.children[active.value] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }))
}
function onKey(e: KeyboardEvent) {
  // 메뉴가 다루는 키는 캔버스 단축키(↑↓ 이동 · Enter 자식 고르기 · Esc 선택 해제)로 새지 않게 막아요
  const mine = ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End', 'Escape']
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); show() }
    return
  }
  if (mine.includes(e.key)) e.stopPropagation()
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); active.value = e.key === 'Home' ? -1 : props.options.length; move(e.key === 'Home' ? 1 : -1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = props.options[active.value]; if (o) pick(o) }
  else if (e.key === 'Tab') close()
}
function onDoc(e: PointerEvent) { if (open.value && !root.value?.contains(e.target as Node)) close() }
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))
</script>

<template>
  <div ref="root" :class="['esel', { 'is-inl': variant === 'inline' }]" @keydown="onKey">
    <button v-if="variant === 'field'" type="button" :class="['sq', 'dd', { open }]" :aria-label="aria" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? uid : undefined" :aria-activedescendant="open && active >= 0 ? `${uid}-${active}` : undefined" @click="toggle">
      <slot name="lead" />
      <MemberAvatar v-if="current?.person" :name="current.person.name" :src="current.person.src" :size="20" class="pav" />
      <span :class="['v', { ph: !current }]">{{ L(current?.label ?? placeholder, current?.raw) ?? '' }}</span>
      <EditorIcon name="chevron_down" :size="12" class="cv" />
    </button>
    <button v-else-if="variant === 'inline'" type="button" :class="['sq', 'inl', { open, empty: !(current?.short ?? current?.label ?? placeholder) }]" :aria-label="aria" :data-tip="aria" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? uid : undefined" :aria-activedescendant="open && active >= 0 ? `${uid}-${active}` : undefined" @click.stop.prevent="toggle">
      <span class="v">{{ L(current ? (current.short ?? current.label) : placeholder, current?.raw) ?? '' }}</span>
      <EditorIcon name="chevron_down" :size="12" class="cv" />
    </button>
    <button v-else type="button" :class="['ib', 's24', { on: open }]" :aria-label="aria" :data-tip="aria" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? uid : undefined" :aria-activedescendant="open && active >= 0 ? `${uid}-${active}` : undefined" @click="toggle"><slot /></button>
    <!-- 바깥(검은 바탕 · 테두리)은 그대로, 안쪽 목록만 스크롤 — 바탕을 그리는 ::before 가 내용과 함께 스크롤되어 아래 행이 바탕 밖으로 튀어나오던 문제 -->
    <div v-if="open" :id="uid" ref="menuEl" :class="['sq', 'menu', 'esel-m', { up, right: variant === 'icon', 'm-inl': variant === 'inline', people: hasPeople }]" :style="shift" role="listbox" :aria-label="aria">
      <div ref="list" class="menu-sc esel-sc">
      <template v-for="(o, i) in options" :key="o.value">
        <div v-if="o.sep && i > 0" class="msep" role="separator" />
        <button
          :id="`${uid}-${i}`"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="o.value === modelValue"
          :disabled="o.disabled"
          :class="['sq', 'menu-item', { on: o.value === modelValue, kb: i === active }]"
          @pointerenter="active = i"
          @click="pick(o)"
        >
          <span v-if="hasPick" class="ck" aria-hidden="true"><EditorIcon v-if="o.value === modelValue" name="check" :size="12" /></span>
          <MemberAvatar v-if="o.person" :name="o.person.name" :src="o.person.src" :size="20" class="pav" />
          <span class="l">{{ L(o.label, o.raw) }}</span>
          <span v-if="o.hint" class="hint">{{ L(o.hint) }}</span>
        </button>
      </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.esel { position: relative; min-width: 0; }
.dd .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dd .v.ph { color: var(--sys-color-neutral-500); }
.dd .cv { flex: none; color: var(--sys-color-neutral-500); }
.esel-m { font-weight: 400; text-align: left; bottom: auto; height: auto; left: 0; right: auto; min-width: 100%; width: max-content; max-width: 240px; }
/* 칸 모양 드롭다운의 메뉴는 칸과 같은 폭에서 시작(안쪽 여백까지 폭에 넣어요 — 전엔 여백 16 만큼 넓었어요), 글자가 더 길 때만 넓어져요(잘리지 않게) — 서비스 공통 */
.esel-m { box-sizing: border-box; }
/* 스크롤은 안쪽만(.menu-sc, main.css) — 바깥 높이 최대 320(안쪽 여백 8 · 8 빼고 304) */
.esel-sc { max-height: 304px; }
.esel-m.up { top: auto; bottom: calc(100% + 4px); }
.esel-m.right { left: auto; right: 0; min-width: 160px; }
/* 칸 안 글자 버튼의 메뉴는 칸(.fld) 왼쪽 끝 · 아래에 맞춰 열려요 */
.esel.is-inl { position: static; flex: none; }
.esel-m.m-inl { left: 0; right: auto; min-width: 160px; }
/* 입력칸 안 글자 버튼: 평소엔 "Hug" 처럼 방식만, 칸에 올리면 ▾ 가 보여요(피그마 W/H) */
.inl { display: flex; align-items: center; gap: 2px; height: 20px; padding: 0 2px; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-800); font-size: 12px; white-space: nowrap; }
.inl .cv { color: var(--sys-color-neutral-500); display: none; }
.inl.empty .v { display: none; }
.fld:hover .inl .cv, .inl.open .cv, .inl:focus-visible .cv { display: block; }
/* 칸 안에선 글자 버튼을 최소로(숫자 자리를 먼저) */
.inl { flex: none; }
.inl:hover, .inl.open { --sq-fill: var(--interaction-light-gray-hover); }
.esel-m .menu-item { gap: var(--ref-spacing-04); }
.esel-m .menu-item.kb:not(:disabled) { --sq-fill: var(--sys-color-neutral-100); }
.ck { flex: none; width: 12px; height: 12px; color: var(--sys-color-neutral-800); }
/* 아이콘 버튼(☰ 등)이 메뉴를 연 동안: 눌린 표시 */
.ib.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.l { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: var(--ref-spacing-06); }
/* 사람 고르기: 프로필 20 + 이름 + 오른쪽 옅은 역할(코멘트 멘션 목록과 같아요) */
.pav { flex: none; }
.esel-m.people .menu-item { height: 32px !important; min-height: 32px; gap: var(--ref-spacing-06); }
.dd .pav { margin-left: calc(-1 * var(--ref-spacing-02)); }
.hint { flex: none; padding-right: var(--ref-spacing-04); opacity: .6; }
</style>
