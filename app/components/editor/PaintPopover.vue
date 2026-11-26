<script lang="ts">
/** 열린 칠 창 차례(맨 위 창만 Esc 로 닫혀요 — 그라디언트 지점 색 창이 위에 겹쳐 뜰 때) */
const OPEN_STACK: symbol[] = []
</script>

<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { GradStop, LayerStyle, Paint } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { paintLayer } from '~/canvas/paint'
import { useImageSrc, prepareImage } from '~/canvas/images'
import { fromRgba, hexOf, alphaOf, normHex, toRgba, withAlpha } from '~/canvas/color'
import { parseColor, useTokenCatalog, type CatalogToken } from '~/canvas/tokens'
import ColorPicker from '~/components/editor/ColorPicker.vue'
import { squirclePath } from '~/canvas/squircle'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'

/**
 * 칠 편집 창(피그마 칠 팝오버와 같아요). 오른쪽 패널 왼쪽에 떠요.
 * - Custom: 칠 종류(단색 · 그라디언트 · 이미지)
 *   · 단색: 색 판 + 아래 '이 페이지의 색'
 *   · 그라디언트: 조절창만 — [종류 ▾ · 각도 · 뒤집기 · 90° 돌리기] · 막대(위에 지점 핀) · Stops 목록. 지점 색은 행 견본을 누르면 옆에 색 창이 따로 떠요
 *   · 이미지: [맞춤 ▾] · 미리보기 + 올리기
 * - Libraries: 디자인 시스템 색(검색 · 묶음 고르기 · 격자 ↔ 목록). 지금 연결된 색은 파랗게
 * sid 가 있으면 끄는 동안 실행취소를 한 번으로 묶어요
 */
const props = withDefaults(defineProps<{
  anchor: HTMLElement | null
  paint: Paint
  types?: Paint['type'][]
  sid?: string | null
  /** 여러 화면(프레임)을 함께 고칠 때: 끄는 동안 모두 잡아 두고 실행취소를 한 번으로 */
  sids?: string[]
  /** Libraries 탭에서 고른 토큰을 연결할 수 있는지(아니면 그 색 값만 써요) */
  bindable?: boolean
  /** 지금 연결된 토큰 id(Libraries 목록에서 표시) */
  boundId?: string | null
  /** 처음 열 탭 */
  initialTab?: 'custom' | 'libraries'
  title?: string
}>(), { types: () => ['solid'], sid: null, bindable: false, boundId: null, initialTab: 'custom', title: 'Color' })
const emit = defineEmits<{ update: [p: Paint]; token: [t: CatalogToken]; close: []; type: [t: Paint['type']] }>()

const store = useLayerStore()
const supabase = useSupabaseClient()
const preview = useDevPreview()
const imageSrc = useImageSrc()
const catalog = useTokenCatalog()

const tab = ref<'custom' | 'libraries'>(props.initialTab)
const el = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
const W = 240

function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  // 오른쪽 패널 바로 왼쪽. 다른 창(효과 · 격자 · 칠 창) 안에서 열면 그 창 왼쪽에 붙여서 겹치지 않게
  const panel = a.closest('[role="dialog"], aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const vh = window.innerHeight
  const h = Math.min(el.value?.offsetHeight ?? 520, vh - 16)
  const left = Math.max(8, panel.left - W - 8)
  const top = Math.max(8, Math.min(vh - h - 8, r.top - 48))
  pos.value = { left: left + 'px', top: top + 'px' }
}
onMounted(() => { place(); nextTick(place) })
watch(() => [props.paint.type, tab.value, props.anchor], () => nextTick(place))

// 바깥 누르기 · Esc 로 닫기
const me = Symbol('paint-pop')
function onDoc(e: PointerEvent) {
  const t = e.target as Node | null
  if (!t || el.value?.contains(t) || props.anchor?.contains(t)) return
  // 위에 겹친 칠 창 · 떠 있는 메뉴(토큰 목록 · 드롭다운) 안을 누른 것은 무시
  if ((t as HTMLElement).closest?.('.tp, .esel-m')) return
  const pop = (t as HTMLElement).closest?.('.paint-pop')
  if (pop && OPEN_STACK.indexOf(me) < OPEN_STACK.length - 1) return
  emit('close')
}
/** Esc: 맨 위 창만. 창 안에 열린 드롭다운(형식 · 맞춤)이 있으면 그것만 닫히게 넘기고, 아니면 창을 닫고 연 견본으로 포커스를 돌려줘요 */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || OPEN_STACK[OPEN_STACK.length - 1] !== me) return
  if (el.value?.querySelector('.esel-m')) return
  e.stopPropagation()
  e.preventDefault()
  props.anchor?.focus()
  emit('close')
}
const onReflow = (e: Event) => { if (!(e.target instanceof Node && el.value?.contains(e.target))) place() }
onMounted(() => {
  OPEN_STACK.push(me)
  document.addEventListener('pointerdown', onDoc, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onReflow)
  window.addEventListener('scroll', onReflow, true)
})
onBeforeUnmount(() => {
  const i = OPEN_STACK.indexOf(me)
  if (i >= 0) OPEN_STACK.splice(i, 1)
  document.removeEventListener('pointerdown', onDoc, true)
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', onReflow)
  window.removeEventListener('scroll', onReflow, true)
  release()
})
const holdIds = () => (props.sids?.length ? props.sids : props.sid ? [props.sid] : [])
const hold = () => { for (const id of holdIds()) store.hold(id) }
const release = () => store.batch(() => { for (const id of holdIds()) store.release(id) })

