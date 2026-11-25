import type { LayerDoc, LayerNode, VPath, VPoint } from './schema'
import { isContainer, isGroupNode } from './schema'
import { shapeVnet } from './vector'
import { IDENT, apply, localMatrix, mul, type Mat } from './geom'

/**
 * 불리언 계산(피그마의 Union · Subtract · Intersect · Exclude 와 같아요) — 곡선은 곡선 그대로 남겨요.
 * 1) 도형마다 경계를 3차 곡선 · 직선 조각으로 바꾸고
 * 2) 다른 조각과 만나는 곳에서 모두 자른 뒤
 * 3) 조각 양옆(아주 조금 떨어진 두 점)이 결과 안 · 밖으로 갈리면 그 조각이 결과의 경계 — 결과 안쪽이 늘 같은 쪽에 오게 방향을 맞춰요
 * 4) 남은 조각을 끝점끼리 이어 닫힌 고리로. 안쪽이 같은 쪽이라 nonzero 로 그리면 구멍까지 맞게 그려져요
 */
export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude'
type P = { x: number; y: number }
/** 3차 곡선 조각 a → d (b · c 는 조종점). line 이면 직선. src · t0 · t1 은 자르기 전 원래 조각과 그 구간(다시 합칠 때) */
interface Seg { a: P; b: P; c: P; d: P; line: boolean; src?: number; t0?: number; t1?: number }
export interface Loop { segs: Seg[]; closed: boolean }
interface Shape { loops: Loop[]; evenodd: boolean; poly: P[][] }

const SIDE = 0.02 // 조각 양옆을 볼 거리(px)
const TOL = 0.002 // 안 · 밖을 볼 때 곡선을 직선으로 쪼개는 오차(px)
const LINK = 0.01 // 끝점이 같은 점으로 보는 거리(px)

const lerp = (p: P, q: P, t: number): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y)
const cross = (p: P, q: P) => p.x * q.y - p.y * q.x
const lineSeg = (a: P, d: P): Seg => ({ a, b: lerp(a, d, 1 / 3), c: lerp(a, d, 2 / 3), d, line: true })

