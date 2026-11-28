import type { Effect, ImageFit, LayerStyle, LayerType, Paint, VPath } from './schema'
/** 별 안쪽 반지름 기본 비율 — 피그마 기본값 38.2% */
export const STAR_INNER = 0.382

/**
 * 칠 · 선 · 효과 → CSS / SVG (v5). 캔버스(LayerView) · 썸네일 · 화면 모양이 함께 씁니다.
 * color: 옛 'token:<이름>' 값을 실제 색으로 풀기, img: 'storage://' 이미지 주소 풀기
 */
export type ColorFn = (v?: string) => string | undefined
export type ImgFn = (src?: string) => string | undefined

const on = <T extends { visible?: boolean }>(x: T) => x.visible !== false

/** 색에 투명도 곱하기 */
export function alpha(c: string, a = 1): string {
  if (a >= 1) return c
  return `color-mix(in srgb, ${c} ${Math.round(Math.max(0, a) * 1000) / 10}%, transparent)`
}

/** 칠 하나 → background 한 겹 */
/** box: 칠하는 상자 크기(px) — 있으면 Crop 자리를 px 로 정확히(이미지 폭이 상자 폭과 같을 때도 — % 로는 위치를 못 나타내요) */
export function paintLayer(p: Paint, color: ColorFn, img: ImgFn, box?: { w: number; h: number }): { image: string; size: string; position: string; repeat: string } | null {
  if (p.type === 'solid') {
    const c = alpha(color(p.color) ?? p.color, p.opacity)
    return { image: `linear-gradient(${c}, ${c})`, size: 'auto', position: '0 0', repeat: 'no-repeat' }
  }
  if (p.type === 'linear' || p.type === 'radial' || p.type === 'angular') return { image: gradientCss(p, color, box), size: 'auto', position: '0 0', repeat: 'no-repeat' }
  if (p.type !== 'image') return null
  const url = img(p.src)
  if (!url) return null
  const fit = p.fit ?? 'fill'
  const image = `url("${url}")`
  // Crop: 레이어 상자 기준 이미지 자리(비율). background-position % 는 '남는 폭 × %' 라 x / (1 − w) 로 바꿔요
  if (fit === 'crop' && p.crop) {
    const { x, y, w, h } = p.crop
    if (box) return { image, size: `${r4(w * box.w)}px ${r4(h * box.h)}px`, position: `${r4(x * box.w)}px ${r4(y * box.h)}px`, repeat: 'no-repeat' }
    const pos = (o: number, size: number) => (Math.abs(1 - size) < 1e-6 ? 0 : (o / (1 - size)) * 100)
    return { image, size: `${r4(w * 100)}% ${r4(h * 100)}%`, position: `${r4(pos(x, w))}% ${r4(pos(y, h))}%`, repeat: 'no-repeat' }
  }
  // Tile: 원래 크기 × 배율(피그마 Tile %), 왼쪽 위부터
  if (fit === 'tile') return { image, size: p.iw && p.ih ? `${r4(p.iw * (p.scale ?? 1))}px ${r4(p.ih * (p.scale ?? 1))}px` : 'auto', position: '0 0', repeat: 'repeat' }
  return { image, size: fit === 'fit' ? 'contain' : 'cover', position: 'center', repeat: 'no-repeat' }
}
const r4 = (v: number) => Math.round(v * 10000) / 10000
type Grad = Extract<Paint, { type: 'linear' | 'radial' | 'angular' }>
/**
 * 그라디언트 점(레이어 상자 기준 0~1). 저장된 점이 없으면 예전 각도(angle)로 — 선형은 각도 방향으로 상자를 가로지르고(위 → 아래가 180°),
 * 원형은 가운데 → 아래 가장자리, 각도형은 가운데 → 각도 방향
 */
