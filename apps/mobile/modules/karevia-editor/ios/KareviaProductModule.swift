import AVFoundation
import CoreImage
import CoreML
import CoreText
import ExpoModulesCore
import ImageIO
import UIKit
import Vision
#if canImport(FoundationModels)
import FoundationModels
#endif
#if canImport(Translation)
import Translation
#endif

// Product videos: cut a product out of a photo and render a template video
// from it entirely on the device. Templates are plain keyframe data built in
// TypeScript (src/product-templates.ts); this file only interpolates and draws.

// MARK: - Errors

private enum ProductFailure: LocalizedError {
  case invalid(String)
  case coded(String, String)
  case busy
  case cancelled
  case unavailable
  /// A newer preview request (or a render) replaced this preview pass.
  case stalePreview
  /// The app went to the background, where iOS takes the encoder away.
  case backgrounded

  var errorDescription: String? {
    switch self {
    case .invalid(let reason): return reason
    case .coded(let code, let reason): return "\(code): \(reason)"
    case .busy: return "Another product video is already rendering."
    case .cancelled: return "The product video was cancelled."
    case .stalePreview: return "product-preview-stale: A newer preview replaced this one."
    case .backgrounded:
      return "product-backgrounded: The video was stopped because the app went to the background. Keep Vidora open while it renders."
    case .unavailable: return "The system could not encode this video."
    }
  }

  static let noSpace = ProductFailure.coded("product-no-space", "The device is out of storage.")
}

/// True when `error` (or an error under it) means the disk is full:
/// Cocoa 640 (NSFileWriteOutOfSpaceError), POSIX 28 (ENOSPC) or
/// AVFoundation -11807 (AVError.diskFull).
private func isOutOfSpace(_ error: Error) -> Bool {
  var current: NSError? = error as NSError
  var depth = 0
  while let e = current, depth < 8 {
    if (e.domain == NSCocoaErrorDomain && e.code == NSFileWriteOutOfSpaceError)
      || (e.domain == NSPOSIXErrorDomain && e.code == Int(ENOSPC))
      || (e.domain == AVFoundationErrorDomain && e.code == AVError.Code.diskFull.rawValue) {
      return true
    }
    current = e.userInfo[NSUnderlyingErrorKey] as? NSError
    depth += 1
  }
  return false
}

/// Writes `data`, reporting a full disk as "product-no-space".
private func writeFile(_ data: Data, to url: URL, options: Data.WritingOptions = []) throws {
  do {
    try data.write(to: url, options: options)
  } catch {
    throw isOutOfSpace(error) ? ProductFailure.noSpace : error
  }
}

// MARK: - App in the background

/// Whether the app is in the background, and how many times it went there.
/// iOS takes the GPU away in the background, so Core Image work (previews,
/// stills, cut-outs) started or finished there may come out degraded.
private enum AppActivity {
  private static let lock = NSLock()
  private static var background = false
  private static var epoch: UInt64 = 0
  private static var observers: [NSObjectProtocol] = []

  /// Starts observing; call once when the module is created.
  static func start() {
    lock.lock()
    defer { lock.unlock() }
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: Notification.Name("UIApplicationDidEnterBackgroundNotification"), object: nil, queue: nil
    ) { _ in
      AppActivity.lock.lock()
      AppActivity.background = true
      AppActivity.epoch &+= 1
      AppActivity.lock.unlock()
    })
    observers.append(center.addObserver(
      forName: Notification.Name("UIApplicationDidBecomeActiveNotification"), object: nil, queue: nil
    ) { _ in
      AppActivity.lock.lock()
      AppActivity.background = false
      AppActivity.lock.unlock()
    })
  }

  /// A mark to compare with later: nil while the app is in the background.
  static func mark() -> UInt64? {
    lock.lock()
    defer { lock.unlock() }
    return background ? nil : epoch
  }

  /// True when the app is in the foreground and has not left it since `mark`.
  static func unchanged(since mark: UInt64?) -> Bool {
    guard let mark else { return false }
    lock.lock()
    defer { lock.unlock() }
    return !background && epoch == mark
  }
}

// MARK: - JS records

struct ProductKeySpec: Record {
  init() {}
  @Field var t: Double = 0
  @Field var x: Double = 0.5
  @Field var y: Double = 0.5
  @Field var scale: Double = 0.5
  @Field var rotation: Double = 0
  @Field var opacity: Double = 1
  /// Turn around the vertical axis in degrees (perspective), -35...35.
  @Field var yaw: Double = 0
  @Field var ease: String = "inOut"
}

struct ProductTextSpec: Record {
  init() {}
  @Field var text: String = ""
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var y: Double = 0.5
  @Field var size: Double = 0.06
  @Field var weight: String = "bold"
  @Field var color: String = "#FFFFFF"
  @Field var fill: String = ""
  @Field var animation: String = "fade"
  /// How the text leaves when it ends before the video; "" = mirror of `animation`.
  @Field var exit: String = ""
  /// Struck through (old price).
  @Field var strike: Bool = false
  /// Type family: system, modern, elegant, editorial, impact or poster.
  @Field var font: String = "system"
  /// Extra letter spacing in ems.
  @Field var tracking: Double = 0
}

struct ProductBackgroundSpec: Record {
  init() {}
  @Field var top: String = "#222222"
  @Field var bottom: String = "#000000"
  @Field var glow: String = "#444444"
  @Field var floor: Bool = false
  /// Local scene image drawn instead of the gradient; empty = none.
  @Field var image: String = ""
  /// Horizontal part of the image to use (fractions of its width).
  @Field var imageX: Double = 0
  @Field var imageWidth: Double = 1
  /// Vertical part of the image to use (fractions of its height, from the top).
  @Field var imageY: Double = 0
  @Field var imageHeight: Double = 1
  /// 0...1 strength of the top/bottom darkening over the image.
  @Field var shade: Double = 1
  /// 0 < split < 1: hard two-colour split instead of the gradient; `top` fills
  /// x < split * width, `bottom` the rest. 0 = the top-to-bottom gradient.
  @Field var split: Double = 0
}

struct ProductCameraSpec: Record {
  init() {}
  @Field var zoomFrom: Double = 1
  @Field var zoomTo: Double = 1
}

struct ProductSweepSpec: Record {
  init() {}
  @Field var start: Double = 0
  @Field var duration: Double = 1
}

struct ProductSparkleSpec: Record {
  init() {}
  @Field var count: Int = 0
  @Field var color: String = "#FFFFFF"
  @Field var seed: Int = 1
}

/// A camera cut: from `t` the camera zooms by `zoom` onto a point given as
/// offsets from the product centre in product widths/heights.
struct ProductShotSpec: Record {
  init() {}
  @Field var t: Double = 0
  @Field var zoom: Double = 1
  @Field var focusX: Double = 0
  @Field var focusY: Double = 0
}

/// Finishing strengths, each 0...1.
struct ProductLookSpec: Record {
  init() {}
  @Field var grain: Double = 0.35
  @Field var vignette: Double = 0.3
  @Field var sceneBlur: Double = 0.4
  @Field var parallax: Double = 0.4
  @Field var harmonize: Double = 0.4
  /// 0...1 strength of the cut-out edge refinement (erode + feather); 0 = off.
  @Field var edge: Double = 1
  /// 0...1 strength of the floor reflection when `reflection` is on (1 = 0.32 alpha).
  @Field var reflectionStrength: Double = 1
}

struct ProductMusicSpec: Record {
  init() {}
  @Field var uri: String = ""
  @Field var volume: Double = 1
}

/// How a scene enters: "cut", "push", "wipe" or "zoom" over `duration` seconds.
struct SceneTransitionSpec: Record {
  init() {}
  @Field var kind: String = "cut"
  @Field var duration: Double = 0
}

/// One scene of a multi-scene video. `keys` and `shots` are relative to `start`.
/// "cutout": drawn like the single-product spec with `image` as the product.
/// "photo": `image` cover-fills the frame; the keys' scale is a zoom (1 = exact
/// fill, values below 1 count as 1, at most 1.5) and x/y the photo point
/// (fractions) put at the frame centre, as far as the photo still covers it.
/// "depth": the photo split into depth layers (Depth Anything) for a 2.5D
/// camera move; scale = dolly (1...1.4), x/y = camera offset (-1...1); rotation,
/// yaw and opacity are ignored. Without depth it is drawn as a photo scene.
struct ProductSceneSpec: Record {
  init() {}
  @Field var start: Double = 0
  @Field var image: String = ""
  @Field var mode: String = "cutout"
  @Field var keys: [ProductKeySpec] = []
  /// Cut-out scenes only; nil uses the video's background.
  @Field var background: ProductBackgroundSpec? = nil
  @Field var shots: [ProductShotSpec] = []
  @Field var transition: SceneTransitionSpec = SceneTransitionSpec()
  /// 0...1 black over a photo scene, for text.
  @Field var shade: Double = 0
}

struct ProductVideoSpec: Record {
  init() {}
  @Field var product: String = ""
  @Field var quality: String = "720p"
  @Field var duration: Double = 8
  @Field var fps: Int = 30
  /// "compact" keeps marketplace uploads small; "high" for social apps.
  @Field var bitrate: String = "high"
  @Field var background: ProductBackgroundSpec = ProductBackgroundSpec()
  @Field var camera: ProductCameraSpec = ProductCameraSpec()
  @Field var keys: [ProductKeySpec] = []
  @Field var shadow: Bool = true
  @Field var reflection: Bool = false
  @Field var sweeps: [ProductSweepSpec] = []
  @Field var sparkles: ProductSparkleSpec? = nil
  @Field var texts: [ProductTextSpec] = []
  @Field var watermark: Bool = true
  @Field var music: ProductMusicSpec? = nil
  /// 0...1 strength of the depth-based relief light; 0 turns it off.
  @Field var relief: Double = 0
  /// Frame shape: "9:16", "4:5", "1:1" or "2:3".
  @Field var ratio: String = "9:16"
  /// "full": cast shadow plus contact shadow; "contact": only the soft occlusion under the base.
  @Field var shadowStyle: String = "full"
  /// Texts the template builder left out ("cta", "badge"); informational only.
  @Field var dropped: [String] = []
  /// Camera cuts; empty = one continuous shot.
  @Field var shots: [ProductShotSpec] = []
  /// Composite finishing; nil uses the defaults of ProductLookSpec.
  @Field var look: ProductLookSpec? = nil
  /// Multi-scene video; empty = the single-product path.
  @Field var scenes: [ProductSceneSpec] = []
}

// MARK: - One render at a time

private final class RenderState {
  private let lock = NSLock()
  private var active = false
  private var cancelled = false
  private var backgrounded = false
  private var task: Task<String, Error>?

  func begin() throws {
    lock.lock()
    defer { lock.unlock() }
    if active { throw ProductFailure.busy }
    active = true
    cancelled = false
    backgrounded = false
    task = nil
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
  }

  func attach(_ newTask: Task<String, Error>) {
    lock.lock()
    let shouldCancel = cancelled
    if active { task = newTask }
    lock.unlock()
    if shouldCancel { newTask.cancel() }
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
    let current = task
    lock.unlock()
    current?.cancel()
  }
}

// MARK: - Previews: one at a time, newest wins

/// Preview passes run one after another on a serial queue. Every request
/// (and every render) takes a new generation; a pass whose generation is no
/// longer current stops before preparing and between frames.
private final class PreviewGate: @unchecked Sendable {
  private let lock = NSLock()
  private var generation: UInt64 = 0
  private let queue = DispatchQueue(label: "app.vidora.product.preview", qos: .userInitiated)

  /// Makes every queued or running preview pass stale.
  @discardableResult
  func invalidate() -> UInt64 {
    lock.lock()
    defer { lock.unlock() }
    generation &+= 1
    return generation
  }

  func isCurrent(_ token: UInt64) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return generation == token
  }

  /// Runs `work` on the preview queue; it gets a check that is false once a
  /// newer request arrived or the app went to the background (then the pass
  /// ends as stale: nothing drawn in the background is handed out).
  func run<T>(_ work: @escaping (_ isCurrent: @escaping () -> Bool) throws -> T) async throws -> T {
    let token = invalidate()
    let mark = AppActivity.mark()
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
      queue.async {
        do {
          let current = { self.isCurrent(token) && AppActivity.unchanged(since: mark) }
          guard current() else { throw ProductFailure.stalePreview }
          let result = try work(current)
          // A pass that ran into the background may hold degraded frames.
          guard current() else { throw ProductFailure.stalePreview }
          continuation.resume(returning: result)
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }
}

// MARK: - Long renders: keep the screen on, ask for background time

/// Ends the background task exactly once, whether time runs out or the render finishes.
@MainActor
private final class ProductBackgroundTicket {
  var task = UIBackgroundTaskIdentifier.invalid

  func finish() {
    guard task != .invalid else { return }
    UIApplication.shared.endBackgroundTask(task)
    task = .invalid
  }
}

@MainActor
private enum ProductWorkGuard {
  /// `onExpire` runs if iOS takes the background time away; the render is then cancelled.
  static func begin(onExpire: @escaping () -> Void) -> ProductBackgroundTicket {
    UIApplication.shared.isIdleTimerDisabled = true
    let ticket = ProductBackgroundTicket()
    ticket.task = UIApplication.shared.beginBackgroundTask(withName: "Vidora product video") {
      onExpire()
      ticket.finish()
    }
    return ticket
  }

  static func end(_ ticket: ProductBackgroundTicket) {
    UIApplication.shared.isIdleTimerDisabled = false
    ticket.finish()
  }
}

// MARK: - Module

public class KareviaProductModule: Module {
  private let renderState = RenderState()
  private let previewGate = PreviewGate()

  public func definition() -> ModuleDefinition {
    Name("KareviaProduct")

    Events("onRenderProgress")

    OnCreate {
      AppActivity.start()
      // The app's font chips draw in these faces before any video text does.
      ProductFonts.registerOnce()
    }

    /// Cuts the main subject out of a photo and writes it as a PNG with
    /// transparency, cropped to the subject. Requires iOS 17.
    AsyncFunction("cutout") { (source: URL, dest: URL) async throws -> [String: Any] in
      guard source.isFileURL, dest.isFileURL else {
        throw ProductFailure.invalid("Only local files are supported.")
      }
      guard !FileManager.default.fileExists(atPath: dest.path) else {
        throw ProductFailure.invalid("The destination file already exists.")
      }
      // Vision and Core Image need the GPU, which iOS takes away in the background.
      let mark = AppActivity.mark()
      guard mark != nil else { throw ProductCutout.backgrounded }
      // The module's deployment target is iOS 17, so the cut-out is always available.
      let work = Task.detached(priority: .userInitiated) { () throws -> [String: Any] in
        try ProductCutout.run(source: source, dest: dest)
      }
      let result: [String: Any]
      do {
        result = try await work.value
      } catch {
        if !AppActivity.unchanged(since: mark) { throw ProductCutout.backgrounded }
        throw error
      }
      // A result made while the app was away may be degraded: drop it.
      guard AppActivity.unchanged(since: mark) else {
        try? FileManager.default.removeItem(at: dest)
        throw ProductCutout.backgrounded
      }
      return result
    }

    AsyncFunction("render") { (spec: ProductVideoSpec, dest: URL) async throws -> String in
      try self.renderState.begin()
      defer { self.renderState.end() }
      // The render gets the device to itself: pending preview passes stop.
      self.previewGate.invalidate()
      // Keep the screen awake and ask for background time, as the editor export does.
      let state = self.renderState
      let ticket = await ProductWorkGuard.begin(onExpire: { state.cancel() })
      defer { Task { @MainActor in ProductWorkGuard.end(ticket) } }
      // In the background iOS revokes the hardware encoder and the GPU: stop
      // right away with a clear error instead of failing somewhere inside.
      let observer = NotificationCenter.default.addObserver(
        forName: Notification.Name("UIApplicationDidEnterBackgroundNotification"), object: nil, queue: nil
      ) { _ in state.cancelForBackground() }
      defer { NotificationCenter.default.removeObserver(observer) }
      guard dest.isFileURL else { throw ProductFailure.invalid("The destination must be a local file.") }
      guard !FileManager.default.fileExists(atPath: dest.path) else {
        throw ProductFailure.invalid("The destination file already exists.")
      }
      let emit: (Double) -> Void = { [weak self] value in
        let clamped = max(0, min(1, value.isFinite ? value : 0))
        self?.sendEvent("onRenderProgress", ["progress": clamped])
      }
      let work = Task<String, Error> {
        try await ProductRenderer.run(spec: spec, dest: dest, state: state, emit: emit)
      }
      state.attach(work)
      do {
        return try await work.value
      } catch {
        try? FileManager.default.removeItem(at: dest)
        if state.wasBackgrounded { throw ProductFailure.backgrounded }
        if state.isCancelled || error is CancellationError { throw ProductFailure.cancelled }
        if isOutOfSpace(error) { throw ProductFailure.noSpace }
        throw error
      }
    }

    Function("cancelRender") {
      self.renderState.cancel()
    }

    /// Short ad copy from Apple's on-device model (iOS 26, Apple Intelligence).
    /// Returns {available: false} when the model or language is unavailable;
    /// otherwise {available: true, text}, parsed in TypeScript.
    AsyncFunction("suggestCopy") { (category: String, product: String, lang: String) async throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return try await ProductCopywriter.suggest(category: category, product: product, lang: lang)
      }
      #endif
      return ["available": false]
    }

    /// Whether suggestCopy can run for `lang`, without generating anything:
    /// {available, reason} with reason "device" (not eligible), "off" (Apple
    /// Intelligence turned off), "notReady" (model still downloading),
    /// "language" (not offered in this language) or "os" (before iOS 26).
    AsyncFunction("copyAvailability") { (lang: String) -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return ProductCopywriter.availability(lang: lang)
      }
      #endif
      return ["available": false, "reason": "os"]
    }

    /// Marketplace listing text (title, description, bullets, keywords) from
    /// Apple's on-device model as raw text; the prompt asks for JSON, parsed in
    /// TypeScript (src/listing.ts). Throws "product-listing-unavailable" when
    /// the model or the language cannot be used.
    AsyncFunction("listingText") { (name: String, category: String, price: String, lang: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return try await ProductCopywriter.listing(name: name, category: category, price: price, lang: lang)
      }
      #endif
      throw ProductCopyErrors.listingUnavailable
    }

    /// The texts translated on the device (Translation framework, iOS 26
    /// session without UI), in order. Any failure, including languages that
    /// are not downloaded yet, throws "product-translate-unavailable".
    AsyncFunction("translateTexts") { (texts: [String], source: String, target: String) async throws -> [String] in
      #if canImport(Translation)
      if #available(iOS 26.0, *) {
        return try await ProductTranslator.translate(texts, source: source, target: target)
      }
      #endif
      throw ProductCopyErrors.translateUnavailable
    }

    /// Which languages listing text can be written in ("tr", "en", "de") and
    /// translated into: {write: [...], translate: [...]}. Translation targets
    /// are only checked when something can be written.
    AsyncFunction("textAvailability") { () async -> [String: Any] in
      var write: [String] = []
      var translate: [String] = []
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        write = ProductCopywriter.listingLanguages()
      }
      #endif
      #if canImport(Translation)
      if #available(iOS 26.0, *) {
        translate = await ProductTranslator.availableTargets(from: write)
      }
      #endif
      return ["write": write, "translate": translate]
    }

    /// Puts `text` on the general pasteboard ("Kopyala" in the listing sheet).
    AsyncFunction("copyText") { (text: String) async throws -> Bool in
      await MainActor.run {
        UIPasteboard.general.string = text
      }
      return true
    }

    /// One frame of the video as a JPEG, for previews. Runs on the preview
    /// queue; a newer preview request or a render makes it fail with
    /// "product-preview-stale".
    AsyncFunction("frame") { (spec: ProductVideoSpec, time: Double, dest: URL) async throws -> String in
      guard dest.isFileURL else { throw ProductFailure.invalid("The destination must be a local file.") }
      guard time.isFinite, time >= 0 else { throw ProductFailure.invalid("Invalid preview time.") }
      return try await self.previewGate.run { isCurrent in
        try ProductRenderer.previewFrame(spec: spec, time: time, dest: dest, isCurrent: isCurrent)
      }
    }

    /// One frame as an image ("Görsel olarak kaydet", marketplace images):
    /// PNG when `dest` ends in .png, otherwise JPEG. `width` 0 gives the video
    /// size; otherwise that width (500...4096) in the spec's shape.
    AsyncFunction("still") { (spec: ProductVideoSpec, time: Double, dest: URL, width: Double, maxBytes: Double) async throws -> [String: Any] in
      guard dest.isFileURL else { throw ProductFailure.invalid("The destination must be a local file.") }
      guard time.isFinite, time >= 0 else { throw ProductFailure.invalid("Invalid still time.") }
      guard width.isFinite, width == 0 || (width >= 500 && width <= 4096) else {
        throw ProductFailure.invalid("Unsupported image size.")
      }
      guard maxBytes.isFinite, maxBytes >= 0, maxBytes <= 1e10 else { throw ProductFailure.invalid("Invalid file size limit.") }
      let stillBackgrounded = ProductFailure.coded(
        "product-still-backgrounded", "The app went to the background while the image was drawn.")
      let mark = AppActivity.mark()
      guard mark != nil else { throw stillBackgrounded }
      let work = Task.detached(priority: .userInitiated) { () throws -> [String: Any] in
        try ProductRenderer.still(spec: spec, time: time, dest: dest, width: width, maxBytes: Int(maxBytes))
      }
      let result: [String: Any]
      do {
        result = try await work.value
      } catch {
        if !AppActivity.unchanged(since: mark) { throw stillBackgrounded }
        throw error
      }
      // Drawn (partly) in the background: Core Image may have returned a degraded image.
      guard AppActivity.unchanged(since: mark) else {
        try? FileManager.default.removeItem(at: dest)
        throw stillBackgrounded
      }
      return result
    }

    /// Size and brightness of a photo used as a scene: upright pixel size,
    /// mean luma, and the mean luma of the text bands of its centred 9:16 part.
    AsyncFunction("imageInfo") { (source: URL) async throws -> [String: Any] in
      guard source.isFileURL else { throw ProductFailure.invalid("Only local files are supported.") }
      let work = Task.detached(priority: .userInitiated) { () throws -> [String: Any] in
        try ProductImages.info(source)
      }
      return try await work.value
    }

    /// Many small frames for the playing preview. The scene is prepared once,
    /// then each time in `times` is drawn `width` px wide (240...1080, default
    /// 360; height by ratio) into `destDir` as frame-000.jpg, frame-001.jpg, …
    /// Returns the file URLs in order.
    AsyncFunction("frames") { (spec: ProductVideoSpec, times: [Double], destDir: URL, width: Double?) async throws -> [String] in
      let w: CGFloat = width.map { $0.isFinite ? CGFloat(min(1080, max(240, $0.rounded()))) : 360 } ?? 360
      guard destDir.isFileURL else { throw ProductFailure.invalid("The destination must be a local folder.") }
      guard !times.isEmpty, times.count <= 240 else { throw ProductFailure.invalid("Invalid preview times.") }
      guard times.allSatisfy({ $0.isFinite && $0 >= 0 }) else { throw ProductFailure.invalid("Invalid preview time.") }
      return try await self.previewGate.run { isCurrent in
        try ProductRenderer.previewFrames(spec: spec, times: times, destDir: destDir, width: w, isCurrent: isCurrent)
      }
    }
  }
}

