<script setup lang="ts">
import { setSmoothDefault, smoothDefault } from '~/canvas/prefs'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * Corner smoothing 창(피그마와 같아요): 개별 모서리 줄 끝 버튼을 누르면 패널 왼쪽에 떠요.
 * [제목 · 닫기] / [슬라이더(파란 채움 + 손잡이, 60% 자리 iOS) | 숫자 %] / 새로 그리는 것은 늘 60% 체크박스
 */
const props = defineProps<{ anchor: HTMLElement | null; value: number | 'Mixed' }>()
const emit = defineEmits<{ update: [v: number]; start: []; end: []; close: [] }>()

const root = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
function place() {
  const a = props.anchor
  const el = root.value
  if (!a || !el) return
  const r = a.getBoundingClientRect()
  const panel = a.closest('.float')?.getBoundingClientRect() ?? r
  const w = el.offsetWidth, h = el.offsetHeight
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + r.height / 2 - 40))
  pos.value = { left: Math.max(8, panel.left - w - 8) + 'px', top: top + 'px' }
}
onMounted(() => { nextTick(place); window.addEventListener('resize', place) })
onBeforeUnmount(() => window.removeEventListener('resize', place))
watch(() => props.anchor, () => nextTick(place))

const v = computed(() => (props.value === 'Mixed' ? 0 : props.value))
// 슬라이더 끌기: 누른 자리로 바로, 끄는 동안 기록 하나(start · end)
const track = ref<HTMLElement | null>(null)
const SNAP = 60
function at(clientX: number) {
  const r = track.value?.getBoundingClientRect()
  if (!r) return
  const n = Math.round(Math.max(0, Math.min(1, (clientX - r.left - 8) / Math.max(1, r.width - 16))) * 100)
  // 60%(iOS) 근처(±4)에서는 자석처럼 60 에 붙어요 — 끌 때만(키보드 · 직접 입력은 그대로)
  emit('update', Math.abs(n - SNAP) <= 4 ? SNAP : n)
}
function down(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('start')
  at(e.clientX)
}
function move(e: PointerEvent) { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) at(e.clientX) }
function up(e: PointerEvent) {
  const t = e.currentTarget as HTMLElement
  if (t.hasPointerCapture(e.pointerId)) { t.releasePointerCapture(e.pointerId); emit('end') }
}
function key(e: KeyboardEvent) {
  const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
  if (!d) return
  e.preventDefault()
  emit('update', Math.max(0, Math.min(100, v.value + d * (e.shiftKey ? 10 : 1))))
}
function typed(e: Event) {
  const n = parseFloat((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) emit('update', Math.max(0, Math.min(100, Math.round(n))))
}
// 바깥 누르기 · Esc 로 닫기
function onDoc(e: PointerEvent) {
  const t = e.target as Node
  if (root.value?.contains(t) || props.anchor?.contains(t)) return
  emit('close')
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => { document.addEventListener('pointerdown', onDoc, true); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc, true); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <Teleport to="body">
    <div ref="root" v-front class="sq float cs" role="dialog" :aria-label="tr('Corner smoothing')" :style="pos">
      <div class="cs-h">
        <span>{{ tr('Corner smoothing') }}</span>
        <button class="ib s24" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" /></button>
      </div>
      <div class="cs-b">
        <div class="cs-row">
          <div class="cs-slide">
            <div ref="track" class="cs-track" role="slider" tabindex="0" :aria-label="tr('Corner smoothing')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="v" :aria-valuetext="`${v}%`" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key">
              <i class="cs-fill" :style="{ width: `calc(16px + (100% - 16px) * ${v / 100})` }" />
              <i :class="['cs-tick', { past: v >= 60 }]" />
              <i class="cs-knob" :style="{ left: `calc(2px + (100% - 16px) * ${v / 100})` }" />
            </div>
            <div class="cs-marks" aria-hidden="true"><span class="cs-ios">iOS</span></div>
          </div>
          <label class="sq fld cs-num"><input :key="'v' + value" :value="value === 'Mixed' ? '' : `${v}%`" :placeholder="value === 'Mixed' ? tr('Mixed') : ''" inputmode="numeric" :aria-label="tr('Corner smoothing percent')" @focus="($event.target as HTMLInputElement).select()" @change="typed" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        </div>
        <button :class="['cb', { on: smoothDefault }]" role="checkbox" :aria-checked="smoothDefault" :title="tr('New rectangles, frames and images start with 60% corner smoothing')" @click="setSmoothDefault(!smoothDefault)"><i class="sq" />{{ tr('Always 60% for new layers') }}</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cs { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.cs-h { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); font-weight: 600; box-shadow: 0 1px 0 var(--iris-line); }
.cs-b { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-08) var(--ref-spacing-08) var(--ref-spacing-06); }
.cs-row { display: grid; grid-template-columns: minmax(0, 1fr) 56px; gap: var(--ref-spacing-06); align-items: start; }
/* 슬라이더: 알약 막대(16) 안에 손잡이(12)가 2px 안쪽으로 — 막대 밖으로 안 나가요. 숫자 칸(28) 가운데 높이에 맞춰요 */
.cs-slide { display: flex; flex-direction: column; gap: 2px; padding-top: 6px; min-width: 0; }
.cs-track { position: relative; height: 16px; border-radius: 999px; background: var(--sys-color-neutral-200); cursor: pointer; touch-action: none; outline: none; }
.cs-track:focus-visible { box-shadow: 0 0 0 2px var(--sys-color-brand-primary-default); }
.cs-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--sys-color-brand-primary-default); pointer-events: none; }
/* 60%(iOS) 자리 점 */
.cs-tick { position: absolute; top: 6px; left: calc(8px + (100% - 16px) * 0.6 - 2px); width: 4px; height: 4px; border-radius: 50%; background: var(--sys-color-neutral-400); pointer-events: none; }
.cs-tick.past { background: rgb(255 255 255 / 60%); }
.cs-knob { position: absolute; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 0.5px rgb(0 0 0 / 12%), 0 1px 2px rgb(0 0 0 / 20%); pointer-events: none; }
.cs-marks { position: relative; height: 12px; }
.cs-ios { position: absolute; top: 0; left: calc(8px + (100% - 16px) * 0.6); transform: translateX(-50%); font-size: 10px; line-height: 12px; color: var(--sys-color-neutral-500); white-space: nowrap; }
.cs-num input { text-align: left; }
</style>
