<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Button, TextButton } from '@ba-dream/design-system'
import { LAYER_ICON } from '~/canvas/icons'
import DsPreview from '~/components/ds/DsPreview.vue'
import { h, render } from 'vue'
import { dsComponent, instanceProps, slotFallback } from '~/components/editor/InstanceView.vue'
import { DS_DRAG } from '~/composables/useDsInstances'

/** 왼쪽 패널 · 에셋: 디자인 시스템 컴포넌트 찾기 → 상세(코드 · 별칭 · 이 파일에서 쓰는 곳 · 다른 프로젝트에서 쓰는 곳).
    디자인 시스템 화면(메뉴)을 따로 두지 않고 여기로 합쳤어요 — 컴포넌트를 고르면 실제 모습 · 넣기 · 쓰인 화면을 한 번에 */
const props = defineProps<{ screenIds: string[]; screenName: (id: string) => string; open?: string | null }>()
const emit = defineEmits<{ 'update:open': [id: string | null]; 'pick-screen': [id: string]; insert: [name: string] }>()

const { components } = useDesignSystem()
const usages = useUsages('assets', () => props.screenIds)
const q = ref('')
const qFocus = ref(false)
const qEl = ref<HTMLInputElement | null>(null)
function clearQ() { q.value = ''; qEl.value?.focus() }

const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const list = (components.data.value ?? []).filter((c) => !s || [c.name, c.code_name, c.description, c.description ? tr(c.description) : '', tr(c.category), ...(c.match_aliases ?? [])].some((v) => v?.toLowerCase().includes(s)))
  const map = new Map<string, typeof list>()
  for (const c of list) map.set(c.category, [...(map.get(c.category) ?? []), c])
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})

const detail = computed(() => (components.data.value ?? []).find((c) => c.id === props.open) ?? null)
const uses = computed(() => (usages.data.value ?? []).filter((u) => u.component_id === props.open))
// 목록 이름 → 디자인 시스템 export 이름. 이름이 다른 것만 적어요(Map 은 맞는 컴포넌트가 없어 넣을 수 없음)
const EXPORT_ALIAS: Record<string, string> = { Calendar: 'DatePicker' }
/** 캔버스에 넣을 수 있는 실제 컴포넌트 이름. 없으면 null(끌기 · Insert 를 열지 않아요) */
function exportName(c: { name: string; code_name?: string | null }) {
  for (const n of [EXPORT_ALIAS[c.name], c.code_name, c.name]) if (n && dsComponent(n)) return n
  return null
}
function onDrag(e: DragEvent, name: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(DS_DRAG, name)
  e.dataTransfer.effectAllowed = 'copy'
  // 끄는 모습: 카드 전체가 아니라 캔버스에 실제로 들어갈 컴포넌트(기본 속성)만, 원래 크기로(피그마와 같아요)
  const comp = dsComponent(name)
  if (!comp) return
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;display:inline-flex'
  document.body.appendChild(wrap)
  const text = slotFallback(name)
  render(h(comp, instanceProps(name), text !== undefined ? { default: () => text } : undefined), wrap)
  const r = wrap.getBoundingClientRect()
  if (r.width && r.height) e.dataTransfer.setDragImage(wrap, Math.round(r.width / 2), Math.round(r.height / 2))
  setTimeout(() => { render(null, wrap); wrap.remove() })
}
const detailExport = computed(() => (detail.value ? exportName(detail.value) : null))
const propRows = computed(() => Object.entries(detail.value?.props_schema ?? {}).map(([k, v]) => ({ k, v: Array.isArray(v) ? v.join(' · ') : v === 'boolean' ? tr('On · Off') : tr('Text') })))
// 다른 곳에서 쓰는 곳(모든 화면 사용 기록 중 지금 페이지 밖 — 다른 페이지 · 다른 프로젝트) — 화면 이름 · 프로젝트 · 페이지, 누르면 그 화면으로
const allUsages = useUsages('assets-all')
const otherUses = computed(() => {
  const here = new Set(props.screenIds)
  const m = new Map<string, number>()
  for (const u of allUsages.data.value ?? []) if (u.component_id === props.open && !here.has(u.screen_id)) m.set(u.screen_id, (m.get(u.screen_id) ?? 0) + u.count)
  return [...m].map(([screenId, n]) => ({ screenId, n })).sort((a, b) => b.n - a.n)
})
const otherScreens = useUsageScreens('assets-other', () => otherUses.value.map((u) => u.screenId).sort())
const codeText = computed(() => (detailExport.value ? `<${detailExport.value} />` : ''))
const copied = ref(false)
async function copyCode() {
  try { await navigator.clipboard.writeText(codeText.value); copied.value = true; setTimeout(() => { copied.value = false }, 1200) } catch { /* 복사 못 해도 그대로 */ }
}
</script>

