<script setup lang="ts">
import { Button, Icon, TextInput } from '@ba-dream/design-system'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import EditorSelect, { type SelectOption } from '~/components/editor/EditorSelect.vue'
import { ASSIGNABLE, ROLE_NAME, accessError, useProjectAccess, type ProjectMemberRow, type ProjectRole } from '~/composables/useProjectAccess'
import { relativeTime } from '~/composables/useProjects'
import { useToastReq } from '~/composables/useLayerMenu'

/**
 * 멤버 · 초대 목록(공유 창 · 프로젝트 설정 '멤버' 탭이 함께 써요, PRD/16 A · F)
 * 방장 · 부방장: 역할을 골라 바로 초대 · 대기 요청 승인(역할 먼저) · 멤버 역할 바꾸기 · 내보내기
 * 다른 멤버: 초대를 '요청'(방장 · 부방장이 승인) · 내가 보낸 요청 취소 · 멤버 보기
 */
const props = defineProps<{ projectId: string; autofocus?: boolean }>()
const access = useProjectAccess(props.projectId)
const { can, role, members, pending, me } = access
const toastReq = useToastReq()
const say = (text: string) => (toastReq.value = { text, at: Date.now() })
const uid = useId()

type Assignable = Exclude<ProjectRole, 'owner'>
/** 내가 줄 수 있는 역할(부방장은 방장만 정해요) */
const giveable = computed<Assignable[]>(() => ASSIGNABLE.filter((r) => r !== 'deputy' || can.value.owner))
const roleOptions = computed<SelectOption[]>(() => giveable.value.map((r) => ({ value: r, label: ROLE_NAME[r] })))

// --- 초대 ---
const email = ref('')
const inviteRole = ref<Assignable>('planner_editor')
const busy = ref('')
const err = ref('')
async function invite() {
  const mail = email.value.trim()
  if (!mail) { err.value = tr('Enter an email'); return }
  if (!/^[^\s@]+@ba-dream\.com$/i.test(mail)) { err.value = tr(accessError({ message: 'bad_domain' })); return }
  busy.value = 'invite'; err.value = ''
  try {
    await access.invite(mail, can.value.manage ? inviteRole.value : null)
    email.value = ''
    say(can.value.manage ? tr('Invited {email}', { email: mail }) : tr('Request sent. An owner or co-owner will approve it'))
  } catch (e) { err.value = tr(accessError(e)) }
  busy.value = ''
}
watch(email, () => { if (err.value) err.value = '' })

// --- 대기 요청 ---
const pickRole = reactive<Record<string, Assignable | undefined>>({})
const nameOf = (id: string | null) => members.value.find((m) => m.member_id === id)?.member?.name ?? null
function waitingMeta(i: { kind: string; requested_by: string; created_at: string; expires_at: string }) {
  const who = i.kind === 'join' ? tr('Asked to join') : tr('Invited by {name}', { name: nameOf(i.requested_by) ?? tr('a member') })
  const left = Math.max(0, Math.ceil((new Date(i.expires_at).getTime() - Date.now()) / 86_400_000))
  return [who, left <= 5 ? tr('{n} days left', { n: left }) : ''].filter(Boolean).join(' · ')
}
/** 줄에 올리면 보이는 전체 설명(언제 요청했는지 포함) */
function waitingTip(i: { kind: string; requested_by: string; created_at: string; expires_at: string }) {
  return `${waitingMeta(i)} · ${relativeTime(i.created_at)}`
}
async function decide(id: string, approve: boolean) {
  busy.value = id
  try {
    await access.decide(id, approve, pickRole[id] ?? null)
    say(approve ? tr('Request approved') : tr('Declined'))
  } catch (e) { say(tr(accessError(e))) }
  busy.value = ''
}
async function cancel(id: string) {
  busy.value = id
  try { await access.cancel(id); say(tr('Request cancelled')) } catch (e) { say(tr(accessError(e))) }
  busy.value = ''
}
/** 방장 · 부방장은 대기 요청 전부, 다른 멤버는 내가 보낸 것만(DB 규칙도 같아요) */
const waiting = computed(() => (can.value.manage ? pending.value : pending.value.filter((i) => i.requested_by === me.value)))

