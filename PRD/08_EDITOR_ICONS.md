# 08. 편집기 아이콘

## 새 아이콘 세트 (2026-11-25)

Iris 편집기 아이콘을 **바드림 디자인 시스템 아이콘 가이드**로 다시 그렸어요. 아래 "예전 목록"은 기록으로 남겨둬요.

- **원본:** 피그마 바드림 Design System · Iconography 페이지 · `Iris Editor Icons · 쓰임별 굵기` 프레임(서비스가 쓰는 세트). 바로 왼쪽 `Iris Editor Icons`는 예전 선 2 세트로 기록용
- **파일:** `PRD/icons/<크기>/<이름>.svg` — 크기 24 · 20 · 16 · 12, 모두 같은 그림이고 크기만 달라요
- **미리보기:** `PRD/icons/index.html` — 묶음별로 네 크기를 나란히 보여줘요
- **서비스:** `app/components/editor/irisIcons.ts`(자동 생성) → `<EditorIcon name size>`가 이 사전을 먼저 읽어요

### 그리는 규칙 (바드림 DS 아이콘 가이드 + 사용자 요청, 반드시 이 순서)

**순서 — 바꾸지 않아요**
1. 24 × 24 **프레임**에 선(Stroke)으로 그려요. 컴포넌트 · 인스턴스로 만들지 않아요.
2. 선을 모두 **오브젝트화**(Outline stroke)해요. 끝은 네모(square), 점선은 평평(butt), 이음은 각지게(miter).
3. 겹친 조각은 **Union → Flatten** — 꼭짓점만 남고 군더더기 점이 없게.
4. **그다음에** 모서리 곡률을 줘요. 곡률은 **꼭짓점 속성**(점마다 Corner radius)으로만 줘요 — 곡선을 모양에 구워 넣지 않아요(점을 눌러 보면 꼭짓점 하나에 곡률 값이 보여야 해요).
5. Corner smoothing 60%, 색은 neutral/800 변수, Constraints Scale × Scale.

| 항목 | 값 |
|---|---|
| 그리드 | 24 × 24 프레임, 키라인은 피그마 아이콘 가이드(정사각 18 · 원/대각 20 · 세로/가로 20 × 16 이하) |
| 선 | **쓰임별 굵기**(아래 표) — 선 1.5, 정렬 · 분배의 물체 막대 3 |
| 끝 | 반원이 아닌 둥근 직사각형(짧은 변 35% 곡률). 일부러 둥근 아이콘(hand, cap_* · join_*)만 예외 |
| 모서리 곡률 | **바깥으로 볼록한 꼭짓점만**: 큰 상자(양쪽 곧은 변 12 이상) 2, 나머지 1.5, 짧은 변은 그 변 길이의 35%까지(0.25 단위). **안쪽(오목한) 꼭짓점 · 구멍 모서리 · 끝점 안쪽은 0 — 곡선 금지** |
| Corner smoothing | 60% |
| 간격 | 떨어진 선 사이, 구멍 폭 모두 2px 이상 |
| 투명 칠 | 불리언 · 마스크처럼 "결과 면"을 보여줄 때만 40% |
| 색 | `currentColor`(피그마는 neutral/800 변수). 화면에서는 누르는 아이콘 neutral-600(호버 700) · 칸 앞 표시 neutral-500 · 레이어 종류 neutral-500(고른 행 700) |
| 같은 뜻은 한 모양 | 이미지(`image`)는 칠 창 이미지(`paint_image`)와 같은 모양. 섹션(`section`)은 피그마처럼 왼쪽 위 이름표가 있는 상자 |

