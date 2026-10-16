// dicta-callwatch : détecte qu'une AUTRE app utilise le micro (appel en cours), sans capturer d'audio.
// CoreAudio : kAudioDevicePropertyDeviceIsRunningSomewhere (périphériques d'entrée) + processus qui
// ouvrent l'entrée (macOS 14+ : kAudioHardwarePropertyProcessObjectList / kAudioProcessPropertyIsRunningInput).
// CBW AI (com.dicta-ai.app et ses helpers) et ce processus sont exclus.
// Sortie (une ligne JSON par changement, flush immédiat) :
//   {"event":"mic-on","bundleId":"us.zoom.xos","app":"zoom.us"}   (bundleId/app absents si inconnus)
//   {"event":"mic-off"}
// Se termine quand stdin est fermé. Build : scripts/build-fnwatch.sh.
import AppKit
import CoreAudio
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let me = ProcessInfo.processInfo.processIdentifier
let selfPrefix = "com.dicta-ai.app"

func addr(_ s: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: s, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func ids(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> [AudioObjectID] {
  var a = addr(sel)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(obj, &a, 0, nil, &size) == noErr, size > 0 else { return [] }
  var out = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  guard AudioObjectGetPropertyData(obj, &a, 0, nil, &size, &out) == noErr else { return [] }
  return out
}

func u32(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32? {
  var a = addr(sel, scope)
  var v: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(obj, &a, 0, nil, &size, &v) == noErr ? v : nil
}

func hasInput(_ dev: AudioObjectID) -> Bool {
  var a = addr(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput)
  var size: UInt32 = 0
  return AudioObjectGetPropertyDataSize(dev, &a, 0, nil, &size) == noErr && size > 0
}

/// Un périphérique d'entrée est-il ouvert par quelqu'un (n'importe quelle app, CBW AI compris) ?
func deviceRunning() -> Bool {
  ids(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices)
    .filter(hasInput).contains { (u32($0, kAudioDevicePropertyDeviceIsRunningSomewhere) ?? 0) != 0 }
}

func bundleID(_ obj: AudioObjectID) -> String? {
  var a = addr(kAudioProcessPropertyBundleID)
  var size = UInt32(MemoryLayout<CFString?>.size)
  var s: Unmanaged<CFString>?
  guard AudioObjectGetPropertyData(obj, &a, 0, nil, &size, &s) == noErr, let v = s else { return nil }
  return v.takeRetainedValue() as String
}

struct Proc: Equatable { var bundleId: String?; var app: String? }

/// Processus (hors CBW AI) qui utilisent l'entrée. nil = liste indisponible.
func inputProcesses() -> [Proc]? {
  let list = ids(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList)
  if list.isEmpty { return nil }
  var out: [Proc] = []
  for o in list {
    guard (u32(o, kAudioProcessPropertyIsRunningInput) ?? 0) != 0 else { continue }
    if let pid = u32(o, kAudioProcessPropertyPID), pid_t(pid) == me { continue }
    let b = bundleID(o)
    if let b = b, b.hasPrefix(selfPrefix) { continue }
    var name: String?
    if let b = b {
      // Les helpers d'un navigateur (com.google.Chrome.helper…) : on remonte à l'app parente.
      let apps = NSRunningApplication.runningApplications(withBundleIdentifier: b)
      name = apps.first?.localizedName
    }
    out.append(Proc(bundleId: b, app: name))
  }
  return out
}

var last = ""
func emit(_ obj: [String: String]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
  fflush(stdout)
}

func scan() {
  var state: [String: String]
  if let procs = inputProcesses() {
    if let p = procs.first {
      state = ["event": "mic-on"]
      if let b = p.bundleId { state["bundleId"] = b }
      if let a = p.app { state["app"] = a }
    } else { state = ["event": "mic-off"] }
  } else {
    // API processus indisponible : repli sur le périphérique (peut inclure CBW AI ; le module JS filtre).
    state = deviceRunning() ? ["event": "mic-on"] : ["event": "mic-off"]
  }
  let key = state.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "|")
  if key != last { last = key; emit(state) }
}

if CommandLine.arguments.contains("--devices") {
  for d in ids(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices) where hasInput(d) {
    print("input device \(d) running=\(u32(d, kAudioDevicePropertyDeviceIsRunningSomewhere) ?? 0)")
  }
  print("processes=\(inputProcesses()?.count ?? -1)")
  exit(0)
}

// Fin quand le parent ferme stdin.
DispatchQueue.global().async {
  while FileHandle.standardInput.availableData.count > 0 {}
  exit(0)
}
scan()
let timer = Timer(timeInterval: 1.0, repeats: true) { _ in scan() }
RunLoop.main.add(timer, forMode: .common)
RunLoop.main.run()
