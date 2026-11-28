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
import DocHistory from '~/components/docs/DocHistory.vue'
import AppConfirm from '~/components/app/AppConfirm.vue'
import type { DocBlock, DocRow, ReqRow } from '~/composables/useIrisData'
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

/** 문서 상태 이름(DocReader 와 같아요) */
const DOC_STATUS_LABEL: Record<'draft' | 'review' | 'confirmed', string> = { draft: 'Draft', review: 'In review', confirmed: 'Confirmed' }
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
const reqId = computed(() => (typeof route.query.req === 'string' ? route.query.req : null))
const req = computed(() => docReqs.value.find((r) => r.id === reqId.value) ?? null)
/** 요청사항 고르기 — 이미 고른 걸 다시 누르면 선택을 풀어요(사용자 요청 2026-11-28) */
function pickReq(id: string) {
  const { req: _cur, ...rest } = route.query
  router.replace({ query: reqId.value === id ? rest : { ...rest, req: id } })
}
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
const pane = ref<'request' | 'notes' | 'history'>('request')
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
  // 메모에서 가는 건 늘 고르기(다시 눌러 풀기는 문서 쪽에서만)
  if (r) { if (reqId.value !== r.id) pickReq(r.id) }
  else if (a.block) scrollToDocAnchor(reader.value?.root as HTMLElement | undefined, { block: a.block })
}
const notice = ref('')
let noticeT: ReturnType<typeof setTimeout> | undefined
function say(t: string) { notice.value = t; clearTimeout(noticeT); noticeT = setTimeout(() => { notice.value = '' }, 3000) }
onBeforeUnmount(() => clearTimeout(noticeT))

