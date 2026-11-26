import type { RangeValues, RunStyle } from '~/canvas/textRuns'

/**
 * 글자를 고치는 중 고른 글자 구간(오른쪽 패널이 그 글자에만 서식을 적용해요 — 피그마와 같아요).
 * 고치는 글자 칸(LayerView)이 채우고, 패널(InspectorLayer · InspectorPaints)이 읽어서 값을 보여 주고 apply 로 바꿔요.
 * 패널을 누르는 동안에도 편집은 이어지고(고른 글자는 하이라이트로 남아요), 캔버스 다른 곳을 누르면 끝나요
 */
export interface TextRangeState {
  sid: string
  id: string
  start: number
  end: number
  values: RangeValues
  apply: (patch: RunStyle) => void
}
const state = shallowRef<TextRangeState | null>(null)
export const useTextRange = () => state
