<script setup lang="ts">
import ScreenThumb from '~/components/editor/ScreenThumb.vue'

/**
 * 페이지 썸네일(프로젝트 첫 화면 — 시안 1): 그 페이지 화면들을 편집기에 놓인 자리 그대로 줄여서 칸 안에 맞춰 그려요.
 * 화면이 많으면 왼쪽 위부터 몇 개만(넓게 퍼져 있어도 너무 작아지지 않게)
 */
export interface ThumbScreen { id: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; thumbnail_path?: string | null; layers?: unknown }
const props = defineProps<{ screens: ThumbScreen[] }>()

const MAX = 6
const shown = computed(() => [...props.screens].sort((a, b) => a.y - b.y || a.x - b.x).slice(0, MAX))
const box = computed(() => {
  const s = shown.value
  if (!s.length) return null
  const x = Math.min(...s.map((v) => v.x)), y = Math.min(...s.map((v) => v.y))
  return { x, y, w: Math.max(...s.map((v) => v.x + v.width)) - x, h: Math.max(...s.map((v) => v.y + v.height)) - y }
})
const el = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let ro: ResizeObserver | undefined
onMounted(() => {
  const m = () => { if (el.value) size.value = { w: el.value.clientWidth, h: el.value.clientHeight } }
  m()
  ro = new ResizeObserver(m)
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
/** 칸 안쪽 여백 12% 를 두고 맞춰요 */
const view = computed(() => {
  const b = box.value, { w, h } = size.value
  if (!b || !w || !h) return null
  const pad = 0.12
  const k = Math.min((w * (1 - pad * 2)) / b.w, (h * (1 - pad * 2)) / b.h)
  return { k, ox: (w - b.w * k) / 2 - b.x * k, oy: (h - b.h * k) / 2 - b.y * k }
})
</script>

<template>
  <span ref="el" class="pthumb" aria-hidden="true">
    <template v-if="view">
      <span
        v-for="s in shown"
        :key="s.id"
        class="pt-frame"
        :style="{ left: view.ox + s.x * view.k + 'px', top: view.oy + s.y * view.k + 'px', width: s.width * view.k + 'px', height: s.height * view.k + 'px' }"
      ><ScreenThumb :screen="s" /></span>
    </template>
  </span>
</template>

<style scoped>
.pthumb { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
/* 작업 캔버스 안 화면처럼 각진 프레임(캔버스 안은 squircle 예외) */
.pt-frame { position: absolute; overflow: hidden; background: var(--iris-paper); box-shadow: 0 0 0 0.5px rgb(3 9 26 / 10%); }
</style>
