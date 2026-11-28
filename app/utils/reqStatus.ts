import type { LinkRow, LinkStatus } from '~/composables/useIrisData'
import { LINK_STATUS } from '~/composables/useIrisData'

/**
 * 요청사항 하나의 전체 상태(연결된 화면들의 상태에서 정해요, 손볼 것이 이겨요) — 프로젝트 요청사항 탭 · 개요 진행도 · 문서에서 보기가 같이 써요
 *  1. 연결된 화면이 없으면 → 연결 안 됨
 *  2. 연결이 모두 '해당 없음'이면 → 해당 없음
 *  3. '해당 없음'을 뺀 연결 중 하나라도 미반영이면 → 미반영 (그다음 확인 전 → 일부 반영)
 *  4. 모두 반영됨이면 → 반영됨
 */
export type ReqStatus = LinkStatus | 'none'

export const REQ_STATUS_TEXT: Record<ReqStatus, string> = {
  unchecked: LINK_STATUS.unchecked.label,
  missing: LINK_STATUS.missing.label,
  partial: LINK_STATUS.partial.label,
  reflected: LINK_STATUS.reflected.label,
  na: LINK_STATUS.na.label,
  none: 'Not linked',
}
/** '손볼 것' — 손볼 순서대로 */
export const REQ_TODO: ReqStatus[] = ['missing', 'none', 'unchecked', 'partial']

export function deriveReqStatus(list: LinkRow[]): ReqStatus {
  if (!list.length) return 'none'
  const real = list.filter((x) => x.status !== 'na')
  if (!real.length) return 'na'
  if (real.some((x) => x.status === 'missing')) return 'missing'
  if (real.some((x) => x.status === 'unchecked')) return 'unchecked'
  if (real.some((x) => x.status === 'partial')) return 'partial'
  return 'reflected'
}
