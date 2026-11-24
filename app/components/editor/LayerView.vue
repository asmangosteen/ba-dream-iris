<script setup lang="ts">
import { isContainer, isVector, type ArrowHead, type LayerDoc } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { isVideoSrc, useImageSrc } from '~/canvas/images'
import { GHOST_KEY } from '~/canvas/ghost'
import GridOverlay from '~/components/editor/GridOverlay.vue'
import InstanceView from '~/components/editor/InstanceView.vue'
import BooleanView from '~/components/editor/BooleanView.vue'
import { nodePathIn } from '~/canvas/vector'
import { squirclePath } from '~/canvas/squircle'
import { backgroundCss, defaultAlign, effectCss, ellipsePath, hasFill, radiiOf, rectPath, strokeColors, strokeShadows, vectorPath } from '~/canvas/paint'

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
const vector = computed(() => !!n.value && isVector(n.value.type))
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
const strokes = computed(() => (n.value && boxy.value && !smooth.value ? strokeShadows(n.value.style, n.value.type, color) : { outer: [], inner: [] }))
const fx = computed(() => (n.value ? effectCss(n.value.style.effects, color, boxy.value) : null))

const style = computed(() => {
  const v = n.value
  if (!v) return {}
  const s = v.style
  const css: Record<string, string | number | undefined> = {
    left: v.x + 'px',
    top: v.y + 'px',
    width: v.type === 'text' && s.autoWidth ? 'max-content' : v.w + 'px',
    height: v.type === 'text' ? 'auto' : v.h + 'px',
    minHeight: v.type === 'text' ? v.h + 'px' : undefined,
    opacity: s.opacity ?? 1,
    borderRadius: radius.value,
    transform: transform(v.rotation, v.flipX, v.flipY),
    pointerEvents: v.locked ? 'none' : undefined,
    mixBlendMode: s.blend && s.blend !== 'normal' ? s.blend : undefined,
  }
  const sq = smooth.value
  if (boxy.value && v.type !== 'image' && !sq) Object.assign(css, backgroundCss(s, color, imageSrc))
  const e = fx.value!
  const shadow = sq ? [] : [...strokes.value.outer, ...e.outer, ...e.inner]
  if (shadow.length) css.boxShadow = shadow.join(', ')
  // smoothing: 그림자(drop-shadow)는 .smw 가 그려서 여기선 흐림(blur)만
  // 내용을 자르는 프레임(overflow)은 .smw 그림자까지 잘라서, 그땐 그림자를 레이어 자체 filter 로(자기 filter 는 안 잘려요)
  const clipFrame = !!sq && isContainer(v) && s.clip !== false && v.type === 'frame'
  const filters = sq && v.type !== 'image' && !clipFrame ? e.filter.filter((x) => !x.startsWith('drop-shadow')) : e.filter // 이미지는 잘린 그림에 그대로 그림자가 따라가요
  if (filters.length) css.filter = filters.join(' ')
  if (e.backdrop && !sq) { css.backdropFilter = e.backdrop; css.WebkitBackdropFilter = e.backdrop }
  if (isContainer(v) && s.clip !== false && v.type === 'frame') {
    // 내용 자르기도 같은 squircle 모양으로(바깥 그림자가 없을 때 — 있으면 둥근 모서리로 자르고 그림자는 살려요)
    if (sq && !smoothShadow.value) css.clipPath = `path('${sq.path}')`
    else css.overflow = 'hidden'
  }
  if (v.type === 'text') {
    Object.assign(css, {
      color: color(s.color), fontSize: (s.fontSize ?? 16) + 'px', fontWeight: s.fontWeight ?? 400, lineHeight: (s.lineHeight ?? Math.round((s.fontSize ?? 16) * 1.5)) + 'px',
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
  const inset = align === 'inside' ? w / 2 : align === 'outside' ? -w / 2 : 0
  return { d: v.type === 'ellipse' ? ellipsePath(v.w, v.h, inset) : smooth.value ? squirclePath(v.w, v.h, smooth.value.r, smooth.value.sm, inset) : rectPath(v.w, v.h, radiiOf(v.style), inset), w, colors: strokeColors(v.style, color).reverse() }
})
/** smoothing 선(점선 아님): 같은 squircle 경로로 — 안쪽 · 가운데 · 바깥 */
const smoothStroke = computed(() => {
  const v = n.value
  const sq = smooth.value
  if (!v || !sq || v.style.dash || !v.style.strokeWidth) return null
  const colors = strokeColors(v.style, color)
  if (!colors.length) return null
  const w = v.style.strokeWidth
  const align = v.style.strokeAlign ?? defaultAlign(v.type)
  const inset = align === 'inside' ? w / 2 : align === 'outside' ? -w / 2 : 0
  return { d: squirclePath(v.w, v.h, sq.r, sq.sm, inset), w, colors: colors.reverse() }
})
/** smoothing 바탕 층: 칠 + 안쪽 그림자 + 배경 흐림, 모양대로 자르기 */
const smoothBg = computed(() => {
  const v = n.value
  const sq = smooth.value
  if (!v || !sq || v.type === 'image') return null
  const e = fx.value!
  return { ...backgroundCss(v.style, color, imageSrc), clipPath: `path('${sq.path}')`, boxShadow: e.inner.length ? e.inner.join(', ') : undefined, backdropFilter: e.backdrop, WebkitBackdropFilter: e.backdrop }
})
/** 내용을 자르는 smoothing 프레임: 그림자는 레이어 자체 filter 가 그려요 */
const clipsContent = computed(() => { const v = n.value; return !!v && !!smooth.value && v.type === 'frame' && v.style.clip !== false })
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
  const d = vectorPath(v.type, s, v.w, v.h, v.pts, v.closed, v.vnet)
  const closed = v.type === 'polygon' || v.type === 'star' || !!v.closed || (v.type === 'vector' && !!v.vnet?.some((p) => p.closed))
  const w = s.strokeWidth ?? 0
  const align = closed ? (s.strokeAlign ?? defaultAlign(v.type)) : 'center'
  const cols = strokeColors(s, color).reverse() // 아래부터 그려요
  const size = Math.max(8, w * 4)
  return {
    d, closed, w, align, cols, size,
    fill: closed && hasFill(s) ? { clipPath: `path(${v.evenodd ? 'evenodd, ' : ''}'${d}')`, ...backgroundCss(s, color, imageSrc) } : null,
    start: (v.type === 'line' || v.type === 'path' || (v.type === 'vector' && !closed)) && s.arrowStart && s.arrowStart !== 'none' ? s.arrowStart : null,
    end: (v.type === 'line' || v.type === 'path' || (v.type === 'vector' && !closed)) && s.arrowEnd && s.arrowEnd !== 'none' ? s.arrowEnd : null,
    dash: s.dash ? s.dash.join(' ') : undefined,
    cap: s.cap ?? (v.type === 'path' ? 'round' : 'butt'),
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
let orig: { w: number; h: number } | null = null // 고치기 전 크기(실행 취소가 이 크기로 돌아가게)
watch(editingThis, async (on) => {
  if (!on) return
  if (n.value) orig = { w: n.value.w, h: n.value.h }
  await nextTick()
  const el = textEl.value
  if (!el) return
  el.focus()
  const r = document.createRange()
  r.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
}, { immediate: true })
/** 치는 동안: 글자 상자 크기를 바로 맞춰요(기록 없이) — 선택 · 마우스 올림 상자가 글자를 따라 커져요 */
function onInput() {
  const el = textEl.value
  const v = n.value
  if (!el || !v) return
  const sz = textSize(el)
  if (v.style.autoWidth) store.setMeasured(props.screenId, props.id, sz.w, sz.h)
  else store.setMeasured(props.screenId, props.id, v.w, Math.max(orig?.h ?? v.h, sz.h))
}
/** 글자 상자 크기(확대와 상관없는 CSS 크기, 소수까지) */
function textSize(el: HTMLElement) {
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.width) || el.offsetWidth, h: parseFloat(cs.height) || el.offsetHeight }
}
function finish() {
  const el = textEl.value
  if (!el || !n.value) return
  // 치는 동안 맞춘 크기는 되돌려 두고, 아래 update 한 번으로 기록해요(실행 취소하면 처음 크기로)
  if (orig) { n.value.w = orig.w; n.value.h = orig.h; orig = null }
  const text = el.innerText.replace(/\n$/, '')
  store.editing.value = null
  if (!text.trim()) { store.remove(props.screenId, [props.id]); return }
  const patch: Record<string, unknown> = { text }
  const r2 = (v: number) => Math.round(v * 100) / 100
  const sz = textSize(el)
  if (n.value.style.autoWidth) { patch.w = r2(sz.w); patch.h = r2(sz.h) }
  else patch.h = Math.max(n.value.h, r2(sz.h))
  if (text !== n.value.text || patch.w !== n.value.w || patch.h !== n.value.h) store.update(props.screenId, [props.id], patch)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); (e.target as HTMLElement).blur() }
  e.stopPropagation()
}
</script>

