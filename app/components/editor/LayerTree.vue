<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { isContainer, type LayerNode } from '~/canvas/schema'
import { LAYER_ICON } from '~/canvas/icons'
import { layerMenuItems, useLastCopy } from '~/composables/useLayerMenu'
import { useLayerStore } from '~/canvas/store'

/** 왼쪽 패널 · 레이어: 화면 → 레이어 트리 (위에 있는 레이어가 위). 이름 바꾸기 · 숨기기 · 잠그기 · 끌어서 순서 바꾸기 */
const props = defineProps<{ screens: ScreenRow[] }>()
const emit = defineEmits<{ 'pick-screen': [id: string]; 'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'front' | 'back' | 'forward' | 'backward'] }>()
const store = useLayerStore()

const closed = ref<Set<string>>(new Set()) // 접은 화면 · 프레임
const toggle = (k: string) => { const s = new Set(closed.value); if (s.has(k)) s.delete(k); else s.add(k); closed.value = s }

interface Row { sid: string; n: LayerNode; depth: number }
function rowsOf(s: ScreenRow): Row[] {
  if (s.source !== 'native' || closed.value.has(s.id)) return []
  const d = store.doc(s.id)
  const out: Row[] = []
  const walk = (ids: string[], depth: number) => {
    for (const id of [...ids].reverse()) {
      const n = d.nodes[id]
      if (!n) continue
      out.push({ sid: s.id, n, depth })
      if (isContainer(n) && !closed.value.has(s.id + ':' + id)) walk(n.children ?? [], depth + 1)
    }
  }
  walk(d.rootIds, 1)
  return out
}

const renaming = ref<string | null>(null)
function rename(r: Row, e: Event) {
  renaming.value = null
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== r.n.name) store.update(r.sid, [r.n.id], { name: v })
}

