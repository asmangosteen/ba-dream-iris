<script setup lang="ts">
/** 우클릭 메뉴 그리기(편집기에 하나). 바깥 누르기 · Esc · 스크롤로 닫혀요. ↑↓ Home End 로 옮기고 Enter 로 실행, Esc 는 원래 자리로 초점을 돌려줘요 */
const { state, close } = useContextMenu()
const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
let back: HTMLElement | null = null
watch(state, async (s, prev) => {
  if (!s) return
  if (!prev) back = document.activeElement as HTMLElement | null
  pos.value = { x: s.x, y: s.y }
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  pos.value = { x: Math.max(8, Math.min(s.x, window.innerWidth - r.width - 8)), y: Math.max(8, Math.min(s.y, window.innerHeight - r.height - 8)) }
  el.value?.focus({ preventScroll: true })
})
const items = () => [...(el.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
function run(a: () => unknown) { close(); a() }
function onDoc(e: Event) { if (state.value && !el.value?.contains(e.target as Node)) close() }
function onKey(e: KeyboardEvent) {
  if (!state.value) return
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); back?.focus?.({ preventScroll: true }); return }
  if (e.key === 'Tab') { e.preventDefault(); close(); return }
  const list = items()
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
  <div v-if="state" ref="el" class="sq ctx" role="menu" aria-label="Context menu" tabindex="-1" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent @pointerleave="el?.focus({ preventScroll: true })">
    <template v-for="(it, i) in state.items" :key="i">
      <hr v-if="it === 'sep'" role="separator">
      <button v-else type="button" role="menuitem" tabindex="-1" :class="['sq', { danger: it.danger }]" :disabled="it.disabled" :aria-disabled="it.disabled || undefined" @click="run(it.action)" @pointerenter="($event.currentTarget as HTMLElement).focus({ preventScroll: true })"><span class="lb">{{ it.label }}</span><span v-if="it.shortcut" class="sc">{{ it.shortcut }}</span></button>
    </template>
  </div>
</template>

<style scoped>
/* 피그마 UI3 검은 메뉴: 안쪽 8 · 행 24 · 행 모서리 4(바깥 12 − 안쪽 8) · 단축키 흰 .7 · 비활성 .4 · 구분선은 8 칸 안 1px */
.ctx { outline: none; position: fixed; z-index: 100; min-width: 200px; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-06); --sq-fill: #1E1E1E; --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: #FFFFFF; filter: var(--iris-float-shadow); font-family: var(--font-family-base); font-size: 12px; line-height: 16px; }
button { display: flex; align-items: center; gap: var(--ref-spacing-10); width: 100%; height: 24px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-02); color: inherit; text-align: left; outline: none; }
button:hover:not(:disabled), button:focus-visible, button:focus:not(:disabled) { --sq-fill: var(--iris-select, #0D99FF); }
button:disabled { color: rgb(255 255 255 / 40%); cursor: default; }
button.danger:is(:hover, :focus):not(:disabled) { --sq-fill: #E5484D; }
.lb { flex: 1; white-space: nowrap; }
.sc { color: rgb(255 255 255 / 70%); white-space: nowrap; font-variant-numeric: tabular-nums; }
button:is(:hover, :focus):not(:disabled) .sc { color: #FFFFFF; }
hr { height: 1px; margin: 4px 0 3px; border: 0; background: rgb(255 255 255 / 12%); }
</style>
