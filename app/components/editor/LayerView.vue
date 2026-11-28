<script setup lang="ts">
import { clipsContent, isContainer, isVector, lineHeightCss, type ArrowHead, type LayerDoc } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { textShortcut } from '~/canvas/textKeys'
import { applySpans, offsetOf, rangeOf, rangeValues, readEditable, runsHtml, type RunStyle } from '~/canvas/textRuns'
import { useTextRange } from '~/composables/useTextRange'
import { isVideoSrc, useImageSrc } from '~/canvas/images'
import { GHOST_KEY, ZOOM_KEY } from '~/canvas/ghost'
import GridOverlay from '~/components/editor/GridOverlay.vue'
import InstanceView from '~/components/editor/InstanceView.vue'
import { nodePathIn } from '~/canvas/vector'
import { booleanPath } from '~/canvas/boolean'
import { squirclePath } from '~/canvas/squircle'
import { backgroundCss, rotatedImage, defaultAlign, defaultJoin, effectCss, ellipsePath, hasArc, hasFancyStroke, hasFill, imagePlace, shadowByShape, strokePad, type SvgPaintDef, radiiOf, rectPath, strokePaints, strokeShadows, vectorPath } from '~/canvas/paint'

/**
 * 화면 안 레이어 하나(와 자식들)를 그립니다. 좌표는 부모 기준, 캔버스 확대는 바깥 transform 이 맡습니다.
 * 상자 도형(프레임 · 섹션 · 사각형 · 원 · 이미지)은 CSS, 선 · 다각형 · 별 · 연필은 SVG — 모두 벡터라 확대해도 선명해요.
 */
defineOptions({ name: 'LayerView' })
const props = defineProps<{ doc: LayerDoc; id: string; screenId: string; ghost?: boolean }>()
const store = useLayerStore()
const imageSrc = useImageSrc()
// 화면 밖으로 끄는 중이면 원래 자리는 숨겨요(캔버스가 맨 위에 따로 그려요)
const ghostOf = inject(GHOST_KEY, null)
// 섹션 이름표만 배율을 받아요(확대해도 같은 크기). 미리보기 썸네일 등 배율이 없으면 1
const zoom = inject(ZOOM_KEY, null)
const ghosted = computed(() => !props.ghost && !!ghostOf?.value && ghostOf.value.sid === props.screenId && ghostOf.value.ids.has(props.id))
const video = computed(() => isVideoSrc(n.value?.src))
const uid = useId()
const n = computed(() => props.doc.nodes[props.id])
const editingThis = computed(() => store.editing.value === props.id && store.screenId.value === props.screenId)
const color = (v?: string) => store.color(v)

/** 가운데를 축으로 돌리기 · 뒤집기 */
function transform(r?: number, fx?: boolean, fy?: boolean) {
  const t = [r ? `rotate(${r}deg)` : '', fx ? 'scaleX(-1)' : '', fy ? 'scaleY(-1)' : ''].filter(Boolean).join(' ')
  return t || undefined
}
// 불리언은 계산한 결과 모양을 벡터처럼 그려요(칠 · 선 · 정렬 · 효과가 같아요)
// 원도 호(Arc: 부채꼴 · 고리)가 있으면 경로로 그려요
const vector = computed(() => !!n.value && (isVector(n.value.type) || n.value.type === 'boolean' || (n.value.type === 'ellipse' && hasArc(n.value.style))))
const boxy = computed(() => !!n.value && !vector.value && n.value.type !== 'text')
const radius = computed(() => {
  const v = n.value
  if (!v) return undefined
  if (v.type === 'ellipse') return '50%'
  const r = radiiOf(v.style)
  return r.some(Boolean) ? r.map((x) => x + 'px').join(' ') : undefined
})
/**
 * Corner smoothing(피그마와 같아요): 모서리가 있고 smoothing 이 0 보다 크면 squircle 경로로 그려요.
 * 바탕은 그 모양으로 자른 층(.smb), 그림자는 그 층 바깥(.smw filter), 선은 같은 경로의 SVG(.dash)
 */
const smooth = computed(() => {
  const v = n.value
  if (!v || !boxy.value || v.type === 'instance' || v.type === 'ellipse') return null
  const sm = v.style.smoothing ?? 0
  const r = radiiOf(v.style)
  if (!(sm > 0) || !r.some(Boolean)) return null
  return { sm, r, path: squirclePath(v.w, v.h, r, sm) }
})
/** 상자 선(box-shadow). 변마다 두께는 smoothing 모양이어도 이걸로(변마다 그은 선). 그라디언트 · 이미지 선이 있으면 SVG(fancyBox)로 */
const strokes = computed(() => (n.value && boxy.value && (!smooth.value || n.value.style.strokeSides) && !(hasFancyStroke(n.value.style) && !n.value.style.strokeSides) ? strokeShadows(n.value.style, n.value.type, color) : { outer: [], inner: [] }))
/**
 * 선 칠 전부(맨 아래부터): 단색은 색, 그라디언트 · 이미지는 url(#…) — 정의(defs)는 아래 숨은 SVG 에(피그마처럼 선도 그라디언트 · 이미지).
 * 좌표는 레이어 px(userSpaceOnUse) — 높이 0 인 선(line)에도 그려져요
 */
const sp = computed(() => (n.value ? strokePaints(n.value.style, color, imageSrc, (i) => mid('sp' + i)) : { refs: [], defs: [] }))
/** 선 이미지가 놓이는 상자: 레이어 상자를 선 바깥 끝까지 넓힌 것(pad = 밖으로 나간 두께) — 자르기 편집(ImageCropOverlay)도 같은 상자 */
const sbox = computed(() => { const v = n.value; const pad = v ? strokePad(v.style, v.type) : 0; return { pad, w: Math.max((v?.w ?? 0) + pad * 2, 1), h: Math.max((v?.h ?? 0) + pad * 2, 1) } })
const imgPlace = (d: SvgPaintDef) => (d.kind === 'image' ? imagePlace(d.paint, sbox.value.w, sbox.value.h) : null)
/** 상자 도형(점선 · smoothing 아님)에 그라디언트 · 이미지 선: 같은 모양 경로를 SVG 로 */
const fancyBox = computed(() => {
  const v = n.value
  if (!v || !boxy.value || smooth.value || v.style.dash || v.style.strokeSides || !hasFancyStroke(v.style)) return null
  const w = v.style.strokeWidth ?? 0
  const align = v.style.strokeAlign ?? defaultAlign(v.type)
  const off = align === 'inside' ? w / 2 : align === 'outside' ? -w / 2 : 0
  return { d: v.type === 'ellipse' ? ellipsePath(v.w, v.h, off) : rectPath(v.w, v.h, radiiOf(v.style), off), w }
})
// 그룹 · 칠 없는 프레임은 바깥 그림자가 상자가 아니라 안의 모양을 따라가요(피그마와 같아요 — 맵 핀 그림자가 사각형으로 나오던 것)
const fx = computed(() => (n.value ? effectCss(n.value.style.effects, color, boxy.value, boxy.value && shadowByShape(n.value)) : null))

