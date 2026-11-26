<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import { useNotifications, type NotificationRow } from '~/composables/useNotifications'
import { ROLE_NAME, type ProjectRole } from '~/composables/useProjectAccess'
import { relativeTime, useProjects } from '~/composables/useProjects'

/**
 * 알림 종 + 알림 목록(PRD/16 G) — 탭 막대 오른쪽 끝. 초대 요청 · 승인 · 역할 바뀜 등을 모아 보여요.
 * 실시간 반영은 2단계: 그 전에는 창으로 돌아올 때와 1분마다 새로 읽어요.
 */
const { list, unread, markRead, markAllRead } = useNotifications()
const projects = useProjects()
const members = useMembers()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const projName = (id: string | null) => (projects.data.value ?? []).find((p) => p.id === id)?.name ?? tr('a project')
const person = (id: string | null) => (members.data.value ?? []).find((m) => m.id === id) ?? null
const roleTx = (r: unknown) => tr(ROLE_NAME[(r as ProjectRole) ?? 'viewer'] ?? 'Can view')

/** 알림 한 줄 글(영어 원문 → tr) */
function textOf(n: NotificationRow): string {
  const p = projName(n.project_id)
  const who = person(n.actor_id)?.name ?? tr('Someone')
  const email = String(n.payload?.email ?? '')
  switch (n.kind) {
    case 'invite_request': return tr('{who} wants to invite {email} to {project}', { who, email, project: p })
    case 'join_request': return tr('{email} asked to join {project}', { email, project: p })
    case 'invited': return tr('You were added to {project} · {role}', { project: p, role: roleTx(n.payload?.role) })
    case 'invite_approved': return tr('{email} can now open {project}', { email, project: p })
    case 'invite_rejected': return tr('Your invite for {email} to {project} was declined', { email, project: p })
    case 'role_changed': return n.payload?.role === 'owner' ? tr('You\'re now the owner of {project}', { project: p }) : tr('Your role in {project} is now {role}', { project: p, role: roleTx(n.payload?.role) })
    case 'removed': return tr('You were removed from {project}', { project: p })
    case 'mention': return tr('{who} mentioned you in {project}', { who, project: p })
    case 'reply': return tr('{who} replied to a comment in {project}', { who, project: p })
    case 'comment_resolved': return tr('{who} resolved your comment #{no} in {project}', { who, no: String(n.payload?.no ?? ''), project: p })
    default: return tr('Something changed in {project}', { project: p })
  }
}
/** 처리된 요청: 승인 · 거절 · 취소 · 만료 */
function decidedTx(v: unknown) {
  return v === 'approved' ? tr('Approved') : v === 'rejected' ? tr('Declined') : v === 'expired' ? tr('Expired') : tr('Cancelled')
}
/** 요청 알림 = 할 일(방장 · 부방장이 승인해야) → 공유 창을 열어 줘요 */
const isAsk = (n: NotificationRow) => n.kind === 'invite_request' || n.kind === 'join_request'

function go(n: NotificationRow) {
  markRead([n.id])
  open.value = false
  if (!n.project_id || n.kind === 'removed') return
  const isComment = n.target_type === 'comment' && n.target_id
  navigateTo({ path: `/p/${n.project_id}`, query: isAsk(n) ? { share: '1' } : isComment ? { comment: n.target_id! } : undefined })
}

function toggle() {
  open.value = !open.value
  if (open.value) list.refresh()
}
function onDoc(e: PointerEvent) { if (open.value && !root.value?.contains(e.target as Node)) open.value = false }
function onKey(e: KeyboardEvent) { if (open.value && e.key === 'Escape') { e.stopPropagation(); open.value = false; root.value?.querySelector<HTMLElement>('.bell')?.focus() } }
const onFocus = () => list.refresh()
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  document.addEventListener('pointerdown', onDoc, true)
  window.addEventListener('focus', onFocus)
  timer = setInterval(() => { if (document.visibilityState === 'visible') list.refresh() }, 60_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc, true)
  window.removeEventListener('focus', onFocus)
  clearInterval(timer)
})
const label = computed(() => (unread.value ? tr('Notifications, {n} unread', { n: unread.value }) : tr('Notifications')))
</script>

