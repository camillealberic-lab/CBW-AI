// dicta-fnwatch : observe la touche de déclenchement via un CGEventTap en écoute seule.
//   --trigger fn     touche fn (🌐), keycode 63/179, flag maskSecondaryFn
//   --trigger lctrl  Control GAUCHE (keycode 59, flag NX_DEVICELCTLKEYMASK) — défaut ; fn reste libre
//   --trigger rctrl  Control DROITE (keycode 62, flag NX_DEVICERCTLKEYMASK)
// Sortie (une ligne par événement, flush immédiat) :
//   ready            tap installé
//   fn-down / fn-up  transitions de la touche de déclenchement (nom historique, quelle que soit la touche)
//   esc              Échap enfoncée
//   key              toute autre touche enfoncée
//   error no-access  ni Surveillance de l'entrée ni Accessibilité accordées (ou tap refusé) → code 2
// Options : --check (affiche « access ok|no », code 0|2) ; --request (demande « Surveillance de l'entrée »).
// TCC attribue l'accès au processus responsable : l'app Dicta AI qui lance ce binaire.
// Commandes sur stdin : « paste » → ⌘V natif (CGEvent, kCGHIDEventTap), répond « pasted » / « paste-failed ».
// Se termine quand stdin est fermé (process parent disparu).
// Build : swiftc -O -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk scripts/fnwatch.swift -o vendor/bin/dicta-fnwatch
import ApplicationServices
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ s: String) {
  print(s)
  fflush(stdout)
}

// Un tap « listenOnly » se crée même sans droit, mais ne reçoit alors rien : on vérifie avant.
func hasAccess() -> Bool { CGPreflightListenEventAccess() || AXIsProcessTrusted() }

if CommandLine.arguments.contains("--request") {
  let ok = CGRequestListenEventAccess()
  emit(ok ? "access ok" : "access no")
  exit(ok ? 0 : 2)
}
if CommandLine.arguments.contains("--check") {
  let ok = hasAccess()
  emit(ok ? "access ok" : "access no")
  exit(ok ? 0 : 2)
}
if !hasAccess() {
  emit("error no-access")
  exit(2)
}

var fnDown = false
let args = CommandLine.arguments
let trigger: String = {
  if let i = args.firstIndex(of: "--trigger"), i + 1 < args.count { return args[i + 1] }
  return "lctrl"
}()
let NX_DEVICELCTLKEYMASK: UInt64 = 0x0001
let NX_DEVICERCTLKEYMASK: UInt64 = 0x2000
let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
var tapRef: CFMachPort?

let callback: CGEventTapCallBack = { _, type, event, _ in
  switch type {
  case .tapDisabledByTimeout, .tapDisabledByUserInput:
    if let t = tapRef { CGEvent.tapEnable(tap: t, enable: true) }
  case .flagsChanged:
    let code = event.getIntegerValueField(.keyboardEventKeycode)
    let isTrigger: Bool
    let down: Bool
    if trigger == "fn" {
      // keycode 63 = fn ; les flèches/F-keys portent aussi maskSecondaryFn mais pas via flagsChanged.
      isTrigger = code == 63 || code == 179
      down = event.flags.contains(.maskSecondaryFn)
    } else if trigger == "rctrl" {
      // keycode 62 = Control droite ; le bit « device » distingue la droite de la gauche.
      isTrigger = code == 62
      down = (event.flags.rawValue & NX_DEVICERCTLKEYMASK) != 0
    } else {
      // keycode 59 = Control gauche.
      isTrigger = code == 59
      down = (event.flags.rawValue & NX_DEVICELCTLKEYMASK) != 0
    }
    if isTrigger {
      if down != fnDown {
        fnDown = down
        emit(down ? "fn-down" : "fn-up")
      }
    } else {
      emit("mod")
    }
  case .keyDown:
    let code = event.getIntegerValueField(.keyboardEventKeycode)
    if event.getIntegerValueField(.keyboardEventAutorepeat) == 0 { emit(code == 53 ? "esc" : "key") }
  default:
    break
  }
  return Unmanaged.passUnretained(event)
}

guard
  let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
    eventsOfInterest: mask, callback: callback, userInfo: nil)
else {
  emit("error no-access")
  exit(2)
}
tapRef = tap
let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
emit("ready")

func pasteCmdV() -> Bool {
  let src = CGEventSource(stateID: .combinedSessionState)
  // 9 = kVK_ANSI_V ; flags explicites pour ignorer les modificateurs encore enfoncés (fn…)
  guard let down = CGEvent(keyboardEventSource: src, virtualKey: 9, keyDown: true),
    let up = CGEvent(keyboardEventSource: src, virtualKey: 9, keyDown: false)
  else { return false }
  down.flags = .maskCommand
  up.flags = .maskCommand
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  return true
}

// Commandes du parent ; quitte quand il ferme stdin.
DispatchQueue.global().async {
  while let line = readLine(strippingNewline: true) {
    if line == "paste" { emit(pasteCmdV() ? "pasted" : "paste-failed") }
  }
  exit(0)
}
CFRunLoopRun()
