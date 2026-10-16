// dicta-meeting — helper natif (FluidAudio) : transcription Parakeet TDT v3 + diarisation hors ligne.
//   dicta-meeting transcribe <wav> [--lang fr]
//   dicta-meeting diarize <wav> [--speakers N] [--threshold 0.6] [--fa 0.07] [--fb 0.8] [--min-speakers N] [--max-speakers N] [--embeddings]
//   dicta-meeting stream [--chunk 15]   (PCM s16le 16 kHz mono sur stdin -> une ligne JSON par bloc)
//   dicta-meeting prepare                (charge les modèles déjà présents = échauffement Core ML ; avec --online : les télécharge)
// Sortie : JSON sur stdout (une seule ligne, ou NDJSON pour stream). Journaux/erreurs sur stderr, jamais de texte de réunion.
import Foundation
import FluidAudio

let modelsRoot: URL = {
    if let p = ProcessInfo.processInfo.environment["DICTA_MEETING_MODELS"], !p.isEmpty { return URL(fileURLWithPath: p) }
    return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dicta-ai/models/fluid", isDirectory: true)
}()

func emit(_ obj: Any) {
    let d = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    FileHandle.standardOutput.write(d); FileHandle.standardOutput.write(Data("\n".utf8))
}
func fail(_ msg: String, code: Int32 = 1) -> Never {
    emit(["error": msg]); FileHandle.standardError.write(Data((msg + "\n").utf8)); exit(code)
}
func now() -> Double { Date().timeIntervalSince1970 }
func r3(_ x: Double) -> Double { (x * 1000).rounded() / 1000 }

var args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else { fail("usage: dicta-meeting transcribe|diarize|stream|prepare", code: 2) }
args.removeFirst()
func opt(_ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}
func flag(_ name: String) -> Bool { args.contains(name) }
// Jamais de réseau en réunion : les modèles sont téléchargés et vérifiés (SHA-256) par l'app (fluidModels.ts).
// `--online` (ou DICTA_MEETING_ONLINE=1) rétablit le téléchargement FluidAudio, pour les essais en ligne de commande.
if !flag("--online") && ProcessInfo.processInfo.environment["DICTA_MEETING_ONLINE"] != "1" { ModelHub.offlineMode = true }

func loadAsr() async throws -> (AsrManager, Double) {
    let t0 = now()
    let models = try await AsrModels.downloadAndLoad(to: modelsRoot.appendingPathComponent("parakeet-v3"), version: .v3)
    let mgr = AsrManager(config: .default)
    try await mgr.loadModels(models)
    return (mgr, now() - t0)
}

func asrJSON(_ r: ASRResult, lang: Language?) -> [String: Any] {
    let words = buildWordTimings(from: r.tokenTimings ?? [])
    return [
        "text": r.text,
        "duration": r3(r.duration),
        "words": words.map { ["w": $0.word, "s": r3($0.startTime), "e": r3($0.endTime)] as [String: Any] },
    ]
}

