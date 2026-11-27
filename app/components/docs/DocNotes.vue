<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
import type { CommentRow, Thread } from '~/composables/useComments'
import { mentionIds } from '~/composables/useComments'
import type { DocRow, LinkRow, ProjectScreen, ReqRow } from '~/composables/useIrisData'
import CommentComposer from '~/components/editor/CommentComposer.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'

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
const emit = defineEmits<{ 'pick-req': [id: string]; go: [anchor: DocAnchor]; toast: [text: string] }>()
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
/** 새 메모 남기기: 정책에 연결된 화면이 있으면 그 화면 왼쪽 위에도 핀으로 */
async function sendNote(body: string, picked: string[]) {
  const at = draft.value
  if (!at || busy.value) return
  busy.value = true
  try {
    const r = at.code ? reqByCode.value.get(at.code.toUpperCase()) : null
    const sid = r ? props.links.find((l) => l.requirement_id === r.id)?.screen_id ?? null : null
    const pageId = sid ? props.screens.find((s) => s.id === sid)?.page_id ?? null : null
    const row = await comments.createDoc(props.doc.id, at, body, mentionIds(body, picked.map((id) => who(id))), sid ? { screenId: sid, pageId, x: 16, y: 16 } : null)
    draft.value = null
    active.value = row.id
  } catch { emit('toast', tr("Couldn't post the comment. Try again")) } finally { busy.value = false }
}
async function sendBoard(body: string, picked: string[]) {
  if (busy.value) return
  busy.value = true
  try { await comments.createDoc(props.doc.id, null, body, mentionIds(body, picked.map((id) => who(id)))) }
  catch { emit('toast', tr("Couldn't post the comment. Try again")) } finally { busy.value = false }
}
const replying = ref<string | null>(null)
async function sendReply(t: Thread, body: string, picked: string[]) {
  if (busy.value) return
  busy.value = true
  try { await comments.reply(t.root, body, mentionIds(body, picked.map((id) => who(id)))); replying.value = null }
  catch { emit('toast', tr("Couldn't post the reply. Try again")) } finally { busy.value = false }
}
async function resolve(t: Thread) {
  try { await comments.resolve(t.root, !t.root.resolved_at); if (active.value === t.root.id && !showResolved.value) active.value = null }
  catch { emit('toast', tr("Couldn't change it. Try again")) }
}
const quote = (a: DocAnchor | null | undefined) => (a?.quote ? '“' + (a.quote.length > 60 ? a.quote.slice(0, 59) + '…' : a.quote) + '”' : '')
defineExpose({ count: computed(() => all.value.filter((t) => !t.root.resolved_at).length) })
</script>

