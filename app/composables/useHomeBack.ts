/**
 * 홈 안 프로젝트 화면들의 ← 뒤로 경로(사용자 결정 2026-11-28 — ←는 늘 홈 안에서만, 들어온 곳으로).
 *
 * - 프로젝트 첫 화면(개요) ← : 이 프로젝트에 들어온 홈 목록(프로젝트 목록 '/' 또는 문서 목록 '/documents')으로
 * - 요청사항 보기 ← : 개요로
 * - 문서에서 보기 ← : 바로 전 화면이 홈 화면이면 그리로, 아니면(캔버스 · 함께 보기에서 왔거나 주소로 바로) 개요로
 *
 * 들어온 목록은 프로젝트마다 기억해요(문서 목록 → 문서 → 개요 → ← 도 문서 목록으로). 새로 고침해도 남게 sessionStorage 에도
 */
const LISTS = ['/', '/documents']
const pathOf = (full: string) => full.split(/[?#]/)[0] ?? ''
const isList = (full: string) => LISTS.includes(pathOf(full))
const isHome = (full: string) => isList(full) || pathOf(full).startsWith('/project/')

export function useHomeBack(projectId: string) {
  const router = useRouter()
  const key = `iris-home-origin-${projectId}`
  const origin = useState<string | null>(key, () => {
    if (!import.meta.client) return null
    try { return sessionStorage.getItem(key) } catch { return null }
  })
  /** 바로 전 화면 주소(vue-router 가 history.state.back 에 넣어 둬요) */
  const prev = () => (import.meta.client ? ((window.history.state?.back as string | null | undefined) ?? null) : null)

  // 홈 목록에서 들어왔으면 그 목록을 기억
  if (import.meta.client) {
    const p = prev()
    if (p && isList(p)) {
      origin.value = p
      try { sessionStorage.setItem(key, p) } catch { /* 못 남겨도 '/' 로 */ }
    }
  }

  /** 가려는 곳이 바로 전 화면이면 브라우저 뒤로(기록이 쌓이지 않고 스크롤도 그대로), 아니면 그 주소로 바꿔 넣기 */
  function go(to: string) {
    if (prev() === to) router.back()
    else navigateTo(to, { replace: true })
  }
  const overview = `/project/${projectId}`

  return {
    /** 개요 ← : 들어온 목록으로 */
    fromOverview: () => go(origin.value ?? '/'),
    /** 요청사항 보기 ← : 개요로 */
    fromRequests: () => go(overview),
    /** 문서에서 보기 ← : 전 화면이 홈 화면이면 그리로, 아니면 개요로 */
    fromRead: () => {
      const p = prev()
      if (p && isHome(p) && !pathOf(p).startsWith(`${overview}/read/`)) router.back()
      else go(overview)
    },
  }
}
