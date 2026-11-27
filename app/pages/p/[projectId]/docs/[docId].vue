<script setup lang="ts">
import { Button, IconButton, Skeleton } from '@ba-dream/design-system'
import DocReader, { flashWarnAt } from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import DocEditor from '~/components/docs/DocEditor.vue'
import DocCheckBar from '~/components/docs/DocCheckBar.vue'
import DocNotes, { type DocAnchor } from '~/components/docs/DocNotes.vue'
import DocHistory from '~/components/docs/DocHistory.vue'
import type { DocBlock, DocRow, LinkRow, ProjectScreen, ReqRow, SlotRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import ScreenThumb from '~/components/editor/ScreenThumb.vue'
import { migrate } from '~/canvas/schema'

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
const { addRequirement, removeRequirement, linkMany, setLink, removeLink, syncDocFormat, addHistory } = useIrisMutations()
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
/** 고른 요소(화면 안 레이어) — 그 요소에 연결된 정책들로 선을 그어요 */
const activeLayer = ref<{ screen: string; layer: string } | null>(null)
watch(docId, () => { activeReq.value = null; activeScreen.value = null; activeLayer.value = null; editing.value = false; dirty.value = false; gone.value = []; closeBars() })
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
  if (c.screen && (activeLinks.value.has(c.screen.id) || activeScreen.value === c.screen.id || activeLayer.value?.screen === c.screen.id || noteScreens.value.has(c.screen.id))) return true
  if (activeCol.value === c.key) return true
  return !!activeCode.value && !!c.slot?.policy_codes.includes(activeCode.value)
}
const isNoteLit = (c: Col) => !!c.screen && noteScreens.value.has(c.screen.id)
const isDim = (c: Col) => (!!activeReq.value || !!activeScreen.value || !!activeLayer.value || !!activeCol.value || !!activeNote.value) && !isLit(c)
watch(activeNote, (v) => { if (v) { activeReq.value = null; activeScreen.value = null; activeLayer.value = null; activeCol.value = null } })
/** 문서에서 화면 ID(C-05)를 누르면 그 화면 칸으로 */
function pickSlot(code: string) {
  const c = frames.value.find((x) => x.slot?.code === code)
  if (!c) { say(tr('{code} isn’t a screen slot in this document', { code })); return }
  activeReq.value = null
  activeScreen.value = null
  activeLayer.value = null
  activeNote.value = null
  activeCol.value = c.key
  nextTick(() => focusCols([c.key]))
}
function pickCol(c: Col) {
  activeCol.value = null
  activeLayer.value = null
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
/** x · y = 놓을 끝(정책 줄 위면 그 줄 왼쪽 가장자리에 붙어요), cx · cy = 커서 */
const drag = ref<{ screen: ProjectScreen; layer: string | null; x0: number; y0: number; x: number; y: number; cx: number; cy: number; over: ReqRow | null } | null>(null)
let dropEl: Element | null = null
function startLinkDrag(c: Col, e: PointerEvent, layer: string | null = null) {
  if (!c.screen) return
  e.preventDefault()
  e.stopPropagation()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  drag.value = { screen: c.screen, layer, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, over: null }
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
  drag.value.cx = e.clientX
  drag.value.cy = e.clientY
  const hit = reqAt(e.clientX, e.clientY)
  if (dropEl !== hit?.el) { dropEl?.classList.remove('drop-on'); dropEl = hit?.el ?? null; dropEl?.classList.add('drop-on') }
  drag.value.over = hit?.req ?? null
  // 정책 줄 위면 선 끝을 그 줄 왼쪽 가장자리(문서 쪽 동그라미)에 붙여요(사용자 요청 2026-11-27)
  const rr = hit?.el.getBoundingClientRect()
  drag.value.x = rr ? rr.left : e.clientX
  drag.value.y = rr ? rr.top + rr.height / 2 : e.clientY
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
  // 요소(레이어)에서 끌었으면 그 요소만 연결(layer_ids) — 화면에서 끌었으면 화면 전체
  const name = d.layer ? `${d.screen.name} · ${layerName(d.screen.id, d.layer)}` : d.screen.name
  const ex = docLinks.value.find((l) => l.screen_id === d.screen.id && l.requirement_id === req.id)
  if (ex && (d.layer ? (ex.layer_ids ?? []).includes(d.layer) : true)) { say(tr('{code} is already linked to {name}', { code: req.code, name })); return }
  try {
    await linkMany([{ screen_id: d.screen.id, requirement_id: req.id, ...(d.layer ? { layer_ids: [d.layer] } : {}) }], links.data.value ?? [])
    await links.refresh()
    activeScreen.value = null
    activeLayer.value = null
    activeReq.value = req.id
    say(tr('Linked {code} to {name}', { code: req.code, name }))
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
/** 문서의 블록 · 표 행으로 스크롤(메모 자리) */
function goBlock(at: { block: string; row: number | null }) {
  const root = reader.value?.root
  const blockEl = root?.querySelector(`[data-block="${at.block}"]`)
  const el = (at.row ? blockEl?.querySelector(`tr[data-row="${at.row}"]`) : null) ?? blockEl
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1400)
}
/** 고른 문서 탭을 탭 줄 가운데로 부드럽게 넘겨요(사용자 요청 2026-11-27) */
const tabsEl = ref<HTMLElement | null>(null)
/** 문서를 바꾸면 이 화면이 새로 그려져서, 탭 줄 스크롤 위치를 기억해 두고 그 자리에서 부드럽게 넘겨요(사용자 요청 2026-11-27) */
const tabsScroll = useState(`doc-tabs-scroll-${projectId}`, () => 0)
function onTabsScroll() { if (tabsEl.value) tabsScroll.value = tabsEl.value.scrollLeft }
function revealTab(smooth = true) {
  nextTick(() => {
    const nav = tabsEl.value
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) return
    // 고른 탭을 탭 줄 가운데로(맨 앞 · 맨 뒤 탭처럼 가운데까지 못 오는 건 끝에 붙어요 — 사용자 요청 2026-11-27)
    const left = el.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft
    const to = Math.min(Math.max(0, left + el.offsetWidth / 2 - nav.clientWidth / 2), nav.scrollWidth - nav.clientWidth)
    if (Math.abs(to - nav.scrollLeft) > 1) nav.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' })
  })
}
watch(docId, () => revealTab())
watch(() => docs.data.value?.length, () => revealTab(false))
onMounted(() => {
  if (tabsEl.value) tabsEl.value.scrollLeft = tabsScroll.value
  revealTab(true)
})
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
  activeLayer.value = null
  activeReq.value = activeReq.value === id ? null : id
  if (!activeReq.value) return
  nextTick(() => {
    const code = activeCode.value
    focusCols(frames.value.filter((c) => (c.screen && activeLinks.value.has(c.screen.id)) || (!!code && !!c.slot?.policy_codes.includes(code))).map((c) => c.key))
  })
}

