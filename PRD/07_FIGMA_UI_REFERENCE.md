# 07. 피그마 UI3 편집기 레퍼런스

Iris 편집기를 피그마처럼 만들 때 기준으로 삼는 문서입니다. 피그마 편집기를 직접 눌러 보고 화면 구성, 기능, 규격, 인터랙션, 모션을 재서 정리했습니다.

- **측정일:** 2026-11-24
- **대상:** 「바드림 Design System」 파일의 Core & Identity 페이지
- **환경:** 크롬, 레티나(DPR 2). 값은 모두 CSS px입니다.
- **측정 방법:** DOM 계산값(getComputedStyle), 피그마 CSS 변수, 확대 스크린샷으로 쟀습니다. 캔버스는 WebGL이라 화면을 보고 쟀습니다.
- **원본 보호:** 값이 바뀌는 버튼은 누른 뒤 바로 ⌘Z로 되돌렸습니다. 테스트로 그린 도형은 지웠습니다.
- **표기:**
  - `✅` 이번에 Iris에 적용했어요.
  - `🕓` 나중에 추가할 항목이에요. 기능이 아직 없거나 범위가 커요.
  - `—` 참고용이에요. Iris에 넣지 않아요.

아이콘 목록은 [08_EDITOR_ICONS.md](08_EDITOR_ICONS.md)에 따로 있어요.

---

## 0. Iris에 옮길 때의 원칙

