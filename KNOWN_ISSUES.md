# Known issues

- Text-to-video and image-to-video each passed a local smoke test and an API-to-worker test. Broader prompt, quality and capacity testing remain unverified. Each capability requires local proof before activation.
- The signed iOS build and real-device tests have not been performed. Windows Application Control blocks the local unsigned Hermes compiler.
- Qwen3 4B sometimes returns internal thinking text or reaches the output limit. The router rejects those outputs and falls back to the installed Qwen 2.5 model.
- The workstation API is bound to localhost and is not a production multi-user service. Continuous publicly available inference, moderation and capacity are unresolved.
- CI is configured but GitHub Actions is disabled until account quota and spending safeguards can be verified.
- One Chrome sample export had strictly increasing packet and decoded-frame timestamps. A null-output FFmpeg warning disappeared with a 1/1000-second encoder time base. Verify timing across other clips and browsers.
- Local Whisper can misrecognize Turkish words or invent sounds, especially around silence. Review captions and timings before sharing; a 30-second queue mitigated one synthetic-sample false cue but does not guarantee accuracy.
- `expo-image-picker` and `expo-media-library` were added to apps/mobile/package.json without updating package-lock.json. `npm ci` fails until `npm install` is run with network access and the lockfile is committed.
- The new Swift editor module, Photos import/save, privacy manifest and locales are unverified until an EAS cloud build (`eas build --platform ios --profile preview`, which avoids the local Windows Hermes block) runs on a physical iPhone.
- The AI screen works only with the user's own paired workstation. Public cloud inference is an open product decision.
- 2026-11-15: Captions (Speech framework), StoreKit 2 subscriptions and the paywall are source-implemented only. None of it has been compiled, typechecked against real Expo types, or run on a device. `package-lock.json` still lacks `expo-image-picker` and `expo-media-library`; run `npm install` before any build.
- App Store Connect state (app 6835087523): metadata, category, age rating 4+, privacy answers, free price, all-country availability, subscription group "Vidora Pro" with weekly ($6.99) and yearly ($59.99) products are set. Still missing: build, screenshots, App Review contact details, Turkish localization, subscription review screenshots.

## 2026-11-15 code audit (source read only; not yet seen on a device)

Paths are relative to `apps/mobile/`. The TS-to-Swift export and transcribe contracts match field by field (names, types, seconds). Limits and semantics do not:

Fix before wider TestFlight:
- Captions are silently dropped. Swift caps captions at 400 cues and 24 words per cue (`KareviaEditorModule.swift` `CaptionRenderer.maxCues/maxWordsPerCue`), while JS allows 40 words (`src/captions.ts` `MAX_CUE_WORDS`). Pop makes one cue per word, so captions disappear after about 400 words (2.5-3 minutes of speech). Classic and Highlight also drop anything past two lines.
- Turkish uppercase is wrong in Highlight and Pop: `text.uppercased()` uses no locale, so i becomes I instead of İ. The export spec needs a locale field and `uppercased(with:)`.
- The `app/engine.tsx` route (AI/workstation) is reachable through the `vidora://engine` deep link even though `FEATURES.aiStudio` is false. This is an App Review 2.3.1 risk.
- Settings and the erase alert still describe AI Studio and workstation pairing (`app/settings.tsx`).
- The roadmap's free daily export limit is not implemented anywhere.
- Swift error messages and some media errors are English-only in the Turkish UI (`src/media.ts` `describeError`, sharing errors).
- Imports and exports are stored in `Documents/KareviaMedia`, which is backed up to iCloud. They belong in Application Support or Caches, or need to be excluded from backup.
- Transcription cannot be cancelled and has no timeout. If iOS never returns a final result, the editor stays busy indefinitely.
- Exports and transcription die when the app goes to the background or the screen locks. There is no background task or keep-awake.
- The default caption style is Highlight, which is Pro-only, so every free export hits the paywall. Choosing the free path regroups the captions into Classic, and the result differs from the preview.
- `pressExport` reads Pro status before StoreKit finishes loading, so a subscriber can get the paywall or a watermark right after launch.
- Export does not resume after a successful purchase.

Smaller gaps:
- The 300 MB import cap blocks about a minute of 4K footage.
- The default ratio is 16:9. Creators expect 9:16, and Pro users do not default to 1080p.
- Export is fixed at 30 fps.
- Edits to the same library clip added twice are shared.
- Permission denials have no "Open Settings" button.
- Autosave waits 600 ms and does not save when the app goes to the background.
- Not implemented: keyword highlight, emoji, font choice, words-per-line setting, silence cut, auto 9:16 reframe, WhisperKit, iPad, crash reporting, onboarding beyond one panel, visual timeline.

