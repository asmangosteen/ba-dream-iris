<script setup lang="ts">
import { Skeleton } from '@ba-dream/design-system'
import type { DocCategory, DocRow } from '~/composables/useIrisData'
import { DOC_CATEGORY_LABEL, DOC_SOURCE_TIP, docIcon } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import ProjectHead from '~/components/project/ProjectHead.vue'
import AccessGate from '~/components/project/AccessGate.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import RequestsBoard from '~/components/project/RequestsBoard.vue'
import PageThumb, { type ThumbScreen } from '~/components/project/PageThumb.vue'

/**
 * 프로젝트 첫 화면(4단계 시안 1 · 2 — 2026-11-28): 홈에서 프로젝트를 누르면 캔버스 대신 여기로. 아직 홈 탭 화면이에요(/project/<id>) —
 * 캔버스 · 함께 보기를 열어야 위에 프로젝트 탭이 생겨요. 제목 왼쪽 ← 는 홈(요청사항 보기에선 개요)으로.
 * 개요: 캔버스 페이지 썸네일 · 요청사항 반영 진행도([View details] → 요청사항 보기 ?view=requests) · 문서 목록([Add document]).
 * 문서를 누르면 캔버스 없이 문서만 보는 '문서에서 보기'(/project/<id>/read/<doc>) — 거기서 [함께 보기로 열기]로 캔버스까지
 */
const route = useRoute()
const projectId = route.params.projectId as string
definePageMeta({ key: (r) => `project-${String(r.params.projectId)}` })

const { data: projects } = useProjects()
const project = computed(() => projects.value?.find((p) => p.id === projectId) ?? null)
useHead({ title: () => (project.value?.name ? `${project.value.name} · Iris` : 'Iris') })
const access = useProjectAccess(projectId)

/** 개요 · 요청사항(주소 ?view=requests — 뒤로 가기 · 새로 고침에도 그대로) */
const view = computed<'overview' | 'requests'>(() => (route.query.view === 'requests' ? 'requests' : 'overview'))
function setView(v: 'overview' | 'requests') { navigateTo({ query: { ...route.query, view: v === 'overview' ? undefined : v } }) }
/** 제목 왼쪽 ←: 요청사항 보기면 개요로, 개요면 홈 프로젝트 목록으로 */
function goBack() { if (view.value === 'requests') setView('overview'); else navigateTo('/') }

// 캔버스: 페이지 + 화면(썸네일용 레이어까지) ------------------------------------
const supabase = useSupabaseClient()
const preview = useDevPreview()
const canvas = useAsyncData(`overview-canvas-${projectId}`, async () => {
  if (preview) {
    const pages = (PREVIEW_PROJECT_PAGES[projectId] ?? PREVIEW_PAGES).map((p) => ({ id: p.id, name: p.name, sort_order: p.sort_order }))
    return pages.map((p) => ({ ...p, screens: (PREVIEW_SCREENS[p.id] ?? []).map((s) => ({ id: s.id, source: s.source, x: s.x, y: s.y, width: s.width, height: s.height, thumbnail_path: s.thumbnail_path ?? null, layers: s.layers ?? null })) as ThumbScreen[] }))
  }
  const [pg, sc] = await Promise.all([
    supabase.from('pages').select('id, name, sort_order').eq('project_id', projectId).order('sort_order'),
    supabase.from('screens').select('id, page_id, source, x, y, width, height, thumbnail_path, layers, pages!inner(project_id)').eq('pages.project_id', projectId),
  ])
  if (pg.error) throw pg.error
  if (sc.error) throw sc.error
  const byPage = new Map<string, ThumbScreen[]>()
  for (const s of (sc.data ?? []) as unknown as (ThumbScreen & { page_id: string })[]) {
    const g = byPage.get(s.page_id) ?? []
    g.push(s)
    byPage.set(s.page_id, g)
  }
  return ((pg.data ?? []) as { id: string; name: string; sort_order: number }[]).map((p) => ({ ...p, screens: byPage.get(p.id) ?? [] }))
}, { server: false, default: () => [] as { id: string; name: string; sort_order: number; screens: ThumbScreen[] }[] })
/** 페이지를 누르면 그 페이지로 편집기 */
const pageHref = (id: string) => `/p/${projectId}?page=${encodeURIComponent(id)}`

// 요청사항 반영 진행도: 반영된 요청사항 / 해당 없음을 뺀 전체 --------------------------
const { reqs, links } = useRequirements(projectId)
const docs = useDocuments(projectId)
const progress = computed(() => {
  const byReq = new Map<string, LinkRow[]>()
  for (const l of links.data.value ?? []) { const a = byReq.get(l.requirement_id); if (a) a.push(l); else byReq.set(l.requirement_id, [l]) }
  let total = 0, done = 0
  for (const r of reqs.data.value ?? []) {
    const st = deriveReqStatus(byReq.get(r.id) ?? [])
    if (st === 'na') continue
    total++
    if (st === 'reflected') done++
  }
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
})
type LinkRow = import('~/composables/useIrisData').LinkRow

