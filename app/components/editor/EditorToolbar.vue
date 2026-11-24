<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'

/** 아래 도구 막대. 피그마처럼 묶음 버튼(프레임 · 섹션 / 도형 / 그리기)을 누르면 마지막 도구, ▾ 로 펼쳐서 고르기 */
export type Tool = 'move' | 'hand' | 'scale' | 'pen' | 'frame' | 'section' | 'rect' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'image' | 'pencil' | 'text'
const tool = defineModel<Tool>({ default: 'move' })
const emit = defineEmits<{ rail: [k: 'assets' | 'link' | 'figma' | 'comment'] }>()

interface Item { key: Tool; label: string; key2?: string; d?: string; icon?: string; fill?: boolean }
const ITEMS: Record<Tool, Item> = {
  move: { key: 'move', label: 'Move', key2: 'V', d: 'M3.5 2.2l9.3 4.6-4 1.3-1.4 4z', fill: true },
  scale: { key: 'scale', label: 'Scale', key2: 'K', d: 'M2.5 9.5v4h4M2.5 13.5l5-5M13.5 6.5v-4h-4M13.5 2.5l-5 5M9.5 13.5h4v-4' },
  hand: { key: 'hand', label: 'Hand tool', key2: 'H', d: 'M5.5 8V4.2a1 1 0 0 1 2 0V7.5M7.5 7V3.2a1 1 0 0 1 2 0V7M9.5 7V4.2a1 1 0 0 1 2 0V9.5c0 2.6-1.7 4.5-4.2 4.5-1.6 0-2.6-.7-3.5-2.1L2.4 9.6a1 1 0 0 1 1.6-1.2l1.5 1.6' },
  frame: { key: 'frame', label: 'Frame', key2: 'F', d: 'M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13' },
  section: { key: 'section', label: 'Section', key2: '⇧S', d: 'M2 5V3.5a1.5 1.5 0 0 1 1.5-1.5H7M10 2h2.5A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5V8' },
  rect: { key: 'rect', label: 'Rectangle', key2: 'R', d: 'M4.5 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z' },
  line: { key: 'line', label: 'Line', key2: 'L', d: 'M2.5 13.5l11-11' },
  arrow: { key: 'arrow', label: 'Arrow', key2: '⇧L', d: 'M2.5 13.5l11-11M7 2.5h6.5V9' },
  ellipse: { key: 'ellipse', label: 'Ellipse', key2: 'O', d: 'M8 2a6 6 0 1 0 0 12A6 6 0 1 0 8 2z' },
  polygon: { key: 'polygon', label: 'Polygon', d: 'M8 2l6.2 11H1.8z' },
  star: { key: 'star', label: 'Star', d: 'M8 1.6l1.9 4 4.4.6-3.2 3 .8 4.4L8 11.5l-3.9 2.1.8-4.4-3.2-3 4.4-.6z' },
  image: { key: 'image', label: 'Place image', key2: '⇧⌘K', icon: 'image' },
  pen: { key: 'pen', label: 'Pen', key2: 'P', d: 'M8 1.8l4.6 6.4L9.5 13H6.5L3.4 8.2zM8 1.8V8M6.5 13h3v1.5h-3z' },
  pencil: { key: 'pencil', label: 'Pencil', key2: '⇧P', d: 'M2.5 13.5l1-3.5 7.6-7.6a1.4 1.4 0 0 1 2 2L5.5 12z M9.8 3.7l2.5 2.5' },
  text: { key: 'text', label: 'Text', key2: 'T', d: 'M3 4.5V3h10v1.5M8 3v10M6 13h4' },
}
const GROUPS: { id: string; tools: Tool[] }[] = [
  { id: 'move', tools: ['move', 'hand', 'scale'] },
  { id: 'frame', tools: ['frame', 'section'] },
  // 이미지 · 영상은 캔버스에 끌어 놓거나 Fill 의 Image 칠로(피그마와 같아요). ⇧⌘K 로 파일 고르기는 그대로
  { id: 'shape', tools: ['rect', 'line', 'arrow', 'ellipse', 'polygon', 'star'] },
  { id: 'draw', tools: ['pen', 'pencil'] },
  { id: 'text', tools: ['text'] },
]
/** 묶음마다 마지막에 고른 도구 */
const last = reactive<Record<string, Tool>>({ move: 'move', frame: 'frame', shape: 'rect', draw: 'pen', text: 'text' })
watch(tool, (t) => { const g = GROUPS.find((x) => x.tools.includes(t)); if (g && t !== 'image') last[g.id] = t })
const open = ref<string | null>(null)
const tip = (it: Item) => (it.key2 ? `${it.label} (${it.key2})` : it.label)
function pick(t: Tool) { tool.value = t; open.value = null }

