<script setup lang="ts">
import { Button, Icon, SearchField, TextButton } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { LINK_STATUS, NEXT_STATUS, STATUS_ORDER, docIcon, DOC_CATEGORY_LABEL, type LinkStatus, type ReqRow } from '~/composables/useIrisData'

/** 오른쪽 패널 · 기획 탭: 고른 화면의 요구사항 반영 현황 · 연결 · 관련 문서 */
const props = defineProps<{ projectId: string; screen: ScreenRow }>()
const emit = defineEmits<{ 'open-doc': [docId: string, reqId?: string]; toast: [text: string]; 'add-doc': [] }>()

const { reqs, links } = useRequirements(props.projectId)
const docs = useDocuments(props.projectId)
const { setLink, removeLink } = useIrisMutations()

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
    label: LINK_STATUS[k].label,
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
  if (!d) return 'No doc'
  const block = r.anchor?.block ? d.content_blocks?.find((b) => b.id === r.anchor!.block) : null
  const head = block && d.content_blocks ? [...d.content_blocks.slice(0, d.content_blocks.indexOf(block))].reverse().find((b) => b.type === 'h2') : null
  return head?.text ?? d.title
}

async function cycle(link: { requirement_id: string; status: LinkStatus; note: string | null }) {
  const next = NEXT_STATUS[link.status]
  const before = link.status
  link.status = next
  try { await setLink({ screen_id: props.screen.id, requirement_id: link.requirement_id, status: next, note: link.note }) }
  catch { link.status = before; emit('toast', "Couldn't change status. Try again") }
}

// 요구사항 연결 고르기
const picking = ref(false)
const q = ref('')
const candidates = computed(() => {
  const linked = new Set(mine.value.map((x) => x.requirement_id))
  const s = q.value.trim().toLowerCase()
  return (reqs.data.value ?? []).filter((r) => !linked.has(r.id) && (!s || (r.code + ' ' + r.title).toLowerCase().includes(s)))
})
async function link(r: ReqRow) {
  const row = { screen_id: props.screen.id, requirement_id: r.id, status: 'missing' as const, note: null }
  links.data.value = [...(links.data.value ?? []), row]
  try { await setLink(row) }
  catch { links.data.value = (links.data.value ?? []).filter((x) => x !== row); emit('toast', "Couldn't link. Try again") }
}
async function unlink(requirement_id: string) {
  const before = links.data.value
  links.data.value = (links.data.value ?? []).filter((x) => !(x.screen_id === props.screen.id && x.requirement_id === requirement_id))
  try { await removeLink(props.screen.id, requirement_id) }
  catch { links.data.value = before; emit('toast', "Couldn't unlink") }
}

// 메모 고치기
const editing = ref<string | null>(null)
const noteDraft = ref('')
function editNote(link: { requirement_id: string; note: string | null }) { editing.value = link.requirement_id; noteDraft.value = link.note ?? '' }
async function saveNote(link: { requirement_id: string; status: LinkStatus; note: string | null }) {
  const before = link.note
  link.note = noteDraft.value.trim() || null
  editing.value = null
  try { await setLink({ screen_id: props.screen.id, requirement_id: link.requirement_id, status: link.status, note: link.note }) }
  catch { link.note = before; emit('toast', "Couldn't save note") }
}
defineExpose({ openPicker: () => (picking.value = true) })
</script>