1. **무드는 Iris를 따릅니다.**
   - 패널은 회색 캔버스 위에 떠 있는 흰 카드(`.float`)예요.
   - 모서리는 corner smoothing 60% squircle을 써요.
   - 글꼴은 Pretendard 12px이에요.
   - 색은 바드림 디자인 시스템 토큰이에요. 강조색은 brand-primary(#2C7BE2)예요.
   - 캔버스 선택색은 피그마와 같은 #0D99FF예요.
2. **간격과 크기는 피그마를 따릅니다.** 깨져 보이거나 지나치게 좁은 곳이 대상이에요. 예를 들면 2칸 입력 사이 4px, 툴바 안쪽 4px 같은 곳이에요.
3. **모션은 피그마 값을 따릅니다.** 호버와 메뉴는 즉시 바뀌어요. 툴팁은 처음에 1초 뒤에 떠요. 토스트는 3초 동안 보여요.
4. **피그마는 좌우 패널이 화면에 붙은 기본 모드이고, Iris는 떠 있는 모드예요.** Iris는 피그마의 *Minimize UI* 모드(§2.5)와 같은 구조예요.

---

## 1. 디자인 토큰 (피그마 CSS 변수)

### 1.1 글자

피그마 편집기 글꼴은 Inter예요. 기본 굵기는 450이고, 강조 굵기는 550이에요.

| 토큰 | 크기/줄 높이 | 쓰는 곳 |
|---|---|---|
| text-body-small | 9 / 14 | 레일 라벨, 속성 보조 라벨(Alignment · Position …, 굵기 500) |
| text-body-medium | 11 / 16 | 패널 본문 전체, 메뉴, 툴팁 |
| text-body-large | 13 / 22 | 파일 이름, 선택 종류 제목(Frame), Actions 패널 |
| heading-medium | 15 | — |

> **Iris:** 기본 글자는 12/18이에요. 보조 라벨은 11/16 neutral-500을 써요. 9px은 바드림 무드에 비해 너무 작아서 쓰지 않아요.

### 1.2 색 (라이트)

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| grey-100 | #F5F5F5 | 호버 배경, 입력칸 배경, 고른 페이지 행 |
| grey-200 | #E6E6E6 | 구분선, 비활성 입력칸 선, 칩 선 |
| grey-300 | #D9D9D9 | 비활성 기본 버튼 |
| grey-500 | #757575 | — |
| grey-800 | #2C2C2C | 토스트 배경 |
| grey-900 | #1E1E1E | 메뉴, 툴팁 배경 |
| blue-100 | #F2F9FF | 고른 레이어의 자식 행 |
| blue-200 | #E5F4FF | 고른 레이어 행, 켜진 아이콘 토글, 레일의 켜진 탭 칩 |
| blue-500 | **#0D99FF** | 선택, 호버 테두리, 크기 표시, 켜진 도구, Share 버튼 |
| blue-600 | #007BE5 | 레일의 켜진 아이콘, 정렬판에서 고른 표시 |
| menu hover | #0C8CE9 | 검은 메뉴의 호버 행 |
| purple-500 | #9747FF | 컴포넌트, 인스턴스 선택 |
| red-500 | #F24822 | 간격 측정선 |
| pink-500 | #FF24BD | 오토 레이아웃 간격 표시 |
| green-500 | #14AE5C | Dev Mode 강조색 |
| 글자 | rgba(0,0,0,.9) / .5 / .3 | 본문 / 보조 / 흐림·비활성 |

### 1.3 모서리, 그림자, 간격

**모서리**

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| radius-small | 2 | 크기 표시, 일부 칩 |
| radius-medium | **5** | 버튼, 입력칸, 행, 툴팁 |
| radius-large | **13** | 메뉴, 팝오버, 툴바, 토스트, 떠 있는 패널 |

**그림자 (elevation)**

| 단계 | 값 | 쓰는 곳 |
|---|---|---|
| 100 | `0 1 3 rgba(0,0,0,.15), 0 0 .5 rgba(0,0,0,.3)` | 떠 있는 패널 |
| 200 | `0 1 3 .1, 0 3 8 .1, 0 0 .5 .18` | 툴바 |
| 400 | `0 2 5 .15, 0 10 16 .12, 0 0 .5 .12` | 메뉴, 팝오버 |
| 500 | `0 2 5 .15, 0 10 24 .18, 0 0 .5 .08` | — |

**간격(spacer):** 4 · 8 · 12 · 16 · 24 · 32 · 40

### 1.4 모션 토큰

- **길이:** duration-sm .1s · md .2s · lg .4s
- **이징:** 배경과 높이에 `cubic-bezier(.645,.045,.355,1)`, 레일에 `cubic-bezier(.2,0,0,1)`
- **실제 동작은 대부분 0s예요.** 버튼, 행, 메뉴 항목의 호버 배경, 메뉴와 팝오버 열기, 툴팁, 토스트에는 transition이 없어요.

---

## 2. 화면 뼈대

### 2.1 기본 모드

```
┌56┬─────240─────┬──────── canvas ────────┬─────240─────┐
│레│ 왼쪽 패널     │                         │ 오른쪽 패널   │
│일│              │        [ 툴바 48h ]     │              │
└──┴──────────────┴─────────────────────────┴──────────────┘
```

- **레일:** 56 + 오른쪽 선 1px #E6E6E6
- **좌우 패널:** 각각 240이에요. 경계선은 1px rgba(0,0,0,.1)이에요. Agents 탭에서는 왼쪽 패널이 281까지 넓어져요(폭 조절 가능).
- **툴바:** 캔버스 아래 가운데, 바닥에서 12px 띄워요.

### 2.2 왼쪽 레일 (UI3)

- **안쪽 여백:** 위 8 · 아래 16
- **맨 위 메인 메뉴 버튼:** 32×32 r5에 피그마 로고 24
- **탭 버튼:** 56×56, 세로로 쌓고 gap 2, 위아래 padding 4
  - 칩 32×32 r5 안에 아이콘 24
  - 라벨 9/14
- **켜진 탭:** 칩 #E5F4FF, 아이콘 #007BE5
- **호버:** 칩 #F5F5F5, 즉시
- **구분선:** 16×1, 메인 메뉴 아래와 Tools·Variables 사이
- **탭 순서:** File · Agents · Assets · Tools | Variables
- **맨 아래:** Review unpublished changes(32)
- **레일 이동:** transform .2s cubic-bezier(.2,0,0,1)

`🕓` Iris는 레일 대신 왼쪽 패널 위에 탭(File · Assets · Docs)을 둬요.

### 2.3 오른쪽 패널 머리

- **위 줄 (높이 32, y8)**
  - 아바타 24 + ▾ (멀티플레이어)
  - Present ▶(32) + ▾(16)
  - Share(55×32, #0D99FF, 흰 글자 11/550, r5)
- **탭 줄 (y48)**
  - Design · Prototype 탭: 24h, padding 0 8, r5. 켜진 탭은 #F5F5F5 + 550, 꺼진 탭은 글자 .5
  - 오른쪽 끝 줌 "66% ▾": 56×24, padding 4 4 4 12

### 2.4 섹션 공통 (Design 탭)

| 요소 | 규격 |
|---|---|
| 섹션 머리 | 40h, padding 0 8 0 16. 제목 11/550, 오른쪽에 아이콘 버튼 24×24 |
| 섹션 사이 | 1px #E6E6E6 |
| 보조 라벨 | 9/14 · 500 · .5 (Alignment · Position · Rotation …) |
| 라벨 → 입력칸 | 2 |
| 줄 사이 | 8 |
| 섹션 아래 여백 | 16 |
| 열 | 패널 안쪽 16, 입력 88 + 8 + 88 + 8 + 아이콘 버튼 24 |
| 입력칸 | 88×24, **#F5F5F5 바탕, 선 없음**, r5. 앞 붙임(X, Y, 아이콘) 24×24 · .5 |
| 입력칸 비활성 | 흰 바탕 + 1px #E6E6E6 + 글자 .3 (예: 오토 레이아웃이 위치를 정할 때 X/Y) |
| 입력칸 호버 | 바뀌지 않아요. W/H처럼 메뉴가 있는 칸은 오른쪽에 ▾가 나타나요 |
| 입력칸 포커스 | 1px #0D99FF(안쪽, offset −1), 값 전체 선택, 선택색 rgba(13,153,255,.4) |
| 세그먼트 버튼 묶음 | 칸마다 29×24, #F5F5F5, 사이 간격 0, 바깥 모서리만 r5 |
| 켜진 아이콘 토글 | #E5F4FF 바탕 + 파란 아이콘(오토 레이아웃, 개별 패딩, 비율 잠금 …) |
| 변수에 연결된 값 | 입력칸 안에 흰 칩(24×20, 1px #E6E6E6, r5, padding 0 4) |
| 비어 있는 섹션 | Fill · Stroke · Effects · Layout guide · Export는 머리 줄만 보여요. 제목은 굵기 450이고 + 버튼이 있어요. 값이 생기면 550 |

`✅` Iris 인스펙터에 적용한 값이에요.
- 섹션 여백: 10·16·12 → **12·16·16**
- 줄 사이: 4 → **8**
- 2칸·3칸 입력 사이: 4 → **8**

`—` 입력칸 높이는 디자인 시스템 기준 28을 유지해요. 피그마는 24예요.

### 2.5 Minimize UI (떠 있는 모드, Iris와 같은 구조)

- **왼쪽:** (12,12)에 236×48 알약, r13, padding 8, elevation-100. 로고 24 · 파일 이름 13/550 · 펼치기 버튼이 들어가요.
- **오른쪽 패널:** 위 12, 오른쪽 12, 높이는 화면 − 24, r13, elevation-100
- **툴바:** 그대로예요.
- **오른쪽 패널 위치:** `top .08s ease-out`

---

## 3. 왼쪽 레일 탭

| 탭 | 화면 구성 |
|---|---|
| **File** | 파일 머리(파일 이름 13/550 ▾ · Minimize UI 32 · 프로젝트 이름 링크 11 .5) / Pages / Layers |
| **Agents** | 패널이 281까지 넓어져요. "New chat" 머리, 아래에 입력창(문맥 칩 "# Header", "Ask for changes", +, 마이크, 보내기), Recent chats 팝오버(288w, 머리 40h + 아래 안쪽 선 1px, 행에 아이콘 24 + 제목 11/550 + 미리보기 .5) |
| **Assets** | 머리 "Assets" 13/550 + 라이브러리 버튼 / 검색(180×24 #F5F5F5, 포커스 1px 파랑) + 필터 / "All libraries" / 라이브러리 카드(썸네일 206×114 r5, 이름, "1119 components" .5) / "Add more libraries" 보조 버튼(208×24, 1px rgba(0,0,0,.1)) |
| ↳ 라이브러리 안 | 뒤로 + 경로("Created in this file / ❖ Button") / 컴포넌트 묶음 행(224×74, 썸네일 58×58 흰 r5 + 안쪽 .5px 선, 이름, › ) |
| ↳ 묶음 안 | 2열 타일 96×96(r5, 1px #E6E6E6), 사이 16, 아래 이름 11. 호버하면 #F5F5F5 + 오른쪽 위에 개수 배지(회색 알약, "935") + › |
| **Tools** | 머리 "Tools" + "Create ▾" / 검색 + 필터 / Source ▾ · Category ▾ 칩(선 24h) / 안내 카드 / Recents(아이콘 32 + 이름 + 메타) / Suggested |
| **Variables** | 캔버스 대신 표 화면이에요. 왼쪽: Collections(행 32h, 오른쪽에 개수 .5, 고른 행 굵게) / Groups(고른 행 #E5F4FF r5 24h). 머리: 컬렉션 이름 13 · 검색(175×24) · 접기 · Share. 표: 머리칸 40h(padding 0 16, 600), 행 41h, 선 1px #E6E6E6, 이름 칸 200(아이콘 16), 값 칩(견본 14 r2 + "color/blue/50", 흰 바탕 · 1px #E6E6E6 · r5 · 24h), 묶음 머리 행 56h, 아래 "+ Create variable" |

`🕓` Iris에 Agents · Tools · Variables 탭은 없어요. Assets는 Iris EditorAssets에 해당하고, 2열 타일 · 개수 배지 · 경로는 나중에 넣을 수 있어요.

---

## 4. 왼쪽 패널: Pages · Layers

### 4.1 Pages

- **머리:** 40h, 제목 "Pages" 11/550, 🔍 Find와 + Add new page(각 24×24 r5)
- **행:** 바깥 32h, 안쪽 버튼 224×24(좌우 8 들여서) r5, 글자는 x+16
  - 고른 행: #F5F5F5 + 550
  - 호버: #F5F5F5
- **구분선 행(Page divider):** 페이지 사이에 넣을 수 있어요.
- **누를 때 바뀌는 것**
  - **클릭:** 그 페이지로 이동해요.
  - **더블클릭:** 이동하면서 바로 이름 바꾸기가 열려요. 입력칸은 224×24, 흰 바탕, 1px #0D99FF, r5, pl 7이고 글자가 전부 선택돼요. Esc는 취소, Enter는 저장이에요.
  - **우클릭(검은 메뉴):** Copy link to page | Rename page · Duplicate page | Move up · Move down · Move to top · Move to bottom | Delete page
  - **🔍 Find:** 패널 내용이 찾기 막대로 바뀌어요. 검색칸 #F5F5F5에 포커스 파랑, 필터 ⫶, ✕가 있어요.

### 4.2 Layers

- **머리:** 40h, "Layers" 11/550. 펼친 항목이 있으면 오른쪽에 "Collapse layers" 버튼이 나와요.
- **행:** 바깥 32h(padding 0 8), 안쪽 24h r5
  - ▸ 버튼 24×24(아이콘 16)
  - 종류 아이콘 16
  - 이름(앞 8)
- **들여쓰기:** 단계마다 24예요. 자식의 ▸가 부모의 종류 아이콘 아래에 와요.
- **상태별 색**

| 상태 | 모양 |
|---|---|
| 호버 | #F5F5F5, 즉시. 오른쪽에 🔒(오른쪽 끝에서 51) · 👁(27)이 나타나요 |
| 고름 | #E5F4FF, 종류 아이콘이 진해져요(.9). 글자 굵기는 그대로 |
| 고른 것의 자식 | #F2F9FF |
| 이어진 여러 행을 고름 | 빈틈 없이 하나의 파란 덩어리로 보여요 |
| 잠금 · 숨김 | 🔒 · 👁‍🗨 아이콘이 계속 보여요. 숨긴 행은 흐려요(.3) |

- **누를 때 바뀌는 것**
  - **▸ 클릭:** 펼치기·접기
  - **행 클릭:** 선택해요. 캔버스와 오른쪽 패널이 같이 바뀌어요.
  - **캔버스에서 깊이 고르기:** 조상 행이 자동으로 펼쳐지고 그 행까지 스크롤돼요.
  - **더블클릭:** 이름 바꾸기 입력칸이 열려요. 164×24, 고른 행이면 #F2F9FF 바탕, 1px 파랑, r5, padding 0 8, 전체 선택이에요.
  - **🔒 · 👁 클릭:** 바로 바뀌고 아이콘이 계속 보여요.
    - ⚠️ 행 오른쪽 끝은 토글 자리예요. 행을 고르려다 잠그기 쉬워요.
  - **끌기:** 순서를 바꿔요. 캔버스도 바로 따라 바뀌어요(오토 레이아웃은 다시 배치돼요).
  - **우클릭:** 그 레이어를 고르면서 검은 메뉴가 떠요.
    - Copy ⌘C · Paste to replace ⇧⌘R · Copy/Paste as › · Build this with code · Find similar designs · Add motion ›
    - Move to page › · Bring to front ] · Send to back [
    - Group selection ⌘G · Frame selection ⌥⌘G · Ungroup ⌘⌫ · Rename ⌘R · Rename layers · Flatten ⌥⇧F · Outline stroke ⌥⌘O · Set as thumbnail · Use as mask ⌃⌘M
    - Remove auto layout ⌥⇧A · More layout options › · Create component ⌥⌘K · Plugins › · Widgets ›
    - Show/Hide ⇧⌘H · Lock/Unlock ⇧⌘L
    - Flip horizontal ⇧H · Flip vertical ⇧V
  - **Collapse layers:** 모두 접고 토스트 "Layers collapsed"를 띄워요.

`✅` Iris 레이어 목록에 적용했어요.
- 호버는 회색이에요.
- **고른 행은 옅은 파랑(brand-primary-lightest)이고 굵기는 그대로예요.** 전에는 호버와 같은 회색 + 굵게라서 둘을 구분할 수 없었어요.
- 고른 것의 자식은 그 절반 농도예요.

`🕓` 나중에 할 일이에요.
- 이어진 선택 행을 한 덩어리로 보이게 하기(squircle 모서리 처리 필요)
- Collapse layers 버튼
- 캔버스에서 고르면 자동으로 펼치고 스크롤하기

---

## 5. 오른쪽 패널: Design 탭 (프레임을 골랐을 때)

### 5.1 선택 머리

- **"Frame ▾"(13/550):** 누르면 검은 메뉴가 떠요.
  - Section · ✓Frame · Group
  - 기기 프리셋(이름 + 크기 .5): iPhone 18 Pro 402×874 … Desktop 1440×1024
  - 길면 아래 ⌄로 스크롤해요.
- **아이콘 24×24 r5**

| 버튼 | 단축키 | 누르면 바뀌는 것 |
|---|---|---|
| Select matching layers | ⌥⌘A | 같은 레이어를 다 골라요. 없으면 토스트 "No matching layers to select on page" |
| Create component | ⌥⌘K | 선택이 **보라(#9747FF)**로 바뀌어요(상자, 크기 표시, 레이어 이름·아이콘 ❖). 머리가 종류 대신 *레이어 이름*으로 바뀌고 "Properties" 섹션 + "Publish…"가 생겨요 |
| Use as mask | ⌃⌘M | 레이어 행 오른쪽에 "Mask" 표시, 캔버스에 마스크 윤곽, "Mask" 섹션(Alpha ▾)이 생겨요. 툴팁은 "Remove mask"로 바뀌어요 |
| Union | ⌥⇧U | 불리언 레이어 "Union"이 생겨요. 패널은 Dimensions · 합쳐진 Fill 행으로 바뀌어요 |
| Boolean ▾ | | Union ⌥⇧U · Subtract ⌥⇧S · Intersect ⌥⇧I · Exclude ⌥⇧E · Flatten ⌥⇧F |

### 5.2 Position

- **머리 오른쪽 "Ignore auto layout"(절대 위치)를 켜면:**
  - X/Y가 입력 가능(회색 바탕)으로 바뀌어요.
  - Y 옆에 제약 버튼이 생겨요.
  - 형제 레이어가 다시 배치돼요.
- **Alignment:** 가로 3칸 + 세로 3칸 세그먼트, 그리고 ☰ More
  - ☰ More: Tidy up ⌃⌥T(하나만 고르면 비활성 .4) · Distribute vertical spacing ⌃⌥V · Distribute horizontal spacing ⌃⌥H
  - 단축키: Align left ⌥A · horizontal centers ⌥H · right ⌥D · top ⌥W · vertical centers ⌥V · bottom ⌥S
- **Position:** X · Y
- **Rotation:** 각도 칸 + [Rotate 90° right · Flip horizontal ⇧H · Flip vertical ⇧V]
  - 90° 돌리면 각도 칸이 −90°가 되고, 오토 레이아웃 부모가 다시 배치돼요.
  - 뒤집으면 각도 칸이 180°가 되고 내용이 거울처럼 뒤집혀요.

### 5.3 Auto layout

- **머리:** 오토 레이아웃 켜기/끄기 토글. 켜지면 #E5F4FF예요.
- **Flow:** 4칸 세그먼트 + 줄바꿈 ↩

| 버튼 | 누르면 바뀌는 것 |
|---|---|
| Freeform | 섹션 이름이 "Layout"으로 바뀌어요. 머리에 ⤡(내용에 맞추기) 버튼, 간격 칸 "Spacing"이 생겨요 |
| Vertical | 기본 상태예요 |
| Horizontal | 간격 아이콘이 ⟷로, 정렬판 아이콘이 세로 막대로 바뀌어요. 프레임이 다시 배치되고 크기 표시가 실시간으로 바뀌어요("2672 Hug × 708 Hug") |
| Grid | "1 × Auto" 격자 상자, 열 간격 · 행 간격 칸이 생기고, ↩ 버튼이 격자 설정(파랑)으로 바뀌어요 |

- **Resizing:** W · H 칸 안에 크기 방식("Hug", "Fill")이 같이 보여요.
  - **호버:** 칸 안에 ▾가 나와요.
  - **▾ 메뉴:** Fixed width (928) · ✓Hug contents · Fill container | Add min width… · Add max width… | Apply variable…
  - **칸에 포커스하거나 메뉴가 열려 있을 때 캔버스:** 레이어 이름 태그(파란 알약), 점선 테두리, 좌우 끝에 빨간 ←→ 화살표가 보여요(폭 방향 표시).
  - **비율 잠금 ⤡:** W·H를 Fixed로 바꾸고 잠가요. 라벨이 "Dimensions"로 바뀌고 토스트 "Width and height set to Fixed for …"가 떠요.
- **Alignment 정렬판:** 88×56, #F5F5F5 r5, 점 .3
  - **호버:** 그 칸에 막대 3개 미리보기가 떠요.
  - **클릭:** 고른 칸이 파랑(#007BE5)으로 바뀌고 판에 1px 포커스 선이 생겨요.
- **Gap:** 아이콘 + 값(변수 칩) + ▾
  - **▾:** ✓72 · Auto | Apply variable…
  - **Gap 칸에 호버하면** 캔버스의 모든 간격이 분홍 사각형으로 보여요.
- **⫶ Auto layout settings:** 오른쪽 패널 왼쪽에 흰 팝오버(§9.1)가 떠요.
  - Strokes: Excluded ▾
  - Canvas stacking: Last on top ▾
  - Align text baseline: [— | ✓]
  - Auto spacing: Between ▾
  - Layout ⓘ: Legacy ▾
- **Padding:** 가로 · 세로 2칸
  - 개별 패딩 버튼을 켜면 4칸(왼쪽, 위 / 오른쪽, 아래)이 되고 칸마다 변 아이콘이 붙어요. 포커스한 칸에는 연결 끊기 아이콘이 보여요.
- **Clip content:** 체크 상자 16 + 라벨(앞 8)

### 5.4 Appearance

- **머리:** 👁 Hide ⇧⌘H(캔버스에서 사라지고 행이 흐려져요) · 💧 Blend mode
- **Blend 메뉴:** ✓Pass through · Normal | Darken · Multiply · Plus darker · Color burn | Lighten · Screen · Plus lighter · Color dodge | Overlay · Soft light · Hard light | Difference · Exclusion | Hue · Saturation · Color · Luminosity
- **Opacity · Corner radius:** 2칸 + 개별 모서리 버튼
  - 개별 모서리를 켜면 4칸(┌ ┐ └ ┘)이 생기고 옆에 ⫶ 모서리 부드럽게(corner smoothing) 버튼이 붙어요.

### 5.5 Fill · Stroke · Effects · Layout guide · Export

- **Fill**
  - **머리:** ⁘(스타일·변수) · +
  - **행:** 견본 + 이름(변수 칩) · 👁 · −
  - **호버:** ⛓ 분리 아이콘이 나오고, 2줄 툴팁("common/white-emphasis / #FFF · 100%")이 떠요.
  - **견본 클릭:** 칠 팝오버(§9.2)가 열려요.
- **Stroke +**
  - **행 추가:** "000000 100 %" 행이 생기고 잠깐 회색으로 반짝여요(새로 생긴 표시).
  - **Position(흰 선택칸):** Center · ✓Inside · Outside
  - **Weight:** ≡ 1
  - **⫶ Stroke settings:** [Basic | Dynamic | Brush] / Style Solid ▾ / Width profile / End points None ▾ / Join 3칸 / Miter angle 28.96°
  - **▣ 개별 변:** ✓All · Top · Bottom · Left · Right | Custom
  - **End points:** None ▾
- **Effects +**
  - **효과 종류 메뉴가 바로 떠요:** Inner shadow · Drop shadow · Layer blur · Background blur · Noise · Texture · Glass | Shader | 3D transform (Beta) · Perspective (Beta)
  - **Esc:** 추가하지 않고 닫혀요.
  - **Drop shadow를 고르면:** 행(고른 행은 1px 파란 테두리)과 설정 팝오버가 자동으로 열려요.
    - Position X 0 / Y 4, Blur 4, Spread 0, Color 000000 25 %, ☐ Show behind transparent areas
    - **기본값:** x0 · y4 · blur4 · spread0 · #000 25%
- **Selection colors:** 견본 3개 + "+7"이 보여요. 제목을 누르면 견본 + 이름 목록으로 펼쳐져요.
- **Layout guide +**
  - "Grid 10px" 행과 팝오버가 생겨요. 종류 Grid ▾(Grid/Columns/Rows), Size 10(자동 포커스), Color FF0000 10 %
  - 캔버스에 빨간 10px 격자가 보여요.
- **Export +**
  - **행:** "1x ▾"(0.5x 0.75x ✓1x 1.5x 2x 3x 4x 512w 512h) · "PNG ▾"(PNG JPEG SVG PDF) · ⋯ · −
  - "Export Contents" 버튼(208×24, 1px rgba(0,0,0,.1)), "› Preview"
  - Fill 섹션에 "☑ Show in exports"가 생겨요.
  - **⋯ 고급 설정:** Suffix · Color profile sRGB ▾ · Image resampling Detailed ▾ · ☑ Ignore overlapping layers · ☐ Include bounding box

### 5.6 텍스트 레이어

- **머리:** "Text" + 아이콘(Select matching · Create link · ⋯)
- **Layout:** Resizing 3칸 [Auto width · Auto height · Fixed size], W/H(Fill · Hug)
- **Typography:** 스타일 칩 "Ag Heading 1/28 B · 28/40"(전체 폭, #F5F5F5) + 분리 아이콘
  - **칩에 호버:** 2줄 툴팁이 떠요.
  - **칩 클릭:** "Text styles" 팝오버(검색, 라이브러리, +, ✕, 묶음별 목록, 고른 행 #F2F9FF, 행 호버하면 ⫶ 편집)
  - **분리하면:** 글꼴(전체 폭) / 굵기 · 크기 / Line height · Letter spacing(아이콘이 붙은 칸, 값은 변수 칩)
  - **Alignment:** 가로 3칸 + 세로 3칸 + ⫶ Type settings
    - Type settings: Preview / Alignment 4칸(+Justify) / Decoration(None · Underline · Strikethrough · ›) / List style(None · Bulleted · Numbered) / Truncate text / Position(Sub · Normal · Super)

`🕓` Iris InspectorLayer에 비슷한 항목이 대부분 있어요. 빠진 것은 Ignore auto layout 머리 버튼, 정렬판 호버 미리보기, Gap 호버 표시, 개별 모서리의 corner smoothing, Stroke settings 팝오버, 효과 종류 메뉴, Export예요.

---

## 6. Prototype 탭

- "Prototype with Agent"(전체 폭 24h 선 버튼)
- **Interactions** 머리 + Add action
  - 누르면 행 "Click ⊘ None"(고른 행: #E5F4FF + 파란 선)과 Interaction 팝오버가 열려요.
  - 팝오버: Trigger "On click ▾" · Action "None ▾"
- **Scroll behavior:** Position "Scroll with parent ▾"(프레임은 Overflow도)
- "Show prototype settings"(선 버튼)

`—` Iris 범위 밖이에요. Iris의 오른쪽 탭은 Design · Plan · Dev예요.

---

## 7. 메뉴

### 7.1 공통 규격 (검은 메뉴)

| 요소 | 값 |
|---|---|
| 바탕 | #1E1E1E, r13, padding 8 0, elevation-400, 폭은 내용에 맞춰(약 190~200) |
| 항목 | 24h. 바깥 li에 padding 0 8, 안쪽에 r5 · padding 4 8 4 24(앞 24는 ✓ 칸) |
| 도구 메뉴 항목 | ✓ 16 + 아이콘 24 + 이름 + 단축키(왼쪽 16 띄움) |
| 글자 | 흰색 11. 단축키는 오른쪽 정렬에 흰색 .7. 비활성은 .4 |
| 호버 | **#0C8CE9**(파랑) 바탕, 즉시 |
| 구분선 | 8h 안에 1px 선 |
| 하위 메뉴 › | 클릭 없이 **호버하면 열려요**. 부모 오른쪽 +4px, 위쪽은 그 행에 맞춰요 |
| 위치 | 버튼 바로 아래(+4)나 위. 화면 밖으로 나가면 반대쪽으로. 우클릭 메뉴는 커서 +5px |
| 열기 · 닫기 | **애니메이션 없어요** |

`—` Iris의 드롭다운 메뉴는 흰 squircle 메뉴(무드)를 유지해요. 우클릭 메뉴(ContextMenu)는 이미 검은색(#1E1E1E · 호버 #0D99FF)이에요.

### 7.2 메인 메뉴 (피그마 로고)

- Back to files | Actions… ⌘K | File › · Edit › · View › · Object › · Text › · Arrange › · Vector › | Plugins › · Widgets › · Preferences › · Libraries | Open in desktop app | AI balance › · Help and account ›
- **Edit:** Undo ⌘Z · Redo ⇧⌘Z · Copy as › · Paste over selection ⇧⌘V · Paste to replace ⇧⌘R · Duplicate ⌘D · Delete ⌫ · Find ⌘F · Find next ⇧⌘F … · Copy properties ⌥⌘C · Paste properties ⌥⌘V · Pick color ⌃C · Select all ⌘A · Select matching layers ⌥⌘A · Select none ⎋ · Select inverse ⇧⌘A
- **View:** Pixel grid ⇧' · Layout guides ⇧G · Rulers ⇧R · Comments ⇧C · Annotations ⇧Y · Outlines › · Pixel preview ⇧⌘P · Minimize UI ⇧⌘\ · Show/Hide UI ⌘\ · Multiplayer cursors ⌥⌘\ · Switch to Dev Mode ⇧D · Zoom in ⌘+ · Zoom out ⌘− · Zoom to 100% ⌘0 · Zoom to fit ⇧1 · Zoom to selection ⇧2 · Previous/Next page · Zoom to previous/next frame ⇧N/N
- **Object:** Frame selection ⌥⌘G · Group ⌘G · Ungroup ⌘⌫ · Wrap in new section ⌘S · Use as mask ⌃⌘M · Add auto layout ⇧A · Create component ⌥⌘K · Detach instance ⌥⌘B · Bring to front ] · Bring forward ⌘] · Send backward ⌘[ · Send to back [ · Flip horizontal ⇧H · Flip vertical ⇧V · Rotate 180° / 90° left / 90° right · Flatten ⌥⇧F · Outline stroke ⌥⌘O · Show/Hide ⇧⌘H · Lock/Unlock ⇧⌘L · Collapse layers ⌥L · Remove fill ⌥/ · Remove stroke ⇧/ · Swap fill and stroke ⇧X
- **Text:** Bold ⌘B · Italic ⌘I · Underline ⌘U · Strikethrough ⇧⌘X · Create link ⇧⌘U · Bulleted list ⇧⌘8 · Numbered list ⇧⌘7 · Alignment › · Adjust › · Case ›
- **Arrange:** Round to pixel · Align left ⌥A … bottom ⌥S · Tidy up ⌃⌥T · Pack horizontal/vertical · Distribute horizontal spacing ⌃⌥H · vertical ⌃⌥V · Distribute left/centers/right/top/centers/bottom

`🕓` Iris 메인 메뉴에는 지금 Back to files · Project settings · Requirements board · Design system · 테마만 있어요. Edit · View · Object 하위 메뉴는 이미 있는 단축키와 기능을 모아서 나중에 넣을 수 있어요.

### 7.3 파일 이름 ▾

Show version history · Library › · Export… ⇧⌘E | Add to sidebar › | Create branch… | File color profile › | Duplicate · Rename · Go to folder · Move file… · Move to trash | Restore default thumbnail

### 7.4 줌 메뉴 (오른쪽 위 "66% ▾")

- **맨 위:** 배율 입력칸(30h, 안쪽 2px 파란 선, 값 선택됨)
- Zoom in ⌘+ · Zoom out ⌘− · Zoom to fit ⇧1 · Zoom to 50% · Zoom to 100% ⌘0 · Zoom to 200%
- Pixel preview › · ✓Pixel grid ⇧' · ✓Snap to pixel grid ⇧⌘' · ✓Layout guides ⇧G · Rulers ⇧R · Outlines › · ✓Multiplayer cursors ⌥⌘\ · ✓Additional labels
- ✓Comments ⇧C · ✓Annotations ⇧Y

`🕓` Iris 줌 메뉴에 배율 입력칸과 보기 토글(Pixel grid · Rulers · Layout guides)을 넣을 수 있어요.

### 7.5 캔버스 우클릭

Copy ⌘C · Paste here · Paste to replace ⇧⌘R · Copy/Paste as › · Build this with code · Find similar designs · Add motion › · Select layer › · Move to page › · Bring to front ] · Send to back [ · Group selection ⌘G · Frame selection ⌥⌘G · Flatten ⌥⇧F · Outline stroke ⌥⌘O · Use as mask ⌃⌘M · Add auto layout ⇧A · Create component ⌥⌘K · Plugins › · Widgets › · Show/Hide ⇧⌘H · Lock/Unlock ⇧⌘L · Flip horizontal ⇧H · Flip vertical ⇧V

메뉴 상자는 r13, padding 8, 폭 200이에요.

---

## 8. 툴바

### 8.1 규격

| 요소 | 값 |
|---|---|
| 막대 | 높이 48, r13, 안쪽 8, 흰 바탕, 그림자 `0 0 .5 .18, 0 3 8 .1, 0 1 3 .1`, 바닥에서 12 |
| 도구 버튼 | 32×32 r5, 안쪽 4, 아이콘 24 |
| ▾ 버튼 | 16×32 r5, 도구 버튼과 1px 붙어 있어요 |
| 묶음 사이 | 8 |
| 켜진 도구 | #0D99FF 바탕 + 흰 아이콘(Dev Mode는 초록) |
| 호버 | #F5F5F5, 즉시 |
| 칸막이 | 1px #E6E6E6, 막대 위아래 끝까지(48) |
| 묶음 버튼 아이콘 | 그 묶음에서 **마지막에 쓴 도구** |

### 8.2 도구 묶음 (펼침 메뉴)

| 묶음 | 도구 |
|---|---|
| Move tools | Move V · Hand tool H · Scale K |
| Region tools | Frame F · Section ⇧S · Slice S |
| Shape tools | Rectangle R · Line L · Arrow ⇧L · Ellipse O · Polygon · Star · Image/video… ⇧⌘K |
| Creation tools | Pen P · Pencil ⇧P |
| Type tools | Text T · Text on path |
| Code tools | Code B · Spec D |
| Comment tools | Comment C · Annotation Y · Measurement ⇧M |
| Actions | ⌘K (▾ 없음) |
| 모드 전환 | Draw · Design · Motion · Dev Mode. 118×28 세그먼트, 칸 28×28 r3, 사이 2, 켜진 칸은 흰 칩 |

**펼침 메뉴**
- 검은 메뉴가 ▾ 위에 떠요. 왼쪽 끝은 ▾에 맞추고, 아래 끝은 도구 버튼 위 4px이에요.
- 지금 도구 행은 ✓ + 파란 호버예요.
- 애니메이션이 없어요.

**모드 전환 애니메이션**
- 도구 줄들이 세로로 쌓여 있어요.
- 모드를 바꾸면 안쪽 줄이 `translateY(−48 × n)`로 `transform .3s`(ease) 동안 움직여요.
- 막대 폭은 `width .5s`로 바뀌어요.

**펜 · 벡터 편집 보조 막대**
- 툴바 위에 같은 모양의 막대가 하나 더 떠요.
- [Move] [Lasso] | [Paint] [Bend] [Cut] [Erase] | [More ▾] | ✕
- 아이콘 + 13px 라벨, 켜진 항목은 파랑이에요.

**Actions (⌘K)**
- 툴바와 같은 폭(586)의 흰 패널이 툴바 8px 위에 떠요(354h, r13).
- 검색 32h #F5F5F5 13px · 탭 All/Assets/Plugins & widgets(24h, 켜진 탭 #F5F5F5) · 묶음 제목 11 .5 · 행 32h r5 13px

`✅` Iris 툴바에 적용했어요.
- 높이 40 → **48**
- 안쪽 4 → **8**
- 묶음 사이 2 → **8**
- ▾ 12 → **16**(1px 붙임)
- 칸막이를 위아래 끝까지 늘였어요.
- 펼침 메뉴: ✓ 칸 + 아이콘 + 이름 + 단축키, 막대 위 4px
- Shape 묶음에 **Image/video… ⇧⌘K**를 넣었어요.
- 묶음 버튼 툴팁: "Frame F" 형식
- ▾ 툴팁: "Region tools" 형식

`—` 켜진 도구 색은 Iris 강조색 brand-primary를 써요. 메뉴는 흰 squircle(무드)이에요.

`🕓` 나중에 할 일이에요.
- Slice · Text on path · Code · Spec · Annotation · Measurement · Actions(⌘K) · 모드 전환 · 펜 보조 막대(Lasso · Paint · Bend · Cut · Erase)

---

## 9. 팝오버 (흰 패널)

### 9.1 공통

- **위치:** 오른쪽 패널의 *왼쪽*에 붙어요. 위쪽은 연 행에 맞춰요.
- **크기와 모양:** 폭 240, r13, elevation-400
- **머리:** 40h(제목 11/550, 왼쪽 16, ✕ 24, 아래 안쪽 1px #E6E6E6)
- **행:** 32h(라벨 .5 · 96열 + 흰 선택칸 112×24 · 1px #E6E6E6 · r5 · ▾)
- **열려 있는 동안:** 오른쪽 패널의 다른 컨트롤이 흐려져요(.3).
- **애니메이션:** 없어요.

### 9.2 칠(Fill) 팝오버 / 색 선택기

- **머리:** "Custom" · "Libraries" 탭(11/550, 꺼진 탭 .5) + "+"(New style or variable) + ✕
- **Libraries 탭:** 검색 · "All libraries ▾" · 목록/격자 전환 · 묶음별 목록(견본 16 + 이름, 고른 행 #F2F9FF)
- **Custom 탭**
  - **칠 종류 줄:** 24×24 버튼, 고른 것 #F5F5F5. Solid · Gradient · Pattern · Image · Video · Noise · Texture …
  - **SV 판:** 208×208 r5(안쪽 1px rgba(0,0,0,.1)), 패널 안쪽 16
  - **조준점:** 16 원(흰 4px 테 + 그림자 .2)
  - 스포이드 24 + Hue 막대 180×24 + Opacity 막대 180×24(체크무늬)
  - "Hex ▾" 45 + hex 89 + 불투명도 38 "%"
  - "On this page ▾"(198×24) + 견본 16×16(r 20%) 줄
- **Gradient를 고르면**
  - "Linear ▾"(Linear/Radial/Angular/Diamond) + 뒤집기 · 90° 돌리기
  - 그라디언트 막대 + 정지점 손잡이(12 사각, 고른 것은 파란 테)
  - "Stops" + "+", 행(위치 % · 색 · 불투명도 · −)
  - 캔버스에 그라디언트 선과 양끝 사각 손잡이가 보여요.

`🕓` Iris에는 PaintPopover · ColorPicker가 있어요. 팝오버 위치(패널 왼쪽에 붙임), Libraries 탭, 정지점 목록은 나중에 맞출 수 있어요.

---

## 10. 캔버스

### 10.1 호버와 선택

| 상황 | 피그마 표시 | Iris |
|---|---|---|
| 프레임 이름 | 11 · .5, 프레임 위 | 있어요 |
| 이름 호버 / 고름 | 이름이 #0D99FF로 바뀌고 프레임에 호버 테두리 | ✅ 있어요 |
| 호버 테두리 | **2px** #0D99FF, 모양(둥근 모서리, 원)을 따라감, 애니메이션 없음 | ✅ 1px → **2px** |
| 호버한 컨테이너의 자식 | **1px 점선** #0D99FF (한 단계 더 들어가면 고를 것들) | ✅ **새로 만들었어요** |
| 선택 상자 | 1px #0D99FF | 있어요 |
| 모서리 손잡이 | 약 7×7 흰 사각, 1px 파란 테, r1. 변 중간 손잡이 없음(변 전체가 잡는 영역) | ✅ 6 → **7**, r1 |
| 크기 표시 | 상자 아래 8px, #0D99FF, 흰 11/16/500, r2, 0 4. "928 Hug × 1540 Hug"처럼 크기 방식(Hug/Fill)을 같이 표시 | ✅ 8px · r2 (Hug는 이미 있었어요) |
| 회전했을 때 크기 표시 | **도형과 같이 돌아요**(아래 변을 따라 기울어짐). 선은 선을 따라 "710.84 × 0" | `—` Iris는 똑바로 아래 가운데(가독성) |
| 컴포넌트 · 인스턴스 | 상자, 크기 표시, 이름을 보라 #9747FF로 | 🕓 |
| 고른 것의 부모(오토 레이아웃) | 1px 점선 | 있어요 |
| 여러 개 고름(Enter로 자식 전체) | 전체 상자 + 손잡이 + 각자 1px 테두리, 패널은 "Mixed" | 있어요 |
| 고른 사각형에 호버 | 모서리 안쪽(약 10px)에 **반지름 손잡이** 4개(흰 원 8, 파란 테). 원은 오른쪽 가운데에 **호(arc) 손잡이** 1개 | 🕓 |
| 크기 조절 중 | 가운데에 ⊕ 표시, 크기 표시가 실시간으로 바뀜 | 🕓(⊕) |
| 회전 | 모서리 바로 바깥, 전용 회전 커서, 패널 각도가 실시간으로 바뀜 | 있어요 |
| 오른쪽 위 ✦ | AI 버튼 | `—` |

### 10.2 깊이 고르기

| 조작 | 동작 | Iris |
|---|---|---|
| 클릭 | 맨 위 프레임의 **바로 아래 자식**을 골라요 | 🕓 Iris는 지금 호버를 가장 깊은 레이어 기준으로 잡아요 |
| 더블클릭 | 한 단계 안으로 들어가요(텍스트는 편집) | 🕓 Iris는 텍스트·벡터 편집만 |
| ⌘클릭 | 가장 깊은 레이어를 바로 골라요. 레이어 목록이 펼쳐지고 스크롤돼요 | 🕓 |
| Enter | 자식 전체를 골라요 | 있어요(Enter / ⇧Enter) |
| ⇧Enter | 부모를 골라요 | 있어요 |
| Esc | 선택을 풀거나 부모로 가요. 여러 번 누르면 단계별로 올라가요 | 있어요 |
| 빈 곳 드래그 | 범위 선택(1px 파란 테 + 옅은 채움) | 있어요 |
| ⇧클릭 | 더하기 | 있어요 |

### 10.3 오토 레이아웃 표시 (고른 오토 레이아웃 프레임에 호버)

- **안쪽 여백(padding):** 각 변 가운데에 짧은 파란 손잡이가 있어요. 여백 위에 올리면 **파란 빗금**이 보여요.
  - `✅` Iris에 **새로 만들었어요**(4변 여백 띠, 올리면 빗금).
- **간격(gap):** 간격마다 짧은 분홍 손잡이가 있어요. 간격 위에 올리면 **분홍 빗금**이 보여요.
  - Iris에 이미 있어요(분홍 #F2489C).

### 10.4 도구로 그리기

| 도구 | 결과 |
|---|---|
| R 사각형 | "Rectangle N"(번호 자동), 칠 **D9D9D9**. 하나 그리면 **Move 도구로 돌아가요**. 바로 선택돼요 |
| O 원 | D9D9D9. Corner radius는 비활성이에요 |
| L 선 | 끝 손잡이 2개. 크기 표시가 선을 따라 기울어요. 패널: 각도, W만(H 비활성), Stroke 000000 Center 1, Start/End point |
| F 프레임 | 도구를 고르는 순간 오른쪽 패널이 **프레임 프리셋 목록**으로 바뀌어요(Phone · Tablet · Desktop · Presentation · Watch · Paper · Social media · Figma Community · Archive, 묶음 접기). 그리면 "Frame N", 흰색 FFFFFF, **Clip content가 기본으로 켜져요**, Flow는 Freeform |
| T 텍스트 | 클릭하면 "Text" 레이어가 편집 상태로 생겨요(마지막에 쓴 스타일을 이어 써요). 아무것도 안 쓰고 Esc를 누르면 레이어가 **자동으로 지워져요** |
| P 펜 | 점은 흰 원 7(파란 테), 지금 점은 파랑. 따라오는 미리보기 선은 파랑, 찍은 선은 회색. 보조 막대가 떠요. 패널: Vector(Mirroring 3칸, Corner radius). Esc로 경로를 끝내고, 한 번 더 누르거나 ✕를 누르면 편집이 끝나요 |
| H 손 | 도구 버튼이 켜져요 |
| C 코멘트 | 오른쪽 패널이 **Comments**로 바뀌어요(검색, 필터, ⋯, 빈 상태 안내). 클릭하면 파란 물방울 핀과 "Add a comment" 말풍선(흰 바탕, 파란 포커스 테, 둥근 보내기 버튼 비활성)이 떠요 |

### 10.5 기타

- 커서는 크기 조절·회전용 **비트맵 커서**예요.
- 이동(끌기)과 스마트 가이드는 이번에 화면을 따라 잡지 못했어요. 빠르게 합성한 드래그는 피그마가 이동으로 받지 않았어요. Iris에는 이미 이동, 스냅(6px), 측정선(#F24822)이 있어요.

---

## 11. 피드백

### 11.1 툴팁 `✅`

| 항목 | 피그마 | Iris(적용) |
|---|---|---|
| 모양 | #1E1E1E, 24h, r5, padding 4 8, 흰 11 + 단축키 흰 .7(사이 8) | 같은 색 · 높이 · 간격. 글자 12(Pretendard), squircle r4 |
| 화살표 | 12×6, 버튼을 가리킴, 버튼과 6px | 같아요 |
| 위치 | 툴바는 위, 패널 버튼은 아래. 공간이 없으면 반대쪽 | 같아요(`data-tip-at`, 자동으로 반대쪽) |
| 지연 | 처음엔 약 **1초** 머물러야 떠요. 떠 있는 상태에서 옆 버튼으로 옮기면 **바로** 떠요 | 1000ms / 이어서 0.5초 안은 즉시 |
| 애니메이션 | 없어요 | 없어요 |
| 내용 | "Frame F", "Select matching layers ⌥⌘A", 2줄(스타일 이름 + 값) | `data-tip` + `data-tip-key`. 편집기 안의 모든 `title`을 자동으로 바꿔요("Flip horizontal ⇧H" → 이름 + 단축키) |

### 11.2 토스트 `✅`

| 항목 | 피그마 | Iris(적용) |
|---|---|---|
| 모양 | #2C2C2C, **높이 40**, r13, 안쪽 0 8(글자 여백 약 12), 그림자 `0 1 3 rgba(0,0,0,.4)` + 안쪽 .5px 흰 .3 | neutral-800, 높이 40, 안쪽 0 16, r12, 그림자 `0 1 3 .4` |
| 위치 | 가운데, 툴바 바로 위(바닥에서 64) | 같아요 |
| 시간 | **약 3초** | 2.6초 → **3초** |
| 애니메이션 | 없음(바로 나타나고 사라져요) | .16s 페이드 → **없음** |
| 예 | "Layers collapsed", "No matching layers to select on page", "Width and height set to Fixed for Contents" | — |

### 11.3 모달 (Share)

- **덮개:** rgba(0,0,0,.5). 카드는 화면 위에서 약 10%에 와요.
- **카드:** 약 480w
  - 머리 "Share this file" + "Copy link"(파란 링크) + ✕
  - 이메일 입력(#F5F5F5) + "Invite"(비활성 #D9D9D9)
  - "Who has access" 행 36h(아이콘 + 이름 + 권한 ›)
- **아래 카드:** Publish to Community › · Copy Dev Mode link · Copy prototype link ⚙ · Get embed code ›

### 11.4 오른쪽 위 기타

- **멀티플레이어 ▾:** 검은 팝오버. 나(You) 행 + 파란 "Spotlight me" 버튼 + 오디오 아이콘, "Previously viewed" 목록(아바타 24 + 이름 + 시간 .5)
- **Present ▾:** ✓Present ⌥⌘↩ · Preview ⇧Space

---

## 12. 모드

- **Draw:**
  - 툴바가 Move + 펜 3종(만년필, 마커, 연필) 그림 + Frame · Line · Text · Code · Comment · Actions로 바뀌어요.
  - 레이어 목록에 썸네일이 보여요. 오른쪽 패널 머리는 "Draw"예요.
  - 막대 폭이 애니메이션돼요.
- **Dev Mode (⇧D):**
  - 강조색이 **초록**이 돼요(Share, 켜진 도구).
  - 왼쪽에 "Ready for development" 목록이 생기고, 레일에서 Assets · Tools가 빠져요.
  - 오른쪽 탭이 "Inspect | Plugins"로 바뀌어요. 페이지 머리, Code settings(Language CSS ▾ · Unit px ▾), MCP, Code Connect
  - 툴바: 선택 · 주석 · 측정 · 코멘트 + 모드 전환

`—` Iris는 오른쪽 탭 **Dev**에서 개발 정보를 보여 줘요.

---

## 13. 모션 정리

| 대상 | 피그마 | Iris |
|---|---|---|
| 버튼 · 행 · 메뉴 항목 호버, 눌림, 선택 색 | 0s | ✅ 편집기 안 0s(전에는 .12s) |
| 메뉴 · 팝오버 · 펼침 메뉴 열기/닫기 | 없음 | 원래 없음 |
| 툴팁 | 처음 1초 지연, 이어서 즉시, 페이드 없음 | ✅ 같음 |
| 토스트 | 즉시 / 3초 / 즉시 | ✅ 같음 |
| 툴바 모드 전환 | 줄 이동 transform .3s ease, 막대 폭 .5s | 🕓 |
| 레일 | transform .2s cubic-bezier(.2,0,0,1) | — |
| Minimize UI 패널 위치 | top .08s ease-out | Iris 패널 접기 .24s cubic-bezier(.2,0,0,1) 유지 |
| 화살표 회전(레이어 ▸) | — | Iris .12s 유지 |
| 캔버스 호버, 선택 테두리 | 즉시 | 즉시 |

---

## 14. 이번에 Iris에 넣은 것 (요약)

| 영역 | 파일 | 내용 |
|---|---|---|
| 툴팁 | `app/plugins/tooltip.client.ts`, `main.css` | 피그마식 검은 툴팁 + 단축키 + 1초/즉시 지연. 편집기 안 `title`을 자동으로 바꿈 |
| 모션 | `main.css` | 편집기 호버·선택 색 즉시(0s) |
| 툴바 | `EditorToolbar.vue` | 48 · 8 · 8 · ▾16, 칸막이를 끝까지, 펼침 메뉴 ✓ 칸, Image/video…, 툴팁 |
| 레이어 목록 | `LayerTree.vue` | 호버 회색 / 고름 옅은 파랑(굵기 유지) / 자식 더 옅은 파랑 |
| 인스펙터 | `Inspector*.vue` | 섹션 여백 12·16·16, 줄 사이 8, 2·3칸 사이 8 |
| 캔버스 | `EditorCanvas.vue` | 호버 2px, 자식 점선, 오토 레이아웃 여백 파란 빗금, 손잡이 7px r1, 크기 표시 8px · r2 |
| 토스트 | `pages/p/[projectId]/index.vue` | 40h, 3초, 애니메이션 없음 |
| 드롭다운 | `EditorSelect.vue`, `main.css` | 브라우저 기본 `<select>`를 없애고 공용 드롭다운으로 바꿨어요. 종류는 칸 · 칸 안 글자(W의 Hug ▾) · 아이콘 버튼이에요. 메뉴 공통: 안쪽 4, 행 28, ✓ 칸, 묶음 구분선, 고른 행은 ✓ + 500, ↑↓ Enter Esc |
| 아이콘 규칙 | `EditorIcon.vue`, `main.css` | 크기 20(툴바) · 16(패널, 레이어 행, 메뉴) · 12(▾ ▸ ✓), 선은 늘 1.25px, 색은 역할별. 편집기 크롬의 디자인 시스템 아이콘을 모두 바꿨어요(규칙은 [08](08_EDITOR_ICONS.md)) |
| 페이지 패널 | `InspectorPage.vue`, `index.vue` | 피그마 Page 패널처럼 정리했어요. Page(배경) · Styles만 남기고, Canvas 줌 줄과 Shortcuts는 지웠어요. Pixel grid는 줌 메뉴의 ✓ 항목으로 옮겼어요. 아무것도 고르지 않았을 때의 단축키 안내도 지웠어요 |
| 인스펙터 격자 | `main.css`(`.ig` · `.ig-l`) | 모든 줄을 [칸 \| 칸 \| 아이콘 24], 사이 8로 맞췄어요. 칸 위에 보조 라벨이 있어요 |
| 레이어 인스펙터 구성 | `InspectorLayer.vue`, `ArrangeControls.vue` | 피그마 구성으로 다시 짰어요 |

레이어 인스펙터는 이렇게 바꿨어요.
- **Name 칸을 뺐어요.** 이름은 레이어 목록에서 바꿔요.
- **Position:** 머리에 Ignore auto layout 토글을 뒀어요. Alignment는 [3 \| 3 \| ☰]이고 ☰에 균등 분배를 넣었어요. 그 아래 Position X·Y, Rotation(칸 + 돌리기·뒤집기)이에요.
- **Layout:** Dimensions/Resizing 라벨 아래 W·H 칸이 있고, 칸 안에 Hug·Fill ▾, 오른쪽 열에 비율 잠금이 있어요.
- **Constraints:** 공용 드롭다운으로 바꿨어요.
- **Appearance:** 머리에 숨기기 · 블렌드(묶음 구분선이 있는 메뉴)를 뒀어요. Opacity · Corner radius + 개별 모서리 토글, 개별 모서리는 2×2예요.
- **Stroke · 화살표 끝 · 글자 굵기:** 공용 드롭다운으로 바꿨어요.

다른 인스펙터도 같은 규칙으로 바꿨어요.

| 파일 | 바꾼 내용 |
|---|---|
| `InspectorDesign.vue`(화면 프레임) | Status · 크기 프리셋을 공용 드롭다운으로 바꿨어요(맞는 게 없으면 Custom, 기기 묶음 구분선). 모든 줄을 격자로 맞추고, 빈 Stroke 제목은 옅게 |
| `InspectorPaints.vue` | 행을 [칠 칸 \| 👁 24 \| − 24]로 바꿨어요. 변수 버튼은 칸에 올리면 보이고, 색 스타일 만들기는 머리로 옮겼어요 |
| `InspectorEffects.vue` | 효과 종류를 공용 드롭다운으로(피그마 순서) 바꿨어요. 새 효과는 설정이 바로 열려요 |
| `InspectorGrids.vue` | 종류(Grid/Columns/Rows)를 드롭다운으로, 값은 격자 줄로 |
| `InspectorAutoLayout.vue` | 머리 토글 · Flow + 줄바꿈 · Alignment \| Gap(칸 안 Fixed/Auto ▾) · Padding + 개별 토글 |
| `InspectorInstance.vue` · `ColorPicker.vue` · `PaintPopover.vue` | 기본 select와 형식 메뉴를 공용 드롭다운으로 바꿨어요 |
| `InspectorPage.vue` · `InspectorDev.vue` | 격자 줄로 정리 |

## 15. 나중에 넣을 것 (우선순위 제안)

1. **캔버스 깊이 고르기:** 클릭은 맨 위 프레임의 자식, 더블클릭은 한 단계 안, ⌘클릭은 가장 깊은 것. 레이어 목록 자동 펼침·스크롤
2. **사각형 반지름 손잡이 · 원 호 손잡이**, 크기 조절 중 ⊕
3. **컴포넌트 · 인스턴스 보라 선택색**
4. **Gap 칸 호버하면 캔버스에 간격 표시**, 정렬판 호버 미리보기, W/H ▾ 메뉴(Fixed · Hug · Fill · min/max)
5. **이어진 선택 행 덩어리**, Collapse layers 버튼과 토스트
6. **메인 메뉴 Edit · View · Object · Arrange 하위 메뉴**(호버로 열림), 줌 메뉴 배율 입력과 보기 토글
7. **Effects 종류 메뉴(바로 열림) · 그림자 설정 팝오버 기본값**, Stroke settings, Export
8. **팝오버를 오른쪽 패널 왼쪽에 붙이는 공통 규격**, 열려 있는 동안 패널 흐리게
9. **툴바:** Actions(⌘K) 패널, 펜 보조 막대, 모드 전환 애니메이션
10. **Assets:** 2열 타일, 개수 배지, 경로

---

## 16. 종합 검토(2026-11-24)로 정한 Iris 규칙

편집기 전체를 네 영역으로 나눠 검토하고 고쳤어요. 영역은 왼쪽 패널 · 상단, 인스펙터, 칠 · 팝오버, 툴바 · 캔버스 · 메뉴예요. 그러면서 아래 규칙을 정했어요. 피그마와 다르게 정한 것은 **(Iris)**로 표시했어요.

| 항목 | 규칙 |
|---|---|
| 메뉴 · 팝오버 · 확인 창 겉면 | 사이드바(`.float`)와 **같은 테두리선 · 그림자**(`--iris-float-line`, `--iris-float-line-w`, `--iris-float-shadow`). 따로 만든 그림자는 쓰지 않아요 |
| 팝오버 위치 | 오른쪽 패널의 왼쪽에 붙여요(효과 · 그리드 설정, 스타일 만들기, 칠 팝오버) |
| 변수 목록 · Libraries | **로컬 스타일은 넣지 않아요(Iris).** 디자인 시스템 변수만 보여요. 그래서 "Create style" 입구도 지웠어요. 이미 연결된 값은 그대로 읽혀요 |
| 색 목록 | 행에 값(RGB · HEX)을 보이지 않아요(Iris). 이름만 보이고 전체 이름은 툴팁이에요. 숫자 변수는 값을 보여요 |
| 변수 목록 행 | 종류 아이콘 16(간격 · 반지름 · 선 두께 · 불투명도 · 숫자) + 이름 + 값 |
| Libraries 보기 | 격자 ↔ 목록 전환. 목록은 견본 16 + 이름, 행 28이에요. 고른 방식은 기기에 기억해요 |
| 격자 줄 | 오른쪽 아이콘 열(24)은 아이콘이 없는 줄도 **비워 둬요(피그마와 같아요)**. 모든 줄의 칸 끝이 한 세로선에 맞아요. 한때 끝까지 채웠다가 피그마대로 되돌렸어요 |
| 체크 상자 | 16 상자, 라벨 앞 8, 줄 24. 켜지면 **브랜드 파랑 + 흰 체크**예요(라이트 · 다크 같음) |
| 글자 대비 | 편집기의 보조 글자 · 칸 위 라벨 · 꺼진 탭은 neutral-600(4.5:1 이상)이에요. neutral-500은 아이콘 · 자리표시에만 써요 |
| 다크 모드 행 | 호버 · 선택 행은 흰 반투명 겹침이에요(neutral-100은 패널보다 어두워서 쓰지 않아요). 레이어 선택 파랑은 그대로예요 |
| W/H 크기 방식 | 오토 레이아웃 안 요소는 Fixed / Fill이에요. Hug는 자기가 오토 레이아웃이거나 텍스트 · 인스턴스일 때예요. 선택지가 둘 이상이면 ▾가 늘 보여요. "Apply variable…"은 ▾ 메뉴 안에 있어요. 부모가 Hug인데 자식을 Fill로 바꾸면 부모가 Fixed가 돼요(피그마 동작) |
| 단위 | °, %, px는 숫자 바로 뒤에 붙여요(칸 오른쪽 끝에 두지 않아요) |
| 입력칸 | Esc는 되돌리기, 잘못된 값은 이전 값으로 되돌려요. ↑↓로 1씩, ⇧를 누르면 10씩 바뀌어요 |
| 이름 바꾸기 | 페이지 · 레이어 모두 열자마자 전체 선택이에요. 흰 칸 + 1px 파랑, Esc는 취소, F2로 열어요 |
| 레이어 행 | 높이 28 고정, 🔒 · 👁 버튼 24(아이콘 16) |
| 섹션 제목 | Pages · Layers · Docs가 같은 높이(32) · 같은 x에서 시작해요 |
| 드롭다운 · 메뉴 키보드 | ↑↓ · Home/End · Enter · Esc(누른 버튼으로 포커스가 돌아가요). 캔버스 단축키로 새지 않아요 |
| 프레임 복제 | 원래 이름 그대로예요("사본"을 붙이지 않아요) |
| 편집기 라벨 | 상태 · 문서 분류 · 토스트까지 영어예요 |

**아직 남은 것**
- 이어진 여러 선택 행을 한 덩어리로 보이게 하기
- 오토 레이아웃이 없는 프레임의 Hug(엔진 `canvas/layout.ts` 확장 필요)
- 피그마와 다른 단축키 표기를 피그마로 맞출지 결정(예: Bring to front ⌥⌘] → ])
- 인라인으로 그린 일부 아이콘(정렬 순서, 타이포 칸 아이콘, 간격/패딩)을 `EditorIcon` 사전으로 옮기기

## 17. Typography (피그마 방식으로 바꿈, 2026-11-24)

**글자 스타일 = 크기 묶음 × 굵기**
- 피그마 라이브러리와 같은 꼴입니다. 이름은 `Body 1/16 SB`, 묶음은 `Body 1`, 행은 `Ag 16 SB · 16/24`입니다.
- 디자인 시스템의 `--typography-<스타일>-*`(크기 · 줄 높이 · 자간)에 `--font-weight-*`(B · SB · M · R)를 곱해서 만듭니다.
- id는 `ts:body-1/600`입니다.
- 굵기 없는 옛 id(`ts:body-1`)는 이미 연결된 문서를 위해 읽기만 하고, 목록에서는 뺍니다.
- 스타일 연결 비교값에 굵기도 넣었습니다. 굵기를 바꾸면 스타일 연결이 풀립니다(피그마와 같아요).

**패널**
- **스타일이 걸렸을 때:** 흰 칸 하나 `[Ag Body 1/16 SB · 16/24]`만 보입니다.
  - Ag는 스타일 굵기로 그립니다.
  - 열면 칸이 파란 바탕 · 파란 선 · 파란 글자가 됩니다.
  - 칸에 올리면 오른쪽 24 칸에 떼기(⛓ 분리)가 보입니다.
- **스타일이 없을 때:** 머리에 Text styles(⁘) 버튼이 있고, 칸은 아래 순서입니다.
  - `[글꼴(읽기 전용 Pretendard)]`
  - `[굵기 ▾ | 크기 ▾]`
  - `줄 높이 · 자간`
- **떼기:** 값은 그대로 두고 스타일 안의 변수를 칸마다 이어 줍니다.
  - 크기 `body-1/size`, 줄 높이, 자간, 굵기(`SemiBold`)가 각각 흰 칩으로 보입니다.
  - 실행취소 한 번으로 되돌아갑니다.
- **굵기 ▾ · 크기 ▾:** 메뉴 끝의 `Apply variable…`로 변수를 고릅니다(W/H와 같은 방식). 크기 ▾에는 자주 쓰는 크기(10–64)가 있습니다.
- **정렬 줄:** `[왼 · 가운데 · 오른쪽] [위 · 가운데 · 아래] | ⚙` 순서입니다. 세로 정렬(`valign`)은 글자 상자가 내용보다 높을 때 적용됩니다.

**Text styles 창**
- 오른쪽 패널 왼쪽에 폭 240으로 뜹니다.
- 제목 줄 40에 제목과 ×가 있고, 그 아래 검색이 있습니다.
- 묶음 이름은 12px 진한 글자, 행 높이는 32입니다.
- 고른 행은 brand-lightest 바탕입니다. 목록에 떼기 항목은 없습니다(떼기는 칸 옆 버튼).

**⚙ 상세 창(Basics · Details)**
- 겉면은 칠 창과 같습니다.
- **Basics:**
  - 미리 보기(고른 글자 첫 줄, 32px까지)
  - Alignment(양쪽 맞춤 포함)
  - Decoration(— · 밑줄 · 취소선)
  - Case(— · AG · ag · Ag · 작은 대문자). 작은 대문자는 Pretendard에 없어서 흐리게 둡니다.
  - List style
  - Paragraph spacing
  - Truncate text(한 줄 말줄임)
  - Wrap style(Auto · Balance · Pretty)
- **Details:** Numbers(Proportional · Tabular)
- 패널에서 문단 간격 · 꾸밈 · 대소문자 · 목록은 이 창으로 옮겼습니다.
- Auto width는 Layout의 W Hug와 같아서 패널에서 뺐습니다.

**함께 맞춘 것**
- 변수 칩 이름이 넘치면 앞을 줄입니다(`…ine-height`). 뒤쪽 마디가 값을 구분해 주기 때문이에요(피그마와 같아요).
- 비어 있는 섹션 제목(Stroke · Effects · Layout grid · Export 등)도 굵기 600으로, 활성 섹션과 같습니다. 색만 neutral-500으로 흐리게 둡니다.

**아직 남은 것**
- Vertical trim(글자 상자 위아래 다듬기)
- Decoration 세부(›)
- 작은 대문자
- OpenType 세부(분수 · 위첨자 등)
- 글꼴 변수 연결(`--font-family-base`)
- 크기 ▾의 스타일 크기 묶음 보기

## 18. 팝오버 공통 양식 (Text styles 창 기준, 2026-11-24)

모든 편집기 팝오버(변수 목록 · Text styles · 칠 · 효과 · 격자 · 스타일 만들기 · 글자 상세)가 같은 규격을 따릅니다.

| 부분 | 규격 |
| --- | --- |
| 겉면 | 폭 240 · 모서리 12 · 사이드바와 같은 선 · 그림자(`--iris-float-*`). 오른쪽 패널(설정 창 안이면 그 창) 바로 왼쪽, 연 칸 위쪽에 맞춰요 |
| 머리 | 높이 40 · 아래 1px 선. 제목은 12/600이고 왼쪽 12에 둬요. 탭 머리는 탭 글자가 12에 오도록 안쪽 4로 둬요. 닫기 버튼은 24, 오른쪽 안쪽 8 |
| 목록 본문 | 안쪽 4 · 검색 28 · 묶음 이름은 12/18 neutral-800(왼쪽 12) · 행 32(안쪽 8, 모서리 6) · 호버 neutral-100 |
| 고른 행 | 레이어 패널의 고른 행과 같은 `--iris-sel`(브랜드 11%)을 써요. 올려도 그대로고 글자색도 바꾸지 않아요. ✓는 쓰지 않아요 |
| 입력 본문 | 안쪽 12 · 줄 사이 8 |

**변수 목록:** 제목은 `<종류> variables`(예: Corner radius variables)이고, 검색창 안내 문구는 `Search`예요. 연결돼 있으면 맨 위에 Detach variable 행이 있어요.

## 19. 붙여넣기 자리 (2026-11-24)

복사할 때 어느 화면에서 복사했는지와, 맨 위 레이어마다 화면 안 절대 위치를 함께 기억합니다(`canvas/store.ts`의 `copy` · `paste`).

| 붙이는 곳 | 놓이는 자리 |
| --- | --- |
| 같은 화면 | 원래 부모 안 같은 자리(그대로) |
| 다른 화면 | 그 화면 안 같은 자리(화면 왼쪽 위 기준) |
| 캔버스(화면 → 캔버스, 캔버스 → 캔버스) | 캔버스 위 같은 절대 위치. 화면 안 사각형을 캔버스에 붙이면 원래 자리 그대로, 프레임 밖 맨 위 층으로 들어가요 |
| 캔버스 → 화면 | 같은 절대 위치. 그 화면과 겹치지 않으면 화면 가운데에 놓아요 |

화면 · 캔버스의 캔버스 좌표는 `EditorCanvas`가 스토어에 등록해 둬요(`setPasteGeo`). 그래서 레이어 패널의 Paste도 같은 규칙을 따라요.

## 20. 패널 접기 · 보기 설정 (2026-11-24)

**접기**
- 왼쪽 패널의 접기 버튼 하나로 좌우 패널이 함께 접히고 함께 펼쳐집니다. 버튼 라벨은 `Collapse sidebars` / `Expand sidebars`입니다.
- 접힌 채로 어느 쪽이든 탭을 누르면 둘 다 펼쳐집니다.
- 이 브라우저에 기억합니다(`iris-panels`).
- 오른쪽 패널의 접기 버튼은 없앴습니다.

**보기 설정 ⚙ (오른쪽 패널 위, 줌 옆 24 버튼)**
- 피그마 줌 · 보기 메뉴 중 Iris가 지금 그리는 것만 넣었습니다.
  - **Pixel grid**: 페이지 설정이고, 줌 메뉴에서 이쪽으로 옮겼습니다. 메뉴에 배율 안내(800%+)는 붙이지 않습니다.
    - 400%부터 서서히 나타나 800%에서 다 보입니다(opacity가 0에서 1로).
    - 캔버스 · 화면 · 레이어 위에 `<canvas>`로 직접 그립니다. 선마다 **기기 픽셀 1칸**에 맞춰서, 레티나면 0.5px이에요. 피그마를 크롬에서 직접 확대해 보고 같은 굵기로 맞췄고, 배율이 딱 떨어지지 않아도 선 진하기가 고릅니다.
    - 선은 두 겹입니다.
      - 흰 선 5%, difference: 밝은 바탕은 살짝 어둡게, 어두운 바탕은 살짝 밝게
      - 중간 회색 선 6%: 파랑처럼 중간 밝기 색 위에서도 옅게 보이게
    - 캔버스 #F5F5F5 위에서는 약 #E3E3E3(피그마와 같아요)입니다.
- **줌 범위:** 피그마와 같은 2% ~ 25600%입니다(전에는 5% ~ 800%).
  - **Layout grids**(⌃G)
  - **Rulers**(⇧R)
- 줌 메뉴는 줌 항목만 남깁니다(Zoom in / out / to fit / to selection / 25 · 50 · 100 · 200%).
- 피그마 메뉴 중 아직 없는 것(나중에):
  - 줌 비율 직접 입력칸
  - Pixel preview ›
  - Snap to pixel grid(지금은 늘 정수로 맞춰요)
  - Outlines ›(⌘Y)
  - Multiplayer cursors
  - Additional labels
  - Comments(⇧C)
  - Annotations(⇧Y)

## 21. 검은 메뉴 (2026-11-24)

편집기에서 뜨는 메뉴는 모두 피그마 UI3처럼 검은 메뉴입니다. 오른쪽 클릭 메뉴(ContextMenu)와 같은 규격이에요.
- **대상:** 드롭다운(EditorSelect), 줌 · 보기 설정 메뉴, 메인 메뉴, 툴바 펼침 메뉴, 정렬 메뉴
- **규격:**
  - 바탕 #1E1E1E · 안쪽 8 · 행 24 · 행 모서리 4
  - 글자는 흰색, 단축키 · 보조 글자는 흰 70%
  - 올리면(키보드 포함) 파랑 #0D99FF, 지우기 같은 위험 항목은 빨강 #E5484D
  - 비활성은 흰 40%, 구분선은 흰 12%(끝에서 끝까지), ✓는 흰색
- **테마:** 밝은 · 어두운 테마에서 똑같아요. 메인 메뉴 안 테마 고르기는 흰 8% 바탕에 고른 칸 흰 16%예요.
- **예외:** 변수 · 텍스트 스타일 목록(`.tp`)과 칠 · 효과 등 설정 창은 흰 팝오버 양식(§18) 그대로예요.
- 규칙은 `app/assets/css/main.css`의 `.editor .menu:not(.tp)`에 있어요.
