<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { LayerStyle, Paint } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { paintLayer } from '~/canvas/paint'
import { useImageSrc, uploadImage } from '~/canvas/images'
import { fromRgba, hexOf, alphaOf, toRgba, withAlpha } from '~/canvas/color'
import { parseColor, useTokenCatalog, type CatalogToken } from '~/canvas/tokens'
import ColorPicker from '~/components/editor/ColorPicker.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'

/**
 * 칠 편집 창(피그마 색 선택기와 같아요). 오른쪽 패널 왼쪽에 떠요.
 * - Custom: 칠 종류(단색 · 선형 · 원형 · 각도 그라디언트 · 이미지) → 색 판 · 그라디언트 막대 · 이미지 고르기, 아래 '이 페이지의 색'
 * - Libraries: 디자인 시스템 색 토큰(누르면 연결)
 * sid 가 있으면 끄는 동안 실행취소를 한 번으로 묶어요
 */
const props = withDefaults(defineProps<{
  anchor: HTMLElement | null
  paint: Paint
  types?: Paint['type'][]
  sid?: string | null
  /** Libraries 탭에서 고른 토큰을 연결할 수 있는지(아니면 그 색 값만 써요) */
  bindable?: boolean
  title?: string
}>(), { types: () => ['solid'], sid: null, bindable: false, title: 'Color' })
const emit = defineEmits<{ update: [p: Paint]; token: [t: CatalogToken]; close: []; type: [t: Paint['type']] }>()

const store = useLayerStore()
const supabase = useSupabaseClient()
const preview = useDevPreview()
const imageSrc = useImageSrc()
const catalog = useTokenCatalog()

const tab = ref<'custom' | 'libraries'>('custom')
const el = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
const W = 240

function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  // 오른쪽 패널 바로 왼쪽. 설정 창(효과 · 격자 팝오버) 안에서 열면 그 창 왼쪽에 붙여서 겹치지 않게
  const panel = a.closest('[role="dialog"], aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const vh = window.innerHeight
  const h = el.value?.offsetHeight ?? 520
  const left = Math.max(8, panel.left - W - 8)
  const top = Math.max(8, Math.min(vh - h - 8, r.top - 48))
  pos.value = { left: left + 'px', top: top + 'px' }
}
onMounted(() => { place(); nextTick(place) })
watch(() => [props.paint.type, tab.value, props.anchor], () => nextTick(place))

// 바깥 누르기 · Esc 로 닫기
function onDoc(e: PointerEvent) {
  const t = e.target as Node | null
  if (!t || el.value?.contains(t) || props.anchor?.contains(t)) return
  // 다른 떠 있는 메뉴(토큰 목록 등) 안을 누른 것은 무시
  if ((t as HTMLElement).closest?.('.tp, .paint-pop')) return
  emit('close')
}
/** Esc: 창 안에 열린 드롭다운(형식 · 맞춤)이 있으면 그것만 닫히게 넘기고, 아니면 창을 닫고 연 견본으로 포커스를 돌려줘요 */
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
  if (props.sid) store.release(props.sid)
})
const hold = () => { if (props.sid) store.hold(props.sid) }
const release = () => { if (props.sid) store.release(props.sid) }

// --- 종류 ---
const TYPES: Record<Paint['type'], { label: string }> = {
  solid: { label: 'Solid' }, linear: { label: 'Linear' }, radial: { label: 'Radial' }, angular: { label: 'Angular' }, image: { label: 'Image' },
}
const isGrad = (p: Paint): p is Extract<Paint, { stops: unknown }> => p.type === 'linear' || p.type === 'radial' || p.type === 'angular'

// --- 단색: 색(#RRGGBB) + 칠 투명도를 한 색 판으로 ---
const solidColor = computed(() => (props.paint.type === 'solid' ? withAlpha(hexOf(store.color(props.paint.color) ?? props.paint.color), (props.paint.opacity ?? 1) * alphaOf(store.color(props.paint.color) ?? props.paint.color)) : '#000000'))
function setSolid(c: string) {
  if (props.paint.type !== 'solid') return
  const a = alphaOf(c)
  emit('update', { ...props.paint, color: hexOf(c), opacity: a >= 1 ? undefined : a })
}

