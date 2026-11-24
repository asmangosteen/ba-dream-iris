/**
 * 화면에 보이는 위치 · 크기 · 각도 숫자(인스펙터 X · Y · W · H, 캔버스 크기 표시, 간격 측정).
 * 피그마처럼 그리기 · 선택선은 실제 크기(소수 포함) 그대로 쓰고, 보여 주는 숫자만 정수로 반올림해요.
 * 소수점까지 보고 싶으면 SHOW_DECIMALS 를 true 로(나중에 설정 화면의 켜기 옵션으로 옮길 자리)
 */
export const SHOW_DECIMALS = false

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return ''
  return SHOW_DECIMALS ? String(Math.round(v * 100) / 100) : String(Math.round(v))
}
