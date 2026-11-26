<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { Peer } from '~/composables/useRoom'

/**
 * 함께 보는 사람(오른쪽 패널 맨 위, PRD/16 J-1 — 피그마와 같아요): 나를 맨 앞에, 그 뒤로 다른 사람이 겹쳐요(셋까지 + 나머지 수).
 * - 내 아바타를 누르면 Spotlight me(다른 사람에게 '따라갈까요?' 안내) — 켜져 있으면 다시 눌러 끄기
 * - 다른 사람 아바타를 누르면 목록 — 무엇을 하는지 · 따라가기(Follow)
 * 사람 색 테두리는 처음부터 두르지 않아요: 따라가는 사람(또는 Spotlight 중인 나)에게만
 */
const props = defineProps<{ people: Peer[]; following: string | null; pages: { id: string; name: string }[]; screens: { id: string; name: string }[]; me: { name: string; avatar?: string | null; color: string }; spotlight: boolean }>()
const emit = defineEmits<{ follow: [key: string | null]; spotlight: [] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
/** Spotlight 중인 다른 사람: 늘 맨 앞(나는 두 번째) — 내가 Spotlight 중이면 내가 맨 앞 그대로(사용자 요청 2026-11-27) */
const spotPeer = computed(() => (props.spotlight ? null : props.people.find((p) => p.spot) ?? null))
const others = computed(() => props.people.filter((p) => p !== spotPeer.value))
/** 목록도 Spotlight 중인 사람부터 */
const listPeople = computed(() => (spotPeer.value ? [spotPeer.value, ...others.value] : props.people))
/** 앞쪽(Spotlight 중인 사람 · 나) 포함 3명까지 보여요 — 넘으면 마지막 자리를 회색 원 '+n' 으로 */
const shown = computed(() => {
  const fixed = spotPeer.value ? 2 : 1
  const room = 3 - fixed
  return others.value.slice(0, props.people.length + 1 > 3 ? room - 1 : room)
})
const more = computed(() => others.value.length - shown.value.length)
/** 내 아바타 팝오버(피그마와 같아요): 이름(You) + Spotlight me / Stop spotlight */
const meOpen = ref(false)
const peopleLabel = computed(() => (props.people.length === 1 ? tr('1 person here') : tr('{n} people here', { n: props.people.length })))

function doingOf(p: Peer) {
  if (p.doing === 'away') return tr('Away')
  const scr = props.screens.find((s) => s.id === p.screenId)
  if (scr) return p.doing === 'editing' ? tr('Editing {name}', { name: scr.name }) : tr('Viewing {name}', { name: scr.name })
  const pg = props.pages.find((x) => x.id === p.pageId)
  return pg ? tr('On {page}', { page: pg.name }) : tr('In this file')
}
function onDoc(e: PointerEvent) { if ((open.value || meOpen.value) && !root.value?.contains(e.target as Node)) { open.value = false; meOpen.value = false } }
onMounted(() => document.addEventListener('pointerdown', onDoc, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc, true))
function follow(p: Peer) { emit('follow', props.following === p.key ? null : p.key); open.value = false }
</script>

<template>
  <div ref="root" class="ps" @keydown.esc.stop="open = false">
    <!-- Spotlight 중인 다른 사람(맨 앞): 그 사람 색 점선 고리 — 누르면 목록 -->
    <button v-if="spotPeer" type="button" class="sq av spotp" :aria-label="tr('{name} is spotlighting', { name: spotPeer.name })" :data-tip="tr('{name} is spotlighting', { name: spotPeer.name })" :aria-expanded="open" aria-haspopup="menu" @click="open = !open; meOpen = false">
      <span :class="['ring', { fol: following === spotPeer.key }]" :style="{ '--c': spotPeer.color }"><i class="spin" aria-hidden="true" /><MemberAvatar :name="spotPeer.name" :src="spotPeer.avatar" :size="24" /></span>
    </button>
    <!-- 나(맨 앞 — Spotlight 중인 사람이 있으면 두 번째): 누르면 팝오버(Spotlight me). Spotlight 중엔 내 색 점선 고리가 돌아요 -->
    <button
      type="button" :class="['sq', 'av', 'me', { on: meOpen, second: !!spotPeer }]" :aria-expanded="meOpen" aria-haspopup="dialog"
      :aria-label="tr('{name} (You)', { name: me.name })" :data-tip="meOpen ? undefined : tr('{name} (You)', { name: me.name })"
      @click="meOpen = !meOpen; open = false"
    >
      <span class="ring" :style="{ '--c': me.color }"><i v-if="spotlight" class="spin" aria-hidden="true" /><MemberAvatar :name="me.name" :src="me.avatar" :size="24" /></span>
    </button>
    <div v-if="meOpen" class="sq menu list mepop" role="dialog" :aria-label="tr('{name} (You)', { name: me.name })">
      <div class="row"><MemberAvatar :name="me.name" :src="me.avatar" :size="24" /><span class="who"><b>{{ tr('{name} (You)', { name: me.name }) }}</b></span></div>
      <div class="spw"><button type="button" :class="['sq', 'spb', { stop: spotlight }]" @click="emit('spotlight'); meOpen = false">{{ spotlight ? tr('Stop spotlight') : tr('Spotlight me') }}</button></div>
    </div>
    <!-- 다른 사람(겹쳐서): 누르면 목록 -->
    <button v-if="others.length" type="button" class="sq av stack" :aria-label="peopleLabel" :data-tip="peopleLabel" :aria-expanded="open" aria-haspopup="menu" @click="open = !open; meOpen = false">
      <span v-for="(p, i) in shown" :key="p.key" class="ring" :style="{ '--c': p.color, zIndex: 3 - i }" :class="{ away: p.doing === 'away', fol: following === p.key }">
        <MemberAvatar :name="p.name" :src="p.avatar" :size="24" />
      </span>
      <span v-if="more" class="ring more num">+{{ more }}</span>
    </button>
    <div v-if="open" class="sq menu list" role="menu" :aria-label="tr('People here')">
      <div class="hd"><span class="tx-head">{{ peopleLabel }}</span></div>
      <div v-for="p in listPeople" :key="p.key" class="row" role="none">
        <span :class="['ring', { fol: following === p.key }]" :style="{ '--c': p.color }"><MemberAvatar :name="p.name" :src="p.avatar" :size="24" /></span>
        <span class="who"><b>{{ p.name }}</b><span>{{ doingOf(p) }}</span></span>
        <button type="button" role="menuitem" class="sq fbtn" :disabled="p.doing === 'away'" @click="follow(p)">{{ following === p.key ? tr('Stop') : tr('Follow') }}</button>
      </div>
      <p class="tx-meta note">{{ tr('Follow shows their view as they move. Press Esc or move the canvas to stop') }}</p>
    </div>
  </div>
</template>

<style scoped>
.ps { position: relative; display: flex; align-items: center; }
/* 나 + 다른 사람: 한 줄로 겹쳐요(나는 맨 앞 · 맨 위) */
.av { display: flex; align-items: center; height: 28px; padding: 0 2px; border-radius: 14px; }
.av:hover { --sq-fill: var(--sys-color-neutral-100); }
.av:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.spotp { position: relative; z-index: 5; }
.me { position: relative; z-index: 4; }
.me.second { margin-left: -8px; }
.stack { margin-left: -8px; }
/* 아바타 둘레: 흰 2px 만 — 사람 색은 따라가는 사람(Spotlight 중인 나)에게만 2px 더(원형이라 squircle 예외) */
.ring { position: relative; display: grid; place-items: center; border-radius: 50%; box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis); }
.stack .ring + .ring { margin-left: -6px; }
.ring.away { opacity: .45; }
.ring.fol { box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis), 0 0 0 4px var(--c); }
.list .ring { box-shadow: none; }
.list .ring.fol { box-shadow: 0 0 0 2px #1E1E1E, 0 0 0 4px var(--c); }
/* Spotlight 중인 나: 내 색 점선 고리가 천천히 돌아요(피그마와 같아요) */
.spin { position: absolute; inset: -3px; border-radius: 50%; border: 1.5px dashed var(--c); animation: ps-spin 4s linear infinite; pointer-events: none; }
@keyframes ps-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
/* 내 팝오버: 이름(You) + 파란 Spotlight me(켜져 있으면 회색 Stop spotlight) */
.list.mepop { width: 232px; padding: var(--ref-spacing-08) !important; box-sizing: border-box; } /* 공용 검은 메뉴는 안쪽 8 을 !important 로 정해요 — 이 창만 상하좌우 12 */
/* 상 · 좌우 · 하 여백을 모두 16 으로 같게 — 줄은 안쪽 여백 없이, 버튼은 위 12 만 */
.mepop .row { min-height: 0; padding: 0; gap: var(--ref-spacing-05); }
.spw { padding: var(--ref-spacing-06) 0 0; }
.spb { width: 100%; height: 28px; display: grid; place-items: center; border-radius: var(--ref-radius-04); font-size: 12px; font-weight: 500; color: #FFFFFF; --sq-fill: var(--sys-color-brand-primary-default); }
.spb:hover { --sq-fill: var(--sys-color-brand-primary-dark, #2369C6); }
.spb.stop { --sq-fill: rgb(255 255 255 / 14%); }
.spb.stop:hover { --sq-fill: rgb(255 255 255 / 22%); }
.spb:focus-visible { outline: 2px solid var(--iris-select, #0E97FC); outline-offset: 1px; }
.more { width: 24px; height: 24px; font-size: 10px; font-weight: 600; background: var(--sys-color-neutral-200); color: var(--sys-color-neutral-700); }
/* 앱 공용 검은 메뉴(main.css .menu) — 패널 안쪽으로 열려요(왼쪽 끝 맞춤, 패널 폭 288 안) */
.list { top: calc(100% + 6px); left: 0; right: auto; width: 256px; z-index: 30; }
.hd { height: 28px; display: flex; align-items: center; padding: 0 var(--ref-spacing-06); }
.hd .tx-head { color: #FFFFFF; }
.row { display: flex; align-items: center; gap: var(--ref-spacing-06); min-height: 44px; padding: 0 var(--ref-spacing-06); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who b { font-weight: 500; color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who > span { font-size: 11px; line-height: 16px; color: rgb(255 255 255 / 70%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fbtn { flex: none; height: 24px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); font-size: 12px; font-weight: 500; color: #FFFFFF; --sq-fill: rgb(255 255 255 / 12%); }
.fbtn:hover:not(:disabled) { --sq-fill: var(--iris-select, #0E97FC); }
.fbtn:disabled { color: rgb(255 255 255 / 40%); --sq-fill: transparent; }
.fbtn:focus-visible { outline: 2px solid var(--iris-select, #0E97FC); outline-offset: 1px; }
.note { margin: 0; padding: var(--ref-spacing-04) var(--ref-spacing-06) var(--ref-spacing-06); font-size: 11px; line-height: 16px; }
</style>