function pickScreen(id: string) {
  // 화면을 누르면 그 화면과 연결된 첫 요구사항으로 문서를 옮깁니다
  const first = docReqs.value.find((r) => docLinks.value.some((l) => l.screen_id === id && l.requirement_id === r.id))
  activeScreen.value = id
  activeLayer.value = null
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

/**
 * 연결 선(사용자 요청 2026-11-27): 정책을 고르면 그 정책 ↔ 연결된 화면들, 화면을 고르면 그 화면 ↔ 연결된 정책들을 선으로 이어 보여요.
 * 양 끝에 동그라미(화면 오른쪽 점 · 정책 줄 왼쪽 가장자리). 스크롤 · 패널 움직임을 따라가도록 고른 동안 매 프레임 자리를 다시 재요.
 * 한쪽 끝이 보이는 영역 밖(문서 · 캔버스 스크롤 밖)이면 그 선은 숨겨요
 */
type LinkLine = { key: string; col: string; screen: string; req: string; layer: string | null; x1: number; y1: number; x2: number; y2: number }
const linkLines = ref<LinkLine[]>([])
type LinePair = { col: string; req: string; layer: string | null }
/** 연결 하나 → 선(요소에 연결됐으면 요소마다, 아니면 화면에서) */
const pairsOf = (col: string, l: LinkRow): LinePair[] => (l.layer_ids?.length ? l.layer_ids.map((layer) => ({ col, req: l.requirement_id, layer })) : [{ col, req: l.requirement_id, layer: null }])
const linePairs = computed<LinePair[]>(() => {
  if (drag.value || editing.value || activeNote.value) return []
  const out: LinePair[] = []
  const al = activeLayer.value
  if (al) {
    const c = frames.value.find((x) => x.screen?.id === al.screen)
    if (c) for (const l of docLinks.value) if (l.screen_id === al.screen && l.layer_ids?.includes(al.layer)) out.push({ col: c.key, req: l.requirement_id, layer: al.layer })
  } else if (activeScreen.value) {
    const c = frames.value.find((x) => x.screen?.id === activeScreen.value)
    if (c) for (const l of docLinks.value) if (l.screen_id === activeScreen.value) out.push(...pairsOf(c.key, l))
  } else if (activeReq.value) {
    for (const c of frames.value) { const l = c.screen ? activeLinks.value.get(c.screen.id) : null; if (l) out.push(...pairsOf(c.key, l)) }
  }
  return out
})
let lineRaf = 0
function measureLines() {
  lineRaf = 0
  const pairs = linePairs.value
  measureSel()
  if (!pairs.length && !activeLayer.value) { if (linkLines.value.length) linkLines.value = []; return }
  const cv = canvas.value?.getBoundingClientRect()
  const body = document.querySelector('.split .doc-body')?.getBoundingClientRect()
  const docLeft = document.querySelector('.split .doc')?.getBoundingClientRect().left ?? Infinity
  const root = reader.value?.root as HTMLElement | null | undefined
  const out: LinkLine[] = []
  for (const p of pairs) {
    // 선은 요소(없으면 화면) 상하좌우 가운데 점 가운데 정책 줄에 가장 가까운 점에서 나가요
    const col = canvas.value?.querySelector(`[data-col="${p.col}"]`)
    const lel = p.layer ? col?.querySelector(`.sthumb [data-layer="${p.layer}"]`) : null
    const raw = (lel ?? col?.querySelector('.frame'))?.getBoundingClientRect()
    const k = lel ? 0 : ringOf(frames.value.find((x) => x.key === p.col))
    const src = raw ? new DOMRect(raw.x - k, raw.y - k, raw.width + k * 2, raw.height + k * 2) : null
    const row = root?.querySelector(`[data-reqs~="${p.req}"]`)?.getBoundingClientRect()
    if (!src || !row || !cv || !body) continue
    const x2 = row.left, y2 = row.top + row.height / 2
    const [x1, y1] = nearestSide(src, x2, y2)
    if (x1 < cv.left || x1 > Math.min(cv.right, docLeft) || y1 < cv.top || y1 > cv.bottom) continue
    if (y2 < body.top || y2 > body.bottom) continue
    out.push({ key: p.col + '|' + p.req + '|' + (p.layer ?? ''), col: p.col, screen: frames.value.find((x) => x.key === p.col)?.screen?.id ?? '', req: p.req, layer: p.layer, x1, y1, x2, y2 })
  }
  const same = out.length === linkLines.value.length && out.every((l, i) => { const o = linkLines.value[i]!; return o.key === l.key && Math.abs(o.x1 - l.x1) < 0.5 && Math.abs(o.y1 - l.y1) < 0.5 && Math.abs(o.x2 - l.x2) < 0.5 && Math.abs(o.y2 - l.y2) < 0.5 })
  if (!same) linkLines.value = out
  lineRaf = requestAnimationFrame(measureLines)
}
watch([linePairs, activeLayer], ([p, al]) => {
  if (!import.meta.client) return
  cancelAnimationFrame(lineRaf)
  lineRaf = 0
  if (p.length || al) nextTick(() => { lineRaf = requestAnimationFrame(measureLines) })
  else { linkLines.value = []; selBox.value = null }
})
// 처음 열 때 이미 고른 정책(?req=)이 있으면 바로 그려요 — watch immediate 는 아래쪽에 선언된 editing 을 너무 일찍 읽어서 onMounted 로
onMounted(() => { if (linePairs.value.length) lineRaf = requestAnimationFrame(measureLines) })
onBeforeUnmount(() => cancelAnimationFrame(lineRaf))
/** 상자의 상하좌우 가운데 점 가운데 (x, y) 에 가장 가까운 점 */
function nearestSide(r: DOMRect, x: number, y: number): [number, number] {
  const pts: [number, number][] = [[r.left + r.width / 2, r.top], [r.right, r.top + r.height / 2], [r.left + r.width / 2, r.bottom], [r.left, r.top + r.height / 2]]
  return pts.reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a))
}

/**
 * 실제 화면 그리기 + 요소 단위 연결(사용자 요청 2026-11-27): 화면 칸에 편집기와 같은 축소 화면(ScreenThumb)을 그리고,
 * 요소(도형 · 프레임 · 글 무엇이든)나 화면에 마우스를 올리면 그 상하좌우 가운데에 동그라미 4개 — 끌어서 정책 줄에 놓으면 그 요소만 연결돼요.
 * 요소를 지우고 새로 그렸으면 새 요소를 다시 연결하면 돼요
 */
type ArtScreen = { id: string; source: 'figma' | 'native'; x: number; y: number; width: number; height: number; thumbnail_path: string | null; layers: unknown }
const artIds = computed(() => frames.value.flatMap((c) => (c.screen ? [c.screen.id] : [])).sort().join(','))
const art = useAsyncData(`split-art-${projectId}`, async () => {
  const ids = artIds.value ? artIds.value.split(',') : []
  if (!ids.length) return {} as Record<string, ArtScreen>
  if (preview) {
    return Object.fromEntries(Object.values(PREVIEW_SCREENS).flat().filter((x) => ids.includes(x.id)).map((x) => [x.id, { id: x.id, source: x.source, x: x.x, y: x.y, width: x.width, height: x.height, thumbnail_path: x.thumbnail_path ?? null, layers: x.layers ?? null }])) as Record<string, ArtScreen>
  }
  const { data, error } = await supabase.from('screens').select('id, source, x, y, width, height, thumbnail_path, layers').in('id', ids)
  if (error) throw error
  return Object.fromEntries(((data ?? []) as ArtScreen[]).map((x) => [x.id, x])) as Record<string, ArtScreen>
}, { server: false, watch: [artIds], default: () => ({}) as Record<string, ArtScreen> })
const artDocs = computed(() => new Map(Object.values(art.data.value ?? {}).map((x) => [x.id, migrate(x.layers)])))
/** 그릴 게 있는 화면: Iris 화면은 레이어가 있을 때, 피그마 화면은 썸네일이 있을 때 */
function artOf(screenId: string): ArtScreen | null {
  const a = art.data.value?.[screenId]
  if (!a) return null
  if (a.source === 'figma') return a.thumbnail_path ? a : null
  return (artDocs.value.get(screenId)?.rootIds.length ?? 0) > 0 ? a : null
}
const layerName = (screenId: string, layerId: string) => artDocs.value.get(screenId)?.nodes[layerId]?.name ?? tr('Layer')

