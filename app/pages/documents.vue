<script setup lang="ts">
import { Button, SearchField, Skeleton } from '@ba-dream/design-system'
import type { DocCategory, DocListRow } from '~/composables/useIrisData'
import { DOC_CATEGORY_LABEL, DOC_SOURCE_TIP, docIcon } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 홈 '문서' 메뉴(4단계 시안 3 — 2026-11-28): 올려 둔 문서를 프로젝트별로 묶어 표로. 예전 홈 '정책(요청사항)' 메뉴 자리 —
 * 요청사항 보드는 프로젝트 첫 화면의 요청사항 탭으로 옮겼어요. 문서를 누르면 그 문서의 함께 보기, [Open project] 는 프로젝트 첫 화면
 */
const { data: projects } = useProjects()
const { data: access } = useMyProjectRoles()
const docs = useAllDocuments()
onMounted(() => { docs.refresh() })

const CATS: ('all' | DocCategory)[] = ['all', 'planning', 'dev', 'design', 'etc']
const cat = ref<'all' | DocCategory>('all')
const query = ref('')
const catLabel = (k: 'all' | DocCategory) => (k === 'all' ? 'All' : DOC_CATEGORY_LABEL[k])
const segLine = (i: number) => { const on = CATS.indexOf(cat.value); return i > 0 && i !== on && i - 1 !== on }

/** 내가 멤버인 프로젝트만(홈 프로젝트 목록과 같아요), 프로젝트 순서대로 묶기 — 문서가 없는 프로젝트는 빼요 */
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = (docs.data.value ?? []).filter((d) => (cat.value === 'all' || d.category === cat.value) && (!q || d.title.toLowerCase().includes(q) || (d.abbr ?? '').toLowerCase().includes(q)))
  const mine = (projects.value ?? []).filter((p) => !access.value || access.value.all || !!access.value.roles[p.id])
  return mine.map((p) => ({ p, docs: list.filter((d) => d.project_id === p.id) })).filter((g) => g.docs.length)
})
const total = computed(() => groups.value.reduce((n, g) => n + g.docs.length, 0))
function counts(d: DocListRow) {
  const r = d.check_result
  if (!r || r.format === 'none' || (!r.policies && !r.slots)) return '—'
  return [r.policies === 1 ? tr('1 request') : tr('{n} requests', { n: r.policies }), r.slots === 1 ? tr('1 slot') : tr('{n} slots', { n: r.slots })].join(' · ')
}
const warnCount = (d: DocListRow) => d.check_result?.warnings?.length ?? 0
</script>

