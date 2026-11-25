<script setup lang="ts">
import { Avatar, type AvatarSize } from '@ba-dream/design-system'

const AVATAR_SIZES: AvatarSize[] = [12, 16, 20, 24, 32, 40, 48] // 디자인 시스템 Avatar 크기(값은 런타임에 안 내보내서 여기 적어요)
import { useImageSrc } from '~/canvas/images'

/** 멤버 아바타: 프로필 사진(avatar_url — storage:// 는 서명 URL 로 바꿔요)이 있으면 사진(디자인 시스템 Avatar), 없으면 이름 첫 글자.
    첫 글자: 한글 이름은 한글 한 글자('바드림' → '바'), 알파벳은 늘 대문자('seungmin' → 'S'). 원 안을 꽉 채우게 크게(사용자 요청).
    size 는 디자인 시스템 크기(12 · 16 · 20 · 24 · 32 · 40 · 48) 밖의 값(예: 28)도 돼요 — 바로 위 크기로 그리고 그 크기로 맞춰요 */
const props = defineProps<{ name: string; src?: string | null; size?: number }>()
const resolve = useImageSrc()
const url = computed(() => resolve(props.src ?? undefined))
const px = computed(() => props.size ?? 24)
const base = computed<AvatarSize>(() => AVATAR_SIZES.find((s) => s >= px.value) ?? 48)
const custom = computed(() => base.value !== px.value)
/** 첫 글자 하나(이모지 · 조합 글자도 한 덩어리로) */
const letter = computed(() => (Array.from(props.name.trim())[0] ?? '').toUpperCase())
const hangul = computed(() => /[ㄱ-ㆎ가-힣]/.test(letter.value))
/**
 * 바탕색: 여린 파스텔 8가지(디자인 시스템 100 을 흰색에 반쯤 섞은 바탕 · 같은 색 글자(TEXT_STEP)) 중 하나.
 * 이름으로 정해서 같은 사람은 늘 같은 색(사용자 요청)
 */
const HUES = ['blue', 'purple', 'emerald', 'orange', 'turquoise', 'red', 'yellow', 'green'] as const
/** 글자: 바탕과 같은 색, 밝은 색(초록 계열 · 노랑)은 읽히게 한두 단계 진하게 */
const TEXT_STEP: Record<(typeof HUES)[number], number> = { blue: 500, purple: 500, emerald: 600, orange: 500, turquoise: 600, red: 500, yellow: 700, green: 600 }
const hue = computed(() => {
  let h = 0
  for (const ch of props.name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return HUES[h % HUES.length]!
})
/** 글자 크기: 원 지름의 절반(한글은 글자 면이 넓어서 조금 작게) */
const fs = computed(() => Math.round(px.value * (hangul.value ? 0.44 : 0.5)))
</script>

<template>
  <span v-if="!url" class="mav-f" :style="{ width: px + 'px', height: px + 'px', fontSize: fs + 'px', background: `color-mix(in srgb, var(--ref-color-${hue}-100) 55%, #FFFFFF)`, color: `var(--ref-color-${hue}-${TEXT_STEP[hue]})` }" role="img" :aria-label="name">{{ letter }}</span>
  <span v-else-if="custom" class="mav" :style="{ width: px + 'px', height: px + 'px' }"><Avatar :key="url" :src="url" :alt="name" :size="base" /></span>
  <Avatar v-else :key="url" :src="url" :alt="name" :size="base" />
</template>

<style scoped>
.mav { display: inline-flex; flex: none; }
.mav :deep(.bd-avatar) { width: 100% !important; height: 100% !important; }
/* 사진 없을 때: 디자인 시스템 Avatar 의 이니셜 모양(굵게 · 옅은 테두리), 바탕은 이름별 여린 파스텔 · 글자는 같은 색 톤 */
.mav-f { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border-radius: var(--ref-radius-12); background: var(--sys-color-neutral-200); color: var(--sys-color-neutral-600); font-family: var(--font-family-base); font-weight: var(--font-weight-semibold); line-height: 1; letter-spacing: 0; user-select: none; overflow: hidden; }
.mav-f::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 var(--ref-borderwidth-02) var(--ref-color-gray-900-5); pointer-events: none; }
</style>
