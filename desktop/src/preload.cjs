// 웹 화면에 "데스크탑 앱에서 열렸다"는 표시만 알려 줍니다(노드 기능은 넘기지 않아요).
// 웹에서 확인: window.irisDesktop?.platform → 'darwin' | 'win32'
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('irisDesktop', { platform: process.platform })
