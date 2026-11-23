<script setup lang="ts">
import { Icon, Skeleton } from '@ba-dream/design-system'
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import InspectorPlan from '~/components/editor/InspectorPlan.vue'
import InspectorDev from '~/components/editor/InspectorDev.vue'
import InspectorDesign from '~/components/editor/InspectorDesign.vue'
import InspectorLayer from '~/components/editor/InspectorLayer.vue'
import LayerTree from '~/components/editor/LayerTree.vue'
import { createLayerStore, LAYER_STORE } from '~/canvas/store'
import { uploadImage } from '~/canvas/images'
import EditorAssets from '~/components/editor/EditorAssets.vue'
import FigmaLinkModal from '~/components/editor/FigmaLinkModal.vue'
import DocReader from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'
import type { Viewport } from '~/components/editor/EditorCanvas.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { docIcon, DOC_CATEGORY_LABEL, type DocCategory } from '~/composables/useIrisData'

const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId as string
const { project, pages, pageId, screens, addPage, renamePage, addScreen, updateScreen, removeScreen } = useEditor(projectId)
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const allScreens = useProjectScreens(projectId)
const { addRequirement, setLink } = useIrisMutations()

// ---------------------------------------------------------------------------
// 상태
// ---------------------------------------------------------------------------
const left = ref<'file' | 'assets' | 'docs'>('file')
const tab = ref<'design' | 'plan' | 'dev'>('plan')
const tool = ref<Tool>('move')
const asset = ref<string | null>(null)
const docId = ref<string | null>(null)
const docReq = ref<string | null>(null)
const addDocOpen = ref(false)
const figmaOpen = ref(false)
const vp = ref<Viewport>({ x: 352, y: 94, zoom: 0.5 })
const canvas = ref<{ fit: (ids?: string[]) => void; zoomAt: (z: number) => void; fitSelection: () => void } | null>(null)
const plan = ref<{ openPicker: () => void } | null>(null)

const list = computed(() => screens.data.value ?? [])
const { tokens } = useDesignSystem()
const supabase = useSupabaseClient()
const preview = useDevPreview()
// 화면 안 레이어: 고르기 · 실행취소 · 자동저장
const store = createLayerStore({
  screens: list,
  save: (sid, doc) => updateScreen(sid, { layers: doc }),
  tokens: computed(() => (tokens.data.value ?? []).map((t) => ({ name: t.name, value: t.value }))),
})
provide(LAYER_STORE, store)
const selected = store.screenId
const current = computed(() => list.value.find((s) => s.id === selected.value) ?? null)
const openDoc = computed(() => (docs.data.value ?? []).find((d) => d.id === docId.value) ?? null)
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
/** 문서에서 고른 요구사항에 연결된 화면을 캔버스에서 강조 */
const highlight = computed(() => (docReq.value ? (links.data.value ?? []).filter((l) => l.requirement_id === docReq.value).map((l) => l.screen_id) : []))

// 토스트
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

// ---------------------------------------------------------------------------
// 페이지 · 화면
// ---------------------------------------------------------------------------
const views = new Map<string, Viewport>() // 페이지마다 보던 위치 기억
let fitted: string | null = null
watch(pageId, (next, prev) => {
  if (prev) views.set(prev, { ...vp.value })
  store.selectScreen(null)
  const v = next ? views.get(next) : undefined
  if (v) { vp.value = v; fitted = next }
})
watch(() => [pageId.value, screens.status.value] as const, ([pid, st]) => {
  if (!import.meta.client || st !== 'success' || !pid || fitted === pid) return
  fitted = pid
  nextTick(() => canvas.value?.fit())
}, { immediate: true })
onMounted(() => { if (screens.status.value === 'success' && fitted !== pageId.value) { fitted = pageId.value; canvas.value?.fit() } })

