<script setup lang="ts">
import type { CommentRow, Thread } from '~/composables/useComments'
import type { DocRow, LinkRow, ProjectScreen, ReqRow } from '~/composables/useIrisData'
import CommentComposer from '~/components/editor/CommentComposer.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import CommentThreadView from '~/components/editor/CommentThreadView.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'

/**
 * 문서 댓글(새 4, B안 확정): Word 메모처럼 문서 옆 카드(part='notes') + 문서 아래 게시판(part='board').
 * 메모를 누르면 문서의 그 정책 줄과 캔버스의 그 화면이 함께 강조돼요. 정책에 연결된 화면이 있으면 그 화면 위에도 같은 스레드가 핀으로 붙어요.
 */
export type DocAnchor = NonNullable<CommentRow['doc_anchor']>
const props = defineProps<{
  part: 'notes' | 'board'
  projectId: string
  doc: DocRow
  reqs: ReqRow[]
  links: LinkRow[]
  screens: ProjectScreen[]
}>()
const emit = defineEmits<{ 'pick-req': [id: string]; go: [anchor: DocAnchor]; toast: [text: string]; close: [] }>()
/** 고른 메모(스레드 id) — 부모가 캔버스 강조에 써요 */
const active = defineModel<string | null>('active', { default: null })
/** 새 메모를 쓸 자리(문서에서 글을 고르고 [Comment]) */
const draft = defineModel<DocAnchor | null>('draft', { default: null })

const comments = useComments(props.projectId)
const access = useProjectAccess(props.projectId)
const members = useMembers()
const people = computed(() => access.members.value.map((m) => ({ id: m.member_id, name: m.member?.name || m.member?.email || '?', avatar: m.member?.avatar_url ?? null })))
const who = (id: string) => people.value.find((p) => p.id === id) ?? (members.data.value ?? []).map((m) => ({ id: m.id, name: m.name || m.email, avatar: m.avatar_url ?? null })).find((p) => p.id === id) ?? { id, name: tr('Former member'), avatar: null }

const all = computed(() => comments.docThreads(props.doc.id))
const showResolved = ref(false)
const notes = computed(() => all.value.filter((t) => !!t.root.doc_anchor && (showResolved.value || !t.root.resolved_at)).sort(byPlace))
const board = computed(() => all.value.filter((t) => !t.root.doc_anchor).sort((a, b) => (a.root.created_at < b.root.created_at ? 1 : -1)))
const resolvedCount = computed(() => all.value.filter((t) => !!t.root.doc_anchor && t.root.resolved_at).length)

/** 문서 순서대로(블록 → 행) */
const blockIndex = computed(() => new Map((props.doc.content_blocks ?? []).map((b, i) => [b.id, i])))
function byPlace(a: Thread, b: Thread) {
  const pa = blockIndex.value.get(a.root.doc_anchor?.block ?? '') ?? 1e6, pb = blockIndex.value.get(b.root.doc_anchor?.block ?? '') ?? 1e6
  return pa - pb || (a.root.doc_anchor?.row ?? 0) - (b.root.doc_anchor?.row ?? 0) || (a.root.created_at < b.root.created_at ? -1 : 1)
}
const reqByCode = computed(() => new Map(props.reqs.map((r) => [r.code.toUpperCase(), r])))
const screenName = (id: string) => props.screens.find((s) => s.id === id)?.name ?? ''
/** 메모가 가리키는 화면들: 핀이 붙은 화면 + 그 정책에 연결된 화면 */
function screensOf(t: Thread): string[] {
  const r = t.root.doc_anchor?.code ? reqByCode.value.get(t.root.doc_anchor.code.toUpperCase()) : null
  const ids = new Set<string>()
  if (t.root.screen_id) ids.add(t.root.screen_id)
  if (r) for (const l of props.links) if (l.requirement_id === r.id) ids.add(l.screen_id)
  return [...ids]
}
function pick(t: Thread) {
  active.value = active.value === t.root.id ? null : t.root.id
  if (!active.value) return
  if (t.root.doc_anchor) emit('go', t.root.doc_anchor)
  comments.markRead(t.root.id)
}

