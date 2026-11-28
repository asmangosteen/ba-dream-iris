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
 * 문서 고치기: Markdown 글 상자 하나(블록 편집은 뺐어요 — 사용자 결정 2026-11-27). AI 가 쓴 문서를 통째로 붙여 넣고 고쳐요.
 * 저장하면 표 · ID 를 다시 읽어 정책 · 화면 칸을 맞추고, 블록 id 는 되도록 그대로(keepBlockIds) 이어 정책 자리 · 댓글이 끊기지 않아요.
 * 위 막대에 저장 상태 · 양식 경고 · 취소 · 저장(아래 버튼 줄이 본문을 가리던 것 대신).
 */
const props = defineProps<{
  doc: DocRow
  /** 이 문서의 정책(자리 보존 · 사라진 번호 확인용) */
  docReqs: ReqRow[]
  /** 프로젝트 전체 정책(옛 번호 건너뛰기용) */
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
/** 블록으로 저장하는 문서: 직접 쓴 것 · Markdown 파일. 나머지(PDF · 링크 글)는 원문 글 그대로 */
const blockMode = computed(() => props.doc.source_type === 'native' || !!props.doc.content_blocks?.length)

/** 첫 h1 이 문서 이름과 같으면 글에서 빼 두고 저장할 때 새 이름으로 되돌려 붙여요 */
const titleBlock = computed(() => {
  const first = props.doc.content_blocks?.[0]
  return blockMode.value && first && first.type === 'h1' && first.text.trim() === props.doc.title.trim() ? first : null
})
const bodyBlocks = computed(() => (props.doc.content_blocks ?? []).slice(titleBlock.value ? 1 : 0))

interface Form { title: string; category: DocCategory; version: string; body: string }
const initial = (): Form => ({ title: props.doc.title, category: props.doc.category, version: props.doc.version_label ?? '', body: blockMode.value ? blocksToText(bodyBlocks.value) : props.doc.plain_text ?? '' })
const form = reactive<Form>(initial())
let base = JSON.stringify(form)
watch(() => props.doc.id, () => { Object.assign(form, initial()); base = JSON.stringify(form); error.value = '' })
watch(form, () => { dirty.value = JSON.stringify(form) !== base }, { deep: true, immediate: true })

// 바로 검사(양식): 위 막대 경고 칩 → 누르면 목록
const check = computed(() => (blockMode.value ? analyzeDoc(parseDocText(form.body).map((x, i) => ({ ...x, id: 'md' + i }))) : null))
const warns = computed(() => (check.value?.warnings ?? []).filter((w) => w.kind !== 'no_screen'))
const warnOpen = ref(false)
const wText = (w: FormatWarning) => { const t = warningText(w); return tr(t.key, t.vars) }

// 저장 ------------------------------------------------------------------
function buildBlocks(): DocBlock[] {
  const anchored = new Set(props.docReqs.map((r) => r.anchor?.block).filter((x): x is string => !!x))
  const body = keepBlockIds(bodyBlocks.value, parseDocText(form.body), anchored)
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
    } catch { error.value = tr('Saved, but couldn’t update requests from the tables. Try saving again.') }
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
  base = JSON.stringify(form)
  dirty.value = false
  emit('saved', { found: added, gone, warnings: result.warnings.filter((w) => w.kind !== 'no_screen').length })
}

const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.querySelector<HTMLInputElement>(`#edTitle-${props.doc.id}`)?.focus())
const TI = { size: 's', showLeftIcon: false, showRightIcon: false, showButton: false } as const
const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save() } }
defineExpose({ save })

const fileName = computed(() => (props.doc.file_path ?? '').split('/').pop() ?? '')
const statusText = computed(() => saving.value ? tr('Saving…') : dirty.value ? tr('Unsaved changes') : savedAt.value ? tr('Saved') : '')
</script>

