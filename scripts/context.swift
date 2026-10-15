// dicta-context : lit le contexte de l'app active via l'Accessibilité (sans capture d'écran).
// Protocole : une requête JSON par ligne sur stdin, une réponse JSON par ligne sur stdout (même "id").
//   {"id":1,"cmd":"snapshot","budgetMs":150,"exclude":["com.exemple.app"]}
//     → {"id":1,"ok":true,"app":"Slack","bundleId":"…","pid":123,"url":"linear.app"?,
//        "title":"…","focused":"≤2000 car. autour du curseur","visible":"≤6000 car.","secure":false,"ms":42}
//     (+ "before":"≤300 car. avant le curseur" — raccord de majuscule, jamais journalisé)
//   {"id":3,"cmd":"selected-text"} → {"id":3,"ok":true,…,"selected":"≤20000 car. sélectionnés (AXSelectedText)"}
//   {"id":2,"cmd":"focused-value","budgetMs":150}
//     → {"id":2,"ok":true,"app":…,"bundleId":…,"pid":…,"value":"≤20000 car. autour du curseur","secure":false}
// Apps exclues (gestionnaires de mots de passe + liste "exclude") et champs sécurisés (AXSecureTextField) :
// {"ok":true,"excluded":true,…} sans aucun texte. Sans droit d'Accessibilité : {"ok":false,"error":"no-access"}.
// Le texte lu n'est jamais écrit sur stderr ni journalisé. Se termine à la fermeture de stdin.
// Build : scripts/build-fnwatch.sh (même SDK / cible que dicta-fnwatch).
import AppKit
import ApplicationServices
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

let alwaysExcluded: Set<String> = [
  "com.1password.1password", "com.1password.1password7", "com.agilebits.onepassword7", "com.agilebits.onepassword-osx",
  "com.bitwarden.desktop", "com.apple.keychainaccess", "com.apple.Passwords", "org.keepassxc.keepassxc",
  "com.lastpass.lastpass", "com.dashlane.dashlanephonefinal", "com.enpass.Enpass", "in.sinew.Enpass-Desktop",
]
let browsers: Set<String> = [
  "com.apple.Safari", "com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.canary", "company.thebrowser.Browser",
  "com.microsoft.edgemac", "com.brave.Browser", "com.vivaldi.Vivaldi", "com.operasoftware.Opera", "org.mozilla.firefox",
]

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? (v as AnyObject?) : nil
}
func str(_ el: AXUIElement, _ name: String) -> String? { attr(el, name) as? String }
func elem(_ el: AXUIElement, _ name: String) -> AXUIElement? {
  guard let v = attr(el, name), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
  return (v as! AXUIElement)
}

/// ≤ `limit` caractères (unités UTF-16) autour de `loc`.
func around(_ s: String, _ loc: Int, _ limit: Int) -> String {
  let ns = s as NSString
  if ns.length <= limit { return s }
  var start = max(0, loc - limit / 2)
  let end = min(ns.length, start + limit)
  start = max(0, end - limit)
  return ns.substring(with: NSRange(location: start, length: end - start))
}

func cursorLoc(_ el: AXUIElement) -> Int {
  guard let r = attr(el, kAXSelectedTextRangeAttribute as String), CFGetTypeID(r) == AXValueGetTypeID() else { return 0 }
  var range = CFRange()
  return AXValueGetValue(r as! AXValue, .cfRange, &range) ? range.location : 0
}

var manualDone = Set<pid_t>()
func hostOf(_ s: String) -> String? {
  guard let h = URL(string: s)?.host, !h.isEmpty else { return nil }
  return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
}

struct Front {
  let pid: pid_t
  let app: String
  let bundleId: String
  let el: AXUIElement
}
func front() -> Front? {
  // Voie directe : app frontale (NSWorkspace) ; repli : élément système « application focalisée ».
  var pid: pid_t = 0
  var a: AXUIElement?
  if let fa = NSWorkspace.shared.frontmostApplication { pid = fa.processIdentifier; a = AXUIElementCreateApplication(pid) }
  if a == nil {
    let sys = AXUIElementCreateSystemWide()
    AXUIElementSetMessagingTimeout(sys, 0.08)
    a = elem(sys, kAXFocusedApplicationAttribute as String)
    if let x = a { AXUIElementGetPid(x, &pid) }
  }
  guard let app = a else { return nil }
  let ra = NSRunningApplication(processIdentifier: pid)
  AXUIElementSetMessagingTimeout(app, 0.08)
  return Front(pid: pid, app: ra?.localizedName ?? "", bundleId: ra?.bundleIdentifier ?? "", el: app)
}

