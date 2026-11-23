<script setup lang="ts">
// 피그마 화면 가져오기 — 시안: design/iris-canvas/FigmaLink.dc.html, 위계: PRD/05_UI_GUIDE.md
// 프레임 링크 → 서버(/api/figma/frame)가 피그마에서 이름 · 크기 · 썸네일 · 컴포넌트 요약을 받아오고,
// "화면 추가"를 누르면 screens · screen_component_usages 에 저장합니다. 미리보기 모드에서는 저장하지 않아요.
import { Icon } from '@ba-dream/design-system'
// Nuxt 내장 useDevPreview 와 이름이 겹쳐 자동 import 가 내장 쪽으로 잡히므로 직접 가져옵니다
import { useDevPreview } from '~/composables/usePreview'

interface FrameComponent { name: string; count: number; key: string | null }
interface FrameResult { fileKey: string; nodeId: string; url: string; name: string; width: number; height: number; thumbnailUrl: string | null; components: FrameComponent[] }
interface ComponentRef { id: string; name: string; code_name: string | null; match_aliases: string[] | null; figma_component_key: string | null }

const props = defineProps<{ pageId: string; nextX: number }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [screenId: string] }>()

const supabase = useSupabaseClient()
const preview = useDevPreview()

const url = ref('')
const focused = ref(false)
const loading = ref(false)
const saving = ref(false)
const result = ref<FrameResult | null>(null)
const error = ref<{ code: string; message: string } | null>(null)
const catalog = ref<ComponentRef[]>([])
const thumbFailed = ref(false)

const dialog = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
let lastFocus: HTMLElement | null = null

const total = computed(() => result.value?.components.reduce((n, c) => n + c.count, 0) ?? 0)

// 이름 · 코드 이름 · 별칭(대소문자 무시)과 피그마 컴포넌트 키로 디자인 시스템 컴포넌트를 찾습니다
const lookup = computed(() => {
  const byName = new Map<string, string>()
  const byKey = new Map<string, string>()
  for (const c of catalog.value) {
    for (const n of [c.name, c.code_name, ...(c.match_aliases ?? [])]) {
      const k = n?.trim().toLowerCase()
      if (k && !byName.has(k)) byName.set(k, c.id)
    }
    if (c.figma_component_key) byKey.set(c.figma_component_key, c.id)
  }
  return { byName, byKey }
})
function matchId(c: FrameComponent): string | null {
  return (c.key && lookup.value.byKey.get(c.key)) || lookup.value.byName.get(c.name.trim().toLowerCase()) || null
}
const matched = computed(() => result.value?.components.filter((c) => matchId(c)).length ?? 0)

function reset() {
  url.value = ''
  result.value = null
  error.value = null
  loading.value = false
  saving.value = false
  thumbFailed.value = false
}

function close() {
  if (saving.value) return
  open.value = false
}

async function load() {
  if (loading.value) return
  const raw = url.value.trim()
  result.value = null
  thumbFailed.value = false
  if (!/figma\.com\//i.test(raw)) {
    error.value = { code: 'invalid_url', message: '피그마 링크가 아니에요. figma.com/design/… 으로 시작하는 주소를 붙여주세요.' }
    input.value?.focus()
    return
  }
  error.value = null
  loading.value = true
  try {
    const [frame] = await Promise.all([
      $fetch<FrameResult>('/api/figma/frame', { method: 'POST', body: { url: raw } }),
      loadCatalog(),
    ])
    result.value = frame
  } catch (e) {
    const body = (e as { data?: { message?: string; data?: { code?: string; message?: string } } }).data
    error.value = {
      code: body?.data?.code ?? 'figma_error',
      message: body?.data?.message ?? '피그마에서 화면을 불러오지 못했어요. 잠시 뒤 다시 시도해주세요.',
    }
  } finally {
    loading.value = false
  }
}

async function loadCatalog() {
  if (preview || catalog.value.length) return
  const { data } = await supabase.from('components').select('id, name, code_name, match_aliases, figma_component_key')
  catalog.value = (data ?? []) as ComponentRef[]
}

