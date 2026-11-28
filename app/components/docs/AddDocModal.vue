<script setup lang="ts">
import { Button, IconButton, TextInput } from '@ba-dream/design-system'
import type { DocBlock, DocCategory, DocRow, LinkRow, ProjectScreen, ReqRow, SlotRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { DocTemplate, TemplateKey } from '~/utils/docTemplates'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ created: [docId: string] }>()

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { addDocument, addRequirement, syncDocFormat } = useIrisMutations()
const cachedReqs = useNuxtData<ReqRow[]>(`reqs-${props.projectId}`).data
const cachedLinks = useNuxtData<LinkRow[]>(`links-${props.projectId}`).data
const cachedSlots = useNuxtData<SlotRow[]>(`slots-${props.projectId}`).data
const cachedScreens = useNuxtData<ProjectScreen[]>(`all-screens-${props.projectId}`).data

type Mode = 'file' | 'link' | 'write'
// 라벨은 영어 원문 — 그릴 때 tr() 로 감싸요
/** 기획서 양식 가이드(public/guides) — 문서 추가 창 위에서 내려받아요(사용자 요청 2026-11-28) */
const GUIDE_URL = '/guides/iris-planning-format.md'
function downloadGuide() {
  const a = document.createElement('a')
  a.href = GUIDE_URL
  a.download = tr('Iris planning format guide') + '.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
const MODES: [Mode, string][] = [['file', 'Upload file'], ['link', 'Paste link'], ['write', 'Write']]
const CATS = Object.entries(DOC_CATEGORY_LABEL) as [DocCategory, string][]
const MAX_FILE = 50 * 1024 * 1024

const mode = ref<Mode>('file')
const category = ref<DocCategory>('planning')
/** 분류는 먼저 저절로 골라 두고(문서 종류 → 제목 · 파일 이름 · 링크 제목), 사람이 한 번 누르면 그 뒤로는 그대로 둬요 */
const catTouched = ref(false)
const saving = ref(false)
const error = ref('')
const done = ref<{ docId: string; found: number; slots: number; warnings: number } | null>(null)

// 직접 쓰기 ----------------------------------------------------------------
const title = ref('')
const body = ref('')
/** 여러 줄 입력칸: 크기 조절 손잡이 대신 글 길이에 맞춰 늘어나요(사용자 요청 2026-11-27) */
const areaEl = ref<HTMLTextAreaElement | null>(null)
const grow = (t: HTMLTextAreaElement | null) => { if (!t) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }
const growArea = (e: Event) => grow(e.target as HTMLTextAreaElement)

/** 틀 = 가이드의 문서 종류별 뼈대(utils/docTemplates). 넣는 순간 지금 언어로 정해져요 */
const TEMPLATES = DOC_TEMPLATES
const tplLine = (i: number) => { const on = TEMPLATES.findIndex((t) => t.key === template.value); return i > 0 && i !== on && i - 1 !== on }
const tplText = (t: DocTemplate | undefined) => (t ? (isKo() ? t.ko : t.en) : '')
const template = ref<TemplateKey>('blank')
function pickTemplate(t: DocTemplate) {
  const cur = TEMPLATES.find((x) => x.key === template.value)
  // 이미 쓴 내용이 있으면 덮어쓰지 않습니다
  if (!body.value.trim() || body.value === tplText(cur)) { body.value = tplText(t); nextTick(() => grow(areaEl.value)) }
  template.value = t.key
  if (!catTouched.value) category.value = t.cat
}
/** Markdown → 블록(표 포함, utils/docFormat): '# ' → h1, '## ' → h2, '- ' → li, '| … |' → 표, 나머지 → 문단 */
function toBlocks(src: string): DocBlock[] {
  return parseMarkdown(src).map((b, i) => ({ ...b, id: 'b' + (i + 1) }))
}

// 파일 -------------------------------------------------------------------
const file = ref<File | null>(null)
const fileText = ref<string | null>(null)
/** Markdown 파일은 블록으로 읽어 둬요(표 · ID 를 읽고, 문서에서 바로 고칠 수 있게) */
const fileBlocks = computed(() => (fileText.value ? toBlocks(fileText.value) : null))
const dragging = ref(false)
const fileExt = computed(() => (file.value?.name.split('.').pop() ?? '').toLowerCase() as 'pdf' | 'docx' | 'md' | '')
async function setFile(f: File | null | undefined) {
  error.value = ''
  if (!f) return
  const ext = (f.name.split('.').pop() ?? '').toLowerCase()
  if (!['pdf', 'docx', 'md'].includes(ext)) { error.value = tr('Only PDF, Word (docx) and Markdown files are supported'); return }
  if (f.size > MAX_FILE) { error.value = tr('Files can be up to 50 MB'); return }
  file.value = f
  fileText.value = ext === 'md' ? await f.text() : null
}
function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
}
function clearFile() { file.value = null; fileText.value = null }
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB')

