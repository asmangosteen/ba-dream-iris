<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EmojiPicker from '~/components/editor/EmojiPicker.vue'
import ImageLightbox from '~/components/app/ImageLightbox.vue'
import { Button } from '@ba-dream/design-system'
import { mentionIds } from '~/composables/useComments'
import { MediaTooLargeError, prepareImage, useImageSrc } from '~/canvas/images'
import { floatPos, useScrollLock } from '~/composables/useFloatLayer'

/**
 * 코멘트 입력칸(피그마와 같아요): Enter 보내기 · ⇧Enter 줄바꿈 · Esc 닫기. @ 를 치면 이 프로젝트 멤버를 골라 넣어요(멘션 → 알림).
 * 치기 시작하면(또는 누르면) 아래 도구 막대가 열려요: 이모지(운영체제 기본 그림) · @ 태그 · 이미지 붙이기 + 둥근 보내기 버튼.
 * compact(답글)면 처음엔 한 줄 입력칸 + 보내기 버튼만
 */
export interface MentionPerson { id: string; name: string; avatar?: string | null; role?: string }
const props = withDefaults(defineProps<{ people: MentionPerson[]; placeholder?: string; autofocus?: boolean; busy?: boolean; up?: boolean; compact?: boolean; /** 숫자가 바뀌면 '쓰던 게 있어요' 표시: 글 전체 선택 + 좌우로 흔들기(피그마와 같아요) */ nudge?: number; /** 고치기: 처음 글 · 아래에 Cancel · Save(둥근 보내기 대신) */ initial?: string; editing?: boolean }>(), { placeholder: 'Add a comment', autofocus: false, busy: false, up: false, compact: false, nudge: 0, initial: '', editing: false })
const emit = defineEmits<{ send: [body: string, mentions: string[], attachments: string[]]; cancel: []; /** 쓰던 글 · 이미지가 있는지 */ dirty: [has: boolean] }>()
const text = ref(props.initial)
const ta = ref<HTMLTextAreaElement | null>(null)
const q = ref<string | null>(null)
const pick = ref(0)
const uid = useId()
const mirror = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)

/** 입력칸 아래에 깔린 같은 글자(멘션만 파랑 — 입력칸 글자는 투명, 커서만 보여요). 멤버 이름과 맞는 @이름만 */
const parts = computed(() => {
  const body = text.value
  const names = props.people.map((p) => '@' + p.name).filter((n) => body.includes(n)).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ t: body, m: false }]
  const re = new RegExp('(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')')
  return body.split(re).filter(Boolean).map((t) => ({ t, m: names.includes(t) }))
})
/** 한글 조합 중에도 바로 받아요(v-model 은 조합이 끝나야 바뀌어서, 투명 입력칸 아래 글자가 늦게 보여요) */
function onType(e: Event) { text.value = (e.target as HTMLTextAreaElement).value; readQuery(); grow() }
function syncScroll() { if (mirror.value && ta.value) mirror.value.scrollTop = ta.value.scrollTop }

