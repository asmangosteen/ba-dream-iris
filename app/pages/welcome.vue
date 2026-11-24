<script setup lang="ts">
import { Button } from '@ba-dream/design-system'

/**
 * 랜딩: 로그인 전에 보는 첫 화면. 흰 바탕 가운데 브러시드 스틸 Iris 로고(3D) 하나.
 * - 끌어서 360도 돌리기, 위아래 스크롤로 커서 위치 기준 확대 · 축소
 * - 처음 모습에서 바뀌면 Reset 이 나타나고, 누르면 처음 자세 · 크기로
 * - 위: 워드마크 · Sign in(→ /login), 아래: Reset · 저작권 · 회사 링크
 * - 오른쪽 아래: 라이트 · 다크 토글. 다크 배경은 black-default(#03091A). 고른 모드는 로그인 · 안쪽 화면에도 그대로
 */
// 랜딩 ↔ 로그인은 스르륵 바뀜 (main.css 의 iris-fade)
definePageMeta({ pageTransition: { name: 'iris-fade', mode: 'out-in' } })

useHead({ title: 'Iris' })
const { theme, setTheme } = usePublicTheme()

// 바닥 그림자: 흰 바탕엔 검정, 다크(black-default) 바탕엔 밝은 색으로 — 라이트와 같은 느낌으로 보이게
const SHADOW = { light: { shadowColor: 0x000000, shadow: 0.1 }, dark: { shadowColor: 0xFFFFFF, shadow: 0.18 } } as const
watch(theme, (t) => iris?.setShadow(SHADOW[t].shadowColor, SHADOW[t].shadow))

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
    ...SHADOW[theme.value],
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
  <div class="landing" :class="theme">
    <div ref="stage" class="stage" :class="{ ready }" :aria-label="tr('Iris 3D logo. Drag to rotate, scroll to resize')" />
    <span class="loading cap" :class="{ done: ready }" aria-hidden="true">{{ pct }}%</span>

    <header class="top">
      <IrisLogo kind="horizontal" :height="20" :theme="theme" />
      <Button size="l" type="tertiary" contents="text-icon" icon-name="arrow_right" @click="navigateTo('/login')">Sign in</Button>
    </header>

    <div class="bottom">
      <Button class="reset" :class="{ on: changed }" :aria-hidden="!changed" :tabindex="changed ? 0 : -1" size="l" type="tertiary" contents="icon-text" icon-name="refresh" @click="iris?.reset()">Reset</Button>
      <p class="copy cap">© 2026 CYCLOID.CORP. All rights reserved.</p>
      <nav class="links cap" :aria-label="tr('Company website')">
        <a href="https://cycloid-corp.vercel.app/" target="_blank" rel="noopener">CYCLOID</a>
        <span aria-hidden="true">・</span>
        <a href="https://ba-dream.com" target="_blank" rel="noopener">Ba-dream</a>
      </nav>
    </div>

    <!-- 오른쪽 아래: 화면 모드 -->
    <div class="sq mode" role="radiogroup" aria-label="Appearance">
      <button v-for="t in (['light', 'dark'] as const)" :key="t" type="button" role="radio" :aria-checked="theme === t" :aria-label="t === 'light' ? 'Light mode' : 'Dark mode'" :title="t === 'light' ? 'Light' : 'Dark'" :class="['sq', 'mode-item', { on: theme === t }]" @click="setTheme(t)">
        <ThemeIcon :name="t" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.landing { position: fixed; inset: 0; overflow: hidden; background: var(--sys-color-common-white-default); color: var(--sys-color-neutral-800); transition: background-color 0.3s ease; }
.landing.dark { background: var(--iris-black); }

.stage { position: absolute; inset: 0; opacity: 0; transition: opacity 1.2s ease; }
.stage.ready { opacity: 1; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; outline: none; }
.cap { font-size: var(--typography-caption-1-size); line-height: var(--typography-caption-1-line-height); letter-spacing: var(--typography-caption-1-letter-spacing); }
.loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--sys-color-neutral-500); font-variant-numeric: tabular-nums; pointer-events: none; transition: opacity 0.4s ease; }
.loading.done { opacity: 0; }

.top { position: absolute; z-index: 2; inset: 0 0 auto; height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 40px; pointer-events: none; }
.top > * { pointer-events: auto; }

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

/* 화면 모드 토글: 아이콘 두 칸, 고른 칸만 떠 보이게 */
.mode { position: absolute; z-index: 2; right: 40px; bottom: 28px; display: flex; gap: 2px; padding: 2px; border-radius: var(--ref-radius-05); --sq-fill: var(--ref-color-gray-900-5); }
.mode-item { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--ref-radius-04); background: none; color: var(--sys-color-neutral-500); cursor: pointer; transition: color var(--bd-motion-hover) ease; }
.mode-item:hover { color: var(--sys-color-neutral-700); }
.mode-item.on { --sq-fill: var(--sys-color-common-white-emphasis); color: var(--sys-color-neutral-800); filter: drop-shadow(0 1px 1px var(--ref-color-gray-900-10)); }
.dark .mode-item.on { --sq-fill: var(--ref-color-gray-900-10); filter: none; }
.mode-item:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }

@media (max-width: 760px) {
  .top { height: 60px; padding: 0 16px; }
  /* 좁은 화면: 가운데 문구가 오른쪽 아래 토글과 겹치지 않게 토글 위로 */
  .bottom { bottom: 64px; }
  .copy { margin-top: 20px; }
  .mode { right: 16px; bottom: 16px; }
}
@media (prefers-reduced-motion: reduce) { .stage, .loading, .reset, .landing { transition: none; } }
</style>
