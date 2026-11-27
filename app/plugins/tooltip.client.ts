/* 피그마 UI3 툴팁 — 검은 말풍선 + 단축키(옅은 흰색), 화살표가 버튼을 가리킵니다.
   규격(피그마 측정값, PRD/07_FIGMA_UI_REFERENCE.md): 높이 24 · 안쪽 4 8 · 이름과 단축키 사이 8 · 화살표 12×6 · 버튼에서 6px
   동작: 처음엔 1초 머물러야 뜨고, 하나가 떠 있던 직후(0.5초 안)에 옆 버튼으로 옮기면 바로 떠요. 나타나고 사라질 때 애니메이션 없음.
   쓰는 법: data-tip="이름" (+ data-tip-key="⌘K", data-tip-at="top|bottom|left|right")
   편집기(.editor) 안의 title 속성은 자동으로 이 툴팁으로 바꿔요(브라우저 기본 툴팁은 꺼짐). 끝의 "(V)" · "⇧H" 같은 단축키는 따로 떼어 보여요. */
const DELAY = 1000
const WARM = 500
const GAP = 6
const KEY_RE = /^(?:[⌃⌥⇧⌘]+\S+|[A-Z0-9]|F\d{1,2}|Esc|⎋|⌫|Space|Enter|↩|↵|\[|\]|\\)$/

function splitTitle(t: string): { label: string; key?: string } {
  const p = t.match(/^(.*\S)\s*\(([^()]+)\)\s*$/)
  if (p && KEY_RE.test(p[2]!.replace(/\s+/g, ''))) return { label: p[1]!, key: p[2]!.replace(/\s+/g, '') }
  const i = t.lastIndexOf(' ')
  if (i > 0) {
    const k = t.slice(i + 1)
    if (KEY_RE.test(k)) return { label: t.slice(0, i), key: k }
  }
  return { label: t }
}

export default defineNuxtPlugin(() => {
  const tip = document.createElement('div')
  tip.className = 'sq iris-tip'
  tip.setAttribute('role', 'tooltip')
  tip.innerHTML = '<span class="iris-tip-t"></span><span class="iris-tip-k"></span><i class="iris-tip-a"></i>'
  tip.hidden = true
  document.body.appendChild(tip)
  const tEl = tip.querySelector('.iris-tip-t') as HTMLElement
  const kEl = tip.querySelector('.iris-tip-k') as HTMLElement
  const aEl = tip.querySelector('.iris-tip-a') as HTMLElement

  let target: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let hiddenAt = 0

  const find = (n: EventTarget | null): HTMLElement | null => {
    const el = n instanceof Element ? n : null
    if (!el) return null
    const t = el.closest('[data-tip], .editor [title]') as HTMLElement | null
    if (!t) return null
    if (t.hasAttribute('title') && !t.hasAttribute('data-tip')) {
      const { label, key } = splitTitle(t.getAttribute('title') ?? '')
      t.setAttribute('data-tip', label)
      if (key) t.setAttribute('data-tip-key', key)
      t.removeAttribute('title')
    }
    return t.getAttribute('data-tip') ? t : null
  }

  function place() {
    if (!target) return
    const r = target.getBoundingClientRect()
    const tw = tip.offsetWidth, th = tip.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    let at = (target.getAttribute('data-tip-at') as 'top' | 'bottom' | 'left' | 'right' | null) ?? 'bottom'
    // 화면 밖으로 나가면 반대쪽으로
    if (at === 'bottom' && r.bottom + GAP + th > vh) at = 'top'
    else if (at === 'top' && r.top - GAP - th < 0) at = 'bottom'
    else if (at === 'right' && r.right + GAP + tw > vw) at = 'left'
    else if (at === 'left' && r.left - GAP - tw < 0) at = 'right'
    let x: number, y: number
    if (at === 'top' || at === 'bottom') {
      x = Math.round(Math.min(Math.max(4, r.left + r.width / 2 - tw / 2), vw - tw - 4))
      y = Math.round(at === 'top' ? r.top - GAP - th : r.bottom + GAP)
      aEl.style.left = `${Math.round(r.left + r.width / 2 - x - 6)}px`
      aEl.style.top = ''
    } else {
      y = Math.round(Math.min(Math.max(4, r.top + r.height / 2 - th / 2), vh - th - 4))
      x = Math.round(at === 'left' ? r.left - GAP - tw : r.right + GAP)
      aEl.style.top = `${Math.round(r.top + r.height / 2 - y - 6)}px`
      aEl.style.left = ''
    }
    tip.dataset.at = at
    tip.style.transform = `translate(${x}px, ${y}px)`
  }

  function show() {
    if (!target || !target.isConnected) return hide()
    tEl.textContent = target.getAttribute('data-tip') ?? ''
    const k = target.getAttribute('data-tip-key') ?? ''
    kEl.textContent = k
    kEl.hidden = !k
    tip.hidden = false
    place()
  }
  function hide() {
    clearTimeout(timer)
    if (!tip.hidden) hiddenAt = performance.now()
    tip.hidden = true
    target = null
  }

  /**
   * 스크롤하는 동안 · 직후엔 툴팁을 쉬어요: 목록이 마우스 아래로 지나가면 줄마다 pointerover 가 생겨서,
   * '바로 뜨기(warm)'와 스크롤 숨기기가 번갈아 검은 말풍선이 깜빡였어요(사용자 요청 2026-11-27)
   */
  let scrolledAt = 0
  const QUIET = 400
  /** 목록 줄(변수 · 스타일 목록 등)은 옆 줄로 옮겨도 바로 뜨지 않고 매번 1초 머물러야 떠요 — 훑어 내려갈 때 말풍선이 줄마다 따라오지 않게 */
  const isRow = (el: HTMLElement) => !!el.closest('[role="option"], .menu-item, .st-row')
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return
    const t = find(e.target)
    if (t === target) return
    if (performance.now() - scrolledAt < QUIET) { hide(); hiddenAt = 0; return }
    const warm = (!tip.hidden || performance.now() - hiddenAt < WARM) && !(t && isRow(t))
    hide()
    // 이 버튼이 연 메뉴가 떠 있으면 툴팁은 쉬어요(접기 버튼처럼 메뉴 없이 aria-expanded 만 쓰는 건 그대로 보여요)
    if (!t || (t.getAttribute('aria-expanded') === 'true' && document.querySelector('[role=menu]'))) return
    target = t
    if (warm) show()
    else timer = setTimeout(show, DELAY)
  }, true)
  document.addEventListener('pointerdown', () => { hide(); hiddenAt = 0 }, true)
  document.addEventListener('keydown', () => hide(), true)
  window.addEventListener('blur', hide)
  window.addEventListener('scroll', () => { hide(); hiddenAt = 0; scrolledAt = performance.now() }, true)
})
