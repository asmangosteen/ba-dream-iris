<script lang="ts">
/**
 * 문서 읽기 화면에서 요구사항 · 블록 위치로 스크롤합니다.
 * root 는 DocReader 의 바깥 요소(또는 그 조상). 찾으면 true.
 * 예) scrollToDocAnchor(readerEl, { reqId: 'r4' }) · scrollToDocAnchor(readerEl, { block: 'b8' })
 */
export function scrollToDocAnchor(
  root: ParentNode | null | undefined,
  target: { reqId?: string | null; block?: string | null },
  smooth = true,
): boolean {
  if (!root) return false
  const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'))
  let el: Element | null = null
  if (target.reqId) el = root.querySelector(`[data-reqs~="${esc(target.reqId)}"]`)
  if (!el && target.block) el = root.querySelector(`[data-block="${esc(target.block)}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
  return true
}
</script>

<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { DocRow, ReqRow } from '~/composables/useIrisData'

const props = withDefaults(defineProps<{
  doc: DocRow
  reqs: ReqRow[]
  /** 스크롤해서 강조할 요구사항 id */
  highlight?: string | null
  /** 에디터 오른쪽 패널(288px) 안에서 쓸 때 */
  compact?: boolean
}>(), { highlight: null, compact: false })

const emit = defineEmits<{
  'pick-req': [reqId: string]
  'create-req': [payload: { text: string; block: string | null }]
}>()

const supabase = useSupabaseClient()
const preview = useDevPreview()

interface ViewBlock { id: string; type: 'h1' | 'h2' | 'p' | 'li'; text: string }
interface Seg { t: string; req?: ReqRow }

// 링크 문서에 붙여넣은 본문(저장 전후로 바로 보여 주려고 따로 둡니다)
const pasted = ref<string | null>(null)
watch(() => props.doc.id, () => { pasted.value = null; draft.value = ''; saveError.value = ''; hideTool() })
const text = computed(() => pasted.value ?? props.doc.plain_text ?? '')

const blocks = computed<ViewBlock[]>(() => {
  const d = props.doc
  if (d.source_type === 'native') {
    const list = d.content_blocks ?? []
    // 첫 h1 이 문서 이름과 같으면 머리에서 이미 보여 주므로 뺍니다
    return list.filter((x, i) => !(i === 0 && x.type === 'h1' && x.text.trim() === d.title.trim()))
  }
  const out: ViewBlock[] = []
  text.value.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (!t) return
    if (i === 0 && t === d.title.trim()) return
    const li = t.match(/^[-•·*]\s+(.+)$/)
    out.push({ id: 'l' + i, type: li ? 'li' : 'p', text: li ? li[1]! : t })
  })
  return out
})

const codeRe = computed(() => {
  const codes = [...new Set(props.reqs.map((r) => r.code))].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!codes.length) return null
  return new RegExp('\\b(' + codes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi')
})
const reqByCode = computed(() => new Map(props.reqs.map((r) => [r.code.toUpperCase(), r])))

/** 블록 하나에 붙는 요구사항: anchor.block 이 우선, 없으면 본문에 번호가 처음 나오는 블록 */
const reqsByBlock = computed(() => {
  const map = new Map<string, ReqRow[]>()
  const ids = new Set(blocks.value.map((x) => x.id))
  for (const r of props.reqs) {
    let at = r.anchor?.block && ids.has(r.anchor.block) ? r.anchor.block : null
    if (!at) {
      const re = new RegExp('\\b' + r.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      at = blocks.value.find((x) => re.test(x.text))?.id ?? null
    }
    if (!at) continue
    const list = map.get(at) ?? []
    list.push(r)
    map.set(at, list)
  }
  return map
})

function segments(t: string): Seg[] {
  const re = codeRe.value
  if (!re) return [{ t }]
  const out: Seg[] = []
  let last = 0
  for (const m of t.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push({ t: t.slice(last, i) })
    out.push({ t: m[0], req: reqByCode.value.get(m[0].toUpperCase()) })
    last = i + m[0].length
  }
  if (last < t.length) out.push({ t: t.slice(last) })
  return out
}

/** 본문에 번호가 안 보이는 요구사항(선택해서 만든 것 등)은 블록 위에 번호를 따로 보여 줍니다 */
function headerReqs(b: ViewBlock): ReqRow[] {
  return (reqsByBlock.value.get(b.id) ?? []).filter((r) => !new RegExp('\\b' + r.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(b.text))
}
const blockReqIds = (b: ViewBlock) => (reqsByBlock.value.get(b.id) ?? []).map((r) => r.id).join(' ')
const isOn = (b: ViewBlock) => !!props.highlight && (reqsByBlock.value.get(b.id) ?? []).some((r) => r.id === props.highlight)

// ---------------------------------------------------------------------------
// 머리 · 메타
// ---------------------------------------------------------------------------
const fileName = computed(() => (props.doc.file_path ?? '').split('/').pop() ?? '')
const fileLabel = computed(() => (props.doc.file_type ?? '').toUpperCase())
const meta = computed(() => {
  const d = props.doc
  const src = d.source_type === 'upload' && d.file_type ? fileLabel.value : DOC_SOURCE_LABEL[d.source_type]
  return [DOC_CATEGORY_LABEL[d.category], src, relativeTime(d.updated_at), d.version_label].filter(Boolean).join(' · ')
})
const linkFailed = computed(() => props.doc.source_type === 'link' && !text.value.trim() && props.doc.fetch_status === 'failed')
const showFileCard = computed(() => props.doc.source_type === 'upload' && !text.value.trim())
const linkHost = computed(() => {
  try { return new URL(props.doc.url ?? '').hostname } catch { return props.doc.url ?? '' }
})

const opening = ref(false)
const openError = ref('')
async function openFile() {
  if (preview || !props.doc.file_path || opening.value) return
  opening.value = true
  openError.value = ''
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(props.doc.file_path, 3600)
  opening.value = false
  if (error || !data?.signedUrl) { openError.value = '파일을 열지 못했어요. 잠시 뒤 다시 시도해주세요.'; return }
  window.open(data.signedUrl, '_blank', 'noopener')
}

// 링크 본문 붙여넣기
const draft = ref('')
const saving = ref(false)
const saveError = ref('')
async function savePaste() {
  const v = draft.value.trim()
  if (!v || saving.value) return
  if (preview) { pasted.value = v; return }
  saving.value = true
  saveError.value = ''
  const { error } = await supabase.from('documents').update({ plain_text: v, fetch_status: 'manual' }).eq('id', props.doc.id)
  saving.value = false
  if (error) { saveError.value = '저장하지 못했어요. 잠시 뒤 다시 시도해주세요.'; return }
  pasted.value = v
  refreshNuxtData(`docs-${props.doc.project_id}`)
}

// ---------------------------------------------------------------------------
// 강조 요구사항으로 스크롤
// ---------------------------------------------------------------------------
const root = ref<HTMLElement | null>(null)
function scrollToReq(reqId: string, smooth = true) {
  const r = props.reqs.find((x) => x.id === reqId)
  return scrollToDocAnchor(root.value, { reqId, block: r?.anchor?.block ?? null }, smooth)
}
watch(() => [props.highlight, blocks.value.length] as const, ([id]) => {
  if (id) nextTick(() => scrollToReq(id))
}, { flush: 'post' })
onMounted(() => { if (props.highlight) scrollToReq(props.highlight, false) })
defineExpose({ scrollToReq, root })

// ---------------------------------------------------------------------------
// 글을 고르면 "요구사항으로 만들기" 띄우기
// ---------------------------------------------------------------------------
const article = ref<HTMLElement | null>(null)
const tool = ref<{ x: number; y: number; text: string; block: string | null } | null>(null)
function hideTool() { tool.value = null }
function onSelectEnd() {
  const sel = window.getSelection()
  const el = article.value
  if (!sel || sel.isCollapsed || !sel.rangeCount || !el) return hideTool()
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return hideTool()
  const picked = sel.toString().replace(/\s+/g, ' ').trim()
  if (picked.length < 2) return hideTool()
  const start = range.startContainer
  const startEl = start.nodeType === 1 ? (start as Element) : start.parentElement
  const block = startEl?.closest('[data-block]')?.getAttribute('data-block') ?? null
  const rect = range.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const x = Math.min(Math.max(rect.left + rect.width / 2 - box.left, 70), Math.max(box.width - 70, 70))
  tool.value = { x, y: rect.top - box.top - 6, text: picked.slice(0, 500), block }
}
function onSelectionChange() {
  if (!tool.value) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) hideTool()
}
function createReq() {
  if (!tool.value) return
  emit('create-req', { text: tool.value.text, block: tool.value.block })
  window.getSelection()?.removeAllRanges()
  hideTool()
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))
</script>

<template>
  <div ref="root" :class="['reader', { compact }]">
    <header class="head">
      <h2 v-if="compact" class="tx-head">{{ doc.title }}</h2>
      <h1 v-else class="tx-title">{{ doc.title }}</h1>
      <div class="tx-meta meta">
        <span>{{ meta }}</span>
        <NuxtLink v-if="compact" :to="`/p/${doc.project_id}/docs/${doc.id}`" class="lnk">넓게 보기</NuxtLink>
        <button v-if="doc.source_type === 'upload' && !showFileCard && !preview && doc.file_path" type="button" class="lnk" :disabled="opening" @click="openFile">원본</button>
      </div>
      <a v-if="doc.source_type === 'link' && doc.url" :href="doc.url" target="_blank" rel="noopener noreferrer" class="tx-meta src">
        <Icon name="link" :size="12" />
        <span class="ellipsis">{{ doc.url }}</span>
        <Icon name="arrow_up_right" :size="12" />
      </a>
    </header>

    <!-- 올린 파일인데 본문을 못 꺼낸 경우: 파일 카드 -->
    <div v-if="showFileCard" class="sq card">
      <span class="sq chip num">{{ fileLabel || '파일' }}</span>
      <span class="card-col">
        <span class="tx-body name ellipsis">{{ fileName || doc.title }}</span>
        <span class="tx-meta">{{ preview ? '미리보기에서는 파일을 열 수 없어요' : '본문을 미리 볼 수 없는 파일이에요' }}</span>
      </span>
      <button v-if="!preview" type="button" class="act line" :disabled="opening || !doc.file_path" @click="openFile">
        <Icon name="arrow_up_right" :size="14" />파일 열기
      </button>
    </div>

    <!-- 링크 본문을 못 가져온 경우: 붙여넣기 -->
    <div v-else-if="linkFailed" class="paste">
      <div class="sq card">
        <span class="sq chip"><Icon name="link" :size="16" /></span>
        <span class="card-col">
          <span class="tx-body name ellipsis">{{ linkHost || doc.title }}</span>
          <span class="tx-meta warn"><Icon name="warning" :size="12" />본문을 불러오지 못했어요</span>
        </span>
      </div>
      <label class="tx-head" :for="`paste-${doc.id}`">본문 붙여넣기</label>
      <textarea :id="`paste-${doc.id}`" v-model="draft" class="area" rows="6" placeholder="원본 페이지의 글을 복사해서 붙여넣어 주세요" />
      <div class="paste-foot">
        <span v-if="saveError" class="tx-meta warn" role="alert">{{ saveError }}</span>
        <button type="button" :class="['act', compact ? 'line' : 'pri']" :disabled="!draft.trim() || saving" @click="savePaste">{{ saving ? '저장하는 중' : '저장하기' }}</button>
      </div>
    </div>

    <article v-else ref="article" class="body" @mouseup="onSelectEnd" @keyup.shift="onSelectEnd">
      <p v-if="!blocks.length" class="tx-meta">아직 내용이 없어요</p>
      <div
        v-for="b in blocks"
        :key="b.id"
        :data-block="b.id"
        :data-reqs="blockReqIds(b) || undefined"
        :class="['blk', b.type, { sq: reqsByBlock.has(b.id), marked: reqsByBlock.has(b.id), on: isOn(b) }]"
      >
        <span v-if="headerReqs(b).length" class="codes">
          <button v-for="r in headerReqs(b)" :key="r.id" type="button" class="code num" :aria-pressed="highlight === r.id" @click="emit('pick-req', r.id)">{{ r.code }}</button>
        </span>
        <component :is="b.type === 'h1' || b.type === 'h2' ? 'h3' : 'p'" :class="b.type === 'h1' || b.type === 'h2' ? 'tx-head' : 'tx-read'">
          <template v-for="(s, i) in segments(b.text)" :key="i">
            <button v-if="s.req" type="button" class="code num" :aria-pressed="highlight === s.req.id" :title="s.req.title" @click="emit('pick-req', s.req.id)">{{ s.t }}</button>
            <template v-else>{{ s.t }}</template>
          </template>
        </component>
      </div>

      <div v-if="tool" class="sq tool" role="toolbar" aria-label="고른 글" :style="{ left: tool.x + 'px', top: tool.y + 'px' }" @mousedown.prevent>
        <button type="button" class="tool-btn" @click="createReq"><Icon name="plus" :size="14" />요구사항으로 만들기</button>
      </div>
    </article>

    <p v-if="openError" class="tx-meta warn" role="alert">{{ openError }}</p>
  </div>
</template>

<style scoped>
.reader { display: flex; flex-direction: column; gap: var(--ref-spacing-10); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.head { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.compact .head { gap: var(--ref-spacing-02); }
.meta { display: flex; align-items: center; gap: var(--ref-spacing-06); flex-wrap: wrap; }
.lnk { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.lnk:disabled { opacity: .5; cursor: default; }
.src { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; color: var(--sys-color-neutral-500); }
.src:hover { color: var(--sys-color-brand-primary-default); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.body { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.blk { min-width: 0; }
.blk.h1, .blk.h2 { margin-top: var(--ref-spacing-08); }
.blk.h1:first-child, .blk.h2:first-child { margin-top: 0; }
.blk.li > p { position: relative; padding-left: var(--ref-spacing-10); }
.blk.li > p::before { content: ''; position: absolute; left: 4px; top: 9px; width: 3px; height: 3px; border-radius: 50%; background: var(--sys-color-neutral-500); }
.blk.marked { display: flex; flex-direction: column; gap: var(--ref-spacing-02); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); scroll-margin: var(--ref-spacing-16); }
.blk.marked.on { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.blk.marked.li > p::before { display: none; }
.blk.marked.li > p { padding-left: 0; }
.blk p, .blk h3 { margin: 0; }
.compact .blk.marked { padding: var(--ref-spacing-06) var(--ref-spacing-07); }
.codes { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }
.code { display: inline; padding: 0 2px; border-radius: 3px; font-size: 12px; font-weight: 600; color: var(--sys-color-brand-primary-default); background: var(--sys-color-brand-primary-lightest); text-align: inherit; }
.code:hover, .code[aria-pressed='true'] { background: var(--sys-color-brand-primary-lighter); }
.code:focus-visible { outline: 1px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }

.card { display: flex; align-items: center; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-07); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; min-width: 0; }
.chip { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-04); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-weight: 600; color: var(--sys-color-neutral-800); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-weight: 500; }
.compact .card { flex-wrap: wrap; padding: var(--ref-spacing-08); }
.warn { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-theme-error-default); }

.paste { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.area { width: 100%; box-sizing: border-box; resize: vertical; min-height: 120px; padding: var(--ref-spacing-06) var(--ref-spacing-08); border: 0; outline: 0; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
.area:focus { box-shadow: inset 0 0 0 0.5px var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }
.paste-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--ref-spacing-06); }
.paste-foot .warn { margin-right: auto; }
.act:disabled { opacity: .5; cursor: default; }

.tool { position: absolute; z-index: 4; transform: translate(-50%, -100%); display: flex; padding: var(--ref-spacing-02); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-800); filter: drop-shadow(0 8px 16px rgb(69 76 88 / 24%)); white-space: nowrap; }
.tool-btn { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 26px; padding: 0 var(--ref-spacing-08); font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-common-white-default); border-radius: var(--ref-radius-04); }
.tool-btn:hover { background: rgb(253 253 253 / 12%); }
</style>
