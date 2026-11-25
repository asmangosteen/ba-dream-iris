/**
 * 팝오버 옮기기(피그마처럼): 팝오버 머리(제목 · 탭 줄)를 끌면 팝오버가 따라와요. 머리 안 버튼 · 탭 · 입력칸은 그대로 눌려요.
 * 한 번 옮긴 팝오버는 [data-moved] + --mv-x · --mv-y 로 자리가 고정돼요(main.css) — 패널 스크롤 · 탭 바꾸기 · 내용이 바뀌어
 * 팝오버가 스스로 자리를 다시 잡아도(left · top 인라인) 옮긴 자리에 그대로 있어요. 닫았다 열면 원래 자리(앵커 옆)에서 다시 시작.
 * 화면 밖으로는 못 나가요(가장자리 8). 창 크기가 바뀌면 화면 안으로 다시 맞춰요.
 */
const HEAD = '.pp-h, .td-h, .pop-h, .ip-h, .cs-h, .tsp-h'
const SKIP = 'button, input, select, textarea, a, label, [role="tab"], [role="radio"], [contenteditable="true"]'
const EDGE = 8

export default defineNuxtPlugin(() => {
  /** 머리를 감싼 팝오버: 위로 올라가며 처음 만나는 position: fixed 요소 */
  function popOf(head: Element): HTMLElement | null {
    for (let n = head.parentElement; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return n
    return null
  }
  function clamp(el: HTMLElement, x: number, y: number) {
    const w = el.offsetWidth
    const h = el.offsetHeight
    return {
      x: Math.round(Math.min(Math.max(EDGE, x), Math.max(EDGE, window.innerWidth - w - EDGE))),
      y: Math.round(Math.min(Math.max(EDGE, y), Math.max(EDGE, window.innerHeight - h - EDGE))),
    }
  }
  function put(el: HTMLElement, x: number, y: number) {
    const p = clamp(el, x, y)
    el.style.setProperty('--mv-x', p.x + 'px')
    el.style.setProperty('--mv-y', p.y + 'px')
    el.setAttribute('data-moved', '')
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const t = e.target as Element | null
    const head = t?.closest?.(HEAD)
    if (!head || t!.closest(SKIP)) return
    const pop = popOf(head)
    if (!pop) return
    e.preventDefault() // 글자 선택 · 포커스 옮김 없이
    const r = pop.getBoundingClientRect()
    const ox = e.clientX - r.left
    const oy = e.clientY - r.top
    const id = e.pointerId
    try { (head as HTMLElement).setPointerCapture(id) } catch { /* 캡처 못 해도 문서 이벤트로 따라가요 */ }
    document.documentElement.classList.add('pop-dragging')
    const move = (ev: PointerEvent) => { if (ev.pointerId === id) put(pop, ev.clientX - ox, ev.clientY - oy) }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      document.documentElement.classList.remove('pop-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, true) // 잡는 단계에서 — 팝오버가 pointerdown 전파를 막아도 끌 수 있게

  window.addEventListener('resize', () => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-moved]')) {
      put(el, parseFloat(el.style.getPropertyValue('--mv-x')) || 0, parseFloat(el.style.getPropertyValue('--mv-y')) || 0)
    }
  })
})
