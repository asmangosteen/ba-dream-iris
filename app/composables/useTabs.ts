import { forgetEditorCache } from '~/composables/useEditor'
/**
 * 위 탭 막대(피그마 데스크탑처럼): 맨 앞은 늘 홈 탭(프로젝트 목록 · 요구사항 · 디자인 시스템), 뒤로 연 프로젝트가 탭으로 쌓여요.
 * - 프로젝트를 열면(/p/<id>…) 그 프로젝트 탭이 생기고(이미 있으면 그 탭으로), 탭마다 마지막으로 보던 주소(문서 화면 등)를 기억해요
 * - 홈 탭도 마지막으로 보던 홈 화면('/' · '/documents')을 기억해요
 * - 열린 탭 목록은 이 기기(localStorage 'iris-tabs')에 남아 새로 고쳐도 그대로예요
 * - 새 탭(New file, /new): + 로 여는 탭 하나(id 'new'). 이미 열려 있으면 그 탭으로 가요.
 *   거기서 프로젝트를 열거나 만들면 adopt() 로 그 자리(같은 순서)의 탭이 그 프로젝트 탭으로 바뀌어요
 */
/** pinned: 고정한 탭(피그마와 같아요) — 왼쪽에 모이고, 끌어서 옮길 수 없고, '다른 탭 닫기 · 모든 탭 닫기'로 닫히지 않아요(× · 가운데 클릭으로는 닫혀요) */
/**
 * 탭 새로 고침(피그마 데스크톱처럼 그 탭만): 탭 막대 · 다른 탭은 그대로 두고, 지금 화면만 다시 그리고 데이터를 다시 받아요.
 * app.vue 의 NuxtPage 열쇠에 이 숫자를 붙여 화면을 새로 만들어요(편집기는 로딩 화면이 떠요)
 */
export function useTabReload() {
  const key = useState('iris-reload-key', () => 0)
  /** 새로 고친 프로젝트: 새로 만든 편집기가 한 번 꺼내 써요(로딩 화면 · 다시 받기) */
  const pending = useState<string | null>('iris-reload-pending', () => null)
  function reload(projectId?: string | null) {
    if (projectId) { forgetEditorCache(projectId); pending.value = projectId }
    key.value++
  }
  function consume(projectId: string) {
    if (pending.value !== projectId) return false
    pending.value = null
    return true
  }
  return { key, reload, consume }
}

export interface ProjectTab { id: string; path: string; pinned?: boolean }

const KEY = 'iris-tabs'
/** 고정은 5개까지, 탭은 20개까지(넘으면 고정하지 않은 가장 왼쪽 탭부터 닫아요) */
export const MAX_PINNED = 5
export const MAX_TABS = 20
const HOME_PATHS = ['/', '/documents']
/** 홈 탭 화면: 프로젝트 목록 · 문서 + 프로젝트 첫 화면(/project/<id> — 캔버스를 열기 전까지는 홈이에요, 2026-11-28) */
const isHomePath = (path: string) => HOME_PATHS.includes(path) || path.startsWith('/project/')
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
export const showsTabs = (path: string) => isHomePath(path) || !!tabIdOf(path)

