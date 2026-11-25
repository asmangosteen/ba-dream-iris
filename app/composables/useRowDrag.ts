/**
 * 패널 목록 끌어서 순서 바꾸기(Fill · Stroke · Effects · Layout grid · Export — 피그마와 같아요).
 * - 행에 data-drag-row, 손잡이(.drag-h)에서 start(e, 보이는 순번)
 * - 끄는 동안 drag.to(넣을 자리) · drag.y · x · w(파란 줄 자리, box 기준)가 바뀌고, 놓으면 onMove(from, to) — to 는 뺀 뒤의 새 순번
 */
export function useRowDrag(onMove: (from: number, to: number) => void) {
  const box = ref<HTMLElement | null>(null)
  const drag = ref<{ from: number; to: number; y: number; x: number; w: number } | null>(null)
  function start(e: PointerEvent, from: number) {
    if (e.button !== 0 || !box.value) return
    e.preventDefault()
    e.stopPropagation()
    const sy = e.clientY
    let moved = false
    const rows = () => [...(box.value?.querySelectorAll<HTMLElement>('[data-drag-row]') ?? [])]
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - sy) < 3) return
      moved = true
      document.documentElement.classList.add('row-dragging')
      const rs = rows().map((r) => r.getBoundingClientRect())
      const b = box.value!.getBoundingClientRect()
      if (!rs.length) return
      let to = rs.length
      for (let i = 0; i < rs.length; i++) if (ev.clientY < rs[i]!.top + rs[i]!.height / 2) { to = i; break }
      const y = to === 0 ? rs[0]!.top - 4 : to === rs.length ? rs[rs.length - 1]!.bottom + 4 : (rs[to - 1]!.bottom + rs[to]!.top) / 2
      drag.value = { from, to, y: y - b.top, x: rs[0]!.left - b.left, w: rs[0]!.width }
    }
    const up = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      document.documentElement.classList.remove('row-dragging')
      const d = drag.value
      drag.value = null
      if (!d || d.to === d.from || d.to === d.from + 1) return
      onMove(d.from, d.to > d.from ? d.to - 1 : d.to)
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
  }
  /** 키보드: 손잡이에서 ↑↓ 로 한 칸씩 */
  function key(e: KeyboardEvent, i: number, n: number) {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!d || i + d < 0 || i + d >= n) return
    e.preventDefault()
    onMove(i, i + d)
  }
  return { box, drag, start, key }
}

/** 배열에서 하나를 옮긴 새 배열 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list]
  const [m] = out.splice(from, 1)
  out.splice(to, 0, m!)
  return out
}
