import AVFoundation
import CoreMedia
import ExpoModulesCore
import QuartzCore
import Speech
import UIKit

// MARK: - Errors

private enum EditFailure: LocalizedError {
  case invalid(String)
  case unavailable
  case busy
  case cancelled
  /// Machine-readable failures: the message is "<code>: <text>".
  case coded(String, String)

  var errorDescription: String? {
    switch self {
    case .invalid(let reason): return reason
    case .unavailable: return "The system could not encode this video."
    case .busy: return "Another export is already in progress."
    case .cancelled: return "The export was cancelled."
    case .coded(let code, let reason): return "\(code): \(reason)"
    }
  }
}

// MARK: - JS records

struct KareviaClipSpec: Record {
  init() {}
  @Field var uri: String = ""
  @Field var start: Double = 0
  @Field var end: Double = 0
}

struct KareviaMusicSpec: Record {
  init() {}
  @Field var uri: String = ""
  @Field var volume: Double = 1
}

struct KareviaCaptionWord: Record {
  init() {}
  @Field var text: String = ""
  @Field var start: Double = 0
  @Field var end: Double = 0
  /// Drawn in the accent colour (keyword emphasis).
  @Field var emphasis: Bool = false
  /// An emoji token, drawn as an image.
  @Field var emoji: Bool = false
}

struct KareviaCaptionCue: Record {
  init() {}
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var words: [KareviaCaptionWord] = []
  /// Index of the cue's clip in `clips`; -1 when the times are already final.
  @Field var clip: Int = -1
  /// Source time of that clip = cue or word time + shift.
  @Field var shift: Double = 0
}

/// Times are seconds on the composed timeline as JS computed it (the sum of
/// the trims). A cue with a `clip` is re-placed by where that clip really
/// landed (CaptionRenderer.place), so a clip whose video track is shorter
/// than its file cannot make later captions drift.
struct KareviaCaptionSpec: Record {
  init() {}
  @Field var cues: [KareviaCaptionCue] = []
  // classic | highlight | pop | box | karaoke | typewriter | outline | neon | impact
  @Field var style: String = "classic"
  @Field var position: String = "bottom"    // top | center | bottom
  @Field var color: String = "#FFD60A"      // #RRGGBB accent
  @Field var font: String = "system"        // system | rounded | serif | condensed | mono
}

struct KareviaExportSpec: Record {
  init() {}
  @Field var clips: [KareviaClipSpec] = []
  @Field var ratio: String = "16:9"
  @Field var quality: String = "720p"
  @Field var fit: String = "contain"
  @Field var volume: Double = 1
  @Field var title: String = ""
  @Field var titlePosition: String = "bottom"
  @Field var music: KareviaMusicSpec? = nil
  @Field var captions: KareviaCaptionSpec? = nil
  @Field var watermark: Bool = false
}

// MARK: - Export bookkeeping (one export at a time)

/// All locking happens inside synchronous methods so NSLock is never used
/// directly from an async context.
private final class ExportState {
  private let lock = NSLock()
  private var active = false
  private var cancelled = false
  private var backgrounded = false
  private var task: Task<String, Error>?
  private var session: AVAssetExportSession?

  func begin() throws {
    lock.lock()
    defer { lock.unlock() }
    if active { throw EditFailure.busy }
    active = true
    cancelled = false
    backgrounded = false
    task = nil
    session = nil
  }

  /// Cancels because the app left the foreground; `wasBackgrounded` then reports it.
  func cancelForBackground() {
    lock.lock()
    if active { backgrounded = true }
    lock.unlock()
    cancel()
  }

  var wasBackgrounded: Bool {
    lock.lock()
    defer { lock.unlock() }
    return backgrounded
  }

  func end() {
    lock.lock()
    defer { lock.unlock() }
    active = false
    task = nil
    session = nil
  }

  func attach(task newTask: Task<String, Error>) {
    lock.lock()
    let shouldCancel = cancelled
    if active { task = newTask }
    lock.unlock()
    if shouldCancel { newTask.cancel() }
  }

  func attach(session newSession: AVAssetExportSession) {
    lock.lock()
    let shouldCancel = cancelled
    if active { session = newSession }
    lock.unlock()
    if shouldCancel { newSession.cancelExport() }
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func cancel() {
    lock.lock()
    guard active else {
      lock.unlock()
      return
    }
    cancelled = true
    let currentTask = task
    let currentSession = session
    lock.unlock()
    currentTask?.cancel()
    currentSession?.cancelExport()
  }
}

// MARK: - Long work: keep the screen on, ask for background time

/// While an export or transcription runs, auto-lock is disabled and iOS is
/// asked for extra time if the user switches apps, so the work is not cut off.
@MainActor
private final class BackgroundTicket {
  var task = UIBackgroundTaskIdentifier.invalid

  func finish() {
    guard task != .invalid else { return }
    UIApplication.shared.endBackgroundTask(task)
    task = .invalid
  }
}

@MainActor
private enum WorkGuard {
  static var active = 0

  /// `onExpire` runs if iOS takes the background time away; the work should stop then.
  static func begin(_ name: String, onExpire: @escaping () -> Void = {}) -> BackgroundTicket {
    active += 1
    UIApplication.shared.isIdleTimerDisabled = true
    let ticket = BackgroundTicket()
    ticket.task = UIApplication.shared.beginBackgroundTask(withName: name) {
      // Time is up: stop the work instead of being suspended in the middle of it.
      onExpire()
      ticket.finish()
    }
    return ticket
  }

  static func end(_ ticket: BackgroundTicket) {
    active = max(0, active - 1)
    if active == 0 { UIApplication.shared.isIdleTimerDisabled = false }
    ticket.finish()
  }
}

// MARK: - Module

public class KareviaEditorModule: Module {
  private let exportState = ExportState()
  private let transcribeState = TranscribeState()

  public func definition() -> ModuleDefinition {
    Name("KareviaEditor")

    Events("onExportProgress", "onTranscribeProgress")

    AsyncFunction("duration") { (uri: URL) async throws -> Double in
      guard uri.isFileURL else { throw EditFailure.invalid("Only local files are supported.") }
      let duration = try await AVURLAsset(url: uri).load(.duration)
      guard duration.seconds.isFinite else { throw EditFailure.invalid("Could not read the video duration.") }
      return duration.seconds
    }

    AsyncFunction("thumbnail") { (uri: URL, time: Double, dest: URL) async throws -> String in
      guard uri.isFileURL, dest.isFileURL else { throw EditFailure.invalid("Only local files are supported.") }
      guard time.isFinite, time >= 0 else { throw EditFailure.invalid("Invalid thumbnail time.") }
      guard !FileManager.default.fileExists(atPath: dest.path) else {
        throw EditFailure.invalid("The thumbnail destination already exists.")
      }
      let asset = AVURLAsset(url: uri)
      let duration = try await asset.load(.duration).seconds
      guard duration.isFinite, time <= duration + 0.001 else {
        throw EditFailure.invalid("Thumbnail time is outside the video.")
      }
      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: 480, height: 480)
      let tolerance = CMTime(seconds: 0.1, preferredTimescale: 600)
      generator.requestedTimeToleranceBefore = tolerance
      generator.requestedTimeToleranceAfter = tolerance
      let at = CMTime(seconds: min(time, duration), preferredTimescale: 600)
      let frame: CGImage = try await generator.image(at: at).image
      guard let data = UIImage(cgImage: frame).jpegData(compressionQuality: 0.8) else {
        throw EditFailure.unavailable
      }
      try data.write(to: dest, options: [.withoutOverwriting])
      return dest.absoluteString
    }

