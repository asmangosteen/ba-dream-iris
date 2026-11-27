<script setup lang="ts">
import type { LinkStatus } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 요구사항 반영 상태 아이콘 — Iris 아이콘(PRD/08 '코멘트 · 상태'): 반영 = 파란 체크 원, 일부 = 반쪽 원, 미반영 = 점선 원, 해당 없음 = 회색 빼기 원.
 * 확인 전(문서 화면 표에서 붙은 후보)은 미반영과 같은 점선 원, 색만 더 옅게.
 * 색만 상태마다 달라요(모양은 currentColor)
 */
const props = withDefaults(defineProps<{ status: LinkStatus; size?: number }>(), { size: 12 })
const NAME: Record<LinkStatus, string> = { unchecked: 'status_missing', reflected: 'status_reflected', partial: 'status_partial', missing: 'status_missing', na: 'status_na' }
</script>

<template>
  <EditorIcon :name="NAME[props.status] ?? 'status_missing'" :size="size" :class="['st', status]" />
</template>

<style scoped>
.st { display: block; flex: none; }
.reflected { color: var(--sys-color-brand-primary-default); }
.partial { color: var(--sys-color-neutral-800); }
.missing { color: var(--sys-color-neutral-500); }
.unchecked { color: var(--sys-color-neutral-400); }
.na { color: var(--sys-color-neutral-300); }
</style>
