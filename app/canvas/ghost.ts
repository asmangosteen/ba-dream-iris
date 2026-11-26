import type { ComputedRef, InjectionKey } from 'vue'

/** 화면 밖으로 끄는 중인 레이어(캔버스가 맨 위에 따로 그려요) — 원래 자리의 LayerView 는 숨겨요 */
export const GHOST_KEY: InjectionKey<ComputedRef<{ sid: string; ids: Set<string> } | null>> = Symbol('iris-ghost')

/**
 * 캔버스 배율 — 확대해도 같은 크기로 보여야 하는 것(섹션 이름표)만 받아 써요.
 * .world 에 --z 를 두면 상속 값이라 확대할 때마다 모든 레이어의 스타일을 다시 계산해서(레이어 2천 개에 한 번 14ms) 쓰는 곳에만 줘요
 */
export const ZOOM_KEY: InjectionKey<ComputedRef<number>> = Symbol('iris-zoom')
