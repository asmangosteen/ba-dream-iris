# Iris(이리스) — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

> 2026-11-22: 바드림 디자인 시스템(`@ba-dream/design-system`)이 **Vue 3** 컴포넌트 라이브러리라서 Next.js(React)에서 **Nuxt(Vue)**로 바꿨습니다. 이제 바드림 컴포넌트를 앱 화면과 캔버스에 그대로 쓸 수 있습니다.

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Nuxt 4** (설치 시점 최신 안정 버전 고정, 현재 4.6) + Vue 3.5 + TypeScript | 바드림 디자인 시스템이 Vue 3라서 컴포넌트를 그대로 쓸 수 있다. 서버 작업(외부 링크 본문 가져오기, 피그마 호출)도 같은 프로젝트의 `server/api`에서 처리한다. |
| 디자인 시스템 | **`@ba-dream/design-system`** (Vue 3 컴포넌트 133종, 토큰, Pretendard, 아이콘 884개) | 앱 화면은 이 컴포넌트와 토큰으로만 만든다. 규칙은 디자인 시스템 저장소의 `docs/AUTO-MAKE.md`를 따른다. 모바일 앱 기준 문서지만 웹에도 최대한 적용한다. |
| 스타일 | Vue SFC `<style scoped>` + 디자인 시스템 CSS 변수 (`var(--sys-color-...)`, `var(--ref-spacing-...)`) | 디자인 시스템 문서 사이트와 같은 방식이다. 값을 숫자나 hex로 직접 쓰지 않고 토큰으로만 쓴다. Tailwind는 쓰지 않는다. 토큰과 겹치는 두 번째 규칙이 생기기 때문이다. |
| 캔버스 | **자체 DOM 캔버스** (HTML 요소 + CSS transform으로 줌·이동) | 토스 Deus와 같은 방식(DOM·웹 컴포넌트 기반)이다. Phase 2에서 **실제 바드림 Vue 컴포넌트를 캔버스에 그대로 렌더링**할 수 있고, Phase 3 코드 생성에도 유리하다. tldraw SDK는 React 전용인 데다 사내 운영에 유료 라이선스가 필요해서 제외했다. |
| 캔버스 상태 | Pinia + 변경 기록(명령) 방식 실행취소 | Vue 반응성은 바뀐 노드만 다시 그리는 세밀한 반응성이다(Deus가 MobX로 얻으려던 성질). 편집은 모두 "명령"으로 기록해서 실행취소, 다시실행, 자동저장을 한곳에서 처리한다. |
| DB/백엔드 | Supabase (Postgres + Auth + Storage), `@nuxtjs/supabase` 모듈 | 로그인, DB, 파일 저장소를 한곳에서 해결한다. 무료 플랜(DB 500MB, 파일 1GB, MAU 5만)으로 팀 규모를 충분히 감당한다. Phase 3에는 Realtime을 쓴다. |
| 인증 | Supabase Auth 이메일 OTP + 도메인 제한 | 회사 메일 서비스 종류와 상관없이 동작하고, 비밀번호를 관리할 필요가 없다. |
| 문서 작성 | **Tiptap** (`@tiptap/vue-3`, MIT) | Vue 3를 공식 지원하는 블록형 에디터다. 제목, 체크리스트, 표, 이미지, @멘션(화면·컴포넌트 연결)을 확장으로 붙인다. 유료 Pro 확장은 쓰지 않는다. |
| 문서 읽기 | PDF: `pdfjs-dist` / DOCX: `mammoth` / MD: `remark`·`rehype` / 링크: `@mozilla/readability` + `jsdom` / 정제: `isomorphic-dompurify` | 출처가 달라도 모두 "정제된 HTML + 제목 앵커"로 통일해서 하나의 읽기 뷰로 보여준다. 무거운 변환은 `server/api`에서 한다. |
| 글꼴 · 아이콘 | 디자인 시스템 `fonts.css`(Pretendard), `<Icon name="...">` | 따로 아이콘 라이브러리를 들이지 않는다. 캔버스 도구 아이콘(이동, 프레임, 사각형, 텍스트)처럼 디자인 시스템에 없는 것만 직접 그린다. |
| 피그마 연동 | Figma REST API (`GET /v1/files/:key/nodes`, `GET /v1/images/:key`), 서버에서만 호출 | 호출 한도(초과 시 429 오류)가 있으므로 한 번 불러와 DB와 Storage에 저장하고, 필요할 때만 수동으로 갱신한다. |
| 배포 | Vercel (Nuxt 프리셋) | Nuxt를 설정 없이 배포할 수 있고, 무료로 시작할 수 있다. |
| 테스트 | Vitest (+ `@nuxt/test-utils`) | 캔버스 순수 로직(좌표 변환, 실행취소, 스키마 마이그레이션)을 테스트한다. |

