<script setup lang="ts">
import { Skeleton } from '@ba-dream/design-system'

// 메일 로그인 링크로 돌아오는 곳. Supabase 가 주소의 코드로 세션을 만들면 홈으로 보냅니다.
const user = useSupabaseUser()
const failed = ref(false)
watch(user, (u) => { if (u) navigateTo('/', { replace: true }) }, { immediate: true })
onMounted(() => setTimeout(() => { if (!user.value) failed.value = true }, 8000))
</script>

<template>
  <div class="page">
    <div class="sq float card">
      <template v-if="!failed">
        <span class="tx-head">{{ tr('Signing you in…') }}</span>
        <Skeleton shape="text" width="100%" />
      </template>
      <template v-else>
        <span class="tx-head">{{ tr('This link has expired') }}</span>
        <NuxtLink to="/login" class="link">{{ tr('Sign in again') }}</NuxtLink>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: grid; place-items: center; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.card { width: 320px; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-12); }
.link { color: var(--sys-color-brand-primary-default); font-weight: 500; }
</style>
