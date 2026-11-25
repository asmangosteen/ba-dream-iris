<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ThemeMode } from '~/composables/useTheme'

/**
 * 화면 모드 아이콘: light(해) · dark(달) · system — 편집기 아이콘(theme_light · theme_dark · theme_system).
 * 색은 글자색(currentColor)을 따라요.
 */
withDefaults(defineProps<{ name: ThemeMode; size?: number }>(), { size: 20 })
</script>

<template>
  <EditorIcon class="theme-icon" :name="`theme_${name}`" :size="size" />
</template>

<style scoped>
.theme-icon { display: block; flex: none; }
</style>
