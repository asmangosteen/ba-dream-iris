<script setup lang="ts">
import { Button, SearchField, Skeleton, TextButton } from '@ba-dream/design-system'
import type { LinkRow, LinkStatus, ReqRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 요구사항 보드 — 프로젝트 전체 요구사항을 반영 상태로 거르고, 하나를 누르면 연결된 화면과 상태를 봅니다.
 * 프로젝트는 주소 `?p=<id>` 에 둡니다(없으면 첫 프로젝트). 프로젝트가 바뀌면 페이지를 새로 그려 데이터를 다시 읽습니다.
 *
 * 요구사항 전체 상태(연결된 화면들의 상태에서 정합니다, 손볼 것이 이깁니다):
 *  1. 연결된 화면이 없으면 → 연결 안 됨
 *  2. 연결이 모두 '해당 없음'이면 → 해당 없음
 *  3. '해당 없음'을 뺀 연결 중 하나라도 미반영이면 → 미반영
 *  4. 그렇지 않고 하나라도 일부 반영이면 → 일부 반영
 *  5. 모두 반영됨이면 → 반영됨
 * '미반영 모아보기'는 미반영 · 연결 안 됨 · 일부 반영을 손볼 순서대로 모아 보여 줍니다.
 */
definePageMeta({ key: (route) => `requirements-${String(route.query.p ?? '')}` })

type ReqStatus = LinkStatus | 'none'
type FilterKey = 'all' | ReqStatus | 'todo'

const STATUS_TEXT: Record<ReqStatus, string> = {
  unchecked: LINK_STATUS.unchecked.label,
  missing: LINK_STATUS.missing.label,
  partial: LINK_STATUS.partial.label,
  reflected: LINK_STATUS.reflected.label,
  na: LINK_STATUS.na.label,
  none: 'Not linked',
}
const TODO: ReqStatus[] = ['missing', 'none', 'unchecked', 'partial']

function deriveStatus(list: LinkRow[]): ReqStatus {
  if (!list.length) return 'none'
  const real = list.filter((x) => x.status !== 'na')
  if (!real.length) return 'na'
  if (real.some((x) => x.status === 'missing')) return 'missing'
  if (real.some((x) => x.status === 'unchecked')) return 'unchecked'
  if (real.some((x) => x.status === 'partial')) return 'partial'
  return 'reflected'
}

// ---------------------------------------------------------------------------
// 프로젝트
// ---------------------------------------------------------------------------
const route = useRoute()
const { data: projects, status: projectsStatus, error: projectsError, refresh: refreshProjects } = await useProjects()
const projectId = (typeof route.query.p === 'string' && route.query.p) || projects.value?.[0]?.id || ''
const project = computed(() => projects.value?.find((p) => p.id === projectId) ?? null)
const activeProjects = computed(() => (projects.value ?? []).filter((p) => p.status !== 'done'))
const doneProjects = computed(() => (projects.value ?? []).filter((p) => p.status === 'done'))
// 제목 옆 프로젝트 고르기 메뉴
const pickOpen = ref(false)
const pickRef = ref<HTMLElement | null>(null)
function onPickDown(e: MouseEvent) { if (pickOpen.value && pickRef.value && !pickRef.value.contains(e.target as Node)) pickOpen.value = false }
function onPickKey(e: KeyboardEvent) { if (e.key === 'Escape' && pickOpen.value) pickOpen.value = false }
onMounted(() => { document.addEventListener('mousedown', onPickDown); document.addEventListener('keydown', onPickKey) })
onBeforeUnmount(() => { document.removeEventListener('mousedown', onPickDown); document.removeEventListener('keydown', onPickKey) })

// ---------------------------------------------------------------------------
// 데이터 (프로젝트가 있을 때만 읽습니다)
// ---------------------------------------------------------------------------
const board = projectId
  ? { ...useRequirements(projectId), docs: useDocuments(projectId), screens: useProjectScreens(projectId) }
  : null
const { setLink, removeLink } = useIrisMutations()

const loading = computed(() => !!board && [board.reqs, board.links, board.docs, board.screens].some((x) => x.status.value === 'pending' || x.status.value === 'idle'))
const failed = computed(() => !!board && [board.reqs, board.links].some((x) => !!x.error.value))
function reload() {
  if (!board) return refreshProjects()
  return Promise.all([board.reqs.refresh(), board.links.refresh(), board.docs.refresh(), board.screens.refresh()])
}

const docById = computed(() => new Map((board?.docs.data.value ?? []).map((d) => [d.id, d])))
const screenById = computed(() => new Map((board?.screens.data.value ?? []).map((s) => [s.id, s])))
const linksByReq = computed(() => {
  const m = new Map<string, LinkRow[]>()
  for (const l of board?.links.data.value ?? []) {
    const arr = m.get(l.requirement_id)
    if (arr) arr.push(l)
    else m.set(l.requirement_id, [l])
  }
  return m
})

interface BoardRow {
  req: ReqRow
  status: ReqStatus
  links: LinkRow[]
  doc: string
  docVersion: string
  screen: string
}
const rows = computed<BoardRow[]>(() =>
  (board?.reqs.data.value ?? []).map((req) => {
    const links = linksByReq.value.get(req.id) ?? []
    const doc = docById.value.get(req.document_id)
    const names = links.map((l) => screenById.value.get(l.screen_id)?.name ?? tr('Untitled screen'))
    return {
      req,
      status: deriveStatus(links),
      links,
      doc: doc?.title ?? tr('No document'),
      docVersion: doc?.version_label ?? '',
      screen: names.length ? (names.length > 1 ? tr('{name} +{n} more', { name: names[0]!, n: names.length - 1 }) : names[0]!) : '',
    }
  }),
)

// ---------------------------------------------------------------------------
// 거르기 · 찾기
// ---------------------------------------------------------------------------
const filter = ref<FilterKey>('all')
const query = ref('')
const filters: { key: 'all' | ReqStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: STATUS_TEXT.missing },
  { key: 'unchecked', label: STATUS_TEXT.unchecked },
  { key: 'partial', label: STATUS_TEXT.partial },
  { key: 'reflected', label: STATUS_TEXT.reflected },
  { key: 'na', label: STATUS_TEXT.na },
  { key: 'none', label: STATUS_TEXT.none },
]
const count = (k: FilterKey) =>
  k === 'all' ? rows.value.length : k === 'todo' ? rows.value.filter((r) => TODO.includes(r.status)).length : rows.value.filter((r) => r.status === k).length