// MARK: - On-device copywriting

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private enum ProductCopywriter {
  static func availability(lang: String) -> [String: Any] {
    let model = SystemLanguageModel.default
    switch model.availability {
    case .available:
      let code = lang == "tr" ? "tr" : "en"
      guard model.supportedLanguages.contains(where: { $0.languageCode?.identifier == code }) else {
        return ["available": false, "reason": "language"]
      }
      return ["available": true, "reason": ""]
    case .unavailable(.deviceNotEligible):
      return ["available": false, "reason": "device"]
    case .unavailable(.appleIntelligenceNotEnabled):
      return ["available": false, "reason": "off"]
    case .unavailable(.modelNotReady):
      return ["available": false, "reason": "notReady"]
    default:
      // A reason added in a later iOS: treat as temporary, the app asks again.
      return ["available": false, "reason": "notReady"]
    }
  }

  static func suggest(category: String, product: String, lang: String) async throws -> [String: Any] {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else { return ["available": false] }
    let code = lang == "tr" ? "tr" : "en"
    guard model.supportedLanguages.contains(where: { $0.languageCode?.identifier == code }) else {
      return ["available": false]
    }
    let name = String(product.prefix(60))
    let kind = String(category.prefix(40))
    let instructions: String
    let prompt: String
    if code == "tr" {
      instructions = """
        Sen bir e-ticaret reklam metin yazarısın. Kısa, doğal ve abartısız Türkçe yazarsın. \
        Sağlık, indirim ya da garanti gibi doğrulanamayan iddialar uydurmazsın. Emoji kullanmazsın.
        """
      prompt = """
        Ürün kategorisi: \(kind). Ürün: \(name.isEmpty ? "belirtilmedi" : name).
        Dikey ürün videosu için 3 başlık (en fazla 5 kelime) ve 3 harekete geçirici çağrı (en fazla 4 kelime) yaz.
        Her başlığı "B: " ile, her çağrıyı "Ç: " ile başlayan ayrı bir satıra yaz. Başka bir şey yazma.
        """
    } else {
      instructions = """
        You are an e-commerce ad copywriter. You write short, natural, understated English. \
        You never invent unverifiable claims such as health benefits, discounts or warranties. No emoji.
        """
      prompt = """
        Product category: \(kind). Product: \(name.isEmpty ? "not given" : name).
        Write 3 headlines (at most 5 words) and 3 calls to action (at most 4 words) for a vertical product video.
        Put each headline on its own line starting with "B: " and each call to action on its own line starting with "C: ". Nothing else.
        """
    }
    let session = LanguageModelSession(instructions: instructions)
    let response = try await session.respond(to: prompt)
    return ["available": true, "text": response.content]
  }

  /// Listing languages the model can write in now, in a fixed order; empty
  /// when the model cannot run (not eligible, turned off, downloading).
  static func listingLanguages() -> [String] {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else { return [] }
    return ["tr", "en", "de"].filter { code in
      model.supportedLanguages.contains(where: { $0.languageCode?.identifier == code })
    }
  }

  /// Raw model text for a marketplace listing; the prompt asks for one JSON object.
  static func listing(name: String, category: String, price: String, lang: String) async throws -> String {
    let model = SystemLanguageModel.default
    guard case .available = model.availability else { throw ProductCopyErrors.listingUnavailable }
    let code = ["tr", "en", "de"].contains(lang) ? lang : "en"
    guard model.supportedLanguages.contains(where: { $0.languageCode?.identifier == code }) else {
      throw ProductCopyErrors.listingUnavailable
    }
    let product = String(name.prefix(80))
    let kind = String(category.prefix(40))
    let cost = String(price.prefix(30))
    let language: String
    let locale: String
    if code == "tr" {
      language = "Turkish"
      locale = "tr_TR"
    } else if code == "de" {
      language = "German"
      locale = "de_DE"
    } else {
      language = "English"
      locale = "en_US"
    }
    let instructions = """
      You write product listings for online marketplaces. The person's locale is \(locale). \
      You MUST respond in \(language). Write plain, natural, understated text. \
      Never invent unverifiable claims such as health benefits, discounts, warranties or certifications. \
      Never invent materials, sizes or features that are not given. No emoji. \
      Answer with one JSON object only, no other text.
      """
    let prompt = """
      Product: \(product.isEmpty ? "not given" : product)
      Category: \(kind)
      Price: \(cost.isEmpty ? "not given" : cost)
      Write a marketplace listing in \(language) as one JSON object with exactly these keys:
      "title": a product title of at most 90 characters,
      "description": 2 or 3 short sentences,
      "bullets": an array of 3 to 5 short feature lines,
      "keywords": an array of 8 to 15 search keywords.
      Do not mention the price unless it is given.
      """
    let session = LanguageModelSession(instructions: instructions)
    let response = try await session.respond(to: prompt)
    return response.content
  }
}
#endif

/// Coded errors of the listing text and translation functions, usable on every iOS version.
private enum ProductCopyErrors {
  static let listingUnavailable = ProductFailure.coded(
    "product-listing-unavailable", "Listing text is not available on this device.")
  static let translateUnavailable = ProductFailure.coded(
    "product-translate-unavailable", "Translation is not available on this device right now.")
}

// MARK: - On-device translation

#if canImport(Translation)
@available(iOS 26.0, *)
private enum ProductTranslator {
  /// Languages a listing can be translated into.
  static let targetCodes = ["en", "de", "fr", "es", "ar", "ru"]
  /// Source languages (the listing's own language).
  static let sourceCodes = ["tr", "en", "de"]
  static let maxTexts = 40
  static let maxLength = 4000

  /// True only for a pair that is installed: the session without UI cannot
  /// download languages, so ".supported" (downloadable) would always fail.
  static func usable(_ status: LanguageAvailability.Status) -> Bool {
    switch status {
    case .installed:
      return true
    default:
      return false
    }
  }

  /// Targets that every one of `sources` can be translated into; empty when
  /// there is no source. Main actor: the framework's isolation is not relied on.
  @MainActor
  static func availableTargets(from sources: [String]) async -> [String] {
    guard !sources.isEmpty else { return [] }
    let availability = LanguageAvailability()
    var result: [String] = []
    for target in targetCodes {
      var ok = true
      for source in sources where source != target {
        let status = await availability.status(
          from: Locale.Language(identifier: source), to: Locale.Language(identifier: target))
        if !usable(status) {
          ok = false
          break
        }
      }
      if ok { result.append(target) }
    }
    return result
  }

  /// `texts` translated from `source` into `target`, in order; empty texts stay empty.
  /// Main actor: creating and using the session never depends on its isolation.
  @MainActor
  static func translate(_ texts: [String], source: String, target: String) async throws -> [String] {
    guard sourceCodes.contains(source), targetCodes.contains(target), source != target,
          texts.count <= maxTexts else {
      throw ProductCopyErrors.translateUnavailable
    }
    var output: [String] = []
    output.reserveCapacity(texts.count)
    do {
      // `try` keeps this compiling should the initialiser ever throw (otherwise only a warning).
      let session = try TranslationSession(
        installedSource: Locale.Language(identifier: source), target: Locale.Language(identifier: target))
      for text in texts {
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
        if trimmed.isEmpty {
          output.append("")
          continue
        }
        let response = try await session.translate(trimmed)
        output.append(response.targetText)
      }
    } catch {
      NSLog("[VidoraTranslate] translation failed: %@", String(describing: error))
      throw ProductCopyErrors.translateUnavailable
    }
    return output
  }
}
#endif

// MARK: - Photos (scenes, photo check)

