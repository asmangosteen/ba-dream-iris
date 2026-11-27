/**
 * 지금 칠 창에서 고치는 그라디언트(캔버스 위 그라디언트 점을 보여 주려고 — 피그마와 같아요).
 * 칠 패널(InspectorPaints)이 칠 창을 그라디언트로 열면 채우고, 닫으면 비워요. 캔버스(GradientHandles)가 이걸 보고 점을 그려요
 */
export interface GradEdit { sid: string; ids: string[]; key: 'fills' | 'strokes'; index: number }
export const useGradEdit = () => useState<GradEdit | null>('iris-grad-edit', () => null)
