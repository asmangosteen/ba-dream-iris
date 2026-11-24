<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import type { LayerNode, LayerStyle } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'

/**
 * 글자 상세 설정 창(피그마 Typography ⚙ — Basics · Details). 오른쪽 패널 왼쪽에 떠요(칠 창과 같은 자리 · 모양).
 * Basics: 미리 보기 · 정렬(양쪽 맞춤 포함) · 꾸밈 · 대소문자 / 목록 · 문단 간격 · 말줄임 · 줄바꿈 방식
 * Details: 숫자 모양(고정폭)
 * 피그마에 있지만 Iris 가 아직 못 그리는 것(세로 다듬기 · 작은 대문자 · 꾸밈 세부 · OpenType 세부)은 PRD/07 §17 에 적어 뒀어요
 */
const props = defineProps<{ anchor: HTMLElement | null; sid: string; ids: string[] }>()
const emit = defineEmits<{ close: [] }>()
const store = useLayerStore()

const tab = ref<'basics' | 'details'>('basics')
const el = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
const W = 240

const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
function same<T>(get: (n: LayerNode) => T): T | 'Mixed' {
  const v = nodes.value.map(get)
  return v.every((x) => x === v[0]) ? v[0]! : 'Mixed'
}
const set = (patch: Partial<LayerStyle>) => store.style(props.sid, props.ids, patch)
/** 같은 값을 다시 누르면 꺼요(— 와 같아요) */
const pick = <K extends keyof LayerStyle>(key: K, v: LayerStyle[K]) => set({ [key]: v } as Partial<LayerStyle>)

function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  const panel = a.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const vh = window.innerHeight
  const h = el.value?.offsetHeight ?? 480
  pos.value = { left: Math.max(8, panel.left - W - 8) + 'px', top: Math.max(8, Math.min(vh - h - 8, r.top - 48)) + 'px' }
}
onMounted(() => { place(); nextTick(place) })
watch(tab, () => nextTick(place))

