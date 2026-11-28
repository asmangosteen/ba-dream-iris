import { runCss } from '~/canvas/textRuns'
import { isContainer, SCHEMA_VERSION, type LayerDoc, type LayerNode } from '~/canvas/schema'
import { backgroundCss, effectCss, shadowByShape, strokeShadows } from '~/canvas/paint'
import { canFlatten } from '~/canvas/boolean'
import { svgOfLayers, toDataUrl, type SvgExportOpts } from '~/canvas/svgExport'
import { loadedImageUrl } from '~/canvas/images'
import type { LayerClip, LayerStore } from '~/canvas/store'
import type { ScreenCopySource } from '~/composables/useEditor'
import type { MenuItem } from './useContextMenu'

/** 마지막에 복사한 것(레이어 · 화면) — 캔버스 단축키와 우클릭 메뉴가 함께 써요 */
export const useLastCopy = () => useState<'layers' | 'screen' | 'mixed' | null>('iris-last-copy', () => null)
/** 레이어와 함께 고른 화면들(피그마처럼 한 화면 안 자식 레이어 + 다른 화면을 같이 고를 때). 레이어 선택이 비거나 바뀌면 비워요 */
export const useMixScreens = () => useState<string[]>('iris-mix-screens', () => [])
/**
 * 이름 바꾸기 요청(우클릭 'Rename' · ⌘R): 레이어 목록이 받아서 — 하나면 그 줄에서 바로 고치기, 여러 개면 'Rename N layers' 창
 */
/**
 * 오토 레이아웃 간격 표시(피그마와 같아요): 오른쪽 패널의 간격 · 안쪽 여백 칸에 마우스를 올리거나 고치는 동안 캔버스에 그 자리를 칠해 보여요.
 * gap = 항목 사이, rowGap = 줄 사이, padH · padV = 좌우 · 위아래 여백, 0 · 1 · 2 · 3 = 위 · 오른 · 아래 · 왼 여백 하나
 */
export type AlHint = 'gap' | 'rowGap' | 'padH' | 'padV' | 0 | 1 | 2 | 3
export const useAlHint = () => useState<AlHint | null>('iris-al-hint', () => null)
/** 어디서든 토스트 안내(편집기 화면 아래 알림) — index 페이지가 받아서 띄워요 */
export const useToastReq = () => useState<{ text: string; at: number } | null>('iris-toast-req', () => null)
/** 같은 레이어 모두 고르기(버튼 · 우클릭 · ⌥⌘A 공용): 고른 뒤 몇 개인지 안내, 없으면 없다고 */
export function selectMatchingSay(store: LayerStore, sid: string, say: (t: string) => void) {
  const n = store.selectMatching(sid)
  say(n ? tr('Selected {n} matching layers', { n }) : tr('No other matching layers'))
}
export const useRenameReq = () => useState<{ sid: string; id: string }[] | null>('iris-rename-req', () => null)
/** 지금 고른 레이어 전부(이 문서 + 다른 프레임에서 함께 고른 것) */
export const pickedLayers = (store: LayerStore, sid: string, ids: string[]) => [...ids.map((id) => ({ sid, id })), ...store.xsel.value]

