import type { InjectionKey, Ref } from 'vue'
import { relayout as layoutDoc, constrain, boxes0 } from './layout'
import { guessAxis, currentGap, rowsOf } from './geom'
import { shapeVnet } from './vector'
import { radiiOf } from './paint'
import { stripChanged, stripRuns } from './textRuns'
import { booleanLoops, flattenLoops, flattenable, loopsVnet } from './boolean'
import { scaledStyle } from './scale'
import { newSmoothing } from './prefs'
import { moveOrder } from './order'
import { absPos, bindLiteral, descendants, isContainer, isGroupNode, migrate, newId, normAngle, siblings, DEFAULT_STYLE, TYPE_LABEL, type BindKey, type ExportSetting, type LayerDoc, type LayerNode, type LayerStyle, type LayerType } from './schema'
import { aabb, alignRects, applyVec, distributeRects, invert, layerMatrix, localMatrix, parentMatrix, spaceRects, tidyRects, type AlignKind, type Axis, type Rect } from './geom'
import type { ScreenRow } from '~/composables/useEditor'

/**
 * 레이어 편집 상태: 화면별 레이어 문서 · 선택 · 실행취소 기록 · 자동저장.
 * 모든 변경은 mutate() 를 거칩니다 → 바뀌기 전 모습을 기록에 남기고, 잠시 뒤 DB 에 저장합니다.
 */
/** 자동저장 상태. error 면 원인(error)과 다음 자동 재시도 시각(retryAt)을 함께 둬요 */
export interface SaveState { state: 'idle' | 'saving' | 'saved' | 'error'; error?: unknown; retryAt?: number }
type Entry =
  /** selBefore: 바꾸기 전 고른 레이어, selAfter: 되돌리기 직전 고른 레이어 — 실행취소 · 다시하기 때 고른 것도 함께 되돌려요(피그마와 같아요) */
  | { kind?: 'layers'; screenId: string; before: string; after: string; selBefore?: string[]; selAfter?: string[] }
  | { kind: 'action'; screenId: string | null; undo: () => unknown; redo: () => unknown }

