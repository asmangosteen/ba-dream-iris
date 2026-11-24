import type { ComponentRow } from './useIrisData'

/**
 * @ba-dream/design-system 컴포넌트 목록(기본 탑재).
 * 우리 디자인 시스템만 쓰므로 등록하지 않아도 처음부터 다 보입니다. DB(components)에 등록한 것은 여기 없는 이름만 덧붙습니다.
 * id 는 'ds:<이름>' — 피그마 레이어 이름 · 별칭으로 사용 화면을 셉니다.
 */
type Entry = [name: string, desc: string, aliases?: string[]]
const GROUPS: [category: string, items: Entry[]][] = [
  ['Inputs', [
    ['Button', 'Main action button. One primary per screen', ['btn', '버튼', 'cta']],
    ['IconButton', 'Icon-only button', ['icon button']],
    ['TextButton', 'Text-only button', ['text button', 'link']],
    ['ButtonGroup', 'Two or more buttons side by side', ['button group']],
    ['TextInput', 'Single-line input. Label, helper text, unit', ['textfield', 'input', '입력칸']],
    ['TextArea', 'Multi-line input', ['textarea']],
    ['SearchField', 'Search field', ['search', '검색']],
    ['Select', 'Pick from a list', ['select']],
    ['Dropdown', 'Menu that opens to pick from', ['dropdown']],
    ['Checkbox', 'Pick several', ['check']],
    ['CheckboxCard', 'Card-style checkbox', ['checkbox card']],
    ['RadioButton', 'Pick one', ['radio']],
    ['Toggle', 'Turn on or off instantly', ['switch', '토글']],
    ['Chip', 'Selected value or tag', ['tag']],
    ['FilterChip', 'Filter chip', ['filter']],
    ['SegmentedControl', 'Pick one of two or three', ['segment']],
    ['Slider', 'Pick a value in a range', ['range']],
    ['Stepper', 'Increase or decrease a quantity', ['counter']],
    ['DatePicker', 'Pick a date', ['calendar picker']],
    ['TimePicker', 'Pick a time', ['time']],
    ['SignField', 'Signature field', ['signature']],
    ['UploadField', 'Upload files or photos', ['upload', 'file upload']],
    ['AddMedia', 'Tile to add photos or videos', ['add media', 'add photo']],
    ['FileRow', 'Uploaded file row', ['file row', 'file']],
    ['InputBar', 'Chat-style input bar at the bottom', ['input bar', 'chat input', 'composer']],
    ['ListSelect', 'List row with a radio or checkbox', ['list select', 'option row']],
  ]],
  ['Navigation', [
    ['TopBar', 'Title bar at the top of the screen', ['navigationbar', 'navbar', 'header', 'app bar']],
    ['NavBarTop', 'Navigation bar (top)', ['nav bar top']],
    ['BottomBar', 'Tab bar at the bottom of the app', ['bottomnavigation', 'tabbar', 'bottom nav']],
    ['Tab', 'Switch content within the same screen', ['tabs', '탭']],
    ['PageControl', 'Position dots for swipeable screens', ['indicator', 'dots']],
    ['Pagination', 'Page numbers', ['paging']],
    ['StepIndicator', 'Step progress indicator', ['steps']],
    ['Menu', 'Expanded menu list', ['menu list']],
  ]],
  ['Display', [
    ['Badge', 'Status or count', ['배지']],
    ['NumericBadge', 'Number badge', ['count badge']],
    ['Avatar', 'Person or profile photo', ['profile']],
    ['Label', 'Input field name', ['caption']],
    ['Title', 'Section title', ['heading']],
    ['ListCommon', 'Single list row', ['listitem', 'list', 'row', 'cell']],
    ['ListSort', 'Label and value row', ['list sort', 'key value', 'info row']],
    ['ProductCardGrid', 'Product card (grid)', ['product card', 'card']],
    ['ProductCardList', 'Product card (list)', ['product list']],
    ['PostListItem', 'Post list row', ['post']],
    ['PostComment', 'Comment', ['comment']],
    ['PostReply', 'Reply to a comment', ['reply']],
    ['Media', 'Photo or video thumbnail', ['photo', 'thumbnail', 'video']],
    ['Timeline', 'Progress history', ['history']],
    ['ProgressBar', 'Progress bar', ['progress']],
    ['Divider', 'Divider line', ['separator', 'line']],
    ['Tooltip', 'Short help bubble', ['tip']],
    ['NoticeBox', 'Notice box', ['notice', 'banner', 'callout']],
    ['Calendar', 'Calendar', []],
    ['Gradient', 'Fade over the edge of content', ['fade', 'gradient']],
    ['ScrollBar', 'Scroll position bar', ['scrollbar', 'scroll']],
    ['Footer', 'Company information footer', ['footer']],
  ]],
  ['Map', [
    ['MapPin', 'Location pin on the map', ['map', 'mapview', 'pin', 'marker']],
    ['MapPill', 'Place name pill on the map', ['map pill', 'place label']],
    ['MapCluster', 'Number of pins grouped together', ['cluster']],
    ['MapMyLocation', 'My location marker', ['my location', 'current location']],
    ['MapBottomBar', 'Action bar at the bottom of the map', ['map bar', 'map bottom bar']],
    ['MapBottomGuide', 'Guidance strip at the bottom of the map', ['map guide']],
  ]],
  ['Feedback', [
    ['Toast', 'Brief notification', ['snackbar']],
    ['PopUp', 'Centered confirmation dialog', ['dialog', 'modal', 'alert']],
    ['PopUpCard', 'Dialog card without the dimmed background', ['popup card', 'dialog card']],
    ['ToastCard', 'Toast card without positioning', ['toast card']],
    ['BottomSheet', 'Sheet that slides up from the bottom', ['sheet', '바텀시트']],
    ['Dimmed', 'Dims the background', ['overlay', 'scrim']],
    ['Loading', 'Loading', ['loader']],
    ['Spinner', 'Spinning loading indicator', []],
    ['Skeleton', 'Gray placeholder bars', ['placeholder']],
    ['EmptyState', 'Guidance when empty', ['empty']],
    ['DoneState', 'Completion message', ['done', 'complete', 'illust/done']],
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
