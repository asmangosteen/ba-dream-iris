<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { MAX_PINNED, NEW_TAB_ID, NEW_TAB_PATH, tabIdOf, useTabReload, useTabs } from '~/composables/useTabs'
import { forgetEditorCache } from '~/composables/useEditor'

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
const { tabs, homePath, evicted, load, track, close, closeMany, togglePin, move, prune } = useTabs()
const { data: projects, status } = useProjects()
const activeId = computed(() => tabIdOf(route.path))
// 탭 이름: 프로젝트 목록 → 없으면 그 프로젝트 화면이 불러온 정보(사이드바 이름과 같은 것) — 어디서 이름을 바꿔도 탭이 따라가요
const nuxt = useNuxtApp()
const detailName = (id: string) => (nuxt.payload.data[`project-${id}`] as { name?: string } | null | undefined)?.name
const nameOf = (id: string) => (id === NEW_TAB_ID ? tr('New file') : (id === activeId.value ? detailName(id) : undefined) ?? projects.value?.find((p) => p.id === id)?.name ?? detailName(id) ?? '')

// 지금 보는 탭은 처음 그릴 때부터(서버에서도) — 새로 고칠 때 탭 막대가 비었다가 채워지지 않게. 나머지 탭은 이 기기 저장에서
track(route.fullPath, route.path)
onMounted(() => { load(); track(route.fullPath, route.path); nextTick(edges) })
watch(() => route.fullPath, () => track(route.fullPath, route.path))
watch(status, (s) => { if (s === 'success' && projects.value) prune(new Set(projects.value.map((p) => p.id)), activeId.value) }, { immediate: true })

// 넘칠 때: 고른 탭을 보이게 하고, 양 끝 흐림(fade)은 더 밀 수 있는 쪽에만
const listEl = ref<HTMLElement | null>(null)
const fade = reactive({ l: false, r: false })
/**
 * 탭이 막대 너비를 넘으면 모든 탭을 같은 너비로(최대 240 · 최소 72 사이에서 함께 줄어요). 넘지 않으면 제목만큼.
 * 제목 전체 너비(scrollWidth)로 재서, 같은 너비로 바뀐 뒤에도 다시 왔다 갔다 하지 않아요
 */
const even = ref(false)
function fitMode() {
  const el = listEl.value, bar = el?.closest('.tabbar') as HTMLElement | null, wrap = el?.parentElement
  if (!el || !bar || !wrap) return
  const items = [...el.querySelectorAll<HTMLElement>('.tab.proj')]
  const natural = items.reduce((sum, it) => {
    const nm = it.querySelector<HTMLElement>('.nm')
    const extra = it.offsetWidth - (nm?.clientWidth ?? 0) // 아이콘 · 여백 · 닫기
    return sum + Math.min(240, Math.max(72, (nm?.scrollWidth ?? 0) + extra))
  }, 0) + Math.max(0, items.length - 1) * 4
  const avail = bar.clientWidth - wrap.offsetLeft - 32 - 4 - 8 // + 버튼 · 사이 · 오른쪽 여백
  even.value = natural > avail
}
function edges() {
  const el = listEl.value
  if (!el) return
  fade.l = el.scrollLeft > 1
  fade.r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}
/** 고른 탭이 막대 밖에 있으면 보이게(탭을 바꾸거나 · 늘거나 · 창 크기가 바뀔 때) */
function reveal() {
  fitMode()
  const el = listEl.value, on = el?.querySelector<HTMLElement>('.tab.on')
  if (el && on) {
    const l = on.offsetLeft - el.offsetLeft, r = l + on.offsetWidth
    if (l < el.scrollLeft) el.scrollLeft = l
    else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth
  }
  edges()
}
watch([activeId, () => tabs.value.length, () => tabs.value.map((t) => nameOf(t.id)).join('|')], async () => { await nextTick(); reveal() })
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