func run() async throws {
    switch cmd {
    case "prepare":
        let t0 = now()
        let (_, _) = try await loadAsr()
        let m = OfflineDiarizerManager(config: OfflineDiarizerConfig())
        try await m.prepareModels(directory: modelsRoot.appendingPathComponent("diarizer"))
        emit(["ok": true, "prepareSeconds": r3(now() - t0), "modelsDir": modelsRoot.path])

    case "transcribe":
        guard let path = args.first, !path.hasPrefix("--") else { fail("transcribe <wav>", code: 2) }
        let lang = Language(rawValue: opt("--lang") ?? "fr")
        let (mgr, loadS) = try await loadAsr()
        var state = TdtDecoderState.make(decoderLayers: await mgr.decoderLayerCount)
        let t0 = now()
        let r = try await mgr.transcribe(URL(fileURLWithPath: path), decoderState: &state, language: lang)
        let tr = now() - t0
        var o = asrJSON(r, lang: lang)
        o["model"] = "parakeet-tdt-0.6b-v3"
        o["loadSeconds"] = r3(loadS)
        o["transcribeSeconds"] = r3(tr)
        o["rtfx"] = r3(r.duration / max(tr, 0.001))
        emit(o)

    case "diarize":
        guard let path = args.first, !path.hasPrefix("--") else { fail("diarize <wav> [--speakers N]", code: 2) }
        var cfg = OfflineDiarizerConfig()
        if let n = opt("--speakers").flatMap({ Int($0) }) { cfg.clustering.numSpeakers = n }
        if let t = opt("--threshold").flatMap({ Double($0) }) { cfg.clustering.threshold = t }
        if let v = opt("--fa").flatMap({ Double($0) }) { cfg.clustering.warmStartFa = v }
        if let v = opt("--fb").flatMap({ Double($0) }) { cfg.clustering.warmStartFb = v }
        if let v = opt("--min-speakers").flatMap({ Int($0) }) { cfg.clustering.minSpeakers = v }
        if let v = opt("--max-speakers").flatMap({ Int($0) }) { cfg.clustering.maxSpeakers = v }
        let t0 = now()
        let m = OfflineDiarizerManager(config: cfg)
        try await m.prepareModels(directory: modelsRoot.appendingPathComponent("diarizer"))
        let loadS = now() - t0
        let t1 = now()
        let res = try await m.process(URL(fileURLWithPath: path))
        let dz = now() - t1
        let withEmb = flag("--embeddings")
        var o: [String: Any] = [
            "segments": res.segments.map { ["speaker": $0.speakerId, "s": r3(Double($0.startTimeSeconds)), "e": r3(Double($0.endTimeSeconds))] as [String: Any] },
            "speakerCount": Set(res.segments.map { $0.speakerId }).count,
            "loadSeconds": r3(loadS),
            "diarizeSeconds": r3(dz),
        ]
        if withEmb, let db = res.speakerDatabase { o["embeddings"] = db.mapValues { $0.map { Double($0) } } }
        emit(o)

    case "stream":
        // Pseudo-flux : accumule le PCM s16le 16 kHz mono de stdin ; tous les N s, transcrit le bloc et émet une ligne JSON
        // (horodatages absolus). Pas de diarisation en flux ici (voir engine.md : Sortformer / LS-EEND à évaluer).
        let chunkS = Double(opt("--chunk") ?? "15") ?? 15
        let lang = Language(rawValue: opt("--lang") ?? "fr")
        let (mgr, _) = try await loadAsr()
        let chunkN = Int(chunkS * 16000) * 2
        var buf = Data(); var offset = 0.0
        let stdin = FileHandle.standardInput
        func flush(_ d: Data) async throws {
            let n = d.count / 2
            if n < 8000 { return }
            var f = [Float](repeating: 0, count: n)
            d.withUnsafeBytes { (p: UnsafeRawBufferPointer) in
                let s = p.bindMemory(to: Int16.self)
                for i in 0..<n { f[i] = Float(s[i]) / 32768 }
            }
            var st = TdtDecoderState.make(decoderLayers: await mgr.decoderLayerCount)
            let t0 = now()
            let r = try await mgr.transcribe(f, decoderState: &st, language: lang)
            var o = asrJSON(r, lang: lang)
            o["offset"] = r3(offset)
            o["words"] = ((o["words"] as? [[String: Any]]) ?? []).map { w in
                var w = w; w["s"] = r3((w["s"] as! Double) + offset); w["e"] = r3((w["e"] as! Double) + offset); return w }
            o["transcribeSeconds"] = r3(now() - t0)
            emit(o)
            offset += Double(n) / 16000
        }
        while true {
            let d = stdin.availableData
            if d.isEmpty { break }
            buf.append(d)
            while buf.count >= chunkN { try await flush(buf.prefix(chunkN)); buf.removeFirst(chunkN) }
        }
        try await flush(buf)

    default:
        fail("commande inconnue : \(cmd)", code: 2)
    }
}

do { try await run() } catch { fail("\(error)") }
