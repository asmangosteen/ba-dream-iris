<script setup lang="ts">
import type { CommentRow, Thread } from '~/composables/useComments'
import type { MentionPerson } from '~/components/editor/CommentComposer.vue'
import CommentComposer from '~/components/editor/CommentComposer.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EmojiPicker from '~/components/editor/EmojiPicker.vue'
import ImageLightbox from '~/components/app/ImageLightbox.vue'
import { useImageSrc } from '~/canvas/images'
import { floatPos, useScrollLock } from '~/composables/useFloatLayer'

/**
 * 스레드 글 목록 + 답글 줄(캔버스 코멘트 창 CommentLayer 와 같은 모양 · 동작) — 문서 댓글(메모 · 게시판)에서 써요.
 * 글마다 아바타 · 이름 · 시각, ⋯ 메뉴(내 글 Edit, 글이 2개 이상이면 내 글 Delete · 방장 · 부방장은 남의 글 Delete), 😊 반응, 붙인 이미지.
 * 아래 답글 줄: 내 아바타 + 한 줄 입력칸(reply = false 면 숨겨요)
 */
const props = withDefaults(defineProps<{
  thread: Thread
  people: MentionPerson[]
  authors?: { id: string; name: string; avatar?: string | null }[]
  myId: string | null
  canModerate?: boolean
  /** 아래 답글 줄 보이기 */
  reply?: boolean
  /** 첫 글을 빼고 답글만(첫 글은 부모가 따로 그릴 때) */
  repliesOnly?: boolean
  busy?: boolean
  autofocus?: boolean
}>(), { authors: undefined, canModerate: false, reply: true, repliesOnly: false, busy: false, autofocus: false })
const emit = defineEmits<{
  reply: [root: CommentRow, body: string, mentions: string[], attachments: string[]]
  edit: [c: CommentRow, body: string, mentions: string[]]
  remove: [c: CommentRow]
  removeMsg: [c: CommentRow]
  react: [c: CommentRow, emoji: string]
  cancel: []
}>()

const resolveSrc = useImageSrc()
const person = (id: string | null) => (props.authors ?? props.people).find((p) => p.id === id) ?? null
const nameOf = (id: string | null) => person(id)?.name ?? tr('Former member')
const me = computed(() => person(props.myId))
const msgs = computed(() => (props.repliesOnly ? props.thread.replies : [props.thread.root, ...props.thread.replies]))

function parts(body: string) {
  const names = (props.authors ?? props.people).map((p) => '@' + p.name).filter((n) => body.includes(n)).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ t: body, m: false }]
  const re = new RegExp('(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  return body.split(re).filter(Boolean).map((t) => ({ t, m: names.includes(t) }))
}
const canEditMsg = (c: CommentRow) => c.author_id === props.myId
/** 지우기: 내 글 · 방장 · 부방장. 첫 글을 지우면 스레드째(확인 창) */
const canDeleteMsg = (c: CommentRow) => c.author_id === props.myId || props.canModerate

const root = ref<HTMLElement | null>(null)
/** ⋯ 메뉴 · 😊 창은 body 맨 위층(fixed)에 띄워요 — 메모 칸처럼 잘리는 칸 안에서도 잘리지 않게(사용자 요청 2026-11-27) */
const uid = useId()
const msgMenu = ref<{ c: CommentRow; left: number; top: number } | null>(null)
function openMsgMenu(c: CommentRow, e: MouseEvent) {
  if (msgMenu.value?.c.id === c.id) { msgMenu.value = null; return }
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  msgMenu.value = { c, ...floatPos(b, 140, 76, 'below', 'right') }
}
const editingId = ref<string | null>(null)
function deleteMsg(c: CommentRow) {
  msgMenu.value = null
  if (c.id === props.thread.root.id) emit('remove', c)
  else emit('removeMsg', c)
}

