<script setup lang="ts">
import type { AlignKind, ArrangeOp, Axis } from '~/canvas/geom'

/**
 * 정렬 6개 · 가로/세로 균등 분배 · 간격 맞추기 — 레이어 패널과 '화면 n개' 패널이 함께 씁니다.
 * count: 고른 개수(균등 분배는 3개부터, 간격은 2개부터), gap: 지금 간격이 모두 같으면 그 값, axis: 늘어선 방향
 */
const props = defineProps<{ count: number; gap: number | null; axis: Axis }>()
const emit = defineEmits<{ op: [op: ArrangeOp] }>()

const ALIGN: { k: AlignKind; label: string; key: string; d: string }[] = [
  { k: 'l', label: 'Align left', key: '⌥A', d: 'M2 1.5v11M4.5 4h7M4.5 9h4' },
  { k: 'c', label: 'Align horizontal centers', key: '⌥H', d: 'M7 1.5v11M3.5 4h7M4.5 9h5' },
  { k: 'r', label: 'Align right', key: '⌥D', d: 'M12 1.5v11M2.5 4h7M5.5 9h4' },
  { k: 't', label: 'Align top', key: '⌥W', d: 'M1.5 2h11M4 4.5v7M9 4.5v4' },
  { k: 'm', label: 'Align vertical centers', key: '⌥V', d: 'M1.5 7h11M4 3.5v7M9 4.5v5' },
  { k: 'b', label: 'Align bottom', key: '⌥S', d: 'M1.5 12h11M4 2.5v7M9 5.5v4' },
]
function setGap(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = props.gap === null ? '' : String(props.gap); return }
  emit('op', { kind: 'space', axis: props.axis, gap: Math.round(v) })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return }
  if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || props.gap === null) return
  e.preventDefault()
  emit('op', { kind: 'space', axis: props.axis, gap: props.gap + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) })
}
</script>

<template>
  <span class="sub">Alignment</span>
  <div class="grp">
    <button v-for="a in ALIGN" :key="a.k" class="ib" :aria-label="`${a.label} (${a.key})`" :title="`${a.label} ${a.key}`" @click="emit('op', { kind: 'align', k: a.k })">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path :d="a.d" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
    </button>
  </div>
  <div class="dist">
    <div class="grp">
      <button class="ib" :disabled="count < 3" aria-label="Distribute horizontal spacing (⌃⌥H)" title="Distribute horizontal spacing ⌃⌥H" @click="emit('op', { kind: 'distribute', axis: 'x' })">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 1.5v11M12.5 1.5v11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /><rect x="5" y="4" width="4" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
      </button>
      <button class="ib" :disabled="count < 3" aria-label="Distribute vertical spacing (⌃⌥V)" title="Distribute vertical spacing ⌃⌥V" @click="emit('op', { kind: 'distribute', axis: 'y' })">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 1.5h11M1.5 12.5h11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /><rect x="4" y="5" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
      </button>
    </div>
    <label class="sq fld" :title="axis === 'x' ? 'Horizontal spacing' : 'Vertical spacing'">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" :style="axis === 'y' ? { transform: 'rotate(90deg)' } : undefined"><path d="M1.5 2v10M12.5 2v10M4.5 7h5M6 5.5L4.5 7 6 8.5M8 5.5L9.5 7 8 8.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <input :key="String(gap) + axis + count" :value="gap ?? ''" :placeholder="count >= 2 && gap === null ? 'Mixed' : ''" :disabled="count < 2" inputmode="numeric" aria-label="Spacing" @change="setGap" @keydown="onKey">
    </label>
  </div>
</template>

<style scoped>
.dist { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ref-spacing-04); }
.fld svg { flex: none; color: var(--sys-color-neutral-600); }
.fld:has(input:disabled) { opacity: .45; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
