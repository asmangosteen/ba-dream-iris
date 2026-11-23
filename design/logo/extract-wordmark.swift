// "Iris" 워드마크 글자 윤곽선 추출 (macOS CoreText)
// 실행: swift design/logo/extract-wordmark.swift ~/Library/Fonts/Pretendard-SemiBold.otf
// 결과: design/logo/wordmark-iris.json (generate.mjs가 읽어서 가로형 로고를 만듦)
// 좌표: 글자 크기 1000, 바닥선 y=0, 위쪽이 음수(SVG 방향). 커닝은 CoreText 조판 그대로.

import CoreText
import Foundation

let text = "Iris"
let size: CGFloat = 1000
let args = CommandLine.arguments
guard args.count > 1 else {
  print("폰트 경로를 넘겨주세요")
  exit(1)
}
let url = URL(fileURLWithPath: (args[1] as NSString).expandingTildeInPath)
guard let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], let desc = descs.first else {
  print("폰트를 읽지 못했어요")
  exit(1)
}
let font = CTFontCreateWithFontDescriptor(desc, size, nil)
let attr = NSAttributedString(string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: font])
let line = CTLineCreateWithAttributedString(attr)

func svgPath(_ path: CGPath) -> String {
  var d = ""
  let f = { (v: CGFloat) -> String in String(format: "%.2f", v) }
  path.applyWithBlock { el in
    let p = el.pointee.points
    switch el.pointee.type {
    case .moveToPoint: d += "M\(f(p[0].x)) \(f(-p[0].y))"
    case .addLineToPoint: d += "L\(f(p[0].x)) \(f(-p[0].y))"
    case .addQuadCurveToPoint: d += "Q\(f(p[0].x)) \(f(-p[0].y)) \(f(p[1].x)) \(f(-p[1].y))"
    case .addCurveToPoint: d += "C\(f(p[0].x)) \(f(-p[0].y)) \(f(p[1].x)) \(f(-p[1].y)) \(f(p[2].x)) \(f(-p[2].y))"
    case .closeSubpath: d += "Z"
    @unknown default: break
    }
  }
  return d
}

var glyphs: [[String: Any]] = []
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
  let n = CTRunGetGlyphCount(run)
  var gs = [CGGlyph](repeating: 0, count: n)
  var ps = [CGPoint](repeating: .zero, count: n)
  CTRunGetGlyphs(run, CFRange(location: 0, length: n), &gs)
  CTRunGetPositions(run, CFRange(location: 0, length: n), &ps)
  for i in 0..<n {
    guard let path = CTFontCreatePathForGlyph(font, gs[i], nil) else { continue }
    let b = path.boundingBoxOfPath
    glyphs.append([
      "x": Double(ps[i].x),
      "d": svgPath(path),
      "inkLeft": Double(b.minX),
      "inkRight": Double(b.maxX),
      "inkTop": Double(-b.maxY),
      "inkBottom": Double(-b.minY),
    ])
  }
}

let out: [String: Any] = [
  "text": text,
  "font": url.lastPathComponent,
  "size": Double(size),
  "capHeight": Double(CTFontGetCapHeight(font)),
  "glyphs": glyphs,
]
let data = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys])
let dest = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("wordmark-iris.json")
try data.write(to: dest)
print("저장: \(dest.path) · 글자 \(glyphs.count)개 · 대문자 높이 \(CTFontGetCapHeight(font))")
