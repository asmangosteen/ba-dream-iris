/**
 * 탭 · 세그먼트 컨트롤 · 버튼 묶음(.seg > .seg-item · .grp > .ib · 색 팝오버 탭 · 칠 종류 · 글자 팝오버 탭)에서 고른 칸(.on)이 바뀌면
 * 칸 바탕(::before)과 테두리(::after)가 이전 자리에서 새 자리로 스르륵 옮겨 가요(디자인 시스템 세그먼트 움직임 — 글자 색도 같은 시간 · 곡선으로, CSS).
 * 이전 칸과 폭이 다르면 폭도 함께 맞춰 가요(왼쪽 기준 scaleX). 동작 줄이기 설정이면 바로 바뀌어요.
 * 바탕을 따로 그리는 요소 없이 각 칸의 ::before · ::after 에 Web Animations(pseudoElement)를 걸어요 — Vue 가 그린 DOM 은 건드리지 않아요
 */
const ITEM = '.seg > .seg-item, .seg > .seg-b, .grp > .ib, .pp-tabs > .pp-tab, .pp-types > .pp-type, .td-tabs > .td-tab'
/** 바드림 디자인 시스템 SegmentedControl 과 같은 움직임: --bd-motion-slide(.2s) · --bd-motion-slide-easing(cubic-bezier(.32, .72, 0, 1)), 동작 줄이기면 0 */
function motion() {
  const cs = getComputedStyle(document.documentElement)
  // Iris 는 디자인 시스템보다 조금 빠르게(--iris-slide 160ms) — 동작 줄이기면 디자인 시스템 값(0)을 따라요
  const d = (cs.getPropertyValue('--bd-motion-slide').trim() === '0ms' ? '0ms' : cs.getPropertyValue('--iris-slide').trim()) || cs.getPropertyValue('--bd-motion-slide').trim()
  const ms = d.endsWith('ms') ? parseFloat(d) : d.endsWith('s') ? parseFloat(d) * 1000 : 200
  return { ms: Number.isFinite(ms) ? ms : 200, ease: cs.getPropertyValue('--bd-motion-slide-easing').trim() || 'cubic-bezier(.32, .72, 0, 1)' }
}

export default defineNuxtPlugin(() => {
  const hasOn = (v: string | null) => !!v && /(^|\s)on(\s|$)/.test(v)

  function slide(from: Element, to: HTMLElement) {
    const a = from.getBoundingClientRect()
    const b = to.getBoundingClientRect()
    if (!b.width || !a.width) return
    const dx = a.left - b.left
    const dy = a.top - b.top
    const sx = a.width / b.width
    const sy = a.height / b.height
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    const sc = Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01 ? '' : ` scale(${sx}, ${sy})`
    const frames: Keyframe[] = [
      { transform: `translate(${dx}px, ${dy}px)${sc}`, transformOrigin: '0 0' },
      { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: '0 0' },
    ]
    const { ms, ease } = motion()
    if (!ms) return
    for (const pseudoElement of ['::before', '::after']) {
      try { to.animate(frames, { duration: ms, easing: ease, pseudoElement }) } catch { /* pseudoElement 를 못 쓰는 브라우저는 그냥 바로 바뀌어요 */ }
    }
  }

  const obs = new MutationObserver((list) => {
    const gained: HTMLElement[] = []
    const lost: Element[] = []
    for (const m of list) {
      const el = m.target as HTMLElement
      if (!(el instanceof HTMLElement) || !el.matches(ITEM)) continue
      const was = hasOn(m.oldValue)
      const now = el.classList.contains('on')
      if (now && !was) gained.push(el)
      else if (was && !now) lost.push(el)
    }
    for (const to of gained) {
      const from = lost.find((x) => x.parentElement === to.parentElement)
      if (from) slide(from, to)
    }
  })
  obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
})