// --- 그라디언트 ---
const stop = ref(0)
watch(() => props.paint.type, () => (stop.value = 0))
const stops = computed(() => (isGrad(props.paint) ? props.paint.stops : []))
const stopColor = computed(() => stops.value[stop.value]?.color ?? '#000000')
const gradCss = computed(() => {
  const s = [...stops.value].sort((a, b) => a.pos - b.pos).map((x) => `${store.color(x.color) ?? x.color} ${Math.round(x.pos * 1000) / 10}%`).join(', ')
  return `linear-gradient(to right, ${s}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`
})
function setStops(next: { pos: number; color: string }[]) {
  if (isGrad(props.paint)) emit('update', { ...props.paint, stops: next })
}
function setStopColor(c: string) { setStops(stops.value.map((s, i) => (i === stop.value ? { ...s, color: c } : s))) }
/** 두 색 사이 색 */
function mix(a: string, b: string, t: number) {
  const x = toRgba(a), y = toRgba(b)
  return fromRgba({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t })
}
function colorAt(pos: number) {
  const s = [...stops.value].sort((a, b) => a.pos - b.pos)
  if (!s.length) return '#000000'
  if (pos <= s[0]!.pos) return s[0]!.color
  for (let i = 1; i < s.length; i++) if (pos <= s[i]!.pos) return mix(s[i - 1]!.color, s[i]!.color, (pos - s[i - 1]!.pos) / Math.max(1e-6, s[i]!.pos - s[i - 1]!.pos))
  return s[s.length - 1]!.color
}
const bar = ref<HTMLElement | null>(null)
/** 막대를 누르면 그 자리에 점 더하기, 점을 끌면 옮기기 */
function onBar(e: PointerEvent, k?: number) {
  const b = bar.value
  if (!b) return
  e.preventDefault()
  const r = b.getBoundingClientRect()
  const at = (ev: PointerEvent) => Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * 100) / 100
  hold()
  let idx = k
  if (idx === undefined) {
    const p = at(e)
    idx = stops.value.length // 방금 더하는 점
    setStops([...stops.value, { pos: p, color: colorAt(p) }])
  }
  stop.value = idx
  const target = e.currentTarget as HTMLElement
  try { target.setPointerCapture?.(e.pointerId) } catch { /* 합성 이벤트 */ }
  const move = (ev: PointerEvent) => { const p = at(ev); setStops(stops.value.map((s, i) => (i === idx ? { ...s, pos: p } : s))) }
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); release() }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}
function removeStop() {
  if (stops.value.length <= 2) return
  setStops(stops.value.filter((_, i) => i !== stop.value))
  stop.value = Math.max(0, stop.value - 1)
}
function onStopKey(e: KeyboardEvent, k: number) {
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); stop.value = k; removeStop() }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation()
    const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01)
    setStops(stops.value.map((s, i) => (i === k ? { ...s, pos: Math.round(Math.min(1, Math.max(0, s.pos + d)) * 100) / 100 } : s)))
  }
}
const angle = computed(() => (isGrad(props.paint) ? props.paint.angle ?? (props.paint.type === 'linear' ? 180 : 0) : 0))
function setAngle(v: number) { if (isGrad(props.paint)) emit('update', { ...props.paint, angle: ((Math.round(v) % 360) + 360) % 360 }) }
/** 방향 뒤집기: 점 위치를 거꾸로 */
function flip() { setStops(stops.value.map((s) => ({ ...s, pos: Math.round((1 - s.pos) * 100) / 100 }))) }

// --- 이미지 ---
const FITS = [{ value: 'fill', label: 'Fill' }, { value: 'fit', label: 'Fit' }, { value: 'crop', label: 'Crop' }, { value: 'tile', label: 'Tile' }]
const fileEl = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dropping = ref(false)
const imgCss = computed(() => {
  if (props.paint.type !== 'image') return {}
  const l = paintLayer({ ...props.paint, opacity: undefined }, store.color, imageSrc)
  return l ? { backgroundImage: l.image, backgroundSize: l.size === 'auto' ? (props.paint.fit === 'tile' ? '48px' : '100% 100%') : l.size, backgroundPosition: l.position, backgroundRepeat: l.repeat } : {}
})
async function useFile(f?: File | null) {
  if (!f || props.paint.type !== 'image') return
  if (!f.type.startsWith('image/')) return
  uploading.value = true
  try {
    const img = await uploadImage(f, (props.sid ?? 'fills').replace(':', '-'), { supabase, preview })
    if (props.paint.type === 'image') emit('update', { ...props.paint, src: img.src })
  } finally { uploading.value = false }
}
function onFile(e: Event) { const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = ''; useFile(f) }
function onDrop(e: DragEvent) { dropping.value = false; useFile([...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))) }

