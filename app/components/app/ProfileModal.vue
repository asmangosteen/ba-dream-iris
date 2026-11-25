<script setup lang="ts">
import { Button, Icon, TextInput } from '@ba-dream/design-system'
import { AVATAR_MAX_BYTES, ROLE_LABEL, squareAvatar, useMe, useUpdateMe, useUploadAvatar, type MemberRole, type MemberRow } from '~/composables/useMembers'
import MemberAvatar from '~/components/app/MemberAvatar.vue'

/** 내 프로필(사진 · 이름 · 역할) 고치기 — 영어 UI. v-model:open 으로 엽니다 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [member: MemberRow] }>()

const { data: me } = useMe()
const updateMe = useUpdateMe()
const preview = useDevPreview()

// 이 창은 영어 UI(편집기와 같은 말투)예요. 역할 이름도 영어로
const ROLE_EN: Record<MemberRole, string> = { planner: 'Planner', designer: 'Designer', developer: 'Developer' }
const ROLES = computed(() => (Object.keys(ROLE_LABEL) as MemberRole[]).map((k) => [k, tr(ROLE_EN[k])] as [MemberRole, string]))
const MAX_NAME = 40

const name = ref('')
const role = ref<MemberRole>('planner')
const saving = ref(false)
const error = ref('')

// 프로필 사진: 고르면 가운데 정사각형 256px 로 줄여 미리 보여 주고, 저장할 때 올려요. null = 사진 지우기
const fileEl = ref<HTMLInputElement | null>(null)
const photo = ref<{ blob: Blob; url: string } | null | undefined>(undefined) // undefined = 그대로
const photoUrl = computed(() => (photo.value === undefined ? me.value?.avatar_url : photo.value?.url ?? null))
const uploadAvatar = useUploadAvatar()
function clearPhotoUrl() { if (photo.value) URL.revokeObjectURL(photo.value.url) }
async function onPickPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!f.type.startsWith('image/')) { error.value = tr('Choose an image file (PNG, JPG, WEBP or GIF)'); return }
  if (f.size > AVATAR_MAX_BYTES) { error.value = tr('Photos can be up to 10 MB'); return }
  try {
    const blob = await squareAvatar(f)
    clearPhotoUrl()
    photo.value = { blob, url: URL.createObjectURL(blob) }
    error.value = ''
  } catch { error.value = tr("Couldn't open this photo. Try another one.") }
}
function removePhoto() { clearPhotoUrl(); photo.value = null }

const trimmed = computed(() => name.value.trim())
const changed = computed(() => !!me.value && (trimmed.value !== me.value.name || role.value !== me.value.role || photo.value !== undefined))
const canSave = computed(() => !saving.value && !!me.value && !!trimmed.value && trimmed.value.length <= MAX_NAME && changed.value)

async function save() {
  if (!canSave.value) {
    if (!trimmed.value) error.value = tr('Enter your name')
    return
  }
  saving.value = true
  error.value = ''
  try {
    const avatar_url = photo.value === undefined ? undefined : photo.value ? await uploadAvatar(photo.value.blob) : null
    const next = await updateMe({ name: trimmed.value, role: role.value, avatar_url })
    emit('saved', next)
    open.value = false
  } catch {
    error.value = tr("Couldn't save. Try again in a moment.")
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
    clearPhotoUrl()
    photo.value = undefined
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
  const list = ROLES.value
  const i = list.findIndex((r) => r[0] === role.value)
  role.value = list[(i + dir + list.length) % list.length]![0]
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
          <h1 id="profileTitle" class="ttl">{{ tr('Edit profile') }}</h1>
          <button type="button" class="sq ib" :aria-label="tr('Close')" @click="close"><Icon name="close" :size="16" /></button>
        </div>

        <form class="content" @submit.prevent="save">
          <div class="photo">
            <button type="button" class="pic" :aria-label="tr('Change profile photo')" @click="fileEl?.click()">
              <MemberAvatar :name="trimmed || me?.email || ''" :src="photoUrl" :size="48" />
              <span class="pic-edit" aria-hidden="true"><Icon name="camera" :size="12" /></span>
            </button>
            <div class="pic-act">
              <span class="lbl">{{ tr('Profile photo') }}</span>
              <span class="pic-btns">
                <button type="button" class="sq act" @click="fileEl?.click()">{{ photoUrl ? tr('Change') : tr('Upload') }}</button>
                <button v-if="photoUrl" type="button" class="sq act" @click="removePhoto">{{ tr('Remove') }}</button>
              </span>
            </div>
            <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="file" tabindex="-1" aria-hidden="true" @change="onPickPhoto">
          </div>
          <div class="col">
            <TextInput v-model:value="name" size="s" :label="tr('Name')" :placeholder="tr('What your team calls you')" :show-left-icon="false" :show-right-icon="false" :show-button="false" :show-supporting-text="false" :destructed="!!error && !trimmed" :input-props="{ id: 'profileName', maxlength: MAX_NAME, autocomplete: 'name' }" :label-props="{ htmlFor: 'profileName' }" />
          </div>
          <div class="col">
            <span class="lbl">{{ tr('Email') }}</span>
            <span class="tx-meta">{{ me?.email }}</span>
          </div>
          <div class="col">
            <span id="profileRoleLabel" class="lbl">{{ tr('Role') }}</span>
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
          <p v-if="preview" class="tx-meta">{{ tr("Preview mode — changes stay on this screen and aren't saved") }}</p>
          <p v-if="error" class="tx-meta err" role="alert"><Icon name="warning" :size="12" />{{ error }}</p>
        </form>

        <div class="foot">
          <Button size="s" type="tertiary" @click="close">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :loading="saving" :disabled="!canSave" @click="save">{{ tr('Save') }}</Button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 프로필 창: 폭 360 · 모서리 16 · 안쪽 16(머리 · 본문 · 아래 모두) · 항목 사이 16 · 라벨 → 칸 6. 버튼은 오른쪽 아래에 작게(s) — Cancel · Save */
.overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--dimmed-bg); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 360px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-default); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.top { display: flex; align-items: center; justify-content: space-between; height: 48px; box-sizing: border-box; padding: 0 var(--ref-spacing-08) 0 var(--ref-spacing-10); }
.ttl { margin: 0; font-size: 14px; line-height: 22px; font-weight: 600; }
.top .ib { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.top .ib:hover { --sq-fill: var(--sys-color-neutral-100); }
.content { flex: 1; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-10); margin: 0; }
.foot { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); }
.col { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.lbl { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.roles { margin-left: calc(-1 * var(--ref-spacing-06)); }
.photo { display: flex; align-items: center; gap: var(--ref-spacing-08); }
.pic { position: relative; flex: none; border-radius: 50%; }
.pic:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.pic:hover > :first-child { filter: brightness(.94); }
.pic-edit { position: absolute; right: -2px; bottom: -2px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-700); box-shadow: 0 0 0 0.5px var(--iris-float-line), 0 1px 2px rgb(3 9 26 / 12%); }
.pic-act { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.pic-btns { display: flex; gap: var(--ref-spacing-04); }
.pic-btns .act { height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-800); }
.pic-btns .act:hover { --sq-fill: var(--sys-color-neutral-200); }
.file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }
p.tx-meta { margin: 0; }
</style>