    AsyncFunction("export") { (spec: KareviaExportSpec, dest: URL) async throws -> String in
      try self.exportState.begin()
      defer { self.exportState.end() }
      let state = self.exportState
      let background = await WorkGuard.begin("Vidora export", onExpire: { state.cancelForBackground() })
      defer { Task { @MainActor in WorkGuard.end(background) } }
      // In the background iOS takes the GPU and the hardware encoder away, as
      // in the product renderer: stop right away with a clear error code
      // ("editor-backgrounded") instead of failing with a system message.
      let observer = NotificationCenter.default.addObserver(
        forName: Notification.Name("UIApplicationDidEnterBackgroundNotification"), object: nil, queue: nil
      ) { _ in state.cancelForBackground() }
      defer { NotificationCenter.default.removeObserver(observer) }

      // Checked before any work so a failure below can safely delete `dest`.
      guard dest.isFileURL else { throw EditFailure.invalid("The destination must be a local file.") }
      guard !FileManager.default.fileExists(atPath: dest.path) else {
        throw EditFailure.invalid("The destination file already exists.")
      }

      let emit: (Double) -> Void = { [weak self] value in
        let clamped = max(0, min(1, value.isFinite ? value : 0))
        self?.sendEvent("onExportProgress", ["progress": clamped])
      }

      let work = Task<String, Error> {
        try await KareviaExporter.run(spec: spec, dest: dest, state: state, emit: emit)
      }
      state.attach(task: work)

      do {
        return try await work.value
      } catch {
        try? FileManager.default.removeItem(at: dest)
        if state.wasBackgrounded {
          throw EditFailure.coded(
            "editor-backgrounded",
            "The export was stopped because the app went to the background. Keep Vidora open while it exports.")
        }
        if state.isCancelled || error is CancellationError { throw EditFailure.cancelled }
        throw error
      }
    }

    AsyncFunction("transcribe") { (uri: URL, locale: String) async throws -> [String: Any] in
      try self.transcribeState.begin()
      defer { self.transcribeState.end() }
      let background = await WorkGuard.begin("Vidora captions")
      defer { Task { @MainActor in WorkGuard.end(background) } }
      let emit: (Double) -> Void = { [weak self] value in
        let clamped = max(0, min(1, value.isFinite ? value : 0))
        self?.sendEvent("onTranscribeProgress", ["progress": clamped])
      }
      let outcome = try await KareviaTranscriber.run(uri: uri, localeID: locale, state: self.transcribeState, emit: emit)
      var words: [[String: Any]] = []
      for word in outcome.words {
        words.append(["text": word.text, "start": word.start, "end": word.end])
      }
      return ["words": words, "onDevice": outcome.onDevice]
    }

    Function("cancel") {
      self.exportState.cancel()
    }

    Function("cancelTranscribe") {
      self.transcribeState.cancel()
    }

    /// Imported copies can be re-created from Photos, so keep them out of
    /// iCloud backups (App Store data storage guidelines).
    Function("excludeFromBackup") { (uri: URL) throws -> Bool in
      guard uri.isFileURL else { throw EditFailure.invalid("Only local files are supported.") }
      var target = uri
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try target.setResourceValues(values)
      return true
    }
  }
}

// MARK: - Export implementation

private enum KareviaExporter {
  static let timescale: CMTimeScale = 600

  static func fileURL(_ raw: String) throws -> URL {
    let candidate: URL?
    if raw.hasPrefix("/") {
      candidate = URL(fileURLWithPath: raw)
    } else {
      candidate = URL(string: raw)
    }
    guard let url = candidate, url.isFileURL, FileManager.default.fileExists(atPath: url.path) else {
      throw EditFailure.invalid("A source file is missing or is not a local file.")
    }
    return url
  }

  static func renderSize(ratio: String, quality: String) throws -> CGSize {
    let short: CGFloat
    switch quality {
    case "720p": short = 720
    case "1080p": short = 1080
    default: throw EditFailure.invalid("Unsupported quality.")
    }
    // 720 -> 1280, 1080 -> 1920
    let long = (short * 16 / 9).rounded()
    switch ratio {
    case "16:9": return CGSize(width: long, height: short)
    case "9:16": return CGSize(width: short, height: long)
    case "1:1": return CGSize(width: short, height: short)
    default: throw EditFailure.invalid("Unsupported aspect ratio.")
    }
  }

