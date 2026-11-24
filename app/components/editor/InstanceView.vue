<script lang="ts">
import * as DS from '@ba-dream/design-system'
import type { Component } from 'vue'
import meta, { type DsPropMeta } from 'virtual:iris-ds-props'
import DsStatusBar from '~/components/ds/DsStatusBar.vue'
import IrisTopBar from '~/components/ds/IrisTopBar.vue'

/** 글자로 채우는 default 슬롯 값을 node.props 에 담는 키(속성 이름과 겹치지 않게 #) */
export const SLOT_KEY = '#default'

/**
 * 패키지(@ba-dream/design-system 1.0.0) 빌드에서 빈 자리로 들어간 컴포넌트를 Iris 가 대신 그려요.
 * Status Bar 가 빈 컴포넌트(render: () => null)라 Status Bar 와, 그걸 품은 Top Bar 를 바꿔요. 속성 이름 · 기본값은 패키지와 같아요
 */
const OVERRIDE: Record<string, Component> = { StatusBar: DsStatusBar, TopBar: IrisTopBar }

/** 컴포넌트 이름 → 실제 디자인 시스템 컴포넌트. 모르는 이름이면 null */
export function dsComponent(name: string | undefined): Component | null {
  if (name && OVERRIDE[name]) return OVERRIDE[name]!
  const c = name ? (DS as Record<string, unknown>)[name] : null
  return c && (typeof c === 'object' || typeof c === 'function') ? (c as Component) : null
}

/** 빌드 때 d.ts 에서 뽑은 속성 목록(virtual:iris-ds-props) */
export const dsProps = (name: string | undefined): DsPropMeta[] => (name ? meta[name] ?? [] : [])

/** 런타임 컴포넌트의 기본값 — 글자 · 숫자 · 참거짓만(객체 기본값은 함수라 건너뜀) */
export function dsDefault(name: string | undefined, key: string): unknown {
  const p = (dsComponent(name) as { props?: Record<string, { default?: unknown } | undefined> } | null)?.props?.[key]
  const d = p && typeof p === 'object' ? p.default : undefined
  return typeof d === 'function' ? undefined : d
}

const SLOT_COPY: Record<string, string> = { DateCell: '1', TabItem: 'Tab', SegmentedControlItem: 'Segment', Timeline: 'Text' }
/** 슬롯이 비면 아무것도 안 보이는 컴포넌트(버튼 · 배지 등)에 넣을 기본 글자. 스스로 Figma 문구를 보여 주는 컴포넌트('비우면 …')는 undefined */
export function slotFallback(name: string | undefined): string | undefined {
  const s = dsProps(name).find((p) => p.slot)
  if (!s || !name || s.doc?.includes('비우면')) return undefined
  return SLOT_COPY[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (_, c: string) => ' ' + c.toLowerCase())
}
</script>