export function gradHandles(p: Grad): { from: [number, number]; to: [number, number] } {
  if (p.from && p.to) return { from: p.from, to: p.to }
  const a = ((p.angle ?? (p.type === 'linear' ? 180 : 0)) * Math.PI) / 180
  const ux = Math.sin(a), uy = -Math.cos(a)
  if (p.type === 'linear') return { from: [0.5 - ux / 2, 0.5 - uy / 2], to: [0.5 + ux / 2, 0.5 + uy / 2] }
  if (p.type === 'radial') return { from: [0.5, 0.5], to: [0.5, 1] }
  return { from: [0.5, 0.5], to: [0.5 + ux / 2, 0.5 + uy / 2] }
}
/** 그라디언트 → CSS(box: 상자 px — 선형 점 자리를 정확히 옮기려고. 없으면 정사각형으로 봐요) */
export function gradientCss(p: Grad, color: ColorFn, box?: { w: number; h: number }): string {
  const sorted = [...p.stops].sort((a, b) => a.pos - b.pos)
  const w = box?.w || 1, h = box?.h || 1
  const { from, to } = gradHandles(p)
  const col = (c: string) => alpha(color(c) ?? c, p.opacity)
  if (p.type === 'linear') {
    const dx = (to[0] - from[0]) * w, dy = (to[1] - from[1]) * h
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const deg = (Math.atan2(ux, -uy) * 180) / Math.PI
    // CSS 선형 그라디언트 선: 상자 가운데를 지나고 길이 = |w·sinθ| + |h·cosθ| → 점을 그 선 위 비율로
    const L = Math.abs(w * ux) + Math.abs(h * uy) || 1
    const t = (pt: [number, number]) => (((pt[0] - 0.5) * w * ux + (pt[1] - 0.5) * h * uy) / L) + 0.5
    const t0 = t(from), t1 = t(to)
    const stops = sorted.map((s) => `${col(s.color)} ${r4((t0 + s.pos * (t1 - t0)) * 100)}%`).join(', ')
    return `linear-gradient(${r4(deg)}deg, ${stops})`
  }
  const stops = sorted.map((s) => `${col(s.color)} ${r4(s.pos * 100)}%`).join(', ')
  const at = `at ${r4(from[0] * 100)}% ${r4(from[1] * 100)}%`
  if (p.type === 'radial') {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1])
    return `radial-gradient(${r4(d * 100)}% ${r4(d * 100)}% ${at}, ${stops})`
  }
  const deg = (Math.atan2((to[0] - from[0]) * w, -(to[1] - from[1]) * h) * 180) / Math.PI
  return `conic-gradient(from ${r4(deg)}deg ${at}, ${stops})`
}
/**
 * 선(Stroke)의 그라디언트 · 이미지 칠 → SVG 정의(그 레이어 SVG 안 <defs>). objectBoundingBox 라 상자 비율 그대로(피그마와 같아요).
 * 각도형(angular)은 SVG 에 없어서 첫 색으로 그려요
 */
export type SvgPaintDef =
  | { kind: 'linear'; id: string; x1: number; y1: number; x2: number; y2: number; stops: { offset: number; color: string; opacity: number }[] }
  | { kind: 'radial'; id: string; cx: number; cy: number; r: number; stops: { offset: number; color: string; opacity: number }[] }
  | { kind: 'image'; id: string; href: string; opacity: number; fit: ImageFit; paint: Extract<Paint, { type: 'image' }> }
