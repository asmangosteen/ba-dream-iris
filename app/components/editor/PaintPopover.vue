<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { LayerStyle, Paint } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { paintLayer } from '~/canvas/paint'
import { useImageSrc, uploadImage } from '~/canvas/images'
import { fromRgba, hexOf, alphaOf, toRgba, withAlpha } from '~/canvas/color'
import { parseColor, useTokenCatalog, type CatalogToken } from '~/canvas/tokens'
import ColorPicker from '~/components/editor/ColorPicker.vue'

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
const W = 256

function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  // 오른쪽 패널 바로 왼쪽(패널이 없으면 기준 요소 왼쪽)
  const panel = a.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
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
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); emit('close') } }
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
  target.setPointerCapture?.(e.pointerId)
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
const FITS = [{ k: 'fill', label: 'Fill' }, { k: 'fit', label: 'Fit' }, { k: 'crop', label: 'Crop' }, { k: 'tile', label: 'Tile' }] as const
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
const swatchBg = (c: string) => ({ background: `linear-gradient(${c}, ${c}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px` })
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="sq paint-pop" role="dialog" :aria-label="title" :style="pos">
      <div class="pp-h">
        <div class="pp-tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'custom'" :class="['sq', 'pp-tab', { on: tab === 'custom' }]" @click="tab = 'custom'">Custom</button>
          <button role="tab" :aria-selected="tab === 'libraries'" :class="['sq', 'pp-tab', { on: tab === 'libraries' }]" @click="tab = 'libraries'">Libraries</button>
        </div>
        <button class="ib s24" aria-label="Close" title="Close" @click="emit('close')"><Icon name="close" :size="14" /></button>
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
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 10.5h9M1.5 10.5L8 3" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" /></svg>
                <input :key="'g' + angle" :value="angle" inputmode="numeric" aria-label="Angle" @change="setAngle(Number(($event.target as HTMLInputElement).value) || 0)" @keydown="blur"><span>°</span>
              </label>
              <span class="grow" />
              <button v-if="paint.type !== 'radial'" class="ib s24" aria-label="Rotate 90°" title="Rotate 90°" @click="setAngle(angle + 90)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2M11.5 1.8v2.6H8.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
              <button class="ib s24" aria-label="Flip gradient" title="Flip gradient" @click="flip"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5h10L9.5 2.5M12 9H2l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
              <button class="ib s24" aria-label="Remove stop" title="Remove stop" :disabled="stops.length <= 2" @click="removeStop"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
            </div>
            <div ref="bar" class="gr-bar" :style="{ background: gradCss }" title="Click to add a color stop" @pointerdown="onBar($event)">
              <button
                v-for="(s, k) in stops"
                :key="k"
                :class="['gr-stop', { on: k === stop }]"
                :style="{ left: s.pos * 100 + '%' }"
                :aria-label="`Color stop ${k + 1} at ${Math.round(s.pos * 100)}%`"
                @pointerdown.stop="onBar($event, k)"
                @keydown="onStopKey($event, k)"
              ><b :style="swatchBg(store.color(s.color) ?? s.color)" /></button>
            </div>
            <div class="gr-pos tx-meta">Stop {{ stop + 1 }} · {{ Math.round((stops[stop]?.pos ?? 0) * 100) }}%</div>
            <ColorPicker :model-value="stopColor" @update:model-value="setStopColor" @start="hold" @end="release" />
          </template>

          <!-- 이미지 -->
          <template v-else-if="paint.type === 'image'">
            <div
              class="img-box"
              :class="{ drop: dropping }"
              @dragover.prevent="dropping = true"
              @dragleave="dropping = false"
              @drop.prevent="onDrop"
            >
              <div class="img-prev" :style="imgCss" />
              <button class="sq img-choose" :disabled="uploading" @click="fileEl?.click()">{{ uploading ? 'Uploading…' : (paint as { src: string }).src ? 'Replace image' : 'Choose image' }}</button>
            </div>
            <div class="seg" role="radiogroup" aria-label="Image fit">
              <button v-for="f in FITS" :key="f.k" role="radio" :aria-checked="((paint as { fit?: string }).fit ?? 'fill') === f.k" :class="['seg-b', { on: ((paint as { fit?: string }).fit ?? 'fill') === f.k }]" @click="emit('update', { ...paint, fit: f.k } as Paint)">{{ f.label }}</button>
            </div>
            <p class="tx-meta m0">Drop an image here or choose a file (PNG, JPG, GIF, WebP, SVG)</p>
            <input ref="fileEl" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden @change="onFile">
          </template>
        </div>

        <div v-if="paint.type !== 'image' && pageColors.length" class="pp-sw">
          <div class="sw-h">On this page</div>
          <div class="sw-grid">
            <button v-for="c in pageColors" :key="c" class="sw" :style="swatchBg(c)" :aria-label="c" :title="c" @click="pickSwatch(c)" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="lib">
          <label class="sq fld lib-s"><Icon name="search" :size="14" /><input v-model="q" placeholder="Search colors" aria-label="Search library colors" spellcheck="false"></label>
          <div class="lib-l">
            <div v-for="g in libs" :key="g.name" class="lib-g">
              <div class="sw-h">{{ g.name }}</div>
              <div class="sw-grid">
                <button v-for="t in g.items" :key="t.id" class="sw" :style="swatchBg(t.color ?? '#000')" :aria-label="t.name" :title="`${t.name} · ${t.value}`" @click="pickToken(t)" />
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
.paint-pop { position: fixed; z-index: 60; width: 256px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; filter: drop-shadow(0 1px 2px rgb(3 9 26 / 6%)) drop-shadow(0 10px 24px rgb(3 9 26 / 14%)); font-size: 12px; }
.pp-h { display: flex; align-items: center; justify-content: space-between; padding: var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-04) var(--ref-spacing-05); box-shadow: 0 1px 0 var(--iris-line); }
.pp-tabs { display: flex; gap: var(--ref-spacing-02); }
.pp-tab { height: 26px; padding: 0 var(--ref-spacing-05); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: var(--sys-color-neutral-500); }
.pp-tab:hover { color: var(--sys-color-neutral-800); }
.pp-tab.on { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); font-weight: 600; }
.s24 { width: 24px; height: 24px; }
.pp-types { display: flex; gap: var(--ref-spacing-02); padding: var(--ref-spacing-04) var(--ref-spacing-05); box-shadow: 0 1px 0 var(--iris-line); }
.pp-type { width: 28px; height: 28px; color: var(--sys-color-neutral-600); }
.pp-type.on { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-800); }
.pp-body { padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.grow { flex: 1; }
.m0 { margin: 0; }
.gr-tools { display: flex; align-items: center; gap: var(--ref-spacing-02); }
.ang { width: 76px; flex: none; gap: var(--ref-spacing-03); }
.gr-bar { position: relative; height: 20px; margin: 0 8px 14px; border-radius: 4px; cursor: copy; touch-action: none; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 15%); }
.gr-stop { position: absolute; top: 100%; width: 16px; height: 16px; margin-top: 2px; transform: translateX(-50%); border-radius: 4px; background: #fff; box-shadow: 0 0 0 1px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 20%); cursor: ew-resize; padding: 2px; display: grid; }
.gr-stop::before { content: ''; position: absolute; left: 50%; top: -4px; width: 0; height: 0; transform: translateX(-50%); border: 3px solid transparent; border-top: 0; border-bottom: 4px solid #fff; filter: drop-shadow(0 -1px 0 rgb(0 0 0 / 20%)); }
.gr-stop b { display: block; border-radius: 2px; }
.gr-stop.on { box-shadow: 0 0 0 2px var(--iris-select, #0D99FF), 0 1px 3px rgb(0 0 0 / 20%); }
.gr-stop:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.gr-pos { margin-top: -2px; }
.img-box { position: relative; height: 160px; border-radius: var(--ref-radius-03); overflow: hidden; background: repeating-conic-gradient(#e6e6e6 0% 25%, #fff 0% 50%) 0 0 / 12px 12px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 12%); display: grid; place-items: center; }
.img-box.drop { box-shadow: inset 0 0 0 2px var(--iris-select, #0D99FF); }
.img-prev { position: absolute; inset: 0; }
.img-choose { position: relative; height: 28px; padding: 0 var(--ref-spacing-07); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: #fff; --sq-fill: rgb(0 0 0 / 55%); opacity: 1; transition: opacity .12s; }
.img-box:has(.img-prev[style*='url']) .img-choose { opacity: 0; }
.img-box:hover .img-choose, .img-choose:focus-visible { opacity: 1; }
.img-choose:hover { --sq-fill: rgb(0 0 0 / 70%); }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 2px; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); }
.seg-b { height: 24px; border-radius: var(--ref-radius-02); font-size: 11px; color: var(--sys-color-neutral-600); }
.seg-b.on { background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); font-weight: 500; box-shadow: 0 1px 2px rgb(0 0 0 / 8%); }
.pp-sw { padding: var(--ref-spacing-05) var(--ref-spacing-06) var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.sw-h { font-size: 11px; font-weight: 500; color: var(--sys-color-neutral-600); }
.sw-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
.sw { aspect-ratio: 1; border-radius: 4px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 10%); cursor: pointer; }
.sw:hover { box-shadow: inset 0 0 0 1px rgb(0 0 0 / 10%), 0 0 0 2px var(--sys-color-neutral-300); }
.sw:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.lib { display: flex; flex-direction: column; gap: var(--ref-spacing-05); padding: var(--ref-spacing-06); }
.lib-s { gap: var(--ref-spacing-04); color: var(--sys-color-neutral-500); }
.lib-l { max-height: 360px; overflow: auto; display: flex; flex-direction: column; gap: var(--ref-spacing-07); margin-right: calc(-1 * var(--ref-spacing-04)); padding-right: var(--ref-spacing-04); }
.lib-g { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.empty { padding: var(--ref-spacing-06) 0; text-align: center; }
button:disabled { opacity: 0.35; pointer-events: none; }
</style>
