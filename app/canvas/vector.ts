import type { LayerDoc, LayerNode, VPath, VPoint } from './schema'
import { arcPath, bakeCorners, hasArc, polygonPoints, radiiOf, STAR_INNER, starPoints, vnetPath } from './paint'
import { booleanLoops, loopsD } from './boolean'
import { translate } from './geom'

/**
 * 벡터 도우미 (v7): 도형 → 벡터 점(펜 편집 · 불리언 · 마스크), SVG 경로 해석, SVG 가져오기.
 * vnet 은 레이어 상자 안 0~1 비율 — 크기를 바꿔도 점을 다시 계산하지 않아도 돼요.
 */
const K = 0.5523 // 원을 3차 베지어 4개로: 핸들 길이 비율
type Abs = { x: number; y: number; i?: [number, number]; o?: [number, number]; r?: number }
type AbsPath = { pts: Abs[]; closed?: boolean }

/** 절대 좌표(px) 경로 → 상자(x · y · w · h) + 0~1 비율 vnet */
export function normalize(paths: AbsPath[]): { x: number; y: number; w: number; h: number; vnet: VPath[] } {
  const xs: number[] = [], ys: number[] = []
  for (const p of paths) for (const q of p.pts) { xs.push(q.x); ys.push(q.y); if (q.i) { xs.push(q.i[0]); ys.push(q.i[1]) } if (q.o) { xs.push(q.o[0]); ys.push(q.o[1]) } }
  const x = Math.min(...xs), y = Math.min(...ys)
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y
  const nx = (v: number) => (w ? Math.round(((v - x) / w) * 1e5) / 1e5 : 0), ny = (v: number) => (h ? Math.round(((v - y) / h) * 1e5) / 1e5 : 0)
  return { x, y, w: Math.max(w, 0), h: Math.max(h, 0), vnet: paths.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => ({ x: nx(q.x), y: ny(q.y), ...(q.i ? { i: [nx(q.i[0]), ny(q.i[1])] as [number, number] } : {}), ...(q.o ? { o: [nx(q.o[0]), ny(q.o[1])] as [number, number] } : {}), ...(q.r ? { r: q.r } : {}) })) })) }
}
/** 0~1 vnet → 상자 안 절대 좌표 */
export function denorm(vnet: VPath[], w: number, h: number, ox = 0, oy = 0): AbsPath[] {
  const X = (v: number) => ox + v * w, Y = (v: number) => oy + v * h
  return vnet.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => ({ x: X(q.x), y: Y(q.y), ...(q.i ? { i: [X(q.i[0]), Y(q.i[1])] as [number, number] } : {}), ...(q.o ? { o: [X(q.o[0]), Y(q.o[1])] as [number, number] } : {}), ...(q.r ? { r: q.r } : {}) })) }))
}