const style = computed(() => {
  const v = n.value
  if (!v) return {}
  const s = v.style
  const css: Record<string, string | number | undefined> = {
    left: v.x + 'px',
    top: v.y + 'px',
    width: v.type === 'text' && s.autoWidth ? 'max-content' : v.w + 'px',
    // 글자: Fixed size(높이 고정)면 그 높이, 아니면 내용 높이(Auto height · Auto width — 늘고 줄어요, 피그마와 같아요)
    height: v.type === 'text' && !(v.sizeV === 'fixed' && !s.autoWidth) ? 'auto' : v.h + 'px',
    opacity: s.opacity ?? 1,
    borderRadius: radius.value,
    transform: transform(v.rotation, v.flipX, v.flipY),
    pointerEvents: v.locked ? 'none' : undefined,
    mixBlendMode: s.blend && s.blend !== 'normal' ? s.blend : undefined,
  }
  const sq = smooth.value
  if (boxy.value && v.type !== 'image' && !sq) Object.assign(css, backgroundCss(s, color, imageSrc, { w: v.w, h: v.h }))
  const e = fx.value!
  const shadow = sq ? [...strokes.value.outer] : [...strokes.value.outer, ...e.outer, ...e.inner]
  if (shadow.length) css.boxShadow = shadow.join(', ')
  // smoothing: 그림자(drop-shadow)는 .smw 가 그려서 여기선 흐림(blur)만
  // 내용을 자르는 프레임(overflow)은 .smw 그림자까지 잘라서, 그땐 그림자를 레이어 자체 filter 로(자기 filter 는 안 잘려요)
  // (상자 도형의 effectCss 는 바깥 그림자를 box-shadow 로만 주니, 여기선 모양을 따르는 drop-shadow(smoothShadow)를 직접 넣어요 — 빠지면 그림자가 통째로 사라졌어요)
  const clipFrame = !!sq && clipsContent(v)
  const noDrop = e.filter.filter((x) => !x.startsWith('drop-shadow'))
  const filters = sq ? [...noDrop, ...((clipFrame || v.type === 'image') && smoothShadow.value ? [smoothShadow.value] : [])] : e.filter // 이미지 · 자르는 프레임은 잘린 모양 그대로 그림자가 따라가요
  if (filters.length) css.filter = filters.join(' ')
  if (e.backdrop && !sq) { css.backdropFilter = e.backdrop; css.WebkitBackdropFilter = e.backdrop }
  // 선을 SVG 로 그리는 프레임(그라디언트 · 이미지 · 점선 · smoothing 선)은 레이어가 아니라 안쪽 층(.clipw)이 내용을 잘라요 — 선이 같이 잘리지 않게
  if (clipsContent(v) && !clipWrap.value) Object.assign(css, clipCss.value)
  if (v.type === 'text') {
    Object.assign(css, {
      // color '' = 칠 없음(글자가 안 보여요)
      color: s.color === '' ? 'transparent' : color(s.color),
      // 가져온 글꼴(디자인 시스템 밖): 이 컴퓨터에 있으면 그 글꼴, 없으면 Pretendard
      fontFamily: s.fontFamily ? `"${s.fontFamily.replace(/["\\]/g, '')}", var(--font-family-base)` : undefined,
      fontSize: (s.fontSize ?? 16) + 'px', fontWeight: s.fontWeight ?? 400, lineHeight: lineHeightCss(s),
      letterSpacing: s.letterSpacing ? s.letterSpacing + 'px' : undefined, textAlign: s.align ?? 'left', whiteSpace: s.autoWidth ? 'pre' : 'pre-wrap',
      textDecoration: s.decoration === 'underline' ? 'underline' : s.decoration === 'strike' ? 'line-through' : undefined,
      textTransform: s.textCase === 'upper' ? 'uppercase' : s.textCase === 'lower' ? 'lowercase' : s.textCase === 'title' ? 'capitalize' : undefined,
      textShadow: e.text.length ? e.text.join(', ') : undefined,
      textWrap: s.wrap,
      fontVariantNumeric: s.numbers === 'tabular' ? 'tabular-nums' : undefined,
    })
    // 세로 정렬: 글자 상자가 내용보다 높을 때 가운데 · 아래로(위가 기본)
    if (s.valign === 'middle' || s.valign === 'bottom') Object.assign(css, { display: 'flex', flexDirection: 'column', justifyContent: s.valign === 'middle' ? 'center' : 'flex-end' })
    // 말줄임: 한 줄로 자르고 끝에 …(고치는 동안은 다 보여요)
    if (s.truncate && !editingThis.value) Object.assign(css, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
    if (s.strokeWidth && s.stroke) css.WebkitTextStroke = `${s.strokeWidth}px ${color(s.stroke)}`
  }
  return css
})

// 마스크: 자식 중 isMask 인 것(보이는 것) 기준으로 아래 · 위 나누기
const mask = computed(() => {
  const v = n.value
  if (!v || !isContainer(v) || v.type === 'boolean') return null
  const kids = v.children ?? []
  const i = kids.findIndex((c) => props.doc.nodes[c]?.isMask && !props.doc.nodes[c]?.hidden)
  if (i < 0) return null
  const m = props.doc.nodes[kids[i]!]!
  return { below: kids.slice(0, i), above: kids.slice(i + 1), clip: `path(${m.evenodd ? 'evenodd, ' : ''}'${nodePathIn(props.doc, m, 0, 0)}')` }
})
// 텍스트: 여러 칠 · 그라디언트는 글자 모양으로 잘라서
const textFill = computed(() => {
  const s = n.value?.style
  if (!s?.fills?.some((p) => p.visible !== false)) return undefined
  return { ...backgroundCss({ fill: s.color, fills: s.fills }, color, imageSrc), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
})
// 텍스트: 글머리 · 번호 목록 · 문단 간격은 고치지 않을 때만 줄 단위로 그려요
const lines = computed(() => (n.value?.text ?? '').split('\n'))
/** 글자 HTML(글자 구간 서식이 있으면 구간마다 span) — 고치는 칸 · 그냥 보이는 글자 모두 */
const textHtml = computed(() => { const v = n.value; return v ? runsHtml(v.text ?? '', v.spans, v.style, color) : '' })
/** 줄 단위(목록 · 문단 간격)로 그릴 때 i 번째 줄 HTML */
const lineHtml = (i: number) => {
  const v = n.value
  if (!v) return ''
  const ls = lines.value
  let from = 0
  for (let k = 0; k < i; k++) from += ls[k]!.length + 1
  const html = runsHtml(v.text ?? '', v.spans, v.style, color, from, from + ls[i]!.length)
  return html || '&nbsp;'
}
const blockText = computed(() => !editingThis.value && !!n.value && (!!n.value.style.list || !!n.value.style.paraSpacing))

// 이미지: 채우는 방식 · 자르기
const imgStyle = computed(() => {
  const s = n.value?.style
  const fit = s?.fit ?? 'fill'
  const css: Record<string, string | undefined> = { borderRadius: radius.value, objectFit: fit === 'fit' ? 'contain' : 'cover', clipPath: smooth.value ? `path('${smooth.value.path}')` : undefined }
  if (fit === 'crop' && s?.crop) {
    const { scale, x, y } = s.crop
    Object.assign(css, { objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, transform: scale > 1 ? `scale(${scale})` : undefined })
  }
  return css
})

// 점선(상자 도형): SVG 윤곽으로
const dashed = computed(() => {
  const v = n.value
  if (!v || !boxy.value || !v.style.dash || !v.style.strokeWidth) return null
  const w = v.style.strokeWidth
  const align = v.style.strokeAlign ?? defaultAlign(v.type)
  const off = (sw: number) => (align === 'inside' ? sw / 2 : align === 'outside' ? -sw / 2 : 0)
  const cap = v.style.cap ?? 'butt', join = v.style.join ?? 'miter', colors = sp.value.refs
  // 변마다 두께(Top · Bottom · Left · Right · Custom): 변마다 따로 그은 점선
  const sides = v.style.strokeSides
  if (sides && v.type !== 'ellipse') {
    const [t, r, b, l] = sides
    const parts = [
      t ? { d: `M0 ${off(t)}H${v.w}`, w: t } : null,
      r ? { d: `M${v.w - off(r)} 0V${v.h}`, w: r } : null,
      b ? { d: `M0 ${v.h - off(b)}H${v.w}`, w: b } : null,
      l ? { d: `M${off(l)} 0V${v.h}`, w: l } : null,
    ].filter((x): x is { d: string; w: number } => !!x)
    return { parts, colors, cap, join }
  }
  const d = v.type === 'ellipse' ? ellipsePath(v.w, v.h, off(w)) : smooth.value ? squirclePath(v.w, v.h, smooth.value.r, smooth.value.sm, off(w)) : rectPath(v.w, v.h, radiiOf(v.style), off(w))
  return { parts: [{ d, w }], colors, cap, join }
})
/** smoothing 선(점선 아님): 같은 squircle 경로로 — 안쪽 · 가운데 · 바깥 */
const smoothStroke = computed(() => {
  const v = n.value
  const sq = smooth.value
  if (!v || !sq || v.style.dash || v.style.strokeSides || !v.style.strokeWidth) return null
  const colors = sp.value.refs
  if (!colors.length) return null
  const w = v.style.strokeWidth
  const align = v.style.strokeAlign ?? defaultAlign(v.type)
  const inset = align === 'inside' ? w / 2 : align === 'outside' ? -w / 2 : 0
  return { d: squirclePath(v.w, v.h, sq.r, sq.sm, inset), w, colors }
})
/** smoothing 바탕 층: 칠 + 안쪽 그림자 + 배경 흐림, 모양대로 자르기 */
const smoothBg = computed(() => {
  const v = n.value
  const sq = smooth.value
  if (!v || !sq || v.type === 'image') return null
  const e = fx.value!
  return { ...backgroundCss(v.style, color, imageSrc, { w: v.w, h: v.h }), clipPath: `path('${sq.path}')`, boxShadow: e.inner.length ? e.inner.join(', ') : undefined, backdropFilter: e.backdrop, WebkitBackdropFilter: e.backdrop }
})
/**
 * 돌린 Crop 이미지 칠(이미지 편집에서 돌린 것): 배경으로 못 돌려서 따로 그려요 — 레이어 모양(둥글기 · smoothing)대로 잘라서.
 * 맨 위 칠 위치에 그려요(다른 배경 칠 위)
 */
const rotImgs = computed(() => {
  const v = n.value
  if (!v || !boxy.value || v.type === 'image') return null
  const list = (v.style.fills ?? []).filter((p) => p.visible !== false).filter(rotatedImage)
  if (!list.length) return null
  const sq = smooth.value
  return {
    clip: sq ? `path('${sq.path}')` : undefined,
    items: list.map((p) => {
      const c = p.crop!
      const url = imageSrc(p.src)
      return { left: c.x * v.w + 'px', top: c.y * v.h + 'px', width: c.w * v.w + 'px', height: c.h * v.h + 'px', transform: `rotate(${p.rotation}deg)`, backgroundImage: url ? `url("${url}")` : undefined, opacity: p.opacity ?? 1 }
    }),
  }
})
/** 내용 자르기 모양: 같은 squircle 모양으로(바깥 그림자가 없을 때 — 있으면 둥근 모서리로 자르고 그림자는 살려요) */
const clipCss = computed<Record<string, string | undefined>>(() => {
  const sq = smooth.value
  return sq && !smoothShadow.value ? { clipPath: `path('${sq.path}')` } : { overflow: 'hidden' }
})
/**
 * 내용을 자르는 프레임인데 선을 SVG 로 그려요(그라디언트 · 이미지 · 점선 · smoothing 선): 레이어 자체를 자르면 바깥 · 가운데 선이 잘려서,
 * 자식들만 안쪽 층(.clipw)에서 잘라요(피그마와 같아요 — Clip content 는 내용만 자르고 선은 다 보여요)
 */
const clipWrap = computed(() => { const v = n.value; return !!v && isContainer(v) && clipsContent(v) && !!(fancyBox.value || smoothStroke.value || dashed.value) })
/** 내용을 자르는 smoothing 프레임: 그림자는 레이어 자체 filter 가 그려요 */
const clipsSmooth = computed(() => { const v = n.value; return !!v && !!smooth.value && clipsContent(v) })
/** smoothing 그림자: 바탕 층 바깥에 모양을 따라(drop-shadow) */
const smoothShadow = computed(() => {
  const v = n.value
  if (!v || !smooth.value) return ''
  return effectCss(v.style.effects, color, false).filter.filter((x) => x.startsWith('drop-shadow')).join(' ')
})

// 벡터(선 · 다각형 · 별 · 연필)
const vec = computed(() => {
  const v = n.value
  if (!v || !vector.value) return null
  const s = v.style
  const d = v.type === 'boolean' ? booleanPath(props.doc, v) : vectorPath(v.type, s, v.w, v.h, v.pts, v.closed, v.vnet)
  const closed = v.type === 'boolean' || v.type === 'polygon' || v.type === 'star' || v.type === 'ellipse' || !!v.closed || (v.type === 'vector' && !!v.vnet?.some((p) => p.closed))
  const w = s.strokeWidth ?? 0
  const align = closed ? (s.strokeAlign ?? defaultAlign(v.type)) : 'center'
  const cols = sp.value.refs // 아래부터 그려요(그라디언트 · 이미지는 url(#…))
  const size = Math.max(8, w * 4)
  return {
    d, closed, w, align, cols, size,
    fill: closed && hasFill(s) ? { clipPath: `path(${v.evenodd || v.type === 'ellipse' ? 'evenodd, ' : ''}'${d}')`, ...backgroundCss(s, color, imageSrc, { w: v.w, h: v.h }) } : null,
    start: (v.type === 'line' || v.type === 'path' || (v.type === 'vector' && !closed)) && s.arrowStart && s.arrowStart !== 'none' ? s.arrowStart : null,
    end: (v.type === 'line' || v.type === 'path' || (v.type === 'vector' && !closed)) && s.arrowEnd && s.arrowEnd !== 'none' ? s.arrowEnd : null,
    dash: s.dash ? s.dash.join(' ') : undefined,
    cap: s.cap ?? (v.type === 'path' ? 'round' : 'butt'),
    join: s.join ?? defaultJoin(v.type),
  }
})
const mid = (k: string) => `${uid}-${k}`.replace(/[^\w-]/g, '')
const markerD: Record<Exclude<ArrowHead, 'none'>, string> = { arrow: 'M1.5 1.5L8.5 5L1.5 8.5', triangle: 'M0 0L10 5L0 10Z', circle: 'M5 1a4 4 0 1 0 0 8a4 4 0 1 0 0-8z' }

// 글자 고치기: 끝나면 내용과 (글자 길이에 맞추는 경우) 크기를 저장, 비우면 레이어를 지웁니다
/** 섹션 이름 고치기: 캔버스에서 이름표를 두 번 누르면(EditorCanvas onDblAny) 이 상태가 켜져요 */
const renameSec = useState<{ sid: string; id: string } | null>('iris-rename-section', () => null)
const renamingSec = computed(() => renameSec.value?.sid === props.screenId && renameSec.value?.id === props.id)
const vSelAll = { mounted: (el: HTMLInputElement) => nextTick(() => { el.focus(); el.select() }) }
function secCommit(e: Event) {
  if (!renamingSec.value) return
  renameSec.value = null
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && n.value && v !== n.value.name) store.update(props.screenId, [props.id], { name: v })
}
function secKey(e: KeyboardEvent) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  else if (e.key === 'Escape') renameSec.value = null
}
const textEl = ref<HTMLElement | null>(null)
/** 더블클릭으로 글자 편집을 시작한 자리(화면 좌표) — 그 자리 단어를 골라요 */
const editAt = useState<{ x: number; y: number } | null>('iris-edit-at', () => null)
let orig: { w: number; h: number } | null = null // 고치기 전 크기(실행 취소가 이 크기로 돌아가게)
/**
 * 여러 글자를 함께 고른 채 고치기: 같이 고른 다른 글자(다른 프레임 것도)에 치는 대로 똑같이 — 끝낼 때 한 번에 기록(실행 취소 한 번)
 */
