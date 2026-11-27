<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Button, SearchField, TextButton } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { DOC_CATEGORY_LABEL, LINK_STATUS, NEXT_STATUS, STATUS_ORDER, docIcon, type DocCategory, type LinkRow, type LinkStatus, type ReqRow, type SlotRow } from '~/composables/useIrisData'
import { useLayerStore } from '~/canvas/store'
/** 상태 · 문서 분류 라벨: 영어 원문(LINK_STATUS · DOC_CATEGORY_LABEL)을 보여 줄 때 지금 언어로(한국어는 app/i18n/ko/docs.ts) */
const statusLabel = (k: LinkStatus) => tr(LINK_STATUS[k].label)
const categoryLabel = (k: DocCategory) => tr(DOC_CATEGORY_LABEL[k])

/** 오른쪽 패널 · 기획 탭: 고른 화면의 요구사항 반영 현황 · 연결 · 관련 문서 */
const props = defineProps<{ projectId: string; screen: ScreenRow; /** 프레임 여러 개를 골랐을 때(새 1): 정책 하나를 모두에 한 번에 연결 · 끊기 */ screens?: ScreenRow[] }>()
const emit = defineEmits<{ 'open-doc': [docId: string, reqId?: string]; toast: [text: string]; 'add-doc': [] }>()

const { reqs, links } = useRequirements(props.projectId)
const docs = useDocuments(props.projectId)
const { setLink, removeLink, linkMany, unlinkMany, setScreenSlot } = useIrisMutations()
const store = useLayerStore()
const slots = useScreenSlots(props.projectId)
const projScreens = useProjectScreens(props.projectId)
const multi = computed(() => (props.screens && props.screens.length > 1 ? props.screens : null))
/** 고른 레이어(한 화면 안): 연결하면 레이어에도 '이 정책을 그렸다'고 기억해요 */
const pickedLayers = computed(() => (store.screenId.value === props.screen.id ? [...store.layerIds.value] : []))

const mine = computed(() => (links.data.value ?? []).filter((x) => x.screen_id === props.screen.id))
const reqById = computed(() => new Map((reqs.data.value ?? []).map((x) => [x.id, x])))
const docById = computed(() => new Map((docs.data.value ?? []).map((x) => [x.id, x])))

const count = (k: LinkStatus) => mine.value.filter((x) => x.status === k).length
const scored = computed(() => mine.value.filter((x) => x.status !== 'na'))
const done = computed(() => count('reflected'))
const bar = (k: LinkStatus) => ({ flex: Math.max(count(k), 0), background: k === 'reflected' ? 'var(--sys-color-brand-primary-default)' : k === 'partial' ? 'var(--sys-color-neutral-800)' : 'var(--ref-color-gray-900-10)' })

const groups = computed(() =>
  STATUS_ORDER.map((k) => ({
    k,
    label: statusLabel(k),
    items: mine.value
      .filter((x) => x.status === k)
      .map((x) => ({ link: x, req: reqById.value.get(x.requirement_id) }))
      .filter((x): x is { link: typeof x.link; req: ReqRow } => !!x.req)
      .sort((a, b) => a.req.code.localeCompare(b.req.code)),
  })).filter((g) => g.items.length),
)

const relDocs = computed(() => {
  const ids = new Set(mine.value.map((x) => reqById.value.get(x.requirement_id)?.document_id).filter(Boolean) as string[])
  return [...ids].map((id) => docById.value.get(id)).filter((d) => !!d)
})

function anchorLabel(r: ReqRow) {
  const d = docById.value.get(r.document_id)
  if (!d) return tr('No doc')
  const block = r.anchor?.block ? d.content_blocks?.find((b) => b.id === r.anchor!.block) : null
  const head = block && d.content_blocks ? [...d.content_blocks.slice(0, d.content_blocks.indexOf(block))].reverse().find((b) => b.type === 'h2') : null
  return head?.text ?? d.title
}

async function cycle(link: { requirement_id: string; status: LinkStatus; note: string | null }) {
  const next = NEXT_STATUS[link.status]
  const before = link.status
  link.status = next
  try { await setLink({ screen_id: props.screen.id, requirement_id: link.requirement_id, status: next, note: link.note }) }
  catch { link.status = before; emit('toast', tr("Couldn't change status. Try again")) }
}

