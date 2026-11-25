<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { showsTabs, useTabReload } from '~/composables/useTabs'
import ContextMenu from '~/components/editor/ContextMenu.vue'

useThemeHead()
useLangHead()
const route = useRoute()
/** 홈 · 프로젝트 화면에서는 맨 위에 탭 막대(44). 화면들은 높이를 100vh - --iris-tabs-h 로 잡아요 */
const tabbed = computed(() => showsTabs(route.path))
/** 탭 새로 고침: 화면 열쇠(원래 열쇠 + 새로 고친 횟수)가 바뀌면 그 화면만 새로 만들어요 */
const { key: reloadKey } = useTabReload()
const pageKey = (r: RouteLocationNormalizedLoaded) => {
  const k = r.meta.key
  return `${typeof k === 'function' ? k(r) : (k ?? r.path)}#${reloadKey.value}`
}
</script>

<template>
  <div class="app-root" :style="{ '--iris-tabs-h': tabbed ? '44px' : '0px' }">
    <AppTabs v-if="tabbed" />
    <NuxtPage :page-key="pageKey" />
    <!-- 우클릭 메뉴는 앱에 하나(탭 막대 · 편집기 모두) -->
    <ContextMenu />
  </div>
</template>