let peers: { sid: string; id: string; text: string }[] = []
function peerList() {
  const out: { sid: string; id: string; text: string }[] = []
  const add = (sid: string, id: string) => {
    if (sid === props.screenId && id === props.id) return
    const p = store.doc(sid).nodes[id]
    if (p?.type === 'text' && !p.locked) out.push({ sid, id, text: p.text ?? '' })
  }
  if (store.screenId.value) for (const id of store.layerIds.value) add(store.screenId.value, id)
  for (const x of store.xsel.value) add(x.sid, x.id)
  return out
}
const typed = (el: HTMLElement) => readEditable(el).text
watch(editingThis, async (on) => {
  if (!on) return
  peers = peerList()
  if (n.value) orig = { w: n.value.w, h: n.value.h }
  await nextTick()
  const el = textEl.value
  if (!el) return
  el.focus()
  const sel = window.getSelection()
  // 더블클릭으로 들어왔으면 누른 자리의 단어를, Enter 로 들어왔으면 전체를 골라요(피그마와 같아요)
  const at = editAt.value
  editAt.value = null
  const hit = at ? (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(at.x, at.y) : null
  if (hit && el.contains(hit.startContainer) && sel) {
    sel.removeAllRanges()
    sel.addRange(hit)
    const m = sel as Selection & { modify?: (a: string, d: string, g: string) => void }
    m.modify?.('move', 'backward', 'word')
    m.modify?.('extend', 'forward', 'word')
    return
  }
  const r = document.createRange()
  r.selectNodeContents(el)
  sel?.removeAllRanges()
  sel?.addRange(r)
}, { immediate: true })
/** 글자 붙여넣기: 서식 없이 글자만(피그마와 같아요) */
function onPaste(e: ClipboardEvent) {
  const t = e.clipboardData?.getData('text/plain')
  e.preventDefault()
  e.stopPropagation()
  if (t) document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'))
}
/** 치는 동안: 글자 상자 크기를 바로 맞춰요(기록 없이) — 선택 · 마우스 올림 상자가 글자를 따라 커져요 */
function onInput() {
  const el = textEl.value
  const v = n.value
  if (!el || !v) return
  const sz = textSize(el)
  if (v.style.autoWidth) store.setMeasured(props.screenId, props.id, sz.w, sz.h)
  else if (v.sizeV !== 'fixed') store.setMeasured(props.screenId, props.id, v.w, sz.h)
  // 함께 고른 글자에도 바로 보이게(기록 없이 — 끝낼 때 한 번에 기록)
  const t = typed(el)
  for (const p of peers) { const pn = store.doc(p.sid).nodes[p.id]; if (pn) pn.text = t }
}
/**
 * 너비 자동(Auto width · Hug) 글자는 그려진 글자 크기를 늘 레이어 크기로 맞춰요 — 치는 동안만이 아니라 불러온 글자 · 글꼴이 바뀐 글자도.
 * (저장된 크기가 남아 있으면 그룹 · 정렬 · 간격 재기가 실제보다 큰 상자를 써요: 182 로 보이는데 그룹이 280 이 되던 문제)
 */
const blockEl = ref<HTMLElement | null>(null)
let textRo: ResizeObserver | null = null
function syncTextSize() {
  const v = n.value
  const el = textEl.value ?? blockEl.value
  if (!v || v.type !== 'text' || !el || editingThis.value) return
  if (!v.style.autoWidth && v.sizeV === 'fixed') return
  const sz = textSize(el)
  // Auto width: 너비 · 높이 모두, Auto height: 높이만(글자를 지우면 줄어요)
  if (v.style.autoWidth) store.setMeasured(props.screenId, props.id, sz.w, sz.h)
  else store.setMeasured(props.screenId, props.id, v.w, sz.h)
}
watch([textEl, blockEl], ([a, b]) => {
  textRo?.disconnect()
  const el = a ?? b
  if (!el || typeof ResizeObserver === 'undefined') return
  textRo = new ResizeObserver(() => syncTextSize())
  textRo.observe(el)
}, { flush: 'post' })
onBeforeUnmount(() => textRo?.disconnect())
/** 글자 상자 크기(확대와 상관없는 CSS 크기, 소수까지) */
function textSize(el: HTMLElement) {
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.width) || el.offsetWidth, h: parseFloat(cs.height) || el.offsetHeight }
}
// ---------------------------------------------------------------------------
// 고른 글자 구간(피그마처럼 글자마다 서식): 오른쪽 패널이 그 구간에만 적용해요
// ---------------------------------------------------------------------------
const textRange = useTextRange()
/** 패널 · 팝오버 · 메뉴: 거기를 눌러도 편집은 이어지고 고른 글자는 하이라이트로 남아요 */
const KEEP = 'aside, [role="dialog"], .paint-pop, .tp, .menu, .ctx, .esel-m'
let parked = false
let downKeep = false
const HL = 'iris-text-sel'
type HL = { set: (k: string, v: unknown) => void; delete: (k: string) => void }
const highlights = () => (globalThis as unknown as { CSS?: { highlights?: HL } }).CSS?.highlights
const HighlightCtor = () => (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
function showHighlight(a: number, b: number) {
  const el = textEl.value
  const H = HighlightCtor()
  if (!el || !H || b <= a) return
  try { highlights()?.set(HL, new H(rangeOf(el, a, b))) } catch { /* 못 그려도 동작은 그대로 */ }
}
const hideHighlight = () => { try { highlights()?.delete(HL) } catch { /* 그대로 */ } }
/** 지금 칸 안 글자 · 구간 + 고른 구간으로 패널 상태를 채워요 */
function publish(a: number, b: number) {
  const el = textEl.value
  const v = n.value
  if (!el || !v) return
  const cur = readEditable(el)
  textRange.value = { sid: props.screenId, id: props.id, start: a, end: b, values: rangeValues(v.style, cur.spans, cur.text.length, a, b), apply: applyRange }
}
function onSelChange() {
  const el = textEl.value
  const sel = window.getSelection()
  if (!el || !sel || !sel.rangeCount || parked) return
  const r = sel.getRangeAt(0)
  // 칸 밖으로 옮겨 간 선택(패널 누르기 등)은 무시 — 고른 구간을 그대로 둬요
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return
  const a = offsetOf(el, r.startContainer, r.startOffset), b = offsetOf(el, r.endContainer, r.endOffset)
  if (b > a) publish(a, b)
  else textRange.value = null
}
/** 패널에서 고친 값을 고른 글자에만: 칸의 지금 글자 · 구간을 기록하고(실행 취소 한 번), 다시 그린 뒤 고른 자리를 되살려요 */
function applyRange(patch: RunStyle) {
  const el = textEl.value
  const r = textRange.value
  if (!el || !r || !n.value) return
  const cur = readEditable(el)
  const keep = { a: r.start, b: r.end }
  if (keep.a <= 0 && keep.b >= cur.text.length) {
    // 글자 전부를 골랐으면 레이어 서식 자체를 바꿔요(그 키의 구간 덮어쓰기는 지워져요)
    const base: Record<string, unknown> = { ...patch }
    if ('lineHeight' in patch && !('lineHeightUnit' in patch)) base.lineHeightUnit = undefined
    if (base.decoration === 'none') base.decoration = undefined
    store.batch(() => {
      store.update(props.screenId, [props.id], { text: cur.text, spans: cur.spans.length ? cur.spans : undefined })
      store.style(props.screenId, [props.id], base as Partial<typeof n.value.style>)
    })
  } else {
    const spans = applySpans(cur.text.length, cur.spans, keep.a, keep.b, patch)
    store.update(props.screenId, [props.id], { text: cur.text, spans: spans.length ? spans : undefined })
  }
  nextTick(() => {
    const e2 = textEl.value
    if (!e2) return
    // 글자 크기가 바뀌었을 수 있어요 — 상자 크기 다시 맞추기(기록 없이)
    onInput()
    if (parked) showHighlight(keep.a, keep.b)
    else {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(rangeOf(e2, keep.a, keep.b))
    }
    publish(keep.a, keep.b)
  })
}
function onDocDown(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  // 메뉴 · 팝오버가 열려 있으면 이번 누름은 그 창 닫기만(utils/dismiss.ts) — 글자 고치기를 끝내지 않아요
  downKeep = !!t?.closest?.(KEEP) || dismissPress(e)
  if (!parked) return
  if (textEl.value?.contains(t)) { parked = false; hideHighlight(); return }
  if (downKeep) return
  // 캔버스 다른 곳: 편집 끝
  parked = false
  hideHighlight()
  finish()
}
function onBlur() {
  // 패널 · 팝오버를 눌러서 빠져나간 것이고 고른 글자가 있으면: 편집은 그대로(고른 글자는 하이라이트로)
  if (downKeep && textRange.value && textRange.value.id === props.id) {
    parked = true
    showHighlight(textRange.value.start, textRange.value.end)
    return
  }
  finish()
}
function onParkedKey(e: KeyboardEvent) {
  if (!parked || e.key !== 'Escape') return
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
  parked = false
  hideHighlight()
  finish()
}
function endRange() {
  if (textRange.value?.id === props.id) textRange.value = null
  parked = false
  hideHighlight()
}
watch(editingThis, (on) => {
  if (on) {
    document.addEventListener('selectionchange', onSelChange)
    document.addEventListener('pointerdown', onDocDown, true)
    window.addEventListener('keydown', onParkedKey, true)
  } else {
    document.removeEventListener('selectionchange', onSelChange)
    document.removeEventListener('pointerdown', onDocDown, true)
    window.removeEventListener('keydown', onParkedKey, true)
    endRange()
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelChange)
  document.removeEventListener('pointerdown', onDocDown, true)
  window.removeEventListener('keydown', onParkedKey, true)
  endRange()
})
function finish() {
  const el = textEl.value
  if (!el || !n.value) return
  // 치는 동안 맞춘 크기는 되돌려 두고, 아래 update 한 번으로 기록해요(실행 취소하면 처음 크기로)
  if (orig) { n.value.w = orig.w; n.value.h = orig.h; orig = null }
  const { text, spans } = readEditable(el)
  endRange()
  store.editing.value = null
  // 함께 고른 글자: 원래 글자로 돌려 둔 뒤 아래에서 한 번에 기록
  const ps = peers
  peers = []
  for (const p of ps) { const pn = store.doc(p.sid).nodes[p.id]; if (pn) pn.text = p.text }
  if (!text.trim()) { store.remove(props.screenId, [props.id]); return }
  const patch: Record<string, unknown> = { text, spans: spans.length ? spans : undefined }
  const r2 = (v: number) => Math.round(v * 100) / 100
  const sz = textSize(el)
  if (n.value.style.autoWidth) { patch.w = r2(sz.w); patch.h = r2(sz.h) }
  else if (n.value.sizeV !== 'fixed') patch.h = r2(sz.h)
  const self = () => { if (text !== n.value?.text || JSON.stringify(patch.spans ?? []) !== JSON.stringify(n.value?.spans ?? []) || patch.w !== n.value?.w || patch.h !== n.value?.h) store.update(props.screenId, [props.id], patch) }
  const others = ps.filter((p) => p.text !== text)
  if (!others.length) { self(); return }
  store.batch(() => {
    self()
    const bySid = new Map<string, string[]>()
    for (const p of others) bySid.set(p.sid, [...(bySid.get(p.sid) ?? []), p.id])
    for (const [sid, ids] of bySid) store.mutate(sid, (d) => { for (const id of ids) { const pn = d.nodes[id]; if (pn) pn.text = text } })
  })
}
function onKey(e: KeyboardEvent) {
  // 한글 조합 중에는 브라우저에 맡겨요(Esc · Enter 가 조합을 깨지 않게)
  if (e.isComposing || e.keyCode === 229) { e.stopPropagation(); return }
  const mod = e.metaKey || e.ctrlKey
  // 확대 · 축소(⌘+ ⌘− ⌘0)는 캔버스가 받아요 — 브라우저 화면 확대가 되지 않게
  if (mod && !e.altKey && ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract'].includes(e.code)) return
  if (e.key === 'Escape' || (e.key === 'Enter' && mod)) { e.preventDefault(); (e.target as HTMLElement).blur() }
  // Tab: 편집에서 빠져나가지 않고 탭 글자(피그마와 같아요)
  else if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); document.execCommand('insertText', false, '\t') }
  // 글자를 골랐으면 ⌘B · ⌘U · ⇧⌘X 는 고른 글자에만(피그마와 같아요)
  else if (mod && !e.altKey && textRange.value?.id === props.id && ((!e.shiftKey && (e.code === 'KeyB' || e.code === 'KeyU')) || (e.shiftKey && e.code === 'KeyX'))) {
    e.preventDefault()
    const v = textRange.value.values
    if (e.code === 'KeyB') applyRange({ fontWeight: v.fontWeight !== 'Mixed' && Number(v.fontWeight) >= 600 ? 400 : 700 })
    else if (e.code === 'KeyU') applyRange({ decoration: v.decoration === 'underline' ? ('none' as never) : 'underline' })
    else applyRange({ decoration: v.decoration === 'strike' ? 'none' as never : 'strike' })
  }
  // 글자 단축키(⌘B · ⌘U · 정렬 · 크기 · 목록 등): 브라우저 서식 대신 레이어에
  else if (textShortcut(e, store, props.screenId, [props.id])) e.preventDefault()
  // 브라우저 서식(⌘I 등)은 저장되지 않아서 막아요
  else if (mod && !e.altKey && ['KeyI'].includes(e.code)) e.preventDefault()
  e.stopPropagation()
}
</script>

