<script setup lang="ts">
import type { LayerStyle, Paint } from '~/canvas/schema'
import { descendants } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { alphaOf, hexOf, normHex, withAlpha } from '~/canvas/color'
import { parseColor, useTokenCatalog, type CatalogToken } from '~/canvas/tokens'
import ColorField from '~/components/editor/ColorField.vue'
import TokenPicker from '~/components/editor/TokenPicker.vue'

/**
 * Selection colors(피그마와 같아요): 고른 레이어 · 프레임과 그 안에 쓰인 색을 모아 보여 주고, 여기서 고치면 그 색을 쓰는 곳이 모두 바뀌어요.
 * - 토큰이 연결된 색은 토큰 박스로(바꾸면 모두 다른 토큰으로 · 풀기), 아니면 색 값 + 투명도
 * - 칠 · 선 · 글자 색, 덧붙인 칠 · 선, 그라디언트 지점, 그림자 색을 모두 봐요
 * targets: 화면마다 고른 레이어(ids 가 비면 그 화면 프레임 전체 — 프레임 모양 + 모든 레이어)
 * lazy: 처음엔 'Show selection colors' 버튼만(프레임처럼 색이 많을 때 — 피그마와 같아요)
 */
const props = defineProps<{ targets: { sid: string; ids: string[] }[]; lazy?: boolean }>()
const store = useLayerStore()
const catalog = useTokenCatalog()

const shown = ref(!props.lazy)
const all = ref(false)
watch(() => JSON.stringify(props.targets), () => { shown.value = !props.lazy; all.value = false })
const LIMIT = 10

/** 색 하나를 가리키는 열쇠: 토큰이면 토큰, 아니면 #RRGGBBAA */
const keyOf = (color: string | undefined, token?: string | null) => {
  if (token) return 'tok:' + token
  const p = parseColor(store.color(color) ?? color)
  return p ? 'hex:' + (p.a < 1 ? withAlpha(p.hex, p.a) : p.hex) : null
}
type Hit = { key: string; color: string; token?: string }
/** 모양 하나에서 색 모으기 */
function colorsOf(s: LayerStyle, out: Hit[]) {
  const vars = s.vars as Record<string, string> | undefined
  const push = (color: string | undefined, token?: string) => {
    const k = keyOf(color, token)
    if (k && color) out.push({ key: k, color: store.color(color) ?? color, token })
  }
  for (const k of ['fill', 'stroke', 'color'] as const) if (s[k]) push(s[k], vars?.[k])
  for (const p of [...(s.fills ?? []), ...(s.strokes ?? [])] as Paint[]) {
    if (p.type === 'solid') push(p.opacity !== undefined && p.opacity < 1 ? withAlpha(hexOf(p.color), p.opacity * alphaOf(p.color)) : p.color, p.token)
    else if (p.type !== 'image') for (const st of p.stops) push(st.color, st.token)
  }
  for (const e of s.effects ?? []) if (e.type === 'drop' || e.type === 'inner') push(e.color, e.token)
}
/** 고른 것들(과 그 안)의 모양 — 화면마다 [프레임 모양?, 레이어 id 들] */
const scopes = computed(() => props.targets.map(({ sid, ids }) => {
  const d = store.doc(sid)
  const layerIds = ids.length ? [...new Set(ids.flatMap((id) => descendants(d, id)))] : Object.keys(d.nodes)
  return { sid, frame: !ids.length, layerIds }
}))
const rows = computed(() => {
  if (!shown.value) return []
  const hits: Hit[] = []
  for (const sc of scopes.value) {
    const d = store.doc(sc.sid)
    if (sc.frame && d.frame) colorsOf(d.frame, hits)
    for (const id of sc.layerIds) { const n = d.nodes[id]; if (n && !n.hidden) colorsOf(n.style, hits) }
  }
  const seen = new Map<string, Hit & { n: number }>()
  for (const h of hits) { const r = seen.get(h.key); if (r) r.n++; else seen.set(h.key, { ...h, n: 1 }) }
  return [...seen.values()]
})
const visible = computed(() => (all.value ? rows.value : rows.value.slice(0, LIMIT)))
const label = (r: Hit) => (r.token ? catalog.find(r.token)?.name ?? r.token : hexOf(r.color).slice(1))

