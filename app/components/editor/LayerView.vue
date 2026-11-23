<script setup lang="ts">
import { isContainer, isVector, type ArrowHead, type LayerDoc } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc } from '~/canvas/images'
import { backgroundCss, defaultAlign, effectCss, ellipsePath, hasFill, radiiOf, rectPath, strokeColors, strokeShadows, vectorPath } from '~/canvas/paint'

/**
 * 화면 안 레이어 하나(와 자식들)를 그립니다. 좌표는 부모 기준, 캔버스 확대는 바깥 transform 이 맡습니다.
 * 상자 도형(프레임 · 섹션 · 사각형 · 원 · 이미지)은 CSS, 선 · 다각형 · 별 · 연필은 SVG — 모두 벡터라 확대해도 선명해요.
 */
defineOptions({ name: 'LayerView' })
const props = defineProps<{ doc: LayerDoc; id: string; screenId: string }>()
const store = useLayerStore()
const imageSrc = useImageSrc()
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
const strokes = computed(() => (n.value && boxy.value ? strokeShadows(n.value.style, n.value.type, color) : { outer: [], inner: [] }))
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
  if (boxy.value && v.type !== 'image') Object.assign(css, backgroundCss(s, color, imageSrc))
  const e = fx.value!
  const shadow = [...strokes.value.outer, ...e.outer, ...e.inner]
  if (shadow.length) css.boxShadow = shadow.join(', ')
  if (e.filter.length) css.filter = e.filter.join(' ')
  if (e.backdrop) { css.backdropFilter = e.backdrop; css.WebkitBackdropFilter = e.backdrop }
  if (isContainer(v) && s.clip !== false && v.type === 'frame') css.overflow = 'hidden'
  if (v.type === 'text') {
    Object.assign(css, {
      color: color(s.color), fontSize: (s.fontSize ?? 16) + 'px', fontWeight: s.fontWeight ?? 400, lineHeight: (s.lineHeight ?? Math.round((s.fontSize ?? 16) * 1.5)) + 'px',
      letterSpacing: s.letterSpacing ? s.letterSpacing + 'px' : undefined, textAlign: s.align ?? 'left', whiteSpace: s.autoWidth ? 'pre' : 'pre-wrap',
      textDecoration: s.decoration === 'underline' ? 'underline' : s.decoration === 'strike' ? 'line-through' : undefined,
      textTransform: s.textCase === 'upper' ? 'uppercase' : s.textCase === 'lower' ? 'lowercase' : s.textCase === 'title' ? 'capitalize' : undefined,
      textShadow: e.text.length ? e.text.join(', ') : undefined,
    })
    if (s.strokeWidth && s.stroke) css.WebkitTextStroke = `${s.strokeWidth}px ${color(s.stroke)}`
  }
  return css
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
  const css: Record<string, string | undefined> = { borderRadius: radius.value, objectFit: fit === 'fit' ? 'contain' : 'cover' }
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
  return { d: v.type === 'ellipse' ? ellipsePath(v.w, v.h, inset) : rectPath(v.w, v.h, radiiOf(v.style), inset), w, colors: strokeColors(v.style, color).reverse() }
})

// 벡터(선 · 다각형 · 별 · 연필)
const vec = computed(() => {
  const v = n.value
  if (!v || !vector.value) return null
  const s = v.style
  const d = vectorPath(v.type, s, v.w, v.h, v.pts, v.closed)
  const closed = v.type === 'polygon' || v.type === 'star' || !!v.closed
  const w = s.strokeWidth ?? 0
  const align = closed ? (s.strokeAlign ?? defaultAlign(v.type)) : 'center'
  const cols = strokeColors(s, color).reverse() // 아래부터 그려요
  const size = Math.max(8, w * 4)
  return {
    d, closed, w, align, cols, size,
    fill: closed && hasFill(s) ? { clipPath: `path('${d}')`, ...backgroundCss(s, color, imageSrc) } : null,
    start: (v.type === 'line' || v.type === 'path') && s.arrowStart && s.arrowStart !== 'none' ? s.arrowStart : null,
    end: (v.type === 'line' || v.type === 'path') && s.arrowEnd && s.arrowEnd !== 'none' ? s.arrowEnd : null,
    dash: s.dash ? s.dash.join(' ') : undefined,
    cap: s.cap ?? (v.type === 'path' ? 'round' : 'butt'),
  }
})
const mid = (k: string) => `${uid}-${k}`.replace(/[^\w-]/g, '')
const markerD: Record<Exclude<ArrowHead, 'none'>, string> = { arrow: 'M1.5 1.5L8.5 5L1.5 8.5', triangle: 'M0 0L10 5L0 10Z', circle: 'M5 1a4 4 0 1 0 0 8a4 4 0 1 0 0-8z' }

