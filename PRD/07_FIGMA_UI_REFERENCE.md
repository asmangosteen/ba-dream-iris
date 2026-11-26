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

## 22. 홈 화면 · 위 탭 막대 (피그마 데스크탑처럼, 2026-11-24)

**위 탭 막대(AppTabs)** — 홈 · 새 탭 · 프로젝트 화면 맨 위(로그인 · 환영 · 확인 화면에는 없음)
- 막대 44(바탕 --iris-canvas) · 탭 32(위아래 6 — 아래 화면 · 캔버스와 띄움, 안쪽 왼쪽 12 · 오른쪽 6) · 모서리 8 · 탭 사이 4 · 글자 13/20
- 맨 앞 홈 탭(집 아이콘): 마지막으로 보던 홈 화면(Projects · Requirements · Design system)으로
- 프로젝트를 열면(/p/<id>…) 그 프로젝트 탭이 생기고, 탭마다 마지막 주소(문서 화면 등)를 기억. 열린 탭은 이 기기(localStorage `iris-tabs`)에 남음
- 고른 탭: 떠 있는 흰 면(.float 선) · 글자 500 / 나머지: 글자만, 호버 회색. 붙은 두 탭 사이 세로 선(16, gray-900 10%)
- 닫기 ×: 고른 탭 · 올린 탭에만, 가운데 클릭으로도. 보던 탭을 닫으면 오른쪽(없으면 왼쪽, 없으면 홈) 탭으로
- 탭이 많으면: 200 → 최소 96 까지 함께 줄고(이름 …), 그래도 넘치면 가로로 밀림(세로 휠도 가로로), 밀 수 있는 쪽 끝은 16px 흐림, 고른 탭은 늘 보이게
- 탭 뒤 빈 곳: 막대에 올리면 + (New file) 가 나타남. 누르거나 빈 곳을 두 번 누르면 새 탭(피그마 데스크탑의 New file 탭처럼 — 새 프로젝트 창은 더 이상 띄우지 않음)
- **새 탭(/new)**: 탭 이름 New file(앞에 빈 네모 아이콘 16) · 다른 탭처럼 × 로 닫힘. 하나만 — 이미 열려 있으면 + 는 그 탭으로
  - 화면: 흰 면, 내용 폭 최대 960 가운데(위 80). 맨 위 종류 알약 줄(가운데) — App · Web · Detail page, 높이 48 · 둥근 선 1px · 아이콘 20 + 이름 14/500 + 크기(390 × 844 등, neutral-500)
  - 검색 칸 44(neutral-100, 아이콘 20 · 글자 14) — 이름으로 거름, Enter 는 맨 위 결과 열기, Esc 는 지우기
  - Recents(최근 고친 순): 행 72 — 썸네일 96 × 64(홈 카드와 같은 화면 표지) · 이름 14/500 · 지난 시각 12 neutral-500
  - 알약을 누르면 묻지 않고 바로 이름 'Untitled' 프로젝트(그 종류 크기의 Frame 1)를 만들어 이 탭에서 엶 — 이름은 편집기에서 두 번 눌러 바꿈
  - Recents 행을 누르면 그 프로젝트를 이 탭에서 엶(⌘ · Ctrl 클릭은 브라우저에 맡김)
  - 열거나 만들면 New file 탭이 같은 자리에서 그 프로젝트 탭으로 바뀜(그 프로젝트 탭이 이미 있으면 New file 탭만 닫힘). 주소는 replace 라 뒤로 가기로 새 탭에 돌아오지 않음
- 화면 높이: 각 화면은 `calc(100vh - var(--iris-tabs-h))`(app.vue 가 44 / 0 을 줌)

**홈 틀(AppShell)** — 떠 있는 카드로 나누지 않고 흰 면 하나: [사이드바 240 | 본문], 사이 세로 선 1px
- 사이드바: 계정(아바타 28 · 이름 ▾ → 검은 계정 메뉴) · 검색(칸 28 · ⌘K 창, 단축키 배지 없음) · 메뉴 행 28(Projects · Requirements · Design system, 고른 행 --iris-sel) · 아래 Iris 로고(높이 18) + Powered by CYCLOID
- 요구사항 · 디자인 시스템 화면도 같은 틀 — 안쪽 목록 · 본문 · 상세는 떠 있는 카드 대신 세로 선으로 나눔
- 프로젝트 목록: 제목 20/600 · 카드 열은 폭 따라(최소 240)

**⌘K 검색**: 굵직한 것만 — 프로젝트 · 컴포넌트(디자인 시스템, 고르면 최근 프로젝트 편집기의 Assets 에서 열림) · 문서. 화면 · 레이어 · 요구사항 한 줄은 각 화면 안에서 찾음. 모양: 폭 560 · 모서리 12 · 떠 있는 흰 면, 검색 줄 48(아이콘 20 · 글자 14 · 지우기) + 구분선, 결과 행 36(아이콘 칸 24 · 이름 13/500 · 보조 12 neutral-500), 고른 행 --iris-sel(↵ 표시 · 아래 안내 줄 없음). 검색어 없으면 최근 프로젝트 · 최근 문서 5개씩

**계정 메뉴**: 검은 메뉴(§21) — 아바타 32 + 이름 · 메일 / Theme / Language / Edit profile / Log out · Log out of all devices

**프로필 창 · 프로젝트 창(같은 양식)**: 폭 360(프로필) · 440(프로젝트 — 종류 카드 사이 8 · 안쪽 12) · 머리 48(제목 14/600 · 닫기 28) · 안쪽 16 · 버튼은 오른쪽 아래 작게(Cancel · Save/Create). 프로젝트 종류 카드 둘째 줄은 두 줄(Mobile / 390 × 844)

**프로필 사진**: 프로필 창에서 올리기 · 바꾸기 · 지우기. 가운데를 정사각형으로 잘라 256px webp 로 줄여 비공개 `avatars` 저장소(`<내 id>/<시각>.webp`)에 올리고 `members.avatar_url` 에 `storage://avatars/…` 로 저장(마이그레이션 `20261125000000_member_avatars.sql` 필요). 미리보기는 data: URL 로 화면에만. 아바타는 MemberAvatar(사진 없으면 이니셜)

**메뉴는 어디서나 검은 메뉴**: §21 규칙을 편집기 밖(계정 · 요구사항 · 문서 메뉴)까지 넓힘(`.menu:not(.tp)`)

**편집기 위 알약 → 사이드바 맨 위 줄**: 왼쪽 위 파일 알약(메인 메뉴 · 프로젝트 이름 · 저장 상태)과 오른쪽 위 알약(나 · Share — Docs 토글은 뺌, 문서는 왼쪽 Docs 탭)을 따로 띄우지 않고 각 사이드바 맨 위 줄(40)로 합침 — 아래 구분선 1px 로 탭 줄과 나눔. 패널은 위 8 부터, 접으면 맨 위 줄 + 탭 줄(40 + 42)만 남음. 메인 메뉴는 접힌 패널 밖으로도 보임(패널은 넘침 보이기, 본문 .pbody 만 자름)

**접힌 사이드바와 선택**: 접어 둔 상태에서 캔버스에서 프레임 · 레이어를 고르면 오른쪽 패널이 Design 탭으로 펼쳐지고, 고른 게 없어지면 다시 접혀요(피그마처럼). 문서를 열어 둔 채 접으면 오른쪽 문서 패널은 그대로 보여요 — 문서 패널 위 X 로 닫아야 접혀요