/** 레이어 우클릭 메뉴 항목(피그마 순서). 캔버스 · 레이어 목록 공용 */
/** 레이어 → CSS(피그마 'Copy as CSS') */
export function cssOf(n: LayerNode, color: (v?: string) => string | undefined): string {
  const s = n.style
  const css: Record<string, string> = { width: `${Math.round(n.w)}px`, height: `${Math.round(n.h)}px` }
  if (n.type !== 'text') Object.assign(css, Object.fromEntries(Object.entries(backgroundCss(s, color, () => undefined)).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v])))
  const r = s.radii ? s.radii.map((v) => v + 'px').join(' ') : s.radius ? s.radius + 'px' : n.type === 'ellipse' ? '50%' : ''
  if (r) css['border-radius'] = r
  const st = strokeShadows(s, n.type, color), fx = effectCss(s.effects, color, n.type !== 'text', n.type !== 'text' && shadowByShape(n))
  const sh = [...st.outer, ...st.inner, ...fx.outer, ...fx.inner]
  if (sh.length) css['box-shadow'] = sh.join(', ')
  if (fx.filter.length) css.filter = fx.filter.join(' ')
  if (s.opacity !== undefined && s.opacity < 1) css.opacity = String(s.opacity)
  if (s.blend && s.blend !== 'normal') css['mix-blend-mode'] = s.blend
  if (n.type === 'text') Object.assign(css, { color: color(s.color) ?? '', 'font-family': 'Pretendard', 'font-size': `${s.fontSize ?? 16}px`, 'font-weight': String(s.fontWeight ?? 400), 'line-height': s.lineHeight ? (s.lineHeightUnit === 'percent' ? `${s.lineHeight}%` : `${s.lineHeight}px`) : 'normal', ...(s.letterSpacing ? { 'letter-spacing': `${s.letterSpacing}px` } : {}), 'text-align': s.align ?? 'left' })
  const head = `/* ${n.name} */\n` + Object.entries(css).filter(([, v]) => v).map(([k, v]) => `${k}: ${v};`).join('\n')
  // 글자마다 다른 서식: 구간마다 덮어쓴 값만 이어서(피그마 Dev Mode 처럼 — 어느 글자인지 주석으로)
  if (n.type !== 'text' || !n.spans?.length) return head
  const runs = n.spans.map((sp) => {
    const t = (n.text ?? '').slice(sp.s, sp.e).replace(/\s+/g, ' ')
    const body = runCss(s, sp.style, color).split(';').filter((d) => d && !d.startsWith('-webkit-text-fill-color')).map((d) => d.replace(':', ': ') + ';').join('\n')
    return `/* "${t.length > 24 ? t.slice(0, 24) + '…' : t}" (${sp.s}–${sp.e}) */\n${body}`
  })
  return [head, ...runs].join('\n\n')
}
/**
 * 'SVG로 복사'(피그마와 같아요): 프레임 · 그룹 · 마스크 구조, 이름, 글자, 사진, 그라디언트, 그림자까지 담아요(app/canvas/svgExport.ts).
 * 피그마에 붙이면 레이어가 나뉜 채 고칠 수 있고, Iris 에 붙여도 그대로 돌아와요. frame 을 주면 화면 통째로(배경 · 모서리 · 자르기)
 */
export function copySvg(doc: LayerDoc, nodes: LayerNode[], color: (v?: string) => string | undefined, hint?: (t: string) => void, frame?: SvgExportOpts['frame']) {
  const svg = svgOfLayers(doc, nodes, { color, frame, image: (src) => toDataUrl(loadedImageUrl(src)) })
  // 사진을 그림 데이터로 바꾸는 동안 기다려도 클립보드 쓰기가 막히지 않게 바로 씁니다(내용은 나중에 채워져요)
  const text = svg.then((t) => { if (!t) throw new Error('empty'); return new Blob([t], { type: 'text/plain' }) })
  const done = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
    : svg.then((t) => (t ? navigator.clipboard.writeText(t) : Promise.reject(new Error('empty'))))
  done.then(() => hint?.(tr('Copied as SVG')), () => svg.then((t) => hint?.(t ? tr('Couldn\'t copy to the clipboard') : tr('Nothing to copy as SVG')), () => hint?.(tr('Couldn\'t copy to the clipboard'))))
}
async function copyText(text: string, hint?: (t: string) => void) {
  try { await navigator.clipboard.writeText(text); hint?.(tr('Copied to clipboard')) } catch { hint?.(tr('Couldn\'t copy to the clipboard')) }
}

/**
 * 우클릭 'Copy/Paste as' › 하위 메뉴(피그마와 같아요): 코드(CSS) · SVG · PNG 로 복사, 속성 복사 · 붙여넣기. 레이어 · 화면 · 레이어 목록 메뉴가 함께 써요.
 * 없는 항목(undefined)은 빼요
 */