private enum ProductImages {
  /// Upright pixel size of the image at `url` (EXIF orientations 5...8 swap the sides).
  static func pixelSize(_ url: URL) -> CGSize? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let w = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
          let h = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
          w > 0, h > 0 else { return nil }
    let orientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    return orientation >= 5 && orientation <= 8 ? CGSize(width: h, height: w) : CGSize(width: w, height: h)
  }

  /// The image turned upright (EXIF) with its longer side at most `maxSide` (never enlarged).
  static func upright(_ url: URL, maxSide: CGFloat) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let longest = pixelSize(url).map { max($0.width, $0.height) } ?? maxSide
    let side = max(16, min(maxSide, longest))
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: Int(side.rounded()),
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
  }

  /// RGBA pixels (premultiplied, rows top to bottom) of `image` drawn at `size`.
  static func pixels(_ image: CGImage, size: CGSize) -> (data: [UInt8], width: Int, height: Int)? {
    let w = max(1, Int(size.width.rounded())), h = max(1, Int(size.height.rounded()))
    var data = [UInt8](repeating: 0, count: w * h * 4)
    let drawn: Bool = data.withUnsafeMutableBytes { buffer in
      guard let ctx = CGContext(
        data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      ctx.interpolationQuality = .medium
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    return drawn ? (data, w, h) : nil
  }

  /// Rec. 709 luma (0...255) of an opaque or premultiplied pixel at byte `i`.
  @inline(__always) static func luma(_ d: [UInt8], _ i: Int) -> Double {
    0.2126 * Double(d[i]) + 0.7152 * Double(d[i + 1]) + 0.0722 * Double(d[i + 2])
  }

  /// Mean luma (0...1) of rows `top..<bottom` and columns `left..<right`.
  static func meanLuma(_ p: (data: [UInt8], width: Int, height: Int),
                       left: Int, right: Int, top: Int, bottom: Int) -> Double {
    let x0 = max(0, left), x1 = min(p.width, right), y0 = max(0, top), y1 = min(p.height, bottom)
    guard x0 < x1, y0 < y1 else { return 0 }
    var sum = 0.0, count = 0
    for y in y0..<y1 {
      for x in x0..<x1 {
        sum += luma(p.data, (y * p.width + x) * 4)
        count += 1
      }
    }
    return count > 0 ? sum / Double(count) / 255 : 0
  }

  static func info(_ url: URL) throws -> [String: Any] {
    guard let size = pixelSize(url), let image = upright(url, maxSide: 256) else {
      throw ProductFailure.coded("product-unreadable", "The photo could not be read.")
    }
    guard let p = pixels(image, size: CGSize(width: image.width, height: image.height)) else {
      throw ProductFailure.unavailable
    }
    // The centred 9:16 part (what sceneCrop takes) and its text bands.
    let aspect = Double(p.width) / Double(max(1, p.height))
    var left = 0, right = p.width, top = 0, bottom = p.height
    if aspect >= 9.0 / 16.0 {
      let w = Int((Double(p.height) * 9 / 16).rounded())
      left = (p.width - w) / 2
      right = left + w
    } else {
      let h = Int((Double(p.width) * 16 / 9).rounded())
      top = (p.height - h) / 2
      bottom = top + h
    }
    let band = Double(bottom - top)
    func row(_ f: Double) -> Int { top + Int((band * f).rounded()) }
    return [
      "width": Int(size.width.rounded()),
      "height": Int(size.height.rounded()),
      "meanLuma": meanLuma(p, left: 0, right: p.width, top: 0, bottom: p.height),
      "topLuma": meanLuma(p, left: left, right: right, top: row(0.05), bottom: row(0.28)),
      "bottomLuma": meanLuma(p, left: left, right: right, top: row(0.7), bottom: row(0.97)),
    ]
  }

  /// Photo check for a cut-out: variance of the Laplacian of the product's
  /// luma (at most 512 px on the long side, only where the product and its
  /// four neighbours are opaque; -1 if too few such pixels) and the mean luma
  /// (0...1) of the whole photo.
  static func quality(cutout: CGImage, photo: CGImage) -> [String: Double] {
    var sharpness = -1.0
    let longest = CGFloat(max(cutout.width, cutout.height))
    let scale = min(1, 512 / max(1, longest))
    if let p = pixels(cutout, size: CGSize(width: CGFloat(cutout.width) * scale, height: CGFloat(cutout.height) * scale)),
       p.width >= 3, p.height >= 3 {
      let d = p.data, w = p.width
      var sum = 0.0, sumSq = 0.0, count = 0
      for y in 1..<(p.height - 1) {
        for x in 1..<(w - 1) {
          let i = (y * w + x) * 4
          let up = i - w * 4, down = i + w * 4, l = i - 4, r = i + 4
          guard d[i + 3] >= 242, d[up + 3] >= 242, d[down + 3] >= 242, d[l + 3] >= 242, d[r + 3] >= 242 else { continue }
          let lap = 4 * luma(d, i) - luma(d, up) - luma(d, down) - luma(d, l) - luma(d, r)
          sum += lap
          sumSq += lap * lap
          count += 1
        }
      }
      if count >= 500 {
        let mean = sum / Double(count)
        sharpness = max(0, sumSq / Double(count) - mean * mean)
      }
    }
    // Alpha-weighted mean: transparent pixels of a PNG that is already cut
    // out do not count as black (same value as before for opaque photos).
    var brightness = 0.5
    let photoScale = min(1, 128 / CGFloat(max(1, max(photo.width, photo.height))))
    if let p = pixels(photo, size: CGSize(width: CGFloat(photo.width) * photoScale, height: CGFloat(photo.height) * photoScale)) {
      var lumaSum = 0.0, alphaSum = 0.0
      for i in stride(from: 0, to: p.width * p.height * 4, by: 4) {
        lumaSum += luma(p.data, i)  // premultiplied: luma x alpha / 255
        alphaSum += Double(p.data[i + 3])
      }
      // Almost nothing opaque: no meaningful brightness, so no hint.
      if alphaSum / (255 * Double(max(1, p.width * p.height))) >= 0.05 {
        brightness = lumaSum / alphaSum
      }
    }
    return ["sharpness": sharpness, "brightness": brightness]
  }
}

// MARK: - Cutout

@available(iOS 17.0, *)
private enum ProductCutout {
  static let maxSide: CGFloat = 2048
  static let noSubject = ProductFailure.coded("product-no-subject", "No product was found in the photo.")
  static let backgrounded = ProductFailure.coded(
    "product-cutout-backgrounded", "The app went to the background while the product was cut out.")

  /// What Vision's subject lifting gave.
  enum VisionResult {
    case found(CGImage)
    /// No subject, or one too small to use: the photo may really have none.
    case empty
    /// The request itself failed; says nothing about the photo.
    case failed(Error)
  }

  static func run(source: URL, dest: URL) throws -> [String: Any] {
    // Decoded straight at the working size (EXIF applied): a 48 MP photo is
    // never decoded in full. The UIImage path stays as a fallback.
    let upright: CGImage
    if let thumb = ProductImages.upright(source, maxSide: maxSide) {
      upright = thumb
    } else if let image = UIImage(contentsOfFile: source.path) {
      upright = try uprightImage(image)
    } else {
      throw ProductFailure.coded("product-unreadable", "The photo could not be read.")
    }
    let cg: CGImage
    switch visionCutout(upright) {
    case .found(let image):
      cg = image
    case .empty:
      // Vision found nothing: try separating a plain background by colour.
      guard let plain = plainBackgroundCutout(upright) else { throw noSubject }
      cg = plain
    case .failed(let error):
      NSLog("[VidoraCutout] Vision failed: %@", String(describing: error))
      #if targetEnvironment(simulator)
      // The simulator has no subject lifting; QA runs use the colour cut-out.
      guard let plain = plainBackgroundCutout(upright) else { throw noSubject }
      cg = plain
      #else
      // Not the photo's fault: no reshoot hint, no colour-flood guess.
      throw ProductFailure.coded("product-cutout-failed", "The product could not be cut out. Try again.")
      #endif
    }
    guard cg.width >= 32, cg.height >= 32, let png = UIImage(cgImage: cg).pngData() else { throw noSubject }
    try writeFile(png, to: dest, options: [.withoutOverwriting])
    return ["uri": dest.absoluteString, "width": cg.width, "height": cg.height,
            "quality": ProductImages.quality(cutout: cg, photo: upright)]
  }

  /// Apple's subject lifting (the same as in Photos).
  static func visionCutout(_ upright: CGImage) -> VisionResult {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: upright, options: [:])
    do {
      try handler.perform([request])
      guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return .empty }
      let masked = try observation.generateMaskedImage(
        ofInstances: observation.allInstances,
        from: handler,
        croppedToInstancesExtent: true)
      let ciImage = CIImage(cvPixelBuffer: masked)
      guard let cg = ProductRenderer.ciContext.createCGImage(ciImage, from: ciImage.extent) else {
        return .failed(ProductFailure.unavailable)
      }
      return cg.width >= 32 && cg.height >= 32 ? .found(cg) : .empty
    } catch {
      return .failed(error)
    }
  }

  /// For product shots on a plain background: everything reachable from the
  /// photo's edges through small colour steps is background; the largest
  /// remaining region is the product. Works on a 512 px copy, then masks the
  /// full-size photo with a softened edge.
  static func plainBackgroundCutout(_ image: CGImage) -> CGImage? {
    let scale = min(1.0, 512.0 / Double(max(image.width, image.height)))
    let w = max(16, Int(Double(image.width) * scale)), h = max(16, Int(Double(image.height) * scale))
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(
      data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
      let base = ctx.data else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    let px = Array(UnsafeBufferPointer(start: base.assumingMemoryBound(to: UInt8.self), count: w * h * 4))
    let count = w * h

    func step(_ a: Int, _ b: Int) -> Int {
      abs(Int(px[a * 4]) - Int(px[b * 4])) + abs(Int(px[a * 4 + 1]) - Int(px[b * 4 + 1]))
        + abs(Int(px[a * 4 + 2]) - Int(px[b * 4 + 2]))
    }

    // 1. Background: flood fill from every edge pixel through small colour steps.
    var background = [Bool](repeating: false, count: count)
    var queue = [Int]()
    queue.reserveCapacity(count)
    for x in 0..<w {
      for i in [x, (h - 1) * w + x] where !background[i] { background[i] = true; queue.append(i) }
    }
    for y in 0..<h {
      for i in [y * w, y * w + w - 1] where !background[i] { background[i] = true; queue.append(i) }
    }
    var head = 0
    while head < queue.count {
      let i = queue[head]
      head += 1
      let x = i % w, y = i / w
      for n in [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      where n >= 0 && !background[n] && step(i, n) < 30 {
        background[n] = true
        queue.append(n)
      }
    }

    // 2. Product: the largest region that is not background.
    var label = [Int32](repeating: 0, count: count)
    var bestLabel: Int32 = 0, bestSize = 0, next: Int32 = 0
    for start in 0..<count where !background[start] && label[start] == 0 {
      next += 1
      label[start] = next
      var region = [start]
      var k = 0
      while k < region.count {
        let i = region[k]
        k += 1
        let x = i % w, y = i / w
        for n in [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
        where n >= 0 && !background[n] && label[n] == 0 {
          label[n] = next
          region.append(n)
        }
      }
      if region.count > bestSize { bestSize = region.count; bestLabel = next }
    }
    let share = Double(bestSize) / Double(count)
    guard bestLabel > 0, share > 0.02, share < 0.9 else { return nil }

    // 3. Mask and bounding box (rows top to bottom).
    var mask = [UInt8](repeating: 0, count: count)
    var minX = w, minY = h, maxX = 0, maxY = 0
    for i in 0..<count where label[i] == bestLabel {
      mask[i] = 255
      let x = i % w, y = i / w
      minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    }
    guard let provider = CGDataProvider(data: Data(mask) as CFData),
          let maskImage = CGImage(
            width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: w,
            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    else { return nil }

    // 4. Apply the softened mask to the full photo and crop to the product.
    let full = CIImage(cgImage: image)
    let sx = CGFloat(image.width) / CGFloat(w), sy = CGFloat(image.height) / CGFloat(h)
    let softMask = CIImage(cgImage: maskImage)
      .transformed(by: CGAffineTransform(scaleX: sx, y: sy))
      .clampedToExtent()
      .applyingGaussianBlur(sigma: 1.5)
      .cropped(to: full.extent)
    guard let blend = CIFilter(name: "CIBlendWithMask") else { return nil }
    blend.setValue(full, forKey: kCIInputImageKey)
    blend.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
    blend.setValue(softMask, forKey: kCIInputMaskImageKey)
    guard let output = blend.outputImage else { return nil }
    // Core Image's origin is bottom-left, so flip the top-down box.
    let pad: CGFloat = 4
    let box = CGRect(
      x: CGFloat(minX) * sx - pad,
      y: CGFloat(h - 1 - maxY) * sy - pad,
      width: CGFloat(maxX - minX + 1) * sx + pad * 2,
      height: CGFloat(maxY - minY + 1) * sy + pad * 2
    ).intersection(full.extent).integral
    guard box.width >= 32, box.height >= 32 else { return nil }
    return ProductRenderer.ciContext.createCGImage(output, from: box, format: .RGBA8, colorSpace: space)
  }

  /// Applies the EXIF orientation and caps the longest side.
  static func uprightImage(_ image: UIImage) throws -> CGImage {
    let size = image.size
    guard size.width > 0, size.height > 0 else {
      throw ProductFailure.coded("product-unreadable", "The photo could not be read.")
    }
    let scale = min(1, maxSide / max(size.width, size.height))
    let target = CGSize(
      width: max(1, (size.width * scale).rounded()), height: max(1, (size.height * scale).rounded()))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    guard let cg = rendered.cgImage else {
      throw ProductFailure.coded("product-unreadable", "The photo could not be read.")
    }
    return cg
  }
}

// MARK: - Depth (Depth Anything V2 Small, on device)

/// Relative depth of the product on a small grid (1 = nearest), with its
/// surface slopes, used to light the product as if it had real relief.
private final class DepthField {
  let width: Int
  let height: Int
  /// The relative depth itself (0 = farthest, 1 = nearest), rows top to bottom.
  let depth: [Float]
  private let alpha: [Float]
  private let nx: [Float]
  private let ny: [Float]
  private let nz: [Float]

  init(width: Int, height: Int, depth: [Float], alpha: [Float]) {
    self.width = width
    self.height = height
    self.depth = depth
    self.alpha = alpha
    var nx = [Float](repeating: 0, count: depth.count)
    var ny = nx
    var nz = [Float](repeating: 1, count: depth.count)
    let relief: Float = 6  // how strongly slopes tilt the surface
    for y in 0..<height {
      for x in 0..<width {
        let i = y * width + x
        let l = depth[y * width + max(0, x - 1)], r = depth[y * width + min(width - 1, x + 1)]
        let u = depth[max(0, y - 1) * width + x], d = depth[min(height - 1, y + 1) * width + x]
        let gx = (r - l) * relief, gy = (d - u) * relief
        let length = (gx * gx + gy * gy + 1).squareRoot()
        nx[i] = -gx / length
        ny[i] = -gy / length
        nz[i] = 1 / length
      }
    }
    self.nx = nx
    self.ny = ny
    self.nz = nz
  }

  /// White highlights and soft shading for a light at `angle` (radians,
  /// image coordinates, y down) as a premultiplied RGBA image of grid size.
  func lightOverlay(angle: Double, strength: Double) -> CGImage? {
    var lx = Float(cos(angle)), ly = Float(sin(angle)), lz: Float = 0.7
    let ll = (lx * lx + ly * ly + lz * lz).squareRoot()
    lx /= ll; ly /= ll; lz /= ll
    // Half vector between the light and a viewer looking straight on.
    var hx = lx, hy = ly, hz = lz + 1
    let hl = (hx * hx + hy * hy + hz * hz).squareRoot()
    hx /= hl; hy /= hl; hz /= hl
    let k = Float(max(0, min(1, strength)))
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    for i in 0..<(width * height) where alpha[i] > 0.02 {
      let diffuse = max(0, nx[i] * lx + ny[i] * ly + nz[i] * lz)
      let specular = pow(max(0, nx[i] * hx + ny[i] * hy + nz[i] * hz), 28)
      let light = specular * 0.85 - (1 - diffuse) * 0.35
      let a = min(1, abs(light) * k) * alpha[i]
      let value: UInt8 = light > 0 ? UInt8(a * 255) : 0  // premultiplied white or black
      let o = i * 4
      // BGRA little-endian premultiplied-first layout.
      pixels[o] = value
      pixels[o + 1] = value
      pixels[o + 2] = value
      pixels[o + 3] = UInt8(a * 255)
    }
    let data = Data(pixels) as CFData
    guard let provider = CGDataProvider(data: data) else { return nil }
    return CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
      provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
  }
}

private enum ProductDepth {
  static let modelName = "DepthAnythingV2SmallF16P8"
  static let grid = 160
  /// After a real load failure, relief stays off for this long, then loading is tried again.
  static let retryDelay: TimeInterval = 60
  private static let lock = NSLock()
  private static var model: VNCoreMLModel?
  private static var failedAt: Date?
  /// The bundled package cannot be compiled (e.g. unreadable): relief stays
  /// off for the rest of the process instead of recompiling on every preview.
  private static var compileFailed = false
  private static var cache: [String: DepthField] = [:]

  /// Storing the compiled model failed (low storage, app suspended...): tried
  /// again after `retryDelay`.
  private struct TransientFailure: Error {
    let underlying: Error
  }

  /// MLModel.compileModel rejected the bundled package: not retried.
  private struct CompileFailure: Error {
    let underlying: Error
  }

  /// Depth for a product image, cached per file. Nil if the model is missing
  /// or fails; the video is then rendered without relief light.
  static func field(for product: CGImage, key: String) -> DepthField? {
    lock.lock()
    if let hit = cache[key] {
      lock.unlock()
      return hit
    }
    lock.unlock()
    guard let model = loadModel(), let field = estimate(product, model: model) else { return nil }
    lock.lock()
    if cache.count >= 16 { cache.removeAll() }
    cache[key] = field
    lock.unlock()
    return field
  }

  private static func loadModel() -> VNCoreMLModel? {
    lock.lock()
    defer { lock.unlock() }
    if let model { return model }
    if compileFailed { return nil }
    if let failedAt, Date().timeIntervalSince(failedAt) < retryDelay { return nil }
    var source: (url: URL, removable: Bool)?
    do {
      let found = try compiledModelURL()
      source = found
      let configuration = MLModelConfiguration()
      configuration.computeUnits = .all
      let loaded = try MLModel(contentsOf: found.url, configuration: configuration)
      let vision = try VNCoreMLModel(for: loaded)
      model = vision
      failedAt = nil
      NSLog("[VidoraDepth] model loaded from %@", found.url.lastPathComponent)
      return vision
    } catch let failure as TransientFailure {
      NSLog("[VidoraDepth] model not ready (retry in %.0f s): %@", retryDelay, String(describing: failure.underlying))
      failedAt = Date()
      return nil
    } catch let failure as CompileFailure {
      NSLog("[VidoraDepth] model package cannot be compiled, relief off until the next launch: %@",
            String(describing: failure.underlying))
      compileFailed = true
      return nil
    } catch {
      NSLog("[VidoraDepth] model load failed: %@", String(describing: error))
      // A compiled copy we made ourselves may be damaged: drop it so the
      // next attempt compiles a fresh one.
      if let source, source.removable { try? FileManager.default.removeItem(at: source.url) }
      failedAt = Date()
      return nil
    }
  }

  /// Uses a model compiled at build time if present; otherwise compiles the
  /// bundled .mlpackage once and keeps it in Application Support.
  /// `removable` is true for that Application Support copy.
  private static func compiledModelURL() throws -> (url: URL, removable: Bool) {
    let bundles = [Bundle.main, Bundle(for: KareviaProductModule.self)]
    for bundle in bundles {
      if let url = bundle.url(forResource: modelName, withExtension: "mlmodelc") { return (url, false) }
    }
    let fm = FileManager.default
    let folder: URL
    do {
      folder = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        .appendingPathComponent("VidoraModels", isDirectory: true)
    } catch {
      throw TransientFailure(underlying: error)
    }
    let cached = folder.appendingPathComponent(modelName + ".mlmodelc", isDirectory: true)
    if fm.fileExists(atPath: cached.path) { return (cached, true) }
    for bundle in bundles {
      guard let package = bundle.url(forResource: modelName, withExtension: "mlpackage") else { continue }
      let compiled: URL
      do {
        compiled = try MLModel.compileModel(at: package)
      } catch {
        // A full disk is worth another try; anything else is the package itself.
        if isOutOfSpace(error) { throw TransientFailure(underlying: error) }
        throw CompileFailure(underlying: error)
      }
      do {
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        try? fm.removeItem(at: cached)
        try fm.moveItem(at: compiled, to: cached)
      } catch {
        throw TransientFailure(underlying: error)
      }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      var target = cached
      try? target.setResourceValues(values)
      return (cached, true)
    }
    // Neither a compiled model nor a package is in the app: a real failure.
    throw ProductFailure.unavailable
  }

  private static func estimate(_ product: CGImage, model: VNCoreMLModel) -> DepthField? {
    let aspect = Double(product.width) / Double(max(1, product.height))
    let gw = aspect >= 1 ? grid : max(8, Int((Double(grid) * aspect).rounded()))
    let gh = aspect >= 1 ? max(8, Int((Double(grid) / aspect).rounded())) : grid
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let info = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

    // The model sees the product on neutral grey, so the background reads flat.
    let size = CGSize(width: product.width, height: product.height)
    guard let flat = CGContext(data: nil, width: product.width, height: product.height, bitsPerComponent: 8,
                               bytesPerRow: 0, space: space, bitmapInfo: info) else { return nil }
    flat.setFillColor(CGColor(srgbRed: 0.5, green: 0.5, blue: 0.5, alpha: 1))
    flat.fill(CGRect(origin: .zero, size: size))
    flat.draw(product, in: CGRect(origin: .zero, size: size))
    guard let flattened = flat.makeImage() else { return nil }

    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    do {
      try VNImageRequestHandler(cgImage: flattened, options: [:]).perform([request])
    } catch {
      NSLog("[VidoraDepth] request failed: %@", String(describing: error))
      return nil
    }
    guard let observation = request.results?.first as? VNPixelBufferObservation else {
      NSLog("[VidoraDepth] no pixel buffer in the result (%@)", String(describing: request.results?.first))
      return nil
    }
    let buffer = observation.pixelBuffer
    let format = CVPixelBufferGetPixelFormatType(buffer)
    // The format as its four characters (e.g. "L00h" = one-component half float).
    let fourCC = String(bytes: [24, 16, 8, 0].map { UInt8((format >> UInt32($0)) & 0xFF) }, encoding: .ascii) ?? "\(format)"
    guard let depthGrid = sampleDepth(buffer, width: gw, height: gh) else {
      NSLog("[VidoraDepth] unreadable depth buffer %ldx%ld format %@",
            CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer), fourCC)
      return nil
    }

    // The product's alpha on the same grid (bitmap rows run top to bottom, like the pixel buffer).
    guard let ctx = CGContext(data: nil, width: gw, height: gh, bitsPerComponent: 8, bytesPerRow: gw * 4,
                              space: space, bitmapInfo: info) else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(product, in: CGRect(x: 0, y: 0, width: gw, height: gh))
    guard let raw = ctx.data else { return nil }
    let productPixels = Array(UnsafeBufferPointer(start: raw.assumingMemoryBound(to: UInt8.self), count: gw * gh * 4))

    var alpha = [Float](repeating: 0, count: gw * gh)
    var depth = [Float](repeating: 0, count: gw * gh)
    var low: Float = .greatestFiniteMagnitude, high: Float = -.greatestFiniteMagnitude
    for i in 0..<(gw * gh) {
      alpha[i] = Float(productPixels[i * 4 + 3]) / 255
      let value = depthGrid[i]
      depth[i] = value
      if alpha[i] > 0.5 {
        low = min(low, value)
        high = max(high, value)
      }
    }
    NSLog("[VidoraDepth] depth %ldx%ld format %@ -> grid %ldx%ld, raw min %.4f max %.4f inside the product",
          CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer), fourCC, gw, gh,
          Double(low), Double(high))
    guard high > low else {
      NSLog("[VidoraDepth] flat depth inside the product: relief off")
      return nil
    }
    for i in 0..<depth.count {
      depth[i] = alpha[i] > 0.02 ? (depth[i] - low) / (high - low) : 0
    }
    // One light blur pass removes blockiness from the small grid.
    var smooth = depth
    for y in 1..<(gh - 1) {
      for x in 1..<(gw - 1) {
        let i = y * gw + x
        smooth[i] = (depth[i] * 4 + depth[i - 1] + depth[i + 1] + depth[i - gw] + depth[i + gw]) / 8
      }
    }
    return DepthField(width: gw, height: gh, depth: smooth, alpha: alpha)
  }

  /// IEEE half float bits to Float (no Float16, which x86_64 simulators lack).
  private static func halfToFloat(_ h: UInt16) -> Float {
    let sign: Float = (h & 0x8000) != 0 ? -1 : 1
    let exponent = Int((h >> 10) & 0x1F)
    let mantissa = Float(h & 0x3FF)
    if exponent == 0 { return sign * mantissa * Float(pow(2.0, -24.0)) }  // zero or subnormal
    if exponent == 31 { return mantissa == 0 ? sign * .infinity : .nan }
    return sign * (1 + mantissa / 1024) * Float(pow(2.0, Double(exponent - 15)))
  }

  /// The model's raw output resampled (bilinear) onto a `gw` x `gh` grid,
  /// rows top to bottom. Reads the pixel buffer directly: Core Image treats a
  /// one-component buffer as red-only, so going through an RGBA image loses it.
  /// Nil for an unknown pixel format or non-finite values.
  private static func sampleDepth(_ buffer: CVPixelBuffer, width gw: Int, height gh: Int) -> [Float]? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    let bw = CVPixelBufferGetWidth(buffer), bh = CVPixelBufferGetHeight(buffer)
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    guard bw > 1, bh > 1, gw > 0, gh > 0 else { return nil }
    let read: (Int, Int) -> Float
    switch CVPixelBufferGetPixelFormatType(buffer) {
    case kCVPixelFormatType_OneComponent16Half, kCVPixelFormatType_DepthFloat16, kCVPixelFormatType_DisparityFloat16:
      read = { x, y in ProductDepth.halfToFloat(base.advanced(by: y * rowBytes).assumingMemoryBound(to: UInt16.self)[x]) }
    case kCVPixelFormatType_OneComponent32Float, kCVPixelFormatType_DepthFloat32, kCVPixelFormatType_DisparityFloat32:
      read = { x, y in base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float.self)[x] }
    case kCVPixelFormatType_OneComponent16:
      read = { x, y in Float(base.advanced(by: y * rowBytes).assumingMemoryBound(to: UInt16.self)[x]) }
    case kCVPixelFormatType_OneComponent8:
      read = { x, y in Float(base.advanced(by: y * rowBytes).assumingMemoryBound(to: UInt8.self)[x]) }
    case kCVPixelFormatType_32BGRA, kCVPixelFormatType_32ARGB:
      // Grey image output: any colour channel (byte 1 is G in BGRA, R in ARGB).
      read = { x, y in Float(base.advanced(by: y * rowBytes).assumingMemoryBound(to: UInt8.self)[x * 4 + 1]) }
    default:
      return nil
    }
    var out = [Float](repeating: 0, count: gw * gh)
    for gy in 0..<gh {
      let sy = max(0, min(Float(bh - 1), (Float(gy) + 0.5) * Float(bh) / Float(gh) - 0.5))
      let y0 = Int(sy), y1 = min(bh - 1, y0 + 1), fy = sy - Float(y0)
      for gx in 0..<gw {
        let sx = max(0, min(Float(bw - 1), (Float(gx) + 0.5) * Float(bw) / Float(gw) - 0.5))
        let x0 = Int(sx), x1 = min(bw - 1, x0 + 1), fx = sx - Float(x0)
        let top = read(x0, y0) * (1 - fx) + read(x1, y0) * fx
        let bottom = read(x0, y1) * (1 - fx) + read(x1, y1) * fx
        let value = top * (1 - fy) + bottom * fy
        guard value.isFinite else { return nil }
        out[gy * gw + gx] = value
      }
    }
    return out
  }
}

// MARK: - Rendering

/// A small deterministic random generator so sparkles look the same in every render.
private struct SeededRandom {
  private var state: UInt64
  init(seed: Int) { state = UInt64(truncatingIfNeeded: seed) &* 0x9E3779B97F4A7C15 | 1 }
  mutating func next() -> Double {
    state ^= state << 13
    state ^= state >> 7
    state ^= state << 17
    return Double(state % 1_000_000) / 1_000_000
  }
}

private struct Sparkle {
  let dx: Double      // offset from product centre, fraction of product width
  let dy: Double      // fraction of product height
  let size: Double    // fraction of frame width
  let phase: Double
  let period: Double
}

private struct PreparedText {
  let image: CGImage
  let size: CGSize
  let spec: ProductTextSpec
}

private struct ProductPose {
  var x: Double
  var y: Double
  var scale: Double
  var rotation: Double
  var opacity: Double
  var yaw: Double = 0
}

/// Finishing strengths resolved from ProductLookSpec, each clamped to 0...1.
private struct ProductFinish {
  let grain: Double
  let vignette: Double
  let sceneBlur: Double
  let parallax: Double
  let harmonize: Double
  let edge: Double
  let reflectionStrength: Double