export function svgPaint(p: Paint, id: string, color: ColorFn, img: ImgFn): { ref: string; def: SvgPaintDef | null } | null {
  if (p.type === 'solid') return { ref: alpha(color(p.color) ?? p.color, p.opacity), def: null }
  if (p.type === 'image') {
    const href = img(p.src)
    return href ? { ref: `url(#${id})`, def: { kind: 'image', id, href, opacity: p.opacity ?? 1, fit: p.fit ?? 'fill', paint: p } } : null
  }
  const stops = [...p.stops].sort((a, b) => a.pos - b.pos).map((s) => ({ offset: s.pos, color: color(s.color) ?? s.color, opacity: p.opacity ?? 1 }))
  if (p.type === 'angular') return { ref: alpha(stops[0]?.color ?? '#000000', p.opacity), def: null }
  const { from, to } = gradHandles(p)
  if (p.type === 'linear') return { ref: `url(#${id})`, def: { kind: 'linear', id, x1: from[0], y1: from[1], x2: to[0], y2: to[1], stops } }
  return { ref: `url(#${id})`, def: { kind: 'radial', id, cx: from[0], cy: from[1], r: Math.hypot(to[0] - from[0], to[1] - from[1]), stops } }
}
/** 선 칠 전부(맨 아래부터): 단색은 색, 그라디언트 · 이미지는 url(#…) — defs 는 그 레이어 SVG 에 넣어요 */
export function strokePaints(s: LayerStyle, color: ColorFn, img: ImgFn, idOf: (i: number) => string): { refs: string[]; defs: SvgPaintDef[] } {
  const refs: string[] = [], defs: SvgPaintDef[] = []
  if (!s.strokeWidth) return { refs, defs }
  if (s.stroke) refs.push(color(s.stroke) ?? s.stroke)
  ;(s.strokes ?? []).forEach((p, i) => {
    if (!on(p)) return
    const r = svgPaint(p, idOf(i), color, img)
    if (!r) return
    refs.push(r.ref)
    if (r.def) defs.push(r.def)
  })
  return { refs, defs }
}
/** 선에 그라디언트 · 이미지 칠이 있나(상자 도형은 그땐 SVG 로 그려요) */
export const hasFancyStroke = (s: LayerStyle) => !!s.strokeWidth && (s.strokes ?? []).some((p) => on(p) && p.type !== 'solid')

/** 이미지 칠의 '덮기(Fill)' 자리 = 자르기 시작점(이미지 원래 비율 ar = 폭 / 높이, 레이어 비율 nr) */
export function coverCrop(ar: number, nr: number): { x: number; y: number; w: number; h: number } {
  if (!(ar > 0) || !(nr > 0)) return { x: 0, y: 0, w: 1, h: 1 }
  if (ar > nr) { const w = ar / nr; return { x: (1 - w) / 2, y: 0, w, h: 1 } }
  const h = nr / ar
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}
/**
 * 이미지 칠이 상자(W × H) 안에서 놓이는 자리(px) — 채우기 배경(paintLayer)과 같은 규칙. 선(Stroke) 이미지를 SVG 로 그릴 때 써요.
 * Fill = 덮기, Fit = 다 보이게, Crop = 자른 자리(+ 돌리기), Tile = 원래 크기 × 배율로 반복. 원래 크기를 모르면 null(상자에 맞춰 그려요)
 */
export function imagePlace(p: Extract<Paint, { type: 'image' }>, W: number, H: number): { x: number; y: number; w: number; h: number; rot: number; tile: boolean } | null {
  const fit = p.fit ?? 'fill'
  if (fit === 'crop' && p.crop) return { x: p.crop.x * W, y: p.crop.y * H, w: p.crop.w * W, h: p.crop.h * H, rot: p.rotation ?? 0, tile: false }
  if (!p.iw || !p.ih || !(W > 0) || !(H > 0)) return null
  if (fit === 'tile') { const k = p.scale ?? 1; return { x: 0, y: 0, w: p.iw * k, h: p.ih * k, rot: 0, tile: true } }
  const ar = p.iw / p.ih, nr = W / H
  if (fit === 'fit') {
    if (ar > nr) { const h = W / ar; return { x: 0, y: (H - h) / 2, w: W, h, rot: 0, tile: false } }
    const w = H * ar
    return { x: (W - w) / 2, y: 0, w, h: H, rot: 0, tile: false }
  }
  const c = coverCrop(ar, nr)
  return { x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H, rot: 0, tile: false }
}
/** 선이 상자 밖으로 나가는 두께(px): 바깥 = 두께, 가운데 = 절반, 안쪽 = 0 — 선 그라디언트 · 이미지는 이 넓힌 상자 기준이에요 */
export function strokePad(s: LayerStyle, type: LayerType): number {
  const w = Math.max(s.strokeWidth ?? 0, ...(s.strokeSides ?? []))
  const align = s.strokeAlign ?? defaultAlign(type)
  return align === 'outside' ? w : align === 'center' ? w / 2 : 0
}
/** 맨 위(보이는) 이미지 칠 — 이미지 편집 · 레이어 아이콘 · 바꾸기에 써요 */
export function topImagePaint(s: LayerStyle): { i: number; p: Extract<Paint, { type: 'image' }> } | null {
  const l = s.fills ?? []
  for (let i = l.length - 1; i >= 0; i--) { const p = l[i]!; if (p.type === 'image' && p.visible !== false) return { i, p } }
  return null
}