<template>
  <div ref="root" class="nb" @keydown="onKey">
    <button type="button" :class="['sq', 'bell', { on: open }]" :aria-label="label" :data-tip="tr('Notifications')" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <Icon name="bell" :size="20" />
      <span v-if="unread" class="cnt num" aria-hidden="true">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
    <section v-if="open" class="sq panel" role="dialog" :aria-label="tr('Notifications')">
      <header class="hd">
        <h2 class="tx-head">{{ tr('Notifications') }}</h2>
        <button v-if="unread" type="button" class="sq act" @click="markAllRead">{{ tr('Mark all as read') }}</button>
      </header>
      <div v-if="!(list.data.value ?? []).length" class="empty">
        <Icon name="bell" :size="24" class="muted" />
        <span class="tx-head">{{ tr('No notifications yet') }}</span>
        <span class="tx-meta">{{ tr('Invites, role changes and requests show up here') }}</span>
      </div>
      <ul v-else class="items">
        <li v-for="n in list.data.value" :key="n.id">
          <button type="button" :class="['sq', 'item', { unread: !n.read_at }]" @click="go(n)">
            <MemberAvatar :name="person(n.actor_id)?.name || String(n.payload?.email ?? '?')" :src="person(n.actor_id)?.avatar_url" :size="28" />
            <span class="body">
              <span class="txt">{{ textOf(n) }}</span>
              <span v-if="n.target_type === 'comment' && n.payload?.excerpt" class="sq quote">{{ n.payload.excerpt }}</span>
              <span class="tx-meta">{{ relativeTime(n.created_at) }}<template v-if="isAsk(n) && n.payload?.decided"> · {{ decidedTx(n.payload.decided) }}</template><template v-else-if="isAsk(n) && !n.read_at"> · <span class="ask">{{ tr('Needs your approval') }}</span></template></span>
            </span>
            <i v-if="!n.read_at" class="dot" :aria-label="tr('Unread')" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.nb { position: relative; flex: none; }
.bell { position: relative; width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); transition: background-color .12s ease, color .12s ease; }
.bell:hover, .bell.on { --sq-overlay: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.bell:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 안 읽은 수: 종 오른쪽 위 작은 원(원형이라 squircle 예외) */
.cnt { position: absolute; top: 4px; right: 3px; min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box; border-radius: 7px; display: grid; place-items: center; background: var(--sys-color-theme-error-default); color: #FFFFFF; font-size: 9px; line-height: 14px; font-weight: 600; box-shadow: 0 0 0 1.5px var(--iris-canvas); }
/* 다크: 어두운 바탕에서 묻히지 않게 더 선명한 빨강(사용자 요청 2026-11-27) */
:root[data-theme="dark"] .cnt { background: #FF3B42; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cnt { background: #FF3B42; } }
.panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; width: 360px; max-height: min(520px, calc(100vh - 80px)); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.hd { flex: none; display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); }
.hd .tx-head { font-size: 14px; line-height: 22px; }
.act { height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); font-weight: 500; color: var(--sys-color-brand-primary-default); }
.act:hover { --sq-fill: var(--sys-color-neutral-100); }
.items { list-style: none; margin: 0; padding: 0 var(--ref-spacing-06) var(--ref-spacing-06); overflow-y: auto; }
/* 줄 모서리: 창(20)에서 안쪽 여백(8)만큼 뺀 12 — 맨 아래 줄 호버가 창 모서리와 같은 중심으로 둥글어요 */
.item { width: 100%; display: flex; align-items: flex-start; gap: var(--ref-spacing-06); padding: var(--ref-spacing-06) var(--ref-spacing-06); border-radius: var(--ref-radius-06); text-align: left; }
.item:hover { --sq-fill: var(--sys-color-neutral-100); }
.item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.txt { color: var(--sys-color-neutral-700); }
.item.unread .txt { color: var(--sys-color-neutral-800); font-weight: 500; }
.quote { padding: 2px var(--ref-spacing-04); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ask { color: var(--sys-color-brand-primary-default); }
.dot { flex: none; width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); }
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-12) var(--ref-spacing-10) var(--ref-spacing-14); text-align: center; }
.empty .muted { color: var(--sys-color-neutral-400); margin-bottom: var(--ref-spacing-04); }
</style>