type Box = { col: string; layer: string | null; x: number; y: number; w: number; h: number }
const hover = ref<Box | null>(null)
const selBox = ref<Box | null>(null)
const SIDES = ['top', 'right', 'bottom', 'left'] as const
/** 칸 안 상자 → 동그라미 자리(상하좌우 가운데) */
/** 화면 테두리(외곽선) 두께 가운데까지 바깥으로: 기본 1px(0.5) · 고름 1.5px + 띄움 2(2.75) · 메모 2px + 띄움 2(3) — 동그라미가 선 한가운데 오게(사용자 요청 2026-11-27) */
const ringOf = (c: Col | undefined) => (!c ? 0 : isNoteLit(c) ? 3 : isLit(c) ? 2.75 : 0.5)
function dotAt(b: Box, side: (typeof SIDES)[number]) {
  const k = b.layer ? 0 : ringOf(frames.value.find((x) => x.key === b.col))
  const x = side === 'left' ? b.x - k : side === 'right' ? b.x + b.w + k : b.x + b.w / 2
  const y = side === 'top' ? b.y - k : side === 'bottom' ? b.y + b.h + k : b.y + b.h / 2
  return { left: x + 'px', top: y + 'px' }
}
const boxStyle = (b: Box) => ({ left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
/** 커서 아래 가장 안쪽 요소(축소 화면은 누르기가 꺼져 있어서 자리로 찾아요) */
function layerAt(col: HTMLElement, x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null, depth = -1
  col.querySelectorAll<HTMLElement>('.sthumb [data-layer]').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || x < r.left || x > r.right || y < r.top || y > r.bottom) return
    let d = 0
    for (let p = el.parentElement; p && p !== col; p = p.parentElement) d++
    if (d >= depth) { best = el; depth = d }
  })
  return best
}
function onFrameHover(c: Col, e: PointerEvent) {
  if (!c.screen || editing.value || drag.value) return
  if ((e.target as Element | null)?.closest?.('.ldot')) return
  const col = e.currentTarget as HTMLElement
  const frame = col.querySelector('.frame')
  if (!frame) return
  const fr = frame.getBoundingClientRect()
  const inside = e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom
  const el = inside ? layerAt(col, e.clientX, e.clientY) : null
  const b = boxOf(c.key, el?.getAttribute('data-layer') ?? null, el ?? frame)
  const o = hover.value
  if (!o || o.col !== b.col || o.layer !== b.layer || Math.abs(o.x - b.x) > 0.5 || Math.abs(o.y - b.y) > 0.5 || Math.abs(o.w - b.w) > 0.5) hover.value = b
}
/** 화면 칸 누르기: 요소 위면 그 요소를, 아니면 화면을 골라요 */
function onFrameClick(c: Col) {
  const h = hover.value
  if (c.screen && h && h.col === c.key && h.layer) {
    const same = activeLayer.value?.screen === c.screen.id && activeLayer.value.layer === h.layer
    activeNote.value = null
    activeCol.value = null
    activeScreen.value = null
    activeReq.value = null
    activeLayer.value = same ? null : { screen: c.screen.id, layer: h.layer }
    const first = same ? null : docLinks.value.find((l) => l.screen_id === c.screen!.id && l.layer_ids?.includes(h.layer!))
    if (first) nextTick(() => reader.value?.scrollToReq(first.requirement_id))
    // 요소를 누르면 그 요소로 확대해 맞춰요(화면과 같게 — 사용자 요청 2026-11-27)
    if (!same) focusLayer(c.key, h.layer)
    return
  }
  pickCol(c)
  // 캔버스에서 화면을 눌러도 그 화면으로 확대해 맞춰요(사용자 요청 2026-11-27)
  focusCols([c.key])
}
watch(activeLayer, (v) => { if (!v) selBox.value = null })
/** 상자 자리는 캔버스(화면 좌표) 기준 — 동그라미 · 테두리는 확대와 상관없이 같은 크기로 캔버스 위 층에 그려요 */
function boxOf(col: string, layer: string | null, el: Element): Box {
  const r = el.getBoundingClientRect(), cr = canvas.value!.getBoundingClientRect()
  return { col, layer, x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }
}
function measureSel() {
  const al = activeLayer.value
  const c = al ? frames.value.find((x) => x.screen?.id === al.screen) : null
  const el = c && al ? canvas.value?.querySelector(`[data-col="${c.key}"] .sthumb [data-layer="${al.layer}"]`) : null
  const b = c && al && el ? boxOf(c.key, al.layer, el) : null
  const o = selBox.value
  if (!b) { if (o) selBox.value = null; return }
  if (!o || o.col !== b.col || o.layer !== b.layer || Math.abs(o.x - b.x) > 0.5 || Math.abs(o.y - b.y) > 0.5 || Math.abs(o.w - b.w) > 0.5 || Math.abs(o.h - b.h) > 0.5) selBox.value = b
}
const hoverCol = computed(() => (hover.value ? frames.value.find((x) => x.key === hover.value!.col) ?? null : null))
/** 화면 칸을 벗어나도 그 칸의 동그라미 위로 옮겨 가는 거면 동그라미를 그대로 둬요 */
function onColLeave(e: PointerEvent) {
  if ((e.relatedTarget as Element | null)?.closest?.('.ldot')) return
  hover.value = null
}
function onDotLeave(e: PointerEvent) {
  const t = e.relatedTarget as Element | null
  if (hover.value && t?.closest?.(`[data-col="${hover.value.col}"], .ldot`)) return
  hover.value = null
}

/**
 * 캔버스 보기(사용자 요청 2026-11-27): 편집기처럼 확대 · 이동(⌘/Ctrl + 휠 · 핀치 확대, 휠 · 빈 곳 끌기 이동, ⇧1 맞춰 보기 · ⇧0 100%).
 * 기본은 편집기에 놓인 자리 그대로(페이지가 여럿이면 페이지마다 묶어 옆으로), [ID 순서]를 켜면 화면 칸 순서(C-01, C-02 …)로 한 줄 — 디자인이 없는 칸도 보여요
 */