const shown = computed(() => {
  const f = filter.value
  const q = query.value.trim().toLowerCase()
  let list = rows.value.filter((r) => (f === 'all' ? true : f === 'todo' ? TODO.includes(r.status) : r.status === f))
  if (q) list = list.filter((r) => r.req.code.toLowerCase().includes(q) || r.req.title.toLowerCase().includes(q) || r.doc.toLowerCase().includes(q))
  if (f === 'todo') list = [...list].sort((a, b) => TODO.indexOf(a.status) - TODO.indexOf(b.status))
  return list
})
const emptyText = computed(() => {
  if (query.value.trim()) return tr('No matching requests')
  if (filter.value === 'todo') return tr('Nothing to fix. Everything is reflected')
  return tr('No requests with this status')
})
function toggleTodo() {
  filter.value = filter.value === 'todo' ? 'all' : 'todo'
}
function clearFilters() {
  filter.value = 'all'
  query.value = ''
}

// ---------------------------------------------------------------------------
// 선택한 요구사항 — 연결된 화면 · 상태
// ---------------------------------------------------------------------------
const selectedId = ref<string | null>(null)
const selected = computed(() => rows.value.find((r) => r.req.id === selectedId.value) ?? null)
const selectedLinks = computed(() => {
  const s = selected.value
  if (!s) return []
  return [...s.links]
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    .map((l) => ({ link: l, screen: screenById.value.get(l.screen_id) ?? null }))
})
const linkable = computed(() => {
  const s = selected.value
  if (!s) return []
  const used = new Set(s.links.map((l) => l.screen_id))
  return (board?.screens.data.value ?? []).filter((x) => !used.has(x.id))
})
function select(id: string) {
  selectedId.value = selectedId.value === id ? null : id
  addOpen.value = false
  saveError.value = false
  unlinking.value = null
}
const sourceHref = (r: ReqRow) => `/p/${projectId}?doc=${encodeURIComponent(r.document_id)}&req=${encodeURIComponent(r.id)}`

