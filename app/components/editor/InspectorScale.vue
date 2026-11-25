<script setup lang="ts">
import { fmtNum } from '~/canvas/num'
import { useLayerStore } from '~/canvas/store'

/**
 * 스케일 도구(K)를 고르면 오른쪽 패널 아래에 나오는 Scale 칸(피그마와 같아요).
 * W · H 또는 배율을 넣으면 고른 레이어를 안쪽까지(글자 · 선 · 모서리 · 효과 · 간격) 같은 비율로 키우고 줄여요. 기준점은 그 자리에 남아요
 */
const props = defineProps<{ sid: string; ids: string[]; screen?: { width: number; height: number } | null }>()
/** 화면(프레임)을 골랐을 때: 화면 크기 · 자리는 페이지가 바꿔요(내용은 store.scaleScreenContent) */
const emit = defineEmits<{ 'scale-screen': [k: number, anchor: [number, number]] }>()
const store = useLayerStore()

const nodes = computed(() => props.ids.map((id) => store.node(props.sid, id)).filter((n) => !!n))
/** 고른 것 전체를 감싸는 크기(같은 부모 좌표). 화면이면 화면 크기 */
const box = computed(() => {
  if (props.screen) return { w: props.screen.width, h: props.screen.height }
  const list = nodes.value
  if (!list.length) return { w: 0, h: 0 }
  const x0 = Math.min(...list.map((n) => n!.x)), y0 = Math.min(...list.map((n) => n!.y))
  return { w: Math.max(...list.map((n) => n!.x + n!.w)) - x0, h: Math.max(...list.map((n) => n!.y + n!.h)) - y0 }
})

// 기준점: 다음에 K 를 눌러도 그대로(피그마처럼 기본은 왼쪽 위)
const anchor = useState<[number, number]>('iris-scale-anchor', () => [0, 0])
const ANCHORS: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]
const NAMES = ['Top left', 'Top', 'Top right', 'Left', 'Center', 'Right', 'Bottom left', 'Bottom', 'Bottom right']

const factorKey = ref(0) // 적용한 뒤 배율 칸을 1x 로 되돌리려고
function apply(k: number) {
  if (!(k > 0) || !Number.isFinite(k)) return
  if (props.screen) emit('scale-screen', k, anchor.value)
  else store.scaleLayers(props.sid, props.ids, k, anchor.value)
  factorKey.value++
}
/** '2' · '2x' · '200%' · '0.5' → 배율 */
function parseFactor(raw: string): number {
  const s = raw.trim().toLowerCase()
  if (!s) return NaN
  if (s.endsWith('%')) return parseFloat(s) / 100
  return parseFloat(s.replace(/x$/, ''))
}
function setFactor(e: Event) { apply(parseFactor((e.target as HTMLInputElement).value)) }
function setSize(axis: 'w' | 'h', e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  const cur = box.value[axis]
  if (v > 0 && cur > 0) apply(v / cur)
  else factorKey.value++
}
function key(e: KeyboardEvent, axis?: 'w' | 'h') {
  if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); return }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const dir = e.key === 'ArrowUp' ? 1 : -1
  if (!axis) { apply(1 + dir * (e.shiftKey ? 1 : 0.1)); return }
  const cur = box.value[axis]
  if (cur > 0) apply(Math.max(1, cur + dir * (e.shiftKey ? 10 : 1)) / cur)
}
</script>

<template>
  <section v-if="nodes.length || screen" class="s scale-s">
    <div class="sec-h h24"><span>{{ tr('Scale') }}</span></div>
    <div class="ig-l"><span>{{ tr('Dimensions') }}</span></div>
    <div class="ig">
      <label class="sq fld"><span>W</span><input :key="'w' + factorKey + box.w" :value="fmtNum(box.w)" inputmode="decimal" :aria-label="tr('Scaled width')"@change="setSize('w', $event)" @keydown="key($event, 'w')"></label>
      <label class="sq fld"><span>H</span><input :key="'h' + factorKey + box.h" :value="fmtNum(box.h)" inputmode="decimal" :aria-label="tr('Scaled height')"@change="setSize('h', $event)" @keydown="key($event, 'h')"></label>
      <span />
    </div>
    <div class="ig-l"><span>{{ tr('Scale factor') }}</span><span>{{ tr('Anchor') }}</span></div>
    <div class="ig">
      <label class="sq fld"><input :key="'f' + factorKey" value="1x" inputmode="decimal" :aria-label="tr('Scale factor')"@focus="($event.target as HTMLInputElement).select()" @change="setFactor" @keydown="key($event)"></label>
      <div class="sq anchor" role="radiogroup" :aria-label="tr('Anchor')">
        <button v-for="(a, i) in ANCHORS" :key="i" type="button" role="radio" :aria-checked="a[0] === anchor[0] && a[1] === anchor[1]" :aria-label="tr(NAMES[i]!)" :title="tr(NAMES[i]!)" :class="['dot', { on: a[0] === anchor[0] && a[1] === anchor[1] }]" @click="anchor = a"><i /></button>
      </div>
      <span />
    </div>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
/* 기준점: 3×3 점. 고른 점은 파랑 */
.anchor { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); width: 52px; height: 52px; padding: 4px; box-sizing: border-box; border-radius: var(--iris-field-r); --sq-fill: var(--sys-color-neutral-200); }
.dot { display: grid; place-items: center; padding: 0; border: 0; background: none; cursor: pointer; }
.dot i { width: 4px; height: 4px; border-radius: 50%; background: var(--sys-color-neutral-400); transition: background-color .12s ease, transform .12s ease; }
.dot:hover i { background: var(--sys-color-neutral-700); }
.dot.on i { width: 6px; height: 6px; background: var(--sys-color-brand-primary-default); }
.dot:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; border-radius: 2px; }
</style>
