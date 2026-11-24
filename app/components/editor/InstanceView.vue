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

/**
 * 넣을 때 · 그릴 때 기본 속성(Iris 가 채우는 값): 필수 값이 없으면 그리지 못하거나(목록 items · 대체 글자 alt) 비어 보이는(아이콘 · 숫자) 컴포넌트.
 * 노드에 저장하지 않고 그릴 때 합쳐요 — 속성 패널은 이 값을 '기본값'으로 보여 주고, 고치면 그 값만 저장돼요
 */
export const INSERT_PROPS: Record<string, Record<string, unknown>> = {
  SegmentedControl: { items: [{ label: 'Day' }, { label: 'Week' }, { label: 'Month' }] },
  Tab: { items: [{ label: 'Tab 1' }, { label: 'Tab 2' }, { label: 'Tab 3' }] },
  Avatar: { alt: 'User', size: 40 },
  NumericBadge: { count: 3 },
  IconButton: { iconName: 'plus', ariaLabel: 'Add' },
  ProgressBar: { value: 40 },
  Slider: { defaultValue: 40 },
  MapCluster: { count: 12 },
  MapPin: { label: 'Place' },
  ToastCard: { message: 'Saved' },
  PopUpCard: { buttonCount: 1, content: 'title-caption', title: 'Title', caption: 'A short caption goes here.', primaryLabel: 'OK' },
  FileRow: { fileName: 'document.pdf', meta: '1.2 MB' },
  ListSort: { label: 'Label', default: 'Value' },
  ListSelect: { default: 'Option' },
  MapPill: { default: 'Place' },
}
/**
 * 넣을 때 크기 — 디자인 시스템 스토리북(ba-dream/design-system, 각 컴포넌트 Playground)의 기준 크기 그대로(2026-11-24 전수 조사).
 * fixed: 그 폭(w)으로 고정, h 가 있으면 높이도 고정(없으면 세로는 Hug) / hug: 내용 크기(Hug)
 * 폭이 100% 인 컴포넌트는 스토리가 감싼 폭(340 · 350 · 390 — 입력칸 TextInput · Dropdown · Select 는 피그마 기준 350 으로 통일), 자체 폭이 있는 것(DatePicker 352 · Toast 350 · PopUp 310)은 그 폭
 */
export const STORY_SIZE: Record<string, { w?: number; h?: number; mode: 'fixed' | 'hug' }> = {
  Button: { mode: 'hug' }, IconButton: { mode: 'hug' }, TextButton: { mode: 'hug' },
  ButtonGroup: { mode: 'fixed', w: 350 }, TextInput: { mode: 'fixed', w: 350 }, TextArea: { mode: 'fixed', w: 350 },
  SearchField: { mode: 'fixed', w: 350 }, Select: { mode: 'fixed', w: 350 }, Dropdown: { mode: 'fixed', w: 350 },
  Checkbox: { mode: 'hug' }, CheckboxCard: { mode: 'fixed', w: 350 }, RadioButton: { mode: 'hug' }, Toggle: { mode: 'hug' },
  Chip: { mode: 'hug' }, FilterChip: { mode: 'hug' }, SegmentedControl: { mode: 'fixed', w: 340 },
  Slider: { mode: 'fixed', w: 350, h: 20 }, Stepper: { mode: 'hug' }, DatePicker: { mode: 'fixed', w: 352 }, TimePicker: { mode: 'hug' },
  SignField: { mode: 'fixed', w: 350 }, UploadField: { mode: 'fixed', w: 350 }, AddMedia: { mode: 'hug' }, FileRow: { mode: 'fixed', w: 350 },
  InputBar: { mode: 'fixed', w: 390 }, ListSelect: { mode: 'fixed', w: 350 },
  TopBar: { mode: 'fixed', w: 390 }, NavBarTop: { mode: 'fixed', w: 390 }, BottomBar: { mode: 'fixed', w: 390 }, Tab: { mode: 'fixed', w: 390 },
  PageControl: { mode: 'hug' }, Pagination: { mode: 'hug' }, StepIndicator: { mode: 'fixed', w: 350 }, Menu: { mode: 'fixed', w: 350, h: 32 },
  Badge: { mode: 'hug' }, NumericBadge: { mode: 'hug' }, Avatar: { mode: 'hug' }, Label: { mode: 'hug' }, Title: { mode: 'fixed', w: 350 },
  ListCommon: { mode: 'fixed', w: 350 }, ListSort: { mode: 'fixed', w: 350 }, ProductCardGrid: { mode: 'fixed', w: 169 }, ProductCardList: { mode: 'fixed', w: 350 },
  PostListItem: { mode: 'fixed', w: 350 }, PostComment: { mode: 'fixed', w: 350 }, PostReply: { mode: 'fixed', w: 350 }, Media: { mode: 'hug' },
  Timeline: { mode: 'fixed', w: 350 }, ProgressBar: { mode: 'fixed', w: 390, h: 2 }, Divider: { mode: 'fixed', w: 320, h: 1 }, Tooltip: { mode: 'hug' },
  NoticeBox: { mode: 'fixed', w: 350 }, Gradient: { mode: 'fixed', w: 390, h: 40 }, ScrollBar: { mode: 'fixed', w: 6, h: 180 }, Footer: { mode: 'fixed', w: 390 },
  MapPin: { mode: 'hug' }, MapPill: { mode: 'hug' }, MapCluster: { mode: 'hug' }, MapMyLocation: { mode: 'hug' },
  MapBottomBar: { mode: 'fixed', w: 350 }, MapBottomGuide: { mode: 'hug' },
  Toast: { mode: 'fixed', w: 350 }, PopUp: { mode: 'fixed', w: 310 }, PopUpCard: { mode: 'fixed', w: 310 }, ToastCard: { mode: 'fixed', w: 350 },
  BottomSheet: { mode: 'fixed', w: 390 }, Dimmed: { mode: 'fixed', w: 390, h: 520 }, Loading: { mode: 'fixed', w: 390 },
  Spinner: { mode: 'hug' }, Skeleton: { mode: 'fixed', w: 200, h: 16 }, EmptyState: { mode: 'fixed', w: 390 }, DoneState: { mode: 'fixed', w: 390 },
}
/** 고정 크기로 넣는 것만(에셋 미리보기 · 캔버스 넣기가 같은 크기로) */
export const INSERT_SIZE: Record<string, { w: number; h?: number }> = Object.fromEntries(
  Object.entries(STORY_SIZE).filter(([, v]) => v.mode === 'fixed' && v.w).map(([k, v]) => [k, { w: v.w!, h: v.h }]),
)
/** Iris 가 채우는 기본 속성 + 고친 값(슬롯 글자 키 제외) — 캔버스 · 에셋 미리보기 · 끄는 모습이 모두 같게 그려요 */
export function instanceProps(name: string | undefined, set?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(name ? INSERT_PROPS[name] : undefined) }
  for (const [k, v] of Object.entries(set ?? {})) if (k !== SLOT_KEY && v !== undefined) out[k] = v
  return out
}
/** 속성의 기본값: Iris 기본(INSERT_PROPS) → 컴포넌트 기본 */
export const instDefault = (name: string | undefined, key: string): unknown => (name && INSERT_PROPS[name]?.[key] !== undefined ? INSERT_PROPS[name]![key] : dsDefault(name, key))

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
  const out = instanceProps(props.node.component, props.node.props)
  const list = dsProps(props.node.component)
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
    <div v-else class="missing"><span>{{ node.component || tr('Instance') }}</span><span class="sub">{{ comp ? tr('Can’t render with these properties') : tr('Component not found') }}</span></div>
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
