<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
/**
 * 여러 레이어 이름 한꺼번에 바꾸기(피그마 'Rename N layers'와 같아요).
 * - Match(선택): 이름 안의 이 글자만 바꿔요. 비우면 이름 전체를 바꿔요
 * - Rename to: 새 이름. $& = 지금 이름, $nn = 위에서부터 1, 2, 3…, $NN = 위에서부터 거꾸로
 * - 미리보기는 레이어 목록 순서(위 → 아래)
 * 바꾸기는 실행취소 한 번
 */
import EditorIcon from '~/components/editor/EditorIcon.vue'
import { useLayerStore } from '~/canvas/store'

const props = defineProps<{ items: { sid: string; id: string }[] }>()
const emit = defineEmits<{ close: [] }>()
const store = useLayerStore()

const match = ref('')
const to = ref('')
const start = ref('')
const toEl = ref<HTMLInputElement | null>(null)
onMounted(() => nextTick(() => toEl.value?.focus()))

const names = computed(() => props.items.map((x) => store.doc(x.sid).nodes[x.id]?.name ?? ''))
const asc = computed(() => to.value.includes('$nn'))
const desc = computed(() => to.value.includes('$NN'))
const hasNum = computed(() => asc.value || desc.value)
/** 시작 번호: 비우면 오름차순은 1, 내림차순은 개수(마지막이 1) */
const startNum = computed(() => { const v = parseInt(start.value, 10); return Number.isFinite(v) ? v : asc.value ? 1 : names.value.length })
function renamed(name: string, k: number) {
  if (!to.value && !match.value) return name
  const n = names.value.length
  const s = startNum.value
  const fill = (cur: string) => to.value.replace(/\$&/g, cur).replace(/\$nn/g, String(s + k)).replace(/\$NN/g, String(asc.value ? s + (n - 1 - k) : s - k))
  if (match.value) return name.includes(match.value) ? name.split(match.value).join(fill(match.value)) : name
  return fill(name)
}
const preview = computed(() => names.value.map((v, k) => renamed(v, k)))
const changed = computed(() => preview.value.some((v, k) => v !== names.value[k] && v.trim()))

/** 칩: 고치는 칸의 커서 자리에 넣어요 */
function insert(tok: string) {
  const el = toEl.value
  if (!el) { to.value += tok; return }
  const a = el.selectionStart ?? to.value.length, b = el.selectionEnd ?? a
  to.value = to.value.slice(0, a) + tok + to.value.slice(b)
  nextTick(() => { el.focus(); el.setSelectionRange(a + tok.length, a + tok.length) })
}
function apply() {
  if (!changed.value) return
  const bySid = new Map<string, { id: string; name: string }[]>()
  props.items.forEach((x, k) => {
    const v = preview.value[k]!
    if (!v.trim() || v === names.value[k]) return
    bySid.set(x.sid, [...(bySid.get(x.sid) ?? []), { id: x.id, name: v }])
  })
  store.batch(() => { for (const [sid, list] of bySid) store.mutate(sid, (d) => { for (const r of list) { const n = d.nodes[r.id]; if (n) n.name = r.name } }) })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="pop-overlay" @pointerdown.self="emit('close')">
      <div v-front class="sq pop rn editor" style="--pop-w: 480px" role="dialog" aria-modal="true" :aria-label="tr('Rename {n} layers', { n: items.length })" @keydown.esc.stop.prevent="emit('close')" @keydown.stop>
        <div class="pop-top">
          <span class="pop-ttl">{{ tr('Rename {n} layers', { n: items.length }) }}</span>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
        </div>
        <div class="pop-body rn-b">
          <div class="rn-pv">
            <span class="rn-lb">{{ tr('Preview') }}</span>
            <ul v-ovscroll class="rn-list" :aria-label="tr('Preview')">
              <li v-for="(v, k) in preview" :key="items[k]!.sid + ':' + items[k]!.id" :class="{ same: v === names[k] }" :title="v">{{ v || names[k] }}</li>
            </ul>
          </div>
          <div class="rn-f">
            <label class="sq fld"><input v-model="match" :aria-label="tr('Match (optional)')" :placeholder="tr('Match (optional)')" spellcheck="false" autocomplete="off" @keydown.enter.prevent="apply"></label>
            <label class="sq fld"><input ref="toEl" v-model="to" :aria-label="tr('Rename to')" :placeholder="tr('Rename to')" spellcheck="false" autocomplete="off" @keydown.enter.prevent="apply"></label>
            <div class="rn-chips">
              <button type="button" class="sq chip" @click="insert('$&')">{{ tr('Current name') }}</button>
              <button type="button" class="sq chip" :class="{ on: asc }" @click="insert('$nn')">{{ tr('Number') }} ↑</button>
              <button type="button" class="sq chip" :class="{ on: desc }" @click="insert('$NN')">{{ tr('Number') }} ↓</button>
            </div>
            <div v-if="hasNum" class="rn-start">
              <span>{{ asc ? tr('Start ascending from') : tr('Start descending from') }}</span>
              <label class="sq fld num"><input v-model="start" inputmode="numeric" :aria-label="asc ? tr('Start ascending from') : tr('Start descending from')" :placeholder="String(startNum)" @keydown.enter.prevent="apply"></label>
            </div>
          </div>
        </div>
        <div class="pop-foot">
          <Button size="s" type="tertiary" @click="emit('close')">{{ tr('Cancel') }}</Button>
          <Button size="s" type="primary" :disabled="!changed" @click="apply">{{ tr('Rename') }}</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 팝업 양식은 main.css .pop-*(프로필 창 기준). 본문만: 왼쪽 미리보기 140 · 오른쪽 입력 */
.rn-b { display: grid; grid-template-columns: 140px 1fr; gap: var(--ref-spacing-08); min-height: 160px; }
.rn-pv { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.rn-lb { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.rn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-02); max-height: 240px; overflow-x: hidden; overflow-y: auto; }
.rn-list li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: proportional-nums; }
.rn-list li.same { color: var(--sys-color-neutral-500); }
.rn-f { display: flex; flex-direction: column; gap: var(--ref-spacing-06); min-width: 0; }
.fld { height: 28px; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.rn-chips { display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }
.chip { height: 28px; padding: 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); --sq-line: var(--iris-line); --sq-line-w: 1px; font-size: 12px; color: var(--sys-color-neutral-800); }
.chip:hover { --sq-fill: var(--sys-color-neutral-50); }
.chip.on { --sq-fill: var(--sys-color-neutral-100); }
.rn-start { display: flex; align-items: center; gap: var(--ref-spacing-06); color: var(--sys-color-neutral-700); }
.rn-start .num { width: 56px; }
</style>
