// Compose une séquence de la démo : le panneau « Sous le capot » (image 1920 × 1080) et, dans le cadre du téléphone, l'image filmée.
// Usage : swift composer.swift <plan.json> <A|B> <sortie.mp4>
import AVFoundation
import AppKit

let args = CommandLine.arguments
let plan = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [String: Any]
let fps = Int32(plan["fps"] as! Int), images = plan["images"] as! String, panels = plan["panneaux"] as! String
let rows = (plan["plan"] as! [String: Any])[args[2]] as! [[Any]]
let out = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: out)
let W = 1920, H = 1080
// Écran du téléphone, mesuré dans la vidéo d'origine (coordonnées depuis le haut).
let phone = CGRect(x: 1298, y: CGFloat(H) - 58 - 957, width: 444, height: 957), radius: CGFloat = 34

var cache: [String: CGImage] = [:]
func panel(_ name: String) -> CGImage {
  if let c = cache[name] { return c }
  let i = NSImage(contentsOfFile: panels + "/" + name + ".png")!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  cache[name] = i; return i
}
var lastName = "", lastShot: CGImage? = nil
func shot(_ name: String) -> CGImage? {
  if name == lastName { return lastShot }
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: images + "/" + name) as CFURL, nil) else { return lastShot }
  lastName = name; lastShot = CGImageSourceCreateImageAtIndex(src, 0, nil); return lastShot
}

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000, AVVideoMaxKeyFrameIntervalKey: 60, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let full = CGRect(x: 0, y: 0, width: W, height: H)
for (i, row) in rows.enumerated() {
  autoreleasepool {
    let file = row[0] as! String, a = row[1] as! String, b = row[2] as! String, mix = CGFloat((row[3] as! NSNumber).doubleValue)
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    CVPixelBufferLockBaseAddress(buffer!, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer!),
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(panel(a), in: full)
    if a != b && mix > 0 { ctx.setAlpha(mix); ctx.draw(panel(b), in: full); ctx.setAlpha(1) }
    if let s = shot(file) {
      ctx.saveGState()
      ctx.addPath(CGPath(roundedRect: phone, cornerWidth: radius, cornerHeight: radius, transform: nil)); ctx.clip()
      // L'image filmée couvre l'écran en largeur ; l'excédent de hauteur est rogné en bas.
      let h = phone.width * CGFloat(s.height) / CGFloat(s.width)
      ctx.draw(s, in: CGRect(x: phone.minX, y: phone.maxY - h, width: phone.width, height: h))
      ctx.restoreGState()
    }
    CVPixelBufferUnlockBaseAddress(buffer!, [])
    while !input.isReadyForMoreMediaData { usleep(2000) }
    adaptor.append(buffer!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
  }
}
input.markAsFinished()
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(rows.count), timescale: fps))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "séquence \(args[2]) : \(rows.count) images" : "échec : \(String(describing: writer.error))")
