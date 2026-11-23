import type { ComponentRow } from './useIrisData'

/**
 * @ba-dream/design-system 컴포넌트 목록(기본 탑재).
 * 우리 디자인 시스템만 쓰므로 등록하지 않아도 처음부터 다 보입니다. DB(components)에 등록한 것은 여기 없는 이름만 덧붙습니다.
 * id 는 'ds:<이름>' — 피그마 레이어 이름 · 별칭으로 사용 화면을 셉니다.
 */
type Entry = [name: string, desc: string, aliases?: string[]]
const GROUPS: [category: string, items: Entry[]][] = [
  ['입력', [
    ['Button', '주요 동작 버튼. 화면당 primary 하나', ['btn', '버튼', 'cta']],
    ['IconButton', '아이콘만 있는 버튼', ['icon button']],
    ['TextButton', '글자만 있는 버튼', ['text button', 'link']],
    ['ButtonGroup', '버튼 둘 이상 나란히', ['button group']],
    ['TextInput', '한 줄 입력칸. 라벨 · 도움말 · 단위', ['textfield', 'input', '입력칸']],
    ['TextArea', '여러 줄 입력칸', ['textarea']],
    ['SearchField', '검색칸', ['search', '검색']],
    ['Select', '목록에서 고르기', ['select']],
    ['Dropdown', '펼쳐서 고르는 메뉴', ['dropdown']],
    ['Checkbox', '여러 개 고르기', ['check']],
    ['CheckboxCard', '카드 모양 체크', ['checkbox card']],
    ['RadioButton', '하나만 고르기', ['radio']],
    ['Toggle', '바로 켜고 끄기', ['switch', '토글']],
    ['Chip', '고른 값 · 태그', ['tag']],
    ['FilterChip', '거르기 칩', ['filter']],
    ['SegmentedControl', '두세 개 중 하나 고르기', ['segment']],
    ['Slider', '범위 값 고르기', ['range']],
    ['Stepper', '수량 늘리고 줄이기', ['counter']],
    ['DatePicker', '날짜 고르기', ['calendar picker']],
    ['TimePicker', '시간 고르기', ['time']],
    ['SignField', '서명 칸', ['signature']],
    ['UploadField', '파일 · 사진 올리기', ['upload', 'file upload']],
  ]],
  ['내비게이션', [
    ['TopBar', '화면 위 제목 줄', ['navigationbar', 'navbar', 'header', 'app bar']],
    ['NavBarTop', '내비게이션 바(위)', ['nav bar top']],
    ['BottomBar', '앱 아래 탭 막대', ['bottomnavigation', 'tabbar', 'bottom nav']],
    ['Tab', '같은 화면 안 내용 전환', ['tabs', '탭']],
    ['PageControl', '넘기는 화면의 위치 점', ['indicator', 'dots']],
    ['Pagination', '쪽 번호', ['paging']],
    ['StepIndicator', '단계 진행 표시', ['steps']],
    ['Menu', '펼친 메뉴 목록', ['menu list']],
  ]],
  ['표시', [
    ['Badge', '상태 · 개수 표시', ['배지']],
    ['NumericBadge', '숫자 배지', ['count badge']],
    ['Avatar', '사람 · 프로필 사진', ['profile']],
    ['Label', '입력칸 이름', ['caption']],
    ['Title', '섹션 제목', ['heading']],
    ['ListCommon', '목록 한 줄', ['listitem', 'list', 'row', 'cell']],
    ['ProductCardGrid', '상품 카드(격자)', ['product card', 'card']],
    ['ProductCardList', '상품 카드(목록)', ['product list']],
    ['PostListItem', '게시글 목록 한 줄', ['post']],
    ['Timeline', '진행 이력', ['history']],
    ['ProgressBar', '진행률 막대', ['progress']],
    ['Divider', '구분선', ['separator', 'line']],
    ['Tooltip', '짧은 도움말 말풍선', ['tip']],
    ['NoticeBox', '안내 상자', ['notice', 'banner', 'callout']],
    ['Calendar', '달력', []],
    ['Map', '지도', ['mapview']],
  ]],
  ['피드백', [
    ['Toast', '잠깐 뜨는 알림', ['snackbar']],
    ['PopUp', '가운데 확인 창', ['dialog', 'modal', 'alert']],
    ['BottomSheet', '아래에서 올라오는 창', ['sheet', '바텀시트']],
    ['Dimmed', '뒤를 어둡게', ['overlay', 'scrim']],
    ['Loading', '불러오는 중', ['loader']],
    ['Spinner', '도는 로딩 표시', []],
    ['Skeleton', '자리 표시 회색 막대', ['placeholder']],
    ['EmptyState', '비어 있을 때 안내', ['empty']],
    ['DoneState', '완료 안내', ['done', 'complete', 'illust/done']],
  ]],
]

export const DS_CATALOG: ComponentRow[] = GROUPS.flatMap(([category, items]) =>
  items.map(([name, description, aliases]) => ({ id: 'ds:' + name, name, code_name: name, category, description, match_aliases: aliases ?? [], props_schema: null })),
)

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./]/g, '')
const BY_KEY = new Map<string, string>()
for (const c of DS_CATALOG) for (const k of [c.name, ...(c.match_aliases ?? [])]) if (!BY_KEY.has(norm(k))) BY_KEY.set(norm(k), c.id)

/** 피그마 레이어 이름 → 기본 탑재 컴포넌트 id ('ds:…'). 'Button/Primary/L' 처럼 변형 이름은 앞부분으로 봅니다 */
export function matchCatalog(detected: string): string | null {
  return BY_KEY.get(norm(detected)) ?? BY_KEY.get(norm(detected.split('/')[0] ?? '')) ?? null
}