async function add() {
  const r = result.value
  if (!r || saving.value) return
  if (preview) {
    emit('created', 'preview')
    open.value = false
    return
  }
  saving.value = true
  error.value = null
  const { data: screen, error: e1 } = await supabase.from('screens').insert({
    page_id: props.pageId,
    source: 'figma',
    name: r.name,
    x: props.nextX,
    y: 0,
    width: r.width,
    height: r.height,
    figma_file_key: r.fileKey,
    figma_node_id: r.nodeId,
    figma_url: r.url,
    thumbnail_path: r.thumbnailUrl,
    figma_layer_summary: { components: r.components },
    figma_synced_at: new Date().toISOString(),
  }).select('id').single()
  if (e1 || !screen) {
    saving.value = false
    error.value = { code: 'save', message: '화면을 추가하지 못했어요. 잠시 뒤 다시 시도해주세요.' }
    return
  }
  const screenId = (screen as { id: string }).id
  if (r.components.length) {
    const { error: e2 } = await supabase.from('screen_component_usages').insert(
      r.components.map((c) => ({ screen_id: screenId, component_id: matchId(c), detected_name: c.name, count: c.count, source: 'figma' as const })),
    )
    if (e2) {
      // 컴포넌트 기록이 빠진 화면이 남지 않도록 되돌립니다
      await supabase.from('screens').delete().eq('id', screenId)
      saving.value = false
      error.value = { code: 'save', message: '화면을 추가하지 못했어요. 잠시 뒤 다시 시도해주세요.' }
      return
    }
  }
  saving.value = false
  emit('created', screenId)
  open.value = false
}

