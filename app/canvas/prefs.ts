/**
 * 편집기 개인 설정(이 브라우저에 저장). smoothDefault: 새로 그리는 사각형 · 프레임 · 이미지에 Corner smoothing 60%(iOS)를 늘 넣기
 */
const KEY = 'iris-smooth-default'
export const smoothDefault = ref(false)
if (import.meta.client) {
  try { smoothDefault.value = localStorage.getItem(KEY) === '1' } catch { /* 저장소를 못 쓰면 꺼진 채 */ }
}
export function setSmoothDefault(v: boolean) {
  smoothDefault.value = v
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* 무시 */ }
}
/** 새 레이어 스타일에 넣을 smoothing(꺼져 있으면 undefined) */
export const newSmoothing = (type: string) => (smoothDefault.value && (type === 'rect' || type === 'frame' || type === 'image') ? 0.6 : undefined)

/** Position 오른쪽 아이콘으로 Constraints 보이기 · 숨기기(피그마와 같아요). 기본은 보여요 */
const CONS_KEY = 'iris-constraints-shown'
export const consShown = ref(true)
if (import.meta.client) {
  try { consShown.value = localStorage.getItem(CONS_KEY) !== '0' } catch { /* 저장소를 못 쓰면 보이는 채 */ }
}
export function setConsShown(v: boolean) {
  consShown.value = v
  try { localStorage.setItem(CONS_KEY, v ? '1' : '0') } catch { /* 무시 */ }
}