// 기록 · 지우기(함께 보기와 같은 동작) -----------------------------------------------
const { syncDocFormat, addHistory } = useIrisMutations()
/** 기록에서 [되돌리기]: 그때 글로 저장하고, 되돌린 것도 기록으로 남겨요 */
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
    await syncDocFormat(projectId, d.id, analyzeDoc(blocks), { reqs: reqs.data.value ?? [], slots: slots.data.value ?? [], screens: screens.data.value ?? [], links: links.data.value ?? [] }).catch(() => null)
    await addHistory(projectId, d.id, d.content_blocks ?? [], blocks, label).catch(() => null)
    await refreshNuxtData([`docs-${projectId}`, `reqs-${projectId}`, `links-${projectId}`, `slots-${projectId}`, `doc-history-${projectId}`])
    say(tr('Restored'))
  } catch { say(tr("Couldn't restore. Try again in a moment.")) }
}
/** 문서 지우기: 공용 확인 창(AppConfirm) → 지우고 프로젝트 첫 화면으로 */
const confirmDel = ref(false)
const deleting = ref(false)
async function removeDoc() {
  const d = doc.value
  if (!d || deleting.value) return
  deleting.value = true
  try {
    if (preview) {
      const docsStore = useState<Omit<DocRow, 'project_id'>[]>('pv-docs')
      const reqStore = useState<Omit<ReqRow, 'project_id'>[]>('pv-reqs')
      const linkStore = useState<LinkRow[]>('pv-links')
      const ids = new Set((reqStore.value ?? []).filter((r) => r.document_id === d.id).map((r) => r.id))
      if (docsStore.value) docsStore.value = docsStore.value.filter((x) => x.id !== d.id)
      if (reqStore.value) reqStore.value = reqStore.value.filter((r) => r.document_id !== d.id)
      if (linkStore.value) linkStore.value = linkStore.value.filter((l) => !ids.has(l.requirement_id))
    } else {
      // 요청사항 · 화면 연결은 DB 에서 같이 지워져요(cascade)
      const { error } = await supabase.from('documents').delete().eq('id', d.id)
      if (error) throw error
      if (d.source_type === 'upload' && d.file_path) await supabase.storage.from('documents').remove([d.file_path]).catch(() => null)
    }
  } catch {
    deleting.value = false
    say(tr("Couldn't delete the document. Try again in a moment."))
    return
  }
  confirmDel.value = false
  await refreshNuxtData([`docs-${projectId}`, `reqs-${projectId}`, `links-${projectId}`, 'all-docs'])
  deleting.value = false
  await navigateTo(`/project/${projectId}`)
}

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
      <!-- 문서 머리: 카드 전체 너비 — 제목 · 칩은 왼쪽 끝, 버튼은 오른쪽 끝(함께 보기 문서 패널과 같은 좌우 24), 아래 전체 너비 구분선 -->
      <div v-if="doc" class="dhead">
        <div class="dh-col">
          <h2 class="tx-title dh-title">{{ doc.title }}</h2>
          <span v-if="doc.abbr || doc.status" class="dh-chips">
            <span v-if="doc.abbr" class="sq dchip abbr">{{ doc.abbr }}</span>
            <span v-if="doc.status" :class="['sq', 'dchip', 'st', doc.status]">{{ tr(DOC_STATUS_LABEL[doc.status]) }}</span>
          </span>
        </div>
        <span class="acts">
          <Button size="s" type="tertiary" stroke @click="navigateTo(splitHref)">{{ tr('Open in split view') }}</Button>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="pencil" @click="navigateTo(`/p/${projectId}/docs/${docId}?edit=1`)">{{ tr('Edit') }}</Button>
          <!-- 지우기: 옅은 빨강 바탕(alpha) + 빨강 글자 -->
          <Button size="s" type="destructed" class="del-btn" contents="icon-text" icon-name="trashbin" @click="confirmDel = true">{{ tr('Delete') }}</Button>
        </span>
      </div>
      <div v-ovscroll class="body">
        <div class="col">
          <DocReader v-if="doc" ref="reader" :doc="doc" :reqs="docReqs" :highlight="reqId" :linked="linkedIds" :note-mark="noteThread?.root.doc_anchor ?? null" hide-head @pick-req="pickReq" @comment="onComment" />
          <template v-else-if="docs.status.value === 'pending'"><Skeleton shape="text" width="40%" /><Skeleton shape="rectangle" height="240px" /></template>
          <p v-else class="tx-meta">{{ tr('This document is gone. It may have been deleted') }}</p>
        </div>
        <!-- 문서 전체 댓글: 위에 카드 전체 너비 구분선 -->
        <div v-if="doc" class="board-wrap">
          <div class="col">
            <DocNotes part="board" :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @toast="say" />
          </div>
        </div>
      </div>
    </main>

    <aside class="sq card side" :aria-label="pane === 'notes' ? tr('Notes') : tr('Request details')">
      <!-- 요청사항 · 메모: 세그먼트 컨트롤 -->
      <div class="pane-top">
        <div class="sq segc" role="radiogroup" :aria-label="tr('Side panel')" style="grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%">
          <button type="button" role="radio" :aria-checked="pane === 'request'" :class="['sq', 'segc-i', { on: pane === 'request' }]" @click="pane = 'request'">{{ tr('Request') }}</button>
          <button type="button" role="radio" :aria-checked="pane === 'notes'" :class="['sq', 'segc-i', { on: pane === 'notes' }]" @click="pane = 'notes'"><span v-if="pane === 'history'" class="segc-sep" aria-hidden="true" /><span>{{ tr('Notes') }}</span><span v-if="noteCount" class="n num">{{ noteCount }}</span></button>
          <button type="button" role="radio" :aria-checked="pane === 'history'" :class="['sq', 'segc-i', { on: pane === 'history' }]" @click="pane = 'history'"><span v-if="pane === 'request'" class="segc-sep" aria-hidden="true" />{{ tr('History') }}</button>
        </div>
      </div>
      <!-- 스크롤은 카드 안쪽 칸에서(카드 자체를 스크롤 칸으로 쓰면 squircle 테두리 층 1px 때문에 넘칠 게 없어도 스크롤바가 떠요) -->
      <div v-show="pane === 'request'" v-ovscroll class="side-sc">
      <template v-if="req">
        <div class="rhead"><span class="sq pid num">{{ req.code }}</span><span :class="['sq', 'rst', status]"><StatusIcon v-if="status !== 'none'" :status="status" :size="10" />{{ tr(REQ_STATUS_TEXT[status]) }}</span></div>
        <h2 class="rtitle">{{ req.title }}</h2>
        <span class="tx-meta">{{ place }}<template v-if="usedIn"> — {{ usedIn === 1 ? tr('used in 1 screen row') : tr('used in {n} screen rows', { n: usedIn }) }}</template></span>
        <div class="hsep" />
        <h3 class="sub">{{ tr('Linked screens') }} <span class="tx-meta num">{{ linked.length }}</span></h3>
        <p v-if="!linked.length" class="tx-meta m0">{{ tr('No linked screens yet') }}</p>
        <NuxtLink v-for="x in linked" :key="x.link.screen_id" :to="`/p/${projectId}?screen=${x.link.screen_id}`" class="sq srow">
          <span class="sq sq-clip mini"><ScreenThumb v-if="x.art" :screen="x.art" /></span>
          <span class="scol">
            <span class="sname"><span v-if="slotCode(x.screen)" class="sq sid num">{{ slotCode(x.screen) }}</span><span class="ellipsis">{{ x.screen?.name ?? tr('Untitled screen') }}</span></span>
            <span :class="['sq', 'rst', x.link.status]"><StatusIcon :status="x.link.status" :size="10" />{{ tr(LINK_STATUS[x.link.status].label) }}</span>
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
      <div v-if="pane === 'history' && doc" v-ovscroll class="side-sc">
        <DocHistory :project-id="projectId" :doc="doc" :can-restore="doc.source_type === 'native' || !!doc.content_blocks?.length" :focus-code="req?.code ?? null" hide-head @restore="restoreDoc" @clear-focus="req && pickReq(req.id)" />
      </div>
      <div v-show="pane === 'notes'" v-ovscroll class="side-sc notes-sc">
        <DocNotes v-if="doc" v-model:active="activeNote" v-model:draft="noteDraft" part="notes" hide-head :project-id="projectId" :doc="doc" :reqs="docReqs" :links="docLinks" :screens="screens.data.value ?? []" @go="goAnchor" @toast="say" @close="pane = 'request'" />
      </div>
    </aside>
    </div>
    <!-- 문서 지우기 확인: 공용 AppConfirm(함께 보기 '문서 지우기'와 같은 문구) -->
    <AppConfirm
      v-if="confirmDel && doc"
      :title="tr('Delete “{name}”?', { name: doc.title })"
      :desc="tr('Its requests and screen links will be deleted too. This can’t be undone.')"
      :closable="!deleting"
      :actions="[{ label: tr('Cancel'), onClick: () => (confirmDel = false) }, { label: tr('Delete'), kind: 'destructed', loading: deleting, onClick: removeDoc }]"
      @close="confirmDel = false"
    />
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
.dhead { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-08); padding: var(--ref-spacing-10) var(--ref-spacing-12); box-shadow: 0 1px 0 var(--iris-line); position: relative; z-index: 1; }
/* 제목 · 칩 한 줄(칩은 제목 오른쪽 옆, 사이 8 · 칩끼리 4) */
.dh-col { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-06); }
.dh-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dh-chips { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); }
.acts { flex: none; display: inline-flex; align-items: center; gap: var(--ref-spacing-04); }
/* 지우기 버튼: DS 빨강(destructed) 바탕을 옅은 빨강(alpha 10%)으로, 글자 · 아이콘은 빨강 */
.del-btn { --bd-btn-bg: color-mix(in srgb, var(--sys-color-theme-destructed-default) 10%, transparent) !important; --bd-btn-fg: var(--sys-color-theme-destructed-default) !important; }
/* 문서 칩(DocReader .dchip 과 같아요) */
.dchip { height: 20px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: var(--sys-color-neutral-700); --sq-fill: var(--sys-color-neutral-100); }
.dchip.abbr { color: var(--sys-color-neutral-800); --sq-fill: transparent; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.dchip.st.review { color: #8A6100; --sq-fill: #FFF6DA; }
.dchip.st.confirmed { color: #14612C; --sq-fill: #DDF4E4; }
/* 본문 스크롤: 함께 보기 문서 패널처럼 카드 아래 기본 여백 24(그 위로는 흘러가지 않게) */
.body { flex: 1; min-height: 0; overflow: auto; padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-08); margin-bottom: var(--ref-spacing-12); }
/* 댓글 묶음: 위 구분선은 카드 전체 너비(본문 좌우 여백만큼 밖으로) */
.board-wrap { margin: var(--ref-spacing-14) calc(-1 * var(--ref-spacing-12)) 0; padding: 0 var(--ref-spacing-12); box-shadow: 0 -1px 0 var(--iris-line); }
.board-wrap :deep(.board) { margin: 0; padding: var(--ref-spacing-10) 0 0; box-shadow: none; }
.col { width: min(760px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); }

.side { flex: 0 0 320px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
.pane-top { flex: none; padding: var(--ref-spacing-10) var(--ref-spacing-10) var(--ref-spacing-04); }
.side-sc { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-12); }
/* 메모 칸: 머리 줄 없이(세그먼트가 머리) — 안쪽 여백은 요청사항 · 기록 칸(.side-sc)과 똑같이 */
.notes-sc { gap: 0; }
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
/* 상태 칩: 아이콘 · 글자 사이 4(요청사항 표 상태 .status 와 같아요) — 클래스 이름은 StatusIcon 의 .st 와 겹치지 않게 */
.rst { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--ref-spacing-04); height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.rst.missing { color: #C4222A; --sq-fill: #FFEDEB; }
.rst.partial { color: #B44A0E; --sq-fill: #FFF1E8; }
.rst.reflected { color: #1B7A2B; --sq-fill: #E9F6EC; }
.rst.none { --sq-fill: transparent; --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
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
