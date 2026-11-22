<script setup lang="ts">
import { Button, EmptyState, Icon, Skeleton } from '@ba-dream/design-system'
import type { Tool } from '~/components/editor/EditorToolbar.vue'

const route = useRoute()
const projectId = route.params.projectId as string
const { project, pages, pageId, screens } = useEditor(projectId)

const left = ref<'file' | 'assets' | 'docs'>('file')
const tab = ref<'design' | 'plan' | 'dev'>('plan')
const tool = ref<Tool>('move')
const selected = ref<string | null>(null)
const current = computed(() => screens.data.value?.find((s) => s.id === selected.value) ?? null)

// 캔버스 좌표 → 화면 좌표 (D2 에서 viewport.ts 로 옮김): 지금은 50% 고정
const zoom = 0.5
const frameStyle = (s: { x: number; y: number; width: number; height: number }) => ({
  left: 352 + s.x * zoom + 'px',
  top: 94 + s.y * zoom + 'px',
  width: s.width * zoom + 'px',
  height: s.height * zoom + 'px',
})
</script>

<template>
  <div class="editor">
    <main aria-label="캔버스" class="canvas" @click.self="selected = null">
      <template v-for="s in screens.data.value ?? []" :key="s.id">
        <span class="frame-label" :class="{ on: selected === s.id }" :style="{ left: frameStyle(s).left, top: `calc(${frameStyle(s).top} - 20px)` }">{{ s.name }}</span>
        <button class="frame" :class="{ on: selected === s.id }" :style="frameStyle(s)" :aria-label="`${s.name} 화면 선택`" @click="selected = s.id" />
      </template>
    </main>

    <!-- 왼쪽 위: 파일 알약 -->
    <div class="sq float s pill-left">
      <NuxtLink to="/" class="sq hov home" aria-label="Iris 홈으로"><img src="/bd-symbol.svg" alt="" height="12" onerror="this.remove()"><Icon name="chevron_down" :size="12" /></NuxtLink>
      <span class="tx-head ellipsis">{{ project.data.value?.name ?? '' }}</span>
      <button class="ib" aria-label="검색" style="margin-left: auto"><Icon name="search" :size="16" /></button>
    </div>

    <!-- 왼쪽 패널 -->
    <aside aria-label="왼쪽 패널" class="sq float panel-left">
      <div role="tablist" class="seg tabs">
        <button v-for="t in [['file', '파일'], ['assets', '에셋'], ['docs', '문서']] as const" :key="t[0]" role="tab" :aria-selected="left === t[0]" :class="['sq', 'seg-item', { on: left === t[0] }]" @click="left = t[0]">{{ t[1] }}</button>
      </div>
      <template v-if="left === 'file'">
        <section class="sec pages">
          <div class="sec-h"><span>페이지</span><button class="ib" aria-label="페이지 추가"><Icon name="plus" :size="14" /></button></div>
          <Skeleton v-if="pages.status.value === 'pending'" shape="text" />
          <button v-for="p in pages.data.value ?? []" :key="p.id" :class="['sq', 'nav-item', 's', { on: pageId === p.id }]" @click="pageId = p.id">{{ p.name }}</button>
        </section>
        <section class="sec layers">
          <div class="sec-h"><span>레이어</span></div>
          <button v-for="s in screens.data.value ?? []" :key="s.id" :class="['sq', 'nav-item', 's', { on: selected === s.id }]" @click="selected = s.id">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 1v10M8.5 1v10M1 3.5h10M1 8.5h10" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
            {{ s.name }}
          </button>
          <p v-if="screens.status.value === 'success' && !screens.data.value?.length" class="tx-meta empty">화면이 아직 없어요</p>
        </section>
      </template>
      <EmptyState v-else on="section" :title="left === 'assets' ? '에셋은 D3에 열려요' : '문서는 D4에 열려요'" :show-icon="false" />
    </aside>

    <!-- 오른쪽 위 알약 -->
    <div class="sq float s pill-right">
      <span class="avatar">{{ (useSupabaseUser().value?.email ?? '?').slice(0, 1).toUpperCase() }}</span>
      <button class="ib" aria-label="미리보기" style="margin-left: auto"><Icon name="play" :size="12" /></button>
      <Button size="s" type="primary">공유</Button>
    </div>

    <!-- 오른쪽 패널 -->
    <aside aria-label="오른쪽 패널" class="sq float panel-right">
      <div role="tablist" class="seg tabs">
        <button v-for="t in [['design', '디자인'], ['plan', '기획'], ['dev', '개발']] as const" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="['sq', 'seg-item', { on: tab === t[0] }]" @click="tab = t[0]">{{ t[1] }}</button>
        <span class="num zoom">50%</span>
      </div>
      <div v-if="current" class="obj">
        <span class="tx-head">{{ current.name }}</span>
        <span class="tx-meta">{{ current.source === 'figma' ? '피그마' : 'Iris 캔버스' }}</span>
      </div>
      <EmptyState v-else on="section" title="화면을 골라주세요" :show-icon="false" />
    </aside>

    <EditorToolbar v-model="tool" />
  </div>
</template>

<style scoped>
.editor { height: 100vh; position: relative; overflow: hidden; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.canvas { position: absolute; inset: 0; }
.frame { position: absolute; background: var(--sys-color-common-white-default); outline: 1px solid var(--iris-line-strong); }
.frame.on { outline: 1.5px solid var(--sys-color-brand-primary-default); }
.frame-label { position: absolute; font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.frame-label.on { color: var(--sys-color-brand-primary-default); font-weight: 500; }
.pill-left { position: absolute; left: var(--iris-gap); top: var(--iris-gap); width: 264px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); z-index: 3; }
.home { display: flex; align-items: center; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-03); flex: none; color: var(--sys-color-neutral-500); }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-left { position: absolute; left: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 264px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; }
.pill-right { position: absolute; right: var(--iris-gap); top: var(--iris-gap); width: 288px; height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); z-index: 3; }
.panel-right { position: absolute; right: var(--iris-gap); top: 56px; bottom: var(--iris-gap); width: 288px; display: flex; flex-direction: column; z-index: 3; overflow: hidden; }
.tabs { padding: var(--ref-spacing-06); }
.zoom { margin-left: auto; padding-right: var(--ref-spacing-04); color: var(--sys-color-neutral-700); }
.sec { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-08); }
.layers { flex: 1; min-height: 0; overflow: auto; }
.sec-h { padding: 0 var(--ref-spacing-02) 0 var(--ref-spacing-08); }
.empty { padding: 0 var(--ref-spacing-08); margin: 0; }
.obj { display: flex; flex-direction: column; padding: var(--ref-spacing-02) var(--ref-spacing-10) var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); display: grid; place-items: center; font-size: 10px; font-weight: 600; }
</style>