const matches = computed(() => {
  if (q.value === null) return []
  const s = q.value.toLowerCase()
  // 이미 태그한 사람은 목록에서 빼요(지금 치고 있는 @글자는 빼고 본문을 봐요)
  const el = ta.value
  const pos = el?.selectionStart ?? text.value.length
  const rest = text.value.slice(0, pos).replace(/@([^\s@]{0,30})$/, '') + text.value.slice(pos)
  return props.people.filter((p) => !rest.includes('@' + p.name) && (!s || p.name.toLowerCase().includes(s))).slice(0, 6)
})
function readQuery() {
  const el = ta.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart ?? el.value.length)
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  q.value = m ? m[2]! : null
  pick.value = -1 // 처음엔 아무도 안 고른 채(나도 눌러야 멘션돼요)
}
/** 커서 자리에 글자 넣기(고른 글자는 바꿔요) */
function insert(s: string) {
  const el = ta.value
  if (!el) return
  const a = el.selectionStart ?? text.value.length, b = el.selectionEnd ?? a
  text.value = text.value.slice(0, a) + s + text.value.slice(b)
  const at = a + s.length
  nextTick(() => { el.focus(); el.setSelectionRange(at, at); grow(); readQuery() })
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
/** @ 버튼: 커서 자리에 @ 를 넣고 멤버 목록을 열어요(앞 글자에 붙지 않게 띄어 써요) */
function startMention() {
  emojiOpen.value = false // 이모지 창이 열려 있으면 닫고 멘션 목록으로
  const el = ta.value
  const a = el?.selectionStart ?? text.value.length
  insert(a > 0 && !/\s/.test(text.value[a - 1]!) ? ' @' : '@')
}

// --- 이모지 ---
const emojiOpen = ref(false)
// 멘션 목록(줄 32 × 사람 수 + 위아래 8) · 이모지 창(300 × 약 340): body 맨 위층(fixed)에 띄워 칸 밖으로 잘리지 않게(사용자 요청 2026-11-27)
const mentionAt = ref<{ left: number; top: number } | null>(null)
const emojiAt = ref<{ left: number; top: number } | null>(null)
function placeMention() {
  const n = matches.value.length
  if (!n || !root.value) { mentionAt.value = null; return }
  const h = Math.min(n * 32 + 12, 280)
  mentionAt.value = floatPos(root.value.getBoundingClientRect(), 240, h, props.up ? 'above' : 'below')
}
function placeEmoji() {
  if (!emojiOpen.value || !root.value) { emojiAt.value = null; return }
  emojiAt.value = floatPos(root.value.getBoundingClientRect(), 300, 344, 'above')
}
watch(() => matches.value.length, () => nextTick(placeMention))
watch(emojiOpen, () => nextTick(placeEmoji))
watch(text, () => { if (matches.value.length) nextTick(placeMention) })
// 열려 있는 동안 뒤 화면은 스크롤되지 않아요(창 안은 그대로)
useScrollLock(() => emojiOpen.value || !!matches.value.length, (el) => !!el.closest(`[data-cc="${uid}"]`))
function onEmoji(e: string) { emojiOpen.value = false; insert(e) }
/** 바깥을 누르면 이모지 창을 닫아요 */
function onDocDown(e: PointerEvent) {
  const t = e.target as Element | null
  if (emojiOpen.value && !root.value?.contains(t) && !t?.closest?.(`[data-cc="${uid}"]`)) emojiOpen.value = false
  // 멘션 목록: 목록 바깥을 누르면 닫아요(입력칸을 눌러도 — 다시 @ 를 치면 또 열려요)
  if (q.value !== null && !t?.closest?.('.mm')) q.value = null
}
onMounted(() => document.addEventListener('pointerdown', onDocDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))

// --- 이미지 붙이기(버튼 · 붙여 넣기) — 고르자마자 보이고, 올리기는 뒤에서. 보낼 때 다 올라갔는지 기다려요 ---
const supabase = useSupabaseClient()
const preview = useDevPreview()
const route = useRoute()
const resolveSrc = useImageSrc()
const fileEl = ref<HTMLInputElement | null>(null)
const atts = ref<{ src: string; done: Promise<void> }[]>([])
const err = ref('')
async function addFiles(files: File[]) {
  err.value = ''
  for (const f of files.filter((x) => x.type.startsWith('image/')).slice(0, 10 - atts.value.length)) {
    try {
      const r = await prepareImage(f, `comments/${String(route.params.projectId ?? 'x')}`, { supabase, preview: !!preview })
      atts.value = [...atts.value, { src: r.src, done: r.done }]
    } catch (e) { err.value = e instanceof MediaTooLargeError ? tr('Images can be up to 10 MB') : tr('Couldn\'t add the image. Try again') }
  }
  nextTick(() => ta.value?.focus())
}
function onFile(e: Event) { const el = e.target as HTMLInputElement; addFiles([...(el.files ?? [])]); el.value = '' }
function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  e.preventDefault()
  addFiles(files)
}
/** 붙인 이미지 크게 보기 */
const lbIndex = ref<number | null>(null)
const removeAtt = (i: number) => { atts.value = atts.value.filter((_, j) => j !== i) }

