<script setup lang="ts">
import { Button, Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import type { LayerStyle } from '~/canvas/schema'
import { colorLabel, parseColor, type CatalogToken } from '~/canvas/tokens'
import { useLayerStore } from '~/canvas/store'
import TokenPicker from '~/components/editor/TokenPicker.vue'

/** 오른쪽 패널 · 디자인 탭: 화면(프레임) 이름 · 상태 · 위치 · 크기 · 모양(채우기 · 선 · 모서리 · 투명도 · 내용 자르기). 값을 바꾸면 캔버스에 바로 반영하고 저장합니다 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ update: [patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>]; remove: [] }>()

const STATUS: { k: ScreenRow['status']; label: string }[] = [
  { k: 'draft', label: '작업 중' },
  { k: 'review', label: '검토 요청' },
  { k: 'approved', label: '확정' },
]
const PRESETS = [
  { label: '모바일', w: 390, h: 844 },
  { label: '모바일 L', w: 430, h: 932 },
  { label: '모바일 S', w: 375, h: 812 },
  { label: '안드로이드', w: 360, h: 800 },
  { label: '태블릿', w: 768, h: 1024 },
  { label: '데스크톱', w: 1440, h: 900 },
]

function num(key: 'x' | 'y' | 'width' | 'height', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(v) || ((key === 'width' || key === 'height') && v < 1)) { input.value = String(Math.round(props.screen[key])); return }
  if (Math.round(v) !== Math.round(props.screen[key])) emit('update', { [key]: Math.round(v) })
}
function rename(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== props.screen.name) emit('update', { name: v })
  else (e.target as HTMLInputElement).value = props.screen.name
}
/** 화살표 키로 1씩(Shift 는 10씩) 바꾸기 */
function step(key: 'x' | 'y' | 'width' | 'height', e: KeyboardEvent) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  const v = Math.max(key === 'width' || key === 'height' ? 1 : -1e9, Math.round(props.screen[key]) + d)
  emit('update', { [key]: v })
}
// --- 화면 모양: 레이어와 같은 방식(토큰 연결 포함). 기본은 흰 바탕 · 선 없음 · 모서리 0 ---
const store = useLayerStore()
const native = computed(() => props.screen.source === 'native')
const look = computed<LayerStyle>(() => store.doc(props.screen.id).frame ?? {})
const fstyle = (patch: Partial<LayerStyle>, vars?: Record<string, string | null>) => store.frameStyle(props.screen.id, patch, vars)
const vb = (key: string) => (look.value.vars as Record<string, string> | undefined)?.[key] ?? null
const hasFill = computed(() => look.value.fill !== '')
const fillColor = computed(() => look.value.fill ?? '#FFFFFF')
const hasStroke = computed(() => !!(look.value.stroke && look.value.strokeWidth))
const hex = (v?: string) => parseColor(store.color(v))?.hex ?? '#000000'
const colorText = (v?: string) => (!v ? '없음' : v.startsWith('token:') ? v.slice(6) : colorLabel(v))
const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
function setHex(key: 'fill' | 'stroke', e: Event) {
  const input = e.target as HTMLInputElement
  let v = input.value.trim()
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) fstyle({ [key]: v.toUpperCase() })
  else input.value = colorText(key === 'fill' ? fillColor.value : look.value.stroke)
}
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
function pickColor(key: 'fill' | 'stroke', t: CatalogToken) { fstyle({ [key]: t.color }, { [key]: t.id }) }
function pickNum(key: 'radius' | 'strokeWidth' | 'opacity', t: CatalogToken) { fstyle({ [key]: t.num!, ...(key === 'radius' ? { radii: undefined } : {}) }, { [key]: t.id }) }
function unbindKey(key: string) { fstyle({}, { [key]: null }) }

const statusOpen = ref(false)
const presetOpen = ref(false)
const confirmDelete = ref(false)
watch(() => props.screen.id, () => { confirmDelete.value = false; statusOpen.value = false; presetOpen.value = false })
// 드롭다운: 바깥을 누르거나 Esc 로 닫기
const root = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  const rel = (e.target as HTMLElement | null)?.closest('.rel')
  if (!rel || !root.value?.contains(rel)) { statusOpen.value = false; presetOpen.value = false }
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape') { statusOpen.value = false; presetOpen.value = false } }
onMounted(() => { document.addEventListener('pointerdown', onDocPointer, true); document.addEventListener('keydown', onDocKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocPointer, true); document.removeEventListener('keydown', onDocKey) })
</script>

