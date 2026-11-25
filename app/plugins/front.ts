/**
 * v-front: 떠 있는 창(칠 · 효과 · 토큰 목록 · 글자 설정 등)을 열 때마다 맨 위로.
 * 작은 화면에서 창끼리 겹치면 나중에 연 창이 위에 와요(피그마와 같아요). 창을 누르면 그 창이 다시 맨 위로 올라와요.
 * 모두 60 부터 차례로 올라가요(메뉴 · 드롭다운은 각 창 안에 있어서 함께 올라가요)
 */
let top = 60
const raise = (el: HTMLElement) => { if (Number(el.style.zIndex) !== top) el.style.zIndex = String(++top) }
const KEY = Symbol('front')
type El = HTMLElement & { [KEY]?: () => void }

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('front', {
    getSSRProps: () => ({}),
    mounted(el: El) {
      raise(el)
      el[KEY] = () => raise(el)
      el.addEventListener('pointerdown', el[KEY], true)
    },
    beforeUnmount(el: El) {
      if (el[KEY]) el.removeEventListener('pointerdown', el[KEY], true)
    },
  })
})