**캔버스 호버**: 어떤 레이어든(둥근 모서리 · 원 · 선 · 벡터 · 글자) 마우스를 올리면 네모 상자 2px — 모양을 따라가지 않음(EditorCanvas HOVER_BOX_ONLY). 고른 펜 · 선의 모양선은 그대로

**레이어 그룹 아이콘**: 그룹(채우기 · 자르기 · 오토 레이아웃 없는 프레임, ⌘G)은 레이어 목록에서 자잘한 점선 네모(9 × 9, 점선 1.5)로 — 피그마 그룹 아이콘처럼. ⌘G 는 고른 것(하나여도)을 감싸는 새 그룹을 만듦(피그마와 같음)
- 그룹에 ⇧A(오토 레이아웃): 그룹은 그대로 두고 그 안의 레이어에 넣음(안 레이어들을 오토 레이아웃 프레임으로 감싸기, 안에 프레임 하나면 그 프레임에)
- 오토 레이아웃을 풀면(⌥⇧A) 늘 프레임으로 남음(그룹으로 바뀌지 않음)
- 그룹 표시: 레이어에 `group: true/false` 를 저장(⌘G 로 만든 것 true, 오토 레이아웃을 푼 프레임 false). 표시가 없는 예전 레이어는 모양으로 짐작(채우기 · 자르기 · 오토 레이아웃 없는 프레임) — schema `isGroupNode`

**요구사항 화면**: 따로 있던 프로젝트 목록 칸을 없애고 제목(20/600) 옆 프로젝트 고르기(이름 ▾ → 검은 메뉴, 진행 중 · 완료 묶음, 고른 것 ✓). 거르기 줄은 상태 세그먼트 한 줄 + 오른쪽 Needs work · 검색 200. 표는 최소 560(좁으면 가로로 밀림), 머리 줄 옅은 선, 칸 ID 84 · 요구사항 나머지 · 문서 180 · 화면 132 · 우선순위 72 · 상태 116. 본문이 860 보다 좁으면(상세 패널을 열면) 문서 칸은 숨김 — 상세에 나옴. 상세 패널 340 · 머리 48 · 제목 14/600

**세그먼트 고른 칸(File · Assets · Docs, In progress · Done · All 등)**: 옅은 외곽선 1px(라이트 검정 6% · 다크 흰 8%). 다크는 바탕이 무엇이든 바탕보다 밝게(흰 6% 덧칠) — 홈 · 편집기가 같은 모양

**탭 막대 아래 선**: 0.5px(--iris-float-line), 끝에서 끝까지 — 홈 · 편집기 어디서든 탭 막대(AppTabs)가 그려요. 홈 아이콘 20(칸 32 그대로)

**나중에**
- 탭을 바꿔도 편집기 상태(확대 · 선택)를 그대로 두기(KeepAlive — 지금은 탭을 바꾸면 다시 읽음)
- 탭 끌어서 순서 바꾸기 · 탭 오른쪽 클릭 메뉴(Close others 등)
- 데스크탑 앱(Electron)에서 탭 막대를 제목 표시줄 자리로(맥 신호등 버튼 옆)

## 23. 화면 언어 (영어 기본 · 한국어 전환, 2026-11-24)
- 모든 화면(홈 · 편집기 · 요구사항 · 디자인 시스템 · 문서) UI 는 영어 기본. 계정 메뉴 · 편집기 메인 메뉴의 **Language**(English · 한국어)에서 바꾸면 어디서나 바로 바뀜
- 저장: 쿠키 `iris-lang`(서버가 처음 그릴 때부터 맞는 언어 — 화면 모드 `iris-theme` 와 같은 방식), `<html lang>` 도 맞춤
- 쓰는 법: 영어 원문을 `tr('Zoom to fit')` 로 감싸고, 한국어는 `app/i18n/ko/<영역>.ts`(common · home · workspace · docs · editor · inspector) 에 `'영어': '한국어'`. 자리 채우기 `tr('Copied {n} frames', { n })`. 문장 구조가 달라 안 되는 곳만 `isKo()`
- 번역하지 않는 것: 사용자 콘텐츠(프로젝트 · 페이지 · 화면 · 레이어 이름, 문서 본문), 토큰 · 스타일 이름, 단축키 기호, 미리보기 예시 데이터
- 지난 시각: 영어 'Just now · 5 min ago · 3 hours ago · Dec 18, 2025' / 한국어 '방금 · 5분 전 · 2025년 12월 18일'
- 모듈 맨 위 상수(라벨 표)는 영어로 두고 그릴 때 `tr()` — 언어를 바꾸면 바로 다시 그려지게

## 24. 디자인 시스템 → 편집기 Assets 로 합침 · 컴포넌트 전수검사 (2026-11-24)

**합침**
- 사이드바 메뉴에서 Design system 을 뺌(Projects · Requirements 만). 편집기 메인 메뉴 · 페이지 Styles 의 'View in design system' 링크도 뺌. `/design-system` 화면 파일은 남아 있지만 메뉴에서는 안 보임(토큰 목록 · 일괄 등록은 나중에 Assets 로 옮길 것) → 2026-11-25 화면 파일과 등록 창(DsRegisterModal)을 지움
- 편집기 Assets 상세: 실제 모습(미리보기) · Insert instance · 이 파일에서 쓰는 곳 · **다른 곳에서 쓰는 곳**(다른 페이지 · 프로젝트, 누르면 그 화면으로) · **코드**(`<Button />`, 눌러서 복사) · **별칭**(이 이름의 피그마 레이어를 이 컴포넌트로 셈)
- ⌘K 에서 컴포넌트를 고르면 가장 최근 프로젝트 편집기의 Assets 상세로(`/p/<id>?asset=<컴포넌트 id>`)

**전수검사 결과(목록 73개 — 넣기 · 그리기 · 속성 패널)와 고친 것**
- 그리지 못함 → 기본값으로 해결: SegmentedControl · Tab(목록 items 필수) · Avatar(alt 필수) · PopUpCard(buttonCount · content 필수)
- 폭 0 으로 접힘 → 넣을 때 고정 크기: Slider · ProgressBar · Skeleton 240, Dimmed 375 × 320, Gradient 375 × 120, ScrollBar 8 × 200
- 이상한 내용 → 기본값: NumericBadge 'undefined' → count 3, IconButton '?' → plus 아이콘
- 연결 안 됨: 'Map'(디자인 시스템에 없는 이름) 을 빼고 실제 지도 부품 6개(MapPin · MapPill · MapCluster · MapMyLocation · MapBottomBar · MapBottomGuide)로. 디자인 시스템에 있는데 목록에 없던 단독 컴포넌트 추가: AddMedia · FileRow · InputBar · ListSelect · ListSort · PostComment · PostReply · Media · Gradient · ScrollBar · Footer · PopUpCard · ToastCard(나머지 60여 개는 다른 컴포넌트 안에 들어가는 부품이라 목록에 넣지 않음)
- 기본값은 노드에 저장하지 않고 그릴 때 합침(`InstanceView` 의 `INSERT_PROPS` · `INSERT_SIZE` · `instanceProps`) — 캔버스 · 에셋 미리보기 · 끄는 모습이 모두 같은 값
- 에셋 미리보기: 손으로 만든 미리보기가 없는 컴포넌트도 이니셜(Se · Dr …) 대신 실제 컴포넌트를 칸에 맞게 줄여서

