<script setup lang="ts">
/**
 * Iris 로고. kind: 'symbol'(심볼만) · 'horizontal'(심볼 + Iris 글자).
 * 화면 모드에 맞춰 흰 배경용 / 어두운 배경용 파일을 고르고, '기기 설정' 모드에서는 <picture> 로 브라우저가 고릅니다.
 * theme: 화면이 모드를 고정한 곳(로그인 · 랜딩은 늘 라이트)에서는 그 모드로 고정 — 안 그러면 다크 기기에서 흰 로고가 흰 바탕에 묻혀요
 */
const props = withDefaults(defineProps<{ kind?: 'symbol' | 'horizontal'; height?: number; theme?: 'light' | 'dark' }>(), { kind: 'horizontal', height: 16, theme: undefined })
const { mode: userMode } = useTheme()
const mode = computed(() => props.theme ?? userMode.value)
const base = computed(() => (props.kind === 'symbol' ? '/logo/iris-symbol' : '/logo/iris-logo-horizontal'))
const ratio = computed(() => (props.kind === 'symbol' ? 1 : 246.604 / 100))
</script>

<template>
  <picture class="iris-logo" :style="{ height: height + 'px', width: Math.round(height * ratio) + 'px' }">
    <source v-if="mode === 'system'" :srcset="`${base}-dark.svg`" media="(prefers-color-scheme: dark)">
    <img :src="mode === 'dark' ? `${base}-dark.svg` : `${base}.svg`" alt="Iris" :height="height" :width="Math.round(height * ratio)">
  </picture>
</template>

<style scoped>
.iris-logo { display: inline-flex; flex: none; }
.iris-logo img { display: block; width: 100%; height: 100%; }
</style>