/** 도형 하나 → vnet(그 레이어 상자 기준 0~1). 펜 편집 · 평탄화 · 불리언 · 마스크가 써요 */
export function shapeVnet(n: LayerNode): VPath[] {
  const w = n.w || 1, h = n.h || 1
  const N = (pts: Abs[], closed = true): VPath[] => [{ closed, pts: pts.map((q) => ({ x: q.x / w, y: q.y / h, ...(q.i ? { i: [q.i[0] / w, q.i[1] / h] as [number, number] } : {}), ...(q.o ? { o: [q.o[0] / w, q.o[1] / h] as [number, number] } : {}) })) }]
  switch (n.type) {
    // 벡터: 꼭짓점 둥글기(r)는 곡선 점으로 굳혀서(불리언 · Flatten · 마스크가 실제 모양을 쓰게)
    case 'vector': return bakeCorners(n.vnet ?? [], n.w, n.h)
    // 원 호(Arc)가 있으면 그 모양 그대로(부채꼴 · 고리)
    case 'ellipse': if (hasArc(n.style)) return parsePathD(arcPath(w, h, n.style.arcStart, n.style.arcSweep, n.style.arcInner)).map((p) => ({ closed: p.closed, pts: p.pts.map((q) => ({ x: q.x / w, y: q.y / h, ...(q.i ? { i: [q.i[0] / w, q.i[1] / h] as [number, number] } : {}), ...(q.o ? { o: [q.o[0] / w, q.o[1] / h] as [number, number] } : {}) })) }))
    return [{ closed: true, pts: [
      { x: 0.5, y: 0, i: [0.5 - K / 2, 0], o: [0.5 + K / 2, 0] }, { x: 1, y: 0.5, i: [1, 0.5 - K / 2], o: [1, 0.5 + K / 2] },
      { x: 0.5, y: 1, i: [0.5 + K / 2, 1], o: [0.5 - K / 2, 1] }, { x: 0, y: 0.5, i: [0, 0.5 + K / 2], o: [0, 0.5 - K / 2] },
    ] }]
    // 다각형 · 별: 모서리 둥글기(radius)가 있으면 곡선 점으로 굳혀서
    case 'polygon': return bakeCorners(N(polygonPoints(n.style.sides ?? 3, w, h).map(([x, y]) => ({ x, y }))).map((p) => ({ ...p, pts: p.pts.map((q) => ({ ...q, ...(n.style.radius ? { r: n.style.radius } : {}) })) })), w, h)
    case 'star': return bakeCorners(N(starPoints(n.style.points ?? 5, n.style.inner ?? STAR_INNER, w, h).map(([x, y]) => ({ x, y }))).map((p) => ({ ...p, pts: p.pts.map((q) => ({ ...q, ...(n.style.radius ? { r: n.style.radius } : {}) })) })), w, h)
    case 'line': { const p = n.pts ?? [0, 0, 1, 0]; return [{ closed: false, pts: [{ x: p[0]!, y: p[1]! }, { x: p[2]!, y: p[3]! }] }] }
    case 'path': {
      // 연필은 점 사이를 2차 곡선(가운데점)으로 그려요 → 같은 모양의 3차 곡선으로
      const p: [number, number][] = []
      for (let i = 0; i + 1 < (n.pts ?? []).length; i += 2) p.push([n.pts![i]!, n.pts![i + 1]!])
      if (p.length < 3) return [{ closed: !!n.closed, pts: p.map(([x, y]) => ({ x, y })) }]
      const out: VPoint[] = [{ x: p[0]![0], y: p[0]![1] }]
      let s = p[0]!
      for (let i = 1; i < p.length - 1; i++) {
        const c = p[i]!, e: [number, number] = [(c[0] + p[i + 1]![0]) / 2, (c[1] + p[i + 1]![1]) / 2]
        out[out.length - 1]!.o = [s[0] + (2 / 3) * (c[0] - s[0]), s[1] + (2 / 3) * (c[1] - s[1])]
        out.push({ x: e[0], y: e[1], i: [e[0] + (2 / 3) * (c[0] - e[0]), e[1] + (2 / 3) * (c[1] - e[1])] })
        s = e
      }
      out.push({ x: p[p.length - 1]![0], y: p[p.length - 1]![1] })
      return [{ closed: !!n.closed, pts: out }]
    }
    default: {
      // 사각형 · 프레임 · 이미지 · 텍스트 상자: 모서리 둥글기 포함
      const [a, b, c, d] = radiiOf(n.style).map((r) => Math.min(r, w / 2, h / 2))
      const pts: Abs[] = []
      const corner = (x: number, y: number, r: number, inPt: [number, number], outPt: [number, number]) => {
        if (!r) { pts.push({ x, y }); return }
        pts.push({ x: inPt[0], y: inPt[1], o: [inPt[0] + (x - inPt[0]) * K, inPt[1] + (y - inPt[1]) * K] })
        pts.push({ x: outPt[0], y: outPt[1], i: [outPt[0] + (x - outPt[0]) * K, outPt[1] + (y - outPt[1]) * K] })
      }
      corner(0, 0, a!, [0, a!], [a!, 0]); corner(w, 0, b!, [w - b!, 0], [w, b!]); corner(w, h, c!, [w, h - c!], [w - c!, h]); corner(0, h, d!, [d!, h], [0, h - d!])
      return N(pts)
    }
  }
}

/** 레이어(와 자식) → 부모 상자 기준 경로 d. 불리언 · 마스크가 써요(돌리기는 반영하지 않아요) */
export function nodePathIn(doc: LayerDoc, n: LayerNode, ox = 0, oy = 0): string {
  // 불리언: 계산한 결과 모양(boolean.ts)
  if (n.type === 'boolean') return loopsD(booleanLoops(doc, n, translate(ox + n.x, oy + n.y)))
  return vnetPath(shapeVnet(n), n.w, n.h, ox + n.x, oy + n.y)
}

