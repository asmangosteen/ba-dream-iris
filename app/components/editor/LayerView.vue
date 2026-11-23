<script setup lang="ts">
import type { LayerDoc } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { useImageSrc } from '~/canvas/images'

/** 화면 안 레이어 하나(와 자식들)를 그립니다. 좌표는 부모 기준, 캔버스 확대는 바깥 transform 이 맡습니다 */
defineOptions({ name: 'LayerView' })
const props = defineProps<{ doc: LayerDoc; id: string; screenId: string }>()
const store = useLayerStore()
const imageSrc = useImageSrc()
const n = computed(() => props.doc.nodes[props.id])
const editingThis = computed(() => store.editing.value === props.id && store.screenId.value === props.screenId)

/** 가운데를 축으로 돌리기 · 뒤집기 */
function transform(r?: number, fx?: boolean, fy?: boolean) {
  const t = [r ? `rotate(${r}deg)` : '', fx ? 'scaleX(-1)' : '', fy ? 'scaleY(-1)' : ''].filter(Boolean).join(' ')
  return t || undefined
}
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
    borderRadius: s.radii ? s.radii.map((r) => r + 'px').join(' ') : s.radius ? s.radius + 'px' : undefined,
    transform: transform(v.rotation, v.flipX, v.flipY),
    pointerEvents: v.locked ? 'none' : undefined,
  }
  if (v.type === 'frame' || v.type === 'rect') css.background = store.color(s.fill)
  if (s.stroke && s.strokeWidth) css.boxShadow = `inset 0 0 0 ${s.strokeWidth}px ${store.color(s.stroke)}`
  if (v.type === 'frame' && s.clip !== false) css.overflow = 'hidden'
  if (v.type === 'text') {
    Object.assign(css, { color: store.color(s.color), fontSize: (s.fontSize ?? 16) + 'px', fontWeight: s.fontWeight ?? 400, lineHeight: (s.lineHeight ?? Math.round((s.fontSize ?? 16) * 1.5)) + 'px', textAlign: s.align ?? 'left', whiteSpace: s.autoWidth ? 'pre' : 'pre-wrap' })
  }
  return css
})

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
    <template v-if="n.type === 'frame'">
      <LayerView v-for="c in n.children ?? []" :key="c" :doc="doc" :id="c" :screen-id="screenId" />
    </template>
    <img v-else-if="n.type === 'image'" :src="imageSrc(n.src)" alt="" draggable="false" :style="{ borderRadius: style.borderRadius }">
    <span
      v-else-if="n.type === 'text'"
      ref="textEl"
      class="txt"
      :contenteditable="editingThis ? 'true' : 'false'"
      spellcheck="false"
      @blur="editingThis && finish()"
      @keydown="editingThis && onKey($event)"
      @pointerdown="editingThis && $event.stopPropagation()"
    >{{ n.text }}</span>
  </div>
</template>

<style scoped>
.ly { position: absolute; box-sizing: border-box; font-family: var(--font-family-base); }
.ly:not(.lk):hover:not(:has(.ly:hover)) { outline: calc(1px / var(--z, 1)) solid var(--sys-color-brand-primary-default); }
.image img { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--sys-color-neutral-100); }
.txt { display: block; outline: none; min-width: 1px; cursor: inherit; }
.txt[contenteditable='true'] { cursor: text; user-select: text; -webkit-user-select: text; }
</style>
