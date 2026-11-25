<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { DocRow } from '~/composables/useIrisData'

/**
 * ⌘K 검색(빠른 이동). 스스로 ⌘K / Ctrl+K 를 듣기 때문에 어디에 하나만 두면 됩니다. v-model:open 은 선택.
 * 찾는 것: 굵직한 것만 — 프로젝트 · 컴포넌트(최근 프로젝트 편집기의 Assets 상세로) · 문서. (화면 · 레이어 · 요구사항 한 줄은 각 화면 안에서 찾아요)
 * 모양(피그마 빠른 찾기처럼): 폭 560 · 모서리 12 · 떠 있는 흰 면, 위 검색 줄 48(아이콘 20 · 글자 14) + 구분선,
 * 결과 행 36(아이콘 칸 24 · 이름 13/500 · 보조 12 neutral-500), 고른 행 --iris-sel. 아래 안내 줄 · ↵ 표시 없음.
 * 검색어가 없으면 최근 프로젝트 · 문서를 보여 줘요. 데이터는 처음 열 때 한 번 읽고(1분이 지나면 열 때 다시 읽음) 함께 써요.
 */
const open = defineModel<boolean>('open', { default: false })

type Kind = 'project' | 'component' | 'doc'
interface Item { key: string; kind: Kind; label: string; sub: string; to: string; hay: string }
interface DocHit { id: string; title: string; project_id: string }
interface Index { docs: DocHit[]; at: number; failed: boolean }

// 라벨은 영어 원문 — 그릴 때 tr
const GROUPS: { kind: Kind; label: string; icon: string }[] = [
  { kind: 'project', label: 'Projects', icon: 'folder' },
  { kind: 'component', label: 'Components', icon: 'component' },
  { kind: 'doc', label: 'Docs', icon: 'document' },
]
const LIMIT = 300
const STALE_MS = 60_000

const supabase = useSupabaseClient()
const preview = useDevPreview()
const { data: projects } = useProjects()
const { components } = useDesignSystem()

// 미리보기: 예시 문서는 preview-1 프로젝트 것으로 봅니다
const pvDocs = preview ? useDocuments('preview-1').data : ref<DocRow[] | undefined>(undefined)

const index = useState<Index | null>('cmdk-index', () => null)
const loading = ref(false)

async function load() {
  if (preview || loading.value) return
  if (index.value && Date.now() - index.value.at < STALE_MS) return
  loading.value = true
  try {
    const d = await supabase.from('documents').select('id, title, project_id').order('updated_at', { ascending: false }).limit(LIMIT)
    index.value = { docs: (d.data ?? []) as DocHit[], at: Date.now(), failed: !!d.error }
  } catch {
    index.value = { docs: [], at: Date.now(), failed: true }
  } finally {
    loading.value = false
  }
}

const docs = computed<DocHit[]>(() => (preview ? (pvDocs.value ?? []).map((d) => ({ id: d.id, title: d.title, project_id: 'preview-1' })) : index.value?.docs ?? []))
const failed = computed(() => !preview && !!index.value?.failed)

const projectName = computed(() => new Map((projects.value ?? []).map((p) => [p.id, p.name])))
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const items = computed<Item[]>(() => {
  const pn = (id: string) => projectName.value.get(id) ?? ''
  const out: Item[] = (projects.value ?? []).map((p) => ({ key: 'p-' + p.id, kind: 'project', label: p.name, sub: statusLabel(p.status), to: `/p/${p.id}`, hay: '' }))
  // 컴포넌트: 가장 최근 프로젝트 편집기의 Assets 상세로(디자인 시스템 화면은 Assets 로 합쳤어요)
  const recent = (projects.value ?? [])[0]?.id
  if (recent) for (const c of components.data.value ?? []) out.push({ key: 'c-' + c.id, kind: 'component', label: c.name, sub: c.category ? tr(c.category) : '', to: `/p/${recent}?asset=${encodeURIComponent(c.id)}`, hay: '' })
  for (const x of docs.value) out.push({ key: 'd-' + x.id, kind: 'doc', label: x.title, sub: pn(x.project_id), to: `/p/${x.project_id}?doc=${x.id}`, hay: '' })
  for (const it of out) it.hay = norm(it.label + ' ' + it.sub)
  return out
})

// 검색 ----------------------------------------------------------------------
const query = ref('')
const active = ref(0)