<template>
  <AppShell>
    <div class="scroller">
      <div class="head">
        <h1 class="ttl">{{ tr('Documents') }}</h1>
        <span v-if="docs.status.value === 'success'" class="tx-meta">{{ tr('{n} in {p} projects', { n: total, p: groups.length }) }}</span>
        <span class="f1" />
        <div class="sq segc" role="radiogroup" :aria-label="tr('Filter by type')" :style="{ gridTemplateColumns: `repeat(${CATS.length}, minmax(0, 1fr))`, width: '420px' }">
          <button v-for="(k, i) in CATS" :key="k" type="button" role="radio" :aria-checked="cat === k" :class="['sq', 'segc-i', { on: cat === k }]" @click="cat = k">
            <span v-if="segLine(i)" class="segc-sep" aria-hidden="true" />{{ tr(catLabel(k)) }}
          </button>
        </div>
        <SearchField v-model:value="query" class="search" type="contained" size="s" :placeholder="tr('Search documents')" :input-props="{ 'aria-label': tr('Search documents') }" />
      </div>

      <div v-if="docs.status.value === 'pending' && !docs.data.value?.length" class="list">
        <Skeleton v-for="i in 4" :key="i" shape="text" />
      </div>
      <div v-else-if="docs.error.value" class="page-empty">
        <p class="tx-meta">{{ tr("Couldn't load documents") }}</p>
        <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="refresh" @click="docs.refresh()">{{ tr('Reload') }}</Button>
      </div>
      <div v-else-if="!groups.length" class="page-empty">
        <p class="tx-meta">{{ query || cat !== 'all' ? tr('No matching documents') : tr('No documents yet') }}</p>
      </div>
      <div v-else class="list">
        <section v-for="g in groups" :key="g.p.id" class="pgrp" :aria-label="g.p.name">
          <div class="gh">
            <h2 class="tx-head">{{ g.p.name }}</h2>
            <span class="tx-meta">{{ g.docs.length === 1 ? tr('1 document') : tr('{n} documents', { n: g.docs.length }) }}</span>
            <span class="f1" />
            <NuxtLink :to="`/p/${g.p.id}/overview`" class="lnk">{{ tr('Open project') }}</NuxtLink>
          </div>
          <div class="table-wrap"><table class="dtable">
            <thead>
              <tr>
                <th scope="col" class="tx-meta">{{ tr('Document') }}</th>
                <th scope="col" class="tx-meta c-type">{{ tr('Type') }}</th>
                <th scope="col" class="tx-meta c-src">{{ tr('Added as') }}</th>
                <th scope="col" class="tx-meta c-cnt">{{ tr('Requests · slots') }}</th>
                <th scope="col" class="tx-meta c-warn">{{ tr('Warnings') }}</th>
                <th scope="col" class="tx-meta c-when">{{ tr('Updated') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in g.docs" :key="d.id" tabindex="0" @click="navigateTo(`/p/${g.p.id}/docs/${d.id}`)" @keydown.enter.prevent="navigateTo(`/p/${g.p.id}/docs/${d.id}`)">
                <td>
                  <span class="dname">
                    <EditorIcon :name="docIcon(d)" :size="16" class="dic" />
                    <span class="ellipsis">{{ d.title }}</span>
                    <span v-if="d.abbr" class="sq dabbr">{{ d.abbr }}</span>
                  </span>
                </td>
                <td><span class="sq chip">{{ tr(DOC_CATEGORY_LABEL[d.category]) }}</span></td>
                <td class="tx-meta">{{ tr(DOC_SOURCE_TIP[d.source_type]) }}</td>
                <td class="tx-meta num">{{ counts(d) }}</td>
                <td><span v-if="warnCount(d)" class="sq dwarn num">⚠ {{ warnCount(d) }}</span></td>
                <td class="tx-meta">{{ relativeTime(d.updated_at) }}</td>
              </tr>
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* 홈 문서 목록: 프로젝트 목록과 같은 흰 면 · 안쪽 위 24 · 좌우 32 · 제목 20/600 */
.scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-19); font-size: 12px; line-height: 18px; }
.head { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 32px; flex-wrap: wrap; }
.ttl { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; }
.f1 { flex: 1; }
.search { width: 220px; }
.list { display: flex; flex-direction: column; gap: var(--ref-spacing-12); margin-top: var(--ref-spacing-10); }
.pgrp { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.gh { display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-02); }
.gh h2 { margin: 0; }
.lnk { font-size: 12px; font-weight: 500; color: var(--sys-color-brand-primary-default); text-decoration: none; border-radius: var(--ref-radius-02); }
.lnk:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 표: 요청사항 보드와 같은 줄 모양(머리 줄 옅은 선, 올리면 회색) */
.table-wrap { overflow-x: auto; }
.dtable { width: 100%; min-width: 880px; border-collapse: collapse; text-align: left; table-layout: fixed; }
.dtable th { padding: var(--ref-spacing-06); font-weight: 500; white-space: nowrap; box-shadow: inset 0 -1px 0 var(--iris-line); }
.dtable td { padding: var(--ref-spacing-07, 10px) var(--ref-spacing-06); vertical-align: middle; }
.dtable tbody tr { box-shadow: inset 0 -1px 0 var(--iris-line); cursor: pointer; }
.dtable td { transition: background-color .12s ease; }
.dtable tbody tr:hover td { background: var(--interaction-light-gray-hover); }
.dtable tbody tr:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 문서 이름 칸이 눌리지 않게: 나머지 칸 합 540, 표 최소 880(좁으면 가로로 밀려요) */
.c-type { width: 96px; }
.c-src { width: 120px; }
.c-cnt { width: 150px; }
.c-warn { width: 72px; }
.c-when { width: 102px; }
.dname { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; font-weight: 500; }
.dic { flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dabbr { flex: none; display: inline-flex; align-items: center; height: 18px; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 600; color: var(--sys-color-neutral-600); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.chip { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 500; color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-neutral-200); }
.dwarn { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; color: #B44A0E; --sq-fill: #FFF1E8; }
</style>
