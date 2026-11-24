<script setup lang="ts">
import { fmtNum } from '~/canvas/num'
import CornerSmoothing from '~/components/editor/CornerSmoothing.vue'
import { readCompStroke, type CompStroke } from '~/canvas/compStroke'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { normAngle, ratioLocked, TYPE_LABEL, type BindKey, type LayerNode, type LayerStyle } from '~/canvas/schema'
import { colorLabel, parseColor, useTokenCatalog, WEIGHT_LABEL, type CatalogToken } from '~/canvas/tokens'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import TextDetails from '~/components/editor/TextDetails.vue'
import { useLayerStore } from '~/canvas/store'
import { currentGap, guessAxis, type ArrangeOp } from '~/canvas/geom'
import ArrangeControls from '~/components/editor/ArrangeControls.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import InspectorPaints from '~/components/editor/InspectorPaints.vue'
import InspectorEffects from '~/components/editor/InspectorEffects.vue'
import InspectorAutoLayout from '~/components/editor/InspectorAutoLayout.vue'
import { consShown, setConsShown } from '~/canvas/prefs'
import InspectorInstance from '~/components/editor/InspectorInstance.vue'
import InspectorGrids from '~/components/editor/InspectorGrids.vue'
import { isPageCanvas } from '~/composables/useEditor'
import type { Constraints, Sizing } from '~/canvas/schema'
import { BLEND_MODES, defaultAlign } from '~/canvas/paint'
import { isContainer, isVector } from '~/canvas/schema'

/**
 * 오른쪽 패널 · 디자인 탭(레이어를 골랐을 때): 위치 · 크기(비율 고정) · 회전 · 뒤집기 · 정렬 · 균등 분배 · 모양(모서리 따로) · 채우기 · 선 · 텍스트 · 순서
 * 값마다 디자인 시스템 변수(토큰)를 연결할 수 있어요(TokenPicker). 연결하면 입력칸 대신 토큰 칩이 보입니다.
 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ 'replace-image': [id: string] }>()
const store = useLayerStore()
const catalog = useTokenCatalog()

const sid = computed(() => props.screen.id)
const ids = computed(() => store.layerIds.value)
const nodes = computed(() => ids.value.map((id) => store.node(sid.value, id)).filter((n): n is LayerNode => !!n))
const one = computed(() => (nodes.value.length === 1 ? nodes.value[0]! : null))
const types = computed(() => new Set(nodes.value.map((n) => n.type)))
const has = (...t: LayerNode['type'][]) => t.some((x) => types.value.has(x))
/** 고른 레이어들의 값이 모두 같으면 그 값, 다르면 'Mixed' */
function same<T>(get: (n: LayerNode) => T): T | 'Mixed' {
  const v = nodes.value.map(get)
  return v.every((x) => x === v[0]) ? v[0]! : 'Mixed'
}
const show = (v: unknown) => (v === 'Mixed' ? '' : v === undefined || v === null ? '' : String(typeof v === 'number' ? Math.round(v * 100) / 100 : v))
/** 위치 · 크기 · 각도: 피그마처럼 정수로 보여 줘요(실제 값은 소수 그대로) — app/canvas/num.ts */
const showG = (v: unknown) => (typeof v === 'number' ? fmtNum(v) : show(v))

/** 크기 바꾸기: 비율을 고정했으면 다른 쪽도 같은 비율로 */
function sized(n: LayerNode, key: 'w' | 'h', v: number): Partial<LayerNode> {
  const val = Math.max(1, Math.round(v))
  const patch: Partial<LayerNode> = { [key]: val }
  if (ratioLocked(n) && n.w > 0 && n.h > 0) {
    if (key === 'w') patch.h = Math.max(1, Math.round((n.h * val) / n.w))
    else patch.w = Math.max(1, Math.round((n.w * val) / n.h))
  }
  if (n.type === 'text' && patch.w !== undefined) n.style.autoWidth = false
  return patch
}
function setNum(key: 'x' | 'y' | 'w' | 'h', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = showG(same((n) => (key === 'w' || key === 'h' ? dim(n, key) : n[key]))); return }
  if (key === 'w' || key === 'h') store.sizeTo(sid.value, ids.value, (n) => ({ ...sized(n, key, v), ...(key === 'w' ? (n.sizeH && n.sizeH !== 'fixed' ? { sizeH: 'fixed' as const } : {}) : (n.sizeV && n.sizeV !== 'fixed' ? { sizeV: 'fixed' as const } : {})) }))
  else store.update(sid.value, ids.value, { [key]: Math.max(-1e6, Math.round(v)) })
}
/** 화면에 그려진 크기: 글자는 내용에 맞춰 늘고 줄어서(Hug · Auto width) 캔버스처럼 DOM 에서 재요(EditorCanvas layerSize 와 같아요) */
const measureTick = ref(0)
watch(nodes, () => nextTick(() => requestAnimationFrame(() => measureTick.value++)), { deep: true, immediate: true })
function dim(n: LayerNode, k: 'w' | 'h') {
  void measureTick.value
  if (n.type === 'text' && import.meta.client) {
    const el = document.querySelector(`[data-screen="${sid.value}"] [data-layer="${n.id}"]`) as HTMLElement | null
    if (el) return k === 'w' ? el.offsetWidth : el.offsetHeight
  }
  return n[k]
}
const locked = computed(() => same((n) => ratioLocked(n)) === true)
function toggleRatio() { const on = !locked.value; store.update(sid.value, ids.value, { lockRatio: on }) }

// 회전 · 뒤집기
function setRotation(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace('°', ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = showG(same((n) => n.rotation ?? 0)); return }
  store.update(sid.value, ids.value, { rotation: normAngle(v) || undefined })
}

// 모서리 따로
const separate = computed(() => same((n) => !!n.style.radii) === true)
/** Corner smoothing 0~100%(피그마와 같아요, 60 = iOS). 끄는 동안 기록 하나로(hold · release) */
const smoothNow = computed(() => same((n) => Math.round((n.style.smoothing ?? 0) * 100)))
function setSmoothing(v: number) {
  const k = Math.max(0, Math.min(100, Math.round(v))) / 100
  store.update(sid.value, ids.value, (n) => { const st = { ...n.style }; if (k > 0) st.smoothing = k; else delete st.smoothing; return { style: st } })
}
const smoothOpen = ref(false)
const smoothBtn = ref<HTMLElement[] | HTMLElement | null>(null)
const smoothBtnEl = computed(() => (Array.isArray(smoothBtn.value) ? smoothBtn.value[0] ?? null : smoothBtn.value))
watch(() => ids.value.join(), () => { smoothOpen.value = false })
function smoothInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) setSmoothing(v)
}
function toggleCorners() {
  const on = !separate.value
  store.update(sid.value, ids.value, (n) => {
    const r = n.style.radius ?? 0
    // 연결도 함께 옮겨요: 하나 → 네 모서리, 네 모서리 → 왼쪽 위 것
    const vars = { ...n.style.vars }
    if (on && vars.radius) for (const k of CORNER_KEYS) vars[k] = vars.radius
    if (!on) { if (vars['radii.0']) vars.radius = vars['radii.0']; else delete vars.radius; for (const k of CORNER_KEYS) delete vars[k] }
    const v = Object.keys(vars).length ? vars : undefined
    return { style: on ? { ...n.style, radii: [r, r, r, r], vars: v } : { ...n.style, radius: n.style.radii?.[0] ?? r, radii: undefined, vars: v } }
  })
}
const CORNER_KEYS = ['radii.0', 'radii.1', 'radii.2', 'radii.3'] as const
/** i: 0 왼쪽 위 · 1 오른쪽 위 · 2 오른쪽 아래 · 3 왼쪽 아래, 없으면 네 모서리 모두 */
function setCorner(e: Event, i?: number) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(i === undefined ? allCorners.value : corner(i)); return }
  const val = Math.max(0, Math.round(v * 10) / 10)
  store.update(sid.value, ids.value, (n) => {
    const cur = n.style.radii ?? [n.style.radius ?? 0, n.style.radius ?? 0, n.style.radius ?? 0, n.style.radius ?? 0]
    const radii = cur.map((r, k) => (i === undefined || i === k ? val : r)) as [number, number, number, number]
    return { style: { ...n.style, radii, radius: i === undefined ? val : n.style.radius } }
  })
}
const corner = (i: number) => same((n) => n.style.radii?.[i] ?? n.style.radius ?? 0)
const allCorners = computed(() => same((n) => (n.style.radii ? (n.style.radii.every((r) => r === n.style.radii![0]) ? n.style.radii[0] : 'Mixed') : n.style.radius ?? 0)))
const CORNER_LABEL = ['Top left', 'Top right', 'Bottom right', 'Bottom left']
function setStyle(key: keyof LayerStyle, value: LayerStyle[keyof LayerStyle]) { store.style(sid.value, ids.value, { [key]: value }) }
function setStyleNum(key: 'radius' | 'strokeWidth' | 'fontSize' | 'lineHeight' | 'letterSpacing', e: Event, min = 0) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(same((n) => n.style[key] ?? '')); return }
  setStyle(key, Math.max(min, Math.round(v * 100) / 100))
}
function setOpacity(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace('%', ''))
  if (!input.value.trim() || !Number.isFinite(v)) { input.value = show(same((n) => Math.round((n.style.opacity ?? 1) * 100))); return }
  setStyle('opacity', Math.min(1, Math.max(0, v / 100)))
}
function step(e: KeyboardEvent, apply: (d: number) => void) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  apply((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
}
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

// 색: '#RRGGBB' · 'rgb(…)' (옛 문서의 'token:<이름>' 은 그 토큰에 연결된 것으로 봅니다)
const menu = ref<string | null>(null)
const hex = (v?: string) => parseColor(store.color(v))?.hex ?? '#000000'
const label = (v?: string | 'Mixed') => (v === 'Mixed' ? 'Mixed' : !v ? 'None' : v.startsWith('token:') ? v.slice(6) : colorLabel(v))
function setHex(key: 'fill' | 'stroke' | 'color', e: Event) {
  let v = (e.target as HTMLInputElement).value.trim()
  if (!v) { setStyle(key, undefined); return }
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) setStyle(key, v.toUpperCase())
}