/** 채우기: fill(바탕) + fills(위로 쌓기, 마지막이 맨 위) */
/** 돌린 Crop 이미지 칠(배경으로 못 그려서 따로 그려요) */
export const rotatedImage = (p: Paint): p is Extract<Paint, { type: 'image' }> => p.type === 'image' && p.fit === 'crop' && !!p.crop && !!p.rotation
export function backgroundCss(s: LayerStyle, color: ColorFn, img: ImgFn, box?: { w: number; h: number }): Record<string, string> {
  const css: Record<string, string> = {}
  if (s.fill) css.backgroundColor = color(s.fill) ?? s.fill
  const layers = (s.fills ?? []).filter(on).filter((p) => !(box && rotatedImage(p))).map((p) => paintLayer(p, color, img, box)).filter((x): x is NonNullable<typeof x> => !!x).reverse()
  if (layers.length) {
    css.backgroundImage = layers.map((l) => l.image).join(', ')
    css.backgroundSize = layers.map((l) => l.size).join(', ')
    css.backgroundPosition = layers.map((l) => l.position).join(', ')
    css.backgroundRepeat = layers.map((l) => l.repeat).join(', ')
  }
  return css
}

/** 칠이 하나라도 있나 */
export const hasFill = (s: LayerStyle) => !!s.fill || (s.fills ?? []).some(on)
/** 바깥 그림자를 상자 대신 내용 모양대로 그릴 레이어: 그룹 · 칠 없는 프레임(피그마와 같아요) */
export const shadowByShape = (n: { group?: boolean; style: LayerStyle }) => !!n.group || !hasFill(n.style)

/** 선 색들(맨 위가 먼저). 이미지 · 그라디언트 선은 첫 색으로 */
export function strokeColors(s: LayerStyle, color: ColorFn): string[] {
  if (!s.strokeWidth) return []
  // 화면(맨 위 프레임) 선 등 box-shadow 로 그리는 곳: 그라디언트는 첫 색으로(레이어는 strokePaints 로 SVG 에서 제대로 그려요)
  const extra = (s.strokes ?? []).filter(on).map((p) => (p.type === 'solid' ? alpha(color(p.color) ?? p.color, p.opacity) : p.type === 'image' ? '' : color(p.stops[0]?.color) ?? '')).filter(Boolean).reverse()
  return [...extra, ...(s.stroke ? [color(s.stroke) ?? s.stroke] : [])]
}

export const defaultAlign = (t: LayerType): 'inside' | 'center' => (t === 'line' || t === 'path' ? 'center' : 'inside')
/** 기본 이음새: 연필은 둥글게, 나머지는 각지게(피그마 Miter) */
export const defaultJoin = (t: LayerType): 'miter' | 'round' => (t === 'path' ? 'round' : 'miter')