// 요구사항 연결 고르기
const picking = ref(false)
const q = ref('')
const candidates = computed(() => {
  const linked = new Set(mine.value.map((x) => x.requirement_id))
  const s = q.value.trim().toLowerCase()
  return (reqs.data.value ?? []).filter((r) => !linked.has(r.id) && !r.removed_at && (!s || (r.code + ' ' + r.title).toLowerCase().includes(s)))
})
async function link(r: ReqRow) {
  if (multi.value) return linkAll(r)
  const row: LinkRow = { screen_id: props.screen.id, requirement_id: r.id, status: 'unchecked', note: null, origin: 'manual' }
  links.data.value = [...(links.data.value ?? []), row]
  try {
    await setLink(row)
    rememberLayers(r.id)
  } catch { links.data.value = (links.data.value ?? []).filter((x) => x !== row); emit('toast', tr("Couldn't link. Try again")) }
}
function rememberLayers(reqId: string) {
  const ids = pickedLayers.value
  if (ids.length) store.update(props.screen.id, ids, (n) => ({ reqs: [...new Set([...(n.reqs ?? []), reqId])] }))
}

// 여러 프레임 한 번에(새 1) ------------------------------------------------
const shared = computed(() => {
  const ms = multi.value
  if (!ms) return []
  const ids = new Set(ms.map((x) => x.id))
  const byReq = new Map<string, number>()
  for (const l of links.data.value ?? []) if (ids.has(l.screen_id)) byReq.set(l.requirement_id, (byReq.get(l.requirement_id) ?? 0) + 1)
  return [...byReq.entries()].map(([id, n]) => ({ req: reqById.value.get(id), n })).filter((x): x is { req: ReqRow; n: number } => !!x.req).sort((a, b) => b.n - a.n || a.req.code.localeCompare(b.req.code, 'en', { numeric: true }))
})
const multiCandidates = computed(() => {
  const s = q.value.trim().toLowerCase()
  const full = new Set(shared.value.filter((x) => x.n === multi.value?.length).map((x) => x.req.id))
  return (reqs.data.value ?? []).filter((r) => !r.removed_at && !full.has(r.id) && (!s || (r.code + ' ' + r.title).toLowerCase().includes(s)))
})
async function linkAll(r: ReqRow) {
  const ms = multi.value
  if (!ms) return
  try {
    await linkMany(ms.map((x) => ({ screen_id: x.id, requirement_id: r.id })), links.data.value ?? [])
    await links.refresh()
    emit('toast', tr('Linked {code} to {n} frames', { code: r.code, n: ms.length }))
  } catch { emit('toast', tr("Couldn't link. Try again")) }
}
async function unlinkAll(r: ReqRow) {
  const ms = multi.value
  if (!ms) return
  try {
    await unlinkMany(ms.map((x) => x.id), r.id)
    await links.refresh()
  } catch { emit('toast', tr("Couldn't unlink")) }
}

