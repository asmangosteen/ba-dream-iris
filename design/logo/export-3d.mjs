// Iris 심볼 3D 형태 내보내기 (재질 없음, 블렌더에서 수정용)
// 실행: node design/logo/export-3d.mjs [격자 간격, 기본 0.3]
// 결과: design/logo/3d/iris-symbol-3d.obj (쐐기 3개가 각각 별도 오브젝트)
//
// 형태 규칙
// - 쐐기마다 앞면이 평평한(로고 정면 모양 그대로) 한 덩어리. 날카로운 모서리·혹·골 없음.
// - 두께: 로고 윤곽 전체를 비누막처럼 고르게 부풀린 모양(푸아송 방정식 ∇²φ = -1, 윤곽에서 φ = 0)으로 정함.
//   두께 = K·√φ → 곧은 띠의 단면은 반폭 W, 깊이 DEPTH·W 의 매끈한 볼록 곡선.
//   좌우 면을 따로 붙이지 않으므로 꺾임 부분은 혹·골 없이 하나의 곡면으로 휘고, 바깥 꼭짓점은 저절로 둥글게 낮아짐.
//   끝면도 저절로 바깥으로 볼록한 둥근 돔이 됨.
// - 앞면과 뒷면이 만나는 테두리는 반경 RIM 으로 둥글게 말려 넘어감.
// - 메시: 격자로 대략 뽑은 뒤 모든 점을 실제 곡면 위로 끌어올리고(뉴턴 투영), 법선도 곡면 기울기로 계산
//   → 격자 계단이 남지 않고 블렌더에서도 매끈하게 보임.
// - 단위: 심볼 정면 높이 = 1.0. Y가 위, Z가 앞(정면 방향). 블렌더 OBJ 가져오기 기본값(Y Up)으로 열면 됨.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSymbol } from './geometry.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '3d')
const H = Number(process.argv[2]) || 0.3 // 표면 격자 간격 (작을수록 고해상도)
const PH = 0.2 // 두께(φ) 계산 격자 간격
const DEPTH = 1.6 // 곧은 띠 가운데 깊이 = DEPTH × 반폭
const K = DEPTH * Math.SQRT2 // 두께 = K·√φ (곧은 띠에서 φ = (W²-u²)/2)
const RIM = 1.5 // 테두리 둥글림 (로컬 단위, 심볼 높이 약 95)
const RIM_IN = 0.5 // 바늘 끝처럼 얇은 곳이 둥글림에 깎여 사라지지 않도록 두께를 보태는 구간
const LAYER_Z = [22, 0, -22] // 쐐기별 앞뒤 간격 (작은 쐐기가 앞)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const clamp01 = (x) => Math.max(0, Math.min(1, x))

function signedDist(p, poly) {
  let d = Infinity
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]
    const b = poly[i]
    const e = sub(b, a)
    const w = sub(p, a)
    const t = Math.max(0, Math.min(1, (w[0] * e[0] + w[1] * e[1]) / (e[0] * e[0] + e[1] * e[1])))
    d = Math.min(d, Math.hypot(w[0] - e[0] * t, w[1] - e[1] * t))
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? d : -d
}