const saving = ref(false)
const saveError = ref(false)
async function mutate(fn: () => Promise<void>) {
  if (saving.value || !board) return
  saving.value = true
  saveError.value = false
  try {
    await fn()
    await board.links.refresh()
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}
const cycle = (l: LinkRow) => mutate(() => setLink({ ...l, status: NEXT_STATUS[l.status] }))
/** 연결 끊기는 두 번 확인합니다: 휴지통 → 카드 안 확인 줄 */
const unlinking = ref<string | null>(null)
async function unlink(l: LinkRow) {
  await mutate(() => removeLink(l.screen_id, l.requirement_id))
  unlinking.value = null
}
function link(screenId: string) {
  const s = selected.value
  addOpen.value = false
  if (!s) return
  mutate(() => setLink({ screen_id: screenId, requirement_id: s.req.id, status: 'missing', note: null }))
}

// 화면 연결 고르기 드롭다운
const addOpen = ref(false)
const addRef = ref<HTMLElement | null>(null)
/** 바깥 누르기로 닫기 — 서비스 공통 규칙(utils/dismiss.ts)에 맞춰 누를 때(pointerdown, capture) 닫아요 */
function onDocClick(e: PointerEvent) {
  if (addOpen.value && addRef.value && !addRef.value.contains(e.target as Node)) addOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (addOpen.value) addOpen.value = false
  else if (unlinking.value) unlinking.value = null
  else selectedId.value = null
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocClick, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocClick, true)
  document.removeEventListener('keydown', onKey)
})

