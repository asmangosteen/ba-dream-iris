<script setup lang="ts">
import { useLayerStore } from '~/canvas/store'
import { SLOT_KEY, slotFallback } from '~/components/editor/InstanceView.vue'
import { instEdit, readInstanceTree, subRect, type SubNode } from '~/composables/useInstanceTree'

/**
 * 디자인 시스템 인스턴스 안 글자를 캔버스에서 바로 고치기(피그마처럼 두 번 누르면).
 * 인스턴스는 실제 컴포넌트를 그려서 글자를 직접 고칠 수 없어요 → 그 글자 자리에 같은 모양 입력칸을 띄우고, 끝나면
 * 컴포넌트 글자 속성(Text)이면 그 속성을, 아니면 하위 줄 글자 덮어쓰기(subOverrides)를 바꿔요(실행취소 한 번)
 */
const store = useLayerStore()
const el = ref<HTMLElement | null>(null)
const box = ref<{ left: number; top: number; height: number; font: Record<string, string> } | null>(null)
let target: { sid: string; id: string; key: string; sn: SubNode; host: HTMLElement | null; prevColor: string; start: string } | null = null

const find = (l: SubNode[], key: string): SubNode | null => { for (const x of l) { if (x.key === key) return x; const f = find(x.children, key); if (f) return f } return null }

watch(instEdit, (e) => {
  finish()
  if (!e) return
  const sn = find(readInstanceTree(e.sid, e.id), e.key)
  const host = (sn?.tnode?.parentElement ?? sn?.el) as HTMLElement | null
  const r = sn ? subRect(sn) : null
  if (!sn || !host || !r) { instEdit.value = null; return }
  const cs = getComputedStyle(host)
  const k = host.offsetWidth ? host.getBoundingClientRect().width / host.offsetWidth : 1 // 캔버스 확대 배율(인스턴스 배율 포함)
  const start = sn.tnode?.textContent ?? host.textContent ?? ''
  target = { sid: e.sid, id: e.id, key: e.key, sn, host, prevColor: host.style.color, start }
  box.value = {
    left: r.left, top: r.top, height: r.height,
    font: { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, fontSize: parseFloat(cs.fontSize) * k + 'px', lineHeight: r.height + 'px', letterSpacing: cs.letterSpacing === 'normal' ? '0' : parseFloat(cs.letterSpacing) * k + 'px', color: cs.color },
  }
  host.style.color = 'transparent' // 고치는 동안 원래 글자는 가려요
  nextTick(() => {
    const t = el.value
    if (!t) return
    t.textContent = start
    t.focus()
    const sel = getSelection()
    // 두 번 눌러 들어왔으면 누른 자리의 단어를, Enter 로 들어왔으면 전체를 골라요(일반 글자 레이어와 같아요)
    const hit = e.at && !e.all ? (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(e.at.x, e.at.y) : null
    if (hit && t.contains(hit.startContainer) && sel) {
      sel.removeAllRanges()
      sel.addRange(hit)
      const m = sel as Selection & { modify?: (a: string, d: string, g: string) => void }
      m.modify?.('move', 'backward', 'word')
      m.modify?.('extend', 'forward', 'word')
      return
    }
    const range = document.createRange()
    range.selectNodeContents(t)
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
})

function finish() {
  const t = target
  target = null
  if (!t) return
  const v = (el.value?.textContent ?? t.start).replace(/\n/g, ' ')
  if (t.host) t.host.style.color = t.prevColor
  box.value = null
  if (v === t.start) return
  const n = store.node(t.sid, t.id)
  if (!n) return
  const ov = n.subOverrides?.[t.key]
  const slotVal = n.props?.[SLOT_KEY] ?? slotFallback(n.component)
  // 컴포넌트 글자 속성(Text 칸)으로 그린 글자면 그 속성을 — 오른쪽 패널 Text 와 같이 바뀌어요
  if (ov?.text === undefined && typeof slotVal === 'string' && slotVal.trim() === t.start.trim()) {
    store.update(t.sid, [t.id], (m) => ({ props: { ...(m.props ?? {}), [SLOT_KEY]: v } }))
    return
  }
  // 그 밖의 글자: 하위 줄 글자 덮어쓰기(원래 글자로 돌아가면 덮어쓰기를 지워요)
  store.update(t.sid, [t.id], (m) => {
    const all = { ...(m.subOverrides ?? {}) }
    const cur: Record<string, unknown> = { ...all[t.key], text: v === t.sn.name ? undefined : v }
    for (const k of Object.keys(cur)) if (cur[k] === undefined) delete cur[k]
    if (Object.keys(cur).length) all[t.key] = cur as never; else delete all[t.key]
    return { subOverrides: Object.keys(all).length ? all : undefined }
  })
}
function close() { if (instEdit.value) instEdit.value = null; else finish() }
function key(e: KeyboardEvent) {
  e.stopPropagation()
  if (e.isComposing) return
  if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); close() }
}
/** 붙여 넣기는 글자만 */
function paste(e: ClipboardEvent) {
  e.preventDefault()
  document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') ?? '').replace(/\n/g, ' '))
}
// 화면을 옮기거나 확대하면 · 다른 것을 고르면 끝내요
watch(() => [store.screenId.value, store.layerIds.value.join()], () => { if (target && !(store.screenId.value === target.sid && store.layerIds.value.includes(target.id))) close() })
const onWheel = () => { if (target) close() }
onMounted(() => window.addEventListener('wheel', onWheel, { capture: true, passive: true }))
onBeforeUnmount(() => { window.removeEventListener('wheel', onWheel, { capture: true }); close() })
</script>

<template>
  <span
    v-if="box"
    ref="el"
    class="iedit"
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    :aria-label="tr('Text')"
    :style="{ left: box.left + 'px', top: box.top + 'px', height: box.height + 'px', ...box.font }"
    @keydown="key"
    @paste="paste"
    @blur="close"
    @pointerdown.stop
    @dblclick.stop
  />
</template>

<style scoped>
.iedit { position: fixed; z-index: 30; min-width: 4px; white-space: pre; outline: none; background: none; cursor: text; caret-color: currentColor; }
.iedit::selection { background: color-mix(in srgb, var(--iris-select, #0E97FC) 30%, transparent); }
</style>
