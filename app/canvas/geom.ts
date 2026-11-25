/**
 * 캔버스 도형 계산: 회전 · 뒤집기 행렬, 정렬 · 균등 분배, 스냅 · 스마트 가이드, 간격 측정.
 * 좌표는 모두 같은 평면(화면 왼쪽 위 기준이나 캔버스 좌표) 위의 숫자입니다.
 */
import { fmtNum } from './num'
import type { LayerDoc, LayerNode } from './schema'

// ---------------------------------------------------------------------------
// 행렬 (DOMMatrix 와 같은 a b c d e f: x' = a·x + c·y + e, y' = b·x + d·y + f)
// ---------------------------------------------------------------------------
export interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }
export const IDENT: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
export const translate = (x: number, y: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y })
/** m · n (n 을 먼저 적용) */
export function mul(m: Mat, n: Mat): Mat {
  return { a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f }
}
export const apply = (m: Mat, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })
export const applyVec = (m: Mat, x: number, y: number) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y })
export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c || 1
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) }
}
/** 행렬이 돌린 각도(도) */
export const angleOf = (m: Mat) => (Math.atan2(m.b, m.a) * 180) / Math.PI
/** 뒤집기가 홀수 번이면 -1 */
export const handed = (m: Mat) => (m.a * m.d - m.b * m.c < 0 ? -1 : 1)

/** 레이어 안쪽 좌표 → 부모 좌표. CSS 의 transform: rotate() scaleX() scaleY() (가운데 축) 과 같아요 */
export function localMatrix(n: Pick<LayerNode, 'x' | 'y' | 'rotation' | 'flipX' | 'flipY'>, w: number, h: number): Mat {
  const r = ((n.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r), sin = Math.sin(r)
  const fx = n.flipX ? -1 : 1, fy = n.flipY ? -1 : 1
  const a = cos * fx, b = sin * fx, c = -sin * fy, d = cos * fy
  const cx = n.x + w / 2, cy = n.y + h / 2
  return { a, b, c, d, e: cx - (a * w) / 2 - (c * h) / 2, f: cy - (b * w) / 2 - (d * h) / 2 }
}
export type SizeOf = (id: string) => { w: number; h: number } | null
/** 레이어 안쪽 좌표 → 화면(문서) 좌표 */
export function layerMatrix(doc: LayerDoc, id: string, sizeOf?: SizeOf): Mat {
  const chain: LayerNode[] = []
  let n: LayerNode | undefined = doc.nodes[id]
  while (n) { chain.unshift(n); n = n.parentId ? doc.nodes[n.parentId] : undefined }
  let m = IDENT
  for (const v of chain) {
    const s = sizeOf?.(v.id) ?? { w: v.w, h: v.h }
    m = mul(m, localMatrix(v, s.w, s.h))
  }
  return m
}
/** 부모 안쪽 좌표 → 화면(문서) 좌표 */
export function parentMatrix(doc: LayerDoc, id: string): Mat {
  const p = doc.nodes[id]?.parentId
  return p && doc.nodes[p] ? layerMatrix(doc, p) : IDENT
}

// ---------------------------------------------------------------------------
// 상자
// ---------------------------------------------------------------------------
export interface Rect { x: number; y: number; w: number; h: number }
/** 행렬로 옮긴 w × h 상자를 감싸는 축 정렬 상자 */
export function aabb(m: Mat, w: number, h: number): Rect {
  const pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, 0, h), apply(m, w, h)]
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
export function union(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y))
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}

