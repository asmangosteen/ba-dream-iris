// Iris — 바드림 디자인 협업 툴 (PRD/04_PROJECT_SPEC.md)
export default defineNuxtConfig({
  compatibilityDate: '2026-11-23',
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Iris',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  // 로그인 · 도메인 확인은 app/middleware/auth.global.ts 한 곳에서 합니다
  supabase: {
    redirect: false,
    types: '~~/shared/types/database.ts',
    // 로그인 유지 규칙(PRD/06_AUTH_SESSION.md): 마지막으로 쓴 날부터 30일. 쓰는 동안 토큰이 갱신될 때마다 쿠키 기한도 다시 30일로 늘어납니다
    cookieOptions: { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', secure: true },
  },
  runtimeConfig: {
    // 서버 전용 (브라우저에 노출되지 않음)
    figmaAccessToken: '',
    figmaToken: '', // NUXT_FIGMA_TOKEN — figmaAccessToken 의 별칭(둘 중 하나만 채우면 됩니다)
    public: {
      allowedEmailDomain: 'ba-dream.com',
      devPreview: '',
    },
  },
})
