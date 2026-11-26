/** 캔버스 커서(편집기 · 이미지 자르기 화면이 함께 써요) */
export type Corner = 'nw' | 'ne' | 'se' | 'sw'
/**
 * 돌리기 커서(피그마와 같아요): 모서리를 감싸는 굽은 화살표 — 왼쪽 위 모양을 기준으로 모서리마다 90° 씩, 돌린 상자면 그 각도만큼 더 돌려요
 */
const ROT_BASE: Record<Corner, number> = { nw: 0, ne: 90, se: 180, sw: 270 }
const rotCursorCache = new Map<number, string>()
export function rotCursor(c: Corner, angle = 0) {
  const a = ((Math.round(ROT_BASE[c] + angle) % 360) + 360) % 360
  let v = rotCursorCache.get(a)
  if (!v) {
    // 양쪽 화살표 굽은 선(피그마 돌리기 커서): 사분원(90°) 곡선 + 양 끝 채운 삼각 화살촉 — 흰 테두리 + 검은 선, 옅은 그림자
    const arc = 'M7.5 17A10 10 0 0 1 17.5 7'
    const heads = 'M17 3.2L21.6 7L17 10.8Z M3.7 16.5L7.5 21.1L11.3 16.5Z'
    const g = `<path d='${arc}' stroke='white' stroke-width='4.5'/><path d='${heads}' fill='white' stroke='white' stroke-width='3'/><path d='${arc}' stroke='black' stroke-width='1.6'/><path d='${heads}' fill='black'/>`
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><defs><filter id='s' x='-20%' y='-20%' width='140%' height='140%'><feDropShadow dx='0' dy='0.6' stdDeviation='0.6' flood-opacity='0.35'/></filter></defs><g fill='none' stroke-linecap='round' stroke-linejoin='round' filter='url(#s)' transform='rotate(${a} 12 12)'>${g}</g></svg>`
    v = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, alias`
    rotCursorCache.set(a, v)
  }
  return v
}