const busy = ref(false)
const myId = computed(() => comments.myId.value)
const canModerate = computed(() => access.role.value === 'owner' || access.role.value === 'deputy')
const me = computed(() => who(myId.value ?? ''))
/** 새 메모 남기기: 정책에 연결된 화면이 있으면 그 화면 왼쪽 위에도 핀으로 */
async function sendNote(body: string, mentions: string[], attachments: string[] = []) {
  const at = draft.value
  if (!at || busy.value) return
  busy.value = true
  try {
    const r = at.code ? reqByCode.value.get(at.code.toUpperCase()) : null
    const sid = r ? props.links.find((l) => l.requirement_id === r.id)?.screen_id ?? null : null
    const pageId = sid ? props.screens.find((s) => s.id === sid)?.page_id ?? null : null
    const row = await comments.createDoc(props.doc.id, at, body, mentions, sid ? { screenId: sid, pageId, x: 16, y: 16 } : null, attachments)
    draft.value = null
    active.value = row.id
  } catch { emit('toast', tr("Couldn't post the comment. Try again")) } finally { busy.value = false }
}
async function sendBoard(body: string, mentions: string[], attachments: string[] = []) {
  if (busy.value) return
  busy.value = true
  try { await comments.createDoc(props.doc.id, null, body, mentions, null, attachments) }
  catch { emit('toast', tr("Couldn't post the comment. Try again")) } finally { busy.value = false }
}
const replying = ref<string | null>(null)

/**
 * 연 메모 바깥을 누르면 접어요(사용자 요청 2026-11-27).
 * 떠 있는 창(이모지 · 멘션 · ⋯ 메뉴) · 확인 창 · 크게 보기가 열려 있으면 그 창만 닫히게 두고, 답글을 쓰던 중이면 접지 않아요
 */
function onOutside(e: PointerEvent) {
  if (!active.value || props.part !== 'notes') return
  const t = e.target as Element | null
  if (!t?.closest) return
  // 다른 메모를 누르면 여기서 접지 않고 그 메모의 pick 이 바로 바꿔 펼쳐요(먼저 접으면 카드가 줄어 누른 자리가 밀려서 안 열림)
  if (t.closest('[data-note]')) return
  if (document.querySelector('[data-cc], [data-ctv], .pop-overlay, .lb')) return
  const card = document.querySelector(`[data-note="${active.value}"]`)
  if ([...(card?.querySelectorAll('textarea') ?? [])].some((a) => (a as HTMLTextAreaElement).value.trim())) return
  active.value = null
}
onMounted(() => window.addEventListener('pointerdown', onOutside, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onOutside, true))
async function sendReply(root: CommentRow, body: string, mentions: string[], attachments: string[] = []) {
  if (busy.value) return
  busy.value = true
  try { await comments.reply(root, body, mentions, attachments); replying.value = null }
  catch { emit('toast', tr("Couldn't post the reply. Try again")) } finally { busy.value = false }
}
async function resolve(t: Thread) {
  try { await comments.resolve(t.root, !t.root.resolved_at); if (active.value === t.root.id && !showResolved.value) active.value = null }
  catch { emit('toast', tr("Couldn't change it. Try again")) }
}
async function edit(c: CommentRow, body: string, mentions: string[]) {
  try { await comments.edit(c, body, mentions) } catch { emit('toast', tr("Couldn't change it. Try again")) }
}
async function react(c: CommentRow, emoji: string) {
  try { await comments.react(c, emoji) } catch { emit('toast', tr("Couldn't change it. Try again")) }
}
/** 지우기 확인(캔버스 코멘트와 같은 창 · 문구) */
const confirmThread = ref<CommentRow | null>(null)
const confirmMsg = ref<CommentRow | null>(null)
async function removeConfirmed(c: CommentRow | null) {
  confirmThread.value = null
  confirmMsg.value = null
  if (!c) return
  try { await comments.remove(c); if (active.value === c.id) active.value = null } catch { emit('toast', tr("Couldn't delete. Try again")) }
}
const quote = (a: DocAnchor | null | undefined) => (a?.quote ? '“' + (a.quote.length > 80 ? a.quote.slice(0, 79) + '…' : a.quote) + '”' : '')
/** 태그한 자리: 그 블록이 든 장 제목 · 표 행(정책 번호가 있으면 번호) */
function placeOf(a: DocAnchor | null | undefined): string {
  const blocks = props.doc.content_blocks ?? []
  const i = blocks.findIndex((b) => b.id === a?.block)
  const head = i >= 0 ? [...blocks.slice(0, i + 1)].reverse().find((b) => b.type === 'h1' || b.type === 'h2')?.text : null
  const row = a?.code ? a.code : a?.row ? tr('row {n}', { n: a.row }) : null
  return [head, row].filter(Boolean).join(' · ') || props.doc.title
}
defineExpose({ count: computed(() => all.value.filter((t) => !t.root.resolved_at).length) })
</script>

