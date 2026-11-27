<script lang="ts">
import type { DocBlock } from '~/composables/useIrisData'

type RawBlock = Omit<DocBlock, 'id'>

/** Markdown → 블록(utils/docFormat 의 parseMarkdown — 표 포함). 예전 이름도 남겨 둬요 */
export const parseDocText = (src: string): RawBlock[] => parseMarkdown(src)
/** 블록 → Markdown */
export const blocksToText = (blocks: RawBlock[]): string => blocksToMarkdown(blocks)

const CODE_RE = /\b(?:REQ|FR|NFR|SR)-\d{1,4}\b|\bP-[A-Z]{2,6}-\d{1,4}\b|\b(?:CMP|C|A|S|N)-\d{1,4}\b/gi
const codesIn = (t: string) => new Set((t.match(CODE_RE) ?? []).map((c) => c.toUpperCase()))

/** 글자 두 개씩 끊어 겹치는 비율(0~1). 한글에도 그대로 씁니다 */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const grams = (s: string) => {
    const t = s.replace(/\s+/g, '')
    const m = new Map<string, number>()
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const ga = grams(a), gb = grams(b)
  let total = 0, hit = 0
  ga.forEach((n) => { total += n })
  gb.forEach((n, k) => { total += n; hit += Math.min(n, ga.get(k) ?? 0) })
  return total ? (2 * hit) / total : 0
}

/**
 * Markdown 으로 고친 글(next)에 원래 블록(old)의 id 를 되도록 그대로 붙입니다. 정책 anchor.block · 댓글 자리가 끊기지 않게 하려는 것.
 * 1) 종류 + 글이 똑같은 블록을 순서대로 짝짓습니다(LCS).
 * 2) 짝 사이 빈칸에서는 같은 종류끼리, 글이 비슷한 쪽을 순서를 지키며 짝짓습니다(제자리에서 고친 블록). 같은 ID 가 들어 있으면 더 강하게 묶습니다.
 * 3) 그래도 남은 "자리가 붙은 블록"은 같은 ID 가 든 블록, 또는 글이 많이 비슷한(0.6↑) 블록을 찾아 id 를 넘깁니다(옮긴 블록).
 * 4) 나머지 새 블록은 기존 · 자리가 가리키는 id 와 겹치지 않는 새 id 를 받습니다.
 */