**속성 패널(Instance) 고친 것**
- showX 토글에 딸린 값 묶기가 단어 경계를 넘던 것(Show Sub Plan 아래 'Sidy Label') 고침
- 실제 내용인 Title · Name · Alt 가 접근성 속성으로 맨 아래 밀리던 것 고침. 화면에 안 보이는 aria-* · role · for · tabindex 는 패널에서 숨김
- 목록 속성(items)은 'Items' 글자 칸 하나로 — 쉼표로 나눠 적음(Tab 1, Tab 2, Tab 3)
- 선택지 표기: ios → iOS, os → OS

## 25. 변수(토큰) 화면 (2026-11-24)
- 좌측 패널 맨 아래 **Variables** 줄(위 구분선 · 안쪽 6 · 8 여백 안에 행 32, 모서리 6 — 패널 둥근 모서리 밖으로 칠이 나가지 않게). 누르면 캔버스 대신 변수 화면이 편집기 전체를 덮음(다른 페이지처럼). ‹ · Esc 로 캔버스로
- 변수 화면: 머리 48(‹ · 아이콘 · Variables · 개수, × 없음) / 왼쪽 240: 맨 위 검색 28 → 종류(모든 변수 · Color · Text style · Spacing · Corner radius · Stroke weight · Opacity · Shadow · Font size · Font weight · Line height · Letter spacing, 개수) / 오른쪽 표(행 36): 이름(색 견본 · Ag · 변수 아이콘) · 값 · CSS 변수(누르면 `var(--…)` 복사, 텍스트 스타일은 크기 변수). 묶음 제목은 위에 붙어 따라옴. ⌘F 로 검색칸
- 값은 디자인 시스템 CSS(:root)에서 읽은 그대로 — 보기 · 찾기 · 복사만(고치기는 디자인 시스템에서)
- 에셋 상세: 설명 · 'Drag onto the canvas…' 안내 문구 뺌. 쓰인 곳 행은 레이어 행처럼 한 줄 28(화면 이름 + 페이지 회색, 프로젝트까지는 툴팁). 에셋 목록 칸 아래 사용 횟수 줄 뺌
- 툴바는 바닥에서 16
- 툴바는 늘 맨 앞: 캔버스 · 좌우 패널보다 위(창이 좁아 패널과 겹쳐도 툴바가 보여요), 팝오버 · 메뉴 · 변수 화면 · 모달보다는 아래
- 입력 칸 모서리 8(`--iris-field-r`): 숫자 칸 · 드롭다운 · 검색 · 글자 칸 · 정렬 버튼 묶음 · 정렬/기준점 격자 · 제약 상자 · 편집기 테마/언어 토글 — 모두 squircle 60%. 회색 묶음 안 버튼(모서리 6) + 여백 2 = 8 로 안팎 곡선이 나란해요
- 탭 · 세그먼트 · 버튼 묶음(Design/Plan/Dev · File/Assets/Docs · Flow · 정렬 · 색 팝오버 Custom/Libraries · 칠 종류 · 글자 팝오버 탭 …)은 고른 칸이 스르륵 옮겨 가요 — 바드림 디자인 시스템 SegmentedControl 움직임(곡선 `--bd-motion-slide-easing` cubic-bezier(.32,.72,0,1) 그대로, 시간은 조금 빠르게 `--iris-slide` 160ms — 디자인 시스템은 .2s, 글자 색도 같은 시간 · 곡선, 동작 줄이기면 0). 고른 칸도 글자 굵기는 그대로(이웃 칸이 밀리지 않게). 고른 흰 칸은 호버해도 흰색 그대로. 누름 회색은 칠하지 않아요(누르는 순간 새 칸에 회색이 먼저 생겨 튀어 보였어요) · 고른 칸 테두리 모양은 미리 계산(한 프레임 늦게 생기지 않게)
- 탭 줄(.seg)은 쌓임 맥락을 만들지 않아요(안에 줌 · 보기 설정 같은 펼침 메뉴가 있어서 — 만들면 메뉴가 아래 패널 내용 밑으로 깔려요). 칸끼리만 순서: 고른 칸 0, 나머지 1. 펼침 메뉴 · 드롭다운은 모두 패널 내용 위(2026-11-25 전수 검사)
- 홈 사이드바 맨 아래: Iris 로고 · Powered by CYCLOID 한 줄을 테두리 상자(0.75px gray-900 10% · 다크 흰 12%, 모서리 10 squircle, 높이 40)에 담아 가운데 — 좌우 · 아래 여백은 메뉴 줄과 같은 8. 내용만 50% 흐리게, 문구는 로고 바닥보다 1px 위
- 새 레이어 이름(피그마와 같아요): '종류 N'(Rectangle · Ellipse · Frame · Section · Group …) — N 은 열려 있는 모든 문서(캔버스 · 화면들)의 레이어와 이 페이지 화면(캔버스 빈 곳에 그린 프레임) 이름을 통틀어 같은 꼴의 가장 큰 번호 + 1. 지우고 다시 그려도 · 캔버스와 프레임에 나눠 그려도 겹치지 않아요(예: 홈 프레임에 Rectangle 1 → 캔버스에 그리면 Rectangle 2). 복제(⌘D · ⌥ 끌기) · 붙여넣기 · 화면 복제: 기본 이름('종류 숫자', 'Group 숫자')이면 다음 번호, 이름을 바꾼 것은 그 이름 그대로
- 팝오버 머리 안 탭은 위 · 아래 · 왼쪽 여백이 같아요(머리 40 · 탭 24 → 모두 8)
- 색 팝오버 값 줄: [형식 ▾] [값 (토큰 버튼) | 불투명도 %] — 값과 불투명도는 Fill 행처럼 한 칸에 세로선으로 나누고, 칸에 올리면 색 변수(토큰) 버튼. 바탕 칠이면 토큰으로 연결, 덧붙인 칠 · 그라디언트 멈춤점이면 그 색 값을 넣어요
- 팝오버는 머리(제목 · 탭 줄 빈 곳)를 끌어 옮겨요(피그마처럼) — 색 · 글자 · 효과 · 격자 · 스타일 만들기 · 변수 · 아이콘 · 모서리 다듬기 팝오버. 머리 안 버튼 · 탭은 그대로 눌려요. 옮긴 자리는 패널 스크롤 · 탭 바꾸기에도 그대로, 화면 가장자리 8 안에서만, 닫았다 열면 앵커 옆에서 다시 시작
- 레이어 목록 고른 줄: 따로 고른 줄은 각자 둥근 상자. 연달아 고른 줄(바로 위 줄이 고른 줄이거나 그 하위 줄)은 상자 하나로 이어서 위 · 아래 끝 모서리만 둥글고 사이는 0 — 줄마다 고른 줄 · 하위 줄 색은 그대로
- 점 편집(Enter · Edit object): 점 · 선(두 점 사이)을 골라요 — 누르면 그것만, ⇧+누르기로 더하기 · 빼기, 여럿 고른 채 하나를 끌면 고른 것 전부 이동(끌지 않고 떼면 그 점만), 선을 끌면 양 끝 점 이동. 선은 올리면 파란 1px · 고르면 파란 2px. 패널 값은 고른 것에만: Position X · Y = 고른 점들 상자의 왼쪽 위(바꾸면 고른 점들만 옮김), 사각형 Corner radius = 고른 꼭짓점 · 고른 선의 양 끝 모서리만(값이 다르면 Mixed, 고른 게 없으면 네 모서리). Delete 는 고른 점 전부
- 둥근 사각형 점 편집(피그마와 같아요): 꼭짓점을 옮겨도 벡터 꼭짓점 네 개 그대로 — 모서리 둥글기는 꼭짓점마다의 r(vertex corner radius)로 남아 계속 둥글게 그려요. 곡선 점으로 굳히는 건 Flatten(⌘E) · 불리언만. 벡터의 Corner radius(패널)는 고른 꼭짓점의 r(편집 중 고른 게 없거나 편집 밖이면 모든 꼭짓점)
- 점 편집 단축키 · 조작: 빈 곳 끌기 = 상자 안 점 고르기(⇧ 더하기), 빈 곳 누르기 = 고른 점 풀기(편집은 그대로), ⌘A 모든 점, 방향키 1 · ⇧ 10 씩 옮기기, Delete 고른 점 지우기, Esc · Enter 끝내기
- 실행취소 · 다시하기는 고른 레이어도 함께 되돌려요(예: 둘 골라 Union → ⌘Z 면 그 둘이 다시 골라진 채로, ⌘⇧Z 면 Union 결과가 골라진 채로)
- 불리언 메뉴(머리 ▾): 항목마다 이름 왼쪽에 그 연산 아이콘(Union · Subtract · Intersect · Exclude · Flatten), 체크 표시 없음
- ⌥ 간격 재기(피그마와 같아요): 위아래로 떨어져 있고 가로로 겹치면 세로 간격 + 왼쪽끼리 · 오른쪽끼리 어긋난 만큼(상대의 세로 가장자리를 점선으로 고른 것까지 늘려서), 좌우로 떨어져 있고 세로로 겹치면 그 반대. 안에 든 것이면 네 방향 안쪽 간격
- ⌥(⇧⌥ 가운데 기준 포함)를 누른 채 옮기거나 크기를 바꾸는 동안에도 간격을 계속 보여요 — 포인터 아래 고르지 않은 레이어, 없으면 부모(프레임)와. 그동안은 붙는 선 대신 간격, 떼면 사라져요
- 도형 그리기: 사각형 · 원 · 다각형 · 별은 끄는 동안에도 그 모양 · 기본 칠 그대로 미리 보여요(피그마와 같아요)
- 도형 속성(평소 패널과 두 번 눌러 편집 중 모두): 다각형 Count · Corner radius, 별 Count · Ratio · Corner radius(꼭짓점마다 같은 둥글기), 원 Arc — Start(°) · Sweep(%) · Ratio(구멍 %). 원 호는 부채꼴 · 고리로 그리고(evenodd), 불리언 · Flatten 도 그 모양 그대로
- 마우스 올림: 화면 · 일반 프레임에 바로 놓인 글자는 상자 대신 줄마다 밑줄 2px. 그룹 · 오토 레이아웃 안 글자는 상자
- 너비 자동(Hug) 글자는 그려진 글자 크기를 늘 레이어 크기로 맞춰요(불러온 글자 · 글꼴이 바뀐 글자도) — 그룹 · 정렬 · 간격 재기가 보이는 크기 그대로(예: 182 Hug 글자를 ⌘G 하면 그룹도 182)
- 프레임 · 섹션을 끌어 그리면(피그마와 같아요): 같은 부모 안에서 그 상자 안에 통째로 드는 레이어를 자동으로 안에 넣어요(보이는 자리 그대로, 잠긴 · 숨긴 · 돌린 것은 빼요). 새 상자는 넣은 것 중 맨 위 자리에, 실행취소 한 번
- 섹션도 프레임처럼: Fill · Stroke(변마다 포함) · Effects · 오토 레이아웃(Flow) · Layout grid · Clip content. 내용 자르기는 프레임 기본 켬, 섹션 기본 끔
- 레이어 목록 아이콘: 사각형 · 원 · 다각형 · 별 · 선 · 펜(벡터 · 연필) · 불리언은 지금 그 모양 그대로 1px 선(비율 · 둥근 모서리 · 원 호 · 점 위치 · 불리언 결과, 긴 쪽 최대 10 — 프레임 · 글자 아이콘 그림 크기와 같게) — 고치면 바로 따라 바뀌어요. 프레임 · 그룹 · 오토 레이아웃 · 글자 · 이미지는 종류 아이콘
- 불리언(Union · Subtract · Intersect · Exclude, 피그마와 같아요): 캔버스에서 한 번 누르면 합친 면(결과 모양선), 두 번 누르면 누른 자리의 안쪽 도형(모양 경로로 판단). 레이어 목록에서는 기본 접힘 — 화살표로 펼치거나 안쪽 도형을 고르면 펼쳐져요
- 패널 머리 제목: 여러 개를 고르면 'N selected', 불리언은 적용한 연산 이름(Union · Subtract · Intersect · Exclude)
- 문서를 넘어 고르기(피그마와 같아요): 캔버스 위 레이어와 프레임(화면) 안 레이어를 함께 — 레이어 목록 ⇧ 범위 · ⌘ 하나씩, 캔버스 ⇧ 클릭. 함께 고른 것(store.xsel)은 목록 · 캔버스에 고른 것으로 표시되고 큰 상자 하나 + 크기. 끌기 · 방향키 · 지우기 · 패널의 칠 · 선 · 모양 값은 모두에 함께(실행취소 한 번). 자리 · 크기 숫자 칸은 지금 문서 것만. 한 개를 누르면 보통 고르기로 돌아가요
- 주의: `.grp` · `.row` · `.sw` 는 main.css 공통 클래스 — 새 부품에서 같은 이름을 쓰면 모양이 섞여요

