<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { NEW_TAB_ID, NEW_TAB_PATH, tabIdOf, useTabs } from '~/composables/useTabs'

/**
 * 위 탭 막대 — 홈 탭 + 연 프로젝트 탭(피그마 데스크탑처럼).
 * 규격: 막대 44 · 글자 13/20 · 탭 32(위아래 6 — 아래 화면 · 캔버스와 띄워요, 안쪽 왼쪽 12 · 오른쪽 6) · 모서리 8 · 탭 사이 4 · 좌우 8
 * - 고른 탭: 떠 있는 흰 면(.float 와 같은 선) · 글자 500. 나머지: 바탕 위 글자(호버 회색), 서로 붙은 두 탭 사이엔 세로 선(16)
 * - 탭이 많으면: 탭이 220 → 최소 104 까지 함께 줄고(이름은 … 으로), 그래도 넘치면 막대가 가로로 밀려요(휠 · 고른 탭은 늘 보이게). 양 끝은 흐리게 사라져요
 * - 닫기 × 는 고른 탭 · 올린 탭에만. 가운데 클릭으로도 닫혀요
 * - 탭 뒤 빈 곳: 올리면 + (New file) 가 나타나요(탭이 넘쳐도 + 는 오른쪽에 그대로). 누르거나 빈 곳을 두 번 누르면 새 탭(/new — 프로젝트 고르기 · 새로 만들기)
 *   새 탭은 하나만: 이미 열려 있으면 그 탭으로 가요. 탭 이름은 New file, 앞에 빈 네모 아이콘
 */
const route = useRoute()
const { tabs, homePath, load, track, close, prune } = useTabs()
const { data: projects, status } = useProjects()
const activeId = computed(() => tabIdOf(route.path))
const nameOf = (id: string) => (id === NEW_TAB_ID ? tr('New file') : projects.value?.find((p) => p.id === id)?.name ?? '')

onMounted(() => { load(); track(route.fullPath, route.path); nextTick(edges) })
watch(() => route.fullPath, () => track(route.fullPath, route.path))
watch(status, (s) => { if (s === 'success' && projects.value) prune(new Set(projects.value.map((p) => p.id)), activeId.value) }, { immediate: true })

// 넘칠 때: 고른 탭을 보이게 하고, 양 끝 흐림(fade)은 더 밀 수 있는 쪽에만
const listEl = ref<HTMLElement | null>(null)
const fade = reactive({ l: false, r: false })
function edges() {
  const el = listEl.value
  if (!el) return
  fade.l = el.scrollLeft > 1
  fade.r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}
/** 고른 탭이 막대 밖에 있으면 보이게(탭을 바꾸거나 · 늘거나 · 창 크기가 바뀔 때) */
function reveal() {
  const el = listEl.value, on = el?.querySelector<HTMLElement>('.tab.on')
  if (el && on) {
    const l = on.offsetLeft - el.offsetLeft, r = l + on.offsetWidth
    if (l < el.scrollLeft) el.scrollLeft = l
    else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth
  }
  edges()
}
watch([activeId, () => tabs.value.length], async () => { await nextTick(); reveal() })
function onWheel(e: WheelEvent) {
  const el = listEl.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}
let ro: ResizeObserver | null = null
onMounted(() => { if (listEl.value) { ro = new ResizeObserver(reveal); ro.observe(listEl.value) } })
onBeforeUnmount(() => ro?.disconnect())

function onAux(e: MouseEvent, id: string) { if (e.button === 1) { e.preventDefault(); close(id, activeId.value) } }

// 새 탭: + 버튼 · 빈 곳 두 번 누르기(이미 열려 있으면 그 탭으로 — track 이 탭을 하나만 둬요)
function openNew() { navigateTo(NEW_TAB_PATH) }
function onEmptyDbl(e: MouseEvent) { if (e.target === e.currentTarget) openNew() }
</script>

