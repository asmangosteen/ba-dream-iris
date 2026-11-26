<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { descendants, isContainer, isGroupNode, type LayerNode } from '~/canvas/schema'
import { LAYER_ICON } from '~/canvas/icons'
import { radiiOf, rectPath, vectorPath } from '~/canvas/paint'
import { booleanPath } from '~/canvas/boolean'
import { layerMenuItems, markIrisClip, pickedLayers, useLastCopy, useMixScreens, useRenameReq, useToastReq } from '~/composables/useLayerMenu'
import RenameLayers from '~/components/editor/RenameLayers.vue'
import { useLayerStore } from '~/canvas/store'

/** 왼쪽 패널 · 레이어: 화면 → 레이어 트리 (위에 있는 레이어가 위). 이름 바꾸기 · 숨기기 · 잠그기 · 끌어서 순서 바꾸기 */
const props = defineProps<{ screens: ScreenRow[]; multi?: string[]; canvasId?: string | null }>()
const emit = defineEmits<{ 'pick-screen': [id: string]; 'toggle-screen': [id: string]; 'screen-order': [ids: string[]]; 'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'front' | 'back' | 'forward' | 'backward' | 'section'] }>()
const store = useLayerStore()

/** 펼친 화면 · 프레임(피그마처럼 처음엔 접혀 있어요 — 캔버스에서 고르면 그 레이어까지 펼치고 목록을 그 줄로 옮겨요) */
const expanded = ref<Set<string>>(new Set())
const closed = computed(() => ({ has: (k: string) => !expanded.value.has(k) }))
/** 불리언은 기본 접힘(한 면으로 — 피그마와 같아요): 화살표로 펼치거나, 안쪽 도형을 고르면(캔버스 두 번 누르기 등) 펼쳐져요 */
const opened = ref<Set<string>>(new Set()) // 펼친 불리언
const holdsSel = (k: string) => {
  const [sid, id] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]
  if (store.screenId.value !== sid || !store.layerIds.value.length) return false
  const kids = descendants(store.doc(sid), id)
  return store.layerIds.value.some((x) => x !== id && kids.includes(x))
}
const shut = (k: string, n?: LayerNode | null) => (n?.type === 'boolean' ? !opened.value.has(k) && !holdsSel(k) : closed.value.has(k))
/** 접기 · 펼치기. deep(⌥ 클릭): 안쪽 프레임 · 그룹까지 모두 함께(피그마와 같아요) */
const toggle = (k: string, n?: LayerNode | null, deep = false) => {
  if (n?.type === 'boolean' && !deep) { const o = new Set(opened.value); if (shut(k, n)) o.add(k); else o.delete(k); opened.value = o; return }
  const open = shut(k, n)
  const keys = [k]
  if (deep) {
    // 화면 줄이면 그 화면 전체, 레이어 줄이면 그 레이어 아래(캔버스 id 'page:…' 에도 ':' 가 있어 화면 목록으로 가려요)
    const sid = props.screens.some((v) => v.id === k) ? k : k.slice(0, k.lastIndexOf(':'))
    const d = store.doc(sid)
    const roots = k === sid ? d.rootIds : [k.slice(k.lastIndexOf(':') + 1)]
    for (const r of roots) for (const id of descendants(d, r)) if (isContainer(d.nodes[id])) keys.push(sid + ':' + id)
  }
  const s = new Set(expanded.value), o = new Set(opened.value)
  for (const x of keys) { if (open) { s.add(x); o.add(x) } else { s.delete(x); o.delete(x) } }
  expanded.value = s; opened.value = o
}
/** 고른 레이어까지 펼치기 + 목록을 그 줄로(피그마와 같아요) */
function reveal(sid: string, ids: string[]) {
  const d = store.doc(sid)
  const s = new Set(expanded.value)
  const before = s.size
  if (!sid.startsWith('page:')) s.add(sid)
  for (const id of ids) for (let p = d.nodes[id]?.parentId; p; p = d.nodes[p]?.parentId) s.add(sid + ':' + p)
  if (s.size !== before) expanded.value = s
  // 사이드바가 접혀 있으면 스크롤하지 않아요(보이지 않는 목록 때문에 패널 · 편집기가 밀리지 않게)
  nextTick(() => { const el = document.querySelector<HTMLElement>(`.tree [data-key="${sid}:${ids[ids.length - 1]}"]`); if (el && !el.closest('.collapsed')) el.scrollIntoView({ block: 'nearest' }) })
}
watch(() => [store.screenId.value, store.layerIds.value.join()] as const, ([sid]) => { if (sid && store.layerIds.value.length) reveal(sid, [...store.layerIds.value]) })
/** ⌥L 모든 레이어 접기(피그마와 같아요) */
function onWinKey(e: KeyboardEvent) {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.code !== 'KeyL') return
  if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return
  e.preventDefault()
  expanded.value = new Set()
  opened.value = new Set()
}
onMounted(() => window.addEventListener('keydown', onWinKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWinKey))
/** 줄에 마우스를 올리면 캔버스에도 테두리(피그마와 같아요) */
const hover = useState<{ sid: string; id: string | null } | null>('iris-hover', () => null)

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
      if (isContainer(n) && !shut(s.id + ':' + id, n)) walk(n.children ?? [], depth + 1, under || sel.has(id))
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
        if (shut(c.id + ':' + id, n)) continue
        if (isContainer(n)) walk(n.children ?? [], depth + 1, under || sel.has(id))
        if (n.type === 'section') for (const s of [...props.screens].reverse()) if (inSec.get(s.id) === id) pushScreen(s, depth + 1, under || sel.has(id))
      }
    }
    walk(d.rootIds, 0, false)
  }
  // 화면도 레이어처럼 앞(나중에 그리는 것)이 위로 — 맨 앞으로 보내면 목록 맨 위에 와요(피그마와 같아요)
  for (const s of [...props.screens].reverse()) if (!isCanvasRow(s) && !inSec.has(s.id)) pushScreen(s, 0, false)
  return out
})
/**
 * 하위가 깊으면 레이어 목록을 가로로 스크롤해서 끝까지 볼 수 있게(피그마와 같아요): 가장 깊은 줄의 들여쓰기 + 아이콘 + 이름 최소 폭만큼 목록 폭을 잡아요
 */
