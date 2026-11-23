<script setup lang="ts">
/** 우클릭 메뉴 그리기(편집기에 하나). 바깥 누르기 · Esc · 스크롤로 닫혀요 */
const { state, close } = useContextMenu()
const el = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
watch(state, async (s) => {
  if (!s) return
  pos.value = { x: s.x, y: s.y }
  await nextTick()
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  pos.value = { x: Math.min(s.x, window.innerWidth - r.width - 8), y: Math.min(s.y, window.innerHeight - r.height - 8) }
  el.value?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
})
function run(a: () => unknown) { close(); a() }
function onDoc(e: Event) { if (state.value && !el.value?.contains(e.target as Node)) close() }
function onKey(e: KeyboardEvent) { if (state.value && e.key === 'Escape') { e.stopPropagation(); close() } }
onMounted(() => { window.addEventListener('pointerdown', onDoc, true); window.addEventListener('wheel', close, { passive: true }); window.addEventListener('keydown', onKey, true); window.addEventListener('blur', close) })
onBeforeUnmount(() => { window.removeEventListener('pointerdown', onDoc, true); window.removeEventListener('wheel', close); window.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', close) })
</script>

<template>
  <div v-if="state" ref="el" class="ctx" role="menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent>
    <template v-for="(it, i) in state.items" :key="i">
      <hr v-if="it === 'sep'">
      <button v-else role="menuitem" :class="{ danger: it.danger }" :disabled="it.disabled" @click="run(it.action)"><span class="lb">{{ it.label }}</span><span v-if="it.shortcut" class="sc">{{ it.shortcut }}</span></button>
    </template>
  </div>
</template>

<style scoped>
.ctx { position: fixed; z-index: 100; min-width: 220px; padding: 6px; border-radius: 12px; background: #1E1E1E; color: #FFFFFF; box-shadow: 0 2px 6px rgb(0 0 0 / 20%), 0 10px 32px rgb(0 0 0 / 28%); font-family: var(--font-family-base); font-size: 12px; }
button { display: flex; align-items: center; gap: 16px; width: 100%; height: 26px; padding: 0 10px; border-radius: 6px; color: inherit; text-align: left; }
button:hover:not(:disabled), button:focus-visible { background: var(--iris-select, #0D99FF); outline: none; }
button:disabled { color: rgb(255 255 255 / 35%); }
button.danger:hover:not(:disabled) { background: #E5484D; }
.lb { flex: 1; white-space: nowrap; }
.sc { color: rgb(255 255 255 / 55%); white-space: nowrap; }
button:hover:not(:disabled) .sc { color: rgb(255 255 255 / 85%); }
hr { height: 1px; margin: 5px 4px; border: 0; background: rgb(255 255 255 / 12%); }
</style>
