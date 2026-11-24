<script setup lang="ts">
import { Button, Icon, SearchField, Skeleton, TextButton } from '@ba-dream/design-system'
import type { LinkRow, LinkStatus, ReqRow } from '~/composables/useIrisData'

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
  missing: LINK_STATUS.missing.label,
  partial: LINK_STATUS.partial.label,
  reflected: LINK_STATUS.reflected.label,
  na: LINK_STATUS.na.label,
  none: '연결 안 됨',
}
const TODO: ReqStatus[] = ['missing', 'none', 'partial']

function deriveStatus(list: LinkRow[]): ReqStatus {
  if (!list.length) return 'none'
  const real = list.filter((x) => x.status !== 'na')
  if (!real.length) return 'na'
  if (real.some((x) => x.status === 'missing')) return 'missing'
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
    const names = links.map((l) => screenById.value.get(l.screen_id)?.name ?? '이름 없는 화면')
    return {
      req,
      status: deriveStatus(links),
      links,
      doc: doc?.title ?? '문서 없음',
      docVersion: doc?.version_label ?? '',
      screen: names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}` : '') : '',
    }
  }),
)

// ---------------------------------------------------------------------------
// 거르기 · 찾기
// ---------------------------------------------------------------------------
const filter = ref<FilterKey>('all')
const query = ref('')
const filters: { key: 'all' | ReqStatus; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'missing', label: STATUS_TEXT.missing },
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
  if (query.value.trim()) return '찾는 요구사항이 없어요'
  if (filter.value === 'todo') return '손볼 요구사항이 없어요. 모두 반영됐어요'
  return '이 상태의 요구사항이 없어요'
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
function onDocClick(e: MouseEvent) {
  if (addOpen.value && addRef.value && !addRef.value.contains(e.target as Node)) addOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (addOpen.value) addOpen.value = false
  else if (unlinking.value) unlinking.value = null
  else selectedId.value = null
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})

// ---------------------------------------------------------------------------
// 내보내기 (CSV, 엑셀에서 바로 열리게 BOM 포함)
// ---------------------------------------------------------------------------
function exportCsv() {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const head = ['번호', '요구사항', '문서', '화면', '중요도', '상태']
  const body = shown.value.map((r) => [
    r.req.code,
    r.req.title,
    r.doc + (r.docVersion ? ` ${r.docVersion}` : ''),
    r.links.map((l) => `${screenById.value.get(l.screen_id)?.name ?? ''}(${LINK_STATUS[l.status].label})`).join(', '),
    r.req.priority ? PRIORITY_LABEL[r.req.priority] : '',
    STATUS_TEXT[r.status],
  ])
  const csv = '﻿' + [head, ...body].map((line) => line.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `요구사항-${project.value?.name ?? projectId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="shell">
    <AppTopBar />

    <!-- 왼쪽: 프로젝트 고르기 -->
    <aside aria-label="프로젝트" class="sq float side">
      <div v-if="projectsStatus === 'pending'" class="side-sk">
        <Skeleton v-for="i in 4" :key="i" shape="text" />
      </div>
      <p v-else-if="projectsError" class="tx-meta side-empty">프로젝트를 불러오지 못했어요</p>
      <p v-else-if="!projects?.length" class="tx-meta side-empty">아직 프로젝트가 없어요</p>
      <template v-else>
        <template v-if="activeProjects.length">
          <span class="nav-label">진행 중</span>
          <NuxtLink v-for="p in activeProjects" :key="p.id" :to="{ query: { p: p.id } }" :class="['sq', 'nav-item', 's', { on: p.id === projectId }]" :aria-current="p.id === projectId ? 'page' : undefined">
            <span class="ellipsis">{{ p.name }}</span>
          </NuxtLink>
        </template>
        <template v-if="doneProjects.length">
          <span class="nav-label" :class="{ gap: activeProjects.length }">완료</span>
          <NuxtLink v-for="p in doneProjects" :key="p.id" :to="{ query: { p: p.id } }" :class="['sq', 'nav-item', 's', { on: p.id === projectId }]" :aria-current="p.id === projectId ? 'page' : undefined">
            <span class="ellipsis">{{ p.name }}</span>
          </NuxtLink>
        </template>
      </template>
    </aside>

    <!-- 가운데: 요구사항 표 -->
    <main class="sq float body"><div class="scroller">
      <div class="head">
        <div class="title-col">
          <h1 class="tx-title">요구사항</h1>
          <span v-if="project" class="tx-meta">{{ project.name }}</span>
        </div>
        <div class="actions">
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="download" :disabled="!shown.length" @click="exportCsv">내보내기</Button>
          <Button v-if="projectId" size="s" type="primary" contents="icon-text" icon-name="plus" @click="navigateTo(`/p/${projectId}`)">요구사항 추가</Button>
        </div>
      </div>

      <div v-if="!projectId" class="empty">
        <p class="tx-meta">{{ projectsError ? '프로젝트를 불러오지 못했어요' : '프로젝트를 먼저 만들어 주세요' }}</p>
        <Button v-if="projectsError" size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="reload()">다시 불러오기</Button>
        <Button v-else size="s" type="tertiary" stroke @click="navigateTo('/')">프로젝트로 가기</Button>
      </div>

      <template v-else>
        <div class="tools">
          <div class="seg filters" role="tablist" aria-label="상태 거르기">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              role="tab"
              :aria-selected="filter === f.key"
              :class="['sq', 'seg-item', { on: filter === f.key }]"
              @click="filter = f.key"
            >
              {{ f.label }} <span class="n num">{{ count(f.key) }}</span>
            </button>
          </div>
          <div class="tools-right">
            <Button size="s" type="tertiary" :stroke="filter !== 'todo'" contents="icon-text" :icon-name="filter === 'todo' ? 'check' : 'warning'" :aria-pressed="filter === 'todo'" @click="toggleTodo">
              미반영 모아보기 <span class="num">{{ count('todo') }}</span>
            </Button>
            <SearchField v-model:value="query" class="search" type="contained" size="s" placeholder="번호나 내용으로 찾기" :input-props="{ 'aria-label': '요구사항 검색' }" />
          </div>
        </div>

        <div v-if="failed" class="empty">
          <p class="tx-meta">요구사항을 불러오지 못했어요</p>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="reload()">다시 불러오기</Button>
        </div>

        <table v-else class="grid">
          <thead>
            <tr>
              <th scope="col" class="tx-meta c-code">번호</th>
              <th scope="col" class="tx-meta">요구사항</th>
              <th scope="col" class="tx-meta c-doc">문서</th>
              <th scope="col" class="tx-meta c-screen">화면</th>
              <th scope="col" class="tx-meta c-pri">중요도</th>
              <th scope="col" class="tx-meta c-status">상태</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 8" :key="i" class="sk">
              <td><Skeleton shape="text" width="48px" /></td>
              <td><Skeleton shape="text" width="70%" /></td>
              <td><Skeleton shape="text" width="80%" /></td>
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
              <td class="tx-meta"><span class="ellipsis" :title="r.doc + (r.docVersion ? ` · ${r.docVersion}` : '')">{{ r.doc }}<template v-if="r.docVersion"> · {{ r.docVersion }}</template></span></td>
              <td class="tx-body"><span :class="['ellipsis', r.screen ? 'linked' : 'unlinked']" :title="r.screen || undefined">{{ r.screen || STATUS_TEXT.none }}</span></td>
              <td class="tx-meta">{{ r.req.priority ? PRIORITY_LABEL[r.req.priority] : '—' }}</td>
              <td class="tx-body">
                <span class="status">
                  <StatusIcon v-if="r.status !== 'none'" :status="r.status" :size="12" />
                  <span v-else class="st-none" aria-hidden="true" />
                  {{ STATUS_TEXT[r.status] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && !failed && !rows.length" class="empty">
          <p class="tx-meta">아직 요구사항이 없어요. 문서에 REQ-001 같은 번호를 적으면 자동으로 모아요</p>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="document" @click="navigateTo(`/p/${projectId}`)">문서 추가하러 가기</Button>
        </div>
        <div v-else-if="!loading && !failed && !shown.length" class="empty">
          <p class="tx-meta">{{ emptyText }}</p>
          <TextButton size="s" color="blue" @click="clearFilters">거르기 지우기</TextButton>
        </div>
      </template>
    </div></main>

    <!-- 오른쪽: 선택한 요구사항 -->
    <aside v-if="selected" aria-label="요구사항 상세" class="sq float detail"><div class="scroller">
      <div class="sec-h d-top">
        <span class="num">{{ selected.req.code }}</span>
        <button type="button" class="ib s" aria-label="닫기" @click="selectedId = null"><Icon name="close" :size="14" /></button>
      </div>
      <div class="d-pad">
        <p class="tx-body d-title">{{ selected.req.title }}</p>
        <p v-if="selected.req.body" class="tx-read">{{ selected.req.body }}</p>
        <div class="sq summary">
          <div class="kv"><span class="tx-meta">상태</span>
            <span class="status tx-body">
              <StatusIcon v-if="selected.status !== 'none'" :status="selected.status" :size="12" />
              <span v-else class="st-none" aria-hidden="true" />
              {{ STATUS_TEXT[selected.status] }}
            </span>
          </div>
          <div class="kv"><span class="tx-meta">중요도</span><span class="tx-body">{{ selected.req.priority ? PRIORITY_LABEL[selected.req.priority] : '정하지 않음' }}</span></div>
          <div class="kv"><span class="tx-meta">문서</span><span class="tx-body ellipsis" :title="selected.doc + (selected.docVersion ? ` · ${selected.docVersion}` : '')">{{ selected.doc }}<template v-if="selected.docVersion"> · {{ selected.docVersion }}</template></span></div>
        </div>
        <TextButton class="src" size="s" color="blue" contents="text-icon" icon-name="arrow_up_right" @click="navigateTo(sourceHref(selected.req))">원문 보기</TextButton>
      </div>

      <section class="sec">
        <div class="sec-h">
          <span>연결된 화면 <span class="tx-meta num">{{ selected.links.length }}</span></span>
          <div ref="addRef" class="add">
            <button type="button" class="ib s" aria-label="화면 연결" :aria-expanded="addOpen" :disabled="saving" @click.stop="addOpen = !addOpen"><Icon name="plus" :size="14" /></button>
            <div v-if="addOpen" class="sq menu" role="menu">
              <p v-if="!linkable.length" class="tx-meta menu-empty">더 연결할 화면이 없어요</p>
              <button v-for="s in linkable" :key="s.id" type="button" role="menuitem" class="sq menu-item" :title="s.name" @click="link(s.id)">
                <span class="ellipsis">{{ s.name }}</span><span class="tx-meta menu-page">{{ s.page }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="d-pad cards">
          <div v-if="!selectedLinks.length" class="no-link">
            <p class="tx-meta">아직 연결된 화면이 없어요</p>
            <TextButton size="s" color="blue" contents="icon-text" icon-name="plus" :disabled="saving" @click.stop="addOpen = true">화면 연결</TextButton>
          </div>
          <div v-for="{ link: l, screen } in selectedLinks" :key="l.screen_id" class="sq card">
            <div class="card-row">
              <button type="button" class="sq st-btn" :disabled="saving" :aria-label="`상태 바꾸기: 지금 ${LINK_STATUS[l.status].label}`" :title="`눌러서 ${LINK_STATUS[NEXT_STATUS[l.status]].label}(으)로 바꿔요`" @click="cycle(l)">
                <StatusIcon :status="l.status" :size="12" />
              </button>
              <div class="card-col">
                <NuxtLink :to="`/p/${projectId}?screen=${l.screen_id}`" class="tx-body card-name ellipsis" :title="screen?.name ?? undefined">{{ screen?.name ?? '이름 없는 화면' }}</NuxtLink>
                <span class="tx-meta ellipsis">{{ LINK_STATUS[l.status].label }}<template v-if="screen?.page"> · {{ screen.page }}</template></span>
              </div>
              <button type="button" class="ib s" :disabled="saving" aria-label="연결 끊기" :aria-expanded="unlinking === l.screen_id" @click="unlinking = unlinking === l.screen_id ? null : l.screen_id"><Icon name="trashbin" :size="14" /></button>
            </div>
            <p v-if="l.note" class="sq tx-body note">{{ l.note }}</p>
            <div v-if="unlinking === l.screen_id" class="unlink" role="alertdialog" :aria-label="`${screen?.name ?? '화면'} 연결 끊기`">
              <span class="tx-meta">이 화면과의 연결을 끊을까요?</span>
              <Button size="s" type="tertiary" @click="unlinking = null">취소</Button>
              <Button size="s" type="destructed" :loading="saving" @click="unlink(l)">끊기</Button>
            </div>
          </div>
          <p v-if="saveError" class="tx-meta err" role="alert">바꾸지 못했어요. 잠시 뒤 다시 해 주세요</p>
        </div>
      </section>
    </div></aside>
  </div>
</template>

<style scoped>
.shell { height: 100vh; position: relative; overflow: hidden; box-sizing: border-box; padding: 56px var(--iris-gap) var(--iris-gap); display: flex; gap: var(--iris-gap); background: var(--iris-canvas); font-size: 12px; line-height: 18px; }

/* 왼쪽 프로젝트 */
.side { flex: 0 0 264px; box-sizing: border-box; padding: var(--ref-spacing-10) var(--ref-spacing-04) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-02); overflow: auto; }
.side .nav-label.gap { margin-top: var(--ref-spacing-10); }
.side-empty { margin: 0; padding: 0 var(--ref-spacing-08); }
.side-sk { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-04) var(--ref-spacing-08); }

/* 가운데 표 */
.body { flex: 1; min-width: 0;   box-sizing: border-box;  overflow: hidden; display: flex; flex-direction: column; }
.body > .scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-14) var(--ref-spacing-14) var(--ref-spacing-19); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-10); }
.title-col { display: flex; align-items: baseline; gap: var(--ref-spacing-06); min-width: 0; }
.actions { display: flex; gap: var(--ref-spacing-04); }
.tools { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-08); margin: var(--ref-spacing-12) 0 var(--ref-spacing-08); }
.filters { margin-left: calc(-1 * var(--ref-spacing-06)); flex-wrap: wrap; }
.tools-right { display: flex; align-items: center; gap: var(--ref-spacing-04); flex: none; }
.search { width: 220px; }

