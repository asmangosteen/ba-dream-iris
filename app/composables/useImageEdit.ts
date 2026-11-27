import type { ImageCrop, LayerNode, LayerStyle, Paint } from '~/canvas/schema'
import { coverCrop, strokePad } from '~/canvas/paint'
import type { useLayerStore } from '~/canvas/store'

/**
 * 이미지 자르기 편집(피그마 Crop): 사각형의 이미지 칠을 캔버스에서 바로 자르기.
 * - 들어가기: 캔버스에서 이미지를 두 번 누르기 · 칠 창에서 'Crop' 고르기
 * - 하는 동안: 레이어 상자 = 자르는 창, 이미지 = 파란 상자(끌어서 옮기기 · 모서리로 크기). 창 밖 이미지는 흐리게
 * - 아래 막대: 확대 막대 · 비율(원래 · 1:1 · 원 · 가로 · 세로) · 처음처럼 덮기 · Cancel · ✓
 * - 끝내기: ✓ · Enter · 바깥 누르기 = 적용(실행취소 한 번), Cancel · Esc = 처음대로
 * 편집 중에는 store.hold 로 기록을 모았다가 끝날 때 한 번에 기록해요
 */
type Store = ReturnType<typeof useLayerStore>
type ImagePaint = Extract<Paint, { type: 'image' }>
export interface ImageEdit {
  sid: string
  id: string
  /** 칠 목록 안 자리 */
  i: number
  /** 어느 칠 목록: 채우기(fills, 기본) · 선(strokes — 선 바깥 끝까지 넓힌 상자 기준, 사용자 요청 2026-11-27) */
  key?: 'fills' | 'strokes'
  /** 처음 모습(Cancel 로 되돌려요) */
  before: Pick<LayerNode, 'x' | 'y' | 'w' | 'h'> & { style: LayerStyle }
  /** 칠 창을 열어 달라는 표시(두 번 눌러 들어왔을 때 — Fill 패널이 받아서 열고 지워요) */
  open?: boolean
}
const state = shallowRef<ImageEdit | null>(null)
export const useImageEdit = () => state

/** 이미지 원래 크기 읽기(칠에 iw · ih 가 없을 때 — 예전 파일) */
function natural(url?: string): Promise<{ w: number; h: number } | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im.naturalWidth && im.naturalHeight ? { w: im.naturalWidth, h: im.naturalHeight } : null)
    im.onerror = () => resolve(null)
    im.src = url
  })
}
/** 지금 맞춤(Fill · Fit · Tile)이 보여 주던 자리 → 자르기 자리 */
export function cropFromFit(p: ImagePaint, nw: number, nh: number): ImageCrop {
  const ar = p.iw && p.ih ? p.iw / p.ih : nw / nh
  const nr = nw / nh
  if ((p.fit ?? 'fill') === 'crop' && p.crop) return p.crop
  if (p.fit === 'fit') {
    if (ar > nr) { const h = nr / ar; return { x: 0, y: (1 - h) / 2, w: 1, h } }
    const w = ar / nr
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  return coverCrop(ar, nr)
}
export function imagePaintAt(n: LayerNode | undefined, i: number, key: 'fills' | 'strokes' = 'fills'): ImagePaint | null {
  const p = n?.style[key]?.[i]
  return p && p.type === 'image' ? p : null
}
/** 편집 중 칠 고치기(기록 없이 — hold 중) */
export function patchImage(store: Store, e: ImageEdit, fn: (p: ImagePaint, n: LayerNode) => ImagePaint, geom?: Partial<Pick<LayerNode, 'x' | 'y' | 'w' | 'h'>>, stylePatch?: Partial<LayerStyle>) {
  store.update(e.sid, [e.id], (n) => {
    const key = e.key ?? 'fills'
    const p = imagePaintAt(n, e.i, key)
    if (!p) return {}
    const style: LayerStyle = { ...n.style, ...stylePatch, [key]: (n.style[key] ?? []).map((x, k) => (k === e.i ? fn(p, n) : x)) }
    for (const k of Object.keys(stylePatch ?? {}) as (keyof LayerStyle)[]) if (style[k] === undefined) delete style[k]
    return { ...geom, style }
  })
}

/**
 * 자르기 시작. i 를 안 주면 맨 위(보이는) 이미지 칠. 이미 다른 것을 자르는 중이면 그것부터 적용해요
 */
export async function startCrop(store: Store, img: (src?: string) => string | undefined, sid: string, id: string, opts: { i?: number; open?: boolean; key?: 'fills' | 'strokes' } = {}): Promise<boolean> {
  const n0 = store.node(sid, id)
  if (!n0 || n0.locked) return false
  const key = opts.key ?? 'fills'
  const fills = n0.style[key] ?? []
  let i = opts.i ?? -1
  if (i < 0) for (let k = fills.length - 1; k >= 0; k--) { const f = fills[k]!; if (f.type === 'image' && f.visible !== false) { i = k; break } }
  const p0 = imagePaintAt(n0, i, key)
  if (!p0) return false
  if (state.value) endCrop(store, true)
  let { iw, ih } = p0
  if (!iw || !ih) { const s = await natural(img(p0.src)); if (s) { iw = s.w; ih = s.h } }
  const n = store.node(sid, id)
  if (!n || !imagePaintAt(n, i, key)) return false
  const before = { x: n.x, y: n.y, w: n.w, h: n.h, style: JSON.parse(JSON.stringify(n.style)) as LayerStyle }
  store.hold(sid)
  const e: ImageEdit = { sid, id, i, key, before, open: opts.open }
  state.value = e
  // 선 이미지는 선 바깥 끝까지 넓힌 상자 기준(LayerView 와 같아요)
  patchImage(store, e, (p, nn) => { const q = { ...p, iw: iw ?? p.iw, ih: ih ?? p.ih }; const pad = key === 'strokes' ? strokePad(nn.style, nn.type) : 0; return { ...q, fit: 'crop', crop: cropFromFit(q, nn.w + pad * 2, nn.h + pad * 2) } })
  return true
}
/** 끝내기: apply = 적용(기록 한 번), 아니면 처음 모습으로 */
export function endCrop(store: Store, apply: boolean) {
  const e = state.value
  if (!e) return
  state.value = null
  if (!apply && store.node(e.sid, e.id)) {
    const b = e.before
    store.update(e.sid, [e.id], () => ({ x: b.x, y: b.y, w: b.w, h: b.h, style: JSON.parse(JSON.stringify(b.style)) as LayerStyle }))
  }
  store.release(e.sid)
}