function at(s: Seg, t: number): P {
  const u = 1 - t
  return {
    x: u * u * u * s.a.x + 3 * u * u * t * s.b.x + 3 * u * t * t * s.c.x + t * t * t * s.d.x,
    y: u * u * u * s.a.y + 3 * u * u * t * s.b.y + 3 * u * t * t * s.c.y + t * t * t * s.d.y,
  }
}
function tangent(s: Seg, t: number): P {
  const u = 1 - t
  const v = {
    x: 3 * u * u * (s.b.x - s.a.x) + 6 * u * t * (s.c.x - s.b.x) + 3 * t * t * (s.d.x - s.c.x),
    y: 3 * u * u * (s.b.y - s.a.y) + 6 * u * t * (s.c.y - s.b.y) + 3 * t * t * (s.d.y - s.c.y),
  }
  return Math.hypot(v.x, v.y) > 1e-9 ? v : { x: s.d.x - s.a.x, y: s.d.y - s.a.y }
}
function splitAt(s: Seg, t: number): [Seg, Seg] {
  if (s.line) { const m = lerp(s.a, s.d, t); return [lineSeg(s.a, m), lineSeg(m, s.d)] }
  const ab = lerp(s.a, s.b, t), bc = lerp(s.b, s.c, t), cd = lerp(s.c, s.d, t)
  const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t)
  return [{ a: s.a, b: ab, c: abc, d: m, line: false }, { a: m, b: bcd, c: cd, d: s.d, line: false }]
}
/** t0 → t1 구간(t0 > t1 이면 거꾸로) */
function sub(s: Seg, t0: number, t1: number): Seg {
  const lo = Math.min(t0, t1), hi = Math.max(t0, t1)
  let p = hi < 1 ? splitAt(s, hi)[0] : s
  if (lo > 0) p = splitAt(p, lo / hi)[1]
  return t0 > t1 ? reverse(p) : p
}
const reverse = (s: Seg): Seg => ({ a: s.d, b: s.c, c: s.b, d: s.a, line: s.line, src: s.src, t0: s.t1, t1: s.t0 })
function bbox(s: Seg) {
  return { x0: Math.min(s.a.x, s.b.x, s.c.x, s.d.x), y0: Math.min(s.a.y, s.b.y, s.c.y, s.d.y), x1: Math.max(s.a.x, s.b.x, s.c.x, s.d.x), y1: Math.max(s.a.y, s.b.y, s.c.y, s.d.y) }
}
/** 조종점이 a–d 줄에서 얼마나 떨어졌나 */
function flatness(s: Seg) {
  if (s.line) return 0
  const L = dist(s.a, s.d)
  if (L < 1e-9) return Math.max(dist(s.a, s.b), dist(s.a, s.c))
  const v = { x: s.d.x - s.a.x, y: s.d.y - s.a.y }
  return Math.max(Math.abs(cross(v, { x: s.b.x - s.a.x, y: s.b.y - s.a.y })), Math.abs(cross(v, { x: s.c.x - s.a.x, y: s.c.y - s.a.y }))) / L
}
/** 곡선 → 꺾은선(Wang 공식으로 오차 TOL 안) */
function flattenSeg(s: Seg, out: P[]) {
  if (s.line) { out.push(s.d); return }
  const M = Math.max(Math.hypot(s.a.x - 2 * s.b.x + s.c.x, s.a.y - 2 * s.b.y + s.c.y), Math.hypot(s.b.x - 2 * s.c.x + s.d.x, s.b.y - 2 * s.c.y + s.d.y))
  const n = Math.min(400, Math.max(1, Math.ceil(Math.sqrt((0.75 * M) / TOL))))
  for (let i = 1; i <= n; i++) out.push(at(s, i / n))
}
function polyOf(loop: Loop): P[] {
  const out: P[] = loop.segs.length ? [loop.segs[0]!.a] : []
  for (const s of loop.segs) flattenSeg(s, out)
  return out
}
/** 감긴 수(winding number) */
function winding(polys: P[][], p: P) {
  let w = 0
  for (const poly of polys) {
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i]!, b = poly[(i + 1) % n]!
      if (a.y <= p.y) { if (b.y > p.y && cross({ x: b.x - a.x, y: b.y - a.y }, { x: p.x - a.x, y: p.y - a.y }) > 0) w++ }
      else if (b.y <= p.y && cross({ x: b.x - a.x, y: b.y - a.y }, { x: p.x - a.x, y: p.y - a.y }) < 0) w--
    }
  }
  return w
}
const inside = (s: Shape, p: P) => { const w = winding(s.poly, p); return s.evenodd ? (w & 1) === 1 : w !== 0 }
const shapeOf = (loops: Loop[], evenodd: boolean): Shape => ({ loops, evenodd, poly: loops.map(polyOf) })

// ---------------------------------------------------------------------------
// 만나는 점
// ---------------------------------------------------------------------------
type Hit = { t: number; u: number; p: P }
function lineLine(s1: Seg, s2: Seg, out: Hit[], r1: [number, number] = [0, 1], r2: [number, number] = [0, 1]) {
  const p = s1.a, r = { x: s1.d.x - p.x, y: s1.d.y - p.y }
  const q = s2.a, s = { x: s2.d.x - q.x, y: s2.d.y - q.y }
  const rs = cross(r, s), qp = { x: q.x - p.x, y: q.y - p.y }
  const lr = Math.hypot(r.x, r.y), ls = Math.hypot(s.x, s.y)
  if (lr < 1e-12 || ls < 1e-12) return
  const map = (v: number, rr: [number, number]) => rr[0] + (rr[1] - rr[0]) * v
  if (Math.abs(rs) < 1e-9 * lr * ls) {
    // 나란함: 같은 줄 위에서 겹치면 서로의 끝점에서 잘라요
    if (Math.abs(cross(qp, r)) / lr > 1e-6) return
    const rr = lr * lr, ss = ls * ls
    for (const e of [s2.a, s2.d]) { const t = ((e.x - p.x) * r.x + (e.y - p.y) * r.y) / rr; if (t > -1e-9 && t < 1 + 1e-9) out.push({ t: map(t, r1), u: map(e === s2.a ? 0 : 1, r2), p: e }) }
    for (const e of [s1.a, s1.d]) { const u = ((e.x - q.x) * s.x + (e.y - q.y) * s.y) / ss; if (u > -1e-9 && u < 1 + 1e-9) out.push({ t: map(e === s1.a ? 0 : 1, r1), u: map(u, r2), p: e }) }
    return
  }
  const t = cross(qp, s) / rs, u = cross(qp, r) / rs
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return
  out.push({ t: map(Math.min(1, Math.max(0, t)), r1), u: map(Math.min(1, Math.max(0, u)), r2), p: { x: p.x + r.x * t, y: p.y + r.y * t } })
}
function curveHits(s1: Seg, a0: number, a1: number, s2: Seg, b0: number, b1: number, depth: number, out: Hit[]) {
  if (out.length > 64) return
  const A = bbox(s1), B = bbox(s2)
  if (A.x1 < B.x0 - 1e-6 || B.x1 < A.x0 - 1e-6 || A.y1 < B.y0 - 1e-6 || B.y1 < A.y0 - 1e-6) return
  const f1 = flatness(s1), f2 = flatness(s2)
  if ((f1 < 0.004 && f2 < 0.004) || depth > 40) { lineLine(s1, s2, out, [a0, a1], [b0, b1]); return }
  const sa = Math.max(A.x1 - A.x0, A.y1 - A.y0), sb = Math.max(B.x1 - B.x0, B.y1 - B.y0)
  if ((f1 >= 0.004 && sa >= sb) || f2 < 0.004) {
    const [l, r] = splitAt(s1, 0.5), m = (a0 + a1) / 2
    curveHits(l, a0, m, s2, b0, b1, depth + 1, out); curveHits(r, m, a1, s2, b0, b1, depth + 1, out)
  } else {
    const [l, r] = splitAt(s2, 0.5), m = (b0 + b1) / 2
    curveHits(s1, a0, a1, l, b0, m, depth + 1, out); curveHits(s1, a0, a1, r, m, b1, depth + 1, out)
  }
}
function hits(s1: Seg, s2: Seg): Hit[] {
  const out: Hit[] = []
  if (s1.line && s2.line) lineLine(s1, s2, out)
  else curveHits(s1, 0, 1, s2, 0, 1, 0, out)
  const uniq: Hit[] = []
  for (const h of out) if (!uniq.some((k) => dist(k.p, h.p) < 1e-3)) uniq.push(h)
  return uniq
}