  /// Orientation (preferredTransform) -> move to origin -> scale -> center in render size.
  static func placement(natural: CGSize, preferred: CGAffineTransform, render: CGSize, cover: Bool) throws -> CGAffineTransform {
    let box = CGRect(origin: .zero, size: natural).applying(preferred).standardized
    guard box.width > 0, box.height > 0 else { throw EditFailure.invalid("A clip has no visible video.") }
    let sx = render.width / box.width
    let sy = render.height / box.height
    let scale = cover ? max(sx, sy) : min(sx, sy)
    return preferred
      .concatenating(CGAffineTransform(translationX: -box.minX, y: -box.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(
        translationX: (render.width - box.width * scale) / 2,
        y: (render.height - box.height * scale) / 2))
  }

  static func run(spec: KareviaExportSpec, dest: URL, state: ExportState, emit: @escaping (Double) -> Void) async throws -> String {
    // ---- Validation of plain values
    guard spec.clips.count >= 1, spec.clips.count <= 20 else {
      throw EditFailure.invalid("Between 1 and 20 clips are required.")
    }
    guard spec.volume.isFinite, spec.volume >= 0, spec.volume <= 1 else {
      throw EditFailure.invalid("Volume must be between 0 and 1.")
    }
    let cover: Bool
    switch spec.fit {
    case "contain": cover = false
    case "cover": cover = true
    default: throw EditFailure.invalid("Unsupported fit mode.")
    }
    guard ["top", "center", "bottom"].contains(spec.titlePosition) else {
      throw EditFailure.invalid("Unsupported title position.")
    }
    guard spec.title.count <= 100 else { throw EditFailure.invalid("The title is longer than 100 characters.") }
    let size = try renderSize(ratio: spec.ratio, quality: spec.quality)
    if let music = spec.music {
      guard music.volume.isFinite, music.volume >= 0, music.volume <= 1 else {
        throw EditFailure.invalid("Music volume must be between 0 and 1.")
      }
    }

    emit(0)

    // ---- Build the timeline
    let timeline = AVMutableComposition()
    var videoTracks: [AVMutableCompositionTrack] = []  // two alternating tracks (A/B)
    var clipAudioTrack: AVMutableCompositionTrack?
    var instructions: [AVMutableVideoCompositionInstruction] = []
    var cursor = CMTime.zero
    // Where each clip landed, so captions follow the real timeline.
    var placements: [CaptionPlacement] = []
    // Output keeps the fastest source frame rate up to 60 fps, so 24 and
    // 25 fps sources stay as they are; 30 fps when no rate is known.
    var frameRate: Float = 0

    for (index, clip) in spec.clips.enumerated() {
      try Task.checkCancellation()
      guard clip.start.isFinite, clip.end.isFinite, clip.start >= 0, clip.end > clip.start else {
        throw EditFailure.invalid("Invalid trim range for clip \(index + 1).")
      }
      let asset = AVURLAsset(url: try fileURL(clip.uri))
      let assetSeconds = try await asset.load(.duration).seconds
      guard assetSeconds.isFinite, clip.end <= assetSeconds + 0.001 else {
        throw EditFailure.invalid("Trim range exceeds the length of clip \(index + 1).")
      }
      guard let source = try await asset.loadTracks(withMediaType: .video).first else {
        throw EditFailure.invalid("Clip \(index + 1) has no video.")
      }
      let end = min(clip.end, assetSeconds)
      let requested = CMTimeRange(
        start: CMTime(seconds: clip.start, preferredTimescale: timescale),
        end: CMTime(seconds: end, preferredTimescale: timescale))
      // Never ask for media the video track does not have.
      let span = CMTimeRangeGetIntersection(requested, otherRange: try await source.load(.timeRange))
      guard span.duration.isValid, span.duration.seconds > 0 else {
        throw EditFailure.invalid("Trim range for clip \(index + 1) contains no video.")
      }

      // Alternate between track A and track B, created lazily.
      let slot = index % 2
      if videoTracks.count <= slot {
        guard let created = timeline.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
          throw EditFailure.unavailable
        }
        videoTracks.append(created)
      }
      let track = videoTracks[slot]
      try track.insertTimeRange(span, of: source, at: cursor)

      let fps = try await source.load(.nominalFrameRate)
      if fps.isFinite, fps > 0 { frameRate = max(frameRate, min(fps, 60)) }
      let natural = try await source.load(.naturalSize)
      let preferred = try await source.load(.preferredTransform)
      let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
      layer.setTransform(try placement(natural: natural, preferred: preferred, render: size, cover: cover), at: cursor)
      let step = AVMutableVideoCompositionInstruction()
      // Ranges are [cursor, cursor + span.duration) with the same cursor values
      // used for insertion, so they tile the composition with no gaps.
      step.timeRange = CMTimeRange(start: cursor, duration: span.duration)
      step.layerInstructions = [layer]
      instructions.append(step)
      placements.append(CaptionPlacement(
        cursor: cursor.seconds,
        sourceStart: span.start.seconds,
        length: span.duration.seconds))

      // Original audio (optional: clips without audio simply leave a silent gap).
      if spec.volume > 0, let audio = try await asset.loadTracks(withMediaType: .audio).first {
        let available = CMTimeRangeGetIntersection(span, otherRange: try await audio.load(.timeRange))
        if available.duration.isValid, available.duration.seconds > 0 {
          if clipAudioTrack == nil {
            clipAudioTrack = timeline.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
          }
          if let target = clipAudioTrack {
            let offset = CMTimeSubtract(available.start, span.start)
            try target.insertTimeRange(available, of: audio, at: CMTimeAdd(cursor, offset))
          }
        }
      }

      cursor = CMTimeAdd(cursor, span.duration)
    }
    let total = cursor
    if frameRate < 1 { frameRate = 30 }

    // ---- Audio mix
    var mixParameters: [AVMutableAudioMixInputParameters] = []
    if let target = clipAudioTrack {
      let params = AVMutableAudioMixInputParameters(track: target)
      params.setVolume(Float(spec.volume), at: .zero)
      mixParameters.append(params)
    }

    if let music = spec.music {
      let musicAsset = AVURLAsset(url: try fileURL(music.uri))
      guard let musicSource = try await musicAsset.loadTracks(withMediaType: .audio).first else {
        throw EditFailure.invalid("The music file has no audio.")
      }
      let musicRange = try await musicSource.load(.timeRange)
      guard musicRange.duration.isValid, musicRange.duration.seconds >= 0.05 else {
        throw EditFailure.invalid("The music file is too short.")
      }
      if music.volume > 0 {
        guard let musicTrack = timeline.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
          throw EditFailure.unavailable
        }
        // Loop from 0 and trim the last pass to the total duration.
        var at = CMTime.zero
        var passes = 0
        while CMTimeCompare(at, total) < 0, passes < 100_000 {
          let remaining = CMTimeSubtract(total, at)
          let length = CMTimeCompare(musicRange.duration, remaining) < 0 ? musicRange.duration : remaining
          try musicTrack.insertTimeRange(CMTimeRange(start: musicRange.start, duration: length), of: musicSource, at: at)
          at = CMTimeAdd(at, length)
          passes += 1
        }
        let params = AVMutableAudioMixInputParameters(track: musicTrack)
        params.setVolume(Float(music.volume), at: .zero)
        mixParameters.append(params)
      }
    }

