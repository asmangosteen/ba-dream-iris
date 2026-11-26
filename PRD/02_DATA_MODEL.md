# Iris(이리스) — 데이터 모델

> 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.
> 뼈대는 토스 Deus의 `Project → Page → Frame (+ 컴포넌트 id 참조)` 트리이고, 여기에 **문서 · 요구사항**을 같은 프로젝트 안에 붙였습니다.

---

## 전체 구조

```
[Workspace 바드림]
  ├─1:N─> [Member 멤버]
  ├─1:N─> [Component 컴포넌트] ──┐
  ├─1:N─> [Token 토큰]           │
  ├─1:1─> [FigmaConnection]      │
  └─1:N─> [Project 프로젝트]      │
            ├─1:N─> [Document 문서]
            │          └─1:N─> [Requirement 요구사항] ─┐
            └─1:N─> [Page 페이지 = 캔버스 1장]           │
                       └─1:N─> [Screen 화면 = 최상위 프레임]
                                  ├─ layers (화면 안 레이어 트리, JSON)
                                  ├─N:M─> [ScreenRequirement] <─┘  (반영 상태)
                                  └─N:M─> [ScreenComponentUsage] <──┘ (사용 컴포넌트)
```

**핵심 아이디어**
- **페이지 = 캔버스 1장**이고, **화면 = 캔버스 위 최상위 프레임**이다. 피그마에서 한 페이지 안에 여러 프레임이 놓이는 것과 같다.
- 화면을 선택했을 때 보여줄 정보는 모두 화면에 걸린 연결로 찾는다.
  - **기획 탭**: `ScreenRequirement`로 연결된 요구사항과, 그 요구사항이 나온 문서
  - **개발 탭**: `ScreenComponentUsage`로 연결된 컴포넌트, 그리고 토큰

---

## 엔티티 상세

### Workspace (워크스페이스)
바드림 팀 전체를 담는 상자. Phase 1에는 하나만 존재하지만, 나중을 위해 테이블로 둔다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | ws_01 | O |
| name | 이름 | 바드림 | O |
| allowed_email_domain | 로그인 허용 도메인 | ba-dream.com | O |
| created_at | 생성일 | 2026-11-23 | O |

### Member (멤버)
로그인한 팀원. Supabase Auth 사용자와 1:1로 대응한다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | Auth 사용자 id | uuid | O |
| workspace_id | 소속 워크스페이스 | ws_01 | O |
| email | 회사 이메일 | (`@ba-dream.com`) | O |
| name | 표시 이름 | 김기획 | O |
| role | 직무 (표시·필터용, 권한 아님) | planner / designer / developer | O |
| avatar_url | 프로필 이미지 | storage 경로 | X |
| is_admin | 관리자 (디자인 시스템·멤버 관리) | false | O |

### Project (프로젝트)
하나의 개편이나 기능 단위.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | prj_01 | O |
| workspace_id | 소속 | ws_01 | O |
| name | 이름 | 착한구독 신청 플로우 개편 | O |
| description | 설명 | GA4 이탈률 개선 목적 | X |
| kind | 시작 유형 | app / web / detail_page | O |
| status | 진행 상태 | planning / designing / developing / done | O |
| cover_screen_id | 카드 썸네일로 쓸 화면 | scr_03 | X |
| created_by | 만든 사람 | member id | O |
| created_at / updated_at | 생성·수정일 | | O |

### Page (페이지)
프로젝트 안의 캔버스 1장. 보통 플로우 단위로 나눈다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | pg_01 | O |
| project_id | 소속 프로젝트 | prj_01 | O |
| name | 이름 | 신청 플로우 | O |
| sort_order | 좌측 목록 순서 | 1 | O |
| viewport | 마지막 줌·위치 (멤버별 로컬 저장 우선) | `{x:0,y:0,zoom:0.5}` | X |

### Screen (화면)
캔버스 위의 최상위 프레임 하나. **피그마 연결 화면**과 **자체 캔버스 화면** 두 종류가 있다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | scr_02 | O |
| page_id | 소속 페이지 | pg_01 | O |
| name | 화면 이름 | 신청_02_요금제선택 | O |
| source | 출처 | `figma` / `native` | O |
| x, y, width, height | 캔버스 위 위치·크기 | 400, 0, 375, 812 | O |
| device | 기기 프리셋 | iPhone 13 mini / Desktop 1440 | X |
| layers | 화면 안 레이어 트리 (native 전용, 아래 "레이어 구조" 참고) | JSON | X |
| figma_file_key | 피그마 파일 키 | AbC123 | figma일 때 |
| figma_node_id | 피그마 프레임 노드 id | 12:345 | figma일 때 |
| figma_url | 원본 링크 | https://figma.com/design/... | figma일 때 |
| thumbnail_path | 썸네일 이미지 (Storage) | screens/scr_02.png | X |
| figma_layer_summary | 피그마 레이어 요약 (이름·타입·컴포넌트 키) | JSON | X |
| figma_synced_at | 마지막으로 피그마에서 불러온 시각 | 2026-11-24 10:12 | X |
| status | 화면 상태 | draft / review / approved | O |
| sort_order | 플로우 순서 | 2 | O |
| updated_by / updated_at | 마지막 수정자·시각 | | O |

