<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ScreenRow } from '~/composables/useEditor'
import type { LayerStyle } from '~/canvas/schema'
import type { CatalogToken } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import InspectorGrids from '~/components/editor/InspectorGrids.vue'
import InspectorPaints from '~/components/editor/InspectorPaints.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import StrokeSettings from '~/components/editor/StrokeSettings.vue'
import { useContextMenu } from '~/composables/useContextMenu'
import InspectorEffects from '~/components/editor/InspectorEffects.vue'
import CornerSmoothing from '~/components/editor/CornerSmoothing.vue'
import InspectorSelectionColors from '~/components/editor/InspectorSelectionColors.vue'
import ArrangeControls from '~/components/editor/ArrangeControls.vue'
import { currentGap, guessAxis, type ArrangeOp, type Rect } from '~/canvas/geom'

/** 오른쪽 패널 · 디자인 탭: 화면(프레임) 이름 · 상태 · 위치 · 크기 · 모양(채우기 · 선 · 모서리 · 투명도 · 내용 자르기). 값을 바꾸면 캔버스에 바로 반영하고 저장합니다 */
/**
 * multi: 프레임을 여러 개 골랐을 때(피그마와 같아요) — 같은 패널을 그대로 보여 주고, 값이 서로 다르면 Mixed.
 * 고치면 고른 프레임 모두에 한꺼번에(실행취소 한 번). screen 은 그중 첫 프레임
 */
const props = defineProps<{ screen: ScreenRow; multi?: ScreenRow[] }>()
const emit = defineEmits<{ update: [patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>]; remove: []; arrange: [op: ArrangeOp]; step: [key: 'x' | 'y' | 'width' | 'height', d: number] }>()
const all = computed<ScreenRow[]>(() => (props.multi && props.multi.length > 1 ? props.multi : [props.screen]))
const isMulti = computed(() => all.value.length > 1)
const ids = computed(() => all.value.map((s) => s.id))
/** 위치 · 크기: 모두 같으면 그 값, 다르면 null(Mixed) */
/** 소수는 둘째 자리까지(픽셀에 맞추기를 끄면 소수로 움직여요) */
const same = (key: 'x' | 'y' | 'width' | 'height') => { const v = all.value.map((s) => Math.round(s[key] * 100) / 100); return v.every((x) => x === v[0]) ? v[0]! : null }
// 여러 프레임 정렬 · 균등 분배 · 간격(Alignment)
const rects = computed<Rect[]>(() => all.value.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })))
const axis = computed(() => guessAxis(rects.value))
const gap = computed(() => currentGap(rects.value, axis.value))


