<script setup lang="ts">
import type { LayerDoc, LayerNode } from '~/canvas/schema'
import { nodePathIn } from '~/canvas/vector'
import { useLayerStore } from '~/canvas/store'
import { strokeColors } from '~/canvas/paint'

/**
 * 불리언 그룹 그리기(살아 있는 결과). 안쪽 도형들을 경로로 바꿔 SVG 로 합쳐요.
 * 합치기 = 모두 채우기(nonzero), 제외 = evenodd, 빼기 = 맨 아래를 나머지로 가리기(mask), 교차 = 차례로 자르기(clipPath)
 */
const props = defineProps<{ doc: LayerDoc; node: LayerNode }>()
const store = useLayerStore()
const uid = useId().replace(/[^\w-]/g, '')
const kids = computed(() => (props.node.children ?? []).map((c) => props.doc.nodes[c]).filter((c): c is LayerNode => !!c && !c.hidden))
const paths = computed(() => kids.value.map((k) => nodePathIn(props.doc, k, 0, 0)))
const fill = computed(() => store.color(props.node.style.fill) ?? 'transparent')
const strokeC = computed(() => strokeColors(props.node.style, store.color)[0])
const sw = computed(() => props.node.style.strokeWidth ?? 0)
</script>

<template>
  <svg class="bool" :width="Math.max(node.w, 1)" :height="Math.max(node.h, 1)" overflow="visible" aria-hidden="true">
    <template v-if="node.op === 'subtract'">
      <defs>
        <mask :id="uid + 'm'" maskUnits="userSpaceOnUse" x="-1e4" y="-1e4" width="2e4" height="2e4">
          <path :d="paths[0]" fill="white" />
          <path v-for="(d, i) in paths.slice(1)" :key="i" :d="d" fill="black" />
        </mask>
      </defs>
      <path :d="paths[0]" :fill="fill" :mask="`url(#${uid}m)`" />
      <g v-if="strokeC && sw" :mask="`url(#${uid}m)`"><path :d="paths[0]" fill="none" :stroke="strokeC" :stroke-width="sw * 2" /></g>
    </template>
    <template v-else-if="node.op === 'intersect'">
      <defs>
        <clipPath v-for="(d, i) in paths.slice(1)" :id="uid + 'c' + i" :key="i"><path :d="d" /></clipPath>
      </defs>
      <!-- 맨 아래 도형을 나머지로 차례로 잘라요(도형 4개까지) -->
      <g :clip-path="paths.length > 1 ? `url(#${uid}c0)` : undefined">
        <g v-if="paths.length > 2" :clip-path="`url(#${uid}c1)`">
          <g :clip-path="paths.length > 3 ? `url(#${uid}c2)` : undefined"><path :d="paths[0]" :fill="fill" /></g>
        </g>
        <path v-else :d="paths[0]" :fill="fill" />
      </g>
    </template>
    <template v-else>
      <path :d="paths.join('')" :fill="fill" :fill-rule="node.op === 'exclude' ? 'evenodd' : 'nonzero'" :stroke="strokeC && sw ? strokeC : undefined" :stroke-width="sw || undefined" />
    </template>
  </svg>
</template>

<style scoped>
.bool { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
</style>
