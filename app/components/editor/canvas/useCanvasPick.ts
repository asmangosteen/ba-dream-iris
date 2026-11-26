import type { ScreenRow } from '~/composables/useEditor'
import { descendants, isGroupNode, isContainer, type LayerNode } from '~/canvas/schema'
import { nodePathIn } from '~/canvas/vector'
import { apply, invert } from '~/canvas/geom'
import type { CanvasBase } from './types'
import type { CanvasGeom } from './useCanvasGeom'
import type { CanvasViewport } from './useCanvasViewport'

type Ctx = CanvasBase & CanvasGeom & CanvasViewport

/** 고르기: 화면 여러 개 · 섞어 고르기, 누르거나 올렸을 때 잡히는 레이어 · 프레임 찾기 */
export function useCanvasPick(canvas: Ctx) {
  const { props, store, multi, mix, isNative, isCanvas, realScreens, worldMat, layerWorld, toWorld } = canvas
  function toggleMulti(id: string) {
    // 레이어를 고른 채 다른 화면을 Shift 클릭: 레이어는 그대로 두고 화면을 함께(피그마와 같아요)
    if (store.layerIds.value.length && store.screenId.value !== id) { mix.value = mix.value.includes(id) ? mix.value.filter((x) => x !== id) : [...mix.value, id]; return }
    const cur = multi.value.length ? multi.value : store.screenId.value && !isPageCanvas(store.screenId.value) && store.screenId.value !== id ? [store.screenId.value] : []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    if (next.length) { store.selectScreen(next[0]!); multi.value = next.length > 1 ? next : [] } else store.selectScreen(null)
  }
  watch(() => store.screenId.value, (id) => { if ((!id || !multi.value.includes(id)) && multi.value.length) multi.value = [] })
  // 섞어 고른 화면 비우기(EditorCanvas.vue 의 mix 설명 참고)
  watch(() => store.screenId.value, () => { if (mix.value.length) mix.value = [] }, { flush: 'sync' })
  watch(() => store.layerIds.value, (now, was) => {
    if (!mix.value.length) return
    // Shift 로 더하거나 뺀 것(한쪽이 다른 쪽을 다 품으면)은 그대로, 새로 고르면 비워요
    const sub = (a: string[], b: string[]) => a.every((x) => b.includes(x))
    if (!now.length || !(sub(was, now) || sub(now, was))) mix.value = []
  }, { flush: 'sync' })
  /** 선택을 바꾸는 일(⌥ 복제 등)을 하는 동안에도 함께 고른 화면은 그대로 */
  function keepMix(fn: () => void) { const saved = [...mix.value]; fn(); mix.value = saved }
  /** 섞어 고른 화면들이 함께 따라갈 자리 */
  const mixCarry = () => mix.value.map((id) => props.screens.find((v) => v.id === id)).filter((v): v is ScreenRow => !!v).map((v) => ({ id: v.id, x: v.x, y: v.y }))

  /** 화면 안 좌표에서, 그 위치를 품는 가장 안쪽 프레임 레이어 */
  function frameAt(sid: string, lx: number, ly: number, exclude?: Set<string>): string | null {
    const d = store.doc(sid)
    let found: string | null = null
    const walk = (ids: string[]) => {
      for (const id of ids) {
        const n = d.nodes[id]
        if (!n || !isContainer(n) || n.hidden || n.locked || exclude?.has(id)) continue
        const p = store.absPos(sid, id)
        // 그룹 · 불리언은 들어갈 곳이 아니에요(피그마와 같아요) — 그룹 안의 프레임은 돼요
        if (lx >= p.x && ly >= p.y && lx <= p.x + n.w && ly <= p.y + n.h) { if (!isGroupNode(n) && n.type !== 'boolean') found = id; if (n.type !== 'boolean') walk(n.children ?? []) }
      }
    }
    walk(d.rootIds)
    return found
  }

  function screenUnder(wx: number, wy: number) {
    return [...realScreens.value].reverse().find((v) => isNative(v) && wx >= v.x && wy >= v.y && wx <= v.x + v.width && wy <= v.y + v.height) ?? null
  }
  /** 포인터 아래가 피그마에서 가져온 화면(그림이라 레이어를 넣을 수 없어요)뿐이면 놓은 뒤 안내 */
  function overFigmaOnly(wx: number, wy: number) {
    return !screenUnder(wx, wy) && realScreens.value.some((v) => !isNative(v) && wx >= v.x && wy >= v.y && wx <= v.x + v.width && wy <= v.y + v.height)
  }
  /**
   * ⌘ 상자 고르기: 상자와 겹치는 가장 안쪽 레이어들. 프레임 · 그룹은 안에서 걸린 게 있으면 그것들, 없으면 상자 안에 다 들어올 때만 그 프레임.
   * 불리언 · 인스턴스는 한 덩어리
   */
  function deepHits(s: ScreenRow, ids: string[], r: { x: number; y: number; width: number; height: number }): string[] {
    const d = store.doc(s.id)
    const out: string[] = []
    for (const id of ids) {
      const n = d.nodes[id]
      if (!n || n.hidden || n.locked) continue
      const b = layerWorld(s, id)
      if (!b || !(b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y)) continue
      if (isContainer(n) && n.type !== 'boolean' && n.children?.length) {
        const sub = deepHits(s, n.children, r)
        if (sub.length) { out.push(...sub); continue }
        if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.width && b.y + b.h <= r.y + r.height) out.push(id)
        continue
      }
      out.push(id)
    }
    return out
  }
  /**
   * 불리언 안쪽 도형 찾기(두 번 누르기): 불리언은 결과 모양 하나로 그려서 안쪽 도형 요소가 없어요 — 누른 자리가 어느 도형 모양 안인지 경로로 재요(맨 위 것부터)
   */
  let hitCtx: CanvasRenderingContext2D | null = null
  function booleanChildAt(screen: ScreenRow, bid: string, cx: number, cy: number, only?: (c: LayerNode) => boolean): string | null {
    const d = store.doc(screen.id)
    const b = d.nodes[bid]
    if (!b?.children?.length) return null
    hitCtx ??= document.createElement('canvas').getContext('2d')
    const w = toWorld(cx, cy)
    for (const k of [...b.children].reverse()) {
      const c = d.nodes[k]
      if (!c || c.hidden || (only && !only(c))) continue
      const p = apply(invert(worldMat(screen, k)), w.x, w.y)
      const path = nodePathIn(d, c, -c.x, -c.y)
      if (path && hitCtx?.isPointInPath(new Path2D(path), p.x, p.y)) return k
      if (!path && p.x >= 0 && p.y >= 0 && p.x <= c.w && p.y <= c.h) return k
    }
    return null
  }
  /**
   * 불리언 안으로 들어가 고르기(피그마와 같아요): 불리언은 모양 하나로 그려져서 누르면 늘 불리언이 잡혀요.
   * - ⌘(가장 안쪽 고르기)이면: 누른 자리의 안쪽 도형
   * - 불리언 안 도형을 이미 골라 둔 상태(불리언이 열린 상태)면: ⇧ · ⌘ · ⌘⇧ · 그냥 누르기 모두 누른 자리의 안쪽 도형
   * 불리언 안에 불리언이 있으면 같은 규칙으로 더 안으로 들어가요
   */
  function diveBoolean(screen: ScreenRow, lid: string | undefined, cx: number, cy: number, deep: boolean): string | undefined {
    if (!lid) return lid
    const d = store.doc(screen.id)
    const sel = store.screenId.value === screen.id ? store.layerIds.value : []
    let cur = lid
    for (let i = 0; i < 8; i++) {
      if (d.nodes[cur]?.type !== 'boolean') break
      const inner = descendants(d, cur)
      if (!deep && !sel.some((id) => id !== cur && inner.includes(id))) break
      const c = booleanChildAt(screen, cur, cx, cy)
      // 안쪽 도형이 없는 자리(불리언 상자 안 빈 곳): 불리언을 잡지 않아요 — 아무것도 안 골라요(피그마와 같아요)
      if (!c) return i === 0 ? undefined : cur
      cur = c
    }
    return cur
  }
  /**
   * 누르거나 올렸을 때 잡히는 레이어(피그마와 같아요): 화면 바로 아래 것부터 — 고른 레이어(와 그 조상) 안쪽, 섹션 안쪽만 한 단계씩 열려요.
   * 프레임 · 그룹 안 레이어는 그 프레임을 고른 뒤 · 두 번 눌러서 · ⌘ 를 누른 채(deep) 잡아요
   */
  function pickLayer(sid: string, deepId: string | undefined, deep = false, selAt?: string[]): string | undefined {
    if (!deepId || deep) return deepId
    const d = store.doc(sid)
    const chain: string[] = []
    for (let id: string | null | undefined = deepId; id && d.nodes[id]; id = d.nodes[id]!.parentId) chain.unshift(id)
    const open = new Set<string>()
    // selAt: 이 선택 기준으로(두 번 누르기는 첫 누름 직전 선택으로 판단해요)
    const selNow = selAt ?? (store.screenId.value === sid ? store.layerIds.value : [])
    for (const id of selNow) for (let p: string | null | undefined = id; p && d.nodes[p]; p = d.nodes[p]!.parentId) open.add(p)
    // 캔버스에 바로 놓인 프레임도 맨 위 프레임이에요(피그마와 같아요): 안을 누르면 안쪽 레이어가 바로 골라져요
    const top = d.nodes[chain[0]!]
    const s0 = isPageCanvas(sid) && chain.length > 1 && top?.type === 'frame' && !isGroupNode(top) ? 1 : 0
    if (s0) open.add(chain[0]!)
    let target = chain[0]
    for (let i = 1; i < chain.length; i++) {
      const parent = d.nodes[chain[i - 1]!]
      if (open.has(chain[i - 1]!) || parent?.type === 'section') target = chain[i]
      else break
    }
    // 부모 → 자식(피그마와 같아요): 화면을 통째로 덮는 레이어(프레임보다 큰 사진 등)는 화면을 먼저 골라요.
    // 화면을 고른 뒤 다시 누르면 그 레이어가 골라져요
    if (target === chain[0]) {
      const scr = props.screens.find((v) => v.id === sid)
      const screenSelected = store.screenId.value === sid && !store.layerIds.value.length
      const b = scr && !isCanvas(scr) && !screenSelected ? layerWorld(scr, target!) : null
      if (scr && b && b.x <= scr.x + 0.5 && b.y <= scr.y + 0.5 && b.x + b.w >= scr.x + scr.width - 0.5 && b.y + b.h >= scr.y + scr.height - 0.5) return undefined
    }
    return target
  }
  return { toggleMulti, keepMix, mixCarry, frameAt, screenUnder, overFigmaOnly, deepHits, booleanChildAt, diveBoolean, pickLayer }
}
export type CanvasPick = ReturnType<typeof useCanvasPick>