// ---------------------------------------------------------------------------
// 정렬 · 균등 분배 · 간격 맞추기 — 새 왼쪽 위 위치를 돌려줍니다(같은 순서)
// ---------------------------------------------------------------------------
export type AlignKind = 'l' | 'c' | 'r' | 't' | 'm' | 'b'
export type Axis = 'x' | 'y'
export function alignRects(rs: Rect[], kind: AlignKind, area: Rect = union(rs)) {
  return rs.map((r) => {
    if (kind === 'l') return { x: area.x, y: r.y }
    if (kind === 'c') return { x: Math.round(area.x + (area.w - r.w) / 2), y: r.y }
    if (kind === 'r') return { x: area.x + area.w - r.w, y: r.y }
    if (kind === 't') return { x: r.x, y: area.y }
    if (kind === 'm') return { x: r.x, y: Math.round(area.y + (area.h - r.h) / 2) }
    return { x: r.x, y: area.y + area.h - r.h }
  })
}
const pos = (r: Rect, a: Axis) => (a === 'x' ? r.x : r.y)
const len = (r: Rect, a: Axis) => (a === 'x' ? r.w : r.h)
/** 지금 놓인 순서(왼쪽 → 오른쪽, 위 → 아래) */
const order = (rs: Rect[], a: Axis) => rs.map((r, i) => i).sort((i, j) => pos(rs[i]!, a) - pos(rs[j]!, a) || i - j)
/** 처음과 끝은 그대로 두고 사이 간격을 똑같이 */
export function distributeRects(rs: Rect[], a: Axis) {
  const out = rs.map((r) => ({ x: r.x, y: r.y }))
  if (rs.length < 3) return out
  const idx = order(rs, a)
  const first = rs[idx[0]!]!
  const end = Math.max(...rs.map((r) => pos(r, a) + len(r, a)))
  const gap = (end - pos(first, a) - rs.reduce((s, r) => s + len(r, a), 0)) / (rs.length - 1)
  let at = pos(first, a)
  for (const i of idx) {
    out[i]![a] = Math.round(at)
    at += len(rs[i]!, a) + gap
  }
  return out
}
/** 지금 순서대로 간격을 gap 으로 */
export function spaceRects(rs: Rect[], a: Axis, gap: number) {
  const out = rs.map((r) => ({ x: r.x, y: r.y }))
  const idx = order(rs, a)
  let at = pos(rs[idx[0]!]!, a)
  for (const i of idx) {
    out[i]![a] = Math.round(at)
    at += len(rs[i]!, a) + gap
  }
  return out
}
/** 가로로 늘어섰는지 세로로 늘어섰는지 */
export function guessAxis(rs: Rect[]): Axis {
  const cx = rs.map((r) => r.x + r.w / 2), cy = rs.map((r) => r.y + r.h / 2)
  return Math.max(...cx) - Math.min(...cx) >= Math.max(...cy) - Math.min(...cy) ? 'x' : 'y'
}
/** 간격이 모두 같으면 그 값 */
export function currentGap(rs: Rect[], a: Axis): number | null {
  if (rs.length < 2) return null
  const idx = order(rs, a)
  const gaps = idx.slice(1).map((i, k) => pos(rs[i]!, a) - (pos(rs[idx[k]!]!, a) + len(rs[idx[k]!]!, a)))
  return gaps.every((g) => Math.abs(g - gaps[0]!) < 0.5) ? Math.round(gaps[0]!) : null
}

// ---------------------------------------------------------------------------
// 스냅 · 스마트 가이드
// ---------------------------------------------------------------------------
export interface GuideLine { x1: number; y1: number; x2: number; y2: number; dash?: boolean; tick?: boolean }
export interface GuideLabel { x: number; y: number; text: string }
export interface Guides { lines: GuideLine[]; labels: GuideLabel[] }
export const noGuides = (): Guides => ({ lines: [], labels: [] })
// 간격 · 맞춤 숫자: 피그마처럼 정수로(app/canvas/num.ts)
const fmt = fmtNum

const edges = (r: Rect, a: Axis) => (a === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h])
const cross = (a: Axis): Axis => (a === 'x' ? 'y' : 'x')
const overlaps = (r: Rect, t: Rect, a: Axis) => pos(t, a) < pos(r, a) + len(r, a) && pos(t, a) + len(t, a) > pos(r, a)

/** 한 축에서 움직이는 값들(moving)을 기준 값들에 붙일 때 옮길 거리. 없으면 null */
export function snapAxis(moving: number[], targets: number[], thr: number): number | null {
  let best: number | null = null
  for (const m of moving) for (const t of targets) { const d = t - m; if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d }
  return best
}

