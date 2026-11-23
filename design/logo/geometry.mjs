// Iris 심볼 형태 계산 (generate.mjs, export-3d.mjs 공용)
//
// 형태 규칙 (확정 2026-11-23)
// - 한 점(출발점)에서 갈라지는 세 개의 꺾인 쐐기. 전체를 -20° 기울임.
// - 왼쪽 면(옅은 톤)과 오른쪽 면(진한 톤)이 접힌 리본처럼 보이는 두 톤.
// - 오른쪽 면: 바깥선은 셋 다 평행, 안쪽선도 셋 다 같은 각도(DELTA)로 벌어져 끝으로 갈수록 넓어짐.
// - 오른쪽 면 사이 두 간격은 같음 (중간 쐐기를 평행 이동해 맞춤).
// - 칠해진 영역 기준 가로:세로 = 0.96 (가로가 길어 보이는 착시를 4% 보정).
// - 모서리: "말랑 중" 곡률, 좌우 면이 만나는 꺾임만 "말랑 약" 곡률.
// - 흰 배경에서는 어두운 면이 얇아 보이므로(광삼 현상) 흰 배경용만 면 두께를 키움 (generate.mjs의 WEIGHT).

const R = Math.PI / 180

const LEFT_ANGLE = [42, 55, 68] // 왼쪽 면 바깥선 각도 (작은 쐐기 → 큰 쐐기)
const GROUND_X = [40, null, 122.7] // 바닥선 기준 위치 (중간은 간격이 같아지도록 계산)
const APEX_THICK = [5, 5.5, 6].map((x) => x * 1.12) // 꺾이는 쪽 오른쪽 면 두께
const LEFT_WEDGE = 6.5 // 왼쪽 면 쐐기 각도
const DELTA = 7 // 오른쪽 면 안쪽선이 벌어지는 각도
export const TILT = 20 // 전체 기울기
const RATIO = 0.96 // 가로:세로 (시각 보정)
const RADIUS = { foot: 1.5, apex: 6, end: 4, inner: 3 } // 모서리 곡률
const SIZE_FACTOR = [0.55, 0.8, 1] // 쐐기 크기에 비례한 곡률 배수

export const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
export const unit = (p) => {
  const l = Math.hypot(p[0], p[1])
  return [p[0] / l, p[1] / l]
}
function intersect(p, d, q, e) {
  const k = d[0] * e[1] - d[1] * e[0]
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / k
  return [p[0] + t * d[0], p[1] + t * d[1]]
}
const perp = (pt, p, d) => Math.abs((pt[0] - p[0]) * d[1] - (pt[1] - p[1]) * d[0])
const rot = (p) => {
  const c = Math.cos(TILT * R)
  const s = Math.sin(TILT * R)
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]
}

