<script lang="ts">
/** 컴포넌트 이름(또는 코드 이름 · 별칭)을 미리보기 종류로 바꿉니다. 모르는 이름이면 null */
export type PreviewKind = 'button' | 'textfield' | 'badge' | 'tab' | 'toggle' | 'checkbox' | 'radio' | 'listitem' | 'card' | 'bottomsheet' | 'toast' | 'navigationbar' | 'bottomnavigation'

const KIND_BY_KEY: Record<string, PreviewKind> = {
  button: 'button', btn: 'button', 버튼: 'button',
  textfield: 'textfield', textinput: 'textfield', input: 'textfield', 입력칸: 'textfield',
  badge: 'badge', 배지: 'badge',
  tab: 'tab', tabs: 'tab', 탭: 'tab',
  toggle: 'toggle', switch: 'toggle', 토글: 'toggle',
  checkbox: 'checkbox', 체크박스: 'checkbox',
  radio: 'radio', radiobutton: 'radio', 라디오: 'radio',
  listitem: 'listitem', list: 'listitem', 목록: 'listitem',
  card: 'card', 카드: 'card',
  bottomsheet: 'bottomsheet', sheet: 'bottomsheet', 바텀시트: 'bottomsheet',
  toast: 'toast', snackbar: 'toast', 토스트: 'toast',
  navigationbar: 'navigationbar', navbar: 'navigationbar', topbar: 'navigationbar', header: 'navigationbar',
  bottomnavigation: 'bottomnavigation', bottomnav: 'bottomnavigation', tabbar: 'bottomnavigation', bottombar: 'bottomnavigation',
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./]/g, '')

export function previewKind(names: (string | null | undefined)[]): PreviewKind | null {
  for (const n of names) {
    if (!n) continue
    const k = KIND_BY_KEY[norm(n)]
    if (k) return k
  }
  return null
}
</script>

<script setup lang="ts">
import { Avatar, Badge, Button, Checkbox, Chip, Divider, Icon, IconButton, Label, NumericBadge, PageControl, Pagination, ProgressBar, RadioButton, SearchField, Skeleton, Slider, Spinner, Stepper, TextArea, TextButton, TextInput, Toast, Toggle, Tooltip } from '@ba-dream/design-system'

import { INSERT_SIZE, dsComponent, instanceProps, slotFallback } from '~/components/editor/InstanceView.vue'

const props = defineProps<{ names: (string | null | undefined)[]; label: string }>()
const kind = computed(() => previewKind(props.names))
const initials = computed(() => props.label.replace(/[^A-Za-z0-9가-힣]/g, '').slice(0, 2) || '?')

