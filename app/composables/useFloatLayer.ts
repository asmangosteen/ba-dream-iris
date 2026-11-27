/**
 * 떠 있는 창(이모지 창 · 멘션 목록 · ⋯ 메뉴)을 body 맨 위층(position: fixed)에 띄울 때 쓰는 도구 — 사용자 요청 2026-11-27.
 * 스크롤 · 잘림 영역(메모 칸 등) 안에서 열어도 칸 밖으로 잘리지 않아요.
 */

/** 기준 요소 위나 아래에 놓을 자리(창 크기 w × h). 화면 밖으로 나가지 않게 맞추고, 원하는 쪽이 모자라면 반대쪽으로 */
export function floatPos(anchor: DOMRect, w: number, h: number, prefer: 'below' | 'above' = 'below', align: 'left' | 'right' = 'left', gap = 4): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight, M = 8
  const below = vh - anchor.bottom - gap, above = anchor.top - gap
  const goBelow = prefer === 'below' ? below >= h || below >= above : !(above >= h || above >= below)
  const top = goBelow ? anchor.bottom + gap : anchor.top - gap - h
  const left = align === 'left' ? anchor.left : anchor.right - w
  return { left: Math.round(Math.min(Math.max(M, left), vw - w - M)), top: Math.round(Math.min(Math.max(M, top), vh - h - M)) }
}

/**
 * 떠 있는 창이 열려 있는 동안 뒤 화면이 스크롤되지 않게: 창 바깥의 휠 · 터치 스크롤을 막아요(창 안 스크롤은 그대로).
 * inside(el) 가 true 면 막지 않아요
 */
export function useScrollLock(active: () => boolean, inside: (el: Element) => boolean) {
  const block = (e: Event) => {
    if (!active()) return
    const t = e.target
    if (t instanceof Element && inside(t)) return
    e.preventDefault()
  }
  onMounted(() => {
    window.addEventListener('wheel', block, { capture: true, passive: false })
    window.addEventListener('touchmove', block, { capture: true, passive: false })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('wheel', block, { capture: true })
    window.removeEventListener('touchmove', block, { capture: true })
  })
}
