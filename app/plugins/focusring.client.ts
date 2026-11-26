/**
 * 포커스 링은 키보드(Tab)로 옮길 때만(사용자 요청 — 꼭 필요할 때만):
 * Tab 을 누르면 <html class="kbd-nav">, 마우스 · 손가락으로 누르면 지워요. main.css 가 kbd-nav 가 없을 때 :focus-visible 링(outline)을 감춰요.
 * 마우스로 누른 버튼에 포커스가 남은 채 단축키를 누르면 브라우저가 링을 그리던 문제도 같이 사라져요(입력칸의 선택선은 그대로)
 */
export default defineNuxtPlugin(() => {
  const root = document.documentElement
  window.addEventListener('keydown', (e) => { if (e.key === 'Tab') root.classList.add('kbd-nav') }, true)
  window.addEventListener('pointerdown', () => root.classList.remove('kbd-nav'), true)
})
