<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Button, TextInput } from '@ba-dream/design-system'
// 피그마 화면 가져오기 — 시안: design/iris-canvas/FigmaLink.dc.html, 위계: PRD/05_UI_GUIDE.md
// 프레임 링크 → 서버(/api/figma/frame)가 피그마에서 이름 · 크기 · 썸네일 · 컴포넌트 요약을 받아오고,
// "화면 추가"를 누르면 screens · screen_component_usages 에 저장합니다. 미리보기 모드에서는 저장하지 않아요.
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
const loading = ref(false)
const saving = ref(false)
const result = ref<FrameResult | null>(null)
const error = ref<{ code: string; message: string } | null>(null)
/** /api/figma/frame 오류 코드 → 영어 원문(사전 열쇠). 화면에는 tr(error.message) 로 */
const FIGMA_ERROR: Record<string, string> = {
  forbidden: 'You don\'t have access to this file. Check the file\'s sharing settings or the Figma token',
  not_found: 'Couldn\'t find the Figma file or frame. Check the link again',
  rate_limited: 'Too many Figma requests. Try again in about a minute',
  figma_error: 'Couldn\'t import the frame from Figma. Try again in a moment',
  unauthorized: 'You need to log in. Please log in again',
  invalid_url: 'That isn\'t a Figma link. Paste a URL that starts with figma.com/design/…',
  no_node: 'That isn\'t a frame link. Select a frame in Figma, copy its link and paste it here',
  no_token: 'The Figma token isn\'t set up yet. Let an admin know',
}
const catalog = ref<ComponentRef[]>([])
const thumbFailed = ref(false)

const dialog = ref<HTMLElement | null>(null)
const focusInput = () => document.getElementById('figmaUrl')?.focus()
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

/** 링크 칸에서 Enter = 가져오기(한글 조합 중에는 안 함) */
function onUrlKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (url.value.trim()) load() } }
async function load() {
  if (loading.value) return
  const raw = url.value.trim()
  result.value = null
  thumbFailed.value = false
  if (!/figma\.com\//i.test(raw)) {
    error.value = { code: 'invalid_url', message: FIGMA_ERROR.invalid_url! }
    focusInput()
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
    const code = body?.data?.code ?? 'figma_error'
    // 서버 문구 대신 코드별 영어 원문(보여 줄 때 tr). 모르는 코드면 서버 문구 그대로
    error.value = {
      code,
      message: FIGMA_ERROR[code] ?? body?.data?.message ?? FIGMA_ERROR.figma_error!,
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
    error.value = { code: 'save', message: "Couldn't add the frame. Try again in a moment" }
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
      error.value = { code: 'save', message: "Couldn't add the frame. Try again in a moment" }
      return
    }
  }
  saving.value = false
  emit('created', screenId)
  open.value = false
}

