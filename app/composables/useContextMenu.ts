/** 우클릭 메뉴(피그마처럼). 한 번에 하나만 떠요 */
/** icon: 이름 왼쪽 16 아이콘 — name = 아이콘 세트 이름(EditorIcon, PRD/icons). 옛 방식: fill = 채운 모양, soft = 칠을 40% 로 옅게, stroke = 1.25 선 — 16×16 경로 */
export type MenuItem = { label: string; shortcut?: string; action: () => unknown; disabled?: boolean; danger?: boolean; icon?: { name?: string; fill?: string; soft?: boolean; stroke?: string } } | 'sep'
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