const treeMin = computed(() => {
  const deepest = Math.max(0, ...items.value.map((it) => (it.kind === 'layer' ? it.r.depth : it.depth)))
  return `calc(var(--ref-spacing-06) + ${deepest * 18}px + 180px)`
})
const itemKey = (it: Item) => (it.kind === 'screen' ? 's:' + it.s.id : it.r.sid + ':' + it.r.n.id)
const mixScreens = useMixScreens()
/** 고른 화면: 여러 화면 · 레이어와 함께 고른 화면(섞어 고르기)도 */
const screenOn = (s: ScreenRow) => mixScreens.value.includes(s.id) || (props.multi?.length ? props.multi.includes(s.id) : store.screenId.value === s.id && !store.layerIds.value.length)

const renaming = ref<string | null>(null)
/**
 * 이름 바꾸기 요청(우클릭 'Rename' · ⌘R): 하나면 그 줄에서 바로(접혀 있으면 펼쳐서), 여러 개면 'Rename N layers' 창 — 목록 순서(위 → 아래)로
 */
const renameReq = useRenameReq()
const renameMany = ref<{ sid: string; id: string }[] | null>(null)
watch(renameReq, async (req) => {
  if (!req?.length) return
  renameReq.value = null
  const live = req.filter((x) => store.doc(x.sid).nodes[x.id])
  if (!live.length) return
  if (live.length === 1) {
    const { sid, id } = live[0]!
    // 접힌 부모 · 화면 펼치기
    reveal(sid, [id])
    renaming.value = id
    await nextTick()
    document.querySelector('.tree .ren')?.scrollIntoView({ block: 'nearest' })
    return
  }
  const at = new Map(items.value.map((it, k) => [it.kind === 'layer' ? it.r.sid + ':' + it.r.n.id : '', k]))
  renameMany.value = [...live].sort((a, b) => (at.get(a.sid + ':' + a.id) ?? 1e9) - (at.get(b.sid + ':' + b.id) ?? 1e9))
})
/** 이름 바꾸는 중 Tab · ⇧Tab: 지금 이름을 저장하고 다음 · 이전 레이어 이름 바꾸기로(피그마와 같아요) */
function renameNext(r: Row, dir: 1 | -1, e: KeyboardEvent) {
  const v = (e.target as HTMLInputElement).value.trim()
  renaming.value = null
  if (v && v !== r.n.name) store.update(r.sid, [r.n.id], { name: v })
  const rows = layerRows()
  const nx = rows[rows.findIndex((x) => x.sid === r.sid && x.n.id === r.n.id) + dir]
  if (!nx) return
  store.selectLayer(nx.sid, nx.n.id)
  nextTick(() => (renaming.value = nx.n.id))
}
const layerRows = () => items.value.filter((it) => it.kind === 'layer').map((it) => (it as { r: Row }).r)
/**
 * 목록에 초점이 있을 때 키(피그마와 같아요): ↑ ↓ 위 · 아래 줄 고르기(⇧ 더하기), ← → 접기 · 펼치기(← 를 한 번 더 누르면 부모로), Enter · Space 고르기.
 * 캔버스 단축키(방향키로 옮기기 · Enter 안으로)로 새지 않게 막아요
 */
