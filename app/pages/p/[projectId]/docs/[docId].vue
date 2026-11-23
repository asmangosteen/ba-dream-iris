<script setup lang="ts">
import { Icon, Skeleton } from '@ba-dream/design-system'
import DocReader from '~/components/docs/DocReader.vue'
import AddDocModal from '~/components/docs/AddDocModal.vue'

/** 문서 함께 보기 — 오른쪽에 문서, 왼쪽 캔버스에 이 문서와 연결된 화면 (design/iris-canvas/DocSplit.dc.html) */
const route = useRoute()
const projectId = route.params.projectId as string
const docId = computed(() => route.params.docId as string)

const { data: projects } = useProjects()
const docs = useDocuments(projectId)
const { reqs, links } = useRequirements(projectId)
const screens = useProjectScreens(projectId)
const { addRequirement } = useIrisMutations()

const projectName = computed(() => projects.value?.find((p) => p.id === projectId)?.name ?? '')
const doc = computed(() => docs.data.value?.find((d) => d.id === docId.value) ?? null)
const docReqs = computed(() => (reqs.data.value ?? []).filter((r) => r.document_id === docId.value))
const docReqIds = computed(() => new Set(docReqs.value.map((r) => r.id)))
const docLinks = computed(() => (links.data.value ?? []).filter((l) => docReqIds.value.has(l.requirement_id)))

useHead({ title: computed(() => (doc.value ? `${doc.value.title} · Iris` : 'Iris')) })

// 선택 상태 --------------------------------------------------------------
const activeReq = ref<string | null>(null)
const activeScreen = ref<string | null>(null)
watch(docId, () => { activeReq.value = null; activeScreen.value = null })

/** 이 문서의 요구사항과 연결된 화면만 보여 줍니다 */
const frames = computed(() => {
  const linked = new Set(docLinks.value.map((l) => l.screen_id))
  return (screens.data.value ?? []).filter((s) => linked.has(s.id))
})
const activeLinks = computed(() => new Map(docLinks.value.filter((l) => l.requirement_id === activeReq.value).map((l) => [l.screen_id, l])))
const reqCount = (screenId: string) => docLinks.value.filter((l) => l.screen_id === screenId).length
const isLit = (screenId: string) => activeLinks.value.has(screenId) || activeScreen.value === screenId
const isDim = (screenId: string) => (!!activeReq.value || !!activeScreen.value) && !isLit(screenId)

const reader = ref<InstanceType<typeof DocReader> | null>(null)
const canvas = ref<HTMLElement | null>(null)

