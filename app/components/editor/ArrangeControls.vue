<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { AlignKind, ArrangeOp, Axis } from '~/canvas/geom'

/**
 * 정렬 6개 · 가로/세로 균등 분배 · 간격 맞추기 — 레이어 패널과 '화면 n개' 패널이 함께 씁니다.
 * count: 고른 개수(균등 분배는 3개부터, 간격은 2개부터), gap: 지금 간격이 모두 같으면 그 값, axis: 늘어선 방향
 */
const props = defineProps<{ count: number; gap: number | null; axis: Axis }>()
const emit = defineEmits<{ op: [op: ArrangeOp] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const btn = ref<HTMLButtonElement | null>(null)
function onDoc(e: PointerEvent) { if (open.value && !root.value?.contains(e.target as Node)) open.value = false }
/** 더보기 메뉴: Esc 로 닫고 버튼으로 포커스를 돌려요 */
function onMenuKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  e.stopPropagation()
  open.value = false
  btn.value?.focus()
}
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))

const ALIGN: { k: AlignKind; label: string; key: string; d: string }[] = [
  { k: 'l', label: 'Align left', key: '⌥A', d: 'M2.5 2v12M5.5 5h8M5.5 11h4.5' },
  { k: 'c', label: 'Align horizontal centers', key: '⌥H', d: 'M8 2v12M4 5h8M5.5 11h5' },
  { k: 'r', label: 'Align right', key: '⌥D', d: 'M13.5 2v12M2.5 5h8M6 11h4.5' },
  { k: 't', label: 'Align top', key: '⌥W', d: 'M2 2.5h12M5 5.5v8M11 5.5v4.5' },
  { k: 'm', label: 'Align vertical centers', key: '⌥V', d: 'M2 8h12M5 4v8M11 5.5v5' },
  { k: 'b', label: 'Align bottom', key: '⌥S', d: 'M2 13.5h12M5 2.5v8M11 6v4.5' },
]
function setGap(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = props.gap === null ? '' : String(props.gap); return }
  emit('op', { kind: 'space', axis: props.axis, gap: Math.round(v) })
}
function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement
  if (e.key === 'Enter') { t.blur(); return }
  // Esc: 고치던 값을 버리고 칸에서 나가요
  if (e.key === 'Escape') { e.stopPropagation(); t.value = t.dataset.orig ?? t.value; t.blur(); return }
  if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || props.gap === null) return
  e.preventDefault()
  emit('op', { kind: 'space', axis: props.axis, gap: props.gap + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) })
}
</script>

<template>
  <!-- 피그마 UI3: [가로 정렬 3 | 세로 정렬 3 | ☰ 더보기(균등 분배)] · 여러 개 고르면 아래에 간격 칸 -->
  <div class="ig-l"><span>Alignment</span></div>
  <div ref="root" class="ig">
    <div class="grp" role="group" aria-label="Horizontal alignment">
      <button v-for="a in ALIGN.slice(0, 3)" :key="a.k" class="ib" :aria-label="`${a.label} (${a.key})`" :title="`${a.label} ${a.key}`" @click="emit('op', { kind: 'align', k: a.k })">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="a.d" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg>
      </button>
    </div>
    <div class="grp" role="group" aria-label="Vertical alignment">
      <button v-for="a in ALIGN.slice(3)" :key="a.k" class="ib" :aria-label="`${a.label} (${a.key})`" :title="`${a.label} ${a.key}`" @click="emit('op', { kind: 'align', k: a.k })">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="a.d" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg>
      </button>
    </div>
    <div class="more" @keydown="onMenuKey">
      <button ref="btn" :class="['ib', 's24', { on: open }]" aria-label="More alignment options" title="More alignment options" aria-haspopup="menu" :aria-expanded="open" @click="open = !open">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M5 8h6M3 12h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /></svg>
      </button>
      <div v-if="open" class="sq menu more-m" role="menu">
        <button class="sq menu-item" role="menuitem" :disabled="count < 3" @click="open = false; emit('op', { kind: 'distribute', axis: 'y' })">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11M2.5 13.5h11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><rect x="5" y="6" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /></svg>
          <span class="grow">Distribute vertical spacing</span><span class="key">⌃⌥V</span>
        </button>
        <button class="sq menu-item" role="menuitem" :disabled="count < 3" @click="open = false; emit('op', { kind: 'distribute', axis: 'x' })">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5v11M13.5 2.5v11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><rect x="6" y="5" width="4" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /></svg>
          <span class="grow">Distribute horizontal spacing</span><span class="key">⌃⌥H</span>
        </button>
        <button class="sq menu-item" role="menuitem" :disabled="count < 2" @click="open = false; emit('op', { kind: 'tidy' })">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.25" fill="none" /></svg>
          <span class="grow">Tidy up</span><span class="key">⌃⌥T</span>
        </button>
      </div>
    </div>
  </div>
  <template v-if="count >= 2">
    <div class="ig-l"><span>Spacing</span></div>
    <div class="ig">
      <label class="sq fld" :title="axis === 'x' ? 'Horizontal spacing' : 'Vertical spacing'">
        <EditorIcon name="var_spacing" :size="16" :style="axis === 'y' ? { transform: 'rotate(90deg)' } : undefined" />
        <input :key="String(gap) + axis + count" :value="gap ?? ''" :placeholder="gap === null ? 'Mixed' : ''" inputmode="numeric" aria-label="Spacing" @focus="($event.target as HTMLInputElement).dataset.orig = ($event.target as HTMLInputElement).value" @change="setGap" @keydown="onKey">
      </label>
      <span /><span />
    </div>
  </template>
</template>

<style scoped>
.grp > .ib { height: 24px; }
.more { position: relative; }
/* 메뉴가 열린 동안 버튼은 눌린 상태(회색) */
.more > .ib.on { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
.more-m { left: auto; right: 0; width: max-content; }
.more-m .menu-item { gap: var(--ref-spacing-04); }
.more-m svg { flex: none; }
.grow { flex: 1; }
.key { color: var(--sys-color-neutral-500); font-size: 11px; padding-left: var(--ref-spacing-10); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
</style>
