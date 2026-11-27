<script lang="ts">
import type { DocBlock } from '~/composables/useIrisData'

type RawBlock = Omit<DocBlock, 'id'>

/** 줄 단위로 나눕니다(AddDocModal 과 같은 규칙): '# ' → h1, '## ' → h2, '- ' → li, 나머지 → 문단(빈 줄로 구분) */
export function parseDocText(src: string): RawBlock[] {
  const out: RawBlock[] = []
  let para: string[] = []
  const flush = () => { if (para.length) out.push({ type: 'p', text: para.join(' ') }); para = [] }
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const m = line.match(/^(##|#|-)\s+(.*)$/)
    if (m) {
      flush()
      if (m[2]!.trim()) out.push({ type: m[1] === '#' ? 'h1' : m[1] === '##' ? 'h2' : 'li', text: m[2]!.trim() })
    } else para.push(line)
  }
  flush()
  return out
}

/** 블록을 다시 글로 되돌립니다. 문단 · 제목 앞뒤는 빈 줄, 이어지는 목록은 한 줄씩 */
export function blocksToText(blocks: RawBlock[]): string {
  let out = ''
  blocks.forEach((b, i) => {
    const line = b.type === 'h1' ? `# ${b.text}` : b.type === 'h2' ? `## ${b.text}` : b.type === 'li' ? `- ${b.text}` : b.text
    if (i > 0) out += b.type === 'li' && blocks[i - 1]!.type === 'li' ? '\n' : '\n\n'
    out += line
  })
  return out
}

const CODE_RE = /\b(?:REQ|FR|NFR|SR)-\d{1,4}\b/gi
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
 * 고친 글(next)에 원래 블록(old)의 id 를 되도록 그대로 붙입니다. 요구사항 anchor.block 이 끊기지 않게 하려는 것.
 * 1) 종류 + 글이 똑같은 블록을 순서대로 짝짓습니다(LCS).
 * 2) 짝 사이 빈칸에서는 같은 종류끼리, 글이 비슷한 쪽을 순서를 지키며 짝짓습니다(제자리에서 고친 블록).
 *    같은 요구사항 번호가 들어 있으면 더 강하게 묶습니다. 요구사항이 붙은 블록은 종류가 바뀌어도 글이 비슷하면 짝짓습니다.
 * 3) 그래도 남은 "요구사항이 붙은 블록"은 위치와 상관없이 같은 번호가 든 블록, 또는 글이 많이 비슷한(0.6↑) 블록을 찾아 id 를 넘깁니다(옮긴 블록).
 * 4) 나머지 새 블록은 기존 · 요구사항이 가리키는 id 와 겹치지 않는 새 id 를 받습니다.
 */
