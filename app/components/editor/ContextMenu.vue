<script setup lang="ts">
/**
 * 우클릭 메뉴 그리기(편집기에 하나). 바깥 누르기 · Esc · 스크롤로 닫혀요. ↑↓ Home End 로 옮기고 Enter 로 실행, Esc 는 원래 자리로 초점을 돌려줘요.
 * › 하위 메뉴(피그마 'Copy/Paste as' 처럼): 올리거나 누르거나 → 로 열고, ← · Esc 로 닫아 원래 줄로 돌아가요
 */
import type { MenuItem } from '~/composables/useContextMenu'
type Item = Exclude<MenuItem, 'sep'>
const { state, close } = useContextMenu()
const el = ref<HTMLElement | null>(null)
const subEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
/** 열린 하위 메뉴: 어느 줄의 것인지 · 자리 · 항목 */
const sub = ref<{ index: number; x: number; y: number; items: MenuItem[] } | null>(null)
let back: HTMLElement | null = null
watch(state, async (s, prev) => {
  sub.value = null
  if (!s) return
  if (!prev) back = document.activeElement as HTMLElement | null
  pos.value = { x: s.x, y: s.y }
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  pos.value = { x: Math.max(8, Math.min(s.x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(s.y, window.innerHeight - r.height - 8)) }
  el.value?.focus({ preventScroll: true })
})
/** 하위 메뉴 항목이 모두 꺼져 있으면 그 줄도 꺼요 */
const off = (it: Item) => !!it.disabled || (!!it.children && it.children.every((c) => c === 'sep' || c.disabled))
const buttons = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
function run(it: Item) { if (!it.action) return; close(); it.action() }
/** 하위 메뉴 열기: 그 줄 오른쪽(화면 밖이면 왼쪽), 첫 항목이 그 줄과 같은 높이 */
async function openSub(index: number, btn: HTMLElement, focusFirst = false) {
  const it = state.value?.items[index]
  if (!it || it === 'sep' || !it.children || off(it)) return
  const b = btn.getBoundingClientRect(), m = el.value!.getBoundingClientRect()
  if (sub.value?.index !== index) sub.value = { index, x: m.right + 2, y: b.top - 8, items: it.children.filter((x, i, a) => !(x === 'sep' && (i === 0 || a[i - 1] === 'sep' || i === a.length - 1))) }
  await nextTick()
  const r = subEl.value?.getBoundingClientRect()
  if (r && sub.value) {
    const x = m.right + 2 + r.width > window.innerWidth - 8 ? m.left - r.width - 2 : m.right + 2
    sub.value = { ...sub.value, x: Math.max(8, x), y: Math.max(8, Math.min(b.top - 8, window.innerHeight - r.height - 8)) }
  }
  if (focusFirst) buttons(subEl.value)[0]?.focus({ preventScroll: true })
}
function closeSub(refocus = false) {
  const i = sub.value?.index
  sub.value = null
  if (refocus && i !== undefined) el.value?.querySelector<HTMLButtonElement>(`button[data-i="${i}"]`)?.focus({ preventScroll: true })
}
function onEnter(it: Item, i: number, e: PointerEvent) {
  const btn = e.currentTarget as HTMLElement
  btn.focus({ preventScroll: true })
  if (it.children) void openSub(i, btn)
  else if (sub.value) closeSub()
}
function onClick(it: Item, i: number, e: MouseEvent) {
  if (it.children) { void openSub(i, e.currentTarget as HTMLElement, true); return }
  run(it)
}
function onDoc(e: Event) {
  if (!state.value) return
  const t = e.target as Node
  if (!el.value?.contains(t) && !subEl.value?.contains(t)) close()
}
function onKey(e: KeyboardEvent) {
  if (!state.value) return
  const inSub = !!sub.value && !!subEl.value?.contains(document.activeElement)
  if (e.key === 'Escape') {
    e.stopPropagation(); e.preventDefault()
    if (inSub) { closeSub(true); return }
    close(); back?.focus?.({ preventScroll: true }); return
  }
  if (e.key === 'Tab') { e.preventDefault(); close(); return }
  if (e.key === 'ArrowLeft' && inSub) { e.preventDefault(); e.stopPropagation(); closeSub(true); return }
  if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && !inSub) {
    const a = document.activeElement as HTMLElement | null
    const i = Number(a?.dataset.i)
    const it = Number.isFinite(i) ? state.value.items[i] : undefined
    if (a && it && it !== 'sep' && it.children) { e.preventDefault(); e.stopPropagation(); void openSub(i, a, true); return }
  }
  const list = buttons(inSub ? subEl.value : el.value)
  if (!list.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault(); e.stopPropagation()
  const i = list.indexOf(document.activeElement as HTMLButtonElement)
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : e.key === 'ArrowDown' ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1)
  list[n]!.focus()
}
onMounted(() => { window.addEventListener('pointerdown', onDoc, true); window.addEventListener('wheel', close, { passive: true }); window.addEventListener('keydown', onKey, true); window.addEventListener('blur', close) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', onDoc, true); window.removeEventListener('wheel', close); window.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', close) })
</script>

