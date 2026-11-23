/**
 * 디자인 시스템 변수(토큰) 목록 — 피그마 변수처럼 레이어 속성에 연결할 값들.
 * 값은 저장소에 옮겨 적지 않고, 브라우저에 올라온 디자인 시스템 CSS(`:root` 의 사용자 정의 속성)에서 그때그때 읽습니다.
 * 다크모드 바꿔 끼우기(`:root[data-theme=…]`, @media)는 읽지 않아서 캔버스는 늘 밝은 값(디자인 결과물 그대로)을 씁니다.
 * DB 에 따로 등록한 토큰(useDesignSystem().tokens)은 '등록한 토큰' 묶음으로 더합니다.
 */
export type TokenKind = 'color' | 'spacing' | 'radius' | 'borderWidth' | 'opacity' | 'shadow' | 'textStyle' | 'fontWeight' | 'fontSize' | 'lineHeight' | 'letterSpacing'

export interface TextStyleValue { size: number; lineHeight?: number; letterSpacing?: number; weight?: number }

export interface CatalogToken {
  /** 연결에 저장하는 값: CSS 변수 이름('--sys-color-brand-primary-default'), 글자 스타일('ts:body-1'), DB 토큰('db:<이름>') */
  id: string
  kind: TokenKind
  /** 보여 주는 이름: 'brand/primary-default' · 'spacing/08' · 'Body 1' */
  name: string
  /** 목록 묶음 이름 */
  group: string
  /** 보여 주는 값: '#2C7BE2' · '8' · '16 / 24' */
  value: string
  /** 레이어에 써 넣는 실제 값(색 · 그림자 = 문자열, 숫자 = 숫자) */
  color?: string
  num?: number
  css?: string
  text?: TextStyleValue
}

export const KIND_LABEL: Record<TokenKind, string> = {
  color: 'Color', spacing: 'Spacing', radius: 'Corner radius', borderWidth: 'Stroke weight', opacity: 'Opacity', shadow: 'Shadow',
  textStyle: 'Text style', fontWeight: 'Font weight', fontSize: 'Font size', lineHeight: 'Line height', letterSpacing: 'Letter spacing',
}

const WEIGHT_NAME: Record<string, string> = { thin: 'Thin', extralight: 'ExtraLight', light: 'Light', regular: 'Regular', medium: 'Medium', semibold: 'SemiBold', bold: 'Bold', extrabold: 'ExtraBold', black: 'Black' }
export const WEIGHT_LABEL = (w: number) => ({ 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' } as Record<number, string>)[w] ?? String(w)

/** 읽지 않는 이름: 철자가 틀린 중복 · 앱 전용 값 */
const SKIP = [/^--ref-boderwidth-/, /turquiose/]
const KEEP = /^--(sys-color-|ref-color-|ref-spacing-|ref-radius-|radius-|ref-opacity-|ref-borderwidth-|shadow-|typography-|font-weight-|interaction-)/

/** 스타일시트에서 선택자가 정확히 ':root' 인 규칙의 사용자 정의 속성을 모읍니다 */
function readRootVars(): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) {
        if (r.selectorText.trim() !== ':root') continue
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style.item(i)
          if (p.startsWith('--')) out.set(p, r.style.getPropertyValue(p).trim())
        }
      } else if (r instanceof CSSImportRule) {
        try { if (r.styleSheet) walk(r.styleSheet.cssRules) } catch { /* 다른 출처 */ }
      } else if (typeof CSSLayerBlockRule !== 'undefined' && r instanceof CSSLayerBlockRule) {
        walk(r.cssRules)
      }
      // @media · @supports 안은 다크모드 같은 바꿔 끼우기라 읽지 않아요
    }
  }
  for (const s of Array.from(document.styleSheets)) {
    try { walk(s.cssRules) } catch { /* 다른 출처 스타일시트는 못 읽어요 */ }
  }
  return out
}

/** var(--x) 를 끝까지 따라가 실제 값으로 */
function resolveAll(raw: Map<string, string>): Map<string, string> {
  const done = new Map<string, string>()
  const resolve = (name: string, depth = 0): string | undefined => {
    if (done.has(name)) return done.get(name)
    const v = raw.get(name)
    if (v === undefined || depth > 20) return undefined
    const out = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, n: string, fb?: string) => resolve(n, depth + 1) ?? fb?.trim() ?? '')
    done.set(name, out)
    return out
  }
  for (const k of raw.keys()) resolve(k)
  return done
}

