<script lang="ts">
import type { ComponentRow, TokenRow, TokenType } from '~/composables/useIrisData'

export type RegisterTab = 'component' | 'token' | 'bulk'
type NewComponent = Omit<ComponentRow, 'id'>
type NewToken = Omit<TokenRow, 'id'>
type PropsSchema = NonNullable<ComponentRow['props_schema']>
export interface BulkResult { components: NewComponent[]; tokens: NewToken[]; errors: string[] }

const TOKEN_TYPES: TokenType[] = ['color', 'typography', 'spacing', 'radius', 'shadow']
const TYPE_ALIAS: Record<string, TokenType> = {
  color: 'color', colour: 'color', colors: 'color', 색: 'color', 색상: 'color',
  typography: 'typography', font: 'typography', fonts: 'typography', text: 'typography', 글자: 'typography', 타이포: 'typography', 타이포그래피: 'typography',
  spacing: 'spacing', space: 'spacing', spacings: 'spacing', dimension: 'spacing', 간격: 'spacing',
  radius: 'radius', radii: 'radius', borderradius: 'radius', 모서리: 'radius',
  shadow: 'shadow', shadows: 'shadow', boxshadow: 'shadow', elevation: 'shadow', 그림자: 'shadow',
}
const normKey = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '')

function tokenType(raw: unknown): TokenType | null {
  if (typeof raw !== 'string') return null
  return TYPE_ALIAS[normKey(raw)] ?? null
}

/** 종류가 비어 있으면 이름 · 값으로 짐작합니다 */
function guessType(name: string, value: string): TokenType | null {
  const head = name.split(/[/.]/)[0] ?? ''
  const byName = tokenType(head) ?? (/radius/i.test(name) ? 'radius' : /shadow|elevation/i.test(name) ? 'shadow' : /spacing|space|gap/i.test(name) ? 'spacing' : /font|type|title|body|caption/i.test(name) ? 'typography' : null)
  if (byName) return byName
  if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(value.trim())) return 'color'
  if (/\d+px\s+\d+px/.test(value) || /rgb\(.*\)\s*$/.test(value)) return 'shadow'
  return null
}

function stringValue(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('fontSize' in o) return `${o.fontSize ?? ''} / ${o.lineHeight ?? ''} · ${o.fontWeight ?? ''}`.trim()
    return JSON.stringify(v)
  }
  return ''
}

/** 'type: primary, secondary; disabled: boolean; label: text' (줄바꿈 또는 ; 로 나눔) */
export function parseProps(text: string): PropsSchema | null {
  const out: PropsSchema = {}
  for (const part of text.split(/[\n;]/)) {
    const m = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/)
    if (!m) continue
    const key = m[1]!, val = m[2]!
    if (/^(text|string|문자)$/i.test(val)) out[key] = 'text'
    else if (/^(boolean|bool|켜고 끄기)$/i.test(val)) out[key] = 'boolean'
    else out[key] = val.split(/[,|]/).map((x) => x.trim()).filter(Boolean)
  }
  return Object.keys(out).length ? out : null
}

function propsFrom(v: unknown): PropsSchema | null {
  if (typeof v === 'string') return parseProps(v)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: PropsSchema = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(raw)) out[k] = raw.map(String)
    else if (raw === 'boolean' || raw === 'bool' || typeof raw === 'boolean') out[k] = 'boolean'
    else if (raw === 'text' || raw === 'string') out[k] = 'text'
  }
  return Object.keys(out).length ? out : null
}

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}
const str = (v: unknown) => (v === undefined ? '' : String(v).trim())
const aliases = (v: unknown): string[] | null => {
  const list = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,|;]/) : []
  const out = list.map((x) => x.trim()).filter(Boolean)
  return out.length ? out : null
}

