<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'

/** 화면 모드 고르기: 기기 설정 · 라이트 · 다크 (계정 메뉴 · 에디터 메뉴에서 씀).
    en: 영어 라벨(편집기) · compact: 검은 메뉴 규격(메뉴 글자 열에 맞추고 칸 높이 24) — en 이면 compact 도 켜져요 */
const props = defineProps<{ en?: boolean; compact?: boolean }>()
const { mode, setMode } = useTheme()
const items: ThemeMode[] = ['system', 'light', 'dark']
const EN_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const label = (m: ThemeMode) => tr(EN_LABEL[m]) // 지금 언어로(영어 기본 · 한국어는 사전)
</script>

<template>
  <div :class="['theme', { ed: en || compact }]" role="radiogroup" :aria-label="tr('Theme')">
    <span class="tx-meta lbl">{{ tr('Theme') }}</span>
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
/* 메뉴 안(compact): 라벨을 메뉴 항목 글자 열(안쪽 8)에 맞추고, 위아래 6(Theme · Language 묶음 사이 12) · 라벨 → 칸 4 · 칸 안 고르기 24 · 바탕 neutral-200(입력칸 · 세그먼트와 같은 회색) */
.theme.ed { padding: var(--ref-spacing-05) 0; gap: var(--ref-spacing-04); }
.theme.ed .lbl { padding: 0 var(--ref-spacing-06); }
.theme.ed .seg { --sq-fill: var(--sys-color-neutral-200); border-radius: var(--iris-field-r); padding: var(--ref-spacing-02); }
.theme.ed .seg-item:not(.on) { color: var(--sys-color-neutral-600); }
.theme.ed .seg-item:not(.on):hover { color: var(--sys-color-neutral-800); }
.theme.ed .seg-item { height: 24px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); }
</style>