// weight: 면 두께 배수. 반환 좌표계: 100×100 정사각 (y는 아래로 증가)
export function makeSymbol(weight = 1) {
  const apexThick = APEX_THICK.map((x) => x * weight)
  const delta = Math.atan(Math.tan(DELTA * R) * weight)
  const leftWedge = LEFT_WEDGE * weight * R

  function wedge(i, v) {
    const a = LEFT_ANGLE[i] * R
    const ta = Math.tan(a)
    const gx = i === 1 ? v.midX : GROUND_X[i]
    const apex = [gx / (ta + 1), (-ta * gx) / (ta + 1)]
    const u = [Math.cos(v.beta * R), Math.sin(v.beta * R)]
    const n = [-u[1], u[0]]
    const end = intersect(apex, u, [0, 0], [1, 0])
    const dir = [u[0] * Math.cos(delta) + n[0] * Math.sin(delta), u[1] * Math.cos(delta) + n[1] * Math.sin(delta)]
    const p2 = [apex[0] + n[0] * apexThick[i], apex[1] + n[1] * apexThick[i]]
    return {
      apex,
      end,
      innerEnd: intersect(p2, dir, [0, 0], [1, 0]),
      inner: intersect(p2, dir, [0, 0], [Math.cos(a - leftWedge), -Math.sin(a - leftWedge)]),
      p2,
      dir,
    }
  }

  function solveMid(v) {
    let lo = 55
    let hi = 105
    for (let t = 0; t < 60; t++) {
      v.midX = (lo + hi) / 2
      const k = [0, 1, 2].map((i) => wedge(i, v))
      if (perp(k[0].end, k[1].p2, k[1].dir) - perp(k[1].end, k[2].p2, k[2].dir) > 0) hi = v.midX
      else lo = v.midX
    }
    return v
  }

  function corners(q, i) {
    const poly = [[0, 0], q.apex, q.end, q.innerEnd, q.inner]
    const r = [RADIUS.foot, RADIUS.apex, RADIUS.end, RADIUS.end, RADIUS.inner].map((x, j) => (j ? x * SIZE_FACTOR[i] : x))
    return poly.map((V, j) => {
      const U = poly[(j + 4) % 5]
      const W = poly[(j + 1) % 5]
      const t = Math.min(r[j], dist(U, V) / 2.2, dist(V, W) / 2.2)
      const a = unit([U[0] - V[0], U[1] - V[1]])
      const b = unit([W[0] - V[0], W[1] - V[1]])
      return { A: [V[0] + a[0] * t, V[1] + a[1] * t], V, B: [V[0] + b[0] * t, V[1] + b[1] * t] }
    })
  }

  // 둥글린 윤곽을 점으로 샘플링 (3D용)
  function outline(q, i, steps = 24) {
    const pts = []
    for (const c of corners(q, i)) {
      for (let s = 0; s <= steps; s++) {
        const T = s / steps
        const u = 1 - T
        const p = [u * u * c.A[0] + 2 * u * T * c.V[0] + T * T * c.B[0], u * u * c.A[1] + 2 * u * T * c.V[1] + T * T * c.B[1]]
        if (!pts.length || dist(p, pts[pts.length - 1]) > 1e-6) pts.push(p)
      }
    }
    return pts
  }

  function inkBox(v) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < 3; i++) {
      for (const p of outline(wedge(i, v), i, 40)) {
        const r = rot(p)
        x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0])
        y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1])
      }
    }
    return { x0, y0, w: x1 - x0, h: y1 - y0 }
  }

  const v = { beta: 50, midX: 80 }
  let lo = 45
  let hi = 80
  for (let t = 0; t < 50; t++) {
    v.beta = (lo + hi) / 2
    solveMid(v)
    const b = inkBox(v)
    if (b.w / b.h > RATIO) lo = v.beta
    else hi = v.beta
  }
  solveMid(v)

  const box = inkBox(v)
  const scale = 100 / box.h
  const ox = (box.h - box.w) / 2
  // 쐐기 로컬 좌표 → 100×100 정사각 좌표
  const toBox = (p) => {
    const r = rot(p)
    return [(r[0] - box.x0 + ox) * scale, (r[1] - box.y0) * scale]
  }
  const f = (p) => `${+p[0].toFixed(3)} ${+p[1].toFixed(3)}`

  const k = [0, 1, 2].map((i) => wedge(i, v))
  const shapes = k.map((q, i) => {
    let d = ''
    corners(q, i).forEach((c, j) => {
      d += `${j ? 'L' : 'M'}${f(toBox(c.A))}Q${f(toBox(c.V))} ${f(toBox(c.B))}`
    })
    d += 'Z'
    const fd = unit([q.apex[0] - q.inner[0], q.apex[1] - q.inner[1]])
    let nr = [-fd[1], fd[0]]
    if ((q.end[0] - q.inner[0]) * nr[0] + (q.end[1] - q.inner[1]) * nr[1] < 0) nr = [-nr[0], -nr[1]]
    const L1 = [q.inner[0] - fd[0] * 300, q.inner[1] - fd[1] * 300]
    const L2 = [q.apex[0] + fd[0] * 300, q.apex[1] + fd[1] * 300]
    const clip = `M${f(toBox(L1))}L${f(toBox(L2))}L${f(toBox([L2[0] + nr[0] * 600, L2[1] + nr[1] * 600]))}L${f(toBox([L1[0] + nr[0] * 600, L1[1] + nr[1] * 600]))}Z`
    return { d, clip }
  })
  const gaps = [perp(k[0].end, k[1].p2, k[1].dir) * scale, perp(k[1].end, k[2].p2, k[2].dir) * scale]
  // 3D용: 윤곽 + 면 폭을 계산할 네 직선 (왼쪽 면 바깥·안쪽선은 출발점(0,0)을 지남)
  const wedges = k.map((q, i) => {
    const a = LEFT_ANGLE[i] * R
    return {
      outline: outline(q, i),
      apex: q.apex,
      inner: q.inner,
      end: q.end,
      leftOuterDir: [Math.cos(a), -Math.sin(a)],
      leftInnerDir: [Math.cos(a - leftWedge), -Math.sin(a - leftWedge)],
      rightOuter: { p: q.apex, d: unit([q.end[0] - q.apex[0], q.end[1] - q.apex[1]]) },
      rightInner: { p: q.p2, d: q.dir },
    }
  })
  return {
    shapes,
    wedges,
    toBox,
    scale,
    ratio: box.w / box.h,
    beta: v.beta,
    gaps,
    inkLeft: ox * scale,
    inkRight: (ox + box.w) * scale,
  }
}
