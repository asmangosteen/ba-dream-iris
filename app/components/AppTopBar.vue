<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import AppCommandPalette from '~/components/app/CommandPalette.vue'
import AppProfileModal from '~/components/app/ProfileModal.vue'
import { useMe } from '~/composables/useMembers'

const route = useRoute()
const user = useSupabaseUser()
const { data: me } = useMe()
const email = computed(() => me.value?.email ?? user.value?.email ?? '')
const displayName = computed(() => me.value?.name || email.value)
const initial = computed(() => (displayName.value || '?').slice(0, 1).toUpperCase())
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
async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await supabase.auth.signOut()
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
      <img src="/bd-symbol.svg" alt="" height="13" onerror="this.remove()">
      <span>Iris</span>
    </NuxtLink>
    <nav aria-label="주 메뉴" class="seg">
      <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="['sq', 'seg-item', { on: isOn(n.to) }]">{{ n.label }}</NuxtLink>
    </nav>
  </div>
  <div class="sq float s bar right">
    <button class="field search" type="button" aria-keyshortcuts="Meta+K Control+K" @click="paletteOpen = true">
      <Icon name="search" :size="14" />
      <span>검색</span>
      <kbd class="num">⌘K</kbd>
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
      >{{ initial }}</button>
      <div v-if="menuOpen" id="accountMenu" ref="menuEl" class="menu acct-menu" role="menu" aria-label="계정" @keydown="onMenuKey">
        <div class="who">
          <span class="tx-head ellipsis">{{ me?.name || '이름 없음' }}</span>
          <span class="tx-meta ellipsis">{{ email }}</span>
        </div>
        <div class="sep" role="separator" />
        <button type="button" role="menuitem" class="menu-item" tabindex="-1" @click="openProfile">
          <Icon name="pencil" :size="14" color="var(--sys-color-neutral-600)" />프로필 고치기
        </button>
        <button type="button" role="menuitem" class="menu-item" tabindex="-1" :disabled="signingOut" @click="signOut">
          <Icon name="logout_right" :size="14" color="var(--sys-color-neutral-600)" />{{ signingOut ? '로그아웃하는 중' : '로그아웃' }}
        </button>
      </div>
    </div>
  </div>
  <AppCommandPalette v-model:open="paletteOpen" />
  <AppProfileModal v-model:open="profileOpen" />
</template>

<style scoped>
.bar { position: absolute; top: var(--iris-gap); height: 40px; box-sizing: border-box; display: flex; align-items: center; z-index: 3; }
.left { left: var(--iris-gap); gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-04) 0 var(--ref-spacing-08); }
.right { right: var(--iris-gap); gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-04); }
.brand { display: flex; align-items: center; gap: var(--ref-spacing-04); padding-right: var(--ref-spacing-04); font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-common-black-default); }
.search { min-width: 200px; color: var(--sys-color-neutral-500); }
.search span { flex: 1; text-align: left; }
.search:hover { --sq-overlay: var(--interaction-light-gray-hover); }
.account { position: relative; display: flex; }
.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--sys-color-neutral-800); color: var(--sys-color-common-white-default); display: grid; place-items: center; font-size: 10px; font-weight: 600; text-align: center; }
.avatar:hover, .avatar[aria-expanded='true'] { box-shadow: 0 0 0 2px var(--sys-color-common-white-default), 0 0 0 3px var(--ref-color-gray-900-20); }
.avatar:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--sys-color-common-white-default), 0 0 0 3px var(--sys-color-brand-primary-default); }
.acct-menu { left: auto; right: 0; top: calc(100% + 10px); width: 220px; }
.who { display: flex; flex-direction: column; padding: var(--ref-spacing-04) var(--ref-spacing-06); min-width: 0; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sep { height: 1px; margin: var(--ref-spacing-02) 0; background: var(--iris-line); }
.menu-item:focus-visible { outline: 0; --sq-fill: var(--sys-color-neutral-100); }
.menu-item:disabled { opacity: .5; cursor: default; }
</style>
