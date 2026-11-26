<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { Peer } from '~/composables/useRoom'

/**
 * 함께 보는 사람(오른쪽 패널 맨 위, PRD/16 J-1): 아바타 묶음(사람 색 테두리, 셋까지 + 나머지 수).
 * 누르면 목록 — 무엇을 하는지 · 따라가기(Follow: 그 사람이 보는 자리를 따라가요)
 */
const props = defineProps<{ people: Peer[]; following: string | null; pages: { id: string; name: string }[]; screens: { id: string; name: string }[] }>()
const emit = defineEmits<{ follow: [key: string | null] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const shown = computed(() => props.people.slice(0, 3))
const more = computed(() => Math.max(0, props.people.length - 3))

function doingOf(p: Peer) {
  if (p.doing === 'away') return tr('Away')
  const scr = props.screens.find((s) => s.id === p.screenId)
  if (scr) return p.doing === 'editing' ? tr('Editing {name}', { name: scr.name }) : tr('Viewing {name}', { name: scr.name })
  const pg = props.pages.find((x) => x.id === p.pageId)
  return pg ? tr('On {page}', { page: pg.name }) : tr('In this file')
}
function onDoc(e: PointerEvent) { if (open.value && !root.value?.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))
function follow(p: Peer) { emit('follow', props.following === p.key ? null : p.key); open.value = false }
</script>

<template>
  <div v-if="people.length" ref="root" class="ps" @keydown.esc.stop="open = false">
    <button type="button" class="sq stack" :aria-label="tr('{n} people here', { n: people.length })" :data-tip="tr('{n} people here', { n: people.length })" :aria-expanded="open" aria-haspopup="menu" @click="open = !open">
      <span v-for="(p, i) in shown" :key="p.key" class="ring" :style="{ '--c': p.color, zIndex: 3 - i }" :class="{ away: p.doing === 'away', fol: following === p.key }">
        <MemberAvatar :name="p.name" :src="p.avatar" :size="20" />
      </span>
      <span v-if="more" class="ring more num">+{{ more }}</span>
    </button>
    <div v-if="open" class="sq menu list" role="menu" :aria-label="tr('People here')">
      <div class="hd"><span class="tx-head">{{ tr('{n} people here', { n: people.length }) }}</span></div>
      <div v-for="p in people" :key="p.key" class="row" role="none">
        <span class="ring" :style="{ '--c': p.color }"><MemberAvatar :name="p.name" :src="p.avatar" :size="24" /></span>
        <span class="who"><b>{{ p.name }}</b><span>{{ doingOf(p) }}</span></span>
        <button type="button" role="menuitem" class="sq fbtn" :disabled="p.doing === 'away'" @click="follow(p)">{{ following === p.key ? tr('Stop') : tr('Follow') }}</button>
      </div>
      <p class="tx-meta note">{{ tr('Follow shows their view as they move. Press Esc or move the canvas to stop') }}</p>
    </div>
  </div>
</template>

<style scoped>
.ps { position: relative; display: flex; align-items: center; }
.stack { display: flex; align-items: center; height: 28px; padding: 0 var(--ref-spacing-02); border-radius: var(--ref-radius-04); }
.stack:hover { --sq-fill: var(--sys-color-neutral-100); }
.stack:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 아바타 둘레: 흰 2px + 사람 색 1.5px(원형이라 squircle 예외) */
.ring { position: relative; display: grid; place-items: center; border-radius: 50%; box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis), 0 0 0 3.5px var(--c); }
.stack .ring + .ring { margin-left: -4px; }
.ring.away { opacity: .45; }
.ring.fol { box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis), 0 0 0 4px var(--c); }
.more { width: 20px; height: 20px; font-size: 10px; font-weight: 600; background: var(--sys-color-neutral-200); color: var(--sys-color-neutral-700); --c: transparent; }
.list { top: calc(100% + 6px); left: auto; right: 0; width: 280px; z-index: 30; padding: var(--ref-spacing-02); }
.hd { height: 32px; display: flex; align-items: center; padding: 0 var(--ref-spacing-06); }
.row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 44px; padding: 0 var(--ref-spacing-06); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who b { font-weight: 500; color: var(--sys-color-neutral-800); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who > span { font-size: 11px; line-height: 16px; color: var(--sys-color-neutral-500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fbtn { flex: none; height: 28px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: var(--sys-color-brand-primary-default); }
.fbtn:hover:not(:disabled) { --sq-fill: var(--sys-color-neutral-100); }
.fbtn:disabled { color: var(--sys-color-neutral-400); }
.fbtn:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.note { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); font-size: 11px; line-height: 16px; }
</style>