  init(_ spec: ProductLookSpec?) {
    let look = spec ?? ProductLookSpec()
    func unit(_ v: Double) -> Double { v.isFinite ? max(0, min(1, v)) : 0 }
    grain = unit(look.grain)
    vignette = unit(look.vignette)
    sceneBlur = unit(look.sceneBlur)
    parallax = unit(look.parallax)
    harmonize = unit(look.harmonize)
    edge = unit(look.edge)
    reflectionStrength = unit(look.reflectionStrength)
  }
}

/// A soft cast shadow made from the product's silhouette, lying on the floor
/// behind the product. Sizes are in units of the product image's height.
private struct ShadowSprite {
  let image: CGImage
  let size: CGSize
  /// Where the product's base sits, measured from the sprite's top-left.
  let anchor: CGPoint
  /// Footprint of the base, as offsets from the image centre in image widths.
  let footLeft: CGFloat
  let footRight: CGFloat
  /// Transparent margin under the base, in image heights.
  let baseLift: CGFloat
}

/// Everything that is drawn the same way on every frame.
private struct PreparedScene {
  let size: CGSize
  /// Slightly larger than the frame so it can drift (parallax).
  let background: CGImage
  let backgroundScale: CGFloat
  /// The cut-out after colour match, defringe and light wrap.
  let product: CGImage
  /// One factor for every pose so wide products fit the frame at their largest key.
  let fit: CGFloat
  let shadow: ShadowSprite?
  let reflection: CGImage?
  let sparkles: [Sparkle]
  let texts: [PreparedText]
  let watermark: PreparedText?
  /// Depth of the product, when relief light is on and the model is available.
  let depth: DepthField?
  let finish: ProductFinish
  let vignette: CGGradient?
}

/// A multi-scene video, prepared once. The per-scene arrays run parallel to
/// `scenes`; scenes that share an image (and, for cut-outs, keys and
/// background) share the same prepared images.
private struct PreparedScenes {
  let size: CGSize
  let scenes: [ProductSceneSpec]
  /// The single-product spec a cut-out scene is drawn with; nil for photo scenes.
  let specs: [ProductVideoSpec?]
  /// The prepared cut-out scene (no texts, watermark or vignette); nil for photo scenes.
  let prepared: [PreparedScene?]
  /// The photo decoded at frame size; nil for cut-out scenes.
  let photos: [CGImage?]
  /// Depth scenes: feathered masks of the nearer depth layers (far to near);
  /// nil for other scenes and for a depth scene without depth (drawn as a photo).
  let depthMasks: [[CGImage]?]
  /// A depth scene without depth: the photo-scene keys it is drawn with; nil otherwise.
  let photoKeys: [[ProductKeySpec]?]
  /// Drawn once per frame over whichever scenes are showing.
  let texts: [PreparedText]
  let watermark: PreparedText?
  let vignette: CGGradient?
}

/// What a render draws from: the single-product scene or a multi-scene video.
private enum PreparedVideo {
  case single(PreparedScene)
  case scenes(PreparedScenes)
}

// MARK: - Video fonts (bundled, SIL OFL)

private enum ProductFonts {
  private static let lock = NSLock()
  private static var registered = false
  private static let files = [
    "Manrope_500Medium", "Manrope_700Bold", "Manrope_800ExtraBold",
    "PlayfairDisplay_500Medium", "PlayfairDisplay_700Bold",
    "CormorantGaramond_500Medium", "CormorantGaramond_700Bold",
    "Anton_400Regular", "ArchivoBlack_400Regular",
  ]

  /// Registers the bundled fonts for this process once. A font that is
  /// missing or already registered is skipped; texts then use the system font.
  static func registerOnce() {
    lock.lock()
    defer { lock.unlock() }
    guard !registered else { return }
    registered = true
    let bundles = [Bundle.main, Bundle(for: KareviaProductModule.self)]
    for file in files {
      let url = bundles.lazy.compactMap { bundle in
        bundle.url(forResource: file, withExtension: "ttf")
          ?? bundle.url(forResource: file, withExtension: "ttf", subdirectory: "fonts")
      }.first
      guard let url else { continue }
      var error: Unmanaged<CFError>?
      // False with "already registered" is fine; any other failure falls back to the system font.
      _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
      error?.release()
    }
  }

  static func postScriptName(family: String, weight: String) -> String? {
    let strong = weight == "heavy" || weight == "bold"
    switch family {
    case "modern": return weight == "heavy" ? "Manrope-ExtraBold" : weight == "bold" ? "Manrope-Bold" : "Manrope-Medium"
    case "elegant": return strong ? "PlayfairDisplay-Bold" : "PlayfairDisplay-Medium"
    case "editorial": return strong ? "CormorantGaramond-Bold" : "CormorantGaramond-Medium"
    case "impact": return "Anton-Regular"
    case "poster": return "ArchivoBlack-Regular"
    default: return nil
    }
  }

  /// Letter spacing (ems) and line height per family. Sizes are already
  /// adjusted per family in TypeScript (FONT_SIZE_FACTOR).
  static func metrics(family: String, weight: String) -> (kern: Double, lineHeight: CGFloat) {
    switch family {
    case "modern": return (weight == "heavy" ? 0.005 : 0, 1)
    case "elegant": return (0, 0.95)
    case "editorial": return (0.01, 0.9)
    case "impact": return (0.04, 0.92)  // condensed caps need air
    case "poster": return (0.01, 0.95)
    default: return (weight == "heavy" ? 0.01 : 0, 1)
    }
  }
}

// MARK: - Composite (prepared once per render)

private enum ProductComposite {
  /// Box blur of a single channel, `passes` times (two passes look Gaussian).
  /// Pixels outside the image count as 0.
  static func boxBlur(_ source: [Float], width: Int, height: Int, radius: Int, passes: Int = 2) -> [Float] {
    guard radius > 0, width > 0, height > 0, source.count == width * height else { return source }
    var a = source
    var b = [Float](repeating: 0, count: source.count)
    let norm = 1 / Float(radius * 2 + 1)
    for _ in 0..<passes {
      a.withUnsafeBufferPointer { s in
        b.withUnsafeMutableBufferPointer { d in
          for y in 0..<height {
            let row = y * width
            var sum: Float = 0
            for x in 0...min(radius, width - 1) { sum += s[row + x] }
            for x in 0..<width {
              d[row + x] = sum * norm
              let add = x + radius + 1, sub = x - radius
              if add < width { sum += s[row + add] }
              if sub >= 0 { sum -= s[row + sub] }
            }
          }
        }
      }
      b.withUnsafeBufferPointer { s in
        a.withUnsafeMutableBufferPointer { d in
          for x in 0..<width {
            var sum: Float = 0
            for y in 0...min(radius, height - 1) { sum += s[y * width + x] }
            for y in 0..<height {
              d[y * width + x] = sum * norm
              let add = y + radius + 1, sub = y - radius
              if add < height { sum += s[add * width + x] }
              if sub >= 0 { sum -= s[sub * width + x] }
            }
          }
        }
      }
    }
    return a
  }

  /// Makes the cut-out sit in the scene without changing what the product
  /// looks like: (1) semi-transparent edge pixels take the colour of their
  /// more opaque neighbours (removes the old background's fringe) and a light
  /// alpha choke drops the faint halo; (2) a capped white balance and
  /// exposure step towards the light around the product (a few percent at
  /// most); (3) a thin light wrap: the blurred scene glows into the band just
  /// inside the outline. `rest` is the product's resting rect in `background`
  /// pixels (top-left origin). Nil when the image cannot be processed; the
  /// original is then used.
  static func harmonize(_ product: CGImage, background: CGImage, rest: CGRect, strength: Double) -> CGImage? {
    let w = product.width, h = product.height
    guard w >= 8, h >= 8, w * h <= 4_500_000, rest.width >= 1, rest.height >= 1 else { return nil }
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let info = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: space, bitmapInfo: info),
          let raw = ctx.data else { return nil }
    ctx.draw(product, in: CGRect(x: 0, y: 0, width: w, height: h))
    // Bitmap rows run top to bottom; RGBA, premultiplied.
    let px = raw.assumingMemoryBound(to: UInt8.self)
    let count = w * h
    let source = Array(UnsafeBufferPointer(start: px, count: count * 4))
    var alpha = [Float](repeating: 0, count: count)
    for i in 0..<count { alpha[i] = Float(source[i * 4 + 3]) / 255 }

    // The scene around the resting product on a small blurred grid.
    let n = 32
    let bw = CGFloat(background.width), bh = CGFloat(background.height)
    var region = rest.insetBy(dx: -rest.width * 0.25, dy: -rest.height * 0.15)
      .intersection(CGRect(x: 0, y: 0, width: bw, height: bh))
    if region.isNull || region.width < 4 || region.height < 4 {
      region = CGRect(x: 0, y: 0, width: bw, height: bh)
    }
    guard let gctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                               space: space, bitmapInfo: info),
          let graw = gctx.data else { return nil }
    gctx.interpolationQuality = .high
    let sx = CGFloat(n) / region.width, sy = CGFloat(n) / region.height
    // CoreGraphics draws bottom-up: this puts the region's top edge at the grid's top row.
    gctx.draw(background, in: CGRect(x: -region.minX * sx, y: -(bh - region.maxY) * sy, width: bw * sx, height: bh * sy))
    let gpx = graw.assumingMemoryBound(to: UInt8.self)
    var channels = [[Float]](repeating: [Float](repeating: 0, count: n * n), count: 3)
    for i in 0..<(n * n) {
      for c in 0..<3 { channels[c][i] = Float(gpx[i * 4 + c]) / 255 }
    }
    // Normalised blur so the grid's border does not darken.
    let coverage = boxBlur([Float](repeating: 1, count: n * n), width: n, height: n, radius: 4)
    channels = channels.map { channel in
      let blurred = boxBlur(channel, width: n, height: n, radius: 4)
      return (0..<(n * n)).map { blurred[$0] / max(0.001, coverage[$0]) }
    }
    let cells = Float(n * n)
    let sceneR = channels[0].reduce(0, +) / cells
    let sceneG = channels[1].reduce(0, +) / cells
    let sceneB = channels[2].reduce(0, +) / cells

    // The product's own average colour (opaque pixels, sampled).
    var pr: Float = 0, pg: Float = 0, pb: Float = 0, pn: Float = 0
    var k = 0
    while k < count {
      let a = alpha[k]
      if a > 0.5 {
        let o = k * 4
        pr += min(1, Float(source[o]) / 255 / a)
        pg += min(1, Float(source[o + 1]) / 255 / a)
        pb += min(1, Float(source[o + 2]) / 255 / a)
        pn += 1
      }
      k += 7
    }
    guard pn > 0 else { return nil }
    pr /= pn
    pg /= pn
    pb /= pn

    func luma(_ r: Float, _ g: Float, _ b: Float) -> Float { 0.2126 * r + 0.7152 * g + 0.0722 * b }
    let s = Float(max(0, min(1, strength)))
    let sceneLuma = max(0.02, luma(sceneR, sceneG, sceneB))
    let productLuma = max(0.02, luma(pr, pg, pb))
    // White balance leans towards the scene's tint, capped at 5% x strength per channel.
    let cap = 0.05 * s
    func balance(_ v: Float) -> Float { 1 + max(-cap, min(cap, (v / sceneLuma - 1) * 0.25 * s)) }
    let exposure = max(1 - 0.06 * s, min(1 + 0.04 * s, pow(sceneLuma / productLuma, 0.1 * s)))
    let gainR = balance(sceneR) * exposure
    let gainG = balance(sceneG) * exposure
    let gainB = balance(sceneB) * exposure

    let radius = max(2, Int((Double(max(w, h)) * 0.012).rounded()))
    let soft = boxBlur(alpha, width: w, height: h, radius: radius)
    let wrap = 0.45 * s
    // Product pixel -> grid position, with the product at rest.
    let gx0 = Float((rest.minX - region.minX) * sx), gxStep = Float(rest.width * sx) / Float(w)
    let gy0 = Float((rest.minY - region.minY) * sy), gyStep = Float(rest.height * sy) / Float(h)
    func sample(_ c: [Float], _ gx: Float, _ gy: Float) -> Float {
      let x = max(0, min(Float(n - 1), gx)), y = max(0, min(Float(n - 1), gy))
      let x0 = Int(x), y0 = Int(y)
      let x1 = min(n - 1, x0 + 1), y1 = min(n - 1, y0 + 1)
      let fx = x - Float(x0), fy = y - Float(y0)
      let top = c[y0 * n + x0] * (1 - fx) + c[y0 * n + x1] * fx
      let bottom = c[y1 * n + x0] * (1 - fx) + c[y1 * n + x1] * fx
      return top * (1 - fy) + bottom * fy
    }

    for y in 0..<h {
      for x in 0..<w {
        let i = y * w + x
        let a = alpha[i]
        let o = i * 4
        if a < 0.004 {
          px[o] = 0
          px[o + 1] = 0
          px[o + 2] = 0
          px[o + 3] = 0
          continue
        }
        var r = min(1, Float(source[o]) / 255 / a)
        var g = min(1, Float(source[o + 1]) / 255 / a)
        var b = min(1, Float(source[o + 2]) / 255 / a)
        // 1. Defringe: edge pixels borrow the colour of more opaque neighbours.
        if a < 0.98 {
          var sr: Float = 0, sg: Float = 0, sb: Float = 0, sw: Float = 0
          for dy in -1...1 {
            let ny = y + dy
            if ny < 0 || ny >= h { continue }
            for dx in -1...1 {
              let nx = x + dx
              if nx < 0 || nx >= w { continue }
              let j = ny * w + nx
              let na = alpha[j]
              if na <= a { continue }
              let jo = j * 4
              // Weight na^3 on the unpremultiplied colour = premultiplied x na^2.
              let weight = na * na
              sr += Float(source[jo]) / 255 * weight
              sg += Float(source[jo + 1]) / 255 * weight
              sb += Float(source[jo + 2]) / 255 * weight
              sw += weight * na
            }
          }
          if sw > 0 {
            let mix = 0.8 * (1 - a)
            r += (min(1, sr / sw) - r) * mix
            g += (min(1, sg / sw) - g) * mix
            b += (min(1, sb / sw) - b) * mix
          }
        }
        // 2. Gentle colour match.
        r = min(1, r * gainR)
        g = min(1, g * gainG)
        b = min(1, b * gainB)
        // 3. Light wrap (screen) in the band just inside the outline.
        let edge = a * max(0, 1 - soft[i])
        if wrap > 0, edge > 0.003 {
          let gx = gx0 + (Float(x) + 0.5) * gxStep - 0.5
          let gy = gy0 + (Float(y) + 0.5) * gyStep - 0.5
          let amount = min(1, edge * 2) * wrap
          r += (1 - r) * sample(channels[0], gx, gy) * amount
          g += (1 - g) * sample(channels[1], gx, gy) * amount
          b += (1 - b) * sample(channels[2], gx, gy) * amount
        }
        // A light choke removes the faint halo outside the edge.
        let outA = max(0, min(1, (a - 0.05) / 0.95))
        px[o] = UInt8(max(0, min(255, r * outA * 255 + 0.5)))
        px[o + 1] = UInt8(max(0, min(255, g * outA * 255 + 0.5)))
        px[o + 2] = UInt8(max(0, min(255, b * outA * 255 + 0.5)))
        px[o + 3] = UInt8(max(0, min(255, outA * 255 + 0.5)))
      }
    }
    return ctx.makeImage()
  }

  private static let refinedCache = NSCache<NSString, CGImage>()

  /// Cleans the Vision cut-out's outline once: a 1-2 px erode (drops the
  /// background halo) and a small feather on the alpha. Colours inside are
  /// untouched. Cached by `key`; nil leaves the original in use.
  static func refineEdges(_ product: CGImage, strength: Double, key: String) -> CGImage? {
    guard strength > 0.01, product.width >= 16, product.height >= 16,
          product.width * product.height <= 4_500_000 else { return nil }
    let cacheKey = "\(key)|\(product.width)x\(product.height)|\(Int((strength * 10).rounded()))" as NSString
    if let hit = refinedCache.object(forKey: cacheKey) { return hit }
    let side = Double(max(product.width, product.height))
    let radius = max(1.0, min(2.0, (side * 0.0012 * strength).rounded()))
    let sigma = max(0.5, min(1.5, side * 0.0012 * strength))
    let input = CIImage(cgImage: product)
    let extent = input.extent
    guard let eroded = CIFilter(name: "CIMorphologyMinimum", parameters: [
            kCIInputImageKey: input.clampedToExtent(),
            kCIInputRadiusKey: radius,
          ])?.outputImage else { return nil }
    // The eroded, blurred copy only serves as an alpha mask for the original.
    let mask = eroded.applyingGaussianBlur(sigma: sigma).cropped(to: extent)
    guard let refined = CIFilter(name: "CIBlendWithAlphaMask", parameters: [
            kCIInputImageKey: input,
            kCIInputBackgroundImageKey: CIImage.empty(),
            kCIInputMaskImageKey: mask,
          ])?.outputImage,
          let image = ProductRenderer.ciContext.createCGImage(refined.cropped(to: extent), from: extent)
    else { return nil }
    refinedCache.setObject(image, forKey: cacheKey)
    return image
  }

  /// The cast shadow: the silhouette squashed onto the floor and skewed away
  /// from a light at the front left, sharp at the base and softer and fainter
  /// with distance. Built once from a small copy.
  static func shadowSprite(_ product: CGImage) -> ShadowSprite? {
    let side: CGFloat = 256
    let scale = min(1, side / CGFloat(max(product.width, product.height)))
    let sw = max(8, Int((CGFloat(product.width) * scale).rounded()))
    let sh = max(8, Int((CGFloat(product.height) * scale).rounded()))
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4,
                              space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
          let raw = ctx.data else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(product, in: CGRect(x: 0, y: 0, width: sw, height: sh))
    let px = raw.assumingMemoryBound(to: UInt8.self)
    // Lowest row with solid pixels (rows run top to bottom), then the base's width.
    var bottomRow = -1
    for y in stride(from: sh - 1, through: 0, by: -1) {
      var solid = false
      for x in 0..<sw where px[(y * sw + x) * 4 + 3] > 128 {
        solid = true
        break
      }
      if solid {
        bottomRow = y
        break
      }
    }
    guard bottomRow >= 0 else { return nil }
    let band = max(1, Int(Double(sh) * 0.04))
    var minX = sw, maxX = -1
    for y in max(0, bottomRow - band)...bottomRow {
      for x in 0..<sw where px[(y * sw + x) * 4 + 3] > 128 {
        minX = min(minX, x)
        maxX = max(maxX, x)
      }
    }
    guard maxX >= minX else { return nil }
    // Black silhouette with the product's alpha.
    ctx.setBlendMode(.sourceIn)
    ctx.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: sw, height: sh))
    guard let silhouette = ctx.makeImage() else { return nil }

    // Core Image is bottom-up: put the base centre at the origin, then squash
    // (height x0.28) and skew (the top moves right by 0.3 x the product height).
    let reference = CGFloat(sh)
    let baseY = CGFloat(sh - 1 - bottomRow)
    let footCentre = CGFloat(minX + maxX + 1) / 2
    let cast = CIImage(cgImage: silhouette)
      .transformed(by: CGAffineTransform(translationX: -footCentre, y: -baseY))
      .transformed(by: CGAffineTransform(a: 1, b: 0, c: 0.3, d: 0.28, tx: 0, ty: 0))
    let far = max(1, cast.extent.maxY)
    let sharp = cast.applyingGaussianBlur(sigma: Double(reference) * 0.006)
    let blurry = cast.applyingGaussianBlur(sigma: Double(reference) * 0.045)
    guard let blurMask = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 0),
            "inputPoint1": CIVector(x: 0, y: far),
            "inputColor0": CIColor(red: 0, green: 0, blue: 0),
            "inputColor1": CIColor(red: 1, green: 1, blue: 1),
          ])?.outputImage,
          let fadeMask = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 0),
            "inputPoint1": CIVector(x: 0, y: far),
            "inputColor0": CIColor(red: 1, green: 1, blue: 1),
            "inputColor1": CIColor(red: 0.12, green: 0.12, blue: 0.12),
          ])?.outputImage,
          let mixed = CIFilter(name: "CIBlendWithMask", parameters: [
            kCIInputImageKey: blurry,
            kCIInputBackgroundImageKey: sharp,
            kCIInputMaskImageKey: blurMask,
          ])?.outputImage,
          let faded = CIFilter(name: "CIBlendWithMask", parameters: [
            kCIInputImageKey: mixed,
            kCIInputBackgroundImageKey: CIImage.empty(),
            kCIInputMaskImageKey: fadeMask,
          ])?.outputImage
    else { return nil }
    let pad = reference * 0.15
    let rect = cast.extent.insetBy(dx: -pad, dy: -pad).integral
    guard rect.width >= 2, rect.height >= 2,
          let image = ProductRenderer.ciContext.createCGImage(faded, from: rect) else { return nil }
    return ShadowSprite(
      image: image,
      size: CGSize(width: rect.width / reference, height: rect.height / reference),
      // In Core Image the base is at y = 0 and the sprite's top edge at rect.maxY.
      anchor: CGPoint(x: -rect.minX / reference, y: rect.maxY / reference),
      footLeft: CGFloat(minX) / CGFloat(sw) - 0.5,
      footRight: CGFloat(maxX + 1) / CGFloat(sw) - 0.5,
      baseLift: baseY / reference)
  }
}

