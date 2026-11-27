<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/** 아래 도구 막대. 피그마처럼 묶음 버튼(프레임 · 섹션 / 도형 / 그리기)을 누르면 마지막 도구, ▾ 로 펼쳐서 고르기 */
export type Tool = 'move' | 'hand' | 'scale' | 'pen' | 'frame' | 'section' | 'rect' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'image' | 'pencil' | 'text'
const tool = defineModel<Tool>({ default: 'move' })
/** 보기 전용(디자인 편집 권한 없음): 이동 · 손만, 편집 도구 자리에 잠긴 Edit(PRD/16 E) */
const props = defineProps<{ readonly?: boolean; commenting?: boolean; unread?: boolean }>()
const emit = defineEmits<{ rail: [k: 'assets' | 'link' | 'figma' | 'comment'] }>()

interface Item { key: Tool; label: string; key2?: string; icon: string }
const ITEMS: Record<Tool, Item> = {
  move: { key: 'move', label: 'Move', key2: 'V', icon: 'cursor_move' },
  scale: { key: 'scale', label: 'Scale', key2: 'K', icon: 'scale' },
  hand: { key: 'hand', label: 'Hand tool', key2: 'H', icon: 'hand' },
  frame: { key: 'frame', label: 'Frame', key2: 'F', icon: 'frame' },
  section: { key: 'section', label: 'Section', key2: '⇧S', icon: 'section' },
  rect: { key: 'rect', label: 'Rectangle', key2: 'R', icon: 'rectangle' },
  line: { key: 'line', label: 'Line', key2: 'L', icon: 'line' },
  arrow: { key: 'arrow', label: 'Arrow', key2: '⇧L', icon: 'arrow_line' },
  ellipse: { key: 'ellipse', label: 'Ellipse', key2: 'O', icon: 'ellipse' },
  polygon: { key: 'polygon', label: 'Polygon', icon: 'polygon' },
  star: { key: 'star', label: 'Star', icon: 'star' },
  image: { key: 'image', label: 'Image/video…', key2: '⇧⌘K', icon: 'image' },
  pen: { key: 'pen', label: 'Pen', key2: 'P', icon: 'pen' },
  pencil: { key: 'pencil', label: 'Pencil', key2: '⇧P', icon: 'pencil' },
  text: { key: 'text', label: 'Text', key2: 'T', icon: 'text' },
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
const GROUP_LABEL: Record<string, string> = { move: 'Move tools', frame: 'Region tools', shape: 'Shape tools', draw: 'Creation tools', text: 'Type tools' }
const tip = (it: Item) => (it.key2 ? `${tr(it.label)} (${it.key2})` : tr(it.label))
/** 묶음 버튼에 보이는 도구: 지금 고른 도구가 이 묶음이면 그것, 아니면 마지막에 쓴 것(Image 는 한 번 쓰고 돌아와서 제외) */
const shown = (g: { id: string; tools: Tool[] }) => ITEMS[g.tools.includes(tool.value) && tool.value !== 'image' ? tool.value : last[g.id]!]
/** 코멘트 모드 중에 도구를 누르면 코멘트 모드를 끄고 그 도구로(피그마와 같아요 — 코멘트 중엔 다른 도구가 선택돼 보이지 않아요) */
function pick(t: Tool) { if (props.commenting) emit('rail', 'comment'); tool.value = t; open.value = null }
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
  <div ref="root" role="toolbar" :aria-label="tr('Tools')" aria-orientation="horizontal" class="sq float s bar">
    <div v-for="g in (props.readonly ? GROUPS.slice(0, 1) : GROUPS)" :key="g.id" class="grp-wrap">
      <button
        :aria-label="tip(shown(g))"
        :data-tip="tr(shown(g).label)"
        :data-tip-key="shown(g).key2"
        data-tip-at="top"
        :aria-pressed="!props.commenting && g.tools.includes(tool)"
        type="button"
        :class="['rail-btn', { on: !props.commenting && g.tools.includes(tool) }]"
        @click="pick(shown(g).key)"
      >
        <template v-for="it in [shown(g)]" :key="it.key">
          <EditorIcon :name="it.icon" :size="20" />
        </template>
      </button>
      <button v-if="g.tools.length > 1" type="button" class="sq more" :class="{ open: open === g.id }" :data-grp="g.id" :aria-label="tr(GROUP_LABEL[g.id]!)" :data-tip="tr(GROUP_LABEL[g.id]!)" data-tip-at="top" aria-haspopup="menu" :aria-expanded="open === g.id" @click="toggle(g.id, $event.detail === 0)" @keydown="onChevKey($event, g.id)">
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1.75 3l2.25 2.25L6.25 3" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div v-if="open === g.id" class="sq menu pop" role="menu" :aria-label="tr(GROUP_LABEL[g.id]!)" @keydown="onMenuKey($event, g.id)">
        <button v-for="t in g.tools" :key="t" type="button" role="menuitemradio" :aria-checked="tool === t" :class="['sq', 'menu-item', { on: tool === t }]" @click="pick(t)">
          <EditorIcon name="check" :size="12" class="ck" :style="{ visibility: t === shown(g).key ? 'visible' : 'hidden' }" />
          <EditorIcon :name="ITEMS[t].icon" :size="16" />
          <span class="grow">{{ tr(ITEMS[t].label) }}</span><span v-if="ITEMS[t].key2" class="key">{{ ITEMS[t].key2 }}</span>
        </button>
      </div>
    </div>
    <template v-if="props.readonly">
      <span class="div" aria-hidden="true" />
      <span class="sq locked" tabindex="0" :aria-label="tr('Editing is locked. Only people who can edit design can edit')" :data-tip="tr('Only people who can edit design can do this')" data-tip-at="top"><EditorIcon name="lock" :size="16" />{{ tr('Edit') }}</span>
    </template>
    <span v-if="!props.readonly" class="div" aria-hidden="true" />
    <button v-if="!props.readonly" type="button" :aria-label="tr('Assets')" :data-tip="tr('Assets')" data-tip-at="top" class="rail-btn" @click="emit('rail', 'assets')"><EditorIcon name="component" :size="20" /></button>
    <button v-if="!props.readonly" type="button" :aria-label="tr('Link requirement')" :data-tip="tr('Link requirement')" data-tip-at="top" class="rail-btn" @click="emit('rail', 'link')"><EditorIcon name="link" :size="20" /></button>
    <button v-if="!props.readonly" type="button" :aria-label="tr('Import from Figma')" :data-tip="tr('Import from Figma')" data-tip-at="top" class="rail-btn" @click="emit('rail', 'figma')"><EditorIcon name="arrow_up_right" :size="20" /></button>
    <button type="button" :aria-label="tr('Comment (C)')" :aria-pressed="!!props.commenting" :data-tip="tr('Comments')" data-tip-key="C" data-tip-at="top" :class="['rail-btn', { on: props.commenting }]" @click="emit('rail', 'comment')"><EditorIcon name="comment" :size="20" /><i v-if="props.unread" class="cdot" aria-hidden="true" /></button>
  </div>
</template>

<style scoped>
.rail-btn { position: relative; }
.cdot { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); box-shadow: 0 0 0 1.5px var(--sys-color-common-white-emphasis); }
.locked { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); height: 32px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-04); font-size: 12px; font-weight: 500; color: var(--sys-color-neutral-500); cursor: not-allowed; }
.locked:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 도구 막대는 늘 맨 앞(z 8): 캔버스 · 좌우 패널(4 · 3) 위, 팝오버 · 메뉴 · 변수 화면(20~) 아래 */
/* 도구 막대: 바닥에서 16 띄움 · 높이 44 · 모서리 14(= 도구 8 + 안쪽 6, 안팎 곡선이 나란해요) · 안쪽 6(도구 32 둘레가 위아래 · 좌우 모두 6) · 묶음 사이 6 · 도구 32 + ▾ 16(붙어 있음 1px) · 칸막이는 위아래 끝까지 */
.bar { position: absolute; bottom: var(--ref-spacing-10); left: 50%; transform: translateX(-50%); height: 44px; box-sizing: border-box; border-radius: 14px; padding: 0 var(--ref-spacing-05); display: flex; align-items: center; gap: var(--ref-spacing-05); z-index: 8; }
.grp-wrap { position: relative; display: flex; align-items: center; gap: 1px; }
.more { width: 16px; height: 32px; display: grid; place-items: center; color: var(--sys-color-neutral-500); border-radius: var(--ref-radius-02); }
.more:hover, .more.open { color: var(--sys-color-neutral-800); --sq-fill: var(--interaction-light-gray-hover); }
.more:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* 펼침 메뉴: 막대 위 4px, 묶음 버튼 왼쪽 끝에 맞춤. ✓ 칸 · 아이콘 · 이름 · 단축키 */
.pop { top: auto; bottom: calc(100% + 8px); left: 0; right: auto; min-width: 200px; padding: var(--ref-spacing-04); }
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