// --- 변수(토큰) 연결 ---
const COLOR_KEYS = ['fill', 'stroke', 'color'] as const
/** 레이어 하나의 연결 토큰 id */
function boundOf(n: LayerNode, key: BindKey): string | undefined {
  const v = n.style.vars?.[key]
  if (v) return v
  if ((COLOR_KEYS as readonly string[]).includes(key)) { const c = n.style[key as 'fill']; if (c?.startsWith('token:')) return 'db:' + c.slice(6) }
  return undefined
}
/** 고른 레이어들의 연결: 토큰 id · 'Mixed' · null */
const vb = (key: BindKey) => same((n) => boundOf(n, key)) ?? null
/** 모서리 따로일 때 '모두' 칸: 네 모서리가 같은 토큰이면 그것 */
const vbCorners = computed(() => { const v = CORNER_KEYS.map((k) => vb(k)); return v.every((x) => x === v[0]) ? v[0]! : 'Mixed' })
const S = () => [sid.value, ids.value] as const

function pickColor(key: 'fill' | 'stroke' | 'color', t: CatalogToken) {
  store.bind(...S(), key, t.id, () => ({ style: { [key]: t.color } }))
}
function pickNum(key: BindKey, t: CatalogToken) {
  const v = t.num!
  if (key === 'x' || key === 'y') store.bind(...S(), key, t.id, () => ({ node: { [key]: Math.round(v) } }))
  else if (key === 'w' || key === 'h') store.bind(...S(), key, t.id, (n) => ({ node: sized(n, key, v) }))
  else if (key === 'radius') {
    // 모서리 따로를 켠 레이어는 네 모서리 모두
    store.bind(...S(), separate.value ? [...CORNER_KEYS, 'radius'] : 'radius', t.id, (n) => ({ style: n.style.radii ? { radius: v, radii: [v, v, v, v] } : { radius: v } }))
  } else if (key.startsWith('radii.')) {
    const i = Number(key.slice(6))
    store.bind(...S(), key, t.id, (n) => {
      const r = n.style.radius ?? 0
      const radii = [...(n.style.radii ?? [r, r, r, r])] as [number, number, number, number]
      radii[i] = v
      return { style: { radii } }
    })
  } else store.bind(...S(), key, t.id, () => ({ style: { [key]: v } }))
}
// --- 글자: 피그마 Typography ---
const tsBound = computed(() => vb('textStyle'))
/** 스타일 떼기(피그마): 값은 그대로 두고, 스타일 안에 든 변수(크기 · 줄 높이 · 자간 · 굵기)를 칸마다 이어 줘요. 실행취소 한 번 */
function detachStyle() {
  store.hold(sid.value)
  for (const n of nodes.value) {
    const t = catalog.find(n.style.vars?.textStyle)
    store.unbind(sid.value, [n.id], 'textStyle')
    for (const [k, id] of Object.entries(t?.refs ?? {})) {
      const v = catalog.find(id)
      if (v?.num !== undefined) store.bind(sid.value, [n.id], k as BindKey, id, () => ({ style: { [k]: v.num } }))
    }
  }
  store.release(sid.value)
}
const ALIGN_LABEL = { left: 'Align left', center: 'Align center', right: 'Align right' } as const
const VALIGN_LABEL = { top: 'Align top', middle: 'Align middle', bottom: 'Align bottom' } as const
const textAlignNow = computed(() => same((n) => n.style.align ?? 'left'))
const valignNow = computed(() => same((n) => n.style.valign ?? 'top'))
const tdOpen = ref(false)
const tdBtn = ref<HTMLElement | null>(null)
watch(() => ids.value.join(), () => { if (!has('text')) tdOpen.value = false })
/** 굵기 ▾ · 크기 ▾ 메뉴 끝의 'Apply variable…' 로 여는 변수 목록(W/H 와 같은 방식) */
const typoVar: Record<'fontWeight' | 'fontSize', { show: () => void } | null> = { fontWeight: null, fontSize: null }
function setTypoRef(k: 'fontWeight' | 'fontSize', c: unknown) { typoVar[k] = c && typeof (c as { show?: unknown }).show === 'function' ? (c as { show: () => void }) : null }
const weightOptions = computed(() => [...weights.value.map((w) => ({ value: String(w), label: WEIGHT_LABEL(w) })), { value: VAR_OPT, label: 'Apply variable…', sep: true }])
function onWeight(v: string) { if (v === VAR_OPT) nextTick(() => typoVar.fontWeight?.show()); else setStyle('fontWeight', Number(v)) }
/** 크기 ▾: 자주 쓰는 크기(피그마 글자 크기 목록) */
const SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 64]
const sizeNow = computed(() => { const v = same((n) => n.style.fontSize ?? 16); return v === 'Mixed' ? null : String(v) })
const sizeOptionsT = computed(() => [...SIZES.map((z) => ({ value: String(z), label: String(z), short: '' })), { value: VAR_OPT, label: vb('fontSize') ? 'Change variable…' : 'Apply variable…', short: '', sep: true }])
function onSize(v: string) { if (v === VAR_OPT) nextTick(() => typoVar.fontSize?.show()); else setStyle('fontSize', Number(v)) }
function pickTextStyle(t: CatalogToken) {
  const x = t.text!
  store.bind(...S(), 'textStyle', t.id, () => ({ style: { fontSize: x.size, lineHeight: x.lineHeight, letterSpacing: x.letterSpacing, ...(x.weight ? { fontWeight: x.weight } : {}) } }))
}
function unbind(key: BindKey | BindKey[]) {
  const keys = Array.isArray(key) ? key : [key]
  // 옛 'token:<이름>' 색은 실제 색으로 바꿔 둡니다
  store.unbind(...S(), keys, (n) => {
    const style: Partial<LayerStyle> = {}
    for (const k of keys) if ((COLOR_KEYS as readonly string[]).includes(k) && n.style[k as 'fill']?.startsWith('token:')) style[k as 'fill'] = store.color(n.style[k as 'fill'])
    return { style }
  })
}
/** 연결된 칩에서 ↑↓: 값을 바꾸면 연결이 풀려요 */
function stepNum(key: 'x' | 'y' | 'w' | 'h', d: number) {
  store.update(sid.value, key === 'x' || key === 'y' ? store.topIds(sid.value, ids.value) : ids.value, (n) => (key === 'w' || key === 'h' ? sized(n, key, n[key] + d) : { [key]: n[key] + d }))
}
function stepStyle(key: 'radius' | 'strokeWidth' | 'fontSize' | 'lineHeight' | 'letterSpacing', d: number, min = 0) {
  store.update(sid.value, ids.value, (n) => ({ style: { ...n.style, [key]: Math.max(min, Math.round(((n.style[key] ?? 0) + d) * 100) / 100) } }))
}
function stepCorner(i: number, d: number) {
  store.update(sid.value, ids.value, (n) => { const r0 = n.style.radius ?? 0; const r = [...(n.style.radii ?? [r0, r0, r0, r0])] as [number, number, number, number]; r[i] = Math.max(0, r[i]! + d); return { style: { ...n.style, radii: r } } })
}
const stepOpacity = (d: number) => store.update(sid.value, ids.value, (n) => ({ style: { ...n.style, opacity: Math.min(1, Math.max(0, Math.round((n.style.opacity ?? 1) * 100 + d) / 100)) } }))