const rx = ref<{ c: CommentRow; left: number; top: number } | null>(null)
const reactionsOf = (c: CommentRow) => Object.entries(c.reactions ?? {}).filter(([, ids]) => ids.length)
const mine = (ids: string[]) => !!props.myId && ids.includes(props.myId)
const whoReacted = (ids: string[]) => ids.map((id) => (id === props.myId ? tr('You') : nameOf(id))).join(', ')
function openReact(c: CommentRow, e: MouseEvent) {
  if (rx.value?.c.id === c.id) { rx.value = null; return }
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  rx.value = { c, ...floatPos(b, 300, 344, 'below', 'right', 6) }
}
function pickReaction(emoji: string) { const r = rx.value; rx.value = null; if (r) emit('react', r.c, emoji) }
function onDocDown(e: PointerEvent) {
  const el = e.target as Element | null
  if (rx.value && !el?.closest?.('.rx-pick, .rx-add')) rx.value = null
  if (msgMenu.value && !el?.closest?.('.msg-more')) msgMenu.value = null
}
onMounted(() => document.addEventListener('pointerdown', onDocDown, true))
// 열려 있는 동안 뒤 화면은 스크롤되지 않아요(창 안은 그대로)
useScrollLock(() => !!rx.value || !!msgMenu.value, (el) => !!el.closest(`[data-ctv="${uid}"]`))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))
const imgCount = (c: CommentRow) => c.attachments?.length ?? 0
/** 붙인 이미지 크게 보기(공용 ImageLightbox) — 썸네일은 작은 1:1(사용자 요청 2026-11-27) */
const lb = ref<{ images: string[]; index: number | null }>({ images: [], index: null })
function viewImage(c: CommentRow, i: number) { lb.value = { images: (c.attachments ?? []).map((x) => resolveSrc(x) ?? '').filter(Boolean), index: i } }
</script>

<template>
  <div ref="root" class="ctv">
    <div v-for="c in msgs" :key="c.id" :class="['msg', { reply: c.id !== thread.root.id }]">
      <span class="mh">
        <MemberAvatar :name="nameOf(c.author_id)" :src="person(c.author_id)?.avatar" :size="24" /><b>{{ nameOf(c.author_id) }}</b><span class="tx-meta">{{ relativeTime(c.created_at) }}<template v-if="c.edited_at"> · {{ tr('edited') }}</template></span>
        <span v-if="canEditMsg(c) || canDeleteMsg(c)" :class="['msg-more', { on: msgMenu?.c.id === c.id }]">
          <button type="button" class="sq pop-x mb-x" :aria-label="tr('More')" :aria-expanded="msgMenu?.c.id === c.id" @click="openMsgMenu(c, $event)"><EditorIcon name="menu_meatball" :size="16" /></button>
        </span>
      </span>
      <CommentComposer v-if="editingId === c.id" class="ed" :people="people" :initial="c.body" editing @send="(b, m) => { editingId = null; if (b !== c.body) emit('edit', c, b, m) }" @cancel="editingId = null" />
      <div v-else-if="c.body" class="body-row">
        <p class="body"><template v-for="(x, i) in parts(c.body)" :key="i"><b v-if="x.m" class="at">{{ x.t }}</b><template v-else>{{ x.t }}</template></template></p>
        <button v-if="!reactionsOf(c).length" type="button" :class="['sq', 'pop-x', 'rx-add', 'rx-hover', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
      </div>
      <div v-if="imgCount(c)" class="imgs">
        <button v-for="(src, i) in c.attachments" :key="src" type="button" class="sq img" :aria-label="tr('Open image')" @click="viewImage(c, i)"><img :src="resolveSrc(src)" alt=""></button>
            <!-- 글 없이 이미지만 있으면 😊 는 이미지 줄 끝에 -->
            <button v-if="!c.body && !reactionsOf(c).length" type="button" :class="['sq', 'pop-x', 'rx-add', 'rx-hover', 'rx-img', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
      </div>
      <div v-if="reactionsOf(c).length" class="rx-row">
        <button
          v-for="[emo, ids] in reactionsOf(c)" :key="emo" type="button" :class="['sq', 'rx', { me: mine(ids) }]" :aria-pressed="mine(ids)"
          :aria-label="`${emo} ${ids.length}`" :data-tip="whoReacted(ids)" @click="emit('react', c, emo)"
        ><span class="rx-e">{{ emo }}</span><span class="num">{{ ids.length }}</span></button>
        <button type="button" :class="['sq', 'pop-x', 'rx-add', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
      </div>
    </div>
    <Teleport to="body">
    <div v-if="msgMenu" :data-ctv="uid" class="sq menu mm msg-more msg-menu" role="menu" :style="{ left: msgMenu.left + 'px', top: msgMenu.top + 'px' }">
      <button v-if="canEditMsg(msgMenu.c)" type="button" role="menuitem" class="sq menu-item" @click="editingId = msgMenu!.c.id; msgMenu = null">{{ tr('Edit') }}</button>
      <button v-if="canDeleteMsg(msgMenu.c)" type="button" role="menuitem" class="sq menu-item danger" @click="deleteMsg(msgMenu!.c)">{{ msgMenu.c.id === thread.root.id ? tr('Delete thread') : tr('Delete') }}</button>
    </div>
    <ImageLightbox v-model:index="lb.index" :images="lb.images" />
      <EmojiPicker v-if="rx" :data-ctv="uid" class="rx-pick" :style="{ left: rx.left + 'px', top: rx.top + 'px' }" @pick="pickReaction" @close="rx = null" />
    </Teleport>
    <div v-if="reply" class="foot">
      <MemberAvatar :name="me?.name ?? '?'" :src="me?.avatar" :size="24" class="fa" />
      <CommentComposer :key="thread.root.id" compact :autofocus="autofocus" :busy="busy" :people="people" placeholder="Reply" class="grow" @send="(b, m, a) => emit('reply', thread.root, b, m, a)" @cancel="emit('cancel')" />
    </div>
  </div>
