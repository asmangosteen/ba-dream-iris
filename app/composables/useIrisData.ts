/**
 * 문서 · 요구사항 · 화면 연결 · 디자인 시스템 데이터.
 * 실제 모드에서는 Supabase(RLS: 멤버만)에서 읽고 쓰고, 개발용 미리보기에서는 아래 예시 데이터를 useState 에 담아 씁니다
 * (미리보기에서 바꾼 값은 새로고침하면 처음으로 돌아갑니다).
 */

import type { Aliases, CheckResult, FormatBlock, FormatResult, Mark, SlotKind } from '~/utils/docFormat'
import { analyzeDoc, compareCodes, parseMarkdown, slotFromName, toCheckResult } from '~/utils/docFormat'

export type DocCategory = 'planning' | 'dev' | 'design' | 'etc'
export type DocSource = 'native' | 'upload' | 'link'
/** 문서 블록: 제목 · 문단 · 목록 · 표(rows, 첫 줄이 머리) — utils/docFormat.ts */
export type DocBlock = FormatBlock
export type DocStatus = 'draft' | 'review' | 'confirmed'
export interface DocRow {
  id: string
  project_id: string
  title: string
  category: DocCategory
  source_type: DocSource
  content_blocks: DocBlock[] | null
  file_path: string | null
  file_type: 'pdf' | 'docx' | 'md' | null
  url: string | null
  plain_text: string | null
  fetch_status: 'ok' | 'failed' | 'manual' | null
  version_label: string | null
  updated_at: string
  /** 문서 약어(ID 가 겹치면 '몰 C-05'), 상태, 양식 검사 결과 — 3단계 */
  abbr?: string | null
  status?: DocStatus
  check_result?: CheckResult | null
}

export type ReqPriority = 'must' | 'should' | 'could'
export interface ReqRow {
  id: string
  project_id: string
  document_id: string
  code: string
  title: string
  body: string | null
  anchor: { block?: string; row?: number | null } | null
  priority: ReqPriority | null
  origin: 'auto_pattern' | 'doc_table' | 'manual' | 'ai'
  /** P-ORD-05 의 ORD */
  area?: string | null
  marks?: Mark[]
  /** 화면 없는 정책(반영률에서 빼요) */
  has_screen?: boolean
  /** 문서에서 빠진 시각(지우지 않고 표시) */
  removed_at?: string | null
}

export type LinkStatus = 'unchecked' | 'reflected' | 'partial' | 'missing' | 'na'
export interface LinkRow { screen_id: string; requirement_id: string; status: LinkStatus; note: string | null; layer_ids?: string[] | null; origin?: 'doc_table' | 'figma_desc' | 'manual' | 'ai' }

/** 화면 칸: 기획서 화면 표의 한 행(C-05 상품 상세). 디자인(screens.slot_id)이 여기에 붙어요 */
export interface SlotRow {
  id: string
  project_id: string
  document_id: string
  code: string
  kind: SlotKind
  name: string
  spec: string | null
  states: string[]
  policy_codes: string[]
  anchor: { block?: string; row?: number | null } | null
  removed_at: string | null
}
/** 프로젝트 화면(페이지를 가로질러) + 붙은 화면 칸 */
export interface ProjectScreen { id: string; name: string; page_id: string; page: string; slot_id: string | null; slot_state: string | null }

export interface ComponentRow {
  id: string
  name: string
  code_name: string | null
  category: string
  description: string | null
  match_aliases: string[] | null
  props_schema: Record<string, string[] | 'text' | 'boolean'> | null
}
export type TokenType = 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'
export interface TokenRow { id: string; type: TokenType; name: string; value: string; description: string | null }
export interface UsageRow { id: string; screen_id: string; component_id: string | null; detected_name: string; count: number }

// 라벨은 영어 원문(사전 열쇠)이에요. 보여 줄 때 tr(DOC_CATEGORY_LABEL[k]) 처럼 감싸 주세요(한국어는 app/i18n/ko/docs.ts)
export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = { planning: 'Planning', dev: 'Development', design: 'Design', etc: 'Other' }
export const DOC_SOURCE_LABEL: Record<DocSource, string> = { native: 'Written', upload: 'File', link: 'Link' }
/** 문서 아이콘이 뜻하는 것(마우스를 올리면 보여요) */
export const DOC_SOURCE_TIP: Record<DocSource, string> = { native: 'Written in Iris', upload: 'Uploaded file', link: 'Linked page' }
export const PRIORITY_LABEL: Record<ReqPriority, string> = { must: 'Must', should: 'Should', could: 'Could' }
export const LINK_STATUS: Record<LinkStatus, { label: string }> = {
  unchecked: { label: 'Unchecked' },
  reflected: { label: 'Reflected' },
  partial: { label: 'Partial' },
  missing: { label: 'Missing' },
  na: { label: 'Not applicable' },
}
/** 반영 상태 순환(상태 아이콘을 누를 때) — 시안과 같은 순서 */
export const NEXT_STATUS: Record<LinkStatus, LinkStatus> = { unchecked: 'reflected', reflected: 'partial', partial: 'missing', missing: 'na', na: 'reflected' }
/** 목록에서 보여 줄 순서: 손볼 것부터 */
export const STATUS_ORDER: LinkStatus[] = ['unchecked', 'missing', 'partial', 'reflected', 'na']
export const TOKEN_TYPE_LABEL: Record<TokenType, string> = { color: 'Color', typography: 'Typography', spacing: 'Spacing', radius: 'Radius', shadow: 'Shadow' }

/** 문서 아이콘 이름(디자인 시스템 Icon) */
export function docIcon(d: Pick<DocRow, 'source_type'>): string {
  return d.source_type === 'link' ? 'link' : d.source_type === 'upload' ? 'clip' : 'document'
}

// ---------------------------------------------------------------------------
// 미리보기 예시 데이터 (preview-* 프로젝트 공용, 화면 id 는 usePreview.ts 의 sc-1 ~ sc-8)
// ---------------------------------------------------------------------------
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const b = (id: string, type: DocBlock['type'], text: string): DocBlock => ({ id, type, text })

