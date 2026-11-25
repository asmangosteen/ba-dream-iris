/**
 * 수치 칸 앞쪽(아이콘 · 글자)을 좌우로 끌어 값 바꾸기(피그마와 같아요).
 * - 마우스를 올리면 ↔ 커서, 1px = 1 (⇧ 를 누르면 10씩)
 * - 칸마다 있는 ↑↓ 처리(여러 레이어는 각자 · 토큰 칩은 연결을 풀고)를 그대로 써요. 그게 없는 칸은 숫자를 바꿔 change 를 보내요
 * - 끄는 동안의 변경은 실행 취소 한 번으로 돌아가요(onStart · onEnd 로 hold · release)
 * - ↑↓ 처리가 없는 숫자 칸도 ↑↓ 로 1씩(⇧ 10씩) 바뀌어요
 */
const NUM = /^\s*-?\d*\.?\d+/
/** 칸 전체가 숫자(+ % · ° · px · x)일 때만 — 검색칸 등은 빼요 */
const FULL = /^\s*-?\d*\.?\d+\s*(%|°|px|x)?\s*$/

/** 끌 수 있는 앞쪽 요소면 그 칸 */
function fieldOf(t: EventTarget | null): HTMLElement | null {
  if (!(t instanceof Element)) return null
  const fld = t.closest<HTMLElement>('.fld')
  if (!fld || fld.closest('[data-noscrub]')) return null
  const first = fld.firstElementChild
  if (!first || !first.contains(t) || first.matches('input, button, select, textarea, .tchip-w')) return null
  return targetOf(fld) ? fld : null
}
/** 값을 받는 요소: 숫자 입력칸, 없으면 토큰 칩 */
function targetOf(fld: HTMLElement): HTMLElement | null {
  const input = fld.querySelector<HTMLInputElement>('input:not([disabled]):not([readonly]):not(.tchip-caret)')
  if (input && input.type !== 'search' && (input.inputMode === 'numeric' || input.inputMode === 'decimal' || FULL.test(input.value) || input.placeholder === 'Mixed' || input.placeholder === tr('Mixed'))) return input
  return fld.querySelector<HTMLElement>('.tchip')
}

function stepOnce(fld: HTMLElement, up: boolean, shift: boolean) {
  const t = targetOf(fld)
  if (!t) return
  const ev = new KeyboardEvent('keydown', { key: up ? 'ArrowUp' : 'ArrowDown', code: up ? 'ArrowUp' : 'ArrowDown', shiftKey: shift, bubbles: true, cancelable: true })
  t.dispatchEvent(ev)
  if (ev.defaultPrevented || !(t instanceof HTMLInputElement)) return
  // ↑↓ 처리가 없는 칸: 숫자를 직접 바꿔 change
  const m = NUM.exec(t.value)
  if (!m) return
  const n = parseFloat(m[0]) + (up ? 1 : -1) * (shift ? 10 : 1)
  t.value = String(Math.round(n * 100) / 100) + t.value.slice(m[0].length)
  t.dispatchEvent(new Event('input', { bubbles: true }))
  t.dispatchEvent(new Event('change', { bubbles: true }))
}

export function useScrub(onStart: () => void, onEnd: () => void) {
  let fld: HTMLElement | null = null
  let startX = 0, acc = 0, moving = false
  function down(e: PointerEvent) {
    if (e.button !== 0) return
    const f = fieldOf(e.target)
    if (!f) return
    e.preventDefault() // 글자 선택 · 칸 포커스 막기
    fld = f
    startX = e.clientX
    acc = 0
    moving = false
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
  }
  function move(e: PointerEvent) {
    if (!fld) return
    if (!moving) {
      if (Math.abs(e.clientX - startX) < 2) return
      moving = true
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      document.documentElement.classList.add('scrubbing')
      onStart()
      acc = e.clientX - startX
    } else acc += e.movementX || 0
    const n = Math.trunc(acc)
    acc -= n
    for (let i = 0; i < Math.abs(n); i++) stepOnce(fld, n > 0, e.shiftKey)
  }
  function up() {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    if (moving) {
      document.documentElement.classList.remove('scrubbing')
      onEnd()
      // 끌기 뒤 따라오는 click(라벨 → 칸 포커스)은 버려요
      const kill = (ev: Event) => { ev.preventDefault(); ev.stopPropagation() }
      window.addEventListener('click', kill, true)
      setTimeout(() => window.removeEventListener('click', kill, true), 0)
    } else if (fld && fld.tagName !== 'LABEL') {
      // 그냥 누른 것: 칸으로 들어가요(라벨 칸은 브라우저가 알아서)
      const t = targetOf(fld)
      if (t instanceof HTMLInputElement) { t.focus(); t.select() } else t?.focus()
    }
    fld = null
    moving = false
  }
  // 끌 수 있는 앞쪽에 마우스를 올리면 ↔ 커서(data-scrub)
  function over(e: PointerEvent) {
    const f = fieldOf(e.target)
    if (f) f.firstElementChild?.setAttribute('data-scrub', '')
  }
  // ↑↓ 처리가 따로 없는 숫자 칸도 1씩(⇧ 10씩) — 칸마다 있는 처리가 먼저 받고, 안 받은(막지 않은) 것만 여기서
  function arrowKey(e: KeyboardEvent) {
    if (!e.isTrusted || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const t = e.target
    if (!(t instanceof HTMLInputElement) || t.type === 'search' || t.readOnly || t.disabled) return
    if (!(t.inputMode === 'numeric' || t.inputMode === 'decimal' || FULL.test(t.value))) return
    const m = NUM.exec(t.value)
    if (!m) return
    e.preventDefault()
    const n = parseFloat(m[0]) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
    t.value = String(Math.round(n * 100) / 100) + t.value.slice(m[0].length)
    const label = t.getAttribute('aria-label'), r = t.getBoundingClientRect()
    t.dispatchEvent(new Event('input', { bubbles: true }))
    t.dispatchEvent(new Event('change', { bubbles: true }))
    t.select()
    // 값이 바뀌며 칸이 다시 그려지면(포커스가 빠지면) 같은 자리의 같은 칸으로 돌아가요 — 연달아 눌러도 이어지게
    requestAnimationFrame(() => {
      if (t.isConnected && document.activeElement === t) return
      if (!label) return
      let best: HTMLInputElement | null = null, bd = Infinity
      for (const c of document.querySelectorAll<HTMLInputElement>('input[aria-label]')) {
        if (c.getAttribute('aria-label') !== label) continue
        const q = c.getBoundingClientRect(), dd = Math.abs(q.x - r.x) + Math.abs(q.y - r.y)
        if (dd < bd) { bd = dd; best = c }
      }
      if (best && bd < 40) { best.focus(); best.select() }
    })
  }
  onMounted(() => { document.addEventListener('pointerdown', down, true); document.addEventListener('pointerover', over, true); document.addEventListener('keydown', arrowKey) })
  onBeforeUnmount(() => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerover', over, true); document.removeEventListener('keydown', arrowKey) })
}
