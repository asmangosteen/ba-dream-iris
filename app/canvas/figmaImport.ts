import type { AutoLayout, Constraints, Effect, GradStop, LayerDoc, LayerNode, LayerStyle, Paint, Sizing } from './schema'
import { SCHEMA_VERSION } from './schema'
import type { TextSpan, RunStyle } from './textRuns'
import { normalize, parsePathD } from './vector'

/**
 * 피그마 프레임(REST /files/:key/nodes?geometry=paths 의 document) → Iris 화면 레이어(LayerDoc) — 4단계 '편집 가능한 레이어로 가져오기'(PRD/13 · 17 5장 결정 6).
 * 프레임 · 그룹 · 오토 레이아웃 · 사각형 · 원(호) · 선 · 글자(구간 서식) · 벡터(다각형 · 별 · 불리언 포함, 모양 그대로) · 칠(단색 · 그라디언트 · 이미지) · 선 · 효과 · 마스크를 옮겨요.
 * 인스턴스는 떼어 낸 프레임으로(디자인 시스템 컴포넌트 연결은 나중), 글꼴은 Iris 글꼴(Pretendard)로 그려요.
 * 좌표: 피그마는 화면 전체 기준(absoluteBoundingBox · 회전 전 크기 size), Iris 는 부모 기준 — 회전한 노드도 가운데를 맞춰 옮겨요
 */

export interface FigmaColor { r: number; g: number; b: number; a: number }
export interface FigmaPaint {
  type: string; visible?: boolean; opacity?: number; color?: FigmaColor; blendMode?: string
  gradientHandlePositions?: { x: number; y: number }[]; gradientStops?: { position: number; color: FigmaColor }[]
  scaleMode?: string; imageRef?: string; scalingFactor?: number; rotation?: number
}
interface FigmaEffect { type: string; visible?: boolean; radius?: number; color?: FigmaColor; offset?: { x: number; y: number }; spread?: number }
interface FigmaTypeStyle {
  fontWeight?: number; fontSize?: number; textAlignHorizontal?: string; textAlignVertical?: string; letterSpacing?: number
  lineHeightPx?: number; lineHeightPercentFontSize?: number; lineHeightUnit?: string; textCase?: string; textDecoration?: string; textAutoResize?: string
  fills?: FigmaPaint[]; paragraphSpacing?: number
}
export interface FigmaFullNode {
  id: string; name: string; type: string; visible?: boolean
  children?: FigmaFullNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null
  size?: { x: number; y: number }
  relativeTransform?: [[number, number, number], [number, number, number]]
  fills?: FigmaPaint[]; strokes?: FigmaPaint[]; strokeWeight?: number; strokeAlign?: string; strokeDashes?: number[]; strokeCap?: string; strokeJoin?: string
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number }
  cornerRadius?: number; rectangleCornerRadii?: [number, number, number, number]; cornerSmoothing?: number
  effects?: FigmaEffect[]; opacity?: number; blendMode?: string; isMask?: boolean; clipsContent?: boolean
  layoutMode?: string; layoutWrap?: string; itemSpacing?: number; counterAxisSpacing?: number
  paddingLeft?: number; paddingRight?: number; paddingTop?: number; paddingBottom?: number
  primaryAxisAlignItems?: string; counterAxisAlignItems?: string
  layoutSizingHorizontal?: string; layoutSizingVertical?: string; layoutPositioning?: string
  constraints?: { vertical: string; horizontal: string }
  fillGeometry?: { path: string; windingRule?: string }[]; strokeGeometry?: { path: string; windingRule?: string }[]
  characters?: string; style?: FigmaTypeStyle; characterStyleOverrides?: number[]; styleOverrideTable?: Record<string, FigmaTypeStyle>
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number }
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0').toUpperCase()
/** 피그마 색(0~1) × 칠 투명도 → '#RRGGBB'(+AA) */
export function figmaColor(c: FigmaColor | undefined, opacity = 1): string {
  if (!c) return '#000000'
  const a = (c.a ?? 1) * opacity
  return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b) + (a < 0.999 ? hex2(a) : '')
}
const r2 = (v: number) => Math.round(v * 100) / 100
const visibleList = <T extends { visible?: boolean }>(xs: T[] | undefined) => (xs ?? []).filter((x) => x.visible !== false)
const BLEND: Record<string, string> = { MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay', DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light', DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity' }

/** 칠 하나 → Iris 칠(못 옮기면 null) */
function paintOf(p: FigmaPaint, img: (ref: string) => string | undefined): Paint | null {
  const opacity = p.opacity !== undefined && p.opacity < 1 ? r2(p.opacity) : undefined
  if (p.type === 'SOLID') return { type: 'solid', color: figmaColor(p.color), ...(opacity !== undefined ? { opacity } : {}) }
  if (p.type.startsWith('GRADIENT_')) {
    const stops: GradStop[] = (p.gradientStops ?? []).map((s) => ({ pos: r2(s.position), color: figmaColor(s.color) }))
    const h = p.gradientHandlePositions ?? []
    const from: [number, number] | undefined = h[0] ? [r2(h[0].x), r2(h[0].y)] : undefined
    const to: [number, number] | undefined = h[1] ? [r2(h[1].x), r2(h[1].y)] : undefined
    const type = p.type === 'GRADIENT_LINEAR' ? 'linear' : p.type === 'GRADIENT_ANGULAR' ? 'angular' : 'radial'
    return { type, stops, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(opacity !== undefined ? { opacity } : {}) }
  }
  if (p.type === 'IMAGE' && p.imageRef) {
    const src = img(p.imageRef)
    if (!src) return null
    const fit = p.scaleMode === 'FIT' ? 'fit' : p.scaleMode === 'TILE' ? 'tile' : p.scaleMode === 'CROP' || p.scaleMode === 'STRETCH' ? 'crop' : 'fill'
    return { type: 'image', src, fit: fit === 'crop' ? 'fill' : fit, ...(p.scalingFactor ? { scale: r2(p.scalingFactor) } : {}), ...(opacity !== undefined ? { opacity } : {}) }
  }
  return null
}
/** 칠 목록 → style.fill(단색 하나면) 또는 style.fills(여럿 · 그라디언트 · 이미지) */
function fillsInto(style: LayerStyle, list: FigmaPaint[] | undefined, img: (ref: string) => string | undefined, key: 'fill' | 'stroke') {
  const ps = visibleList(list).map((p) => paintOf(p, img)).filter((x): x is Paint => !!x)
  if (!ps.length) return
  const only = ps.length === 1 ? ps[0]! : null
  if (only?.type === 'solid') style[key] = only.opacity !== undefined ? figmaColor(hexToFigma(only.color), only.opacity) : only.color
  else if (key === 'fill') style.fills = ps
  else style.strokes = ps
}
const hexToFigma = (h: string): FigmaColor => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255, a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 })