// 화면 칸(시안 6 · I): 이 프레임이 그리는 기획서 화면 표의 행 ------------------------
const mySlotRow = computed(() => (projScreens.data.value ?? []).find((x) => x.id === props.screen.id) ?? null)
const mySlot = computed(() => (slots.data.value ?? []).find((x) => x.id === mySlotRow.value?.slot_id) ?? null)
const slotPicking = ref(false)
const slotQ = ref('')
const slotGroups = computed(() => {
  const s = slotQ.value.trim().toLowerCase()
  const live = (slots.data.value ?? []).filter((x) => !x.removed_at && (!s || (x.code + ' ' + x.name).toLowerCase().includes(s)))
  const byDoc = new Map<string, SlotRow[]>()
  for (const x of live) byDoc.set(x.document_id, [...(byDoc.get(x.document_id) ?? []), x])
  return [...byDoc.entries()].map(([id, items]) => ({ doc: docById.value.get(id), items }))
})
const slotUse = (id: string) => (projScreens.data.value ?? []).filter((x) => x.slot_id === id && x.id !== props.screen.id).length
function slotSub(x: SlotRow) {
  const n = slotUse(x.id)
  const st = x.states.length ? ' · ' + tr('States: {list}', { list: x.states.join(', ') }) : ''
  return (n ? (n === 1 ? tr('Linked to 1 frame') : tr('Linked to {n} frames', { n })) : tr('No design yet')) + st
}
async function chooseSlot(x: SlotRow | null) {
  slotPicking.value = false
  try {
    // 이름이 'C-05/일시품절' 처럼 상태를 담고 있으면 상태 변형으로
    const st = x ? slotFromName(props.screen.name)?.state ?? null : null
    await setScreenSlot(props.screen.id, x?.id ?? null, st && x?.states.includes(st) ? st : null)
    // 칸의 '정책' 열 → '확인 전' 연결
    if (x) {
      const docReqs = (reqs.data.value ?? []).filter((r) => r.document_id === x.document_id && !r.removed_at)
      const rows = x.policy_codes.map((c) => docReqs.find((r) => r.code === c)).filter((r): r is ReqRow => !!r).map((r) => ({ screen_id: props.screen.id, requirement_id: r.id }))
      if (rows.length) await linkMany(rows, links.data.value ?? [])
    }
    await Promise.all([projScreens.refresh(), links.refresh()])
    emit('toast', x ? tr('Linked to {code} {name}', { code: x.code, name: x.name }) : tr('Unlinked from the screen slot'))
  } catch { emit('toast', tr("Couldn't change the screen slot. Try again")) }
}
/** 정책이 문서 화면 표 '정책' 열에서 왔는지 */
const fromTable = (lk: LinkRow) => lk.origin === 'doc_table'
async function unlink(requirement_id: string) {
  const before = links.data.value
  links.data.value = (links.data.value ?? []).filter((x) => !(x.screen_id === props.screen.id && x.requirement_id === requirement_id))
  try { await removeLink(props.screen.id, requirement_id) }
  catch { links.data.value = before; emit('toast', tr("Couldn't unlink")) }
}

// 메모 고치기
const editing = ref<string | null>(null)
const noteDraft = ref('')
/** 여러 줄 입력칸: 크기 조절 손잡이 대신 글 길이에 맞춰 늘어나요(사용자 요청 2026-11-27) */
const growArea = (e: Event) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }

function editNote(link: { requirement_id: string; note: string | null }) { editing.value = link.requirement_id; noteDraft.value = link.note ?? '' }
async function saveNote(link: { requirement_id: string; status: LinkStatus; note: string | null }) {
  const before = link.note
  link.note = noteDraft.value.trim() || null
  editing.value = null
  try { await setLink({ screen_id: props.screen.id, requirement_id: link.requirement_id, status: link.status, note: link.note }) }
  catch { link.note = before; emit('toast', tr("Couldn't save note")) }
}
defineExpose({ openPicker: () => (picking.value = true) })
</script>