**굵기만 바꿀 때(예: 2 → 1.5)** — 다시 Outline 하거나 면을 깎지 않아요(불리언으로 깎으면 곡선이 구워지고 점이 잔뜩 생기며 깨져요). 꼭짓점 곡률을 0으로 둔 날카로운 모양에서 **각 변을 안쪽으로 (옛 굵기 − 새 굵기) ÷ 2 만큼 평행 이동**해 꼭짓점을 두 변의 교점으로 옮기고(점 개수 그대로, 오목한 꼭짓점은 날카롭게 유지), 그 뒤 위 곡률 규칙을 다시 줘요. 원래 모양이 지저분한 아이콘(예: 톱니)은 선으로 새로 그려 1~5 순서를 다시 밟아요. 끝나면 꼬임 · 아주 짧은 변을 코드로 전수 점검하고 4배 확대로 눈으로 봐요.

### 크기와 쓰는 곳

| 크기 | 쓰는 곳 |
|---|---|
| 24 | 피그마 원본 · 문서 |
| 20 | 툴바 도구 |
| 16 | 패널 아이콘 버튼(28 × 28 버튼 안에서는 18로 조금 키워요), 입력칸 앞, 레이어 행, 메뉴 |
| 12 | 보조 표시(▾ ▸ ✓) |

- 면 아이콘이라 크기에 따라 선 굵기도 함께 바뀌어요(선 1.5 → 16에서 1px · 20에서 1.25px).
- 아이콘 버튼의 호버 · 선택 영역은 같은 줄 입력칸 높이(28)에 맞춘 정사각형이에요. 탭 줄 버튼은 탭 높이(26)에 맞춰요.

### 고치는 법

1. 피그마 `Iris Editor Icons · 쓰임별 굵기`에서 고쳐요(컴포넌트가 아닌 프레임, 이름 `Icon / Default / 24px / <이름>`). 위 "그리는 규칙" 순서를 지켜요.
2. 묶음(Icons 프레임)별 SVG를 내려받아 `scripts/icons/slice.mjs`(저장소 `offsets.json` 기준 — 새 아이콘은 여기에 꼭 추가) → `scripts/icons/publish.mjs` 로 다시 뽑아요 → `PRD/icons/*` · `irisIcons.ts`가 함께 바뀌어요.
3. 새 아이콘은 사전에 이름이 생기면 바로 `<EditorIcon name="…">`으로 쓸 수 있어요.

### 아이콘 목록

### 툴바 도구

| 이름 | 뜻 |
|---|---|
| `cursor_move` | 이동 |
| `scale` | 크기 조정 |
| `hand` | 손 도구 |
| `frame` | 프레임 |
| `section` | 섹션 |
| `rectangle` | 사각형 |
| `line` | 선 |
| `arrow_line` | 화살표 |
| `ellipse` | 원 |
| `polygon` | 다각형 |
| `star` | 별 |
| `pen` | 펜 |
| `pencil` | 연필 |
| `text` | 텍스트 |
| `chevron_down` | 도구 묶음 펼치기 ▾ |

### 레이어 목록 · 종류

| 이름 | 뜻 |
|---|---|
| `boolean` | 불리언 |
| `autolayout_vertical` | 오토 레이아웃 프레임(세로) |
| `autolayout_horizontal` | 오토 레이아웃 프레임(가로) |
| `autolayout_wrap` | 오토 레이아웃 프레임(줄바꿈) |
| `group` | 그룹(점선 네모) |
| `chevron_right` | 펼치기 |

### 공통 아이콘

