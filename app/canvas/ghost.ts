import type { ComputedRef, InjectionKey } from 'vue'

/** 화면 밖으로 끄는 중인 레이어(캔버스가 맨 위에 따로 그려요) — 원래 자리의 LayerView 는 숨겨요 */
export const GHOST_KEY: InjectionKey<ComputedRef<{ sid: string; ids: Set<string> } | null>> = Symbol('iris-ghost')
