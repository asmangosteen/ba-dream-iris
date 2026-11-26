<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { Icon } from '@ba-dream/design-system'
import type { DsPropMeta } from 'virtual:iris-ds-props'
import type { LayerNode } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { SLOT_KEY, dsComponent, dsProps, instDefault, slotFallback } from '~/components/editor/InstanceView.vue'
import EditorSelect from '~/components/editor/EditorSelect.vue'
import IconPicker from '~/components/editor/IconPicker.vue'
import ColorField from '~/components/editor/ColorField.vue'
import { fromRgba } from '~/canvas/color'
import { instTick, readInstanceTree, subSel, type SubNode } from '~/composables/useInstanceTree'

/** 인스턴스 속성(피그마 Instance 패널): 변형(선택) · 켜고 끄기 · 글자 · 숫자. 기본값은 컴포넌트 기본값을 보여 줘요 */
const props = defineProps<{ sid: string; ids: string[] }>()
const store = useLayerStore()
const node = computed<LayerNode | null>(() => (props.ids[0] ? store.node(props.sid, props.ids[0]) ?? null : null))
const name = computed(() => node.value?.component ?? '')
const known = computed(() => !!dsComponent(name.value))

// --- 고른 하위 줄(레이어 목록에서): 글자 · 글자 색 · 칠을 덮어쓰기로(피그마 인스턴스 override). 이름 · 숨김은 레이어 목록에서 ---
const sub = computed(() => { const s = subSel.value, n = node.value; return s && n && s.sid === props.sid && s.id === n.id ? s : null })
const subNode = computed<SubNode | null>(() => {
  void instTick.value
  const s = sub.value
  if (!s) return null
  const find = (l: SubNode[]): SubNode | null => { for (const x of l) { if (x.key === s.key) return x; const f = find(x.children); if (f) return f } return null }
  return find(readInstanceTree(s.sid, s.id))
})
const subOv = computed(() => (sub.value ? node.value?.subOverrides?.[sub.value.key] ?? {} : {}))
/** 그려진 색(rgb) → '#RRGGBB(AA)' — 덮어쓰기 전 기본값 보여 주기 */
function cssHex(v: string | undefined): string | null {
  const m = v?.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const [r, g, b, a] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number)
  if (a === 0) return null
  return fromRgba({ r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a ?? 1 })
}
const subColor = computed(() => { void instTick.value; const el = subNode.value?.el as HTMLElement | null; return subOv.value.color ?? (el ? cssHex(getComputedStyle(el).color) : null) ?? '#000000' })
const subFill = computed(() => { void instTick.value; const el = subNode.value?.el as HTMLElement | null; return subOv.value.fill ?? (el ? cssHex(getComputedStyle(el).backgroundColor) : null) })
/** 덮어쓰기 고치기(실행취소 한 번). 값이 다 비면 그 자리 덮어쓰기를 지워요 */
function setSub(patch: Record<string, unknown>) {
  const s = sub.value
  if (!s) return
  store.update(props.sid, [s.id], (n) => {
    const all = { ...(n.subOverrides ?? {}) }
    const cur: Record<string, unknown> = { ...all[s.key], ...patch }
    for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === '' || cur[k] === false) delete cur[k]
    if (Object.keys(cur).length) all[s.key] = cur; else delete all[s.key]
    return { subOverrides: Object.keys(all).length ? all : undefined }
  })
}
function onSubText(e: Event) {
  const v = (e.target as HTMLInputElement).value
  setSub({ text: v === subNode.value?.name ? undefined : v })
}

// 캔버스에서 고칠 일이 없는 것: 객체 · 함수 · 이벤트, class · style · id
const HIDDEN = new Set(['class', 'style', 'id', 'key', 'ref'])
// 화면에 안 보이는 접근성 속성(aria-* · role · for · tabindex)은 패널에 보이지 않아요 — title · name · alt 는 실제 내용이라 보여요
const A11Y = /^(aria[A-Z]|role$|htmlFor$|tabindex$)/
const ORDER: Record<DsPropMeta['kind'], number> = { enum: 0, boolean: 1, string: 2, number: 2, other: 9 }