const groups = computed(() => {
  const q = norm(query.value)
  const words = q ? q.split(' ') : []
  return GROUPS.map((g) => {
    // 검색어 없을 때: 최근 프로젝트 5 · 문서 5(컴포넌트는 찾을 때만)
    if (!q && g.kind === 'component') return { ...g, list: [] as Item[] }
    let list = items.value.filter((it) => it.kind === g.kind && words.every((w) => it.hay.includes(w)))
    if (q) {
      const rank = (it: Item) => { const l = norm(it.label); return l.startsWith(q) ? 0 : l.includes(q) ? 1 : 2 }
      list = list.map((it, i) => ({ it, i, r: rank(it) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.it)
    }
    return { ...g, list: list.slice(0, q ? 8 : 5) }
  }).filter((g) => g.list.length)
})
const flat = computed(() => groups.value.flatMap((g) => g.list))
const activeItem = computed(() => flat.value[active.value])
watch(query, () => { active.value = 0 })
watch(flat, (list) => { if (active.value >= list.length) active.value = Math.max(0, list.length - 1) })

const loadingFirst = computed(() => !preview && loading.value && !index.value)

function go(it: Item | undefined) {
  if (!it) return
  open.value = false
  navigateTo(it.to)
}

// 열기 · 닫기 · 키보드 --------------------------------------------------------
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
      <section role="dialog" aria-modal="true" :aria-label="tr('Search')" class="sq pop dialog" style="--pop-w: 560px" @keydown="onDialogKey">
        <label class="head">
          <EditorIcon name="search" :size="20" />
          <input
            ref="input"
            v-model="query"
            type="text"
            role="combobox"
            :aria-label="tr('Search projects, components and docs')"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="cmdk-list"
            :aria-activedescendant="activeItem ? optId(activeItem) : undefined"
            :placeholder="tr('Search projects, components and docs')"
            autocomplete="off"
            spellcheck="false"
            @keydown="onInputKey"
          >
          <button v-if="query" type="button" class="sq clr" :aria-label="tr('Clear search')" @mousedown.prevent @click="query = ''; input?.focus()"><EditorIcon name="close" :size="12" /></button>
        </label>

        <div id="cmdk-list" ref="listEl" class="list" role="listbox" :aria-label="tr('Search results')">
          <p v-if="failed" class="warn" role="status">{{ tr("Some items couldn't be loaded") }}</p>
          <div v-for="g in groups" :key="g.kind" role="group" :aria-labelledby="`cmdk-g-${g.kind}`" class="kg">
            <div :id="`cmdk-g-${g.kind}`" class="kg-h">{{ !query && g.kind === 'project' ? tr('Recent projects') : !query && g.kind === 'doc' ? tr('Recent docs') : tr(g.label) }}</div>
            <div
              v-for="it in g.list"
              :id="optId(it)"
              :key="it.key"
              role="option"
              :aria-selected="activeItem?.key === it.key"
              :class="['sq', 'kr', { cur: activeItem?.key === it.key }]"
              @mousemove="active = flat.indexOf(it)"
              @mousedown.prevent
              @click="go(it)"
            >
              <span class="sq ico" aria-hidden="true"><EditorIcon :name="g.icon" :size="16" /></span>
              <span class="label">{{ it.label }}</span>
              <span v-if="it.sub" class="sub">{{ it.sub }}</span>
            </div>
          </div>
          <div v-if="!flat.length" class="empty" role="status">
            <EditorIcon name="search" :size="20" />
            <span>{{ loadingFirst ? tr('Loading…') : query.trim() ? tr('No results for “{q}”', { q: query.trim() }) : tr('Nothing to show yet') }}</span>
          </div>
        </div>

      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start; padding: 14vh var(--ref-spacing-12) var(--ref-spacing-12); background: var(--dimmed-bg); font-family: var(--font-family-base); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
/* 창 모양(모서리 · 면 · 그림자)은 팝업 공통 .pop(프로필 창 기준). 검색 창이라 위쪽(14vh)에 떠요 */
.dialog { max-height: 64vh; }
/* 검색 줄 48: 아이콘 20(왼쪽 16) · 글자 14 · 지우기 20 */
.head { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); height: 48px; box-sizing: border-box; padding: 0 var(--ref-spacing-08) 0 var(--ref-spacing-10); box-shadow: 0 1px 0 var(--iris-line); color: var(--sys-color-neutral-500); cursor: text; }
.head input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font-family: inherit; font-size: 14px; line-height: 20px; color: var(--sys-color-neutral-800); }
.head input::placeholder { color: var(--sys-color-neutral-500); }
.clr { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-600); }
.clr:hover { --sq-fill: var(--sys-color-neutral-300); color: var(--sys-color-neutral-800); }
.list { flex: 1; min-height: 0; overflow: auto; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-06); }
.kg { display: flex; flex-direction: column; }
.kg + .kg { margin-top: var(--ref-spacing-04); }
.kg-h { padding: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-02); font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-500); }
/* 결과 행 36: 아이콘 칸 24(옅은 회색 · 모서리 6) · 이름 13/500 · 보조 12 */
.kr { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 36px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); cursor: pointer; }
.kr.cur { --sq-fill: var(--iris-sel); }
.ico { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); }
.kr.cur .ico { --sq-fill: var(--sys-color-common-white-emphasis); color: var(--sys-color-brand-primary-default); }
.label { flex: 0 1 auto; min-width: 0; font-size: 13px; line-height: 20px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { flex: 1 1 0; min-width: 0; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-14) var(--ref-spacing-08); color: var(--sys-color-neutral-500); text-align: center; }
.warn { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); color: var(--sys-color-theme-error-default); }
</style>
