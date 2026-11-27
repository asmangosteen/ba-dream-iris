import type { ScreenRow } from '~/composables/useEditor'
import type { LayerNode } from '~/canvas/schema'
import { useAlHint } from '~/composables/useLayerMenu'
import { aabb, angleOf, apply, invert, layerMatrix, localMatrix, mul, translate, union, type Mat, type Rect } from '~/canvas/geom'
import type { CanvasBase } from './types'

type Ctx = CanvasBase

/** 화면 좌표 계산: 화면 · 레이어의 캔버스 좌표 상자, 고른 것의 상자들(라벨 · 선택 상자는 확대해도 같은 크기로 바깥 층에) */
export function useCanvasGeom(canvas: Ctx) {
  const { props, store, el, vp, multi, mix } = canvas
  // ---------------------------------------------------------------------------
  // 화면 좌표 계산 (라벨 · 선택 상자는 확대해도 같은 크기로 바깥 층에)
  // ---------------------------------------------------------------------------
  const isNative = (s: ScreenRow) => s.source === 'native'
  const isCanvas = (s: { id: string }) => isPageCanvas(s.id)
  /** 캔버스에 그리는 화면들: 캔버스 층 · 숨긴 화면(레이어 목록 눈)은 빼요 — 숨긴 화면은 그리지도, 붙지도, 잡히지도 않아요 */
  const realScreens = computed(() => props.screens.filter((s) => !isCanvas(s) && !store.doc(s.id).frame?.hidden))
  const canvasDoc = computed(() => props.screens.find(isCanvas) ?? null)
  /** 캔버스 위 맨 위 단계 레이어: 섹션 · 뒤로 보내 화면 뒤로 간 레이어(under)는 화면 아래, 나머지는 화면 위(over) */
  const canvasRoots = computed(() => {
    const c = canvasDoc.value
    if (!c) return { under: [] as string[], over: [] as string[] }
    const d = store.doc(c.id)
    const below = (id: string) => d.nodes[id]?.type === 'section' || !!d.nodes[id]?.under
    return { under: d.rootIds.filter(below), over: d.rootIds.filter((id) => !below(id)) }
  })

  const rectOf = (s: { x: number; y: number; width: number; height: number }): Rect => ({ x: s.x, y: s.y, w: s.width, h: s.height })
  /** 피그마 연결 표시(로고)가 차지할 폭: 16, 화면이 아주 작게 보이면 숨김(0) */
  const figTagW = (s: { width: number }) => (s.width * vp.value.zoom >= 40 ? 16 : 0)
  const box = (s: { x: number; y: number; width: number; height: number }) => ({
    left: s.x * vp.value.zoom + vp.value.x + 'px',
    top: s.y * vp.value.zoom + vp.value.y + 'px',
    width: s.width * vp.value.zoom + 'px',
    height: s.height * vp.value.zoom + 'px',
  })
  /** 레이어 크기. 글자 길이에 맞추는 텍스트는 실제 그려진 크기를 씁니다 */
  function layerSize(sid: string, id: string) {
    const n = store.node(sid, id)
    if (!n) return null
    if (n.type === 'text' && import.meta.client) {
      const node = el.value?.querySelector(`[data-screen="${sid}"] [data-layer="${id}"]`) as HTMLElement | null
      if (node) return { w: node.offsetWidth, h: node.offsetHeight }
    }
    return { w: n.w, h: n.h }
  }
  /** 레이어 안쪽 좌표 → 캔버스 좌표 (부모들의 회전 · 뒤집기까지) */
  /** 화면 이름표 자리: 돌린 화면은 돌린 왼쪽 위 모서리에서 같은 각도로(피그마와 같아요) */
  function labelPos(s: ScreenRow) {
    const t = frameTags(s)
    return t ? t.label : { left: box(s).left, top: `calc(${box(s).top} - 20px)` }
  }
  /**
   * 돌린 화면의 이름표 · 크기 표시(피그마와 같아요): 화면 각도를 따라 기울되 거꾸로 서지 않게 — 각도를 ±45° 안으로 줄이고
   * 그때 위에 오는 변의 왼쪽 끝에 이름표, 아래에 오는 변 가운데 아래에 크기 표시
   */
  function frameTags(s: ScreenRow) {
    const rot = scrRot(s)
    return rot ? tagsFor({ cx: s.x + s.width / 2, cy: s.y + s.height / 2, w: s.width, h: s.height, angle: rot }) : null
  }
  /** 돌린 상자(화면 · 레이어 공통)의 이름표 · 크기 표시 자리: 각도를 ±45° 안으로 줄여 위 · 아래에 오는 변을 따라(거꾸로 서지 않게) */
  function tagsFor(g: { cx: number; cy: number; w: number; h: number; angle: number }) {
    const rot = g.angle
    const k = Math.round(rot / 90), eff = rot - k * 90
    const odd = Math.abs(k) % 2 === 1
    const W = odd ? g.h : g.w, H = odd ? g.w : g.h
    const t = (eff * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
    const at = (u: number, v: number) => ({ x: (g.cx + u * cos - v * sin) * vp.value.zoom + vp.value.x, y: (g.cy + u * sin + v * cos) * vp.value.zoom + vp.value.y })
    const tl = at(-W / 2, -H / 2), bc = at(0, H / 2), tr = at(W / 2, -H / 2)
    return {
      label: { left: tl.x + 'px', top: tl.y - 20 + 'px', transform: eff ? `rotate(${eff}deg)` : undefined, transformOrigin: '0 20px' },
      /** 피그마 표시: 같은 위 변의 오른쪽 끝(이름표와 같은 줄) */
      tag: { left: tr.x + 'px', top: tr.y - 20 + 'px', transform: `rotate(${eff}deg) translateX(-100%)`, transformOrigin: '0 20px' },
      size: { left: bc.x + 'px', top: bc.y + 'px', marginTop: '0', transformOrigin: '0 0', transform: `rotate(${eff}deg) translate(-50%, 8px)` },
    }
  }
  /** 화면(맨 위 프레임) 회전(도) — Iris 화면 · 피그마에서 가져온 화면 모두(사용자 요청 2026-11-27) */
  const scrRot = (s: { id: string; source?: string }) => (!isPageCanvas(s.id) ? store.doc(s.id).frame?.rotation ?? 0 : 0)
  /** 화면 안쪽 좌표 → 캔버스 좌표(돌린 화면은 가운데 기준으로 돌려요) */
  /** 화면 뒤집기(Iris · 피그마 화면 모두) */
  const scrFlip = (s: { id: string; source?: string }) => { const f = !isPageCanvas(s.id) ? store.doc(s.id).frame : undefined; return { x: !!f?.flipX, y: !!f?.flipY } }
  /** 화면 모양 변환(CSS): 돌리기 · 뒤집기, 가운데 기준 */
  const scrTf = (s: ScreenRow) => { const r = scrRot(s), f = scrFlip(s); const t = [r ? `rotate(${r}deg)` : '', f.x ? 'scaleX(-1)' : '', f.y ? 'scaleY(-1)' : ''].filter(Boolean).join(' '); return t || undefined }
  const screenMat = (s: ScreenRow): Mat => { const r = scrRot(s), f = scrFlip(s); return r || f.x || f.y ? localMatrix({ x: s.x, y: s.y, rotation: r, flipX: f.x, flipY: f.y }, s.width, s.height) : translate(s.x, s.y) }
  const worldMat = (s: ScreenRow, id: string) => mul(screenMat(s), layerMatrix(store.doc(s.id), id, (k) => layerSize(s.id, k)))
  function parentWorld(s: ScreenRow, id: string): Mat {
    const d = store.doc(s.id)
    const p = d.nodes[id]?.parentId
    return p && d.nodes[p] ? worldMat(s, p) : screenMat(s)
  }
  /** 레이어의 가운데 · 크기 · 캔버스에서 돈 각도 */
  function layerGeom(s: ScreenRow, id: string) {
    const sz = layerSize(s.id, id)
    if (!sz) return null
    const m = worldMat(s, id)
    const c = apply(m, sz.w / 2, sz.h / 2)
    return { id, cx: c.x, cy: c.y, w: sz.w, h: sz.h, angle: angleOf(m) }
  }
  /** 레이어를 감싸는 캔버스 좌표 상자(돌렸으면 돌린 모양을 감싸는) */
  function layerWorld(s: ScreenRow, id: string): Rect | null {
    const sz = layerSize(s.id, id)
    return sz ? aabb(worldMat(s, id), sz.w, sz.h) : null
  }
  const tick = ref(0) // 텍스트 크기 다시 재기
  watch(() => [store.docs, store.editing.value], () => nextTick(() => tick.value++), { deep: true })
  const selScreen = computed(() => props.screens.find((s) => s.id === store.screenId.value) ?? null)
  const selFrame = computed(() => (selScreen.value && !isCanvas(selScreen.value) && !store.doc(selScreen.value.id).frame?.hidden ? selScreen.value : null))
  const multiBoxes = computed(() => [...multi.value, ...mix.value].map((id) => props.screens.find((s) => s.id === id)).filter((s): s is ScreenRow => !!s))
  /** 함께 고른 다른 문서의 레이어(맨 위 것만)를 끌기 시작할 때의 자리 · 부모 행렬 · 기록 시작점 */
  function xCarryStart() {
    const xcarry: { sid: string; id: string; x: number; y: number; inv: Mat }[] = []
    const xbefore: [string, string][] = []
    for (const [sid, ids] of store.xGroups()) {
      const sc = props.screens.find((v) => v.id === sid)
      if (!sc) continue
      const d = store.doc(sid)
      const top = store.topIds(sid, ids).filter((id) => d.nodes[id] && !d.nodes[id]!.locked)
      if (!top.length) continue
      xbefore.push([sid, store.begin(sid)])
      for (const id of top) xcarry.push({ sid, id, x: d.nodes[id]!.x, y: d.nodes[id]!.y, inv: invert(parentWorld(sc, id)) })
    }
    return xcarry.length ? { xcarry, xbefore } : {}
  }
  /** 함께 고른 것까지 감싸는 상자(캔버스 좌표) — 문서를 넘어 고르면 큰 상자 하나 + 크기(손잡이는 없어요) */
  const xAllWorld = computed(() => {
    void tick.value
    if (!store.xsel.value.length) return null
    const s = selScreen.value
    const bs: Rect[] = []
    if (s) for (const id of store.layerIds.value) { const b = layerWorld(s, id); if (b) bs.push(b) }
    for (const x of store.xsel.value) { const sc = props.screens.find((v) => v.id === x.sid); const b = sc ? layerWorld(sc, x.id) : null; if (b) bs.push(b) }
    return bs.length ? union(bs) : null
  })
  /** 함께 고른 다른 문서 레이어의 선택선 */
  const xBoxes = computed<Geom[]>(() => {
    void tick.value
    return store.xsel.value.map((x) => { const sc = props.screens.find((v) => v.id === x.sid); return sc ? layerGeom(sc, x.id) : null }).filter((g): g is Geom => !!g)
  })
  type Geom = NonNullable<ReturnType<typeof layerGeom>>
  const selBoxes = computed<Geom[]>(() => {
    void tick.value
    const s = selScreen.value
    if (!s) return []
    return store.layerIds.value.map((id) => layerGeom(s, id)).filter((g): g is Geom => !!g)
  })
  /**
   * 오토 레이아웃 간격 표시(피그마와 같아요): 오른쪽 패널의 간격 · 여백 칸에 올리면 고른 오토 레이아웃 프레임마다 그 자리를 분홍으로.
   * 자리는 프레임 안 좌표(돌린 프레임은 상자째 돌려요) — 항목 사이 간격은 실제 놓인 자리로 재요(Auto 간격도 맞게)
   */
  const alHint = useAlHint()
  type Zone = { x: number; y: number; w: number; h: number }
  const alZones = computed(() => {
    void tick.value
    const hint = alHint.value
    if (hint === null) return []
    const picks: { sid: string; id: string }[] = [...(selScreen.value ? store.layerIds.value.map((id) => ({ sid: selScreen.value!.id, id })) : []), ...store.xsel.value]
    const out: { key: string; g: Geom; zones: Zone[] }[] = []
    for (const p of picks) {
      const sc = props.screens.find((v) => v.id === p.sid)
      const d = store.doc(p.sid)
      const n = d.nodes[p.id]
      const l = n?.style.layout
      const g = sc ? layerGeom(sc, p.id) : null
      if (!n || !l || !g) continue
      const [pt, pr, pb, pl] = l.padding
      const zones: Zone[] = []
      const W = n.w, H = n.h
      if (hint === 'padH' || hint === 3) zones.push({ x: 0, y: 0, w: pl, h: H })
      if (hint === 'padH' || hint === 1) zones.push({ x: W - pr, y: 0, w: pr, h: H })
      if (hint === 'padV' || hint === 0) zones.push({ x: 0, y: 0, w: W, h: pt })
      if (hint === 'padV' || hint === 2) zones.push({ x: 0, y: H - pb, w: W, h: pb })
      if (hint === 'gap' || hint === 'rowGap') {
        const kids = (n.children ?? []).map((k) => d.nodes[k]).filter((c): c is LayerNode => !!c && !c.hidden && !c.absolute)
        const hz = l.mode === 'horizontal'
        // 줄 나누기(줄바꿈일 때): 가로면 위쪽 자리로, 세로면 왼쪽 자리로 묶어요
        const rows: LayerNode[][] = []
        if (l.wrap) {
          for (const c of [...kids].sort((a, b) => (hz ? a.y - b.y : a.x - b.x))) {
            const row = rows.find((r) => Math.abs((hz ? r[0]!.y : r[0]!.x) - (hz ? c.y : c.x)) < 0.5)
            if (row) row.push(c); else rows.push([c])
          }
        } else rows.push(kids)
        if (hint === 'gap') {
          for (const row of rows) {
            const r = [...row].sort((a, b) => (hz ? a.x - b.x : a.y - b.y))
            // 줄의 옆 방향 범위(줄바꿈이면 그 줄, 아니면 여백 안 전체)
            const c0 = l.wrap ? Math.min(...r.map((c) => (hz ? c.y : c.x))) : hz ? pt : pl
            const c1 = l.wrap ? Math.max(...r.map((c) => (hz ? c.y + c.h : c.x + c.w))) : hz ? H - pb : W - pr
            for (let i = 0; i + 1 < r.length; i++) {
              const a = r[i]!, b = r[i + 1]!
              const s0 = hz ? a.x + a.w : a.y + a.h, s1 = hz ? b.x : b.y
              if (s1 - s0 <= 0.01) continue
              zones.push(hz ? { x: s0, y: c0, w: s1 - s0, h: c1 - c0 } : { x: c0, y: s0, w: c1 - c0, h: s1 - s0 })
            }
          }
        } else {
          const bands = rows.map((r) => ({ a: Math.min(...r.map((c) => (hz ? c.y : c.x))), b: Math.max(...r.map((c) => (hz ? c.y + c.h : c.x + c.w))) })).sort((p, q) => p.a - q.a)
          for (let i = 0; i + 1 < bands.length; i++) {
            const s0 = bands[i]!.b, s1 = bands[i + 1]!.a
            if (s1 - s0 <= 0.01) continue
            zones.push(hz ? { x: pl, y: s0, w: W - pl - pr, h: s1 - s0 } : { x: s0, y: pt, w: s1 - s0, h: H - pt - pb })
          }
        }
      }
      const shown = zones.filter((z) => z.w > 0.01 && z.h > 0.01)
      if (shown.length) out.push({ key: p.sid + ':' + p.id, g, zones: shown })
    }
    return out
  })
  /** 고른 컴포넌트(인스턴스): 피그마처럼 선택선 · 손잡이 · 크기 표시를 보라색으로 */
  const compIds = computed(() => { const s = selScreen.value; return new Set(s ? store.layerIds.value.filter((id) => store.node(s.id, id)?.type === 'instance') : []) })
  const selComp = computed(() => selBoxes.value.length > 0 && selBoxes.value.every((b) => compIds.value.has(b.id)))
  const single = computed(() => {
    if (selBoxes.value.length !== 1 || store.editing.value || store.xsel.value.length) return null
    const b = selBoxes.value[0]!
    const n = store.node(selScreen.value!.id, b.id)
    return { ...b, locked: !!n?.locked, rotation: n?.rotation ?? 0 }
  })
  /** 문서 REQ 미리 보기 상자: 항목(레이어)이 있으면 그 상자들, 없으면 화면 전체 */
  const peekBoxes = computed(() => {
    const out: Record<string, string | undefined>[] = []
    for (const it of props.peek?.items ?? []) {
      const s = props.screens.find((v) => v.id === it.sid)
      if (!s) continue
      const gs = it.ids.map((id) => layerGeom(s, id)).filter((g): g is NonNullable<typeof g> => !!g)
      if (gs.length) for (const g of gs) out.push(rbox(g))
      else { const r = scrRot(s); out.push(r ? { ...box(s), transform: `rotate(${r}deg)` } : box(s)) } // 돌린 화면은 강조도 같이 돌려요
    }
    return out
  })
  /** 돌린 상자를 화면 좌표로: 가운데에 놓고 angle 만큼 돌려요 */
  const rbox = (g: { cx: number; cy: number; w: number; h: number; angle: number }) => ({
    left: (g.cx - g.w / 2) * vp.value.zoom + vp.value.x + 'px',
    top: (g.cy - g.h / 2) * vp.value.zoom + vp.value.y + 'px',
    width: g.w * vp.value.zoom + 'px',
    height: g.h * vp.value.zoom + 'px',
    transform: g.angle ? `rotate(${g.angle}deg)` : undefined,
  })
  /** 크기 · 각도 표시: 돌려도 상자 아래 가운데에 똑바로 */
  function belowBox(g: { cx: number; cy: number; w: number; h: number; angle: number }) {
    const t = (g.angle * Math.PI) / 180
    const half = (Math.abs(Math.sin(t)) * g.w + Math.abs(Math.cos(t)) * g.h) / 2
    return { left: g.cx * vp.value.zoom + vp.value.x + 'px', top: (g.cy + half) * vp.value.zoom + vp.value.y + 'px' }
  }
  const rotating = ref(false)

  const sx = (v: number) => v * vp.value.zoom + vp.value.x
  /** 1px 선을 화면 픽셀에 딱 맞게(자 가이드 선과 같은 굵기 · 진하기 — 반 픽셀에 걸쳐 두껍게 번지지 않게) */
  const crisp = (v: number) => { const d = import.meta.client ? window.devicePixelRatio || 1 : 1; return Math.round(d) % 2 === 0 ? Math.round(v * d) / d : (Math.floor(v * d) + 0.5) / d }
  const sy = (v: number) => v * vp.value.zoom + vp.value.y
  /** 간격 표시 양 끝 눈금 */
  function ticks(l: { x1: number; y1: number; x2: number; y2: number }) {
    const horiz = Math.abs(l.y1 - l.y2) < Math.abs(l.x1 - l.x2)
    const k = 3
    return [[l.x1, l.y1], [l.x2, l.y2]].map(([x, y]) => (horiz ? { x1: sx(x!), y1: sy(y!) - k, x2: sx(x!), y2: sy(y!) + k } : { x1: sx(x!) - k, y1: sy(y!), x2: sx(x!) + k, y2: sy(y!) }))
  }
  return {
    isNative, isCanvas, realScreens, canvasDoc, canvasRoots, rectOf, figTagW, box, labelPos, frameTags, tagsFor, scrRot, scrTf,
    worldMat, parentWorld, layerGeom, layerWorld, tick, selScreen, selFrame, multiBoxes, xCarryStart, xAllWorld, xBoxes, selBoxes,
    alZones, compIds, selComp, single, peekBoxes, rbox, belowBox, rotating, sx, crisp, sy, ticks,
  }
}
export type CanvasGeom = ReturnType<typeof useCanvasGeom>