<template>
  <div v-if="!detail" class="wrap">
    <div class="top">
      <!-- 편집기 입력칸(.field 28 · 12px)으로: 디자인 시스템 SearchField(34 · 14px)는 패널 밀도와 달라요 -->
      <label :class="['sq', 'field', { focus: qFocus }]">
        <EditorIcon name="search" :size="16" class="qi" />
        <input ref="qEl" v-model="q" type="search" :placeholder="tr('Search assets')" :aria-label="tr('Search assets')" @focus="qFocus = true" @blur="qFocus = false" @keydown.esc="q ? clearQ() : qEl?.blur()">
        <button v-if="q" type="button" class="sq qx" :aria-label="tr('Clear search')" @click="clearQ"><EditorIcon name="close" :size="12" /></button>
      </label>
    </div>
    <div class="list">
      <section v-for="g in groups" :key="g.label" class="grp-sec">
        <span class="glabel">{{ tr(g.label) }}</span>
        <div class="grid">
          <button v-for="c in g.items" :key="c.id" class="tile" :aria-label="tr('View {name} details', { name: c.name })" :title="exportName(c) ? tr('Drag onto the canvas') : undefined" :draggable="exportName(c) ? 'true' : 'false'" @dragstart="(e) => { const n = exportName(c); if (n) onDrag(e, n); else e.preventDefault() }" @click="emit('update:open', c.id)">
            <span class="sq sq-clip asset-thumb" data-preview><DsPreview :names="[c.name, c.code_name, ...(c.match_aliases ?? [])]" :label="c.name" /></span>
            <span class="tname" :title="c.name">{{ c.name }}</span>
          </button>
        </div>
      </section>
      <div v-if="components.status.value === 'success' && !groups.length" class="empty-col p2">
        <span class="tx-meta">{{ q ? tr('No components found') : tr('No components in the design system') }}</span>
        <TextButton v-if="q" size="s" color="blue" @click="q = ''">{{ tr('Clear search') }}</TextButton>
        
      </div>
    </div>
  </div>

  <div v-else class="wrap">
    <div class="dhead">
      <button class="ib s24" :aria-label="tr('Back to assets')" :data-tip="tr('Back to assets')" @click="emit('update:open', null)"><EditorIcon name="chevron_right" :size="16" class="flip" /></button>
      <span class="tx-head ell" :title="detail.name">{{ detail.name }}</span>
    </div>
    <div class="dbody">
      <div class="pad">
        <span class="sq sq-clip big" data-preview><DsPreview :names="[detail.name, detail.code_name, ...(detail.match_aliases ?? [])]" :label="detail.name" /></span>
        <div v-if="detailExport" class="ins mt8">
          <Button size="s" type="primary" class="grow" @click="emit('insert', detailExport)">{{ tr('Insert instance') }}</Button>
        </div>
      </div>
      <section v-if="propRows.length" class="dsec">
        <div class="sec-h h24 p0"><span>{{ tr('Properties') }}</span></div>
        <div v-for="p in propRows" :key="p.k" class="prop-row"><span class="k">{{ p.k }}</span><span class="tx-body ell">{{ p.v }}</span></div>
      </section>
      <section class="dsec">
        <div class="sec-h h24 p0"><span>{{ tr('Used in this file') }}</span><span class="tx-meta">{{ uses.reduce((n, u) => n + u.count, 0) }}</span></div>
        <button v-for="u in uses" :key="u.id" class="sq menu-item" @click="emit('pick-screen', u.screen_id)">
          <EditorIcon :name="LAYER_ICON.instance!" :size="16" class="dia" />
          <span class="ell f1" :title="screenName(u.screen_id)">{{ screenName(u.screen_id) }}</span><span class="tx-meta num">{{ u.count }}</span>
        </button>
        <span v-if="!uses.length" class="tx-meta">{{ tr('Not used on this page yet') }}</span>
      </section>
      <section class="dsec">
        <div class="sec-h h24 p0"><span>{{ tr('Used elsewhere') }}</span><span class="tx-meta">{{ otherUses.reduce((n, u) => n + u.n, 0) }}</span></div>
        <NuxtLink v-for="u in otherUses" :key="u.screenId" :to="otherScreens.data.value?.[u.screenId]?.projectId ? `/p/${otherScreens.data.value[u.screenId]!.projectId}?screen=${u.screenId}` : ''" class="sq menu-item" :title="[otherScreens.data.value?.[u.screenId]?.name, otherScreens.data.value?.[u.screenId]?.project, otherScreens.data.value?.[u.screenId]?.page].filter(Boolean).join(' · ')">
          <EditorIcon :name="LAYER_ICON.instance!" :size="16" class="dia" />
          <span class="one f1"><span class="ell nm">{{ otherScreens.data.value?.[u.screenId]?.name ?? '…' }}</span><span class="tx-meta ell">{{ otherScreens.data.value?.[u.screenId]?.page }}</span></span>
          <span class="tx-meta num">{{ u.n }}</span>
        </NuxtLink>
        <span v-if="!otherUses.length" class="tx-meta">{{ tr('Not used elsewhere yet') }}</span>
      </section>
      <section class="dsec">
        <div class="sec-h h24 p0"><span>{{ tr('Code') }}</span></div>
        <button v-if="codeText" type="button" class="sq code" :title="tr('Copy')" @click="copyCode"><code>{{ codeText }}</code><EditorIcon :name="copied ? 'check' : 'copy'" :size="16" /></button>
        <span v-else class="tx-meta">{{ tr("This component isn't in the design system library.") }}</span>
        <div v-if="detail.match_aliases?.length" class="aliases">
          <span class="tx-meta">{{ tr('Matches Figma layers named') }}</span>
          <span class="chips"><span v-for="a in [detail.name, ...detail.match_aliases]" :key="a" class="sq chip">{{ a }}</span></span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 왼쪽 패널 글자 줄(File 탭 Pages · Layers)과 같은 안쪽 16, 검색칸만 8 */
