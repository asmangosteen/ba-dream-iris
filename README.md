# Iris (이리스)

> 기획 · 디자인 · 개발을 잇는 무지개

바드림 팀 전용 웹 디자인 협업 툴입니다. 캔버스에서 화면을 클릭하면, 그 화면에 반영된 **기획 요구사항 · 관련 문서 · 사용 컴포넌트**를 바로 볼 수 있습니다.

처음에는 피그마 화면을 연결해 모아 보는 허브로 시작합니다. 이후 캔버스 기능을 하나씩 붙여서 피그마를 점진적으로 대체합니다.

이름은 그리스 신화에서 무지개의 여신이자 신들과 인간 사이를 오가며 소식을 전하는 전령 이리스(Iris)에서 따왔습니다.

## 접속

- **웹**: https://ba-dream-iris.vercel.app — 회사 메일(@ba-dream.com)로 로그인해요
- **데스크탑 앱(맥 · 윈도우)**: 아래 [데스크탑 앱](#데스크탑-앱-맥--윈도우)에서 설치 파일을 받아요

## 문서

| 문서 | 내용 |
|---|---|
| [PRD/README.md](PRD/README.md) | 확정된 결정, 레퍼런스, 미결 사항 |
| [PRD/01_PRD.md](PRD/01_PRD.md) | 제품 요구사항, 화면 구성, 디자인 방향 |
| [PRD/02_DATA_MODEL.md](PRD/02_DATA_MODEL.md) | 데이터 모델 |
| [PRD/03_PHASES.md](PRD/03_PHASES.md) | Phase 계획과 1주 일정 |
| [PRD/04_PROJECT_SPEC.md](PRD/04_PROJECT_SPEC.md) | 기술 스택, AI 코딩 규칙 |

## 기술 스택

- **앱**: Nuxt 4 (Vue 3) + TypeScript
- **디자인 시스템**: [`@ba-dream/design-system`](https://design-system.ba-dream.com)
- **백엔드**: Supabase (DB · 로그인 · 파일 저장)
- **배포**: Vercel
- **캔버스**: 자체 개발한 DOM 기반 캔버스. 화면 요소를 실제 HTML 요소로 그리는 방식으로, 토스 Deus와 같은 접근입니다.

## 데스크탑 앱 (맥 · 윈도우)

배포된 Iris 웹을 앱 창으로 여는 설치 파일이에요. 웹을 배포하면 앱에도 바로 반영돼서, 앱을 다시 설치할 필요는 없어요.

| 운영체제 | 내려받기 |
|---|---|
| macOS · Apple 실리콘 (M1 이후) | [Iris-0.1.2-mac-arm64.dmg](https://github.com/asmangosteen/ba-dream-iris/releases/download/desktop-v0.1.2/Iris-0.1.2-mac-arm64.dmg) |
| macOS · 인텔 | [Iris-0.1.2-mac-x64.dmg](https://github.com/asmangosteen/ba-dream-iris/releases/download/desktop-v0.1.2/Iris-0.1.2-mac-x64.dmg) |
| Windows (64비트) | [Iris-0.1.2-win-x64.exe](https://github.com/asmangosteen/ba-dream-iris/releases/download/desktop-v0.1.2/Iris-0.1.2-win-x64.exe) |

맥이 어느 쪽인지 모르겠으면 왼쪽 위 애플 메뉴 › **이 Mac에 관하여**에서 "칩"이 Apple M… 이면 Apple 실리콘, "프로세서"가 Intel… 이면 인텔이에요.

지난 버전은 [Releases](https://github.com/asmangosteen/ba-dream-iris/releases)에 있어요.

아직 애플 · 마이크로소프트 서명이 없어서 처음 열 때 경고가 떠요(한 번만).

- **맥**: dmg 를 열고 Iris 를 응용 프로그램 폴더로 끌어 넣어요. "열 수 없음" 경고가 뜨면 시스템 설정 › 개인정보 보호 및 보안 › 아래쪽 **그래도 열기**를 눌러요.
- **윈도우**: "Windows의 PC 보호" 창에서 **추가 정보** › **실행**을 눌러요.

빌드 방법은 [desktop/README.md](desktop/README.md)를 봐요.

## 개발

### 준비물

- Node.js 24 (지금 개발에 쓰는 버전)
- Supabase 프로젝트 접근 권한(키 받기), 피그마 Personal Access Token(피그마 화면 연결을 쓸 때)

### 처음 한 번

```bash
npm install            # 패키지 설치 (끝나면 nuxt prepare 가 자동으로 돌아요)
cp .env.example .env   # 아래 표대로 값을 채워요 — .env 는 커밋하지 않아요
```

| 환경 변수 | 내용 | 받는 곳 |
|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 | Supabase › Settings › API |
| `NUXT_PUBLIC_SUPABASE_KEY` | 브라우저용 공개 키(anon). RLS 로 보호돼요 | 같은 곳 |
| `SUPABASE_SERVICE_KEY` | 서버 전용 관리자 키 — **브라우저 · 커밋 금지** | 같은 곳 |
| `NUXT_FIGMA_ACCESS_TOKEN` | 피그마 화면 가져오기용 토큰(서버 전용) | Figma › Settings › Security |
| `NUXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | 로그인 허용 도메인 | `ba-dream.com` |
| `NUXT_PUBLIC_DEV_PREVIEW` | `1` 이면 로그인 없이 예시 데이터로 화면 확인(개발 서버에서만) | 직접 입력 |

자세한 설명은 [PRD/04_PROJECT_SPEC.md](PRD/04_PROJECT_SPEC.md)의 환경 변수 표에 있어요.

### 명령

```bash
npm run dev                                # 개발 서버 → http://localhost:3000
NUXT_PUBLIC_DEV_PREVIEW=1 npm run dev      # 로그인 없이 예시 데이터로 (DB 에 저장하지 않아요)
npm run typecheck                          # 타입 검사 — 커밋 전에 돌려요
npm run build && npm run preview           # 배포용으로 빌드해서 미리 보기
```

### 배포

- `main` 에 푸시하면 Vercel 이 자동으로 배포해요 → https://ba-dream-iris.vercel.app
- **DB 변경**은 `supabase/migrations/` 에 새 SQL 파일로 추가하고(이미 있는 파일은 고치지 않아요), Supabase › SQL Editor 에서 실행해요. 앱 코드보다 먼저 적용해야 배포 뒤 오류가 안 나요.
- 로그인 메일 양식은 `supabase/templates/` 의 HTML 을 Supabase › Authentication › Email Templates 에 붙여 넣어요.

### 폴더

| 폴더 | 내용 |
|---|---|
| `app/pages/` | 화면(로그인 · 홈 · 프로젝트 편집기 `p/[projectId]` · 요구사항) |
| `app/components/editor/` | 편집기 — 캔버스(`EditorCanvas.vue`), 레이어 그리기(`LayerView.vue`), 오른쪽 패널(`Inspector*.vue`) |
| `app/canvas/` | 캔버스 로직 — 레이어 저장 · 실행 취소(`store.ts`), 좌표 · 도형 계산, 이미지 올리기, 내보내기 |
| `app/composables/` · `app/plugins/` | 공용 기능(로그인 · 멤버 · 미리보기 데이터 등) · 앱 전체에 붙는 기능(squircle 모서리 · 스크롤 막대) |
| `app/i18n/` | 한국어 문구(기본 UI 는 영어, Language 에서 한국어로) |
| `server/api/` | 서버 API — 피그마 화면 가져오기, 링크 미리보기 |
| `shared/types/` | 앱 · 서버가 함께 쓰는 타입 |
| `supabase/` | DB 마이그레이션 SQL · 로그인 메일 양식 |
| `desktop/` | 데스크탑 앱(Electron) |
| `PRD/` | 기획 · 설계 문서 |
| `design/` · `prototype/` | 캔버스 시안 · 메일 · 로고, 브라우저용 HTML 프로토타입 |

### 규칙

- 글자 · 버튼 위계: [PRD/05_UI_GUIDE.md](PRD/05_UI_GUIDE.md)
- 편집기 단축키 · 동작은 피그마 기준: [PRD/09_FIGMA_PARITY.html](PRD/09_FIGMA_PARITY.html)
- 오류 · 저장 위험 안내: [PRD/10_ERROR_STATES.md](PRD/10_ERROR_STATES.md)
- 편집기 아이콘: [PRD/08_EDITOR_ICONS.md](PRD/08_EDITOR_ICONS.md)
