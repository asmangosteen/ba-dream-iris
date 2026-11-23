<script setup lang="ts">
import { Button, Icon, SearchField, Skeleton, TextButton } from '@ba-dream/design-system'
import DsPreview from '~/components/ds/DsPreview.vue'
import DsRegisterModal, { type RegisterTab } from '~/components/ds/DsRegisterModal.vue'
import { TOKEN_TYPE_LABEL, type ComponentRow, type TokenRow, type TokenType, type UsageRow } from '~/composables/useIrisData'

useHead({ title: '디자인 시스템 · Iris' })

// ---------------------------------------------------------------------------
// 데이터
// ---------------------------------------------------------------------------
const { components, tokens } = useDesignSystem()
const usages = useUsages('all')
const supabase = useSupabaseClient()
const preview = useDevPreview()

interface ScreenInfo { id: string; name: string; page: string; project: string; projectId: string | null }
const screenIds = computed(() => [...new Set((usages.data.value ?? []).map((u) => u.screen_id))].sort())

/** 사용 기록에 나온 화면들의 이름 · 페이지 · 프로젝트 */
const screens = useAsyncData('ds-usage-screens', async (): Promise<Record<string, ScreenInfo>> => {
  await usages // 서버 렌더에서도 사용 기록을 먼저 받은 뒤 화면을 찾습니다
  const ids = screenIds.value
  if (!ids.length) return {}
  if (preview) {
    const project = PREVIEW_PROJECTS[0]!
    const out: Record<string, ScreenInfo> = {}
    for (const [pageId, list] of Object.entries(PREVIEW_SCREENS)) {
      const page = PREVIEW_PAGES.find((p) => p.id === pageId)?.name ?? ''
      for (const s of list) if (ids.includes(s.id)) out[s.id] = { id: s.id, name: s.name, page, project: project.name, projectId: project.id }
    }
    return out
  }
  const { data, error } = await supabase.from('screens').select('id, name, page_id, pages(name, project_id, projects(name))').in('id', ids)
  if (error) throw error
  type Row = { id: string; name: string; page_id: string; pages: { name: string; project_id: string; projects: { name: string } | null } | null }
  return Object.fromEntries(((data ?? []) as unknown as Row[]).map((s) => [s.id, {
    id: s.id, name: s.name, page: s.pages?.name ?? '', project: s.pages?.projects?.name ?? '', projectId: s.pages?.project_id ?? null,
  }]))
}, { watch: [screenIds], default: (): Record<string, ScreenInfo> => ({}) })

const loading = computed(() => components.status.value === 'pending' || tokens.status.value === 'pending')
const loadError = computed(() => components.error.value ?? tokens.error.value)
function reload() { components.refresh(); tokens.refresh(); usages.refresh() }

const compList = computed(() => components.data.value ?? [])
const tokenList = computed(() => tokens.data.value ?? [])

/** 컴포넌트별 사용 화면(같은 화면에 여러 줄이면 더함) */
interface Use { screenId: string; n: number }
function groupUses(rows: UsageRow[]): Use[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.screen_id, (m.get(r.screen_id) ?? 0) + r.count)
  return [...m].map(([screenId, n]) => ({ screenId, n })).sort((a, b) => b.n - a.n)
}
const usesByComponent = computed(() => {
  const m = new Map<string, UsageRow[]>()
  for (const u of usages.data.value ?? []) if (u.component_id) m.set(u.component_id, [...(m.get(u.component_id) ?? []), u])
  return new Map([...m].map(([k, v]) => [k, groupUses(v)]))
})
/** 디자인 시스템에 없는 레이어 이름 */
const unmatched = computed(() => {
  const m = new Map<string, UsageRow[]>()
  for (const u of usages.data.value ?? []) if (!u.component_id) m.set(u.detected_name, [...(m.get(u.detected_name) ?? []), u])
  return [...m].map(([name, rows]) => ({ name, uses: groupUses(rows) })).sort((a, b) => a.name.localeCompare(b.name))
})
const screenCount = (id: string) => usesByComponent.value.get(id)?.length ?? 0