// 손으로 만든 미리보기가 없는 컴포넌트: 캔버스에 넣었을 때와 같은 실제 컴포넌트(같은 기본 속성)를 칸에 맞게 줄여서.
// 이니셜(Se · Dr …) 자리 표시는 디자인 시스템에 없는 이름일 때만
const realName = computed(() => [props.label === 'Calendar' ? 'DatePicker' : null, ...props.names].find((n): n is string => !!n && !!dsComponent(n)) ?? null)
const real = computed(() => (realName.value ? dsComponent(realName.value) : null))
const realProps = computed(() => { const p = instanceProps(realName.value ?? undefined); if (p.position === 'fixed') p.position = 'absolute'; return p })
const realText = computed(() => (realName.value ? slotFallback(realName.value) : undefined))
// 스토리북 기준 크기(고정 폭 · 정해진 높이) 그대로 그려서 칸에 맞게 줄여요 — 캔버스에 넣을 때와 같은 모습
const realSize = computed(() => { const z = realName.value ? INSERT_SIZE[realName.value] : undefined; return z ? { width: z.w + 'px', maxWidth: 'none', ...(z.h ? { height: z.h + 'px' } : {}) } : undefined })
const host = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const fit = ref(1)
let ro: ResizeObserver | undefined
function measure() {
  const h = host.value, i = inner.value
  if (!h || !i) return
  const w = i.scrollWidth, ht = i.scrollHeight
  if (!w || !ht) return
  fit.value = Math.min(1, (h.clientWidth - 24) / w, (h.clientHeight - 16) / ht)
}
onMounted(() => { if (inner.value) { ro = new ResizeObserver(measure); ro.observe(inner.value); if (host.value) ro.observe(host.value); measure() } })
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <!-- 컴포넌트 미리보기: 위계 가이드 예외 영역(data-preview) — 실제 크기로 보여 줍니다. 누르거나 고를 수 없게 inert -->
  <span data-preview inert :class="['pv', kind ?? 'unknown']" aria-hidden="true">
    <template v-if="kind === 'button'">
      <Button type="primary" size="l">{{ tr('Apply') }}</Button>
    </template>
    <template v-else-if="kind === 'textfield'">
      <span class="pad-x"><TextInput :label="tr('Name')" :placeholder="tr('Enter your name')" size="m" /></span>
    </template>
    <template v-else-if="kind === 'badge'">
      <Badge theme="brand" type="alpha">{{ tr('Featured') }}</Badge>
      <Badge theme="gray" type="alpha">{{ tr('Coupon') }}</Badge>
      <Badge theme="destructed" type="alpha">20%</Badge>
    </template>
    <template v-else-if="kind === 'tab'">
      <span class="tab on">{{ tr('Everything') }}</span><span class="tab">{{ tr('Ongoing') }}</span><span class="tab">{{ tr('Completed') }}</span>
    </template>
    <template v-else-if="kind === 'toggle'">
      <Toggle size="l" :checked="true" :aria-label="tr('On')" />
      <Toggle size="l" :checked="false" :aria-label="tr('Off')" />
    </template>
    <template v-else-if="kind === 'checkbox'">
      <Checkbox :size="24" :checked="true" :aria-label="tr('Selected')" />
      <Checkbox :size="24" :checked="false" :aria-label="tr('Not selected')" />
    </template>
    <template v-else-if="kind === 'radio'">
      <RadioButton size="l" :checked="true" :aria-label="tr('Selected')" />
      <RadioButton size="l" :checked="false" :aria-label="tr('Not selected')" />
    </template>
    <template v-else-if="kind === 'listitem'">
      <span class="li"><i class="sqc lead" /><span class="li-t">{{ tr('Notification settings') }}</span><Icon name="chevron_right" :size="16" /></span>
      <span class="li"><i class="sqc lead" /><span class="li-t">{{ tr('Manage account') }}</span><Icon name="chevron_right" :size="16" /></span>
    </template>
    <template v-else-if="kind === 'card'">
      <span class="sq card"><span class="sqc card-img" /><span class="card-col"><span class="card-t">{{ tr('Model A') }}</span><span class="card-s">{{ tr('From ₩89,000/mo') }}</span></span></span>
    </template>
    <template v-else-if="kind === 'bottomsheet'">
      <span class="sq sheet"><span class="grab" /><span class="sheet-t">{{ tr('Choose a plan') }}</span><span class="sqc sheet-btn">{{ tr('Select') }}</span></span>
    </template>
    <template v-else-if="kind === 'toast'">
      <span class="pad-x"><Toast type="success" :message="tr('Saved')" /></span>
    </template>
    <template v-else-if="kind === 'navigationbar'">
      <span class="nav"><Icon name="chevron_left" :size="20" /><span class="nav-t">{{ tr('Apply') }}</span><Icon name="close" :size="20" /></span>
    </template>
    <template v-else-if="kind === 'bottomnavigation'">
      <span class="bnav">
        <span v-for="(t, i) in ['Home', 'My garage', 'Community', 'My page']" :key="t" :class="['bn', { on: i === 0 }]"><i class="sqc" /><span>{{ tr(t) }}</span></span>
      </span>
    </template>
    <!-- 기본 탑재 목록(dsCatalog)의 나머지 컴포넌트: 실제 컴포넌트를 기본 속성으로 -->
    <template v-else-if="label === 'IconButton'"><IconButton icon-name="search" size="l" type="tertiary" :ariaLabel="tr('Search')" /><IconButton icon-name="plus" size="l" type="primary" :ariaLabel="tr('Add')" /></template>
    <template v-else-if="label === 'TextButton'"><TextButton size="l" color="blue">{{ tr('See more') }}</TextButton><TextButton size="l" color="gray">{{ tr('Cancel') }}</TextButton></template>
    <template v-else-if="label === 'ButtonGroup'"><Button type="tertiary" size="l">{{ tr('Previous') }}</Button><Button type="primary" size="l">{{ tr('Next') }}</Button></template>
    <template v-else-if="label === 'SearchField'"><span class="pad-x"><SearchField size="m" type="contained" :placeholder="tr('Search vehicles and models')" /></span></template>
    <template v-else-if="label === 'TextArea'"><span class="pad-x"><TextArea :label="tr('Memo')" :placeholder="tr('Write something')" /></span></template>
    <template v-else-if="label === 'Chip'"><Chip :selected="true">{{ tr('Everything') }}</Chip><Chip>{{ tr('Scooter') }}</Chip><Chip>{{ tr('Motorcycle') }}</Chip></template>
    <template v-else-if="label === 'Slider'"><span class="pad-x"><Slider :default-value="40" :aria-label="tr('Range')" /></span></template>
    <template v-else-if="label === 'Stepper'"><Stepper :default-value="2" :min="0" :max="9" /></template>
    <template v-else-if="label === 'ProgressBar'"><span class="pad-x"><ProgressBar :value="60" :aria-label="tr('Progress')" /></span></template>
    <template v-else-if="label === 'NumericBadge'"><NumericBadge :count="3" theme="destructed" /><NumericBadge :count="128" theme="brand" /></template>
    <template v-else-if="label === 'Avatar'"><Avatar alt="바드림" :size="40" /><Avatar alt="이리스" :size="32" /></template>
    <template v-else-if="label === 'Divider'"><span class="pad-x"><Divider /></span></template>
    <template v-else-if="label === 'Spinner' || label === 'Loading'"><Spinner size="l" /></template>
    <template v-else-if="label === 'Skeleton'"><span class="pad-x col"><Skeleton shape="text" width="70%" /><Skeleton shape="text" width="45%" /></span></template>
    <template v-else-if="label === 'Label'"><Label essential>{{ tr('Name') }}</Label></template>
    <template v-else-if="label === 'PageControl'"><PageControl :selection="1" /></template>
    <template v-else-if="label === 'Pagination'"><Pagination :current="2" :total="5" /></template>
    <template v-else-if="label === 'Tooltip'"><Tooltip>{{ tr('Tap here') }}</Tooltip></template>
    <template v-else-if="real">
      <span ref="host" class="real-host"><span ref="inner" class="real" :style="{ transform: `scale(${fit})`, ...realSize }"><component :is="real" v-bind="realProps"><template v-if="realText !== undefined" #default>{{ realText }}</template></component></span></span>
    </template>
    <template v-else>
      <span class="sq ph">{{ initials }}</span>
    </template>
  </span>