| 이름 | 뜻 |
|---|---|
| `plus` | 더하기 |
| `minus` | 빼기 |
| `close` | 닫기 |
| `check` | 체크 |
| `search` | 검색 |
| `trashbin` | 휴지통 |
| `copy` | 복사 |
| `link` | 링크 |
| `image` | 이미지 |
| `comment` | 댓글 |
| `arrow_up_right` | 바깥으로 열기 |
| `warning` | 경고 |
| `info` | 정보 |
| `document` | 문서 |
| `document_add` | 문서 추가 |
| `clip` | 첨부 |
| `menu_bento` | 격자로 보기 |
| `list` | 목록으로 보기 |
| `var_spacing` | 변수: 간격 |
| `var_radius` | 변수: 모서리 |
| `var_number` | 변수: 숫자 |
| `var_opacity` | 변수: 투명도 |
| `var_border` | 변수: 선 두께 |
| `var_size` | 변수: 크기 |
| `unlink` | 연결 풀기 |
| `variable` | 변수 |
| `table` | 표 |
| `component` | 컴포넌트 |
| `visibility_on` | 보이기 |
| `visibility_off` | 숨기기 |
| `lock` | 잠금 |
| `unlock` | 잠금 풀기 |
| `menu_kebab` | 세로 점 메뉴 |
| `menu_meatball` | 가로 점 메뉴 |
| `setting` | 설정 |
| `filter` | 조절 |
| `styles` | 스타일 |
| `text_box` | 글자 상자 |
| `text_settings` | 글자 설정 |
| `valign_top` | 세로 정렬 위 |
| `valign_middle` | 세로 정렬 가운데 |
| `valign_bottom` | 세로 정렬 아래 |
| `text_align_left` | 글자 왼쪽 정렬 |
| `text_align_center` | 글자 가운데 정렬 |
| `text_align_right` | 글자 오른쪽 정렬 |
| `text_align_justify` | 글자 양쪽 정렬 |
| `folder` | 폴더 |
| `home` | 홈 |
| `refresh` | 새로고침 |

### 정렬 · 위치

| 이름 | 뜻 |
|---|---|
| `align_left` | 왼쪽 정렬 |
| `align_center_horizontal` | 가로 가운데 정렬 |
| `align_right` | 오른쪽 정렬 |
| `align_top` | 위 정렬 |
| `align_center_vertical` | 세로 가운데 정렬 |
| `align_bottom` | 아래 정렬 |
| `menu_hamburger` | 정렬 더보기 |
| `distribute_vertical` | 세로 간격 균등 분배 |
| `distribute_horizontal` | 가로 간격 균등 분배 |
| `tidy_up` | 정돈하기 |

### 오토 레이아웃

| 이름 | 뜻 |
|---|---|
| `layout_free` | 자유 배치 |
| `layout_vertical` | 세로 배치 |
| `layout_horizontal` | 가로 배치 |
| `layout_grid_wrap` | 격자(줄바꿈) |
| `gap_vertical` | 항목 사이 간격(세로) |
| `gap_horizontal` | 항목 사이 간격(가로) |
| `autolayout_add` | 자동 레이아웃 추가 |
| `autolayout_on` | 오토 레이아웃 켜짐(체크) |
| `padding_top` | 위 안쪽 여백 |
| `padding_right` | 오른쪽 안쪽 여백 |
| `padding_bottom` | 아래 안쪽 여백 |
| `padding_left` | 왼쪽 안쪽 여백 |
| `resize_to_fit` | 내용에 맞게 크기 조정 |
| `wrap` | 줄바꿈 |
| `padding_horizontal` | 가로 안쪽 여백 |
| `padding_vertical` | 세로 안쪽 여백 |
| `padding_individual` | 안쪽 여백 따로 |

### 불리언 · 점 편집

| 이름 | 뜻 |
|---|---|
| `boolean_union` | 합치기 |
| `boolean_subtract` | 빼기 |
| `boolean_intersect` | 교차 |
| `boolean_exclude` | 겹친 부분 빼기 |
| `mirror_none` | 미러링 없음 |
| `mirror_angle` | 각도 미러링 |
| `mirror_angle_length` | 각도와 길이 미러링 |
| `mask_layer` | 마스크 레이어 |
| `mask_arrow` | 마스크 연결(가려지는 레이어) |
| `flatten` | 평탄화(Flatten) |

### 선(Stroke)

