import type { LayerStore } from './store'
import type { LayerStyle } from './schema'

/**
 * 글자 단축키(피그마와 같아요, 한국어 자판 기준). 글자 레이어를 고른 상태와 글자를 고치는 중 모두 같은 키로 — 레이어 전체에 적용해요.
 * (고치는 중 글자를 골랐으면 ⌘B · ⌘U · ⇧⌘X 는 LayerView 가 그 글자에만 적용해요 — app/canvas/textRuns.ts)
 * - ⌘B 굵게 · ⌘U 밑줄 · ⇧⌘X 취소선
 * - ⌥⌘L · T · R · J 왼쪽 · 가운데 · 오른쪽 · 양쪽 정렬
 * - ⇧⌘< > 글자 크기 · ⌥⌘< > 굵기 · ⌥< > 자간 · ⌥⇧< > 행간 (< 는 쉼표 키, > 는 마침표 키)
 * - ⇧⌘7 번호 목록 · ⇧⌘8 글머리 목록
 * 처리했으면 true(기본 동작을 막아요)
 */
export function textShortcut(e: KeyboardEvent, store: LayerStore, sid: string | null, ids: string[]): boolean {
  if (!sid || !ids.length) return false
  const d = store.doc(sid)
  const nodes = ids.map((id) => d.nodes[id]).filter((n) => !!n)
  if (!nodes.length || nodes.some((n) => n!.type !== 'text')) return false
  const cmd = e.metaKey || e.ctrlKey
  const { altKey: alt, shiftKey: shift } = e
  const code = e.code
  const first = nodes[0]!.style
  const set = (s: Partial<LayerStyle>) => store.style(sid, ids, s)
  const each = (fn: (s: LayerStyle) => Partial<LayerStyle>) => store.batch(() => { for (const n of nodes) store.style(sid, [n!.id], fn(n!.style)) })
  const r2 = (v: number) => Math.round(v * 100) / 100
  // 꾸밈
  if (cmd && !alt && !shift && code === 'KeyB') { set({ fontWeight: (first.fontWeight ?? 400) >= 600 ? 400 : 700 }); return true }
  if (cmd && !alt && !shift && code === 'KeyU') { set({ decoration: first.decoration === 'underline' ? undefined : 'underline' }); return true }
  if (cmd && !alt && shift && code === 'KeyX') { set({ decoration: first.decoration === 'strike' ? undefined : 'strike' }); return true }
  // 정렬
  const AL: Record<string, LayerStyle['align']> = { KeyL: 'left', KeyT: 'center', KeyR: 'right', KeyJ: 'justify' }
  if (cmd && alt && !shift && AL[code]) { set({ align: AL[code] }); return true }
  // 목록
  if (cmd && shift && !alt && (code === 'Digit7' || code === 'Digit8')) {
    const kind = code === 'Digit7' ? 'number' : 'bullet'
    set({ list: first.list === kind ? undefined : kind })
    return true
  }
  // 크기 · 굵기 · 자간 · 행간
  if (code !== 'Comma' && code !== 'Period') return false
  const dir = code === 'Period' ? 1 : -1
  if (cmd && shift && !alt) { each((s) => ({ fontSize: Math.max(1, (s.fontSize ?? 16) + dir) })); return true }
  if (cmd && alt && !shift) {
    const W = [100, 200, 300, 400, 500, 600, 700, 800, 900]
    each((s) => {
      const cur = s.fontWeight ?? 400
      const next = dir > 0 ? W.find((w) => w > cur) : [...W].reverse().find((w) => w < cur)
      return { fontWeight: next ?? cur }
    })
    return true
  }
  if (!cmd && alt && !shift) { each((s) => ({ letterSpacing: r2((s.letterSpacing ?? 0) + dir * (s.fontSize ?? 16) * 0.01) })); return true }
  if (!cmd && alt && shift) { each((s) => ({ lineHeight: Math.max(1, Math.round((s.lineHeight ?? Math.round((s.fontSize ?? 16) * 1.4)) + dir)) })); return true }
  return false
}