// 링크 -------------------------------------------------------------------
const url = ref('')
const fetching = ref(false)
const fetched = ref<{ url: string; title: string; text: string; plain?: boolean } | null>(null)
const fetchFailed = ref<string | null>(null)
const urlValid = computed(() => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url.value.trim()))
async function fetchLink() {
  const u = url.value.trim()
  if (!urlValid.value || fetching.value || fetched.value?.url === u) return
  fetching.value = true
  fetchFailed.value = null
  fetched.value = null
  try {
    const r = await $fetch<{ title: string; text: string; plain?: boolean }>('/api/fetch-link', { method: 'POST', body: { url: u } })
    fetched.value = { url: u, ...r }
  } catch (e) {
    const msg = (e as { data?: { statusMessage?: string }; statusMessage?: string })
    fetchFailed.value = msg?.data?.statusMessage || msg?.statusMessage || tr("Couldn't load the page content")
  } finally {
    fetching.value = false
  }
}
watch(url, (v) => {
  if (fetched.value && fetched.value.url !== v.trim()) fetched.value = null
  fetchFailed.value = null
})
/** .md · 글 파일 주소(GitHub raw · gist 등)는 Markdown 으로 읽어 표까지 — 웹 페이지(HTML)는 글만 남아요 */
const linkBlocks = computed(() => (fetched.value?.plain && fetched.value.text ? toBlocks(fetched.value.text) : null))
const linkHost = computed(() => { try { return new URL(url.value.trim()).hostname } catch { return '' } })

// 미리 찾은 요구사항 수 (카드에 보여 주기용) --------------------------------
const draftDoc = computed<DocRow>(() => ({
  id: 'draft', project_id: props.projectId, title: '', category: category.value, source_type: mode.value === 'write' ? 'native' : mode.value === 'file' ? 'upload' : 'link',
  content_blocks: mode.value === 'write' ? toBlocks(body.value) : mode.value === 'file' ? fileBlocks.value : linkBlocks.value, file_path: null, file_type: null, url: null,
  plain_text: mode.value === 'file' ? fileText.value : mode.value === 'link' ? fetched.value?.text ?? null : null,
  fetch_status: null, version_label: null, updated_at: '',
}))
/** 양식 검사(시안 1): 정책 표 · 화면 표를 읽은 결과 */
const check = computed(() => (draftDoc.value.content_blocks?.length ? analyzeDoc(draftDoc.value.content_blocks) : null))
const autoCat = computed<DocCategory | null>(() => {
  const k = check.value?.kind
  const fromBlocks = k ? guessCategory(k) : null
  if (fromBlocks) return fromBlocks
  if (mode.value === 'write') return guessCategory(title.value) ?? (template.value !== 'blank' ? TEMPLATES.find((t) => t.key === template.value)!.cat : null)
  if (mode.value === 'file') return guessCategory(file.value?.name ?? '') ?? guessCategory(fileText.value?.slice(0, 400))
  return guessCategory(fetched.value?.title) ?? guessCategory(fetched.value?.text.slice(0, 400))
})
watch(autoCat, (c) => { if (c && !catTouched.value) category.value = c }, { immediate: true })
const catAuto = computed(() => !catTouched.value && !!autoCat.value && autoCat.value === category.value)
const foundCount = computed(() => detectRequirements(draftDoc.value).length + (check.value?.policies.length ?? 0))
const showCheck = computed(() => !!check.value && ((mode.value === 'file' && fileExt.value === 'md') || (mode.value === 'write' && !!body.value.trim()) || (mode.value === 'link' && !!linkBlocks.value?.length)))
const warnOpen = ref(false)
const warnCount = computed(() => check.value?.warnings.filter((w) => w.kind !== 'no_screen').length ?? 0)
const wText = (w: FormatWarning) => { const t = warningText(w); return tr(t.key, t.vars) }

