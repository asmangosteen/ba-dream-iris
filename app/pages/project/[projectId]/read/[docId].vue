<script setup lang="ts">
import { Button, Skeleton } from '@ba-dream/design-system'
import type { LinkRow } from '~/composables/useIrisData'
import DocReader from '~/components/docs/DocReader.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import ScreenThumb from '~/components/editor/ScreenThumb.vue'
import AccessGate from '~/components/project/AccessGate.vue'
import StatusIcon from '~/components/StatusIcon.vue'
import DocNotes, { type DocAnchor } from '~/components/docs/DocNotes.vue'
import { scrollToDocAnchor } from '~/components/docs/DocReader.vue'

/**
 * 문서에서 보기(4단계 시안 4 — 2026-11-28, 홈 탭 화면 /project/<id>/read/<doc>): 요청사항 탭의 [View in document] 를 누르면 캔버스 없이 문서만 넓게, 그 요청사항 줄로 스크롤 · 청록 강조.
 * 오른쪽엔 그 요청사항 한눈에(상태 · 문서 안 자리 · 연결된 화면 · 메모). 다른 요청사항 번호를 누르면 그걸로 바뀌어요(주소 ?req= 도 같이)
 */
const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
const docId = computed(() => route.params.docId as string)

const { data: projects } = useProjects()
const project = computed(() => projects.value?.find((p) => p.id === projectId) ?? null)
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const screens = useProjectScreens(projectId)
const comments = useComments(projectId)
const members = useMembers()
const doc = computed(() => docs.data.value?.find((d) => d.id === docId.value) ?? null)
useHead({ title: () => (doc.value?.title ? `${doc.value.title} · Iris` : 'Iris') })

const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
const reqId = computed(() => (typeof route.query.req === 'string' ? route.query.req : null))
const req = computed(() => docReqs.value.find((r) => r.id === reqId.value) ?? null)
function pickReq(id: string) { router.replace({ query: { ...route.query, req: id } }) }
const linkedIds = computed(() => [...new Set((links.data.value ?? []).map((l) => l.requirement_id))])

const reqLinks = computed<LinkRow[]>(() => (req.value ? (links.data.value ?? []).filter((l) => l.requirement_id === req.value!.id) : []))
const status = computed(() => deriveReqStatus(reqLinks.value))
/** 문서 안 자리: '2. 요청사항 · 4행' — 그 요청사항이 있는 블록 바로 앞 제목 */
const place = computed(() => {
  const r = req.value, d = doc.value
  if (!r || !d) return ''
  const a = (r.anchor ?? {}) as { block?: string; row?: number }
  const blocks = d.content_blocks ?? []
  const i = blocks.findIndex((b) => b.id === a.block)
  const head = i >= 0 ? [...blocks.slice(0, i)].reverse().find((b) => b.type === 'h1' || b.type === 'h2')?.text : null
  return [head, a.row ? tr('row {n}', { n: a.row }) : null].filter(Boolean).join(' · ')
})
/** 화면 표에서 이 요청사항을 쓰는 칸 수 */
const slots = useScreenSlots(projectId)
const usedIn = computed(() => {
  const code = req.value?.code
  return code ? (slots.data.value ?? []).filter((x) => x.document_id === docId.value && !x.removed_at && x.policy_codes.includes(code)).length : 0
})

// 연결된 화면: 이름 · 상태 + 작은 썸네일(레이어까지 받아요) ---------------------------
const supabase = useSupabaseClient()
const preview = useDevPreview()
const linkedScreenIds = computed(() => reqLinks.value.map((l) => l.screen_id).sort().join(','))
const art = useAsyncData(`read-art-${projectId}`, async () => {
  const ids = linkedScreenIds.value ? linkedScreenIds.value.split(',') : []
  if (!ids.length) return {} as Record<string, { id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path: string | null; layers: unknown }>
  if (preview) return Object.fromEntries(Object.values(PREVIEW_SCREENS).flat().filter((x) => ids.includes(x.id)).map((x) => [x.id, { id: x.id, source: x.source, width: x.width, height: x.height, thumbnail_path: x.thumbnail_path ?? null, layers: x.layers ?? null }]))
  const { data, error } = await supabase.from('screens').select('id, source, width, height, thumbnail_path, layers').in('id', ids)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((x) => [(x as { id: string }).id, x])) as Record<string, { id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path: string | null; layers: unknown }>
}, { server: false, watch: [linkedScreenIds], default: () => ({}) as Record<string, { id: string; source: 'figma' | 'native'; width: number; height: number; thumbnail_path: string | null; layers: unknown }> })
const linked = computed(() => reqLinks.value.map((l) => ({ link: l, screen: (screens.data.value ?? []).find((s) => s.id === l.screen_id) ?? null, art: art.data.value?.[l.screen_id] ?? null })))
const slotCode = (s: { slot_id: string | null } | null) => (s?.slot_id ? (slots.data.value ?? []).find((x) => x.id === s.slot_id)?.code ?? null : null)