// ---------------------------------------------------------------------------
// 합치기 · 빼기 · 교차 · 제외
// ---------------------------------------------------------------------------
/** shapes 는 아래 → 위 순서(빼기는 맨 아래에서 나머지를 빼요) */
export function combine(shapes: Shape[], op: BoolOp): Loop[] {
  const segs: Seg[] = []
  for (const s of shapes) for (const l of s.loops) for (const g of l.segs) if (dist(g.a, g.d) > 1e-9 || !g.line) segs.push({ ...g, src: segs.length, t0: 0, t1: 1 })
  if (!segs.length) return []
  const boxes = segs.map(bbox)
  const cuts: { t: number; p: P }[][] = segs.map(() => [])
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = boxes[i]!, B = boxes[j]!
      if (A.x1 < B.x0 - 1e-6 || B.x1 < A.x0 - 1e-6 || A.y1 < B.y0 - 1e-6 || B.y1 < A.y0 - 1e-6) continue
      for (const h of hits(segs[i]!, segs[j]!)) { cuts[i]!.push({ t: h.t, p: h.p }); cuts[j]!.push({ t: h.u, p: h.p }) }
    }
  }
  // 만난 곳에서 자르기
  const pieces: Seg[] = []
  segs.forEach((s, i) => {
    const cs = cuts[i]!.filter((c) => c.t > 1e-6 && c.t < 1 - 1e-6 && dist(c.p, s.a) > 1e-4 && dist(c.p, s.d) > 1e-4).sort((a, b) => a.t - b.t)
    let t0 = 0, p0 = s.a
    const push = (t1: number, p1: P) => {
      if (t1 - t0 < 1e-7 || dist(p0, p1) < 1e-5) return
      const g = s.line ? lineSeg(p0, p1) : { ...sub(s, t0, t1), a: p0, d: p1 }
      pieces.push({ ...g, line: s.line, src: i, t0, t1 })
      t0 = t1; p0 = p1
    }
    for (const c of cs) push(c.t, c.p)
    push(1, s.d)
  })
  const inResult = (p: P) => {
    const m = shapes.map((s) => inside(s, p))
    if (op === 'union') return m.some(Boolean)
    if (op === 'intersect') return m.every(Boolean)
    if (op === 'subtract') return m[0]! && !m.slice(1).some(Boolean)
    return m.filter(Boolean).length % 2 === 1
  }
  // 경계 조각만 남기고 결과 안쪽이 늘 왼쪽(법선 쪽)에 오게
  const kept: Seg[] = []
  const seen = new Set<string>()
  for (const g of pieces) {
    const m = at(g, 0.5), tg = tangent(g, 0.5), L = Math.hypot(tg.x, tg.y) || 1
    const nx = -tg.y / L, ny = tg.x / L
    const l = inResult({ x: m.x + nx * SIDE, y: m.y + ny * SIDE }), r = inResult({ x: m.x - nx * SIDE, y: m.y - ny * SIDE })
    if (l === r) continue
    const o = l ? g : reverse(g)
    // 겹친 변(두 도형이 같은 변을 나눠 쓸 때)은 하나만
    const k = [o.a, at(o, 0.5), o.d].map((q) => `${Math.round(q.x * 100)},${Math.round(q.y * 100)}`).join(' ')
    if (seen.has(k)) continue
    seen.add(k)
    kept.push(o)
  }
  // 끝점끼리 이어 고리로
  const used = new Array(kept.length).fill(false)
  const loops: Loop[] = []
  for (let i = 0; i < kept.length; i++) {
    if (used[i]) continue
    used[i] = true
    const segsOut: Seg[] = [kept[i]!]
    const start = kept[i]!.a
    let cur = kept[i]!.d
    for (let guard = 0; guard < kept.length && dist(cur, start) > LINK; guard++) {
      let best = -1, bd = LINK
      for (let j = 0; j < kept.length; j++) { if (used[j]) continue; const dd = dist(kept[j]!.a, cur); if (dd < bd) { bd = dd; best = j } }
      if (best < 0) break
      used[best] = true
      const nx = { ...kept[best]!, a: cur }
      segsOut.push(nx.line ? { ...lineSeg(cur, nx.d), src: nx.src, t0: nx.t0, t1: nx.t1 } : nx)
      cur = nx.d
    }
    const last = segsOut[segsOut.length - 1]!
    if (dist(cur, start) <= LINK) segsOut[segsOut.length - 1] = last.line ? { ...lineSeg(last.a, start), src: last.src, t0: last.t0, t1: last.t1 } : { ...last, d: start }
    const merged = mergeRuns(segsOut, segs)
    if (merged.length >= 2 || (merged.length === 1 && !merged[0]!.line)) loops.push({ segs: merged, closed: true })
  }
  return loops
}
/** 같은 원래 조각에서 이어진 조각 · 한 줄 위 직선은 다시 하나로 */
function mergeRuns(list: Seg[], src: Seg[]): Seg[] {
  const can = (p: Seg, q: Seg) => {
    if (p.line && q.line) {
      const u = { x: p.d.x - p.a.x, y: p.d.y - p.a.y }, v = { x: q.d.x - q.a.x, y: q.d.y - q.a.y }
      const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y)
      return lu > 0 && lv > 0 && Math.abs(cross(u, v)) / (lu * lv) < 1e-6 && u.x * v.x + u.y * v.y > 0
    }
    return !p.line && !q.line && p.src !== undefined && p.src === q.src && Math.abs((p.t1 ?? -1) - (q.t0 ?? -2)) < 1e-9
  }
  const join = (p: Seg, q: Seg): Seg => (p.line ? { ...lineSeg(p.a, q.d), src: p.src, t0: p.t0, t1: q.t1 } : { ...sub(src[p.src!]!, p.t0!, q.t1!), a: p.a, d: q.d, line: false, src: p.src, t0: p.t0, t1: q.t1 })
  const out: Seg[] = []
  for (const s of list) { const prev = out[out.length - 1]; if (prev && can(prev, s)) out[out.length - 1] = join(prev, s); else out.push(s) }
  while (out.length > 2 && can(out[out.length - 1]!, out[0]!)) out[0] = join(out.pop()!, out[0]!)
  return out
}

