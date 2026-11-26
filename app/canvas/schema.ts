/**
 * 화면 안 레이어 JSON (PRD/02_DATA_MODEL.md "레이어 구조").
 * id 로 찾아가는 평평한 목록 + parentId/children. 구조를 바꾸면 schemaVersion 을 올리고 migrate() 에 변환을 더합니다.
 */
import { backgroundCss, effectCss, radiiOf, rectPath, STAR_INNER, strokeColors, strokeShadows } from './paint'
import { squirclePath } from './squircle'
import type { TextSpan } from './textRuns'

export const SCHEMA_VERSION = 8

export type LayerType = 'frame' | 'rect' | 'text' | 'image' | 'ellipse' | 'line' | 'polygon' | 'star' | 'path' | 'section' | 'vector' | 'instance' | 'boolean'

/** 벡터 점 (v7). x · y · 핸들(i 들어오는 쪽, o 나가는 쪽)은 모두 레이어 상자 안 0~1 비율 */
/** 벡터 점(0~1 비율). r: 그 꼭짓점의 모서리 둥글기(px, 피그마 vertex corner radius — 그릴 때 둥글게, Flatten · 불리언에서 곡선으로 굳어요) */
export interface VPoint { x: number; y: number; i?: [number, number]; o?: [number, number]; r?: number }
/** 그라디언트 색 지점. token: 연결된 색 토큰 id(color 에는 그 값을 써 둬요 — 그리기 · 내보내기는 color) */
export interface GradStop { pos: number; color: string; token?: string }
export interface VPath { pts: VPoint[]; closed?: boolean }

/** 칠(채우기 · 선 색). solid 는 한 색, linear · radial 은 그라디언트, image 는 이미지 채우기 (v5) */
export type Paint =
  | { type: 'solid'; color: string; opacity?: number; visible?: boolean; token?: string }
  | { type: 'linear' | 'radial' | 'angular'; stops: GradStop[]; angle?: number; opacity?: number; visible?: boolean }
  | { type: 'image'; src: string; fit?: ImageFit; opacity?: number; visible?: boolean; crop?: ImageCrop; iw?: number; ih?: number; scale?: number; rotation?: number }
export type ImageFit = 'fill' | 'fit' | 'crop' | 'tile'
/**
 * 이미지 칠 자르기(fit 'crop', 피그마 Crop): 레이어 상자 기준 이미지 자리 — 왼쪽 · 위(x · y)와 폭 · 높이(w · h), 모두 레이어 폭 · 높이에 대한 비율.
 * 예) { x: -0.2, y: 0, w: 1.4, h: 1 } = 이미지가 레이어보다 1.4배 넓고 왼쪽으로 20% 나가 있어요(나간 부분은 잘려요).
 * iw · ih: 이미지 원래 크기(px) — 비율 · Tile 크기에 써요. scale: Tile 크기 배율(1 = 원래 크기)
 * rotation: Crop 안에서 이미지 돌리기(도, 이미지 가운데 기준) — CSS 배경으로는 못 돌려서 LayerView 가 따로 그려요
 */
export interface ImageCrop { x: number; y: number; w: number; h: number }