const px = (v: string) => { const m = /^(-?[\d.]+)(px)?$/.exec(v.trim()); return m ? Number(m[1]) : NaN }
const titleCase = (s: string) => s.split('-').map((w) => (/^\d+$/.test(w) ? w : w[0]!.toUpperCase() + w.slice(1))).join(' ')

/** 색 문자열 → 보여 주기용 '#RRGGBB' 또는 '#RRGGBB 40%' */
export function colorLabel(c: string): string {
  const p = parseColor(c)
  if (!p) return c
  return p.a < 1 ? `${p.hex} ${Math.round(p.a * 100)}%` : p.hex
}
/** '#RGB' · '#RRGGBB(AA)' · 'rgb(r g b / a%)' · 'rgba(r,g,b,a)' 읽기 */
export function parseColor(c?: string): { hex: string; a: number } | null {
  if (!c) return null
  const s = c.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return { hex: ('#' + [...m[1]!].map((x) => x + x).join('')).toUpperCase(), a: 1 }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
  if (m) return { hex: ('#' + m[1]).toUpperCase(), a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/i.exec(s)
  if (m) {
    const h = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')
    const a = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4])
    return { hex: ('#' + h(m[1]!) + h(m[2]!) + h(m[3]!)).toUpperCase(), a }
  }
  return null
}

function fromCss(vars: Map<string, string>): CatalogToken[] {
  const out: CatalogToken[] = []
  const sys: CatalogToken[] = [], ref: CatalogToken[] = [], inter: CatalogToken[] = []
  const styles = new Map<string, Partial<TextStyleValue> & { order: number }>()
  let order = 0
  for (const [id, value] of vars) {
    if (!KEEP.test(id) || SKIP.some((r) => r.test(id)) || !value) continue
    let m: RegExpExecArray | null
    if ((m = /^--sys-color-([a-z]+)-(.+)$/i.exec(id))) {
      sys.push({ id, kind: 'color', name: `${m[1]}/${m[2]}`, group: `System · ${m[1]}`, value: colorLabel(value), color: value })
    } else if ((m = /^--ref-color-([a-zA-Z]+)-(.+)$/.exec(id))) {
      ref.push({ id, kind: 'color', name: `${m[1]}/${m[2]}`, group: `Palette · ${m[1]}`, value: colorLabel(value), color: value })
    } else if ((m = /^--interaction-(.+)$/.exec(id))) {
      if (parseColor(value)) inter.push({ id, kind: 'color', name: `interaction/${m[1]}`, group: 'Interaction', value: colorLabel(value), color: value })
    } else if ((m = /^--ref-spacing-(.+)$/.exec(id))) {
      const n = px(value); if (Number.isFinite(n)) out.push({ id, kind: 'spacing', name: `spacing/${m[1]}`, group: 'Spacing', value: String(n), num: n })
    } else if ((m = /^--ref-radius-(.+)$/.exec(id)) || (m = /^--radius-(.+)$/.exec(id))) {
      const n = px(value); if (Number.isFinite(n)) out.push({ id, kind: 'radius', name: `radius/${m[1]}`, group: id.startsWith('--ref-') ? 'Corner radius' : 'Corner radius · Semantic', value: String(n), num: n })
    } else if ((m = /^--ref-borderwidth-(.+)$/.exec(id))) {
      const n = px(value); if (Number.isFinite(n)) out.push({ id, kind: 'borderWidth', name: `border-width/${m[1]}`, group: 'Stroke weight', value: String(n), num: n })
    } else if ((m = /^--ref-opacity-(.+)$/.exec(id))) {
      const n = Number(value.replace('%', '')); if (Number.isFinite(n)) out.push({ id, kind: 'opacity', name: `opacity/${m[1]}`, group: 'Opacity', value: `${n}%`, num: n / 100 })
    } else if ((m = /^--shadow-(.+)$/.exec(id))) {
      out.push({ id, kind: 'shadow', name: `shadow/${m[1]}`, group: 'Shadow', value, css: value })
    } else if ((m = /^--font-weight-(.+)$/.exec(id))) {
      const n = Number(value); if (Number.isFinite(n)) out.push({ id, kind: 'fontWeight', name: WEIGHT_NAME[m[1]!] ?? titleCase(m[1]!), group: 'Font weight', value: String(n), num: n })
    } else if ((m = /^--typography-(.+)-(size|line-height|letter-spacing|weight|font-weight)$/.exec(id))) {
      const [, style, prop] = m as unknown as [string, string, string]
      const n = px(value)
      if (!Number.isFinite(n)) continue
      const s = styles.get(style) ?? { order: order++ }
      if (prop === 'size') { s.size = n; out.push({ id, kind: 'fontSize', name: `${style}/size`, group: 'Font size', value: String(n), num: n }) }
      if (prop === 'line-height') { s.lineHeight = n; out.push({ id, kind: 'lineHeight', name: `${style}/line-height`, group: 'Line height', value: String(n), num: n }) }
      if (prop === 'letter-spacing') { s.letterSpacing = n; out.push({ id, kind: 'letterSpacing', name: `${style}/letter-spacing`, group: 'Letter spacing', value: String(n), num: n }) }
      if (prop === 'weight' || prop === 'font-weight') s.weight = n
      styles.set(style, s)
    }
  }
  for (const [style, s] of [...styles].sort((a, b) => a[1].order - b[1].order)) {
    if (s.size === undefined) continue
    const text: TextStyleValue = { size: s.size, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, weight: s.weight }
    out.push({ id: `ts:${style}`, kind: 'textStyle', name: titleCase(style), group: 'Text styles', value: textValue(text), text })
  }
  return [...sys, ...ref, ...inter, ...out]
}

