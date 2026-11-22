// 로그인 · 도메인 확인을 한곳에서 합니다. DB 쪽에서도 같은 규칙(가입 트리거 + RLS)으로 막습니다.
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const domain = useRuntimeConfig().public.allowedEmailDomain

  if (to.path === '/login') {
    if (user.value) return navigateTo('/')
    return
  }
  if (!user.value) return navigateTo('/login')

  const email = (user.value.email ?? '').toLowerCase()
  if (!email.endsWith('@' + domain)) {
    await useSupabaseClient().auth.signOut()
    return navigateTo('/login?blocked=1')
  }
})
