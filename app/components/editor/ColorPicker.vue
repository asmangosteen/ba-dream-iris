<script setup lang="ts">
import { fromRgba, hslToRgb, hsvToRgb, normHex, rgbToHsl, rgbToHsv, toRgba, type HSVA } from '~/canvas/color'

/**
 * 색 고르기 판(피그마와 같아요): 채도 · 밝기 판, 색상 · 투명도 막대, 스포이트, Hex · RGB · HSL · HSB 입력.
 * v-model 은 '#RRGGBB' 또는 '#RRGGBBAA'. 끄는 동안 start · end 를 알려서 바깥에서 실행취소를 한 번으로 묶어요
 */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string]; start: []; end: [] }>()

const hsv = ref<HSVA>(rgbToHsv(toRgba(props.modelValue)))
let last = props.modelValue
// 바깥에서 바뀌면 따라가요(색상은 채도 · 밝기가 0 이어도 지켜요)
watch(() => props.modelValue, (v) => {
  if (v === last) return
  last = v
  const next = rgbToHsv(toRgba(v))
  if (!next.s || !next.v) next.h = hsv.value.h
  if (!next.v) next.s = hsv.value.s
  hsv.value = next
})
const out = computed(() => fromRgba(hsvToRgb(hsv.value)))
function set(patch: Partial<HSVA>) {
  hsv.value = { ...hsv.value, ...patch }
  last = out.value
  emit('update:modelValue', last)
}
function setRgba(c: string) {
  const next = rgbToHsv(toRgba(c))
  if (!next.s || !next.v) next.h = hsv.value.h
  set(next)
}

const pure = computed(() => fromRgba(hsvToRgb({ h: hsv.value.h, s: 1, v: 1, a: 1 })))
const solid = computed(() => fromRgba({ ...hsvToRgb(hsv.value), a: 1 }))

// --- 끌기 ---
function drag(e: PointerEvent, kind: 'sv' | 'hue' | 'alpha') {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  emit('start')
  const at = (ev: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
    if (kind === 'sv') set({ s: x, v: 1 - y })
    else if (kind === 'hue') set({ h: Math.min(359.9, x * 360) })
    else set({ a: Math.round(x * 100) / 100 })
  }
  at(e)
  const move = (ev: PointerEvent) => at(ev)
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); emit('end') }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}
/** 화살표 키로 조금씩 (Shift 10배) */
function key(e: KeyboardEvent, kind: 'sv' | 'hue' | 'alpha') {
  const d = (e.shiftKey ? 10 : 1) / 100
  const dx = e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0
  const dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0
  if (!dx && !dy) return
  e.preventDefault()
  const c = (v: number) => Math.min(1, Math.max(0, v))
  if (kind === 'sv') set({ s: c(hsv.value.s + dx), v: c(hsv.value.v + dy) })
  else if (kind === 'hue') set({ h: Math.min(359.9, Math.max(0, hsv.value.h + (dx || dy) * 360)) })
  else set({ a: Math.round(c(hsv.value.a + (dx || dy)) * 100) / 100 })
}

// --- 스포이트(크롬 · 엣지) ---
const canPick = import.meta.client && 'EyeDropper' in window
async function eyedrop() {
  try {
    const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open()
    const c = normHex(r.sRGBHex) ?? r.sRGBHex
    setRgba(fromRgba({ ...toRgba(c), a: hsv.value.a }))
  } catch { /* 취소 */ }
}

