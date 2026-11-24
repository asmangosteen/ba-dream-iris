<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { isContainer, isGroupNode, type LayerNode } from '~/canvas/schema'
import { LAYER_ICON } from '~/canvas/icons'
import { vectorPath } from '~/canvas/paint'
import { layerMenuItems, useLastCopy, useMixScreens } from '~/composables/useLayerMenu'
import { useLayerStore } from '~/canvas/store'

/** 왼쪽 패널 · 레이어: 화면 → 레이어 트리 (위에 있는 레이어가 위). 이름 바꾸기 · 숨기기 · 잠그기 · 끌어서 순서 바꾸기 */
const props = defineProps<{ screens: ScreenRow[]; multi?: string[]; canvasId?: string | null }>()
const emit = defineEmits<{ 'pick-screen': [id: string]; 'toggle-screen': [id: string]; 'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'front' | 'back' | 'forward' | 'backward' | 'section'] }>()
const store = useLayerStore()

const closed = ref<Set<string>>(new Set()) // 접은 화면 · 프레임
const toggle = (k: string) => { const s = new Set(closed.value); if (s.has(k)) s.delete(k); else s.add(k); closed.value = s }

interface Row { sid: string; n: LayerNode; depth: number; under: boolean }
const isCanvasRow = (s: { id: string }) => s.id.startsWith('page:')
function rowsOf(s: ScreenRow, base = 1, forceUnder = false): Row[] {
  if (s.source !== 'native' || closed.value.has(s.id)) return []
  const d = store.doc(s.id)
  const out: Row[] = []
  const sel = store.screenId.value === s.id ? new Set(store.layerIds.value) : new Set<string>()
  // under: 고른 레이어(또는 고른 화면)의 자식 — 피그마처럼 더 옅은 파랑
  const walk = (ids: string[], depth: number, under: boolean) => {
    for (const id of [...ids].reverse()) {
      const n = d.nodes[id]
      if (!n) continue
      out.push({ sid: s.id, n, depth, under })
      if (isContainer(n) && !closed.value.has(s.id + ':' + id)) walk(n.children ?? [], depth + 1, under || sel.has(id))
    }
  }
  // 캔버스 위 레이어는 묶음 줄 없이 화면들과 같은 단계로(피그마와 같아요)
  walk(d.rootIds, isCanvasRow(s) ? 0 : base, forceUnder || (!isCanvasRow(s) && store.screenId.value === s.id && !store.layerIds.value.length))
  return out
}

/**
 * 섹션을 상위로(피그마와 같아요): 캔버스 섹션 안에 완전히 들어간 화면은 그 섹션 아래에 한 단계 들여서.
 * 목록 한 줄 = 화면 줄 또는 레이어 줄. 섹션을 고르면 안의 화면 · 레이어까지 한 박스로 옅게 칠해요
 */
type Item = { kind: 'screen'; s: ScreenRow; depth: number; under: boolean } | { kind: 'layer'; r: Row }
const canvasRow = computed(() => props.screens.find(isCanvasRow) ?? null)
/** 화면 id → 그 화면을 감싼 가장 안쪽 섹션 id */
const screenSection = computed(() => {
  const map = new Map<string, string>()
  const c = canvasRow.value
  if (!c) return map
  const d = store.doc(c.id)
  const secs = d.rootIds.map((id) => d.nodes[id]).filter((n): n is LayerNode => n?.type === 'section')
  for (const s of props.screens) {
    if (isCanvasRow(s)) continue
    let best: LayerNode | null = null
    for (const n of secs) if (s.x >= n.x && s.y >= n.y && s.x + s.width <= n.x + n.w && s.y + s.height <= n.y + n.h && (!best || n.w * n.h < best.w * best.h)) best = n
    if (best) map.set(s.id, best.id)
  }
  return map
})
const hasScreens = (secId: string) => [...screenSection.value.values()].includes(secId)
const items = computed<Item[]>(() => {
  const out: Item[] = []
  const inSec = screenSection.value
  const pushScreen = (s: ScreenRow, depth: number, under: boolean) => {
    out.push({ kind: 'screen', s, depth, under })
    for (const r of rowsOf(s, depth + 1, under)) out.push({ kind: 'layer', r })
  }
  // 피그마처럼: 캔버스 맨 위 항목(섹션 · 캔버스 위 레이어)이 먼저, 그다음 섹션 밖 화면들
  const c = canvasRow.value
  if (c) {
    const d = store.doc(c.id)
    const sel = store.screenId.value === c.id ? new Set(store.layerIds.value) : new Set<string>()
    const walk = (ids: string[], depth: number, under: boolean) => {
      for (const id of [...ids].reverse()) {
        const n = d.nodes[id]
        if (!n) continue
        out.push({ kind: 'layer', r: { sid: c.id, n, depth, under } })
        if (closed.value.has(c.id + ':' + id)) continue
        if (isContainer(n)) walk(n.children ?? [], depth + 1, under || sel.has(id))
        if (n.type === 'section') for (const s of props.screens) if (inSec.get(s.id) === id) pushScreen(s, depth + 1, under || sel.has(id))
      }
    }
    walk(d.rootIds, 0, false)
  }
  for (const s of props.screens) if (!isCanvasRow(s) && !inSec.has(s.id)) pushScreen(s, 0, false)
  return out
})
const itemKey = (it: Item) => (it.kind === 'screen' ? 's:' + it.s.id : it.r.sid + ':' + it.r.n.id)
const mixScreens = useMixScreens()
/** 고른 화면: 여러 화면 · 레이어와 함께 고른 화면(섞어 고르기)도 */
const screenOn = (s: ScreenRow) => mixScreens.value.includes(s.id) || (props.multi?.length ? props.multi.includes(s.id) : store.screenId.value === s.id && !store.layerIds.value.length)

const renaming = ref<string | null>(null)
function rename(r: Row, e: Event) {
  // Esc 로 취소한 뒤 따라오는 blur 는 무시해요
  if (renaming.value !== r.n.id) return
  renaming.value = null
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== r.n.name) store.update(r.sid, [r.n.id], { name: v })
}

