import { isContainer } from '~/canvas/schema'
import type { LayerStore } from '~/canvas/store'
import type { MenuItem } from './useContextMenu'

/** 마지막에 복사한 것(레이어 · 화면) — 캔버스 단축키와 우클릭 메뉴가 함께 써요 */
export const useLastCopy = () => useState<'layers' | 'screen' | null>('iris-last-copy', () => null)

/** 레이어 우클릭 메뉴 항목(피그마 순서). 캔버스 · 레이어 목록 공용 */
export function layerMenuItems(store: LayerStore, sid: string, ids: string[], opts: { lastCopy: Ref<'layers' | 'screen' | null>; paste: () => void; fit?: () => void }): MenuItem[] {
  const d = store.doc(sid)
  const nodes = ids.map((id) => d.nodes[id]).filter((n): n is NonNullable<typeof n> => !!n)
  if (!nodes.length) return []
  const one = nodes.length === 1 ? nodes[0]! : null
  const allHidden = nodes.every((n) => n.hidden), allLocked = nodes.every((n) => n.locked)
  const hasLayout = nodes.some((n) => n.style.layout)
  return [
    { label: 'Copy', shortcut: '⌘C', action: () => { if (store.copy()) opts.lastCopy.value = 'layers' } },
    { label: 'Paste', shortcut: '⌘V', action: opts.paste, disabled: !store.hasClipboard() && opts.lastCopy.value !== 'screen' },
    { label: 'Duplicate', shortcut: '⌘D', action: () => store.duplicate() },
    'sep',
    { label: 'Bring to front', shortcut: '⌥⌘]', action: () => store.arrange(sid, ids, 'top') },
    { label: 'Bring forward', shortcut: '⌘]', action: () => store.arrange(sid, ids, 1) },
    { label: 'Send backward', shortcut: '⌘[', action: () => store.arrange(sid, ids, -1) },
    { label: 'Send to back', shortcut: '⌥⌘[', action: () => store.arrange(sid, ids, 'bottom') },
    'sep',
    { label: 'Group selection', shortcut: '⌘G', action: () => store.wrap(sid, ids, 'group') },
    { label: 'Frame selection', shortcut: '⌥⌘G', action: () => store.wrap(sid, ids, 'frame') },
    ...(nodes.some((n) => isContainer(n)) ? [{ label: 'Ungroup', shortcut: '⇧⌘G', action: () => store.unwrap(sid, ids) }] : []),
    hasLayout ? { label: 'Remove auto layout', shortcut: '⌥⇧A', action: () => store.removeAutoLayout(sid, ids) } : { label: 'Add auto layout', shortcut: '⇧A', action: () => store.addAutoLayout(sid, ids) },
    'sep',
    { label: allHidden ? 'Show' : 'Hide', action: () => store.update(sid, ids, { hidden: allHidden ? undefined : true }) },
    { label: allLocked ? 'Unlock' : 'Lock', action: () => store.update(sid, ids, { locked: allLocked ? undefined : true }) },
    'sep',
    { label: 'Flip horizontal', shortcut: '⇧H', action: () => store.flip(sid, ids, 'x') },
    { label: 'Flip vertical', shortcut: '⇧V', action: () => store.flip(sid, ids, 'y') },
    'sep',
    { label: 'Copy properties', shortcut: '⌥⌘C', action: () => store.copyStyle(), disabled: !one },
    { label: 'Paste properties', shortcut: '⌥⌘V', action: () => store.pasteStyle() },
    ...(opts.fit ? ['sep' as const, { label: 'Zoom to selection', shortcut: '⇧2', action: opts.fit }] : []),
    'sep',
    { label: 'Delete', shortcut: '⌫', danger: true, action: () => store.remove(sid, ids) },
  ]
}
