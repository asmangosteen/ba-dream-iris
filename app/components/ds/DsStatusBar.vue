<script setup lang="ts">
/**
 * Status Bar — 바드림 디자인 시스템 피그마(❖ Status Bar, 2551:9511) 그대로.
 * @ba-dream/design-system 1.0.0 빌드에는 Status Bar 가 빈 자리(render: () => null)라 Iris 캔버스에서 대신 그려요.
 * 시각 · 아이콘은 피그마 원본 벡터(public/ds/status-bar). 패키지에 구현이 들어오면 이 파일은 지워도 돼요.
 */
const props = withDefaults(defineProps<{ os?: 'ios' | 'android'; mode?: 'light' | 'dark'; background?: 'on' | 'off'; time?: string }>(), { os: 'ios', mode: 'light', background: 'off', time: undefined })
const src = (k: string) => `/ds/status-bar/${props.os}-${props.mode}-${k}.svg`
</script>

<template>
  <div class="ds-status-bar" :data-os="os" :data-mode="mode" :data-background="background" aria-hidden="true">
    <template v-if="os === 'ios'">
      <div class="side">
        <span v-if="time" class="time-text">{{ time }}</span>
        <img v-else :src="src('time')" alt="" width="33.328" height="12.576">
      </div>
      <div class="island" />
      <div class="side levels">
        <img :src="src('cell')" alt="" width="19.2" height="12.226">
        <img :src="src('wifi')" alt="" width="17.142" height="12.328">
        <img :src="src('battery')" alt="" width="27.328" height="13">
      </div>
    </template>
    <template v-else>
      <span v-if="time" class="time-text">{{ time }}</span>
      <img v-else :src="src('time')" alt="" width="26.902" height="10.227">
      <div class="right">
        <img :src="src('wifi')" alt="" width="17" height="14.167" class="a-wifi">
        <img :src="src('signal')" alt="" width="14.167" height="14.167" class="a-signal">
        <img :src="src('battery')" alt="" width="8" height="15" class="a-battery">
      </div>
    </template>
  </div>
</template>

<style scoped>
.ds-status-bar { display: flex; align-items: center; box-sizing: border-box; width: 100%; height: 50px; flex: none; }
.ds-status-bar img { display: block; flex: none; }
.ds-status-bar[data-background='on'][data-mode='light'] { background: var(--sys-color-common-white-emphasis); }
.ds-status-bar[data-background='on'][data-mode='dark'] { background: var(--sys-color-common-black-emphasis); }
/* iOS: 3분할(시각 | 다이내믹 아일랜드 자리 125 | 아이콘) + gap 6 */
.ds-status-bar[data-os='ios'] { justify-content: center; gap: 6px; padding: 11px 16px; }
.side { flex: 1 1 0; min-width: 0; height: 22px; display: flex; align-items: center; justify-content: center; }
.levels { gap: 7px; padding-top: 1px; box-sizing: border-box; }
.island { width: 125px; height: 37px; flex: none; }
/* Android: 양끝 정렬 */
.ds-status-bar[data-os='android'] { justify-content: space-between; padding: 10px 24px; }
.right { position: relative; width: 46px; height: 15px; flex: none; }
.right img { position: absolute; }
.a-wifi { left: 0; top: 0.42px; }
.a-signal { left: 17.42px; top: 0.42px; }
.a-battery { left: 38px; top: 0; }
.time-text { font-size: 15px; font-weight: 600; line-height: 1; letter-spacing: -0.2px; color: #000; }
.ds-status-bar[data-mode='dark'] .time-text { color: #fff; }
</style>
