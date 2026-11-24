<script setup lang="ts">
import { showsTabs } from '~/composables/useTabs'

useThemeHead()
useLangHead()
const route = useRoute()
/** 홈 · 프로젝트 화면에서는 맨 위에 탭 막대(44). 화면들은 높이를 100vh - --iris-tabs-h 로 잡아요 */
const tabbed = computed(() => showsTabs(route.path))
</script>

<template>
  <div class="app-root" :style="{ '--iris-tabs-h': tabbed ? '44px' : '0px' }">
    <AppTabs v-if="tabbed" />
    <NuxtPage />
  </div>
</template>