export function keepBlockIds(old: DocBlock[], next: RawBlock[], anchored: Set<string>): DocBlock[] {
  const n = old.length, m = next.length
  const ids: (string | null)[] = Array(m).fill(null)
  const usedOld = new Array<boolean>(n).fill(false)
  const pair = (i: number, j: number) => { ids[j] = old[i]!.id; usedOld[i] = true }

  // 1) 똑같은 블록 LCS
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

  // 2) 빈칸마다 순서를 지키는 정렬(점수 최대)
  const score = (i: number, j: number): number => {
    const o = old[i]!, x = next[j]!
    const sim = similarity(o.text, x.text)
    const oc = codesIn(o.text), xc = codesIn(x.text)
    const shared = [...oc].some((c) => xc.has(c))
    const clash = oc.size > 0 && xc.size > 0 && !shared // 서로 다른 번호면 다른 요구사항
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

  // 3) 남은 요구사항 블록: 옮겨 간 곳 찾기
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

  // 4) 새 id
  const taken = new Set([...old.map((x) => x.id), ...anchored])
  const fresh = () => {
    let id = ''
    do id = 'b' + Math.random().toString(36).slice(2, 8)
    while (taken.has(id))
    taken.add(id)
    return id
  }
  return next.map((x, j) => ({ id: ids[j] ?? fresh(), type: x.type, text: x.text }))
}
</script>

<script setup lang="ts">
import { Button, TextInput } from '@ba-dream/design-system'
import type { DocCategory, DocRow, ReqRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

const props = defineProps<{
  doc: DocRow
  /** 이 문서의 요구사항(anchor 보존 · 사라진 번호 확인용) */
  docReqs: ReqRow[]
  /** 프로젝트 전체 요구사항(이미 있는 번호 건너뛰기용) */
  allReqs: ReqRow[]
}>()
const emit = defineEmits<{
  cancel: []
  saved: [result: { found: number; gone: string[] }]
}>()
/** 저장하지 않은 바뀐 내용이 있는지(부모가 나가기 전에 확인) */
const dirty = defineModel<boolean>('dirty', { default: false })

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { addRequirement } = useIrisMutations()

const CATS = Object.entries(DOC_CATEGORY_LABEL) as [DocCategory, string][]
const native = computed(() => props.doc.source_type === 'native')

/** 첫 h1 이 문서 이름과 같으면(읽기 화면에서 숨기는 머리) 편집 글에서도 빼 두고 저장할 때 새 이름으로 되돌려 붙입니다 */
const titleBlock = computed(() => {
  const first = props.doc.content_blocks?.[0]
  return native.value && first && first.type === 'h1' && first.text.trim() === props.doc.title.trim() ? first : null
})
const bodyBlocks = computed(() => (props.doc.content_blocks ?? []).slice(titleBlock.value ? 1 : 0))

interface Form { title: string; category: DocCategory; version: string; body: string }
const initial = (): Form => ({
  title: props.doc.title,
  category: props.doc.category,
  version: props.doc.version_label ?? '',
  body: native.value ? blocksToText(bodyBlocks.value) : props.doc.plain_text ?? '',
})
const form = reactive<Form>(initial())
let base = JSON.stringify(form)
watch(() => props.doc.id, () => { Object.assign(form, initial()); base = JSON.stringify(form); error.value = '' })
watch(form, () => { dirty.value = JSON.stringify(form) !== base }, { deep: true, immediate: true })

const found = computed(() => {
  const d = buildDoc()
  return detectRequirements(d).length
})

function buildBlocks() {
  const anchored = new Set(props.docReqs.map((r) => r.anchor?.block).filter((x): x is string => !!x))
  const kept = keepBlockIds(bodyBlocks.value, parseDocText(form.body), anchored)
  const t = form.title.trim()
  return titleBlock.value ? [{ id: titleBlock.value.id, type: 'h1' as const, text: t || titleBlock.value.text }, ...kept] : kept
}
function buildDoc(): DocRow {
  if (native.value) {
    const blocks = buildBlocks()
    return { ...props.doc, title: form.title.trim(), content_blocks: blocks, plain_text: blocks.map((x) => x.text).join('\n') || null }
  }
  return { ...props.doc, title: form.title.trim(), plain_text: form.body.trim() ? form.body : null }
}

const allText = (d: DocRow) => (d.content_blocks ? d.content_blocks.map((x) => x.text).join('\n') : d.plain_text ?? '')

/** 고치기 전엔 글에 있었는데 이제 없는 요구사항 번호(지우지는 않고 알려만 줍니다) */
function goneCodes(before: DocRow, after: DocRow): string[] {
  const was = allText(before), now = allText(after)
  const oldIds = new Set((before.content_blocks ?? []).map((x) => x.id))
  const newIds = new Set((after.content_blocks ?? []).map((x) => x.id))
  const out: string[] = []
  for (const r of props.docReqs) {
    const re = new RegExp('\\b' + r.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    const inNow = re.test(now)
    const blockGone = !!r.anchor?.block && oldIds.has(r.anchor.block) && !newIds.has(r.anchor.block)
    if (!inNow && (re.test(was) || blockGone)) out.push(r.code)
  }
  return [...new Set(out)].sort()
}

const saving = ref(false)
const error = ref('')
const canSave = computed(() => !saving.value && !!form.title.trim() && dirty.value)

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  const before = props.doc
  const after = buildDoc()
  const patch: Partial<DocRow> = {
    title: after.title,
    category: form.category,
    version_label: form.version.trim() || null,
    plain_text: after.plain_text,
  }
  if (native.value) patch.content_blocks = after.content_blocks
  else if (before.source_type === 'link' && (after.plain_text ?? '') !== (before.plain_text ?? '') && after.plain_text) patch.fetch_status = 'manual'

  try {
    if (preview) {
      const store = useState<Omit<DocRow, 'project_id'>[]>('pv-docs')
      const i = store.value?.findIndex((d) => d.id === before.id) ?? -1
      if (i < 0) throw new Error('missing')
      store.value[i] = { ...store.value[i]!, ...patch, updated_at: new Date().toISOString() }
    } else {
      const { error: upErr } = await supabase.from('documents').update(patch).eq('id', before.id)
      if (upErr) throw upErr
    }
  } catch {
    saving.value = false
    error.value = tr("Couldn't save. Try again in a moment.")
    return
  }

  // 새 번호(REQ-001 …)는 요구사항으로 넣고, 이미 있는 번호는 건너뜁니다
  const existing = new Set(props.allReqs.map((r) => r.code.toUpperCase()))
  let added = 0
  for (const c of detectRequirements({ ...after, ...patch } as DocRow)) {
    if (existing.has(c.code)) continue
    existing.add(c.code)
    try {
      await addRequirement(before.project_id, { document_id: before.id, code: c.code, title: c.title.slice(0, 120), body: c.title, origin: 'auto_pattern', anchor: c.block ? { block: c.block } : {} })
      added++
    } catch { /* 하나가 실패해도 나머지는 계속 넣습니다 */ }
  }

  const gone = goneCodes(before, after)
  await refreshNuxtData([`docs-${before.project_id}`, `reqs-${before.project_id}`])
  saving.value = false
  base = JSON.stringify(form)
  dirty.value = false
  emit('saved', { found: added, gone })
}

const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.querySelector<HTMLInputElement>(`#edTitle-${props.doc.id}`)?.focus())
const TI = { size: 's', showLeftIcon: false, showRightIcon: false, showButton: false } as const
/** 한 줄 칸에서 Enter 로 저장(예전 submit 버튼과 같은 동작) */
const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save() } }
defineExpose({ save })