/** 같은 줄(가로면 세로 범위가 겹치는) 형제 사이의 간격 맞추기 후보 */
function gapCandidates(b: Rect, sibs: Rect[], a: Axis, thr: number): number | null {
  const ca = cross(a)
  const row = sibs.filter((t) => overlaps(b, t, ca))
  const bs = pos(b, a), be = bs + len(b, a)
  const before = row.filter((t) => pos(t, a) + len(t, a) <= bs + thr && pos(t, a) + len(t, a) / 2 < bs + len(b, a) / 2)
  const after = row.filter((t) => pos(t, a) >= be - thr && pos(t, a) + len(t, a) / 2 > bs + len(b, a) / 2)
  const L = before.sort((p, q) => pos(q, a) + len(q, a) - (pos(p, a) + len(p, a)))[0]
  const R = after.sort((p, q) => pos(p, a) - pos(q, a))[0]
  const cands: number[] = []
  if (L && R) cands.push((pos(L, a) + len(L, a) + pos(R, a) - len(b, a)) / 2 - bs)
  // 형제끼리 이미 있는 간격과 같게
  const sorted = row.slice().sort((p, q) => pos(p, a) - pos(q, a))
  for (let i = 0; i + 1 < sorted.length; i++) {
    const g = pos(sorted[i + 1]!, a) - (pos(sorted[i]!, a) + len(sorted[i]!, a))
    if (g <= 0) continue
    if (L) cands.push(pos(L, a) + len(L, a) + g - bs)
    if (R) cands.push(pos(R, a) - g - be)
  }
  let best: number | null = null
  for (const d of cands) if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d
  return best
}

/** 끝난 자리에서 맞닿은 가장자리 · 가운데 선 */
export function alignGuides(b: Rect, targets: Rect[], only?: { x?: number[]; y?: number[] }): Guides {
  const g = noGuides()
  for (const a of ['x', 'y'] as const) {
    const ca = cross(a)
    const spans = new Map<number, [number, number]>()
    const mine = only?.[a] ?? edges(b, a)
    for (const t of targets) {
      for (const tv of edges(t, a)) {
        if (!mine.some((m) => Math.abs(m - tv) < 0.5)) continue
        const k = Math.round(tv * 2) / 2
        const lo = Math.min(pos(b, ca), pos(t, ca)), hi = Math.max(pos(b, ca) + len(b, ca), pos(t, ca) + len(t, ca))
        const cur = spans.get(k)
        spans.set(k, cur ? [Math.min(cur[0], lo), Math.max(cur[1], hi)] : [lo, hi])
      }
    }
    for (const [v, [lo, hi]] of spans) g.lines.push(a === 'x' ? { x1: v, y1: lo, x2: v, y2: hi } : { x1: lo, y1: v, x2: hi, y2: v })
  }
  return g
}

