<script setup lang="ts">
import { gridBands, type LayoutGrid } from '~/canvas/schema'

/** 레이아웃 그리드 그리기(프레임 · 화면 위). ⇧G 로 모두 숨기기 — useLayoutGridsShown() */
const props = defineProps<{ grids?: LayoutGrid[]; w: number; h: number }>()
const shown = useLayoutGridsShown()
const bands = computed(() => gridBands(props.grids, props.w, props.h))
const squares = computed(() => (props.grids ?? []).filter((x) => x.visible !== false && x.type === 'grid'))
</script>

<template>
  <div v-if="shown && (bands.length || squares.length)" class="lg" aria-hidden="true">
    <i v-for="(b, k) in bands" :key="k" :style="{ left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', background: b.c }" />
    <i v-for="(g, k) in squares" :key="'g' + k" class="sqg" :style="{ backgroundImage: `linear-gradient(to right, ${g.color ?? '#FF000019'} 1px, transparent 1px), linear-gradient(to bottom, ${g.color ?? '#FF000019'} 1px, transparent 1px)`, backgroundSize: `${g.size ?? 8}px ${g.size ?? 8}px` }" />
  </div>
</template>

<style scoped>
.lg { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
.lg i { position: absolute; }
.lg .sqg { inset: 0; }
</style>
