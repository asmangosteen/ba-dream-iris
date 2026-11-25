<script setup lang="ts">
import { Button, Icon, TextInput } from '@ba-dream/design-system'
import { KIND_INFO, type ProjectKind } from '~/composables/useProjectActions'
import { statusLabel, type ProjectStatus } from '~/composables/useProjects'

/** 새 프로젝트 만들기(projectId 없음) · 프로젝트 설정(projectId 있음): 이름 · 설명 · 종류 · 단계 · 지우기 */
const props = defineProps<{ projectId?: string | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string]; removed: [] }>()
const actions = useProjectActions()

const editing = computed(() => !!props.projectId)
/** 종류 카드 둘째 줄: 기기 이름(위) · 크기(아래) — 두 줄로 */
const KIND_DEVICE: Record<ProjectKind, string> = { app: 'Mobile', web: 'Desktop', detail_page: 'Long page' }
const name = ref('')
const description = ref('')
const kind = ref<ProjectKind>('app')
const status = ref<ProjectStatus>('planning')
const busy = ref(false)
const err = ref('')
const confirmDelete = ref(false)
const dialog = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null

watch(open, async (on) => {
  if (!import.meta.client) return
  if (on) {
    lastFocus = document.activeElement as HTMLElement | null
    err.value = ''
    confirmDelete.value = false
    if (props.projectId) {
      try {
        const d = await actions.detail(props.projectId)
        name.value = d.name; description.value = d.description ?? ''; kind.value = d.kind; status.value = d.status
      } catch { err.value = tr("Couldn't load the project.") }
    } else { name.value = ''; description.value = ''; kind.value = 'app'; status.value = 'planning' }
    await nextTick()
    dialog.value?.querySelector<HTMLInputElement>('input')?.focus()
  } else lastFocus?.focus?.()
})

function close() { if (!busy.value) open.value = false }
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key !== 'Tab' || !dialog.value) return
  const f = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])')]
  if (!f.length) return
  const first = f[0]!, last = f[f.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

async function submit() {
  const n = name.value.trim()
  if (!n) { err.value = tr('Enter a project name.'); return }
  busy.value = true
  err.value = ''
  try {
    if (props.projectId) {
      await actions.update(props.projectId, { name: n, description: description.value.trim() || null, kind: kind.value, status: status.value })
      open.value = false
    } else {
      const id = await actions.create(n, kind.value)
      open.value = false
      emit('created', id)
    }
  } catch { err.value = editing.value ? tr("Couldn't save. Try again in a moment.") : tr("Couldn't create the project. Try again in a moment.") }
  busy.value = false
}

async function remove() {
  if (!props.projectId) return
  busy.value = true
  try {
    await actions.remove(props.projectId)
    busy.value = false
    open.value = false
    emit('removed')
  } catch { err.value = tr("Couldn't delete. Try again in a moment."); busy.value = false }
}
const STATUSES: ProjectStatus[] = ['planning', 'designing', 'developing', 'done']
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pop-overlay" @mousedown.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="projTitle" class="sq pop" style="--pop-w: 440px" @keydown="onKeydown">
        <header class="pop-top">
          <h2 id="projTitle" class="pop-ttl">{{ editing ? tr('Project settings') : tr('New project') }}</h2>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="close"><Icon name="close" :size="16" /></button>
        </header>

        <form class="pop-body body" @submit.prevent="submit">
          <TextInput v-model:value="name" size="s" :label="tr('Name')" :placeholder="tr('e.g. Subscription sign-up flow redesign')" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :input-props="{ id: 'projName', maxlength: 60 }" :label-props="{ htmlFor: 'projName' }" />

          <template v-if="editing">
            <TextInput v-model:value="description" class="mt" size="s" :label="tr('Description')" :placeholder="tr('One line on what this project changes')" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :input-props="{ id: 'projDesc', maxlength: 120 }" :label-props="{ htmlFor: 'projDesc' }" />
          </template>

          <span class="tx-head mt">{{ tr('Type') }}</span>
          <div class="kinds" role="radiogroup" :aria-label="tr('Project type')">
            <button v-for="(k, key) in KIND_INFO" :key="key" type="button" role="radio" :aria-checked="kind === key" :class="['sq', 'kind', { on: kind === key }]" @click="kind = key">
              <span class="sh-box" aria-hidden="true"><span class="sq shape" :class="key" /></span>
              <span class="tx-head">{{ tr(k.label) }}</span>
              <span class="tx-meta kd">{{ tr(KIND_DEVICE[key]) }}<br><span class="num">{{ k.w }} × {{ k.h }}</span></span>
            </button>
          </div>

          <template v-if="editing">
            <span class="tx-head mt">{{ tr('Stage') }}</span>
            <div class="seg" role="radiogroup" :aria-label="tr('Stage')">
              <button v-for="s in STATUSES" :key="s" type="button" role="radio" :aria-checked="status === s" :class="['sq', 'seg-item', { on: status === s }]" @click="status = s">{{ statusLabel(s) }}</button>
            </div>
          </template>

          <p v-if="err" class="tx-meta err" role="alert">{{ err }}</p>
          <button type="submit" class="sr" tabindex="-1">{{ tr('Save') }}</button>
        </form>

        <div v-if="editing" class="sq danger-zone">
          <template v-if="!confirmDelete">
            <span class="tx-meta">{{ tr('Deleting a project also deletes all its pages, frames, docs and requirements.') }}</span>
            <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="trashbin" @click="confirmDelete = true">{{ tr('Delete') }}</Button>
          </template>
          <template v-else>
            <span class="tx-meta red">{{ tr("Delete this project? You can't undo this.") }}</span>
            <span class="row"><Button size="s" type="tertiary" @click="confirmDelete = false">{{ tr('Cancel') }}</Button><Button size="s" type="destructed" :loading="busy" @click="remove">{{ tr('Delete') }}</Button></span>
          </template>
        </div>

        <footer class="pop-foot">
          <Button size="s" type="tertiary" @click="close">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :loading="busy" :disabled="!name.trim()" @click="submit">{{ editing ? tr('Save') : tr('Create') }}</Button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준). 이 창 본문은 항목이 촘촘해서 사이 6 */
.body { gap: var(--ref-spacing-04); }
.mt { margin-top: var(--ref-spacing-06); }
.kinds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ref-spacing-06); }
.kind { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); padding: var(--ref-spacing-08); text-align: left; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.kind:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.kind.on { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); }
.sh-box { height: 40px; align-self: stretch; display: flex; align-items: flex-end; margin-bottom: var(--ref-spacing-04); }
.shape { border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-20); --sq-line-w: 1px; }
.shape.app { width: 18px; height: 36px; }
.shape.web { width: 56px; height: 34px; }
.shape.detail_page { width: 14px; height: 40px; }
.err { color: var(--sys-color-theme-error-default); margin: var(--ref-spacing-04) 0 0; }
.danger-zone { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-08); margin: 0 var(--ref-spacing-10) var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); }
.row { display: flex; gap: var(--ref-spacing-04); flex: none; }
.red { color: var(--sys-color-theme-error-default); }
.kd { white-space: nowrap; }
.kind:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.mt { margin-top: var(--ref-spacing-06); }
</style>
