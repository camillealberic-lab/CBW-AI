// dicta-fullscreen : signale les écrans occupés par une app en plein écran (Space plein écran).
// Electron ne met pas à jour workArea en entrant dans le plein écran d'une autre app : la pastille resterait
// au-dessus d'un Dock absent. Ce helper sonde la liste des fenêtres (sans titre → aucun droit requis).
// Sortie (une ligne à chaque changement, flush immédiat) :
//   none                       aucun écran en plein écran
//   full x,y,w,h[;x,y,w,h…]    cadres (coordonnées écran, origine en haut à gauche) des écrans en plein écran
// Se termine quand stdin est fermé (process parent disparu).
// Build : scripts/build-fnwatch.sh (même SDK / cible que dicta-fnwatch).
import AppKit
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let me = ProcessInfo.processInfo.processIdentifier
var last = ""

func screensFrames() -> [CGRect] {
  // NSScreen : origine en bas à gauche de l'écran principal → conversion vers l'origine en haut à gauche (CG).
  guard let main = NSScreen.screens.first else { return [] }
  return NSScreen.screens.map { s in
    CGRect(x: s.frame.minX, y: main.frame.maxY - s.frame.maxY, width: s.frame.width, height: s.frame.height)
  }
}

func scan() {
  let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
  let list = (CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]]) ?? []
  let screens = screensFrames()
  var full: [CGRect] = []
  for w in list {
    guard (w[kCGWindowLayer as String] as? Int) == 0,
          (w[kCGWindowOwnerPID as String] as? Int32) != me,
          let d = w[kCGWindowBounds as String] as? NSDictionary,
          let r = CGRect(dictionaryRepresentation: d) else { continue }
    // Plein écran = la fenêtre prend toute la largeur et descend jusqu'au bas de l'écran (là où serait le Dock).
    // Sur les Mac à encoche, elle commence sous l'encoche (y ≈ 33) ; Chrome sépare sa barre d'onglets en
    // fenêtres à part, d'où « plus de la moitié de la hauteur » plutôt que « tout l'écran ».
    for s in screens where !full.contains(s) && abs(r.minX - s.minX) < 1 && abs(r.width - s.width) < 1
      && abs(r.maxY - s.maxY) < 1 && r.height > s.height / 2 {
      full.append(s)
    }
  }
  let out = full.isEmpty ? "none" : "full " + full.map {
    "\(Int($0.minX)),\(Int($0.minY)),\(Int($0.width)),\(Int($0.height))"
  }.joined(separator: ";")
  if out != last {
    last = out
    print(out)
    fflush(stdout)
  }
}

// stdin fermé → fin.
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in scan() }
scan()
RunLoop.main.run()
