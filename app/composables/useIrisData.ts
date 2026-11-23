/**
 * 문서 · 요구사항 · 화면 연결 · 디자인 시스템 데이터.
 * 실제 모드에서는 Supabase(RLS: 멤버만)에서 읽고 쓰고, 개발용 미리보기에서는 아래 예시 데이터를 useState 에 담아 씁니다
 * (미리보기에서 바꾼 값은 새로고침하면 처음으로 돌아갑니다).
 */

export type DocCategory = 'planning' | 'dev' | 'design' | 'etc'
export type DocSource = 'native' | 'upload' | 'link'
export interface DocBlock { id: string; type: 'h1' | 'h2' | 'p' | 'li'; text: string }
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
}

export type ReqPriority = 'must' | 'should' | 'could'
export interface ReqRow {
  id: string
  project_id: string
  document_id: string
  code: string
  title: string
  body: string | null
  anchor: { block?: string } | null
  priority: ReqPriority | null
  origin: 'auto_pattern' | 'manual' | 'ai'
}

export type LinkStatus = 'reflected' | 'partial' | 'missing' | 'na'
export interface LinkRow { screen_id: string; requirement_id: string; status: LinkStatus; note: string | null }

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

export const DOC_CATEGORY_LABEL: Record<DocCategory, string> = { planning: '기획', dev: '개발', design: '디자인', etc: '기타' }
export const DOC_SOURCE_LABEL: Record<DocSource, string> = { native: '작성', upload: '파일', link: '링크' }
export const PRIORITY_LABEL: Record<ReqPriority, string> = { must: '필수', should: '권장', could: '선택' }
export const LINK_STATUS: Record<LinkStatus, { label: string }> = {
  reflected: { label: '반영됨' },
  partial: { label: '일부 반영' },
  missing: { label: '미반영' },
  na: { label: '해당 없음' },
}
/** 반영 상태 순환(상태 아이콘을 누를 때) — 시안과 같은 순서 */
export const NEXT_STATUS: Record<LinkStatus, LinkStatus> = { reflected: 'partial', partial: 'missing', missing: 'na', na: 'reflected' }
/** 목록에서 보여 줄 순서: 손볼 것부터 */
export const STATUS_ORDER: LinkStatus[] = ['missing', 'partial', 'reflected', 'na']
export const TOKEN_TYPE_LABEL: Record<TokenType, string> = { color: '색', typography: '글자', spacing: '간격', radius: '모서리', shadow: '그림자' }

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
]

const l = (screen_id: string, requirement_id: string, status: LinkStatus, note: string | null = null): LinkRow => ({ screen_id, requirement_id, status, note })
const PREVIEW_LINKS: LinkRow[] = [
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
  }
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2))

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------
const DOC_COLS = 'id, project_id, title, category, source_type, content_blocks, file_path, file_type, url, plain_text, fetch_status, version_label, updated_at'

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

/** 프로젝트의 요구사항 + 화면 연결 전체 (작은 팀 규모라 한 번에 읽습니다) */
export function useRequirements(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const reqs = useAsyncData(`reqs-${projectId}`, async () => {
    if (preview) return previewStore().reqs.value.map((x) => ({ ...x, project_id: projectId })) as ReqRow[]
    const { data, error } = await supabase.from('requirements').select('id, project_id, document_id, code, title, body, anchor, priority, origin').eq('project_id', projectId).order('code')
    if (error) throw error
    return (data ?? []) as unknown as ReqRow[]
  }, { deep: true })
  const links = useAsyncData(`links-${projectId}`, async () => {
    if (preview) return previewStore().links.value
    const { data, error } = await supabase.from('screen_requirements').select('screen_id, requirement_id, status, note, requirements!inner(project_id)').eq('requirements.project_id', projectId)
    if (error) throw error
    return ((data ?? []) as unknown as LinkRow[]).map(({ screen_id, requirement_id, status, note }) => ({ screen_id, requirement_id, status, note }))
  }, { deep: true })
  return { reqs, links }
}

/** 프로젝트의 모든 화면(페이지를 가로질러) — 요구사항 보드 · 연결 고르기용 */
export function useProjectScreens(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData(`all-screens-${projectId}`, async () => {
    if (preview) return Object.entries(PREVIEW_SCREENS).flatMap(([page_id, list]) => list.map((s) => ({ id: s.id, name: s.name, page_id, page: PREVIEW_PAGES.find((p) => p.id === page_id)?.name ?? '' })))
    const { data, error } = await supabase.from('screens').select('id, name, page_id, pages!inner(name, project_id)').eq('pages.project_id', projectId).order('sort_order')
    if (error) throw error
    return ((data ?? []) as unknown as { id: string; name: string; page_id: string; pages: { name: string } }[]).map((s) => ({ id: s.id, name: s.name, page_id: s.page_id, page: s.pages.name }))
  }, { deep: true })
}

/** 디자인 시스템: 컴포넌트 · 토큰 (워크스페이스 공용) */
export function useDesignSystem() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const components = useAsyncData('ds-components', async () => {
    if (preview) return previewStore().components.value
    const { data, error } = await supabase.from('components').select('id, name, code_name, category, description, match_aliases, props_schema').order('category').order('name')
    if (error) throw error
    return (data ?? []) as unknown as ComponentRow[]
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
    if (preview) return PREVIEW_USAGES.filter((x) => !ids || ids.includes(x.screen_id))
    let q = supabase.from('screen_component_usages').select('id, screen_id, component_id, detected_name, count')
    if (ids) {
      if (!ids.length) return [] as UsageRow[]
      q = q.in('screen_id', ids)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as UsageRow[]
  }, screenIds ? { watch: [screenIds], deep: true } : { deep: true })
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

  return { setLink, removeLink, addDocument, addRequirement, addComponent, addTokens }
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
