// 로그인 · 도메인 확인 · 로그인 유지 기간을 한곳에서 합니다. DB 쪽에서도 같은 규칙(가입 트리거 + RLS)으로 막습니다.
// 로그인 유지 규칙: PRD/06_AUTH_SESSION.md — 마지막으로 쓴 날부터 30일
const IDLE_DAYS = 30
const LAST_SEEN = 'iris-last-seen'

export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const domain = useRuntimeConfig().public.allowedEmailDomain
  // Supabase 로그인 쿠키는 라이브러리가 400일로 고정해서, 마지막 사용 시각을 따로 남겨 쉰 기간을 잽니다
  const lastSeen = useCookie<number | null>(LAST_SEEN, { maxAge: 60 * 60 * 24 * 400, sameSite: 'lax', secure: !import.meta.dev })

  if (useDevPreview()) return
  if (to.path === '/confirm') return
  // 랜딩(로그인 전 첫 화면): 로그인돼 있으면 바로 프로젝트 홈으로(들어올 때 로딩 화면 — AppBoot). Sign in 을 누르면 /login
  if (to.path === '/welcome') {
    if (user.value) return navigateTo('/')
    return
  }
  if (to.path === '/login') {
    if (user.value) return navigateTo('/')
    return
  }
  if (!user.value) return navigateTo('/welcome')

  const email = (user.value.email ?? '').toLowerCase()
  if (!email.endsWith('@' + domain)) {
    await useSupabaseClient().auth.signOut()
    return navigateTo('/login?blocked=1')
  }

  // 30일 넘게 쓰지 않았으면 이 기기에서 로그아웃하고 다시 메일 인증
  const now = Date.now()
  if (lastSeen.value && now - Number(lastSeen.value) > IDLE_DAYS * 24 * 60 * 60 * 1000) {
    lastSeen.value = null
    await useSupabaseClient().auth.signOut({ scope: 'local' })
    return navigateTo('/login?expired=1')
  }
  // 쿠키 쓰기를 줄이려고 한 시간에 한 번만 갱신 (처음이면 지금으로 시작)
  if (!lastSeen.value || now - Number(lastSeen.value) > 60 * 60 * 1000) lastSeen.value = now
})