// ---------------------------------------------------------------------------
// SVG 경로 해석: M L H V C S Q T A Z(절대 · 상대) → 3차 베지어 경로
// ---------------------------------------------------------------------------
type M3 = [number, number, number, number, number, number] // a b c d e f
const ap = (m: M3, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export function parsePathD(d: string, m: M3 = [1, 0, 0, 1, 0, 0]): AbsPath[] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const out: AbsPath[] = []
  let cur: AbsPath | null = null
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc: [number, number] | null = null, lq: [number, number] | null = null
  const num = () => Number(toks[i++])
  const has = () => i < toks.length && !/[a-zA-Z]/.test(toks[i]!)
  const moveTo = (nx: number, ny: number) => { cur = { pts: [{ x: nx, y: ny }] }; out.push(cur); x = sx = nx; y = sy = ny }
  const lineTo = (nx: number, ny: number) => { if (!cur) moveTo(x, y); cur!.pts.push({ x: nx, y: ny }); x = nx; y = ny }
  const curveTo = (c1: [number, number], c2: [number, number], nx: number, ny: number) => {
    if (!cur) moveTo(x, y)
    cur!.pts[cur!.pts.length - 1]!.o = c1
    cur!.pts.push({ x: nx, y: ny, i: c2 })
    x = nx; y = ny
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase()
    const bx = rel ? x : 0, by = rel ? y : 0
    if (C === 'Z') { if (cur) { (cur as AbsPath).closed = true; const f = (cur as AbsPath).pts[0]!; const l = (cur as AbsPath).pts[(cur as AbsPath).pts.length - 1]!; if ((cur as AbsPath).pts.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) { f.i = l.i; (cur as AbsPath).pts.pop() } } x = sx; y = sy; cur = null; lc = lq = null; continue }
    if (!has()) { i++; continue }
    if (C === 'M') { moveTo(bx + num(), by + num()); cmd = rel ? 'l' : 'L'; lc = lq = null; continue }
    if (C === 'L') { lineTo(bx + num(), by + num()); lc = lq = null; continue }
    if (C === 'H') { lineTo(bx + num(), y); lc = lq = null; continue }
    if (C === 'V') { lineTo(x, by + num()); lc = lq = null; continue }
    if (C === 'C') { const c1: [number, number] = [bx + num(), by + num()], c2: [number, number] = [bx + num(), by + num()]; curveTo(c1, c2, bx + num(), by + num()); lc = c2; lq = null; continue }
    if (C === 'S') { const c1: [number, number] = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const c2: [number, number] = [bx + num(), by + num()]; curveTo(c1, c2, bx + num(), by + num()); lc = c2; lq = null; continue }
    if (C === 'Q' || C === 'T') {
      const q: [number, number] = C === 'Q' ? [bx + num(), by + num()] : lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]
      const nx = bx + num(), ny = by + num()
      curveTo([x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)], [nx + (2 / 3) * (q[0] - nx), ny + (2 / 3) * (q[1] - ny)], nx, ny)
      lq = q; lc = null; continue
    }
    if (C === 'A') {
      const rx = Math.abs(num()), ry = Math.abs(num()), rot = num(), large = num(), sweep = num(), nx = bx + num(), ny = by + num()
      for (const seg of arcToCubic(x, y, rx, ry, rot, !!large, !!sweep, nx, ny)) curveTo(seg[0], seg[1], seg[2][0], seg[2][1])
      if (!rx || !ry) lineTo(nx, ny)
      lc = lq = null; continue
    }
    i++
  }
  // 변환 행렬 적용
  for (const p of out) for (const q of p.pts) {
    [q.x, q.y] = ap(m, q.x, q.y)
    if (q.i) q.i = ap(m, q.i[0], q.i[1])
    if (q.o) q.o = ap(m, q.o[0], q.o[1])
  }
  return out.filter((p) => p.pts.length > 1 || p.closed)
}

/** 타원 호 → 3차 베지어 조각들(SVG 명세의 끝점 → 중심 변환) */
function arcToCubic(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): [[number, number], [number, number], [number, number]][] {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return []
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam) }
  const sign = large === sweep ? -1 : 1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)))
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a }
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2))
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4)
  const pt = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
  const der = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos]
  const segs: [[number, number], [number, number], [number, number]][] = []
  for (let s = 0; s < n; s++) {
    const a = t1, b = t1 + step
    const pa = pt(a), pb = pt(b), da = der(a), db = der(b)
    segs.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb])
    t1 = b
  }
  return segs
}

// SVG 가져오기는 app/canvas/svgImport.ts 에 있어요
