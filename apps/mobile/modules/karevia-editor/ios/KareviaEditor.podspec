Pod::Spec.new do |s|
  s.name = 'KareviaEditor'
  s.version = '0.1.0'
  s.summary = 'Local video editing for Karevia Studio'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Karevia Studio'
  s.homepage = 'https://karevia.invalid'
  s.source = { :path => '.' }
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreML', 'CoreVideo', 'QuartzCore', 'Speech', 'StoreKit', 'UIKit', 'Vision'
  # iOS 26+: weak so the app still launches on older iOS versions.
  s.weak_frameworks = 'FoundationModels'
  # Depth Anything V2 Small (Apple, Apache-2.0), 8-bit palettized, ~25 MB.
  # Compiled on the device on first use if Xcode copies the package as is.
  # Video text fonts (SIL OFL; licence texts are next to them), registered at runtime.
  s.resources = ['models/*.mlpackage', 'fonts/*.ttf']
  s.source_files = '**/*.{h,m,swift}'
end