function rowKey(it: Item, e: KeyboardEvent) {
  const k = e.key
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(k) || e.metaKey || e.ctrlKey || e.altKey) return
  e.preventDefault()
  e.stopPropagation()
  const key = itemKey(it)
  if (k === 'Enter' || k === ' ') { if (it.kind === 'layer') pick(it.r, e); else emit('pick-screen', it.s.id); return }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    const list = items.value
    const nx = list[list.findIndex((x) => itemKey(x) === key) + (k === 'ArrowDown' ? 1 : -1)]
    if (!nx) return
    if (nx.kind === 'layer') { if (e.shiftKey && store.screenId.value === nx.r.sid) store.selectLayer(nx.r.sid, nx.r.n.id, true); else store.selectLayer(nx.r.sid, nx.r.n.id) }
    else emit('pick-screen', nx.s.id)
    nextTick(() => document.querySelector<HTMLElement>(`.tree [data-key="${itemKey(nx).replace(/^s:/, '')}"]`)?.focus())
    return
  }
  const tk = it.kind === 'screen' ? it.s.id : it.r.sid + ':' + it.r.n.id
  const n = it.kind === 'layer' ? it.r.n : null
  const can = it.kind === 'screen' ? store.doc(it.s.id).rootIds.length > 0 : !!n && isContainer(n) && !!n.children?.length
  const isShut = it.kind === 'screen' ? closed.value.has(it.s.id) : shut(tk, n)
  if (k === 'ArrowRight') { if (can && isShut) toggle(tk, n); return }
  if (can && !isShut) { toggle(tk, n); return }
  // 이미 접혀 있으면 부모 줄로
  if (it.kind === 'layer') {
    const p = it.r.n.parentId
    if (p) store.selectLayer(it.r.sid, p); else if (!it.r.sid.startsWith('page:')) emit('pick-screen', it.r.sid)
    nextTick(() => document.querySelector<HTMLElement>(`.tree [data-key="${p ? it.r.sid + ':' + p : it.r.sid}"]`)?.focus())
  }
}
/** 눈 · 자물쇠를 누른 채 위아래로 끌면 지나간 줄도 같은 상태로(피그마와 같아요) — 한 번에 되돌려요 */
const paint = ref<{ key: 'hidden' | 'locked'; val: boolean; sids: string[] } | null>(null)
function paintStart(r: Row, key: 'hidden' | 'locked', e: PointerEvent) {
  if (e.button !== 0) return
  const val = !r.n[key]
  store.hold(r.sid)
  paint.value = { key, val, sids: [r.sid] }
  store.update(r.sid, [r.n.id], { [key]: val || undefined })
  const end = () => { const p = paint.value; paint.value = null; p?.sids.forEach((x) => store.release(x)) }
  window.addEventListener('pointerup', end, { once: true })
}
function paintOver(r: Row, key: 'hidden' | 'locked') {
  const p = paint.value
  if (!p || p.key !== key || !!r.n[key] === p.val) return
  if (!p.sids.includes(r.sid)) { store.hold(r.sid); p.sids.push(r.sid) }
  store.update(r.sid, [r.n.id], { [key]: p.val || undefined })
}
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
const over = ref<{ id: string; into: boolean; below?: boolean; y?: number } | null>(null)
/** 끄는 줄: 고른 줄을 끌면 같은 문서에서 고른 것 전부(목록 순서대로) — 피그마와 같아요 */
function dragIds(dg: { sid: string; id: string }): string[] {
  if (store.screenId.value !== dg.sid || !store.layerIds.value.includes(dg.id) || store.layerIds.value.length < 2) return [dg.id]
  const d = store.doc(dg.sid)
  const top = store.layerIds.value.filter((id) => !store.layerIds.value.some((o) => o !== id && descendants(d, o).includes(id)))
  const order = new Map(layerRows().map((x, i) => [x.sid + ':' + x.n.id, i]))
  return top.sort((a, b) => (order.get(dg.sid + ':' + a) ?? 0) - (order.get(dg.sid + ':' + b) ?? 0))
}
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
  // 아래쪽이면 그 줄 아래에(피그마와 같아요) — 펼친 프레임의 아래쪽은 그 안 맨 위
  const below = !into && e.clientY > rect.top + rect.height / 2 && !(isContainer(r.n) && !shut(r.sid + ':' + r.n.id, r.n) && r.n.children?.length)
  over.value = { id: r.n.id, into, below, y: (rowIdx(r.sid + ':' + r.n.id) + (below ? 1 : 0)) * 28 }
}
/**
 * 화면(프레임) 끌어서 순서 바꾸기(레이어처럼): 화면 줄 위쪽 반이면 그 위로, 아래쪽 반이면 그 아래로.
 * 목록은 앞(나중에 그리는 것)이 위라서, 놓은 자리를 그리는 순서로 뒤집어 넘겨요
 */