// ---------------------------------------------------------------------------
// 레이어 → 경계
// ---------------------------------------------------------------------------
/** vnet(0~1) 을 상자 크기 · 행렬로 옮겨 조각 고리로. 열린 경로는 닫아서(채우기는 닫힌 모양으로 봐요 — 피그마와 같아요) */
function vnetLoops(vnet: VPath[], w: number, h: number, m: Mat, keepOpen = false): Loop[] {
  const T = (x: number, y: number) => apply(m, x * w, y * h)
  const out: Loop[] = []
  for (const p of vnet) {
    if (p.pts.length < 2) continue
    const pts = p.pts.map((q) => ({ v: T(q.x, q.y), i: q.i ? T(q.i[0], q.i[1]) : null, o: q.o ? T(q.o[0], q.o[1]) : null }))
    const segs: Seg[] = []
    const seg = (a: (typeof pts)[number], b: (typeof pts)[number]) => {
      if (a.o || b.i) segs.push({ a: a.v, b: a.o ?? a.v, c: b.i ?? b.v, d: b.v, line: false })
      else if (dist(a.v, b.v) > 1e-9) segs.push(lineSeg(a.v, b.v))
    }
    for (let k = 1; k < pts.length; k++) seg(pts[k - 1]!, pts[k]!)
    const closed = !!p.closed || !keepOpen
    if (closed) seg(pts[pts.length - 1]!, pts[0]!)
    if (segs.length) out.push({ segs, closed })
  }
  return out
}
/** 불리언에 들어가는 레이어 하나 → 한 덩어리 모양(m: 그 레이어의 부모 안쪽 → 결과 좌표) */
function operand(doc: LayerDoc, n: LayerNode, m: Mat): Shape | null {
  if (n.hidden) return null
  const lm = mul(m, localMatrix(n, n.w, n.h))
  if (n.type === 'boolean') return shapeOf(boolLoops(doc, n, lm), false)
  if (isContainer(n) && isGroupNode(n)) {
    const kids = (n.children ?? []).map((c) => doc.nodes[c]).filter((c): c is LayerNode => !!c).map((c) => operand(doc, c, lm)).filter((s): s is Shape => !!s)
    return kids.length ? shapeOf(combine(kids, 'union'), false) : null
  }
  return shapeOf(vnetLoops(shapeVnet(n), n.w, n.h, lm), !!n.evenodd)
}