/**
 * 끌어서 옮기기(피그마와 같아요): 같은 화면 안 순서 · 다른 프레임 · 오토 레이아웃 안 · 다른 화면 · 캔버스 어디로든.
 * 줄 위쪽 = 그 앞(위)에, 프레임 · 그룹 · 화면 줄 가운데 = 그 안으로. 화면에서 보이던 자리는 그대로(대상 밖이면 대상 가운데로)
 */
const dragging = ref<{ sid: string; id: string } | null>(null)
const over = ref<{ id: string; into: boolean; y?: number } | null>(null)
/** 목록 안 줄 번호(줄 높이 28) */
const rowIdx = (key: string) => items.value.findIndex((it) => itemKey(it) === key)
/** 놓을 자리 구분선: 두 줄 사이에 따로 그리는 일자 선(줄 모서리에 잘리지 않게) */
const dropY = computed(() => (over.value && !over.value.into && over.value.y !== undefined ? over.value.y : null))
function onDragOver(e: DragEvent, r: Row) {
  const dg = dragging.value
  if (!dg || dg.id === r.n.id) return
  // 자기 안으로는 못 넣어요
  if (dg.sid === r.sid) { const d = store.doc(r.sid); for (let p: string | null | undefined = r.n.id; p; p = d.nodes[p]?.parentId) if (p === dg.id) return }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const into = isContainer(r.n) && e.clientY > rect.top + rect.height * 0.3 && e.clientY < rect.bottom - rect.height * 0.3
  over.value = { id: r.n.id, into, y: rowIdx(r.sid + ':' + r.n.id) * 28 }
}
/** 화면 줄 위: 그 화면 안 맨 위로 */
function onDragOverScreen(e: DragEvent, s: ScreenRow) {
  const dg = dragging.value
  if (!dg) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // 화면 줄 위 · 아래 가장자리 = 화면들 사이(캔버스로 꺼내기), 가운데 = 그 화면 안으로(피그마 화면만)
  const edge = e.clientY < rect.top + rect.height * 0.3 ? 'top' : e.clientY > rect.bottom - rect.height * 0.3 ? 'bottom' : null
  const into = !edge && s.source === 'native' && !s.id.startsWith('page:')
  if (!into && !edge) return
  if (!into && !props.canvasId) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const i = rowIdx('s:' + s.id)
  over.value = { id: 'screen:' + s.id, into, y: (edge === 'bottom' ? i + 1 : i) * 28 }
}
const originOf = (sid: string) => { const s = props.screens.find((v) => v.id === sid); return { x: s?.x ?? 0, y: s?.y ?? 0 } }
/** 다른 화면(문서)으로 옮기기: 화면 위 자리 그대로, 대상 부모 밖이면 부모 가운데 */
function moveAcross(from: string, id: string, to: string, parentId: string | null) {
  const a = originOf(from), b = originOf(to)
  store.transfer(from, [id], to, parentId, { x: a.x - b.x, y: a.y - b.y })
  const d = store.doc(to), n = d.nodes[id]
  if (!n) return
  const box = parentId ? d.nodes[parentId] : props.screens.find((v) => v.id === to)
  const pw = box ? ('w' in box ? box.w : (box as ScreenRow).width) : 0, ph = box ? ('h' in box ? box.h : (box as ScreenRow).height) : 0
  if (pw > 0 && ph > 0 && (n.x + n.w <= 0 || n.y + n.h <= 0 || n.x >= pw || n.y >= ph)) store.update(to, [id], { x: Math.round((pw - n.w) / 2), y: Math.round((ph - n.h) / 2) })
}
function onDrop(r: Row) {
  const dg = dragging.value, ov = over.value
  dragging.value = null
  over.value = null
  if (!dg || !ov) return
  if (dg.sid === r.sid) { store.moveTo(r.sid, dg.id, r.n.id, ov.into); return }
  // 다른 화면 · 캔버스: 먼저 그 문서로 옮기고, 그 안에서 자리(앞 · 안으로)를 맞춰요
  const target = store.doc(r.sid).nodes[r.n.id]
  moveAcross(dg.sid, dg.id, r.sid, ov.into ? r.n.id : target?.parentId ?? null)
  store.moveTo(r.sid, dg.id, r.n.id, ov.into)
}
function onDropScreen(s: ScreenRow) {
  const dg = dragging.value
  const ov = over.value
  dragging.value = null
  over.value = null
  if (!dg) return
  // 화면들 사이: 캔버스(페이지) 맨 위 단계로 꺼내요
  if (ov && !ov.into && props.canvasId) {
    if (dg.sid === props.canvasId) { const d = store.doc(dg.sid); const top = d.rootIds[d.rootIds.length - 1]; if (d.nodes[dg.id]?.parentId) store.moveTo(dg.sid, dg.id, top && top !== dg.id ? top : null, false); else if (top && top !== dg.id) store.moveTo(dg.sid, dg.id, top, false); return }
    moveAcross(dg.sid, dg.id, props.canvasId, null)
    return
  }
  if (dg.sid === s.id) { const d = store.doc(s.id); const top = d.rootIds[d.rootIds.length - 1]; if (top && top !== dg.id) store.moveTo(s.id, dg.id, top, false); return }
  moveAcross(dg.sid, dg.id, s.id, null)
}
/** 이름 바꾸기 입력칸: 열리면 바로 포커스하고 글자를 모두 골라요(피그마와 같아요) */
const vSelect = { mounted: (el: HTMLInputElement) => nextTick(() => { el.focus(); el.select() }) }
const isSel = (r: Row) => store.screenId.value === r.sid && store.layerIds.value.includes(r.n.id)
/**
 * 고른 줄 + 그 하위 줄을 한 박스로 칠하기(피그마 UI3): 행마다 따로 칠하지 않고, 줄 범위에 squircle 박스 하나를 깔아요.
 * 맨 윗줄(고른 것)은 조금 진하게, 아래 하위 줄들은 더 옅게. 줄 높이는 28 고정
 */
