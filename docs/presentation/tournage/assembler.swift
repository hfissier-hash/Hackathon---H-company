// Assemble la vidéo finale : les scènes de la vidéo d'origine, inchangées, et les deux séquences du nouveau parcours.
// Usage : swift assembler.swift <origine.mp4> <A.mp4> <B.mp4> <sortie.mp4>
//   0:00 → 1:30 origine · séquence A (56 s) · 2:40 → 3:00 origine (l'agent H en direct) · séquence B (54 s) · 3:40 → 5:00 origine
import AVFoundation

let args = CommandLine.arguments
let v2 = AVURLAsset(url: URL(fileURLWithPath: args[1])), a = AVURLAsset(url: URL(fileURLWithPath: args[2])), b = AVURLAsset(url: URL(fileURLWithPath: args[3]))
let out = URL(fileURLWithPath: args[4])
try? FileManager.default.removeItem(at: out)
let comp = AVMutableComposition()
let video = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }
var cursor = CMTime.zero
func add(_ asset: AVURLAsset, _ from: Double, _ to: Double?) throws {
  let track = asset.tracks(withMediaType: .video)[0]
  let range = CMTimeRange(start: t(from), end: to.map(t) ?? track.timeRange.duration)
  try video.insertTimeRange(range, of: track, at: cursor)
  cursor = cursor + range.duration
}
try add(v2, 0, 90); try add(a, 0, nil); try add(v2, 160, 180); try add(b, 0, nil); try add(v2, 220, 300)
if let sound = v2.tracks(withMediaType: .audio).first {   // piste muette de l'origine, gardée telle quelle
  let audio = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  try audio.insertTimeRange(CMTimeRange(start: .zero, duration: min(sound.timeRange.duration, cursor)), of: sound, at: .zero)
}
print("durée assemblée :", CMTimeGetSeconds(cursor), "s")
let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPreset1920x1080)!
export.outputURL = out; export.outputFileType = .mp4; export.shouldOptimizeForNetworkUse = true
let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()
print(export.status == .completed ? "vidéo écrite : \(out.path)" : "échec : \(String(describing: export.error))")
