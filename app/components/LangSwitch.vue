<script setup lang="ts">
import { LANG_LABEL, type Lang } from '~/composables/useLang'

/** 언어 고르기: English · 한국어 — 계정 메뉴 · 편집기 메인 메뉴(검은 메뉴 안)에서 써요. 모양은 ThemeSwitch compact 와 같아요 */
const { lang, setLang } = useLang()
const items: Lang[] = ['en', 'ko']
</script>

<template>
  <div class="theme ed" role="radiogroup" :aria-label="tr('Language')">
    <span class="tx-meta lbl">{{ tr('Language') }}</span>
    <div class="sq seg">
      <button v-for="l in items" :key="l" type="button" role="radio" :aria-checked="lang === l" :lang="l" :class="['sq', 'seg-item', { on: lang === l }]" @click.stop="setLang(l)">{{ LANG_LABEL[l] }}</button>
    </div>
  </div>
</template>

<style scoped>
.theme { display: flex; flex-direction: column; padding: var(--ref-spacing-05) 0; gap: var(--ref-spacing-04); }
.lbl { padding: 0 var(--ref-spacing-06); }
.seg { display: grid; grid-template-columns: repeat(2, 1fr); padding: var(--ref-spacing-02); border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); }
.seg-item { justify-content: center; height: 24px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); }
.seg-item:not(.on) { color: var(--sys-color-neutral-600); }
.seg-item.on { --sq-fill: var(--sys-color-common-white-emphasis); }
</style>
