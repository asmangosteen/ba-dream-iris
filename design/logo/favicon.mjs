// Iris 파비콘 생성
// 실행: node design/logo/favicon.mjs
//
// 모양 (확정 2026-11-23): 진한 타일(gray-800) 위에 밝은 심볼(진한 면 gray-50 · 옅은 면 gray-500).
// 어떤 탭 색(밝은 · 어두운)에서도 같은 모습. 타일 모서리는 디자인 시스템과 같은 코너 스무딩 60%.
// - public/favicon.svg        : 브라우저 탭 (스무딩 타일, 바깥은 투명)
// - design/logo/favicon/apple-touch-icon.svg : 홈 화면 아이콘 원본 (iOS 가 모서리를 직접 깎으므로 꽉 찬 사각형)
//   → PNG(32 · 180)는 브라우저로 렌더해 public/ 에 둠 (favicon-32.png, apple-touch-icon.png)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSymbol } from './geometry.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

const WEIGHT = 1.25 // 16px 에서도 면이 뭉개지지 않게 조금 두껍게 (간격은 그대로 같음)
const PAD = 17 // 타일 안쪽 여백 (100 기준)
const RADIUS = 22 // 타일 모서리 (100 기준)
const SMOOTHING = 0.6 // 코너 스무딩 60% — @ba-dream/design-system 과 같음
const C = { tile: '#202837', right: '#FDFDFD', left: '#8C9199' } // gray-800 · gray-50 · gray-500

// figma-squircle (MIT) 과 같은 식 — app/plugins/squircle.client.ts 와 동일
function squircle(w, h, rad, x = 0, y = 0) {
  const f = (n) => +n.toFixed(3)
  const budget = Math.min(w, h) / 2
  const r = Math.min(rad, budget)
  const sm = Math.min(SMOOTHING, budget / r - 1)
  const p = Math.min((1 + SMOOTHING) * r, budget)
  const arc = 90 * (1 - sm)
  const L = Math.sin(((arc / 2) * Math.PI) / 180) * r * Math.SQRT2
  const p34 = r * Math.tan((((90 - arc) / 4) * Math.PI) / 180)
  const beta = (45 * sm * Math.PI) / 180
  const c = p34 * Math.cos(beta)
  const d = c * Math.tan(beta)
  const b = (p - L - c - d) / 3
  const a = 2 * b
  const A = a + b + c
  const R = `${f(r)} ${f(r)} 0 0 1`
  return [
    `M${f(x + w - p)} ${f(y)}`,
    `c${f(a)} 0 ${f(a + b)} 0 ${f(A)} ${f(d)}a${R} ${f(L)} ${f(L)}c${f(d)} ${f(c)} ${f(d)} ${f(b + c)} ${f(d)} ${f(A)}`,
    `L${f(x + w)} ${f(y + h - p)}`,
    `c0 ${f(a)} 0 ${f(a + b)} ${f(-d)} ${f(A)}a${R} ${f(-L)} ${f(L)}c${f(-c)} ${f(d)} ${f(-(b + c))} ${f(d)} ${f(-A)} ${f(d)}`,
    `L${f(x + p)} ${f(y + h)}`,
    `c${f(-a)} 0 ${f(-(a + b))} 0 ${f(-A)} ${f(-d)}a${R} ${f(-L)} ${f(-L)}c${f(-d)} ${f(-c)} ${f(-d)} ${f(-(b + c))} ${f(-d)} ${f(-A)}`,
    `L${f(x)} ${f(y + p)}`,
    `c0 ${f(-a)} 0 ${f(-(a + b))} ${f(d)} ${f(-A)}a${R} ${f(L)} ${f(-L)}c${f(c)} ${f(-d)} ${f(b + c)} ${f(-d)} ${f(A)} ${f(-d)}Z`,
  ].join('')
}

function icon(tile) {
  const sym = makeSymbol(WEIGHT)
  const s = (100 - PAD * 2) / 100
  const defs = sym.shapes.map((sh, i) => `<clipPath id="f${i}"><path d="${sh.clip}"/></clipPath>`).join('')
  const body = sym.shapes.map((sh, i) => `<path d="${sh.d}" fill="${C.left}"/><path d="${sh.d}" fill="${C.right}" clip-path="url(#f${i})"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><title>Iris</title><defs>${defs}</defs>${tile}<g transform="translate(${PAD} ${PAD}) scale(${s})">${body}</g></svg>\n`
}

writeFileSync(join(ROOT, 'public', 'favicon.svg'), icon(`<path d="${squircle(100, 100, RADIUS)}" fill="${C.tile}"/>`))
mkdirSync(join(HERE, 'favicon'), { recursive: true })
writeFileSync(join(HERE, 'favicon', 'apple-touch-icon.svg'), icon(`<rect width="100" height="100" fill="${C.tile}"/>`))
console.log('저장: public/favicon.svg, design/logo/favicon/apple-touch-icon.svg')
