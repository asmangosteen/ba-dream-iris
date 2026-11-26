import type { Rect } from '~/canvas/geom'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'

type Ctx = CanvasBase & CanvasGeom

/** 보는 자리(이동 · 확대 · 맞춰 보기) · 휠 · 핀치, 움직이는 중 표시 */
export function useCanvasViewport(canvas: Ctx) {
  const { props, store, el, vp, rectOf, layerWorld } = canvas
  /** 줌 범위: 피그마와 같아요(2% ~ 25600%) */
  const MIN = 0.02
  const MAX = 256
  const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z))

  function toWorld(clientX: number, clientY: number) {
    const r = el.value!.getBoundingClientRect()
    return { x: (clientX - r.left - vp.value.x) / vp.value.zoom, y: (clientY - r.top - vp.value.y) / vp.value.zoom }
  }
  function zoomAt(z: number, cx?: number, cy?: number) {
    const r = el.value?.getBoundingClientRect()
    const px = cx ?? (r ? r.width / 2 : 0)
    const py = cy ?? (r ? r.height / 2 : 0)
    const nz = clamp(z)
    const k = nz / vp.value.zoom
    vp.value = { zoom: nz, x: px - (px - vp.value.x) * k, y: py - (py - vp.value.y) * k }
  }
  /** 패널에 가리지 않는 가운데 영역(캔버스 좌표가 아닌 화면 좌표) */
  function viewArea() {
    const r = el.value?.getBoundingClientRect()
    if (!r) return null
    return { left: 288, right: r.width - 312, top: 72, bottom: r.height - 72 }
  }
  /** 그 영역에 맞춘 자리 · 배율(바꾸지는 않아요) */
  function fitTarget(x0: number, y0: number, x1: number, y1: number, maxZoom = 1) {
    const area = viewArea()
    if (!area) return null
    const w = Math.max(1, area.right - area.left), h = Math.max(1, area.bottom - area.top)
    const zoom = clamp(Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0), maxZoom) * 0.92)
    return { zoom, x: area.left + (w - (x1 - x0) * zoom) / 2 - x0 * zoom, y: area.top + (h - (y1 - y0) * zoom) / 2 - y0 * zoom }
  }
  /** 패널에 가리지 않는 가운데 영역에 맞추기 */
  function fitRect(x0: number, y0: number, x1: number, y1: number, maxZoom = 1) {
    const t = fitTarget(x0, y0, x1, y1, maxZoom)
    if (t) vp.value = t
  }
  /** 보는 자리를 스르륵 옮기기(320ms · ease-out). 동작 줄이기면 바로. 새로 부르면 하던 움직임은 멈추고 이어서 */
  let vpAnim = 0
  function animateVp(to: { x: number; y: number; zoom: number }, ms = 320) {
    cancelAnimationFrame(vpAnim)
    if (ms <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { vp.value = to; return }
    const from = { ...vp.value }
    const t0 = performance.now()
    // 배율은 로그로 섞어야 확대 · 축소가 고르게 보여요. 화면 가운데의 캔버스 점을 기준으로 섞어요
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      const z = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e)
      const area = viewArea()
      const cx = area ? (area.left + area.right) / 2 : 0, cy = area ? (area.top + area.bottom) / 2 : 0
      const w0 = { x: (cx - from.x) / from.zoom, y: (cy - from.y) / from.zoom }, w1 = { x: (cx - to.x) / to.zoom, y: (cy - to.y) / to.zoom }
      const wx = w0.x + (w1.x - w0.x) * e, wy = w0.y + (w1.y - w0.y) * e
      vp.value = { zoom: z, x: cx - wx * z, y: cy - wy * z }
      if (k < 1) vpAnim = requestAnimationFrame(step)
      else vp.value = to
    }
    vpAnim = requestAnimationFrame(step)
  }
  /**
   * 문서 REQ 로 그 항목 보여 주기(누름 · 마우스 올림 공통) — 배율은 절대 바꾸지 않아요(화면 크기 유지).
   * - 프레임 안 항목(ids): 가운데 영역(양쪽 패널 사이, 가장자리 24 안쪽)에 다 보이면 그대로, 아니면 그 항목이 가운데 오게 스르륵 옮겨요
   * - 화면(프레임) 단위(ids 없음 · 못 찾음): 이미 절반 넘게 보이면 그대로, 아니면 화면 가운데로 옮겨요
   */
  /**
   * 문서 REQ 를 눌렀을 때(사용자 요청 2026-11-26): 그 항목(레이어들, 없으면 화면)을 가운데 영역 한가운데로, 크게 확대해 보여 줘요.
   * 항목이 가운데 영역의 60%(화면 단위는 90%)를 채우는 배율 — 레이어는 최대 400%, 화면은 최대 100%. 스르륵 움직여요
   */
  function focusOn(sid: string, ids: string[]) {
    const s = props.screens.find((v) => v.id === sid)
    const area = viewArea()
    if (!s || !area) return
    const boxes = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    const rs = boxes.length ? boxes : [rectOf(s)]
    const x0 = Math.min(...rs.map((b) => b.x)), y0 = Math.min(...rs.map((b) => b.y)), x1 = Math.max(...rs.map((b) => b.x + b.w)), y1 = Math.max(...rs.map((b) => b.y + b.h))
    const aw = area.right - area.left, ah = area.bottom - area.top
    const fill = boxes.length ? 0.6 : 0.9
    const z = Math.min(boxes.length ? 4 : 1, Math.max(0.02, Math.min((aw * fill) / Math.max(1, x1 - x0), (ah * fill) / Math.max(1, y1 - y0))))
    const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2
    animateVp({ zoom: z, x: cx - ((x0 + x1) / 2) * z, y: cy - ((y0 + y1) / 2) * z }, 420)
  }
  function reveal(sid: string, ids: string[]) {
    const s = props.screens.find((v) => v.id === sid)
    const area = viewArea()
    if (!s || !area) return
    const boxes = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    const rs = boxes.length ? boxes : [rectOf(s)]
    const x0 = Math.min(...rs.map((b) => b.x)), y0 = Math.min(...rs.map((b) => b.y)), x1 = Math.max(...rs.map((b) => b.x + b.w)), y1 = Math.max(...rs.map((b) => b.y + b.h))
    const { zoom: z, x: vx, y: vy } = vp.value
    const sx0 = x0 * z + vx, sy0 = y0 * z + vy, sx1 = x1 * z + vx, sy1 = y1 * z + vy
    const M = 24
    if (boxes.length) {
      if (sx0 >= area.left + M && sx1 <= area.right - M && sy0 >= area.top + M && sy1 <= area.bottom - M) return
    } else {
      // 화면: 보이는 부분이 (화면 · 가운데 영역 중 작은 쪽의) 절반을 넘으면 그대로
      const ox = Math.max(0, Math.min(sx1, area.right) - Math.max(sx0, area.left)), oy = Math.max(0, Math.min(sy1, area.bottom) - Math.max(sy0, area.top))
      const need = Math.min((sx1 - sx0) * (sy1 - sy0), (area.right - area.left) * (area.bottom - area.top)) * 0.5
      if (ox * oy >= need) return
    }
    const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2
    animateVp({ zoom: z, x: cx - ((x0 + x1) / 2) * z, y: cy - ((y0 + y1) / 2) * z })
  }
  function fit(ids?: string[]) {
    const list = ids?.length ? props.screens.filter((s) => ids.includes(s.id)) : props.screens
    const r = el.value?.getBoundingClientRect()
    if (!r) return
    if (!list.length) { vp.value = { zoom: 0.5, x: 352, y: 104 }; return }
    fitRect(Math.min(...list.map((s) => s.x)), Math.min(...list.map((s) => s.y)), Math.max(...list.map((s) => s.x + s.width)), Math.max(...list.map((s) => s.y + s.height)))
  }
  function onWheel(e: WheelEvent) {
    if ((e.target as HTMLElement).closest?.('[contenteditable="true"]')) return
    e.preventDefault()
    const r = el.value!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) zoomAt(vp.value.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top)
    else {
      const k = e.deltaMode ? 16 : 1
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
      vp.value = { ...vp.value, x: vp.value.x - dx * k, y: vp.value.y - dy * k }
    }
  }
  /** 고른 것으로 확대(maxZoom: 가장 크게 — 기본 400%) */
  function fitSelection(maxZoom = 4) {
    const sid = store.screenId.value
    const s = props.screens.find((v) => v.id === sid)
    if (!s) return
    const boxes = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b) => !!b)
    if (!boxes.length) return fit([s.id])
    fitRect(Math.min(...boxes.map((b) => b!.x)), Math.min(...boxes.map((b) => b!.y)), Math.max(...boxes.map((b) => b!.x + b!.w)), Math.max(...boxes.map((b) => b!.y + b!.h)), maxZoom)
  }

  let gz = 1
  const onGestureStart = (e: Event) => { e.preventDefault(); gz = vp.value.zoom }
  const onGestureChange = (e: Event) => {
    e.preventDefault()
    const g = e as Event & { scale: number; clientX: number; clientY: number }
    const r = el.value!.getBoundingClientRect()
    zoomAt(gz * g.scale, g.clientX - r.left, g.clientY - r.top)
  }
  /** 확대 · 이동 중인지: 멈춘 뒤 160ms 가 지나면 false → 브라우저가 지금 배율로 다시 그려 흐림이 없어요 */
  const moving = ref(false)
  /**
   * 확대 · 축소 중인지. 이때는 캔버스를 그림 한 장으로 키우지 않고(will-change 끔) 매 프레임 지금 배율로 다시 그려요 —
   * 그림으로 키우면 글자 · 선이 흐려졌다가 멈출 때 '툭' 선명해져요(피그마는 확대 중에도 선명). 옮기기만 할 때는 배율이 같아 흐림이 없으니 그림으로 빠르게
   */
  const zooming = ref(false)
  let movingTimer: ReturnType<typeof setTimeout> | undefined
  watch(() => [vp.value.x, vp.value.y, vp.value.zoom] as const, (now, before) => {
    moving.value = true
    if (now[2] !== before?.[2]) zooming.value = true
    clearTimeout(movingTimer)
    movingTimer = setTimeout(() => { moving.value = false; zooming.value = false }, 160)
  })
  return { toWorld, zoomAt, focusOn, reveal, fit, onWheel, fitSelection, onGestureStart, onGestureChange, moving, zooming }
}
export type CanvasViewport = ReturnType<typeof useCanvasViewport>
