import { isContainer, type LayerDoc, type LayerNode } from '~/canvas/schema'
import { backgroundCss, effectCss, strokeShadows } from '~/canvas/paint'
import { nodePathIn } from '~/canvas/vector'
import { canFlatten } from '~/canvas/boolean'
import type { LayerStore } from '~/canvas/store'
import type { MenuItem } from './useContextMenu'

/** 마지막에 복사한 것(레이어 · 화면) — 캔버스 단축키와 우클릭 메뉴가 함께 써요 */
export const useLastCopy = () => useState<'layers' | 'screen' | 'mixed' | null>('iris-last-copy', () => null)
/** 레이어와 함께 고른 화면들(피그마처럼 한 화면 안 자식 레이어 + 다른 화면을 같이 고를 때). 레이어 선택이 비거나 바뀌면 비워요 */
export const useMixScreens = () => useState<string[]>('iris-mix-screens', () => [])

/** 레이어 우클릭 메뉴 항목(피그마 순서). 캔버스 · 레이어 목록 공용 */
/** 레이어 → CSS(피그마 'Copy as CSS') */
export function cssOf(n: LayerNode, color: (v?: string) => string | undefined): string {
  const s = n.style
  const css: Record<string, string> = { width: `${Math.round(n.w)}px`, height: `${Math.round(n.h)}px` }
  if (n.type !== 'text') Object.assign(css, Object.fromEntries(Object.entries(backgroundCss(s, color, () => undefined)).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v])))
  const r = s.radii ? s.radii.map((v) => v + 'px').join(' ') : s.radius ? s.radius + 'px' : n.type === 'ellipse' ? '50%' : ''
  if (r) css['border-radius'] = r
  const st = strokeShadows(s, n.type, color), fx = effectCss(s.effects, color, true)
  const sh = [...st.outer, ...st.inner, ...fx.outer, ...fx.inner]
  if (sh.length) css['box-shadow'] = sh.join(', ')
  if (fx.filter.length) css.filter = fx.filter.join(' ')
  if (s.opacity !== undefined && s.opacity < 1) css.opacity = String(s.opacity)
  if (s.blend && s.blend !== 'normal') css['mix-blend-mode'] = s.blend
  if (n.type === 'text') Object.assign(css, { color: color(s.color) ?? '', 'font-family': 'Pretendard', 'font-size': `${s.fontSize ?? 16}px`, 'font-weight': String(s.fontWeight ?? 400), 'line-height': s.lineHeight ? `${s.lineHeight}px` : 'normal', ...(s.letterSpacing ? { 'letter-spacing': `${s.letterSpacing}px` } : {}), 'text-align': s.align ?? 'left' })
  return `/* ${n.name} */\n` + Object.entries(css).filter(([, v]) => v).map(([k, v]) => `${k}: ${v};`).join('\n')
}
/** 레이어들 → SVG(피그마 'Copy as SVG'). 텍스트 · 이미지 · 인스턴스는 빼요 */
export function svgOf(doc: LayerDoc, ns: LayerNode[], color: (v?: string) => string | undefined): string | null {
  const shapes = ns.filter((n) => n.type !== 'text' && n.type !== 'image' && n.type !== 'instance')
  if (!shapes.length) return null
  const x0 = Math.min(...shapes.map((n) => n.x)), y0 = Math.min(...shapes.map((n) => n.y))
  const W = Math.max(...shapes.map((n) => n.x + n.w)) - x0, H = Math.max(...shapes.map((n) => n.y + n.h)) - y0
  const r = (v: number) => Math.round(v * 100) / 100
  const body = shapes.map((n) => {
    const d = nodePathIn(doc, n, -x0, -y0)
    const fill = n.type === 'line' || (n.type === 'path' && !n.closed) ? 'none' : color(n.style.fill) ?? 'none'
    const stroke = n.style.stroke && n.style.strokeWidth ? ` stroke="${color(n.style.stroke)}" stroke-width="${n.style.strokeWidth}"` : ''
    return `  <path d="${d}" fill="${fill}"${n.evenodd ? ' fill-rule="evenodd"' : ''}${stroke}${n.style.opacity !== undefined && n.style.opacity < 1 ? ` opacity="${n.style.opacity}"` : ''}/>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(W)}" height="${r(H)}" viewBox="0 0 ${r(W)} ${r(H)}" fill="none">\n${body}\n</svg>`
}
async function copyText(text: string, hint?: (t: string) => void) {
  try { await navigator.clipboard.writeText(text); hint?.(tr('Copied to clipboard')) } catch { hint?.(tr('Couldn\'t copy to the clipboard')) }
}

export function layerMenuItems(store: LayerStore, sid: string, ids: string[], opts: { lastCopy: Ref<'layers' | 'screen' | 'mixed' | null>; paste: () => void; pasteHere?: () => void; fit?: () => void; hint?: (t: string) => void }): MenuItem[] {
  const d = store.doc(sid)
  const nodes = ids.map((id) => d.nodes[id]).filter((n): n is NonNullable<typeof n> => !!n)
  if (!nodes.length) return []
  const one = nodes.length === 1 ? nodes[0]! : null
  const allHidden = nodes.every((n) => n.hidden), allLocked = nodes.every((n) => n.locked)
  const hasLayout = nodes.some((n) => n.style.layout)
  return [
    { label: tr('Copy'), shortcut: '⌘C', action: () => { if (store.copy()) opts.lastCopy.value = 'layers' } },
    { label: tr('Paste'), shortcut: '⌘V', action: opts.paste, disabled: !store.hasClipboard() && opts.lastCopy.value !== 'screen' },
    ...(opts.pasteHere ? [{ label: tr('Paste here'), action: opts.pasteHere, disabled: !store.hasClipboard() || opts.lastCopy.value === 'screen' }] : []),
    { label: tr('Duplicate'), shortcut: '⌘D', action: () => store.duplicate() },
    { label: tr('Copy as CSS'), action: () => copyText(nodes.map((n) => cssOf(n, store.color)).join('\n\n'), opts.hint) },
    ...(svgOf(d, nodes, store.color) ? [{ label: tr('Copy as SVG'), action: () => copyText(svgOf(d, nodes, store.color)!, opts.hint) }] : []),
    'sep',
    { label: tr('Select parent'), shortcut: '⇧↵', action: () => store.selectParent(sid), disabled: nodes.every((n) => !n.parentId) },
    ...(nodes.some((n) => isContainer(n) && n.children?.length) ? [{ label: tr('Select children'), shortcut: '↵', action: () => store.selectChildren(sid) }] : []),
    { label: tr('Select all'), shortcut: '⌘A', action: () => store.selectAll(sid) },
    { label: tr('Select inverse'), shortcut: '⇧⌘A', action: () => store.selectInverse(sid) },
    { label: tr('Select all matching layers'), shortcut: '⌥⌘A', action: () => store.selectMatching(sid) },
    'sep',
    { label: tr('Bring to front'), shortcut: '⌥⌘]', action: () => store.arrange(sid, ids, 'top') },
    { label: tr('Bring forward'), shortcut: '⌘]', action: () => store.arrange(sid, ids, 1) },
    { label: tr('Send backward'), shortcut: '⌘[', action: () => store.arrange(sid, ids, -1) },
    { label: tr('Send to back'), shortcut: '⌥⌘[', action: () => store.arrange(sid, ids, 'bottom') },
    'sep',
    { label: tr('Group selection'), shortcut: '⌘G', action: () => store.wrap(sid, ids, 'group') },
    { label: tr('Frame selection'), shortcut: '⌥⌘G', action: () => store.wrap(sid, ids, 'frame') },
    // 섹션은 캔버스 맨 위에만(피그마와 같아요)
    ...(sid.startsWith('page:') && nodes.every((n) => !n.parentId) ? [{ label: tr('Section selection'), shortcut: '⌥⌘S', action: () => store.wrap(sid, ids, 'section') }] : []),
    ...(nodes.some((n) => isContainer(n)) ? [{ label: tr('Ungroup'), shortcut: '⇧⌘G', action: () => store.unwrap(sid, ids) }] : []),
    hasLayout ? { label: tr('Remove auto layout'), shortcut: '⌥⇧A', action: () => store.removeAutoLayout(sid, ids) } : { label: tr('Add auto layout'), shortcut: '⇧A', action: () => store.addAutoLayout(sid, ids) },
    'sep',
    ...(nodes.length > 1 ? [
      { label: tr('Union selection'), shortcut: '⌥⇧U', action: () => store.booleanOp(sid, ids, 'union') },
      { label: tr('Subtract selection'), shortcut: '⌥⇧S', action: () => store.booleanOp(sid, ids, 'subtract') },
      { label: tr('Intersect selection'), shortcut: '⌥⇧I', action: () => store.booleanOp(sid, ids, 'intersect') },
      { label: tr('Exclude selection'), shortcut: '⌥⇧E', action: () => store.booleanOp(sid, ids, 'exclude') },
    ] : []),
    { label: one?.isMask ? tr('Remove mask') : tr('Use as mask'), shortcut: '⌃⌘M', action: () => store.toggleMask(sid, ids) },
    { label: tr('Flatten'), shortcut: '⌘E', action: () => store.flatten(sid, ids), disabled: !canFlatten(nodes) },
    'sep',
    { label: allHidden ? tr('Show') : tr('Hide'), action: () => store.update(sid, ids, { hidden: allHidden ? undefined : true }) },
    { label: allLocked ? tr('Unlock') : tr('Lock'), action: () => store.update(sid, ids, { locked: allLocked ? undefined : true }) },
    'sep',
    { label: tr('Flip horizontal'), shortcut: '⇧H', action: () => store.flip(sid, ids, 'x') },
    { label: tr('Flip vertical'), shortcut: '⇧V', action: () => store.flip(sid, ids, 'y') },
    'sep',
    { label: tr('Copy properties'), shortcut: '⌥⌘C', action: () => store.copyStyle(), disabled: !one },
    { label: tr('Paste properties'), shortcut: '⌥⌘V', action: () => store.pasteStyle() },
    ...(opts.fit ? ['sep' as const, { label: tr('Zoom to selection'), shortcut: '⇧2', action: opts.fit }] : []),
    'sep',
    { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => store.remove(sid, ids) },
  ]
}