// 이 요청사항에 단 메모(문서 옆 메모 중 그 요청사항 줄에 단 것) --------------------------
const notes = computed(() => {
  const code = req.value?.code
  if (!code) return []
  return comments.docThreads(docId.value).filter((t) => t.root.doc_anchor?.code === code && !t.root.resolved_at)
})
const who = (id: string) => { const m = (members.data.value ?? []).find((x) => x.id === id); return { name: m?.name || m?.email || tr('Former member'), avatar: m?.avatar_url ?? null } }

// 메모 · 댓글(함께 보기와 같은 부품 — 사용자 요청 2026-11-28) -----------------------------
/** 오른쪽 패널: 요청사항 · 메모 */
const pane = ref<'request' | 'notes'>('request')
const activeNote = ref<string | null>(null)
const noteDraft = ref<DocAnchor | null>(null)
const noteThread = computed(() => comments.docThreads(docId.value).find((t) => t.root.id === activeNote.value) ?? null)
const noteCount = computed(() => comments.docThreads(docId.value).filter((t) => !!t.root.doc_anchor && !t.root.resolved_at).length)
const docLinks = computed(() => { const ids = new Set(docReqs.value.map((r) => r.id)); return (links.data.value ?? []).filter((l) => ids.has(l.requirement_id)) })
const reader = ref<InstanceType<typeof DocReader> | null>(null)
/** 문서에서 글을 고르고 [메모 남기기] → 오른쪽 메모 칸에 새 메모 */
function onComment(p: { quote: string; block: string | null; row: number | null; code: string | null }) {
  pane.value = 'notes'
  activeNote.value = null
  noteDraft.value = { block: p.block, row: p.row, code: p.code, quote: p.quote }
}
/** 메모를 누르면 문서의 그 자리로: 요청사항 줄이면 그 요청사항을 골라요 */
function goAnchor(a: DocAnchor) {
  const r = a.code ? docReqs.value.find((x) => x.code === a.code) : null
  if (r) pickReq(r.id)
  else if (a.block) scrollToDocAnchor(reader.value?.root as HTMLElement | undefined, { block: a.block })
}
const notice = ref('')
let noticeT: ReturnType<typeof setTimeout> | undefined
function say(t: string) { notice.value = t; clearTimeout(noticeT); noticeT = setTimeout(() => { notice.value = '' }, 3000) }
onBeforeUnmount(() => clearTimeout(noticeT))

/**
 * ← 뒤로: 늘 홈 안에서만(사용자 결정 2026-11-28) — 바로 전 화면이 홈 화면(프로젝트 목록 · 문서 목록 · 프로젝트 첫 화면 · 요청사항 보기)일 때만 그리로,
 * 캔버스 · 함께 보기 같은 프로젝트 탭 화면에서 왔거나 주소로 바로 열었으면 이 프로젝트 첫 화면으로
 */
