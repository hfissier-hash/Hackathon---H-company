// Pose un commentaire audio sur une vidéo, sans toucher à l'image.
// Usage : swift sonoriser.swift <video.mp4> <voix.m4a> <sortie.mp4> [début_audio:fin_audio:position_vidéo ...]
//   Sans morceaux : la voix est posée d'un bloc à partir de 0. Avec morceaux (en secondes) : chacun est posé à sa position.
import AVFoundation

let args = CommandLine.arguments
let video = AVURLAsset(url: URL(fileURLWithPath: args[1])), voice = AVURLAsset(url: URL(fileURLWithPath: args[2]))
let out = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: out)
func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 48000) }
let comp = AVMutableComposition()
let vSrc = video.tracks(withMediaType: .video)[0], aSrc = voice.tracks(withMediaType: .audio)[0]
let total = vSrc.timeRange.duration
let v = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try v.insertTimeRange(CMTimeRange(start: .zero, duration: total), of: vSrc, at: .zero)
let a = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
var parts = args.dropFirst(4).map { $0.split(separator: ":").map { Double($0)! } }
if parts.isEmpty { parts = [[0, CMTimeGetSeconds(aSrc.timeRange.duration), 0]] }
for p in parts {
  let end = min(p[2] + (p[1] - p[0]), CMTimeGetSeconds(total))          // rien ne dépasse la fin de la vidéo
  try a.insertTimeRange(CMTimeRange(start: t(p[0]), duration: t(end - p[2])), of: aSrc, at: t(p[2]))
  print(String(format: "voix %6.2f → %6.2f s posée de %6.2f à %6.2f", p[0], p[0] + end - p[2], p[2], end))
}
func export(_ preset: String) -> Bool {
  try? FileManager.default.removeItem(at: out)
  let e = AVAssetExportSession(asset: comp, presetName: preset)!
  e.outputURL = out; e.outputFileType = .mp4; e.shouldOptimizeForNetworkUse = true
  e.timeRange = CMTimeRange(start: .zero, duration: total)
  let done = DispatchSemaphore(value: 0)
  e.exportAsynchronously { done.signal() }
  done.wait()
  print(preset, e.status == .completed ? "terminé" : "échec : \(String(describing: e.error))")
  return e.status == .completed
}
if !export(AVAssetExportPresetPassthrough) { _ = export(AVAssetExportPreset1920x1080) }   // image recopiée telle quelle si possible
