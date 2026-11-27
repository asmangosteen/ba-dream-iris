import type { CanvasBase, Drag } from './types'

/**
 * 끄는 동안 화면 가장자리 자동 이동(피그마와 같아요 — 사용자 요청 2026-11-27):
 * 옮기기 · 크기 바꾸기 · 그리기(도형 · 선 · 펜 핸들 · 연필) · 상자 고르기 · 점 편집 · 화면(프레임) 옮기기 · 이미지 놓기 등 캔버스에서 끄는 모든 일에서
 * 포인터가 보이는 캔버스 영역(양쪽 패널 · 위 탭 줄 안쪽)의 가장자리에 가까워지거나 밖으로 나가면, 끄는 자리가 계속 보이도록 화면이 그쪽으로 따라가요.
 * 속도는 늘 같아요(가장자리에 가깝든 · 밖으로 많이 당기든 · 어느 방향이든). 포인터를 멈춰 두어도 계속 따라가요(매 화면마다 다시 계산).
 *
 * 끄기 계산 중 일부는 "누른 자리(화면 좌표)에서 얼마나 움직였나"로 해요 → 화면이 Δ 만큼 움직이면 그 기준점도 Δ 만큼 옮겨서
 * 캔버스 위에서는 포인터가 그만큼 더 간 것과 같게 해요(놓을 때까지 레이어가 포인터에 붙어 있어요).
 */
const ZONE = 32 // 가장자리 안쪽 이만큼부터 따라가기 시작
/** 따라가는 속도(px/화면, 약 16ms) — 늘 같아요: 가장자리에 얼마나 가깝든 · 밖으로 얼마나 당기든 · 어느 방향(대각선 포함)이든(사용자 요청 2026-11-27) */
const SPEED = 12

/** 화면을 따라가지 않는 끄기: 화면 손 이동 자체 · 돌리기 */
const SKIP = new Set<Drag['kind']>(['pan', 'rotate', 'rotateScreen'])

export function useAutoPan(canvas: CanvasBase & { move: (e: PointerEvent) => void }) {
  const { el, vp, dragRef, move } = canvas
  let last: PointerEvent | null = null
  let raf = 0

  /** 지금 보이는 캔버스 영역(화면 좌표): 캔버스 상자에서 왼쪽 · 오른쪽 떠 있는 패널을 뺀 곳 */
  function area() {
    const r = el.value?.getBoundingClientRect()
    if (!r) return null
    let left = r.left, right = r.right
    const mid = (r.left + r.right) / 2
    for (const a of document.querySelectorAll<HTMLElement>('.editor aside.float')) {
      const b = a.getBoundingClientRect()
      if (!b.width || !b.height) continue
      if (b.right <= mid) left = Math.max(left, b.right)
      else if (b.left >= mid) right = Math.min(right, b.left)
    }
    return { left, right, top: r.top, bottom: r.bottom }
  }
  /** 가장자리 쪽 방향(-1 · 0 · 1)만 보고, 속도는 늘 SPEED(대각선도 같은 빠르기로 — 방향만 나눠요) */
  function velocity(e: PointerEvent) {
    const a = area()
    if (!a) return { vx: 0, vy: 0 }
    const x = e.clientX, y = e.clientY
    const sx = x > a.right - ZONE ? 1 : x < a.left + ZONE ? -1 : 0
    const sy = y > a.bottom - ZONE ? 1 : y < a.top + ZONE ? -1 : 0
    if (!sx && !sy) return { vx: 0, vy: 0 }
    const k = SPEED / Math.hypot(sx, sy)
    return { vx: sx * k, vy: sy * k }
  }
  /** 화면을 (dx, dy) 만큼 옮긴 뒤: 화면 좌표로 잡아 둔 기준점을 같이 옮겨요 */
  function shiftAnchors(d: Drag, dx: number, dy: number) {
    const g = d as Record<string, unknown>
    if (d.kind === 'vmarquee') { d.x0 += dx; d.y0 += dy; return }
    if (typeof g.sx === 'number' && typeof g.sy === 'number') { g.sx = (g.sx as number) + dx; g.sy = (g.sy as number) + dy }
  }
  function frame() {
    raf = 0
    const d = dragRef.current
    const e = last
    if (!d || !e || SKIP.has(d.kind) || (d as { moved?: boolean }).moved === false) return
    const { vx, vy } = velocity(e)
    if (!vx && !vy) return
    // 포인터가 오른쪽 가장자리면 캔버스 내용은 왼쪽으로(그쪽이 보이게)
    const dx = -vx, dy = -vy
    vp.value = { ...vp.value, x: vp.value.x + dx, y: vp.value.y + dy }
    shiftAnchors(d, dx, dy)
    move(e)
    raf = requestAnimationFrame(frame)
  }
  /** 캔버스 pointermove 마다(끄는 중일 때만 따라가요) */
  function track(e: PointerEvent) {
    const d = dragRef.current
    if (!d) { last = null; return }
    last = e
    if (!raf) raf = requestAnimationFrame(frame)
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = null }
  onBeforeUnmount(stop)
  return { track, stopAutoPan: stop, visibleArea: area }
}
export type CanvasAutoPan = ReturnType<typeof useAutoPan>
