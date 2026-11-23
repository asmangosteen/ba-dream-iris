<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { DocRow, ReqRow } from '~/composables/useIrisData'

/**
 * ⌘K 검색(커맨드 팔레트). 스스로 ⌘K / Ctrl+K 를 듣기 때문에 어디에 하나만 두면 됩니다.
 * v-model:open 은 선택 — 바깥 버튼으로 열 때만 연결하면 됩니다.
 * 데이터는 처음 열 때 한 번 읽고(1분이 지나면 열 때 다시 읽음), 앱 안에서 같이 씁니다.
 */
const open = defineModel<boolean>('open', { default: false })

type Kind = 'project' | 'screen' | 'doc' | 'req'
interface Item { key: string; kind: Kind; label: string; sub: string; to: string; hay: string }
interface ScreenHit { id: string; name: string; page: string; project_id: string }
interface DocHit { id: string; title: string; project_id: string }
interface ReqHit { id: string; code: string; title: string; project_id: string; document_id: string }
interface Index { screens: ScreenHit[]; docs: DocHit[]; reqs: ReqHit[]; at: number; failed: boolean }

const GROUPS: { kind: Kind; label: string; icon: string }[] = [
  { kind: 'project', label: '프로젝트', icon: 'box' },
  { kind: 'screen', label: '화면', icon: 'phone' },
  { kind: 'doc', label: '문서', icon: 'document' },
  { kind: 'req', label: '요구사항', icon: 'list' },
]
const LIMIT = 200
const STALE_MS = 60_000

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { data: projects } = useProjects()

// 미리보기: 예시 데이터(모든 예시 화면 · 문서 · 요구사항은 preview-1 프로젝트 것으로 봅니다)
const pvDocs = preview ? useDocuments('preview-1').data : ref<DocRow[] | undefined>(undefined)
const pvReqs = preview ? useRequirements('preview-1').reqs.data : ref<ReqRow[] | undefined>(undefined)

const index = useState<Index | null>('cmdk-index', () => null)
const loading = ref(false)

async function load() {
  if (preview || loading.value) return
  if (index.value && Date.now() - index.value.at < STALE_MS) return
  loading.value = true
  try {
    const [s, d, r] = await Promise.all([
      supabase.from('screens').select('id, name, pages!inner(name, project_id)').order('updated_at', { ascending: false }).limit(LIMIT),
      supabase.from('documents').select('id, title, project_id').order('updated_at', { ascending: false }).limit(LIMIT),
      supabase.from('requirements').select('id, code, title, project_id, document_id').order('created_at', { ascending: false }).limit(LIMIT),
    ])
    const screens = ((s.data ?? []) as unknown as { id: string; name: string; pages: { name: string; project_id: string } }[])
      .map((x) => ({ id: x.id, name: x.name, page: x.pages.name, project_id: x.pages.project_id }))
    index.value = {
      screens,
      docs: (d.data ?? []) as DocHit[],
      reqs: (r.data ?? []) as ReqHit[],
      at: Date.now(),
      failed: !!(s.error || d.error || r.error),
    }
  } catch {
    index.value = { screens: [], docs: [], reqs: [], at: Date.now(), failed: true }
  } finally {
    loading.value = false
  }
}

const source = computed(() => {
  if (!preview) return index.value
  const screens = Object.entries(PREVIEW_SCREENS).flatMap(([pageId, list]) =>
    list.map((x) => ({ id: x.id, name: x.name, page: PREVIEW_PAGES.find((p) => p.id === pageId)?.name ?? '', project_id: 'preview-1' })))
  return { screens, docs: pvDocs.value ?? [], reqs: pvReqs.value ?? [], at: 0, failed: false } satisfies Index
})

const projectName = computed(() => new Map((projects.value ?? []).map((p) => [p.id, p.name])))
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const items = computed<Item[]>(() => {
  const pn = (id: string) => projectName.value.get(id) ?? ''
  const out: Item[] = (projects.value ?? []).map((p) => ({ key: 'p-' + p.id, kind: 'project', label: p.name, sub: STATUS_LABEL[p.status] ?? '', to: `/p/${p.id}`, hay: '' }))
  const src = source.value
  if (src) {
    for (const x of src.screens) out.push({ key: 's-' + x.id, kind: 'screen', label: x.name, sub: [pn(x.project_id), x.page].filter(Boolean).join(' · '), to: `/p/${x.project_id}?screen=${x.id}`, hay: '' })
    for (const x of src.docs) out.push({ key: 'd-' + x.id, kind: 'doc', label: x.title, sub: pn(x.project_id), to: `/p/${x.project_id}?doc=${x.id}`, hay: '' })
    for (const x of src.reqs) out.push({ key: 'r-' + x.id, kind: 'req', label: `${x.code} ${x.title}`, sub: pn(x.project_id), to: `/p/${x.project_id}?doc=${x.document_id}&req=${x.id}`, hay: '' })
  }
  for (const it of out) it.hay = norm(it.label + ' ' + it.sub)
  return out
})

// 검색 ----------------------------------------------------------------------
const query = ref('')
const active = ref(0)