// --- 종류: 단색 · 그라디언트(선형 · 방사형 · 각도형은 아래 ▾ 로) · 이미지 ---
type Kind = 'solid' | 'gradient' | 'image'
const GRADS = ['linear', 'radial', 'angular'] as const
const isGrad = (p: Paint): p is Extract<Paint, { stops: unknown }> => p.type === 'linear' || p.type === 'radial' || p.type === 'angular'
const kindOf = (t: Paint['type']): Kind => (t === 'solid' ? 'solid' : t === 'image' ? 'image' : 'gradient')
const kinds = computed(() => (['solid', 'gradient', 'image'] as Kind[]).filter((k) => props.types.some((t) => kindOf(t) === k)))
const KIND_LABEL: Record<Kind, string> = { solid: 'Solid', gradient: 'Gradient', image: 'Image' }
const gradKinds = computed(() => GRADS.filter((g) => props.types.includes(g)).map((g) => ({ value: g, label: g === 'linear' ? 'Linear' : g === 'radial' ? 'Radial' : 'Angular' })))
function pickKind(k: Kind) {
  if (kindOf(props.paint.type) === k) return
  emit('type', k === 'gradient' ? (gradKinds.value[0]?.value ?? 'linear') : k)
}

// --- 단색: 색(#RRGGBB) + 칠 투명도를 한 색 판으로 ---
const solidColor = computed(() => (props.paint.type === 'solid' ? withAlpha(hexOf(store.color(props.paint.color) ?? props.paint.color), (props.paint.opacity ?? 1) * alphaOf(store.color(props.paint.color) ?? props.paint.color)) : '#000000'))
function setSolid(c: string) {
  if (props.paint.type !== 'solid') return
  const a = alphaOf(c)
  emit('update', { ...props.paint, color: hexOf(c), opacity: a >= 1 ? undefined : a })
}

// --- 그라디언트 ---
const stop = ref(0)
watch(() => props.paint.type, () => { stop.value = 0; stopPop.value = null })
const stops = computed(() => (isGrad(props.paint) ? props.paint.stops : []))
/** Stops 목록은 위치 순서로(피그마와 같아요) — 값은 원래 순번 */
const order = computed(() => stops.value.map((_, i) => i).sort((a, b) => stops.value[a]!.pos - stops.value[b]!.pos || a - b))
const gradCss = computed(() => {
  const s = [...stops.value].sort((a, b) => a.pos - b.pos).map((x) => `${store.color(x.color) ?? x.color} ${Math.round(x.pos * 1000) / 10}%`).join(', ')
  return `linear-gradient(to right, ${s}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`
})
function setStops(next: GradStop[]) {
  if (isGrad(props.paint)) emit('update', { ...props.paint, stops: next.map((s) => (s.token ? s : { pos: s.pos, color: s.color })) })
}
/** 색을 직접 바꾸면(색 판 · hex · 투명도) 토큰 연결은 풀려요 — 토큰을 고를 때만 token 을 함께 넘겨요 */
const setStop = (k: number, patch: Partial<GradStop>) => setStops(stops.value.map((s, i) => (i === k ? { ...s, ...patch, ...(patch.color !== undefined && !('token' in patch) ? { token: undefined } : {}) } : s)))
const bindStop = (k: number, t: CatalogToken) => { if (t.color) setStop(k, { color: t.color, token: t.id }) }
const unbindStop = (k: number) => setStop(k, { token: undefined })
/** 두 색 사이 색 */
function mix(a: string, b: string, t: number) {
  const x = toRgba(a), y = toRgba(b)
  return fromRgba({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t })
}
function colorAt(p: number) {
  const s = [...stops.value].sort((a, b) => a.pos - b.pos)
  if (!s.length) return '#000000'
  if (p <= s[0]!.pos) return s[0]!.color
  for (let i = 1; i < s.length; i++) if (p <= s[i]!.pos) return mix(s[i - 1]!.color, s[i]!.color, (p - s[i - 1]!.pos) / Math.max(1e-6, s[i]!.pos - s[i - 1]!.pos))
  return s[s.length - 1]!.color
}
const bar = ref<HTMLElement | null>(null)
/** 지점 핀 모양(22 squircle 60% + 아래 꼭지). 선이 안쪽 0.5 에 오게 — 꼭지 쪽은 몸통 아랫선을 덮개(.cv)로 가려서 외곽선이 하나로 이어져요 */
const PIN_BODY = squirclePath(22, 22, [6, 6, 6, 6], 0.6, 0.5)
/** 막대를 누르면 그 자리에 지점 더하기, 핀을 끌면 옮기기 */
function onBar(e: PointerEvent, k?: number) {
  const b = bar.value
  if (!b || e.button !== 0) return
  e.preventDefault()
  const r = b.getBoundingClientRect()
  const at = (ev: PointerEvent) => Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * 100) / 100
  hold()
  let idx = k
  if (idx === undefined) {
    const p = at(e)
    idx = stops.value.length // 방금 더하는 지점
    setStops([...stops.value, { pos: p, color: colorAt(p) }])
  }
  stop.value = idx
  const target = e.currentTarget as HTMLElement
  ;(target as HTMLElement).focus?.()
  try { target.setPointerCapture?.(e.pointerId) } catch { /* 합성 이벤트 */ }
  const move = (ev: PointerEvent) => setStop(idx!, { pos: at(ev) })
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); release() }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}
/** + : 고른 지점과 다음 지점 사이(끝이면 앞 지점과의 사이)에 더하기 */
function addStop() {
  const o = order.value
  const at = o.indexOf(stop.value)
  const a = stops.value[o[at] ?? 0], b = stops.value[o[at + 1] ?? -1] ?? stops.value[o[at - 1] ?? -1]
  const p = a && b ? Math.round(((a.pos + b.pos) / 2) * 100) / 100 : 0.5
  setStops([...stops.value, { pos: p, color: colorAt(p) }])
  stop.value = stops.value.length // 다음 그리기에서 새 지점
}
function removeStop(k = stop.value) {
  if (stops.value.length <= 2) return
  if (stopPop.value === k) stopPop.value = null
  setStops(stops.value.filter((_, i) => i !== k))
  stop.value = Math.max(0, Math.min(stops.value.length - 2, k > stop.value ? stop.value : stop.value - 1))
}
function onStopKey(e: KeyboardEvent, k: number) {
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); removeStop(k) }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation()
    const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01)
    setStop(k, { pos: Math.round(Math.min(1, Math.max(0, stops.value[k]!.pos + d)) * 100) / 100 })
  }
}
function onPos(k: number, e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace('%', ''))
  if (!Number.isFinite(v)) { input.value = Math.round(stops.value[k]!.pos * 100) + '%'; return }
  setStop(k, { pos: Math.min(100, Math.max(0, v)) / 100 })
}
function onStopHex(k: number, e: Event) {
  const input = e.target as HTMLInputElement
  const v = normHex(input.value)
  const cur = stops.value[k]!.color
  if (!v) { input.value = hexOf(store.color(cur) ?? cur).slice(1); return }
  setStop(k, { color: v.length > 7 ? v : withAlpha(v, alphaOf(store.color(cur) ?? cur)) })
}
function onStopAlpha(k: number, e: Event) {
  const input = e.target as HTMLInputElement
  const a = Number(input.value.replace('%', ''))
  const cur = stops.value[k]!.color
  if (!Number.isFinite(a)) { input.value = String(Math.round(alphaOf(store.color(cur) ?? cur) * 100)); return }
  setStop(k, { color: withAlpha(hexOf(store.color(cur) ?? cur), Math.min(100, Math.max(0, a)) / 100) })
}
const angle = computed(() => (isGrad(props.paint) ? props.paint.angle ?? (props.paint.type === 'linear' ? 180 : 0) : 0))
function setAngle(v: number) { if (isGrad(props.paint)) emit('update', { ...props.paint, angle: ((Math.round(v) % 360) + 360) % 360 }) }
/** 방향 뒤집기: 지점 위치를 거꾸로 */
function flip() { setStops(stops.value.map((s) => ({ ...s, pos: Math.round((1 - s.pos) * 100) / 100 }))) }

