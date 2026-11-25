// 크기별 SVG 파일 · 서비스용 사전 · 미리보기 만들기
// 1) 피그마 Iris Editor Icons 의 묶음(Group) 프레임을 SVG 로 내려받아 <exp>/w<노드 번호 뒷자리>.svg 로 저장(offsets.json 의 키와 같은 노드)
// 2) node scripts/icons/slice.mjs <exp> <exp>/icons24.json
// 3) node scripts/icons/publish.mjs <repo> <exp>/icons24.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const [repo, iconsPath] = process.argv.slice(2)
const here = path.dirname(fileURLToPath(import.meta.url))
const icons = JSON.parse(fs.readFileSync(iconsPath, 'utf8'))
const offsets = JSON.parse(fs.readFileSync(path.join(here, 'offsets.json'), 'utf8'))
const GROUP = { '3710:16': '툴바 도구', '3710:19': '레이어 목록 · 종류', '3710:22': '공통 아이콘', '3710:25': '정렬 · 위치', '3710:28': '오토 레이아웃', '3710:31': '불리언 · 점 편집', '3710:34': '선(Stroke)', '3710:37': '효과(Effects)', '3710:40': '레이아웃 격자', '3710:43': '홈 · 프로젝트', '3710:46': '위 탭', '3710:49': '칠 창', '3710:55': '프레임 패널', '3710:64': '레이어 패널', '3710:67': '스타일 만들기', '3710:70': '글자 세부 설정' }
const labels = JSON.parse(fs.readFileSync(path.join(here, 'labels.json'), 'utf8'))
const SIZES = [24, 20, 16, 12]
const out = path.join(repo, 'PRD/icons')
for (const s of SIZES) fs.mkdirSync(path.join(out, String(s)), { recursive: true })
const names = Object.keys(icons).sort()
for (const n of names) for (const s of SIZES)
  fs.writeFileSync(path.join(out, String(s), n + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">${icons[n]}</svg>\n`)
// 서비스용 사전
const ts = `// 자동 생성 — PRD/icons 와 같은 아이콘(24 그리드, 면으로 그린 선 2px, currentColor). 손으로 고치지 말고 피그마에서 고친 뒤 다시 뽑아요.\n// 피그마: 바드림 Design System · Iconography · "Iris Editor Icons"\nexport const IRIS_ICONS: Record<string, string> = {\n${names.map((n) => `  ${n}: '${icons[n].replace(/'/g, "\\'")}',`).join('\n')}\n}\n`
fs.writeFileSync(path.join(repo, 'app/components/editor/irisIcons.ts'), ts)
// 문서 표
const byGroup = {}
for (const [wid, list] of Object.entries(offsets)) for (const [n] of list) { const g = GROUP[wid]; (byGroup[g] ??= []); if (!Object.values(byGroup).some((a) => a.includes(n))) byGroup[g].push(n) }
let md = ''
for (const [g, list] of Object.entries(byGroup)) { if (!list.length) continue; md += `\n### ${g}\n\n| 이름 | 뜻 |\n|---|---|\n` + list.map((n) => `| \`${n}\` | ${labels[n] || '—'} |`).join('\n') + '\n' }
fs.writeFileSync(path.join(path.dirname(iconsPath), 'table.md'), md)
// 미리보기 HTML
const cell = (n) => `<figure><div>${SIZES.map((s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${icons[n]}</svg>`).join('')}</div><figcaption><b>${n}</b><span>${labels[n] || ''}</span></figcaption></figure>`
const html = `<!doctype html><meta charset="utf-8"><title>Iris 편집기 아이콘</title><style>body{font-family:Pretendard,system-ui,sans-serif;margin:32px;color:#202837;background:#fff}h1{font-size:20px;margin:0 0 4px}p{color:#6B7280;font-size:13px;margin:0 0 24px}h2{font-size:14px;margin:28px 0 12px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}figure{margin:0;padding:12px;border:1px solid #EEF0F3;border-radius:10px}figure div{display:flex;align-items:flex-end;gap:12px;height:28px}figcaption{display:flex;flex-direction:column;gap:2px;margin-top:10px;font-size:12px}figcaption b{font-weight:600}figcaption span{color:#6B7280}</style><h1>Iris 편집기 아이콘</h1><p>${names.length}개 · 24 그리드 · 크기 24 / 20 / 16 / 12 · 파일: PRD/icons/&lt;크기&gt;/&lt;이름&gt;.svg</p>${Object.entries(byGroup).filter(([, l]) => l.length).map(([g, l]) => `<h2>${g}</h2><section>${l.map(cell).join('')}</section>`).join('')}`
fs.writeFileSync(path.join(repo, 'PRD/icons/index.html'), html)
console.log('names', names.length, 'files', names.length * SIZES.length)