#### 레이어 구조 (`Screen.layers`, native 화면)
id로 찾아가는 평평한 목록이다. 부모·자식 관계는 `parentId`와 `children`으로 표현한다. 레이어 이동과 실행취소를 단순하게 만들고, Phase 3에서 실시간 동기화 도구로 옮기기도 쉬운 구조다.

```json
{
  "rootIds": ["n1"],
  "nodes": {
    "n1": { "id": "n1", "type": "frame", "name": "Header", "parentId": null,
            "children": ["n2", "n3"], "x": 0, "y": 0, "w": 375, "h": 56,
            "style": { "fill": "#FFFFFF", "radius": 0,
                       "vars": { "fill": "--sys-color-common-white-default" } } },
    "n2": { "id": "n2", "type": "text", "name": "Title", "parentId": "n1",
            "x": 20, "y": 16, "w": 200, "h": 24,
            "text": "요금제 선택",
            "style": { "fontSize": 20, "lineHeight": 28, "letterSpacing": -0.1, "fontWeight": 700,
                       "vars": { "textStyle": "ts:title", "fontWeight": "--font-weight-bold" } } },
    "n3": { "id": "n3", "type": "image", "name": "Back", "parentId": "n1",
            "x": 335, "y": 16, "w": 24, "h": 24, "src": "storage://assets/back.svg",
            "rotation": 90, "flipX": true, "lockRatio": true,
            "style": { "radii": [8, 8, 0, 0] } }
  },
  "schemaVersion": 7
}
```
- Phase 1 레이어 타입: `frame` · `rect` · `text` · `image`
- 위치 `x` · `y` 는 부모(화면 또는 프레임 레이어) 왼쪽 위 기준, `w` · `h` 는 돌리기 전 상자 크기다.
- **schemaVersion 2 (2026-11-23)** 에서 더한 값. 모두 비어 있어도 되는 값이라 v1 문서는 그대로 읽히고(`app/canvas/schema.ts` 의 `migrate()`), 다음 저장 때 `schemaVersion: 2` 로 저장된다.

| 필드 | 설명 | 예시 | 기본 |
|---|---|---|---|
| rotation | 가운데를 축으로 돌린 각도(도, 시계 방향, -180 초과 ~ 180 이하) | 15 | 없음 = 0 |
| flipX / flipY | 좌우 · 상하 뒤집기(가운데 축). 프레임이면 안의 레이어도 함께 뒤집혀 보인다 | true | 없음 = false |
| lockRatio | 비율 고정. 켜면 W · H 를 고치거나 크기를 끌 때 비율을 지킨다 | true | 없음 = 이미지만 고정 |
| style.radii | 모서리 따로 `[왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래]`. 있으면 `style.radius` 대신 쓴다 | [12, 12, 0, 0] | 없음 = `radius` 하나 |

- 그릴 때 순서: `transform: rotate(rotation) scaleX(flipX ? -1 : 1) scaleY(flipY ? -1 : 1)`, 축은 상자 가운데.
- Phase 2 추가: `instance` (컴포넌트 배치, `componentId` + `props`), `layout` 속성 (Stack)
- **schemaVersion 3 (2026-11-23)**: 변수(토큰) 연결 `style.vars` 와 자간 `style.letterSpacing` 을 더했다. 역시 비어 있어도 되는 값이라 v1 · v2 문서는 그대로 읽힌다.

| 필드 | 설명 | 예시 | 기본 |
|---|---|---|---|
| style.letterSpacing | 자간(px) | -0.04 | 없음 = 0 |
| style.vars | 속성 키 → 연결한 토큰 id. 피그마 변수처럼 값마다 디자인 시스템 토큰을 연결한다 | `{ "fill": "--sys-color-brand-primary-default", "radius": "--ref-radius-04" }` | 없음 = 연결 없음 |

