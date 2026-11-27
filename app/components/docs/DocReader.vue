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

/** 양식 경고 줄을 누르면: 문서의 그 블록 · 표 행으로 스크롤하고 펼친 경고 막대와 같은 주황으로 잠깐 깜빡여요(사용자 요청 2026-11-27) */
export function flashWarnAt(root: ParentNode | null | undefined, at: { block: string; row: number | null }): boolean {
  if (!root) return false
  const blockEl = root.querySelector(`[data-block="${at.block}"]`)
  const el = (at.row ? blockEl?.querySelector(`tr[data-row="${at.row}"]`) : null) ?? blockEl
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('warn-flash')
  void (el as HTMLElement).offsetWidth
  el.classList.add('warn-flash')
  setTimeout(() => el.classList.remove('warn-flash'), 1600)
  return true
}
</script>

<script setup lang="ts">
import { Button, TextButton } from '@ba-dream/design-system'
import type { DocRow, ReqRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

const props = withDefaults(defineProps<{
  doc: DocRow
  reqs: ReqRow[]
  /** 스크롤해서 강조할 요구사항 id */
  highlight?: string | null
  /** 에디터 오른쪽 패널(288px) 안에서 쓸 때 */
  compact?: boolean
  /** 화면이 하나라도 연결된 요구사항 id — 없는 것(프레임을 지워 연결이 끊긴 것 등)은 번호를 빨갛게. 안 주면 색 구분 안 함 */
  linked?: string[] | null
  /** 고른 메모가 가리키는 자리(블록 · 표 행 · 고른 글) — 노란 하이라이트 밑줄 */
  noteMark?: { block?: string | null; row?: number | null; quote?: string | null } | null
  /** 직접 만든 정책(문서 표 밖)에 지우기 버튼 보이기 */
  removable?: boolean
}>(), { highlight: null, compact: false, linked: null, removable: false, noteMark: null })

const emit = defineEmits<{
  'pick-req': [reqId: string]
  /** 화면 ID(C-05)를 눌렀을 때 — 캔버스의 그 화면 칸으로 */
  'pick-slot': [code: string]
  /** 요구사항 블록 · 번호에 마우스를 올리면 그 REQ, 벗어나면 null — 캔버스가 그 항목을 청록 선으로 미리 보여 줘요 */
  'hover-req': [reqId: string | null]
  'create-req': [payload: { text: string; block: string | null }]
  /** 고른 글에 메모 남기기(문서 옆 댓글) — 표 행이면 그 행 · 정책 ID 도 */
  comment: [payload: { quote: string; block: string | null; row: number | null; code: string | null }]
  /** 직접 만든 정책 지우기(확인은 부모가) */
  'remove-req': [req: ReqRow]
  /** 빈 문서에서 "내용 쓰기"를 눌렀을 때(넓은 화면 전용, compact 는 고치기 링크로 갑니다) */
  edit: []
}>()
const editHref = computed(() => `/p/${props.doc.project_id}/docs/${props.doc.id}?edit=1`)
/** 넓게 보기: 고르던 REQ 도 함께 넘겨요(돌아올 때도 그대로) */
const wideHref = computed(() => `/p/${props.doc.project_id}/docs/${props.doc.id}` + (props.highlight ? `?req=${encodeURIComponent(props.highlight)}` : ''))

const supabase = useSupabaseClient()
const preview = useDevPreview()

interface ViewBlock { id: string; type: 'h1' | 'h2' | 'p' | 'li' | 'table'; text: string; rows?: string[][] }
interface Seg { t: string; req?: ReqRow }

// 링크 문서에 붙여넣은 본문(저장 전후로 바로 보여 주려고 따로 둡니다)
const pasted = ref<string | null>(null)
watch(() => props.doc.id, () => { pasted.value = null; draft.value = ''; saveError.value = ''; hideTool() })
const text = computed(() => pasted.value ?? props.doc.plain_text ?? '')

const blocks = computed<ViewBlock[]>(() => {
  const d = props.doc
  // 직접 쓴 문서 · 블록으로 읽은 Markdown 파일은 블록 그대로(표 포함)
  if (d.source_type === 'native' || (d.content_blocks?.length && !pasted.value)) {
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

/**
 * 메모 자리 노란 밑줄(사용자 요청 2026-11-27): 고른 메모의 블록(표면 그 행) 안에서 고른 글을 찾아 그 부분만,
 * 여러 칸에 걸쳐 고른 글이면 그 글에 들어 있는 칸 글 전체를 표시해요
 */
const squash = (t: string) => t.replace(/\s+/g, ' ').trim()
function hl(t: string, block: string, row: number | null = null): { t: string; m: boolean }[] {
  const nm = props.noteMark
  const q = nm?.quote ? squash(nm.quote) : ''
  if (!nm || !q || nm.block !== block || (row !== null && nm.row != null && nm.row !== row)) return [{ t, m: false }]
  const i = t.indexOf(q)
  if (i >= 0) return [{ t: t.slice(0, i), m: false }, { t: t.slice(i, i + q.length), m: true }, { t: t.slice(i + q.length), m: false }].filter((x) => x.t)
  const st = squash(t)
  if (st && q.includes(st)) return [{ t, m: true }]
  return [{ t, m: false }]
}
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
const blockReqIds = (b: ViewBlock) => (b.type === 'table' ? [] : reqsByBlock.value.get(b.id) ?? []).map((r) => r.id).join(' ')

// ---------------------------------------------------------------------------
// 표 블록: 정책 표의 행 = 정책 하나(행을 누르면 그 정책), ID 는 정책(채운 칩) · 화면(테두리 칩)
// ---------------------------------------------------------------------------
const POLICY_LEAD = /^P-[A-Z]{2,6}-\d{1,4}\b/
/** 이 표 행에 붙은 정책: 첫 칸 ID 가 정책 번호면 그 정책 */
function rowReq(b: ViewBlock, ri: number): ReqRow | null {
  const lead = (b.rows?.[ri]?.[0] ?? '').trim().match(POLICY_LEAD)?.[0]
  const r = lead ? reqByCode.value.get(lead.toUpperCase()) ?? null : null
  return r && !r.removed_at ? r : null
}
interface CellSeg { t: string; req?: ReqRow; slot?: string; policy?: string }
const ID_RE = /\b(P-[A-Z]{2,6}-\d{1,4}|(?:CMP|C|A|S|N)-\d{1,4})\b/g
/** 칸 글을 ID 칩 · 글로 나눠요 */
function cellSegs(t: string): CellSeg[] {
  const out: CellSeg[] = []
  let last = 0
  for (const m of t.matchAll(ID_RE)) {
    const i = m.index ?? 0
    if (t[i - 1] === '-') continue
    if (i > last) out.push({ t: t.slice(last, i) })
    const code = m[0]
    // 문서에서 빠진 정책(removed_at)은 '정책 표에 없음' 색으로
    if (code.startsWith('P-')) { const r = reqByCode.value.get(code); out.push({ t: code, policy: code, req: r && !r.removed_at ? r : undefined }) }
    else out.push({ t: code, slot: code })
    last = i + code.length
  }
  if (last < t.length) out.push({ t: t.slice(last) })
  return out
}
function pickRow(b: ViewBlock, ri: number, e: MouseEvent) {
  const r = rowReq(b, ri)
  if (!r || (e.target as HTMLElement).closest('button, a') || window.getSelection()?.toString()) return
  emit('pick-req', r.id)
}
/** 정책 행 이름 칸은 표기 기호를 빼고 배지로 따로 보여 줘요 */
const cellText = (b: ViewBlock, ri: number, ci: number, c: string) => (ci === 1 && rowReq(b, ri)?.marks?.length ? c.replace(/〔[^〕]*〕|⏸️?|📌|⚖️?/g, '').replace(/\s{2,}/g, ' ').trim() : c)
/** 정책 행의 표기 배지(〔기본값〕 · ⏸ · 📌 · ⚖️) */
const rowMarks = (b: ViewBlock, ri: number) => rowReq(b, ri)?.marks ?? []
const linkedSet = computed(() => (props.linked ? new Set(props.linked) : null))
/** 연결된 화면이 없는 요구사항(빨간 번호) */
const unlinked = (id: string) => !!linkedSet.value && !linkedSet.value.has(id)
/** 이 블록의 요구사항이 모두 연결된 화면이 없으면 카드도 빨강 계열(배경 · 선택선) */
const blockUnlinked = (b: ViewBlock) => { const rs = reqsByBlock.value.get(b.id) ?? []; return !!rs.length && rs.every((r) => unlinked(r.id)) }
/** 카드 아무 데나 눌러도 그 요구사항으로(번호 버튼은 자기가 처리 · 글자를 끌어 고르는 중이면 무시) — 사용자 요청 2026-11-26 */
function pickBlock(b: ViewBlock, e: MouseEvent) {
  const rs = reqsByBlock.value.get(b.id)
  if (!rs?.length || (e.target as HTMLElement).closest('button, a') || window.getSelection()?.toString()) return
  emit('pick-req', rs[0]!.id)
}
const isOn = (b: ViewBlock) => b.type !== 'table' && !!props.highlight && (reqsByBlock.value.get(b.id) ?? []).some((r) => r.id === props.highlight)

// ---------------------------------------------------------------------------
// 머리 · 메타
// ---------------------------------------------------------------------------
const fileName = computed(() => (props.doc.file_path ?? '').split('/').pop() ?? '')
const fileLabel = computed(() => (props.doc.file_type ?? '').toUpperCase())
const DOC_STATUS_LABEL: Record<NonNullable<DocRow['status']>, string> = { draft: 'Draft', review: 'In review', confirmed: 'Confirmed' }
/** 머리 아래 줄: 약어 · 상태 칩과 버튼만(분류 · 출처 · 시각 · 버전 글은 빼요 — 사용자 요청 2026-11-27) */
const hasMeta = computed(() => !!props.doc.abbr || !!props.doc.status || props.compact || (props.doc.source_type === 'upload' && !showFileCard.value && !preview && !!props.doc.file_path))
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
  if (error || !data?.signedUrl) { openError.value = tr("Couldn't open the file. Try again in a moment."); return }
  window.open(data.signedUrl, '_blank', 'noopener')
}

// 링크 본문 붙여넣기
const draft = ref('')
/** 여러 줄 입력칸: 크기 조절 손잡이 대신 글 길이에 맞춰 늘어나요(사용자 요청 2026-11-27) */
const growArea = (e: Event) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }

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
  if (error) { saveError.value = tr("Couldn't save. Try again in a moment."); return }
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
const tool = ref<{ x: number; y: number; below: boolean; text: string; block: string | null; row: number | null; code: string | null } | null>(null)
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
  const rowEl = startEl?.closest('tr[data-row]')
  const row = rowEl ? Number(rowEl.getAttribute('data-row')) : null
  const b = blocks.value.find((x) => x.id === block)
  const code = b && row !== null && b.type === 'table' ? rowReq(b, row)?.code ?? null : (b ? reqsByBlock.value.get(b.id)?.[0]?.code ?? null : null)
  const rect = range.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const x = Math.min(Math.max(rect.left + rect.width / 2 - box.left, 70), Math.max(box.width - 70, 70))
  // 위 공간(스크롤 영역 위 끝까지)이 모자라면 고른 글 아래에 띄워요 — 패널 위에 가려지지 않게(사용자 요청 2026-11-27)
  let clipTop = 0
  for (let p = el.parentElement; p; p = p.parentElement) { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) { clipTop = p.getBoundingClientRect().top; break } }
  const below = rect.top - clipTop < 48
  tool.value = { x, y: below ? rect.bottom - box.top + 6 : rect.top - box.top - 6, below, text: picked.slice(0, 500), block, row, code }
}
function onSelectionChange() {
  if (!tool.value) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) hideTool()
}
function comment() {
  if (!tool.value) return
  emit('comment', { quote: tool.value.text.slice(0, 300), block: tool.value.block, row: tool.value.row, code: tool.value.code })
  window.getSelection()?.removeAllRanges()
  hideTool()
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
      <div class="title-row">
        <h2 v-if="compact" class="tx-head" :title="doc.title">{{ doc.title }}</h2>
        <h1 v-else class="tx-title">{{ doc.title }}</h1>
        <div v-if="$slots.actions" class="acts"><slot name="actions" /></div>
      </div>
      <div v-if="hasMeta" class="tx-meta meta">
        <span v-if="doc.abbr" class="sq dchip abbr" :data-tip="tr('Document abbreviation')">{{ doc.abbr }}</span>
        <span v-if="doc.status" :class="['sq', 'dchip', 'st', doc.status]">{{ tr(DOC_STATUS_LABEL[doc.status]) }}</span>
        <TextButton v-if="compact" size="s" color="blue" @click="navigateTo(wideHref)">{{ tr('Open wide') }}</TextButton>
        <TextButton v-if="compact" size="s" color="blue" @click="navigateTo(editHref)">{{ tr('Edit') }}</TextButton>
        <TextButton v-if="doc.source_type === 'upload' && !showFileCard && !preview && doc.file_path" size="s" color="blue" contents="text-icon" icon-name="arrow_up_right" :loading="opening" @click="openFile">{{ tr('Original') }}</TextButton>
      </div>
      <a v-if="doc.source_type === 'link' && doc.url" :href="doc.url" target="_blank" rel="noopener noreferrer" class="tx-meta src">
        <EditorIcon name="link" :size="12" />
        <span class="ellipsis">{{ doc.url }}</span>
        <EditorIcon name="arrow_up_right" :size="12" />
      </a>
    </header>

    <!-- 올린 파일인데 본문을 못 꺼낸 경우: 파일 카드 -->
    <div v-if="showFileCard" class="sq card">
      <span class="sq chip num">{{ fileLabel || tr('File') }}</span>
      <span class="card-col">
        <span class="tx-body name ellipsis" :title="fileName || doc.title">{{ fileName || doc.title }}</span>
        <span class="tx-meta">{{ preview ? tr('Files can’t be opened in preview') : tr('This file can’t be previewed') }}</span>
      </span>
      <Button v-if="!preview" size="s" type="tertiary" stroke contents="icon-text" icon-name="arrow_up_right" :loading="opening" :disabled="!doc.file_path" @click="openFile">{{ tr('Open file') }}</Button>
    </div>

    <!-- 링크 본문을 못 가져온 경우: 붙여넣기 -->
    <div v-else-if="linkFailed" class="paste">
      <div class="sq card">
        <span class="sq chip"><EditorIcon name="link" :size="16" /></span>
        <span class="card-col">
          <span class="tx-body name ellipsis" :title="linkHost || doc.title">{{ linkHost || doc.title }}</span>
          <span class="tx-meta warn"><EditorIcon name="warning" :size="12" />{{ tr("Couldn't load the page content") }}</span>
        </span>
      </div>
      <label class="tx-head" :for="`paste-${doc.id}`">{{ tr('Paste content') }}</label>
      <div class="sq area-box"><textarea :id="`paste-${doc.id}`" v-model="draft" class="area" rows="6" @input="growArea" :placeholder="tr('Copy the text from the original page and paste it here')" /></div>
      <div class="paste-foot">
        <span v-if="saveError" class="tx-meta warn" role="alert">{{ saveError }}</span>
        <Button size="s" :type="compact ? 'tertiary' : 'primary'" :stroke="compact" :loading="saving" :disabled="!draft.trim() && !saving" @click="savePaste">{{ tr('Save') }}</Button>
      </div>
    </div>

    <article v-else ref="article" class="body" @mouseup="onSelectEnd" @keyup.shift="onSelectEnd">
      <div v-if="!blocks.length" class="empty">
        <p class="tx-meta">{{ tr('No content yet') }}</p>
        <TextButton v-if="compact" size="s" color="blue" contents="icon-text" icon-name="pencil" @click="navigateTo(editHref)">{{ tr('Start writing') }}</TextButton>
        <TextButton v-else size="s" color="blue" contents="icon-text" icon-name="pencil" @click="emit('edit')">{{ tr('Start writing') }}</TextButton>
      </div>
      <template v-for="b in blocks" :key="b.id">
      <div v-if="b.type === 'table'" :data-block="b.id" class="tblwrap">
        <table class="dtbl">
          <thead v-if="b.rows?.length">
            <tr><th v-for="(c, ci) in b.rows[0]" :key="ci" scope="col">{{ c }}</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in (b.rows ?? []).slice(1)"
              :key="ri"
              :data-reqs="rowReq(b, ri + 1)?.id"
              :data-row="ri + 1"
              :class="{ prow: !!rowReq(b, ri + 1), on: !!highlight && rowReq(b, ri + 1)?.id === highlight, nolink: !!rowReq(b, ri + 1) && unlinked(rowReq(b, ri + 1)!.id) }"
              @click="pickRow(b, ri + 1, $event)"
              @mouseenter="rowReq(b, ri + 1) && emit('hover-req', rowReq(b, ri + 1)!.id)"
              @mouseleave="rowReq(b, ri + 1) && emit('hover-req', null)"
            >
              <td v-for="(c, ci) in row" :key="ci" class="tx-read">
                <template v-for="(s, si) in cellSegs(cellText(b, ri + 1, ci, c))" :key="si">
                  <button v-if="s.req" type="button" :class="['sq', 'pid', 'num', { nolink: unlinked(s.req.id) }]" :aria-pressed="highlight === s.req.id" :title="unlinked(s.req.id) ? s.req.title + ' · ' + tr('Not drawn in any frame') : s.req.title" @click="emit('pick-req', s.req.id)">{{ s.t }}</button>
                  <span v-else-if="s.policy" class="sq pid num missing" :title="tr('Not in the policy table')">{{ s.t }}</span>
                  <button v-else-if="s.slot" type="button" class="sq sid num" :title="tr('Go to the screen slot')" @click="emit('pick-slot', s.slot)">{{ s.t }}</button>
                  <template v-else><template v-for="(x, xi) in hl(s.t, b.id, ri + 1)" :key="xi"><mark v-if="x.m" class="nmark">{{ x.t }}</mark><template v-else>{{ x.t }}</template></template></template>
                </template>
                <span v-if="ci === 1 && rowMarks(b, ri + 1).length" class="marks">
                  <span v-for="m in rowMarks(b, ri + 1)" :key="m" :class="['sq', 'mark', m]">{{ MARK_ICON[m] === '〔〕' ? '〔' + tr(MARK_LABEL[m]) + '〕' : MARK_ICON[m] + ' ' + tr(MARK_LABEL[m]) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-else
        :data-block="b.id"
        :data-reqs="blockReqIds(b) || undefined"
        :class="['blk', b.type, { sq: reqsByBlock.has(b.id), marked: reqsByBlock.has(b.id), on: isOn(b), nolink: blockUnlinked(b) }]"
        @mouseenter="reqsByBlock.has(b.id) && emit('hover-req', reqsByBlock.get(b.id)![0]!.id)"
        @mouseleave="reqsByBlock.has(b.id) && emit('hover-req', null)"
        @click="pickBlock(b, $event)"
      >
        <span v-if="headerReqs(b).length" class="codes">
          <template v-for="r in headerReqs(b)" :key="r.id">
            <button type="button" :class="['sq', 'code', 'num', { nolink: unlinked(r.id) }]" :title="unlinked(r.id) ? tr('Not drawn in any frame') : undefined" :aria-pressed="highlight === r.id" @click="emit('pick-req', r.id)" @mouseenter="emit('hover-req', r.id)" @mouseleave="emit('hover-req', reqsByBlock.get(b.id)?.[0]?.id ?? null)">{{ r.code }}</button>
            <button v-if="removable && r.origin === 'manual'" type="button" class="sq rm" :aria-label="tr('Delete policy {code}', { code: r.code })" :data-tip="tr('Delete policy')" @click.stop="emit('remove-req', r)"><EditorIcon name="trashbin" :size="16" /></button>
          </template>
        </span>
        <component :is="b.type === 'h1' || b.type === 'h2' ? 'h3' : 'p'" :class="b.type === 'h1' || b.type === 'h2' ? 'tx-head' : 'tx-read'">
          <template v-for="(s, i) in segments(b.text)" :key="i">
            <button v-if="s.req" type="button" :class="['sq', 'code', 'num', { nolink: unlinked(s.req.id) }]" :aria-pressed="highlight === s.req.id" :title="unlinked(s.req.id) ? s.req.title + ' · ' + tr('Not drawn in any frame') : s.req.title" @click="emit('pick-req', s.req.id)" @mouseenter="emit('hover-req', s.req.id)" @mouseleave="emit('hover-req', reqsByBlock.get(b.id)?.[0]?.id ?? null)">{{ s.t }}</button>
            <template v-else><template v-for="(x, xi) in hl(s.t, b.id)" :key="xi"><mark v-if="x.m" class="nmark">{{ x.t }}</mark><template v-else>{{ x.t }}</template></template></template>
          </template>
        </component>
      </div>
      </template>

      <div v-if="tool" :class="['sq', 'tool', { below: tool.below }]" role="toolbar" :aria-label="tr('Selected text')" :style="{ left: tool.x + 'px', top: tool.y + 'px' }" @mousedown.prevent>
        <button type="button" class="sq tool-btn" @click="createReq"><EditorIcon name="plus" :size="14" />{{ tr('Create policy') }}</button>
        <button v-if="!compact" type="button" class="sq tool-btn" @click="comment"><EditorIcon name="comment" :size="14" />{{ tr('Add a note') }}</button>
      </div>
    </article>

    <p v-if="openError" class="tx-meta warn" role="alert">{{ openError }}</p>
  </div>
</template>

<style scoped>
.reader { display: flex; flex-direction: column; gap: var(--ref-spacing-10); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.head { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
/* 패널(compact)도 제목과 칩 줄 사이 4 — 넓은 화면과 같게(사용자 요청 2026-11-27) */
.title-row { display: flex; align-items: flex-start; gap: var(--ref-spacing-08); min-width: 0; }
.title-row > h1, .title-row > h2 { flex: 1; min-width: 0; }
.acts { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); margin-top: -1px; }
.meta { display: flex; align-items: center; gap: var(--ref-spacing-04); flex-wrap: wrap; }
.dchip { height: 20px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: var(--sys-color-neutral-700); --sq-fill: var(--sys-color-neutral-100); }
.dchip.abbr { color: var(--sys-color-neutral-800); --sq-fill: transparent; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.dchip.st.review { color: #8A6100; --sq-fill: #FFF6DA; }
.dchip.st.confirmed { color: #14612C; --sq-fill: #DDF4E4; }
.src { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; color: var(--sys-color-neutral-500); border-radius: var(--ref-radius-02); transition: color .12s ease; }
.src:hover { color: var(--sys-color-brand-primary-default); }
.src:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); }
.empty p { margin: 0; }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.body { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.blk { min-width: 0; }
.blk.h1, .blk.h2 { margin-top: var(--ref-spacing-08); }
.blk.h1:first-child, .blk.h2:first-child { margin-top: 0; }
.blk.li > p { position: relative; padding-left: var(--ref-spacing-10); }
.blk.li > p::before { content: ''; position: absolute; left: 4px; top: 9px; width: 3px; height: 3px; border-radius: 50%; background: var(--sys-color-neutral-500); }
.blk.marked { cursor: pointer; display: flex; flex-direction: column; gap: var(--ref-spacing-02); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); scroll-margin: var(--ref-spacing-16); }
/* 요구사항 색은 청록(캔버스에서 그 항목을 보여 주는 선과 같은 색 --iris-peek): 올리면 옅은 청록 선, 고르면 옅은 청록 칠 + 청록 선 */
.blk.marked:hover { --sq-line: color-mix(in srgb, var(--iris-peek) 45%, transparent); --sq-line-w: 0.5px; }
.blk.marked.on { --sq-fill: var(--iris-peek-bg); --sq-line: var(--iris-peek); --sq-line-w: 0.5px; }
/* 연결된 화면이 없는 요구사항 카드: 마우스 올림 · 고름의 선과 배경을 빨강 계열로 */
/* 그려지지 않은 요구사항 카드: 고를 수 없어서 마우스를 올려도 선 · 손가락 모양 없음(번호만 빨강) */
.blk.marked.nolink { cursor: default; }
.blk.marked.nolink:hover { --sq-line: transparent; }
.blk.marked.li > p::before { display: none; }
.blk.marked.li > p { padding-left: 0; }
.blk p, .blk h3 { margin: 0; }
.compact .blk.marked { padding: var(--ref-spacing-06) var(--ref-spacing-07); }
.codes { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-04); }
/* 직접 만든 정책 지우기: 카드 오른쪽 위, 마우스를 올렸을 때만(사용자 요청 2026-11-27) */
.rm { position: absolute; top: var(--ref-spacing-04); right: var(--ref-spacing-04); width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); opacity: 0; transition: opacity .12s; }
.blk:hover .rm, .rm:focus-visible { opacity: 1; }
.rm:hover { color: var(--sys-color-theme-error-default); --sq-fill: var(--sys-color-neutral-100); }
.code { display: inline; padding: 0 2px; border-radius: 3px; font-size: 12px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); text-align: inherit; }
.code:hover, .code[aria-pressed='true'] { --sq-fill: var(--iris-peek-bg-strong); }
.code:focus-visible { outline: 2px solid var(--iris-peek); outline-offset: 1px; }
/* 연결된 화면이 없는 요구사항(프레임을 지워 연결이 끊긴 것 등): 빨간 번호 */
.code.nolink { color: var(--sys-color-theme-error-default); --sq-fill: color-mix(in srgb, var(--sys-color-theme-error-default) 11%, transparent); }
.code.nolink:hover, .code.nolink[aria-pressed='true'] { --sq-fill: color-mix(in srgb, var(--sys-color-theme-error-default) 20%, transparent); }

.card { display: flex; align-items: center; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-07); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; min-width: 0; }
.chip { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-04); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-weight: 600; color: var(--sys-color-neutral-800); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-weight: 500; }
.compact .card { flex-wrap: wrap; padding: var(--ref-spacing-08); }
.warn { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-theme-error-default); }

