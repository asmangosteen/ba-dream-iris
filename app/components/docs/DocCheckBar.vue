<script setup lang="ts">
import type { DocRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 문서 상세 위 양식 검사 막대(시안 2): 약어 칩 · 상태 · 읽은 수(정책 · 화면 칸 · 연결) · 경고(눌러서 그 자리로).
 * 정책 표 · 화면 표가 없는 문서는 '양식이 아니에요' 한 줄만.
 */
const props = defineProps<{ doc: DocRow; compact?: boolean }>()
const emit = defineEmits<{ go: [at: { block: string; row: number | null }] }>()

const STATUS_LABEL: Record<NonNullable<DocRow['status']>, string> = { draft: 'Draft', review: 'In review', confirmed: 'Confirmed' }
const r = computed(() => props.doc.check_result ?? null)
const warns = computed(() => r.value?.warnings ?? [])
const open = ref(false)
watch(() => props.doc.id, () => { open.value = false })
const text = (w: FormatWarning) => { const t = warningText(w); return tr(t.key, t.vars) }
/** 경고가 난 자리: '표 3행' 처럼 */
function where(w: FormatWarning) {
  const blocks = props.doc.content_blocks ?? []
  const i = blocks.findIndex((b) => b.id === w.block)
  const head = i >= 0 ? [...blocks.slice(0, i)].reverse().find((b) => b.type === 'h1' || b.type === 'h2')?.text : null
  return [head, w.row ? tr('row {n}', { n: w.row }) : null].filter(Boolean).join(' · ')
}
</script>

<template>
  <div v-if="r || doc.abbr || doc.status" :class="['check', { compact }]">
    <div class="line">
      <span v-if="doc.abbr" class="sq abbr" :title="tr('Document abbreviation')">{{ doc.abbr }}</span>
      <span v-if="doc.status" :class="['sq', 'st', doc.status]">{{ tr(STATUS_LABEL[doc.status]) }}</span>
      <span v-if="r && r.format !== 'none'" class="tx-meta num counts">{{ tr('{p} policies · {s} screen slots · {l} links read', { p: r.policies, s: r.slots, l: r.links }) }}</span>
      <span v-else-if="r" class="tx-meta">{{ tr('Not in the Iris planning format') }}</span>
    </div>
    <template v-if="warns.length">
      <button type="button" class="sq warnbar" :aria-expanded="open" @click="open = !open">
        <EditorIcon name="warning" :size="14" />
        <b>{{ warns.length === 1 ? tr('1 warning') : tr('{n} warnings', { n: warns.length }) }}</b>
        <span class="f1" />
        <EditorIcon name="chevron_down" :size="14" :class="{ flip: open }" />
      </button>
      <div v-if="open" class="list">
        <button v-for="(w, i) in warns" :key="i" type="button" class="sq wrow" @click="emit('go', { block: w.block, row: w.row })">
          <span class="dot" aria-hidden="true" />
          <span class="wcol"><span>{{ text(w) }}</span><span class="tx-meta">{{ where(w) }}</span></span>
          <span class="tx-meta go">{{ tr('Go') }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.check { display: flex; flex-direction: column; gap: var(--ref-spacing-04); margin-bottom: var(--ref-spacing-10); font-size: 12px; line-height: 18px; }
.line { display: flex; align-items: center; gap: var(--ref-spacing-04); flex-wrap: wrap; }
.abbr, .st { height: 20px; display: inline-flex; align-items: center; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 11px; font-weight: 600; }
.abbr { color: var(--sys-color-neutral-800); --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.st { color: var(--sys-color-neutral-700); --sq-fill: var(--sys-color-neutral-100); }
.st.review { color: #8A6100; --sq-fill: #FFF6DA; }
.st.confirmed { color: #14612C; --sq-fill: #DDF4E4; }
.counts { margin-left: var(--ref-spacing-02); }
.warnbar { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 32px; padding: 0 var(--ref-spacing-07); border-radius: var(--ref-radius-05); color: #B44A0E; --sq-fill: #FFF6EC; text-align: left; }
.warnbar:hover { --sq-fill: #FFEEDC; }
.warnbar b { font-weight: 600; }
.warnbar:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.f1 { flex: 1; }
.flip { transform: rotate(180deg); }
.list { display: flex; flex-direction: column; gap: 1px; padding: var(--ref-spacing-02); border-radius: var(--ref-radius-05); }
.wrow { display: flex; align-items: flex-start; gap: var(--ref-spacing-05); padding: var(--ref-spacing-04) var(--ref-spacing-05); border-radius: var(--ref-radius-04); text-align: left; color: var(--sys-color-neutral-800); }
.wrow:hover { --sq-fill: var(--sys-color-neutral-100); }
.wrow:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.dot { flex: none; width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: #E2601B; }
.wcol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.go { flex: none; }
.compact .warnbar { height: 28px; }
</style>
