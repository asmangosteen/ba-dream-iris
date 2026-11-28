import type { AutoLayout, Constraints, LayerDoc, LayerNode } from './schema'
import { fitBoolean } from './boolean'
import { apply, localMatrix } from './geom'
import { isGroupNode } from './schema'

/**
 * 오토 레이아웃 계산 (v6). 자식 x · y · w · h 를 직접 써 넣어서 선택 상자 · 측정 · 내보내기는 레이아웃을 몰라도 돼요.
 * 안쪽부터(자식 프레임 → 부모) 계산합니다. 채우기(Fill) 자식은 부모 크기가 정해진 뒤 다시 계산해요.
 */
const flowKids = (d: LayerDoc, n: LayerNode) => (n.children ?? []).map((c) => d.nodes[c]).filter((c): c is LayerNode => !!c && !c.hidden && !c.absolute)
const isH = (l: AutoLayout) => l.mode === 'horizontal'
const sizeOf = (n: LayerNode, axis: 'w' | 'h') => (axis === 'w' ? n.sizeH ?? (n.type === 'text' && n.style.autoWidth ? 'hug' : 'fixed') : n.sizeV ?? (n.type === 'text' ? 'hug' : 'fixed'))
const r2 = (v: number) => Math.round(v * 100) / 100

export function relayout(d: LayerDoc) {
  const done = new Set<string>()
  const visit = (id: string) => {
    const n = d.nodes[id]
    if (!n) return
    for (const c of n.children ?? []) visit(c)
    // 불리언: 상자를 결과 모양에 맞춰요(안쪽 도형이 바뀌면 곧바로)
    if (n.type === 'boolean') fitBoolean(d, n)
    // 그룹: 상자를 늘 안의 레이어에 맞춰요(피그마와 같아요 — 마스크 그룹은 마스크 크기, 그 밖은 자식 전체를 감싸는 크기)
    else if (isGroupNode(n)) fitMaskGroup(d, n)
    if (n.style.layout && !done.has(id)) { layoutFrame(d, n); done.add(id) }
  }
  for (const id of d.rootIds) visit(id)
}