</template>

<style scoped>
/* CommentLayer 스레드 창과 같은 값: 글 사이 12 · 이름 줄 8 · 글은 아바타만큼(32) 들여 */
.ctv { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.msg { display: flex; flex-direction: column; gap: var(--ref-spacing-03); }
/* 답글 · 답글 입력칸: 프로필이 첫 댓글 글자 시작선(아바타 24 + 간격 8 = 32)에 오게 들여요(사용자 요청 2026-11-27) */
.msg.reply, .foot { margin-left: 32px; }
.mh { display: flex; gap: var(--ref-spacing-06); align-items: center; min-width: 0; }
.mh b { font-weight: 600; color: var(--sys-color-neutral-800); white-space: nowrap; }
.mh .tx-meta { white-space: nowrap; }
.msg-more { position: relative; margin-left: auto; opacity: 0; }
.msg:hover .msg-more, .msg-more.on, .msg-more:focus-within { opacity: 1; }
.mb-x { width: 28px; height: 24px; }
.msg-menu { position: fixed; right: auto; bottom: auto; width: 140px; box-sizing: border-box; z-index: 1000; opacity: 1; margin: 0; }
.ed { margin-left: 32px; }
.body { margin: 0; padding-left: 32px; color: var(--sys-color-neutral-800); white-space: pre-wrap; overflow-wrap: anywhere; }
.at { font-weight: 500; color: var(--sys-color-brand-primary-default); }
.body-row { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); }
.body-row .body { flex: 1; min-width: 0; }
.rx-add { flex: none; width: 28px; height: 28px; border-radius: 14px; color: var(--sys-color-neutral-600); }
.rx-hover { opacity: 0; margin-top: -5px; }
.msg:hover .rx-hover, .rx-hover.on, .rx-hover:focus-visible { opacity: 1; }
.rx-add.on { --sq-fill: var(--sys-color-neutral-100); }
.rx-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-06); padding-left: 32px; margin-top: var(--ref-spacing-02); }
.rx { height: 28px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: var(--ref-spacing-05); padding: 0 var(--ref-spacing-06); border-radius: 14px; --sq-fill: var(--sys-color-neutral-100); --sq-line: transparent; --sq-line-w: 1px; font-size: 12px; font-weight: 600; color: var(--sys-color-neutral-700); }
.rx:hover { --sq-fill: var(--sys-color-neutral-200); }
.rx.me { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); color: var(--sys-color-brand-primary-default); }
.rx-e { font-size: 16px; line-height: 1; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.rx-pick { position: fixed; z-index: 1000; }
.rx-img { margin-top: 0; margin-left: auto; align-self: flex-start; }
.imgs { padding-left: 32px; display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }
.img { display: block; width: 64px; height: 64px; flex: none; padding: 0; border-radius: var(--ref-radius-04); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; overflow: hidden; cursor: zoom-in; }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.img:hover img { opacity: .9; }
.img:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 답글 줄: 내 아바타 + 한 줄 입력칸(36) — 아바타는 입력칸 가운데 높이 */
.foot { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); margin-top: var(--ref-spacing-02); }
.fa { flex: none; margin-top: 6px; }
.grow { flex: 1; min-width: 0; }
</style>