async function onAddPage() {
  try { await addPage() } catch { say('페이지를 만들지 못했어요. 다시 시도해주세요.') }
}
const renaming = ref<string | null>(null)
async function onRename(id: string, e: Event) {
  renaming.value = null
  try { await renamePage(id, (e.target as HTMLInputElement).value) } catch { say('이름을 바꾸지 못했어요.') }
}

function onMove(id: string, x: number, y: number, done: boolean) {
  const s = list.value.find((v) => v.id === id)
  if (!s) return
  if (!done) { s.x = x; s.y = y; return }
  updateScreen(id, { x, y }).catch(() => say('위치를 저장하지 못했어요. 다시 시도해주세요.'))
}
async function onCreate(rect: { x: number; y: number; width: number; height: number }) {
  try {
    const row = await addScreen(rect)
    if (row) { store.selectScreen(row.id); tab.value = 'design' }
  } catch { say('화면을 만들지 못했어요. 다시 시도해주세요.') }
}
function onUpdate(patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>) {
  if (current.value) updateScreen(current.value.id, patch).catch(() => say('저장하지 못했어요. 다시 시도해주세요.'))
}
async function onRemove() {
  if (!current.value) return
  const name = current.value.name
  try { await removeScreen(current.value.id); store.selectScreen(null); say(`'${name}' 화면을 지웠어요`) } catch { say('화면을 지우지 못했어요.') }
}
const nextX = computed(() => (list.value.length ? Math.max(...list.value.map((s) => s.x + s.width)) + 80 : 0))
async function onFigmaCreated() {
  await screens.refresh()
  say('피그마 화면을 가져왔어요')
}

/** 다른 페이지의 화면이면 그 페이지로 옮긴 뒤 고르기 */
async function pickScreen(id: string, focus = false) {
  const s = allScreens.data.value?.find((v) => v.id === id)
  if (s && s.page_id !== pageId.value) {
    focus = true
    pageId.value = s.page_id
    await until(() => screens.status.value === 'success' && list.value.some((v) => v.id === id))
  }
  store.selectScreen(id)
  if (focus) setTimeout(() => canvas.value?.fit([id]), 60)
}
function until(ok: () => boolean, ms = 3000) {
  return new Promise<void>((resolve) => {
    const t0 = Date.now()
    const tick = () => (ok() || Date.now() - t0 > ms ? resolve() : setTimeout(tick, 50))
    tick()
  })
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------
const docGroups = computed(() => {
  const order: DocCategory[] = ['planning', 'design', 'dev', 'etc']
  return order
    .map((k) => ({ k, label: DOC_CATEGORY_LABEL[k], items: (docs.data.value ?? []).filter((d) => d.category === k) }))
    .filter((g) => g.items.length)
})
const reqCount = (id: string) => (reqs.data.value ?? []).filter((r) => r.document_id === id).length
function showDoc(id: string, reqId?: string | null) {
  docId.value = id
  docReq.value = reqId ?? null
}
function closeDoc() { docId.value = null; docReq.value = null }

async function onCreateReq(p: { text: string; block: string | null }) {
  if (!docId.value) return
  const nums = (reqs.data.value ?? []).map((r) => Number(r.code.match(/(\d+)$/)?.[1] ?? 0))
  const code = 'REQ-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')
  const title = p.text.replace(/\s+/g, ' ').trim().slice(0, 80)
  try {
    const id = await addRequirement(projectId, { document_id: docId.value, code, title, anchor: p.block ? { block: p.block } : null })
    if (current.value) await setLink({ screen_id: current.value.id, requirement_id: id, status: 'missing', note: null })
    await Promise.all([reqs.refresh(), links.refresh()])
    docReq.value = id
    say(current.value ? `${code}를 만들고 '${current.value.name}'에 연결했어요` : `${code}를 만들었어요`)
  } catch { say('요구사항을 만들지 못했어요. 다시 시도해주세요.') }
}
async function onDocCreated(id: string) {
  await Promise.all([docs.refresh(), reqs.refresh()])
  left.value = 'docs'
  showDoc(id)
}

