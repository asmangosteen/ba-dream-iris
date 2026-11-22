# Iris(이리스) — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js (App Router, 설치 시점 최신 안정 버전 고정) + TypeScript | React 생태계가 가장 크고 AI 코딩 호환성이 가장 높다. 외부 링크 본문 가져오기·피그마 호출 같은 서버 작업을 같은 프로젝트에서 처리할 수 있다. |
| 캔버스 | **자체 DOM 캔버스** (HTML 요소 + CSS transform으로 줌·이동) | 토스 Deus와 같은 방식(DOM·웹 컴포넌트 기반). 실제 바드림 React 컴포넌트를 캔버스에 그대로 올릴 수 있어서 Phase 2 컴포넌트 배치, Phase 3 코드 생성에 유리하다. 라이선스 비용도 없다. tldraw SDK는 사내 운영에 유료 라이선스(10인 미만 연 약 6,000달러)가 필요해서 제외했다. |
| 캔버스 상태 | Zustand + Immer | 노드가 많아도 선택된 부분만 다시 그린다. Immer 패치로 실행취소를 구현하기 쉽다. Deus가 세밀한 반응성 때문에 MobX를 고른 것과 같은 목적이다. |
| DB/백엔드 | Supabase (Postgres + Auth + Storage) | 로그인·DB·파일 저장소를 한 곳에서 해결한다. 무료 플랜(DB 500MB, 파일 1GB, MAU 5만)으로 팀 규모를 충분히 감당한다. Phase 3에는 Realtime을 활용한다. |
| 인증 | Supabase Auth 이메일 OTP + 도메인 제한 | 회사 메일 서비스 종류와 상관없이 동작한다. 비밀번호를 관리할 필요가 없다. |
| 문서 작성 | BlockNote | 노션 스타일 블록 에디터가 바로 나온다. 핵심 패키지는 MPL-2.0이라 사내 사용이 무료다. `@blocknote/xl-*` 패키지(GPL)는 쓰지 않는다. |
| 문서 읽기 | PDF: `react-pdf`(pdf.js) / DOCX: `mammoth` / MD: `remark`·`rehype` / 링크: `@mozilla/readability` + `jsdom` / 정제: `DOMPurify` | 출처가 달라도 모두 "정제된 HTML + 제목 앵커"로 통일해서 하나의 읽기 뷰로 보여준다. |
| 앱 UI 부품 | Tailwind CSS 4 + shadcn/ui (Radix) + lucide 아이콘 | 패널·모달·탭·팝오버를 빠르게 만들 수 있다. 소스가 프로젝트 안에 복사되므로 Deus 스타일로 자유롭게 고칠 수 있다. |
| 글꼴 | Pretendard | 한국어 UI 표준 |
| 피그마 연동 | Figma REST API (`GET /v1/files/:key/nodes`, `GET /v1/images/:key`), 서버에서만 호출 | 호출 한도(초과 시 429 오류)가 있으므로 한 번 불러와 DB·Storage에 저장하고, 필요할 때만 수동으로 갱신한다. |
| 배포 | Vercel | Next.js를 가장 쉽게 배포할 수 있다. 무료로 시작할 수 있다. |

---

## 프로젝트 구조

```
iris/
├── src/
│   ├── app/
│   │   ├── (auth)/login/            # 로그인 (이메일 → 코드)
│   │   ├── (app)/page.tsx           # 프로젝트 홈
│   │   ├── (app)/p/[projectId]/     # 에디터 (페이지·화면)
│   │   ├── (app)/p/[projectId]/requirements/  # 요구사항 보드
│   │   ├── (app)/design-system/     # 컴포넌트·토큰
│   │   └── api/
│   │       ├── figma/               # 피그마 프레임 불러오기 (서버 전용)
│   │       ├── documents/parse/     # 업로드 파일 → 읽기용 HTML
│   │       └── documents/fetch-link/ # 외부 링크 → 읽기용 HTML
│   ├── canvas/                      # ★ 캔버스 엔진 (UI와 분리)
│   │   ├── store.ts                 # 노드 맵, 선택, 히스토리 (Zustand+Immer)
│   │   ├── viewport.ts              # 줌·이동 계산 (화면↔캔버스 좌표 변환)
│   │   ├── tools/                   # select, frame, rect, text, image
│   │   ├── render/                  # 노드 타입별 렌더러 (div 기반)
│   │   ├── interactions/            # 드래그, 리사이즈 핸들, 단축키
│   │   └── schema.ts                # 레이어 JSON 타입 + schemaVersion 마이그레이션
│   ├── features/
│   │   ├── inspector/               # 우측 패널: 디자인·기획·개발 탭
│   │   ├── documents/               # 문서 리더, 에디터, 업로드·링크
│   │   ├── requirements/            # 패턴 인식, 선택→생성, 연결
│   │   ├── figma/                   # 링크 파싱, 레이어 요약, 컴포넌트 매칭
│   │   └── design-system/
│   ├── components/ui/               # shadcn/ui 부품
│   ├── lib/supabase/                # 브라우저용·서버용 클라이언트
│   └── types/                       # DB 타입 (supabase gen types)
├── supabase/migrations/             # DB 테이블·RLS SQL (변경은 항상 새 파일로)
├── public/
├── .env.local                       # 환경변수 (절대 커밋 X)
└── package.json
```

