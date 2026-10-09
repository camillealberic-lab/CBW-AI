// Fond de la fenêtre DMG (540×380 pt) : build/dmg-bg.png + build/dmg-bg@2x.png → build/background.tiff
// Icônes placées par electron-builder (package.json › build.dmg.contents) : app en (140,190), Applications en (400,190).
import AppKit

let W: CGFloat = 540, H: CGFloat = 380
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "build"

func hex(_ v: UInt32, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: a)
}

func render(scale: CGFloat, to path: String) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W * scale), pixelsHigh: Int(H * scale),
                             bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: W, height: H) // 72 dpi pour 1×, 144 dpi pour 2×
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  // fond clair + bandeau doux
  hex(0xFFFFFF).setFill(); NSRect(x: 0, y: 0, width: W, height: H).fill()
  hex(0xF6F6F9).setFill(); NSRect(x: 0, y: 0, width: W, height: 92).fill()
  hex(0xE4E4EC).setFill(); NSRect(x: 0, y: 92, width: W, height: 1).fill()

  let center = NSMutableParagraphStyle(); center.alignment = .center
  let title: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 20, weight: .semibold), .foregroundColor: hex(0x14141F), .paragraphStyle: center]
  ("Installer CBW AI" as NSString).draw(in: NSRect(x: 0, y: H - 62, width: W, height: 28), withAttributes: title)
  let sub: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 13), .foregroundColor: hex(0x6B6B7B), .paragraphStyle: center]
  ("Glisse l’icône dans le dossier Applications" as NSString).draw(in: NSRect(x: 0, y: H - 86, width: W, height: 20), withAttributes: sub)
  let foot: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: hex(0x6B6B7B), .paragraphStyle: center]
  // macOS 15+ : « Élément non ouvert » → Terminé, puis Réglages › Confidentialité et sécurité › Ouvrir quand même
  let hint: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: hex(0x14141F), .paragraphStyle: center]
  ("1er lancement : Réglages › Confidentialité › Ouvrir quand même" as NSString).draw(in: NSRect(x: 0, y: 36, width: W, height: 16), withAttributes: hint)
  ("Dictée vocale locale · Apple Silicon" as NSString).draw(in: NSRect(x: 0, y: 18, width: W, height: 16), withAttributes: foot)

  // flèche app → Applications (y DMG 190 depuis le haut → 190 depuis le bas en AppKit)
  let y = H - 190
  let arrow = NSBezierPath()
  arrow.move(to: NSPoint(x: 215, y: y)); arrow.line(to: NSPoint(x: 318, y: y))
  arrow.lineWidth = 3; arrow.lineCapStyle = .round
  hex(0x4B3CF0).setStroke(); arrow.stroke()
  let head = NSBezierPath()
  head.move(to: NSPoint(x: 330, y: y)); head.line(to: NSPoint(x: 314, y: y + 9)); head.line(to: NSPoint(x: 314, y: y - 9)); head.close()
  hex(0x4B3CF0).setFill(); head.fill()
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

render(scale: 1, to: "\(out)/dmg-bg.png")
render(scale: 2, to: "\(out)/dmg-bg@2x.png")
print("✓ \(out)/dmg-bg.png (+@2x)")
