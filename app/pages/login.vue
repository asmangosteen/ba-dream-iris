<script setup lang="ts">
import { Button, TextButton, TextInput } from '@ba-dream/design-system'

/**
 * 로그인: 회사 메일 → 6자리 코드(또는 메일 링크). 로고와 입력을 화면 가운데에.
 * 화면 모드는 웰컴과 같아요: 다크를 골랐을 때만 다크(배경 black-default), 그 밖엔 라이트.
 */
// 랜딩(/welcome) ↔ 로그인은 스르륵 바뀜 (main.css 의 iris-fade)
definePageMeta({ pageTransition: { name: 'iris-fade', mode: 'out-in' } })
const { theme } = usePublicTheme()

const supabase = useSupabaseClient()
const route = useRoute()
const domain = useRuntimeConfig().public.allowedEmailDomain

const step = ref<'email' | 'code'>('email')
const local = ref('')
const code = ref('')
const busy = ref(false)
const resent = ref(false)
const error = ref(route.query.blocked ? `Only company emails (@${domain}) can sign in` : route.query.expired ? 'Your session expired after 30 days. Please sign in again' : '')
const email = computed(() => `${local.value.trim()}@${domain}`)
// 도메인 글자: 입력칸 오른쪽에 늘 보이게(입력 글자는 그 앞에서 끝나요)
const emailField = ref<HTMLElement | null>(null)
const unitEl = ref<HTMLElement | null>(null)
const unitW = ref(0)
const boxH = ref(38)
function measureUnit() {
  unitW.value = Math.ceil(unitEl.value?.offsetWidth ?? 0)
  boxH.value = emailField.value?.querySelector<HTMLElement>('.bd-text-input__box')?.offsetHeight || boxH.value
}
onMounted(() => { measureUnit(); document.fonts?.ready.then(measureUnit) })

