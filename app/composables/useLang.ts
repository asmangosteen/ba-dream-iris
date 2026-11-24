import { KO } from '~/i18n/ko'

/**
 * 화면 언어: 'en'(기본) · 'ko'. 계정 메뉴 · 편집기 메인 메뉴의 Language 에서 바꾸면 홈 · 캔버스 · 모든 화면이 함께 바뀌어요.
 * 쿠키(iris-lang)에 저장해서 서버가 처음 그릴 때부터 맞는 언어로 보여 줘요(깜빡임 없음) — 화면 모드(iris-theme)와 같은 방식.
 *
 * 문구 쓰는 법(PRD/07 §23):
 *   tr('Zoom to fit')                       → 영어 원문이 곧 열쇠. 한국어는 app/i18n/ko/*.ts 사전에서 찾고, 없으면 영어 그대로
 *   tr('Copied {n} frames', { n: 3 })       → {이름} 자리에 값을 넣어요(영어 · 한국어 모두)
 * 사용자가 쓴 내용(프로젝트 · 화면 · 레이어 이름, 문서 본문)은 번역하지 않아요.
 */
export type Lang = 'en' | 'ko'
export const LANG_LABEL: Record<Lang, string> = { en: 'English', ko: '한국어' } // 언어 이름은 늘 그 언어로

const COOKIE = 'iris-lang'
const ONE_YEAR = 60 * 60 * 24 * 400

function langState() {
  return useState<Lang>(COOKIE, () => (useCookie<Lang | null>(COOKIE).value === 'ko' ? 'ko' : 'en'))
}

// tr 은 화면마다 수백 번 불려요 — useState 를 매번 만들지 않고 앱 상태(payload.state, 반응형)에서 바로 읽어요.
// 아직 상태가 없으면(첫 호출) 쿠키로 한 번 만들어요
function currentLang(): Lang {
  const app = tryUseNuxtApp()
  if (!app) return 'en'
  const v = app.payload.state['$s' + COOKIE] as Lang | undefined
  if (v === 'ko' || v === 'en') return v
  return app.runWithContext(() => langState().value) as Lang
}

/** 지금 언어 · 바꾸기 */
export function useLang() {
  const lang = langState()
  const cookie = useCookie<Lang>(COOKIE, { maxAge: ONE_YEAR, sameSite: 'lax' })
  function setLang(l: Lang) { lang.value = l; cookie.value = l }
  return { lang, setLang }
}

/** 화면 문구: 영어 원문을 넣으면 지금 언어로 돌려줘요. vars 는 {이름} 자리 채우기 */
export function tr(en: string, vars?: Record<string, string | number>): string {
  const s = currentLang() === 'ko' ? (KO[en] ?? en) : en
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** 지금 한국어인지(문장 구조가 달라 tr 로 안 되는 곳에서만) */
export const isKo = () => currentLang() === 'ko'

/** app.vue 에서 한 번: <html lang> 을 맞춰요 */
export function useLangHead() {
  const { lang } = useLang()
  useHead({ htmlAttrs: { lang } })
}
