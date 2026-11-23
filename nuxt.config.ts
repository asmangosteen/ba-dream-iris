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
    // 로그인 쿠키 기한은 @supabase/ssr 가 400일로 고정합니다(maxAge 설정은 무시됨).
    // 30일 쉬면 다시 인증하는 규칙은 app/middleware/auth.global.ts 가 맡습니다 — PRD/06_AUTH_SESSION.md
    cookieOptions: { sameSite: 'lax', secure: true },
  },
  // 서버 함수를 Supabase(서울)와 같은 서울 지역(icn1)에서 돌립니다. 기본값(미국 동부)이면 로그인 확인 · DB 조회마다 태평양을 오갑니다
  nitro: { vercel: { functions: { regions: ['icn1'] } } },
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
