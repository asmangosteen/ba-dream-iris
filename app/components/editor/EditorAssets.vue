<script setup lang="ts">
import { Button, IconButton, SearchField, TextButton } from '@ba-dream/design-system'
import DsPreview from '~/components/ds/DsPreview.vue'
import { dsComponent } from '~/components/editor/InstanceView.vue'
import { DS_DRAG } from '~/composables/useDsInstances'

/** 왼쪽 패널 · 에셋: 디자인 시스템 컴포넌트 찾기 → 상세(속성 · 이 파일에서 쓰는 곳) */
const props = defineProps<{ screenIds: string[]; screenName: (id: string) => string; open?: string | null }>()
const emit = defineEmits<{ 'update:open': [id: string | null]; 'pick-screen': [id: string]; insert: [name: string] }>()

const { components } = useDesignSystem()
const usages = useUsages('assets', () => props.screenIds)
const q = ref('')

const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const list = (components.data.value ?? []).filter((c) => !s || [c.name, c.code_name, c.description, ...(c.match_aliases ?? [])].some((v) => v?.toLowerCase().includes(s)))
  const map = new Map<string, typeof list>()
  for (const c of list) map.set(c.category, [...(map.get(c.category) ?? []), c])
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})
const useCount = (id: string) => (usages.data.value ?? []).filter((u) => u.component_id === id).reduce((n, u) => n + u.count, 0)

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
}
const detailExport = computed(() => (detail.value ? exportName(detail.value) : null))
const propRows = computed(() => Object.entries(detail.value?.props_schema ?? {}).map(([k, v]) => ({ k, v: Array.isArray(v) ? v.join(' · ') : v === 'boolean' ? 'On · Off' : 'Text' })))
</script>

<template>
  <div v-if="!detail" class="wrap">
    <div class="top">
      <SearchField v-model:value="q" type="contained" size="s" placeholder="Search assets" :input-props="{ 'aria-label': 'Search assets' }" />
    </div>
    <div class="list">
      <section v-for="g in groups" :key="g.label" class="grp-sec">
        <span class="nav-label p2">{{ g.label }}</span>
        <div class="grid">
          <button v-for="c in g.items" :key="c.id" class="tile" :aria-label="`View ${c.name} details`" :title="exportName(c) ? 'Drag onto the canvas' : undefined" :draggable="exportName(c) ? 'true' : 'false'" @dragstart="(e) => { const n = exportName(c); if (n) onDrag(e, n); else e.preventDefault() }" @click="emit('update:open', c.id)">
            <span class="sq sq-clip asset-thumb" data-preview><DsPreview :names="[c.name, c.code_name, ...(c.match_aliases ?? [])]" :label="c.name" /></span>
            <span class="tname">{{ c.name }}</span>
            <span class="tx-meta tuse">{{ useCount(c.id) ? `${useCount(c.id)} in this file` : 'Unused' }}</span>
          </button>
        </div>
      </section>
      <div v-if="components.status.value === 'success' && !groups.length" class="empty-col p2">
        <span class="tx-meta">{{ q ? 'No components found' : 'No components in the design system' }}</span>
        <TextButton v-if="q" size="s" color="blue" @click="q = ''">Clear search</TextButton>
        <TextButton v-else size="s" color="blue" @click="navigateTo('/design-system')">Add in design system</TextButton>
      </div>
    </div>
  </div>

  <div v-else class="wrap">
    <div class="dhead">
      <IconButton size="s" type="ghost" icon-name="chevron_left" ariaLabel="Back to assets" @click="emit('update:open', null)" />
      <span class="tx-head ell">{{ detail.name }}</span>
    </div>
    <div class="dbody">
      <div class="pad">
        <span class="sq sq-clip big" data-preview><DsPreview :names="[detail.name, detail.code_name, ...(detail.match_aliases ?? [])]" :label="detail.name" /></span>
        <p v-if="detail.description" class="tx-meta m0 mt4">{{ detail.description }}</p>
        <div v-if="detailExport" class="ins mt8">
          <Button size="s" type="primary" class="grow" @click="emit('insert', detailExport)">Insert instance</Button>
          <span class="tx-meta">Drag onto the canvas or click Insert</span>
        </div>
      </div>
      <section v-if="propRows.length" class="dsec">
        <div class="sec-h h24 p0"><span>Properties</span></div>
        <div v-for="p in propRows" :key="p.k" class="prop-row"><span class="k">{{ p.k }}</span><span class="tx-body ell">{{ p.v }}</span></div>
      </section>
      <section class="dsec">
        <div class="sec-h h24 p0"><span>Used in this file</span><span class="tx-meta">{{ uses.reduce((n, u) => n + u.count, 0) }}</span></div>
        <button v-for="u in uses" :key="u.id" class="sq menu-item" @click="emit('pick-screen', u.screen_id)">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="dia"><path d="M6 1l5 5-5 5-5-5z" fill="currentColor" /></svg>
          <span class="ell f1">{{ screenName(u.screen_id) }}</span><span class="tx-meta num">{{ u.count }}</span>
        </button>
        <span v-if="!uses.length" class="tx-meta">Not used on this page yet</span>
      </section>
      <section class="dsec">
        <TextButton size="s" color="blue" contents="text-icon" icon-name="chevron_right" class="self-start" @click="navigateTo('/design-system')">View in design system</TextButton>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.top { padding: var(--ref-spacing-02) var(--ref-spacing-08) var(--ref-spacing-06); }
.list { flex: 1; min-height: 0; overflow: auto; padding: 0 var(--ref-spacing-08) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.grp-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.p2 { padding: 0 var(--ref-spacing-02); }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-08) var(--ref-spacing-06); }
.tile { display: flex; flex-direction: column; gap: var(--ref-spacing-02); min-width: 0; }
.asset-thumb :deep(.pv) { position: absolute; left: 0; top: 0; width: 166.67%; height: 166.67%; transform: scale(.6); transform-origin: 0 0; }
.asset-thumb { overflow: hidden; height: 80px; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; margin-bottom: var(--ref-spacing-02); }
.tile { text-align: left; border-radius: var(--ref-radius-04); }
.tile:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.tile:active > .asset-thumb { --sq-overlay: var(--interaction-light-gray-pressed); }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); }
.self-start { align-self: flex-start; }
.tname { padding: 0 var(--ref-spacing-02); font-weight: 500; color: var(--sys-color-neutral-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tuse { padding: 0 var(--ref-spacing-02); }
.dhead { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-08) var(--ref-spacing-04) var(--ref-spacing-04); min-width: 0; }
.dbody { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.pad { padding: 0 var(--ref-spacing-08) var(--ref-spacing-08); }
.big :deep(.pv) { position: absolute; left: 0; top: 0; width: 133.33%; height: 133.33%; transform: scale(.75); transform-origin: 0 0; }
.big { overflow: hidden; height: 128px; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; }
.mt4 { margin-top: var(--ref-spacing-04); }
.mt8 { margin-top: var(--ref-spacing-08); }
.ins { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.ins .grow { width: 100%; }
.tile[draggable='true'] { cursor: grab; }
.m0 { margin: 0; }
.dsec { padding: var(--ref-spacing-07) var(--ref-spacing-08) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; }
.p0 { padding: 0; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.f1 { flex: 1; }
.dia { flex: none; color: var(--iris-component); }
</style>
