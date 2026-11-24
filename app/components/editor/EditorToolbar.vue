<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/** 아래 도구 막대. 피그마처럼 묶음 버튼(프레임 · 섹션 / 도형 / 그리기)을 누르면 마지막 도구, ▾ 로 펼쳐서 고르기 */
export type Tool = 'move' | 'hand' | 'scale' | 'pen' | 'frame' | 'section' | 'rect' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'image' | 'pencil' | 'text'
const tool = defineModel<Tool>({ default: 'move' })
const emit = defineEmits<{ rail: [k: 'assets' | 'link' | 'figma' | 'comment'] }>()

interface Item { key: Tool; label: string; key2?: string; d?: string; icon?: string; fill?: boolean }
const ITEMS: Record<Tool, Item> = {
  move: { key: 'move', label: 'Move', key2: 'V', d: 'M3.5 2.5l9 4.4-3.9 1.5-1.5 3.9z' },
  scale: { key: 'scale', label: 'Scale', key2: 'K', d: 'M2.5 9.5v4h4M2.5 13.5l5-5M13.5 6.5v-4h-4M13.5 2.5l-5 5M9.5 13.5h4v-4' },
  hand: { key: 'hand', label: 'Hand tool', key2: 'H', d: 'M5.5 8V4.2a1 1 0 0 1 2 0V7.5M7.5 7V3.2a1 1 0 0 1 2 0V7M9.5 7V4.2a1 1 0 0 1 2 0V9.5c0 2.6-1.7 4.5-4.2 4.5-1.6 0-2.6-.7-3.5-2.1L2.4 9.6a1 1 0 0 1 1.6-1.2l1.5 1.6' },
  frame: { key: 'frame', label: 'Frame', key2: 'F', d: 'M5.5 2v12M10.5 2v12M2 5.5h12M2 10.5h12' },
  section: { key: 'section', label: 'Section', key2: '⇧S', d: 'M2.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3M10 2.5h2a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V8.5' },
  rect: { key: 'rect', label: 'Rectangle', key2: 'R', d: 'M4.5 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z' },
  line: { key: 'line', label: 'Line', key2: 'L', d: 'M2.5 13.5l11-11' },
  arrow: { key: 'arrow', label: 'Arrow', key2: '⇧L', d: 'M2.5 13.5l11-11M7 2.5h6.5V9' },
  ellipse: { key: 'ellipse', label: 'Ellipse', key2: 'O', d: 'M8 2.5a5.5 5.5 0 1 0 0 11A5.5 5.5 0 1 0 8 2.5z' },
  polygon: { key: 'polygon', label: 'Polygon', d: 'M8 2.5l5.8 10.5H2.2z' },
  star: { key: 'star', label: 'Star', d: 'M8 1.6l1.9 4 4.4.6-3.2 3 .8 4.4L8 11.5l-3.9 2.1.8-4.4-3.2-3 4.4-.6z' },
  image: { key: 'image', label: 'Image/video…', key2: '⇧⌘K', icon: 'image' },
  pen: { key: 'pen', label: 'Pen', key2: 'P', d: 'M8 1.8l4.6 6.4L9.5 13H6.5L3.4 8.2zM8 1.8V8M6.5 13h3v1.5h-3z' },
  pencil: { key: 'pencil', label: 'Pencil', key2: '⇧P', d: 'M2.5 13.5l1-3.5 7.6-7.6a1.4 1.4 0 0 1 2 2L5.5 12z M9.8 3.7l2.5 2.5' },
  text: { key: 'text', label: 'Text', key2: 'T', d: 'M3 4.5V3h10v1.5M8 3v10M6 13h4' },
}
const GROUPS: { id: string; tools: Tool[] }[] = [
  { id: 'move', tools: ['move', 'hand', 'scale'] },
  { id: 'frame', tools: ['frame', 'section'] },
  // 피그마 UI3 처럼 도형 묶음 맨 아래에 Image/video…(⇧⌘K). 끌어 놓기 · Fill 의 Image 칠도 그대로
  { id: 'shape', tools: ['rect', 'line', 'arrow', 'ellipse', 'polygon', 'star', 'image'] },
  { id: 'draw', tools: ['pen', 'pencil'] },
  { id: 'text', tools: ['text'] },
]
/** 묶음마다 마지막에 고른 도구 */
const last = reactive<Record<string, Tool>>({ move: 'move', frame: 'frame', shape: 'rect', draw: 'pen', text: 'text' })
watch(tool, (t) => { const g = GROUPS.find((x) => x.tools.includes(t)); if (g && t !== 'image') last[g.id] = t })
const open = ref<string | null>(null)
const GROUP_LABEL: Record<string, string> = { move: 'Move', frame: 'Region', shape: 'Shape', draw: 'Creation', text: 'Type' }
const tip = (it: Item) => (it.key2 ? `${it.label} (${it.key2})` : it.label)
/** 묶음 버튼에 보이는 도구: 지금 고른 도구가 이 묶음이면 그것, 아니면 마지막에 쓴 것(Image 는 한 번 쓰고 돌아와서 제외) */
const shown = (g: { id: string; tools: Tool[] }) => ITEMS[g.tools.includes(tool.value) && tool.value !== 'image' ? tool.value : last[g.id]!]
function pick(t: Tool) { tool.value = t; open.value = null }
/** 펼침 메뉴 키보드: 열면 지금 도구에 초점, ↑↓ Home End 로 옮기고 Esc · Tab 으로 닫아요(Esc 는 ▾ 로 초점을 돌려줘요) */
const root = ref<HTMLElement | null>(null)
async function toggle(id: string, focusIn = false) {
  open.value = open.value === id ? null : id
  if (!open.value) return
  await nextTick()
  const m = root.value?.querySelector<HTMLElement>('.pop')
  const at = m?.querySelector<HTMLElement>('[aria-checked="true"]') ?? m?.querySelector<HTMLElement>('.menu-item')
  if (focusIn) at?.focus()
}
function onChevKey(e: KeyboardEvent, id: string) {
  if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); if (open.value !== id) toggle(id, true); else root.value?.querySelector<HTMLElement>('.pop .menu-item')?.focus() }
}
function onMenuKey(e: KeyboardEvent, id: string) {
  const list = [...(root.value?.querySelectorAll<HTMLElement>('.pop .menu-item') ?? [])]
  const i = list.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open.value = null; root.value?.querySelector<HTMLElement>(`[data-grp="${id}"]`)?.focus(); return }
  if (e.key === 'Tab') { open.value = null; return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !list.length) return
  e.preventDefault(); e.stopPropagation()
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : e.key === 'ArrowDown' ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1)
  list[n]!.focus()
}