// 지점 색 창(행 견본을 누르면 이 창 왼쪽에 단색 창이 떠요)
const stopPop = ref<number | null>(null)
const stopAnchors = shallowReactive(new Map<number, HTMLElement>())
const stopRef = (k: number) => (x: unknown) => { if (x) stopAnchors.set(k, x as HTMLElement); else stopAnchors.delete(k) }
const stopPaint = computed<Paint | null>(() => {
  const s = stopPop.value === null ? undefined : stops.value[stopPop.value]
  if (!s) return null
  const c = store.color(s.color) ?? s.color
  return { type: 'solid', color: hexOf(c), opacity: alphaOf(c) < 1 ? alphaOf(c) : undefined }
})
function openStop(k: number) { stop.value = k; stopPop.value = stopPop.value === k ? null : k }
function onStopPaint(p: Paint) { if (stopPop.value !== null && p.type === 'solid') setStop(stopPop.value, { color: withAlpha(p.color, p.opacity ?? 1) }) }

// --- 이미지 ---
const FITS = [{ value: 'fill', label: 'Fill' }, { value: 'fit', label: 'Fit' }, { value: 'crop', label: 'Crop' }, { value: 'tile', label: 'Tile' }]
const fileEl = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dropping = ref(false)
const hasImg = computed(() => props.paint.type === 'image' && !!props.paint.src)
/** 미리보기: 맞춤과 상관없이 이미지 전체를 칸 안에(피그마와 같아요) */
const imgCss = computed(() => {
  if (props.paint.type !== 'image') return {}
  const l = paintLayer({ ...props.paint, fit: 'fit', opacity: undefined }, store.color, imageSrc)
  return l ? { backgroundImage: l.image, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}
})
/** Tile 크기(피그마 Tile 옆 %): 원래 크기 대비 */
const tilePct = computed(() => (props.paint.type === 'image' ? Math.round((props.paint.scale ?? 1) * 100) : 100))
function setTile(e: Event) {
  const v = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (props.paint.type !== 'image' || !Number.isFinite(v) || v <= 0) return
  emit('update', { ...props.paint, scale: Math.min(1000, v) / 100 === 1 ? undefined : Math.min(1000, v) / 100 })
}
async function useFile(f?: File | null) {
  if (!f || props.paint.type !== 'image') return
  if (!f.type.startsWith('image/')) return
  uploading.value = true
  const before = props.paint
  try {
    // 크기 재기 · 4096 줄이기만 기다리고 바로 바꿔 보여 줘요. 올리기는 뒤에서(img.done)
    const img = await prepareImage(f, (props.sid ?? 'fills').replace(':', '-'), { supabase, preview })
    // 그림을 바꾸면 원래 크기도 새로, 자르기는 새 그림 비율로 다시 덮게
    if (props.paint.type === 'image') { const { crop: _c, ...rest } = props.paint; emit('update', { ...rest, src: img.src, iw: img.w, ih: img.h }) }
    // 올리기에 실패하면 원래 그림으로 되돌려요(그새 다른 그림을 골랐으면 그대로)
    await img.done.catch(() => { if (props.paint.type === 'image' && props.paint.src === img.src) emit('update', before) })
  } catch { /* 크기 한도 등 — 그림은 그대로 */ } finally { uploading.value = false }
}
function onFile(e: Event) { const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = ''; useFile(f) }
function onDrop(e: DragEvent) { dropping.value = false; useFile([...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))) }