const PREVIEW_DOCS: Omit<DocRow, 'project_id'>[] = [
  {
    id: 'd1', title: '홈 · 내 차고 개편 기획서', category: 'planning', source_type: 'native', file_path: null, file_type: null, url: null, fetch_status: null, version_label: 'v1.2', updated_at: ago(40), plain_text: null,
    content_blocks: [
      b('b1', 'h1', '홈 · 내 차고 개편 기획서'),
      b('b2', 'p', '앱 첫 화면에서 내 차량 상태와 다음 할 일을 바로 확인하게 만듭니다. GA4 기준 홈 이탈률 48%를 35% 이하로 낮추는 것이 목표입니다.'),
      b('b3', 'h2', '1. 홈'),
      b('b4', 'li', 'REQ-001 홈 상단에 구독 중인 차량 카드를 보여준다. 차량이 없으면 신차 둘러보기 배너를 보여준다.'),
      b('b5', 'li', 'REQ-002 다음 결제일과 금액을 차량 카드 안에 표시한다.'),
      b('b6', 'li', 'REQ-003 공지·이벤트 배너는 최대 3개까지 좌우로 넘긴다.'),
      b('b7', 'h2', '2. 내 차고'),
      b('b8', 'li', 'REQ-004 보유 차량을 목록으로 보여주고 배터리 잔량을 막대로 표시한다.'),
      b('b9', 'li', 'REQ-005 차량을 누르면 차량 상세로 이동한다.'),
      b('b10', 'li', 'REQ-006 정비 예약 버튼은 화면 하단에 고정한다.'),
      b('b11', 'h2', '3. 차량 상세'),
      b('b12', 'li', 'REQ-007 주행거리, 충전 횟수, 보험 만료일을 한 카드에 모은다.'),
      b('b13', 'p', '세부 디자인은 디자인 시스템 컴포넌트만 사용합니다. 새 컴포넌트가 필요하면 디자인 시스템 담당과 먼저 협의합니다.'),
    ],
  },
  {
    id: 'd2', title: '착한구독 신청 정책', category: 'planning', source_type: 'upload', file_path: 'preview/policy.pdf', file_type: 'pdf', url: null, fetch_status: null, version_label: '2026.11', updated_at: ago(60 * 5), content_blocks: null,
    plain_text: '착한구독 신청 정책\n\n제1조 (요금제)\nREQ-008 요금제는 12·24·36개월 세 가지이며, 기간이 길수록 월 구독료가 내려간다.\nREQ-009 가장 많이 고르는 요금제에 \'가장 많이 선택\' 표시를 붙인다.\n\n제2조 (서류)\nREQ-010 운전면허증과 신분증은 사진 촬영 또는 앨범에서 올린다.\nREQ-011 서류 심사는 영업일 기준 1일 안에 끝내고 결과를 알림으로 보낸다.\n\n제3조 (완료)\nREQ-012 신청이 끝나면 예상 인도일과 담당자 연락처를 보여준다.',
  },
  { id: 'd3', title: 'API 명세 — 구독 신청', category: 'dev', source_type: 'link', file_path: null, file_type: null, url: 'https://www.notion.so/example/api-subscribe', fetch_status: 'ok', version_label: null, updated_at: ago(60 * 26), content_blocks: null, plain_text: 'POST /v1/subscriptions\n요금제, 차종, 보험 옵션을 받아 신청서를 만듭니다.\n\nGET /v1/subscriptions/:id\n신청 상태(심사 중 · 승인 · 반려)를 돌려줍니다.' },
  { id: 'd4', title: 'GA4 홈 진단 리포트', category: 'etc', source_type: 'link', file_path: null, file_type: null, url: 'https://analytics.google.com/example', fetch_status: 'failed', version_label: null, updated_at: ago(60 * 24 * 3), content_blocks: null, plain_text: null },
  { id: 'd5', title: '마이 페이지 디자인 가이드', category: 'design', source_type: 'native', file_path: null, file_type: null, url: null, fetch_status: null, version_label: null, updated_at: ago(60 * 24 * 9), plain_text: null, content_blocks: [b('m1', 'h1', '마이 페이지 디자인 가이드'), b('m2', 'p', '목록 행은 ListItem 컴포넌트, 구분은 1px 선만 씁니다.'), b('m3', 'li', 'REQ-013 프로필 영역에 이름과 회원 등급을 보여준다.'), b('m4', 'li', 'REQ-014 설정은 알림 · 계정 · 약관 세 묶음으로 나눈다.')] },
]

// 새 양식(3단계) 예시: 정책 표 · 화면 표가 있는 기획서
const MALL_MD = `# 착한구독 상세 기획서

## 1. 문서 정보

| 항목 | 내용 |
| --- | --- |
| 문서 | 착한구독 상세 기획서 |
| 문서 약어 | 구독 |
| 버전 | v1.0 |
| 상태 | 초안 |

## 2. 요청사항

| ID | 요청사항 | 세부 규칙 |
| --- | --- | --- |
| P-PLN-01 | 요금제 구성 | 요금제는 12 · 24 · 36개월, 기간이 길수록 월 구독료가 내려간다 |
| P-PLN-02 | 가장 많이 선택 〔기본값〕 | 가장 많이 고르는 요금제에 '가장 많이 선택' 표시를 붙인다 |
| P-DOC-01 | 서류 올리기 | 운전면허증 · 신분증은 촬영 또는 앨범에서 올린다 |
| P-DOC-02 | 심사 결과 알림 ⏸ | 서류 심사는 영업일 1일 안에 끝내고 결과를 알림으로 보낸다 |
| P-PAY-01 | 청약 철회 고지 ⚖️ | 결제 직전에 청약 철회 기간을 고지한다. 문구는 법무 원문을 쓴다 |

## 3. 화면

| ID | 화면 | 보여 줄 것 | 상태 | 요청사항 |
| --- | --- | --- | --- | --- |
| C-04 | 요금제 선택 | 요금제 카드 3개, 월 구독료 · 총액 | 로딩 | P-PLN-01, P-PLN-02 |
| C-05 | 서류 제출 | 면허증 · 신분증 올리기, [제출] | 오류 | P-DOC-01, P-DOC-03 |
| C-06 | 신청 완료 | 예상 인도일 · 담당자 연락처 (P-DOC-02) | - |  |
| C-07 | 상품 상세 | 긴 상세 — 사진 · 요금 · 혜택 · 후기 · 자주 묻는 질문 | - | P-PLN-01, P-PAY-01 |
| A-01 | 신청 심사 | 관리자 신청 목록 · 서류 보기 · 승인 / 반려 | 빈 목록 | P-DOC-01, P-DOC-02 |
| S-01 | 인도 확인 | 케어샵 태블릿 — 차량 인도 체크리스트 | - | P-DOC-02 |
| N-01 | 심사 결과 알림 | 푸시 — 승인 · 반려 문구 | - | P-DOC-02 |
| CMP-01 | 요금제 카드 | 기간 · 월 구독료 · '가장 많이 선택' 배지 | 선택됨 | P-PLN-01, P-PLN-02 |
`
const MALL_BLOCKS: DocBlock[] = parseMarkdown(MALL_MD).map((x, i) => ({ ...x, id: 'mb' + i }))
const MALL = analyzeDoc(MALL_BLOCKS)
/**
 * 미리보기 기록(착한구독 상세 기획서) — 기록 화면이 어떻게 뜨는지 경우별로 보이게(2026-11-28):
 * 문단 지우기 + 요청사항 줄 고치기 · 요청사항 줄 지우기 · 되돌리기 · 화면 줄 여러 개 더하기 · 요청사항 줄 더하기.
 * 지금 문서에서 거꾸로 버전을 만들고 그 사이 차이(diffBlocks)로 기록을 만들어서 [되돌리기]도 실제로 맞게 동작해요
 */