// 굵기: 디자인 시스템의 모든 굵기(+ 지금 쓰는 값)
const weights = computed(() => {
  const list = catalog.list(['fontWeight']).map((t) => t.num!)
  const base = list.length ? list : [400, 500, 600, 700]
  const cur = nodes.value.map((n) => n.style.fontWeight ?? 400)
  return [...new Set([...base, ...cur])].sort((a, b) => a - b)
})
const weightNow = computed(() => same((n) => n.style.fontWeight ?? 400))
// --- v7: 불리언 · 마스크 ---
/** 선택 머리의 순서 버튼(16 그리드): 맨 앞 · 앞 · 뒤 · 맨 뒤 */
const ARRANGE = [
  { label: 'Bring to front', key: '⌥⌘]', dir: 'top' as const, d: 'M8 13.5V6M4.5 9.5L8 6l3.5 3.5M3.5 2.5h9' },
  { label: 'Bring forward', key: '⌘]', dir: 1 as const, d: 'M8 13V3.5M4.5 7L8 3.5 11.5 7' },
  { label: 'Send backward', key: '⌘[', dir: -1 as const, d: 'M8 3v9.5M4.5 9L8 12.5 11.5 9' },
  { label: 'Send to back', key: '⌥⌘[', dir: 'bottom' as const, d: 'M8 2.5V10M4.5 6.5L8 10l3.5-3.5M3.5 13.5h9' },
]
const BOOL_OPS = [
  { k: 'union' as const, label: 'Union selection', key: '⌥⇧U', d: 'M2.5 2.5h7v4h4v7h-7v-4h-4z' },
  { k: 'subtract' as const, label: 'Subtract selection', key: '⌥⇧S', d: 'M2.5 2.5h7v4h-3v3h-4z' },
  { k: 'intersect' as const, label: 'Intersect selection', key: '⌥⇧I', d: 'M6.5 6.5h3v3h-3z' },
  { k: 'exclude' as const, label: 'Exclude selection', key: '⌥⇧E', d: 'M2.5 2.5h7v4h-3v3h-4zM9.5 6.5h4v7h-7v-4h3z' },
]
// --- v6: 크기 방식(Fixed · Hug · Fill) · 제약 · 오토 레이아웃 안 자리 무시 ---
const parentOf = (n: LayerNode) => (n.parentId ? store.node(sid.value, n.parentId) : undefined)
const inFlow = computed(() => nodes.value.every((n) => !!parentOf(n)?.style.layout))
const sizingOpts = (axis: 'w' | 'h') => {
  const cur = same((n) => Math.round(dim(n, axis)))
  const o: { k: Sizing; label: string }[] = [{ k: 'fixed', label: `${axis === 'w' ? 'Fixed width' : 'Fixed height'}${cur === 'Mixed' ? '' : ` (${cur})`}` }]
  // Hug: 자기 오토 레이아웃이 있거나 글자 · 인스턴스(내용 크기를 재요). 오토 레이아웃 없는 프레임의 Hug 는 레이아웃 엔진(canvas/layout.ts)이 아직 계산하지 않아요
  if (nodes.value.every((n) => !!n.style.layout || n.type === 'text' || n.type === 'instance')) o.push({ k: 'hug', label: 'Hug contents' })
  if (inFlow.value) o.push({ k: 'fill', label: 'Fill container' })
  return o
}
/** W/H 칸 안 ▾ 메뉴(피그마: Fixed width · Hug contents · Fill container). 칸에는 Hug · Fill 만 글자로 보여요 */
const sizeOptions = (axis: 'w' | 'h') => [
  ...sizingOpts(axis).map((o) => ({ value: o.k as string, label: o.label, short: o.k === 'fixed' ? '' : o.k === 'hug' ? 'Hug' : 'Fill', sep: false })),
  { value: VAR_OPT, label: vb(axis) ? 'Change variable…' : 'Apply variable…', short: '', sep: true },
]
const VAR_OPT = '__var'
/** W/H 의 변수 목록(칸 안 버튼은 숨기고 ▾ 메뉴에서 열어요) — 반응형일 필요가 없어 일반 객체 */
const sizeVar: Record<'w' | 'h', { show: () => void } | null> = { w: null, h: null }
function setSizeRef(k: 'w' | 'h', c: unknown) { sizeVar[k] = c && typeof (c as { show?: unknown }).show === 'function' ? (c as { show: () => void }) : null }
function onSizing(axis: 'w' | 'h', v: string) {
  if (v === VAR_OPT) { nextTick(() => sizeVar[axis]?.show()); return }
  setSizing(axis, v as Sizing)
}
const sizingNow = (axis: 'w' | 'h') => same((n) => (axis === 'w' ? n.sizeH ?? (n.type === 'text' && n.style.autoWidth ? 'hug' : 'fixed') : n.sizeV ?? (n.type === 'text' ? 'hug' : 'fixed')))
function setSizing(axis: 'w' | 'h', v: Sizing) {
  // 피그마처럼: 그 방향이 Hug 인 부모 안에서 Fill 을 고르면 부모를 그 방향 Fixed 로 바꿔요(Hug 부모는 채울 크기가 없어요). 실행취소 한 번
  const key = axis === 'w' ? 'sizeH' : 'sizeV'
  const hugParents = v === 'fill' ? [...new Set(nodes.value.map((n) => parentOf(n)).filter((p): p is LayerNode => !!p && p[key] === 'hug').map((p) => p.id))] : []
  if (hugParents.length) { store.hold(sid.value); store.update(sid.value, hugParents, { [key]: undefined }) }
  store.update(sid.value, ids.value, (n) => {
    const p: Partial<LayerNode> = axis === 'w' ? { sizeH: v === 'fixed' ? undefined : v } : { sizeV: v === 'fixed' ? undefined : v }
    if (n.type === 'text' && axis === 'w') n.style.autoWidth = v === 'hug'
    return p
  })
  if (hugParents.length) store.release(sid.value)
}
const showConstraints = computed(() => !inFlow.value && !isPageCanvas(sid.value) && nodes.value.every((n) => !parentOf(n) || isContainer(parentOf(n))))
const consNow = (axis: 'h' | 'v') => same((n) => n.constraints?.[axis] ?? (axis === 'h' ? 'left' : 'top'))
function setCons(axis: 'h' | 'v', v: string) {
  store.update(sid.value, ids.value, (n) => { const c: Constraints = { h: n.constraints?.h ?? 'left', v: n.constraints?.v ?? 'top', [axis]: v } as Constraints; return { constraints: c.h === 'left' && c.v === 'top' ? undefined : c } })
}
/** 가운데 네모 · 그림 두 번 누르기: 가로 · 세로 모두 Center(피그마와 같아요) */
function consCenter() {
  store.update(sid.value, ids.value, () => ({ constraints: { h: 'center', v: 'center' } as Constraints }))
}
/** 그림 누르기: 막대는 그 방향, ⇧ 를 누른 채 반대쪽 막대는 양쪽(이미 양쪽이면 누른 쪽을 빼요), 가운데는 Center */
function consClick(axis: 'h' | 'v', side: string, e: MouseEvent) {
  const cur = String(consNow(axis))
  const both = axis === 'h' ? 'leftright' : 'topbottom'
  const [a, b] = axis === 'h' ? ['left', 'right'] : ['top', 'bottom']
  let next = side
  if (e.shiftKey && side !== 'center') {
    const other = side === a ? b : a
    if (cur === other) next = both
    else if (cur === both) next = other
  }
  setCons(axis, next)
}
const CONS_H = [['left', 'Left'], ['right', 'Right'], ['leftright', 'Left & right'], ['center', 'Center'], ['scale', 'Scale']] as const
const CONS_V = [['top', 'Top'], ['bottom', 'Bottom'], ['topbottom', 'Top & bottom'], ['center', 'Center'], ['scale', 'Scale']] as const

