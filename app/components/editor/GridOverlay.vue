<script setup lang="ts">
import type { LayoutGrid } from '~/canvas/schema'

/** 레이아웃 그리드 그리기(프레임 · 화면 위). ⇧G 로 모두 숨기기 — useLayoutGridsShown() */
const props = defineProps<{ grids?: LayoutGrid[]; w: number; h: number }>()
const shown = useLayoutGridsShown()
const bands = computed(() => {
  const out: { x: number; y: number; w: number; h: number; c: string }[] = []
  for (const g of (props.grids ?? []).filter((x) => x.visible !== false && x.type !== 'grid')) {
    const n = Math.max(1, g.count ?? 4), gut = g.gutter ?? 16, m = g.margin ?? 16
    const total = g.type === 'columns' ? props.w : props.h
    const size = Math.max(0, (total - m * 2 - gut * (n - 1)) / n)
    for (let i = 0; i < n; i++) {
      const at = m + i * (size + gut)
      out.push(g.type === 'columns' ? { x: at, y: 0, w: size, h: props.h, c: g.color ?? '#FF000019' } : { x: 0, y: at, w: props.w, h: size, c: g.color ?? '#FF000019' })
    }
  }
  return out
})
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
