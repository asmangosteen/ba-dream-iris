<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import type { ExportSetting, LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { EXPORT_FORMATS, EXPORT_SCALES, download, fileNameOf, isVectorFormat, normScale, previewOf, renderExport } from '~/canvas/exporter'

/**
 * Export 칸(피그마와 같아요): [배율 ▾] [형식 ▾] [⋯] [−] 줄을 여러 개, 아래 'Export 이름' 버튼과 Preview.
 * 화면(프레임)을 고르면 화면 설정(doc.exports), 레이어를 고르면 레이어 설정(node.exports). 설정은 파일에 함께 저장돼요
 */
/** screens: 프레임을 여러 개 골랐을 때 — 설정은 모두에 한꺼번에, 내보내기도 모두(피그마 'Export 2 layers') */
const props = defineProps<{ sid: string; ids: string[]; screen?: { id: string; name: string } | null; screens?: { id: string; name: string }[] }>()
const store = useLayerStore()
const emit = defineEmits<{ toast: [text: string] }>()
const toast = (t: string) => emit('toast', t)

const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const frames = computed(() => (props.screens && props.screens.length > 1 ? props.screens : props.screen ? [props.screen] : null))
const allLists = computed(() => (frames.value ? frames.value.map((f) => store.doc(f.id).exports ?? []) : nodes.value.map((n) => n.exports ?? [])))
/** 고른 것들의 내보내기 설정이 서로 다르면 Mixed — 목록 대신 안내, + 로 모두 같은 설정으로 */
const mixed = computed(() => allLists.value.some((l) => JSON.stringify(l) !== JSON.stringify(allLists.value[0] ?? [])))
const list = computed<ExportSetting[]>(() => (mixed.value ? [] : allLists.value[0] ?? []))
function save(next: ExportSetting[]) {
  if (frames.value) { store.batch(() => { for (const f of frames.value!) store.setScreenExports(f.id, next.length ? next.map((e) => ({ ...e })) : undefined) }); return }
  else store.update(props.sid, props.ids, { exports: next.length ? next.map((e) => ({ ...e })) : undefined })
}
/** + : 처음은 1x PNG, 다음부터는 한 단계 큰 배율(피그마와 같아요) */
/** 끌어서 순서 바꾸기 */
const { box: dragBox, drag, start: dragStart, key: dragKey } = useRowDrag((from, to) => { menu.value = null; save(moveItem(list.value, from, to)) })
function add() {
  if (mixed.value) { save([{ scale: '1x', format: 'PNG' }]); return }
  const cur = list.value
  if (!cur.length) { save([{ scale: '1x', format: 'PNG' }]); return }
  const last = cur[cur.length - 1]!
  const steps = ['1x', '2x', '3x', '4x']
  const next = steps[steps.indexOf(last.scale) + 1] ?? last.scale
  save([...cur, { scale: next, format: last.format }])
}
const setAt = (i: number, patch: Partial<ExportSetting>) => save(list.value.map((e, k) => (k === i ? { ...e, ...patch } : e)))
const removeAt = (i: number) => { menu.value = null; save(list.value.filter((_, k) => k !== i)) }
function typedScale(i: number, ev: Event) {
  const el = ev.target as HTMLInputElement
  const v = normScale(el.value)
  if (v) setAt(i, { scale: v })
  else el.value = list.value[i]!.scale
}
/** 칸 안 ▾ 메뉴: 값은 입력칸에 이미 있으니 버튼에는 ▾ 만(W/H 칸과 같아요) */
const SCALE_OPTS = EXPORT_SCALES.map((s) => ({ value: s, label: s, short: '' }))
const FORMAT_OPTS = EXPORT_FORMATS.map((f) => ({ value: f, label: f === 'JPG' ? 'JPEG' : f }))

// ⋯ 설정(피그마와 같은 항목): Suffix · Color profile · Ignore overlapping layers
const menu = ref<number | null>(null)
function setSuffix(i: number, ev: Event) {
  const v = (ev.target as HTMLInputElement).value
  setAt(i, { suffix: v === '' ? undefined : v })
}

/** 입력칸 Esc: 고치던 값을 버리고 칸에서 나가요(다른 패널 칸과 같아요) */
function exFocus(e: FocusEvent) { const t = e.target as HTMLInputElement; if (t.tagName === 'INPUT') { t.dataset.orig = t.value; delete t.dataset.esc } }
function exEsc(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement
  if (e.key !== 'Escape' || t.tagName !== 'INPUT') return
  e.stopPropagation()
  t.dataset.esc = '1'
  t.value = t.dataset.orig ?? t.value
  t.blur()
  delete t.dataset.esc
}
function exChangeCap(e: Event) { if ((e.target as HTMLElement).dataset?.esc) e.stopPropagation() }
/** 내보낼 대상: 캔버스에 그려진 그 요소 */
function targets(): { el: HTMLElement; name: string }[] {
  const world = document.querySelector('.canvas .world')
  if (!world) return []
  if (frames.value) return frames.value.map((f) => ({ el: world.querySelector<HTMLElement>(`.frame[data-screen="${f.id}"]`), name: f.name })).filter((t): t is { el: HTMLElement; name: string } => !!t.el)
  return nodes.value.map((n) => ({ el: world.querySelector<HTMLElement>(`[data-screen="${props.sid}"] [data-layer="${n.id}"]`), name: n.name })).filter((t): t is { el: HTMLElement; name: string } => !!t.el)
}
const label = computed(() => (frames.value && frames.value.length > 1 ? tr('{n} layers', { n: frames.value.length }) : props.screen ? props.screen.name : nodes.value.length > 1 ? tr('{n} layers', { n: nodes.value.length }) : nodes.value[0]?.name ?? ''))
const busy = ref(false)
async function run() {
  if (busy.value || !list.value.length) return
  busy.value = true
  try {
    const ts = targets()
    for (const t of ts) for (const e of list.value) download(await renderExport(t.el, e), fileNameOf(t.name, e))
    if (!ts.length) toast(tr('Nothing to export'))
  } catch (err) {
    console.error(err)
    toast(tr('Couldn’t export. Try again'))
  } finally { busy.value = false }
}

// Preview: 첫 대상을 작게
const pvOpen = ref(false)
const pvSrc = ref<string | null>(null)
async function refreshPreview() {
  pvSrc.value = null
  const t = targets()[0]
  if (!pvOpen.value || !t) return
  try { pvSrc.value = await previewOf(t.el) } catch { pvSrc.value = null }
}
watch([pvOpen, () => props.sid, () => props.ids.join(), () => props.screen?.id], () => nextTick(refreshPreview))
</script>

<template>
  <section ref="dragBox" class="s ex drag-box" @focusin="exFocus" @keydown="exEsc" @change.capture="exChangeCap">
    <div :class="['sec-h', 'h24', { empty: !list.length && !mixed }]">
      <span>{{ tr('Export') }}</span>
      <button class="ib s24" :aria-label="tr('Add export setting')" :title="tr('Add export setting')" @click="add"><EditorIcon name="plus" :size="16" /></button>
    </div>
    <p v-if="mixed" class="tx-meta m0">{{ tr('Click + to replace mixed export settings') }}</p>
    <template v-if="list.length">
      <div v-for="(e, i) in list" :key="i" class="erow" data-drag-row :class="{ dragging: drag?.from === i }">
        <button v-if="list.length > 1" type="button" class="drag-h" :aria-label="tr('Drag to reorder')" @pointerdown="dragStart($event, i)" @keydown="dragKey($event, i, list.length)"><EditorIcon class="keep" name="menu_hamburger" :size="10" /></button>
        <!-- 배율: 직접 입력 + ▾ 고르기. SVG · PDF 는 피그마처럼 배율 없음 -->
        <label :class="['sq', 'fld', 'esc', { off: isVectorFormat(e.format) }]">
          <input :key="e.scale + e.format" :value="isVectorFormat(e.format) ? '1x' : e.scale" :disabled="isVectorFormat(e.format)" :aria-label="tr('Export scale')" @change="typedScale(i, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()">
          <EditorSelect v-if="!isVectorFormat(e.format)" variant="inline" :model-value="e.scale" :options="SCALE_OPTS" aria-label="Export scale presets" @update:model-value="(v) => setAt(i, { scale: v })" />
        </label>
        <EditorSelect :model-value="e.format" :options="FORMAT_OPTS" aria-label="Export format" @update:model-value="(v) => setAt(i, { format: v as ExportSetting['format'] })" />
        <button :class="['ib', 's24', { on: menu === i }]" :aria-label="tr('Export settings')" :title="tr('Export settings')" @click="menu = menu === i ? null : i">
          <EditorIcon name="menu_meatball" />
        </button>
        <button class="ib s24" :aria-label="tr('Remove export setting')" :title="tr('Remove export setting')" @click="removeAt(i)"><EditorIcon name="minus" /></button>
        <div v-if="menu === i" class="sq float emenu" role="dialog" :aria-label="tr('Export settings')">
          <div class="em-h"><span>{{ tr('Export') }}</span><button class="ib s24" :aria-label="tr('Close')" @click="menu = null"><EditorIcon name="close" /></button></div>
          <div class="em-r"><span class="tx-meta">{{ tr('Suffix') }}</span><label class="sq fld"><input :value="e.suffix ?? ''" :placeholder="fileNameOf('', e).replace(/^Untitled|\.\w+$/g, '') || tr('None')" :aria-label="tr('Suffix')" @change="setSuffix(i, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label></div>
          <div class="em-r"><span class="tx-meta">{{ tr('Color profile') }}</span><span class="sq fld ro">sRGB</span></div>
          <button class="cb on dis" disabled :title="tr('Only this layer is exported — layers on top aren\'t included')"><i class="sq" />{{ tr('Ignore overlapping layers') }}</button>
        </div>
      </div>
      <button class="sq exbtn" :disabled="busy" @click="run"><span class="exl">{{ busy ? tr('Exporting…') : tr('Export {name}', { name: label }) }}</span></button>
      <button class="pvt" :aria-expanded="pvOpen" @click="pvOpen = !pvOpen"><EditorIcon name="chevron_down" :size="12" :class="{ rot: !pvOpen }" />{{ tr('Preview') }}</button>
      <div v-if="pvOpen" class="sq sq-clip pv">
        <img v-if="pvSrc" :src="pvSrc" :alt="tr('Export preview')">
        <span v-else class="tx-meta">{{ tr('Rendering…') }}</span>
      </div>
    </template>
    <div v-if="drag" class="row-drop" :style="{ top: drag.y + 'px', left: drag.x + 'px', width: drag.w + 'px' }" />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 28px; padding: 0; }
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.s24 { width: 28px; height: 28px; }
/* 패널 맨 끝 칸: 아래 여백(다른 패널과 같은 12) */
.ex:last-child { margin-bottom: var(--ref-spacing-12); }
/* 한 줄: [배율] [형식] [⋯] [−] */
.erow { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px 28px; gap: var(--ref-spacing-04); align-items: center; }
.esc input { flex: 1; min-width: 0; }
.esc.off { opacity: .5; }
.ib.on { --sq-fill: var(--sys-color-neutral-200); }
/* ⋯ 설정: 줄 아래 떠 있는 작은 패널 */
.emenu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; width: 220px; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.em-h { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--sys-color-neutral-800); }
.em-r { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-04); }
.ro { color: var(--sys-color-neutral-600); }
.cb.dis { opacity: .6; cursor: default; }
/* Export 버튼: 패널 폭 · 28h · 1px 선, 글자는 가운데(넘치면 …) */
.exbtn { display: flex; align-items: center; justify-content: center; min-width: 0; padding: 0 var(--ref-spacing-06); height: 28px; border-radius: var(--ref-radius-03); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; font-size: 12px; font-weight: 500; color: var(--sys-color-neutral-800); }
.exl { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.exbtn:hover:not(:disabled) { --sq-overlay: var(--interaction-light-gray-hover); }
.exbtn:disabled { color: var(--sys-color-neutral-500); }
.pvt { display: flex; align-items: center; gap: var(--ref-spacing-02); width: max-content; font-size: 12px; color: var(--sys-color-neutral-600); }
.pvt:hover { color: var(--sys-color-neutral-800); }
.pvt .rot { transform: rotate(-90deg); }
.pv { display: grid; place-items: center; min-height: 80px; padding: var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.pv img { display: block; max-width: 100%; max-height: 240px; box-shadow: 0 0 0 1px var(--ref-color-gray-900-5); }
.m0 { margin: 0; }
</style>