<script setup lang="ts">
import type { LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'

/** 디자인 시스템 컴포넌트 인스턴스 — 실제 컴포넌트를 그리되 캔버스에서는 누르거나 입력할 수 없게(inert) 둡니다.
 *  고르기 · 끌기는 바깥 .ly(LayerView)가 받아요. Hug 축은 그려진 크기를 재서 store.setMeasured 로 맞춥니다 */
const props = defineProps<{ node: LayerNode; screenId: string }>()
const store = useLayerStore()

const comp = computed(() => dsComponent(props.node.component))
// 필수 데이터가 없어 그리다 멈추는 컴포넌트(예: weeks 없는 Month)가 캔버스 전체를 깨지 않게 여기서 막아요
const failed = ref(false)
onErrorCaptured(() => { failed.value = true; return false })
watch(() => [props.node.component, props.node.props], () => { failed.value = false }, { deep: true })
const hugH = computed(() => props.node.sizeH === 'hug')
const hugV = computed(() => props.node.sizeV === 'hug')

const bound = computed(() => {
  const out: Record<string, unknown> = {}
  const list = dsProps(props.node.component)
  for (const [k, v] of Object.entries(props.node.props ?? {})) {
    if (k === SLOT_KEY || v === undefined) continue
    out[k] = v
  }
  // 띄우는 컴포넌트(PopUp · BottomSheet · Toast)가 body 로 빠져나가지 않게 — 캔버스에서는 상자 안 기준(absolute)으로
  const pos = list.find((p) => p.name === 'position')
  const posNow = out.position ?? dsDefault(props.node.component, 'position')
  if (posNow === 'fixed' && pos?.options?.includes('absolute')) out.position = 'absolute'
  return out
})
const slotText = computed(() => {
  const v = props.node.props?.[SLOT_KEY]
  return typeof v === 'string' ? v : slotFallback(props.node.component)
})

/** 스케일(K) 배율: 컴포넌트를 이 배율로 확대해 그려요. 고정 · 채우기 축은 확대 전 크기를 나눠서 상자에 딱 맞게 */
const scale = computed(() => props.node.instScale ?? 1)
const boxStyle = computed(() => (scale.value === 1 ? undefined : {
  transform: `scale(${scale.value})`, transformOrigin: '0 0',
  width: hugH.value ? undefined : props.node.w / scale.value + 'px',
  height: hugV.value ? undefined : props.node.h / scale.value + 'px',
}))
// Hug: 내용 크기를 재서 저장(기록 없이). 고정 · 채우기 축은 저장된 값 그대로
const box = ref<HTMLElement | null>(null)
let ro: ResizeObserver | undefined
function measure(w: number, h: number) {
  const n = props.node
  if (!hugH.value && !hugV.value) return
  // 그려진 크기 그대로(소수 둘째 자리) — 올림하면 선택선이 컴포넌트보다 커서 떠 보여요
  const r2 = (v: number) => Math.round(v * 100) / 100
  const nw = hugH.value ? r2(w * scale.value) : n.w
  const nh = hugV.value ? r2(h * scale.value) : n.h
  if (nw < 1 || nh < 1) return // 띄운 오버레이처럼 크기가 없는 내용은 그대로 둡니다
  store.setMeasured(props.screenId, n.id, nw, nh)
}
onMounted(() => {
  if (!box.value) return
  ro = new ResizeObserver(([e]) => {
    if (!e) return
    const b = e.borderBoxSize?.[0]
    measure(b ? b.inlineSize : (e.target as HTMLElement).offsetWidth, b ? b.blockSize : (e.target as HTMLElement).offsetHeight)
  })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
// 크기 방식을 hug 로 바꾸면 바로 다시 재요(내용 크기가 그대로면 ResizeObserver 가 안 불려요)
watch([hugH, hugV, scale], () => nextTick(() => { if (box.value) { const cs = getComputedStyle(box.value); measure(parseFloat(cs.width) || box.value.offsetWidth, parseFloat(cs.height) || box.value.offsetHeight) } }))
</script>

<template>
  <!-- inert + pointer-events:none — 안쪽 버튼 · 입력칸은 반응하지 않고, 누르면 바깥 .ly 가 받아요 -->
  <div class="inst" inert aria-hidden="true">
    <div v-if="comp && !failed" ref="box" data-preview :class="['box', { hw: hugH, hh: hugV }]" :style="boxStyle">
      <component :is="comp" v-bind="bound">
        <template v-if="slotText !== undefined" #default>{{ slotText }}</template>
      </component>
    </div>
    <div v-else class="missing"><span>{{ node.component || 'Instance' }}</span><span class="sub">{{ comp ? 'Can’t render with these properties' : 'Component not found' }}</span></div>
  </div>
</template>

<style scoped>
/* contain: layout — position:fixed 인 내용(Bottom Bar 등)도 이 상자를 기준으로 그려져요 */
.inst { position: absolute; inset: 0; pointer-events: none; user-select: none; contain: layout; }
.box { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
.box.hw { width: max-content; }
.box.hh { height: max-content; }
/* 고정 · 채우기 축은 상자에 맞춰 늘립니다 */
.box:not(.hw) > :deep(*) { width: 100%; box-sizing: border-box; }
.box:not(.hh) > :deep(*) { flex: 1 1 auto; min-height: 0; }
.missing { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden; font-size: 12px; color: var(--sys-color-neutral-600, #8C9199); background: var(--sys-color-neutral-100, #F4F5F7); box-shadow: inset 0 0 0 1px var(--sys-color-neutral-300, #D0D4DA); }
.missing .sub { font-size: 10px; color: var(--sys-color-neutral-500, #A0A5AD); }
</style>
