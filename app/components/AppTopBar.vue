<script setup lang="ts">
import { Avatar, Icon } from '@ba-dream/design-system'
import AppCommandPalette from '~/components/app/CommandPalette.vue'
import AppProfileModal from '~/components/app/ProfileModal.vue'
import { useMe } from '~/composables/useMembers'

const route = useRoute()
const user = useSupabaseUser()
const { data: me } = useMe()
const email = computed(() => me.value?.email ?? user.value?.email ?? '')
const displayName = computed(() => me.value?.name || email.value)
const nav = [
  { to: '/', label: '프로젝트' },
  { to: '/requirements', label: '요구사항' },
  { to: '/design-system', label: '디자인 시스템' },
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
  <div class="sq float s bar left">
    <NuxtLink to="/" class="brand" aria-label="Iris 홈">
      <IrisLogo kind="horizontal" :height="18" />
    </NuxtLink>
    <nav aria-label="주 메뉴" class="seg">
      <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="['sq', 'seg-item', { on: isOn(n.to) }]">{{ n.label }}</NuxtLink>
    </nav>
  </div>
  <div class="sq float s bar right">
    <button class="search" type="button" aria-keyshortcuts="Meta+K Control+K" aria-label="프로젝트 · 화면 · 문서 · 요구사항 검색" @click="paletteOpen = true">
      <Icon name="search" :size="14" color="var(--sys-color-neutral-500)" />
      <span class="ph">검색</span>
      <kbd class="key">⌘K</kbd>
    </button>
    <div ref="accountEl" class="account">
      <button
        ref="avatarBtn"
        type="button"
        class="avatar"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        aria-controls="accountMenu"
        :aria-label="`계정 메뉴 · ${displayName}`"
        @click="toggleMenu()"
        @keydown="onAvatarKey"
      ><Avatar :alt="displayName" :size="24" /></button>
      <div v-if="menuOpen" id="accountMenu" ref="menuEl" class="menu acct-menu" role="menu" aria-label="계정" @keydown="onMenuKey">
        <div class="who">
          <span class="tx-head ellipsis">{{ me?.name || '이름 없음' }}</span>
          <span class="tx-meta ellipsis">{{ email }}</span>
        </div>
        <div class="sep" role="separator" />
        <ThemeSwitch />
        <div class="sep" role="separator" />
        <button type="button" role="menuitem" class="menu-item" tabindex="-1" @click="openProfile">
          <Icon name="pencil" :size="14" color="var(--sys-color-neutral-600)" />프로필 고치기
        </button>
        <button type="button" role="menuitem" class="menu-item" tabindex="-1" :disabled="signingOut" @click="signOut('local')">
          <Icon name="logout_right" :size="14" color="var(--sys-color-neutral-600)" />{{ signingOut ? '로그아웃하는 중' : '로그아웃' }}
        </button>
        <button type="button" role="menuitem" class="menu-item" tabindex="-1" :disabled="signingOut" @click="signOut('global')">
          <Icon name="logout_right" :size="14" color="var(--sys-color-neutral-600)" />모든 기기에서 로그아웃
        </button>
      </div>
    </div>
  </div>
  <AppCommandPalette v-model:open="paletteOpen" />
  <AppProfileModal v-model:open="profileOpen" />
</template>

<style scoped>
.bar { position: absolute; top: var(--iris-gap); height: 40px; box-sizing: border-box; display: flex; align-items: center; z-index: 3; }
.left { left: var(--iris-gap); gap: var(--ref-spacing-08); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); }
.right { right: var(--iris-gap); gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-04); }
.brand { display: flex; align-items: center; gap: var(--ref-spacing-04); font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-neutral-800); border-radius: var(--ref-radius-03); }
.brand:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 검색 열기: 디자인 시스템 Search Field(contained · S)와 같은 생김새 — 누르면 ⌘K 검색 창이 열려요 */
.search { display: flex; align-items: center; gap: var(--ref-spacing-04); width: 240px; height: 28px; box-sizing: border-box; padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-06); border-radius: var(--ref-radius-04); background: var(--sys-color-neutral-100); color: var(--sys-color-neutral-500); text-align: left; transition: background-color .12s ease, box-shadow .12s ease; }
.search:hover { background: var(--sys-color-neutral-200); }
.search:active { background: var(--sys-color-neutral-300); }
.search:focus-visible { outline: 0; box-shadow: inset 0 0 0 1px var(--sys-color-brand-primary-default); }
.ph { flex: 1; min-width: 0; font-size: 12px; line-height: 18px; }
.key { flex: none; padding: 0 var(--ref-spacing-02); min-width: 20px; height: 18px; box-sizing: border-box; display: inline-grid; place-items: center; border-radius: var(--ref-radius-02); background: var(--sys-color-common-white-default); box-shadow: inset 0 0 0 1px var(--ref-color-gray-900-10), 0 1px 0 var(--ref-color-gray-900-10); font-family: var(--font-family-base); font-size: 10px; line-height: 16px; font-weight: 500; color: var(--sys-color-neutral-600); }
.account { position: relative; display: flex; }
.avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; transition: background-color .12s ease; }
.avatar:hover, .avatar[aria-expanded='true'] { background: var(--interaction-light-gray-hover); }
.avatar:active { background: var(--interaction-light-gray-pressed); }
.avatar:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 0; }
.acct-menu { left: auto; right: 0; top: calc(100% + 8px); width: 232px; }
.who { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-06); min-width: 0; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sep { height: 1px; margin: var(--ref-spacing-02) 0; background: var(--iris-line); }
.menu-item:focus-visible { outline: 0; --sq-fill: var(--sys-color-neutral-100); }
.menu-item:disabled { opacity: .5; cursor: default; }
</style>