// 끌어서 순서 바꾸기 (같은 화면 안)
const dragging = ref<{ sid: string; id: string } | null>(null)
const over = ref<{ id: string; into: boolean } | null>(null)
function onDragOver(e: DragEvent, r: Row) {
  if (!dragging.value || dragging.value.sid !== r.sid || dragging.value.id === r.n.id) return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const into = isContainer(r.n) && e.clientY > rect.top + rect.height * 0.3 && e.clientY < rect.bottom - rect.height * 0.3
  over.value = { id: r.n.id, into }
}
function onDrop(r: Row) {
  if (dragging.value && over.value) store.moveTo(r.sid, dragging.value.id, r.n.id, over.value.into)
  dragging.value = null
  over.value = null
}
const isSel = (r: Row) => store.screenId.value === r.sid && store.layerIds.value.includes(r.n.id)
function pick(r: Row, e: MouseEvent) { store.selectLayer(r.sid, r.n.id, e.shiftKey) }
// 우클릭 메뉴(캔버스와 같은 항목 + 이름 바꾸기)
const ctx = useContextMenu()
const lastCopy = useLastCopy()
const paste = () => { if (lastCopy.value !== 'screen' && store.hasClipboard()) store.paste(); else emit('screen-action', 'paste') }
function rowMenu(r: Row, e: MouseEvent) {
  if (!isSel(r)) store.selectLayer(r.sid, r.n.id)
  ctx.open(e, [{ label: 'Rename', shortcut: 'F2', action: () => (renaming.value = r.n.id) }, 'sep', ...layerMenuItems(store, r.sid, [...store.layerIds.value], { lastCopy, paste })])
}
function screenMenu(s: ScreenRow, e: MouseEvent) {
  if (s.id.startsWith('page:')) return
  emit('pick-screen', s.id)
  ctx.open(e, [
    { label: 'Copy', shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy') } },
    { label: 'Paste', shortcut: '⌘V', action: paste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    { label: 'Duplicate', shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
    'sep',
    { label: 'Bring to front', shortcut: '⌥⌘]', action: () => emit('screen-action', 'front') },
    { label: 'Bring forward', shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
    { label: 'Send backward', shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
    { label: 'Send to back', shortcut: '⌥⌘[', action: () => emit('screen-action', 'back') },
    'sep',
    { label: 'Delete', shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
  ])
}
</script>

<template>
  <div class="tree" role="tree" aria-label="Layers">
    <template v-for="s in screens" :key="s.id">
      <div role="treeitem" tabindex="0" :aria-selected="store.screenId.value === s.id && !store.layerIds.value.length" :class="['sq', 'nav-item', 's', 'row', { on: store.screenId.value === s.id && !store.layerIds.value.length }]" @click="emit('pick-screen', s.id)" @contextmenu="screenMenu(s, $event)" @keydown.enter.self.prevent="emit('pick-screen', s.id)" @keydown.space.self.prevent="emit('pick-screen', s.id)">
        <button v-if="s.source === 'native' && store.doc(s.id).rootIds.length" class="chev" :aria-label="closed.has(s.id) ? 'Expand' : 'Collapse'" @click.stop="toggle(s.id)"><Icon name="chevron_down" :size="12" :class="{ rot: closed.has(s.id) }" /></button>
        <span v-else class="chev" />
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="ic"><path d="M3.5 1v10M8.5 1v10M1 3.5h10M1 8.5h10" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
        <span class="name">{{ s.name }}</span>
        <Icon v-if="s.source === 'figma'" name="arrow_up_right" :size="12" class="muted" />
      </div>
      <div
        v-for="r in rowsOf(s)"
        :key="r.n.id"
        role="treeitem"
        tabindex="0"
        :aria-selected="isSel(r)"
        draggable="true"
        :class="['sq', 'nav-item', 's', 'row', { on: isSel(r), faded: r.n.hidden, 'drop-above': over?.id === r.n.id && !over.into, 'drop-into': over?.id === r.n.id && over.into }]"
        :style="{ paddingLeft: `calc(var(--ref-spacing-08) + ${r.depth * 14}px)` }"
        @click="pick(r, $event)"
        @contextmenu="rowMenu(r, $event)"
        @keydown.enter.self.prevent="store.selectLayer(r.sid, r.n.id, $event.shiftKey)"
        @keydown.space.self.prevent="store.selectLayer(r.sid, r.n.id, $event.shiftKey)"
        @keydown.f2.self.prevent="renaming = r.n.id"
        @dblclick="renaming = r.n.id"
        @dragstart="dragging = { sid: r.sid, id: r.n.id }"
        @dragover="onDragOver($event, r)"
        @dragleave="over = null"
        @drop.prevent="onDrop(r)"
        @dragend="dragging = null; over = null"
      >
        <button v-if="isContainer(r.n) && r.n.children?.length" class="chev" :aria-label="closed.has(r.sid + ':' + r.n.id) ? 'Expand' : 'Collapse'" @click.stop="toggle(r.sid + ':' + r.n.id)"><Icon name="chevron_down" :size="12" :class="{ rot: closed.has(r.sid + ':' + r.n.id) }" /></button>
        <span v-else class="chev" />
        <svg v-if="LAYER_ICON[r.n.type]" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="ic"><path :d="LAYER_ICON[r.n.type]" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>
        <Icon v-else name="image" :size="12" class="ic" />
        <input v-if="renaming === r.n.id" class="txt-in ren" :value="r.n.name" aria-label="Layer name" autofocus @click.stop @blur="rename(r, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null">
        <span v-else class="name">{{ r.n.name }}</span>
        <span class="tools" :class="{ keep: r.n.hidden || r.n.locked }">
          <button class="mini" :class="{ act2: r.n.locked }" :aria-label="r.n.locked ? 'Unlock' : 'Lock'" :title="r.n.locked ? 'Unlock' : 'Lock'" @click.stop="store.update(r.sid, [r.n.id], { locked: !r.n.locked })">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1" /><path :d="r.n.locked ? 'M4 5.5V4a2 2 0 0 1 4 0v1.5' : 'M4 5.5V4a2 2 0 0 1 3.8-.9'" fill="none" stroke="currentColor" stroke-width="1.1" /></svg>
          </button>
          <button class="mini" :class="{ act2: r.n.hidden }" :aria-label="r.n.hidden ? 'Show' : 'Hide'" :title="r.n.hidden ? 'Show' : 'Hide'" @click.stop="store.update(r.sid, [r.n.id], { hidden: !r.n.hidden })">
            <svg v-if="!r.n.hidden" width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7s2-3.8 5.5-3.8S12.5 7 12.5 7 10.5 10.8 7 10.8 1.5 7 1.5 7z" stroke="currentColor" stroke-width="1.2" fill="none" /><circle cx="7" cy="7" r="1.6" fill="currentColor" /></svg>
            <svg v-else width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M5.2 3.6A6 6 0 0 1 7 3.2c3.5 0 5.5 3.8 5.5 3.8a10 10 0 0 1-1.7 2.2M3.2 4.9A10 10 0 0 0 1.5 7S3.5 10.8 7 10.8c.7 0 1.3-.1 1.9-.4" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
          </button>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tree { display: flex; flex-direction: column; }
.row { cursor: default; user-select: none; gap: var(--ref-spacing-02) !important; }
.chev { width: 14px; height: 14px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-01); color: var(--sys-color-neutral-500); }
button.chev:hover { color: var(--sys-color-neutral-800); background: var(--interaction-light-gray-hover); }
button.chev:active { background: var(--interaction-light-gray-pressed); }
.chev .rot, .chev :deep(svg) { transition: transform .12s ease; }
.chev .rot { transform: rotate(-90deg); }
.ic { flex: none; color: var(--sys-color-neutral-600); margin-right: var(--ref-spacing-02); }
.name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.faded { opacity: .5; }
.ren { height: 22px; flex: 1; min-width: 0; }
.tools { display: none; gap: var(--ref-spacing-02); flex: none; }
.row:hover .tools, .row:focus-within .tools, .tools.keep { display: flex; }
.mini { width: 18px; height: 18px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); transition: background-color .12s ease, color .12s ease; }
.mini:hover { background: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.mini:active { background: var(--interaction-light-gray-pressed); }
.mini.act2 { color: var(--sys-color-neutral-800); }
.chev:focus-visible, .mini:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.drop-above { box-shadow: inset 0 2px 0 var(--sys-color-brand-primary-default); }
.drop-into { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
</style>
