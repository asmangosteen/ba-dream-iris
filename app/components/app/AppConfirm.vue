<script setup lang="ts">
import { Button } from '@ba-dream/design-system'
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * Iris 확인 창(공용) — 기존 팝업(프로필 편집 ProfileModal)과 같은 양식 · 무드:
 * 모양은 main.css 의 팝업 공통(.pop-*) — 바탕 dimmed · 폭 360 · radius-08 · 머리 48 · 안쪽 16 · 디자인 시스템 Button s.
 * 페이지 지우기 · 저장하지 못한 변경 복구 · 로그인 끝남 등 '골라야 하는' 알림은 모두 이걸로(새 창 모양을 따로 만들지 않기)
 * - actions: 오른쪽 아래 버튼(왼쪽부터). kind: tertiary(취소 · 버리기) · primary(주 동작) · destructed(되돌릴 수 없는 동작)
 * - closable: 오른쪽 위 × · Esc · 바깥 누르기로 닫기(고르지 않으면 안 되는 창은 false)
 */
export interface ConfirmAction { label: string; kind?: 'tertiary' | 'primary' | 'destructed'; loading?: boolean; onClick: () => void }
const props = withDefaults(defineProps<{ title: string; desc?: string; actions: ConfirmAction[]; closable?: boolean }>(), { desc: undefined, closable: true })
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement | null>(null)
// 열리면 주 동작(primary)에 포커스 — Enter 로 바로. 지우기(destructed)만 있는 창은 실수하지 않게 첫 버튼(취소)에
onMounted(() => nextTick(() => {
  const btns = [...(box.value?.querySelectorAll<HTMLButtonElement>('.pop-foot button') ?? [])]
  const i = props.actions.findIndex((a) => a.kind === 'primary')
  btns[i >= 0 ? i : 0]?.focus()
}))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closable) { e.stopPropagation(); emit('close') }
}
const uid = `cf-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <Teleport to="body">
    <div class="pop-overlay" @mousedown.self="closable && emit('close')">
      <section ref="box" role="alertdialog" aria-modal="true" :aria-labelledby="`${uid}-t`" :aria-describedby="desc ? `${uid}-d` : undefined" class="sq pop" @keydown="onKey">
        <div class="pop-top">
          <h1 :id="`${uid}-t`" class="pop-ttl">{{ title }}</h1>
          <button v-if="closable" type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('close')"><EditorIcon name="close" :size="16" /></button>
        </div>
        <div class="pop-body">
          <p v-if="desc" :id="`${uid}-d`" class="pop-desc">{{ desc }}</p>
          <slot />
        </div>
        <div class="pop-foot">
          <Button v-for="(a, i) in actions" :key="i" size="s" :type="a.kind ?? 'tertiary'" :loading="a.loading" @click="a.onClick">{{ a.label }}</Button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 모양은 main.css 의 팝업 공통(.pop-*) — 여기에는 따로 두지 않아요 */
</style>
