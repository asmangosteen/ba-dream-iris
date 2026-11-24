<script setup lang="ts">
import { NavBarTop } from '@ba-dream/design-system'
import DsStatusBar from '~/components/ds/DsStatusBar.vue'

/**
 * Top Bar — @ba-dream/design-system TopBar 와 같은 구조 · 같은 속성 · 같은 CSS(.bd-top-bar).
 * 패키지 1.0.0 의 TopBar 는 Status Bar 자리가 비어 있어서(빈 컴포넌트), Iris 캔버스에서는 이 컴포넌트로 바꿔 그려요(InstanceView 의 dsComponent).
 * Line 은 피그마와 같은 아래쪽 1px 안쪽 선(gray-900 5%) — 패키지 CSS 그대로
 */
type NavMode = 'light' | 'dark'
const props = withDefaults(defineProps<{
  mode?: NavMode
  background?: 'no' | 'default' | 'blur'
  line?: boolean
  showStatusBar?: boolean
  showNavigationBar?: boolean
  os?: 'ios' | 'android'
  navProps?: Record<string, unknown>
  statusProps?: Record<string, unknown>
}>(), { mode: 'light', background: 'default', line: false, showStatusBar: true, showNavigationBar: true, os: 'ios', navProps: undefined, statusProps: undefined })
</script>

<template>
  <div class="bd-top-bar" :data-mode="mode" :data-background="background" :data-line="background !== 'no' && line">
    <DsStatusBar v-if="showStatusBar" v-bind="statusProps" :os="os" :mode="mode" background="off" />
    <NavBarTop v-if="showNavigationBar" v-bind="navProps" :mode="props.mode" background="off" />
  </div>
</template>
