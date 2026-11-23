<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { DocBlock, DocCategory, DocRow, ReqRow } from '~/composables/useIrisData'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ created: [docId: string] }>()

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { addDocument, addRequirement } = useIrisMutations()
const cachedReqs = useNuxtData<ReqRow[]>(`reqs-${props.projectId}`).data

type Mode = 'file' | 'link' | 'write'
const MODES: [Mode, string][] = [['file', '파일 올리기'], ['link', '링크 붙여넣기'], ['write', '직접 쓰기']]
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
  { key: 'plan', label: '기획서', cat: 'planning', text: '# 배경\n왜 이 작업을 하는지 적어주세요.\n\n# 요구사항\n- REQ-001 \n- REQ-002 \n\n# 예외 상황\n' },
  { key: 'dev', label: '개발 메모', cat: 'dev', text: '# 개요\n\n## API\n- \n\n## 확인할 것\n- \n' },
  { key: 'blank', label: '빈 문서', cat: 'etc', text: '' },
]
const template = ref('blank')
function pickTemplate(t: (typeof TEMPLATES)[number]) {
  const cur = TEMPLATES.find((x) => x.key === template.value)
  // 이미 쓴 내용이 있으면 덮어쓰지 않습니다
  if (!body.value.trim() || body.value === cur?.text) body.value = t.text
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
  if (!['pdf', 'docx', 'md'].includes(ext)) { error.value = 'PDF · Word(docx) · Markdown 파일만 올릴 수 있어요'; return }
  if (f.size > MAX_FILE) { error.value = '50MB까지 올릴 수 있어요'; return }
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
    fetchFailed.value = msg?.data?.statusMessage || msg?.statusMessage || '본문을 불러오지 못했어요'
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
        if (upErr) throw new Error('파일을 올리지 못했어요')
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
    error.value = (e as Error)?.message && !(e as Error).message.startsWith('{') ? (e as Error).message : '문서를 추가하지 못했어요. 잠시 뒤 다시 시도해주세요.'
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
function focusFirst() {
  const el = dialog.value?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
  el?.focus()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); close(); return }
  if (e.key !== 'Tab') return
  const list = focusables()
  if (!list.length) return
  const first = list[0]!, last = list[list.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
watch(mode, async () => { error.value = ''; await nextTick(); dialog.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus() })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @mousedown.self="close">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addDocTitle"
        class="sq dialog"
        @keydown="onKeydown"
      >
        <div class="top">
          <h1 id="addDocTitle" class="tx-title">문서 추가</h1>
          <button type="button" class="ib" aria-label="닫기" @click="close"><Icon name="close" :size="20" /></button>
        </div>

        <!-- 다 넣은 뒤 -->
        <template v-if="done">
          <div class="content success" role="status">
            <span class="badge-ok"><Icon name="check" :size="20" /></span>
            <span class="tx-head">문서를 추가했어요</span>
            <span class="tx-meta">{{ done.found ? `요구사항 ${done.found}개를 찾았어요` : '번호(REQ-001 등)가 붙은 요구사항은 찾지 못했어요' }}</span>
          </div>
          <div class="foot">
            <button type="button" class="act m gray grow1" @click="close">닫기</button>
            <NuxtLink :to="`/p/${projectId}/docs/${done.docId}`" class="act m pri grow2" data-autofocus @click="open = false">문서 보기</NuxtLink>
          </div>
        </template>

        <template v-else>
          <div role="tablist" aria-label="문서를 넣는 방법" class="seg tabs">
            <button
              v-for="m in MODES"
              :key="m[0]"
              type="button"
              role="tab"
              :aria-selected="mode === m[0]"
              :class="['sq', 'seg-item', { on: mode === m[0] }]"
              @click="mode = m[0]"
            >{{ m[1] }}</button>
          </div>

          <div class="content">
            <!-- 파일 -->
            <div v-if="mode === 'file'" class="col8">
              <label
                v-if="!file"
                :class="['sq', 'drop', { over: dragging }]"
                @dragover.prevent="dragging = true"
                @dragleave="dragging = false"
                @drop.prevent="onDrop"
              >
                <span class="up"><Icon name="upload" :size="20" /></span>
                <span class="tx-head">파일을 끌어다 놓거나 눌러서 골라주세요</span>
                <span class="tx-meta">PDF · Word · Markdown, 50MB까지</span>
                <input type="file" class="sr" accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown" data-autofocus @change="setFile(($event.target as HTMLInputElement).files?.[0])">
              </label>
              <div v-else class="sq card">
                <span class="sq chip num">{{ fileExt.toUpperCase() }}</span>
                <span class="card-col">
                  <span class="tx-body name ellipsis">{{ file.name }}</span>
                  <span class="tx-meta num">{{ sizeLabel(file.size) }}<template v-if="fileExt === 'md'"> · 요구사항 {{ foundCount }}개</template><template v-else> · 본문은 파일로만 보관해요</template></span>
                </span>
                <button type="button" class="ib" aria-label="파일 빼기" data-autofocus @click="clearFile"><Icon name="close" :size="16" /></button>
              </div>
              <p v-if="preview && file" class="tx-meta">미리보기에서는 파일을 올리지 않고 이름만 저장해요</p>
            </div>

            <!-- 링크 -->
            <div v-else-if="mode === 'link'" class="col8">
              <div class="col6">
                <label for="docUrl" class="tx-head">문서 주소</label>
                <div class="field m">
                  <Icon name="link" :size="14" color="var(--sys-color-neutral-500)" />
                  <input id="docUrl" v-model="url" type="url" inputmode="url" placeholder="https://" autocomplete="off" data-autofocus @keydown.enter.prevent="fetchLink" @blur="fetchLink">
                  <button type="button" class="act line" :disabled="!urlValid || fetching" @click="fetchLink">
                    <Icon :name="fetching ? 'refresh' : 'arrow_up_right'" :size="14" />{{ fetching ? '불러오는 중' : '불러오기' }}
                  </button>
                </div>
              </div>
              <div v-if="fetched" class="sq card">
                <span class="sq chip"><Icon name="document" :size="16" /></span>
                <span class="card-col">
                  <span class="tx-body name ellipsis">{{ fetched.title }}</span>
                  <span class="tx-meta num">{{ linkHost }} · 요구사항 {{ foundCount }}개</span>
                </span>
              </div>
              <div v-else-if="fetchFailed" class="sq card">
                <span class="sq chip"><Icon name="warning" :size="16" /></span>
                <span class="card-col">
                  <span class="tx-body name">{{ fetchFailed }}</span>
                  <span class="tx-meta">그대로 추가하고 문서에서 본문을 붙여넣을 수 있어요</span>
                </span>
              </div>
            </div>

            <!-- 직접 쓰기 -->
            <div v-else class="col10">
              <div class="col6">
                <label for="docName" class="tx-head">문서 이름</label>
                <span class="field m"><input id="docName" v-model="title" placeholder="예: 신청 플로우 개발 메모" autocomplete="off" data-autofocus></span>
              </div>
              <div class="col6">
                <span id="tplLabel" class="tx-head">어떤 틀로 시작할까요?</span>
                <div class="tpl" role="radiogroup" aria-labelledby="tplLabel">
                  <button
                    v-for="t in TEMPLATES"
                    :key="t.key"
                    type="button"
                    role="radio"
                    :aria-checked="template === t.key"
                    :class="['sq', 'tpl-item', { on: template === t.key, hov: template !== t.key }]"
                    @click="pickTemplate(t)"
                  >{{ t.label }}</button>
                </div>
              </div>
              <div class="col6">
                <label for="docBody" class="tx-head">내용</label>
                <textarea id="docBody" v-model="body" class="area" rows="7" placeholder="'# ' 제목, '## ' 소제목, '- ' 목록. 빈 줄로 문단을 나눠요." />
                <span class="tx-meta num">요구사항 번호(REQ-001 등)로 시작하는 줄은 요구사항으로 등록돼요{{ foundCount ? ` · 지금 ${foundCount}개` : '' }}</span>
              </div>
            </div>

            <!-- 분류 -->
            <div class="col6">
              <span id="catLabel" class="tx-head">분류</span>
              <div class="seg cats" role="radiogroup" aria-labelledby="catLabel">
                <button
                  v-for="c in CATS"
                  :key="c[0]"
                  type="button"
                  role="radio"
                  :aria-checked="category === c[0]"
                  :class="['sq', 'seg-item', { on: category === c[0] }]"
                  @click="category = c[0]"
                >{{ c[1] }}</button>
              </div>
            </div>

            <p v-if="error" class="tx-meta err" role="alert"><Icon name="warning" :size="12" />{{ error }}</p>
          </div>

          <div class="foot">
            <button type="button" class="act m gray grow1" @click="close">취소</button>
            <button type="button" class="act m pri grow2" :disabled="!canSave" @click="save">{{ saving ? '추가하는 중' : '추가하기' }}</button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--dimmed-bg); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 560px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-default); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.top { display: flex; align-items: center; justify-content: space-between; padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-08); }