---

## 프로젝트 구조 (Nuxt 4)

```
iris/
├── app/
│   ├── app.vue
│   ├── assets/css/main.css         # 디자인 시스템 CSS import + Iris 공용 변수(--iris-*)
│   ├── pages/
│   │   ├── login.vue               # 로그인 (이메일 → 코드)
│   │   ├── index.vue               # 프로젝트 홈
│   │   ├── p/[projectId]/index.vue # 에디터 (페이지·화면)
│   │   ├── p/[projectId]/requirements.vue  # 요구사항 보드
│   │   └── design-system.vue       # 컴포넌트·토큰
│   ├── canvas/                     # ★ 캔버스 엔진 (UI와 분리)
│   │   ├── store.ts                # 노드 맵, 선택, 명령 기록 (Pinia)
│   │   ├── viewport.ts             # 줌·이동 계산 (화면↔캔버스 좌표 변환)
│   │   ├── commands/               # 이동, 크기조절, 만들기, 지우기… (실행 / 되돌리기 한 쌍)
│   │   ├── tools/                  # select, frame, rect, text, image
│   │   ├── render/                 # 노드 타입별 렌더러 Vue 컴포넌트 (div 기반)
│   │   ├── interactions/           # 드래그, 리사이즈 핸들, 단축키
│   │   └── schema.ts               # 레이어 JSON 타입 + schemaVersion 마이그레이션
│   ├── features/
│   │   ├── inspector/              # 우측 패널: 디자인·기획·개발 탭
│   │   ├── documents/              # 문서 리더, Tiptap 에디터, 업로드·링크
│   │   ├── requirements/           # 패턴 인식, 선택→생성, 연결
│   │   ├── figma/                  # 링크 파싱, 레이어 요약, 컴포넌트 매칭
│   │   └── design-system/
│   ├── components/                 # Iris 전용 공용 부품 (패널, 툴바 등)
│   ├── composables/                # useProject, useScreen, useRequirements…
│   └── middleware/auth.global.ts   # 로그인·도메인 확인
├── server/
│   ├── api/figma/                  # 피그마 프레임 불러오기 (서버 전용)
│   ├── api/documents/parse.post.ts # 업로드 파일 → 읽기용 HTML
│   └── api/documents/fetch-link.post.ts # 외부 링크 → 읽기용 HTML
├── shared/types/                   # DB 타입 (supabase gen types)
├── supabase/migrations/            # DB 테이블·RLS SQL (변경은 항상 새 파일로)
├── nuxt.config.ts
├── .env                            # 환경변수 (절대 커밋 X)
└── package.json
```

### 디자인 시스템 연결
`app/assets/css/main.css`에서 한 번만 불러온다:
```css
@import '@ba-dream/design-system/tokens.css';
@import '@ba-dream/design-system/style.css';
@import '@ba-dream/design-system/fonts.css';
```
컴포넌트는 이름으로 가져다 쓴다: `import { Button, Badge, Icon } from '@ba-dream/design-system'`.

### 캔버스 엔진 핵심 규칙
- 좌표계는 두 가지다.
  - **캔버스 좌표**: 저장되는 값이다.
  - **화면 좌표**: 마우스 위치다.
  - 두 좌표 사이의 변환은 `viewport.ts` 한 곳에서만 한다.
