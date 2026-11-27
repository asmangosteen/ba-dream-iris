/**
 * 떠 있는 창(메뉴 · 드롭다운 · 팝오버 · 알림 · 가운데 팝업 등) 바깥 누르기 공통 규칙 — 사용자 요청 2026-11-27:
 * 창이 열려 있을 때 그 창 바깥을 누르면, 어떤 도구 · 커서 상태든 최우선은 "보던 창 닫기"만 해요.
 * (그 누름으로 캔버스에 코멘트를 달거나 · 고르거나 · 다른 버튼이 눌리지 않아요. 다음 누름부터 평소대로)
 *
 * 창들은 각자 문서 바깥 누름(pointerdown, window · document capture)으로 닫혀요 → plugins/dismiss.client.ts 가 그 뒤(html capture)에서
 * 누름을 멈추고, 뒤따르는 click 도 삼켜요. window capture 에서 먼저 동작하는 것(코멘트 달기 · 이미지 자르기)은 dismissPress() 로 직접 비켜요.
 *
 * 예외: 코멘트 새 입력창 · 스레드 창은 기존 규칙(쓰던 글이 있으면 흔들어 알려 주기)을 따라요 — 여기서는 창으로 세지 않아요.
 * 상시 화면(변수 화면 등)도 세지 않아요.
 */
/** 창: 대화 상자 · 메뉴 · 떠 있는 목록(.menu). 창 안에 늘 붙어 있는 목록(검색 결과 · 아이콘 칸 등, .menu 가 아닌 listbox)은 따로 세지 않아요 */
/** 토큰(변수) 목록 창(.menu.tp)도 창 — 안 세면 설정 창 위에서 연 목록의 X · 줄 누르기가 '바깥 누르기'로 삼켜졌어요 */
const LAYERS = '[role="dialog"],[role="menu"],.menu[role="listbox"],.menu.tp'
const SKIP = '.vars, .cl .nw, .cl .pop.th, .gate'

const shown = (el: Element) => el.getClientRects().length > 0

/** 지금 열려 있는 창들 */
export function openLayers(): Element[] {
  return [...document.querySelectorAll(LAYERS)].filter((el) => !el.matches(SKIP) && shown(el))
}

/**
 * 이 누름이 "창 닫기만" 하는 누름인지: 열린 창이 있고, 누른 곳이 맨 안쪽 창(다른 열린 창을 품지 않은 창) 밖이며, 그 창을 여는 버튼(aria-expanded)도 아닐 때.
 * 가운데 팝업 안의 드롭다운 메뉴가 열려 있으면, 팝업 안 다른 곳을 눌러도 메뉴만 닫혀요
 */
export function dismissPress(e: Event): boolean {
  const t = e.target
  if (!(t instanceof Element)) return false
  const layers = openLayers()
  if (!layers.length) return false
  const leaves = layers.filter((l) => !layers.some((o) => o !== l && l.contains(o)))
  if (leaves.some((l) => l.contains(t))) return false
  if (t.closest('[aria-expanded="true"]')) return false
  // 칠 창이 열린 채 캔버스 위 그라디언트 점(.gh)을 끄는 건 그 창의 일부 — 막지 않아요(피그마와 같아요)
  if (t.closest('.gh')) return false
  // 칠 창이 열린 채 이미지 자르기 화면(막대 · 이미지 · 손잡이)을 누르는 것도 그 창의 일부
  if (t.closest('.crop-ui')) return false
  // 가운데 팝업 자체만 열려 있으면(안에 열린 메뉴 없음) 팝업 안 누름은 평소대로 — 바깥(어두운 바탕)은 팝업이 스스로 닫아요
  return true
}
