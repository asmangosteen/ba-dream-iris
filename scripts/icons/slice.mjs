// 묶음 SVG 에서 아이콘마다 잘라 24 칸 좌표로 옮겨요: node scripts/icons/slice.mjs <exp dir> <out.json>
// <exp dir> 에 w16.svg … 와 offsets.json(이 폴더 것을 복사) 이 있어야 해요
import fs from 'node:fs'
const [dir, out] = process.argv.slice(2)
const offsets = JSON.parse(fs.readFileSync(`${dir}/offsets.json`, 'utf8'))
const r3 = (v) => String(Math.round(v * 1000) / 1000)
function shift(d, ox, oy) {
  const toks = d.match(/[A-Za-z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g)
  let out = '', cmd = '', idx = 0, first = true
  const ARGS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }
  for (let i = 0; i < toks.length; ) {
    const t = toks[i]
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; out += t; idx = 0; if (cmd.toUpperCase() === 'Z') continue }
    if (cmd !== cmd.toUpperCase() && !(first && cmd === 'm')) throw new Error('relative command ' + cmd)
    const U = cmd.toUpperCase(); const n = ARGS[U]
    for (let k = 0; k < n; k++, i++) {
      let v = Number(toks[i]); const pos = k
      if (U === 'H') v -= ox
      else if (U === 'V') v -= oy
      else if (U === 'A') { if (pos === 5) v -= ox; if (pos === 6) v -= oy }
      else v -= pos % 2 === 0 ? ox : oy
      out += (k ? ' ' : '') + r3(v)
    }
    out += ' '; first = false
  }
  return out.replace(/ ([A-Za-z])/g, '$1').trim()
}
const icons = {}
for (const [wid, list] of Object.entries(offsets)) {
  const f = `${dir}/w${wid.split(':')[1]}.svg`
  const src = fs.readFileSync(f, 'utf8')
  const seenCount = {}
  for (const [name, ox, oy] of list) {
    const key = `<g id="Icon / Default / 24px / ${name}"`
    let at = -1, n = seenCount[name] = (seenCount[name] ?? 0) + 1
    for (let k = 0; k < n; k++) at = src.indexOf(key, at + 1)
    if (at < 0) throw new Error('missing ' + name + ' in ' + f)
    // 같은 깊이의 </g> 까지
    let i = src.indexOf('>', at) + 1, depth = 1
    const re = /<g\b[^>]*?(\/)?>|<\/g>/g; re.lastIndex = i
    let m, end = -1
    while ((m = re.exec(src))) { if (m[0] === '</g>') { depth--; if (!depth) { end = m.index; break } } else if (!m[1]) depth++ }
    const inner = src.slice(i, end)
    const parts = []
    for (const pm of inner.matchAll(/<path\b([^>]*?)\/?>/g)) {
      const a = Object.fromEntries([...pm[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]))
      if (!a.d) continue
      const attrs = [`d="${shift(a.d, ox, oy)}"`]
      if (a['fill-rule']) attrs.push(`fill-rule="${a['fill-rule']}"`)
      if (a['clip-rule']) attrs.push(`clip-rule="${a['clip-rule']}"`)
      if (a.opacity && a.opacity !== '1') attrs.push(`opacity="${a.opacity}"`)
      if (a['fill-opacity'] && a['fill-opacity'] !== '1') attrs.push(`fill-opacity="${a['fill-opacity']}"`)
      parts.push(`<path ${attrs.join(' ')} fill="currentColor"/>`)
    }
    if (/<(rect|circle|ellipse|line|polyline|polygon)\b/.test(inner)) console.warn('non-path shape in', name)
    if (!parts.length) throw new Error('empty ' + name)
    if (!icons[name]) icons[name] = parts.join('')
  }
}
fs.writeFileSync(out, JSON.stringify(icons, null, 1))
console.log('icons', Object.keys(icons).length)