// ∇²φ = -1 (윤곽 안), φ = 0 (윤곽) 을 격자에서 풂. 테두리는 실제 윤곽 위치까지의 거리로 맞춤(Shortley–Weller).
// 거친 격자부터 풀어 올라오며 정밀하게(캐스케이드 SOR). 반환: 매끈한(쌍삼차) 보간 함수
function solveTorsion(outline) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (const p of outline) {
    xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0])
    ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1])
  }
  const pad = 3
  xmin -= pad; ymin -= pad; xmax += pad; ymax += pad

  let prev = null
  for (const h of [PH * 8, PH * 4, PH * 2, PH]) {
    const nx = Math.ceil((xmax - xmin) / h) + 1
    const ny = Math.ceil((ymax - ymin) / h) + 1
    const G = new Float64Array(nx * ny)
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) G[i * ny + j] = signedDist([xmin + i * h, ymin + j * h], outline)
    const u = new Float64Array(nx * ny)
    if (prev) for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (G[i * ny + j] > 0) u[i * ny + j] = Math.max(0, prev.sample(xmin + i * h, ymin + j * h))
    // 노드별 계수 (이웃이 윤곽 밖이면 실제 윤곽까지 거리로 팔 길이를 줄임)
    const nodes = []
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 1; j < ny - 1; j++) {
        const c = i * ny + j
        if (G[c] <= 0) continue
        const arm = (n) => (G[n] > 0 ? h : Math.max(0.02 * h, (G[c] / (G[c] - G[n])) * h))
        const nb = [c - ny, c + ny, c - 1, c + 1]
        const L = nb.map(arm)
        const cx0 = 2 / (L[0] * (L[0] + L[1]))
        const cx1 = 2 / (L[1] * (L[0] + L[1]))
        const cy0 = 2 / (L[2] * (L[2] + L[3]))
        const cy1 = 2 / (L[3] * (L[2] + L[3]))
        nodes.push({ c, nb: nb.map((n) => (G[n] > 0 ? n : -1)), w: [cx0, cx1, cy0, cy1], d: cx0 + cx1 + cy0 + cy1 })
      }
    }
    const iters = h === PH ? 600 : 300
    const omega = 1.9
    for (let it = 0; it < iters; it++) {
      for (const nd of nodes) {
        let sum = 1
        for (let k = 0; k < 4; k++) if (nd.nb[k] >= 0) sum += nd.w[k] * u[nd.nb[k]]
        u[nd.c] += omega * (sum / nd.d - u[nd.c])
      }
    }
    // 윤곽 밖은 테두리 기울기를 이어 음수로 연장 (보간이 테두리에서 매끈하도록)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const c = i * ny + j
        if (G[c] > 0) continue
        let slope = 0
        let n = 0
        for (const q of [c - ny, c + ny, c - 1, c + 1]) {
          if (q >= 0 && q < nx * ny && G[q] > 0) {
            slope += u[q] / G[q]
            n++
          }
        }
        u[c] = G[c] * (n ? slope / n : 2)
      }
    }
    const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
    const at = (i, j) => u[Math.max(0, Math.min(nx - 1, i)) * ny + Math.max(0, Math.min(ny - 1, j))]
    const sample = (x, y) => {
      const gx = (x - xmin) / h
      const gy = (y - ymin) / h
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const tx = gx - i
      const ty = gy - j
      const col = [-1, 0, 1, 2].map((di) => cr(at(i + di, j - 1), at(i + di, j), at(i + di, j + 1), at(i + di, j + 2), ty))
      return cr(col[0], col[1], col[2], col[3], tx)
    }
    prev = { sample }
  }
  return prev.sample
}

// 두께 함수: 윤곽 안은 K·√φ (+ 얇은 끝 보강), 밖은 음수.
// 테두리 근처(NEAR 안쪽)는 격자 바깥 값을 쓰지 않고, 테두리에서 안쪽으로 NEAR 들어간 지점의 φ를 기준으로
// φ ≈ φ_in·(g/NEAR) 로 매끈하게 이어 붙여 줄무늬를 없앰.
const NEAR = 0.8
function thicknessFn(w) {
  const phi = solveTorsion(w.outline)
  const sd = (x, y) => signedDist([x, y], w.outline)
  return (p) => {
    const g = sd(p[0], p[1])
    if (g <= 0) return g
    let f
    if (g >= NEAR) {
      f = phi(p[0], p[1])
    } else {
      const e = 0.01
      let gx = (sd(p[0] + e, p[1]) - sd(p[0] - e, p[1])) / (2 * e)
      let gy = (sd(p[0], p[1] + e) - sd(p[0], p[1] - e)) / (2 * e)
      const gl = Math.hypot(gx, gy) || 1
      gx /= gl; gy /= gl
      const fin = Math.max(0, phi(p[0] + gx * (NEAR - g), p[1] + gy * (NEAR - g)))
      const near = fin * (g / NEAR)
      const t = clamp01((g - 0.5 * NEAR) / (0.5 * NEAR))
      const b = t * t * (3 - 2 * t)
      f = b > 0 ? near + (Math.max(0, phi(p[0], p[1])) - near) * b : near
    }
    return K * Math.sqrt(Math.max(0, f)) + RIM * clamp01(g / RIM_IN)
  }
}

