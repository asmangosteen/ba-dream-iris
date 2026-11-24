<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'
/**
 * 지금 값을 스타일(토큰)로 저장하고 바로 연결해요. 피그마의 'Create style'.
 * 저장한 스타일은 디자인 시스템 토큰 목록(DB tokens)에 들어가서 모든 프로젝트의 토큰 고르기에 보여요.
 * 창은 피그마 팝오버(§9.1)처럼 오른쪽 패널 왼쪽에 붙고, 위쪽은 연 버튼 줄에 맞춰요. 바깥 누르기 · Esc 로 닫기(Esc 는 버튼으로 포커스를 돌려줘요)
 */
const props = defineProps<{ type: 'color' | 'typography'; value: string; label: string }>()
const emit = defineEmits<{ created: [id: string] }>()
const { addTokens } = useIrisMutations()
const open = ref(false)
const name = ref('')
const busy = ref(false)
const err = ref('')
const input = ref<HTMLInputElement | null>(null)
const btn = ref<HTMLElement | null>(null)
const pop = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({ visibility: 'hidden' })
const W = 240

function place() {
  const b = btn.value
  if (!b) return
  const r = b.getBoundingClientRect()
  const panel = b.closest('aside, [data-inspector]')?.getBoundingClientRect() ?? r
  const h = pop.value?.offsetHeight ?? 220
  const vh = window.innerHeight
  const left = Math.max(8, panel.left - W - 8)
  const top = Math.max(8, Math.min(vh - h - 8, r.top - 8))
  pos.value = { left: left + 'px', top: top + 'px' }
}
async function show() {
  open.value = true
  err.value = ''
  name.value = ''
  pos.value = { visibility: 'hidden' }
  await nextTick()
  place()
  await nextTick()
  input.value?.focus()
}
function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) btn.value?.focus()
}
const toggle = () => (open.value ? close() : show())

function onDoc(e: PointerEvent) {
  const t = e.target as Node | null
  if (open.value && t && !pop.value?.contains(t) && !btn.value?.contains(t)) close()
}
const onReflow = (e: Event) => { if (open.value && !(e.target instanceof Node && pop.value?.contains(e.target))) place() }
onMounted(() => {
  document.addEventListener('pointerdown', onDoc, true)
  window.addEventListener('resize', onReflow)
  window.addEventListener('scroll', onReflow, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc, true)
  window.removeEventListener('resize', onReflow)
  window.removeEventListener('scroll', onReflow, true)
})

/** 값 미리보기: 색은 견본 + HEX, 글자는 '16 · Regular 400 · Line Auto · Letter 0' 처럼(JSON 그대로 보이지 않게) */
const text = computed(() => {
  if (props.type === 'color') return props.value.toUpperCase()
  try {
    const t = JSON.parse(props.value) as { fontSize?: number; lineHeight?: number; letterSpacing?: number; fontWeight?: number }
    return [`${t.fontSize ?? 16}px`, tr('Weight {n}', { n: t.fontWeight ?? 400 }), tr('Line height {n}', { n: t.lineHeight ?? tr('Auto') }), tr('Letter spacing {n}', { n: t.letterSpacing ?? 0 })].join(' · ')
  } catch { return props.value }
})

async function save() {
  const n = name.value.trim()
  if (!n || busy.value) return
  busy.value = true
  err.value = ''
  try {
    await addTokens([{ type: props.type, name: n, value: props.value, description: null }])
    await refreshNuxtData('ds-tokens')
    emit('created', 'db:' + n)
    close(true)
  } catch { err.value = 'Could not save the style. Try again.' /* 영어 원문 — 보여 줄 때 tr */ } finally { busy.value = false }
}
</script>

<template>
  <button ref="btn" type="button" :class="['ib', 's24', { on: open }]" :aria-label="tr(label)" :data-tip="tr(label)" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="5" r="1.25" fill="currentColor" /><circle cx="11" cy="5" r="1.25" fill="currentColor" /><circle cx="5" cy="11" r="1.25" fill="currentColor" /><circle cx="11" cy="11" r="1.25" fill="currentColor" /></svg>
  </button>
  <Teleport to="body">
    <!-- 피그마 팝오버(§9.1): 폭 240 · 머리 40(제목 + ✕, 아래 선) · 본문 안쪽 12 16 16 · 라벨 11/16 → 칸 28. body 로 옮겨져도 편집기 규칙을 받게 editor 클래스 -->
    <div v-if="open" ref="pop" class="sq sc-pop editor" role="dialog" :aria-label="tr(label)" :style="pos" @keydown.esc.stop.prevent="close(true)">
      <div class="pop-h">
        <span class="pop-t">{{ tr(label) }}</span>
        <button type="button" class="ib s24" :aria-label="tr('Close')" :data-tip="tr('Close')" @click="close(true)"><EditorIcon name="close" :size="16" /></button>
      </div>
      <div class="pop-b">
        <div class="fl">
          <span class="lb">{{ tr('Name') }}</span>
          <label class="sq fld"><input ref="input" v-model="name" :aria-label="tr('Style name')" :placeholder="tr('e.g. {example}', { example: 'brand/primary' })" spellcheck="false" autocomplete="off" @keydown.enter.prevent="save"></label>
        </div>
        <div class="fl">
          <span class="lb">{{ tr('Value') }}</span>
          <span class="val"><span v-if="type === 'color'" class="sqc vsw" :style="{ background: `linear-gradient(${value}, ${value}), repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 0 0 / 6px 6px` }" /><span class="vt">{{ text }}</span></span>
        </div>
        <span v-if="err" class="err" role="alert">{{ tr(err) }}</span>
        <div class="end"><button type="button" class="sq act gray" @click="close(true)">{{ tr('Cancel') }}</button><button type="button" class="sq act pri" :disabled="!name.trim() || busy" @click="save">{{ busy ? tr('Saving…') : tr('Create style') }}</button></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.s24 { width: 24px; height: 24px; }
.ib.on { --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-800); }
.sc-pop { position: fixed; z-index: 60; width: 240px; display: flex; flex-direction: column; border-radius: var(--ref-radius-06); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); text-align: left; font-size: 12px; line-height: 18px; font-weight: 400; color: var(--sys-color-neutral-800); }
.pop-h { display: flex; align-items: center; justify-content: space-between; height: 40px; box-sizing: border-box; padding: 0 var(--ref-spacing-06) 0 var(--ref-spacing-08); box-shadow: inset 0 -1px 0 var(--iris-line); }
.pop-t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--sys-color-neutral-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pop-b { padding: var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-06); }
.fl { display: flex; flex-direction: column; gap: var(--ref-spacing-04); min-width: 0; }
.lb { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); }
.val { display: flex; align-items: center; gap: var(--ref-spacing-06); min-width: 0; min-height: 18px; font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); font-variant-numeric: proportional-nums; }
.vt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vsw { flex: none; width: 16px; height: 16px; border-radius: var(--ref-radius-02); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10); }
.err { font-size: 11px; line-height: 16px; color: var(--sys-color-system-error, #E5484D); }
.end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); margin-top: var(--ref-spacing-02); }
.act { height: 28px; }
.act:disabled { opacity: 0.4; }
.fld:focus-within { --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
</style>
