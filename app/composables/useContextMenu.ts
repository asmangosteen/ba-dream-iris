/** 우클릭 메뉴(피그마처럼). 한 번에 하나만 떠요 */
export type MenuItem = { label: string; shortcut?: string; action: () => unknown; disabled?: boolean; danger?: boolean } | 'sep'
export interface MenuState { x: number; y: number; items: MenuItem[] }
export function useContextMenu() {
  const state = useState<MenuState | null>('iris-context-menu', () => null)
  function open(e: MouseEvent, items: MenuItem[]) {
    e.preventDefault()
    e.stopPropagation()
    const list = items.filter((x, i, a) => !(x === 'sep' && (i === 0 || a[i - 1] === 'sep' || i === a.length - 1)))
    if (list.length) state.value = { x: e.clientX, y: e.clientY, items: list }
  }
  const close = () => (state.value = null)
  return { state, open, close }
}
