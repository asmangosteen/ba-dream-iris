/**
 * 문서 추가 창 [Write] 의 틀 = 기획서 양식 가이드(public/guides/iris-planning-format.md) 5장 '종류별 뼈대'와 같은 내용.
 * 가이드를 고치면 여기도 함께 고쳐요. 표 세 개(문서 정보 · 요청사항 · 화면)는 Iris 가 읽는 모양 그대로예요.
 */
export type TemplateKey = 'service' | 'policy' | 'design' | 'dev' | 'blank'
export interface DocTemplate { key: TemplateKey; label: string; cat: 'planning' | 'dev' | 'design' | 'etc'; ko: string; en: string }

const info = (kindKo: string, kindEn: string, extraKo = '', extraEn = '') => ({
  ko: `## 문서 정보\n\n| 항목 | 내용 |\n| --- | --- |\n| 문서 종류 | ${kindKo} |\n| 문서 약어 | |\n| 버전 | v0.1 |\n| 상태 | 초안 |${extraKo}\n`,
  en: `## Document info\n\n| Item | Value |\n| --- | --- |\n| Document type | ${kindEn} |\n| Document abbreviation | |\n| Version | v0.1 |\n| Status | Draft |${extraEn}\n`,
})
const reqTable = { ko: '| ID | 요청사항 | 세부 규칙 |\n| --- | --- | --- |\n| P-AREA-01 | | |\n', en: '| ID | Request | Rules |\n| --- | --- | --- |\n| P-AREA-01 | | |\n' }
const screenTable = (p = 'P-AREA-01') => ({
  ko: `| ID | 화면 | 보여 줄 것 | 상태 | 요청사항 |\n| --- | --- | --- | --- | --- |\n| C-01 | | | | ${p} |\n`,
  en: `| ID | Screen | What to show | States | Request |\n| --- | --- | --- | --- | --- |\n| C-01 | | | | ${p} |\n`,
})

const service = info('서비스 기획서', 'Service spec')
const policy = info('정책서', 'Policy')
const design = info('디자인 요청서', 'Design request', '\n| 요청자 | |\n| 희망 완료일 | |', '\n| Requested by | |\n| Due | |')
const dev = info('개발 요청서', 'Dev request', '\n| 요청자 | |\n| 희망 배포일 | |', '\n| Requested by | |\n| Target release | |')

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: 'service', label: 'Service spec', cat: 'planning',
    ko: `${service.ko}\n## 배경 · 목표\n\n## 범위\n\n- 포함:\n- 제외:\n\n## 요청사항\n\n${reqTable.ko}\n## 화면\n\n${screenTable().ko}\n## 플로우\n\n## 결정 기록\n`,
    en: `${service.en}\n## Background · goals\n\n## Scope\n\n- In:\n- Out:\n\n## Requests\n\n${reqTable.en}\n## Screens\n\n${screenTable().en}\n## Flow\n\n## Decision log\n`,
  },
  {
    key: 'policy', label: 'Policy doc', cat: 'planning',
    ko: `${policy.ko}\n## 적용 범위\n\n## 용어\n\n## 요청사항\n\n${reqTable.ko}\n## 관련 화면\n\n${screenTable().ko}\n## 예외 · 변경 기록\n`,
    en: `${policy.en}\n## Applies to\n\n## Terms\n\n## Requests\n\n${reqTable.en}\n## Related screens\n\n${screenTable().en}\n## Exceptions · change log\n`,
  },
  {
    key: 'design', label: 'Design request', cat: 'design',
    ko: `${design.ko}\n## 요청 배경 · 목표\n\n## 대상 사용자\n\n## 범위\n\n- 포함:\n- 제외:\n\n## 요청사항\n\n| ID | 요청사항 | 세부 규칙 |\n| --- | --- | --- |\n| P-DSN-01 | | |\n\n## 대상 화면\n\n${screenTable('P-DSN-01').ko}\n## 산출물 · 형식\n\n- 피그마 프레임 이름: C-01 화면 이름, 상태는 C-01/상태\n- \n\n## 참고 자료\n\n## 일정 · 검토\n`,
    en: `${design.en}\n## Background · goals\n\n## Target users\n\n## Scope\n\n- In:\n- Out:\n\n## Requests\n\n| ID | Request | Rules |\n| --- | --- | --- |\n| P-DSN-01 | | |\n\n## Target screens\n\n${screenTable('P-DSN-01').en}\n## Deliverables · format\n\n- Figma frame names: C-01 Screen name, states as C-01/State\n- \n\n## References\n\n## Schedule · review\n`,
  },
  {
    key: 'dev', label: 'Dev request', cat: 'dev',
    ko: `${dev.ko}\n## 개요\n\n## 요청사항\n\n${reqTable.ko}\n## 화면\n\n${screenTable().ko}\n## API · 데이터\n\n## 예외 · 오류 처리\n\n## 권한\n\n## 이벤트 로그\n\n## 일정\n`,
    en: `${dev.en}\n## Overview\n\n## Requests\n\n${reqTable.en}\n## Screens\n\n${screenTable().en}\n## API · data\n\n## Exceptions · errors\n\n## Permissions\n\n## Event logging\n\n## Schedule\n`,
  },
  { key: 'blank', label: 'Blank', cat: 'etc', ko: '', en: '' },
]
