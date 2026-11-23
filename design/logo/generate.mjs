// Iris 로고 SVG 생성 스크립트
// 실행: node design/logo/generate.mjs
// 형태 규칙은 geometry.mjs, 3D 내보내기는 export-3d.mjs 참고.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSymbol } from './geometry.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))

const WEIGHT = { light: 1.1, dark: 1 } // 배경별 면 두께 배수 (흰 배경은 얇아 보여서 10% 보정)
// 바드림 디자인 시스템 그레이 토큰만 사용
const COLORS = {
  light: { right: '#202837', left: '#8C9199' }, // 진한 면·글자 gray-800 / 옅은 면 gray-500 (흰 배경용)
  dark: { right: '#FDFDFD', left: '#8C9199' }, // 진한 면·글자 gray-50 / 옅은 면 gray-500 (어두운 배경용)
}

// 가로형 로고 (확정 2026-11-23). X = 워드마크 대문자 높이.
// 근거: 실제 서비스 로고 측정값(Apres 1.27X·0.35X, Lucid 1.14X·0.36X, sunday 1.5X·0.36X, OpenAI 1.9X·0.2X)
const LOCKUP = {
  symbol: 1.5, // 심볼 높이 = 1.5X
  gap: 0.5, // 심볼 오른쪽 끝 ~ "I" 획 왼쪽 = 0.5X (심볼 오른쪽 위가 비어 있어 사례보다 조금 넓게)
  lower: 0.08, // 글자 가운데를 심볼 가운데보다 0.08X 아래로 (위로 떠 보이는 착시 보정)
  letterSpacing: -0.02, // em
}

// 워드마크 윤곽선: extract-wordmark.swift 로 만든 wordmark-iris.json (Pretendard SemiBold, 크기 1000)
const WORD = JSON.parse(readFileSync(join(OUT, 'wordmark-iris.json'), 'utf8'))
const r3 = (n) => +n.toFixed(3)

function markParts(sym, c) {
  const defs = sym.shapes.map((s, i) => `    <clipPath id="iris-fold-${i + 1}"><path d="${s.clip}"/></clipPath>`).join('\n')
  const body = sym.shapes
    .map((s, i) => `  <path d="${s.d}" fill="${c.left}"/>\n  <path d="${s.d}" fill="${c.right}" clip-path="url(#iris-fold-${i + 1})"/>`)
    .join('\n')
  return { defs, body }
}

function symbolSvg(sym, theme) {
  const { defs, body } = markParts(sym, COLORS[theme])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n  <title>Iris</title>\n  <defs>\n${defs}\n  </defs>\n${body}\n</svg>\n`
}

function lockupSvg(sym, theme) {
  const c = COLORS[theme]
  const X = 100 / LOCKUP.symbol
  const first = WORD.glyphs[0]
  const s = X / (first.inkBottom - first.inkTop)
  const ls = LOCKUP.letterSpacing * WORD.size
  const glyphX = WORD.glyphs.map((g, i) => g.x + i * ls)
  const tx = sym.inkRight + LOCKUP.gap * X - (glyphX[0] + first.inkLeft) * s
  const base = 50 + X / 2 + LOCKUP.lower * X
  const last = WORD.glyphs.length - 1
  const x0 = sym.inkLeft
  const x1 = tx + (glyphX[last] + WORD.glyphs[last].inkRight) * s
  const { defs, body } = markParts(sym, c)
  const word = WORD.glyphs.map((g, i) => `    <path transform="translate(${r3(glyphX[i])} 0)" d="${g.d}"/>`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(x0)} 0 ${r3(x1 - x0)} 100" width="${r3(x1 - x0)}" height="100">
  <title>Iris</title>
  <defs>
${defs}
  </defs>
${body}
  <g fill="${c.right}" transform="translate(${r3(tx)} ${r3(base)}) scale(${r3(s * 1000) / 1000})">
${word}
  </g>
</svg>
`
}

for (const [theme, suffix] of [['light', ''], ['dark', '-dark']]) {
  const sym = makeSymbol(WEIGHT[theme])
  writeFileSync(join(OUT, `iris-symbol${suffix}.svg`), symbolSvg(sym, theme))
  writeFileSync(join(OUT, `iris-logo-horizontal${suffix}.svg`), lockupSvg(sym, theme))
  console.log(
    `${theme}: 두께 ×${WEIGHT[theme]} · 오른쪽 면 ${sym.beta.toFixed(2)}° · 가로:세로 ${sym.ratio.toFixed(3)} · 끝단 간격 ${sym.gaps.map((g) => g.toFixed(2)).join(' / ')} · 색 ${COLORS[theme].right} / ${COLORS[theme].left}`,
  )
}
console.log('저장: iris-symbol(.svg/-dark.svg), iris-logo-horizontal(.svg/-dark.svg)')