<template>
  <div class="plan">
    <section v-if="mine.length" class="pad">
      <div class="sq sum">
        <div class="row"><span class="tx-head">Requirements coverage</span><span class="num w5"><span class="blue">{{ done }}</span>/{{ scored.length }}</span></div>
        <div role="img" :aria-label="`${count('reflected')} reflected, ${count('partial')} partial, ${count('missing')} missing`" class="bars">
          <span :style="bar('reflected')" /><span :style="bar('partial')" /><span :style="bar('missing')" />
        </div>
        <div class="legend">
          <span><StatusIcon status="reflected" />Reflected {{ count('reflected') }}</span>
          <span><StatusIcon status="partial" />Partial {{ count('partial') }}</span>
          <span><StatusIcon status="missing" />Missing {{ count('missing') }}</span>
        </div>
      </div>
    </section>

    <section class="sec2">
      <div class="sec-h h24"><span>{{ mine.length ? `Requirements ${mine.length}` : 'Requirements' }}</span><button class="ib s24" aria-label="Link requirement" :aria-expanded="picking" @click="picking = !picking"><Icon name="plus" :size="14" /></button></div>

      <div v-if="picking" class="sq picker">
        <SearchField v-model:value="q" type="contained" size="s" placeholder="Search by number or text" :input-props="{ 'aria-label': 'Search requirements', autofocus: true }" />
        <div class="plist">
          <button v-for="r in candidates" :key="r.id" class="sq menu-item" @click="link(r)"><span class="num w6">{{ r.code }}</span><span class="ell">{{ r.title }}</span></button>
          <p v-if="!candidates.length" class="tx-meta m0 p6">{{ q.trim() ? 'No requirements found' : (reqs.data.value ?? []).length ? 'No requirements left to link' : 'Create requirements in a doc first' }}</p>
        </div>
        <div class="pfoot"><Button size="s" type="tertiary" @click="picking = false">Close</Button></div>
      </div>

      <div v-for="g in groups" :key="g.k" class="grp-list">
        <span class="glabel"><StatusIcon :status="g.k" />{{ g.label }}<span class="sq count num">{{ g.items.length }}</span></span>
        <div v-for="{ link: lk, req } in g.items" :key="req.id" class="sq card">
          <div class="head">
            <button class="st" :aria-label="`${req.code} ${LINK_STATUS[lk.status].label}, click to change status`" :title="`${LINK_STATUS[lk.status].label} · Click to change`" @click="cycle(lk)"><StatusIcon :status="lk.status" /></button>
            <span class="tx-body w5">{{ req.title }}</span>
            <span />
            <span class="tx-meta ell"><span class="num">{{ req.code }}</span> · {{ anchorLabel(req) }}</span>
          </div>
          <div v-if="editing === req.id" class="note-edit">
            <textarea v-model="noteDraft" rows="2" class="sq txt" aria-label="Note" placeholder="Describe what is missing" @keydown.meta.enter="saveNote(lk)" />
            <span class="row-end"><Button size="s" type="tertiary" @click="editing = null">Cancel</Button><Button size="s" type="tertiary" stroke @click="saveNote(lk)">Save</Button></span>
          </div>
          <button v-else-if="lk.note" class="sq note" @click="editNote(lk)"><Icon name="warning" :size="12" class="mt3" /><span>{{ lk.note }}</span></button>
          <div class="foot">
            <span class="src"><Icon name="document" :size="12" /><span class="ell">{{ docById.get(req.document_id)?.title ?? '' }}</span></span>
            <span class="acts">
              <TextButton v-if="!lk.note && editing !== req.id" size="s" color="gray" @click="editNote(lk)">Note</TextButton>
              <TextButton size="s" color="gray" :aria-label="`Unlink ${req.code}`" @click="unlink(req.id)">Unlink</TextButton>
              <TextButton size="s" color="blue" contents="text-icon" icon-name="chevron_right" @click="emit('open-doc', req.document_id, req.id)">Source</TextButton>
            </span>
          </div>
        </div>
      </div>

      <div v-if="!mine.length && !picking" class="empty-col">
        <span class="tx-meta">No linked requirements</span>
        <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="link" @click="picking = true">Link requirement</Button>
      </div>
    </section>

    <section class="sec2 tight">
      <div class="sec-h h24"><span>Linked docs</span><button class="ib s24" aria-label="Add doc" @click="emit('add-doc')"><Icon name="plus" :size="14" /></button></div>
      <button v-for="d in relDocs" :key="d!.id" class="sq hov doc" @click="emit('open-doc', d!.id)">
        <Icon :name="docIcon(d!)" :size="14" class="muted" /><span class="ell f1">{{ d!.title }}</span><span class="tx-meta">{{ DOC_CATEGORY_LABEL[d!.category] }}</span>
      </button>
      <p v-if="!relDocs.length" class="tx-meta m0 pb2">Docs appear here once you link requirements</p>
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
.sec2 { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); box-shadow: 0 -1px 0 var(--iris-line); display: flex; flex-direction: column; gap: var(--ref-spacing-08); }
.sec2.tight { gap: var(--ref-spacing-02); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.grp-list { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.glabel { display: flex; align-items: center; gap: var(--ref-spacing-04); font-weight: 500; color: var(--sys-color-neutral-600); }
.count { padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-12); --sq-fill: var(--sys-color-neutral-100); font-weight: 500; color: var(--sys-color-neutral-600); }
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-07) var(--ref-spacing-06) var(--ref-spacing-06); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.head { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 0 var(--ref-spacing-04); }
.st { width: 16px; height: 18px; display: grid; place-items: center; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.note { display: flex; gap: var(--ref-spacing-04); margin-left: var(--ref-spacing-10); padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.mt3 { margin-top: 3px; flex: none; }
.note-edit { margin-left: var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.txt { width: 100%; box-sizing: border-box; resize: vertical; border: 0; outline: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); font-size: 12px; line-height: 18px; }
.txt:focus { box-shadow: inset 0 0 0 0.5px var(--sys-color-brand-primary-default); }
.row-end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); margin-left: var(--ref-spacing-10); padding-top: var(--ref-spacing-04); box-shadow: inset 0 1px 0 var(--iris-line); color: var(--sys-color-neutral-500); }
.src { display: flex; align-items: center; gap: var(--ref-spacing-02); min-width: 0; }
.acts { display: flex; align-items: center; gap: var(--ref-spacing-06); flex: none; }
.st { border-radius: var(--ref-radius-02); }
.st:hover { background: var(--interaction-light-gray-hover); }
.st:active { background: var(--interaction-light-gray-pressed); }
.st:focus-visible, .note:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.note { text-align: left; }
.note:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.pb2 { padding-bottom: var(--ref-spacing-02); }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); }
.doc { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; margin: 0 calc(-1 * var(--ref-spacing-04)); padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-04); }
.f1 { flex: 1; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.m0 { margin: 0; }
.p6 { padding: var(--ref-spacing-04) var(--ref-spacing-06); }
.picker { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.plist { max-height: 220px; overflow: auto; display: flex; flex-direction: column; }
.plist > * { flex: none; }
.pfoot { display: flex; justify-content: flex-end; }
</style>