// 문서: 기획서 먼저, 그다음 개발 · 디자인 · 기타 ---------------------------------
const CAT_ORDER: DocCategory[] = ['planning', 'design', 'dev', 'etc']
const docGroups = computed(() => CAT_ORDER.map((k) => ({ k, label: DOC_CATEGORY_LABEL[k], items: (docs.data.value ?? []).filter((d) => d.category === k) })).filter((g) => g.items.length))
function docSub(d: DocRow) {
  const r = d.check_result
  const parts: string[] = []
  if (r && r.format !== 'none' && (r.policies || r.slots)) {
    parts.push(tr('Iris spec'))
    if (r.policies) parts.push(r.policies === 1 ? tr('1 request') : tr('{n} requests', { n: r.policies }))
    if (r.slots) parts.push(r.slots === 1 ? tr('1 screen slot') : tr('{n} screen slots', { n: r.slots }))
  } else parts.push(tr(DOC_SOURCE_TIP[d.source_type]))
  if (d.version_label) parts.push(d.version_label)
  return parts.join(' · ')
}
const warnCount = (d: DocRow) => d.check_result?.warnings?.length ?? 0

const addOpen = ref(false)
function onDocCreated(id: string) { docs.refresh(); navigateTo(`/project/${projectId}/read/${id}`) }
</script>

<template>
  <div class="ov">
    <!-- 머리 줄: 공용 ProjectHead(개요 · 요청사항 · 문서에서 보기가 같은 모양) -->
    <ProjectHead :project-id="projectId" :section="view === 'requests' ? tr('Requests') : null" :back-label="view === 'requests' ? tr('Back to overview') : tr('Back to home')" @back="goBack" />

    <!-- 요청사항 탭 -->
    <RequestsBoard v-if="view === 'requests'" :project-id="projectId" class="ov-board" />

    <!-- 개요 -->
    <div v-else class="ov-grid">
      <section class="sq card canvas-card" :aria-label="tr('Canvas')">
        <div class="card-h">
          <h2 class="ctitle">{{ tr('Canvas') }}</h2>
          <span class="f1" />
          <NuxtLink :to="`/p/${projectId}`" class="lnk">{{ tr('Open canvas') }}</NuxtLink>
        </div>
        <div v-if="canvas.status.value === 'pending' && !canvas.data.value.length" class="pages">
          <div v-for="i in 2" :key="i" class="sq pthumb-box" />
        </div>
        <div v-else-if="!canvas.data.value.length" class="page-empty"><p class="tx-meta">{{ tr('No pages yet') }}</p></div>
        <div v-else class="pages">
          <NuxtLink v-for="p in canvas.data.value" :key="p.id" :to="pageHref(p.id)" class="page">
            <span class="sq sq-clip pthumb-box"><PageThumb :screens="p.screens" /><span v-if="!p.screens.length" class="tx-meta no-frames">{{ tr('No frames yet') }}</span></span>
            <span class="tx-body pname ellipsis">{{ p.name }}</span>
          </NuxtLink>
        </div>
      </section>

      <div class="side">
        <!-- 요청사항: 전체 진행도만(시안) — 자세한 건 [View details] → 요청사항 탭 -->
        <section class="sq card" :aria-label="tr('Requests')">
          <div class="card-h">
            <h2 class="ctitle">{{ tr('Requests') }}</h2>
            <span class="f1" />
            <button type="button" class="lnk" @click="setView('requests')">{{ tr('View details') }}</button>
          </div>
          <template v-if="progress.total">
            <div class="pct-row"><b class="pct num">{{ progress.pct }}%</b><span class="tx-meta">{{ tr('{done} of {total} reflected', { done: progress.done, total: progress.total }) }}</span></div>
            <div class="sq bar" role="progressbar" :aria-label="tr('Requests reflected')" aria-valuemin="0" :aria-valuemax="progress.total" :aria-valuenow="progress.done"><span class="sq bar-in" :style="{ width: progress.pct + '%' }" /></div>
          </template>
          <p v-else class="tx-meta m0">{{ tr('No requests yet. Add a request table (ID · Request · Rules) to a document and they’re collected automatically') }}</p>
        </section>

        <section class="sq card docs-card" :aria-label="tr('Documents')">
          <div class="card-h">
            <h2 class="ctitle">{{ tr('Documents') }}</h2>
            <span class="tx-meta num">{{ docs.data.value?.length ?? 0 }}</span>
            <span class="f1" />
            <button type="button" class="lnk lnk-i" @click="addOpen = true"><EditorIcon name="plus" :size="14" />{{ tr('Add document') }}</button>
          </div>
          <div class="docs-sc">
            <div v-if="docs.status.value === 'pending' && !docs.data.value?.length"><Skeleton shape="text" /><Skeleton shape="text" width="70%" /></div>
            <p v-else-if="!docs.data.value?.length" class="tx-meta m0">{{ tr('No documents yet') }}</p>
            <div v-for="g in docGroups" :key="g.k" class="dgroup">
              <span class="tx-meta glabel">{{ tr(g.label) }}</span>
              <NuxtLink v-for="d in g.items" :key="d.id" :to="`/project/${projectId}/read/${d.id}`" class="sq drow">
                <span class="dicon" :title="tr(DOC_SOURCE_TIP[d.source_type])"><EditorIcon :name="docIcon(d)" :size="16" /></span>
                <span class="dcol">
                  <span class="dtitle"><b class="ellipsis">{{ d.title }}</b><span v-if="d.abbr" class="sq dabbr">{{ d.abbr }}</span></span>
                  <span class="tx-meta ellipsis">{{ docSub(d) }}</span>
                </span>
                <span v-if="warnCount(d)" class="sq dwarn num" :title="tr('{n} warnings', { n: warnCount(d) })">⚠ {{ warnCount(d) }}</span>
              </NuxtLink>
            </div>
          </div>
        </section>
      </div>
    </div>

    <AddDocModal v-model:open="addOpen" :project-id="projectId" @created="onDocCreated" />
    <AccessGate :project-id="projectId" :project-name="project?.name" />
  </div>
