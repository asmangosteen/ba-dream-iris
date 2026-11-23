import { parseColor } from './tokens'

/** 색 계산: HSV(색 선택기 판) · RGB · HSL ↔ '#RRGGBB(AA)' */
export interface RGBA { r: number; g: number; b: number; a: number }
export interface HSVA { h: number; s: number; v: number; a: number }

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0').toUpperCase()

export function toRgba(c?: string): RGBA {
  const p = parseColor(c) ?? { hex: '#000000', a: 1 }
  const n = parseInt(p.hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: p.a }
}
/** '#RRGGBB' (불투명) 또는 '#RRGGBBAA' */
export function fromRgba({ r, g, b, a }: RGBA): string {
  const h = '#' + hex2(r) + hex2(g) + hex2(b)
  return a >= 1 ? h : h + hex2(a * 255)
}
export function rgbToHsv({ r, g, b, a }: RGBA): HSVA {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max, a }
}
export function hsvToRgb({ h, s, v, a }: HSVA): RGBA {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255, a }
}
export function rgbToHsl({ r, g, b }: RGBA): { h: number; s: number; l: number } {
  const { h } = rgbToHsv({ r, g, b, a: 1 })
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  return { h, s, l }
}
export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const v = l + c / 2
  return hsvToRgb({ h, s: v ? (2 * (v - l)) / v : 0, v, a })
}
export const hexOf = (c?: string) => (parseColor(c)?.hex ?? '#000000')
export const alphaOf = (c?: string) => parseColor(c)?.a ?? 1
/** 색에 투명도(0~1) 넣기 */
export const withAlpha = (c: string, a: number) => fromRgba({ ...toRgba(c), a: clamp(a) })
/** 입력한 hex 고치기: 'abc' → '#AABBCC', 6 · 8자리만 */
export function normHex(v: string): string | null {
  let s = v.trim()
  if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{1,2}$/i.test(s)) s = '#' + s.slice(1).padStart(2, s.slice(1)).repeat(3)
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? s.toUpperCase() : null
}