function toComponent(o: Record<string, unknown>, where: string, errors: string[]): NewComponent | null {
  const name = str(pick(o, 'name', 'Name', '이름', 'title'))
  if (!name) { errors.push(`${where}: 이름이 없어서 건너뛰었어요`); return null }
  return {
    name,
    code_name: str(pick(o, 'code_name', 'codeName', 'code', '코드 이름', '코드이름')) || null,
    category: str(pick(o, 'category', 'group', '분류')) || '기타',
    description: str(pick(o, 'description', 'desc', '설명')) || null,
    match_aliases: aliases(pick(o, 'match_aliases', 'aliases', 'alias', '별칭')),
    props_schema: propsFrom(pick(o, 'props_schema', 'props', 'propsSchema', '속성')),
  }
}

function toToken(o: Record<string, unknown>, where: string, errors: string[], fallbackName = '', fallbackType: TokenType | null = null): NewToken | null {
  const name = str(pick(o, 'name', 'Name', '이름')) || fallbackName
  const value = stringValue(pick(o, 'value', '$value', '값'))
  if (!name || !value) { errors.push(`${where}: 이름이나 값이 없어서 건너뛰었어요`); return null }
  const rawType = pick(o, 'type', '$type', '종류')
  const type = tokenType(rawType) ?? fallbackType ?? guessType(name, value)
  if (!type) { errors.push(`${where} (${name}): 종류를 알 수 없어요 — ${TOKEN_TYPES.join(' · ')} 중 하나를 적어주세요`); return null }
  return { type, name, value, description: str(pick(o, 'description', '$description', 'desc', '설명')) || null }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isTokenLike = (o: Record<string, unknown>) => 'value' in o || '$value' in o || '값' in o

/** 디자인 토큰 트리(Tokens Studio · W3C 형식) — { color: { brand: { primary: { $value, $type } } } } */
function walkTree(node: Record<string, unknown>, path: string[], inherited: TokenType | null, out: BulkResult) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || !isObj(v)) continue
    const next = [...path, k]
    const groupType = tokenType(v.$type ?? v.type) ?? inherited ?? (path.length === 0 ? tokenType(k) : null)
    if (isTokenLike(v)) {
      const t = toToken({ ...v, name: undefined }, next.join('/'), out.errors, next.join('/'), groupType)
      if (t) out.tokens.push(t)
    } else walkTree(v, next, groupType, out)
  }
}

function parseJson(text: string): BulkResult {
  const out: BulkResult = { components: [], tokens: [], errors: [] }
  let data: unknown
  try { data = JSON.parse(text) } catch (e) {
    out.errors.push(`JSON 을 읽지 못했어요 — ${(e as Error).message}`)
    return out
  }
  const classify = (list: unknown[], kind: 'auto' | 'component' | 'token', label: string) => list.forEach((item, i) => {
    const where = `${label} ${i + 1}번째`
    if (!isObj(item)) { out.errors.push(`${where}: 객체가 아니어서 건너뛰었어요`); return }
    if (kind === 'token' || (kind === 'auto' && isTokenLike(item))) { const t = toToken(item, where, out.errors); if (t) out.tokens.push(t) }
    else { const c = toComponent(item, where, out.errors); if (c) out.components.push(c) }
  })
  if (Array.isArray(data)) classify(data, 'auto', '항목')
  else if (isObj(data) && (Array.isArray(data.components) || Array.isArray(data.tokens))) {
    if (Array.isArray(data.components)) classify(data.components, 'component', '컴포넌트')
    if (Array.isArray(data.tokens)) classify(data.tokens, 'token', '토큰')
    else if (isObj(data.tokens)) walkTree(data.tokens, [], null, out)
  } else if (isObj(data)) walkTree(data, [], null, out)
  else out.errors.push('배열이나 객체 형식이어야 해요')
  return out
}

/** CSV(쉼표) · TSV(탭 — 시트에서 복사) — 따옴표 안의 쉼표 · 줄바꿈도 읽습니다 */
function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

