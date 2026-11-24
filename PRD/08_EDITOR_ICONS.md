# 08. 편집기 아이콘 목록

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

## 제안: 편집기 아이콘 세트 만들기

- **그리드:** 16 × 16(툴바용 24 × 24 변형)
- **선:** 1.25px 단색, 모서리 round, `currentColor`
- **저장 위치:** `app/canvas/icons.ts`에 이름 → 경로 사전으로 모으고 `<EditorIcon name size>` 부품 하나로 그려요.
- **디자인 시스템 반영:** 디자인 시스템에 넣을지(`outlined/16px/editor_*`) 정해야 해요. 넣는다면 원본은 사내 전용 리포에 둬요.

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
