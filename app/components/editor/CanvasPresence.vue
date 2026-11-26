<script setup lang="ts">
import type { Peer, PeerCursor } from '~/composables/useRoom'
import type { Viewport } from '~/components/editor/canvas/types'

/**
 * 캔버스 위 함께 보는 중 표시(PRD/16 J-1) — 캔버스와 같은 자리에 덮는 층(누르기는 통과).
 * 다른 사람 커서 + 이름표, 그 사람이 고른 화면 테두리 + 'OO is editing' 이름표. 모두 사람 색.
 */
const props = defineProps<{
  vp: Viewport
  cursors: { peer: Peer; cur: PeerCursor }[]
  peers: Peer[]
  pageId: string | null
  screens: { id: string; x: number; y: number; width: number; height: number }[]
}>()
const sx = (x: number) => props.vp.x + x * props.vp.zoom
const sy = (y: number) => props.vp.y + y * props.vp.zoom
/** 다른 사람이 고른 화면(같은 페이지) — 화면마다 첫 사람만 */
const marks = computed(() => {
  const out: { peer: Peer; s: { x: number; y: number; width: number; height: number } }[] = []
  const seen = new Set<string>()
  for (const p of props.peers) {
    if (p.doing === 'away' || p.pageId !== props.pageId || !p.screenId || seen.has(p.screenId)) continue
    const s = props.screens.find((x) => x.id === p.screenId)
    if (!s) continue
    seen.add(p.screenId)
    out.push({ peer: p, s })
  }
  return out
})
</script>

<template>
  <div class="presence" aria-hidden="true">
    <div v-for="m in marks" :key="m.peer.key" class="mark" :style="{ left: sx(m.s.x) + 'px', top: sy(m.s.y) + 'px', width: m.s.width * vp.zoom + 'px', height: m.s.height * vp.zoom + 'px', '--c': m.peer.color }">
      <span class="tag">{{ m.peer.doing === 'editing' ? tr('{name} is editing', { name: m.peer.name }) : tr('{name} is viewing', { name: m.peer.name }) }}</span>
    </div>
    <div v-for="c in cursors" :key="c.peer.key" class="cur" :style="{ transform: `translate(${sx(c.cur.x)}px, ${sy(c.cur.y)}px)`, '--c': c.peer.color }">
      <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5l13 6.2-5.6 1.6-2 5.4z" :fill="c.peer.color" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" /></svg>
      <span class="sq name">{{ c.peer.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.presence { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; }
/* 다른 사람이 고른 화면: 2px 사람 색 테두리(화면 바깥), 이름표는 오른쪽 위 바깥 */
.mark { position: absolute; box-shadow: 0 0 0 2px var(--c); }
.tag { position: absolute; right: 0; bottom: calc(100% + 4px); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 16px; font-weight: 500; color: var(--c); }
/* 커서: 화살표 + 이름표. 움직임은 50ms 마다 오니 살짝 이어 줘요 */
.cur { position: absolute; left: 0; top: 0; display: flex; align-items: flex-start; transition: transform .08s linear; will-change: transform; }
/* 화살표 · 이름표 아래 옅은 그림자(흰 바탕 · 화면 위에서도 떠 보이게) */
.cur > svg, .cur > .name { filter: drop-shadow(0 1px 2px rgb(3 9 26 / 24%)) drop-shadow(0 2px 6px rgb(3 9 26 / 12%)); }
.name { margin: 14px 0 0 -2px; height: 20px; padding: 0 6px; border-radius: var(--ref-radius-03); --sq-fill: var(--c); color: #FFFFFF; font-size: 11px; line-height: 20px; font-weight: 600; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .cur { transition: none; } }
</style>