<template>
  <template v-if="state">
    <div ref="el" class="sq ctx" role="menu" :aria-label="tr('Context menu')" tabindex="-1" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent @pointerleave="!sub && el?.focus({ preventScroll: true })">
      <template v-for="(it, i) in state.items" :key="i">
        <hr v-if="it === 'sep'" role="separator">
        <button
          v-else type="button" role="menuitem" tabindex="-1" :data-i="i" :class="['sq', { danger: it.danger, open: sub?.index === i }]" :disabled="off(it)" :aria-disabled="off(it) || undefined"
          :aria-haspopup="it.children ? 'menu' : undefined" :aria-expanded="it.children ? sub?.index === i : undefined"
          @click="onClick(it, i, $event)" @pointerenter="onEnter(it, i, $event)"
        >
          <span class="lb"><EditorIcon v-if="it.icon?.name" class="mi" :name="it.icon.name" :size="16" /><svg v-else-if="it.icon" class="mi" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path v-if="it.icon.fill" :d="it.icon.fill" fill="currentColor" :fill-opacity="it.icon.soft ? 0.4 : undefined" fill-rule="evenodd" /><path v-if="it.icon.stroke" :d="it.icon.stroke" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ it.label }}</span>
          <EditorIcon v-if="it.children" class="arr" name="chevron_right" :size="12" />
          <span v-else-if="it.shortcut" class="sc">{{ it.shortcut }}</span>
        </button>
      </template>
    </div>
    <div v-if="sub" ref="subEl" class="sq ctx" role="menu" :aria-label="(state.items[sub.index] as Item | undefined)?.label" tabindex="-1" :style="{ left: sub.x + 'px', top: sub.y + 'px' }" @contextmenu.prevent>
      <template v-for="(it, i) in sub.items" :key="i">
        <hr v-if="it === 'sep'" role="separator">
        <button v-else type="button" role="menuitem" tabindex="-1" :class="['sq', { danger: it.danger }]" :disabled="it.disabled" :aria-disabled="it.disabled || undefined" @click="run(it)" @pointerenter="($event.currentTarget as HTMLElement).focus({ preventScroll: true })">
          <span class="lb">{{ it.label }}</span><span v-if="it.shortcut" class="sc">{{ it.shortcut }}</span>
        </button>
      </template>
    </div>
  </template>
</template>

<style scoped>
/* 피그마 UI3 검은 메뉴: 안쪽 8 · 행 24 · 모서리 바깥 12 · 행 6(다른 메뉴 · Text styles 창과 같아요, squircle 60%) · 단축키 흰 .7 · 비활성 .4 · 구분선은 8 칸 안 1px */
.ctx { outline: none; position: fixed; z-index: 100; min-width: 200px; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-06); --sq-fill: #1E1E1E; --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: #FFFFFF; filter: var(--iris-float-shadow); font-family: var(--font-family-base); font-size: 12px; line-height: 16px; }
button { display: flex; align-items: center; gap: var(--ref-spacing-10); width: 100%; height: 24px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); color: inherit; text-align: left; outline: none; }
/* 하위 메뉴가 열린 줄은 하위 메뉴로 옮겨 가도 칠해 둬요(피그마와 같아요) */
button:hover:not(:disabled), button:focus-visible, button:focus:not(:disabled), button.open { --sq-fill: var(--iris-select, #0E97FC); }
button:disabled { color: rgb(255 255 255 / 40%); cursor: default; }
button.danger:is(:hover, :focus):not(:disabled) { --sq-fill: #E5484D; }
.lb { flex: 1; display: flex; align-items: center; gap: var(--ref-spacing-06); white-space: nowrap; }
/* 이름 왼쪽 아이콘(불리언 메뉴 등) */
.mi { flex: none; }
.sc { color: rgb(255 255 255 / 70%); white-space: nowrap; font-variant-numeric: proportional-nums; }
button:is(:hover, :focus):not(:disabled) .sc { color: #FFFFFF; }
/* › 하위 메뉴 표시 */
.arr { flex: none; color: rgb(255 255 255 / 70%); }
button:is(:hover, :focus, .open):not(:disabled) .arr { color: #FFFFFF; }
hr { height: 1px; margin: 4px 0 3px; border: 0; background: rgb(255 255 255 / 12%); }
</style>