<template>
  <div v-if="n && !n.hidden" class="ly" :class="[n.type, { lk: n.locked }]" :data-layer="n.id" :style="ghosted ? { ...style, visibility: 'hidden' } : style">
    <i v-if="smoothBg" class="smw" :style="{ filter: (!clipsContent && smoothShadow) || undefined }"><i class="smb" :style="smoothBg" /></i>
    <span v-if="n.type === 'section'" class="sec-name" :data-sec="n.id">
      <!-- 섹션 이름 두 번 누르기: 그 자리에서 고치기(화면 이름표 · 레이어 목록과 같아요 — Enter 저장 · Esc 취소 · 바깥 누르면 저장) -->
      <input v-if="renamingSec" v-sel-all class="sec-in" :value="n.name" aria-label="Section name" spellcheck="false" @pointerdown.stop @dblclick.stop @keydown.stop="secKey" @blur="secCommit">
      <template v-else>{{ n.name }}</template>
    </span>
    <BooleanView v-if="n.type === 'boolean'" :doc="doc" :node="n" />
    <template v-else-if="isContainer(n)">
      <template v-if="mask">
        <LayerView v-for="c in mask.below" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
        <!-- 마스크: 그 위 형제들을 마스크 모양으로 잘라요(마스크 자체는 그리지 않아요) -->
        <div class="maskwrap" :style="{ clipPath: mask.clip }">
          <LayerView v-for="c in mask.above" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
        </div>
      </template>
      <LayerView v-for="c in mask ? [] : n.children ?? []" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
      <GridOverlay v-if="n.style.grids" :grids="n.style.grids" :w="n.w" :h="n.h" />
    </template>
    <InstanceView v-else-if="n.type === 'instance'" :node="n" :screen-id="screenId" />
    <video v-else-if="n.type === 'image' && video" :src="imageSrc(n.src)" :style="imgStyle" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true" />
    <img v-else-if="n.type === 'image'" :src="imageSrc(n.src)" alt="" draggable="false" :style="imgStyle">
    <template v-else-if="n.type === 'text'">
      <component :is="n.style.list === 'number' ? 'ol' : 'ul'" v-if="blockText && n.style.list" class="txt list" :style="textFill">
        <li v-for="(l, i) in lines" :key="i" :style="{ marginBottom: n.style.paraSpacing ? n.style.paraSpacing + 'px' : undefined }">{{ l || '&nbsp;' }}</li>
      </component>
      <span v-else-if="blockText" class="txt" :style="textFill"><span v-for="(l, i) in lines" :key="i" class="para" :style="{ marginBottom: i < lines.length - 1 ? n.style.paraSpacing + 'px' : undefined }">{{ l || '&nbsp;' }}</span></span>
      <span
        v-else
        ref="textEl"
        :class="['txt', { trunc: n.style.truncate && !editingThis }]"
        :style="editingThis ? undefined : textFill"
        :contenteditable="editingThis ? 'true' : 'false'"
        spellcheck="false"
        @blur="editingThis && finish()"
        @keydown="editingThis && onKey($event)"
        @input="editingThis && onInput()"
        @pointerdown="editingThis && $event.stopPropagation()"
      >{{ n.text }}</span>
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
          stroke-linejoin="round"
          :clip-path="vec.align === 'inside' ? `url(#${mid('c')})` : undefined"
          :mask="vec.align === 'outside' ? `url(#${mid('m')})` : undefined"
          :marker-start="vec.start && i === vec.cols.length - 1 ? `url(#${mid(vec.start)})` : undefined"
          :marker-end="vec.end && i === vec.cols.length - 1 ? `url(#${mid(vec.end)})` : undefined"
        />
        <path v-if="!vec.closed" class="hit" :d="vec.d" fill="none" stroke="transparent" :stroke-width="Math.max(vec.w, 8)" />
      </svg>
    </template>
    <i v-if="strokes.inner.length" class="stk" :style="{ boxShadow: strokes.inner.join(', '), borderRadius: radius }" />
    <svg v-if="smoothStroke" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <path v-for="(c, i) in smoothStroke.colors" :key="i" :d="smoothStroke.d" fill="none" :stroke="c" :stroke-width="smoothStroke.w" />
    </svg>
    <svg v-if="dashed" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <path v-for="(c, i) in dashed.colors" :key="i" :d="dashed.d" fill="none" :stroke="c" :stroke-width="dashed.w" :stroke-dasharray="n.style.dash?.join(' ')" />
    </svg>
  </div>
</template>

<style scoped>
.ly { position: absolute; box-sizing: border-box; font-family: var(--font-family-base); }
/* 마우스 올림 테두리는 EditorCanvas 바깥 층(.hov)이 그려요 — 확대해도 늘 1px */
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
/* Corner smoothing 바탕 · 그림자 층: 내용 뒤에 */
.smw { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
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
.sec-name:has(.sec-in) { box-shadow: 0 0 0 calc(1px / var(--z, 1)) #0D99FF; background: #FFFFFF; pointer-events: auto; }
</style>