// 단축키: 피그마와 같아요
const KEYS: Record<string, Tool> = { v: 'move', h: 'hand', k: 'scale', p: 'pen', f: 'frame', a: 'frame', r: 'rect', l: 'line', o: 'ellipse', t: 'text' }
const SHIFT_KEYS: Record<string, Tool> = { s: 'section', l: 'arrow', p: 'pencil' }
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el.closest?.('input, textarea, [contenteditable="true"]')) return
  if (e.key === 'Escape' && open.value) { open.value = null; return }
  const k = e.key.toLowerCase()
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === 'k') { e.preventDefault(); tool.value = 'image'; return }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.shiftKey ? SHIFT_KEYS[k] : KEYS[k]
  if (t) tool.value = t
}
function onDoc(e: PointerEvent) { if (!(e.target as HTMLElement).closest?.('.grp-wrap')) open.value = null }
onMounted(() => { window.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onDoc, true) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDoc, true) })
</script>

<template>
  <div role="toolbar" aria-label="Tools" class="sq float s bar">
    <div v-for="g in GROUPS" :key="g.id" class="grp-wrap">
      <button
        :aria-label="tip(ITEMS[g.tools.includes(tool) ? tool : last[g.id]!])"
        :title="tip(ITEMS[g.tools.includes(tool) ? tool : last[g.id]!])"
        :aria-pressed="g.tools.includes(tool)"
        :class="['rail-btn', { on: g.tools.includes(tool) }]"
        @click="pick(g.tools.includes(tool) ? tool : last[g.id]!)"
      >
        <template v-for="it in [ITEMS[g.tools.includes(tool) ? tool : last[g.id]!]]" :key="it.key">
          <svg v-if="it.d" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="it.d" :fill="it.fill ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round" stroke-linecap="round" /></svg>
          <Icon v-else :name="it.icon!" :size="16" />
        </template>
      </button>
      <button v-if="g.tools.length > 1" class="sq more" :class="{ open: open === g.id }" :aria-label="`More ${g.id} tools`" :aria-expanded="open === g.id" @click="open = open === g.id ? null : g.id">
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
      </button>
      <div v-if="open === g.id" class="sq menu pop" role="menu">
        <button v-for="t in g.tools" :key="t" role="menuitemradio" :aria-checked="tool === t" :class="['sq', 'menu-item', { on: tool === t }]" @click="pick(t)">
          <svg v-if="ITEMS[t].d" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path :d="ITEMS[t].d" :fill="ITEMS[t].fill ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round" stroke-linecap="round" /></svg>
          <Icon v-else :name="ITEMS[t].icon!" :size="14" />
          <span class="grow">{{ ITEMS[t].label }}</span><span class="key">{{ ITEMS[t].key2 }}</span>
        </button>
      </div>
    </div>
    <span class="div" aria-hidden="true" />
    <button aria-label="Assets" title="Assets" class="rail-btn" @click="emit('rail', 'assets')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l6.2 6.2L8 14.2 1.8 8z" stroke="currentColor" stroke-width="1.33" fill="none" /></svg></button>
    <button aria-label="Link requirement" title="Link requirement" class="rail-btn" @click="emit('rail', 'link')"><Icon name="link" :size="16" /></button>
    <button aria-label="Import from Figma" title="Import from Figma" class="rail-btn" @click="emit('rail', 'figma')"><Icon name="arrow_up_right" :size="16" /></button>
    <button aria-label="Comments (coming soon)" title="Comments (coming soon)" class="rail-btn soon" @click="emit('rail', 'comment')"><Icon name="comment" :size="16" /></button>
  </div>
</template>

<style scoped>
.bar { position: absolute; bottom: var(--iris-gap); left: 50%; transform: translateX(-50%); height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); display: flex; align-items: center; gap: var(--ref-spacing-02); z-index: 3; }
.grp-wrap { position: relative; display: flex; align-items: center; }
.more { width: 12px; height: 32px; display: grid; place-items: center; color: var(--sys-color-neutral-500); border-radius: var(--ref-radius-02); }
.more:hover, .more.open { color: var(--sys-color-neutral-800); --sq-fill: var(--interaction-light-gray-hover); }
.pop { top: auto; bottom: calc(100% + 8px); left: 0; right: auto; min-width: 180px; }
.pop .menu-item { gap: var(--ref-spacing-05); }
.pop .menu-item svg, .pop .menu-item :deep(svg) { flex: none; }
.grow { flex: 1; }
.key { color: var(--sys-color-neutral-500); font-size: 11px; }
.menu-item.on { --sq-fill: var(--sys-color-neutral-100); }
.div { width: 1px; height: 20px; background: var(--iris-line-strong); margin: 0 var(--ref-spacing-02); }
.soon { color: var(--sys-color-neutral-400); }
.rail-btn.on:hover { --sq-overlay: rgb(13 45 87 / 15%); }
</style>
