import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import { descendants, isContainer, ratioLocked, type LayerType, type Paint } from '~/canvas/schema'
import { topImagePaint } from '~/canvas/paint'
import { boxes0 } from '~/canvas/layout'
import { handed, invert, union, type Handle, type Rect } from '~/canvas/geom'
import { cropFromFit } from '~/composables/useImageEdit'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasSnap } from './useCanvasSnap'
import type { CanvasHover } from './useCanvasHover'
import type { CanvasPen } from './usePenTool'
import type { CanvasVector } from './useVectorEdit'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick & CanvasSnap & CanvasHover & CanvasPen & CanvasVector

/** 끌기 시작: 누른 곳 · 도구에 따라 무엇을 끌지 정해요(옮기기 · 그리기 · 상자 고르기 · 손잡이) */
export function useDragStart(canvas: Ctx) {
  const {
    props, emit, store, el, tool, vp, multi, mix, dragRef, space, panning, marqueeOn, frameImg, isNative, isCanvas, realScreens,
    canvasDoc, rectOf, scrRot, parentWorld, layerGeom, layerWorld, selScreen, selFrame, xCarryStart, rotating, toWorld,
    toggleMulti, mixCarry, frameAt, diveBoolean, pickLayer, snapTargets, guideRects, snapOff, snapPoint, pointTargets,
    innerTargets, hover, penDown, vedit, vselOf,
  } = canvas
  // ---------------------------------------------------------------------------
  // 끌기
  // ---------------------------------------------------------------------------
  const BOX_TOOLS: Partial<Record<Tool, LayerType>> = { rect: 'rect', ellipse: 'ellipse', polygon: 'polygon', star: 'star', text: 'text', frame: 'frame', section: 'section' }
  const drawType = (t: Tool): LayerType | null => BOX_TOOLS[t] ?? null
  const pointTool = (t: Tool) => t === 'line' || t === 'arrow' || t === 'pencil'
  /** 선 · 화살표 · 연필 그리기 시작 */
  function startPoints(sid: string, lx: number, ly: number) {
    const parentId = frameAt(sid, lx, ly)
    const p = parentId ? store.absPos(sid, parentId) : { x: 0, y: 0 }
    if (tool.value === 'pencil') dragRef.current = { kind: 'pencil', sid, parentId, px: p.x, py: p.y, pts: [[lx, ly]], moved: false }
    else dragRef.current = { kind: 'drawLine', sid, parentId, px: p.x, py: p.y, lx, ly, ex: lx, ey: ly, arrow: tool.value === 'arrow', moved: false }
  }

  /** 캔버스 위 섹션을 옮기면 그 안에 완전히 들어간 화면도 함께 */
  function sectionCarry(sc: ScreenRow, ids: string[]) {
    if (!isCanvas(sc)) return []
    const d = store.doc(sc.id)
    const boxes = ids.filter((id) => d.nodes[id]?.type === 'section').map((id) => layerWorld(sc, id)!).filter(Boolean)
    if (!boxes.length) return []
    return realScreens.value.filter((v) => boxes.some((b) => v.x >= b.x && v.y >= b.y && v.x + v.width <= b.x + b.w && v.y + v.height <= b.y + b.h)).map((v) => ({ id: v.id, x: v.x, y: v.y }))
  }

  /** 두 번 누르기 판단용: 그 두 번 누르기의 첫 번째 누름 직전에 골라져 있던 것 */
  const press = { sel: [] as string[], sid: null as string | null }
  let lastPress: { t: number; x: number; y: number } | null = null
  function start(e: PointerEvent, screen?: ScreenRow) {
    // pointerdown 의 detail 은 늘 0 이라 시간 · 자리로 판단: 0.5초 안 · 6px 안이면 같은 두 번 누르기의 둘째 누름(선택을 다시 기억하지 않아요)
    const now = performance.now()
    const second = !!lastPress && now - lastPress.t < 500 && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 6
    if (!second) { press.sel = [...store.layerIds.value]; press.sid = store.screenId.value }
    lastPress = second ? null : { t: now, x: e.clientX, y: e.clientY }
    if (e.button !== 0 && e.button !== 1) return
    if (store.editing.value) (document.activeElement as HTMLElement | null)?.blur?.()
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    hover.value = null
    // 캔버스 위 레이어 층에서 레이어가 아닌 곳을 누르면 빈 캔버스와 같아요
    if (screen && isCanvas(screen) && !(e.target as HTMLElement).closest('[data-layer]')) screen = undefined
    // 잠근 화면(프레임): 캔버스에서는 빈 곳처럼 — 화면 · 안의 레이어가 잡히지 않아요(피그마와 같아요, 레이어 목록에서만 골라요)
    if (screen && !isCanvas(screen) && store.doc(screen.id).frame?.locked && (tool.value === 'move' || tool.value === 'scale')) screen = undefined
    if (e.button === 1 || space.value || tool.value === 'hand') {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vp.value.x, vy: vp.value.y, moved: false }
      panning.value = true
      return
    }
    if (tool.value === 'pen') { penDown(e, screen); return }
    // 이미지 놓기(⇧⌘K 로 고른 파일): 누르면 그 자리, 끌면 그 너비로
    if (tool.value === 'image') { const w0 = toWorld(e.clientX, e.clientY); dragRef.current = { kind: 'placeImage', wx: w0.x, wy: w0.y, moved: false }; return }
    // 점 편집 중 빈 곳을 누르면(피그마와 같아요): 편집은 그대로 — 끌면 상자 안 점 고르기, 그냥 누르면 고른 점 풀기. 끝내기는 Esc · Enter
    if (vedit.value) {
      // 편집 중인 모양 상자(바깥 8px 여유) 밖을 누르면 편집 끝(피그마와 같아요) — 누른 자리는 평소처럼(다른 레이어 · 화면 고르기 등)
      const ve = vedit.value
      const vs = props.screens.find((v) => v.id === ve.sid)
      const vg = vs ? layerGeom(vs, ve.id) : null
      const vw = toWorld(e.clientX, e.clientY), vm = 8 / vp.value.zoom
      const va = vg ? (-vg.angle * Math.PI) / 180 : 0
      const vdx = vg ? vw.x - vg.cx : 0, vdy = vg ? vw.y - vg.cy : 0
      const inBox = !!vg && Math.abs(vdx * Math.cos(va) - vdy * Math.sin(va)) <= vg.w / 2 + vm && Math.abs(vdx * Math.sin(va) + vdy * Math.cos(va)) <= vg.h / 2 + vm
      if (!inBox) vedit.value = null
      else {
        const box = el.value!.getBoundingClientRect()
        dragRef.current = { kind: 'vmarquee', x0: e.clientX - box.left, y0: e.clientY - box.top, base: e.shiftKey ? vselOf(vedit.value) : [], moved: false }
        return
      }
    }
    const t = drawType(tool.value)
    // 그리기 시작점도 주변에 붙어요(피그마와 같아요, ⌘ 끔)
    const drawing = !!t || pointTool(tool.value) || tool.value === 'frame' || tool.value === 'section'
    const w0 = toWorld(e.clientX, e.clientY)
    const startAt = (sid: string | null) => (drawing && !snapOff(e) ? snapPoint(w0.x, w0.y, [], sid ? pointTargets(sid) : [...realScreens.value.map(rectOf), ...guideRects()]) : { x: w0.x, y: w0.y })
    // 빈 캔버스에 프레임 도구 → 새 화면
    if (!screen) {
      const w = tool.value === 'frame' ? startAt(null) : canvasDoc.value ? startAt(canvasDoc.value.id) : w0
      // 프레임 도구 → 새 화면
      if (tool.value === 'frame') { dragRef.current = { kind: 'draw', wx: w.x, wy: w.y, moved: false }; return }
      if (pointTool(tool.value) && canvasDoc.value) { startPoints(canvasDoc.value.id, w.x, w.y); return }
      // 사각형 · 텍스트 등 → 캔버스 위에 바로(페이지 레이어)
      if (t && canvasDoc.value) {
        const cid = canvasDoc.value.id
        const parentId = frameAt(cid, w.x, w.y)
        const p = parentId ? store.absPos(cid, parentId) : { x: 0, y: 0 }
        dragRef.current = { kind: 'drawLayer', sid: cid, type: t, parentId, px: p.x, py: p.y, lx: w.x, ly: w.y, moved: false }
        return
      }
      // 이동 도구 → 상자 선택 (피그마와 같아요. 화면 이동은 스페이스 · 손 도구 H · 스크롤)
      if (tool.value === 'move' || tool.value === 'scale') {
        // Shift + 끌기: 지금 고른 것에 더하기(화면들 · 캔버스 위 레이어들)
        const add = e.shiftKey && !e.altKey
        const cid = canvasDoc.value?.id
        const baseScreens = add ? (multi.value.length ? [...multi.value] : store.screenId.value && store.screenId.value !== cid && !store.layerIds.value.length ? [store.screenId.value] : []) : []
        const baseLayers = add && cid && store.screenId.value === cid ? [...store.layerIds.value] : []
        dragRef.current = { kind: 'marqueeCanvas', wx: w.x, wy: w.y, moved: false, baseScreens, baseLayers, deep: e.metaKey && !e.altKey }
        marqueeOn.value = true
        return
      }
      return
    }
    const w = startAt(drawing ? screen.id : null)
    const lx = w.x - screen.x, ly = w.y - screen.y
    // 섹션은 늘 캔버스 위에(화면을 묶는 바탕)
    if (tool.value === 'section' && canvasDoc.value) {
      dragRef.current = { kind: 'drawLayer', sid: canvasDoc.value.id, type: 'section', parentId: null, px: 0, py: 0, lx: w.x, ly: w.y, moved: false }
      return
    }
    if (pointTool(tool.value)) {
      if (!isNative(screen)) { emit('hint', tr('Figma frames are edited in Figma')); tool.value = 'move'; return }
      startPoints(screen.id, lx, ly)
      return
    }
    // 화면 안에 그리기
    if (t) {
      if (!isNative(screen)) { emit('hint', tr('Figma frames are edited in Figma')); tool.value = 'move'; return }
      const parentId = frameAt(screen.id, lx, ly)
      const p = parentId ? store.absPos(screen.id, parentId) : { x: 0, y: 0 }
      dragRef.current = { kind: 'drawLayer', sid: screen.id, type: t, parentId, px: p.x, py: p.y, lx, ly, moved: false }
      return
    }
    if (tool.value !== 'move' && tool.value !== 'scale') return
    // ⌘ + 끌기(피그마와 같아요): 무엇 위에서 누르든 상자 고르기 — 프레임 · 그룹 안쪽 레이어까지(가장 안쪽) 골라요.
    // 끌지 않고 떼면 지금처럼 ⌘ 클릭(가장 안쪽 레이어, 빈 곳이면 그 화면) 고르기
    if (e.metaKey && !e.altKey && isNative(screen)) {
      const el0 = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
      const add = e.shiftKey
      const base = add && store.screenId.value === screen.id ? [...store.layerIds.value] : []
      dragRef.current = { kind: 'marquee', sid: screen.id, wx: w.x, wy: w.y, base, moved: false, deep: true, click: diveBoolean(screen, pickLayer(screen.id, el0?.dataset.layer, true), e.clientX, e.clientY, true), add }
      marqueeOn.value = true
      return
    }
    // 레이어 고르기 · 끌기
    const layerEl = (e.target as HTMLElement).closest('[data-layer]') as HTMLElement | null
    // 피그마처럼 화면 바로 아래 것부터(⌘ 를 누르면 가장 안쪽)
    const lid = diveBoolean(screen, pickLayer(screen.id, layerEl?.dataset.layer, e.metaKey), e.clientX, e.clientY, e.metaKey)
    // 캔버스에 바로 놓인 프레임 · 도형: 고르지 않았어도 누르고 끌면 곧바로 골라서 그 방향으로 옮겨요(사용자 요청 — 상자 고르기는 캔버스 빈 곳에서)
    // 피그마처럼: 고른 화면 안을 끌면 화면째 옮기기(누르고 떼기만 하면 그 레이어를 골라요)
    const screenGrab = !!lid && !isCanvas(screen) && store.screenId.value === screen.id && !store.layerIds.value.length && !multi.value.length && !(e.shiftKey && !e.altKey)
    if (lid && isNative(screen) && !screenGrab) {
      // Shift+클릭은 여러 개 고르기. ⌥⇧ 는 복제해서 끌기(가로 · 세로로만)
      if (e.shiftKey && !e.altKey) {
        if (store.screenId.value === screen.id && store.layerIds.value.length) { store.selectLayer(screen.id, lid, true); return }
        // 다른 문서(캔버스 ↔ 프레임 안)의 레이어를 고른 채 ⇧ 클릭: 함께 고르기(피그마와 같아요)
        if (store.layerIds.value.length && store.screenId.value !== screen.id) { store.toggleX(screen.id, lid); return }
        // 화면(들)을 고른 채 다른 화면 안 레이어를 Shift 클릭: 화면은 그대로, 그 레이어를 함께(자식 선택 유지 — 부모 화면을 대신 고르지 않아요)
        const cur = store.layerIds.value.length ? mix.value : multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) ? [store.screenId.value] : []
        const keep = cur.filter((id) => id !== screen.id)
        multi.value = []
        store.selectLayer(screen.id, lid)
        mix.value = keep
        return
      }
      // 함께 고른 다른 문서의 레이어를 누르면: 그 문서를 지금 문서로(고른 것 전부 그대로 — 끌면 함께 옮겨요)
      if (store.xsel.value.some((x) => x.sid === screen.id && x.id === lid)) store.promoteX(screen.id)
      const d0 = store.doc(screen.id)
      // 고른 프레임 안의 레이어를 끌면 프레임째(누르고 떼기만 하면 안쪽 레이어를 골라요)
      const anc = store.screenId.value === screen.id ? store.layerIds.value.find((id) => id !== lid && descendants(d0, id).includes(lid)) : undefined
      const wasSel = store.screenId.value === screen.id && store.layerIds.value.includes(lid)
      // 여러 개 중 하나를 누르면: 끌면 함께 옮기고, 그냥 떼면 그 하나만 골라요(피그마와 같아요)
      const pickOne = wasSel && (store.layerIds.value.length > 1 || store.xsel.value.length > 0) ? lid : undefined
      // 고른 것의 상자 안을 누르면(위에 다른 레이어가 겹쳐 있어도) 고른 것을 끌어요 — 끌지 않고 떼면 누른 레이어를 골라요(피그마와 같아요)
      const selBoxes = !anc && !wasSel && store.screenId.value === screen.id ? store.layerIds.value.map((id) => layerWorld(screen!, id)).filter((b): b is Rect => !!b) : []
      const sb = selBoxes.length ? union(selBoxes) : null
      const inSel = !!sb && w.x >= sb.x && w.x <= sb.x + sb.w && w.y >= sb.y && w.y <= sb.y + sb.h
      if (!anc && !wasSel && !inSel) store.selectLayer(screen.id, lid)
      // ⌥ 끌기 복제는 실제로 끌 때 해요(move) — ⌥ 를 누른 채 누르기만 하면(거리 재기) 아무것도 생기지 않게(피그마와 같아요)
      const d = store.doc(screen.id)
      // 부모와 자식을 함께 골랐으면 부모만 옮겨요(자식은 따라와요 — 두 번 움직이지 않게)
      const ids = store.topIds(screen.id, store.layerIds.value).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
      const sc = screen
      dragRef.current = {
        kind: 'layers', sid: sc.id, ids, sx: e.clientX, sy: e.clientY,
        orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])),
        inv: Object.fromEntries(ids.map((id) => [id, invert(parentWorld(sc, id))])),
        b0: ids.length ? union(ids.map((id) => layerWorld(sc, id)!)) : null,
        targets: snapTargets(sc, ids),
        before: store.begin(sc.id), moved: false,
        carry: [...sectionCarry(sc, ids), ...mixCarry()],
        clickLayer: anc || inSel ? lid : pickOne,
        parent0: ids[0] ? d.nodes[ids[0]]?.parentId ?? null : null,
        duped: false,
        mixIds: [...mix.value],
        carryDup: false,
        ...xCarryStart(),
      }
      return
    }
    // Shift + 화면 빈 곳 끌기: 상자 안의 레이어 고르기
    if (e.shiftKey && !e.altKey && isNative(screen)) {
      const base = store.screenId.value === screen.id ? [...store.layerIds.value] : []
      // 화면 고르기는 실제로 끌 때 — 그냥 Shift+클릭이면 여러 화면 고르기(toggleMulti)라 지금 고른 화면을 지키려고
      dragRef.current = { kind: 'marquee', sid: screen.id, wx: w.x, wy: w.y, base, moved: false }
      marqueeOn.value = true
      return
    }
    // Shift+클릭: 화면 여러 개 고르기 · 고른 화면들 함께 옮기기
    if (e.shiftKey && !e.altKey && !isCanvas(screen)) {
      if (store.layerIds.value.length && store.screenId.value !== screen.id) { toggleMulti(screen.id); return }
      const cur = multi.value.length ? multi.value : store.screenId.value && !isCanvas({ id: store.screenId.value }) ? [store.screenId.value] : []
      const next = cur.includes(screen.id) ? cur.filter((x) => x !== screen.id) : [...cur, screen.id]
      if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
      return
    }
    // 섞어 고른 화면을 누르고 끌기: 고른 레이어(제자리 부모 안)와 화면들을 함께 옮겨요. ⌥ 면 함께 복제
    if (mix.value.includes(screen.id) && store.screenId.value && store.layerIds.value.length) {
      const sc = props.screens.find((v) => v.id === store.screenId.value)
      if (sc) {
        const d = store.doc(sc.id)
        const ids = store.topIds(sc.id, store.layerIds.value).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
        dragRef.current = {
          kind: 'layers', sid: sc.id, ids, sx: e.clientX, sy: e.clientY,
          orig: Object.fromEntries(ids.map((id) => [id, { x: d.nodes[id]!.x, y: d.nodes[id]!.y }])),
          inv: Object.fromEntries(ids.map((id) => [id, invert(parentWorld(sc, id))])),
          b0: union([...ids.map((id) => layerWorld(sc, id)!), ...mixCarry().map((c) => rectOf(props.screens.find((v) => v.id === c.id)!))]),
          targets: snapTargets(sc, ids), before: store.begin(sc.id), moved: false,
          carry: mixCarry(), parent0: ids[0] ? d.nodes[ids[0]]?.parentId ?? null : null,
          duped: false, mixIds: [...mix.value], carryDup: false,
        }
        return
      }
    }
    if (multi.value.length > 1 && multi.value.includes(screen.id)) {
      const orig = Object.fromEntries(multi.value.map((id) => { const v = props.screens.find((x) => x.id === id)!; return [id, { x: v.x, y: v.y }] }))
      const moving = realScreens.value.filter((v) => multi.value.includes(v.id))
      dragRef.current = { kind: 'screens', ids: [...multi.value], sx: e.clientX, sy: e.clientY, orig, b0: union(moving.map(rectOf)), targets: realScreens.value.filter((v) => !multi.value.includes(v.id)).map(rectOf), moved: false, dup: e.altKey }
      return
    }
    // 고르지 않은 화면(맨 위 프레임)의 빈 곳 · 이름표: 누르면 곧바로 골라서, 끌면 그 방향으로 옮겨요(먼저 고를 필요 없이 — 사용자 요청). ⌥ 면 복제
    store.selectScreen(screen.id)
    const sid0 = screen.id
    dragRef.current = { kind: 'screen', id: sid0, sx: e.clientX, sy: e.clientY, ox: screen.x, oy: screen.y, w: screen.width, h: screen.height, targets: isCanvas(screen) ? [] : [...realScreens.value.filter((v) => v.id !== sid0).map(rectOf), ...guideRects()], moved: false, clickLayer: screenGrab ? lid : undefined, dup: e.altKey && !isCanvas(screen), canDup: !isCanvas(screen) } // 피그마 화면도 ⌥ 끌기로 복제(피그마 연결 · 썸네일 그대로)
  }
  function startResize(e: PointerEvent, handle: Handle) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const s = selScreen.value
    const id = store.layerIds.value[0]
    if (!s || !id) return
    const n = store.node(s.id, id)
    if (!n) return
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const g = layerGeom(s, id)!
    const d0 = store.doc(s.id)
    const kids = isContainer(n) && !n.style.layout ? (n.children ?? []).map((c) => d0.nodes[c]!).filter(Boolean) : []
    const tg = snapTargets(s, [id])
    if (isContainer(n) && n.children?.length) tg.sibs.push(...innerTargets(s, n.children.filter((c) => d0.nodes[c] && !d0.nodes[c]!.hidden && !d0.nodes[c]!.absolute), n.style.layout?.padding))
    // 이미지 칠 사각형: ⌘ 를 누른 채 끌면 자르기(이미지는 그 자리 그대로) — 시작 때 이미지 자리를 받아 둬요
    const top = n.type === 'rect' && !n.rotation && !n.flipX && !n.flipY ? topImagePaint(n.style) : null
    const img0 = top ? { i: top.i, x: n.x, y: n.y, R: (() => { const c = cropFromFit(top.p, n.w, n.h); return { x: c.x * n.w, y: c.y * n.h, w: c.w * n.w, h: c.h * n.h } })(), p: JSON.parse(JSON.stringify(top.p)) as Paint } : undefined
    dragRef.current = { kind: 'resize', sid: s.id, id, handle, sx: e.clientX, sy: e.clientY, g: { cx: g.cx, cy: g.cy, w: g.w, h: g.h, angle: g.angle }, pinv: invert(parentWorld(s, id)), ratio: ratioLocked(n) || tool.value === 'scale', targets: tg, before: store.begin(s.id), moved: false, kids0: kids.length ? boxes0(kids) : undefined, sub0: tool.value === 'scale' ? JSON.stringify(descendants(d0, id).map((k) => d0.nodes[k])) : undefined, img0 }
    // 예전 파일의 이미지 칠은 원래 크기(iw · ih)가 없어요 — 읽어 와서 이번 끌기의 자석에 써요
    const p0 = img0?.p
    if (p0?.type === 'image' && (!p0.iw || !p0.ih)) {
      const d = dragRef.current
      const im = new Image()
      im.onload = () => { if (dragRef.current === d && im.naturalWidth && im.naturalHeight) { p0.iw = im.naturalWidth; p0.ih = im.naturalHeight } }
      im.src = frameImg(p0.src) ?? ''
    }
  }
  /** 여러 개 고른 상자의 변 · 모서리: 모두 같은 비율로(피그마와 같아요) */
  function startResizeMany(e: PointerEvent, handle: Handle) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const s = selScreen.value
    if (!s || store.layerIds.value.length < 2) return
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const d = store.doc(s.id)
    const ids = store.layerIds.value.filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
    const items = ids.map((id) => {
      const n = d.nodes[id]!
      const pw = n.parentId ? layerWorld(s, n.parentId) : null
      const kids = isContainer(n) && !n.style.layout ? (n.children ?? []).map((c) => d.nodes[c]!).filter(Boolean) : []
      return { id, b: layerWorld(s, id)!, p: pw ? { x: pw.x, y: pw.y } : { x: s.x, y: s.y }, w0: n.w, h0: n.h, rot: n.rotation ?? 0, kids0: kids.length ? boxes0(kids) : undefined, sub0: tool.value === 'scale' ? JSON.stringify(descendants(d, id).map((k) => d.nodes[k])) : undefined }
    }).filter((x) => x.b)
    if (!items.length) return
    dragRef.current = { kind: 'resizeMany', sid: s.id, handle, sx: e.clientX, sy: e.clientY, u0: union(items.map((x) => x.b)), items, targets: snapTargets(s, ids), before: store.begin(s.id), moved: false }
  }
  /**
   * 글자 상자 변 두 번 누르기(피그마와 같아요): 왼쪽 · 오른쪽 변은 Auto width(글자 길이에 맞춰), 위 · 아래 변은 Auto height(내용 높이에 맞춰)
   */
  function edgeDbl(h: Handle) {
    const sid = store.screenId.value
    const id = store.layerIds.value[0]
    const n = sid && id ? store.node(sid, id) : undefined
    if (!sid || !n || n.type !== 'text') return
    if (h === 'e' || h === 'w') store.update(sid, [n.id], (m) => ({ sizeV: undefined, style: { ...m.style, autoWidth: true } }))
    else store.update(sid, [n.id], { sizeV: undefined })
  }
  /** 고른 화면(프레임)의 변 · 모서리 */
  function startScreenResize(e: PointerEvent, handle: Handle) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const s = selFrame.value
    if (!s) return
    try { el.value?.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const kids = isNative(s) ? store.doc(s.id).rootIds.map((c) => store.doc(s.id).nodes[c]!).filter(Boolean) : []
    const ds = store.doc(s.id)
    const inner = isNative(s) ? innerTargets(s, ds.rootIds.filter((c) => ds.nodes[c] && !ds.nodes[c]!.hidden && !ds.nodes[c]!.absolute), ds.frame?.layout?.padding) : []
    const scale0 = tool.value === 'scale' && isNative(s) ? JSON.stringify({ nodes: ds.nodes, frame: ds.frame ?? null }) : undefined
    dragRef.current = { kind: 'resizeScreen', id: s.id, handle, sx: e.clientX, sy: e.clientY, o: rectOf(s), targets: [...realScreens.value.filter((v) => v.id !== s.id).map(rectOf), ...inner], moved: false, kids0: kids.length ? boxes0(kids) : undefined, before: kids.length || scale0 ? store.begin(s.id) : undefined, scale0 }
  }
  /** 모서리 바로 바깥을 끌어 돌리기 */
  function startRotate(e: PointerEvent) {
    if (e.button !== 0) return // 손잡이는 왼쪽 버튼으로만(우클릭 · 가운데 버튼은 무시)
    const s = selScreen.value
    const id = store.layerIds.value[0]
    if (!s || !id || !el.value) return
    const n = store.node(s.id, id)
    if (!n) return
    try { el.value.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const g = layerGeom(s, id)!
    const r = el.value.getBoundingClientRect()
    const cx = r.left + g.cx * vp.value.zoom + vp.value.x, cy = r.top + g.cy * vp.value.zoom + vp.value.y
    dragRef.current = { kind: 'rotate', sid: s.id, id, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: n.rotation ?? 0, sign: handed(parentWorld(s, id)), before: store.begin(s.id), moved: false }
    rotating.value = true
  }

  /** 화면(맨 위 프레임) 돌리기: 화면 가운데 기준, ⇧ 15° 씩 — 실행취소 한 번 */
  function startScreenRotate(e: PointerEvent) {
    if (e.button !== 0) return
    const f = selFrame.value
    if (!f || !el.value || !isNative(f)) return
    try { el.value.setPointerCapture?.(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const r = el.value.getBoundingClientRect()
    const cx = r.left + (f.x + f.width / 2) * vp.value.zoom + vp.value.x, cy = r.top + (f.y + f.height / 2) * vp.value.zoom + vp.value.y
    dragRef.current = { kind: 'rotateScreen', sid: f.id, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), r0: scrRot(f), before: store.begin(f.id), moved: false }
    rotating.value = true
  }
  return { press, start, startResize, startResizeMany, edgeDbl, startScreenResize, startRotate, startScreenRotate }
}
export type CanvasDragStart = ReturnType<typeof useDragStart>
