<script setup lang="ts">
import type { CatalogToken } from '~/canvas/tokens'
import TokenPicker from '~/components/editor/TokenPicker.vue'
import { fromRgba, hslToRgb, hsvToRgb, normHex, rgbToHsl, rgbToHsv, toRgba, type HSVA } from '~/canvas/color'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'

/**
 * 색 고르기 판(피그마와 같아요): 채도 · 밝기 판, 색상 · 투명도 막대, 스포이트, Hex · RGB · HSL · HSB 입력.
 * v-model 은 '#RRGGBB' 또는 '#RRGGBBAA'. 끄는 동안 start · end 를 알려서 바깥에서 실행취소를 한 번으로 묶어요
 */
/** tokens: 값 칸 안에 토큰(색 변수) 고르기 버튼(Fill 행처럼 마우스를 올리면 보여요) — 고르면 'token' 으로 알려요 */
const props = defineProps<{ modelValue: string; tokens?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: string]; start: []; end: []; token: [t: CatalogToken] }>()

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
/** 조준점 · 손잡이 반지름(16 원의 절반). 중심이 [R, 길이 − R] 안에서만 움직여서 판 · 막대 밖으로 나가지 않아요(피그마와 같아요) */
const R = 8
/** 0–1 값 → 판 · 막대 안의 위치(CSS) */
const at = (t: number) => `calc(${R}px + (100% - ${R * 2}px) * ${t})`
function drag(e: PointerEvent, kind: 'sv' | 'hue' | 'alpha') {
  const el = e.currentTarget as HTMLElement
  try { el.setPointerCapture?.(e.pointerId) } catch { /* 합성 이벤트 */ }
  emit('start')
  const at = (ev: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left - R) / Math.max(1, r.width - R * 2)))
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top - R) / Math.max(1, r.height - R * 2)))
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
  e.stopPropagation() // 고른 레이어가 함께 움직이지 않게
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
const FMT: { value: Fmt; label: string }[] = [{ value: 'hex', label: 'Hex' }, { value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL' }, { value: 'hsb', label: 'HSB' }]
const fmt = useState<Fmt>('iris-color-fmt', () => 'hex')
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
/** 색상 막대: 색 정지점도 손잡이가 움직이는 구간[R, 길이 − R]에 맞춰서 손잡이 색과 그 아래 막대 색이 같아요 */
const HUE_BG = `linear-gradient(to right, ${['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00'].map((c, i) => `${c} ${at(i / 6)}`).join(', ')})`
const alphaBg = computed(() => `linear-gradient(to right, transparent ${at(0)}, ${solid.value} ${at(1)})`)
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <div class="cp">
    <div
      class="cp-sv"
      role="slider"
      tabindex="0"
      :aria-label="tr('Saturation and brightness')"
      :aria-valuetext="tr('Saturation {s}%, brightness {v}%', { s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100) })"
      @pointerdown.prevent="drag($event, 'sv')"
      @keydown="key($event, 'sv')"
    >
      <span class="sqc cp-sv-bg" :style="{ backgroundColor: pure }" />
      <i class="knob" :style="{ left: at(hsv.s), top: at(1 - hsv.v), background: solid }" />
    </div>
    <div class="cp-row">
      <button v-if="canPick" class="ib s24" :aria-label="tr('Pick color from screen')" :data-tip="tr('Pick color from screen')" @click="eyedrop">
        <EditorIcon name="eyedropper" />
      </button>
      <div class="cp-bars">
        <div class="bar hue" :style="{ backgroundImage: HUE_BG }" role="slider" tabindex="0" :aria-label="tr('Hue')" :aria-valuenow="Math.round(hsv.h)" aria-valuemin="0" aria-valuemax="360" @pointerdown.prevent="drag($event, 'hue')" @keydown="key($event, 'hue')">
          <i class="knob" :style="{ left: at(hsv.h / 360), background: pure }" />
        </div>
        <div class="bar alpha" role="slider" tabindex="0" :aria-label="tr('Opacity')" :aria-valuenow="Math.round(hsv.a * 100)" aria-valuemin="0" aria-valuemax="100" @pointerdown.prevent="drag($event, 'alpha')" @keydown="key($event, 'alpha')">
          <span class="fill" :style="{ backgroundImage: alphaBg }" />
          <i class="knob" :style="{ left: at(hsv.a) }"><b :style="{ background: out }" /></i>
        </div>
      </div>
    </div>
    <!-- 값 줄: [형식 ▾] [Hex · RGB … (토큰) | 불투명도 %] — 값과 불투명도는 Fill 행처럼 한 칸, 세로선으로 나눠요 -->
    <div class="cp-in">
      <EditorSelect :model-value="fmt" :options="FMT" ariaLabel="Color format" @update:model-value="(v) => (fmt = v as Fmt)" />
      <div :class="['sq', 'fld', 'vals', { parts: fmt !== 'hex' }]">
        <input v-if="fmt === 'hex'" :key="'h' + solid" class="hex" :value="solid.slice(1)" aria-label="Hex" spellcheck="false" @change="onHex" @keydown="blur" @focus="($event.target as HTMLInputElement).select()">
        <template v-else>
          <input v-for="(p, i) in parts" :key="fmt + i + p" class="part" :value="p" inputmode="numeric" :aria-label="tr((fmt === 'rgb' ? ['Red', 'Green', 'Blue'] : fmt === 'hsl' ? ['Hue', 'Saturation', 'Lightness'] : ['Hue', 'Saturation', 'Brightness'])[i]!)" @change="onPart(i, $event)" @keydown="blur" @focus="($event.target as HTMLInputElement).select()">
        </template>
        <TokenPicker v-if="tokens" :kinds="['color']" reveal :label="tr('Color')" @pick="(t) => emit('token', t)" />
        <span class="vsep" aria-hidden="true" />
        <span class="op"><input :key="'a' + hsv.a" class="pct" :value="Math.round(hsv.a * 100)" inputmode="numeric" :aria-label="tr('Opacity')" @change="onAlpha" @keydown="blur" @focus="($event.target as HTMLInputElement).select()"><i class="unit">%</i></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 피그마 색 선택기(§9.2): SV 판 208 · 스포이드 24 + 막대 2개 · [형식 ▾ | 값 | %], 줄 사이 8(판 아래 12) */
.cp { display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.cp-sv { position: relative; aspect-ratio: 1; margin-bottom: var(--ref-spacing-02); border-radius: var(--ref-radius-03); cursor: default; touch-action: none; outline: none; }
.cp-sv-bg { position: absolute; inset: 0; border-radius: inherit; background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 10%); }
.cp-sv:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
/* 조준점: 16 원 = 흰 테 4 + 가운데 지금 색, 그림자 .2 — 중심이 판 안쪽 8 안에서만 움직여요 */
.cp-sv .knob { position: absolute; width: 16px; height: 16px; box-sizing: border-box; border: 4px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 .5px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 20%), inset 0 0 0 .5px rgb(0 0 0 / 15%); pointer-events: none; }
.cp-row { display: flex; align-items: center; gap: var(--ref-spacing-06); }
.s24 { width: 28px; height: 28px; }
.cp-bars { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-02) 0; }
.bar { position: relative; height: 12px; border-radius: 999px; cursor: default; touch-action: none; outline: none; }
.bar:focus-visible { box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); }
.hue { box-shadow: inset 0 0 0 .5px rgb(0 0 0 / 10%); }
.alpha { background: repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 8px 8px; }
.alpha .fill { position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 .5px rgb(0 0 0 / 10%); }
/* 손잡이: 16 흰 테(3) 원 + 그림자 — 중심이 막대 양끝 8 안에서만 움직여서 둥근 끝 밖으로 나가지 않아요 */
.bar .knob { position: absolute; top: 50%; width: 16px; height: 16px; box-sizing: border-box; border: 3px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 .5px rgb(0 0 0 / 20%), 0 1px 3px rgb(0 0 0 / 20%); pointer-events: none; overflow: hidden; }
.alpha .knob { background: repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px; }
.alpha .knob b { position: absolute; inset: 0; }
.cp-in { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: var(--ref-spacing-06); align-items: center; }
.cp-in > * { min-width: 0; }
.vals { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); }
.vals.parts { gap: 0; padding: 0; }
/* 값 · 불투명도 사이 1px 칸막이(Fill 행과 같아요 — 위아래 1px 비움) · 불투명도 48(오른쪽 정렬, 안쪽 8) */
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.vals.parts .op { margin-left: 0; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
.vals:has(input:focus) { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
/* RGB · HSL · HSB: 세 칸을 1px 칸막이(패널 바탕색)로 나눠요 — 숫자가 붙어 보이지 않게(피그마와 같아요) */
.vals .part + .part { box-shadow: inset 1px 0 0 var(--sys-color-common-white-emphasis); }
.vals input { padding: 0; }
.vals .hex { flex: 1; min-width: 0; text-transform: uppercase; }
.vals .part { flex: 1; min-width: 0; height: 100%; padding: 0; text-align: center; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
</style>