// --- 입력 ---
type Fmt = 'hex' | 'rgb' | 'hsl' | 'hsb'
const FMT: { k: Fmt; label: string }[] = [{ k: 'hex', label: 'Hex' }, { k: 'rgb', label: 'RGB' }, { k: 'hsl', label: 'HSL' }, { k: 'hsb', label: 'HSB' }]
const fmt = useState<Fmt>('iris-color-fmt', () => 'hex')
const fmtOpen = ref(false)
const parts = computed<number[]>(() => {
  const rgb = hsvToRgb(hsv.value)
  if (fmt.value === 'rgb') return [rgb.r, rgb.g, rgb.b].map(Math.round)
  if (fmt.value === 'hsl') { const l = rgbToHsl(rgb); return [Math.round(l.h), Math.round(l.s * 100), Math.round(l.l * 100)] }
  return [Math.round(hsv.value.h), Math.round(hsv.value.s * 100), Math.round(hsv.value.v * 100)]
})
const PART_MAX: Record<Exclude<Fmt, 'hex'>, number[]> = { rgb: [255, 255, 255], hsl: [360, 100, 100], hsb: [360, 100, 100] }
function onPart(i: number, e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value)
  if (!Number.isFinite(v) || fmt.value === 'hex') { input.value = String(parts.value[i]); return }
  const p = [...parts.value]
  p[i] = Math.min(PART_MAX[fmt.value][i]!, Math.max(0, v))
  const a = hsv.value.a
  if (fmt.value === 'rgb') setRgba(fromRgba({ r: p[0]!, g: p[1]!, b: p[2]!, a }))
  else if (fmt.value === 'hsl') setRgba(fromRgba(hslToRgb(p[0]!, p[1]! / 100, p[2]! / 100, a)))
  else set({ h: Math.min(359.9, p[0]!), s: p[1]! / 100, v: p[2]! / 100 })
}
function onHex(e: Event) {
  const input = e.target as HTMLInputElement
  const v = normHex(input.value)
  if (!v) { input.value = solid.value.slice(1); return }
  setRgba(v.length > 7 ? v : fromRgba({ ...toRgba(v), a: hsv.value.a }))
}
function onAlpha(e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace('%', ''))
  if (!Number.isFinite(v)) { input.value = String(Math.round(hsv.value.a * 100)); return }
  set({ a: Math.min(100, Math.max(0, v)) / 100 })
}
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
function onDoc(e: PointerEvent) { if (!(e.target as HTMLElement).closest?.('.cp-fmt')) fmtOpen.value = false }
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))
</script>

<template>
  <div class="cp">
    <div
      class="cp-sv"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      :aria-valuetext="`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`"
      :style="{ backgroundColor: pure }"
      @pointerdown.prevent="drag($event, 'sv')"
      @keydown="key($event, 'sv')"
    >
      <i class="knob" :style="{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: solid }" />
    </div>
    <div class="cp-row">
      <button v-if="canPick" class="ib s24" aria-label="Pick color from screen" title="Pick color from screen" @click="eyedrop">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.2 2.6a1.9 1.9 0 0 1 2.7 2.7l-1.4 1.4.6.6-1 1-.6-.6-4.8 4.8H3.6v-2.1l4.8-4.8-.6-.6 1-1 .6.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
      </button>
      <div class="cp-bars">
        <div class="bar hue" role="slider" tabindex="0" aria-label="Hue" :aria-valuenow="Math.round(hsv.h)" aria-valuemin="0" aria-valuemax="360" @pointerdown.prevent="drag($event, 'hue')" @keydown="key($event, 'hue')">
          <i class="knob" :style="{ left: (hsv.h / 360) * 100 + '%', background: pure }" />
        </div>
        <div class="bar alpha" role="slider" tabindex="0" aria-label="Opacity" :aria-valuenow="Math.round(hsv.a * 100)" aria-valuemin="0" aria-valuemax="100" @pointerdown.prevent="drag($event, 'alpha')" @keydown="key($event, 'alpha')">
          <span class="fill" :style="{ backgroundImage: `linear-gradient(to right, transparent, ${solid})` }" />
          <i class="knob" :style="{ left: hsv.a * 100 + '%' }"><b :style="{ background: out }" /></i>
        </div>
      </div>
    </div>
    <div class="cp-in">
      <div class="cp-fmt">
        <button class="sq fmt-b" :aria-expanded="fmtOpen" aria-label="Color format" @click="fmtOpen = !fmtOpen">
          {{ FMT.find((f) => f.k === fmt)!.label }}
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" stroke-width="1.2" fill="none" /></svg>
        </button>
        <div v-if="fmtOpen" class="sq menu fmt-m" role="menu">
          <button v-for="f in FMT" :key="f.k" role="menuitemradio" :aria-checked="fmt === f.k" :class="['sq', 'menu-item', { on: fmt === f.k }]" @click="fmt = f.k; fmtOpen = false">{{ f.label }}</button>
        </div>
      </div>
      <div class="sq fld vals">
        <input v-if="fmt === 'hex'" :key="'h' + solid" class="hex" :value="solid.slice(1)" aria-label="Hex" spellcheck="false" @change="onHex" @keydown="blur" @focus="($event.target as HTMLInputElement).select()">
        <template v-else>
          <input v-for="(p, i) in parts" :key="fmt + i + p" class="part" :value="p" inputmode="numeric" :aria-label="(fmt === 'rgb' ? ['Red', 'Green', 'Blue'] : fmt === 'hsl' ? ['Hue', 'Saturation', 'Lightness'] : ['Hue', 'Saturation', 'Brightness'])[i]" @change="onPart(i, $event)" @keydown="blur" @focus="($event.target as HTMLInputElement).select()">
        </template>
        <span class="sep" aria-hidden="true" />
        <input :key="'a' + hsv.a" class="pct" :value="Math.round(hsv.a * 100)" inputmode="numeric" aria-label="Opacity" @change="onAlpha" @keydown="blur" @focus="($event.target as HTMLInputElement).select()"><span class="unit">%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cp { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.cp-sv { position: relative; height: 208px; border-radius: var(--ref-radius-03); cursor: crosshair; touch-action: none; background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent); outline: none; }
