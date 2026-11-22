<script setup lang="ts">
import { Button } from '@ba-dream/design-system'

const supabase = useSupabaseClient()
const route = useRoute()
const domain = useRuntimeConfig().public.allowedEmailDomain

const step = ref<'email' | 'code'>('email')
const local = ref('')
const code = ref('')
const busy = ref(false)
const error = ref(route.query.blocked ? `회사 이메일(@${domain})로만 로그인할 수 있어요.` : '')
const email = computed(() => `${local.value.trim()}@${domain}`)

async function sendCode() {
  if (busy.value) return
  if (!local.value.trim() || local.value.includes('@')) {
    error.value = '이메일 앞부분만 적어주세요.'
    return
  }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.signInWithOtp({ email: email.value, options: { shouldCreateUser: true } })
  busy.value = false
  if (e) {
    error.value = e.message.includes('rate') ? '잠시 뒤 다시 시도해주세요.' : '인증 코드를 보내지 못했어요. 이메일을 확인해주세요.'
    return
  }
  step.value = 'code'
}

async function verify() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.verifyOtp({ email: email.value, token: code.value.trim(), type: 'email' })
  busy.value = false
  if (e) {
    error.value = '코드가 맞지 않아요. 메일에 온 6자리를 다시 확인해주세요.'
    return
  }
  await navigateTo('/')
}
</script>

<template>
  <div class="page">
    <header class="logo"><img src="/bd-symbol.svg" alt="" height="16" onerror="this.remove()"><span>Iris</span></header>
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
            <span class="tx-head">메일함을 확인해주세요</span>
            <span class="tx-meta">{{ email }}</span>
          </div>
          <label for="code" class="sr">인증 코드 6자리</label>
          <div class="sq field m focus">
            <input id="code" v-model="code" class="num" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6자리 코드">
          </div>
        </template>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <Button size="s" type="primary" :loading="busy" class="full" @click="step === 'email' ? sendCode() : verify()">{{ step === 'email' ? '인증 코드 받기' : '로그인' }}</Button>
        <div v-if="step === 'code'" class="row">
          <button type="button" class="tx-meta" @click="step = 'email'; code = ''">이메일 다시 입력</button>
          <button type="button" class="link" :disabled="busy" @click="sendCode">코드 다시 받기</button>
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
