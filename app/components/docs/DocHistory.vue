<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
import type { DocBlock, DocHistoryRow, DocRow, HistoryChange } from '~/composables/useIrisData'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 문서 수정 기록(새 5): 누가 언제 무엇을 바꿨는지 목록 + 고른 기록의 바뀐 부분 + 그때로 되돌리기.
 * 기록엔 바뀐 블록만 남아 있어요(용량 절약). 되돌리기는 지금 글에서 그 뒤 기록들을 거꾸로 풀어 만들어요.
 */
/** hideHead: 위 막대(History · ✕) 빼기 — 위에 '기록' 세그먼트가 이미 있는 '문서에서 보기' 오른쪽 패널(좁은 칸) */
/**
 * focusCode: 고른 요청사항(P-DOC-02 등)이 있으면 그 줄을 바꾼 기록만, 바뀐 부분도 그 줄만 보여요. 없으면 문서 전체 기록(사용자 요청 2026-11-28).
 * 되돌리기는 거른 목록이 아니라 문서 전체 기록 순서로 계산해요(중간 기록을 건너뛰지 않게)
 */
const props = defineProps<{ projectId: string; doc: DocRow; canRestore: boolean; hideHead?: boolean; focusCode?: string | null }>()
const emit = defineEmits<{ close: []; restore: [blocks: DocBlock[], label: string]; 'clear-focus': [] }>()

const history = useDocHistory(props.projectId, () => props.doc.id)
const access = useProjectAccess(props.projectId)
const members = useMembers()
const who = (id: string) => {
  const m = access.members.value.find((x) => x.member_id === id)
  if (m) return { name: m.member?.name || m.member?.email || '?', avatar: m.member?.avatar_url ?? null }
  const w = (members.data.value ?? []).find((x) => x.id === id)
  return w ? { name: w.name || w.email, avatar: w.avatar_url ?? null } : { name: id === 'preview-me' ? tr('You') : tr('Former member'), avatar: null }
}
const list = computed(() => history.data.value ?? [])
/** 블록 하나가 이 요청사항 줄을 담고 있나(표면 첫 칸, 글이면 그 번호로 시작하거나 들어 있으면) */
const blockHas = (b: DocBlock | undefined, code: string) => !!b && (b.type === 'table' ? (b.rows ?? []).slice(1).some((r) => (r[0] ?? '').trim().startsWith(code)) : b.text.includes(code))
/** 이 기록이 그 요청사항 줄을 바꿨나: 요약 칩에 그 번호가 있거나, 고친 블록에서 그 줄이 달라졌거나, 더하거나 지운 블록에 그 줄이 있으면 */
function touches(h: DocHistoryRow, code: string) {
  if (h.summary.some((x) => x.replace(/^[+~−] /, '') === code)) return true
  return h.changes.some((c) => (c.op === 'edit' ? rowOf(c.before, code) !== rowOf(c.after, code) : c.op === 'add' ? blockHas(c.after, code) : c.op === 'del' ? blockHas(c.before, code) : false))
}
/** 표 안 그 요청사항 줄(없으면 '') — 바뀌었는지 비교용 */
function rowOf(b: DocBlock | undefined, code: string) {
  if (!b) return ''
  if (b.type === 'table') return (b.rows ?? []).slice(1).find((r) => (r[0] ?? '').trim().startsWith(code))?.join('|') ?? ''
  return b.text.includes(code) ? b.text : ''
}
/** 보여 줄 기록: 고른 요청사항이 있으면 그 줄을 바꾼 것만 */
const shown = computed(() => (props.focusCode ? list.value.filter((h) => touches(h, props.focusCode!)) : list.value))
const sel = ref<string | null>(null)
watch(shown, (l) => { if (!sel.value || !l.some((h) => h.id === sel.value)) sel.value = l[0]?.id ?? null }, { immediate: true })
const cur = computed(() => list.value.find((h) => h.id === sel.value) ?? null)