// --- 바꾸기: 열쇠가 같은 곳을 모두 ---
/** 모양 하나에서 key 인 색을 color(토큰이면 token)로. 바뀐 게 없으면 null */
function recolor(s: LayerStyle, key: string, color: string, token: string | null | undefined): LayerStyle | null {
  let changed = false
  const next: LayerStyle = { ...s }
  const vars: Record<string, string> = { ...(s.vars as Record<string, string> | undefined) }
  // token: undefined = 토큰 그대로 두고 값만(같은 토큰 · 풀기 없음) — 색을 직접 고치면 null(연결 풀기)
  const tokOut = (cur?: string) => (token === undefined ? cur : token ?? undefined)
  for (const k of ['fill', 'stroke', 'color'] as const) {
    if (!s[k] || keyOf(s[k], vars[k]) !== key) continue
    next[k] = color
    const t = tokOut(vars[k])
    if (t) vars[k] = t; else delete vars[k]
    changed = true
  }
  const paints = (list?: Paint[]) => list?.map((p): Paint => {
    if (p.type === 'solid') {
      const cur = p.opacity !== undefined && p.opacity < 1 ? withAlpha(hexOf(p.color), p.opacity * alphaOf(p.color)) : p.color
      if (keyOf(cur, p.token) !== key) return p
      changed = true
      const { token: _t, ...rest } = p
      const t = tokOut(p.token)
      return { ...rest, color: hexOf(color), opacity: alphaOf(color) < 1 ? alphaOf(color) : undefined, ...(t ? { token: t } : {}) }
    }
    if (p.type === 'image') return p
    return { ...p, stops: p.stops.map((st) => { if (keyOf(st.color, st.token) !== key) return st; changed = true; const t = tokOut(st.token); return t ? { pos: st.pos, color, token: t } : { pos: st.pos, color } }) }
  })
  if (s.fills) next.fills = paints(s.fills)
  if (s.strokes) next.strokes = paints(s.strokes)
  if (s.effects) next.effects = s.effects.map((e) => {
    if ((e.type !== 'drop' && e.type !== 'inner') || keyOf(e.color, e.token) !== key) return e
    changed = true
    const t = tokOut(e.token)
    const { token: _t, ...rest } = e
    return t ? { ...rest, color, token: t } : { ...rest, color }
  })
  if (!changed) return null
  // undefined 도 키로 남겨요 — 프레임 모양(frameStyle)은 undefined 인 키를 지워요
  next.vars = Object.keys(vars).length ? vars : undefined
  return next
}
function apply(key: string, color: string, token: string | null | undefined) {
  store.batch(() => {
    for (const sc of scopes.value) {
      const d = store.doc(sc.sid)
      if (sc.frame && d.frame) {
        const nf = recolor(d.frame, key, color, token)
        if (nf) store.frameStyle(sc.sid, nf)
      }
      const hit = sc.layerIds.filter((id) => { const n = d.nodes[id]; return !!n && !!recolor(n.style, key, color, token) })
      if (hit.length) store.update(sc.sid, hit, (n) => ({ style: recolor(n.style, key, color, token) ?? n.style }))
    }
  })
}
/** 색 판 · hex · 투명도: 값만(토큰 연결은 풀려요) */
const setColor = (i: number, v: string) => { const r = visible.value[i]; if (r) apply(r.key, v, null) }
function onHex(i: number, e: Event) {
  const r = visible.value[i]
  const input = e.target as HTMLInputElement
  const v = normHex(input.value)
  if (!r || !v) { if (r) input.value = hexOf(r.color).slice(1); return }
  setColor(i, v.length > 7 ? v : withAlpha(v, alphaOf(r.color)))
}
function onAlpha(i: number, e: Event) {
  const r = visible.value[i]
  const a = Number((e.target as HTMLInputElement).value.replace('%', ''))
  if (r && Number.isFinite(a)) setColor(i, withAlpha(hexOf(r.color), Math.min(100, Math.max(0, a)) / 100))
}
/** 토큰 고르기: 모두 그 토큰으로 연결 */
const bind = (i: number, t: CatalogToken) => { const r = visible.value[i]; if (r && t.color) apply(r.key, t.color, t.id) }
/** 토큰 풀기: 색 값은 그대로 */
const unbind = (i: number) => { const r = visible.value[i]; if (r) apply(r.key, r.color, null) }
const sids = computed(() => props.targets.map((t) => t.sid))
const blur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }
const sel = (e: FocusEvent) => (e.target as HTMLInputElement).select()
</script>

