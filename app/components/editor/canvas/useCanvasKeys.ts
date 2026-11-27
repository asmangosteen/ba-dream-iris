import type { ExportSetting } from '~/canvas/schema'
import { irisDuplicate, markIrisClip, pickedLayers, selectMatchingSay, setIrisImageSource, unsetIrisImageSource } from '~/composables/useLayerMenu'
import type { AlignKind } from '~/canvas/geom'
import { textShortcut } from '~/canvas/textKeys'
import { download, fileNameOf, renderCombined, renderExport } from '~/canvas/exporter'
import { instEdit, subSel } from '~/composables/useInstanceTree'
import { EDITABLE, type CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasHover } from './useCanvasHover'
import type { CanvasPen } from './usePenTool'
import type { CanvasVector } from './useVectorEdit'
import type { CanvasLabels } from './useCanvasLabels'
import type { CanvasMenu } from './useCanvasMenu'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasHover & CanvasPen & CanvasVector & CanvasLabels & CanvasMenu

/** 단축키(피그마와 같아요) */
export function useCanvasKeys(canvas: Ctx) {
  const {
    props, emit, store, el, tool, vp, multi, mix, space, imgEdit, isNative, isCanvas, realScreens, zoomAt, fit, fitSelection,
    altOn, metaHeld, cmdMarks, updateCmd, pen, finishPen, vedit, vselOf, enterVectorEdit, moveVsel, selectAllVpts, deleteVpt,
    renamingFrame, gridsShown, rulersShown, lastCopy, renameReq, doPaste, sectionScreens,
  } = canvas
  // ---------------------------------------------------------------------------
  // 단축키
  // ---------------------------------------------------------------------------
  const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')
  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform)
  /** 불투명도 숫자키(피그마 한국어 자판과 같아요): ⇧1 = 10% … ⇧9 = 90%, ⇧0 = 100%, 빠르게 두 번(⇧5 ⇧5 = 55%, ⇧0 ⇧0 = 0%) */
  let opBuf: { s: string; t: number } | null = null
  function setOpacity(v: number) {
    const sid = store.screenId.value
    if (!sid) return
    const ids = store.layerIds.value
    if (ids.length) { store.style(sid, ids, { opacity: v }); return }
    const list = multi.value.length ? multi.value : [sid]
    store.batch(() => { for (const id of list) { const s = props.screens.find((x) => x.id === id); if (s && isNative(s) && !isCanvas(s)) store.frameStyle(id, { opacity: v }) } })
  }
  /** 칠 · 선 단축키: ⇧X 맞바꾸기 · ⌥/ 칠 지우기 · ⇧/ 선 지우기(피그마와 같아요). 글자의 칠은 글자 색 */
  function paintKey(kind: 'swap' | 'noFill' | 'noStroke') {
    const sid = store.screenId.value
    if (!sid) return
    const ids = store.layerIds.value
    store.batch(() => {
      for (const id of ids) {
        const n = store.node(sid, id)
        if (!n) continue
        const s = n.style
        const fk = n.type === 'text' ? 'color' : 'fill'
        if (kind === 'swap') store.style(sid, [id], { [fk]: s.stroke, stroke: s[fk], fills: s.strokes, strokes: s.fills, strokeWidth: s[fk] && !s.strokeWidth ? 1 : s.strokeWidth })
        else if (kind === 'noFill') store.style(sid, [id], { [fk]: n.type === 'text' ? 'transparent' : undefined, fills: undefined })
        else store.style(sid, [id], { stroke: undefined, strokes: undefined })
      }
    })
  }
  /** ⌃C 색 추출(피그마와 같아요): 화면에서 색을 집어 고른 것의 칠로. 아무것도 안 골랐으면 HEX 를 복사 */
  async function pickColor() {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!ED) { emit('hint', tr('This browser can’t pick colors from the screen. Try Chrome or Edge')); return }
    let hex: string
    try { hex = (await new ED().open()).sRGBHex.toUpperCase() } catch { return }
    const sid = store.screenId.value
    const ids = store.layerIds.value
    if (sid && ids.length) {
      store.batch(() => { for (const id of ids) { const n = store.node(sid, id); if (n) store.style(sid, [id], n.type === 'text' ? { color: hex } : { fill: hex, fills: undefined }) } })
    } else if (sid && !isPageCanvas(sid)) store.frameStyle(sid, { fill: hex, fills: undefined })
    else navigator.clipboard?.writeText(hex).then(() => emit('hint', tr('Copied {v}', { v: hex })), () => {})
  }
  /** 내보내기 대상 요소: 고른 레이어(여럿이면 각각) 또는 고른 화면 */
  function exportTargets(): { el: HTMLElement; name: string; exports?: ExportSetting[] }[] {
    const sid = store.screenId.value
    const world = el.value?.querySelector('.world')
    if (!sid || !world) return []
    const ids = store.layerIds.value
    if (ids.length) return ids.map((id) => ({ el: world.querySelector<HTMLElement>(`[data-screen="${sid}"] [data-layer="${id}"]`), n: store.node(sid, id) })).filter((t) => t.el && t.n).map((t) => ({ el: t.el!, name: t.n!.name, exports: t.n!.exports }))
    const list = multi.value.length ? multi.value : [sid]
    return list.map((id) => ({ el: world.querySelector<HTMLElement>(`.frame[data-screen="${id}"]`), s: props.screens.find((x) => x.id === id) })).filter((t) => t.el && t.s).map((t) => ({ el: t.el!, name: t.s!.name, exports: store.doc(t.s!.id).exports }))
  }
  /** 고른 것 그림(PNG 2배): 하나면 그것, 여럿이면 놓인 배치 그대로 한 장(고른 것만, 사이는 투명) */
  const pngOfSelection = (): Promise<Blob> | null => {
    const ts = exportTargets()
    if (!ts.length) return null
    // 2배(선명하게). 크롬이 클립보드에 쓸 때 그림을 다시 만들며 해상도 표시를 지워서, 맥 앱에는 두 배 크기로 붙어요(피그마 웹도 같아요)
    return ts.length === 1 ? renderExport(ts[0]!.el, { scale: '2x', format: 'PNG' }) : renderCombined(ts.map((t) => t.el), vp.value.zoom)
  }
  // ⌘C 할 때 클립보드에 그림도 함께(다른 앱에 붙이면 그림)
  const irisImage = () => pngOfSelection()
  setIrisImageSource(irisImage)
  onBeforeUnmount(() => unsetIrisImageSource(irisImage))
  /** ⇧⌘C PNG 로 복사(피그마와 같아요, 2배) */
  async function copyPng() {
    const blob = pngOfSelection()
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      emit('hint', tr('Copied as PNG'))
    } catch { emit('hint', tr('Couldn\'t copy to the clipboard')) }
  }
  /** ⇧⌘E 내보내기(피그마와 같아요): 고른 것의 Export 설정대로, 없으면 PNG 1x 로 내려받기 */
  async function exportNow() {
    const ts = exportTargets()
    if (!ts.length) { emit('hint', tr('Nothing to export')); return }
    try {
      for (const t of ts) for (const e of t.exports?.length ? t.exports : [{ scale: '1x', format: 'PNG' } as ExportSetting]) download(await renderExport(t.el, e), fileNameOf(t.name, e))
    } catch { emit('hint', tr('Couldn’t export. Try again')) }
  }
  /** N · ⇧N 다음 · 이전 화면으로 맞춰 보기, End · Home 은 확대는 그대로 두고 찾아가기(피그마와 같아요) */
  function stepScreen(back: boolean, zoom: boolean) {
    const list = realScreens.value
    if (!list.length) return
    const cur = list.findIndex((s) => s.id === store.screenId.value)
    const next = list[cur < 0 ? (back ? list.length - 1 : 0) : (cur + (back ? -1 : 1) + list.length) % list.length]!
    store.selectScreen(next.id)
    multi.value = []
    if (zoom) { fit([next.id]); return }
    const r = el.value?.getBoundingClientRect()
    if (!r) return
    const z = vp.value.zoom
    vp.value = { zoom: z, x: r.width / 2 - (next.x + next.width / 2) * z, y: r.height / 2 - (next.y + next.height / 2) * z }
  }
  /**
   * 피그마와 같은 단축키. 레이어를 골랐으면 레이어에, 화면만 골랐으면 화면에 적용합니다.
   * 이동 V · 프레임 F/A · 사각형 R · 텍스트 T 는 EditorToolbar 가 받습니다.
   */
  function onKeyDown(e: KeyboardEvent) {
    const cmdKey = e.metaKey || e.ctrlKey
    const handled = e.defaultPrevented
    // 글자를 고치는 중에도 확대 · 축소는 캔버스로(브라우저 화면 확대 대신)
    if (cmdKey && !e.altKey && (e.target as HTMLElement).closest?.('[contenteditable="true"]')) {
      if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); zoomAt(vp.value.zoom * 2); return }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomAt(vp.value.zoom / 2); return }
      if (e.code === 'Digit0') { e.preventDefault(); zoomAt(1); return }
    }
    // 브라우저 · 데스크톱 앱 기본 동작이 새지 않게(편집기에서는 늘): ⌘S 저장 창 · ⌘P 인쇄 · ⌘R · ⇧⌘R 새로고침 · ⌥⌘B 북마크
    if (cmdKey && !e.altKey && ['KeyS', 'KeyP', 'KeyR'].includes(e.code)) e.preventDefault()
    if (cmdKey && e.altKey && e.code === 'KeyB') e.preventDefault()
    if (typing(e)) return
    // 이미지 자르기 중: Enter · Esc 는 자르기 화면이 받아요(점 편집 · 선택 풀기로 새지 않게)
    if (imgEdit.value && (e.key === 'Enter' || e.key === 'Escape')) return
    // 다른 곳(색 고르기 · 메뉴 등)이 이미 처리한 키, 변수 화면처럼 캔버스를 덮는 창이 열려 있을 때는 캔버스 단축키를 쓰지 않아요
    if (handled || document.querySelector('.vars[role="dialog"]')) return
    if (e.key === 'Meta' && !metaHeld.value) { metaHeld.value = true; updateCmd() }
    // 펜으로 그리는 중: Enter · Esc 끝내기, Backspace 마지막 점 지우기
    if (pen.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'Backspace' || e.key === 'Delete') { pen.value.pts.pop(); if (!pen.value.pts.length) pen.value = null }
      else finishPen(false)
      return
    }
    // 점 편집 중(피그마와 같아요): ⌘A 모든 점, 방향키 고른 점 1 씩(⇧ 10)
    if (vedit.value) {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyA') { e.preventDefault(); selectAllVpts(); return }
      const ar = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
      if (ar && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const k = e.shiftKey ? 10 : 1
        if (vselOf(vedit.value).length) moveVsel({ dx: ar[0] * k, dy: ar[1] * k })
        return
      }
    }
    // 점 편집 중: Enter · Esc 끝내기, Backspace 고른 점 지우기
    if (vedit.value && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'Backspace' || e.key === 'Delete') { if (vselOf(vedit.value).length) deleteVpt(e.shiftKey) } else vedit.value = null
      return
    }
    const mod = e.metaKey || e.ctrlKey
    // 자판 위치(KeyZ)로 찾아요 — 한글 입력 상태에서도 ⌘Z · ⌘C · ⌘V 등이 먹게
    const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase()
    const sid = store.screenId.value
    const ids = store.layerIds.value
    const screen = props.screens.find((v) => v.id === sid)
    const native = !!screen && isNative(screen)
    const layerMode = !!sid && ids.length > 0
    const stop = () => e.preventDefault()
    const bare = !mod && !e.altKey && !e.shiftKey

    if (e.code === 'Space') { space.value = true; stop(); return }
    if (e.key === 'Alt') altOn.value = true
    // 글자 단축키(글자 레이어를 골랐을 때): ⌘B · ⌘U · ⇧⌘X · ⌥⌘L/T/R/J · ⇧⌘< > · ⌥⌘< > · ⌥< > · ⌥⇧< > · ⇧⌘7 · ⇧⌘8
    if (layerMode && textShortcut(e, store, sid, ids)) { stop(); return }
    // 패널(피그마와 같아요): ⌥1 레이어 · ⌥2 에셋 · ⌥8 디자인 탭, ⌘\ UI 숨기기
    if (e.altKey && !mod && !e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit8')) { stop(); emit('ui', e.code === 'Digit1' ? 'left-file' : e.code === 'Digit2' ? 'left-assets' : 'design'); return }
    if (mod && !e.altKey && !e.shiftKey && (e.code === 'Backslash' || e.code === 'IntlYen')) { stop(); emit('ui', 'toggle-ui'); return }
    // 페이지 · 화면 찾아가기: PageUp · PageDown 이전 · 다음 페이지, N · ⇧N 다음 · 이전 화면, Home · End 이전 · 다음 화면(확대 그대로)
    if (!mod && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) { stop(); emit('ui', e.key === 'PageUp' ? 'prev-page' : 'next-page'); return }
    if (!mod && !e.altKey && e.code === 'KeyN') { stop(); stepScreen(e.shiftKey, true); return }
    if (bare && (e.key === 'Home' || e.key === 'End')) { stop(); stepScreen(e.key === 'Home', false); return }
    // 불투명도 ⇧0~⇧9(피그마 한국어 자판과 같아요)
    if (e.shiftKey && !mod && !e.altKey && /^Digit\d$/.test(e.code)) {
      stop()
      const dg = e.code.slice(5)
      const now = Date.now()
      const two = !!opBuf && now - opBuf.t < 700 && opBuf.s.length === 1
      const v = two ? Number(opBuf!.s + dg) / 100 : dg === '0' ? 1 : Number(dg) / 10
      opBuf = two ? null : { s: dg, t: now }
      setOpacity(v)
      return
    }
    // ⌃C 색 추출(맥)
    if (isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyC') { stop(); pickColor(); return }
    // 정렬 ⌥A · ⌥D · ⌥W · ⌥S · ⌥H · ⌥V / 균등 분배 ⌃⌥H · ⌃⌥V (macOS 는 ⌥ 가 e.key 를 바꿔서 e.code 로)
    if (e.altKey && !e.metaKey && !e.shiftKey) {
      const many = multi.value.length > 1
      // 정리(Tidy up) ⌃⌥T
      if (e.ctrlKey && e.code === 'KeyT') {
        if (layerMode && ids.length > 1) { stop(); store.tidy(sid!, ids) } else if (many) { stop(); emit('arrange-screens', { kind: 'tidy' }) }
        return
      }
      if (e.ctrlKey && (e.code === 'KeyH' || e.code === 'KeyV')) {
        const axis = e.code === 'KeyH' ? 'x' : 'y'
        if (layerMode) { stop(); store.distribute(sid!, ids, axis) } else if (many) { stop(); emit('arrange-screens', { kind: 'distribute', axis }) }
        return
      }
      const ALIGN: Record<string, AlignKind> = { KeyA: 'l', KeyD: 'r', KeyW: 't', KeyS: 'b', KeyH: 'c', KeyV: 'm' }
      const k = !e.ctrlKey ? ALIGN[e.code] : undefined
      if (k) {
        if (layerMode) { stop(); store.align(sid!, ids, k) } else if (many) { stop(); emit('arrange-screens', { kind: 'align', k }) }
        return
      }
      // ⌥/ 칠 지우기
      if (e.code === 'Slash' && !e.ctrlKey) { if (layerMode) { stop(); paintKey('noFill') } return }
    }
    // 뒤집기 ⇧H · ⇧V (⇧⌘H 숨기기와 다름)
    if (e.shiftKey && !mod && !e.altKey && (e.code === 'KeyH' || e.code === 'KeyV')) { if (layerMode) { stop(); store.flip(sid!, ids, e.code === 'KeyH' ? 'x' : 'y') } return }
    // 칠 · 선 맞바꾸기 ⇧X · 선 지우기 ⇧/
    if (e.shiftKey && !mod && !e.altKey && (e.code === 'KeyX' || e.code === 'Slash')) { if (layerMode) { stop(); paintKey(e.code === 'KeyX' ? 'swap' : 'noStroke') } return }
    // 실행취소 · 확대
    if (mod && key === 'z') { stop(); if (e.shiftKey) store.redo(); else store.undo(); return }
    if (mod && key === 'y') { stop(); store.redo(); return }
    if (!e.altKey && !e.shiftKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) { stop(); zoomAt(vp.value.zoom * 2); return }
    if (!e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { stop(); zoomAt(vp.value.zoom / 2); return }
    if (mod && !e.shiftKey && e.code === 'Digit0') { stop(); zoomAt(1); return }
    // 1 모두 보이게 · 2 고른 것에 맞추기(피그마 한국어 자판과 같아요 — ⇧ 숫자는 불투명도)
    if (bare && e.code === 'Digit1') { stop(); fit(); return }
    if (bare && e.code === 'Digit2') { stop(); if (sid) fitSelection(); return }
    // 이름 바꾸기 ⌘R(피그마와 같아요): 레이어 하나면 레이어 목록에서 바로, 여러 개면 창, 화면이면 이름표에서.
    // 고른 게 없으면 이 탭만 새로 고침(탭 막대 · 다른 탭은 그대로 — 브라우저 전체 새로고침 대신)
    if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyR') {
      if (layerMode) renameReq.value = pickedLayers(store, sid!, ids)
      else if (sid && !isPageCanvas(sid) && !multi.value.length) renamingFrame.value = sid
      else if (!sid && !multi.value.length) emit('reload')
      return
    }
    // 내용에 맞게 크기 ⌥⇧⌘R(피그마 Resize to fit)
    if (mod && e.shiftKey && e.altKey && e.code === 'KeyR') { if (layerMode && native) store.resizeToFit(sid!, ids); return }
    // 바꿔 붙여넣기 ⇧⌘R · 고른 것 위에 붙여넣기 ⇧⌘V(피그마와 같아요)
    if (mod && e.shiftKey && !e.altKey && e.code === 'KeyR') {
      if (layerMode && lastCopy.value !== 'screen' && store.pasteOnSelection(true)) return
      emit('hint', layerMode ? tr('Copy something first') : tr('Select layers to replace'))
      return
    }
    if (mod && e.shiftKey && !e.altKey && key === 'v') {
      stop()
      if (layerMode && lastCopy.value !== 'screen' && store.pasteOnSelection(false)) return
      doPaste()
      return
    }
    if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyR') { stop(); rulersShown.value = !rulersShown.value; return }
    // ⇧' 픽셀 격자 보이기 · ⇧⌘' 픽셀에 맞추기(피그마와 같아요)
    if (e.shiftKey && !e.altKey && e.code === 'Quote') { stop(); emit('view', mod ? 'snapPixel' : 'pixelGrid'); return }
    // 레이아웃 그리드 보이기 · 숨기기 ⇧G(피그마 Layout guides) · ⌃G
    if (((e.shiftKey && !mod) || (e.ctrlKey && !e.metaKey && !e.shiftKey)) && !e.altKey && e.code === 'KeyG') { stop(); gridsShown.value = !gridsShown.value; emit('hint', gridsShown.value ? tr('Layout grids shown') : tr('Layout grids hidden')); return }
    // 오토 레이아웃 ⇧A · 빼기 ⌥⇧A
    if (e.shiftKey && !mod && e.code === 'KeyA') { if (layerMode && native) { stop(); if (e.altKey) store.removeAutoLayout(sid!, ids); else store.addAutoLayout(sid!, ids) } return }
    // 속성 복사 · 붙여넣기 ⌥⌘C / ⌥⌘V (레이어 · 화면)
    if (mod && e.altKey && e.code === 'KeyC') { stop(); if (sid && !isPageCanvas(sid) || layerMode) { if (store.copyStyle()) emit('hint', tr('Copied properties')) } return }
    if (mod && e.altKey && e.code === 'KeyV') { stop(); if (sid) store.pasteStyle(); return }
    // PNG 로 복사 ⇧⌘C
    if (mod && e.shiftKey && !e.altKey && e.code === 'KeyC') { stop(); copyPng(); return }
    // 내보내기 ⇧⌘E
    if (mod && e.shiftKey && !e.altKey && e.code === 'KeyE') { stop(); exportNow(); return }
    // 복사 · 잘라내기 · 붙여넣기 · 복제
    if (mod && key === 'c') {
      // 레이어 + 섞어 고른 화면 · 여러 화면: 고른 것 전부(피그마와 같아요)
      if (layerMode && store.copy()) { stop(); if (mix.value.length) { lastCopy.value = 'mixed'; emit('clip-screens', [...mix.value]) } else lastCopy.value = 'layers' }
      else if (!layerMode && multi.value.length > 1) { lastCopy.value = 'screen'; emit('clip-screens', [...multi.value]); stop() }
      else if (sid && !layerMode && !isPageCanvas(sid)) { lastCopy.value = 'screen'; emit('screen-action', 'copy'); stop() }
      else return
      markIrisClip(layerMode ? store.clipData() : null, lastCopy.value !== 'layers')
      return
    }
    if (mod && key === 'x') { if (layerMode && store.copy()) { lastCopy.value = 'layers'; stop(); markIrisClip(store.clipData(), false, false); store.remove(sid!, ids) } return }
    // ⌘V 는 막지 않아요: 붙여넣기 이벤트(onPaste)가 다른 앱에서 복사한 그림 · SVG 를 먼저 보고, 없으면 Iris 클립보드를 붙여요
    if (mod && key === 'v') return
    if (mod && key === 'd') {
      stop()
      // 섞어 고른 것 · 여러 화면은 복사 + 붙여넣기와 같아요(고른 것 전부)
      if ((layerMode && mix.value.length) || (!layerMode && multi.value.length > 1)) {
        const keep = lastCopy.value
        if (layerMode && store.copy()) { lastCopy.value = 'mixed'; emit('clip-screens', [...mix.value]) } else { lastCopy.value = 'screen'; emit('clip-screens', [...multi.value]) }
        doPaste()
        lastCopy.value = keep
        return
      }
      // 캔버스의 섹션은 안의 화면까지 함께 복제해요(피그마와 같아요)
      if (layerMode) { if (!irisDuplicate()) store.duplicate() } else if (sid) emit('screen-action', 'duplicate')
      return
    }
    // 모두 고르기 ⌘A(같은 단계 — 레이어를 골랐으면 그 형제, 화면이나 아무것도 안 골랐으면 모든 화면) · 반전 ⇧⌘A · 같은 것 모두 ⌥⌘A
    if (mod && e.code === 'KeyA') {
      stop()
      if (e.altKey) { if (layerMode) selectMatchingSay(store, sid!, (t) => emit('hint', t)); return }
      if (layerMode) { if (e.shiftKey) store.selectInverse(sid!); else store.selectAll(sid!); return }
      const all = realScreens.value.map((v) => v.id)
      const cur = new Set(multi.value.length ? multi.value : sid ? [sid] : [])
      const next = e.shiftKey ? all.filter((id) => !cur.has(id)) : all
      if (!next.length) { store.selectScreen(null); multi.value = []; return }
      store.selectScreen(next[0]!)
      multi.value = next.length > 1 ? next : []
      return
    }
    // 평탄화 ⌥⇧F(피그마) · ⌘E · 마스크 ⌃⌘M · 불리언 ⌥⇧U 합치기 · ⌥⇧S 빼기 · ⌥⇧I 교차 · ⌥⇧E 제외
    if (mod && !e.shiftKey && !e.altKey && e.code === 'KeyE') { if (layerMode && native) { stop(); store.flatten(sid!, ids) } return }
    if (e.metaKey && e.ctrlKey && e.code === 'KeyM') { if (layerMode && native) { stop(); store.toggleMask(sid!, ids) } return }
    if (e.altKey && e.shiftKey && !mod) {
      if (e.code === 'KeyF') { if (layerMode && native) { stop(); store.flatten(sid!, ids) } return }
      const OPS: Record<string, 'union' | 'subtract' | 'intersect' | 'exclude'> = { KeyU: 'union', KeyS: 'subtract', KeyI: 'intersect', KeyE: 'exclude' }
      const op = OPS[e.code]
      if (op) { if (layerMode && native && ids.length > 1) { stop(); store.booleanOp(sid!, ids, op) } return }
    }
    // 섹션으로 감싸기 ⌥⌘S(Iris 단축키 — 피그마는 단축키 없이 메뉴로만): 캔버스 위 레이어 → 섹션, 화면(프레임) → 그 화면들을 감싸는 섹션
    if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
      stop()
      if (layerMode) {
        const d = store.doc(sid!)
        if (isPageCanvas(sid!) && ids.every((id) => !d.nodes[id]?.parentId)) store.wrap(sid!, ids, 'section')
        else emit('hint', tr('Sections can only be placed on the canvas'))
      } else sectionScreens()
      return
    }
    // 묶기 ⌘G(그룹) · ⌥⌘G(프레임으로 감싸기) · ⇧⌘G(풀기)
    if (mod && e.code === 'KeyG') { if (!layerMode) return; stop(); if (e.shiftKey) store.unwrap(sid!, ids); else store.wrap(sid!, ids, e.altKey ? 'frame' : 'group'); return }
    // 숨기기 ⇧⌘H · 잠그기 ⇧⌘L
    if (mod && e.shiftKey && e.code === 'KeyH') { if (layerMode) { stop(); const hide = !store.node(sid!, ids[0]!)?.hidden; store.update(sid!, ids, { hidden: hide }) } return }
    if (mod && e.shiftKey && e.code === 'KeyL') { if (layerMode) { stop(); const lock = !store.node(sid!, ids[0]!)?.locked; store.update(sid!, ids, { locked: lock }) } return }
    // Esc: 선택 모두 풀기(피그마와 같아요 — 안쪽 레이어를 골랐어도 바깥 프레임으로 돌아가지 않고 아무것도 안 고른 상태로)
    if (e.key === 'Escape') {
      store.selectScreen(null)
      multi.value = []
      tool.value = 'move'
      return
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const a = arrows[e.key]
    // 아무것도 안 골랐을 때 방향키: 캔버스 옮기기(피그마와 같아요, ⇧ 크게)
    if (!sid) {
      if (a && !mod && !e.altKey) { stop(); const k = e.shiftKey ? 200 : 40; vp.value = { ...vp.value, x: vp.value.x - a[0] * k, y: vp.value.y - a[1] * k } }
      return
    }
    // 그룹 · 프레임 · 섹션 풀기 ⌘⌫(피그마와 같아요 — 안의 내용은 남겨요)
    if (mod && (e.key === 'Delete' || e.key === 'Backspace')) { stop(); if (layerMode) store.unwrap(sid, ids); return }
    // 지우기
    if (e.key === 'Delete' || e.key === 'Backspace') { stop(); if (layerMode) { if (mix.value.length) emit('screen-action', 'remove'); store.remove(sid, ids) } else emit('screen-action', 'remove'); return }
    // 순서: ⌘] · ⌘[ 한 칸, ] · [ 맨 앞 · 맨 뒤(피그마와 같아요), ⌥⌘] · ⌥⌘[ 도 맨 앞 · 맨 뒤
    // ⌥ 가 e.key 를 바꾸는 맥에서도 되게 e.code 로. 화면만 골랐으면 화면 순서
    if ((e.code === 'BracketRight' || e.code === 'BracketLeft') && !e.shiftKey && (mod || !e.altKey)) {
      stop()
      const up = e.code === 'BracketRight'
      const toEnd = !mod || e.altKey
      if (layerMode) store.arrange(sid, ids, up ? (toEnd ? 'top' : 1) : (toEnd ? 'bottom' : -1))
      else if (!isPageCanvas(sid)) emit('screen-action', up ? (toEnd ? 'front' : 'forward') : (toEnd ? 'back' : 'backward'))
      return
    }
    // 고르기 이동: Enter(안으로 · 텍스트면 고치기) · Shift+Enter · \(부모로) · Tab(다음 레이어)
    if (bare && e.code === 'Backslash' && native) { stop(); store.selectParent(sid); return }
    if (e.key === 'Enter' && native) {
      stop()
      // 인스턴스 안 하위 줄을 골랐으면(피그마와 같아요): Enter = 글자 고치기(전체 선택), Shift+Enter = 인스턴스로 돌아가기
      const sub = subSel.value
      if (sub && sub.sid === sid && ids.length === 1 && ids[0] === sub.id) {
        if (e.shiftKey) { subSel.value = null; return }
        if (sub.kind === 'text' && !store.readonly.value) instEdit.value = { sid: sub.sid, id: sub.id, key: sub.key, all: true }
        return
      }
      if (e.shiftKey) { store.selectParent(sid); return }
      const n = ids.length === 1 ? store.node(sid, ids[0]!) : undefined
      // 글자 여러 개(이 프레임 · 다른 프레임)를 골랐으면 첫 글자를 고치고, 치는 대로 나머지에도 똑같이
      const texts = ids.map((id) => store.node(sid, id)).filter((v) => v?.type === 'text')
      if (n?.type === 'text') store.editing.value = n.id
      else if (texts.length && texts.length === ids.length) store.editing.value = texts[0]!.id
      else if (n && EDITABLE.has(n.type)) enterVectorEdit(sid, n.id) // 도형 · 벡터: Enter = 편집(피그마와 같아요)
      else store.selectChildren(sid)
      return
    }
    if (e.key === 'Tab' && native) { stop(); store.selectSibling(sid, e.shiftKey ? -1 : 1); return }
    if (a) {
      stop()
      const k = e.shiftKey ? 10 : 1
      // ⌘ 방향키: 크기(피그마와 같아요) — → 너비 +, ← 너비 −, ↓ 높이 +, ↑ 높이 −
      if (mod) {
        if (e.altKey) return
        if (layerMode) store.sizeTo(sid, store.topIds(sid, ids).filter((id) => !store.node(sid, id)?.locked), (n) => ({ w: Math.max(1, n.w + a[0] * k), h: Math.max(1, n.h + a[1] * k), ...(n.type === 'text' && a[0] && n.style.autoWidth ? { style: { ...n.style, autoWidth: false } } : {}) }))
        else if (screen && !isPageCanvas(sid)) emit('resize-screen', sid, { x: screen.x, y: screen.y, width: Math.max(1, screen.width + a[0] * k), height: Math.max(1, screen.height + a[1] * k) }, true)
        return
      }
      if (e.altKey) return
      // 오토 레이아웃 안이면 옮기지 않고 순서를 바꿔요(피그마와 같아요)
      const dirOf = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
      if (layerMode && store.moveInFlow(sid, ids, dirOf[e.key as keyof typeof dirOf])) return
      // 함께 고른 다른 문서의 레이어도 같이(실행취소 한 번)
      if (layerMode) store.batch(() => { store.update(sid, store.topIds(sid, ids), (n) => ({ x: n.x + a[0] * k, y: n.y + a[1] * k })); for (const [s2, ids2] of store.xGroups()) store.update(s2, store.topIds(s2, ids2), (n) => ({ x: n.x + a[0] * k, y: n.y + a[1] * k })) })
      else emit('screen-action', 'nudge', a[0] * k, a[1] * k)
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') space.value = false
    if (e.key === 'Alt') altOn.value = false
    if (e.key === 'Meta') { metaHeld.value = false; cmdMarks.value = null }
  }
  const onBlur = () => { altOn.value = false; space.value = false; metaHeld.value = false; cmdMarks.value = null }
  return { onKeyDown, onKeyUp, onBlur }
}
export type CanvasKeys = ReturnType<typeof useCanvasKeys>