// 쓰던 게 있는지 알려요(바깥을 눌렀을 때 바로 닫지 않고 한 번 알려 주려고)
const shaking = ref(false)
watch(() => !!text.value.trim() || atts.value.length > 0, (v) => emit('dirty', v), { immediate: true })
watch(() => props.nudge, (n) => {
  if (!n) return
  const el = ta.value
  if (el) { el.focus(); el.select() }
  shaking.value = false
  nextTick(() => { shaking.value = true; setTimeout(() => (shaking.value = false), 420) })
})
const sending = ref(false)
const canSend = computed(() => (!!text.value.trim() || atts.value.length > 0) && !props.busy && !sending.value && (!props.editing || text.value.trim() !== props.initial.trim()))
async function send() {
  if (!canSend.value) return
  const body = text.value.trim()
  sending.value = true
  try {
    await Promise.all(atts.value.map((a) => a.done))
    emit('send', body, mentionIds(body, props.people), atts.value.map((a) => a.src))
    clear()
  } catch { err.value = tr('Couldn\'t upload the image. Try again') } finally { sending.value = false }
}
function clear() { text.value = ''; atts.value = []; err.value = ''; nextTick(grow) }
defineExpose({ clear, focus: () => ta.value?.focus() })
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (matches.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); pick.value = (pick.value + 1) % matches.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); pick.value = pick.value <= 0 ? matches.value.length - 1 : pick.value - 1; return }
    if ((e.key === 'Enter' || e.key === 'Tab') && pick.value >= 0) { e.preventDefault(); choose(matches.value[pick.value]!); return }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); q.value = null; return }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); emit('cancel') }
}
function grow() { const el = ta.value; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; syncScroll() }

/** 도구 막대: 치기 시작하거나 누르면 열려요(답글 칸은 처음엔 한 줄) */
const focused = ref(false)
/** 입력 중: 쓴 글 · 붙인 이미지가 있거나 이모지 창이 열림(누름은 :focus-within) */
const active = computed(() => !!text.value || atts.value.length > 0 || emojiOpen.value)
const expanded = computed(() => !props.compact || !!text.value || atts.value.length > 0 || emojiOpen.value)
// 한 줄 ↔ 펼침이 바뀌면 입력칸 높이를 다시 재요(다 지워서 한 줄로 돌아올 때 펼친 높이가 남아 상자가 커지던 것)
watch(expanded, () => nextTick(grow))
function onFocusOut(e: FocusEvent) { if (!root.value?.contains(e.relatedTarget as Node | null)) focused.value = false }
onMounted(() => { nextTick(() => { grow(); if (props.autofocus || props.editing) { const el = ta.value; el?.focus(); if (el && props.editing) el.setSelectionRange(el.value.length, el.value.length) } }) })
</script>

