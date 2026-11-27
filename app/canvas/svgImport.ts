import type { Effect, GradStop, Paint, VPath } from './schema'
import { normalize, parsePathD } from './vector'

/**
 * SVG → Iris 레이어(피그마 'SVG로 복사' · SVG 파일 · 다른 앱 SVG 코드).
 * 피그마가 내보내는 모양 그대로 옮겨요: 프레임(배경 · 둥근 모서리 · 내용 자르기) · 그룹(투명도 · 마스크) · 도형(단색 · 그라디언트 · 사진 칠, 선 · 점선 · 끝 모양)
 * · 그림자 · 흐림 · 글자(<text>, 글자 윤곽선을 끄고 내보낸 SVG). 좌표는 모두 SVG 프레임 왼쪽 위 기준(절대)이에요 — 넣는 쪽(편집기)이 부모 기준으로 바꿔요
 */
export type SvgPart =
  | {
    kind: 'vector'; name: string; x: number; y: number; w: number; h: number; vnet: VPath[]; evenodd: boolean
    fills: Paint[]; stroke?: string; strokeWidth?: number; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'bevel' | 'round'; dash?: [number, number]
    opacity?: number; effects?: Effect[]; isMask?: boolean
  }
  | {
    kind: 'text'; name: string; x: number; y: number; w: number; h: number; text: string; fontSize: number; fontWeight: number; color: string
    lineHeight: number; letterSpacing?: number; align?: 'left' | 'center' | 'right'; opacity?: number
  }
  | { kind: 'group'; name: string; x: number; y: number; w: number; h: number; children: SvgPart[]; opacity?: number; effects?: Effect[] }
  /** 프레임(피그마 · Iris 가 내보낸 '잘라내기 그룹 + 맨 아래 배경 사각형') — 배경 · 모서리 · 선 · 내용 자르기 */
  | { kind: 'frame'; name: string; x: number; y: number; w: number; h: number; children: SvgPart[]; fills: Paint[]; radius?: number; stroke?: string; strokeWidth?: number; clip: boolean; opacity?: number; effects?: Effect[] }

export interface SvgDoc {
  w: number; h: number
  /** 맨 바깥 프레임 이름(맨 바깥 <g id>) */
  name?: string
  /** 프레임 배경(피그마 프레임은 맨 아래 꽉 찬 사각형으로 내보내요) */
  fills: Paint[]
  radius?: number
  /** 내용 자르기(피그마 프레임 Clip content — 전체를 감싼 clip-path) */
  clip: boolean
  /** 프레임 선(Iris 가 내보낸 SVG) */
  stroke?: string
  strokeWidth?: number
  parts: SvgPart[]
}

type M3 = [number, number, number, number, number, number]
const NOT_DRAWN = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'style', 'title', 'desc', 'metadata', 'script', 'foreignobject'])
const GEOMETRY = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const XLINK = 'http://www.w3.org/1999/xlink'
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase()
const round2 = (v: number) => Math.round(v * 100) / 100

/** CSS 색 → '#RRGGBB'(+투명도면 AA). 없으면 undefined */
function cssColor(c: string | null | undefined, op = 1): string | undefined {
  if (!c || c === 'none' || c === 'transparent') return undefined
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec(c)
  let r: number, g: number, b: number, a = 1
  if (m) { r = +m[1]!; g = +m[2]!; b = +m[3]!; if (m[4]) a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]) }
  else if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1)
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255
  } else return undefined
  a *= op
  if (a <= 0.001) return undefined
  return '#' + hex2(r) + hex2(g) + hex2(b) + (a < 0.999 ? hex2(a * 255) : '')
}
const num = (v: string | null | undefined, d = 0) => { const n = Number.parseFloat(v ?? ''); return Number.isFinite(n) ? n : d }
/** '50%' · '0.5' → 0.5(objectBoundingBox 비율) */
const frac = (v: string | null, d: number) => (v == null ? d : v.trim().endsWith('%') ? num(v) / 100 : num(v, d))
const apply = (m: M3, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })
const mul = (a: M3, b: M3): M3 => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const scaleOf = (m: M3) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
function ownTransform(el: Element): M3 {
  const t = (el as SVGGraphicsElement).transform?.baseVal?.consolidate?.()
  const x = t?.matrix
  return x ? [x.a, x.b, x.c, x.d, x.e, x.f] : [1, 0, 0, 1, 0, 0]
}