| 이름 | 뜻 |
|---|---|
| `stroke_all` | 변마다 선: 모든 변 |
| `stroke_top` | 변마다 선: 위 변만 |
| `stroke_right` | 변마다 선: 오른쪽 변만 |
| `stroke_bottom` | 변마다 선: 아래 변만 |
| `stroke_left` | 변마다 선: 왼쪽 변만 |
| `stroke_sides_0000` | 변마다 선: 모두 꺼짐 |
| `stroke_sides_0011` | 변마다 선: 아래 · 왼쪽 |
| `stroke_sides_0101` | 변마다 선: 오른쪽 · 왼쪽 |
| `stroke_sides_0110` | 변마다 선: 오른쪽 · 아래 |
| `stroke_sides_0111` | 변마다 선: 오른쪽 · 아래 · 왼쪽 |
| `stroke_sides_1001` | 변마다 선: 위 · 왼쪽 |
| `stroke_sides_1010` | 변마다 선: 위 · 아래 |
| `stroke_sides_1011` | 변마다 선: 위 · 아래 · 왼쪽 |
| `stroke_sides_1100` | 변마다 선: 위 · 오른쪽 |
| `stroke_sides_1101` | 변마다 선: 위 · 오른쪽 · 왼쪽 |
| `stroke_sides_1110` | 변마다 선: 위 · 오른쪽 · 아래 |
| `stroke_sides_1111` | 변마다 선: 모두 켜짐 |
| `cap_none` | 선 · 점선 끝: 끝 모양 없음 |
| `cap_square` | 선 · 점선 끝: 네모 끝 |
| `cap_round` | 선 · 점선 끝: 둥근 끝 |
| `join_miter` | 이음새: 각지게 |
| `join_bevel` | 이음새: 깎아서 |
| `join_round` | 이음새: 둥글게 |

### 효과(Effects)

| 이름 | 뜻 |
|---|---|
| `shadow_inner` | 내부 그림자 |
| `shadow_drop` | 드롭 섀도 |
| `blur_layer` | 레이어 흐림 |
| `blur_background` | 배경 흐림 |
| `blur` | 흐림 |
| `apply_styles` | 스타일 적용 |
| `effect_style` | 효과 스타일 바꾸기 |
| `spread` | 확산 |

### 레이아웃 격자

| 이름 | 뜻 |
|---|---|
| `grid_columns` | 레이아웃 격자: 세로 칸(Columns) |
| `grid_rows` | 레이아웃 격자: 가로 줄(Rows) |
| `grid_square` | 레이아웃 격자: 격자(Grid) |

### 홈 · 프로젝트

| 이름 | 뜻 |
|---|---|
| `project_app` | 새 프로젝트: 앱 |
| `project_web` | 새 프로젝트: 웹 |
| `project_detail_page` | 새 프로젝트: 상세 페이지 |
| `renew` | 처음 모습으로(홈 3D) |
| `theme_light` | 화면 모드: 밝게 |
| `theme_dark` | 화면 모드: 어둡게 |
| `theme_system` | 화면 모드: 시스템 |
| `bell` | 알림(위 탭 막대 알림 버튼 · 빈 알림 안내) — 둥근 머리 + 아래 테 + 추. 테 · 추 끝은 짧은 변 35%(0.5) |

### 코멘트 · 상태

2026-11-27 추가(피그마 `Group / 코멘트 · 상태`). 원은 모두 `info` · `warning` 과 같은 크기(선 중심 반지름 8.5), 화살표 머리는 꼭대기 1 · 끝 0.5.
이 추가와 함께 서비스 곳곳의 디자인 시스템 `<Icon>` 중 Iris 에 같은 이름이 있는 것(닫기 · 경고 · 체크 · 링크 · 문서 · 연필 · 더보기 …)은 모두 `EditorIcon` 으로 바꿨어요. 남은 디자인 시스템 아이콘: `camera`(프로필 사진) · `chevron_left`(문서 뒤로) · 디자인 시스템 버튼 안 아이콘(`icon-name`) · 인스턴스 아이콘 고르기.