const screenDrag = ref<string | null>(null)
const screenBelow = ref(false)
function onScreenDrop(target: ScreenRow) {
  const from = screenDrag.value, below = screenBelow.value
  screenDrag.value = null
  over.value = null
  if (!from || from === target.id) return
  const panel = props.screens.filter((v) => !isCanvasRow(v)).map((v) => v.id).reverse() // 목록 순서(위 → 아래)
  const rest = panel.filter((id) => id !== from)
  const at = rest.indexOf(target.id) + (below ? 1 : 0)
  const next = [...rest.slice(0, at), from, ...rest.slice(at)]
  if (next.join() !== panel.join()) emit('screen-order', [...next].reverse())
}
/** 화면 줄 위: 그 화면 안 맨 위로 */
function onDragOverScreen(e: DragEvent, s: ScreenRow) {
  if (screenDrag.value) {
    if (isCanvasRow(s)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    screenBelow.value = e.clientY > rect.top + rect.height / 2
    const i = rowIdx('s:' + s.id)
    over.value = { id: 'screen:' + s.id, into: false, y: (screenBelow.value ? i + 1 : i) * 28 }
    return
  }
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
  if (dg.sid === r.sid) {
    const ids = dragIds(dg).filter((id) => id !== r.n.id)
    // 목록 순서를 지키며 한 번에(실행취소 한 번): 위 → 아래로 하나씩 대상 바로 위(아래면 거꾸로)에 끼워요
    store.batch(() => { for (const id of ov.below ? [...ids].reverse() : ids) store.moveTo(r.sid, id, r.n.id, ov.into, !!ov.below) })
    return
  }
  // 다른 화면 · 캔버스: 먼저 그 문서로 옮기고, 그 안에서 자리(앞 · 안으로)를 맞춰요
  const target = store.doc(r.sid).nodes[r.n.id]
  moveAcross(dg.sid, dg.id, r.sid, ov.into ? r.n.id : target?.parentId ?? null)
  store.moveTo(r.sid, dg.id, r.n.id, ov.into)
}
function onDropScreen(s: ScreenRow) {
  if (screenDrag.value) { onScreenDrop(s); return }
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
// 다른 문서에서 함께 고른 것(xsel — 캔버스 위 레이어 + 프레임 안 레이어)도 고른 줄로
const isSel = (r: Row) => (store.screenId.value === r.sid && store.layerIds.value.includes(r.n.id)) || store.xsel.value.some((x) => x.sid === r.sid && x.id === r.n.id)
/**
 * 고른 줄 + 그 하위 줄을 한 박스로 칠하기(피그마 UI3): 행마다 따로 칠하지 않고, 줄 범위에 squircle 박스 하나를 깔아요.
 * 맨 윗줄(고른 것)은 조금 진하게, 아래 하위 줄들은 더 옅게. 줄 높이는 28 고정
 */
/**
 * 고른 줄 바탕 상자: 고른 줄(옅은 파랑) + 그 아래 하위 줄(더 옅은 파랑)을 상자 하나로.
 * 고른 줄이 바로 위 상자에 이어지면(연달아 고름) 새 상자를 만들지 않고 이어 붙여요 — 위 · 아래 끝 모서리만 둥글고 사이는 0(한 묶음처럼)
 */
const groups = computed(() => {
  const out: { top: number; on: boolean[] }[] = []
  let g: { top: number; on: boolean[] } | null = null
  items.value.forEach((it, i) => {
    const on = it.kind === 'screen' ? screenOn(it.s) : isSel(it.r)
    const under = it.kind === 'screen' ? it.under : it.r.under
    if (on && g) g.on.push(true)
    else if (on) { g = { top: i, on: [true] }; out.push(g) }
    else if (under && g) g.on.push(false)
    else g = null
  })
  return out
})
/** 상자 칠: 줄마다 고른 줄 · 하위 줄 색을 28 씩 이어 붙인 세로 줄무늬 */
const groupBg = (on: boolean[]) => `linear-gradient(${on.map((v, k) => `${v ? 'var(--lt-sel)' : 'var(--lt-under)'} ${k * 28}px ${(k + 1) * 28}px`).join(', ')})`
/**
 * 레이어 목록 고르기(피그마와 같아요): ⌘(Ctrl) 클릭 = 하나씩 더하기 · 빼기, Shift 클릭 = 마지막으로 고른 줄부터 여기까지(같은 화면 안)
 */
let anchor: { sid: string; id: string } | null = null
/** 오토 레이아웃 프레임 아이콘(편집기 아이콘 이름): 세로 · 가로 · 줄바꿈 */
const AL_ICON: Record<'vertical' | 'horizontal' | 'wrap', string> = {
  vertical: 'autolayout_vertical',
  horizontal: 'autolayout_horizontal',
  wrap: 'autolayout_wrap',
}
/** 벡터 · 연필 레이어 아이콘: 그 도형의 경로를 16 칸 가운데 12 안에 맞춰서 */
/** 모양 그대로 보이는 레이어 아이콘(사각형 비율 · 둥근 모서리 · 원 호 · 다각형 · 별 · 선 · 펜 · 불리언 결과) */
const SHAPE_ICON = new Set<LayerNode['type']>(['vector', 'path', 'rect', 'ellipse', 'polygon', 'star', 'line', 'boolean'])
function shapeIcon(n: LayerNode, sid: string): { d: string; vb: string } | null {
  if (!SHAPE_ICON.has(n.type) || !(n.w > 0 || n.h > 0)) return null
  const d = n.type === 'boolean' ? booleanPath(store.doc(sid), n) : n.type === 'rect' ? rectPath(n.w, n.h, radiiOf(n.style)) : vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
  if (!d) return null
  // 긴 쪽이 16 중 10(프레임 · 글자 같은 종류 아이콘의 그림 크기와 같게 — 도형만 커 보이지 않게), 비율 그대로
  const size = Math.max(n.w, n.h, 1), box = size / (10 / 16)
  return { d, vb: `${(n.w - box) / 2} ${(n.h - box) / 2} ${box} ${box}` }
}
/** 줄마다 한 번만 계산(모양 · 크기 · 둥글기가 바뀌면 바로 따라 바뀌어요) */
const shapeIcons = computed(() => {
  const m = new Map<string, { d: string; vb: string } | null>()
  for (const it of items.value) if (it.kind === 'layer') m.set(it.r.sid + ':' + it.r.n.id, shapeIcon(it.r.n, it.r.sid))
  return m
})
function pick(r: Row, e: MouseEvent | KeyboardEvent) {
  // 화면(들)만 고른 채 다른 화면 안 레이어를 ⇧ · ⌘ 클릭: 화면은 그대로, 그 레이어를 함께(섞어 고르기)
  if ((e.shiftKey || e.metaKey || e.ctrlKey) && store.screenId.value !== r.sid && !store.layerIds.value.length) {
    const cur = props.multi?.length ? [...props.multi] : store.screenId.value && !store.screenId.value.startsWith('page:') ? [store.screenId.value] : []
    store.selectLayer(r.sid, r.n.id)
    mixScreens.value = cur.filter((id) => id !== r.sid)
    anchor = { sid: r.sid, id: r.n.id }
    return
  }
  // ⌘: 하나씩 더하기 · 빼기 — 다른 문서(캔버스 ↔ 프레임 안)의 레이어도 함께(피그마와 같아요)
  if (e.metaKey || e.ctrlKey) { store.toggleX(r.sid, r.n.id); anchor = { sid: r.sid, id: r.n.id }; return }
  // ⇧ 범위의 시작: 목록에서 마지막으로 누른 줄 — 그 뒤 캔버스에서 골랐으면 지금 고른 것 중 마지막(피그마와 같아요)
  const sidNow = store.screenId.value
  const a = anchor && sidNow === anchor.sid && store.layerIds.value.includes(anchor.id) ? anchor : sidNow && store.layerIds.value.length ? { sid: sidNow, id: store.layerIds.value[store.layerIds.value.length - 1]! } : anchor
  if (e.shiftKey && a && store.layerIds.value.length) {
    const rows = items.value.filter((it) => it.kind === 'layer').map((it) => (it as { r: Row }).r)
    const i = rows.findIndex((x) => x.sid === a.sid && x.n.id === a.id), j = rows.findIndex((x) => x.sid === r.sid && x.n.id === r.n.id)
    if (i >= 0 && j >= 0) {
      // ⇧: 그 사이 줄 모두(단계 · 문서 상관없이 — 부모 + 자식도, 옮기기 · 복사는 맨 위 것만 움직여요). 지금 고른 문서는 그대로, 다른 문서 것은 함께 고르기로
      const range = rows.slice(Math.min(i, j), Math.max(i, j) + 1)
      const primary = store.screenId.value!
      store.layerIds.value = [...new Set([...store.layerIds.value, ...range.filter((x) => x.sid === primary).map((x) => x.n.id)])]
      const extra = range.filter((x) => x.sid !== primary && !store.xsel.value.some((y) => y.sid === x.sid && y.id === x.n.id))
      store.xsel.value = [...store.xsel.value, ...extra.map((x) => ({ sid: x.sid, id: x.n.id }))]
      return
    }
  }
  if (e.shiftKey) { store.toggleX(r.sid, r.n.id); anchor = { sid: r.sid, id: r.n.id }; return }
  store.selectLayer(r.sid, r.n.id)
  anchor = { sid: r.sid, id: r.n.id }
}
/** 마스크에 가려지는 레이어인지: 같은 부모 안에서 보이는 마스크보다 위에 있으면(피그마와 같아요) */
function masked(r: Row) {
  const d = store.doc(r.sid)
  const sib = r.n.parentId ? d.nodes[r.n.parentId]?.children ?? [] : d.rootIds
  const mi = sib.findIndex((c) => d.nodes[c]?.isMask && !d.nodes[c]?.hidden)
  return mi >= 0 && sib.indexOf(r.n.id) > mi
}
/**
 * 마스크 화살표 길이(줄 수): 가려지는 레이어 → 마스크 쪽 바로 옆 형제 줄까지. 사이에 펼친 하위 줄이 있으면 그 줄들을 건너 길게 이어요(피그마와 같아요).
 * 양수면 아래로, 음수면 위로
 */
const maskSpans = computed(() => {
  const at = new Map<string, number>()
  items.value.forEach((it, i) => { if (it.kind === 'layer') at.set(it.r.sid + ':' + it.r.n.id, i) })
  const out = new Map<string, number>()
  for (const it of items.value) {
    if (it.kind !== 'layer' || !masked(it.r)) continue
    const r = it.r, d = store.doc(r.sid)
    const sib = r.n.parentId ? d.nodes[r.n.parentId]?.children ?? [] : d.rootIds
    const nb = sib[sib.indexOf(r.n.id) - 1]
    const me = at.get(r.sid + ':' + r.n.id), to = nb ? at.get(r.sid + ':' + nb) : undefined
    if (me !== undefined && to !== undefined && to !== me) out.set(r.sid + ':' + r.n.id, to - me)
  }
  return out
})
const ROW = 28
/** 화살표 선 길이(px): 아이콘(16) 아래 2px 에서 다음 아이콘 위 2px 까지 */
const arrowLen = (span: number) => Math.abs(span) * ROW - 20
// 우클릭 메뉴(캔버스와 같은 항목 + 이름 바꾸기)
const ctx = useContextMenu()
const lastCopy = useLastCopy()
const toastReq = useToastReq()
const paste = () => { if (lastCopy.value !== 'screen' && store.hasClipboard()) store.paste(); else emit('screen-action', 'paste') }
function rowMenu(r: Row, e: MouseEvent) {
  if (!isSel(r)) store.selectLayer(r.sid, r.n.id)
  ctx.open(e, layerMenuItems(store, r.sid, [...store.layerIds.value], { lastCopy, paste, hint: (t) => (toastReq.value = { text: t, at: Date.now() }) }))
}
function screenMenu(s: ScreenRow, e: MouseEvent) {
  if (s.id.startsWith('page:')) return
  // 이미 고른 화면(여러 개 중 하나)이면 선택은 그대로 — 메뉴 동작이 고른 화면 전부에 가요
  if (!screenOn(s)) emit('pick-screen', s.id)
  ctx.open(e, [
    { label: tr('Copy'), shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy'); markIrisClip() } },
    { label: tr('Paste'), shortcut: '⌘V', action: paste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
    { label: tr('Duplicate'), shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
    { label: tr('Wrap in section'), shortcut: '⌥⌘S', action: () => emit('screen-action', 'section') },
    'sep',
    { label: tr('Bring to front'), shortcut: ']', action: () => emit('screen-action', 'front') },
    { label: tr('Bring forward'), shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
    { label: tr('Send backward'), shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
    { label: tr('Send to back'), shortcut: '[', action: () => emit('screen-action', 'back') },
    'sep',
    { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
  ])
}
</script>

<template>
  <div class="tree" role="tree" :aria-label="tr('Layers')" :style="{ minWidth: treeMin }">
    <RenameLayers v-if="renameMany" :items="renameMany" @close="renameMany = null" />
    <div v-if="dropY !== null" class="drop-line" :style="{ top: dropY - 1 + 'px' }" aria-hidden="true" />
    <div v-for="(g, i) in groups" :key="'g' + i" class="sqc grp-bg" :style="{ top: g.top * 28 + 'px', height: g.on.length * 28 + 'px', background: groupBg(g.on) }" aria-hidden="true" />
    <template v-for="it in items" :key="itemKey(it)">
      <div v-if="it.kind === 'screen'" v-for="s in [it.s]" :key="s.id" role="treeitem" tabindex="0" :aria-selected="screenOn(s)" :class="['sq', 'nav-item', 's', 'row', 'lr', 'srow', { on: screenOn(s), under: !screenOn(s) && it.under, 'drop-into': over?.id === 'screen:' + s.id && over.into }]" :style="{ '--d': it.depth }" :draggable="!isCanvasRow(s)" @dragstart="screenDrag = s.id; $event.dataTransfer && ($event.dataTransfer.effectAllowed = 'move')" @dragend="screenDrag = null; over = null" @click="$event.shiftKey || $event.metaKey || $event.ctrlKey ? emit('toggle-screen', s.id) : emit('pick-screen', s.id)" @dragover="onDragOverScreen($event, s)" @dragleave="over = null" @drop.prevent="onDropScreen(s)" @contextmenu="screenMenu(s, $event)" :data-key="s.id" @keydown.self="rowKey(it, $event)" @mouseenter="hover = { sid: s.id, id: null }" @mouseleave="hover = null">
        <button v-if="s.source === 'native' && store.doc(s.id).rootIds.length" class="sq chev" :aria-label="closed.has(s.id) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(s.id, null, $event.altKey)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: closed.has(s.id) }" /></button>
        <span v-else class="chev" />
        <EditorIcon name="frame" :size="16" class="ic" />
        <span class="name">{{ s.name }}</span>
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
        :data-key="r.sid + ':' + r.n.id"
        @click="pick(r, $event)"
        @contextmenu="rowMenu(r, $event)"
        @keydown.self="rowKey(it, $event)"
        @mouseenter="hover = { sid: r.sid, id: r.n.id }"
        @mouseleave="hover = null"
        @keydown.f2.self.prevent="renameReq = isSel(r) ? pickedLayers(store, store.screenId.value!, [...store.layerIds.value]) : [{ sid: r.sid, id: r.n.id }]"
        @dblclick="renaming = r.n.id"
        @dragstart="dragging = { sid: r.sid, id: r.n.id }; $event.dataTransfer && ($event.dataTransfer.effectAllowed = 'move')"
        @dragover="onDragOver($event, r)"
        @dragleave="over = null"
        @drop.prevent="onDrop(r)"
        @dragend="dragging = null; over = null"
      >
        <button v-if="(isContainer(r.n) && r.n.children?.length) || (r.n.type === 'section' && hasScreens(r.n.id))" class="sq chev" :aria-label="shut(r.sid + ':' + r.n.id, r.n) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(r.sid + ':' + r.n.id, r.n, $event.altKey)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: shut(r.sid + ':' + r.n.id, r.n) }" /></button>
        <span v-else class="chev" />
        <span class="icw">
        <!-- 마스크(피그마와 같아요): 마스크 레이어는 마스크 아이콘, 그 위 가려지는 레이어는 아래로 ↓ 표시 -->
        <EditorIcon v-if="r.n.isMask" name="mask_layer" :size="16" class="ic" />
        <!-- 도형 · 펜 · 불리언: 지금 그 모양 그대로(비율 · 둥글기 · 점을 고치면 바로 따라 바뀌어요) -->
        <svg v-else-if="shapeIcons.get(r.sid + ':' + r.n.id)" width="16" height="16" :viewBox="shapeIcons.get(r.sid + ':' + r.n.id)!.vb" aria-hidden="true" class="ic"><path :d="shapeIcons.get(r.sid + ':' + r.n.id)!.d" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" stroke-linejoin="round" stroke-linecap="round" /></svg>
        <!-- 오토 레이아웃 프레임: 방향별 아이콘(세로 · 가로 · 줄바꿈) — 피그마와 같아요 -->
        <EditorIcon v-else-if="r.n.style.layout" :name="AL_ICON[r.n.style.layout.wrap ? 'wrap' : r.n.style.layout.mode]" :size="16" class="ic" />
        <!-- 그룹(채우기 · 자르기 없는 프레임): 점선 네모 — 피그마 그룹 아이콘처럼 -->
        <EditorIcon v-else-if="isGroupNode(r.n)" name="group" :size="16" class="ic" />
        <EditorIcon v-else-if="LAYER_ICON[r.n.type]" :name="LAYER_ICON[r.n.type]!" :size="16" class="ic" />
        <span v-else class="ic ic-box"><EditorIcon name="image" :size="12" /></span>
        <svg v-if="maskSpans.get(r.sid + ':' + r.n.id)" v-for="sp in [maskSpans.get(r.sid + ':' + r.n.id)!]" :key="'mk' + sp" class="mk-arrow" :class="{ up: sp < 0 }" width="7" :height="arrowLen(sp)" :viewBox="`0 0 7 ${arrowLen(sp)}`" aria-hidden="true"><path :d="`M3.5 0V${arrowLen(sp) - 0.5}M0.5 ${arrowLen(sp) - 3.5}L3.5 ${arrowLen(sp) - 0.5}L6.5 ${arrowLen(sp) - 3.5}`" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <input v-if="renaming === r.n.id" v-select class="sqc txt-in ren" :value="r.n.name" :aria-label="tr('Layer name')" @click.stop @dblclick.stop @keydown.stop @keydown.tab.prevent="renameNext(r, $event.shiftKey ? -1 : 1, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(r, $event)">
        <span v-else class="name">{{ r.n.name }}</span>
        <span v-if="r.n.isMask && renaming !== r.n.id" class="mk-lab">{{ tr('Mask') }}</span>
        <span class="tools" :class="{ keep: r.n.hidden || r.n.locked }">
          <button class="sq mini" :class="{ act2: r.n.locked }" :aria-label="r.n.locked ? tr('Unlock') : tr('Lock')" :title="r.n.locked ? tr('Unlock') : tr('Lock')" @click.stop @pointerdown.stop="paintStart(r, 'locked', $event)" @pointerenter="paintOver(r, 'locked')" @keydown.enter.stop.prevent="store.update(r.sid, [r.n.id], { locked: !r.n.locked })">
            <EditorIcon :name="r.n.locked ? 'lock' : 'unlock'" />
          </button>
          <button class="sq mini" :class="{ act2: r.n.hidden }" :aria-label="r.n.hidden ? tr('Show') : tr('Hide')" :title="r.n.hidden ? tr('Show') : tr('Hide')" @click.stop @pointerdown.stop="paintStart(r, 'hidden', $event)" @pointerenter="paintOver(r, 'hidden')" @keydown.enter.stop.prevent="store.update(r.sid, [r.n.id], { hidden: !r.n.hidden })">
            <EditorIcon :name="r.n.hidden ? 'eye_off' : 'eye'" />
          </button>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 마스크: 아이콘 칸(↓ 를 아이콘 바로 아래 줄 사이에), 오른쪽 'Mask' 표시는 호버하면 🔒 👁 에 자리를 내줘요 */
.icw { position: relative; display: inline-flex; flex: none; }
.mk-arrow { position: absolute; left: 4.5px; top: calc(100% + 2px); color: var(--sys-color-neutral-400); pointer-events: none; z-index: 1; }
/* 마스크가 위 줄에 있을 때(위로): 아이콘 위로 뻗고 머리는 위쪽 */
.mk-arrow.up { top: auto; bottom: calc(100% + 2px); transform: scaleY(-1); }
.mk-lab { flex: none; margin-left: auto; padding: 0 var(--ref-spacing-04); font-size: 12px; color: var(--sys-color-neutral-500); }
.row:hover .mk-lab, .row:focus-visible .mk-lab { display: none; }
.tree { display: flex; flex-direction: column; position: relative;
  /* 고른 줄 · 하위 줄 색: 피그마 UI3 처럼 아주 옅은 파랑(브랜드 파랑을 바탕에 섞어서 — 다크에서도 같은 느낌) */
  --lt-sel: var(--iris-sel);
  --lt-under: var(--iris-sel-under); }
.grp-bg { position: absolute; left: 0; right: 0; border-radius: var(--ref-radius-04); pointer-events: none; background: linear-gradient(var(--lt-sel) 0 28px, var(--lt-under) 28px); }
/* 행: 높이 28 고정(호버 때 🔒 👁 가 나와도 높이가 그대로), 글자 열은 섹션 제목과 같은 x+8, 오른쪽 안쪽 2 */
.row { cursor: default; user-select: none; gap: var(--ref-spacing-02) !important; height: 28px; box-sizing: border-box; padding-top: 0 !important; padding-bottom: 0 !important; padding-right: var(--ref-spacing-04) !important; }
/* 화면 줄: 섹션 안이면 한 단계(18) 들여서 */
.srow { padding-left: calc(var(--ref-spacing-06) + var(--d, 0) * 18px) !important; }
/* 피그마 UI3: 호버는 회색, 고른 행은 옅은 파랑(굵기 그대로), 고른 것의 자식은 한 단계 더 옅은 파랑
   brand-primary-lightest(#EEF4FC)만으로는 호버 회색과 구분이 안 돼서, 고른 행은 lightest 와 lighter 를 반씩(≈ 피그마 #E5F4FF) */
/* 고른 줄 · 하위 줄은 행이 아니라 뒤의 .grp-bg 박스 하나가 칠해요(행 자체는 투명) */
.lr.on, .lr.on:hover, .lr.under, .lr.under:hover { --sq-fill: transparent; }
.lr.on { font-weight: 400; color: var(--sys-color-neutral-800); }
.lr.on .ic { color: var(--sys-color-neutral-700); }
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
/* 숨김 · 잠금 중인 줄: 켜진 것만 늘 보이고, 나머지는 올렸을 때만(피그마와 같아요) */
.row:not(:hover):not(:focus-visible) .tools.keep:not(:focus-within) .mini:not(.act2) { visibility: hidden; }
/* 행 토글 아이콘: 버튼 24(누르기 좋은 크기) · 아이콘 16 · 누르는 아이콘 색 neutral-700(호버 800) — PRD/08 */
.mini { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-600); }
.mini:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-700); }
.mini:active { --sq-fill: var(--interaction-light-gray-pressed); }
.mini.act2 { color: var(--sys-color-neutral-600); }
.chev:focus-visible, .mini:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -1px; }
/* 키보드 포커스: 고른 행은 파란 바탕으로 이미 보이니 테두리 없이, 아닌 행은 안쪽 1px — 옆 행을 덮지 않게 */
.row:focus-visible { outline: 1px solid var(--sys-color-brand-primary-default); outline-offset: -1px; }
.row.on:focus-visible { outline: 0; }
/* 놓을 자리: 두 줄 사이에 따로 얹는 일자 구분선(양 끝 둥글리지 않음) */
.drop-line { position: absolute; left: var(--ref-spacing-04); right: var(--ref-spacing-04); height: 2px; z-index: 3; pointer-events: none; background: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); }
.drop-into { --sq-line: var(--lt-drop); --sq-line-w: 1px; }
/* 놓을 자리 선: 한 단계 옅은 파랑, 양 끝 둥글리지 않은 일자(줄 모서리 squircle 에 잘리지 않게 줄 바탕에 그려요) */
.lr, .srow { --lt-drop: color-mix(in srgb, var(--sys-color-brand-primary-default) 55%, transparent); }
/* 오른쪽 끝 아이콘(🔒 👁 · ↗ · Mask): 하위가 깊어 목록이 옆으로 길어져도 보이는 오른쪽 끝(안쪽 4)에 그대로 붙어 있어요(피그마와 같아요).
   이름 위로 겹칠 때 글자가 비치지 않게 그 줄 바탕색을 깔아요 */
.lr { --row-bg: transparent; }
.lr:hover { --row-bg: var(--sys-color-neutral-100); }
.lr.under, .lr.under:hover { --row-bg: var(--lt-under); }
.lr.on, .lr.on:hover { --row-bg: var(--lt-sel); }
.tools, .ext, .mk-lab { position: sticky; right: 0; z-index: 1; border-radius: var(--ref-radius-02); background: linear-gradient(var(--row-bg), var(--row-bg)), var(--sys-color-common-white-emphasis); }
</style>