function effectsOf(list: FigmaEffect[] | undefined): Effect[] | undefined {
  const out: Effect[] = []
  for (const e of visibleList(list)) {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') out.push({ type: e.type === 'DROP_SHADOW' ? 'drop' : 'inner', x: r2(e.offset?.x ?? 0), y: r2(e.offset?.y ?? 0), blur: r2(e.radius ?? 0), ...(e.spread ? { spread: r2(e.spread) } : {}), color: figmaColor(e.color) })
    else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') out.push({ type: e.type === 'LAYER_BLUR' ? 'blur' : 'bgblur', blur: r2(e.radius ?? 0) })
  }
  return out.length ? out : undefined
}

/** 선 · 모서리 · 효과 · 투명도 · 혼합 — 모든 종류 공통 */
function baseStyle(n: FigmaFullNode, img: (ref: string) => string | undefined, withFill = true): LayerStyle {
  const s: LayerStyle = {}
  if (withFill) fillsInto(s, n.fills, img, 'fill')
  if (visibleList(n.strokes).length && (n.strokeWeight ?? 0) > 0) {
    fillsInto(s, n.strokes, img, 'stroke')
    s.strokeWidth = r2(n.strokeWeight ?? 1)
    s.strokeAlign = n.strokeAlign === 'CENTER' ? 'center' : n.strokeAlign === 'OUTSIDE' ? 'outside' : 'inside'
    if (n.strokeDashes?.length) s.dash = [r2(n.strokeDashes[0]!), r2(n.strokeDashes[1] ?? n.strokeDashes[0]!)]
    if (n.strokeCap === 'ROUND' || n.strokeCap === 'SQUARE') s.cap = n.strokeCap === 'ROUND' ? 'round' : 'square'
    if (n.strokeJoin === 'ROUND' || n.strokeJoin === 'BEVEL') s.join = n.strokeJoin === 'ROUND' ? 'round' : 'bevel'
    const w = n.individualStrokeWeights
    if (w && !(w.top === w.right && w.right === w.bottom && w.bottom === w.left)) s.strokeSides = [w.top, w.right, w.bottom, w.left]
  }
  const rr = n.rectangleCornerRadii
  if (rr && !(rr[0] === rr[1] && rr[1] === rr[2] && rr[2] === rr[3])) s.radii = [r2(rr[0]), r2(rr[1]), r2(rr[2]), r2(rr[3])]
  else if (n.cornerRadius) s.radius = r2(n.cornerRadius)
  if (n.cornerSmoothing) s.smoothing = r2(n.cornerSmoothing)
  const fx = effectsOf(n.effects)
  if (fx) s.effects = fx
  if (n.opacity !== undefined && n.opacity < 1) s.opacity = r2(n.opacity)
  if (n.blendMode && BLEND[n.blendMode]) s.blend = BLEND[n.blendMode]
  return s
}

