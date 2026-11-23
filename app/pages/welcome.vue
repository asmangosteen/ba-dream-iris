<script setup lang="ts">
import { Button } from '@ba-dream/design-system'

/**
 * 랜딩: 로그인 전에 보는 첫 화면. 흰 바탕 가운데 브러시드 스틸 Iris 로고(3D) 하나.
 * - 끌어서 360도 돌리기, 위아래 스크롤로 커서 위치 기준 확대 · 축소
 * - 처음 모습에서 바뀌면 Reset 이 나타나고, 누르면 처음 자세 · 크기로
 * - 위: 워드마크 · Sign in(→ /login), 아래: Reset · 저작권 · 회사 링크
 * - 항상 밝은 화면 (금속 조명이 흰 바탕 기준)
 */
// 랜딩 ↔ 로그인은 스르륵 바뀜 (main.css 의 iris-fade)
definePageMeta({ pageTransition: { name: 'iris-fade', mode: 'out-in' } })

useHead({
  title: 'Iris',
  htmlAttrs: { 'data-theme': 'light' },
  meta: [{ name: 'color-scheme', content: 'light' }],
})

const stage = ref<HTMLElement | null>(null)
const pct = ref(0)
const ready = ref(false)
const changed = ref(false) // 처음 모습에서 바뀌면 Reset 이 나타남
let iris: Awaited<ReturnType<typeof import('~/landing/irisSteel').mountIrisSteel>> | null = null
let gone = false

onMounted(async () => {
  const { mountIrisSteel } = await import('~/landing/irisSteel')
  if (gone || !stage.value) return
  const small = innerWidth < 760
  iris = await mountIrisSteel(stage.value, {
    url: '/landing/iris-steel.glb.gz',
    frame: small ? 6.6 : 7.1,
    camY: -0.45,
    rest: [-0.15, 0.08],
    exposure: 1.45,
    env: 3,
    zoomMin: 0.55,
    zoomMax: 4.5,
    onChange: (v) => { changed.value = v },
    onProgress: (p) => {
      pct.value = Math.round(p * 100)
      if (p >= 1) ready.value = true
    },
  })
  if (gone) iris.dispose()
})
onBeforeUnmount(() => {
  gone = true
  iris?.dispose()
})
</script>

<template>
  <div class="landing">
    <div ref="stage" class="stage" :class="{ ready }" aria-label="Iris 3D 로고. 끌어서 돌리고, 스크롤해서 크기를 바꿀 수 있어요" />
    <span class="loading cap" :class="{ done: ready }" aria-hidden="true">{{ pct }}%</span>

    <header class="top">
      <img src="/logo/iris-logo-horizontal.svg" alt="Iris" height="20" width="49">
      <Button size="l" type="tertiary" contents="text-icon" icon-name="arrow_right" @click="navigateTo('/login')">Sign in</Button>
    </header>

    <div class="bottom">
      <Button class="reset" :class="{ on: changed }" :aria-hidden="!changed" :tabindex="changed ? 0 : -1" size="l" type="tertiary" contents="icon-text" icon-name="refresh" @click="iris?.reset()">Reset</Button>
      <p class="copy cap">© 2026 CYCLOID.CORP. All rights reserved.</p>
      <nav class="links cap" aria-label="회사 홈페이지">
        <a href="https://cycloid-corp.vercel.app/" target="_blank" rel="noopener">CYCLOID</a>
        <span aria-hidden="true">・</span>
        <a href="https://ba-dream.com" target="_blank" rel="noopener">Ba-dream</a>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.landing { position: fixed; inset: 0; overflow: hidden; background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); }

.stage { position: absolute; inset: 0; opacity: 0; transition: opacity 1.2s ease; }
.stage.ready { opacity: 1; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; outline: none; }
.cap { font-size: var(--typography-caption-1-size); line-height: var(--typography-caption-1-line-height); letter-spacing: var(--typography-caption-1-letter-spacing); }
.loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--sys-color-neutral-500); font-variant-numeric: tabular-nums; pointer-events: none; transition: opacity 0.4s ease; }
.loading.done { opacity: 0; }

.top { position: absolute; z-index: 2; inset: 0 0 auto; height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; pointer-events: none; }
.top > * { pointer-events: auto; }
.top img { display: block; height: 20px; width: auto; }

/* 아래 가운데: Reset → 저작권 → 회사 링크 */
.bottom { position: absolute; z-index: 2; left: 0; right: 0; bottom: 28px; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.bottom > * { pointer-events: auto; }
/* 처음엔 숨겨 두고, 로고를 돌리거나 크기 · 위치를 바꾸면 스르륵 나타남 (Reset 하면 다시 사라짐) */
.reset { opacity: 0; transform: translateY(6px); visibility: hidden; transition: opacity 0.45s ease, transform 0.45s ease, visibility 0s linear 0.45s; }
.reset.on { opacity: 1; transform: none; visibility: visible; transition-delay: 0s; }
/* 디자인 시스템엔 화살표 하나짜리 회전 아이콘이 없어서, Button 구조는 그대로 두고 아이콘 모양만 같은 굵기로 바꿈 */
.reset :deep(.bd-icon svg) { visibility: hidden; }
.reset :deep(.bd-icon) {
  --rotate-icon: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M15.87 7.86A6.25 6.25 0 1 1 11.6 3.95' stroke='black' stroke-width='1.67' stroke-linecap='round'/><path d='M11.05 1.6 14.5 4.35l-3.9 1.75z' fill='black' stroke='black' stroke-width='0.6' stroke-linejoin='round'/></svg>");
  background-color: currentColor;
  -webkit-mask: var(--rotate-icon) center / contain no-repeat;
  mask: var(--rotate-icon) center / contain no-repeat;
}
.copy { margin: 28px 0 0; color: var(--sys-color-neutral-500); }
.links { margin-top: 4px; display: flex; align-items: center; gap: 1px; color: var(--sys-color-neutral-500); }
.links a { color: var(--sys-color-neutral-600); text-underline-offset: 3px; }
.links a:hover { text-decoration: underline; }
.links a:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; border-radius: var(--ref-radius-02); }

@media (max-width: 760px) {
  .top { height: 60px; padding: 0 16px; }
  .bottom { bottom: 20px; }
  .copy { margin-top: 20px; }
}
@media (prefers-reduced-motion: reduce) { .stage, .loading, .reset { transition: none; } }
</style>
