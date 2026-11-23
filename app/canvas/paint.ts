import type { Effect, LayerStyle, LayerType, Paint } from './schema'

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
export function paintLayer(p: Paint, color: ColorFn, img: ImgFn): { image: string; size: string; position: string; repeat: string } | null {
  if (p.type === 'solid') {
    const c = alpha(color(p.color) ?? p.color, p.opacity)
    return { image: `linear-gradient(${c}, ${c})`, size: 'auto', position: '0 0', repeat: 'no-repeat' }
  }
  if (p.type === 'linear' || p.type === 'radial') {
    const stops = [...p.stops].sort((a, b) => a.pos - b.pos).map((s) => `${alpha(color(s.color) ?? s.color, p.opacity)} ${Math.round(s.pos * 1000) / 10}%`).join(', ')
    return { image: p.type === 'linear' ? `linear-gradient(${p.angle ?? 180}deg, ${stops})` : `radial-gradient(farthest-side, ${stops})`, size: 'auto', position: '0 0', repeat: 'no-repeat' }
  }
  if (p.type !== 'image') return null
  const url = img(p.src)
  if (!url) return null
  const fit = p.fit ?? 'fill'
  return { image: `url("${url}")`, size: fit === 'fit' ? 'contain' : fit === 'tile' ? 'auto' : 'cover', position: 'center', repeat: fit === 'tile' ? 'repeat' : 'no-repeat' }
}

/** 채우기: fill(바탕) + fills(위로 쌓기, 마지막이 맨 위) */
export function backgroundCss(s: LayerStyle, color: ColorFn, img: ImgFn): Record<string, string> {
  const css: Record<string, string> = {}
  if (s.fill) css.backgroundColor = color(s.fill) ?? s.fill
  const layers = (s.fills ?? []).filter(on).map((p) => paintLayer(p, color, img)).filter((x): x is NonNullable<typeof x> => !!x).reverse()
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

/** 선 색들(맨 위가 먼저). 이미지 · 그라디언트 선은 첫 색으로 */
export function strokeColors(s: LayerStyle, color: ColorFn): string[] {
  if (!s.strokeWidth) return []
  const extra = (s.strokes ?? []).filter(on).map((p) => (p.type === 'solid' ? alpha(color(p.color) ?? p.color, p.opacity) : p.type === 'image' ? '' : color(p.stops[0]?.color) ?? '')).filter(Boolean).reverse()
  return [...extra, ...(s.stroke ? [color(s.stroke) ?? s.stroke] : [])]
}

export const defaultAlign = (t: LayerType): 'inside' | 'center' => (t === 'line' || t === 'path' ? 'center' : 'inside')

/** 상자 도형의 선(실선) → box-shadow. outer 는 상자 바깥(그림자와 함께), inner 는 내용 위 덮개에 */
export function strokeShadows(s: LayerStyle, t: LayerType, color: ColorFn): { outer: string[]; inner: string[] } {
  const out = { outer: [] as string[], inner: [] as string[] }
  const w = s.strokeWidth ?? 0
  if (!w || s.dash) return out
  const align = s.strokeAlign ?? defaultAlign(t)
  for (const c of strokeColors(s, color)) {
    if (align === 'inside') out.inner.push(`inset 0 0 0 ${w}px ${c}`)
    else if (align === 'outside') out.outer.push(`0 0 0 ${w}px ${c}`)
    else { out.inner.push(`inset 0 0 0 ${w / 2}px ${c}`); out.outer.push(`0 0 0 ${w / 2}px ${c}`) }
  }
  return out
}

/** 효과 → CSS. boxy: 상자 모양(box-shadow 사용), 아니면 filter drop-shadow */
export function effectCss(effects: Effect[] | undefined, color: ColorFn, boxy: boolean): { outer: string[]; inner: string[]; filter: string[]; backdrop?: string; text: string[] } {
  const out = { outer: [] as string[], inner: [] as string[], filter: [] as string[], backdrop: undefined as string | undefined, text: [] as string[] }
  for (const e of (effects ?? []).filter(on)) {
    if (e.type === 'drop' || e.type === 'inner') {
      const c = color(e.color) ?? e.color
      if (e.type === 'drop') {
        if (boxy) out.outer.push(`${e.x}px ${e.y}px ${e.blur}px ${e.spread ?? 0}px ${c}`)
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

/** 점으로 그리는 레이어의 경로 */
export function vectorPath(t: LayerType, s: LayerStyle, w: number, h: number, pts?: number[], closed?: boolean): string {
  if (t === 'polygon') return closedD(polygonPoints(s.sides ?? 3, w, h))
  if (t === 'star') return closedD(starPoints(s.points ?? 5, s.inner ?? 0.38, w, h))
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

export const BLEND_MODES: { k: string; label: string }[] = [
  { k: 'normal', label: 'Normal' }, { k: 'darken', label: 'Darken' }, { k: 'multiply', label: 'Multiply' }, { k: 'color-burn', label: 'Color burn' },
  { k: 'lighten', label: 'Lighten' }, { k: 'screen', label: 'Screen' }, { k: 'color-dodge', label: 'Color dodge' }, { k: 'overlay', label: 'Overlay' },
  { k: 'soft-light', label: 'Soft light' }, { k: 'hard-light', label: 'Hard light' }, { k: 'difference', label: 'Difference' }, { k: 'exclusion', label: 'Exclusion' },
  { k: 'hue', label: 'Hue' }, { k: 'saturation', label: 'Saturation' }, { k: 'color', label: 'Color' }, { k: 'luminosity', label: 'Luminosity' },
]
