<script setup lang="ts">
import type { Paint } from '~/canvas/schema'
import { alphaOf, hexOf, withAlpha } from '~/canvas/color'
import type { CatalogToken } from '~/canvas/tokens'
import PaintPopover from '~/components/editor/PaintPopover.vue'

/**
 * 색 견본 버튼 → 피그마 같은 색 편집 창(단색). 브라우저 기본 색 고르기 대신 써요.
 * v-model 은 '#RRGGBB' · '#RRGGBBAA'. sid 가 있으면 끄는 동안 실행취소를 한 번으로 묶어요.
 * bindable 이면 Libraries 탭에서 고른 토큰을 token 으로 알려요(연결)
 */
const props = withDefaults(defineProps<{ modelValue?: string | null; label: string; sid?: string | null; bindable?: boolean }>(), { modelValue: '#000000', sid: null, bindable: false })
const emit = defineEmits<{ 'update:modelValue': [v: string]; token: [t: CatalogToken]; close: [] }>()

const open = ref(false)
const btn = ref<HTMLElement | null>(null)
const color = computed(() => props.modelValue || '#000000')
const paint = computed<Paint>(() => ({ type: 'solid', color: hexOf(color.value), opacity: alphaOf(color.value) < 1 ? alphaOf(color.value) : undefined }))
function onUpdate(p: Paint) { if (p.type === 'solid') emit('update:modelValue', withAlpha(p.color, p.opacity ?? 1)) }
function close() { open.value = false; emit('close') }
defineExpose({ open: () => (open.value = true) })
</script>

<template>
  <button
    ref="btn"
    class="cf-sw"
    :class="{ on: open }"
    :style="{ background: `linear-gradient(${color}, ${color}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px` }"
    :aria-label="label"
    :title="label"
    :aria-expanded="open"
    @click="open ? close() : (open = true)"
  />
  <PaintPopover v-if="open" :anchor="btn" :paint="paint" :sid="sid" :bindable="bindable" :title="label" @update="onUpdate" @token="(t) => { emit('token', t); close() }" @close="close" />
</template>

<style scoped>
.cf-sw { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); }
.cf-sw.on { box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10), 0 0 0 2px var(--sys-color-brand-primary-default); }
.cf-sw:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
</style>