</template>

<style scoped>
.pv { display: flex; align-items: center; justify-content: center; gap: var(--ref-spacing-06); width: 100%; height: 100%; box-sizing: border-box; pointer-events: none; font-size: 14px; line-height: 20px; color: var(--sys-color-neutral-800); overflow: hidden; }
.pad-x { display: block; width: 100%; padding: 0 var(--ref-spacing-12); box-sizing: border-box; }
.pv.badge { gap: var(--ref-spacing-04); }

.tab { align-self: center; padding-bottom: var(--ref-spacing-05); color: var(--sys-color-neutral-500); }
.tab.on { font-weight: 600; color: var(--sys-color-neutral-800); box-shadow: inset 0 -2px 0 var(--sys-color-neutral-800); }
.pv.tab { gap: var(--ref-spacing-11); }

.pv.listitem { flex-direction: column; gap: 0; padding: 0 var(--ref-spacing-11); }
.li { display: flex; align-items: center; gap: var(--ref-spacing-08); width: 100%; padding: var(--ref-spacing-07) 0; box-shadow: inset 0 -1px 0 var(--ref-color-gray-900-5); color: var(--sys-color-neutral-500); }
.li-t { flex: 1; color: var(--sys-color-neutral-800); }
.lead { width: 28px; height: 28px; border-radius: var(--ref-radius-04); background: var(--sys-color-neutral-100); }

.pv.card { padding: 0 var(--ref-spacing-11); }
.card { display: flex; align-items: center; gap: var(--ref-spacing-08); width: 100%; padding: var(--ref-spacing-07); border-radius: var(--ref-radius-07); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; box-sizing: border-box; }
.card-img { width: 44px; height: 44px; flex: none; border-radius: var(--ref-radius-05); background: var(--sys-color-neutral-100); }
.card-col { display: flex; flex-direction: column; }
.card-t { font-weight: 500; }
.card-s { font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); }

.pv.bottomsheet { align-items: flex-end; background: var(--ref-color-gray-900-20); padding: 0 var(--ref-spacing-10); }
.sheet { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); width: 100%; padding: var(--ref-spacing-04) var(--ref-spacing-10) calc(var(--ref-spacing-10) + 2 * var(--ref-radius-08)); margin-bottom: calc(-2 * var(--ref-radius-08)); border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-default); box-sizing: border-box; }
.grab { width: 36px; height: 4px; border-radius: var(--ref-radius-12); background: var(--sys-color-neutral-300); margin-bottom: var(--ref-spacing-02); }
.sheet-t { align-self: flex-start; font-weight: 600; }
.sheet-btn { width: 100%; padding: var(--ref-spacing-07) 0; border-radius: var(--ref-radius-05); background: var(--sys-color-brand-primary-default); color: var(--sys-color-common-white-default); font-weight: 600; text-align: center; }

.nav { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 var(--ref-spacing-11); }
.nav-t { font-weight: 600; }

.pv.bottomnavigation { align-items: flex-end; }
.bnav { display: flex; width: 100%; padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-10); box-shadow: 0 -1px 0 var(--ref-color-gray-900-5); }
.bn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-02); font-size: 10px; line-height: 14px; color: var(--sys-color-neutral-500); }
.bn i { width: 22px; height: 22px; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-300); }
.bn.on { color: var(--sys-color-neutral-800); font-weight: 600; }
.bn.on i { background: var(--sys-color-neutral-800); }

.real-host { position: relative; width: 100%; height: 100%; display: grid; place-items: center; overflow: hidden; }
.real { display: inline-flex; flex-direction: column; width: max-content; max-width: 375px; transform-origin: center; contain: layout; }
.real > :deep(*) { min-width: 0; }
.ph { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--ref-color-gray-900-5); --sq-line-w: 1px; color: var(--sys-color-neutral-500); font-size: 14px; font-weight: 600; }
.col { display: flex; flex-direction: column; gap: 8px; }
</style>
