import type { ProjectRow } from './useProjects'
import type { PageRow, ScreenRow } from './useEditor'

/**
 * 개발용 미리보기: 로그인 없이 예시 데이터로 내부 화면을 봅니다.
 * `NUXT_PUBLIC_DEV_PREVIEW=1 npx nuxt dev` 로 켜고, 배포(빌드) 결과물에서는 항상 꺼져 있습니다.
 * 예시 데이터는 화면 확인용이라 DB 에 저장하지 않습니다.
 */
export function useDevPreview(): boolean {
  return import.meta.dev && !!useRuntimeConfig().public.devPreview
}

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export const PREVIEW_PROJECTS: ProjectRow[] = [
  { id: 'preview-1', name: '바드림 앱 리뉴얼', status: 'designing', updated_at: ago(12) },
  { id: 'preview-2', name: '착한구독 신청 플로우', status: 'planning', updated_at: ago(180) },
  { id: 'preview-3', name: '신차구매 상세페이지', status: 'developing', updated_at: ago(60 * 26) },
  { id: 'preview-4', name: '커뮤니티 개편', status: 'planning', updated_at: ago(60 * 24 * 4) },
  { id: 'preview-5', name: '마이 페이지 정리', status: 'done', updated_at: ago(60 * 24 * 40) },
]

/** 미리보기에서 새로 만든 프로젝트의 페이지(프로젝트 id → 페이지). 없으면 예시 페이지(PREVIEW_PAGES) */
export const PREVIEW_PROJECT_PAGES: Record<string, PageRow[]> = {}

export const PREVIEW_PAGES: PageRow[] = [
  { id: 'pg-1', name: '홈 · 내 차고', sort_order: 0 },
  { id: 'pg-2', name: '구독 신청', sort_order: 1 },
  { id: 'pg-3', name: '마이', sort_order: 2 },
]

const frame = (id: string, name: string, col: number, status: ScreenRow['status'] = 'draft'): ScreenRow =>
  ({ id, name, source: col % 2 ? 'figma' : 'native', x: col * 470, y: 0, width: 390, height: 844, status })

/** 예시 화면 안 레이어 (Iris 캔버스 화면만) */
const L = (id: string, type: 'frame' | 'rect' | 'text' | 'image', name: string, parentId: string | null, x: number, y: number, w: number, h: number, style: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, type, name, parentId, x, y, w, h, style, ...extra })
const homeLayers = {
  schemaVersion: 1,
  rootIds: ['h1', 'h2', 'h3', 'h6', 'h7'],
  nodes: {
    h1: L('h1', 'text', '인사', null, 20, 64, 280, 32, { color: '#202837', fontSize: 22, fontWeight: 700, lineHeight: 32, autoWidth: true }, { text: '안녕하세요, 바드림님' }),
    h2: L('h2', 'text', '안내', null, 20, 100, 260, 20, { color: '#8C9199', fontSize: 14, fontWeight: 400, lineHeight: 20, autoWidth: true }, { text: '오늘도 안전 운행하세요' }),
    h3: L('h3', 'frame', '차량 카드', null, 20, 144, 335, 168, { fill: '#2C7BE2', radius: 16, clip: true }, { children: ['h4', 'h5', 'h8'] }),
    h4: L('h4', 'text', '차량 이름', 'h3', 20, 20, 200, 26, { color: '#FFFFFF', fontSize: 18, fontWeight: 600, lineHeight: 26, autoWidth: true }, { text: '모델 A · 24개월' }),
    h5: L('h5', 'text', '결제 안내', 'h3', 20, 50, 240, 20, { color: '#FFFFFF', fontSize: 14, fontWeight: 400, lineHeight: 20, opacity: 0.8, autoWidth: true }, { text: '다음 결제 12월 5일 · 89,000원' }),
    h8: L('h8', 'rect', '배터리 막대', 'h3', 20, 124, 295, 8, { fill: '#FFFFFF', radius: 4, opacity: 0.9 }),
    h6: L('h6', 'rect', '배너', null, 20, 332, 335, 96, { fill: '#F1F2F3', radius: 12 }),
    h7: L('h7', 'rect', '하단 탭', null, 0, 788, 390, 56, { fill: '#FFFFFF', stroke: '#E4E6E8', strokeWidth: 1 }),
  },
}

export const PREVIEW_SCREENS: Record<string, ScreenRow[]> = {
  'pg-1': [{ ...frame('sc-1', '홈', 0, 'approved'), layers: homeLayers }, frame('sc-2', '내 차고', 1, 'review'), frame('sc-3', '차량 상세', 2)],
  'pg-2': [frame('sc-4', '요금제 선택', 0, 'review'), frame('sc-5', '서류 제출', 1), frame('sc-6', '신청 완료', 2)],
  'pg-3': [frame('sc-7', '마이', 0, 'approved'), frame('sc-8', '설정', 1)],
}
