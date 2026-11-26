import type { LayerNode, LayerStyle } from './schema'
import { lineHeightCss } from './schema'

/**
 * 글자 구간 서식(피그마처럼 글자 하나하나 다른 색 · 굵기 · 크기 …).
 * 글자 레이어의 style 이 바탕이고, spans 는 [s, e) 구간에서 바탕을 덮어쓰는 값들(겹치지 않게 정리해 둬요).
 * 줄 높이는 단위와 한 묶음: 구간이 lineHeight 를 덮으면 단위도 그 구간 것(없으면 px)
 */
export const RUN_KEYS = ['color', 'fontWeight', 'fontSize', 'lineHeight', 'lineHeightUnit', 'letterSpacing', 'decoration'] as const
export type RunKey = (typeof RUN_KEYS)[number]
export type RunStyle = Partial<Pick<LayerStyle, RunKey>>
export interface TextSpan { s: number; e: number; style: RunStyle }

const clean = (st: RunStyle): RunStyle => {
  const o: Record<string, unknown> = {}
  for (const k of RUN_KEYS) if (st[k] !== undefined) o[k] = st[k]
  return o as RunStyle
}
const same = (a: RunStyle, b: RunStyle) => JSON.stringify(clean(a)) === JSON.stringify(clean(b))
const empty = (st: RunStyle) => !RUN_KEYS.some((k) => st[k] !== undefined)

/** 글자마다 덮어쓴 서식 */
export function perChar(len: number, spans?: TextSpan[]): RunStyle[] {
  const out: RunStyle[] = Array.from({ length: len }, () => ({}))
  for (const sp of spans ?? []) for (let i = Math.max(0, sp.s); i < Math.min(len, sp.e); i++) out[i] = { ...out[i], ...sp.style }
  return out
}
/** 글자마다 서식 → 이어 붙인 구간(같은 서식끼리 합치고, 덮어쓴 게 없는 곳은 빼요) */
export function fromPerChar(chars: RunStyle[]): TextSpan[] {
  const out: TextSpan[] = []
  for (let i = 0; i < chars.length; i++) {
    const st = clean(chars[i]!)
    if (empty(st)) continue
    const last = out[out.length - 1]
    if (last && last.e === i && same(last.style, st)) last.e = i + 1
    else out.push({ s: i, e: i + 1, style: st })
  }
  return out
}
/** [a, b) 구간에 서식 덮어쓰기. patch 에 키가 있고 값이 undefined 면 그 키의 덮어쓰기를 지워요(바탕을 따라가요) */
export function applySpans(len: number, spans: TextSpan[] | undefined, a: number, b: number, patch: RunStyle): TextSpan[] {
  const chars = perChar(len, spans)
  for (let i = Math.max(0, a); i < Math.min(len, b); i++) {
    const st: Record<string, unknown> = { ...chars[i] }
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete st[k]; else st[k] = v }
    // 줄 높이를 덮으면 단위도 그 구간 것으로(px 면 단위 키 없음)
    if ('lineHeight' in patch && !('lineHeightUnit' in patch)) delete st.lineHeightUnit
    chars[i] = st as RunStyle
  }
  return fromPerChar(chars)
}
/** 바탕 + 구간 → 그 글자의 실제 서식 */
export function effective(base: LayerStyle, run: RunStyle): LayerStyle {
  const st: LayerStyle = { ...base, ...clean(run) }
  if (run.lineHeight !== undefined) st.lineHeightUnit = run.lineHeightUnit
  return st
}
/** 바탕 서식을 바꾸면 그 키의 구간 덮어쓰기는 지워요(레이어 전체에 적용 — 피그마와 같아요) */
export function stripRuns(n: LayerNode, keys: string[]) {
  if (n.type !== 'text' || !n.spans?.length) return
  const ks = keys.filter((k) => (RUN_KEYS as readonly string[]).includes(k))
  if (!ks.length) return
  if (ks.includes('lineHeight') || ks.includes('lineHeightUnit')) ks.push('lineHeight', 'lineHeightUnit')
  const next = fromPerChar(perChar((n.text ?? '').length, n.spans).map((st) => { const o: Record<string, unknown> = { ...st }; for (const k of ks) delete o[k]; return o as RunStyle }))
  if (next.length) n.spans = next
  else delete n.spans
}
/** 바뀐 바탕 키(전과 비교)의 구간 덮어쓰기를 지워요 */
export function stripChanged(n: LayerNode, before: LayerStyle) {
  if (n.type !== 'text' || !n.spans?.length) return
  stripRuns(n, RUN_KEYS.filter((k) => JSON.stringify(n.style[k]) !== JSON.stringify(before[k])))
}