    // ---- Video composition
    let composition = AVMutableVideoComposition()
    composition.renderSize = size
    composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(frameRate.rounded()))
    composition.instructions = instructions

    let title = spec.title.trimmingCharacters(in: .whitespacesAndNewlines)
    var captions: KareviaCaptionSpec? = nil
    if let requested = spec.captions, !requested.cues.isEmpty {
      captions = requested
    }
    if !title.isEmpty || captions != nil || spec.watermark {
      composition.animationTool = overlayTool(
        title: title,
        titlePosition: spec.titlePosition,
        captions: captions,
        placements: placements,
        watermark: spec.watermark,
        size: size,
        total: total.seconds)
    }

    // ---- Encode
    guard let session = AVAssetExportSession(asset: timeline, presetName: AVAssetExportPresetHighestQuality),
          session.supportedFileTypes.contains(.mp4) else { throw EditFailure.unavailable }
    session.shouldOptimizeForNetworkUse = true
    session.videoComposition = composition
    if !mixParameters.isEmpty {
      let mix = AVMutableAudioMix()
      mix.inputParameters = mixParameters
      session.audioMix = mix
    }

    try Task.checkCancellation()
    state.attach(session: session)  // cancels immediately if cancel() already ran

    if #available(iOS 18.0, *) {
      let monitor = Task {
        do {
          for try await update in session.states(updateInterval: 0.25) {
            if case .exporting(let progress) = update {
              emit(progress.fractionCompleted)
            }
          }
        } catch {}
      }
      defer { monitor.cancel() }
      try await session.export(to: dest, as: .mp4)
    } else {
      session.outputURL = dest
      session.outputFileType = .mp4
      let poll = Task {
        while !Task.isCancelled {
          emit(Double(session.progress))
          try? await Task.sleep(nanoseconds: 250_000_000)
        }
      }
      defer { poll.cancel() }
      await withTaskCancellationHandler {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
          session.exportAsynchronously { done.resume() }
        }
      } onCancel: {
        session.cancelExport()
      }
      guard session.status == .completed else {
        if session.status == .cancelled { throw EditFailure.cancelled }
        throw session.error ?? EditFailure.unavailable
      }
    }

    if state.isCancelled { throw EditFailure.cancelled }
    emit(1)
    return dest.absoluteString
  }

  // MARK: Overlay (title + captions + watermark)

  /// Shared with the caption layout so captions can keep clear of the title.
  static func titleMargin(_ size: CGSize) -> CGFloat {
    return (size.height * 0.05).rounded()
  }

  /// Builds the Core Animation overlay (title, captions, watermark).
  ///
  /// Coordinates: inside AVVideoCompositionCoreAnimationTool the layer tree is
  /// NOT geometry-flipped, so the origin is BOTTOM-left. We deliberately do not
  /// set `isGeometryFlipped`; instead every overlay is laid out in top-left
  /// terms (`topY`) and converted explicitly: y = renderHeight - topY - boxHeight.
  static func overlayTool(
    title: String,
    titlePosition: String,
    captions: KareviaCaptionSpec?,
    placements: [CaptionPlacement],
    watermark: Bool,
    size: CGSize,
    total: Double
  ) -> AVVideoCompositionCoreAnimationTool {
    CATransaction.begin()
    CATransaction.setDisableActions(true)

    let parent = CALayer()
    let video = CALayer()
    parent.frame = CGRect(origin: .zero, size: size)
    video.frame = parent.bounds
    parent.addSublayer(video)

    var titleHeight: CGFloat = 0
    if !title.isEmpty {
      let built = titleBox(title: title, position: titlePosition, size: size)
      parent.addSublayer(built.layer)
      titleHeight = built.height
    }

    if let captions = captions {
      let renderer = CaptionRenderer(
        spec: captions,
        placements: placements,
        size: size,
        total: total,
        titlePosition: title.isEmpty ? nil : titlePosition,
        titleHeight: titleHeight)
      for layer in renderer.layers() {
        parent.addSublayer(layer)
      }
    }

    if watermark {
      parent.addSublayer(watermarkLayer(size: size))
    }

    CATransaction.commit()

    return AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: video, in: parent)
  }

  /// The title box, already positioned in the parent's bottom-left coordinates.
  static func titleBox(title: String, position: String, size: CGSize) -> (layer: CALayer, height: CGFloat) {
    let fontSize = max(18, (size.height * 0.035).rounded())
    let margin = titleMargin(size)
    let padX = (fontSize * 0.7).rounded()
    let padY = (fontSize * 0.4).rounded()

    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    let text = NSAttributedString(string: title, attributes: [
      .font: UIFont.boldSystemFont(ofSize: fontSize),
      .foregroundColor: UIColor.white,
      .paragraphStyle: paragraph
    ])

    let maxTextWidth = size.width - 2 * margin - 2 * padX
    let measured = text.boundingRect(
      with: CGSize(width: maxTextWidth, height: CGFloat.greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      context: nil)
    let maxTextHeight = size.height * 0.4
    let textHeight = min(maxTextHeight, ceil(measured.height) + 2)
    let textWidth = min(maxTextWidth, ceil(measured.width) + 2)
    let boxWidth = textWidth + 2 * padX
    let boxHeight = textHeight + 2 * padY

    // Distance from the TOP edge of the video to the top of the box.
    let topY: CGFloat
    switch position {
    case "top": topY = margin
    case "center": topY = (size.height - boxHeight) / 2
    default: topY = size.height - margin - boxHeight
    }
    // Explicit conversion to the bottom-left origin used by the animation tool.
    let boxY = size.height - topY - boxHeight

    let box = CALayer()
    box.frame = CGRect(x: ((size.width - boxWidth) / 2).rounded(), y: boxY.rounded(), width: boxWidth, height: boxHeight)
    box.backgroundColor = UIColor.black.withAlphaComponent(0.65).cgColor
    box.cornerRadius = (fontSize * 0.35).rounded()
    box.masksToBounds = true

    let label = CATextLayer()
    label.string = text
    label.alignmentMode = .center
    label.isWrapped = true
    label.truncationMode = .end
    label.contentsScale = 2
    label.frame = CGRect(x: padX, y: padY, width: textWidth, height: textHeight)
    box.addSublayer(label)

    return (layer: box, height: boxHeight)
  }

  /// Small semi-transparent "Vidora" mark in the bottom-right corner.
  static func watermarkLayer(size: CGSize) -> CALayer {
    let font = UIFont.boldSystemFont(ofSize: max(14, (size.height * 0.022).rounded()))
    let margin = (size.height * 0.02).rounded()
    let width = OverlayText.width("Vidora", font: font) + 6
    let height = ceil(font.lineHeight) + 2
    // Bottom-left origin: a small y is already the BOTTOM edge, so no conversion
    // is needed here (topY would be renderHeight - margin - height).
    let frame = CGRect(x: (size.width - margin - width).rounded(), y: margin, width: width, height: height)
    let label = OverlayText.layer("Vidora", font: font, color: UIColor.white, frame: frame)
    label.opacity = 0.55
    return label
  }
}

// MARK: - Overlay helpers

private enum OverlayColor {
  static let fallback = UIColor(red: 1.0, green: 214.0 / 255.0, blue: 10.0 / 255.0, alpha: 1.0)  // #FFD60A

  /// Parses "#RRGGBB" (the "#" is optional); anything else gives the fallback.
  static func accent(_ raw: String) -> UIColor {
    var hex = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, hex.allSatisfy({ $0.isHexDigit }), let value = UInt32(hex, radix: 16) else {
      return fallback
    }
    let red = CGFloat((value >> 16) & 0xFF) / 255.0
    let green = CGFloat((value >> 8) & 0xFF) / 255.0
    let blue = CGFloat(value & 0xFF) / 255.0
    return UIColor(red: red, green: green, blue: blue, alpha: 1.0)
  }
}

