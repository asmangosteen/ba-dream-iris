<script setup lang="ts">
import { frameCss, migrate } from '~/canvas/schema'
import { LAYER_STORE, type LayerStore } from '~/canvas/store'
import LayerView from '~/components/editor/LayerView.vue'

/** 화면 축소 미리보기(읽기 전용): 피그마 화면은 썸네일, Iris 화면은 레이어를 그대로 줄여서 그립니다. 너비에 맞추고 위쪽부터 보여요 */
const props = defineProps<{ screen: { id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path?: string | null; layers?: unknown } }>()
const { tokens } = useDesignSystem()
const doc = computed(() => migrate(props.screen.layers))

// LayerView 가 쓰는 것만 담은 읽기 전용 저장소
const stub = {
  editing: ref(null),
  screenId: ref(null),
  color: (v?: string) => {
    if (!v || !v.startsWith('token:')) return v
    const t = (tokens.data.value ?? []).find((x) => x.name === v.slice(6))
    return t?.value
  },
  remove: () => {},
  update: () => {},
} as unknown as LayerStore
provide(LAYER_STORE, stub)

const el = ref<HTMLElement | null>(null)
const scale = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  const fit = () => { if (el.value) scale.value = el.value.clientWidth / Math.max(1, props.screen.width) }
  fit()
  ro = new ResizeObserver(fit)
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div ref="el" class="sthumb" aria-hidden="true" inert>
    <img v-if="screen.source === 'figma' && screen.thumbnail_path" :src="screen.thumbnail_path" alt="">
    <div v-else-if="scale" class="page" :style="{ width: screen.width + 'px', height: screen.height + 'px', transform: `scale(${scale})`, ...frameCss(doc.frame, stub.color) }">
      <LayerView v-for="id in doc.rootIds" :key="id" :doc="doc" :id="id" :screen-id="screen.id" />
    </div>
  </div>
</template>

<style scoped>
.sthumb { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.sthumb img { width: 100%; display: block; }
.page { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: var(--iris-paper); }
</style>