/** 효과 (v5): 그림자 · 안쪽 그림자 · 레이어 흐림 · 배경 흐림 */
export type Effect =
  | { type: 'drop' | 'inner'; x: number; y: number; blur: number; spread?: number; color: string; visible?: boolean; token?: string }
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
/** 줄 높이 → CSS 값: % 면 '125%'(글자 크기 따라감), px 면 '24px', 없으면 글자 크기 × 1.5 */
export const lineHeightCss = (s: LayerStyle) => (s.lineHeight === undefined ? Math.round((s.fontSize ?? 16) * 1.5) + 'px' : s.lineHeightUnit === 'percent' ? s.lineHeight + '%' : s.lineHeight + 'px')
/** 줄 높이 → px 숫자(계산용) */
export const lineHeightPx = (s: LayerStyle) => (s.lineHeight === undefined ? Math.round((s.fontSize ?? 16) * 1.5) : s.lineHeightUnit === 'percent' ? ((s.fontSize ?? 16) * s.lineHeight) / 100 : s.lineHeight)
/** 레이아웃 그리드의 칸(Columns · Rows) — 프레임 안 좌표. 그리기(GridOverlay)와 가이드선 붙기가 같이 써요 */
export function gridBands(grids: LayoutGrid[] | undefined, w: number, h: number): { x: number; y: number; w: number; h: number; c: string }[] {
  const out: { x: number; y: number; w: number; h: number; c: string }[] = []
  for (const g of (grids ?? []).filter((x) => x.visible !== false && x.type !== 'grid')) {
    const n = Math.max(1, g.count ?? 4), gut = g.gutter ?? 16, m = g.margin ?? 16
    const total = g.type === 'columns' ? w : h
    const size = Math.max(0, (total - m * 2 - gut * (n - 1)) / n)
    for (let i = 0; i < n; i++) {
      const at = m + i * (size + gut)
      out.push(g.type === 'columns' ? { x: at, y: 0, w: size, h, c: g.color ?? '#FF000019' } : { x: 0, y: at, w, h: size, c: g.color ?? '#FF000019' })
    }
  }
  return out
}
export interface LayoutGrid {
  type: 'columns' | 'rows' | 'grid'
  /** 연결된 색 토큰 id(color 에는 그 값) */
  token?: string
  count?: number
  gutter?: number
  margin?: number
  /** grid 칸 크기 */
  size?: number
  color?: string
  visible?: boolean
}

/** 자식을 담는 레이어 */
/** 내용 자르기(Clip content): 프레임은 기본 켬, 섹션은 기본 끔(피그마와 같아요) — 켜려면 clip: true */
export const clipsContent = (n?: Pick<LayerNode, 'type' | 'style'> | null) => !!n && (n.type === 'frame' ? n.style.clip !== false : n.type === 'section' ? n.style.clip === true : false)
export const isContainer = (n?: Pick<LayerNode, 'type'> | null) => !!n && (n.type === 'frame' || n.type === 'section' || n.type === 'boolean')
/** 점으로 그리는 레이어(SVG) */
export const isVector = (t: LayerType) => t === 'line' || t === 'polygon' || t === 'star' || t === 'path' || t === 'vector'

export interface LayerStyle {
  fill?: string // '#RRGGBB' · 'rgb(…)'. 옛 문서는 'token:<DB 토큰 이름>' 일 수 있어요(연결된 것으로 봅니다)
  stroke?: string
  strokeWidth?: number
  /** Corner smoothing 0~1(피그마와 같아요, 0.6 = iOS). 모서리가 있을 때 squircle 로 그려요 */
  smoothing?: number
  radius?: number
  /** 원 호(피그마 Arc, 원만): 시작 각(°, 오른쪽 0 · 시계 방향) · 쓸어 간 각(°, 360 = 한 바퀴) · 안쪽 구멍 비율(0~1) */
  arcStart?: number
  arcSweep?: number
  arcInner?: number
  /** 모서리 따로 [왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래] — 있으면 radius 대신 씁니다 (v2) */
  radii?: [number, number, number, number]
  opacity?: number // 0~1
  /** 화면(맨 위 프레임) 비율 잠금 — 화면은 레이어가 아니라 frame 모양에 둬요(레이어는 LayerNode.lockRatio) */
  lockRatio?: boolean
  /** 화면(맨 위 프레임) 회전(도, 가운데 기준 — 피그마와 같아요). 레이어는 LayerNode.rotation */
  rotation?: number
  /** 화면(맨 위 프레임) 뒤집기(가운데 기준 — 안의 레이어가 거울처럼) */
  flipX?: boolean
  flipY?: boolean
  // 텍스트
  color?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  /** 줄 높이 단위: 'percent' 면 lineHeight 는 글자 크기의 %(100 = 글자 크기와 같음), 비어 있으면 px(피그마와 같아요) */
  lineHeightUnit?: 'percent'
  /** 자간(px) (v3) */
  letterSpacing?: number
  align?: 'left' | 'center' | 'right' | 'justify'
  /** 세로 정렬(글자 상자가 내용보다 높을 때): 비어 있으면 위 */
  valign?: 'top' | 'middle' | 'bottom'
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
  /** 선 끝 모양(열린 선) · 점선 끝 모양(Dash cap) */
  cap?: 'butt' | 'round' | 'square'
  /** 선 이음새(피그마 Join): 비어 있으면 연필은 둥글게, 나머지는 각지게 */
  join?: 'miter' | 'bevel' | 'round'
  /** 변마다 선 두께 [위, 오른쪽, 아래, 왼쪽](피그마 Top · Bottom · Left · Right · Custom). 비어 있으면 모든 변에 strokeWidth */
  strokeSides?: [number, number, number, number]
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
  /** 넘치면 말줄임(…): 한 줄로 자르고 끝에 … */
  truncate?: boolean
  /** 줄바꿈 방식: 비어 있으면 Auto. balance = 줄 길이 고르게, pretty = 마지막 줄 한 단어 피하기 */
  wrap?: 'balance' | 'pretty'
  /** 숫자 모양: tabular = 고정폭 숫자(표 · 금액 정렬) */
  numbers?: 'tabular'
  // --- v6 ---
  /** 오토 레이아웃(프레임) */
  layout?: AutoLayout
  /** 레이아웃 그리드(프레임 · 화면) */
  grids?: LayoutGrid[]
  /** 화면(프레임)에 붙은 가이드선 — 프레임 왼쪽 · 위에서 잰 거리. 프레임과 함께 옮겨지고 복사돼요(피그마와 같아요) */
  guides?: { x: number[]; y: number[] }
  /**
   * 변수(토큰) 연결 (v3): 속성 키 → 토큰 id. 연결할 때 실제 값도 그 속성에 함께 써 두어서
   * 그리기 · 내보내기는 연결을 몰라도 됩니다. 속성 값을 직접 고치면 그 키의 연결이 풀려요(store 의 record()).
   * 토큰 id: CSS 변수 이름('--sys-color-brand-primary-default') · 글자 스타일('ts:body-1') · DB 토큰('db:<이름>')
   */
  vars?: Partial<Record<BindKey, string>>
}

