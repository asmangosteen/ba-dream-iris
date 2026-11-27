import { absPos, isGroupNode, lineHeightPx, type Effect, type LayerDoc, type LayerNode, type LayerStyle, type Paint } from './schema'
import { nodePathIn } from './vector'
import { radiiOf } from './paint'

/**
 * Iris 레이어 → SVG('SVG로 복사' — 피그마에 붙이면 레이어가 나뉜 채 고칠 수 있어요).
 * 피그마가 내보내는 모양에 맞춰요: 프레임 = <g id="이름"> + 배경 + clip-path, 그룹 = <g>, 도형 = <path>(칠이 여러 개면 겹쳐서), 글자 = <text>(고칠 수 있는 글자),
 * 그라디언트 = linearGradient, 사진 = pattern + image(그림 데이터 내장), 그림자 = filter, 마스크 = mask. 같은 SVG 를 Iris 에 다시 붙여도 그대로 돌아와요(svgImport.ts)
 * 디자인 시스템 인스턴스는 SVG 로 옮길 수 없어 빼요(→ PNG 로 복사)
 */
export interface SvgExportOpts {
  /** 'token:' 색 풀기 */
  color: (v?: string) => string | undefined
  /** 이미지 주소 → SVG 에 넣을 주소(data:). 못 구하면 null(그 칠은 빼요) */
  image?: (src: string) => Promise<string | null>
  /** 화면(프레임) 통째로: 화면 이름 · 크기 · 모양(LayerDoc.frame) — 맨 바깥 프레임으로 */
  frame?: { name: string; w: number; h: number; style?: LayerStyle }
}

const r2 = (v: number) => Math.round(v * 100) / 100
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** '#RRGGBBAA' → 색 · 투명도 */
function splitHex(c: string | undefined): { hex: string; a: number } | null {
  if (!c) return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c.trim())
  if (!m) return { hex: c, a: 1 }
  const h = m[1]!.length === 3 ? m[1]!.split('').map((x) => x + x).join('') : m[1]!
  return { hex: '#' + h.slice(0, 6).toUpperCase(), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
}
/**
 * 피그마가 SVG 글자를 받는 규칙(2026-11-27 피그마에서 확인): 줄 높이는 늘 '자동'(Pretendard 글자 크기 × 1.19), 글자 상자 윗변 = 기준선 − 글자 크기.
 * 그래서 피그마 글자 상자(1.19배)를 Iris 줄 상자 가운데에 놓고 정수로 반올림한 자리 + 글자 크기를 기준선으로 써요 — 피그마 위치는 정수, 글자 모양은 Iris 와 0.5px 안
 */
const FIGMA_AUTO_LH = 1.19

