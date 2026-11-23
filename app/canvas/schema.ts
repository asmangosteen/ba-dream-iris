/**
 * 화면 안 레이어 JSON (PRD/02_DATA_MODEL.md "레이어 구조").
 * id 로 찾아가는 평평한 목록 + parentId/children. 구조를 바꾸면 schemaVersion 을 올리고 migrate() 에 변환을 더합니다.
 */
export const SCHEMA_VERSION = 3

export type LayerType = 'frame' | 'rect' | 'text' | 'image'

export interface LayerStyle {
  fill?: string // '#RRGGBB' · 'rgb(…)'. 옛 문서는 'token:<DB 토큰 이름>' 일 수 있어요(연결된 것으로 봅니다)
  stroke?: string
  strokeWidth?: number
  radius?: number
  /** 모서리 따로 [왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래] — 있으면 radius 대신 씁니다 (v2) */
  radii?: [number, number, number, number]
  opacity?: number // 0~1
  // 텍스트
  color?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  /** 자간(px) (v3) */
  letterSpacing?: number
  align?: 'left' | 'center' | 'right'
  autoWidth?: boolean // 글자 길이에 맞춰 너비가 늘어남(직접 크기를 바꾸면 꺼짐)
  clip?: boolean // 프레임: 내용 자르기
  /**
   * 변수(토큰) 연결 (v3): 속성 키 → 토큰 id. 연결할 때 실제 값도 그 속성에 함께 써 두어서
   * 그리기 · 내보내기는 연결을 몰라도 됩니다. 속성 값을 직접 고치면 그 키의 연결이 풀려요(store 의 record()).
   * 토큰 id: CSS 변수 이름('--sys-color-brand-primary-default') · 글자 스타일('ts:body-1') · DB 토큰('db:<이름>')
   */
  vars?: Partial<Record<BindKey, string>>
}

/** 변수를 연결할 수 있는 속성 키 */
export const BIND_KEYS = ['fill', 'stroke', 'color', 'strokeWidth', 'radius', 'radii.0', 'radii.1', 'radii.2', 'radii.3', 'opacity', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'textStyle', 'shadow', 'x', 'y', 'w', 'h'] as const
export type BindKey = (typeof BIND_KEYS)[number]

/** 연결된 키의 지금 값(비교용 문자열). 연결은 그대로인데 이 값이 바뀌면 직접 고친 것으로 보고 연결을 풉니다 */
export function bindLiteral(n: LayerNode, key: BindKey): string {
  const s = n.style
  switch (key) {
    case 'x': case 'y': case 'w': case 'h': return String(n[key])
    case 'radii.0': case 'radii.1': case 'radii.2': case 'radii.3': return String(s.radii?.[Number(key.slice(6))])
    case 'textStyle': return `${s.fontSize}/${s.lineHeight}/${s.letterSpacing}` // 굵기는 글자 스타일에 없을 수 있어서 빼요
    case 'shadow': return ''
    default: return String(s[key])
  }
}

export interface LayerNode {
  id: string
  type: LayerType
  name: string
  parentId: string | null
  children?: string[]
  x: number
  y: number
  w: number
  h: number
  /** 가운데를 축으로 돌린 각도(도, 시계 방향). x · y · w · h 는 돌리기 전 상자 (v2) */
  rotation?: number
  /** 좌우 · 상하 뒤집기 (v2) */
  flipX?: boolean
  flipY?: boolean
  /** 비율 고정. 비어 있으면 이미지만 고정 (v2) */
  lockRatio?: boolean
  hidden?: boolean
  locked?: boolean
  text?: string
  src?: string // 'storage://screens/<path>' · data: · https:
  style: LayerStyle
}

export interface LayerDoc {
  rootIds: string[]
  nodes: Record<string, LayerNode>
  schemaVersion: number
}

export const emptyDoc = (): LayerDoc => ({ rootIds: [], nodes: {}, schemaVersion: SCHEMA_VERSION })

/** DB 에서 읽은 값(빈 값 · 옛 버전 포함)을 지금 구조로 바꿉니다 */
export function migrate(raw: unknown): LayerDoc {
  if (!raw || typeof raw !== 'object') return emptyDoc()
  const d = raw as Partial<LayerDoc>
  if (!d.nodes || !Array.isArray(d.rootIds)) return emptyDoc()
  // v1 → v2: 회전 · 뒤집기 · 비율 고정 · 모서리 따로가 더해졌어요. 모두 비어 있어도 되는 값이라 v1 문서는 그대로 읽습니다
  // v2 → v3: 변수 연결(style.vars) · 자간(style.letterSpacing) 이 더해졌어요. 역시 비어 있어도 되는 값이라 그대로 읽습니다
  const doc: LayerDoc = { rootIds: [...d.rootIds], nodes: {}, schemaVersion: SCHEMA_VERSION }
  for (const [id, n] of Object.entries(d.nodes)) {
    if (!n || typeof n !== 'object') continue
    const node: LayerNode = { ...(n as LayerNode), id, style: { ...((n as LayerNode).style ?? {}) } }
    if (typeof node.rotation !== 'number' || !Number.isFinite(node.rotation) || !node.rotation) delete node.rotation
    const r = node.style.radii
    if (r && !(Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number'))) delete node.style.radii
    const vars = node.style.vars
    if (vars && (typeof vars !== 'object' || Array.isArray(vars) || !Object.keys(vars).length)) delete node.style.vars
    doc.nodes[id] = node
  }
  doc.rootIds = doc.rootIds.filter((id) => doc.nodes[id])
  return doc
}

export const newId = () => 'n' + Math.random().toString(36).slice(2, 9)

/** 같은 부모 안의 형제 목록(그리는 순서: 앞 = 아래) */
export function siblings(doc: LayerDoc, parentId: string | null): string[] {
  if (!parentId) return doc.rootIds
  const p = doc.nodes[parentId]
  if (!p) return []
  if (!p.children) p.children = []
  return p.children
}

/** 화면 왼쪽 위 기준 절대 위치 */
export function absPos(doc: LayerDoc, id: string): { x: number; y: number } {
  let x = 0, y = 0
  let n: LayerNode | undefined = doc.nodes[id]
  while (n) { x += n.x; y += n.y; n = n.parentId ? doc.nodes[n.parentId] : undefined }
  return { x, y }
}

/** id 와 그 아래 모든 자손 */
export function descendants(doc: LayerDoc, id: string): string[] {
  const out = [id]
  for (const c of doc.nodes[id]?.children ?? []) out.push(...descendants(doc, c))
  return out
}

/** 비율 고정: 값이 없으면 이미지만 고정 */
export const ratioLocked = (n: Pick<LayerNode, 'lockRatio' | 'type'>) => n.lockRatio ?? n.type === 'image'

/** 각도를 -180 < r ≤ 180 으로 */
export function normAngle(r: number) {
  let v = r % 360
  if (v > 180) v -= 360
  if (v <= -180) v += 360
  return Math.round(v * 100) / 100
}

export const DEFAULT_STYLE: Record<LayerType, LayerStyle> = {
  frame: { fill: '#FFFFFF', radius: 0, clip: true },
  rect: { fill: '#E9EBED', radius: 0 },
  text: { color: '#202837', fontSize: 16, fontWeight: 400, lineHeight: 24, align: 'left', autoWidth: true },
  image: { radius: 0 },
}

export const TYPE_LABEL: Record<LayerType, string> = { frame: '프레임', rect: '사각형', text: '텍스트', image: '이미지' }
