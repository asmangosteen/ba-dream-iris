import type { InjectionKey, Ref } from 'vue'
import { absPos, bindLiteral, descendants, migrate, newId, normAngle, siblings, DEFAULT_STYLE, TYPE_LABEL, type BindKey, type LayerDoc, type LayerNode, type LayerStyle, type LayerType } from './schema'
import { aabb, alignRects, applyVec, distributeRects, invert, layerMatrix, parentMatrix, spaceRects, type AlignKind, type Axis, type Rect } from './geom'
import type { ScreenRow } from '~/composables/useEditor'

/**
 * 레이어 편집 상태: 화면별 레이어 문서 · 선택 · 실행취소 기록 · 자동저장.
 * 모든 변경은 mutate() 를 거칩니다 → 바뀌기 전 모습을 기록에 남기고, 잠시 뒤 DB 에 저장합니다.
 */
export interface SaveState { state: 'idle' | 'saving' | 'saved' | 'error' }
type Entry =
  | { kind?: 'layers'; screenId: string; before: string; after: string }
  | { kind: 'action'; screenId: string | null; undo: () => unknown; redo: () => unknown }

export function createLayerStore(opts: {
  screens: Ref<ScreenRow[]>
  save: (screenId: string, doc: LayerDoc) => Promise<void>
  tokens: Ref<{ name: string; value: string }[]>
}) {
  const docs = reactive<Record<string, LayerDoc>>({})
  const screenId = ref<string | null>(null) // 고른 화면
  const layerIds = ref<string[]>([]) // 고른 레이어(같은 화면 안)
  const editing = ref<string | null>(null) // 글자를 고치는 중인 텍스트 레이어
  const saveState = reactive<SaveState>({ state: 'idle' })
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)
  let clipboard: { nodes: LayerNode[]; rootIds: string[] } | null = null

  function doc(sid: string): LayerDoc {
    if (!docs[sid]) {
      const s = opts.screens.value.find((v) => v.id === sid)
      docs[sid] = migrate(s?.layers)
    }
    return docs[sid]!
  }
  const node = (sid: string, id: string) => doc(sid).nodes[id]
  const snap = (sid: string) => JSON.stringify(doc(sid))

  // --- 자동저장 (화면마다 0.6초 모아서) ---
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Set<string>()
  function scheduleSave(sid: string) {
    pending.add(sid)
    clearTimeout(timers.get(sid))
    timers.set(sid, setTimeout(() => flush(sid), 600))
  }
  async function flush(sid: string) {
    if (!pending.has(sid)) return
    pending.delete(sid)
    saveState.state = 'saving'
    try {
      await opts.save(sid, JSON.parse(snap(sid)))
      if (!pending.size) saveState.state = 'saved'
    } catch {
      saveState.state = 'error'
      pending.add(sid)
    }
  }
  const flushAll = () => Promise.all([...pending].map(flush))

  /** 연결은 그대로인데 값이 바뀐 키(직접 고침 · 끌어서 옮기기 · 크기 바꾸기)는 연결을 풉니다 */
  function detachEdited(sid: string, before: string) {
    const d = doc(sid)
    const bound = Object.values(d.nodes).filter((n) => n.style.vars)
    if (!bound.length) return
    const prev = JSON.parse(before) as LayerDoc
    for (const n of bound) {
      const p = prev.nodes[n.id]
      if (!p) continue // 새로 생긴 레이어(붙여넣기 등)는 연결을 그대로
      const vars = n.style.vars!
      for (const k of Object.keys(vars) as BindKey[]) {
        if (p.style.vars?.[k] !== vars[k]) continue // 이번 변경이 연결을 바꾼 것
        if (bindLiteral(p, k) !== bindLiteral(n, k)) delete vars[k]
      }
      if (!Object.keys(vars).length) delete n.style.vars
    }
  }
  function record(sid: string, before: string) {
    detachEdited(sid, before)
    const after = snap(sid)
    if (after === before) return
    push({ screenId: sid, before, after })
    scheduleSave(sid)
  }
  function push(e: Entry) {
    undoStack.push(e)
    if (undoStack.length > 200) undoStack.shift()
    redoStack.length = 0
    canUndo.value = true
    canRedo.value = false
  }
  /** 레이어 밖의 변경(화면 옮기기 · 만들기 · 속성)도 실행취소 기록에 넣습니다 */
  const pushAction = (screenId: string | null, undo: () => unknown, redo: () => unknown) => push({ kind: 'action', screenId, undo, redo })
  /** 바꾸기 전 모습을 받아 두는 시작점 (끌기처럼 여러 번 바뀌다가 끝에 한 번 기록할 때) */
  const begin = (sid: string) => snap(sid)
  const commit = (sid: string, before: string) => record(sid, before)
  function mutate<T>(sid: string, fn: (d: LayerDoc) => T): T {
    const before = snap(sid)
    const out = fn(doc(sid))
    record(sid, before)
    return out
  }

  function restore(sid: string, json: string) {
    docs[sid] = JSON.parse(json)
    layerIds.value = layerIds.value.filter((id) => docs[sid]!.nodes[id])
    scheduleSave(sid)
  }
  function undo() {
    const e = undoStack.pop()
    if (!e) return
    redoStack.push(e)
    if (e.kind === 'action') e.undo()
    else { restore(e.screenId, e.before); screenId.value = e.screenId }
    canUndo.value = !!undoStack.length
    canRedo.value = true
  }
  function redo() {
    const e = redoStack.pop()
    if (!e) return
    undoStack.push(e)
    if (e.kind === 'action') e.redo()
    else { restore(e.screenId, e.after); screenId.value = e.screenId }
    canUndo.value = true
    canRedo.value = !!redoStack.length
  }

  // --- 고르기 ---
  function selectScreen(sid: string | null) {
    screenId.value = sid
    layerIds.value = []
    editing.value = null
  }
  function selectLayer(sid: string, id: string | null, additive = false) {
    if (screenId.value !== sid) layerIds.value = []
    screenId.value = sid
    if (!id) { layerIds.value = []; return }
    if (additive) layerIds.value = layerIds.value.includes(id) ? layerIds.value.filter((v) => v !== id) : [...layerIds.value, id]
    else layerIds.value = [id]
  }

  // --- 만들기 · 고치기 · 지우기 ---
  function nextName(d: LayerDoc, type: LayerType) {
    const n = Object.values(d.nodes).filter((v) => v.type === type).length + 1
    return `${TYPE_LABEL[type]} ${n}`
  }
  function add(sid: string, parentId: string | null, part: Partial<LayerNode> & { type: LayerType }): string {
    return mutate(sid, (d) => {
      const id = newId()
      d.nodes[id] = { id, name: nextName(d, part.type), parentId, x: 0, y: 0, w: 100, h: 100, ...part, style: { ...DEFAULT_STYLE[part.type], ...part.style } }
      if (part.type === 'frame') d.nodes[id]!.children = []
      siblings(d, parentId).push(id)
      layerIds.value = [id]
      screenId.value = sid
      return id
    })
  }
  function update(sid: string, ids: string[], patch: Partial<Omit<LayerNode, 'style'>> | ((n: LayerNode) => Partial<LayerNode>)) {
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (n) Object.assign(n, typeof patch === 'function' ? patch(n) : patch)
      }
    })
  }
  function style(sid: string, ids: string[], s: Partial<LayerStyle>) {
    mutate(sid, (d) => { for (const id of ids) { const n = d.nodes[id]; if (n) n.style = { ...n.style, ...s } } })
  }
  /**
   * 변수(토큰) 연결 · 풀기. patch 로 실제 값도 함께 써 넣습니다(연결해도 그리기 · 내보내기는 그 값을 씀).
   * tokenId 가 null 이면 연결만 풀고 값은 그대로 둡니다.
   */
  function bind(sid: string, ids: string[], key: BindKey | BindKey[], tokenId: string | null, patch?: (n: LayerNode) => { node?: Partial<Omit<LayerNode, 'style'>>; style?: Partial<LayerStyle> }) {
    const keys = Array.isArray(key) ? key : [key]
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n) continue
        const p = patch?.(n)
        if (p?.node) Object.assign(n, p.node)
        const vars = { ...(n.style.vars ?? {}) }
        for (const k of keys) {
          if (tokenId) vars[k] = tokenId
          else delete vars[k]
        }
        n.style = { ...n.style, ...p?.style, vars: Object.keys(vars).length ? vars : undefined }
        if (!n.style.vars) delete n.style.vars
      }
    })
  }
  const unbind = (sid: string, ids: string[], key: BindKey | BindKey[], patch?: Parameters<typeof bind>[4]) => bind(sid, ids, key, null, patch)
  function remove(sid: string, ids: string[]) {
    if (!ids.length) return
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n) continue
        const sib = siblings(d, n.parentId)
        const i = sib.indexOf(id)
        if (i >= 0) sib.splice(i, 1)
        for (const k of descendants(d, id)) delete d.nodes[k]
      }
    })
    layerIds.value = []
  }
  /** 같은 부모 안에서 앞(위)·뒤(아래)로. dir: 1 = 한 칸 위, -1 = 한 칸 아래, 'top' · 'bottom' */
  function arrange(sid: string, ids: string[], dir: 1 | -1 | 'top' | 'bottom') {
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n) continue
        const sib = siblings(d, n.parentId)
        const i = sib.indexOf(id)
        sib.splice(i, 1)
        const j = dir === 'top' ? sib.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(sib.length, i + dir))
        sib.splice(j, 0, id)
      }
    })
  }
  /** 레이어 목록에서 끌어 놓기: target 바로 위(그리는 순서로는 다음)에 놓고, target 이 프레임이면 into 일 때 그 안으로 */
  function moveTo(sid: string, id: string, targetId: string | null, into = false) {
    if (id === targetId) return
    const d = doc(sid)
    if (targetId && descendants(d, id).includes(targetId)) return // 자기 안으로는 못 넣음
    mutate(sid, (dd) => {
      const n = dd.nodes[id]!
      const abs = absPos(dd, id)
      siblings(dd, n.parentId).splice(siblings(dd, n.parentId).indexOf(id), 1)
      const t = targetId ? dd.nodes[targetId] : null
      const parentId = into && t?.type === 'frame' ? t.id : t ? t.parentId : null
      const sib = siblings(dd, parentId)
      if (into && t?.type === 'frame') sib.push(id)
      else sib.splice(t ? sib.indexOf(t.id) + 1 : sib.length, 0, id)
      n.parentId = parentId
      // 화면에서 보이는 위치는 그대로
      const p = parentId ? absPos(dd, parentId) : { x: 0, y: 0 }
      n.x = abs.x - p.x
      n.y = abs.y - p.y
    })
  }

  function copy() {
    const sid = screenId.value
    if (!sid || !layerIds.value.length) return false
    const d = doc(sid)
    const ids = layerIds.value.filter((id) => !layerIds.value.some((o) => o !== id && descendants(d, o).includes(id)))
    clipboard = { rootIds: ids, nodes: ids.flatMap((id) => descendants(d, id)).map((k) => JSON.parse(JSON.stringify(d.nodes[k]))) }
    return true
  }
  /** 붙여넣기: 고른 프레임 레이어가 있으면 그 안, 아니면 원래 부모(없으면 화면) — 10px 비켜서 */
  function paste(targetSid?: string, offset = 10) {
    const sid = targetSid ?? screenId.value
    if (!clipboard || !sid) return
    const cb = clipboard
    mutate(sid, (d) => {
      const map = new Map(cb.nodes.map((n) => [n.id, newId()]))
      const sel = layerIds.value.length === 1 ? d.nodes[layerIds.value[0]!] : undefined
      const into = sel?.type === 'frame' && !cb.rootIds.includes(sel.id) ? sel.id : null
      const fresh: string[] = []
      for (const n of cb.nodes) {
        const id = map.get(n.id)!
        const root = cb.rootIds.includes(n.id)
        const parentId = root ? (into ?? (n.parentId && d.nodes[n.parentId] ? n.parentId : null)) : map.get(n.parentId!)!
        d.nodes[id] = { ...n, id, parentId, children: n.children?.map((c) => map.get(c)!), x: root ? n.x + offset : n.x, y: root ? n.y + offset : n.y }
        if (root) { siblings(d, parentId).push(id); fresh.push(id) }
      }
      layerIds.value = fresh
      screenId.value = sid
    })
  }
  function duplicate() { if (copy()) paste() }
  /** ⌥ 끌기 복제: 같은 자리에 복제하고 복제본을 고름 */
  function duplicateInPlace() { const keep = clipboard; if (copy()) paste(undefined, 0); clipboard = keep }

  // --- 고르기 이동 (피그마: ⌘A · Enter · Shift+Enter · Tab) ---
  function selectAll(sid: string) {
    const d = doc(sid)
    const first = layerIds.value[0] ? d.nodes[layerIds.value[0]] : undefined
    layerIds.value = [...(first ? siblings(d, first.parentId) : d.rootIds)].filter((id) => !d.nodes[id]?.locked && !d.nodes[id]?.hidden)
    screenId.value = sid
  }
  function selectChildren(sid: string) {
    const d = doc(sid)
    if (!layerIds.value.length) { layerIds.value = [...d.rootIds]; screenId.value = sid; return }
    const kids = layerIds.value.flatMap((id) => d.nodes[id]?.children ?? [])
    if (kids.length) layerIds.value = kids
  }
  /** 부모로: 레이어 → 부모 프레임, 맨 위 레이어 → 화면 */
  function selectParent(sid: string) {
    const d = doc(sid)
    const n = layerIds.value[0] ? d.nodes[layerIds.value[0]] : undefined
    if (!n) return
    layerIds.value = n.parentId ? [n.parentId] : []
  }
  function selectSibling(sid: string, dir: 1 | -1) {
    const d = doc(sid)
    const n = layerIds.value[0] ? d.nodes[layerIds.value[0]] : undefined
    if (!n) { if (d.rootIds.length) layerIds.value = [d.rootIds[dir === 1 ? d.rootIds.length - 1 : 0]!]; return }
    const sib = siblings(d, n.parentId)
    // 목록은 위가 앞(그리는 순서의 뒤)이라 Tab 은 그리는 순서로 한 칸 앞
    const i = sib.indexOf(n.id) - dir
    layerIds.value = [sib[(i + sib.length) % sib.length]!]
  }

  // --- 묶기 (⌘G · ⌥⌘G) / 풀기 (⇧⌘G) ---
  function wrap(sid: string, ids: string[], kind: 'group' | 'frame') {
    const d0 = doc(sid)
    const list = ids.filter((id) => d0.nodes[id])
    if (!list.length) return
    const parentId = d0.nodes[list[0]!]!.parentId
    const same = list.filter((id) => d0.nodes[id]!.parentId === parentId)
    mutate(sid, (d) => {
      const boxes = same.map((id) => ({ id, ...absPos(d, id), w: d.nodes[id]!.w, h: d.nodes[id]!.h }))
      const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y))
      const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h))
      const p = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
      const id = newId()
      const sib = siblings(d, parentId)
      const at = Math.max(...same.map((k) => sib.indexOf(k)))
      d.nodes[id] = { id, type: 'frame', name: nextName(d, 'frame').replace('프레임', kind === 'group' ? '그룹' : '프레임'), parentId, x: x0 - p.x, y: y0 - p.y, w: x1 - x0, h: y1 - y0, children: [], style: kind === 'group' ? { clip: false } : { fill: '#FFFFFF', clip: true } }
      sib.splice(at + 1, 0, id)
      for (const b of boxes.sort((a, c) => sib.indexOf(a.id) - sib.indexOf(c.id))) {
        sib.splice(sib.indexOf(b.id), 1)
        const n = d.nodes[b.id]!
        n.parentId = id; n.x = b.x - x0; n.y = b.y - y0
        d.nodes[id]!.children!.push(b.id)
      }
      layerIds.value = [id]
    })
  }
  function unwrap(sid: string, ids: string[]) {
    const d0 = doc(sid)
    const frames = ids.filter((id) => d0.nodes[id]?.type === 'frame')
    if (!frames.length) return
    mutate(sid, (d) => {
      const freed: string[] = []
      for (const fid of frames) {
        const f = d.nodes[fid]!
        const sib = siblings(d, f.parentId)
        const at = sib.indexOf(fid)
        const kids = [...(f.children ?? [])]
        for (const k of kids) { const n = d.nodes[k]!; n.parentId = f.parentId; n.x += f.x; n.y += f.y }
        sib.splice(at, 1, ...kids)
        delete d.nodes[fid]
        freed.push(...kids)
      }
      layerIds.value = freed
    })
  }

  // --- 속성 복사 · 붙여넣기 (⌥⌘C · ⌥⌘V) ---
  let styleClip: LayerStyle | null = null
  function copyStyle() { const sid = screenId.value; const n = sid && layerIds.value[0] ? node(sid, layerIds.value[0]) : undefined; if (n) { styleClip = { ...n.style }; return true } return false }
  function pasteStyle() { const sid = screenId.value; if (sid && styleClip && layerIds.value.length) style(sid, layerIds.value, styleClip) }

  // --- 회전 · 뒤집기 ---
  function rotateBy(sid: string, ids: string[], deg: number) {
    update(sid, ids, (n) => ({ rotation: normAngle((n.rotation ?? 0) + deg) || undefined }))
  }
  function flip(sid: string, ids: string[], axis: 'x' | 'y') {
    const d0 = doc(sid)
    const list = ids.filter((id) => d0.nodes[id] && !d0.nodes[id]!.locked)
    if (!list.length) return
    update(sid, list, (n) => (axis === 'x' ? { flipX: !n.flipX || undefined } : { flipY: !n.flipY || undefined }))
  }

  // --- 정렬 · 균등 분배 · 간격 맞추기 (돌린 레이어는 감싸는 상자 기준) ---
  /** 화면 기준 감싸는 상자 */
  function box(d: LayerDoc, id: string): Rect { const n = d.nodes[id]!; return aabb(layerMatrix(d, id), n.w, n.h) }
  /** 화면 기준으로 (dx, dy) 옮기기 — 돌린 부모 안이면 부모 좌표로 바꿔서 */
  function shiftBy(d: LayerDoc, id: string, dx: number, dy: number) {
    const n = d.nodes[id]!
    const v = applyVec(invert(parentMatrix(d, id)), dx, dy)
    n.x = Math.round(n.x + v.x); n.y = Math.round(n.y + v.y)
  }
  function place(sid: string, ids: string[], next: (rs: Rect[]) => { x: number; y: number }[]) {
    const d0 = doc(sid)
    const list = ids.filter((id) => d0.nodes[id] && !d0.nodes[id]!.locked)
    if (!list.length) return
    mutate(sid, (d) => {
      const rs = list.map((id) => box(d, id))
      const out = next(rs)
      list.forEach((id, i) => shiftBy(d, id, out[i]!.x - rs[i]!.x, out[i]!.y - rs[i]!.y))
    })
  }
  /** 하나면 부모(화면 · 프레임) 기준, 여러 개면 고른 범위 기준 */
  function align(sid: string, ids: string[], kind: AlignKind) {
    const d = doc(sid)
    const first = ids.map((id) => d.nodes[id]).find((n) => n)
    if (!first) return
    let area: Rect | undefined
    if (ids.length === 1) {
      if (first.parentId && d.nodes[first.parentId]) area = box(d, first.parentId)
      else {
        const s = opts.screens.value.find((v) => v.id === sid)
        if (!s || !s.width || !s.height) return // 캔버스 위 레이어 하나는 기준이 없어요
        area = { x: 0, y: 0, w: s.width, h: s.height }
      }
    }
    place(sid, ids, (rs) => alignRects(rs, kind, area))
  }
  function distribute(sid: string, ids: string[], axis: Axis) { if (ids.length >= 3) place(sid, ids, (rs) => distributeRects(rs, axis)) }
  function space(sid: string, ids: string[], axis: Axis, gap: number) { if (ids.length >= 2) place(sid, ids, (rs) => spaceRects(rs, axis, gap)) }
  const boxes = (sid: string, ids: string[]) => { const d = doc(sid); return ids.filter((id) => d.nodes[id]).map((id) => box(d, id)) }

  /** 색 값 → CSS 색 (토큰 참조는 디자인 시스템 토큰 값으로) */
  function color(v?: string): string | undefined {
    if (!v) return undefined
    if (!v.startsWith('token:')) return v
    const name = v.slice(6)
    const t = opts.tokens.value.find((x) => x.name === name)
    return t && /^#|^rgb|^hsl/.test(t.value) ? t.value : undefined
  }

  return {
    docs, screenId, layerIds, editing, saveState, canUndo, canRedo,
    doc, node, begin, commit, mutate, undo, redo, flushAll, pushAction,
    selectScreen, selectLayer, add, update, style, bind, unbind, remove, arrange, moveTo, copy, paste, duplicate, duplicateInPlace, color,
    selectAll, selectChildren, selectParent, selectSibling, wrap, unwrap, copyStyle, pasteStyle, hasClipboard: () => !!clipboard,
    rotateBy, flip, align, distribute, space, boxes,
    absPos: (sid: string, id: string) => absPos(doc(sid), id),
  }
}

export type LayerStore = ReturnType<typeof createLayerStore>
export const LAYER_STORE: InjectionKey<LayerStore> = Symbol('layer-store')
export const useLayerStore = () => inject(LAYER_STORE)!
