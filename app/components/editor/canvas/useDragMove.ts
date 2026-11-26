import { descendants, isGroupNode, normAngle, type LayerNode, type LayerStyle } from '~/canvas/schema'
import { denorm, normalize } from '~/canvas/vector'
import { constrain, slotIndex } from '~/canvas/layout'
import { vk, type VKey } from '~/canvas/vsel'
import { apply, applyVec, invert, snapMove } from '~/canvas/geom'
import { GHOST_KEY, ZOOM_KEY } from '~/canvas/ghost'
import { scaledStyle } from '~/canvas/scale'
import type { CanvasBase, Drag, SpaceMove } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasSnap } from './useCanvasSnap'
import type { CanvasDrop } from './useCanvasDrop'
import type { CanvasHover } from './useCanvasHover'
import type { CanvasPen } from './usePenTool'
import type { CanvasVector } from './useVectorEdit'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick & CanvasSnap & CanvasDrop & CanvasHover & CanvasPen & CanvasVector

/** 끄는 동안: 옮기기 · 크기 · 돌리기 · 그리기 · 상자 고르기 */
export function useDragMove(canvas: Ctx) {
  const {
    props, emit, store, el, tool, vp, multi, dragRef, space, draft, draftType, mixGhosts, draftPts, guides, isNative, isCanvas,
    realScreens, canvasDoc, rectOf, worldMat, parentWorld, layerWorld, toWorld, keepMix, frameAt, screenUnder, deepHits,
    snapTargets, guideRects, snapOff, thr, snapPoint, pointTargets, resizeBox, setDropLine, altOn, trackHover, dragHover,
    dragTarget, pen, screenOrigin, snap45, vedit, mirror, vmarq, vhandles,
  } = canvas
  /**
   * 끌어 그린 상자(피그마와 같아요): ⇧ 정비율, ⌥ 누른 점이 가운데
   */
  function boxFrom(ax: number, ay: number, bx: number, by: number, square: boolean, center: boolean) {
    let dx = bx - ax, dy = by - ay
    if (square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m }
    if (center) return { x: ax - Math.abs(dx), y: ay - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 }
    return { x: Math.min(ax, ax + dx), y: Math.min(ay, ay + dy), w: Math.abs(dx), h: Math.abs(dy) }
  }
  /** 그리는 중 Space 로 시작점 옮기기: 누르고 있는 동안 시작점이 포인터를 따라가요 */
  function spaceShift(dg: { sp?: SpaceMove }, start: { x: number; y: number }, px: number, py: number): { x: number; y: number } {
    if (!space.value) { dg.sp = undefined; return start }
    if (!dg.sp) dg.sp = { x: px, y: py, ox: start.x, oy: start.y }
    return { x: dg.sp.ox + px - dg.sp.x, y: dg.sp.oy + py - dg.sp.y }
  }

  /**
   * 끄는 중 부모 바꾸기(피그마와 같아요): 포인터가 프레임 밖으로 나가면 바깥 프레임(또는 화면)으로, 다른 프레임 위면 그 안으로.
   * 화면 밖(다른 화면 · 캔버스)으로 나가면 놓을 때 옮겨요(out)
   */
  const dragOut = ref<string | null>(null)
  const dragOutIds = ref<string[]>([])
  /**
   * 화면 밖으로 끄는 레이어는 화면 자르기와 상관없이 맨 위에 따로 그려요(원래 자리는 숨김).
   * 화면은 계속 잘린 채라 같은 화면의 다른 레이어(넘친 이미지 등)가 함께 딸려 나와 보이지 않아요
   */
  /** 끌어 들어갈 다른 화면: 놓기 전에도 그 화면 모양대로 잘라 보여요(놓은 뒤와 똑같이 — 피그마와 같아요) */
  const dropScreen = ref<string | null>(null)
  const ghost = computed(() => {
    const sid = dragOut.value
    const s = sid ? props.screens.find((v) => v.id === sid) : null
    if (!sid || !s) return null
    const d = store.doc(sid)
    const items = dragOutIds.value.filter((id) => d.nodes[id]).map((id) => {
      const p = d.nodes[id]!.parentId
      const o = p ? store.absPos(sid, p) : { x: 0, y: 0 }
      return { id, x: o.x, y: o.y }
    })
    const t = dropScreen.value ? props.screens.find((v) => v.id === dropScreen.value) : null
    const tf = t ? store.doc(t.id).frame : undefined
    const clip = t && tf?.clip !== false
      ? { x: t.x, y: t.y, w: t.width, h: t.height, r: tf?.radii ? tf.radii.map((r) => r + 'px').join(' ') : tf?.radius ? tf.radius + 'px' : undefined }
      : null
    return { sid, x: s.x ?? 0, y: s.y ?? 0, items, clip }
  })
  provide(GHOST_KEY, computed(() => (ghost.value ? { sid: ghost.value.sid, ids: new Set(dragOutIds.value) } : null)))
  provide(ZOOM_KEY, computed(() => vp.value.zoom))
  function retarget(dg: Extract<Drag, { kind: 'layers' }>, e: PointerEvent, dx: number, dy: number) {
    const sc = props.screens.find((v) => v.id === dg.sid)
    if (!sc || dg.carry.length) return
    // 끄는 중 Space: 프레임 안팎으로 넣고 빼지 않고 그 자리 부모 그대로 옮기기(피그마와 같아요)
    if (space.value) { setDropLine(null); return }
    const w = toWorld(e.clientX, e.clientY)
    const under = screenUnder(w.x, w.y)
    const out = isCanvas(sc) ? !!under : under?.id !== sc.id
    dg.out = out
    const d = store.doc(sc.id)
    const roots = dg.ids.filter((id) => !dg.ids.some((o) => o !== id && descendants(d, o).includes(id)))
    // 화면 밖으로 끌거나(캔버스 · 다른 화면), 캔버스 위 레이어를 화면 안으로 끌면 맨 위 고스트 층에 그려요
    dragOut.value = out ? sc.id : null
    dragOutIds.value = dragOut.value ? roots : []
    dropScreen.value = out && under && under.id !== sc.id ? under.id : null
    // 들어갈 프레임 · 화면에 파란 테두리(피그마와 같아요): 다른 화면으로 나가면 그 화면, 같은 화면이면 부모가 바뀔 때 새 부모
    if (out) { setDropLine(under ? rectOf(under) : null); return }
    const ex = new Set(roots.flatMap((id) => descendants(d, id)))
    const target = frameAt(sc.id, w.x - sc.x, w.y - sc.y, ex)
    // 그룹 · 불리언 안의 레이어는 같은 프레임 안에서 끄는 동안 그대로 그 안에(피그마와 같아요)
    const frameOf = (pid: string | null | undefined) => { let q = pid ?? null; while (q && (isGroupNode(d.nodes[q]) || d.nodes[q]?.type === 'boolean')) q = d.nodes[q]!.parentId ?? null; return q }
    setDropLine(target !== frameOf(dg.parent0) ? (target ? layerWorld(sc, target) : isCanvas(sc) ? null : rectOf(sc)) : null)
    const moving = roots.filter((id) => d.nodes[id] && d.nodes[id]!.parentId !== target && frameOf(d.nodes[id]!.parentId) !== target)
    if (moving.length) store.reparent(sc.id, moving, target)
    for (const id of moving) {
      const n = d.nodes[id]
      if (!n) continue
      dg.inv[id] = invert(parentWorld(sc, id))
      const v = applyVec(dg.inv[id]!, dx, dy)
      dg.orig[id] = { x: n.x - v.x, y: n.y - v.y }
    }
    // 오토 레이아웃 안: 포인터 자리로 순서 바꾸기(자리는 레이아웃이 정해요)
    const p = target ? d.nodes[target] : null
    if (p?.style.layout) {
      const flow = roots.filter((id) => d.nodes[id]?.parentId === target && !d.nodes[id]!.absolute)
      if (flow.length) {
        const pp = store.absPos(sc.id, p.id)
        // 자리: 포인터 대신 끌고 있는 것의 가운데로 — ⌥ 복제본이 원본과 자리를 바꿨다 돌아오지 않고 원본 바로 아래에서 시작해요
        const c = dg.b0 ? { x: dg.b0.x + dg.b0.w / 2 + dx, y: dg.b0.y + dg.b0.h / 2 + dy } : w
        const idx = slotIndex(d, p, { x: c.x - sc.x - pp.x, y: c.y - sc.y - pp.y }, new Set(flow))
        const rest = (p.children ?? []).filter((c) => !flow.includes(c))
        const next = [...rest.slice(0, idx), ...flow, ...rest.slice(idx)]
        if (next.join() !== (p.children ?? []).join()) p.children = next
      }
    }
    store.relayout(sc.id)
  }

  /** 스케일 도구(K): 끌기 전 모습(sub0)에서 k 배로 — 안쪽 레이어 자리 · 크기와 선 · 글자 · 모서리 · 효과까지 */
  function scaleSubtree(sid: string, sub0: string, k: number, x: number, y: number) {
    const d = store.doc(sid)
    const orig = JSON.parse(sub0) as LayerNode[]
    const sc = (v?: number) => (v === undefined ? v : Math.round(v * k * 100) / 100)
    orig.forEach((o, i) => {
      const n = d.nodes[o.id]
      if (!n) return
      n.style = scaledStyle(o.style, k) // app/canvas/scale.ts — 오른쪽 Scale 칸과 같은 계산
      if (o.type === 'instance') n.instScale = Math.round((o.instScale ?? 1) * k * 10000) / 10000 // 컴포넌트는 안까지 확대해서
      if (i === 0) { n.x = x; n.y = y; return }
      n.x = sc(o.x)!; n.y = sc(o.y)!; n.w = Math.max(1, sc(o.w)!); n.h = Math.max(1, sc(o.h)!)
    })
  }

  function move(e: PointerEvent) {
    const drag = dragRef.current
    // ⌥ 를 누른 채 옮기기 · 크기 바꾸기(⇧⌥ 가운데 기준 포함): 포인터 아래 레이어 · 부모와의 간격을 계속 보여요
    if (drag && (drag.kind === 'layers' || drag.kind === 'resize' || drag.kind === 'resizeMany')) {
      if (altOn.value !== e.altKey) altOn.value = e.altKey
      dragHover.value = e.altKey ? dragTarget(e, drag.sid) : null
    }
    if (!drag) {
      trackHover(e)
      if (pen.value) {
        const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pen.value.sid)
        const sp = snapPoint(w.x, w.y, pen.value.pts.map((q) => ({ x: q.x + o.x, y: q.y + o.y })), pointTargets(pen.value.sid), snapOff(e) || e.shiftKey)
        const last = pen.value.pts[pen.value.pts.length - 1]
        const hp = e.shiftKey && last ? snap45(last.x, last.y, sp.x - o.x, sp.y - o.y) : { x: sp.x - o.x, y: sp.y - o.y }
        pen.value.hover = [hp.x, hp.y]
        guides.value = e.shiftKey ? null : sp.g
      }
      return
    }
    if (drag.kind === 'pen') {
      // 끌면 마지막 점의 곡선 핸들(반대쪽은 대칭)
      const pn = pen.value
      const q = pn?.pts[pn.pts.length - 1]
      if (!pn || !q) return
      const w = toWorld(e.clientX, e.clientY), o = screenOrigin(pn.sid)
      let hx = w.x - o.x, hy = w.y - o.y
      if (!drag.moved && Math.hypot(hx - q.x, hy - q.y) * vp.value.zoom < 3) return
      drag.moved = true
      // ⇧ 핸들 45° 단위, ⌥ 반대쪽 핸들은 그대로 두고 이쪽만(피그마와 같아요 — 꺾인 곡선)
      if (e.shiftKey) ({ x: hx, y: hy } = snap45(q.x, q.y, hx, hy))
      q.o = [hx, hy]
      if (!e.altKey) q.i = [2 * q.x - hx, 2 * q.y - hy]
      pn.hover = [hx, hy]
      return
    }
    if (drag.kind === 'vmarquee') {
      const box = el.value!.getBoundingClientRect()
      const x = e.clientX - box.left, y = e.clientY - box.top
      if (!drag.moved && Math.abs(x - drag.x0) + Math.abs(y - drag.y0) < 4) return
      drag.moved = true
      const r = { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) }
      vmarq.value = r
      const ve = vedit.value
      if (!ve) return
      const inside = (vhandles.value ?? []).filter((q) => q.a.x >= r.x && q.a.x <= r.x + r.w && q.a.y >= r.y && q.a.y <= r.y + r.h).map((q) => [q.pi, q.qi] as VKey)
      const all = new Map<string, VKey>()
      for (const k of [...drag.base, ...inside]) all.set(vk(k), k)
      ve.pts = [...all.values()]
      ve.segs = []
      ve.sel = ve.pts[ve.pts.length - 1] ?? null
      return
    }
    if (drag.kind === 'vpt') {
      const dx = (e.clientX - drag.sx) / vp.value.zoom, dy = (e.clientY - drag.sy) / vp.value.zoom
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1 / vp.value.zoom) return
      drag.moved = true
      // 도형 꼭짓점을 처음 끄는 순간: 벡터로 바꾸고, 그 꼭짓점(둥근 모서리면 모서리 양 끝 점들)을 함께 옮겨요
      if (drag.virtual) {
        const vts = drag.virtual
        drag.virtual = undefined
        // 사각형: 꼭짓점 네 개 그대로 벡터로(모서리 둥글기는 꼭짓점 r 로 — 피그마와 같아요). 다른 도형: 곡선 점으로 바꿔요
        const corner = store.toCornerVector(drag.sid, drag.id)
        if (!corner) store.flatten(drag.sid, [drag.id])
        const n2 = store.node(drag.sid, drag.id)
        if (!n2?.vnet) return
        drag.abs0 = denorm(n2.vnet, n2.w, n2.h)
        drag.x0 = n2.x; drag.y0 = n2.y
        const near = (q: { x: number; y: number }, vt: { cx: number; cy: number; r: number }) => Math.abs(q.x - vt.cx) <= vt.r + 0.5 && Math.abs(q.y - vt.cy) <= vt.r + 0.5
        const g: [number, number][] = []
        // 누른 꼭짓점(맨 앞)의 점이 먼저 오게
        if (corner) for (const vt of vts) g.push([0, vt.qi])
        else for (const vt of vts) drag.abs0.forEach((p, pi) => p.pts.forEach((q, qi) => { if (near(q, vt) && !g.some((k) => k[0] === pi && k[1] === qi)) g.push([pi, qi]) }))
        if (!g.length) return
        drag.group = g
        drag.pi = g[0]![0]; drag.qi = g[0]![1]
        if (vedit.value) { vedit.value.sel = [drag.pi, drag.qi]; vedit.value.pts = g; vedit.value.segs = [] }
        drag.collapse = undefined
      }
      // ⇧: 점은 가로 · 세로로만(피그마와 같아요)
      const lockA = e.shiftKey && drag.part === 'a' ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null
      const v = applyVec(drag.inv, lockA === 'x' ? 0 : dx, lockA === 'y' ? 0 : dy)
      // 스마트 가이드: 옮기는 점이 같은 경로의 다른 점 · 주변 레이어에 붙어요(⌘ 누르면 끔)
      if (drag.part === 'a') {
        const dsid = drag.sid
        const sc = props.screens.find((x) => x.id === dsid)
        const q0 = drag.abs0[drag.pi]?.pts[drag.qi]
        if (sc && q0) {
          const m = worldMat(sc, drag.id)
          const moving = new Set((drag.group ?? [[drag.pi, drag.qi]]).map(([a, b]) => a + ':' + b))
          const others = drag.abs0.flatMap((p, pi) => p.pts.filter((_, qi) => !moving.has(pi + ':' + qi)).map((q) => { const w = apply(m, q.x, q.y); return { x: w.x, y: w.y } }))
          const cur = apply(m, q0.x + v.x, q0.y + v.y)
          const sp = snapPoint(cur.x, cur.y, others, pointTargets(drag.sid, drag.id), snapOff(e) || !!lockA)
          const back = applyVec(drag.inv, sp.x - cur.x, sp.y - cur.y)
          v.x += back.x; v.y += back.y
          guides.value = sp.g
        }
      }
      const abs = JSON.parse(JSON.stringify(drag.abs0)) as typeof drag.abs0
      const mv = (p?: [number, number]) => (p ? [p[0] + v.x, p[1] + v.y] as [number, number] : p)
      for (const [gi, gq] of drag.group ?? []) { const r = abs[gi]?.pts[gq]; if (r) { r.x += v.x; r.y += v.y; r.i = mv(r.i); r.o = mv(r.o) } }
      const q = abs[drag.pi]?.pts[drag.qi]
      if (!q) return
      if (drag.group) { /* 이미 위에서 옮겼어요 */ } else if (drag.part === 'a') { q.x += v.x; q.y += v.y; q.i = mv(q.i); q.o = mv(q.o) }
      else {
        const h = drag.part === 'i' ? 'i' : 'o', other = h === 'i' ? 'o' : 'i'
        q[h] = mv(q[h])
        // 반대쪽 핸들은 대칭으로(⌥ 를 누르면 따로)
        // Mirroring(패널): both = 각도 · 길이 대칭, angle = 각도만(반대쪽 길이 그대로), none = 따로. ⌥ 를 누르면 늘 따로
        if (q[other] && !e.altKey && mirror.value !== 'none') {
          if (mirror.value === 'both') q[other] = [2 * q.x - q[h]![0], 2 * q.y - q[h]![1]]
          else {
            const len = Math.hypot(q[other]![0] - q.x, q[other]![1] - q.y), dx = q.x - q[h]![0], dy = q.y - q[h]![1], dl = Math.hypot(dx, dy) || 1
            q[other] = [q.x + (dx / dl) * len, q.y + (dy / dl) * len]
          }
        }
      }
      const box = normalize(abs)
      const n = store.node(drag.sid, drag.id)
      if (n) Object.assign(n, { x: Math.round((drag.x0 + box.x) * 100) / 100, y: Math.round((drag.y0 + box.y) * 100) / 100, w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100, vnet: box.vnet })
      return
    }
    const z = vp.value.zoom
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
      vp.value = { ...vp.value, x: drag.vx + dx, y: drag.vy + dy }
    } else if (drag.kind === 'screen') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return
      drag.moved = true
      // 끄는 도중 ⌥: 원래 화면은 제자리로 돌리고 복제로 바꿔요(피그마와 같아요)
      if (e.altKey && !drag.dup && drag.canDup) { drag.dup = true; emit('move', drag.id, drag.ox, drag.oy, false) }
      // ⌥ 를 떼면 복제 취소: 파란 미리보기를 지우고 원래 화면이 다시 따라와요(피그마와 같아요)
      else if (!e.altKey && drag.dup) { drag.dup = false; draft.value = null }
      // Shift: 가로나 세로로만
      const lockS = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null
      let nx = drag.ox + (lockS === 'x' ? 0 : dx / z), ny = drag.oy + (lockS === 'y' ? 0 : dy / z)
      if (!snapOff(e) && drag.targets.length) {
        const r = snapMove({ x: nx, y: ny, w: drag.w, h: drag.h }, drag.targets, [], thr(), { x: lockS !== 'x', y: lockS !== 'y' })
        nx += r.dx; ny += r.dy; guides.value = r.guides
      } else guides.value = null
      // ⌥ 끌기: 원래 화면은 그대로 두고 복제될 자리를 보여 줘요(놓으면 복제)
      if (drag.dup) { draft.value = { x: store.snapPx(nx), y: store.snapPx(ny), width: drag.w, height: drag.h }; return }
      emit('move', drag.id, store.snapPx(nx), store.snapPx(ny), false) // 픽셀에 맞추기를 끄면 소수점까지
    } else if (drag.kind === 'layers') {
      let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
      if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 3) return
      drag.moved = true
      // 끄는 도중 ⌥(⇧⌥ 포함): 원본은 제자리로 돌리고, 속성까지 그대로인 복제본을 끌어요(피그마와 같아요)
      // 끄는 도중 ⌥ 를 떼면 복제 취소(피그마와 같아요): 복제본을 지우고(방금 기록한 복제를 되돌려요) 원본이 다시 따라와요
      if (!e.altKey && drag.duped && drag.prevDup) {
        const dg = drag, pv = drag.prevDup
        store.undo()
        dg.ids = pv.ids; dg.orig = pv.orig; dg.inv = pv.inv; dg.targets = pv.targets; dg.carry = pv.carry
        keepMix(() => { store.layerIds.value = [...pv.ids] })
        dg.duped = false
        dg.prevDup = undefined
        dg.carryDup = false
      }
      if (e.altKey && !drag.duped && drag.ids.length) {
        const dg = drag
        dg.prevDup = { ids: [...dg.ids], orig: { ...dg.orig }, inv: { ...dg.inv }, targets: dg.targets, carry: [...dg.carry] }
        const d0 = store.doc(dg.sid)
        for (const id of dg.ids) { const n = d0.nodes[id]; if (n) { n.x = dg.orig[id]!.x; n.y = dg.orig[id]!.y } }
        keepMix(() => { store.layerIds.value = [...dg.ids]; store.duplicateInPlace() })
        const sc = props.screens.find((v) => v.id === dg.sid)
        const nd = store.doc(dg.sid)
        const nids = store.topIds(dg.sid, store.layerIds.value).filter((id) => nd.nodes[id])
        if (sc && nids.length) {
          dg.ids = nids
          dg.orig = Object.fromEntries(nids.map((id) => [id, { x: nd.nodes[id]!.x, y: nd.nodes[id]!.y }]))
          dg.inv = Object.fromEntries(nids.map((id) => [id, invert(parentWorld(sc, id))]))
          dg.targets = snapTargets(sc, nids)
          dg.carry = []
        }
        dg.duped = true
        // 함께 끌던 화면들도 복제로: 원래 화면은 제자리로
        if (dg.mixIds?.length && !dg.carryDup) { dg.carryDup = true; for (const c of dg.carry) if (dg.mixIds.includes(c.id)) emit('move', c.id, c.x, c.y, false) }
      }
      const lock = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null // Shift: 가로나 세로로만
      if (lock === 'y') dy = 0
      if (lock === 'x') dx = 0
      const dl = store.doc(drag.sid)
      const inFlow = drag.ids.some((id) => { const n = dl.nodes[id]; return !!n && !n.absolute && !!n.parentId && !!dl.nodes[n.parentId]?.style.layout })
      if (drag.b0 && !snapOff(e) && !inFlow) {
        const r = snapMove({ ...drag.b0, x: drag.b0.x + dx, y: drag.b0.y + dy }, drag.targets.sibs, drag.targets.parents, thr(), { x: lock !== 'x', y: lock !== 'y' })
        dx += r.dx; dy += r.dy; guides.value = r.guides
      } else guides.value = null
      const d = store.doc(drag.sid)
      for (const id of drag.ids) {
        const n = d.nodes[id]
        if (!n) continue
        const v = applyVec(drag.inv[id]!, dx, dy) // 돌린 부모 안이면 부모 좌표로
        n.x = store.snapPx(drag.orig[id]!.x + v.x); n.y = store.snapPx(drag.orig[id]!.y + v.y) // 픽셀 그리드를 끄면 소수점까지
      }
      // 함께 고른 다른 문서의 레이어도 같은 만큼
      for (const c of drag.xcarry ?? []) {
        const n = store.doc(c.sid).nodes[c.id]
        if (!n) continue
        const v = applyVec(c.inv, dx, dy)
        n.x = store.snapPx(c.x + v.x); n.y = store.snapPx(c.y + v.y)
      }
      const dupScreens = drag.carryDup ? drag.mixIds ?? [] : []
      for (const c of drag.carry) if (!dupScreens.includes(c.id)) emit('move', c.id, store.snapPx(c.x + dx), store.snapPx(c.y + dy), false)
      // 복제로 끄는 화면들: 놓일 자리만 보여 줘요(놓으면 복제)
      mixGhosts.value = drag.carry.filter((c) => dupScreens.includes(c.id)).map((c) => { const v = props.screens.find((x) => x.id === c.id)!; return { x: store.snapPx(c.x + dx), y: store.snapPx(c.y + dy), width: v.width, height: v.height } })
      retarget(drag, e, dx, dy)
    } else if (drag.kind === 'resize') {
      const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
      if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
      drag.moved = true
      // 이미지 자르기(⌘ + 이미지 칠 사각형): 끈 변만 잘리거나 넓어지고 이미지는 그대로 — 비율 잠금도 풀려요
      const cropping = !!drag.img0 && e.metaKey
      // 비율이 잠겨 있어도 ⌃ 를 누르는 동안은 풀려요(피그마와 같아요)
      // 이미지 칠(Fill) 사각형: 원래 사진 크기 근처에서 붙어요(자석)
      const ip = drag.img0?.p
      const natural = !cropping && ip?.type === 'image' && (ip.fit ?? 'fill') === 'fill' && ip.iw && ip.ih ? { w: ip.iw, h: ip.ih } : undefined
      const r = resizeBox(drag.g, drag.handle, dx, dy, e, drag.ratio && !e.ctrlKey && !cropping, [...drag.targets.sibs, ...drag.targets.parents], natural)
      guides.value = r.guide
      const c = apply(drag.pinv, r.cx, r.cy)
      const n = store.node(drag.sid, drag.id)
      if (n) {
        Object.assign(n, { x: store.snapPx(c.x - r.w / 2), y: store.snapPx(c.y - r.h / 2), w: r.w, h: r.h })
        // 이미지 칠: ⌘ 면 Crop 으로 바꾸고 이미지 자리를 그대로(넓힌 쪽은 빈 영역), ⌘ 를 떼면 원래 칠로
        if (drag.img0 && n.style.fills?.[drag.img0.i]) {
          const o = drag.img0
          n.style.fills[o.i] = cropping && o.p.type === 'image'
            ? { ...o.p, fit: 'crop', crop: { x: (o.x + o.R.x - n.x) / n.w, y: (o.y + o.R.y - n.y) / n.h, w: o.R.w / n.w, h: o.R.h / n.h } }
            : o.p
        }
        if (drag.sub0) scaleSubtree(drag.sid, drag.sub0, r.w / drag.g.w, n.x, n.y) // 스케일 도구(K): 안쪽까지 같은 비율로
        else {
          if (n.type === 'text') {
            // 글자 상자(피그마와 같아요): 너비만 바꾸면 Auto height, 높이를 바꾸면 Fixed size
            n.style.autoWidth = false
            if (r.h !== drag.g.h) n.sizeV = 'fixed'
          }
          // 직접 크기를 바꾸면 그 방향은 고정 크기로(피그마와 같아요)
          if (r.w !== drag.g.w && n.sizeH && n.sizeH !== 'fixed') n.sizeH = 'fixed'
          if (r.h !== drag.g.h && n.sizeV && n.sizeV !== 'fixed') n.sizeV = 'fixed'
          // 제약: 안쪽 레이어가 따라와요(⌘ 를 누르면 무시)
          if (drag.kids0 && !e.metaKey) {
            const d = store.doc(drag.sid)
            // 그룹은 안의 레이어가 비율대로 커져요(피그마와 같아요), 프레임은 각자의 제약대로
            constrain((n.children ?? []).map((k) => d.nodes[k]!).filter(Boolean), drag.kids0, drag.g.w, drag.g.h, r.w, r.h, isGroupNode(n) ? { h: 'scale', v: 'scale' } : undefined)
          }
        }
        store.relayout(drag.sid)
      }
    } else if (drag.kind === 'resizeMany') {
      const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
      if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
      drag.moved = true
      const u = drag.u0
      // 묶음 크기: 형제 · 부모에 붙어요(⌘ 끔)
      const scaling = tool.value === 'scale'
      const r = resizeBox({ cx: u.x + u.w / 2, cy: u.y + u.h / 2, w: u.w, h: u.h, angle: 0 }, drag.handle, dx, dy, e, e.shiftKey || scaling, [...drag.targets.sibs, ...drag.targets.parents])
      guides.value = r.guide
      const x1 = r.cx - r.w / 2, y1 = r.cy - r.h / 2, kx = r.w / (u.w || 1), ky = r.h / (u.h || 1)
      const d = store.doc(drag.sid)
      const minS = store.pixelSnap.value ? 1 : 0.01
      for (const it of drag.items) {
        const n = d.nodes[it.id]
        if (!n) continue
        // 가운데 자리는 묶음 비율대로, 크기는 돌린 레이어면 자기 축으로 나눠서(모양이 틀어지지 않게)
        const cx = x1 + (it.b.x + it.b.w / 2 - u.x) * kx, cy = y1 + (it.b.y + it.b.h / 2 - u.y) * ky
        const t = (it.rot * Math.PI) / 180, c2 = Math.cos(t) ** 2, s2 = Math.sin(t) ** 2
        const w = it.rot ? it.w0 * (c2 * kx + s2 * ky) : it.b.w * kx
        const h = it.rot ? it.h0 * (s2 * kx + c2 * ky) : it.b.h * ky
        n.w = Math.max(minS, store.snapPx(w)); n.h = Math.max(minS, store.snapPx(h))
        n.x = store.snapPx(cx - it.p.x - n.w / 2)
        n.y = store.snapPx(cy - it.p.y - n.h / 2)
        // 스케일 도구(K): 선 · 글자 · 효과까지 같은 비율로(피그마와 같아요)
        if (scaling && it.sub0) { scaleSubtree(drag.sid, it.sub0, kx, n.x, n.y); continue }
        if (n.type === 'text') n.style.autoWidth = false
        // 프레임은 안의 레이어가 제약대로, 그룹은 비율대로(⌘ 무시)
        if (it.kids0 && !e.metaKey) constrain((n.children ?? []).map((k) => d.nodes[k]!).filter(Boolean), it.kids0, it.w0, it.h0, n.w, n.h, isGroupNode(n) ? { h: 'scale', v: 'scale' } : undefined)
      }
      store.relayout(drag.sid)
    } else if (drag.kind === 'resizeScreen') {
      const dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
      if (!drag.moved && Math.abs(dx * z) + Math.abs(dy * z) < 1) return
      drag.moved = true
      const o = drag.o
      // 스케일 도구 · 비율 잠금(⌃ 누르면 잠깐 풀림)이면 비율 그대로
      const lockR = !!drag.scale0 || (!!store.doc(drag.id).frame?.lockRatio && !e.ctrlKey)
      const r = resizeBox({ cx: o.x + o.w / 2, cy: o.y + o.h / 2, w: o.w, h: o.h, angle: 0 }, drag.handle, dx, dy, e, lockR, drag.targets)
      guides.value = r.guide
      emit('resize-screen', drag.id, { x: store.snapPx(r.cx - r.w / 2), y: store.snapPx(r.cy - r.h / 2), width: r.w, height: r.h }, false)
      // 스케일 도구(K): 화면 안 모든 레이어를 선 · 글자까지 같은 비율로(피그마와 같아요)
      if (drag.scale0) {
        const k = r.w / (o.w || 1)
        const snap = JSON.parse(drag.scale0) as { nodes: Record<string, LayerNode>; frame: LayerStyle | null }
        const dd = store.doc(drag.id)
        const r2 = (v: number) => Math.round(v * 100) / 100
        for (const [id, o0] of Object.entries(snap.nodes)) {
          const n = dd.nodes[id]
          if (!n) continue
          n.style = scaledStyle(o0.style, k)
          if (o0.type === 'instance') n.instScale = Math.round((o0.instScale ?? 1) * k * 10000) / 10000
          n.x = r2(o0.x * k); n.y = r2(o0.y * k); n.w = Math.max(1, r2(o0.w * k)); n.h = Math.max(1, r2(o0.h * k))
        }
        if (snap.frame) dd.frame = scaledStyle(snap.frame, k)
      } else if (drag.kids0 && !e.metaKey) store.constrainRoot(drag.id, o.w, o.h, r.w, r.h, drag.kids0, false)
    } else if (drag.kind === 'rotate') {
      drag.moved = true
      let deg = drag.r0 + (drag.sign * (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10 // Shift: 15° 씩
      const n = store.node(drag.sid, drag.id)
      if (n) n.rotation = normAngle(deg) || undefined
    } else if (drag.kind === 'rotateScreen') {
      drag.moved = true
      let deg = drag.r0 + ((Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180) / Math.PI
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10 // Shift: 15° 씩
      const d = store.doc(drag.sid)
      const v = normAngle(deg)
      const f = { ...(d.frame ?? {}) }
      if (v) f.rotation = v; else delete f.rotation
      d.frame = f
    } else if (drag.kind === 'placeImage') {
      const w = toWorld(e.clientX, e.clientY)
      if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
      drag.moved = true
      const b = boxFrom(drag.wx, drag.wy, w.x, w.y, e.shiftKey, e.altKey)
      draft.value = { x: b.x, y: b.y, width: b.w, height: b.h }
    } else if (drag.kind === 'draw') {
      // 빈 캔버스에 프레임(화면) 그리기: 다른 화면 · 가이드에 붙고(⌘ 끔), ⇧ 정비율 · ⌥ 가운데 · Space 옮기기(피그마와 같아요)
      const sp = snapPoint(toWorld(e.clientX, e.clientY).x, toWorld(e.clientX, e.clientY).y, [], [...realScreens.value.map(rectOf), ...guideRects()], snapOff(e))
      const w = { x: sp.x, y: sp.y }
      if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
      drag.moved = true
      guides.value = sp.g
      const o = spaceShift(drag, { x: drag.wx, y: drag.wy }, w.x, w.y)
      drag.wx = o.x; drag.wy = o.y
      if (drag.sp) { drag.sp = { x: w.x, y: w.y, ox: o.x, oy: o.y } }
      const b = boxFrom(drag.wx, drag.wy, w.x, w.y, e.shiftKey, e.altKey)
      draft.value = { x: store.snapPx(b.x), y: store.snapPx(b.y), width: store.snapPx(b.w), height: store.snapPx(b.h) }
    } else if (drag.kind === 'screens') {
      let dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z
      if (!drag.moved && (Math.abs(dx) + Math.abs(dy)) * z < 3) return
      drag.moved = true
      // 끄는 도중 ⌥: 원래 화면들은 제자리로, 복제로 바꿔요
      if (e.altKey && !drag.dup) { drag.dup = true; for (const id of drag.ids) emit('move', id, drag.orig[id]!.x, drag.orig[id]!.y, false) }
      else if (!e.altKey && drag.dup) { drag.dup = false; mixGhosts.value = [] }
      const lock = e.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'y' : 'x') : null // Shift: 가로나 세로로만
      if (lock === 'y') dy = 0
      if (lock === 'x') dx = 0
      if (!snapOff(e) && drag.targets.length) {
        const r = snapMove({ ...drag.b0, x: drag.b0.x + dx, y: drag.b0.y + dy }, drag.targets, [], thr(), { x: lock !== 'x', y: lock !== 'y' })
        dx += r.dx; dy += r.dy; guides.value = r.guides
      } else guides.value = null
      if (drag.dup) {
        const dg = drag
        mixGhosts.value = dg.ids.map((id) => { const v = props.screens.find((x) => x.id === id)!; return { x: store.snapPx(dg.orig[id]!.x + dx), y: store.snapPx(dg.orig[id]!.y + dy), width: v.width, height: v.height } })
        return
      }
      for (const id of drag.ids) emit('move', id, store.snapPx(drag.orig[id]!.x + dx), store.snapPx(drag.orig[id]!.y + dy), false)
    } else if (drag.kind === 'marqueeCanvas') {
      const w = toWorld(e.clientX, e.clientY)
      if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
      drag.moved = true
      const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
      draft.value = { x: store.snapPx(r.x), y: store.snapPx(r.y), width: store.snapPx(r.width), height: store.snapPx(r.height) }
      const hitBox = (b: { x: number; y: number; w: number; h: number }) => b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y
      // ⌘: 화면 · 프레임 안쪽 레이어까지(가장 안쪽) — 여러 화면에 걸치면 함께 고르기(xsel)
      if (drag.deep) {
        const groups: [string, string[]][] = []
        if (canvasDoc.value) { const c = canvasDoc.value; const hs = deepHits(c, store.doc(c.id).rootIds, r); if (hs.length) groups.push([c.id, hs]) }
        for (const v of realScreens.value) {
          if (!isNative(v) || store.doc(v.id).frame?.locked || !hitBox({ x: v.x, y: v.y, w: v.width, h: v.height })) continue
          const hs = deepHits(v, store.doc(v.id).rootIds, r)
          if (hs.length) groups.push([v.id, hs])
        }
        multi.value = []
        if (!groups.length) { store.selectScreen(null); return }
        const [sid0, ids0] = groups[0]!
        store.selectLayer(sid0, ids0[0]!)
        store.layerIds.value = ids0
        store.xsel.value = groups.slice(1).flatMap(([sid, ids]) => ids.map((id) => ({ sid, id })))
        return
      }
      // 화면이 걸리면 화면들, 아니면 캔버스 위 레이어들
      const scr = [...new Set([...drag.baseScreens, ...realScreens.value.filter((v) => !store.doc(v.id).frame?.locked && hitBox({ x: v.x, y: v.y, w: v.width, h: v.height })).map((v) => v.id)])]
      if (scr.length) {
        store.selectScreen(scr[0]!)
        multi.value = scr.length > 1 ? scr : []
      } else if (canvasDoc.value) {
        const c = canvasDoc.value
        const d = store.doc(c.id)
        const hits = d.rootIds.filter((id) => { const n = d.nodes[id]; if (!n || n.hidden || n.locked) return false; return hitBox(layerWorld(c, id)!) })
        const ids = [...new Set([...drag.baseLayers, ...hits])]
        multi.value = []
        if (ids.length) { store.selectLayer(c.id, ids[0]!); store.layerIds.value = ids } else store.selectScreen(null)
      }
    } else if (drag.kind === 'marquee') {
      const w = toWorld(e.clientX, e.clientY)
      if (!drag.moved && (Math.abs(w.x - drag.wx) + Math.abs(w.y - drag.wy)) * z < 4) return
      if (!drag.moved && store.screenId.value !== drag.sid) store.selectScreen(drag.sid)
      drag.moved = true
      const r = { x: Math.min(w.x, drag.wx), y: Math.min(w.y, drag.wy), width: Math.abs(w.x - drag.wx), height: Math.abs(w.y - drag.wy) }
      draft.value = { x: store.snapPx(r.x), y: store.snapPx(r.y), width: store.snapPx(r.width), height: store.snapPx(r.height) }
      const msid = drag.sid
      const s = props.screens.find((v) => v.id === msid)
      if (!s) return
      const d = store.doc(s.id)
      // ⌘: 가장 안쪽 레이어까지
      if (drag.deep) { store.layerIds.value = [...new Set([...drag.base, ...deepHits(s, d.rootIds, r)])]; return }
      // 맨 위 단계 레이어 중 상자와 겹치는 것 (프레임 안쪽은 프레임째로). 캔버스 위 프레임 빈 곳에서 시작했으면 그 프레임 안 레이어
      const pool = drag.within ? d.nodes[drag.within]?.children ?? [] : d.rootIds
      const hit = pool.filter((id) => {
        const n = d.nodes[id]
        if (!n || n.hidden || n.locked) return false
        const b = layerWorld(s, id)!
        return b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y
      })
      store.layerIds.value = [...new Set([...drag.base, ...hit])]
    } else if (drag.kind === 'drawLine' || drag.kind === 'pencil') {
      const dsid = drag.sid
      const s = props.screens.find((v) => v.id === dsid)
      if (!s) return
      const w = toWorld(e.clientX, e.clientY)
      let lx = w.x - s.x, ly = w.y - s.y
      if (drag.kind === 'pencil') {
        const last = drag.pts[drag.pts.length - 1]!
        if (Math.hypot(lx - last[0], ly - last[1]) * z < 2) return
        drag.moved = true
        drag.pts.push([lx, ly])
        draftPts.value = drag.pts.map(([x, y]) => [x + s.x, y + s.y])
        return
      }
      if (!drag.moved && Math.hypot(lx - drag.lx, ly - drag.ly) * z < 4) return
      drag.moved = true
      drag.c ??= { x: drag.lx, y: drag.ly }
      // 끝점이 주변 레이어 가장자리 · 가운데에 붙어요(⌘ 끔)
      const spt = snapPoint(lx + s.x, ly + s.y, [], pointTargets(dsid), snapOff(e) || e.shiftKey)
      lx = spt.x - s.x; ly = spt.y - s.y
      guides.value = spt.g
      // Space: 그리던 선째 옮기기
      const c = spaceShift(drag, drag.c, lx, ly)
      if (drag.sp) drag.sp = { x: lx, y: ly, ox: c.x, oy: c.y }
      drag.c = c
      // Shift: 45° 단위
      if (e.shiftKey) {
        const a = Math.round(Math.atan2(ly - c.y, lx - c.x) / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(lx - c.x, ly - c.y)
        lx = c.x + Math.cos(a) * len; ly = c.y + Math.sin(a) * len
      }
      // ⌥: 누른 점이 선의 가운데
      drag.lx = e.altKey ? 2 * c.x - lx : c.x
      drag.ly = e.altKey ? 2 * c.y - ly : c.y
      drag.ex = lx; drag.ey = ly
      draftPts.value = [[drag.lx + s.x, drag.ly + s.y], [lx + s.x, ly + s.y]]
    } else if (drag.kind === 'drawLayer') {
      const dsid = drag.sid
      const s = props.screens.find((v) => v.id === dsid)
      if (!s) return
      // 끄는 모서리가 주변 레이어 가장자리 · 가운데에 붙어요(⌘ 끔, ⇧ 정비율일 때는 끔)
      const w0 = toWorld(e.clientX, e.clientY)
      const spt = snapPoint(w0.x, w0.y, [], pointTargets(dsid), snapOff(e) || e.shiftKey)
      const lx = spt.x - s.x, ly = spt.y - s.y
      if (!drag.moved && (Math.abs(lx - drag.lx) + Math.abs(ly - drag.ly)) * z < 4) return
      drag.moved = true
      guides.value = spt.g
      // Space: 그리던 상자째 옮기기
      const o = spaceShift(drag, { x: drag.lx, y: drag.ly }, lx, ly)
      if (drag.sp) drag.sp = { x: lx, y: ly, ox: o.x, oy: o.y }
      drag.lx = o.x; drag.ly = o.y
      // ⇧ 정비율 · ⌥ 누른 점이 가운데(피그마와 같아요)
      const b = boxFrom(drag.lx, drag.ly, lx, ly, e.shiftKey, e.altKey)
      draft.value = { x: store.snapPx(s.x + b.x), y: store.snapPx(s.y + b.y), width: store.snapPx(b.w), height: store.snapPx(b.h) }
      draftType.value = drag.type
    }
  }
  return { dragOut, dragOutIds, dropScreen, ghost, move }
}
export type CanvasDragMove = ReturnType<typeof useDragMove>