// --- 멤버 ---
/** 이 멤버의 역할을 내가 바꿀 수 있나(방장은 못 바꿔요 → 방장 넘기기, 부방장은 방장만) */
const canEdit = (m: ProjectMemberRow) => can.value.manage && m.role !== 'owner' && m.member_id !== me.value && (m.role !== 'deputy' || can.value.owner)
function memberOptions(m: ProjectMemberRow): SelectOption[] {
  const list = roleOptions.value.slice()
  if (m.role === 'deputy' && !list.some((o) => o.value === 'deputy')) list.unshift({ value: 'deputy', label: ROLE_NAME.deputy })
  return [...list, { value: '__remove', label: 'Remove from project', sep: true }]
}
const confirmRemove = ref<ProjectMemberRow | null>(null)
async function onMemberRole(m: ProjectMemberRow, v: string) {
  if (v === '__remove') { confirmRemove.value = m; return }
  busy.value = m.member_id
  try { await access.setRole(m.member_id, v as Assignable); say(tr('Role changed')) } catch (e) { say(tr(accessError(e))) }
  busy.value = ''
}
async function doRemove() {
  const m = confirmRemove.value
  if (!m) return
  busy.value = 'remove'
  try { await access.remove(m.member_id); say(tr('Removed {name}', { name: m.member?.name ?? '' })) } catch (e) { say(tr(accessError(e))) }
  busy.value = ''
  confirmRemove.value = null
}
const root = ref<HTMLElement | null>(null)
onMounted(() => { if (props.autofocus) nextTick(() => root.value?.querySelector<HTMLInputElement>(`#${uid}-mail`)?.focus()) })
</script>

<template>
  <div ref="root" class="pm">
    <!-- 초대 -->
    <form class="inv" @submit.prevent="invite">
      <TextInput
        v-model:value="email" class="f1" size="s" :placeholder="tr('Add people by @ba-dream.com email')"
        :show-label="false" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :destructed="!!err"
        :input-props="{ id: `${uid}-mail`, type: 'email', autocomplete: 'off', 'aria-label': tr('Email to invite') }"
      />
      <EditorSelect v-if="can.manage" v-model="inviteRole" class="inv-role" :options="roleOptions" aria-label="Role for the invite" />
      <Button size="s" type="primary" :loading="busy === 'invite'" @click="invite">{{ can.manage ? tr('Invite') : tr('Request') }}</Button>
    </form>
    <p v-if="err" class="tx-meta err" role="alert"><Icon name="warning" :size="12" />{{ err }}</p>
    <p v-else-if="role && !can.manage" class="tx-meta hint">{{ tr('An owner or co-owner approves invites and picks the role') }}</p>

    <!-- 승인 대기 -->
    <section v-if="waiting.length" class="mgrp" :aria-label="tr('Waiting for approval')">
      <h3 class="gh">{{ can.manage ? tr('Waiting for approval') : tr('Your requests') }}<span class="num muted">{{ waiting.length }}</span></h3>
      <div v-for="i in waiting" :key="i.id" class="row">
        <MemberAvatar :name="i.email" :size="28" />
        <span class="who" :title="waitingTip(i)"><b>{{ i.email }}</b><span>{{ waitingMeta(i) }}</span></span>
        <template v-if="can.manage">
          <EditorSelect v-model="pickRole[i.id]" class="row-role" :options="roleOptions" placeholder="Choose role" :aria-label="`Role for ${i.email}`" />
          <Button size="s" type="primary" :disabled="!pickRole[i.id]" :loading="busy === i.id" @click="decide(i.id, true)">{{ tr('Approve') }}</Button>
          <button type="button" class="sq ib dec" :aria-label="tr('Decline')" :data-tip="tr('Decline')" @click="decide(i.id, false)"><Icon name="close" :size="16" /></button>
        </template>
        <Button v-else size="s" type="tertiary" :loading="busy === i.id" @click="cancel(i.id)">{{ tr('Cancel request') }}</Button>
      </div>
    </section>

    <!-- 멤버 -->
    <section class="mgrp" :aria-label="tr('Members')">
      <h3 class="gh">{{ tr('Members') }}<span class="num muted">{{ members.length }}</span></h3>
      <div v-for="m in members" :key="m.member_id" class="row">
        <MemberAvatar :name="m.member?.name || m.member?.email || '?'" :src="m.member?.avatar_url" :size="28" />
        <span class="who"><b>{{ m.member?.name || m.member?.email || tr('Former member') }}<span v-if="m.member_id === me" class="you">{{ tr('(you)') }}</span></b><span>{{ m.member?.email }}</span></span>
        <EditorSelect v-if="canEdit(m)" class="row-role" :model-value="m.role" :options="memberOptions(m)" :aria-label="`Role for ${m.member?.name ?? ''}`" @update:model-value="(v) => onMemberRole(m, v)" />
        <span v-else class="row-role role-tx">{{ tr(ROLE_NAME[m.role]) }}</span>
      </div>
    </section>
    <AppConfirm
      v-if="confirmRemove"
      :title="tr('Remove {name}?', { name: confirmRemove.member?.name ?? '' })"
      :desc="tr('They lose access to this project right away. Their work stays')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmRemove = null) }, { label: tr('Remove'), kind: 'destructed', loading: busy === 'remove', onClick: doRemove }]"
      @close="confirmRemove = null"
    />
  </div>
