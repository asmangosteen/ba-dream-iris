<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'

/** 화면 모드 고르기: 기기 설정 · 라이트 · 다크 (계정 메뉴 · 에디터 메뉴에서 씀) */
const { mode, setMode } = useTheme()
const items: ThemeMode[] = ['system', 'light', 'dark']
</script>

<template>
  <div class="theme" role="radiogroup" aria-label="화면 모드">
    <span class="tx-meta lbl">화면 모드</span>
    <div class="seg">
      <button v-for="m in items" :key="m" type="button" role="radio" :aria-checked="mode === m" :class="['sq', 'seg-item', { on: mode === m }]" @click.stop="setMode(m)">{{ THEME_LABEL[m] }}</button>
    </div>
  </div>
</template>

<style scoped>
.theme { display: flex; flex-direction: column; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-02); }
.lbl { padding: 0 var(--ref-spacing-02); }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); padding: var(--ref-spacing-01, 2px); border-radius: var(--ref-radius-04); background: var(--sys-color-neutral-100); }
.seg-item { justify-content: center; }
.seg-item.on { --sq-fill: var(--sys-color-common-white-emphasis); filter: drop-shadow(0 1px 1px var(--ref-color-gray-900-10)); }
</style>