export function copyPasteAs(o: { css?: () => void; svg?: () => void; png?: () => void; copyProps?: () => void; pasteProps?: () => void }): MenuItem {
  const children: MenuItem[] = [
    ...(o.css ? [{ label: tr('Copy as code'), action: o.css }] : []),
    ...(o.svg ? [{ label: tr('Copy as SVG'), action: o.svg }] : []),
    ...(o.png ? [{ label: tr('Copy as PNG'), shortcut: '⇧⌘C', action: o.png }] : []),
    'sep',
    ...(o.copyProps || o.pasteProps ? [
      { label: tr('Copy properties'), shortcut: '⌥⌘C', action: o.copyProps ?? (() => {}), disabled: !o.copyProps },
      { label: tr('Paste properties'), shortcut: '⌥⌘V', action: o.pasteProps ?? (() => {}), disabled: !o.pasteProps },
    ] : []),
  ]
  return { label: tr('Copy/Paste as'), children }
}
export function layerMenuItems(store: LayerStore, sid: string, ids: string[], opts: { lastCopy: Ref<'layers' | 'screen' | 'mixed' | null>; paste: () => void; pasteHere?: () => void; fit?: () => void; hint?: (t: string) => void }): MenuItem[] {
  const d = store.doc(sid)
  const nodes = ids.map((id) => d.nodes[id]).filter((n): n is NonNullable<typeof n> => !!n)
  if (!nodes.length) return []
  const one = nodes.length === 1 ? nodes[0]! : null
  const allHidden = nodes.every((n) => n.hidden), allLocked = nodes.every((n) => n.locked)
  const hasLayout = nodes.some((n) => n.style.layout)
  return [
    { label: tr('Copy'), shortcut: '⌘C', action: () => { if (store.copy()) { opts.lastCopy.value = 'layers'; markIrisClip(store.clipData()) } } },
    { label: tr('Paste'), shortcut: '⌘V', action: opts.paste, disabled: !canIrisPaste(store, opts.lastCopy.value) },
    ...(opts.pasteHere ? [{ label: tr('Paste here'), action: opts.pasteHere, disabled: !store.hasClipboard() || opts.lastCopy.value === 'screen' }] : []),
    copyPasteAs({
      css: () => copyText(nodes.map((n) => cssOf(n, store.color)).join('\n\n'), opts.hint),
      svg: nodes.some((n) => n.type !== 'instance') ? () => copySvg(d, nodes, store.color, opts.hint) : undefined,
      png: () => irisCopyPng(),
      copyProps: ids.length ? () => store.copyStyle() : undefined,
      pasteProps: () => store.pasteStyle(),
    }),
    { label: tr('Duplicate'), shortcut: '⌘D', action: () => store.duplicate() },
    'sep',
    { label: tr('Select parent'), shortcut: '⇧↵', action: () => store.selectParent(sid), disabled: nodes.every((n) => !n.parentId) },
    ...(nodes.some((n) => isContainer(n) && n.children?.length) ? [{ label: tr('Select children'), shortcut: '↵', action: () => store.selectChildren(sid) }] : []),
    { label: tr('Select all'), shortcut: '⌘A', action: () => store.selectAll(sid) },
    { label: tr('Select inverse'), shortcut: '⇧⌘A', action: () => store.selectInverse(sid) },
    { label: tr('Select all matching layers'), shortcut: '⌥⌘A', action: () => selectMatchingSay(store, sid, (t) => opts.hint?.(t)), disabled: !store.hasMatching(sid) },
    'sep',
    { label: tr('Bring to front'), shortcut: ']', action: () => store.arrange(sid, ids, 'top') },
    { label: tr('Bring forward'), shortcut: '⌘]', action: () => store.arrange(sid, ids, 1) },
    { label: tr('Send backward'), shortcut: '⌘[', action: () => store.arrange(sid, ids, -1) },
    { label: tr('Send to back'), shortcut: '[', action: () => store.arrange(sid, ids, 'bottom') },
    'sep',
    { label: tr('Group selection'), shortcut: '⌘G', action: () => store.wrap(sid, ids, 'group') },
    { label: tr('Frame selection'), shortcut: '⌥⌘G', action: () => store.wrap(sid, ids, 'frame') },
    // 섹션은 캔버스 맨 위에만(피그마와 같아요)
    ...(sid.startsWith('page:') && nodes.every((n) => !n.parentId) ? [{ label: tr('Section selection'), shortcut: '⌥⌘S', action: () => store.wrap(sid, ids, 'section') }] : []),
    ...(nodes.some((n) => isContainer(n)) ? [{ label: tr('Ungroup'), shortcut: '⇧⌘G', action: () => store.unwrap(sid, ids) }] : []),
    { label: tr('Rename'), shortcut: '⌘R', action: () => { useRenameReq().value = pickedLayers(store, sid, ids) } },
    hasLayout ? { label: tr('Remove auto layout'), shortcut: '⌥⇧A', action: () => store.removeAutoLayout(sid, ids) } : { label: tr('Add auto layout'), shortcut: '⇧A', action: () => store.addAutoLayout(sid, ids) },
    'sep',
    ...(nodes.length > 1 ? [
      { label: tr('Union selection'), shortcut: '⌥⇧U', action: () => store.booleanOp(sid, ids, 'union') },
      { label: tr('Subtract selection'), shortcut: '⌥⇧S', action: () => store.booleanOp(sid, ids, 'subtract') },
      { label: tr('Intersect selection'), shortcut: '⌥⇧I', action: () => store.booleanOp(sid, ids, 'intersect') },
      { label: tr('Exclude selection'), shortcut: '⌥⇧E', action: () => store.booleanOp(sid, ids, 'exclude') },
    ] : []),
    { label: one?.isMask ? tr('Remove mask') : tr('Use as mask'), shortcut: '⌃⌘M', action: () => store.toggleMask(sid, ids) },
    { label: tr('Flatten'), shortcut: '⌥⇧F', action: () => store.flatten(sid, ids), disabled: !canFlatten(nodes) },
    'sep',
    { label: allHidden ? tr('Show') : tr('Hide'), shortcut: '⇧⌘H', action: () => store.update(sid, ids, { hidden: allHidden ? undefined : true }) },
    { label: allLocked ? tr('Unlock') : tr('Lock'), shortcut: '⇧⌘L', action: () => store.update(sid, ids, { locked: allLocked ? undefined : true }) },
    'sep',
    { label: tr('Flip horizontal'), shortcut: '⇧H', action: () => store.flip(sid, ids, 'x') },
    { label: tr('Flip vertical'), shortcut: '⇧V', action: () => store.flip(sid, ids, 'y') },
    'sep',
    ...(opts.fit ? [{ label: tr('Zoom to selection'), shortcut: '2', action: opts.fit }] : []),
    'sep',
    { label: tr('Delete'), shortcut: '⌫', danger: true, action: () => store.remove(sid, ids) },
  ]
}

