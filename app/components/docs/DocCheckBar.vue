<script setup lang="ts">
import type { DocRow } from '~/composables/useIrisData'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 문서 상세 위 양식 경고 막대(시안 2): 경고가 있을 때만, 눌러서 펼치고 [이동]으로 그 자리로.
 * 약어 · 상태는 문서 머리 메타 줄(DocReader)에, 읽은 수 줄은 빼요(사용자 요청 2026-11-27)
 * 펼치면 막대와 목록이 옅은 주황 박스 하나에 들어가요. 줄을 누르면 문서의 그 자리가 같은 주황으로 잠깐 깜빡여요([Edit to fix] 는 뺌, 2026-11-27)
 */
const props = defineProps<{ doc: DocRow; compact?: boolean }>()
const emit = defineEmits<{ go: [at: { block: string; row: number | null }] }>()
const fix = (w: FormatWarning) => { const t = warningFix(w); return tr(t.key, t.vars) }

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
  <div v-if="warns.length" :class="['sq', 'check', { compact, open }]">
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
          <span class="wcol"><span>{{ text(w) }}</span><span class="tx-meta">{{ where(w) }}</span><span class="fix">{{ fix(w) }}</span></span>
          <span class="go" aria-hidden="true">→</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.check { display: flex; flex-direction: column; margin-bottom: var(--ref-spacing-10); border-radius: var(--ref-radius-05); font-size: 12px; line-height: 18px; --sq-fill: transparent; transition: --sq-fill .16s ease; }
/* 펼치면 막대 + 목록이 옅은 주황 박스 하나에 */
.check.open { --sq-fill: #FFF6EC; padding-bottom: var(--ref-spacing-04); }
.check.open .warnbar { --sq-fill: transparent; }
.check.open .warnbar:hover { --sq-fill: #FFEEDC; }
.warnbar { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 32px; padding: 0 var(--ref-spacing-07); border-radius: var(--ref-radius-05); color: #B44A0E; --sq-fill: #FFF6EC; text-align: left; }
.warnbar:hover { --sq-fill: #FFEEDC; }
.warnbar b { font-weight: 600; }
.warnbar:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.f1 { flex: 1; }
.flip { transform: rotate(180deg); }
.list { display: flex; flex-direction: column; gap: 1px; padding: var(--ref-spacing-02) var(--ref-spacing-04) 0; }
.wrow { display: flex; align-items: flex-start; gap: var(--ref-spacing-05); padding: var(--ref-spacing-04) var(--ref-spacing-05); border-radius: var(--ref-radius-04); text-align: left; color: var(--sys-color-neutral-800); }
.wrow:hover { --sq-fill: #FFEEDC; }
.wrow:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.dot { flex: none; width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: #E2601B; }
.wcol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.go { flex: none; color: #E8A87C; font-size: 14px; transition: transform .16s ease; }
.wrow:hover .go { transform: translateX(2px); }
.fix { margin-top: 2px; color: var(--sys-color-neutral-700); }
.compact .warnbar { height: 28px; }
</style>