- **연결할 수 있는 키**: `fill` · `stroke` · `color`(색), `strokeWidth`(선 두께), `radius` · `radii.0`~`radii.3`(모서리), `opacity`(투명도), `fontSize` · `lineHeight` · `letterSpacing` · `fontWeight` · `textStyle`(글자), `x` · `y` · `w` · `h`(간격 토큰). `shadow` 는 효과 속성이 생기면 쓴다.

- **schemaVersion 4 (2026-11-23)**: 화면(프레임) 자체의 모양 `frame` 을 문서 맨 위에 더했다. 레이어 `style` 과 같은 모양(LayerStyle)이라 채우기 · 선 · 모서리 · 투명도 · 내용 자르기 · 토큰 연결(`frame.vars`)을 똑같이 쓴다. 없으면 흰 바탕 · 선 없음 · 모서리 0 · 내용 자르기 켬. v1~v3 문서는 그대로 읽힌다.

| 필드 | 설명 | 예시 | 기본 |
|---|---|---|---|
| frame.fill | 화면 바탕색. `""` 이면 투명(채우기 뺌) | `"#F6F7F7"` | 없음 = 흰색 |
| frame.stroke · frame.strokeWidth | 화면 테두리(안쪽 선). 둘 다 있어야 보인다 | `"#202837"`, `1` | 없음 = 선 없음 |
| frame.radius | 화면 모서리 | `24` | 0 |
| frame.opacity · frame.clip | 투명도(0~1) · 내용 자르기(false 면 화면 밖도 보임) | `0.8`, `false` | 1, true |

- **schemaVersion 5 (2026-11-23)**: 2묶음(도형 · 스타일). 새 레이어 종류와 스타일 값이 더해졌다. 모두 비어 있어도 되는 값이라 v1~v4 문서는 그대로 읽힌다.
  - 레이어 종류: `ellipse`(원) · `line`(선 · 화살표) · `polygon`(다각형) · `star`(별) · `path`(연필) · `section`(섹션 — 자식을 담고, 캔버스 위에서는 화면 아래에 깔리며 옮기면 안에 든 화면도 함께 움직임)
  - `pts`: 선 · 연필의 점 [x0, y0, x1, y1, …] — 레이어 상자 안 0~1 비율. `closed`: 연필 닫힌 모양

| 필드 | 설명 | 예시 | 기본 |
|---|---|---|---|
| style.fills | fill 위에 쌓는 칠 목록(마지막이 맨 위). `solid` · `linear` · `radial` · `image` | `[{"type":"linear","angle":180,"stops":[{"pos":0,"color":"#2C7BE2"},{"pos":1,"color":"#2C7BE200"}]}]` | 없음 |
| style.strokes | stroke 위에 쌓는 선 색 | `[{"type":"solid","color":"#FF0000"}]` | 없음 |
| style.strokeAlign | 선 위치 inside · center · outside | `"outside"` | 상자 도형 inside, 선 · 연필 center |
| style.dash | 점선 [선, 간격] | `[4, 4]` | 실선 |
| style.cap · arrowStart · arrowEnd | 선 끝 모양, 화살표(arrow · triangle · circle) | `"round"`, `"arrow"` | butt, 없음 |
| style.effects | 효과: drop · inner(그림자), blur · bgblur(흐림) | `[{"type":"drop","x":0,"y":4,"blur":4,"spread":0,"color":"#00000040"}]` | 없음 |
| style.blend | 혼합 모드(CSS mix-blend-mode) | `"multiply"` | normal |
| style.sides · points · inner | 다각형 꼭짓점 · 별 꼭짓점 · 별 안쪽 비율 | `5`, `5`, `0.38` | 3, 5, 0.38 |
| style.fit · crop | 이미지 채우기(fill · fit · crop · tile), 자르기 { scale, x, y } | `"crop"`, `{"scale":1.5,"x":50,"y":30}` | fill |
| style.decoration · textCase · list · paraSpacing | 밑줄 · 취소선, 대소문자, 글머리 · 번호 목록, 문단 간격 | `"underline"`, `"upper"`, `"bullet"`, `8` | 없음 |

- **schemaVersion 6 (2026-11-23)**: 3묶음(레이아웃). 모두 비어 있어도 되는 값이라 v1~v5 문서는 그대로 읽힌다. 오토 레이아웃은 바뀔 때마다 자식 x · y · w · h 를 다시 계산해 써 넣는다(`app/canvas/layout.ts`).