private enum OverlayTiming {
  /// A beginTime of exactly 0 means "now" to Core Animation, so time zero of
  /// the video must be expressed as AVCoreAnimationBeginTimeAtZero.
  static func begin(_ seconds: Double) -> CFTimeInterval {
    if seconds <= 0 { return AVCoreAnimationBeginTimeAtZero }
    return AVCoreAnimationBeginTimeAtZero + seconds
  }

  /// Opacity 1 during [start, end] and 0 otherwise. The animation spans the
  /// whole composition (discrete keyframes), so `fillMode = .both` holds 0
  /// outside the window instead of leaking the "on" value.
  static func visibility(from start: Double, to end: Double, total: Double) -> CAKeyframeAnimation {
    let length = max(total, 0.001)
    let on = max(0, min(start, length))
    let off = max(on, min(end, length))

    var values: [NSNumber] = []
    var times: [NSNumber] = [NSNumber(value: 0.0)]
    if on > 0 {
      values.append(NSNumber(value: 0.0))
      times.append(NSNumber(value: on / length))
    }
    values.append(NSNumber(value: 1.0))
    if off < length {
      times.append(NSNumber(value: off / length))
      values.append(NSNumber(value: 0.0))
    }
    times.append(NSNumber(value: 1.0))

    let animation = CAKeyframeAnimation(keyPath: "opacity")
    animation.calculationMode = .discrete  // needs values.count + 1 key times
    animation.values = values
    animation.keyTimes = times
    animation.duration = length
    animation.beginTime = AVCoreAnimationBeginTimeAtZero
    animation.isRemovedOnCompletion = false
    animation.fillMode = .both
    return animation
  }

  static func scaleIn(at seconds: Double) -> CABasicAnimation {
    let animation = CABasicAnimation(keyPath: "transform.scale")
    animation.fromValue = NSNumber(value: 0.6)
    animation.toValue = NSNumber(value: 1.0)
    animation.duration = 0.12
    animation.beginTime = begin(seconds)
    animation.timingFunction = CAMediaTimingFunction(name: .easeOut)
    animation.isRemovedOnCompletion = false
    animation.fillMode = .both
    return animation
  }
}

private enum OverlayText {
  static func heavy(_ pointSize: CGFloat) -> UIFont {
    return UIFont.systemFont(ofSize: max(8, pointSize.rounded()), weight: .heavy)
  }

  /// Caption fonts. The preview (src/caption-overlay.tsx, FONT_FAMILY) uses
  /// the same iOS faces so the export matches what the user saw.
  static func font(_ name: String, _ pointSize: CGFloat) -> UIFont {
    let size = max(8, pointSize.rounded())
    let face: String?
    switch name {
    case "rounded": face = "ArialRoundedMTBold"
    case "serif": face = "Georgia-Bold"
    case "condensed": face = "AvenirNextCondensed-Heavy"
    case "mono": face = "Menlo-Bold"
    default: face = nil
    }
    if let face = face, let custom = UIFont(name: face, size: size) { return custom }
    return heavy(size)
  }

  static func width(_ text: String, font: UIFont) -> CGFloat {
    let measured = NSAttributedString(string: text, attributes: [.font: font]).size()
    return ceil(measured.width)
  }

  /// Greedy word wrap; returns the token indices of every line.
  static func flow(widths: [CGFloat], space: CGFloat, maxWidth: CGFloat) -> [[Int]] {
    var lines: [[Int]] = []
    var current: [Int] = []
    var used: CGFloat = 0
    for (index, width) in widths.enumerated() {
      if current.isEmpty {
        current = [index]
        used = width
      } else if used + space + width > maxWidth {
        lines.append(current)
        current = [index]
        used = width
      } else {
        current.append(index)
        used += space + width
      }
    }
    if !current.isEmpty { lines.append(current) }
    return lines
  }

  /// The halo behind caption text.
  enum Glow {
    case shadow
    case outline
    case neon(UIColor)
  }

  /// Single-line, centred text with a halo (tight black shadow by default).
  static func layer(_ text: String, font: UIFont, color: UIColor, frame: CGRect, glow: Glow = .shadow) -> CATextLayer {
    let label = CATextLayer()
    label.string = NSAttributedString(string: text, attributes: [
      .font: font,
      .foregroundColor: color
    ])
    label.alignmentMode = .center
    label.isWrapped = false
    label.truncationMode = .end
    label.contentsScale = 2
    label.frame = frame
    label.shadowOpacity = 1
    label.shadowOffset = CGSize.zero
    switch glow {
    case .shadow:
      label.shadowColor = UIColor.black.cgColor
      label.shadowRadius = max(1.5, font.pointSize * 0.05)
    case .outline:
      label.shadowColor = UIColor.black.cgColor
      label.shadowRadius = max(3, font.pointSize * 0.14)
    case .neon(let tint):
      label.shadowColor = tint.cgColor
      label.shadowRadius = max(6, font.pointSize * 0.35)
    }
    return label
  }

  /// Emoji drawn into a bitmap: CATextLayer does not reliably draw colour emoji.
  static func emojiLayer(_ text: String, font: UIFont, frame: CGRect) -> CALayer {
    let attributed = NSAttributedString(string: text, attributes: [.font: font])
    let measured = attributed.size()
    let canvas = CGSize(width: max(1, ceil(measured.width)), height: max(1, ceil(measured.height)))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 2
    let image = UIGraphicsImageRenderer(size: canvas, format: format).image { _ in
      attributed.draw(at: .zero)
    }
    let layer = CALayer()
    layer.frame = frame
    layer.contents = image.cgImage
    layer.contentsScale = 2
    layer.contentsGravity = .center
    return layer
  }
}

// MARK: - Captions

/// Where one clip landed on the composed timeline (seconds).
private struct CaptionPlacement {
  /// Timeline time at which the clip starts.
  let cursor: Double
  /// Source time shown at `cursor` (the trim start, or where the video track begins).
  let sourceStart: Double
  /// Length of the clip on the timeline.
  let length: Double
}

private struct CaptionRenderer {
  enum Style {
    case classic
    case highlight
    case pop
    case box
    case karaoke
    case typewriter
    case outline
    case neon
    case impact
  }

  struct Token {
    let text: String
    let start: Double
    let end: Double
    let emphasis: Bool
    let emoji: Bool
  }

  // Keep in sync with MAX_EXPORT_CUES / MAX_CUE_WORDS in src/captions.ts
  // (one extra word slot for an added emoji).
  static let maxCues = 3000
  static let maxWordsPerCue = 41

