import { descendants, isGroupNode, isContainer } from '~/canvas/schema'
import { radiiOf } from '~/canvas/paint'
import { squirclePath } from '~/canvas/squircle'
import { measureGuides, union, type Guides, type Rect } from '~/canvas/geom'
import { HOVER_BOX_ONLY, OUTLINE_TYPES, type CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'
import type { CanvasPick } from './useCanvasPick'

type PointerLike = Pick<PointerEvent, 'target' | 'clientX' | 'clientY' | 'altKey' | 'metaKey'>
type MarkBox = { left: string; top: string; width: string; height: string; borderRadius?: string; path?: string }

type Ctx = CanvasBase & CanvasGeom & CanvasViewport & CanvasPick

/** 마우스 올림 표시 · ⌘ 표시 · 간격 측정(⌥) */
export function useCanvasHover(canvas: Ctx) {
  const {
    props, store, el, tool, vp, multi, dragRef, draft, marqueeOn, guides, isCanvas, canvasDoc, rectOf, box, layerGeom, layerWorld,
    tick, selScreen, multiBoxes, single, rbox, rotating, moving, diveBoolean, pickLayer,
  } = canvas
  // ---------------------------------------------------------------------------
  // 스마트 가이드(끄는 동안) · 간격 측정(⌥ 호버)
  // ---------------------------------------------------------------------------
  const altOn = ref(false)
  /** 마우스를 올린 레이어 — 레이어 목록 줄에 올려도 캔버스에 테두리가 보여요(피그마와 같아요) */
  const hover = useState<{ sid: string; id: string | null } | null>('iris-hover', () => null)
  function trackHover(e: PointerLike) {
    if (altOn.value !== e.altKey) altOn.value = e.altKey
    const t = e.target as HTMLElement | null
    const scr = t?.closest?.('[data-screen]') as HTMLElement | null
    // 캔버스 위 프레임 이름표에 올리면 그 프레임(화면 이름표와 같아요)
    const lab = t?.closest?.('[data-label-layer]') as HTMLElement | null
    const hscr = scr?.dataset.screen ? props.screens.find((v) => v.id === scr.dataset.screen) : undefined
    // 불리언 안 도형: ⌘ 이거나 안쪽 도형을 고른 상태면 불리언 대신 그 자리의 안쪽 도형에 올린 것으로(누르기와 같아요)
    const hid = hscr ? diveBoolean(hscr, pickLayer(hscr.id, (t!.closest('[data-layer]') as HTMLElement | null)?.dataset.layer, e.metaKey), e.clientX, e.clientY, e.metaKey) : undefined
    const next = lab && canvasDoc.value ? { sid: canvasDoc.value.id, id: lab.dataset.labelLayer! } : scr?.dataset.screen ? { sid: scr.dataset.screen, id: hid ?? null } : null
    if (next?.sid !== hover.value?.sid || next?.id !== hover.value?.id) hover.value = next
    const r = el.value?.getBoundingClientRect()
    ptr.value = r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null
    lastClient = { x: e.clientX, y: e.clientY }
    if (metaHeld.value !== e.metaKey) metaHeld.value = e.metaKey
    updateCmd()
  }
  /**
   * 스크롤 · 확대로 캔버스가 움직이면 마우스는 그대로여도 그 아래 레이어가 바뀌어요 — 피그마처럼 그 자리를 다시 찾아 호버를 옮겨요.
   * (pointermove 는 마우스가 움직일 때만 와서, 이게 없으면 스크롤 전에 올렸던 레이어에 테두리가 남아요)
   * 화면이 새 배율로 그려진 직후(flush: 'post')에 같은 프레임 안에서 처리해요
   */
  watch(() => [vp.value.x, vp.value.y, vp.value.zoom], () => {
    if (dragRef.current || !lastClient || !el.value) return
    const t = document.elementFromPoint(lastClient.x, lastClient.y)
    // 마우스가 캔버스 밖(레이어 목록 등)이면 그쪽 호버를 건드리지 않아요
    if (!t || !el.value.contains(t)) return
    trackHover({ target: t, clientX: lastClient.x, clientY: lastClient.y, altKey: altOn.value, metaKey: metaHeld.value })
  }, { flush: 'post' })
  /** 캔버스 밖으로 나가면 캔버스 호버를 지워요(피그마와 같아요). 끄는 중이면 그대로 */
  function leave() {
    if (dragRef.current) return
    lastClient = null
    ptr.value = null
    hover.value = null
    cmdMarks.value = null
  }

  // ---------------------------------------------------------------------------
  // ⌘ + 마우스 올림(피그마와 같아요): 포인터 아래 가장 안쪽 요소를 표시.
  // 글자는 줄마다 밑줄(기본 파랑, 컴포넌트 안 글자는 보라), 도형 · 컴포넌트 · 그 안쪽 요소는 1px 테두리
  // ---------------------------------------------------------------------------
  const metaHeld = ref(false)
  const cmdMarks = ref<{ lines: MarkBox[]; boxes: MarkBox[]; comp: boolean } | null>(null)
  let lastClient: { x: number; y: number } | null = null
  /** 컴포넌트 안은 마우스를 받지 않아서(inert) 자리로 가장 안쪽 요소를 찾아요 */
  function deepestAt(root: Element | null, x: number, y: number): HTMLElement | null {
    let best: HTMLElement | null = null
    const walk = (e: Element) => {
      for (const c of e.children) {
        const r = c.getBoundingClientRect()
        if (r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { best = c as HTMLElement; walk(c) }
      }
    }
    if (root) walk(root)
    return best
  }
  const ownText = (e: Element) => [...e.childNodes].some((n) => n.nodeType === 3 && !!n.textContent?.trim())
  let measureCtx: CanvasRenderingContext2D | null = null
  /** 글자 줄마다 기준선(baseline)에 밑줄(같은 줄 조각은 하나로). thick: 1(고른 글자) · 2(마우스 올림) — 피그마와 같아요 */
  function baselineLines(e: Element, thick: number, hr: DOMRect): MarkBox[] {
    const cs = getComputedStyle(e)
    measureCtx ??= document.createElement('canvas').getContext('2d')
    let asc = 0.8, desc = 0.2
    if (measureCtx) {
      measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const m = measureCtx.measureText('Hg')
      if (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent > 0) { asc = m.fontBoundingBoxAscent; desc = m.fontBoundingBoxDescent }
    }
    const rg = document.createRange()
    rg.selectNodeContents(e)
    const byLine = new Map<number, { l: number; r: number; base: number }>()
    for (const r of rg.getClientRects()) {
      if (!r.width || !r.height) continue
      const base = r.bottom - desc * (r.height / (asc + desc)) // 글자 칸 높이 = ascent + descent(확대 반영)
      const key = Math.round(base)
      const cur = byLine.get(key)
      byLine.set(key, cur ? { l: Math.min(cur.l, r.left), r: Math.max(cur.r, r.right), base: cur.base } : { l: r.left, r: r.right, base })
    }
    return [...byLine.values()].map((v) => ({ left: v.l - hr.left + 'px', top: v.base - hr.top - thick / 2 + 'px', width: v.r - v.l + 'px', height: thick + 'px' }))
  }
  function updateCmd() {
    const host = el.value
    if (!metaHeld.value || !lastClient || !host || dragRef.current || moving.value || store.editing.value || (tool.value !== 'move' && tool.value !== 'scale')) { cmdMarks.value = null; return }
    const hr = host.getBoundingClientRect()
    const box = (e: Element): MarkBox => {
      const r = e.getBoundingClientRect()
      const k = (e as HTMLElement).offsetWidth ? r.width / (e as HTMLElement).offsetWidth : 1
      const rad = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
      const out: MarkBox = { left: r.left - hr.left + 'px', top: r.top - hr.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: rad ? rad * k + 'px' : undefined }
      // Corner smoothing 레이어: 그 모양(squircle) 그대로 1px
      const lid = (e as HTMLElement).dataset?.layer
      const sid = lid ? (e.closest('[data-screen]') as HTMLElement | null)?.dataset.screen : undefined
      const n = lid && sid ? store.node(sid, lid) : null
      const rv = n ? radiiOf(n.style) : null
      if (n && rv && n.type !== 'ellipse' && (n.style.smoothing ?? 0) > 0 && rv.some(Boolean)) {
        const z = vp.value.zoom
        out.path = squirclePath(r.width, r.height, rv.map((x) => x * z) as [number, number, number, number], n.style.smoothing!, -0.5)
        out.borderRadius = undefined
      }
      return out
    }
    // ⌘ 마우스 올림은 '올린 경우'라 굵은 밑줄(2px)
    const lines = (e: Element): MarkBox[] => baselineLines(e, 2, hr)
    const under = document.elementFromPoint(lastClient.x, lastClient.y) as HTMLElement | null
    const ly = under?.closest('.world [data-layer]') as HTMLElement | null
    if (!ly || ly.classList.contains('lk')) { cmdMarks.value = null; return }
    if (ly.classList.contains('instance')) {
      const deep = deepestAt(ly.querySelector('.inst .box'), lastClient.x, lastClient.y)
      cmdMarks.value = deep && ownText(deep) ? { lines: lines(deep), boxes: [], comp: true } : { lines: [], boxes: [box(deep ?? ly)], comp: true }
      return
    }
    if (ly.classList.contains('text')) { cmdMarks.value = { lines: lines(ly.querySelector('.txt') ?? ly), boxes: [], comp: false }; return }
    // 불리언(Union 등)은 모양 하나로 그려져요 — ⌘ 면 불리언 테두리 대신 그 자리의 안쪽 도형 테두리만(누르면 그 도형이 골라져요)
    const lsid = (ly.closest('[data-screen]') as HTMLElement | null)?.dataset.screen
    const lscr = lsid ? props.screens.find((v) => v.id === lsid) : undefined
    if (lscr && ly.dataset.layer && store.node(lscr.id, ly.dataset.layer)?.type === 'boolean') {
      const inner = diveBoolean(lscr, ly.dataset.layer, lastClient.x, lastClient.y, true)
      if (inner && inner !== ly.dataset.layer) {
        const g = layerGeom(lscr, inner)
        cmdMarks.value = g && !g.angle ? { lines: [], boxes: [rbox(g)], comp: false } : null
        return
      }
    }
    cmdMarks.value = { lines: [], boxes: [box(ly)], comp: false }
  }
  watch(() => [vp.value.x, vp.value.y, vp.value.zoom], () => { cmdMarks.value = null })
  /** 고른 글자 레이어: 줄마다 기준선 밑줄 — 마우스를 안 올리면 얇게(1px), 올리면 굵게(2px) */
  const selTextLines = computed<MarkBox[]>(() => {
    void tick.value
    void vp.value
    const s = selScreen.value
    const host = el.value
    if (!s || !host || moving.value || store.editing.value || guides.value) return []
    const hr = host.getBoundingClientRect()
    const out: MarkBox[] = []
    for (const id of store.layerIds.value) {
      if (store.node(s.id, id)?.type !== 'text') continue
      const t = host.querySelector(`.world [data-screen="${s.id}"] [data-layer="${id}"] .txt`)
      if (!t) continue
      const hot = hover.value?.sid === s.id && hover.value?.id === id
      out.push(...baselineLines(t, hot ? 2 : 1, hr))
    }
    return out
  })

  // ---------------------------------------------------------------------------
  // 피그마식 표시: 마우스 올림 테두리 · 고른 레이어의 부모 점선 · 오토 레이아웃 간격
  // 모두 바깥 층(화면 좌표)에 그려서 확대 · 축소와 상관없이 늘 1px
  // ---------------------------------------------------------------------------
  const ptr = ref<{ x: number; y: number } | null>(null)
  const hoverOutline = computed(() => {
    void tick.value
    const h = hover.value
    if (!h || marqueeOn.value || draft.value || guides.value || store.editing.value || (tool.value !== 'move' && tool.value !== 'scale')) return null
    const s = props.screens.find((v) => v.id === h.sid)
    if (!s) return null
    if (!h.id) {
      // 화면(프레임): 이미 고른 화면이면 선택 상자가 있으니 생략
      if (isCanvas(s) || (store.screenId.value === s.id && !store.layerIds.value.length) || multi.value.includes(s.id)) return null
      return { frame: s.id, comp: false, style: box(s) }
    }
    if (store.screenId.value === s.id && store.layerIds.value.includes(h.id)) return null
    const n = store.node(s.id, h.id)
    if (!n || n.locked || (!HOVER_BOX_ONLY && OUTLINE_TYPES.has(n.type))) return null
    const g = layerGeom(s, h.id)
    if (!g) return null
    // 어떤 레이어든(둥근 모서리 · 원 · 선 · 벡터 · 글자) 마우스를 올리면 네모 상자 2px — 모양을 따라가지 않아요
    if (HOVER_BOX_ONLY) return { frame: null, comp: n.type === 'instance', style: rbox(g) }
    const z = vp.value.zoom
    const rv = radiiOf(n.style)
    // Corner smoothing 이 있으면 그 모양(squircle) 그대로 2px — 바깥으로 1px 밀어 선 가운데가 모양 밖 1px 에 오게
    const sm = n.type !== 'ellipse' && (n.style.smoothing ?? 0) > 0 && rv.some(Boolean) ? n.style.smoothing! : 0
    if (sm) {
      const path = squirclePath(g.w * z, g.h * z, rv.map((x) => x * z) as [number, number, number, number], sm, -1)
      return { frame: null, comp: n.type === 'instance', path, style: rbox(g) }
    }
    const r = n.type === 'ellipse' ? '50%' : rv.some(Boolean) ? rv.map((x) => x * z + 'px').join(' ') : undefined
    return { frame: null, comp: n.type === 'instance', style: { ...rbox(g), borderRadius: r } }
  })
  /** 마우스를 올린 것이 일반 글자 레이어면(그룹 · 오토 레이아웃 안이 아니면): 상자 대신 줄마다 기준선 밑줄 2px(피그마와 같아요) */
  const hoverTextLines = computed<MarkBox[]>(() => {
    void tick.value
    void vp.value
    const h = hover.value
    const host = el.value
    if (!h?.id || !hoverOutline.value || !host) return []
    const d = store.doc(h.sid)
    const n = d.nodes[h.id]
    if (n?.type !== 'text') return []
    // 그룹 · 오토 레이아웃 안 글자는 상자 그대로, 화면 · 일반 프레임에 바로 놓인 글자만 밑줄(사용자 요청 2026-11-25)
    const p = n.parentId ? d.nodes[n.parentId] : null
    if (p && (isGroupNode(p) || p.style.layout || p.type === 'boolean')) return []
    if (!p && d.frame?.layout) return []
    const t = host.querySelector(`.world [data-screen="${h.sid}"] [data-layer="${h.id}"] .txt`)
    return t ? baselineLines(t, 2, host.getBoundingClientRect()) : []
  })
  /** 마우스를 올린 오토 레이아웃 프레임의 바로 아래 자식들: 피그마처럼 1px 점선. 일반 프레임 · 화면은 점선 없이 테두리만 */
  const hoverKids = computed(() => {
    void tick.value
    const h = hover.value
    const ho = hoverOutline.value
    if (!h || !ho) return []
    const s = props.screens.find((v) => v.id === h.sid)
    if (!s) return []
    const d = store.doc(s.id)
    const hn = h.id ? d.nodes[h.id] : null
    const lay = h.id ? hn?.style.layout : d.frame?.layout
    if (!lay) return []
    const ids = h.id ? (hn && isContainer(hn) ? hn.children ?? [] : []) : d.rootIds
    return ids
      .filter((id) => d.nodes[id] && !d.nodes[id]!.hidden)
      .slice(0, 80)
      .map((id) => layerGeom(s, id))
      .filter((g): g is NonNullable<ReturnType<typeof layerGeom>> => !!g)
      .map((g) => rbox(g))
  })
  /** 하나 고르면 그 부모가 오토 레이아웃 프레임일 때만 테두리를 점선으로. 일반 프레임 · 그룹 · 화면은 표시 없음 — 피그마와 같아요 */
  const parentOutline = computed(() => {
    void tick.value
    const sg = single.value
    const s = selScreen.value
    if (!sg || !s || rotating.value) return null
    const p = store.node(s.id, sg.id)?.parentId
    // 부모가 오토 레이아웃일 때만(자리를 레이아웃이 정하니까) — 일반 프레임 · 그룹은 점선 없음(피그마와 같아요)
    if (!p || !store.node(s.id, p)?.style.layout) return null
    const g = layerGeom(s, p)
    return g ? rbox(g) : null
  })
  /** ⌥ 를 누른 채 옮기거나 크기를 바꾸는 동안 잴 상대(피그마와 같아요): 포인터 아래 고르지 않은 레이어, 없으면 고른 것의 부모(프레임) */
  const dragHover = ref<{ sid: string; id: string | null } | null>(null)
  function dragTarget(e: PointerEvent, sid: string): { sid: string; id: string | null } {
    const d = store.doc(sid)
    const sel = store.layerIds.value
    const mine = (id: string) => sel.some((k) => k === id || descendants(d, k).includes(id))
    for (const node of document.elementsFromPoint(e.clientX, e.clientY)) {
      const lay = (node as HTMLElement).closest?.('[data-layer]') as HTMLElement | null
      const scr = lay?.closest('[data-screen]') as HTMLElement | null
      const id = lay?.dataset.layer
      if (id && scr?.dataset.screen === sid && d.nodes[id] && !mine(id)) return { sid, id }
    }
    const parent = sel.length ? d.nodes[sel[0]!]?.parentId ?? null : null
    return { sid, id: parent }
  }
  const measure = computed<Guides | null>(() => {
    void tick.value
    const s = selScreen.value
    const h = dragHover.value ?? hover.value
    if (!altOn.value || !h || (guides.value && !dragHover.value) || !s || store.editing.value) return null
    const hs = props.screens.find((v) => v.id === h.sid)
    if (!hs) return null
    // 고른 것: 레이어들, 없으면 고른 화면(프레임)들 — 프레임끼리 · 캔버스 위에서도 재요
    const sel = store.layerIds.value.length
      ? store.layerIds.value.map((id) => layerWorld(s, id)).filter((b): b is Rect => !!b)
      : isCanvas(s) ? [] : (multi.value.length ? multiBoxes.value : [s]).map(rectOf)
    if (!sel.length) return null
    // 화면만 골랐을 때 그 화면 자신(이나 그 안)을 가리키면 잴 것이 없어요
    if (!store.layerIds.value.length && (multi.value.length ? multi.value.includes(hs.id) : hs.id === s.id) && !h.id) return null
    let id = h.id
    // 고른 레이어(나 그 안)를 가리키면 부모와 견줘요
    if (id && hs.id === s.id) {
      const d = store.doc(s.id)
      const own = store.layerIds.value.find((k) => descendants(d, k).includes(id!))
      if (own) id = d.nodes[own]?.parentId ?? null
    }
    // 화면(프레임)을 골랐으면 다른 화면은 화면째로 재요(피그마와 같아요). 안쪽 레이어는 화면을 고르지 않았을 때만
    if (!store.layerIds.value.length && !isCanvas(hs)) id = null
    let target = id ? layerWorld(hs, id) : isCanvas(hs) ? null : rectOf(hs)
    // 화면 밖으로 넘쳐 잘린 부분은 빼고 보이는 만큼만
    if (target && id && !isCanvas(hs)) {
      const f = rectOf(hs)
      const x0 = Math.max(target.x, f.x), y0 = Math.max(target.y, f.y), x1 = Math.min(target.x + target.w, f.x + f.w), y1 = Math.min(target.y + target.h, f.y + f.h)
      target = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
    }
    return target ? measureGuides(union(sel), target) : null
  })
  // ⌥ 를 누른 채 끄는 중이면 붙는 선 대신 간격 재기를 보여요
  const shown = computed(() => (dragHover.value && measure.value ? measure.value : guides.value ?? measure.value))
  return {
    altOn, hover, trackHover, leave, metaHeld, cmdMarks, updateCmd, selTextLines, ptr, hoverOutline, hoverTextLines, hoverKids,
    parentOutline, dragHover, dragTarget, shown, baselineLines,
  }
}
export type CanvasHover = ReturnType<typeof useCanvasHover>
