<script setup lang="ts">
/**
 * Iris 로고. kind: 'symbol'(심볼만) · 'horizontal'(심볼 + Iris 글자).
 * 흰 배경용 · 어두운 배경용 그림을 둘 다 두고, 지금 화면에 실제로 적용된 모드(<html data-theme> · 기기 설정)를 CSS 가 보고 하나만 보여요 —
 * 모드 값(쿠키)을 따로 읽던 때는 바꾼 직후 · 페이지를 오갈 때 가끔 반대 로고가 남았어요(사용자 요청 2026-11-27).
 * theme: 화면이 모드를 고정한 곳(로그인 · 랜딩)에서는 그 모드로 고정
 */
const props = withDefaults(defineProps<{ kind?: 'symbol' | 'horizontal'; height?: number; theme?: 'light' | 'dark' }>(), { kind: 'horizontal', height: 16, theme: undefined })
const base = computed(() => (props.kind === 'symbol' ? '/logo/iris-symbol' : '/logo/iris-logo-horizontal'))
const ratio = computed(() => (props.kind === 'symbol' ? 1 : 246.604 / 100))
const w = computed(() => Math.round(props.height * ratio.value))
</script>

<template>
  <span class="iris-logo" :style="{ height: height + 'px', width: w + 'px' }">
    <img v-if="theme" :src="theme === 'dark' ? `${base}-dark.svg` : `${base}.svg`" alt="Iris" :height="height" :width="w">
    <template v-else>
      <img class="lt" :src="`${base}.svg`" alt="Iris" :height="height" :width="w">
      <img class="dk" :src="`${base}-dark.svg`" alt="" aria-hidden="true" :height="height" :width="w">
    </template>
  </span>
</template>

<style scoped>
.iris-logo { display: inline-flex; flex: none; }
.iris-logo img { display: block; width: 100%; height: 100%; }
.dk { display: none !important; }
:root[data-theme="dark"] .lt { display: none !important; }
:root[data-theme="dark"] .dk { display: block !important; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .lt { display: none !important; }
  :root:not([data-theme="light"]) .dk { display: block !important; }
}
</style>