function goBack() {
  const prev = import.meta.client ? (window.history.state?.back as string | null | undefined) : null
  const path = prev?.split(/[?#]/)[0] ?? ''
  const homeLike = path === '/' || path === '/documents' || path.startsWith('/project/')
  if (prev && homeLike) router.back()
  else navigateTo(`/project/${projectId}`)
}
const splitHref = computed(() => `/p/${projectId}/docs/${docId.value}` + (reqId.value ? `?req=${encodeURIComponent(reqId.value)}` : ''))
</script>

<template>
  <div class="rd">
    <!-- 머리 줄: 프로젝트 첫 화면과 같은 홈 머리(제목 왼쪽 ← · 제목 20 · 아래 메타) -->
    <header class="rd-head">
      <button type="button" class="sq back" :aria-label="tr('Back')" :data-tip="tr('Back')" @click="goBack"><EditorIcon name="chevron_right" :size="20" class="flip" /></button>
      <div class="ttl-col">
        <h1 class="ttl">{{ project?.name ?? '' }}</h1>
      </div>
    </header>
    <div class="rd-row">
    <main class="sq card main">
      <div v-ovscroll class="body">
        <div class="col">
          <DocReader v-if="doc" :doc="doc" :reqs="docReqs" :highlight="reqId"  ref="reader" :linked="linkedIds" :note-mark="noteThread?.root.doc_anchor ?? null" @pick-req="pickReq" @comment="onComment">
            <!-- 문서 제목 줄 오른쪽 위: 함께 보기 · 고치기(함께 보기 머리 Notes · Edit 자리와 같아요, 버튼끼리 4) -->
            <template #actions>
              <Button size="s" type="tertiary" stroke @click="navigateTo(splitHref)">{{ tr('Open in split view') }}</Button>
              <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="pencil" @click="navigateTo(`/p/${projectId}/docs/${docId}?edit=1`)">{{ tr('Edit') }}</Button>
            </template>
          </DocReader>
          <!-- 문서 전체 댓글(문서 아래 게시판 — 함께 보기와 같아요) -->
          <DocNotes v-if="doc" part="board" :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @toast="say" />
          <template v-else-if="docs.status.value === 'pending'"><Skeleton shape="text" width="40%" /><Skeleton shape="rectangle" height="240px" /></template>
          <p v-else class="tx-meta">{{ tr('This document is gone. It may have been deleted') }}</p>
        </div>
      </div>
    </main>

    <aside class="sq card side" :aria-label="pane === 'notes' ? tr('Notes') : tr('Request details')">
      <!-- 요청사항 · 메모: 세그먼트 컨트롤 -->
      <div class="pane-top">
        <div class="sq segc" role="radiogroup" :aria-label="tr('Side panel')" style="grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%">
          <button type="button" role="radio" :aria-checked="pane === 'request'" :class="['sq', 'segc-i', { on: pane === 'request' }]" @click="pane = 'request'">{{ tr('Request') }}</button>
          <button type="button" role="radio" :aria-checked="pane === 'notes'" :class="['sq', 'segc-i', { on: pane === 'notes' }]" @click="pane = 'notes'"><span>{{ tr('Notes') }}</span><span v-if="noteCount" class="n num">{{ noteCount }}</span></button>
        </div>
      </div>
      <!-- 스크롤은 카드 안쪽 칸에서(카드 자체를 스크롤 칸으로 쓰면 squircle 테두리 층 1px 때문에 넘칠 게 없어도 스크롤바가 떠요) -->
      <div v-show="pane === 'request'" v-ovscroll class="side-sc">
      <template v-if="req">
        <div class="rhead"><span class="sq pid num">{{ req.code }}</span><span :class="['sq', 'st', status]"><StatusIcon v-if="status !== 'none'" :status="status" :size="10" />{{ tr(REQ_STATUS_TEXT[status]) }}</span></div>
        <h2 class="rtitle">{{ req.title }}</h2>
        <span class="tx-meta">{{ place }}<template v-if="usedIn"> — {{ usedIn === 1 ? tr('used in 1 screen row') : tr('used in {n} screen rows', { n: usedIn }) }}</template></span>
        <div class="hsep" />
        <h3 class="sub">{{ tr('Linked screens') }} <span class="tx-meta num">{{ linked.length }}</span></h3>
        <p v-if="!linked.length" class="tx-meta m0">{{ tr('No linked screens yet') }}</p>
        <NuxtLink v-for="x in linked" :key="x.link.screen_id" :to="`/p/${projectId}?screen=${x.link.screen_id}`" class="sq srow">
          <span class="sq sq-clip mini"><ScreenThumb v-if="x.art" :screen="x.art" /></span>
          <span class="scol">
            <span class="sname"><span v-if="slotCode(x.screen)" class="sq sid num">{{ slotCode(x.screen) }}</span><span class="ellipsis">{{ x.screen?.name ?? tr('Untitled screen') }}</span></span>
            <span :class="['sq', 'st', x.link.status]"><StatusIcon :status="x.link.status" :size="10" />{{ tr(LINK_STATUS[x.link.status].label) }}</span>
          </span>
        </NuxtLink>
        <template v-if="notes.length">
          <div class="hsep" />
          <h3 class="sub">{{ tr('Notes') }} <span class="tx-meta num">{{ notes.length }}</span></h3>
          <div v-for="t in notes" :key="t.root.id" class="sq note">
            <MemberAvatar :name="who(t.root.author_id).name" :src="who(t.root.author_id).avatar" :size="24" />
            <span class="ncol"><b>{{ who(t.root.author_id).name }} <span class="tx-meta">{{ relativeTime(t.root.created_at) }}</span></b><span class="nbody">{{ t.root.body }}</span></span>
          </div>
        </template>
      </template>
      <p v-else class="tx-meta m0">{{ tr('Choose a request ID in the document to see its screens') }}</p>
      </div>
      <div v-show="pane === 'notes'" v-ovscroll class="side-sc notes-sc">
        <DocNotes v-if="doc" v-model:active="activeNote" v-model:draft="noteDraft" part="notes" :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @go="goAnchor" @toast="say" @close="pane = 'request'" />
      </div>
    </aside>
    </div>
    <div class="toast-wrap" role="status" aria-live="polite"><Transition name="toast"><p v-if="notice" class="sq toast">{{ notice }}</p></Transition></div>
    <AccessGate :project-id="projectId" :project-name="project?.name" />
  </div>
</template>

<style scoped>
/* 문서에서 보기: 회색 바탕에 문서 카드(가운데 760) + 오른쪽 요청사항 카드 320(시안 4) */
.rd { height: calc(100vh - var(--iris-tabs-h, 0px)); box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-12); padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-14); background: var(--iris-canvas); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.card { border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line); --sq-line-w: 1px; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.rd-head { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; }
.rd-row { flex: 1; min-height: 0; display: flex; gap: var(--ref-spacing-10); }
/* 제목 왼쪽 ←: 프로젝트 첫 화면과 같아요(32 정사각, 올리면 회색) */
.back { flex: none; width: 32px; height: 32px; display: grid; place-items: center; margin-left: calc(-1 * var(--ref-spacing-04)); border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-700); }
.back:hover { --sq-fill: var(--interaction-light-gray-hover); }
.back:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.ttl-col { display: flex; flex-direction: column; gap: var(--ref-spacing-02); min-width: 0; }
.ttl-row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; }
.ttl { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flip { transform: rotate(180deg); }
.ellipsis { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 500; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.chip.line { --sq-fill: transparent; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.f1 { flex: 1; }
.body { flex: 1; min-height: 0; overflow: auto; padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-14); }
.col { width: min(760px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); }

.side { flex: 0 0 320px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
.pane-top { flex: none; padding: var(--ref-spacing-10) var(--ref-spacing-10) var(--ref-spacing-04); }
.side-sc { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); }
/* 메모 칸: DocNotes 머리(44, 아래 선)가 칸 위에 붙게 안쪽 위 여백 없이 */
.notes-sc { padding: 0 var(--ref-spacing-10) var(--ref-spacing-10); gap: 0; }
.toast-wrap { position: fixed; left: 0; right: 0; bottom: 32px; z-index: 30; display: flex; justify-content: center; pointer-events: none; font-size: 12px; line-height: 18px; }
.toast { display: flex; align-items: center; height: 40px; box-sizing: border-box; margin: 0; padding: 0 var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--iris-black); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--iris-paper); font-weight: 500; white-space: nowrap; filter: var(--iris-float-shadow); }
.toast-enter-active, .toast-leave-active { transition: opacity .16s ease, transform .16s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(6px); }
.rhead { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.rtitle { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.hsep { flex: none; height: 1px; background: var(--iris-line); }
.sub { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; }
.m0 { margin: 0; }
.pid { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: var(--iris-peek-ink); --sq-fill: var(--iris-peek-bg); }
.sid { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 3px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #1F63BD; --sq-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 45%, transparent); --sq-line-w: 1px; }
.st { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.st.missing { color: #C4222A; --sq-fill: #FFEDEB; }
.st.partial { color: #B44A0E; --sq-fill: #FFF1E8; }
.st.reflected { color: #1B7A2B; --sq-fill: #E9F6EC; }
.st.none { --sq-fill: transparent; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.srow { display: flex; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); color: inherit; text-decoration: none; }
.srow:hover { --sq-fill: var(--sys-color-neutral-200); }
.srow:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.mini { position: relative; flex: none; width: 36px; height: 48px; border-radius: var(--ref-radius-02); --sq-fill: var(--iris-paper); --sq-line: var(--iris-line); --sq-line-w: 1px; }
.scol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
.sname { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.note { display: flex; gap: var(--ref-spacing-05); padding: var(--ref-spacing-06); border-radius: var(--ref-radius-05); --sq-fill: #FFFBEB; --sq-line: #F2DFA0; --sq-line-w: 1px; }
.ncol { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ncol b { font-weight: 600; }
.nbody { white-space: pre-wrap; word-break: break-word; }
</style>
