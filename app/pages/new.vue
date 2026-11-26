<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import ScreenThumb from '~/components/editor/ScreenThumb.vue'
/** 웹 · 데스크톱 화면이면 넓은 표지(폭 768 이상 — 태블릿 · 데스크톱 프레임) */
const isWide = (s: { width: number }) => s.width >= 768
import { KIND_INFO, type ProjectKind } from '~/composables/useProjectActions'
import { useTabs } from '~/composables/useTabs'

/**
 * 새 탭(New file, 피그마 데스크탑의 새 탭처럼) — 위 탭 막대의 + · 빈 곳 두 번 누르기로 열려요.
 * - 맨 위 종류 알약(App · Web · Detail page): 누르면 바로 'Untitled' 프로젝트를 만들어 이 탭에서 열어요(이름은 편집기에서 두 번 눌러 바꿔요)
 * - 검색 칸 + Recents(최근 고친 순): 행을 누르면 그 프로젝트를 이 탭에서 열어요
 * - 열거나 만들면 이 탭(New file)이 그 자리에서 프로젝트 탭으로 바뀌어요(useTabs.adopt)
 * 규격: 흰 면 · 내용 폭 최대 960 가운데 · 알약 48(아이콘 20 · 글자 14/500) · 검색 44(neutral-100) · 행 72(썸네일 96 × 64 · 이름 14/500 · 시각 12 neutral-500)
 */
useHead({ title: () => `${tr('New file')} · Iris` })

const { data: projects, status, error, refresh } = useProjects()
const { data: covers, status: coverStatus } = useProjectCovers()
const actions = useProjectActions()
const { adopt } = useTabs()

const q = ref('')
const recents = computed(() => {
  const all = [...(projects.value ?? [])].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  const s = q.value.trim().toLowerCase()
  return s ? all.filter((p) => p.name.toLowerCase().includes(s)) : all
})

/** 종류 알약 아이콘(편집기 아이콘 이름) */
const KIND_ICON: Record<ProjectKind, string> = {
  app: 'project_app',
  web: 'project_web',
  detail_page: 'project_detail_page',
}

const busy = ref<ProjectKind | null>(null)
const err = ref('')

/** 이 탭을 그 프로젝트 탭으로 바꾸고 열어요(뒤로 가기로 새 탭에 돌아오지 않게 replace) */
function go(id: string) {
  adopt(id)
  return navigateTo(`/p/${id}`, { replace: true })
}
async function create(kind: ProjectKind) {
  if (busy.value) return
  busy.value = kind
  err.value = ''
  try { await go(await actions.create(tr('Untitled'), kind)) }
  catch { err.value = tr("Couldn't create the project. Try again in a moment.") }
  busy.value = null
}
/** 행 클릭: ⌘ · Ctrl · 가운데 클릭은 브라우저에 맡기고, 그냥 클릭이면 이 탭에서 열어요 */
function onOpen(e: MouseEvent, id: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  go(id)
}
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && recents.value[0]) { e.preventDefault(); go(recents.value[0].id) }
  else if (e.key === 'Escape' && q.value) { e.preventDefault(); q.value = '' }
}
</script>