/** 기본 도형 → path d */
function geometryD(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const n = (a: string) => num(el.getAttribute(a))
  if (tag === 'path') return el.getAttribute('d') ?? ''
  if (tag === 'rect') {
    const x = n('x'), y = n('y'), w = n('width'), h = n('height')
    let rx = n('rx'), ry = n('ry'); if (!rx) rx = ry; if (!ry) ry = rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2)
    return rx ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry')
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
  }
  if (tag === 'line') return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`
  const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (pts.length < 4) return ''
  return 'M' + pts.slice(0, 2).join(' ') + 'L' + pts.slice(2).join(' ') + (tag === 'polygon' ? 'Z' : '')
}

export function importSvgDoc(text: string): SvgDoc | null {
  if (!import.meta.client) return null
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
  const src = parsed.querySelector('svg')
  if (!src || parsed.querySelector('parsererror')) return null
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none' // visibility:hidden 은 안쪽까지 숨김으로 읽혀서 쓰지 않아요
  const svg = document.importNode(src, true) as SVGSVGElement
  host.appendChild(svg)
  document.body.appendChild(host)
  try {
    const vb = svg.viewBox?.baseVal
    const W = num(svg.getAttribute('width')) || vb?.width || 100
    const H = num(svg.getAttribute('height')) || vb?.height || 100
    const rootInv = svg.getScreenCTM()?.inverse()
    // SVG 안 좌표(viewBox) → 프레임 크기(width · height)
    const sx = vb && vb.width ? W / vb.width : 1, sy = vb && vb.height ? H / vb.height : 1
    const ox = vb ? vb.x : 0, oy = vb ? vb.y : 0
    const view: M3 = [sx, 0, 0, sy, -ox * sx, -oy * sy]
    /** 요소 좌표 → 프레임 좌표 */
    const matrixOf = (el: Element): M3 => {
      const c = (el as SVGGraphicsElement).getScreenCTM?.()
      const mm = rootInv && c ? rootInv.multiply(c) : null
      return mul(view, mm ? [mm.a, mm.b, mm.c, mm.d, mm.e, mm.f] : [1, 0, 0, 1, 0, 0])
    }
    const byId = (id: string) => svg.querySelector(`[id="${CSS.escape(id)}"]`)
    const refOf = (v: string | null | undefined) => { const m = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(v ?? ''); return m ? byId(m[1]!) : null }
    const hrefOf = (el: Element) => el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href')
    // 이름: id 가 있으면 그것(피그마 '아이디 넣기'), 없으면 모양 · 칠로 — 'Rectangle 1' · 'Ellipse 2' · 'Image 1'(피그마 이름과 같게)
    const counts = new Map<string, number>()
    const labelOf = (tag: string, fills: Paint[]) => {
      const base = fills.some((f) => f.type === 'image') ? 'Image' : tag === 'rect' ? 'Rectangle' : tag === 'circle' || tag === 'ellipse' ? 'Ellipse' : tag === 'line' || tag === 'polyline' ? 'Line' : tag === 'polygon' ? 'Polygon' : 'Vector'
      const n = (counts.get(base) ?? 0) + 1
      counts.set(base, n)
      return `${base} ${n}`
    }

    /** 그라디언트 정지점(href 로 이어 받은 것까지) */
    function stopsOf(g: Element, op: number): GradStop[] {
      let cur: Element | null = g
      for (let i = 0; cur && i < 5; i++) {
        const stops = [...cur.querySelectorAll('stop')]
        if (stops.length) {
          return stops.map((s) => {
            const cs = getComputedStyle(s)
            const color = cssColor(s.getAttribute('stop-color') ?? cs.stopColor, num(s.getAttribute('stop-opacity') ?? cs.stopOpacity, 1) * op) ?? '#00000000'
            return { pos: Math.max(0, Math.min(1, frac(s.getAttribute('offset'), 0))), color }
          })
        }
        const h = hrefOf(cur)
        cur = h?.startsWith('#') ? byId(h.slice(1)) : null
      }
      return []
    }
    /** 칠 하나(fill · stroke 값) → Iris 칠. box = 그 요소의 프레임 위 상자 */
    function paintOf(value: string, op: number, el: Element, m: M3, box: { x: number; y: number; w: number; h: number }): Paint | null {
      const ref = refOf(value)
      if (!ref) { const c = cssColor(value, op); return c ? { type: 'solid', color: c } : null }
      const tag = ref.tagName.toLowerCase()
      if (tag === 'lineargradient' || tag === 'radialgradient') {
        const stops = stopsOf(ref, op)
        if (!stops.length) return null
        const gt0 = ownTransformOfGradient(ref)
        const obb0 = (ref.getAttribute('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox'
        const toFrame0 = (x: number, y: number) => { const q = apply(gt0, x, y); return obb0 ? { x: box.x + q.x * box.w, y: box.y + q.y * box.h } : apply(m, q.x, q.y) }
        /** 프레임 위 점 → 레이어 상자 기준 0~1(그라디언트 점 from · to — 피그마와 같아요) */
        const rel = (p: { x: number; y: number }): [number, number] => [Math.round(((p.x - box.x) / (box.w || 1)) * 1e4) / 1e4, Math.round(((p.y - box.y) / (box.h || 1)) * 1e4) / 1e4]
        if (tag === 'radialgradient') {
          // 원형: 가운데(cx · cy) → 가장자리(cx + r) — 피그마는 r=1 + gradientTransform 으로 내보내요
          const cx = frac(ref.getAttribute('cx'), 0.5), cy = frac(ref.getAttribute('cy'), 0.5), rr = frac(ref.getAttribute('r'), 0.5)
          return { type: 'radial', stops, ...({ from: rel(toFrame0(cx, cy)), to: rel(toFrame0(cx + rr, cy)) } as object) } as Paint
        }
        // 두 점 → CSS 각도, 정지점 자리는 상자 위 그라디언트 선에 맞춰 다시 계산(피그마 손잡이 자리 그대로)
        const obb = (ref.getAttribute('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox'
        const gt = ownTransformOfGradient(ref)
        const p1r = { x: frac(ref.getAttribute('x1'), 0), y: frac(ref.getAttribute('y1'), 0) }, p2r = { x: frac(ref.getAttribute('x2'), 1), y: frac(ref.getAttribute('y2'), 0) }
        const toFrame = (p: { x: number; y: number }) => {
          const q = apply(gt, p.x, p.y)
          return obb ? { x: box.x + q.x * box.w, y: box.y + q.y * box.h } : apply(m, q.x, q.y)
        }
        const a = toFrame(p1r), b = toFrame(p2r)
        const dx = b.x - a.x, dy = b.y - a.y
        if (!dx && !dy) return { type: 'solid', color: stops[stops.length - 1]!.color }
        const ang = (Math.atan2(dx, -dy) * 180) / Math.PI
        const angle = Math.round(((ang % 360) + 360) % 360 * 10) / 10
        const rad = (angle * Math.PI) / 180, ux = Math.sin(rad), uy = -Math.cos(rad)
        const L = Math.abs(box.w * ux) + Math.abs(box.h * uy) || 1
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2
        const t = (p: { x: number; y: number }) => ((p.x - cx) * ux + (p.y - cy) * uy) / L + 0.5
        const t1 = t(a), t2 = t(b)
        // 그라디언트 점(from · to)이 있으면 정지점은 그대로, 각도(angle)는 점이 없는 화면을 위해 함께 — 각도용으로 다시 맞춘 정지점은 점이 없을 때만
        void t1; void t2
        return { type: 'linear', angle, stops, ...({ from: rel(a), to: rel(b) } as object) } as Paint
      }
      if (tag === 'pattern') {
        // 피그마 사진 칠: pattern 안 <use href="#image"> → <image href="data:...">
        let img: Element | null = ref.querySelector('image')
        if (!img) { const u = ref.querySelector('use'); const h = u ? hrefOf(u) : null; const t2 = h?.startsWith('#') ? byId(h.slice(1)) : null; if (t2?.tagName.toLowerCase() === 'image') img = t2 }
        const href = img ? hrefOf(img) : null
        if (!href) return null
        return { type: 'image', src: href, fit: 'fill', ...(op < 0.999 ? { opacity: round2(op) } : {}) }
      }
      return null
    }
    function ownTransformOfGradient(g: Element): M3 {
      const t = (g as SVGGradientElement).gradientTransform?.baseVal?.consolidate?.()
      const x = t?.matrix
      return x ? [x.a, x.b, x.c, x.d, x.e, x.f] : [1, 0, 0, 1, 0, 0]
    }
    /** 피그마 그림자 · 흐림 필터 → Iris 효과 */
    function effectsOf(f: Element | null): Effect[] | undefined {
      if (!f || f.tagName.toLowerCase() !== 'filter') return undefined
      const out: Effect[] = []
      let cur: { x: number; y: number; blur: number; spread: number; color?: string } = { x: 0, y: 0, blur: 0, spread: 0 }
      for (const p of [...f.children]) {
        const t = p.tagName.toLowerCase()
        if (t === 'feoffset') { cur.x = num(p.getAttribute('dx')); cur.y = num(p.getAttribute('dy')) }
        else if (t === 'fegaussianblur') {
          const std = num(p.getAttribute('stdDeviation'))
          const res = p.getAttribute('result') ?? ''
          if (/foregroundBlur/i.test(res)) out.push({ type: 'blur', blur: round2(std * 2) })
          else cur.blur = round2(std * 2)
        } else if (t === 'femorphology') { const r = num(p.getAttribute('radius')); cur.spread = p.getAttribute('operator') === 'erode' ? -r : r }
        else if (t === 'fecolormatrix' && p.getAttribute('type') === 'matrix') {
          const v = (p.getAttribute('values') ?? '').trim().split(/[\s,]+/).map(Number)
          if (v.length === 20 && v[18] !== 127) cur.color = cssColor(`rgba(${v[4]! * 255}, ${v[9]! * 255}, ${v[14]! * 255}, ${v[18]})`) ?? '#00000000'
        } else if (t === 'feblend') {
          const res = p.getAttribute('result') ?? ''
          const kind = /innerShadow/i.test(res) ? 'inner' : /dropShadow/i.test(res) ? 'drop' : null
          if (kind && cur.color) out.push({ type: kind, x: cur.x, y: cur.y, blur: cur.blur, ...(cur.spread ? { spread: cur.spread } : {}), color: cur.color })
          if (kind) cur = { x: 0, y: 0, blur: 0, spread: 0 }
        }
      }
      return out.length ? out : undefined
    }
    /** 마스크 · clip-path 안 도형들 → 마스크 벡터 하나(Iris 마스크 레이어 — 같은 그룹 안 위쪽 레이어를 그 모양으로 가려요) */
    function maskVector(holder: Element, owner: Element): SvgPart | null {
      const m0 = matrixOf(owner)
      const paths = [...holder.querySelectorAll([...GEOMETRY].join(','))].flatMap((g) => parsePathD(geometryD(g), mul(m0, ownTransform(g))))
      if (!paths.length) return null
      const box = normalize(paths)
      return { kind: 'vector', name: 'Mask', ...box, evenodd: false, fills: [{ type: 'solid', color: '#000000' }], isMask: true }
    }
    function vectorOf(el: Element, inheritedOp: number): SvgPart | null {
      const cs = getComputedStyle(el)
      const m = matrixOf(el)
      const tag = el.tagName.toLowerCase()
      let d: string
      let fillValue = cs.fill
      if (tag === 'image') {
        const x = num(el.getAttribute('x')), y = num(el.getAttribute('y')), w = num(el.getAttribute('width')), h = num(el.getAttribute('height'))
        if (!w || !h) return null
        d = `M${x} ${y}H${x + w}V${y + h}H${x}Z`
        fillValue = 'none'
      } else d = geometryD(el)
      const paths = parsePathD(d, m)
      if (!paths.length) return null
      const box = normalize(paths)
      const fills: Paint[] = []
      if (tag === 'image') { const href = hrefOf(el); if (href) fills.push({ type: 'image', src: href, fit: 'fill' }) }
      else if (fillValue && fillValue !== 'none') { const p = paintOf(fillValue, num(cs.fillOpacity, 1), el, m, box); if (p) fills.push(p) }
      const swRaw = num(cs.strokeWidth, 1)
      const stroke = cs.stroke && cs.stroke !== 'none' ? (() => { const p = paintOf(cs.stroke, num(cs.strokeOpacity, 1), el, m, box); return p?.type === 'solid' ? p.color : p && 'stops' in p ? p.stops[0]?.color : undefined })() : undefined
      if (!fills.length && !stroke) return null
      const closed = paths.some((p) => p.closed) || tag === 'path' || tag === 'image'
      const dashArr = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map(num).filter((v) => v > 0) : []
      const op = num(cs.opacity, 1) * inheritedOp
      const effects = effectsOf(refOf(el.getAttribute('filter') ?? cs.filter))
      return {
        kind: 'vector', name: el.getAttribute('id') || labelOf(tag, fills), ...box, evenodd: cs.fillRule === 'evenodd',
        fills: closed ? fills : [],
        ...(stroke ? { stroke, strokeWidth: round2(swRaw * scaleOf(m)) } : {}),
        ...(stroke && cs.strokeLinecap && cs.strokeLinecap !== 'butt' ? { cap: cs.strokeLinecap as 'round' | 'square' } : {}),
        ...(stroke && cs.strokeLinejoin && cs.strokeLinejoin !== 'miter' ? { join: cs.strokeLinejoin as 'round' | 'bevel' } : {}),
        ...(stroke && dashArr.length ? { dash: [round2(dashArr[0]! * scaleOf(m)), round2((dashArr[1] ?? dashArr[0]!) * scaleOf(m))] as [number, number] } : {}),
        ...(op < 0.999 ? { opacity: round2(op) } : {}),
        ...(effects ? { effects } : {}),
      }
    }
    function textOf(el: Element, inheritedOp: number): SvgPart | null {
      const cs = getComputedStyle(el)
      const spans = [...el.querySelectorAll('tspan')]
      // 줄: 같은 y 의 tspan 을 이어 붙이고, y 가 바뀌면 다음 줄
      const lines: { y: number; t: string }[] = []
      const items = spans.length ? spans : [el]
      for (const s of items) {
        const y = num(s.getAttribute('y') ?? el.getAttribute('y'))
        const t = s.textContent ?? ''
        const last = lines[lines.length - 1]
        if (last && Math.abs(last.y - y) < 0.5) last.t += t
        else lines.push({ y, t })
      }
      const content = lines.map((l) => l.t).join('\n')
      if (!content.trim()) return null
      const m = matrixOf(el)
      let bb: DOMRect
      try { bb = (el as SVGGraphicsElement).getBBox() } catch { return null }
      const c = [apply(m, bb.x, bb.y), apply(m, bb.x + bb.width, bb.y), apply(m, bb.x, bb.y + bb.height), apply(m, bb.x + bb.width, bb.y + bb.height)]
      const x = Math.min(...c.map((p) => p.x)), y = Math.min(...c.map((p) => p.y))
      const w = Math.max(...c.map((p) => p.x)) - x, h = Math.max(...c.map((p) => p.y)) - y
      const k = scaleOf(m)
      const fontSize = round2(num(cs.fontSize, 16) * k)
      // Iris 가 내보낸 글자: 원래 윗변 · 줄 높이(data-top · data-lh)로 그대로
      const dTop = el.getAttribute('data-top'), dLh = el.getAttribute('data-lh')
      const irisTop = dTop != null && dLh != null ? apply(m, 0, num(dTop)).y : null
      const weight = cs.fontWeight === 'bold' ? 700 : cs.fontWeight === 'normal' ? 400 : num(cs.fontWeight, 400)
      const lineHeight = irisTop != null ? round2(num(dLh) * k) : lines.length > 1 ? round2(Math.abs(lines[1]!.y - lines[0]!.y) * k) : round2(h)
      const anchor = cs.textAnchor
      const ls = cs.letterSpacing && cs.letterSpacing !== 'normal' ? num(cs.letterSpacing) * k : 0
      const op = num(cs.opacity, 1) * inheritedOp
      return {
        kind: 'text', name: el.getAttribute('id') || content.split('\n')[0]!.slice(0, 40), x: round2(x), y: round2(irisTop ?? y), w: round2(w), h: round2(irisTop != null ? lineHeight * lines.length : h), text: content, fontSize,
        fontWeight: weight, color: cssColor(cs.fill, num(cs.fillOpacity, 1)) ?? '#000000', lineHeight,
        ...(ls ? { letterSpacing: round2(ls) } : {}), ...(anchor === 'middle' ? { align: 'center' as const } : anchor === 'end' ? { align: 'right' as const } : {}),
        ...(op < 0.999 ? { opacity: round2(op) } : {}),
      }
    }
    /** <g clip-path="사각형 하나"> → 프레임. 사각형이 아니면 null(마스크 그룹으로) */
    function frameOf(el: Element, holder: Element | null, op: number, effects: Effect[] | undefined, given?: { box: { x: number; y: number; w: number; h: number }; k: number; clip: boolean }): SvgPart | null {
      let box: { x: number; y: number; w: number; h: number }, k: number, rx = 0
      if (given) { box = given.box; k = given.k }
      else {
        // 잘라내기 없는 프레임(Iris 가 data-frame 으로 표시): 맨 아래 배경 사각형이 프레임 상자
        const cr = holder ? (() => { const sh = [...holder.children].filter((c) => GEOMETRY.has(c.tagName.toLowerCase())); return sh.length === 1 && sh[0]!.tagName.toLowerCase() === 'rect' && !sh[0]!.getAttribute('transform') ? sh[0]! : null })()
          : [...el.children].find((c) => !NOT_DRAWN.has(c.tagName.toLowerCase())) ?? null
        if (!cr || cr.tagName.toLowerCase() !== 'rect') return null
        const m = holder ? matrixOf(el) : matrixOf(cr)
        if (Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6) return null // 돌린 프레임은 마스크 그룹으로
        k = scaleOf(m)
        const a = apply(m, num(cr.getAttribute('x')), num(cr.getAttribute('y')))
        box = { x: round2(a.x), y: round2(a.y), w: round2(num(cr.getAttribute('width')) * Math.abs(m[0])), h: round2(num(cr.getAttribute('height')) * Math.abs(m[3])) }
        rx = num(cr.getAttribute('rx') ?? cr.getAttribute('ry'))
      }
      const drawn = [...el.children].filter((c) => !NOT_DRAWN.has(c.tagName.toLowerCase()))
      // 맨 아래가 같은 자리 · 크기 사각형이면 프레임 배경 · 선
      const first = drawn[0]
      let bg: Extract<SvgPart, { kind: 'vector' }> | null = null
      if (first && first.tagName.toLowerCase() === 'rect' && !first.getAttribute('clip-path') && !first.getAttribute('mask') && !first.getAttribute('filter')) {
        const v = vectorOf(first, 1)
        if (v && v.kind === 'vector' && Math.abs(v.x - box.x) < 1 && Math.abs(v.y - box.y) < 1 && Math.abs(v.w - box.w) < 1.5 && Math.abs(v.h - box.h) < 1.5 && !v.opacity) {
          bg = v
          if (given) rx = num(first.getAttribute('rx') ?? first.getAttribute('ry'))
        }
      }
      // 배경 사각형 다음 같은 자리 선만 그린 사각형(Iris 가 내보낸 선)도 프레임 선으로
      let rest = bg ? drawn.slice(1) : drawn
      if (bg && !bg.stroke && rest[0]?.tagName.toLowerCase() === 'rect') {
        const v2 = vectorOf(rest[0], 1)
        if (v2 && v2.kind === 'vector' && !v2.fills.length && v2.stroke && Math.abs(v2.x - bg.x) < 1 && Math.abs(v2.y - bg.y) < 1) { bg = { ...bg, stroke: v2.stroke, strokeWidth: v2.strokeWidth }; rest = rest.slice(1) }
      }
      const children = walk(rest, 1)
      return {
        kind: 'frame', name: el.getAttribute('id') || 'Frame', ...box, children, fills: bg?.fills ?? [], ...(rx ? { radius: round2(rx * k) } : {}),
        ...(bg?.stroke ? { stroke: bg.stroke, strokeWidth: bg.strokeWidth } : {}), clip: given ? given.clip : !!holder,
        ...(op < 0.999 ? { opacity: round2(op) } : {}), ...(effects ? { effects } : {}),
      }
    }
    const boxOf = (parts: SvgPart[]) => {
      const x = Math.min(...parts.map((p) => p.x)), y = Math.min(...parts.map((p) => p.y))
      return { x, y, w: Math.max(...parts.map((p) => p.x + p.w)) - x, h: Math.max(...parts.map((p) => p.y + p.h)) - y }
    }
    /** 요소들 → 레이어들(그룹은 투명도 · 마스크 · 효과 · 이름이 있을 때만 남기고 아니면 풀어요) */
    function walk(els: Element[], inheritedOp = 1): SvgPart[] {
      const out: SvgPart[] = []
      for (const el of els) {
        const tag = el.tagName.toLowerCase()
        if (NOT_DRAWN.has(tag)) continue
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        // 중첩 <svg> = 프레임(피그마도 프레임으로 받아요 — Iris 'SVG로 복사' 가 자르기 켠 프레임을 이렇게 내보내요)
        if (tag === 'svg') {
          const vbN = (el as SVGSVGElement).viewBox?.baseVal
          const x0 = vbN && vbN.width ? vbN.x : 0, y0 = vbN && vbN.width ? vbN.y : 0
          const w0 = vbN && vbN.width ? vbN.width : num(el.getAttribute('width')), h0 = vbN && vbN.height ? vbN.height : num(el.getAttribute('height'))
          const m = matrixOf(el)
          if (w0 > 0 && h0 > 0 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6) {
            const a = apply(m, x0, y0), b = apply(m, x0 + w0, y0 + h0)
            const fr = frameOf(el, null, num(cs.opacity, 1) * inheritedOp, effectsOf(refOf(el.getAttribute('filter'))), { box: { x: round2(Math.min(a.x, b.x)), y: round2(Math.min(a.y, b.y)), w: round2(Math.abs(b.x - a.x)), h: round2(Math.abs(b.y - a.y)) }, k: scaleOf(m), clip: cs.overflow !== 'visible' })
            if (fr) { out.push(fr); continue }
          }
        }
        if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
          const op = num(cs.opacity, 1)
          const holder = refOf(el.getAttribute('mask') ?? el.getAttribute('clip-path'))
          const effects = effectsOf(refOf(el.getAttribute('filter')))
          // 프레임: clip-path 가 사각형 하나 → 내용 자르기 프레임(맨 아래가 같은 자리 사각형이면 그게 배경)
          const fr = !el.getAttribute('mask') && (holder || el.hasAttribute('data-frame')) ? frameOf(el, holder, op * inheritedOp, effects) : null
          if (fr) { out.push(fr); continue }
          const kids = walk([...el.children], 1)
          if (!kids.length) continue
          // 그림자 필터 · 이름만 씌운 겉 <g> 가 하나(도형 · 프레임 · 그룹)만 감쌌으면 그 레이어에 합쳐요(피그마 · Iris 가 내보내는 모양)
          if (!holder && kids.length === 1 && (effects || el.getAttribute('id') || op < 0.999)) {
            const k0 = kids[0]!
            if (effects && (k0.kind === 'vector' || k0.kind === 'frame' || k0.kind === 'group')) k0.effects = [...(k0.effects ?? []), ...effects]
            const named = el.getAttribute('id')
            if (named && /^(Frame|Group|Mask group|(Vector|Rectangle|Ellipse|Line|Polygon|Image) \d+)$/.test(k0.name)) k0.name = named
            out.push(withOpacity(k0, op * inheritedOp))
            continue
          }
          const mask = holder ? maskVector(holder, el) : null
          const named = el.getAttribute('id')
          if (!mask && op >= 0.999 && !effects && !(named && kids.length > 1)) { out.push(...kids.map((k) => withOpacity(k, inheritedOp))); continue }
          const children = mask ? [mask, ...kids] : kids
          const box = mask ? { x: mask.x, y: mask.y, w: mask.w, h: mask.h } : boxOf(children)
          const gop = op * inheritedOp
          out.push({ kind: 'group', name: named || (mask ? 'Mask group' : 'Group'), ...box, children, ...(gop < 0.999 ? { opacity: round2(gop) } : {}), ...(effects ? { effects } : {}) })
          continue
        }
        if (GEOMETRY.has(tag) || tag === 'image') {
          const v = vectorOf(el, inheritedOp)
          if (!v) continue
          // clip-path · mask 가 도형 하나에 바로 붙어 있으면 그룹 + 마스크로
          const holder = refOf(el.getAttribute('mask') ?? el.getAttribute('clip-path'))
          const mask = holder ? maskVector(holder, el) : null
          out.push(mask ? { kind: 'group', name: 'Mask group', x: mask.x, y: mask.y, w: mask.w, h: mask.h, children: [mask, v] } : v)
          continue
        }
        if (tag === 'text') { const t = textOf(el, inheritedOp); if (t) out.push(t) }
      }
      return out
    }
    const withOpacity = (p: SvgPart, op: number): SvgPart => (op >= 0.999 ? p : { ...p, opacity: round2((p.opacity ?? 1) * op) })

    // 피그마 프레임 알아보기: 전체를 감싼 clip-path(프레임 크기 사각형) → 내용 자르기 · 모서리, 맨 아래 꽉 찬 사각형 → 프레임 배경
    let body = [...svg.children].filter((e) => !NOT_DRAWN.has(e.tagName.toLowerCase()))
    let clip = false
    let radius: number | undefined
    let rootName: string | undefined
    // Iris 'SVG로 복사'(프레임 · 화면 하나): 맨 바깥 svg 가 그 프레임 — 이름(id) · 자르기(data-frame="clip")
    const rootMark = svg.getAttribute('data-frame')
    if (rootMark) { rootName = svg.getAttribute('id') ?? undefined; clip = rootMark === 'clip' }
    else if (svg.getAttribute('id')) rootName = svg.getAttribute('id') ?? undefined
    const fullRect = (e: Element | null | undefined) => !!e && e.tagName.toLowerCase() === 'rect' && Math.abs(num(e.getAttribute('x'))) < 0.5 && Math.abs(num(e.getAttribute('y'))) < 0.5
      && Math.abs(num(e.getAttribute('width')) - (vb?.width || W)) < 0.5 && Math.abs(num(e.getAttribute('height')) - (vb?.height || H)) < 0.5 && !e.getAttribute('transform')
    if (body.length === 1 && body[0]!.tagName.toLowerCase() === 'g' && body[0]!.getAttribute('clip-path')) {
      const holder = refOf(body[0]!.getAttribute('clip-path'))
      const shapes = holder ? [...holder.children] : []
      if (shapes.length === 1 && fullRect(shapes[0]) && !body[0]!.getAttribute('transform') && num(getComputedStyle(body[0]!).opacity, 1) >= 0.999) {
        clip = true
        rootName = body[0]!.getAttribute('id') ?? undefined
        const rx = num(shapes[0]!.getAttribute('rx'))
        if (rx) radius = round2(rx * sx)
        body = [...body[0]!.children].filter((e) => !NOT_DRAWN.has(e.tagName.toLowerCase()))
      }
    }
    let fills: Paint[] = []
    if (fullRect(body[0]) && !body[0]!.getAttribute('clip-path') && !body[0]!.getAttribute('mask') && !body[0]!.getAttribute('filter')) {
      const cs = getComputedStyle(body[0]!)
      const noStroke = !cs.stroke || cs.stroke === 'none'
      if (noStroke && num(cs.opacity, 1) >= 0.999) {
        const p = paintOf(cs.fill, num(cs.fillOpacity, 1), body[0]!, matrixOf(body[0]!), { x: 0, y: 0, w: W, h: H })
        if (p) { fills = [p]; const rx = num(body[0]!.getAttribute('rx')); if (rx && radius === undefined) radius = round2(rx * sx); body = body.slice(1) }
      }
    }
    // 배경 다음 같은 크기 선만 그린 사각형(Iris 가 내보낸 프레임 선)
    let rootStroke: { stroke: string; strokeWidth?: number } | undefined
    if (fills.length && fullRect(body[0])) { const v = vectorOf(body[0]!, 1); if (v && v.kind === 'vector' && !v.fills.length && v.stroke) { rootStroke = { stroke: v.stroke, strokeWidth: v.strokeWidth }; body = body.slice(1) } }
    const parts = walk(body)
    if (!parts.length && !fills.length) return null
    return { w: W, h: H, ...(rootName ? { name: rootName } : {}), fills, ...(radius ? { radius } : {}), ...(rootStroke ?? {}), clip, parts }
  } finally { host.remove() }
}