// --- 이 페이지의 색: 쓰인 색. 토큰이 걸린 색은 토큰으로(누르면 연결돼요 — 피그마와 같아요) ---
const pageColors = computed(() => {
  const seen = new Map<string, { c: string; t?: CatalogToken }>()
  const add = (c?: string, tokenId?: string) => {
    const t = tokenId ? catalog.find(tokenId) : undefined
    const v = t?.color ?? store.color(c) ?? c
    const p = v ? parseColor(v) : null
    if (!p) return
    const key = p.a < 1 ? withAlpha(p.hex, p.a) : p.hex
    const had = seen.get(key)
    if (!had || (t && !had.t)) seen.set(key, { c: key, t })
  }
  const walk = (s?: LayerStyle) => {
    if (!s) return
    const vars = s.vars as Record<string, string> | undefined
    add(s.fill, vars?.fill); add(s.stroke, vars?.stroke); add(s.color, vars?.color)
    for (const p of [...(s.fills ?? []), ...(s.strokes ?? [])]) {
      if (p.type === 'solid') add(p.opacity !== undefined ? withAlpha(hexOf(p.color), p.opacity) : p.color)
      else if (isGrad(p)) p.stops.forEach((x) => add(x.color))
    }
  }
  for (const d of Object.values(store.docs)) {
    walk(d.frame)
    for (const n of Object.values(d.nodes)) { walk(n.style); if (seen.size >= 36) break }
    if (seen.size >= 36) break
  }
  return [...seen.values()].slice(0, 36)
})
function pickSwatch(c: string) {
  if (props.paint.type === 'solid') setSolid(c)
  else if (isGrad(props.paint)) setStop(stop.value, { color: c })
}
const pickPage = (x: { c: string; t?: CatalogToken }) => (x.t ? pickToken(x.t) : pickSwatch(x.c))