| 이름 | 뜻 |
|---|---|
| `emoji` | 이모지(코멘트 입력 · 반응 달기) |
| `mention` | 멘션(@) |
| `send` | 코멘트 보내기 |
| `clock` | 대기(참여 요청 보냄) |
| `resolve` | 코멘트 해결(창 · 목록) — 해결되면 초록색 |
| `status_reflected` | 요구사항 반영(파랑, 체크는 뚫린 구멍) |
| `status_partial` | 요구사항 일부 반영(오른쪽 반 채움) |
| `status_missing` | 요구사항 미반영(점선 원 10칸, 칸 끝 평평 + 0.5) |
| `status_na` | 요구사항 해당 없음(회색, 빼기는 뚫린 구멍) |
| `upload` | 파일 올리기 |
| `download` | 내려받기 |
| `logout` | 로그아웃(계정 메뉴) |

### 위 탭

| 이름 | 뜻 |
|---|---|
| `tab_new` | 새 탭 |
| `pin` | 고정 탭(바드림 pin 을 Iris 규칙으로 — 2026-11-25) |

### 칠 창

| 이름 | 뜻 |
|---|---|
| `eyedropper` | 화면에서 색 가져오기 |
| `paint_solid` | 칠 종류: 단색 |
| `paint_gradient` | 칠 종류: 그라디언트 |
| `paint_image` | 칠 종류: 이미지 |
| `angle` | 각도 |
| `flip_gradient` | 그라디언트 뒤집기 |
| `rotate_90` | 90° 회전 |

### 프레임 패널

| 이름 | 뜻 |
|---|---|
| `corner_independent` | 모서리 따로 |
| `corner_smoothing` | 모서리 다듬기 |
| `stroke_weight` | 프레임 선 두께 |

### 레이어 패널

| 이름 | 뜻 |
|---|---|
| `sidebar_collapse` | 사이드바 접기 |
| `sidebar_expand` | 사이드바 펴기 |
| `select_matching` | 같은 레이어 모두 선택 |
| `mask` | 마스크 해제 |
| `edit_object` | 오브젝트 편집 |
| `autolayout_ignore` | 자동 레이아웃 무시 |
| `constraints` | 제약 조건 숨기기 |
| `constraint_horizontal` | 가로 제약 조건 |
| `constraint_vertical` | 세로 제약 조건 |
| `rotation` | 회전 |
| `flip_horizontal` | 가로로 뒤집기 |
| `flip_vertical` | 세로로 뒤집기 |
| `ratio_unlocked` | 비율 고정 해제 |
| `ratio_locked` | 비율 고정 해제 |
| `blend_mode` | 혼합 모드 |
| `point_count_polygon` | 꼭짓점 개수(다각형) |
| `point_count_star` | 꼭짓점 개수(별) |
| `star_ratio` | 비율(별 안쪽 반지름) |
| `line_height` | 줄 높이 |
| `letter_spacing` | 자간 |
| `arc_sweep` | 원 호: 쓸어 간 정도 |
| `arc_ratio` | 원 호: 안쪽 구멍 비율 |

### 스타일 만들기

| 이름 | 뜻 |
|---|---|
| `style_create` | 스타일 만들기 |

### 글자 세부 설정

| 이름 | 뜻 |
|---|---|
| `underline` | 밑줄 |
| `strikethrough` | 취소선 |
| `list_numbered` | 번호 목록 |

---

## 예전 목록 (2026-11-24, 기록용)

Iris 편집기를 피그마 UI3 수준으로 맞출 때 필요한 아이콘을 정리했어요. 화면 규격은 [07_FIGMA_UI_REFERENCE.md](07_FIGMA_UI_REFERENCE.md)에 있어요.

## 현재 상황 (2026-11-24 확인)

- **바드림 디자인 시스템의 선 아이콘(outlined)은 122종이에요.**
  - 대부분 제품용이에요(배터리, 오토바이, 결제 …).
  - 편집기에 쓸 수 있는 건 일부뿐이에요: `plus` `minus` `close` `check` `chevron_*` `arrow_*` `search` `filter` `link` `lock` `unlock` `visibility_on` `visibility_off` `image` `video` `comment` `copy` `trashbin` `download` `upload` `setting` `menu_*` `maximize` `minimize` `pencil` `zoom_in` `zoom_out` `list` `table` `palette` `tools` `document*` `refresh` `info` `question` `warning`