function mallHistory(): DocHistoryRow[] {
  const clone = (bs: DocBlock[]): DocBlock[] => JSON.parse(JSON.stringify(bs))
  const cur = clone(MALL_BLOCKS)
  const pIdx = cur.findIndex((b) => b.type === 'table' && /요청|정책/.test(b.rows?.[0]?.[1] ?? ''))
  const sIdx = cur.findIndex((b) => b.type === 'table' && (b.rows?.[0]?.[1] ?? '') === '화면')
  const dropRows = (bs: DocBlock[], idx: number, pred: (r: string[]) => boolean) => { const c = clone(bs); c[idx]!.rows = (c[idx]!.rows ?? []).filter((r, i) => i === 0 || !pred(r)); return c }
  const v5 = dropRows(cur, pIdx, (r) => r[0] === 'P-PAY-01')
  const v4 = dropRows(v5, sIdx, (r) => /^(C-07|A-01|S-01|N-01|CMP-01)$/.test(r[0] ?? ''))
  const v2 = clone(v4)
  const v3 = dropRows(v2, pIdx, (r) => r[0] === 'P-DOC-02')
  const v1 = clone(v2)
  const pln = v1[pIdx]!.rows!.find((r) => r[0] === 'P-PLN-01')
  if (pln) pln[2] = '요금제는 12 · 24개월 두 가지'
  v1.splice(pIdx + 1, 0, { id: 'mb-old-note', type: 'p', text: '결제는 매월 5일 자동으로 나간다' } as DocBlock)
  // 더 예전 기록(목록이 스크롤될 만큼 — 버전 · 상태 · 요청사항 규칙 · 화면 상태를 조금씩 고친 것)
  const infoIdx = v1.findIndex((b) => b.type === 'table' && (b.rows?.[0]?.[0] ?? '') === '항목')
  // v1 부터는 요청사항 표 뒤에 문단이 하나 끼어 있어서 화면 표 자리가 한 칸 밀려요 — 머리 글로 다시 찾아요
  const sIdx1 = v1.findIndex((b) => b.type === 'table' && (b.rows?.[0]?.[1] ?? '') === '화면')
  const setCell = (bs: DocBlock[], idx: number, key: string, col: number, val: string) => { const c = clone(bs); const r = c[idx]?.rows?.find((x) => x[0] === key); if (r) r[col] = val; return c }
  const v0e = infoIdx >= 0 ? setCell(v1, infoIdx, '버전', 1, 'v0.9') : clone(v1)
  const v0d = infoIdx >= 0 ? setCell(v0e, infoIdx, '상태', 1, '작성 중') : clone(v0e)
  const v0c = setCell(v0d, pIdx, 'P-DOC-01', 2, '운전면허증은 촬영으로 올린다')
  const v0b = setCell(v0c, sIdx1, 'C-05', 3, '-')
  const v0a = setCell(v0b, pIdx, 'P-PLN-02', 2, '추천 요금제에 표시를 붙인다')
  const w5 = setCell(v0a, sIdx1, 'C-04', 3, '-')
  const w4 = setCell(w5, pIdx, 'P-DOC-02', 2, '서류 심사 결과를 알림으로 보낸다')
  const w3 = setCell(w4, pIdx, 'P-PLN-01', 1, '요금제')
  const w2 = infoIdx >= 0 ? setCell(w3, infoIdx, '문서 약어', 1, '몰') : clone(w3)
  const w1 = setCell(w2, pIdx, 'P-DOC-01', 1, '서류 제출')
  const w0 = setCell(w1, sIdx1, 'C-06', 2, '예상 인도일')
  const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const mk = (id: string, author: string, before: DocBlock[], after: DocBlock[], h: number, note?: string): DocHistoryRow => {
    const d = diffBlocks(before, after)
    return { id, document_id: 'd6', project_id: 'preview-1', author_id: author, changes: d.changes, summary: note ? [note, ...d.summary] : d.summary, snapshot: null, created_at: at(h) }
  }
  return [
    mk('h-5', 'preview-me', v5, cur, 0.4),
    mk('h-4', 'preview-2', v4, v5, 3),
    mk('h-3', 'preview-me', v3, v4, 26, 'Restored to before this change'),
    mk('h-2', 'preview-3', v2, v3, 27),
    mk('h-1', 'preview-2', v1, v2, 52),
    mk('h-0e', 'preview-me', v0e, v1, 70),
    mk('h-0d', 'preview-me', v0d, v0e, 75),
    mk('h-0c', 'preview-3', v0c, v0d, 98),
    mk('h-0b', 'preview-2', v0b, v0c, 100),
    mk('h-0a', 'preview-2', v0a, v0b, 124),
    mk('h-w5', 'preview-3', w5, v0a, 150),
    mk('h-w4', 'preview-me', w4, w5, 170),
    mk('h-w3', 'preview-2', w3, w4, 172),
    mk('h-w2', 'preview-me', w2, w3, 196),
    mk('h-w1', 'preview-3', w1, w2, 220),
    mk('h-w0', 'preview-me', w0, w1, 240),
  ]
}
PREVIEW_DOCS.unshift({ id: 'd6', title: '착한구독 상세 기획서', category: 'planning', source_type: 'native', file_path: null, file_type: null, url: null, fetch_status: null, version_label: 'v1.0', updated_at: ago(20), plain_text: null, content_blocks: MALL_BLOCKS, abbr: MALL.abbr, status: 'draft', check_result: toCheckResult(MALL) })

const r = (id: string, doc: string, code: string, title: string, block: string | null, priority: ReqPriority | null, origin: ReqRow['origin'] = 'auto_pattern'): Omit<ReqRow, 'project_id'> =>
  ({ id, document_id: doc, code, title, body: null, anchor: block ? { block } : null, priority, origin })

const PREVIEW_REQS: Omit<ReqRow, 'project_id'>[] = [
  r('r1', 'd1', 'REQ-001', '구독 차량 카드, 없으면 신차 배너', 'b4', 'must'),
  r('r2', 'd1', 'REQ-002', '다음 결제일 · 금액 표시', 'b5', 'must'),
  r('r3', 'd1', 'REQ-003', '공지 배너 최대 3개 좌우 넘김', 'b6', 'could'),
  r('r4', 'd1', 'REQ-004', '보유 차량 목록 + 배터리 막대', 'b8', 'must'),
  r('r5', 'd1', 'REQ-005', '차량 누르면 상세로 이동', 'b9', 'should'),
  r('r6', 'd1', 'REQ-006', '정비 예약 버튼 하단 고정', 'b10', 'should', 'manual'),
  r('r7', 'd1', 'REQ-007', '주행 · 충전 · 보험 정보 한 카드', 'b12', 'must'),
  r('r8', 'd2', 'REQ-008', '요금제 12 · 24 · 36개월', null, 'must'),
  r('r9', 'd2', 'REQ-009', '\'가장 많이 선택\' 표시', null, 'could'),
  r('r10', 'd2', 'REQ-010', '면허증 · 신분증 촬영 또는 앨범 업로드', null, 'must'),
  r('r11', 'd2', 'REQ-011', '심사 결과 1일 안에 알림', null, 'should'),
  r('r12', 'd2', 'REQ-012', '예상 인도일 · 담당자 연락처', null, 'must'),
  r('r13', 'd5', 'REQ-013', '프로필에 이름 · 회원 등급', 'm3', 'should'),
  r('r14', 'd5', 'REQ-014', '설정은 알림 · 계정 · 약관 묶음', 'm4', 'could', 'manual'),
  ...MALL.policies.map((p): Omit<ReqRow, 'project_id'> => ({ id: 'mp-' + p.code, document_id: 'd6', code: p.code, title: p.title, body: p.body, anchor: { block: p.block, row: p.row }, priority: null, origin: 'doc_table', area: p.area, marks: p.marks, has_screen: true, removed_at: null })),
]
const PREVIEW_SLOTS: Omit<SlotRow, 'project_id'>[] = MALL.slots.map((x) => ({ id: 'ms-' + x.code, document_id: 'd6', code: x.code, kind: x.kind, name: x.name, spec: x.spec, states: x.states, policy_codes: x.policyCodes, anchor: { block: x.block, row: x.row }, removed_at: null }))