function num(key: 'x' | 'y' | 'width' | 'height', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!input.value.trim() || !Number.isFinite(v) || ((key === 'width' || key === 'height') && v < 1)) { input.value = same(key) === null ? '' : String(same(key)); return }
  const r = Math.round(v * 100) / 100 // 소수도 그대로(둘째 자리까지)
  if (r === same(key)) return
  // 비율 잠금: W 를 바꾸면 H 도 같은 비율로(피그마와 같아요)
  if (ratioOn.value && (key === 'width' || key === 'height') && !isMulti.value) {
    const s = props.screen, k = r / (s[key] || 1)
    emit('update', key === 'width' ? { width: r, height: Math.max(1, Math.round(s.height * k * 100) / 100) } : { height: r, width: Math.max(1, Math.round(s.width * k * 100) / 100) })
    return
  }
  emit('update', { [key]: r })
}
/** 화면 비율 잠금(피그마 Lock aspect ratio) */
const ratioOn = computed(() => !!(store.doc(props.screen.id).frame ?? {}).lockRatio)
/** 화살표 키로 1씩(Shift 는 10씩) 바꾸기 */
function step(key: 'x' | 'y' | 'width' | 'height', e: KeyboardEvent) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const cur = same(key)
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  // 값이 서로 다르면(Mixed) 각자 값에 더해요(피그마와 같아요)
  if (cur === null) { emit('step', key, d); return }
  const v = Math.max(key === 'width' || key === 'height' ? 1 : -1e9, cur + d)
  if (ratioOn.value && (key === 'width' || key === 'height') && !isMulti.value) {
    const s = props.screen, k = v / (s[key] || 1)
    emit('update', key === 'width' ? { width: v, height: Math.max(1, Math.round(s.height * k * 100) / 100) } : { height: v, width: Math.max(1, Math.round(s.width * k * 100) / 100) })
    return
  }
  emit('update', { [key]: v })
}
// --- 화면 모양: 레이어와 같은 방식(토큰 연결 포함). 기본은 흰 바탕 · 선 없음 · 모서리 0 ---
const store = useLayerStore()
const native = computed(() => all.value.every((s) => s.source === 'native'))
const look = computed<LayerStyle>(() => store.doc(props.screen.id).frame ?? {})
const fstyle = (patch: Partial<LayerStyle>, vars?: Record<string, string | null>) => store.batch(() => { for (const id of ids.value) store.frameStyle(id, patch, vars) })
/** 고른 프레임들의 모양 값이 서로 다른지(Mixed) */
const looks = computed<LayerStyle[]>(() => ids.value.map((id) => store.doc(id).frame ?? {}))
const differs = (fn: (l: LayerStyle) => unknown) => looks.value.some((l) => JSON.stringify(fn(l) ?? null) !== JSON.stringify(fn(looks.value[0]!) ?? null))
const mixOpacity = computed(() => differs((l) => [l.opacity, (l.vars as Record<string, string> | undefined)?.opacity]))
const mixRadius = computed(() => differs((l) => [l.radius, l.radii]))
const mixClip = computed(() => differs((l) => l.clip !== false))
const mixStroke = computed(() => differs((l) => [l.stroke, l.strokes]))
const mixGrids = computed(() => differs((l) => l.grids ?? []))
const vb = (key: string) => (look.value.vars as Record<string, string> | undefined)?.[key] ?? null
/** 선이 하나라도 있나(바탕 선 또는 덧붙인 선) */
const hasStroke = computed(() => !!(look.value.stroke || look.value.strokes?.length))
const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
/** 입력칸 공통: Esc 는 고치던 값을 버리고 칸에서 나가요(포커스할 때 값을 기억했다가 되돌리고, 그 사이 change 는 막아요) */
function onFocusIn(e: FocusEvent) { const t = e.target as HTMLInputElement; if (t.tagName === 'INPUT') t.dataset.orig = t.value }
function onEsc(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement
  if (e.key !== 'Escape' || t.tagName !== 'INPUT') return
  e.stopPropagation()
  t.dataset.esc = '1'
  t.value = t.dataset.orig ?? t.value
  t.blur()
  delete t.dataset.esc
}
function onChangeCap(e: Event) { if ((e.target as HTMLElement).dataset?.esc) e.stopPropagation() }
function setNumber(key: 'radius' | 'strokeWidth' | 'opacity', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = numText(key); return }
  if (key === 'opacity') fstyle({ opacity: Math.min(1, Math.max(0, v / 100)) })
  else fstyle({ [key]: Math.max(key === 'strokeWidth' ? 0.5 : 0, Math.round(v * 10) / 10), ...(key === 'radius' ? { radii: undefined } : {}) })
}
function stepNumber(key: 'radius' | 'strokeWidth' | 'opacity', d: number) {
  if (key === 'opacity') fstyle({ opacity: Math.min(1, Math.max(0, Math.round(((look.value.opacity ?? 1) * 100 + d)) / 100)) })
  else fstyle({ [key]: Math.max(key === 'strokeWidth' ? 0.5 : 0, (look.value[key] ?? 0) + d), ...(key === 'radius' ? { radii: undefined } : {}) })
}
function keyStep(key: 'radius' | 'strokeWidth' | 'opacity', e: KeyboardEvent) {
  blurOnEnter(e)
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  stepNumber(key, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}
const numText = (key: 'radius' | 'strokeWidth' | 'opacity') => String(key === 'opacity' ? Math.round((look.value.opacity ?? 1) * 100) : Math.round((look.value[key] ?? 0) * 10) / 10)
function pickNum(key: 'radius' | 'strokeWidth' | 'opacity', t: CatalogToken) { fstyle({ [key]: t.num!, ...(key === 'radius' ? { radii: undefined } : {}) }, { [key]: t.id }) }
function unbindKey(key: string) { fstyle({}, { [key]: null }) }

// --- 모서리: 레이어와 같아요 — 하나로 · 모서리마다(Independent corners) · Corner smoothing ---
const CORNER_KEYS = ['radii.0', 'radii.1', 'radii.2', 'radii.3'] as const
const CORNER_LABEL = ['Top left radius', 'Top right radius', 'Bottom right radius', 'Bottom left radius']
const separate = computed(() => !!look.value.radii)
const radiiNow = computed<[number, number, number, number]>(() => { const r = look.value.radius ?? 0; return look.value.radii ?? [r, r, r, r] })
const allCorners = computed(() => (radiiNow.value.every((v) => v === radiiNow.value[0]) ? radiiNow.value[0] : 'Mixed'))
const vbCorners = computed(() => { const v = CORNER_KEYS.map((k) => vb(k)); return v.every((x) => x === v[0]) ? v[0]! : null })
/** 다른 모서리 연결은 그대로 두고 i 번째만 id(없으면 풀기) */
const cornerVars = (i: number | null, id: string | null) => Object.fromEntries(CORNER_KEYS.map((k, j) => [k, j === i ? id : i === null ? id : vb(k)]))
function toggleCorners() {
  if (!separate.value) {
    const r = look.value.radius ?? 0
    fstyle({ radii: [r, r, r, r] }, cornerVars(null, vb('radius')))
  } else {
    const r0 = radiiNow.value[0]
    fstyle({ radii: undefined, radius: r0 }, { ...cornerVars(null, null), radius: vb('radii.0') })
  }
}
function setCorner(e: Event, i: number | null) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = i === null ? (allCorners.value === 'Mixed' ? '' : String(allCorners.value)) : String(radiiNow.value[i]); return }
  const n = Math.max(0, Math.round(v * 10) / 10)
  const r = [...radiiNow.value] as [number, number, number, number]
  if (i === null) r.fill(n); else r[i] = n
  fstyle({ radii: r }, cornerVars(i, null))
}
function stepCorner(i: number | null, d: number) {
  const r = radiiNow.value.map((v, j) => (i === null || j === i ? Math.max(0, v + d) : v)) as [number, number, number, number]
  fstyle({ radii: r }, cornerVars(i, null))
}
function cornerKey(i: number | null, e: KeyboardEvent) {
  blurOnEnter(e)
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  stepCorner(i, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}
function pickCorner(i: number | null, t: CatalogToken) {
  const r = [...radiiNow.value] as [number, number, number, number]
  if (i === null) r.fill(t.num!); else r[i] = t.num!
  fstyle({ radii: r }, cornerVars(i, t.id))
}
// --- Stroke 설정(레이어 Stroke 와 같아요): 위치 · 두께 · 세부 설정 창 · 변마다 두께 ---
const mixAlign = computed(() => differs((l) => l.strokeAlign ?? 'inside'))
const mixWeight = computed(() => differs((l) => l.strokeWidth ?? 0))
const strokeOpen = ref(false)
const strokeBtn = ref<HTMLElement | null>(null)
watch(() => ids.value.join(), () => { strokeOpen.value = false })
/** 프레임마다 다른 값으로 고치기(실행취소 한 번) */
const fEach = (fn: (l: LayerStyle) => Partial<LayerStyle>) => store.batch(() => { for (const id of ids.value) store.frameStyle(id, fn(store.doc(id).frame ?? {})) })
const SIDE_KEYS = ['top', 'right', 'bottom', 'left'] as const
const SIDE_LABEL = ['Top', 'Right', 'Bottom', 'Left']
type SideMode = 'all' | 'top' | 'right' | 'bottom' | 'left' | 'custom'
const sideMode = computed<SideMode>(() => {
  const sd = look.value.strokeSides
  if (!sd) return 'all'
  const on = sd.map((x) => x > 0)
  return on.filter(Boolean).length === 1 ? SIDE_KEYS[on.indexOf(true)]! : 'custom'
})
const sidesIcon = computed(() => {
  const sd = look.value.strokeSides
  if (!sd) return 'stroke_all'
  const on = sd.map((x) => x > 0)
  if (on.filter(Boolean).length === 1) return `stroke_${SIDE_KEYS[on.indexOf(true)]!}`
  return `stroke_sides_${on.map((b) => (b ? 1 : 0)).join('')}`
})
const sidesNow = computed(() => { const w = look.value.strokeWidth ?? 1; return look.value.strokeSides ?? [w, w, w, w] })
function setSideMode(m: SideMode) {
  fEach((l) => {
    const w = l.strokeWidth || 1
    return { strokeSides: m === 'all' ? undefined : m === 'custom' ? [w, w, w, w] : (SIDE_KEYS.map((k) => (k === m ? w : 0)) as [number, number, number, number]) }
  })
}
const ctxMenu = useContextMenu()
function sidesMenu(e: MouseEvent) {
  // Custom(변마다 칸이 열린 상태)에서 다시 누르면 칸을 닫고 네 변 모두(All)로 — 두께는 가장 두꺼운 변
  if (sideMode.value === 'custom') { setSideMode('all'); return }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const at = { clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} } as unknown as MouseEvent
  const icon = (m: SideMode) => (m === 'all' ? 'stroke_all' : m === 'custom' ? (sideMode.value === 'custom' ? sidesIcon.value : 'stroke_sides_1111') : `stroke_${m}`)
  const item = (m: SideMode, label: string) => ({ label: (sideMode.value === m ? '✓ ' : '') + tr(label), icon: { name: icon(m) }, action: () => setSideMode(m) })
  ctxMenu.open(at, [item('all', 'All'), item('top', 'Top'), item('bottom', 'Bottom'), item('left', 'Left'), item('right', 'Right'), 'sep' as const, item('custom', 'Custom')])
}
/** 두께를 바꾸면 켜진 변들도 같은 두께로(꺼진 변은 그대로 0) */
const syncSides = () => fEach((l) => (l.strokeSides ? { strokeSides: l.strokeSides.map((x) => (x > 0 ? l.strokeWidth ?? 1 : 0)) as [number, number, number, number] } : {}))
const onWeight = (e: Event) => store.batch(() => { setNumber('strokeWidth', e); syncSides() })
function weightKey(e: KeyboardEvent) {
  blurOnEnter(e)
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  // 여러 프레임 두께가 다르면 각자 값에 더해요
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  store.batch(() => { fEach((l) => ({ strokeWidth: Math.max(0.5, (l.strokeWidth ?? 0) + d) })); syncSides() })
}
/** Custom 한 변: 두께(strokeWidth)는 가장 두꺼운 변 */
function setSideAt(i: number, fn: (cur: number) => number) {
  fEach((l) => {
    const w = l.strokeWidth ?? 1
    const sd = [...(l.strokeSides ?? [w, w, w, w])] as [number, number, number, number]
    sd[i] = fn(sd[i]!)
    return { strokeSides: sd, strokeWidth: Math.max(...sd) || l.strokeWidth }
  })
}
function setSide(i: number, e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.]/g, ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = String(sidesNow.value[i]); return }
  setSideAt(i, () => Math.max(0, Math.round(v * 10) / 10))
}
function sideKey(i: number, e: KeyboardEvent) {
  blurOnEnter(e)
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  setSideAt(i, (cur) => Math.max(0, cur + d))
}
const smoothOpen = ref(false)
const smoothBtn = ref<HTMLElement[] | HTMLElement | null>(null)
const smoothBtnEl = computed(() => (Array.isArray(smoothBtn.value) ? smoothBtn.value[0] ?? null : smoothBtn.value))
const smoothNow = computed(() => Math.round((look.value.smoothing ?? 0) * 100))
const holdAll = () => { for (const id of ids.value) store.hold(id) }
const releaseAll = () => store.batch(() => { for (const id of ids.value) store.release(id) })
const setSmoothing = (v: number) => fstyle({ smoothing: v > 0 ? v / 100 : undefined })
watch(() => props.screen.id, () => { smoothOpen.value = false })