| 필드 | 설명 | 예시 | 기본 |
|---|---|---|---|
| style.layout | 오토 레이아웃: mode(horizontal · vertical) · wrap · gap(숫자 또는 'auto' = 사이 띄우기) · rowGap · padding[위, 오른, 아래, 왼] · align · cross(start · center · end) | `{"mode":"vertical","gap":12,"padding":[20,20,20,20],"align":"start","cross":"start"}` | 없음 |
| sizeH · sizeV | 크기 방식 fixed · hug(내용에 맞춤) · fill(부모 채우기) | `"hug"` | fixed(텍스트 autoWidth 는 가로 hug) |
| absolute | 오토 레이아웃 안에서 자리 무시 | `true` | 없음 |
| constraints | 제약 { h: left · right · leftright · center · scale, v: top · bottom · topbottom · center · scale } — 부모 프레임 · 화면 크기가 바뀔 때 | `{"h":"right","v":"top"}` | left · top |
| style.grids · frame.grids | 레이아웃 그리드 columns · rows(count · gutter · margin) · grid(size), color · visible | `[{"type":"columns","count":4,"gutter":16,"margin":16,"color":"#FF000019"}]` | 없음 |

- **페이지 설정** `pages.viewport.guides`: 가이드선 { x: number[], y: number[] } (캔버스 좌표). 눈금자에서 끌어 만들고, 레이어 · 화면을 옮길 때 붙는 대상이 된다.

- **schemaVersion 7 (2026-11-23)**: 4묶음(구성 요소 · 고급 편집). 모두 비어 있어도 되는 값이라 v1~v6 문서는 그대로 읽힌다.

| 필드 | 설명 | 예시 |
|---|---|---|
| type `vector` · vnet | 펜 · 평탄화(⌘E) · SVG 가져오기로 만든 벡터. 경로 [{ pts: [{ x, y, i?, o? }], closed? }] — 점과 곡선 핸들(i 들어오는 쪽 · o 나가는 쪽) 모두 레이어 상자 안 0~1 비율 | `[{"closed":true,"pts":[{"x":0,"y":0},{"x":1,"y":0.5,"i":[0.8,0],"o":[0.8,1]}]}]` |
| evenodd | 벡터 채우기 규칙(겹친 부분 구멍) | `true` |
| type `boolean` · op | 불리언 그룹(살아 있는 결과): union · subtract(맨 아래에서 나머지 빼기) · intersect · exclude. 자식 도형은 그대로 남고 칠 · 선은 그룹 것 | `"subtract"` |
| isMask | 마스크: 같은 부모 안에서 이 레이어 위 형제들을 이 모양으로 자른다(⌃⌘M 은 'Mask group' 으로 묶어서) | `true` |
| type `instance` · component · props | 디자인 시스템(@ba-dream/design-system) 컴포넌트 인스턴스: export 이름과 속성 값. 글자 슬롯은 `props["#default"]`. 속성 목록 · 선택지는 빌드할 때 DS 타입 파일에서 읽는다(저장소에 생성 파일 없음, build/ds-props-plugin.ts) | `{"component":"Button","props":{"size":"m","#default":"확인"}}` |
- **토큰 id**: 디자인 시스템 CSS 변수 이름(`--sys-color-…` · `--ref-color-…` · `--ref-spacing-…` · `--ref-radius-…` · `--ref-borderwidth-…` · `--ref-opacity-…` · `--font-weight-…` · `--typography-<스타일>-size|line-height|letter-spacing`), 글자 스타일 묶음 `ts:<스타일>`(예: `ts:body-1` = 크기 · 행간 · 자간 함께), DB 에 등록한 토큰 `db:<이름>`.
- **값은 함께 저장한다**: 연결할 때 실제 값(밝은 모드 기준, 예: `fill: "#2C7BE2"`, `radius: 8`)도 그 속성에 써 둔다. 그래서 그리기 · 썸네일 · 내보내기는 `vars` 를 몰라도 되고, 앱을 다크모드로 바꿔도 캔버스 결과물 색은 바뀌지 않는다.
- **연결 풀기**: 연결은 그대로인데 그 속성 값이 바뀌면(직접 입력 · ↑↓ · 캔버스에서 끌어 옮기기 · 크기 바꾸기) 그 키의 연결을 자동으로 푼다(`app/canvas/store.ts` 의 `record()` → `detachEdited`). 글자 크기 · 행간 · 자간 중 하나가 바뀌면 `textStyle` 도 풀린다.
- 토큰 목록은 저장소에 옮겨 적지 않고, 브라우저에 올라온 디자인 시스템 CSS 의 `:root` 변수에서 읽는다(`app/canvas/tokens.ts`, 철자가 틀린 중복 `--ref-boderwidth-*` · `turquiose` 는 뺀다). DB 토큰은 '등록한 토큰' 묶음으로 더한다.
- 옛 문서의 색 값 `token:<DB 토큰 이름>` 은 그대로 읽고 `db:<이름>` 에 연결된 것으로 보여 준다(그릴 때는 DB 토큰 값으로 바꿈).