// 글자 고치기: 끝나면 내용과 (글자 길이에 맞추는 경우) 크기를 저장, 비우면 레이어를 지웁니다
const textEl = ref<HTMLElement | null>(null)
watch(editingThis, async (on) => {
  if (!on) return
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
function finish() {
  const el = textEl.value
  if (!el || !n.value) return
  const text = el.innerText.replace(/\n$/, '')
  store.editing.value = null
  if (!text.trim()) { store.remove(props.screenId, [props.id]); return }
  const patch: Record<string, unknown> = { text }
  if (n.value.style.autoWidth) { patch.w = Math.ceil(el.offsetWidth); patch.h = Math.ceil(el.offsetHeight) }
  else patch.h = Math.max(n.value.h, Math.ceil(el.offsetHeight))
  if (text !== n.value.text || patch.w !== n.value.w || patch.h !== n.value.h) store.update(props.screenId, [props.id], patch)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); (e.target as HTMLElement).blur() }
  e.stopPropagation()
}
</script>

<template>
  <div v-if="n && !n.hidden" class="ly" :class="[n.type, { lk: n.locked }]" :data-layer="n.id" :style="style">
    <span v-if="n.type === 'section'" class="sec-name">{{ n.name }}</span>
    <template v-if="isContainer(n)">
      <LayerView v-for="c in n.children ?? []" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
    </template>
    <img v-else-if="n.type === 'image'" :src="imageSrc(n.src)" alt="" draggable="false" :style="imgStyle">
    <template v-else-if="n.type === 'text'">
      <component :is="n.style.list === 'number' ? 'ol' : 'ul'" v-if="blockText && n.style.list" class="txt list" :style="textFill">
        <li v-for="(l, i) in lines" :key="i" :style="{ marginBottom: n.style.paraSpacing ? n.style.paraSpacing + 'px' : undefined }">{{ l || '&nbsp;' }}</li>
      </component>
      <span v-else-if="blockText" class="txt" :style="textFill"><span v-for="(l, i) in lines" :key="i" class="para" :style="{ marginBottom: i < lines.length - 1 ? n.style.paraSpacing + 'px' : undefined }">{{ l || '&nbsp;' }}</span></span>
      <span
        v-else
        ref="textEl"
        class="txt"
        :style="editingThis ? undefined : textFill"
        :contenteditable="editingThis ? 'true' : 'false'"
        spellcheck="false"
        @blur="editingThis && finish()"
        @keydown="editingThis && onKey($event)"
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
    <svg v-if="dashed" class="dash" :width="n.w" :height="n.h" overflow="visible" aria-hidden="true">
      <path v-for="(c, i) in dashed.colors" :key="i" :d="dashed.d" fill="none" :stroke="c" :stroke-width="dashed.w" :stroke-dasharray="n.style.dash?.join(' ')" />
    </svg>
  </div>
</template>

<style scoped>
.ly { position: absolute; box-sizing: border-box; font-family: var(--font-family-base); }
.ly:not(.lk):hover:not(:has(.ly:hover)) { outline: calc(1px / var(--z, 1)) solid var(--iris-select, #0D99FF); }
.ly.line, .ly.path { outline-offset: 0; }
.ly.line:hover, .ly.path:hover { outline: none !important; }
.image img { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--sys-color-neutral-100); }
.image { overflow: hidden; }
.txt { display: block; outline: none; min-width: 1px; cursor: inherit; }
.txt[contenteditable='true'] { cursor: text; user-select: text; -webkit-user-select: text; }
.txt.list { margin: 0; padding-left: 1.4em; }
.para { display: block; }
.stk { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.dash { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; }
.vfill { position: absolute; inset: 0; }
.vec { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.vec .hit { pointer-events: stroke; }
.line .vec path, .path .vec path { pointer-events: stroke; }
/* 섹션 이름: 피그마처럼 안쪽 왼쪽 위 이름표. 확대와 상관없이 같은 크기 */
.sec-name { position: absolute; left: calc(8px / var(--z, 1)); top: calc(8px / var(--z, 1)); padding: calc(2px / var(--z, 1)) calc(6px / var(--z, 1)); border-radius: calc(4px / var(--z, 1)); background: rgb(255 255 255 / 85%); font-size: calc(11px / var(--z, 1)); line-height: calc(16px / var(--z, 1)); font-weight: 500; color: #202837; white-space: nowrap; pointer-events: none; z-index: 2; }
</style>
