<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'

const route = useRoute()
const user = useSupabaseUser()
const initial = computed(() => (user.value?.email ?? '?').slice(0, 1).toUpperCase())
const nav = [
  { to: '/', label: '프로젝트' },
  { to: '/requirements', label: '요구사항' },
  { to: '/design-system', label: '디자인 시스템' },
]
const isOn = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
</script>

<template>
  <div class="sq float s bar left">
    <NuxtLink to="/" class="brand" aria-label="Iris 홈">
      <img src="/bd-symbol.svg" alt="" height="13" onerror="this.remove()">
      <span>Iris</span>
    </NuxtLink>
    <nav aria-label="주 메뉴" class="seg">
      <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="['sq', 'seg-item', { on: isOn(n.to) }]">{{ n.label }}</NuxtLink>
    </nav>
  </div>
  <div class="sq float s bar right">
    <button class="field search" type="button">
      <Icon name="search" :size="14" />
      <span>검색</span>
      <kbd class="num">⌘K</kbd>
    </button>
    <button class="ib" type="button" aria-label="알림"><Icon name="bell" :size="16" /></button>
    <span class="avatar" :aria-label="user?.email ?? ''">{{ initial }}</span>
  </div>
</template>

<style scoped>
.bar { position: absolute; top: var(--iris-gap); height: 40px; box-sizing: border-box; display: flex; align-items: center; z-index: 3; }
.left { left: var(--iris-gap); gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); }
.right { right: var(--iris-gap); gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-04); }
.brand { display: flex; align-items: center; gap: var(--ref-spacing-04); padding-right: var(--ref-spacing-04); font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-common-black-default); }
.search { min-width: 200px; color: var(--sys-color-neutral-500); }
.search span { flex: 1; text-align: left; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); display: grid; place-items: center; font-size: 10px; font-weight: 600; }
</style>