### Status after the 2026-11-15 fixes (source and checks only; not yet run on a device)
- First signed build compiled: EAS build 6 (version 0.1.0) was built with the App Store profile and uploaded to App Store Connect / TestFlight. It predates the fixes below.
- Fixed in code: captions dropped past 400 cues / 24 words (caps now 3000 / 40, third line allowed); Turkish upper case in Highlight and Pop (done in JS for preview and export); `/engine` deep link redirects home and Settings no longer mentions the workstation while `FEATURES.aiStudio` is off; default caption style is the free Classic; the export button waits for StoreKit's entitlement; transcription can be stopped and times out after max(60 s, 3x chunk length).
- The Swift parts of these fixes (caption caps, cancellable transcription) have not been compiled yet; they ship in the next EAS build.
- Still open from the audit: daily free export limit, English native error messages, media in iCloud-backed Documents, background/lock interrupting export and transcription, export not resuming after purchase, and the smaller items above.

### Status after the second round of fixes (2026-11-15)
- Build 7 (with the first round, including cancellable transcription and the new caption caps) compiled on EAS and was uploaded to TestFlight.
- Fixed in code since build 7 (not compiled yet; the Swift parts need the next EAS build): imported media excluded from iCloud backup (`excludeFromBackup`); 3 free exports per local day, stored in the Keychain, with the paywall shown when they run out; export starts by itself after a purchase; Turkish text for every native error and for import/sharing failures; screen kept awake plus a background task during export and transcription; Open Settings button after a denied Photos/speech permission; autosave on going to the background; new projects default to 9:16 fill; import cap 1.5 GB; export keeps the source frame rate up to 60 fps.
- Still open: same library clip twice shares caption edits; Pro users still default to 720p; the product features (more caption styles, keyword highlight, emoji, fonts, words per line, silence cut, auto reframe, WhisperKit, UI redesign, iPad, crash reporting, onboarding); Turkish store text, screenshots, subscription review images; device testing of everything.

## 2026-11-15: Product video pipeline (stage 1, source only)
- New `KareviaProduct` native module (`modules/karevia-editor/ios/KareviaProductModule.swift`): Vision cutout (iOS 17+) and an AVAssetWriter + CoreGraphics template renderer. The module has not been compiled yet; it needs an EAS build and a physical iPhone.
- New `app/create.tsx` screen, `src/product.ts` bridge and `src/product-templates.ts`, which has three templates (Showcase, Light tour, Campaign) and five palettes. After `npm install`, typecheck, lint and all 42 tests pass, and the new files are Prettier-formatted.
- Added later the same day: a fourth template (Turntable) with a perspective turn via CIPerspectiveTransform, a live preview strip with three real half-resolution frames from the new `frame()` function, and user-picked music. Typecheck, lint and all 43 tests pass. The Swift code is still uncompiled.
- Not done yet: depth parallax (Depth Anything V2 Small), a bundled licensed music library, and on-device timing measurements.

## 2026-11-15: Stage 2, seller fit (source only)
- Categories (6) with default palette, template and an offline Turkish/English copy bank (`src/product-catalog.ts`). Video type choice follows Trendyol's seller video types; only types with templates are shown (Usage and Assembly need real footage or cloud AI, so they are hidden).
- New templates: Unboxing (packaging) and Store (store name in Turkish upper case).
- Export presets: Trendyol (compact bitrate: 2.5 Mbps at 720p, 4.5 Mbps at 1080p) and Reels/TikTok (5 / 10 Mbps).
- `suggestCopy` uses Apple Foundation Models (iOS 26, `#if canImport(FoundationModels)`, weak-linked in the podspec). The output is parsed in TS (`parseCopySuggestions`, tested). It falls back to the offline bank when Apple Intelligence or the language is unavailable. The Turkish output quality has not been checked on a device, and `supportedLanguages` matching is unverified.
- Typecheck, lint and all 49 tests pass. None of the Swift has been compiled.
- Depth relief light (added the same day): Apple's `DepthAnythingV2SmallF16P8.mlpackage` (Apache-2.0, 25 MB, SHA-256 `660a57cf…edae04` matches Hugging Face) is in `modules/karevia-editor/ios/models/`. It is shipped via `s.resources` and compiled on the device on first use if Xcode did not compile it. The result is cached in Application Support and excluded from backup. A 160 px depth grid gives surface slopes, and a light circling the product (following its turn) draws highlights and soft shading inside the outline. Templates set `relief` strength (Campaign is off). If the model fails, videos render without relief.
- Unverified until a device build: that CocoaPods copies the `.mlpackage` directory intact, the first-use compile time, the depth quality on cut-outs, and per-frame cost at 1080p.