<template>
  <div v-if="n && !n.hidden" class="ly" :class="[n.type, { lk: n.locked }]" :data-layer="n.id" :style="ghosted ? { ...style, visibility: 'hidden' } : style">
    <i v-if="smoothBg" class="smw" :style="{ filter: (!clipsSmooth && smoothShadow) || undefined }"><i class="smb" :style="smoothBg" /></i>
    <i v-if="rotImgs" class="rimg" :style="{ clipPath: rotImgs.clip }" aria-hidden="true"><i v-for="(st, k) in rotImgs.items" :key="k" :style="st" /></i>
    <span v-if="n.type === 'section'" class="sec-name" :data-sec="n.id" :style="{ '--z': zoom ?? 1 }">
      <!-- 섹션 이름 두 번 누르기: 그 자리에서 고치기(화면 이름표 · 레이어 목록과 같아요 — Enter 저장 · Esc 취소 · 바깥 누르면 저장) -->
      <input v-if="renamingSec" v-sel-all class="sec-in" :value="n.name" :aria-label="tr('Section name')" spellcheck="false" @pointerdown.stop @dblclick.stop @keydown.stop="secKey" @blur="secCommit">
      <template v-else>{{ n.name }}</template>
    </span>
    <!-- 자식 층: 평소엔 display: contents(없는 것과 같아요), 선을 SVG 로 그리는 자르기 프레임이면 여기서 잘라요(.clipw) -->
    <div v-if="isContainer(n) && n.type !== 'boolean'" :class="clipWrap ? 'clipw' : 'kids'" :style="clipWrap ? { ...clipCss, borderRadius: radius } : undefined">
      <template v-if="mask">
        <LayerView v-for="c in mask.below" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
        <!-- 마스크: 그 위 형제들을 마스크 모양으로 잘라요(마스크 자체는 그리지 않아요) -->
        <div class="maskwrap" :style="{ clipPath: mask.clip }">
          <LayerView v-for="c in mask.above" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
        </div>
      </template>
      <LayerView v-for="c in mask ? [] : n.children ?? []" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
      <GridOverlay v-if="n.style.grids" :grids="n.style.grids" :w="n.w" :h="n.h" />
    </div>
    <InstanceView v-else-if="n.type === 'instance'" :node="n" :screen-id="screenId" />
    <video v-else-if="n.type === 'image' && video" :src="imageSrc(n.src)" :style="imgStyle" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true" />
    <img v-else-if="n.type === 'image'" :src="imageSrc(n.src)" alt="" draggable="false" :style="imgStyle">
    <template v-else-if="n.type === 'text'">
      <component :is="n.style.list === 'number' ? 'ol' : 'ul'" v-if="blockText && n.style.list" class="txt list" :style="textFill">
        <li v-for="(l, i) in lines" :key="i" :style="{ marginBottom: n.style.paraSpacing ? n.style.paraSpacing + 'px' : undefined }" v-html="lineHtml(i)" />
      </component>
      <span v-else-if="blockText" ref="blockEl" class="txt" :style="textFill"><span v-for="(l, i) in lines" :key="i" class="para" :style="{ marginBottom: i < lines.length - 1 ? n.style.paraSpacing + 'px' : undefined }" v-html="lineHtml(i)" /></span>
      <span
        v-else
        ref="textEl"
        :class="['txt', { trunc: n.style.truncate && !editingThis }]"
        :style="editingThis ? undefined : textFill"
        :contenteditable="editingThis ? 'true' : 'false'"
        spellcheck="false"
        @blur="editingThis && onBlur()"
        @keydown="editingThis && onKey($event)"
        @input="editingThis && onInput()"
        @paste="editingThis && onPaste($event)"
        @pointerdown="editingThis && $event.stopPropagation()"
        v-html="textHtml"
      />
    </template>
    <template v-else-if="vec">
      <div v-if="vec.fill" class="vfill" :style="vec.fill" />
      <svg class="vec" :width="Math.max(n.w, 1)" :height="Math.max(n.h, 1)" overflow="visible" aria-hidden="true">
        <defs>
          <clipPath v-if="vec.align === 'inside'" :id="mid('c')"><path :d="vec.d" /></clipPath>
          <mask v-if="vec.align === 'outside'" :id="mid('m')" maskUnits="userSpaceOnUse" :x="-1e4" :y="-1e4" width="2e4" height="2e4"><rect :x="-1e4" :y="-1e4" width="2e4" height="2e4" fill="white" /><path :d="vec.d" fill="black" /></mask>
          <template v-for="k in [vec.start, vec.end]" :key="String(k)">
            <marker v-if="k" :id="mid(k)" viewBox="0 0 10 10" :refX="k === 'arrow' ? 8.5 : k === 'triangle' ? 8 : 5" refY="5" markerUnits="userSpaceOnUse" :markerWidth="vec.size" :markerHeight="vec.size" orient="auto-start-reverse">
              <path :d="markerD[k]" :fill="k === 'arrow' ? 'none' : vec.cols[vec.cols.length - 1]" :stroke="k === 'arrow' ? vec.cols[vec.cols.length - 1] : 'none'" :stroke-width="(vec.w * 10) / vec.size" stroke-linecap="round" stroke-linejoin="round" />
            </marker>
          </template>
        </defs>
        <path
          v-for="(c, i) in vec.cols"
          :key="i"
          :d="vec.d"
          fill="none"
          :stroke="c"
          :stroke-width="vec.align === 'center' ? vec.w : vec.w * 2"
          :stroke-dasharray="vec.dash"
          :stroke-linecap="vec.cap"
          :stroke-linejoin="vec.join"
          :clip-path="vec.align === 'inside' ? `url(#${mid('c')})` : undefined"
          :mask="vec.align === 'outside' ? `url(#${mid('m')})` : undefined"
          :marker-start="vec.start && i === vec.cols.length - 1 ? `url(#${mid(vec.start)})` : undefined"
          :marker-end="vec.end && i === vec.cols.length - 1 ? `url(#${mid(vec.end)})` : undefined"
        />
        <path v-if="!vec.closed" class="hit" :d="vec.d" fill="none" stroke="transparent" :stroke-width="Math.max(vec.w, 8)" />
      </svg>
    </template>
    <i v-if="strokes.inner.length" class="stk" :style="{ boxShadow: strokes.inner.join(', '), borderRadius: radius }" />
    <!-- 선의 그라디언트 · 이미지 정의(레이어 px 좌표) -->
    <svg v-if="sp.defs.length" class="sdefs" width="0" height="0" aria-hidden="true">
      <defs>
        <template v-for="d in sp.defs" :key="d.id">
          <linearGradient v-if="d.kind === 'linear'" :id="d.id" gradientUnits="userSpaceOnUse" :x1="d.x1 * n.w" :y1="d.y1 * n.h" :x2="d.x2 * n.w" :y2="d.y2 * n.h">
            <stop v-for="(st, k) in d.stops" :key="k" :offset="st.offset" :stop-color="st.color" :stop-opacity="st.opacity" />
          </linearGradient>
          <radialGradient
            v-else-if="d.kind === 'radial'" :id="d.id" gradientUnits="userSpaceOnUse" :cx="d.cx * n.w" :cy="d.cy * n.h" :r="Math.max(d.r * n.w, 0.01)"
            :gradientTransform="n.w ? `translate(${d.cx * n.w} ${d.cy * n.h}) scale(1 ${n.h / n.w}) translate(${-d.cx * n.w} ${-d.cy * n.h})` : undefined"
          >
            <stop v-for="(st, k) in d.stops" :key="k" :offset="st.offset" :stop-color="st.color" :stop-opacity="st.opacity" />
          </radialGradient>
          <!-- 이미지 선: 선 바깥 끝까지 넓힌 상자(sbox) 기준으로 채우기와 같은 자리(Fill · Fit · Crop + 돌리기 · Tile) -->
          <pattern v-else-if="imgPlace(d)?.tile" :id="d.id" patternUnits="userSpaceOnUse" :x="-sbox.pad" :y="-sbox.pad" :width="imgPlace(d)!.w" :height="imgPlace(d)!.h">
            <image :href="d.href" x="0" y="0" :width="imgPlace(d)!.w" :height="imgPlace(d)!.h" :opacity="d.opacity" preserveAspectRatio="none" />
          </pattern>
          <pattern v-else :id="d.id" patternUnits="userSpaceOnUse" :x="-sbox.pad" :y="-sbox.pad" :width="sbox.w" :height="sbox.h">
            <image
              v-if="imgPlace(d)" :href="d.href" :x="imgPlace(d)!.x" :y="imgPlace(d)!.y" :width="imgPlace(d)!.w" :height="imgPlace(d)!.h" :opacity="d.opacity" preserveAspectRatio="none"
              :transform="imgPlace(d)!.rot ? `rotate(${imgPlace(d)!.rot} ${imgPlace(d)!.x + imgPlace(d)!.w / 2} ${imgPlace(d)!.y + imgPlace(d)!.h / 2})` : undefined"
            />
            <image v-else :href="d.href" x="0" y="0" :width="sbox.w" :height="sbox.h" :opacity="d.opacity" :preserveAspectRatio="d.fit === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice'" />
          </pattern>
        </template>
      </defs>
    </svg>
    <svg v-if="fancyBox" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <path v-for="(c, i) in sp.refs" :key="i" :d="fancyBox.d" fill="none" :stroke="c" :stroke-width="fancyBox.w" />
    </svg>
    <svg v-if="smoothStroke" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <path v-for="(c, i) in smoothStroke.colors" :key="i" :d="smoothStroke.d" fill="none" :stroke="c" :stroke-width="smoothStroke.w" />
    </svg>
    <svg v-if="dashed" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <template v-for="(c, i) in dashed.colors" :key="i"><path v-for="(p, j) in dashed.parts" :key="j" :d="p.d" fill="none" :stroke="c" :stroke-width="p.w" :stroke-dasharray="n.style.dash?.join(' ')" :stroke-linecap="dashed.cap" :stroke-linejoin="dashed.join" /></template>
    </svg>
  </div>
