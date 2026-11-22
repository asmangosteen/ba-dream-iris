<script setup lang="ts">
import { Button, EmptyState, Skeleton } from '@ba-dream/design-system'

const { data: projects, status, error, refresh } = useProjects()
const filter = ref<'active' | 'done' | 'all'>('active')
const filters = [
  { key: 'active', label: '진행 중' },
  { key: 'done', label: '완료' },
  { key: 'all', label: '전체' },
] as const
const list = computed(() => (projects.value ?? []).filter((p) => filter.value === 'all' || (filter.value === 'done' ? p.status === 'done' : p.status !== 'done')))
const count = (k: string) => (projects.value ?? []).filter((p) => k === 'all' || (k === 'done' ? p.status === 'done' : p.status !== 'done')).length

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const creating = ref(false)
const preview = usePreviewMode()
async function createProject() {
  if (preview) return navigateTo('/p/preview-1')
  if (creating.value || !user.value) return
  creating.value = true
  const { data: ws } = await supabase.from('workspaces').select('id').limit(1).single()
  const { data, error: e } = await supabase
    .from('projects')
    .insert({ name: '새 프로젝트', workspace_id: ws?.id, created_by: user.value.sub as string })
    .select('id')
    .single()
  if (!e && data) {
    await supabase.from('pages').insert({ project_id: data.id, name: '페이지 1', sort_order: 0 })
    await navigateTo(`/p/${data.id}`)
  }
  creating.value = false
}
</script>

<template>
  <div class="shell">
    <AppTopBar />
    <main class="sq float body">
      <div class="inner">
        <div class="head">
          <h1 class="tx-title">프로젝트</h1>
          <Button size="s" type="primary" contents="icon-text" icon-name="plus" :loading="creating" @click="createProject">새 프로젝트</Button>
        </div>
        <div class="seg filters" role="tablist" aria-label="프로젝트 거르기">
          <button v-for="f in filters" :key="f.key" role="tab" :aria-selected="filter === f.key" :class="['sq', 'seg-item', { on: filter === f.key }]" @click="filter = f.key">
            {{ f.label }} <span class="n num">{{ count(f.key) }}</span>
          </button>
        </div>

        <div v-if="status === 'pending'" class="grid">
          <div v-for="i in 3" :key="i" class="card"><Skeleton shape="rectangle" height="176px" /><Skeleton shape="text" width="60%" /></div>
        </div>
        <EmptyState
          v-else-if="error"
          on="section"
          title="프로젝트를 불러오지 못했어요"
          description="잠시 뒤 다시 시도해주세요."
          show-button
          button-label="다시 불러오기"
          @button-click="refresh()"
        />
        <EmptyState
          v-else-if="!list.length"
          on="section"
          title="아직 프로젝트가 없어요"
          show-button
          button-label="새 프로젝트"
          @button-click="createProject"
        />
        <div v-else class="grid">
          <NuxtLink v-for="p in list" :key="p.id" :to="`/p/${p.id}`" class="card proj">
            <span class="sq thumb" aria-hidden="true" />
            <span class="col">
              <span class="tx-body name">{{ p.name }}</span>
              <span class="tx-meta">{{ STATUS_LABEL[p.status] }} · {{ relativeTime(p.updated_at) }}</span>
            </span>
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell { height: 100vh; position: relative; overflow: hidden; box-sizing: border-box; padding: 56px var(--iris-gap) var(--iris-gap); display: flex; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.body { flex: 1; min-width: 0; overflow: auto; padding: var(--ref-spacing-12) var(--ref-spacing-14) var(--ref-spacing-19); }
.inner { max-width: 1120px; margin: 0 auto; }
.head { display: flex; align-items: center; justify-content: space-between; }
.filters { margin: var(--ref-spacing-08) 0 var(--ref-spacing-10) calc(-1 * var(--ref-spacing-06)); }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ref-spacing-12) var(--ref-spacing-08); }
.card { display: flex; flex-direction: column; gap: var(--ref-spacing-08); min-width: 0; }
.thumb { height: 176px; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line); --sq-line-w: 1px; }
.proj:hover .thumb { --sq-line: var(--ref-color-gray-900-20); }
.col { display: flex; flex-direction: column; }
.name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