## 26. 아이콘 고르기 · 픽셀에 맞추기 (2026-11-24)
- 인스턴스 속성의 아이콘 이름 칸(Icon Name · Left Icon 의 Icon …)은 글자 입력 대신 고르기: 칸(아이콘 16 · 이름 · ▾)을 누르면 오른쪽 패널 왼쪽에 아이콘 팝오버(폭 240 · 머리 40(Icons · 닫기) · 검색 28 · 한 줄 4칸 정사각 그리드(칸 사이 4), 칸마다 옅은 1px 테두리 · 아이콘 20 · 이름은 안 보이고 툴팁으로, 고른 칸 --iris-sel + 파란 테두리). Outlined · Solid 를 나누지 않고 한 목록에 알파벳 순(이름이 겹치지 않음 — solid 는 대부분 …_solid). 디자인 시스템에 있는 아이콘만(빌드 때 `virtual:iris-ds-icons` 가 패키지의 아이콘 파일 지도에서 이름을 모음 — Outlined 122 · Solid 89)
- 보기 설정(⚙): Pixel grid ⇧'(격자 보이기)와 Snap to pixel grid ⇧⌘'(픽셀에 맞추기)는 따로(피그마와 같아요, 둘 다 페이지 설정 · 기본 켬). Snap 을 끄면 끌어 옮기기 · 크기 바꾸기 · 패널 값이 정수 대신 소수 둘째 자리까지
- 컴포넌트를 넣을 때 크기 = 디자인 시스템 스토리북(ba-dream/design-system 각 Playground) 기준 크기(`InstanceView` 의 `STORY_SIZE`, 73개 전수 조사). 예: 입력칸(TextInput · TextArea · SearchField · Dropdown · Select) 350 — 스토리북은 320 · 280 이 섞여 있지만 피그마 기준 350 으로 통일, 목록 · 카드 350, SegmentedControl 340, 바 · 시트 · 상태 화면 390, DatePicker 352, Toast 350, PopUp 310, ProductCardGrid 169. 폭이 100% 인 컴포넌트는 그 폭으로 고정 + 세로 Hug, 버튼 · 배지 · 칩처럼 내용 크기인 것은 Hug. 에셋 미리보기도 같은 크기로 그려 줄여 보여요

