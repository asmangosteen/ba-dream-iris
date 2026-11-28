<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import FigmaTokenField from '~/components/editor/FigmaTokenField.vue'

/** 계정 메뉴 '피그마 연결'(관리자) — 팝업 양식은 프로필 편집 창과 같아요(main.css .pop-*) */
const open = defineModel<boolean>('open', { default: false })
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); open.value = false } }
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pop-overlay" @mousedown.self="open = false">
      <section role="dialog" aria-modal="true" aria-labelledby="figmaConnTitle" class="sq pop" style="--pop-w: 480px" @keydown="onKey">
        <div class="pop-top">
          <h1 id="figmaConnTitle" class="pop-ttl">{{ tr('Figma connection') }}</h1>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="open = false"><EditorIcon name="close" :size="16" /></button>
        </div>
        <div class="pop-body">
          <p class="pop-desc">{{ tr('Iris uses one team token to read Figma files when people import screens') }}</p>
          <FigmaTokenField />
        </div>
        <div class="pop-foot">
          <Button size="s" type="tertiary" @click="open = false">{{ tr('Close') }}</Button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