// 주소로 들어온 경우: ?doc=&req= (요구사항 보드의 '원문'), ?screen= (화면 바로 열기)
onMounted(async () => {
  const q = route.query
  if (typeof q.doc === 'string') { left.value = 'docs'; showDoc(q.doc, typeof q.req === 'string' ? q.req : null) }
  if (typeof q.screen === 'string') { await until(() => !!allScreens.data.value); pickScreen(q.screen, true) }
  if (q.doc || q.screen) router.replace({ query: {} })
})

// ---------------------------------------------------------------------------
// 그리기 도구: 그린 뒤에는 디자인 탭, 이미지는 파일 고르기
// ---------------------------------------------------------------------------
watch(tool, (t, prev) => {
  if (t === 'move' && (prev === 'rect' || prev === 'text' || prev === 'frame') && store.layerIds.value.length) tab.value = 'design'
  if (t === 'image') { tool.value = 'move'; pickImage() }
})
const fileInput = ref<HTMLInputElement | null>(null)
let replaceId: string | null = null
function pickImage(replace?: string) {
  const s = current.value
  if (!s || s.source !== 'native') return say('이미지를 넣을 Iris 캔버스 화면을 먼저 골라주세요')
  replaceId = typeof replace === 'string' ? replace : null
  fileInput.value?.click()
}
async function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const s = current.value
  if (!file || !s) return
  if (!file.type.startsWith('image/')) return say('이미지 파일만 넣을 수 있어요')
  if (file.size > 10 * 1024 * 1024) return say('10MB 보다 작은 이미지만 넣을 수 있어요')
  try {
    const img = await uploadImage(file, s.id, { supabase, preview })
    if (replaceId) { store.update(s.id, [replaceId], { src: img.src }); return }
    const k = Math.min(1, (s.width * 0.7) / img.w, (s.height * 0.5) / img.h)
    const w = Math.round(img.w * k), h = Math.round(img.h * k)
    store.add(s.id, null, { type: 'image', name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '이미지', src: img.src, x: Math.round((s.width - w) / 2), y: Math.round((s.height - h) / 2), w, h })
    tab.value = 'design'
  } catch { say('이미지를 올리지 못했어요. 다시 시도해주세요.') }
}
// 저장이 끝나기 전에 떠나면 알리기
function onBeforeUnload(e: BeforeUnloadEvent) { if (store.saveState.state === 'saving' || store.saveState.state === 'error') { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => { window.removeEventListener('beforeunload', onBeforeUnload); store.flushAll() })

// 툴바 버튼
function onRail(k: 'assets' | 'link' | 'figma' | 'comment') {
  if (k === 'assets') { left.value = 'assets'; asset.value = null }
  else if (k === 'figma') figmaOpen.value = true
  else if (k === 'link') {
    if (!current.value) return say('먼저 캔버스에서 화면을 골라주세요')
    closeDoc(); tab.value = 'plan'; nextTick(() => plan.value?.openPicker())
  } else say('코멘트는 다음 단계에서 열려요')
}

async function share() {
  try { await navigator.clipboard.writeText(location.origin + route.path); say('이 프로젝트 링크를 복사했어요') }
  catch { say('링크를 복사하지 못했어요') }
}

const zoomOpen = ref(false)
const ZOOMS = [0.25, 0.5, 1, 2]
const me = useSupabaseUser()
const initial = computed(() => (me.value?.email ?? '나').slice(0, 1).toUpperCase())
const screenName = (id: string) => allScreens.data.value?.find((s) => s.id === id)?.name ?? list.value.find((s) => s.id === id)?.name ?? '화면'
const STATUS_BADGE: Record<ScreenRow['status'], string> = { draft: '작업 중', review: '검토 요청', approved: '확정' }
</script>

<template>
  <div class="editor">
    <EditorCanvas
      ref="canvas"
      v-model:tool="tool"
      v-model:viewport="vp"
      :screens="list"
      :highlight="highlight"
      @move="onMove"
      @create="onCreate"
      @hint="say"
    />
    <div v-if="screens.status.value === 'success' && !list.length" class="canvas-empty">
      <span class="tx-head">이 페이지는 비어 있어요</span>
      <span class="tx-meta">프레임 도구(F)로 화면을 그리거나 피그마 화면을 가져와요</span>
      <span class="row"><button class="act line" @click="tool = 'frame'">프레임 그리기</button><button class="act line" @click="figmaOpen = true">피그마에서 가져오기</button></span>
    </div>

    <!-- 왼쪽 위: 파일 알약 -->
    <div class="sq float s pill-left">
      <NuxtLink to="/" class="sq hov home" aria-label="Iris 홈으로"><img src="/bd-symbol.svg" alt="" height="12" onerror="this.remove()"><Icon name="chevron_down" :size="12" /></NuxtLink>
      <span class="tx-head ellipsis">{{ project.data.value?.name ?? '' }}</span>
      <span v-if="store.saveState.state === 'saving'" class="tx-meta save">저장 중</span>
      <button v-else-if="store.saveState.state === 'error'" class="tx-meta save err" @click="store.flushAll()">저장 못 함 · 다시</button>
    </div>

    <!-- 왼쪽 패널 -->
    <aside aria-label="왼쪽 패널" class="sq float panel-left">
      <div role="tablist" aria-label="왼쪽 패널" class="seg tabs">
        <button v-for="t in [['file', '파일'], ['assets', '에셋'], ['docs', '문서']] as const" :key="t[0]" role="tab" :aria-selected="left === t[0]" :class="['sq', 'seg-item', { on: left === t[0] }]" @click="left = t[0]">{{ t[1] }}</button>
      </div>

      <template v-if="left === 'file'">
        <section class="pages">
          <div class="sec-h"><span>페이지</span><button class="ib" aria-label="페이지 추가" @click="onAddPage"><Icon name="plus" :size="14" /></button></div>
          <Skeleton v-if="pages.status.value === 'pending'" shape="text" />
          <template v-for="p in pages.data.value ?? []" :key="p.id">
            <input v-if="renaming === p.id" class="txt-in rename" :value="p.name" aria-label="페이지 이름" autofocus @blur="onRename(p.id, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renaming = null">
            <button v-else :class="['sq', 'nav-item', 's', { on: pageId === p.id }]" :title="'두 번 눌러 이름 바꾸기'" @click="pageId = p.id" @dblclick="renaming = p.id">{{ p.name }}</button>
          </template>
        </section>
        <section class="layers">
          <span class="nav-label">레이어</span>
          <LayerTree :screens="list" @pick-screen="pickScreen" />
          <p v-if="screens.status.value === 'success' && !list.length" class="tx-meta empty">화면이 아직 없어요</p>
        </section>
      </template>

      <EditorAssets v-else-if="left === 'assets'" v-model:open="asset" :screen-ids="list.map((s) => s.id)" :screen-name="screenName" @pick-screen="(id: string) => pickScreen(id, true)" />

      <div v-else class="docs">
        <div class="sec-h"><span>문서</span><button class="ib" aria-label="문서 추가" @click="addDocOpen = true"><Icon name="plus" :size="14" /></button></div>
        <Skeleton v-if="docs.status.value === 'pending'" shape="text" />
        <div v-for="g in docGroups" :key="g.k" class="dgroup">
          <span class="nav-label">{{ g.label }}</span>
          <button v-for="d in g.items" :key="d.id" :class="['sq', 'nav-item', 's', { on: docId === d.id }]" @click="showDoc(d.id)">
            <Icon :name="docIcon(d)" :size="12" class="flex-none" />
            <span class="ellipsis f1">{{ d.title }}</span>
            <span v-if="reqCount(d.id)" class="tx-meta num">{{ reqCount(d.id) }}</span>
            <Icon v-if="d.fetch_status === 'failed'" name="warning" :size="12" class="muted" />
          </button>
        </div>
        <div v-if="docs.status.value === 'success' && !docGroups.length" class="empty-col">
          <span class="tx-meta">아직 문서가 없어요</span>
          <button class="act line" @click="addDocOpen = true"><Icon name="plus" :size="12" />문서 추가</button>
        </div>
      </div>
    </aside>

    <!-- 오른쪽 위 알약 -->
    <div class="sq float s pill-right">
      <span class="avatar" :title="me?.email ?? ''">{{ initial }}</span>
      <button :class="['act', 'gray', 'ml-auto', { on: !!docId }]" :aria-pressed="!!docId" @click="docId ? closeDoc() : (left = 'docs')">문서</button>
      <button class="act pri" @click="share">공유</button>
    </div>

    <!-- 오른쪽 패널 -->
    <aside aria-label="오른쪽 패널" class="sq float panel-right">
      <!-- 문서 읽기 -->
      <template v-if="openDoc">
        <div class="seg tabs line-b">
          <button class="sq seg-item on">문서</button>
          <span class="tx-meta ellipsis f1 pl4">{{ current ? `'${current.name}' 화면과 함께 보는 중` : '' }}</span>
          <button class="ib" aria-label="문서 닫기" @click="closeDoc"><Icon name="close" :size="16" /></button>
        </div>
        <div class="scroll reader">
          <DocReader :doc="openDoc" :reqs="docReqs" :highlight="docReq" compact @pick-req="(id: string) => (docReq = docReq === id ? null : id)" @create-req="onCreateReq" />
        </div>
      </template>

      <!-- 인스펙터 -->
      <template v-else>
        <div role="tablist" aria-label="인스펙터 탭" class="seg tabs">
          <button v-for="t in [['design', '디자인'], ['plan', '기획'], ['dev', '개발']] as const" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]">{{ t[1] }}</button>
          <div class="zoom-wrap">
            <button class="sq hov zoom" aria-label="확대 비율" :aria-expanded="zoomOpen" @click="zoomOpen = !zoomOpen"><span class="num">{{ Math.round(vp.zoom * 100) }}%</span><Icon name="chevron_down" :size="12" class="muted" /></button>
            <div v-if="zoomOpen" class="sq menu zmenu" role="menu" @click="zoomOpen = false">
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom * 1.25)"><span class="f1">확대</span><span class="tx-meta">⌘ +</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.zoomAt(vp.zoom / 1.25)"><span class="f1">축소</span><span class="tx-meta">⌘ −</span></button>
              <button class="sq menu-item" role="menuitem" @click="canvas?.fit()"><span class="f1">전체 보기</span><span class="tx-meta">⇧ 1</span></button>
              <button v-if="selected" class="sq menu-item" role="menuitem" @click="canvas?.fitSelection()"><span class="f1">선택 보기</span><span class="tx-meta">⇧ 2</span></button>
              <button v-for="z in ZOOMS" :key="z" class="sq menu-item num" role="menuitem" @click="canvas?.zoomAt(z)">{{ z * 100 }}%</button>
            </div>
          </div>
        </div>

        <template v-if="current">
          <div v-if="tab !== 'design'" class="obj">
            <div class="obj-row">
              <span class="tx-head ellipsis">{{ current.name }}</span>
              <span class="sq badge">{{ STATUS_BADGE[current.status] }}</span>
            </div>
            <span class="tx-meta">{{ current.source === 'figma' ? '피그마 화면' : 'Iris 캔버스' }} · <span class="num">{{ Math.round(current.width) }} × {{ Math.round(current.height) }}</span></span>
          </div>
          <div class="scroll">
            <InspectorPlan v-if="tab === 'plan'" ref="plan" :key="current.id" :project-id="projectId" :screen="current" @open-doc="(id: string, req?: string) => showDoc(id, req)" @toast="say" @add-doc="addDocOpen = true" />
            <InspectorDev v-else-if="tab === 'dev'" :screen="current" @open-asset="(id: string) => { left = 'assets'; asset = id }" @toast="say" />
            <InspectorLayer v-else-if="store.layerIds.value.length" :screen="current" @replace-image="pickImage" />
            <InspectorDesign v-else :screen="current" @update="onUpdate" @remove="onRemove" />
          </div>
        </template>
        <div v-else class="none">
          <p class="tx-meta m0">캔버스에서 화면을 골라주세요</p>
          <p class="tx-meta m0 keys">이동 · 스페이스+드래그 또는 빈 곳 드래그<br>확대 · ⌘+스크롤 또는 핀치<br>전체 보기 · ⇧1</p>
        </div>
      </template>
    </aside>

    <EditorToolbar v-model="tool" @rail="onRail" />

    <Transition name="toast"><div v-if="toast" class="sq toast" role="status">{{ toast }}</div></Transition>

    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" class="sr" tabindex="-1" aria-hidden="true" @change="onImageFile">
    <AddDocModal v-model:open="addDocOpen" :project-id="projectId" @created="onDocCreated" />
    <FigmaLinkModal v-if="pageId" v-model:open="figmaOpen" :page-id="pageId" :next-x="nextX" @created="onFigmaCreated" />
  </div>