<template>
  <!-- 문서 옆 메모 -->
  <div v-if="part === 'notes'" class="notes" :aria-label="tr('Notes')">
    <div class="nh">
      <span class="tx-head">{{ tr('Notes') }}</span>
      <span class="tx-meta num">{{ notes.length }}</span>
      <span class="f1" />
      <button v-if="resolvedCount" type="button" class="sq tbtn" :aria-pressed="showResolved" @click="showResolved = !showResolved">{{ showResolved ? tr('Hide resolved') : tr('Resolved {n}', { n: resolvedCount }) }}</button>
    </div>

    <!-- 새 메모 -->
    <div v-if="draft" class="sq card on">
      <span class="tags">
        <span v-if="draft.code" class="sq pid num">{{ draft.code }}</span>
        <span class="tx-meta ellipsis">{{ quote(draft) }}</span>
      </span>
      <CommentComposer :people="people" :placeholder="tr('Write a note. @ to mention')" autofocus :busy="busy" @send="(b: string, m: string[]) => sendNote(b, m)" @cancel="draft = null" />
    </div>

    <p v-if="!notes.length && !draft" class="tx-meta empty">{{ tr('Select text in the document and choose Comment to leave a note beside it') }}</p>

    <div v-for="t in notes" :key="t.root.id" :class="['sq', 'card', { on: active === t.root.id, done: !!t.root.resolved_at }]">
      <button type="button" class="head" :aria-expanded="active === t.root.id" @click="pick(t)">
        <span class="tags">
          <span v-if="t.root.doc_anchor?.code" class="sq pid num">{{ t.root.doc_anchor.code }}</span>
          <template v-for="sid in screensOf(t)" :key="sid"><span class="tx-meta arrow">→</span><span class="sq sid ellipsis" :title="screenName(sid)">{{ screenName(sid) }}</span></template>
          <span v-if="t.unread" class="udot" :aria-label="tr('Unread')" />
        </span>
        <span class="msg">
          <MemberAvatar :name="who(t.root.author_id).name" :src="who(t.root.author_id).avatar" :size="20" />
          <span class="mcol">
            <span><b>{{ who(t.root.author_id).name }}</b> <span class="tx-meta">{{ relativeTime(t.root.created_at) }}</span></span>
            <span class="body">{{ t.root.body }}</span>
            <span v-if="active !== t.root.id" class="tx-meta">{{ t.replies.length ? (t.replies.length === 1 ? tr('1 reply') : tr('{n} replies', { n: t.replies.length })) : quote(t.root.doc_anchor) }}</span>
          </span>
        </span>
      </button>
      <template v-if="active === t.root.id">
        <div v-for="c in t.replies" :key="c.id" class="msg reply">
          <MemberAvatar :name="who(c.author_id).name" :src="who(c.author_id).avatar" :size="20" />
          <span class="mcol"><span><b>{{ who(c.author_id).name }}</b> <span class="tx-meta">{{ relativeTime(c.created_at) }}</span></span><span class="body">{{ c.body }}</span></span>
        </div>
        <CommentComposer :people="people" compact :placeholder="tr('Reply. @ to mention')" :busy="busy" @send="(b: string, m: string[]) => sendReply(t, b, m)" @cancel="active = null" />
        <div class="acts">
          <Button size="s" type="tertiary" contents="icon-text" :icon-name="t.root.resolved_at ? 'refresh' : 'check'" @click="resolve(t)">{{ t.root.resolved_at ? tr('Reopen') : tr('Resolve') }}</Button>
        </div>
      </template>
    </div>
  </div>

  <!-- 아래 게시판: 문서 전체 댓글 -->
  <section v-else class="board" :aria-label="tr('Comments')">
    <div class="nh"><span class="tx-head">{{ tr('Comments') }}</span><span class="tx-meta">{{ board.length === 1 ? tr('1 on the whole document') : tr('{n} on the whole document', { n: board.length }) }}</span></div>
    <CommentComposer :people="people" :placeholder="tr('Write a comment. @ to mention')" :busy="busy" @send="(b: string, m: string[]) => sendBoard(b, m)" />
    <div v-for="t in board" :key="t.root.id" class="post">
      <div class="msg">
        <MemberAvatar :name="who(t.root.author_id).name" :src="who(t.root.author_id).avatar" :size="24" />
        <span class="mcol">
          <span><b>{{ who(t.root.author_id).name }}</b> <span class="tx-meta">{{ relativeTime(t.root.created_at) }}</span></span>
          <span class="body">{{ t.root.body }}</span>
        </span>
      </div>
      <div v-for="c in t.replies" :key="c.id" class="msg reply">
        <MemberAvatar :name="who(c.author_id).name" :src="who(c.author_id).avatar" :size="20" />
        <span class="mcol"><span><b>{{ who(c.author_id).name }}</b> <span class="tx-meta">{{ relativeTime(c.created_at) }}</span></span><span class="body">{{ c.body }}</span></span>
      </div>
      <div class="pacts">
        <button type="button" class="sq tbtn" @click="replying = replying === t.root.id ? null : t.root.id"><EditorIcon name="comment" :size="12" />{{ tr('Reply') }}</button>
      </div>
      <CommentComposer v-if="replying === t.root.id" :people="people" compact autofocus :placeholder="tr('Reply. @ to mention')" :busy="busy" @send="(b: string, m: string[]) => sendReply(t, b, m)" @cancel="replying = null" />
    </div>
  </section>
</template>

<style scoped>
.notes { display: flex; flex-direction: column; gap: var(--ref-spacing-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.nh { display: flex; align-items: baseline; gap: var(--ref-spacing-04); }
.f1 { flex: 1; }
.empty { margin: 0; }
.tbtn { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); height: 22px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; color: var(--sys-color-neutral-600); }
.tbtn:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
/* 메모 카드: 노란 종이(접힘) → 고르면 흰 카드 + 노란 선 */
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-05); padding: var(--ref-spacing-05) var(--ref-spacing-06); border-radius: var(--ref-radius-07); --sq-fill: #FFFDF3; --sq-line: #F3E2A6; --sq-line-w: 1px; }
.card.on { --sq-fill: var(--sys-color-common-white-default); --sq-line: #E8C14A; filter: drop-shadow(0 6px 12px rgb(3 9 26 / 8%)); }
.card.done { opacity: .6; }
.head { display: flex; flex-direction: column; gap: var(--ref-spacing-04); text-align: left; color: inherit; }
.head:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; border-radius: var(--ref-radius-04); }
.tags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
.arrow { margin: 0 1px; }
.udot { width: 6px; height: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); margin-left: auto; }
.msg { display: flex; gap: var(--ref-spacing-04); min-width: 0; }
.msg.reply { padding-left: var(--ref-spacing-02); }
.mcol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mcol b { font-weight: 600; }
.body { white-space: pre-wrap; word-break: break-word; color: var(--sys-color-neutral-700); }
.acts { display: flex; justify-content: flex-end; }
.ellipsis { min-width: 0; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 10px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); white-space: nowrap; }
.sid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 10px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }

.board { display: flex; flex-direction: column; gap: var(--ref-spacing-08); margin-top: var(--ref-spacing-16); padding-top: var(--ref-spacing-12); box-shadow: 0 -1px 0 var(--iris-line); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.post { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.post .reply { margin-left: 28px; }
.pacts { display: flex; margin-left: 24px; }
</style>
