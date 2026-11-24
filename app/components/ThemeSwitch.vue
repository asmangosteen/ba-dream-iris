<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'

/** 화면 모드 고르기: 기기 설정 · 라이트 · 다크 (계정 메뉴 · 에디터 메뉴에서 씀). en: 편집기 메뉴(영어 라벨 · 메뉴 글자 열에 맞춤) */
const props = defineProps<{ en?: boolean }>()
const { mode, setMode } = useTheme()
const items: ThemeMode[] = ['system', 'light', 'dark']
const EN_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const label = (m: ThemeMode) => (props.en ? EN_LABEL[m] : THEME_LABEL[m])
</script>

<template>
  <div :class="['theme', { ed: en }]" role="radiogroup" :aria-label="en ? 'Theme' : '화면 모드'">
    <span class="tx-meta lbl">{{ en ? 'Theme' : '화면 모드' }}</span>
    <div class="sq seg">
      <button v-for="m in items" :key="m" type="button" role="radio" :aria-checked="mode === m" :class="['sq', 'seg-item', { on: mode === m }]" @click.stop="setMode(m)"><ThemeIcon :name="m" :size="16" />{{ label(m) }}</button>
    </div>
  </div>
</template>

<style scoped>
.theme { display: flex; flex-direction: column; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-02); }
.lbl { padding: 0 var(--ref-spacing-02); }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); padding: var(--ref-spacing-01, 2px); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); }
.seg-item { justify-content: center; gap: var(--ref-spacing-02); }
.seg-item.on { --sq-fill: var(--sys-color-common-white-emphasis); filter: drop-shadow(0 1px 1px var(--ref-color-gray-900-10)); }
/* 편집기 메뉴 안: 라벨을 메뉴 항목 글자 열(안쪽 8)에 맞추고, 칸은 메뉴 행과 같은 28 · 바탕 neutral-200(입력칸 · 세그먼트와 같은 회색) */
.theme.ed { padding: var(--ref-spacing-02) 0 0; gap: var(--ref-spacing-04); }
.theme.ed .lbl { padding: 0 var(--ref-spacing-06); }
.theme.ed .seg { --sq-fill: var(--sys-color-neutral-200); border-radius: var(--ref-radius-03); padding: var(--ref-spacing-02); }
.theme.ed .seg-item:not(.on) { color: var(--sys-color-neutral-600); }
.theme.ed .seg-item:not(.on):hover { color: var(--sys-color-neutral-800); }
.theme.ed .seg-item { height: 24px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); }
</style>