export function useTabs() {
  const tabs = useState<ProjectTab[]>('iris-tabs', () => [])
  const homePath = useState<string>('iris-tabs-home', () => '/')
  const loaded = useState<boolean>('iris-tabs-loaded', () => false)
  /** 탭이 너무 많아 자동으로 닫은 횟수(탭 막대가 알림을 띄워요) */
  const evicted = useState<number>('iris-tabs-evicted', () => 0)

  /** 닫은 프로젝트 탭은 불러온 데이터를 잊어요 — 다시 열면 새로 여는 것이라 로딩 화면이 뜨고 최신으로 다시 받아요(열린 탭끼리 옮길 땐 바로) */
  const forget = (id: string) => { if (id !== NEW_TAB_ID) forgetEditorCache(id) }

  function load() {
    if (loaded.value || !import.meta.client) return
    loaded.value = true
    try {
      const pathOk = (t: ProjectTab) => typeof t.path === 'string' && (t.id === NEW_TAB_ID ? t.path === NEW_TAB_PATH : tabIdOf(t.path) === t.id)
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { tabs?: ProjectTab[]; home?: string } | null
      if (raw?.tabs?.length) {
        // 저장된 순서 그대로, 이미 그려 둔 탭(지금 보는 탭)은 그 자리에서 최신 주소로. 저장에 없던 탭은 뒤에
        const now = new Map(tabs.value.map((t) => [t.id, t]))
        const stored = raw.tabs.filter((t) => t && typeof t.id === 'string').map((t) => ({ id: t.id, path: now.get(t.id)?.path ?? (pathOk(t) ? t.path : t.id === NEW_TAB_ID ? NEW_TAB_PATH : `/p/${t.id}`), ...(t.pinned ? { pinned: true } : {}) }))
        const ids = new Set(stored.map((t) => t.id))
        tabs.value = [...stored, ...tabs.value.filter((t) => !ids.has(t.id))]
      }
      if (raw?.home && isHomePath(raw.home.split(/[?#]/)[0]!)) homePath.value = raw.home
    } catch { /* 저장된 값이 깨졌으면 빈 탭으로 시작 */ }
  }
  function save() {
    // 저장된 목록을 읽기 전에는 쓰지 않아요(처음 그릴 때 지금 탭만 있는 목록으로 덮어쓰지 않게)
    if (!import.meta.client || !loaded.value) return
    try { localStorage.setItem(KEY, JSON.stringify({ tabs: tabs.value, home: homePath.value })) } catch { /* 저장 못 해도 동작은 그대로 */ }
  }

  /** 주소가 바뀔 때마다: 프로젝트 화면이면 그 탭을 만들거나 마지막 주소를 고치고, 홈 화면이면 홈 탭 주소를 기억 */
  function track(fullPath: string, path: string) {
    const id = tabIdOf(path)
    if (id) {
      const t = tabs.value.find((x) => x.id === id)
      if (t) t.path = fullPath
      else {
        let next = [...tabs.value, { id, path: fullPath }]
        // 탭이 20개를 넘으면 고정하지 않은 가장 왼쪽(가장 먼저 연) 탭을 닫아요
        while (next.length > MAX_TABS) {
          const old = next.find((x) => !x.pinned && x.id !== id)
          if (!old) break
          next = next.filter((x) => x !== old)
          forget(old.id)
          evicted.value = (evicted.value ?? 0) + 1
        }
        tabs.value = next
      }
    } else if (isHomePath(path)) homePath.value = fullPath // 쿼리까지(요청사항 보기 ?view=requests 등) — 함께 보기 탭에서 홈으로 와도 보던 화면 그대로
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
    forget(id)
    save()
    if (activeId === id) await navigateTo(next ? next.path : homePath.value)
  }
  /** 고정 · 풀기: 고정한 탭은 왼쪽(고정한 순서대로) */
  function togglePin(id: string): boolean {
    const cur = tabs.value.find((t) => t.id === id)
    if (!cur) return false
    if (!cur.pinned && tabs.value.filter((t) => t.pinned).length >= MAX_PINNED) return false
    const list = tabs.value.map((t) => (t.id === id ? { ...t, pinned: !t.pinned || undefined } : t))
    tabs.value = [...list.filter((t) => t.pinned), ...list.filter((t) => !t.pinned)]
    save()
    return true
  }
  /** 끌어서 순서 바꾸기: at = 끄는 탭을 뺀 나머지 목록에서 끼울 번호. 고정한 탭은 움직이지 않고, 나머지는 고정 탭 뒤로만 */
  function move(id: string, at: number) {
    const from = tabs.value.findIndex((t) => t.id === id)
    if (from < 0) return
    const t = tabs.value[from]!
    if (t.pinned) return
    const list = tabs.value.filter((x) => x.id !== id)
    const idx = Math.min(list.length, Math.max(at, list.filter((x) => x.pinned).length))
    if (idx === from) return
    list.splice(idx, 0, t)
    tabs.value = list
    save()
  }
  /** 다른 탭 닫기 · 모든 탭 닫기(고정한 탭은 남아요). 보고 있던 탭이 닫히면 남은 탭(없으면 홈)으로 */
  async function closeMany(keep: string | null, activeId: string | null) {
    const next = tabs.value.filter((t) => t.pinned || t.id === keep)
    for (const t of tabs.value) if (!next.includes(t)) forget(t.id)
    tabs.value = next
    save()
    if (activeId && !next.some((t) => t.id === activeId)) await navigateTo(next.find((t) => t.id === keep)?.path ?? next[next.length - 1]?.path ?? homePath.value)
  }
  /** 지워졌거나 볼 수 없는 프로젝트 탭 정리(새 탭은 그대로)(목록을 다 읽은 뒤에만 부르세요) */
  function prune(valid: Set<string>, activeId: string | null) {
    const keep = tabs.value.filter((t) => valid.has(t.id) || t.id === activeId || t.id === NEW_TAB_ID)
    if (keep.length !== tabs.value.length) { tabs.value = keep; save() }
  }

  return { tabs, homePath, evicted, load, track, adopt, close, closeMany, togglePin, move, prune }
}