const HEADER: Record<string, string> = {
  name: 'name', 이름: 'name', codename: 'code_name', code: 'code_name', 코드이름: 'code_name', category: 'category', group: 'category', 분류: 'category',
  description: 'description', desc: 'description', 설명: 'description', aliases: 'aliases', alias: 'aliases', matchaliases: 'aliases', 별칭: 'aliases',
  props: 'props', propsschema: 'props', 속성: 'props', type: 'type', 종류: 'type', value: 'value', 값: 'value',
}

function parseCsv(text: string): BulkResult {
  const out: BulkResult = { components: [], tokens: [], errors: [] }
  const first = text.split(/\r?\n/)[0] ?? ''
  const rows = splitRows(text, first.includes('\t') ? '\t' : ',')
  if (rows.length < 2) { out.errors.push('첫 줄은 머리(name, value …), 둘째 줄부터 내용이어야 해요'); return out }
  const head = rows[0]!.map((h) => HEADER[normKey(h)] ?? normKey(h))
  if (!head.includes('name')) { out.errors.push('머리 줄에 name(이름) 칸이 있어야 해요'); return out }
  const isToken = head.includes('value')
  rows.slice(1).forEach((r, i) => {
    const o: Record<string, unknown> = {}
    head.forEach((h, j) => { o[h] = (r[j] ?? '').trim() })
    const where = `${i + 2}번째 줄`
    if (isToken) { const t = toToken(o, where, out.errors); if (t) out.tokens.push(t) }
    else { const c = toComponent(o, where, out.errors); if (c) out.components.push(c) }
  })
  return out
}

export function parseBulk(text: string): BulkResult {
  const t = text.trim()
  if (!t) return { components: [], tokens: [], errors: [] }
  return t.startsWith('{') || t.startsWith('[') ? parseJson(t) : parseCsv(t)
}

export function registerErrorMessage(e: unknown): string {
  const o = (e ?? {}) as { code?: string; message?: string; status?: number }
  if (o.code === '42501' || o.status === 401 || o.status === 403 || /row-level security|permission denied|not authorized|unauthorized/i.test(o.message ?? '')) return '관리자만 등록할 수 있어요'
  if (o.code === '23505') return '같은 이름이 이미 있어요. 이름을 바꿔 주세요'
  return '등록하지 못했어요. 잠시 뒤 다시 시도해 주세요'
}

const SAMPLE = `{
  "components": [
    { "name": "Chip", "code_name": "Chip", "category": "입력", "description": "거르기 · 선택 칩", "aliases": ["chip", "칩"], "props": { "selected": "boolean", "label": "text" } }
  ],
  "tokens": [
    { "type": "color", "name": "brand/secondary-default", "value": "#00C2A8", "description": "보조 강조" },
    { "type": "radius", "name": "radius/08", "value": "20px" }
  ]
}`
</script>

<script setup lang="ts">
import { Button, Icon, IconButton, TextButton, TextInput } from '@ba-dream/design-system'
import { TOKEN_TYPE_LABEL } from '~/composables/useIrisData'

const props = defineProps<{ open: boolean; tab: RegisterTab; prefill?: string; existingNames: string[]; categories: string[] }>()
const emit = defineEmits<{ close: []; saved: [message: string] }>()

const { addComponent, addTokens } = useIrisMutations()
const cur = ref<RegisterTab>('component')
const saving = ref(false)
const error = ref('')
const dialog = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null

const comp = reactive({ name: '', code_name: '', category: '', description: '', aliases: '', props: '' })
const tok = reactive({ type: 'color' as TokenType, name: '', value: '', description: '' })
const bulk = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const tabs = [
  { key: 'component', label: '컴포넌트' },
  { key: 'token', label: '토큰' },
  { key: 'bulk', label: '한꺼번에 가져오기' },
] as const

