// Iris 데스크탑 앱 — 배포된 Iris 웹(Vercel)을 앱 창 안에서 엽니다.
// 웹을 배포하면 앱에도 바로 반영되므로, 이 파일은 창 · 메뉴 · 링크 처리만 맡습니다.
// 개발 서버를 열려면: IRIS_URL=http://localhost:3000 npm start (npm run dev 와 같음)
const { app, BrowserWindow, Menu, shell, session, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const IRIS_URL = process.env.IRIS_URL || 'https://ba-dream-iris.vercel.app'
const ORIGIN = new URL(IRIS_URL).origin
const isMac = process.platform === 'darwin'

// 같은 앱을 두 번 켜면 새로 띄우지 않고 이미 열린 창을 앞으로 가져옵니다
if (!app.requestSingleInstanceLock()) app.quit()

/* ── 창 위치 · 크기 기억 ─────────────────────────────── */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    // 모니터를 뺐을 때 화면 밖에 뜨지 않도록, 지금 연결된 화면과 겹칠 때만 위치를 씁니다
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      s.x < a.x + a.width && s.x + s.width > a.x && s.y < a.y + a.height && s.y + s.height > a.y)
    return onScreen ? s : { width: s.width, height: s.height, maximized: s.maximized }
  } catch { return { width: 1440, height: 900 } }
}
function saveState(win) {
  try {
    const b = win.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
  } catch { /* 저장 실패는 무시 (다음에 기본 크기로 열림) */ }
}

/* ── 링크: Iris 주소는 앱 안에서, 그 밖(피그마 · 문서 등)은 기본 브라우저로 ───── */
const isIris = (url) => { try { return new URL(url).origin === ORIGIN } catch { return false } }
function openOutside(url) {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') shell.openExternal(url)
  } catch { /* 잘못된 주소는 열지 않음 */ }
}

function wireContents(win) {
  const wc = win.webContents
  wc.on('will-navigate', (e, url) => {
    if (isIris(url) || url.startsWith('file:')) return
    e.preventDefault()
    openOutside(url)
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (isIris(url)) return { action: 'allow', overrideBrowserWindowOptions: windowOptions() }
    openOutside(url)
    return { action: 'deny' }
  })
  wc.on('did-create-window', (child) => wireContents(child))
  // 인터넷이 끊겼거나 서버에 닿지 못하면 안내 화면을 띄웁니다(다시 시도 버튼 있음)
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3: 다른 이동으로 취소된 것(오류 아님)
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { to: isIris(url) ? url : IRIS_URL } })
  })
}

function windowOptions(state = {}) {
  return {
    x: state.x, y: state.y,
    width: state.width || 1440, height: state.height || 900,
    minWidth: 960, minHeight: 600,
    title: 'Iris',
    backgroundColor: '#FFFFFF',
    show: false,
    autoHideMenuBar: true, // 윈도우: 메뉴 막대를 숨기고 Alt 로 꺼냅니다
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  }
}

let mainWindow = null
function createWindow() {
  const state = loadState()
  const win = new BrowserWindow(windowOptions(state))
  if (state.maximized) win.maximize()
  wireContents(win)
  win.once('ready-to-show', () => win.show())
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show() }, 4000) // 느린 연결에서도 창은 뜨게
  win.on('close', () => saveState(win))
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  win.loadURL(IRIS_URL)
  mainWindow = win
  return win
}

/* ── 메뉴 ─────────────────────────────────────────────
   Cmd(Ctrl) + 0 · + · - 는 Iris 캔버스 확대 · 축소가 쓰므로 페이지 확대 메뉴는 넣지 않습니다.
   편집 메뉴(실행 취소 · 복사 · 붙여넣기)는 macOS 입력칸에서 단축키가 동작하려면 꼭 있어야 해요.
   Iris 가 먼저 키를 받아 처리(preventDefault)하면 메뉴 동작은 일어나지 않습니다. */
function buildMenu() {
  const openInBrowser = {
    label: 'Open in Browser',
    click: () => { const w = BrowserWindow.getFocusedWindow(); if (w && isIris(w.webContents.getURL())) shell.openExternal(w.webContents.getURL()) },
  }
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [openInBrowser] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ── 권한: Iris 주소에만 클립보드 · 전체 화면 · 알림을 허용 ───── */
function setPermissions() {
  const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications'])
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(isIris(wc.getURL()) && allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) =>
    !!wc && isIris(wc.getURL()) && allowed.has(permission))
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  setPermissions()
  buildMenu()
  createWindow()
  // macOS: 창을 다 닫아도 앱은 Dock 에 남고, Dock 아이콘을 누르면 다시 엽니다
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })
