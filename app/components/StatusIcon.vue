<script setup lang="ts">
import type { LinkStatus } from '~/composables/useIrisData'

/** 요구사항 반영 상태 아이콘 (시안과 같은 단색 모양: 반영 = 파란 체크 원, 일부 = 반쪽 원, 미반영 = 점선 원, 해당 없음 = 회색 빼기) */
const props = withDefaults(defineProps<{ status: LinkStatus; size?: number }>(), { size: 12 })
const style = computed(() => {
  const n = props.size
  return { width: n + 'px', height: n + 'px', '--check': Math.round(n * 0.7) + 'px', '--dash': Math.round(n / 2) + 'px' }
})
</script>

<template>
  <span :class="['st', status]" :style="style" aria-hidden="true" />
</template>

<style scoped>
.st { display: block; flex: none; border-radius: 50%; box-sizing: border-box; }
.reflected { background: var(--sys-color-brand-primary-default) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2.3 2.3 4.7-4.9' stroke='white' stroke-width='1.6' fill='none'/%3E%3C/svg%3E") center / var(--check) no-repeat; }
.partial { border: 1.5px solid var(--sys-color-neutral-800); background: conic-gradient(var(--sys-color-neutral-800) 0 50%, transparent 0); }
.missing { border: 1.5px dashed var(--sys-color-neutral-500); }
.na { background: linear-gradient(#fff, #fff) center / var(--dash) 1.5px no-repeat, var(--sys-color-neutral-300); }
</style>