.tabs { padding: 0 var(--ref-spacing-10); }
.content { flex: 1; min-height: 300px; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.foot { display: flex; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); }
.grow1 { flex: 1; }
.grow2 { flex: 2.25; }
.act:disabled { opacity: .5; cursor: default; }
.col6 { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.col8 { display: flex; flex-direction: column; gap: var(--ref-spacing-08); }
.col10 { display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.cats { margin-left: calc(-1 * var(--ref-spacing-06)); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.drop { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-14) var(--ref-spacing-10); border-radius: var(--ref-radius-07); --sq-line: var(--ref-color-gray-900-20); --sq-line-w: 1px; text-align: center; cursor: pointer; }
.drop:hover, .drop.over { --sq-fill: var(--sys-color-neutral-100); }
.drop:focus-within { --sq-line: var(--sys-color-brand-primary-default); }
.up { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-common-white-default); color: var(--sys-color-brand-primary-default); box-shadow: var(--shadow-01); }

.card { display: flex; align-items: center; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-07); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.chip { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-04); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-weight: 600; color: var(--sys-color-neutral-800); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-weight: 500; }

.field.m:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.field .act { margin-right: calc(-1 * var(--ref-spacing-05)); }

.tpl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ref-spacing-06); }
.tpl-item { padding: var(--ref-spacing-08); border-radius: var(--ref-radius-07); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-weight: 600; }
.tpl-item.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; --sq-fill: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }

.area { width: 100%; box-sizing: border-box; resize: vertical; min-height: 128px; padding: var(--ref-spacing-06) var(--ref-spacing-08); border: 0; outline: 0; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); font-size: 12px; line-height: 20px; color: var(--sys-color-neutral-800); }
.area:focus { box-shadow: inset 0 0 0 0.5px var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }

.err { display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0; color: var(--sys-color-theme-error-default); }

.success { align-items: center; justify-content: center; text-align: center; gap: var(--ref-spacing-04); }
.badge-ok { width: 44px; height: 44px; margin-bottom: var(--ref-spacing-04); border-radius: 50%; display: grid; place-items: center; background: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
</style>
