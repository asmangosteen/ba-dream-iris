/**
 * 위 탭 막대(피그마 데스크탑처럼): 맨 앞은 늘 홈 탭(프로젝트 목록 · 요구사항 · 디자인 시스템), 뒤로 연 프로젝트가 탭으로 쌓여요.
 * - 프로젝트를 열면(/p/<id>…) 그 프로젝트 탭이 생기고(이미 있으면 그 탭으로), 탭마다 마지막으로 보던 주소(문서 화면 등)를 기억해요
 * - 홈 탭도 마지막으로 보던 홈 화면('/' · '/requirements' · '/design-system')을 기억해요
 * - 열린 탭 목록은 이 기기(localStorage 'iris-tabs')에 남아 새로 고쳐도 그대로예요
 * - 새 탭(New file, /new): + 로 여는 탭 하나(id 'new'). 이미 열려 있으면 그 탭으로 가요.
 *   거기서 프로젝트를 열거나 만들면 adopt() 로 그 자리(같은 순서)의 탭이 그 프로젝트 탭으로 바뀌어요
 */
export interface ProjectTab { id: string; path: string }

const KEY = 'iris-tabs'
const HOME_PATHS = ['/', '/requirements', '/design-system']
/** 새 탭(New file) — 탭 id 와 주소 */
export const NEW_TAB_ID = 'new'
export const NEW_TAB_PATH = '/new'

/** 이 주소가 어느 탭인지: 프로젝트 화면이면 프로젝트 id, 새 탭이면 'new', 홈 화면 등이면 null */
export function tabIdOf(path: string): string | null {
  if (path === NEW_TAB_PATH) return NEW_TAB_ID
  const m = /^\/p\/([^/?#]+)/.exec(path)
  return m ? decodeURIComponent(m[1]!) : null
}
/** 탭 막대를 보여 줄 화면: 홈 화면들 + 새 탭 + 프로젝트 화면(로그인 · 환영 · 확인 화면은 빼요) */
export const showsTabs = (path: string) => HOME_PATHS.includes(path) || !!tabIdOf(path)

export function useTabs() {
  const tabs = useState<ProjectTab[]>('iris-tabs', () => [])
  const homePath = useState<string>('iris-tabs-home', () => '/')
  const loaded = useState<boolean>('iris-tabs-loaded', () => false)

  function load() {
    if (loaded.value || !import.meta.client) return
    loaded.value = true
    try {
      const pathOk = (t: ProjectTab) => typeof t.path === 'string' && (t.id === NEW_TAB_ID ? t.path === NEW_TAB_PATH : tabIdOf(t.path) === t.id)
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { tabs?: ProjectTab[]; home?: string } | null
      if (raw?.tabs?.length) {
        const have = new Set(tabs.value.map((t) => t.id))
        tabs.value = [...raw.tabs.filter((t) => t && typeof t.id === 'string' && !have.has(t.id)).map((t) => ({ id: t.id, path: pathOk(t) ? t.path : t.id === NEW_TAB_ID ? NEW_TAB_PATH : `/p/${t.id}` })), ...tabs.value]
      }
      if (raw?.home && HOME_PATHS.includes(raw.home)) homePath.value = raw.home
    } catch { /* 저장된 값이 깨졌으면 빈 탭으로 시작 */ }
  }
  function save() {
    if (!import.meta.client) return
    try { localStorage.setItem(KEY, JSON.stringify({ tabs: tabs.value, home: homePath.value })) } catch { /* 저장 못 해도 동작은 그대로 */ }
  }

  /** 주소가 바뀔 때마다: 프로젝트 화면이면 그 탭을 만들거나 마지막 주소를 고치고, 홈 화면이면 홈 탭 주소를 기억 */
  function track(fullPath: string, path: string) {
    const id = tabIdOf(path)
    if (id) {
      const t = tabs.value.find((x) => x.id === id)
      if (t) t.path = fullPath
      else tabs.value = [...tabs.value, { id, path: fullPath }]
    } else if (HOME_PATHS.includes(path)) homePath.value = path
    save()
  }

  /** 새 탭에서 프로젝트를 열거나 만들 때: 새 탭 자리(같은 순서)를 그 프로젝트 탭으로 바꿔요. 그 프로젝트 탭이 이미 있으면 새 탭만 닫아요 */
  function adopt(id: string) {
    const i = tabs.value.findIndex((t) => t.id === NEW_TAB_ID)
    const has = tabs.value.some((t) => t.id === id)
    if (i < 0) return
    const next = [...tabs.value]
    if (has) next.splice(i, 1)
    else next.splice(i, 1, { id, path: `/p/${id}` })
    tabs.value = next
    save()
  }

  /** 탭 닫기. 보고 있던 탭이면 오른쪽 탭(없으면 왼쪽, 그것도 없으면 홈)으로 옮겨요 */
  async function close(id: string, activeId: string | null) {
    const i = tabs.value.findIndex((t) => t.id === id)
    if (i < 0) return
    const next = tabs.value[i + 1] ?? tabs.value[i - 1]
    tabs.value = tabs.value.filter((t) => t.id !== id)
    save()
    if (activeId === id) await navigateTo(next ? next.path : homePath.value)
  }
  /** 지워졌거나 볼 수 없는 프로젝트 탭 정리(새 탭은 그대로)(목록을 다 읽은 뒤에만 부르세요) */
  function prune(valid: Set<string>, activeId: string | null) {
    const keep = tabs.value.filter((t) => valid.has(t.id) || t.id === activeId || t.id === NEW_TAB_ID)
    if (keep.length !== tabs.value.length) { tabs.value = keep; save() }
  }

  return { tabs, homePath, load, track, adopt, close, prune }
}