/** 상자 도형의 선(실선) → box-shadow. outer 는 상자 바깥(그림자와 함께), inner 는 내용 위 덮개에 */
export function strokeShadows(s: LayerStyle, t: LayerType, color: ColorFn): { outer: string[]; inner: string[] } {
  const out = { outer: [] as string[], inner: [] as string[] }
  const w = s.strokeWidth ?? 0
  if (!w || s.dash) return out
  const align = s.strokeAlign ?? defaultAlign(t)
  const sides = s.strokeSides
  for (const c of strokeColors(s, color)) {
    if (sides) {
      // 변마다: 그 변 쪽으로만 밀린 그림자 — 안쪽(inset) · 바깥 · 가운데(반씩)
      const [top, right, bottom, left] = sides
      const k = align === 'center' ? 0.5 : 1
      if (align !== 'outside') {
        if (top) out.inner.push(`inset 0 ${top * k}px 0 0 ${c}`)
        if (bottom) out.inner.push(`inset 0 ${-bottom * k}px 0 0 ${c}`)
        if (left) out.inner.push(`inset ${left * k}px 0 0 0 ${c}`)
        if (right) out.inner.push(`inset ${-right * k}px 0 0 0 ${c}`)
      }
      if (align !== 'inside') {
        if (top) out.outer.push(`0 ${-top * k}px 0 0 ${c}`)
        if (bottom) out.outer.push(`0 ${bottom * k}px 0 0 ${c}`)
        if (left) out.outer.push(`${-left * k}px 0 0 0 ${c}`)
        if (right) out.outer.push(`${right * k}px 0 0 0 ${c}`)
      }
      continue
    }
    if (align === 'inside') out.inner.push(`inset 0 0 0 ${w}px ${c}`)
    else if (align === 'outside') out.outer.push(`0 0 0 ${w}px ${c}`)
    else { out.inner.push(`inset 0 0 0 ${w / 2}px ${c}`); out.outer.push(`0 0 0 ${w / 2}px ${c}`) }
  }
  return out
}

/**
 * 효과 → CSS. boxy: 상자 모양(box-shadow 사용), 아니면 filter drop-shadow.
 * dropByShape: 상자여도 바깥 그림자는 내용 모양을 따라(drop-shadow) — 칠 없는 프레임 · 그룹(피그마는 상자가 아니라 안에 그린 모양대로 그림자를 그려요. 예: 맵 핀)
 */
export function effectCss(effects: Effect[] | undefined, color: ColorFn, boxy: boolean, dropByShape = false): { outer: string[]; inner: string[]; filter: string[]; backdrop?: string; text: string[] } {
  const out = { outer: [] as string[], inner: [] as string[], filter: [] as string[], backdrop: undefined as string | undefined, text: [] as string[] }
  for (const e of (effects ?? []).filter(on)) {
    if (e.type === 'drop' || e.type === 'inner') {
      const c = color(e.color) ?? e.color
      if (e.type === 'drop') {
        if (boxy && !dropByShape) out.outer.push(`${e.x}px ${e.y}px ${e.blur}px ${e.spread ?? 0}px ${c}`)
        else out.filter.push(`drop-shadow(${e.x}px ${e.y}px ${e.blur / 2}px ${c})`)
        out.text.push(`${e.x}px ${e.y}px ${e.blur / 2}px ${c}`)
      } else if (boxy) out.inner.push(`inset ${e.x}px ${e.y}px ${e.blur}px ${e.spread ?? 0}px ${c}`)
    } else if (e.type === 'blur') out.filter.push(`blur(${e.blur / 2}px)`)
    else out.backdrop = `blur(${e.blur / 2}px)`
  }
  return out
}

/** 모서리 값 [왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래] */
export const radiiOf = (s: LayerStyle): [number, number, number, number] => s.radii ?? [s.radius ?? 0, s.radius ?? 0, s.radius ?? 0, s.radius ?? 0]

const r2 = (v: number) => Math.round(v * 100) / 100