/**
 * 운영체제 클립보드에 Iris 복사 내용을 써요(피그마와 같아요 — 다른 파일 · 다른 탭 · 새로고침 뒤에도 ⌘V 로 붙어요).
 * - text/html: 레이어 데이터(data-iris) + 텍스트 레이어 글자(노션 · 메일 같은 곳에 붙이면 글자가 들어가요)
 * - text/plain: 텍스트 레이어 글자(메모장 · 슬랙에 붙이면 글자)
 * 화면을 복사하면 화면 데이터(레이어 · 속성 · 피그마 연결)도 함께 써요. 다른 앱에서 그 뒤에 복사한 것이 있으면 그것이 붙어요(마지막에 복사한 것)
 */
export const IRIS_CLIP = '\u2063iris-clipboard\u2063'
export interface IrisClipPayload { v: 1; stamp: string; schema: number; clip: LayerClip | null; screens?: ScreenCopySource[] }
/**
 * 복사한 화면들 데이터를 주는 곳(편집기 페이지가 등록해요 — 화면 목록 · 레이어를 들고 있어서).
 * withScreens 면 고른 화면들, 그리고 복사한 섹션 안에 든 화면들은 늘 함께(피그마와 같아요)
 */
let screenSource: ((clip: LayerClip | null, withScreens: boolean) => ScreenCopySource[]) | null = null
/** 편집기 페이지가 등록 · 해제해요. 프로젝트 탭을 옮기면 새 페이지가 먼저 등록하고 옛 페이지가 나중에 해제해서 — 자기 것일 때만 지워요 */
export function setIrisScreenSource(fn: NonNullable<typeof screenSource>) { screenSource = fn }
export function unsetIrisScreenSource(fn: NonNullable<typeof screenSource>) { if (screenSource === fn) screenSource = null }
/**
 * 복사할 때 함께 넣을 그림(PNG 2배): 캔버스가 등록해요 — 고른 것(레이어 · 화면)을 그려요. 여럿이면 놓인 배치 그대로 한 장(사이는 투명).
 * 다른 앱(슬랙 · 키노트 · 노션 · 메신저 · 피그마)에 붙이면 그림으로 들어가요. Iris 끼리는 그림이 아니라 레이어 데이터로 붙어요
 */
