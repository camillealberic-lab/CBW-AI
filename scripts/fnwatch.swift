// dicta-fnwatch : observe la touche de déclenchement via un CGEventTap en écoute seule.
//   --trigger fn     touche fn (🌐), keycode 63/179, flag maskSecondaryFn
//   --trigger lctrl  Control GAUCHE (keycode 59, flag NX_DEVICELCTLKEYMASK) — défaut ; fn reste libre
//   --trigger rctrl  Control DROITE (keycode 62, flag NX_DEVICERCTLKEYMASK)
// Sortie (une ligne par événement, flush immédiat) :
//   ready            tap installé
//   fn-down / fn-up  transitions de la touche de déclenchement (nom historique, quelle que soit la touche)
//   esc              Échap enfoncée
//   key              toute autre touche enfoncée
//   mouse-down N / mouse-up N   bouton de souris N (4 = précédent, 5 = suivant…) si activé par « mouse N » (stdin)
//   secure on [app] / secure off   saisie sécurisée (IsSecureEventInputEnabled) : champ mot de passe, etc. —
//                    le raccourci ne reçoit alors plus rien ; app = nom de l'app qui la maintient (si connue)
//   error no-access  ni Surveillance de l'entrée ni Accessibilité accordées (ou tap refusé) → code 2
// Options : --check (affiche « access ok|no », code 0|2) ; --request (demande « Surveillance de l'entrée »).
// TCC attribue l'accès au processus responsable : l'app Dicta AI qui lance ce binaire.
// Commandes sur stdin : « paste » → ⌘V natif (CGEvent, kCGHIDEventTap), répond « pasted » / « paste-failed ».
//   Le keycode de « V » est cherché dans la disposition courante (AZERTY, Dvorak, Colemak, russe→ASCII…), repli 9.
//   « mouse N » (N = 3..32, 0 = désactivé) : écoute le bouton de souris N et le retient (le clic « précédent »
//   n'agit plus dans les navigateurs) si l'accès Accessibilité le permet.
// --trigger none : aucune touche de déclenchement (seulement souris / saisie sécurisée / collage).
// --probe-v [idDisposition] : affiche « v N » (keycode de V pour la disposition donnée, ex. com.apple.keylayout.French), code 0.
// Se termine quand stdin est fermé (process parent disparu).
// Build : swiftc -O -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk scripts/fnwatch.swift -o vendor/bin/dicta-fnwatch
import ApplicationServices
import CoreGraphics
import AppKit
import Carbon.HIToolbox
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ s: String) {
  print(s)
  fflush(stdout)
}


// Keycode physique qui produit « v » sans modificateur dans la disposition donnée (ASCII si non latine).
// ⌘V est posté par ce keycode : en AZERTY / Dvorak / Colemak la touche « V » n'est pas toujours en 9 (kVK_ANSI_V).
func keycodeForV(layoutID: String? = nil) -> CGKeyCode {
  var source: TISInputSource? = nil
  if let id = layoutID {
    let list = TISCreateInputSourceList([kTISPropertyInputSourceID: id] as CFDictionary, true)?.takeRetainedValue() as? [TISInputSource]
    source = list?.first
  }
  if source == nil { source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue() }
  func data(_ s: TISInputSource) -> CFData? {
    guard let p = TISGetInputSourceProperty(s, kTISPropertyUnicodeKeyLayoutData) else { return nil }
    return Unmanaged<CFData>.fromOpaque(p).takeUnretainedValue()
  }
  var layoutData = source.flatMap(data)
  if layoutData == nil, let ascii = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?.takeRetainedValue() {
    layoutData = data(ascii)
  }
  guard let ld = layoutData, let bytes = CFDataGetBytePtr(ld) else { return 9 }
  let layout = UnsafeRawPointer(bytes).assumingMemoryBound(to: UCKeyboardLayout.self)
  func char(_ code: UInt16, cmd: Bool = false) -> String? {
    var dead: UInt32 = 0
    var len = 0
    var chars = [UniChar](repeating: 0, count: 4)
    let r = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), cmd ? UInt32(cmdKey >> 8) : 0, UInt32(LMGetKbdType()),
      OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, 4, &len, &chars)
    return r == noErr && len > 0 ? String(utf16CodeUnits: chars, count: len).lowercased() : nil
  }
  // Avec ⌘ d'abord (« Dvorak – QWERTY ⌘ » garde V en 9 pour les raccourcis), puis sans modificateur.
  for cmd in [true, false] {
    if char(9, cmd: cmd) == "v" { return 9 }  // cas courant (QWERTY, AZERTY, QWERTZ) : keycode ANSI vérifié
    for code in UInt16(0)..<UInt16(128) where char(code, cmd: cmd) == "v" { return CGKeyCode(code) }
  }
  return 9
}

