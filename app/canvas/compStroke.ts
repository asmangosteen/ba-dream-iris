import { toRgba } from './color'

/**
 * 컴포넌트(인스턴스)가 스스로 그린 테두리 선 읽기 — 피그마처럼 Stroke 칸에 보여 주려고.
 * 예: Top Bar 의 Line = 아래쪽 1px 안쪽 선(gray-900 5%). 디자인 시스템은 border 나 안쪽 box-shadow 로 그려요
 */
export interface CompStroke { hex: string; alpha: number; width: number; side: 'All' | 'Top' | 'Bottom' | 'Left' | 'Right'; css: string }

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()

function fromColor(c: string) {
  const { r, g, b, a } = toRgba(c)
  return { hex: hex2(r) + hex2(g) + hex2(b), alpha: Math.round(a * 100), css: c }
}

/** 인스턴스로 그려진 컴포넌트의 맨 바깥 요소에서 선을 찾아요. 없으면 null */
export function readCompStroke(el: Element | null): CompStroke | null {
  if (!el) return null
  const cs = getComputedStyle(el)
  // 1) border
  const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) => ({ s, w: parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0, style: cs.getPropertyValue(`border-${s.toLowerCase()}-style`), color: cs.getPropertyValue(`border-${s.toLowerCase()}-color`) }))
  const on = sides.filter((x) => x.w > 0 && x.style !== 'none' && x.style !== 'hidden')
  if (on.length) {
    const c = fromColor(on[0]!.color)
    if (c.alpha > 0) return { ...c, width: on[0]!.w, side: on.length === 4 ? 'All' : on[0]!.s }
  }
  // 2) 안쪽 box-shadow (선처럼 쓰는 것: 흐림 0)
  const bs = cs.boxShadow
  if (bs && bs !== 'none') {
    const re = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?\s+inset/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(bs))) {
      const [, color, xs, ys, blur, sp] = m
      const x = parseFloat(xs!), y = parseFloat(ys!), spread = parseFloat(sp ?? '0')
      if (parseFloat(blur!) > 0) continue
      const c = fromColor(color!)
      if (c.alpha === 0) continue
      const side = spread > 0 && !x && !y ? 'All' : y < 0 ? 'Bottom' : y > 0 ? 'Top' : x < 0 ? 'Right' : x > 0 ? 'Left' : null
      if (!side) continue
      return { ...c, width: Math.max(Math.abs(x), Math.abs(y), spread), side }
    }
  }
  return null
}
