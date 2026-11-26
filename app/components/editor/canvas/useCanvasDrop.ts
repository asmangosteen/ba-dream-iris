import { DS_DRAG } from '~/composables/useDsInstances'
import type { Rect } from '~/canvas/geom'
import { INSERT_SIZE, STORY_SIZE } from '~/components/editor/InstanceView.vue'
import { FIGMA_DROP_HINT, type CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick

/** 파일 · 디자인 시스템 컴포넌트 끌어 놓기 */
export function useCanvasDrop(canvas: Ctx) {
  const { props, emit, store, el, tool, canvasDoc, rectOf, layerWorld, toWorld, frameAt, screenUnder, overFigmaOnly } = canvas
  // 파일 끌어 놓기(이미지 · SVG)
  function onDragOver(e: DragEvent) { if (e.dataTransfer) e.dataTransfer.dropEffect = [...e.dataTransfer.types].some((t) => t === 'Files' || t === DS_DRAG) ? 'copy' : 'none' }
  function onDrop(e: DragEvent) {
    dropAt.value = null
    // 디자인 시스템 컴포넌트 끌어 놓기 → 인스턴스(놓은 자리, Iris 화면 위면 그 안 · 가장 안쪽 프레임으로)
    const comp = e.dataTransfer?.getData(DS_DRAG)
    const w = toWorld(e.clientX, e.clientY)
    if (comp) { insertInstance(comp, w); if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT)); return }
    const files = [...(e.dataTransfer?.files ?? [])]
    if (!files.length) return
    if (overFigmaOnly(w.x, w.y)) emit('hint', tr(FIGMA_DROP_HINT))
    const t = dropTarget(w.x, w.y)
    emit('drop-files', files, w, t ? { sid: t.sid, parentId: t.parentId } : undefined)
  }
  /**
   * 이미지 · 영상 파일을 놓을 곳(피그마와 같아요): 포인터 아래 Iris 화면 → 그 안 가장 안쪽 프레임, 화면 밖이면 캔버스 위 프레임 · 캔버스.
   * 피그마에서 가져온 화면 위는 넣을 수 없어서 캔버스 위로
   */
  function dropTarget(wx: number, wy: number) {
    const scr = screenUnder(wx, wy)
    const target = scr ?? canvasDoc.value
    if (!target) return null
    const lx = scr ? wx - scr.x : wx, ly = scr ? wy - scr.y : wy
    const parentId = frameAt(target.id, lx, ly)
    return { sid: target.id, screen: scr, parentId }
  }
  /** 파일을 끌고 있는 동안 놓일 자리(화면 · 프레임) 테두리 */
  const dropAt = ref<Rect | null>(null)
  /** 레이어를 끌 때는 테두리만(파일 끌어 놓기는 옅은 바탕까지) */
  const dropLine = ref(false)
  function setDropLine(r: Rect | null) {
    dropLine.value = !!r
    if (r?.x !== dropAt.value?.x || r?.y !== dropAt.value?.y || r?.w !== dropAt.value?.w || r?.h !== dropAt.value?.h) dropAt.value = r
  }
  function onFileDragOver(e: DragEvent) {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
    const w = toWorld(e.clientX, e.clientY)
    const t = dropTarget(w.x, w.y)
    const sc = t ? props.screens.find((v) => v.id === t.sid) : null
    const r = t && sc ? (t.parentId ? layerWorld(sc, t.parentId) : t.screen ? rectOf(t.screen) : null) : null
    if (r?.x !== dropAt.value?.x || r?.y !== dropAt.value?.y || r?.w !== dropAt.value?.w || r?.h !== dropAt.value?.h) dropAt.value = r ?? null
  }
  function onDragLeave(e: DragEvent) { if (!e.relatedTarget || !el.value?.contains(e.relatedTarget as Node)) dropAt.value = null }
  const FULL_WIDTH = new Set(['BottomSheet', 'BottomBar', 'TopBar', 'NavBarTop', 'ListCommon', 'TextInput', 'TextArea', 'SearchField', 'ButtonGroup', 'Tab', 'SegmentedControl', 'NoticeBox', 'Divider', 'Footer', 'StatusBar', 'InputBar', 'ListSelect', 'ListSort', 'FileRow', 'MapBottomBar', 'MapBottomGuide', 'PostComment', 'PostReply'])
  /** 디자인 시스템 컴포넌트 인스턴스 넣기(캔버스 좌표). at 이 없으면 보이는 캔버스 가운데 */
  function insertInstance(component: string, at?: { x: number; y: number }) {
    const c = at ?? toWorld(window.innerWidth / 2, window.innerHeight / 2)
    const scr = screenUnder(c.x, c.y)
    const target = scr ?? canvasDoc.value
    if (!target) return
    const lx = scr ? c.x - scr.x : c.x, ly = scr ? c.y - scr.y : c.y
    const parentId = frameAt(target.id, lx, ly)
    const p = parentId ? store.absPos(target.id, parentId) : { x: 0, y: 0 }
    // 화면 폭을 채우는 컴포넌트는 부모(없으면 화면) 폭에 맞춰 고정 폭으로
    const full = !STORY_SIZE[component] && FULL_WIDTH.has(component)
    const pw = parentId ? store.node(target.id, parentId)?.w : scr ? scr.width : 375
    // 스토리북 기준 크기(InstanceView STORY_SIZE): 고정 폭(높이까지 정해진 것은 높이도) · 나머지는 Hug. 목록에 없으면 예전처럼(화면 폭 채우기 · Hug)
    const fixed = INSERT_SIZE[component]
    // 가운데에 여러 번 넣으면 조금씩 비켜서
    const nudge = at ? 0 : (Object.values(store.doc(target.id).nodes).filter((n) => n.type === 'instance').length % 8) * 16
    const w0 = fixed ? fixed.w : full ? pw ?? 375 : 120, h0 = fixed?.h ?? 48
    // 끌어 놓기(at): 놓은 자리가 가운데(사용자 요청 — 왼쪽 위가 아니라). 부모 안 좌표
    const cx = lx - p.x, cy = ly - p.y
    const sid = target.id
    const id = store.add(sid, parentId, { type: 'instance', name: component, component, props: {}, x: full ? 0 : Math.round(at ? cx - w0 / 2 : cx + nudge), y: Math.round(at ? cy - h0 / 2 : cy + nudge), w: w0, h: h0, sizeH: full || fixed ? undefined : 'hug', sizeV: fixed?.h ? undefined : 'hug' })
    // 내용 크기(Hug)는 그려진 뒤 정해져요 — 크기가 정해지면 다시 가운데로(기록 없이 자리만, 잠깐 동안만 지켜봐요)
    if (at) {
      const stop = watch(() => { const n = store.node(sid, id); return n ? `${n.w}x${n.h}` : '' }, () => {
        const n = store.node(sid, id)
        if (!n) return
        if (!full) n.x = Math.round(cx - n.w / 2)
        n.y = Math.round(cy - n.h / 2)
      })
      setTimeout(stop, 1500)
    }
    tool.value = 'move'
  }
  return { onDragOver, onDrop, dropAt, dropLine, setDropLine, onFileDragOver, onDragLeave, insertInstance }
}
export type CanvasDrop = ReturnType<typeof useCanvasDrop>