let imageSource: (() => Promise<Blob> | null) | null = null
export function setIrisImageSource(fn: NonNullable<typeof imageSource>) { imageSource = fn }
export function unsetIrisImageSource(fn: NonNullable<typeof imageSource>) { if (imageSource === fn) imageSource = null }
/** 그림을 못 그렸을 때 대신 넣는 1×1 투명 PNG — 그림 하나 때문에 레이어 데이터까지 못 쓰지 않게 */
const BLANK_PNG = () => new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0))], { type: 'image/png' })
/** 이 탭에서 마지막으로 쓴 복사 내용(우클릭 Paste 처럼 클립보드를 못 읽는 붙여넣기에서 써요) */
let lastPayload: IrisClipPayload | null = null
export const myLastClip = () => lastPayload
/** 붙일 것이 있는지(우클릭 Paste 켜기): 이 편집기 클립보드 · 복사한 화면 · 이 탭에서 다른 프로젝트 · 페이지에서 복사한 것 */
export const canIrisPaste = (store: LayerStore, lastCopy: 'layers' | 'screen' | 'mixed' | null) => store.hasClipboard() || lastCopy === 'screen' || !!lastPayload?.clip || !!lastPayload?.screens?.length
/** 우클릭 Paste: 편집기 페이지가 다른 페이지 · 섹션 붙여넣기를 먼저 맡아요(맡았으면 true) */
let pasteHook: (() => boolean) | null = null
export function setIrisPasteHook(fn: NonNullable<typeof pasteHook>) { pasteHook = fn }
export function unsetIrisPasteHook(fn: NonNullable<typeof pasteHook>) { if (pasteHook === fn) pasteHook = null }
/** 우클릭 'Copy as PNG'(⇧⌘C 와 같아요): 캔버스가 등록해요 */
let pngCopier: (() => void) | null = null
export function setIrisPngCopier(fn: () => void) { pngCopier = fn }
export function unsetIrisPngCopier(fn: () => void) { if (pngCopier === fn) pngCopier = null }
export const irisCopyPng = () => pngCopier?.()
export const irisMenuPaste = (fallback: () => void) => { if (!pasteHook?.()) fallback() }
/** ⌘D: 캔버스의 섹션을 복제할 때 안의 화면까지 함께(편집기 페이지가 맡으면 true) */
let dupHook: (() => boolean) | null = null
export function setIrisDupHook(fn: NonNullable<typeof dupHook>) { dupHook = fn }
export function unsetIrisDupHook(fn: NonNullable<typeof dupHook>) { if (dupHook === fn) dupHook = null }
export const irisDuplicate = () => !!dupHook?.()
/** 이 탭에서 마지막으로 복사한 표시 — ⌘V 때 같으면 이 탭의 클립보드를 그대로(화면 · 섞어 고른 것까지) */
let myStamp = ''
export const isMyClip = (p: IrisClipPayload) => !!myStamp && p.stamp === myStamp
const b64 = (text: string) => { const bytes = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin) }
const unb64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))
const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** 복사한 레이어 안 텍스트 레이어 글자들(위에서부터 레이어 순서대로) */
function clipTexts(clip: LayerClip | null): string[] {
  if (!clip) return []
  const byId = new Map(clip.nodes.map((n) => [n.id, n]))
  const out: string[] = []
  const walk = (id: string) => { const n = byId.get(id); if (!n || n.hidden) return; if (n.type === 'text' && n.text?.trim()) out.push(n.text); n.children?.forEach(walk) }
  clip.rootIds.forEach(walk)
  return out
}
/**
 * clip: 복사한 레이어, withScreens: 복사한 화면들도 함께(화면 복사 · 레이어와 섞어 고른 복사).
 * image: 그림도 함께(잘라내기는 레이어가 바로 지워져 그리지 못해서 false). 텍스트 레이어만 복사하면 그림 없이 글자만
 */