</template>

<style scoped>
/* 공유 창 · 설정 '멤버' 탭: 초대 줄 → 승인 대기 → 멤버. 묶음 사이 20, 제목과 줄 사이 4, 줄 높이 48 — 선 없이 여백으로만 나눠요 */
.pm { display: flex; flex-direction: column; gap: var(--ref-spacing-11); }
.inv { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.f1 { flex: 1; min-width: 0; }
.inv-role { flex: none; width: 140px; }
/* 초대 줄: 입력칸(30) · 역할 · 버튼 높이를 모두 30 으로 */
.inv-role :deep(.dd) { height: 30px; }
.inv :deep(.bd-button) { height: 30px; min-height: 30px; }
/* 줄 안 버튼(Approve 등)은 역할 칸 · ✕ 와 같은 28 */
.row :deep(.bd-button) { height: 28px; min-height: 28px; }
.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: calc(-1 * var(--ref-spacing-08)) 0 0; color: var(--sys-color-theme-error-default); }
.hint { margin: calc(-1 * var(--ref-spacing-08)) 0 0; }
.mgrp { display: flex; flex-direction: column; }
/* 묶음 제목: 줄 왼쪽 끝(아바타)과 같은 선 */
.gh { display: flex; align-items: center; gap: var(--ref-spacing-03); height: 24px; margin: 0 0 var(--ref-spacing-02); font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.muted { color: var(--sys-color-neutral-500); font-weight: 400; }
.row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 12px; line-height: 18px; }
.who b { font-weight: 500; color: var(--sys-color-neutral-800); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who > span { color: var(--sys-color-neutral-500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.you { margin-left: var(--ref-spacing-03); color: var(--sys-color-neutral-500); font-weight: 400; }
/* 역할 칸: 선택 칸 · 글자 모두 같은 폭(140) — 바꿀 수 없는 역할은 선택 칸 글자와 같은 자리에서 시작해요 */
.row-role { flex: none; width: 140px; }
.role-tx { box-sizing: border-box; padding: 0 var(--ref-spacing-06); font-size: 12px; color: var(--sys-color-neutral-500); }
.dec { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-600); }
.dec:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
p.tx-meta { margin: 0; }
</style>