const l = (screen_id: string, requirement_id: string, status: LinkStatus, note: string | null = null): LinkRow => ({ screen_id, requirement_id, status, note })
const PREVIEW_LINKS: LinkRow[] = [
  { ...l('sc-4', 'mp-P-PLN-01', 'unchecked'), origin: 'doc_table' }, { ...l('sc-4', 'mp-P-PLN-02', 'unchecked'), origin: 'doc_table', layer_ids: ['p4b'] }, { ...l('sc-5', 'mp-P-DOC-01', 'unchecked'), origin: 'doc_table' },
  // 예시: 긴 화면 · 관리자(A) · 센터(S) · 알림(N) · 공통 부품(CMP) 칸
  { ...l('sc-9', 'mp-P-PLN-01', 'unchecked'), origin: 'doc_table' }, { ...l('sc-9', 'mp-P-PAY-01', 'unchecked'), origin: 'doc_table', layer_ids: ['d9'] },
  { ...l('sc-10', 'mp-P-DOC-01', 'unchecked'), origin: 'doc_table' }, { ...l('sc-10', 'mp-P-DOC-02', 'unchecked'), origin: 'doc_table' },
  { ...l('sc-13', 'mp-P-DOC-02', 'unchecked'), origin: 'doc_table' },
  { ...l('sc-11', 'mp-P-DOC-02', 'unchecked'), origin: 'doc_table' },
  { ...l('sc-12', 'mp-P-PLN-01', 'unchecked'), origin: 'doc_table' }, { ...l('sc-12', 'mp-P-PLN-02', 'unchecked'), origin: 'doc_table', layer_ids: ['k4'] },
  l('sc-1', 'r1', 'reflected'), l('sc-1', 'r2', 'partial', '금액은 있고 결제일이 빠졌어요'), l('sc-1', 'r3', 'missing'),
  l('sc-2', 'r4', 'reflected'), l('sc-2', 'r5', 'reflected'), l('sc-2', 'r6', 'missing', '버튼이 스크롤과 같이 움직여요'),
  l('sc-3', 'r7', 'partial'),
  l('sc-4', 'r8', 'reflected'), l('sc-4', 'r9', 'reflected'),
  l('sc-5', 'r10', 'partial', '앨범 업로드가 아직 없어요'), l('sc-5', 'r11', 'na'),
  l('sc-6', 'r12', 'missing'),
  l('sc-7', 'r13', 'reflected'), l('sc-8', 'r14', 'partial'),
]

const c = (id: string, name: string, category: string, description: string, props: ComponentRow['props_schema'] = null, aliases: string[] = []): ComponentRow =>
  ({ id, name, code_name: name, category, description, match_aliases: aliases, props_schema: props })
const PREVIEW_COMPONENTS: ComponentRow[] = [
  c('c1', 'Button', '입력', '주요 동작 버튼. 화면당 primary 하나.', { type: ['primary', 'secondary', 'tertiary', 'ghost'], size: ['xl', 'l', 'm', 's'], label: 'text', disabled: 'boolean' }, ['btn', '버튼']),
  c('c2', 'TextField', '입력', '한 줄 입력칸. 라벨 · 도움말 · 오류 문구 포함.', { size: ['l', 'm'], label: 'text', error: 'boolean' }, ['input']),
  c('c3', 'Checkbox', '입력', '여러 개를 고를 때.', { checked: 'boolean', label: 'text' }),
  c('c4', 'Radio', '입력', '하나만 고를 때.', { checked: 'boolean', label: 'text' }),
  c('c5', 'Toggle', '입력', '바로 켜고 끄는 설정.', { on: 'boolean' }, ['switch']),
  c('c6', 'Tab', '내비게이션', '같은 화면 안에서 내용 전환.', { type: ['line', 'segment'], count: ['2', '3', '4'] }),
  c('c7', 'NavigationBar', '내비게이션', '화면 위 제목 줄.', { back: 'boolean', title: 'text' }, ['header', 'top bar']),
  c('c8', 'BottomNavigation', '내비게이션', '앱 아래 탭 막대.', { active: ['홈', '내 차고', '커뮤니티', '마이'] }),
  c('c9', 'Badge', '표시', '상태 · 개수 표시.', { color: ['gray', 'blue', 'red', 'green'], size: ['s', 'm'] }),
  c('c10', 'ListItem', '표시', '목록 한 줄.', { leading: ['none', 'icon', 'image'], trailing: ['none', 'chevron', 'toggle'] }),
  c('c11', 'Card', '표시', '묶음 상자.', { elevation: ['flat', 'line'] }),
  c('c12', 'BottomSheet', '피드백', '아래에서 올라오는 선택 창.', { handle: 'boolean', title: 'text' }),
  c('c13', 'Toast', '피드백', '잠깐 뜨는 알림.', { type: ['default', 'success', 'error'] }),
]

const t = (id: string, type: TokenType, name: string, value: string, description: string | null = null): TokenRow => ({ id, type, name, value, description })
const PREVIEW_TOKENS: TokenRow[] = [
  t('t1', 'color', 'brand/primary-default', '#2C7BE2', '주요 버튼 · 링크'),
  t('t2', 'color', 'brand/primary-lightest', '#EEF5FD', '선택 배경'),
  t('t3', 'color', 'neutral/800', '#202837', '본문 글자'),
  t('t4', 'color', 'neutral/500', '#8C9199', '보조 글자'),
  t('t5', 'color', 'neutral/100', '#F6F7F7', '캔버스 · 상자'),
  t('t6', 'color', 'system/negative', '#E5484D', '오류'),
  t('t7', 'typography', 'Title 1/24 B', '24 / 32 · 700'),
  t('t8', 'typography', 'Body 1/16 M', '16 / 24 · 500'),
  t('t9', 'typography', 'Body 2/14 R', '14 / 20 · 400'),
  t('t10', 'typography', 'Caption/12 R', '12 / 18 · 400'),
  t('t11', 'spacing', 'spacing/04', '8px'), t('t12', 'spacing', 'spacing/08', '16px'), t('t13', 'spacing', 'spacing/12', '24px'),
  t('t14', 'radius', 'radius/04', '8px'), t('t15', 'radius', 'radius/06', '12px'), t('t16', 'radius', 'radius/12', '24px'),
  t('t17', 'shadow', 'shadow/1', '0 1px 2px rgb(3 9 26 / 8%)'),
]

const u = (id: string, screen_id: string, component_id: string | null, detected_name: string, count: number): UsageRow => ({ id, screen_id, component_id, detected_name, count })
const PREVIEW_USAGES: UsageRow[] = [
  u('u1', 'sc-1', 'c7', 'NavigationBar', 1), u('u2', 'sc-1', 'c11', 'Card', 2), u('u3', 'sc-1', 'c8', 'BottomNavigation', 1), u('u4', 'sc-1', 'c1', 'Button', 1), u('u5', 'sc-1', null, 'Banner/Event', 1),
  u('u6', 'sc-2', 'c7', 'NavigationBar', 1), u('u7', 'sc-2', 'c10', 'ListItem', 3), u('u8', 'sc-2', 'c1', 'Button', 1), u('u9', 'sc-2', 'c8', 'BottomNavigation', 1),
  u('u10', 'sc-3', 'c7', 'NavigationBar', 1), u('u11', 'sc-3', 'c11', 'Card', 1), u('u12', 'sc-3', 'c9', 'Badge', 2),
  u('u13', 'sc-4', 'c7', 'NavigationBar', 1), u('u14', 'sc-4', 'c6', 'Tab', 1), u('u15', 'sc-4', 'c11', 'Card', 3), u('u16', 'sc-4', 'c9', 'Badge', 1), u('u17', 'sc-4', 'c1', 'Button', 1),
  u('u18', 'sc-5', 'c7', 'NavigationBar', 1), u('u19', 'sc-5', 'c2', 'TextField', 2), u('u20', 'sc-5', 'c1', 'Button', 2), u('u21', 'sc-5', 'c12', 'BottomSheet', 1),
  u('u22', 'sc-6', 'c1', 'Button', 1), u('u23', 'sc-6', null, 'Illust/Done', 1),
  u('u24', 'sc-7', 'c10', 'ListItem', 5), u('u25', 'sc-7', 'c8', 'BottomNavigation', 1),
  u('u26', 'sc-8', 'c7', 'NavigationBar', 1), u('u27', 'sc-8', 'c10', 'ListItem', 6), u('u28', 'sc-8', 'c5', 'Toggle', 3),
]

