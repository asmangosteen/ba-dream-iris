<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'

export type Tool = 'move' | 'hand' | 'frame' | 'rect' | 'text' | 'image'
const tool = defineModel<Tool>({ default: 'move' })
const emit = defineEmits<{ rail: [k: 'assets' | 'link' | 'figma' | 'comment'] }>()
const tools: { key: Tool; label: string; d?: string; icon?: string }[] = [
  { key: 'move', label: '이동 (V)', d: 'M3.5 2.2l9.3 4.6-4 1.3-1.4 4z' },
  { key: 'hand', label: '손 (H) · 끌어서 캔버스 이동', d: 'M5.5 8V4.2a1 1 0 0 1 2 0V7.5M7.5 7V3.2a1 1 0 0 1 2 0V7M9.5 7V4.2a1 1 0 0 1 2 0V9.5c0 2.6-1.7 4.5-4.2 4.5-1.6 0-2.6-.7-3.5-2.1L2.4 9.6a1 1 0 0 1 1.6-1.2l1.5 1.6' },
  { key: 'frame', label: '프레임 (F)', d: 'M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13' },
  { key: 'rect', label: '사각형 (R)', d: 'M4.5 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z' },
  { key: 'text', label: '텍스트 (T)', d: 'M3 4.5V3h10v1.5M8 3v10M6 13h4' },
  { key: 'image', label: '이미지', icon: 'image' },
]
const KEYS: Record<string, Tool> = { v: 'move', h: 'hand', f: 'frame', a: 'frame', r: 'rect', t: 'text' }
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || el.closest?.('input, textarea, [contenteditable]')) return
  const t = KEYS[e.key.toLowerCase()]
  if (t) tool.value = t
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div role="toolbar" aria-label="도구" class="sq float s bar">
    <button v-for="t in tools" :key="t.key" :aria-label="t.label" :title="t.label" :aria-pressed="tool === t.key" :class="['rail-btn', { on: tool === t.key }]" @click="tool = t.key">
      <svg v-if="t.d" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="t.d" :fill="t.key === 'move' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" /></svg>
      <Icon v-else :name="t.icon!" :size="16" />
    </button>
    <span class="div" aria-hidden="true" />
    <button aria-label="에셋 열기" title="에셋 열기" class="rail-btn" @click="emit('rail', 'assets')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.2 6.2L8 14.2 1.8 8z" stroke="currentColor" stroke-width="1.33" fill="none" /></svg></button>
    <button aria-label="요구사항 연결" title="요구사항 연결" class="rail-btn" @click="emit('rail', 'link')"><Icon name="link" :size="16" /></button>
    <button aria-label="피그마 화면 가져오기" title="피그마 화면 가져오기" class="rail-btn" @click="emit('rail', 'figma')"><Icon name="arrow_up_right" :size="16" /></button>
    <button aria-label="코멘트 (준비 중)" title="코멘트 (준비 중)" class="rail-btn soon" @click="emit('rail', 'comment')"><Icon name="comment" :size="16" /></button>
  </div>
</template>

<style scoped>
.bar { position: absolute; bottom: var(--iris-gap); left: 50%; transform: translateX(-50%); height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); display: flex; align-items: center; gap: var(--ref-spacing-02); z-index: 3; }
.div { width: 1px; height: 20px; background: var(--iris-line-strong); margin: 0 var(--ref-spacing-02); }
.soon { color: var(--sys-color-neutral-400); }
.rail-btn.on:hover { --sq-overlay: rgb(13 45 87 / 15%); }
</style>
