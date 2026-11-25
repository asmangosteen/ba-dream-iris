/**
 * 화면에 보이는 위치 · 크기 · 각도 숫자(인스펙터 X · Y · W · H, 캔버스 크기 표시, 간격 측정).
 * 피그마처럼 소수가 있으면 둘째 자리까지 보여 줘요(351.47) — 정수면 그대로(351).
 * 픽셀에 맞추기(Snap to pixel grid)를 켜 두면 값이 늘 정수라 정수로만 보여요.
 */
export const SHOW_DECIMALS = true

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return ''
  return SHOW_DECIMALS ? String(Math.round(v * 100) / 100) : String(Math.round(v))
}
