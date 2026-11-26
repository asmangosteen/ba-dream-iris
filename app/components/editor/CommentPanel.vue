<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { Thread, CommentRow } from '~/composables/useComments'
import { relativeTime } from '~/composables/useProjects'

/**
 * 코멘트 목록(오른쪽 패널 — 피그마와 같아요): 위에 검색 · 거르기(열림 · 해결됨 · 전체, 내 것과 멘션만, 이 페이지 · 모든 페이지).
 * 줄: 아바타 · #번호 · ↳ 놓인 곳 · 이름 · 시각 · 글 · 이미지 수 · 답글 수. 누르면 그 핀으로 가서 스레드를 열어요(다른 페이지면 그 페이지로)
 */
const props = defineProps<{ threads: Thread[]; pageId: string | null; pages: { id: string; name: string }[]; screens: { id: string; name: string }[]; people: { id: string; name: string; avatar?: string | null }[]; myId: string | null; openId: string | null }>()
const emit = defineEmits<{ open: [t: Thread]; close: []; resolve: [root: CommentRow, done: boolean]; readAll: [] }>()
const tab = ref<'open' | 'resolved' | 'all'>('open')
const scope = ref<'page' | 'all'>('page')
const mine = ref(false)
const q = ref('')
const qFocus = ref(false)
const filterOpen = ref(false)
/** 거르기 메뉴: 바깥을 누르면 닫혀요 */
const filterEl = ref<HTMLElement | null>(null)
/** ⋯ 메뉴(피그마와 같아요): 모두 읽음으로 */
const moreOpen = ref(false)
const moreEl = ref<HTMLElement | null>(null)
const unread = computed(() => props.threads.filter((t) => t.unread).length)
function onDocDown(e: PointerEvent) {
  if (filterOpen.value && !filterEl.value?.contains(e.target as Node | null)) filterOpen.value = false
  if (moreOpen.value && !moreEl.value?.contains(e.target as Node | null)) moreOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))

const person = (id: string | null) => props.people.find((p) => p.id === id) ?? null
const involved = (t: Thread) => [t.root, ...t.replies].some((c) => c.author_id === props.myId || (props.myId && c.mentions.includes(props.myId)))
/** 검색: 글 · 쓴 사람 이름(답글 포함) */
const hit = (t: Thread, s: string) => [t.root, ...t.replies].some((c) => c.body.toLowerCase().includes(s) || (person(c.author_id)?.name ?? '').toLowerCase().includes(s))
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return props.threads
    .filter((t) => scope.value === 'all' || !t.root.page_id || t.root.page_id === props.pageId)
    .filter((t) => !mine.value || involved(t))
    .filter((t) => tab.value === 'all' || (tab.value === 'open' ? !t.root.resolved_at : !!t.root.resolved_at))
    .filter((t) => !s || hit(t, s))
})
const filtered = computed(() => tab.value !== 'open' || mine.value || scope.value !== 'page')
function where(t: Thread) {
  const s = props.screens.find((x) => x.id === t.root.screen_id)
  if (s) return s.name
  const pg = props.pages.find((x) => x.id === t.root.page_id)
  return pg && t.root.page_id !== props.pageId ? pg.name : tr('Canvas')
}
function foot(t: Thread) {
  const out: string[] = []
  const imgs = [t.root, ...t.replies].reduce((n, c) => n + (c.attachments?.length ?? 0), 0)
  if (imgs) out.push(imgs === 1 ? tr('1 image') : tr('{n} images', { n: imgs }))
  const n = t.replies.length
  if (n) out.push(n === 1 ? tr('1 reply') : tr('{n} replies', { n }))
  return out.join(' · ')
}
const TABS = [['open', 'Unresolved'], ['resolved', 'Resolved'], ['all', 'All']] as const
</script>