const fileName = computed(() => (props.doc.file_path ?? '').split('/').pop() ?? '')
</script>

<template>
  <form ref="root" class="editor" @submit.prevent="save" @keydown.meta.enter.prevent="save" @keydown.ctrl.enter.prevent="save">
    <header class="head">
      <h1 class="tx-title">{{ tr('Edit document') }}</h1>
      <span class="tx-meta">{{ native ? tr('Written in Iris') : doc.source_type === 'upload' ? tr('Uploaded file · Only the text changes. The original file stays as is.') : tr('Link · Only the text changes. The original page stays as is.') }}</span>
    </header>

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
      <div class="choice">
        <span :id="`edCat-${doc.id}`" class="tx-head">{{ tr('Category') }}</span>
        <div class="seg cats" role="radiogroup" :aria-labelledby="`edCat-${doc.id}`">
          <button
            v-for="c in CATS"
            :key="c[0]"
            type="button"
            role="radio"
            :aria-checked="form.category === c[0]"
            :class="['sq', 'seg-item', { on: form.category === c[0] }]"
            @click="form.category = c[0]"
          >{{ tr(c[1]) }}</button>
        </div>
      </div>
      <TextInput
        v-model:value="form.version"
        v-bind="TI"
        class="ver"
        :label="tr('Version')"
        :placeholder="tr('e.g. v1.3')"
        :show-supporting-text="false"
        :input-props="{ id: `edVer-${doc.id}`, autocomplete: 'off', onKeydown: onEnter }"
        :label-props="{ htmlFor: `edVer-${doc.id}` }"
      />
    </div>

    <div v-if="doc.source_type === 'upload' && fileName" class="tx-meta src"><EditorIcon name="clip" :size="12" /><span class="ellipsis" :title="fileName">{{ fileName }}</span></div>
    <div v-else-if="doc.source_type === 'link' && doc.url" class="tx-meta src"><EditorIcon name="link" :size="12" /><span class="ellipsis" :title="doc.url">{{ doc.url }}</span></div>

    <div class="col6 grow">
      <label :for="`edBody-${doc.id}`" class="tx-head">{{ native ? tr('Content') : tr('Body text') }}</label>
      <div class="sq area-box">
      <textarea
        :id="`edBody-${doc.id}`"
        v-model="form.body"
        class="area"
        rows="16"
        :placeholder="native ? tr(`'# ' heading, '## ' subheading, '- ' list. Separate paragraphs with a blank line.`) : tr('Paste or edit the original text')"
      />
      </div>
      <span class="tx-meta num">
        <template v-if="native">{{ tr(`'# ' heading, '## ' subheading, '- ' list, blank line for a new paragraph.`) }} </template>{{ tr('Lines starting with a requirement number (like REQ-001) become requirements') }}{{ found ? ' · ' + tr('{n} found', { n: found }) : '' }}
      </span>
    </div>

    <div class="foot">
      <span v-if="error" class="tx-meta warn" role="alert"><EditorIcon name="warning" :size="12" />{{ error }}</span>
      <Button size="s" type="tertiary" :disabled="saving" @click="emit('cancel')">{{ tr('Cancel') }}</Button>
      <Button size="s" type="primary" :loading="saving" :disabled="!canSave && !saving" @click="save">{{ tr('Save') }}</Button>
    </div>
  </form>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: var(--ref-spacing-10); min-height: 100%; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.head { display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
.col6 { display: flex; flex-direction: column; gap: var(--ref-spacing-02); min-width: 0; }
/* 입력 라벨은 DS Label 과 같게: 12/18 SemiBold neutral/700, 칸과 2px */
.col6 > .tx-head:first-child { color: var(--sys-color-neutral-700); }
.col6 > .tx-meta:last-child { margin-top: var(--ref-spacing-02); }
.row { display: flex; align-items: flex-start; gap: var(--ref-spacing-12); flex-wrap: wrap; }
.ver { width: 140px; flex: none; }
.grow { flex: 1; }
.src { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.area { flex: 1; width: 100%; box-sizing: border-box; resize: vertical; min-height: 240px; padding: var(--ref-spacing-05) var(--ref-spacing-07); border: 0; outline: 0; background: transparent; font-family: var(--font-family-base); font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
/* 입력칸 틀: textarea 는 ::before · ::after 가 없어서 감싼 .sq 가 채우기 · 선(squircle)을 그려요 */
.area-box { flex: 1; display: flex; flex-direction: column; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }
.foot { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) 0; background: var(--sys-color-common-white-emphasis); }
.foot .warn { margin-right: auto; }
.warn { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-theme-error-default); }
</style>