function openFigma(href: string) { window.open(href, '_blank', 'noopener,noreferrer') }

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
    focusInput()
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
    <div v-if="open" class="pop-overlay" @mousedown.self="close">
      <!-- 팝업 양식(main.css .pop-* — 프로필 편집 창 기준): 머리 48 / 본문 16 / 디자인 시스템 입력칸 · 버튼 -->
      <section ref="dialog" role="dialog" aria-modal="true" aria-labelledby="figmaTitle" class="sq pop" style="--pop-w: 440px">
        <header class="pop-top">
          <h2 id="figmaTitle" class="pop-ttl">{{ tr('Import from Figma') }}</h2>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="close"><EditorIcon name="close" :size="16" /></button>
        </header>
        <div v-ovscroll class="pop-body">
          <div class="body">
            <TextInput
              v-model:value="url"
              size="s"
              :label="tr('Figma link')"
              placeholder="figma.com/design/…?node-id=…"
              :show-left-icon="false"
              :show-right-icon="false"
              show-button
              :button-label="loading ? tr('Importing…') : tr('Import')"
              show-supporting-text
              :supporting-text="tr('Select a frame in Figma, choose Copy link to selection, and paste the URL here')"
              :destructed="error?.code === 'invalid_url' || error?.code === 'no_node'"
              :input-props="{ id: 'figmaUrl', inputmode: 'url', autocomplete: 'off', spellcheck: false, onKeydown: onUrlKey }"
              :label-props="{ htmlFor: 'figmaUrl' }"
              @button-click="url.trim() && load()"
            />
            <p v-if="error" :class="['sq', 'note', { warn: error.code !== 'no_token' }]" role="alert">
              <EditorIcon :name="error.code === 'no_token' ? 'info' : 'warning'" :size="16" class="note-ic" />
              <span>{{ tr(error.message) }}</span>
            </p>
          </div>
          <div v-if="result" class="result" aria-live="polite">
            <div class="sq card">
              <div class="sq thumb" data-preview>
                <img v-if="result.thumbnailUrl && !thumbFailed" :src="result.thumbnailUrl" :alt="tr('{name} thumbnail', { name: result.name })" @error="thumbFailed = true">
                <EditorIcon v-else name="image" :size="20" class="dim" />
              </div>
              <div class="info">
                <div class="col">
                  <span class="name">{{ result.name }}</span>
                  <span class="meta num">{{ result.width }} × {{ result.height }}</span>
                </div>
                <button type="button" class="lnk" @click="openFigma(result.url)">{{ tr('Open in Figma') }}<EditorIcon name="arrow_up_right" :size="12" /></button>

                <div class="divider" />
                <div class="sum-h">
                  <span class="sub">{{ tr('Components found') }}</span>
                  <span class="meta num">{{ tr('{n} types · {m} instances', { n: result.components.length, m: total }) }}<template v-if="!preview && result.components.length"> · {{ tr('{n} in design system', { n: matched }) }}</template></span>
                </div>
                <ul v-if="result.components.length" v-ovscroll class="list">
                  <li v-for="c in result.components" :key="c.name" class="item">
                    <EditorIcon v-if="!preview && matchId(c)" name="check" :size="12" class="ok" />
                    <span v-else class="dot" aria-hidden="true" />
                    <span class="ellipsis">{{ c.name }}</span>
                    <span class="meta num">{{ c.count }}</span>
                  </li>
                </ul>
                <p v-else class="meta">{{ tr('This frame has no component instances') }}</p>
              </div>
            </div>
            <p v-if="preview" class="meta">{{ tr('Preview mode: nothing is saved when you close') }}</p>
          </div>
        </div>

        <footer class="pop-foot">
          <Button size="s" type="tertiary" :disabled="saving" @click="close">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :loading="saving" :disabled="!result" @click="add">{{ tr('Add frame') }}</Button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준). 여기에는 안쪽 내용만 */
.body { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.dim { color: var(--sys-color-neutral-500); flex: none; }

.note { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); margin: var(--ref-spacing-04) 0 0; padding: var(--ref-spacing-06) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.note.warn { color: var(--sys-color-theme-destructed-default); }
.note-ic { flex: none; margin-top: 1px; }

.result { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.card { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: var(--ref-spacing-08); padding: var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.thumb { height: 180px; display: grid; place-items: center; overflow: hidden; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.thumb img { width: 100%; height: 100%; object-fit: contain; object-position: top center; }
.info { min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.col { display: flex; flex-direction: column; }
.name { font-weight: 600; overflow-wrap: anywhere; }
.meta { margin: 0; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.sub { font-weight: 600; }
.lnk { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; color: var(--sys-color-brand-primary-default); cursor: pointer; }
.lnk:hover { text-decoration: underline; }
.divider { height: 1px; margin: var(--ref-spacing-02) 0; background: var(--iris-line); }
.sum-h { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 132px; overflow-x: hidden; overflow-y: auto; }
.item { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 22px; }
.item .meta { margin-left: auto; flex: none; }
.ok { color: var(--sys-color-brand-primary-default); flex: none; }
.dot { width: 12px; height: 12px; flex: none; display: grid; place-items: center; }
.dot::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--sys-color-neutral-400); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

</style>