// --- 이 페이지의 색 ---
const pageColors = computed(() => {
  const seen = new Set<string>()
  const add = (c?: string) => {
    const v = store.color(c) ?? c
    const p = v ? parseColor(v) : null
    if (!p) return
    seen.add(p.a < 1 ? withAlpha(p.hex, p.a) : p.hex)
  }
  const walk = (s?: LayerStyle) => {
    if (!s) return
    add(s.fill); add(s.stroke); add(s.color)
    for (const p of [...(s.fills ?? []), ...(s.strokes ?? [])]) {
      if (p.type === 'solid') add(p.opacity !== undefined ? withAlpha(hexOf(p.color), p.opacity) : p.color)
      else if (isGrad(p)) p.stops.forEach((x) => add(x.color))
    }
  }
  for (const d of Object.values(store.docs)) {
    walk(d.frame)
    for (const n of Object.values(d.nodes)) { walk(n.style); if (seen.size >= 48) break }
    if (seen.size >= 48) break
  }
  return [...seen].slice(0, 48)
})
function pickSwatch(c: string) {
  if (props.paint.type === 'solid') setSolid(c)
  else if (isGrad(props.paint)) setStopColor(c)
}

// --- Libraries ---
const q = ref('')
/** 보기 방식: 견본 격자 / 이름 · 값 목록(피그마 Libraries 의 격자 ↔ 목록 전환). 기기에 기억해요 */
const LIB_VIEW = 'iris-lib-view'
const libView = ref<'grid' | 'list'>('grid')
onMounted(() => { try { if (localStorage.getItem(LIB_VIEW) === 'list') libView.value = 'list' } catch {} })
function toggleLibView() {
  libView.value = libView.value === 'grid' ? 'list' : 'grid'
  try { localStorage.setItem(LIB_VIEW, libView.value) } catch {}
}
/** 목록에 보일 이름: 묶음 이름은 위 머리에 있으니 마지막 조각만 */
const shortName = (t: CatalogToken) => t.name.split('/').pop() ?? t.name
const libs = computed(() => {
  if (tab.value !== 'libraries') return []
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const out: { name: string; items: CatalogToken[] }[] = []
  for (const t of catalog.list(['color'])) {
    const hay = `${t.name} ${t.group} ${t.value}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    let g = out.find((x) => x.name === t.group)
    if (!g) out.push((g = { name: t.group, items: [] }))
    g.items.push(t)
  }
  return out
})
watch(tab, (t) => { if (t === 'libraries') catalog.ensure() })
function pickToken(t: CatalogToken) {
  if (props.bindable && props.paint.type === 'solid') { emit('token', t); return }
  if (t.color) pickSwatch(t.color)
}
/** 묶음 이름은 문장형(첫 글자만 대문자) */
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const swatchBg = (c: string) => ({ background: `linear-gradient(${c}, ${c}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px` })
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <Teleport to="body">
    <!-- body 로 옮겨져도 편집기 공통 규칙(메뉴 · 칸 · 즉시 호버)을 받도록 editor 클래스를 붙여요 -->
    <div ref="el" class="sq paint-pop editor" role="dialog" :aria-label="title" :style="pos">
      <div class="pp-h">
        <div class="pp-tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'custom'" :class="['sq', 'pp-tab', { on: tab === 'custom' }]" @click="tab = 'custom'">Custom</button>
          <button role="tab" :aria-selected="tab === 'libraries'" :class="['sq', 'pp-tab', { on: tab === 'libraries' }]" @click="tab = 'libraries'">Libraries</button>
        </div>
        <button class="ib s24" aria-label="Close" data-tip="Close" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
      </div>

      <template v-if="tab === 'custom'">
        <div v-if="types.length > 1" class="pp-types" role="radiogroup" aria-label="Paint type">
          <button
            v-for="t in types"
            :key="t"
            role="radio"
            :aria-checked="paint.type === t"
            :aria-label="TYPES[t].label"
            :title="TYPES[t].label"
            :class="['sq', 'ib', 'pp-type', { on: paint.type === t }]"
            @click="paint.type !== t && emit('type', t)"
          >
            <svg v-if="t === 'solid'" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="currentColor" fill-opacity=".85" /></svg>
            <svg v-else-if="t === 'linear'" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><defs><linearGradient :id="`pp-l`" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="currentColor" /><stop offset="1" stop-color="currentColor" stop-opacity=".1" /></linearGradient></defs><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="url(#pp-l)" stroke="currentColor" stroke-width="1" /></svg>
            <svg v-else-if="t === 'radial'" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><defs><radialGradient id="pp-r"><stop offset="0" stop-color="currentColor" /><stop offset="1" stop-color="currentColor" stop-opacity=".1" /></radialGradient></defs><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="url(#pp-r)" stroke="currentColor" stroke-width="1" /></svg>
            <svg v-else-if="t === 'angular'" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1" /><path d="M8 8V2.5h3.5a2 2 0 0 1 2 2V8z" fill="currentColor" fill-opacity=".85" /><path d="M8 8h5.5v3.5a2 2 0 0 1-2 2H8z" fill="currentColor" fill-opacity=".55" /><path d="M8 8v5.5H4.5a2 2 0 0 1-2-2V8z" fill="currentColor" fill-opacity=".3" /></svg>
            <svg v-else width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1" /><circle cx="10.5" cy="5.5" r="1.2" fill="currentColor" /><path d="M2.8 11.5l3.4-3.6 2.7 2.7 1.6-1.4 2.7 2.6" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" /></svg>
          </button>
        </div>

        <div class="pp-body">
          <!-- 단색 -->
          <ColorPicker v-if="paint.type === 'solid'" :model-value="solidColor" @update:model-value="setSolid" @start="hold" @end="release" />

          <!-- 그라디언트 -->
          <template v-else-if="paint.type === 'linear' || paint.type === 'radial' || paint.type === 'angular'">
            <div class="gr-tools">
              <label v-if="paint.type !== 'radial'" class="sq fld ang" title="Angle">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 12.5h10M3 12.5L10 4.5M7.2 7.7a4.5 4.5 0 0 1 1.3 4.8" stroke="currentColor" stroke-width="1.25" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <input :key="'g' + angle" :value="angle" inputmode="numeric" aria-label="Angle" @change="setAngle(Number(($event.target as HTMLInputElement).value) || 0)" @keydown="blur"><span>°</span>
              </label>
              <span class="grow" />
              <button v-if="paint.type !== 'radial'" class="ib s24" aria-label="Rotate 90°" title="Rotate 90°" @click="setAngle(angle + 90)"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2M11.5 1.8v2.6H8.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
              <button class="ib s24" aria-label="Flip gradient" title="Flip gradient" @click="flip"><svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5h10L9.5 2.5M12 9H2l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
              <button class="ib s24" aria-label="Remove stop" title="Remove stop" :disabled="stops.length <= 2" @click="removeStop"><EditorIcon name="minus" :size="16" /></button>
            </div>
            <div ref="bar" class="gr-bar" title="Click to add a color stop" @pointerdown="onBar($event)">
              <span class="sq sq-clip gr-bg" :style="{ background: gradCss }" aria-hidden="true" />
              <button
                v-for="(s, k) in stops"
                :key="k"
                :class="['gr-stop', { on: k === stop }]"
                :style="{ left: s.pos * 100 + '%' }"
                :aria-label="`Color stop ${k + 1} at ${Math.round(s.pos * 100)}%`"
                @pointerdown.stop="onBar($event, k)"
                @keydown="onStopKey($event, k)"
              ><span class="sq gr-ring" /><span class="sq gr-face"><b class="sqc" :style="swatchBg(store.color(s.color) ?? s.color)" /></span></button>
            </div>
            <div class="gr-pos tx-meta">Stop {{ stop + 1 }} · {{ Math.round((stops[stop]?.pos ?? 0) * 100) }}%</div>
            <ColorPicker :model-value="stopColor" @update:model-value="setStopColor" @start="hold" @end="release" />
          </template>

          <!-- 이미지 -->
          <template v-else-if="paint.type === 'image'">
            <div
              class="sq sq-clip img-box"
              :class="{ drop: dropping }"
              @dragover.prevent="dropping = true"
              @dragleave="dropping = false"
              @drop.prevent="onDrop"
            >
              <div class="img-prev" :style="imgCss" />
              <button class="sq img-choose" :disabled="uploading" @click="fileEl?.click()">{{ uploading ? 'Uploading…' : (paint as { src: string }).src ? 'Replace image' : 'Choose image' }}</button>
            </div>
            <EditorSelect :model-value="(paint as { fit?: string }).fit ?? 'fill'" :options="FITS" ariaLabel="Image fit" @update:model-value="(v) => emit('update', { ...paint, fit: v } as Paint)" />
            <p class="tx-meta m0">Drop an image here or choose a file (PNG, JPG, GIF, WebP, SVG)</p>
            <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden @change="onFile">
          </template>
        </div>

        <div v-if="paint.type !== 'image' && pageColors.length" class="pp-sw">
          <div class="sw-h">On this page</div>
          <div class="sw-grid">
            <button v-for="c in pageColors" :key="c" class="sq sq-clip sw" :style="swatchBg(c)" :aria-label="c" :title="c" @click="pickSwatch(c)" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="lib">
          <div class="lib-top">
            <label class="sq fld lib-s"><EditorIcon name="search" :size="16" class="muted" /><input v-model="q" placeholder="Search colors" aria-label="Search library colors" spellcheck="false"></label>
            <button type="button" class="ib s24" :aria-label="libView === 'grid' ? 'Show as list' : 'Show as grid'" :data-tip="libView === 'grid' ? 'Show as list' : 'Show as grid'" @click="toggleLibView"><EditorIcon :name="libView === 'grid' ? 'view_list' : 'view_grid'" /></button>
          </div>
          <div class="lib-l">
            <div v-for="g in libs" :key="g.name" class="lib-g">
              <div class="sw-h">{{ sentence(g.name) }}</div>
              <div v-if="libView === 'grid'" class="sw-grid">
                <button v-for="t in g.items" :key="t.id" class="sq sq-clip sw" :style="swatchBg(t.color ?? '#000')" :aria-label="t.name" :title="`${t.name} · ${t.value}`" @click="pickToken(t)" />
              </div>
              <div v-else class="lib-rows">
                <button v-for="t in g.items" :key="t.id" type="button" class="sq lib-row" :aria-label="t.name" :title="t.name" @click="pickToken(t)">
                  <span class="sqc sw sw-s" :style="swatchBg(t.color ?? '#000')" />
                  <span class="lr-n">{{ shortName(t) }}</span>
                </button>
              </div>
            </div>
            <p v-if="!libs.length" class="tx-meta m0 empty">No colors found</p>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 피그마 칠 팝오버(§9.1 · §9.2): 폭 240 · 머리 40(아래 안쪽 선) · 안쪽 16 · 줄 사이 8 */
.paint-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); font-size: 12px; line-height: 18px; }
.pp-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-04); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pp-tabs { display: flex; gap: var(--ref-spacing-02); }
.pp-tab { height: 24px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); font-size: 12px; line-height: 24px; font-weight: 500; color: var(--sys-color-neutral-500); }
.pp-tab:hover { color: var(--sys-color-neutral-800); }
.pp-tab.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); font-weight: 600; }
.s24 { width: 24px; height: 24px; }
/* 칠 종류 줄: 24 버튼 · 16 아이콘 · 사이 4, 고른 것 neutral-100 */
.pp-types { display: flex; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06) var(--ref-spacing-08) 0; }
.pp-type { width: 24px; height: 24px; color: var(--sys-color-neutral-600); }
.pp-type.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.pp-body { padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.pp-h + .pp-body { padding-top: var(--ref-spacing-08); }
.grow { flex: 1; }
.m0 { margin: 0; }
.gr-tools { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.ang { width: 80px; flex: none; }
.gr-bar { position: relative; height: 20px; margin: 0 8px 18px; border-radius: 4px; cursor: copy; touch-action: none; }
.gr-bg { position: absolute; inset: 0; border-radius: inherit; --sq-line: rgb(0 0 0 / 15%); --sq-line-w: 0.5px; pointer-events: none; }
/* 정지점: 바깥 선(.gr-ring)과 흰 면(.gr-face)을 따로 squircle 로 — 바깥 선이 면 밖에 그려지도록. 위 꼭지는 ::before */
.gr-stop { position: absolute; top: 100%; width: 16px; height: 16px; margin-top: 2px; transform: translateX(-50%); border-radius: 4px; cursor: ew-resize; padding: 0; isolation: isolate; }
.gr-stop::before { content: ''; position: absolute; z-index: 1; left: 50%; top: -4px; width: 0; height: 0; transform: translateX(-50%); border: 3px solid transparent; border-top: 0; border-bottom: 4px solid #fff; filter: drop-shadow(0 -1px 0 rgb(0 0 0 / 20%)); }
.gr-ring { position: absolute; inset: -1px; border-radius: 5px; --sq-line: rgb(0 0 0 / 20%); --sq-line-w: 1px; pointer-events: none; }
.gr-stop.on .gr-ring { inset: -2px; border-radius: 6px; --sq-line: var(--iris-select, #0D99FF); --sq-line-w: 2px; }
.gr-face { position: absolute; inset: 0; box-sizing: border-box; padding: 2px; display: grid; border-radius: 4px; --sq-fill: #fff; filter: drop-shadow(0 1px 3px rgb(0 0 0 / 20%)); pointer-events: none; }
.gr-face b { display: block; border-radius: 2px; }
.gr-stop:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.gr-pos { font-size: 11px; line-height: 16px; }
.img-box { position: relative; height: 160px; border-radius: var(--ref-radius-03); overflow: hidden; background: repeating-conic-gradient(#e6e6e6 0% 25%, #fff 0% 50%) 0 0 / 12px 12px; --sq-line: rgb(0 0 0 / 12%); --sq-line-w: 0.5px; display: grid; place-items: center; }
.img-box.drop { --sq-line: var(--iris-select, #0D99FF); --sq-line-w: 2px; }
.img-prev { position: absolute; inset: 0; }
.img-choose { position: relative; height: 28px; padding: 0 var(--ref-spacing-08); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: #fff; --sq-fill: rgb(0 0 0 / 55%); opacity: 1; transition: opacity .12s; }
.img-box:has(.img-prev[style*='url']) .img-choose { opacity: 0; }
.img-box:hover .img-choose, .img-choose:focus-visible { opacity: 1; }
.img-choose:hover { --sq-fill: rgb(0 0 0 / 70%); }
.pp-body > .tx-meta { font-size: 11px; line-height: 16px; }
/* 견본 묶음: 라벨 11/16 neutral-500 → 견본 16×16 · r4 · 사이 8(208 폭에 9개, 줄마다 고르게) */
.pp-sw { padding: var(--ref-spacing-08); box-shadow: inset 0 1px 0 var(--iris-line); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
/* 묶음 이름: Text styles 창과 같은 12 진하게 */
.sw-h { font-size: 12px; line-height: 18px; font-weight: 400; color: var(--sys-color-neutral-800); }
.sw-grid { display: grid; grid-template-columns: repeat(auto-fill, 16px); justify-content: space-between; gap: var(--ref-spacing-06); }
.sw { width: 16px; height: 16px; padding: 0; border-radius: var(--ref-radius-02); --sq-line: rgb(0 0 0 / 10%); --sq-line-w: 1px; cursor: pointer; }
/* 요소가 squircle 로 잘려서 바깥 선 · outline 은 안 보여요 — hover · 포커스는 안쪽 선 색으로 */
.sw:hover { --sq-line: var(--sys-color-neutral-500); }
.sw:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 2px; }
/* Libraries: 검색 28 · 묶음 사이 12 · 좌우 16 */
.lib { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-08) 0; min-height: 0; }
.lib-top { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); margin: 0 var(--ref-spacing-08); }
.lib-s { flex: 1; min-width: 0; }
/* 목록 보기: 행 28 · 견본 16 · 이름 12 · 값 11 오른쪽(고정폭 숫자), 호버 neutral-100 — 좌우는 칸 끝선에 맞춰 -8 */
.lib-rows { display: flex; flex-direction: column; margin: 0 calc(-1 * var(--ref-spacing-06)); }
.lib-row { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 32px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); text-align: left; font-size: 12px; color: var(--sys-color-neutral-800); }
.lib-row:hover { --sq-fill: var(--sys-color-neutral-100); }
.lib-row:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.sw-s { width: 16px; height: 16px; flex: none; border-radius: var(--ref-radius-01); box-shadow: inset 0 0 0 .5px rgb(3 9 26 / 20%); }
.lr-n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.muted { color: var(--sys-color-neutral-500); }
.lib-l { max-height: 360px; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-04) var(--ref-spacing-08) 0; }
.lib-g { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.empty { padding: var(--ref-spacing-06) 0; text-align: center; font-size: 12px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* 아이콘 버튼의 비활성은 공통 규칙(neutral-400)만 — 겹쳐 흐리게 하지 않아요 */
button:disabled:not(.ib) { opacity: 0.35; pointer-events: none; }
.ib:disabled { pointer-events: none; }
</style>