- **나머지 편집기 아이콘은 Iris 코드 안에 SVG 경로로 직접 그려져 있어요.**
  - 툴바: `EditorToolbar.vue` `ITEMS`
  - 레이어 종류: `app/canvas/icons.ts`
  - 인스펙터 곳곳에 인라인 `<svg>`가 있어요.
  - 크기가 12 · 14 · 16으로 섞여 있고, 선 굵기도 1.1~1.4로 제각각이에요.
- **피그마 규격**
  - 툴바 · 레일 아이콘: 24 박스
  - 패널 아이콘: 16 박스(버튼 24 안)
  - 선은 1px 단색이에요.

## 규칙 (2026-11-24 적용)

### 크기

| 크기 | 쓰는 곳 | 담는 버튼 |
|---|---|---|
| **20** | 툴바 도구, 툴바 오른쪽 버튼 | 32 × 32 |
| **16** | 패널 아이콘 버튼(섹션 머리 +, −, 👁, 정렬, 회전 …), 입력칸 앞 표시, 레이어 행(종류 · 🔒 · 👁), 메뉴 항목 아이콘, 문서 목록 | 24 × 24, 28 × 28, 행 높이 28 |
| **12** | 보조 표시만: 드롭다운 ▾, 레이어 ▸, 메뉴 ✓, 행 끝 작은 표시(↗) | — |

- 툴바 ▾(8)는 피그마와 같은 작은 표시라 예외예요.
- 레이어 행은 ▸ 상자 16 + 종류 아이콘 16이에요. 들여쓰기는 단계마다 18이라서, 자식의 ▸가 부모의 종류 아이콘 아래에 와요.

### 선

- 그린 크기(12 · 14 · 16 그리드)와 상관없이 **화면에서 늘 1.25px**이에요(`vector-effect: non-scaling-stroke`). 크기를 키워도 굵기는 그대로예요.
- 끝과 모서리는 round, 단색 `currentColor`예요.
- **예외:** 선 두께 자체가 뜻인 아이콘(Stroke weight의 1 · 1.6 · 2.4 세 줄)은 `class="keep"`을 붙여요.

### 색 (역할별)

| 역할 | 색 |
|---|---|
| 누르는 아이콘(아이콘 버튼, 도구, 행 토글 🔒 👁) | neutral-700, 호버 neutral-800 |
| 상태 표시(입력칸 앞, 레이어 종류, ▾ ▸) | neutral-500. 고른 레이어 행에서는 neutral-800 |
| 켜짐(토글) | brand-primary + 옅은 파랑 바탕 |
| 켜진 도구 | 흰색 + brand 바탕 |
| 비활성 | neutral-400 |

**같은 묶음 안에서는 같은 역할이면 같은 색과 크기를 써요.** 예를 들어 레이어 행의 🔒와 👁는 둘 다 16 / neutral-700이에요(전에는 12 / neutral-500이라 다른 아이콘보다 작아 보였어요).

### 아이콘 출처

- 편집기 화면(툴바, 패널, 메뉴)은 **`<EditorIcon name size>`**(`app/components/editor/EditorIcon.vue`)만 써요. 16 그리드 경로 사전이에요.
- 디자인 시스템 아이콘(`<Icon>`)은 선 굵기와 모양이 달라서 편집기 크롬에서는 쓰지 않아요. 이번에 모두 바꿨어요.
- 레이어 종류 경로는 `app/canvas/icons.ts`(12 그리드)예요. 16으로 그리고, 선 규칙은 그대로 적용돼요.
- 새 아이콘은 `EditorIcon.vue`의 사전에 16 그리드로 더해요.
- 디자인 시스템 리포에 `outlined/16px/editor_*`로 옮길지는 따로 정해요. 옮긴다면 사내 전용 리포에 둬요.
- 전역 규칙은 `main.css`의 "편집기 아이콘 규칙"에 있어요.