// --- v5: 선 위치 · 점선 · 끝 모양 · 화살표, 다각형 · 별, 혼합 모드, 이미지 채우기 방식 · 자르기, 텍스트 고급 ---
const hasStroke = computed(() => nodes.value.some((n) => n.style.strokeWidth && (n.style.stroke || n.style.strokes?.length)))
/** 컴포넌트가 스스로 그린 선(Top Bar 의 Line 등): 피그마처럼 Stroke 칸에 보여 줘요(속성으로 바꿔요) */
const compStroke = ref<CompStroke | null>(null)
function readComp() {
  const n = one.value
  compStroke.value = n?.type === 'instance' ? readCompStroke(document.querySelector(`[data-screen="${sid.value}"] [data-layer="${n.id}"] .box > *`)) : null
}
watch(() => (one.value?.type === 'instance' ? one.value.id + JSON.stringify(one.value.props ?? {}) : ''), () => nextTick(() => requestAnimationFrame(readComp)), { immediate: true })
const alignNow = computed(() => same((n) => n.style.strokeAlign ?? defaultAlign(n.type)))
const closedShape = computed(() => nodes.value.every((n) => !isVector(n.type) || n.type === 'polygon' || n.type === 'star' || !!n.closed))
const openPath = computed(() => nodes.value.every((n) => n.type === 'line' || n.type === 'path'))
const dashed = computed(() => nodes.value.some((n) => !!n.style.dash))
function setDash(i: 0 | 1, e: Event) {
  const v = Math.max(0, Number((e.target as HTMLInputElement).value) || 0)
  store.update(sid.value, ids.value, (n) => { const d = [...(n.style.dash ?? [4, 4])] as [number, number]; d[i] = v; return { style: { ...n.style, dash: d } } })
}
function stepDash(i: 0 | 1, d: number) {
  store.update(sid.value, ids.value, (n) => { const v = [...(n.style.dash ?? [4, 4])] as [number, number]; v[i] = Math.max(0, v[i] + d); return { style: { ...n.style, dash: v } } })
}
const ARROWS = [{ k: 'none', label: 'None' }, { k: 'arrow', label: 'Line arrow' }, { k: 'triangle', label: 'Triangle arrow' }, { k: 'circle', label: 'Circle' }] as const
const blendNow = computed(() => same((n) => n.style.blend ?? 'normal'))
const noRadius = computed(() => has('text', 'ellipse', 'line', 'path', 'polygon', 'star'))
function setCount(key: 'sides' | 'points', e: Event) {
  const v = Math.round(Number((e.target as HTMLInputElement).value))
  if (Number.isFinite(v)) setStyle(key, Math.max(3, Math.min(60, v)))
}
function setRatio(e: Event) {
  const v = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (Number.isFinite(v)) setStyle('inner', Math.max(1, Math.min(100, v)) / 100)
}
const fitNow = computed(() => same((n) => n.style.fit ?? 'fill'))
const cropNow = computed(() => one.value?.style.crop ?? { scale: 1, x: 50, y: 50 })
function setCrop(key: 'scale' | 'x' | 'y', e: Event) {
  const raw = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (!Number.isFinite(raw)) return
  const v = key === 'scale' ? Math.max(1, Math.min(10, raw / 100)) : Math.max(0, Math.min(100, raw))
  setStyle('crop', { ...cropNow.value, [key]: v })
}

// 정렬(하나면 부모 기준, 여러 개면 고른 범위 기준) · 균등 분배 · 간격 맞추기
const rects = computed(() => store.boxes(sid.value, ids.value))
const axis = computed(() => (rects.value.length >= 2 ? guessAxis(rects.value) : 'x'))
const gap = computed(() => currentGap(rects.value, axis.value))
function onArrange(op: ArrangeOp) {
  if (op.kind === 'align') store.align(sid.value, ids.value, op.k)
  else if (op.kind === 'distribute') store.distribute(sid.value, ids.value, op.axis)
  else if (op.kind === 'tidy') store.tidy(sid.value, ids.value)
  else store.space(sid.value, ids.value, op.axis, op.gap)
}
watch(ids, () => (menu.value = null))
// 메뉴: 바깥을 누르거나 Esc 로 닫기
const root = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  const rel = (e.target as HTMLElement | null)?.closest('.rel')
  if (menu.value && (!rel || !root.value?.contains(rel))) menu.value = null
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape' && menu.value) menu.value = null }
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })
</script>