/** dep: 이 값을 쓰는 켜고 끄기(showX) 속성 — 그 토글이 켜졌을 때만 바로 아래에 들여서 보여요(피그마 Left Icon → 아이콘처럼) */
interface Row extends DsPropMeta { key: string; label: string; a11y: boolean; dep?: string; list?: boolean }
const isLabelList = (v: unknown): v is { label: string }[] => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'label' in x)
/** 피그마 컴포넌트 속성 이름과 다른 코드 이름(바드림 디자인 시스템 피그마 기준) */
const ALIAS: Record<string, string> = { showSupportingText: 'Supporting Text', showLeftIcon: 'Left Icon', showRightIcon: 'Right Icon', forceState: 'State', os: 'OS', items: 'Items' }
const rows = computed<Row[]>(() => {
  // 빌드 속성 목록에 없는 목록 속성(items)도 Iris 기본 목록이 있으면 글자 칸으로 보여요(Tab · SegmentedControl)
  const base = dsProps(name.value)
  const extra: DsPropMeta[] = !base.some((p) => p.name === 'items') && isLabelList(instDefault(name.value, 'items')) ? [{ name: 'items', kind: 'other' } as DsPropMeta] : []
  const list: Row[] = [...extra, ...base]
    // 목록 속성(items: [{ label }])은 글자 칸 하나로 — 쉼표로 나눠 적어요(Tab 1, Tab 2, Tab 3)
    .map((p) => (p.name === 'items' && p.kind === 'other' && isLabelList(instDefault(name.value, 'items')) ? { ...p, kind: 'string' as const, list: true } : p))
    .filter((p) => p.kind !== 'other' && !HIDDEN.has(p.name) && !/^on[A-Z]/.test(p.name) && !A11Y.test(p.name))
    .map((p) => ({ ...p, key: p.slot ? SLOT_KEY : p.name, label: p.slot ? 'Text' : labelOf(p.name), a11y: false }))
  // 피그마처럼: 변형 → 켜고 끄기 → 글자(슬롯 글자 먼저) → 접근성 속성은 맨 아래
  const rank = (r: Row) => (r.a11y ? 10 : r.slot ? 1.5 : ORDER[r.kind])
  const sorted = list.map((r, i) => [r, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r)
  // showX 토글에 딸린 값(xLabel · xIconName · xTheme · x …)을 그 토글 바로 아래로 — 먼저 딸린 것을 다 고른 뒤 늘어놓아요
  const kids = new Map<string, Row[]>()
  // 슬롯 글자(Text) 칸이 따로 있으면 딸린 글자 칸은 'Text' 대신 제 이름(Menu 의 Caption)
  const hasSlot = sorted.some((x) => x.slot)
  const used = new Set<string>()
  for (const r of sorted) {
    const m = r.kind === 'boolean' ? /^show([A-Z]\w*)$/.exec(r.name) : null
    if (!m) continue
    const base = m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1)
    // 여러 단어면 앞 단어로도 묶어요(showSupportingText → supportingText · supportingTheme). 한 단어 이름은 그대로
    // 단, 앞 단어와 같은 이름의 속성이 따로 있으면(ListSort 의 label · showLabelIcon) 그건 따로 쓰는 값이라 앞 단어로는 안 묶어요
    const head0 = /^[a-z]+(?=[A-Z])/.exec(base)?.[0] ?? base
    const head = head0 !== base && sorted.some((x) => x.name === head0) ? base : head0
    const list: Row[] = []
    for (const k of sorted) {
      // 앞 단어가 단어 경계에서 끝나야 딸린 값(showSubPlan 의 'sub' 가 subsidyLabel 을 데려가지 않게)
      const bound = (pre: string) => k.name.startsWith(pre) && (k.name.length === pre.length || /[A-Z]/.test(k.name.charAt(pre.length)))
      if (k === r || k.slot || k.a11y || k.kind === 'boolean' || used.has(k.key) || !bound(head)) continue
      const rest = bound(base) ? k.name.slice(base.length) : k.name.slice(head.length)
      used.add(k.key)
      list.push({ ...k, dep: r.key, label: rest === '' ? (hasSlot ? labelOf(k.name) : 'Text') : rest === 'Name' && /Icon$/.test(base) ? 'Icon' : labelOf(rest) })
    }
    kids.set(r.key, list)
  }
  return sorted.filter((r) => !used.has(r.key)).flatMap((r) => [r, ...(kids.get(r.key) ?? [])])
})
const depRow = (r: Row) => rows.value.find((x) => x.key === r.dep)