.paste { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.area { display: block; width: 100%; box-sizing: border-box; resize: none; overflow: hidden; min-height: 120px; padding: var(--ref-spacing-07) var(--ref-spacing-08); border: 0; outline: 0; background: transparent; font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
/* 입력칸 틀: textarea 는 ::before · ::after 가 없어서 감싼 .sq 가 채우기 · 선(squircle)을 그려요 */
/* 여러 줄 입력칸 둥글기: 댓글 입력칸과 같은 18 */
.area-box { display: block; border-radius: 18px; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }
.paste-foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--ref-spacing-06); }
.paste-foot .warn { margin-right: auto; }

.tblwrap { overflow-x: auto; margin: var(--ref-spacing-02) 0; }
.dtbl { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; }
.dtbl th { text-align: left; font-weight: 600; color: var(--sys-color-neutral-600); background: var(--sys-color-neutral-100); padding: var(--ref-spacing-04) var(--ref-spacing-06); border-bottom: 1px solid var(--iris-line); white-space: nowrap; }
.dtbl td { padding: var(--ref-spacing-05) var(--ref-spacing-06); border-bottom: 1px solid var(--iris-line); vertical-align: top; white-space: pre-line; color: var(--sys-color-neutral-800); }
.dtbl td p { margin: 0; }
/* 오른쪽 · 왼쪽 좁은 패널: 칸이 너무 좁아지지 않게(넘치면 옆으로 스크롤) */
.compact .dtbl td, .compact .dtbl th { min-width: 84px; }
.compact .dtbl td:first-child, .compact .dtbl th:first-child { min-width: 0; }
.dtbl tr.prow { cursor: pointer; scroll-margin: var(--ref-spacing-16); }
.dtbl tr.prow:hover td { background: color-mix(in srgb, var(--iris-peek) 6%, transparent); }
.dtbl tr.prow.on td { background: var(--iris-peek-bg); }
.dtbl tr.prow.on td:first-child { box-shadow: inset 2px 0 0 var(--iris-peek); }
.dtbl tr.prow.nolink { cursor: default; }
/* 정책 ID: 채운 칩(청록) · 화면 ID: 테두리 칩(파랑) */
.pid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 11px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); white-space: nowrap; vertical-align: 1px; }
.pid:is(button):hover, .pid[aria-pressed='true'] { --sq-fill: var(--iris-peek-bg-strong); }
.pid.nolink { color: var(--sys-color-theme-error-default); --sq-fill: color-mix(in srgb, var(--sys-color-theme-error-default) 11%, transparent); }
.pid.missing { color: #B44A0E; --sq-fill: #FFF1E8; }
.sid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 11px; font-weight: 600; color: var(--sys-color-brand-primary-dark, #1F63BD); --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; white-space: nowrap; vertical-align: 1px; }
.sid:hover { --sq-fill: var(--sys-color-brand-primary-lightest, #EEF5FD); }
.pid:focus-visible, .sid:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.marks { display: inline-flex; flex-wrap: wrap; gap: var(--ref-spacing-02); margin-left: var(--ref-spacing-04); vertical-align: 1px; }
.mark { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 10px; font-weight: 500; white-space: nowrap; color: var(--sys-color-neutral-700); --sq-fill: var(--sys-color-neutral-100); }
.mark.pending { color: #8A6100; --sq-fill: #FFF6DA; }
.mark.legal { color: #7C3AAE; --sq-fill: #F4ECFB; }
.mark.dev_check { color: #1F63BD; --sq-fill: #EEF5FD; }

.tool.below { transform: translate(-50%, 0); }
/* 메모 자리: 노란 하이라이트 + 굵은 글씨(밑줄 없이 — 사용자 요청 2026-11-27) */
.nmark { background: #FFF1C2; color: inherit; font-weight: 600; border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.tool { position: absolute; z-index: 4; transform: translate(-50%, -100%); display: flex; padding: var(--ref-spacing-02); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-800); filter: drop-shadow(0 8px 16px rgb(69 76 88 / 24%)); white-space: nowrap; }
.tool-btn { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 26px; padding: 0 var(--ref-spacing-08); font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-common-white-default); border-radius: var(--ref-radius-04); }
.tool-btn:hover { --sq-fill: rgb(253 253 253 / 12%); }
.tool-btn:active { --sq-fill: rgb(253 253 253 / 20%); }
.tool-btn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-light); outline-offset: 1px; }
</style>
