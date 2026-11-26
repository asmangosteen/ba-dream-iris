/**
 * v-ovscroll: 피그마처럼 내용 위에 떠 있는 얇은 스크롤 막대(4px · 여린 회색).
 * 기본 스크롤바는 숨기고(자리를 차지하지 않아 행 칠이 창 끝까지 그대로), 목록에 마우스를 올렸거나 스크롤하는 동안에만 보여요.
 * 막대는 스크롤하지 않는 부모 안에 형제로 붙여요(스크롤 영역 안에 두면 내용과 함께 밀려 올라가요)
 */
const KEY = Symbol('ovscroll')
type St = { thumb: HTMLElement; ro: ResizeObserver; mo: MutationObserver; timer: number; hover: boolean; off: () => void; last: string }
type El = HTMLElement & { [KEY]?: St }
const MIN = 24
const INSET = 2

/** 막대 자리 재기(읽기만) — 숨김이면 null */
function measure(el: El): { h: number; top: number; left: number } | null {
  const sh = el.scrollHeight, ch = el.clientHeight
  if (sh <= ch + 1 || !ch) return null
  const track = ch - INSET * 2
  const th = Math.max(MIN, (track * ch) / sh)
  const p = el.scrollTop / (sh - ch)
  return { h: th, top: el.offsetTop + INSET + (track - th) * p, left: el.offsetLeft + el.offsetWidth - 4 - INSET }
}
/** 막대 그리기(쓰기만) — 값이 그대로면 손대지 않아요(손대면 브라우저가 배치를 다시 계산해요) */
function paint(el: El, m: ReturnType<typeof measure>) {
  const st = el[KEY]
  if (!st) return
  const key = m ? m.h + '|' + m.top + '|' + m.left : 'none'
  if (st.last === key) return
  st.last = key
  if (!m) { st.thumb.style.display = 'none'; return }
  st.thumb.style.display = ''
  st.thumb.style.height = m.h + 'px'
  st.thumb.style.top = m.top + 'px'
  st.thumb.style.left = m.left + 'px'
}
function update(el: El) {
  if (el[KEY]) paint(el, measure(el))
}
/**
 * 여러 목록의 막대를 한 프레임에 모아서: 모두 먼저 재고 → 그다음 그려요.
 * 하나씩 재고 그리면(읽기 · 쓰기 번갈아) 목록 수만큼 페이지 전체 배치를 다시 계산해서, 캔버스 확대 · 이동이 무거워졌어요
 */
const dirty = new Set<El>()
let raf = 0
function schedule(el: El) {
  dirty.add(el)
  if (!raf) raf = requestAnimationFrame(flush)
}
function flush() {
  raf = 0
  const els = [...dirty].filter((el) => el[KEY])
  dirty.clear()
  const ms = els.map(measure)
  els.forEach((el, i) => paint(el, ms[i]!))
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
      const ro = new ResizeObserver(() => schedule(el))
      ro.observe(el)
      const mo = new MutationObserver(() => schedule(el))
      mo.observe(el, { childList: true, subtree: true })
      el[KEY] = { thumb, ro, mo, timer: 0, hover: false, last: '', off: () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave) } }
      schedule(el)
    },
    updated(el: El) { schedule(el) },
    beforeUnmount(el: El) {
      const st = el[KEY]
      if (!st) return
      st.off(); st.ro.disconnect(); st.mo.disconnect(); clearTimeout(st.timer); st.thumb.remove(); dirty.delete(el)
      delete el[KEY]
    },
  })
})
