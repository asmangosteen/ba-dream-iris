// 웹 화면에 "데스크탑 앱에서 열렸다"는 표시만 알려 줍니다(노드 기능은 넘기지 않아요).
// 웹에서 확인: window.irisDesktop?.platform → 'darwin' | 'win32'
// onReloadTab: ⌥⌘R — 탭 막대는 두고 지금 탭만 새로 고침
// openExternal: 탭 우클릭 '브라우저에서 열기' — Iris 주소만 기본 브라우저로 열어요(앱 쪽에서 한 번 더 확인)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('irisDesktop', {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.send('iris:open-external', String(url)),
  // 메뉴 View > Reload Tab(⌥⌘R): 창 전체가 아니라 지금 탭만 새로 고치게 웹 화면에 알려요
  onReloadTab: (cb) => { ipcRenderer.removeAllListeners('iris:reload-tab'); ipcRenderer.on('iris:reload-tab', () => cb()) },
})