  let cues: [KareviaCaptionCue]
  let placements: [CaptionPlacement]
  let style: Style
  let position: String
  let accent: UIColor
  let fontName: String
  let size: CGSize
  let total: Double
  /// Distance kept free at the top / bottom edge (grows when the title is there).
  let topInset: CGFloat
  let bottomInset: CGFloat
  /// Fixed top edge used when the title also sits in the centre.
  let centerTop: CGFloat?

  init(spec: KareviaCaptionSpec, placements: [CaptionPlacement], size: CGSize, total: Double, titlePosition: String?, titleHeight: CGFloat) {
    self.cues = spec.cues
    self.placements = placements
    switch spec.style {
    case "highlight": self.style = .highlight
    case "pop": self.style = .pop
    case "box": self.style = .box
    case "karaoke": self.style = .karaoke
    case "typewriter": self.style = .typewriter
    case "outline": self.style = .outline
    case "neon": self.style = .neon
    case "impact": self.style = .impact
    default: self.style = .classic
    }
    self.position = ["top", "center", "bottom"].contains(spec.position) ? spec.position : "bottom"
    self.accent = OverlayColor.accent(spec.color)
    self.fontName = spec.font
    self.size = size
    self.total = total

    let base = (size.height * 0.08).rounded()
    let gap = (size.height * 0.02).rounded()
    let clearOfTitle = KareviaExporter.titleMargin(size) + titleHeight + gap
    var top = base
    var bottom = base
    var center: CGFloat? = nil
    if let titlePosition = titlePosition {
      switch titlePosition {
      case "top": top = max(base, clearOfTitle)            // captions go below the title
      case "center": center = (size.height + titleHeight) / 2 + gap  // just under the title
      default: bottom = max(base, clearOfTitle)            // captions go above the title
      }
    }
    self.topInset = top
    self.bottomInset = bottom
    self.centerTop = center
  }

  /// A caption time on the composed timeline. A cue that names its clip is
  /// placed by where that clip really landed: source time (time + shift)
  /// relative to the clip's first source moment, kept inside the clip.
  private func place(_ time: Double, in cue: KareviaCaptionCue) -> Double {
    guard cue.clip >= 0, cue.clip < placements.count, cue.shift.isFinite else { return time }
    let clip = placements[cue.clip]
    let mapped = clip.cursor + (time + cue.shift - clip.sourceStart)
    return min(max(mapped, clip.cursor), clip.cursor + clip.length)
  }

  /// One container layer per cue, hidden except during [start, end].
  func layers() -> [CALayer] {
    var out: [CALayer] = []
    for cue in cues {
      if out.count >= CaptionRenderer.maxCues { break }
      guard cue.start.isFinite, cue.end.isFinite else { continue }
      // Cues outside the composition are ignored; overlapping ones are clamped.
      let start = max(0, place(cue.start, in: cue))
      let end = min(total, place(cue.end, in: cue))
      guard end - start > 0.01 else { continue }
      let tokens = self.tokens(of: cue, start: start, end: end)
      guard !tokens.isEmpty else { continue }

      let container = style == .pop ? popCue(tokens, end: end) : lineCue(tokens, end: end)
      container.opacity = 0
      container.add(OverlayTiming.visibility(from: start, to: end, total: total), forKey: "cueVisibility")
      out.append(container)
    }
    return out
  }

  private func tokens(of cue: KareviaCaptionCue, start: Double, end: Double) -> [Token] {
    var out: [Token] = []
    for word in cue.words.prefix(CaptionRenderer.maxWordsPerCue) {
      // Upper case (Turkish-aware) is applied in JS before export.
      let text = word.text.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty { continue }
      let wordStart = word.start.isFinite ? min(max(place(word.start, in: cue), start), end) : start
      let wordEnd = word.end.isFinite ? min(max(place(word.end, in: cue), wordStart), end) : end
      out.append(Token(text: text, start: wordStart, end: wordEnd, emphasis: word.emphasis, emoji: word.emoji))
    }
    return out
  }

  /// Frame of a caption block in the parent layer. Laid out in top-left terms
  /// and converted explicitly to the bottom-left origin of the animation tool:
  /// y = renderHeight - topY - blockHeight (same math as the title box).
  private func blockFrame(width: CGFloat, height: CGFloat) -> CGRect {
    let topY: CGFloat
    switch position {
    case "top": topY = topInset
    case "center": topY = centerTop ?? (size.height - height) / 2
    default: topY = size.height - bottomInset - height
    }
    let clampedTop = max(0, min(topY, size.height - height))
    let y = size.height - clampedTop - height
    return CGRect(x: ((size.width - width) / 2).rounded(), y: y.rounded(), width: width, height: height)
  }

  /// Every style except pop: the cue's words in a centred block (two lines,
  /// three at small sizes), laid out word by word so each word can be
  /// coloured and timed.
  private func lineCue(_ tokens: [Token], end cueEnd: Double) -> CALayer {
    let maxWidth = (size.width * (style == .box ? 0.84 : 0.88)).rounded()
    var baseSize = max(16, size.height * 0.055)
    if style == .impact { baseSize *= 1.3 }

    // Shrink the font until the cue fits on two lines; from half size down
    // three lines are fine. A cue that still needs more keeps every line (the
    // block just grows; blockFrame keeps it in the frame) instead of losing
    // words. Keep in sync with CAPTION_SCALES / captionFits in src/captions.ts.
    var font = OverlayText.font(fontName, baseSize)
    var widths: [CGFloat] = []
    var space: CGFloat = 0
    var lines: [[Int]] = []
    let scales: [CGFloat] = [1.0, 0.85, 0.72, 0.6, 0.5, 0.45, 0.405, 0.3645, 0.32805]
    for (step, scale) in scales.enumerated() {
      font = OverlayText.font(fontName, baseSize * scale)
      space = OverlayText.width(" ", font: font)
      var measured: [CGFloat] = []
      for token in tokens {
        measured.append(OverlayText.width(token.text, font: font))
      }
      widths = measured
      lines = OverlayText.flow(widths: widths, space: space, maxWidth: maxWidth)
      if lines.count <= (step < 4 ? 2 : 3) { break }
    }

    let lineHeight = ceil(font.lineHeight * 1.12)
    let blockHeight = lineHeight * CGFloat(max(1, lines.count))
    let container = CALayer()
    container.frame = blockFrame(width: maxWidth, height: blockHeight)

    func rowWidth(_ indices: [Int]) -> CGFloat {
      var total = space * CGFloat(max(0, indices.count - 1))
      for index in indices { total += widths[index] }
      return total
    }

    if style == .box {
      // A rounded plate behind the text, as wide as the longest line.
      var widest: CGFloat = 0
      for indices in lines { widest = max(widest, rowWidth(indices)) }
      let pad = (font.pointSize * 0.4).rounded()
      let plate = CALayer()
      plate.frame = CGRect(
        x: ((maxWidth - widest) / 2 - pad).rounded(),
        y: -(pad * 0.35).rounded(),
        width: widest + 2 * pad,
        height: blockHeight + (pad * 0.7).rounded())
      plate.backgroundColor = UIColor.black.withAlphaComponent(0.65).cgColor
      plate.cornerRadius = pad
      container.addSublayer(plate)
    }

    let glow: OverlayText.Glow
    switch style {
    case .outline: glow = .outline
    case .neon: glow = .neon(accent)
    default: glow = .shadow
    }
    let baseColor = style == .impact ? accent : UIColor.white

    for (row, indices) in lines.enumerated() {
      // Row 0 is the TOP line; with a bottom-left origin it has the largest y.
      let y = blockHeight - CGFloat(row + 1) * lineHeight
      var x = max(0, (maxWidth - rowWidth(indices)) / 2)
      for index in indices {
        let token = tokens[index]
        // 2 pt of slack each side so measuring differences never clip a glyph.
        let frame = CGRect(x: (x - 2).rounded(), y: y, width: widths[index] + 4, height: lineHeight)
        let color = token.emphasis && style != .impact ? accent : baseColor
        let base: CALayer = token.emoji
          ? OverlayText.emojiLayer(token.text, font: font, frame: frame)
          : OverlayText.layer(token.text, font: font, color: color, frame: frame, glow: glow)
        if style == .typewriter {
          // Each word appears when it is spoken and stays for the cue.
          base.opacity = 0
          base.add(OverlayTiming.visibility(from: token.start, to: cueEnd, total: total), forKey: "wordAppear")
        }
        container.addSublayer(base)

        // Accent copy on top: highlight lights the spoken word (until the
        // next one starts, so there is no flicker); karaoke keeps it lit.
        if !token.emoji, style == .highlight || style == .karaoke {
          let until: Double
          if style == .karaoke {
            until = cueEnd
          } else {
            until = index + 1 < tokens.count ? max(token.end, tokens[index + 1].start) : token.end
          }
          if until - token.start > 0.01 {
            let lit = OverlayText.layer(token.text, font: font, color: accent, frame: frame, glow: glow)
            lit.opacity = 0
            lit.add(OverlayTiming.visibility(from: token.start, to: until, total: total), forKey: "wordHighlight")
            container.addSublayer(lit)
          }
        }
        x += widths[index] + space
      }
    }
    return container
  }

