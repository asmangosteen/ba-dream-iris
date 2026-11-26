import type { ScreenRow } from '~/composables/useEditor'
import { normalize } from '~/canvas/vector'
import { union, type Rect } from '~/canvas/geom'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasSnap } from './useCanvasSnap'

type APt = { x: number; y: number; i?: [number, number]; o?: [number, number] }

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick & CanvasSnap

/** 펜(P) — 피그마와 같아요: 누르면 점, 끌면 곡선 핸들, 첫 점을 누르면 닫기, Enter · Esc 로 끝내기 */
export function usePenTool(canvas: Ctx) {
  const {
    props, store, tool, vp, dragRef, guides, isNative, isCanvas, canvasDoc, rectOf, layerWorld, tick, selScreen, sx, sy, toWorld,
    frameAt, screenUnder, snapOff, snapPoint, pointTargets,
  } = canvas
  // ---------------------------------------------------------------------------
  // 펜(P) · 벡터 점 편집 — 피그마와 같아요: 누르면 점, 끌면 곡선 핸들, 첫 점을 누르면 닫기, Enter · Esc 로 끝내기
  // ---------------------------------------------------------------------------
  const pen = ref<{ sid: string; parentId: string | null; px: number; py: number; pts: APt[]; hover: [number, number] | null } | null>(null)
  const screenOrigin = (sid: string) => { const v = props.screens.find((x) => x.id === sid); return v && !isCanvas(v) ? { x: v.x, y: v.y } : { x: 0, y: 0 } }
  function penDown(e: PointerEvent, screen?: ScreenRow) {
    const w = toWorld(e.clientX, e.clientY)
    if (!pen.value) {
      const target = screen && isNative(screen) && !isCanvas(screen) ? screen : screenUnder(w.x, w.y) ?? canvasDoc.value
      if (!target) return
      const o = screenOrigin(target.id)
      const parentId = frameAt(target.id, w.x - o.x, w.y - o.y)
      const pp = parentId ? store.absPos(target.id, parentId) : { x: 0, y: 0 }
      pen.value = { sid: target.id, parentId, px: pp.x, py: pp.y, pts: [], hover: null }
    }
    const pn = pen.value
    const o = screenOrigin(pn.sid)
    const sp = snapPoint(w.x, w.y, pn.pts.map((q) => ({ x: q.x + o.x, y: q.y + o.y })), pointTargets(pn.sid), snapOff(e) || e.shiftKey)
    let lx = sp.x - o.x, ly = sp.y - o.y
    // ⇧: 앞 점에서 45° 단위(피그마와 같아요)
    const prev = pn.pts[pn.pts.length - 1]
    if (e.shiftKey && prev) ({ x: lx, y: ly } = snap45(prev.x, prev.y, lx, ly))
    const first = pn.pts[0]
    if (first && pn.pts.length >= 2 && Math.hypot(first.x - lx, first.y - ly) * vp.value.zoom < 8) { finishPen(true); return }
    pn.pts.push({ x: lx, y: ly })
    dragRef.current = { kind: 'pen', moved: false }
  }
  /** 앞 점에서 45° 단위로 맞춘 자리 */
  function snap45(ax: number, ay: number, bx: number, by: number) {
    const a = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4)
    const len = Math.hypot(bx - ax, by - ay)
    return { x: ax + Math.cos(a) * len, y: ay + Math.sin(a) * len }
  }
  function finishPen(closed: boolean) {
    const pn = pen.value
    pen.value = null
    guides.value = null
    if (!pn || pn.pts.length < 2) return
    const box = normalize([{ pts: pn.pts, closed }])
    const id = store.add(pn.sid, pn.parentId, { type: 'vector', x: Math.round((box.x - pn.px) * 100) / 100, y: Math.round((box.y - pn.py) * 100) / 100, w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100, vnet: box.vnet })
    // 다 그리면 이동 도구로, 그린 벡터를 골라 둬요(피그마와 같아요 — Enter 한 번 더 = 점 편집)
    store.selectLayer(pn.sid, id)
    tool.value = 'move'
  }
  /** 펜 미리보기(화면 좌표) */
  const penView = computed(() => {
    const pn = pen.value
    if (!pn) return null
    const o = screenOrigin(pn.sid)
    const P = (x: number, y: number) => `${sx(x + o.x)} ${sy(y + o.y)}`
    const box = { pts: pn.pts }
    let d = ''
    box.pts.forEach((q, k) => {
      if (!k) { d += `M${P(q.x, q.y)}`; return }
      const a = box.pts[k - 1]!
      d += a.o || q.i ? `C${P(...(a.o ?? [a.x, a.y]))} ${P(...(q.i ?? [q.x, q.y]))} ${P(q.x, q.y)}` : `L${P(q.x, q.y)}`
    })
    const last = pn.pts[pn.pts.length - 1]
    const rubber = last && pn.hover ? `M${P(last.x, last.y)}${last.o ? `C${P(...last.o)} ${P(...pn.hover)} ${P(...pn.hover)}` : `L${P(...pn.hover)}`}` : ''
    return { d, rubber, pts: pn.pts.map((q) => ({ a: { x: sx(q.x + o.x), y: sy(q.y + o.y) }, i: q.i ? { x: sx(q.i[0] + o.x), y: sy(q.i[1] + o.y) } : null, o: q.o ? { x: sx(q.o[0] + o.x), y: sy(q.o[1] + o.y) } : null })) }
  })
  /** 고른 것의 캔버스 좌표 상자(눈금자에 표시) */
  const selWorld = computed(() => {
    void tick.value
    // 펜으로 그리는 중: 지금까지 찍은 점(+ 마우스 자리)을 감싸는 상자를 눈금자에(피그마와 같아요)
    const pn = pen.value
    if (pn && (pn.pts.length || pn.hover)) {
      const o = screenOrigin(pn.sid)
      const ps = [...pn.pts.map((q) => [q.x, q.y] as const), ...(pn.hover ? [pn.hover] : [])]
      const xs = ps.map((q) => q[0] + o.x), ys = ps.map((q) => q[1] + o.y)
      const x = Math.min(...xs), y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    const s = selScreen.value
    if (!s) return null
    if (store.layerIds.value.length) { const bs = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b); return bs.length ? union(bs) : null }
    return isCanvas(s) ? null : rectOf(s)
  })
  return { pen, screenOrigin, penDown, snap45, finishPen, penView, selWorld }
}
export type CanvasPen = ReturnType<typeof usePenTool>
