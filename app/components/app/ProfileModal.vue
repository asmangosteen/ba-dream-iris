<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import { ROLE_LABEL, useMe, useUpdateMe, type MemberRole, type MemberRow } from '~/composables/useMembers'

/** 내 프로필(이름 · 역할) 고치기. v-model:open 으로 엽니다 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [member: MemberRow] }>()

const { data: me } = useMe()
const updateMe = useUpdateMe()
const preview = useDevPreview()

const ROLES = Object.entries(ROLE_LABEL) as [MemberRole, string][]
const MAX_NAME = 40

const name = ref('')
const role = ref<MemberRole>('planner')
const saving = ref(false)
const error = ref('')

const trimmed = computed(() => name.value.trim())
const changed = computed(() => !!me.value && (trimmed.value !== me.value.name || role.value !== me.value.role))
const canSave = computed(() => !saving.value && !!me.value && !!trimmed.value && trimmed.value.length <= MAX_NAME && changed.value)

async function save() {
  if (!canSave.value) {
    if (!trimmed.value) error.value = '이름을 적어주세요'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const next = await updateMe({ name: trimmed.value, role: role.value })
    emit('saved', next)
    open.value = false
  } catch {
    error.value = '저장하지 못했어요. 잠시 뒤 다시 시도해주세요.'
  } finally {
    saving.value = false
  }
}

// 열기 · 닫기 · 접근성 ------------------------------------------------------
const dialog = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
function close() { if (!saving.value) open.value = false }
watch(open, async (v) => {
  if (v) {
    name.value = me.value?.name ?? ''
    role.value = me.value?.role ?? 'planner'
    error.value = ''
    returnFocus = document.activeElement as HTMLElement | null
    await nextTick()
    const el = dialog.value?.querySelector<HTMLInputElement>('#profileName')
    el?.focus()
    el?.select()
  } else {
    await nextTick()
    returnFocus?.focus?.()
  }
})
watch(name, () => { if (error.value) error.value = '' })
function focusables(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); close(); return }
  if (e.key !== 'Tab') return
  const list = focusables()
  if (!list.length) return
  const first = list[0]!, last = list[list.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
/** 역할 고르기: 화살표로 옮겨 다닙니다(radiogroup) */
function onRoleKey(e: KeyboardEvent) {
  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!dir) return
  e.preventDefault()
  const i = ROLES.findIndex((r) => r[0] === role.value)
  role.value = ROLES[(i + dir + ROLES.length) % ROLES.length]![0]
  nextTick(() => dialog.value?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @mousedown.self="close">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profileTitle"
        class="sq dialog"
        @keydown="onKeydown"
      >
        <div class="top">
          <h1 id="profileTitle" class="tx-title">프로필 고치기</h1>
          <button type="button" class="ib" aria-label="닫기" @click="close"><Icon name="close" :size="20" /></button>
        </div>

        <form class="content" @submit.prevent="save">
          <div class="col6">
            <label for="profileName" class="tx-head">이름</label>
            <span class="field m">
              <input id="profileName" v-model="name" :maxlength="MAX_NAME" autocomplete="name" placeholder="팀에서 부르는 이름" :aria-invalid="!!error && !trimmed">
            </span>
          </div>
          <div class="col6">
            <span class="tx-head">메일</span>
            <span class="tx-meta">{{ me?.email }}</span>
          </div>
          <div class="col6">
            <span id="profileRoleLabel" class="tx-head">역할</span>
            <div class="seg roles" role="radiogroup" aria-labelledby="profileRoleLabel" @keydown="onRoleKey">
              <button
                v-for="r in ROLES"
                :key="r[0]"
                type="button"
                role="radio"
                :aria-checked="role === r[0]"
                :tabindex="role === r[0] ? 0 : -1"
                :class="['sq', 'seg-item', { on: role === r[0] }]"
                @click="role = r[0]"
              >{{ r[1] }}</button>
            </div>
          </div>
          <p v-if="preview" class="tx-meta">미리보기에서는 이 화면에서만 바뀌고 저장되지 않아요</p>
          <p v-if="error" class="tx-meta err" role="alert"><Icon name="warning" :size="12" />{{ error }}</p>
        </form>

        <div class="foot">
          <button type="button" class="act m gray grow1" @click="close">취소</button>
          <button type="button" class="act m pri grow2" :disabled="!canSave" @click="save">{{ saving ? '저장하는 중' : '저장' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--dimmed-bg); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 400px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-default); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.top { display: flex; align-items: center; justify-content: space-between; padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-08); }
.content { flex: 1; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-10); margin: 0; }
.foot { display: flex; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); }
.grow1 { flex: 1; }
.grow2 { flex: 2.25; }
.act:disabled { opacity: .5; cursor: default; }
.col6 { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.roles { margin-left: calc(-1 * var(--ref-spacing-06)); }
.field.m:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }
p.tx-meta { margin: 0; }
</style>