.grid { width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed; }
.grid th { padding: var(--ref-spacing-06) var(--ref-spacing-04); box-shadow: inset 0 -1px 0 var(--sys-color-neutral-800); }
.grid td { padding: var(--ref-spacing-08) var(--ref-spacing-04); vertical-align: top; }
.grid tbody tr { box-shadow: inset 0 -1px 0 var(--iris-line); }
.grid tbody tr:not(.sk) { cursor: pointer; }
.grid td { transition: background-color .12s ease; }
.grid tbody tr:not(.sk):hover td { background: var(--interaction-light-gray-hover); }
.grid tbody tr:not(.sk):active td { background: var(--interaction-light-gray-pressed); }
.grid tbody tr.on td, .grid tbody tr.on:hover td { background: var(--sys-color-neutral-100); }
.grid tbody tr.on .t-title { font-weight: 500; }
.grid tbody tr:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.c-code { width: 84px; }
.c-doc { width: 170px; }
.c-screen { width: 150px; }
.c-pri { width: 64px; }
.c-status { width: 96px; }
.nowrap { white-space: nowrap; }
.ellipsis { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.linked { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.unlinked { color: var(--sys-color-neutral-500); }
.status { display: inline-flex; align-items: center; gap: var(--ref-spacing-04); white-space: nowrap; }
.st-none { display: block; flex: none; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--sys-color-neutral-300); }
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-17) 0; text-align: center; }
.empty p { margin: 0; }

/* 오른쪽 상세 */
.detail { flex: 0 0 320px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
.detail > .scroller { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding-bottom: var(--ref-spacing-10); }
.d-top { height: 40px; }
.ib.s { width: 24px; height: 24px; }
.ib:disabled { opacity: .5; cursor: default; }
.ib:disabled:hover { --sq-overlay: transparent; }
.d-pad { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-08) var(--ref-spacing-10); }
.d-pad p { margin: 0; }
.d-title { font-weight: 500; }
.summary { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); }
.kv { display: grid; grid-template-columns: 48px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-06); }
.src { align-self: flex-start; }
.no-link { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); }
.add { position: relative; }
.add .menu { left: auto; right: 0; width: 220px; max-height: 240px; overflow: auto; }
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
.err { color: var(--sys-color-theme-destructed-default); }
</style>