const idOrder = ref(false)
const view = ref({ x: 0, y: 0, z: 0.5 })
let userMoved = false
const FR_W = 390, FR_H = 844
type Placed = { c: Col; x: number; y: number; w: number; h: number }
const placed = computed<Placed[]>(() => {
  const size = (c: Col) => { const a = c.screen ? art.data.value?.[c.screen.id] : null; return { w: a?.width || FR_W, h: a?.height || FR_H } }
  if (idOrder.value) {
    // 종류(C · A · S · N · CMP)마다 한 줄 — 크기가 다른 화면(관리자 웹 · 긴 화면 · 알림 · 부품)이 한 줄에 섞여 너무 작아지지 않게(사용자 요청 2026-11-27)
    const out: Placed[] = []
    let y = 0
    for (const r of idRows.value) {
      let x = 0, rowH = 0
      for (const c of r.cols) { const { w, h } = size(c); out.push({ c, x, y, w, h }); x += w + 120; rowH = Math.max(rowH, h) }
      y += rowH + 600
    }
    return out
  }
  const groups = new Map<string, Col[]>()
  for (const c of frames.value) if (c.screen) { const g = groups.get(c.screen.page_id) ?? []; g.push(c); groups.set(c.screen.page_id, g) }
  const out: Placed[] = []
  let ox = 0
  for (const g of groups.values()) {
    const items = g.map((c) => { const a = art.data.value?.[c.screen!.id]; return { c, x: a?.x ?? 0, y: a?.y ?? 0, ...size(c) } })
    const minX = Math.min(...items.map((i) => i.x)), minY = Math.min(...items.map((i) => i.y)), maxX = Math.max(...items.map((i) => i.x + i.w))
    for (const i of items) out.push({ ...i, x: i.x - minX + ox, y: i.y - minY })
    ox += maxX - minX + 400
  }
  return out
})
const placedOf = (key: string) => placed.value.find((p) => p.c.key === key)
const KIND_ORDER = ['C', 'A', 'S', 'N', 'CMP', 'etc'] as const
const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = { C: 'Customer screens', A: 'Admin screens', S: 'Center screens', N: 'Notifications', CMP: 'Shared components', etc: 'Other linked screens' }
/** ID 순서 보기의 줄: 종류마다 칸 순서대로(문서 화면 표 순서) */
const idRows = computed(() => {
  const by = new Map<string, Col[]>()
  for (const c of frames.value) {
    const k = c.slot?.kind ?? 'etc'
    const g = by.get(k) ?? []
    g.push(c)
    by.set(k, g)
  }
  return KIND_ORDER.filter((k) => by.has(k)).map((k) => ({ kind: k, cols: by.get(k)! }))
})
/** ID 순서 보기 줄 이름(그 줄 첫 화면 위) */
const rowLabels = computed(() => (idOrder.value ? idRows.value.map((r) => { const p = placedOf(r.cols[0]!.key); return p ? { kind: r.kind, x: p.x, y: p.y, text: tr(KIND_LABEL[r.kind]) + (r.kind === 'etc' ? '' : ` · ${r.kind}`) } : null }).filter((x): x is { kind: (typeof KIND_ORDER)[number]; x: number; y: number; text: string } => !!x) : []))
/** 캔버스에서 문서 패널에 가리지 않는 영역(안쪽 여백 뺀 곳) */
function visibleArea() {
  const el = canvas.value
  if (!el) return null
  const cs = getComputedStyle(el)
  const L = parseFloat(cs.paddingLeft), R = parseFloat(cs.paddingRight), T = parseFloat(cs.paddingTop), B = parseFloat(cs.paddingBottom)
  return { L, T, w: Math.max(100, el.clientWidth - L - R), h: Math.max(100, el.clientHeight - T - B) }
}
let animTimer: ReturnType<typeof setTimeout> | undefined
const animView = ref(false)
function setView(v: { x: number; y: number; z: number }, animate = false) {
  hover.value = null
  if (animate) { animView.value = true; clearTimeout(animTimer); animTimer = setTimeout(() => { animView.value = false }, 260) }
  view.value = v
}
onBeforeUnmount(() => clearTimeout(animTimer))
/** keys 를 주면 그 화면들만 화면 가득(최대 100%) — 문서에서 정책 · 화면 ID 를 고를 때 캔버스처럼 그 화면으로 확대해 맞춰요(사용자 요청 2026-11-27) */
function fit(animate = false, keys?: string[]) {
  const a = visibleArea()
  const ps = keys ? placed.value.filter((p) => keys.includes(p.c.key)) : placed.value
  if (!a || !ps.length) return
  const bx = Math.min(...ps.map((p) => p.x)), by = Math.min(...ps.map((p) => p.y))
  const bw = Math.max(...ps.map((p) => p.x + p.w)) - bx, bh = Math.max(...ps.map((p) => p.y + p.h)) - by
  // 위 · 아래 이름 줄(화면 크기 그대로 그려져요) 자리를 화면 px 로 남겨 두고 맞춰요
  const top = idOrder.value && !keys ? 64 : 28, bottom = 28
  const z = Math.min(1, Math.max(0.02, Math.min(a.w / bw, (a.h - top - bottom) / bh)))
  setView({ z, x: a.L + (a.w - bw * z) / 2 - bx * z, y: a.T + top + (a.h - top - bottom - bh * z) / 2 - by * z }, animate)
}
/** 요소(레이어)로 확대해 맞추기: 둘레에 여유를 두고, 작은 요소가 너무 커지지 않게 최대 200% */
function focusLayer(col: string, layer: string) {
  const el = canvas.value?.querySelector(`[data-col="${col}"] .sthumb [data-layer="${layer}"]`)
  const a = visibleArea()
  if (!el || !a) return
  const r = el.getBoundingClientRect(), cr = canvas.value!.getBoundingClientRect()
  const { x, y, z } = view.value
  // 화면 좌표 → 캔버스(편집기) 좌표
  const wx = (r.left - cr.left - x) / z, wy = (r.top - cr.top - y) / z, ww = r.width / z, wh = r.height / z
  const pad = 0.2
  const k = Math.min(2, Math.max(0.05, Math.min(a.w * (1 - pad * 2) / ww, (a.h - 56) * (1 - pad * 2) / wh)))
  userMoved = true
  setView({ z: k, x: a.L + a.w / 2 - (wx + ww / 2) * k, y: a.T + 28 + (a.h - 56) / 2 - (wy + wh / 2) * k }, true)
}
/** 그 화면들로 확대해 맞추기 — 캔버스 배치에 없는 칸(디자인 없는 빈 칸)이면 ID 순서 보기로 바꿔서 */
function focusCols(keys: string[]) {
  if (!keys.length) return
  if (!keys.some((k) => placedOf(k))) { idOrder.value = true; userMoved = true; nextTick(() => fit(true, keys)); return }
  userMoved = true
  fit(true, keys)
}
function zoomAt(px: number, py: number, nz: number, animate = false) {
  const { x, y, z } = view.value
  const k = Math.min(4, Math.max(0.05, nz))
  setView({ z: k, x: px - (px - x) * (k / z), y: py - (py - y) * (k / z) }, animate)
}
function zoomBy(f: number) {
  const a = visibleArea()
  if (!a) return
  userMoved = true
  zoomAt(a.L + a.w / 2, a.T + a.h / 2, view.value.z * f, true)
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  userMoved = true
  const r = canvas.value!.getBoundingClientRect()
  const unit = e.deltaMode === 1 ? 16 : 1
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, view.value.z * Math.exp(-e.deltaY * unit * 0.01))
  else {
    const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit
    setView({ ...view.value, x: view.value.x - dx, y: view.value.y - dy })
  }
}
// 빈 곳 끌기로 이동 — 움직였으면 놓을 때 '선택 풀기'를 건너뛰어요
let pan: { sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null
let skipClick = false
const panning = ref(false)
function onCanvasDown(e: PointerEvent) {
  if (e.button !== 0 && e.button !== 1) return
  if ((e.target as Element | null)?.closest?.('.frame-col, .ldot, .zoombar') && e.button === 0) return
  pan = { sx: e.clientX, sy: e.clientY, vx: view.value.x, vy: view.value.y, moved: false }
  window.addEventListener('pointermove', onPanMove)
  window.addEventListener('pointerup', onPanUp, { once: true })
}
function onPanMove(e: PointerEvent) {
  if (!pan) return
  const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy
  if (!pan.moved && Math.hypot(dx, dy) < 4) return
  pan.moved = true
  panning.value = true
  userMoved = true
  setView({ ...view.value, x: pan.vx + dx, y: pan.vy + dy })
}
function onPanUp() {
  window.removeEventListener('pointermove', onPanMove)
  skipClick = !!pan?.moved
  pan = null
  panning.value = false
}
onBeforeUnmount(() => window.removeEventListener('pointermove', onPanMove))
function toggleIdOrder() {
  idOrder.value = !idOrder.value
  userMoved = false
  hover.value = null
  nextTick(() => fit(true))
}
// 데이터가 들어오는 동안은(사용자가 아직 움직이지 않았으면) 계속 맞춰 보기
watch(() => placed.value.map((p) => `${p.c.key}:${p.x},${p.y},${p.w},${p.h}`).join('|'), () => { if (!userMoved) nextTick(() => fit()) })
onMounted(() => nextTick(() => fit()))
function onViewKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
  if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) { e.preventDefault(); userMoved = true; fit(true) }
  else if (e.shiftKey && (e.code === 'Digit0' || e.key === ')')) { e.preventDefault(); const a = visibleArea(); if (a) { userMoved = true; zoomAt(a.L + a.w / 2, a.T + a.h / 2, 1, true) } }
}
onMounted(() => window.addEventListener('keydown', onViewKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onViewKey))

/**
 * 선 끝 잡기(피그마 프로토타입 연결선처럼 — 사용자 요청 2026-11-27):
 * 끝 동그라미를 누르면 그 선 하나만 골라져서 무엇과 무엇이 이어졌는지 보여요.
 * 끝을 끌어 다른 정책 줄(문서 쪽) · 다른 요소나 화면(화면 쪽)에 놓으면 연결이 옮겨지고, 빈 곳에 놓으면 연결이 끊어져요
 */
