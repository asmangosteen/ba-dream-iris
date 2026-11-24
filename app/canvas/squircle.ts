/**
 * Corner smoothing(피그마와 같은 공식 — figma-squircle, app/plugins/squircle.client.ts 와 같아요).
 * 캔버스 레이어의 모서리를 smoothing(0~1) 만큼 매끄럽게 — 모서리마다 반지름이 달라도 돼요(왼쪽 위 · 오른쪽 위 · 오른쪽 아래 · 왼쪽 아래).
 * inset: 안쪽으로 줄인 경로(안쪽 선 · 가운데 선을 그릴 때)
 */
const f = (n: number) => Math.round(n * 1000) / 1000

interface Corner { r: number; a: number; b: number; c: number; d: number; p: number; L: number }
function corner(r: number, s: number, budget: number): Corner | null {
  if (r <= 0) return null
  const rr = Math.min(r, budget)
  const sm = Math.max(0, Math.min(s, budget / rr - 1))
  const p = Math.min((1 + s) * rr, budget)
  const arc = 90 * (1 - sm)
  const L = Math.sin(((arc / 2) * Math.PI) / 180) * rr * Math.SQRT2
  const p34 = rr * Math.tan((((90 - arc) / 4) * Math.PI) / 180)
  const beta = (45 * sm * Math.PI) / 180
  const c = p34 * Math.cos(beta), d = c * Math.tan(beta)
  const b = (p - L - c - d) / 3
  return { r: rr, a: 2 * b, b, c, d, p, L }
}

export function squirclePath(w: number, h: number, radii: [number, number, number, number], smoothing: number, inset = 0): string {
  const W = w - inset * 2, H = h - inset * 2
  if (W <= 0 || H <= 0) return ''
  const budget = Math.min(W, H) / 2
  const [tl, tr, br, bl] = radii.map((r) => corner(Math.max(0, r - inset), smoothing, budget))
  const x0 = inset, y0 = inset
  const arc = (k: Corner, dx: number, dy: number) => `a ${f(k.r)} ${f(k.r)} 0 0 1 ${f(dx)} ${f(dy)}`
  let d = `M ${f(x0 + W - (tr?.p ?? 0))} ${f(y0)}`
  if (tr) { const A = tr.a + tr.b + tr.c; d += ` c ${f(tr.a)} 0 ${f(tr.a + tr.b)} 0 ${f(A)} ${f(tr.d)} ${arc(tr, tr.L, tr.L)} c ${f(tr.d)} ${f(tr.c)} ${f(tr.d)} ${f(tr.b + tr.c)} ${f(tr.d)} ${f(A)}` }
  d += ` L ${f(x0 + W)} ${f(y0 + H - (br?.p ?? 0))}`
  if (br) { const A = br.a + br.b + br.c; d += ` c 0 ${f(br.a)} 0 ${f(br.a + br.b)} ${f(-br.d)} ${f(A)} ${arc(br, -br.L, br.L)} c ${f(-br.c)} ${f(br.d)} ${f(-(br.b + br.c))} ${f(br.d)} ${f(-A)} ${f(br.d)}` }
  d += ` L ${f(x0 + (bl?.p ?? 0))} ${f(y0 + H)}`
  if (bl) { const A = bl.a + bl.b + bl.c; d += ` c ${f(-bl.a)} 0 ${f(-(bl.a + bl.b))} 0 ${f(-A)} ${f(-bl.d)} ${arc(bl, -bl.L, -bl.L)} c ${f(-bl.d)} ${f(-bl.c)} ${f(-bl.d)} ${f(-(bl.b + bl.c))} ${f(-bl.d)} ${f(-A)}` }
  d += ` L ${f(x0)} ${f(y0 + (tl?.p ?? 0))}`
  if (tl) { const A = tl.a + tl.b + tl.c; d += ` c 0 ${f(-tl.a)} 0 ${f(-(tl.a + tl.b))} ${f(tl.d)} ${f(-A)} ${arc(tl, tl.L, -tl.L)} c ${f(tl.c)} ${f(-tl.d)} ${f(tl.b + tl.c)} ${f(-tl.d)} ${f(A)} ${f(-tl.d)}` }
  return d + ' Z'
}