private enum ProductRenderer {
  static let maxDuration = 30.0
  static let minDuration = 8.0

  static func color(_ raw: String, alpha: CGFloat = 1) -> CGColor {
    var hex = raw.trimmingCharacters(in: .whitespaces)
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let value = UInt32(hex, radix: 16) else {
      return CGColor(srgbRed: 1, green: 1, blue: 1, alpha: alpha)
    }
    return CGColor(
      srgbRed: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: alpha)
  }

  static func ease(_ name: String, _ u: Double) -> Double {
    let v = max(0, min(1, u))
    switch name {
    case "linear": return v
    case "out": return 1 - pow(1 - v, 3)
    case "back":
      let c1 = 1.70158, c3 = c1 + 1
      return 1 + c3 * pow(v - 1, 3) + c1 * pow(v - 1, 2)
    default:  // inOut
      return v < 0.5 ? 4 * v * v * v : 1 - pow(-2 * v + 2, 3) / 2
    }
  }

  static func pose(at t: Double, keys: [ProductKeySpec]) -> ProductPose {
    guard let first = keys.first else { return ProductPose(x: 0.5, y: 0.5, scale: 0.5, rotation: 0, opacity: 1) }
    func make(_ k: ProductKeySpec) -> ProductPose {
      ProductPose(x: k.x, y: k.y, scale: k.scale, rotation: k.rotation, opacity: k.opacity, yaw: k.yaw)
    }
    if t <= first.t { return make(first) }
    for index in 1..<max(1, keys.count) where index < keys.count {
      let a = keys[index - 1], b = keys[index]
      if t <= b.t {
        let span = max(0.0001, b.t - a.t)
        let e = ease(b.ease, (t - a.t) / span)
        func mix(_ p: Double, _ q: Double) -> Double { p + (q - p) * e }
        return ProductPose(
          x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale),
          rotation: mix(a.rotation, b.rotation),
          opacity: max(0, min(1, mix(a.opacity, b.opacity))),
          yaw: mix(a.yaw, b.yaw))
      }
    }
    return make(keys[keys.count - 1])
  }

  static func validate(_ spec: ProductVideoSpec) throws {
    guard spec.duration.isFinite, spec.duration >= minDuration, spec.duration <= maxDuration else {
      throw ProductFailure.invalid("The video length must be between 8 and 30 seconds.")
    }
    guard spec.fps == 30 || spec.fps == 60 else { throw ProductFailure.invalid("Unsupported frame rate.") }
    guard spec.quality == "720p" || spec.quality == "1080p" else { throw ProductFailure.invalid("Unsupported quality.") }
    guard !spec.keys.isEmpty, spec.keys.count <= 12 else { throw ProductFailure.invalid("Invalid product animation.") }
    var last = -1.0
    for key in spec.keys {
      guard [key.t, key.x, key.y, key.scale, key.rotation, key.opacity, key.yaw].allSatisfy({ $0.isFinite }),
            key.t > last, key.scale > 0, key.scale <= 1.5, abs(key.yaw) <= 35 else {
        throw ProductFailure.invalid("Invalid product animation.")
      }
      last = key.t
    }
    guard spec.texts.count <= 6, spec.sweeps.count <= 6, (spec.sparkles?.count ?? 0) <= 80 else {
      throw ProductFailure.invalid("The template has too many elements.")
    }
    for text in spec.texts {
      guard text.text.count <= 60, text.start.isFinite, text.end.isFinite, text.start < text.end,
            text.size.isFinite, text.size > 0, text.size <= 0.2,
            text.y.isFinite, text.y >= 0, text.y <= 1 else {
        throw ProductFailure.invalid("A text in the template is invalid.")
      }
    }
    for sweep in spec.sweeps {
      guard sweep.start.isFinite, sweep.duration.isFinite, sweep.start >= 0, sweep.duration > 0 else {
        throw ProductFailure.invalid("A light sweep in the template is invalid.")
      }
    }
    guard [spec.camera.zoomFrom, spec.camera.zoomTo].allSatisfy({ $0.isFinite && $0 >= 1 && $0 <= 1.5 }) else {
      throw ProductFailure.invalid("Invalid camera movement.")
    }
    guard ["9:16", "4:5", "1:1", "2:3"].contains(spec.ratio) else {
      throw ProductFailure.invalid("Unsupported frame shape.")
    }
    guard spec.shots.count <= 8 else { throw ProductFailure.invalid("The template has too many camera cuts.") }
    var lastShot = -1.0
    for shot in spec.shots {
      guard [shot.t, shot.zoom, shot.focusX, shot.focusY].allSatisfy({ $0.isFinite }),
            shot.t >= 0, shot.t > lastShot, shot.zoom >= 1, shot.zoom <= 2.5,
            abs(shot.focusX) <= 1, abs(shot.focusY) <= 1 else {
        throw ProductFailure.invalid("Invalid camera cut.")
      }
      lastShot = shot.t
    }
  }

  /// Pixel size of the video for the spec's ratio and quality; with `width`,
  /// the same shape at that width (previews).
  static func frameSize(_ spec: ProductVideoSpec, width: CGFloat? = nil) -> CGSize {
    let hd = spec.quality == "1080p"
    let full: CGSize
    switch spec.ratio {
    case "1:1": full = hd ? CGSize(width: 1080, height: 1080) : CGSize(width: 720, height: 720)
    case "4:5": full = hd ? CGSize(width: 1080, height: 1350) : CGSize(width: 864, height: 1080)
    case "2:3": full = hd ? CGSize(width: 1080, height: 1620) : CGSize(width: 720, height: 1080)
    default: full = hd ? CGSize(width: 1080, height: 1920) : CGSize(width: 720, height: 1280)
    }
    guard let width else { return full }
    return CGSize(width: width, height: (width * full.height / full.width).rounded())
  }

  /// The camera cut active at `t` (shots are in time order), nil before the first.
  static func activeShot(at t: Double, shots: [ProductShotSpec]) -> ProductShotSpec? {
    var current: ProductShotSpec?
    for shot in shots where shot.t <= t + 1e-6 { current = shot }
    return current
  }

  static func fileURL(_ raw: String) throws -> URL {
    let candidate: URL? = raw.hasPrefix("/") ? URL(fileURLWithPath: raw) : URL(string: raw)
    guard let url = candidate, url.isFileURL, FileManager.default.fileExists(atPath: url.path) else {
      throw ProductFailure.invalid("A source file is missing or is not a local file.")
    }
    return url
  }

  // MARK: Prepared images

  static func makeContext(_ size: CGSize) -> CGContext? {
    CGContext(
      data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
  }

  /// A scene photo with depth of field: sharp around `sharpY` (the product's
  /// base, fraction from the top), increasingly blurred towards the top.
  static func depthBlurred(_ image: CGImage, amount: Double, sharpY: CGFloat) -> CGImage? {
    let input = CIImage(cgImage: image)
    let extent = input.extent
    let sigma = Double(extent.width) * 0.012 * amount
    guard sigma > 0.3 else { return nil }
    let blurred = input.clampedToExtent().applyingGaussianBlur(sigma: sigma).cropped(to: extent)
    // Core Image is bottom-up: full blur at the top edge, a quarter at the base line and below.
    let baseY = extent.height * (1 - max(0.3, min(0.95, sharpY)))
    guard let mask = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: extent.height),
            "inputPoint1": CIVector(x: 0, y: baseY),
            "inputColor0": CIColor(red: 1, green: 1, blue: 1),
            "inputColor1": CIColor(red: 0.25, green: 0.25, blue: 0.25),
          ])?.outputImage?.cropped(to: extent),
          let output = CIFilter(name: "CIBlendWithMask", parameters: [
            kCIInputImageKey: blurred,
            kCIInputBackgroundImageKey: input,
            kCIInputMaskImageKey: mask,
          ])?.outputImage
    else { return nil }
    return ciContext.createCGImage(output, from: extent)
  }

  /// A small tile of mid-grey noise for film grain (overlay blend).
  static func grainTile() -> CGImage? {
    let n = 128
    var random = SeededRandom(seed: 17)
    var pixels = [UInt8](repeating: 128, count: n * n)
    for i in 0..<(n * n) {
      // Sum of two uniforms: a soft triangular spread around mid grey.
      let v = (random.next() + random.next() - 1) * 0.5
      pixels[i] = UInt8(max(0, min(255, 128 + v * 255)))
    }
    guard let provider = CGDataProvider(data: Data(pixels) as CFData) else { return nil }
    return CGImage(
      width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: n,
      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
      provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
  }

  /// The background with its finish (scene depth blur, grain) baked in.
  static func backgroundImage(_ bg: ProductBackgroundSpec, size: CGSize, finish: ProductFinish, sharpY: CGFloat) throws -> CGImage {
    guard let ctx = makeContext(size) else { throw ProductFailure.unavailable }
    try paintBackground(bg, size: size, ctx: ctx, finish: finish, sharpY: sharpY)
    if finish.grain > 0.01, let tile = grainTile() {
      ctx.saveGState()
      ctx.setBlendMode(.overlay)
      ctx.setAlpha(CGFloat(finish.grain) * 0.22)
      ctx.interpolationQuality = .none
      ctx.draw(tile, in: CGRect(x: 0, y: 0, width: tile.width, height: tile.height), byTiling: true)
      ctx.restoreGState()
    }
    guard let image = ctx.makeImage() else { throw ProductFailure.unavailable }
    return image
  }

  static func paintBackground(_ bg: ProductBackgroundSpec, size: CGSize, ctx: CGContext, finish: ProductFinish, sharpY: CGFloat) throws {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    if !bg.image.isEmpty {
      // Scene photo: take the requested column and fill the frame (aspect fill).
      let url = try fileURL(bg.image)
      let fx = max(0, min(1, bg.imageX)), fw = max(0.05, min(1 - fx, bg.imageWidth))
      // Any photo works: it is turned upright (EXIF) and decoded only as large
      // as the frame needs, so a 48 MP photo never lands in memory whole.
      guard let pixels = ProductImages.pixelSize(url) else {
        throw ProductFailure.coded("product-unreadable", "The scene image could not be read.")
      }
      let bandH = bg.imageHeight.isFinite ? max(0.05, min(1, bg.imageHeight)) : 1
      let need = max(size.width / (pixels.width * CGFloat(fw)), size.height / (pixels.height * CGFloat(bandH)))
      let side = min(4096, max(pixels.width, pixels.height) * min(1, need * 1.05))
      guard let scene = ProductImages.upright(url, maxSide: side) else {
        throw ProductFailure.coded("product-unreadable", "The scene image could not be read.")
      }
      let column = CGRect(
        x: CGFloat(scene.width) * CGFloat(fx), y: 0,
        width: CGFloat(scene.width) * CGFloat(fw), height: CGFloat(scene.height)).integral
      let source = scene.cropping(to: column) ?? scene
      // Vertical band (fractions from the top): it fills the frame; the full
      // column is drawn so nothing is cropped in pixel space.
      let fy = bg.imageY.isFinite ? max(0, min(0.95, bg.imageY)) : 0
      let fh = bg.imageHeight.isFinite ? max(0.05, min(1 - fy, bg.imageHeight)) : 1 - fy
      let srcW = CGFloat(source.width), srcH = CGFloat(source.height)
      let scale = max(size.width / srcW, size.height / (srcH * CGFloat(fh)))
      let w = srcW * scale, h = srcH * scale
      // CoreGraphics is bottom-up: the image's top is at y0 + h, so its point
      // at fraction f from the top is at y0 + h * (1 - f). Centre the band.
      var y0 = size.height / 2 - h * (1 - CGFloat(fy) - CGFloat(fh) / 2)
      y0 = min(0, max(size.height - h, y0))  // always cover the frame
      ctx.interpolationQuality = .high
      ctx.draw(source, in: CGRect(x: (size.width - w) / 2, y: y0, width: w, height: h))
      // Depth of field: the product is in focus, the room behind it is not.
      if finish.sceneBlur > 0.01, let drawn = ctx.makeImage(),
         let blurred = depthBlurred(drawn, amount: finish.sceneBlur, sharpY: sharpY) {
        ctx.draw(blurred, in: CGRect(origin: .zero, size: size))
      }
      // A soft darkening at the top and bottom keeps texts readable. The
      // gradient runs bottom-up (location 0 = bottom edge): slightly stronger
      // at the top, where the headline sits.
      let strength = CGFloat(bg.shade.isFinite ? max(0, min(1, bg.shade)) : 1)
      if strength > 0.001, let shade = CGGradient(
        colorsSpace: space,
        colors: [color("#000000", alpha: 0.3 * strength), color("#000000", alpha: 0),
                 color("#000000", alpha: 0), color("#000000", alpha: 0.38 * strength)] as CFArray,
        locations: [0, 0.3, 0.72, 1]) {
        ctx.drawLinearGradient(shade, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
      }
      return
    }
    if bg.split.isFinite && bg.split > 0 && bg.split < 1 {
      // Hard two-colour split, no gradient: "top" left of the edge, "bottom" right of it.
      let edge = (size.width * CGFloat(bg.split)).rounded()
      ctx.setFillColor(color(bg.bottom))
      ctx.fill(CGRect(x: 0, y: 0, width: size.width, height: size.height))
      ctx.setFillColor(color(bg.top))
      ctx.fill(CGRect(x: 0, y: 0, width: edge, height: size.height))
    } else if let gradient = CGGradient(colorsSpace: space, colors: [color(bg.bottom), color(bg.top)] as CFArray, locations: [0, 1]) {
      // CoreGraphics origin is bottom-left: "top" colour goes at maxY.
      ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
    }
    if bg.floor {
      // Floor: the lower 40% darkens slightly towards the viewer, with a soft horizon.
      let horizon = size.height * 0.4
      if let floor = CGGradient(
        colorsSpace: space,
        colors: [color("#000000", alpha: 0.28), color("#000000", alpha: 0.0)] as CFArray,
        locations: [0, 1]) {
        ctx.drawLinearGradient(floor, start: .zero, end: CGPoint(x: 0, y: horizon), options: [])
      }
      ctx.setFillColor(color("#FFFFFF", alpha: 0.06))
      ctx.fill(CGRect(x: 0, y: horizon - 1, width: size.width, height: 2))
    }
    if let glow = CGGradient(
      colorsSpace: space,
      colors: [color(bg.glow, alpha: 0.85), color(bg.glow, alpha: 0)] as CFArray,
      locations: [0, 1]) {
      let center = CGPoint(x: size.width / 2, y: size.height * 0.55)
      ctx.drawRadialGradient(glow, startCenter: center, startRadius: 0, endCenter: center,
                             endRadius: size.width * 0.75, options: [])
    }
  }

  /// The product mirrored vertically and faded out, drawn under it as a floor reflection.
  static func reflectionImage(_ product: CGImage, strength: Double = 1) -> CGImage? {
    let size = CGSize(width: product.width, height: product.height)
    guard let ctx = makeContext(size) else { return nil }
    ctx.translateBy(x: 0, y: size.height)
    ctx.scaleBy(x: 1, y: -1)
    ctx.draw(product, in: CGRect(origin: .zero, size: size))
    ctx.scaleBy(x: 1, y: -1)
    ctx.translateBy(x: 0, y: -size.height)
    ctx.setBlendMode(.destinationIn)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    if let fade = CGGradient(
      colorsSpace: space,
      colors: [color("#000000", alpha: 0), color("#000000", alpha: 0.32 * CGFloat(max(0, min(1, strength))))] as CFArray,
      locations: [0.55, 1]) {
      ctx.drawLinearGradient(fade, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
    }
    return ctx.makeImage()
  }

  static func font(_ weight: String, size: CGFloat, family: String = "system") -> UIFont {
    ProductFonts.registerOnce()
    if let name = ProductFonts.postScriptName(family: family, weight: weight),
       let bundled = UIFont(name: name, size: size) {
      return bundled
    }
    // System font (also the fallback when a bundled font cannot be created).
    let w: UIFont.Weight = weight == "heavy" ? .heavy : weight == "bold" ? .bold : .medium
    let base = UIFont.systemFont(ofSize: size, weight: w)
    if let rounded = base.fontDescriptor.withDesign(.rounded), weight == "heavy" {
      return UIFont(descriptor: rounded, size: size)
    }
    return base
  }

  static func textImage(_ text: ProductTextSpec, frame: CGSize) -> PreparedText? {
    let fontSize = CGFloat(text.size) * frame.width
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    let metrics = ProductFonts.metrics(family: text.font, weight: text.weight)
    paragraph.lineHeightMultiple = metrics.lineHeight
    let tracking = text.tracking.isFinite ? max(-0.05, min(0.3, text.tracking)) : 0
    var attributes: [NSAttributedString.Key: Any] = [
      .font: font(text.weight, size: fontSize, family: text.font),
      .foregroundColor: UIColor(cgColor: color(text.color)),
      .paragraphStyle: paragraph,
      .kern: fontSize * CGFloat(metrics.kern + tracking),
    ]
    if text.strike {
      // Old price: a thick line through every line of the text, in its colour.
      attributes[.strikethroughStyle] = NSUnderlineStyle.thick.rawValue
      attributes[.strikethroughColor] = UIColor(cgColor: color(text.color))
    }
    let string = NSMutableAttributedString(string: text.text, attributes: attributes)
    // Letter spacing after the last character would push centred text left.
    let length = (text.text as NSString).length
    if length > 0 {
      let last = (text.text as NSString).rangeOfComposedCharacterSequence(at: length - 1)
      string.addAttribute(.kern, value: CGFloat(0), range: last)
    }
    let maxWidth = frame.width * (text.fill.isEmpty ? 0.86 : 0.78)
    let bounds = string.boundingRect(
      with: CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).integral
    let padX: CGFloat = text.fill.isEmpty ? 4 : fontSize * 0.7
    // Plain texts get room above and below for accents (İ, Ş) that tight line heights push out.
    let padY: CGFloat = text.fill.isEmpty ? max(2, fontSize * 0.15) : fontSize * 0.35
    let size = CGSize(width: bounds.width + padX * 2, height: bounds.height + padY * 2)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
      let cg = context.cgContext
      if !text.fill.isEmpty {
        cg.setFillColor(color(text.fill))
        let pill = UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: min(size.height / 2, fontSize))
        cg.addPath(pill.cgPath)
        cg.fillPath()
      } else {
        // Soft shadow so plain text stays readable on bright backgrounds.
        cg.setShadow(offset: CGSize(width: 0, height: fontSize * 0.04), blur: fontSize * 0.25,
                     color: color("#000000", alpha: 0.35))
      }
      string.draw(with: CGRect(x: padX, y: padY, width: bounds.width, height: bounds.height),
                  options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
    }
    guard let cg = image.cgImage else { return nil }
    return PreparedText(image: cg, size: size, spec: text)
  }

  static func watermarkImage(frame: CGSize) -> PreparedText? {
    var spec = ProductTextSpec()
    spec.text = "Vidora"
    spec.size = 0.034
    spec.weight = "heavy"
    spec.color = "#FFFFFF"
    spec.fill = ""
    return textImage(spec, frame: frame)
  }

  // MARK: Drawing (top-left coordinates; images are flipped on draw)

  static func draw(_ image: CGImage, in rect: CGRect, ctx: CGContext, alpha: CGFloat = 1) {
    ctx.saveGState()
    ctx.setAlpha(alpha)
    ctx.translateBy(x: rect.minX, y: rect.maxY)
    ctx.scaleBy(x: 1, y: -1)
    ctx.draw(image, in: CGRect(origin: .zero, size: rect.size))
    ctx.restoreGState()
  }

  /// The product with a light band crossing it; `p` runs 0...1 over the sweep.
  /// Draws the low-resolution light overlay over the product, inside its outline.
  static func relitProduct(_ product: CGImage, overlay: CGImage) -> CGImage? {
    let size = CGSize(width: product.width, height: product.height)
    guard let ctx = makeContext(size) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(product, in: CGRect(origin: .zero, size: size))
    ctx.setBlendMode(.sourceAtop)
    ctx.draw(overlay, in: CGRect(origin: .zero, size: size))
    return ctx.makeImage()
  }

  static func litProduct(_ product: CGImage, p: Double) -> CGImage? {
    let size = CGSize(width: product.width, height: product.height)
    guard let ctx = makeContext(size) else { return nil }
    ctx.draw(product, in: CGRect(origin: .zero, size: size))
    ctx.setBlendMode(.sourceAtop)
    let band = size.width * 0.45
    let travel = size.width + size.height + band * 2
    let offset = -band - size.height + CGFloat(p) * travel
    let strength = sin(Double.pi * p) * 0.55
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    if let gradient = CGGradient(
      colorsSpace: space,
      colors: [color("#FFFFFF", alpha: 0), color("#FFFFFF", alpha: CGFloat(strength)), color("#FFFFFF", alpha: 0)] as CFArray,
      locations: [0, 0.5, 1]) {
      // Diagonal band from lower-left to upper-right.
      ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: offset, y: 0),
        end: CGPoint(x: offset + band, y: band * 0.6),
        options: [])
    }
    return ctx.makeImage()
  }

  static func textAppearance(_ text: PreparedText, t: Double, total: Double) -> (alpha: CGFloat, dx: CGFloat, dy: CGFloat, scale: CGFloat)? {
    let spec = text.spec
    guard t >= spec.start, t <= spec.end else { return nil }
    let inDuration = 0.5
    let u = min(1, (t - spec.start) / inDuration)
    var alpha = ease("out", u)
    var dx = 0.0, dy = 0.0, scale = 1.0
    switch spec.animation {
    case "rise": dy = (1 - ease("out", u)) * 0.035
    case "pop":
      alpha *= min(1, u * 2.5)
      scale = 0.6 + 0.4 * ease("back", u)
    case "slide": dx = (ease("out", u) - 1) * 0.12
    default: break
    }
    // A text that ends before the video leaves with its exit animation.
    if spec.end < total - 0.01 {
      let length = max(0.15, min(0.4, (spec.end - spec.start) / 3))
      let k = ease("inOut", 1 - max(0, min(1, (spec.end - t) / length)))
      if k > 0 {
        alpha *= 1 - k
        let kind = spec.exit.isEmpty ? spec.animation : spec.exit
        switch kind {
        case "rise": dy -= k * 0.03
        case "pop": scale *= 1 - 0.3 * k
        case "slide": dx += k * 0.12
        default: break
        }
      }
    }
    return (CGFloat(alpha), CGFloat(dx), CGFloat(dy), CGFloat(scale))
  }

  static let ciContext = CIContext(options: [.cacheIntermediates: false])

  /// The product turned around its vertical axis with a light perspective:
  /// the far edge gets shorter, the near edge taller. Returns the image and its
  /// height relative to the input.
  static func turned(_ image: CGImage, yaw: Double) -> (image: CGImage, heightFactor: CGFloat)? {
    let w = CGFloat(image.width), h = CGFloat(image.height)
    let rad = yaw * Double.pi / 180
    let cw = w * CGFloat(cos(rad))
    let s = CGFloat(sin(abs(rad))) * 0.18
    let left = (w - cw) / 2, right = (w + cw) / 2
    let leftH = h * (yaw > 0 ? 1 + s : 1 - s)
    let rightH = h * (yaw > 0 ? 1 - s : 1 + s)
    let mid = h / 2
    guard let filter = CIFilter(name: "CIPerspectiveTransform") else { return nil }
    filter.setValue(CIImage(cgImage: image), forKey: kCIInputImageKey)
    filter.setValue(CIVector(x: left, y: mid + leftH / 2), forKey: "inputTopLeft")
    filter.setValue(CIVector(x: right, y: mid + rightH / 2), forKey: "inputTopRight")
    filter.setValue(CIVector(x: right, y: mid - rightH / 2), forKey: "inputBottomRight")
    filter.setValue(CIVector(x: left, y: mid - leftH / 2), forKey: "inputBottomLeft")
    guard let output = filter.outputImage else { return nil }
    let factor = 1 + s
    let crop = CGRect(x: 0, y: mid - h * factor / 2, width: w, height: h * factor)
    guard let cg = ciContext.createCGImage(output, from: crop) else { return nil }
    return (cg, factor)
  }

  /// Camera transform for a layer: `zoom` around `focus`, which lands in the frame centre.
  static func applyCamera(_ ctx: CGContext, zoom: CGFloat, focus: CGPoint, frame: CGSize) {
    ctx.translateBy(x: frame.width / 2, y: frame.height / 2)
    ctx.scaleBy(x: zoom, y: zoom)
    ctx.translateBy(x: -focus.x, y: -focus.y)
  }

  /// Moves `focus` just enough that a layer covering `cover` still fills the frame at `zoom`.
  static func clampedFocus(_ focus: CGPoint, zoom: CGFloat, cover: CGRect, frame: CGSize) -> CGPoint {
    let halfW = frame.width / (2 * zoom), halfH = frame.height / (2 * zoom)
    let lowX = cover.minX + halfW, highX = cover.maxX - halfW
    let lowY = cover.minY + halfH, highY = cover.maxY - halfH
    return CGPoint(
      x: lowX <= highX ? min(max(focus.x, lowX), highX) : cover.midX,
      y: lowY <= highY ? min(max(focus.y, lowY), highY) : cover.midY)
  }

  /// Silhouette cast shadow, soft ambient occlusion and a thin dark contact
  /// line where the product meets the floor. Follows rotation and yaw.
  static func drawShadow(ctx: CGContext, scene: PreparedScene, pose: ProductPose, cx: CGFloat, cy: CGFloat,
                         w: CGFloat, h: CGFloat, opacity: CGFloat, cast: Bool = true) {
    let sprite = scene.shadow
    let turn = CGFloat(abs(cos(pose.yaw * Double.pi / 180)))
    let rad = CGFloat(pose.rotation * Double.pi / 180)
    let footLeft = sprite?.footLeft ?? -0.42, footRight = sprite?.footRight ?? 0.42
    // The base centre in the product's own frame, then rotated with it (y down).
    let localX = (footLeft + footRight) / 2 * w * turn
    let localY = h / 2 - (sprite?.baseLift ?? 0) * h
    let bx = cx + localX * cos(rad) - localY * sin(rad)
    let by = cy + localX * sin(rad) + localY * cos(rad)
    if cast, let sprite {
      let unitX = h * turn, unitY = h
      draw(sprite.image,
           in: CGRect(x: bx - sprite.anchor.x * unitX, y: by - sprite.anchor.y * unitY,
                      width: sprite.size.width * unitX, height: sprite.size.height * unitY),
           ctx: ctx, alpha: 0.55 * opacity)
    }
    let footWidth = max(4, (footRight - footLeft) * w * turn)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    // An elliptical gradient blob centred under the base. `core` (0...1) is how
    // far out the darkness holds before it fades, so a blob can be dark in the
    // middle and still soft at its rim.
    func blob(width: CGFloat, height: CGFloat, alpha: CGFloat, lift: CGFloat, core: CGFloat = 0) {
      guard width > 0, height > 0, alpha > 0.001, let gradient = CGGradient(
        colorsSpace: space,
        colors: [color("#000000", alpha: alpha), color("#000000", alpha: alpha * 0.8),
                 color("#000000", alpha: 0)] as CFArray,
        locations: [0, max(0.01, min(0.9, core)), 1]) else { return }
      ctx.saveGState()
      ctx.translateBy(x: bx, y: by - lift)
      ctx.scaleBy(x: 1, y: height / width)
      ctx.drawRadialGradient(gradient, startCenter: .zero, startRadius: 0, endCenter: .zero,
                             endRadius: width / 2, options: [])
      ctx.restoreGState()
    }
    // Wide, faint ambient occlusion on the floor around the footprint.
    blob(width: footWidth * 1.35, height: max(3, h * 0.06), alpha: 0.3 * opacity, lift: 0, core: 0.2)
    // Narrow, dark occlusion right under the base, so the product sits on the surface.
    blob(width: footWidth * 1.08, height: max(3, h * 0.03), alpha: 0.55 * opacity, lift: 0, core: 0.45)
    // Contact line where the base touches the floor.
    blob(width: footWidth * 0.98, height: max(2, h * 0.012), alpha: 0.8 * opacity, lift: h * 0.001, core: 0.6)
  }

  static func drawFrame(ctx: CGContext, t: Double, spec: ProductVideoSpec, scene: PreparedScene) {
    let size = scene.size, product = scene.product, reflection = scene.reflection
    let sparkles = scene.sparkles, texts = scene.texts, watermark = scene.watermark
    let W = size.width, H = size.height
    // Flip to top-left origin.
    ctx.saveGState()
    ctx.translateBy(x: 0, y: H)
    ctx.scaleBy(x: 1, y: -1)

    // The product's place before the camera.
    let pose = ProductRenderer.pose(at: t, keys: spec.keys)
    let aspect = CGFloat(product.width) / CGFloat(max(1, product.height))
    let h = CGFloat(pose.scale) * H * scene.fit
    let w = h * aspect
    let cx = CGFloat(pose.x) * W, cy = CGFloat(pose.y) * H
    let opacity = CGFloat(pose.opacity)

    // Camera: the slow move from `camera` times the current cut's zoom onto
    // its focus point (which follows the product).
    let progress = max(0, min(1, t / spec.duration))
    var zoom = CGFloat(spec.camera.zoomFrom + (spec.camera.zoomTo - spec.camera.zoomFrom) * ease("inOut", progress))
    var focus = CGPoint(x: W / 2, y: H / 2)
    if let shot = activeShot(at: t, shots: spec.shots) {
      zoom *= CGFloat(shot.zoom)
      if shot.zoom > 1.0001 {
        focus = CGPoint(x: cx + CGFloat(shot.focusX) * w, y: cy + CGFloat(shot.focusY) * h)
      }
    }
    // The background is a little larger than the frame, zooms less than the
    // product and drifts sideways: depth without moving the product.
    let finish = scene.finish
    let backgroundZoom = 1 + (zoom - 1) * CGFloat(1 - 0.4 * finish.parallax)
    let bgW = W * scene.backgroundScale, bgH = H * scene.backgroundScale
    let pan = (CGFloat(progress) - 0.5) * (bgW - W) * 0.8
    let bgRect = CGRect(x: (W - bgW) / 2 + pan, y: (H - bgH) / 2, width: bgW, height: bgH)
    // One focus for both layers, kept where the background still fills the frame.
    focus = clampedFocus(focus, zoom: backgroundZoom, cover: bgRect, frame: size)

    ctx.saveGState()
    applyCamera(ctx, zoom: backgroundZoom, focus: focus, frame: size)
    draw(scene.background, in: bgRect, ctx: ctx)
    ctx.restoreGState()

    ctx.saveGState()
    applyCamera(ctx, zoom: zoom, focus: focus, frame: size)

    if spec.shadow, opacity > 0.01 {
      // Marketplace main images keep only a softer contact shadow.
      let contactOnly = spec.shadowStyle == "contact"
      drawShadow(ctx: ctx, scene: scene, pose: pose, cx: cx, cy: cy, w: w, h: h,
                 opacity: contactOnly ? opacity * 0.75 : opacity, cast: !contactOnly)
    }

    // Product (with an optional light sweep) and its reflection share one transform.
    var image = product
    for sweep in spec.sweeps where t >= sweep.start && t <= sweep.start + sweep.duration {
      if let lit = litProduct(product, p: (t - sweep.start) / sweep.duration) { image = lit }
      break
    }
    if let depth = scene.depth, spec.relief > 0.01 {
      // The light circles the product and follows its turn, so highlights
      // slide over the relief like a real studio light.
      let angle = t * 2 * Double.pi / 5 + pose.yaw * Double.pi / 180 * 1.5
      if let overlay = depth.lightOverlay(angle: angle, strength: spec.relief),
         let relit = relitProduct(image, overlay: overlay) {
        image = relit
      }
    }
    var drawHeight = h
    var reflectionWidth = w
    if abs(pose.yaw) > 0.3, let turn = turned(image, yaw: pose.yaw) {
      image = turn.image
      drawHeight = h * turn.heightFactor
      reflectionWidth = w * CGFloat(cos(pose.yaw * Double.pi / 180))
    }
    ctx.saveGState()
    ctx.translateBy(x: cx, y: cy)
    ctx.rotate(by: CGFloat(pose.rotation * Double.pi / 180))
    if spec.reflection, let reflection {
      draw(reflection, in: CGRect(x: -reflectionWidth / 2, y: h / 2, width: reflectionWidth, height: h), ctx: ctx, alpha: opacity)
    }
    draw(image, in: CGRect(x: -w / 2, y: -drawHeight / 2, width: w, height: drawHeight), ctx: ctx, alpha: opacity)
    ctx.restoreGState()

    // Sparkles twinkle around the product, added on top with light blending.
    if !sparkles.isEmpty, let sparkleSpec = spec.sparkles {
      ctx.saveGState()
      ctx.setBlendMode(.plusLighter)
      for s in sparkles {
        let wave = sin((t / s.period + s.phase) * 2 * Double.pi)
        let a = max(0, wave) * Double(opacity)
        guard a > 0.02 else { continue }
        let r = CGFloat(s.size) * W * CGFloat(0.6 + 0.4 * a)
        let px = cx + CGFloat(s.dx) * w, py = cy + CGFloat(s.dy) * h
        ctx.setFillColor(color(sparkleSpec.color, alpha: CGFloat(a)))
        // Four-point star: two thin crossed ellipses and a core.
        ctx.fillEllipse(in: CGRect(x: px - r, y: py - r * 0.12, width: r * 2, height: r * 0.24))
        ctx.fillEllipse(in: CGRect(x: px - r * 0.12, y: py - r, width: r * 0.24, height: r * 2))
        ctx.fillEllipse(in: CGRect(x: px - r * 0.25, y: py - r * 0.25, width: r * 0.5, height: r * 0.5))
      }
      ctx.restoreGState()
    }
    ctx.restoreGState()  // product camera

    // Vignette belongs to the lens: fixed to the frame, under the texts.
    if let vignette = scene.vignette {
      ctx.saveGState()
      ctx.translateBy(x: W / 2, y: H / 2)
      ctx.scaleBy(x: 1, y: H / W)
      ctx.drawRadialGradient(vignette, startCenter: .zero, startRadius: W * 0.36, endCenter: .zero,
                             endRadius: W * 0.72, options: [.drawsAfterEndLocation])
      ctx.restoreGState()
    }

    // Texts sit above the camera move so they stay sharp and in place.
    for text in texts {
      guard let look = textAppearance(text, t: t, total: spec.duration), look.alpha > 0.005 else { continue }
      let sw = text.size.width * look.scale, sh = text.size.height * look.scale
      let centerX = W / 2 + look.dx * W
      let centerY = CGFloat(text.spec.y) * H + look.dy * H
      draw(text.image, in: CGRect(x: centerX - sw / 2, y: centerY - sh / 2, width: sw, height: sh), ctx: ctx, alpha: look.alpha)
    }
    if let watermark {
      let margin = W * 0.045
      draw(watermark.image,
           in: CGRect(x: W - margin - watermark.size.width, y: H - margin * 2.4 - watermark.size.height,
                      width: watermark.size.width, height: watermark.size.height),
           ctx: ctx, alpha: 0.75)
    }
    ctx.restoreGState()
  }

  // MARK: Multi-scene drawing

  /// One frame of a prepared video: the single-product path unchanged, or the scenes.
  static func drawVideoFrame(ctx: CGContext, t: Double, spec: ProductVideoSpec, video: PreparedVideo) {
    switch video {
    case .single(let scene):
      drawFrame(ctx: ctx, t: t, spec: spec, scene: scene)
    case .scenes(let scenes):
      drawScenesFrame(ctx: ctx, t: t, spec: spec, video: scenes)
    }
  }

  /// A photo scene: the photo cover-fills the frame, the keys pan and zoom it
  /// (Ken Burns), then black at `shade` opacity keeps texts readable.
  static func drawPhotoScene(ctx: CGContext, t: Double, image: CGImage, keys: [ProductKeySpec], shade: Double, size: CGSize) {
    let W = size.width, H = size.height
    let pose = ProductRenderer.pose(at: t, keys: keys)
    let zoom = CGFloat(pose.scale.isFinite ? max(1, min(1.5, pose.scale)) : 1)
    let iw = CGFloat(max(1, image.width)), ih = CGFloat(max(1, image.height))
    let fill = max(W / iw, H / ih) * zoom
    let w = iw * fill, h = ih * fill
    // The photo point (x, y) goes to the frame centre, kept where the photo still covers the frame.
    let fx = CGFloat(pose.x.isFinite ? max(0, min(1, pose.x)) : 0.5)
    let fy = CGFloat(pose.y.isFinite ? max(0, min(1, pose.y)) : 0.5)
    let x0 = min(0, max(W - w, W / 2 - fx * w))
    let y0 = min(0, max(H - h, H / 2 - fy * h))
    // Flip to top-left origin, as drawFrame does.
    ctx.saveGState()
    ctx.translateBy(x: 0, y: H)
    ctx.scaleBy(x: 1, y: -1)
    ctx.setFillColor(color("#000000"))
    ctx.fill(CGRect(origin: .zero, size: size))
    draw(image, in: CGRect(x: x0, y: y0, width: w, height: h), ctx: ctx)
    let strength = CGFloat(shade.isFinite ? max(0, min(1, shade)) : 0)
    if strength > 0.001 {
      ctx.setFillColor(color("#000000", alpha: strength))
      ctx.fill(CGRect(origin: .zero, size: size))
    }
    ctx.restoreGState()
  }

  /// Depth at which the nearer layers begin (0 = farthest, 1 = nearest); the
  /// far layer is the whole photo, so it fills whatever a nearer layer uncovers.
  static let depthThresholds: [Float] = [0.25, 0.5, 0.75]
  /// Width of the soft edge of a depth layer, in depth units.
  static let depthFeather: Float = 0.12

  /// A depth scene: the photo as 4 depth layers drawn far to near, each moved
  /// by the camera. Keys: scale = dolly (1...1.4), x/y = camera offset
  /// (-1...1, y down); near layers move and grow more than far ones. No keys =
  /// camera at rest. Then black at `shade` opacity, as in a photo scene.
  static func drawDepthScene(ctx: CGContext, t: Double, image: CGImage, masks: [CGImage], keys: [ProductKeySpec], shade: Double, size: CGSize) {
    let W = size.width, H = size.height
    var orbitX: CGFloat = 0
    var orbitY: CGFloat = 0
    var dolly: CGFloat = 1
    if !keys.isEmpty {
      let pose = ProductRenderer.pose(at: t, keys: keys)
      orbitX = CGFloat(pose.x.isFinite ? max(-1, min(1, pose.x)) : 0)
      orbitY = CGFloat(pose.y.isFinite ? max(-1, min(1, pose.y)) : 0)
      dolly = CGFloat(pose.scale.isFinite ? max(1, min(1.4, pose.scale)) : 1)
    }
    let iw = CGFloat(max(1, image.width)), ih = CGFloat(max(1, image.height))
    // Cover-fill plus 6 % overscan: the far layer still covers the frame when it shifts.
    let fill = max(W / iw, H / ih) * 1.06
    let travel = W * 0.035
    let layerCount = masks.count + 1
    // Flip to top-left origin, as drawPhotoScene does.
    ctx.saveGState()
    ctx.translateBy(x: 0, y: H)
    ctx.scaleBy(x: 1, y: -1)
    ctx.setFillColor(color("#000000"))
    ctx.fill(CGRect(origin: .zero, size: size))
    for layer in 0..<layerCount {
      // 0 = far ... 1 = near.
      let near = CGFloat(layer) / CGFloat(max(1, layerCount - 1))
      let grow = 1 + (dolly - 1) * (0.5 + 0.5 * near)
      let w = iw * fill * grow
      let h = ih * fill * grow
      // The camera moves by (x, y): near layers shift against it, the far layer slightly with it.
      let lean = (near - 0.25) * travel
      let x0 = (W - w) / 2 - orbitX * lean
      let y0 = (H - h) / 2 - orbitY * lean
      let rect = CGRect(x: x0, y: y0, width: w, height: h)
      if layer == 0 {
        draw(image, in: rect, ctx: ctx)
      } else {
        // Same flip as `draw`, so the mask lines up with the photo.
        ctx.saveGState()
        ctx.translateBy(x: rect.minX, y: rect.maxY)
        ctx.scaleBy(x: 1, y: -1)
        let local = CGRect(origin: .zero, size: rect.size)
        ctx.clip(to: local, mask: masks[layer - 1])
        ctx.draw(image, in: local)
        ctx.restoreGState()
      }
    }
    let strength = CGFloat(shade.isFinite ? max(0, min(1, shade)) : 0)
    if strength > 0.001 {
      ctx.setFillColor(color("#000000", alpha: strength))
      ctx.fill(CGRect(origin: .zero, size: size))
    }
    ctx.restoreGState()
  }

  /// Feathered grey masks (white = drawn) of the nearer depth layers, one per
  /// threshold, at 3x the depth grid. Nil if the grid is unusable.
  static func depthMasks(_ field: DepthField) -> [CGImage]? {
    let gw = field.width, gh = field.height
    let source = field.depth
    guard gw > 1, gh > 1, source.count == gw * gh else { return nil }
    let up = 3
    let mw = gw * up, mh = gh * up
    // Depth resampled (bilinear) at mask size once, then thresholded per layer.
    var values = [Float](repeating: 0, count: mw * mh)
    for my in 0..<mh {
      let sy = max(0, min(Float(gh - 1), (Float(my) + 0.5) / Float(up) - 0.5))
      let y0 = Int(sy)
      let y1 = min(gh - 1, y0 + 1)
      let fy = sy - Float(y0)
      for mx in 0..<mw {
        let sx = max(0, min(Float(gw - 1), (Float(mx) + 0.5) / Float(up) - 0.5))
        let x0 = Int(sx)
        let x1 = min(gw - 1, x0 + 1)
        let fx = sx - Float(x0)
        let a = source[y0 * gw + x0], b = source[y0 * gw + x1]
        let c = source[y1 * gw + x0], d = source[y1 * gw + x1]
        let top = a + (b - a) * fx
        let bottom = c + (d - c) * fx
        values[my * mw + mx] = top + (bottom - top) * fy
      }
    }
    var masks: [CGImage] = []
    for threshold in depthThresholds {
      var pixels = [UInt8](repeating: 0, count: mw * mh)
      for i in 0..<(mw * mh) {
        let u = max(0, min(1, (values[i] - threshold) / depthFeather + 0.5))
        let soft = u * u * (3 - 2 * u)
        pixels[i] = UInt8(max(0, min(255, soft * 255)))
      }
      guard let provider = CGDataProvider(data: Data(pixels) as CFData),
            let mask = CGImage(
              width: mw, height: mh, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: mw,
              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
              provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
      else { return nil }
      masks.append(mask)
    }
    return masks
  }

  /// Keys for a depth scene drawn as a photo scene (no depth): the dolly
  /// becomes the zoom, the camera offset a small pan around the centre.
  /// New records, because copies of a record share their fields.
  static func photoKeys(fromDepth keys: [ProductKeySpec]) -> [ProductKeySpec] {
    return keys.map { (key: ProductKeySpec) -> ProductKeySpec in
      var out = ProductKeySpec()
      let x = key.x.isFinite ? max(-1, min(1, key.x)) : 0
      let y = key.y.isFinite ? max(-1, min(1, key.y)) : 0
      out.t = key.t
      out.x = 0.5 + 0.08 * x
      out.y = 0.5 + 0.08 * y
      out.scale = key.scale.isFinite ? max(1, min(1.4, key.scale)) : 1
      out.ease = key.ease
      return out
    }
  }

  /// Scene `index` at its own local time `t`, without the global texts.
  static func drawScene(ctx: CGContext, index: Int, t: Double, video: PreparedScenes) {
    let scene = video.scenes[index]
    if let photo = video.photos[index] {
      if let masks = video.depthMasks[index] {
        drawDepthScene(ctx: ctx, t: t, image: photo, masks: masks, keys: scene.keys, shade: scene.shade, size: video.size)
      } else {
        let keys = video.photoKeys[index] ?? scene.keys
        drawPhotoScene(ctx: ctx, t: t, image: photo, keys: keys, shade: scene.shade, size: video.size)
      }
    } else if let prepared = video.prepared[index], let cutoutSpec = video.specs[index] {
      drawFrame(ctx: ctx, t: t, spec: cutoutSpec, scene: prepared)
    }
  }

  /// The active scene (the last one started by `t`) and, during its entrance,
  /// the previous scene combined with it; then the global vignette, texts and
  /// watermark on top.
  static func drawScenesFrame(ctx: CGContext, t: Double, spec: ProductVideoSpec, video: PreparedScenes) {
    let size = video.size
    let W = size.width, H = size.height
    let frame = CGRect(origin: .zero, size: size)
    var index = 0
    for (i, scene) in video.scenes.enumerated() where scene.start <= t + 1e-6 { index = i }
    let current = video.scenes[index]
    let local = max(0, t - current.start)
    let kind = current.transition.kind
    let span = current.transition.duration
    let animated = kind == "push" || kind == "wipe" || kind == "zoom"
    let entering = index > 0 && animated && span.isFinite && span > 0.0001 && local < span
    if entering {
      let previousLocal = max(0, t - video.scenes[index - 1].start)
      let e = CGFloat(ease("inOut", local / span))
      // CoreGraphics is bottom-up here: +y moves a layer up on screen.
      if kind == "push" {
        // The previous scene slides up and out, the new one comes in from below.
        ctx.saveGState()
        ctx.translateBy(x: 0, y: e * H)
        ctx.clip(to: frame)
        drawScene(ctx: ctx, index: index - 1, t: previousLocal, video: video)
        ctx.restoreGState()
        ctx.saveGState()
        ctx.translateBy(x: 0, y: (e - 1) * H)
        ctx.clip(to: frame)
        drawScene(ctx: ctx, index: index, t: local, video: video)
        ctx.restoreGState()
      } else if kind == "wipe" {
        // The new scene is revealed from left to right.
        drawScene(ctx: ctx, index: index - 1, t: previousLocal, video: video)
        ctx.saveGState()
        ctx.clip(to: CGRect(x: 0, y: 0, width: W * e, height: H))
        drawScene(ctx: ctx, index: index, t: local, video: video)
        ctx.restoreGState()
      } else {
        // zoom: the previous scene grows 1 -> 1.15 and fades out over the new one.
        drawScene(ctx: ctx, index: index, t: local, video: video)
        ctx.saveGState()
        ctx.setAlpha(1 - e)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        let grow = 1 + 0.15 * e
        ctx.translateBy(x: W / 2, y: H / 2)
        ctx.scaleBy(x: grow, y: grow)
        ctx.translateBy(x: -W / 2, y: -H / 2)
        drawScene(ctx: ctx, index: index - 1, t: previousLocal, video: video)
        ctx.endTransparencyLayer()
        ctx.restoreGState()
      }
    } else {
      drawScene(ctx: ctx, index: index, t: local, video: video)
    }

    // Global layer, as at the end of drawFrame (top-left origin).
    ctx.saveGState()
    ctx.translateBy(x: 0, y: H)
    ctx.scaleBy(x: 1, y: -1)
    if let vignette = video.vignette {
      ctx.saveGState()
      ctx.translateBy(x: W / 2, y: H / 2)
      ctx.scaleBy(x: 1, y: H / W)
      ctx.drawRadialGradient(vignette, startCenter: .zero, startRadius: W * 0.36, endCenter: .zero,
                             endRadius: W * 0.72, options: [.drawsAfterEndLocation])
      ctx.restoreGState()
    }
    for text in video.texts {
      guard let look = textAppearance(text, t: t, total: spec.duration), look.alpha > 0.005 else { continue }
      let sw = text.size.width * look.scale, sh = text.size.height * look.scale
      let centerX = W / 2 + look.dx * W
      let centerY = CGFloat(text.spec.y) * H + look.dy * H
      draw(text.image, in: CGRect(x: centerX - sw / 2, y: centerY - sh / 2, width: sw, height: sh), ctx: ctx, alpha: look.alpha)
    }
    if let watermark = video.watermark {
      let margin = W * 0.045
      draw(watermark.image,
           in: CGRect(x: W - margin - watermark.size.width, y: H - margin * 2.4 - watermark.size.height,
                      width: watermark.size.width, height: watermark.size.height),
           ctx: ctx, alpha: 0.75)
    }
    ctx.restoreGState()
  }

  /// `image` scaled down so its height is `height` (never up).
  static func downscaled(_ image: CGImage, height: CGFloat) -> CGImage? {
    let scale = max(16, height) / CGFloat(max(1, image.height))
    guard scale < 1 else { return image }
    let size = CGSize(width: max(1, (CGFloat(image.width) * scale).rounded()),
                      height: max(1, (CGFloat(image.height) * scale).rounded()))
    guard let ctx = makeContext(size) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(origin: .zero, size: size))
    return ctx.makeImage()
  }

  // MARK: Encoding

  static func prepare(_ spec: ProductVideoSpec, size: CGSize) throws -> PreparedScene {
    try validate(spec)
    let productURL = try fileURL(spec.product)
    guard let productUI = UIImage(contentsOfFile: productURL.path), let original = productUI.cgImage else {
      throw ProductFailure.coded("product-unreadable", "The product image could not be read.")
    }
    let finish = ProductFinish(spec.look)
    let W = size.width, H = size.height

    // One fit factor for the whole animation: wide products are scaled so
    // their largest key fits 90% of the frame width; camera close-ups may
    // still go past the edges.
    let aspect = CGFloat(original.width) / CGFloat(max(1, original.height))
    let maxScale = CGFloat(spec.keys.map { $0.scale }.max() ?? 0.5)
    let fit = min(1, W * 0.9 / max(1, maxScale * H * aspect))
    // No more pixels than the largest close-up needs (previews prepare much faster).
    let maxZoom = CGFloat(max(spec.camera.zoomFrom, spec.camera.zoomTo)) * CGFloat(spec.shots.map { $0.zoom }.max() ?? 1)
    let needed = maxScale * H * fit * max(1, maxZoom) * 1.15
    let working = needed < CGFloat(original.height) * 0.8 ? (downscaled(original, height: needed) ?? original) : original

    // The product at rest (last key), in frame pixels, top-left origin.
    let rest = spec.keys[spec.keys.count - 1]
    let restH = CGFloat(rest.scale) * H * fit, restW = restH * aspect
    let restRect = CGRect(x: CGFloat(rest.x) * W - restW / 2, y: CGFloat(rest.y) * H - restH / 2, width: restW, height: restH)

    let backgroundScale = 1 + 0.06 * CGFloat(finish.parallax)
    let bgSize = CGSize(width: (W * backgroundScale).rounded(), height: (H * backgroundScale).rounded())
    let offset = CGPoint(x: (bgSize.width - W) / 2, y: (bgSize.height - H) / 2)
    let background = try backgroundImage(
      spec.background, size: bgSize, finish: finish,
      sharpY: (restRect.maxY + offset.y) / bgSize.height)
    // Outline cleanup first (cached), then colour match: same path for preview and final.
    let refined = ProductComposite.refineEdges(working, strength: finish.edge, key: productURL.path) ?? working
    let product = ProductComposite.harmonize(
      refined, background: background, rest: restRect.offsetBy(dx: offset.x, dy: offset.y),
      strength: finish.harmonize) ?? refined

    var sparkles: [Sparkle] = []
    // Sparkles read as dust on photographic scenes, so they only go on gradients.
    if let s = spec.sparkles, s.count > 0, spec.background.image.isEmpty {
      var random = SeededRandom(seed: s.seed)
      for _ in 0..<s.count {
        let angle = random.next() * 2 * Double.pi
        let radius = 0.45 + random.next() * 0.35
        sparkles.append(Sparkle(
          dx: cos(angle) * radius, dy: sin(angle) * radius * 0.8,
          size: 0.008 + random.next() * 0.016,
          phase: random.next(), period: 1.2 + random.next() * 1.8))
      }
    }
    var vignette: CGGradient?
    if finish.vignette > 0.01 {
      vignette = CGGradient(
        colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
        colors: [color("#000000", alpha: 0), color("#000000", alpha: CGFloat(finish.vignette) * 0.45)] as CFArray,
        locations: [0, 1])
    }
    return PreparedScene(
      size: size,
      background: background,
      backgroundScale: bgSize.width / W,
      product: product,
      fit: fit,
      shadow: spec.shadow ? ProductComposite.shadowSprite(product) : nil,
      reflection: spec.reflection ? reflectionImage(product, strength: finish.reflectionStrength) : nil,
      sparkles: sparkles,
      texts: spec.texts.compactMap { textImage($0, frame: size) },
      watermark: spec.watermark ? watermarkImage(frame: size) : nil,
      depth: spec.relief > 0.01 ? ProductDepth.field(for: original, key: productURL.path) : nil,
      finish: finish,
      vignette: vignette)
  }

  // MARK: Multi-scene preparation

  /// The single-product path when `scenes` is empty (exactly `prepare`), else the scenes.
  static func prepareVideo(_ spec: ProductVideoSpec, size: CGSize) throws -> PreparedVideo {
    if spec.scenes.isEmpty {
      let scene = try prepare(spec, size: size)
      return .single(scene)
    }
    let scenes = try prepareScenes(spec, size: size)
    return .scenes(scenes)
  }

  /// The single-product spec one cut-out scene is prepared and drawn with: its
  /// image, keys, shots and background; no texts or watermark (drawn once over
  /// all scenes). A new record, because copies of a record share their fields.
  static func sceneSpec(_ spec: ProductVideoSpec, scene: ProductSceneSpec, sweeps: [ProductSweepSpec]) -> ProductVideoSpec {
    var out = ProductVideoSpec()
    out.product = scene.image
    out.quality = spec.quality
    out.duration = spec.duration
    out.fps = spec.fps
    out.bitrate = spec.bitrate
    out.background = scene.background ?? spec.background
    out.camera = spec.camera
    out.keys = scene.keys.isEmpty ? spec.keys : scene.keys
    out.shadow = spec.shadow
    out.reflection = spec.reflection
    out.sweeps = sweeps
    out.sparkles = spec.sparkles
    out.texts = []
    out.watermark = false
    out.music = nil
    out.relief = spec.relief
    out.ratio = spec.ratio
    out.shadowStyle = spec.shadowStyle
    out.shots = scene.shots
    out.look = spec.look
    return out
  }

  /// Everything `prepare` reads from a cut-out scene spec that differs between
  /// scenes: scenes with the same key share one prepared scene.
  static func cutoutKey(_ s: ProductVideoSpec) -> String {
    let bg = s.background
    var parts: [String] = [s.product, bg.top, bg.bottom, bg.glow, bg.floor ? "floor" : "flat", bg.image]
    parts.append("\(bg.imageX),\(bg.imageWidth),\(bg.imageY),\(bg.imageHeight),\(bg.shade),\(bg.split)")
    for key in s.keys { parts.append("\(key.x),\(key.y),\(key.scale)") }
    for shot in s.shots { parts.append("\(shot.zoom)") }
    return parts.joined(separator: "|")
  }

  /// Prepares every scene once: each photo decoded at frame size, each cut-out
  /// through `prepare`, shared between scenes with the same image; the
  /// caches live only for this call, the result holds what the frames need.
  static func prepareScenes(_ spec: ProductVideoSpec, size: CGSize) throws -> PreparedScenes {
    try validate(spec)
    let scenes = spec.scenes
    let distinctImages = Set(scenes.map { $0.image }).count
    guard scenes.count <= 8, distinctImages <= 8 else {
      throw ProductFailure.invalid("The template has too many elements.")
    }
    var lastStart = -1.0
    for scene in scenes {
      let knownMode = scene.mode == "cutout" || scene.mode == "photo" || scene.mode == "depth"
      guard scene.start.isFinite, scene.start > lastStart, scene.transition.duration.isFinite,
            scene.shade.isFinite, knownMode else {
        throw ProductFailure.invalid("A scene in the template is invalid.")
      }
      lastStart = scene.start
    }
    let missing = ProductFailure.coded("product-scene-image", "A photo used in the video could not be opened.")
    let longest = max(size.width, size.height)
    var photoCache: [String: CGImage] = [:]
    var cutoutCache: [String: PreparedScene] = [:]
    var specs: [ProductVideoSpec?] = []
    var prepared: [PreparedScene?] = []
    var photos: [CGImage?] = []
    // Depth scenes: masks per image, images without usable depth, one log line per render.
    var depthCache: [String: [CGImage]] = [:]
    var noDepth = Set<String>()
    var loggedNoDepth = false
    var depthMasksList: [[CGImage]?] = []
    var photoKeysList: [[ProductKeySpec]?] = []
    for scene in scenes {
      guard let url = try? fileURL(scene.image), ProductImages.pixelSize(url) != nil else { throw missing }
      if scene.mode == "photo" || scene.mode == "depth" {
        let photo: CGImage
        if let hit = photoCache[scene.image] {
          photo = hit
        } else {
          guard let decoded = ProductImages.upright(url, maxSide: longest) else { throw missing }
          photoCache[scene.image] = decoded
          photo = decoded
        }
        var masks: [CGImage]? = nil
        if scene.mode == "depth" {
          if let hit = depthCache[scene.image] {
            masks = hit
          } else if !noDepth.contains(scene.image) {
            // The model runs once per image (ProductDepth also caches it across renders);
            // its buffers are freed before the next scene. Never fails the render.
            let depthKey = "scene-depth|" + url.path
            let made: [CGImage]? = autoreleasepool { () -> [CGImage]? in
              guard let field = ProductDepth.field(for: photo, key: depthKey) else { return nil }
              return depthMasks(field)
            }
            if let made {
              depthCache[scene.image] = made
              masks = made
            } else {
              noDepth.insert(scene.image)
            }
          }
          if masks == nil && !loggedNoDepth {
            loggedNoDepth = true
            NSLog("[VidoraDepth] depth scene without depth: drawn as a photo")
          }
        }
        specs.append(nil)
        prepared.append(nil)
        photos.append(photo)
        depthMasksList.append(masks)
        if scene.mode == "depth" && masks == nil {
          photoKeysList.append(photoKeys(fromDepth: scene.keys))
        } else {
          photoKeysList.append(nil)
        }
        continue
      }
      // Global sweeps keep their video time: shifted into the scene's local time.
      let shifted: [ProductSweepSpec] = spec.sweeps.map { (sweep: ProductSweepSpec) -> ProductSweepSpec in
        var moved = ProductSweepSpec()
        moved.start = sweep.start - scene.start
        moved.duration = sweep.duration
        return moved
      }
      // `prepare` validates its spec (sweeps must start at 0 or later) and never reads sweeps.
      let prepareSpec = sceneSpec(spec, scene: scene, sweeps: [])
      let key = cutoutKey(prepareSpec)
      let ready: PreparedScene
      if let hit = cutoutCache[key] {
        ready = hit
      } else {
        let base: PreparedScene
        do {
          // Each scene's decode and Core Image intermediates are freed before the next one.
          base = try autoreleasepool { () throws -> PreparedScene in
            try prepare(prepareSpec, size: size)
          }
        } catch let failure as ProductFailure {
          if case .coded(let code, _) = failure, code == "product-unreadable" { throw missing }
          throw failure
        }
        // The vignette belongs to the global layer, drawn once over the scenes.
        ready = PreparedScene(
          size: base.size,
          background: base.background,
          backgroundScale: base.backgroundScale,
          product: base.product,
          fit: base.fit,
          shadow: base.shadow,
          reflection: base.reflection,
          sparkles: base.sparkles,
          texts: [],
          watermark: nil,
          depth: base.depth,
          finish: base.finish,
          vignette: nil)
        cutoutCache[key] = ready
      }
      specs.append(sceneSpec(spec, scene: scene, sweeps: shifted))
      prepared.append(ready)
      photos.append(nil)
      depthMasksList.append(nil)
      photoKeysList.append(nil)
    }
    let finish = ProductFinish(spec.look)
    var vignette: CGGradient?
    if finish.vignette > 0.01 {
      vignette = CGGradient(
        colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
        colors: [color("#000000", alpha: 0), color("#000000", alpha: CGFloat(finish.vignette) * 0.45)] as CFArray,
        locations: [0, 1])
    }
    return PreparedScenes(
      size: size,
      scenes: scenes,
      specs: specs,
      prepared: prepared,
      photos: photos,
      depthMasks: depthMasksList,
      photoKeys: photoKeysList,
      texts: spec.texts.compactMap { textImage($0, frame: size) },
      watermark: spec.watermark ? watermarkImage(frame: size) : nil,
      vignette: vignette)
  }

  /// A half-resolution JPEG of the frame at `time` (540 px wide).
  static func previewFrame(spec: ProductVideoSpec, time: Double, dest: URL, isCurrent: () -> Bool) throws -> String {
    let size = frameSize(spec, width: 540)
    let video = try prepareVideo(spec, size: size)
    guard isCurrent() else { throw ProductFailure.stalePreview }
    guard let ctx = makeContext(size) else { throw ProductFailure.unavailable }
    ctx.interpolationQuality = .high
    drawVideoFrame(ctx: ctx, t: min(time, spec.duration), spec: spec, video: video)
    guard let image = ctx.makeImage(),
          let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.82) else {
      throw ProductFailure.unavailable
    }
    try? FileManager.default.removeItem(at: dest)
    try writeFile(data, to: dest)
    return dest.absoluteString
  }

  /// One frame at the video's full resolution: PNG for a .png destination, else JPEG.
  /// `maxBytes` > 0 re-encodes a JPEG with lower quality (0.93 down to 0.6)
  /// until it fits; at 0.6 it is written even if still larger. Returns the
  /// file URI, its size in bytes, its pixel size and the quality used.
  static func still(spec: ProductVideoSpec, time: Double, dest: URL, width: Double = 0,
                    maxBytes: Int = 0) throws -> [String: Any] {
    let size = width > 0 ? frameSize(spec, width: CGFloat(width.rounded())) : frameSize(spec)
    guard size.width >= 1, size.height >= 1, size.width <= 4096, size.height <= 4096 else {
      throw ProductFailure.invalid("Unsupported image size.")
    }
    let video = try prepareVideo(spec, size: size)
    guard let ctx = makeContext(size) else { throw ProductFailure.unavailable }
    ctx.interpolationQuality = .high
    drawVideoFrame(ctx: ctx, t: min(time, spec.duration), spec: spec, video: video)
    guard let image = ctx.makeImage() else { throw ProductFailure.unavailable }
    let picture = UIImage(cgImage: image)
    var quality: CGFloat = 1
    var encoded: Data?
    if dest.pathExtension.lowercased() == "png" {
      encoded = picture.pngData()
    } else {
      quality = 0.93
      encoded = picture.jpegData(compressionQuality: quality)
      while maxBytes > 0, let current = encoded, current.count > maxBytes, quality > 0.6 + 0.001 {
        quality = max(0.6, quality - 0.05)
        encoded = picture.jpegData(compressionQuality: quality)
      }
    }
    guard let data = encoded else { throw ProductFailure.unavailable }
    try writeFile(data, to: dest, options: .atomic)
    return [
      "uri": dest.absoluteString,
      "bytes": data.count,
      "width": Int(size.width),
      "height": Int(size.height),
      "quality": Double(quality),
    ]
  }

  /// JPEGs of the frames at `times`, drawn from one prepared scene, `width` px wide.
  static func previewFrames(spec: ProductVideoSpec, times: [Double], destDir: URL, width: CGFloat = 360,
                            isCurrent: () -> Bool) throws -> [String] {
    let size = frameSize(spec, width: width)
    let video = try prepareVideo(spec, size: size)
    guard let ctx = makeContext(size) else { throw ProductFailure.unavailable }
    ctx.interpolationQuality = width > 360 ? .high : .medium
    try FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)
    var uris: [String] = []
    uris.reserveCapacity(times.count)
    for (index, time) in times.enumerated() {
      // A newer request replaced this pass: stop instead of drawing frames nobody shows.
      guard isCurrent() else { throw ProductFailure.stalePreview }
      let uri: String = try autoreleasepool {
        ctx.clear(CGRect(origin: .zero, size: size))
        drawVideoFrame(ctx: ctx, t: min(time, spec.duration), spec: spec, video: video)
        guard let image = ctx.makeImage(),
              let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.85) else {
          throw ProductFailure.unavailable
        }
        let dest = destDir.appendingPathComponent(String(format: "frame-%03d.jpg", index))
        try writeFile(data, to: dest, options: .atomic)
        return dest.absoluteString
      }
      uris.append(uri)
    }
    return uris
  }

  /// Opens and checks the music before any encoding starts.
  static func loadMusic(_ music: ProductMusicSpec) async throws -> ProductMusicSource {
    let musicURL = try fileURL(music.uri)
    guard music.volume.isFinite, music.volume >= 0, music.volume <= 1 else {
      throw ProductFailure.invalid("Music volume must be between 0 and 1.")
    }
    let asset = AVURLAsset(url: musicURL)
    guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
      throw ProductFailure.invalid("The music file has no audio.")
    }
    let length = try await asset.load(.duration)
    guard length.seconds.isFinite, length.seconds > 0.5 else {
      throw ProductFailure.invalid("The music file is too short.")
    }
    return ProductMusicSource(asset: asset, track: track, volume: Float(music.volume))
  }

  /// Stops the render when it was cancelled or the writer or the music failed.
  static func ensureRunning(_ state: RenderState, _ writer: AVAssetWriter, _ feeder: ProductMusicFeeder?) throws {
    if state.isCancelled { throw ProductFailure.cancelled }
    try Task.checkCancellation()
    if writer.status == .failed { throw writer.error ?? ProductFailure.unavailable }
    if let error = feeder?.failure { throw error }
  }

  static func run(spec: ProductVideoSpec, dest: URL, state: RenderState, emit: @escaping (Double) -> Void) async throws -> String {
    let size = frameSize(spec)
    let video = try prepareVideo(spec, size: size)
    if case .single(let scene) = video {
      NSLog("[VidoraDepth] render: relief strength %.2f, depth %@", spec.relief,
            scene.depth == nil ? "missing (no relief)" : "ready")
    }
    // Bitrates are set for 9:16; smaller frames (4:5, 1:1) get proportionally less.
    let nominalPixels: CGFloat = spec.quality == "1080p" ? 1080 * 1920 : 720 * 1280
    let pixelShare = Double(max(0.55, min(1, size.width * size.height / nominalPixels)))
    let nominalBitrate = spec.bitrate == "compact"
      ? (spec.quality == "1080p" ? 4_500_000.0 : 2_500_000.0)
      : (spec.quality == "1080p" ? 10_000_000.0 : 5_000_000.0)
    let fps = Int32(spec.fps)
    let frames = Int((spec.duration * Double(fps)).rounded())

    let music: ProductMusicSource?
    if let musicSpec = spec.music, !musicSpec.uri.isEmpty {
      music = try await loadMusic(musicSpec)
    } else {
      music = nil
    }
    if state.isCancelled { throw ProductFailure.cancelled }

    // Video and music go through one writer straight into `dest`, so the
    // video is encoded once and keeps its bitrate.
    let writer = try AVAssetWriter(outputURL: dest, fileType: .mp4)
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(size.width),
      AVVideoHeightKey: Int(size.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: Int(nominalBitrate * pixelShare),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: Int(fps),
      ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: Int(size.width),
        kCVPixelBufferHeightKey as String: Int(size.height),
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        kCVPixelBufferCGImageCompatibilityKey as String: true,
      ])
    guard writer.canAdd(input) else { throw ProductFailure.unavailable }
    writer.add(input)

    let feeder: ProductMusicFeeder?
    if let music {
      let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: ProductMusicFeeder.writerSettings)
      audioInput.expectsMediaDataInRealTime = false
      guard writer.canAdd(audioInput) else { throw ProductFailure.unavailable }
      writer.add(audioInput)
      feeder = ProductMusicFeeder(
        source: music, input: audioInput, writer: writer, seconds: Double(frames) / Double(fps))
    } else {
      feeder = nil
    }

    guard writer.startWriting() else { throw writer.error ?? ProductFailure.unavailable }
    writer.startSession(atSourceTime: .zero)
    // The music is fed on its own queue while the frames are drawn here, so
    // the writer can interleave both and never waits on a starved input.
    feeder?.start()

    do {
      for index in 0..<frames {
        try ensureRunning(state, writer, feeder)
        while !input.isReadyForMoreMediaData {
          try ensureRunning(state, writer, feeder)
          try await Task.sleep(nanoseconds: 2_000_000)
        }
        guard let pool = adaptor.pixelBufferPool else { throw writer.error ?? ProductFailure.unavailable }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let pixels = buffer else { throw ProductFailure.unavailable }
        CVPixelBufferLockBaseAddress(pixels, [])
        let drawn: Bool = autoreleasepool {
          guard let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(pixels),
            width: Int(size.width), height: Int(size.height), bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
          else { return false }
          ctx.interpolationQuality = .high
          drawVideoFrame(ctx: ctx, t: Double(index) / Double(fps), spec: spec, video: video)
          return true
        }
        CVPixelBufferUnlockBaseAddress(pixels, [])
        guard drawn else { throw ProductFailure.unavailable }
        guard adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps)) else {
          throw writer.error ?? ProductFailure.unavailable
        }
        if index % 6 == 0 { emit(Double(index) / Double(frames)) }
      }
      input.markAsFinished()
      // Wait for the music to be fully written before closing the file.
      if let feeder {
        try await withTaskCancellationHandler {
          try await feeder.wait()
        } onCancel: {
          feeder.stop()
        }
      }
      if state.isCancelled { throw ProductFailure.cancelled }
      try Task.checkCancellation()
    } catch {
      feeder?.stop()
      writer.cancelWriting()
      throw error
    }
    // Give the last frame its full duration so the file is exactly `frames / fps` long.
    writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames), timescale: fps))
    await writer.finishWriting()
    guard writer.status == .completed else { throw writer.error ?? ProductFailure.unavailable }
    if state.isCancelled { throw ProductFailure.cancelled }
    emit(1)
    return dest.absoluteString
  }
}

