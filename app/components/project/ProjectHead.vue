<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import ProjectModal from '~/components/project/ProjectModal.vue'

/**
 * 홈 안 프로젝트 화면들의 머리 줄(개요 · 요청사항 · 문서에서 보기 — 사용자 결정 2026-11-28): 머리 줄은 '위치', 카드는 '내용'.
 * ← · 프로젝트 이름(하위 화면이면 / 화면 이름, 이름을 누르면 개요로) · ⋮ 프로젝트 설정 + 아래 메타(수정 시각 · 인원). 세 화면이 같은 높이 · 같은 모양
 */
const props = defineProps<{ projectId: string; section?: string | null; backLabel: string }>()
const emit = defineEmits<{ back: [] }>()

const { data: projects } = useProjects()
const project = computed(() => projects.value?.find((p) => p.id === props.projectId) ?? null)
const access = useProjectAccess(props.projectId)
const settingsOpen = ref(false)
</script>

<template>
  <header class="ph">
    <button type="button" class="sq back" :aria-label="backLabel" :data-tip="backLabel" @click="emit('back')"><EditorIcon name="chevron_right" :size="20" class="flip" /></button>
    <div class="ttl-col">
      <div class="ttl-row">
        <h1 class="ttl">
          <template v-if="section"><NuxtLink :to="`/project/${projectId}`" class="crumb">{{ project?.name ?? '' }}</NuxtLink><span class="crumb-sep" aria-hidden="true">/</span>{{ section }}</template>
          <template v-else>{{ project?.name ?? '' }}</template>
        </h1>
        <!-- 프로젝트 설정(홈 프로젝트 카드 ⋮ 와 같은 버튼 · 같은 창) -->
        <button v-if="project" type="button" class="sq more" :aria-label="tr('{name} settings', { name: project.name })" :data-tip="tr('{name} settings', { name: project.name })" @click="settingsOpen = true"><EditorIcon name="menu_kebab" :size="14" /></button>
      </div>
      <span class="tx-meta meta">
        <template v-if="project">{{ tr('Edited {when}', { when: relativeTime(project.updated_at) }) }}<template v-if="access.members.value.length"> · {{ access.members.value.length === 1 ? tr('1 person') : tr('{n} people', { n: access.members.value.length }) }}</template></template>
      </span>
    </div>
    <ProjectModal v-if="settingsOpen" v-model:open="settingsOpen" :project-id="projectId" />
  </header>
</template>

<style scoped>
.ph { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; }
/* 제목 왼쪽 ←: 32 정사각, 올리면 회색 */
.back { flex: none; width: 32px; height: 32px; display: grid; place-items: center; margin-left: calc(-1 * var(--ref-spacing-04)); border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-700); }
.back:hover { --sq-fill: var(--interaction-light-gray-hover); }
.back:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.flip { transform: rotate(180deg); }
.ttl-col { display: flex; flex-direction: column; gap: var(--ref-spacing-02); min-width: 0; }
.ttl-row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; }
.ttl { margin: 0; font-size: 20px; line-height: 28px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 하위 화면의 프로젝트 이름: 누르면 개요로(올리면 밑줄) */
.crumb { color: inherit; text-decoration: none; border-radius: var(--ref-radius-02); }
.crumb:hover { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--ref-color-gray-900-20); }
.crumb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 이름 · / 사이 6(사용자 요청 2026-11-28 — 4에서 조금 넓게) */
.crumb-sep { margin: 0 var(--ref-spacing-05); color: var(--sys-color-neutral-400); font-weight: 400; }
/* 메타 줄은 늘 한 줄 높이를 차지해요(데이터가 늦게 와도 아래 카드가 들썩이지 않게) */
.meta { min-height: 18px; }
/* ⋮: 홈 프로젝트 카드 ⋮ 처럼 흰 바탕 + 1px 테두리, 24 · 모서리 8 */
.more { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-04); color: var(--sys-color-neutral-600); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.more:hover { --sq-line: var(--ref-color-gray-900-20); color: var(--sys-color-neutral-800); }
.more:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
</style>