.cp-sv:focus-visible { box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); }
.cp-sv .knob { position: absolute; width: 14px; height: 14px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgb(0 0 0 / 20%), inset 0 0 0 1px rgb(0 0 0 / 15%); pointer-events: none; }
.cp-row { display: flex; align-items: center; gap: var(--ref-spacing-04); }
.s24 { width: 24px; height: 24px; }
.cp-bars { flex: 1; display: flex; flex-direction: column; gap: var(--ref-spacing-05); }
.bar { position: relative; height: 12px; border-radius: 6px; cursor: pointer; touch-action: none; outline: none; }
.bar:focus-visible { box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); }
.hue { background: linear-gradient(to right, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%); }
.alpha { background: repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 8px 8px; }
.alpha .fill { position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 10%); }
.bar .knob { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgb(0 0 0 / 20%); pointer-events: none; overflow: hidden; }
.alpha .knob { background: repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px; }
.alpha .knob b { position: absolute; inset: 0; }
.cp-in { display: flex; gap: var(--ref-spacing-03); align-items: center; }
.cp-fmt { position: relative; flex: none; }
.fmt-b { height: 28px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-05); display: flex; align-items: center; gap: var(--ref-spacing-03); border-radius: var(--ref-radius-03); font-size: 12px; color: var(--sys-color-neutral-800); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.fmt-b:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.fmt-m { right: auto; min-width: 96px; }
.vals { flex: 1; min-width: 0; gap: 0; padding: 0; }
.vals input { height: 28px; text-align: left; padding: 0 var(--ref-spacing-05); box-sizing: border-box; }
.vals .hex { flex: 1; text-transform: uppercase; }
.vals .part { flex: 1; min-width: 0; padding: 0 var(--ref-spacing-03); text-align: center; }
.vals .sep { width: 1px; align-self: stretch; background: var(--sys-color-common-white-default); flex: none; }
.vals .pct { width: 36px; flex: none; text-align: right; padding-right: 2px; }
.vals .unit { padding-right: var(--ref-spacing-05); color: var(--sys-color-neutral-500); }
</style>