<template>
  <div ref="root" class="li" @focusin="onFocusIn" @keydown="onEsc" @change.capture="onChangeCap">
    <section class="s first">
      <div class="head">
        <span class="tx-head ell">{{ one ? TYPE_LABEL[one.type] : `${nodes.length} layers` }}</span>
        <span class="acts">
          <button v-for="a in ARRANGE" :key="a.label" class="ib s24" :aria-label="`${a.label} (${a.key})`" :title="`${a.label} ${a.key}`" @click="store.arrange(sid, ids, a.dir)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="a.d" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button class="ib s24" aria-label="Delete (⌫)" title="Delete ⌫" @click="store.remove(sid, ids)"><EditorIcon name="trashbin" :size="16" /></button>
        </span>
      </div>
      <!-- 불리언 · 마스크(피그마 위 막대의 Boolean groups 와 같아요): 여러 개면 만들기, 불리언 그룹이면 방식 바꾸기. 격자: [불리언 4 (2칸) | 마스크 24] -->
      <div v-if="nodes.length > 1 || one?.type === 'boolean'" class="ig">
        <div class="grp span2" role="group" aria-label="Boolean operation">
          <button v-for="b in BOOL_OPS" :key="b.k" :class="['ib', { on: one?.op === b.k }]" :aria-pressed="one?.type === 'boolean' ? one.op === b.k : undefined" :aria-label="b.label" :title="`${b.label} ${b.key}`" @click="one?.type === 'boolean' ? store.update(sid, ids, { op: b.k, name: b.label.split(' ')[0] }) : store.booleanOp(sid, ids, b.k)">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path :d="b.d" fill="currentColor" fill-rule="evenodd" /><path d="M2.5 2.5h7v7h-7zM6.5 6.5h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.25" /></svg>
          </button>
        </div>
        <button v-if="nodes.length > 1" class="ib s24" aria-label="Use as mask (⌃⌘M)" title="Use as mask ⌃⌘M" @click="store.toggleMask(sid, ids)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" /></svg></button>
        <span v-else />
      </div>
      <button v-if="one?.isMask" class="cb on" @click="store.toggleMask(sid, ids)"><i class="sq" />Use as mask</button>
    </section>

    <!-- 컴포넌트 속성(피그마처럼 맨 위): 변형 · 켜고 끄기 · 글자 -->
    <InspectorInstance v-if="one?.type === 'instance'" :sid="sid" :ids="ids" />

    <section class="s">
      <div class="sec-h h24"><span>Position</span>
        <button v-if="inFlow" :class="['ib', 's24', 'tog', { on: same((n) => !!n.absolute) === true }]" :aria-pressed="same((n) => !!n.absolute) === true" aria-label="Ignore auto layout" title="Ignore auto layout" @click="store.update(sid, ids, (n) => ({ absolute: n.absolute ? undefined : true }))"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 4V2.5a1 1 0 0 1 1-1H4M10 1.5h1.5a1 1 0 0 1 1 1V4M12.5 10v1.5a1 1 0 0 1-1 1H10M4 12.5H2.5a1 1 0 0 1-1-1V10" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /><rect x="4.5" y="4.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2" fill="none" /></svg></button>
      </div>
      <ArrangeControls :count="nodes.length" :gap="gap" :axis="axis" @op="onArrange" />
      <div class="ig-l"><span>Position</span></div>
      <div class="ig">
        <label class="sq fld"><span>X</span><input v-if="!vb('x')" :value="showG(same((n) => n.x))" :placeholder="same((n) => n.x) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="X" @change="setNum('x', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, store.topIds(sid, ids), (n) => ({ x: n.x + d })))"><TokenPicker :kinds="['spacing']" :bound="vb('x')" reveal label="X" @pick="(t) => pickNum('x', t)" @unbind="unbind('x')" @step="(d) => stepNum('x', d)" /></label>
        <label class="sq fld"><span>Y</span><input v-if="!vb('y')" :value="showG(same((n) => n.y))" :placeholder="same((n) => n.y) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Y" @change="setNum('y', $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, store.topIds(sid, ids), (n) => ({ y: n.y + d })))"><TokenPicker :kinds="['spacing']" :bound="vb('y')" reveal label="Y" @pick="(t) => pickNum('y', t)" @unbind="unbind('y')" @step="(d) => stepNum('y', d)" /></label>
        <button v-if="showConstraints" :class="['ib', 's24', 'tog', { on: consShown }]" :aria-pressed="consShown" :aria-label="consShown ? 'Hide constraints' : 'Show constraints'" :title="consShown ? 'Hide constraints' : 'Show constraints'" @click="setConsShown(!consShown)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" opacity=".55" /><path d="M9.25 7.25v4M7.25 9.25h4" stroke="currentColor" stroke-width="1" opacity=".55" stroke-linecap="round" /><path d="M5.5 2.5h7.5M2.5 5.5v7.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" /></svg></button>
        <span v-else />
      </div>
      <!-- Constraints: 피그마처럼 Position 안 X · Y 바로 아래 -->
      <template v-if="showConstraints && consShown">
        <div class="ig-l"><span>Constraints</span></div>
        <!-- [제약 그림 | 가로 ▾ / 세로 ▾(흰 바탕 · 테두리) | (빈 24)] -->
        <div class="cons">
          <!-- 그림을 눌러서도 설정(피그마와 같아요): 막대 = 그 방향, ⇧ + 반대쪽 = 양쪽, 가운데 + 의 가로 · 세로 막대 = 그 축 Center, 가운데 네모 · 두 번 누르기 = 둘 다 Center -->
          <div class="sq cons-box" role="group" aria-label="Constraints" @dblclick="consCenter">
            <b class="sq" aria-hidden="true" />
            <button type="button" :class="['ct', 'l', { on: ['left', 'leftright'].includes(String(consNow('h'))) }]" aria-label="Left" title="Left (⇧ for Left & right)" @click="consClick('h', 'left', $event)"><i /></button>
            <button type="button" :class="['ct', 'r', { on: ['right', 'leftright'].includes(String(consNow('h'))) }]" aria-label="Right" title="Right (⇧ for Left & right)" @click="consClick('h', 'right', $event)"><i /></button>
            <button type="button" :class="['ct', 't', { on: ['top', 'topbottom'].includes(String(consNow('v'))) }]" aria-label="Top" title="Top (⇧ for Top & bottom)" @click="consClick('v', 'top', $event)"><i /></button>
            <button type="button" :class="['ct', 'b', { on: ['bottom', 'topbottom'].includes(String(consNow('v'))) }]" aria-label="Bottom" title="Bottom (⇧ for Top & bottom)" @click="consClick('v', 'bottom', $event)"><i /></button>
            <button type="button" :class="['ct', 'ch', { on: consNow('h') === 'center' || consNow('h') === 'scale' }]" aria-label="Center horizontally" title="Center horizontally" @click="consClick('h', 'center', $event)"><i /></button>
            <button type="button" :class="['ct', 'cv', { on: consNow('v') === 'center' || consNow('v') === 'scale' }]" aria-label="Center vertically" title="Center vertically" @click="consClick('v', 'center', $event)"><i /></button>
            <button type="button" class="ct cc" aria-label="Center both" title="Center (double-click the diagram too)" @click="consCenter" />
          </div>
          <EditorSelect :model-value="consNow('h') === 'Mixed' ? null : String(consNow('h'))" :options="CONS_H.map(([value, label]) => ({ value, label }))" aria-label="Horizontal constraint" placeholder="Mixed" @update:model-value="(v) => setCons('h', v)"><template #lead><svg class="cons-ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5v5M13.5 5.5v5M2.5 8h11" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg></template></EditorSelect>
          <EditorSelect :model-value="consNow('v') === 'Mixed' ? null : String(consNow('v'))" :options="CONS_V.map(([value, label]) => ({ value, label }))" aria-label="Vertical constraint" placeholder="Mixed" class="c2" @update:model-value="(v) => setCons('v', v)"><template #lead><svg class="cons-ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2.5h5M5.5 13.5h5M8 2.5v11" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" /></svg></template></EditorSelect>
        </div>
      </template>
      <div class="ig-l"><span>Rotation</span></div>
      <div class="ig">
        <label class="sq fld u" title="Rotation"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13h11M2.5 13l7-8.5M7.4 13a4.9 4.9 0 0 0-1.8-3.8" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><input :value="showG(same((n) => n.rotation ?? 0))" :placeholder="same((n) => n.rotation ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Rotation" @change="setRotation" @keydown="blurOnEnter($event); step($event, (d) => store.rotateBy(sid, ids, d))"><span v-if="same((n) => n.rotation ?? 0) !== 'Mixed'" class="unit">°</span></label>
        <div class="grp" role="group" aria-label="Rotate and flip">
          <button class="ib" aria-label="Rotate 90°" title="Rotate 90°" @click="store.rotateBy(sid, ids, 90)"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5a4.5 4.5 0 1 0 1.6-3.5M4.5 1.5v2.7h2.7" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipX) === true }]" aria-label="Flip horizontal (⇧H)" title="Flip horizontal ⇧H" @click="store.flip(sid, ids, 'x')"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M5 3.5v7L1.5 10.5zM9 3.5v7l3.5 0z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
          <button :class="['ib', { on: same((n) => !!n.flipY) === true }]" aria-label="Flip vertical (⇧V)" title="Flip vertical ⇧V" @click="store.flip(sid, ids, 'y')"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7h11" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.5 1.5" /><path d="M3.5 5h7L10.5 1.5zM3.5 9h7l0 3.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round" /></svg></button>
        </div>
        <span />
      </div>
    </section>


    <!-- Layout(피그마 UI3): 기본은 Flow · Dimensions · Clip content, 오토 레이아웃이면 같은 칸이 Auto layout 으로 바뀌어요 -->
    <InspectorAutoLayout :sid="sid" :ids="ids">
      <template #dims>
        <div class="ig-l"><span>{{ sizingNow('w') === 'fixed' && sizingNow('h') === 'fixed' ? 'Dimensions' : 'Resizing' }}</span></div>
        <div class="ig">
          <!-- 피그마처럼 W/H 칸 안에는 숫자 + Hug · Fill ▾ 만: 변수 연결은 ▾ 메뉴의 'Apply variable…' 로(칸에 버튼이 더 나오면 숫자가 잘려요) -->
          <label v-for="k in (['w', 'h'] as const)" :key="k" class="sq fld sz" :class="{ multi: sizingOpts(k).length > 1 }"><span>{{ k === 'w' ? 'W' : 'H' }}</span><input v-if="!vb(k)" :value="showG(same((n) => dim(n, k)))" :placeholder="same((n) => dim(n, k)) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" :aria-label="k === 'w' ? 'Width' : 'Height'" @change="setNum(k, $event)" @keydown="blurOnEnter($event); step($event, (d) => store.update(sid, ids, (n) => sized(n, k, dim(n, k) + d)))"><TokenPicker :ref="(c) => setSizeRef(k, c)" :kinds="['spacing']" :bound="vb(k)" :label="k === 'w' ? 'Width' : 'Height'" @pick="(t) => pickNum(k, t)" @unbind="unbind(k)" @step="(d) => stepNum(k, d)" /><EditorSelect variant="inline" :model-value="sizingNow(k) === 'Mixed' ? null : String(sizingNow(k))" :options="sizeOptions(k)" :aria-label="k === 'w' ? 'Horizontal resizing' : 'Vertical resizing'" placeholder="Mixed" @update:model-value="(v) => onSizing(k, v)" /></label>
          <button :class="['ib', 's24', 'tog', { on: locked }]" :aria-pressed="locked" :aria-label="locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'" :title="locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'" @click="toggleRatio">
            <svg v-if="locked" width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1M5.5 8.5l3-3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
            <svg v-else width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M6 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8 9.5l-1 1A2.5 2.5 0 0 1 3.5 7l1-1" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
          </button>
        </div>
      </template>
      <template #clip>
        <button v-if="has('frame')" :class="['cb', { on: same((n) => n.style.clip !== false) === true }]" @click="setStyle('clip', same((n) => n.style.clip !== false) !== true)"><i class="sq" />Clip content</button>
      </template>
    </InspectorAutoLayout>


    <section class="s">
      <div class="sec-h h24"><span>Appearance</span>
        <span class="acts">
          <button :class="['ib', 's24', 'tog', { on: same((n) => !!n.hidden) === true }]" :aria-pressed="same((n) => !!n.hidden) === true" :aria-label="same((n) => !!n.hidden) === true ? 'Show (⇧⌘H)' : 'Hide (⇧⌘H)'" :title="same((n) => !!n.hidden) === true ? 'Show ⇧⌘H' : 'Hide ⇧⌘H'" @click="store.update(sid, ids, { hidden: same((n) => !!n.hidden) !== true })">
            <EditorIcon :name="same((n) => !!n.hidden) === true ? 'eye_off' : 'eye'" :size="16" />
          </button>
          <EditorSelect variant="icon" class="blend" :model-value="blendNow === 'Mixed' ? null : String(blendNow)" :options="BLEND_MODES.map((b) => ({ value: b.k, label: b.label, sep: b.sep }))" aria-label="Blend mode" @update:model-value="(v) => setStyle('blend', v === 'normal' ? undefined : v)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5C6.2 5.1 4 7.4 4 10a4 4 0 0 0 8 0c0-2.6-2.2-4.9-4-7.5z" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linejoin="round" /></svg></EditorSelect>
        </span>
      </div>
      <div class="ig-l"><span>Opacity</span><span v-if="!noRadius">Corner radius</span></div>
      <div class="ig">
        <label class="sq fld u"><EditorIcon name="var_opacity" :size="16" /><template v-if="!vb('opacity')"><input :value="same((n) => Math.round((n.style.opacity ?? 1) * 100)) === 'Mixed' ? '' : same((n) => Math.round((n.style.opacity ?? 1) * 100))" :placeholder="same((n) => n.style.opacity ?? 1) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Opacity" @change="setOpacity" @keydown="blurOnEnter($event); step($event, stepOpacity)"><span v-if="same((n) => n.style.opacity ?? 1) !== 'Mixed'" class="unit">%</span></template><TokenPicker :kinds="['opacity']" :bound="vb('opacity')" reveal label="Opacity" @pick="(t) => pickNum('opacity', t)" @unbind="unbind('opacity')" @step="stepOpacity" /></label>
        <template v-if="!noRadius">
          <label v-if="separate" class="sq fld"><EditorIcon name="var_radius" :size="16" /><input v-if="!vbCorners" :key="'all' + String(allCorners)" :value="show(allCorners)" :placeholder="allCorners === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Corner radius" @change="setCorner($event)" @keydown="blurOnEnter"><TokenPicker :kinds="['radius']" :bound="vbCorners" reveal label="Corner radius" @pick="(t) => pickNum('radius', t)" @unbind="unbind([...CORNER_KEYS, 'radius'])" /></label>
          <label v-else class="sq fld"><EditorIcon name="var_radius" :size="16" /><input v-if="!vb('radius')" :value="show(same((n) => n.style.radius ?? 0))" :placeholder="same((n) => n.style.radius ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" aria-label="Corner radius" @change="setStyleNum('radius', $event)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('radius', d))"><TokenPicker :kinds="['radius']" :bound="vb('radius')" reveal label="Corner radius" @pick="(t) => pickNum('radius', t)" @unbind="unbind('radius')" @step="(d) => stepStyle('radius', d)" /></label>
          <button :class="['ib', 's24', 'tog', { on: separate }]" :aria-pressed="separate" aria-label="Independent corners" title="Independent corners" @click="toggleCorners"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 5V3.5a2 2 0 0 1 2-2H5M9 1.5h1.5a2 2 0 0 1 2 2V5M12.5 9v1.5a2 2 0 0 1-2 2H9M5 12.5H3.5a2 2 0 0 1-2-2V9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        </template>
        <template v-else><span /><span /></template>
      </div>
      <template v-if="!noRadius && separate">
        <!-- 피그마 순서: ┌ ┐ / └ ┘ (CORNER_KEYS: 0 왼쪽 위 · 1 오른쪽 위 · 2 오른쪽 아래 · 3 왼쪽 아래) -->
        <div v-for="row in ([[0, 1], [3, 2]] as const)" :key="row[0]" class="ig"><label v-for="i in row" :key="i" class="sq fld" :title="CORNER_LABEL[i]"><EditorIcon name="var_radius" :size="16" :style="{ transform: `rotate(${i * 90}deg)` }" /><input v-if="!vb(CORNER_KEYS[i]!)" :value="show(corner(i))" :placeholder="corner(i) === 'Mixed' ? 'Mixed' : ''" inputmode="numeric" :aria-label="CORNER_LABEL[i]" @change="setCorner($event, i)" @keydown="blurOnEnter($event); step($event, (d) => stepCorner(i, d))"><TokenPicker :kinds="['radius']" :bound="vb(CORNER_KEYS[i]!)" reveal short :label="CORNER_LABEL[i]" @pick="(t) => pickNum(CORNER_KEYS[i]!, t)" @unbind="unbind(CORNER_KEYS[i]!)" @step="(d) => stepCorner(i, d)" /></label><button v-if="row[0] === 3" ref="smoothBtn" :class="['ib', 's24', 'tog', { on: smoothOpen || (smoothNow !== 'Mixed' && smoothNow > 0) }]" :aria-pressed="smoothOpen" aria-label="Corner smoothing" title="Corner smoothing" @click="smoothOpen = !smoothOpen"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2.5v11M11 2.5v11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /><circle cx="5" cy="10" r="1.75" fill="var(--sq-fill, #fff)" stroke="currentColor" stroke-width="1.25" /><circle cx="11" cy="6" r="1.75" fill="var(--sq-fill, #fff)" stroke="currentColor" stroke-width="1.25" /></svg></button><span v-else /></div>
      </template>
      <CornerSmoothing v-if="smoothOpen && separate && !noRadius" :anchor="smoothBtnEl" :value="smoothNow" @update="setSmoothing" @start="store.hold(sid)" @end="store.release(sid)" @close="smoothOpen = false" />
      <template v-if="one?.type === 'polygon' || one?.type === 'star'">
        <div class="ig-l"><span>Count</span><span v-if="one.type === 'star'">Ratio</span></div>
        <div class="ig">
          <label v-if="one.type === 'polygon'" class="sq fld" title="Point count"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l5.5 10h-11z" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linejoin="round" /></svg><input :key="'p' + one.style.sides" :value="one.style.sides ?? 3" inputmode="numeric" aria-label="Point count" @change="setCount('sides', $event)" @keydown="blurOnEnter($event); step($event, (d) => setStyle('sides', Math.max(3, Math.min(60, (one!.style.sides ?? 3) + Math.sign(d)))))"></label>
          <label v-else class="sq fld" title="Point count"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l1.7 3.6 3.8.4-2.9 2.6.8 3.9L8 11l-3.4 2 .8-3.9-2.9-2.6 3.8-.4z" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linejoin="round" /></svg><input :key="'s' + one.style.points" :value="one.style.points ?? 5" inputmode="numeric" aria-label="Point count" @change="setCount('points', $event)" @keydown="blurOnEnter($event); step($event, (d) => setStyle('points', Math.max(3, Math.min(60, (one!.style.points ?? 5) + Math.sign(d)))))"></label>
          <label v-if="one.type === 'star'" class="sq fld u" title="Ratio"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11zM8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4z" stroke="currentColor" stroke-width="1.25" fill="none" /></svg><input :key="'r' + one.style.inner" :value="Math.round((one.style.inner ?? 0.38) * 100)" inputmode="numeric" aria-label="Ratio" @change="setRatio" @keydown="blurOnEnter($event); step($event, (d) => setStyle('inner', Math.max(0.01, Math.min(1, Math.round((one!.style.inner ?? 0.38) * 100 + d) / 100))))"><span class="unit">%</span></label>
          <span v-else />
          <span />
        </div>
      </template>
    </section>

    <section v-if="has('text')" class="s">
      <!-- 피그마 Typography: 스타일이 걸렸으면 [Ag 스타일 칸 | 떼기] 하나만, 떼면 스타일 속 변수가 칸마다 칩으로 —
           [글꼴 (한 줄)] / [굵기 | 크기 ▾] / 줄 높이 · 자간 / 정렬 · 세로 정렬 | 상세 ⚙ -->
      <div class="sec-h h24"><span>Typography</span><TokenPicker v-if="!tsBound" variant="icon" icon="styles" :kinds="['textStyle']" label="Text styles" @pick="pickTextStyle" /></div>
      <div v-if="tsBound" class="ig w1 ts-row">
        <TokenPicker variant="style" :kinds="['textStyle']" :bound="tsBound" label="Text style" @pick="pickTextStyle" />
        <button type="button" class="ib s24 ts-x" aria-label="Detach style" data-tip="Detach style" @click="detachStyle"><EditorIcon name="unlink" :size="16" /></button>
      </div>
      <template v-else>
        <div class="ig w1">
          <div class="sq fld ff" data-tip="Pretendard — the design system font"><EditorIcon name="text_box" :size="16" class="ffi" /><span class="ffn">Pretendard</span></div>
          <span />
        </div>
        <div class="ig">
          <label v-if="vb('fontWeight')" class="sq fld"><TokenPicker :kinds="['fontWeight']" :bound="vb('fontWeight')" label="Font weight" @pick="(t) => pickNum('fontWeight', t)" @unbind="unbind('fontWeight')" /></label>
          <div v-else class="tp-anchor wt">
            <EditorSelect :model-value="weightNow === 'Mixed' ? null : String(weightNow)" :options="weightOptions" aria-label="Font weight" placeholder="Mixed" @update:model-value="onWeight" />
            <TokenPicker :ref="(c) => setTypoRef('fontWeight', c)" :kinds="['fontWeight']" label="Font weight" @pick="(t) => pickNum('fontWeight', t)" />
          </div>
          <label class="sq fld sz multi" title="Font size"><input v-if="!vb('fontSize')" :value="show(same((n) => n.style.fontSize ?? 16))" :placeholder="same((n) => n.style.fontSize ?? 16) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Font size" @change="setStyleNum('fontSize', $event, 1)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('fontSize', d, 1))"><TokenPicker :ref="(c) => setTypoRef('fontSize', c)" :kinds="['fontSize']" :bound="vb('fontSize')" label="Font size" @pick="(t) => pickNum('fontSize', t)" @unbind="unbind('fontSize')" @step="(d) => stepStyle('fontSize', d, 1)" /><EditorSelect variant="inline" :model-value="sizeNow" :options="sizeOptionsT" aria-label="Font size" @update:model-value="onSize" /></label>
          <span />
        </div>
        <div class="ig-l"><span>Line height</span><span>Letter spacing</span></div>
        <div class="ig">
        <label class="sq fld" title="Line height"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11M2.5 13.5h11M5.8 11l2.2-6 2.2 6M6.6 9h2.8" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><input v-if="!vb('lineHeight')" :value="show(same((n) => n.style.lineHeight ?? ''))" :placeholder="same((n) => n.style.lineHeight ?? '') === 'Mixed' ? 'Mixed' : 'Auto'" inputmode="decimal" aria-label="Line height" @change="setStyleNum('lineHeight', $event, 1)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('lineHeight', d, 1))"><TokenPicker :kinds="['lineHeight']" :bound="vb('lineHeight')" reveal label="Line height" @pick="(t) => pickNum('lineHeight', t)" @unbind="unbind('lineHeight')" @step="(d) => stepStyle('lineHeight', d, 1)" /></label>
        <label class="sq fld u" title="Letter spacing"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3v10M13.5 3v10M5.8 11l2.2-6 2.2 6M6.6 9h2.8" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg><template v-if="!vb('letterSpacing')"><input :value="show(same((n) => n.style.letterSpacing ?? 0))" :placeholder="same((n) => n.style.letterSpacing ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Letter spacing" @change="setStyleNum('letterSpacing', $event, -100)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('letterSpacing', d / 10, -100))"><span v-if="same((n) => n.style.letterSpacing ?? 0) !== 'Mixed'" class="unit">px</span></template><TokenPicker :kinds="['letterSpacing']" :bound="vb('letterSpacing')" reveal label="Letter spacing" @pick="(t) => pickNum('letterSpacing', t)" @unbind="unbind('letterSpacing')" @step="(d) => stepStyle('letterSpacing', d / 10, -100)" /></label>
          <span />
        </div>
      </template>
      <div class="ig-l"><span>Alignment</span></div>
      <div class="ig">
        <div class="grp" role="group" aria-label="Text alignment">
          <button v-for="a in (['left', 'center', 'right'] as const)" :key="a" :class="['ib', { on: textAlignNow === a }]" :aria-pressed="textAlignNow === a" :aria-label="ALIGN_LABEL[a]" :data-tip="ALIGN_LABEL[a]" @click="setStyle('align', a)"><EditorIcon :name="`align_${a}`" :size="16" /></button>
        </div>
        <div class="grp" role="group" aria-label="Vertical alignment">
          <button v-for="a in (['top', 'middle', 'bottom'] as const)" :key="a" :class="['ib', { on: valignNow === a }]" :aria-pressed="valignNow === a" :aria-label="VALIGN_LABEL[a]" :data-tip="VALIGN_LABEL[a]" @click="setStyle('valign', a === 'top' ? undefined : a)"><EditorIcon :name="`valign_${a}`" :size="16" /></button>
        </div>
        <button ref="tdBtn" type="button" :class="['ib', 's24', 'tog', { on: tdOpen }]" aria-label="Type settings" data-tip="Type settings" aria-haspopup="dialog" :aria-expanded="tdOpen" @click="tdOpen = !tdOpen"><EditorIcon name="text_settings" :size="16" /></button>
      </div>
      <TextDetails v-if="tdOpen" :anchor="tdBtn" :sid="sid" :ids="ids" @close="tdOpen = false" />
    </section>

    <InspectorPaints v-if="!has('line', 'path') || has('path')" :sid="sid" :ids="ids" :kind="has('text') ? 'text' : 'fill'" title="Fill" />

    <InspectorPaints :sid="sid" :ids="ids" kind="stroke" title="Stroke">
      <!-- 컴포넌트가 그린 선: 읽기 전용(켜고 끄기 · 바꾸기는 위 컴포넌트 속성에서) -->
      <template v-if="compStroke && !hasStroke">
        <div class="sq cstroke" :title="'From the component — change it in the component properties above'">
          <span class="sq sq-clip cs-sw" :style="{ background: `linear-gradient(${compStroke.css}, ${compStroke.css}), #fff` }" />
          <span class="num">{{ compStroke.hex }}</span>
          <span class="num cs-a">{{ compStroke.alpha }}%</span>
        </div>
        <div class="ig-l"><span>Position</span><span>Weight</span></div>
        <div class="cstroke-meta tx-meta"><span>Inside · {{ compStroke.side }}</span><span class="num">{{ fmtNum(compStroke.width) }}px</span></div>
      </template>
      <template v-if="hasStroke">
        <div class="ig-l"><span v-if="closedShape && !has('text')">Position</span><span>Weight</span></div>
        <div class="ig">
          <EditorSelect v-if="closedShape && !has('text')" :model-value="alignNow === 'Mixed' ? null : String(alignNow)" :options="[{ value: 'center', label: 'Center' }, { value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }]" ariaLabel="Stroke position" placeholder="Mixed" @update:model-value="(v) => setStyle('strokeAlign', v)" />
          <label class="sq fld u" title="Stroke weight"><svg class="keep" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11" stroke="currentColor" stroke-width="1" /><path d="M2.5 8h11" stroke="currentColor" stroke-width="1.6" /><path d="M2.5 12h11" stroke="currentColor" stroke-width="2.4" /></svg><template v-if="!vb('strokeWidth')"><input :value="show(same((n) => n.style.strokeWidth ?? 0))" :placeholder="same((n) => n.style.strokeWidth ?? 0) === 'Mixed' ? 'Mixed' : ''" inputmode="decimal" aria-label="Stroke weight" @change="setStyleNum('strokeWidth', $event)" @keydown="blurOnEnter($event); step($event, (d) => stepStyle('strokeWidth', d))"><span v-if="same((n) => n.style.strokeWidth ?? 0) !== 'Mixed'" class="unit">px</span></template><TokenPicker :kinds="['borderWidth']" :bound="vb('strokeWidth')" reveal label="Stroke weight" @pick="(t) => pickNum('strokeWidth', t)" @unbind="unbind('strokeWidth')" @step="(d) => stepStyle('strokeWidth', d)" /></label>
          <span v-if="!(closedShape && !has('text'))" />
          <span />
        </div>
        <button v-if="!has('text')" :class="['cb', { on: dashed }]" role="checkbox" :aria-checked="dashed" @click="setStyle('dash', dashed ? undefined : [4, 4])"><i class="sq" />Dashed</button>
        <template v-if="dashed">
          <div class="ig-l"><span>Dash</span><span>Gap</span></div>
          <div class="ig">
            <label v-for="(k, i) in (['Dash', 'Gap'] as const)" :key="k" class="sq fld"><input :key="k + nodes[0]?.style.dash?.[i]" :value="nodes[0]?.style.dash?.[i] ?? 4" inputmode="numeric" :aria-label="k" @change="setDash(i as 0 | 1, $event)" @keydown="blurOnEnter($event); step($event, (d) => stepDash(i as 0 | 1, d))"></label>
            <span />
          </div>
        </template>
        <template v-if="openPath">
          <div class="ig-l"><span>Start point</span><span>End point</span></div>
          <div class="ig">
            <EditorSelect v-for="k in (['arrowStart', 'arrowEnd'] as const)" :key="k" :model-value="same((n) => n.style[k] ?? 'none') === 'Mixed' ? null : String(same((n) => n.style[k] ?? 'none'))" :options="ARROWS.map((a) => ({ value: a.k, label: a.label }))" :aria-label="k === 'arrowStart' ? 'Start point' : 'End point'" placeholder="Mixed" @update:model-value="(v) => setStyle(k, v === 'none' ? undefined : v)" />
            <span />
          </div>
          <div class="ig-l"><span>Cap</span></div>
          <div class="ig">
            <div class="grp span2" role="group" aria-label="Cap">
              <button v-for="c in (['butt', 'round', 'square'] as const)" :key="c" :class="['ib', 'txt-b', { on: same((n) => n.style.cap ?? (n.type === 'path' ? 'round' : 'butt')) === c }]" :aria-pressed="same((n) => n.style.cap ?? (n.type === 'path' ? 'round' : 'butt')) === c" :aria-label="{ butt: 'Butt cap', round: 'Round cap', square: 'Square cap' }[c]" :title="{ butt: 'Butt cap', round: 'Round cap', square: 'Square cap' }[c]" @click="setStyle('cap', c)">{{ { butt: 'Butt', round: 'Round', square: 'Square' }[c] }}</button>
            </div>
            <span />
          </div>
        </template>
      </template>
    </InspectorPaints>

    <InspectorEffects :sid="sid" :ids="ids" />

    <InspectorGrids v-if="one?.type === 'frame'" :grids="one.style.grids ?? []" @change="(g) => setStyle('grids', g)" />

    <section v-if="one?.type === 'image'" class="s">
      <div class="sec-h h24"><span>Image</span></div>
      <div class="ig">
        <div class="grp span2" role="radiogroup" aria-label="Image fit">
          <button v-for="f in (['fill', 'fit', 'crop', 'tile'] as const)" :key="f" role="radio" :aria-checked="fitNow === f" :class="['ib', 'txt-b', { on: fitNow === f }]" @click="setStyle('fit', f === 'fill' ? undefined : f)">{{ { fill: 'Fill', fit: 'Fit', crop: 'Crop', tile: 'Tile' }[f] }}</button>
        </div>
        <span />
      </div>
      <template v-if="fitNow === 'crop'">
        <div class="ig-l"><span>Zoom</span></div>
        <div class="ig">
          <label class="sq fld u" title="Zoom"><EditorIcon name="search" :size="16" /><input :key="'z' + cropNow.scale" :value="Math.round(cropNow.scale * 100)" inputmode="numeric" aria-label="Crop zoom" @change="setCrop('scale', $event)" @keydown="blurOnEnter"><span class="unit">%</span></label>
          <span /><span />
        </div>
        <div class="ig-l"><span>Position</span></div>
        <div class="ig">
          <label class="sq fld u" title="Horizontal position"><span>X</span><input :key="'cx' + cropNow.x" :value="Math.round(cropNow.x)" inputmode="numeric" aria-label="Crop X" @change="setCrop('x', $event)" @keydown="blurOnEnter"><span class="unit">%</span></label>
          <label class="sq fld u" title="Vertical position"><span>Y</span><input :key="'cy' + cropNow.y" :value="Math.round(cropNow.y)" inputmode="numeric" aria-label="Crop Y" @change="setCrop('y', $event)" @keydown="blurOnEnter"><span class="unit">%</span></label>
          <span />
        </div>
      </template>
      <div class="ig w1">
        <button type="button" class="sq wide" @click="emit('replace-image', one.id)"><EditorIcon name="image" :size="16" />Replace image</button>
        <span />
      </div>
    </section>
  </div>