</template>

<style scoped>
.editor { height: 100vh; position: relative; overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.canvas-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: var(--ref-spacing-02); pointer-events: none; }
.canvas-empty .row { display: flex; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-06); pointer-events: auto; }
.save { margin-left: auto; flex: none; padding-right: var(--ref-spacing-04); }
.save.err { color: var(--sys-color-theme-error-default); }
.pill-left { position: absolute; left: var(--iris-gap); top: var(--iris-gap); width: 264px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); z-index: 3; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.panel-left { position: absolute; left: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 264px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; }
.pill-right { position: absolute; right: var(--iris-gap); top: var(--iris-gap); width: 288px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06); z-index: 3; }
.panel-right { position: absolute; right: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 288px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; }
.tabs { padding: var(--ref-spacing-06); flex: none; }
.line-b { box-shadow: 0 1px 0 var(--iris-line); gap: var(--ref-spacing-02); }
.pl4 { padding-left: var(--ref-spacing-04); }
.pages { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); flex: none; max-height: 40%; overflow: auto; }
.pages .sec-h, .docs > .sec-h { padding: 0 var(--ref-spacing-02) 0 var(--ref-spacing-08); }
.rename { margin: 1px 0; height: 28px; }
.layers { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; padding: var(--ref-spacing-10) var(--ref-spacing-04); }
.layers .nav-label { padding-bottom: var(--ref-spacing-06); }
.docs { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: 0 var(--ref-spacing-04) var(--ref-spacing-10); }
.dgroup { display: flex; flex-direction: column; }
.dgroup .nav-label { color: var(--sys-color-neutral-500); font-weight: 500; }
.empty { padding: 0 var(--ref-spacing-08); margin: 0; }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-08); }
.flex-none { flex: none; }
.f1 { flex: 1; }
.muted { color: var(--sys-color-neutral-500); flex: none; }
.lead-auto { margin-left: auto; }
.ml-auto { margin-left: auto; }
.act.gray.on { --sq-fill: var(--sys-color-brand-primary-lightest); color: var(--sys-color-brand-primary-default); }
.zoom-wrap { margin-left: auto; position: relative; }
.zoom { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-02) var(--ref-spacing-04); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.zmenu { left: auto; right: 0; width: 168px; }
.obj { flex: none; display: flex; flex-direction: column; padding: var(--ref-spacing-02) var(--ref-spacing-10) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.obj-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.badge { flex: none; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); font-weight: 500; }
.scroll { flex: 1; min-height: 0; overflow: auto; }
.reader { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-16); }
.none { padding: var(--ref-spacing-08) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-08); }
.keys { line-height: 20px; }
.m0 { margin: 0; }
.avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); display: grid; place-items: center; font-size: 10px; font-weight: 600; flex: none; }
.toast { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 10; padding: var(--ref-spacing-05) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); white-space: nowrap; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 6px); }
</style>