func isSecure(_ el: AXUIElement) -> Bool {
  let sub = str(el, kAXSubroleAttribute as String) ?? ""
  let role = str(el, kAXRoleAttribute as String) ?? ""
  return sub == "AXSecureTextField" || role == "AXSecureTextField"
}

func handle(_ req: [String: Any]) -> [String: Any] {
  var out: [String: Any] = ["id": req["id"] ?? NSNull()]
  let t0 = Date()
  guard AXIsProcessTrusted() else { out["ok"] = false; out["error"] = "no-access"; return out }
  guard let f = front() else { out["ok"] = false; out["error"] = "no-app"; return out }
  out["ok"] = true
  out["app"] = f.app
  out["bundleId"] = f.bundleId
  out["pid"] = Int(f.pid)
  let extra = Set((req["exclude"] as? [String]) ?? [])
  if alwaysExcluded.contains(f.bundleId) || extra.contains(f.bundleId) { out["excluded"] = true; return out }
  let budget = Double((req["budgetMs"] as? Int) ?? 150) / 1000
  let deadline = t0.addingTimeInterval(budget)
  // Apps Electron / Chromium : l'arbre d'accessibilité n'est exposé qu'après ce drapeau.
  if !manualDone.contains(f.pid) {
    manualDone.insert(f.pid)
    AXUIElementSetAttributeValue(f.el, "AXManualAccessibility" as CFString, kCFBooleanTrue)
  }
  let focus = elem(f.el, kAXFocusedUIElementAttribute as String)
  if let fo = focus, isSecure(fo) { out["secure"] = true; out["excluded"] = true; return out }
  out["secure"] = false

  if req["cmd"] as? String == "focused-value" {
    if let fo = focus, let v = str(fo, kAXValueAttribute as String) { out["value"] = around(v, cursorLoc(fo), 20000) }
    out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
    return out
  }

  if req["cmd"] as? String == "selected-text" {
    if let fo = focus, let v = str(fo, kAXSelectedTextAttribute as String) { out["selected"] = String(v.prefix(20000)) }
    out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
    return out
  }

  // snapshot
  let win = elem(f.el, kAXFocusedWindowAttribute as String)
  if let w = win {
    AXUIElementSetMessagingTimeout(w, 0.08)
    if let t = str(w, kAXTitleAttribute as String) { out["title"] = String(t.prefix(300)) }
    if browsers.contains(f.bundleId), let d = str(w, kAXDocumentAttribute as String), let h = hostOf(d) { out["url"] = h }
  }
  if let fo = focus, let v = str(fo, kAXValueAttribute as String) {
    out["focused"] = around(v, cursorLoc(fo), 2000)
    let ns = v as NSString
    let loc = min(max(0, cursorLoc(fo)), ns.length)
    let st = max(0, loc - 300)
    out["before"] = ns.substring(with: NSRange(location: st, length: loc - st))
  }

  // Textes visibles de la fenêtre active : parcours en largeur borné par le temps.
  var visible = ""
  if let w = win {
    var queue: [AXUIElement] = [w]
    var i = 0
    var seen = 0
    while i < queue.count && Date() < deadline && visible.count < 6000 && seen < 1500 {
      let e = queue[i]; i += 1; seen += 1
      let role = str(e, kAXRoleAttribute as String) ?? ""
      if role == "AXStaticText" || role == "AXLink" || role == "AXHeading" {
        if let v = str(e, kAXValueAttribute as String) ?? str(e, kAXTitleAttribute as String), !v.isEmpty {
          visible += v + "\n"
        }
      } else if role == "AXWebArea", browsers.contains(f.bundleId), out["url"] == nil,
                let u = attr(e, kAXURLAttribute as String), let h = hostOf("\(u)") {
        out["url"] = h
      }
      if role == "AXSecureTextField" || role == "AXMenuBar" { continue }
      if let kids = attr(e, kAXChildrenAttribute as String) as? [AXUIElement] { queue.append(contentsOf: kids.prefix(200)) }
    }
  }
  out["visible"] = String(visible.prefix(6000))
  out["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
  return out
}

while let line = readLine() {
  guard let d = line.data(using: .utf8), let req = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else {
    print("{\"ok\":false,\"error\":\"bad-request\"}")
    continue
  }
  let res = handle(req)
  if let data = try? JSONSerialization.data(withJSONObject: res), let s = String(data: data, encoding: .utf8) { print(s) }
}
