<script setup lang="ts">
import { Button, EmptyState, Icon, Skeleton } from '@ba-dream/design-system'
import ProjectModal from '~/components/project/ProjectModal.vue'
import ScreenThumb from '~/components/editor/ScreenThumb.vue'

const { data: projects, status, error, refresh } = useProjects()
const { data: progress } = useProjectProgress()
const filter = ref<'active' | 'done' | 'all'>('active')
const filters = [
  { key: 'active', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
] as const
const list = computed(() => (projects.value ?? []).filter((p) => filter.value === 'all' || (filter.value === 'done' ? p.status === 'done' : p.status !== 'done')))
const count = (k: string) => (projects.value ?? []).filter((p) => k === 'all' || (k === 'done' ? p.status === 'done' : p.status !== 'done')).length

const newOpen = ref(false)
const settingsId = ref<string | null>(null)
const settingsOpen = computed({ get: () => !!settingsId.value, set: (v) => { if (!v) settingsId.value = null } })
const { data: covers, status: coverStatus } = useProjectCovers()
function createProject() { newOpen.value = true }
</script>

<template>
  <AppShell>
    <div class="scroller">
      <div class="inner">
        <div class="head">
          <h1 class="ttl">{{ tr('Projects') }}</h1>
          <Button size="s" type="primary" contents="icon-text" icon-name="plus" @click="createProject">{{ tr('New project') }}</Button>
        </div>
        <div class="seg filters" role="tablist" :aria-label="tr('Filter projects')">
          <button v-for="f in filters" :key="f.key" role="tab" :aria-selected="filter === f.key" :class="['sq', 'seg-item', { on: filter === f.key }]" @click="filter = f.key">
            {{ tr(f.label) }} <span class="n num">{{ count(f.key) }}</span>
          </button>
        </div>

        <div v-if="status === 'pending'" class="grid">
          <div v-for="i in 3" :key="i" class="card"><Skeleton shape="rectangle" height="176px" /><Skeleton shape="text" width="60%" /></div>
        </div>
        <EmptyState
          v-else-if="error"
          on="section"
          :title="tr('Could not load projects')"
          :description="tr('Try again in a moment.')"
          show-button
          :button-label="tr('Reload')"
          @button-click="refresh()"
        />
        <EmptyState
          v-else-if="!list.length"
          on="section"
          :title="tr('No projects yet')"
          show-button
          :button-label="tr('New project')"
          @button-click="createProject"
        />
        <div v-else class="grid">
          <NuxtLink v-for="p in list" :key="p.id" :to="`/p/${p.id}`" class="card proj">
            <span class="sq sq-clip thumb" aria-hidden="true"><span v-if="covers?.[p.id]" class="sq cover"><span class="sqc sq-clip-inner"><ScreenThumb :screen="covers[p.id]!" /></span></span><span v-else-if="coverStatus === 'success'" class="no-cover"><span class="sq ghost" /><span class="tx-meta">{{ tr('No frames yet') }}</span></span></span>
            <button class="ib more" :aria-label="tr('{name} settings', { name: p.name })" @click.prevent.stop="settingsId = p.id"><Icon name="menu_kebab" :size="16" /></button>
            <span class="col">
              <span class="tx-body name">{{ p.name }}</span>
              <span class="tx-meta">{{ statusLabel(p.status) }}<template v-if="progress?.[p.id]?.total"> · {{ tr('Applied') }} <span class="num">{{ progress[p.id]!.done }}/{{ progress[p.id]!.total }}</span></template> · {{ relativeTime(p.updated_at) }}</span>
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>
    <ProjectModal v-model:open="newOpen" @created="(id: string) => navigateTo(`/p/${id}`)" />
    <ProjectModal v-model:open="settingsOpen" :project-id="settingsId" />
  </AppShell>
</template>

<style scoped>
/* 프로젝트 목록: 사이드바 오른쪽 흰 면 — 안쪽 위 24 · 좌우 32, 제목 줄 32, 카드 3열(좁으면 2 · 1열) */
.scroller { flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-19); }
.inner { max-width: 1120px; margin: 0 auto; }
.head { display: flex; align-items: center; justify-content: space-between; min-height: 32px; }
.ttl { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; }
.filters { margin: var(--ref-spacing-08) 0 var(--ref-spacing-10) calc(-1 * var(--ref-spacing-06)); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--ref-spacing-12) var(--ref-spacing-08); }
.card { position: relative; display: flex; flex-direction: column; gap: var(--ref-spacing-08); min-width: 0; }
.thumb { height: 176px; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; }
/* 화면 표지: 바깥 1px 선(.cover) 안에 squircle 로 자른 그림. 아래 두 모서리는 썸네일(.sq-clip) 밖으로 내려 감춤 */
.cover { position: absolute; inset: 11px calc(24% - 1px) -14px; border-radius: 7px; --sq-line: var(--iris-line); --sq-line-w: 1px; }
.sq-clip-inner { position: absolute; inset: 1px; overflow: hidden; border-radius: 6px; }
.no-cover { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ref-spacing-06); }
.ghost { width: 44px; height: 72px; border-radius: 6px; --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; --sq-fill: var(--sys-color-common-white-default); }
.proj:focus-visible { outline: 0; }
.proj:focus-visible .thumb { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
.proj:hover .name { color: var(--sys-color-neutral-900, var(--sys-color-neutral-800)); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--ref-color-gray-900-20); }
.thumb { transition: box-shadow .12s ease; }
.more { position: absolute; top: var(--ref-spacing-04); right: var(--ref-spacing-04); opacity: 0; --sq-fill: var(--sys-color-common-white-emphasis); }
.proj:hover .more, .more:focus-visible { opacity: 1; }
.proj:hover .thumb { --sq-line: var(--ref-color-gray-900-20); }
.col { display: flex; flex-direction: column; }
.name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