// ---------------------------------------------------------------------------
// 내보내기 (CSV, 엑셀에서 바로 열리게 BOM 포함)
// ---------------------------------------------------------------------------
function exportCsv() {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = [tr('ID'), tr('Request'), tr('Document'), tr('Screens'), tr('Priority'), tr('Status')]
  const body = shown.value.map((r) => [
    r.req.code,
    r.req.title,
    r.doc + (r.docVersion ? ` ${r.docVersion}` : ''),
    r.links.map((l) => `${screenById.value.get(l.screen_id)?.name ?? ''}(${tr(LINK_STATUS[l.status].label)})`).join(', '),
    r.req.priority ? tr(PRIORITY_LABEL[r.req.priority]) : '',
    tr(STATUS_TEXT[r.status]),
  ])
  const csv = '﻿' + [head, ...body].map((line) => line.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = tr('Requests-{name}.csv', { name: project.value?.name ?? projectId })
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <AppShell>
  <div class="shell">

    <!-- 가운데: 요구사항 표 -->
    <main class="sq float body"><div class="scroller">
      <div class="head">
        <div class="title-col">
          <h1 class="ttl">{{ tr('Requests') }}</h1>
          <!-- 프로젝트 고르기: 따로 있던 프로젝트 목록 칸 대신 제목 옆 메뉴(검은 메뉴) -->
          <div v-if="projects?.length" ref="pickRef" class="pick">
            <button type="button" class="sq pick-btn" aria-haspopup="menu" :aria-expanded="pickOpen" @click="pickOpen = !pickOpen">
              <span class="ellipsis">{{ project?.name ?? tr('Choose a project') }}</span><EditorIcon name="chevron_down" :size="12" />
            </button>
            <div v-if="pickOpen" class="sq menu pick-menu" role="menu" @click="pickOpen = false">
              <div class="menu-sc">
              <template v-if="activeProjects.length">
                <span class="menu-lbl">{{ tr('Active') }}</span>
                <NuxtLink v-for="p in activeProjects" :key="p.id" :to="{ query: { p: p.id } }" role="menuitemradio" :aria-checked="p.id === projectId" :class="['sq', 'menu-item', { on: p.id === projectId }]"><span class="ellipsis">{{ p.name }}</span></NuxtLink>
              </template>
              <template v-if="doneProjects.length">
                <div v-if="activeProjects.length" class="msep" role="separator" />
                <span class="menu-lbl">{{ tr('Completed') }}</span>
                <NuxtLink v-for="p in doneProjects" :key="p.id" :to="{ query: { p: p.id } }" role="menuitemradio" :aria-checked="p.id === projectId" :class="['sq', 'menu-item', { on: p.id === projectId }]"><span class="ellipsis">{{ p.name }}</span></NuxtLink>
              </template>
              </div>
            </div>
          </div>
        </div>
        <div class="actions">
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="download" :disabled="!shown.length" @click="exportCsv">{{ tr('Export') }}</Button>
          <Button v-if="projectId" size="s" type="primary" contents="icon-text" icon-name="plus" @click="navigateTo(`/p/${projectId}`)">{{ tr('Add request') }}</Button>
        </div>
      </div>

      <div v-if="!projectId" class="page-empty">
        <p class="tx-meta">{{ projectsError ? tr("Couldn't load projects") : tr('Create a project first') }}</p>
        <Button v-if="projectsError" size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="reload()">{{ tr('Reload') }}</Button>
        <Button v-else size="s" type="tertiary" stroke @click="navigateTo('/')">{{ tr('Go to projects') }}</Button>
      </div>

      <template v-else>
        <div class="tools">
          <div class="seg filters" role="tablist" :aria-label="tr('Filter by status')">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              role="tab"
              :aria-selected="filter === f.key"
              :class="['sq', 'seg-item', { on: filter === f.key }]"
              @click="filter = f.key"
            >
              {{ tr(f.label) }} <span class="n num">{{ count(f.key) }}</span>
            </button>
          </div>
          <div class="tools-right">
            <Button size="s" type="tertiary" :stroke="filter !== 'todo'" contents="icon-text" :icon-name="filter === 'todo' ? 'check' : 'warning'" :aria-pressed="filter === 'todo'" @click="toggleTodo">
              {{ tr('Needs work') }} <span class="num">{{ count('todo') }}</span>
            </Button>
            <SearchField v-model:value="query" class="search" type="contained" size="s" :placeholder="tr('Search by ID or text')" :input-props="{ 'aria-label': tr('Search requests') }" />
          </div>
        </div>

        <div v-if="failed" class="page-empty">
          <p class="tx-meta">{{ tr("Couldn't load requests") }}</p>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="reload()">{{ tr('Reload') }}</Button>
        </div>

        <div v-else class="table-wrap"><table class="grid">
          <thead>
            <tr>
              <th scope="col" class="tx-meta c-code">{{ tr('ID') }}</th>
              <th scope="col" class="tx-meta">{{ tr('Request') }}</th>
              <th scope="col" class="tx-meta c-doc">{{ tr('Document') }}</th>
              <th scope="col" class="tx-meta c-screen">{{ tr('Screens') }}</th>
              <th scope="col" class="tx-meta c-pri">{{ tr('Priority') }}</th>
              <th scope="col" class="tx-meta c-status">{{ tr('Status') }}</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 8" :key="i" class="sk">
              <td><Skeleton shape="text" width="48px" /></td>
              <td><Skeleton shape="text" width="70%" /></td>
              <td class="c-doc"><Skeleton shape="text" width="80%" /></td>
              <td><Skeleton shape="text" width="80%" /></td>
              <td><Skeleton shape="text" width="32px" /></td>
              <td><Skeleton shape="text" width="56px" /></td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr
              v-for="r in shown"
              :key="r.req.id"
              :class="{ on: selectedId === r.req.id }"
              tabindex="0"
              :aria-selected="selectedId === r.req.id"
              @click="select(r.req.id)"
              @keydown.enter.prevent="select(r.req.id)"
              @keydown.space.prevent="select(r.req.id)"
            >
              <td class="tx-head nowrap num">{{ r.req.code }}</td>
              <td class="tx-body t-title">{{ r.req.title }}</td>
              <td class="tx-meta c-doc"><span class="ellipsis" :title="r.doc + (r.docVersion ? ` · ${r.docVersion}` : '')">{{ r.doc }}<template v-if="r.docVersion"> · {{ r.docVersion }}</template></span></td>
              <td class="tx-body"><span :class="['ellipsis', r.screen ? 'linked' : 'unlinked']" :title="r.screen || undefined">{{ r.screen || tr(STATUS_TEXT.none) }}</span></td>
              <td class="tx-meta">{{ r.req.priority ? tr(PRIORITY_LABEL[r.req.priority]) : '—' }}</td>
              <td class="tx-body">
                <span class="status">
                  <StatusIcon v-if="r.status !== 'none'" :status="r.status" :size="12" />
                  <span v-else class="st-none" aria-hidden="true" />
                  {{ tr(STATUS_TEXT[r.status]) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table></div>

        <div v-if="!loading && !failed && !rows.length" class="page-empty">
          <p class="tx-meta">{{ tr('No requests yet. Add a request table (ID · Request · Rules) to a document and they’re collected automatically') }}</p>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="document" @click="navigateTo(`/p/${projectId}`)">{{ tr('Add a document') }}</Button>
        </div>
        <div v-else-if="!loading && !failed && !shown.length" class="page-empty">
          <p class="tx-meta">{{ emptyText }}</p>
          <TextButton size="s" color="blue" @click="clearFilters">{{ tr('Clear filters') }}</TextButton>
        </div>
      </template>
    </div></main>

    <!-- 오른쪽: 선택한 요구사항 -->
    <aside v-if="selected" :aria-label="tr('Request details')" class="sq float detail"><div class="scroller">
      <div class="sec-h d-top">
        <span class="num">{{ selected.req.code }}</span>
        <button type="button" class="ib s" :aria-label="tr('Close')" @click="selectedId = null"><EditorIcon name="close" :size="14" /></button>
      </div>
      <div class="d-pad">
        <p class="tx-body d-title">{{ selected.req.title }}</p>
        <p v-if="selected.req.body" class="tx-read">{{ selected.req.body }}</p>
        <div class="sq summary">
          <div class="kv"><span class="tx-meta">{{ tr('Status') }}</span>
            <span class="status tx-body">
              <StatusIcon v-if="selected.status !== 'none'" :status="selected.status" :size="12" />
              <span v-else class="st-none" aria-hidden="true" />
              {{ tr(STATUS_TEXT[selected.status]) }}
            </span>
          </div>
          <div class="kv"><span class="tx-meta">{{ tr('Priority') }}</span><span class="tx-body">{{ selected.req.priority ? tr(PRIORITY_LABEL[selected.req.priority]) : tr('Not set') }}</span></div>
          <div class="kv"><span class="tx-meta">{{ tr('Document') }}</span><span class="tx-body ellipsis" :title="selected.doc + (selected.docVersion ? ` · ${selected.docVersion}` : '')">{{ selected.doc }}<template v-if="selected.docVersion"> · {{ selected.docVersion }}</template></span></div>
        </div>
        <TextButton class="src" size="s" color="blue" contents="text-icon" icon-name="arrow_up_right" @click="navigateTo(sourceHref(selected.req))">{{ tr('View source') }}</TextButton>
      </div>

      <section class="sec">
        <div class="sec-h">
          <span>{{ tr('Linked screens') }} <span class="tx-meta num">{{ selected.links.length }}</span></span>
          <div ref="addRef" class="add">
            <button type="button" class="ib s" :aria-label="tr('Link a screen')" :aria-expanded="addOpen" :disabled="saving" @click.stop="addOpen = !addOpen"><EditorIcon name="plus" :size="14" /></button>
            <div v-if="addOpen" class="sq menu" role="menu">
              <div class="menu-sc">
              <p v-if="!linkable.length" class="tx-meta menu-empty">{{ tr('No more screens to link') }}</p>
              <button v-for="s in linkable" :key="s.id" type="button" role="menuitem" class="sq menu-item" :title="s.name" @click="link(s.id)">
                <span class="ellipsis">{{ s.name }}</span><span class="tx-meta menu-page">{{ s.page }}</span>
              </button>
              </div>
            </div>
          </div>
        </div>
        <div class="d-pad cards">
          <div v-if="!selectedLinks.length" class="no-link">
            <p class="tx-meta">{{ tr('No linked screens yet') }}</p>
            <TextButton size="s" color="blue" contents="icon-text" icon-name="plus" :disabled="saving" @click.stop="addOpen = true">{{ tr('Link a screen') }}</TextButton>
          </div>
          <div v-for="{ link: l, screen } in selectedLinks" :key="l.screen_id" class="sq card">
            <div class="card-row">
              <button type="button" class="sq st-btn" :disabled="saving" :aria-label="tr('Change status: currently {status}', { status: tr(LINK_STATUS[l.status].label) })" :title="tr('Click to change to {status}', { status: tr(LINK_STATUS[NEXT_STATUS[l.status]].label) })" @click="cycle(l)">
                <StatusIcon :status="l.status" :size="12" />
              </button>
              <div class="card-col">
                <NuxtLink :to="`/p/${projectId}?screen=${l.screen_id}`" class="tx-body card-name ellipsis" :title="screen?.name ?? undefined">{{ screen?.name ?? tr('Untitled screen') }}</NuxtLink>
                <span class="tx-meta ellipsis">{{ tr(LINK_STATUS[l.status].label) }}<template v-if="screen?.page"> · {{ screen.page }}</template></span>
              </div>
              <button type="button" class="ib s" :disabled="saving" :aria-label="tr('Unlink')" :aria-expanded="unlinking === l.screen_id" @click="unlinking = unlinking === l.screen_id ? null : l.screen_id"><EditorIcon name="trashbin" :size="14" /></button>
            </div>
            <p v-if="l.note" class="sq tx-body note">{{ l.note }}</p>
            <div v-if="unlinking === l.screen_id" class="unlink" role="alertdialog" :aria-label="tr('Unlink {name}', { name: screen?.name ?? tr('Untitled screen') })">
              <span class="tx-meta">{{ tr('Unlink this screen?') }}</span>
              <Button size="s" type="tertiary" @click="unlinking = null">{{ tr('Cancel') }}</Button>
              <Button size="s" type="destructed" :loading="saving" @click="unlink(l)">{{ tr('Unlink') }}</Button>
            </div>
          </div>
          <p v-if="saveError" class="tx-meta err" role="alert">{{ tr("Couldn't save the change. Try again in a moment") }}</p>
        </div>
      </section>
    </div></aside>
  </div>
  </AppShell>
</template>

<style scoped>
/* 홈 틀(AppShell) 본문 안: 떠 있는 카드 없이 흰 면 하나 — 목록 · 본문 · 상세는 세로 선 1px 로 나눠요 */
.shell { flex: 1; min-height: 0; position: relative; overflow: hidden; box-sizing: border-box; display: flex; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; }

/* 가운데 표 */
.body { flex: 1; min-width: 0;   box-sizing: border-box;  overflow: hidden; display: flex; flex-direction: column; }
.body > .scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-19); }
/* 제목 줄: 프로젝트 목록과 같은 제목 20/600 + 프로젝트 고르기(글자 버튼 ▾) */
.ttl { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; white-space: nowrap; }
.pick { position: relative; min-width: 0; }
.pick-btn { display: flex; align-items: center; gap: var(--ref-spacing-03); max-width: 320px; height: 28px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-size: 13px; line-height: 20px; color: var(--sys-color-neutral-600); }
.pick-btn:hover, .pick-btn[aria-expanded='true'] { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.pick-btn :deep(.eic) { flex: none; color: var(--sys-color-neutral-500); }
.pick-menu { left: 0; right: auto; top: calc(100% + 4px); width: 240px; }
.pick-menu .menu-sc { max-height: 344px; }
/* 고른 프로젝트는 왼쪽 ✓ 칸(편집기 고르는 목록과 같아요) */
.pick-menu .menu-item { padding-left: 26px; background-repeat: no-repeat; background-position: 8px center; background-size: 12px; }
.menu-lbl { padding-left: 26px !important; }
.menu-lbl { display: block; padding: var(--ref-spacing-02) var(--ref-spacing-06); font-size: 11px; line-height: 16px; color: rgb(255 255 255 / 50%); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-10); min-height: 32px; }
.title-col { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.actions { display: flex; gap: var(--ref-spacing-04); }
/* 거르기 줄: 왼쪽 상태 세그먼트(한 줄, 넘치면 가로로) · 오른쪽 손볼 것 + 검색 */
/* 페이지 공통: 제목 → 거르기 줄 12, 거르기 줄 → 내용 16, 알약 왼쪽 끝은 제목과 같은 선(프로젝트 화면과 같아요) */
.tools { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-08); margin: var(--ref-spacing-08) 0 var(--ref-spacing-10); flex-wrap: wrap; }
.filters { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.tools-right { display: flex; align-items: center; gap: var(--ref-spacing-04); flex: none; }
.search { width: 200px; }

/* 표: 좁으면 가로로 밀려요(요구사항 칸이 한 글자 폭으로 눌리지 않게 최소 560). 머리 줄은 옅은 선 */
.table-wrap { overflow-x: auto; margin: 0 calc(-1 * var(--ref-spacing-04)); padding: 0 var(--ref-spacing-04); }
.grid { width: 100%; min-width: 560px; border-collapse: collapse; text-align: left; table-layout: fixed; }
.grid th { padding: var(--ref-spacing-06) var(--ref-spacing-06); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: inset 0 -1px 0 var(--iris-line); }
.grid td { padding: var(--ref-spacing-07, 10px) var(--ref-spacing-06); vertical-align: top; }
.grid tbody tr { box-shadow: inset 0 -1px 0 var(--iris-line); }
.grid tbody tr:not(.sk) { cursor: pointer; }
.grid td { transition: background-color .12s ease; }
.grid tbody tr:not(.sk):hover td { background: var(--interaction-light-gray-hover); }
.grid tbody tr:not(.sk):active td { background: var(--interaction-light-gray-pressed); }
.grid tbody tr.on td, .grid tbody tr.on:hover td { background: var(--sys-color-neutral-100); }
.grid tbody tr.on .t-title { font-weight: 500; }
.grid tbody tr:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 본문이 좁으면(상세 패널을 열었을 때 등) 문서 칸은 숨겨요 — 상세 패널에 문서가 나와요 */
.body { container-type: inline-size; }
@container (max-width: 860px) { .c-doc { display: none; } }
.c-code { width: 84px; }
.c-doc { width: 180px; }
.c-screen { width: 132px; }
.c-pri { width: 72px; }
.c-status { width: 116px; }
.nowrap { white-space: nowrap; }
.ellipsis { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.linked { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.unlinked { color: var(--sys-color-neutral-500); }
.status { display: inline-flex; align-items: center; gap: var(--ref-spacing-04); white-space: nowrap; }
.st-none { display: block; flex: none; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--sys-color-neutral-300); }

/* 오른쪽 상세 */
.detail { flex: 0 0 340px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
.detail > .scroller { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding-bottom: var(--ref-spacing-10); }
.d-top { height: 48px; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-10) !important; }
.ib.s { width: 24px; height: 24px; }
.ib:disabled { opacity: .5; cursor: default; }
.ib:disabled:hover { --sq-overlay: transparent; }
.d-pad { display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: 0 var(--ref-spacing-10) var(--ref-spacing-10); }
.d-pad p { margin: 0; }
.d-title { font-size: 14px; line-height: 22px; font-weight: 600; }
.summary { display: flex; flex-direction: column; gap: var(--ref-spacing-05); padding: var(--ref-spacing-08) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); }
.kv { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-06); }
.src { align-self: flex-start; }
.no-link { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); }
.add { position: relative; }
.add .menu { left: auto; right: 0; width: 220px; }
.add .menu .menu-sc { max-height: 224px; }
.menu-item { justify-content: space-between; flex: none; }
.menu-page { flex: none; }
.menu-empty { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); }
.cards { gap: var(--ref-spacing-04); }
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.card-row { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.card-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.card-name { font-weight: 500; }
.card-name { transition: color .12s ease; }
.card-name:hover { color: var(--sys-color-brand-primary-default); }
.card-name:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; border-radius: var(--ref-radius-01); }
.st-btn { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border-radius: var(--ref-radius-03); margin-left: calc(-1 * var(--ref-spacing-04)); }
.st-btn:hover { --sq-fill: var(--interaction-light-gray-hover); }
.st-btn:active { --sq-fill: var(--interaction-light-gray-pressed); }
.st-btn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.st-btn:disabled { cursor: default; --sq-fill: transparent; }
.unlink { display: flex; align-items: center; gap: var(--ref-spacing-04); padding-top: var(--ref-spacing-06); box-shadow: inset 0 1px 0 var(--iris-line); }
.unlink > span { flex: 1; min-width: 0; }
.note { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.err { color: var(--sys-color-theme-error-default); }
.shell > .float { --sq-fill: transparent; --sq-line: transparent; --sq-line-w: 0px; filter: none; border-radius: 0; }
.shell > .float + .float { border-left: 1px solid var(--iris-line); }
</style>