export function markIrisClip(clip: LayerClip | null = null, withScreens = false, image = true) {
  myStamp = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const screens = screenSource?.(clip, withScreens) ?? []
  const payload: IrisClipPayload = { v: 1, stamp: myStamp, schema: SCHEMA_VERSION, clip, ...(screens.length ? { screens } : {}) }
  lastPayload = payload
  const texts = clipTexts(clip)
  const html = `<meta charset="utf-8"><span data-iris="${b64(JSON.stringify(payload))}"></span>${texts.map((t) => `<p>${escHtml(t).replace(/\n/g, '<br>')}</p>`).join('')}`
  const plain = texts.join('\n\n')
  // 1) 비동기 클립보드(크롬 · 사파리 · 데스크톱 앱) 2) 안 되면 copy 이벤트로 3) 그것도 안 되면 이 탭 안 클립보드만
  const legacy = () => {
    const on = (e: ClipboardEvent) => { e.preventDefault(); e.clipboardData?.setData('text/html', html); e.clipboardData?.setData('text/plain', plain || IRIS_CLIP) }
    document.addEventListener('copy', on, { once: true, capture: true })
    try { document.execCommand('copy') } catch { /* 이 탭 안 클립보드만 */ }
    document.removeEventListener('copy', on, { capture: true })
  }
  const textOnly = !!clip && !screens.length && clip.nodes.filter((n) => clip.rootIds.includes(n.id)).every((n) => n.type === 'text')
  let png: Promise<Blob> | null = null
  if (image && !textOnly) { try { png = imageSource?.()?.catch(BLANK_PNG) ?? null } catch { png = null } }
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return legacy()
    const htmlBlob = new Blob([html], { type: 'text/html' })
    // HTML 을 먼저 읽는 앱(노션 · 메일 · 키노트 …)에도 그림이 들어가게 HTML 안에도 같은 그림(원래 크기로 보이게 절반 폭)
    const htmlWithImage = png ? png.then(async (b) => {
      try {
        const url = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(b) })
        const bm = await createImageBitmap(b)
        const w = Math.max(1, Math.round(bm.width / 2))
        bm.close()
        return new Blob([`${html}<img src="${url}" width="${w}" alt="">`], { type: 'text/html' })
      } catch { return htmlBlob }
    }) : htmlBlob
    const parts: Record<string, Blob | Promise<Blob>> = { 'text/html': htmlWithImage }
    if (plain) parts['text/plain'] = new Blob([plain], { type: 'text/plain' })
    if (png) parts['image/png'] = png
    // 그림을 함께 못 쓰는 브라우저면 그림 없이 다시
    const noImage = () => { delete parts['image/png']; parts['text/html'] = htmlBlob; return navigator.clipboard.write([new ClipboardItem(parts)]) }
    navigator.clipboard.write([new ClipboardItem(parts)]).catch(() => (png ? noImage() : Promise.reject(new Error('write')))).catch(legacy)
  } catch { legacy() }
}
/** 붙여넣은 HTML 안 Iris 복사 내용. 없거나 읽지 못하면 null */
export function readIrisClip(html: string): IrisClipPayload | null {
  const m = /data-iris="([A-Za-z0-9+/=]+)"/.exec(html)
  if (!m) return null
  try {
    const p = JSON.parse(unb64(m[1]!)) as IrisClipPayload
    return p && p.v === 1 && typeof p.stamp === 'string' ? p : null
  } catch { return null }
}
/** 피그마에서 복사한 것인지(피그마 클립보드 형식은 아직 읽지 못해요) */
export const isFigmaClip = (html: string) => html.includes('(figmeta)') || html.includes('(figma)')