/** 둥근 사각형 윤곽(점선용). inset 만큼 안으로 */
export function rectPath(w: number, h: number, radii: [number, number, number, number], inset = 0): string {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset
  const lim = Math.max(0, Math.min((x1 - x0) / 2, (y1 - y0) / 2))
  const [a, b, c, d] = radii.map((r) => Math.min(lim, Math.max(0, r - inset)))
  return `M${r2(x0 + a!)} ${r2(y0)}H${r2(x1 - b!)}${b ? `A${r2(b)} ${r2(b)} 0 0 1 ${r2(x1)} ${r2(y0 + b)}` : ''}V${r2(y1 - c!)}${c ? `A${r2(c)} ${r2(c)} 0 0 1 ${r2(x1 - c)} ${r2(y1)}` : ''}H${r2(x0 + d!)}${d ? `A${r2(d)} ${r2(d)} 0 0 1 ${r2(x0)} ${r2(y1 - d)}` : ''}V${r2(y0 + a!)}${a ? `A${r2(a)} ${r2(a)} 0 0 1 ${r2(x0 + a)} ${r2(y0)}` : ''}Z`
}
/** 원에 호(Arc) 설정이 있는지 — 한 바퀴 다 안 돌거나 안쪽 구멍이 있으면 경로로 그려요 */
export const hasArc = (s: LayerStyle) => (s.arcSweep !== undefined && s.arcSweep < 360) || (s.arcInner ?? 0) > 0
/** 원 호 경로(피그마 Arc): start 시작 각 · sweep 쓸어 간 각(°) · inner 구멍 비율. 한 바퀴 + 구멍이면 고리(evenodd), 부채꼴은 가운데(또는 안쪽 호)로 닫아요 */
export function arcPath(w: number, h: number, start = 0, sweep = 360, inner = 0): string {
  const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2
  const k = Math.max(0, Math.min(0.999, inner)), ix = rx * k, iy = ry * k
  const sw = Math.max(0, Math.min(360, sweep))
  if (sw <= 0.001) return ''
  if (sw >= 359.999) {
    const ring = k > 0 ? `M${r2(cx - ix)} ${r2(cy)}A${r2(ix)} ${r2(iy)} 0 1 1 ${r2(cx + ix)} ${r2(cy)}A${r2(ix)} ${r2(iy)} 0 1 1 ${r2(cx - ix)} ${r2(cy)}Z` : ''
    return ellipsePath(w, h) + ring
  }
  const a0 = (start * Math.PI) / 180, a1 = a0 + (sw * Math.PI) / 180
  const P = (a: number, kx: number, ky: number) => `${r2(cx + kx * Math.cos(a))} ${r2(cy + ky * Math.sin(a))}`
  const large = sw > 180 ? 1 : 0
  let d = `M${P(a0, rx, ry)}A${r2(rx)} ${r2(ry)} 0 ${large} 1 ${P(a1, rx, ry)}`
  d += k > 0 ? `L${P(a1, ix, iy)}A${r2(ix)} ${r2(iy)} 0 ${large} 0 ${P(a0, ix, iy)}Z` : `L${r2(cx)} ${r2(cy)}Z`
  return d
}
export function ellipsePath(w: number, h: number, inset = 0): string {
  const rx = Math.max(0, w / 2 - inset), ry = Math.max(0, h / 2 - inset)
  return `M${r2(w / 2 - rx)} ${r2(h / 2)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(w / 2 + rx)} ${r2(h / 2)}A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(w / 2 - rx)} ${r2(h / 2)}Z`
}

/** 꼭짓점들을 상자에 꽉 차게 */
function fitPoints(pts: [number, number][], w: number, h: number): [number, number][] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  return pts.map(([x, y]) => [((x - minX) / (maxX - minX || 1)) * w, ((y - minY) / (maxY - minY || 1)) * h])
}
/** 정다각형(위 꼭짓점부터). 피그마처럼 상자에 꽉 차게 */
export function polygonPoints(sides: number, w: number, h: number): [number, number][] {
  const n = Math.max(3, Math.min(60, Math.round(sides)))
  return fitPoints(Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [Math.cos(a), Math.sin(a)] as [number, number] }), w, h)
}
export function starPoints(points: number, inner: number, w: number, h: number): [number, number][] {
  const n = Math.max(3, Math.min(60, Math.round(points)))
  const k = Math.max(0.01, Math.min(1, inner))
  return fitPoints(Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n; const r = i % 2 ? k : 1; return [Math.cos(a) * r, Math.sin(a) * r] as [number, number] }), w, h)
}
const closedD = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join('') + 'Z'