</template>

<style scoped>
.li { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
/* 뒤에 Scale · Export 칸이 이어지면 아래 여백은 맨 끝 칸이 가져요 */
.li:not(:last-child) { padding-bottom: 0; }
/* 섹션: 위 12 · 옆 16 · 아래 16, 줄 사이 8 (PRD 07 §2.4) */
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
/* 선택 머리: 제목 자리는 다른 인스펙터(Frame · Page)의 첫 제목과 같은 높이, 머리만 있으면 아래도 12 */
.s.first { box-shadow: none; }
.s.first:has(> .head:only-child) { padding-bottom: var(--ref-spacing-08); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); height: 24px; min-width: 0; }
.ell { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 머리 아이콘 버튼: 24 × 24, 사이 4 (Fill · Stroke 머리와 같아요) */
.acts { display: flex; align-items: center; gap: var(--ref-spacing-04); flex: none; }
.acts :deep(.ib) { width: 24px; height: 24px; }
.sec-h.h24 > .ib { margin-left: auto; }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
/* 단위(° % px)는 숫자 바로 뒤에 붙고, 남는 자리는 단위 뒤로(피그마: "0°" · "100%") */
.li .ig .fld.u > input { flex: 0 1 auto; width: auto; field-sizing: content; min-width: 1ch; max-width: 100%; }
.fld.u > .unit { flex: 1 1 0; min-width: 0; margin-left: calc(var(--ref-spacing-03) * -1); color: var(--sys-color-neutral-500); }
/* W/H: 칸 안 변수 버튼은 숨겨요 — 변수는 Hug · Fill ▾ 메뉴의 'Apply variable…' 로 열어요(숫자가 잘리지 않게) */
.fld.sz > :deep(.vb) { display: none; }
/* 크기 방식이 여럿이면(오토 레이아웃 안 · 오토 레이아웃 프레임 · 글자) ▾ 를 늘 보여 줘요 — 옅게, 칸에 올리면 진하게 */
.fld.sz.multi :deep(.inl .cv) { display: block; color: var(--sys-color-neutral-400); }
.fld.sz.multi:hover :deep(.inl .cv), .fld.sz.multi :deep(.inl.open .cv) { color: var(--sys-color-neutral-700); }
/* 제약: 그림 72 × 64(칸 두 줄 높이 28 + 8 + 28), 드롭다운은 오른쪽 끝까지 */
.cons { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 24px; grid-template-rows: 28px 28px; gap: var(--ref-spacing-06); align-items: center; min-width: 0; }
.cons > :deep(.esel) { grid-column: 2; grid-row: 1; min-width: 0; }
/* 그림(회색)과 헷갈리지 않게: 드롭다운은 흰 바탕 + 테두리 */
.cons > :deep(.esel) > .dd { --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.cons > :deep(.esel) > .dd:hover, .cons > :deep(.esel) > .dd.open { --sq-line: var(--sys-color-neutral-400); }
.cons > :deep(.esel.c2) { grid-row: 2; }
.cons-ic { flex: none; margin-right: var(--ref-spacing-04); color: var(--sys-color-neutral-600); }
.cons-box { grid-column: 1; grid-row: 1 / span 2; position: relative; height: 64px; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-200); }
/* 가운데 네모(피그마: 둥근 네모 안에 +) — 모두 가운데 기준이라 칸 폭이 바뀌어도 그대로 */
.cons-box > b { position: absolute; left: calc(50% - 28px); top: calc(50% - 12px); width: 56px; height: 24px; border-radius: var(--ref-radius-02); --sq-line: var(--sys-color-neutral-300); --sq-line-w: 1px; pointer-events: none; }
/* 누르는 자리(넓게) 안의 막대 */
.ct { position: absolute; display: grid; place-items: center; padding: 0; border: 0; background: transparent; cursor: pointer; border-radius: 3px; }
.ct > i { display: block; border-radius: 1px; background: var(--sys-color-neutral-400); }
.ct:hover > i { background: var(--sys-color-neutral-700); }
.ct.on > i, .ct.on:hover > i { background: var(--iris-select, #0D99FF); }
.ct:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 0; }
.ct.l { left: calc(50% - 50px); top: calc(50% - 10px); width: 20px; height: 20px; } .ct.r { left: calc(50% + 30px); top: calc(50% - 10px); width: 20px; height: 20px; }
.ct.l > i, .ct.r > i { width: 10px; height: 2px; }
.ct.t { left: calc(50% - 10px); top: calc(50% - 32px); width: 20px; height: 19px; } .ct.b { left: calc(50% - 10px); top: calc(50% + 13px); width: 20px; height: 19px; }
.ct.t > i, .ct.b > i { width: 2px; height: 8px; }
/* 가운데 +: 가로 막대 = 가로 Center, 세로 막대 = 세로 Center, 한가운데 네모 = 둘 다 */
.ct.ch { left: calc(50% - 27px); top: calc(50% - 5px); width: 54px; height: 10px; } .ct.ch > i { width: 14px; height: 2px; }
.ct.cv { left: calc(50% - 5px); top: calc(50% - 11px); width: 10px; height: 22px; } .ct.cv > i { width: 2px; height: 14px; }
.ct.cc { left: calc(50% - 6px); top: calc(50% - 6px); width: 12px; height: 12px; border-radius: 2px; }
.ct.cc:hover { background: color-mix(in srgb, var(--iris-select, #0D99FF) 22%, transparent); }
/* 글자 버튼(AG · Butt · Fill …): 묶음 안에서 칸 폭을 나눠 가져요 */
.txt-b { width: auto; min-width: 24px; padding: 0 var(--ref-spacing-02); font-size: 11px; font-weight: 500; }
/* 블렌드 ▾ 버튼도 머리의 다른 아이콘 버튼처럼 24 */
/* 글자: 스타일 칸 옆 떼기는 칸에 올렸을 때만(피그마) · 키보드 포커스면 보여요 */
.ts-row:not(:hover):not(:focus-within) > .ts-x { opacity: 0; }
.ts-x { color: var(--sys-color-neutral-700); }
/* 글꼴 칸(읽기 전용): 디자인 시스템 글꼴 하나 */
.ff { cursor: default; }
.ffi { flex: none; color: var(--sys-color-neutral-500); }
.ffn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 굵기 ▾: 칸 모양 드롭다운 + 메뉴의 'Apply variable…' 로 여는 변수 목록(버튼은 숨겨요) */
.wt { min-width: 0; display: flex; }
.wt > :deep(.esel) { flex: 1; min-width: 0; }
.wt :deep(.vb) { display: none !important; }
.blend :deep(.ib) { width: 24px; height: 24px; }
/* Replace image: 패널 폭 보조 버튼(피그마 Export 버튼처럼 1px 선 · 28h) */
.wide { display: flex; align-items: center; justify-content: center; gap: var(--ref-spacing-04); height: 28px; border-radius: var(--ref-radius-03); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; font-size: 12px; color: var(--sys-color-neutral-800); }
.wide:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.wide:active { --sq-overlay: var(--interaction-light-gray-pressed); }
.wide:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.wide > .eic { color: var(--sys-color-neutral-700); }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { --sq-line: var(--sys-color-neutral-600); }
.cb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 컴포넌트가 그린 선(읽기 전용): 견본 · 색 · 투명도, 아래 줄에 위치 · 두께 */
.cstroke { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); font-size: 12px; color: var(--sys-color-neutral-700); }
.cs-sw { width: 14px; height: 14px; flex: none; border-radius: 3px; --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.cs-a { margin-left: auto; color: var(--sys-color-neutral-500); }
.cstroke-meta { display: flex; justify-content: space-between; padding: 0 var(--ref-spacing-02); }
</style>
