<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import icons from 'virtual:iris-ds-icons'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 아이콘 고르기 팝오버(인스턴스 속성의 Icon Name 칸) — 디자인 시스템에 있는 아이콘만 골라요.
 * 팝오버 공통 양식(PRD/07 §18): 폭 240 · 모서리 12 · 머리 40(제목 · 닫기) · 종류 탭(Outlined · Solid) · 검색 28 · 한 줄 4칸 그리드(칸 52: 아이콘 20 + 이름 10)
 * 오른쪽 패널 왼쪽에 떠요(변수 · 색 팝오버와 같은 자리)
 */
const props = defineProps<{ modelValue: string; anchor: HTMLElement | null }>()
const emit = defineEmits<{ 'update:modelValue': [name: string]; close: [] }>()

const CATS = Object.keys(icons).sort((a, b) => (a === 'outlined' ? -1 : b === 'outlined' ? 1 : a.localeCompare(b)))
const cat = ref(CATS.find((c) => icons[c]?.includes(props.modelValue)) ?? CATS[0] ?? 'outlined')
const q = ref('')
const list = computed(() => {
  const s = q.value.trim().toLowerCase().replace(/\s+/g, '_')
  return (icons[cat.value] ?? []).filter((n) => !s || n.includes(s))
})
const catLabel = (c: string) => tr(c.charAt(0).toUpperCase() + c.slice(1))

// 자리: 오른쪽 패널(aside) 왼쪽 8, 위는 칸 높이에 맞추되 화면 안으로
const pos = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const el = ref<HTMLElement | null>(null)
const qEl = ref<HTMLInputElement | null>(null)
function place() {
  const a = props.anchor
  if (!a) return
  const r = a.getBoundingClientRect()
  const panel = a.closest('aside')?.getBoundingClientRect() ?? r
  const h = el.value?.offsetHeight ?? 420
  pos.value = { left: Math.max(8, panel.left - 240 - 8) + 'px', top: Math.max(8, Math.min(window.innerHeight - h - 8, r.top - 8)) + 'px' }
}
function onDown(e: MouseEvent) { if (el.value && !el.value.contains(e.target as Node) && !props.anchor?.contains(e.target as Node)) emit('close') }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); emit('close') } }
onMounted(async () => {
  await nextTick(); place(); qEl.value?.focus()
  document.addEventListener('mousedown', onDown, true); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', place)
})
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place) })
function pick(n: string) { emit('update:modelValue', n); emit('close') }
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="sq float ip editor" role="dialog" :aria-label="tr('Icons')" :style="pos">
      <div class="ip-h">
        <div class="seg ip-tabs" role="tablist">
          <button v-for="c in CATS" :key="c" type="button" role="tab" :aria-selected="cat === c" :class="['sq', 'seg-item', { on: cat === c }]" @click="cat = c">{{ catLabel(c) }}</button>
        </div>
        <button type="button" class="sq ib s24" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
      </div>
      <div class="ip-b">
        <label class="sq fld ip-q">
          <EditorIcon name="search" :size="16" />
          <input ref="qEl" v-model="q" type="search" :placeholder="tr('Search icons')" :aria-label="tr('Search icons')">
        </label>
        <div class="ip-grid" role="listbox" :aria-label="tr('Icons')">
          <button v-for="n in list" :key="n" type="button" role="option" :aria-selected="n === modelValue" :class="['sq', 'ip-cell', { on: n === modelValue }]" :title="n" @click="pick(n)">
            <Icon :name="n" :category="cat as 'outlined'" :size="20" />
            <span class="ip-n">{{ n }}</span>
          </button>
          <p v-if="!list.length" class="ip-empty">{{ tr('No icons match “{q}”', { q }) }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ip { position: fixed; z-index: 70; width: 240px; max-height: min(480px, calc(100vh - 16px)); display: flex; flex-direction: column; border-radius: var(--ref-radius-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.ip-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-04); box-shadow: 0 1px 0 var(--iris-line); }
.ip-tabs { gap: 0; }
.s24 { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); }
.ip-b { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-04); }
.ip-q { flex: none; height: 28px; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04); color: var(--sys-color-neutral-500); }
.ip-q input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; color: var(--sys-color-neutral-800); -webkit-appearance: none; appearance: none; }
.ip-q input::-webkit-search-cancel-button { display: none; }
/* 한 줄 4칸: 칸 52 · 아이콘 20 · 이름 10(…) · 고른 칸은 레이어 선택과 같은 옅은 파랑 */
.ip-grid { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ref-spacing-02); align-content: start; }
.ip-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--ref-spacing-02); height: 52px; min-width: 0; padding: 0 var(--ref-spacing-02); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); }
.ip-cell:hover { --sq-fill: var(--sys-color-neutral-100); }
.ip-cell.on { --sq-fill: var(--iris-sel); }
.ip-n { max-width: 100%; font-size: 10px; line-height: 12px; color: var(--sys-color-neutral-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ip-empty { grid-column: 1 / -1; margin: 0; padding: var(--ref-spacing-10) 0; text-align: center; color: var(--sys-color-neutral-500); }
</style>
