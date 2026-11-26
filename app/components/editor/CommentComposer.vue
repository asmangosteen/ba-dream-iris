<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import { Button } from '@ba-dream/design-system'
import { mentionIds } from '~/composables/useComments'

/**
 * 코멘트 입력칸: Enter 보내기 · ⇧Enter 줄바꿈 · Esc 닫기. @ 를 치면 이 프로젝트 멤버를 골라 넣어요(멘션 → 알림)
 * 모양은 디자인 시스템 입력칸(TextInput s: 흰 바탕 · 회색 10% 선 · radius-05 · 안쪽 6/10, 누르면 파란 선) + 아래 팝업 버튼 줄(DS Button s)
 */
export interface MentionPerson { id: string; name: string; avatar?: string | null; role?: string }
const props = withDefaults(defineProps<{ people: MentionPerson[]; placeholder?: string; autofocus?: boolean; busy?: boolean; up?: boolean; submitLabel?: string; cancelLabel?: string }>(), { placeholder: 'Add a comment', autofocus: false, busy: false, up: false, submitLabel: 'Post', cancelLabel: undefined })
const emit = defineEmits<{ send: [body: string, mentions: string[]]; cancel: [] }>()
const text = ref('')
const ta = ref<HTMLTextAreaElement | null>(null)
const q = ref<string | null>(null)
const pick = ref(0)
const uid = useId()

const matches = computed(() => {
  if (q.value === null) return []
  const s = q.value.toLowerCase()
  return props.people.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 6)
})
function readQuery() {
  const el = ta.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart ?? el.value.length)
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  q.value = m ? m[2]! : null
  pick.value = 0
}
function choose(p: MentionPerson) {
  const el = ta.value
  if (!el) return
  const pos = el.selectionStart ?? text.value.length
  const before = text.value.slice(0, pos).replace(/@([^\s@]{0,30})$/, '@' + p.name + ' ')
  text.value = before + text.value.slice(pos)
  q.value = null
  nextTick(() => { el.focus(); el.setSelectionRange(before.length, before.length); grow() })
}
function send() {
  const body = text.value.trim()
  if (!body || props.busy) return
  emit('send', body, mentionIds(body, props.people))
  clear()
}
function clear() { text.value = ''; nextTick(grow) }
defineExpose({ clear, focus: () => ta.value?.focus() })
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (matches.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick.value = (pick.value + 1) % matches.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); pick.value = (pick.value - 1 + matches.value.length) % matches.value.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches.value[pick.value]!); return }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); q.value = null; return }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); emit('cancel') }
}
function grow() { const el = ta.value; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
onMounted(() => { if (props.autofocus) nextTick(() => ta.value?.focus()) })
</script>

<template>
  <div class="cc">
    <div class="sq box" @click="ta?.focus()">
      <textarea
        ref="ta" v-model="text" rows="1" class="ta" :placeholder="tr(placeholder)" :aria-label="tr(placeholder)"
        :aria-controls="matches.length ? `${uid}-m` : undefined" :aria-expanded="!!matches.length" aria-autocomplete="list"
        @input="readQuery(); grow()" @click="readQuery" @keydown="onKey"
      />
    </div>
    <div v-if="matches.length" :id="`${uid}-m`" :class="['sq', 'menu', 'mm', { up }]" role="listbox" :aria-label="tr('Mention someone')">
      <button v-for="(p, i) in matches" :key="p.id" type="button" role="option" :aria-selected="i === pick" :class="['sq', 'menu-item', { on: i === pick }]" @mousedown.prevent="choose(p)">
        <MemberAvatar :name="p.name" :src="p.avatar" :size="20" /><span class="f1">{{ p.name }}</span><span v-if="p.role" class="tx-meta">{{ tr(p.role) }}</span>
      </button>
      <p class="tx-meta note">{{ tr('Only people in this project are listed') }}</p>
    </div>
    <div class="acts">
      <Button v-if="cancelLabel" size="s" type="tertiary" @click="emit('cancel')">{{ tr(cancelLabel) }}</Button>
      <Button size="s" type="primary" :disabled="!text.trim()" :loading="busy" @click="send">{{ tr(submitLabel) }}</Button>
    </div>
  </div>
</template>

<style scoped>
.cc { position: relative; }
.box { display: flex; padding: var(--ref-spacing-05) var(--ref-spacing-07); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; cursor: text; }
.box:hover { --sq-line: var(--ref-color-gray-900-20); }
.box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.ta { flex: 1; min-width: 0; resize: none; border: 0; outline: 0; background: none; padding: 0; font: inherit; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-800); min-height: 36px; max-height: 120px; }
.acts { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-08); }
.ta::placeholder { color: var(--sys-color-neutral-500); }
.mm { top: calc(100% - 36px); left: 0; right: auto; width: 240px; z-index: 5; }
.mm.up { top: auto; bottom: calc(100% + 4px); }
.mm .menu-item { height: 32px; }
.f1 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.note { margin: 0; padding: var(--ref-spacing-02) var(--ref-spacing-06) var(--ref-spacing-03, 6px); font-size: 11px; line-height: 16px; }
</style>
