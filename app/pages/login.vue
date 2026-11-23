<script setup lang="ts">
import { Button } from '@ba-dream/design-system'

const supabase = useSupabaseClient()
const route = useRoute()
const domain = useRuntimeConfig().public.allowedEmailDomain

const step = ref<'email' | 'code'>('email')
const local = ref('')
const code = ref('')
const busy = ref(false)
const error = ref(route.query.blocked ? `회사 이메일(@${domain})로만 로그인할 수 있어요.` : route.query.expired ? '30일 동안 쓰지 않아서 다시 로그인해 주세요.' : '')
const email = computed(() => `${local.value.trim()}@${domain}`)

async function sendCode() {
  if (busy.value) return
  if (!local.value.trim() || local.value.includes('@')) {
    error.value = '이메일 앞부분만 적어주세요.'
    return
  }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.signInWithOtp({ email: email.value, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/confirm` } })
  busy.value = false
  if (e) {
    error.value = e.message.includes('회사 이메일') ? e.message : e.message.includes('rate') ? '잠시 뒤 다시 시도해주세요.' : '메일을 보내지 못했어요. 이메일을 확인해주세요.'
    return
  }
  step.value = 'code'
}

async function verify() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.verifyOtp({ email: email.value, token: code.value.trim(), type: 'email' })
  if (e) {
    busy.value = false
    error.value = '코드가 맞지 않아요. 메일에 온 6자리를 다시 확인해주세요.'
    return
  }
  // 로그인 상태(useSupabaseUser)가 채워진 뒤 이동해야 미들웨어가 로그인 화면으로 되돌리지 않습니다
  const user = useSupabaseUser()
  if (!user.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(user, (v) => { if (v) { stop(); resolve() } })
      setTimeout(() => { stop(); resolve() }, 3000)
    })
  }
  await navigateTo('/')
  busy.value = false
}
</script>

<template>
  <div class="page">
    <header class="logo"><img :src="BD_SYMBOL" alt="" height="16" onerror="this.remove()"><span>Iris</span></header>
    <main class="wrap">
      <h1 class="tx-title">로그인</h1>
      <form class="sq float card" @submit.prevent="step === 'email' ? sendCode() : verify()">
        <template v-if="step === 'email'">
          <label for="email" class="tx-head">회사 이메일</label>
          <div class="sq field m focus">
            <input id="email" v-model="local" autocomplete="username" inputmode="email" placeholder="이름">
            <span class="tx-meta">@{{ domain }}</span>
          </div>
        </template>
        <template v-else>
          <div class="col">
            <span class="tx-head">메일의 링크를 누르거나 코드를 적어주세요</span>
            <span class="tx-meta">{{ email }}</span>
          </div>
          <label for="code" class="sr">인증 코드 6자리</label>
          <div class="sq field m focus">
            <input id="code" v-model="code" class="num" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6자리 코드">
          </div>
        </template>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <Button size="s" type="primary" :loading="busy" class="full" @click="step === 'email' ? sendCode() : verify()">{{ step === 'email' ? '로그인 메일 받기' : '로그인' }}</Button>
        <div v-if="step === 'code'" class="row">
          <button type="button" class="tx-meta" @click="step = 'email'; code = ''">이메일 다시 입력</button>
          <button type="button" class="link" :disabled="busy" @click="sendCode">메일 다시 받기</button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: var(--iris-canvas); font-size: 12px; line-height: 18px; display: flex; flex-direction: column; }
.logo { height: 60px; display: flex; align-items: center; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-12); font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-common-black-default); }
.wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ref-spacing-10); padding: var(--ref-spacing-16) var(--ref-spacing-10); }
.card { width: 100%; max-width: 360px; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-12); }
.col { display: flex; flex-direction: column; }
.row { display: flex; justify-content: space-between; }
.link { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.err { margin: 0; color: var(--sys-color-theme-destructed-default); }
.full { width: 100%; }
</style>
