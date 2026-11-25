/**
 * v-ovscroll: 피그마처럼 내용 위에 떠 있는 얇은 스크롤 막대(4px · 여린 회색).
 * 기본 스크롤바는 숨기고(자리를 차지하지 않아 행 칠이 창 끝까지 그대로), 목록에 마우스를 올렸거나 스크롤하는 동안에만 보여요.
 * 막대는 스크롤하지 않는 부모 안에 형제로 붙여요(스크롤 영역 안에 두면 내용과 함께 밀려 올라가요)
 */
const KEY = Symbol('ovscroll')
type St = { thumb: HTMLElement; ro: ResizeObserver; mo: MutationObserver; timer: number; hover: boolean; off: () => void }
type El = HTMLElement & { [KEY]?: St }
const MIN = 24
const INSET = 2

function update(el: El) {
  const st = el[KEY]
  if (!st) return
  const sh = el.scrollHeight, ch = el.clientHeight
  if (sh <= ch + 1 || !ch) { st.thumb.style.display = 'none'; return }
  st.thumb.style.display = ''
  const track = ch - INSET * 2
  const th = Math.max(MIN, (track * ch) / sh)
  const p = el.scrollTop / (sh - ch)
  st.thumb.style.height = th + 'px'
  st.thumb.style.top = el.offsetTop + INSET + (track - th) * p + 'px'
  st.thumb.style.left = el.offsetLeft + el.offsetWidth - 4 - INSET + 'px'
}
function show(el: El, hold: boolean) {
  const st = el[KEY]
  if (!st) return
  update(el)
  st.thumb.classList.add('on')
  clearTimeout(st.timer)
  if (!hold) st.timer = window.setTimeout(() => { if (!st.hover) st.thumb.classList.remove('on') }, 800)
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('ovscroll', {
    getSSRProps: () => ({}),
    mounted(el: El) {
      const parent = el.parentElement
      if (!parent) return
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
      el.classList.add('ovs')
      const thumb = document.createElement('div')
      thumb.className = 'ovs-thumb'
      thumb.setAttribute('aria-hidden', 'true')
      parent.appendChild(thumb)
      const onScroll = () => show(el, false)
      const onEnter = () => { const st = el[KEY]; if (st) st.hover = true; show(el, true) }
      const onLeave = () => { const st = el[KEY]; if (st) st.hover = false; show(el, false) }
      el.addEventListener('scroll', onScroll, { passive: true })
      el.addEventListener('pointerenter', onEnter)
      el.addEventListener('pointerleave', onLeave)
      const ro = new ResizeObserver(() => update(el))
      ro.observe(el)
      const mo = new MutationObserver(() => requestAnimationFrame(() => update(el)))
      mo.observe(el, { childList: true, subtree: true })
      el[KEY] = { thumb, ro, mo, timer: 0, hover: false, off: () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave) } }
      requestAnimationFrame(() => update(el))
    },
    updated(el: El) { requestAnimationFrame(() => update(el)) },
    beforeUnmount(el: El) {
      const st = el[KEY]
      if (!st) return
      st.off(); st.ro.disconnect(); st.mo.disconnect(); clearTimeout(st.timer); st.thumb.remove()
      delete el[KEY]
    },
  })
})