// 두께 T로 정의한 둥근 입체의 거리장: F<0 안쪽, F=0 표면. 앞면 z=0, 뒷면 z=-T 를 반경 RIM 으로 둥글게 합침
const field = (T, z) => (-T + Math.sqrt((2 * z + T) * (2 * z + T) + RIM * RIM)) / 2

const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]]
const CO = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]

function solidMesh(w) {
  const h = H
  const T = thicknessFn(w)
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (const p of w.outline) {
    xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0])
    ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1])
  }
  xmin -= 2 * h; ymin -= 2 * h; xmax += 2 * h; ymax += 2 * h
  const nx = Math.ceil((xmax - xmin) / h) + 1
  const ny = Math.ceil((ymax - ymin) / h) + 1
  const TG = new Float64Array(nx * ny)
  let tmax = 0
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const t = T([xmin + i * h, ymin + j * h])
      TG[i * ny + j] = t
      tmax = Math.max(tmax, t)
    }
  }
  const nz = Math.ceil((tmax + 4 * h) / h) + 1
  const zk = (k) => 2 * h - k * h
  const F = new Float64Array(nx * ny * nz)
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) F[(i * ny + j) * nz + k] = field(TG[i * ny + j], zk(k))

  // 1) 격자에서 대략의 표면 뽑기 (마칭 테트라)
  const pos = []
  const idx = []
  const emap = new Map()
  const total = nx * ny * nz
  const gp = (g) => {
    const k = g % nz
    const j = ((g - k) / nz) % ny
    const i = Math.floor(g / (ny * nz))
    return [xmin + i * h, ymin + j * h, zk(k)]
  }
  const ev = (ga, gb) => {
    const key = ga < gb ? ga * total + gb : gb * total + ga
    let id = emap.get(key)
    if (id !== undefined) return id
    const t = F[ga] / (F[ga] - F[gb])
    const pa = gp(ga)
    const pb = gp(gb)
    id = pos.length / 3
    pos.push(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t)
    emap.set(key, id)
    return id
  }
  const tri = (a, b, c, ref) => {
    const u = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]]
    const v = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) idx.push(a, c, b)
    else idx.push(a, b, c)
  }
  const g8 = new Array(8)
  const f8 = new Array(8)
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let k = 0; k < nz - 1; k++) {
        let any = false
        let all = true
        for (let c = 0; c < 8; c++) {
          const g = ((i + CO[c][0]) * ny + (j + CO[c][1])) * nz + (k + CO[c][2])
          g8[c] = g
          f8[c] = F[g]
          if (f8[c] < 0) any = true
          else all = false
        }
        if (!any || all) continue
        for (const t of TETS) {
          const ins = t.filter((c) => f8[c] < 0)
          const out = t.filter((c) => f8[c] >= 0)
          if (!ins.length || !out.length) continue
          const cen = (cs) => {
            const s3 = [0, 0, 0]
            for (const c of cs) {
              const q = gp(g8[c])
              s3[0] += q[0]; s3[1] += q[1]; s3[2] += q[2]
            }
            return s3.map((x) => x / cs.length)
          }
          const ci = cen(ins)
          const co = cen(out)
          const ref = [co[0] - ci[0], co[1] - ci[1], co[2] - ci[2]]
          if (ins.length === 1 || ins.length === 3) {
            const sg = ins.length === 1 ? ins[0] : out[0]
            const o3 = ins.length === 1 ? out : ins
            tri(ev(g8[sg], g8[o3[0]]), ev(g8[sg], g8[o3[1]]), ev(g8[sg], g8[o3[2]]), ref)
          } else {
            const [a, b] = ins
            const [c, d] = out
            const ac = ev(g8[a], g8[c])
            const ad = ev(g8[a], g8[d])
            const bd = ev(g8[b], g8[d])
            const bc = ev(g8[b], g8[c])
            tri(ac, ad, bd, ref)
            tri(ac, bd, bc, ref)
          }
        }
      }
    }
  }

  // 2) 모든 점을 실제 곡면(F=0) 위로 끌어올리고, 법선은 곡면 기울기로
  const e = 0.02
  const grad = (x, y, z) => {
    const t0 = T([x, y])
    const tx = (T([x + e, y]) - T([x - e, y])) / (2 * e)
    const ty = (T([x, y + e]) - T([x, y - e])) / (2 * e)
    const q = 2 * z + t0
    const S = Math.sqrt(q * q + RIM * RIM)
    const dT = (-1 + q / S) / 2
    return { f: field(t0, z), g: [dT * tx, dT * ty, q / S] }
  }
  const nv = pos.length / 3
  const nrm = new Float64Array(pos.length)
  const bad = new Uint8Array(nv)
  for (let v = 0; v < nv; v++) {
    const x0 = pos[v * 3]
    const y0 = pos[v * 3 + 1]
    const z0 = pos[v * 3 + 2]
    let x = x0
    let y = y0
    let z = z0
    const r0 = grad(x, y, z)
    let r = r0
    for (let it = 0; it < 24; it++) {
      const g2 = r.g[0] * r.g[0] + r.g[1] * r.g[1] + r.g[2] * r.g[2] || 1
      let sx = (r.f / g2) * r.g[0]
      let sy = (r.f / g2) * r.g[1]
      let sz = (r.f / g2) * r.g[2]
      // 테두리 근처처럼 경사가 급한 곳에서 멀리 튀지 않도록 한 번에 움직이는 거리 제한
      const len = Math.hypot(sx, sy, sz)
      const maxStep = 0.25 * h
      if (len > maxStep) { sx *= maxStep / len; sy *= maxStep / len; sz *= maxStep / len }
      x -= sx; y -= sy; z -= sz
      r = grad(x, y, z)
      if (Math.abs(r.f) < 1e-6) break
    }
    // 원래 자리보다 곡면에서 멀어졌거나 너무 많이 움직였으면 되돌림
    if (Math.abs(r.f) > Math.abs(r0.f) || Math.hypot(x - x0, y - y0, z - z0) > 2.5 * h || Math.abs(r.f) > 0.02 * h) {
      x = x0; y = y0; z = z0
      r = r0
      bad[v] = 1
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z
    const l = Math.hypot(r.g[0], r.g[1], r.g[2]) || 1
    nrm[v * 3] = r.g[0] / l; nrm[v * 3 + 1] = r.g[1] / l; nrm[v * 3 + 2] = r.g[2] / l
  }
  const clean = []
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]
    if (a !== b && b !== c && a !== c) clean.push(a, b, c)
  }
  // 곡면에 다 못 올라간 점은 이웃 점들의 평균 위치·방향으로 맞춤 (점 같은 자국 제거)
  const nb = Array.from({ length: nv }, () => [])
  for (let t = 0; t < clean.length; t += 3) {
    const [a, b, c] = [clean[t], clean[t + 1], clean[t + 2]]
    nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b)
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let v = 0; v < nv; v++) {
      if (!bad[v] || !nb[v].length) continue
      const acc = [0, 0, 0, 0, 0, 0]
      for (const q of nb[v]) for (let a = 0; a < 3; a++) { acc[a] += pos[q * 3 + a]; acc[3 + a] += nrm[q * 3 + a] }
      const m = nb[v].length
      const l = Math.hypot(acc[3], acc[4], acc[5]) || 1
      for (let a = 0; a < 3; a++) { pos[v * 3 + a] = acc[a] / m; nrm[v * 3 + a] = acc[3 + a] / l }
    }
  }
  // 점 이동으로 뒤집힌 작은 삼각형은 곡면 방향에 맞게 감김을 바로잡음 (구멍처럼 보이는 점 제거)
  let flipped = 0
  for (let t = 0; t < clean.length; t += 3) {
    const [a, b, c] = [clean[t], clean[t + 1], clean[t + 2]]
    const u = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]]
    const w2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]]
    const fn = [u[1] * w2[2] - u[2] * w2[1], u[2] * w2[0] - u[0] * w2[2], u[0] * w2[1] - u[1] * w2[0]]
    let d = 0
    for (const q of [a, b, c]) d += fn[0] * nrm[q * 3] + fn[1] * nrm[q * 3 + 1] + fn[2] * nrm[q * 3 + 2]
    if (d < 0) {
      clean[t + 1] = c
      clean[t + 2] = b
      flipped++
    }
  }
  console.log(`  곡면 투영 보정한 점: ${bad.reduce((s2, b) => s2 + b, 0)} / ${nv} · 방향 바로잡은 삼각형: ${flipped}`)
  return { pos, nrm, idx: clean }
}

