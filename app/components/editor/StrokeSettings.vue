<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import type { LayerStyle } from '~/canvas/schema'

/**
 * Stroke settings(피그마와 같아요): 오른쪽 패널 왼쪽에 뜨는 선 세부 설정.
 * Style(실선 · 점선) → 점선이면 Dash · Gap · Dash cap, 열린 선이면 Cap, 그리고 Join.
 * 값은 고른 것 중 첫 번째 기준으로 보여 주고, 서로 다르면 Mixed. 바꾸면 고른 것 모두에(set)
 */
const props = defineProps<{ anchor: HTMLElement | null; styles: LayerStyle[]; openPath: boolean; defaultJoin: 'miter' | 'round'; defaultCap: 'butt' | 'round' }>()
const emit = defineEmits<{ set: [patch: Partial<LayerStyle>]; close: [] }>()

const el = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  const panel = a.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const h = el.value?.offsetHeight ?? 240
  pos.value = { left: Math.max(8, panel.left - 240 - 8) + 'px', top: Math.max(8, Math.min(window.innerHeight - h - 8, r.top - 48)) + 'px' }
}
onMounted(() => { place(); nextTick(place) })
function onDoc(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (!t || el.value?.contains(t) || props.anchor?.contains(t) || t.closest?.('.esel-m, .tp')) return
  emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || el.value?.querySelector('.esel-m')) return
  e.stopPropagation(); e.preventDefault()
  props.anchor?.focus()
  emit('close')
}
const onReflow = (e: Event) => { if (!(e.target instanceof Node && el.value?.contains(e.target))) place() }
onMounted(() => { document.addEventListener('pointerdown', onDoc, true); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onReflow); window.addEventListener('scroll', onReflow, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onReflow); window.removeEventListener('scroll', onReflow, true) })

/** 첫 번째 값(서로 다르면 'Mixed') */
function same<T>(fn: (s: LayerStyle) => T): T | 'Mixed' {
  const v = props.styles.map(fn)
  return v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0]! : 'Mixed'
}
const style = computed(() => same((s) => (s.dash ? 'dashed' : 'solid')))
const dash = computed(() => same((s) => s.dash?.[0] ?? 4))
const gap = computed(() => same((s) => s.dash?.[1] ?? 4))
const cap = computed(() => same((s) => s.cap ?? props.defaultCap))
const join = computed(() => same((s) => s.join ?? props.defaultJoin))
watch(style, () => nextTick(place))

const STYLES = [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }]
function setStyle(v: string) { emit('set', { dash: v === 'dashed' ? [Number(dash.value === 'Mixed' ? 4 : dash.value) || 4, Number(gap.value === 'Mixed' ? 4 : gap.value) || 4] : undefined }) }
/** Dash · Gap: Gap 을 비우면 Dash 와 같게(피그마와 같아요) */
function setDash(i: 0 | 1, e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.trim()
  const d = dash.value === 'Mixed' ? 4 : dash.value
  const g = gap.value === 'Mixed' ? d : gap.value
  if (i === 1 && !raw) { emit('set', { dash: [d, d] }); return }
  const v = Number(raw.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(v) || v < 0) { input.value = String(i ? g : d); return }
  emit('set', { dash: i ? [d, Math.round(v * 10) / 10] : [Math.max(0.1, Math.round(v * 10) / 10), g] })
}
function stepDash(i: 0 | 1, e: KeyboardEvent) {
  if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const k = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  const d = dash.value === 'Mixed' ? 4 : dash.value, g = gap.value === 'Mixed' ? d : gap.value
  emit('set', { dash: i ? [d, Math.max(0, g + k)] : [Math.max(1, d + k), g] })
}
const CAPS = [
  { k: 'butt' as const, label: 'None', d: 'M3 8h7' },
  { k: 'square' as const, label: 'Square', d: 'M3 8h7' },
  { k: 'round' as const, label: 'Round', d: 'M3 8h7' },
]
const JOINS = [
  { k: 'miter' as const, label: 'Miter' },
  { k: 'bevel' as const, label: 'Bevel' },
  { k: 'round' as const, label: 'Round' },
]
</script>

