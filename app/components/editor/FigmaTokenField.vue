<script setup lang="ts">
import { Button, TextInput } from '@ba-dream/design-system'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { useMe } from '~/composables/useMembers'

/**
 * 피그마 토큰 칸(가져오기 창 · 계정 메뉴 '피그마 연결' 창 공용): 비밀번호처럼 가려 넣고, 저장하면 누구도 다시 못 봐요(끝 4자리만).
 * 관리자만 넣고 바꿔요. 다른 사람에겐 '관리자에게 알려 주세요'
 */
const emit = defineEmits<{ saved: [] }>()
const { data: me } = useMe()
const admin = computed(() => !!me.value?.is_admin)
const { status, refresh, save, remove } = useFigmaToken()
onMounted(() => { refresh() })

const editing = ref(false)
const token = ref('')
const busy = ref(false)
const error = ref('')
const ERR: Record<string, string> = {
  forbidden: 'Only admins can change the Figma connection',
  invalid: 'That doesn’t look like a Figma token. Copy it again from Figma',
  not_ready: 'The Figma connection isn’t set up on the server yet. Let the person running Iris know',
  failed: 'Couldn’t save the token. Try again in a moment',
}
async function onSave() {
  if (!token.value.trim() || busy.value) return
  busy.value = true; error.value = ''
  try {
    await save(token.value)
    token.value = ''; editing.value = false
    emit('saved')
  } catch (e) { error.value = tr(ERR[(e as Error).message] ?? ERR.failed!) } finally { busy.value = false }
}
async function onRemove() {
  busy.value = true; error.value = ''
  try { await remove() } catch (e) { error.value = tr(ERR[(e as Error).message] ?? ERR.failed!) } finally { busy.value = false }
}
const showInput = computed(() => admin.value && (editing.value || !status.value?.connected))
</script>

<template>
  <div class="ftk">
    <!-- 연결됨: 끝 4자리 · 바꾼 시각 -->
    <div v-if="status?.connected && !editing" class="sq ftk-row">
      <span :class="['ftk-dot', { bad: status.last_error }]" aria-hidden="true" />
      <span class="ftk-col">
        <b>{{ status.last_error ? tr('Figma token isn’t working') : tr('Figma connected') }}</b>
        <span class="tx-meta num">•••• {{ status.last4 }}<template v-if="status.updated_at"> · {{ tr('Updated {when}', { when: relativeTime(status.updated_at) }) }}</template></span>
      </span>
      <span v-if="admin" class="ftk-acts">
        <Button size="s" type="tertiary" stroke :disabled="busy" @click="editing = true">{{ tr('Replace') }}</Button>
        <Button size="s" type="tertiary" :disabled="busy" @click="onRemove">{{ tr('Disconnect') }}</Button>
      </span>
    </div>

    <!-- 넣기(관리자): 가려진 입력칸 -->
    <form v-if="showInput" class="ftk-form" autocomplete="off" @submit.prevent="onSave">
      <div class="ftk-in">
        <TextInput
          v-model:value="token"
          size="s"
          :label="tr('Figma access token')"
          placeholder="figd_…"
          show-left-icon
          left-icon-name="lock"
          :show-right-icon="false"
          :show-button="false"
          :show-supporting-text="false"
          :input-props="{ id: 'figmaToken', type: 'password', autocomplete: 'new-password', spellcheck: false }"
          :label-props="{ htmlFor: 'figmaToken' }"
        />
        <span class="ftk-btns">
          <Button v-if="editing" size="s" type="tertiary" :disabled="busy" @click="editing = false; token = ''">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :loading="busy" :disabled="!token.trim()" @click="onSave">{{ tr('Connect') }}</Button>
        </span>
      </div>
      <ul class="ftk-help tx-meta">
        <li>{{ tr('In Figma: Settings → Security → Personal access tokens → Generate new token') }}</li>
        <li>{{ tr('Scope: File content — Read only. Use an account with a Full seat on the team plan') }}</li>
        <li>{{ tr('It’s stored encrypted and never shown again — not even to you') }}</li>
      </ul>
    </form>

    <p v-if="!admin && !status?.connected" class="sq ftk-note"><EditorIcon name="info" :size="16" class="ftk-ic" /><span>{{ tr('Figma isn’t connected yet. Ask an admin to connect it') }}</span></p>
    <p v-if="error" class="tx-meta ftk-err" role="alert"><EditorIcon name="warning" :size="12" />{{ error }}</p>
  </div>
</template>

<style scoped>
/* 팝업 안 칸: 문서 추가 창 가이드 칸 · 고른 파일 카드와 같은 틀 */
.ftk { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.ftk-row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); }
.ftk-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #24A638; }
.ftk-dot.bad { background: var(--sys-color-theme-error-default); }
.ftk-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ftk-col b { font-weight: 600; }
.ftk-acts, .ftk-btns { flex: none; display: flex; gap: var(--ref-spacing-04); }
.ftk-form { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.ftk-in { display: flex; align-items: flex-end; gap: var(--ref-spacing-04); }
.ftk-in > :first-child { flex: 1; min-width: 0; }
/* 입력칸(s, 30) 옆 버튼도 30 — 공유 창 초대 줄과 같아요 */
.ftk-in :deep(.bd-button) { height: 30px; min-height: 30px; }
.ftk-help { margin: 0; padding: 0 0 0 calc(var(--ref-spacing-08) + var(--ref-spacing-02)); list-style: none; display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
.ftk-help li { display: flex; gap: var(--ref-spacing-04); }
.ftk-help li::before { content: ''; flex: none; width: 3px; height: 3px; margin: 8px 0 0 var(--ref-spacing-02); border-radius: 50%; background: var(--sys-color-neutral-400); }
.ftk-note { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); margin: 0; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.ftk-ic { flex: none; margin-top: 1px; }
.ftk-err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }
</style>