/** 변수를 연결할 수 있는 속성 키 */
export const BIND_KEYS = ['fill', 'stroke', 'color', 'strokeWidth', 'radius', 'radii.0', 'radii.1', 'radii.2', 'radii.3', 'opacity', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'textStyle', 'shadow', 'x', 'y', 'w', 'h', 'gap', 'rowGap', 'padding.0', 'padding.1', 'padding.2', 'padding.3'] as const
export type BindKey = (typeof BIND_KEYS)[number]

/** 연결된 키의 지금 값(비교용 문자열). 연결은 그대로인데 이 값이 바뀌면 직접 고친 것으로 보고 연결을 풉니다 */
export function bindLiteral(n: LayerNode, key: BindKey): string {
  const s = n.style
  switch (key) {
    case 'x': case 'y': case 'w': case 'h': return String(n[key])
    case 'radii.0': case 'radii.1': case 'radii.2': case 'radii.3': return String(s.radii?.[Number(key.slice(6))])
    case 'textStyle': return `${s.fontSize}/${s.lineHeight}/${s.letterSpacing}/${s.fontWeight}` // 굵기도 스타일에 들어요(옛 굵기 없는 스타일도 굵기를 바꾸면 풀려요 — 피그마와 같아요)
    case 'shadow': return JSON.stringify(s.effects ?? []) // 효과를 직접 고치면 스타일 연결이 풀려요
    // 오토 레이아웃 간격 · 안쪽 여백(위 · 오른 · 아래 · 왼)
    case 'gap': return String(s.layout?.gap)
    case 'rowGap': return String(s.layout?.rowGap ?? s.layout?.gap)
    case 'padding.0': case 'padding.1': case 'padding.2': case 'padding.3': return String(s.layout?.padding?.[Number(key.slice(8))])
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
  /** 그룹(⌘G): true 면 그룹, false 면 프레임(오토 레이아웃을 풀어 프레임이 된 것). 비어 있으면 모양으로 짐작(채우기 · 자르기 · 오토 레이아웃 없는 프레임) */
  group?: boolean
  text?: string
  /** 글자 구간 서식(글자마다 다른 색 · 굵기 · 크기 …) — style 이 바탕, 구간이 덮어써요(app/canvas/textRuns.ts) */
  spans?: TextSpan[]
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
  // --- v7 ---
  /** 벡터(펜 · 불리언 · SVG 가져오기): 경로들. 0~1 비율이라 크기를 바꿔도 그대로 따라와요 */
  vnet?: VPath[]
  /** 벡터 채우기 규칙(겹친 부분 구멍) */
  evenodd?: boolean
  /** 이 레이어가 그리는 요구사항(REQ id들) — 문서에서 REQ 를 누르면 이 레이어로 포커스해요(app/canvas/reqMatch.ts) */
  reqs?: string[]
  /** 디자인 시스템 컴포넌트 인스턴스: 컴포넌트 이름 · 속성 값 */
  component?: string
  props?: Record<string, unknown>
  /** 스케일(K)로 키운 배율(인스턴스): 디자인 시스템 컴포넌트를 이 배율로 확대해 그려요(안의 글자 · 아이콘까지 — 피그마와 같아요) */
  instScale?: number
  /** 레이어 내보내기 설정(피그마 Export) */
  exports?: ExportSetting[]
  /** 마스크: 같은 부모 안에서 이 레이어 위에 있는 형제들을 이 모양으로 잘라요 */
  isMask?: boolean
  /** 불리언 그룹(살아 있는 결과): 합치기 · 빼기(맨 아래에서 나머지) · 교차 · 제외 */
  op?: 'union' | 'subtract' | 'intersect' | 'exclude'
  src?: string // 'storage://screens/<path>' · data: · https:
  style: LayerStyle
}

export interface LayerDoc {
  rootIds: string[]
  nodes: Record<string, LayerNode>
  schemaVersion: number
  /** v4: 화면(프레임) 자체의 모양 — 채우기 · 선 · 모서리 · 투명도 · 내용 자르기. 없으면 흰 바탕 · 선 없음 */
  frame?: LayerStyle
  /** 화면(프레임) 내보내기 설정(피그마 Export) */
  exports?: ExportSetting[]
}

/**
 * 내보내기 설정 한 줄(피그마 Export 와 같아요).
 * scale: '0.5x' · '1x' · '2x' … 배율, '512w' · '512h' 폭 · 높이 맞춤. format: PNG · JPG · SVG · PDF. suffix: 파일 이름 뒤에 붙는 글자
 */
export interface ExportSetting { scale: string; format: 'PNG' | 'JPG' | 'SVG' | 'PDF'; suffix?: string }

export const emptyDoc = (): LayerDoc => ({ rootIds: [], nodes: {}, schemaVersion: SCHEMA_VERSION })

/** DB 에서 읽은 값(빈 값 · 옛 버전 포함)을 지금 구조로 바꿉니다 */
export function migrate(raw: unknown): LayerDoc {
  if (!raw || typeof raw !== 'object') return emptyDoc()
  const d = raw as Partial<LayerDoc>
  if (!d.nodes || !Array.isArray(d.rootIds)) return emptyDoc()
  // v1 → v2: 회전 · 뒤집기 · 비율 고정 · 모서리 따로가 더해졌어요. 모두 비어 있어도 되는 값이라 v1 문서는 그대로 읽습니다
  // v2 → v3: 변수 연결(style.vars) · 자간(style.letterSpacing) 이 더해졌어요. 역시 비어 있어도 되는 값이라 그대로 읽습니다
  // v3 → v4: 화면 모양(frame) 이 더해졌어요. 비어 있어도 되는 값이라 그대로 읽습니다
  // v6 → v7: 벡터(vnet) · 디자인 시스템 인스턴스(component · props) · 마스크(isMask)가 더해졌어요. 비어 있어도 되는 값입니다
  // v5 → v6: 오토 레이아웃 · 크기 방식(Hug · Fill) · 제약 · 레이아웃 그리드가 더해졌어요. 비어 있어도 되는 값입니다
  // v7 → v8: 이미지는 레이어 종류가 아니라 칠이에요(피그마와 같아요) — 이미지 레이어(type 'image')는 사각형 + 이미지 칠로 바꿔요. 동영상은 그대로
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
    if (node.type === 'image' && node.src && !node.src.endsWith('#video')) imageToRect(node)
    doc.nodes[id] = node
  }
  doc.rootIds = doc.rootIds.filter((id) => doc.nodes[id])
  return doc
}