const cache = new Map<string, Loop[]>()
/** 불리언 레이어의 결과 경계(m: 그 레이어 안쪽 좌표 → 원하는 좌표) */
function boolLoops(doc: LayerDoc, n: LayerNode, m: Mat): Loop[] {
  const kids = (n.children ?? []).map((c) => doc.nodes[c]).filter((c): c is LayerNode => !!c)
  const key = JSON.stringify([n.op, m, subtree(doc, kids)])
  const hit = cache.get(key)
  if (hit) return hit
  const shapes = kids.map((c) => operand(doc, c, m)).filter((s): s is Shape => !!s)
  const out = shapes.length ? combine(shapes, n.op ?? 'union') : []
  if (cache.size > 300) cache.clear()
  cache.set(key, out)
  return out
}
/** 모양에 영향을 주는 값만(이름 · 칠은 빼요) */
function subtree(doc: LayerDoc, ns: LayerNode[]): unknown[] {
  return ns.map((n) => [n.type, n.x, n.y, n.w, n.h, n.rotation, n.flipX, n.flipY, n.hidden, n.op, n.evenodd, n.group, n.vnet, n.pts, n.closed, n.style.radius, n.style.radii, n.style.sides, n.style.points, n.style.inner,
    subtree(doc, (n.children ?? []).map((c) => doc.nodes[c]).filter((c): c is LayerNode => !!c))])
}