<template>
  <main class="newtab">
    <div class="inner">
      <h1 class="sr">{{ tr('New file') }}</h1>
      <div class="kinds" role="group" :aria-label="tr('Start a new project')">
        <button v-for="(k, key) in KIND_INFO" :key="key" type="button" class="sq pill" :disabled="!!busy" :aria-busy="busy === key || undefined" :aria-label="tr('New {kind} project', { kind: tr(k.label) })" @click="create(key)">
          <EditorIcon :name="KIND_ICON[key]" :size="20" />
          <span class="pl">{{ tr(k.label) }}</span>
        </button>
      </div>
      <p v-if="err" class="tx-meta err" role="alert">{{ err }}</p>

      <label class="sq search">
        <EditorIcon name="search" :size="20" />
        <input v-model="q" type="search" :placeholder="tr('Search projects')" :aria-label="tr('Search projects')" autocomplete="off" spellcheck="false" @keydown="onSearchKey">
      </label>

      <h2 class="rh">{{ tr('Recents') }}</h2>
      <div v-if="status === 'pending' || status === 'idle'" class="list" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="row skel"><span class="sq thumb" /><span class="sq bar" /></div>
      </div>
      <p v-else-if="error" class="tx-meta empty">{{ tr('Could not load projects') }} · <button type="button" class="link" @click="refresh()">{{ tr('Reload') }}</button></p>
      <p v-else-if="!recents.length" class="tx-meta empty">{{ q.trim() ? tr('No results for “{q}”', { q: q.trim() }) : tr('No projects yet') }}</p>
      <ul v-else class="list">
        <li v-for="p in recents" :key="p.id">
          <a :href="`/p/${p.id}`" class="sq row" @click="onOpen($event, p.id)">
            <span class="sq sq-clip thumb" aria-hidden="true"><span v-if="covers?.[p.id]?.custom" class="full"><ScreenThumb :screen="covers[p.id]!" fit="cover" /></span><span v-else-if="covers?.[p.id]" :class="['sq', 'cover', { wide: isWide(covers[p.id]!) }]"><span class="sqc sq-clip-inner"><ScreenThumb :screen="covers[p.id]!" :fit="isWide(covers[p.id]!) ? 'top' : 'width'" /></span></span><span v-else-if="coverStatus === 'success'" class="sq ghost" /></span>
            <span class="col">
              <span class="name">{{ p.name }}</span>
              <span class="tx-meta">{{ relativeTime(p.updated_at) }}</span>
            </span>
          </a>
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
/* 새 탭: 탭 막대 아래 흰 면(홈 틀과 같은 바탕) — 내용은 폭 최대 960 가운데, 위 80 */
.newtab { height: calc(100vh - var(--iris-tabs-h, 0px)); box-sizing: border-box; overflow: auto; padding: var(--ref-spacing-21) var(--ref-spacing-14) var(--ref-spacing-19); background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); font-size: 12px; line-height: 18px; }
.inner { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; }
/* 종류 알약: 48 · 둥근 선 1px · 아이콘 20 + 이름 14/500 + 크기(옅게) */
.kinds { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ref-spacing-06); }
.pill { height: 48px; box-sizing: border-box; display: inline-flex; align-items: center; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-11) 0 var(--ref-spacing-10); border-radius: var(--ref-radius-12); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; color: var(--sys-color-neutral-800); font-size: 14px; line-height: 20px; transition: opacity .12s ease; }
.pill:hover:not(:disabled) { --sq-fill: var(--interaction-light-gray-hover); }
.pill:active:not(:disabled) { --sq-fill: var(--interaction-light-gray-pressed); }
.pill:focus-visible { outline: 0; }
:global(html.kbd-nav) .pill:focus-visible { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1.5px; }
.pill:disabled { cursor: default; opacity: .5; }
.pill[aria-busy] { opacity: 1; }
.pl { font-weight: 500; }
.err { margin: var(--ref-spacing-06) 0 0; text-align: center; color: var(--sys-color-theme-error-default); }
/* 검색 칸 44 · neutral-100 */
.search { margin-top: var(--ref-spacing-14); height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-500); cursor: text; }
.search:hover { --sq-fill: var(--sys-color-neutral-200); }
.search:focus-within { --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; padding: 0; background: none; color: var(--sys-color-neutral-800); font: inherit; font-size: 14px; line-height: 20px; }
.search input::placeholder { color: var(--sys-color-neutral-500); }
.search input::-webkit-search-cancel-button { display: none; }
/* Recents: 머리 13/600 · 행 72(썸네일 96 × 64 · 사이 12) */
.rh { margin: var(--ref-spacing-14) 0 var(--ref-spacing-04); padding: 0 var(--ref-spacing-04); font-size: 13px; line-height: 20px; font-weight: 600; color: var(--sys-color-neutral-800); }
.list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.row { height: 72px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-08); padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-06); color: inherit; text-decoration: none; }
a.row:hover { --sq-fill: var(--interaction-light-gray-hover); }
a.row:focus-visible { outline: 0; }
:global(html.kbd-nav) a.row:focus-visible { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1.5px; }
.thumb { flex: none; width: 96px; height: 64px; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; overflow: hidden; }
/* 화면 표지: 홈 카드와 같은 방식(바깥 선 안에 squircle 로 자른 그림, 아래는 썸네일 밖으로 내려 감춤) */
/* 썸네일로 정한 프레임: 칸(3:2)을 꽉 채워 확대(가운데 기준) — 홈 카드와 같아요 */
.full { position: absolute; inset: 0; }
.cover { position: absolute; inset: 6px calc(22% - 1px) -10px; border-radius: 5px; --sq-line: var(--iris-line); --sq-line-w: 1px; }
/* 웹 · 데스크톱 화면(폭 768 이상): 휴대폰 모양 좁은 칸 대신 썸네일 폭에 맞는 넓은 칸, 위쪽부터 꽉 채워요(납작한 화면도 아래가 비지 않게) */
.cover.wide { inset: 6px 6px -10px; }
.sq-clip-inner { position: absolute; inset: 1px; overflow: hidden; border-radius: 4px; }
.ghost { position: absolute; left: 50%; top: 10px; width: 26px; height: 44px; margin-left: -13px; border-radius: var(--ref-radius-02); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; --sq-fill: var(--sys-color-common-white-default); }
.col { min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-01); }
.name { font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.skel .bar { width: 160px; height: 14px; border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); }
.empty { margin: var(--ref-spacing-06) 0 0; padding: 0 var(--ref-spacing-04); }
.link { padding: 0; border: 0; background: none; color: var(--sys-color-brand-primary-default); font: inherit; cursor: pointer; }
</style>
