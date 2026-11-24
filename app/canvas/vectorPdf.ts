import { toCanvas } from 'html-to-image'
import type { PDFDocument as PDFDoc, PDFPage, PDFOperator as Op } from 'pdf-lib'
import { ellipsePath, rectPath } from './paint'

/**
 * 벡터 PDF(피그마 Export PDF 처럼): 그려진 화면을 따라가며 도형 · 선 · 글자를 PDF 벡터로 다시 그려요.
 * - 바탕 · 둥근 모서리 · squircle(clip-path) · 테두리(box-shadow 선 · border) · SVG 도형 → 벡터 경로
 * - 글자 → Pretendard 글꼴의 글자 모양(외곽선)을 그 자리 그대로(피그마의 'Outline text' 와 같아요)
 * - 사진 · 그라디언트 · 돌린 요소 · 흐림처럼 벡터로 못 그리는 것만 그 부분을 그림으로
 * - '내용 자르기'(overflow · clip-path)는 PDF 자르기로 — 프레임보다 큰 사진도 프레임 모양대로 잘려요
 * 1px = 1pt, 쪽 크기 = 내보내는 요소 크기
 */

type RGBA = { r: number; g: number; b: number; a: number }
type FKFont = { unitsPerEm: number; ascent: number; descent: number; glyphForCodePoint: (cp: number) => { id: number; path: { scale: (x: number, y: number) => FKPath } } }
type FKPath = { translate: (x: number, y: number) => FKPath; toSVG: () => string }

const skip = (el: Element) => el.classList.contains('lg') || el.classList.contains('sec-name')

function parseColor(v: string | null | undefined): RGBA | null {
  if (!v || v === 'transparent' || v === 'none') return null
  let m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v.trim())
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return a > 0 ? { r: +m[1]! / 255, g: +m[2]! / 255, b: +m[3]! / 255, a } : null
  }
  m = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(v.trim())
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    const c = (x: string) => Math.min(1, Math.max(0, parseFloat(x)))
    return a > 0 ? { r: c(m[1]!), g: c(m[2]!), b: c(m[3]!), a } : null
  }
  return null
}
/** 'path("…")' · 'path(evenodd, "…")' → [d, evenodd] */
function clipPathOf(v: string): [string, boolean] | null {
  const m = /^path\((evenodd,\s*)?["']([^"']+)["']\)$/.exec(v.trim())
  return m ? [m[2]!, !!m[1]] : null
}
/** box-shadow 목록 나누기(괄호 안 쉼표는 그대로) */
function splitShadows(v: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of v) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// --- 글꼴: 문서의 @font-face(Pretendard)에서 굵기별 파일 → fontkit ---
const fontCache = new Map<number, Promise<FKFont | null>>()
let faceList: { weight: number; url: string }[] | null = null
function faces() {
  if (faceList) return faceList
  faceList = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSFontFaceRule) || !/pretendard/i.test(r.style.getPropertyValue('font-family'))) continue
      const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue('src'))
      if (m) faceList.push({ weight: parseInt(r.style.getPropertyValue('font-weight')) || 400, url: new URL(m[1]!, sheet.href ?? location.href).href })
    }
  }
  return faceList
}
async function fontFor(weight: number, fontkit: { create: (b: Uint8Array) => FKFont }): Promise<FKFont | null> {
  const list = faces()
  if (!list.length) return null
  const best = list.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a))
  if (!fontCache.has(best.weight)) {
    fontCache.set(best.weight, fetch(best.url).then((r) => r.arrayBuffer()).then((b) => fontkit.create(new Uint8Array(b))).catch(() => null))
  }
  return fontCache.get(best.weight)!
}

