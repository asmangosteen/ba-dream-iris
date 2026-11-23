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
import { Badge, Button, Checkbox, Icon, RadioButton, TextInput, Toast, Toggle } from '@ba-dream/design-system'

const props = defineProps<{ names: (string | null | undefined)[]; label: string }>()
const kind = computed(() => previewKind(props.names))
const initials = computed(() => props.label.replace(/[^A-Za-z0-9가-힣]/g, '').slice(0, 2) || '?')
</script>

<template>
  <!-- 컴포넌트 미리보기: 위계 가이드 예외 영역(data-preview) — 실제 크기로 보여 줍니다. 누르거나 고를 수 없게 inert -->
  <span data-preview inert :class="['pv', kind ?? 'unknown']" aria-hidden="true">
    <template v-if="kind === 'button'">
      <Button type="primary" size="l">신청하기</Button>
    </template>
    <template v-else-if="kind === 'textfield'">
      <span class="pad-x"><TextInput label="이름" placeholder="이름을 적어주세요" size="m" /></span>
    </template>
    <template v-else-if="kind === 'badge'">
      <Badge theme="brand" type="alpha">추천</Badge>
      <Badge theme="gray" type="alpha">쿠폰</Badge>
      <Badge theme="destructed" type="alpha">20%</Badge>
    </template>
    <template v-else-if="kind === 'tab'">
      <span class="tab on">전체</span><span class="tab">진행 중</span><span class="tab">완료</span>
    </template>
    <template v-else-if="kind === 'toggle'">
      <Toggle size="l" :checked="true" aria-label="켜짐" />
      <Toggle size="l" :checked="false" aria-label="꺼짐" />
    </template>
    <template v-else-if="kind === 'checkbox'">
      <Checkbox :size="24" :checked="true" aria-label="선택됨" />
      <Checkbox :size="24" :checked="false" aria-label="선택 안 됨" />
    </template>
    <template v-else-if="kind === 'radio'">
      <RadioButton size="l" :checked="true" aria-label="선택됨" />
      <RadioButton size="l" :checked="false" aria-label="선택 안 됨" />
    </template>
    <template v-else-if="kind === 'listitem'">
      <span class="li"><i class="lead" /><span class="li-t">알림 설정</span><Icon name="chevron_right" :size="16" /></span>
      <span class="li"><i class="lead" /><span class="li-t">계정 관리</span><Icon name="chevron_right" :size="16" /></span>
    </template>
    <template v-else-if="kind === 'card'">
      <span class="card"><span class="card-img" /><span class="card-col"><span class="card-t">모델 A</span><span class="card-s">월 89,000원부터</span></span></span>
    </template>
    <template v-else-if="kind === 'bottomsheet'">
      <span class="sheet"><span class="grab" /><span class="sheet-t">요금제를 골라주세요</span><span class="sheet-btn">선택하기</span></span>
    </template>
    <template v-else-if="kind === 'toast'">
      <span class="pad-x"><Toast type="success" message="저장했어요" /></span>
    </template>
    <template v-else-if="kind === 'navigationbar'">
      <span class="nav"><Icon name="chevron_left" :size="20" /><span class="nav-t">신청하기</span><Icon name="close" :size="20" /></span>
    </template>
    <template v-else-if="kind === 'bottomnavigation'">
      <span class="bnav">
        <span v-for="(t, i) in ['홈', '내 차고', '커뮤니티', '마이']" :key="t" :class="['bn', { on: i === 0 }]"><i /><span>{{ t }}</span></span>
      </span>
    </template>
    <template v-else>
      <span class="ph">{{ initials }}</span>
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
.card { display: flex; align-items: center; gap: var(--ref-spacing-08); width: 100%; padding: var(--ref-spacing-07); border-radius: var(--ref-radius-07); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); box-sizing: border-box; }
.card-img { width: 44px; height: 44px; flex: none; border-radius: var(--ref-radius-05); background: var(--sys-color-neutral-100); }
.card-col { display: flex; flex-direction: column; }
.card-t { font-weight: 500; }
.card-s { font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); }

.pv.bottomsheet { align-items: flex-end; background: var(--ref-color-gray-900-20); padding: 0 var(--ref-spacing-10); }
.sheet { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); width: 100%; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-10); border-radius: var(--ref-radius-08) var(--ref-radius-08) 0 0; background: var(--sys-color-common-white-default); box-sizing: border-box; }
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

.ph { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--ref-radius-06); background: var(--sys-color-neutral-100); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-5); color: var(--sys-color-neutral-500); font-size: 14px; font-weight: 600; }
</style>
