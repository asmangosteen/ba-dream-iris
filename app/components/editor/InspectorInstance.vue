<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Icon } from '@ba-dream/design-system'
import type { DsPropMeta } from 'virtual:iris-ds-props'
import type { LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { SLOT_KEY, dsComponent, dsDefault, dsProps, slotFallback } from '~/components/editor/InstanceView.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'

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

/** dep: 이 값을 쓰는 켜고 끄기(showX) 속성 — 그 토글이 켜졌을 때만 바로 아래에 들여서 보여요(피그마 Left Icon → 아이콘처럼) */
interface Row extends DsPropMeta { key: string; label: string; a11y: boolean; dep?: string }
/** 피그마 컴포넌트 속성 이름과 다른 코드 이름(바드림 디자인 시스템 피그마 기준) */
const ALIAS: Record<string, string> = { showSupportingText: 'Supporting Text', showLeftIcon: 'Left Icon', showRightIcon: 'Right Icon', forceState: 'State' }
const rows = computed<Row[]>(() => {
  const list: Row[] = dsProps(name.value)
    .filter((p) => p.kind !== 'other' && !HIDDEN.has(p.name) && !/^on[A-Z]/.test(p.name))
    .map((p) => ({ ...p, key: p.slot ? SLOT_KEY : p.name, label: p.slot ? 'Text' : labelOf(p.name), a11y: !p.slot && A11Y.test(p.name) }))
  // 피그마처럼: 변형 → 켜고 끄기 → 글자(슬롯 글자 먼저) → 접근성 속성은 맨 아래
  const rank = (r: Row) => (r.a11y ? 10 : r.slot ? 1.5 : ORDER[r.kind])
  const sorted = list.map((r, i) => [r, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r)
  // showX 토글에 딸린 값(xLabel · xIconName · xTheme · x …)을 그 토글 바로 아래로 — 먼저 딸린 것을 다 고른 뒤 늘어놓아요
  const kids = new Map<string, Row[]>()
  const used = new Set<string>()
  for (const r of sorted) {
    const m = r.kind === 'boolean' ? /^show([A-Z]\w*)$/.exec(r.name) : null
    if (!m) continue
    const base = m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1)
    // 여러 단어면 앞 단어로도 묶어요(showSupportingText → supportingText · supportingTheme). 한 단어 이름은 그대로
    const head = /^[a-z]+(?=[A-Z])/.exec(base)?.[0] ?? base
    const list: Row[] = []
    for (const k of sorted) {
      if (k === r || k.slot || k.a11y || k.kind === 'boolean' || used.has(k.key) || !k.name.startsWith(head)) continue
      const rest = k.name.startsWith(base) ? k.name.slice(base.length) : k.name.slice(head.length)
      used.add(k.key)
      list.push({ ...k, dep: r.key, label: rest === '' ? 'Text' : rest === 'Name' && /Icon$/.test(base) ? 'Icon' : labelOf(rest) })
    }
    kids.set(r.key, list)
  }
  return sorted.filter((r) => !used.has(r.key)).flatMap((r) => [r, ...(kids.get(r.key) ?? [])])
})
const depRow = (r: Row) => rows.value.find((x) => x.key === r.dep)
const shown = (r: Row) => { const d = r.dep ? depRow(r) : undefined; return !d || current(d) === true }
/** 아이콘 이름 칸: 고른 아이콘을 칸 안에 미리 보여요 */
const isIcon = (r: Row) => /icon(Name)?$/i.test(r.name) && r.kind === 'string'

/** camelCase → 피그마식 Title Case ('showLabel' → 'Show Label', 'iconName' → 'Icon Name') */
function labelOf(k: string) {
  if (ALIAS[k]) return ALIAS[k]!
  const s = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').replace(/\bAria\b/, 'ARIA').replace(/\bId\b/, 'ID').replace(/\bUrl\b/, 'URL')
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
/** 변형 ▾ 선택지(기본값이 없으면 맨 위에 '—') */
const enumOpts = (r: Row) => [...(def(r) === undefined ? [{ value: '', label: '—' }] : []), ...(r.options ?? []).map((o) => ({ value: String(o), label: optLabel(o) }))]
function pick(r: Row, raw: string) {
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
/** Esc: 고치던 값을 버리고 칸에서 나가요 */
function onFocusIn(e: FocusEvent) { const t = e.target as HTMLInputElement; if (t.tagName === 'INPUT') t.dataset.orig = t.value }
function onEsc(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement
  if (e.key !== 'Escape' || t.tagName !== 'INPUT') return
  e.stopPropagation()
  t.dataset.esc = '1'
  t.value = t.dataset.orig ?? t.value
  t.blur()
  delete t.dataset.esc
}
function onChangeCap(e: Event) { if ((e.target as HTMLElement).dataset?.esc) e.stopPropagation() }
</script>

<template>
  <section v-if="node" class="s" @focusin="onFocusIn" @keydown="onEsc" @change.capture="onChangeCap">
    <div class="sec-h h24 inst-h">
      <span class="ttl">
        <EditorIcon name="component" :size="20" class="dia" />
        <span class="ell">{{ name || 'Instance' }}</span>
      </span>
      <button v-if="changed" class="ib s24" aria-label="Reset all changes" title="Reset all changes" @click="reset">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 2.5v2.8h2.8" stroke="currentColor" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>

    <p v-if="!known" class="note">This component isn't in the design system library.</p>
    <p v-else-if="!rows.length" class="note">No editable properties</p>

    <template v-for="r in rows" :key="r.key">
    <div v-if="shown(r)" :class="['row', { mod: isSet(r), sub: !!r.dep, bool: r.kind === 'boolean' }]" :title="r.doc">
      <template v-if="r.kind === 'boolean'">
        <!-- 피그마처럼: 이름 왼쪽, 토글 오른쪽 -->
        <span class="lbl ell">{{ r.label }}</span>
        <button :class="['tg', 'tsw', { on: current(r) === true }]" role="switch" :aria-checked="current(r) === true" :aria-label="r.label" @click="write(r, current(r) !== true)" />
      </template>
      <template v-else>
        <span class="lbl ell">{{ r.label }}</span>
        <EditorSelect v-if="r.kind === 'enum'" :model-value="current(r) === undefined ? '' : String(current(r))" :options="enumOpts(r)" :ariaLabel="r.label" @update:model-value="(v) => pick(r, v)" />
        <label v-else-if="r.kind === 'number'" class="sq fld">
          <input :key="'n' + String(set[r.key])" :value="current(r) ?? ''" inputmode="decimal" :placeholder="current(r) === undefined ? 'Auto' : ''" :aria-label="r.label" @change="num(r, $event)" @keydown="blur">
        </label>
        <label v-else class="sq fld">
          <Icon v-if="isIcon(r) && current(r)" :name="String(current(r))" :size="16" class="ico" />
          <input :key="'t' + String(set[r.key])" :value="isSet(r) ? set[r.key] : ''" :placeholder="String(current(r) ?? '')" :aria-label="r.label" @change="text(r, $event)" @keydown="blur">
        </label>
      </template>
    </div>
    </template>

    <button v-if="changed" class="reset" @click="reset">Reset all changes</button>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.ttl { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
/* 컴포넌트 이름 줄은 섹션 제목보다 한 단계 크게: 글자 14/22 · 아이콘 20 · 줄 28 */
.inst-h { height: 28px; font-size: 14px; line-height: 22px; }
.dia { flex: none; color: var(--iris-component); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.note { margin: 0; font-size: 12px; color: var(--sys-color-neutral-500); }
/* 라벨 | 값 — 아이콘이 없는 줄이라 값 칸은 패널 오른쪽 끝까지 */
.row { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: var(--ref-spacing-06); min-height: 28px; }
.row:has(> .cb) { display: flex; }
/* 켜고 끄기: 이름 | 토글(오른쪽 끝) */
.row.bool { grid-template-columns: minmax(0, 1fr) auto; }
.tsw { padding: 0; border: 0; cursor: pointer; transition: background-color .15s ease; }
.tsw:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 토글에 딸린 값: 들여서 */
.row.sub { grid-template-columns: 68px minmax(0, 1fr); padding-left: 12px; }
.fld .ico { flex: none; color: var(--sys-color-neutral-700); }
.lbl { font-size: 12px; color: var(--sys-color-neutral-600); }
.row.mod .lbl { color: var(--sys-color-neutral-800); font-weight: 500; }
.fld input::placeholder { color: var(--sys-color-neutral-500); }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.cb { align-self: flex-start; border-radius: var(--ref-radius-02); }
.cb:hover > i { --sq-line: var(--sys-color-neutral-600); }
.cb:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.reset { align-self: flex-start; margin-top: var(--ref-spacing-02); font-size: 12px; color: var(--sys-color-brand-primary-default); border-radius: var(--ref-radius-02); }
.reset:hover { text-decoration: underline; }
.reset:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
</style>
