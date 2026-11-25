<script lang="ts">
/** 로딩 화면을 보여 줄 최소 시간(ms) — 로고가 딱 한 바퀴(회전 2s 와 같아요). 쓰는 곳에서 이만큼은 띄워 두세요 */
export const IRIS_LOADING_MIN = 2000
</script>

<script setup lang="ts">
/**
 * Iris 공용 로딩 화면(편집기 새로 고침 · 처음 열 때 등, 필요한 곳 어디서나 — 피그마처럼):
 * 가운데 Iris 심볼이 입체로 2초에 한 바퀴 돌고, 아래 막대가 차올라요.
 * - 쓰는 법: 덮을 영역(position: relative)에 넣으면 그 영역을 꽉 덮어요. fixed 를 주면 화면 전체(탭 막대 아래부터)를 덮어요.
 *   사라질 땐 <Transition> 으로 .35s 옅어지게(편집기 index.vue 의 .ld-leave-* 참고), 최소 IRIS_LOADING_MIN 은 보여 주세요
 * - progress(0~1): 단계별로 올리면 그 값까지 부드럽게 차요. 주지 않으면 막대가 왼쪽에서 오른쪽으로 계속 흘러요(얼마나 남았는지 모를 때)
 * - 입체: 같은 심볼을 0.6px 간격으로 겹쳐 두께를 만들고 Y축으로 돌려요(three.js 없이 CSS 만 — 로딩을 늦추지 않게)
 * - 움직임 줄이기: 돌지 않고 막대만
 */
defineProps<{ progress?: number; fixed?: boolean }>()
const P1 = 'M2.898 99.355Q1.953 100.697 2.724 99.247L14.812 76.512Q16.508 73.323 19.447 75.423L35.012 86.551Q36.971 87.952 34.708 88.775L28.659 90.977Q26.396 91.801 24.642 90.15L16.777 82.75Q15.461 81.512 14.421 82.989Z'
const P2 = 'M2.572 99.176Q1.953 100.697 2.378 99.111L15.644 49.603Q17.004 44.528 21.278 47.583L61.138 76.081Q63.988 78.118 60.696 79.316L51.41 82.696Q48.118 83.894 45.567 81.494L21.597 58.942Q19.683 57.141 18.693 59.575Z'
const P3 = 'M2.214 99.076Q1.953 100.697 2.01 99.056L5.325 4.149Q5.554 -2.415 10.897 1.405L96.348 62.497Q99.91 65.044 95.796 66.541L79.25 72.563Q75.136 74.061 71.947 71.061L17.701 20.024Q15.309 17.773 14.787 21.016Z'
const PATHS = [P1, P2, P3]
/** 두께 층(앞면과 뒷면 사이) */
const DEPTH = [1, 2, 3, 4, 5]
</script>

<template>
  <div :class="['ld', { fixed }]" role="progressbar" :aria-label="tr('Loading')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progress == null ? undefined : Math.round(progress * 100)">
    <div class="stage" aria-hidden="true">
      <div class="coin">
        <!-- 뒷면 · 두께 · 앞면 -->
        <svg class="face back" viewBox="0 0 100 100" :style="{ transform: `translateZ(${-(DEPTH.length + 1) * 0.6}px)` }"><path v-for="(d, i) in PATHS" :key="i" :d="d" class="base" /></svg>
        <svg v-for="k in DEPTH" :key="k" class="face edge" viewBox="0 0 100 100" :style="{ transform: `translateZ(${-k * 0.6}px)` }"><path v-for="(d, i) in PATHS" :key="i" :d="d" /></svg>
        <svg class="face front" viewBox="0 0 100 100">
          <defs>
            <clipPath id="ld-fold-1"><path d="M-26.184 407.253L58.154 -252.418L709.635 -169.128L625.298 490.544Z" /></clipPath>
            <clipPath id="ld-fold-2"><path d="M87.928 378.364L-51.241 -276.695L591.204 -413.185L730.374 241.874Z" /></clipPath>
            <clipPath id="ld-fold-3"><path d="M158.19 313.453L-137.327 -298.095L454.033 -583.856L749.55 27.692Z" /></clipPath>
          </defs>
          <template v-for="(d, i) in PATHS" :key="i">
            <path :d="d" class="base" />
            <path :d="d" class="fold" :clip-path="`url(#ld-fold-${i + 1})`" />
          </template>
        </svg>
      </div>
    </div>
    <div class="trk" aria-hidden="true">
      <i v-if="progress == null" class="fill flow" />
      <i v-else class="fill" :style="{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }" />
    </div>
  </div>
</template>

<style scoped>
.ld { --lg-base: #8C9199; --lg-fold: #202837; --lg-edge: #6B7079; position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; background: var(--iris-canvas); pointer-events: auto; }
:root[data-theme="dark"] .ld { --lg-fold: #FDFDFD; --lg-edge: #4A4F57; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .ld { --lg-fold: #FDFDFD; --lg-edge: #4A4F57; } }
.stage { width: 44px; height: 44px; perspective: 320px; }
.coin { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; animation: ld-spin 2s cubic-bezier(.45, 0, .25, 1) infinite; }
.face { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.base { fill: var(--lg-base); }
.fold { fill: var(--lg-fold); }
.edge path { fill: var(--lg-edge); }
.back .base { fill: var(--lg-edge); }
/* 2초에 한 바퀴(최소 로딩 시간 2초와 같아요): 천천히 출발해 돌고 정면에서 잠깐 쉬어요 — 계속 같은 속도로 돌면 어지러워요 */
@keyframes ld-spin {
  0% { transform: rotateY(0deg) rotateX(8deg); }
  85%, 100% { transform: rotateY(360deg) rotateX(8deg); }
}
/* 막대: 120 × 4, 바탕 옅은 회색(캔버스 위에서 보이게) · 채움 진한 회색 — 값이 오르면 부드럽게 차요 */
.trk { width: 120px; height: 4px; border-radius: 2px; overflow: hidden; background: var(--sys-color-neutral-200, #E5E7EB); }
.fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--sys-color-neutral-800); transform-origin: 0 50%; transform: scaleX(0); transition: transform .45s cubic-bezier(.2, .7, .2, 1); }
.ld.fixed { position: fixed; inset: var(--iris-tabs-h, 0px) 0 0 0; }
/* 얼마나 남았는지 모를 때: 40% 막대가 왼쪽에서 오른쪽으로 계속 흘러요 */
.fill.flow { width: 40%; transform: none; transition: none; animation: ld-flow 1.2s cubic-bezier(.45, 0, .25, 1) infinite; }
@keyframes ld-flow { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (prefers-reduced-motion: reduce) { .coin { animation: none; transform: rotateX(0); } .fill.flow { animation: none; width: 100%; opacity: .4; } }
</style>
