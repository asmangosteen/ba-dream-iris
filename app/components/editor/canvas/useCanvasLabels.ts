import type { ScreenRow } from '~/composables/useEditor'
import { isContainer } from '~/canvas/schema'
import { topImagePaint } from '~/canvas/paint'
import { startCrop } from '~/composables/useImageEdit'
import { instEdit, subAt, subSel } from '~/composables/useInstanceTree'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasPick } from './useCanvasPick'
import type { CanvasVector } from './useVectorEdit'
import type { CanvasDragStart } from './useDragStart'

type Ctx = CanvasBase & CanvasGeom & CanvasPick & CanvasVector & CanvasDragStart

/** 프레임 이름표(이름 고치기) · 두 번 누르기 */
export function useCanvasLabels(canvas: Ctx) {
  const {
    props, emit, store, tool, vp, frameImg, isNative, canvasDoc, box, layerWorld, tick, booleanChildAt, pickLayer, vedit,
    enterVectorEdit, press,
  } = canvas
  /** 더블클릭으로 글자 편집을 시작한 자리(LayerView 가 그 자리 단어를 골라요) */
  const editAt = useState<{ x: number; y: number } | null>('iris-edit-at', () => null)
  /**
   * 두 번 누르기: 텍스트는 글자 고치기, 벡터 · 도형은 점 편집.
   * 캔버스가 포인터를 붙잡고 있으면(setPointerCapture) dblclick 이 레이어가 아니라 캔버스로 와서, 누른 자리 아래 요소를 직접 찾아요
   */
  /** 프레임 이름표 두 번 누르기: 그 자리에서 이름 고치기(피그마처럼) */
  const renamingScreen = ref<string | null>(null)
  const renameSection = useState<{ sid: string; id: string } | null>('iris-rename-section', () => null)
  function commitScreenName(id: string, e: Event) {
    if (renamingScreen.value !== id) return
    renamingScreen.value = null
    const name = (e.target as HTMLInputElement).value.trim()
    const s = props.screens.find((v) => v.id === id)
    if (s && name && name !== s.name) emit('rename-screen', id, name)
  }
  /**
   * 캔버스 위(화면 밖) 프레임 레이어 이름표: 피그마처럼 맨 위 단계(섹션 안 포함) 프레임 위에 이름. 그룹(자르기 없음 · 칠 없음)은 이름표 없음.
   * 누르면 그 프레임을 고르고, 두 번 누르면 그 자리에서 이름 고치기
   */
  const frameLabels = computed(() => {
    void tick.value
    void vp.value
    const c = canvasDoc.value
    if (!c) return []
    const d = store.doc(c.id)
    return Object.values(d.nodes)
      .filter((n) => n.type === 'frame' && !n.hidden && !(n.style.clip === false && !n.style.fill && !n.style.fills?.length) && (!n.parentId || d.nodes[n.parentId]?.type === 'section'))
      .map((n) => { const b = layerWorld(c, n.id); return b ? { id: n.id, name: n.name, box: box({ x: b.x, y: b.y, width: b.w, height: b.h }) } : null })
      .filter((v): v is NonNullable<typeof v> => !!v)
  })
  const renamingFrame = ref<string | null>(null)
  function pickFrameLabel(id: string) { const c = canvasDoc.value; if (c) { tool.value = 'move'; store.selectLayer(c.id, id) } }
  function commitFrameName(id: string, e: Event) {
    if (renamingFrame.value !== id) return
    renamingFrame.value = null
    const c = canvasDoc.value
    const name = (e.target as HTMLInputElement).value.trim()
    if (c && name && name !== store.node(c.id, id)?.name) store.update(c.id, [id], { name })
  }
  function onDblAny(e: MouseEvent) {
    // 점 편집 중 두 번 누르기(점 · 선 손잡이 말고): 편집 끝(피그마와 같아요)
    if (vedit.value) { if (!(e.target as Element | null)?.closest?.('.an, .hd, .vs-hit')) vedit.value = null; return }
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const lab = hit?.closest('.label') as HTMLElement | null
    if (lab?.dataset.screen) { renamingScreen.value = lab.dataset.screen; return }
    // 섹션 이름표 두 번 누르기 → 그 자리에서 이름 고치기(LayerView)
    const sec = hit?.closest('[data-sec]') as HTMLElement | null
    const secScr = sec?.closest('[data-screen]') as HTMLElement | null
    if (sec?.dataset.sec && secScr?.dataset.screen) { renameSection.value = { sid: secScr.dataset.screen, id: sec.dataset.sec }; return }
    const scrEl = hit?.closest('[data-screen]') as HTMLElement | null
    const screen = scrEl ? props.screens.find((v) => v.id === scrEl.dataset.screen) : undefined
    if (screen && hit) onDbl(hit, screen, e)
  }
  function onDbl(target: HTMLElement, screen: ScreenRow, ev?: MouseEvent) {
    const deepest = (target.closest('[data-layer]') as HTMLElement | null)?.dataset.layer
    if (!deepest || !isNative(screen)) return
    // 판단은 '두 번 누르기 직전'(첫 누름 전) 선택 기준 — 빠르게 누르는 사이 첫 누름이 부모를, 둘째 누름이 안쪽을 골라도
    // 결과가 천천히 두 번 누른 것과 같아요(피그마와 같아요)
    const before = press.sid === screen.id ? press.sel : []
    const lid = pickLayer(screen.id, deepest, false, before)
    if (!lid) return
    const n = store.node(screen.id, lid)
    if (!n) return
    // 불리언(피그마와 같아요): 한 번 누르면 합친 면, 두 번 누르면 누른 자리의 안쪽 도형
    if (n.type === 'boolean' && ev) {
      const child = booleanChildAt(screen, lid, ev.clientX, ev.clientY)
      if (child) { store.selectLayer(screen.id, child); return }
    }
    // 마스크 그룹(피그마와 같아요): 마스크는 그려지지 않아 요소로 안 잡혀요 — 보이는 내용이 없는 자리를 두 번 누르면, 그 자리가 마스크 모양 안일 때 마스크를 골라요
    if (isContainer(n) && lid === deepest && ev) {
      const m = booleanChildAt(screen, lid, ev.clientX, ev.clientY, (c) => !!c.isMask)
      if (m) { store.selectLayer(screen.id, m); return }
    }
    // 프레임 · 그룹(오토 레이아웃 포함): 한 단계만 안으로 — 누른 자리의 바로 아래 레이어를 골라요
    if (isContainer(n) && n.type !== 'section' && lid !== deepest) {
      const d = store.doc(screen.id)
      let c: string | null | undefined = deepest
      while (c && d.nodes[c]?.parentId !== lid) c = d.nodes[c]?.parentId
      if (c) { store.selectLayer(screen.id, c); return }
    }
    // 디자인 시스템 인스턴스(피그마와 같아요): 두 번 누르면 누른 자리의 하위 줄을 고르고, 글자면 그 자리에서 바로 고치기
    if (n.type === 'instance' && ev) {
      const sn = subAt(screen.id, lid, ev.clientX, ev.clientY)
      if (sn) {
        store.selectLayer(screen.id, lid)
        subSel.value = { sid: screen.id, id: lid, key: sn.key, kind: sn.kind, name: sn.name }
        const ov = n.subOverrides?.[sn.key]
        if (sn.kind === 'text' && !n.locked && !ov?.locked && !ov?.hidden && !store.readonly.value) instEdit.value = { sid: screen.id, id: lid, key: sn.key, at: { x: ev.clientX, y: ev.clientY } }
        return
      }
    }
    if (n.type === 'text' && !n.locked) {
      // 여러 글자를 함께 골라 둔 채면 선택은 그대로 — 고치는 글자가 함께 고른 글자에도 똑같이 들어가요(다른 프레임 것도)
      const inX = store.xsel.value.some((x) => x.sid === screen.id && x.id === lid)
      const many = store.layerIds.value.length + store.xsel.value.length > 1
      const picked = inX || (store.screenId.value === screen.id && store.layerIds.value.includes(lid))
      if (many && picked) { if (inX) store.promoteX(screen.id) } else store.selectLayer(screen.id, lid)
      // 누른 자리의 단어를 골라 고치기 시작(피그마와 같아요) — Enter 로 들어가면 전체
      if (ev) editAt.value = { x: ev.clientX, y: ev.clientY }
      store.editing.value = lid
      return
    }
    // 도형: 이미 골라 둔 것이거나 맨 위 단계에서 바로 잡히는 것이면 편집, 막 안으로 들어가 골라진 것이면 고르기만
    const direct = before.includes(lid) || pickLayer(screen.id, deepest, false, []) === lid
    if (!direct) { store.selectLayer(screen.id, lid); return }
    if (tool.value !== 'move' && tool.value !== 'scale') return
    // 이미지 칠이 있는 사각형: 이미지 자르기 편집 + 칠 창(피그마와 같아요 — 두 번 누르면 이미지 편집)
    if (n.type === 'rect' && !n.locked && topImagePaint(n.style)) { store.selectLayer(screen.id, lid); void startCrop(store, frameImg, screen.id, lid, { open: true }); return }
    enterVectorEdit(screen.id, lid)
  }
  return { renamingScreen, commitScreenName, frameLabels, renamingFrame, pickFrameLabel, commitFrameName, onDblAny }
}
export type CanvasLabels = ReturnType<typeof useCanvasLabels>
