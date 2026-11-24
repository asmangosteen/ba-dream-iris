<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'

/**
 * 화면 모드 아이콘: light(해) · dark(달) · system(반쪽 채운 원).
 * 디자인 시스템엔 해 · 달 아이콘이 없어서 같은 굵기(20 칸에 선 1.67)로 그렸어요. 색은 글자색(currentColor)을 따라요.
 */
withDefaults(defineProps<{ name: ThemeMode; size?: number }>(), { size: 20 })
</script>

<template>
  <svg class="theme-icon" :width="size" :height="size" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <g v-if="name === 'light'" stroke="currentColor" stroke-width="1.67" stroke-linecap="round">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 1.9v1.6M10 16.5v1.6M1.9 10h1.6M16.5 10h1.6M4.27 4.27l1.13 1.13M14.6 14.6l1.13 1.13M4.27 15.73l1.13-1.13M14.6 5.4l1.13-1.13" />
    </g>
    <path v-else-if="name === 'dark'" d="M16.6 12.4A7 7 0 1 1 7.6 3.4a7 7 0 0 0 9 9Z" stroke="currentColor" stroke-width="1.67" stroke-linejoin="round" />
    <g v-else>
      <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.67" />
      <path d="M10 3a7 7 0 0 1 0 14Z" fill="currentColor" />
    </g>
  </svg>
</template>

<style scoped>
.theme-icon { display: block; flex: none; }
</style>