function onDoc(e: PointerEvent) {
  const t = e.target as Node | null
  if (!t || el.value?.contains(t) || props.anchor?.contains(t)) return
  if ((t as HTMLElement).closest?.('.tp, .paint-pop')) return
  emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (el.value?.querySelector('.esel-m')) return
  e.stopPropagation()
  e.preventDefault()
  props.anchor?.focus()
  emit('close')
}
const onReflow = (e: Event) => { if (!(e.target instanceof Node && el.value?.contains(e.target))) place() }
onMounted(() => {
  document.addEventListener('pointerdown', onDoc, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onReflow)
  window.addEventListener('scroll', onReflow, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', onReflow)
  window.removeEventListener('scroll', onReflow, true)
})

// 미리 보기: 고른 글자의 첫 줄을 지금 모양대로(크기는 창에 맞게 32 까지)
const first = computed(() => nodes.value[0])
const sample = computed(() => ((first.value?.text ?? '').split('\n')[0] || 'Preview').slice(0, 60))
const previewCss = computed(() => {
  const s = first.value?.style
  if (!s) return {}
  return {
    fontSize: Math.min(s.fontSize ?? 16, 32) + 'px', fontWeight: s.fontWeight ?? 400, letterSpacing: s.letterSpacing ? s.letterSpacing + 'px' : undefined,
    textAlign: s.align ?? 'left', textDecoration: s.decoration === 'underline' ? 'underline' : s.decoration === 'strike' ? 'line-through' : undefined,
    textTransform: s.textCase === 'upper' ? 'uppercase' : s.textCase === 'lower' ? 'lowercase' : s.textCase === 'title' ? 'capitalize' : undefined,
    fontVariantNumeric: s.numbers === 'tabular' ? 'tabular-nums' : undefined,
  } as Record<string, string | number | undefined>
})

const ALIGN = [['left', 'Align left'], ['center', 'Align center'], ['right', 'Align right'], ['justify', 'Justify']] as const
const alignNow = computed(() => same((n) => n.style.align ?? 'left'))
const decoNow = computed(() => same((n) => n.style.decoration ?? null))
const caseNow = computed(() => same((n) => n.style.textCase ?? null))
const listNow = computed(() => same((n) => n.style.list ?? null))
const truncNow = computed(() => same((n) => !!n.style.truncate))
const wrapNow = computed(() => same((n) => n.style.wrap ?? 'auto'))
const numNow = computed(() => same((n) => n.style.numbers ?? 'proportional'))
const paraNow = computed(() => same((n) => n.style.paraSpacing ?? 0))

function setPara(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = paraNow.value === 'Mixed' ? '' : String(paraNow.value); return }
  set({ paraSpacing: v > 0 ? Math.round(v * 100) / 100 : undefined })
}
function onParaKey(e: KeyboardEvent) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  store.update(props.sid, props.ids, (n) => ({ style: { ...n.style, paraSpacing: Math.max(0, (n.style.paraSpacing ?? 0) + d) || undefined } }))
}
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="sq tdp editor" role="dialog" aria-label="Type settings" :style="pos">
      <div class="td-h">
        <div class="td-tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'basics'" :class="['sq', 'td-tab', { on: tab === 'basics' }]" @click="tab = 'basics'">Basics</button>
          <button role="tab" :aria-selected="tab === 'details'" :class="['sq', 'td-tab', { on: tab === 'details' }]" @click="tab = 'details'">Details</button>
        </div>
        <button class="ib s24" aria-label="Close" data-tip="Close" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
      </div>

      <template v-if="tab === 'basics'">
        <div class="td-b">
          <div class="sq td-pv" aria-hidden="true"><span :style="previewCss">{{ sample }}</span></div>
          <div class="td-r">
            <span class="td-l">Alignment</span>
            <div class="grp" role="group" aria-label="Text alignment">
              <button v-for="a in ALIGN" :key="a[0]" :class="['ib', { on: alignNow === a[0] }]" :aria-pressed="alignNow === a[0]" :aria-label="a[1]" :data-tip="a[1]" @click="pick('align', a[0])"><EditorIcon :name="`align_${a[0]}`" :size="16" /></button>
            </div>
          </div>
          <div class="td-r">
            <span class="td-l">Decoration</span>
            <div class="grp" role="group" aria-label="Decoration">
              <button :class="['ib', { on: decoNow === null }]" :aria-pressed="decoNow === null" aria-label="None" data-tip="None" @click="pick('decoration', undefined)"><EditorIcon name="minus" :size="16" /></button>
              <button :class="['ib', { on: decoNow === 'underline' }]" :aria-pressed="decoNow === 'underline'" aria-label="Underline" data-tip="Underline" data-tip-key="⌘U" @click="pick('decoration', 'underline')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5v5a3 3 0 0 0 6 0v-5M3.5 13.5h9" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg></button>
              <button :class="['ib', { on: decoNow === 'strike' }]" :aria-pressed="decoNow === 'strike'" aria-label="Strikethrough" data-tip="Strikethrough" data-tip-key="⇧⌘X" @click="pick('decoration', 'strike')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M10.8 4.6C10.2 3.4 9.1 2.8 8 2.8c-1.7 0-3 .9-3 2.3 0 1 .7 1.7 1.8 2.1M5.2 11.2c.6 1.4 1.7 2 2.9 2 1.8 0 3.1-1 3.1-2.4 0-.7-.2-1.2-.7-1.6" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg></button>
            </div>
          </div>
          <div class="td-r">
            <span class="td-l">Case</span>
            <div class="grp" role="group" aria-label="Letter case">
              <button :class="['ib', { on: caseNow === null }]" :aria-pressed="caseNow === null" aria-label="As typed" data-tip="As typed" @click="pick('textCase', undefined)"><EditorIcon name="minus" :size="16" /></button>
              <button v-for="c in ([['upper', 'AG', 'Uppercase'], ['lower', 'ag', 'Lowercase'], ['title', 'Ag', 'Title case']] as const)" :key="c[0]" :class="['ib', 'tb', { on: caseNow === c[0] }]" :aria-pressed="caseNow === c[0]" :aria-label="c[2]" :data-tip="c[2]" @click="pick('textCase', c[0])">{{ c[1] }}</button>
              <!-- 작은 대문자: Pretendard 에 없어서 피그마처럼 흐리게 -->
              <button class="ib tb sc" disabled aria-label="Small caps (not available for Pretendard)" data-tip="Small caps — not in Pretendard">Aᴀ</button>
            </div>
          </div>
        </div>
        <div class="td-b">
          <div class="td-r">
            <span class="td-l">List style</span>
            <div class="grp" role="group" aria-label="List style">
              <button :class="['ib', { on: listNow === null }]" :aria-pressed="listNow === null" aria-label="None" data-tip="None" @click="pick('list', undefined)"><EditorIcon name="minus" :size="16" /></button>
              <button :class="['ib', { on: listNow === 'bullet' }]" :aria-pressed="listNow === 'bullet'" aria-label="Bulleted list" data-tip="Bulleted list" @click="pick('list', 'bullet')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="4" r="1" fill="currentColor" /><circle cx="3.5" cy="8" r="1" fill="currentColor" /><circle cx="3.5" cy="12" r="1" fill="currentColor" /><path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /></svg></button>
              <button :class="['ib', { on: listNow === 'number' }]" :aria-pressed="listNow === 'number'" aria-label="Numbered list" data-tip="Numbered list" @click="pick('list', 'number')"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 2.8h1v3M2.6 9.3c.2-.5.6-.8 1.1-.8.6 0 1 .4 1 .9 0 .8-2.1 1.5-2.1 2.6h2.1M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
            </div>
          </div>
          <div class="td-r">
            <span class="td-l">Paragraph spacing</span>
            <label class="sq fld td-num"><input :value="paraNow === 'Mixed' ? '' : paraNow" :placeholder="paraNow === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Paragraph spacing" @change="setPara" @keydown="onParaKey"></label>
          </div>
          <div class="td-r">
            <span class="td-l">Truncate text</span>
            <div class="grp" role="group" aria-label="Truncate text">
              <button :class="['ib', { on: truncNow === false }]" :aria-pressed="truncNow === false" aria-label="Don't truncate" data-tip="Don't truncate" @click="pick('truncate', undefined)"><EditorIcon name="minus" :size="16" /></button>
              <button :class="['ib', 'tb', { on: truncNow === true }]" :aria-pressed="truncNow === true" aria-label="Truncate with ellipsis" data-tip="Truncate with ellipsis" @click="pick('truncate', true)">A…</button>
            </div>
          </div>
          <div class="td-r">
            <span class="td-l">Wrap style</span>
            <EditorSelect class="td-sel" :model-value="wrapNow === 'Mixed' ? null : wrapNow" :options="[{ value: 'auto', label: 'Auto' }, { value: 'balance', label: 'Balance' }, { value: 'pretty', label: 'Pretty' }]" aria-label="Wrap style" placeholder="Mixed" @update:model-value="(v) => pick('wrap', v === 'auto' ? undefined : (v as 'balance' | 'pretty'))" />
          </div>
        </div>
      </template>

      <div v-else class="td-b">
        <div class="td-r">
          <span class="td-l">Numbers</span>
          <EditorSelect class="td-sel" :model-value="numNow === 'Mixed' ? null : numNow" :options="[{ value: 'proportional', label: 'Proportional' }, { value: 'tabular', label: 'Tabular' }]" aria-label="Number spacing" placeholder="Mixed" @update:model-value="(v) => pick('numbers', v === 'tabular' ? 'tabular' : undefined)" />
        </div>
        <p class="td-note">Tabular numbers line up in tables and prices.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 겉면은 칠 창 · 사이드바와 같아요(흰 바탕 · 떠 있는 선 · 그림자) */
