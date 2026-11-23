<script setup lang="ts">
import { Button, TextButton, TextInput } from '@ba-dream/design-system'

/**
 * 로그인: 회사 메일 → 6자리 코드(또는 메일 링크).
 * 왼쪽은 입력, 오른쪽은 Iris 가 하는 일(화면 ↔ 요구사항 반영)을 보여 주는 작은 캔버스 장면입니다.
 */
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
    <section class="side">

      <form class="form" novalidate @submit.prevent="submit">
        <IrisLogo kind="horizontal" :height="44" class="brand" />
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

    <!-- 오른쪽: Iris 의 한 장면 — 화면을 고르면 그 화면의 요구사항 반영 상태가 보여요 -->
    <section class="scene canvas-dots" aria-hidden="true">
      <div class="frames">
        <div v-for="(f, i) in [['홈', 'on'], ['내 차고', ''], ['차량 상세', '']]" :key="i" class="fr" :class="f[1]">
          <span class="fl">{{ f[0] }}</span>
          <div class="sheet">
            <span class="b w60 dark" /><span class="b w40" />
            <span class="card" :class="{ blue: i === 0 }"><span class="b w50 light" /><span class="b w70 light" /></span>
            <span class="b w80" /><span class="b w70" /><span class="b w50" />
            <span class="tab" />
          </div>
        </div>
      </div>
      <div class="insp">
        <div class="ih"><span>홈</span><span class="badge">확정</span></div>
        <div class="sum">
          <div class="srow"><span>요구사항 반영</span><span class="num"><b>1</b>/3</span></div>
          <div class="bars"><span class="r" /><span class="p" /><span class="m" /></div>
        </div>
        <div class="rq"><StatusIcon status="missing" /><span>공지 배너 최대 3개 좌우 넘김</span></div>
        <div class="rq"><StatusIcon status="partial" /><span>다음 결제일 · 금액 표시</span></div>
        <div class="rq"><StatusIcon status="reflected" /><span>구독 차량 카드, 없으면 신차 배너</span></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: grid; grid-template-columns: minmax(400px, 520px) 1fr; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; }
.side { display: flex; flex-direction: column; padding: var(--ref-spacing-14) var(--ref-spacing-20); box-sizing: border-box; min-height: 100vh; }
.brand { margin-bottom: var(--ref-spacing-12); }
.form { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: var(--ref-spacing-10); width: 100%; max-width: 360px; margin: 0 auto; }
.head { display: flex; flex-direction: column; gap: var(--ref-spacing-02); margin-bottom: var(--ref-spacing-04); }
.who { font-weight: 500; color: var(--sys-color-neutral-700); }
.m0 { margin: 0; }
.full { width: 100%; }
.links { display: flex; justify-content: space-between; align-items: center; margin-top: calc(-1 * var(--ref-spacing-04)); }
.form :deep(input[name='code']) { font-variant-numeric: tabular-nums; letter-spacing: 0.2em; }
.foot { margin: 0; text-align: center; }

/* 오른쪽 장면: 회색 작업대 위 흰 화면 셋 + 인스펙터 카드 */
.scene { position: relative; overflow: hidden; background-color: var(--iris-canvas); background-image: radial-gradient(circle, var(--ref-color-gray-900-10) 1px, transparent 1.2px); background-size: 20px 20px; display: flex; align-items: center; justify-content: center; }
.frames { display: flex; gap: 40px; transform: translateX(-80px); }
.fr { display: flex; flex-direction: column; gap: 6px; }
.fl { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.fr.on .fl { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.sheet { width: 188px; height: 408px; box-sizing: border-box; background: var(--iris-paper); box-shadow: 0 0 0 1px var(--iris-line-strong), 0 1px 3px rgb(3 9 26 / 6%); padding: 36px 14px 0; display: flex; flex-direction: column; gap: 8px; position: relative; }
.fr.on .sheet { box-shadow: 0 0 0 1.5px var(--sys-color-brand-primary-default), 0 1px 3px rgb(3 9 26 / 6%); }
.b { display: block; height: 8px; border-radius: 4px; background: #F1F2F3; } /* 종이(화면) 안은 다크모드에서도 밝은 그대로 */
.b.dark { height: 12px; background: #454C58; }
.b.light { background: rgb(255 255 255 / 70%); }
.w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; }
.card { display: flex; flex-direction: column; gap: 8px; justify-content: flex-end; height: 84px; margin: 6px 0; padding: 12px; box-sizing: border-box; border-radius: 10px; background: #F6F7F7; }
.card.blue { background: #2C7BE2; }
.tab { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; box-shadow: inset 0 1px 0 var(--iris-paper-line); }
.insp { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); width: 248px; padding: var(--ref-spacing-08); box-sizing: border-box; border-radius: var(--ref-radius-07); background: var(--sys-color-common-white-emphasis); box-shadow: 0 0 0 1px var(--ref-color-gray-900-10), 0 6px 16px rgb(3 9 26 / 6%); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.ih { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
.badge { padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); background: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-weight: 500; }
.sum { padding: var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-04); background: var(--sys-color-neutral-100); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.srow { display: flex; justify-content: space-between; font-weight: 600; }
.srow b { color: var(--sys-color-brand-primary-default); font-weight: 600; }
.bars { display: flex; gap: 2px; height: 4px; }
.bars span { flex: 1; border-radius: 2px; }
.bars .r { background: var(--sys-color-brand-primary-default); }
.bars .p { background: var(--sys-color-neutral-800); }
.bars .m { background: var(--ref-color-gray-900-10); }
.rq { display: flex; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-04); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); color: var(--sys-color-neutral-800); white-space: nowrap; overflow: hidden; }

@media (max-width: 900px) {
  .page { grid-template-columns: 1fr; }
  .scene { display: none; }
  .side { padding: var(--ref-spacing-12) var(--ref-spacing-08); }
}
</style>
