/**
 * 화면 안 레이어 JSON (PRD/02_DATA_MODEL.md "레이어 구조").
 * id 로 찾아가는 평평한 목록 + parentId/children. 구조를 바꾸면 schemaVersion 을 올리고 migrate() 에 변환을 더합니다.
 */
export const SCHEMA_VERSION = 6

export type LayerType = 'frame' | 'rect' | 'text' | 'image' | 'ellipse' | 'line' | 'polygon' | 'star' | 'path' | 'section'

/** 칠(채우기 · 선 색). solid 는 한 색, linear · radial 은 그라디언트, image 는 이미지 채우기 (v5) */
export type Paint =
  | { type: 'solid'; color: string; opacity?: number; visible?: boolean }
  | { type: 'linear' | 'radial'; stops: { pos: number; color: string }[]; angle?: number; opacity?: number; visible?: boolean }
  | { type: 'image'; src: string; fit?: ImageFit; opacity?: number; visible?: boolean }
export type ImageFit = 'fill' | 'fit' | 'crop' | 'tile'

/** 효과 (v5): 그림자 · 안쪽 그림자 · 레이어 흐림 · 배경 흐림 */
export type Effect =
  | { type: 'drop' | 'inner'; x: number; y: number; blur: number; spread?: number; color: string; visible?: boolean }
  | { type: 'blur' | 'bgblur'; blur: number; visible?: boolean }

export type ArrowHead = 'none' | 'arrow' | 'triangle' | 'circle'

/** 오토 레이아웃 (v6). 피그마와 같아요: 방향 · 간격(auto = 사이 띄우기) · 안쪽 여백 · 정렬 */
export interface AutoLayout {
  mode: 'horizontal' | 'vertical'
  wrap?: boolean
  gap: number | 'auto'
  /** 줄 바꿈할 때 줄 사이 간격 */
  rowGap?: number
  /** [위, 오른쪽, 아래, 왼쪽] */
  padding: [number, number, number, number]
  /** 진행 방향 정렬 · 수직 방향 정렬 */
  align: 'start' | 'center' | 'end'
  cross: 'start' | 'center' | 'end'
}
/** 크기 방식: 고정 · 내용에 맞춤(Hug) · 채우기(Fill) */
export type Sizing = 'fixed' | 'hug' | 'fill'
/** 제약 (v6): 부모 프레임 크기가 바뀔 때 */
export interface Constraints { h: 'left' | 'right' | 'leftright' | 'center' | 'scale'; v: 'top' | 'bottom' | 'topbottom' | 'center' | 'scale' }
/** 레이아웃 그리드 (v6) */
export interface LayoutGrid {
  type: 'columns' | 'rows' | 'grid'
  count?: number
  gutter?: number
  margin?: number
  /** grid 칸 크기 */
  size?: number
  color?: string
  visible?: boolean
}

/** 자식을 담는 레이어 */
export const isContainer = (n?: Pick<LayerNode, 'type'> | null) => !!n && (n.type === 'frame' || n.type === 'section')
/** 점으로 그리는 레이어(SVG) */
export const isVector = (t: LayerType) => t === 'line' || t === 'polygon' || t === 'star' || t === 'path'

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
  // --- v5 ---
  /** 덧붙인 칠: fill 위에 차례로 그려요(마지막이 맨 위) */
  fills?: Paint[]
  /** 덧붙인 선 색: stroke 위에 차례로. 두께 · 위치 · 점선은 함께 써요(피그마와 같아요) */
  strokes?: Paint[]
  /** 선 위치. 비어 있으면 상자 도형은 안쪽, 선 · 연필은 가운데 */
  strokeAlign?: 'inside' | 'center' | 'outside'
  /** 점선 [선 길이, 간격] */
  dash?: [number, number]
  /** 선 끝 모양 */
  cap?: 'butt' | 'round' | 'square'
  /** 선 · 연필 끝 화살표 */
  arrowStart?: ArrowHead
  arrowEnd?: ArrowHead
  effects?: Effect[]
  /** 혼합 모드(CSS mix-blend-mode 이름) */
  blend?: string
  /** 다각형 꼭짓점 수 · 별 꼭짓점 수 · 별 안쪽 비율(0~1) */
  sides?: number
  points?: number
  inner?: number
  /** 이미지 레이어: 채우는 방식, 자르기(확대 배율 · 가로 · 세로 위치 0~100) */
  fit?: ImageFit
  crop?: { scale: number; x: number; y: number }
  // 텍스트 고급
  decoration?: 'underline' | 'strike'
  textCase?: 'upper' | 'lower' | 'title'
  list?: 'bullet' | 'number'
  paraSpacing?: number
  // --- v6 ---
  /** 오토 레이아웃(프레임) */
  layout?: AutoLayout
  /** 레이아웃 그리드(프레임 · 화면) */
  grids?: LayoutGrid[]
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
  /** 선 · 연필: 상자 안 점 [x0, y0, x1, y1, …], 0~1 비율 (v5) */
  pts?: number[]
  /** 연필: 닫힌 모양 */
  closed?: boolean
  /** 크기 방식 (v6): 가로 · 세로. 비어 있으면 fixed(텍스트 autoWidth 는 가로 hug 와 같아요) */
  sizeH?: Sizing
  sizeV?: Sizing
  /** 오토 레이아웃 안에서 자리 무시하고 마음대로 두기 */
  absolute?: boolean
  constraints?: Constraints
  src?: string // 'storage://screens/<path>' · data: · https:
  style: LayerStyle
}