// --- Libraries ---
const q = ref('')
/** 보기 방식: 견본 격자 / 이름 목록(피그마 Libraries 의 격자 ↔ 목록 전환). 기기에 기억해요 */
const LIB_VIEW = 'iris-lib-view'
const libView = ref<'grid' | 'list'>('grid')
onMounted(() => { try { if (localStorage.getItem(LIB_VIEW) === 'list') libView.value = 'list' } catch {} })
function toggleLibView() {
  libView.value = libView.value === 'grid' ? 'list' : 'grid'
  try { localStorage.setItem(LIB_VIEW, libView.value) } catch {}
}
/** 묶음 이름 'System · brand' → 모음(System) · 묶음(brand) */
const splitGroup = (g: string) => { const m = /^(System|Palette) · (.+)$/.exec(g); return m ? { col: m[1]!, sub: m[2]! } : { col: g, sub: '' } }
const LIB_NAME = '바드림 Design System'
const col = ref('all')
const collections = computed(() => {
  const set = new Set(catalog.list(['color']).map((t) => splitGroup(t.group).col))
  return [{ value: 'all', label: 'All libraries' }, ...[...set].map((c) => ({ value: c, label: c, raw: true }))]
})
/** 목록에 보일 이름: 묶음 이름은 위 머리에 있으니 마지막 조각만 */
const shortName = (t: CatalogToken) => t.name.split('/').pop() ?? t.name
const libs = computed(() => {
  if (tab.value !== 'libraries') return []
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const out: { col: string; groups: { name: string; items: CatalogToken[] }[] }[] = []
  for (const t of catalog.list(['color'])) {
    const { col: c, sub } = splitGroup(t.group)
    if (col.value !== 'all' && c !== col.value) continue
    const hay = `${t.name} ${t.group} ${t.value}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    let cg = out.find((x) => x.col === c)
    if (!cg) out.push((cg = { col: c, groups: [] }))
    let g = cg.groups.find((x) => x.name === sub)
    if (!g) cg.groups.push((g = { name: sub, items: [] }))
    g.items.push(t)
  }
  return out
})
watch(tab, (t) => { if (t === 'libraries') catalog.ensure() }, { immediate: true })
function pickToken(t: CatalogToken) {
  if (props.bindable && props.paint.type === 'solid') { emit('token', t); return }
  if (t.color) pickSwatch(t.color)
}
/** 연결된 토큰이 보이게 처음 한 번 스크롤 */
const libList = ref<HTMLElement | null>(null)
watch([libList, libView], () => nextTick(() => libList.value?.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'center' })))
const swatchBg = (c: string) => ({ background: `linear-gradient(${c}, ${c}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px` })
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
const sel = (e: FocusEvent) => (e.target as HTMLInputElement).select()
</script>

<template>
  <Teleport to="body">
    <!-- body 로 옮겨져도 편집기 공통 규칙(메뉴 · 칸 · 즉시 호버)을 받도록 editor 클래스를 붙여요 -->
    <div ref="el" v-front :class="['sq', 'paint-pop', 'editor', { lib: tab === 'libraries' }]" role="dialog" :aria-label="tr(title)" :style="pos">
      <div class="pp-h">
        <div class="pp-tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'custom'" :class="['sq', 'pp-tab', { on: tab === 'custom' }]" @click="tab = 'custom'">{{ tr('Custom') }}</button>
          <button role="tab" :aria-selected="tab === 'libraries'" :class="['sq', 'pp-tab', { on: tab === 'libraries' }]" @click="tab = 'libraries'">{{ tr('Libraries') }}</button>
        </div>
        <button class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
      </div>

      <div v-ovscroll class="pp-scroll">
        <template v-if="tab === 'custom'">
          <div v-if="kinds.length > 1" class="pp-types" role="radiogroup" :aria-label="tr('Paint type')">
            <button
              v-for="k in kinds"
              :key="k"
              role="radio"
              :aria-checked="kindOf(paint.type) === k"
              :aria-label="tr(KIND_LABEL[k])"
              :data-tip="tr(KIND_LABEL[k])"
              :class="['sq', 'ib', 'pp-type', { on: kindOf(paint.type) === k }]"
              @click="pickKind(k)"
            >
              <EditorIcon :name="k === 'solid' ? 'paint_solid' : k === 'gradient' ? 'paint_gradient' : 'paint_image'" />
            </button>
          </div>

          <div class="pp-body">
            <!-- 단색 -->
            <ColorPicker v-if="paint.type === 'solid'" :model-value="solidColor" tokens @update:model-value="setSolid" @token="pickToken" @start="hold" @end="release" />

            <!-- 그라디언트: 조절창만(피그마와 같아요) -->
            <template v-else-if="isGrad(paint)">
              <div class="gr-tools">
                <EditorSelect class="gr-kind" :model-value="paint.type" :options="gradKinds" ariaLabel="Gradient type" @update:model-value="(v) => emit('type', v as Paint['type'])" />
                <label v-if="paint.type !== 'radial'" class="sq fld ang" :data-tip="tr('Angle')">
                  <EditorIcon name="angle" />
                  <input :key="'g' + angle" :value="angle + '°'" inputmode="numeric" :aria-label="tr('Angle')" @change="setAngle(Number(($event.target as HTMLInputElement).value.replace('°', '')) || 0)" @keydown="blur" @focus="sel">
                </label>
                <span class="grow" />
                <button class="ib s24" :aria-label="tr('Flip gradient')" :data-tip="tr('Flip gradient')" @click="flip"><EditorIcon name="flip_gradient" /></button>
                <button v-if="paint.type !== 'radial'" class="ib s24" :aria-label="tr('Rotate 90°')" :data-tip="tr('Rotate 90°')" @click="setAngle(angle + 90)"><EditorIcon name="rotate_90" /></button>
              </div>
              <!-- 막대: 지점 핀은 막대 위에(피그마와 같아요), 고른 핀은 파랗게. 막대를 누르면 그 자리에 지점 더하기 -->
              <div ref="bar" class="gr-bar" :title="tr('Click to add a color stop')" @pointerdown="onBar($event)">
                <span class="sq sq-clip gr-bg" :style="{ background: gradCss }" aria-hidden="true" />
                <button
                  v-for="(s, k) in stops"
                  :key="k"
                  :class="['gr-pin', { on: k === stop }]"
                  :style="{ left: s.pos * 100 + '%' }"
                  :aria-label="tr('Color stop {n} at {pos}%', { n: order.indexOf(k) + 1, pos: Math.round(s.pos * 100) })"
                  @pointerdown.stop="onBar($event, k)"
                  @keydown="onStopKey($event, k)"
                ><svg class="pin-shape" width="22" height="27" viewBox="0 0 22 27" aria-hidden="true"><path :d="PIN_BODY" /><path d="M7 21L11 26L15 21Z" /><path class="cv" d="M6.6 19.5H15.4L11 25.1Z" /></svg><span class="sq sq-clip pin-face" :style="swatchBg(store.color(s.color) ?? s.color)" /></button>
              </div>
              <div class="st-h">
                <span>{{ tr('Stops') }}</span>
                <button class="ib s24" :aria-label="tr('Add color stop')" :data-tip="tr('Add color stop')" @click="addStop"><EditorIcon name="plus" :size="16" /></button>
              </div>
              <div class="st-list">
                <div v-for="k in order" :key="k" :class="['st-row', { on: k === stop }]" @pointerdown="stop = k">
                  <label class="sq fld st-pos"><input :key="'p' + k + stops[k]!.pos" :value="Math.round(stops[k]!.pos * 100) + '%'" inputmode="numeric" :aria-label="tr('Stop {n} position', { n: order.indexOf(k) + 1 })" @change="onPos(k, $event)" @keydown="blur" @focus="sel"></label>
                  <div :class="['sq', 'fld', 'st-col', { open: stopPop === k, bound: !!stops[k]!.token }]">
                    <button :ref="stopRef(k)" class="sq sq-clip swatch" :style="swatchBg(store.color(stops[k]!.color) ?? stops[k]!.color)" :aria-label="tr('Edit stop {n} color', { n: order.indexOf(k) + 1 })" :aria-expanded="stopPop === k" @click="openStop(k)" />
                    <!-- 토큰이 연결된 지점: 토큰 박스(Fill 행과 같아요) — Backspace · 풀기로 떼요 -->
                    <TokenPicker v-if="stops[k]!.token" :kinds="['color']" :bound="stops[k]!.token" label="Stop color" @pick="(t) => bindStop(k, t)" @unbind="unbindStop(k)" />
                    <template v-else>
                    <input :key="'h' + k + stops[k]!.color" class="hex" :value="hexOf(store.color(stops[k]!.color) ?? stops[k]!.color).slice(1)" :aria-label="tr('Stop {n} hex', { n: order.indexOf(k) + 1 })" spellcheck="false" @change="onStopHex(k, $event)" @keydown="blur" @focus="sel">
                    <TokenPicker :kinds="['color']" reveal label="Stop color" @pick="(t) => bindStop(k, t)" />
                    <span class="vsep" aria-hidden="true" />
                    <span class="op"><input :key="'a' + k + stops[k]!.color" class="pct" :value="Math.round(alphaOf(store.color(stops[k]!.color) ?? stops[k]!.color) * 100)" inputmode="numeric" :aria-label="tr('Stop {n} opacity', { n: order.indexOf(k) + 1 })" @change="onStopAlpha(k, $event)" @keydown="blur" @focus="sel"><i class="unit">%</i></span>
                    </template>
                  </div>
                  <button class="ib s24" :aria-label="tr('Remove stop')" :data-tip="tr('Remove stop')" :disabled="stops.length <= 2" @click="removeStop(k)"><EditorIcon name="minus" :size="16" /></button>
                </div>
              </div>
              <PaintPopover
                v-if="stopPop !== null && stopPaint"
                :key="'sp' + stopPop"
                :anchor="stopAnchors.get(stopPop) ?? null"
                :paint="stopPaint"
                :sid="sid"
                bindable
                :bound-id="stops[stopPop]?.token ?? null"
                title="Color"
                @token="(t) => stopPop !== null && bindStop(stopPop, t)"
                @update="onStopPaint"
                @close="stopPop = null"
              />
            </template>

            <!-- 이미지 -->
            <template v-else-if="paint.type === 'image'">
              <div class="img-tools">
                <EditorSelect class="img-fit" :model-value="(paint as { fit?: string }).fit ?? 'fill'" :options="FITS" ariaLabel="Image fit" @update:model-value="(v) => emit('update', { ...paint, fit: v } as Paint)" />
                <label v-if="(paint as { fit?: string }).fit === 'tile'" class="sq fld img-tile"><input :key="'t' + tilePct" :value="tilePct + '%'" inputmode="numeric" :aria-label="tr('Tile size')" @change="setTile" @keydown="blur" @focus="sel"></label>
              </div>
              <div
                class="sq sq-clip img-box"
                :class="{ drop: dropping, has: hasImg }"
                @dragover.prevent="dropping = true"
                @dragleave="dropping = false"
                @drop.prevent="onDrop"
              >
                <div class="img-prev" :style="imgCss" />
                <button :class="['sq', 'img-choose', { primary: !hasImg }]" :disabled="uploading" @click="fileEl?.click()">{{ uploading ? tr('Uploading…') : hasImg ? tr('Replace image') : tr('Upload from computer') }}</button>
              </div>
              <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden @change="onFile">
            </template>
          </div>

          <div v-if="paint.type === 'solid' && pageColors.length" class="pp-sw">
            <div class="sw-h">{{ tr('On this page') }}</div>
            <div class="sw-grid">
              <button v-for="x in pageColors" :key="x.c" :class="['sq', 'sq-clip', 'sw', { on: !!x.t && x.t.id === boundId }]" :style="swatchBg(x.c)" :aria-label="x.t?.name ?? x.c" :data-tip="x.t ? `${x.t.name} · ${x.t.value}` : x.c" @click="pickPage(x)" />
            </div>
          </div>
        </template>

        <template v-else>
          <!-- 피그마 Libraries: 검색 줄 · [모음 ▾ · 격자 ↔ 목록] 줄 · 묶음별 색 -->
          <div class="lib-sr"><label class="sq lib-s"><EditorIcon name="search" :size="16" class="muted" /><input v-model="q" :placeholder="tr('Search')" :aria-label="tr('Search library colors')" spellcheck="false"></label></div>
          <div class="lib-top">
            <EditorSelect class="lib-col" :model-value="col" :options="collections" ariaLabel="Library" @update:model-value="(v) => (col = v)" />
            <span class="grow" />
            <button type="button" class="ib s24" :aria-label="libView === 'grid' ? tr('Show as list') : tr('Show as grid')" :data-tip="libView === 'grid' ? tr('Show as list') : tr('Show as grid')" @click="toggleLibView"><EditorIcon :name="libView === 'grid' ? 'view_list' : 'view_grid'" /></button>
          </div>
          <div ref="libList" :class="['lib-l', libView]">
            <div v-for="c in libs" :key="c.col" class="lib-c">
              <div class="lib-path"><span class="muted">{{ LIB_NAME }} /</span> {{ c.col }}</div>
              <div v-for="g in c.groups" :key="g.name" class="lib-g">
                <div v-if="g.name" class="sw-h">{{ g.name }}</div>
                <div v-if="libView === 'grid'" class="lib-grid">
                  <button v-for="t in g.items" :key="t.id" :class="['sq', 'sq-clip', 'lsw', { on: t.id === boundId }]" :style="swatchBg(t.color ?? '#000')" :aria-label="t.name" :data-tip="`${t.name} · ${t.value}`" @click="pickToken(t)" />
                </div>
                <div v-else class="lib-rows">
                  <button v-for="t in g.items" :key="t.id" type="button" :class="['sq', 'lib-row', { on: t.id === boundId }]" :aria-label="t.name" :data-tip="t.value" @click="pickToken(t)">
                    <span class="sq sq-clip sw-s" :style="swatchBg(t.color ?? '#000')" />
                    <span class="lr-n">{{ shortName(t) }}</span>
                  </button>
                </div>
              </div>
            </div>
            <p v-if="!libs.length" class="tx-meta m0 empty">{{ tr('No colors found') }}</p>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 피그마 칠 팝오버: 폭 240 · 머리 40(아래 선) · 안쪽 16 · 줄 사이 8. 화면보다 길면 안쪽이 스크롤 */
.paint-pop { position: fixed; z-index: 60; width: 240px; max-height: min(600px, calc(100vh - 16px)); display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; }
.pp-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pp-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; }
/* Libraries: 목록이 길어도 창은 440 까지만(안쪽 스크롤) — 피그마와 비슷한 크기 */
.paint-pop.lib { max-height: min(440px, calc(100vh - 16px)); }
/* 안쪽 묶음은 줄어들지 않게 — 줄면 스크롤 끝에서 아래 여백이 잘려요 */
.pp-scroll > * { flex-shrink: 0; }
.pp-tabs { display: flex; gap: var(--ref-spacing-02); }
.pp-tab { height: 24px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); font-size: 12px; line-height: 24px; font-weight: 500; color: var(--sys-color-neutral-500); }
.pp-tab:hover { color: var(--sys-color-neutral-800); }
.pp-tab.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.s24 { width: 28px; height: 28px; }
/* 오른쪽 끝 아이콘 버튼: 버튼(24) 안 아이콘(16)의 오른쪽이 칸들과 같은 선(안쪽 12)에 오게 4 밖으로 */
.st-h > .ib, .gr-tools > .ib:last-child, .lib-top > .ib { margin-right: calc(-1 * var(--ref-spacing-04)); }
/* 격자 칸 안에서는 margin 이 안 먹어서 자리만 4 옮겨요 */
.st-row > .ib { left: var(--ref-spacing-04); }
/* 칠 종류 줄: 24 버튼 · 16 아이콘 · 사이 4, 고른 것 neutral-100, 아래 선 */
.pp-types { flex: none; display: flex; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-06); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pp-type { width: 28px; height: 28px; color: var(--sys-color-neutral-600); }
.pp-type.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.pp-body { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.grow { flex: 1; }
.m0 { margin: 0; }
.muted { color: var(--sys-color-neutral-500); }
.unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
/* 그라디언트 도구 줄: [종류 ▾ 96] [각도 56] … [뒤집기][90°] */
.gr-tools { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.gr-kind { width: 88px; flex: none; }
.ang { width: 64px; flex: none; gap: var(--ref-spacing-02); padding: 0 var(--ref-spacing-04); }
.ang input { flex: 1; min-width: 0; padding: 0; }
.ang svg { flex: none; color: var(--sys-color-neutral-500); }
/* 막대 32 · 위에 핀 자리 28 */
.gr-bar { position: relative; height: 32px; margin-top: 30px; border-radius: var(--ref-radius-03); cursor: default; touch-action: none; }
.gr-bg { position: absolute; inset: 0; border-radius: inherit; --sq-line: rgb(0 0 0 / 12%); --sq-line-w: 0.5px; pointer-events: none; }
/* 지점 핀: 20 흰 사각(r5) + 아래 꼭지, 안에 색 14. 고른 핀은 파란 바탕 */
.gr-pin { position: absolute; bottom: calc(100% + 6px); width: 22px; height: 22px; padding: 0; transform: translateX(-50%); border-radius: 6px; background: none; cursor: default; --pin-bg: #fff; --pin-line: rgb(3 9 26 / 18%); }
.gr-pin.on { --pin-bg: var(--sys-color-brand-primary-default); --pin-line: color-mix(in srgb, var(--sys-color-brand-primary-default) 80%, #000); z-index: 1; }
.pin-shape { position: absolute; left: 0; top: 0; overflow: visible; filter: drop-shadow(0 1px 2px rgb(3 9 26 / 14%)); pointer-events: none; }
.pin-shape path { fill: var(--pin-bg); stroke: var(--pin-line); stroke-width: 1; stroke-linejoin: round; }
.pin-shape .cv { stroke: none; }
/* 안쪽 색 칩: squircle + 여린 테두리(흰색 · 밝은 색도 칩 경계가 보이게) */
.pin-face { position: absolute; inset: 4px; border-radius: 4px; --sq-line: rgb(3 9 26 / 14%); --sq-line-w: 1px; pointer-events: none; }
.gr-pin:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* Stops: 머리 24 · 행 32(고른 행 옅은 파랑) [위치 48][견본 · hex | %][−] */
.st-h { display: flex; align-items: center; justify-content: space-between; height: 24px; margin-top: var(--ref-spacing-02); font-weight: 500; color: var(--sys-color-neutral-800); }
/* 행 32 안의 칸 28: 위아래 2 를 빼서 마지막 칸 아래도 좌우와 같은 12 */
.st-list { display: flex; flex-direction: column; margin: 0 calc(-1 * var(--ref-spacing-08)) -2px; }
.st-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 24px; gap: var(--ref-spacing-04); align-items: center; height: 32px; padding: 0 var(--ref-spacing-08); }
.st-row.on { background: var(--iris-sel); }
.st-pos { padding: 0 var(--ref-spacing-05); }
.st-pos input { flex: 1; min-width: 0; padding: 0; }
/* 칸 아무 데나 눌러도 숫자로 들어가요 */
.st-pos, .ang { cursor: text; }
.st-col { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); min-width: 0; }
.st-col.bound { padding-right: var(--ref-spacing-04); }
/* 좁은 칸: 변수 버튼은 올리거나 입력 중일 때만 자리를 차지해요(색 값이 잘리지 않게) */
.st-col:not(:hover):not(:focus-within) > :deep(.reveal) { display: none; }
.st-col.open, .st-col:has(input:focus), .st-pos:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 40px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-05) 0 var(--ref-spacing-04); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.swatch { width: 16px; height: 16px; padding: 0; border-radius: var(--ref-radius-02); flex: none; cursor: pointer; --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.swatch:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
/* 이미지: [맞춤 ▾] · 정사각 미리보기(체크) + 가운데 올리기 버튼 */
.img-tools { display: flex; align-items: center; }
.img-tools { gap: var(--ref-spacing-04); }
.img-fit { width: 92px; flex: none; }
.img-tile { width: 64px; flex: none; }
.img-tile input { width: 100%; }
.img-box { position: relative; aspect-ratio: 1; border-radius: var(--ref-radius-03); overflow: hidden; background: repeating-conic-gradient(#ececec 0% 25%, #f8f8f8 0% 50%) 0 0 / 16px 16px; --sq-line: rgb(0 0 0 / 10%); --sq-line-w: 0.5px; display: grid; place-items: center; }
.img-box.drop { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
.img-prev { position: absolute; inset: 0; }
.img-choose { position: relative; height: 28px; padding: 0 var(--ref-spacing-08); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: #fff; --sq-fill: rgb(0 0 0 / 60%); transition: opacity .12s; }
.img-choose.primary { --sq-fill: var(--sys-color-brand-primary-default); }
.img-choose.primary:hover { --sq-fill: var(--sys-color-brand-primary-dark, var(--sys-color-brand-primary-default)); }
.img-box.has .img-choose { opacity: 0; }
.img-box.has:hover .img-choose, .img-choose:focus-visible { opacity: 1; }
.img-box.has .img-choose:hover { --sq-fill: rgb(0 0 0 / 75%); }
/* 이 페이지의 색: 위 선 · 라벨 · 견본 20 (한 줄 8개) */
.pp-sw { padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-08); box-shadow: inset 0 1px 0 var(--iris-line); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.sw-h { font-size: 12px; line-height: 24px; color: var(--sys-color-neutral-800); }
.sw-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: var(--ref-spacing-05); }
.sw { width: 100%; height: auto; aspect-ratio: 1; padding: 0; border-radius: var(--ref-radius-02); --sq-line: rgb(0 0 0 / 10%); --sq-line-w: 1px; cursor: pointer; }
/* 요소가 squircle 로 잘려서 바깥 선 · outline 은 안 보여요 — hover · 포커스는 안쪽 선 색으로 */
.sw:hover, .lsw:hover { --sq-line: var(--sys-color-neutral-500); }
.sw.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
.sw:focus-visible, .lsw:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
/* Libraries: 검색 줄 40(아래 선) · 모음 줄 40(아래 선) · 목록 */
/* 검색은 이리스 공통 검색칸(토큰 목록과 같아요): 28 · neutral-200 · 포커스 파란 선 */
.lib-sr { flex: none; padding: var(--ref-spacing-06) var(--ref-spacing-08) 0; }
.lib-s { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; box-sizing: border-box; padding: 0 var(--ref-spacing-06); border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); cursor: text; }
.lib-s input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 12px; color: var(--sys-color-neutral-800); }
.lib-s input::placeholder { color: var(--sys-color-neutral-500); }
.lib-s:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.lib-top { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); height: 44px; padding: 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.lib-col { width: 120px; flex: none; }
.lib-l { display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-08); }
/* 목록: 행 32 안의 견본 16 아래 8 을 빼서 마지막 견본 아래도 좌우와 같은 12 */
.lib-l.list { padding-bottom: var(--ref-spacing-04); }
.lib-c { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.lib-path { font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.lib-g { display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
/* 격자: 견본 28 · r6 · 한 줄 6개 */
.lib-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--ref-spacing-06); }
.lsw { width: 100%; height: auto; aspect-ratio: 1; padding: 0; border-radius: var(--ref-radius-03); --sq-line: rgb(0 0 0 / 10%); --sq-line-w: 1px; cursor: pointer; }
.lsw.on { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
/* 목록: 행 32 · 견본 16 · 이름 12, 지금 연결된 것은 옅은 파랑 — 좌우는 창 끝까지 */
.lib-rows { display: flex; flex-direction: column; margin: 0 calc(-1 * var(--ref-spacing-08)); }
.lib-row { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 32px; padding: 0 var(--ref-spacing-08); border-radius: 0; text-align: left; font-size: 12px; color: var(--sys-color-neutral-800); }
.lib-row:hover { --sq-fill: var(--sys-color-neutral-100); }
.lib-row.on { --sq-fill: var(--iris-sel); }
.lib-row:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.sw-s { width: 16px; height: 16px; flex: none; border-radius: var(--ref-radius-02); --sq-line: rgb(3 9 26 / 15%); --sq-line-w: 1px; }
.lr-n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { padding: var(--ref-spacing-06) 0; text-align: center; font-size: 12px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 아이콘 버튼의 비활성은 공통 규칙(neutral-400)만 — 겹쳐 흐리게 하지 않아요 */
button:disabled:not(.ib) { opacity: 0.35; pointer-events: none; }
.ib:disabled { pointer-events: none; }
</style>