  /// pop: only the current word, large, accent-coloured, with a quick scale-in.
  private func popCue(_ tokens: [Token], end: Double) -> CALayer {
    let maxWidth = (size.width * 0.9).rounded()
    let baseSize = max(24, size.height * 0.09)
    let baseFont = OverlayText.font(fontName, baseSize)
    let lineHeight = ceil(baseFont.lineHeight * 1.12)

    let container = CALayer()
    container.frame = blockFrame(width: maxWidth, height: lineHeight)

    for (index, token) in tokens.enumerated() {
      let until = index + 1 < tokens.count ? tokens[index + 1].start : end
      guard until - token.start > 0.01 else { continue }

      var font = baseFont
      let width = OverlayText.width(token.text, font: font)
      if width > maxWidth - 8, width > 0 {
        font = OverlayText.font(fontName, floor(baseSize * (maxWidth - 8) / width))
      }
      let frame = CGRect(x: 0, y: 0, width: maxWidth, height: lineHeight)
      let word = OverlayText.layer(token.text, font: font, color: accent, frame: frame)
      word.opacity = 0
      word.add(OverlayTiming.visibility(from: token.start, to: until, total: total), forKey: "wordVisibility")
      word.add(OverlayTiming.scaleIn(at: token.start), forKey: "wordPop")
      container.addSublayer(word)
    }
    return container
  }
}

// MARK: - Transcription (Apple Speech framework)

/// Resumes one recognition request exactly once, whichever comes first: the
/// recognizer's final result or error, a user cancel, or the timeout. Also
/// keeps the recognition task alive so it can be cancelled.
private final class ResumeGate {
  typealias Outcome = Result<[KareviaTranscriber.Word], Error>

  private let lock = NSLock()
  private var used = false
  private var task: SFSpeechRecognitionTask?
  private var continuation: CheckedContinuation<[KareviaTranscriber.Word], Error>?
  /// A result that arrived before the continuation existed.
  private var early: Outcome?

  func start(_ newContinuation: CheckedContinuation<[KareviaTranscriber.Word], Error>) {
    lock.lock()
    if used, let outcome = early {
      early = nil
      lock.unlock()
      newContinuation.resume(with: outcome)
      return
    }
    continuation = newContinuation
    lock.unlock()
  }

  func hold(_ newTask: SFSpeechRecognitionTask) {
    lock.lock()
    let finished = used
    if !finished { task = newTask }
    lock.unlock()
    if finished { newTask.cancel() }
  }

  /// Delivers the outcome the first time only; later calls are ignored.
  @discardableResult
  func finish(_ outcome: Outcome) -> Bool {
    lock.lock()
    if used {
      lock.unlock()
      return false
    }
    used = true
    let pending = continuation
    continuation = nil
    if pending == nil { early = outcome }
    task = nil
    lock.unlock()
    pending?.resume(with: outcome)
    return true
  }

  /// Stops recognition and fails the request with `error`.
  func cancel(with error: Error) {
    lock.lock()
    let running = task
    lock.unlock()
    if finish(.failure(error)) { running?.cancel() }
  }
}

/// One transcription at a time, cancellable from JS between and during chunks.
private final class TranscribeState {
  static let cancelledError = EditFailure.coded("speech-cancelled", "Caption generation was cancelled.")

  private let lock = NSLock()
  private var active = false
  private var cancelled = false
  private var gate: ResumeGate?

  func begin() throws {
    lock.lock()
    defer { lock.unlock() }
    if active { throw EditFailure.coded("speech-busy", "Captions are already being generated.") }
    active = true
    cancelled = false
    gate = nil
  }

  func end() {
    lock.lock()
    active = false
    gate = nil
    lock.unlock()
  }

  /// False when cancel() already ran.
  func attach(_ newGate: ResumeGate) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if cancelled { return false }
    gate = newGate
    return true
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func cancel() {
    lock.lock()
    guard active else {
      lock.unlock()
      return
    }
    cancelled = true
    let current = gate
    lock.unlock()
    current?.cancel(with: TranscribeState.cancelledError)
  }
}

private enum KareviaTranscriber {
  struct Word {
    let text: String
    let start: Double
    let end: Double
  }

  /// Server-based recognition stops at about one minute per request; on
  /// device the same pieces report real progress after each one.
  static let chunkSeconds: Double = 55
  static let timescale: CMTimeScale = 600

