import type { EmitFn, Ref, ShortEmitsToObject } from 'vue'
import type { ScreenRow } from '~/composables/useEditor'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import type { LayerType, Paint } from '~/canvas/schema'
import type { LayerStore } from '~/canvas/store'
import type { denorm } from '~/canvas/vector'
import type { VKey } from '~/canvas/vsel'
import type { ArrangeOp, Guides, Handle, Mat, Rect } from '~/canvas/geom'
import type { useImageSrc } from '~/canvas/images'
import type { useImageEdit } from '~/composables/useImageEdit'

/**
 * EditorCanvas 가 여러 파일로 나뉘며 함께 쓰는 타입 · 상수.
 * 캔버스 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y)
 */
export interface Viewport { x: number; y: number; zoom: number }

export interface CanvasProps { screens: ScreenRow[]; /** 프로젝트 썸네일로 정한 화면(없으면 첫 페이지의 첫 화면) */ coverId?: string | null; highlight?: string[]; /** 문서에서 마우스를 올린 REQ 가 가리키는 항목들(화면 · 레이어) — 청록 선 */ peek?: { label: string; items: { sid: string; ids: string[] }[] } | null; background?: string | null; pixelGrid?: boolean; snapPixel?: boolean; guides?: { x: number[]; y: number[] } }

export type CanvasEmits = {
  /** 프레임 우클릭 'Set as thumbnail'(그 화면 id) · 'Restore default thumbnail'(null) — 홈 목록의 프로젝트 썸네일 */
  thumbnail: [screenId: string | null]
  /** ⌘R 인데 이름 바꿀 게 없을 때: 이 탭만 새로 고침(피그마 데스크톱과 같아요) */
  reload: []
  move: [id: string, x: number, y: number, done: boolean]
  /** 화면(프레임) 변 · 모서리 끌어 크기 바꾸기 */
  'resize-screen': [id: string, rect: { x: number; y: number; width: number; height: number }, done: boolean]
  /** 여러 화면 정렬 · 균등 분배 (단축키) */
  'arrange-screens': [op: ArrangeOp]
  /** 캔버스 이름표에서 화면 이름 고치기 */
  'rename-screen': [id: string, name: string]
  create: [rect: { x: number; y: number; width: number; height: number }]
  hint: [text: string]
  /** 화면(프레임) 단위 동작 — 레이어를 고르지 않고 화면만 골랐을 때 */
  /** 캔버스에 파일을 끌어 놓았을 때(캔버스 좌표) */
  /** place: 놓은 자리의 화면(또는 캔버스) · 가장 안쪽 프레임 */
  'drop-files': [files: File[], at: { x: number; y: number }, place?: { sid: string; parentId: string | null }]
  'screen-action': [action: 'remove' | 'duplicate' | 'copy' | 'paste' | 'nudge' | 'front' | 'back' | 'forward' | 'backward', dx?: number, dy?: number]
  /** 가이드선 바뀜 */
  guides: [g: { x: number[]; y: number[] }]
  /** 보기 설정 단축키: ⇧' 픽셀 격자 · ⇧⌘' 픽셀에 맞추기 */
  view: [k: 'pixelGrid' | 'snapPixel']
  /** ⌥ 끌어서 화면 복제(놓은 자리) */
  'clone-screen': [id: string, x: number, y: number]
  /** 레이어와 섞어 고른 화면들 — 복제해서 놓기 · 복사 · 붙여넣기(새 화면들은 레이어 선택과 함께 골라 둬요) */
  'clone-screens': [items: { id: string; x: number; y: number }[]]
  'clip-screens': [ids: string[]]
  'paste-screens': [withLayers: boolean]
  /** 화면 단축키(피그마와 같아요): ⌘\\ UI 숨기기 · ⌥1 레이어 · ⌥2 에셋 · ⌥8 디자인 탭 · PageUp/PageDown 이전 · 다음 페이지 */
  ui: [k: 'toggle-ui' | 'left-file' | 'left-assets' | 'design' | 'prev-page' | 'next-page']
  /** 이미지 도구(⇧⌘K)로 누르거나 끌어서 놓을 자리(캔버스 좌표 · 끈 너비) */
  'place-image': [at: { x: number; y: number }, width: number | null, place?: { sid: string; parentId: string | null }]
}
/** defineEmits<CanvasEmits>() 가 돌려주는 emit 과 같은 모양 */
export type CanvasEmit = EmitFn<ShortEmitsToObject<CanvasEmits>>

