// 앱 아이콘 PNG 를 파비콘(public/favicon.svg)에서 만듭니다. 실행: npm run icons (desktop/ 에서)
// - build/icon-mac.png : 1024 캔버스 가운데 824 타일 + 옅은 그림자 (macOS 아이콘 격자와 같은 여백)
// - build/icon-win.png : 1024 꽉 찬 타일 (윈도우는 여백 없이 씀)
// .icns · .ico 변환은 electron-builder 가 빌드할 때 이 PNG 로 알아서 합니다.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')
const OUT = path.join(__dirname, '..', 'build')
const svg = fs.readFileSync(path.join(ROOT, 'public', 'favicon.svg'), 'utf8')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const render = (size, tile, shadow) => win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
    await img.decode()
    const c = document.createElement('canvas'); c.width = c.height = ${size}
    const g = c.getContext('2d')
    const o = (${size} - ${tile}) / 2
    if (${shadow}) { g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 20; g.shadowOffsetY = 10 }
    g.drawImage(img, o, o, ${tile}, ${tile})
    return c.toDataURL('image/png')
  })()`)
  const save = (name, dataUrl) => fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  fs.mkdirSync(OUT, { recursive: true })
  save('icon-mac.png', await render(1024, 824, true))
  save('icon-win.png', await render(1024, 1024, false))
  console.log('icons written to', OUT)
  app.quit()
})
