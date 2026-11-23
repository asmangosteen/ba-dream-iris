<script setup lang="ts">
/**
 * 지금 값을 스타일(토큰)로 저장하고 바로 연결해요. 피그마의 'Create style'.
 * 저장한 스타일은 디자인 시스템 토큰 목록(DB tokens)에 들어가서 모든 프로젝트의 토큰 고르기에 보여요.
 */
const props = defineProps<{ type: 'color' | 'typography'; value: string; label: string }>()
const emit = defineEmits<{ created: [id: string] }>()
const { addTokens } = useIrisMutations()
const open = ref(false)
const name = ref('')
const busy = ref(false)
const err = ref('')
const input = ref<HTMLInputElement | null>(null)
async function toggle() {
  open.value = !open.value
  err.value = ''
  name.value = ''
  if (open.value) { await nextTick(); input.value?.focus() }
}
async function save() {
  const n = name.value.trim()
  if (!n || busy.value) return
  busy.value = true
  err.value = ''
  try {
    await addTokens([{ type: props.type, name: n, value: props.value, description: null }])
    await refreshNuxtData('ds-tokens')
    emit('created', 'db:' + n)
    open.value = false
  } catch { err.value = 'Could not save the style. Try again.' } finally { busy.value = false }
}
</script>

<template>
  <div class="sc">
    <button class="ib s24" :class="{ on: open }" :aria-label="label" :title="label" :aria-expanded="open" @click="toggle">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="3.5" cy="3.5" r="1.5" fill="currentColor" /><circle cx="10.5" cy="3.5" r="1.5" fill="currentColor" /><circle cx="3.5" cy="10.5" r="1.5" fill="currentColor" /><circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" /></svg>
    </button>
    <div v-if="open" class="sq pop" role="dialog" :aria-label="label">
      <span class="tx-head">{{ label }}</span>
      <label class="sq fld"><span>Name</span><input ref="input" v-model="name" aria-label="Style name" placeholder="e.g. brand/primary" @keydown.enter="save" @keydown.esc="open = false"></label>
      <span class="tx-meta val">{{ value }}</span>
      <span v-if="err" class="err">{{ err }}</span>
      <div class="end"><button class="sq act" @click="open = false">Cancel</button><button class="sq act pri" :disabled="!name.trim() || busy" @click="save">Create style</button></div>
    </div>
  </div>
</template>

<style scoped>
.sc { position: relative; }
.s24 { width: 24px; height: 24px; }
.ib.on { --sq-fill: var(--sys-color-neutral-200); }
.pop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 6; width: 220px; padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-04); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; filter: var(--iris-float-shadow); }
.val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err { font-size: 11px; color: var(--sys-color-system-error, #E5484D); }
.end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-02); }
.act { height: 24px; padding: 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-size: 11px; --sq-fill: var(--sys-color-neutral-200); }
.act.pri { --sq-fill: var(--sys-color-brand-primary-default); color: #FFFFFF; }
.act:disabled { opacity: 0.4; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