## 2026-11-15: Stage 3, UI and store (source only)
- New design system (`apps/mobile/DESIGN.md`, tokens in `src/ui.tsx`):
  - A warm dark studio palette with a single vermilion accent, used only for the primary action.
  - Selected chips invert to light-on-dark.
  - Horizontally scrolling chip rows, SF Symbols (`expo-symbols`) and haptics (`expo-haptics`).
- Navigation: a tab bar with Studio, Library and Settings (`app/(tabs)/`). Create, Editor and Engine are stack screens with a back chevron. Home now shows a product-video hero, recent videos and an editor link; the dunes image and the duplicated bottom buttons are gone.
- The paywall copy matches the new value: free product videos are unlimited; Pro removes the watermark and adds 1080p and the editor extras. Ticks are replaced by icons.
- Proposed TR/EN App Store copy, TL prices (₺79.99 weekly, ₺799.99 yearly) and review notes are in `docs/store/app-store-metadata.md`. Nothing has been uploaded. Keep "Trendyol" out of keywords (2.3.7).
- Typecheck, lint and all 50 tests pass. Not seen on a device: the tab bar, SF Symbol names and layout at small widths.

## 2026-11-15: gap pass
- Reconciled with the source: the daily free export limit (`src/export-quota.ts`), Turkish native errors (`src/native-errors.ts`), media excluded from backup (`excludeFromBackup`), the background/keep-awake guard (`WorkGuard`) and export after purchase (`offerAfterPurchase`) are all implemented. The "still open" audit lines above are out of date on these points.
- Photo library purpose strings (app.json, locales) now mention product photos and on-device processing. The privacy policy has product video and copy suggestion sections. Its date is set; the support email is contact@example.com.
- Library is a grid of videos with iOS action sheets, plus project and imported-clip lists. Settings is grouped rows. Pro defaults to 1080p on the product video screen.
- The changes above came after EAS build 1a0238ef started, so they ship in the next build.
- Still open: real screenshots, a support email and the privacy page date, App Store Connect prices, iPad, crash reporting, cloud Pro (stage 4).
- EAS build 1a0238ef (build 10) failed in the JS bundle phase. Without git, EAS uploads only `apps/mobile`, so the `../../../packages/shared/studio` imports could not resolve. The mobile app now ships `src/studio.ts`, a copy of the shared file, and `src/studio-copy.test.mjs` fails if the two drift apart. The local `expo export --platform ios --no-bytecode` succeeds. Retry: build 94cb92ba (build 11) finished successfully, so all the new Swift (product module, depth, Foundation Models) compiles on EAS. It has not been run on a device yet and has not been submitted to TestFlight.

## 2026-11-15: narrower free plan and higher prices (source only)
- Free plan: Showcase, Campaign and Store templates (`FREE_PRODUCT_TEMPLATES` in `src/pro-rules.ts`), 720p with the watermark, no relief light, no AI copy. Pro templates show a PRO badge and preview their full look; rendering one, or tapping "Suggest with AI", opens the paywall without a free fallback.
- After a purchase, the paywall callback uses refs (`renderLatest`, `writeLatest`) so the render runs with the fresh Pro spec rather than a stale watermarked one.
- The paywall and the proposed store copy match the new split. Pricing v3 in `docs/store/app-store-metadata.md`: ₺299.99 weekly, ₺799.99 monthly, ₺4,999.99 yearly, and a future ₺2,499.99 Studio AI tier, with net-after-tax estimates. It is not entered in App Store Connect, and the tax figures need an accountant's confirmation.
- These changes are not in build 11; they need a new build.

## 2026-11-15: build 12 (Stitch redesign + review fixes)
- Design: home, library, paywall and create screens follow the Google Stitch project "Vidora E-Commerce Studio App" (Atelier Dark), keeping our truthful copy rather than Stitch's invented claims.
- IPA of build 11 checked: FoundationModels is weak-linked (`LC_LOAD_WEAK_DYLIB`) and `DepthAnythingV2SmallF16P8.mlpackage` is in the bundle.
- Review fixes: the writer `endSession` gives exact durations; the music insert is clamped; Showcase and Campaign now run 9 s (Trendyol 8 s minimum); renders keep the screen awake and request background time; an AI copy failure falls back to the offline bank; the paywall says AI needs Apple Intelligence devices; the speech permission string mentions Apple processing; the minimum iOS is 17.0 (`expo-build-properties`); a monthly product id is added.
- Fixed in build 13: music is written by the same AVAssetWriter (no re-encode) and Settings > Licences exists.
- Build 12 finished and was submitted to App Store Connect (submission 094fa2cf). It has not been tested on a device. App Review submission waits on the owner actions in `RELEASE_CHECKLIST.md`.
