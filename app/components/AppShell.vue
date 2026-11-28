<script setup lang="ts">
/**
 * 홈 화면 틀(피그마 홈처럼 한 면): 위 탭 막대 아래로 [왼쪽 사이드바 240 | 본문]. 떠 있는 카드로 나누지 않고 흰 면 하나에 세로 선 하나로 나눠요.
 * 사이드바: 계정(아바타 · 이름 ▾ → 검은 계정 메뉴) · 검색(⌘K 창) · 메뉴(Projects · Requirements). 디자인 시스템은 편집기 Assets 로 합쳤어요.
 * 본문은 <slot> — 프로젝트 목록 · 요구사항 · 디자인 시스템 화면이 채워요.
 */
import EditorIcon from '~/components/editor/EditorIcon.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import AppCommandPalette from '~/components/app/CommandPalette.vue'
import AppProfileModal from '~/components/app/ProfileModal.vue'
import { useMe } from '~/composables/useMembers'

const route = useRoute()
const user = useSupabaseUser()
const { data: me } = useMe()
const email = computed(() => me.value?.email ?? user.value?.email ?? '')
const displayName = computed(() => me.value?.name || email.value)
// 사이드바 메뉴(라벨은 영어 원문 — 그릴 때 tr 로 바꿔요)
const nav = [
  { to: '/', label: 'Projects', icon: 'folder' },
  { to: '/requirements', label: 'Requests', icon: 'document' },
]
const isOn = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

const paletteOpen = ref(false)
const profileOpen = ref(false)