function layoutFrame(d: LayerDoc, p: LayerNode) {
  const l = p.style.layout!
  const kids = flowKids(d, p)
  const main: 'w' | 'h' = isH(l) ? 'w' : 'h'
  const cross: 'w' | 'h' = isH(l) ? 'h' : 'w'
  const [pt, pr, pb, pl] = l.padding
  const padMain0 = isH(l) ? pl : pt, padMain1 = isH(l) ? pr : pb
  const padCross0 = isH(l) ? pt : pl, padCross1 = isH(l) ? pb : pr
  const gap = l.gap === 'auto' ? 0 : l.gap
  const pMain = isH(l) ? p.sizeH : p.sizeV
  const pCross = isH(l) ? p.sizeV : p.sizeH

  // 1) Hug 부모: 자식 합으로 크기. 채우기 자식은 Hug 부모 안에선 지금 크기 그대로 쳐요(피그마와 같아요 —
  //    탭처럼 Hug 컨테이너 안 Fill 글자가 0 너비로 줄어들던 것, 사용자 제보 2026-11-29)
  if (pMain === 'hug') {
    const sum = kids.reduce((a, k) => a + k[main], 0) + (l.wrap ? 0 : gap * Math.max(0, kids.length - 1))
    if (!l.wrap) p[main] = r2(padMain0 + padMain1 + sum)
  }
  if (pCross === 'hug' && !l.wrap) {
    // 채우기 아닌 자식이 있으면 그것들 기준(채우기 자식은 그 높이로 늘어나요), 모두 채우기면 지금 크기 그대로
    const fixedCross = kids.filter((k) => sizeOf(k, cross) !== 'fill')
    const mx = Math.max(0, ...(fixedCross.length ? fixedCross : kids).map((k) => k[cross]))
    p[cross] = r2(padCross0 + padCross1 + mx)
  }
  const innerMain = Math.max(0, p[main] - padMain0 - padMain1)
  const innerCross = Math.max(0, p[cross] - padCross0 - padCross1)

  // 2) 줄 나누기(wrap)
  const lines: LayerNode[][] = []
  if (l.wrap) {
    let cur: LayerNode[] = [], used = 0
    for (const k of kids) {
      const s = sizeOf(k, main) === 'fill' ? 0 : k[main]
      if (cur.length && used + gap + s > innerMain + 0.01) { lines.push(cur); cur = []; used = 0 }
      used += (cur.length ? gap : 0) + s
      cur.push(k)
    }
    if (cur.length) lines.push(cur)
  } else lines.push(kids)

  // 3) 채우기 · 자리
  let crossAt = padCross0
  const rowGap = l.rowGap ?? gap
  const lineSizes: number[] = []
  for (const line of lines) {
    const fills = line.filter((k) => sizeOf(k, main) === 'fill')
    const fixedSum = line.filter((k) => sizeOf(k, main) !== 'fill').reduce((a, k) => a + k[main], 0)
    const gaps = gap * Math.max(0, line.length - 1)
    if (fills.length && !(pMain === 'hug' && !l.wrap)) {
      const each = Math.max(1, (innerMain - fixedSum - gaps) / fills.length)
      for (const k of fills) { k[main] = r2(each); if (k.type === 'text') k.style.autoWidth = false }
    }
    const lineCross = l.wrap ? Math.max(0, ...line.map((k) => (sizeOf(k, cross) === 'fill' ? 0 : k[cross]))) : innerCross
    // Hug 부모(교차 방향)도 채우기 아닌 자식이 정한 높이가 있으면 채우기 자식은 그만큼 늘어나요
    const crossSet = pCross !== 'hug' || l.wrap || line.some((k) => sizeOf(k, cross) !== 'fill')
    for (const k of line) if (sizeOf(k, cross) === 'fill' && crossSet) k[cross] = r2(lineCross)
    // 크기가 바뀐 자식 프레임은 다시 계산
    for (const k of line) if (k.style.layout) layoutFrame(d, k)
    const total = line.reduce((a, k) => a + k[main], 0)
    let g = gap
    let at = padMain0
    if (l.gap === 'auto' && line.length > 1) g = Math.max(0, (innerMain - total) / (line.length - 1))
    else if (l.align === 'center') at += (innerMain - total - gaps) / 2
    else if (l.align === 'end') at += innerMain - total - gaps
    for (const k of line) {
      const free = lineCross - k[cross]
      const off = l.cross === 'center' ? free / 2 : l.cross === 'end' ? free : 0
      if (isH(l)) { k.x = r2(at); k.y = r2(crossAt + off) } else { k.y = r2(at); k.x = r2(crossAt + off) }
      at += k[main] + g
    }
    lineSizes.push(lineCross)
    crossAt += lineCross + rowGap
  }
  // 줄 바꿈 + Hug: 줄을 다 담도록
  if (l.wrap && pCross === 'hug') p[cross] = r2(padCross0 + padCross1 + lineSizes.reduce((a, v) => a + v, 0) + rowGap * Math.max(0, lineSizes.length - 1))
}

/** 오토 레이아웃 부모 안에서 자리(순서) 찾기: 진행 방향 좌표 → 끼워 넣을 번호 */
export function slotIndex(d: LayerDoc, p: LayerNode, local: { x: number; y: number }, skip: Set<string>): number {
  const l = p.style.layout!
  const kids = (p.children ?? []).filter((c) => !skip.has(c))
  for (let i = 0; i < kids.length; i++) {
    const k = d.nodes[kids[i]!]
    if (!k || k.hidden || k.absolute) continue
    if (l.wrap) {
      const rowEnd = isH(l) ? k.y + k.h : k.x + k.w
      const inRow = isH(l) ? local.y < rowEnd : local.x < rowEnd
      if (inRow && (isH(l) ? local.x < k.x + k.w / 2 : local.y < k.y + k.h / 2)) return i
      continue
    }
    if (isH(l) ? local.x < k.x + k.w / 2 : local.y < k.y + k.h / 2) return i
  }
  return kids.length
}