<template>
  <!-- 프레임 여러 개(새 1): 정책 하나를 모두에 한 번에 -->
  <div v-if="multi" class="plan">
    <section class="sec2 first">
      <div class="sec-h h24"><span>{{ tr('{n} frames selected', { n: multi.length }) }}</span></div>
      <SearchField v-model:value="q" type="contained" size="s" :placeholder="tr('Link a policy to all {n} — search by ID or name', { n: multi.length })" :input-props="{ 'aria-label': tr('Search policies') }" />
      <div v-if="q.trim()" class="plist">
        <button v-for="r in multiCandidates.slice(0, 30)" :key="r.id" class="sq menu-item" @click="linkAll(r); q = ''"><span class="num w6">{{ r.code }}</span><span class="ell">{{ r.title }}</span></button>
        <p v-if="!multiCandidates.length" class="tx-meta m0 p6">{{ tr('No policies found') }}</p>
      </div>
      <div class="grp-list">
        <div v-for="x in shared" :key="x.req.id" class="sq mrow">
          <span class="sq pid num">{{ x.req.code }}</span>
          <span class="ell f1">{{ x.req.title }}</span>
          <span class="tx-meta num">{{ x.n === multi.length ? tr('All {n}', { n: multi.length }) : tr('{k} of {n}', { k: x.n, n: multi.length }) }}</span>
          <TextButton v-if="x.n < multi.length" size="s" color="blue" @click="linkAll(x.req)">{{ tr('Link to all') }}</TextButton>
          <TextButton v-else size="s" color="gray" @click="unlinkAll(x.req)">{{ tr('Unlink all') }}</TextButton>
        </div>
        <p v-if="!shared.length" class="tx-meta m0">{{ tr('None of these frames are linked to a policy yet') }}</p>
      </div>
      <p class="tx-meta m0">{{ tr('Layers work the same way: select layers inside a frame, then link.') }}</p>
    </section>
  </div>
  <div v-else class="plan">
    <!-- 화면 칸 줄(시안 6 · I) -->
    <section class="sec2 first">
      <div class="sec-h h24"><span>{{ tr('Screen slot') }}</span><TextButton size="s" color="blue" @click="slotPicking = !slotPicking">{{ mySlot ? tr('Change') : tr('Choose slot') }}</TextButton></div>
      <template v-if="mySlot">
        <span class="slot-line"><span v-if="docById.get(mySlot.document_id)?.abbr" class="sq dabbr">{{ docById.get(mySlot.document_id)?.abbr }}</span><span class="sq sid num">{{ mySlot.code }}</span><b class="ell">{{ mySlot.name }}</b><span v-if="mySlotRow?.slot_state" class="tx-meta">/ {{ mySlotRow.slot_state }}</span></span>
        <span v-if="mySlot.spec" class="tx-meta">{{ mySlot.spec }}</span>
        <span v-if="mySlot.removed_at" class="tx-meta warn">{{ tr('This slot is no longer in the document') }}</span>
      </template>
      <span v-else class="tx-meta">{{ tr('Not linked to the planning doc yet. Choose the screen slot this frame designs.') }}</span>
      <div v-if="slotPicking" class="sq picker">
        <SearchField v-model:value="slotQ" type="contained" size="s" :placeholder="tr('Search by ID or name')" :input-props="{ 'aria-label': tr('Search screen slots'), autofocus: true }" />
        <div class="plist">
          <template v-for="g in slotGroups" :key="g.doc?.id ?? 'x'">
            <span class="tx-meta glab">{{ g.doc?.title ?? '' }}</span>
            <button v-for="x in g.items" :key="x.id" :class="['sq', 'menu-item', 'srow', { on: mySlot?.id === x.id }]" @click="chooseSlot(x)">
              <span class="sq sid num">{{ x.code }}</span>
              <span class="scol"><span class="ell">{{ x.name }}</span><span class="tx-meta ell">{{ slotSub(x) }}</span></span>
            </button>
          </template>
          <p v-if="!slotGroups.length" class="tx-meta m0 p6">{{ (slots.data.value ?? []).length ? tr('No screen slots found') : tr('Add a planning doc with a screen table first') }}</p>
        </div>
        <span class="tx-meta p6">{{ tr('Frames named like “C-12 Shipping address” or “C-05/Sold out” are linked automatically.') }}</span>
        <div class="pfoot"><TextButton v-if="mySlot" size="s" color="gray" @click="chooseSlot(null)">{{ tr('Unlink slot') }}</TextButton><span class="f1" /><Button size="s" type="tertiary" @click="slotPicking = false">{{ tr('Close') }}</Button></div>
      </div>
    </section>

    <section v-if="mine.length" class="pad">
      <div class="sq sum">
        <div class="row"><span class="tx-head">{{ tr('Policies coverage') }}</span><span class="num w5"><span class="blue">{{ done }}</span>/{{ scored.length }}</span></div>
        <div role="img" :aria-label="tr('{r} reflected, {p} partial, {m} missing', { r: count('reflected'), p: count('partial'), m: count('missing') })" class="bars">
          <span :style="bar('reflected')" /><span :style="bar('partial')" /><span :style="bar('missing')" />
        </div>
        <div class="legend">
          <span><StatusIcon status="reflected" />{{ statusLabel('reflected') }} {{ count('reflected') }}</span>
          <span><StatusIcon status="partial" />{{ statusLabel('partial') }} {{ count('partial') }}</span>
          <span><StatusIcon status="missing" />{{ statusLabel('missing') }} {{ count('missing') }}</span>
        </div>
      </div>
    </section>

    <section class="sec2">
      <div class="sec-h h24"><span>{{ mine.length ? tr('Policies {n}', { n: mine.length }) : tr('Policies') }}</span><button class="ib s24" :aria-label="tr('Link policy')" :aria-expanded="picking" @click="picking = !picking"><EditorIcon name="plus" :size="16" /></button></div>

      <div v-if="picking" class="sq picker">
        <SearchField v-model:value="q" type="contained" size="s" :placeholder="tr('Search by number or text')" :input-props="{ 'aria-label': tr('Search policies'), autofocus: true }" />
        <div class="plist">
          <button v-for="r in candidates" :key="r.id" class="sq menu-item" @click="link(r)"><span class="num w6">{{ r.code }}</span><span class="ell">{{ r.title }}</span></button>
          <p v-if="!candidates.length" class="tx-meta m0 p6">{{ q.trim() ? tr('No policies found') : (reqs.data.value ?? []).length ? tr('No policies left to link') : tr('Create policies in a doc first') }}</p>
        </div>
        <div class="pfoot"><Button size="s" type="tertiary" @click="picking = false">{{ tr('Close') }}</Button></div>
      </div>

      <div v-for="g in groups" :key="g.k" class="grp-list">
        <span class="glabel"><StatusIcon :status="g.k" />{{ g.label }}<span class="sq count num">{{ g.items.length }}</span></span>
        <div v-for="{ link: lk, req } in g.items" :key="req.id" class="sq card">
          <div class="head">
            <button class="sq stb" :aria-label="tr('{code} {status}, click to change status', { code: req.code, status: statusLabel(lk.status) })" :title="tr('{status} · Click to change', { status: statusLabel(lk.status) })" @click="cycle(lk)"><StatusIcon :status="lk.status" /></button>
            <span class="tx-body w5">{{ req.title }}</span>
            <span />
            <span class="tx-meta ell"><span class="num">{{ req.code }}</span> · {{ fromTable(lk) && lk.status === 'unchecked' ? tr('From the screen table') : anchorLabel(req) }}<template v-if="req.removed_at"> · {{ tr('Removed from the doc') }}</template></span>
          </div>
          <div v-if="editing === req.id" class="note-edit">
            <div class="sq txt-box"><textarea v-model="noteDraft" rows="2" class="txt" @input="growArea" :aria-label="tr('Note')" :placeholder="tr('Describe what is missing')" @keydown.meta.enter="saveNote(lk)" /></div>
            <span class="row-end"><Button size="s" type="tertiary" @click="editing = null">{{ tr('Cancel') }}</Button><Button size="s" type="tertiary" stroke @click="saveNote(lk)">{{ tr('Save') }}</Button></span>
          </div>
          <button v-else-if="lk.note" class="sq note" @click="editNote(lk)"><EditorIcon name="warning" :size="16" class="mt3" /><span>{{ lk.note }}</span></button>
          <div class="foot">
            <span class="src"><EditorIcon name="document" :size="16" /><span class="ell">{{ docById.get(req.document_id)?.title ?? '' }}</span></span>
            <span class="acts">
              <TextButton v-if="!lk.note && editing !== req.id" size="s" color="gray" @click="editNote(lk)">{{ tr('Note') }}</TextButton>
              <TextButton size="s" color="gray" :aria-label="tr('Unlink {code}', { code: req.code })" @click="unlink(req.id)">{{ tr('Unlink') }}</TextButton>
              <TextButton size="s" color="blue" contents="text-icon" icon-name="chevron_right" @click="emit('open-doc', req.document_id, req.id)">{{ tr('Source') }}</TextButton>
            </span>
          </div>
        </div>
      </div>

      <div v-if="!mine.length && !picking" class="empty-col">
        <span class="tx-meta">{{ tr('No linked policies') }}</span>
        <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="link" @click="picking = true">{{ tr('Link policy') }}</Button>
      </div>
    </section>

    <section class="sec2 tight">
      <div class="sec-h h24"><span>{{ tr('Linked docs') }}</span><button class="ib s24" :aria-label="tr('Add doc')" @click="emit('add-doc')"><EditorIcon name="plus" :size="16" /></button></div>
      <button v-for="d in relDocs" :key="d!.id" class="sq hov doc" @click="emit('open-doc', d!.id)">
        <EditorIcon :name="docIcon(d!)" :size="16" class="muted" /><span class="ell f1">{{ d!.title }}</span><span class="tx-meta">{{ categoryLabel(d!.category) }}</span>
      </button>
      <p v-if="!relDocs.length" class="tx-meta m0 pb2">{{ tr('Docs appear here once you link policies') }}</p>
    </section>
  </div>