export async function vectorPdf(root: HTMLElement, W: number, H: number): Promise<Blob> {
  const lib = await import('pdf-lib')
  const fkMod = await import('@pdf-lib/fontkit')
  const fontkit = ((fkMod as unknown as { default?: unknown }).default ?? fkMod) as { create: (b: Uint8Array) => FKFont }
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, clip, clipEvenOdd, endPath, scale, translate, drawSvgPath } = lib
  const pdf: PDFDoc = await PDFDocument.create()
  const page: PDFPage = pdf.addPage([W, H])
  const R = root.getBoundingClientRect()
  const z = R.width / (W || 1) || 1
  /** 화면 좌표 → 쪽 좌표(px, 위에서 아래로) */
  const X = (sx: number) => (sx - R.left) / z, Y = (sy: number) => (sy - R.top) / z
  const col = (c: RGBA) => rgb(c.r, c.g, c.b)

  /** 경로를 만드는 연산자만(칠하기 없이): drawSvgPath 의 [q … h Q] 에서 앞뒤를 떼요 */
  const pathOps = (d: string, x: number, y: number): Op[] => { const ops = drawSvgPath(d, { x, y: H - y, scale: undefined, color: undefined, borderColor: undefined, borderWidth: 0 }); return ops.slice(1, ops.length - 2) }
  const pushClip = (d: string, x: number, y: number, evenodd = false) => {
    page.pushOperators(pushGraphicsState(), ...pathOps(d, x, y), evenodd ? clipEvenOdd() : clip(), endPath(), scale(1, -1), translate(-x, -(H - y)))
  }
  const popClip = () => page.pushOperators(popGraphicsState())
  const fillPath = (d: string, x: number, y: number, c: RGBA, op: number, evenodd = false) => {
    if (evenodd) {
      // 구멍 뚫린 모양(테두리 고리): 그 모양으로 자르고 넓게 칠해요
      pushClip(d, x, y, true)
      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: col(c), opacity: c.a * op })
      popClip()
      return
    }
    page.drawSvgPath(d, { x, y: H - y, color: col(c), opacity: c.a * op })
  }
  const strokePath = (d: string, x: number, y: number, c: RGBA, w: number, op: number) => {
    page.drawSvgPath(d, { x, y: H - y, borderColor: col(c), borderWidth: w, borderOpacity: c.a * op })
  }
  /** 그림으로(벡터로 못 그리는 것): 2배 해상도 PNG */
  const drawRaster = async (canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, op: number) => {
    if (!canvas.width || !canvas.height) return
    const png = await pdf.embedPng(canvas.toDataURL('image/png'))
    page.drawImage(png, { x, y: H - y - h, width: w, height: h, opacity: op })
  }
  const rasterEl = async (el: HTMLElement, x: number, y: number, w: number, h: number, op: number, alone = false) => {
    try {
      const c = await toCanvas(el, { pixelRatio: 2, width: el.offsetWidth || undefined, height: el.offsetHeight || undefined, style: { transform: 'none', left: '0', top: '0', margin: '0' }, filter: alone ? () => false : (n) => !(n instanceof Element && skip(n)), preferredFontFormat: 'woff2' })
      await drawRaster(c, x, y, w, h, op)
    } catch { /* 못 그리면 건너뛰어요 */ }
  }

  /** 상자(둥근 모서리 · 원) 경로 — 요소 안쪽 좌표 */
  const boxPath = (cs: CSSStyleDeclaration, w: number, h: number, k: number, inset = 0) => {
    const rad = (v: string, base: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * base : parseFloat(v) * k) || 0
    const raw = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => v.split(' ')[0] ?? '0')
    // 원 · 타원은 50%(이상)일 때만 — 999px 같은 알약 모양은 둥근 네모(짧은 변의 반)예요
    if (raw.every((v) => v.endsWith('%') && parseFloat(v) >= 50)) return ellipsePath(w, h, inset)
    const r = raw.map((v) => rad(v, Math.min(w, h))) as [number, number, number, number]
    return rectPath(w, h, r, inset)
  }

  async function drawText(node: Text, op: number) {
    const el = node.parentElement
    if (!el) return
    const cs = getComputedStyle(el)
    const c = parseColor(cs.color)
    const text = node.data
    if (!c || !text.trim()) return
    const font = await fontFor(parseInt(cs.fontWeight) || 400, fontkit)
    const er = el.getBoundingClientRect()
    const k = el.offsetWidth ? er.width / el.offsetWidth / z : 1
    const size = parseFloat(cs.fontSize) * k
    const range = document.createRange()
    let i = 0
    for (const ch of Array.from(text)) {
      const start = i
      i += ch.length
      if (!ch.trim()) continue
      range.setStart(node, start)
      range.setEnd(node, i)
      const rr = range.getClientRects()[0]
      if (!rr || !rr.width) continue
      if (!font) continue
      const g = font.glyphForCodePoint(ch.codePointAt(0)!)
      if (!g.id) continue
      const s = size / font.unitsPerEm
      const top = Y(rr.top), hh = rr.height / z
      const content = (font.ascent - font.descent) * s
      const base = top + (hh - content) / 2 + font.ascent * s
      const d = g.path.scale(s, -s).translate(X(rr.left), base).toSVG()
      if (d) page.drawSvgPath(d, { x: 0, y: H, color: col(c), opacity: c.a * op })
    }
  }

  async function drawSvg(svg: SVGSVGElement, op: number) {
    const r = svg.getBoundingClientRect()
    const x = X(r.left), y = Y(r.top), w = r.width / z, h = r.height / z
    const vb = svg.viewBox?.baseVal
    const vw = vb && vb.width ? vb.width : svg.width.baseVal.value || w
    const vh = vb && vb.height ? vb.height : svg.height.baseVal.value || h
    const sc = Math.min(w / vw, h / vh)
    const ox = x + (w - vw * sc) / 2 - (vb?.x ?? 0) * sc, oy = y + (h - vh * sc) / 2 - (vb?.y ?? 0) * sc
    for (const s of Array.from(svg.querySelectorAll<SVGGraphicsElement>('path, rect, circle, ellipse, line, polyline, polygon'))) {
      const cs = getComputedStyle(s)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      let d = ''
      const a = (n: string) => parseFloat(s.getAttribute(n) ?? '0') || 0
      if (s.tagName === 'path') d = s.getAttribute('d') ?? ''
      else if (s.tagName === 'rect') d = rectPath(a('width'), a('height'), [a('rx'), a('rx'), a('rx'), a('rx')]).replace(/^M([\d.-]+) ([\d.-]+)/, (_, px, py) => `M${+px} ${+py}`)
      else if (s.tagName === 'circle') { const r0 = a('r'); d = `M${a('cx') - r0} ${a('cy')}a${r0} ${r0} 0 1 0 ${r0 * 2} 0a${r0} ${r0} 0 1 0 ${-r0 * 2} 0Z` }
      else if (s.tagName === 'ellipse') { const rx = a('rx'), ry = a('ry'); d = `M${a('cx') - rx} ${a('cy')}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z` }
      else if (s.tagName === 'line') d = `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`
      else { const pts = (s.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number); if (pts.length >= 4) d = 'M' + pts.join(' ') + (s.tagName === 'polygon' ? 'Z' : '') }
      if (!d) continue
      // rect 는 원점이 (x, y) — 경로를 옮겨요
      const tx = s.tagName === 'rect' ? a('x') : 0, ty = s.tagName === 'rect' ? a('y') : 0
      const o = op * (parseFloat(cs.opacity) || 1)
      const fill = parseColor(cs.fill), stroke = parseColor(cs.stroke)
      const sw = parseFloat(cs.strokeWidth) || 0
      const nonScaling = cs.vectorEffect === 'non-scaling-stroke'
      const opts = { x: ox + tx * sc, y: H - (oy + ty * sc), scale: sc }
      if (fill) page.drawSvgPath(d, { ...opts, color: col(fill), opacity: fill.a * o * (parseFloat(cs.fillOpacity) || 1) })
      if (stroke && sw) page.drawSvgPath(d, { ...opts, borderColor: col(stroke), borderWidth: nonScaling ? sw / z / sc : sw, borderOpacity: stroke.a * o * (parseFloat(cs.strokeOpacity) || 1) })
    }
  }

  async function drawPseudo(el: HTMLElement, which: '::before' | '::after', x: number, y: number, w: number, h: number, k: number, op: number) {
    const ps = getComputedStyle(el, which)
    if (!ps || ps.content === 'none' || ps.display === 'none') return
    const c = parseColor(ps.backgroundColor)
    if (!c) return
    const pos = ps.position === 'absolute' || ps.position === 'fixed'
    const px = x + (pos ? (parseFloat(ps.left) || 0) * k : 0), py = y + (pos ? (parseFloat(ps.top) || 0) * k : 0)
    const pw = parseFloat(ps.width) ? parseFloat(ps.width) * k : w, ph = parseFloat(ps.height) ? parseFloat(ps.height) * k : h
    const cp = clipPathOf(ps.clipPath)
    if (cp) {
      // squircle 바탕 · 선(.sq): clip-path 경로 그대로
      if (Math.abs(k - 1) < 0.001) fillPath(cp[0], px, py, c, op, cp[1])
      return
    }
    fillPath(boxPath(ps, pw, ph, k), px, py, c, op)
  }

  async function walk(el: HTMLElement, parentOp: number) {
    if (skip(el)) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const op = parentOp * (parseFloat(cs.opacity) || 0)
    if (op <= 0.001) return
    const r = el.getBoundingClientRect()
    const x = X(r.left), y = Y(r.top), w = r.width / z, h = r.height / z
    const k = el.offsetWidth ? r.width / el.offsetWidth / z : 1
    if (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
      const cp = clipPathOf(cs.clipPath)
      if (cp) pushClip(cp[0], x, y)
      else pushClip(boxPath(cs, w, h, k), x, y)
      await rasterEl(el, x, y, w, h, op)
      popClip()
      return
    }
    // 돌린 · 기울인 요소, 흐림은 그 부분만 그림으로
    const tf = cs.transform
    const rotated = tf && tf !== 'none' && (() => { const m = new DOMMatrixReadOnly(tf); return Math.abs(m.b) > 1e-4 || Math.abs(m.c) > 1e-4 })()
    if (el !== root && (rotated || (cs.filter && cs.filter !== 'none' && /blur/.test(cs.filter)))) { await rasterEl(el, x, y, w, h, op); return }

    const own = clipPathOf(cs.clipPath)
    if (own && el !== root) pushClip(own[0], x, y, own[1])
    const shape = own ? own[0] : boxPath(cs, w, h, k)
    // 바탕
    const bg = parseColor(cs.backgroundColor)
    if (bg) fillPath(shape, x, y, bg, op)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') { pushClip(shape, x, y); await rasterEl(el, x, y, w, h, op, true); popClip() }
    await drawPseudo(el, '::before', x, y, w, h, k, op)
    // 선: box-shadow 로 그린 테두리(번짐 없는 고리)와 border
    const rings: { inset: boolean; c: RGBA; s: number }[] = []
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      for (const part of splitShadows(cs.boxShadow)) {
        const cm = /(rgba?\([^)]*\)|color\([^)]*\))/.exec(part)
        const c = parseColor(cm?.[1])
        const nums = part.replace(cm?.[1] ?? '', '').replace('inset', '').trim().split(/\s+/).map((v) => parseFloat(v) || 0)
        const [ox = 0, oy = 0, blur = 0, spread = 0] = nums
        if (c && !ox && !oy && !blur && spread) rings.push({ inset: part.includes('inset'), c, s: spread * k })
      }
    }
    // border: 네 변이 같으면 선 하나, 다르면 변마다 막대로
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((sd) => ({ w: (parseFloat(cs.getPropertyValue(`border-${sd.toLowerCase()}-width`)) || 0) * k, c: cs.getPropertyValue(`border-${sd.toLowerCase()}-style`) === 'none' ? null : parseColor(cs.getPropertyValue(`border-${sd.toLowerCase()}-color`)) }))
    const uniform = sides.every((x) => x.w === sides[0]!.w && x.c && sides[0]!.c && x.c.r === sides[0]!.c.r && x.c.g === sides[0]!.c.g && x.c.b === sides[0]!.c.b && x.c.a === sides[0]!.c.a)
    const bw = uniform ? sides[0]!.w : 0
    const bc = uniform ? sides[0]!.c : null
    // 바깥 선은 바탕 아래에 오지만 PDF 에선 겹침이 없어서 순서만 맞춰요
    for (const ring of rings.filter((g) => !g.inset)) strokePath(boxPath(cs, w, h, k, -ring.s / 2), x, y, ring.c, ring.s, op)

    // 내용 자르기(overflow): 아이들만
    const clips = el !== root && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')
    if (clips) pushClip(shape, x, y)
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) await drawText(n as Text, op)
      else if (n instanceof SVGSVGElement) { if (getComputedStyle(n).display !== 'none') await drawSvg(n, op) }
      else if (n instanceof HTMLElement) await walk(n, op)
    }
    if (clips) popClip()
    // 안쪽 선 · border · ::after(squircle 선)는 내용 위에
    for (const ring of rings.filter((g) => g.inset)) strokePath(boxPath(cs, w, h, k, ring.s / 2), x, y, ring.c, ring.s, op)
    if (bw > 0 && bc) strokePath(boxPath(cs, w, h, k, bw / 2), x, y, bc, bw, op)
    else if (!uniform) {
      const [t, rt, b, l] = sides as [{ w: number; c: RGBA | null }, { w: number; c: RGBA | null }, { w: number; c: RGBA | null }, { w: number; c: RGBA | null }]
      if (t.w && t.c) fillPath(`M0 0H${w}V${t.w}H0Z`, x, y, t.c, op)
      if (b.w && b.c) fillPath(`M0 ${h - b.w}H${w}V${h}H0Z`, x, y, b.c, op)
      if (l.w && l.c) fillPath(`M0 0H${l.w}V${h}H0Z`, x, y, l.c, op)
      if (rt.w && rt.c) fillPath(`M${w - rt.w} 0H${w}V${h}H${w - rt.w}Z`, x, y, rt.c, op)
    }
    await drawPseudo(el, '::after', x, y, w, h, k, op)
    if (own && el !== root) popClip()
  }

  // 쪽 밖은 PDF 가 알아서 잘라요(화면 = 쪽)
  await walk(root, 1)
  const bytes = await pdf.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