/** 속성 값(이름으로): 고친 값 → Iris 기본값 → 빌드 속성 목록 기본값 → 컴포넌트 런타임 기본값 */
function val(n: string): unknown {
  if (set.value[n] !== undefined) return set.value[n]
  const d = instDefault(name.value, n) ?? dsProps(name.value).find((p) => p.name === n)?.default
  if (d !== undefined) return d
  const rp = (dsComponent(name.value) as { props?: Record<string, { default?: unknown }> } | null)?.props?.[n]?.default
  return typeof rp === 'function' ? undefined : rp
}
type Get = (n: string) => unknown
/** 'text-icon' 처럼 '-' 로 이은 값에 그 낱말이 있는지 */
const has = (v: unknown, w: string) => typeof v === 'string' && v.split('-').includes(w)
const isOn = (v: unknown) => v === true
const HIDE = () => false
const byContents = { iconName: (g: Get) => has(g('contents'), 'icon'), default: (g: Get) => has(g('contents'), 'text') }
/**
 * 필요할 때만 보이는 속성(디자인 시스템 컴포넌트가 실제로 그 값을 쓰는 조건) — 컴포넌트 → 속성 이름(슬롯 글자는 'default') → 보일 조건.
 * 여기 적은 조건이 showX 토글 규칙보다 앞서요. HIDE: Contents 가 대신하는 옛 켜고 끄기(Chip · FilterChip)
 */