<template>
  <!-- 문서 옆 메모 -->
  <div v-if="part === 'notes'" class="notes" :aria-label="tr('Notes')">
    <div class="nh">
      <span class="tx-head">{{ tr('Notes') }}</span>
      <span class="tx-meta">{{ notes.length }}</span>
      <span class="f1" />
      <button v-if="resolvedCount" type="button" class="sq tbtn" :aria-pressed="showResolved" @click="showResolved = !showResolved">{{ showResolved ? tr('Hide resolved') : tr('Resolved {n}', { n: resolvedCount }) }}</button>
      <button type="button" class="sq xbtn" :aria-label="tr('Hide notes')" :data-tip="tr('Hide notes')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
    </div>

    <!-- 새 메모 -->
    <div v-if="draft" class="sq card on">
      <span class="where" :title="quote(draft) || undefined">{{ placeOf(draft) }}</span>
      <div class="newrow">
        <MemberAvatar :name="me.name" :src="me.avatar" :size="24" class="fa" />
        <CommentComposer :people="people" placeholder="Add a note" compact autofocus :busy="busy" class="grow" @send="(b: string, m: string[], a: string[]) => sendNote(b, m, a)" @cancel="draft = null" />
      </div>
    </div>

    <p v-if="!notes.length && !draft" class="tx-meta empty">{{ tr('Select text in the document and choose Comment to leave a note beside it') }}</p>

    <div v-for="t in notes" :key="t.root.id" :data-note="t.root.id" :class="['sq', 'card', { on: active === t.root.id, done: !!t.root.resolved_at }]">
      <div class="ch">
        <!-- 어디서 태그했는지: 장 · ID(굵게) — 누르면 문서의 그 글에 노란 밑줄 -->
        <button type="button" class="where" :aria-expanded="active === t.root.id" :title="quote(t.root.doc_anchor) || undefined" @click="pick(t)">{{ placeOf(t.root.doc_anchor) }}</button>
        <span v-if="t.unread" class="udot" :aria-label="tr('Unread')" />
        <button type="button" :class="['sq', 'pop-x', 'rs', { ok: !!t.root.resolved_at }]" :aria-pressed="!!t.root.resolved_at" :aria-label="t.root.resolved_at ? tr('Reopen') : tr('Resolve')" :data-tip="t.root.resolved_at ? tr('Reopen') : tr('Resolve')" @click="resolve(t)"><EditorIcon name="resolve" :size="16" /></button>
      </div>
      <!-- 접힌 메모: 첫 글 미리보기 -->
      <button v-if="active !== t.root.id" type="button" class="peek" @click="pick(t)">
        <span class="mh"><MemberAvatar :name="who(t.root.author_id).name" :src="who(t.root.author_id).avatar" :size="24" /><b>{{ who(t.root.author_id).name }}</b><span class="tx-meta">{{ relativeTime(t.root.created_at) }}</span></span>
        <span v-if="t.root.body" class="pt">{{ t.root.body }}</span>
        <span v-else-if="t.root.attachments?.length" class="pt tx-meta">{{ t.root.attachments.length === 1 ? tr('1 image') : tr('{n} images', { n: t.root.attachments.length }) }}</span>
        <span v-if="t.replies.length" class="tx-meta rc">{{ t.replies.length === 1 ? tr('1 reply') : tr('{n} replies', { n: t.replies.length }) }}</span>
      </button>
      <!-- 연 메모: 캔버스 코멘트 창과 같은 스레드 -->
      <CommentThreadView
        v-else
        :thread="t" :people="people" :my-id="myId" :can-moderate="canModerate" :busy="busy"
        @reply="sendReply" @edit="edit" @react="react" @remove="(c) => (confirmThread = c)" @remove-msg="(c) => (confirmMsg = c)" @cancel="active = null"
      />
    </div>
  </div>

  <!-- 아래 게시판: 문서 전체 댓글 -->
  <section v-else class="board" :aria-label="tr('Comments')">
    <div class="nh"><span class="tx-head">{{ tr('Comments') }}</span><span class="tx-meta">{{ board.length === 1 ? tr('1 on the whole document') : tr('{n} on the whole document', { n: board.length }) }}</span></div>
    <div class="newrow">
      <MemberAvatar :name="me.name" :src="me.avatar" :size="24" class="fa" />
      <CommentComposer :people="people" placeholder="Add a comment" :busy="busy" class="grow" @send="(b: string, m: string[], a: string[]) => sendBoard(b, m, a)" />
    </div>
    <div v-for="t in board" :key="t.root.id" class="post">
      <CommentThreadView
        :thread="t" :people="people" :my-id="myId" :can-moderate="canModerate" :busy="busy" :reply="replying === t.root.id" autofocus
        @reply="sendReply" @edit="edit" @react="react" @remove="(c) => (confirmThread = c)" @remove-msg="(c) => (confirmMsg = c)" @cancel="replying = null"
      />
      <button v-if="replying !== t.root.id" type="button" class="sq tbtn rbtn" @click="replying = t.root.id"><EditorIcon name="comment" :size="14" />{{ t.replies.length ? tr('Reply · {n}', { n: t.replies.length }) : tr('Reply') }}</button>
    </div>
  </section>

  <AppConfirm
    v-if="confirmThread"
    :title="tr('Delete this thread?')"
    :desc="tr('The comment and all its replies are deleted for everyone')"
    :actions="[{ label: tr('Cancel'), onClick: () => (confirmThread = null) }, { label: tr('Delete thread'), kind: 'destructed', onClick: () => removeConfirmed(confirmThread) }]"
    @close="confirmThread = null"
  />
  <AppConfirm
    v-if="confirmMsg"
    :title="tr('Delete this comment?')"
    :desc="tr('It\'s deleted for everyone')"
    :actions="[{ label: tr('Cancel'), onClick: () => (confirmMsg = null) }, { label: tr('Delete'), kind: 'destructed', onClick: () => removeConfirmed(confirmMsg) }]"
    @close="confirmMsg = null"
  />
