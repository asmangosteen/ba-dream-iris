<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'

export type Tool = 'move' | 'frame' | 'rect' | 'text' | 'image'
const tool = defineModel<Tool>({ default: 'move' })
const tools: { key: Tool; label: string; d?: string; icon?: string }[] = [
  { key: 'move', label: '이동 (V)', d: 'M3.5 2.2l9.3 4.6-4 1.3-1.4 4z' },
  { key: 'frame', label: '프레임 (F)', d: 'M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13' },
  { key: 'rect', label: '사각형 (R)', d: 'M2.5 2.5h11v11h-11z' },
  { key: 'text', label: '텍스트 (T)', d: 'M3 4.5V3h10v1.5M8 3v10M6 13h4' },
  { key: 'image', label: '이미지', icon: 'image' },
]
const KEYS: Record<string, Tool> = { v: 'move', f: 'frame', r: 'rect', t: 'text' }
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, [contenteditable]')) return
  const t = KEYS[e.key.toLowerCase()]
  if (t) tool.value = t
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div role="toolbar" aria-label="도구" class="sq float s bar">
    <button v-for="t in tools" :key="t.key" :aria-label="t.label" :aria-pressed="tool === t.key" :class="['rail-btn', { on: tool === t.key }]" @click="tool = t.key">
      <svg v-if="t.d" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="t.d" :fill="t.key === 'move' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" /></svg>
      <Icon v-else :name="t.icon!" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.bar { position: absolute; bottom: var(--iris-gap); left: 50%; transform: translateX(-50%); height: 40px; box-sizing: border-box; padding: var(--ref-spacing-02) var(--ref-spacing-04); display: flex; align-items: center; gap: var(--ref-spacing-02); z-index: 3; }
</style>
