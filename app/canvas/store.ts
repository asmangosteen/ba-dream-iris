import type { InjectionKey, Ref } from 'vue'
import { absPos, descendants, migrate, newId, siblings, DEFAULT_STYLE, TYPE_LABEL, type LayerDoc, type LayerNode, type LayerStyle, type LayerType } from './schema'
import type { ScreenRow } from '~/composables/useEditor'

/**
 * 레이어 편집 상태: 화면별 레이어 문서 · 선택 · 실행취소 기록 · 자동저장.
 * 모든 변경은 mutate() 를 거칩니다 → 바뀌기 전 모습을 기록에 남기고, 잠시 뒤 DB 에 저장합니다.
 */
export interface SaveState { state: 'idle' | 'saving' | 'saved' | 'error' }
type Entry = { screenId: string; before: string; after: string }

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

  function record(sid: string, before: string) {
    const after = snap(sid)
    if (after === before) return
    undoStack.push({ screenId: sid, before, after })
    if (undoStack.length > 200) undoStack.shift()
    redoStack.length = 0
    canUndo.value = true
    canRedo.value = false
    scheduleSave(sid)
  }
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
    restore(e.screenId, e.before)
    screenId.value = e.screenId
    canUndo.value = !!undoStack.length
    canRedo.value = true
  }
  function redo() {
    const e = redoStack.pop()
    if (!e) return
    undoStack.push(e)
    restore(e.screenId, e.after)
    screenId.value = e.screenId
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
  function paste(targetSid?: string) {
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
        d.nodes[id] = { ...n, id, parentId, children: n.children?.map((c) => map.get(c)!), x: root ? n.x + 10 : n.x, y: root ? n.y + 10 : n.y }
        if (root) { siblings(d, parentId).push(id); fresh.push(id) }
      }
      layerIds.value = fresh
      screenId.value = sid
    })
  }
  function duplicate() { if (copy()) paste() }

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
    doc, node, begin, commit, mutate, undo, redo, flushAll,
    selectScreen, selectLayer, add, update, style, remove, arrange, moveTo, copy, paste, duplicate, color,
    absPos: (sid: string, id: string) => absPos(doc(sid), id),
  }
}

export type LayerStore = ReturnType<typeof createLayerStore>
export const LAYER_STORE: InjectionKey<LayerStore> = Symbol('layer-store')
export const useLayerStore = () => inject(LAYER_STORE)!
