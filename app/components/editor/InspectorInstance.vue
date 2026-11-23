<script setup lang="ts">
import type { DsPropMeta } from 'virtual:iris-ds-props'
import type { LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { SLOT_KEY, dsComponent, dsDefault, dsProps, slotFallback } from '~/components/editor/InstanceView.vue'

/** 인스턴스 속성(피그마 Instance 패널): 변형(선택) · 켜고 끄기 · 글자 · 숫자. 기본값은 컴포넌트 기본값을 보여 줘요 */
const props = defineProps<{ sid: string; ids: string[] }>()
const store = useLayerStore()
const node = computed<LayerNode | null>(() => (props.ids[0] ? store.node(props.sid, props.ids[0]) ?? null : null))
const name = computed(() => node.value?.component ?? '')
const known = computed(() => !!dsComponent(name.value))

// 캔버스에서 고칠 일이 없는 것: 객체 · 함수 · 이벤트, class · style · id
const HIDDEN = new Set(['class', 'style', 'id', 'key', 'ref'])
const A11Y = /^(aria[A-Z]|role$|alt$|title$|htmlFor$|name$|tabindex$)/i
const ORDER: Record<DsPropMeta['kind'], number> = { enum: 0, boolean: 1, string: 2, number: 2, other: 9 }

interface Row extends DsPropMeta { key: string; label: string; a11y: boolean }
const rows = computed<Row[]>(() => {
  const list = dsProps(name.value)
    .filter((p) => p.kind !== 'other' && !HIDDEN.has(p.name) && !/^on[A-Z]/.test(p.name))
    .map((p) => ({ ...p, key: p.slot ? SLOT_KEY : p.name, label: p.slot ? 'Text' : labelOf(p.name), a11y: !p.slot && A11Y.test(p.name) }))
  // 피그마처럼: 변형 → 켜고 끄기 → 글자(슬롯 글자 먼저) → 접근성 속성은 맨 아래
  const rank = (r: Row) => (r.a11y ? 10 : r.slot ? 1.5 : ORDER[r.kind])
  return list.map((r, i) => [r, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r)
})

/** camelCase → Sentence case ('iconName' → 'Icon name', 'showCheckIcon' → 'Show check icon') */
function labelOf(k: string) {
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\baria\b/i, 'ARIA').replace(/\bid\b/, 'ID').replace(/\burl\b/, 'URL')
}
/** 선택지 라벨: 'text-icon' → 'Text icon', 'xl' → 'XL', 16 → '16' */
function optLabel(o: string | number) {
  if (typeof o === 'number') return String(o)
  if (/^\d*x*[sml]$|^\d?xl$/i.test(o)) return o.toUpperCase()
  const s = o.replace(/[-_]/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const set = computed(() => node.value?.props ?? {})
const isSet = (r: Row) => set.value[r.key] !== undefined
/** 컴포넌트 기본값(슬롯 글자는 캔버스가 넣는 기본 글자) */
const def = (r: Row): unknown => (r.slot ? slotFallback(name.value) : r.default ?? dsDefault(name.value, r.name))
/** 지금 값: 고친 값 → 기본값 */
const current = (r: Row): unknown => (isSet(r) ? set.value[r.key] : def(r))
const changed = computed(() => Object.values(set.value).some((v) => v !== undefined))

/** 값 쓰기 — 기본값과 같으면 지워서 '고친 것'으로 남지 않게 */
function write(r: Row, value: unknown) {
  const v = value === def(r) ? undefined : value
  store.update(props.sid, props.ids, (n) => {
    const next: Record<string, unknown> = { ...n.props }
    if (v === undefined) delete next[r.key]
    else next[r.key] = v
    return { props: next }
  })
}
function pick(r: Row, e: Event) {
  const raw = (e.target as HTMLSelectElement).value
  if (raw === '') { write(r, undefined); return }
  write(r, r.options?.find((o) => String(o) === raw) ?? raw)
}
function text(r: Row, e: Event) {
  const v = (e.target as HTMLInputElement).value
  // 비우면 기본값으로(슬롯 글자는 빈 글자도 그대로 둡니다 — 일부러 비울 수 있게)
  write(r, v === '' && !r.slot ? undefined : v)
}
function num(r: Row, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (raw === '') { write(r, undefined); return }
  const v = Number(raw)
  if (Number.isFinite(v)) write(r, v)
}
const reset = () => store.update(props.sid, props.ids, () => ({ props: {} }))
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
</script>

<template>
  <section v-if="node" class="s">
    <div class="sec-h h24">
      <span class="ttl">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="dia"><path d="M6 1.2L10.8 6 6 10.8 1.2 6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
        <span class="ell">{{ name || 'Instance' }}</span>
      </span>
      <button v-if="changed" class="ib s24" aria-label="Reset all changes" title="Reset all changes" @click="reset">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7a4 4 0 1 0 1.2-2.85M3 2.5v2.2h2.2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>

    <p v-if="!known" class="note">This component isn't in the design system library.</p>
    <p v-else-if="!rows.length" class="note">No editable properties</p>

    <div v-for="r in rows" :key="r.key" :class="['row', { mod: isSet(r) }]" :title="r.doc">
      <template v-if="r.kind === 'boolean'">
        <button :class="['cb', { on: current(r) === true }]" role="switch" :aria-checked="current(r) === true" @click="write(r, current(r) !== true)"><i />{{ r.label }}</button>
      </template>
      <template v-else>
        <span class="lbl ell">{{ r.label }}</span>
        <select v-if="r.kind === 'enum'" class="sq sel" :aria-label="r.label" :value="current(r) === undefined ? '' : String(current(r))" @change="pick(r, $event)">
          <option v-if="def(r) === undefined" value="">—</option>
          <option v-for="o in r.options" :key="String(o)" :value="String(o)">{{ optLabel(o) }}</option>
        </select>
        <label v-else-if="r.kind === 'number'" class="sq fld">
          <input :key="'n' + String(set[r.key])" :value="current(r) ?? ''" inputmode="decimal" :placeholder="current(r) === undefined ? 'Auto' : ''" :aria-label="r.label" @change="num(r, $event)" @keydown="blur">
        </label>
        <label v-else class="sq fld">
          <input :key="'t' + String(set[r.key])" :value="isSet(r) ? set[r.key] : ''" :placeholder="String(current(r) ?? '')" :aria-label="r.label" @change="text(r, $event)" @keydown="blur">
        </label>
      </template>
    </div>

    <button v-if="changed" class="reset" @click="reset">Reset all changes</button>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.ttl { display: flex; align-items: center; gap: var(--ref-spacing-03, 6px); min-width: 0; }
.dia { flex: none; color: var(--iris-component); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.note { margin: 0; font-size: 12px; color: var(--sys-color-neutral-500); }
.row { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-04); min-height: 28px; }
.row:has(> .cb) { display: flex; }
.lbl { font-size: 12px; color: var(--sys-color-neutral-600); }
.row.mod .lbl { color: var(--sys-color-neutral-800); font-weight: 500; }
.sel { height: 28px; padding: 0 var(--ref-spacing-04); border: 0; border-radius: var(--ref-radius-03); background: var(--sys-color-neutral-200); font: inherit; font-size: 12px; color: var(--sys-color-neutral-800); min-width: 0; width: 100%; }
.sel:focus-visible { outline: 1px solid var(--sys-color-brand-primary-default); }
.fld input::placeholder { color: var(--sys-color-neutral-500); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 0.5px; }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { box-shadow: inset 0 0 0 1px var(--sys-color-neutral-600); }
.cb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.reset { align-self: flex-start; margin-top: var(--ref-spacing-02); font-size: 12px; color: var(--sys-color-brand-primary-default); border-radius: var(--ref-radius-02); }
.reset:hover { text-decoration: underline; }
.reset:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
</style>