</template>

<style scoped>
.plan { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.pad { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); }
.sum { padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.row { display: flex; align-items: baseline; justify-content: space-between; }
.w5 { font-weight: 500; }
.w6 { font-weight: 600; flex: none; }
.blue { color: var(--sys-color-brand-primary-default); }
.bars { display: flex; height: 4px; gap: 2px; }
.bars span { border-radius: 2px; min-width: 0; }
.legend { display: flex; gap: var(--ref-spacing-08); color: var(--sys-color-neutral-600); }
.legend span { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.sec2 { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10) var(--iris-insp-x); box-shadow: 0 -1px 0 var(--iris-line); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.sec2.tight { gap: var(--ref-spacing-02); }
.h24 { height: 28px; padding: 0; }
.s24 { width: 28px; height: 28px; }
.grp-list { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.glabel { display: flex; align-items: center; gap: var(--ref-spacing-04); font-weight: 500; color: var(--sys-color-neutral-600); }
.count { padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-12); --sq-fill: var(--sys-color-neutral-100); font-weight: 500; color: var(--sys-color-neutral-600); }
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-07) var(--ref-spacing-06) var(--ref-spacing-06); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.head { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 0 var(--ref-spacing-04); }
/* 상태 버튼(.st 는 StatusIcon 의 뿌리 클래스라 이름이 겹치면 원이 네모로 바뀌어요) */
.stb { width: 16px; height: 18px; display: grid; place-items: center; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.note { display: flex; gap: var(--ref-spacing-04); margin-left: var(--ref-spacing-10); padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
/* 16 아이콘을 18 줄 높이 첫 줄 가운데에 */
.mt3 { margin-top: 1px; flex: none; }
.note-edit { margin-left: var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.txt { width: 100%; box-sizing: border-box; resize: none; overflow: hidden; border: 0; outline: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); display: block; background: transparent; font-size: 12px; line-height: 18px; }
/* 메모 입력칸 틀: textarea 는 ::before · ::after 가 없어서 감싼 .sq 가 채우기 · 선을 그려요 */
.txt-box { border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); --sq-line-w: 0.5px; }
.txt-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.row-end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); margin-left: var(--ref-spacing-10); padding-top: var(--ref-spacing-04); box-shadow: inset 0 1px 0 var(--iris-line); color: var(--sys-color-neutral-500); }
.src { display: flex; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
.acts { display: flex; align-items: center; gap: var(--ref-spacing-06); flex: none; }
.stb { border-radius: var(--ref-radius-02); }
.stb:hover { --sq-fill: var(--interaction-light-gray-hover); }
.stb:active { --sq-fill: var(--interaction-light-gray-pressed); }
.stb:focus-visible, .note:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.note { text-align: left; }
.note:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.pb2 { padding-bottom: var(--ref-spacing-02); }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); }
.doc { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 28px; margin: 0 calc(-1 * var(--ref-spacing-04)); padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-04); }
.f1 { flex: 1; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.m0 { margin: 0; }
.p6 { padding: var(--ref-spacing-04) var(--ref-spacing-06); }
.picker { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.plist { max-height: 220px; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; }
.plist > * { flex: none; }
.pfoot { display: flex; justify-content: flex-end; align-items: center; }
.sec2.first { box-shadow: none; }
.mrow { display: flex; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-05); border-radius: var(--ref-radius-04); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.pid { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 3px; border-radius: 4px; font-size: 10px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); }
.sid { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 3px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }
.dabbr { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 600; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.slot-line { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.slot-line b { font-weight: 600; }
.glab { padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-02); }
.srow { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-06); text-align: left; }
.srow.on { --sq-fill: var(--sys-color-brand-primary-lightest); }
.scol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.warn { color: #B44A0E; }
</style>
