<script setup lang="ts">
import { Avatar, type AvatarSize } from '@ba-dream/design-system'

const AVATAR_SIZES: AvatarSize[] = [12, 16, 20, 24, 32, 40, 48] // 디자인 시스템 Avatar 크기(값은 런타임에 안 내보내서 여기 적어요)
import { useImageSrc } from '~/canvas/images'

/** 멤버 아바타: 프로필 사진(avatar_url — storage:// 는 서명 URL 로 바꿔요)이 있으면 사진, 없으면 이니셜(디자인 시스템 Avatar).
    size 는 디자인 시스템 크기(12 · 16 · 20 · 24 · 32 · 40 · 48) 밖의 값(예: 28)도 돼요 — 바로 위 크기로 그리고 그 크기로 맞춰요 */
const props = defineProps<{ name: string; src?: string | null; size?: number }>()
const resolve = useImageSrc()
const url = computed(() => resolve(props.src ?? undefined))
const px = computed(() => props.size ?? 24)
const base = computed<AvatarSize>(() => AVATAR_SIZES.find((s) => s >= px.value) ?? 48)
const custom = computed(() => base.value !== px.value)
</script>

<template>
  <span v-if="custom" class="mav" :style="{ width: px + 'px', height: px + 'px', '--mav-fs': Math.round(px * 0.4) + 'px' }"><Avatar :key="url ?? 'none'" :src="url" :alt="name" :size="base" /></span>
  <Avatar v-else :key="url ?? 'none'" :src="url" :alt="name" :size="base" />
</template>

<style scoped>
.mav { display: inline-flex; flex: none; }
.mav :deep(.bd-avatar) { width: 100% !important; height: 100% !important; }
.mav :deep(.bd-avatar__fallback) { font-size: var(--mav-fs) !important; }
</style>
