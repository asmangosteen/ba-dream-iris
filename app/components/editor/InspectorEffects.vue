<script setup lang="ts">
import type { Ref } from 'vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { Effect, LayerNode, LayerStyle } from '~/canvas/schema'
import { colorLabel, parseColor, useTokenCatalog } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import { withAlpha } from '~/canvas/color'
import ColorField from '~/components/editor/ColorField.vue'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import type { CatalogToken } from '~/canvas/tokens'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import { useContextMenu } from '~/composables/useContextMenu'

/**
 * Effects(피그마와 같아요): Inner shadow · Drop shadow · Layer blur · Background blur.
 * - 머리: [⁘ 스타일 적용(올리면 보여요)] [+ 종류 고르기 메뉴]
 * - 행: [종류 아이콘 + 이름](누르면 설정 창) [👁] [−] — 스타일이 연결되면 [스타일 이름] [연결 풀기] [−]
 * - 설정 창: 머리 [아이콘 · 종류 ▾ · ✕], 본문 [이름 | 값] — Position X · Y, Blur, Spread, Color
 * - Effect styles 창: 디자인 시스템 그림자(검색 · 고르면 연결)
 * frame: 화면(프레임) 자체의 효과(doc.frame), sids: 프레임 여러 개를 함께
 */
const props = defineProps<{ sid: string; ids: string[]; frame?: boolean; sids?: string[] }>()
const store = useLayerStore()
const catalog = useTokenCatalog()
const ctxMenu = useContextMenu()
const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n): n is LayerNode => !!n))
const frameIds = computed(() => (props.sids?.length ? props.sids : [props.sid]))
const styles = computed<LayerStyle[]>(() => (props.frame ? frameIds.value.map((id) => store.doc(id).frame ?? {}) : nodes.value.map((n) => n.style)))
const all = computed<(Effect[] | undefined)[]>(() => styles.value.map((s) => s.effects))
/** 고른 것들의 효과가 서로 다르면 Mixed — 목록 대신 안내, + 로 모두 같은 효과 하나로 */
const mixed = computed(() => all.value.some((l) => JSON.stringify(l ?? []) !== JSON.stringify(all.value[0] ?? [])))
const list = computed<Effect[]>(() => (mixed.value ? [] : all.value[0] ?? []))
/** 연결된 효과 스타일(그림자 토큰) — 모두 같을 때만 */
const boundId = computed(() => { const v = styles.value.map((s) => (s.vars as Record<string, string> | undefined)?.shadow ?? null); return v.every((x) => x === v[0]) ? v[0] ?? null : null })
const boundTok = computed(() => (boundId.value ? catalog.find(boundId.value) : undefined))

/** 피그마 효과 메뉴 순서 */
const TYPES: { value: Effect['type']; label: string }[] = [
  { value: 'inner', label: 'Inner shadow' }, { value: 'drop', label: 'Drop shadow' }, { value: 'blur', label: 'Layer blur' }, { value: 'bgblur', label: 'Background blur' },
]
const typeLabel = (t: Effect['type']) => tr(TYPES.find((x) => x.value === t)?.label ?? 'Effect')
/** 종류 아이콘(16): 안쪽 그림자 = 위 띠, 바깥 그림자 = 아래 띠, 흐림 = 점 격자 */
const ICON: Record<Effect['type'], { box: boolean; band?: 'top' | 'bottom'; dots: boolean }> = {
  inner: { box: true, band: 'top', dots: false }, drop: { box: true, band: 'bottom', dots: false }, blur: { box: false, dots: true }, bgblur: { box: true, dots: true },
}

