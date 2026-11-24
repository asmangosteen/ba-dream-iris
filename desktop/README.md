# Iris 데스크탑 앱 (Electron)

배포된 Iris 웹(https://ba-dream-iris.vercel.app)을 앱 창 안에서 여는 맥 · 윈도우 앱이에요.
**웹을 배포하면 앱에도 바로 반영돼요.** 앱을 다시 만들 필요는 없고, 창 · 메뉴 · 아이콘을 바꿀 때만 새로 빌드하면 돼요.

## 폴더

| 파일 | 하는 일 |
|---|---|
| `src/main.cjs` | 창 열기, 창 위치 · 크기 기억, 메뉴, 링크 처리(Iris 주소는 앱 안, 나머지는 기본 브라우저) |
| `src/preload.cjs` | 웹에 `window.irisDesktop = { platform }` 를 알려 줌 (앱에서 열렸는지 구분할 때 사용) |
| `src/offline.html` | 인터넷이 끊겼을 때 뜨는 "Can't reach Iris" 화면 |
| `scripts/make-icons.cjs` | `public/favicon.svg` 로 앱 아이콘 PNG(`build/icon-mac.png`, `build/icon-win.png`)를 만듦 |

## 명령 (이 `desktop/` 폴더에서)

```bash
npm install          # 처음 한 번
npm start            # 앱 실행 (배포된 Iris)
npm run dev          # 앱 실행 (로컬 개발 서버 localhost:3000)
npm run icons        # 파비콘을 바꿨을 때 아이콘 다시 만들기
npm run dist:mac     # 맥 설치 파일 → dist/Iris-버전-mac-universal.dmg
npm run dist:win     # 윈도우 설치 파일 → dist/Iris-버전-win-x64.exe
```

버전을 올리려면 `package.json` 의 `version` 을 바꾸고 다시 빌드해요.

## 단축키

- Cmd(Ctrl) + `0` · `+` · `-` 는 Iris 캔버스 확대 · 축소에 써서, 페이지 확대 메뉴는 넣지 않았어요.
- Cmd + Z · C · V 같은 편집 키는 Iris 가 먼저 받아서 처리해요. 처리하지 않으면 입력칸 기본 동작(실행 취소 · 복사 · 붙여넣기)이 일어나요.
- Cmd + R 새로고침, Cmd + Option + I 개발자 도구.

## 로그인

이메일로 받은 **6자리 코드**를 앱에 입력해요. 메일 속 링크를 누르면 앱이 아닌 브라우저에서 로그인돼요.

## 팀원에게 나눠 줄 때 (서명 전)

아직 애플 · 마이크로소프트 서명이 없어서 처음 열 때 경고가 떠요.

- **맥**: dmg 를 열고 Iris 를 응용 프로그램 폴더로 끌어 넣은 뒤 실행 → "열 수 없음" 경고가 뜨면
  시스템 설정 › 개인정보 보호 및 보안 › 아래쪽 "그래도 열기" 를 눌러요. (한 번만 하면 돼요)
- **윈도우**: "Windows의 PC 보호" 창에서 "추가 정보" › "실행" 을 눌러요.

경고 없이 열리게 하려면:
- 맥: Apple Developer 계정(연 $99)으로 Developer ID 인증서를 만들고, `package.json` 의 `mac.identity` 를 지우고 공증(notarize) 설정을 넣어요.
- 윈도우: 코드 서명 인증서를 사서 `win` 설정에 넣어요. 사내용이면 경고를 감수해도 돼요.