/**
 * 제약: 부모 크기가 (ow, oh) → (nw, nh) 로 바뀔 때 자식 자리 · 크기. 오토 레이아웃 부모는 레이아웃이 맡아요.
 * kids0: 바뀌기 전 자식 상자(끄는 동안 쌓이지 않게)
 */
/** force: 모든 자식에 같은 제약(그룹 크기를 바꾸면 안이 비율대로 — 피그마와 같아요) */
export function constrain(kids: LayerNode[], kids0: Record<string, { x: number; y: number; w: number; h: number }>, ow: number, oh: number, nw: number, nh: number, force?: Constraints) {
  const dw = nw - ow, dh = nh - oh
  const kx = ow ? nw / ow : 1, ky = oh ? nh / oh : 1
  for (const k of kids) {
    const o = kids0[k.id]
    if (!o) continue
    const c: Constraints = force ?? k.constraints ?? { h: 'left', v: 'top' }
    let { x, w } = o
    if (c.h === 'right') x = o.x + dw
    else if (c.h === 'center') x = o.x + dw / 2
    else if (c.h === 'leftright') w = Math.max(1, o.w + dw)
    else if (c.h === 'scale') { x = o.x * kx; w = Math.max(1, o.w * kx) }
    let { y, h } = o
    if (c.v === 'bottom') y = o.y + dh
    else if (c.v === 'center') y = o.y + dh / 2
    else if (c.v === 'topbottom') h = Math.max(1, o.h + dh)
    else if (c.v === 'scale') { y = o.y * ky; h = Math.max(1, o.h * ky) }
    k.x = Math.round(x); k.y = Math.round(y); k.w = Math.round(w); k.h = Math.round(h)
    if (k.type === 'text' && w !== o.w) k.style.autoWidth = false
  }
}
export const boxes0 = (kids: LayerNode[]) => Object.fromEntries(kids.map((k) => [k.id, { x: k.x, y: k.y, w: k.w, h: k.h }]))

/** 마스크 그룹(맨 아래 마스크 + 위 내용): 그룹 상자를 마스크 상자에 맞춰요 — 내용이 마스크 밖으로 나가 있어도 보이는 건 마스크 안이라서 */
function fitMaskGroup(d: LayerDoc, g: LayerNode) {
  const m = (g.children ?? []).map((c) => d.nodes[c]).find((c) => c?.isMask && !c.hidden)
  const kids = m ? [m] : (g.children ?? []).map((c) => d.nodes[c]).filter((c): c is LayerNode => !!c && !c.hidden)
  if (!kids.length) return
  // 돌린 레이어도: 네 꼭짓점을 그룹 안 좌표로
  const ps = kids.flatMap((k) => { const M = localMatrix(k, k.w, k.h); return [[0, 0], [k.w, 0], [k.w, k.h], [0, k.h]].map(([x, y]) => apply(M, x!, y!)) })
  const bx = r2(Math.min(...ps.map((p) => p.x))), by = r2(Math.min(...ps.map((p) => p.y)))
  const w = Math.max(0.01, r2(Math.max(...ps.map((p) => p.x)) - bx)), h = Math.max(0.01, r2(Math.max(...ps.map((p) => p.y)) - by))
  if (Math.abs(bx) < 0.01 && Math.abs(by) < 0.01 && Math.abs(w - g.w) < 0.01 && Math.abs(h - g.h) < 0.01) return
  const G = localMatrix(g, g.w, g.h)
  const o = apply(G, bx, by)
  g.x = r2(o.x - w / 2 + (G.a * w) / 2 + (G.c * h) / 2)
  g.y = r2(o.y - h / 2 + (G.b * w) / 2 + (G.d * h) / 2)
  g.w = w; g.h = h
  for (const c of g.children ?? []) { const k = d.nodes[c]; if (k) { k.x = r2(k.x - bx); k.y = r2(k.y - by) } }
}
