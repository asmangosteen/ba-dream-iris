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
  supabase: { redirect: false, types: '~~/shared/types/database.ts' },
  runtimeConfig: {
    // 서버 전용 (브라우저에 노출되지 않음)
    figmaAccessToken: '',
    public: {
      allowedEmailDomain: 'ba-dream.com',
      devPreview: '',
    },
  },
})
