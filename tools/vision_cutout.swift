// Cuts the subject out of a photo with Apple's subject lifting, on the macOS
// host (not the simulator, which has no subject lifting).
//
// Mirrors ProductCutout.visionCutout in
// apps/mobile/modules/karevia-editor/ios/KareviaProductModule.swift: every
// foreground instance, cropped to the instances' extent, written as an RGBA PNG.
//
// Build and run:
//   swiftc -O tools/vision_cutout.swift -o vision_cutout
//   ./vision_cutout apps/mobile/assets/sample-product.jpg out/sample-product-cutout.png
//
// Prints one RESULT line: "RESULT found <w> <h>", "RESULT empty" or
// "RESULT failed <error>". Exit code 0 only when a cut-out was written.
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  print("usage: vision_cutout <in.jpg> <out.png>")
  exit(64)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let source = CGImageSourceCreateWithURL(inURL as CFURL, nil),
  let input = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
  print("RESULT failed cannot read \(inURL.path)")
  exit(66)
}
print("input \(input.width) x \(input.height)")

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: input, options: [:])
do {
  try handler.perform([request])
  guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
    print("RESULT empty")
    exit(2)
  }
  print("instances \(observation.allInstances.count)")
  let masked = try observation.generateMaskedImage(
    ofInstances: observation.allInstances,
    from: handler,
    croppedToInstancesExtent: true)
  let image = CIImage(cvPixelBuffer: masked)
  let context = CIContext()
  guard let cut = context.createCGImage(image, from: image.extent) else {
    print("RESULT failed no CGImage from the masked buffer")
    exit(3)
  }
  guard
    let destination = CGImageDestinationCreateWithURL(
      outURL as CFURL, UTType.png.identifier as CFString, 1, nil)
  else {
    print("RESULT failed cannot create \(outURL.path)")
    exit(73)
  }
  CGImageDestinationAddImage(destination, cut, nil)
  guard CGImageDestinationFinalize(destination) else {
    print("RESULT failed cannot write \(outURL.path)")
    exit(74)
  }
  print("RESULT found \(cut.width) \(cut.height)")
} catch {
  print("RESULT failed \(String(describing: error))")
  exit(4)
}
