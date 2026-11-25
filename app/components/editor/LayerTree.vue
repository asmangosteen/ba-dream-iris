<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { descendants, isContainer, isGroupNode, type LayerNode } from '~/canvas/schema'
import { LAYER_ICON } from '~/canvas/icons'
import { radiiOf, rectPath, vectorPath } from '~/canvas/paint'
import { booleanPath } from '~/canvas/boolean'
import { layerMenuItems, markIrisClip, pickedLayers, useLastCopy, useMixScreens, useRenameReq } from '~/composables/useLayerMenu'
import RenameLayers from '~/components/editor/RenameLayers.vue'
import { useLayerStore } from '~/canvas/store'

/** 왼쪽 패널 · 레이어: 화면 → 레이어 트리 (위에 있는 레이어가 위). 이름 바꾸기 · 숨기기 · 잠그기 · 끌어서 순서 바꾸기 */
const props = defineProps<{ screens: ScreenRow[]; multi?: string[]; canvasId?: string | null }>()
const emit = defineEmits<{ 'pick-screen': [id: string]; 'toggle-screen': [id: string]; 'screen-order': [ids: string[]]; 'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'front' | 'back' | 'forward' | 'backward' | 'section'] }>()
const store = useLayerStore()

const closed = ref<Set<string>>(new Set()) // 접은 화면 · 프레임
/** 불리언은 기본 접힘(한 면으로 — 피그마와 같아요): 화살표로 펼치거나, 안쪽 도형을 고르면(캔버스 두 번 누르기 등) 펼쳐져요 */
const opened = ref<Set<string>>(new Set()) // 펼친 불리언
const holdsSel = (k: string) => {
  const [sid, id] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]
  if (store.screenId.value !== sid || !store.layerIds.value.length) return false
  const kids = descendants(store.doc(sid), id)
  return store.layerIds.value.some((x) => x !== id && kids.includes(x))
}
const shut = (k: string, n?: LayerNode | null) => (n?.type === 'boolean' ? !opened.value.has(k) && !holdsSel(k) : closed.value.has(k))
const toggle = (k: string, n?: LayerNode | null) => {
  if (n?.type === 'boolean') { const o = new Set(opened.value); if (shut(k, n)) o.add(k); else o.delete(k); opened.value = o; return }
  const s = new Set(closed.value); if (s.has(k)) s.delete(k); else s.add(k); closed.value = s
}

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
    const d = store.doc(sid)
    const s = new Set(closed.value)
    s.delete(sid)
    for (let p = d.nodes[id]?.parentId; p; p = d.nodes[p]?.parentId) s.delete(sid + ':' + p)
    closed.value = s
    renaming.value = id
    await nextTick()
    document.querySelector('.tree .ren')?.scrollIntoView({ block: 'nearest' })
    return
  }
  const at = new Map(items.value.map((it, k) => [it.kind === 'layer' ? it.r.sid + ':' + it.r.n.id : '', k]))
  renameMany.value = [...live].sort((a, b) => (at.get(a.sid + ':' + a.id) ?? 1e9) - (at.get(b.sid + ':' + b.id) ?? 1e9))
})
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
  if (dg.sid === r.sid) { store.moveTo(r.sid, dg.id, r.n.id, ov.into); return }
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
  const a = anchor
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
const paste = () => { if (lastCopy.value !== 'screen' && store.hasClipboard()) store.paste(); else emit('screen-action', 'paste') }
function rowMenu(r: Row, e: MouseEvent) {
  if (!isSel(r)) store.selectLayer(r.sid, r.n.id)
  ctx.open(e, layerMenuItems(store, r.sid, [...store.layerIds.value], { lastCopy, paste }))
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
      <div v-if="it.kind === 'screen'" v-for="s in [it.s]" :key="s.id" role="treeitem" tabindex="0" :aria-selected="screenOn(s)" :class="['sq', 'nav-item', 's', 'row', 'lr', 'srow', { on: screenOn(s), under: !screenOn(s) && it.under, 'drop-into': over?.id === 'screen:' + s.id && over.into }]" :style="{ '--d': it.depth }" :draggable="!isCanvasRow(s)" @dragstart="screenDrag = s.id; $event.dataTransfer && ($event.dataTransfer.effectAllowed = 'move')" @dragend="screenDrag = null; over = null" @click="$event.shiftKey || $event.metaKey || $event.ctrlKey ? emit('toggle-screen', s.id) : emit('pick-screen', s.id)" @dragover="onDragOverScreen($event, s)" @dragleave="over = null" @drop.prevent="onDropScreen(s)" @contextmenu="screenMenu(s, $event)" @keydown.enter.self.prevent="emit('pick-screen', s.id)" @keydown.space.self.prevent="emit('pick-screen', s.id)">
        <button v-if="s.source === 'native' && store.doc(s.id).rootIds.length" class="sq chev" :aria-label="closed.has(s.id) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(s.id)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: closed.has(s.id) }" /></button>
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
        @click="pick(r, $event)"
        @contextmenu="rowMenu(r, $event)"
        @keydown.enter.self.prevent="pick(r, $event)"
        @keydown.space.self.prevent="pick(r, $event)"
        @keydown.f2.self.prevent="renameReq = isSel(r) ? pickedLayers(store, store.screenId.value!, [...store.layerIds.value]) : [{ sid: r.sid, id: r.n.id }]"
        @dblclick="renaming = r.n.id"
        @dragstart="dragging = { sid: r.sid, id: r.n.id }; $event.dataTransfer && ($event.dataTransfer.effectAllowed = 'move')"
        @dragover="onDragOver($event, r)"
        @dragleave="over = null"
        @drop.prevent="onDrop(r)"
        @dragend="dragging = null; over = null"
      >
        <button v-if="(isContainer(r.n) && r.n.children?.length) || (r.n.type === 'section' && hasScreens(r.n.id))" class="sq chev" :aria-label="shut(r.sid + ':' + r.n.id, r.n) ? tr('Expand') : tr('Collapse')" @click.stop="toggle(r.sid + ':' + r.n.id, r.n)"><EditorIcon name="chevron_down" :size="12" :class="{ rot: shut(r.sid + ':' + r.n.id, r.n) }" /></button>
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
        <input v-if="renaming === r.n.id" v-select class="sqc txt-in ren" :value="r.n.name" :aria-label="tr('Layer name')" @click.stop @dblclick.stop @keydown.stop @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null" @blur="rename(r, $event)">
        <span v-else class="name">{{ r.n.name }}</span>
        <span v-if="r.n.isMask && renaming !== r.n.id" class="mk-lab">{{ tr('Mask') }}</span>
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