const existing = computed(() => new Set(props.existingNames.map((n) => n.toLowerCase())))
const parsed = computed(() => {
  const r = parseBulk(bulk.value)
  const seen = new Set<string>()
  const skipped: string[] = []
  const components = r.components.filter((c) => {
    const k = c.name.toLowerCase()
    if (existing.value.has(k) || seen.has(k)) { skipped.push(c.name); return false }
    seen.add(k)
    return true
  })
  // 같은 이름 토큰은 마지막 값으로 (등록하면 같은 이름은 값을 덮어씁니다)
  const tokens = [...new Map(r.tokens.map((x) => [x.name, x])).values()]
  return { components, tokens, errors: r.errors, skipped }
})
const bulkCount = computed(() => parsed.value.components.length + parsed.value.tokens.length)
const preview = computed(() => [
  ...parsed.value.components.map((c) => ({ key: 'c' + c.name, kind: '컴포넌트', name: c.name, meta: c.category, swatch: null as string | null })),
  ...parsed.value.tokens.map((t) => ({ key: 't' + t.name, kind: TOKEN_TYPE_LABEL[t.type], name: t.name, meta: t.value, swatch: t.type === 'color' ? t.value : null })),
])

const compDup = computed(() => !!comp.name.trim() && existing.value.has(comp.name.trim().toLowerCase()))
const canSave = computed(() => {
  if (cur.value === 'component') return !!comp.name.trim() && !compDup.value
  if (cur.value === 'token') return !!tok.name.trim() && !!tok.value.trim()
  return bulkCount.value > 0
})
const saveLabel = computed(() => (cur.value === 'bulk' && bulkCount.value ? `${bulkCount.value}개 등록` : '등록'))

watch(() => props.open, async (open) => {
  if (!open) { lastFocus?.focus?.(); return }
  lastFocus = (document.activeElement as HTMLElement) ?? null
  cur.value = props.tab
  error.value = ''
  saving.value = false
  Object.assign(comp, { name: props.prefill ?? '', code_name: '', category: '', description: '', aliases: '', props: '' })
  Object.assign(tok, { type: 'color', name: '', value: '', description: '' })
  bulk.value = ''
  await focusFirst()
})