export const textValue = (t: TextStyleValue) => [t.size, t.lineHeight].filter((v) => v !== undefined).join(' / ') + (t.weight ? ` · ${t.weight}` : '')

/** DB 에 등록한 토큰 → 같은 꼴로 */
function fromDb(rows: { name: string; type: string; value: string }[]): CatalogToken[] {
  const out: CatalogToken[] = []
  const group = 'Local styles'
  for (const r of rows) {
    const id = 'db:' + r.name
    if (r.type === 'color' && parseColor(r.value)) out.push({ id, kind: 'color', name: r.name, group, value: colorLabel(r.value), color: r.value })
    else if (r.type === 'spacing' || r.type === 'radius') {
      const n = px(r.value); if (Number.isFinite(n)) out.push({ id, kind: r.type, name: r.name, group, value: String(n), num: n })
    } else if (r.type === 'shadow') out.push({ id, kind: 'shadow', name: r.name, group, value: r.value, css: r.value })
    else if (r.type === 'typography') {
      // '24 / 32 · 700' 또는 {"fontSize":24,"lineHeight":32,"fontWeight":700}
      let text: TextStyleValue | null = null
      const m = /^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*(?:·\s*(\d+))?/.exec(r.value)
      if (r.value.trim().startsWith('{')) {
        try { const o = JSON.parse(r.value); if (Number(o.fontSize)) text = { size: Number(o.fontSize), lineHeight: Number(o.lineHeight) || undefined, letterSpacing: Number(o.letterSpacing) || undefined, weight: Number(o.fontWeight) || undefined } } catch { /* 모양이 다르면 건너뛰어요 */ }
      } else if (m) text = { size: Number(m[1]), lineHeight: m[2] ? Number(m[2]) : undefined, weight: m[3] ? Number(m[3]) : undefined }
      if (text) out.push({ id, kind: 'textStyle', name: r.name, group, value: textValue(text), text })
    }
  }
  return out
}

/** 연결 id 에서 이름 짐작(목록을 아직 못 읽었거나 지워진 토큰) */
export function nameFromId(id: string): string {
  if (id.startsWith('db:')) return id.slice(3)
  if (id.startsWith('ts:')) return titleCase(id.slice(3))
  let m = /^--(?:sys|ref)-color-([a-zA-Z]+)-(.+)$/.exec(id)
  if (m) return `${m[1]}/${m[2]}`
  m = /^--(?:ref-)?([a-z]+)-(.+)$/.exec(id)
  return m ? `${m[1]}/${m[2]}` : id
}

export function useTokenCatalog() {
  const css = useState<CatalogToken[]>('iris-token-catalog', () => [])
  const { tokens } = useDesignSystem()
  /** 스타일시트를 읽어 목록을 채웁니다(클라이언트에서 한 번, 비어 있으면 다시) */
  function ensure() {
    if (!import.meta.client || css.value.length) return
    try { css.value = fromCss(resolveAll(readRootVars())) } catch { css.value = [] }
  }
  if (import.meta.client) { ensure(); if (!css.value.length) onMounted(ensure) }
  const all = computed<CatalogToken[]>(() => [...css.value, ...fromDb(tokens.data.value ?? [])])
  const byId = computed(() => new Map(all.value.map((t) => [t.id, t])))
  const find = (id?: string | null) => (id ? byId.value.get(id) : undefined)
  const list = (kinds: TokenKind[]) => all.value.filter((t) => kinds.includes(t.kind))
  return { all, find, list, ensure }
}