<template>
  <section v-if="!shown || rows.length" class="s">
    <div class="sec-h h24"><span>{{ tr('Selection colors') }}</span></div>
    <button v-if="!shown" type="button" class="sq show" @click="shown = true">{{ tr('Show selection colors') }}</button>
    <template v-else>
      <!-- 피그마 Selection colors 행: [견본 + 이름(토큰) · 색 값 | 투명도] -->
      <div v-for="(r, i) in visible" :key="i" class="srow">
        <div :class="['sq', 'fld', 'pf', { bound: !!r.token }]">
          <ColorField :model-value="r.color" :sid="sids[0]" :sids="sids" bindable label="Selection color" @update:model-value="(v) => setColor(i, v)" @token="(t) => bind(i, t)" />
          <TokenPicker v-if="r.token" :kinds="['color']" :bound="r.token" label="Selection color" @pick="(t) => bind(i, t)" @unbind="unbind(i)" />
          <template v-else>
            <input :key="'h' + r.key" class="hex" :value="label(r)" :aria-label="tr('Selection color hex')" spellcheck="false" @change="onHex(i, $event)" @keydown="blur" @focus="sel">
            <TokenPicker :kinds="['color']" reveal label="Selection color" @pick="(t) => bind(i, t)" />
            <span class="vsep" aria-hidden="true" />
            <span class="op"><input :key="'a' + r.key" class="pct" :value="Math.round(alphaOf(r.color) * 100)" inputmode="numeric" :aria-label="tr('Selection color opacity')" @change="onAlpha(i, $event)" @keydown="blur" @focus="sel"><i class="unit">%</i></span>
          </template>
        </div>
      </div>
      <button v-if="rows.length > LIMIT" type="button" class="more" @click="all = !all">{{ all ? tr('Show fewer') : tr('See all {n} colors', { n: rows.length }) }}</button>
    </template>
  </section>
</template>

<style scoped>
.s { padding: var(--ref-spacing-08) var(--ref-spacing-10) var(--ref-spacing-10); display: flex; flex-direction: column; gap: var(--ref-spacing-06); box-shadow: 0 -1px 0 var(--iris-line); }
.h24 { height: 24px; padding: 0; }
/* Fill 행과 같은 칸, 오른쪽 아이콘 자리(24 + 24 + 8)만큼 비워 같은 폭으로 */
.srow { display: grid; grid-template-columns: minmax(0, 1fr) 56px; align-items: center; min-width: 0; }
.pf { gap: var(--ref-spacing-06); padding: 0 0 0 var(--ref-spacing-06); min-width: 0; }
.pf.bound { padding-right: var(--ref-spacing-06); }
.pf:has(input:focus) { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.hex { flex: 1; min-width: 0; padding: 0; text-transform: uppercase; }
.vsep { width: 1px; align-self: stretch; margin: 1px 0; background: var(--sys-color-common-white-emphasis); flex: none; }
.op { flex: none; width: 48px; height: 100%; box-sizing: border-box; margin-left: calc(-1 * var(--ref-spacing-06)); padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-05); display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.op .pct { flex: 1; width: auto; min-width: 0; padding: 0; text-align: right; }
.op .unit { flex: none; font-style: normal; color: var(--sys-color-neutral-500); }
/* 'Show selection colors': 흰 바탕 + 테두리 버튼(피그마와 같아요) */
.show { align-self: flex-start; height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--iris-field-r); font-size: 12px; color: var(--sys-color-neutral-800); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-line-strong); --sq-line-w: 1px; }
.show:hover { --sq-line: var(--ref-color-gray-900-20); }
.more { align-self: flex-start; padding: 0; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-500); }
.more:hover { color: var(--sys-color-neutral-800); }
</style>