</template>

<style scoped>
/* 프로젝트 첫 화면: 탭 막대 아래 회색 바탕 + 흰 카드(시안 1). 안쪽 위 24 · 좌우 32 */
.ov { height: calc(100vh - var(--iris-tabs-h, 0px)); box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-12); padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-14); background: var(--iris-canvas); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); overflow: hidden; }
.f1 { flex: 1; }
.lnk { font-size: 12px; font-weight: 500; color: var(--sys-color-brand-primary-default); text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; border-radius: var(--ref-radius-02); }
.lnk:hover { color: var(--sys-color-brand-primary-dark, #1F63BD); }
.lnk:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.m0 { margin: 0; }
.ellipsis { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ov-board { flex: 1; min-height: 0; }
.ov-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: var(--ref-spacing-10); }
.card { min-height: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-12); border-radius: var(--ref-radius-07); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line); --sq-line-w: 1px; }
.card-h { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 22px; }
.card-h h2 { margin: 0; }
/* 카드 제목: 편집기 왼쪽 패널 'Pages' 와 같은 12/18 · 600 · neutral-800 */
.ctitle { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.lnk-i { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); }

/* 캔버스: 페이지 썸네일만(시안) — 두 칸씩, 칸 높이는 카드 높이에 맞춰요 */
.canvas-card { overflow: hidden; }
/* 썸네일은 홈 프로젝트 카드와 같은 3:2. 세로로만 스크롤 — 스크롤바는 흰 카드 오른쪽 끝에 붙게(카드 안쪽 여백만큼 밖으로 빼고 그만큼 안쪽 여백) */
.pages { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: var(--ref-spacing-10); overflow-x: hidden; overflow-y: auto; margin: 0 calc(-1 * var(--ref-spacing-12)) calc(-1 * var(--ref-spacing-12)) 0; padding: 0 var(--ref-spacing-12) var(--ref-spacing-12) 0; }
.page { display: flex; flex-direction: column; gap: var(--ref-spacing-06); min-width: 0; color: inherit; text-decoration: none; }
.pthumb-box { position: relative; flex: none; aspect-ratio: 3 / 2; border-radius: var(--ref-radius-06); --sq-fill: var(--iris-canvas); --sq-line: var(--iris-line); --sq-line-w: 1px; transition: --sq-line .12s; }
.page:hover .pthumb-box { --sq-line: var(--ref-color-gray-900-20); }
.page:focus-visible { outline: 0; }
.page:focus-visible .pthumb-box { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1.5px; }
.no-frames { position: absolute; inset: 0; display: grid; place-items: center; }
.pname { flex: none; font-weight: 600; }

.side { min-height: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.pct-row { display: flex; align-items: baseline; gap: var(--ref-spacing-04); }
.pct { font-size: 28px; line-height: 36px; font-weight: 700; color: var(--sys-color-neutral-900, var(--sys-color-neutral-800)); }
.bar { position: relative; height: 8px; border-radius: 4px; --sq-fill: var(--sys-color-neutral-200); overflow: hidden; }
.bar-in { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; --sq-fill: var(--iris-peek); transition: width .3s ease; }

.docs-card { flex: 1; overflow: hidden; }
.docs-sc { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); margin: 0 calc(-1 * var(--ref-spacing-04)); padding: 0 var(--ref-spacing-04); }
.dgroup { display: flex; flex-direction: column; gap: 2px; }
.glabel { padding: 0 var(--ref-spacing-04) var(--ref-spacing-02); font-weight: 600; color: var(--sys-color-neutral-600); }
.drow { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); padding: var(--ref-spacing-05) var(--ref-spacing-06); border-radius: var(--ref-radius-05); color: inherit; text-decoration: none; }
.drow:hover { --sq-fill: var(--sys-color-neutral-100); }
.drow:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.dicon { flex: none; margin-top: 1px; color: var(--sys-color-neutral-500); display: inline-flex; }
.dcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dtitle { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.dtitle b { font-weight: 500; }
.dabbr { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 600; color: var(--sys-color-neutral-600); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.dwarn { flex: none; height: 20px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: #B44A0E; --sq-fill: #FFF1E8; }
</style>