const groups = computed(() => {
  const q = norm(query.value)
  const words = q ? q.split(' ') : []
  const per = q ? 8 : 5
  return GROUPS.map((g) => {
    let list = items.value.filter((it) => it.kind === g.kind && words.every((w) => it.hay.includes(w)))
    if (q) {
      const rank = (it: Item) => { const l = norm(it.label); return l.startsWith(q) ? 0 : l.includes(q) ? 1 : 2 }
      list = list.map((it, i) => ({ it, i, r: rank(it) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.it)
    }
    return { ...g, list: list.slice(0, per) }
  }).filter((g) => g.list.length)
})
const flat = computed(() => groups.value.flatMap((g) => g.list))
const activeItem = computed(() => flat.value[active.value])
watch(query, () => { active.value = 0 })
watch(flat, (list) => { if (active.value >= list.length) active.value = Math.max(0, list.length - 1) })

const loadingFirst = computed(() => !preview && loading.value && !index.value)
const emptyText = computed(() => {
  if (flat.value.length) return ''
  if (loadingFirst.value) return '불러오는 중이에요'
  return query.value.trim() ? `'${query.value.trim()}'에 맞는 결과가 없어요` : '아직 볼 수 있는 항목이 없어요'
})

function go(it: Item | undefined) {
  if (!it) return
  open.value = false
  navigateTo(it.to)
}

// 열기 · 닫기 · 키보드 --------------------------------------------------------
const dialog = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

watch(open, async (v) => {
  if (v) {
    query.value = ''
    active.value = 0
    returnFocus = document.activeElement as HTMLElement | null
    load()
    await nextTick()
    input.value?.focus()
  } else {
    await nextTick()
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus?.()
    returnFocus = null
  }
})

function move(d: number) {
  const n = flat.value.length
  if (!n) return
  active.value = (active.value + d + n) % n
  nextTick(() => listEl.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}
function onInputKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Home' && flat.value.length) { e.preventDefault(); active.value = 0; move(0) }
  else if (e.key === 'End' && flat.value.length) { e.preventDefault(); active.value = flat.value.length - 1; move(0) }
  else if (e.key === 'Enter') { e.preventDefault(); go(activeItem.value) }
}
function onDialogKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open.value = false; return }
  // 포커스는 검색칸에 둡니다(목록은 aria-activedescendant 로 따라갑니다)
  if (e.key === 'Tab') { e.preventDefault(); input.value?.focus() }
}

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
function onGlobalKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.metaKey || e.ctrlKey)) return
  if (e.key.toLowerCase() !== 'k' && e.code !== 'KeyK') return
  if (open.value) { e.preventDefault(); open.value = false; return }
  if (isTyping(e.target)) return
  e.preventDefault()
  open.value = true
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

const optId = (it: Item) => 'cmdk-' + it.key
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @mousedown.self="open = false">
      <section ref="dialog" role="dialog" aria-modal="true" aria-label="검색" class="sq dialog" @keydown="onDialogKey">
        <div class="head">
          <label class="field m">
            <Icon name="search" :size="16" color="var(--sys-color-neutral-500)" />
            <input
              ref="input"
              v-model="query"
              type="text"
              role="combobox"
              aria-label="프로젝트 · 화면 · 문서 · 요구사항 검색"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="cmdk-list"
              :aria-activedescendant="activeItem ? optId(activeItem) : undefined"
              placeholder="프로젝트 · 화면 · 문서 · 요구사항 찾기"
              autocomplete="off"
              spellcheck="false"
              @keydown="onInputKey"
            >
            <kbd class="tx-meta esc">Esc</kbd>
          </label>
        </div>

        <div id="cmdk-list" ref="listEl" class="list" role="listbox" aria-label="검색 결과">
          <div v-for="g in groups" :key="g.kind" role="group" :aria-labelledby="`cmdk-g-${g.kind}`" class="grp-wrap">
            <div :id="`cmdk-g-${g.kind}`" class="tx-meta grp-h">{{ g.label }}</div>
            <div
              v-for="it in g.list"
              :id="optId(it)"
              :key="it.key"
              role="option"
              :aria-selected="activeItem?.key === it.key"
              :class="['sq', 'row', { cur: activeItem?.key === it.key }]"
              @mousemove="active = flat.indexOf(it)"
              @mousedown.prevent
              @click="go(it)"
            >
              <Icon :name="g.icon" :size="16" color="var(--sys-color-neutral-600)" />
              <span class="tx-body label">{{ it.label }}</span>
              <span v-if="it.sub" class="tx-meta sub">{{ it.sub }}</span>
              <Icon v-if="activeItem?.key === it.key" name="chevron_right" :size="14" color="var(--sys-color-neutral-500)" />
            </div>
          </div>
          <p v-if="emptyText" class="tx-meta empty" role="status">{{ emptyText }}</p>
        </div>

        <div class="foot tx-meta">
          <span><kbd>↑</kbd><kbd>↓</kbd> 이동</span>
          <span><kbd>Enter</kbd> 열기</span>
          <span><kbd>Esc</kbd> 닫기</span>
          <span v-if="source?.failed" class="warn">일부 항목을 불러오지 못했어요</span>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start; padding: 12vh var(--ref-spacing-12) var(--ref-spacing-12); background: var(--dimmed-bg); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 560px; max-height: 76vh; display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-default); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.head { padding: var(--ref-spacing-08); box-shadow: 0 1px 0 var(--iris-line); }
.field.m:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.esc { flex: none; }
.list { flex: 1; min-height: 0; overflow: auto; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-06); }
.grp-wrap + .grp-wrap { margin-top: var(--ref-spacing-04); }
.grp-h { padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-02); }
.row { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 28px; box-sizing: border-box; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); cursor: pointer; }
.row.cur { --sq-fill: var(--sys-color-neutral-100); }
.label { flex: 0 1 auto; min-width: 0; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { margin: 0; padding: var(--ref-spacing-14) var(--ref-spacing-08); text-align: center; }
.foot { display: flex; align-items: center; gap: var(--ref-spacing-10); padding: var(--ref-spacing-06) var(--ref-spacing-10); box-shadow: 0 -1px 0 var(--iris-line); }
.foot kbd { font-family: var(--font-family-base); font-size: 12px; margin-right: var(--ref-spacing-02); }
.warn { margin-left: auto; color: var(--sys-color-theme-error-default); }
kbd { font-family: var(--font-family-base); }
</style>