// MARK: - Music

/// Music checked and ready to be laid under the video.
private struct ProductMusicSource {
  let asset: AVURLAsset
  let track: AVAssetTrack
  let volume: Float
}

/// Decodes the music to 16-bit PCM, loops it until the video is filled,
/// applies the volume and a fade-out, and appends it to the writer's AAC
/// input. Everything except `start`, `stop`, `wait` and `failure` runs on
/// `queue`.
private final class ProductMusicFeeder: @unchecked Sendable {
  static let sampleRate = 44_100.0

  /// What the reader decodes to: 16-bit interleaved PCM, 44.1 kHz stereo.
  static var readerSettings: [String: Any] {
    [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 2,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
  }

  /// What lands in the file: AAC, 44.1 kHz stereo, 128 kbps.
  static var writerSettings: [String: Any] {
    var layout = AudioChannelLayout()
    layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
    let layoutData = withUnsafeBytes(of: &layout) { Data($0) }
    return [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 2,
      AVEncoderBitRateKey: 128_000,
      AVChannelLayoutKey: layoutData,
    ]
  }

  private let source: ProductMusicSource
  private let input: AVAssetWriterInput
  private let writer: AVAssetWriter
  private let seconds: Double
  private let totalFrames: Int64
  private let fadeStart: Double
  private let fadeLength: Double
  private let queue = DispatchQueue(label: "app.vidora.product.music")

  private let flagLock = NSLock()
  private var cancelledFlag = false
  private var failureValue: Error?

  // Queue only.
  private var reader: AVAssetReader?
  private var output: AVAssetReaderTrackOutput?
  private var writtenFrames: Int64 = 0
  private var passFrames = 0
  private var result: Result<Void, Error>?
  private var continuation: CheckedContinuation<Void, Error>?

  init(source: ProductMusicSource, input: AVAssetWriterInput, writer: AVAssetWriter, seconds: Double) {
    self.source = source
    self.input = input
    self.writer = writer
    self.seconds = seconds
    self.totalFrames = Int64((seconds * Self.sampleRate).rounded())
    let fade = max(0.01, min(1.2, seconds / 4))
    self.fadeLength = fade
    self.fadeStart = seconds - fade
  }

  /// Set when the music failed (or was stopped); the video loop checks it.
  var failure: Error? {
    flagLock.lock()
    defer { flagLock.unlock() }
    return failureValue
  }

  private var isCancelled: Bool {
    flagLock.lock()
    defer { flagLock.unlock() }
    return cancelledFlag
  }

  func start() {
    input.requestMediaDataWhenReady(on: queue) { [weak self] in
      self?.feed()
    }
    watchWriter()
  }

  /// The input stops asking for data once the writer fails, so a waiter
  /// could otherwise wait forever. Checks the writer every 0.1 s until done.
  private func watchWriter() {
    queue.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self, self.result == nil else { return }
      if self.writer.status == .failed || self.writer.status == .cancelled {
        self.finish(.failure(self.writer.error ?? ProductFailure.unavailable))
      } else if self.isCancelled {
        self.finish(.failure(ProductFailure.cancelled))
      } else {
        self.watchWriter()
      }
    }
  }