<template>
  <div ref="root" class="design">
    <section class="s">
      <div class="sec-h h24"><span>화면</span></div>
      <label class="sq fld"><span>이름</span><input :key="screen.id + screen.name" :value="screen.name" aria-label="화면 이름" @change="rename" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      <span class="sub">상태</span>
      <div class="rel">
        <button :class="['sq', 'dd', { open: statusOpen }]" :aria-expanded="statusOpen" @click="statusOpen = !statusOpen">
          <span>{{ STATUS.find((s) => s.k === screen.status)?.label }}</span><Icon name="chevron_down" :size="12" class="muted" />
        </button>
        <div v-if="statusOpen" class="sq menu" role="listbox" aria-label="상태">
          <button v-for="s in STATUS" :key="s.k" role="option" :aria-selected="screen.status === s.k" :class="['sq', 'menu-item', { on: screen.status === s.k }]" @click="emit('update', { status: s.k }); statusOpen = false">{{ s.label }}</button>
        </div>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>위치</span></div>
      <div class="grid2">
        <label class="sq fld"><span>X</span><input :key="'x' + screen.x" :value="Math.round(screen.x)" inputmode="numeric" aria-label="X" @change="num('x', $event)" @keydown="step('x', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>Y</span><input :key="'y' + screen.y" :value="Math.round(screen.y)" inputmode="numeric" aria-label="Y" @change="num('y', $event)" @keydown="step('y', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>크기</span></div>
      <div class="rel">
        <button :class="['sq', 'dd', { open: presetOpen }]" :aria-expanded="presetOpen" @click="presetOpen = !presetOpen">
          <span>{{ PRESETS.find((p) => p.w === screen.width && p.h === screen.height)?.label ?? '직접 입력' }}</span><Icon name="chevron_down" :size="12" class="muted" />
        </button>
        <div v-if="presetOpen" class="sq menu" role="listbox" aria-label="크기 프리셋">
          <button v-for="p in PRESETS" :key="p.label" role="option" :aria-selected="p.w === screen.width && p.h === screen.height" :class="['sq', 'menu-item', { on: p.w === screen.width && p.h === screen.height }]" @click="emit('update', { width: p.w, height: p.h }); presetOpen = false">
            <span class="f1">{{ p.label }}</span><span class="tx-meta num">{{ p.w }} × {{ p.h }}</span>
          </button>
        </div>
      </div>
      <div class="grid2">
        <label class="sq fld"><span>W</span><input :key="'w' + screen.width" :value="Math.round(screen.width)" inputmode="numeric" aria-label="너비" @change="num('width', $event)" @keydown="step('width', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>H</span><input :key="'h' + screen.height" :value="Math.round(screen.height)" inputmode="numeric" aria-label="높이" @change="num('height', $event)" @keydown="step('height', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      </div>
    </section>

    <template v-if="native">
      <section class="s">
        <div class="sec-h h24"><span>모양</span></div>
        <div class="grid2"><span class="sub">투명도</span><span class="sub">모서리</span></div>
        <div class="grid2">
          <label class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.2" fill="none" /><path d="M2.5 11.5l9-9" stroke="currentColor" stroke-width="1.2" /></svg><template v-if="!vb('opacity')"><input :key="'o' + numText('opacity')" :value="numText('opacity')" inputmode="numeric" aria-label="화면 투명도" @change="setNumber('opacity', $event)" @keydown="keyStep('opacity', $event)"><span>%</span></template><TokenPicker :kinds="['opacity']" :bound="vb('opacity')" reveal label="화면 투명도" @pick="(t) => pickNum('opacity', t)" @unbind="unbindKey('opacity')" @step="(d) => stepNumber('opacity', d)" /></label>
          <label class="sq fld"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 11.5V6a3.5 3.5 0 0 1 3.5-3.5h5.5" stroke="currentColor" stroke-width="1.2" fill="none" /></svg><input v-if="!vb('radius')" :key="'r' + numText('radius')" :value="numText('radius')" inputmode="numeric" aria-label="화면 모서리" @change="setNumber('radius', $event)" @keydown="keyStep('radius', $event)"><TokenPicker :kinds="['radius']" :bound="vb('radius')" reveal label="화면 모서리" @pick="(t) => pickNum('radius', t)" @unbind="unbindKey('radius')" @step="(d) => stepNumber('radius', d)" /></label>
        </div>
        <button :class="['cb', { on: look.clip !== false }]" @click="fstyle({ clip: look.clip === false ? undefined : false })"><i />내용 자르기</button>
      </section>

      <section class="s">
        <div class="sec-h h24"><span>채우기</span><button v-if="!hasFill" class="ib s24" aria-label="채우기 더하기" @click="fstyle({ fill: undefined })"><Icon name="plus" :size="14" /></button><button v-else class="ib s24" aria-label="채우기 빼기" @click="fstyle({ fill: '' })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button></div>
        <div v-if="hasFill" class="color-row">
          <label class="sq fld"><input type="color" class="swatch" :value="hex(fillColor)" aria-label="화면 채우기 색" @change="fstyle({ fill: ($event.target as HTMLInputElement).value.toUpperCase() })"><input v-if="!vb('fill')" :key="'f' + fillColor" :value="colorText(fillColor)" aria-label="화면 채우기 값" @change="setHex('fill', $event)" @keydown="blurOnEnter"><TokenPicker v-else :kinds="['color']" :bound="vb('fill')" label="화면 채우기 색" @pick="(t) => pickColor('fill', t)" @unbind="unbindKey('fill')" /></label>
          <TokenPicker v-if="!vb('fill')" :kinds="['color']" label="화면 채우기 색" @pick="(t) => pickColor('fill', t)" />
        </div>
      </section>

      <section class="s">
        <div class="sec-h h24"><span>선</span><button v-if="!hasStroke" class="ib s24" aria-label="선 더하기" @click="fstyle({ stroke: '#202837', strokeWidth: 1 })"><Icon name="plus" :size="14" /></button><button v-else class="ib s24" aria-label="선 빼기" @click="fstyle({ stroke: undefined, strokeWidth: undefined })"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button></div>
        <template v-if="hasStroke">
          <div class="color-row">
            <label class="sq fld"><input type="color" class="swatch" :value="hex(look.stroke)" aria-label="화면 선 색" @change="fstyle({ stroke: ($event.target as HTMLInputElement).value.toUpperCase() })"><input v-if="!vb('stroke')" :key="'s' + look.stroke" :value="colorText(look.stroke)" aria-label="화면 선 색 값" @change="setHex('stroke', $event)" @keydown="blurOnEnter"><TokenPicker v-else :kinds="['color']" :bound="vb('stroke')" label="화면 선 색" @pick="(t) => pickColor('stroke', t)" @unbind="unbindKey('stroke')" /></label>
            <TokenPicker v-if="!vb('stroke')" :kinds="['color']" label="화면 선 색" @pick="(t) => pickColor('stroke', t)" />
          </div>
          <div class="grid2">
            <label class="sq fld" title="선 두께"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 3.5h10" stroke="currentColor" stroke-width="1" /><path d="M2 7h10" stroke="currentColor" stroke-width="1.6" /><path d="M2 10.5h10" stroke="currentColor" stroke-width="2.4" /></svg><template v-if="!vb('strokeWidth')"><input :key="'w' + numText('strokeWidth')" :value="numText('strokeWidth')" inputmode="decimal" aria-label="화면 선 두께" @change="setNumber('strokeWidth', $event)" @keydown="keyStep('strokeWidth', $event)"><span>px</span></template><TokenPicker :kinds="['borderWidth']" :bound="vb('strokeWidth')" reveal label="화면 선 두께" @pick="(t) => pickNum('strokeWidth', t)" @unbind="unbindKey('strokeWidth')" @step="(d) => stepNumber('strokeWidth', d)" /></label>
          </div>
        </template>
      </section>
    </template>

    <section class="s">
      <div class="sec-h h24"><span>레이어</span></div>
      <p class="tx-meta m0">캔버스나 왼쪽 레이어 목록에서 레이어를 고르면 여기서 고쳐요</p>
      <dl class="sq keys"><dt>사각형</dt><dd>R</dd><dt>텍스트</dt><dd>T</dd><dt>프레임</dt><dd>F</dd></dl>
    </section>

    <section class="s">
      <Button v-if="!confirmDelete" size="s" type="tertiary" stroke contents="icon-text" icon-name="trashbin" class="full" @click="confirmDelete = true">화면 지우기</Button>
      <div v-else class="sq confirm" role="alertdialog" aria-label="화면 지우기 확인">
        <span class="tx-head">'{{ screen.name }}' 화면을 지울까요?</span>
        <span class="tx-meta">연결된 요구사항 상태도 함께 지워지고 되돌릴 수 없어요</span>
        <span class="row-end"><Button size="s" type="tertiary" @click="confirmDelete = false">취소</Button><Button size="s" type="destructed" @click="emit('remove')">지우기</Button></span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.design { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s:first-child { box-shadow: none; }
.h24 { height: 24px; padding: 0; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.rel { position: relative; min-width: 0; }
.muted { color: var(--sys-color-neutral-500); }
.f1 { flex: 1; }
.m0 { margin: 0; }
.full { width: 100%; }
.confirm { display: flex; flex-direction: column; gap: var(--ref-spacing-02); padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; }
.row-end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-04); }
.keys { display: grid; grid-template-columns: repeat(3, auto minmax(0, 1fr)); gap: var(--ref-spacing-04); margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); }
.keys dt { color: var(--sys-color-neutral-500); }
.keys dd { margin: 0; font-weight: 600; color: var(--sys-color-neutral-700); }
.s24 { width: 24px; height: 24px; }
.color-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ref-spacing-04); align-items: center; }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.swatch:focus-visible, .cb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.fld > svg { flex: none; color: var(--sys-color-neutral-600); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
</style>