/** 연필 · 선 점(0~1 비율) → 경로. smooth: 연필은 점 사이를 부드럽게 */
export function pointsPath(pts: number[], w: number, h: number, smooth: boolean, closed = false): string {
  const p: [number, number][] = []
  for (let i = 0; i + 1 < pts.length; i += 2) p.push([pts[i]! * w, pts[i + 1]! * h])
  if (!p.length) return ''
  if (!smooth || p.length < 3) return p.map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join('') + (closed ? 'Z' : '')
  let d = `M${r2(p[0]![0])} ${r2(p[0]![1])}`
  for (let i = 1; i < p.length - 1; i++) {
    const [x, y] = p[i]!, [nx, ny] = p[i + 1]!
    d += `Q${r2(x)} ${r2(y)} ${r2((x + nx) / 2)} ${r2((y + ny) / 2)}`
  }
  const last = p[p.length - 1]!
  return d + `L${r2(last[0])} ${r2(last[1])}` + (closed ? 'Z' : '')
}

/** 벡터 경로(0~1 비율) → SVG d. 핸들이 있으면 3차 베지어 */
/**
 * 꼭짓점 모서리 둥글기(VPoint.r, px)를 실제 곡선 점으로 바꾼 vnet(0~1) — 피그마 vertex corner radius 와 같아요.
 * 양옆이 곧은 선(핸들 없음)인 꼭짓점만 둥글게: 두 선을 따라 d 만큼 들어간 두 점 + 원호에 가까운 3차 곡선.
 * d 는 선 길이의 절반을 넘지 않아요(이웃 꼭짓점과 겹치지 않게). r 이 없으면 그대로 돌려줘요
 */
export function bakeCorners(vnet: VPath[] | undefined, w: number, h: number): VPath[] {
  const list = vnet ?? []
  if (!list.some((p) => p.pts.some((q) => q.r))) return list
  const W = w || 1, H = h || 1
  return list.map((p) => {
    const n = p.pts.length
    if (!p.pts.some((q) => q.r) || n < 3) return p
    const A = p.pts.map((q) => ({ x: q.x * W, y: q.y * H }))
    const out: VPath['pts'] = []
    p.pts.forEach((q, k) => {
      const prev = k > 0 ? k - 1 : p.closed ? n - 1 : -1
      const next = k < n - 1 ? k + 1 : p.closed ? 0 : -1
      const straight = prev >= 0 && next >= 0 && !q.i && !q.o && !p.pts[prev]!.o && !p.pts[next]!.i
      const { r: _r, ...plain } = q
      if (!q.r || !straight) { out.push(plain); return }
      const v = A[k]!, a = A[prev]!, b = A[next]!
      const la = Math.hypot(a.x - v.x, a.y - v.y), lb = Math.hypot(b.x - v.x, b.y - v.y)
      if (!la || !lb) { out.push(plain); return }
      const ua = { x: (a.x - v.x) / la, y: (a.y - v.y) / la }, ub = { x: (b.x - v.x) / lb, y: (b.y - v.y) / lb }
      const cos = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y))
      const th = Math.acos(cos) // 두 선 사이 각
      if (th < 1e-3 || Math.PI - th < 1e-3) { out.push(plain); return }
      const d = Math.min(q.r / Math.tan(th / 2), la / 2, lb / 2)
      const R = d * Math.tan(th / 2) // 실제로 들어가는 원 반지름
      const hl = (4 / 3) * Math.tan((Math.PI - th) / 4) * R // 원호 → 3차 곡선 핸들 길이
      const p1 = { x: v.x + ua.x * d, y: v.y + ua.y * d }, p2 = { x: v.x + ub.x * d, y: v.y + ub.y * d }
      const N = (x: number, y: number): [number, number] => [x / W, y / H]
      out.push({ x: p1.x / W, y: p1.y / H, o: N(p1.x - ua.x * hl, p1.y - ua.y * hl) })
      out.push({ x: p2.x / W, y: p2.y / H, i: N(p2.x - ub.x * hl, p2.y - ub.y * hl) })
    })
    return { ...p, pts: out }
  })
}

