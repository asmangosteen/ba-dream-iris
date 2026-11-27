<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 단축키 모음(메인 메뉴 'Keyboard shortcuts' · ⌃⇧?): 기능별로 간단히 — 팝업 양식은 main.css 공통(.pop-*, 프로필 편집 창과 같아요).
 * 키는 맥 기호(⌘ ⇧ ⌥ ⌃), 피그마 한국어 자판 기준(PRD/09_FIGMA_PARITY.html). 여기 목록은 편집기(EditorCanvas · EditorToolbar)에 실제로 있는 것만
 */
const emit = defineEmits<{ close: [] }>()
const GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: 'Tools', rows: [
    ['Move', 'V'], ['Scale', 'K'], ['Hand tool', 'H · Space'], ['Frame', 'F'], ['Section', '⇧S'], ['Rectangle', 'R'], ['Ellipse', 'O'],
    ['Line', 'L'], ['Arrow', '⇧L'], ['Pen', 'P'], ['Pencil', '⇧P'], ['Text', 'T'], ['Image/video…', '⇧⌘K'],
  ] },
  { title: 'Edit', rows: [
    ['Undo', '⌘Z'], ['Redo', '⇧⌘Z'], ['Copy', '⌘C'], ['Cut', '⌘X'], ['Paste', '⌘V'], ['Paste over selection', '⇧⌘V'], ['Duplicate', '⌘D'],
    ['Delete', '⌫'], ['Rename', '⌘R'], ['Copy properties', '⌥⌘C'], ['Paste properties', '⌥⌘V'], ['Copy as PNG', '⇧⌘C'], ['Export', '⇧⌘E'],
  ] },
  { title: 'Selection', rows: [
    ['Select all', '⌘A'], ['Select inverse', '⇧⌘A'], ['Select matching layers', '⌥⌘A'], ['Select children', 'Enter'], ['Select parent', '⇧Enter · \\'],
    ['Next · previous layer', 'Tab · ⇧Tab'], ['Deep select', '⌘ click'], ['Duplicate by dragging', '⌥ drag'],
  ] },
  { title: 'Arrange', rows: [
    ['Group', '⌘G'], ['Frame selection', '⌥⌘G'], ['Ungroup', '⇧⌘G'], ['Add auto layout', '⇧A'], ['Remove auto layout', '⌥⇧A'],
    ['Bring forward · to front', '⌘] · ]'], ['Send backward · to back', '⌘[ · ['], ['Align left · right', '⌥A · ⌥D'], ['Align top · bottom', '⌥W · ⌥S'],
    ['Align centers', '⌥H · ⌥V'], ['Tidy up', '⌃⌥T'], ['Flip horizontal · vertical', '⇧H · ⇧V'], ['Use as mask', '⌃⌘M'], ['Flatten', '⌘E'],
    ['Show · hide', '⇧⌘H'], ['Lock · unlock', '⇧⌘L'], ['Move 1px · 10px', '← · ⇧←'], ['Resize 1px · 10px', '⌘← · ⇧⌘←'],
  ] },
  { title: 'Style', rows: [
    ['Opacity 10% … 100%', '⇧1 … ⇧0'], ['Remove fill', '⌥/'], ['Remove stroke', '⇧/'], ['Swap fill and stroke', '⇧X'], ['Pick color', '⌃C'],
  ] },
  { title: 'View', rows: [
    ['Zoom in · out', '+ · −'], ['Zoom to 100%', '⌘0'], ['Zoom to fit', '1'], ['Zoom to selection', '2'], ['Rulers', '⇧R'], ['Layout grids', '⌃G'], ['Show · hide comments', '⇧C'],
    ['Pixel grid', "⇧'"], ['Show · hide UI', '⌘\\'], ['Next · previous frame', 'N · ⇧N'], ['Previous · next page', 'PageUp · PageDown'], ['Keyboard shortcuts', '⌃⇧?'],
  ] },
]
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); emit('close') } }
const box = ref<HTMLElement | null>(null)
onMounted(() => nextTick(() => box.value?.focus()))
</script>

<template>
  <Teleport to="body">
    <div class="pop-overlay" @mousedown.self="emit('close')">
      <section ref="box" role="dialog" aria-modal="true" :aria-label="tr('Keyboard shortcuts')" class="sq pop ks" tabindex="-1" @keydown="onKey">
        <div class="pop-top">
          <h1 class="pop-ttl">{{ tr('Keyboard shortcuts') }}</h1>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
        </div>
        <div v-ovscroll class="pop-body ks-body">
          <section v-for="g in GROUPS" :key="g.title" class="ks-g">
            <h2 class="ks-h">{{ tr(g.title) }}</h2>
            <div v-for="r in g.rows" :key="r[0]" class="ks-r">
              <span class="ks-l">{{ tr(r[0]) }}</span>
              <span class="ks-k"><kbd v-for="(k, i) in r[1].split(' · ')" :key="i" class="sq">{{ tr(k) }}</kbd></span>
            </div>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 공통 팝업(.pop-*) 위에: 폭 640, 기능 묶음을 두 줄(칸)로 */
.ks { --pop-w: 640px; outline: none; }
.ks-body { display: block; columns: 2; column-gap: var(--ref-spacing-12); padding-bottom: var(--ref-spacing-10); }
.ks-g { display: flex; flex-direction: column; min-width: 0; break-inside: avoid; margin-bottom: var(--ref-spacing-10); }
.ks-h { margin: 0 0 var(--ref-spacing-04); font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.ks-r { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); min-height: 26px; border-bottom: 1px solid var(--iris-line); }
.ks-r:last-child { border-bottom: 0; }
.ks-l { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sys-color-neutral-700); }
.ks-k { flex: none; display: flex; gap: var(--ref-spacing-02); }
kbd { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-03); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); font-family: var(--font-family-base); font-size: 11px; line-height: 16px; font-weight: 500; color: var(--sys-color-neutral-800); white-space: nowrap; }
@media (max-width: 680px) { .ks-body { columns: 1; } }
</style>
