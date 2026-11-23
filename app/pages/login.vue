<script setup lang="ts">
import { Button, TextButton, TextInput } from '@ba-dream/design-system'

/**
 * 로그인: 회사 메일 → 6자리 코드(또는 메일 링크). 로고와 입력을 화면 가운데에.
 * 이 화면은 기기 · 앱 설정과 상관없이 늘 라이트 모드예요(떠나면 원래 모드로 돌아가요).
 */
// 랜딩(/welcome) ↔ 로그인은 스르륵 바뀜 (main.css 의 iris-fade)
definePageMeta({ pageTransition: { name: 'iris-fade', mode: 'out-in' } })
useHead({ htmlAttrs: { 'data-theme': 'light' }, meta: [{ name: 'color-scheme', content: 'light' }] })

const supabase = useSupabaseClient()
const route = useRoute()
const domain = useRuntimeConfig().public.allowedEmailDomain

const step = ref<'email' | 'code'>('email')
const local = ref('')
const code = ref('')
const busy = ref(false)
const resent = ref(false)
const error = ref(route.query.blocked ? `회사 이메일(@${domain})로만 로그인할 수 있어요` : route.query.expired ? '30일 동안 쓰지 않아서 다시 로그인해 주세요' : '')
const email = computed(() => `${local.value.trim()}@${domain}`)

async function sendCode() {
  if (busy.value) return
  const v = local.value.trim()
  if (!v || v.includes('@')) {
    error.value = v.includes('@') ? `@ 앞부분만 적어주세요. @${domain} 은 붙여 둘게요` : '이메일 앞부분을 적어주세요'
    return
  }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.signInWithOtp({ email: email.value, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/confirm` } })
  busy.value = false
  if (e) {
    error.value = e.message.includes('회사 이메일') ? e.message : e.message.includes('rate') || e.status === 429 ? '방금 보냈어요. 1분 뒤에 다시 받을 수 있어요' : '메일을 보내지 못했어요. 이메일을 확인해주세요'
    return
  }
  if (step.value === 'code') resent.value = true
  step.value = 'code'
  code.value = ''
}

async function verify() {
  if (busy.value) return
  if (code.value.trim().length !== 6) { error.value = '메일에 온 6자리 코드를 적어주세요'; return }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.verifyOtp({ email: email.value, token: code.value.trim(), type: 'email' })
  if (e) {
    busy.value = false
    error.value = '코드가 맞지 않아요. 메일에 온 6자리를 다시 확인해주세요'
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

function back() { step.value = 'email'; code.value = ''; error.value = ''; resent.value = false }
function submit() { if (step.value === 'email') sendCode(); else verify() }
// 코드 6자리를 다 적으면 바로 확인
watch(code, (v) => { const d = v.replace(/\D/g, '').slice(0, 6); if (d !== v) code.value = d; else if (d.length === 6 && !busy.value) verify() })
</script>

<template>
  <div class="page">
    <!-- 랜딩으로 나가기: 랜딩의 Sign in 과 같은 크기 · 같은 높이, 왼쪽에 -->
    <Button class="out" size="l" type="tertiary" contents="icon" icon-name="arrow_left" aria-label="처음 화면으로" @click="navigateTo('/welcome')" />
    <section class="side">

      <form class="form" novalidate @submit.prevent="submit">
        <NuxtLink to="/welcome" class="brand" aria-label="처음 화면으로"><IrisLogo kind="horizontal" :height="44" /></NuxtLink>
        <div class="head">
          <h1 class="tx-title">{{ step === 'email' ? '로그인' : '메일을 확인해주세요' }}</h1>
          <p class="tx-meta m0">
            <template v-if="step === 'email'">바드림 회사 메일로 로그인 코드를 보내 드려요</template>
            <template v-else>메일로 받은 6자리 코드를 적거나 메일의 링크를 눌러주세요<br><strong class="who">{{ email }}</strong></template>
          </p>
        </div>

        <TextInput
          v-if="step === 'email'"
          v-model:value="local"
          size="m"
          label="회사 이메일"
          placeholder="이메일 앞부분"
          show-unit
          :unit="`@${domain}`"
          :show-left-icon="false"
          :show-right-icon="false"
          :show-button="false"
          :destructed="!!error"
          :show-supporting-text="!!error"
          :supporting-text="error"
          supporting-theme="destructed"
          :input-props="{ id: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', spellcheck: false, autofocus: true }"
          :label-props="{ htmlFor: 'email' }"
        />
        <TextInput
          v-else
          v-model:value="code"
          size="m"
          label="로그인 코드"
          placeholder="6자리 숫자"
          :show-left-icon="false"
          :show-right-icon="false"
          :show-button="false"
          :destructed="!!error"
          :show-supporting-text="!!error || resent"
          :supporting-text="error || '새 코드를 보냈어요. 가장 최근 메일의 코드를 적어주세요'"
          :supporting-theme="error ? 'destructed' : 'gray'"
          :input-props="{ id: 'code', name: 'code', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: 6, pattern: '[0-9]*', autofocus: true }"
          :label-props="{ htmlFor: 'code' }"
        />

        <Button size="l" type="primary" :loading="busy" class="full" @click="submit">{{ step === 'email' ? '로그인 코드 받기' : '로그인' }}</Button>

        <div v-if="step === 'code'" class="links">
          <TextButton size="s" color="gray" contents="icon-text" icon-name="chevron_left" @click="back">다른 메일로</TextButton>
          <TextButton size="s" color="blue" :disabled="busy" @click="sendCode">코드 다시 받기</TextButton>
        </div>
      </form>

      <p class="foot tx-meta">한 번 로그인하면 30일 동안 다시 묻지 않아요</p>
    </section>
  </div>
</template>

<style scoped>
.page { position: relative; min-height: 100vh; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; }
.side { display: flex; flex-direction: column; padding: var(--ref-spacing-14) var(--ref-spacing-20); box-sizing: border-box; min-height: 100vh; }
.brand { display: inline-flex; align-self: center; margin-bottom: var(--ref-spacing-12); border-radius: var(--ref-radius-02); }
.brand:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 4px; }
/* 랜딩 위 막대(높이 72)의 Sign in 과 같은 자리: 세로 가운데 · 가장자리에서 40 */
.out { position: absolute; z-index: 2; top: 17px; left: 40px; }
@media (max-width: 760px) { .out { top: 11px; left: 16px; } }
.form { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--ref-spacing-10); width: 100%; max-width: 360px; margin: 0 auto; }
.head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--ref-spacing-02); margin-bottom: var(--ref-spacing-04); }
.who { font-weight: 500; color: var(--sys-color-neutral-700); }
.m0 { margin: 0; }
.full { width: 100%; }
.links { display: flex; justify-content: space-between; align-items: center; margin-top: calc(-1 * var(--ref-spacing-04)); }
.form :deep(input[name='code']) { font-variant-numeric: tabular-nums; letter-spacing: 0.2em; }
.foot { margin: 0; text-align: center; }
@media (max-width: 760px) { .side { padding: var(--ref-spacing-12) var(--ref-spacing-08); } }
</style>
