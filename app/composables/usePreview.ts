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

/** 예시 '요금제 선택' 화면(착한구독 상세 기획서 C-04) — 문서 함께 보기에서 요소 단위 연결을 확인하려고 요소를 넣어 둬요 */
const planLayers = {
  schemaVersion: 1,
  rootIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  nodes: {
    p1: L('p1', 'text', '제목', null, 20, 64, 300, 32, { color: '#202837', fontSize: 22, fontWeight: 700, lineHeight: 32, autoWidth: true }, { text: '요금제를 골라 주세요' }),
    p2: L('p2', 'rect', '기간 탭', null, 20, 112, 350, 44, { fill: '#F1F2F3', radius: 12 }),
    p3: L('p3', 'frame', '12개월 카드', null, 20, 176, 350, 120, { fill: '#FFFFFF', radius: 16, stroke: '#E4E6E8', strokeWidth: 1 }, { children: ['p3t', 'p3p'] }),
    p3t: L('p3t', 'text', '기간', 'p3', 20, 20, 200, 24, { color: '#202837', fontSize: 16, fontWeight: 600, lineHeight: 24, autoWidth: true }, { text: '12개월' }),
    p3p: L('p3p', 'text', '월 구독료', 'p3', 20, 52, 200, 28, { color: '#202837', fontSize: 20, fontWeight: 700, lineHeight: 28, autoWidth: true }, { text: '월 109,000원' }),
    p4: L('p4', 'frame', '24개월 카드', null, 20, 312, 350, 120, { fill: '#F3F8FE', radius: 16, stroke: '#2C7BE2', strokeWidth: 1.5 }, { children: ['p4t', 'p4p', 'p4b'] }),
    p4t: L('p4t', 'text', '기간', 'p4', 20, 20, 200, 24, { color: '#202837', fontSize: 16, fontWeight: 600, lineHeight: 24, autoWidth: true }, { text: '24개월' }),
    p4p: L('p4p', 'text', '월 구독료', 'p4', 20, 52, 200, 28, { color: '#202837', fontSize: 20, fontWeight: 700, lineHeight: 28, autoWidth: true }, { text: '월 89,000원' }),
    p4b: L('p4b', 'rect', '가장 많이 선택 배지', 'p4', 238, 18, 92, 26, { fill: '#2C7BE2', radius: 13 }),
    p5: L('p5', 'frame', '36개월 카드', null, 20, 448, 350, 120, { fill: '#FFFFFF', radius: 16, stroke: '#E4E6E8', strokeWidth: 1 }, { children: ['p5t', 'p5p'] }),
    p5t: L('p5t', 'text', '기간', 'p5', 20, 20, 200, 24, { color: '#202837', fontSize: 16, fontWeight: 600, lineHeight: 24, autoWidth: true }, { text: '36개월' }),
    p5p: L('p5p', 'text', '월 구독료', 'p5', 20, 52, 200, 28, { color: '#202837', fontSize: 20, fontWeight: 700, lineHeight: 28, autoWidth: true }, { text: '월 79,000원' }),
    p6: L('p6', 'rect', '다음 버튼', null, 20, 764, 350, 56, { fill: '#2C7BE2', radius: 14 }),
  },
}

