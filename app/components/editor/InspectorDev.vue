<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'

/** 오른쪽 패널 · 개발 탭: 고른 화면이 쓰는 디자인 시스템 컴포넌트 · 치수 · 코드 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ 'open-asset': [componentId: string]; toast: [text: string] }>()

const usages = useUsages('inspector', () => [props.screen.id])
const { components } = useDesignSystem()
const byId = computed(() => new Map((components.data.value ?? []).map((c) => [c.id, c])))

const matched = computed(() =>
  (usages.data.value ?? [])
    .filter((u) => u.component_id && byId.value.has(u.component_id))
    .map((u) => ({ ...u, comp: byId.value.get(u.component_id!)! }))
    .sort((a, b) => b.count - a.count),
)
const unmatched = computed(() => (usages.data.value ?? []).filter((u) => !u.component_id || !byId.value.has(u.component_id)))
const total = computed(() => (usages.data.value ?? []).reduce((n, u) => n + u.count, 0))

const code = computed(() => {
  const names = matched.value.map((m) => m.comp.code_name ?? m.comp.name)
  const lines = [`<!-- ${props.screen.name} · ${Math.round(props.screen.width)}×${Math.round(props.screen.height)} -->`, `<script setup lang="ts">`, `import { ${names.join(', ') || '…'} } from '@ba-dream/design-system'`, `<` + `/script>`]
  return lines.join('\n')
})
async function copy() {
  try { await navigator.clipboard.writeText(code.value); emit('toast', '코드를 복사했어요') }
  catch { emit('toast', '복사하지 못했어요') }
}
</script>

<template>
  <div>
    <div class="pn-sec pb6">
      <div class="pn-h"><span>사용 컴포넌트</span><span class="meta5">{{ total ? `${matched.length}종 · ${total}개` : '' }}</span></div>
      <button v-for="m in matched" :key="m.id" class="sq hov comp" @click="emit('open-asset', m.comp.id)">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="dia"><path d="M6 1l5 5-5 5-5-5z" fill="currentColor" /></svg>
        <span class="col"><span class="cname">{{ m.comp.name }}</span><span class="tx-code">{{ m.comp.code_name ?? m.comp.name }}</span></span>
        <span class="cnt num">×{{ m.count }}</span>
      </button>
      <div v-if="unmatched.length" class="info">
        <Icon name="info" :size="12" class="mt3" />
        <span>디자인 시스템에 없는 이름 {{ unmatched.length }}개: {{ unmatched.map((u) => u.detected_name).join(', ') }}</span>
      </div>
      <p v-if="usages.status.value === 'success' && !usages.data.value?.length" class="tx-meta empty">
        {{ screen.source === 'figma' ? '피그마에서 다시 불러오면 컴포넌트를 세어요' : '아직 쓴 컴포넌트가 없어요' }}
      </p>
    </div>

    <div class="pn-sec pb8">
      <div class="pn-h"><span>치수</span></div>
      <div class="grid2">
        <span class="sq fld"><span>X</span><span class="v num">{{ Math.round(screen.x) }}</span></span>
        <span class="sq fld"><span>Y</span><span class="v num">{{ Math.round(screen.y) }}</span></span>
        <span class="sq fld"><span>W</span><span class="v num">{{ Math.round(screen.width) }}</span></span>
        <span class="sq fld"><span>H</span><span class="v num">{{ Math.round(screen.height) }}</span></span>
      </div>
    </div>

    <div class="pn-sec codebox">
      <div class="row"><span class="tx-head">코드</span><button class="ib s24" aria-label="코드 복사" @click="copy"><Icon name="copy" :size="14" /></button></div>
      <pre class="sq tx-code pre">{{ code }}</pre>
      <a v-if="screen.figma_url" :href="screen.figma_url" target="_blank" rel="noopener" class="lnk">피그마에서 열기<Icon name="arrow_up_right" :size="12" /></a>
    </div>
  </div>
</template>

<style scoped>
.pb6 { padding-bottom: var(--ref-spacing-06); }
.pb8 { padding-bottom: var(--ref-spacing-08); }
.meta5 { font-weight: 500; color: var(--sys-color-neutral-600); }
.comp { display: flex; align-items: center; gap: var(--ref-spacing-06); width: calc(100% - 8px); margin: 0 var(--ref-spacing-02); padding: var(--ref-spacing-04) var(--ref-spacing-08); border-radius: var(--ref-radius-04); box-sizing: border-box; }
.dia { flex: none; color: var(--iris-component); }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cname { font-weight: 500; color: var(--iris-component); }
.cnt { font-weight: 600; color: var(--sys-color-neutral-700); }
.info { display: flex; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-10); color: var(--sys-color-neutral-700); }
.mt3 { margin-top: 3px; flex: none; }
.empty { margin: 0; padding: 0 var(--ref-spacing-10); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-10); }
.v { color: var(--sys-color-neutral-800) !important; }
.codebox { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.row { display: flex; align-items: center; justify-content: space-between; }
.s24 { width: 24px; height: 24px; }
.pre { margin: 0; padding: var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); white-space: pre-wrap; overflow-wrap: anywhere; }
.lnk { display: inline-flex; align-items: center; gap: var(--ref-spacing-02); color: var(--sys-color-brand-primary-default); font-weight: 500; }
</style>