### 캔버스 엔진 핵심 규칙
- 좌표계는 두 가지다: **캔버스 좌표**(저장되는 값)와 **화면 좌표**(마우스 위치). 변환은 `viewport.ts` 한 곳에서만 한다.
- 줌·이동은 캔버스 최상위 요소 하나에 `transform: translate() scale()`을 적용한다. 노드마다 줌 계산을 하지 않는다.
- 노드 렌더러는 `nodes[id]`만 구독한다. 노드 하나를 움직일 때 전체가 다시 그려지면 안 된다.
- 선택 박스·리사이즈 핸들·크기 배지는 **오버레이 레이어**에 따로 그린다. 확대해도 두께가 일정해야 한다.
- 모든 편집은 store의 action 함수로만 한다. 그래야 실행취소 기록과 자동저장이 한 곳에서 처리된다.
- 자동저장은 마지막 편집 후 1초 뒤에 화면 단위로 묶어 저장한다(디바운스). 탭을 닫을 때도 저장한다.

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] API 키·피그마 토큰·Supabase service role 키를 코드나 브라우저 코드에 쓰지 마 (`.env.local` + 서버 전용)
- [ ] 기존 DB 테이블을 임의로 바꾸지 마. 변경은 새 마이그레이션 파일로 만들고, 먼저 설명해
- [ ] 목업·하드코딩 데이터로 완성이라고 하지 마
- [ ] `package.json`의 기존 의존성 버전을 마음대로 바꾸지 마
- [ ] 캔버스를 `<canvas>`·Konva·Fabric·tldraw로 바꾸지 마 (DOM 캔버스는 확정된 결정)
- [ ] 외부 링크·업로드 문서의 HTML을 정제(DOMPurify) 없이 화면에 넣지 마
- [ ] 피그마 API를 화면을 그릴 때마다 호출하지 마. 불러온 결과는 저장해서 재사용해
- [ ] Phase 1에 실시간 동시편집, AI 기능, 오토레이아웃을 넣지 마 (01_PRD.md "안 만드는 것")
- [ ] 레이어 JSON 구조(`02_DATA_MODEL.md`)를 바꾸면서 `schemaVersion` 마이그레이션 없이 배포하지 마
- [ ] 업로드 파일을 DB 칸에 넣지 마. 파일은 Supabase Storage, DB에는 경로만
- [ ] RLS(보안 규칙) 없이 테이블을 만들지 마. `@ba-dream.com` 멤버만 읽고 쓸 수 있어야 해
- [ ] 화면 UI 문구를 영어로만 쓰지 마. 한국어가 기본이고, 디자인 속성 라벨(W, H, Fill, Radius)만 피그마 용어를 써

---

## 항상 해 (ALWAYS DO)

- [ ] 변경하기 전에 계획을 먼저 보여줘
- [ ] 환경변수는 `.env.local`에 저장하고, `.env.example`에 이름만 적어둬
- [ ] 에러가 나면 사용자에게 한국어로 친절한 메시지를 보여줘 (예: "피그마 호출 한도에 걸렸어요. 1분 뒤 다시 시도해주세요")
- [ ] 데스크톱 웹(1280px 이상) 기준으로 만들어. 모바일에서는 읽기만 깨지지 않으면 돼
- [ ] 캔버스 단축키는 피그마와 같게 해: V 이동, F 프레임, R 사각형, T 텍스트, Space+드래그 이동, Cmd+Z/Shift+Cmd+Z, Cmd+D 복제, Delete 삭제, Shift+1 전체 보기, Cmd+0 100%
- [ ] 각 기능을 마치면 "확인 방법"(어디를 눌러 무엇을 보면 되는지)을 알려줘
- [ ] 화면에 보이는 데이터는 로딩·빈 상태·오류 상태를 모두 디자인해
- [ ] 큰 기능을 마칠 때마다 Vercel 미리보기 배포로 실제 동작을 확인해

---

## 테스트 방법

```bash
# 로컬 실행
npm run dev

# 타입 체크
npx tsc --noEmit

# 린트
npm run lint

# 빌드 확인
npm run build

# 캔버스 순수 로직(좌표 변환, 실행취소, 스키마 마이그레이션) 단위 테스트
npx vitest run
```

---

## 배포 방법

1. GitHub에 비공개 저장소를 만들고 코드를 올린다.
2. Supabase에서 프로젝트를 생성한다.
   - `supabase/migrations`를 적용한다.
   - Auth 설정에서 Email OTP를 켜고, 사이트 URL을 등록한다.
3. Vercel에서 저장소를 연결하고 환경변수를 입력한 뒤 배포한다.
4. 배포 URL로 접속해 `@ba-dream.com` 계정으로 로그인한다. 다른 도메인 이메일이 차단되는지도 확인한다.

> ⚠️ Supabase 무료 플랜은 **1주일 동안 활동이 없으면 일시정지**된다. 팀이 매일 쓰면 문제없지만, 연휴 뒤에는 대시보드에서 재개해야 할 수 있다. 실사용이 안정되면 Pro 플랜(월 25달러)을 검토한다.

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 | Supabase 대시보드 > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저용 공개 키 (RLS로 보호) | 같은 곳 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 관리자 키 (**브라우저 노출 금지**) | 같은 곳 |
| `FIGMA_ACCESS_TOKEN` | 피그마 Personal Access Token (서버 전용) | Figma > Settings > Security > Personal access tokens |
| `ALLOWED_EMAIL_DOMAIN` | 로그인 허용 도메인 | 직접 입력: `ba-dream.com` |

> `.env.local` 파일에 저장. 절대 GitHub에 올리지 마세요.

---

## [NEEDS CLARIFICATION]

- [ ] 피그마 토큰 발급 계정과 피그마 플랜 (호출 한도 결정)
- [ ] 회사 메일이 구글 워크스페이스라면 Google 로그인(도메인 제한)을 추가할지
- [ ] 코드 저장소에 바드림 React 컴포넌트가 이미 있다면, 그 패키지를 Phase 2에서 캔버스에 직접 불러올지
- [ ] 도메인 (예: `iris.ba-dream.com`) 연결 여부