/** 간격 표시 선(양 끝 눈금) + 숫자 */
function gapMark(g: Guides, a: Axis, from: number, to: number, at: number) {
  if (a === 'x') { g.lines.push({ x1: from, y1: at, x2: to, y2: at, tick: true }); g.labels.push({ x: (from + to) / 2, y: at, text: fmt(to - from) }) }
  else { g.lines.push({ x1: at, y1: from, x2: at, y2: to, tick: true }); g.labels.push({ x: at, y: (from + to) / 2, text: fmt(to - from) }) }
}
/** 끝난 자리에서 같은 간격이 맞았으면 간격 표시 */
function gapGuides(b: Rect, sibs: Rect[], g: Guides) {
  for (const a of ['x', 'y'] as const) {
    const ca = cross(a)
    const row = sibs.filter((t) => overlaps(b, t, ca))
    const bs = pos(b, a), be = bs + len(b, a)
    const L = row.filter((t) => pos(t, a) + len(t, a) <= bs + 0.5).sort((p, q) => pos(q, a) + len(q, a) - (pos(p, a) + len(p, a)))[0]
    const R = row.filter((t) => pos(t, a) >= be - 0.5).sort((p, q) => pos(p, a) - pos(q, a))[0]
    const mid = (t: Rect) => { const lo = Math.max(pos(b, ca), pos(t, ca)), hi = Math.min(pos(b, ca) + len(b, ca), pos(t, ca) + len(t, ca)); return (lo + hi) / 2 }
    const gl = L ? bs - (pos(L, a) + len(L, a)) : null
    const gr = R ? pos(R, a) - be : null
    const marks: [number, number, number][] = []
    if (gl !== null && gr !== null && gl > 0 && Math.abs(gl - gr) < 0.5) { marks.push([pos(L!, a) + len(L!, a), bs, mid(L!)], [be, pos(R!, a), mid(R!)]) }
    // 형제끼리의 간격과 같으면 그 간격도 함께
    const sorted = row.slice().sort((p, q) => pos(p, a) - pos(q, a))
    for (let i = 0; i + 1 < sorted.length; i++) {
      const p = sorted[i]!, q = sorted[i + 1]!
      const gg = pos(q, a) - (pos(p, a) + len(p, a))
      if (gg <= 0) continue
      const hitL = gl !== null && gl > 0 && Math.abs(gg - gl) < 0.5
      const hitR = gr !== null && gr > 0 && Math.abs(gg - gr) < 0.5
      if (!hitL && !hitR) continue
      const lo = Math.max(pos(p, ca), pos(q, ca)), hi = Math.min(pos(p, ca) + len(p, ca), pos(q, ca) + len(q, ca))
      marks.push([pos(p, a) + len(p, a), pos(q, a), lo < hi ? (lo + hi) / 2 : pos(p, ca) + len(p, ca) / 2])
      if (hitL) marks.push([pos(L!, a) + len(L!, a), bs, mid(L!)])
      if (hitR) marks.push([be, pos(R!, a), mid(R!)])
    }
    const seen = new Set<string>()
    for (const [f, t, at] of marks) { const k = `${f.toFixed(1)}:${t.toFixed(1)}`; if (seen.has(k)) continue; seen.add(k); gapMark(g, a, f, t, at) }
  }
}

/**
 * 옮기기 스냅: b 를 형제(sibs) · 부모(parents) 의 가장자리 · 가운데, 같은 간격에 붙입니다.
 * 돌려주는 dx · dy 만큼 더 옮기면 붙어요.
 */
export function snapMove(b: Rect, sibs: Rect[], parents: Rect[], thr: number, axes: { x: boolean; y: boolean } = { x: true, y: true }) {
  const all = [...sibs, ...parents]
  let dx = 0, dy = 0
  for (const a of ['x', 'y'] as const) {
    if (!axes[a]) continue
    const e = snapAxis(edges(b, a), all.flatMap((t) => edges(t, a)), thr)
    const gp = gapCandidates(b, sibs, a, thr)
    const d = e === null ? gp : gp === null ? e : Math.abs(gp) < Math.abs(e) ? gp : e
    if (d !== null) { if (a === 'x') dx = d; else dy = d }
  }
  const fb = { ...b, x: b.x + dx, y: b.y + dy }
  const g = alignGuides(fb, all)
  gapGuides(fb, sibs, g)
  return { dx, dy, guides: g }
}

// ---------------------------------------------------------------------------
// 크기 바꾸기 (상자 자신의 좌표에서)
// ---------------------------------------------------------------------------
export type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
export const handleDir = (h: Handle) => ({ sx: h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy: h.includes('s') ? 1 : h.includes('n') ? -1 : 0 })
/**
 * w0 × h0 상자의 손잡이를 (du, dv) 만큼 끌었을 때 새 크기와 가운데가 옮겨 간 거리.
 * ratio: 비율 유지, center: 가운데를 기준으로(⌥)
 */