const ALIGN: Record<string, 'start' | 'center' | 'end'> = { MIN: 'start', CENTER: 'center', MAX: 'end', BASELINE: 'start', SPACE_BETWEEN: 'start' }
function layoutOf(n: FigmaFullNode): AutoLayout | undefined {
  if (n.layoutMode !== 'HORIZONTAL' && n.layoutMode !== 'VERTICAL') return undefined
  return {
    mode: n.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical',
    ...(n.layoutWrap === 'WRAP' ? { wrap: true, rowGap: r2(n.counterAxisSpacing ?? n.itemSpacing ?? 0) } : {}),
    gap: n.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 'auto' : r2(n.itemSpacing ?? 0),
    padding: [r2(n.paddingTop ?? 0), r2(n.paddingRight ?? 0), r2(n.paddingBottom ?? 0), r2(n.paddingLeft ?? 0)],
    align: ALIGN[n.primaryAxisAlignItems ?? 'MIN'] ?? 'start',
    cross: ALIGN[n.counterAxisAlignItems ?? 'MIN'] ?? 'start',
  }
}
const SIZING: Record<string, Sizing> = { FIXED: 'fixed', HUG: 'hug', FILL: 'fill' }
const CH: Record<string, Constraints['h']> = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', LEFT_RIGHT: 'leftright', SCALE: 'scale' }
const CV: Record<string, Constraints['v']> = { TOP: 'top', BOTTOM: 'bottom', CENTER: 'center', TOP_BOTTOM: 'topbottom', SCALE: 'scale' }

/** 회전 전 크기 · 가운데(화면 기준) · 회전(도, 시계 방향) */
function geom(n: FigmaFullNode) {
  const b = n.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 }
  const w = n.size?.x ?? b.width, h = n.size?.y ?? b.height
  const t = n.relativeTransform
  // 피그마 회전은 반시계가 +, Iris 는 시계 방향이 + → 행렬에서 각도를 읽어 부호를 바꿔요
  const rot = t ? -Math.atan2(t[1][0], t[0][0]) * (180 / Math.PI) : 0
  return { w, h, cx: b.x + b.width / 2, cy: b.y + b.height / 2, rot: Math.abs(rot) < 0.01 ? 0 : r2(-rot) }
}