export type Targets = { sibs: Rect[]; parents: Rect[] }
/** 그리는 중 Space(피그마와 같아요): 누른 순간의 포인터 · 시작점 — 손을 뗄 때까지 그리던 것을 통째로 옮겨요 */
export type SpaceMove = { x: number; y: number; ox: number; oy: number }
export type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'screen'; id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; targets: Rect[]; moved: boolean; clickLayer?: string; dup?: boolean; canDup?: boolean }
  | { kind: 'draw'; wx: number; wy: number; moved: boolean; sp?: SpaceMove }
  | { kind: 'placeImage'; wx: number; wy: number; moved: boolean }
  | { kind: 'layers'; xcarry?: { sid: string; id: string; x: number; y: number; inv: Mat }[]; xbefore?: [string, string][]; sid: string; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; inv: Record<string, Mat>; b0: Rect | null; targets: Targets; before: string; moved: boolean; carry: { id: string; x: number; y: number }[]; clickLayer?: string; out?: boolean; parent0?: string | null; duped?: boolean; mixIds?: string[]; carryDup?: boolean ; prevDup?: { ids: string[]; orig: Record<string, { x: number; y: number }>; inv: Record<string, Mat>; targets: Targets; carry: { id: string; x: number; y: number }[] } }
  | { kind: 'drawLine'; sid: string; parentId: string | null; px: number; py: number; lx: number; ly: number; ex: number; ey: number; arrow: boolean; moved: boolean; sp?: SpaceMove; c?: { x: number; y: number } }
  | { kind: 'pencil'; sid: string; parentId: string | null; px: number; py: number; pts: [number, number][]; moved: boolean }
  | { kind: 'resize'; sid: string; id: string; handle: Handle; sx: number; sy: number; g: { cx: number; cy: number; w: number; h: number; angle: number }; pinv: Mat; ratio: boolean; targets: Targets; before: string; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; sub0?: string; img0?: { i: number; x: number; y: number; R: { x: number; y: number; w: number; h: number }; p: Paint } }
  | { kind: 'pen'; moved: boolean }
  | { kind: 'vpt'; sid: string; id: string; pi: number; qi: number; part: 'a' | 'i' | 'o'; sx: number; sy: number; abs0: ReturnType<typeof denorm>; inv: Mat; x0: number; y0: number; before: string; moved: boolean; virtual?: { cx: number; cy: number; r: number; qi: number }[]; group?: [number, number][]; collapse?: VKey }
  | { kind: 'resizeMany'; sid: string; handle: Handle; sx: number; sy: number; u0: Rect; items: { id: string; b: Rect; p: { x: number; y: number }; w0: number; h0: number; rot: number; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; sub0?: string }[]; targets: Targets; before: string; moved: boolean }
  | { kind: 'resizeScreen'; id: string; handle: Handle; sx: number; sy: number; o: Rect; targets: Rect[]; moved: boolean; kids0?: Record<string, { x: number; y: number; w: number; h: number }>; before?: string; scale0?: string }
  | { kind: 'rotate'; sid: string; id: string; cx: number; cy: number; a0: number; r0: number; sign: number; before: string; moved: boolean }
  | { kind: 'rotateScreen'; sid: string; cx: number; cy: number; a0: number; r0: number; before: string; moved: boolean }
  | { kind: 'drawLayer'; sid: string; type: LayerType; parentId: string | null; px: number; py: number; lx: number; ly: number; moved: boolean; sp?: SpaceMove }
  | { kind: 'marquee'; sid: string; wx: number; wy: number; base: string[]; moved: boolean; deep?: boolean; click?: string; add?: boolean; pick?: boolean; within?: string }
  | { kind: 'vmarquee'; x0: number; y0: number; base: VKey[]; moved: boolean }
  | { kind: 'marqueeCanvas'; wx: number; wy: number; moved: boolean; baseScreens: string[]; baseLayers: string[]; deep?: boolean }
  | { kind: 'screens'; ids: string[]; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; b0: Rect; targets: Rect[]; moved: boolean; dup?: boolean }
/** 지금 끄는 것(없으면 null) — 파일끼리 같은 상태를 보도록 상자 하나에 담아 둬요(반응형 아님) */
export type DragRef = { current: Drag | null }

/** 캔버스 좌표 상자(화면 · 미리보기) */
export type CanvasBox = { x: number; y: number; width: number; height: number }

/** EditorCanvas.vue 가 만들어 모든 파일에 넘기는 바탕 상태 */
export interface CanvasBase {
  props: Readonly<CanvasProps>
  emit: CanvasEmit
  store: LayerStore
  el: Ref<HTMLElement | null>
  tool: Ref<Tool>
  vp: Ref<Viewport>
  multi: Ref<string[]>
  mix: Ref<string[]>
  dragRef: DragRef
  space: Ref<boolean>
  panning: Ref<boolean>
  draft: Ref<CanvasBox | null>
  draftType: Ref<LayerType | null>
  mixGhosts: Ref<CanvasBox[]>
  draftPts: Ref<[number, number][] | null>
  marqueeOn: Ref<boolean>
  guides: Ref<Guides | null>
  frameImg: ReturnType<typeof useImageSrc>
  imgEdit: ReturnType<typeof useImageEdit>
}

/** 마우스를 올린 레이어는 모양과 상관없이 늘 네모 상자로(모양선 · 둥근 상자 · 글자 밑줄 대신). false 로 바꾸면 피그마식 모양 따라가기 */
export const HOVER_BOX_ONLY = true
/** 선 · 벡터 · 다각형처럼 상자가 아닌 모양(모양선을 그려요) */
export const OUTLINE_TYPES = new Set(['vector', 'path', 'line', 'polygon', 'star', 'boolean'])
/** 점 편집할 수 있는 종류 */
export const EDITABLE = new Set(['vector', 'line', 'path', 'polygon', 'star', 'ellipse', 'rect'])
/** 피그마에서 가져온 화면 위에 놓았을 때 안내 */
export const FIGMA_DROP_HINT = 'Figma frames can\'t hold layers · placed on the canvas'
