<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import icons from 'virtual:iris-ds-icons'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 아이콘 고르기 팝오버(인스턴스 속성의 Icon Name 칸) — 디자인 시스템에 있는 아이콘만 골라요.
 * 팝오버 공통 양식(PRD/07 §18): 폭 240 · 모서리 12 · 머리 40(제목 · 닫기) · 검색 28 · 한 줄 4칸 정사각 그리드(칸마다 옅은 테두리 · 아이콘 20 · 이름은 빼고 툴팁으로)
 * 종류(outlined · solid …)는 나누지 않고 모두 한 목록에 알파벳 순(이름이 겹치지 않아요 — solid 는 '…_solid')
 * 오른쪽 패널 왼쪽에 떠요(변수 · 색 팝오버와 같은 자리)
 */
const props = defineProps<{ modelValue: string; anchor: HTMLElement | null }>()
const emit = defineEmits<{ 'update:modelValue': [name: string]; close: [] }>()

/** 모든 종류의 아이콘을 한 목록으로(이름 → 종류), 알파벳 순 */
const ALL = Object.entries(icons)
  .flatMap(([c, names]) => names.map((n) => ({ n, c: c as 'outlined' })))
  .sort((a, b) => a.n.localeCompare(b.n, 'en'))
const q = ref('')
const list = computed(() => {
  const s = q.value.trim().toLowerCase().replace(/\s+/g, '_')
  return s ? ALL.filter((x) => x.n.includes(s)) : ALL
})

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
  // 검색칸은 눌러야 켜져요(사용자 요청) — 창에 포커스만
  await nextTick(); place(); el.value?.focus({ preventScroll: true })
  document.addEventListener('mousedown', onDown, true); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', place)
})
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place) })
function pick(n: string) { emit('update:modelValue', n); emit('close') }
</script>

<template>
  <Teleport to="body">
    <div ref="el" v-front tabindex="-1" class="sq float ip editor" role="dialog" :aria-label="tr('Icons')" :style="pos" @keydown.stop>
      <div class="ip-h">
        <h3 class="ip-t">{{ tr('Icons') }}</h3>
        <button type="button" class="sq ib s24" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
      </div>
      <div class="ip-b">
        <label class="sq fld ip-q">
          <EditorIcon name="search" :size="16" />
          <input ref="qEl" v-model="q" type="search" :placeholder="tr('Search icons')" :aria-label="tr('Search icons')">
        </label>
        <div v-ovscroll class="ip-grid" role="listbox" :aria-label="tr('Icons')">
          <button v-for="x in list" :key="x.n" type="button" role="option" :aria-selected="x.n === modelValue" :aria-label="x.n" :class="['sq', 'ip-cell', { on: x.n === modelValue }]" :data-tip="x.n" @click="pick(x.n)">
            <Icon :name="x.n" :category="x.c" :size="20" />
          </button>
          <p v-if="!list.length" class="ip-empty">{{ tr('No icons match “{q}”', { q }) }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ip:focus { outline: none; }
.ip { position: fixed; z-index: 70; width: 240px; max-height: min(480px, calc(100vh - 16px)); display: flex; flex-direction: column; border-radius: var(--ref-radius-06); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.ip-h { flex: none; display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: 0 1px 0 var(--iris-line); }
.ip-t { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; }
.s24 { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--ref-radius-03); }
.ip-b { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-06); padding: var(--ref-spacing-06) var(--ref-spacing-08) var(--ref-spacing-08); }
.ip-q { flex: none; height: 28px; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-06); color: var(--sys-color-neutral-500); }
.ip-q input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; color: var(--sys-color-neutral-800); -webkit-appearance: none; appearance: none; }
.ip-q input::-webkit-search-cancel-button { display: none; }
/* 한 줄 4칸 정사각(약 50) · 칸 사이 4 · 칸마다 옅은 1px 테두리 · 호버는 회색 면 + 진한 테두리 · 고른 칸은 옅은 파랑 + 파란 테두리 */
.ip-grid { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--ref-spacing-04); align-content: start; padding: 1px; }
.ip-cell { display: grid; place-items: center; aspect-ratio: 1; min-width: 0; border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); --sq-line: var(--iris-line); --sq-line-w: 1px; }
.ip-cell:hover { --sq-fill: var(--sys-color-neutral-100); --sq-line: var(--ref-color-gray-900-20); }
.ip-cell.on { --sq-fill: var(--iris-sel); --sq-line: var(--iris-select); }
.ip-empty { grid-column: 1 / -1; margin: 0; padding: var(--ref-spacing-10) 0; text-align: center; color: var(--sys-color-neutral-500); }
</style>