  /// Stops feeding and releases anyone waiting. Safe to call more than once.
  /// Never call it from `queue`.
  func stop() {
    flagLock.lock()
    cancelledFlag = true
    flagLock.unlock()
    queue.sync {
      self.finish(.failure(ProductFailure.cancelled))
    }
  }

  /// Returns once all music is appended and the input is marked finished.
  func wait() async throws {
    try await withCheckedThrowingContinuation { (waiter: CheckedContinuation<Void, Error>) in
      self.queue.async {
        if let result = self.result {
          waiter.resume(with: result)
        } else {
          self.continuation = waiter
        }
      }
    }
  }

  private func feed() {
    guard result == nil else { return }
    while input.isReadyForMoreMediaData {
      if isCancelled {
        finish(.failure(ProductFailure.cancelled))
        return
      }
      do {
        guard let buffer = try nextBuffer() else {
          input.markAsFinished()
          finish(.success(()))
          return
        }
        guard input.append(buffer) else {
          throw writer.error ?? ProductFailure.unavailable
        }
      } catch {
        finish(.failure(error))
        return
      }
    }
  }

  private func finish(_ outcome: Result<Void, Error>) {
    guard result == nil else { return }
    result = outcome
    if case .failure(let error) = outcome {
      flagLock.lock()
      failureValue = error
      flagLock.unlock()
    }
    reader?.cancelReading()
    reader = nil
    output = nil
    continuation?.resume(with: outcome)
    continuation = nil
  }