</template>

<style scoped>
.ly { position: absolute; box-sizing: border-box; font-family: var(--font-family-base); }
/* 마우스 올림 테두리는 EditorCanvas 바깥 층(.hover-ol)이 그려요 — 확대해도 늘 1px */
.ly.line, .ly.path { outline-offset: 0; }
.ly.line:hover, .ly.path:hover { outline: none !important; }
.image img, .image video { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--sys-color-neutral-100); }
.image { overflow: hidden; }
.txt { display: block; outline: none; min-width: 1px; cursor: inherit; }
.txt[contenteditable='true'] { cursor: text; user-select: text; -webkit-user-select: text; }
.txt.list { margin: 0; padding-left: 1.4em; }
.txt.trunc { overflow: hidden; text-overflow: ellipsis; }
.para { display: block; }
.stk { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.kids { display: contents; }
.clipw { position: absolute; inset: 0; }
.sdefs { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
/* Corner smoothing 바탕 · 그림자 층: 내용 뒤에 */
.smw { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
/* 돌린 Crop 이미지: 레이어 모양대로 잘라요(둥근 모서리는 border-radius, smoothing 은 clip-path) */
.rimg { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; z-index: 0; }
.rimg > i { position: absolute; background-size: 100% 100%; background-repeat: no-repeat; }
.smb { position: absolute; inset: 0; }
.dash { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; }
.vfill { position: absolute; inset: 0; }
.maskwrap { position: absolute; inset: 0; overflow: visible; }
.vec { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.vec .hit { pointer-events: stroke; }
.line .vec path, .path .vec path { pointer-events: stroke; }
/* 섹션 이름: 피그마처럼 안쪽 왼쪽 위 이름표. 확대와 상관없이 같은 크기 */
.sec-name { position: absolute; left: calc(8px / var(--z, 1)); top: calc(8px / var(--z, 1)); padding: calc(2px / var(--z, 1)) calc(6px / var(--z, 1)); border-radius: calc(4px / var(--z, 1)); background: rgb(255 255 255 / 85%); font-size: calc(11px / var(--z, 1)); line-height: calc(16px / var(--z, 1)); font-weight: 500; color: #202837; white-space: nowrap; z-index: 2; cursor: default; }
.sec-in { width: calc(160px / var(--z, 1)); padding: 0; border: 0; outline: none; background: transparent; font: inherit; color: inherit; }
.sec-name:has(.sec-in) { box-shadow: 0 0 0 calc(1px / var(--z, 1)) #0E97FC; background: #FFFFFF; pointer-events: auto; }
</style>
