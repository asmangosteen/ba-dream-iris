import type { LayerNode } from '~/canvas/schema'
import { ellipsePath, radiiOf, rectPath, vectorPath } from '~/canvas/paint'
import { denorm, normalize, shapeVnet } from '~/canvas/vector'
import { booleanPath } from '~/canvas/boolean'
import { vk, vselPoints, type VEdit, type VKey } from '~/canvas/vsel'
import { apply, invert } from '~/canvas/geom'
import { HOVER_BOX_ONLY, OUTLINE_TYPES, EDITABLE, type CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasHover } from './useCanvasHover'
import type { CanvasPen } from './usePenTool'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasHover & CanvasPen

/** 벡터 점 편집 — 점 · 선 고르기 · 끌기 · 지우기, 편집 중 모양 표시 */
export function useVectorEdit(canvas: Ctx) {
  const {
    props, store, el, tool, vp, dragRef, draft, marqueeOn, guides, worldMat, tick, selScreen, single, sx, sy, moving, hover, pen,
    finishPen,
  } = canvas
  /** 점 편집 상태(오른쪽 패널의 편집 칸도 같이 봐요). sel[0] 이 -1 이면 아직 도형인 꼭짓점 */
  const vedit = useState<VEdit | null>('iris-vedit', () => null)
  /** 아직 도형인 레이어의 꼭짓점(편집 손잡이 자리): 사각형은 상자 네 귀퉁이, 나머지는 도형 경로의 점들 */
  function shapeCorners(n: LayerNode): [number, number][] {
    return n.type === 'rect' ? [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]] : denorm(shapeVnet(n), n.w, n.h).flatMap((p) => p.pts.map((q) => [q.x, q.y] as [number, number]))
  }
  /** 지금 고른 점 전부(고른 선의 양 끝 포함) */
  function vselOf(ve: VEdit): VKey[] {
    const n = store.node(ve.sid, ve.id)
    if (!n) return []
    const corners = n.type === 'vector' ? [] : shapeCorners(n)
    return vselPoints(ve, (pi) => (pi < 0 ? corners.length : n.vnet?.[pi]?.pts.length ?? 0), (pi) => (pi < 0 ? n.type !== 'line' : !!n.vnet?.[pi]?.closed))
  }
  /** 곡선 손잡이 대칭(Mirroring): none · angle(각도만) · both(각도 + 길이) — 패널에서 골라요 */
  const mirror = useState<'none' | 'angle' | 'both'>('iris-mirror', () => 'both')
  /** 패널에서 고친 점 자리(부모 좌표): 캔버스가 받아서 옮겨요 */
  const vptSet = useState<{ x?: number; y?: number; t: number } | null>('iris-vpt-set', () => null)
  watch(tool, (t) => { if (t !== 'pen' && pen.value) finishPen(false); if (t !== 'move') vedit.value = null })
  watch(() => store.layerIds.value.join(), () => { if (vedit.value && (store.layerIds.value.length !== 1 || store.layerIds.value[0] !== vedit.value.id)) vedit.value = null })
  /** 점 편집 들어가기: 벡터가 아니면 벡터로 바꿔서(피그마와 같아요) */
  function enterVectorEdit(sid: string, id: string) {
    const n = store.node(sid, id)
    if (!n || n.locked || !EDITABLE.has(n.type)) return false
    // 도형(사각형 · 원 등)은 그대로 둬요 — 점을 실제로 옮기는 순간에만 벡터로 바꿔요(피그마와 같아요)
    store.selectLayer(sid, id)
    vedit.value = { sid, id, sel: null, pts: [], segs: [] }
    return true
  }
  /** 도형 점 편집 중 회색 상자(피그마처럼 모양 대신 상자 선) */
  /** 선 · 벡터 · 다각형처럼 상자가 아닌 모양: 화면 좌표로 그릴 경로(모양선) */
  function outlineOf(sid: string, id: string) {
    const s = props.screens.find((v) => v.id === sid)
    const n = s ? store.node(sid, id) : undefined
    if (!s || !n || !OUTLINE_TYPES.has(n.type)) return null
    const d = n.type === 'boolean' ? booleanPath(store.doc(sid), n) : vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
    if (!d) return null
    const m = worldMat(s, id), z = vp.value.zoom
    return { d, tf: `matrix(${m.a * z} ${m.b * z} ${m.c * z} ${m.d * z} ${m.e * z + vp.value.x} ${m.f * z + vp.value.y})` }
  }
  /** 마우스를 올렸을 때 모양선은 쓰지 않아요 — 어떤 레이어든 네모 상자(hoverOutline)로 잡혀요(사용자 요청 2026-11-24). 고른 펜 · 선의 모양선(selShape)은 그대로 */
  const hoverShape = computed(() => {
    if (HOVER_BOX_ONLY) return null
    void tick.value
    void vp.value
    const h = hover.value
    if (!h?.id || vedit.value || moving.value || marqueeOn.value || draft.value || guides.value || (tool.value !== 'move' && tool.value !== 'scale')) return null
    if (store.screenId.value === h.sid && store.layerIds.value.includes(h.id)) return null
    const n = store.node(h.sid, h.id)
    return n && !n.locked ? outlineOf(h.sid, h.id) : null
  })
  /** 고른 펜 · 선 레이어: 상자 + 안에 모양선 1px */
  const selShape = computed(() => {
    void tick.value
    void vp.value
    const sg = single.value, s = selScreen.value
    return sg && s && !vedit.value ? outlineOf(s.id, sg.id) : null
  })
  /** 편집 중인 도형 위 파란 빗금(피그마처럼 편집 중인 모양을 표시) */
  const vshape = computed(() => {
    void tick.value
    const ve = vedit.value
    const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
    const n = ve && s ? store.node(ve.sid, ve.id) : undefined
    if (!ve || !s || !n) return null
    const d = n.type === 'rect' ? rectPath(n.w, n.h, radiiOf(n.style)) : n.type === 'ellipse' ? ellipsePath(n.w, n.h) : vectorPath(n.type, n.style, n.w, n.h, n.pts, n.closed, n.vnet)
    const m = worldMat(s, ve.id), z = vp.value.zoom
    const filled = !!n.style.fill || !!n.style.fills?.some((f) => f.visible !== false)
    return { d, tf: `matrix(${m.a * z} ${m.b * z} ${m.c * z} ${m.d * z} ${m.e * z + vp.value.x} ${m.f * z + vp.value.y})`, pw: 6 / z, filled }
  })
  // 정해진 점 자리(패널 X · Y): 고른 점들(고른 선의 양 끝 포함)을 함께 옮겨요 — X · Y 는 고른 점들 상자의 왼쪽 위.
  // 아직 도형이면 벡터로 바꾸고 고른 꼭짓점들(둥근 모서리면 양 끝 점들)을, 벡터면 그 점들을
  watch(vptSet, (r) => {
    if (!r) return
    vptSet.value = null
    moveVsel({ x: r.x, y: r.y })
  })
  /** 고른 점들 옮기기: x · y = 고른 점들 상자 왼쪽 위를 그 자리로(패널), dx · dy = 그만큼(방향키) */
  function moveVsel(r: { x?: number; y?: number; dx?: number; dy?: number }) {
    const ve = vedit.value
    if (!ve) return
    const keys = vselOf(ve)
    if (!keys.length) return
    let n = store.node(ve.sid, ve.id)
    if (!n) return
    let group: [number, number][]
    let cur: { x: number; y: number }
    if (keys[0]![0] < 0) {
      const corners = shapeCorners(n)
      const rads = n.type === 'rect' ? radiiOf(n.style) : []
      const cs = keys.map(([, qi]) => ({ c: corners[qi] ?? [0, 0], r: rads[qi] ?? 0 }))
      cur = { x: Math.min(...cs.map((v) => v.c[0])), y: Math.min(...cs.map((v) => v.c[1])) }
      // 사각형은 꼭짓점 네 개 그대로 벡터로(모서리 둥글기는 꼭짓점 r), 다른 도형은 곡선 점으로
      const corner = store.toCornerVector(ve.sid, ve.id)
      if (!corner) store.flatten(ve.sid, [ve.id])
      n = store.node(ve.sid, ve.id)!
      const abs = denorm(n.vnet ?? [], n.w, n.h)
      group = []
      if (corner) group = keys.map(([, qi]) => [0, qi] as [number, number])
      else abs.forEach((p, pi) => p.pts.forEach((q, qj) => { if (cs.some((v) => Math.abs(q.x - v.c[0]) <= v.r + 0.5 && Math.abs(q.y - v.c[1]) <= v.r + 0.5)) group.push([pi, qj]) }))
      if (!group.length) return
      ve.pts = group
      ve.segs = []
      ve.sel = group[0]!
    } else {
      const abs = denorm(n.vnet ?? [], n.w, n.h)
      group = keys.filter(([pi, qi]) => abs[pi]?.pts[qi])
      if (!group.length) return
      const qs = group.map(([pi, qi]) => abs[pi]!.pts[qi]!)
      cur = { x: Math.min(...qs.map((q) => q.x)), y: Math.min(...qs.map((q) => q.y)) }
    }
    const dx = r.dx ?? (r.x === undefined ? 0 : r.x - (n.x + cur.x)), dy = r.dy ?? (r.y === undefined ? 0 : r.y - (n.y + cur.y))
    const abs = denorm(n.vnet ?? [], n.w, n.h)
    const mv = (p?: [number, number]) => (p ? [p[0] + dx, p[1] + dy] as [number, number] : p)
    for (const [pi, qj] of group) { const q = abs[pi]?.pts[qj]; if (q) { q.x += dx; q.y += dy; q.i = mv(q.i); q.o = mv(q.o) } }
    const box = normalize(abs)
    store.update(ve.sid, [ve.id], { x: n.x + box.x, y: n.y + box.y, w: box.w, h: box.h, vnet: box.vnet })
  }
  /** 점 편집 중 모든 점 고르기(⌘A) */
  function selectAllVpts() {
    const ve = vedit.value
    const n = ve ? store.node(ve.sid, ve.id) : undefined
    if (!ve || !n) return
    const all: VKey[] = n.type === 'vector' ? (n.vnet ?? []).flatMap((p, pi) => p.pts.map((_, qi) => [pi, qi] as VKey)) : shapeCorners(n).map((_, qi) => [-1, qi] as VKey)
    ve.pts = all
    ve.segs = []
    ve.sel = all[0] ?? null
  }
  /** 점 편집 중 빈 곳 끌기: 상자 안 점 고르기(⇧ 면 더하기) — 화면(캔버스 요소) 좌표 */
  const vmarq = ref<{ x: number; y: number; w: number; h: number } | null>(null)
  /** 점 편집 손잡이(화면 좌표) */
  const vhandles = computed(() => {
    void tick.value
    const ve = vedit.value
    if (!ve) return null
    const s = props.screens.find((v) => v.id === ve.sid)
    const n = s ? store.node(ve.sid, ve.id) : undefined
    if (!s || !n) return null
    const m = worldMat(s, ve.id)
    const P = (lx: number, ly: number) => { const q = apply(m, lx, ly); return { x: sx(q.x), y: sy(q.y) } }
    if (n.type !== 'vector') {
      // 아직 도형: 꼭짓점만(사각형은 상자 네 귀퉁이 — 둥근 모서리여도 깨지지 않아요)
      const pts = n.type === 'rect' ? [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]] : denorm(shapeVnet(n), n.w, n.h).flatMap((p) => p.pts.map((q) => [q.x, q.y]))
      return pts.map(([x, y], qi) => ({ pi: -1, qi, a: P(x!, y!), i: null as null | { x: number; y: number }, o: null as null | { x: number; y: number } }))
    }
    // 핸들은 고른 점과 그 이웃 점에만(피그마와 같아요 — 모든 점의 핸들이 다 보이면 복잡해요)
    const show = new Set<string>()
    const vnet = n.vnet ?? []
    for (const [pi, qi] of vselOf(ve)) {
      const len = vnet[pi]?.pts.length ?? 0
      if (!len) continue
      for (const d of [-1, 0, 1]) { const k = qi + d; if (k >= 0 && k < len) show.add(pi + ':' + k); else if (vnet[pi]?.closed) show.add(pi + ':' + ((k + len) % len)) }
    }
    for (const [pi, qi] of ve.segs ?? []) { const len = vnet[pi]?.pts.length ?? 0; show.add(pi + ':' + qi); show.add(pi + ':' + ((qi + 1) % Math.max(1, len))) }
    return vnet.map((p, pi) => p.pts.map((q, qi) => {
      const on = show.has(pi + ':' + qi)
      return { pi, qi, a: P(q.x * n.w, q.y * n.h), i: on && q.i ? P(q.i[0] * n.w, q.i[1] * n.h) : null, o: on && q.o ? P(q.o[0] * n.w, q.o[1] * n.h) : null }
    })).flat()
  })
  /**
   * 점 누르기(피그마와 같아요): 그 점만 고르고 끌면 옮겨요. ⇧ 누르고 누르면 고른 점에 더하거나 빼요.
   * 여러 개 고른 가운데 하나를 누르고 끌면 고른 것 전부를 함께 옮기고, 끌지 않고 떼면 그 점만 남겨요.
   * 핸들(i · o)은 그 점의 핸들만
   */
  function startVpt(e: PointerEvent, pi: number, qi: number, part: 'a' | 'i' | 'o') {
    const ve = vedit.value
    const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
    const n = ve && s ? store.node(ve.sid, ve.id) : undefined
    if (!ve || !s || !n) return
    const key: VKey = [pi, qi]
    if (part === 'a') {
      if (e.shiftKey) {
        const pts = [...(ve.pts?.length ? ve.pts : ve.sel ? [ve.sel] : [])]
        const i = pts.findIndex((k) => k[0] === pi && k[1] === qi)
        if (i >= 0) pts.splice(i, 1)
        else pts.push(key)
        ve.pts = pts
        ve.sel = i >= 0 ? pts[pts.length - 1] ?? null : key
        return
      }
      const cur = vselOf(ve)
      const inSel = cur.some((k) => k[0] === pi && k[1] === qi)
      if (!(inSel && cur.length > 1)) { ve.pts = [key]; ve.segs = [] }
      ve.sel = key
      beginGroupDrag(e, ve, s, n, key, inSel && cur.length > 1 ? key : undefined)
      return
    }
    ve.sel = key
    ve.pts = [key]
    ve.segs = []
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    dragRef.current = { kind: 'vpt', sid: ve.sid, id: ve.id, pi, qi, part, sx: e.clientX, sy: e.clientY, abs0: denorm(n.vnet ?? [], n.w, n.h), inv: invert(worldMat(s, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false }
  }
  /** 고른 점들(고른 선의 양 끝 포함)을 함께 끌기 시작 — at: 누른 점(스마트 가이드 기준). collapse: 끌지 않고 떼면 이 점만 남겨요 */
  function beginGroupDrag(e: PointerEvent, ve: VEdit, s: { id: string }, n: LayerNode, at: VKey, collapse?: VKey) {
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const keys = vselOf(ve)
    const sc = props.screens.find((v) => v.id === s.id)!
    if (at[0] < 0) {
      // 아직 도형: 고른 꼭짓점들만 기억해 두고, 실제로 끌기 시작하면 벡터로 바꿔요(누른 꼭짓점이 맨 앞)
      const corners = shapeCorners(n)
      const rads = n.type === 'rect' ? radiiOf(n.style) : []
      const order = [at[1], ...keys.filter((k) => k[0] < 0 && k[1] !== at[1]).map((k) => k[1])]
      const virtual = order.map((qi) => ({ cx: corners[qi]?.[0] ?? 0, cy: corners[qi]?.[1] ?? 0, r: rads[qi] ?? 0, qi }))
      dragRef.current = { kind: 'vpt', sid: ve.sid, id: ve.id, pi: -1, qi: at[1], part: 'a', sx: e.clientX, sy: e.clientY, abs0: [], inv: invert(worldMat(sc, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false, virtual, collapse }
      return
    }
    dragRef.current = { kind: 'vpt', sid: ve.sid, id: ve.id, pi: at[0], qi: at[1], part: 'a', sx: e.clientX, sy: e.clientY, abs0: denorm(n.vnet ?? [], n.w, n.h), inv: invert(worldMat(sc, ve.id)), x0: n.x, y0: n.y, before: store.begin(ve.sid), moved: false, group: keys.length > 1 ? keys : undefined, collapse }
  }
  /** 선(두 점 사이) 손잡이: 화면 좌표 경로 — 누르면 그 선을 골라요(⇧ 로 더하기 · 빼기), 끌면 양 끝 점을 함께 옮겨요 */
  const vsegs = computed(() => {
    void tick.value
    const ve = vedit.value
    if (!ve) return null
    const s = props.screens.find((v) => v.id === ve.sid)
    const n = s ? store.node(ve.sid, ve.id) : undefined
    if (!s || !n) return null
    const m = worldMat(s, ve.id)
    const P = (lx: number, ly: number) => { const q = apply(m, lx, ly); return `${sx(q.x)} ${sy(q.y)}` }
    const out: { pi: number; qi: number; d: string }[] = []
    const seg = (pi: number, qi: number, a: { x: number; y: number; o?: [number, number] }, b: { x: number; y: number; i?: [number, number] }) => {
      const d = a.o || b.i ? `M ${P(a.x, a.y)} C ${P(...(a.o ?? [a.x, a.y]))} ${P(...(b.i ?? [b.x, b.y]))} ${P(b.x, b.y)}` : `M ${P(a.x, a.y)} L ${P(b.x, b.y)}`
      out.push({ pi, qi, d })
    }
    const ring = (pi: number, pts: { x: number; y: number; i?: [number, number]; o?: [number, number] }[], closed: boolean, base = 0) => {
      for (let k = 0; k < pts.length; k++) {
        const nx = k + 1 < pts.length ? k + 1 : closed ? 0 : -1
        if (nx < 0 || nx === k) continue
        seg(pi, base + k, pts[k]!, pts[nx]!)
      }
    }
    if (n.type === 'rect') ring(-1, shapeCorners(n).map(([x, y]) => ({ x, y })), true)
    else if (n.type !== 'vector') {
      let base = 0
      for (const p of denorm(shapeVnet(n), n.w, n.h)) { ring(-1, p.pts, n.type !== 'line' && p.closed !== false, base); base += p.pts.length }
    } else denorm(n.vnet ?? [], n.w, n.h).forEach((p, pi) => ring(pi, p.pts, !!p.closed))
    return out
  })
  const segOn = (pi: number, qi: number) => !!vedit.value?.segs?.some((k) => k[0] === pi && k[1] === qi)
  const ptOn = computed(() => { const ve = vedit.value; return new Set(ve ? vselOf(ve).map(vk) : []) })
  function startVseg(e: PointerEvent, pi: number, qi: number) {
    const ve = vedit.value
    const s = ve ? props.screens.find((v) => v.id === ve.sid) : undefined
    const n = ve && s ? store.node(ve.sid, ve.id) : undefined
    if (!ve || !s || !n) return
    const key: VKey = [pi, qi]
    const segs = [...(ve.segs ?? [])]
    const i = segs.findIndex((k) => k[0] === pi && k[1] === qi)
    if (e.shiftKey) {
      if (i >= 0) segs.splice(i, 1)
      else segs.push(key)
      ve.segs = segs
      if (!ve.pts?.length && ve.sel) ve.pts = [ve.sel]
      return
    }
    const many = vselOf(ve).length > 2
    if (!(i >= 0 && many)) { ve.segs = [key]; ve.pts = []; ve.sel = null }
    const ends = vselOf({ ...ve, pts: [], segs: [key] })
    beginGroupDrag(e, ve, s, n, ends[0] ?? key, undefined)
  }
  /** 고른 점 지우기(벡터): 고른 점 · 고른 선의 양 끝을 모두 */
  /**
   * 고른 점 지우기(피그마와 같아요): ⌫ 는 점과 이어진 선까지 지워 경로가 끊기고, ⇧⌫(heal)는 이웃 점끼리 다시 이어요.
   * 아직 사각형인 꼭짓점이면 먼저 벡터로 바꿔요
   */
  function deleteVpt(heal = false) {
    const ve = vedit.value
    let n = ve ? store.node(ve.sid, ve.id) : undefined
    if (!ve || !n) return
    let keys = vselOf(ve)
    if (keys.some((k) => k[0] < 0) && n.type === 'rect' && store.toCornerVector(ve.sid, ve.id)) { keys = keys.map((k) => (k[0] < 0 ? [0, k[1]] as VKey : k)); n = store.node(ve.sid, ve.id)! }
    keys = keys.filter((k) => k[0] >= 0)
    if (!keys.length) return
    const abs = denorm(n.vnet ?? [], n.w, n.h)
    if (heal) {
      // 뒤 번호부터 지워야 앞 번호가 밀리지 않아요
      for (const [pi, qi] of [...keys].sort((a, b) => b[0] - a[0] || b[1] - a[1])) abs[pi]?.pts.splice(qi, 1)
    } else {
      // 지운 점 자리에서 경로를 끊어요: 열린 경로는 남은 점들이 이어진 토막마다 따로, 닫힌 경로는 지운 점 다음부터 시작하는 열린 경로로
      const gone = new Map<number, Set<number>>()
      for (const [pi, qi] of keys) gone.set(pi, (gone.get(pi) ?? new Set()).add(qi))
      for (let pi = abs.length - 1; pi >= 0; pi--) {
        const g = gone.get(pi)
        const p = abs[pi]
        if (!g || !p) continue
        const pts = p.pts
        const order = p.closed ? (() => { const start = [...g][0]!; return Array.from({ length: pts.length }, (_, k) => (start + 1 + k) % pts.length) })() : pts.map((_, k) => k)
        const runs: (typeof pts)[] = []
        let cur: typeof pts = []
        for (const k of order) { if (g.has(k)) { if (cur.length) runs.push(cur); cur = [] } else cur.push(pts[k]!) }
        if (cur.length) runs.push(cur)
        // 끊긴 끝의 바깥쪽 핸들은 필요 없어요
        const pieces = runs.filter((r) => r.length >= 2).map((r) => ({ ...p, closed: false, pts: r.map((q, k) => ({ ...q, i: k === 0 ? undefined : q.i, o: k === r.length - 1 ? undefined : q.o })) }))
        abs.splice(pi, 1, ...pieces)
      }
    }
    for (let pi = abs.length - 1; pi >= 0; pi--) if ((abs[pi]?.pts.length ?? 0) < 2) abs.splice(pi, 1)
    ve.sel = null
    ve.pts = []
    ve.segs = []
    if (!abs.length) { vedit.value = null; store.remove(ve.sid, [ve.id]); return }
    const box = normalize(abs)
    store.update(ve.sid, [ve.id], { x: n.x + box.x, y: n.y + box.y, w: box.w, h: box.h, vnet: box.vnet })
  }
  // 점 편집(Edit object): 오른쪽 패널 머리 버튼에서
  const editReq = useState<{ sid: string; id: string; t: number } | null>('iris-edit-object', () => null)
  watch(editReq, (r) => { if (r) { enterVectorEdit(r.sid, r.id); editReq.value = null } })
  return {
    vedit, vselOf, mirror, enterVectorEdit, hoverShape, selShape, vshape, moveVsel, selectAllVpts, vmarq, vhandles, startVpt,
    vsegs, segOn, ptOn, startVseg, deleteVpt,
  }
}
export type CanvasVector = ReturnType<typeof useVectorEdit>