- 줌·이동은 캔버스 최상위 요소 하나에 `transform: translate() scale()`을 적용한다. 노드마다 줌을 계산하지 않는다.
- 노드 렌더러는 자기 노드(`nodes[id]`)만 읽는다. 노드 하나를 움직일 때 전체가 다시 그려지면 안 된다. 계산값은 `computed`로 쪼갠다.
- 선택 박스, 리사이즈 핸들, 크기 배지는 **오버레이 레이어**에 따로 그린다. 확대해도 두께가 일정해야 한다.
- 모든 편집은 `commands/`의 명령으로만 한다. 그래야 실행취소 기록과 자동저장이 한곳에서 처리된다.
- 자동저장은 마지막 편집 후 1초 뒤에 화면 단위로 묶어서 한다(디바운스). 탭을 닫을 때도 저장한다.
- 캔버스 위의 바드림 앱 화면(Iris 캔버스 화면)도 같은 디자인 시스템 토큰을 쓴다. Phase 2부터는 레이어 타입 `instance`로 실제 Vue 컴포넌트를 렌더링한다.

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] API 키, 피그마 토큰, Supabase service role 키를 코드나 브라우저 코드에 쓰지 마 (`.env` + `runtimeConfig`의 서버 전용 값)
- [ ] 기존 DB 테이블을 임의로 바꾸지 마. 변경은 새 마이그레이션 파일로 만들고, 먼저 설명해
- [ ] 목업·하드코딩 데이터로 완성이라고 하지 마
- [ ] `package.json`의 기존 의존성 버전을 마음대로 바꾸지 마
- [ ] React 라이브러리를 들이지 마 (Nuxt/Vue 프로젝트다)
- [ ] 디자인 시스템에 있는 부품(Button, Badge, TextInput, Tab, PopUp, Toast, NoticeBox…)을 직접 다시 만들지 마
- [ ] 색, 간격, 모서리, 글자 크기를 숫자나 hex로 쓰지 마. 디자인 시스템 토큰 변수만 써. 토큰에 정말 없는 값만 예외로 두고 보고해
- [ ] 글자를 Bold(700)로 쓰지 마. 최대 SemiBold(600)다 (AUTO-MAKE 4장). 화면 대제목만 디자인 시스템 사이트처럼 예외로 한다
- [ ] 글자 크기 · 버튼 크기를 화면마다 새로 정하지 마. `PRD/05_UI_GUIDE.md` 표의 값(페이지 제목 16 · 나머지 12, 버튼 26 · 32, 컨트롤 28)만 쓰고, 화면을 만든 뒤 `design/iris-canvas/hierarchy-audit.js`로 위반 0개를 확인해
- [ ] 둥근 요소를 `border-radius` 원호만으로 그리지 마. 모든 둥근 요소에 Corner smoothing 60%를 준다(AUTO-MAKE 5장). 디자인 시스템 컴포넌트는 이미 `Squircle` 레이어(`.bd-sq`)를 품고 있고, Iris가 직접 만드는 상자 · 버튼 · 칩도 같은 레이어로 채우기와 선을 그린다. 작업 캔버스 안의 사용자 화면은 사용자가 정한 모서리 그대로 둔다
- [ ] 앱 셸은 pen.dev 구조를 따른다: 화면 전체가 회색 캔버스(`neutral/100`)이고, 패널 · 사이드바 · 본문은 가장자리에서 8 띄운 흰 카드(1px `gray/900-10` + 옅은 그림자)로 띄운다. 맨 위는 왼쪽 · 오른쪽 알약 바, 탭과 거르기는 회색 채움 알약(`seg-item`), 주요 버튼은 바드림 primary(`brand/primary-default`), 탭 · 거르기 선택은 회색 채움이다. 사이드바 · 패널 안 글자는 12px 하나로 쓰고, 섹션 · 문서 제목은 같은 크기에 SemiBold, 보조 정보는 회색으로만 구분한다. 캔버스 위 프레임 이름 · 크기 표시만 피그마처럼 10~11px 예외다. 패널 바탕은 `common/white-emphasis`, 입력칸 · 드롭다운은 `neutral/200`이다. 값 입력칸 · 숫자는 Pretendard에 고정폭 숫자(`font-variant-numeric: tabular-nums`)를 켜서 쓰고, 코딩 글꼴은 코드 조각에만 쓴다. 배지 테두리와 캔버스 밖 선택 상태(선택된 카드 · 블록, 열린 드롭다운, 입력칸 포커스) 선은 0.5px로 쓴다. 캔버스 안 선택 표시는 예외다. 글자 위계(사이드바 그룹 라벨 12 M neutral-500, 항목 14 R neutral-600)는 디자인 시스템 사이트를 따른다
- [ ] 캔버스를 `<canvas>`, Konva, Fabric, tldraw로 바꾸지 마 (DOM 캔버스는 확정된 결정이다)
- [ ] 외부 링크와 업로드 문서의 HTML을 정제(DOMPurify) 없이 `v-html`로 넣지 마
- [ ] 피그마 API를 화면을 그릴 때마다 호출하지 마. 불러온 결과는 저장해서 다시 써
- [ ] Phase 1에 실시간 동시편집, AI 기능, 오토레이아웃을 넣지 마 (01_PRD.md "안 만드는 것")
- [ ] 레이어 JSON 구조(`02_DATA_MODEL.md`)를 바꾸면서 `schemaVersion` 마이그레이션 없이 배포하지 마
- [ ] 업로드 파일을 DB 칸에 넣지 마. 파일은 Supabase Storage에, DB에는 경로만 둬
- [ ] RLS(보안 규칙) 없이 테이블을 만들지 마. `@ba-dream.com` 멤버만 읽고 쓸 수 있어야 해
- [ ] 디자인 시스템 아이콘 SVG 원본을 공개 저장소에 복사하지 마 (바드림 사내 서비스 전용 라이선스)

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 계획을 먼저 보여줘
- [ ] 환경변수는 `.env`에 저장하고, `.env.example`에는 이름만 적어둬
- [ ] 에러가 나면 사용자에게 한국어로 친절한 메시지를 보여줘
  - 예: "피그마 호출 한도에 걸렸어요. 1분 뒤 다시 시도해주세요."
  - UX 라이팅은 디자인 시스템 AUTO-MAKE 12장을 따른다. "~해주세요"는 붙여 쓰고, 토스트는 "~되었어요."로 끝낸다.
