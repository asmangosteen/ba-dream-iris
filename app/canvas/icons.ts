import type { LayerType } from './schema'

/** 레이어 종류 아이콘 — 편집기 아이콘 이름(EditorIcon · irisIcons.ts). 이미지는 따로 image 아이콘을 써요 */
export const LAYER_ICON: Partial<Record<LayerType, string>> = {
  frame: 'frame',
  section: 'section',
  rect: 'rectangle',
  text: 'text',
  ellipse: 'ellipse',
  line: 'line',
  polygon: 'polygon',
  star: 'star',
  path: 'pencil',
  vector: 'pen',
  instance: 'component',
  boolean: 'boolean',
}