<template>
  <nav class="tabbar" :aria-label="tr('Tabs')" @dblclick="onEmptyDbl">
    <NuxtLink :to="homePath" :class="['sq', 'tab', 'home', { on: !activeId }]" :aria-label="tr('Home')" :data-tip="tr('Home')" :aria-current="!activeId ? 'page' : undefined"><EditorIcon name="home" :size="20" /></NuxtLink>
    <div :class="['wrap', { fl: fade.l, fr: fade.r }]" @dblclick="onEmptyDbl">
      <div ref="listEl" class="list" @scroll.passive="edges" @wheel="onWheel">
        <div v-for="t in tabs" :key="t.id" :class="['sq', 'tab', 'proj', { on: activeId === t.id }]" @mousedown.middle.prevent @auxclick="onAux($event, t.id)">
          <i class="sep" aria-hidden="true" />
          <NuxtLink :to="t.path" class="lnk" :title="nameOf(t.id) || undefined" :aria-current="activeId === t.id ? 'page' : undefined">
            <EditorIcon v-if="t.id === NEW_TAB_ID" name="tab_new" :size="16" class="nf" />
            <span class="nm">{{ nameOf(t.id) || (status === 'success' ? tr('Untitled') : '…') }}</span>
          </NuxtLink>
          <button type="button" class="sq x" :aria-label="tr('Close {name}', { name: nameOf(t.id) || tr('Untitled') })" @click="close(t.id, activeId)"><EditorIcon name="close" :size="12" /></button>
        </div>
      </div>
    </div>
    <button type="button" class="sq add" :aria-label="tr('New file')" :data-tip="tr('New file')" @click="openNew"><EditorIcon name="plus" :size="16" /></button>
    <span class="rest" aria-hidden="true" @dblclick="openNew" />
  </nav>
</template>

<style scoped>
/* 막대 아래 선 0.5px(끝에서 끝까지): 홈 · 편집기 어디서든 탭 막대와 아래 화면을 나눠요 */
.tabbar { position: relative; z-index: 6; height: var(--iris-tabs-h, 44px); box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--iris-gap); background: var(--iris-canvas); box-shadow: 0 0.5px 0 var(--iris-float-line); font-size: 13px; line-height: 20px; user-select: none; }
/* 탭 목록은 내용만큼(넘치면 줄고 가로로 밀림) — + 는 목록 밖이라 늘 마지막 탭 바로 뒤 · 넘쳐도 보여요 */
.wrap { flex: 0 1 auto; min-width: 0; height: 32px; position: relative; display: flex; }
/* 넘칠 때 양 끝 흐림: 바탕색으로 16px 그라데이션 */
.wrap::before, .wrap::after { content: ''; position: absolute; top: 0; bottom: 0; width: 16px; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .12s ease; }
.wrap::before { left: 0; background: linear-gradient(90deg, var(--iris-canvas), transparent); }
.wrap::after { right: 0; background: linear-gradient(270deg, var(--iris-canvas), transparent); }
.wrap.fl::before, .wrap.fr::after { opacity: 1; }
.list { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-04); overflow-x: auto; scrollbar-width: none; }
.list::-webkit-scrollbar { display: none; }
.tab { flex: none; height: 32px; box-sizing: border-box; display: flex; align-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); }
.tab:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.tab.on { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--sys-color-neutral-800); }
.home { width: 32px; justify-content: center; }
.home:focus-visible, .lnk:focus-visible, .x:focus-visible, .add:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.proj { flex: 0 1 220px; min-width: 104px; padding: 0 var(--ref-spacing-05) 0 0; gap: var(--ref-spacing-02); }
/* 서로 붙은 두 탭(둘 다 고르지 않고 올리지도 않은) 사이 세로 선 16 */
.sep { position: absolute; left: -2.5px; top: 8px; width: 1px; height: 16px; background: var(--ref-color-gray-900-10); display: none; }
.proj + .proj > .sep { display: block; }
.proj.on > .sep, .proj:hover > .sep, .proj.on + .proj > .sep, .proj:hover + .proj > .sep { display: none; }
.lnk { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; padding-left: var(--ref-spacing-08); border-radius: inherit; color: inherit; }
.nf { flex: none; margin-right: var(--ref-spacing-04); }
.nm { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj.on .nm { font-weight: 500; }
.x { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-600); visibility: hidden; }
.proj:hover .x, .proj.on .x, .x:focus-visible { visibility: visible; }
.x:hover { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
/* + 새 탭(New file): 탭 바로 뒤. 막대(탭 뒤 빈 곳)에 올렸을 때만 보여요 */
.add { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); opacity: 0; transition: opacity .12s ease; }
.tabbar:hover .add, .add:focus-visible { opacity: 1; }
.add:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
/* + 뒤 빈 곳(두 번 누르면 새 탭): 탭이 넘치면 0 까지 줄어 + 가 홈과 같은 여백(막대 끝 8)에 붙어요 */
.rest { flex: 1 1 0; min-width: 0; align-self: stretch; margin-left: calc(-1 * var(--ref-spacing-04)); }
</style>