<template>
  <Teleport to="body">
    <div ref="el" v-front class="sq ss-pop editor" role="dialog" :aria-label="tr('Stroke settings')" :style="pos">
      <div class="pop-h"><span class="pop-t">{{ tr('Stroke settings') }}</span><button type="button" class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button></div>
      <div class="pop-b">
        <div class="row">
          <span class="lb">{{ tr('Style') }}</span>
          <EditorSelect :model-value="style === 'Mixed' ? null : style" :options="STYLES" ariaLabel="Stroke style" placeholder="Mixed" @update:model-value="setStyle" />
        </div>
        <template v-if="style === 'dashed'">
          <div class="row">
            <span class="lb">{{ tr('Dash') }}</span>
            <label class="sq fld"><input :key="'d' + dash" :value="dash === 'Mixed' ? '' : dash" :placeholder="dash === 'Mixed' ? tr('Mixed') : ''" inputmode="decimal" :aria-label="tr('Dash')" @change="setDash(0, $event)" @keydown="stepDash(0, $event)"></label>
          </div>
          <div class="row">
            <span class="lb">{{ tr('Gap') }}</span>
            <label class="sq fld"><input :key="'g' + gap + dash" :value="gap === 'Mixed' || gap === dash ? '' : gap" :placeholder="gap === 'Mixed' ? tr('Mixed') : String(dash)" inputmode="decimal" :aria-label="tr('Gap')" @change="setDash(1, $event)" @keydown="stepDash(1, $event)"></label>
          </div>
        </template>
        <div v-if="style === 'dashed' || openPath" class="row">
          <span class="lb">{{ style === 'dashed' && !openPath ? tr('Dash cap') : tr('Cap') }}</span>
          <div class="sq seg" role="radiogroup" :aria-label="tr('Cap')">
            <button v-for="c in CAPS" :key="c.k" type="button" role="radio" :aria-checked="cap === c.k" :class="['sq', 'seg-b', { on: cap === c.k }]" :aria-label="tr(c.label)" :data-tip="tr(c.label)" @click="emit('set', { cap: c.k })">
              <svg class="keep" width="20" height="16" viewBox="0 0 20 16" aria-hidden="true"><path d="M3.5 4.5h13M3.5 11.5h13" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5" opacity=".5" /><path d="M5 8h10" stroke="currentColor" stroke-width="4" :stroke-linecap="c.k" /></svg>
            </button>
          </div>
        </div>
        <div class="row">
          <span class="lb">{{ tr('Join') }}</span>
          <div class="sq seg" role="radiogroup" :aria-label="tr('Join')">
            <button v-for="j in JOINS" :key="j.k" type="button" role="radio" :aria-checked="join === j.k" :class="['sq', 'seg-b', { on: join === j.k }]" :aria-label="tr(j.label)" :data-tip="tr(j.label)" @click="emit('set', { join: j.k })">
              <svg class="keep" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V5h9" fill="none" stroke="currentColor" stroke-width="3" :stroke-linejoin="j.k" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 설정 창: 폭 240 · 머리 40(제목 + ✕, 아래 선) · 본문 안쪽 12 · 줄 사이 8 — 효과 설정 창과 같아요 */
.ss-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; text-align: left; }
.pop-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pop-t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.s24 { width: 24px; height: 24px; }
.pop-b { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
/* 줄: [이름 72 | 값] (피그마와 같아요) */
.row { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.lb { color: var(--sys-color-neutral-500); white-space: nowrap; }
.fld input { flex: 1; min-width: 0; padding: 0; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 고르기 묶음: 회색 칸 안 3칸, 고른 칸은 흰 바탕 + 테두리(피그마와 같아요) */
.seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; height: 28px; padding: 2px; box-sizing: border-box; border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); }
.seg-b { display: grid; place-items: center; width: 100%; height: 100%; min-width: 0; padding: 0; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-500); }
.seg-b:hover { color: var(--sys-color-neutral-800); }
.seg-b.on { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; color: var(--sys-color-neutral-800); }
.seg-b:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 창 안 드롭다운: 흰 바탕 + 테두리(칠 창과 같아요) */
.ss-pop :deep(.esel > .dd) { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.ss-pop :deep(.esel > .dd.open) { --sq-line: var(--sys-color-brand-primary-default); }
</style>