<template>
  <section class="cp" :aria-label="tr('Comments')">
    <header class="hd">
      <span class="tx-head">{{ tr('Comments') }}</span>
      <button type="button" class="sq ib" :aria-label="tr('Close comments')" :data-tip="tr('Close comments')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
    </header>
    <div class="bar">
      <!-- 검색칸: 왼쪽 Assets 검색칸과 같은 편집기 입력칸(.field 28 · 12px) -->
      <label :class="['sq', 'field', 'srch', { focus: qFocus }]">
        <EditorIcon name="search" :size="16" class="qi" />
        <input v-model="q" type="search" spellcheck="false" autocomplete="off" :placeholder="tr('Search')" :aria-label="tr('Search comments')" @focus="qFocus = true" @blur="qFocus = false" @keydown.esc="q = ''">
        <button v-if="q" type="button" class="sq qx" :aria-label="tr('Clear search')" @click="q = ''"><EditorIcon name="close" :size="12" /></button>
      </label>
      <span ref="filterEl" class="fw">
        <button type="button" :class="['sq', 'ib', { on: filterOpen }]" :aria-label="tr('Filter comments')" :data-tip="tr('Filter comments')" :aria-expanded="filterOpen" @click="filterOpen = !filterOpen"><EditorIcon name="filter" :size="16" /><i v-if="filtered" class="fdot" aria-hidden="true" /></button>
        <div v-if="filterOpen" class="sq menu fm" role="menu">
          <button v-for="t in TABS" :key="t[0]" type="button" role="menuitemradio" :aria-checked="tab === t[0]" :class="['sq', 'menu-item', { on: tab === t[0] }]" @click="tab = t[0]">{{ tr(t[1]) }}</button>
          <i class="sep" />
          <button type="button" role="menuitemradio" :aria-checked="scope === 'page'" :class="['sq', 'menu-item', { on: scope === 'page' }]" @click="scope = 'page'">{{ tr('This page') }}</button>
          <button type="button" role="menuitemradio" :aria-checked="scope === 'all'" :class="['sq', 'menu-item', { on: scope === 'all' }]" @click="scope = 'all'">{{ tr('All pages') }}</button>
          <i class="sep" />
          <button type="button" role="menuitemcheckbox" :aria-checked="mine" :class="['sq', 'menu-item', { on: mine }]" @click="mine = !mine">{{ tr('Only mine and mentions') }}</button>
        </div>
      </span>
      <span ref="moreEl" class="fw">
        <button type="button" :class="['sq', 'ib', { on: moreOpen }]" :aria-label="tr('More')" :data-tip="tr('More')" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><EditorIcon name="menu_meatball" :size="16" /></button>
        <div v-if="moreOpen" class="sq menu fm" role="menu">
          <button type="button" role="menuitem" class="sq menu-item" :disabled="!unread" @click="emit('readAll'); moreOpen = false"><span class="f1">{{ tr('Mark all as read') }}</span><span v-if="unread" class="tx-meta num">{{ unread }}</span></button>
        </div>
      </span>
    </div>
    <div class="list">
      <div v-for="t in shown" :key="t.root.id" :class="['sq', 'item', { on: t.root.id === openId }]" role="button" tabindex="0" @click="emit('open', t)" @keydown.enter.self="emit('open', t)">
        <!-- 머리 줄(한 줄): 아바타 · 이름 · 시각 · ↳ 놓인 곳 …… 해결(올리면) · 새 글 점(맨 오른쪽) -->
        <span class="ih">
          <MemberAvatar :name="person(t.root.author_id)?.name ?? '?'" :src="person(t.root.author_id)?.avatar" :size="28" />
          <span class="meta"><b>{{ person(t.root.author_id)?.name ?? tr('Former member') }}</b><span class="tx-meta">{{ relativeTime(t.last.created_at) }}</span><span class="tx-meta ell">↳ {{ where(t) }}</span></span>
          <button type="button" :class="['sq', 'ib', 'rs', { ok: !!t.root.resolved_at }]" :aria-label="t.root.resolved_at ? tr('Reopen') : tr('Resolve')" :data-tip="t.root.resolved_at ? tr('Reopen') : tr('Resolve')" @click.stop="emit('resolve', t.root, !t.root.resolved_at)"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M5.8 9.2l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <i v-if="t.unread" class="dot" :aria-label="tr('Unread')" />
        </span>
        <span v-if="t.root.body" class="txt">{{ t.root.body }}</span>
        <span v-if="foot(t)" :class="['tx-meta', { blue: t.unread || (t.root.attachments?.length ?? 0) > 0 }]">{{ foot(t) }}</span>
      </div>
      <div v-if="!shown.length" class="empty">
        <span class="tx-head">{{ q.trim() ? tr('No matching comments') : tab === 'resolved' ? tr('No resolved comments') : tr('No comments yet') }}</span>
        <span class="tx-meta">{{ q.trim() ? tr('Try a different word') : tab === 'resolved' ? tr('Resolved threads move here. Reopen one to bring it back') : tr('Click anywhere on the canvas to leave a comment') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 여백은 왼쪽 패널(Pages · Layers)과 같아요: 바깥 8 + 줄 안쪽 8 → 글자는 패널 끝에서 16 */
.hd { flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10); }
.ib { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.ib:hover, .ib.on { --sq-fill: var(--sys-color-neutral-100); }
.bar { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); border-bottom: 1px solid var(--iris-line); }
.srch { flex: 1; min-width: 0; cursor: text; }
.srch input { -webkit-appearance: none; appearance: none; padding: 0; }
.srch input::-webkit-search-cancel-button { display: none; }
.qi { flex: none; color: var(--sys-color-neutral-500); }
.qx { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); margin-right: calc(-1 * var(--ref-spacing-02)); }
.qx:hover { --sq-overlay: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.fw { position: relative; flex: none; }
/* 거르기를 바꿔 둔 상태: 버튼 오른쪽 위 파란 점 */
.fdot { position: absolute; top: 4px; right: 4px; width: 5px; height: 5px; border-radius: 50%; background: var(--sys-color-brand-primary-default); pointer-events: none; }
.fm { top: calc(100% + 4px); left: auto; right: 0; width: 200px; z-index: 6; }
.sep { display: block; height: 1px; margin: 4px 0; background: var(--iris-line); }
.list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); display: flex; flex-direction: column; gap: 2px; }
.item { display: flex; flex-direction: column; gap: 2px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-07); border-radius: var(--ref-radius-04); text-align: left; cursor: pointer; }
.item:hover { --sq-fill: var(--sys-color-neutral-100); }
.item.on { --sq-fill: var(--sys-color-brand-primary-lightest); }
.item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.ih { display: flex; align-items: center; gap: var(--ref-spacing-06); margin-bottom: var(--ref-spacing-03, 6px); }
.meta { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: var(--ref-spacing-03, 6px); white-space: nowrap; }
.meta b { flex: none; font-weight: 600; color: var(--sys-color-neutral-800); }
.meta > .tx-meta { flex: none; }
.meta > .ell { flex: 0 1 auto; min-width: 0; }
.rs { opacity: 0; }
.item:hover .rs, .item.on .rs, .rs:focus-visible, .rs.ok { opacity: 1; }
.rs.ok { color: var(--sys-color-theme-success-default, #24A638); }
.rs svg { display: block; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f1 { flex: 1; }
.txt { color: var(--sys-color-neutral-800); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.blue { color: var(--sys-color-brand-primary-default); }
.dot { flex: none; width: 6px; height: 6px; margin-right: var(--ref-spacing-02); border-radius: 50%; background: var(--sys-color-brand-primary-default); }
.empty { padding: 40px 16px; display: flex; flex-direction: column; gap: 4px; text-align: center; }
</style>
