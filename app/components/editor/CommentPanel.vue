<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { Thread } from '~/composables/useComments'
import { relativeTime } from '~/composables/useProjects'

/**
 * 코멘트 목록(코멘트 모드의 오른쪽 패널) — 열림 · 해결됨 · 전체, 이 페이지 / 모든 페이지, 내 것과 멘션만.
 * 누르면 그 핀으로 가서 스레드를 열어요(다른 페이지면 그 페이지로)
 */
const props = defineProps<{ threads: Thread[]; pageId: string | null; pages: { id: string; name: string }[]; screens: { id: string; name: string }[]; people: { id: string; name: string; avatar?: string | null }[]; myId: string | null; openId: string | null }>()
const emit = defineEmits<{ open: [t: Thread]; close: [] }>()
const tab = ref<'open' | 'resolved' | 'all'>('open')
const scope = ref<'page' | 'all'>('page')
const mine = ref(false)

const person = (id: string | null) => props.people.find((p) => p.id === id) ?? null
const involved = (t: Thread) => [t.root, ...t.replies].some((c) => c.author_id === props.myId || (props.myId && c.mentions.includes(props.myId)))
const inScope = computed(() => props.threads.filter((t) => scope.value === 'all' || !t.root.page_id || t.root.page_id === props.pageId).filter((t) => !mine.value || involved(t)))
const count = (k: 'open' | 'resolved' | 'all') => inScope.value.filter((t) => k === 'all' || (k === 'open' ? !t.root.resolved_at : !!t.root.resolved_at)).length
const shown = computed(() => inScope.value.filter((t) => tab.value === 'all' || (tab.value === 'open' ? !t.root.resolved_at : !!t.root.resolved_at)))
function where(t: Thread) {
  const s = props.screens.find((x) => x.id === t.root.screen_id)
  if (s) return s.name
  const pg = props.pages.find((x) => x.id === t.root.page_id)
  return pg && t.root.page_id !== props.pageId ? pg.name : tr('Canvas')
}
function foot(t: Thread) {
  if (t.root.resolved_at) return tr('Resolved')
  const n = t.replies.length
  const r = n === 0 ? tr('No replies') : n === 1 ? tr('1 reply') : tr('{n} replies', { n })
  return t.unread ? `${r} · ${tr('New reply')}` : r
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
      <div class="seg" role="tablist" :aria-label="tr('Filter comments')">
        <button v-for="t in TABS" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]">{{ tr(t[1]) }} <span class="num n">{{ count(t[0]) }}</span></button>
      </div>
    </div>
    <div class="row2">
      <button type="button" :class="['cb', 'chk', { on: mine }]" role="checkbox" :aria-checked="mine" @click="mine = !mine"><i class="sq" />{{ tr('Only mine and mentions') }}</button>
      <button type="button" class="sq scope" :aria-label="scope === 'page' ? tr('Showing this page. Show all pages') : tr('Showing all pages. Show this page')" @click="scope = scope === 'page' ? 'all' : 'page'">{{ scope === 'page' ? tr('This page') : tr('All pages') }}</button>
    </div>
    <div class="list">
      <button v-for="t in shown" :key="t.root.id" type="button" :class="['sq', 'item', { on: t.root.id === openId }]" @click="emit('open', t)">
        <MemberAvatar :name="person(t.root.author_id)?.name ?? '?'" :src="person(t.root.author_id)?.avatar" :size="24" />
        <span class="body">
          <span class="row1"><b>{{ person(t.root.author_id)?.name ?? tr('Former member') }}</b><span class="tx-meta">{{ relativeTime(t.last.created_at) }}</span><span class="f1" /><span class="tx-meta num">#{{ t.root.no }}</span></span>
          <span class="tx-meta">{{ where(t) }}</span>
          <span class="txt">{{ t.root.body }}</span>
          <span :class="['tx-meta', { blue: t.unread }]">{{ foot(t) }}</span>
        </span>
        <i v-if="t.unread" class="dot" :aria-label="tr('Unread')" />
      </button>
      <div v-if="!shown.length" class="empty">
        <span class="tx-head">{{ tab === 'resolved' ? tr('No resolved comments') : tr('No comments yet') }}</span>
        <span class="tx-meta">{{ tab === 'resolved' ? tr('Resolved threads move here. Reopen one to bring it back') : tr('Click anywhere on the canvas to leave a comment') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.hd { flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); }
.ib { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.ib:hover { --sq-fill: var(--sys-color-neutral-100); }
.bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-04); }
.n { margin-left: 2px; color: var(--sys-color-neutral-500); font-weight: 400; }
.scope { height: 28px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: var(--sys-color-neutral-700); white-space: nowrap; }
.scope:hover { --sq-fill: var(--sys-color-neutral-100); }
.row2 { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-08); }
.chk { color: var(--sys-color-neutral-700); }
.list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--ref-spacing-04) var(--ref-spacing-04); display: flex; flex-direction: column; gap: 2px; }
.item { display: flex; gap: var(--ref-spacing-04); padding: var(--ref-spacing-05) var(--ref-spacing-04); border-radius: var(--ref-radius-05); text-align: left; }
.item:hover { --sq-fill: var(--sys-color-neutral-100); }
.item.on { --sq-fill: var(--sys-color-brand-primary-lightest); }
.item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.row1 { display: flex; align-items: baseline; gap: var(--ref-spacing-03, 6px); }
.row1 b { font-weight: 600; color: var(--sys-color-neutral-800); }
.f1 { flex: 1; }
.txt { color: var(--sys-color-neutral-700); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.blue { color: var(--sys-color-brand-primary-default); }
.dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); }
.empty { padding: 40px 16px; display: flex; flex-direction: column; gap: 4px; text-align: center; }
</style>