/** 첫 칸에 포커스 — data-first 가 컴포넌트 바깥 요소에 붙어 있으면 그 안의 입력칸으로 */
async function focusFirst() {
  await nextTick()
  const el = dialog.value?.querySelector<HTMLElement>('[data-first]')
  const target = el && !el.matches('input, textarea, button') ? el.querySelector<HTMLElement>('input, textarea') : el
  target?.focus()
}
/** TextInput 공통 — 왼쪽 · 오른쪽 아이콘, 버튼, 아래 문구는 끕니다 */
const TI = { size: 's', showLeftIcon: false, showRightIcon: false, showButton: false, showSupportingText: false } as const
watch(cur, () => { error.value = ''; if (props.open) focusFirst() })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close'); return }
  if (e.key !== 'Tab' || !dialog.value) return
  const els = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type="file"]), textarea, select, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
  if (!els.length) return
  const first = els[0]!, last = els[els.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

/** 한 줄 칸에서 Enter 로 등록(예전 submit 버튼과 같은 동작) */
function onEnter(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.isComposing || t.tagName !== 'INPUT') return
  e.preventDefault()
  save()
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  bulk.value = await f.text()
  ;(e.target as HTMLInputElement).value = ''
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    if (cur.value === 'component') {
      await addComponent({
        name: comp.name.trim(),
        code_name: comp.code_name.trim() || null,
        category: comp.category.trim() || '기타',
        description: comp.description.trim() || null,
        match_aliases: aliases(comp.aliases),
        props_schema: parseProps(comp.props),
      })
      emit('saved', `${comp.name.trim()} 컴포넌트를 등록했어요`)
    } else if (cur.value === 'token') {
      await addTokens([{ type: tok.type, name: tok.name.trim(), value: tok.value.trim(), description: tok.description.trim() || null }])
      emit('saved', `${tok.name.trim()} 토큰을 등록했어요`)
    } else {
      const { components, tokens } = parsed.value
      let done = 0
      for (const c of components) { await addComponent(c); done++ }
      if (tokens.length) await addTokens(tokens)
      emit('saved', `컴포넌트 ${done}개 · 토큰 ${tokens.length}개를 등록했어요`)
    }
  } catch (e) {
    error.value = registerErrorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @mousedown.self="emit('close')">
      <div ref="dialog" class="sq float dialog" role="dialog" aria-modal="true" aria-labelledby="ds-reg-title" @keydown="onKey">
        <div class="top">
          <h2 id="ds-reg-title" class="tx-title">디자인 시스템에 등록</h2>
          <IconButton icon-name="close" size="s" type="ghost" ariaLabel="닫기" @click="emit('close')" />
        </div>
        <div class="seg tabs" role="tablist" aria-label="등록 방법">
          <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="cur === t.key" :class="['sq', 'seg-item', { on: cur === t.key }]" @click="cur = t.key">{{ t.label }}</button>
        </div>

        <form class="body" @submit.prevent="save" @keydown.enter="onEnter">
          <template v-if="cur === 'component'">
            <TextInput
              v-model:value="comp.name"
              v-bind="TI"
              data-first
              label="이름"
              essential
              placeholder="예: Button"
              :destructed="compDup"
              :show-supporting-text="compDup"
              supporting-text="이미 있는 이름이에요"
              supporting-theme="destructed"
              :input-props="{ id: 'ds-c-name', required: true, 'aria-invalid': compDup }"
              :label-props="{ htmlFor: 'ds-c-name' }"
            />
            <div class="two">
              <TextInput v-model:value="comp.code_name" v-bind="TI" label="코드 이름" placeholder="예: Button" :input-props="{ id: 'ds-c-code' }" :label-props="{ htmlFor: 'ds-c-code' }" />
              <TextInput v-model:value="comp.category" v-bind="TI" label="분류" placeholder="예: 입력" :input-props="{ id: 'ds-c-cat', list: 'ds-cat-list' }" :label-props="{ htmlFor: 'ds-c-cat' }" />
              <datalist id="ds-cat-list"><option v-for="c in categories" :key="c" :value="c" /></datalist>
            </div>
            <TextInput v-model:value="comp.description" v-bind="TI" label="설명" placeholder="언제 쓰는지 한 줄로 적어 주세요" :input-props="{ id: 'ds-c-desc' }" :label-props="{ htmlFor: 'ds-c-desc' }" />
            <TextInput
              v-model:value="comp.aliases"
              v-bind="TI"
              label="매칭 별칭"
              placeholder="예: btn, 버튼 (쉼표로 나눠요)"
              show-supporting-text
              supporting-text="피그마 레이어 이름이 별칭과 같으면 이 컴포넌트로 셉니다"
              :input-props="{ id: 'ds-c-alias' }"
              :label-props="{ htmlFor: 'ds-c-alias' }"
            />
            <div class="row">
              <label for="ds-c-props" class="tx-head">속성</label>
              <textarea id="ds-c-props" v-model="comp.props" rows="3" class="area tx-code" placeholder="type: primary, secondary&#10;label: text&#10;disabled: boolean" />
            </div>
          </template>

          <template v-else-if="cur === 'token'">
            <div class="row">
              <span id="ds-tok-type" class="tx-head">종류</span>
              <div class="seg types" role="radiogroup" aria-labelledby="ds-tok-type">
                <button v-for="t in Object.keys(TOKEN_TYPE_LABEL) as TokenType[]" :key="t" type="button" role="radio" :aria-checked="tok.type === t" :class="['sq', 'seg-item', { on: tok.type === t }]" @click="tok.type = t">{{ TOKEN_TYPE_LABEL[t] }}</button>
              </div>
            </div>
            <TextInput v-model:value="tok.name" v-bind="TI" data-first label="이름" essential placeholder="예: brand/primary-default" :input-props="{ id: 'ds-t-name', required: true }" :label-props="{ htmlFor: 'ds-t-name' }" />
            <div class="val">
              <TextInput
                v-model:value="tok.value"
                v-bind="TI"
                label="값"
                essential
                :placeholder="{ color: '#2C7BE2', typography: '16 / 24 · 500', spacing: '16px', radius: '12px', shadow: '0 1px 2px rgb(3 9 26 / 8%)' }[tok.type]"
                :input-props="{ id: 'ds-t-value', required: true }"
                :label-props="{ htmlFor: 'ds-t-value' }"
              />
              <span v-if="tok.type === 'color' && tok.value" class="sw val-sw" :style="{ background: tok.value }" aria-hidden="true" />
            </div>
            <TextInput v-model:value="tok.description" v-bind="TI" label="설명" placeholder="어디에 쓰는지 적어 주세요" :input-props="{ id: 'ds-t-desc' }" :label-props="{ htmlFor: 'ds-t-desc' }" />
          </template>

          <template v-else>
            <div class="row">
              <div class="bulk-h">
                <label for="ds-bulk" class="tx-head">CSV 또는 JSON 붙여넣기</label>
                <span class="bulk-act">
                  <TextButton size="s" color="gray" @click="bulk = SAMPLE">예시 넣기</TextButton>
                  <Button size="s" type="tertiary" stroke contents="icon-text" icon-name="upload" @click="fileInput?.click()">파일 고르기</Button>
                  <input ref="fileInput" type="file" accept=".csv,.tsv,.json,.txt,text/csv,application/json" class="sr" tabindex="-1" aria-hidden="true" @change="onFile">
                </span>
              </div>
              <textarea id="ds-bulk" v-model="bulk" data-first rows="8" class="area tx-code" spellcheck="false" placeholder="name,code_name,category,description,aliases&#10;Button,Button,입력,주요 동작 버튼,btn|버튼" />
              <details class="help">
                <summary class="tx-meta">받는 형식 보기</summary>
                <ul class="tx-meta">
                  <li>CSV · 시트에서 복사한 표(탭): 첫 줄은 머리. <code class="tx-code">value</code> 칸이 있으면 토큰(type, name, value, description), 없으면 컴포넌트(name, code_name, category, description, aliases, props)로 읽어요. 별칭은 <code class="tx-code">|</code>, 속성은 <code class="tx-code">type:primary|secondary; disabled:boolean</code> 처럼 적어요.</li>
                  <li>JSON: <code class="tx-code">{ "components": [...], "tokens": [...] }</code>, 객체 배열(<code class="tx-code">value</code> 가 있으면 토큰), 또는 토큰 트리(<code class="tx-code">{ "color": { "brand": { "$value": "#2C7BE2" } } }</code>, 이름은 경로를 / 로 이어요).</li>
                  <li>토큰 종류: color · typography · spacing · radius · shadow (비우면 이름 · 값으로 짐작해요). 같은 이름 토큰은 값을 덮어쓰고, 이미 있는 컴포넌트 이름은 건너뛰어요.</li>
                </ul>
              </details>
            </div>
            <div v-if="bulk.trim()" class="sq result" aria-live="polite">
              <span class="tx-head">컴포넌트 {{ parsed.components.length }}개 · 토큰 {{ parsed.tokens.length }}개를 찾았어요</span>
              <ul v-if="preview.length" class="plist">
                <li v-for="p in preview.slice(0, 8)" :key="p.key" class="prow">
                  <span class="tx-meta kind">{{ p.kind }}</span>
                  <span v-if="p.swatch" class="sw" :style="{ background: p.swatch }" aria-hidden="true" />
                  <span class="tx-body pname" :title="p.name">{{ p.name }}</span>
                  <span class="tx-meta pmeta num" :title="p.meta">{{ p.meta }}</span>
                </li>
                <li v-if="preview.length > 8" class="tx-meta">외 {{ preview.length - 8 }}개</li>
              </ul>
              <p v-if="parsed.skipped.length" class="tx-meta">이미 있는 이름이라 건너뛰어요: {{ parsed.skipped.join(', ') }}</p>
              <ul v-if="parsed.errors.length" class="errs">
                <li v-for="(er, i) in parsed.errors.slice(0, 5)" :key="i" class="tx-meta warn"><Icon name="warning" :size="12" /> {{ er }}</li>
                <li v-if="parsed.errors.length > 5" class="tx-meta warn">외 {{ parsed.errors.length - 5 }}건</li>
              </ul>
            </div>
          </template>

          <p v-if="error" class="tx-body warn err" role="alert"><Icon name="warning" :size="14" /> {{ error }}</p>
          <div class="foot">
            <Button size="m" type="tertiary" class="grow1" @click="emit('close')">취소</Button>
            <Button size="m" type="primary" class="grow2" :loading="saving" :disabled="!canSave" @click="save">{{ saveLabel }}</Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: var(--ref-spacing-10); background: var(--dimmed-bg); font-size: 12px; line-height: 18px; }