**표 읽는 법**
- **있음(Iris):** Iris 코드에 인라인으로 이미 그려져 있어요. 세트로 옮기기만 하면 돼요.
- **있음(DS):** 디자인 시스템 아이콘을 그대로 써요.
- **필요:** 새로 그려야 해요. ⭐는 이번에 적용한 화면에서 바로 쓰여요.

### 1. 툴바 · 도구

| 아이콘 | 쓰는 곳 | 상태 |
|---|---|---|
| move (화살표 커서) | Move V | 있음(Iris) |
| hand | Hand tool H | 있음(Iris) |
| scale | Scale K | 있음(Iris) |
| frame (#) | Frame F | 있음(Iris) |
| section | Section ⇧S | 있음(Iris) |
| slice | Slice S | 필요 |
| rectangle · line · arrow · ellipse · polygon · star | Shape 묶음 | 있음(Iris) |
| image/video | Image/video… ⇧⌘K | 있음(DS `image`) |
| pen · pencil | Creation 묶음 | 있음(Iris) |
| text (T) | Text T | 있음(Iris) |
| text on path | Type 묶음 | 필요 |
| code `{ }` · spec | Code 묶음 | 필요 |
| comment | Comment C | 있음(DS `comment`) |
| annotation · measurement | Comment 묶음 | 필요 |
| actions (⁘+) | Actions ⌘K | 필요 |
| mode: draw · design · motion · dev `</>` | 모드 전환 | 필요 |
| vector edit: lasso · paint bucket · bend · cut(가위) · erase | 펜 보조 막대 | 필요 |
| chevron 8 (▾) | 묶음 펼치기 | 있음(Iris) |
| check 12 (✓) | 펼침 메뉴 · 드롭다운 고른 표시 | 있음(Iris) ⭐ |

### 2. 레이어 종류 (레이어 목록 16, 지금 12)

| 아이콘 | 상태 |
|---|---|
| frame · section · rect · text · ellipse · line · polygon · star · path · vector · instance · boolean | 있음(Iris `LAYER_ICON`) |
| group (점선 사각형) | 필요 |
| auto layout frame: 세로 · 가로 · 격자(서로 다른 아이콘) | 필요 |
| component (◆ 4개 묶음, 보라) · component set | 필요 |
| mask · absolute position · image · video | 필요(image는 지금 DS `image`) |
| lock · unlock · eye · eye-off (행 끝 토글) | 있음(Iris 인라인, DS `lock` `unlock` `visibility_*`도 있음) |
| collapse all (Layers 머리) | 필요 |

### 3. 선택 머리 · Position

| 아이콘 | 쓰는 곳 | 상태 |
|---|---|---|
| select matching layers | 선택 머리 | 필요 |
| create component | 선택 머리 | 필요 |
| use as mask | 선택 머리 | 있음(Iris) |
| boolean: union · subtract · intersect · exclude · flatten | 선택 머리 ▾ | 있음(Iris 4종) / flatten 필요 |
| bring to front · forward · backward · send to back | 선택 머리(Iris) | 있음(Iris) |
| ignore auto layout (절대 위치) | Position 머리 | 있음(Iris, 이번에 새로) ⭐ |
| align left · h-center · right · top · v-center · bottom | Alignment | 있음(Iris) |
| more (☰) | Alignment 더보기 | 있음(Iris, 이번에 새로) ⭐ |
| distribute h · v, tidy up | ☰ 메뉴 | 있음(Iris) / tidy up 필요 |
| rotation (∠) · rotate 90° · flip h · flip v | Rotation | 있음(Iris) |
| constraints 상자 | Constraints | 있음(Iris, 그림) |

### 4. Layout · Auto layout

| 아이콘 | 상태 |
|---|---|
| aspect ratio lock / unlock(⤡) | 있음(Iris, 사슬 모양) — 피그마 모양(모서리 화살표)으로 바꿀지 결정 |
| resizing: fixed · hug(→←) · fill(←→) (▾ 메뉴 앞) | 필요 |
| min / max width · height | 필요 |
| auto layout on/off (오토 레이아웃 토글) | 필요 |
| flow: freeform · vertical ↓ · horizontal → · grid | 필요(지금은 글자/임시 그림) |
| wrap ↩ | 필요 |
| gap 세로 · 가로 · 격자 행/열 | 필요 |
| padding: 가로 · 세로 · 위 · 오른쪽 · 아래 · 왼쪽 · individual | 필요 |
| alignment pad 막대 3개 미리보기 | 필요 |
| auto layout settings (⫶ 슬라이더) | 필요 |
| resize to fit (⤡ 안쪽) | 필요 |
| clip content 체크 | 있음(체크 상자) |

### 5. Appearance · Fill · Stroke · Effects · Export

| 아이콘 | 상태 |
|---|---|
| eye / eye-off (Appearance 머리) | 있음(Iris, 이번에 머리로 옮김) ⭐ |
| blend mode (물방울) | 있음(Iris, 이번에 새로) ⭐ |
| opacity (체크무늬 사각) | 있음(Iris, 사선 사각) |
| corner radius (┌) · independent corners · 네 모서리 방향 | 있음(Iris) |
| corner smoothing (⫶) | 필요 |
| styles & variables (⁘ 4점) | 필요(지금 Iris는 임시 그림) |
| detach style / variable (⛓ 끊김) | 필요 |
| paint type: solid · linear · radial · angular · diamond · image · video · pattern · noise · texture | 필요 |
| eyedropper(Sample color) | 있음(Iris) |
| gradient flip ⇆ · rotate 90 | 있음(Iris flip) / rotate 필요 |
| stroke weight(≡) · stroke settings(⫶) · individual strokes ▣ · top/bottom/left/right · custom | weight 있음 / 나머지 필요 |
| end points: none · line arrow · triangle · circle · diamond · square | 필요(지금 글자만) |
| stroke join: miter · bevel · round | 필요 |
| effects: drop shadow · inner shadow · layer blur · background blur · noise · texture · glass | 필요 |
| layout guide: grid · columns · rows | 필요 |
| export settings(⋯) | 있음(DS `menu_meatball`) |

### 6. 텍스트

| 아이콘 | 상태 |
|---|---|
| text resizing: auto width · auto height · fixed size | 필요 |
| align left · center · right · justify | 있음(Iris 3종) / justify 필요 |
| align top · middle · bottom | 필요 |
| underline · strikethrough · list bullet · list number | 있음(Iris) |
| type settings(⫶) | 필요 |
| line height(Ā) · letter spacing(|A|) · paragraph spacing | 필요(지금 글자 라벨) |
| truncate · sub/superscript | 필요 |
| text style 칩 "Ag" | 글자로 처리 |

### 7. 패널 · 메뉴 · 상단

| 아이콘 | 상태 |
|---|---|
| 패널 접기(사이드바) | 있음(Iris) |
| page find(🔍) · add page(+) · page divider | DS `search` `plus` / divider 필요 |
| assets 라이브러리 · 필터 · 목록/격자 전환 | DS `filter` `list` / 라이브러리 · 격자 필요 |
| present ▶ · prototype 화살표 | 필요 |
| zoom ▾ · 줌 +/− · 1:1 · fit | DS `zoom_in` `zoom_out` / fit은 Iris |
| AI sparkle(✦) | `—` 쓰지 않음 |

## 우선순위

1. **⭐가 붙은 것을 세트로 옮기기:** 이번에 적용한 화면에서 쓰는 것들이에요.
2. **Auto layout 묶음:** flow · resizing · padding · gap · settings. 지금 인스펙터에서 가장 많이 비어 있어요.
3. **레이어 종류:** group · auto layout 3종 · component
4. **Effects · Stroke · paint type**
5. **툴바 확장:** slice · code · annotation · measurement · actions · 모드 · 펜 보조 막대
