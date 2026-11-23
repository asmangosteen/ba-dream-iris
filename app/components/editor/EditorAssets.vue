<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import DsPreview from '~/components/ds/DsPreview.vue'

/** 왼쪽 패널 · 에셋: 디자인 시스템 컴포넌트 찾기 → 상세(속성 · 이 파일에서 쓰는 곳) */
const props = defineProps<{ screenIds: string[]; screenName: (id: string) => string; open?: string | null }>()
const emit = defineEmits<{ 'update:open': [id: string | null]; 'pick-screen': [id: string] }>()

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
const propRows = computed(() => Object.entries(detail.value?.props_schema ?? {}).map(([k, v]) => ({ k, v: Array.isArray(v) ? v.join(' · ') : v === 'boolean' ? '켜기 · 끄기' : '글자' })))
</script>

<template>
  <div v-if="!detail" class="wrap">
    <div class="top">
      <label class="sq fld search"><Icon name="search" :size="14" /><input v-model="q" placeholder="컴포넌트 찾기" aria-label="컴포넌트 찾기"></label>
    </div>
    <div class="list">
      <section v-for="g in groups" :key="g.label" class="grp-sec">
        <span class="nav-label p2">{{ g.label }}</span>
        <div class="grid">
          <button v-for="c in g.items" :key="c.id" class="tile" :aria-label="`${c.name} 자세히 보기`" @click="emit('update:open', c.id)">
            <span class="sq asset-thumb" data-preview><DsPreview :names="[c.name, c.code_name, ...(c.match_aliases ?? [])]" :label="c.name" /></span>
            <span class="tname">{{ c.name }}</span>
            <span class="tx-meta tuse">{{ useCount(c.id) ? `이 파일 ${useCount(c.id)}개` : '안 씀' }}</span>
          </button>
        </div>
      </section>
      <p v-if="components.status.value === 'success' && !groups.length" class="tx-meta p2">{{ q ? '찾는 컴포넌트가 없어요' : '디자인 시스템에 등록된 컴포넌트가 없어요' }}</p>
      <NuxtLink v-if="components.status.value === 'success' && !(components.data.value ?? []).length" to="/design-system" class="lnk p2">디자인 시스템에서 등록하기</NuxtLink>
    </div>
  </div>

  <div v-else class="wrap">
    <div class="dhead">
      <button class="ib" aria-label="에셋 목록으로" @click="emit('update:open', null)"><Icon name="chevron_left" :size="16" /></button>
      <span class="tx-head">{{ detail.name }}</span>
    </div>
    <div class="dbody">
      <div class="pad">
        <span class="sq big" data-preview><DsPreview :names="[detail.name, detail.code_name, ...(detail.match_aliases ?? [])]" :label="detail.name" /></span>
        <p v-if="detail.description" class="tx-meta m0 mt4">{{ detail.description }}</p>
      </div>
      <section v-if="propRows.length" class="dsec">
        <div class="sec-h h24 p0"><span>속성</span></div>
        <div v-for="p in propRows" :key="p.k" class="prop-row"><span class="k">{{ p.k }}</span><span class="tx-body ell">{{ p.v }}</span></div>
      </section>
      <section class="dsec">
        <div class="sec-h h24 p0"><span>이 파일에서 쓰는 곳</span><span class="tx-meta">{{ uses.reduce((n, u) => n + u.count, 0) }}</span></div>
        <button v-for="u in uses" :key="u.id" class="sq menu-item" @click="emit('pick-screen', u.screen_id)">
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" class="dia"><path d="M6 1l5 5-5 5-5-5z" fill="currentColor" /></svg>
          <span class="ell f1">{{ screenName(u.screen_id) }}</span><span class="tx-meta num">{{ u.count }}</span>
        </button>
        <span v-if="!uses.length" class="tx-meta">이 페이지에서는 아직 쓰지 않았어요</span>
      </section>
      <section class="dsec">
        <span class="tx-meta">캔버스에 넣기는 컴포넌트 인스턴스와 함께 열려요.</span>
        <NuxtLink to="/design-system" class="lnk">디자인 시스템에서 보기<Icon name="chevron_right" :size="12" /></NuxtLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.top { padding: var(--ref-spacing-02) var(--ref-spacing-08) var(--ref-spacing-06); }
.search { border-radius: var(--ref-radius-04); }
.list { flex: 1; min-height: 0; overflow: auto; padding: 0 var(--ref-spacing-08) var(--ref-spacing-12); display: flex; flex-direction: column; gap: var(--ref-spacing-10); }
.grp-sec { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.p2 { padding: 0 var(--ref-spacing-02); }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-08) var(--ref-spacing-06); }
.tile { display: flex; flex-direction: column; gap: var(--ref-spacing-02); min-width: 0; }
.asset-thumb :deep(.pv) { position: absolute; left: 0; top: 0; width: 166.67%; height: 166.67%; transform: scale(.6); transform-origin: 0 0; }
.asset-thumb { overflow: hidden; height: 80px; border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; margin-bottom: var(--ref-spacing-02); }
.glyph { font-size: 16px; line-height: 24px; font-weight: 600; color: var(--sys-color-neutral-400); }
.glyph.l { font-size: 14px; color: var(--sys-color-neutral-500); }
.tname { padding: 0 var(--ref-spacing-02); font-weight: 500; color: var(--sys-color-neutral-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tuse { padding: 0 var(--ref-spacing-02); }
.lnk { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-brand-primary-default); font-weight: 500; }
.dhead { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-06) var(--ref-spacing-04) var(--ref-spacing-04); }
.dbody { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.pad { padding: 0 var(--ref-spacing-08) var(--ref-spacing-08); }
.big :deep(.pv) { position: absolute; left: 0; top: 0; width: 133.33%; height: 133.33%; transform: scale(.75); transform-origin: 0 0; }
.big { overflow: hidden; height: 128px; border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; display: grid; place-items: center; }
.mt4 { margin-top: var(--ref-spacing-04); }
.m0 { margin: 0; }
.dsec { padding: var(--ref-spacing-07) var(--ref-spacing-08) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; }
.p0 { padding: 0; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.f1 { flex: 1; }
.dia { flex: none; color: var(--iris-component); }
</style>