### Document (문서)
기획·개발·디자인 문서. **출처 3종**을 하나의 테이블로 관리하고, 모두 같은 읽기 뷰로 보여준다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | doc_01 | O |
| project_id | 소속 프로젝트 | prj_01 | O |
| title | 제목 | 착한구독 개편 기획서 v1.2 | O |
| category | 분류 | planning / dev / design / etc | O |
| source_type | 출처 | `native` / `upload` / `link` | O |
| content_blocks | 블록 에디터 내용 (native) | Tiptap JSON | native일 때 |
| file_path | 원본 파일 (upload) | docs/doc_01.pdf | upload일 때 |
| file_type | 파일 형식 | pdf / docx / md | upload일 때 |
| url | 외부 링크 (link) | https://... | link일 때 |
| rendered_html | 읽기 뷰용으로 정리한 본문 (upload·link). 제목마다 앵커 id를 단다 | 정제된 HTML | X |
| plain_text | 검색·요구사항 인식용 텍스트 | | X |
| fetched_at | 링크 본문을 마지막으로 가져온 시각 | | X |
| fetch_status | 링크 가져오기 결과 | ok / failed / manual | X |
| version_label | 문서 버전 표기 | v1.2 | X |
| created_by / updated_at | | | O |

### Requirement (요구사항)
문서 안의 항목 하나. **이 툴의 핵심 단위.**

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | req_uuid | O |
| project_id | 소속 프로젝트 | prj_01 | O |
| document_id | 출처 문서 | doc_01 | O |
| code | 표시 번호 (문서 번호, 없으면 자동 부여) | REQ-012 | O |
| title | 한 줄 요약 | 월 구독료 비교표 상단 노출 | O |
| body | 원문 발췌 | "요금제 선택 화면 상단에…" | X |
| anchor | 원문 위치 (블록 id / HTML 앵커 / PDF 페이지+텍스트) | `{type:"pdf",page:3,quote:"…"}` | O |
| priority | 중요도 | must / should / could | X |
| origin | 어떻게 생겼는지 | auto_pattern / manual / ai (P2) | O |
| created_by / created_at | | | O |

### ScreenRequirement (화면-요구사항 연결)
"이 화면에 이 요구사항이 반영됐는가"를 기록한다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| screen_id | 화면 | scr_02 | O |
| requirement_id | 요구사항 | req_… | O |
| status | 반영 상태 | reflected / partial / missing / na | O |
| note | 메모 | "비교표는 있으나 할인가 미표시" | X |
| layer_ids | (선택) 화면 안 특정 레이어 지목 | ["n7"] | X |
| updated_by / updated_at | 마지막 확인자·시각 | | O |

### Component (컴포넌트)
바드림 디자인 시스템의 부품.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | cmp_01 | O |
| workspace_id | 소속 | ws_01 | O |
| name | 디자인 이름 | Button/Primary | O |
| code_name | 코드 컴포넌트 이름 | `<BdButton variant="primary">` | X |
| category | 분류 | button / card / input / navigation | O |
| description | 사용 가이드 | 화면당 주요 행동 1개에만 사용 | X |
| thumbnail_path | 미리보기 | | X |
| figma_component_key | 피그마 컴포넌트 키 (자동 매칭용) | 9f8e… | X |
| match_aliases | 레이어 이름 매칭 규칙 | ["Button/Primary*", "btn_primary"] | X |
| props_schema | 속성 정의 (P2, 속성 패널 자동 생성용) | JSON | X |

### Token (디자인 토큰)

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | tok_01 | O |
| workspace_id | 소속 | ws_01 | O |
| type | 종류 | color / typography / spacing / radius / shadow | O |
| name | 이름 | color.primary.500 | O |
| value | 값 | #2F6BFF / `{size:16,weight:500,lineHeight:24}` | O |
| description | 의미 | 주요 행동 버튼 배경 | X |

### ScreenComponentUsage (화면-컴포넌트 사용)
화면에 어떤 컴포넌트가 몇 개 쓰였는지. **자동 집계**한다.
- 피그마 화면: 레이어 요약의 컴포넌트 키·이름을 `figma_component_key` / `match_aliases`와 대조한다.
- 자체 화면: 레이어 이름 매칭(P1) 또는 `instance` 레이어(P2)로 집계한다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| screen_id | 화면 | scr_02 | O |
| component_id | 컴포넌트 (매칭 실패 시 null) | cmp_01 | X |
| detected_name | 발견된 레이어 이름 | Button/Primary | O |
| count | 개수 | 2 | O |
| source | 집계 출처 | figma / native | O |

