# Iris 디자인 시안 (HTML 캔버스)

Phase 1 화면 8장의 HTML 시안 소스입니다. 바드림 디자인 시스템(`@ba-dream/design-system` 1.0.0)의 토큰 · 아이콘 · Pretendard 폰트를 써서 만들었고, 무드는 [design-system.ba-dream.com](https://design-system.ba-dream.com)을 따랐습니다.

- 시안 보기: Claude 디자인 캔버스 아티팩트 (비공개, 링크를 공유해야 팀원이 열 수 있습니다)
- `*.dc.html`: 화면(아트보드) 하나당 파일 하나입니다. 캔버스 런타임(`support.js`)에서만 그대로 열립니다.
- `canvas.json`: 아트보드 배치 정보입니다.
- `assets/iris-base.css`: 공용 스타일입니다. 디자인 시스템 토큰 이름을 그대로 쓰고, 아이콘 · 폰트는 아티팩트에 올린 파일(`/_blob/...`)을 참조합니다.
- 모서리: 작업 캔버스 안 화면을 뺀 모든 둥근 요소에 Corner smoothing 60%를 줍니다. 디자인 시스템 `Squircle`과 같은 figma-squircle 경로를 각 아트보드 스크립트(`irisSquircle`)가 계산해 `clip-path`로 자릅니다. 요소는 배경 · 선을 직접 칠하지 않고 `--sq-fill` · `--sq-line` · `--sq-line-w`로 넘깁니다.

| 파일 | 화면 |
|---|---|
| Login.dc.html | 01 로그인 (@ba-dream.com 인증코드) |
| Home.dc.html | 02 프로젝트 홈 |
| Main.dc.html | 03 에디터: 화면 인스펙터 (디자인 · 기획 · 개발 탭) ★ |
| MainLayer.dc.html | 03-2 에디터: 레이어를 골랐을 때 (캔버스 강조 · 인스턴스 속성) |
| MainDoc.dc.html | 03-3 에디터: 문서를 오른쪽 패널에서 읽을 때 (요구사항 → 레이어 강조) |
| MainAsset.dc.html | 03-4 에디터: 에셋 상세를 왼쪽 사이드바에서 볼 때 (피그마식 속성 · 넣기) |
| MainDesign.dc.html | 03-5 에디터: 디자인 탭에서 인스턴스 속성 · 채우기 · 모서리 · 텍스트를 고칠 때 (캔버스에 바로 반영) |
| DocSplit.dc.html | 04 문서 함께 보기 |
| AddDoc.dc.html | 05 문서 추가 모달 |
| FigmaLink.dc.html | 06 피그마 화면 연결 |
| DesignSystem.dc.html | 07 디자인 시스템 |
| Requirements.dc.html | 08 요구사항 보드 |

> 디자인 시스템 아이콘 원본은 라이선스(바드림 사내 서비스 전용, 재배포 금지) 때문에 이 공개 저장소에 넣지 않았습니다. 개발할 때는 `@ba-dream/design-system`의 `<Icon name="...">`을 씁니다.

글자 · 버튼 크기는 [`PRD/05_UI_GUIDE.md`](../../PRD/05_UI_GUIDE.md)를 따릅니다. `hierarchy-audit.js`를 각 화면 콘솔에서 돌려 위반 0개를 확인합니다.
