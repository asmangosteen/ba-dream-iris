<script setup lang="ts">
import { Button, IconButton, TextInput } from '@ba-dream/design-system'
import type { DocBlock, DocCategory, DocRow, ReqRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ created: [docId: string] }>()

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { addDocument, addRequirement } = useIrisMutations()
const cachedReqs = useNuxtData<ReqRow[]>(`reqs-${props.projectId}`).data

type Mode = 'file' | 'link' | 'write'
// 라벨은 영어 원문 — 그릴 때 tr() 로 감싸요
const MODES: [Mode, string][] = [['file', 'Upload file'], ['link', 'Paste link'], ['write', 'Write']]
const CATS = Object.entries(DOC_CATEGORY_LABEL) as [DocCategory, string][]
const MAX_FILE = 50 * 1024 * 1024

const mode = ref<Mode>('file')
const category = ref<DocCategory>('planning')
const saving = ref(false)
const error = ref('')
const done = ref<{ docId: string; found: number } | null>(null)

// 직접 쓰기 ----------------------------------------------------------------
const title = ref('')
const body = ref('')
const TEMPLATES: { key: string; label: string; cat: DocCategory; text: string }[] = [
  { key: 'plan', label: 'Spec', cat: 'planning', text: '# Background\nWhy are we doing this?\n\n# Requirements\n- REQ-001 \n- REQ-002 \n\n# Edge cases\n' },
  { key: 'dev', label: 'Dev notes', cat: 'dev', text: '# Overview\n\n## API\n- \n\n## To check\n- \n' },
  { key: 'blank', label: 'Blank', cat: 'etc', text: '' },
]
/** 틀 본문도 지금 언어로(넣을 때 정해져서 그다음부터는 사용자 글) */
const tplText = (t: (typeof TEMPLATES)[number] | undefined) => (t?.text ? tr(t.text) : '')
const template = ref('blank')
function pickTemplate(t: (typeof TEMPLATES)[number]) {
  const cur = TEMPLATES.find((x) => x.key === template.value)
  // 이미 쓴 내용이 있으면 덮어쓰지 않습니다
  if (!body.value.trim() || body.value === tplText(cur)) body.value = tplText(t)
  template.value = t.key
  category.value = t.cat
}
/** 줄 단위로 나눕니다: '# ' → h1, '## ' → h2, '- ' → li, 나머지 → 문단(빈 줄로 구분) */
function toBlocks(src: string): DocBlock[] {
  const out: DocBlock[] = []
  let para: string[] = []
  let n = 0
  const id = () => 'b' + ++n
  const flush = () => { if (para.length) out.push({ id: id(), type: 'p', text: para.join(' ') }); para = [] }
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const m = line.match(/^(##|#|-)\s+(.*)$/)
    if (m) {
      flush()
      if (m[2]!.trim()) out.push({ id: id(), type: m[1] === '#' ? 'h1' : m[1] === '##' ? 'h2' : 'li', text: m[2]!.trim() })
    } else para.push(line)
  }
  flush()
  return out
}

// 파일 -------------------------------------------------------------------
const file = ref<File | null>(null)
const fileText = ref<string | null>(null)
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
const fetched = ref<{ url: string; title: string; text: string } | null>(null)
const fetchFailed = ref<string | null>(null)
const urlValid = computed(() => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url.value.trim()))
async function fetchLink() {
  const u = url.value.trim()
  if (!urlValid.value || fetching.value || fetched.value?.url === u) return
  fetching.value = true
  fetchFailed.value = null
  fetched.value = null
  try {
    const r = await $fetch<{ title: string; text: string }>('/api/fetch-link', { method: 'POST', body: { url: u } })
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
const linkHost = computed(() => { try { return new URL(url.value.trim()).hostname } catch { return '' } })

// 미리 찾은 요구사항 수 (카드에 보여 주기용) --------------------------------
const draftDoc = computed<DocRow>(() => ({
  id: 'draft', project_id: props.projectId, title: '', category: category.value, source_type: mode.value === 'write' ? 'native' : mode.value === 'file' ? 'upload' : 'link',
  content_blocks: mode.value === 'write' ? toBlocks(body.value) : null, file_path: null, file_type: null, url: null,
  plain_text: mode.value === 'file' ? fileText.value : mode.value === 'link' ? fetched.value?.text ?? null : null,
  fetch_status: null, version_label: null, updated_at: '',
}))
const foundCount = computed(() => detectRequirements(draftDoc.value).length)

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
      doc = { title: f.name.replace(/\.[^.]+$/, ''), category: category.value, source_type: 'upload', file_path: path, file_type: ext, plain_text: fileText.value }
    } else {
      const u = url.value.trim()
      if (!fetched.value && !fetchFailed.value) await fetchLink()
      const ok = fetched.value?.url === u ? fetched.value : null
      doc = { title: ok?.title || linkHost.value || u, category: category.value, source_type: 'link', url: u, plain_text: ok?.text ?? null, fetch_status: ok ? 'ok' : 'failed' }
    }

    const docId = await addDocument(props.projectId, doc)

    // 번호 규칙(REQ-001 …)으로 요구사항 후보를 찾아 넣습니다. 이미 있는 번호는 건너뜁니다
    const full = { ...draftDoc.value, ...doc, id: docId } as DocRow
    const existing = new Set((cachedReqs.value ?? []).map((r) => r.code.toUpperCase()))
    let found = 0
    for (const c of detectRequirements(full)) {
      if (existing.has(c.code)) continue
      existing.add(c.code)
      try {
        await addRequirement(props.projectId, { document_id: docId, code: c.code, title: c.title.slice(0, 120), body: c.title, origin: 'auto_pattern', anchor: c.block ? { block: c.block } : {} })
        found++
      } catch { /* 하나가 실패해도 나머지는 계속 넣습니다 */ }
    }

    await refreshNuxtData([`docs-${props.projectId}`, `reqs-${props.projectId}`])
    done.value = { docId, found }
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
  mode.value = 'file'; category.value = 'planning'; error.value = ''; done.value = null
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
            <span class="tx-meta">{{ done.found === 1 ? tr('Found 1 requirement') : done.found ? tr('Found {n} requirements', { n: done.found }) : tr('No numbered requirements (like REQ-001) found') }}</span>
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
                  <span class="tx-meta num">{{ sizeLabel(file.size) }}<template v-if="fileExt === 'md'"> · {{ tr('Requirements: {n}', { n: foundCount }) }}</template><template v-else> · {{ tr('Content is kept as a file only') }}</template></span>
                </span>
                <IconButton icon-name="close" size="s" type="ghost" :ariaLabel="tr('Remove file')" data-autofocus @click="clearFile" />
              </div>
              <p v-if="preview && file" class="tx-meta">{{ tr('In preview, only the file name is saved. The file isn’t uploaded.') }}</p>
            </div>

            <!-- 링크 -->
            <div v-else-if="mode === 'link'" class="col8">
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
              <div v-if="fetched" class="sq card">
                <span class="sq chip"><EditorIcon name="document" :size="16" /></span>
                <span class="card-col">
                  <span class="tx-body name ellipsis" :title="fetched.title">{{ fetched.title }}</span>
                  <span class="tx-meta num">{{ linkHost }} · {{ tr('Requirements: {n}', { n: foundCount }) }}</span>
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
                <div class="tpl" role="radiogroup" aria-labelledby="tplLabel">
                  <button
                    v-for="t in TEMPLATES"
                    :key="t.key"
                    type="button"
                    role="radio"
                    :aria-checked="template === t.key"
                    :class="['sq', 'tpl-item', { on: template === t.key }]"
                    @click="pickTemplate(t)"
                  >{{ tr(t.label) }}</button>
                </div>
              </div>
              <div class="col6">
                <label for="docBody" class="tx-head">{{ tr('Content') }}</label>
                <div class="sq area-box"><textarea id="docBody" v-model="body" class="area" rows="7" :placeholder="tr(`'# ' heading, '## ' subheading, '- ' list. Separate paragraphs with a blank line.`)" /></div>
                <span class="tx-meta num">{{ tr('Lines starting with a requirement number (like REQ-001) become requirements') }}{{ foundCount ? ' · ' + tr('{n} found', { n: foundCount }) : '' }}</span>
              </div>
            </div>

            <!-- 분류 -->
            <div class="choice">
              <span id="catLabel" class="tx-head">{{ tr('Category') }}</span>
              <div class="seg cats" role="radiogroup" aria-labelledby="catLabel">
                <button
                  v-for="c in CATS"
                  :key="c[0]"
                  type="button"
                  role="radio"
                  :aria-checked="category === c[0]"
                  :class="['sq', 'seg-item', { on: category === c[0] }]"
                  @click="category = c[0]"
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

.card { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 48px; padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-neutral-100); }
.chip { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-common-white-default); font-size: 10px; font-weight: 600; color: var(--sys-color-neutral-700); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.card-col .tx-meta { color: var(--sys-color-neutral-500); }
.name { font-weight: 500; color: var(--sys-color-neutral-800); }