/** 미리보기용 공유 저장소(한 번만 복사해 두고 화면끼리 같이 씁니다) */
function previewStore() {
  return {
    docs: useState('pv-docs', () => structuredClone(PREVIEW_DOCS)),
    reqs: useState('pv-reqs', () => structuredClone(PREVIEW_REQS)),
    links: useState('pv-links', () => structuredClone(PREVIEW_LINKS)),
    components: useState('pv-components', () => structuredClone(PREVIEW_COMPONENTS)),
    tokens: useState('pv-tokens', () => structuredClone(PREVIEW_TOKENS)),
    slots: useState<Omit<SlotRow, 'project_id'>[]>('pv-slots', () => structuredClone(PREVIEW_SLOTS)),
    /** 미리보기 화면 → 화면 칸 { 화면 id: { slot, state } } */
    screenSlots: useState<Record<string, { slot: string | null; state: string | null }>>('pv-screen-slots', () => ({ 'sc-4': { slot: 'ms-C-04', state: null }, 'sc-5': { slot: 'ms-C-05', state: null }, 'sc-9': { slot: 'ms-C-07', state: null }, 'sc-10': { slot: 'ms-A-01', state: null }, 'sc-13': { slot: 'ms-S-01', state: null }, 'sc-11': { slot: 'ms-N-01', state: null }, 'sc-12': { slot: 'ms-CMP-01', state: null } })),
    history: useState<DocHistoryRow[]>('pv-doc-history', () => mallHistory()),
  }
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2))

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------
const DOC_COLS = 'id, project_id, title, category, source_type, content_blocks, file_path, file_type, url, plain_text, fetch_status, version_label, updated_at, abbr, status, check_result'

/** 프로젝트의 문서 목록 */
export function useDocuments(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`docs-${projectId}`, async () => {
    if (preview) return previewStore().docs.value.map((d) => ({ ...d, project_id: projectId })) as DocRow[]
    const { data, error } = await supabase.from('documents').select(DOC_COLS).eq('project_id', projectId).order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as DocRow[]
  }, { deep: true })
}

/** 내가 볼 수 있는 모든 프로젝트의 문서(홈 '문서' 메뉴 — 프로젝트별 목록, 2026-11-28). 본문은 빼고 목록에 필요한 칸만 */
export type DocListRow = Pick<DocRow, 'id' | 'project_id' | 'title' | 'category' | 'source_type' | 'version_label' | 'updated_at' | 'abbr' | 'status' | 'check_result'>
export function useAllDocuments() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData('all-docs', async () => {
    if (preview) return previewStore().docs.value.map((d) => ({ id: d.id, project_id: 'preview-1', title: d.title, category: d.category, source_type: d.source_type, version_label: d.version_label, updated_at: d.updated_at, abbr: d.abbr, status: d.status, check_result: d.check_result })) as DocListRow[]
    const { data, error } = await supabase.from('documents').select('id, project_id, title, category, source_type, version_label, updated_at, abbr, status, check_result').order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as DocListRow[]
  }, { deep: true })
}

/** 프로젝트의 요구사항 + 화면 연결 전체 (작은 팀 규모라 한 번에 읽습니다) */
export function useRequirements(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const reqs = useAsyncData(`reqs-${projectId}`, async () => {
    if (preview) return previewStore().reqs.value.map((x) => ({ ...x, project_id: projectId })) as ReqRow[]
    const { data, error } = await supabase.from('requirements').select('id, project_id, document_id, code, title, body, anchor, priority, origin, area, marks, has_screen, removed_at').eq('project_id', projectId).order('code')
    if (error) throw error
    return (data ?? []) as unknown as ReqRow[]
  }, { deep: true })
  const links = useAsyncData(`links-${projectId}`, async () => {
    if (preview) return previewStore().links.value
    const { data, error } = await supabase.from('screen_requirements').select('screen_id, requirement_id, status, note, layer_ids, origin, requirements!inner(project_id)').eq('requirements.project_id', projectId)
    if (error) throw error
    return ((data ?? []) as unknown as LinkRow[]).map(({ screen_id, requirement_id, status, note, layer_ids, origin }) => ({ screen_id, requirement_id, status, note, layer_ids, origin }))
  }, { deep: true })
  return { reqs, links }
}

/** 프로젝트의 모든 화면(페이지를 가로질러) — 요구사항 보드 · 연결 고르기용 */
export function useProjectScreens(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`all-screens-${projectId}`, async () => {
    if (preview) {
      const slotOf = previewStore().screenSlots.value
      return Object.entries(PREVIEW_SCREENS).flatMap(([page_id, list]) => list.map((s): ProjectScreen => ({ id: s.id, name: s.name, page_id, page: PREVIEW_PAGES.find((p) => p.id === page_id)?.name ?? '', slot_id: slotOf[s.id]?.slot ?? null, slot_state: slotOf[s.id]?.state ?? null })))
    }
    const { data, error } = await supabase.from('screens').select('id, name, page_id, slot_id, slot_state, pages!inner(name, project_id)').eq('pages.project_id', projectId).order('sort_order')
    if (error) throw error
    return ((data ?? []) as unknown as { id: string; name: string; page_id: string; slot_id: string | null; slot_state: string | null; pages: { name: string } }[]).map((s): ProjectScreen => ({ id: s.id, name: s.name, page_id: s.page_id, page: s.pages.name, slot_id: s.slot_id, slot_state: s.slot_state }))
  }, { deep: true })
}

/** 프로젝트의 화면 칸(문서마다 화면 표에서 읽은 것) */
export function useScreenSlots(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`slots-${projectId}`, async () => {
    if (preview) return previewStore().slots.value.map((x) => ({ ...x, project_id: projectId })) as SlotRow[]
    const { data, error } = await supabase.from('screen_slots').select('id, project_id, document_id, code, kind, name, spec, states, policy_codes, anchor, removed_at').eq('project_id', projectId)
    if (error) return [] as SlotRow[] // 마이그레이션 전 DB
    return ((data ?? []) as unknown as SlotRow[]).sort((a, b) => compareCodes(a.code, b.code))
  }, { deep: true, default: () => [] as SlotRow[] })
}

/** 디자인 시스템: 컴포넌트 · 토큰 (워크스페이스 공용) */
export function useDesignSystem() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  // 기본 탑재(DS_CATALOG) + DB 에 따로 등록한 것 중 기본 목록에 없는 이름
  const merge = (extra: ComponentRow[]) => {
    const names = new Set(DS_CATALOG.map((c) => c.name.toLowerCase()))
    return [...DS_CATALOG, ...extra.filter((c) => !names.has(c.name.toLowerCase()) && !matchCatalog(c.name))]
  }
  const components = useAsyncData('ds-components', async () => {
    if (preview) return merge(previewStore().components.value)
    const { data, error } = await supabase.from('components').select('id, name, code_name, category, description, match_aliases, props_schema').order('category').order('name')
    if (error) throw error
    return merge((data ?? []) as unknown as ComponentRow[])
  }, { deep: true })
  const tokens = useAsyncData('ds-tokens', async () => {
    if (preview) return previewStore().tokens.value
    const { data, error } = await supabase.from('tokens').select('id, type, name, value, description').order('type').order('name')
    if (error) throw error
    return ((data ?? []) as unknown as (Omit<TokenRow, 'value'> & { value: unknown })[]).map((x) => ({ ...x, value: typeof x.value === 'string' ? x.value : JSON.stringify(x.value) }))
  }, { deep: true })
  return { components, tokens }
}