/**
 * 옛 이미지 레이어 → 사각형 + 이미지 칠(v8). 맞춤(Fill · Fit · Tile)은 그대로, 옛 자르기(확대 · 위치)는 원래 크기를 몰라 Fill 로.
 * 비율 고정은 이미지 레이어 기본(켜짐) 그대로 남겨요
 */
function imageToRect(n: LayerNode) {
  const st = n.style
  const fit = st.fit === 'crop' ? undefined : st.fit
  const paint: Paint = { type: 'image', src: n.src!, ...(fit && fit !== 'fill' ? { fit } : {}) }
  n.type = 'rect'
  n.lockRatio = n.lockRatio ?? true
  delete n.src
  delete st.fit
  delete st.crop
  delete st.fill
  st.fills = [...(st.fills ?? []), paint]
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
export { STAR_INNER }
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
  text: { color: '#202837', fontSize: 16, fontWeight: 400, lineHeight: 100, lineHeightUnit: 'percent', align: 'left', autoWidth: true },
  image: { radius: 0 },
  ellipse: { fill: '#E9EBED' },
  line: { stroke: '#202837', strokeWidth: 1 },
  polygon: { fill: '#E9EBED', sides: 3 },
  star: { fill: '#E9EBED', points: 5, inner: STAR_INNER },
  path: { stroke: '#202837', strokeWidth: 2, cap: 'round' },
  section: { fill: '#F2F3F5', radius: 2 },
  vector: { stroke: '#000000', strokeWidth: 1 },
  instance: {},
  boolean: { fill: '#D9D9D9' },
}