const sym = makeSymbol(1)
const s = sym.scale / 100
// 로컬(x 오른쪽, y 아래) → 최종(x 오른쪽, y 위). 회전+균등 배율+y 뒤집기. 법선도 같은 선형 변환 후 정규화
const o = sym.toBox([0, 0])
const ex = sub(sym.toBox([1, 0]), o)
const ey = sub(sym.toBox([0, 1]), o)
const mapP = (x, y, z, i) => {
  const b = sym.toBox([x, y])
  return [b[0] / 100, (100 - b[1]) / 100, (z + LAYER_Z[i]) * s]
}
const mapN = (n) => {
  const x = (ex[0] * n[0] + ey[0] * n[1]) / 100
  const y = -(ex[1] * n[0] + ey[1] * n[1]) / 100
  const z = n[2] * s
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}
const fx = (a) => a.map((x) => x.toFixed(6)).join(' ')

mkdirSync(OUT, { recursive: true })
const out = ['# Iris 심볼 3D (재질 없음)', '# 단위: 정면 높이 1.0 · Y Up · Z 정면 방향', `# 생성: design/logo/export-3d.mjs (격자 ${H}, 테두리 둥글림 ${RIM})`]
let vBase = 0
let total = 0
sym.wedges.forEach((w, i) => {
  const t0 = Date.now()
  const m = solidMesh(w)
  const nv = m.pos.length / 3
  out.push(`o Iris_wedge_${i + 1}`)
  for (let q = 0; q < nv; q++) out.push(`v ${fx(mapP(m.pos[q * 3], m.pos[q * 3 + 1], m.pos[q * 3 + 2], i))}`)
  for (let q = 0; q < nv; q++) out.push(`vn ${fx(mapN([m.nrm[q * 3], m.nrm[q * 3 + 1], m.nrm[q * 3 + 2]]))}`)
  out.push('s 1')
  // y 뒤집기 때문에 로컬 감김 방향이 최종에서 반대가 됨
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t] + 1 + vBase, m.idx[t + 2] + 1 + vBase, m.idx[t + 1] + 1 + vBase]
    out.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
  }
  vBase += nv
  total += m.idx.length / 3
  console.log(`쐐기 ${i + 1}: 삼각형 ${(m.idx.length / 3).toLocaleString()} · ${((Date.now() - t0) / 1000).toFixed(1)}초`)
})
writeFileSync(join(OUT, 'iris-symbol-3d.obj'), out.join('\n') + '\n')
console.log(`저장: ${join(OUT, 'iris-symbol-3d.obj')} · 전체 삼각형 ${total.toLocaleString()}`)