// ---------------------------------------------------------------------------
// 그리기
// ---------------------------------------------------------------------------
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (t: string) => esc(t).replace(/"/g, '&quot;')
/** 구간 하나의 CSS(덮어쓴 것만) */
export function runCss(base: LayerStyle, run: RunStyle, color: (v?: string) => string | undefined): string {
  const st = effective(base, run)
  const css: string[] = []
  if (run.color !== undefined) { const c = color(run.color) ?? run.color; css.push(`color:${c}`, `-webkit-text-fill-color:${c}`) }
  if (run.fontWeight !== undefined) css.push(`font-weight:${run.fontWeight}`)
  if (run.fontSize !== undefined) css.push(`font-size:${run.fontSize}px`)
  // 줄 높이: 구간이 덮었거나, 크기를 바꿨는데 바탕이 % 면(% 는 그 글자 크기 기준 — 피그마와 같아요)
  if (run.lineHeight !== undefined || (run.fontSize !== undefined && st.lineHeightUnit === 'percent')) css.push(`line-height:${lineHeightCss(st)}`)
  if (run.letterSpacing !== undefined) css.push(`letter-spacing:${run.letterSpacing}px`)
  if (run.decoration !== undefined) css.push(`text-decoration:${run.decoration === 'underline' ? 'underline' : run.decoration === 'strike' ? 'line-through' : 'none'}`)
  return css.join(';')
}
/** [from, to) 글자를 HTML 로(구간마다 span data-run — 고치는 동안 읽어 들일 때 써요). 덮어쓴 게 없으면 글자만 */
export function runsHtml(text: string, spans: TextSpan[] | undefined, base: LayerStyle, color: (v?: string) => string | undefined, from = 0, to = text.length): string {
  if (!spans?.length) return esc(text.slice(from, to))
  let out = ''
  let i = from
  for (const sp of [...spans].sort((a, b) => a.s - b.s)) {
    const s = Math.max(sp.s, from), e = Math.min(sp.e, to)
    if (e <= s) continue
    if (s > i) out += esc(text.slice(i, s))
    out += `<span data-run="${escAttr(JSON.stringify(clean(sp.style)))}" style="${escAttr(runCss(base, sp.style, color))}">${esc(text.slice(s, e))}</span>`
    i = e
  }
  if (i < to) out += esc(text.slice(i, to))
  return out
}

// ---------------------------------------------------------------------------
// 고치는 칸(contenteditable) 읽기 — 글자 · 구간 · 글자 위치
// ---------------------------------------------------------------------------
type Unit = { node: Text; start: number; len: number }
/** 칸 안을 훑어 글자 · 글자마다 서식 · 글자 노드 위치를 모아요(줄바꿈: <br> · 블록 요소 · 글자 안 \n) */
function walk(root: Node) {
  let text = ''
  const chars: RunStyle[] = []
  const units: Unit[] = []
  const visit = (node: Node, st: RunStyle) => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        const t = (c as Text).data
        units.push({ node: c as Text, start: text.length, len: t.length })
        text += t
        for (let i = 0; i < t.length; i++) chars.push(st)
      } else if (c instanceof HTMLElement) {
        if (c.tagName === 'BR') { text += '\n'; chars.push(st); continue }
        const block = c.tagName === 'DIV' || c.tagName === 'P'
        if (block && text.length && !text.endsWith('\n')) { text += '\n'; chars.push(st) }
        let own = st
        const raw = c.getAttribute('data-run')
        if (raw) { try { own = JSON.parse(raw) as RunStyle } catch { /* 그대로 */ } }
        visit(c, own)
      }
    }
  }
  visit(root, {})
  return { text, chars, units }
}
/** 고친 결과: 글자(끝 줄바꿈 하나는 빼요 — 브라우저가 붙이는 자리) · 구간 */
export function readEditable(el: HTMLElement): { text: string; spans: TextSpan[] } {
  const w = walk(el)
  let { text } = w
  let chars = w.chars
  if (text.endsWith('\n')) { text = text.slice(0, -1); chars = chars.slice(0, -1) }
  return { text, spans: fromPerChar(chars) }
}
/** 칸 안 (node, offset) → 글자 번호 */
export function offsetOf(el: HTMLElement, node: Node, off: number): number {
  const r = document.createRange()
  r.setStart(el, 0)
  try { r.setEnd(node, off) } catch { return 0 }
  const box = document.createElement('div')
  box.appendChild(r.cloneContents())
  return walk(box).text.length
}
/** 글자 번호 → 칸 안 (node, offset) */
export function pointOf(el: HTMLElement, pos: number): { node: Node; off: number } {
  const { units } = walk(el)
  for (const u of units) if (pos <= u.start + u.len && pos >= u.start) return { node: u.node, off: pos - u.start }
  const last = units[units.length - 1]
  return last ? { node: last.node, off: last.len } : { node: el, off: 0 }
}
/** 글자 번호 구간 → Range */
export function rangeOf(el: HTMLElement, a: number, b: number): Range {
  const r = document.createRange()
  const p = pointOf(el, a), q = pointOf(el, b)
  r.setStart(p.node, p.off)
  r.setEnd(q.node, q.off)
  return r
}

/** 고른 구간의 서식 값(오른쪽 패널용): 글자마다 같으면 그 값, 다르면 'Mixed' */
export type RangeValues = { [K in 'color' | 'fontWeight' | 'fontSize' | 'letterSpacing' | 'decoration' | 'lineHeight']: unknown }
export function rangeValues(base: LayerStyle, spans: TextSpan[] | undefined, len: number, a: number, b: number): RangeValues {
  const chars = perChar(len, spans).slice(Math.max(0, a), Math.min(len, b))
  const eff = (chars.length ? chars : [{}]).map((c) => effective(base, c))
  const one = (fn: (s: LayerStyle) => unknown) => { const v = eff.map(fn); return v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : 'Mixed' }
  return {
    color: one((s) => s.color),
    fontWeight: one((s) => s.fontWeight ?? 400),
    fontSize: one((s) => s.fontSize ?? 16),
    letterSpacing: one((s) => s.letterSpacing ?? 0),
    decoration: one((s) => s.decoration),
    lineHeight: one((s) => (s.lineHeight === undefined ? '' : s.lineHeightUnit === 'percent' ? `${Math.round(s.lineHeight * 100) / 100}%` : String(Math.round(s.lineHeight * 100) / 100))),
  }
}