/** 글자 → 레이어 글자 서식 */
function textStyleInto(s: LayerStyle, st: FigmaTypeStyle | undefined) {
  if (!st) return
  if (st.fontSize) s.fontSize = r2(st.fontSize)
  if (st.fontWeight) s.fontWeight = st.fontWeight
  if (st.letterSpacing) s.letterSpacing = r2(st.letterSpacing)
  if (st.lineHeightUnit === 'FONT_SIZE_%' && st.lineHeightPercentFontSize) { s.lineHeight = r2(st.lineHeightPercentFontSize); s.lineHeightUnit = 'percent' }
  else if (st.lineHeightUnit !== 'INTRINSIC_%' && st.lineHeightPx) s.lineHeight = r2(st.lineHeightPx)
  if (st.textAlignHorizontal) s.align = st.textAlignHorizontal === 'CENTER' ? 'center' : st.textAlignHorizontal === 'RIGHT' ? 'right' : st.textAlignHorizontal === 'JUSTIFIED' ? 'justify' : 'left'
  if (st.textAlignVertical === 'CENTER') s.valign = 'middle'
  else if (st.textAlignVertical === 'BOTTOM') s.valign = 'bottom'
  if (st.textCase === 'UPPER' || st.textCase === 'LOWER' || st.textCase === 'TITLE') s.textCase = st.textCase.toLowerCase() as 'upper' | 'lower' | 'title'
  if (st.textDecoration === 'UNDERLINE') s.decoration = 'underline'
  else if (st.textDecoration === 'STRIKETHROUGH') s.decoration = 'strike'
  if (st.paragraphSpacing) s.paraSpacing = r2(st.paragraphSpacing)
}
/** 글자 구간 서식(characterStyleOverrides) → spans */
function spansOf(n: FigmaFullNode, base: LayerStyle): TextSpan[] | undefined {
  const ov = n.characterStyleOverrides, table = n.styleOverrideTable
  if (!ov?.length || !table) return undefined
  const out: TextSpan[] = []
  let i = 0
  while (i < ov.length) {
    const id = ov[i]!
    let j = i + 1
    while (j < ov.length && ov[j] === id) j++
    const t = id ? table[String(id)] : undefined
    if (t) {
      const s: LayerStyle = {}
      textStyleInto(s, t)
      const fill = visibleList(t.fills).find((p) => p.type === 'SOLID')
      if (fill) s.color = figmaColor(fill.color, fill.opacity ?? 1)
      const run: RunStyle = {}
      if (s.color && s.color !== base.color) run.color = s.color
      if (s.fontWeight && s.fontWeight !== base.fontWeight) run.fontWeight = s.fontWeight
      if (s.fontSize && s.fontSize !== base.fontSize) run.fontSize = s.fontSize
      if (s.lineHeight !== undefined && s.lineHeight !== base.lineHeight) { run.lineHeight = s.lineHeight; if (s.lineHeightUnit) run.lineHeightUnit = s.lineHeightUnit }
      if (s.letterSpacing !== undefined && s.letterSpacing !== base.letterSpacing) run.letterSpacing = s.letterSpacing
      if (s.decoration && s.decoration !== base.decoration) run.decoration = s.decoration
      if (Object.keys(run).length) out.push({ s: i, e: j, style: run })
    }
    i = j
  }
  return out.length ? out : undefined
}

const CONTAINER = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'])
const VECTORISH = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'REGULAR_POLYGON'])

export interface FigmaConvertResult { doc: LayerDoc; skipped: number; layers: number }

/**
 * 맨 바깥 프레임(화면) → LayerDoc. 화면 자체 모양(칠 · 모서리 · 자르기 · 선)은 doc.frame 에, 안의 노드는 부모 기준 좌표로.
 * img: 피그마 이미지 ref → 넣을 주소(Iris 저장소로 옮긴 것). 없으면 그 이미지 칠은 빠져요
 */
