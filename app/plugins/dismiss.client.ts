/**
 * 떠 있는 창 바깥 누르기 = "창 닫기만"(utils/dismiss.ts). 창들은 window · document capture 에서 스스로 닫히고,
 * 여기(<html> capture — 그보다 뒤, 누른 요소보다 앞)에서 누름을 멈춰 캔버스 · 버튼 · 목록이 반응하지 않게 해요. 뒤따르는 click 도 삼켜요
 */
export default defineNuxtPlugin(() => {
  let swallow: { el: Element; at: number } | null = null
  document.documentElement.addEventListener('pointerdown', (e) => {
    swallow = null
    if (!dismissPress(e)) return
    e.stopPropagation()
    swallow = { el: e.target as Element, at: performance.now() }
  }, true)
  window.addEventListener('click', (e) => {
    const s = swallow
    if (!s) return
    swallow = null
    const t = e.target as Node | null
    if (performance.now() - s.at > 1500 || !t || !(t === s.el || s.el.contains(t) || t.contains(s.el))) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
  }, true)
})
