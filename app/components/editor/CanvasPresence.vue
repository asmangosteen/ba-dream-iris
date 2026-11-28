<script setup lang="ts">
import type { Peer, PeerCursor } from '~/composables/useRoom'
import type { Viewport } from '~/components/editor/canvas/types'

/**
 * 캔버스 위 함께 보는 중 표시(PRD/16 J-1) — 캔버스와 같은 자리에 덮는 층(누르기는 통과).
 * 다른 사람 커서 + 이름표. 커서 채팅('/')을 치는 중이면 이름표 자리에 말풍선(이름 + 글).
 * 화면 테두리 + '누가 보는 중': 내가 고른 화면을 다른 사람도 고르고 있을 때만(사용자 요청 2026-11-29) —
 * 나(같은 사람의 다른 탭 포함)는 빼고, 여러 명이면 'A, B 님 외 n명이 보는 중'
 */
const props = defineProps<{
  vp: Viewport
  cursors: { peer: Peer; cur: PeerCursor; chat?: string; chatFading?: boolean }[]
  peers: Peer[]
  pageId: string | null
  screens: { id: string; x: number; y: number; width: number; height: number }[]
  /** 내 사람 id(나는 표시하지 않아요) */
  selfId: string
  /** 내가 고른 화면들 */
  selected: string[]
}>()
const sx = (x: number) => props.vp.x + x * props.vp.zoom
const sy = (y: number) => props.vp.y + y * props.vp.zoom
/** 같은 화면을 보는 사람들 → 이름표 글: 고치는 사람이 먼저, 두 명까지 이름 · 나머지는 'n명' */
function label(ps: Peer[]): string {
  const [a, b] = ps
  if (!a) return ''
  if (!b) return a.doing === 'editing' ? tr('{name} is editing', { name: a.name }) : tr('{name} is viewing', { name: a.name })
  if (ps.length === 2) return tr('{a}, {b} are viewing', { a: a.name, b: b.name })
  return tr('{a}, {b} and {n} others are viewing', { a: a.name, b: b.name, n: ps.length - 2 })
}
/** 내가 고른 화면 중 다른 사람도 고른 것: 테두리는 첫 사람 색 */
const marks = computed(() => {
  const out: { key: string; color: string; text: string; s: { x: number; y: number; width: number; height: number } }[] = []
  for (const id of new Set(props.selected)) {
    const s = props.screens.find((x) => x.id === id)
    if (!s) continue
    // 같은 사람이 탭 여러 개면 한 번만(고치는 탭이 있으면 그쪽)
    const by = new Map<string, Peer>()
    for (const p of props.peers) {
      if (p.doing === 'away' || p.pageId !== props.pageId || p.screenId !== id || !p.id || p.id === props.selfId) continue
      const o = by.get(p.id)
      if (!o || (o.doing !== 'editing' && p.doing === 'editing')) by.set(p.id, p)
    }
    const ps = [...by.values()].sort((x, y) => (x.doing === 'editing' ? 0 : 1) - (y.doing === 'editing' ? 0 : 1) || x.since - y.since)
    if (ps.length) out.push({ key: id, color: ps[0]!.color, text: label(ps), s })
  }
  return out
})
</script>

<template>
  <div class="presence" aria-hidden="true">
    <div v-for="m in marks" :key="m.key" class="mark" :style="{ left: sx(m.s.x) + 'px', top: sy(m.s.y) + 'px', width: m.s.width * vp.zoom + 'px', height: m.s.height * vp.zoom + 'px', '--c': m.color }">
      <span class="tag">{{ m.text }}</span>
    </div>
    <div v-for="c in cursors" :key="c.peer.key" class="cur" :style="{ transform: `translate(${sx(c.cur.x)}px, ${sy(c.cur.y)}px)`, '--c': c.peer.color }">
      <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5l13 6.2-5.6 1.6-2 5.4z" :fill="c.peer.color" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" /></svg>
      <span v-if="c.chat" :class="['sq', 'chat', { fading: c.chatFading }]"><span class="who">{{ c.peer.name }}</span>{{ c.chat }}</span>
      <span v-else class="sq name">{{ c.peer.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.presence { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; }
/* 다른 사람이 고른 화면: 2px 사람 색 테두리(화면 바깥), 이름표는 오른쪽 위 바깥 */
.mark { position: absolute; box-shadow: 0 0 0 2px var(--c); }
.tag { position: absolute; right: 0; bottom: calc(100% + 4px); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 16px; font-weight: 500; color: var(--c); }
/* 커서: 화살표 + 이름표. 움직임은 50ms 마다 오니 살짝 이어 줘요 */
.cur { position: absolute; left: 0; top: 0; display: flex; align-items: flex-start; transition: transform .08s linear; will-change: transform; }
/* 화살표 · 이름표 아래 옅은 그림자(흰 바탕 · 화면 위에서도 떠 보이게) */
.cur > svg, .cur > .name, .cur > .chat { filter: drop-shadow(0 1px 2px rgb(3 9 26 / 24%)) drop-shadow(0 2px 6px rgb(3 9 26 / 12%)); }
.name { margin: 14px 0 0 -2px; height: 20px; padding: 0 6px; border-radius: var(--ref-radius-03); --sq-fill: var(--c); color: #FFFFFF; font-size: 11px; line-height: 20px; font-weight: 600; white-space: nowrap; }
/* 커서 채팅 말풍선: 이름표와 같은 자리 · 같은 색, 글이 길면 줄바꿈(최대 240) */
.chat { margin: 14px 0 0 -2px; max-width: 240px; padding: 5px 10px 6px; border-radius: var(--ref-radius-05); --sq-fill: var(--c); color: #FFFFFF; font-size: 13px; line-height: 18px; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; display: flex; flex-direction: column; }
.chat { transition: opacity .5s ease; }
.chat.fading { opacity: 0; }
.chat .who { font-size: 10px; line-height: 14px; font-weight: 600; opacity: .75; }
@media (prefers-reduced-motion: reduce) { .cur { transition: none; } }
</style>
