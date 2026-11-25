import type { LayerDoc, LayerNode, VPath, VPoint } from './schema'
import { arcPath, bakeCorners, hasArc, polygonPoints, radiiOf, starPoints, vnetPath } from './paint'
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
    case 'star': return bakeCorners(N(starPoints(n.style.points ?? 5, n.style.inner ?? 0.38, w, h).map(([x, y]) => ({ x, y }))).map((p) => ({ ...p, pts: p.pts.map((q) => ({ ...q, ...(n.style.radius ? { r: n.style.radius } : {}) })) })), w, h)
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

// ---------------------------------------------------------------------------
// SVG 가져오기: 문서에 잠깐 붙여서 브라우저가 계산한 변환 · 색을 읽어요
// ---------------------------------------------------------------------------
export interface SvgImport { w: number; h: number; layers: { name: string; x: number; y: number; w: number; h: number; vnet: VPath[]; evenodd: boolean; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }[] }
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()
function cssColor(c: string, op = 1): string | undefined {
  if (!c || c === 'none' || c === 'transparent') return undefined
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec(c)
  if (!m) return c.startsWith('#') ? c.toUpperCase() : undefined
  let a = m[4] ? (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1
  a *= op
  if (a <= 0) return undefined
  return '#' + hex2(+m[1]!) + hex2(+m[2]!) + hex2(+m[3]!) + (a < 1 ? hex2(a * 255) : '')
}
export function importSvg(text: string): SvgImport | null {
  if (!import.meta.client) return null
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const src = doc.querySelector('svg')
  if (!src || doc.querySelector('parsererror')) return null
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none' // visibility:hidden 은 안쪽까지 숨김으로 읽혀서 쓰지 않아요
  const svg = document.importNode(src, true) as SVGSVGElement
  host.appendChild(svg)
  document.body.appendChild(host)
  try {
    const vb = svg.viewBox?.baseVal
    const W = Number.parseFloat(svg.getAttribute('width') ?? '') || vb?.width || 100
    const H = Number.parseFloat(svg.getAttribute('height') ?? '') || vb?.height || 100
    const root = svg.getScreenCTM()?.inverse()
    const layers: SvgImport['layers'] = []
    let k = 0
    for (const el of svg.querySelectorAll<SVGGeometryElement>('path, rect, circle, ellipse, line, polyline, polygon')) {
      if (el.closest('defs, clipPath, mask, symbol, pattern, marker')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const ctm = el.getScreenCTM()
      const mm = root && ctm ? root.multiply(ctm) : null
      const m: M3 = mm ? [mm.a, mm.b, mm.c, mm.d, mm.e, mm.f] : [1, 0, 0, 1, 0, 0]
      const tag = el.tagName.toLowerCase()
      const n = (a: string) => Number.parseFloat(el.getAttribute(a) ?? '0') || 0
      let d = ''
      if (tag === 'path') d = el.getAttribute('d') ?? ''
      else if (tag === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); let rx = n('rx'), ry = n('ry'); if (!rx) rx = ry; if (!ry) ry = rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2); d = rx ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z` }
      else if (tag === 'circle' || tag === 'ellipse') { const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry'); d = `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` }
      else if (tag === 'line') d = `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`
      else { const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number); d = 'M' + pts.join(' ').replace(/^(\S+ \S+)/, '$1L') + (tag === 'polygon' ? 'Z' : '') }
      const paths = parsePathD(d, m)
      if (!paths.length) continue
      const op = Number(cs.opacity || 1) * Number(cs.fillOpacity || 1)
      const fill = cssColor(cs.fill, Number(cs.fillOpacity || 1))
      const stroke = cssColor(cs.stroke, Number(cs.strokeOpacity || 1))
      const sw = Number.parseFloat(cs.strokeWidth) || 0
      if (!fill && !(stroke && sw)) continue
      const box = normalize(paths)
      layers.push({ name: el.getAttribute('id') || `Vector ${++k}`, ...box, evenodd: cs.fillRule === 'evenodd', fill: paths.some((p) => p.closed) || tag === 'path' ? fill : undefined, stroke: stroke && sw ? stroke : undefined, strokeWidth: stroke && sw ? sw * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : undefined, opacity: Number(cs.opacity || 1) < 1 ? Number(cs.opacity) : undefined })
      void op
    }
    // viewBox → width/height 비율
    const sx = vb && vb.width ? W / vb.width : 1, sy = vb && vb.height ? H / vb.height : 1
    const ox = vb ? vb.x : 0, oy = vb ? vb.y : 0
    for (const l of layers) { l.x = (l.x - ox) * sx; l.y = (l.y - oy) * sy; l.w *= sx; l.h *= sy; if (l.strokeWidth) l.strokeWidth *= Math.sqrt(sx * sy) }
    return layers.length ? { w: W, h: H, layers } : null
  } finally { host.remove() }
}
