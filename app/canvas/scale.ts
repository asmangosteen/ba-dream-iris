import type { LayerStyle } from './schema'

/**
 * 스케일(K): 스타일 속 길이 값을 k 배로 — 선 두께 · 모서리 · 글자 크기 · 줄 높이 · 자간 · 문단 간격 · 점선 · 효과 · 오토 레이아웃 간격.
 * 캔버스에서 끌어 키우기(EditorCanvas)와 오른쪽 Scale 칸(store.scaleLayers)이 함께 써요
 */
export function scaledStyle(o: LayerStyle, k: number): LayerStyle {
  const sc = (v?: number) => (v === undefined ? v : Math.round(v * k * 100) / 100)
  const st: LayerStyle = { ...o }
  st.strokeWidth = sc(o.strokeWidth); st.radius = sc(o.radius); st.fontSize = sc(o.fontSize); st.lineHeight = o.lineHeightUnit === 'percent' ? o.lineHeight : sc(o.lineHeight) // % 는 글자 크기를 따라가니 그대로
  st.letterSpacing = sc(o.letterSpacing); st.paraSpacing = sc(o.paraSpacing)
  if (o.radii) st.radii = o.radii.map((r) => sc(r)!) as [number, number, number, number]
  if (o.dash) st.dash = [sc(o.dash[0])!, sc(o.dash[1])!]
  if (o.effects) st.effects = o.effects.map((e) => (e.type === 'drop' || e.type === 'inner' ? { ...e, x: sc(e.x)!, y: sc(e.y)!, blur: sc(e.blur)!, spread: sc(e.spread) } : { ...e, blur: sc(e.blur)! }))
  if (o.layout) st.layout = { ...o.layout, gap: o.layout.gap === 'auto' ? 'auto' : sc(o.layout.gap)!, padding: o.layout.padding.map((p) => sc(p)!) as [number, number, number, number] }
  for (const key of Object.keys(st) as (keyof LayerStyle)[]) if (st[key] === undefined) delete st[key]
  return st
}
