<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { KIND_LABEL, groupLabel, useTokenCatalog, type CatalogToken, type TokenKind } from '~/canvas/tokens'

/**
 * 변수(토큰) 화면 — 좌측 패널 맨 아래 'Variables' 로 열어요. 캔버스 대신 이 화면이 편집기 전체를 덮어요(피그마 Local variables 처럼, 다른 페이지).
 * 머리 48: ‹ · Variables · 개수(닫기는 ‹ · Esc) / 왼쪽 240: 맨 위 검색 → 종류(전체 · 색 · 텍스트 스타일 · 간격 · 모서리 …)와 개수 / 오른쪽: 묶음별 표(이름 · 값 · CSS 변수). CSS 변수 칸을 누르면 복사.
 * 값은 디자인 시스템 CSS(:root)에서 읽은 것 그대로 — 여기서는 보기 · 찾기 · 복사만(고치기는 디자인 시스템에서)
 */
const emit = defineEmits<{ close: [] }>()
const { all } = useTokenCatalog()

// 왼쪽 종류 목록(영어 원문 — 그릴 때 tr). 텍스트 스타일 · 색이 위
const ORDER: TokenKind[] = ['color', 'textStyle', 'spacing', 'radius', 'borderWidth', 'opacity', 'shadow', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']
const visible = computed(() => all.value.filter((t) => !t.hidden))
const kinds = computed(() => ORDER.map((k) => ({ k, n: visible.value.filter((t) => t.kind === k).length })).filter((x) => x.n))
const kind = ref<TokenKind | 'all'>('all')
const q = ref('')
const qEl = ref<HTMLInputElement | null>(null)

const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  return visible.value.filter((t) => (kind.value === 'all' || t.kind === kind.value) && (!s || [t.name, t.value, t.id, groupLabel(t.group)].some((v) => v?.toLowerCase().includes(s))))
})
/** 묶음(group)별로 — 묶음 순서는 목록에 처음 나온 순서 그대로 */
const groups = computed(() => {
  const m = new Map<string, CatalogToken[]>()
  for (const t of rows.value) m.set(t.group, [...(m.get(t.group) ?? []), t])
  return [...m].map(([g, items]) => ({ g, items }))
})