const groups = computed(() => {
  const out: { top: number; n: number }[] = []
  let g: { top: number; n: number } | null = null
  items.value.forEach((it, i) => {
    const on = it.kind === 'screen' ? screenOn(it.s) : isSel(it.r)
    const under = it.kind === 'screen' ? it.under : it.r.under
    if (on) { g = { top: i, n: 1 }; out.push(g) }
    else if (under && g) g.n++
    else g = null
  })
  return out
})
/**
 * 레이어 목록 고르기(피그마와 같아요): ⌘(Ctrl) 클릭 = 하나씩 더하기 · 빼기, Shift 클릭 = 마지막으로 고른 줄부터 여기까지(같은 화면 안)
 */
let anchor: { sid: string; id: string } | null = null
/** 오토 레이아웃 프레임 아이콘(12 칸): 세로 = 위아래 두 칸, 가로 = 좌우 두 칸, 줄바꿈 = 네 칸 */
const AL_ICON: Record<'vertical' | 'horizontal' | 'wrap', string> = {
  vertical: 'M2.5 1.5h7a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1zM2.5 6.5h7a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z',
  horizontal: 'M2.5 1.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM7.5 1.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
  wrap: 'M1.5 1.5h4v4h-4zM6.5 1.5h4v4h-4zM1.5 6.5h4v4h-4zM6.5 6.5h4v4h-4z',
}
/** 벡터 · 연필 레이어 아이콘: 그 도형의 경로를 16 칸 가운데 12 안에 맞춰서 */
function shapeIcon(n: LayerNode): { d: string; vb: string } | null {
  if ((n.type !== 'vector' && n.type !== 'path') || !(n.w > 0 || n.h > 0)) return null
  const d = vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
  if (!d) return null
  const size = Math.max(n.w, n.h, 1), box = size / 0.75 // 16 중 12 를 쓰게
  return { d, vb: `${(n.w - box) / 2} ${(n.h - box) / 2} ${box} ${box}` }
}
function pick(r: Row, e: MouseEvent | KeyboardEvent) {
  // 화면(들)만 고른 채 다른 화면 안 레이어를 ⇧ · ⌘ 클릭: 화면은 그대로, 그 레이어를 함께(섞어 고르기)
  if ((e.shiftKey || e.metaKey || e.ctrlKey) && store.screenId.value !== r.sid && !store.layerIds.value.length) {
    const cur = props.multi?.length ? [...props.multi] : store.screenId.value && !store.screenId.value.startsWith('page:') ? [store.screenId.value] : []
    store.selectLayer(r.sid, r.n.id)
    mixScreens.value = cur.filter((id) => id !== r.sid)
    anchor = { sid: r.sid, id: r.n.id }
    return
  }
  if (e.metaKey || e.ctrlKey) { store.selectLayer(r.sid, r.n.id, true); anchor = { sid: r.sid, id: r.n.id }; return }
  const a = anchor
  if (e.shiftKey && a && a.sid === r.sid && store.screenId.value === r.sid && store.layerIds.value.length) {
    const rows = items.value.filter((it) => it.kind === 'layer' && it.r.sid === r.sid).map((it) => (it as { r: Row }).r.n.id)
    const i = rows.indexOf(a.id), j = rows.indexOf(r.n.id)
    if (i >= 0 && j >= 0) {
      // 단계 상관없이 그 사이 줄 모두(부모 + 자식도 — 옮기기 · 복사는 맨 위 것만 움직여요)
      const range = rows.slice(Math.min(i, j), Math.max(i, j) + 1)
      store.layerIds.value = [...new Set([...store.layerIds.value, ...range])]
      return
    }
  }
  if (e.shiftKey) { store.selectLayer(r.sid, r.n.id, true); anchor = { sid: r.sid, id: r.n.id }; return }
  store.selectLayer(r.sid, r.n.id)
  anchor = { sid: r.sid, id: r.n.id }
}
// 우클릭 메뉴(캔버스와 같은 항목 + 이름 바꾸기)
const ctx = useContextMenu()
const lastCopy = useLastCopy()
const paste = () => { if (lastCopy.value !== 'screen' && store.hasClipboard()) store.paste(); else emit('screen-action', 'paste') }
function rowMenu(r: Row, e: MouseEvent) {
  if (!isSel(r)) store.selectLayer(r.sid, r.n.id)
  ctx.open(e, [{ label: tr('Rename'), shortcut: 'F2', action: () => (renaming.value = r.n.id) }, 'sep', ...layerMenuItems(store, r.sid, [...store.layerIds.value], { lastCopy, paste })])
}
function screenMenu(s: ScreenRow, e: MouseEvent) {
  if (s.id.startsWith('page:')) return
  emit('pick-screen', s.id)
  ctx.open(e, [
    { label: tr('Copy'), shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy') } },
    { label: tr('Paste'), shortcut: '⌘V', action: paste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    { label: tr('Duplicate'), shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
    { label: tr('Wrap in section'), shortcut: '⌥⌘S', action: () => emit('screen-action', 'section') },
    'sep',
    { label: tr('Bring to front'), shortcut: '⌥⌘]', action: () => emit('screen-action', 'front') },
    { label: tr('Bring forward'), shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
    { label: tr('Send backward'), shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
    { label: tr('Send to back'), shortcut: '⌥⌘[', action: () => emit('screen-action', 'back') },
    'sep',
    { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
  ])
}
</script>

<template>
  <div class="tree" role="tree" :aria-label="tr('Layers')">
    <div v-if="dropY !== null" class="drop-line" :style="{ top: dropY - 1 + 'px' }" aria-hidden="true" />
    <div v-for="(g, i) in groups" :key="'g' + i" class="sqc grp-bg" :style="{ top: g.top * 28 + 'px', height: g.n * 28 + 'px' }" aria-hidden="true" />
    <template v-for="it in items" :key="itemKey(it)">
      <div v-if="it.kind === 'screen'" v-for="s in [it.s]" :key="s.id" role="treeitem" tabindex="0" :aria-selected="screenOn(s)" :class="['sq', 'nav-item', 's', 'row', 'lr', 'srow', { on: screenOn(s), under: !screenOn(s) && it.under, 'drop-into': over?.id === 'screen:' + s.id }]" :style="{ '--d': it.depth }" @click="$event.shiftKey || $event.metaKey || $event.ctrlKey ? emit('toggle-screen', s.id) : emit('pick-screen', s.id)" @dragover="onDragOverScreen($event, s)" @dragleave="over = null" @drop.prevent="onDropScreen(s)" @contextmenu="screenMenu(s, $event)" @keydown.enter.self.prevent="emit('pick-screen', s.id)" @keydown.space.self.prevent="emit('pick-screen', s.id)">
        <button v-if="s.source === 'native' && store.doc(s.id).rootIds.length" class="sq chev" :aria-label="closed.has(s.id) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(s.id)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: closed.has(s.id) }" /></button>
        <span v-else class="chev" />
        <svg width="16" height="16" viewBox="-2 -2 16 16" aria-hidden="true" class="ic"><path d="M3.5 1v10M8.5 1v10M1 3.5h10M1 8.5h10" stroke="currentColor" stroke-width="1" fill="none" /></svg>
        <span class="name" :title="s.name">{{ s.name }}</span>
        <span v-if="s.source === 'figma'" class="muted ext" role="img" :aria-label="tr('Figma frame')" :title="tr('Figma frame')"><EditorIcon name="arrow_up_right" :size="12" /></span>
      </div>
      <div
        v-else
        v-for="r in [it.r]"
        :key="r.n.id"
        role="treeitem"
        tabindex="0"
        :aria-selected="isSel(r)"
        draggable="true"
        :class="['sq', 'nav-item', 's', 'row', 'lr', { on: isSel(r), under: !isSel(r) && r.under, comp: r.n.type === 'instance', faded: r.n.hidden, 'drop-above': over?.id === r.n.id && !over.into, 'drop-into': over?.id === r.n.id && over.into }]"
        :style="{ paddingLeft: `calc(var(--ref-spacing-06) + ${r.depth * 18}px)` }"
        @click="pick(r, $event)"
        @contextmenu="rowMenu(r, $event)"
        @keydown.enter.self.prevent="pick(r, $event)"
        @keydown.space.self.prevent="pick(r, $event)"
        @keydown.f2.self.prevent="renaming = r.n.id"
        @dblclick="renaming = r.n.id"
        @dragstart="dragging = { sid: r.sid, id: r.n.id }; $event.dataTransfer && ($event.dataTransfer.effectAllowed = 'move')"
        @dragover="onDragOver($event, r)"
        @dragleave="over = null"
        @drop.prevent="onDrop(r)"
        @dragend="dragging = null; over = null"
      >
        <button v-if="(isContainer(r.n) && r.n.children?.length) || (r.n.type === 'section' && hasScreens(r.n.id))" class="sq chev" :aria-label="closed.has(r.sid + ':' + r.n.id) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(r.sid + ':' + r.n.id)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: closed.has(r.sid + ':' + r.n.id) }" /></button>
        <span v-else class="chev" />
        <!-- 벡터 · 연필 레이어: 펜 모양 대신 지금 그 도형 모양 그대로(점을 고치면 바로 따라 바뀌어요) -->
        <svg v-if="shapeIcon(r.n)" width="16" height="16" :viewBox="shapeIcon(r.n)!.vb" aria-hidden="true" class="ic"><path :d="shapeIcon(r.n)!.d" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>
        <!-- 오토 레이아웃 프레임: 방향별 아이콘(세로 · 가로 · 줄바꿈) — 피그마와 같아요 -->
        <svg v-else-if="r.n.style.layout" width="16" height="16" viewBox="-2 -2 16 16" aria-hidden="true" class="ic"><path :d="AL_ICON[r.n.style.layout.wrap ? 'wrap' : r.n.style.layout.mode]" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>
        <!-- 그룹(채우기 · 자르기 없는 프레임): 자잘한 점선 네모 — 피그마 그룹 아이콘처럼 -->
        <svg v-else-if="isGroupNode(r.n)" width="16" height="16" viewBox="-2 -2 16 16" aria-hidden="true" class="ic"><rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 1.5" stroke-dashoffset="0.75" fill="none" /></svg>
        <svg v-else-if="LAYER_ICON[r.n.type]" width="16" height="16" viewBox="-2 -2 16 16" aria-hidden="true" class="ic"><path :d="LAYER_ICON[r.n.type]" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>
        <span v-else class="ic ic-box"><EditorIcon name="image" :size="12" /></span>
        <input v-if="renaming === r.n.id" v-select class="sqc txt-in ren" :value="r.n.name" :aria-label="tr('Layer name')" @click.stop @dblclick.stop @keydown.stop @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(r, $event)">
        <span v-else class="name" :title="r.n.name">{{ r.n.name }}</span>
        <span class="tools" :class="{ keep: r.n.hidden || r.n.locked }">
          <button class="sq mini" :class="{ act2: r.n.locked }" :aria-label="r.n.locked ? tr('Unlock') : tr('Lock')" :title="r.n.locked ? tr('Unlock') : tr('Lock')" @click.stop="store.update(r.sid, [r.n.id], { locked: !r.n.locked })">
            <EditorIcon :name="r.n.locked ? 'lock' : 'unlock'" />
          </button>
          <button class="sq mini" :class="{ act2: r.n.hidden }" :aria-label="r.n.hidden ? tr('Show') : tr('Hide')" :title="r.n.hidden ? tr('Show') : tr('Hide')" @click.stop="store.update(r.sid, [r.n.id], { hidden: !r.n.hidden })">
            <EditorIcon :name="r.n.hidden ? 'eye_off' : 'eye'" />
          </button>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tree { display: flex; flex-direction: column; position: relative;
  /* 고른 줄 · 하위 줄 색: 피그마 UI3 처럼 아주 옅은 파랑(브랜드 파랑을 바탕에 섞어서 — 다크에서도 같은 느낌) */
  --lt-sel: var(--iris-sel);
  --lt-under: var(--iris-sel-under); }
.grp-bg { position: absolute; left: 0; right: 0; border-radius: var(--ref-radius-04); pointer-events: none; background: linear-gradient(var(--lt-sel) 0 28px, var(--lt-under) 28px); }
/* 행: 높이 28 고정(호버 때 🔒 👁 가 나와도 높이가 그대로), 글자 열은 섹션 제목과 같은 x+8, 오른쪽 안쪽 2 */
.row { cursor: default; user-select: none; gap: var(--ref-spacing-02) !important; height: 28px; box-sizing: border-box; padding-top: 0 !important; padding-bottom: 0 !important; padding-right: 0 !important; }
/* 화면 줄: 섹션 안이면 한 단계(18) 들여서 */
.srow { padding-left: calc(var(--ref-spacing-06) + var(--d, 0) * 18px) !important; }
/* 피그마 UI3: 호버는 회색, 고른 행은 옅은 파랑(굵기 그대로), 고른 것의 자식은 한 단계 더 옅은 파랑
   brand-primary-lightest(#EEF4FC)만으로는 호버 회색과 구분이 안 돼서, 고른 행은 lightest 와 lighter 를 반씩(≈ 피그마 #E5F4FF) */
/* 고른 줄 · 하위 줄은 행이 아니라 뒤의 .grp-bg 박스 하나가 칠해요(행 자체는 투명) */
.lr.on, .lr.on:hover, .lr.under, .lr.under:hover { --sq-fill: transparent; }
.lr.on { font-weight: 400; color: var(--sys-color-neutral-800); }
.lr.on .ic { color: var(--sys-color-neutral-800); }
/* 컴포넌트(인스턴스): 피그마처럼 보라 이름 · 아이콘 */
.lr.comp .name, .lr.comp .ic { color: var(--iris-component); }
.chev { width: 16px; height: 16px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-01); color: var(--sys-color-neutral-500); }
button.chev:hover { color: var(--sys-color-neutral-800); --sq-fill: var(--interaction-light-gray-hover); }
button.chev:active { --sq-fill: var(--interaction-light-gray-pressed); }
.chev .rot, .chev :deep(svg) { transition: transform .12s ease; }
.chev .rot { transform: rotate(-90deg); }
/* 종류 아이콘: 16 칸 안에 12 · 선 1(피그마 UI3 처럼 작고 가볍게) → 이름 앞 8 */
.ic-box { width: 16px; height: 16px; display: grid; place-items: center; }
.ic { flex: none; color: var(--sys-color-neutral-500); margin-right: var(--ref-spacing-05); }
.name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.ext { display: grid; place-items: center; width: 24px; height: 24px; }
.faded { opacity: .5; }
/* 이름 바꾸기: 흰 바탕 + 1px 파란 선, 행 28 안에 24. 글자가 제자리(x 그대로)에 오도록 왼쪽으로 4 당겨요 */
.ren, .ren:focus { flex: 1; min-width: 0; height: 24px; margin-left: calc(-1 * var(--ref-spacing-04)); padding: 0 var(--ref-spacing-04); background: var(--sys-color-common-white-emphasis); box-shadow: inset 0 0 0 1px var(--sys-color-brand-primary-default); }
.tools { display: none; gap: 0; flex: none; }
/* 🔒 👁: 호버 · 키보드 포커스(행 또는 버튼)일 때만. 마우스로 고른 뒤 남는 포커스로는 계속 보이지 않아요 */
.row:hover .tools, .row:focus-visible .tools, .tools:focus-within, .tools.keep { display: flex; }
/* 행 토글 아이콘: 버튼 24(누르기 좋은 크기) · 아이콘 16 · 누르는 아이콘 색 neutral-700(호버 800) — PRD/08 */
.mini { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-700); }
.mini:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.mini:active { --sq-fill: var(--interaction-light-gray-pressed); }
.mini.act2 { color: var(--sys-color-neutral-700); }
.chev:focus-visible, .mini:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -1px; }
/* 놓을 자리: 두 줄 사이에 따로 얹는 일자 구분선(양 끝 둥글리지 않음) */
.drop-line { position: absolute; left: var(--ref-spacing-04); right: var(--ref-spacing-04); height: 2px; z-index: 3; pointer-events: none; background: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); }
.drop-into { --sq-line: var(--lt-drop); --sq-line-w: 1px; }
/* 놓을 자리 선: 한 단계 옅은 파랑, 양 끝 둥글리지 않은 일자(줄 모서리 squircle 에 잘리지 않게 줄 바탕에 그려요) */
.lr, .srow { --lt-drop: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); }
</style>