- 인스턴스 속성은 필요할 때만: 컴포넌트가 실제로 그 값을 쓸 때만 칸이 보여요(`InspectorInstance` 의 `WHEN`). 예: Button · TextButton 은 Contents 에 icon 이 있어야 Icon Name, text 가 있어야 Text / ListCommon 은 Left Block(icon → 아이콘 · image → 이미지) · Right Block(button · cost · check) / Select 는 Trailing / Menu 는 Left Block + With, Caption Type(숫자 배지면 Count) / ButtonGroup 은 Type(보조 · etc · cost · check 문구) / NavBarTop 은 Type(뒤로 문구 · 제목 · 세그먼트) / Toast 는 Button / NoticeBox 는 Contents. showX 토글에 딸린 값은 예전처럼 토글이 켜져야 보여요. Chip · FilterChip 의 옛 토글(Show Icon · Show Avatar · Show Text · Icon Position)은 Contents 가 대신해서 숨겨요

- 프레임(화면) Stroke 도 레이어 Stroke 와 같은 칸(`InspectorPaints` kind=stroke frame): [견본 · HEX | 불투명도 %] · 👁 · −, 여러 선 · 끌어서 순서 · 스타일 · 변수, 그 아래 Position ▾(Inside 기본) · Weight · ⚙ Stroke settings(Style Solid/Dashed · Dash · Gap · Join) · ▢ 변마다(All · 위 · 아래 · 왼쪽 · 오른쪽 · Custom). 비어 있을 때 머리에 올리면 + 왼쪽에 스타일(⁘) 버튼이 떠서 바로 고를 수 있어요(Fill · Effects 와 같음). 점선 화면 테두리는 둥근 사각형 경로의 SVG 선으로 그려요(box-shadow 로는 점선이 안 돼서)
- 떠 있는 창(팝오버 · 변수 목록) 안 드롭다운은 모두 흰 바탕 + 1px 테두리(호버 진하게 · 열림 파랑) — 칠 창 · 선 설정 · 글자 설정 · 레이아웃 그리드 · 변수 목록(All libraries) 공통(`main.css`)
- squircle 테두리 고리(--sq-ring)는 안쪽 경로를 반대 방향으로 그려요 — 채우기 규칙(evenodd)이 빠져도 고리만 남아요. 예전엔 규칙이 빠지면 팝오버 전체가 선 색(22% 회색)으로 덮였어요
- 가이드선(눈금자 ⇧R): 놓은 자리(마우스)가 화면(프레임) 위면 그 프레임의 가이드선(`frame.guides`, 프레임 왼쪽 · 위에서 잰 값) — 프레임과 함께 옮겨지고, 프레임을 복사하면 같이 복사돼요. 놓은 뒤에는 그 프레임 위에만 보이고(실선), 끄는 동안에만 프레임 밖으로 점선(4 · 4)이 이어져요. 고르면 숫자도 프레임에서 잰 값. 빈 캔버스에 놓으면 페이지 가이드선(실선, 캔버스 좌표). 끄는 동안 화면 · 레이어의 가장자리 · 가운데, 레이아웃 그리드 칸(Columns · Rows)의 양 끝, 다른 가이드선에 붙어요(화면 6px 안, ⌘ 누르면 안 붙음). 레이어를 옮길 때도 프레임 가이드선(그 프레임 위에서만)에 붙어요
- 가로 눈금자는 가운데 캔버스(왼쪽 · 오른쪽 패널 사이)에만, 세로 눈금자는 왼쪽 패널 오른쪽에
- 가이드선 상태(피그마와 같아요): ① 끄는 동안 — 빨강 1px, 프레임 위 실선 + 밖으로 점선, 눈금자에 빨간 숫자(프레임에서 잰 값) ② 프레임이나 가이드선을 고르면 — 그 가이드선은 파랑 1px, 프레임 위 실선 + 밖으로 점선, 눈금자에 숫자 ③ 아무것도 안 고르면 — 얇은 빨강(0.5px), 프레임 가이드선은 프레임 위에만. 올리면 1px
- 가이드선 숫자는 눈금자 위에만 보여요(캔버스에 숫자 칩을 띄우지 않아요)
- 사이드바를 접어도 오른쪽 패널 머리 줄의 펼침 메뉴(줌 · 보기 설정)는 패널 밖 맨 위로 다 보여요(접힌 동안은 패널을 자르지 않고 머리 아래 내용만 숨겨요)
- 사이드바를 접은 채 레이어를 골라도 레이어 목록이 스크롤되지 않아요(접힌 패널 몸통 · 편집기 바탕은 overflow: clip — 코드로도 밀리지 않음)
- 문서를 읽는 중에 다른 화면(프레임)을 고르면, 그 화면에 연결된 이 문서의 요구사항(번호 순 첫 번째)으로 포커스가 옮겨가고 그 자리로 스크롤돼요. 지금 고른 요구사항이 그 화면에도 연결돼 있으면 그대로, 연결된 게 없으면 포커스를 풀어요
- 문서에서 REQ 를 누르면 캔버스도 그 REQ 를 그린 레이어(컴포넌트 · 항목)를 골라 보여 줘요(배율은 그대로 — 아래 '보여 주기'). 레이어는 ① 직접 연결(레이어 `reqs` — 레이어를 고른 채 문서에서 REQ 를 만들면 붙고, 문서 기반으로 화면을 만들 때도 여기에 적어요) ② 없으면 REQ 문장과 레이어 이름 · 글자를 맞춰 짐작(`app/canvas/reqMatch.ts`, 기본 이름은 제외). 못 찾으면 그 화면을 골라 맞춰 보여요. 지금 고른 화면이 그 REQ 에 연결돼 있으면 그 화면에서 찾아요
- REQ 로 포커스한 화면(지금 고른 화면)은 연결 강조(파란 칠 · 테두리)를 빼고, 고른 항목의 선택선만 보여요. 같은 REQ 에 연결된 다른 화면만 강조해요
- 문서에서 REQ(블록 · 번호)에 마우스만 올려도 캔버스에 그 항목을 청록(turquoise, `--iris-peek` #0BB5A6) 선으로 미리 보여 줘요: 2px 선 + 바깥 3px 옅은 번짐 + 14% 칠 + 왼쪽 위 REQ 번호 꼬리표. 연결된 화면마다, 항목을 못 찾으면 화면 전체. 벗어나면 사라져요
- REQ 로 항목 보여 주기(누름 · 마우스 올림 공통): 배율은 절대 바꾸지 않아요(화면 크기 유지). 프레임 안 항목은 가운데 영역(양쪽 패널 사이, 가장자리 24 안쪽)에 다 보이면 그대로(선택선 · 청록 선만 바뀜), 아니면 그 항목이 가운데 오게 스르륵(320ms ease-out, 동작 줄이기면 바로) 옮겨요. 화면(프레임) 단위는 이미 절반 넘게 보이면 그대로, 아니면 화면 가운데로. 마우스 올림은 180ms 머물러야 움직여요. 청록 선은 패널 아래에 그려요
- 문서 패널의 요구사항 색도 청록: REQ 번호 칩(글자 #07857A · 다크 #3FD8C8, 옅은 청록 바탕), 고른 REQ 카드(옅은 청록 칠 + 청록 선), 카드에 올리면 옅은 청록 선
- 오른쪽 패널의 문서 상세(Docs)는 팝오버 목록과 같은 얇은 스크롤 막대(v-ovscroll: 4px, 내용 위에 떠서 자리를 차지하지 않고, 올리거나 스크롤할 때만)를 보여요
- 왼쪽 패널 목록(Pages · Layers · Docs · Assets 목록과 상세)도 같은 얇은 스크롤 막대(v-ovscroll) — 항목이 넘칠 때만, 올리거나 스크롤할 때 보여요
- 프로젝트 썸네일(피그마 Set as thumbnail): 프레임 우클릭 → 'Set as thumbnail' 이면 홈 목록 카드에 그 프레임을 보여 줘요(projects.cover_screen_id). 이미 썸네일이면 같은 자리에 'Restore default thumbnail'(기본 = 첫 페이지의 첫 화면). 썸네일 화면이 지워지면 기본으로
- 모든 메뉴(펼침 메뉴 · 드롭다운 · 우클릭 메뉴 · 편집기 밖 계정 메뉴 · 요구사항 보드 · 문서 화면)의 행 호버는 보기 설정(⚙) 메뉴와 같아요: 페이드 없이 바로 파랑(#0D99FF) 칠 + 흰 글자, 위험 항목은 빨강. 여는 애니메이션은 없음(바로 뜸)
- 썸네일로 정한 프레임: 캔버스 프레임 이름 앞에 네모 아이콘(12, 둥근 사각 선), 홈 카드에서는 칸을 꽉 채워 확대(가운데 정렬, 넘치는 곳은 잘림). 홈 카드 썸네일 칸은 화면 폭과 상관없이 딱 3:2(aspect-ratio, 새 파일 화면의 작은 썸네일 96 × 64 도 3:2). 썸네일용 프레임 기본 규격은 3:2(예: 1200 × 800) — 그대로 꽉 차요. 카드 ⋮ 버튼은 흰 바탕 + 1px 테두리, 카드 가장자리에서 6 띄우고 모서리 6(카드 12 − 6 — 바깥 곡선과 나란하게)
- 줄 높이(Line height): '125%' 처럼 % 를 붙이면 글자 크기의 %(lineHeightUnit 'percent' — 글자 크기를 바꾸면 따라가요), 숫자만이면 px(피그마와 같아요). 칸에는 '100%' · '24' 로 보여요. 새 텍스트 기본은 100%. 텍스트 스타일 · 줄 높이 변수를 고르면 px, 스케일(K)은 % 를 그대로 둬요
- 프레임 Selection colors: 색이 5개 이상일 때만 'Show selection colors' 버튼, 4개 이하면 바로 보여요(색이 없으면 섹션 없음)
- 글자 정렬(Alignment) 버튼은 글자 정렬 아이콘(text_align_left · center · right — 세 줄)을 써요. 막대 있는 align_left · right 는 레이어 정렬(Arrange) 전용
- 새 파일(New file) 목록의 썸네일도 홈 카드와 같게: 썸네일로 정한 프레임은 칸(3:2)을 꽉 채워(가운데). 레이어 패널의 프레임 우클릭 메뉴에도 'Set as thumbnail' · 'Restore default thumbnail'
- 로딩 화면: 열린 탭끼리 옮길 때만 바로 보여요. 프로젝트 탭을 닫으면(× · 다른 탭 닫기 · 모든 탭 닫기 · 20개 넘어 자동으로 닫힘) 불러온 데이터를 잊어서, 다시 열면(새 파일 목록 · 홈 등) 로딩 화면이 뜨고 최신으로 다시 받아요
- 오토 레이아웃 칸('Auto layout')은 오토 레이아웃 하나를 골랐을 때만. 각자 오토 레이아웃인 것 여럿을 고르면 서로 관계없는 것이라 기본 'Layout' 칸(Flow 없음, + 만) — + · ⇧A 로 새 오토 레이아웃 프레임에 함께 감싸면 그 프레임의 'Auto layout' 칸이 떠요
- 편집기 토스트(알림 · 오래 남는 알림)는 도구 막대 위로 16 띄워요(아래에서 76)
- 오토 레이아웃 안 레이어 점선 상자(올렸을 때 자식들 · 고른 레이어의 오토 레이아웃 부모)는 2px 칠 · 2px 빔의 짧고 촘촘한 점선(브라우저 dashed 대신 직접 그림)
- 고른 것을 감싸서 만든 프레임(⌥⌘G Frame selection · 여럿에 ⇧A)은 칠 없음(흰 바탕을 깔지 않아 안의 내용이 가려지지 않아요, 피그마와 같아요). 프레임 도구로 그린 프레임은 그대로 흰 바탕
- 글자마다 서식(피그마와 같아요): 글자를 고치는 중 글자를 고르면 오른쪽 패널의 색 · 굵기 · 크기 · 줄 높이 · 자간과 ⌘B · ⌘U · ⇧⌘X 가 그 글자에만 적용돼요(레이어 `spans` — 바탕 style 위에 [s, e) 구간 덮어쓰기, app/canvas/textRuns.ts). 패널 · 팝오버 · 드롭다운을 눌러도 편집은 이어지고 고른 글자는 파란 하이라이트로 남아요(캔버스 다른 곳을 누르거나 Esc 로 끝). 칸 값도 고른 글자 것(서로 다르면 Mixed). 글자를 다 고른 상태면 레이어 서식 자체를 바꿔요. 고른 글자 사이에 치면 그 서식을 이어받아요
- 글자마다 서식이 다른 레이어를 통째로 고르면 그 항목은 Mixed(색은 'Click + to replace mixed content'), 레이어 전체에 값을 넣으면 그 항목의 글자 덮어쓰기는 지워지고 모든 글자가 그 값(다른 항목 덮어쓰기는 그대로)
- 글자마다 서식은 내보내기에도: PNG · JPG · SVG 내보내기는 그려진 화면 그대로, PDF 는 글자 조각마다 그 서식(색 · 굵기 · 크기)으로 외곽선을 그려요. 'Copy as CSS' 는 레이어 서식 뒤에 글자 구간마다 덮어쓴 값을(어느 글자인지 주석으로), Dev 탭 '쓰인 색'에 글자 구간 색도 들어가요. 'Copy as SVG' 는 예전처럼 글자를 빼요
- 길어서 스크롤되는 메뉴(드롭다운 · 요구사항 보드 메뉴)는 바깥 상자(검은 바탕 · 테두리)는 그대로 두고 안쪽 .menu-sc 만 스크롤(main.css) — 바깥을 스크롤 상자로 두면 바탕 층이 내용과 함께 밀려 아래 행이 바탕 밖으로 튀어나와요
- 글자 크기 ▾ 목록은 디자인 시스템 글자 크기(변수 값) + 지금 값(굵기 목록과 같아요), 맨 아래 'Apply variable…' 로 크기 변수 연결. 토큰이 없으면 피그마 기본 크기
- 화면(프레임) 패널의 X · Y · W · H 도 레이어 X · Y 처럼 변수(간격 토큰) 버튼(올리면 보여요): 고르면 그 값 + 연결(frame.vars x · y · w · h), 숫자를 치면 연결이 풀려요. 화면을 끌어 옮겨 값이 달라지면 연결 표시는 숫자로 돌아가요
- 글자 칠 − 는 칠이 하나뿐이어도 눌러요: 다 빼면 칠 없음(color '' — 글자가 안 보여요, 피그마와 같아요), + 로 다시
- 변수(토큰)를 연결한 칸: 칠 · 선 색 · 효과(그림자 스타일) · 글자(굵기 · 스타일) 변수만 칸 전체가 흰 토큰 상자(흰 바탕 + 0.5px neutral-400 테두리, 열면 회색 1px 선). 숫자 변수(모서리 · 투명도 · 간격 · W/H · 글자 크기 …)는 회색 칸 안에 흰 칩 — 피그마와 같아요(사용자 확인, main.css .fld:has(> .tchip-w:not(.num)))
- 투명도 변수 칩은 칸과 같은 % 로(opacity/60 → 60%, 저장 값 0.6을 그대로 보이지 않아요)
- W · H 가 Hug · Fill 이면 칸은 숫자 대신 흰 드롭다운 'W  Fill ▾'(숫자로 바꾸려면 ▾ 에서 Fixed). 오토 레이아웃 안 레이어의 X · Y · 회전 칸은 흰 테두리 칸 + 옅은 값(자리는 레이아웃이 정해요)
- 위치(X · Y)에는 변수(토큰) 버튼이 없어요(레이어 · 화면 모두 — 사용자 요청). W · H 는 ▾ 메뉴 · 화면 패널 버튼으로 변수 그대로
- Selection colors: 변수로 칠한 색은 흰 토큰 상자(칠 칸과 같은 모양, 예전 'token:<이름>' 값도 변수로). 줄에 올리면 오른쪽에 [변수 떼기(변수일 때)] [이 색을 쓰는 레이어 고르기] 버튼(피그마와 같아요)
- Selection colors 줄 동작 아이콘(줄에 올리면): [변수 떼기]는 변수로 칠한 색에만(아니면 빈 자리), [같은 색 레이어 고르기]는 새 과녁 아이콘(바깥 원 + 가운데 점 — 피그마 Select matching layers 와 비슷). 줄 틀은 Fill 줄과 같아요 — [칸 | 28 | 28] + 칸 뒤 간격, 그래서 칸 폭 · 변수 떼기(눈 자리) · 과녁(− 자리)이 위아래로 맞아요
- 드롭다운 · 고르는 칸이 열린 동안의 테두리는 서비스 전체가 회색 1px(`--iris-open-line` = neutral-500, 파란 선 아님): 일반 드롭다운 · 팝오버 안 흰 드롭다운 · 칸 안 글자 드롭다운(1x ▾ · Hug ▾ — 칸 전체에 선) · 변수 상자 · 텍스트 스타일 칸 · 아이콘 고르기 칸
- Export 형식(PNG ▾)은 흰 드롭다운(흰 바탕 + 1px 선), 배율(1x ▾)은 회색 칸 그대로 — 피그마와 같아요
- 탭바(홈 · 탭 · × · +)는 마우스로 누른 뒤 포커스를 남기지 않아요 — 남기면 이어서 단축키(⇧R 등)를 누를 때 탭에 파란 포커스 링이 생겼어요. 키보드(Tab)로 옮긴 포커스는 그대로 링이 보여요

### 이미지 = 칠(피그마와 같아요, 2026-11-26)
- 이미지는 레이어 종류가 아니라 칠: 넣으면 사각형 + 이미지 칠(Fill 패널에 'Image' 한 줄, 따로 생기던 Image 패널 없음). 동영상만 영상 레이어로 남아요
- 예전 파일의 이미지 레이어는 열 때 사각형 + 이미지 칠로 바꿔요(스키마 v8). 옛 자르기(확대 · 위치)는 원래 크기를 몰라 Fill 로
- 레이어 목록 아이콘: 이미지 칠이 보이는 사각형은 이미지 아이콘, 칠을 색으로 바꾸면 다시 사각형. 오른쪽 패널 제목도 'Image'
- 칠 창(이미지): [Fill · Fit · Crop · Tile ▾](Tile 이면 옆에 크기 %) → 미리보기(맞춤과 상관없이 전체) → 올리면 'Replace image'. 그림을 바꾸면 원래 크기 · 비율을 새로 받아요
- 이미지 칠 값: fit · crop{x, y, w, h — 레이어 대비 비율} · iw · ih(원래 크기) · scale(Tile 배율)
- 자르기 편집(피그마 Crop): 이미지를 두 번 누르거나 칠 창에서 Crop 을 고르면
  - 캔버스: 레이어 상자 = 자르는 창(레이어 모양 그대로 — 모서리 둥글기 · Corner smoothing), 이미지 = 파란 상자. 창 밖 이미지는 40% 흐리게
  - 이미지 안을 끌면 옮기기(창 가장자리 · 가운데에 6px 붙기), 이미지 모서리로 크기(비율 그대로), 창 모서리 · 가장자리로 창 크기(이미지는 그 자리), 둥글기 손잡이(⌥ 한 모서리)
  - 손잡이 모양은 프레임 선택과 같아요: 흰 네모 7 · 파란 1px, 둥글기는 흰 동그라미, 가장자리는 보이지 않는 띠
  - 이미지 돌리기: 이미지(흐린 부분 포함) 모서리 바로 바깥을 끌면 이미지 가운데 기준으로 돌아가요(⇧ 15° 씩, 모서리마다 돌리기 커서). 돌린 상태에서도 옮기기 · 모서리 크기(이미지 방향 기준) 그대로, '처음처럼 덮기'는 돌린 것도 0 으로
  - 이미지 칠 rotation: CSS 배경으로는 못 돌려서 LayerView 가 레이어 모양(둥글기 · smoothing)대로 잘라 따로 그려요(.rimg)
  - Crop 자리는 px 로 그려요(상자 크기를 알 때): 이미지 폭이 창 폭과 같을 때 % 배경 위치로는 옆으로 민 자리를 못 나타내서, 창 안 빈 쪽에 이미지가 잘못 그려지던 문제 — 이미지가 없는 쪽은 투명하게 비어요
  - 아래 막대(도구 막대 위): Crop · 확대 막대(덮기 크기 1 ~ 5배) · 비율(원래 · 1:1 · 원 · 가로 4:3 · 16:9 · 3:2 · 세로 3:4 · 9:16 · 2:3) · 처음처럼 덮기 | Cancel · ✓. 칠 창이 가리면 막대가 왼쪽으로 비켜요
  - 비율을 고르면 이미지는 그 자리 · 크기 그대로, 창만 그 비율로(이미지 안에 들어가는 가장 큰 상자, 이미지 가운데). 원은 둥글기를 끝까지, 다른 비율로 바꾸면 둥글기를 들어오기 전으로(그때도 원이었으면 0)
  - 자르기 화면은 캔버스 위 · 좌우 패널 아래(패널을 덮지 않아요)
  - 끝내기: ✓ · Enter · 바깥 누르기 · 다른 것 고르기 = 적용(실행취소 한 번), Cancel · Esc = 처음대로(칠 창이 열려 있으면 Esc 는 칠 창 먼저)
- 아직 없는 것(피그마에는 있음): 이미지 90° 돌리기 · 노출/대비 등 보정 막대 · 이미지 고른 채 아래 막대(Remove background 등)
- ⌘ 를 누른 채 이미지 칠 사각형의 크기를 바꾸면 자르기(피그마와 같아요): 이미지는 그 자리 그대로, 끈 변만 잘리거나 넓어져요(넓힌 쪽은 빈 영역). 비율 잠금도 풀리고 맞춤은 자동으로 Crop. 끄는 중 ⌘ 를 떼면 보통 크기 조절
- 칠 종류를 이미지 → 단색 · 그라디언트로 바꿨다가 이미지로 돌아오면 그 이미지(맞춤 · 자르기 포함)가 그대로 돌아와요(칠 자리마다 기억)
- 이미지 칠(Fill) 사각형 크기 조절: 원래 사진 폭 · 높이 근처(화면 6px)면 그 크기에 붙어요(자석, 상하좌우 어느 손잡이든). 비율을 지키면 가까운 쪽 기준으로 함께, 아니면 축마다 따로. 예전 파일은 끄는 동안 원래 크기를 읽어 와요
- 화면(맨 위 프레임) 회전(피그마와 같아요): doc.frame.rotation(도, 가운데 기준). 고른 화면의 네 모서리 바깥에 마우스를 두면 회전 커서 → 끌어서 돌리기(⇧ 15° 씩, 실행취소 한 번, 끄는 동안 크기 표시 자리에 각도). 레이어 회전 손잡이 · ⇧ 15° 는 원래 있던 그대로
  - 프레임 패널 Position 아래 Rotation 칸(+ 90° 돌리기) — Iris 화면만, 여러 개면 같을 때만 숫자. ↑↓ 1°, ⇧ 10°
  - 돌린 화면: 안의 레이어 선택 상자 · 손잡이도 같이 돌아요. 이름표 · 크기 표시는 피그마처럼 각도를 ±45° 안으로 줄여서(거꾸로 서지 않게) — 그때 위에 오는 변 왼쪽 끝 위에 이름표, 아래에 오는 변 가운데 아래에 크기(둘 다 그 각도로 기울어요). 뒤집기는 이름표 · 크기에 영향 없어요
  - 화면 뒤집기: Rotation 줄의 [90° 돌리기 · 좌우 뒤집기 · 상하 뒤집기](레이어와 같은 세 버튼) — doc.frame.flipX · flipY, 가운데 기준으로 안의 레이어가 거울처럼
  - 아직: 돌린 화면의 붙기(스냅) · 겹침 판단은 돌리기 전 상자 기준
- 돌리기 커서: 사분원(90°) 굽은 선 + 양 끝 채운 삼각 화살촉(선과 겹쳐 뭉개지지 않게), 흰 테두리 + 검은 선 + 옅은 그림자, 모서리마다 그 모서리를 감싸게(왼쪽 위 기준으로 90° 씩), 돌린 상자 · 화면이면 그 각도만큼 더 — 레이어 · 화면 모두
- 스마트 가이드(자석) 빨간 선: 자 가이드를 잡았을 때의 빨간 선과 같은 1px. crispEdges 를 빼고 선 자리를 화면 픽셀에 맞춰요(소수 자리에서 2px 로 번져 진해 보이던 문제)
- ⌥(⇧⌥) 끌어서 복제: 먼저 고르지 않아도 돼요 — 누르는 순간 ⌥ 를 누르고 있든, 끄기 시작한 뒤 누르든 곧바로 복제로(프레임 · 캔버스 위 프레임 · 레이어 모두). 고르지 않은 프레임 · 도형도 누르고 끌면 곧바로 골라서 그 방향으로 옮겨요(먼저 고를 필요 없이 — 사용자 요청, 예전의 '고르지 않은 프레임 빈 곳 끌기 = 그 안 상자 고르기'는 없앴어요. 상자 고르기는 캔버스 빈 곳 · ⌘ 끌기 · ⇧ 끌기로)
- 레이어 끌기 한 번 = 실행취소 한 번: 옮기기 + 다른 프레임 · 캔버스로 넘기기 + 함께 옮긴 화면을 한 번에 묶어요(따로 기록되면 ⌘Z 첫 번에 원래 프레임 밖 잘린 자리로 돌아가 사라진 것처럼 보였어요)
- ⌥(⇧⌥) 복제 끌기 중 ⌥ 를 떼면 복제 취소(피그마와 같아요): 화면은 파란 복제 미리보기가 사라지고 원래 화면이 다시 따라와요, 레이어는 복제본을 지우고 원본이 따라와요. 다시 누르면 다시 복제
- 돌린 레이어의 크기 표시도 화면과 같은 규칙(피그마와 같아요): 각도를 ±45° 안으로 줄여 아래에 오는 변 가운데 아래에, 그 각도로 기울여요(거꾸로 서지 않게). 레이어는 이름표가 없어요
- 단축키 모음: 메인 메뉴(로고 ▾) 'Keyboard shortcuts ⌃⇧?' → 팝업(공용 .pop-*, 폭 640, 두 칸). 기능별 묶음 — Tools · Edit · Selection · Arrange · Style · View, 키는 맥 기호 · 피그마 한국어 자판 기준, 편집기에 실제로 있는 것만. ⌃⇧? 로 열고 닫기, Esc · 바깥 누르기로 닫기
- 프로젝트 카드 표지(홈 · 새 탭): 웹 · 데스크톱 화면(폭 768 이상)은 휴대폰 모양 좁은 칸 대신 썸네일 폭에 맞는 넓은 칸(위 11 · 양옆 11, 아래는 칸 밖으로), 위쪽부터 꽉 채워요(ScreenThumb fit 'top' — 화면이 칸보다 납작해도 아래가 비지 않게). 세로(모바일) 화면은 그대로
- 포커스 링은 Tab 으로 옮길 때만(서비스 전체, 사용자 요청): Tab 을 누르면 html.kbd-nav, 마우스 · 손가락으로 누르면 지워요(plugins/focusring.client.ts). kbd-nav 가 없으면 :focus-visible 링(outline · 슬라이더 box-shadow)을 그리지 않아요 — 버튼을 누른 뒤 단축키를 눌러도 링이 생기지 않아요. 입력칸 선택선 · 메뉴 고른 줄은 그대로
- 캔버스 강조색은 피그마와 똑같은 값을 쓰지 않아요(사용자 요청 — 티 나지 않을 만큼만 다르게): 선택 파랑 #0D99FF → **#0E97FC**, 측정 · 가이드 빨강 #F24822 → **#F04A26**, 컴포넌트 보라 #9747FF → **#9549FC**. 이 문서 위쪽 표의 값은 피그마 기준 그대로 두고, Iris 는 이 값을 써요(--iris-select · --iris-measure · --iris-component)
