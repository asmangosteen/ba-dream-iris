<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 이미지 크게 보기(공용): 코멘트 · 문서 댓글의 붙인 이미지 썸네일을 누르면 화면 가운데에 크게.
 * 바탕을 누르거나 Esc · × 로 닫아요. 이미지가 여러 장이면 ← → 로 넘겨요(사용자 요청 2026-11-27)
 */
const props = defineProps<{ images: string[] }>()
/** 열린 이미지 순서(없으면 닫힘) */
const index = defineModel<number | null>('index', { default: null })
const src = computed(() => (index.value === null ? null : props.images[index.value] ?? null))
const many = computed(() => props.images.length > 1)
function go(d: number) {
  if (index.value === null || !many.value) return
  index.value = (index.value + d + props.images.length) % props.images.length
}
function close() { index.value = null }
function onKey(e: KeyboardEvent) {
  if (index.value === null) return
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  else if (e.key === 'ArrowRight') go(1)
  else if (e.key === 'ArrowLeft') go(-1)
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="src" class="lb" role="dialog" aria-modal="true" :aria-label="tr('Image')" @pointerdown.self="close">
      <img :src="src" alt="" class="sqc lb-img">
      <button type="button" class="sq lb-btn lb-x" :aria-label="tr('Close')" @click="close"><EditorIcon name="close" :size="18" /></button>
      <template v-if="many">
        <button type="button" class="sq lb-btn lb-prev" :aria-label="tr('Previous image')" @click="go(-1)"><EditorIcon name="chevron_right" :size="18" class="flip" /></button>
        <button type="button" class="sq lb-btn lb-next" :aria-label="tr('Next image')" @click="go(1)"><EditorIcon name="chevron_right" :size="18" /></button>
        <span class="lb-n num">{{ (index ?? 0) + 1 }} / {{ images.length }}</span>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.lb { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 56px; background: rgb(3 9 26 / 72%); animation: lb-in .16s ease; }
@keyframes lb-in { from { opacity: 0; } to { opacity: 1; } }
.lb-img { max-width: 100%; max-height: calc(100vh - 112px); object-fit: contain; border-radius: var(--ref-radius-06); box-shadow: 0 12px 40px rgb(3 9 26 / 40%); }
.lb-btn { position: absolute; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 18px; --sq-fill: rgb(253 253 253 / 14%); color: #FFFFFF; }
.lb-btn:hover { --sq-fill: rgb(253 253 253 / 24%); }
.lb-btn:focus-visible { outline: 2px solid #FFFFFF; outline-offset: 2px; }
.lb-x { top: 12px; right: 12px; }
.lb-prev { left: 12px; top: 50%; transform: translateY(-50%); }
.lb-next { right: 12px; top: 50%; transform: translateY(-50%); }
.flip { transform: rotate(180deg); }
.lb-n { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); color: rgb(253 253 253 / 80%); font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .lb { animation: none; } }
</style>
