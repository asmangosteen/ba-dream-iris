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

export const THEME_LABEL: Record<ThemeMode, string> = { system: '기기 설정', light: '라이트', dark: '다크' }
