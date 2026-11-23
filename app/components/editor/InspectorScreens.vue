<script setup lang="ts">
import type { ScreenRow } from '~/composables/useEditor'
import { currentGap, guessAxis, type ArrangeOp, type Rect } from '~/canvas/geom'
import ArrangeControls from '~/components/editor/ArrangeControls.vue'

/** 오른쪽 패널 · 디자인 탭(화면을 여러 개 골랐을 때): 고른 범위 기준 정렬 · 균등 분배 · 간격 맞추기 */
const props = defineProps<{ screens: ScreenRow[] }>()
const emit = defineEmits<{ arrange: [op: ArrangeOp] }>()

const rects = computed<Rect[]>(() => props.screens.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })))
const axis = computed(() => guessAxis(rects.value))
const gap = computed(() => currentGap(rects.value, axis.value))
</script>

<template>
  <div class="design">
    <section class="s">
      <div class="sec-h h24"><span>{{ screens.length }} frames</span></div>
      <ul class="names">
        <li v-for="s in screens" :key="s.id" class="tx-meta ellipsis">{{ s.name }} · <span class="num">{{ Math.round(s.width) }} × {{ Math.round(s.height) }}</span></li>
      </ul>
    </section>
    <section class="s">
      <div class="sec-h h24"><span>Position</span></div>
      <ArrangeControls :count="screens.length" :gap="gap" :axis="axis" @op="emit('arrange', $event)" />
    </section>
    <section class="s">
      <p class="tx-meta m0">Shift-click frames or drag on empty canvas to select multiple frames</p>
    </section>
  </div>
</template>

<style scoped>
.design { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s:first-child { box-shadow: none; }
.h24 { height: 24px; padding: 0; }
.names { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 144px; overflow: auto; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.m0 { margin: 0; }
</style>