// ---------------------------------------------------------------------------
// 탭 우클릭 메뉴(피그마 데스크탑과 같아요 — Iris 에서 되는 것만): 고정 · 링크 복사 · 이름 바꾸기 · 새로 고침 · 새 창 · 브라우저에서 열기 · 닫기
// ---------------------------------------------------------------------------
const ctx = useContextMenu()
const projActions = useProjectActions()
/** 데스크탑 앱(preload 가 알려 줘요): openExternal 이 있으면 '브라우저에서 열기' */
const desktop = import.meta.client ? (window as unknown as { irisDesktop?: { platform: string; openExternal?: (url: string) => void; onReloadTab?: (cb: () => void) => void } }).irisDesktop : undefined
const linkOf = (path: string) => location.origin + path
/** 화면이 불러오는 중인지(편집기는 페이지 · 화면을 다 읽을 때까지) — 고른 탭에 도는 표시 */
const busy = useState<boolean>('iris-tab-busy', () => false)
const loading = useLoadingIndicator()
/** 0.15초 넘게 걸릴 때만 돌아요(금방 끝나는 로딩에 번쩍이지 않게). 고른 탭의 × 자리에 */
const slow = ref(false)
let slowT: ReturnType<typeof setTimeout> | null = null
watch(() => busy.value || loading.isLoading.value || (!activeId.value && status.value === 'pending'), (v) => {
  if (!import.meta.client) return
  if (slowT) clearTimeout(slowT)
  if (v) slowT = setTimeout(() => (slow.value = true), 150)
  else slow.value = false
}, { immediate: true })
const spinning = (id: string | null) => id === activeId.value && slow.value
const note = ref<string | null>(null)
let noteT: ReturnType<typeof setTimeout> | null = null
function toast(t: string) { note.value = t; if (noteT) clearTimeout(noteT); noteT = setTimeout(() => (note.value = null), 1600) }
// 탭이 20개를 넘어 가장 오래된 탭을 닫았으면 알려 줘요
watch(evicted, (n, o) => { if (n > (o ?? 0)) toast(tr('Closed the oldest tab (up to {n} tabs)', { n: 20 })) })
async function copyLink(path: string) {
  try { await navigator.clipboard.writeText(linkOf(path)); toast(tr('Link copied')) } catch { toast(tr('Couldn’t copy the link')) }
}
/** 새로 고침(그 탭만 — 탭 막대 · 다른 탭은 그대로): 고른 탭은 그 자리에서 다시 그리고, 다른 탭은 그 탭으로 가며 새로 받아요 */
const tabReload = useTabReload()
function reload(path: string, id: string | null) {
  if (id === activeId.value) return tabReload.reload(id)
  if (id && id !== NEW_TAB_ID) forgetEditorCache(id)
  navigateTo(path)
}
function moveToWindow(id: string, path: string) {
  window.open(linkOf(path), '_blank', desktop ? undefined : 'popup,width=1440,height=900')
  close(id, activeId.value)
}
const renamingTab = ref<string | null>(null)
const vFocus = { mounted: (el: HTMLInputElement) => nextTick(() => { el.focus(); el.select() }) }
async function commitRename(id: string, e: Event) {
  if (renamingTab.value !== id) return
  renamingTab.value = null
  const v = (e.target as HTMLInputElement).value.trim()
  if (!v || v === nameOf(id)) return
  try { await projActions.update(id, { name: v }) } catch { toast(tr('Couldn\'t rename the project')) }
}
function tabMenu(id: string, e: MouseEvent) {
  const t = tabs.value.find((x) => x.id === id)
  if (!t) return
  const isNew = id === NEW_TAB_ID
  ctx.open(e, [
    { label: t.pinned ? tr('Unpin') : tr('Pin'), action: () => { if (!togglePin(id)) toast(tr('You can pin up to {n} tabs', { n: MAX_PINNED })) }, disabled: !t.pinned && tabs.value.filter((x) => x.pinned).length >= MAX_PINNED },
    { label: tr('Copy link'), shortcut: desktop ? '⌘L' : undefined, action: () => copyLink(t.path), disabled: isNew },
    { label: tr('Rename file'), action: () => (renamingTab.value = id), disabled: isNew },
    { label: tr('Reload'), action: () => reload(t.path, id) },
    'sep',
    { label: tr('Move to new window'), action: () => moveToWindow(id, t.path) },
    ...(desktop?.openExternal ? [{ label: tr('Open in browser'), action: () => desktop.openExternal!(linkOf(t.path)) }] : []),
    'sep',
    { label: tr('Close'), action: () => close(id, activeId.value) },
    { label: tr('Close other tabs'), action: () => closeMany(id, activeId.value), disabled: tabs.value.every((x) => x.id === id || x.pinned) },
    { label: tr('Close all tabs'), action: () => closeMany(null, activeId.value), disabled: tabs.value.every((x) => x.pinned) },
  ])
}
function homeMenu(e: MouseEvent) {
  ctx.open(e, [
    { label: tr('Copy link'), shortcut: desktop ? '⌘L' : undefined, action: () => copyLink(homePath.value) },
    { label: tr('Reload'), action: () => reload(homePath.value, null) },
    'sep',
    { label: tr('Close all tabs'), action: () => closeMany(null, activeId.value), disabled: tabs.value.every((x) => x.pinned) },
  ])
}
// ---------------------------------------------------------------------------
// 탭 끌어서 순서 바꾸기: 5px 넘게 끌면 탭이 손에 들려 따라오고(떠 있는 탭), 놓일 자리에는 옅은 잔상이 들어가요.
// 다른 탭은 잔상 너비만큼 좌우로 부드럽게 비켜요(TransitionGroup 이동 .24s). 놓으면 떠 있는 탭이 잔상 자리로 스르륵 들어가요.
// 고정한 탭은 맨 앞에 고정한 순서대로 붙박이(끌 수 없어요). 나머지 탭은 고정 탭 뒤에서 자유롭게
// ---------------------------------------------------------------------------
interface TabDrag {
  id: string; x0: number; on: boolean
  /** 끄는 탭을 뺀 목록에서 끼울 번호 */
  at: number
  /** 떠 있는 탭: 왼쪽(화면 좌표) · 잡은 곳 · 너비 · 위 */
  x: number; grab: number; w: number; top: number
  /** 끌기 시작할 때 다른 탭들의 가운데(화면 좌표) · 그때 가로 밀림 — 비켜 가는 중인 탭 위치에 흔들리지 않게 처음 자리로 재요 */
  centers: number[]; scroll0: number
  settle: boolean
}
const dragTab = ref<TabDrag | null>(null)
/** 보이는 순서: 끄는 동안엔 끄는 탭(잔상)을 놓일 자리에 */
const shown = computed(() => {
  const d = dragTab.value
  if (!d?.on) return tabs.value
  const t = tabs.value.find((x) => x.id === d.id)
  if (!t) return tabs.value
  const rest = tabs.value.filter((x) => x.id !== d.id)
  rest.splice(Math.min(d.at, rest.length), 0, t)
  return rest
})
const dragOf = computed(() => (dragTab.value?.on ? tabs.value.find((t) => t.id === dragTab.value!.id) ?? null : null))
let justDragged = false
function tabDown(e: PointerEvent, id: string) {
  if (e.button !== 0 || dragTab.value || renamingTab.value === id || (e.target as HTMLElement).closest('.x') || tabs.value.find((t) => t.id === id)?.pinned) return
  dragTab.value = { id, x0: e.clientX, on: false, at: -1, x: 0, grab: 0, w: 0, top: 0, centers: [], scroll0: 0, settle: false }
  window.addEventListener('pointermove', tabMove)
  window.addEventListener('pointerup', tabUp, { once: true })
  window.addEventListener('pointercancel', tabUp, { once: true })
}
function tabMove(e: PointerEvent) {
  const d = dragTab.value, el = listEl.value
  if (!d || !el || d.settle) return
  if (!d.on) {
    if (Math.abs(e.clientX - d.x0) < 5) return
    const items = [...el.querySelectorAll<HTMLElement>('.tab.proj')]
    const me = items.find((it) => it.dataset.id === d.id)
    if (!me) return
    const r = me.getBoundingClientRect()
    d.grab = d.x0 - r.left; d.w = r.width; d.top = r.top
    d.centers = items.filter((it) => it !== me).map((it) => { const q = it.getBoundingClientRect(); return q.left + q.width / 2 })
    d.scroll0 = el.scrollLeft
    d.at = tabs.value.findIndex((t) => t.id === d.id) // 처음엔 제자리
    d.on = true
  }
  const lr = el.getBoundingClientRect()
  d.x = Math.min(Math.max(e.clientX - d.grab, lr.left), Math.max(lr.left, lr.right - d.w))
  const mid = d.x + d.w / 2, shift = el.scrollLeft - d.scroll0
  const pinned = tabs.value.filter((t) => t.pinned).length
  d.at = Math.max(pinned, d.centers.filter((c) => c - shift < mid).length) // 고정 탭 앞으로는 못 가요
  // 막대 끝에 가까우면 그쪽으로 밀어요
  if (e.clientX < lr.left + 24) el.scrollLeft -= 8
  else if (e.clientX > lr.right - 24) el.scrollLeft += 8
}
function tabUp() {
  window.removeEventListener('pointermove', tabMove)
  window.removeEventListener('pointerup', tabUp)
  window.removeEventListener('pointercancel', tabUp)
  const d = dragTab.value, el = listEl.value
  if (!d?.on) { dragTab.value = null; return }
  // 끌고 놓은 뒤 따라오는 클릭(탭 열기)은 막아요
  justDragged = true
  setTimeout(() => (justDragged = false), 0)
  // 떠 있는 탭을 잔상 자리(비켜 가는 움직임이 끝난 뒤의 자리 — offsetLeft 는 transform 을 빼고 재요)로 스르륵
  const ghost = el?.querySelector<HTMLElement>(`.tab.proj[data-id="${CSS.escape(d.id)}"]`)
  const finish = () => { if (dragTab.value === d) { move(d.id, d.at); dragTab.value = null } }
  if (!ghost || !el) return finish()
  d.settle = true
  d.x = el.getBoundingClientRect().left + ghost.offsetLeft - el.scrollLeft
  setTimeout(finish, 200)
}
function onTabClick(e: MouseEvent) { if (justDragged) { e.preventDefault(); e.stopPropagation() } }
onBeforeUnmount(() => { window.removeEventListener('pointermove', tabMove); window.removeEventListener('pointerup', tabUp); window.removeEventListener('pointercancel', tabUp) })
/** 데스크탑 앱에서 ⌘L: 지금 보는 화면 링크 복사(피그마와 같아요). 브라우저에서는 주소창 키라 그대로 둬요 */
function onKey(e: KeyboardEvent) {
  if (!desktop || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.code !== 'KeyL') return
  if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return
  e.preventDefault()
  copyLink(route.fullPath)
}
onMounted(() => window.addEventListener('keydown', onKey))
// 데스크톱 메뉴 Reload Tab(⌥⌘R): 지금 탭만
onMounted(() => desktop?.onReloadTab?.(() => reload(route.fullPath, activeId.value)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// 새 탭: + 버튼 · 빈 곳 두 번 누르기(이미 열려 있으면 그 탭으로 — track 이 탭을 하나만 둬요)
function openNew() { navigateTo(NEW_TAB_PATH) }
function onEmptyDbl(e: MouseEvent) { if (e.target === e.currentTarget) openNew() }
</script>

<template>
  <nav class="tabbar" :aria-label="tr('Tabs')" @dblclick="onEmptyDbl">
    <NuxtLink :to="homePath" :class="['sq', 'tab', 'home', { on: !activeId }]" :aria-label="tr('Home')" :data-tip="tr('Home')" :aria-current="!activeId ? 'page' : undefined" :aria-busy="spinning(null) || undefined" @contextmenu.prevent="homeMenu"><i v-if="spinning(null)" class="spin" aria-hidden="true" /><EditorIcon v-else name="home" :size="20" /></NuxtLink>
    <div :class="['wrap', { fl: fade.l, fr: fade.r, even }]" @dblclick="onEmptyDbl">
      <div ref="listEl" :class="['list', { even }]" @scroll.passive="edges" @wheel="onWheel">
        <TransitionGroup name="tabmv">
        <div v-for="t in shown" :key="t.id" :data-id="t.id" :class="['sq', 'tab', 'proj', { on: activeId === t.id, pin: t.pinned, ghost: dragTab?.on && dragTab.id === t.id }]" :aria-busy="spinning(t.id) || undefined" @mousedown.middle.prevent @auxclick="onAux($event, t.id)" @contextmenu.prevent="tabMenu(t.id, $event)" @pointerdown="tabDown($event, t.id)" @click.capture="onTabClick" @dragstart.prevent>
          <i class="sep" aria-hidden="true" />
          <input v-if="renamingTab === t.id" v-focus class="sqc ren" :value="nameOf(t.id)" :aria-label="tr('Project name')" spellcheck="false" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="renamingTab = null" @blur="commitRename(t.id, $event)">
          <NuxtLink v-else :to="t.path" class="lnk" :title="nameOf(t.id) || undefined" :aria-current="activeId === t.id ? 'page' : undefined" @dblclick.prevent="t.id !== NEW_TAB_ID && (renamingTab = t.id)">
            <!-- 고정한 탭: 이름 앞 핀(바드림 pin) -->
            <EditorIcon v-if="t.pinned" name="pin" :size="16" class="nf pinic" role="img" :aria-label="tr('Pinned')" />
            <EditorIcon v-else-if="t.id === NEW_TAB_ID" name="tab_new" :size="16" class="nf" />
            <span class="nm">{{ nameOf(t.id) || (status === 'success' ? tr('Untitled') : '…') }}</span>
          </NuxtLink>
          <!-- 불러오는 중이면 × 자리에 도는 표시 -->
          <span v-if="spinning(t.id)" class="x busy" aria-hidden="true"><i class="spin" /></span>
          <button v-else type="button" class="sq x" :aria-label="tr('Close {name}', { name: nameOf(t.id) || tr('Untitled') })" @click="close(t.id, activeId)"><EditorIcon name="close" :size="12" /></button>
        </div>
        </TransitionGroup>
      </div>
      <!-- 손에 들린 탭: 포인터를 따라와요(막대 안에서만) -->
      <div v-if="dragOf && dragTab" :class="['sq', 'tab', 'proj', 'lift', { on: activeId === dragOf.id, settle: dragTab.settle }]" :style="{ transform: `translateX(${dragTab.x}px)`, top: dragTab.top + 'px', width: dragTab.w + 'px' }" aria-hidden="true">
        <span class="lnk">
          <EditorIcon v-if="dragOf.id === NEW_TAB_ID" name="tab_new" :size="16" class="nf" />
          <span class="nm">{{ nameOf(dragOf.id) || tr('Untitled') }}</span>
        </span>
        <span class="x" />
      </div>
    </div>
    <button type="button" class="sq add" :aria-label="tr('New file')" :data-tip="tr('New file')" @click="openNew"><EditorIcon name="plus" :size="16" /></button>
    <span class="rest" aria-hidden="true" @dblclick="openNew" />
    <div v-if="note" class="sq note" role="status">{{ note }}</div>
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
.list { position: relative; flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--ref-spacing-04); overflow-x: auto; scrollbar-width: none; }
/* 탭이 막대를 넘을 때: 막대를 꽉 채우고 모든 탭을 같은 너비로(최소 72 — 그보다 많으면 가로로 밀어요) */
.wrap.even { flex: 1 1 auto; }
.list.even { flex: 1 1 auto; }
.list.even .proj { flex: 1 1 0; width: 0; padding-right: var(--ref-spacing-05); }
/* 끌기: 놓일 자리의 잔상(옅게) · 비켜 가는 다른 탭(.24s) · 손에 들린 탭(포인터를 따라와요, 옅은 그림자) */
.proj { transition: opacity .16s ease; }
.proj.ghost { opacity: .3; }
.proj.ghost > .sep, .proj.ghost + .proj > .sep { display: none; }
.tabmv-move { transition: transform .24s cubic-bezier(.2, .8, .2, 1), opacity .16s ease; }
.lift { position: fixed; left: 0; z-index: 30; pointer-events: none; max-width: none; min-width: 0; --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--sys-color-neutral-800); filter: drop-shadow(0 2px 6px rgb(0 0 0 / 10%)); }
.lift.settle { transition: transform .2s cubic-bezier(.2, .7, .2, 1), filter .2s ease; filter: none; }
.lift .nm { font-weight: 500; }
@media (prefers-reduced-motion: reduce) { .tabmv-move, .lift.settle { transition: none; } }
.list::-webkit-scrollbar { display: none; }
.tab { flex: none; height: 32px; box-sizing: border-box; display: flex; align-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); }
.tab:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.tab.on { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); color: var(--sys-color-neutral-800); }
.home { width: 32px; justify-content: center; }
.home:focus-visible, .lnk:focus-visible, .x:focus-visible, .add:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 탭 너비: 제목이 다 보이게(내용만큼), 최대 240. 탭이 많아 막대가 모자라면 함께 줄어 최소 72 까지(그 뒤로는 막대가 가로로 밀려요) */
.proj { flex: 0 1 auto; max-width: 240px; min-width: 72px; padding: 0 var(--ref-spacing-05) 0 0; gap: var(--ref-spacing-02); }
/* 서로 붙은 두 탭(둘 다 고르지 않고 올리지도 않은) 사이 세로 선 16 */
.sep { position: absolute; left: -2.5px; top: 8px; width: 1px; height: 16px; background: var(--ref-color-gray-900-10); display: none; }
.proj + .proj > .sep { display: block; }
.proj.on > .sep, .proj:hover > .sep, .proj.on + .proj > .sep, .proj:hover + .proj > .sep { display: none; }
.lnk { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; padding-left: var(--ref-spacing-08); border-radius: inherit; color: inherit; }
.nf { flex: none; margin-right: var(--ref-spacing-04); }
.nm { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.proj.on .nm { font-weight: 500; }
.x { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-600); visibility: hidden; }
.proj:hover .x, .proj.on .x, .x:focus-visible, .x.busy { visibility: visible; }
.x.busy .spin { margin: 0; }
.x:hover { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
/* + 새 탭(New file): 탭 바로 뒤. 막대(탭 뒤 빈 곳)에 올렸을 때만 보여요 */
.add { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); opacity: 0; transition: opacity .12s ease; }
.tabbar:hover .add, .add:focus-visible { opacity: 1; }
.add:hover { --sq-fill: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
/* 불러오는 중: 탭 아이콘 자리에 도는 고리(12) — 움직임을 줄이면 깜빡이지 않고 옅게만 */
.spin { flex: none; box-sizing: border-box; width: 12px; height: 12px; margin: 0 2px; border-radius: 50%; border: 1.5px solid currentColor; border-top-color: transparent; opacity: .7; animation: tabspin .8s linear infinite, tabspin-in .2s ease both; }
@keyframes tabspin { to { transform: rotate(360deg); } }
@keyframes tabspin-in { from { opacity: 0; } to { opacity: .7; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; border-top-color: currentColor; opacity: .35; } }
/* 핀: 아이콘 안쪽 여백만큼 왼쪽을 2 당겨요 — 홈 · 탭 사이 간격과 눈으로 맞게 */
.pinic { margin-left: -2px; }
/* 이름 바꾸기(탭 두 번 누르기 · 메뉴 'Rename file') */
.ren { flex: 1; min-width: 0; height: 24px; margin-left: var(--ref-spacing-06); padding: 0 var(--ref-spacing-04); border: 0; font: inherit; color: var(--sys-color-neutral-800); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-select, #0D99FF); --sq-line-w: 1px; outline: none; }
/* 링크 복사 등 짧은 알림: 탭 막대 아래 가운데 */
.note { position: fixed; left: 50%; top: calc(var(--iris-tabs-h, 44px) + 12px); transform: translateX(-50%); z-index: 100; padding: 6px 12px; border-radius: var(--ref-radius-04); --sq-fill: #1E1E1E; color: #FFFFFF; font-size: 12px; line-height: 16px; pointer-events: none; }
/* + 뒤 빈 곳(두 번 누르면 새 탭): 탭이 넘치면 0 까지 줄어 + 가 홈과 같은 여백(막대 끝 8)에 붙어요 */
.rest { flex: 1 1 0; min-width: 0; align-self: stretch; margin-left: calc(-1 * var(--ref-spacing-04)); }
</style>
