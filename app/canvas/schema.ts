/**
 * 화면 안 레이어 JSON (PRD/02_DATA_MODEL.md "레이어 구조").
 * id 로 찾아가는 평평한 목록 + parentId/children. 구조를 바꾸면 schemaVersion 을 올리고 migrate() 에 변환을 더합니다.
 */
export const SCHEMA_VERSION = 1

export type LayerType = 'frame' | 'rect' | 'text' | 'image'

export interface LayerStyle {
  fill?: string // '#RRGGBB' 또는 'token:brand/primary-default'
  stroke?: string
  strokeWidth?: number
  radius?: number
  opacity?: number // 0~1
  // 텍스트
  color?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  align?: 'left' | 'center' | 'right'
  autoWidth?: boolean // 글자 길이에 맞춰 너비가 늘어남(직접 크기를 바꾸면 꺼짐)
  clip?: boolean // 프레임: 내용 자르기
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
  // schemaVersion 1 이 첫 버전이라 아직 변환할 것이 없습니다
  const doc: LayerDoc = { rootIds: [...d.rootIds], nodes: {}, schemaVersion: SCHEMA_VERSION }
  for (const [id, n] of Object.entries(d.nodes)) {
    if (!n || typeof n !== 'object') continue
    doc.nodes[id] = { ...(n as LayerNode), id, style: (n as LayerNode).style ?? {} }
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

export const DEFAULT_STYLE: Record<LayerType, LayerStyle> = {
  frame: { fill: '#FFFFFF', radius: 0, clip: true },
  rect: { fill: '#E9EBED', radius: 0 },
  text: { color: '#202837', fontSize: 16, fontWeight: 400, lineHeight: 24, align: 'left', autoWidth: true },
  image: { radius: 0 },
}

export const TYPE_LABEL: Record<LayerType, string> = { frame: '프레임', rect: '사각형', text: '텍스트', image: '이미지' }
