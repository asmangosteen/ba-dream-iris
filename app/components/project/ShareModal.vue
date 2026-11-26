<script setup lang="ts">
import { Button, Icon } from '@ba-dream/design-system'
import AppConfirm from '~/components/app/AppConfirm.vue'
import ProjectMembersPanel from '~/components/project/ProjectMembersPanel.vue'
import { accessError, useProjectAccess } from '~/composables/useProjectAccess'
import { useToastReq } from '~/composables/useLayerMenu'

/**
 * 공유 창(PRD/16 A) — 사내 링크 공유 + 멤버 초대. 바깥 공유는 없어요(@ba-dream.com 만).
 * 초대 · 승인 · 멤버 역할은 ProjectMembersPanel(설정 '멤버' 탭과 같은 부품), 여기에는 링크 복사 · 나가기만
 */
const props = defineProps<{ projectId: string; projectName: string }>()
const open = defineModel<boolean>('open', { required: true })
const access = useProjectAccess(props.projectId)
const { role, me } = access
const toastReq = useToastReq()
const say = (text: string) => (toastReq.value = { text, at: Date.now() })

const confirmLeave = ref(false)
const leaving = ref(false)
async function doLeave() {
  leaving.value = true
  try { await access.remove(me.value!); confirmLeave.value = false; open.value = false; navigateTo('/') } catch (e) { say(tr(accessError(e))) }
  leaving.value = false
}
async function copyLink() {
  try { await navigator.clipboard.writeText(`${location.origin}/p/${props.projectId}`); say(tr('Link copied')) } catch { say(tr('Couldn\'t copy the link')) }
}

// 열기 · 닫기 · 포커스
const dialog = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null
watch(open, (v) => {
  if (!import.meta.client) return
  if (v) { lastFocus = document.activeElement as HTMLElement | null; access.data.refresh() }
  else lastFocus?.focus?.()
})
function close() { open.value = false }
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); close(); return }
  if (e.key !== 'Tab' || !dialog.value) return
  const f = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')]
  if (!f.length) return
  const first = f[0]!, last = f[f.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pop-overlay" @mousedown.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="shareTitle" class="sq pop" style="--pop-w: 520px" @keydown="onKeydown">
        <header class="pop-top">
          <h2 id="shareTitle" class="pop-ttl">{{ tr('Share “{name}”', { name: projectName }) }}</h2>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="close"><Icon name="close" :size="16" /></button>
        </header>
        <div class="pop-body">
          <ProjectMembersPanel :project-id="projectId" autofocus />
        </div>
        <footer class="pop-foot foot">
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="link" @click="copyLink">{{ tr('Copy link') }}</Button>
          <span class="f1" />
          <Button v-if="role && role !== 'owner'" size="s" type="tertiary" @click="confirmLeave = true">{{ tr('Leave') }}</Button>
        </footer>
      </section>
    </div>
    <AppConfirm
      v-if="confirmLeave"
      :title="tr('Leave “{name}”?', { name: projectName })"
      :desc="tr('You lose access right away. To come back, ask an owner or co-owner')"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmLeave = false) }, { label: tr('Leave'), kind: 'destructed', loading: leaving, onClick: doLeave }]"
      @close="confirmLeave = false"
    />
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준) */
.foot { justify-content: flex-start; }
.f1 { flex: 1; }
</style>
