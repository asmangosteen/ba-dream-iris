<script setup lang="ts">
import { nameFromId, useTokenCatalog } from '~/canvas/tokens'
import { Button, Icon, TextButton } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'
import { useLayerStore } from '~/canvas/store'

/** 오른쪽 패널 · 개발 탭: 고른 화면이 쓰는 디자인 시스템 컴포넌트 · 치수 · 코드 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ 'open-asset': [componentId: string]; toast: [text: string]; synced: [] }>()
const store = useLayerStore()
const supabase = useSupabaseClient()
const preview = useDevPreview()

const usages = useUsages('inspector', () => [props.screen.id])
const { components } = useDesignSystem()
const byId = computed(() => new Map((components.data.value ?? []).map((c) => [c.id, c])))

const matched = computed(() =>
  (usages.data.value ?? [])
    .filter((u) => u.component_id && byId.value.has(u.component_id))
    .map((u) => ({ ...u, comp: byId.value.get(u.component_id!)! }))
    .sort((a, b) => b.count - a.count),
)
const unmatched = computed(() => (usages.data.value ?? []).filter((u) => !u.component_id || !byId.value.has(u.component_id)))
const total = computed(() => (usages.data.value ?? []).reduce((n, u) => n + u.count, 0))

const code = computed(() => {
  const names = matched.value.map((m) => m.comp.code_name ?? m.comp.name)
  const lines = [`<!-- ${props.screen.name} · ${Math.round(props.screen.width)}×${Math.round(props.screen.height)} -->`, `<script setup lang="ts">`, `import { ${names.join(', ') || '…'} } from '@ba-dream/design-system'`, `<` + `/script>`]
  return lines.join('\n')
})
// 사용 토큰: Iris 캔버스 화면의 레이어에 연결한 변수(style.vars · 옛 'token:<이름>')와 직접 넣은 색을 모읍니다
const catalog = useTokenCatalog()
const tokenUse = computed(() => {
  if (props.screen.source !== 'native') return { tokens: [], raw: [] as string[] }
  const d = store.doc(props.screen.id)
  const tk = new Map<string, { n: number; value?: string }>()
  const raw = new Map<string, number>()
  const add = (name: string, value?: string) => { const e = tk.get(name); tk.set(name, { n: (e?.n ?? 0) + 1, value: e?.value ?? value }) }
  for (const n of Object.values(d.nodes)) {
    const vars = n.style.vars ?? {}
    for (const [key, id] of Object.entries(vars)) {
      if (!id) continue
      const t = catalog.find(id)
      add(t?.name ?? nameFromId(id), t?.color)
    }
    for (const key of ['fill', 'stroke', 'color'] as const) {
      const v = n.style[key]
      if (!v || vars[key]) continue
      if (v.startsWith('token:')) add(v.slice(6), store.color(v))
      else raw.set(v.toUpperCase(), (raw.get(v.toUpperCase()) ?? 0) + 1)
    }
  }
  return { tokens: [...tk.entries()].map(([name, e]) => ({ name, n: e.n, value: e.value })), raw: [...raw.keys()] }
})

// 피그마 화면 다시 불러오기: 썸네일 · 크기 · 사용 컴포넌트를 새로 받습니다
const syncing = ref(false)
async function resync() {
  if (!props.screen.figma_url || syncing.value) return
  syncing.value = true
  try {
    type Frame = { name: string; width: number; height: number; thumbnailUrl: string | null; components: { name: string; count: number; key: string | null }[] }
    const f = await $fetch<Frame>('/api/figma/frame', { method: 'POST', body: { url: props.screen.figma_url } })
    if (preview) { emit('toast', 'Re-imported from Figma (preview mode, not saved)'); return }
    const { data: cat } = await supabase.from('components').select('id, name, code_name, match_aliases, figma_component_key')
    const byName = new Map<string, string>(), byKey = new Map<string, string>()
    for (const c of (cat ?? []) as { id: string; name: string; code_name: string | null; match_aliases: string[] | null; figma_component_key: string | null }[]) {
      for (const n of [c.name, c.code_name, ...(c.match_aliases ?? [])]) { const k = n?.trim().toLowerCase(); if (k && !byName.has(k)) byName.set(k, c.id) }
      if (c.figma_component_key) byKey.set(c.figma_component_key, c.id)
    }
    const { error: e1 } = await supabase.from('screens').update({ thumbnail_path: f.thumbnailUrl, width: f.width, height: f.height, figma_layer_summary: { components: f.components }, figma_synced_at: new Date().toISOString() }).eq('id', props.screen.id)
    if (e1) throw e1
    await supabase.from('screen_component_usages').delete().eq('screen_id', props.screen.id)
    if (f.components.length) {
      const { error: e2 } = await supabase.from('screen_component_usages').insert(f.components.map((c) => ({ screen_id: props.screen.id, detected_name: c.name, count: c.count, source: 'figma', component_id: (c.key && byKey.get(c.key)) || byName.get(c.name.trim().toLowerCase()) || null })))
      if (e2) throw e2
    }
    await usages.refresh()
    emit('synced')
    emit('toast', 'Re-imported from Figma')
  } catch (e) {
    const msg = (e as { data?: { data?: { message?: string } } }).data?.data?.message
    emit('toast', msg ?? "Couldn't import from Figma. Try again in a moment")
  } finally { syncing.value = false }
}

function openFigma() {
  if (props.screen.figma_url) window.open(props.screen.figma_url, '_blank', 'noopener')
}
async function copy() {
  try { await navigator.clipboard.writeText(code.value); emit('toast', 'Code copied') }
  catch { emit('toast', "Couldn't copy") }
}
</script>

<template>
  <div class="dev">
    <section class="s">
      <div class="sec-h h24"><span>Components</span><span class="meta5 num">{{ total ? `${matched.length} types · ${total} instances` : '' }}</span></div>
      <button v-for="m in matched" :key="m.id" class="sq hov comp" @click="emit('open-asset', m.comp.id)">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="dia"><path d="M6 1l5 5-5 5-5-5z" fill="currentColor" /></svg>
        <span class="col"><span class="cname">{{ m.comp.name }}</span><span class="tx-code">{{ m.comp.code_name ?? m.comp.name }}</span></span>
        <span class="cnt num">×{{ m.count }}</span>
      </button>
      <div v-if="unmatched.length" class="sq info">
        <Icon name="info" :size="12" class="mt3" />
        <span>Not in design system ({{ unmatched.length }}): {{ unmatched.map((u) => u.detected_name).join(', ') }}</span>
      </div>
      <div v-if="usages.status.value === 'success' && !usages.data.value?.length" class="empty-col">
        <span class="tx-meta">{{ screen.source === 'figma' ? 'Re-import from Figma to count components' : 'No components used yet' }}</span>
        <TextButton v-if="screen.figma_url" size="s" color="blue" :disabled="syncing" @click="resync">Re-import from Figma</TextButton>
      </div>
    </section>

    <section v-if="screen.source === 'native'" class="s">
      <div class="sec-h h24"><span>Variables</span></div>
      <div v-for="t in tokenUse.tokens" :key="t.name" class="tok"><span class="sq chip" :style="{ '--sq-fill': t.value ?? 'transparent' }" /><span class="tx-code f1">{{ t.name }}</span><span class="tx-meta num">{{ t.n }}</span></div>
      <div v-if="tokenUse.raw.length" class="sq info">
        <Icon name="warning" :size="12" class="mt3" />
        <span>Colors not from variables ({{ tokenUse.raw.length }}): {{ tokenUse.raw.slice(0, 6).join(', ') }}{{ tokenUse.raw.length > 6 ? ' …' : '' }}</span>
      </div>
      <p v-if="!tokenUse.tokens.length && !tokenUse.raw.length" class="tx-meta m0">No colors or variables used yet</p>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>Properties</span></div>
      <div class="grid2">
        <span class="sq fld"><span>X</span><span class="v num">{{ Math.round(screen.x) }}</span></span>
        <span class="sq fld"><span>Y</span><span class="v num">{{ Math.round(screen.y) }}</span></span>
        <span class="sq fld"><span>W</span><span class="v num">{{ Math.round(screen.width) }}</span></span>
        <span class="sq fld"><span>H</span><span class="v num">{{ Math.round(screen.height) }}</span></span>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>Code</span><button class="ib s24" aria-label="Copy code" title="Copy code" @click="copy"><Icon name="copy" :size="14" /></button></div>
      <pre class="sq tx-code pre">{{ code }}</pre>
    </section>

    <section v-if="screen.figma_url" class="s">
      <div class="sec-h h24"><span>Figma source</span></div>
      <div class="figma-row">
        <TextButton size="s" color="blue" contents="text-icon" icon-name="arrow_up_right" @click="openFigma">Open in Figma</TextButton>
        <Button size="s" type="tertiary" stroke :contents="syncing ? 'text' : 'icon-text'" icon-name="refresh" :loading="syncing" :disabled="syncing" @click="resync">Re-import</Button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dev { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s:first-child { box-shadow: none; }
.h24 { height: 24px; padding: 0; }
.s24 { width: 24px; height: 24px; }
.meta5 { font-weight: 500; color: var(--sys-color-neutral-500); }
.comp { display: flex; align-items: center; gap: var(--ref-spacing-06); margin: 0 calc(-1 * var(--ref-spacing-04)); padding: var(--ref-spacing-04); border-radius: var(--ref-radius-04); text-align: left; }
.dia { flex: none; color: var(--iris-component); }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cname { font-weight: 500; color: var(--iris-component); }
.cnt { font-weight: 600; color: var(--sys-color-neutral-700); }
.info { display: flex; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04) var(--ref-spacing-06); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-700); }
.mt3 { margin-top: 3px; flex: none; }
.m0 { margin: 0; }
.empty-col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ref-spacing-04); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.v { color: var(--sys-color-neutral-800) !important; }
.pre { margin: 0; padding: var(--ref-spacing-06) var(--ref-spacing-08); border-radius: var(--ref-radius-04); --sq-fill: var(--sys-color-neutral-100); white-space: pre-wrap; overflow-wrap: anywhere; }
.tok { display: flex; align-items: center; gap: var(--ref-spacing-06); height: 28px; }
.chip { width: 14px; height: 14px; flex: none; border-radius: var(--ref-radius-02); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.f1 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.figma-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); }
</style>