.dialog { width: 480px; max-width: 100%; max-height: calc(100vh - 64px); display: flex; flex-direction: column; overflow: hidden; }
.top { display: flex; align-items: center; justify-content: space-between; padding: var(--ref-spacing-10) var(--ref-spacing-08) 0 var(--ref-spacing-12); }
.tabs { padding: var(--ref-spacing-06) var(--ref-spacing-12) 0 var(--ref-spacing-10); }
.body { display: flex; flex-direction: column; gap: var(--ref-spacing-08); padding: var(--ref-spacing-10) var(--ref-spacing-12) var(--ref-spacing-12); overflow: auto; min-height: 0; }
.row { display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
/* 입력 라벨은 DS Label 과 같게: 12/18 SemiBold neutral/700, 칸과 2px */
.row > .tx-head:first-child, .bulk-h > .tx-head { color: var(--sys-color-neutral-700); }
.row > .help { margin-top: var(--ref-spacing-02); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ref-spacing-06); }
.area { display: block; width: 100%; box-sizing: border-box; min-height: 66px; resize: vertical; padding: var(--ref-spacing-05) var(--ref-spacing-07); border: 0; outline: 0; border-radius: var(--ref-radius-05); background: var(--sys-color-common-white-default); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); color: var(--sys-color-neutral-800); transition: box-shadow .12s ease; }
.area:hover { box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-20); }
.area:focus { box-shadow: inset 0 0 0 1px var(--sys-color-brand-primary-default); }
.area::placeholder { color: var(--sys-color-neutral-500); }
.val { position: relative; }
.val-sw { position: absolute; right: var(--ref-spacing-08); bottom: 9px; width: 12px; height: 12px; }
.val :deep(input) { padding-right: var(--ref-spacing-10); }
.types { flex-wrap: wrap; margin-left: calc(-1 * var(--ref-spacing-06)); }
.sw { width: 14px; height: 14px; border-radius: var(--ref-radius-02); box-shadow: inset 0 0 0 0.5px var(--ref-color-gray-900-20); }
.bulk-h { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
.bulk-act { display: flex; align-items: center; gap: var(--ref-spacing-08); }
.help summary { cursor: pointer; width: max-content; border-radius: var(--ref-radius-02); transition: color .12s ease; }
.help summary:hover { color: var(--sys-color-neutral-800); }
.help summary:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
.help ul { margin: var(--ref-spacing-04) 0 0; padding-left: var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.help code { padding: 0 var(--ref-spacing-02); border-radius: var(--ref-radius-02); background: var(--sys-color-neutral-100); }
.result { display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-07) var(--ref-spacing-08); border-radius: var(--ref-radius-05); --sq-fill: var(--sys-color-neutral-100); }
.plist, .errs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-02); }
.prow { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; }
.kind { flex: none; width: 52px; }
.pname { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pmeta { margin-left: auto; flex: none; max-width: 45%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result p { margin: 0; }
.warn { color: var(--sys-color-theme-destructed-default); display: flex; align-items: center; gap: var(--ref-spacing-02); }
.err { margin: 0; }
.foot { display: flex; gap: var(--ref-spacing-06); padding-top: var(--ref-spacing-04); }
.grow1 { flex: 1; }
.grow2 { flex: 2.25; }
</style>