  private func startPass() throws {
    let newReader = try AVAssetReader(asset: source.asset)
    let newOutput = AVAssetReaderTrackOutput(track: source.track, outputSettings: Self.readerSettings)
    newOutput.alwaysCopiesSampleData = false
    guard newReader.canAdd(newOutput) else { throw ProductFailure.unavailable }
    newReader.add(newOutput)
    guard newReader.startReading() else { throw newReader.error ?? ProductFailure.unavailable }
    reader = newReader
    output = newOutput
    passFrames = 0
  }

  /// The next buffer to append, or nil once the video length is filled.
  private func nextBuffer() throws -> CMSampleBuffer? {
    while writtenFrames < totalFrames {
      if output == nil { try startPass() }
      guard let currentReader = reader, let currentOutput = output else { throw ProductFailure.unavailable }
      if let sample = currentOutput.copyNextSampleBuffer() {
        if let built = try rebuild(sample) { return built }
        continue
      }
      if currentReader.status == .failed { throw currentReader.error ?? ProductFailure.unavailable }
      // End of this pass: loop the music with a fresh reader.
      reader = nil
      output = nil
      // A pass without any sound would loop forever.
      guard passFrames > 0 else { throw ProductFailure.invalid("The music file has no audio.") }
    }
    reader?.cancelReading()
    reader = nil
    output = nil
    return nil
  }

  /// Copies the PCM samples, scales them by volume and fade, cuts them at
  /// the end of the video and stamps them at the running offset.
  private func rebuild(_ sample: CMSampleBuffer) throws -> CMSampleBuffer? {
    guard let block = CMSampleBufferGetDataBuffer(sample),
          let format = CMSampleBufferGetFormatDescription(sample),
          let description = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee else {
      return nil
    }
    guard description.mFormatID == kAudioFormatLinearPCM, description.mBitsPerChannel == 16,
          abs(description.mSampleRate - Self.sampleRate) < 1 else {
      throw ProductFailure.unavailable
    }
    let channels = max(1, Int(description.mChannelsPerFrame))
    let bytesPerFrame = channels * MemoryLayout<Int16>.size
    let available = min(CMSampleBufferGetNumSamples(sample), CMBlockBufferGetDataLength(block) / bytesPerFrame)
    let remaining = Int(totalFrames - writtenFrames)
    let frameCount = min(available, remaining)
    guard frameCount > 0 else { return nil }
    let byteCount = frameCount * bytesPerFrame

    var samples = [Int16](repeating: 0, count: frameCount * channels)
    let copied = samples.withUnsafeMutableBytes { raw -> OSStatus in
      guard let base = raw.baseAddress else { return -1 }
      return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: base)
    }
    guard copied == 0 else { throw ProductFailure.unavailable }

    let rate = Self.sampleRate
    let firstFrame = writtenFrames
    let volume = source.volume
    let fadeStart = self.fadeStart, fadeLength = self.fadeLength, seconds = self.seconds
    samples.withUnsafeMutableBufferPointer { values in
      for frame in 0..<frameCount {
        let t = Double(firstFrame + Int64(frame)) / rate
        var gain = volume
        if t > fadeStart {
          gain *= Float(max(0, min(1, (seconds - t) / fadeLength)))
        }
        if gain >= 0.9999 { continue }
        let base = frame * channels
        for channel in 0..<channels {
          let scaled = (Float(values[base + channel]) * gain).rounded()
          values[base + channel] = Int16(max(-32768, min(32767, scaled)))
        }
      }
    }

    var newBlock: CMBlockBuffer?
    var status = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault,
      memoryBlock: nil,
      blockLength: byteCount,
      blockAllocator: kCFAllocatorDefault,
      customBlockSource: nil,
      offsetToData: 0,
      dataLength: byteCount,
      flags: kCMBlockBufferAssureMemoryNowFlag,
      blockBufferOut: &newBlock)
    guard status == 0, let filled = newBlock else { throw ProductFailure.unavailable }
    status = samples.withUnsafeBytes { raw -> OSStatus in
      guard let base = raw.baseAddress else { return -1 }
      return CMBlockBufferReplaceDataBytes(
        with: base, blockBuffer: filled, offsetIntoDestination: 0, dataLength: byteCount)
    }
    guard status == 0 else { throw ProductFailure.unavailable }

    var rebuilt: CMSampleBuffer?
    status = CMAudioSampleBufferCreateReadyWithPacketDescriptions(
      allocator: kCFAllocatorDefault,
      dataBuffer: filled,
      formatDescription: format,
      sampleCount: frameCount,
      presentationTimeStamp: CMTime(value: CMTimeValue(firstFrame), timescale: CMTimeScale(rate)),
      packetDescriptions: nil,
      sampleBufferOut: &rebuilt)
    guard status == 0, let stamped = rebuilt else { throw ProductFailure.unavailable }
    writtenFrames += Int64(frameCount)
    passFrames += frameCount
    return stamped
  }
}