// ---------------------------------------------------------------------------
// 밖에서 쓰는 것
// ---------------------------------------------------------------------------
export function loopsBounds(loops: Loop[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of loops) for (const p of polyOf(l)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}
const r2 = (v: number) => Math.round(v * 100) / 100
export function loopsD(loops: Loop[]): string {
  let d = ''
  for (const l of loops) {
    if (!l.segs.length) continue
    d += `M${r2(l.segs[0]!.a.x)} ${r2(l.segs[0]!.a.y)}`
    for (const s of l.segs) d += s.line ? `L${r2(s.d.x)} ${r2(s.d.y)}` : `C${r2(s.b.x)} ${r2(s.b.y)} ${r2(s.c.x)} ${r2(s.c.y)} ${r2(s.d.x)} ${r2(s.d.y)}`
    if (l.closed) d += 'Z'
  }
  return d
}
/** 고리 → 벡터 레이어 상자(실제 모양 경계) + 0~1 vnet */
export function loopsVnet(loops: Loop[]): { x: number; y: number; w: number; h: number; vnet: VPath[] } | null {
  const b = loopsBounds(loops)
  if (!b) return null
  const k = (v: number) => Math.round(v * 1e5) / 1e5
  const X = (v: number) => k(b.w ? (v - b.x) / b.w : 0), Y = (v: number) => k(b.h ? (v - b.y) / b.h : 0)
  const vnet = loops.map((l): VPath => {
    const segs = l.segs
    const n = segs.length
    const pts: VPoint[] = segs.map((s, i) => {
      const prev = i > 0 ? segs[i - 1]! : l.closed ? segs[n - 1]! : null
      return { x: X(s.a.x), y: Y(s.a.y), ...(!s.line ? { o: [X(s.b.x), Y(s.b.y)] as [number, number] } : {}), ...(prev && !prev.line ? { i: [X(prev.c.x), Y(prev.c.y)] as [number, number] } : {}) }
    })
    if (!l.closed) { const s = segs[n - 1]!; pts.push({ x: X(s.d.x), y: Y(s.d.y), ...(!s.line ? { i: [X(s.c.x), Y(s.c.y)] as [number, number] } : {}) }) }
    return { closed: l.closed, pts }
  })
  return { x: b.x, y: b.y, w: b.w, h: b.h, vnet }
}

/** 불리언 레이어의 결과 경로(그 레이어 상자 기준) */
export function booleanLoops(doc: LayerDoc, n: LayerNode, m: Mat = IDENT): Loop[] {
  return boolLoops(doc, n, m)
}
export const booleanPath = (doc: LayerDoc, n: LayerNode) => loopsD(boolLoops(doc, n, IDENT))

/**
 * 불리언 상자를 결과 모양에 딱 맞게(피그마와 같아요 — 교차 · 빼기는 남은 모양만큼). 안쪽 도형의 화면 위치는 그대로예요.
 * 오토 레이아웃 계산(layout.relayout) 이 바뀔 때마다 불러요
 */
export function fitBoolean(doc: LayerDoc, n: LayerNode) {
  const b = loopsBounds(boolLoops(doc, n, IDENT))
  if (!b) return
  const bx = r2(b.x), by = r2(b.y), w = Math.max(0.01, r2(b.w)), h = Math.max(0.01, r2(b.h))
  if (Math.abs(bx) < 0.01 && Math.abs(by) < 0.01 && Math.abs(w - n.w) < 0.01 && Math.abs(h - n.h) < 0.01) return
  // 돌린 · 뒤집은 불리언도: 새 상자의 왼쪽 위가 예전 좌표 (bx, by) 에 오게
  const M = localMatrix(n, n.w, n.h)
  const o = apply(M, bx, by)
  n.x = r2(o.x - w / 2 + (M.a * w) / 2 + (M.c * h) / 2)
  n.y = r2(o.y - h / 2 + (M.b * w) / 2 + (M.d * h) / 2)
  n.w = w; n.h = h
  for (const c of n.children ?? []) { const k = doc.nodes[c]; if (k) { k.x = r2(k.x - bx); k.y = r2(k.y - by) } }
}

/** ⌘E 로 벡터가 될 수 있나: 도형 · 불리언 · 그룹(글자 · 이미지 · 인스턴스 · 프레임은 아니에요) */
export function flattenable(n: LayerNode | undefined): n is LayerNode {
  if (!n || n.locked) return false
  if (n.type === 'boolean') return true
  if (isContainer(n)) return isGroupNode(n) && !!n.children?.length
  return n.type !== 'text' && n.type !== 'image' && n.type !== 'instance'
}
/** 메뉴에서 Flatten 을 켤지: 벡터가 아닌 것이 하나라도 있거나, 둘 이상을 하나로 */
export const canFlatten = (ns: (LayerNode | undefined)[]) => { const f = ns.filter(flattenable); return f.length >= 2 || f.some((n) => n.type !== 'vector') }

/**
 * 평탄화 결과(부모 안쪽 좌표): 레이어 하나 · 여럿을 벡터 하나로.
 * 닫힌 도형만이면 합친 모양(겹친 곳 한 번만), 열린 선이 섞이면 경로를 그대로 모아요(선이 사라지지 않게)
 */
export function flattenLoops(doc: LayerDoc, ns: LayerNode[]): Loop[] {
  const open = ns.some((n) => n.type === 'line' || ((n.type === 'path' || n.type === 'vector') && shapeVnet(n).some((p) => !p.closed)))
  if (open) return ns.flatMap((n) => (n.type === 'boolean' || isContainer(n) ? operand(doc, n, IDENT)?.loops ?? [] : vnetLoops(shapeVnet(n), n.w, n.h, localMatrix(n, n.w, n.h), true)))
  const shapes = ns.map((n) => operand(doc, n, IDENT)).filter((s): s is Shape => !!s)
  return shapes.length ? combine(shapes, 'union') : []
}