const WHEN: Record<string, Record<string, (g: Get) => boolean>> = {
  Button: byContents,
  TextButton: byContents,
  Chip: { ...byContents, default: () => true, avatarSrc: (g) => has(g('contents'), 'avatar'), showIcon: HIDE, showAvatar: HIDE, iconPosition: HIDE },
  FilterChip: { default: (g) => has(g('contents'), 'text'), avatarSrc: (g) => has(g('contents'), 'avatar'), showText: HIDE, showAvatar: HIDE },
  ButtonGroup: {
    secondaryLabel: (g) => !['solo', 'with-etc', 'with-check', 'with-icon'].includes(String(g('type'))),
    etcLabel: (g) => g('type') === 'with-etc',
    costLabel: (g) => g('type') === 'with-cost', cost: (g) => g('type') === 'with-cost',
    checkLabel: (g) => g('type') === 'with-check', showCheckIcon: (g) => g('type') === 'with-check',
  },
  ListCommon: {
    iconName: (g) => g('leftBlock') === 'icon', iconCategory: (g) => g('leftBlock') === 'icon', iconColor: (g) => g('leftBlock') === 'icon',
    imageSrc: (g) => g('leftBlock') === 'image', imageAlt: (g) => g('leftBlock') === 'image',
    buttonLabel: (g) => g('rightBlock') === 'button', cost: (g) => has(g('rightBlock'), 'cost'), checked: (g) => g('rightBlock') === 'check',
  },
  Menu: {
    with: (g) => isOn(g('leftBlock')),
    iconName: (g) => isOn(g('leftBlock')) && g('with') === 'icon', iconCategory: (g) => isOn(g('leftBlock')) && g('with') === 'icon',
    imageSrc: (g) => isOn(g('leftBlock')) && g('with') === 'image', imageAlt: (g) => isOn(g('leftBlock')) && g('with') === 'image',
    captionType: (g) => isOn(g('showCaption')), captionTheme: (g) => isOn(g('showCaption')),
    caption: (g) => isOn(g('showCaption')) && g('captionType') !== 'badge-numeric',
    captionCount: (g) => isOn(g('showCaption')) && g('captionType') === 'badge-numeric',
  },
  Select: { iconName: (g) => has(g('trailing'), 'icon'), subText: (g) => has(g('trailing'), 'subtext') },
  NavTrailingItem: { iconName: (g) => g('type') === 'icon', label: (g) => g('type') === 'button' },
  NavBarTop: {
    showBackLabel: (g) => isOn(g('showLeading')) && String(g('type')).endsWith('-back'),
    backLabel: (g) => isOn(g('showLeading')) && String(g('type')).endsWith('-back') && g('showBackLabel') !== false,
    title: (g) => g('type') === 'big-title' || (String(g('type')).startsWith('smalltitle') && isOn(g('showSmalltitle'))),
    showSmalltitle: (g) => /^(smalltitle|seg)-/.test(String(g('type'))),
    segmentValue: (g) => String(g('type')).startsWith('seg-'), defaultSegmentValue: (g) => String(g('type')).startsWith('seg-'),
  },
  NoticeBox: { title: (g) => g('contents') !== 'caption', description: (g) => g('contents') !== 'title' },
  SupportingText: { current: (g) => isOn(g('showCount')), max: (g) => isOn(g('showCount')), countState: (g) => isOn(g('showCount')) },
  TimelineEntry: { buttonLabel: (g) => g('trailing') === 'button', amount: (g) => g('trailing') !== 'button' },
  TimelineTask: { with: (g) => isOn(g('showAction')), actionLabel: (g) => isOn(g('showAction')) },
  Toast: { buttonLabel: (g) => isOn(g('button')) },
  ToastCard: { buttonLabel: (g) => isOn(g('button')) },
  PopUp: { secondaryLabel: (g) => String(g('buttonCount')) === '2' },
  PopUpCard: { secondaryLabel: (g) => String(g('buttonCount')) === '2' },
  Tab: { tailingIcon: (g) => g('type') === 'hug', sidePadding: (g) => g('type') === 'hug' },
}
/** 들여 보일지: 딸린 토글이 패널에 보일 때만(옛 토글을 숨긴 Chip 의 Icon 은 들이지 않아요) */
const subOf = (r: Row) => { const d = r.dep ? depRow(r) : undefined; return !!d && shown(d) }
/** 칸 이름: 딸린 토글이 숨었으면(Chip 의 Show Icon) 'Name' 이 아니라 제 이름 그대로('Icon Name') */
const labelFor = (r: Row) => (r.dep && !subOf(r) ? labelOf(r.name) : r.label)
const shown = (r: Row): boolean => {
  const rule = WHEN[name.value]?.[r.slot ? 'default' : r.name]
  if (rule) return rule(val)
  const d = r.dep ? depRow(r) : undefined
  return !d || current(d) === true
}
/** 아이콘 이름 칸: 고른 아이콘을 칸 안에 미리 보여요 */
const isIcon = (r: Row) => /icon(Name)?$/i.test(r.name) && r.kind === 'string'
// 아이콘 고르기 팝오버: 연 칸(key)과 그 칸 요소(팝오버 자리 기준)
const iconFor = ref<string | null>(null)
const iconAnchor = ref<HTMLElement | null>(null)
const iconRow = computed(() => rows.value.find((r) => r.key === iconFor.value) ?? null)
function openIcon(r: Row, e: MouseEvent) { iconAnchor.value = e.currentTarget as HTMLElement; iconFor.value = iconFor.value === r.key ? null : r.key }

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
  const ACR: Record<string, string> = { ios: 'iOS', aos: 'AOS', android: 'Android', pdf: 'PDF', url: 'URL' }
  if (ACR[o.toLowerCase()]) return ACR[o.toLowerCase()]!
  const s = o.replace(/[-_]/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const set = computed(() => node.value?.props ?? {})
const isSet = (r: Row) => set.value[r.key] !== undefined
/** 칸에 보일 글자: 목록(items)은 'A, B, C' */
const asText = (v: unknown) => (isLabelList(v) ? v.map((x) => x.label).join(', ') : String(v ?? ''))
/** 컴포넌트 기본값(슬롯 글자는 캔버스가 넣는 기본 글자) */
const def = (r: Row): unknown => {
  if (r.slot) return slotFallback(name.value)
  const d = instDefault(name.value, r.name) ?? r.default
  return r.list && isLabelList(d) ? d.map((x) => x.label).join(', ') : d
}
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
  if (r.list) {
    const labels = v.split(',').map((x) => x.trim()).filter(Boolean)
    const joined = labels.join(', ')
    write(r, !labels.length || joined === def(r) ? undefined : labels.map((label) => ({ label })))
    return
  }
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
        <span class="ell">{{ name || tr('Instance') }}</span>
      </span>
      <button v-if="changed" class="ib s24" :aria-label="tr('Reset all changes')" :title="tr('Reset all changes')" @click="reset">
        <EditorIcon name="renew" />
      </button>
    </div>

    <!-- 고른 하위 줄(레이어 목록): 이름 · 글자 · 색 · 칠 덮어쓰기 -->
    <div v-if="sub" class="subsec">
      <div class="subh">
        <EditorIcon :name="sub.kind === 'text' ? 'text' : 'component'" :size="16" class="dia" />
        <span class="ell">{{ subOv.name || (sub.kind === 'text' ? subOv.text : undefined) || subNode?.name || sub.name }}</span>
        <button v-if="Object.keys(subOv).length" class="ib s24" :aria-label="tr('Reset all changes')" :title="tr('Reset all changes')" @click="setSub({ name: undefined, hidden: undefined, locked: undefined, color: undefined, fill: undefined, text: undefined })"><EditorIcon name="renew" /></button>
      </div>
      <p v-if="subOv.locked" class="note">{{ tr('Locked — unlock in the layers panel to edit') }}</p>
      <fieldset class="subfs" :disabled="!!subOv.locked">
      <div v-if="sub.kind === 'text'" :class="['row', { mod: subOv.text !== undefined }]">
        <span class="lbl">{{ tr('Text') }}</span>
        <label class="sq fld"><input :key="'st' + (subOv.text ?? '')" :value="subOv.text ?? subNode?.name ?? ''" :aria-label="tr('Text')" @change="onSubText" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      </div>
      <div :class="['row', { mod: !!subOv.color }]">
        <span class="lbl">{{ sub.kind === 'icon' ? tr('Icon color') : tr('Text color') }}</span>
        <ColorField :model-value="subColor" :sid="sid" :label="sub.kind === 'icon' ? 'Icon color' : 'Text color'" @update:model-value="(v) => setSub({ color: v })" />
      </div>
      <div v-if="sub.kind === 'component'" :class="['row', { mod: !!subOv.fill }]">
        <span class="lbl">{{ tr('Fill') }}</span>
        <ColorField :model-value="subFill ?? '#FFFFFF00'" :sid="sid" label="Fill" @update:model-value="(v) => setSub({ fill: v })" />
      </div>
      </fieldset>
    </div>

    <p v-if="!known" class="note">{{ tr("This component isn't in the design system library.") }}</p>
    <p v-else-if="!rows.length" class="note">{{ tr('No editable properties') }}</p>

    <template v-for="r in rows" :key="r.key">
    <div v-if="shown(r)" :class="['row', { mod: isSet(r), sub: subOf(r), bool: r.kind === 'boolean' }]" :title="r.doc">
      <template v-if="r.kind === 'boolean'">
        <!-- 피그마처럼: 이름 왼쪽, 토글 오른쪽 -->
        <span class="lbl ell">{{ labelFor(r) }}</span>
        <button :class="['tg', 'tsw', { on: current(r) === true }]" role="switch" :aria-checked="current(r) === true" :aria-label="r.label" @click="write(r, current(r) !== true)" />
      </template>
      <template v-else>
        <span class="lbl ell">{{ labelFor(r) }}</span>
        <EditorSelect v-if="r.kind === 'enum'" :model-value="current(r) === undefined ? '' : String(current(r))" :options="enumOpts(r)" :ariaLabel="r.label" raw @update:model-value="(v) => pick(r, v)" />
        <label v-else-if="r.kind === 'number'" class="sq fld">
          <input :key="'n' + String(set[r.key])" :value="current(r) ?? ''" inputmode="decimal" :placeholder="current(r) === undefined ? tr('Auto') : ''" :aria-label="r.label" @change="num(r, $event)" @keydown="blur">
        </label>
        <!-- 아이콘 이름: 글자 대신 고르기(디자인 시스템 아이콘 팝오버, 한 줄 4칸) -->
        <button v-else-if="isIcon(r)" type="button" :class="['sq', 'fld', 'icon-fld', { open: iconFor === r.key }]" :aria-label="r.label" :aria-expanded="iconFor === r.key" @click="openIcon(r, $event)">
          <Icon v-if="current(r)" :name="String(current(r))" :size="16" class="ico" />
          <span :class="['ell', { ph: !isSet(r) }]">{{ asText(current(r)) || tr('Choose icon') }}</span>
          <EditorIcon name="chevron_down" :size="12" class="chev-i" />
        </button>
        <label v-else class="sq fld">
          <Icon v-if="isIcon(r) && current(r)" :name="String(current(r))" :size="16" class="ico" />
          <input :key="'t' + asText(set[r.key])" :value="isSet(r) ? asText(set[r.key]) : ''" :placeholder="asText(current(r))" :aria-label="r.label" @change="text(r, $event)" @keydown="blur">
        </label>
      </template>
    </div>
    </template>

    <button v-if="changed" class="reset" @click="reset">{{ tr('Reset all changes') }}</button>
    <IconPicker v-if="iconRow" :model-value="String(current(iconRow) ?? '')" :anchor="iconAnchor" @update:model-value="(v) => write(iconRow!, v)" @close="iconFor = null" />
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 28px; padding: 0; }
.s24 { width: 28px; height: 28px; }
.ttl { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
/* 컴포넌트 이름 줄은 섹션 제목보다 한 단계 크게: 글자 14/22 · 아이콘 20 · 줄 28 */
.inst-h { height: 28px; font-size: 14px; line-height: 22px; }
.dia { flex: none; color: var(--iris-component); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.note { margin: 0; font-size: 12px; color: var(--sys-color-neutral-500); }
/* 고른 하위 줄 칸: 인스턴스 속성 위, 아래 선으로 나눠요 */
.subsec { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding-bottom: var(--ref-spacing-06); border-bottom: 1px solid var(--iris-line); }
.subh { display: flex; align-items: center; gap: var(--ref-spacing-04); min-height: 28px; font-size: 12px; font-weight: 600; color: var(--iris-component); }
.subh .ell { flex: 1; min-width: 0; }
.subfs { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.subfs:disabled { opacity: .5; }
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
/* 아이콘 칸: 누르면 팝오버 — 아이콘 16 · 이름 · ▾ */
.icon-fld { width: 100%; gap: var(--ref-spacing-04); text-align: left; cursor: pointer; }
.icon-fld .ph { color: var(--sys-color-neutral-500); }
.icon-fld .ell { flex: 1; }
.icon-fld .chev-i { flex: none; color: var(--sys-color-neutral-500); }
.icon-fld.open { --sq-line: var(--iris-open-line); --sq-line-w: 1px; }
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