const copied = ref<string | null>(null)
async function copy(t: CatalogToken) {
  const v = t.id.startsWith('--') ? t.id : t.kind === 'textStyle' ? t.refs?.fontSize : undefined
  const text = v ? `var(${v})` : t.name
  try { await navigator.clipboard.writeText(text); copied.value = t.id; setTimeout(() => { if (copied.value === t.id) copied.value = null }, 1200) } catch { /* 복사 못 해도 그대로 */ }
}
/** CSS 변수 칸: 변수는 이름 그대로, 텍스트 스타일은 크기 변수(--typography-…-size), 등록한 토큰은 '등록한 토큰' */
const cssName = (t: CatalogToken) => (t.id.startsWith('--') ? t.id : t.kind === 'textStyle' ? t.refs?.fontSize ?? '—' : tr('Registered'))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); if (q.value) q.value = ''; else emit('close') }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); qEl.value?.focus() }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <section class="vars" role="dialog" :aria-label="tr('Variables')">
    <header class="vh">
      <button type="button" class="sq ib back" :aria-label="tr('Back to canvas')" :data-tip="tr('Back to canvas')" @click="emit('close')"><EditorIcon name="chevron_right" :size="16" class="flip" /></button>
      <EditorIcon name="variable" :size="20" class="ttl-ic" />
      <h2 class="ttl">{{ tr('Variables') }}</h2>
      <span class="tx-meta num">{{ visible.length }}</span>
    </header>

    <div class="vb">
      <nav class="side" :aria-label="tr('Variable types')">
        <label class="sq field vq">
          <EditorIcon name="search" :size="16" />
          <input ref="qEl" v-model="q" type="search" :placeholder="tr('Search variables')" :aria-label="tr('Search variables')">
        </label>
        <button type="button" :class="['sq', 'kind', { on: kind === 'all' }]" @click="kind = 'all'"><span class="f1">{{ tr('All variables') }}</span><span class="tx-meta num">{{ visible.length }}</span></button>
        <div class="sep" />
        <button v-for="x in kinds" :key="x.k" type="button" :class="['sq', 'kind', { on: kind === x.k }]" @click="kind = x.k"><span class="f1">{{ tr(KIND_LABEL[x.k]) }}</span><span class="tx-meta num">{{ x.n }}</span></button>
      </nav>

      <div class="main">
        <div class="thead">
          <span>{{ tr('Name') }}</span><span>{{ tr('Value') }}</span><span>{{ tr('CSS variable') }}</span>
        </div>
        <div class="tbody">
          <template v-for="g in groups" :key="g.g">
            <div class="vgrp"><span>{{ groupLabel(g.g) }}</span><span class="num">{{ g.items.length }}</span></div>
            <div v-for="t in g.items" :key="t.id" class="row">
              <span class="nm">
                <span v-if="t.kind === 'color'" class="sqc sw" :style="{ background: t.color }" aria-hidden="true" />
                <span v-else-if="t.kind === 'textStyle'" class="ag" aria-hidden="true">Ag</span>
                <EditorIcon v-else name="variable" :size="16" class="vi" />
                <span class="ell">{{ t.name }}</span>
              </span>
              <span class="val ell num" :title="t.value">{{ t.value }}</span>
              <button type="button" class="sq css" :title="tr('Copy')" @click="copy(t)"><span class="ell">{{ cssName(t) }}</span><EditorIcon :name="copied === t.id ? 'check' : 'copy'" :size="12" /></button>
            </div>
          </template>
          <div v-if="!groups.length" class="empty tx-meta">{{ q ? tr('No variables match “{q}”', { q }) : tr('No variables yet') }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 편집기 전체를 덮는 흰 면(탭 막대 아래) — 머리 48 · 왼쪽 종류 240 · 오른쪽 표(행 36) */
.vars { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.vh { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-04); height: 48px; padding: 0 var(--ref-spacing-06); box-shadow: 0 1px 0 var(--iris-line); }
.ib { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-700); }
.ib:hover { --sq-fill: var(--sys-color-neutral-100); }
.flip { transform: scaleX(-1); }
.ttl-ic { color: var(--sys-color-neutral-600); margin-left: var(--ref-spacing-02); }
.ttl { margin: 0; font-size: 14px; line-height: 22px; font-weight: 600; }
.vq { flex: none; margin-bottom: var(--ref-spacing-04); height: 28px; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04); color: var(--sys-color-neutral-500); }
.vq input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; color: var(--sys-color-neutral-800); -webkit-appearance: none; appearance: none; }
.vq input::-webkit-search-cancel-button { display: none; }
.vb { flex: 1; min-height: 0; display: flex; }
/* 왼쪽 목록 안쪽 8 — 머리 줄 ‹ · 탭 막대 홈 버튼과 같은 왼쪽 선(8) */
.side { flex: none; width: 240px; box-sizing: border-box; padding: var(--ref-spacing-06); display: flex; flex-direction: column; gap: 1px; overflow: auto; border-right: 1px solid var(--iris-line); }
.kind { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-03); text-align: left; color: var(--sys-color-neutral-800); }
.kind:hover { --sq-fill: var(--sys-color-neutral-100); }
.kind.on { --sq-fill: var(--iris-sel); font-weight: 600; }
.sep { height: 1px; margin: var(--ref-spacing-04) 0; background: var(--iris-line); }
.f1 { flex: 1; min-width: 0; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.thead, .row { display: grid; grid-template-columns: minmax(200px, 1.4fr) minmax(120px, 1fr) minmax(180px, 1fr); gap: var(--ref-spacing-08); align-items: center; padding: 0 var(--ref-spacing-12); }
.thead { flex: none; height: 32px; color: var(--sys-color-neutral-500); box-shadow: 0 1px 0 var(--iris-line); }
.tbody { flex: 1; min-height: 0; overflow: auto; padding-bottom: var(--ref-spacing-12); }
/* 묶음 제목(.grp 는 앱 공통 이름이라 .vgrp): 위에 붙어 따라오는 줄 · 이름 600 + 개수 neutral-500 */
.vgrp { position: sticky; top: 0; z-index: 1; display: flex; align-items: baseline; gap: var(--ref-spacing-04); padding: var(--ref-spacing-08) var(--ref-spacing-12) var(--ref-spacing-04); background: var(--sys-color-common-white-default); font-weight: 600; }
.vgrp .num { font-weight: 400; color: var(--sys-color-neutral-500); }
.row { height: 36px; }
.row:hover { background: var(--interaction-light-gray-hover); }
.nm { display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; }
.sw { flex: none; width: 16px; height: 16px; border-radius: var(--ref-radius-02); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); }
.ag { flex: none; width: 16px; text-align: center; font-size: 11px; font-weight: 600; color: var(--sys-color-neutral-600); }
.vi { flex: none; color: var(--sys-color-neutral-500); }
.val { color: var(--sys-color-neutral-700); }
.css { display: flex; align-items: center; gap: var(--ref-spacing-04); min-width: 0; height: 24px; padding: 0 var(--ref-spacing-04); margin-left: calc(-1 * var(--ref-spacing-04)); border-radius: var(--ref-radius-02); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--sys-color-neutral-600); justify-self: start; max-width: 100%; }
.css:hover { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.css .eic { flex: none; opacity: 0; }
.row:hover .css .eic, .css:focus-visible .eic { opacity: 1; }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.empty { padding: var(--ref-spacing-14) var(--ref-spacing-12); text-align: center; }
</style>
