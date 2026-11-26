import type { ScreenRow } from '~/composables/useEditor'
import { layerMenuItems, markIrisClip, svgOf, useLastCopy, useRenameReq } from '~/composables/useLayerMenu'
import type { MenuItem } from '~/composables/useContextMenu'
import { union, type Rect } from '~/canvas/geom'
import { EDITABLE, type CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasVector } from './useVectorEdit'
import type { CanvasLabels } from './useCanvasLabels'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick & CanvasVector & CanvasLabels

/** 붙여넣기 · 섹션으로 감싸기 · 우클릭 메뉴 */
export function useCanvasMenu(canvas: Ctx) {
  const {
    props, emit, store, el, vp, multi, isNative, isCanvas, realScreens, canvasDoc, rectOf, layerWorld, toWorld, zoomAt, fit,
    fitSelection, pickLayer, enterVectorEdit, renamingFrame,
  } = canvas
  const gridsShown = useLayoutGridsShown()
  const rulersShown = useState('iris-rulers', () => false)
  const lastCopy = useLastCopy()
  const renameReq = useRenameReq()
  const ctx = useContextMenu()
  /** 붙여넣을 때 문서끼리 자리 환산: 화면 · 캔버스의 캔버스 좌표와 크기 */
  const pasteGeo = {
    origin: (id: string) => { const v = props.screens.find((x) => x.id === id); return v ? { x: v.x, y: v.y } : null },
    isCanvas: (id: string) => isPageCanvas(id),
    size: (id: string) => { const v = props.screens.find((x) => x.id === id); return v ? { w: v.width, h: v.height } : null },
  }
  store.setPasteGeo(pasteGeo)
  onBeforeUnmount(() => store.setPasteGeo(undefined))
  /** 붙여넣기: 마지막에 복사한 것(화면이면 화면, 레이어면 레이어) */
  function doPaste() {
    const sid = store.screenId.value
    const screen = props.screens.find((v) => v.id === sid)
    const native = !!screen && isNative(screen)
    // 레이어 + 화면을 함께 복사했으면: 레이어는 원래 부모 안 같은 자리, 화면들은 오른쪽에(새 레이어 · 화면을 함께 골라 둬요)
    if (lastCopy.value === 'mixed' && store.hasClipboard()) {
      const cs = store.clipSid()
      store.layerIds.value = []
      store.paste(cs ?? undefined)
      emit('paste-screens', true)
      return
    }
    if (lastCopy.value !== 'screen' && store.hasClipboard()) store.batch(() => { store.paste(native || (sid && isPageCanvas(sid)) ? undefined : canvasDoc.value?.id); bringIntoView() })
    else emit('screen-action', 'paste')
  }
  /**
   * 붙인 레이어가 지금 보이는 곳 밖이면 보이는 곳 가운데로(피그마와 같아요). 들어간 화면 자체가 안 보이면 캔버스 위로 꺼내요
   */
  function bringIntoView() {
    const sid = store.screenId.value
    const s = props.screens.find((v) => v.id === sid)
    const r = el.value?.getBoundingClientRect()
    if (!s || !r) return
    const ids = store.topIds(s.id, store.layerIds.value)
    const bs = ids.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    if (!bs.length) return
    const u = union(bs)
    const z = vp.value.zoom
    const view = { x: -vp.value.x / z, y: -vp.value.y / z, w: r.width / z, h: r.height / z }
    const meets = (b: Rect) => b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y
    if (meets(u)) return
    const dx = Math.round(view.x + view.w / 2 - (u.x + u.w / 2)), dy = Math.round(view.y + view.h / 2 - (u.y + u.h / 2))
    // 화면 안이고 그 화면도 안 보이면 캔버스 위로 꺼내서
    if (!isCanvas(s) && !meets(rectOf(s)) && canvasDoc.value) {
      const c = canvasDoc.value
      store.transfer(s.id, ids, c.id, null, { x: s.x + dx, y: s.y + dy })
      return
    }
    store.update(s.id, ids, (n) => ({ x: n.x + dx, y: n.y + dy }))
  }
  /** 붙여넣고 누른 자리(캔버스 좌표)로 옮기기 */
  function pasteAt(w: { x: number; y: number }) {
    doPaste()
    const sid = store.screenId.value
    const s = props.screens.find((v) => v.id === sid)
    if (!s || !store.layerIds.value.length) return
    const bs = store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
    if (!bs.length) return
    const u = union(bs)
    const dx = Math.round(w.x - u.x), dy = Math.round(w.y - u.y)
    store.update(s.id, [...store.layerIds.value], (n) => ({ x: n.x + dx, y: n.y + dy }))
  }
  /** 화면(프레임) 우클릭 메뉴 */
  /** 고른 화면(프레임)들을 감싸는 섹션을 캔버스에 만들어요(둘레 80 여백). 섹션을 옮기면 안의 화면도 함께 움직여요 */
  function sectionScreens(ids?: string[]) {
    const list = (ids ?? (multi.value.length ? multi.value : store.screenId.value ? [store.screenId.value] : []))
      .map((id) => realScreens.value.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v)
    const c = canvasDoc.value
    if (!list.length || !c) return
    const pad = 80
    const x0 = Math.min(...list.map((v) => v.x)) - pad, y0 = Math.min(...list.map((v) => v.y)) - pad
    const x1 = Math.max(...list.map((v) => v.x + v.width)) + pad, y1 = Math.max(...list.map((v) => v.y + v.height)) + pad
    const id = store.add(c.id, null, { type: 'section', x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) })
    multi.value = []
    store.selectLayer(c.id, id)
  }
  function screenMenuItems(screen: ScreenRow, at: { x: number; y: number }): MenuItem[] {
    const native = isNative(screen)
    return [
      { label: tr('Copy'), shortcut: '⌘C', action: () => { lastCopy.value = 'screen'; emit('screen-action', 'copy'); markIrisClip() } },
      { label: tr('Paste'), shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
      ...(native ? [{ label: tr('Paste here'), action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' }] : []),
      { label: tr('Duplicate'), shortcut: '⌘D', action: () => emit('screen-action', 'duplicate') },
      { label: tr('Wrap in section'), shortcut: '⌥⌘S', action: () => sectionScreens(multi.value.includes(screen.id) ? multi.value : [screen.id]) },
      'sep',
      { label: tr('Bring to front'), shortcut: ']', action: () => emit('screen-action', 'front') },
      { label: tr('Bring forward'), shortcut: '⌘]', action: () => emit('screen-action', 'forward') },
      { label: tr('Send backward'), shortcut: '⌘[', action: () => emit('screen-action', 'backward') },
      { label: tr('Send to back'), shortcut: '[', action: () => emit('screen-action', 'back') },
      'sep',
      ...(native ? [
        { label: tr('Select all layers'), action: () => store.selectAll(screen.id), disabled: !store.doc(screen.id).rootIds.length },
        { label: store.doc(screen.id).frame?.grids?.length ? tr('Remove layout grid') : tr('Add layout grid'), action: () => store.frameStyle(screen.id, { grids: store.doc(screen.id).frame?.grids?.length ? undefined : [{ type: 'columns', count: 4, gutter: 16, margin: 16, color: '#FF000019' }] }) },
        { label: tr('Copy as SVG'), action: () => { const d = store.doc(screen.id); const svg = svgOf(d, d.rootIds.map((id) => d.nodes[id]!).filter(Boolean), store.color); if (svg) navigator.clipboard.writeText(svg).then(() => emit('hint', tr('Copied to clipboard')), () => emit('hint', tr('Couldn\'t copy to the clipboard'))); else emit('hint', tr('Nothing to copy as SVG')) } },
      ] : []),
      // 프로젝트 썸네일(피그마 Set as thumbnail): 홈 목록 카드에 이 프레임을 보여 줘요. 이미 썸네일이면 기본(첫 페이지의 첫 화면)으로 되돌리기
      props.coverId === screen.id
        ? { label: tr('Restore default thumbnail'), action: () => emit('thumbnail', null) }
        : { label: tr('Set as thumbnail'), action: () => emit('thumbnail', screen.id) },
      { label: tr('Rename'), shortcut: '⌘R', action: () => (renamingFrame.value = screen.id) },
      { label: tr('Zoom to selection'), shortcut: '2', action: fitSelection },
      'sep',
      { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => emit('screen-action', 'remove') },
    ]
  }
  /** 우클릭 메뉴(피그마와 같아요): 레이어 · 화면 · 빈 캔버스 */
  function onContext(e: MouseEvent) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, [contenteditable="true"]')) return
    const scrEl = t.closest('[data-screen]') as HTMLElement | null
    const screen = scrEl ? props.screens.find((v) => v.id === scrEl.dataset.screen) : undefined
    const lid = (t.closest('[data-layer]') as HTMLElement | null)?.dataset.layer
    const at = toWorld(e.clientX, e.clientY)
    // 누른 자리에 겹친 레이어들(맨 위부터) — 'Select layer' 로 골라요(피그마와 같아요, ⌘ 우클릭은 바로 이 목록)
    const under = screen ? [...new Set(document.elementsFromPoint(e.clientX, e.clientY).filter((x) => (x as HTMLElement).closest?.('[data-screen]')?.getAttribute('data-screen') === screen.id).map((x) => (x.closest('[data-layer]') as HTMLElement | null)?.dataset.layer).filter((v): v is string => !!v))] : []
    const pickMenu = (sid: string) => ctx.open(e, under.map((id) => ({ label: store.node(sid, id)?.name ?? id, action: () => store.selectLayer(sid, id) })))
    if (screen && lid && isNative(screen) && e.metaKey && under.length) { pickMenu(screen.id); return }
    // 왼쪽 클릭과 같은 레이어를 골라요(그룹 안이면 그룹) — 고른 것의 상자 안이면 그대로
    const picked = screen && lid && isNative(screen) ? pickLayer(screen.id, lid) : undefined
    if (screen && picked) {
      const lid = picked
      const selB = store.screenId.value === screen.id ? store.layerIds.value.map((id) => layerWorld(screen, id)).filter((b): b is Rect => !!b) : []
      const sb = selB.length ? union(selB) : null
      const inSel = store.screenId.value === screen.id && (store.layerIds.value.includes(lid) || (!!sb && at.x >= sb.x && at.x <= sb.x + sb.w && at.y >= sb.y && at.y <= sb.y + sb.h))
      if (!inSel) store.selectLayer(screen.id, lid)
      const n0 = store.node(screen.id, lid)
      const items = layerMenuItems(store, screen.id, [...store.layerIds.value], { lastCopy, paste: doPaste, pasteHere: () => pasteAt(at), fit: fitSelection, hint: (t) => emit('hint', t) })
      // 이름 바꾸기 · 점 편집은 Delete 위에(Delete 가 늘 맨 끝)
      const extra: MenuItem[] = n0 && store.layerIds.value.length === 1 && EDITABLE.has(n0.type) ? [{ label: tr('Edit vector'), shortcut: '↵', action: () => enterVectorEdit(screen.id, lid) }] : []
      items.splice(Math.max(0, items.length - 2), 0, ...extra)
      if (under.length > 1) items.unshift({ label: tr('Select layer'), action: () => pickMenu(screen.id) }, 'sep')
      ctx.open(e, items)
      return
    }
    if (screen && !isCanvas(screen)) {
      if (!multi.value.includes(screen.id)) store.selectScreen(screen.id)
      ctx.open(e, screenMenuItems(screen, at))
      return
    }
    ctx.open(e, [
      { label: tr('Paste'), shortcut: '⌘V', action: doPaste, disabled: !store.hasClipboard() && lastCopy.value !== 'screen' },
      { label: tr('Paste here'), action: () => pasteAt(at), disabled: !store.hasClipboard() || lastCopy.value === 'screen' },
      'sep',
      { label: tr('Zoom in'), shortcut: '⌘+', action: () => zoomAt(vp.value.zoom * 2) },
      { label: tr('Zoom out'), shortcut: '⌘−', action: () => zoomAt(vp.value.zoom / 2) },
      { label: tr('Zoom to {n}%', { n: 100 }), shortcut: '⌘0', action: () => zoomAt(1) },
      { label: tr('Zoom to fit'), shortcut: '1', action: () => fit() },
      'sep',
      { label: rulersShown.value ? tr('Hide rulers') : tr('Show rulers'), shortcut: '⇧R', action: () => (rulersShown.value = !rulersShown.value) },
      { label: gridsShown.value ? tr('Hide layout grids') : tr('Show layout grids'), shortcut: '⇧G', action: () => (gridsShown.value = !gridsShown.value) },
    ])
  }
  return { gridsShown, rulersShown, lastCopy, renameReq, doPaste, sectionScreens, onContext }
}
export type CanvasMenu = ReturnType<typeof useCanvasMenu>