/** 화면별 사용 컴포넌트 집계. screenIds 를 비우면 전체(디자인 시스템 역추적용) */
export function useUsages(key: string, screenIds?: () => string[]) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`usages-${key}`, async () => {
    const ids = screenIds?.()
    // 레이어 이름으로 기본 탑재 컴포넌트와 맞춥니다(맞지 않으면 DB 에 등록한 컴포넌트 id 를 그대로)
    const link = (rows: UsageRow[]) => rows.map((u) => ({ ...u, component_id: matchCatalog(u.detected_name) ?? u.component_id }))
    if (preview) return link(PREVIEW_USAGES.filter((x) => !ids || ids.includes(x.screen_id)))
    let q = supabase.from('screen_component_usages').select('id, screen_id, component_id, detected_name, count')
    if (ids) {
      if (!ids.length) return [] as UsageRow[]
      q = q.in('screen_id', ids)
    }
    const { data, error } = await q
    if (error) throw error
    return link((data ?? []) as UsageRow[])
  }, screenIds ? { watch: [screenIds], deep: true } : { deep: true })
}

/** 사용 기록에 나온 화면들의 이름 · 페이지 · 프로젝트(에셋 상세 '다른 프로젝트에서') */
export interface UsageScreen { id: string; name: string; page: string; project: string; projectId: string | null }
export function useUsageScreens(key: string, ids: () => string[]) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`usage-screens-${key}`, async (): Promise<Record<string, UsageScreen>> => {
    const list = ids()
    if (!list.length) return {}
    if (preview) {
      const project = PREVIEW_PROJECTS[0]!
      const out: Record<string, UsageScreen> = {}
      for (const [pageId, rows] of Object.entries(PREVIEW_SCREENS)) {
        const page = PREVIEW_PAGES.find((p) => p.id === pageId)?.name ?? ''
        for (const s of rows) if (list.includes(s.id)) out[s.id] = { id: s.id, name: s.name, page, project: project.name, projectId: project.id }
      }
      return out
    }
    const { data, error } = await supabase.from('screens').select('id, name, page_id, pages(name, project_id, projects(name))').in('id', list)
    if (error) throw error
    type Row = { id: string; name: string; pages: { name: string; project_id: string; projects: { name: string } | null } | null }
    return Object.fromEntries(((data ?? []) as unknown as Row[]).map((s) => [s.id, { id: s.id, name: s.name, page: s.pages?.name ?? '', project: s.pages?.projects?.name ?? '', projectId: s.pages?.project_id ?? null }]))
  }, { watch: [ids], default: (): Record<string, UsageScreen> => ({}) })
}

