/**
 * 화면 모드: 'system'(기기 설정 따름) · 'light' · 'dark'.
 * 쿠키에 저장해서 서버가 처음 그릴 때부터 맞는 모드로 보여 줍니다(깜빡임 없음).
 * 'system' 이면 <html> 에 data-theme 를 달지 않고 CSS 의 prefers-color-scheme 가 고릅니다.
 */
export type ThemeMode = 'system' | 'light' | 'dark'

export function useTheme() {
  const mode = useCookie<ThemeMode>('iris-theme', { default: () => 'system', maxAge: 60 * 60 * 24 * 400, sameSite: 'lax' })
  return { mode, setMode: (m: ThemeMode) => { mode.value = m } }
}

/** app.vue 에서 한 번: <html data-theme> 와 color-scheme 를 맞춥니다 */
export function useThemeHead() {
  const { mode } = useTheme()
  useHead({
    htmlAttrs: { 'data-theme': computed(() => (mode.value === 'system' ? undefined : mode.value)) },
    meta: [{ name: 'color-scheme', content: computed(() => (mode.value === 'system' ? 'light dark' : mode.value)) }],
  })
}

/**
 * 로그인 전 화면(/welcome · /login)용: 라이트 · 다크 둘 중 하나로만 보여요.
 * 다크로 골랐을 때만 다크, 그 밖(라이트 · 기기 설정)은 라이트 — 금속 로고 조명이 흰 바탕 기준이라 기본은 라이트.
 * 여기서 고르면 같은 쿠키에 저장돼서 로그인 화면 · 안쪽 화면도 같은 모드가 돼요.
 */
export function usePublicTheme() {
  const { mode, setMode } = useTheme()
  const theme = computed<'light' | 'dark'>(() => (mode.value === 'dark' ? 'dark' : 'light'))
  useHead({
    htmlAttrs: { 'data-theme': theme },
    meta: [{ name: 'color-scheme', content: theme }],
  })
  return { theme, setTheme: (t: 'light' | 'dark') => setMode(t) }
}

export const THEME_LABEL: Record<ThemeMode, string> = { system: '기기 설정', light: '라이트', dark: '다크' }