- [ ] 데스크톱 웹(1280px 이상) 기준으로 만들어. 모바일에서는 읽기만 깨지지 않으면 돼
- [ ] 화면을 만들 때는 `design/iris-canvas/`의 HTML 시안을 기준으로 삼아
- [ ] 캔버스 단축키는 피그마와 같게 해
  - V 이동, F 프레임, R 사각형, T 텍스트, Space+드래그 화면 이동
  - Cmd+Z 실행취소, Shift+Cmd+Z 다시실행, Cmd+D 복제, Delete 삭제
  - Shift+1 전체 보기, Cmd+0 100%
- [ ] 각 기능을 마치면 "확인 방법"(어디를 눌러 무엇을 보면 되는지)을 알려줘
- [ ] 화면에 보이는 데이터는 로딩, 빈 상태, 오류 상태를 모두 만들어 (디자인 시스템 `Skeleton`, `EmptyState` 사용)
- [ ] 큰 기능을 마칠 때마다 Vercel 미리보기 배포로 실제 동작을 확인해

---

## 테스트 방법

```bash
# 로컬 실행
npm run dev

# 타입 체크
npx nuxi typecheck

# 린트
npm run lint

# 빌드 확인
npm run build

# 캔버스 순수 로직 단위 테스트
npx vitest run
```

---

## 배포 방법

1. 코드를 GitHub 저장소(`asmangosteen/ba-dream-iris`)에 올린다.
2. Supabase에서 프로젝트를 만든다.
   - `supabase/migrations`를 적용한다.
   - Auth 설정에서 Email OTP를 켜고 사이트 URL을 등록한다.
3. Vercel에서 저장소를 연결한다. 프레임워크가 Nuxt로 자동 인식된다. 환경변수를 입력한 뒤 배포한다.
4. 배포 URL로 접속해 `@ba-dream.com` 계정으로 로그인되는지 확인한다. 다른 도메인 이메일이 막히는지도 확인한다.

> ⚠️ Supabase 무료 플랜은 **1주일 동안 활동이 없으면 일시정지**된다. 팀이 매일 쓰면 문제없지만, 연휴 뒤에는 대시보드에서 재개해야 할 수 있다. 실사용이 안정되면 Pro 플랜(월 25달러)을 검토한다.

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 (`@nuxtjs/supabase` 2.x가 읽음) | Supabase 대시보드 > Settings > API |
| `NUXT_PUBLIC_SUPABASE_KEY` | 브라우저용 공개 키(anon · publishable). RLS로 보호된다 | 같은 곳 |
| `SUPABASE_SERVICE_KEY` | 서버 전용 관리자 키 (**브라우저 노출 금지**) | 같은 곳 |
| `NUXT_FIGMA_ACCESS_TOKEN` | 피그마 Personal Access Token (서버 전용 `runtimeConfig`) | Figma > Settings > Security > Personal access tokens |
| `NUXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | 로그인 허용 도메인 | 직접 입력: `ba-dream.com` |

> `.env` 파일에 저장. 절대 GitHub에 올리지 마세요. 이 저장소는 **공개**입니다.

---

## [NEEDS CLARIFICATION]

- [ ] 피그마 토큰을 발급할 계정과 피그마 플랜 (호출 한도가 여기에 달려 있음)
- [ ] 회사 메일이 구글 워크스페이스라면 Google 로그인(도메인 제한)을 추가할지
- [ ] Phase 2에서 캔버스에 올릴 바드림 컴포넌트의 `props_schema`를 디자인 시스템 `index.d.ts`(props 타입)에서 자동으로 뽑을지
- [ ] 도메인 연결 여부 (예: `iris.ba-dream.com`)
- [ ] 저장소 공개 여부 (지금은 공개라서 사내 기획 내용이 외부에 보임)