// ---------------------------------------------------------------------------
// 쓰기 (실패하면 throw — 화면에서 토스트로 알립니다)
// ---------------------------------------------------------------------------
export function useIrisMutations() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const preview = useDevPreview()
  const me = () => (user.value?.sub ?? user.value?.id) as string

  async function setLink(row: LinkRow) {
    if (preview) {
      const links = previewStore().links
      const i = links.value.findIndex((x) => x.screen_id === row.screen_id && x.requirement_id === row.requirement_id)
      if (i >= 0) links.value[i] = { ...row }
      else links.value.push({ ...row })
      return
    }
    const { error } = await supabase.from('screen_requirements').upsert({ ...row, updated_by: me() })
    if (error) throw error
  }

  async function removeLink(screen_id: string, requirement_id: string) {
    if (preview) {
      const links = previewStore().links
      links.value = links.value.filter((x) => !(x.screen_id === screen_id && x.requirement_id === requirement_id))
      return
    }
    const { error } = await supabase.from('screen_requirements').delete().eq('screen_id', screen_id).eq('requirement_id', requirement_id)
    if (error) throw error
  }

  async function addDocument(projectId: string, doc: Pick<DocRow, 'title' | 'category' | 'source_type'> & Partial<DocRow>): Promise<string> {
    if (preview) {
      const id = uid()
      previewStore().docs.value.unshift({ content_blocks: null, file_path: null, file_type: null, url: null, plain_text: null, fetch_status: null, version_label: null, ...doc, id, updated_at: new Date().toISOString() } as DocRow)
      return id
    }
    const { data, error } = await supabase.from('documents').insert({ ...doc, project_id: projectId, created_by: me() }).select('id').single()
    if (error) throw error
    return data.id as string
  }

  async function addRequirement(projectId: string, req: Pick<ReqRow, 'document_id' | 'code' | 'title'> & Partial<ReqRow>): Promise<string> {
    if (preview) {
      const id = uid()
      previewStore().reqs.value.push({ body: null, anchor: null, priority: null, origin: 'manual', ...req, id })
      return id
    }
    const { data, error } = await supabase.from('requirements').insert({ origin: 'manual', anchor: {}, ...req, project_id: projectId, created_by: me() }).select('id').single()
    if (error) throw error
    return data.id as string
  }

  /** 정책 지우기(직접 만든 것 — 문서 표에서 읽은 정책은 문서에서 행을 지워요). 화면 연결도 같이 지워져요 */
  async function removeRequirement(id: string) {
    if (preview) {
      const st = previewStore()
      st.reqs.value = st.reqs.value.filter((x) => x.id !== id)
      st.links.value = st.links.value.filter((l) => l.requirement_id !== id)
      return
    }
    const { error } = await supabase.from('requirements').delete().eq('id', id)
    if (error) throw error
  }

  async function addComponent(row: Omit<ComponentRow, 'id'>) {
    if (preview) { previewStore().components.value.push({ ...row, id: uid() }); return }
    const { data: ws } = await supabase.from('workspaces').select('id').limit(1).single()
    const { error } = await supabase.from('components').insert({ ...row, workspace_id: ws?.id })
    if (error) throw error
  }

  async function addTokens(rows: Omit<TokenRow, 'id'>[]) {
    if (preview) { previewStore().tokens.value.push(...rows.map((x) => ({ ...x, id: uid() }))); return }
    const { data: ws } = await supabase.from('workspaces').select('id').limit(1).single()
    const { error } = await supabase.from('tokens').upsert(rows.map((x) => ({ ...x, workspace_id: ws?.id })), { onConflict: 'workspace_id,name' })
    if (error) throw error
  }

  /** 여러 화면에 정책 하나를 한 번에 연결(이미 있으면 건너뛰고, 고른 레이어는 더해요) */
  async function linkMany(rows: { screen_id: string; requirement_id: string; layer_ids?: string[] }[], existing: LinkRow[]) {
    const add: LinkRow[] = []
    for (const r of rows) {
      const ex = existing.find((x) => x.screen_id === r.screen_id && x.requirement_id === r.requirement_id)
      if (ex && !r.layer_ids?.length) continue
      const layers = [...new Set([...(ex?.layer_ids ?? []), ...(r.layer_ids ?? [])])]
      add.push({ screen_id: r.screen_id, requirement_id: r.requirement_id, status: ex?.status ?? 'unchecked', note: ex?.note ?? null, layer_ids: layers.length ? layers : null, origin: ex?.origin ?? 'manual' })
    }
    if (!add.length) return add
    if (preview) { for (const r of add) await setLink(r); return add }
    const { error } = await supabase.from('screen_requirements').upsert(add.map((r) => ({ ...r, updated_by: me() })))
    if (error) throw error
    return add
  }
  async function unlinkMany(screenIds: string[], requirementId: string) {
    if (preview) { for (const sid of screenIds) await removeLink(sid, requirementId); return }
    const { error } = await supabase.from('screen_requirements').delete().eq('requirement_id', requirementId).in('screen_id', screenIds)
    if (error) throw error
  }

  /** 화면(디자인)을 화면 칸에 붙이기 · 떼기 */
  async function setScreenSlot(screenId: string, slotId: string | null, state: string | null = null) {
    if (preview) { previewStore().screenSlots.value = { ...previewStore().screenSlots.value, [screenId]: { slot: slotId, state } }; return }
    const { error } = await supabase.from('screens').update({ slot_id: slotId, slot_state: state }).eq('id', screenId)
    if (error) throw error
  }

  /**
   * 문서를 저장한 뒤 양식 검사 결과를 DB 에 맞춥니다(PRD/11 5장):
   * 정책 표 → 정책(문서 안 ID 그대로), 화면 표 → 화면 칸, 이름이 'C-05 …' 인 화면은 칸에 붙이고, 칸의 '정책' 열 → '확인 전' 연결.
   * 문서에서 빠진 정책 · 칸은 지우지 않고 빠진 시각만 남겨요. 결과 수를 돌려줘요.
   */
  async function syncDocFormat(projectId: string, docId: string, r: FormatResult, ctx: { reqs: ReqRow[]; slots: SlotRow[]; screens: ProjectScreen[]; links: LinkRow[]; aliases?: Aliases }) {
    const now = new Date().toISOString()
    const out = { added: [] as string[], removed: [] as string[], slots: 0, attached: 0, unchecked: 0 }
    const docReqs = ctx.reqs.filter((x) => x.document_id === docId)
    const byCode = new Map(docReqs.map((x) => [x.code.toUpperCase(), x]))
    const found = new Set(r.policies.map((p) => p.code))
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

    // 1) 정책
    const inserts: Record<string, unknown>[] = []
    const updates: [string, Record<string, unknown>][] = []
    for (const p of r.policies) {
      const fields = { title: p.title.slice(0, 200), body: p.body || null, area: p.area, marks: p.marks, has_screen: !p.marks.includes('no_screen'), anchor: { block: p.block, row: p.row }, removed_at: null }
      const ex = byCode.get(p.code)
      if (!ex) { inserts.push({ ...fields, project_id: projectId, document_id: docId, code: p.code, origin: 'doc_table' }); out.added.push(p.code) }
      else if (!same(ex.title, fields.title) || !same(ex.body, fields.body) || !same(ex.area, fields.area) || !same(ex.marks ?? [], fields.marks) || !same(ex.anchor, fields.anchor) || ex.removed_at) updates.push([ex.id, fields])
    }
    const gone = docReqs.filter((x) => x.origin === 'doc_table' && !found.has(x.code) && !x.removed_at)
    out.removed = gone.map((x) => x.code)

    // 2) 화면 칸
    const docSlots = ctx.slots.filter((x) => x.document_id === docId)
    const slotRows = r.slots.map((s) => ({ project_id: projectId, document_id: docId, code: s.code, kind: s.kind, name: s.name.slice(0, 200), spec: s.spec || null, states: s.states, policy_codes: s.policyCodes, anchor: { block: s.block, row: s.row }, removed_at: null as string | null }))
    const slotGone = docSlots.filter((x) => !r.slots.some((s) => s.code === x.code) && !x.removed_at)
    out.slots = r.slots.length

    let reqIds = new Map(docReqs.map((x) => [x.code.toUpperCase(), x.id]))
    let slotIds = new Map(docSlots.map((x) => [x.code, x.id]))

    if (preview) {
      const st = previewStore()
      for (const row of inserts) { const id = uid(); st.reqs.value.push({ has_screen: true, ...(row as Omit<ReqRow, 'id' | 'project_id'>), priority: null, id }); reqIds.set(String(row.code), id) }
      for (const [id, f] of updates) { const i = st.reqs.value.findIndex((x) => x.id === id); if (i >= 0) st.reqs.value[i] = { ...st.reqs.value[i]!, ...(f as Partial<ReqRow>) } }
      for (const g of gone) { const i = st.reqs.value.findIndex((x) => x.id === g.id); if (i >= 0) st.reqs.value[i] = { ...st.reqs.value[i]!, removed_at: now } }
      for (const row of slotRows) {
        const i = st.slots.value.findIndex((x) => x.document_id === docId && x.code === row.code)
        if (i >= 0) st.slots.value[i] = { ...st.slots.value[i]!, ...row }
        else { const id = uid(); st.slots.value.push({ ...row, id }); slotIds.set(row.code, id) }
      }
      for (const g of slotGone) { const i = st.slots.value.findIndex((x) => x.id === g.id); if (i >= 0) st.slots.value[i] = { ...st.slots.value[i]!, removed_at: now } }
      const di = st.docs.value.findIndex((d) => d.id === docId)
      if (di >= 0) st.docs.value[di] = { ...st.docs.value[di]!, abbr: r.abbr ?? st.docs.value[di]!.abbr ?? null, status: r.status ?? st.docs.value[di]!.status ?? 'draft', check_result: toCheckResult(r) }
    } else {
      if (inserts.length) {
        const { data, error } = await supabase.from('requirements').insert(inserts.map((x) => ({ ...x, created_by: me() }))).select('id, code')
        if (error) throw error
        for (const x of (data ?? []) as { id: string; code: string }[]) reqIds.set(x.code.toUpperCase(), x.id)
      }
      for (const [id, f] of updates) { const { error } = await supabase.from('requirements').update(f as never).eq('id', id); if (error) throw error }
      if (gone.length) { const { error } = await supabase.from('requirements').update({ removed_at: now }).in('id', gone.map((x) => x.id)); if (error) throw error }
      if (slotRows.length) {
        const { data, error } = await supabase.from('screen_slots').upsert(slotRows, { onConflict: 'document_id,code' }).select('id, code')
        if (error) throw error
        slotIds = new Map(((data ?? []) as { id: string; code: string }[]).map((x) => [x.code, x.id]))
      }
      if (slotGone.length) { const { error } = await supabase.from('screen_slots').update({ removed_at: now }).in('id', slotGone.map((x) => x.id)); if (error) throw error }
      const patch: Record<string, unknown> = { check_result: toCheckResult(r) }
      if (r.abbr) patch.abbr = r.abbr
      if (r.status) patch.status = r.status
      const { error } = await supabase.from('documents').update(patch as never).eq('id', docId)
      if (error) throw error
    }
    reqIds = new Map([...reqIds])

    // 3) 이름이 'C-05 …' · 'C-05/일시품절' 인 화면을 칸에 붙여요(아직 칸이 없는 화면만). 디자인 역할이 아니면 DB 가 막아요 — 그땐 건너뛰어요
    const screenSlot = new Map(ctx.screens.map((s) => [s.id, s.slot_id]))
    for (const s of ctx.screens) {
      if (s.slot_id) continue
      const m = slotFromName(s.name, ctx.aliases)
      const sid = m ? slotIds.get(m.code) : null
      if (!m || !sid) continue
      try { await setScreenSlot(s.id, sid, m.state); screenSlot.set(s.id, sid); out.attached++ } catch { /* 권한 없음 */ }
    }

    // 4) 칸의 '정책' 열 → 붙은 화면마다 '확인 전' 연결(이미 있으면 그대로)
    const rows: LinkRow[] = []
    for (const s of r.slots) {
      const sid = slotIds.get(s.code)
      if (!sid) continue
      const screens = [...screenSlot.entries()].filter(([, v]) => v === sid).map(([k]) => k)
      for (const code of s.policyCodes) {
        const rid = reqIds.get(code.toUpperCase())
        if (!rid) continue
        for (const screen_id of screens) {
          if (ctx.links.some((l) => l.screen_id === screen_id && l.requirement_id === rid) || rows.some((l) => l.screen_id === screen_id && l.requirement_id === rid)) continue
          rows.push({ screen_id, requirement_id: rid, status: 'unchecked', note: null, origin: 'doc_table' })
        }
      }
    }
    if (rows.length) {
      try {
        if (preview) for (const x of rows) await setLink(x)
        else { const { error } = await supabase.from('screen_requirements').upsert(rows.map((x) => ({ ...x, updated_by: me() })), { ignoreDuplicates: true }); if (error) throw error }
        out.unchecked = rows.length
      } catch { /* 연결 권한이 없으면 건너뛰어요 */ }
    }
    return out
  }

  /** 문서 수정 기록 남기기(바뀐 블록만). 기록 20개마다 전체 사본도 */
  async function addHistory(projectId: string, docId: string, before: DocBlock[], after: DocBlock[], note?: string) {
    const diff = diffBlocks(before, after)
    if (!diff.changes.length && !note) return
    const summary = note ? [note, ...diff.summary] : diff.summary
    if (preview) {
      const list = previewStore().history.value
      const n = list.filter((h) => h.document_id === docId).length
      list.unshift({ id: uid(), document_id: docId, project_id: projectId, author_id: 'preview-me', changes: diff.changes, summary, snapshot: (n + 1) % 20 === 0 ? after : null, created_at: new Date().toISOString() })
      return
    }
    const { count } = await supabase.from('document_history').select('id', { count: 'exact', head: true }).eq('document_id', docId)
    const { error } = await supabase.from('document_history').insert({ document_id: docId, project_id: projectId, changes: diff.changes, summary, snapshot: ((count ?? 0) + 1) % 20 === 0 ? after : null })
    if (error) throw error
  }

  return { setLink, removeLink, addDocument, addRequirement, removeRequirement, addComponent, addTokens, linkMany, unlinkMany, setScreenSlot, syncDocFormat, addHistory }
}