function pickReq(id: string) {
  activeScreen.value = null
  activeReq.value = activeReq.value === id ? null : id
  if (!activeReq.value) return
  nextTick(() => {
    const first = frames.value.find((s) => activeLinks.value.has(s.id))
    if (first) canvas.value?.querySelector(`[data-screen="${first.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })
}

function pickScreen(id: string) {
  // 화면을 누르면 그 화면과 연결된 첫 요구사항으로 문서를 옮깁니다
  const first = docReqs.value.find((r) => docLinks.value.some((l) => l.screen_id === id && l.requirement_id === r.id))
  activeScreen.value = id
  activeReq.value = first?.id ?? null
  if (first) nextTick(() => reader.value?.scrollToReq(first.id))
}

// 고른 글로 요구사항 만들기 ------------------------------------------------
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function say(msg: string) {
  notice.value = msg
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3000)
}
onBeforeUnmount(() => clearTimeout(noticeTimer))

function nextCode(): string {
  const max = (reqs.data.value ?? []).reduce((m, r) => {
    const n = Number(r.code.match(/^REQ-(\d+)$/i)?.[1] ?? 0)
    return n > m ? n : m
  }, 0)
  return 'REQ-' + String(max + 1).padStart(3, '0')
}

async function createReq({ text, block }: { text: string; block: string | null }) {
  if (!doc.value) return
  const code = nextCode()
  try {
    const id = await addRequirement(projectId, {
      document_id: doc.value.id,
      code,
      title: text.length > 60 ? text.slice(0, 59) + '…' : text,
      body: text,
      anchor: block ? { block } : {},
      origin: 'manual',
    })
    await reqs.refresh()
    activeScreen.value = null
    activeReq.value = id
    say(`${code} 요구사항을 만들었어요`)
  } catch {
    say('요구사항을 만들지 못했어요. 잠시 뒤 다시 시도해주세요.')
  }
}

const addOpen = ref(false)
</script>

<template>
  <div class="split">
    <!-- 왼쪽 위: 돌아가기 알약 -->
    <div class="sq float s pill">
      <NuxtLink :to="`/p/${projectId}`" class="ib" aria-label="에디터로 돌아가기"><Icon name="chevron_left" :size="16" /></NuxtLink>
      <NuxtLink :to="`/p/${projectId}`" class="tx-meta crumb ellipsis">{{ projectName || '프로젝트' }}</NuxtLink>
      <Icon name="chevron_right" :size="12" color="var(--sys-color-neutral-400)" />
      <span class="tx-head">문서 함께 보기</span>
    </div>

    <!-- 캔버스: 연결된 화면 -->
    <main ref="canvas" aria-label="캔버스" class="canvas-dots canvas">
      <p v-if="screens.status.value === 'success' && links.status.value === 'success' && !frames.length" class="tx-meta hint">이 문서와 연결된 화면이 아직 없어요</p>
      <p v-else-if="frames.length" class="tx-meta hint">{{ activeReq ? '강조된 화면이 이 요구사항과 연결돼 있어요' : '요구사항을 누르면 연결된 화면이 강조돼요' }}</p>
      <div class="frames">
        <button
          v-for="s in frames"
          :key="s.id"
          type="button"
          :data-screen="s.id"
          :class="['frame-col', { lit: isLit(s.id), dim: isDim(s.id) }]"
          :aria-pressed="isLit(s.id)"
          :aria-label="`${s.name} 화면 · 요구사항 ${reqCount(s.id)}개`"
          @click="pickScreen(s.id)"
        >
          <span class="frame-label">
            <span class="ellipsis">{{ s.name }}</span>
            <StatusIcon v-if="activeLinks.get(s.id)" :status="activeLinks.get(s.id)!.status" :size="10" />
          </span>
          <span class="frame" aria-hidden="true">
            <span class="f-status" />
            <span class="f-title">{{ s.name }}</span>
            <span class="f-body">
              <span class="f-bar" />
              <span class="f-card" />
              <span class="f-card" />
              <span class="f-card" />
            </span>
            <span class="f-cta" />
          </span>
          <span class="frame-page">{{ s.page }}</span>
        </button>
      </div>
    </main>

    <!-- 오른쪽: 문서 -->
    <aside aria-label="문서" class="sq float doc">
      <div class="doc-tabs">
        <nav class="seg tabs" aria-label="문서 고르기">
          <NuxtLink
            v-for="d in docs.data.value ?? []"
            :key="d.id"
            :to="`/p/${projectId}/docs/${d.id}`"
            replace
            :aria-current="d.id === docId ? 'page' : undefined"
            :class="['sq', 'seg-item', 'tab', { on: d.id === docId }]"
          >
            <Icon :name="docIcon(d)" :size="12" />
            <span class="ellipsis">{{ d.title }}</span>
          </NuxtLink>
        </nav>
        <button type="button" class="ib" aria-label="문서 추가" @click="addOpen = true"><Icon name="plus" :size="16" /></button>
        <NuxtLink :to="`/p/${projectId}`" class="ib" aria-label="문서 닫기"><Icon name="close" :size="16" /></NuxtLink>
      </div>

      <div class="doc-body">
        <div v-if="docs.status.value === 'pending'" class="loading">
          <Skeleton shape="text" width="60%" />
          <Skeleton shape="text" />
          <Skeleton shape="text" width="80%" />
        </div>
        <div v-else-if="!doc" class="missing">
          <h1 class="tx-title">문서를 찾지 못했어요</h1>
          <p class="tx-meta">지워졌거나 주소가 바뀌었을 수 있어요.</p>
          <NuxtLink :to="`/p/${projectId}`" class="act line">에디터로 돌아가기</NuxtLink>
        </div>
        <DocReader
          v-else
          ref="reader"
          :doc="doc"
          :reqs="docReqs"
          :highlight="activeReq"
          @pick-req="pickReq"
          @create-req="createReq"
        />
      </div>

      <p class="sr" role="status" aria-live="polite">{{ notice }}</p>
      <Transition name="fade">
        <p v-if="notice" class="sq toast" aria-hidden="true">{{ notice }}</p>
      </Transition>
    </aside>

    <AddDocModal v-model:open="addOpen" :project-id="projectId" />
  </div>
</template>

<style scoped>
.split { position: relative; height: 100vh; overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pill { position: absolute; left: var(--iris-gap); top: var(--iris-gap); z-index: 3; height: 40px; max-width: calc(100% - 640px); box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-10) 0 var(--ref-spacing-04); }
.crumb:hover { color: var(--sys-color-neutral-800); }
.pill .tx-head { white-space: nowrap; }

.canvas { position: absolute; inset: 0; overflow: auto; padding: 64px 632px 48px 48px; box-sizing: border-box; }
.hint { margin: 0 0 var(--ref-spacing-12); }
.frames { display: flex; flex-wrap: wrap; gap: 32px 44px; }
.frame-col { display: flex; flex-direction: column; gap: var(--ref-spacing-06); width: 176px; flex: none; text-align: left; transition: opacity .15s; }
.frame-col.dim { opacity: .55; }
.frame-label { display: flex; align-items: center; gap: var(--ref-spacing-04); font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.frame-col.lit .frame-label { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.frame-page { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-400); }
/* 375 × 812 화면을 176 폭으로 줄인 틀 (썸네일 전까지 자리만) */
.frame { position: relative; display: block; width: 176px; height: 381px; border-radius: 2px; overflow: hidden; background: var(--sys-color-common-white-default); box-shadow: var(--shadow-01); outline: 1px solid var(--iris-line); }
.frame-col:hover .frame { outline-color: var(--ref-color-gray-900-20); }
.frame-col.lit .frame { outline: 1.5px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.frame-col:focus-visible { outline: none; }
.frame-col:focus-visible .frame { outline: 1.5px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.f-status { display: block; height: 26px; }
.f-title { display: block; padding: 0 9px 10px; font-size: 11px; line-height: 16px; font-weight: 600; color: var(--sys-color-common-black-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f-body { display: flex; flex-direction: column; gap: 6px; padding: 0 9px; }
.f-bar { height: 22px; border-radius: 6px; background: var(--sys-color-neutral-100); }
.f-card { height: 54px; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); }
.f-cta { position: absolute; left: 9px; right: 9px; bottom: 11px; height: 24px; border-radius: 6px; background: var(--sys-color-brand-primary-default); }

.doc { position: absolute; right: var(--iris-gap); top: var(--iris-gap); bottom: var(--iris-gap); z-index: 3; width: 600px; max-width: calc(100% - 16px); display: flex; flex-direction: column; overflow: hidden; }
.doc-tabs { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-06); box-shadow: 0 1px 0 var(--iris-line); }
.tabs { flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab { max-width: 168px; }
.doc-body { flex: 1; min-height: 0; overflow: auto; padding: var(--ref-spacing-14) var(--ref-spacing-16) var(--ref-spacing-17); }
.loading { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.missing { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-06); }
.missing p { margin: 0 0 var(--ref-spacing-04); }

.toast { position: absolute; left: 50%; bottom: var(--ref-spacing-12); transform: translateX(-50%); margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-10); border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); font-weight: 500; white-space: nowrap; filter: drop-shadow(0 8px 16px rgb(69 76 88 / 24%)); }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
