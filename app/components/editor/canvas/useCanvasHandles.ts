import { radiiOf } from '~/canvas/paint'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasHover } from './useCanvasHover'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasHover

/** 손잡이: 모서리 둥글기(Corner radius) · 오토 레이아웃 간격 · 안쪽 여백 끌기 */
export function useCanvasHandles(canvas: Ctx) {
  const { store, el, tool, vp, multi, guides, isNative, tick, selScreen, selFrame, single, moving, hover, ptr } = canvas
  /**
   * 모서리 원형 손잡이(피그마와 같아요): 고른 사각형 · 프레임 · 이미지에 마우스를 올리면 모서리 안쪽에 — 끌면 Corner radius,
   * ⌥ 를 누르고 끌면 그 모서리만. 끄는 동안 'Radius n' 표시, 실행 취소 한 번
   */
  const RAD_TYPES = new Set(['rect', 'frame', 'image'])
  const radDrag = ref<{ x: number; y: number; v: number } | null>(null)
  /** 화면 좌표의 마우스(ptr)가 돌린 선택 상자 안인지(margin 만큼 바깥도) */
  function ptrInBox(g: { cx: number; cy: number; w: number; h: number; angle: number }, margin = 0) {
    const p = ptr.value
    if (!p) return false
    const z = vp.value.zoom, cx = g.cx * z + vp.value.x, cy = g.cy * z + vp.value.y
    const a = (-(g.angle || 0) * Math.PI) / 180, dx = p.x - cx, dy = p.y - cy
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
    return Math.abs(lx) <= (g.w * z) / 2 + margin && Math.abs(ly) <= (g.h * z) / 2 + margin
  }
  const radHandles = computed(() => {
    void tick.value
    const sg = single.value
    const s = selScreen.value
    if (!sg || !s || sg.locked || store.editing.value || tool.value !== 'move') return null
    const n = store.node(s.id, sg.id)
    if (!n || !RAD_TYPES.has(n.type)) return null
    const z = vp.value.zoom, W = sg.w * z, H = sg.h * z
    if (W < 40 || H < 40) return null
    // 마우스가 선택 상자 안(바깥 8px 여유 포함)이면 보여요 — 손잡이 위로 올라가도 사라지지 않게(깜박이다 레이어가 잡히던 문제)
    if (!radDrag.value && !(hover.value?.sid === s.id && hover.value?.id === sg.id) && !ptrInBox(sg, 8)) return null
    const r = radiiOf(n.style)
    return (['nw', 'ne', 'se', 'sw'] as const).map((c, i) => {
      const off = Math.min(Math.max(12, (r[i] ?? 0) * z), W / 2, H / 2)
      return { c: i, x: c === 'nw' || c === 'sw' ? off : W - off, y: c === 'nw' || c === 'ne' ? off : H - off }
    })
  })
  function startRadius(e: PointerEvent, c: number) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const sg = single.value
    const s = selScreen.value
    const n = sg && s ? store.node(s.id, sg.id) : undefined
    if (!sg || !s || !n) return
    const sid = s.id, id = n.id, z = vp.value.zoom
    const max = Math.min(n.w, n.h) / 2, r0 = Math.min(max, radiiOf(n.style)[c] ?? 0)
    // 끝까지 둥글면 손잡이가 짧은 변 가운데로 모여 겹쳐요 — 그때는 긴 쪽 방향으로만 재요(겹친 다른 모서리 손잡이를 잡아도 끌리게)
    const pinned = r0 >= max - 0.5
    const sx0 = e.clientX, sy0 = e.clientY, t = (-sg.angle * Math.PI) / 180
    const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][c]!
    store.hold(sid)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx0, dy = ev.clientY - sy0
      const lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t)
      const along = pinned ? (n.w >= n.h ? lx * inward[0]! : ly * inward[1]!) : (lx * inward[0]! + ly * inward[1]!) / 2
      const v = Math.round(Math.max(0, Math.min(max, r0 + along / z)))
      store.update(sid, [id], (nn) => {
        if (ev.altKey) { const rr = [...radiiOf(nn.style)] as [number, number, number, number]; rr[c] = v; return { style: { ...nn.style, radii: rr } } }
        return { style: { ...nn.style, radius: v, radii: undefined } }
      })
      radDrag.value = { x: ev.clientX, y: ev.clientY, v }
    }
    const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); store.release(sid); radDrag.value = null }
    radDrag.value = { x: e.clientX, y: e.clientY, v: r0 }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
  }
  /**
   * 화면(맨 위 프레임)도 모서리 둥글기 손잡이(피그마와 같아요): 고른 화면 안에 마우스가 있으면 네 모서리 안쪽에 동그라미.
   * 끌면 네 모서리 함께(⌥ 는 한 모서리), 실행취소 한 번
   */
  const screenRad = computed(() => {
    void tick.value
    const f = selFrame.value
    if (!f || multi.value.length || store.layerIds.value.length || !isNative(f) || store.editing.value || tool.value !== 'move') return null
    const z = vp.value.zoom, W = f.width * z, H = f.height * z
    if (W < 40 || H < 40) return null
    const g = { cx: f.x + f.width / 2, cy: f.y + f.height / 2, w: f.width, h: f.height, angle: 0 }
    if (!radDrag.value && !ptrInBox(g, 8)) return null
    const r = radiiOf(store.doc(f.id).frame ?? {})
    return (['nw', 'ne', 'se', 'sw'] as const).map((c, i) => {
      const off = Math.min(Math.max(12, (r[i] ?? 0) * z), W / 2, H / 2)
      return { c: i, x: c === 'nw' || c === 'sw' ? off : W - off, y: c === 'nw' || c === 'ne' ? off : H - off }
    })
  })
  function startScreenRadius(e: PointerEvent, c: number) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const f = selFrame.value
    if (!f) return
    const sid = f.id, z = vp.value.zoom
    const max = Math.min(f.width, f.height) / 2, r0 = Math.min(max, radiiOf(store.doc(sid).frame ?? {})[c] ?? 0)
    const pinned = r0 >= max - 0.5
    const sx0 = e.clientX, sy0 = e.clientY
    const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]][c]!
    store.hold(sid)
    const move = (ev: PointerEvent) => {
      const lx = ev.clientX - sx0, ly = ev.clientY - sy0
      const along = pinned ? (f.width >= f.height ? lx * inward[0]! : ly * inward[1]!) : (lx * inward[0]! + ly * inward[1]!) / 2
      const v = Math.round(Math.max(0, Math.min(max, r0 + along / z)))
      if (ev.altKey) { const rr = [...radiiOf(store.doc(sid).frame ?? {})] as [number, number, number, number]; rr[c] = v; store.frameStyle(sid, { radii: rr }) }
      else store.frameStyle(sid, { radius: v, radii: undefined })
      radDrag.value = { x: ev.clientX, y: ev.clientY, v }
    }
    const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); store.release(sid); radDrag.value = null }
    radDrag.value = { x: e.clientX, y: e.clientY, v: r0 }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
  }
  const radLabel = computed(() => { const r = radDrag.value, h = el.value?.getBoundingClientRect(); return r && h ? { left: r.x - h.left + 'px', top: r.y - h.top + 22 + 'px' } : null })
  /** 고른 오토 레이아웃 프레임의 간격: 마우스를 간격 위에 올리면 모든 간격을 분홍 빗금으로 */
  const gapBands = computed(() => {
    void tick.value
    void vp.value
    const sg = single.value
    const s = selScreen.value
    const host = el.value
    if (!sg || !s || !host || sg.angle || moving.value || guides.value) return []
    const n = store.node(s.id, sg.id)
    const lay = n?.style.layout
    if (!lay || lay.wrap) return []
    const fel = host.querySelector(`[data-screen="${s.id}"] [data-layer="${sg.id}"]`) as HTMLElement | null
    if (!fel) return []
    const hr = host.getBoundingClientRect()
    const rel = (r: DOMRect) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height })
    const f = rel(fel.getBoundingClientRect())
    const d = store.doc(s.id)
    const kids = (n.children ?? [])
      .filter((id) => d.nodes[id] && !d.nodes[id]!.hidden && !d.nodes[id]!.absolute)
      .map((id) => fel.querySelector(`:scope [data-layer="${id}"]`) as HTMLElement | null)
      .filter((k): k is HTMLElement => !!k)
      .map((k) => rel(k.getBoundingClientRect()))
    const v = lay.mode === 'vertical'
    kids.sort((a, b) => (v ? a.y - b.y : a.x - b.x))
    // 간격 빗금은 안쪽 여백을 뺀 내용 폭(높이)만큼 — 양옆 여백 빗금(파랑)과 겹치지 않아야 여백 손잡이를 잡을 수 있어요
    const z = vp.value.zoom
    const [pt, pr, pb, pl] = lay.padding.map((p) => p * z) as [number, number, number, number]
    const ix = f.x + pl, iw = Math.max(0, f.w - pl - pr), iy = f.y + pt, ih = Math.max(0, f.h - pt - pb)
    const out: { left: string; top: string; width: string; height: string; v: boolean }[] = []
    for (let i = 0; i + 1 < kids.length; i++) {
      const a = kids[i]!, b = kids[i + 1]!
      const s0 = v ? a.y + a.h : a.x + a.w, s1 = v ? b.y : b.x
      if (s1 - s0 < 1) continue
      out.push(v
        ? { left: ix + 'px', top: s0 + 'px', width: iw + 'px', height: s1 - s0 + 'px', v }
        : { left: s0 + 'px', top: iy + 'px', width: s1 - s0 + 'px', height: ih + 'px', v })
    }
    return out
  })
  /** 고른 오토 레이아웃 프레임의 안쪽 여백: 여백 위에 마우스를 올리면 파란 빗금(피그마 padding 표시) */
  const padBands = computed(() => {
    void tick.value
    void vp.value
    const sg = single.value
    const s = selScreen.value
    const host = el.value
    if (!sg || !s || !host || sg.angle || moving.value || guides.value) return []
    const lay = store.node(s.id, sg.id)?.style.layout
    if (!lay) return []
    const fel = host.querySelector(`[data-screen="${s.id}"] [data-layer="${sg.id}"]`) as HTMLElement | null
    if (!fel) return []
    const hr = host.getBoundingClientRect()
    const r = fel.getBoundingClientRect()
    const x = r.left - hr.left, y = r.top - hr.top, z = vp.value.zoom
    const [pt, pr, pb, pl] = lay.padding.map((p) => p * z) as [number, number, number, number]
    const out: { left: string; top: string; width: string; height: string; side: number }[] = []
    const add = (side: number, l: number, t: number, w: number, h: number) => { if (w >= 1 && h >= 1) out.push({ left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px', side }) }
    add(0, x, y, r.width, pt)
    add(2, x, y + r.height - pb, r.width, pb)
    add(3, x, y + pt, pl, r.height - pt - pb)
    add(1, x + r.width - pr, y + pt, pr, r.height - pt - pb)
    return out
  })
  const padHot = computed(() => {
    const p = ptr.value
    return !!p && padBands.value.some((b) => {
      const x = parseFloat(b.left), y = parseFloat(b.top)
      return p.x >= x && p.x <= x + parseFloat(b.width) && p.y >= y && p.y <= y + parseFloat(b.height)
    })
  })
  const gapHot = computed(() => {
    const p = ptr.value
    return !!p && gapBands.value.some((b) => {
      const x = parseFloat(b.left), y = parseFloat(b.top)
      return p.x >= x && p.x <= x + parseFloat(b.width) && p.y >= y && p.y <= y + parseFloat(b.height)
    })
  })
  /**
   * 간격 · 안쪽 여백 손잡이(빗금 가운데 '-')를 끌어 값 바꾸기(피그마와 같아요).
   * 여백: ⌥ 는 마주 보는 쪽도 같이, ⇧ 는 네 쪽 모두. 끄는 동안 값 표시, 실행 취소 한 번
   */
  const bandDrag = ref<{ kind: 'gap' | 'pad'; value: number; x: number; y: number } | null>(null)
  function startBand(e: PointerEvent, kind: 'gap' | 'pad', side = 0) {
    const sg = single.value
    const s = selScreen.value
    const lay = sg && s ? store.node(s.id, sg.id)?.style.layout : undefined
    if (!sg || !s || !lay || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const z = vp.value.zoom
    const v = lay.mode === 'vertical'
    const g0 = kind === 'gap' ? (typeof lay.gap === 'number' ? lay.gap : parseFloat(gapBands.value[0]?.[v ? 'height' : 'width'] ?? '0') / z) : lay.padding[side]!
    const sx = e.clientX, sy = e.clientY, sid = s.id, id = sg.id
    const ns = kind === 'gap' ? v : side === 0 || side === 2
    store.hold(sid)
    document.documentElement.classList.add(ns ? 'band-ns' : 'band-ew')
    bandDrag.value = { kind, value: Math.round(g0), x: e.clientX, y: e.clientY }
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z
      const d = kind === 'gap' ? (v ? dy : dx) : side === 0 ? dy : side === 2 ? -dy : side === 3 ? dx : -dx
      const val = Math.max(0, Math.round(g0 + d))
      store.update(sid, [id], (n) => {
        const L = n.style.layout!
        if (kind === 'gap') return { style: { ...n.style, layout: { ...L, gap: val } } }
        const p = [...L.padding] as [number, number, number, number]
        if (ev.shiftKey) p.fill(val)
        else { p[side] = val; if (ev.altKey) p[(side + 2) % 4] = val }
        return { style: { ...n.style, layout: { ...L, padding: p } } }
      })
      bandDrag.value = { kind, value: val, x: ev.clientX, y: ev.clientY }
    }
    const up = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      document.documentElement.classList.remove('band-ns', 'band-ew')
      store.release(sid)
      bandDrag.value = null
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
  }
  const bandLabel = computed(() => {
    const b = bandDrag.value
    const r = el.value?.getBoundingClientRect()
    return b && r ? { left: b.x - r.left + 'px', top: b.y - r.top - 18 + 'px' } : null
  })
  return {
    radDrag, radHandles, startRadius, screenRad, startScreenRadius, radLabel, gapBands, padBands, padHot, gapHot, bandDrag,
    startBand, bandLabel,
  }
}
export type CanvasHandles = ReturnType<typeof useCanvasHandles>