// --- 설정 창 ---
const open = ref<number | null>(null)
watch(() => props.ids.join() + props.sid, () => { open.value = null; stylesOpen.value = false })
const rowEls = new Map<number, HTMLElement>()
const rowRef = (i: number) => (el: unknown) => { if (el) rowEls.set(i, el as HTMLElement); else rowEls.delete(i) }
const pop = ref<HTMLElement | null>(null)
const setPop = (el: unknown) => { pop.value = (el as HTMLElement | null) ?? null }
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
/** 오른쪽 패널 바로 왼쪽, 위쪽은 연 행에 맞춰요 */
function placeAt(anchor: HTMLElement | undefined | null, el: HTMLElement | null, out: Ref<Record<string, string>>) {
  if (!anchor) return
  const r = anchor.getBoundingClientRect()
  const panel = anchor.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const h = el?.offsetHeight ?? 240
  out.value = { left: Math.max(8, panel.left - 240 - 8) + 'px', top: Math.max(8, Math.min(window.innerHeight - h - 8, r.top - 8)) + 'px' }
}
const place = () => placeAt(open.value === null ? null : rowEls.get(open.value), pop.value, pos)
watch(open, (v) => { pos.value = { visibility: 'hidden' }; if (v !== null) { stylesOpen.value = false; nextTick(() => { place(); nextTick(place) }) } }, { flush: 'post' })
watch(list, () => { if (open.value !== null) { if (!list.value[open.value]) open.value = null; else nextTick(place) } }, { deep: true })
function closePop(refocus = false) {
  const i = open.value
  open.value = null
  if (refocus && i !== null) rowEls.get(i)?.querySelector<HTMLElement>('.efb')?.focus()
}
function onDoc(e: PointerEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return
  if (t.closest?.('.paint-pop, .tp, .esel-m, .menu')) return
  if (open.value !== null && !pop.value?.contains(t) && !rowEls.get(open.value)?.contains(t)) closePop()
  if (stylesOpen.value && !stylesEl.value?.contains(t) && !stylesBtn.value?.contains(t) && !boundBtn.value?.contains(t)) stylesOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || document.querySelector('.esel-m')) return
  if (stylesOpen.value) { e.stopPropagation(); stylesOpen.value = false; return }
  if (open.value !== null && pop.value?.contains(e.target as Node)) { e.stopPropagation(); closePop(true) }
}
const onReflow = (e: Event) => {
  if (e.target instanceof Node && (pop.value?.contains(e.target) || stylesEl.value?.contains(e.target))) return
  if (open.value !== null) place()
  if (stylesOpen.value) placeStyles()
}
onMounted(() => { document.addEventListener('pointerdown', onDoc, true); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onReflow); window.addEventListener('scroll', onReflow, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onReflow); window.removeEventListener('scroll', onReflow, true) })