</template>

<style scoped>
.notes { display: flex; flex-direction: column; gap: var(--ref-spacing-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.nh { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
/* 메모 칸 머리: 수정 기록 머리와 같은 위 막대(높이 44 · 아래 선 · 스크롤해도 위에) — 칸 안쪽 여백(--notes-pad-*)만큼 바깥으로 */
.notes > .nh { position: sticky; top: calc(-1 * var(--notes-pad-t, 16px)); z-index: 2; height: 44px; box-sizing: border-box; margin: calc(-1 * var(--notes-pad-t, 16px)) calc(-1 * var(--notes-pad-x, 16px)) var(--ref-spacing-04); padding: 0 calc(var(--notes-pad-x, 16px) - 4px) 0 var(--notes-pad-x, 16px); background: var(--sys-color-common-white-emphasis); box-shadow: 0 1px 0 var(--iris-line); }
/* 닫기(X): 수정 기록 머리의 X 와 같은 28 버튼 */
.xbtn { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); }
.xbtn:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.xbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.f1 { flex: 1; }
.empty { margin: 0; }
.tbtn { display: inline-flex; align-items: center; gap: var(--ref-spacing-03); height: 24px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 12px; color: var(--sys-color-neutral-600); }
.tbtn:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.tbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* 메모 카드(Word 노트): 접힘 = 옅은 노란 종이, 고르면 흰 카드 + 노란 선. 안쪽 12 · 줄 사이 8 */
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) var(--ref-spacing-08) var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: #FFFDF3; --sq-line: #F3E2A6; --sq-line-w: 1px; }
.card.on { --sq-fill: var(--sys-color-common-white-default); --sq-line: #E8C14A; filter: drop-shadow(0 6px 12px rgb(3 9 26 / 8%)); }
.card.done { opacity: .6; }
.ch { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.tags { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
/* 태그한 자리: 장 · ID 굵은 글씨 한 줄 */
.where { flex: 1; min-width: 0; display: block; line-height: 24px; text-align: left; font-weight: 600; color: var(--sys-color-neutral-800); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch { align-items: center; }
.where:focus-visible, .peek:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; border-radius: var(--ref-radius-03); }
.qt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arrow { margin: 0 1px; }
.udot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); }
.rs { flex: none; width: 24px; height: 24px; color: var(--sys-color-neutral-500); }
.rs.ok { color: var(--sys-color-theme-success-default, #24A638); }
.peek { display: flex; flex-direction: column; gap: var(--ref-spacing-03); text-align: left; color: inherit; }
.mh { display: flex; gap: var(--ref-spacing-06); align-items: center; min-width: 0; }
.mh b { font-weight: 600; white-space: nowrap; }
.pt { padding-left: 32px; color: var(--sys-color-neutral-800); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.rc { padding-left: 32px; }
/* 노트(문서 옆 메모) 안 입력창만 곡률 12 — 좁은 카드 안에서 18 은 너무 둥글어요(사용자 요청 2026-11-27). 게시판 · 다른 입력창은 그대로 */
.notes :deep(.cc .box) { border-radius: var(--ref-radius-06); }
.newrow { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); }
.fa { flex: none; margin-top: 6px; }
.grow { flex: 1; min-width: 0; }
.ellipsis { min-width: 0; max-width: 132px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 11px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); white-space: nowrap; }
.sid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 11px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }

/* 게시판: 새 글 줄(내 아바타 + 입력칸) 아래로 글마다 구분선, 글 사이 16 */
/* 게시판 위 구분선: 문서 패널 폭 끝까지(안쪽 여백만큼 바깥으로 넓히고 다시 안쪽 여백) */
.board { display: flex; flex-direction: column; gap: var(--ref-spacing-08); margin: var(--ref-spacing-14) calc(-1 * var(--doc-pad-x, 24px)) 0; padding: var(--ref-spacing-10) var(--doc-pad-x, 24px) 0; box-shadow: 0 -1px 0 var(--iris-line); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.post { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding-top: var(--ref-spacing-08); box-shadow: 0 -1px 0 var(--iris-line); }
.rbtn { align-self: flex-start; margin-left: 28px; } /* 아이콘이 글자 시작선(32)에 오게: 버튼 안쪽 여백 4 만큼 덜 */
</style>