### FigmaConnection (피그마 연결 설정)

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| workspace_id | 소속 | ws_01 | O |
| access_token_encrypted | 피그마 토큰 (**서버에만 저장, 암호화**) | — | O |
| owner_member_id | 발급한 사람 | | O |
| last_error | 마지막 오류 (호출 한도 초과 등) | 429 rate limit | X |

---

## 2026-11-26 추가 — 기획서 양식 · 피그마 연동 · 역할 · 검수

> 근거 문서: [11 기획서 양식](./11_PLANNING_DOC_FORMAT.md) · [12 역할](./12_ROLES_PERMISSIONS.md) · [13 피그마 연동](./13_FIGMA_LINK.md) · [14 검수 흐름](./14_REVIEW_FLOW.md) · [15 양식 변환](./15_DOC_CONVERT.md). 적용 시점은 [03_PHASES.md](./03_PHASES.md) 'Phase 2 추가'.
> 화면 이름 '요구사항'을 '정책'으로 바꿀지는 미정이라, 테이블 이름은 지금(`requirements`)을 그대로 쓴다.

### 바뀐 구조

```
[Project]
  ├─1:N─> [ProjectMember 프로젝트 역할]   ├─1:N─> [ProjectInvite 초대 요청]
  ├─1:N─> [ProjectIdAlias 옛 약자 대응]
  ├─1:N─> [Document] ─1:N─> [DocumentVersion 버전] ─1:N─> [RequirementVersion 정책 문장 버전]
  │            ├─1:N─> [Requirement 정책]
  │            └─1:N─> [ScreenSlot 화면 칸 = 화면 표 한 행]
  │                          └─1:N─> [Screen 디자인(피그마 · 자체)] ─N:M─> [ScreenRequirement]
  ├─1:N─> [ActivityLog 기록]
  └─1:N─> [ConvertJob 양식 변환]
[Member] ─1:N─> [Notification 알림]
```

### Document — 더하는 필드

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| abbr | 문서 약자(ID 겹칠 때 앞에 붙임) | 몰 | X |
| status | 문서 상태 | draft / review / confirmed | O |
| current_version_id | 지금 보여 주는 버전 | dv_03 | X |
| check_result | 양식 검사 결과(필수 빠짐 · 경고 목록과 위치) | JSON | X |

### DocumentVersion (문서 버전) — 새 테이블

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | dv_03 | O |
| document_id | 문서 | doc_01 | O |
| version_label | 버전 표기 | v1.1 | O |
| status | 버전 상태 | draft / review / confirmed | O |
| content | 그 버전의 본문(`content_blocks` · `file_path` · `rendered_html` · `plain_text` 묶음) | JSON | O |
| origin | 어떻게 생겼나 | upload / edit / ai_convert | O |
| based_on_version_id | 어느 버전에서 나왔나 | dv_02 | X |
| change_summary | 직전 확정 버전과의 비교 결과(추가 · 수정 · 삭제 ID 목록) | JSON | X |
| confirmed_by / confirmed_at | 확정한 사람 · 시각 | | X |
| created_by / created_at | | | O |

### Requirement (정책) — 더하는 · 바뀌는 필드

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| code | 문서 안 ID 그대로. 직접 지정한 문장은 임시 번호 | `P-ORD-05` / `#12` | O |
| area | 영역 약자 | ORD | X |
| marks | 표기 | `["default","pending","dev_check","legal"]` | X |
| has_screen | 화면이 있는 정책인지(없으면 반영률에서 뺌) | false | O |
| removed_at | 문서에서 빠진 시각(지우지 않고 표시) | | X |
| origin | 어떻게 생겼나 | auto_pattern / manual / ai | O |

- `REQ-nnn` 자동 부여는 없앤다. `title`은 정책 표의 '정책' 칸, `body`는 '세부 규칙' 칸이다.

### RequirementVersion (정책 문장 버전) — 새 테이블
버전마다 정책 문장을 남겨 바뀐 것을 찾고 전 · 후를 보여 준다.

| 필드 | 설명 | 필수 |
|---|---|---|
| requirement_id | 정책 | O |
| document_version_id | 버전 | O |
| title / body / marks | 그 버전의 문장 · 표기 | O |
| body_hash | 띄어쓰기 · 문장부호를 뺀 비교용 값 | O |

