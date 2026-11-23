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

export const PREVIEW_PAGES: PageRow[] = [
  { id: 'pg-1', name: '홈 · 내 차고', sort_order: 0 },
  { id: 'pg-2', name: '구독 신청', sort_order: 1 },
  { id: 'pg-3', name: '마이', sort_order: 2 },
]

const frame = (id: string, name: string, col: number, status: ScreenRow['status'] = 'draft'): ScreenRow =>
  ({ id, name, source: col % 2 ? 'figma' : 'native', x: col * 455, y: 0, width: 375, height: 812, status })

export const PREVIEW_SCREENS: Record<string, ScreenRow[]> = {
  'pg-1': [frame('sc-1', '홈', 0, 'approved'), frame('sc-2', '내 차고', 1, 'review'), frame('sc-3', '차량 상세', 2)],
  'pg-2': [frame('sc-4', '요금제 선택', 0, 'review'), frame('sc-5', '서류 제출', 1), frame('sc-6', '신청 완료', 2)],
  'pg-3': [frame('sc-7', '마이', 0, 'approved'), frame('sc-8', '설정', 1)],
}
