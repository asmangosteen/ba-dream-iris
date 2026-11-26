import type { ScreenRow } from '~/composables/useEditor'
import { normAngle, gridBands, type LayoutGrid } from '~/canvas/schema'
import type { GuideChange, GuideFrame } from '~/components/editor/CanvasRulers.vue'
import { alignGuides, handleDir, resizeLocal, snapAxis, union, type Guides, type Handle, type Rect } from '~/canvas/geom'
import type { CanvasBase, Targets } from './types'
import type { CanvasGeom } from './useCanvasGeom'

type Ctx = CanvasBase & CanvasGeom

/** 스냅(자석): 옮기기 · 크기 · 그리기 · 점이 붙는 기준, 가이드선 */
export function useCanvasSnap(canvas: Ctx) {
  const { props, emit, store, vp, multi, isNative, isCanvas, realScreens, rectOf, layerWorld, selFrame } = canvas
  /** 스냅 기준: 같은 부모의 다른 레이어 + 부모(프레임 · 화면). 캔버스 위 레이어는 화면들도 */
  function snapTargets(s: ScreenRow, ids: string[]): Targets {
    const d = store.doc(s.id)
    const pid = d.nodes[ids[0]!]?.parentId ?? null
    const sibIds = (pid ? d.nodes[pid]?.children ?? [] : d.rootIds).filter((id) => !ids.includes(id) && d.nodes[id] && !d.nodes[id]!.hidden)
    const sibs = sibIds.map((id) => layerWorld(s, id)!).filter(Boolean)
    const parents: Rect[] = []
    if (pid) { const p = layerWorld(s, pid); if (p) parents.push(p) }
    else if (isCanvas(s)) sibs.push(...realScreens.value.map(rectOf))
    else parents.push(rectOf(s))
    sibs.push(...guideRects())
    return { sibs, parents }
  }
  /** 가이드선도 붙는 대상(폭 0 인 긴 상자) — 페이지 가이드선은 캔버스 끝까지, 프레임 가이드선은 그 프레임 위에서만 */
  const guideRects = (): Rect[] => [
    ...(props.guides?.x ?? []).map((x) => ({ x, y: -1e6, w: 0, h: 2e6 })),
    ...(props.guides?.y ?? []).map((y) => ({ x: -1e6, y, w: 2e6, h: 0 })),
    ...guideFrames.value.flatMap((f) => [...f.g.x.map((x) => ({ x: f.x + x, y: f.y, w: 0, h: f.h })), ...f.g.y.map((y) => ({ x: f.x, y: f.y + y, w: f.w, h: 0 }))]),
  ]
  /** 가이드선을 놓을 수 있는 화면들(피그마 프레임 가이드) — 위치 · 크기 · 그 프레임의 가이드선 */
  const guideFrames = computed<GuideFrame[]>(() => realScreens.value.filter(isNative).map((s) => {
    const g = store.doc(s.id).frame?.guides
    return { sid: s.id, x: s.x, y: s.y, w: s.width, h: s.height, g: { x: g?.x ?? [], y: g?.y ?? [] } }
  }))
  /**
   * 가이드선을 끌 때 붙는 자리(캔버스 좌표): 화면 · 레이어의 가장자리 · 가운데, 레이아웃 그리드 칸(Columns · Rows)의 양 끝,
   * 다른 가이드선. axis 'x' = 세로 가이드선(x 값)
   */
  function guideSnaps(axis: 'x' | 'y'): number[] {
    const out = new Set<number>()
    const add = (r: Rect) => { const [a, l] = axis === 'x' ? [r.x, r.w] : [r.y, r.h]; out.add(a); out.add(a + l / 2); out.add(a + l) }
    const grid = (ox: number, oy: number, w: number, h: number, grids?: LayoutGrid[]) => {
      for (const b of gridBands(grids, w, h)) { if (axis === 'x' ? b.h === h && b.w < w : b.w === w && b.h < h) { out.add((axis === 'x' ? ox + b.x : oy + b.y)); out.add(axis === 'x' ? ox + b.x + b.w : oy + b.y + b.h) } }
    }
    let n = 0
    for (const s of props.screens) {
      if (!isCanvas(s)) { add(rectOf(s)); if (isNative(s)) grid(s.x, s.y, s.width, s.height, store.doc(s.id).frame?.grids) }
      if (!isNative(s)) continue
      const d = store.doc(s.id)
      for (const id of Object.keys(d.nodes)) {
        const nd = d.nodes[id]!
        if (nd.hidden || n++ > 3000) continue
        const r = layerWorld(s, id)
        if (!r) continue
        add(r)
        if (nd.style.grids?.length) grid(r.x, r.y, r.w, r.h, nd.style.grids)
      }
    }
    for (const v of props.guides?.[axis] ?? []) out.add(v)
    return [...out]
  }
  /** 고른 프레임들(프레임 자체를 골랐을 때) — 그 가이드선은 파랑 + 밖으로 점선 */
  const guideActive = computed(() => [...new Set([...(selFrame.value && !store.layerIds.value.length ? [selFrame.value.id] : []), ...multi.value])])
  /** 가이드선이 바뀌면: 페이지 가이드선은 페이지 설정으로, 프레임 가이드선은 그 프레임 모양으로(실행 취소 한 번) */
  function onGuides(c: GuideChange) {
    if (c.frames) store.batch(() => { for (const [sid, g] of Object.entries(c.frames!)) store.frameStyle(sid, { guides: g.x.length || g.y.length ? g : undefined }) })
    if (c.page) emit('guides', c.page)
  }
  const snapOff = (e: PointerEvent) => e.metaKey || e.ctrlKey
  const thr = () => 6 / vp.value.zoom
  /**
   * 점 하나 스마트 가이드(펜 · 점 편집): 같은 경로의 다른 점, 주변 레이어 · 부모의 가장자리 · 가운데에 가로 · 세로로 붙고 점선을 보여요.
   * pts · rects 는 캔버스 좌표. 반환: 붙은 자리 + 가이드
   */
  function snapPoint(wx: number, wy: number, pts: { x: number; y: number }[], rects: Rect[], off = false): { x: number; y: number; g: Guides | null } {
    if (off) return { x: wx, y: wy, g: null }
    const t = thr()
    const xs: { v: number; y0: number; y1: number }[] = [], ys: { v: number; x0: number; x1: number }[] = []
    for (const p of pts) { xs.push({ v: p.x, y0: p.y, y1: p.y }); ys.push({ v: p.y, x0: p.x, x1: p.x }) }
    for (const r of rects) {
      for (const v of [r.x, r.x + r.w / 2, r.x + r.w]) xs.push({ v, y0: r.y, y1: r.y + r.h })
      for (const v of [r.y, r.y + r.h / 2, r.y + r.h]) ys.push({ v, x0: r.x, x1: r.x + r.w })
    }
    const bx = xs.reduce<typeof xs[0] | null>((b, c) => (Math.abs(c.v - wx) <= t && (!b || Math.abs(c.v - wx) < Math.abs(b.v - wx)) ? c : b), null)
    const by = ys.reduce<typeof ys[0] | null>((b, c) => (Math.abs(c.v - wy) <= t && (!b || Math.abs(c.v - wy) < Math.abs(b.v - wy)) ? c : b), null)
    const x = bx ? bx.v : wx, y = by ? by.v : wy
    const lines: Guides['lines'] = []
    if (bx) lines.push({ x1: x, y1: Math.min(bx.y0, y), x2: x, y2: Math.max(bx.y1, y), dash: true })
    if (by) lines.push({ x1: Math.min(by.x0, x), y1: y, x2: Math.max(by.x1, x), y2: y, dash: true })
    return { x, y, g: lines.length ? { lines, labels: [] } : null }
  }
  /** 펜 · 점 편집이 붙는 주변: 그 화면(또는 부모 프레임) 안 레이어들 · 화면 자체 */
  function pointTargets(sid: string, skip?: string): Rect[] {
    const s = props.screens.find((v) => v.id === sid)
    if (!s) return []
    const d = store.doc(sid)
    const rs = Object.keys(d.nodes).filter((id) => id !== skip && !d.nodes[id]!.hidden).slice(0, 200).map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    if (!isCanvas(s)) rs.push(rectOf(s))
    return [...rs, ...guideRects()]
  }

  /**
   * 크기 조절 때 붙는 안쪽 기준(피그마와 같아요): 안 레이어들의 가장자리 · 가운데, 오토 레이아웃이면 내용 + 안쪽 여백(Hug 크기)까지 —
   * 끝을 내용 끝에 '착' 붙일 수 있어요
   */
  function innerTargets(s: ScreenRow, ids: string[], pad?: [number, number, number, number] | null): Rect[] {
    const rs = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    if (!rs.length) return rs
    if (pad) { const u = union(rs); rs.push({ x: u.x - pad[3], y: u.y - pad[0], w: u.w + pad[1] + pad[3], h: u.h + pad[0] + pad[2] }) }
    return rs
  }
  /**
   * 크기 바꾸기 공통: 상자 자신의 좌표(angle 만큼 돈)에서 손잡이를 (du, dv) 끌었을 때 새 상자.
   * 돌지 않은 상자면 형제 · 부모 가장자리에 붙이고 가이드를 그려요
   */
  /** natural: 이미지 칠(Fill) 사각형의 원래 사진 크기 — 그 폭 · 높이 근처(화면 6px)면 붙어요(어느 손잡이든) */
  function resizeBox(g: { cx: number; cy: number; w: number; h: number; angle: number }, handle: Handle, dxw: number, dyw: number, e: PointerEvent, ratio: boolean, targets: Rect[], natural?: { w: number; h: number }) {
    const t = (g.angle * Math.PI) / 180
    const cos = Math.cos(t), sin = Math.sin(t)
    let du = dxw * cos + dyw * sin, dv = -dxw * sin + dyw * cos
    const keep = ratio || e.shiftKey
    const center = e.altKey
    const { sx, sy } = handleDir(handle)
    const flat = Math.abs(normAngle(g.angle)) < 0.01
    const boxOf = (r: { w: number; h: number; ox: number; oy: number }): Rect => ({ x: g.cx + r.ox - r.w / 2, y: g.cy + r.oy - r.h / 2, w: r.w, h: r.h })
    let guide: Guides | null = null
    if (flat && !snapOff(e)) {
      const b = boxOf(resizeLocal(g.w, g.h, handle, du, dv, keep, center))
      const xs = targets.flatMap((r) => [r.x, r.x + r.w / 2, r.x + r.w]), ys = targets.flatMap((r) => [r.y, r.y + r.h / 2, r.y + r.h])
      const ex = sx ? (sx > 0 ? b.x + b.w : b.x) : null, ey = sy ? (sy > 0 ? b.y + b.h : b.y) : null
      let ddx = ex === null ? null : snapAxis([ex], xs, thr()), ddy = ey === null ? null : snapAxis([ey], ys, thr())
      // 비율을 지키면 한 축만 붙여요(가까운 쪽)
      if (keep && ddx !== null && ddy !== null) { if (Math.abs(ddx) <= Math.abs(ddy)) ddy = null; else ddx = null }
      if (keep && sx && sy) { if (ddx !== null) dv = 0; if (ddy !== null) du = 0 }
      if (ddx !== null) du += ddx
      if (ddy !== null) dv += ddy
      const fb = boxOf(resizeLocal(g.w, g.h, handle, du, dv, keep, center))
      guide = alignGuides(fb, targets, { x: ex === null ? [] : [sx > 0 ? fb.x + fb.w : fb.x], y: ey === null ? [] : [sy > 0 ? fb.y + fb.h : fb.y] })
    }
    const r = resizeLocal(g.w, g.h, handle, du, dv, keep, center)
    // 원래 사진 크기에 붙기: 비율을 지키면 폭 · 높이 중 가까운 쪽으로 함께, 아니면 축마다 따로
    let rw = r.w, rh = r.h
    if (natural && !snapOff(e)) {
      const t0 = thr()
      const nx = sx !== 0 && Math.abs(rw - natural.w) < t0, ny = sy !== 0 && Math.abs(rh - natural.h) < t0
      if (keep) {
        const k = nx && (!ny || Math.abs(rw - natural.w) <= Math.abs(rh - natural.h)) ? natural.w / rw : ny ? natural.h / rh : 1
        rw *= k; rh *= k
        if (k !== 1) guide = null
      } else {
        if (nx) { rw = natural.w; guide = null }
        if (ny) { rh = natural.h; guide = null }
      }
    }
    // 정수 크기로(픽셀 그리드를 끄면 소수 둘째 자리까지) 맞춘 뒤 붙어 있는 쪽이 그대로이도록 가운데를 다시 계산
    const w = Math.max(store.pixelSnap.value ? 1 : 0.01, store.snapPx(rw)), h = Math.max(store.pixelSnap.value ? 1 : 0.01, store.snapPx(rh))
    const ox = center || !sx ? 0 : (sx * (w - g.w)) / 2, oy = center || !sy ? 0 : (sy * (h - g.h)) / 2
    return { w, h, cx: g.cx + ox * cos - oy * sin, cy: g.cy + ox * sin + oy * cos, guide }
  }
  return {
    snapTargets, guideRects, guideFrames, guideSnaps, guideActive, onGuides, snapOff, thr, snapPoint, pointTargets, innerTargets,
    resizeBox,
  }
}
export type CanvasSnap = ReturnType<typeof useCanvasSnap>