### ScreenSlot (화면 칸) — 새 테이블
기획서 화면 표의 한 행. 디자인(Screen)이 여기에 붙는다.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id | 고유 식별자 | slot_05 | O |
| project_id / document_id | 소속 | | O |
| code | 화면 ID | C-05 | O |
| name | 화면 이름 | 상품 상세 | O |
| spec | '보여 줄 것' 원문 | | X |
| states | '상태' 열에서 읽은 상태 이름 | `["로딩","일시품절","오류"]` | X |
| policy_codes | '정책' 열(없으면 문장 속 `(P-…)`)에서 읽은 ID | `["P-PRD-05","P-PRD-13"]` | X |
| assignee_member_id | 담당 디자이너 | | X |
| removed_at | 기획서에서 빠진 시각 | | X |

### Screen — 더하는 필드

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| slot_id | 붙은 화면 칸(없으면 '연결 안 된 화면') | slot_05 | X |
| slot_state | 상태 변형 이름(기본 디자인은 비움) | 일시품절 | X |
| is_primary | 같은 ID 시안 중 대표 | true | O |
| design_hash | 썸네일 · 레이어 요약 비교값(바뀜 감지) | | X |
| thumbnail_history | 직전 썸네일(최근 5개) | `[{path, at}]` | X |
| figma_missing_at | 피그마에서 프레임이 지워진 걸 안 시각 | | X |

- `status`(draft / review / approved)는 그대로 쓰고 뜻을 '작업 중 / 검토 요청 / 승인'으로 맞춘다.

### ScreenRequirement — 바뀌는 필드

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| status | 반영 상태에 둘을 더함 | unchecked / reflected / partial / missing / na / needs_review | O |
| prev_status | '재검토 필요' 전 상태(되돌려 보기용) | reflected | X |
| origin | 어떻게 연결됐나 | doc_table / figma_desc / manual / ai | O |

### ProjectMember · ProjectInvite — 새 테이블
[12_ROLES_PERMISSIONS.md](./12_ROLES_PERMISSIONS.md) 6장 초안을 그대로 옮긴다.

| 테이블 | 필드 |
|---|---|
| ProjectMember | project_id, member_id, role(`owner` / `deputy` / `planner_editor` / `designer_editor` / `reviewer` / `viewer`), added_by, created_at |
| ProjectInvite | id, project_id, email, requested_by, status(`pending` / `approved` / `rejected` / `expired`), role(승인 때 정함), decided_by, created_at, expires_at(+7일) |

- DB 보안 규칙: 지금의 `is_member()`에 더해 `project_role(project_id)`를 두고, 테이블마다 쓰기 규칙을 역할로 거른다.
- 이 테이블이 생길 때 기존 프로젝트는 만든 사람(`created_by`)을 방장으로, 나머지 회사 멤버를 기획 편집 · 디자인 편집(직무 기준)으로 넣는다〔기본값〕.

### ProjectIdAlias (옛 약자 대응) — 새 테이블

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| project_id | 프로젝트 | | O |
| from_prefix → to_prefix | 옛 약자 → 새 약자 | `M` → `C`, `MA` → `A`, `MN` → `N` | O |

### ActivityLog (기록) — 새 테이블
지우거나 고칠 수 없다. 1년 보관〔기본값〕.

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id · project_id · actor_id · created_at | | | O |
| action | 한 일 | status_change / review_request / approve / reject / doc_confirm / convert_confirm / role_change / invite_decide / slot_link | O |
| target_type / target_id | 대상 | screen_requirement / scr_02 | O |
| before / after | 바뀌기 전 · 후 | JSON | X |

### Notification (알림) — 새 테이블

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id · member_id · project_id · created_at | | | O |
| kind | 종류([14](./14_REVIEW_FLOW.md) 5장 표) | needs_review / invite_request / approved … | O |
| target_type / target_id | 누르면 갈 곳 | | O |
| group_key | 짧은 시간 같은 일 묶기 | needs_review:dv_03 | X |
| count | 묶인 개수 | 30 | O |
| read_at | 읽은 시각 | | X |

### ConvertJob (양식 변환) — 새 테이블

| 필드 | 설명 | 예시 | 필수 |
|---|---|---|---|
| id · document_id · created_by · created_at | | | O |
| source_version_id | 바꿀 원본 버전 | dv_01 | O |
| status | 진행 상태 | queued / running / done / failed | O |
| sections_total / sections_done | 장 단위 진행률 | 13 / 5 | O |
| result_version_id | 만들어진 변환본(초안) | dv_02 | X |
| error | 실패 사유 | | X |

### 더하는 조회

