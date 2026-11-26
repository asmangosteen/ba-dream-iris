<script setup lang="ts">
import IrisLoading, { IRIS_LOADING_MIN } from '~/components/app/IrisLoading.vue'

/**
 * Iris 에 들어올 때 늘 보이는 로딩 화면(새로 고침 · 주소로 바로 열기 · 데스크탑 앱 시작 · 로그인 직후 — 로그인돼 있어도).
 * - 서버가 그린 첫 화면부터 덮어서 홈이 먼저 깜빡이지 않아요. 한 번 들어온 뒤 화면을 옮길 땐 다시 뜨지 않아요
 * - 로그인 전 화면(웰컴 · 로그인 · 메일 확인)에서는 안 떠요. 거기서 로그인해 안으로 들어올 때 떠요
 * - 편집기(/p/…)는 자기 로딩 화면(단계별 막대)을 쓰니 여기선 띄우지 않아요
 * 단계: 화면 붙이기 55% → 글꼴 85% → 최소 2초(로고 한 바퀴) → 100% → 다 찬 막대를 잠깐 보여 주고 .35s 로 사라져요
 */
const PUBLIC = ['/welcome', '/login', '/confirm']
const route = useRoute()
/** 아직 이번 접속의 로딩 화면을 보여 주지 않았는지(서버 → 브라우저로 그대로 넘어가요) */
const pending = useState('iris-boot', () => true)
const isEditor = (p: string) => p.startsWith('/p/')
const isPublic = (p: string) => PUBLIC.includes(p)
const show = computed(() => pending.value && !isPublic(route.path) && !isEditor(route.path))
const progress = ref(0)
const nuxtApp = useNuxtApp()
let running = false

async function run() {
  if (running) return
  running = true
  // 로고가 돌기 시작한 때: 새로 고침이면 첫 그림(서버가 그린 로딩 화면), 로그인 뒤 들어오면 지금
  const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
  const t0 = nuxtApp.isHydrating && paint != null ? paint : performance.now()
  progress.value = 0.55
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))])
  progress.value = 0.85
  const wait = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))
  await wait(IRIS_LOADING_MIN - 500 - (performance.now() - t0))
  progress.value = 1
  await wait(500)
  pending.value = false
}

onMounted(() => {
  watch(() => route.path, (p) => {
    if (!pending.value) return
    // 편집기로 바로 들어오면 편집기 로딩 화면이 맡아요 — 뒤에 홈 탭으로 옮겨도 다시 띄우지 않아요
    if (isEditor(p)) { pending.value = false; return }
    if (!isPublic(p)) run()
  }, { immediate: true })
})
</script>

<template>
  <Transition name="boot"><IrisLoading v-if="show" class="boot" fixed :progress="progress" /></Transition>
</template>

<style scoped>
/* 탭 막대(z 낮음) · 화면 위를 덮어요. 팝업(.pop-overlay 100)보다는 아래 */
.boot { z-index: 60; }
.boot-leave-active { transition: opacity .35s ease; }
.boot-leave-to { opacity: 0; }
</style>