const canSave = computed(() => {
  if (saving.value) return false
  if (mode.value === 'write') return !!title.value.trim()
  if (mode.value === 'file') return !!file.value
  return urlValid.value && !fetching.value
})

// 저장 -------------------------------------------------------------------
async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  try {
    let doc: Pick<DocRow, 'title' | 'category' | 'source_type'> & Partial<DocRow>
    if (mode.value === 'write') {
      const blocks = toBlocks(body.value)
      doc = { title: title.value.trim(), category: category.value, source_type: 'native', content_blocks: blocks, plain_text: blocks.map((x) => x.text).join('\n') || null }
    } else if (mode.value === 'file') {
      const f = file.value!
      const ext = fileExt.value as 'pdf' | 'docx' | 'md'
      let path = `preview/${f.name}`
      if (!preview) {
        path = `${props.projectId}/${globalThis.crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || undefined, upsert: false })
        if (upErr) throw new Error(tr("Couldn't upload the file"))
      }
      const fb = fileBlocks.value
      const first = fb?.[0]
      const title = first?.type === 'h1' ? first.text : f.name.replace(/\.[^.]+$/, '')
      doc = { title, category: category.value, source_type: 'upload', file_path: path, file_type: ext, plain_text: fileText.value, ...(fb?.length ? { content_blocks: fb } : {}) }
    } else {
      const u = url.value.trim()
      if (!fetched.value && !fetchFailed.value) await fetchLink()
      const ok = fetched.value?.url === u ? fetched.value : null
      const lb = ok?.plain ? toBlocks(ok.text) : null
      const lTitle = lb?.[0]?.type === 'h1' ? lb[0].text : ok?.title
      doc = { title: lTitle || linkHost.value || u, category: category.value, source_type: 'link', url: u, plain_text: ok?.text ?? null, fetch_status: ok ? 'ok' : 'failed', ...(lb?.length ? { content_blocks: lb } : {}) }
    }

    const docId = await addDocument(props.projectId, doc)

    const full = { ...draftDoc.value, ...doc, id: docId } as DocRow
    let found = 0
    let slotsN = 0
    let warnings = 0
    // 양식 읽기: 정책 표 → 정책, 화면 표 → 화면 칸, '정책' 열 → '확인 전' 연결
    const result = full.content_blocks?.length ? analyzeDoc(full.content_blocks) : null
    if (result && (result.policies.length || result.slots.length || result.abbr || result.status)) {
      try {
        const out = await syncDocFormat(props.projectId, docId, result, { reqs: cachedReqs.value ?? [], slots: cachedSlots.value ?? [], screens: cachedScreens.value ?? [], links: cachedLinks.value ?? [] })
        found += out.added.length
        slotsN = out.slots
      } catch { /* 문서는 들어갔어요 — 고치기에서 다시 저장하면 다시 읽어요 */ }
      warnings = result.warnings.filter((w) => w.kind !== 'no_screen').length
    }
    // 옛 번호 규칙(REQ-001 …) 줄도 읽어요. 이미 있는 번호는 건너뜁니다
    const existing = new Set((cachedReqs.value ?? []).filter((r) => r.document_id === docId).map((r) => r.code.toUpperCase()))
    for (const c of detectRequirements(full)) {
      if (existing.has(c.code)) continue
      existing.add(c.code)
      try {
        await addRequirement(props.projectId, { document_id: docId, code: c.code, title: c.title.slice(0, 120), body: c.title, origin: 'auto_pattern', anchor: c.block ? { block: c.block } : {} })
        found++
      } catch { /* 하나가 실패해도 나머지는 계속 넣습니다 */ }
    }

    await refreshNuxtData([`docs-${props.projectId}`, `reqs-${props.projectId}`, `links-${props.projectId}`, `slots-${props.projectId}`, `all-screens-${props.projectId}`])
    done.value = { docId, found, slots: slotsN, warnings }
    emit('created', docId)
  } catch (e) {
    error.value = (e as Error)?.message && !(e as Error).message.startsWith('{') ? (e as Error).message : tr("Couldn't add the document. Try again in a moment.")
  } finally {
    saving.value = false
  }
}

// 열기 · 닫기 · 접근성 ------------------------------------------------------
const dialog = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
function reset() {
  mode.value = 'file'; category.value = 'planning'; catTouched.value = false; error.value = ''; done.value = null
  title.value = ''; body.value = ''; template.value = 'blank'
  clearFile(); url.value = ''; fetched.value = null; fetchFailed.value = null
}
function close() { if (!saving.value) open.value = false }
watch(open, async (v) => {
  if (v) {
    reset()
    returnFocus = document.activeElement as HTMLElement | null
    await nextTick()
    focusFirst()
  } else {
    returnFocus?.focus?.()
  }
})
function focusables(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])') ?? [])
}
/** data-autofocus 가 컴포넌트 바깥 요소에 붙어 있으면 그 안의 입력칸 · 버튼으로 */
function autofocusTarget(): HTMLElement | null {
  const el = dialog.value?.querySelector<HTMLElement>('[data-autofocus]') ?? null
  if (!el || el.matches('input, textarea, button, a')) return el
  return el.querySelector<HTMLElement>('input, textarea, button')
}
function focusFirst() {
  const el = autofocusTarget() ?? focusables()[0]
  el?.focus()
}
function openDoc(id: string) {
  open.value = false
  navigateTo(`/p/${props.projectId}/docs/${id}`)
}
const TI = { size: 's', showLeftIcon: false, showRightIcon: false, showButton: false, showSupportingText: false } as const
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); close(); return }
  if (e.key !== 'Tab') return
  const list = focusables()
  if (!list.length) return
  const first = list[0]!, last = list[list.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
watch(mode, async () => { error.value = ''; await nextTick(); autofocusTarget()?.focus() })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pop-overlay" @mousedown.self="close">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addDocTitle"
        class="sq pop"
        style="--pop-w: 520px"
        @keydown="onKeydown"
      >
        <div class="pop-top">
          <h1 id="addDocTitle" class="pop-ttl">{{ tr('Add document') }}</h1>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="close"><EditorIcon name="close" :size="16" /></button>
        </div>

        <!-- 다 넣은 뒤 -->
        <template v-if="done">
          <div class="pop-body content success" role="status">
            <span class="badge-ok"><EditorIcon name="check" :size="20" /></span>
            <span class="tx-head">{{ tr('Document added') }}</span>
            <span class="tx-meta">{{ done.found === 1 ? tr('Found 1 request') : done.found ? tr('Found {n} requests', { n: done.found }) : tr('No requests found in this document') }}<template v-if="done.slots"> · {{ tr('{n} screen slots', { n: done.slots }) }}</template><template v-if="done.warnings"> · {{ done.warnings === 1 ? tr('1 warning') : tr('{n} warnings', { n: done.warnings }) }}</template></span>
          </div>
          <div class="pop-foot">
            <Button size="s" type="tertiary" @click="close">{{ tr('Close') }}</Button>
            <Button size="s" type="primary" data-autofocus @click="openDoc(done.docId)">{{ tr('Open document') }}</Button>
          </div>
        </template>

        <template v-else>
          <div role="tablist" :aria-label="tr('How to add')" class="seg tabs">
            <button
              v-for="m in MODES"
              :key="m[0]"
              type="button"
              role="tab"
              :aria-selected="mode === m[0]"
              :class="['sq', 'seg-item', { on: mode === m[0] }]"
              @click="mode = m[0]"
            >{{ tr(m[1]) }}</button>
          </div>

          <div class="pop-body content">
            <!-- 양식 가이드: 이대로 쓰면 요청사항 · 화면이 저절로 이어져요 -->
            <div class="sq guide">
              <span class="sq chip"><EditorIcon name="document" :size="16" /></span>
              <span class="card-col">
                <span class="tx-body name">{{ tr('Iris planning format') }}</span>
                <span class="tx-meta">{{ tr('Write request and screen tables this way and they link up automatically') }}</span>
              </span>
              <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="download" @click="downloadGuide">{{ tr('Guide') }}</Button>
            </div>
            <!-- 파일 -->
            <div v-if="mode === 'file'" class="col8 fill">
              <label
                v-if="!file"
                :class="['sq', 'drop', { over: dragging }]"
                @dragover.prevent="dragging = true"
                @dragleave="dragging = false"
                @drop.prevent="onDrop"
              >
                <span class="up"><EditorIcon name="upload" :size="24" /></span>
                <span class="tx-head">{{ tr('Drag a file here or click to choose') }}</span>
                <span class="tx-meta">{{ tr('PDF, Word or Markdown, up to 50 MB') }}</span>
                <input type="file" class="sr" accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown" data-autofocus @change="setFile(($event.target as HTMLInputElement).files?.[0])">
              </label>
              <div v-else class="sq card">
                <span class="sq chip num">{{ fileExt.toUpperCase() }}</span>
                <span class="card-col">
                  <span class="tx-body name ellipsis" :title="file.name">{{ file.name }}</span>
                  <span class="tx-meta num">{{ sizeLabel(file.size) }}<template v-if="fileExt === 'md'"> · {{ tr('Requests: {n}', { n: foundCount }) }}</template><template v-else> · {{ tr('Content is kept as a file only') }}</template></span>
                </span>
                <IconButton icon-name="close" size="s" type="ghost" :ariaLabel="tr('Remove file')" data-autofocus @click="clearFile" />
              </div>
              <p v-if="preview && file" class="tx-meta">{{ tr('In preview, only the file name is saved. The file isn’t uploaded.') }}</p>
            </div>

            <!-- 링크 -->
            <div v-else-if="mode === 'link'" class="col8">
              <div class="url-wrap">
              <div class="url-row" data-autofocus>
                <TextInput
                  v-model:value="url"
                  v-bind="TI"
                  class="url-in"
                  :label="tr('Document URL')"
                  placeholder="https://"
                  show-left-icon
                  left-icon-name="link"
                  :input-props="{ id: 'docUrl', type: 'url', inputmode: 'url', autocomplete: 'off', onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fetchLink() } }, onBlur: fetchLink }"
                  :label-props="{ htmlFor: 'docUrl' }"
                />
                <Button size="s" type="tertiary" stroke :loading="fetching" :disabled="!urlValid || fetching" @click="fetchLink">{{ tr('Fetch') }}</Button>
              </div>
              <!-- 무엇을 어떻게 읽는지(사용자 질문 2026-11-28): 공개 웹 페이지 글 / .md 주소는 표까지 -->
              <ul v-if="!fetched && !fetchFailed" class="link-help tx-meta">
                <li>{{ tr('Brings in the text of a public web page. Pages that need a sign-in (private Notion, Google Docs, Confluence) can’t be read') }}</li>
                <li>{{ tr('Tables on a web page come in as plain text, so requests and screens aren’t linked') }}</li>
                <li>{{ tr('A link to a .md file (e.g. GitHub raw) is read with its tables — or upload the file instead') }}</li>
              </ul>
              </div>
              <div v-if="fetched" class="sq card">
                <span class="sq chip"><EditorIcon name="document" :size="16" /></span>
                <span class="card-col">
                  <span class="tx-body name ellipsis" :title="fetched.title">{{ fetched.title }}</span>
                  <span class="tx-meta num">{{ linkHost }} · <template v-if="fetched.plain">{{ tr('Requests: {n}', { n: foundCount }) }}</template><template v-else>{{ tr('Text only — tables aren’t read') }}</template></span>
                </span>
              </div>
              <div v-else-if="fetchFailed" class="sq card">
                <span class="sq chip"><EditorIcon name="warning" :size="16" /></span>
                <span class="card-col">
                  <span class="tx-body name">{{ fetchFailed }}</span>
                  <span class="tx-meta">{{ tr('You can add it anyway and paste the content into the document') }}</span>
                </span>
              </div>
            </div>

            <!-- 직접 쓰기 -->
            <div v-else class="col10">
              <TextInput v-model:value="title" v-bind="TI" data-autofocus :label="tr('Document name')" essential :placeholder="tr('e.g. Sign-up flow dev notes')" :input-props="{ id: 'docName', autocomplete: 'off' }" :label-props="{ htmlFor: 'docName' }" />
              <div class="choice">
                <span id="tplLabel" class="tx-head">{{ tr('Start from a template') }}</span>
                <!-- 문서 종류 틀: 세그먼트 컨트롤(서비스 공용 .segc) — 한 줄로 -->
                <div class="sq segc tpl" role="radiogroup" aria-labelledby="tplLabel" :style="{ gridTemplateColumns: `repeat(${TEMPLATES.length}, minmax(0, 1fr))` }">
                  <button
                    v-for="(t, i) in TEMPLATES"
                    :key="t.key"
                    type="button"
                    role="radio"
                    :aria-checked="template === t.key"
                    :class="['sq', 'segc-i', { on: template === t.key }]"
                    :title="tr(t.label)"
                    @click="pickTemplate(t)"
                  ><span v-if="tplLine(i)" class="segc-sep" aria-hidden="true" /><span class="ellipsis">{{ tr(t.label) }}</span></button>
                </div>
              </div>
              <div class="col6">
                <label for="docBody" class="tx-head">{{ tr('Content') }}</label>
                <div class="sq area-box"><textarea id="docBody" ref="areaEl" v-model="body" class="area" rows="7" @input="growArea" :placeholder="tr(`'# ' heading, '## ' subheading, '- ' list. Separate paragraphs with a blank line.`)" /></div>
              </div>
            </div>

            <!-- 양식 검사: 한 줄 요약(머리 · 상태 칩) + 숫자 한 줄, 경고는 눌러서 펼치기 -->
            <div v-if="showCheck && check" class="sq fcheck">
              <div class="fc-h">
                <b>{{ tr('Format check') }}</b>
                <span v-if="check.format === 'none'" class="sq fc-st none">{{ tr('Not in the Iris planning format') }}</span>
                <button v-else-if="warnCount" type="button" class="sq fc-st warn" :aria-expanded="warnOpen" @click="warnOpen = !warnOpen"><EditorIcon name="warning" :size="12" />{{ warnCount === 1 ? tr('1 warning') : tr('{n} warnings', { n: warnCount }) }}<EditorIcon name="chevron_down" :size="12" :class="['car', { up: warnOpen }]" /></button>
                <span v-else class="sq fc-st ok"><EditorIcon name="check" :size="12" />{{ tr('Ready to link') }}</span>
              </div>
              <p v-if="check.format === 'none'" class="tx-meta fc-none">{{ tr('No request or screen table was found — download the guide above to see the format') }}</p>
              <div v-else class="fc-nums">
                <span><b class="num">{{ check.policies.length }}</b>{{ tr('Requests') }}</span>
                <span class="fc-dot" aria-hidden="true" />
                <span><b class="num">{{ check.slots.length }}</b>{{ tr('Screen slots') }}</span>
                <span class="fc-dot" aria-hidden="true" />
                <span><b class="num">{{ check.links }}</b>{{ tr('Links') }}</span>
              </div>
              <ul v-if="warnOpen && warnCount" class="wlist">
                <li v-for="(w, i) in check.warnings.filter((x) => x.kind !== 'no_screen')" :key="i"><span class="dot" />{{ wText(w) }}</li>
              </ul>
            </div>

            <!-- 분류 -->
            <div class="choice">
              <span class="cat-h"><span id="catLabel" class="tx-head">{{ tr('Category') }}</span><span v-if="catAuto" class="tx-meta">{{ tr('Chosen from the document — change it if it’s wrong') }}</span></span>
              <div class="seg cats" role="radiogroup" aria-labelledby="catLabel">
                <button
                  v-for="c in CATS"
                  :key="c[0]"
                  type="button"
                  role="radio"
                  :aria-checked="category === c[0]"
                  :class="['sq', 'seg-item', { on: category === c[0] }]"
                  @click="category = c[0]; catTouched = true"
                >{{ tr(c[1]) }}</button>
              </div>
            </div>

            <p v-if="error" class="tx-meta err" role="alert"><EditorIcon name="warning" :size="12" />{{ error }}</p>
          </div>

          <div class="pop-foot">
            <Button size="s" type="tertiary" :disabled="saving" @click="close">{{ tr('Cancel') }}</Button>
            <Button size="s" type="primary" :loading="saving" :disabled="!canSave && !saving" @click="save">{{ tr('Add') }}</Button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준). 여기에는 안쪽 내용만 — 탭 · 분류 알약의 왼쪽 끝은 제목 · 본문과 같은 16 선에, 본문은 탭 아래 12 */
.tabs { flex: none; padding: 0 var(--ref-spacing-10); }
.content { min-height: 300px; padding-top: var(--ref-spacing-08); }
.col6 { display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
/* 칸 라벨은 디자인 시스템 입력칸 라벨과 같게: 12/18 SemiBold neutral/700 */
.col6 > .tx-head:first-child { color: var(--sys-color-neutral-700); }
.col6 > .tx-meta:last-child { margin-top: var(--ref-spacing-02); }
.col8 { display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.col10 { display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.fill { flex: 1; }
/* 올리기 영역: 옅은 바탕 + 얇은 테두리, 그림자 없이(팝업 안은 평평하게 — 그림자는 떠 있는 팝업에만). 고른 파일 카드는 바탕만 */
.drop { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-14) var(--ref-spacing-10); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; text-align: center; cursor: pointer; transition: color .12s ease; }
.drop:hover { --sq-fill: var(--sys-color-neutral-200); --sq-line: var(--ref-color-gray-900-20); }
.drop:active { --sq-fill: var(--sys-color-neutral-200); --sq-overlay: var(--interaction-light-gray-pressed); }
/* 끌어다 놓는 중: 파랑 옅은 바탕 + 얇은 파랑 선(놓을 수 있다는 표시) */
.drop.over { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.drop.over .up { color: var(--sys-color-brand-primary-default); }
.drop:has(input:focus-visible) { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.drop .tx-meta { color: var(--sys-color-neutral-500); }
.up { margin-bottom: var(--ref-spacing-04); display: grid; place-items: center; color: var(--sys-color-neutral-500); }

/* 양식 가이드 줄: 고른 파일 카드와 같은 틀(옅은 바탕 · 모서리 16 · 높이 48~) */
.guide { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); }
.guide :deep(.bd-button) { flex: none; }
.card { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); }
.chip { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); font-size: 10px; font-weight: 600; color: var(--sys-color-neutral-700); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.card-col .tx-meta { color: var(--sys-color-neutral-500); }
.name { font-weight: 500; color: var(--sys-color-neutral-800); }

.url-row { display: flex; align-items: flex-end; gap: var(--ref-spacing-04); }
/* 입력칸(s, 30) 옆 버튼도 30 — 공유 창 초대 줄과 같아요 */
.url-row :deep(.bd-button) { height: 30px; min-height: 30px; }
.url-in { flex: 1; min-width: 0; }

/* 틀 세그먼트: 다섯 칸이 한 줄(넘치면 말줄임, 이름은 title 로) */
.tpl { width: 100%; }
.tpl .segc-i { min-width: 0; }

.area { display: block; width: 100%; box-sizing: border-box; resize: none; overflow-y: auto; min-height: 128px; max-height: 240px; padding: var(--ref-spacing-07) var(--ref-spacing-08); border: 0; outline: 0; background: transparent; font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
/* 입력칸 틀: textarea 는 ::before · ::after 가 없어서 감싼 .sq 가 채우기 · 선(squircle)을 그려요 */
/* 여러 줄 입력칸 둥글기: 댓글 입력칸과 같은 18 */
.area-box { display: block; border-radius: 18px; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }

/* 양식 검사: 옅은 테두리 칸, 머리 줄(제목 · 상태 칩) + 숫자 한 줄 */
.fcheck { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.fc-h { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); min-height: 22px; }
.fc-h b { font-weight: 600; }
.fc-st { display: inline-flex; align-items: center; gap: var(--ref-spacing-03); height: 22px; padding: 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; white-space: nowrap; }
.fc-st.ok { color: #1B7A2B; --sq-fill: #E9F6EC; }
.fc-st.warn { color: #B44A0E; --sq-fill: #FFF1E8; }
.fc-st.warn:hover { --sq-fill: #FFE6D6; }
.fc-st.warn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.fc-st.none { color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-100); }
.car { transition: transform .16s ease; }
.car.up { transform: rotate(180deg); }
.fc-nums { display: flex; align-items: center; gap: var(--ref-spacing-05); flex-wrap: wrap; color: var(--sys-color-neutral-600); }
.fc-nums > span:not(.fc-dot) { display: inline-flex; align-items: baseline; gap: var(--ref-spacing-03); }
.fc-nums b { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--sys-color-neutral-800); }
.fc-dot { width: 2px; height: 2px; border-radius: 50%; background: var(--sys-color-neutral-400); }
.fc-none { margin: 0; }
.wlist { margin: var(--ref-spacing-02) 0 0; padding: var(--ref-spacing-05) 0 0; list-style: none; display: flex; flex-direction: column; gap: var(--ref-spacing-03); box-shadow: inset 0 1px 0 var(--iris-line); color: var(--sys-color-neutral-700); }
.wlist li { display: flex; gap: var(--ref-spacing-04); align-items: flex-start; }
.wlist .dot { flex: none; width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: #E2601B; }

/* 링크 안내: 입력칸 바로 아래 캡션(간격 6), 왼쪽 8 들여쓰기(사용자 요청) */
.url-wrap { display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.link-help { margin: 0; padding: 0 0 0 var(--ref-spacing-06); list-style: none; display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
.link-help li { display: flex; gap: var(--ref-spacing-04); }
.link-help li::before { content: ''; flex: none; width: 3px; height: 3px; margin: 8px 0 0 var(--ref-spacing-02); border-radius: 50%; background: var(--sys-color-neutral-400); }
/* 분류 머리: 라벨 옆 '문서를 보고 골랐어요' */
.cat-h { display: flex; align-items: baseline; gap: var(--ref-spacing-04); }
.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }

.success { align-items: center; justify-content: center; text-align: center; gap: var(--ref-spacing-04); }
.badge-ok { width: 40px; height: 40px; margin-bottom: var(--ref-spacing-04); border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
</style>