// 계정 메뉴 -------------------------------------------------------------------
const menuOpen = ref(false)
const accountEl = ref<HTMLElement | null>(null)
const avatarBtn = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuItems = () => Array.from(menuEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

async function toggleMenu(focusFirst = false) {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value && focusFirst) { await nextTick(); menuItems()[0]?.focus() }
}
function closeMenu(refocus = true) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (refocus) avatarBtn.value?.focus()
}
function onMenuKey(e: KeyboardEvent) {
  const list = menuItems()
  const i = list.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
  else if (e.key === 'Tab') closeMenu(false)
}
function onAvatarKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!menuOpen.value) toggleMenu(true); else menuItems()[0]?.focus() }
}
function onDocDown(e: MouseEvent) {
  if (menuOpen.value && accountEl.value && !accountEl.value.contains(e.target as Node)) closeMenu(false)
}
onMounted(() => document.addEventListener('mousedown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown))

function openProfile() {
  menuOpen.value = false
  avatarBtn.value?.focus() // 모달을 닫으면 아바타로 포커스가 돌아옵니다
  profileOpen.value = true
}

const supabase = useSupabaseClient()
const signingOut = ref(false)
/** scope 'local' = 이 기기만, 'global' = 내 계정이 로그인된 모든 기기 */
async function signOut(scope: 'local' | 'global' = 'local') {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await supabase.auth.signOut({ scope })
  } finally {
    signingOut.value = false
    menuOpen.value = false
  }
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="side" :aria-label="tr('Sidebar')">
      <div ref="accountEl" class="account">
        <button
          ref="avatarBtn"
          type="button"
          class="sq acct"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          aria-controls="accountMenu"
          :aria-label="tr('Account menu · {name}', { name: displayName })"
          @click="toggleMenu()"
          @keydown="onAvatarKey"
        ><MemberAvatar :name="displayName" :src="me?.avatar_url" :size="28" /><span class="acct-n">{{ me?.name || displayName }}</span><EditorIcon name="chevron_down" :size="12" /></button>
        <div v-if="menuOpen" id="accountMenu" ref="menuEl" class="sq menu acct-menu" role="menu" :aria-label="tr('Account')" @keydown="onMenuKey">
          <div class="who">
            <MemberAvatar :name="displayName" :src="me?.avatar_url" :size="32" />
            <span class="who-t">
              <span class="who-n ellipsis">{{ me?.name || tr('No name') }}</span>
              <span class="tx-meta ellipsis">{{ email }}</span>
            </span>
          </div>
          <div class="msep" role="separator" />
          <ThemeSwitch compact />
          <LangSwitch />
          <div class="msep" role="separator" />
          <button type="button" role="menuitem" class="sq menu-item" tabindex="-1" @click="openProfile">
            <EditorIcon name="pencil" :size="16" />{{ tr('Edit profile') }}
          </button>
          <div class="msep" role="separator" />
          <button type="button" role="menuitem" class="sq menu-item" tabindex="-1" :disabled="signingOut" @click="signOut('local')">
            <EditorIcon name="logout" :size="16" />{{ signingOut ? tr('Logging out…') : tr('Log out') }}
          </button>
          <button type="button" role="menuitem" class="sq menu-item" tabindex="-1" :disabled="signingOut" @click="signOut('global')">
            <EditorIcon name="logout" :size="16" />{{ tr('Log out of all devices') }}
          </button>
        </div>
      </div>
      <button class="sq search" type="button" :title="tr('Search') + ' (⌘K)'" aria-keyshortcuts="Meta+K Control+K" :aria-label="tr('Search projects, components and docs')" @click="paletteOpen = true">
        <EditorIcon name="search" :size="16" />
        <span class="ph">{{ tr('Search') }}</span>
      </button>
      <nav class="nav" :aria-label="tr('Main menu')">
        <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="['sq', 'nav-row', { on: isOn(n.to) }]" :aria-current="isOn(n.to) ? 'page' : undefined"><EditorIcon :name="n.icon" :size="16" />{{ tr(n.label) }}</NuxtLink>
      </nav>
      <div class="sq side-foot">
        <span class="foot-in">
          <IrisLogo kind="horizontal" :height="16" />
          <span class="powered">Powered by <b>CYCLOID</b></span>
        </span>
      </div>
    </aside>
    <div class="main"><slot /></div>
  </div>
  <AppCommandPalette v-model:open="paletteOpen" />
  <AppProfileModal v-model:open="profileOpen" />
</template>

<style scoped>
/* 홈 틀: 높이 = 화면 - 탭 막대. 흰 면 하나 — 탭 막대와의 선은 탭 막대(AppTabs)가 그려요, 사이드바 오른쪽 선 1px(--iris-line) */
.app-shell { height: calc(100vh - var(--iris-tabs-h, 0px)); box-sizing: border-box; display: flex; background: var(--sys-color-common-white-default); font-size: 12px; line-height: 18px; color: var(--sys-color-neutral-800); }
.side { flex: none; width: 240px; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-06); border-right: 1px solid var(--iris-line); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
/* 계정: 아바타 28 · 이름 · ▾ (피그마 팀 이름 자리) */
.account { position: relative; display: flex; }
.acct { display: flex; align-items: center; gap: var(--ref-spacing-05); max-width: 100%; height: 36px; box-sizing: border-box; padding: 0 var(--ref-spacing-05) 0 var(--ref-spacing-03); border-radius: var(--ref-radius-03); font-size: 13px; line-height: 20px; font-weight: 600; color: var(--sys-color-neutral-800); }
.acct:hover, .acct[aria-expanded='true'] { --sq-fill: var(--sys-color-neutral-100); }
.acct:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
.acct-n { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acct :deep(.eic) { flex: none; color: var(--sys-color-neutral-500); }
/* 계정 메뉴: 검은 메뉴(main.css .menu) — 폭 240, 버튼 아래 4 */
.acct-menu { left: 0; right: auto; top: calc(100% + 4px); width: 240px; }
.who { display: flex; align-items: center; gap: var(--ref-spacing-06); padding: var(--ref-spacing-04) var(--ref-spacing-06); min-width: 0; }
.who-t { display: flex; flex-direction: column; min-width: 0; }
.who-n { font-weight: 600; color: #FFFFFF; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 검색 열기: 칸 28 · 모서리 6 · 아이콘 16. 단축키(⌘K)는 배지 없이 툴팁 · aria 로만 */
.search { display: flex; align-items: center; gap: var(--ref-spacing-04); width: 100%; height: 28px; box-sizing: border-box; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); color: var(--sys-color-neutral-500); text-align: left; margin-bottom: var(--ref-spacing-04); }
.search:hover { --sq-fill: var(--sys-color-neutral-200); color: var(--sys-color-neutral-600); }
.search:focus-visible { outline: 0; --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1px; }
.ph { flex: 1; min-width: 0; }
/* 메뉴 행: 28 · 아이콘 16 · 고른 행은 레이어 선택과 같은 옅은 파랑(--iris-sel) */
.nav { display: flex; flex-direction: column; gap: var(--ref-spacing-01, 1px); }
.nav-row { display: flex; align-items: center; gap: var(--ref-spacing-04); height: 28px; padding: 0 var(--ref-spacing-04); border-radius: var(--ref-radius-03); color: var(--sys-color-neutral-800); }
.nav-row :deep(.eic) { color: var(--sys-color-neutral-600); }
.nav-row:hover { --sq-fill: var(--sys-color-neutral-100); }
.nav-row.on { --sq-fill: var(--iris-sel); font-weight: 600; }
.nav-row:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: -2px; }
/* 맨 아래: 테두리 0.75px(gray-900 10%) 상자에 담아 가운데 — 좌우 · 아래 여백은 위 메뉴 줄과 같게(사이드바 안쪽 8), 높이 36 · 모서리 8 · squircle 60%(.sq) — 사용자 요청으로 40 → 36.
   안의 한 줄(50% 흐리게, 테두리는 그대로): Iris 로고(높이 16) · 사이 6 · Powered by CYCLOID(아래 맞춤: 글자 기준선을 로고 바닥에 · Pretendard 11/11, 자간 -0.15 — 대문자도 벌리지 않아요. 브랜드 문구라 번역 안 함) */
.side-foot { margin-top: auto; display: flex; align-items: center; justify-content: center; height: 36px; box-sizing: border-box; min-width: 0; border-radius: var(--ref-radius-04); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 0.75px; }
:root[data-theme="dark"] .side-foot { --sq-line: rgb(255 255 255 / 12%); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .side-foot { --sq-line: rgb(255 255 255 / 12%); } }
.foot-in { display: flex; align-items: flex-end; gap: var(--ref-spacing-05); min-width: 0; opacity: .5; }
/* 문구는 로고 바닥보다 1px 위로(사용자 요청) */
.powered { position: relative; top: -1px; font-family: Pretendard, var(--font-family-base); font-size: 11px; line-height: 11px; color: var(--sys-color-neutral-600); letter-spacing: -0.15px; white-space: nowrap; }
.powered b { font-weight: 600; }
</style>