  static func run(uri: URL, localeID: String, state: TranscribeState, emit: @escaping (Double) -> Void) async throws -> (words: [Word], onDevice: Bool) {
    guard uri.isFileURL, FileManager.default.fileExists(atPath: uri.path) else {
      throw EditFailure.invalid("Only local files are supported.")
    }

    // ---- Audio first, so a silent video never triggers a permission prompt
    let asset = AVURLAsset(url: uri)
    guard let source = try await asset.loadTracks(withMediaType: .audio).first else {
      throw EditFailure.coded("no-speech", "This video has no audio track.")
    }
    let sourceRange = try await source.load(.timeRange)
    let length = sourceRange.duration.seconds
    guard sourceRange.duration.isValid, length.isFinite, length > 0.05 else {
      throw EditFailure.coded("no-speech", "This video has no audio track.")
    }
    // The audio-only composition starts at 0; `lead` puts timestamps back on
    // the source clip's own timeline when its audio starts late.
    let leadSeconds = sourceRange.start.seconds
    let lead = leadSeconds.isFinite ? max(0, leadSeconds) : 0

    let audio = AVMutableComposition()
    guard let track = audio.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw EditFailure.unavailable
    }
    try track.insertTimeRange(sourceRange, of: source, at: CMTime.zero)

    // ---- Permission + recognizer
    // requestAuthorization aborts the process when the usage string is missing.
    guard Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") != nil else {
      throw EditFailure.coded("speech-denied", "Speech recognition is not enabled for this app (missing usage description).")
    }
    let status = await authorization()
    guard status == .authorized else {
      throw EditFailure.coded("speech-denied", "Speech recognition permission was not granted.")
    }
    let trimmed = localeID.trimmingCharacters(in: .whitespacesAndNewlines)
    let locale = trimmed.isEmpty ? Locale.current : Locale(identifier: trimmed)
    guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
      throw EditFailure.coded("speech-unavailable", "Speech recognition is not available for this language right now.")
    }
    let onDevice = recognizer.supportsOnDeviceRecognition

    // ---- Chunk plan: <= 55 s pieces, on the server and on device alike, so
    // progress moves after every piece instead of jumping from 0 to 100 %.
    // A word cut at a piece boundary is accepted (as on the server).
    var starts: [Double] = [0]
    if length > chunkSeconds {
      var next = chunkSeconds
      while next < length - 0.05, starts.count < 10_000 {
        starts.append(next)
        next += chunkSeconds
      }
    }

    emit(0)
    var words: [Word] = []
    for (index, chunkStart) in starts.enumerated() {
      try Task.checkCancellation()
      if state.isCancelled { throw TranscribeState.cancelledError }
      let chunkEnd = index + 1 < starts.count ? starts[index + 1] : length
      let range = CMTimeRange(
        start: CMTime(seconds: chunkStart, preferredTimescale: timescale),
        end: CMTime(seconds: chunkEnd, preferredTimescale: timescale))
      let file = try await exportAudio(from: audio, range: range)
      defer { try? FileManager.default.removeItem(at: file) }

      let found = try await recognize(url: file, recognizer: recognizer, onDevice: onDevice, length: chunkEnd - chunkStart, state: state)
      let offset = lead + chunkStart
      for word in found {
        words.append(Word(text: word.text, start: word.start + offset, end: word.end + offset))
      }
      emit(Double(index + 1) / Double(starts.count))
    }

    guard !words.isEmpty else {
      throw EditFailure.coded("no-speech", "No speech was found in this video.")
    }
    return (words: words, onDevice: onDevice)
  }

  static func authorization() async -> SFSpeechRecognizerAuthorizationStatus {
    return await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status)
      }
    }
  }

  /// Writes one time range of the audio to a temporary .m4a (caller deletes it).
  static func exportAudio(from audio: AVAsset, range: CMTimeRange) async throws -> URL {
    guard let session = AVAssetExportSession(asset: audio, presetName: AVAssetExportPresetAppleM4A) else {
      throw EditFailure.unavailable
    }
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("karevia-speech-\(UUID().uuidString).m4a")
    session.outputURL = file
    session.outputFileType = .m4a
    session.timeRange = range
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { done.resume() }
    }
    guard session.status == .completed else {
      try? FileManager.default.removeItem(at: file)
      throw session.error ?? EditFailure.invalid("Could not read the audio of this video.")
    }
    return file
  }

  /// One recognition request; word times are relative to the start of `url`.
  static func recognize(url: URL, recognizer: SFSpeechRecognizer, onDevice: Bool, length: Double, state: TranscribeState) async throws -> [Word] {
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    if onDevice { request.requiresOnDeviceRecognition = true }
    request.addsPunctuation = true  // iOS 16+, the module's minimum is 16.4

    let gate = ResumeGate()
    guard state.attach(gate) else { throw TranscribeState.cancelledError }
    // The recognizer may never deliver a final result; never wait forever.
    let timeout = max(60, length * 3)
    DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak gate] in
      gate?.cancel(with: EditFailure.coded("speech-timeout", "Speech recognition took too long."))
    }
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[Word], Error>) in
      gate.start(continuation)
      let task = recognizer.recognitionTask(with: request) { result, error in
        // The handler can fire more than once; the gate keeps only the first outcome.
        if let result = result, result.isFinal {
          let found = KareviaTranscriber.words(from: result.bestTranscription.segments, length: length)
          gate.finish(.success(found))
          return
        }
        guard let error = error else { return }
        if KareviaTranscriber.isNoSpeech(error) {
          gate.finish(.success([]))
        } else {
          gate.finish(.failure(error))
        }
      }
      gate.hold(task)
    }
  }

  /// "No speech detected" is an empty chunk, not a failure.
  static func isNoSpeech(_ error: Error) -> Bool {
    let detail = error as NSError
    return detail.domain == "kAFAssistantErrorDomain" && detail.code == 1110
  }

  static func words(from segments: [SFTranscriptionSegment], length: Double) -> [Word] {
    var kept: [(text: String, start: Double, duration: Double)] = []
    for segment in segments {
      let text = segment.substring.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty { continue }
      let start = segment.timestamp.isFinite ? max(0, segment.timestamp) : 0
      let duration = segment.duration.isFinite ? max(0, segment.duration) : 0
      kept.append((text: text, start: start, duration: duration))
    }

    // Some iOS releases return final segments with all-zero timing; spread the
    // words evenly over the chunk rather than stacking them at 0.
    var untimed = kept.count > 1
    for item in kept where item.start > 0 || item.duration > 0 {
      untimed = false
      break
    }

    var out: [Word] = []
    let slot = kept.isEmpty ? 0 : max(0, length) / Double(kept.count)
    for (index, item) in kept.enumerated() {
      if untimed {
        out.append(Word(text: item.text, start: Double(index) * slot, end: Double(index + 1) * slot))
      } else {
        out.append(Word(text: item.text, start: item.start, end: item.start + item.duration))
      }
    }
    return out
  }
}