// 단축키: 피그마와 같아요
const KEYS: Record<string, Tool> = { v: 'move', h: 'hand', k: 'scale', p: 'pen', f: 'frame', a: 'frame', r: 'rect', l: 'line', o: 'ellipse', t: 'text' }
const SHIFT_KEYS: Record<string, Tool> = { s: 'section', l: 'arrow', p: 'pencil' }
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el.closest?.('input, textarea, [contenteditable="true"]')) return
  if (e.key === 'Escape' && open.value) { open.value = null; return }
  // 자판 위치(KeyV)로 찾아요 — 한글 입력 상태에서는 e.key 가 'ㅍ' 처럼 와서 글자로는 못 찾아요(피그마와 같게)
  const k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
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
  <div ref="root" role="toolbar" aria-label="Tools" aria-orientation="horizontal" class="sq float s bar">
    <div v-for="g in GROUPS" :key="g.id" class="grp-wrap">
      <button
        :aria-label="tip(shown(g))"
        :data-tip="shown(g).label"
        :data-tip-key="shown(g).key2"
        data-tip-at="top"
        :aria-pressed="g.tools.includes(tool)"
        type="button"
        :class="['rail-btn', { on: g.tools.includes(tool) }]"
        @click="pick(shown(g).key)"
      >
        <template v-for="it in [shown(g)]" :key="it.key">
          <svg v-if="it.d" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><path :d="it.d" :fill="it.fill ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round" stroke-linecap="round" /></svg>
          <EditorIcon v-else :name="it.icon!" :size="20" />
        </template>
      </button>
      <button v-if="g.tools.length > 1" type="button" class="sq more" :class="{ open: open === g.id }" :data-grp="g.id" :aria-label="`${GROUP_LABEL[g.id]} tools`" :data-tip="`${GROUP_LABEL[g.id]} tools`" data-tip-at="top" aria-haspopup="menu" :aria-expanded="open === g.id" @click="toggle(g.id, $event.detail === 0)" @keydown="onChevKey($event, g.id)">
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1.75 3l2.25 2.25L6.25 3" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div v-if="open === g.id" class="sq menu pop" role="menu" :aria-label="`${GROUP_LABEL[g.id]} tools`" @keydown="onMenuKey($event, g.id)">
        <button v-for="t in g.tools" :key="t" type="button" role="menuitemradio" :aria-checked="tool === t" :class="['sq', 'menu-item', { on: tool === t }]" @click="pick(t)">
          <svg class="ck" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path v-if="t === shown(g).key" d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-if="ITEMS[t].d" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="ITEMS[t].d" :fill="ITEMS[t].fill ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round" stroke-linecap="round" /></svg>
          <EditorIcon v-else :name="ITEMS[t].icon!" :size="16" />
          <span class="grow">{{ ITEMS[t].label }}</span><span v-if="ITEMS[t].key2" class="key">{{ ITEMS[t].key2 }}</span>
        </button>
      </div>
    </div>
    <span class="div" aria-hidden="true" />
    <button type="button" aria-label="Assets" data-tip="Assets" data-tip-at="top" class="rail-btn" @click="emit('rail', 'assets')"><EditorIcon name="component" :size="20" /></button>
    <button type="button" aria-label="Link requirement" data-tip="Link requirement" data-tip-at="top" class="rail-btn" @click="emit('rail', 'link')"><EditorIcon name="link" :size="20" /></button>
    <button type="button" aria-label="Import from Figma" data-tip="Import from Figma" data-tip-at="top" class="rail-btn" @click="emit('rail', 'figma')"><EditorIcon name="arrow_up_right" :size="20" /></button>
    <button type="button" aria-label="Comments (coming soon)" aria-disabled="true" data-tip="Comments" data-tip-key="Soon" data-tip-at="top" class="rail-btn soon" @click="emit('rail', 'comment')"><EditorIcon name="comment" :size="20" /></button>
  </div>