const pickedLine = ref<string | null>(null)
type EndTarget = { kind: 'req'; req: ReqRow } | { kind: 'layer'; col: Col; layer: string | null }
const endDrag = ref<{ key: string; end: 'a' | 'b'; x: number; y: number; moved: boolean; sx: number; sy: number; target: EndTarget | null } | null>(null)
/** 마우스를 올린 선(끝 동그라미 · 선) — 검은 안내는 이때만(사용자 요청 2026-11-27) */
const hoverLine = ref<string | null>(null)
const shownLines = computed(() => {
  // 여러 개 연결돼 있으면 고른 선이 있어도 다 보여요 — 고른 선만 실선 · 굵게
  const list = linkLines.value
  const d = endDrag.value
  if (!d?.moved) return list
  return list.map((l) => (l.key !== d.key ? l : d.end === 'a' ? { ...l, x1: d.x, y1: d.y } : { ...l, x2: d.x, y2: d.y }))
})
watch(linkLines, (v) => { if (pickedLine.value && !endDrag.value && !v.some((l) => l.key === pickedLine.value)) pickedLine.value = null })
watch(linePairs, () => { if (!endDrag.value) pickedLine.value = null })
const pickedInfo = computed(() => {
  const l = linkLines.value.find((x) => x.key === hoverLine.value)
  if (!l) return null
  const sc = frames.value.find((x) => x.key === l.col)
  const r = docReqs.value.find((x) => x.id === l.req)
  const from = (sc?.name ?? '') + (l.layer ? ' · ' + layerName(l.screen, l.layer) : '')
  return { line: l, text: `${from} ↔ ${r?.code ?? ''}${r?.title ? ' ' + r.title : ''}`, x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 }
})
/** 화면 쪽 동그라미(4개 중 하나)를 눌렀는데 그 자리에서 선이 나가고 있으면 새 연결 대신 그 선 끝을 잡아요 */
/** 그 동그라미 자리에서 나가는 선(고른 선이 있으면 그걸 먼저) */
function lineAtDot(c: Col, layer: string | null, el: Element) {
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const hits = linkLines.value.filter((x) => x.col === c.key && x.layer === layer && Math.abs(x.x1 - cx) < 3 && Math.abs(x.y1 - cy) < 3)
  return hits.find((x) => x.key === pickedLine.value) ?? hits[0] ?? null
}
function onDotEnter(c: Col, e: PointerEvent, layer: string | null) { hoverLine.value = lineAtDot(c, layer, e.currentTarget as Element)?.key ?? null }
function onDotDown(c: Col, e: PointerEvent, layer: string | null) {
  const l = lineAtDot(c, layer, e.currentTarget as Element)
  if (l) return grabEnd(l, 'a', e)
  startLinkDrag(c, e, layer)
}
function grabEnd(l: LinkLine, end: 'a' | 'b', e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  pickedLine.value = l.key
  endDrag.value = { key: l.key, end, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, target: null }
  window.addEventListener('pointermove', onEndMove)
  window.addEventListener('pointerup', onEndUp, { once: true })
}
function endTargetAt(end: 'a' | 'b', x: number, y: number): { t: EndTarget | null; sx: number; sy: number } {
  if (end === 'b') {
    const hit = reqAt(x, y)
    if (dropEl !== hit?.el) { dropEl?.classList.remove('drop-on'); dropEl = hit?.el ?? null; dropEl?.classList.add('drop-on') }
    const rr = hit?.el.getBoundingClientRect()
    return { t: hit ? { kind: 'req', req: hit.req } : null, sx: rr ? rr.left : x, sy: rr ? rr.top + rr.height / 2 : y }
  }
  const colEl = (document.elementFromPoint(x, y)?.closest('[data-col]') ?? null) as HTMLElement | null
  const c = colEl ? frames.value.find((f) => f.key === colEl.getAttribute('data-col')) : null
  if (!colEl || !c?.screen) { hover.value = null; return { t: null, sx: x, sy: y } }
  const frame = colEl.querySelector('.frame')!
  const el = layerAt(colEl, x, y)
  const layer = el?.getAttribute('data-layer') ?? null
  hover.value = boxOf(c.key, layer, el ?? frame)
  return { t: { kind: 'layer', col: c, layer }, sx: x, sy: y }
}
function onEndMove(e: PointerEvent) {
  const d = endDrag.value
  if (!d) return
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
  d.moved = true
  const { t, sx, sy } = endTargetAt(d.end, e.clientX, e.clientY)
  d.target = t
  d.x = sx
  d.y = sy
}
function stopEndDrag() {
  dropEl?.classList.remove('drop-on')
  dropEl = null
  endDrag.value = null
  window.removeEventListener('pointermove', onEndMove)
}
/** 연결 하나 끊기 — 요소 연결이면 그 요소만 빼고, 마지막 요소였으면 연결 자체를 지워요 */
async function detach(screen: string, req: string, layer: string | null) {
  const ex = docLinks.value.find((l) => l.screen_id === screen && l.requirement_id === req)
  if (!ex) return
  if (layer && (ex.layer_ids?.length ?? 0) > 1) await setLink({ ...ex, layer_ids: ex.layer_ids!.filter((x) => x !== layer) })
  else await removeLink(screen, req)
}
async function onEndUp() {
  const d = endDrag.value
  window.removeEventListener('pointermove', onEndMove)
  const l = d ? linkLines.value.find((x) => x.key === d.key) : null
  stopEndDrag()
  if (!d || !l || !d.moved) return
  const sc = frames.value.find((x) => x.key === l.col)
  const oldReq = docReqs.value.find((x) => x.id === l.req)
  const nameOf = (c: Col | undefined, layer: string | null) => (c?.name ?? '') + (layer && c?.screen ? ' · ' + layerName(c.screen.id, layer) : '')
  const t = d.target
  // 제자리에 놓았으면 그대로
  if (t?.kind === 'req' && t.req.id === l.req) return
  if (t?.kind === 'layer' && t.col.key === l.col && t.layer === l.layer) return
  try {
    await detach(l.screen, l.req, l.layer)
    if (t?.kind === 'req' && sc?.screen) {
      await linkMany([{ screen_id: sc.screen.id, requirement_id: t.req.id, ...(l.layer ? { layer_ids: [l.layer] } : {}) }], links.data.value ?? [])
      await links.refresh()
      say(tr('Linked {code} to {name}', { code: t.req.code, name: nameOf(sc, l.layer) }))
    } else if (t?.kind === 'layer' && t.col.screen) {
      await linkMany([{ screen_id: t.col.screen.id, requirement_id: l.req, ...(t.layer ? { layer_ids: [t.layer] } : {}) }], links.data.value ?? [])
      await links.refresh()
      say(tr('Linked {code} to {name}', { code: oldReq?.code ?? '', name: nameOf(t.col, t.layer) }))
    } else {
      await links.refresh()
      say(tr('Unlinked {code} from {name}', { code: oldReq?.code ?? '', name: nameOf(sc, l.layer) }))
    }
  } catch { await links.refresh(); say(tr("Couldn't change it. Try again")) }
}
/** 캔버스 빈 곳을 누르면 고른 것(정책 · 화면 · 요소 · 칸 · 메모 · 선)을 모두 풀어요(사용자 요청 2026-11-27) */
function onCanvasClick(e: MouseEvent) {
  if (skipClick) { skipClick = false; return }
  if ((e.target as Element | null)?.closest?.('.frame-col, .ldot, .zoombar')) return
  activeReq.value = null
  activeScreen.value = null
  activeLayer.value = null
  activeCol.value = null
  activeNote.value = null
  pickedLine.value = null
}
function onPickedKey(e: KeyboardEvent) { if (e.key === 'Escape' && pickedLine.value && !endDrag.value) pickedLine.value = null }
/** 선 · 끝 동그라미 밖을 누르면 선 고르기를 풀어요 */
function onPickedDown(e: PointerEvent) {
  if (!pickedLine.value || endDrag.value) return
  const t = e.target as Element | null
  if (t?.closest?.('.link-lines circle, .link-lines .hit, .ldot')) return
  pickedLine.value = null
}
onMounted(() => { window.addEventListener('keydown', onPickedKey); window.addEventListener('pointerdown', onPickedDown, true) })
onBeforeUnmount(() => { stopEndDrag(); window.removeEventListener('keydown', onPickedKey); window.removeEventListener('pointerdown', onPickedDown, true) })

