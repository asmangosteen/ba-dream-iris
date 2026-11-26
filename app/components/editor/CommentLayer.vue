<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import { Icon } from '@ba-dream/design-system'
import CommentComposer, { type MentionPerson } from '~/components/editor/CommentComposer.vue'
import type { Thread, CommentRow } from '~/composables/useComments'
import type { Viewport } from '~/components/editor/canvas/types'
import { relativeTime } from '~/composables/useProjects'

/**
 * 캔버스 위 코멘트(코멘트 모드): 핀 · 열린 스레드 · 새 코멘트 입력. 캔버스와 같은 자리에 덮는 층(핀 · 창만 누를 수 있어요).
 * 핀은 화면(프레임) 기준 자리라 화면을 옮기면 따라가요. 해결한 스레드는 숨겨요(목록에서 '해결됨'으로 열면 보여요)
 */
const props = defineProps<{
  vp: Viewport
  threads: Thread[]
  screens: { id: string; name: string; x: number; y: number; width: number; height: number }[]
  pageId: string | null
  people: (MentionPerson & { email?: string })[]
  myId: string | null
  canModerate: boolean
  draft: { screenId: string | null; x: number; y: number } | null
  openId: string | null
}>()
const emit = defineEmits<{ open: [id: string | null]; create: [body: string, mentions: string[]]; cancelDraft: []; reply: [root: CommentRow, body: string, mentions: string[]]; resolve: [root: CommentRow, done: boolean]; remove: [root: CommentRow] }>()

function world(at: { screen_id?: string | null; screenId?: string | null; page_id?: string | null; x: number | null; y: number | null }) {
  const sid = at.screen_id ?? at.screenId ?? null
  if (sid) {
    const s = props.screens.find((v) => v.id === sid)
    return s ? { x: s.x + (at.x ?? 0), y: s.y + (at.y ?? 0) } : null
  }
  if (at.page_id && at.page_id !== props.pageId) return null
  return { x: at.x ?? 0, y: at.y ?? 0 }
}
const sx = (x: number) => props.vp.x + x * props.vp.zoom
const sy = (y: number) => props.vp.y + y * props.vp.zoom
const person = (id: string | null) => props.people.find((p) => p.id === id) ?? null
const nameOf = (id: string | null) => person(id)?.name ?? tr('Former member')

const pins = computed(() => props.threads
  .filter((t) => !t.root.resolved_at || t.root.id === props.openId)
  .map((t) => ({ t, w: world(t.root) }))
  .filter((p): p is { t: Thread; w: { x: number; y: number } } => !!p.w))
const open = computed(() => props.threads.find((t) => t.root.id === props.openId) ?? null)
const openPos = computed(() => (open.value ? world(open.value.root) : null))
const draftPos = computed(() => (props.draft ? world(props.draft) : null))
const frameName = (t: Thread) => props.screens.find((s) => s.id === t.root.screen_id)?.name ?? tr('Canvas')

/** 창 자리: 핀 오른쪽, 화면 밖(오른쪽 패널 · 아래)으로 나가면 안쪽으로 */
const host = ref<HTMLElement | null>(null)
function boxAt(w: { x: number; y: number }) {
  const W = host.value?.clientWidth ?? 1200, H = host.value?.clientHeight ?? 800
  const left = Math.min(sx(w.x) + 36, W - 300 - 320 - 16)
  const top = Math.max(56, Math.min(sy(w.y) - 28, H - 360))
  return { left: Math.max(264, left) + 'px', top: top + 'px' }
}

/** 글 속 @이름은 파랗게 */
function parts(body: string) {
  const names = props.people.map((p) => '@' + p.name).filter((n) => body.includes(n)).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ t: body, m: false }]
  const re = new RegExp('(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  return body.split(re).filter(Boolean).map((t) => ({ t, m: names.includes(t) }))
}
const moreOpen = ref(false)
watch(() => props.openId, () => { moreOpen.value = false })
/**
 * 핀 모양: 오른쪽 위는 원, 왼쪽 · 아래 변은 곡률이 서서히 줄어 뾰족한 끝(왼쪽 아래, 누른 자리)으로 이어져요 —
 * 원과 곧은 변이 바로 만나 꺾여 보이던 것을 부드럽게. 끝은 곡률 1px 정도
 */