const dayKey = (iso: string) => new Date(iso).toDateString()
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return tr('Today')
  if (d.toDateString() === y.toDateString()) return tr('Yesterday')
  return d.toLocaleDateString(useLang().lang.value === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' })
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(useLang().lang.value === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
const groups = computed(() => {
  const out: { day: string; items: DocHistoryRow[] }[] = []
  for (const h of shown.value) {
    const g = out.find((x) => x.day === dayKey(h.created_at))
    if (g) g.items.push(h)
    else out.push({ day: dayKey(h.created_at), items: [h] })
  }
  return out
})
const blockCount = (h: DocHistoryRow) => h.changes.filter((c) => c.op !== 'order').length
const what = (h: DocHistoryRow) => (h.summary[0] && !/^[+~−] /.test(h.summary[0]) ? h.summary[0] : blockCount(h) === 1 ? tr('Edited 1 block') : tr('Edited {n} blocks', { n: blockCount(h) }))
const chips = (h: DocHistoryRow) => h.summary.filter((s) => /^[+~−] /.test(s))
const chipKind = (s: string) => (s.startsWith('+') ? 'add' : s.startsWith('−') ? 'del' : 'edit')

// 바뀐 부분 보기 ------------------------------------------------------------
type Line = { kind: 'add' | 'del' | 'same'; cells?: string[]; text?: string }
interface View { id: string; type: DocBlock['type']; head?: string[]; lines: Line[]; badge: 'add' | 'del' | 'edit' }
function tableLines(before: string[][] | undefined, after: string[][] | undefined): Line[] {
  const b = (before ?? []).slice(1), a = (after ?? []).slice(1)
  const key = (r: string[]) => r[0] || r.join('|')
  const bMap = new Map(b.map((r) => [key(r), r]))
  const aKeys = new Set(a.map(key))
  const out: Line[] = []
  for (const r of a) {
    const old = bMap.get(key(r))
    if (!old) out.push({ kind: 'add', cells: r })
    else if (old.join('|') !== r.join('|')) { out.push({ kind: 'del', cells: old }); out.push({ kind: 'add', cells: r }) }
  }
  for (const r of b) if (!aKeys.has(key(r))) out.push({ kind: 'del', cells: r })
  return out
}
const allViews = computed<View[]>(() => (cur.value?.changes ?? []).filter((c): c is Exclude<HistoryChange, { op: 'order' }> => c.op !== 'order').map((c) => {
  const b = c.op === 'del' ? c.before : c.after
  if (b.type === 'table') {
    const lines = c.op === 'add' ? (b.rows ?? []).slice(1).map((r) => ({ kind: 'add' as const, cells: r })) : c.op === 'del' ? (b.rows ?? []).slice(1).map((r) => ({ kind: 'del' as const, cells: r })) : tableLines(c.before.rows, c.after.rows)
    return { id: c.block, type: b.type, head: b.rows?.[0], lines, badge: c.op }
  }
  const lines: Line[] = c.op === 'add' ? [{ kind: 'add', text: c.after.text }] : c.op === 'del' ? [{ kind: 'del', text: c.before.text }] : [{ kind: 'del', text: c.before.text }, { kind: 'add', text: c.after.text }]
  return { id: c.block, type: b.type, lines, badge: c.op }
}))
/** 고른 요청사항이 있으면 바뀐 부분도 그 줄만(표는 첫 칸이 그 번호인 줄, 글은 그 번호가 든 것) */
const views = computed<View[]>(() => {
  const code = props.focusCode
  if (!code) return allViews.value
  return allViews.value.map((v) => ({ ...v, lines: v.lines.filter((l) => (l.cells ? (l.cells[0] ?? '').trim().startsWith(code) : (l.text ?? '').includes(code))) })).filter((v) => v.lines.length)
})

/**
 * 되돌리기: 지금 글에서 고른 기록보다 새 기록들을 거꾸로 풀어요.
 * before = false 면 고른 기록 직후의 글(이 버전), true 면 고른 기록까지 풀어 그 직전의 글(이 변경 전)
 */
function restore(before = false) {
  const h = cur.value
  if (!h) return
  let blocks: DocBlock[] = JSON.parse(JSON.stringify(props.doc.content_blocks ?? []))
  for (const x of list.value) {
    if (x.id === h.id) { if (before) blocks = undoChanges(blocks, x.changes); break }
    blocks = undoChanges(blocks, x.changes)
  }
  const at = dayLabel(h.created_at) + ' ' + timeLabel(h.created_at)
  emit('restore', blocks, before ? tr('Undid the change from {at}', { at }) : tr('Restored the version from {at}', { at }))
}
</script>

<template>
  <div :class="['hist', { narrow: hideHead }]">
    <!-- 위 막대: 고치기 화면 위 막대와 같은 규격(높이 44 · 좌우 24 · 아래 선, 스크롤해도 위에) -->
    <div v-if="!hideHead" class="hh">
      <span class="tx-head">{{ tr('History') }}</span>
      <span class="f1" />
      <button type="button" class="sq ib s" :aria-label="tr('Close history')" :data-tip="tr('Close history')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
    </div>
    <!-- 고른 요청사항의 기록만 보는 중: 무엇을 보는지 + [전체 보기] -->
    <p v-if="focusCode" class="focus"><span class="tx-meta">{{ tr('Changes to {code}', { code: focusCode }) }}</span><button type="button" class="lnk" @click="emit('clear-focus')">{{ tr('Show all') }}</button></p>
    <p v-else class="tx-meta desc">{{ tr('Only the blocks that changed are stored, so history stays small.') }}</p>
    <p v-if="history.status.value === 'success' && !shown.length" class="tx-meta empty">{{ focusCode ? tr('No changes to {code} yet', { code: focusCode }) : tr('No changes recorded yet. Edits from now on will show up here.') }}</p>
    <div v-else class="cols">
      <!-- 기록 목록 -->
      <div class="items" role="listbox" :aria-label="tr('History')">
        <template v-for="g in groups" :key="g.day">
          <span class="tx-meta day">{{ dayLabel(g.items[0]!.created_at) }}</span>
          <button v-for="h in g.items" :key="h.id" type="button" role="option" :aria-selected="sel === h.id" :class="['sq', 'item', { on: sel === h.id }]" @click="sel = h.id">
            <MemberAvatar :name="who(h.author_id).name" :src="who(h.author_id).avatar" :size="20" />
            <span class="icol">
              <span class="ln"><b>{{ who(h.author_id).name }}</b><span class="tx-meta">{{ timeLabel(h.created_at) }}</span></span>
              <span class="tx-meta">{{ what(h) }}</span>
              <span v-if="chips(h).length" class="chips"><span v-for="c in chips(h).slice(0, 4)" :key="c" :class="['sq', 'chip', chipKind(c)]">{{ c }}</span><span v-if="chips(h).length > 4" class="tx-meta">+{{ chips(h).length - 4 }}</span></span>
            </span>
          </button>
        </template>
      </div>
      <!-- 고른 기록의 바뀐 부분 -->
      <div v-if="cur" class="diff">
        <div class="dh">
          <span class="dcol"><b>{{ tr('Changes by {name}', { name: who(cur.author_id).name }) }}</b><span class="tx-meta">{{ dayLabel(cur.created_at) }} {{ timeLabel(cur.created_at) }} · {{ what(cur) }}</span></span>
          <span class="dacts">
            <Button v-if="canRestore" size="s" type="tertiary" @click="restore(true)">{{ tr('Restore to before this change') }}</Button>
            <Button v-if="canRestore && cur.id !== list[0]?.id" size="s" type="tertiary" stroke @click="restore(false)">{{ tr('Restore this version') }}</Button>
          </span>
        </div>
        <span class="legend tx-meta"><i class="sqc sw add" />{{ tr('Added') }}<i class="sqc sw del" />{{ tr('Removed') }}</span>
        <div v-for="v in views" :key="v.id" class="vb">
          <span :class="['sq', 'chip', v.badge]">{{ v.badge === 'add' ? tr('New') : v.badge === 'del' ? tr('Removed') : tr('Edited') }}</span>
          <table v-if="v.type === 'table'" class="dtbl">
            <thead v-if="v.head"><tr><th v-for="(c, i) in v.head" :key="i">{{ c }}</th></tr></thead>
            <tbody><tr v-for="(l, i) in v.lines" :key="i" :class="l.kind"><td v-for="(c, j) in l.cells" :key="j">{{ c }}</td></tr></tbody>
          </table>
          <template v-else>
            <p v-for="(l, i) in v.lines" :key="i" :class="['sqc', 'tline', l.kind, v.type]">{{ l.text }}</p>
          </template>
        </div>
        <p v-if="!views.length" class="tx-meta">{{ tr('Only the order of blocks changed') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hist { display: flex; flex-direction: column; gap: var(--ref-spacing-10); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.hh { position: sticky; top: calc(-1 * var(--doc-pad-t, 16px)); z-index: 2; display: flex; align-items: center; gap: var(--ref-spacing-04); height: 44px; box-sizing: border-box; margin: calc(-1 * var(--doc-pad-t, 16px)) calc(-1 * var(--doc-pad-x, 24px)) 0; padding: 0 calc(var(--doc-pad-x, 24px) - 4px) 0 var(--doc-pad-x, 24px); background: var(--sys-color-common-white-emphasis); box-shadow: 0 1px 0 var(--iris-line); }
.desc { margin: 0; }
.focus { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-04); }
.lnk { font-size: 12px; font-weight: 500; color: var(--sys-color-brand-primary-default); background: none; border: 0; padding: 0; cursor: pointer; border-radius: var(--ref-radius-02); }
.lnk:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.f1 { flex: 1; }
.ib.s { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); }
.ib.s:hover { --sq-fill: var(--sys-color-neutral-100); }
.empty { margin: 0; }
.cols { display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.items { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: auto; }
.day { padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-02); }
.item { display: flex; gap: var(--ref-spacing-05); padding: var(--ref-spacing-05) var(--ref-spacing-05); border-radius: var(--ref-radius-05); text-align: left; color: inherit; }
.item:hover { --sq-fill: var(--sys-color-neutral-100); }
.item.on { --sq-fill: var(--sys-color-brand-primary-lightest, #EEF5FD); }
.item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.icol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ln { display: flex; gap: var(--ref-spacing-04); align-items: baseline; }
.ln b { font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-02); margin-top: 2px; }
.chip { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 10px; font-weight: 600; align-self: flex-start; }
.chip.add { color: #14612C; --sq-fill: #DDF4E4; }
.chip.edit { color: #454C58; --sq-fill: #F1F2F3; }
.chip.del { color: #9B1C1C; --sq-fill: #FDE2E1; }
.diff { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding-top: var(--ref-spacing-08); box-shadow: 0 -1px 0 var(--iris-line); }
.dh { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); flex-wrap: wrap; }
/* 좁은 칸(문서에서 보기 오른쪽 패널): 되돌리기 버튼은 제목 아래 줄로, 목록은 안쪽 스크롤 없이 패널 스크롤 하나로 */
.hist.narrow .dcol { flex-basis: 100%; }
.hist.narrow .dacts { flex-wrap: wrap; }
.hist.narrow .items { max-height: none; overflow: visible; }
.dacts { display: flex; gap: var(--ref-spacing-04); flex: none; }
.dcol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dcol b { font-weight: 600; }
.legend { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.sw { width: 10px; height: 10px; border-radius: 2px; margin-left: var(--ref-spacing-04); }
.sw.add { background: #DDF4E4; box-shadow: inset 0 0 0 1px #9ED7AF; }
.sw.del { background: #FDE2E1; box-shadow: inset 0 0 0 1px #F2AAA6; }
.vb { display: flex; flex-direction: column; gap: var(--ref-spacing-03); }
.dtbl { width: 100%; border-collapse: collapse; }
.dtbl th { text-align: left; font-weight: 600; color: var(--sys-color-neutral-600); background: var(--sys-color-neutral-100); padding: var(--ref-spacing-03) var(--ref-spacing-05); border-bottom: 1px solid var(--iris-line); }
.dtbl td { padding: var(--ref-spacing-03) var(--ref-spacing-05); border-bottom: 1px solid var(--iris-line); vertical-align: top; white-space: pre-line; }
.dtbl tr.add td { background: #EEFAF1; }
.dtbl tr.del td { background: #FEF1F0; color: var(--sys-color-neutral-500); text-decoration: line-through; }
.tline { margin: 0; padding: var(--ref-spacing-02) var(--ref-spacing-05); border-radius: 4px; white-space: pre-wrap; }
.tline.add { background: #EEFAF1; }
.tline.del { background: #FEF1F0; color: var(--sys-color-neutral-500); text-decoration: line-through; }
.tline.h1, .tline.h2 { font-weight: 600; }
</style>