async function sendCode() {
  if (busy.value) return
  const v = local.value.trim()
  if (!v || v.includes('@')) {
    error.value = v.includes('@') ? `Enter only the part before @. We'll add @${domain} for you` : 'Enter your email'
    return
  }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.signInWithOtp({ email: email.value, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/confirm` } })
  busy.value = false
  if (e) {
    error.value = e.message.includes('회사 이메일') ? `Only company emails (@${domain}) can sign in` : e.message.includes('rate') || e.status === 429 ? 'Code just sent. You can request a new one in a minute' : 'Couldn\'t send the email. Check your address and try again'
    return
  }
  if (step.value === 'code') resent.value = true
  step.value = 'code'
  code.value = ''
}

async function verify() {
  if (busy.value) return
  if (code.value.trim().length !== 6) { error.value = 'Enter the 6-digit code from your email'; return }
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.verifyOtp({ email: email.value, token: code.value.trim(), type: 'email' })
  if (e) {
    busy.value = false
    error.value = 'That code didn\'t match. Check the 6 digits in your email'
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

// --- 코드 6칸 ---
const boxes = ref<HTMLInputElement[]>([])
const digits = computed(() => Array.from({ length: 6 }, (_, i) => code.value[i] ?? ''))
const focusBox = (i: number) => nextTick(() => { const el = boxes.value[Math.max(0, Math.min(5, i))]; el?.focus(); el?.select() })
/** i 칸부터 숫자들 채우기(한 글자 입력 · 붙여넣기 · 자동 채우기 공용) */
function fill(i: number, text: string) {
  const d = text.replace(/\D/g, '')
  if (!d) return
  // 6자리를 통째로 붙여넣으면 어느 칸에서든 전체를 바꿔요
  if (d.length >= 6) { code.value = d.slice(0, 6); error.value = ''; focusBox(5); return }
  // 틀린 코드(에러)가 떠 있으면: 숫자는 보이게 두었다가, 새로 치는 순간 전부 지우고 첫 칸부터
  if (error.value) { code.value = ''; i = 0 }
  const at = Math.min(i, code.value.length) // 빈 칸을 건너뛰지 않게
  code.value = (code.value.slice(0, at) + d + code.value.slice(at + d.length)).slice(0, 6)
  error.value = ''
  focusBox(at + d.length)
}
function onBox(i: number, e: Event) {
  const input = e.target as HTMLInputElement
  const v = input.value
  const had = digits.value[i] ?? ''
  input.value = had
  // 이미 숫자가 있던 칸에 새 숫자를 치면 새 숫자로 바꿔요
  fill(i, had && v.length === 2 && v.startsWith(had) ? v.slice(1) : v)
}
function onPaste(i: number, e: ClipboardEvent) { fill(i, e.clipboardData?.getData('text') ?? '') }
function onBoxKey(i: number, e: KeyboardEvent) {
  if (e.key === 'Backspace') {
    e.preventDefault()
    // 틀린 코드가 떠 있을 때 지우기: 전부 지우고 첫 칸으로
    if (error.value) { error.value = ''; code.value = ''; focusBox(0); return }
    if (digits.value[i]) code.value = code.value.slice(0, i) + code.value.slice(i + 1)
    else if (i > 0) { code.value = code.value.slice(0, i - 1) + code.value.slice(i); focusBox(i - 1) }
  } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusBox(i - 1) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); focusBox(Math.min(i + 1, code.value.length)) }
  else if (e.key === 'Enter') { e.preventDefault(); verify() }
}
/** 빈 칸을 건너뛰어 누르면 채울 차례인 칸으로 */
// 고른 칸: 클래스로 표시해야 squircle 선 두께가 다시 그려져요(:focus-within 만으로는 안 바뀌어요)
const focused = ref(-1)
function onBoxFocus(i: number, e: FocusEvent) {
  if (i > code.value.length) { focusBox(code.value.length); return }
  focused.value = i
  ;(e.target as HTMLInputElement).select()
}
watch(step, (v) => { if (v === 'code') focusBox(0); else nextTick(measureUnit) })
function submit() { if (step.value === 'email') sendCode(); else verify() }
// 코드 6자리를 다 적으면 바로 확인
watch(code, (v) => { const d = v.replace(/\D/g, '').slice(0, 6); if (d !== v) code.value = d; else if (d.length === 6 && !busy.value) verify() })
</script>

<template>
  <div class="page" :class="theme">
    <!-- 랜딩으로 나가기: 랜딩의 Sign in 과 같은 크기 · 같은 높이, 왼쪽에 -->
    <Button class="out" size="l" type="tertiary" contents="icon" icon-name="arrow_left" aria-label="Back to home" @click="navigateTo('/welcome')" />
    <h1 class="bar-title">Sign in</h1>
    <section class="side">

      <form class="form" novalidate @submit.prevent="submit">
        <NuxtLink to="/welcome" class="brand" aria-label="Back to home"><IrisLogo kind="horizontal" :height="64" :theme="theme" /></NuxtLink>
        <!-- 코드 단계: 어디로 보냈는지만 알려요 -->
        <p v-if="step === 'code'" class="sent tx-meta m0">Enter the 6-digit code we sent to <strong class="who">{{ email }}</strong>, or click the link in the email</p>

        <!-- 도메인은 디자인 시스템 단위 대신 직접 붙여요: 단위는 입력 중(포커스)에 감춰지는 규칙이라 -->
        <div v-if="step === 'email'" ref="emailField" class="email-field" :style="{ '--unit-w': unitW + 'px', '--box-h': boxH + 'px' }">
        <TextInput
          v-model:value="local"
          size="m"
          :show-label="false"
          placeholder="Email"
          :show-left-icon="false"
          :show-right-icon="false"
          :show-button="false"
          :destructed="!!error"
          :show-supporting-text="!!error"
          :supporting-text="error"
          supporting-theme="destructed"
          :input-props="{ id: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', spellcheck: false, autofocus: true, 'aria-label': 'Company email' }"
        />
        <span ref="unitEl" class="email-unit" aria-hidden="true">@{{ domain }}</span>
        </div>
        <!-- 코드 6칸: 칸마다 숫자 하나. 붙여넣기 · 자동 채우기는 한 번에, ← → 로 칸 옮기기, 지우면 앞 칸으로 -->
        <div v-else class="otp-wrap">
          <div class="otp" role="group" aria-label="Sign-in code">
            <!-- 칸 모양(채우기 · 선)은 squircle 층(.sq)이 그려요: input 은 투명하게 안에 -->
            <span v-for="(d, i) in digits" :key="i" class="sq otp-cell" :class="{ bad: !!error, filled: !!d, on: focused === i }">
            <input
              :ref="(el) => { if (el) boxes[i] = el as HTMLInputElement }"
              :value="d"
              class="otp-box"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              :maxlength="i === 0 ? 6 : 1"
              :autocomplete="i === 0 ? 'one-time-code' : 'off'"
              :name="i === 0 ? 'code' : undefined"
              :aria-label="`Digit ${i + 1} of 6`"
              @input="onBox(i, $event)"
              @keydown="onBoxKey(i, $event)"
              @paste.prevent="onPaste(i, $event)"
              @focus="onBoxFocus(i, $event)"
              @blur="focused = -1"
            >
            </span>
          </div>
          <p v-if="error || resent" class="otp-msg tx-meta m0" :class="{ bad: !!error }" role="status">{{ error || 'We sent a new code. Use the code from the latest email' }}</p>
        </div>

        <Button size="l" type="primary" :loading="busy" class="full" @click="submit">{{ step === 'email' ? 'Send sign-in code' : 'Sign in' }}</Button>

        <div v-if="step === 'code'" class="links">
          <TextButton size="s" color="gray" contents="icon-text" icon-name="chevron_left" @click="back">Use a different email</TextButton>
          <TextButton size="s" color="blue" :disabled="busy" @click="sendCode">Resend code</TextButton>
        </div>
      </form>

    </section>
  </div>
</template>

<style scoped>
.page { position: relative; min-height: 100vh; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; }
.page.dark { background: var(--iris-black); }
.side { display: flex; flex-direction: column; padding: var(--ref-spacing-14) var(--ref-spacing-20); box-sizing: border-box; min-height: 100vh; }
.brand { display: inline-flex; align-self: center; margin-bottom: var(--ref-spacing-12); border-radius: var(--ref-radius-02); }
.brand:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 4px; }
/* 랜딩 위 막대(높이 72)의 Sign in 과 같은 자리: 세로 가운데 · 가장자리에서 40 */
.out { position: absolute; z-index: 2; top: 17px; left: 40px; }
@media (max-width: 760px) { .out { top: 11px; left: 16px; } }
.form { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--ref-spacing-10); width: 100%; max-width: 360px; margin: 0 auto; }
/* 위 막대 가운데 제목: 뒤로 가기 버튼과 같은 높이 */
.bar-title { position: absolute; z-index: 1; top: 17px; left: 0; right: 0; height: 40px; margin: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 22px; font-weight: 500; color: var(--sys-color-neutral-800); pointer-events: none; }
@media (max-width: 760px) { .bar-title { top: 11px; } }
.sent { text-align: center; }
.email-field { position: relative; }
/* 디자인 시스템 단위와 같은 자리 · 모양(오른쪽 12, 14px), 입력 글자는 도메인 앞까지만 */
.email-unit { position: absolute; top: 0; right: 12px; height: var(--box-h); display: flex; align-items: center; font-size: 14px; line-height: 22px; color: var(--sys-color-neutral-800); pointer-events: none; white-space: nowrap; }
.email-field :deep(.bd-text-input__value) { padding-right: calc(var(--unit-w) + 8px); }
.who { font-weight: 500; color: var(--sys-color-neutral-700); }
.m0 { margin: 0; }
.full { width: 100%; }
.links { display: flex; justify-content: space-between; align-items: center; margin-top: calc(-1 * var(--ref-spacing-04)); }
.otp-wrap { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.otp { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--ref-spacing-08); }
/* 코너 스무딩: 채우기 · 선을 .sq 층으로(테두리 · 그림자는 각진 모서리라 쓰지 않아요) */
.otp-cell { display: block; height: 64px; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.otp-cell:hover { --sq-line: var(--ref-color-gray-900-20); }
.otp-cell.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
.otp-cell.bad { --sq-line: var(--sys-color-theme-destructed-default); }
.otp-cell.bad.on { --sq-line: var(--sys-color-theme-destructed-default); }
.otp-box { width: 100%; height: 100%; box-sizing: border-box; padding: 0; border: 0; background: transparent; text-align: center; font-family: var(--font-family-base); font-size: 28px; line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--sys-color-neutral-800); caret-color: var(--sys-color-brand-primary-default); outline: none; }
.otp-msg { text-align: center; }
.otp-msg.bad { color: var(--sys-color-theme-destructed-default); }
@media (max-width: 760px) { .side { padding: var(--ref-spacing-12) var(--ref-spacing-08); } }
</style>
