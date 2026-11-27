<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { ROLE_NAME, accessError, useProjectAccess } from '~/composables/useProjectAccess'
import { relativeTime } from '~/composables/useProjects'

/**
 * 권한 안내 화면(PRD/16 B) — 프로젝트 링크를 열었는데 바로 들어갈 수 없을 때 편집기 대신 보여요.
 * invited(초대받음, 처음 열기) · expired(초대 만료) · none(멤버 아님) · requested(참여 요청 대기)
 * 멤버가 아니면 프로젝트 이름도 읽을 수 없어서(DB 규칙) '이 프로젝트'라고만 써요.
 */
const props = defineProps<{ projectId: string; projectName?: string | null }>()
const access = useProjectAccess(props.projectId)
const { gate, mine, welcome } = access
const members = useMembers()
const busy = ref(false)
const err = ref('')
const nameOf = (id: string | null | undefined) => (members.data.value ?? []).find((m) => m.id === id)?.name ?? tr('an owner')

const view = computed(() => {
  const g = gate.value
  const daysLeft = mine.value ? Math.max(0, Math.ceil((new Date(mine.value.expires_at).getTime() - Date.now()) / 86_400_000)) : 7
  if (g === 'invited') {
    const w = welcome.value
    const role = tr(ROLE_NAME[w?.role ?? 'viewer'])
    return { icon: 'check', tone: 'blue', title: props.projectName ? tr('You\'re invited to {name}', { name: props.projectName }) : tr('You\'re invited to this project'), desc: tr('{who} added you as {role}. You can open it now', { who: nameOf(w?.decided_by), role }), sub: role, cta: tr('Open project'), primary: true }
  }
  if (g === 'expired') return { icon: 'warning', tone: 'orange', title: tr('This invitation has expired'), desc: tr('Invitations are cancelled if no one approves them within 7 days. Ask to join and an owner or co-owner will approve'), sub: mine.value ? tr('Expired {ago}', { ago: relativeTime(mine.value.expires_at) }) : '', cta: tr('Request to join'), primary: true }
  if (g === 'requested') return { icon: 'clock', tone: 'gray', title: tr('Request sent'), desc: tr('We\'ll let you know when an owner or co-owner approves. Requests are cancelled after 7 days'), sub: tr('Waiting for approval · {n} days left', { n: daysLeft }), cta: tr('Requested'), primary: false }
  return { icon: 'lock', tone: 'gray', title: tr('You\'re not a member of this project'), desc: tr('Someone shared a link to a project you haven\'t joined. Ask to join and an owner or co-owner will approve'), sub: '', cta: tr('Request to join'), primary: true }
})

async function act() {
  err.value = ''
  busy.value = true
  try {
    if (gate.value === 'invited') await access.markSeen()
    else if (gate.value === 'expired' || gate.value === 'none') await access.requestJoin()
  } catch (e) { err.value = tr(accessError(e)) }
  busy.value = false
}
const btn = ref<HTMLElement | null>(null)
onMounted(() => nextTick(() => btn.value?.querySelector('button')?.focus()))
</script>

<template>
  <div v-if="gate" class="gate" role="main">
    <section class="sq pop card" aria-labelledby="gateTitle" aria-live="polite">
      <span :class="['mark', view.tone]" aria-hidden="true"><EditorIcon :name="view.icon" :size="20" /></span>
      <h1 id="gateTitle" class="ttl">{{ view.title }}</h1>
      <p class="pop-desc">{{ view.desc }}</p>
      <p v-if="view.sub" class="sq sub tx-meta">{{ view.sub }}</p>
      <p v-if="err" class="tx-meta err" role="alert">{{ err }}</p>
      <div ref="btn" class="acts">
        <Button size="m" :type="view.primary ? 'primary' : 'tertiary'" :disabled="gate === 'requested'" :loading="busy" @click="act">{{ view.cta }}</Button>
        <NuxtLink to="/" class="back">{{ tr('Back to projects') }}</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 편집기 자리를 덮어요(탭 막대는 그대로). 카드는 팝업 양식(.pop) — 가운데 */
.gate { position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--iris-canvas); }
.card { --pop-w: 400px; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-14) var(--ref-spacing-12) var(--ref-spacing-12); text-align: center; }
.mark { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; margin-bottom: var(--ref-spacing-04); }
.mark.blue { background: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
.mark.orange { background: color-mix(in srgb, var(--sys-color-theme-warning-default, #FF792C) 14%, transparent); color: var(--sys-color-theme-warning-default, #C4500F); }
.mark.gray { background: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); }
.ttl { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; color: var(--sys-color-neutral-800); }
.pop-desc { max-width: 320px; }
.sub { margin: var(--ref-spacing-04) 0 0; padding: var(--ref-spacing-04) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.err { margin: 0; color: var(--sys-color-theme-error-default); }
.acts { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); margin-top: var(--ref-spacing-08); }
.back { font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); text-decoration: none; }
.back:hover { color: var(--sys-color-neutral-800); text-decoration: underline; }
.back:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; border-radius: var(--ref-radius-02); }
</style>