.tdp { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.td-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-04); box-shadow: inset 0 -1px 0 var(--iris-line); }
.td-tabs { display: flex; gap: var(--ref-spacing-02); }
.td-tab { height: 24px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); font-size: 12px; line-height: 24px; font-weight: 500; color: var(--sys-color-neutral-600); }
.td-tab:hover { color: var(--sys-color-neutral-800); }
.td-tab.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); font-weight: 600; }
.td-tab:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* 묶음: 위아래 8 · 옆 12, 묶음 사이 선(피그마: 미리 보기 · 정렬 · 꾸밈 · 대소문자 / 목록 · 문단 · 말줄임 · 줄바꿈) */
.td-b { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-08); }
.td-b + .td-b { box-shadow: inset 0 1px 0 var(--iris-line); }
.td-pv { height: 80px; margin-bottom: var(--ref-spacing-04); display: flex; align-items: center; padding: 0 var(--ref-spacing-08); overflow: hidden; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.td-pv > span { display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.3; font-family: var(--font-family-base); color: var(--sys-color-neutral-800); }
/* 줄: 32h, [이름 | 버튼 묶음(오른쪽)] */
.td-r { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); min-height: 32px; }
.td-l { min-width: 0; color: var(--sys-color-neutral-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-r > .grp { flex: none; }
.td-r > .grp > .ib { flex: none; width: 28px; height: 24px; color: var(--sys-color-neutral-700); }
.td-r > .grp > .ib.on { color: var(--sys-color-neutral-800); }
.tb { font-size: 11px; font-weight: 500; }
.ib.sc { color: var(--sys-color-neutral-400) !important; cursor: default; }
.td-num { flex: none; width: 64px; height: 28px; }
.td-num > input { width: 100%; }
.td-sel { flex: none; width: 112px; }
.td-note { margin: 0 0 var(--ref-spacing-02); font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-600); }
</style>