if let i = CommandLine.arguments.firstIndex(of: "--probe-v") {
  let id = i + 1 < CommandLine.arguments.count ? CommandLine.arguments[i + 1] : nil
  emit("v \(keycodeForV(layoutID: id))")
  exit(0)
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
var mouseTapRef: CFMachPort?
/// Bouton de souris suivi (numéro « humain » : 4 = précédent, 5 = suivant ; 0 = aucun). Écrit par le thread stdin.
var mouseButton: Int = 0
var mouseIsDown = false

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
    if trigger == "none" {
      emit("mod")
    } else if isTrigger {
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

// Bouton de souris : tap actif (retient le clic) si l'Accessibilité est accordée, sinon écoute seule (le clic passe aussi).
let mouseMask: CGEventMask = (1 << CGEventType.otherMouseDown.rawValue) | (1 << CGEventType.otherMouseUp.rawValue)
let mouseCallback: CGEventTapCallBack = { _, type, event, _ in
  switch type {
  case .tapDisabledByTimeout, .tapDisabledByUserInput:
    if let t = mouseTapRef { CGEvent.tapEnable(tap: t, enable: true) }
  case .otherMouseDown, .otherMouseUp:
    let n = Int(event.getIntegerValueField(.mouseEventButtonNumber)) + 1  // 0-based → « bouton 4 » = 3
    let want = mouseButton
    guard want >= 4, n == want else { return Unmanaged.passUnretained(event) }
    let down = type == .otherMouseDown
    if down != mouseIsDown {
      mouseIsDown = down
      emit(down ? "mouse-down \(n)" : "mouse-up \(n)")
    }
    if AXIsProcessTrusted() { return nil }  // tap actif : le clic n'atteint pas l'app
  default:
    break
  }
  return Unmanaged.passUnretained(event)
}
func installMouseTap() {
  if mouseTapRef != nil { return }
  let opts: CGEventTapOptions = AXIsProcessTrusted() ? .defaultTap : .listenOnly
  guard let t = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: opts,
    eventsOfInterest: mouseMask, callback: mouseCallback, userInfo: nil) else { return }
  mouseTapRef = t
  CFRunLoopAddSource(CFRunLoopGetCurrent(), CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0), .commonModes)
  CGEvent.tapEnable(tap: t, enable: true)
}

// Saisie sécurisée : sondée une fois par seconde, signalée seulement quand elle change.
var secureOn = false
func secureOwner() -> String {
  guard let d = CGSessionCopyCurrentDictionary() as? [String: Any],
    let pid = d["kCGSSessionSecureInputPID"] as? Int,
    let name = NSRunningApplication(processIdentifier: pid_t(pid))?.localizedName
  else { return "" }
  return " " + name.replacingOccurrences(of: "\n", with: " ")
}
func pollSecure() {
  let on = IsSecureEventInputEnabled()
  if on != secureOn {
    secureOn = on
    emit(on ? "secure on" + secureOwner() : "secure off")
  }
}
pollSecure()
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in pollSecure() }

func pasteCmdV() -> Bool {
  let src = CGEventSource(stateID: .combinedSessionState)
  // keycode de « V » dans la disposition courante (9 = kVK_ANSI_V si la touche y produit « v ») ;
  // appelé sur le thread principal (TIS l'exige) ; flags explicites pour ignorer les modificateurs encore enfoncés (fn…)
  let vk = keycodeForV()
  guard let down = CGEvent(keyboardEventSource: src, virtualKey: vk, keyDown: true),
    let up = CGEvent(keyboardEventSource: src, virtualKey: vk, keyDown: false)
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
    if line == "paste" {
      var ok = false
      DispatchQueue.main.sync { ok = pasteCmdV() }
      emit(ok ? "pasted" : "paste-failed")
    } else if line.hasPrefix("mouse ") {
      let n = Int(line.dropFirst(6).trimmingCharacters(in: .whitespaces)) ?? 0
      DispatchQueue.main.async {
        mouseButton = (n >= 4 && n <= 32) ? n : 0
        mouseIsDown = false
        if mouseButton > 0 { installMouseTap() }
      }
    }
  }
  exit(0)
}
CFRunLoopRun()