// ---------------------------------------------------------------------------
// 고르기 · 거르기
// ---------------------------------------------------------------------------
type Sel = { kind: 'component'; id: string } | { kind: 'unmatched'; name: string } | { kind: 'token'; id: string } | null
const picked = ref<Sel>(null)
// 아무것도 고르지 않았으면 첫 컴포넌트 (서버 렌더와 같은 결과가 나오도록 computed)
const sel = computed<Sel>(() => picked.value ?? (compList.value[0] ? { kind: 'component', id: compList.value[0].id } : null))
const view = ref<'components' | 'tokens'>('components')
const category = ref('')
const query = ref('')

const categories = computed(() => [...new Set(compList.value.map((c) => c.category))])
const matchQ = (...xs: (string | null | undefined)[]) => {
  const q = query.value.trim().toLowerCase()
  return !q || xs.some((x) => x?.toLowerCase().includes(q))
}
const searched = computed(() => compList.value.filter((c) => matchQ(c.name, c.code_name, c.category, ...(c.match_aliases ?? []))))
const navGroups = computed(() => categories.value
  .map((cat) => ({ cat, items: searched.value.filter((c) => c.category === cat) }))
  .filter((g) => g.items.length))
const cards = computed(() => searched.value.filter((c) => !category.value || c.category === category.value))
const tokenGroups = computed(() => (Object.keys(TOKEN_TYPE_LABEL) as TokenType[])
  .map((type) => ({ type, items: tokenList.value.filter((t) => t.type === type && matchQ(t.name, t.value, t.description)) }))
  .filter((g) => g.items.length))
const unmatchedShown = computed(() => unmatched.value.filter((u) => matchQ(u.name)))

const chips = computed(() => [
  { key: '', label: '전체', n: compList.value.length },
  ...categories.value.map((c) => ({ key: c, label: c, n: compList.value.filter((x) => x.category === c).length })),
])


const curComp = computed(() => (sel.value?.kind === 'component' ? compList.value.find((c) => c.id === (sel.value as { id: string }).id) ?? null : null))
const curToken = computed(() => (sel.value?.kind === 'token' ? tokenList.value.find((t) => t.id === (sel.value as { id: string }).id) ?? null : null))
const curUnmatched = computed(() => (sel.value?.kind === 'unmatched' ? unmatched.value.find((u) => u.name === (sel.value as { name: string }).name) ?? null : null))
const curUses = computed<Use[]>(() => (curComp.value ? usesByComponent.value.get(curComp.value.id) ?? [] : curUnmatched.value?.uses ?? []))
const curTotal = computed(() => curUses.value.reduce((s, u) => s + u.n, 0))