</template>

<style scoped>
/* 피그마 UI3 도구 막대: 높이 48 · 안쪽 8 · 묶음 사이 8 · 도구 32 + ▾ 16(붙어 있음 1px) · 칸막이는 위아래 끝까지 */
.bar { position: absolute; bottom: var(--iris-gap); left: 50%; transform: translateX(-50%); height: 48px; box-sizing: border-box; padding: 0 var(--ref-spacing-06); display: flex; align-items: center; gap: var(--ref-spacing-06); z-index: 3; }
.grp-wrap { position: relative; display: flex; align-items: center; gap: 1px; }
.more { width: 16px; height: 32px; display: grid; place-items: center; color: var(--sys-color-neutral-500); border-radius: var(--ref-radius-02); }
.more:hover, .more.open { color: var(--sys-color-neutral-800); --sq-fill: var(--interaction-light-gray-hover); }
.more:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* 펼침 메뉴: 막대 위 4px, 묶음 버튼 왼쪽 끝에 맞춤. ✓ 칸 · 아이콘 · 이름 · 단축키 */
.pop { top: auto; bottom: calc(100% + 12px); left: 0; right: auto; min-width: 200px; padding: var(--ref-spacing-04); }
.pop .menu-item { gap: var(--ref-spacing-04); height: 28px; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-04); }
.pop .menu-item svg, .pop .menu-item :deep(svg) { flex: none; }
.ck { color: var(--sys-color-neutral-800); }
.grow { flex: 1; padding-left: var(--ref-spacing-02); }
.key { color: var(--sys-color-neutral-500); font-size: 11px; padding-left: var(--ref-spacing-10); }
/* 지금 도구 행: 공용 드롭다운과 같이 ✓ + 500, 바탕 · 글자색은 그대로(전역 .menu-item.on 의 파란 바탕 · 600 을 덮어요) */
.pop .menu-item.on { --sq-fill: transparent; color: var(--sys-color-neutral-800); font-weight: 500; }
.pop .menu-item:hover { --sq-fill: var(--sys-color-neutral-100); }
.pop .menu-item:focus-visible { outline-offset: -2px; }
.div { width: 1px; align-self: stretch; background: var(--iris-line-strong); }
/* 준비 중: 늘 흐린 색(호버해도 진해지지 않게) */
.rail-btn.soon, .rail-btn.soon:hover { color: var(--sys-color-neutral-400); cursor: default; }
.rail-btn.on:hover { --sq-overlay: rgb(13 45 87 / 15%); }
</style>
