<script setup lang="ts">
import { Button, Icon, TextInput } from '@ba-dream/design-system'
import { KIND_INFO, type ProjectKind } from '~/composables/useProjectActions'
import { STATUS_LABEL, type ProjectStatus } from '~/composables/useProjects'

/** 새 프로젝트 만들기(projectId 없음) · 프로젝트 설정(projectId 있음): 이름 · 설명 · 종류 · 단계 · 지우기 */
const props = defineProps<{ projectId?: string | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string]; removed: [] }>()
const actions = useProjectActions()

const editing = computed(() => !!props.projectId)
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
      } catch { err.value = '프로젝트 정보를 불러오지 못했어요.' }
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
  if (!n) { err.value = '프로젝트 이름을 적어주세요.'; return }
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
  } catch { err.value = editing.value ? '저장하지 못했어요. 잠시 뒤 다시 시도해주세요.' : '프로젝트를 만들지 못했어요. 잠시 뒤 다시 시도해주세요.' }
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
  } catch { err.value = '지우지 못했어요. 잠시 뒤 다시 시도해주세요.'; busy.value = false }
}
const STATUSES: ProjectStatus[] = ['planning', 'designing', 'developing', 'done']
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @mousedown.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="projTitle" class="sq dialog" @keydown="onKeydown">
        <header class="head">
          <h2 id="projTitle" class="tx-title">{{ editing ? '프로젝트 설정' : '새 프로젝트' }}</h2>
          <button type="button" class="ib" aria-label="닫기" @click="close"><Icon name="close" :size="20" /></button>
        </header>

        <form class="body" @submit.prevent="submit">
          <TextInput v-model:value="name" size="s" label="이름" placeholder="예: 착한구독 신청 플로우 개편" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :input-props="{ id: 'projName', maxlength: 60 }" :label-props="{ htmlFor: 'projName' }" />

          <template v-if="editing">
            <TextInput v-model:value="description" class="mt" size="s" label="설명" placeholder="무엇을 바꾸는 프로젝트인지 한 줄로" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :input-props="{ id: 'projDesc', maxlength: 120 }" :label-props="{ htmlFor: 'projDesc' }" />
          </template>

          <span class="tx-head mt">종류</span>
          <div class="kinds" role="radiogroup" aria-label="프로젝트 종류">
            <button v-for="(k, key) in KIND_INFO" :key="key" type="button" role="radio" :aria-checked="kind === key" :class="['sq', 'kind', { on: kind === key }]" @click="kind = key">
              <span class="sh-box" aria-hidden="true"><span class="sq shape" :class="key" /></span>
              <span class="tx-head">{{ k.label }}</span>
              <span class="tx-meta">{{ editing ? k.label + ' 화면' : k.desc }}</span>
            </button>
          </div>
          <span v-if="!editing" class="tx-meta">첫 페이지에 이 크기의 빈 화면을 하나 만들어 둘게요.</span>

          <template v-if="editing">
            <span class="tx-head mt">단계</span>
            <div class="seg" role="radiogroup" aria-label="단계">
              <button v-for="s in STATUSES" :key="s" type="button" role="radio" :aria-checked="status === s" :class="['sq', 'seg-item', { on: status === s }]" @click="status = s">{{ STATUS_LABEL[s] }}</button>
            </div>
          </template>

          <p v-if="err" class="tx-meta err" role="alert">{{ err }}</p>
          <button type="submit" class="sr" tabindex="-1">저장</button>
        </form>

        <div v-if="editing" class="danger-zone">
          <template v-if="!confirmDelete">
            <span class="tx-meta">프로젝트를 지우면 페이지 · 화면 · 문서 · 요구사항이 모두 함께 지워져요.</span>
            <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="trashbin" @click="confirmDelete = true">지우기</Button>
          </template>
          <template v-else>
            <span class="tx-meta red">정말 지울까요? 되돌릴 수 없어요.</span>
            <span class="row"><Button size="s" type="tertiary" @click="confirmDelete = false">취소</Button><Button size="s" type="destructed" :loading="busy" @click="remove">지우기</Button></span>
          </template>
        </div>

        <footer class="foot">
          <Button size="m" type="tertiary" class="w" @click="close">취소</Button>
          <Button size="m" type="primary" class="w" :loading="busy" :disabled="!name.trim()" @click="submit">{{ editing ? '저장' : '만들기' }}</Button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--dimmed-bg); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 480px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: auto; --sq-fill: var(--sys-color-common-white-default); border-radius: var(--ref-radius-08); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ref-spacing-08); padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-10); }
.body { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-12) var(--ref-spacing-10); }
.mt { margin-top: var(--ref-spacing-06); }
.kinds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.kind { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); padding: var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.kind:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.kind.on { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); }
.sh-box { height: 40px; display: flex; align-items: flex-end; margin-bottom: var(--ref-spacing-04); }
.shape { border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-20); --sq-line-w: 1px; }
.shape.app { width: 18px; height: 36px; }
.shape.web { width: 56px; height: 34px; }
.shape.detail_page { width: 14px; height: 40px; }
.err { color: var(--sys-color-theme-error-default); margin: var(--ref-spacing-04) 0 0; }
.danger-zone { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-08); margin: 0 var(--ref-spacing-12) var(--ref-spacing-10); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-04); background: var(--sys-color-neutral-100); }
.row { display: flex; gap: var(--ref-spacing-04); flex: none; }
.red { color: var(--sys-color-theme-error-default); }
.foot { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); }
.w { width: 100%; }
.kind:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.mt { margin-top: var(--ref-spacing-06); }
</style>
