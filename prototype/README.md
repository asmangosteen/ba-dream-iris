# Iris HTML 프로토타입

캔버스 시안(`design/iris-canvas/*.dc.html`)과 화면 · 동작이 같은 **일반 HTML** 입니다. 캔버스 런타임 없이 브라우저에서 바로 열립니다.

- 화면마다 HTML 파일 하나: `Login.html` → `Home.html` → `Main.html`(에디터) …, 링크로 서로 이동합니다.
- 각 화면의 동작 코드(`class Component`)는 시안 그대로이고, Vue 3(CDN)에 얇은 호환층으로 연결했습니다.
- 공용 스타일은 `assets/iris-base.css`, 글꼴은 Pretendard(`assets/fonts`) 입니다.
- 1440 × 900 데스크톱 기준입니다.

## 보는 법

```bash
python3 -m http.server 8766 --directory prototype
```

브라우저에서 `http://localhost:8766` 을 엽니다.

> 디자인 시스템 아이콘 원본은 라이선스(바드림 사내 전용, 재배포 금지) 때문에 이 공개 저장소에 넣지 않았습니다. `assets/icons/<이름>.svg` 자리에 `@ba-dream/design-system` 아이콘을 넣으면 아이콘까지 보입니다. 팀원은 비공개 아티팩트 링크로 아이콘이 들어간 버전을 볼 수 있습니다.

`launcher.part.html` 은 아티팩트로 게시할 때 쓰는 화면 목록 페이지입니다.