.url-row { display: flex; align-items: flex-end; gap: var(--ref-spacing-04); }
/* 입력칸(s, 30) 옆 버튼도 30 — 공유 창 초대 줄과 같아요 */
.url-row :deep(.bd-button) { height: 30px; min-height: 30px; }
.url-in { flex: 1; min-width: 0; }

.tpl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ref-spacing-06); }
.tpl-item { padding: var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-weight: 500; transition: color .12s ease; }
.tpl-item:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.tpl-item:active { --sq-overlay: var(--interaction-light-gray-pressed); }
.tpl-item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.tpl-item.on { font-weight: 600; --sq-overlay: transparent; --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; --sq-fill: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }

.area { display: block; width: 100%; box-sizing: border-box; resize: vertical; min-height: 128px; padding: var(--ref-spacing-05) var(--ref-spacing-07); border: 0; outline: 0; background: transparent; font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
/* 입력칸 틀: textarea 는 ::before · ::after 가 없어서 감싼 .sq 가 채우기 · 선(squircle)을 그려요 */
.area-box { display: block; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.area-box:hover { --sq-line: var(--ref-color-gray-900-20); }
.area-box:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }

.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }

.success { align-items: center; justify-content: center; text-align: center; gap: var(--ref-spacing-04); }
.badge-ok { width: 40px; height: 40px; margin-bottom: var(--ref-spacing-04); border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
</style>