export interface LayerDoc {
  rootIds: string[]
  nodes: Record<string, LayerNode>
  schemaVersion: number
  /** v4: 화면(프레임) 자체의 모양 — 채우기 · 선 · 모서리 · 투명도 · 내용 자르기. 없으면 흰 바탕 · 선 없음 */
  frame?: LayerStyle
}

export const emptyDoc = (): LayerDoc => ({ rootIds: [], nodes: {}, schemaVersion: SCHEMA_VERSION })

/** DB 에서 읽은 값(빈 값 · 옛 버전 포함)을 지금 구조로 바꿉니다 */
export function migrate(raw: unknown): LayerDoc {
  if (!raw || typeof raw !== 'object') return emptyDoc()
  const d = raw as Partial<LayerDoc>
  if (!d.nodes || !Array.isArray(d.rootIds)) return emptyDoc()
  // v1 → v2: 회전 · 뒤집기 · 비율 고정 · 모서리 따로가 더해졌어요. 모두 비어 있어도 되는 값이라 v1 문서는 그대로 읽습니다
  // v2 → v3: 변수 연결(style.vars) · 자간(style.letterSpacing) 이 더해졌어요. 역시 비어 있어도 되는 값이라 그대로 읽습니다
  // v3 → v4: 화면 모양(frame) 이 더해졌어요. 비어 있어도 되는 값이라 그대로 읽습니다
  // v5 → v6: 오토 레이아웃 · 크기 방식(Hug · Fill) · 제약 · 레이아웃 그리드가 더해졌어요. 비어 있어도 되는 값입니다
  // v4 → v5: 원 · 선 · 다각형 · 별 · 연필 · 섹션, 여러 칠 · 그라디언트 · 효과 · 선 위치 · 점선 · 혼합 모드 · 텍스트 고급이 더해졌어요. 모두 비어 있어도 되는 값입니다
  const doc: LayerDoc = { rootIds: [...d.rootIds], nodes: {}, schemaVersion: SCHEMA_VERSION }
  if (d.frame && typeof d.frame === 'object' && !Array.isArray(d.frame)) doc.frame = { ...d.frame }
  for (const [id, n] of Object.entries(d.nodes)) {
    if (!n || typeof n !== 'object') continue
    const node: LayerNode = { ...(n as LayerNode), id, style: { ...((n as LayerNode).style ?? {}) } }
    if (typeof node.rotation !== 'number' || !Number.isFinite(node.rotation) || !node.rotation) delete node.rotation
    const r = node.style.radii
    if (r && !(Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number'))) delete node.style.radii
    const vars = node.style.vars
    if (vars && (typeof vars !== 'object' || Array.isArray(vars) || !Object.keys(vars).length)) delete node.style.vars
    for (const k of ['fills', 'strokes', 'effects'] as const) if (node.style[k] !== undefined && !Array.isArray(node.style[k])) delete node.style[k]
    if (node.pts && !(Array.isArray(node.pts) && node.pts.every((v) => typeof v === 'number'))) delete node.pts
    if (isContainer(node) && !Array.isArray(node.children)) node.children = []
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
  ellipse: { fill: '#E9EBED' },
  line: { stroke: '#202837', strokeWidth: 1 },
  polygon: { fill: '#E9EBED', sides: 3 },
  star: { fill: '#E9EBED', points: 5, inner: 0.38 },
  path: { stroke: '#202837', strokeWidth: 2, cap: 'round' },
  section: { fill: '#F2F3F5', radius: 2 },
}

export const TYPE_LABEL: Record<LayerType, string> = { frame: 'Frame', rect: 'Rectangle', text: 'Text', image: 'Image', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon', star: 'Star', path: 'Vector', section: 'Section' }

/** 화면(프레임) 모양 → CSS. 선은 피그마 기본처럼 안쪽(inset). color: 'token:' 값 풀기 */
export function frameCss(f: LayerStyle | undefined, color: (v?: string) => string | undefined): Record<string, string | number> {
  if (!f) return {}
  const css: Record<string, string | number> = {}
  if (f.fill !== undefined) css.background = f.fill ? (color(f.fill) ?? f.fill) : 'transparent'
  if (f.radii) css.borderRadius = f.radii.map((r) => r + 'px').join(' ')
  else if (f.radius) css.borderRadius = f.radius + 'px'
  if (f.stroke && f.strokeWidth) css.boxShadow = `inset 0 0 0 ${f.strokeWidth}px ${color(f.stroke) ?? f.stroke}`
  if (f.opacity !== undefined && f.opacity < 1) css.opacity = f.opacity
  if (f.clip === false) css.overflow = 'visible'
  return css
}
