<script setup lang="ts">
import { frameCss, frameStroke, migrate } from '~/canvas/schema'
import { LAYER_STORE, type LayerStore } from '~/canvas/store'
import LayerView from '~/components/editor/LayerView.vue'
import { useImageSrc } from '~/canvas/images'

/** 화면 축소 미리보기(읽기 전용): 피그마 화면은 썸네일, Iris 화면은 레이어를 그대로 줄여서 그립니다. 너비에 맞추고 위쪽부터 보여요 */
/** fit: width(기본) = 너비에 맞추고 위쪽부터, cover = 칸을 꽉 채우게 확대하고 가운데(넘치는 곳은 잘라요 — 썸네일로 정한 프레임),
 *  top = 칸을 꽉 채우되 위쪽부터(웹 · 데스크톱 화면 표지 — 화면이 칸보다 납작해도 아래가 비지 않게) */
const props = defineProps<{ screen: { id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path?: string | null; layers?: unknown }; fit?: 'width' | 'cover' | 'top' }>()
const { tokens } = useDesignSystem()
const doc = computed(() => migrate(props.screen.layers))
const thumbImg = useImageSrc()

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
  // 그려진 크기 맞추기(너비 자동 글자 · 인스턴스 Hug)는 썸네일에선 하지 않아요
  setMeasured: () => {},
} as unknown as LayerStore
provide(LAYER_STORE, stub)

const el = ref<HTMLElement | null>(null)
const scale = ref(0)
const off = ref({ x: 0, y: 0 })
let ro: ResizeObserver | undefined
onMounted(() => {
  const fit = () => {
    if (!el.value) return
    const cw = el.value.clientWidth, ch = el.value.clientHeight, W = Math.max(1, props.screen.width), H = Math.max(1, props.screen.height)
    if (props.fit === 'cover' || props.fit === 'top') {
      const k = Math.max(cw / W, ch / H)
      scale.value = k
      off.value = { x: (cw - W * k) / 2, y: props.fit === 'top' ? 0 : (ch - H * k) / 2 }
    } else { scale.value = cw / W; off.value = { x: 0, y: 0 } }
  }
  fit()
  ro = new ResizeObserver(fit)
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div ref="el" class="sthumb" aria-hidden="true" inert>
    <img v-if="screen.source === 'figma' && screen.thumbnail_path" :src="screen.thumbnail_path" alt="" :class="{ cover: fit === 'cover' || fit === 'top', top: fit === 'top' }">
    <div v-else-if="scale" class="page" :style="{ width: screen.width + 'px', height: screen.height + 'px', transform: `translate(${off.x}px, ${off.y}px) scale(${scale})`, ...frameCss(doc.frame, stub.color, thumbImg) }">
      <LayerView v-for="id in doc.rootIds" :key="id" :doc="doc" :id="id" :screen-id="screen.id" />
      <!-- 화면 스트로크(안쪽)는 자식 위에 -->
      <i v-if="frameStroke(doc.frame, stub.color)" class="page-stk" :style="{ boxShadow: frameStroke(doc.frame, stub.color) }" />
    </div>
  </div>
</template>

<style scoped>
.sthumb { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.sthumb img { width: 100%; display: block; }
.sthumb img.cover { height: 100%; object-fit: cover; }
.sthumb img.top { object-position: top center; }
.page { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: var(--iris-paper); overflow: hidden; }
.page-stk { position: absolute; inset: 0; z-index: 3; border-radius: inherit; pointer-events: none; }
</style>