export const TYPE_LABEL: Record<LayerType, string> = { frame: 'Frame', rect: 'Rectangle', text: 'Text', image: 'Image', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon', star: 'Star', path: 'Vector', section: 'Section', vector: 'Vector', instance: 'Instance', boolean: 'Boolean' }

/** 화면(프레임) 모양 → CSS. 선은 피그마 기본처럼 안쪽(inset). color: 'token:' 값 풀기, img: 'storage://' 이미지 주소 풀기 */
/** 화면 프레임 스트로크의 안쪽 부분: 자식 레이어 위에 얹는 층의 box-shadow (없으면 undefined) */
/** 화면(프레임)의 Corner smoothing: 모서리가 있고 smoothing 이 0 보다 크면 squircle(레이어와 같아요) */
export function frameSmooth(f: LayerStyle | undefined, w: number, h: number) {
  const sm = f?.smoothing ?? 0
  const r = f ? radiiOf(f) : null
  if (!f || !r || !(sm > 0) || !r.some(Boolean) || !(w > 0 && h > 0)) return null
  return { sm, r, path: squirclePath(w, h, r, sm) }
}
/**
 * smoothing 화면을 그리는 층(LayerView 와 같은 방식): 바탕은 모양대로 자른 층, 그림자는 그 바깥(drop-shadow), 선은 같은 경로의 SVG(안쪽),
 * 내용 자르기는 바깥 그림자가 없을 때만 squircle(있으면 둥근 모서리로 자르고 그림자는 살려요)
 */
export function frameSmoothLayers(f: LayerStyle | undefined, w: number, h: number, color: (v?: string) => string | undefined, img: (src?: string) => string | undefined = (s) => s) {
  const sq = frameSmooth(f, w, h)
  if (!f || !sq) return null
  const e = effectCss(f.effects, color, false)
  const shadow = e.filter.filter((x) => x.startsWith('drop-shadow')).join(' ')
  const fill = f.fill === undefined ? '#FFFFFF' : f.fill ? (color(f.fill) ?? f.fill) : 'transparent'
  const bg: Record<string, string | undefined> = { background: fill, ...backgroundCss({ fills: f.fills }, color, img), clipPath: `path('${sq.path}')`, boxShadow: e.inner.length ? e.inner.join(', ') : undefined, backdropFilter: e.backdrop, WebkitBackdropFilter: e.backdrop }
  const cols = f.strokeWidth ? strokeColors(f, color) : []
  const sw = f.strokeWidth ?? 0
  const inset = (f.strokeAlign ?? 'inside') === 'inside' ? sw / 2 : f.strokeAlign === 'outside' ? -sw / 2 : 0
  const stroke = cols.length ? { d: squirclePath(w, h, sq.r, sq.sm, inset), w: sw, colors: cols.reverse(), ...dashOf(f) } : null
  return { bg, shadow, stroke, clip: f.clip !== false && !shadow ? `path('${sq.path}')` : null }
}
/** 점선(Stroke settings · Dashed): SVG stroke-dasharray · 끝 모양 */
const dashOf = (f: LayerStyle): { dash?: string; cap?: 'round' | 'square' | 'butt' } => (f.dash ? { dash: f.dash.join(' '), cap: f.cap === 'round' ? 'round' : f.cap === 'square' ? 'square' : 'butt' } : {})
/**
 * 점선 화면 테두리(모서리 smoothing 이 없을 때) — box-shadow 로는 점선을 못 그려서, 둥근 사각형 경로의 SVG 선으로(자식 위 · 위치 Inside/Center/Outside)
 * smoothing 이 있으면 frameSmoothLayers 의 선이 같은 점선을 그려요
 */
export function frameDashStroke(f: LayerStyle | undefined, w: number, h: number, color: (v?: string) => string | undefined) {
  if (!f?.dash || !f.strokeWidth || frameSmooth(f, w, h)) return null
  const cols = strokeColors(f, color)
  if (!cols.length) return null
  const sw = f.strokeWidth
  const inset = (f.strokeAlign ?? 'inside') === 'inside' ? sw / 2 : f.strokeAlign === 'outside' ? -sw / 2 : 0
  return { d: rectPath(w, h, radiiOf(f), inset), w: sw, colors: cols.reverse(), ...dashOf(f) }
}

export function frameStroke(f: LayerStyle | undefined, color: (v?: string) => string | undefined, w = 0, h = 0): string | undefined {
  if (!f || frameSmooth(f, w, h)) return undefined
  const sk = strokeShadows(f, 'frame', color)
  return sk.inner.length ? sk.inner.join(', ') : undefined
}

/** 화면(프레임) 모양. w · h 를 주면 Corner smoothing 도 따져요(그땐 바탕 · 그림자 · 선은 frameSmoothLayers 가 그려요) */
export function frameCss(f: LayerStyle | undefined, color: (v?: string) => string | undefined, img: (src?: string) => string | undefined = (s) => s, w = 0, h = 0): Record<string, string | number> {
  if (!f) return {}
  const css: Record<string, string | number> = {}
  const sq = frameSmooth(f, w, h)
  if (f.radii) css.borderRadius = f.radii.map((r) => r + 'px').join(' ')
  else if (f.radius) css.borderRadius = f.radius + 'px'
  const e = effectCss(f.effects, color, true)
  if (sq) {
    css.background = 'transparent'
    const sl = frameSmoothLayers(f, w, h, color, img)
    if (sl?.clip) css.clipPath = sl.clip
    // 그림자(drop-shadow)는 화면 요소 자체에 — 내용 자르기(overflow)는 자기 filter 를 자르지 않아요
    const ef = effectCss(f.effects, color, false).filter
    if (ef.length) css.filter = ef.join(' ')
    if (f.opacity !== undefined && f.opacity < 1) css.opacity = f.opacity
    if (f.clip === false || !sl?.clip) css.overflow = f.clip === false ? 'visible' : 'hidden'
    return css
  }
  if (f.fill !== undefined) css.background = f.fill ? (color(f.fill) ?? f.fill) : 'transparent'
  // 덧붙인 칠(그라디언트 · 이미지): 바탕 칠 위로
  if (f.fills?.length) Object.assign(css, backgroundCss({ fills: f.fills }, color, img))
  // 스트로크: 바깥쪽만 여기(바탕 그림자). 안쪽 · 가운데 스트로크의 안쪽 반은 자식 위에 그려야 해서 frameStroke() 로 따로 — 피그마처럼 스트로크가 자식을 덮어요
  const sk = strokeShadows(f, 'frame', color)
  const shadows = [...sk.outer, ...e.outer, ...e.inner]
  if (shadows.length) css.boxShadow = shadows.join(', ')
  if (e.filter.length) css.filter = e.filter.join(' ')
  if (e.backdrop) { css.backdropFilter = e.backdrop; css.WebkitBackdropFilter = e.backdrop }
  if (f.opacity !== undefined && f.opacity < 1) css.opacity = f.opacity
  if (f.clip === false) css.overflow = 'visible'
  return css
}

/** 그룹인지: group 표시가 있으면 그대로, 없으면(예전 문서) 채우기 · 자르기 · 오토 레이아웃 없는 프레임을 그룹으로 봐요 */
export function isGroupNode(n: LayerNode | undefined | null): boolean {
  if (!n || n.type !== 'frame' || n.style.layout) return false
  if (n.group !== undefined) return n.group
  return n.style.clip === false && !n.style.fill && !n.style.fills?.length
}