<template>
  <form ref="root" class="ded" @submit.prevent="save" @keydown.meta.enter.prevent="save" @keydown.ctrl.enter.prevent="save" @keydown.meta.s.prevent="save" @keydown.ctrl.s.prevent="save">
    <!-- 위 막대: 편집 중 · 저장 상태 · 경고 · 취소 · 저장(스크롤해도 위에 붙어 있어요) -->
    <div class="topbar">
      <span class="sq chip-edit">{{ tr('Editing') }}</span>
      <span class="tx-meta status" role="status" aria-live="polite">{{ statusText }}</span>
      <span class="f1" />
      <button v-if="warns.length" type="button" class="sq warnchip" :aria-expanded="warnOpen" :data-tip="tr('Format warnings')" @click="warnOpen = !warnOpen"><EditorIcon name="warning" :size="12" />{{ warns.length }}</button>
      <Button size="s" type="tertiary" :disabled="saving" @click="emit('cancel')">{{ tr('Cancel') }}</Button>
      <Button size="s" type="primary" :loading="saving" :disabled="!canSave && !saving" @click="save">{{ tr('Save') }}</Button>
    </div>
    <p v-if="error" class="tx-meta warn" role="alert"><EditorIcon name="warning" :size="12" />{{ error }}</p>
    <ul v-if="warnOpen && warns.length" class="sq wlist" role="note">
      <li v-for="(w, i) in warns" :key="i"><span class="dot" aria-hidden="true" />{{ wText(w) }}</li>
    </ul>

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
      <!-- 버전 → 분류 순서(사용자 요청 2026-11-27) -->
      <div class="row">
        <div class="ver">
          <TextInput v-model:value="form.version" v-bind="TI" :label="tr('Version')" :placeholder="tr('e.g. v1.3')" :show-supporting-text="false" :input-props="{ id: `edVer-${doc.id}`, autocomplete: 'off', onKeydown: onEnter }" :label-props="{ htmlFor: `edVer-${doc.id}` }" />
        </div>
        <div class="choice f1">
          <span :id="`edCat-${doc.id}`" class="tx-head lbl">{{ tr('Category') }}</span>
          <div class="seg cats" role="radiogroup" :aria-labelledby="`edCat-${doc.id}`">
            <button v-for="c in CATS" :key="c[0]" type="button" role="radio" :aria-checked="form.category === c[0]" :class="['sq', 'seg-item', { on: form.category === c[0] }]" @click="form.category = c[0]">{{ tr(c[1]) }}</button>
          </div>
        </div>
      </div>
      <div v-if="doc.source_type === 'upload' && fileName" class="tx-meta src"><EditorIcon name="clip" :size="12" /><span class="ellipsis" :title="fileName">{{ fileName }}</span></div>
      <div v-else-if="doc.source_type === 'link' && doc.url" class="tx-meta src"><EditorIcon name="link" :size="12" /><span class="ellipsis" :title="doc.url">{{ doc.url }}</span></div>
    </div>

    <!-- 본문: 글 상자 하나 — 패널 아래까지 늘어나고 상자 안에서만 스크롤 -->
    <section class="content" :aria-label="tr('Content')">
      <label :for="`edBody-${doc.id}`" class="tx-head lbl">{{ blockMode ? tr('Content') : tr('Body text') }}</label>
      <p class="tx-meta hint">{{ blockMode ? tr('Paste the whole document written by AI. Tables become table blocks.') : tr('Paste or edit the original text') }}</p>
      <div class="sq area-box" @mousedown.self.prevent="($event.currentTarget as HTMLElement).querySelector('textarea')?.focus()">
        <textarea :id="`edBody-${doc.id}`" v-model="form.body" class="area" spellcheck="false" :placeholder="blockMode ? 'Markdown' : tr('Paste or edit the original text')" />
      </div>
    </section>
  </form>
</template>

<style scoped>
/* 패널 높이에 맞춰요: 글 상자가 아래까지 차고, 상자 안에서만 스크롤. 뿌리 이름을 .editor 로 두면 편집기 전용 전역 규칙이 걸려서 .ded */
.ded { height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-10); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.topbar { position: sticky; top: calc(-1 * var(--doc-pad-t, 16px)); z-index: 2; flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); margin: calc(-1 * var(--doc-pad-t, 16px)) calc(-1 * var(--doc-pad-x, 24px)) 0; padding: 0 var(--doc-pad-x, 24px); height: 44px; box-sizing: border-box; background: var(--sys-color-common-white-emphasis); box-shadow: 0 1px 0 var(--iris-line); }
.chip-edit { height: 22px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-weight: 600; font-size: 11px; color: var(--sys-color-brand-primary-default); --sq-fill: var(--sys-color-brand-primary-lightest); }
.status { white-space: nowrap; margin-left: var(--ref-spacing-04); }
.warnchip { cursor: pointer; height: 22px; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-05); margin-right: var(--ref-spacing-02); border-radius: var(--ref-radius-03); font-weight: 600; font-size: 11px; color: #B44A0E; --sq-fill: #FFF1E8; }
.warnchip:hover, .warnchip[aria-expanded='true'] { --sq-fill: #FFE6D2; }
.f1 { flex: 1; min-width: 0; }
.lbl { color: var(--sys-color-neutral-700); }
.warn { flex: none; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); margin: 0; color: var(--sys-color-theme-error-default); }
.wlist { flex: none; margin: 0; padding: var(--ref-spacing-06) var(--ref-spacing-08); list-style: none; display: flex; flex-direction: column; gap: var(--ref-spacing-03); border-radius: var(--ref-radius-05); --sq-fill: #FFF6EC; color: #B44A0E; }
.wlist li { display: flex; gap: var(--ref-spacing-04); align-items: flex-start; }
.wlist .dot { flex: none; width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: #E2601B; }
.fields { flex: none; display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.row { display: flex; align-items: flex-start; gap: var(--ref-spacing-10); }
.choice { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.ver { width: 120px; flex: none; }
.src { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.hint { margin: 0; }
/* 글 상자: 남은 높이를 다 쓰고, 넘치면 상자 안에서 스크롤(크기 조절 손잡이 없음) — 둥글기는 댓글 입력칸과 같은 18 */
/* 위아래 여백은 틀(.area-box)에 — textarea 안 여백이면 스크롤한 글자가 그 여백을 지나 둥근 테두리 밖으로 보였어요(댓글 입력칸과 같아요) */
.area-box { flex: 1; min-height: 240px; display: flex; flex-direction: column; margin-top: var(--ref-spacing-02); border-radius: 18px; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; overflow: hidden;  padding: var(--ref-spacing-07) 0; cursor: text;}
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.area { flex: 1; display: block; width: 100%; height: 100%; box-sizing: border-box; resize: none; overflow-y: auto; scrollbar-width: thin; padding: 0 var(--ref-spacing-08); border: 0; outline: 0; background: transparent; font-family: var(--font-family-base); font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
.area::placeholder { color: var(--sys-color-neutral-500); }
</style>