export function keepBlockIds(old: DocBlock[], next: RawBlock[], anchored: Set<string>): DocBlock[] {
  const n = old.length, m = next.length
  const ids: (string | null)[] = Array(m).fill(null)
  const usedOld = new Array<boolean>(n).fill(false)
  const pair = (i: number, j: number) => { ids[j] = old[i]!.id; usedOld[i] = true }

  const same = (i: number, j: number) => old[i]!.type === next[j]!.type && old[i]!.text === next[j]!.text
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = same(i, j) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const anchors: [number, number][] = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (same(i, j)) { anchors.push([i, j]); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  anchors.forEach(([i, j]) => pair(i, j))

  const score = (i: number, j: number): number => {
    const o = old[i]!, x = next[j]!
    const sim = similarity(o.text, x.text)
    const oc = codesIn(o.text), xc = codesIn(x.text)
    const shared = [...oc].some((c) => xc.has(c))
    const clash = oc.size > 0 && xc.size > 0 && !shared && o.type !== 'table'
    if (clash) return 0
    if (o.type === x.type) return 0.5 + sim + (shared ? 1 : 0)
    if (anchored.has(o.id) && (shared || sim >= 0.3)) return sim + (shared ? 1 : 0)
    return 0
  }
  const bounds = [[-1, -1] as [number, number], ...anchors, [n, m] as [number, number]]
  for (let k = 0; k < bounds.length - 1; k++) {
    const [a0, b0] = bounds[k]!, [a1, b1] = bounds[k + 1]!
    const oi = a0 + 1, nj = b0 + 1, ol = a1 - oi, nl = b1 - nj
    if (ol <= 0 || nl <= 0) continue
    const g: number[][] = Array.from({ length: ol + 1 }, () => new Array<number>(nl + 1).fill(0))
    for (let i = ol - 1; i >= 0; i--) for (let j = nl - 1; j >= 0; j--) {
      const s = score(oi + i, nj + j)
      g[i]![j] = Math.max(g[i + 1]![j]!, g[i]![j + 1]!, s > 0 ? g[i + 1]![j + 1]! + s : 0)
    }
    for (let i = 0, j = 0; i < ol && j < nl;) {
      const s = score(oi + i, nj + j)
      if (s > 0 && g[i]![j] === g[i + 1]![j + 1]! + s) { pair(oi + i, nj + j); i++; j++ }
      else if (g[i + 1]![j]! >= g[i]![j + 1]!) i++
      else j++
    }
  }

  for (let i = 0; i < n; i++) {
    if (usedOld[i] || !anchored.has(old[i]!.id)) continue
    const oc = codesIn(old[i]!.text)
    let best = -1, bestSim = 0.6
    for (let j = 0; j < m; j++) {
      if (ids[j]) continue
      const xc = codesIn(next[j]!.text)
      if ([...oc].some((c) => xc.has(c))) { best = j; break }
      const sim = similarity(old[i]!.text, next[j]!.text)
      if (sim >= bestSim) { best = j; bestSim = sim }
    }
    if (best >= 0) pair(i, best)
  }

  const taken = new Set([...old.map((x) => x.id), ...anchored])
  const fresh = () => {
    let id = ''
    do id = 'b' + Math.random().toString(36).slice(2, 8)
    while (taken.has(id))
    taken.add(id)
    return id
  }
  return next.map((x, j) => ({ id: ids[j] ?? fresh(), type: x.type, text: x.text, ...(x.rows ? { rows: x.rows } : {}) }))
}
</script>

<script setup lang="ts">
import { Button, TextInput } from '@ba-dream/design-system'
import type { DocCategory, DocRow, ReqRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 문서 고치기(새 3, DocEdit 시안): 블록마다 바로 고치고, 표는 칸을 눌러 바로 써요(라이브러리 없이 직접).
 * AI 가 쓴 Markdown 은 붙여 넣으면 블록 · 표로 바뀌어요. 위 막대에 저장 상태 · 양식 경고 · 완료(아래 버튼 줄이 본문을 가리던 것 대신).
 */
const props = defineProps<{
  doc: DocRow
  /** 이 문서의 정책(자리 보존 · 사라진 번호 확인용) */
  docReqs: ReqRow[]
  /** 프로젝트 전체 정책(ID 추천 · 옛 번호 건너뛰기용) */
  allReqs: ReqRow[]
}>()
const emit = defineEmits<{
  cancel: []
  saved: [result: { found: number; gone: string[]; warnings: number }]
}>()
const dirty = defineModel<boolean>('dirty', { default: false })

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { addRequirement, syncDocFormat, addHistory } = useIrisMutations()
const { reqs: reqData, links: linkData } = useRequirements(props.doc.project_id)
const slotData = useScreenSlots(props.doc.project_id)
const screenData = useProjectScreens(props.doc.project_id)

const CATS = Object.entries(DOC_CATEGORY_LABEL) as [DocCategory, string][]
/** 블록으로 고치는 문서: 직접 쓴 것 · Markdown 파일(블록으로 읽은 것). 나머지(PDF · 링크 글)는 글 상자 하나 */
const blockMode = computed(() => props.doc.source_type === 'native' || !!props.doc.content_blocks?.length)

/** 첫 h1 이 문서 이름과 같으면 편집에서 빼 두고 저장할 때 새 이름으로 되돌려 붙여요 */
const titleBlock = computed(() => {
  const first = props.doc.content_blocks?.[0]
  return blockMode.value && first && first.type === 'h1' && first.text.trim() === props.doc.title.trim() ? first : null
})
const bodyBlocks = computed(() => (props.doc.content_blocks ?? []).slice(titleBlock.value ? 1 : 0))

/** 반응형(프록시) 블록을 그대로 복사하면 structuredClone 이 실패해서 JSON 으로 복사해요 */
const copyBlocks = (bs: DocBlock[]): DocBlock[] => JSON.parse(JSON.stringify(bs))

interface Form { title: string; category: DocCategory; version: string; body: string }
const initial = (): Form => ({ title: props.doc.title, category: props.doc.category, version: props.doc.version_label ?? '', body: blockMode.value ? '' : props.doc.plain_text ?? '' })
const form = reactive<Form>(initial())
/** 블록 편집 중인 내용(표는 rows 를 직접 고쳐요) */
const blocks = ref<DocBlock[]>(copyBlocks(bodyBlocks.value))
/** 'blocks' = 블록 · 표 편집, 'md' = Markdown 글 상자(AI 문서 붙여 넣기 · 크게 고치기) */
const view = ref<'blocks' | 'md'>('blocks')
const mdText = ref('')

const snapshot = () => JSON.stringify([form, blocks.value, view.value === 'md' ? mdText.value : null])
let base = snapshot()
watch(() => props.doc.id, () => {
  Object.assign(form, initial())
  blocks.value = copyBlocks(bodyBlocks.value)
  view.value = 'blocks'
  base = snapshot()
  error.value = ''
})
watch([form, blocks, mdText, view], () => { dirty.value = snapshot() !== base }, { deep: true, immediate: true })

// ---------------------------------------------------------------------------
// 블록 다루기
// ---------------------------------------------------------------------------
const taken = () => new Set([...(props.doc.content_blocks ?? []).map((b) => b.id), ...blocks.value.map((b) => b.id)])
function newId(): string {
  const used = taken()
  let id = ''
  do id = 'b' + Math.random().toString(36).slice(2, 8)
  while (used.has(id))
  return id
}
const root = ref<HTMLElement | null>(null)
function focusBlock(id: string, atEnd = true) {
  nextTick(() => {
    const el = root.value?.querySelector<HTMLTextAreaElement>(`[data-edit="${id}"]`)
    if (!el) return
    el.focus()
    const n = atEnd ? el.value.length : 0
    el.setSelectionRange(n, n)
    fit(el)
  })
}
/** 글 상자 높이를 글에 맞춰요 */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
function fitAll() { nextTick(() => root.value?.querySelectorAll<HTMLTextAreaElement>('textarea.auto').forEach(fit)) }
onMounted(fitAll)
// 패널 폭이 바뀌면(창 크기 · 메모 열기) 줄바꿈이 달라져서 높이를 다시 맞춰요
let ro: ResizeObserver | null = null
onMounted(() => { if (root.value && typeof ResizeObserver !== 'undefined') { let w = 0; ro = new ResizeObserver((es) => { const nw = Math.round(es[0]?.contentRect.width ?? 0); if (nw !== w) { w = nw; fitAll() } }); ro.observe(root.value) } })
onBeforeUnmount(() => ro?.disconnect())
/** 표 열 폭: ID 열(첫 칸이 ID 거나 머리가 'ID')은 좁게, 짧은 글 열은 조금, 나머지는 나눠 가져요 */
function colWidth(b: DocBlock, ci: number): string {
  const rows = b.rows ?? []
  const head = (rows[0]?.[ci] ?? '').trim()
  const body = rows.slice(1).map((r) => r[ci] ?? '')
  if (ci === 0 && (/^(id|번호)$/i.test(head) || body.some((c) => /^[A-Z]{1,3}-/.test(c.trim())))) return '96px'
  const longest = Math.max(head.length, ...body.map((c) => c.length))
  return longest <= 8 ? '76px' : 'auto'
}
watch(() => blocks.value.length, fitAll)
watch(view, (v) => {
  if (v === 'md') mdText.value = blocksToText(blocks.value)
  else {
    const anchored = new Set(props.docReqs.map((r) => r.anchor?.block).filter((x): x is string => !!x))
    blocks.value = keepBlockIds(blocks.value, parseDocText(mdText.value), anchored)
  }
  fitAll()
})

const TYPES: { k: DocBlock['type']; label: string; icon: string }[] = [
  { k: 'p', label: 'Paragraph', icon: 'text' },
  { k: 'h1', label: 'Heading', icon: 'text_box' },
  { k: 'h2', label: 'Subheading', icon: 'text_settings' },
  { k: 'li', label: 'Bulleted list', icon: 'list' },
  { k: 'table', label: 'Table', icon: 'table' },
]
/** 블록 사이 '+' 메뉴 · 블록 손잡이 메뉴 */
const menu = ref<{ id: string; kind: 'add' | 'more' } | null>(null)
function closeMenu() { menu.value = null }
function addAfter(id: string | null, type: DocBlock['type']) {
  const i = id ? blocks.value.findIndex((b) => b.id === id) : blocks.value.length - 1
  const b: DocBlock = type === 'table'
    ? { id: newId(), type, text: '', rows: [['ID', tr('Policy'), tr('Rules')], ['', '', '']] }
    : { id: newId(), type, text: '' }
  blocks.value.splice(i + 1, 0, b)
  closeMenu()
  if (type === 'table') nextTick(() => focusCell(b.id, 1, 0))
  else focusBlock(b.id)
}
function turnInto(id: string, type: DocBlock['type']) {
  const b = blocks.value.find((x) => x.id === id)
  if (!b || b.type === type) return closeMenu()
  if (type === 'table') { b.rows = [[b.text || 'ID', '', ''], ['', '', '']]; b.text = tableText(b.rows) }
  else if (b.type === 'table') { b.text = (b.rows ?? []).map((r) => r.filter(Boolean).join(' ')).filter(Boolean).join(' '); delete b.rows }
  b.type = type
  closeMenu()
  focusBlock(id)
}
function move(id: string, d: -1 | 1) {
  const i = blocks.value.findIndex((b) => b.id === id)
  const j = i + d
  if (i < 0 || j < 0 || j >= blocks.value.length) return
  const [b] = blocks.value.splice(i, 1)
  blocks.value.splice(j, 0, b!)
  closeMenu()
}
function removeBlock(id: string) {
  const i = blocks.value.findIndex((b) => b.id === id)
  if (i < 0) return
  blocks.value.splice(i, 1)
  closeMenu()
  const prev = blocks.value[i - 1]
  if (prev && prev.type !== 'table') focusBlock(prev.id)
}

/** 글 블록 입력: '# ' · '## ' · '- ' 로 시작하면 그 종류로 바꿔요 */
function onText(b: DocBlock, e: Event) {
  const el = e.target as HTMLTextAreaElement
  let v = el.value
  const m = v.match(/^(##|#|-|\*)\s(.*)$/s)
  if (m && b.type === 'p') {
    b.type = m[1] === '#' ? 'h1' : m[1] === '##' ? 'h2' : 'li'
    v = m[2]!
    el.value = v
  }
  b.text = v.replace(/\n/g, b.type === 'p' ? '\n' : ' ')
  fit(el)
}
function onTextKey(b: DocBlock, e: KeyboardEvent) {
  if (e.isComposing) return
  const el = e.target as HTMLTextAreaElement
  if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    // 커서 뒤 글은 새 블록으로 넘겨요. 빈 목록 줄에서 Enter 면 문단으로
    if (b.type === 'li' && !b.text.trim()) { b.type = 'p'; return }
    const at = el.selectionStart ?? b.text.length
    const rest = b.text.slice(at)
    b.text = b.text.slice(0, at)
    const nb: DocBlock = { id: newId(), type: b.type === 'li' ? 'li' : 'p', text: rest }
    blocks.value.splice(blocks.value.indexOf(b) + 1, 0, nb)
    focusBlock(nb.id, false)
    return
  }
  if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
    const i = blocks.value.indexOf(b)
    if (b.type !== 'p') { e.preventDefault(); b.type = 'p'; return }
    const prev = blocks.value[i - 1]
    if (prev && prev.type !== 'table') {
      e.preventDefault()
      const len = prev.text.length
      prev.text += b.text
      blocks.value.splice(i, 1)
      nextTick(() => { const p = root.value?.querySelector<HTMLTextAreaElement>(`[data-edit="${prev.id}"]`); if (p) { p.focus(); p.setSelectionRange(len, len); fit(p) } })
    }
    return
  }
  if (e.key === 'ArrowUp' && el.selectionStart === 0) { const p = blocks.value[blocks.value.indexOf(b) - 1]; if (p && p.type !== 'table') { e.preventDefault(); focusBlock(p.id) } }
  if (e.key === 'ArrowDown' && el.selectionStart === el.value.length) { const n = blocks.value[blocks.value.indexOf(b) + 1]; if (n && n.type !== 'table') { e.preventDefault(); focusBlock(n.id, false) } }
}
/** 여러 줄 · Markdown(표 포함)을 붙여 넣으면 블록으로 바꿔 끼워요 */
function onPaste(b: DocBlock, e: ClipboardEvent) {
  const t = e.clipboardData?.getData('text/plain') ?? ''
  if (!t.includes('\n')) return
  e.preventDefault()
  const parsed = parseDocText(t).map((x) => ({ ...x, id: newId() }))
  if (!parsed.length) return
  const i = blocks.value.indexOf(b)
  blocks.value.splice(b.text.trim() ? i + 1 : i, b.text.trim() ? 0 : 1, ...parsed)
  const last = parsed[parsed.length - 1]!
  if (last.type !== 'table') focusBlock(last.id)
}

// ---------------------------------------------------------------------------
// 표 블록
// ---------------------------------------------------------------------------
function syncTable(b: DocBlock) { b.text = tableText(b.rows ?? []) }
function focusCell(id: string, r: number, c: number) {
  nextTick(() => {
    const el = root.value?.querySelector<HTMLTextAreaElement>(`[data-cell="${id}:${r}:${c}"]`)
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
}
function addRow(b: DocBlock, after?: number) {
  const rows = b.rows ?? (b.rows = [['']])
  const w = rows[0]?.length ?? 1
  const at = after === undefined ? rows.length : after + 1
  rows.splice(at, 0, Array(w).fill(''))
  syncTable(b)
  focusCell(b.id, at, 0)
}
function removeRow(b: DocBlock, r: number) {
  if (!b.rows || b.rows.length <= 2) return
  b.rows.splice(r, 1)
  syncTable(b)
}
function addCol(b: DocBlock) {
  for (const row of b.rows ?? []) row.push('')
  syncTable(b)
  focusCell(b.id, 0, (b.rows?.[0]?.length ?? 1) - 1)
}
function removeCol(b: DocBlock, c: number) {
  if (!b.rows || (b.rows[0]?.length ?? 0) <= 1) return
  for (const row of b.rows) row.splice(c, 1)
  syncTable(b)
}
function onCell(b: DocBlock, r: number, c: number, e: Event) {
  const el = e.target as HTMLTextAreaElement
  b.rows![r]![c] = el.value
  syncTable(b)
  fit(el)
  idQuery(b, r, c, el.value)
}
function onCellKey(b: DocBlock, r: number, c: number, e: KeyboardEvent) {
  if (e.isComposing) return
  if (suggest.value && suggest.value.key === `${b.id}:${r}:${c}`) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = suggest.value.items.length; suggest.value.i = (suggest.value.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; return }
    if (e.key === 'Enter' || e.key === 'Tab') { const it = suggest.value.items[suggest.value.i]; if (it) { e.preventDefault(); pickSuggest(b, r, c, it.code); return } }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); suggest.value = null; return }
  }
  const rows = b.rows ?? []
  const w = rows[0]?.length ?? 1
  if (e.key === 'Tab') {
    e.preventDefault()
    let nr = r, nc = c + (e.shiftKey ? -1 : 1)
    if (nc >= w) { nc = 0; nr++ }
    if (nc < 0) { nc = w - 1; nr-- }
    if (nr >= rows.length) { addRow(b); return }
    if (nr >= 0) focusCell(b.id, nr, nc)
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (r + 1 >= rows.length) addRow(b)
    else focusCell(b.id, r + 1, c)
  }
}
/** 표 칸에 여러 줄 Markdown 표를 붙여 넣으면 그 자리부터 칸을 채워요 */
function onCellPaste(b: DocBlock, r: number, c: number, e: ClipboardEvent) {
  const t = e.clipboardData?.getData('text/plain') ?? ''
  if (!t.includes('\n') && !t.includes('\t')) return
  const parsed = parseDocText(t).find((x) => x.type === 'table')?.rows ?? t.trim().split('\n').map((l) => l.split('\t'))
  if (!parsed.length) return
  e.preventDefault()
  const rows = b.rows!
  parsed.forEach((pr, i) => {
    const ri = r + i
    if (!rows[ri]) rows.push(Array(rows[0]!.length).fill(''))
    pr.forEach((v, j) => { if (rows[ri]![c + j] !== undefined) rows[ri]![c + j] = v })
  })
  syncTable(b)
  fitAll()
}

// 정책 ID 추천(새 3): ID 칸에 'P' 를 치면 영역의 다음 번호 + 이미 있는 번호
const suggest = ref<{ key: string; items: { code: string; isNew: boolean; label: string }[]; i: number } | null>(null)
function idQuery(b: DocBlock, r: number, c: number, v: string) {
  if (c !== 0 || r === 0 || !/^P/i.test(v.trim()) || POLICY_ONE_RE.test(v.trim())) { suggest.value = null; return }
  const existing = [...new Set([...props.allReqs.map((x) => x.code), ...liveCodes.value])].filter((x) => x.startsWith('P-'))
  const items = suggestPolicyIds(v, existing).map((x) => ({ ...x, label: x.isNew ? tr('New — next number in {area}', { area: policyArea(x.code) ?? '' }) : (props.allReqs.find((q) => q.code === x.code)?.title ?? '') + ' · ' + tr('already used') }))
  suggest.value = items.length ? { key: `${b.id}:${r}:${c}`, items, i: 0 } : null
}
const POLICY_ONE_RE = /^P-[A-Z]{2,6}-\d{1,4}$/
function pickSuggest(b: DocBlock, r: number, c: number, code: string) {
  b.rows![r]![c] = code
  syncTable(b)
  suggest.value = null
  focusCell(b.id, r, c + 1)
}
function onCellBlur() { setTimeout(() => { if (!root.value?.querySelector('.sug:hover')) suggest.value = null }, 120) }

// ---------------------------------------------------------------------------
// 바로 검사(양식): 경고가 난 표 행은 옅은 주황 + 점, 위 막대에 경고 수
// ---------------------------------------------------------------------------
const liveBlocks = computed<DocBlock[]>(() => (view.value === 'md' ? parseDocText(mdText.value).map((x, i) => ({ ...x, id: 'md' + i })) : blocks.value))
const check = computed(() => analyzeDoc(liveBlocks.value))
const liveCodes = computed(() => check.value.policies.map((p) => p.code))
const warnAt = computed(() => {
  const m = new Map<string, FormatWarning[]>()
  for (const w of check.value.warnings) { if (w.kind === 'no_screen') continue; const k = `${w.block}:${w.row ?? ''}`; m.set(k, [...(m.get(k) ?? []), w]) }
  return m
})
const blockWarns = (id: string) => check.value.warnings.filter((w) => w.block === id && w.kind !== 'no_screen')
const warnCount = computed(() => check.value.warnings.filter((w) => w.kind !== 'no_screen').length)
const wText = (w: FormatWarning) => { const t = warningText(w); return tr(t.key, t.vars) }

// 경고 바로 고치기(사용자 요청 2026-11-27): 경고마다 무엇을 하면 되는지 버튼으로 ---------------------------
const headCol = (b: DocBlock, ...words: string[]) => (b.rows?.[0] ?? []).findIndex((h) => words.some((x) => h.replace(/\s+/g, '').toLowerCase().includes(x)))
/** 정책 표(첫 칸에 P- 번호가 있는 표) */
const policyTable = () => blocks.value.find((b) => b.type === 'table' && (b.rows ?? []).slice(1).some((r) => /^P-[A-Z]{2,6}-\d/.test((r[0] ?? '').trim())))
function goFirstWarning() {
  if (view.value !== 'blocks') view.value = 'blocks'
  nextTick(() => root.value?.querySelector('.warnline, tr.warned')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
function fixLabel(w: FormatWarning): string {
  if (w.kind === 'missing_policy') return tr('Add {code} to the policy table', { code: w.code })
  if (w.kind === 'empty_policy_col') return w.other ? tr('Put {code} in the Policy column', { code: w.other }) : tr('Fill in the Policy column')
  return tr('Go to the row')
}
function fixWarning(w: FormatWarning) {
  const b = blocks.value.find((x) => x.id === w.block)
  if (w.kind === 'missing_policy') {
    // 정책 표 맨 아래에 그 번호로 행을 더하고 이름 칸으로
    const t = policyTable()
    if (!t?.rows) { addAfter(b?.id ?? null, 'table'); return }
    const row = Array(t.rows[0]!.length).fill('') as string[]
    row[0] = w.code
    t.rows.push(row)
    syncTable(t)
    focusCell(t.id, t.rows.length - 1, Math.min(1, row.length - 1))
    return
  }
  if (!b?.rows || w.row === null) return
  if (w.kind === 'empty_policy_col') {
    let c = headCol(b, '정책', 'polic')
    // '정책' 열이 없으면 끝에 더해요
    if (c < 0) { b.rows.forEach((r, i) => r.push(i === 0 ? tr('Policy') : '')); c = b.rows[0]!.length - 1 }
    if (w.other) b.rows[w.row]![c] = w.other
    syncTable(b)
    focusCell(b.id, w.row, c)
    return
  }
  focusCell(b.id, w.row, 0)
}

// ---------------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------------
function buildBlocks(): DocBlock[] {
  let body: DocBlock[]
  if (view.value === 'md') {
    const anchored = new Set(props.docReqs.map((r) => r.anchor?.block).filter((x): x is string => !!x))
    body = keepBlockIds(bodyBlocks.value, parseDocText(mdText.value), anchored)
  } else body = copyBlocks(blocks.value).filter((b) => b.type === 'table' || b.text.trim() || b.type === 'p')
  // 빈 문단은 빼요(줄 띄우기는 블록 간격으로)
  body = body.filter((b) => b.type !== 'p' || b.text.trim())
  const t = form.title.trim()
  return titleBlock.value ? [{ id: titleBlock.value.id, type: 'h1', text: t || titleBlock.value.text }, ...body] : body
}
const plainOf = (bs: DocBlock[]) => bs.map((x) => x.text).join('\n') || null
function buildDoc(): DocRow {
  if (blockMode.value) {
    const bs = buildBlocks()
    return { ...props.doc, title: form.title.trim(), content_blocks: bs, plain_text: plainOf(bs) }
  }
  return { ...props.doc, title: form.title.trim(), plain_text: form.body.trim() ? form.body : null }
}
const allText = (d: DocRow) => (d.content_blocks ? d.content_blocks.map((x) => x.text).join('\n') : d.plain_text ?? '')

/** 고치기 전엔 글에 있었는데 이제 없는 옛 번호(REQ- · 직접 만든 것). 표에서 읽은 정책은 syncDocFormat 이 알려줘요 */
function goneCodes(before: DocRow, after: DocRow): string[] {
  const was = allText(before), now = allText(after)
  const oldIds = new Set((before.content_blocks ?? []).map((x) => x.id))
  const newIds = new Set((after.content_blocks ?? []).map((x) => x.id))
  const out: string[] = []
  for (const r of props.docReqs) {
    if (r.origin === 'doc_table' || r.removed_at) continue
    const re = new RegExp('\\b' + r.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    const inNow = re.test(now)
    const blockGone = !!r.anchor?.block && oldIds.has(r.anchor.block) && !newIds.has(r.anchor.block)
    if (!inNow && (re.test(was) || blockGone)) out.push(r.code)
  }
  return [...new Set(out)].sort()
}

const saving = ref(false)
const error = ref('')
const savedAt = ref<string | null>(null)
const canSave = computed(() => !saving.value && !!form.title.trim() && dirty.value)

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  const before = props.doc
  const after = buildDoc()
  const patch: Partial<DocRow> = { title: after.title, category: form.category, version_label: form.version.trim() || null, plain_text: after.plain_text }
  if (blockMode.value) patch.content_blocks = after.content_blocks
  else if (before.source_type === 'link' && (after.plain_text ?? '') !== (before.plain_text ?? '') && after.plain_text) patch.fetch_status = 'manual'

  try {
    if (preview) {
      const store = useState<Omit<DocRow, 'project_id'>[]>('pv-docs')
      const i = store.value?.findIndex((d) => d.id === before.id) ?? -1
      if (i < 0) throw new Error('missing')
      store.value[i] = { ...store.value[i]!, ...patch, updated_at: new Date().toISOString() }
    } else {
      const { error: upErr } = await supabase.from('documents').update(patch as never).eq('id', before.id)
      if (upErr) throw upErr
    }
  } catch {
    saving.value = false
    error.value = tr("Couldn't save. Try again in a moment.")
    return
  }

  // 양식 읽기: 정책 표 · 화면 표 → 정책 · 화면 칸 · '확인 전' 연결
  const full = { ...after, ...patch } as DocRow
  const result = analyzeDoc(full.content_blocks ?? [])
  let added = 0
  let gone: string[] = []
  const hadTable = props.docReqs.some((r) => r.origin === 'doc_table')
  if (result.policies.length || result.slots.length || hadTable) {
    try {
      const out = await syncDocFormat(before.project_id, before.id, result, { reqs: reqData.data.value ?? [], slots: slotData.data.value ?? [], screens: screenData.data.value ?? [], links: linkData.data.value ?? [] })
      added += out.added.length
      gone = out.removed
    } catch { error.value = tr('Saved, but couldn’t update policies from the tables. Try saving again.') }
  }
  // 옛 번호(REQ-001 …) 줄도 계속 읽어요
  const existing = new Set(props.allReqs.filter((r) => r.document_id === before.id).map((r) => r.code.toUpperCase()))
  for (const c of detectRequirements(full)) {
    if (existing.has(c.code)) continue
    existing.add(c.code)
    try {
      await addRequirement(before.project_id, { document_id: before.id, code: c.code, title: c.title.slice(0, 120), body: c.title, origin: 'auto_pattern', anchor: c.block ? { block: c.block } : {} })
      added++
    } catch { /* 하나가 실패해도 나머지는 계속 */ }
  }
  // 수정 기록(바뀐 블록만)
  if (blockMode.value) await addHistory(before.project_id, before.id, before.content_blocks ?? [], full.content_blocks ?? []).catch(() => null)

  gone = [...new Set([...gone, ...goneCodes(before, after)])].sort()
  await refreshNuxtData([`docs-${before.project_id}`, `reqs-${before.project_id}`, `links-${before.project_id}`, `slots-${before.project_id}`, `all-screens-${before.project_id}`, `doc-history-${before.project_id}`])
  saving.value = false
  savedAt.value = new Date().toISOString()
  base = snapshot()
  dirty.value = false
  emit('saved', { found: added, gone, warnings: result.warnings.filter((w) => w.kind !== 'no_screen').length })
}

onMounted(() => root.value?.querySelector<HTMLInputElement>(`#edTitle-${props.doc.id}`)?.focus())
const TI = { size: 's', showLeftIcon: false, showRightIcon: false, showButton: false } as const
const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save() } }
defineExpose({ save })

const fileName = computed(() => (props.doc.file_path ?? '').split('/').pop() ?? '')
const statusText = computed(() => saving.value ? tr('Saving…') : dirty.value ? tr('Unsaved changes') : savedAt.value ? tr('Saved') : '')
function onDocPointer(e: PointerEvent) { if (menu.value && !(e.target as HTMLElement).closest('.bmenu, .gut')) closeMenu() }
onMounted(() => document.addEventListener('pointerdown', onDocPointer, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true))
</script>

<template>
  <form ref="root" class="ded" @submit.prevent="save" @keydown.meta.enter.prevent="save" @keydown.ctrl.enter.prevent="save" @keydown.meta.s.prevent="save" @keydown.ctrl.s.prevent="save">
    <!-- 위 막대: 편집 중 · 저장 상태 · 경고 · 취소 · 저장(스크롤해도 위에 붙어 있어요 — 예전 아래 버튼 줄이 본문을 가리던 문제) -->
    <div class="topbar">
      <span class="sq chip-edit">{{ tr('Editing') }}</span>
      <span class="tx-meta status" role="status" aria-live="polite">{{ statusText }}</span>
      <span class="f1" />
      <button v-if="blockMode && warnCount" type="button" class="sq warnchip" :data-tip="tr('Go to the first warning')" @click="goFirstWarning"><EditorIcon name="warning" :size="12" />{{ warnCount }}</button>
      <Button size="s" type="tertiary" :disabled="saving" @click="emit('cancel')">{{ tr('Cancel') }}</Button>
      <Button size="s" type="primary" :loading="saving" :disabled="!canSave && !saving" @click="save">{{ tr('Save') }}</Button>
    </div>
    <p v-if="error" class="tx-meta warn" role="alert"><EditorIcon name="warning" :size="12" />{{ error }}</p>

    <!-- 문서 정보 -->
    <div class="fields">
      <TextInput
        v-model:value="form.title"
        v-bind="TI"
        :label="tr('Document name')"
        essential
        :placeholder="tr('Document name')"
        :show-supporting-text="!form.title.trim()"
        :supporting-text="tr('Enter a document name')"
        supporting-theme="destructed"
        :input-props="{ id: `edTitle-${doc.id}`, autocomplete: 'off', onKeydown: onEnter }"
        :label-props="{ htmlFor: `edTitle-${doc.id}` }"
      />
      <div class="row">
        <div class="choice f1">
          <span :id="`edCat-${doc.id}`" class="tx-head lbl">{{ tr('Category') }}</span>
          <div class="seg cats" role="radiogroup" :aria-labelledby="`edCat-${doc.id}`">
            <button v-for="c in CATS" :key="c[0]" type="button" role="radio" :aria-checked="form.category === c[0]" :class="['sq', 'seg-item', { on: form.category === c[0] }]" @click="form.category = c[0]">{{ tr(c[1]) }}</button>
          </div>
        </div>
        <div class="ver">
          <TextInput v-model:value="form.version" v-bind="TI" :label="tr('Version')" :placeholder="tr('e.g. v1.3')" :show-supporting-text="false" :input-props="{ id: `edVer-${doc.id}`, autocomplete: 'off', onKeydown: onEnter }" :label-props="{ htmlFor: `edVer-${doc.id}` }" />
        </div>
      </div>
      <div v-if="doc.source_type === 'upload' && fileName" class="tx-meta src"><EditorIcon name="clip" :size="12" /><span class="ellipsis" :title="fileName">{{ fileName }}</span></div>
      <div v-else-if="doc.source_type === 'link' && doc.url" class="tx-meta src"><EditorIcon name="link" :size="12" /><span class="ellipsis" :title="doc.url">{{ doc.url }}</span></div>
    </div>

    <!-- 본문: 블록 편집 -->
    <section v-if="blockMode" class="content" :aria-label="tr('Content')">
      <div class="body-h">
        <span class="tx-head lbl">{{ tr('Content') }}</span>
        <span class="f1" />
        <div class="seg views" role="tablist" :aria-label="tr('Edit as')">
          <button type="button" role="tab" :aria-selected="view === 'blocks'" :class="['sq', 'seg-item', { on: view === 'blocks' }]" @click="view = 'blocks'">{{ tr('Blocks') }}</button>
          <button type="button" role="tab" :aria-selected="view === 'md'" :class="['sq', 'seg-item', { on: view === 'md' }]" @click="view = 'md'">Markdown</button>
        </div>
      </div>
      <p class="tx-meta hint">{{ view === 'blocks' ? tr('Paste Markdown to add sections. Type in a table cell to edit it directly.') : tr('Paste the whole document written by AI. Tables become table blocks.') }}</p>

      <!-- Markdown: 블록과 같은 너비 · 글에 맞춰 늘어나요(모서리 크기 조절 손잡이 없음) -->
      <div v-if="view === 'md'" class="sq area-box">
        <textarea v-model="mdText" class="auto area md" rows="12" spellcheck="false" :aria-label="tr('Markdown')" @input="fit($event.target as HTMLTextAreaElement)" />
      </div>

      <!-- 블록: 패널 폭 그대로(상자 없이). 왼쪽 여백에 손잡이 하나(⋮) — 아래에 더하기 · 바꾸기 · 옮기기 · 지우기 -->
      <div v-else class="blocks">
        <div v-for="(b, bi) in blocks" :key="b.id" :class="['blk', b.type]">
          <button type="button" class="sq gut" :aria-label="tr('Block menu')" :data-tip="tr('Block menu')" :aria-expanded="menu?.id === b.id" @click="menu = menu?.id === b.id ? null : { id: b.id, kind: 'more' }"><EditorIcon name="menu_kebab" :size="14" /></button>
          <div v-if="menu?.id === b.id" class="sq menu bmenu" role="menu">
            <span class="mlab">{{ tr('Add below') }}</span>
            <button v-for="t in TYPES" :key="'a' + t.k" type="button" role="menuitem" class="sq menu-item" @click="addAfter(b.id, t.k)"><EditorIcon :name="t.icon" :size="16" />{{ tr(t.label) }}</button>
            <span class="sep" role="separator" />
            <span class="mlab">{{ tr('Turn into') }}</span>
            <button v-for="t in TYPES.filter((x) => x.k !== b.type)" :key="'t' + t.k" type="button" role="menuitem" class="sq menu-item" @click="turnInto(b.id, t.k)"><EditorIcon :name="t.icon" :size="16" />{{ tr(t.label) }}</button>
            <span class="sep" role="separator" />
            <button type="button" role="menuitem" class="sq menu-item" :disabled="bi === 0" @click="move(b.id, -1)"><EditorIcon name="chevron_down" :size="16" class="up" />{{ tr('Move up') }}</button>
            <button type="button" role="menuitem" class="sq menu-item" :disabled="bi === blocks.length - 1" @click="move(b.id, 1)"><EditorIcon name="chevron_down" :size="16" />{{ tr('Move down') }}</button>
            <button type="button" role="menuitem" class="sq menu-item danger" @click="removeBlock(b.id)"><EditorIcon name="trashbin" :size="16" />{{ tr('Delete') }}</button>
          </div>

          <!-- 표 블록 -->
          <div v-if="b.type === 'table'" class="tbl-edit">
            <table class="etbl">
              <colgroup><col v-for="(_, ci) in b.rows?.[0] ?? []" :key="ci" :style="{ width: colWidth(b, ci) }"></colgroup>
              <tbody>
                <tr v-for="(row, ri) in b.rows ?? []" :key="ri" :class="{ head: ri === 0, warned: warnAt.has(`${b.id}:${ri}`) }">
                  <td v-for="(cell, ci) in row" :key="ci" :class="{ idcol: ci === 0 && ri > 0 && colWidth(b, 0) === '96px' }">
                    <span v-if="ci === 0 && warnAt.has(`${b.id}:${ri}`)" class="wdot" role="img" :aria-label="warnAt.get(`${b.id}:${ri}`)!.map(wText).join(' · ')" :data-tip="warnAt.get(`${b.id}:${ri}`)!.map(wText).join(' · ')" />
                    <textarea
                      :value="cell"
                      :data-cell="`${b.id}:${ri}:${ci}`"
                      class="auto cell"
                      rows="1"
                      cols="1"
                      :aria-label="ri === 0 ? tr('Column {n} header', { n: ci + 1 }) : tr('Row {r}, column {c}', { r: ri, c: ci + 1 })"
                      :placeholder="ri === 0 ? tr('Header') : ''"
                      @input="onCell(b, ri, ci, $event)"
                      @keydown="onCellKey(b, ri, ci, $event)"
                      @paste="onCellPaste(b, ri, ci, $event)"
                      @focus="idQuery(b, ri, ci, cell)"
                      @blur="onCellBlur"
                    />
                    <!-- 머리 칸: 열 지우기(마우스를 올리면) · 줄 칸 마지막: 행 지우기 -->
                    <button v-if="ri === 0 && row.length > 1" type="button" class="sq cact" :aria-label="tr('Delete column {n}', { n: ci + 1 })" :data-tip="tr('Delete column')" @click="removeCol(b, ci)"><EditorIcon name="close" :size="12" /></button>
                    <button v-else-if="ri > 0 && ci === row.length - 1 && (b.rows?.length ?? 0) > 2" type="button" class="sq cact" :aria-label="tr('Delete row {r}', { r: ri })" :data-tip="tr('Delete row')" @click="removeRow(b, ri)"><EditorIcon name="close" :size="12" /></button>
                    <div v-if="suggest && suggest.key === `${b.id}:${ri}:${ci}`" class="sq menu sug" role="listbox" :aria-label="tr('Policy IDs')">
                      <button v-for="(s, si) in suggest.items" :key="s.code" type="button" role="option" :aria-selected="si === suggest.i" :class="['sq', 'menu-item', { on: si === suggest.i }]" @mousedown.prevent="pickSuggest(b, ri, ci, s.code)"><span class="sq pid">{{ s.code }}</span><span class="ellipsis">{{ s.label }}</span></button>
                      <span class="sug-hint">{{ tr('↑↓ to move · Enter to pick') }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <button type="button" class="sq addcol" :aria-label="tr('Add column')" :data-tip="tr('Add column')" @click="addCol(b)"><EditorIcon name="plus" :size="12" /></button>
            <button type="button" class="sq tbtn" @click="addRow(b)"><EditorIcon name="plus" :size="14" />{{ tr('Add row') }}</button>
            <div v-for="(w, wi) in blockWarns(b.id)" :key="wi" class="sq warnline" role="note">
              <EditorIcon name="warning" :size="12" class="wi" />
              <span class="wt">{{ wText(w) }}</span>
              <button type="button" class="sq fixbtn" @click="fixWarning(w)">{{ fixLabel(w) }}</button>
            </div>
          </div>

          <!-- 글 블록 -->
          <textarea
            v-else
            :value="b.text"
            :data-edit="b.id"
            :class="['auto', 'btext', b.type]"
            rows="1"
            :placeholder="b.type === 'h1' ? tr('Heading') : b.type === 'h2' ? tr('Subheading') : b.type === 'li' ? tr('List item') : tr(`Type '# ' for a heading, '- ' for a list`)"
            :aria-label="tr(TYPES.find((t) => t.k === b.type)?.label ?? 'Paragraph')"
            @input="onText(b, $event)"
            @keydown="onTextKey(b, $event)"
            @paste="onPaste(b, $event)"
          />
        </div>
        <p v-if="!blocks.length" class="tx-meta empty">{{ tr('No content yet') }}</p>
        <div class="adds">
          <button type="button" class="sq tbtn" @click="addAfter(null, 'p')"><EditorIcon name="plus" :size="14" />{{ tr('Add block') }}</button>
          <button type="button" class="sq tbtn" @click="addAfter(null, 'table')"><EditorIcon name="table" :size="14" />{{ tr('Add table') }}</button>
        </div>
      </div>
    </section>

    <!-- PDF · 링크 글: 글 상자 하나 -->
    <div v-else class="col6 grow">
      <label :for="`edBody-${doc.id}`" class="tx-head lbl">{{ tr('Body text') }}</label>
      <div class="sq area-box"><textarea :id="`edBody-${doc.id}`" v-model="form.body" class="area" rows="16" :placeholder="tr('Paste or edit the original text')" /></div>
    </div>
  </form>
</template>

<style scoped>
/* 문서 패널 안쪽 여백(--doc-pad-*)에 맞춰요: 위 16 · 좌우 24 */
/* 뿌리 이름을 .editor 로 두면 편집기 전용 전역 규칙(.editor .menu …)이 걸려서 .ded */
.ded { display: flex; flex-direction: column; gap: var(--ref-spacing-10); min-height: 100%; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
/* z-index 1: 패널 테두리(.sq::after, z 1)가 위 막대 위로 그려지게(같은 높이면 뒤에 오는 테두리가 이겨요) */
.topbar { position: sticky; top: calc(-1 * var(--doc-pad-t, 16px)); z-index: 1; display: flex; align-items: center; gap: var(--ref-spacing-04); margin: calc(-1 * var(--doc-pad-t, 16px)) calc(-1 * var(--doc-pad-x, 24px)) 0; padding: var(--ref-spacing-06) var(--doc-pad-x, 24px); min-height: 44px; box-sizing: border-box; background: var(--sys-color-common-white-emphasis); box-shadow: 0 1px 0 var(--iris-line); }
.chip-edit { height: 22px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-weight: 600; font-size: 11px; color: var(--sys-color-brand-primary-default); --sq-fill: var(--sys-color-brand-primary-lightest); }
.status { white-space: nowrap; margin-left: var(--ref-spacing-04); }
.warnchip { cursor: pointer; height: 22px; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-05); margin-right: var(--ref-spacing-02); border-radius: var(--ref-radius-03); font-weight: 600; font-size: 11px; color: #B44A0E; --sq-fill: #FFF1E8; }
.f1 { flex: 1; min-width: 0; }
.lbl { color: var(--sys-color-neutral-700); }
.warn { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); margin: 0; color: var(--sys-color-theme-error-default); }
/* 문서 정보: 항목 사이 16(팝업 본문 규격과 같게) */
.fields { display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.row { display: flex; align-items: flex-start; gap: var(--ref-spacing-10); }
.choice { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.ver { width: 120px; flex: none; }
.src { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.body-h { display: flex; align-items: center; gap: var(--ref-spacing-06); }
.hint { margin: 0; }
.col6 { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.grow { flex: 1; }
.empty { margin: 0; }

.area { display: block; width: 100%; box-sizing: border-box; resize: none; overflow: hidden; min-height: 240px; padding: var(--ref-spacing-05) var(--ref-spacing-07); border: 0; outline: 0; background: transparent; font-family: var(--font-family-base); font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
.area.md { min-height: 320px; font-family: var(--font-family-base); }
.area-box { display: flex; flex-direction: column; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }

/* 블록: 패널 안쪽 폭 그대로. 손잡이(⋮)는 패널 왼쪽 여백(24) 안에 */
.blocks { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-03); padding-bottom: var(--ref-spacing-08); }
.blk { position: relative; }
.gut { position: absolute; left: calc(-1 * var(--doc-pad-x, 24px) + 3px); top: 1px; width: 18px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); opacity: 0; transition: opacity .12s; }
.blk:hover > .gut, .blk:focus-within > .gut, .gut[aria-expanded='true'], .gut:focus-visible { opacity: 1; }
.gut:hover, .gut[aria-expanded='true'] { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.gut:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.bmenu { position: absolute; left: calc(-1 * var(--doc-pad-x, 24px) + 3px); top: 28px; right: auto; z-index: 6; width: 200px; }
.mlab { display: block; padding: var(--ref-spacing-03) var(--ref-spacing-06) var(--ref-spacing-02); font-size: 11px; font-weight: 600; color: var(--sys-color-neutral-500); }
.sep { display: block; height: 1px; margin: var(--ref-spacing-03) var(--ref-spacing-04); background: var(--iris-line); }
.up { transform: rotate(180deg); }
.btext { display: block; width: 100%; box-sizing: border-box; resize: none; overflow: hidden; border: 0; outline: 0; background: transparent; padding: var(--ref-spacing-03) var(--ref-spacing-04); margin: 0 calc(-1 * var(--ref-spacing-04)); width: calc(100% + 2 * var(--ref-spacing-04)); border-radius: var(--ref-radius-03); font-family: var(--font-family-base); font-size: 13px; line-height: 21px; color: var(--sys-color-neutral-800); transition: background-color .12s; }
.btext:hover { background: var(--sys-color-neutral-100); }
.btext:focus { background: var(--sys-color-neutral-100); }
.btext::placeholder { color: var(--sys-color-neutral-400); }
.btext.h1 { font-size: 18px; line-height: 26px; font-weight: 600; }
.btext.h2 { font-size: 15px; line-height: 22px; font-weight: 600; }
.blk.h1:not(:first-child) { margin-top: var(--ref-spacing-08); }
.blk.h2:not(:first-child) { margin-top: var(--ref-spacing-06); }
.blk.li { padding-left: var(--ref-spacing-08); }
.blk.li::before { content: ''; position: absolute; left: 3px; top: 13px; width: 4px; height: 4px; border-radius: 50%; background: var(--sys-color-neutral-500); }

/* 표 블록: 칸 선 1px · 머리 칸 옅은 회색 · 경고 행 옅은 주황(칸 안만) */
.tbl-edit { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); margin: var(--ref-spacing-03) 0 var(--ref-spacing-05); }
.etbl { border-collapse: collapse; width: 100%; table-layout: fixed; }
.etbl td { position: relative; border: 1px solid var(--iris-line-strong); padding: 0; vertical-align: top; background: var(--sys-color-common-white-default); }
.etbl tr.head td { background: var(--sys-color-neutral-100); }
.etbl tr.head .cell { font-weight: 600; color: var(--sys-color-neutral-700); }
.etbl tr.warned td { background: #FFF9F2; }
.cell { display: block; width: 100%; min-width: 0; box-sizing: border-box; resize: none; overflow: hidden; border: 0; outline: 0; background: transparent; padding: var(--ref-spacing-05) var(--ref-spacing-06); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); overflow-wrap: break-word; word-break: keep-all; }
.cell:focus { box-shadow: inset 0 0 0 1.5px var(--sys-color-brand-primary-default); background: var(--sys-color-common-white-default); }
.idcol .cell { font-weight: 600; color: var(--iris-peek-ink); }
/* 칸 안 작은 지우기(×): 마우스를 올린 칸 · 행에서만 */
.cact { position: absolute; right: 2px; top: 5px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); opacity: 0; transition: opacity .12s; --sq-fill: var(--sys-color-common-white-default); }
td:hover > .cact, tr:hover > td:last-child > .cact:not(:only-of-type), .cact:focus-visible { opacity: 1; }
tr.head td:hover > .cact { opacity: 1; }
tr:not(.head):hover > td:last-child > .cact { opacity: 1; }
.cact:hover { color: var(--sys-color-theme-error-default); --sq-fill: var(--sys-color-neutral-100); }
.addcol { position: absolute; right: calc(-1 * var(--doc-pad-x, 24px) + 4px); top: 4px; width: 16px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); opacity: 0; transition: opacity .12s; }
.tbl-edit:hover > .addcol, .addcol:focus-visible { opacity: 1; }
.addcol:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.wdot { position: absolute; left: -12px; top: 12px; width: 6px; height: 6px; border-radius: 50%; background: #E2601B; }
.tbtn { display: inline-flex; align-items: center; gap: var(--ref-spacing-03); height: 28px; padding: 0 var(--ref-spacing-06); margin-left: calc(-1 * var(--ref-spacing-06)); border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); font-size: 12px; }
.tbtn:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.tbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.adds { display: flex; gap: var(--ref-spacing-08); margin-top: var(--ref-spacing-06); padding-top: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.warnline { align-self: stretch; display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 36px; box-sizing: border-box; padding: var(--ref-spacing-03) var(--ref-spacing-03) var(--ref-spacing-03) var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: #FFF6EC; color: #B44A0E; font-size: 12px; }
.wi { flex: none; }
.wt { flex: 1; min-width: 0; }
/* 바로 고치기: 흰 바탕 작은 버튼(주황 글자) */
.fixbtn { flex: none; height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-common-white-default); --sq-line: #F5DFC8; --sq-line-w: 1px; color: #B44A0E; font-size: 12px; font-weight: 600; white-space: nowrap; }
.fixbtn:hover { --sq-fill: #FFF1E3; }
.fixbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* ID 추천: Iris 공용 떠 있는 목록(.menu) */
.sug { position: absolute; left: 0; top: calc(100% + 4px); z-index: 7; width: 280px; }
.sug .menu-item { gap: var(--ref-spacing-04); height: 28px; }
.sug .menu-item.on { --sq-fill: var(--sys-color-brand-primary-lightest); }
.bmenu .menu-item { height: 28px; }
.bmenu .menu-item:disabled { opacity: .4; }
.bmenu .menu-item.danger { color: var(--sys-color-theme-error-default); }
.sug-hint { display: block; padding: var(--ref-spacing-03) var(--ref-spacing-06) var(--ref-spacing-04); font-size: 11px; color: var(--sys-color-neutral-500); }
.pid { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--ref-spacing-03); border-radius: 4px; font-size: 11px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); white-space: nowrap; flex: none; }
</style>
