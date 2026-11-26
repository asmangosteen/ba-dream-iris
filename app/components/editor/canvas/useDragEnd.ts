import { descendants } from '~/canvas/schema'
import { simplify } from '~/canvas/paint'
import { FIGMA_DROP_HINT, type CanvasBase, type Drag } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasDrop } from './useCanvasDrop'
import type { CanvasHover } from './useCanvasHover'
import type { CanvasVector } from './useVectorEdit'
import type { CanvasDragMove } from './useDragMove'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick & CanvasDrop & CanvasHover & CanvasVector & CanvasDragMove

/** 끌기 끝: 기록(실행취소) · 놓기 · 만들기 */
export function useDragEnd(canvas: Ctx) {
  const {
    props, emit, store, el, tool, vp, multi, dragRef, panning, draft, draftType, mixGhosts, draftPts, marqueeOn, guides, isNative,
    isCanvas, canvasDoc, rotating, toWorld, toggleMulti, frameAt, screenUnder, overFigmaOnly, setDropLine, dragHover, vedit,
    vmarq, dragOut, dragOutIds, dropScreen,
  } = canvas
  function end(e: PointerEvent) {
    dragHover.value = null
    draftType.value = null
    if (!dragRef.current) return
    const d = dragRef.current
    dragRef.current = null
    // 레이어 끌기 한 번 = 실행취소 한 번: 옮기기 · 다른 프레임(캔버스)으로 넘기기 · 함께 옮긴 화면을 묶어요
    // (따로 기록하면 ⌘Z 첫 번에 원래 프레임 밖 잘린 자리로 돌아가 사라진 것처럼 보였어요)
    if (d.kind === 'layers' && d.moved) store.batch(() => endDrag(e, d))
    else endDrag(e, d)
  }
  function endDrag(e: PointerEvent, d: Drag) {
    panning.value = false
    guides.value = null
    rotating.value = false
    if (d.kind === 'pan' && !d.moved && e.target === el.value) store.selectScreen(null)
    if (d.kind === 'screen' && d.moved && d.dup) { const r = draft.value; draft.value = null; if (r) emit('clone-screen', d.id, r.x, r.y) }
    else if (d.kind === 'screen' && d.moved) {
      const s = props.screens.find((x) => x.id === d.id)
      if (s) emit('move', d.id, s.x, s.y, true)
    }
    if (d.kind === 'layers' && d.moved && d.xbefore?.length) { const xb = d.xbefore; store.batch(() => { store.commit(d.sid, d.before); for (const [s2, b2] of xb) store.commit(s2, b2) }) }
    else if ((d.kind === 'layers' || d.kind === 'resize' || d.kind === 'rotate' || d.kind === 'rotateScreen' || d.kind === 'resizeMany' || d.kind === 'vpt') && d.moved) store.commit(d.sid, d.before)
    // 여러 점을 고른 채 하나를 끌지 않고 눌렀다 떼면: 그 점만 남겨요(피그마와 같아요)
    if (d.kind === 'vpt' && !d.moved && d.collapse && vedit.value) { vedit.value.pts = [d.collapse]; vedit.value.segs = []; vedit.value.sel = d.collapse }
    dragOut.value = null
    dropScreen.value = null
    if (d.kind === 'layers') setDropLine(null)
    dragOutIds.value = []
    // 화면 밖으로 끌어 놓기: 다른 화면 안으로, 아니면 캔버스 위로
    if (d.kind === 'layers' && d.moved && d.out) {
      const src = props.screens.find((v) => v.id === d.sid)
      const w = toWorld(e.clientX, e.clientY)
      const dest = screenUnder(w.x, w.y) ?? canvasDoc.value
      if (src && dest && dest.id !== src.id) {
        const sd = store.doc(src.id)
        const roots = d.ids.filter((id) => !d.ids.some((o) => o !== id && descendants(sd, o).includes(id)))
        const parentId = isCanvas(dest) ? frameAt(dest.id, w.x, w.y) : frameAt(dest.id, w.x - dest.x, w.y - dest.y)
        store.transfer(src.id, roots, dest.id, parentId, { x: src.x - dest.x, y: src.y - dest.y })
      }
    }
    if (d.kind === 'layers' && d.moved && !d.carry.length) { const w = toWorld(e.clientX, e.clientY); if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT)) }
    if ((d.kind === 'layers' || d.kind === 'screen') && !d.moved && d.clickLayer) store.selectLayer(d.kind === 'layers' ? d.sid : d.id, d.clickLayer)
    if (d.kind === 'layers' && d.moved) {
      const dupScreens = d.carryDup ? d.mixIds ?? [] : []
      for (const c of d.carry) { if (dupScreens.includes(c.id)) continue; const v = props.screens.find((x) => x.id === c.id); if (v) emit('move', c.id, v.x, v.y, true) }
      if (dupScreens.length) {
        const items = d.carry.filter((c) => dupScreens.includes(c.id)).map((c, i) => ({ id: c.id, x: mixGhosts.value[i]?.x ?? c.x, y: mixGhosts.value[i]?.y ?? c.y }))
        emit('clone-screens', items)
      }
    }
    if (d.kind === 'layers') mixGhosts.value = []
    // 선 · 화살표는 한 번 긋고 선택 도구로, 연필은 계속 연필(피그마와 같아요)
    if (d.kind === 'drawLine' || d.kind === 'pencil') { draftPts.value = null; if (d.kind === 'drawLine') tool.value = 'move'; finishPoints(d) }
    // 화면 크기 조절: 안 레이어(제약 · 스케일) 기록 + 화면 크기 기록을 실행취소 한 번으로
    if (d.kind === 'resizeScreen' && d.moved) store.batch(() => {
      if (d.before) store.commit(d.id, d.before)
      const s = props.screens.find((x) => x.id === d.id)
      if (s) emit('resize-screen', d.id, { x: s.x, y: s.y, width: s.width, height: s.height }, true)
    })
    if (d.kind === 'marquee') {
      draft.value = null; marqueeOn.value = false
      if (!d.moved && d.deep) {
        // ⌘ 클릭(끌지 않음): 가장 안쪽 레이어(⇧ 면 더하기), 빈 곳이면 그 화면
        if (d.click) store.selectLayer(d.sid, d.click, d.add && store.screenId.value === d.sid)
        else if (!d.add) store.selectScreen(d.sid)
      } else if (!d.moved && d.pick && d.within) store.selectLayer(d.sid, d.within)
      else if (!d.moved && d.pick) { store.selectScreen(d.sid); multi.value = [] }
      else if (!d.moved) toggleMulti(d.sid)
      // 빈 곳에서 끌었는데 아무것도 안 걸렸으면 아무것도 안 고른 상태(피그마와 같아요)
      else if (d.pick && !store.layerIds.value.length) store.selectScreen(null)
    }
    if (d.kind === 'vmarquee') { vmarq.value = null; if (!d.moved && !d.base.length && vedit.value) { vedit.value.pts = []; vedit.value.segs = []; vedit.value.sel = null } }
    if (d.kind === 'marqueeCanvas') { draft.value = null; marqueeOn.value = false; if (!d.moved && !d.baseScreens.length && !d.baseLayers.length) { store.selectScreen(null); multi.value = [] } }
    if (d.kind === 'screens' && d.moved && d.dup) {
      const items = d.ids.map((id, i) => ({ id, x: mixGhosts.value[i]?.x ?? d.orig[id]!.x, y: mixGhosts.value[i]?.y ?? d.orig[id]!.y }))
      mixGhosts.value = []
      emit('clone-screens', items)
    } else if (d.kind === 'screens' && d.moved) for (const id of d.ids) { const v = props.screens.find((x) => x.id === id); if (v) emit('move', id, v.x, v.y, true) }
    if (d.kind === 'placeImage') {
      const r = d.moved ? draft.value : null
      draft.value = null
      const c = r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: d.wx, y: d.wy }
      const sc = screenUnder(c.x, c.y)
      const target = sc && isNative(sc) ? sc : canvasDoc.value
      const place = target ? { sid: target.id, parentId: isCanvas(target) ? frameAt(target.id, c.x, c.y) : frameAt(target.id, c.x - target.x, c.y - target.y) } : undefined
      emit('place-image', c, r && r.width >= 2 ? r.width : null, place)
    }
    if (d.kind === 'draw') {
      // 끌지 않고 누르기만 하면 누른 점이 가운데인 100×100(피그마와 같아요)
      const rect = d.moved && draft.value && draft.value.width >= 1 && draft.value.height >= 1 ? draft.value : { x: store.snapPx(d.wx - 50), y: store.snapPx(d.wy - 50), width: 100, height: 100 }
      draft.value = null
      emit('create', rect)
      tool.value = 'move'
    }
    if (d.kind === 'drawLayer') {
      const s = props.screens.find((v) => v.id === d.sid)
      const r = draft.value
      draft.value = null
      tool.value = 'move'
      if (!s) return
      const big = d.moved && r && r.width >= 2 && r.height >= 2
      if (d.type === 'text') {
        // 비어 있는 글자 상자로 시작해요 — 치지 않고 나가면 레이어가 사라져요(피그마와 같아요). 끌어 그리면 그 크기의 고정 상자
        const id = big
          ? store.add(d.sid, d.parentId, { type: 'text', text: '', x: store.snapPx(r!.x - s.x - d.px), y: store.snapPx(r!.y - s.y - d.py), w: r!.width, h: r!.height, sizeV: 'fixed', style: { autoWidth: false } })
          : store.add(d.sid, d.parentId, { type: 'text', text: '', x: store.snapPx(d.lx - d.px), y: store.snapPx(d.ly - d.py), w: 1, h: 24, style: {} })
        store.editing.value = id
        return
      }
      // 누르기만 하면 누른 점이 가운데인 기본 크기(피그마와 같아요: 섹션 496×496, 나머지 100×100)
      const size = d.type === 'section' ? { w: 496, h: 496 } : { w: 100, h: 100 }
      const x = big ? r!.x - s.x - d.px : store.snapPx(d.lx - d.px - size.w / 2)
      const y = big ? r!.y - s.y - d.py : store.snapPx(d.ly - d.py - size.h / 2)
      const part = { type: d.type, x, y, w: big ? r!.width : size.w, h: big ? r!.height : size.h }
      // 프레임 · 섹션을 끌어 그리면 그 안에 통째로 드는 레이어를 안으로(피그마와 같아요). 눌러서 만든 기본 크기는 그대로
      if (big && (d.type === 'frame' || d.type === 'section')) store.addAround(d.sid, d.parentId, part)
      else store.add(d.sid, d.parentId, part)
    }
  }

  /** 선 · 연필: 상자(x · y · w · h)와 그 안 비율 점으로 저장 */
  function finishPoints(d: Extract<Drag, { kind: 'drawLine' | 'pencil' }>) {
    let pts: [number, number][]
    if (d.kind === 'drawLine') pts = d.moved ? [[d.lx, d.ly], [d.ex, d.ey]] : [[d.lx, d.ly], [d.lx + 100, d.ly]]
    else {
      if (!d.moved || d.pts.length < 2) return
      // 손떨림 정도는 펴서 점을 줄여요(화면 2px 안쪽 흔들림)
      pts = simplify(d.pts, 2 / vp.value.zoom)
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
    const norm = pts.flatMap(([x, y]) => [w ? Math.round(((x - x0) / w) * 1e4) / 1e4 : 0, h ? Math.round(((y - y0) / h) * 1e4) / 1e4 : 0])
    const type = d.kind === 'pencil' ? 'path' : 'line'
    store.add(d.sid, d.parentId, { type, x: store.snapPx(x0 - d.px), y: store.snapPx(y0 - d.py), w: store.snapPx(w), h: store.snapPx(h), pts: norm, ...(d.kind === 'drawLine' && d.arrow ? { name: `Arrow ${Object.values(store.doc(d.sid).nodes).filter((v) => v.name.startsWith('Arrow ')).length + 1}`, style: { arrowEnd: 'arrow' } } : {}) })
  }
  return { end }
}
export type CanvasDragEnd = ReturnType<typeof useDragEnd>