const PIN = 'M14 0C21.732 0 28 6.268 28 14C28 23 22 28 12 28H2C0.9 28 0 27.1 0 26V16C0 6 5 0 14 0Z'
const canDelete = (c: CommentRow) => c.author_id === props.myId || props.canModerate
</script>

<template>
  <div ref="host" class="cl">
    <button
      v-for="p in pins" :key="p.t.root.id" type="button"
      :class="['pin', { on: p.t.root.id === openId, unread: p.t.unread, done: !!p.t.root.resolved_at }]"
      :style="{ left: sx(p.w.x) + 'px', top: sy(p.w.y) - 28 + 'px' }"
      :aria-label="tr('Comment #{no} by {name}', { no: p.t.root.no ?? '', name: nameOf(p.t.root.author_id) })"
      @click="emit('open', p.t.root.id === openId ? null : p.t.root.id)"
    >
      <svg class="pin-bg" viewBox="0 0 28 28" aria-hidden="true"><path :d="PIN" /></svg>
      <MemberAvatar :name="nameOf(p.t.root.author_id)" :src="person(p.t.root.author_id)?.avatar" :size="22" />
    </button>

    <!-- 새 코멘트 — 팝업 양식(.pop-*: 머리 48 · 제목 14/600 · 닫기 28 · 본문 16 · DS 버튼) -->
    <template v-if="draft && draftPos">
      <span class="pin draft" :style="{ left: sx(draftPos.x) + 'px', top: sy(draftPos.y) - 28 + 'px' }" aria-hidden="true"><svg class="pin-bg" viewBox="0 0 28 28"><path :d="PIN" /></svg></span>
      <section class="sq pop th" role="dialog" aria-labelledby="cmtNewT" :style="boxAt(draftPos)">
        <div class="pop-top">
          <h2 id="cmtNewT" class="pop-ttl">{{ tr('New comment') }}</h2>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('cancelDraft')"><Icon name="close" :size="16" /></button>
        </div>
        <div class="foot">
          <CommentComposer :people="people" placeholder="Add a comment. @ to mention" submit-label="Post" cancel-label="Cancel" autofocus @send="(b, m) => emit('create', b, m)" @cancel="emit('cancelDraft')" />
        </div>
      </section>
    </template>

    <!-- 열린 스레드 -->
    <section v-if="open && openPos" class="sq pop th" role="dialog" aria-labelledby="cmtT" :style="boxAt(openPos)" @keydown.esc.stop="emit('open', null)">
      <div class="pop-top">
        <h2 id="cmtT" class="pop-ttl">{{ tr('Comment #{no}', { no: open.root.no ?? '' }) }}<span class="where">{{ frameName(open) }}</span></h2>
        <span class="tools">
          <button type="button" :class="['sq', 'pop-x', { ok: !!open.root.resolved_at }]" :aria-pressed="!!open.root.resolved_at" :aria-label="open.root.resolved_at ? tr('Reopen') : tr('Resolve')" :data-tip="open.root.resolved_at ? tr('Reopen') : tr('Resolve')" @click="emit('resolve', open.root, !open.root.resolved_at)"><Icon name="check" :size="16" /></button>
          <span v-if="canDelete(open.root)" class="more-w">
            <button type="button" class="sq pop-x" :aria-label="tr('More')" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><Icon name="menu_kebab" :size="16" /></button>
            <div v-if="moreOpen" class="sq menu mm" role="menu"><button type="button" role="menuitem" class="sq menu-item danger" @click="emit('remove', open.root)">{{ tr('Delete thread') }}</button></div>
          </span>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('open', null)"><Icon name="close" :size="16" /></button>
        </span>
      </div>
      <div class="pop-body msgs">
        <p v-if="open.root.resolved_at" class="pop-desc done-note">{{ tr('Resolved by {name} · {ago}', { name: nameOf(open.root.resolved_by), ago: relativeTime(open.root.resolved_at) }) }}</p>
        <div v-for="c in [open.root, ...open.replies]" :key="c.id" class="msg">
          <MemberAvatar :name="nameOf(c.author_id)" :src="person(c.author_id)?.avatar" :size="24" />
          <div class="mb">
            <span class="mh"><b>{{ nameOf(c.author_id) }}</b><span class="tx-meta">{{ relativeTime(c.created_at) }}<template v-if="c.edited_at"> · {{ tr('edited') }}</template></span></span>
            <p class="body"><template v-for="(x, i) in parts(c.body)" :key="i"><b v-if="x.m" class="at">{{ x.t }}</b><template v-else>{{ x.t }}</template></template></p>
          </div>
        </div>
      </div>
      <div class="foot">
        <CommentComposer :key="open.root.id" up :people="people" placeholder="Reply. @ to mention" submit-label="Reply" @send="(b, m) => emit('reply', open!.root, b, m)" @cancel="emit('open', null)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.cl { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.cl > * { pointer-events: auto; }