export function vnetPath(vnet: VPath[] | undefined, w: number, h: number, ox = 0, oy = 0): string {
  let d = ''
  for (const p of bakeCorners(vnet, w, h)) {
    const pts = p.pts
    if (!pts.length) continue
    const X = (v: number) => r2(ox + v * w), Y = (v: number) => r2(oy + v * h)
    d += `M${X(pts[0]!.x)} ${Y(pts[0]!.y)}`
    const seg = (a: VPath['pts'][number], b: VPath['pts'][number]) => {
      if (a.o || b.i) { const o = a.o ?? [a.x, a.y], i = b.i ?? [b.x, b.y]; d += `C${X(o[0])} ${Y(o[1])} ${X(i[0])} ${Y(i[1])} ${X(b.x)} ${Y(b.y)}` }
      else d += `L${X(b.x)} ${Y(b.y)}`
    }
    for (let k = 1; k < pts.length; k++) seg(pts[k - 1]!, pts[k]!)
    if (p.closed && pts.length > 1) { seg(pts[pts.length - 1]!, pts[0]!); d += 'Z' }
  }
  return d
}

/** 점으로 그리는 레이어의 경로 */
export function vectorPath(t: LayerType, s: LayerStyle, w: number, h: number, pts?: number[], closed?: boolean, vnet?: VPath[]): string {
  if (t === 'vector') return vnetPath(vnet, w, h)
  if (t === 'ellipse') return arcPath(w, h, s.arcStart, s.arcSweep, s.arcInner)
  // 다각형 · 별 모서리 둥글기(피그마와 같아요): 꼭짓점마다 같은 r 로
  if ((t === 'polygon' || t === 'star') && (s.radius ?? 0) > 0) {
    const ps = t === 'polygon' ? polygonPoints(s.sides ?? 3, w, h) : starPoints(s.points ?? 5, s.inner ?? STAR_INNER, w, h)
    return vnetPath([{ closed: true, pts: ps.map(([x, y]) => ({ x: x / (w || 1), y: y / (h || 1), r: s.radius })) }], w, h)
  }
  if (t === 'polygon') return closedD(polygonPoints(s.sides ?? 3, w, h))
  if (t === 'star') return closedD(starPoints(s.points ?? 5, s.inner ?? STAR_INNER, w, h))
  if (t === 'line') return pointsPath(pts ?? [0, 0, 1, 0], w, h, false)
  return pointsPath(pts ?? [], w, h, true, closed)
}

/** 손으로 그린 점 줄이기(Ramer–Douglas–Peucker). eps: 허용 오차(px) */
export function simplify(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 3) return p
  const [a, b] = [p[0]!, p[p.length - 1]!]
  let max = 0, at = 0
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs(dy * p[i]![0] - dx * p[i]![1] + b[0] * a[1] - b[1] * a[0]) / len
    if (d > max) { max = d; at = i }
  }
  if (max <= eps) return [a, b]
  return [...simplify(p.slice(0, at + 1), eps).slice(0, -1), ...simplify(p.slice(at), eps)]
}

/** 피그마처럼 묶음(Normal | 어둡게 | 밝게 | 대비 | 차이 | 색) 사이에 구분선 — sep 이 묶음의 첫 항목 */
export const BLEND_MODES: { k: string; label: string; sep?: boolean }[] = [
  { k: 'normal', label: 'Normal' }, { k: 'darken', label: 'Darken', sep: true }, { k: 'multiply', label: 'Multiply' }, { k: 'color-burn', label: 'Color burn' },
  { k: 'lighten', label: 'Lighten', sep: true }, { k: 'screen', label: 'Screen' }, { k: 'color-dodge', label: 'Color dodge' }, { k: 'overlay', label: 'Overlay', sep: true },
  { k: 'soft-light', label: 'Soft light' }, { k: 'hard-light', label: 'Hard light' }, { k: 'difference', label: 'Difference', sep: true }, { k: 'exclusion', label: 'Exclusion' },
  { k: 'hue', label: 'Hue', sep: true }, { k: 'saturation', label: 'Saturation' }, { k: 'color', label: 'Color' }, { k: 'luminosity', label: 'Luminosity' },
]