<template>
  <div ref="root" :class="['cc', { open: expanded, typing: active, shake: shaking }]" @focusin="focused = true" @focusout="onFocusOut">
    <div class="sq box" @click.self="ta?.focus()">
      <div class="inw" @click="ta?.focus()">
        <div ref="mirror" class="ta mirror" aria-hidden="true"><template v-for="(x, i) in parts" :key="i"><span v-if="x.m" class="at">{{ x.t }}</span><template v-else>{{ x.t }}</template></template>&#8203;</div>
        <textarea
          ref="ta" :value="text" rows="1" class="ta" spellcheck="false" autocomplete="off" :placeholder="tr(placeholder)" :aria-label="tr(placeholder)"
          :aria-controls="matches.length ? `${uid}-m` : undefined" :aria-expanded="!!matches.length" aria-autocomplete="list"
          @input="onType" @click="readQuery" @keydown="onKey" @scroll="syncScroll" @paste="onPaste"
        />
        <button v-if="!expanded" type="button" :class="['sq', 'send', 'mini', { on: canSend }]" :disabled="!canSend" :aria-label="tr('Send')" @click.stop="send"><EditorIcon name="send" :size="16" /></button>
      </div>
      <div v-if="atts.length" class="atts">
        <span v-for="(a, i) in atts" :key="a.src" class="sq att">
          <button type="button" class="att-open" :aria-label="tr('Open image')" @click="lbIndex = i"><img :src="resolveSrc(a.src)" alt=""></button>
          <button type="button" class="sq att-x" :aria-label="tr('Remove image')" @click="removeAtt(i)"><EditorIcon name="close" :size="12" /></button>
        </span>
      </div>
      <ImageLightbox v-model:index="lbIndex" :images="atts.map((x) => resolveSrc(x.src) ?? '').filter(Boolean)" />
      <p v-if="err" class="err" role="alert">{{ err }}</p>
      <div v-if="expanded" class="tools">
        <button type="button" :class="['sq', 'tl', { on: emojiOpen }]" :aria-label="tr('Add emoji')" :data-tip="tr('Add emoji')" :aria-expanded="emojiOpen" @mousedown.prevent @click="emojiOpen = !emojiOpen; q = null"><EditorIcon name="emoji" :size="16" /></button>
        <button type="button" class="sq tl" :aria-label="tr('Mention someone')" :data-tip="tr('Mention someone')" @mousedown.prevent @click="startMention"><EditorIcon name="mention" :size="16" /></button>
        <button type="button" class="sq tl" :aria-label="tr('Add image')" :data-tip="tr('Add image')" @mousedown.prevent @click="emojiOpen = false; q = null; fileEl?.click()"><EditorIcon name="image" :size="16" /></button>
        <span class="f1" />
        <template v-if="editing">
          <Button size="s" type="tertiary" stroke @click="emit('cancel')">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :disabled="!canSend" @click="send">{{ tr('Save') }}</Button>
        </template>
        <button v-else type="button" :class="['sq', 'send', { on: canSend }]" :disabled="!canSend" :aria-label="tr('Send')" :data-tip="tr('Send')" @click="send"><EditorIcon name="send" :size="16" /></button>
      </div>
      <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple class="sr" tabindex="-1" aria-hidden="true" @change="onFile">
    </div>
    <Teleport to="body">
    <div v-if="matches.length && mentionAt" :id="`${uid}-m`" :data-cc="uid" class="sq menu mm" :style="{ left: mentionAt.left + 'px', top: mentionAt.top + 'px' }" role="listbox" :aria-label="tr('Mention someone')">
      <button v-for="(p, i) in matches" :key="p.id" type="button" role="option" :aria-selected="i === pick" :class="['sq', 'menu-item', { on: i === pick }]" @mousedown.prevent="choose(p)">
        <MemberAvatar :name="p.name" :src="p.avatar" :size="20" /><span class="f1">{{ p.name }}</span><span v-if="p.role" class="tx-meta">{{ tr(p.role) }}</span>
      </button>
    </div>
    <EmojiPicker v-if="emojiOpen && emojiAt" :data-cc="uid" class="emo" :style="{ left: emojiAt.left + 'px', top: emojiAt.top + 'px' }" @pick="onEmoji" @close="emojiOpen = false; ta?.focus()" />
    </Teleport>
  </div>
</template>