</script>

<template>
  <div class="design" @focusin="onFocusIn" @keydown="onEsc" @change.capture="onChangeCap">
    <!-- 머리(피그마 UI3): 종류 이름만 — 이름은 레이어 목록 · 캔버스 이름표에서, 상태 · 크기 프리셋은 빼요 -->
    <section class="s first"><div class="head"><span class="ttl">{{ tr('Frame') }}</span></div></section>

    <section class="s">
      <div class="sec-h h24"><span>{{ tr('Position') }}</span></div>
      <template v-if="isMulti">
        <div class="ig-l"><span>{{ tr('Alignment') }}</span></div>
        <ArrangeControls :count="all.length" :gap="gap" :axis="axis" @op="emit('arrange', $event)" />
        <div class="ig-l"><span>{{ tr('Position') }}</span></div>
      </template>
      <div class="ig">
        <label class="sq fld"><span>X</span><input :key="'x' + same('x')" :value="same('x') ?? ''" :placeholder="same('x') === null ? tr('Mixed') : ''" inputmode="decimal" aria-label="X" @change="num('x', $event)" @keydown="step('x', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>Y</span><input :key="'y' + same('y')" :value="same('y') ?? ''" :placeholder="same('y') === null ? tr('Mixed') : ''" inputmode="decimal" aria-label="Y" @change="num('y', $event)" @keydown="step('y', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <span />
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>{{ tr('Layout') }}</span></div>
      <div class="ig-l"><span>{{ tr('Dimensions') }}</span></div>
      <div class="ig">
        <label class="sq fld"><span>W</span><input :key="'w' + same('width')" :value="same('width') ?? ''" :placeholder="same('width') === null ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Width')" @change="num('width', $event)" @keydown="step('width', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>H</span><input :key="'h' + same('height')" :value="same('height') ?? ''" :placeholder="same('height') === null ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Height')" @change="num('height', $event)" @keydown="step('height', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <button v-if="!isMulti" :class="['ib', 's24', 'tog', { on: ratioOn }]" :aria-pressed="ratioOn" :aria-label="ratioOn ? tr('Unlock aspect ratio') : tr('Lock aspect ratio')" :title="ratioOn ? tr('Unlock aspect ratio') : tr('Lock aspect ratio')" @click="store.frameStyle(screen.id, { lockRatio: ratioOn ? undefined : true })">
          <EditorIcon :name="ratioOn ? 'ratio_locked' : 'ratio_unlocked'" />
        </button>
        <span v-else />
      </div>
      <button v-if="native" :class="['cb', { on: !mixClip && look.clip !== false, mix: mixClip }]" role="checkbox" :aria-checked="mixClip ? 'mixed' : look.clip !== false" @click="fstyle({ clip: !mixClip && look.clip !== false ? false : undefined })"><i class="sq" />{{ tr('Clip content') }}</button>
    </section>

    <template v-if="native">
      <section class="s">
        <div class="sec-h h24"><span>{{ tr('Appearance') }}</span></div>
        <div class="ig-l"><span>{{ tr('Opacity') }}</span><span>{{ tr('Corner radius') }}</span></div>
        <div class="ig">
          <label class="sq fld u"><EditorIcon name="var_opacity" :size="16" /><template v-if="!vb('opacity')"><input :key="'o' + numText('opacity') + mixOpacity" :value="mixOpacity ? '' : numText('opacity')" :placeholder="mixOpacity ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Frame opacity')" @change="setNumber('opacity', $event)" @keydown="keyStep('opacity', $event)"><span class="unit">%</span></template><TokenPicker :kinds="['opacity']" :bound="vb('opacity')" reveal label="Frame opacity" @pick="(t) => pickNum('opacity', t)" @unbind="unbindKey('opacity')" @step="(d) => stepNumber('opacity', d)" /></label>
          <label v-if="separate" class="sq fld"><EditorIcon name="var_radius" :size="16" /><input v-if="!vbCorners" :key="'all' + String(allCorners)" :value="allCorners === 'Mixed' ? '' : allCorners" :placeholder="allCorners === 'Mixed' ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Frame corner radius')" @change="setCorner($event, null)" @keydown="cornerKey(null, $event)"><TokenPicker :kinds="['radius']" :bound="vbCorners" reveal label="Frame corner radius" @pick="(t) => pickCorner(null, t)" @unbind="fstyle({}, cornerVars(null, null))" @step="(d) => stepCorner(null, d)" /></label>
          <label v-else class="sq fld"><EditorIcon name="var_radius" :size="16" /><input v-if="!vb('radius')" :key="'r' + numText('radius') + mixRadius" :value="mixRadius ? '' : numText('radius')" :placeholder="mixRadius ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Frame corner radius')" @change="setNumber('radius', $event)" @keydown="keyStep('radius', $event)"><TokenPicker :kinds="['radius']" :bound="vb('radius')" reveal label="Frame corner radius" @pick="(t) => pickNum('radius', t)" @unbind="unbindKey('radius')" @step="(d) => stepNumber('radius', d)" /></label>
          <button :class="['ib', 's24', 'tog', { on: separate }]" :aria-pressed="separate" :aria-label="tr('Independent corners')" :title="tr('Independent corners')" @click="toggleCorners"><EditorIcon name="corner_independent" /></button>
        </div>
        <template v-if="separate">
          <!-- 피그마 순서: ┌ ┐ / └ ┘ -->
          <div v-for="row in ([[0, 1], [3, 2]] as const)" :key="row[0]" class="ig"><label v-for="i in row" :key="i" class="sq fld" :title="tr(CORNER_LABEL[i]!)"><EditorIcon name="var_radius" :size="16" :style="{ transform: `rotate(${i * 90}deg)` }" /><input v-if="!vb(CORNER_KEYS[i]!)" :key="'c' + i + radiiNow[i]" :value="radiiNow[i]" inputmode="numeric" :aria-label="tr(CORNER_LABEL[i]!)" @change="setCorner($event, i)" @keydown="cornerKey(i, $event)"><TokenPicker :kinds="['radius']" :bound="vb(CORNER_KEYS[i]!)" reveal short :label="CORNER_LABEL[i]" @pick="(t) => pickCorner(i, t)" @unbind="fstyle({}, { [CORNER_KEYS[i]!]: null })" @step="(d) => stepCorner(i, d)" /></label><button v-if="row[0] === 3" ref="smoothBtn" :class="['ib', 's24', 'tog', { on: smoothOpen || smoothNow > 0 }]" :aria-pressed="smoothOpen" :aria-label="tr('Corner smoothing')" :title="tr('Corner smoothing')" @click="smoothOpen = !smoothOpen"><EditorIcon name="corner_smoothing" /></button><span v-else /></div>
        </template>
        <CornerSmoothing v-if="smoothOpen && separate" :anchor="smoothBtnEl" :value="smoothNow" @update="setSmoothing" @start="holdAll" @end="releaseAll" @close="smoothOpen = false" />
      </section>

      <InspectorPaints :sid="screen.id" :sids="ids" :ids="[]" kind="fill" title="Fill" frame />

      <!-- Stroke: Fill 과 같은 칠 목록(견본 · HEX | % · 👁 · −, 여러 칠 · 스타일) + 선 설정(피그마와 같아요: Position · Weight · ⚙ 세부 설정 · ▢ 변마다) -->
      <InspectorPaints :sid="screen.id" :sids="ids" :ids="[]" kind="stroke" title="Stroke" frame>
        <template v-if="hasStroke && !mixStroke">
          <div class="ig-l ig4"><span>{{ tr('Position') }}</span><span>{{ tr('Weight') }}</span></div>
          <div class="ig ig4">
            <EditorSelect :model-value="mixAlign ? null : look.strokeAlign ?? 'inside'" :options="[{ value: 'center', label: 'Center' }, { value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }]" ariaLabel="Stroke position" placeholder="Mixed" @update:model-value="(v) => fstyle({ strokeAlign: v === 'inside' ? undefined : (v as LayerStyle['strokeAlign']) })" />
            <label class="sq fld u" :title="tr('Stroke weight')"><EditorIcon name="stroke_weight" class="keep" /><template v-if="!vb('strokeWidth')"><input :key="'w' + numText('strokeWidth') + mixWeight" :value="mixWeight ? '' : numText('strokeWidth')" :placeholder="mixWeight ? tr('Mixed') : ''" inputmode="decimal" :aria-label="tr('Frame stroke weight')" @change="onWeight($event)" @keydown="weightKey($event)"><span v-if="!mixWeight" class="unit">px</span></template><TokenPicker :kinds="['borderWidth']" :bound="vb('strokeWidth')" reveal label="Frame stroke weight" @pick="(t) => store.batch(() => { pickNum('strokeWidth', t); syncSides() })" @unbind="unbindKey('strokeWidth')" @step="(d) => store.batch(() => { stepNumber('strokeWidth', d); syncSides() })" /></label>
            <span class="ig4-acts">
              <button ref="strokeBtn" type="button" :class="['ib', 's24', 'tog', { on: strokeOpen }]" :aria-expanded="strokeOpen" aria-haspopup="dialog" :aria-label="tr('Stroke settings')" :data-tip="tr('Stroke settings')" @click="strokeOpen = !strokeOpen"><EditorIcon name="filter" /></button>
              <button type="button" :class="['ib', 's24', 'tog', { on: sideMode !== 'all' }]" aria-haspopup="menu" :aria-label="tr('Individual strokes')" :data-tip="tr('Individual strokes')" @click="sidesMenu"><EditorIcon :name="sidesIcon" class="keep" /></button>
            </span>
          </div>
          <!-- Custom: 변마다 두께 [왼쪽 · 위] [오른쪽 · 아래](피그마 순서) -->
          <template v-if="sideMode === 'custom'">
            <div v-for="row in ([[3, 0], [1, 2]] as const)" :key="row[0]" class="ig">
              <label v-for="i in row" :key="i" class="sq fld" :title="tr(SIDE_LABEL[i]!)"><EditorIcon :name="`stroke_${SIDE_KEYS[i]!}`" class="keep" /><input :key="'sd' + i + sidesNow[i]" :value="sidesNow[i]" inputmode="decimal" :aria-label="tr(SIDE_LABEL[i]!)" @change="setSide(i, $event)" @keydown="sideKey(i, $event)"></label>
              <span />
            </div>
          </template>
          <StrokeSettings v-if="strokeOpen" :anchor="strokeBtn" :styles="looks" :open-path="false" default-join="miter" default-cap="butt" @set="(p) => fstyle(p)" @close="strokeOpen = false" />
        </template>
      </InspectorPaints>

      <InspectorEffects :sid="screen.id" :sids="ids" :ids="[]" frame />

      <!-- 프레임 안에 쓰인 색(피그마 Selection colors) — 색이 많아서 처음엔 버튼만 -->
      <InspectorSelectionColors :targets="ids.map((id) => ({ sid: id, ids: [] }))" lazy />

      <InspectorGrids :grids="look.grids ?? []" :mixed="mixGrids" @change="(g) => fstyle({ grids: g })" />
    </template>

  </div>
</template>

<style scoped>
.design { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s.first { padding-bottom: var(--ref-spacing-08); }
.head { display: flex; align-items: center; justify-content: space-between; height: 28px; min-width: 0; }
/* 제목: 컴포넌트 이름 · 레이어 머리와 같은 14 / 22 */
.ttl { font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-neutral-800); }
/* 뒤에 Scale · Export 칸이 이어지면 아래 여백은 맨 끝 칸이 가져요(사이에 빈 공간이 생기지 않게) */
.design:not(:last-child) { padding-bottom: 0; }
/* 섹션: 위 12 · 옆 16 · 아래 16, 줄 사이 8 (PRD 07 §2.4) */
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.s:first-child { box-shadow: none; }
.s:has(> .sec-h.empty:only-child) { padding-bottom: var(--ref-spacing-08); }
.h24 { height: 28px; padding: 0; }
.sec-h.empty > span:first-child { color: var(--sys-color-neutral-500); }
.s24 { width: 28px; height: 28px; }
/* 단위(% px)는 숫자 바로 뒤에 */
.design .ig .fld.u > input { flex: 0 1 auto; width: auto; field-sizing: content; min-width: 1ch; max-width: 100%; }
.fld.u > .unit { flex: 1 1 0; min-width: 0; margin-left: calc(var(--ref-spacing-03) * -1); color: var(--sys-color-neutral-500); }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { --sq-line: var(--sys-color-neutral-600); }
.cb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.m0 { margin: 0; }
/* Stroke 줄(레이어 Stroke 와 같아요): [Position][Weight][⚙ · ▢] — Position ▾ 는 흰 바탕 + 테두리 */
.ig4 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 56px !important; }
.ig4-acts { display: flex; align-items: center; }
.ig4 > :deep(.esel) > .dd { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.ig4 > :deep(.esel) > .dd.open { --sq-line: var(--sys-color-brand-primary-default); }
/* 자르기 Mixed: 상자 안 가로줄(피그마와 같아요) */
.cb.mix > i::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 6h6' stroke='%23202837' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-position: center; background-size: 12px; background-repeat: no-repeat; }
</style>