// 대화상자 안에서만 Tab 이 돌도록 하고, Esc 로 닫습니다
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (e.key !== 'Tab' || !dialog.value) return
  const items = [...dialog.value.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')]
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(open, async (v) => {
  if (import.meta.server) return
  if (v) {
    reset()
    lastFocus = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    input.value?.focus()
  } else {
    document.removeEventListener('keydown', onKeydown)
    lastFocus?.focus?.()
  }
}, { immediate: true })
onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @mousedown.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="figmaTitle" class="sq dialog">
        <header class="head">
          <h2 id="figmaTitle" class="tx-title">피그마 화면 가져오기</h2>
          <button type="button" class="ib" aria-label="닫기" @click="close"><Icon name="close" :size="20" /></button>
        </header>

        <form class="body" @submit.prevent="load">
          <label for="figmaUrl" class="tx-head">피그마 링크</label>
          <div class="row">
            <div :class="['sq', 'field', 'm', 'grow', { focus: focused }]">
              <Icon name="link" :size="16" class="dim" />
              <input
                id="figmaUrl"
                ref="input"
                v-model="url"
                type="text"
                inputmode="url"
                autocomplete="off"
                spellcheck="false"
                placeholder="figma.com/design/…?node-id=…"
                aria-describedby="figmaHint"
                :aria-invalid="error?.code === 'invalid_url' || error?.code === 'no_node'"
                @focus="focused = true"
                @blur="focused = false"
              >
            </div>
            <button type="submit" class="act m line" :disabled="loading || !url.trim()">
              <Icon v-if="loading" name="refresh" :size="14" class="spin" />
              {{ loading ? '불러오는 중' : '불러오기' }}
            </button>
          </div>
          <p id="figmaHint" class="tx-meta">피그마에서 프레임을 고르고 "링크 복사"한 주소를 붙여주세요.</p>
        </form>

        <p v-if="error" :class="['sq', 'note', { warn: error.code !== 'no_token' }]" role="alert">
          <Icon :name="error.code === 'no_token' ? 'info' : 'warning'" :size="16" class="note-ic" />
          <span>{{ error.message }}</span>
        </p>

        <div v-if="result" class="result" aria-live="polite">
          <div class="sq card">
            <div class="sq thumb" data-preview>
              <img v-if="result.thumbnailUrl && !thumbFailed" :src="result.thumbnailUrl" :alt="`${result.name} 썸네일`" @error="thumbFailed = true">
              <Icon v-else name="image" :size="20" class="dim" aria-label="썸네일 없음" />
            </div>
            <div class="info">
              <div class="col">
                <span class="tx-body name">{{ result.name }}</span>
                <span class="tx-meta num">{{ result.width }} × {{ result.height }}</span>
              </div>
              <a :href="result.url" target="_blank" rel="noopener noreferrer" class="link">피그마에서 열기 <Icon name="arrow_up_right" :size="12" /></a>

              <div class="divider" />
              <div class="sum-h">
                <span class="tx-head">찾은 컴포넌트</span>
                <span class="tx-meta num">{{ result.components.length }}종 · {{ total }}개<template v-if="!preview && result.components.length"> · 디자인 시스템 {{ matched }}종</template></span>
              </div>
              <ul v-if="result.components.length" class="list">
                <li v-for="c in result.components" :key="c.name" class="item">
                  <Icon v-if="!preview && matchId(c)" name="check" :size="12" class="ok" aria-label="디자인 시스템 컴포넌트" />
                  <span v-else class="dot" aria-hidden="true" />
                  <span class="tx-body ellipsis">{{ c.name }}</span>
                  <span class="tx-meta num">{{ c.count }}개</span>
                </li>
              </ul>
              <p v-else class="tx-meta">이 프레임에는 컴포넌트 인스턴스가 없어요.</p>
            </div>
          </div>
          <p v-if="preview" class="tx-meta">미리보기 모드라 저장하지 않고 닫아요.</p>
        </div>

        <footer class="foot">
          <button type="button" class="act m gray" :disabled="saving" @click="close">취소</button>
          <button type="button" class="act m pri" :disabled="!result || saving" @click="add">{{ saving ? '추가하는 중' : '화면 추가' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: var(--ref-spacing-12); background: var(--dimmed-bg); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.dialog { width: 100%; max-width: 520px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: auto; --sq-fill: var(--sys-color-common-white-default); border-radius: var(--ref-radius-08); filter: drop-shadow(0 12px 20px rgb(69 76 88 / 28%)); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ref-spacing-08); padding: var(--ref-spacing-12) var(--ref-spacing-12) var(--ref-spacing-10); }
.body { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-12) var(--ref-spacing-10); }
.row { display: flex; gap: var(--ref-spacing-06); }
.grow { flex: 1; min-width: 0; }
.dim { color: var(--sys-color-neutral-500); flex: none; }
.tx-meta { margin: 0; }
.act:disabled { opacity: .5; cursor: default; }
.act:disabled:hover { --sq-overlay: transparent; }

.note { display: flex; align-items: flex-start; gap: var(--ref-spacing-06); margin: 0 var(--ref-spacing-12) var(--ref-spacing-10); padding: var(--ref-spacing-08) var(--ref-spacing-10); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.note.warn { color: var(--sys-color-theme-destructed-default); }
.note-ic { flex: none; margin-top: 1px; }

.result { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-10) var(--ref-spacing-12); box-shadow: inset 0 1px 0 var(--iris-line-strong), inset 0 -1px 0 var(--iris-line-strong); }
.card { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--ref-spacing-10); padding: var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-default); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.thumb { height: 200px; display: grid; place-items: center; overflow: hidden; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.thumb img { width: 100%; height: 100%; object-fit: contain; object-position: top center; }
.info { min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.col { display: flex; flex-direction: column; }
.name { font-weight: 500; overflow-wrap: anywhere; }
.link { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-brand-primary-default); font-weight: 500; }
.divider { height: 1px; margin: var(--ref-spacing-04) 0; background: var(--iris-line); }
.sum-h { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 132px; overflow: auto; }
.item { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 22px; }
.item .tx-meta { margin-left: auto; flex: none; }
.ok { color: var(--sys-color-brand-primary-default); flex: none; }
.dot { width: 12px; height: 12px; flex: none; display: grid; place-items: center; }
.dot::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--sys-color-neutral-400); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.foot { display: flex; gap: var(--ref-spacing-06); padding: var(--ref-spacing-10) var(--ref-spacing-12) var(--ref-spacing-12); }
.foot .gray { flex: 1; }
.foot .pri { flex: 2.25; }

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