export function figmaToLayers(root: FigmaFullNode, img: (ref: string) => string | undefined = () => undefined): FigmaConvertResult {
  const doc: LayerDoc = { rootIds: [], nodes: {}, schemaVersion: SCHEMA_VERSION }
  let skipped = 0
  const used = new Set<string>()
  const idOf = (fid: string) => {
    const base = 'fg_' + fid.replace(/[^\w]/g, '_')
    let id = base, k = 1
    while (used.has(id)) id = base + '_' + k++
    used.add(id)
    return id
  }
  // 화면 모양
  const frame: LayerStyle = baseStyle(root, img)
  if (!frame.fill && !frame.fills) frame.fill = '#FFFFFF00'
  frame.clip = root.clipsContent !== false
  const rl = layoutOf(root)
  if (rl) frame.layout = rl
  doc.frame = frame
  const rootG = geom(root)
  const rootOrigin = { x: rootG.cx - rootG.w / 2, y: rootG.cy - rootG.h / 2 }

  const walk = (n: FigmaFullNode, parentId: string | null, origin: { x: number; y: number }, parentAuto: boolean): string | null => {
    const g = geom(n)
    const x = r2(g.cx - g.w / 2 - origin.x), y = r2(g.cy - g.h / 2 - origin.y)
    const id = idOf(n.id)
    const common: Omit<LayerNode, 'type' | 'style'> = { id, name: n.name, parentId, x, y, w: r2(g.w), h: r2(g.h) }
    if (g.rot) common.rotation = g.rot
    if (n.visible === false) common.hidden = true
    if (n.isMask) common.isMask = true
    if (parentAuto) {
      const sh = SIZING[n.layoutSizingHorizontal ?? ''], sv = SIZING[n.layoutSizingVertical ?? '']
      if (sh && sh !== 'fixed') common.sizeH = sh
      if (sv && sv !== 'fixed') common.sizeV = sv
      if (n.layoutPositioning === 'ABSOLUTE') common.absolute = true
    }
    if (n.constraints && !parentAuto) {
      const c: Constraints = { h: CH[n.constraints.horizontal] ?? 'left', v: CV[n.constraints.vertical] ?? 'top' }
      if (c.h !== 'left' || c.v !== 'top') common.constraints = c
    }
    let node: LayerNode | null = null
    if (CONTAINER.has(n.type)) {
      const style = baseStyle(n, img)
      if (n.type !== 'GROUP') style.clip = n.clipsContent === true
      const lay = layoutOf(n)
      if (lay) style.layout = lay
      node = { ...common, type: n.type === 'SECTION' ? 'section' : 'frame', style, children: [] }
      if (n.type === 'GROUP') node.group = true
      const myOrigin = { x: g.cx - g.w / 2, y: g.cy - g.h / 2 }
      doc.nodes[id] = node
      for (const c of n.children ?? []) {
        const cid = walk(c, id, myOrigin, !!lay)
        if (cid) node.children!.push(cid)
      }
      return id
    }
    if (n.type === 'RECTANGLE') node = { ...common, type: 'rect', style: baseStyle(n, img) }
    else if (n.type === 'ELLIPSE') {
      const style = baseStyle(n, img)
      const a = n.arcData
      if (a && (Math.abs(a.endingAngle - a.startingAngle - Math.PI * 2) > 0.001 || a.innerRadius > 0)) {
        style.arcStart = r2((a.startingAngle * 180) / Math.PI)
        style.arcSweep = r2(((a.endingAngle - a.startingAngle) * 180) / Math.PI)
        if (a.innerRadius) style.arcInner = r2(a.innerRadius)
      }
      node = { ...common, type: 'ellipse', style }
    } else if (n.type === 'LINE') {
      node = { ...common, h: 0, type: 'line', pts: [0, 0, 1, 0], style: baseStyle(n, img, false) }
    } else if (n.type === 'TEXT') {
      const style = baseStyle(n, img, false)
      textStyleInto(style, n.style)
      const fill = visibleList(n.fills).find((p) => p.type === 'SOLID')
      style.color = fill ? figmaColor(fill.color, fill.opacity ?? 1) : '#000000'
      const ar = n.style?.textAutoResize
      if (ar === 'WIDTH_AND_HEIGHT') style.autoWidth = true
      if (ar === 'TRUNCATE') style.truncate = true
      node = { ...common, type: 'text', text: n.characters ?? '', style }
      if (ar === 'WIDTH_AND_HEIGHT' && !node.sizeH) node.sizeH = 'hug'
      if ((ar === 'WIDTH_AND_HEIGHT' || ar === 'HEIGHT') && !node.sizeV) node.sizeV = 'hug'
      const sp = spansOf(n, style)
      if (sp) node.spans = sp
    } else if (VECTORISH.has(n.type)) {
      // 모양 그대로: 칠 모양(fillGeometry), 칠이 없으면 선 모양(strokeGeometry)을 칠로
      const hasFill = visibleList(n.fills).length > 0
      const geo = hasFill ? n.fillGeometry : n.strokeGeometry
      const paths = (geo ?? []).flatMap((p) => parsePathD(p.path))
      if (paths.length) {
        const nb = normalize(paths)
        const style = hasFill ? baseStyle(n, img) : baseStyle(n, img, false)
        if (!hasFill) {
          // 선을 모양으로 바꿨으니 선 색이 칠이에요
          fillsInto(style, n.strokes, img, 'fill')
          delete style.stroke; delete style.strokes; delete style.strokeWidth; delete style.strokeAlign; delete style.dash; delete style.cap; delete style.join
        }
        node = { ...common, x: r2(x + nb.x), y: r2(y + nb.y), w: r2(Math.max(nb.w, 0.01)), h: r2(Math.max(nb.h, 0.01)), type: 'vector', vnet: nb.vnet, style }
        if ((geo ?? []).some((p) => p.windingRule === 'EVENODD')) node.evenodd = true
      }
    }
    if (!node) { skipped++; used.delete(id); return null }
    doc.nodes[id] = node
    return id
  }
  for (const c of root.children ?? []) {
    const cid = walk(c, null, rootOrigin, !!rl)
    if (cid) doc.rootIds.push(cid)
  }
  return { doc, skipped, layers: Object.keys(doc.nodes).length }
}

/** 이 프레임이 쓰는 이미지 ref 들(칠 · 글자 구간 칠) */
export function figmaImageRefs(root: FigmaFullNode): string[] {
  const out = new Set<string>()
  const walk = (n: FigmaFullNode) => {
    for (const p of [...(n.fills ?? []), ...(n.strokes ?? [])]) if (p.type === 'IMAGE' && p.imageRef && p.visible !== false) out.add(p.imageRef)
    n.children?.forEach(walk)
  }
  walk(root)
  return [...out]
}