// --- 고치기 ---
/** 끌어서 순서 바꾸기 */
const { box: dragBox, drag, start: dragStart, key: dragKey } = useRowDrag((from, to) => { open.value = null; setList((l) => moveItem(l, from, to)) })
function setList(fn: (l: Effect[]) => Effect[]) {
  if (props.frame) { store.batch(() => { for (const id of frameIds.value) { const next = fn([...(store.doc(id).frame?.effects ?? [])]); store.frameStyle(id, { effects: next.length ? next : undefined }) } }); return }
  store.update(props.sid, props.ids, (n) => { const next = fn([...(n.style.effects ?? [])]); return { style: { ...n.style, effects: next.length ? next : undefined } } })
}
const fresh = (t: Effect['type']): Effect => (t === 'blur' || t === 'bgblur' ? { type: t, blur: 4 } : { type: t, x: 0, y: 4, blur: 4, spread: 0, color: '#00000040' })
/** + : 종류 메뉴(피그마와 같아요) → 넣고 설정 창을 바로 열어요. 여러 값(Mixed)이면 모두 그 효과 하나로 */
function addMenu(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const at = { clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent
  ctxMenu.open(at, TYPES.map((t) => ({ label: tr(t.label), action: () => add(t.value) })))
}
function add(t: Effect['type']) {
  if (mixed.value || boundId.value) { replaceAll([fresh(t)]); open.value = 0; return }
  const i = list.value.length
  setList((l) => [...l, fresh(t)])
  open.value = i
}
/** 효과 목록을 통째로 바꾸고 스타일 연결은 풀어요 */
function replaceAll(next: Effect[]) {
  if (props.frame) { store.batch(() => { for (const id of frameIds.value) store.frameStyle(id, { effects: next.length ? next : undefined }, { shadow: null }) }); return }
  store.unbind(props.sid, props.ids, 'shadow', () => ({ style: { effects: next.length ? next : undefined } }))
}
function setType(i: number, t: Effect['type']) {
  setList((l) => l.map((e, k) => {
    if (k !== i || e.type === t) return e
    if (t === 'blur' || t === 'bgblur') return { type: t, blur: e.blur, visible: e.visible }
    return e.type === 'drop' || e.type === 'inner' ? { ...e, type: t } : { type: t, x: 0, y: 4, blur: e.blur, spread: 0, color: '#00000040', visible: e.visible }
  }))
}
/** 색을 직접 바꾸면(견본 · hex · 투명도) 토큰 연결은 풀려요 — 토큰을 고를 때만 token 을 함께 넘겨요 */
function set(i: number, patch: Partial<Record<'x' | 'y' | 'blur' | 'spread', number>> | { color: string; token?: string } | { token: undefined } | { visible: boolean | undefined }) {
  const p = 'color' in patch && !('token' in patch) ? { ...patch, token: undefined } : patch
  setList((l) => l.map((e, k) => (k === i ? ({ ...e, ...p } as Effect) : e)))
}
function num(i: number, key: 'x' | 'y' | 'blur' | 'spread', ev: Event) {
  const input = ev.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!input.value.trim() || !Number.isFinite(v)) { const e = list.value[i] as Record<string, unknown> | undefined; input.value = String(e?.[key] ?? 0); return }
  set(i, { [key]: key === 'blur' ? Math.max(0, v) : v })
}
function stepNum(i: number, key: 'x' | 'y' | 'blur' | 'spread', ev: KeyboardEvent) {
  if (ev.key === 'Enter') { (ev.target as HTMLInputElement).blur(); return }
  if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
  ev.preventDefault()
  const e = list.value[i] as Record<string, number> | undefined
  const v = (e?.[key] ?? 0) + (ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 10 : 1)
  set(i, { [key]: key === 'blur' ? Math.max(0, v) : v })
}
const hex = (c: string) => parseColor(c)?.hex ?? '#000000'
const alpha = (c: string) => parseColor(c)?.a ?? 1
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
const shadow = (e: Effect): e is Extract<Effect, { type: 'drop' | 'inner' }> => e.type === 'drop' || e.type === 'inner'

// --- Effect styles(디자인 시스템 그림자) ---
const stylesOpen = ref(false)
const stylesBtn = ref<HTMLElement | null>(null)
const boundBtn = ref<HTMLElement | null>(null)
const stylesEl = ref<HTMLElement | null>(null)
const stylesPos = ref<Record<string, string>>({ visibility: 'hidden' })
const placeStyles = () => placeAt(boundBtn.value ?? stylesBtn.value, stylesEl.value, stylesPos)
watch(stylesOpen, (v) => { stylesPos.value = { visibility: 'hidden' }; q.value = ''; if (v) { open.value = null; catalog.ensure(); nextTick(() => { placeStyles(); nextTick(placeStyles) }) } })
const q = ref('')
const shadowStyles = computed(() => {
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return catalog.list(['shadow']).filter((t) => words.every((w) => t.name.toLowerCase().includes(w)))
})
/** box-shadow 글 → 효과 목록('0 4px 8px 0 rgba(0,0,0,.1), inset …') */
function parseShadow(css: string): Effect[] {
  const parts: string[] = []
  let depth = 0, cur = ''
  for (const ch of css) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p): Effect => {
    let s = p.trim()
    const inset = /\binset\b/i.test(s)
    s = s.replace(/\binset\b/i, '')
    const cm = /(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|\b[a-z]+\b)/i.exec(s)
    const raw = cm?.[0] ?? '#00000040'
    if (cm) s = s.replace(raw, '')
    const [x = 0, y = 0, b = 0, sp = 0] = (s.match(/-?\d*\.?\d+/g) ?? []).map(Number)
    const pc = parseColor(raw)
    return { type: inset ? 'inner' : 'drop', x, y, blur: b, spread: sp, color: pc ? (pc.a < 1 ? withAlpha(pc.hex, pc.a) : pc.hex) : '#00000040' }
  })
}
function applyStyle(t: CatalogToken) {
  const effects = parseShadow(t.css ?? t.value)
  if (props.frame) store.batch(() => { for (const id of frameIds.value) store.frameStyle(id, { effects }, { shadow: t.id }) })
  else store.bind(props.sid, props.ids, 'shadow', t.id, () => ({ style: { effects } }))
  stylesOpen.value = false
}
/** 연결 풀기: 효과는 그대로 */
function detach() {
  if (props.frame) store.batch(() => { for (const id of frameIds.value) store.frameStyle(id, {}, { shadow: null }) })
  else store.unbind(props.sid, props.ids, 'shadow')
}
</script>