function pickComponent(c: ComponentRow) { picked.value = { kind: 'component', id: c.id }; view.value = 'components' }
function pickCategory(key: string) { category.value = key; view.value = 'components' }
function clearFilters() { category.value = ''; query.value = '' }
function pickToken(t: TokenRow) { picked.value = { kind: 'token', id: t.id } }
async function showTokens(type?: TokenType) {
  view.value = 'tokens'
  if (!type) return
  await nextTick()
  document.getElementById(`ds-tok-${type}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/** 오른쪽 패널 코드 조각 — 코드 이름 + 속성 첫 값 */
function codeOf(c: ComponentRow): string {
  const tag = (c.code_name || c.name).replace(/[^A-Za-z0-9]/g, '') || 'Component'
  const attrs = Object.entries(c.props_schema ?? {}).map(([k, v]) =>
    v === 'boolean' ? `:${k}="false"` : v === 'text' ? `${k}="텍스트"` : `${k}="${v[0] ?? ''}"`)
  if (!attrs.length) return `<${tag} />`
  return attrs.length <= 2 ? `<${tag} ${attrs.join(' ')} />` : `<${tag}\n  ${attrs.join('\n  ')} />`
}
const curCode = computed(() => (curComp.value ? codeOf(curComp.value) : curToken.value ? `${curToken.value.name}: ${curToken.value.value}` : ''))
const copied = ref(false)
async function copyCode() {
  try {
    await navigator.clipboard.writeText(curCode.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch { notify('복사하지 못했어요') }
}

const screenOf = (id: string): ScreenInfo => screens.data.value?.[id] ?? { id, name: '알 수 없는 화면', page: '', project: '', projectId: null }

// 토큰 미리보기 값
function typoStyle(v: string) {
  const m = v.match(/(\d+(?:\.\d+)?)\s*(?:px)?\s*\/\s*(\d+(?:\.\d+)?)(?:.*?(\d{3}))?/)
  return m ? { fontSize: `${m[1]}px`, lineHeight: `${m[2]}px`, fontWeight: m[3] ?? '400' } : {}
}
const px = (v: string) => Math.min(parseFloat(v) || 0, 120)

// ---------------------------------------------------------------------------
// 등록 · 알림
// ---------------------------------------------------------------------------
const modal = reactive({ open: false, tab: 'component' as RegisterTab, prefill: '' })
function openRegister(tab: RegisterTab, prefill = '') { Object.assign(modal, { open: true, tab, prefill }) }
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2400)
}
async function onSaved(msg: string) {
  modal.open = false
  notify(msg)
  await Promise.all([components.refresh(), tokens.refresh()])
}
</script>

<template>
  <!-- 등록 모달이 열려 있으면 뒤 화면은 보조기기에서 숨깁니다 -->
  <div class="shell" :aria-hidden="modal.open ? 'true' : undefined">
    <AppTopBar />

    <!-- 왼쪽: 컴포넌트 · 토큰 목록 (에디터 왼쪽 패널과 같은 모양) -->
    <aside aria-label="디자인 시스템 목록" class="sq float side">
      <div class="search-row">
        <SearchField v-model:value="query" type="contained" size="s" placeholder="이름 · 별칭 찾기" :input-props="{ 'aria-label': '컴포넌트 · 토큰 찾기' }" />
      </div>
      <div class="side-scroll">
        <template v-if="loading">
          <section class="sec"><div class="sec-h"><Skeleton shape="text" width="40%" /></div><div v-for="i in 5" :key="i" class="sk-row"><Skeleton shape="text" /></div></section>
        </template>
        <template v-else-if="!loadError">
          <section v-for="g in navGroups" :key="g.cat" class="sec">
            <div class="sec-h"><span>{{ g.cat }}</span></div>
            <button v-for="c in g.items" :key="c.id" type="button" :class="['sq', 'nav-item', 's', { on: sel?.kind === 'component' && sel.id === c.id }]" :aria-current="sel?.kind === 'component' && sel.id === c.id ? 'true' : undefined" :title="c.name" @click="pickComponent(c)">
              <span class="ell">{{ c.name }}</span><span class="cnt num">{{ screenCount(c.id) || '' }}</span>
            </button>
          </section>
          <section class="sec">
            <div class="sec-h"><span>토큰</span></div>
            <button v-for="(label, type) in TOKEN_TYPE_LABEL" :key="type" type="button" class="sq nav-item s" @click="showTokens(type)">
              <span class="ell">{{ label }}</span><span class="cnt num">{{ tokenList.filter((t) => t.type === type).length }}</span>
            </button>
          </section>
          <section v-if="unmatchedShown.length" class="sec">
            <div class="sec-h"><span>디자인 시스템에 없는 이름</span></div>
            <button v-for="u in unmatchedShown" :key="u.name" type="button" :class="['sq', 'nav-item', 's', { on: sel?.kind === 'unmatched' && sel.name === u.name }]" :aria-current="sel?.kind === 'unmatched' && sel.name === u.name ? 'true' : undefined" :title="u.name" @click="picked = { kind: 'unmatched', name: u.name }">
              <Icon name="warning" :size="12" class="warn-ic" />
              <span class="ell">{{ u.name }}</span><span class="cnt num">{{ u.uses.length }}</span>
            </button>
          </section>
          <div v-if="query && !navGroups.length && !unmatchedShown.length" class="side-empty">
            <p class="tx-meta">'{{ query }}'에 맞는 이름이 없어요</p>
            <TextButton size="s" color="blue" @click="query = ''">찾는 말 지우기</TextButton>
          </div>
        </template>
      </div>
    </aside>

    <!-- 가운데: 카드 목록 -->
    <main class="sq float body"><div class="scroller">
      <div class="head">
        <h1 class="tx-title">디자인 시스템</h1>
        <div class="head-act">
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="upload" @click="openRegister('bulk')">한꺼번에 가져오기</Button>
          <Button size="s" type="primary" contents="icon-text" icon-name="plus" @click="openRegister(view === 'tokens' ? 'token' : 'component')">등록</Button>
        </div>
      </div>
      <div class="seg chips" role="tablist" aria-label="분류">
        <button v-for="c in chips" :key="c.key || 'all'" type="button" role="tab" :aria-selected="view === 'components' && category === c.key" :class="['sq', 'seg-item', { on: view === 'components' && category === c.key }]" @click="pickCategory(c.key)">
          {{ c.label }} <span class="n num">{{ c.n }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="view === 'tokens'" :class="['sq', 'seg-item', { on: view === 'tokens' }]" @click="showTokens()">
          토큰 <span class="n num">{{ tokenList.length }}</span>
        </button>
      </div>

      <div v-if="loading" class="grid">
        <div v-for="i in 6" :key="i" class="card"><Skeleton shape="rectangle" height="168px" /><Skeleton shape="text" width="50%" /></div>
      </div>
      <div v-else-if="loadError" class="state" role="alert">
        <span class="tx-head">디자인 시스템을 불러오지 못했어요</span>
        <span class="tx-meta">잠시 뒤 다시 시도해 주세요</span>
        <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="reload">다시 불러오기</Button>
      </div>

      <!-- 컴포넌트 -->
      <template v-else-if="view === 'components'">
        <div v-if="!compList.length" class="state">
          <span class="tx-head">아직 등록한 컴포넌트가 없어요</span>
          <span class="tx-meta">하나씩 등록하거나 CSV · JSON 으로 한꺼번에 가져와 주세요</span>
          <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="upload" @click="openRegister('bulk')">한꺼번에 가져오기</Button>
        </div>
        <div v-else-if="!cards.length" class="state">
          <span class="tx-head">맞는 컴포넌트가 없어요</span>
          <span class="tx-meta">찾는 말이나 분류를 바꿔 보세요</span>
          <Button size="s" type="tertiary" stroke @click="clearFilters">거르기 지우기</Button>
        </div>
        <div v-else class="grid">
          <div v-for="c in cards" :key="c.id" class="card">
            <span :class="['sq', 'thumb', { on: curComp?.id === c.id }]">
              <DsPreview :names="[c.name, c.code_name, ...(c.match_aliases ?? [])]" :label="c.name" />
            </span>
            <button type="button" class="card-btn" :aria-pressed="curComp?.id === c.id" @click="pickComponent(c)">
              <span class="tx-body name ell" :title="c.name">{{ c.name }}</span>
              <span class="tx-meta num">화면 {{ screenCount(c.id) }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- 토큰 -->
      <template v-else>
        <div v-if="!tokenGroups.length" class="state">
          <span class="tx-head">{{ tokenList.length ? '맞는 토큰이 없어요' : '아직 등록한 토큰이 없어요' }}</span>
          <span class="tx-meta">{{ tokenList.length ? '찾는 말을 바꿔 보세요' : '색 · 글자 · 간격 · 모서리 · 그림자 값을 등록해 주세요' }}</span>
          <Button v-if="!tokenList.length" size="s" type="tertiary" stroke contents="icon-text" icon-name="upload" @click="openRegister('bulk')">한꺼번에 가져오기</Button>
          <Button v-else size="s" type="tertiary" stroke @click="query = ''">찾는 말 지우기</Button>
        </div>
        <section v-for="g in tokenGroups" :id="`ds-tok-${g.type}`" :key="g.type" class="tok-sec">
          <h2 class="tx-head">{{ TOKEN_TYPE_LABEL[g.type] }} <span class="tx-meta num">{{ g.items.length }}</span></h2>
          <div v-if="g.type === 'color'" class="swatches">
            <button v-for="t in g.items" :key="t.id" type="button" :class="['sq', 'tok-card', { on: curToken?.id === t.id }]" :aria-pressed="curToken?.id === t.id" @click="pickToken(t)">
              <span class="swatch" :style="{ background: t.value }" aria-hidden="true" />
              <span class="tok-txt"><span class="tx-body name ell" :title="t.name">{{ t.name }}</span><span class="tx-meta num ell" :title="t.value">{{ t.value }}</span></span>
            </button>
          </div>
          <div v-else class="tok-rows">
            <button v-for="t in g.items" :key="t.id" type="button" :class="['sq', 'tok-row', { on: curToken?.id === t.id }]" :aria-pressed="curToken?.id === t.id" @click="pickToken(t)">
              <span data-preview class="tok-pv" aria-hidden="true">
                <span v-if="g.type === 'typography'" class="pv-typo" :style="typoStyle(t.value)">가나 Aa</span>
                <span v-else-if="g.type === 'spacing'" class="pv-space" :style="{ width: px(t.value) + 'px' }" />
                <span v-else-if="g.type === 'radius'" class="pv-radius" :style="{ borderRadius: t.value }" />
                <span v-else class="pv-shadow" :style="{ boxShadow: t.value }" />
              </span>
              <span class="tx-body name ell" :title="t.name">{{ t.name }}</span>
              <span class="tx-meta num ell" :title="t.value">{{ t.value }}</span>
              <span class="tx-meta ell desc" :title="t.description ?? undefined">{{ t.description ?? '' }}</span>
            </button>
          </div>
        </section>
      </template>
    </div></main>

    <!-- 오른쪽: 상세 · 사용 화면 역추적 -->
    <aside aria-label="상세" class="sq float detail"><div class="scroller">
      <template v-if="loading">
        <Skeleton shape="text" width="50%" />
        <Skeleton shape="rectangle" height="72px" />
        <Skeleton v-for="i in 3" :key="i" shape="text" />
      </template>

      <template v-else-if="curComp || curUnmatched">
        <section class="d-sec">
          <h2 class="tx-head">{{ curComp?.name ?? curUnmatched?.name }}</h2>
          <template v-if="curComp">
            <span class="tx-meta">{{ curComp.category }}<template v-if="curComp.description"> · {{ curComp.description }}</template></span>
            <div class="sq code">
              <pre class="tx-code">{{ curCode }}</pre>
              <button type="button" class="ib copy" :aria-label="copied ? '복사했어요' : '코드 복사'" :title="copied ? '복사했어요' : '코드 복사'" @click="copyCode"><Icon :name="copied ? 'check' : 'copy'" :size="14" /></button>
            </div>
            <span v-if="curComp.match_aliases?.length" class="tx-meta">매칭 별칭 · {{ curComp.match_aliases.join(', ') }}</span>
          </template>
          <template v-else>
            <span class="tx-meta">화면에서 찾은 레이어 이름인데, 디자인 시스템에 같은 이름이 없어요. 새 컴포넌트로 등록하거나 기존 컴포넌트의 별칭으로 넣어 주세요</span>
            <Button class="self-start" size="s" type="tertiary" stroke contents="icon-text" icon-name="plus" @click="openRegister('component', curUnmatched?.name)">컴포넌트로 등록</Button>
          </template>
        </section>

        <section class="d-sec uses">
          <div class="uses-h">
            <h3 class="tx-head">쓰는 화면</h3>
            <span v-if="curUses.length" class="tx-meta num">{{ curUses.length }}곳 · {{ curTotal }}번</span>
          </div>
          <div class="tbl-h tx-meta"><span>화면</span><span class="r">개수</span></div>
          <template v-if="screens.status.value === 'pending'">
            <div v-for="i in 3" :key="i" class="sk-use"><Skeleton shape="text" /></div>
          </template>
          <p v-else-if="usages.error.value" class="tx-meta empty">사용 화면을 불러오지 못했어요 <TextButton size="s" color="blue" @click="usages.refresh()">다시 불러오기</TextButton></p>
          <p v-else-if="!curUses.length" class="tx-meta empty">아직 이 컴포넌트를 쓰는 화면이 없어요</p>
          <template v-else>
            <template v-for="u in curUses" :key="u.screenId">
              <NuxtLink v-if="screenOf(u.screenId).projectId" :to="`/p/${screenOf(u.screenId).projectId}?screen=${u.screenId}`" class="use">
                <span class="use-col">
                  <span class="tx-body name ell" :title="screenOf(u.screenId).name">{{ screenOf(u.screenId).name }}</span>
                  <span class="tx-meta ell">{{ [screenOf(u.screenId).project, screenOf(u.screenId).page].filter(Boolean).join(' · ') }}</span>
                </span>
                <span class="tx-body num r">{{ u.n }}</span>
              </NuxtLink>
              <div v-else class="use">
                <span class="use-col">
                  <span class="tx-body name ell" :title="screenOf(u.screenId).name">{{ screenOf(u.screenId).name }}</span>
                  <span class="tx-meta ell">{{ [screenOf(u.screenId).project, screenOf(u.screenId).page].filter(Boolean).join(' · ') }}</span>
                </span>
                <span class="tx-body num r">{{ u.n }}</span>
              </div>
            </template>
          </template>
        </section>
      </template>

      <template v-else-if="curToken">
        <section class="d-sec">
          <h2 class="tx-head">{{ curToken.name }}</h2>
          <span class="tx-meta">{{ TOKEN_TYPE_LABEL[curToken.type] }}<template v-if="curToken.description"> · {{ curToken.description }}</template></span>
          <span data-preview class="sq big-pv" aria-hidden="true">
            <span v-if="curToken.type === 'color'" class="big-swatch" :style="{ background: curToken.value }" />
            <span v-else-if="curToken.type === 'typography'" :style="typoStyle(curToken.value)">가나다라 Aa</span>
            <span v-else-if="curToken.type === 'spacing'" class="pv-space" :style="{ width: px(curToken.value) + 'px' }" />
            <span v-else-if="curToken.type === 'radius'" class="pv-radius big" :style="{ borderRadius: curToken.value }" />
            <span v-else class="pv-shadow big" :style="{ boxShadow: curToken.value }" />
          </span>
          <div class="sq code">
            <pre class="tx-code">{{ curCode }}</pre>
            <button type="button" class="ib copy" :aria-label="copied ? '복사했어요' : '값 복사'" :title="copied ? '복사했어요' : '값 복사'" @click="copyCode"><Icon :name="copied ? 'check' : 'copy'" :size="14" /></button>
          </div>
        </section>
      </template>

      <p v-else class="tx-meta">{{ view === 'tokens' ? '토큰을 골라주세요' : '컴포넌트를 골라주세요' }}</p>
    </div></aside>

    <DsRegisterModal
      :open="modal.open"
      :tab="modal.tab"
      :prefill="modal.prefill"
      :existing-names="compList.map((c) => c.name)"
      :categories="categories"
      @close="modal.open = false"
      @saved="onSaved"
    />

    <div class="toast-wrap" role="status" aria-live="polite">
      <div v-if="toast" class="sq float s toast tx-body"><Icon name="check" :size="14" />{{ toast }}</div>
    </div>
  </div>
</template>

<style scoped>
.shell { height: 100vh; position: relative; overflow: hidden; box-sizing: border-box; padding: 56px var(--iris-gap) var(--iris-gap); display: flex; gap: var(--iris-gap); background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* 왼쪽 패널 — 에디터 panel-left 와 같은 폭 · 섹션 */
.side { flex: 0 0 264px; display: flex; flex-direction: column; overflow: hidden; }
.search-row { padding: var(--ref-spacing-06); }
.side-scroll { flex: 1; min-height: 0; overflow: auto; padding-bottom: var(--ref-spacing-08); }
.sec { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-08); }
.sec-h { padding: 0 var(--ref-spacing-02) 0 var(--ref-spacing-08); }
.nav-item { width: 100%; box-sizing: border-box; text-align: left; }
.cnt { margin-left: auto; color: var(--sys-color-neutral-500); font-weight: 400; }
.warn-ic { flex: none; color: var(--sys-color-theme-warning-default); }
.sk-row { padding: var(--ref-spacing-03) var(--ref-spacing-08); }
.side-empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04) var(--ref-spacing-12); }
.side-empty p { margin: 0; }

/* 가운데 */
.body { flex: 1; min-width: 0;   box-sizing: border-box;  overflow: hidden; display: flex; flex-direction: column; }
.body > .scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-14) var(--ref-spacing-14) var(--ref-spacing-19); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.head-act { display: flex; gap: var(--ref-spacing-04); }
.chips { flex-wrap: wrap; margin: var(--ref-spacing-08) 0 var(--ref-spacing-10) calc(-1 * var(--ref-spacing-06)); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: var(--ref-spacing-10) var(--ref-spacing-06); }
.card { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.thumb { display: block; height: 92px; position: relative; border-radius: var(--ref-radius-07); overflow: hidden; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
/* 미리보기를 실제 크기의 60% 로 줄여 작은 칸에 담습니다 */
.thumb :deep(.pv) { position: absolute; left: 0; top: 0; width: 166.67%; height: 166.67%; transform: scale(.6); transform-origin: 0 0; }
.thumb :deep(.pv) { border-radius: inherit; }
.card:hover .thumb { --sq-line: var(--ref-color-gray-900-20); }
.thumb.on, .card:hover .thumb.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.card-btn { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ref-spacing-06); min-width: 0; }
.card-btn::after { content: ''; position: absolute; inset: 0; border-radius: var(--ref-radius-07); }
.card-btn:focus-visible { outline: none; }
.card-btn:focus-visible::after { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.card-btn .name { flex: 1; }
.card-btn .num { flex: none; }
.name { font-weight: 500; }
.state { display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-19) 0; text-align: center; }
.state .bd-button { margin-top: var(--ref-spacing-06); }

.tok-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-06); scroll-margin-top: var(--ref-spacing-10); }
.tok-sec + .tok-sec { margin-top: var(--ref-spacing-14); }
.tok-sec h2 { display: flex; gap: var(--ref-spacing-04); }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: var(--ref-spacing-06); }
.tok-card { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.tok-card:hover, .tok-row:hover { --sq-line: var(--ref-color-gray-900-20); }
.tok-card:active, .tok-row:active { --sq-overlay: var(--interaction-light-gray-hover); }
.tok-card:focus-visible, .tok-row:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.tok-card.on, .tok-row.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.swatch { height: 56px; box-shadow: inset 0 -1px 0 var(--iris-line); }
.tok-txt { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-05); min-width: 0; }
.tok-rows { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.tok-row { display: grid; grid-template-columns: 96px minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr); align-items: center; gap: var(--ref-spacing-08); min-height: 48px; padding: var(--ref-spacing-04) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.tok-pv { display: flex; align-items: center; min-height: 32px; overflow: hidden; color: var(--sys-color-neutral-800); }
.pv-typo { white-space: nowrap; }
.pv-space { display: block; height: 12px; min-width: 1px; background: var(--sys-color-brand-primary-light); border-radius: var(--ref-radius-01); }
.pv-radius { display: block; width: 32px; height: 32px; box-shadow: inset 0 0 0 1.5px var(--sys-color-neutral-800); }
.pv-shadow { display: block; width: 32px; height: 32px; border-radius: var(--ref-radius-04); background: var(--sys-color-common-white-default); }
.big { width: 72px; height: 72px; }
.desc { color: var(--sys-color-neutral-500); }

/* 오른쪽 */
.detail { flex: 0 0 320px; min-width: 0;   box-sizing: border-box;     overflow: hidden; display: flex; flex-direction: column; }
.detail > .scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-12) var(--ref-spacing-11) var(--ref-spacing-16); display: flex; flex-direction: column; gap: var(--ref-spacing-14); }
.d-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.self-start { align-self: flex-start; }
.code { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); padding: var(--ref-spacing-07) var(--ref-spacing-04) var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.code pre { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; word-break: break-all; }
.copy { width: 24px; height: 24px; margin: calc(-1 * var(--ref-spacing-02)) 0; }
.big-pv { display: grid; place-items: center; height: 120px; border-radius: var(--ref-radius-05); overflow: hidden; --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; color: var(--sys-color-neutral-800); }
.big-swatch { width: 100%; height: 100%; }
.uses { gap: 0; }
.uses-h { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--ref-spacing-06); }
.r { text-align: right; }
.tbl-h { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding-bottom: var(--ref-spacing-04); box-shadow: inset 0 -1px 0 var(--iris-line-strong); }
.use { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08) 0; box-shadow: inset 0 -1px 0 var(--iris-line); }
a.use .name { transition: color .12s ease; }
a.use:hover .name { color: var(--sys-color-brand-primary-default); }
a.use:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; border-radius: var(--ref-radius-03); }
.use-col { display: flex; flex-direction: column; min-width: 0; }
.sk-use { padding: var(--ref-spacing-08) 0; }
.empty { display: flex; align-items: center; gap: var(--ref-spacing-04); flex-wrap: wrap; margin: 0; padding: var(--ref-spacing-08) 0; }

.toast-wrap { position: fixed; left: 50%; bottom: var(--ref-spacing-14); transform: translateX(-50%); z-index: 60; pointer-events: none; }
.toast { display: flex; align-items: center; gap: var(--ref-spacing-04); padding: var(--ref-spacing-05) var(--ref-spacing-08); }
</style>
