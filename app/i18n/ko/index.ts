/**
 * 한국어 사전 — 열쇠는 영어 원문(tr 에 넣은 글자 그대로), 값은 한국어. 영역마다 파일을 나눠요(같은 열쇠는 뒤 파일이 이겨요).
 * 새 문구를 tr() 로 감싸면 그 영역 파일에 한국어를 꼭 같이 넣어 주세요. 빠지면 한국어 화면에 영어가 그대로 보여요.
 */
import common from './common'
import home from './home'
import workspace from './workspace'
import docs from './docs'
import editor from './editor'
import inspector from './inspector'
import newtab from './newtab'
import access from './access'
import collab from './collab'

/** 여러 영역이 같은 영어 열쇠에 다른 한국어를 넣었을 때 하나로 정한 값(맨 뒤라 늘 이겨요). 새로 겹치면 여기서 정해요 */
const SETTLED: Record<string, string> = {
  'Main menu': '메인 메뉴',
  'In progress': '진행 중',
  'All': '전체',
  'No frames yet': '아직 화면이 없어요',
  'Typography': '텍스트',
  'Use as mask': '마스크로 쓰기',
  'Remove auto layout': '자동 레이아웃 해제',
}

export const KO: Record<string, string> = { ...common, ...home, ...workspace, ...docs, ...editor, ...inspector, ...newtab, ...access, ...collab, ...SETTLED }