<template>
  <section ref="dragBox" class="s drag-box">
    <div :class="['sec-h', 'h24', { empty: !list.length && !mixed }]">
      <span>{{ tr('Effects') }}</span>
      <span class="acts">
        <button ref="stylesBtn" class="ib s24 styl" :class="{ on: stylesOpen }" :aria-label="tr('Apply styles')" :data-tip="tr('Apply styles')" @click="stylesOpen = !stylesOpen"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="5" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><circle cx="5" cy="11" r="2" /><circle cx="11" cy="11" r="2" /></g></svg></button>
        <button class="ib s24" :aria-label="tr('Add effect')" :data-tip="tr('Add effect')" aria-haspopup="menu" @click="addMenu"><EditorIcon name="plus" :size="16" /></button>
      </span>
    </div>
    <p v-if="mixed" class="tx-meta m0">{{ tr('Click + to replace mixed content') }}</p>

    <!-- 스타일이 연결됐어요: [스타일 이름] [연결 풀기] [−] (피그마와 같아요) -->
    <div v-if="boundId && list.length" class="prow bound">
      <button ref="boundBtn" type="button" :class="['sq', 'fld', 'efb', { on: stylesOpen }]" :aria-label="tr('Change effect style')" @click="stylesOpen = !stylesOpen">
        <svg class="keep ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M3.5 13.2h9" stroke="currentColor" stroke-width="2" opacity=".35" /></svg>
        <span class="nm">{{ boundTok?.name ?? boundId }}</span>
      </button>
      <button class="ib s24" :aria-label="tr('Detach style')" :data-tip="tr('Detach style')" @click="detach"><EditorIcon name="unlink" :size="16" /></button>
      <button class="ib s24" :aria-label="tr('Remove effect')" :data-tip="tr('Remove')" @click="replaceAll([])"><EditorIcon name="minus" :size="16" /></button>
    </div>

    <template v-else>
      <div v-for="(e, i) in list" :key="i" class="item">
        <!-- 피그마 Effects 행: [종류 아이콘 + 이름](누르면 설정 창) [👁 24] [− 24] -->
        <div :ref="rowRef(i)" class="prow" data-drag-row :class="{ off: e.visible === false, dragging: drag?.from === i }">
          <button v-if="list.length > 1" type="button" class="drag-h" :aria-label="tr('Drag to reorder')" @pointerdown="dragStart($event, i)" @keydown="dragKey($event, i, list.length)"><svg class="keep" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 2h8M1 5h8M1 8h8" stroke="currentColor" stroke-width="1" /></svg></button>
          <button type="button" :class="['sq', 'fld', 'efb', { on: open === i }]" :aria-expanded="open === i" aria-haspopup="dialog" :aria-label="tr('{name} settings', { name: typeLabel(e.type) })" @click="open = open === i ? null : i">
            <svg class="keep ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect v-if="ICON[e.type].box" x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.25" />
              <path v-if="ICON[e.type].band === 'top'" d="M3.6 4.6h8.8" stroke="currentColor" stroke-width="2" opacity=".45" />
              <path v-if="ICON[e.type].band === 'bottom'" d="M3.5 13.4h9" stroke="currentColor" stroke-width="2" opacity=".45" />
              <g v-if="ICON[e.type].dots" fill="currentColor"><circle v-for="d in 9" :key="d" :cx="5 + ((d - 1) % 3) * 3" :cy="5 + Math.floor((d - 1) / 3) * 3" r=".8" /></g>
            </svg>
            <span class="nm">{{ typeLabel(e.type) }}</span>
          </button>
          <button class="ib s24" :aria-label="e.visible === false ? tr('Show effect') : tr('Hide effect')" :data-tip="e.visible === false ? tr('Show') : tr('Hide')" @click="set(i, { visible: e.visible === false ? undefined : false })">
            <EditorIcon :name="e.visible === false ? 'eye_off' : 'eye'" :size="16" />
          </button>
          <button class="ib s24" :aria-label="tr('Remove effect')" :data-tip="tr('Remove')" @click="setList((l) => l.filter((_, k) => k !== i)); open = null"><EditorIcon name="minus" :size="16" /></button>
        </div>
        <Teleport v-if="open === i" to="body">
          <div :ref="setPop" v-front class="sq fx-pop editor" role="dialog" :aria-label="tr('{name} settings', { name: typeLabel(e.type) })" :style="pos">
            <!-- 머리: [아이콘 · 종류 ▾] … [✕] -->
            <div class="pop-h">
              <span class="pop-k">
                <svg class="keep ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <rect v-if="ICON[e.type].box" x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.25" />
                  <path v-if="ICON[e.type].band === 'top'" d="M3.6 4.6h8.8" stroke="currentColor" stroke-width="2" opacity=".45" />
                  <path v-if="ICON[e.type].band === 'bottom'" d="M3.5 13.4h9" stroke="currentColor" stroke-width="2" opacity=".45" />
                  <g v-if="ICON[e.type].dots" fill="currentColor"><circle v-for="d in 9" :key="d" :cx="5 + ((d - 1) % 3) * 3" :cy="5 + Math.floor((d - 1) / 3) * 3" r=".8" /></g>
                </svg>
                <EditorSelect variant="inline" :model-value="e.type" :options="TYPES" ariaLabel="Effect type" @update:model-value="(v) => setType(i, v as Effect['type'])" />
              </span>
              <button type="button" class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="closePop(true)"><EditorIcon name="close" :size="16" /></button>
            </div>
            <!-- 본문: [이름 | 값](피그마와 같아요) -->
            <div class="pop-b">
              <template v-if="shadow(e)">
                <div class="row">
                  <span class="lb">{{ tr('Position') }}</span>
                  <label class="sq fld"><span class="k">X</span><input :key="'x' + e.x" :value="e.x" inputmode="numeric" aria-label="X" @change="num(i, 'x', $event)" @keydown="stepNum(i, 'x', $event)"></label>
                </div>
                <div class="row">
                  <span />
                  <label class="sq fld"><span class="k">Y</span><input :key="'y' + e.y" :value="e.y" inputmode="numeric" aria-label="Y" @change="num(i, 'y', $event)" @keydown="stepNum(i, 'y', $event)"></label>
                </div>
              </template>
              <div class="row">
                <span class="lb">{{ tr('Blur') }}</span>
                <label class="sq fld"><svg class="keep k" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle v-for="d in 9" :key="d" :cx="5 + ((d - 1) % 3) * 3" :cy="5 + Math.floor((d - 1) / 3) * 3" r=".8" /></g></svg><input :key="'b' + e.blur" :value="e.blur" inputmode="numeric" :aria-label="tr('Blur')" @change="num(i, 'blur', $event)" @keydown="stepNum(i, 'blur', $event)"></label>
              </div>
              <template v-if="shadow(e)">
                <div class="row">
                  <span class="lb">{{ tr('Spread') }}</span>
                  <label class="sq fld"><svg class="keep k" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.25" /><g fill="currentColor"><circle cx="8" cy="2.6" r=".8" /><circle cx="8" cy="13.4" r=".8" /><circle cx="2.6" cy="8" r=".8" /><circle cx="13.4" cy="8" r=".8" /><circle cx="4.2" cy="4.2" r=".8" /><circle cx="11.8" cy="4.2" r=".8" /><circle cx="4.2" cy="11.8" r=".8" /><circle cx="11.8" cy="11.8" r=".8" /></g></svg><input :key="'s' + e.spread" :value="e.spread ?? 0" inputmode="numeric" :aria-label="tr('Spread')" @change="num(i, 'spread', $event)" @keydown="stepNum(i, 'spread', $event)"></label>
                </div>
                <div class="row">
                  <span class="lb">{{ tr('Color') }}</span>
                  <div :class="['sq', 'fld', 'pf', { bound: !!e.token }]">
                    <ColorField :model-value="e.color" :sid="sid" :sids="frame ? frameIds : undefined" bindable label="Shadow color" @update:model-value="(v) => set(i, { color: v })" @token="(t: CatalogToken) => t.color && set(i, { color: t.color, token: t.id })" />
                    <TokenPicker v-if="e.token" :kinds="['color']" :bound="e.token" label="Shadow color" @pick="(t) => t.color && set(i, { color: t.color, token: t.id })" @unbind="set(i, { token: undefined })" />
                    <template v-else>
                      <input :key="'c' + e.color" class="hex" :value="colorLabel(e.color).split(' ')[0]!.replace('#', '')" :aria-label="tr('Shadow hex')" spellcheck="false" @change="(ev) => { const v = (ev.target as HTMLInputElement).value.trim().replace(/^#?/, '#'); if (/^#[0-9a-f]{6}$/i.test(v)) set(i, { color: withAlpha(v.toUpperCase(), alpha(e.color)) }); else (ev.target as HTMLInputElement).value = hex(e.color).slice(1) }" @keydown="blur" @focus="(ev) => (ev.target as HTMLInputElement).select()">
                      <TokenPicker :kinds="['color']" reveal label="Shadow color" @pick="(t) => t.color && set(i, { color: t.color, token: t.id })" />
                      <span class="vsep" aria-hidden="true" />
                      <span class="op"><input :key="'a' + e.color" class="pct" :value="Math.round(alpha(e.color) * 100)" inputmode="numeric" :aria-label="tr('Shadow opacity')" @change="(ev) => { const a = Number((ev.target as HTMLInputElement).value.replace('%', '')); if (Number.isFinite(a)) set(i, { color: withAlpha(hex(e.color), Math.min(100, Math.max(0, a)) / 100) }) }" @keydown="blur"><i class="unit">%</i></span>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </Teleport>
      </div>
    </template>

    <!-- Effect styles: 디자인 시스템 그림자(피그마와 같아요) -->
    <Teleport v-if="stylesOpen" to="body">
      <div ref="stylesEl" v-front class="sq fx-pop st-pop editor" role="dialog" :aria-label="tr('Effect styles')" :style="stylesPos">
        <div class="pop-h"><span class="pop-t">{{ tr('Effect styles') }}</span><button type="button" class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="stylesOpen = false"><EditorIcon name="close" :size="16" /></button></div>
        <div class="st-s"><label class="sq st-q"><EditorIcon name="search" :size="16" class="muted" /><input v-model="q" :placeholder="tr('Search')" :aria-label="tr('Search effect styles')" spellcheck="false"></label></div>
        <div class="st-l">
          <div class="st-g">바드림 Design System</div>
          <button v-for="t in shadowStyles" :key="t.id" type="button" :class="['sq', 'st-row', { on: t.id === boundId }]" :data-tip="t.value" @click="applyStyle(t)">
            <span class="sq st-pv" :style="{ boxShadow: t.css }" />
            <span class="nm">{{ t.name }}</span>
          </button>
          <p v-if="!shadowStyles.length" class="tx-meta m0 st-empty">{{ tr('No styles found') }}</p>
        </div>
      </div>
    </Teleport>
    <div v-if="drag" class="row-drop" :style="{ top: drag.y + 'px', left: drag.x + 'px', width: drag.w + 'px' }" />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.h24 { height: 24px; padding: 0; }
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.acts { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.s24 { width: 24px; height: 24px; }
.m0 { margin: 0; }
.muted { color: var(--sys-color-neutral-500); }
/* 피그마 Effects 행: [아이콘 + 이름] 8 [👁 24][− 24] — Fill 행과 같은 열 */
.prow { display: grid; grid-template-columns: minmax(0, 1fr) 24px 24px; gap: 0; align-items: center; min-width: 0; }
.prow > .efb { margin-right: var(--ref-spacing-06); }
.prow.off .efb { opacity: 0.45; }
/* 행 칸(누르면 설정 창): 회색 칸, 연 칸은 옅은 파랑 + 파란 선(피그마와 같아요) */
.efb { display: flex; align-items: center; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-06); min-width: 0; text-align: left; cursor: default; }
.efb .ic { flex: none; color: var(--sys-color-neutral-700); }
.efb .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sys-color-neutral-800); }
.efb.on { --sq-fill: var(--iris-sel); --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.efb.on .nm, .efb.on .ic { color: var(--sys-color-brand-primary-default); }
/* 누른 뒤 포커스만 남은 칸은 보통 모습(파란 선은 연 동안만) — 키보드 포커스는 바깥 링 */
.efb:not(.on):focus-within { --sq-line: transparent; }
.prow.bound .efb:not(.on):focus-within { --sq-line: var(--iris-line-strong); }
.efb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.prow.bound .efb { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.prow.bound .efb.on { --sq-fill: var(--iris-sel); --sq-line: var(--sys-color-brand-primary-default); }
/* 설정 창: 폭 240 · 머리 40(아래 선) · 본문 안쪽 12 · 줄 사이 8 · [이름 72 | 값] */
.fx-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; text-align: left; }
.pop-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pop-k { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; color: var(--sys-color-neutral-800); }
.pop-k :deep(.inl) { font-size: 12px; font-weight: 600; color: var(--sys-color-neutral-800); }
/* 종류 ▾: 처음부터 꺾쇠가 보여요(피그마와 같아요) */
.pop-k :deep(.inl .cv) { display: block; }
.pop-k :deep(.inl) { height: 24px; padding: 0 var(--ref-spacing-03) 0 var(--ref-spacing-04); gap: var(--ref-spacing-03); }
.pop-t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); }
.pop-b { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.row { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.lb { color: var(--sys-color-neutral-500); white-space: nowrap; }
.row .fld { gap: var(--ref-spacing-04); }
.row .fld input { flex: 1; min-width: 0; padding: 0; }
.k { flex: none; width: 16px; text-align: center; color: var(--sys-color-neutral-500); }
.pf { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); min-width: 0; }
.pf.bound { padding-right: var(--ref-spacing-06); }
/* 좁은 칸: 변수 버튼은 올리거나 입력 중일 때만 자리를 차지해요(색 값이 잘리지 않게) */
.pf:not(:hover):not(:focus-within) > :deep(.reveal) { display: none; }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* Effect styles 창: 검색(이리스 검색칸) · 묶음 이름 · 행 32(연결된 스타일은 옅은 파랑) */
.st-pop { max-height: min(440px, calc(100vh - 16px)); }
.st-s { flex: none; padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-04); }
.st-q { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; box-sizing: border-box; padding: 0 var(--ref-spacing-06); border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); cursor: text; }
.st-q input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; font: inherit; color: var(--sys-color-neutral-800); }
.st-q input::placeholder { color: var(--sys-color-neutral-500); }
.st-q:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.st-l { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--ref-spacing-04) 0 var(--ref-spacing-04); display: flex; flex-direction: column; }
.st-g { padding: var(--ref-spacing-04) var(--ref-spacing-08); font-weight: 600; color: var(--sys-color-neutral-800); }
.st-row { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 32px; padding: 0 var(--ref-spacing-08); border-radius: 0; text-align: left; color: var(--sys-color-neutral-800); }
.st-row:hover { --sq-fill: var(--sys-color-neutral-100); }
.st-row.on { --sq-fill: var(--iris-sel); }
.st-pv { flex: none; width: 14px; height: 14px; border-radius: 3px; --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.st-row .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-empty { padding: var(--ref-spacing-06) var(--ref-spacing-08); }
</style>
