<script setup lang="ts">
import { Icon, TextButton } from '@ba-dream/design-system'
import type { PageRow, PageSettings } from '~/composables/useEditor'

/**
 * 오른쪽 패널 · 아무것도 고르지 않았을 때(피그마의 Page 패널): 페이지 이름 · 캔버스 배경색 · 픽셀 격자 · 확대 · 스타일 바로가기
 */
const props = defineProps<{ page: PageRow; zoom: number; screenCount: number }>()
const emit = defineEmits<{ rename: [name: string]; settings: [patch: PageSettings]; zoom: [z: number | 'fit'] }>()
const { tokens } = useDesignSystem()

const bg = computed(() => props.page.viewport?.background ?? null)
const hex = computed(() => (bg.value && /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : '#F6F7F7'))
const PRESETS = ['#F6F7F7', '#E5E5E5', '#FFFFFF', '#1E1E1E', '#101318']
function setHex(e: Event) {
  let v = (e.target as HTMLInputElement).value.trim()
  if (!v) return emit('settings', { background: null })
  if (!v.startsWith('#')) v = '#' + v
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (/^#[0-9a-f]{6}$/i.test(v)) emit('settings', { background: v.toUpperCase() })
  else (e.target as HTMLInputElement).value = bg.value ?? ''
}
const colorCount = computed(() => (tokens.data.value ?? []).filter((t) => t.type === 'color').length)
const textCount = computed(() => (tokens.data.value ?? []).filter((t) => t.type === 'typography').length)
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <div class="pg">
    <section class="s first">
      <div class="sec-h h24"><span>페이지</span><span class="tx-meta">화면 {{ screenCount }}개</span></div>
      <label class="sq fld"><span>이름</span><input :key="page.id + page.name" :value="page.name" aria-label="페이지 이름" @change="emit('rename', ($event.target as HTMLInputElement).value)" @keydown="blur"></label>
    </section>

    <section class="s">
      <div class="sec-h h24">
        <span>배경</span>
        <button class="ib s24" :aria-label="bg ? '기본 배경으로' : '배경색 정하기'" :title="bg ? '기본 배경으로 되돌리기' : '배경색 정하기'" @click="emit('settings', { background: bg ? null : '#E5E5E5' })">
          <Icon :name="bg ? 'minus_in_circle' : 'plus'" :size="14" />
        </button>
      </div>
      <div v-if="bg" class="color-row">
        <label class="sq fld"><input type="color" class="swatch" :value="hex" aria-label="캔버스 배경색" @change="emit('settings', { background: ($event.target as HTMLInputElement).value.toUpperCase() })"><input :value="bg.toUpperCase()" aria-label="배경색 값" @change="setHex" @keydown="blur"></label>
      </div>
      <p v-else class="tx-meta m0">화면 모드(라이트 · 다크)에 맞춘 기본 배경이에요</p>
      <div class="presets" role="group" aria-label="자주 쓰는 배경">
        <button v-for="c in PRESETS" :key="c" class="pre" :class="{ on: bg === c }" :style="{ background: c }" :aria-label="`배경 ${c}`" :title="c" @click="emit('settings', { background: c })" />
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>캔버스</span></div>
      <button :class="['cb', { on: page.viewport?.pixelGrid !== false }]" role="switch" :aria-checked="page.viewport?.pixelGrid !== false" @click="emit('settings', { pixelGrid: page.viewport?.pixelGrid === false })"><i />픽셀 격자 (800% 이상 확대할 때)</button>
      <div class="zoom-row">
        <span class="tx-meta">확대</span>
        <span class="num zv">{{ Math.round(zoom * 100) }}%</span>
        <span class="zb">
          <button class="ib s24" aria-label="축소" @click="emit('zoom', zoom / 1.25)"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg></button>
          <button class="ib s24" aria-label="확대" @click="emit('zoom', zoom * 1.25)"><Icon name="plus" :size="14" /></button>
          <button class="ib s24" aria-label="100%" title="100% (⇧0)" @click="emit('zoom', 1)"><span class="t1">1:1</span></button>
          <button class="ib s24" aria-label="전체 보기" title="전체 보기 (⇧1)" @click="emit('zoom', 'fit')"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg></button>
        </span>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>스타일</span></div>
      <div class="style-row"><span class="dot c" aria-hidden="true" /><span class="tx-body f1">색 토큰</span><span class="tx-meta num">{{ colorCount }}</span></div>
      <div class="style-row"><span class="dot t" aria-hidden="true">Ag</span><span class="tx-body f1">텍스트 스타일</span><span class="tx-meta num">{{ textCount }}</span></div>
      <TextButton size="s" color="blue" class="self-start" @click="navigateTo('/design-system')">디자인 시스템에서 보기</TextButton>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>단축키</span></div>
      <dl class="keys">
        <dt>이동</dt><dd>스페이스+끌기 · H</dd>
        <dt>확대</dt><dd>⌘+스크롤 · 핀치</dd>
        <dt>전체 보기</dt><dd>⇧1</dd>
        <dt>그리기</dt><dd>F · R · T</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.pg { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s.first { box-shadow: none; padding-top: var(--ref-spacing-02); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.m0 { margin: 0; }
.color-row { display: grid; grid-template-columns: minmax(0, 1fr); }
.swatch { width: 14px !important; height: 14px; padding: 0; border: 0; border-radius: 3px; flex: none; cursor: pointer; background: none; box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 3px; }
.presets { display: flex; gap: var(--ref-spacing-04); }
.pre { width: 20px; height: 20px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); transition: box-shadow .12s ease; }
.pre:hover { box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-20); }
.pre.on { box-shadow: 0 0 0 1.5px var(--sys-color-brand-primary-default); }
.pre:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.zoom-row { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.zv { color: var(--sys-color-neutral-800); }
.zb { display: flex; margin-left: auto; }
.t1 { font-size: 10px; line-height: 16px; font-weight: 600; }
.style-row { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.dot { width: 16px; height: 16px; border-radius: 4px; flex: none; display: grid; place-items: center; }
.dot.c { background: conic-gradient(#2C7BE2 0 25%, #1FA35C 0 50%, #F2A20C 0 75%, #E5484D 0); }
.dot.t { background: var(--sys-color-neutral-100); font-size: 9px; line-height: 16px; font-weight: 600; color: var(--sys-color-neutral-700); }
.f1 { flex: 1; }
.self-start { align-self: flex-start; }
.keys { display: grid; grid-template-columns: auto 1fr; gap: var(--ref-spacing-02) var(--ref-spacing-08); margin: 0; }
.keys dt { color: var(--sys-color-neutral-500); }
.keys dd { margin: 0; color: var(--sys-color-neutral-700); }
</style>
