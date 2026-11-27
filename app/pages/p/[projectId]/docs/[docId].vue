<script setup lang="ts">
import { Button, Icon, IconButton, Skeleton } from '@ba-dream/design-system'
import DocReader from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import DocEditor from '~/components/docs/DocEditor.vue'
import DocCheckBar from '~/components/docs/DocCheckBar.vue'
import DocNotes, { type DocAnchor } from '~/components/docs/DocNotes.vue'
import DocHistory from '~/components/docs/DocHistory.vue'
import type { DocBlock, DocRow, LinkRow, ProjectScreen, ReqRow, SlotRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'

/** 문서 함께 보기 — 오른쪽에 문서, 왼쪽 캔버스에 이 문서와 연결된 화면 (design/iris-canvas/DocSplit.dc.html) */
const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
const docId = computed(() => route.params.docId as string)

const { data: projects } = useProjects()
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const screens = useProjectScreens(projectId)
const slots = useScreenSlots(projectId)
const { addRequirement, removeRequirement, linkMany, syncDocFormat, addHistory } = useIrisMutations()
const comments = useComments(projectId)

const projectName = computed(() => projects.value?.find((p) => p.id === projectId)?.name ?? '')
const doc = computed(() => docs.data.value?.find((d) => d.id === docId.value) ?? null)
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
const docReqIds = computed(() => new Set(docReqs.value.map((r) => r.id)))
const docLinks = computed(() => (links.data.value ?? []).filter((l) => docReqIds.value.has(l.requirement_id)))

useHead({ title: computed(() => (doc.value ? `${doc.value.title} · Iris` : 'Iris')) })

// 선택 상태 --------------------------------------------------------------
const activeReq = ref<string | null>(null)
const activeScreen = ref<string | null>(null)
watch(docId, () => { activeReq.value = null; activeScreen.value = null; editing.value = false; dirty.value = false; gone.value = []; closeBars() })
/** 편집기로 돌아가기: 왼쪽 Docs 탭에 이 문서를 연 채로, 고른 REQ 도 그대로(사용자 요청 2026-11-26) */
const backHref = computed(() => ({ path: `/p/${projectId}`, query: { doc: docId.value, ...(activeReq.value ? { req: activeReq.value } : {}) } }))
// 편집기에서 '넓게 보기'로 왔으면(?req=) 고르던 REQ 를 그대로
onMounted(() => { if (typeof route.query.req === 'string') activeReq.value = route.query.req })

/**
 * 캔버스(B안): 이 문서 화면 표의 화면 칸 순서대로 — 칸에 붙은 디자인, 아직 없으면 '디자인 없음' 자리.
 * 그 뒤에 칸 없이 이 문서 정책과 연결된 화면.
 */
interface Col { key: string; slot: SlotRow | null; screen: ProjectScreen | null; code: string | null; name: string; page: string }
const docSlots = computed(() => (slots.data.value ?? []).filter((x) => x.document_id === docId.value && !x.removed_at))
const frames = computed<Col[]>(() => {
  const all = screens.data.value ?? []
  const out: Col[] = []
  const used = new Set<string>()
  for (const sl of docSlots.value) {
    const att = all.filter((x) => x.slot_id === sl.id)
    if (att.length) for (const x of att) { out.push({ key: x.id, slot: sl, screen: x, code: sl.code + (x.slot_state ? '/' + x.slot_state : ''), name: x.slot_state ? sl.name : x.name, page: x.page }); used.add(x.id) }
    else out.push({ key: 'slot-' + sl.id, slot: sl, screen: null, code: sl.code, name: sl.name, page: '' })
  }
  const linked = new Set(docLinks.value.map((l) => l.screen_id))
  for (const x of all) if (linked.has(x.id) && !used.has(x.id)) out.push({ key: x.id, slot: null, screen: x, code: null, name: x.name, page: x.page })
  return out
})
const activeLinks = computed(() => new Map(docLinks.value.filter((l) => l.requirement_id === activeReq.value).map((l) => [l.screen_id, l])))
const activeCode = computed(() => docReqs.value.find((r) => r.id === activeReq.value)?.code ?? null)
const reqCount = (screenId: string) => docLinks.value.filter((l) => l.screen_id === screenId).length
/** 고른 메모가 가리키는 화면들(핀이 붙은 화면 + 그 정책에 연결된 화면) */
const activeNote = ref<string | null>(null)
const noteDraft = ref<DocAnchor | null>(null)
const noteThread = computed(() => comments.docThreads(docId.value).find((t) => t.root.id === activeNote.value) ?? null)
const noteScreens = computed(() => {
  const t = noteThread.value
  if (!t) return new Set<string>()
  const ids = new Set<string>(t.root.screen_id ? [t.root.screen_id] : [])
  const r = t.root.doc_anchor?.code ? docReqs.value.find((x) => x.code === t.root.doc_anchor!.code) : null
  if (r) for (const l of docLinks.value) if (l.requirement_id === r.id) ids.add(l.screen_id)
  return ids
})
/** 고른 메모의 정책(문서에서 그 줄도 강조) */
const noteReqId = computed(() => { const c = noteThread.value?.root.doc_anchor?.code; return c ? docReqs.value.find((x) => x.code === c)?.id ?? null : null })
const pinCount = (screenId: string) => comments.docThreads(docId.value).filter((t) => t.root.screen_id === screenId && !t.root.resolved_at).length
const activeCol = ref<string | null>(null)
function isLit(c: Col) {
  if (c.screen && (activeLinks.value.has(c.screen.id) || activeScreen.value === c.screen.id || noteScreens.value.has(c.screen.id))) return true
  if (activeCol.value === c.key) return true
  return !!activeCode.value && !!c.slot?.policy_codes.includes(activeCode.value)
}
const isNoteLit = (c: Col) => !!c.screen && noteScreens.value.has(c.screen.id)
const isDim = (c: Col) => (!!activeReq.value || !!activeScreen.value || !!activeCol.value || !!activeNote.value) && !isLit(c)
watch(activeNote, (v) => { if (v) { activeReq.value = null; activeScreen.value = null; activeCol.value = null } })
/** 문서에서 화면 ID(C-05)를 누르면 그 화면 칸으로 */
function pickSlot(code: string) {
  const c = frames.value.find((x) => x.slot?.code === code)
  if (!c) { say(tr('{code} isn’t a screen slot in this document', { code })); return }
  activeReq.value = null
  activeScreen.value = null
  activeNote.value = null
  activeCol.value = c.key
  nextTick(() => canvas.value?.querySelector(`[data-col="${c.key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }))
}
function pickCol(c: Col) {
  activeCol.value = null
  activeNote.value = null
  if (c.screen) return pickScreen(c.screen.id)
  activeScreen.value = null
  activeCol.value = c.key
  // 칸의 '정책' 열 첫 정책으로 문서를 옮겨요
  const r = docReqs.value.find((x) => c.slot?.policy_codes.includes(x.code))
  activeReq.value = r?.id ?? null
  if (r) nextTick(() => reader.value?.scrollToReq(r.id))
}

// 끌어서 연결(새 1): 화면 오른쪽 가장자리 점을 끌어 문서의 정책 줄에 놓으면 연결 --------------
const drag = ref<{ screen: ProjectScreen; x0: number; y0: number; x: number; y: number; over: ReqRow | null } | null>(null)
let dropEl: Element | null = null
function startLinkDrag(c: Col, e: PointerEvent) {
  if (!c.screen) return
  e.preventDefault()
  e.stopPropagation()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  drag.value = { screen: c.screen, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: e.clientX, y: e.clientY, over: null }
  window.addEventListener('pointermove', onLinkMove)
  window.addEventListener('pointerup', onLinkUp, { once: true })
  window.addEventListener('keydown', onLinkKey)
}
function reqAt(x: number, y: number): { el: Element; req: ReqRow } | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-reqs]')
  const id = el?.getAttribute('data-reqs')?.split(' ')[0]
  const req = id ? docReqs.value.find((r) => r.id === id) : null
  return el && req ? { el, req } : null
}
function onLinkMove(e: PointerEvent) {
  if (!drag.value) return
  drag.value.x = e.clientX
  drag.value.y = e.clientY
  const hit = reqAt(e.clientX, e.clientY)
  if (dropEl !== hit?.el) { dropEl?.classList.remove('drop-on'); dropEl = hit?.el ?? null; dropEl?.classList.add('drop-on') }
  drag.value.over = hit?.req ?? null
}
function endLinkDrag() {
  dropEl?.classList.remove('drop-on')
  dropEl = null
  drag.value = null
  window.removeEventListener('pointermove', onLinkMove)
  window.removeEventListener('keydown', onLinkKey)
}
function onLinkKey(e: KeyboardEvent) { if (e.key === 'Escape') { window.removeEventListener('pointerup', onLinkUp); endLinkDrag() } }
async function onLinkUp() {
  const d = drag.value
  const req = d?.over
  endLinkDrag()
  if (!d || !req) return
  if (docLinks.value.some((l) => l.screen_id === d.screen.id && l.requirement_id === req.id)) { say(tr('{code} is already linked to {name}', { code: req.code, name: d.screen.name })); return }
  try {
    await linkMany([{ screen_id: d.screen.id, requirement_id: req.id }], links.data.value ?? [])
    await links.refresh()
    activeReq.value = req.id
    say(tr('Linked {code} to {name}', { code: req.code, name: d.screen.name }))
  } catch { say(tr("Couldn't link. Try again")) }
}
onBeforeUnmount(endLinkDrag)

// 문서 옆 메모 · 수정 기록 ---------------------------------------------------
/** 문서 옆 메모 칸: 메모가 있으면 열고, 없으면 닫아 둬요(캔버스를 넓게). 직접 열고 닫으면 그대로 */
// 문서를 바꾸면 이 화면이 새로 그려져서 켠 상태를 프로젝트 단위로 기억해 둬요
const notesOpen = useState(`doc-notes-open-${projectId}`, () => false)
const notesTouchedS = useState(`doc-notes-touched-${projectId}`, () => false)
const notesRef = ref<{ count: number } | null>(null)
/** 문서 옆 메모만(자리가 있는 댓글) — 아래 게시판 글은 빼요 */
const noteCount = computed(() => comments.docThreads(docId.value).filter((t) => !!t.root.doc_anchor && !t.root.resolved_at).length)
watch(noteCount, (n) => { if (n > 0 && !notesTouchedS.value) notesOpen.value = true }, { immediate: true })
// 다른 문서로 가도 메모 칸을 켠 상태는 그대로(사용자 요청 2026-11-27) — 꺼져 있고 직접 끈 적이 없을 때만 메모가 있으면 열어요
watch(docId, () => { if (!notesOpen.value && !notesTouchedS.value && noteCount.value > 0) notesOpen.value = true })
function toggleNotes() { notesTouchedS.value = true; notesOpen.value = !notesOpen.value }
/** 메모 칸이 실제로 보이는지(고치기 · 기록 화면에서는 접어요) */
const notesShown = computed(() => notesOpen.value && !editing.value && !histOpen.value && !!doc.value)
function onComment(p: { quote: string; block: string | null; row: number | null; code: string | null }) {
  notesOpen.value = true
  activeNote.value = null
  noteDraft.value = { block: p.block, row: p.row, code: p.code, quote: p.quote }
}
function goAnchor(a: DocAnchor) {
  const r = a.code ? docReqs.value.find((x) => x.code === a.code) : null
  if (r) { activeReq.value = null; nextTick(() => reader.value?.scrollToReq(r.id)) }
  else if (a.block) goBlock({ block: a.block, row: a.row ?? null })
}
/** 문서의 블록 · 표 행으로 스크롤(양식 경고 [Go]) */
function goBlock(at: { block: string; row: number | null }) {
  const root = reader.value?.root
  const blockEl = root?.querySelector(`[data-block="${at.block}"]`)
  const el = (at.row ? blockEl?.querySelector(`tr[data-row="${at.row}"]`) : null) ?? blockEl
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1400)
}
/** 고른 문서 탭이 탭 줄 끝에 잘리지 않게: 고를 때마다 탭 전체가 보이도록 옆으로 넘겨요(사용자 요청 2026-11-27) */
const tabsEl = ref<HTMLElement | null>(null)
function revealTab(smooth = true) {
  nextTick(() => {
    const nav = tabsEl.value
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) return
    const pad = 8
    const left = el.offsetLeft - nav.offsetLeft, right = left + el.offsetWidth
    if (left - pad < nav.scrollLeft) nav.scrollTo({ left: Math.max(0, left - pad), behavior: smooth ? 'smooth' : 'auto' })
    else if (right + pad > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: right + pad - nav.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  })
}
watch(docId, () => revealTab())
watch(() => docs.data.value?.length, () => revealTab(false))
onMounted(() => revealTab(false))
/** 직접 만든 정책(#12) 지우기 — 문서 표에서 읽은 정책은 문서에서 그 행을 지우면 '문서에서 빠짐'으로 남아요 */
const confirmReq = ref<ReqRow | null>(null)
const removingReq = ref(false)
async function doRemoveReq() {
  const r = confirmReq.value
  if (!r || removingReq.value) return
  removingReq.value = true
  try {
    await removeRequirement(r.id)
    if (activeReq.value === r.id) activeReq.value = null
    await refreshNuxtData([`reqs-${projectId}`, `links-${projectId}`])
    say(tr('Deleted {code}', { code: r.code }))
  } catch { say(tr("Couldn't delete. Try again")) } finally { removingReq.value = false; confirmReq.value = null }
}
const histOpen = ref(false)
watch(docId, () => { histOpen.value = false; activeNote.value = null; noteDraft.value = null; activeCol.value = null })
/** 기록에서 [이 버전으로 되돌리기]: 그때 글로 저장하고, 되돌린 것도 기록으로 남겨요 */
async function restoreDoc(blocks: DocBlock[], label: string) {
  const d = doc.value
  if (!d) return
  const plain = blocks.map((b) => b.text).join('\n') || null
  try {
    if (preview) {
      const store = useState<Omit<DocRow, 'project_id'>[]>('pv-docs')
      const i = store.value?.findIndex((x) => x.id === d.id) ?? -1
      if (i >= 0) store.value[i] = { ...store.value[i]!, content_blocks: blocks, plain_text: plain, updated_at: new Date().toISOString() }
    } else {
      const { error } = await supabase.from('documents').update({ content_blocks: blocks, plain_text: plain }).eq('id', d.id)
      if (error) throw error
    }
    const result = analyzeDoc(blocks)
    await syncDocFormat(projectId, d.id, result, { reqs: reqs.data.value ?? [], slots: slots.data.value ?? [], screens: screens.data.value ?? [], links: links.data.value ?? [] }).catch(() => null)
    await addHistory(projectId, d.id, d.content_blocks ?? [], blocks, label).catch(() => null)
    await refreshNuxtData([`docs-${projectId}`, `reqs-${projectId}`, `links-${projectId}`, `slots-${projectId}`, `doc-history-${projectId}`])
    histOpen.value = false
    say(tr('Restored'))
  } catch { say(tr("Couldn't restore. Try again in a moment.")) }
}

const reader = ref<InstanceType<typeof DocReader> | null>(null)
const canvas = ref<HTMLElement | null>(null)

function pickReq(id: string) {
  activeScreen.value = null
  activeReq.value = activeReq.value === id ? null : id
  if (!activeReq.value) return
  nextTick(() => {
    const code = activeCode.value
    const first = frames.value.find((c) => (c.screen && activeLinks.value.has(c.screen.id)) || (!!code && !!c.slot?.policy_codes.includes(code)))
    if (first) canvas.value?.querySelector(`[data-col="${first.key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })
}

function pickScreen(id: string) {
  // 화면을 누르면 그 화면과 연결된 첫 요구사항으로 문서를 옮깁니다
  const first = docReqs.value.find((r) => docLinks.value.some((l) => l.screen_id === id && l.requirement_id === r.id))
  activeScreen.value = id
  activeReq.value = first?.id ?? null
  if (first) nextTick(() => reader.value?.scrollToReq(first.id))
}

// 고른 글로 요구사항 만들기 ------------------------------------------------
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function say(msg: string) {
  notice.value = msg
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3000)
}
onBeforeUnmount(() => clearTimeout(noticeTimer))

/** 문서에 번호 없이 고른 글로 만든 정책은 임시 번호(#12) — 문서에 없는 번호임을 드러내요(PRD/11 3-3) */
function nextCode(): string {
  const max = (reqs.data.value ?? []).reduce((m, r) => {
    const n = Number(r.code.match(/^#(\d+)$/)?.[1] ?? 0)
    return n > m ? n : m
  }, 0)
  return '#' + (max + 1)
}

async function createReq({ text, block }: { text: string; block: string | null }) {
  if (!doc.value) return
  const code = nextCode()
  try {
    const id = await addRequirement(projectId, {
      document_id: doc.value.id,
      code,
      title: text.length > 60 ? text.slice(0, 59) + '…' : text,
      body: text,
      anchor: block ? { block } : {},
      origin: 'manual',
    })
    await reqs.refresh()
    activeScreen.value = null
    activeReq.value = id
    say(tr('Created policy {code}', { code }))
  } catch {
    say(tr("Couldn't create the policy. Try again in a moment."))
  }
}

const addOpen = ref(false)

// 고치기 ------------------------------------------------------------------
const supabase = useSupabaseClient()
const preview = useDevPreview()
/** 에디터 패널의 "고치기"(?edit=1)로 들어오면 바로 고치기 모드(서버 · 브라우저가 같은 값으로 시작) */
const editing = ref(route.query.edit === '1')
const dirty = ref(false)
/** 문서에서 사라진 요구사항 번호(지우지 않고 알려만 줍니다) */
const gone = ref<string[]>([])
const goneReqs = computed(() => gone.value.map((code) => docReqs.value.find((r) => r.code === code)).filter((r): r is ReqRow => !!r))

/** 아래 확인 줄: 저장 안 한 내용 버리기 · 문서 지우기 */
const bar = ref<'leave' | 'delete' | null>(null)
let afterLeave: (() => void) | null = null
function closeBars() { bar.value = null; afterLeave = null }

function startEdit() {
  if (!doc.value) return
  closeBars()
  menuOpen.value = false
  gone.value = []
  editing.value = true
}
/** 바뀐 내용이 있으면 바로 나가지 않고 확인 줄을 띄웁니다 */
function guard(next: () => void) {
  if (editing.value && dirty.value) { afterLeave = next; bar.value = 'leave'; return }
  next()
}
function stopEdit() { editing.value = false; dirty.value = false }
function cancelEdit() { guard(stopEdit) }
function discard() {
  const next = afterLeave
  closeBars()
  stopEdit()
  next?.()
}
function onSaved({ found, gone: codes, warnings }: { found: number; gone: string[]; warnings: number }) {
  stopEdit()
  closeBars()
  gone.value = codes
  const base = found === 1 ? tr('Found 1 new policy') : found > 0 ? tr('Found {n} new policies', { n: found }) : tr('Document saved')
  say(warnings ? base + ' · ' + (warnings === 1 ? tr('1 warning') : tr('{n} warnings', { n: warnings })) : base)
}

// 다른 문서 · 다른 화면으로 갈 때
onBeforeRouteUpdate((to, from) => {
  if (to.params.docId === from.params.docId || !editing.value || !dirty.value) return true
  guard(() => router.replace(to.fullPath))
  return false
})
onBeforeRouteLeave((to) => {
  if (!editing.value || !dirty.value) return true
  guard(() => router.push(to.fullPath))
  return false
})
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (editing.value && dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// 주소에서 ?edit=1 은 지워 둡니다(새로고침해도 읽기 화면으로)
onMounted(() => {
  if (route.query.edit === undefined) return
  const { edit: _drop, ...query } = route.query
  router.replace({ query })
})

// "…" 메뉴 ---------------------------------------------------------------
const menuOpen = ref(false)
const moreEl = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  if (menuOpen.value && moreEl.value && !moreEl.value.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointer, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true))

// 지우기 -----------------------------------------------------------------
const deleting = ref(false)
function askDelete() {
  menuOpen.value = false
  bar.value = 'delete'
  afterLeave = null
}
async function removeDoc() {
  const d = doc.value
  if (!d || deleting.value) return
  deleting.value = true
  try {
    if (preview) {
      const docsStore = useState<Omit<DocRow, 'project_id'>[]>('pv-docs')
      const reqStore = useState<Omit<ReqRow, 'project_id'>[]>('pv-reqs')
      const linkStore = useState<LinkRow[]>('pv-links')
      const reqIds = new Set((reqStore.value ?? []).filter((r) => r.document_id === d.id).map((r) => r.id))
      if (docsStore.value) docsStore.value = docsStore.value.filter((x) => x.id !== d.id)
      if (reqStore.value) reqStore.value = reqStore.value.filter((r) => r.document_id !== d.id)
      if (linkStore.value) linkStore.value = linkStore.value.filter((l) => !reqIds.has(l.requirement_id))
    } else {
      // 요구사항 · 화면 연결은 DB 에서 같이 지워집니다(cascade)
      const { error } = await supabase.from('documents').delete().eq('id', d.id)
      if (error) throw error
      if (d.source_type === 'upload' && d.file_path) await supabase.storage.from('documents').remove([d.file_path]).catch(() => null)
    }
  } catch {
    deleting.value = false
    say(tr("Couldn't delete the document. Try again in a moment."))
    return
  }
  stopEdit()
  closeBars()
  await refreshNuxtData([`docs-${projectId}`, `reqs-${projectId}`, `links-${projectId}`])
  deleting.value = false
  await navigateTo(`/p/${projectId}`)
}
</script>

<template>
  <!-- 문서 추가 모달이 열려 있으면 뒤 화면은 보조기기에서 숨깁니다 -->
  <div class="split" :aria-hidden="addOpen ? 'true' : undefined">
    <!-- 왼쪽 위: 돌아가기 알약 -->
    <div class="sq float s pill">
      <NuxtLink :to="backHref" class="ib" :aria-label="tr('Back to editor')"><Icon name="chevron_left" :size="16" /></NuxtLink>
      <NuxtLink :to="backHref" class="tx-meta crumb ellipsis">{{ projectName || tr('Project') }}</NuxtLink>
      <EditorIcon name="chevron_right" :size="12" color="var(--sys-color-neutral-400)" />
      <span class="tx-head">{{ tr('Split view') }}</span>
    </div>

    <!-- 캔버스(B안): 화면 표의 화면 칸 순서대로 + 칸 없이 연결된 화면 -->
    <main ref="canvas" :aria-label="tr('Canvas')" :class="['canvas-dots', 'canvas', { wide: notesShown }]">
      <p v-if="screens.status.value === 'success' && links.status.value === 'success' && !frames.length" class="tx-meta hint">{{ tr('No screens are linked to this document yet') }}</p>
      <p v-else-if="frames.length" class="tx-meta hint">{{ activeNote ? tr('Highlighted screens are what this note is about') : activeReq ? tr('Highlighted screens are linked to this policy') : tr('Click a policy to highlight its linked screens · drag the dot on a frame onto a policy row to link it') }}</p>
      <div class="frames">
        <div
          v-for="c in frames"
          :key="c.key"
          :data-col="c.key"
          :class="['frame-col', { lit: isLit(c), note: isNoteLit(c), dim: isDim(c), empty: !c.screen }]"
        >
          <button type="button" class="frame-btn" :aria-pressed="isLit(c)" :aria-label="c.screen ? tr('{name} · Policies: {n}', { name: c.name, n: reqCount(c.screen.id) }) : tr('{code} {name} · No design yet', { code: c.code ?? '', name: c.name })" @click="pickCol(c)">
            <span class="frame-label">
              <span v-if="c.code" class="sq sid num">{{ c.code }}</span>
              <span class="ellipsis">{{ c.name }}</span>
              <StatusIcon v-if="c.screen && activeLinks.get(c.screen.id)" :status="activeLinks.get(c.screen.id)!.status" :size="10" />
              <span v-if="c.screen && pinCount(c.screen.id)" class="sq npin num" :title="tr('Notes')">{{ pinCount(c.screen.id) }}</span>
            </span>
            <span v-if="c.screen" class="frame" aria-hidden="true">
              <span class="f-status" />
              <span class="f-title">{{ c.name }}</span>
              <span class="f-body">
                <span class="sqc f-bar" />
                <span class="sq f-card" />
                <span class="sq f-card" />
                <span class="sq f-card" />
              </span>
              <span class="sqc f-cta" />
            </span>
            <span v-else class="frame noframe">
              <b>{{ tr('No design yet') }}</b>
              <span class="tx-meta">{{ tr('Import from Figma or draw a frame, then link it to this slot') }}</span>
            </span>
            <span class="frame-page">{{ c.page || (c.slot?.states.length ? tr('States: {list}', { list: c.slot.states.join(', ') }) : '') }}</span>
          </button>
          <!-- 끌어서 연결 점 -->
          <button v-if="c.screen && !editing" type="button" class="link-dot" :aria-label="tr('Drag onto a policy row to link {name}', { name: c.name })" :title="tr('Drag onto a policy row to link')" @pointerdown="startLinkDrag(c, $event)" />
        </div>
      </div>
    </main>

    <!-- 끌어서 연결 중: 점선 + 놓을 곳 -->
    <svg v-if="drag" class="drag-line" aria-hidden="true">
      <path :d="`M ${drag.x0} ${drag.y0} C ${(drag.x0 + drag.x) / 2} ${drag.y0}, ${(drag.x0 + drag.x) / 2} ${drag.y}, ${drag.x} ${drag.y}`" />
      <circle :cx="drag.x" :cy="drag.y" r="4" />
    </svg>
    <span v-if="drag" class="sq drag-chip" :style="{ left: drag.x + 12 + 'px', top: drag.y + 12 + 'px' }">{{ drag.over ? tr('Link to {code}', { code: drag.over.code }) : tr('Drop on a policy row') }}</span>

    <!-- 오른쪽: 문서 -->
    <aside :aria-label="tr('Document')" :class="['sq', 'float', 'doc', { wide: notesShown }]">
      <div class="doc-tabs">
        <nav ref="tabsEl" class="seg tabs" :aria-label="tr('Choose a document')">
          <NuxtLink
            v-for="d in docs.data.value ?? []"
            :key="d.id"
            :to="`/p/${projectId}/docs/${d.id}`"
            replace
            :aria-current="d.id === docId ? 'page' : undefined"
            :class="['sq', 'seg-item', 'tab', { on: d.id === docId }]"
            :title="d.title"
          >
            <span class="dicon" :data-tip="tr(DOC_SOURCE_TIP[d.source_type])"><EditorIcon :name="docIcon(d)" :size="12" /></span>
            <span class="ellipsis">{{ d.title }}</span>
          </NuxtLink>
        </nav>
        <IconButton icon-name="plus" size="s" type="ghost" :ariaLabel="tr('Add document')" :title="tr('Add document')" @click="addOpen = true" />
        <IconButton icon-name="close" size="s" type="ghost" :ariaLabel="tr('Close document')" :title="tr('Close document')" @click="navigateTo(`/p/${projectId}`)" />
      </div>

      <div class="doc-main">
      <!-- 떠 있는 얇은 스크롤 막대: 기본 스크롤바가 자리를 차지하지 않아 내용이 길어져도 폭이 그대로(사용자 요청 2026-11-27) -->
      <div v-ovscroll class="doc-body">
        <div v-if="docs.status.value === 'pending' && !docs.data.value?.length" class="loading">
          <Skeleton shape="text" width="60%" />
          <Skeleton shape="text" />
          <Skeleton shape="text" width="80%" />
        </div>
        <div v-else-if="!doc" class="missing">
          <h1 class="tx-title">{{ tr('Document not found') }}</h1>
          <p class="tx-meta">{{ tr('It may have been deleted, or its address changed') }}</p>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="chevron_left" @click="navigateTo(`/p/${projectId}`)">{{ tr('Back to editor') }}</Button>
        </div>
        <DocEditor
          v-else-if="editing"
          v-model:dirty="dirty"
          :doc="doc"
          :doc-reqs="docReqs"
          :all-reqs="reqs.data.value ?? []"
          @cancel="cancelEdit"
          @saved="onSaved"
        />
        <DocHistory v-else-if="histOpen" :project-id="projectId" :doc="doc" :can-restore="doc.source_type === 'native' || !!doc.content_blocks?.length" @close="histOpen = false" @restore="restoreDoc" />
        <div v-else class="read-main">
          <DocCheckBar :doc="doc" @go="goBlock" @edit="startEdit" />
          <div v-if="goneReqs.length" class="sq gone" role="status">
            <span class="gone-col">
              <span class="tx-body gone-t">
                {{ tr('No longer in the document:') }}
                <button v-for="r in goneReqs" :key="r.id" type="button" class="sq code num" :aria-pressed="activeReq === r.id" @click="pickReq(r.id)">{{ r.code }}</button>
              </span>
              <span class="tx-meta">{{ tr('These policies and their screen links were kept. Clean up any you don’t need in {link}.').split('{link}')[0] }}<NuxtLink :to="`/requirements?p=${projectId}`" class="lnk">{{ tr('Policies') }}</NuxtLink>{{ tr('These policies and their screen links were kept. Clean up any you don’t need in {link}.').split('{link}')[1] }}</span>
            </span>
            <button type="button" class="ib s" :aria-label="tr('Dismiss')" @click="gone = []"><EditorIcon name="close" :size="14" /></button>
          </div>
          <DocReader
            ref="reader"
            :doc="doc"
            :reqs="docReqs"
            :highlight="activeReq ?? noteReqId"
            :linked="links.status.value === 'success' ? [...new Set((links.data.value ?? []).map((l) => l.requirement_id))] : null"
            @pick-req="pickReq"
            @pick-slot="pickSlot"
            @create-req="createReq"
            @comment="onComment"
            removable
            @remove-req="(r: ReqRow) => (confirmReq = r)"
            @edit="startEdit"
          >
            <template #actions>
              <!-- Notes · Edit: 같은 디자인 시스템 테두리 버튼. 메모 칸이 열려 있으면 Notes 는 눌린 상태 -->
              <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="comment" :aria-pressed="notesOpen" :data-force-state="notesOpen ? 'pressed' : undefined" :data-tip="notesOpen ? tr('Hide notes') : tr('Show notes beside the document')" @click="toggleNotes">{{ noteCount ? tr('Notes {n}', { n: noteCount }) : tr('Notes') }}</Button>
              <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="pencil" @click="startEdit">{{ tr('Edit') }}</Button>
              <div ref="moreEl" class="more">
                <IconButton
                  icon-name="menu_kebab"
                  size="s"
                  type="ghost"
                  :ariaLabel="tr('Document menu')"
                  aria-haspopup="menu"
                  :aria-expanded="menuOpen"
                  @click="menuOpen = !menuOpen"
                  @keydown.esc="menuOpen = false"
                />
                <div v-if="menuOpen" class="sq menu" role="menu" @keydown.esc="menuOpen = false">
                  <button type="button" role="menuitem" class="sq menu-item" @click="menuOpen = false; histOpen = true"><EditorIcon name="clock" :size="14" />{{ tr('History') }}</button>
                  <button type="button" role="menuitem" class="sq menu-item danger" @click="askDelete"><EditorIcon name="trashbin" :size="14" />{{ tr('Delete document') }}</button>
                </div>
              </div>
            </template>
          </DocReader>
          <DocNotes part="board" :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @toast="say" />
        </div>
      </div>
      <!-- 문서 옆 메모(Word 노트처럼): 스크롤 밖 열 — 문서와 사이에 위아래 긴 구분선, 열고 닫을 때 폭이 부드럽게 -->
      <div :class="['notes-col', { open: notesShown }]" :aria-hidden="!notesShown || undefined" :inert="!notesShown || undefined">
        <div v-ovscroll class="notes-in">
          <DocNotes v-if="doc" ref="notesRef" v-model:active="activeNote" v-model:draft="noteDraft" part="notes" :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @go="goAnchor" @toast="say" @close="toggleNotes" />
        </div>
      </div>
      </div>

      <!-- 확인: 공용 확인 팝업(AppConfirm · 프로필 편집 창 양식) — 아래 줄로 띄우지 않아요(사용자 요청 2026-11-27) -->
      <AppConfirm
        v-if="confirmReq"
        :title="tr('Delete policy {code}?', { code: confirmReq.code })"
        :desc="tr('Its screen links are deleted too. This can’t be undone.')"
        :actions="[{ label: tr('Cancel'), onClick: () => (confirmReq = null) }, { label: tr('Delete'), kind: 'destructed', loading: removingReq, onClick: doRemoveReq }]"
        @close="confirmReq = null"
      />
      <AppConfirm
        v-else-if="bar === 'leave'"
        :title="tr('Discard unsaved changes?')"
        :desc="tr('You have unsaved changes. Discard them and leave?')"
        :actions="[{ label: tr('Keep editing'), onClick: closeBars }, { label: tr('Discard'), kind: 'destructed', onClick: discard }]"
        @close="closeBars"
      />
      <AppConfirm
        v-else-if="bar === 'delete' && doc"
        :title="tr('Delete “{name}”?', { name: doc.title })"
        :desc="tr('Its policies and screen links will be deleted too. This can’t be undone.')"
        :closable="!deleting"
        :actions="[{ label: tr('Cancel'), onClick: closeBars }, { label: tr('Delete'), kind: 'destructed', loading: deleting, onClick: removeDoc }]"
        @close="closeBars"
      />

      <p class="sr" role="status" aria-live="polite">{{ notice }}</p>
    </aside>

    <!-- 알림: 편집기 캔버스 알림과 같은 규격(높이 40 · 검정 · 테두리 · 그림자) — 왼쪽 캔버스 아래 가운데 -->
    <div :class="['toast-wrap', { wide: notesShown }]" aria-hidden="true">
      <Transition name="fade"><p v-if="notice" class="sq toast">{{ notice }}</p></Transition>
    </div>

    <AddDocModal v-model:open="addOpen" :project-id="projectId" />
  </div>
</template>

<style scoped>
.split { position: relative; height: calc(100vh - var(--iris-tabs-h, 0px)); overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pill { position: absolute; left: var(--iris-gap); top: var(--iris-gap); z-index: 3; height: 40px; max-width: calc(100% - 640px); box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-10) 0 var(--ref-spacing-04); }
.crumb { border-radius: var(--ref-radius-02); transition: color .12s ease; }
.crumb:hover { color: var(--sys-color-neutral-800); }
.crumb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.pill .tx-head { white-space: nowrap; }

.canvas { position: absolute; inset: 0; overflow: auto; padding: 64px 632px 48px 48px; box-sizing: border-box; }
.canvas { transition: padding-right .24s cubic-bezier(0.2, 0, 0, 1); }
.canvas.wide { padding-right: 912px; }
.hint { margin: 0 0 var(--ref-spacing-12); }
.frames { display: flex; flex-wrap: wrap; gap: 32px 44px; }
.frame-col { position: relative; width: 176px; flex: none; transition: opacity .15s; }
.frame-btn { display: flex; flex-direction: column; gap: var(--ref-spacing-06); width: 100%; text-align: left; }
.frame-btn:focus-visible { outline: none; }
.frame-btn:focus-visible .frame { outline: 1.5px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.frame-col.dim { opacity: .55; }
.frame-label { display: flex; align-items: center; gap: var(--ref-spacing-04); font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.frame-col.lit .frame-label { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.frame-page { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-400); }
/* 375 × 812 화면을 176 폭으로 줄인 틀 (썸네일 전까지 자리만) */
/* 화면 틀 = 캔버스 프레임: 편집기 캔버스처럼 모서리 없이(캔버스는 squircle 예외) — 강조 테두리도 각지게 */
.frame { position: relative; display: block; width: 176px; height: 381px; border-radius: 0; overflow: hidden; background: var(--iris-paper); box-shadow: var(--shadow-01); outline: 1px solid var(--iris-line); }
.frame-btn:hover .frame { outline-color: var(--ref-color-gray-900-20); }
.frame-col.lit .frame { outline: 1.5px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.frame-col.note .frame { outline: 2px solid #E8C14A; outline-offset: 2px; box-shadow: 0 0 0 6px rgb(232 193 74 / 22%); }
.noframe { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-10); text-align: center; background: transparent; box-shadow: none; outline: 1.5px dashed var(--iris-line-strong); font-size: 12px; color: var(--sys-color-neutral-700); }
.noframe b { font-weight: 600; }
.frame-label .sid { flex: none; display: inline-flex; align-items: center; height: 16px; padding: 0 3px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }
.npin { flex: none; display: inline-flex; align-items: center; height: 16px; padding: 0 4px; border-radius: 8px 8px 8px 2px; font-size: 10px; font-weight: 600; color: #8A6100; --sq-fill: #FFF1C2; }
/* 점 중심이 화면 테두리 선 위에 오게: 기본 선(1px · 바깥 0) 가운데 0.5px, 고른 화면 선(1.5px · 바깥 2px) 가운데 2.75px */
.link-dot { position: absolute; right: -6.5px; top: 210px; width: 12px; height: 12px; border-radius: 50%; background: var(--sys-color-common-white-default); box-shadow: 0 0 0 1.5px var(--iris-peek); cursor: crosshair; opacity: 0; transition: opacity .12s, transform .12s; }
.frame-col:hover .link-dot, .link-dot:focus-visible { opacity: 1; }
.frame-col.lit .link-dot { right: -8.75px; }
.frame-col.note .link-dot { right: -9px; }
.link-dot:hover { transform: scale(1.25); background: var(--iris-peek); }
.drag-line { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 20; pointer-events: none; overflow: visible; }
.drag-line path { fill: none; stroke: var(--iris-peek); stroke-width: 2; stroke-dasharray: 6 4; }
.drag-line circle { fill: var(--iris-peek); }
.drag-chip { position: fixed; z-index: 21; pointer-events: none; height: 24px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-size: 12px; font-weight: 500; white-space: nowrap; }
.split :deep(.drop-on) td, .split :deep(.drop-on.blk) { background: color-mix(in srgb, var(--iris-peek) 12%, transparent) !important; }
.split :deep(.drop-on) td:first-child { box-shadow: inset 2px 0 0 var(--iris-peek); }
.split :deep(.flash) { animation: flash 1.4s ease; }
@keyframes flash { 0%, 40% { background: #FFF1C2; } 100% { background: transparent; } }
/* 메모 칸 열고 닫기: 사이드바와 같은 0.24초 곡선으로 패널 폭과 메모 열 폭이 같이 바뀌어요(문서 폭은 그대로) */
.doc { transition: width .24s cubic-bezier(0.2, 0, 0, 1); }
.doc.wide { width: 880px; }
.doc-main { flex: 1; min-height: 0; display: flex; }
.doc-main > .doc-body { flex: 1; min-width: 0; }
.notes-col { position: relative; z-index: 0; flex: none; width: 0; overflow: hidden; display: flex; transition: width .24s cubic-bezier(0.2, 0, 0, 1); }
.notes-col.open { width: 280px; }
/* 위아래 긴 구분선: 맨 위 층에 따로 그려서 메모 머리 막대(흰 바탕)가 덮지 않게 */
.notes-col::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 1px; background: var(--iris-line); z-index: 3; pointer-events: none; }
.notes-in { --notes-pad-t: var(--ref-spacing-10); --notes-pad-x: var(--ref-spacing-10); width: 280px; flex: none; overflow: auto; box-sizing: border-box; padding: var(--notes-pad-t) var(--notes-pad-x) var(--ref-spacing-08); margin-bottom: var(--ref-spacing-12); }
@media (prefers-reduced-motion: reduce) { .doc, .notes-col, .canvas { transition: none; } }
.read-main { flex: 1; min-width: 0; }
.hbtn { display: inline-flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); font-size: 12px; color: var(--sys-color-neutral-700); white-space: nowrap; }
.hbtn:hover { --sq-fill: var(--sys-color-neutral-100); }
.hbtn.on { color: #8A6100; --sq-fill: #FFF6DA; }
.hcount { min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: #E8C14A; color: #FFFFFF; font-size: 10px; font-weight: 600; }
.hbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.f-status { display: block; height: 26px; }
.f-title { display: block; padding: 0 9px 10px; font-size: 11px; line-height: 16px; font-weight: 600; color: #03091A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f-body { display: flex; flex-direction: column; gap: 6px; padding: 0 9px; }
.f-bar { height: 22px; border-radius: 6px; background: #F6F7F7; }
.f-card { display: block; height: 54px; border-radius: 8px; --sq-line: var(--iris-paper-line); --sq-line-w: 1px; }
.f-cta { position: absolute; left: 9px; right: 9px; bottom: 11px; height: 24px; border-radius: 6px; background: #2C7BE2; }

.doc { position: absolute; right: var(--iris-gap); top: var(--iris-gap); bottom: var(--iris-gap); z-index: 3; width: 600px; max-width: calc(100% - 16px); display: flex; flex-direction: column; overflow: hidden; }
/* z-index 2: 아래 선(그림자 1px)이 메모 칸 위 막대에 덮이지 않게 */
.doc-tabs { position: relative; z-index: 2; flex: none; display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-06); box-shadow: 0 1px 0 var(--iris-line); }
/* 가로로만 넘기고 세로로는 움직이지 않게(높이 고정) */
.tabs { flex: 1; min-width: 0; height: 28px; overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab { max-width: 168px; }
.dicon { flex: none; display: inline-flex; }
/* 안쪽 여백: 위 16 · 좌우 24 · 아래 32(예전 32 · 40 · 48 이 너무 넓다는 요청 2026-11-27). 편집 위 막대도 이 값을 따라요 */
/* 아래도 좌우 여백(24)만큼 비워 두고 스크롤 영역은 그 위에서 끝나요 — 내용이 패널 바닥까지 흘러 보이지 않게(사용자 요청 2026-11-27) */
/* position · z-index 0: 안쪽 층(분류 버튼 z 1 등)을 이 칸 안에 가둬요 — 위 막대(z 2)가 늘 위, 패널 테두리(z 1)는 이 칸 위 */
.doc-body { position: relative; z-index: 0; --doc-pad-t: var(--ref-spacing-10); --doc-pad-x: var(--ref-spacing-12); flex: 1; min-height: 0; overflow: auto; padding: var(--doc-pad-t) var(--doc-pad-x) var(--ref-spacing-08); margin-bottom: var(--doc-pad-x); }
.loading { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.missing { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); }
.missing p { margin: 0 0 var(--ref-spacing-04); }

.more { position: relative; }
.more .menu { left: auto; right: 0; width: max-content; min-width: 120px; }
.danger { color: var(--sys-color-theme-error-default); }
.lnk { color: var(--sys-color-brand-primary-default); font-weight: 600; border-radius: var(--ref-radius-02); }
.lnk:hover { text-decoration: underline; }
.lnk:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }

.gone { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); margin-bottom: var(--ref-spacing-10); padding: var(--ref-spacing-07) var(--ref-spacing-06) var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); }
.gone-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gone-t { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-04); font-weight: 500; }
.ib.s { width: 24px; height: 24px; }
.code { display: inline; padding: 0 2px; border-radius: 3px; font-size: 12px; font-weight: 600; color: var(--sys-color-brand-primary-default); --sq-fill: var(--sys-color-brand-primary-lightest); }
.code:hover, .code[aria-pressed='true'] { --sq-fill: var(--sys-color-brand-primary-lighter); }
.code:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }


/* 편집기(pages/p/[projectId]/index.vue)의 .toast 와 같은 모양 — 문서 패널을 뺀 캔버스 영역 아래 가운데 */
.toast-wrap { position: absolute; left: 0; right: calc(600px + var(--iris-gap) * 2); bottom: 32px; z-index: 6; display: flex; justify-content: center; pointer-events: none; transition: right .24s cubic-bezier(0.2, 0, 0, 1); font-size: 12px; line-height: 18px; }
.toast-wrap.wide { right: calc(880px + var(--iris-gap) * 2); }
.toast { display: flex; align-items: center; height: 40px; box-sizing: border-box; margin: 0; padding: 0 var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--iris-black); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--iris-paper); font-weight: 500; white-space: nowrap; filter: var(--iris-float-shadow); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
