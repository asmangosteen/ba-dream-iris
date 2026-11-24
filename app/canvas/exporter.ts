import { toCanvas, toSvg } from 'html-to-image'
import type { ExportSetting } from './schema'

/**
 * 내보내기(피그마 Export): 캔버스에 그려진 화면 · 레이어를 PNG · JPG · SVG · PDF 로.
 * - 배율: '2x' 배율, '512w' · '512h' 폭 · 높이 맞춤 (SVG · PDF 는 피그마처럼 1x 크기 그대로)
 * - 파일 이름: 이름 + suffix(비우면 1x 가 아닐 때 '@2x' 처럼) + 확장자
 * - SVG 는 그려진 화면을 그대로 담은 SVG(foreignObject)라 브라우저에서 똑같이 보여요. 도형만이면 우클릭 'Copy as SVG' 가 순수 벡터예요
 * - PDF 는 2배 해상도 이미지를 담은 한 쪽(1px = 1pt)
 */
export const EXPORT_SCALES = ['0.5x', '0.75x', '1x', '1.5x', '2x', '3x', '4x', '512w', '512h'] as const
export const EXPORT_FORMATS: ExportSetting['format'][] = ['PNG', 'JPG', 'SVG', 'PDF']
export const isVectorFormat = (f: ExportSetting['format']) => f === 'SVG' || f === 'PDF'

/** '2x' · '512w' · '512h' · '2' → 배율 */
export function pixelRatioOf(scale: string, w: number, h: number): number {
  const s = scale.trim().toLowerCase()
  const v = parseFloat(s)
  if (!(v > 0)) return 1
  if (s.endsWith('w')) return w > 0 ? v / w : 1
  if (s.endsWith('h')) return h > 0 ? v / h : 1
  return v
}
/** 입력값 다듬기: '2' → '2x', '512 w' → '512w' */
export function normScale(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  const m = /^(\d*\.?\d+)(x|w|h)?$/.exec(s)
  if (!m || !(parseFloat(m[1]!) > 0)) return null
  return m[1] + (m[2] ?? 'x')
}

export function fileNameOf(name: string, e: ExportSetting): string {
  const base = (name.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-')
  const auto = !isVectorFormat(e.format) && e.scale !== '1x' ? `@${e.scale}` : ''
  const ext = e.format === 'JPG' ? 'jpg' : e.format.toLowerCase()
  return `${base}${e.suffix ?? auto}.${ext}`
}

/** 그릴 때 빼는 것: 레이아웃 그리드 겹침층 · 섹션 이름표(피그마 내보내기에도 안 나와요) */
const skip = (n: Node) => !(n instanceof HTMLElement && (n.classList.contains('lg') || n.classList.contains('sec-name')))

function sizeOf(el: HTMLElement) {
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.width) || el.offsetWidth, h: parseFloat(cs.height) || el.offsetHeight }
}
function opts(el: HTMLElement, pixelRatio: number, backgroundColor?: string) {
  const { w, h } = sizeOf(el)
  // 캔버스 안 자리 · 회전 · 마우스 올림 표시는 빼고 그 요소만 왼쪽 위 0 에
  // 글꼴은 woff2 한 형식만 넣어요(파일이 훨씬 가벼워요)
  return { width: w, height: h, pixelRatio, backgroundColor, filter: skip, preferredFontFormat: 'woff2', style: { left: '0', top: '0', margin: '0', transform: 'none', outline: 'none' } }
}

async function canvasOf(el: HTMLElement, pixelRatio: number, backgroundColor?: string) {
  return toCanvas(el, opts(el, pixelRatio, backgroundColor))
}
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('toBlob failed'))), type, q))

/** 한 설정으로 파일 하나 만들기 */
export async function renderExport(el: HTMLElement, e: ExportSetting): Promise<Blob> {
  const { w, h } = sizeOf(el)
  if (e.format === 'SVG') {
    const url = await toSvg(el, opts(el, 1))
    return new Blob([decodeURIComponent(url.slice(url.indexOf(',') + 1))], { type: 'image/svg+xml' })
  }
  if (e.format === 'PDF') {
    const c = await canvasOf(el, 2, '#FFFFFF')
    const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', 0.95)).arrayBuffer())
    return pdfWithJpeg(jpg, c.width, c.height, w, h)
  }
  const k = pixelRatioOf(e.scale, w, h)
  const c = await canvasOf(el, k, e.format === 'JPG' ? '#FFFFFF' : undefined)
  return e.format === 'JPG' ? blobOf(c, 'image/jpeg', 0.92) : blobOf(c, 'image/png')
}

/** 작은 미리보기(Preview 펼침) */
export async function previewOf(el: HTMLElement, maxW = 240): Promise<string> {
  const { w } = sizeOf(el)
  const c = await canvasOf(el, Math.min(2, (maxW * 2) / Math.max(1, w)))
  return c.toDataURL('image/png')
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** JPEG 한 장을 담은 한 쪽짜리 PDF(쪽 크기 = 화면 크기, 1px = 1pt) */
function pdfWithJpeg(jpg: Uint8Array, pw: number, ph: number, w: number, h: number): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (p: Uint8Array | string) => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); len += b.length }
  const W = Math.round(w * 100) / 100, H = Math.round(h * 100) / 100
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
  push('%PDF-1.4\n%âãÏÓ\n')
  const obj = (n: number, body: string) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`) }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offsets[4] = len
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`)
  push(jpg)
  push('\nendstream\nendobj\n')
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offsets[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