<style scoped>
.cc { position: relative; }
/* 쓰던 게 있는데 바깥을 누르면: 좌우로 짧게 흔들어 알려요 */
.cc.shake { animation: cc-shake .4s cubic-bezier(.36, .07, .19, .97); }
/* 처음(6px)보다는 덜, 3px 보다는 더(사용자 요청 2026-11-27): 좌우 최대 5px, 점점 줄어요 */
@keyframes cc-shake { 15% { transform: translateX(-5px); } 30% { transform: translateX(5px); } 45% { transform: translateX(-4px); } 60% { transform: translateX(3px); } 75% { transform: translateX(-2px); } 90% { transform: translateX(1px); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cc.shake { animation: none; } }
/* 한 덩어리 입력 상자(피그마와 같아요): 글 · 붙인 이미지 · 아래 도구 막대 */
.box { display: flex; flex-direction: column; border-radius: 18px; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-float-line); --sq-line-w: 1px; cursor: text; }
/* 한 줄 상자: 핀과 같은 높이 36 · 알약 모양 */
.cc:not(.open) .box { --sq-fill: var(--sys-color-neutral-100); }
.box:hover { --sq-line: var(--ref-color-gray-900-20); }
/* 파란 테두리: 입력 중일 때만(누름 · 쓴 글 · 이미지 · 이모지 창). 늘 펼쳐 둔 입력칸(게시판)도 가만히 있을 땐 회색 — 사용자 요청 2026-11-27 */
.box:focus-within, .cc.typing .box { --sq-line: var(--sys-color-brand-primary-default); }
.inw { position: relative; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 8px var(--ref-spacing-08); }
.cc:not(.open) .inw { height: 36px; box-sizing: border-box; padding: 0 4px 0 var(--ref-spacing-08); }
.ta { flex: 1; min-width: 0; resize: none; border: 0; outline: 0; background: none; padding: 0; font: inherit; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-800); min-height: 18px; max-height: 120px; }
.cc.open .ta { min-height: 36px; }
.cc:not(.open) .ta:not(.mirror) { max-height: 18px; }
.ta::placeholder { color: var(--sys-color-neutral-500); }
/* 멘션 파랑: 입력칸 글자는 투명(커서만), 아래 같은 자리 같은 글꼴로 그린 글자가 보여요 — 줄바꿈 · 스크롤까지 같이 */
.ta:not(.mirror) { position: relative; color: transparent; caret-color: var(--sys-color-neutral-800); scrollbar-width: none; }
.ta:not(.mirror)::-webkit-scrollbar { display: none; }
.mirror { position: absolute; left: var(--ref-spacing-08); top: 8px; right: var(--ref-spacing-08); bottom: 8px; min-height: 0; overflow: hidden; white-space: pre-wrap; overflow-wrap: break-word; pointer-events: none; }
.cc:not(.open) .mirror { top: 9px; bottom: 9px; right: calc(4px + 32px + var(--ref-spacing-04)); }
.at { color: var(--sys-color-brand-primary-default); }
/* 붙인 이미지: 64 네모, 오른쪽 위 ✕ */
.atts { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-07) var(--ref-spacing-05); }
.att { position: relative; width: 64px; height: 64px; border-radius: var(--ref-radius-04); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; overflow: hidden; cursor: default; }
.att-open { display: block; width: 100%; height: 100%; padding: 0; cursor: zoom-in; }
.att img { width: 100%; height: 100%; object-fit: cover; display: block; }
.att-x { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; --sq-fill: rgb(3 9 26 / 60%); color: #FFFFFF; opacity: 0; transition: opacity .12s ease; }
.att:hover .att-x, .att-x:focus-visible { opacity: 1; }
.err { margin: 0; padding: 0 var(--ref-spacing-07) var(--ref-spacing-04); font-size: 11px; color: var(--sys-color-theme-error-default, #E72F37); }
/* 도구 막대: 위 선으로 나누고 이모지 · @ · 이미지, 오른쪽 끝 둥근 보내기 */
/* 도구 막대: 안쪽 4 — 보내기 버튼(반지름 14)이 상자 모서리(18)와 같은 중심으로 둥글어요 */
.tools { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: 4px; border-top: 1px solid var(--iris-line); cursor: default; }
.tl { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 14px; color: var(--sys-color-neutral-700); }
.tl:hover, .tl.on { --sq-fill: var(--sys-color-neutral-100); }
.f1 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
/* 보내기: 가로가 조금 긴 알약(32 × 28 · 반지름 14) */
.send { flex: none; width: 32px; height: 28px; display: grid; place-items: center; border-radius: 14px; --sq-fill: var(--sys-color-neutral-200); color: #FFFFFF; }
.send.on { --sq-fill: var(--sys-color-brand-primary-default); }
.send.on:hover { --sq-fill: var(--sys-color-brand-primary-dark, #2369C6); }
.send:disabled { cursor: default; }
.send.mini { align-self: center; }
/* 고치기 버튼(Cancel · Save): 높이 28, 사이 4 */
.tools :deep(.bd-button) { height: 28px; min-height: 28px; }
.tools :deep(.bd-button + .bd-button) { margin-left: var(--ref-spacing-02); }
.mm { position: fixed; right: auto; bottom: auto; width: 240px; box-sizing: border-box; z-index: 1000; }
/* 멘션 줄: 아바타(20)보다 위아래 여유 있게 32 — 공용 검은 메뉴는 줄 높이 24 를 !important 로 정해요 */
.mm .menu-item { height: 32px !important; min-height: 32px; }
.emo { position: fixed; z-index: 1000; }
.sr { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
