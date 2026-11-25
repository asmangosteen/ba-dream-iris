/**
 * 점 편집(벡터 · 도형) 중 고른 것 — 캔버스(EditorCanvas)와 오른쪽 패널(InspectorLayer)이 같이 써요(useState 'iris-vedit').
 * 점 하나 = [경로 번호, 점 번호]. 아직 도형(사각형 · 원 등)이면 경로 번호가 -1 이고 점 번호는 꼭짓점 순서(사각형: 왼위 · 오위 · 오아래 · 왼아래).
 * 선 하나 = [경로 번호, 시작 점 번호] — 그 점에서 다음 점(닫힌 경로면 마지막 → 처음)까지.
 * 피그마처럼: 점 · 선을 누르면 그것만, ⇧ 를 누르고 누르면 더하거나 빼요. 패널 값(자리 · 모서리)은 고른 것에만 적용돼요.
 */
export type VKey = [number, number]
export interface VEdit {
  sid: string
  id: string
  /** 마지막으로 누른 점(끌기 기준) */
  sel: VKey | null
  /** 고른 점들(sel 포함) */
  pts?: VKey[]
  /** 고른 선들 */
  segs?: VKey[]
}

export const vk = (k: VKey) => k[0] + ':' + k[1]

/**
 * 고른 점 전부: 고른 점 + 고른 선의 양 끝(겹치면 한 번).
 * count(pi): 그 경로의 점 개수, closed(pi): 닫힌 경로인지(도형은 늘 닫힘)
 */
export function vselPoints(ve: VEdit | null | undefined, count: (pi: number) => number, closed: (pi: number) => boolean): VKey[] {
  if (!ve) return []
  const out = new Map<string, VKey>()
  const add = (k: VKey) => out.set(vk(k), k)
  for (const k of ve.pts ?? (ve.sel ? [ve.sel] : [])) add(k)
  for (const [pi, qi] of ve.segs ?? []) {
    const n = count(pi)
    if (!n) continue
    add([pi, qi])
    const nx = qi + 1 < n ? qi + 1 : closed(pi) ? 0 : -1
    if (nx >= 0) add([pi, nx])
  }
  return [...out.values()]
}

/** 고른 것 비우기(편집은 그대로) */
export function vselClear(ve: VEdit) {
  ve.sel = null
  ve.pts = []
  ve.segs = []
}