| 조회 | 쓰는 곳 |
|---|---|
| 프로젝트 → 디자인 없는 화면 칸 · 상태 디자인 없음 · 기획서에 없는 화면 | 프로젝트 홈, 정책 보드 '빠진 것' |
| 문서 버전 → 바뀐 정책 → 연결 화면 | 새 버전 확정 때 '재검토 필요' 붙이기 |
| 멤버 → 담당 화면의 '재검토 필요' 개수 | 알림, '내 화면' 필터 |

---

## 관계 요약
- 워크스페이스 1개 → 멤버·프로젝트·컴포넌트·토큰 여러 개
- 프로젝트 1개 → 문서 여러 개, 페이지 여러 개
- 문서 1개 → 요구사항 여러 개
- 페이지 1개 → 화면 여러 개
- 화면 ↔ 요구사항: 여러 대 여러 (ScreenRequirement, 반영 상태 포함)
- 화면 ↔ 컴포넌트: 여러 대 여러 (ScreenComponentUsage, 개수 포함)

## 자주 쓰는 조회 (화면이 빨라야 하는 곳)
| 조회 | 쓰는 곳 |
|---|---|
| 화면 id → 연결 요구사항 + 상태 + 출처 문서 | ★ 인스펙터 기획 탭 |
| 화면 id → 사용 컴포넌트 + 코드명 | 인스펙터 개발 탭 |
| 요구사항 id → 연결 화면 목록 | 문서 뷰에서 요구사항 클릭 → 캔버스 하이라이트 |
| 컴포넌트 id → 사용 화면 목록 | 디자인 시스템 상세 |
| 프로젝트 id → 상태별 요구사항 개수 | 프로젝트 홈 반영률, 요구사항 보드 |

---

## 왜 이 구조인가

- **Deus 구조 차용**: 토스 Deus는 `ProjectStore → PageStore → FrameStore` 트리에 디자인 시스템 컴포넌트를 id로 참조한다 (Simplicity 세션 다이어그램). 검증된 구조여서 그대로 따르고, 바드림의 차별점인 문서·요구사항만 옆에 붙였다.
- **요구사항을 별도 단위로 둔 이유**: "화면에 기획의 무엇이 반영됐나"는 문서 단위로는 판단할 수 없고, 항목 단위여야 한다. 상태를 연결선(ScreenRequirement)에 둬야 한 요구사항이 여러 화면에 걸쳐 있어도 화면별로 반영 여부를 다르게 기록할 수 있다.
- **문서 출처 3종을 한 테이블로 묶은 이유**: 읽기 뷰·요구사항·검색 로직을 하나로 유지하기 위해서다. 출처별 차이는 "원본 → 읽기용 HTML/블록 변환" 단계에서만 처리한다.
- **레이어를 화면별 JSON으로 둔 이유**
  - **단순성**: Phase 1은 혼자 편집하므로 화면 단위로 통째 저장하는 게 가장 단순하고 빠르다.
  - **확장성**: Phase 3 동시편집 때 이 JSON을 그대로 CRDT 문서(Yjs/Loro)로 옮기면 된다. 평평한 노드 맵 구조라 변환이 쉽다.
- **확장성**
  - 코멘트(P2): `Comment(target_type, target_id, x, y)`를 추가한다.
  - 스냅샷(P2): `ScreenSnapshot(screen_id, layers, label)`을 추가한다.
  - 둘 다 기존 테이블을 고치지 않고 붙일 수 있다.

---

## [NEEDS CLARIFICATION]

- [x] 번호가 문서마다 겹칠 때 표시 규칙 → 문서 약자와 함께 표시(예: `몰 C-05`). [11_PLANNING_DOC_FORMAT.md](./11_PLANNING_DOC_FORMAT.md) 3-3
- [x] 문서가 새 버전으로 바뀌었을 때 → 같은 ID면 연결을 유지하고, ID 기준으로 변경 요약을 만들며 바뀐 정책에 연결된 화면은 '재검토 필요'. 11_PLANNING_DOC_FORMAT 5장
- [x] 화면 승인을 누가 하는지 → 방장 · 부방장 · 기획 편집(문서 확정) 등 역할별. [12_ROLES_PERMISSIONS.md](./12_ROLES_PERMISSIONS.md)
- [x] 프로젝트 역할 · 초대 테이블(ProjectMember · ProjectInvite)을 이 문서 본문에 옮길 시점 → 2026-11-26 '2026-11-26 추가'로 옮겼다
- [ ] 기존 프로젝트에 역할을 처음 넣을 때 기본값(만든 사람 = 방장, 나머지 = 직무 기준 편집)이 맞는지