export function createLayerStore(opts: {
  screens: Ref<ScreenRow[]>
  save: (screenId: string, doc: LayerDoc) => Promise<void>
  tokens: Ref<{ name: string; value: string }[]>
  /** 저장에 실패한 화면의 내용(이 브라우저에 보관 — 새로 고쳐도 잃지 않게) */
  onUnsaved?: (screenId: string, doc: LayerDoc, error: unknown) => void
  /** 저장에 성공한 화면(보관해 둔 내용을 지워요) */
  onSaved?: (screenId: string) => void
}) {
  const docs = reactive<Record<string, LayerDoc>>({})
  const screenId = ref<string | null>(null) // 고른 화면
  const layerIds = ref<string[]>([]) // 고른 레이어(같은 화면 안)
  /**
   * 다른 문서(캔버스 · 다른 화면)에서 함께 고른 레이어(피그마처럼 캔버스 위 레이어와 프레임 안 레이어를 ⇧ · ⌘ 로 같이) — 레이어 목록 · 캔버스가 함께 표시하고
   * 끌기 · 방향키 · 지우기 · 패널의 칠 · 선 · 모양 값 고치기가 같이 적용돼요. 보통 고르기(한 개 누르기 · 화면 고르기)를 하면 비워요
   */
  const xsel = ref<{ sid: string; id: string }[]>([])
  /** 픽셀에 맞추기: 켜져 있으면(픽셀 그리드 켬) 옮기기 · 크기가 정수, 끄면 소수 둘째 자리까지(페이지 설정 Pixel grid 와 함께 바뀌어요) */
  const pixelSnap = ref(true)
  const snapPx = (v: number) => (pixelSnap.value ? Math.round(v) : Math.round(v * 100) / 100)
  const editing = ref<string | null>(null) // 글자를 고치는 중인 텍스트 레이어
  const saveState = reactive<SaveState>({ state: 'idle' })
  const undoStack: Entry[] = []
  const redoStack: Entry[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)
  /** 복사한 레이어: 어느 문서(sid)에서, 맨 위 레이어마다 문서 안 절대 위치(abs) — 다른 화면 · 캔버스에 같은 자리로 붙이려고 */
  type PasteGeo = { origin: (sid: string) => { x: number; y: number } | null; isCanvas: (sid: string) => boolean; size: (sid: string) => { w: number; h: number } | null }
  /** 캔버스가 알려 준 화면 · 캔버스 좌표(레이어 패널에서 붙여넣어도 같은 자리 계산을 쓰게) */
  let pasteGeo: PasteGeo | undefined
  const setPasteGeo = (g: PasteGeo | undefined) => { pasteGeo = g }
  let clipboard: { nodes: LayerNode[]; rootIds: string[]; sid: string; abs: Record<string, { x: number; y: number }> } | null = null

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
  // 실패하면: 내용을 브라우저에 보관(onUnsaved)하고 2 · 5 · 10 · 30초 간격으로 다시 시도해요(연결이 돌아오면 바로 — flushAll)
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Set<string>()
  const RETRY = [2000, 5000, 10000, 30000]
  let fails = 0
  let retryT: ReturnType<typeof setTimeout> | null = null
  /** 화면을 떠난 편집기: 마지막 저장만 하고 더 다시 시도하지 않아요(새로 연 편집기가 보관본으로 복구해요 — 옛 내용이 덮어쓰지 않게) */
  let disposed = false
  function scheduleSave(sid: string) {
    pending.add(sid)
    clearTimeout(timers.get(sid))
    timers.set(sid, setTimeout(() => flush(sid), 600))
  }
  async function flush(sid: string) {
    if (!pending.has(sid)) return
    pending.delete(sid)
    clearTimeout(timers.get(sid))
    saveState.state = 'saving'
    const body = JSON.parse(snap(sid)) as LayerDoc
    try {
      await opts.save(sid, body)
      opts.onSaved?.(sid)
      if (!pending.size) { fails = 0; saveState.state = 'saved'; saveState.error = undefined; saveState.retryAt = undefined }
    } catch (e) {
      pending.add(sid)
      opts.onUnsaved?.(sid, body, e)
      const wait = RETRY[Math.min(fails, RETRY.length - 1)]!
      fails++
      saveState.state = 'error'
      saveState.error = e
      saveState.retryAt = Date.now() + wait
      if (retryT) clearTimeout(retryT)
      if (!disposed) retryT = setTimeout(() => { retryT = null; flushAll() }, wait)
    }
  }
  /** 남은 저장을 지금 모두(다시 시도 · 연결 복구 · 화면을 떠날 때) */
  const flushAll = () => { if (retryT) { clearTimeout(retryT); retryT = null } return Promise.all([...pending].map(flush)) }
  /** 편집기를 닫을 때: 남은 저장을 한 번 하고 다시 시도는 멈춰요 */
  function dispose() { const p = flushAll(); disposed = true; if (retryT) { clearTimeout(retryT); retryT = null } return p }
  /** 저장 안 된 화면이 있는지(저장 중 · 대기 · 실패) */
  const hasUnsaved = () => pending.size > 0 || saveState.state === 'saving'
  /** 보관해 둔 내용으로 되돌리고 저장(복구) */
  function recoverDoc(sid: string, d: unknown) {
    docs[sid] = migrate(d)
    scheduleSave(sid)
  }

  /** 연결은 그대로인데 값이 바뀐 키(직접 고침 · 끌어서 옮기기 · 크기 바꾸기)는 연결을 풉니다 */
  function detachEdited(sid: string, before: string | LayerDoc) {
    const d = doc(sid)
    const bound = Object.values(d.nodes).filter((n) => n.style.vars)
    if (!bound.length) return
    const prev = typeof before === 'string' ? (JSON.parse(before) as LayerDoc) : before
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
  function record(sid: string, before: string, selBefore?: string[]) {
    detachEdited(sid, before)
    const after = snap(sid)
    if (after === before) return
    push({ screenId: sid, before, after, selBefore: selBefore ?? (screenId.value === sid ? [...layerIds.value] : []) })
    scheduleSave(sid)
  }
  /** 묶음(batch) 중이면 기록을 모아 두었다가 끝에 실행취소 한 번으로 */
  let batching: Entry[] | null = null
  function push(e: Entry) {
    if (batching) { batching.push(e); return }
    undoStack.push(e)
    if (undoStack.length > 200) undoStack.shift()
    redoStack.length = 0
    canUndo.value = true
    canRedo.value = false
  }
  /** 레이어 밖의 변경(화면 옮기기 · 만들기 · 속성)도 실행취소 기록에 넣습니다 */
  const pushAction = (screenId: string | null, undo: () => unknown, redo: () => unknown) => push({ kind: 'action', screenId, undo, redo })
  /** 바꾸기 전 모습을 받아 두는 시작점 (끌기처럼 여러 번 바뀌다가 끝에 한 번 기록할 때) */
  /** 시작할 때 고른 레이어(끌기 · 잡아 두기가 끝나 기록할 때 '바꾸기 전 고른 것'으로) */
  const begunSel = new Map<string, string[]>()
  const selOf = (sid: string) => (screenId.value === sid ? [...layerIds.value] : [])
  const begin = (sid: string) => { begunSel.set(sid, selOf(sid)); return snap(sid) }
  const commit = (sid: string, before: string) => { layoutDoc(doc(sid)); record(sid, before, begunSel.get(sid)); begunSel.delete(sid) }
  /**
   * 잡아 두기(색 판 · 슬라이더를 끄는 동안): 그 사이 바뀐 것은 기록하지 않다가 release 에서 한 번에 기록 · 저장해요.
   * hold 를 여러 번 불러도 처음 모습이 기준이에요
   */
  const held = new Map<string, string>()
  /** 잡아 두기 시작 모습(읽은 것) — 끄는 동안에도 값이 바뀐 연결을 곧바로 풀려고(Fill 행이 토큰 → 색 코드로 실시간) */
  const heldDoc = new Map<string, LayerDoc>()
  function hold(sid: string) { if (!held.has(sid)) { const s = snap(sid); held.set(sid, s); heldDoc.set(sid, JSON.parse(s)); begunSel.set(sid, selOf(sid)) } }
  function release(sid: string) {
    const before = held.get(sid)
    if (before === undefined) return
    held.delete(sid)
    heldDoc.delete(sid)
    commit(sid, before)
  }
  function mutate<T>(sid: string, fn: (d: LayerDoc) => T): T {
    if (held.has(sid)) { const out = fn(doc(sid)); layoutDoc(doc(sid)); const h = heldDoc.get(sid); if (h) detachEdited(sid, h); return out }
    const before = snap(sid)
    const sel0 = selOf(sid)
    const out = fn(doc(sid))
    layoutDoc(doc(sid)) // 오토 레이아웃은 바뀔 때마다 다시 계산
    record(sid, before, sel0)
    return out
  }
  /** 그려진 크기를 재서 넣기(인스턴스 Hug 등) — 실행취소 기록 없이 저장만 */
  function setMeasured(sid: string, id: string, w: number, h: number) {
    const n = doc(sid).nodes[id]
    // 그려진 크기 그대로(소수 둘째 자리) — 정수로 반올림하면 선택선이 컴포넌트 · 글자보다 크거나 작아 보여요
    const r2 = (v: number) => Math.round(v * 100) / 100
    if (!n || (Math.abs(n.w - w) < 0.01 && Math.abs(n.h - h) < 0.01)) return
    n.w = r2(w); n.h = r2(h)
    layoutDoc(doc(sid))
    scheduleSave(sid)
  }
  /** 끄는 중(기록 없이) 오토 레이아웃 다시 계산 */
  const relayout = (sid: string) => layoutDoc(doc(sid))

  function restore(sid: string, json: string) {
    docs[sid] = JSON.parse(json)
    layerIds.value = layerIds.value.filter((id) => docs[sid]!.nodes[id])
    xsel.value = xsel.value.filter((x) => x.sid !== sid || docs[sid]!.nodes[x.id])
    scheduleSave(sid)
  }
  /** 되돌린 문서에 있는 것만 다시 고르기 */
  const reselect = (sid: string, ids: string[] | undefined) => { if (ids) layerIds.value = ids.filter((id) => docs[sid]?.nodes[id]) }
  const undoEntry = (e: Entry) => {
    if (e.kind === 'action') { e.undo(); return }
    // 되돌리기 직전 고른 것(= 바꾼 뒤 고른 것)을 다시하기용으로 기억
    if (screenId.value === e.screenId) e.selAfter = [...layerIds.value]
    restore(e.screenId, e.before)
    screenId.value = e.screenId
    reselect(e.screenId, e.selBefore)
  }
  const redoEntry = (e: Entry) => {
    if (e.kind === 'action') { e.redo(); return }
    restore(e.screenId, e.after)
    screenId.value = e.screenId
    reselect(e.screenId, e.selAfter)
  }
  /**
   * 여러 화면 · 여러 번의 변경을 실행취소 한 번으로 묶어요(프레임 여러 개를 한꺼번에 고칠 때).
   * 안쪽에서 또 부르면 바깥 묶음에 그대로 들어가요
   */
  function batch<T>(fn: () => T): T {
    if (batching) return fn()
    const list: Entry[] = []
    batching = list
    try { return fn() } finally {
      batching = null
      if (list.length === 1) push(list[0]!)
      else if (list.length > 1) {
        const sel = screenId.value
        push({ kind: 'action', screenId: sel, undo: () => { for (const e of [...list].reverse()) undoEntry(e); screenId.value = sel }, redo: () => { for (const e of list) redoEntry(e); screenId.value = sel } })
      }
    }
  }
  function undo() {
    const e = undoStack.pop()
    if (!e) return
    redoStack.push(e)
    undoEntry(e)
    canUndo.value = !!undoStack.length
    canRedo.value = true
  }
  function redo() {
    const e = redoStack.pop()
    if (!e) return
    undoStack.push(e)
    redoEntry(e)
    canUndo.value = true
    canRedo.value = !!redoStack.length
  }

  // --- 고르기 ---
  function selectScreen(sid: string | null) {
    screenId.value = sid
    layerIds.value = []
    xsel.value = []
    editing.value = null
  }
  function selectLayer(sid: string, id: string | null, additive = false) {
    if (screenId.value !== sid || !additive) xsel.value = []
    if (screenId.value !== sid) layerIds.value = []
    screenId.value = sid
    if (!id) { layerIds.value = []; return }
    if (additive) layerIds.value = layerIds.value.includes(id) ? layerIds.value.filter((v) => v !== id) : [...layerIds.value, id]
    else layerIds.value = [id]
  }

  /** 다른 문서의 레이어를 함께 고르기 · 빼기(⇧ · ⌘). 지금 고른 문서의 것이면 보통 더하기 · 빼기 */
  function toggleX(sid: string, id: string) {
    if (!screenId.value || !layerIds.value.length || sid === screenId.value) { selectLayer(sid, id, true); return }
    const i = xsel.value.findIndex((x) => x.sid === sid && x.id === id)
    xsel.value = i >= 0 ? xsel.value.filter((_, k) => k !== i) : [...xsel.value, { sid, id }]
  }
  /** 함께 고른 다른 문서를 '지금 문서'로 바꾸기(그 문서 레이어를 눌러 끌 때) — 지금 문서의 고른 것은 함께 고르기로 옮겨요 */
  function promoteX(sid: string) {
    if (sid === screenId.value || !xsel.value.some((x) => x.sid === sid)) return
    const oldSid = screenId.value, oldIds = [...layerIds.value]
    const mine = xsel.value.filter((x) => x.sid === sid).map((x) => x.id)
    const rest = xsel.value.filter((x) => x.sid !== sid)
    screenId.value = sid
    layerIds.value = mine
    xsel.value = [...rest, ...(oldSid ? oldIds.map((id) => ({ sid: oldSid, id })) : [])]
  }
  /** 다른 문서에서 함께 고른 것: 문서별로 묶어서 */
  const xGroups = () => {
    const m = new Map<string, string[]>()
    for (const x of xsel.value) if (doc(x.sid).nodes[x.id]) m.set(x.sid, [...(m.get(x.sid) ?? []), x.id])
    return [...m]
  }
  /** 지금 고른 것 전체(이 문서 + 함께 고른 다른 문서)에 같은 일을 — 실행취소 한 번 */
  const GEOM_KEYS = ['x', 'y', 'w', 'h', 'rotation'] as const
  const isPrimary = (sid: string, ids: string[]) => sid === screenId.value && ids.length === layerIds.value.length && ids.every((id) => layerIds.value.includes(id))
  function withX(sid: string, ids: string[], fn: (sid: string, ids: string[]) => void) {
    if (!xsel.value.length || !isPrimary(sid, ids)) { fn(sid, ids); return }
    const groups = xGroups()
    batch(() => { fn(sid, ids); for (const [s2, ids2] of groups) fn(s2, ids2) })
  }

  // --- 만들기 · 고치기 · 지우기 ---
  /**
   * 새 레이어 이름(피그마와 같아요): '종류 N' — N 은 열려 있는 모든 문서(캔버스 · 화면들)에서 같은 이름 꼴의 가장 큰 번호 + 1.
   * (개수 + 1 이면 지우고 다시 그리거나 캔버스 · 프레임에 나눠 그릴 때 'Rectangle 1' 이 겹쳤어요)
   */
  function nextLabel(label: string, d?: LayerDoc) {
    const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$')
    let max = 0
    // 캔버스에 그린 프레임(화면)도 같은 번호 줄로 — 화면 · 캔버스 레이어가 'Frame 1' 로 겹치지 않게
    for (const sc of opts.screens.value) { const m = re.exec(sc.name ?? ''); if (m) max = Math.max(max, Number(m[1])) }
    for (const doc0 of new Set([...Object.values(docs), ...(d ? [d] : [])])) {
      for (const v of Object.values(doc0.nodes)) { const m = re.exec(v.name ?? ''); if (m) max = Math.max(max, Number(m[1])) }
    }
    return `${label} ${max + 1}`
  }
  function nextName(d: LayerDoc, type: LayerType) {
    return nextLabel(TYPE_LABEL[type], d)
  }
  function add(sid: string, parentId: string | null, part: Partial<LayerNode> & { type: LayerType }): string {
    return mutate(sid, (d) => {
      const id = newId()
      // '새로 그리는 것은 늘 60%'(prefs)를 켜면 사각형 · 프레임 · 이미지에 Corner smoothing 0.6
      const sm = part.style?.smoothing === undefined ? newSmoothing(part.type) : undefined
      d.nodes[id] = { id, name: nextName(d, part.type), parentId, x: 0, y: 0, w: 100, h: 100, ...part, style: { ...DEFAULT_STYLE[part.type], ...part.style, ...(sm ? { smoothing: sm } : {}) } }
      if (isContainer(part)) d.nodes[id]!.children = []
      siblings(d, parentId).push(id)
      layerIds.value = [id]
      screenId.value = sid
      return id
    })
  }
  /**
   * 프레임 · 섹션을 그렸을 때(피그마와 같아요): 같은 부모 안에서 새 상자 안에 통째로 드는 레이어는 그 안으로 넣어요(보이는 자리 그대로).
   * 새 프레임은 안에 넣은 것 중 맨 위 것 자리에 — 겹친 다른 레이어의 앞뒤 순서는 그대로. 실행취소 한 번
   */
  function addAround(sid: string, parentId: string | null, part: Partial<LayerNode> & { type: LayerType; x: number; y: number; w: number; h: number }): string {
    return mutate(sid, (d) => {
      const id = newId()
      const sm = part.style?.smoothing === undefined ? newSmoothing(part.type) : undefined
      d.nodes[id] = { id, name: nextName(d, part.type), parentId, ...part, style: { ...DEFAULT_STYLE[part.type], ...part.style, ...(sm ? { smoothing: sm } : {}) } }
      d.nodes[id]!.children = []
      const sib = siblings(d, parentId)
      const inside = sib.filter((k) => {
        const c = d.nodes[k]
        if (!c || c.locked || c.hidden || (c.rotation ?? 0) % 360) return false
        return c.x >= part.x - 0.01 && c.y >= part.y - 0.01 && c.x + c.w <= part.x + part.w + 0.01 && c.y + c.h <= part.y + part.h + 0.01
      })
      const at = inside.length ? Math.max(...inside.map((k) => sib.indexOf(k))) : sib.length - 1
      sib.splice(at + 1, 0, id)
      for (const k of inside) {
        sib.splice(sib.indexOf(k), 1)
        const c = d.nodes[k]!
        c.parentId = id
        c.x -= part.x
        c.y -= part.y
        d.nodes[id]!.children!.push(k)
      }
      layerIds.value = [id]
      screenId.value = sid
      return id
    })
  }
  /** 고른 것 중 맨 위 것만(부모가 같이 골라진 자식은 빼요) — 옮기기 · 정렬처럼 자리를 바꾸는 일은 부모째 움직이면 자식도 따라가요 */
  function topIds(sid: string, ids: string[]) {
    const d = doc(sid)
    const set = new Set(ids)
    return ids.filter((id) => { for (let p = d.nodes[id]?.parentId; p; p = d.nodes[p]?.parentId) if (set.has(p)) return false; return true })
  }
  function update(sid: string, ids: string[], patch: Partial<Omit<LayerNode, 'style'>> | ((n: LayerNode) => Partial<LayerNode>)) {
    // 여러 프레임에 걸쳐 고른 것 전부에(피그마와 같아요): 글자 · 칠 · 선 · 효과 등 모든 속성.
    // 자리 · 크기 · 회전은 부모마다 기준이 달라 값 하나로 고칠 때는 이 문서만(끌기 · 크기 조절이 이 길로 와요),
    // 함수로 고칠 때는 다른 문서에선 자리 · 크기 값만 빼고 나머지를 적용해요
    if (xsel.value.length && isPrimary(sid, ids)) {
      if (typeof patch !== 'function') {
        if (!GEOM_KEYS.some((k) => k in patch)) { withX(sid, ids, (s2, ids2) => mutate(s2, (d) => { for (const id of ids2) { const n = d.nodes[id]; if (n) Object.assign(n, patch) } })); return }
      } else {
        withX(sid, ids, (s2, ids2) => mutate(s2, (d) => {
          for (const id of ids2) {
            const n = d.nodes[id]
            if (!n) continue
            const r = { ...patch(n) }
            if (s2 !== sid) for (const k of GEOM_KEYS) delete (r as Record<string, unknown>)[k]
            Object.assign(n, r)
          }
        }))
        return
      }
    }
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n) continue
        const before = n.style
        Object.assign(n, typeof patch === 'function' ? patch(n) : patch)
        // 글자 레이어 전체 서식을 바꾸면 그 키의 글자 구간 덮어쓰기는 지워요(피그마와 같아요)
        if (n.style !== before) stripChanged(n, before)
      }
    })
  }
  function style(sid: string, ids: string[], s: Partial<LayerStyle>) {
    withX(sid, ids, (s2, ids2) => mutate(s2, (d) => { for (const id of ids2) { const n = d.nodes[id]; if (n) { n.style = { ...n.style, ...s }; stripRuns(n, Object.keys(s)) } } }))
  }
  /**
   * 변수(토큰) 연결 · 풀기. patch 로 실제 값도 함께 써 넣습니다(연결해도 그리기 · 내보내기는 그 값을 씀).
   * tokenId 가 null 이면 연결만 풀고 값은 그대로 둡니다.
   */
  function bind(sid: string, ids: string[], key: BindKey | BindKey[], tokenId: string | null, patch?: (n: LayerNode) => { node?: Partial<Omit<LayerNode, 'style'>>; style?: Partial<LayerStyle> }) {
    const keys = Array.isArray(key) ? key : [key]
    // 여러 프레임에 걸쳐 고른 것 전부에
    withX(sid, ids, (sid, ids) => mutate(sid, (d) => {
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
        if (p?.style) stripRuns(n, Object.keys(p.style))
      }
    }))
  }
  const unbind = (sid: string, ids: string[], key: BindKey | BindKey[], patch?: Parameters<typeof bind>[4]) => bind(sid, ids, key, null, patch)
  /** 화면(프레임) 자체의 모양 바꾸기. vars: 토큰 연결(키 → 토큰 id, null 이면 연결 끊기) */
  function frameStyle(sid: string, patch: Partial<LayerStyle>, vars?: Record<string, string | null>) {
    mutate(sid, (d) => {
      const f: LayerStyle = { ...(d.frame ?? {}), ...patch }
      for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete (f as Record<string, unknown>)[k]
      const v: Record<string, string> = { ...(f.vars ?? {}) } as Record<string, string>
      // 값을 직접 바꾼 키는 연결을 풀어요
      for (const k of Object.keys(patch)) for (const vk of Object.keys(v)) if ((vk === k || vk.startsWith(k + '.')) && !(vars && vk in vars)) delete v[vk]
      if (vars) for (const [k, id] of Object.entries(vars)) { if (id) v[k] = id; else delete v[k] }
      if (Object.keys(v).length) f.vars = v as LayerStyle['vars']; else delete f.vars
      d.frame = f
    })
  }
  function remove(sid: string, ids: string[]) {
    if (!ids.length) return
    // 함께 고른 다른 문서의 레이어도 같이 지워요(실행취소 한 번)
    if (xsel.value.length && isPrimary(sid, ids)) {
      const groups = xGroups()
      batch(() => { removeIn(sid, ids); for (const [s2, ids2] of groups) removeIn(s2, ids2) })
      xsel.value = []
      layerIds.value = []
      return
    }
    removeIn(sid, ids)
    layerIds.value = []
  }
  function removeIn(sid: string, ids: string[]) {
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
    // 여러 개를 고르면 부모별로 함께 옮기고, 고른 것끼리의 순서는 그대로(피그마와 같아요). 다른 프레임에서 함께 고른 것도
    withX(sid, ids, (sid, ids) => mutate(sid, (d) => {
      const byParent = new Map<string | null, Set<string>>()
      for (const id of ids) { const n = d.nodes[id]; if (!n) continue; const p = n.parentId ?? null; if (!byParent.has(p)) byParent.set(p, new Set()); byParent.get(p)!.add(id) }
      for (const [p, picked] of byParent) {
        const sib = siblings(d, p)
        const next = moveOrder(sib, picked, dir)
        sib.splice(0, sib.length, ...next)
      }
    }))
  }
  /** 레이어 목록에서 끌어 놓기: target 바로 위(그리는 순서로는 다음)에 놓고, target 이 프레임이면 into 일 때 그 안으로 */
  /** below: 목록에서 그 줄 아래(그리는 순서로는 바로 뒤)에 — 끌어서 아래 가장자리에 놓을 때 */
  function moveTo(sid: string, id: string, targetId: string | null, into = false, below = false) {
    if (id === targetId) return
    const d = doc(sid)
    if (targetId && descendants(d, id).includes(targetId)) return // 자기 안으로는 못 넣음
    mutate(sid, (dd) => {
      const n = dd.nodes[id]!
      const abs = absPos(dd, id)
      siblings(dd, n.parentId).splice(siblings(dd, n.parentId).indexOf(id), 1)
      const t = targetId ? dd.nodes[targetId] : null
      const parentId = into && isContainer(t) ? t!.id : t ? t.parentId : null
      const sib = siblings(dd, parentId)
      if (into && isContainer(t)) sib.push(id)
      else sib.splice(t ? sib.indexOf(t.id) + (below ? 0 : 1) : sib.length, 0, id)
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
    clipboard = { rootIds: ids, sid, abs: Object.fromEntries(ids.map((id) => [id, absPos(d, id)])), nodes: ids.flatMap((id) => descendants(d, id)).map((k) => JSON.parse(JSON.stringify(d.nodes[k]))) }
    return true
  }
  /**
   * 붙여넣기: 고른 프레임 레이어가 있으면 그 안, 아니면 원래 부모(없으면 화면) — 피그마처럼 같은 자리에.
   * 다른 문서에 붙일 때(geo: 화면 · 캔버스의 캔버스 좌표):
   * - 캔버스로 · 캔버스에서: 캔버스 위 같은 절대 위치(화면 안 사각형을 캔버스에 붙이면 원래 자리 그대로 화면 밖 층으로)
   * - 화면 → 다른 화면: 그 화면 안 같은 자리(화면 왼쪽 위 기준)
   * - 캔버스 → 화면인데 화면과 겹치지 않으면: 화면 가운데
   */
  function paste(targetSid?: string, offset = 0, geoIn?: PasteGeo) {
    const geo = geoIn ?? pasteGeo
    const sid = targetSid ?? screenId.value
    if (!clipboard || !sid) return
    const cb = clipboard
    mutate(sid, (d) => {
      const map = new Map(cb.nodes.map((n) => [n.id, newId()]))
      /** 원본 id → 방금 붙인 복제본 id(같은 원본을 여러 번 붙이면 그 뒤에 이어서) */
      const lastAfter = new Map<string, string>()
      const sel = layerIds.value.length === 1 ? d.nodes[layerIds.value[0]!] : undefined
      // 고른 프레임 · 섹션 안으로(그룹 · 불리언은 아니에요 — 피그마와 같아요)
      const into = sel && isContainer(sel) && !isGroupNode(sel) && sel.type !== 'boolean' && !cb.rootIds.includes(sel.id) ? sel.id : null
      // 프레임이 아닌 레이어 하나를 골랐으면 그 레이어 바로 위에(같은 부모 — 피그마와 같아요)
      const beside = sel && !into && !cb.rootIds.includes(sel.id) ? sel : null
      const fresh: string[] = []
      const same = cb.sid === sid
      const so = geo?.origin(cb.sid), to = geo?.origin(sid)
      const world = !!so && !!to && (geo!.isCanvas(sid) || geo!.isCanvas(cb.sid))
      /** 다른 문서에서 맨 위 레이어가 놓일 자리(대상 문서 왼쪽 위 기준) */
      const spot = (n: LayerNode) => {
        const a = cb.abs[n.id] ?? { x: n.x, y: n.y }
        if (!world) return a
        const p = { x: so!.x + a.x - to!.x, y: so!.y + a.y - to!.y }
        const box = geo!.isCanvas(sid) ? null : geo!.size(sid)
        if (box && (p.x + n.w <= 0 || p.y + n.h <= 0 || p.x >= box.w || p.y >= box.h)) return { x: Math.round((box.w - n.w) / 2), y: Math.round((box.h - n.h) / 2) }
        return p
      }
      for (const n of cb.nodes) {
        const id = map.get(n.id)!
        const root = cb.rootIds.includes(n.id)
        const keep = !into && !beside && !!n.parentId && !!d.nodes[n.parentId]
        const parentId = root ? (into ?? (beside ? beside.parentId : keep ? n.parentId : null)) : map.get(n.parentId!)!
        let x = n.x, y = n.y
        if (root && into) {
          // 고른 프레임 안으로(피그마와 같아요): 원래 화면 위 자리가 프레임 안에 들어오면 그 자리, 아니면 프레임 가운데
          const a = same ? cb.abs[n.id] ?? { x: n.x, y: n.y } : spot(n)
          const pa = absPos(d, into), f = d.nodes[into]!
          const lx = a.x - pa.x, ly = a.y - pa.y
          const fits = lx >= 0 && ly >= 0 && lx + n.w <= f.w && ly + n.h <= f.h
          x = (fits ? lx : Math.round((f.w - n.w) / 2)) + offset
          y = (fits ? ly : Math.round((f.h - n.h) / 2)) + offset
        } else if (root && beside) {
          // 화면 위 같은 자리 그대로(새 부모 기준으로 바꿔서)
          const a = same ? cb.abs[n.id] ?? { x: n.x, y: n.y } : spot(n)
          const pa = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
          x = a.x - pa.x + offset; y = a.y - pa.y + offset
        } else if (root) {
          if (keep) { x = n.x + offset; y = n.y + offset }
          else if (same) { const a = cb.abs[n.id] ?? { x: n.x, y: n.y }; x = a.x + offset; y = a.y + offset } // 원래 부모가 없어졌으면 화면 위 같은 자리
          else {
            const p = spot(n)
            const pa = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
            x = p.x - pa.x + offset; y = p.y - pa.y + offset
          }
        }
        // 이름(피그마와 같아요): 맨 위 레이어가 기본 이름('Rectangle 3' · 'Group 2' 처럼 종류 + 번호)이면 다음 번호로, 바꾼 이름은 그대로
        const label = n.group ? 'Group' : TYPE_LABEL[n.type]
        const name = root && label && new RegExp('^' + label + ' \\d+$').test(n.name ?? '') ? nextLabel(label, d) : n.name
        d.nodes[id] = { ...n, id, name, parentId, children: n.children?.map((c) => map.get(c)!), x, y }
        if (root) {
          const sib = siblings(d, parentId)
          // 오토 레이아웃 안 같은 부모로 붙일 때는 원본 바로 다음에(피그마와 같아요) — 맨 끝이 아니라
          const flowParent = parentId && !into && d.nodes[parentId]?.style.layout
          // 기준: 이번에 방금 붙인 것 → 지금 고른 것(같은 부모) 중 마지막 → 원본
          let at = -1
          if (beside) at = lastAfter.has('') ? sib.indexOf(lastAfter.get('')!) : sib.indexOf(beside.id)
          else if (flowParent) {
            const selIdx = layerIds.value.filter((k) => d.nodes[k]?.parentId === parentId).map((k) => sib.indexOf(k)).filter((i) => i >= 0)
            at = lastAfter.has('') ? sib.indexOf(lastAfter.get('')!) : selIdx.length ? Math.max(...selIdx) : sib.indexOf(n.id)
          }
          if (at >= 0) sib.splice(at + 1, 0, id); else sib.push(id)
          lastAfter.set('', id)
          fresh.push(id)
        }
      }
      layerIds.value = fresh
      screenId.value = sid
    })
  }
  /**
   * ⇧⌘V 고른 것 위에 붙여넣기 · ⇧⌘R 바꿔 붙여넣기(피그마와 같아요): 고른 것과 같은 부모, 같은 왼쪽 위 자리에 붙이고
   * 고른 것 바로 위 순서에 놓아요. 바꾸기면 고른 것은 지워요. 실행취소 한 번
   */
  function pasteOnSelection(replace: boolean): boolean {
    const sid = screenId.value
    if (!clipboard || !sid || !layerIds.value.length) return false
    const cb = clipboard
    const d0 = doc(sid)
    const targets = topIds(sid, layerIds.value).filter((id) => d0.nodes[id] && !cb.rootIds.includes(id))
    if (!targets.length) return false
    mutate(sid, (d) => {
      const parentId = d.nodes[targets[0]!]!.parentId
      const sib = siblings(d, parentId)
      const pa = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
      const tAbs = targets.map((id) => absPos(d, id))
      const tx = Math.min(...tAbs.map((p) => p.x)), ty = Math.min(...tAbs.map((p) => p.y))
      const roots = cb.nodes.filter((n) => cb.rootIds.includes(n.id))
      const rAbs = (n: LayerNode) => cb.abs[n.id] ?? { x: n.x, y: n.y }
      const ax = Math.min(...roots.map((n) => rAbs(n).x)), ay = Math.min(...roots.map((n) => rAbs(n).y))
      const map = new Map(cb.nodes.map((n) => [n.id, newId()]))
      let at = Math.max(-1, ...targets.filter((id) => d.nodes[id]!.parentId === parentId).map((id) => sib.indexOf(id)))
      const fresh: string[] = []
      for (const n0 of cb.nodes) {
        const n = JSON.parse(JSON.stringify(n0)) as LayerNode
        const id = map.get(n.id)!
        const root = cb.rootIds.includes(n.id)
        const label = n.group ? 'Group' : TYPE_LABEL[n.type]
        const name = root && label && new RegExp('^' + label + ' \\d+$').test(n.name ?? '') ? nextLabel(label, d) : n.name
        const pos = root ? { x: snapPx(tx - pa.x + rAbs(n).x - ax), y: snapPx(ty - pa.y + rAbs(n).y - ay) } : {}
        d.nodes[id] = { ...n, id, name, parentId: root ? parentId : map.get(n.parentId!)!, children: n.children?.map((c) => map.get(c)!), ...pos }
        if (root) { sib.splice(++at, 0, id); fresh.push(id) }
      }
      if (replace) {
        for (const t of targets) {
          const n = d.nodes[t]
          if (!n) continue
          const s = siblings(d, n.parentId)
          const i = s.indexOf(t)
          if (i >= 0) s.splice(i, 1)
          for (const k of descendants(d, t)) delete d.nodes[k]
        }
      }
      layerIds.value = fresh
    })
    return true
  }
  /**
   * 스마트 복제(피그마와 같아요): ⌘D 로 복제한 복제본을 옮긴 뒤(또는 ⌥ 끌기 복제 뒤) 다시 ⌘D 를 누르면
   * 원본 → 복제본 만큼 같은 간격으로 계속 복제해요. 복사해 둔 클립보드는 건드리지 않아요
   */
  let dupMemo: { sid: string; src: string[]; copies: string[] } | null = null
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  function dupBase(): { sid: string; src: string[]; copies: string[] } | null {
    const sid = screenId.value
    if (!sid || !layerIds.value.length) return null
    const src = topIds(sid, layerIds.value)
    const keep = clipboard
    if (!copy()) return null
    paste(undefined, 0)
    clipboard = keep
    return { sid, src, copies: [...layerIds.value] }
  }
  function duplicate() {
    const sid = screenId.value
    if (!sid) return
    const d = doc(sid)
    const cur = topIds(sid, layerIds.value)
    let dx = 0, dy = 0
    if (dupMemo && dupMemo.sid === sid && sameSet(dupMemo.copies, cur)) {
      const a = d.nodes[dupMemo.src[0]!], b = d.nodes[dupMemo.copies[0]!]
      if (a && b && a.parentId === b.parentId) { dx = b.x - a.x; dy = b.y - a.y }
    }
    hold(sid)
    const r = dupBase()
    if (r && (dx || dy)) update(sid, r.copies, (n) => ({ x: Math.round((n.x + dx) * 100) / 100, y: Math.round((n.y + dy) * 100) / 100 }))
    release(sid)
    dupMemo = r
  }
  /** ⌥ 끌기 복제: 같은 자리에 복제하고 복제본을 고름(옮긴 뒤 ⌘D 면 같은 간격으로 이어서) */
  function duplicateInPlace() { dupMemo = dupBase() }

  /** 여러 레이어를 한 번에(실행취소 한 번): 부모 하나 + 그 안 자식들. SVG 가져오기가 써요 */
  function insertTree(sid: string, parentId: string | null, root: Partial<LayerNode> & { type: LayerType }, kids: (Partial<LayerNode> & { type: LayerType })[]): string {
    return mutate(sid, (d) => {
      const id = newId()
      d.nodes[id] = { id, name: nextName(d, root.type), parentId, x: 0, y: 0, w: 100, h: 100, ...root, children: [], style: { ...DEFAULT_STYLE[root.type], ...root.style } }
      siblings(d, parentId).push(id)
      for (const k of kids) {
        const cid = newId()
        d.nodes[cid] = { id: cid, name: nextName(d, k.type), parentId: id, x: 0, y: 0, w: 100, h: 100, ...k, style: { ...DEFAULT_STYLE[k.type], ...k.style } }
        d.nodes[id]!.children!.push(cid)
      }
      layerIds.value = [id]
      screenId.value = sid
      return id
    })
  }
  /** 같은 부모 안에서 고른 것들(아래 → 위 순서) */
  function orderedSiblings(d: LayerDoc, ids: string[]) {
    const first = d.nodes[ids[0]!]
    if (!first) return []
    const sib = siblings(d, first.parentId)
    return ids.filter((id) => d.nodes[id]?.parentId === first.parentId).sort((a, b) => sib.indexOf(a) - sib.indexOf(b))
  }
  /**
   * 불리언(피그마의 Boolean group): 원본 도형을 그대로 두고 결과를 그려요 — 나중에 안쪽 도형을 고치면 결과도 바뀌어요.
   * 칠 · 선은 맨 아래 도형 것을 이어받아요
   */
  function booleanOp(sid: string, ids: string[], op: 'union' | 'subtract' | 'intersect' | 'exclude') {
    const d0 = doc(sid)
    const list = orderedSiblings(d0, ids).filter((id) => { const n = d0.nodes[id]!; return n.type !== 'text' && n.type !== 'instance' })
    if (list.length < 2) return
    let gid = ''
    mutate(sid, (d) => {
      const parentId = d.nodes[list[0]!]!.parentId
      const ns = list.map((id) => d.nodes[id]!)
      const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y))
      const x1 = Math.max(...ns.map((n) => n.x + n.w)), y1 = Math.max(...ns.map((n) => n.y + n.h))
      const base = ns[0]!
      gid = newId()
      const sib = siblings(d, parentId)
      const at = Math.max(...list.map((k) => sib.indexOf(k)))
      const label = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' }[op]
      d.nodes[gid] = { id: gid, type: 'boolean', op, name: label, parentId, x: x0, y: y0, w: x1 - x0, h: y1 - y0, children: [], style: { fill: base.style.fill ?? '#D9D9D9', ...(base.style.fills ? { fills: base.style.fills } : {}), ...(base.style.stroke && base.style.strokeWidth ? { stroke: base.style.stroke, strokeWidth: base.style.strokeWidth } : {}) } }
      sib.splice(at + 1, 0, gid)
      for (const n of ns) {
        sib.splice(sib.indexOf(n.id), 1)
        n.parentId = gid; n.x -= x0; n.y -= y0
        d.nodes[gid]!.children!.push(n.id)
      }
    })
    layerIds.value = [gid]
  }
  /**
   * ⌘E 평탄화(피그마와 같아요): 점 편집할 수 있는 벡터 하나로.
   * - 도형 하나: 그 자리에서 벡터로(크기 · 돌리기 그대로)
   * - 불리언 · 그룹: 계산한 결과 모양 하나로(안쪽 도형은 없어져요)
   * - 여럿: 같은 부모 안 것들을 합친 벡터 하나로(맨 위 자리, 칠 · 선은 맨 아래 것)
   */
  /**
   * 점 편집에서 사각형 꼭짓점을 처음 옮길 때(피그마와 같아요): 벡터로 바꾸되 꼭짓점 네 개 그대로 — 모서리 둥글기는 각 꼭짓점의 r 로 남아요.
   * (곡선 점으로 굳히는 건 Flatten ⌘E). 사각형이 아니면 false(그때는 flatten 으로)
   */
  function toCornerVector(sid: string, id: string): boolean {
    const n0 = doc(sid).nodes[id]
    if (!n0 || n0.type !== 'rect') return false
    mutate(sid, (d) => {
      const n = d.nodes[id]!
      const [a, b, c, e] = radiiOf(n.style).map((r) => Math.max(0, Math.min(r, n.w / 2, n.h / 2)))
      const pt = (x: number, y: number, r?: number) => ({ x, y, ...(r ? { r } : {}) })
      const style = { ...n.style }
      delete style.radius
      delete style.radii
      delete style.smoothing
      Object.assign(n, { type: 'vector', vnet: [{ closed: true, pts: [pt(0, 0, a), pt(1, 0, b), pt(1, 1, c), pt(0, 1, e)] }], closed: true, style })
    })
    return true
  }
  function flatten(sid: string, ids: string[]) {
    const d0 = doc(sid)
    const top = topIds(sid, ids).filter((id) => flattenable(d0.nodes[id]))
    if (!top.length) return
    const list = top.length > 1 ? orderedSiblings(d0, top) : top
    // 벡터 하나: 꼭짓점 둥글기(r)가 없으면 할 일 없음. 있으면 곡선 점으로 굳혀요(피그마 Flatten)
    if (list.length === 1 && d0.nodes[list[0]!]!.type === 'vector' && !d0.nodes[list[0]!]!.vnet?.some((p) => p.pts.some((q) => q.r))) return
    const keepStyle = (n: LayerNode) => { const k = { ...n.style }; for (const key of ['radius', 'radii', 'sides', 'points', 'inner', 'smoothing', 'layout', 'clip', 'grids'] as const) delete k[key]; return k }
    const drop = (d: LayerDoc, id: string) => { for (const c of descendants(d, id)) delete d.nodes[c] }
    mutate(sid, (d) => {
      const one = list.length === 1 ? d.nodes[list[0]!]! : null
      if (one && one.type !== 'boolean' && !isContainer(one)) {
        // 도형 하나: 상자 · 돌리기는 그대로
        const vnet = shapeVnet(one)
        Object.assign(one, { type: 'vector', vnet, closed: vnet.some((p) => p.closed) || undefined, style: keepStyle(one) })
        delete one.pts
        return
      }
      if (one?.type === 'boolean') {
        // 불리언: 결과 모양을 그 상자 안 벡터로(돌리기 그대로)
        const r = loopsVnet(booleanLoops(d, one))
        if (!r) return
        for (const c of one.children ?? []) drop(d, c)
        const M = localMatrix(one, one.w, one.h)
        const o = { x: M.a * r.x + M.c * r.y + M.e, y: M.b * r.x + M.d * r.y + M.f }
        Object.assign(one, { type: 'vector', vnet: r.vnet, closed: true, w: r.w, h: r.h, x: o.x - r.w / 2 + (M.a * r.w) / 2 + (M.c * r.h) / 2, y: o.y - r.h / 2 + (M.b * r.w) / 2 + (M.d * r.h) / 2, style: keepStyle(one) })
        delete one.children; delete one.op; delete one.evenodd
        return
      }
      // 그룹 · 여럿: 부모 안쪽 좌표로 모아서 새 벡터 하나
      const ns = list.map((id) => d.nodes[id]!)
      const r = loopsVnet(flattenLoops(d, ns))
      if (!r) return
      const parentId = ns[0]!.parentId
      const base = one ? (one.children ?? []).map((c) => d.nodes[c]).find((c): c is LayerNode => !!c && !c.hidden) ?? one : ns[0]!
      const sib = siblings(d, parentId)
      const at = Math.max(...list.map((k) => sib.indexOf(k)))
      const id = newId()
      d.nodes[id] = { id, type: 'vector', name: one ? one.name : nextName(d, 'vector'), parentId, x: r.x, y: r.y, w: r.w, h: r.h, vnet: r.vnet, closed: r.vnet.every((p) => p.closed) || undefined, style: keepStyle(base), ...(one?.absolute ? { absolute: true } : {}) }
      sib.splice(at + 1, 0, id)
      for (const n of ns) { sib.splice(sib.indexOf(n.id), 1); drop(d, n.id) }
      layerIds.value = [id]
    })
  }
  /** ⌃⌘M 마스크로 쓰기: 고른 것 중 맨 아래가 마스크, 모두 'Mask group' 으로. 마스크 하나만 고르고 다시 누르면 풀어요 */
  // 그룹으로 감싸기 + 마스크 지정을 실행취소 한 번으로 묶어요(⌘Z 한 번에 원래대로, 피그마와 같아요)
  function toggleMask(sid: string, ids: string[]) { batch(() => toggleMaskIn(sid, ids)) }
  function toggleMaskIn(sid: string, ids: string[]) {
    const d0 = doc(sid)
    if (ids.length >= 1 && ids.every((id) => d0.nodes[id]?.isMask)) { update(sid, ids, { isMask: undefined }); return }
    // 하나만: 그 자리에서 마스크로 — 같은 부모 안 위쪽 레이어들을 그 모양으로 가려요(피그마와 같아요)
    if (ids.length === 1) { update(sid, ids, { isMask: true }); return }
    const list = orderedSiblings(d0, ids)
    if (!list.length) return
    wrap(sid, list, 'group')
    const gid = layerIds.value[0]
    if (!gid) return
    mutate(sid, (d) => {
      const g = d.nodes[gid]!
      g.name = 'Mask group'
      const m = d.nodes[list[0]!]
      if (m) m.isMask = true
    })
    layerIds.value = [gid]
  }

  /**
   * ⇧A 오토 레이아웃 더하기(피그마와 같아요): 프레임 하나면 그 프레임에, 그룹 하나면 그 안의 레이어에, 아니면 고른 것들을 새 프레임으로 감싸서.
   * 방향 · 간격은 지금 놓인 모양에서 짐작하고, 크기는 내용에 맞춤(Hug)
   */
  function addAutoLayout(sid: string, ids: string[]) { batch(() => addAutoLayoutIn(sid, ids)) }
  function addAutoLayoutIn(sid: string, ids: string[]) {
    const d0 = doc(sid)
    const one = ids.length === 1 ? d0.nodes[ids[0]!] : undefined
    // 그룹 하나를 고르면: 그룹은 그대로 두고 그 안의 레이어에 오토 레이아웃을 넣어요(안 레이어들을 오토 레이아웃 프레임으로 감싸기 —
    // 안에 프레임 하나뿐이면 그 프레임에) — 사용자 요청 2026-11-24
    if (one && isGroupNode(one) && one.children?.length) {
      addAutoLayout(sid, [...one.children])
      return
    }
    let fid = one && (one.type === 'frame' || one.type === 'section') && !one.style.layout ? one.id : null
    if (!fid) {
      if (one?.style.layout) return
      wrap(sid, ids, 'frame')
      fid = layerIds.value[0] ?? null
      if (!fid) return
    }
    const target = fid
    mutate(sid, (d) => {
      const f = d.nodes[target]!
      const kids = (f.children ?? []).map((c) => d.nodes[c]!).filter(Boolean)
      const rs = kids.map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }))
      // 여러 줄로 놓여 있으면(격자) 처음부터 가로 + 줄바꿈: 줄 순서대로, 간격 · 줄 간격 · 폭은 지금 배치에서(피그마와 같아요)
      const grid = rs.length >= 3 ? rowsOf(rs) : null
      if (grid && grid.rows.length >= 2 && grid.rows.some((r) => r.length >= 2)) {
        const minX = Math.min(...rs.map((r) => r.x)), minY = Math.min(...rs.map((r) => r.y))
        const pad = one?.type === 'frame' || one?.type === 'section' ? Math.max(0, Math.round(Math.min(minX, minY))) : 0
        const rowW = Math.max(...grid.rows.map((row) => row.reduce((a, i) => a + rs[i]!.w, 0) + grid.gapX * (row.length - 1)))
        f.children = grid.rows.flat().map((i) => kids[i]!.id)
        f.style = { ...f.style, layout: { mode: 'horizontal', wrap: true, gap: grid.gapX, rowGap: grid.gapY, padding: [pad, pad, pad, pad], align: 'start', cross: 'start' } }
        f.sizeH = 'fixed'; f.sizeV = 'hug'
        f.w = Math.round((rowW + pad * 2) * 100) / 100
        if (!one || one.type !== 'frame') f.style.fill = undefined
        return
      }
      const axis = rs.length >= 2 ? guessAxis(rs) : 'y'
      const gap = rs.length >= 2 ? Math.max(0, currentGap(rs, axis) ?? 10) : 10
      const minX = Math.min(...rs.map((r) => r.x), f.w), minY = Math.min(...rs.map((r) => r.y), f.h)
      const pad = (one?.type === 'frame' || one?.type === 'section') && rs.length ? Math.max(0, Math.round(Math.min(minX, minY))) : 0
      // 진행 방향 순서대로
      f.children = [...(f.children ?? [])].sort((a, b) => (axis === 'x' ? d.nodes[a]!.x - d.nodes[b]!.x : d.nodes[a]!.y - d.nodes[b]!.y))
      f.style = { ...f.style, layout: { mode: axis === 'x' ? 'horizontal' : 'vertical', gap, padding: [pad, pad, pad, pad], align: 'start', cross: 'start' } }
      f.sizeH = 'hug'; f.sizeV = 'hug'
      if (!one || one.type !== 'frame') f.style.fill = undefined // 감쌀 때는 바탕 없이(피그마와 같아요)
    })
    layerIds.value = [target]
  }
  /**
   * 줄바꿈 켜고 끄기(Flow 의 Grid · ↩): 켜면 가로 + 줄바꿈, 폭이 Hug 면 고정으로 바꾸고 대략 정사각 격자가 되는 폭으로(한 줄에 √n 개).
   * 줄바꿈은 폭이 정해져 있어야 줄이 나뉘어요(피그마와 같아요)
   */
  function setWrap(sid: string, ids: string[], on: boolean) {
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        const l = n?.style.layout
        if (!n || !l) continue
        if (!on) { n.style = { ...n.style, layout: { ...l, wrap: undefined } }; continue }
        n.style = { ...n.style, layout: { ...l, mode: 'horizontal', wrap: true } }
        if (n.sizeH === 'hug' || n.sizeH === undefined) {
          const kids = (n.children ?? []).map((c) => d.nodes[c]!).filter((k) => k && !k.hidden && !k.absolute)
          const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length)))
          const gap = l.gap === 'auto' ? 0 : l.gap
          const widest = kids.length ? Math.max(...kids.map((k) => k.w)) : 100
          n.sizeH = 'fixed'
          n.w = Math.round((l.padding[1] + l.padding[3] + widest * cols + gap * (cols - 1)) * 100) / 100
        }
        if (n.sizeV === 'fixed' || n.sizeV === undefined) n.sizeV = 'hug'
      }
    })
  }
  function removeAutoLayout(sid: string, ids: string[]) {
    mutate(sid, (d) => { for (const id of ids) { const n = d.nodes[id]; if (n?.style.layout) { const s2 = { ...n.style }; delete s2.layout; n.style = s2; delete n.sizeH; delete n.sizeV; if (n.type === 'frame') n.group = false } } }) // 오토 레이아웃을 풀면 늘 프레임으로 남아요(그룹으로 보이지 않게)
  }
  /** 크기 바꾸기(제약 적용): 오토 레이아웃이 아닌 프레임이면 자식이 제약대로 따라와요 */
  function sizeTo(sid: string, ids: string[], fn: (n: LayerNode) => Partial<LayerNode>) {
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n) continue
        const ow = n.w, oh = n.h
        Object.assign(n, fn(n))
        if (isContainer(n) && !n.style.layout && (ow !== n.w || oh !== n.h)) {
          const kids = (n.children ?? []).map((c) => d.nodes[c]!).filter(Boolean)
          constrain(kids, boxes0(kids), ow, oh, n.w, n.h, isGroupNode(n) ? { h: 'scale', v: 'scale' } : undefined)
        }
      }
    })
  }
  /** 화면 크기가 바뀔 때 맨 위 레이어들을 제약대로. kids0 이 있으면 그 상자 기준(끄는 중) */
  function constrainRoot(sid: string, ow: number, oh: number, nw: number, nh: number, kids0?: Record<string, { x: number; y: number; w: number; h: number }>, record0 = true) {
    const run = (d: LayerDoc) => { const kids = d.rootIds.map((c) => d.nodes[c]!).filter(Boolean); constrain(kids, kids0 ?? boxes0(kids), ow, oh, nw, nh) }
    if (record0) mutate(sid, run)
    else { run(doc(sid)); layoutDoc(doc(sid)) }
  }

  /**
   * 같은 화면 안에서 부모 바꾸기(끌어서 프레임 밖으로 · 안으로). 화면 위 위치는 그대로.
   * 기록은 하지 않아요 — 끌기가 begin/commit 으로 한 번에 기록합니다
   */
  function reparent(sid: string, ids: string[], parentId: string | null) {
    const d = doc(sid)
    const pp = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
    for (const id of ids) {
      const n = d.nodes[id]
      if (!n || n.parentId === parentId || (parentId && descendants(d, id).includes(parentId))) continue
      const a = absPos(d, id)
      const from = siblings(d, n.parentId)
      from.splice(from.indexOf(id), 1)
      siblings(d, parentId).push(id)
      n.parentId = parentId
      n.x = a.x - pp.x
      n.y = a.y - pp.y
    }
  }
  /**
   * 다른 화면(또는 캔버스)으로 옮기기. offset: 원래 화면 왼쪽 위 - 새 화면 왼쪽 위(캔버스 좌표).
   * 두 화면이 함께 바뀌어서 실행취소 한 번에 둘 다 되돌려요
   */
  function transfer(fromSid: string, ids: string[], toSid: string, parentId: string | null, offset: { x: number; y: number }) {
    const src = doc(fromSid), dst = doc(toSid)
    const b0 = snap(fromSid), c0 = snap(toSid)
    const roots = ids.filter((id) => src.nodes[id] && !ids.some((o) => o !== id && descendants(src, o).includes(id)))
    if (!roots.length) return
    const pp = parentId ? absPos(dst, parentId) : { x: 0, y: 0 }
    for (const id of roots) {
      const a = absPos(src, id)
      for (const k of descendants(src, id)) {
        const n = JSON.parse(JSON.stringify(src.nodes[k])) as LayerNode
        if (k === id) { n.parentId = parentId; n.x = a.x + offset.x - pp.x; n.y = a.y + offset.y - pp.y }
        dst.nodes[k] = n
      }
      siblings(dst, parentId).push(id)
      const from = siblings(src, src.nodes[id]!.parentId)
      from.splice(from.indexOf(id), 1)
      for (const k of descendants(src, id)) delete src.nodes[k]
    }
    const b1 = snap(fromSid), c1 = snap(toSid)
    scheduleSave(fromSid); scheduleSave(toSid)
    pushAction(toSid, () => { restore(fromSid, b0); restore(toSid, c0) }, () => { restore(fromSid, b1); restore(toSid, c1) })
    screenId.value = toSid
    layerIds.value = roots
  }

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
  /** 묶기: 그룹(⌘G) · 프레임(⌥⌘G) · 섹션(⌥⌘S, 캔버스 맨 위 레이어만 — 둘레 40 여백) */
  function wrap(sid: string, ids: string[], kind: 'group' | 'frame' | 'section') {
    const d0 = doc(sid)
    const list = ids.filter((id) => d0.nodes[id])
    if (!list.length) return
    const parentId = d0.nodes[list[0]!]!.parentId
    const same = list.filter((id) => d0.nodes[id]!.parentId === parentId)
    mutate(sid, (d) => {
      const boxes = same.map((id) => ({ id, ...absPos(d, id), w: d.nodes[id]!.w, h: d.nodes[id]!.h }))
      const pad = kind === 'section' ? 40 : 0
      const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad
      const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad
      const p = parentId ? absPos(d, parentId) : { x: 0, y: 0 }
      const id = newId()
      const sib = siblings(d, parentId)
      const at = Math.max(...same.map((k) => sib.indexOf(k)))
      d.nodes[id] = { ...(kind === 'group' ? { group: true } : {}), id, type: kind === 'section' ? 'section' : 'frame', name: kind === 'group' ? nextLabel('Group', d) : nextName(d, kind === 'section' ? 'section' : 'frame'), parentId, x: x0 - p.x, y: y0 - p.y, w: x1 - x0, h: y1 - y0, children: [], style: kind === 'group' ? { clip: false } : kind === 'section' ? { ...DEFAULT_STYLE.section } : { clip: true } } // 감싸서 만든 프레임(⌥⌘G · 여럿에 ⇧A)은 칠 없음 — 안의 내용이 가려지지 않게(피그마와 같아요)
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
    const frames = ids.filter((id) => isContainer(d0.nodes[id]))
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
  // 레이어를 안 고르고 화면(프레임)만 골랐으면 그 화면의 모양을 복사 · 붙여넣어요(피그마와 같아요 — 프레임도 레이어)
  const FRAME_KEYS = ['fill', 'fills', 'stroke', 'strokes', 'strokeWidth', 'strokeAlign', 'strokeSides', 'dash', 'radius', 'radii', 'smoothing', 'opacity', 'effects', 'blend'] as const
  function copyStyle() {
    const sid = screenId.value
    if (!sid) return false
    const n = layerIds.value[0] ? node(sid, layerIds.value[0]) : undefined
    if (n) { styleClip = { ...n.style }; return true }
    const f = doc(sid).frame
    if (f) { styleClip = { ...f }; return true }
    return false
  }
  function pasteStyle() {
    const sid = screenId.value
    if (!sid || !styleClip) return
    if (layerIds.value.length) { style(sid, layerIds.value, styleClip); return }
    const clip = styleClip
    frameStyle(sid, Object.fromEntries(FRAME_KEYS.map((k) => [k, clip[k]])) as Partial<LayerStyle>)
  }

  // --- 회전 · 뒤집기 ---
  /**
   * 스케일(K) · 오른쪽 Scale 칸: 고른 레이어를 안쪽까지 k 배로(자리 · 크기 · 선 · 글자 · 모서리 · 효과 · 간격).
   * anchor: 기준점 [가로, 세로] 0 · 0.5 · 1 — 그 점이 제자리에 남아요(피그마 Scale 의 기준점)
   */
  function scaleLayers(sid: string, ids: string[], k: number, anchor: [number, number] = [0, 0]) {
    if (!(k > 0) || Math.abs(k - 1) < 1e-6) return
    const r2 = (v: number) => Math.round(v * 100) / 100
    mutate(sid, (d) => {
      const list = ids.map((id) => d.nodes[id]).filter((n): n is LayerNode => !!n && !n.locked)
      if (!list.length) return
      // 기준점: 고른 것 전체를 감싸는 상자의 anchor 자리(같은 부모 좌표) — 여러 개도 한 덩어리처럼 커져요
      const bx = Math.min(...list.map((n) => n.x)), by = Math.min(...list.map((n) => n.y))
      const bw = Math.max(...list.map((n) => n.x + n.w)) - bx, bh = Math.max(...list.map((n) => n.y + n.h)) - by
      const px = bx + bw * anchor[0], py = by + bh * anchor[1]
      for (const n of list) {
        const id = n.id
        for (const did of descendants(d, id)) {
          const m = d.nodes[did]
          if (!m) continue
          m.style = scaledStyle(m.style, k)
          if (m.type === 'instance') m.instScale = Math.round((m.instScale ?? 1) * k * 10000) / 10000
          if (did !== id) { m.x = r2(m.x * k); m.y = r2(m.y * k) }
          m.w = Math.max(1, r2(m.w * k)); m.h = Math.max(1, r2(m.h * k))
        }
        n.x = r2(px + (n.x - px) * k); n.y = r2(py + (n.y - py) * k)
      }
    })
  }
  /** 화면(프레임) 내보내기 설정 바꾸기(실행 취소 가능). 레이어 설정은 update(sid, ids, { exports }) */
  function setScreenExports(sid: string, list: ExportSetting[] | undefined) {
    mutate(sid, (d) => { if (list?.length) d.exports = list; else delete d.exports })
  }
  /** 화면(프레임) 스케일: 안의 레이어 전부를 화면 왼쪽 위 기준으로 k 배 + 화면 스타일(모서리 · 선). 화면 크기 · 자리는 부르는 쪽이 바꿔요 */
  function scaleScreenContent(sid: string, k: number) {
    if (!(k > 0) || Math.abs(k - 1) < 1e-6) return
    const r2 = (v: number) => Math.round(v * 100) / 100
    mutate(sid, (d) => {
      for (const root of d.rootIds) {
        for (const did of descendants(d, root)) {
          const m = d.nodes[did]
          if (!m) continue
          m.style = scaledStyle(m.style, k)
          if (m.type === 'instance') m.instScale = Math.round((m.instScale ?? 1) * k * 10000) / 10000
          m.x = r2(m.x * k); m.y = r2(m.y * k)
          m.w = Math.max(1, r2(m.w * k)); m.h = Math.max(1, r2(m.h * k))
        }
      }
      if (d.frame) d.frame = scaledStyle(d.frame, k)
    })
  }
  function rotateBy(sid: string, ids: string[], deg: number) {
    update(sid, ids, (n) => ({ rotation: normAngle((n.rotation ?? 0) + deg) || undefined }))
  }
  function flip(sid: string, ids: string[], axis: 'x' | 'y') {
    const d0 = doc(sid)
    const list = topIds(sid, ids).filter((id) => d0.nodes[id] && !d0.nodes[id]!.locked)
    if (!list.length) return
    update(sid, list, (n) => (axis === 'x' ? { flipX: !n.flipX || undefined } : { flipY: !n.flipY || undefined }))
  }

  // --- 정렬 · 균등 분배 · 간격 맞추기 (돌린 레이어는 감싸는 상자 기준) ---
  /** 화면 기준 감싸는 상자 */
  function box(d: LayerDoc, id: string): Rect { const n = d.nodes[id]!; return aabb(layerMatrix(d, id), n.w, n.h) }
  /**
   * 오토 레이아웃 안에서 방향키로 순서 바꾸기(피그마와 같아요). 고른 것이 모두 같은 오토 레이아웃 부모의 흐름 안 자식일 때만 — 아니면 false(보통 옮기기).
   * 세로: ↑← 앞 · ↓→ 뒤, 가로: ←↑ 앞 · →↓ 뒤, 줄바꿈(Grid): ←→ 한 칸(줄 끝에서 다음 줄 맨 앞으로), ↑↓ 한 줄
   */
  function moveInFlow(sid: string, ids: string[], dir: 'left' | 'right' | 'up' | 'down'): boolean {
    const d0 = doc(sid)
    const list = topIds(sid, ids).map((id) => d0.nodes[id]).filter((n): n is LayerNode => !!n)
    const pid = list[0]?.parentId
    const p = pid ? d0.nodes[pid] : undefined
    const l = p?.style.layout
    if (!p || !l || list.some((n) => n.parentId !== pid || n.absolute)) return false
    const flow = (p.children ?? []).filter((c) => d0.nodes[c] && !d0.nodes[c]!.hidden && !d0.nodes[c]!.absolute)
    let step = dir === 'left' || dir === 'up' ? -1 : 1
    if (l.wrap && (dir === 'up' || dir === 'down')) {
      // 한 줄에 몇 개: 첫 줄(맨 위 y 가 같은 것)
      const y0 = d0.nodes[flow[0]!]!.y
      const cols = Math.max(1, flow.filter((c) => Math.abs(d0.nodes[c]!.y - y0) < 0.5).length)
      step *= cols
    }
    const idx = list.map((n) => flow.indexOf(n.id)).filter((i) => i >= 0).sort((a, b) => a - b)
    if (!idx.length) return false
    const first = idx[0]!, last = idx[idx.length - 1]!
    if (first + step < 0 || last + step > flow.length - 1) return true // 끝이면 그대로(옮기지도 않아요)
    mutate(sid, (d) => {
      const pp = d.nodes[pid!]!
      const order = [...flow]
      const moving = idx.map((i) => order[i]!)
      const rest = order.filter((c) => !moving.includes(c))
      const insertAt = Math.max(0, Math.min(rest.length, first + step))
      rest.splice(insertAt, 0, ...moving)
      // 흐름 밖(숨김 · 위치 무시) 자식은 제자리 칸 그대로
      let k = 0
      pp.children = (pp.children ?? []).map((c) => (flow.includes(c) ? rest[k++]! : c))
    })
    return true
  }
  /** 내용에 맞추기(피그마 Resize to fit): 프레임 크기를 안쪽 레이어들을 딱 감싸게 — 화면에서 보이는 자리는 그대로 */
  function resizeToFit(sid: string, ids: string[]) {
    mutate(sid, (d) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n || n.type !== 'frame' || n.style.layout || !n.children?.length) continue
        const kids = n.children.filter((c) => d.nodes[c] && !d.nodes[c]!.hidden)
        if (!kids.length) continue
        const fa = absPos(d, id)
        const rs = kids.map((c) => box(d, c))
        const x0 = Math.min(...rs.map((r) => r.x)) - fa.x, y0 = Math.min(...rs.map((r) => r.y)) - fa.y
        const x1 = Math.max(...rs.map((r) => r.x + r.w)) - fa.x, y1 = Math.max(...rs.map((r) => r.y + r.h)) - fa.y
        for (const c of n.children) { const k = d.nodes[c]; if (k) { k.x = Math.round((k.x - x0) * 100) / 100; k.y = Math.round((k.y - y0) * 100) / 100 } }
        n.x = Math.round((n.x + x0) * 100) / 100; n.y = Math.round((n.y + y0) * 100) / 100
        n.w = Math.round((x1 - x0) * 100) / 100; n.h = Math.round((y1 - y0) * 100) / 100
      }
    })
  }
  /** 화면 기준으로 (dx, dy) 옮기기 — 돌린 부모 안이면 부모 좌표로 바꿔서 */
  function shiftBy(d: LayerDoc, id: string, dx: number, dy: number) {
    const n = d.nodes[id]!
    const v = applyVec(invert(parentMatrix(d, id)), dx, dy)
    n.x = snapPx(n.x + v.x); n.y = snapPx(n.y + v.y)
  }
  function place(sid: string, ids: string[], next: (rs: Rect[]) => { x: number; y: number }[]) {
    const d0 = doc(sid)
    const list = topIds(sid, ids).filter((id) => d0.nodes[id] && !d0.nodes[id]!.locked)
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
  /**
   * 정리(Tidy up ⌃⌥T, 피그마와 같아요): 고른 것들을 줄(행)로 나눠 같은 간격으로 가지런히.
   * 간격은 지금 간격들의 평균(없으면 10), 첫 줄 왼쪽 위 자리는 그대로
   */
  function tidy(sid: string, ids: string[]) {
    if (ids.length < 2) return
    place(sid, ids, tidyRects)
  }
  /** 선택 반전(⇧⌘A): 같은 단계(형제) 중 안 고른 것들 */
  function selectInverse(sid: string) {
    const d = doc(sid)
    const first = layerIds.value[0] ? d.nodes[layerIds.value[0]] : undefined
    const pool = first ? siblings(d, first.parentId) : d.rootIds
    const cur = new Set(layerIds.value)
    layerIds.value = pool.filter((id) => !cur.has(id) && !d.nodes[id]?.locked && !d.nodes[id]?.hidden)
    screenId.value = sid
  }
  /** 같은 것 모두 고르기(⌥⌘A, 피그마와 같아요): 고른 레이어와 종류 · 모양(스타일)이 같은 것(인스턴스는 같은 컴포넌트) — 화면 안 모든 단계에서 */
  function matchingIds(sid: string): string[] {
    const d = doc(sid)
    const refs = layerIds.value.map((id) => d.nodes[id]).filter((n): n is LayerNode => !!n)
    if (!refs.length) return []
    const look = (st: LayerStyle) => JSON.stringify(Object.keys(st).filter((k) => k !== 'vars' && k !== 'layout').sort().map((k) => [k, st[k as keyof LayerStyle]]))
    const key = (n: LayerNode) => (n.type === 'instance' ? 'i:' + (n.component ?? n.name) : n.type + ':' + look(n.style))
    const want = new Set(refs.map(key))
    return Object.values(d.nodes).filter((n) => !n.locked && !n.hidden && want.has(key(n))).map((n) => n.id)
  }
  /** 고른 것 말고도 같은 레이어가 있나(없으면 버튼을 숨기고 메뉴는 흐리게) */
  function hasMatching(sid: string): boolean {
    const cur = new Set(layerIds.value)
    return matchingIds(sid).some((id) => !cur.has(id))
  }
  /** 같은 것 모두 고르기 — 고른 개수를 돌려줘요(늘어난 게 없으면 0) */
  function selectMatching(sid: string): number {
    if (!hasMatching(sid)) return 0
    layerIds.value = matchingIds(sid)
    return layerIds.value.length
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
    pixelSnap, snapPx,
    docs, screenId, layerIds, editing, saveState, canUndo, canRedo,
    doc, node, begin, commit, mutate, undo, redo, flushAll, dispose, hasUnsaved, recoverDoc, pushAction,
    hold, release, tidy, selectInverse, selectMatching, hasMatching, topIds, resizeToFit, setWrap, moveInFlow, clipSid: () => clipboard?.sid ?? null,
    nextLabel, selectScreen, selectLayer, toggleX, promoteX, xsel, xGroups, withX, add, addAround, batch, update, scaleLayers, scaleScreenContent, setScreenExports, style, frameStyle, reparent, transfer, addAutoLayout, removeAutoLayout, sizeTo, constrainRoot, relayout, setMeasured, insertTree, booleanOp, flatten, toCornerVector, toggleMask, bind, unbind, remove, arrange, moveTo, copy, paste, pasteOnSelection, duplicate, duplicateInPlace, color,
    selectAll, selectChildren, selectParent, selectSibling, wrap, unwrap, copyStyle, pasteStyle, hasClipboard: () => !!clipboard, setPasteGeo,
    rotateBy, flip, align, distribute, space, boxes,
    absPos: (sid: string, id: string) => absPos(doc(sid), id),
  }
}

export type LayerStore = ReturnType<typeof createLayerStore>
export const LAYER_STORE: InjectionKey<LayerStore> = Symbol('layer-store')
export const useLayerStore = () => inject(LAYER_STORE)!
