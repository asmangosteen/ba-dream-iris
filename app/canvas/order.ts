/**
 * 앞뒤 순서 바꾸기(피그마와 같아요) — 그리는 순서 배열(뒤일수록 위)에서 고른 것들을 함께 옮겨요.
 * 고른 것끼리의 순서는 그대로: 맨 앞으로 = 끝으로 모아서, 맨 뒤로 = 처음으로 모아서,
 * 한 칸 앞 · 뒤 = 고르지 않은 바로 옆 하나를 건너서(붙어 있는 묶음도 같이 한 칸)
 */
export type OrderMove = 'front' | 'back' | 'forward' | 'backward' | 'top' | 'bottom' | 1 | -1
export function moveOrder<T>(list: T[], picked: Set<T>, to: OrderMove): T[] {
  const sel = list.filter((v) => picked.has(v))
  if (!sel.length) return list
  const rest = list.filter((v) => !picked.has(v))
  if (to === 'front' || to === 'top') return [...rest, ...sel]
  if (to === 'back' || to === 'bottom') return [...sel, ...rest]
  const out = [...list]
  if (to === 'forward' || to === 1) {
    for (let i = out.length - 2; i >= 0; i--) if (picked.has(out[i]!) && !picked.has(out[i + 1]!)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!]
  } else {
    for (let i = 1; i < out.length; i++) if (picked.has(out[i]!) && !picked.has(out[i - 1]!)) [out[i], out[i - 1]] = [out[i - 1]!, out[i]!]
  }
  return out
}