export async function svgOfLayers(doc: LayerDoc, ns: LayerNode[], opts: SvgExportOpts): Promise<string | null> {
  const top = ns.filter((n) => !n.hidden && n.type !== 'instance')
  if (!top.length && !opts.frame) return null
  const boxes = top.map((n) => ({ ...absPos(doc, n.id), w: n.w, h: n.h }))
  // 좌표 기준(SVG 왼쪽 위의 문서 좌표). 안쪽 프레임(중첩 <svg>)을 그리는 동안은 그 프레임 왼쪽 위로 바꿔요
  let ox = opts.frame ? 0 : Math.min(...boxes.map((b) => b.x)), oy = opts.frame ? 0 : Math.min(...boxes.map((b) => b.y))
  const W = opts.frame ? opts.frame.w : Math.max(...boxes.map((b) => b.x + b.w)) - ox
  const H = opts.frame ? opts.frame.h : Math.max(...boxes.map((b) => b.y + b.h)) - oy
  const defs: string[] = []
  let uid = 0
  // 정의(그라디언트 · 마스크 …) 이름은 레이어 이름과 겹치지 않게 앞에 iris- 를 붙여요
  const id = (p: string) => `iris-${p}${++uid}`
  const images = new Map<string, Promise<string | null>>()
  const imageHref = (src: string) => {
    if (!images.has(src)) images.set(src, opts.image ? opts.image(src).catch(() => null) : Promise.resolve(src.startsWith('data:') ? src : null))
    return images.get(src)!
  }
  const absOf = (n: LayerNode) => { const a = absPos(doc, n.id); return { x: a.x - ox, y: a.y - oy } }
  const parentOff = (n: LayerNode) => { const p = n.parentId ? absPos(doc, n.parentId) : { x: 0, y: 0 }; return { x: p.x - ox, y: p.y - oy } }
  const pathOf = (n: LayerNode) => { const o = parentOff(n); return nodePathIn(doc, n, o.x, o.y) }
  /** 칠 하나 → fill 값(+투명도). box = 프레임 위 상자 */
  async function fillOf(p: Paint, box: { x: number; y: number; w: number; h: number }): Promise<string | null> {
    if (p.visible === false) return null
    const op = p.opacity ?? 1
    if (p.type === 'solid') {
      const c = splitHex(opts.color(p.color) ?? p.color)
      if (!c) return null
      const a = c.a * op
      return `fill="${c.hex}"${a < 0.999 ? ` fill-opacity="${r2(a)}"` : ''}`
    }
    if (p.type === 'linear' || p.type === 'radial' || p.type === 'angular') {
      const stops = [...p.stops].sort((a, b) => a.pos - b.pos).map((s) => {
        const c = splitHex(opts.color(s.color) ?? s.color) ?? { hex: '#000000', a: 1 }
        const a = c.a * op
        return `<stop offset="${r2(s.pos)}" stop-color="${c.hex}"${a < 0.999 ? ` stop-opacity="${r2(a)}"` : ''}/>`
      }).join('')
      const gid = id('paint')
      // 그라디언트 점(from · to, 상자 기준 0~1)이 있으면 그 자리 그대로, 없으면 각도로
      const hp = p as { from?: [number, number]; to?: [number, number] }
      const at = (q: [number, number]) => ({ x: box.x + q[0] * box.w, y: box.y + q[1] * box.h })
      if (p.type === 'linear') {
        let a: { x: number; y: number }, b: { x: number; y: number }
        if (hp.from && hp.to) { a = at(hp.from); b = at(hp.to) } else {
          // CSS 각도 → 상자 위 두 점(Iris 가 그리는 그라디언트 선과 같게)
          const rad = ((p.angle ?? 180) * Math.PI) / 180, ux = Math.sin(rad), uy = -Math.cos(rad)
          const L = Math.abs(box.w * ux) + Math.abs(box.h * uy)
          const cx = box.x + box.w / 2, cy = box.y + box.h / 2
          a = { x: cx - (ux * L) / 2, y: cy - (uy * L) / 2 }; b = { x: cx + (ux * L) / 2, y: cy + (uy * L) / 2 }
        }
        defs.push(`<linearGradient id="${gid}" x1="${r2(a.x)}" y1="${r2(a.y)}" x2="${r2(b.x)}" y2="${r2(b.y)}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`)
      } else {
        const c = at(hp.from ?? [0.5, 0.5]), e = at(hp.to ?? [0.5, 1])
        defs.push(`<radialGradient id="${gid}" cx="${r2(c.x)}" cy="${r2(c.y)}" r="${r2(Math.max(0.01, Math.hypot(e.x - c.x, e.y - c.y)))}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`)
      }
      return `fill="url(#${gid})"`
    }
    if (p.type === 'image') {
      const href = await imageHref(p.src)
      if (!href) return null
      const pid = id('pattern')
      const fit = p.fit === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice'
      defs.push(`<pattern id="${pid}" patternContentUnits="objectBoundingBox" width="1" height="1"><image width="1" height="1" preserveAspectRatio="${fit}" xlink:href="${esc(href)}"/></pattern>`)
      return `fill="url(#${pid})"${op < 0.999 ? ` fill-opacity="${r2(op)}"` : ''}`
    }
    return null
  }
  const paintsOf = (s: LayerStyle): Paint[] => (s.fills?.length ? s.fills : s.fill ? [{ type: 'solid', color: s.fill }] : [])
  function strokeAttr(s: LayerStyle, open: boolean): string {
    const solid = s.strokes?.find((p) => p.type === 'solid' && p.visible !== false) as Extract<Paint, { type: 'solid' }> | undefined
    const c = splitHex(opts.color(s.stroke) ?? s.stroke ?? (solid ? opts.color(solid.color) ?? solid.color : undefined))
    const w = s.strokeWidth ?? (c ? 1 : 0)
    if (!c || !w) return ''
    return ` stroke="${c.hex}"${c.a < 0.999 ? ` stroke-opacity="${r2(c.a)}"` : ''} stroke-width="${r2(w)}"${s.cap && s.cap !== 'butt' ? ` stroke-linecap="${s.cap}"` : open ? '' : ''}${s.join && s.join !== 'miter' ? ` stroke-linejoin="${s.join}"` : ''}${s.dash ? ` stroke-dasharray="${r2(s.dash[0])} ${r2(s.dash[1])}"` : ''}`
  }
  /** 그림자 · 흐림 → 피그마 모양 filter(Iris 로 다시 붙이면 효과로 돌아와요) */
  function filterOf(effects: Effect[] | undefined, box: { x: number; y: number; w: number; h: number }): string {
    const list = (effects ?? []).filter((e) => e.visible !== false)
    if (!list.length) return ''
    const fid = id('filter')
    const pad = Math.max(0, ...list.map((e) => ('x' in e ? Math.abs(e.x) + Math.abs(e.y) + e.blur + Math.abs(e.spread ?? 0) : e.blur))) * 2
    let body = '<feFlood flood-opacity="0" result="BackgroundImageFix"/>'
    let prev = 'BackgroundImageFix'
    list.forEach((e, i) => {
      const k = i + 1
      if (e.type === 'drop' || e.type === 'inner') {
        const c = splitHex(opts.color(e.color) ?? e.color) ?? { hex: '#000000', a: 0.25 }
        const [rr, gg, bb] = [1, 3, 5].map((j) => parseInt(c.hex.slice(j, j + 2), 16) / 255)
        const res = e.type === 'drop' ? `effect${k}_dropShadow` : `effect${k}_innerShadow`
        body += `<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>`
        if (e.spread) body += `<feMorphology radius="${r2(Math.abs(e.spread))}" operator="${e.spread > 0 ? 'dilate' : 'erode'}" in="SourceAlpha" result="${res}_spread"/>`
        body += `<feOffset${e.x ? ` dx="${r2(e.x)}"` : ''}${e.y ? ` dy="${r2(e.y)}"` : ''}/>`
        if (e.blur) body += `<feGaussianBlur stdDeviation="${r2(e.blur / 2)}"/>`
        if (e.type === 'inner') body += `<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>`
        body += `<feColorMatrix type="matrix" values="0 0 0 0 ${r2(rr!)} 0 0 0 0 ${r2(gg!)} 0 0 0 0 ${r2(bb!)} 0 0 0 ${r2(c.a)} 0"/>`
        body += `<feBlend mode="normal" in2="${e.type === 'drop' ? prev : 'shape'}" result="${res}"/>`
        if (e.type === 'drop') { body += `<feBlend mode="normal" in="SourceGraphic" in2="${res}" result="shape"/>`; prev = res } else prev = res
      } else if (e.type === 'blur') body += `<feGaussianBlur stdDeviation="${r2(e.blur / 2)}" result="effect${k}_foregroundBlur"/>`
    })
    if (!body.includes('result="shape"')) body += `<feBlend mode="normal" in="SourceGraphic" in2="${prev}" result="shape"/>`
    defs.push(`<filter id="${fid}" x="${r2(box.x - pad)}" y="${r2(box.y - pad)}" width="${r2(box.w + pad * 2)}" height="${r2(box.h + pad * 2)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${body}</filter>`)
    return ` filter="url(#${fid})"`
  }
  /** 돌리기 · 뒤집기(상자 가운데 기준) */
  function transformOf(n: LayerNode, box: { x: number; y: number; w: number; h: number }): string {
    const cx = r2(box.x + box.w / 2), cy = r2(box.y + box.h / 2)
    const parts: string[] = []
    if (n.rotation) parts.push(`rotate(${r2(n.rotation)} ${cx} ${cy})`)
    if (n.flipX || n.flipY) parts.push(`translate(${cx} ${cy}) scale(${n.flipX ? -1 : 1} ${n.flipY ? -1 : 1}) translate(${-cx} ${-cy})`)
    return parts.length ? ` transform="${parts.join(' ')}"` : ''
  }
  const opAttr = (s: LayerStyle) => (s.opacity !== undefined && s.opacity < 0.999 ? ` opacity="${r2(s.opacity)}"` : '')
  /** 도형: 칠마다 path 하나(아래 → 위), 선은 마지막에 */
  async function shape(n: LayerNode, d: string, box: { x: number; y: number; w: number; h: number }, opt: { named?: boolean; asRect?: boolean } = {}): Promise<string> {
    const named = opt.named !== false
    // 프레임 배경은 <rect>(피그마가 내보내는 모양 — 다시 읽을 때 프레임으로 알아봐요). 모서리가 모두 같을 때만
    const rr = radiiOf(n.style)
    const rectEl = opt.asRect && rr.every((v) => v === rr[0]) ? (attrs: string) => `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}"${rr[0] ? ` rx="${r2(Math.min(rr[0], box.w / 2, box.h / 2))}"` : ''} ${attrs}/>` : null
    const open = n.type === 'line' || (n.type === 'path' && !n.closed) || (n.type === 'vector' && !!n.vnet?.length && n.vnet.every((p) => !p.closed))
    const fills = open ? [] : (await Promise.all(paintsOf(n.style).map((p) => fillOf(p, box)))).filter((x): x is string => !!x)
    const rule = n.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''
    const el = (attrs: string) => (rectEl ? rectEl(attrs) : `<path d="${d}"${rule} ${attrs}/>`)
    const out: string[] = fills.map((f) => el(f))
    // 변마다 다른 선(위쪽만 등 — strokeSides): 그 변만 선으로
    const sides = n.style.strokeSides
    if (sides && (n.style.stroke || n.style.strokes?.length) && !sides.every((v) => v === sides[0])) {
      const { x, y, w, h } = box
      const segs: [number, string][] = [[sides[0], `M${r2(x)} ${r2(y + sides[0] / 2)}H${r2(x + w)}`], [sides[1], `M${r2(x + w - sides[1] / 2)} ${r2(y)}V${r2(y + h)}`], [sides[2], `M${r2(x)} ${r2(y + h - sides[2] / 2)}H${r2(x + w)}`], [sides[3], `M${r2(x + sides[3] / 2)} ${r2(y)}V${r2(y + h)}`]]
      for (const [sw, sd] of segs) { if (!sw) continue; const st = strokeAttr({ ...n.style, strokeWidth: sw }, true); if (st) out.push(`<path d="${sd}" fill="none"${st}/>`) }
    } else {
      const st = strokeAttr(n.style, open)
      // 칠이 하나면 칠과 선을 한 요소에(피그마와 같아요 — 다시 읽어도 레이어 하나), 칠이 여럿이면 선은 맨 위 따로
      if (st && out.length === 1) out[0] = out[0]!.replace(/\/>$/, `${st}/>`)
      else if (st) out.push(el(`fill="none"${st}`))
    }
    if (!out.length) return ''
    const fx = filterOf(n.style.effects, box)
    const tf = transformOf(n, box)
    // 요소 하나면 투명도도 그 요소에(피그마가 레이어 하나로 받아요). 여럿 · 그림자 · 돌리기면 <g> 로 감싸요
    const wrap = out.length > 1 || fx || tf
    const tag = /^<(\w+) /.exec(out[0]!)?.[1] ?? 'path'
    // 프레임 배경(이름 없음)은 'Background' — 피그마는 SVG 배경을 프레임 칠로 못 받아 맨 아래 레이어로 넣어요
    const idAttr = named ? ` id="${esc(n.name)}"` : ' id="Background"'
    if (!wrap) return out[0]!.replace(`<${tag} `, `<${tag}${idAttr}${opAttr(n.style)} `)
    return named ? `<g${idAttr}${opAttr(n.style)}${fx}${tf}>${out.join('')}</g>` : `<g${opAttr(n.style)}${fx}${tf}>${out.join('')}</g>`
  }
  function text(n: LayerNode, box: { x: number; y: number; w: number; h: number }): string {
    const s = n.style
    const fs = s.fontSize ?? 16, lh = lineHeightPx(s)
    const c = splitHex(opts.color(s.color) ?? s.color ?? '#000000') ?? { hex: '#000000', a: 1 }
    let content = n.text ?? ''
    if (s.textCase === 'upper') content = content.toUpperCase()
    else if (s.textCase === 'lower') content = content.toLowerCase()
    const lines = content.split('\n')
    const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start'
    const tx = r2(anchor === 'middle' ? box.x + box.w / 2 : anchor === 'end' ? box.x + box.w : box.x)
    const base = (i: number) => Math.round(box.y + i * lh + (lh - FIGMA_AUTO_LH * fs) / 2) + fs
    const spans = lines.map((l, i) => `<tspan x="${tx}" y="${r2(base(i))}">${esc(l) || ' '}</tspan>`).join('')
    // data-top · data-lh: Iris 에 다시 붙일 때 원래 윗변 · 줄 높이로(피그마 · 다른 앱은 무시해요)
    return `<text id="${esc(n.name)}" data-top="${r2(box.y)}" data-lh="${r2(lh)}" fill="${c.hex}"${c.a < 0.999 ? ` fill-opacity="${r2(c.a)}"` : ''} xml:space="preserve" style="white-space: pre" font-family="Pretendard" font-size="${r2(fs)}" font-weight="${s.fontWeight ?? 400}"${s.letterSpacing ? ` letter-spacing="${r2(s.letterSpacing)}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${opAttr(s)}${transformOf(n, box)}>${spans}</text>`
  }
  /** 자식들(아래 → 위). 마스크 레이어가 있으면 그 위쪽 형제들을 <mask> 로 가려요(피그마 · Iris 마스크와 같아요) */
  async function children(ids: string[] | undefined): Promise<string> {
    const list = (ids ?? []).map((k) => doc.nodes[k]).filter((n): n is LayerNode => !!n)
    let out = ''
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!
      if (n.isMask && !n.hidden) {
        const mid = id('mask')
        const b = absOf(n)
        out += `<mask id="${mid}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(n.w)}" height="${r2(n.h)}"><path d="${pathOf(n)}" fill="black"/></mask>`
        const rest = await Promise.all(list.slice(i + 1).map(node))
        out += `<g mask="url(#${mid})">${rest.join('')}</g>`
        break
      }
      out += await node(n)
    }
    return out
  }
  /** 프레임 안쪽을 그 프레임 왼쪽 위 기준으로 그려요(배경 사각형 + 자식) */
  async function framed(n: LayerNode): Promise<{ bg: string; inner: string }> {
    const save = [ox, oy] as const
    const a = absPos(doc, n.id)
    ox = a.x; oy = a.y
    try {
      const bgNode = { ...n, rotation: undefined, flipX: undefined, flipY: undefined, style: { ...n.style, effects: undefined, opacity: undefined } } as LayerNode
      const bg = await shape(bgNode, pathOf(n), { x: 0, y: 0, w: n.w, h: n.h }, { named: false, asRect: true })
      const inner = await children(n.children)
      return { bg, inner }
    } finally { ox = save[0]; oy = save[1] }
  }
  async function node(n: LayerNode): Promise<string> {
    if (n.hidden || n.type === 'instance') return ''
    const a = absOf(n)
    const box = { x: a.x, y: a.y, w: n.w, h: n.h }
    if (n.type === 'text') return text(n, box)
    if (n.type === 'image' && n.src) {
      const href = await imageHref(n.src)
      return href ? `<image id="${esc(n.name)}" x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" preserveAspectRatio="xMidYMid slice" xlink:href="${esc(href)}"${opAttr(n.style)}${transformOf(n, box)}/>` : ''
    }
    if (n.type === 'frame' || n.type === 'section') {
      if (isGroupNode(n)) { const inner = await children(n.children); return inner ? `<g id="${esc(n.name)}"${opAttr(n.style)}${filterOf(n.style.effects, box)}${transformOf(n, box)}>${inner}</g>` : '' }
      const clip = n.type === 'frame' ? n.style.clip !== false : n.style.clip === true
      const bgNode = { ...n, rotation: undefined, flipX: undefined, flipY: undefined, style: { ...n.style, effects: undefined, opacity: undefined } } as LayerNode
      const fx = filterOf(n.style.effects, box)
      const tf = transformOf(n, box)
      if (!clip) {
        // 자르기 끈 프레임: 그룹으로(피그마는 중첩 <svg> 를 늘 잘라서) — data-frame 으로 표시해 Iris 는 프레임으로 다시 읽어요
        const bg = await shape(bgNode, pathOf(n), box, { named: false, asRect: true })
        const inner = await children(n.children)
        return `<g id="${esc(n.name)}" data-frame="1"${opAttr(n.style)}${fx}${tf}>${bg}${inner}</g>`
      }
      // 자르기 켠 프레임 = 중첩 <svg>(피그마가 프레임으로 받아요). 안쪽 좌표는 프레임 왼쪽 위 기준
      const { bg, inner } = await framed(n)
      const el = `<svg id="${esc(n.name)}" x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" viewBox="0 0 ${r2(box.w)} ${r2(box.h)}" overflow="hidden">${bg}${inner}</svg>`
      // 투명도 · 그림자 · 돌리기는 <svg> 에 붙이면 피그마가 무시해서 바깥 그룹에(피그마: 그룹 › 프레임)
      return opAttr(n.style) || fx || tf ? `<g id="${esc(n.name)}"${opAttr(n.style)}${fx}${tf}>${el}</g>` : el
    }
    return shape(n, pathOf(n), box)
  }

  const head = 'fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
  const tail = () => `${defs.length ? `<defs>${defs.join('')}</defs>\n` : ''}</svg>`
  // 화면 하나 · 프레임 하나: SVG 자체를 그 프레임으로(피그마에 붙이면 그 이름의 프레임 하나 — 맨 바깥 svg 의 id 가 프레임 이름이 돼요)
  if (opts.frame) {
    const f = opts.frame
    const fs = f.style ?? {}
    const frameNode = { id: '__frame', type: 'rect', name: f.name, parentId: null, x: 0, y: 0, w: f.w, h: f.h, style: { ...fs, fill: fs.fill ?? (fs.fills?.length ? undefined : '#FFFFFF'), effects: undefined, opacity: undefined } } as LayerNode
    const bg = await shape(frameNode, nodePathIn(doc, frameNode, 0, 0), { x: 0, y: 0, w: f.w, h: f.h }, { named: false, asRect: true })
    const inner = await children(doc.rootIds)
    return `<svg id="${esc(f.name)}" data-frame="${fs.clip !== false ? 'clip' : '1'}" width="${r2(f.w)}" height="${r2(f.h)}" viewBox="0 0 ${r2(f.w)} ${r2(f.h)}" ${head}>\n${bg}${inner}\n${tail()}`
  }
  const only = top.length === 1 ? top[0]! : null
  if (only && (only.type === 'frame' || only.type === 'section') && !isGroupNode(only) && !only.rotation && !only.flipX && !only.flipY && !(only.style.opacity !== undefined && only.style.opacity < 0.999) && !only.style.effects?.some((e) => e.visible !== false)) {
    const clip = only.type === 'frame' ? only.style.clip !== false : only.style.clip === true
    const { bg, inner } = await framed(only)
    return `<svg id="${esc(only.name)}" data-frame="${clip ? 'clip' : '1'}" width="${r2(only.w)}" height="${r2(only.h)}" viewBox="0 0 ${r2(only.w)} ${r2(only.h)}" ${head}>\n${bg}${inner}\n${tail()}`
  }
  const body = (await Promise.all(top.map(node))).join('')
  if (!body) return null
  return `<svg width="${r2(W)}" height="${r2(H)}" viewBox="0 0 ${r2(W)} ${r2(H)}" ${head}>\n${body}\n${tail()}`
}

/** 이미지 주소 → data: (SVG 안에 넣으려고). 화면에 그린 주소를 받아 그림으로 바꿔요 */
export async function toDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  const blob = await (await fetch(url)).blob()
  return await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob) })
}