.top { flex: none; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); }
.top .field { cursor: text; }
.top .field input { -webkit-appearance: none; appearance: none; padding: 0; }
.top .field input::-webkit-search-cancel-button { display: none; }
.qi { flex: none; color: var(--sys-color-neutral-500); }
.qx { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); margin-right: calc(-1 * var(--ref-spacing-02)); }
.qx:hover { --sq-overlay: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.qx:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -1px; }
/* 묶음 라벨: Docs 묶음 라벨과 같은 12 · 500 · neutral-500 */
.glabel { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-500); }
.list { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.grp-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.p2 { padding: 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-08) var(--ref-spacing-06); }
.tile { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.asset-thumb :deep(.pv) { position: absolute; left: 0; top: 0; width: 166.67%; height: 166.67%; transform: scale(.6); transform-origin: 0 0; }
.asset-thumb { overflow: hidden; height: 80px; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; margin-bottom: var(--ref-spacing-04); }
.tile { text-align: left; border-radius: var(--ref-radius-04); }
.tile:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.tile:active > .asset-thumb { --sq-overlay: var(--interaction-light-gray-pressed); }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
.tname { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--sys-color-neutral-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 상세 머리: 왼쪽 섹션 머리와 같은 32 높이, 위 4 · 뒤로 버튼은 패널 안쪽 8 */
.dhead { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); height: 32px; box-sizing: content-box; padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-04) var(--ref-spacing-06); min-width: 0; }
.dbody { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; }
.pad { padding: 0 var(--ref-spacing-10) var(--ref-spacing-10); }
.big :deep(.pv) { position: absolute; left: 0; top: 0; width: 133.33%; height: 133.33%; transform: scale(.75); transform-origin: 0 0; }
.big { overflow: hidden; height: 128px; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; }
.mt4 { margin-top: var(--ref-spacing-04); }
.mt8 { margin-top: var(--ref-spacing-08); }
.ins { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.ins .grow { width: 100%; }
.tile[draggable='true'] { cursor: grab; }
.m0 { margin: 0; }
.dsec { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; }
.p0 { padding: 0; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.f1 { flex: 1; }
/* 쓰인 화면 행: 28 · 글자를 섹션 글자 열(16)에 맞춰요 */
.dsec > .menu-item { height: 28px; margin: 0 calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06); gap: var(--ref-spacing-06); }
.dia { flex: none; color: var(--iris-component); }
/* 다른 곳 행도 레이어 행처럼 한 줄 28: 화면 이름 + 페이지(회색) — 프로젝트까지 전체는 툴팁 */
.one { display: flex; align-items: baseline; gap: var(--ref-spacing-04); min-width: 0; }
.one .nm { flex: 0 1 auto; }
.one .tx-meta { flex: 0 10 auto; }
/* 코드: 회색 칸 안 고정폭 글자 + 복사 */
.code { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-04); height: 32px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-600); }
.code:hover { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
.code code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--sys-color-neutral-800); }
/* 별칭: 피그마 레이어 이름이 이 중 하나면 이 컴포넌트로 셉니다 */
.aliases { display: flex; flex-direction: column; gap: var(--ref-spacing-03); margin-top: var(--ref-spacing-04); }
.chips { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-02); }
.chip { height: 22px; padding: 0 var(--ref-spacing-04); display: inline-flex; align-items: center; border-radius: var(--ref-radius-02); --sq-fill: var(--sys-color-neutral-100); font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-700); }
.lnk { align-self: flex-start; display: inline-flex; align-items: center; gap: var(--ref-spacing-02); font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-brand-primary-default); border-radius: var(--ref-radius-02); }
.lnk:hover { text-decoration: underline; text-underline-offset: 2px; }
.lnk:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 편집기 아이콘에 ‹ 가 없어서 › 를 뒤집어요 */
.flip { transform: scaleX(-1); }
.s24 { width: 28px; height: 28px; }
</style>