/** 예시: 긴 상세 화면(C-07, 390 × 2400) */
const detailLayers = {
  schemaVersion: 1,
  rootIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10'],
  nodes: {
    d1: L('d1', 'rect', '대표 사진', null, 0, 0, 390, 360, { fill: '#DCE7F7' }),
    d2: L('d2', 'text', '상품 이름', null, 20, 384, 340, 32, { color: '#202837', fontSize: 22, fontWeight: 700, lineHeight: 32, autoWidth: true }, { text: '바드림 모델 A 착한구독' }),
    d3: L('d3', 'text', '가격', null, 20, 424, 340, 28, { color: '#2C7BE2', fontSize: 20, fontWeight: 700, lineHeight: 28, autoWidth: true }, { text: '월 89,000원부터' }),
    d4: L('d4', 'rect', '요금제 요약', null, 20, 480, 350, 200, { fill: '#F6F7F7', radius: 16 }),
    d5: L('d5', 'rect', '혜택 배너', null, 20, 704, 350, 140, { fill: '#EEF4FD', radius: 16 }),
    d6: L('d6', 'rect', '상세 이미지', null, 0, 872, 390, 720, { fill: '#EDEFF1' }),
    d7: L('d7', 'rect', '후기', null, 20, 1620, 350, 320, { fill: '#FFFFFF', radius: 16, stroke: '#E4E6E8', strokeWidth: 1 }),
    d8: L('d8', 'rect', '자주 묻는 질문', null, 20, 1964, 350, 280, { fill: '#F6F7F7', radius: 16 }),
    d9: L('d9', 'rect', '청약 철회 안내', null, 20, 2264, 350, 40, { fill: '#FFF6EC', radius: 8 }),
    d10: L('d10', 'rect', '구독 신청 버튼', null, 20, 2324, 350, 56, { fill: '#2C7BE2', radius: 14 }),
  },
}
/** 예시: 관리자 웹(A-01, 1440 × 900) */
const adminLayers = {
  schemaVersion: 1,
  rootIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
  nodes: {
    a1: L('a1', 'rect', '사이드바', null, 0, 0, 240, 900, { fill: '#1E2430' }),
    a2: L('a2', 'text', '제목', null, 280, 40, 400, 36, { color: '#202837', fontSize: 26, fontWeight: 700, lineHeight: 36, autoWidth: true }, { text: '구독 신청 심사' }),
    a3: L('a3', 'rect', '검색 · 필터', null, 280, 100, 1120, 48, { fill: '#F1F2F3', radius: 10 }),
    a4: L('a4', 'rect', '표 머리', null, 280, 172, 1120, 48, { fill: '#F6F7F7' }),
    a5: L('a5', 'rect', '신청 1', null, 280, 220, 1120, 64, { fill: '#FFFFFF', stroke: '#E4E6E8', strokeWidth: 1 }),
    a6: L('a6', 'rect', '신청 2', null, 280, 284, 1120, 64, { fill: '#FFFFFF', stroke: '#E4E6E8', strokeWidth: 1 }),
    a7: L('a7', 'rect', '신청 3', null, 280, 348, 1120, 64, { fill: '#FFFFFF', stroke: '#E4E6E8', strokeWidth: 1 }),
    a8: L('a8', 'rect', '승인 버튼', null, 1260, 820, 140, 44, { fill: '#2C7BE2', radius: 10 }),
  },
}
/** 예시: 케어샵 태블릿(S-01, 768 × 1024) */
const centerLayers = {
  schemaVersion: 1,
  rootIds: ['s1', 's2', 's3', 's4', 's5', 's6'],
  nodes: {
    s1: L('s1', 'text', '제목', null, 32, 48, 500, 36, { color: '#202837', fontSize: 26, fontWeight: 700, lineHeight: 36, autoWidth: true }, { text: '차량 인도 확인' }),
    s2: L('s2', 'rect', '고객 정보', null, 32, 112, 704, 120, { fill: '#F6F7F7', radius: 16 }),
    s3: L('s3', 'rect', '체크 1', null, 32, 256, 704, 72, { fill: '#FFFFFF', radius: 12, stroke: '#E4E6E8', strokeWidth: 1 }),
    s4: L('s4', 'rect', '체크 2', null, 32, 344, 704, 72, { fill: '#FFFFFF', radius: 12, stroke: '#E4E6E8', strokeWidth: 1 }),
    s5: L('s5', 'rect', '서명', null, 32, 440, 704, 240, { fill: '#F6F7F7', radius: 16 }),
    s6: L('s6', 'rect', '인도 완료 버튼', null, 32, 920, 704, 64, { fill: '#2C7BE2', radius: 14 }),
  },
}
/** 예시: 푸시 알림(N-01, 360 × 96) */
const pushLayers = {
  schemaVersion: 1,
  rootIds: ['n1'],
  nodes: {
    n1: L('n1', 'frame', '알림 카드', null, 0, 0, 360, 96, { fill: '#FFFFFF', radius: 18, stroke: '#E4E6E8', strokeWidth: 1 }, { children: ['n2', 'n3', 'n4'] }),
    n2: L('n2', 'rect', '앱 아이콘', 'n1', 16, 16, 32, 32, { fill: '#2C7BE2', radius: 8 }),
    n3: L('n3', 'text', '제목', 'n1', 60, 16, 280, 20, { color: '#202837', fontSize: 14, fontWeight: 600, lineHeight: 20, autoWidth: true }, { text: '서류 심사가 끝났어요' }),
    n4: L('n4', 'text', '내용', 'n1', 60, 40, 280, 20, { color: '#5B6168', fontSize: 13, fontWeight: 400, lineHeight: 20, autoWidth: true }, { text: '승인됐어요. 인도일을 확인해 주세요' }),
  },
}
/** 예시: 공통 부품 요금제 카드(CMP-01, 350 × 120) */
const cardLayers = {
  schemaVersion: 1,
  rootIds: ['k1'],
  nodes: {
    k1: L('k1', 'frame', '요금제 카드', null, 0, 0, 350, 120, { fill: '#F3F8FE', radius: 16, stroke: '#2C7BE2', strokeWidth: 1.5 }, { children: ['k2', 'k3', 'k4'] }),
    k2: L('k2', 'text', '기간', 'k1', 20, 20, 200, 24, { color: '#202837', fontSize: 16, fontWeight: 600, lineHeight: 24, autoWidth: true }, { text: '24개월' }),
    k3: L('k3', 'text', '월 구독료', 'k1', 20, 52, 200, 28, { color: '#202837', fontSize: 20, fontWeight: 700, lineHeight: 28, autoWidth: true }, { text: '월 89,000원' }),
    k4: L('k4', 'rect', '가장 많이 선택 배지', 'k1', 238, 18, 92, 26, { fill: '#2C7BE2', radius: 13 }),
  },
}
const box = (id: string, name: string, x: number, y: number, width: number, height: number, layers: unknown): ScreenRow => ({ id, name, source: 'native', x, y, width, height, status: 'draft', layers })

export const PREVIEW_SCREENS: Record<string, ScreenRow[]> = {
  'pg-1': [{ ...frame('sc-1', '홈', 0, 'approved'), layers: homeLayers }, frame('sc-2', '내 차고', 1, 'review'), frame('sc-3', '차량 상세', 2)],
  'pg-2': [
    { ...frame('sc-4', '요금제 선택', 0, 'review'), layers: planLayers }, frame('sc-5', '서류 제출', 1), frame('sc-6', '신청 완료', 2),
    box('sc-9', '상품 상세', 1560, 0, 390, 2400, detailLayers),
    box('sc-10', '신청 심사(관리자)', 0, 1000, 1440, 900, adminLayers),
    box('sc-13', '인도 확인(케어샵)', 0, 2160, 768, 1024, centerLayers),
    box('sc-11', '심사 결과 알림', 2070, 0, 360, 96, pushLayers),
    box('sc-12', '요금제 카드', 2070, 200, 350, 120, cardLayers),
  ],
  'pg-3': [frame('sc-7', '마이', 0, 'approved'), frame('sc-8', '설정', 1)],
}
