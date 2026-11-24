// Iris — 바드림 디자인 협업 툴 (PRD/04_PROJECT_SPEC.md)
import dsPropsPlugin from './build/ds-props-plugin'

// 링크 미리보기(OG)는 절대 주소가 필요해서 배포 주소를 씁니다
const SITE_URL = 'https://ba-dream-iris.vercel.app'
const DESCRIPTION = 'Design collaboration tool by Ba-dream'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-23',
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase'],
  css: ['~/assets/css/main.css'],
  // virtual:iris-ds-props — 디자인 시스템 컴포넌트 속성 목록을 빌드 때 d.ts 에서 만듭니다(저장소에 넣지 않아요)
  vite: { plugins: [dsPropsPlugin()] },
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'Iris',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: DESCRIPTION },
        // 링크 공유 미리보기 — 썸네일은 랜딩(/welcome) 다크 모드의 3D 로고(배경 black-default #03091A)
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Iris' },
        { property: 'og:locale', content: 'ko_KR' },
        { property: 'og:title', content: 'Iris' },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:url', content: SITE_URL },
        { property: 'og:image', content: `${SITE_URL}/og-dark.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Iris logo' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Iris' },
        { name: 'twitter:description', content: DESCRIPTION },
        { name: 'twitter:image', content: `${SITE_URL}/og-dark.png` },
      ],
      // 파비콘: design/logo/favicon.mjs 로 만듦 (진한 타일 · 코너 스무딩 60%)
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
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
