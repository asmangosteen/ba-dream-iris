<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { TextButton } from '@ba-dream/design-system'
import type { PageRow, PageSettings } from '~/composables/useEditor'
import ColorField from '~/components/editor/ColorField.vue'

/**
 * 오른쪽 패널 · 아무것도 고르지 않았을 때(피그마의 Page 패널): 페이지 이름 · 캔버스 배경색 · 픽셀 격자 · 확대 · 스타일 바로가기
 */
const props = defineProps<{ page: PageRow; zoom: number; screenCount: number }>()
const emit = defineEmits<{ rename: [name: string]; settings: [patch: PageSettings]; zoom: [z: number | 'fit'] }>()
const { tokens } = useDesignSystem()

const bg = computed(() => props.page.viewport?.background ?? null)
const hex = computed(() => (bg.value && /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : '#F6F7F7'))
// 색 판을 끄는 동안은 화면에만 바로 보이고, 잠시 멈추면(또는 창을 닫으면) 저장해요
const live = ref<string | null>(null)
let bgTimer: ReturnType<typeof setTimeout> | undefined
function liveBg(v: string) {
  live.value = v.slice(0, 7).toUpperCase()
  clearTimeout(bgTimer)
  bgTimer = setTimeout(flushBg, 250)
}
function flushBg() {
  clearTimeout(bgTimer)
  if (live.value && live.value !== bg.value) emit('settings', { background: live.value })
  live.value = null
}
onBeforeUnmount(flushBg)
const PRESETS = ['#F6F7F7', '#E5E5E5', '#FFFFFF', '#1E1E1E', '#101318']
function setHex(e: Event) {
  let v = (e.target as HTMLInputElement).value.trim()
  if (!v) return emit('settings', { background: null })
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) emit('settings', { background: v.toUpperCase() })
  else (e.target as HTMLInputElement).value = bg.value ?? ''
}
const colorCount = computed(() => (tokens.data.value ?? []).filter((t) => t.type === 'color').length)
const textCount = computed(() => (tokens.data.value ?? []).filter((t) => t.type === 'typography').length)
const blur = (e: KeyboardEvent) => {
  const t = e.target as HTMLInputElement
  if (e.key === 'Enter') t.blur()
  // Esc: 고치던 값을 버리고 칸에서 나가요
  else if (e.key === 'Escape') { e.stopPropagation(); t.value = t.dataset.orig ?? t.value; t.blur() }
}
</script>

<template>
  <div class="pg">
    <section class="s first">
      <div class="sec-h h24">
        <span>{{ tr('Page') }} <span class="tx-meta cnt">{{ screenCount === 1 ? tr('1 frame') : tr('{n} frames', { n: screenCount }) }}</span></span>
        <button class="ib s24" :aria-label="bg ? tr('Use default background') : tr('Set background color')" :title="bg ? tr('Reset to default background') : tr('Set background color')" @click="emit('settings', { background: bg ? null : '#E5E5E5' })">
          <EditorIcon :name="bg ? 'minus' : 'plus'" />
        </button>
      </div>
      <div v-if="bg" class="ig w1">
        <label class="sq fld"><ColorField :model-value="live ?? hex" label="Canvas background color" @update:model-value="liveBg" @close="flushBg" /><input :key="bg" :value="(live ?? bg).toUpperCase()" :aria-label="tr('Background color value')"@focus="($event.target as HTMLInputElement).dataset.orig = ($event.target as HTMLInputElement).value" @change="setHex" @keydown="blur"></label>
        <span />
      </div>
      <p v-else class="tx-meta m0">{{ tr('Default background that follows the theme (light or dark)') }}</p>
      <div class="presets" role="group" :aria-label="tr('Common backgrounds')">
        <button v-for="c in PRESETS" :key="c" class="sq sq-clip pre" :class="{ on: bg === c }" :style="{ background: c }" :aria-label="tr('Background {color}', { color: c })" :title="c" @click="emit('settings', { background: c })" />
      </div>
    </section>


    <section class="s">
      <div class="sec-h h24"><span>{{ tr('Styles') }}</span></div>
      <div class="style-row"><span class="sqc dot c" aria-hidden="true" /><span class="tx-body f1">{{ tr('Color styles') }}</span><span class="tx-meta num">{{ colorCount }}</span></div>
      <div class="style-row"><span class="sqc dot t" aria-hidden="true">Ag</span><span class="tx-body f1">{{ tr('Text styles') }}</span><span class="tx-meta num">{{ textCount }}</span></div>
    </section>

  </div>
</template>

<style scoped>
.pg { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
/* 첫 섹션 제목은 Frame · 레이어 인스펙터의 첫 제목과 같은 자리(위 12) */
.s.first { box-shadow: none; }
.h24 { height: 28px; padding: 0; }
.s24 { width: 28px; height: 28px; }
.m0 { margin: 0; }
.presets { display: flex; gap: var(--ref-spacing-04); }
.pre { width: 24px; height: 24px; border-radius: var(--ref-radius-03); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.pre:hover { --sq-line: var(--ref-color-gray-900-20); }
/* 요소가 squircle 로 잘려서 바깥 선 · outline 은 안 보여요 — 고름 · 포커스는 안쪽 선으로 */
.pre.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1.5px; }
.pre:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); }
.cnt { margin-left: var(--ref-spacing-04); font-weight: 400; }
.style-row { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.dot { width: 16px; height: 16px; border-radius: 4px; flex: none; display: grid; place-items: center; }
.dot.c { background: conic-gradient(#2C7BE2 0 25%, #1FA35C 0 50%, #F2A20C 0 75%, #E5484D 0); }
.dot.t { background: var(--sys-color-neutral-100); font-size: 9px; line-height: 16px; font-weight: 600; color: var(--sys-color-neutral-700); }
.f1 { flex: 1; }
.self-start { align-self: flex-start; }
</style>