/* 핀: 모양은 위 PIN 경로(svg) — 곡률이 이어지게 그린 모양이라 squircle 처리 대신 */
.pin { position: absolute; width: 28px; height: 28px; padding: 0; border: 0; background: none; display: grid; place-items: center; transition: transform .12s ease; transform-origin: 0 100%; }
.pin > :not(.pin-bg) { position: relative; }
.pin-bg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 2px 3px rgb(3 9 26 / 18%)); }
.pin-bg path { fill: var(--sys-color-common-white-emphasis); stroke: var(--iris-float-line); stroke-width: .5px; }
.pin:hover { transform: scale(1.08); }
.pin.on .pin-bg path { stroke: var(--sys-color-brand-primary-default); stroke-width: 2px; }
.pin.unread::after { content: ''; position: absolute; top: -1px; right: -1px; width: 6px; height: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis); }
.pin.done { opacity: .6; }
.pin.draft { pointer-events: none; }
.pin.draft .pin-bg path { fill: var(--sys-color-brand-primary-default); stroke: none; }
.pin:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.th.pop { overflow: visible; --pop-w: 320px; }
.th { position: absolute; width: 320px; max-height: min(520px, calc(100% - 72px)); z-index: 4; }
.where { margin-left: var(--ref-spacing-04); font-size: 12px; font-weight: 400; color: var(--sys-color-neutral-500); }
.tools { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-02); }
.pop-x.ok { color: var(--sys-color-theme-success-default, #24A638); }
.more-w { position: relative; }
.mm { top: calc(100% + 4px); left: auto; right: 0; width: 160px; z-index: 6; }
.done-note { color: var(--sys-color-theme-success-default, #1B7A2B); }
/* 본문: 팝업 본문(.pop-body 위 4 · 좌우 16 · 아래 12 · 사이 16) 안에서 글이 길면 스크롤 */
.msgs { flex: 1 1 auto; min-height: 0; }
.msg { display: flex; gap: var(--ref-spacing-06); }
.mb { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mh { display: flex; gap: var(--ref-spacing-04); align-items: baseline; }
.mh b { font-weight: 600; color: var(--sys-color-neutral-800); }
.body { margin: 0; color: var(--sys-color-neutral-700); white-space: pre-wrap; overflow-wrap: anywhere; }
.at { font-weight: 500; color: var(--sys-color-brand-primary-default); }
/* 아래 입력 + 버튼 줄: 팝업 아래 버튼 줄과 같은 안쪽(좌우 16 · 아래 16) */
.foot { flex: none; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-10); }
@media (prefers-reduced-motion: reduce) { .pin { transition: none; } }
</style>