export function resizeLocal(w0: number, h0: number, handle: Handle, du: number, dv: number, ratio: boolean, center: boolean) {
  const { sx, sy } = handleDir(handle)
  const k = center ? 2 : 1
  let w = w0 + sx * du * k, h = h0 + sy * dv * k
  if (ratio && w0 > 0 && h0 > 0) {
    const s = sx && sy ? (Math.abs(w / w0 - 1) >= Math.abs(h / h0 - 1) ? w / w0 : h / h0) : sx ? w / w0 : h / h0
    w = w0 * s; h = h0 * s
  }
  w = Math.max(1, w); h = Math.max(1, h)
  return { w, h, ox: center || !sx ? 0 : (sx * (w - w0)) / 2, oy: center || !sy ? 0 : (sy * (h - h0)) / 2 }
}
/** 손잡이 커서: 상자가 돌아간 만큼 돌려서 고릅니다 */
const BASE: Record<Handle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
export function handleCursor(h: Handle, angle: number) {
  const i = Math.round((((BASE[h] + angle) % 360) + 360) % 360 / 45) % 4
  return CURSORS[i]!
}

// ---------------------------------------------------------------------------
// 간격 측정 (⌥ 호버)
// ---------------------------------------------------------------------------
/** 고른 상자 s 와 가리킨 상자 t 사이 거리 선 */
export function measureGuides(s: Rect, t: Rect): Guides {
  const g = noGuides()
  const sr = s.x + s.w, sb = s.y + s.h, tr = t.x + t.w, tb = t.y + t.h
  const scx = s.x + s.w / 2, scy = s.y + s.h / 2
  const line = (a: Axis, from: number, to: number, at: number) => { if (Math.abs(to - from) >= 0.5) gapMark(g, a, Math.min(from, to), Math.max(from, to), at) }
  const contains = (o: Rect, i: Rect) => o.x <= i.x + 0.01 && o.y <= i.y + 0.01 && o.x + o.w >= i.x + i.w - 0.01 && o.y + o.h >= i.y + i.h - 0.01
  if (contains(t, s) || contains(s, t)) {
    const [o, i] = contains(t, s) ? [t, s] : [s, t]
    const icx = i.x + i.w / 2, icy = i.y + i.h / 2
    line('x', o.x, i.x, icy); line('x', i.x + i.w, o.x + o.w, icy)
    line('y', o.y, i.y, icx); line('y', i.y + i.h, o.y + o.h, icx)
    return g
  }
  const oy = Math.max(s.y, t.y) < Math.min(sb, tb), ox = Math.max(s.x, t.x) < Math.min(sr, tr)
  // 가로 거리
  const gx = sr <= t.x ? [sr, t.x] : tr <= s.x ? [tr, s.x] : null
  if (gx) {
    const at = oy ? (Math.max(s.y, t.y) + Math.min(sb, tb)) / 2 : scy
    line('x', gx[0]!, gx[1]!, at)
    if (!oy) { const near = Math.abs(t.y - at) < Math.abs(tb - at) ? t.y : tb; const ex = gx[1] === t.x ? t.x : tr; g.lines.push({ x1: ex, y1: at, x2: ex, y2: near, dash: true }) }
  }
  const gy = sb <= t.y ? [sb, t.y] : tb <= s.y ? [tb, s.y] : null
  if (gy) {
    const at = ox ? (Math.max(s.x, t.x) + Math.min(sr, tr)) / 2 : scx
    line('y', gy[0]!, gy[1]!, at)
    if (!ox) { const near = Math.abs(t.x - at) < Math.abs(tr - at) ? t.x : tr; const ey = gy[1] === t.y ? t.y : tb; g.lines.push({ x1: at, y1: ey, x2: near, y2: ey, dash: true }) }
  }
  // 위아래로 떨어져 있고 가로로 겹치면(피그마와 같아요): 왼쪽끼리 · 오른쪽끼리 어긋난 만큼도 — 상대의 세로 가장자리를 점선으로 늘려 고른 것 높이까지
  if (gy && ox) {
    const tNear = gy[1] === t.y ? t.y : tb, sFar = gy[1] === t.y ? s.y : sb
    for (const [se, te] of [[s.x, t.x], [sr, tr]] as const) {
      if (Math.abs(se - te) < 0.5) continue
      line('x', se, te, scy)
      g.lines.push({ x1: te, y1: Math.min(tNear, sFar), x2: te, y2: Math.max(tNear, sFar), dash: true })
    }
  }
  // 좌우로 떨어져 있고 세로로 겹치면: 위끼리 · 아래끼리 어긋난 만큼 — 상대의 가로 가장자리를 점선으로 늘려 고른 것 너비까지
  if (gx && oy) {
    const tNear = gx[1] === t.x ? t.x : tr, sFar = gx[1] === t.x ? s.x : sr
    for (const [se, te] of [[s.y, t.y], [sb, tb]] as const) {
      if (Math.abs(se - te) < 0.5) continue
      line('y', se, te, scx)
      g.lines.push({ x1: Math.min(tNear, sFar), y1: te, x2: Math.max(tNear, sFar), y2: te, dash: true })
    }
  }
  // 겹치면 가장자리끼리
  if (!gx && !gy) {
    line('x', s.x, t.x, scy); line('x', sr, tr, scy)
    line('y', s.y, t.y, scx); line('y', sb, tb, scx)
  }
  return g
}