// ---------------------------------------------------------------------------
// 문서 수정 기록(새 5): 바뀐 블록만 남겨요
// ---------------------------------------------------------------------------
export type HistoryChange =
  | { op: 'add'; block: string; index: number; after: DocBlock }
  | { op: 'edit'; block: string; index: number; before: DocBlock; after: DocBlock }
  | { op: 'del'; block: string; index: number; before: DocBlock }
  /** 블록 순서가 바뀌었을 때만: 바뀌기 전 순서(id) */
  | { op: 'order'; before: string[] }
export interface DocHistoryRow { id: string; document_id: string; project_id: string; author_id: string; changes: HistoryChange[]; summary: string[]; snapshot: DocBlock[] | null; created_at: string }

/** 블록 하나에 든 ID(표는 행 첫 칸 → 행 글) */
function rowsById(b: DocBlock | undefined): Map<string, string> {
  const m = new Map<string, string>()
  if (!b) return m
  if (b.type === 'table') for (const r of (b.rows ?? []).slice(1)) { const id = (r[0] ?? '').match(/^(?:P-[A-Z]{2,6}-\d{1,4}|(?:CMP|C|A|S|N)-\d{1,4})/)?.[0]; if (id) m.set(id, r.join('|')) }
  else { const id = b.text.match(/^(?:P-[A-Z]{2,6}-\d{1,4}|REQ-\d{1,4})/)?.[0]; if (id) m.set(id, b.text) }
  return m
}

export function diffBlocks(before: DocBlock[], after: DocBlock[]): { changes: HistoryChange[]; summary: string[] } {
  const changes: HistoryChange[] = []
  const bMap = new Map(before.map((b, i) => [b.id, { b, i }]))
  const aIds = new Set(after.map((b) => b.id))
  const key = (b: DocBlock) => JSON.stringify([b.type, b.text, b.rows ?? null])
  after.forEach((b, i) => {
    const old = bMap.get(b.id)
    if (!old) changes.push({ op: 'add', block: b.id, index: i, after: b })
    else if (key(old.b) !== key(b)) changes.push({ op: 'edit', block: b.id, index: i, before: old.b, after: b })
  })
  before.forEach((b, i) => { if (!aIds.has(b.id)) changes.push({ op: 'del', block: b.id, index: i, before: b }) })
  const kept = before.filter((b) => aIds.has(b.id)).map((b) => b.id)
  const keptAfter = after.filter((b) => bMap.has(b.id)).map((b) => b.id)
  if (kept.join() !== keptAfter.join()) changes.push({ op: 'order', before: before.map((b) => b.id) })

  // 목록 칩: + 새 ID, − 빠진 ID, ~ 바뀐 ID
  const plus = new Set<string>(), minus = new Set<string>(), tilde = new Set<string>()
  for (const c of changes) {
    if (c.op === 'order') continue
    const was = rowsById(c.op === 'add' ? undefined : c.before)
    const now = rowsById(c.op === 'del' ? undefined : c.after)
    now.forEach((v, k) => { if (!was.has(k)) plus.add(k); else if (was.get(k) !== v) tilde.add(k) })
    was.forEach((_, k) => { if (!now.has(k)) minus.add(k) })
  }
  const summary = [...[...plus].map((x) => '+ ' + x), ...[...tilde].map((x) => '~ ' + x), ...[...minus].map((x) => '− ' + x)]
  return { changes, summary }
}

/** 기록 하나를 되돌린 블록(after → before) */
export function undoChanges(blocks: DocBlock[], changes: HistoryChange[]): DocBlock[] {
  let out = blocks.filter((b) => !changes.some((c) => c.op === 'add' && c.block === b.id))
  out = out.map((b) => { const c = changes.find((x) => x.op === 'edit' && x.block === b.id); return c && c.op === 'edit' ? c.before : b })
  for (const c of changes.filter((x): x is Extract<HistoryChange, { op: 'del' }> => x.op === 'del').sort((a, b) => a.index - b.index)) out.splice(Math.min(c.index, out.length), 0, c.before)
  const order = changes.find((x): x is Extract<HistoryChange, { op: 'order' }> => x.op === 'order')
  if (order) { const pos = new Map(order.before.map((id, i) => [id, i])); out = [...out].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)) }
  return out
}

/** 문서 기록(새 것부터) */
export function useDocHistory(projectId: string, docId: () => string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`doc-history-${projectId}`, async () => {
    const id = docId()
    if (preview) return previewStore().history.value.filter((h) => h.document_id === id)
    const { data, error } = await supabase.from('document_history').select('id, document_id, project_id, author_id, changes, summary, snapshot, created_at').eq('document_id', id).order('created_at', { ascending: false }).limit(200)
    if (error) return [] as DocHistoryRow[]
    return (data ?? []) as unknown as DocHistoryRow[]
  }, { watch: [docId], default: () => [] as DocHistoryRow[], server: false })
}

/** 문서 본문에서 'REQ-001 ...' 같은 번호 규칙을 찾아 요구사항 후보로 돌려줍니다 */
export function detectRequirements(doc: DocRow): { code: string; title: string; block: string | null }[] {
  const lines: { text: string; block: string | null }[] = doc.content_blocks
    ? doc.content_blocks.map((x) => ({ text: x.text, block: x.id }))
    : (doc.plain_text ?? '').split('\n').map((text) => ({ text, block: null }))
  const out: { code: string; title: string; block: string | null }[] = []
  for (const { text, block } of lines) {
    const m = text.match(/^\s*((?:REQ|FR|NFR|SR)-\d{1,4})[.)\s:-]+(.+)$/i)
    if (m) out.push({ code: m[1]!.toUpperCase(), title: m[2]!.trim(), block })
  }
  return out
}

/** 프로젝트별 요구사항 반영 현황(홈 카드용): { [projectId]: { done, total } } — '해당 없음'은 빼고 셉니다 */
export function useProjectProgress() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData('project-progress', async () => {
    const out: Record<string, { done: number; total: number }> = {}
    const add = (pid: string, status: LinkStatus) => {
      if (status === 'na') return
      const p = (out[pid] ??= { done: 0, total: 0 })
      p.total++
      if (status === 'reflected') p.done++
    }
    if (preview) {
      for (const l of previewStore().links.value) add('preview-1', l.status)
      return out
    }
    const { data, error } = await supabase.from('screen_requirements').select('status, requirements!inner(project_id)')
    if (error) throw error
    for (const row of (data ?? []) as unknown as { status: LinkStatus; requirements: { project_id: string } }[]) add(row.requirements.project_id, row.status)
    return out
  }, { deep: true })
}