const curve = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
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
/** 왼쪽 위 Iris 로고 메뉴 */
const homeOpen = ref(false)
const homeEl = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  if (menuOpen.value && moreEl.value && !moreEl.value.contains(e.target as Node)) menuOpen.value = false
  if (homeOpen.value && homeEl.value && !homeEl.value.contains(e.target as Node)) homeOpen.value = false
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
  <div :class="['split', { 'notes-on': notesShown }]" :aria-hidden="addOpen ? 'true' : undefined">
    <!-- 왼쪽 위: 편집기 캔버스와 같은 Iris 로고 메뉴(사용자 요청 2026-11-27) + 프로젝트 이름(누르면 편집기로) -->
    <div class="sq float s pill">
      <div ref="homeEl" class="home-wrap">
        <button type="button" class="sq hov home" :aria-label="tr('Main menu')" :aria-expanded="homeOpen" @click="homeOpen = !homeOpen"><IrisLogo kind="symbol" :height="16" /><EditorIcon name="chevron_down" :size="12" /></button>
        <div v-if="homeOpen" class="sq menu pmenu" role="menu" @click="homeOpen = false">
          <NuxtLink :to="backHref" class="sq menu-item" role="menuitem">{{ tr('Back to editor') }}</NuxtLink>
          <NuxtLink to="/" class="sq menu-item" role="menuitem">{{ tr('Back to files') }}</NuxtLink>
          <NuxtLink to="/requirements" class="sq menu-item" role="menuitem">{{ tr('Policies board') }}</NuxtLink>
          <div class="msep" role="separator" />
          <ThemeSwitch compact />
          <LangSwitch />
        </div>
      </div>
      <NuxtLink :to="backHref" class="tx-meta crumb ellipsis">{{ projectName || tr('Project') }}</NuxtLink>
      <EditorIcon name="chevron_right" :size="12" color="var(--sys-color-neutral-400)" />
      <span class="tx-head">{{ tr('Split view') }}</span>
    </div>

    <!-- 캔버스(B안): 화면 표의 화면 칸 순서대로 + 칸 없이 연결된 화면 -->
    <main ref="canvas" :aria-label="tr('Canvas')" :class="['canvas-dots', 'canvas', { wide: notesShown, panning }]" @click="onCanvasClick" @wheel="onWheel" @pointerdown="onCanvasDown">
      <!-- 확대 · 이동되는 캔버스(편집기 좌표 그대로) -->
      <div :class="['world', { anim: animView }]" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, '--z': view.z }">
        <!-- ID 순서 보기: 줄마다 종류 이름 -->
        <span v-for="r in rowLabels" :key="r.kind" class="row-label" :style="{ left: r.x + 'px', top: r.y + 'px' }">{{ r.text }}</span>
        <div
          v-for="p in placed"
          :key="p.c.key"
          :data-col="p.c.key"
          :style="{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--fw': p.w, '--k': p.w / 176 }"
          :class="['frame-col', { lit: isLit(p.c), note: isNoteLit(p.c), dim: isDim(p.c), empty: !p.c.screen }]"
          @pointermove="onFrameHover(p.c, $event)"
          @pointerleave="onColLeave"
        >
          <button type="button" class="frame-btn" :aria-pressed="isLit(p.c)" :aria-label="p.c.screen ? tr('{name} · Policies: {n}', { name: p.c.name, n: reqCount(p.c.screen.id) }) : tr('{code} {name} · No design yet', { code: p.c.code ?? '', name: p.c.name })" @click="onFrameClick(p.c)">
            <span class="frame-label">
              <span v-if="p.c.code" class="sq sid num">{{ p.c.code }}</span>
              <span class="ellipsis">{{ p.c.name }}</span>
              <StatusIcon v-if="p.c.screen && activeLinks.get(p.c.screen.id)" :status="activeLinks.get(p.c.screen.id)!.status" :size="10" />
              <span v-if="p.c.screen && pinCount(p.c.screen.id)" class="sq npin num" :title="tr('Notes')">{{ pinCount(p.c.screen.id) }}</span>
            </span>
            <span v-if="p.c.screen && artOf(p.c.screen.id)" class="frame art" aria-hidden="true">
              <ScreenThumb :screen="artOf(p.c.screen.id)!" />
            </span>
            <span v-else-if="p.c.screen" class="frame" aria-hidden="true">
              <span class="ph">
                <span class="f-status" />
                <span class="f-title">{{ p.c.name }}</span>
                <span class="f-body">
                  <span class="sqc f-bar" />
                  <span class="sq f-card" />
                  <span class="sq f-card" />
                  <span class="sq f-card" />
                </span>
                <span class="sqc f-cta" />
              </span>
            </span>
            <span v-else class="frame noframe">
              <span class="ph ph-empty">
                <b>{{ tr('No design yet') }}</b>
                <span class="tx-meta">{{ tr('Import from Figma or draw a frame, then link it to this slot') }}</span>
              </span>
            </span>
            <span class="frame-page">{{ p.c.page || (p.c.slot?.states.length ? tr('States: {list}', { list: p.c.slot.states.join(', ') }) : '') }}</span>
          </button>
        </div>
      </div>
      <!-- 캔버스 위 층(확대와 상관없이 같은 크기): 고른 요소 테두리 · 올린 요소 테두리 · 동그라미 4개 -->
      <div class="ov">
        <span v-if="selBox" class="sel-box" :style="boxStyle(selBox)" aria-hidden="true" />
        <template v-if="hover && hoverCol?.screen && !editing">
          <span v-if="hover.layer" class="hov-box" :style="boxStyle(hover)" aria-hidden="true" />
          <button
            v-for="sd in SIDES" :key="sd" type="button" class="ldot" :style="dotAt(hover, sd)"
            :aria-label="tr('Drag onto a policy row to link {name}', { name: hover.layer ? layerName(hoverCol.screen.id, hover.layer) : hoverCol.name })"
            :title="tr('Drag onto a policy row to link')"
            @pointerdown="onDotDown(hoverCol, $event, hover.layer)"
            @pointerenter="onDotEnter(hoverCol, $event, hover.layer)"
            @pointerleave="hoverLine = null; onDotLeave($event)"
          />
        </template>
      </div>
      <!-- 왼쪽 아래: ID 순서 · 확대 + 안내 -->
      <div class="bl">
      <!-- 위 알약(.float.s)과 같은 곡률 12 · 높이 40 -->
      <div class="sq float s zoombar" @pointerdown.stop @click.stop>
        <button type="button" :class="['sq', 'zb', 'zb-txt', { on: idOrder }]" :aria-pressed="idOrder" :data-tip="idOrder ? tr('Back to layout') : tr('Sort by screen ID')" data-tip-at="top" @click="toggleIdOrder"><EditorIcon name="list_numbered" :size="16" />{{ tr('Sort by screen ID') }}</button>
        <span class="zsep" aria-hidden="true" />
        <button type="button" class="sq zb" :aria-label="tr('Zoom out')" :data-tip="tr('Zoom out')" data-tip-at="top" @click="zoomBy(1 / 1.25)"><EditorIcon name="minus" :size="16" /></button>
        <button type="button" class="sq zb zb-pct num" :aria-label="tr('Zoom to fit')" :data-tip="tr('Zoom to fit') + ' · ⇧1'" data-tip-at="top" @click="userMoved = true; fit(true)">{{ Math.round(view.z * 100) }}%</button>
        <button type="button" class="sq zb" :aria-label="tr('Zoom in')" :data-tip="tr('Zoom in')" data-tip-at="top" @click="zoomBy(1.25)"><EditorIcon name="plus" :size="16" /></button>
      </div>
        <p v-if="screens.status.value === 'success' && links.status.value === 'success' && !frames.length" class="tx-meta hint">{{ tr('No screens are linked to this document yet') }}</p>
        <p v-else-if="frames.length && !placed.length" class="tx-meta hint">{{ tr('No designs are attached yet · choose Sort by screen ID to see the empty slots') }}</p>
        <p v-else-if="frames.length" class="tx-meta hint">{{ activeNote ? tr('Highlighted screens are what this note is about') : activeReq ? tr('Highlighted screens are linked to this policy') : tr('Click a policy to highlight its linked screens · drag the dot on a frame onto a policy row to link it') }}</p>
      </div>
    </main>

    <!-- 끌어서 연결 중: 점선 + 놓을 곳 -->
    <svg v-if="drag" class="drag-line" aria-hidden="true">
      <path :d="curve(drag.x0, drag.y0, drag.x, drag.y)" />
      <circle class="end" :cx="drag.x0" :cy="drag.y0" r="5.25" />
      <circle v-if="drag.over" class="end" :cx="drag.x" :cy="drag.y" r="5.25" />
      <circle v-else :cx="drag.x" :cy="drag.y" r="4" />
    </svg>
    <!-- 고른 정책 · 화면의 연결 선 -->
    <svg v-if="shownLines.length" class="drag-line link-lines" aria-hidden="true">
      <g v-for="l in shownLines" :key="l.key" :class="{ on: pickedLine === l.key }">
        <path :d="curve(l.x1, l.y1, l.x2, l.y2)" />
        <!-- 선 위 올리기 · 누르기용 넓은 투명 선 -->
        <path class="hit" :d="curve(l.x1, l.y1, l.x2, l.y2)" @pointerenter="hoverLine = l.key" @pointerleave="hoverLine = null" @pointerdown.stop="pickedLine = l.key" />
        <!-- 그 요소 · 화면에 마우스를 올려 동그라미 4개가 떠 있으면 겹쳐 진해 보이지 않게 선 쪽 동그라미는 빼요(끝을 끄는 중엔 보여요) -->
        <circle v-if="(endDrag?.moved && endDrag.key === l.key) || !(hover && hover.col === l.col && hover.layer === l.layer)" class="end" :cx="l.x1" :cy="l.y1" r="5.25" @pointerenter="hoverLine = l.key" @pointerleave="hoverLine = null" @pointerdown="grabEnd(l, 'a', $event)" />
        <circle class="end" :cx="l.x2" :cy="l.y2" r="5.25" @pointerenter="hoverLine = l.key" @pointerleave="hoverLine = null" @pointerdown="grabEnd(l, 'b', $event)" />
      </g>
    </svg>
    <!-- 고른 선: 무엇과 무엇이 이어졌는지 + 끝을 끌어 옮기기 · 떼기 안내 -->
    <div v-if="pickedInfo && !endDrag?.moved" class="sq line-chip" :style="{ left: pickedInfo.x + 'px', top: pickedInfo.y + 'px' }">
      <b class="ellipsis">{{ pickedInfo.text }}</b>
      <span>{{ tr('Drag an end onto another place to move the link, or onto empty space to unlink') }}</span>
    </div>
    <span v-if="endDrag?.moved" class="sq drag-chip" :style="{ left: endDrag.x + 12 + 'px', top: endDrag.y + 12 + 'px' }">{{ endDrag.target?.kind === 'req' ? tr('Link to {code}', { code: endDrag.target.req.code }) : endDrag.target?.kind === 'layer' ? tr('Move to {name}', { name: endDrag.target.layer && endDrag.target.col.screen ? layerName(endDrag.target.col.screen.id, endDrag.target.layer) : endDrag.target.col.name }) : tr('Release to unlink') }}</span>
    <span v-if="drag" class="sq drag-chip" :style="{ left: drag.cx + 12 + 'px', top: drag.cy + 12 + 'px' }">{{ drag.over ? tr('Link to {code}', { code: drag.over.code }) : tr('Drop on a policy row') }}</span>

    <!-- 오른쪽: 문서 -->
    <aside :aria-label="tr('Document')" :class="['sq', 'float', 'doc', { wide: notesShown }]">
      <div class="doc-tabs">
        <nav ref="tabsEl" class="seg tabs" @scroll.passive="onTabsScroll" :aria-label="tr('Choose a document')">
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
          <DocCheckBar :doc="doc" @go="(at: { block: string; row: number | null }) => flashWarnAt(reader?.root, at)" />
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
            :highlight="activeScreen ? noteReqId : (activeReq ?? noteReqId)"
            :note-mark="noteThread?.root.doc_anchor ?? null"
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
/* 문서 패널 너비(사용자 요청 2026-11-27): 화면이 넓을수록 넓게(창 너비의 40%, 600 ~ 960). 메모를 켜면 메모 칸(280 고정)만큼 넓어지되 최대 960 을 넘지 않고, 최대일 땐 그 안에서 문서 · 메모로 나눠요 */
.split { --doc-base: clamp(600px, 40vw, 960px); --doc-w: var(--doc-base); }
.split.notes-on { --doc-w: min(calc(var(--doc-base) + 280px), 960px); }
.split { position: relative; height: calc(100vh - var(--iris-tabs-h, 0px)); overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pill { position: absolute; left: var(--iris-gap); top: var(--iris-gap); z-index: 3; height: 40px; max-width: calc(100% - 640px); box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-10) 0 var(--ref-spacing-06); } /* 왼쪽 안쪽 8 · 로고 버튼 크기는 편집기 패널 맨 위 줄과 같게(사용자 요청 2026-11-27) */
.home-wrap { position: relative; flex: none; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.home:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.pmenu { left: 0; right: auto; width: 232px; }
.crumb { border-radius: var(--ref-radius-02); transition: color .12s ease; }
.crumb:hover { color: var(--sys-color-neutral-800); }
.crumb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.pill .tx-head { white-space: nowrap; }

.canvas { position: absolute; inset: 0; overflow: hidden; padding: 64px calc(var(--doc-w) + 32px) 48px 48px; box-sizing: border-box; cursor: default; touch-action: none; }
.canvas.panning { cursor: grabbing; }
.canvas { transition: padding-right .24s cubic-bezier(0.2, 0, 0, 1); }
.bl { position: absolute; left: 16px; bottom: 16px; right: calc(var(--doc-w) + 48px); z-index: 4; display: flex; align-items: center; gap: var(--ref-spacing-08); pointer-events: none; transition: right .24s cubic-bezier(0.2, 0, 0, 1); }
.bl > * { pointer-events: auto; }
.hint { margin: 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none !important; }
/* 확대 · 이동되는 층: 안의 자리는 편집기 좌표(px), 글자 · 선 두께는 --z 로 나눠서 화면에서 늘 같은 크기 */
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.world.anim { transition: transform .24s cubic-bezier(0.2, 0, 0, 1); }
.frame-col { position: absolute; transition: opacity .15s; }
/* 줄 이름: 화면 이름 줄(22) 위에, 확대와 상관없이 같은 크기 */
.row-label { position: absolute; transform: translateY(-100%) scale(calc(1 / var(--z))); transform-origin: 0 100%; padding-bottom: 34px; font-size: 13px; line-height: 20px; font-weight: 600; color: var(--sys-color-neutral-700); white-space: nowrap; pointer-events: none; }
.frame-btn { display: block; width: 100%; height: 100%; text-align: left; position: relative; }
.ov { position: absolute; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
.ov .ldot { pointer-events: auto; }
/* 왼쪽 아래 막대: ID 순서 · 확대 */
.zoombar { flex: none; display: flex; align-items: center; gap: 2px; height: 40px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); box-sizing: border-box; }
.zb { display: inline-flex; align-items: center; justify-content: center; gap: var(--ref-spacing-04); min-width: 28px; height: 28px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 12px; color: var(--sys-color-neutral-800); }
.zb:hover { --sq-fill: var(--sys-color-neutral-100); }
.zb.on { --sq-fill: var(--sys-color-neutral-200); font-weight: 500; }
.zb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.zb-txt { padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); }
.zb-pct { min-width: 48px; }
.zsep { width: 1px; height: 16px; margin: 0 var(--ref-spacing-03); background: var(--iris-line); }
.frame-btn:focus-visible { outline: none; }
.frame-btn:focus-visible .frame { outline: calc(1.5px / var(--z)) solid var(--sys-color-brand-primary-default); outline-offset: calc(2px / var(--z)); }
.frame-col.dim { opacity: .55; }
.frame-label { position: absolute; left: 0; bottom: 100%; width: calc(var(--fw) * var(--z) * 1px); box-sizing: border-box; padding-bottom: 6px; transform: scale(calc(1 / var(--z))); transform-origin: 0 100%; display: flex; align-items: center; gap: var(--ref-spacing-04); font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.frame-col.lit .frame-label { color: var(--iris-peek); font-weight: 500; }
.frame-page { position: absolute; left: 0; top: 100%; width: calc(var(--fw) * var(--z) * 1px); box-sizing: border-box; padding-top: 6px; transform: scale(calc(1 / var(--z))); transform-origin: 0 0; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 375 × 812 화면을 176 폭으로 줄인 틀 (썸네일 전까지 자리만) */
/* 화면 틀 = 캔버스 프레임: 편집기 캔버스처럼 모서리 없이(캔버스는 squircle 예외) — 강조 테두리도 각지게 */
.frame { position: relative; display: block; width: 100%; height: 100%; border-radius: 0; overflow: hidden; background: var(--iris-paper); box-shadow: var(--shadow-01); outline: calc(1px / var(--z)) solid var(--iris-line); }
/* 그린 게 없는 화면 · 빈 칸 그림은 176 폭 기준으로 그린 걸 칸 크기만큼 키워요 */
.ph { position: absolute; left: 0; top: 0; width: 176px; height: 381px; transform: scale(var(--k)); transform-origin: 0 0; }
.ph-empty { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-10); box-sizing: border-box; text-align: center; }
.frame-btn:hover .frame { outline-color: var(--ref-color-gray-900-20); }
/* 고른 화면 테두리는 연결 선과 같은 청색(사용자 요청 2026-11-27) */
.frame-col.lit .frame { outline: calc(1.5px / var(--z)) solid var(--iris-peek); outline-offset: calc(2px / var(--z)); }
.frame-col.note .frame { outline: calc(2px / var(--z)) solid #E8C14A; outline-offset: calc(2px / var(--z)); box-shadow: 0 0 0 calc(6px / var(--z)) rgb(232 193 74 / 22%); }
.noframe { background: transparent; box-shadow: none; outline: calc(1.5px / var(--z)) dashed var(--iris-line-strong); font-size: 12px; color: var(--sys-color-neutral-700); }
.noframe b { font-weight: 600; }
.frame-label .sid { flex: none; display: inline-flex; align-items: center; height: 16px; padding: 0 3px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }
.npin { flex: none; display: inline-flex; align-items: center; height: 16px; padding: 0 4px; border-radius: 8px 8px 8px 2px; font-size: 10px; font-weight: 600; color: #8A6100; --sq-fill: #FFF1C2; }
/* 점 중심이 화면 테두리 선 위에 오게: 기본 선(1px · 바깥 0) 가운데 0.5px, 고른 화면 선(1.5px · 바깥 2px) 가운데 2.75px */
.frame.art { background: var(--iris-paper); }
/* 요소 위 · 고른 요소 테두리, 상하좌우 동그라미(연결 선 끝 동그라미와 같은 모양) */
.hov-box, .sel-box { position: absolute; z-index: 2; pointer-events: none; box-sizing: border-box; }
.hov-box { outline: 1px solid var(--iris-peek); }
.sel-box { outline: 1.5px solid var(--iris-peek); }
.ldot { position: absolute; z-index: 3; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; padding: 0; border-radius: 50%; background: var(--sys-color-common-white-default); box-shadow: 0 0 0 1.5px var(--iris-peek); cursor: crosshair; transition: transform .12s, background-color .12s; }
.ldot:hover { transform: scale(1.25); background: var(--iris-peek); }
/* 보이는 동그라미는 작게, 잡는 자리는 넉넉하게 */
.ldot::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; }
.ldot:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.drag-line { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 20; pointer-events: none; overflow: visible; }
.drag-line path { fill: none; stroke: var(--iris-peek); stroke-width: 1.5; stroke-dasharray: 5 4; }
.drag-line circle { fill: var(--iris-peek); }
/* 선 양 끝 동그라미: 화면 쪽 끌기 점과 같은 모양(흰 바탕 + 선 색 테두리) */
.drag-line circle.end { fill: var(--sys-color-common-white-default); stroke: var(--iris-peek); stroke-width: 1.5; }
/* 연결 선 끝 동그라미는 잡을 수 있어요(피그마 프로토타입 연결선처럼). 고른 선은 실선 · 조금 굵게 */
.link-lines circle.end { pointer-events: auto; cursor: grab; }
.link-lines circle.end:hover { fill: var(--iris-peek); }
.link-lines g.on path:not(.hit) { stroke-width: 2; stroke-dasharray: none; }
.link-lines path.hit { stroke: transparent; stroke-width: 12; stroke-dasharray: none; pointer-events: stroke; cursor: pointer; }
.line-chip { position: fixed; z-index: 21; transform: translate(-50%, calc(-100% - 10px)); max-width: 320px; display: flex; flex-direction: column; gap: 2px; padding: var(--ref-spacing-05) var(--ref-spacing-07); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; pointer-events: none; }
.line-chip b { font-weight: 600; }
.line-chip span { color: rgb(255 255 255 / 70%); }
.drag-chip { position: fixed; z-index: 21; pointer-events: none; height: 24px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-size: 12px; font-weight: 500; white-space: nowrap; }
.split :deep(.drop-on) td, .split :deep(.drop-on.blk) { background: color-mix(in srgb, var(--iris-peek) 12%, transparent) !important; }
.split :deep(.drop-on) td:first-child { box-shadow: inset 2px 0 0 var(--iris-peek); }
.split :deep(.flash) { animation: flash 1.4s ease; }
@keyframes flash { 0%, 40% { background: #FFF1C2; } 100% { background: transparent; } }
/* 메모 칸 열고 닫기: 사이드바와 같은 0.24초 곡선으로 패널 폭과 메모 열 폭이 같이 바뀌어요(문서 폭은 그대로) */
.doc { transition: width .24s cubic-bezier(0.2, 0, 0, 1); }
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

.doc { position: absolute; right: var(--iris-gap); top: var(--iris-gap); bottom: var(--iris-gap); z-index: 3; width: var(--doc-w); max-width: calc(100% - 16px); display: flex; flex-direction: column; overflow: hidden; }
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
.toast-wrap { position: absolute; left: 0; right: calc(var(--doc-w) + var(--iris-gap) * 2); bottom: 32px; z-index: 6; display: flex; justify-content: center; pointer-events: none; transition: right .24s cubic-bezier(0.2, 0, 0, 1); font-size: 12px; line-height: 18px; }
.toast { display: flex; align-items: center; height: 40px; box-sizing: border-box; margin: 0; padding: 0 var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--iris-black); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--iris-paper); font-weight: 500; white-space: nowrap; filter: var(--iris-float-shadow); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