/** 여러 상자(화면 등)를 한 번에: 정렬은 고른 범위 기준 */
export type ArrangeOp = { kind: 'align'; k: AlignKind } | { kind: 'distribute'; axis: Axis } | { kind: 'space'; axis: Axis; gap: number } | { kind: 'tidy' }
export function arrangeRects(rs: Rect[], op: ArrangeOp) {
  if (op.kind === 'tidy') return tidyRects(rs)
  if (op.kind === 'align') return alignRects(rs, op.k)
  if (op.kind === 'distribute') return distributeRects(rs, op.axis)
  return spaceRects(rs, op.axis, op.gap)
}

/**
 * 정리(Tidy up ⌃⌥T, 피그마와 같아요): 줄(행)로 나눠 같은 간격으로 가지런히.
 * 간격은 지금 간격들의 평균(없으면 10), 왼쪽 위 자리는 그대로
 */
/** 줄(행)로 나누기: 세로 가운데가 앞 줄 안에 들면 같은 줄, 줄 안은 왼쪽부터. gapX · gapY = 지금 간격들의 평균(없으면 10) */
export function rowsOf(rs: Rect[]): { rows: number[][]; gapX: number; gapY: number } {
  const order = rs.map((r, i) => i).sort((a, b) => rs[a]!.y - rs[b]!.y || rs[a]!.x - rs[b]!.x)
  const rows: number[][] = []
  let band: { top: number; bottom: number } | null = null
  for (const i of order) {
    const r = rs[i]!, cy = r.y + r.h / 2
    if (band && cy <= band.bottom) { rows[rows.length - 1]!.push(i); band.bottom = Math.max(band.bottom, r.y + r.h) }
    else { rows.push([i]); band = { top: r.y, bottom: r.y + r.h } }
  }
  rows.forEach((row) => row.sort((a, b) => rs[a]!.x - rs[b]!.x))
  const gx: number[] = [], gy: number[] = []
  rows.forEach((row) => row.slice(1).forEach((i, k) => { const p = rs[row[k]!]!; gx.push(rs[i]!.x - (p.x + p.w)) }))
  rows.slice(1).forEach((row, k) => { const prev = rows[k]!; gy.push(Math.min(...row.map((i) => rs[i]!.y)) - Math.max(...prev.map((i) => rs[i]!.y + rs[i]!.h))) })
  const avg = (v: number[]) => { const pos = v.filter((x) => x > 0); return pos.length ? Math.round(pos.reduce((a, b) => a + b, 0) / pos.length) : 10 }
  const gapX = avg(gx), gapY = avg(gy.length ? gy : gx)
  return { rows, gapX, gapY }
}

export function tidyRects(rs: Rect[]): { x: number; y: number }[] {
  const { rows, gapX, gapY } = rowsOf(rs)
  const x0 = Math.min(...rs.map((r) => r.x)), out = rs.map((r) => ({ x: r.x, y: r.y }))
  let y = Math.min(...rs.map((r) => r.y))
  for (const row of rows) {
    let x = x0
    for (const i of row) { out[i] = { x, y }; x += rs[i]!.w + gapX }
    y += Math.max(...row.map((i) => rs[i]!.h)) + gapY
  }
  return out
}
