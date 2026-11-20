# Release checklist – Vidora 1.0 (product-video version)

App Store Connect app 6835087523 · bundle `com.berkdemirok.vidora` · version 1.0 · updated 2026-11-15

Work top to bottom; later steps depend on earlier ones. `[x]` = done, `[ ]` = open. **Owner** = needs the owner (account access, device, money or an outward action). Store text, notes and answers are ready in `docs/store/`.

## A. Build

- [x] EAS production build 11 compiled and submitted to TestFlight.
- [x] Build 12 (Stitch redesign, review fixes, iOS 17 minimum, monthly product id) compiled and submitted to TestFlight.
- [x] Build 13 compiled (single-writer music, depth retry, licences screen, clean errors). Build 14 adds trial-eligibility check, price line under the trial button, neutral preset labels and background-expiry cancel.
- [ ] Submit the newest build that passed device testing (build 14 or later). Screenshots and review notes must match it. **Owner**
- [x] Monthly plan: `com.berkdemirok.vidora.pro.monthly` is in `PRO_PRODUCT_IDS` (`apps/mobile/src/pro.ts`) from build 12. Create it in ASC **and attach it to this version**, or the reviewer sees a product that was not submitted.
- [ ] `FEATURES.aiStudio` is `false` in `apps/mobile/src/config.ts` in the submitted build.

## B. Device test (TestFlight, real iPhone) — **Owner**

- [ ] Product video: pick photo → cut-out → each free template (Vitrin, Kampanya, Mağaza) renders at 720p with the small Vidora mark; save to Photos; share.
- [ ] As free user: Pro template, 1080p and "Yapay zekâyla öner" open the paywall; the paywall's free option exports 720p.
- [ ] Sandbox purchase of weekly and yearly (and monthly if shipped): Pro unlocks all 6 templates, relief light, 1080p without watermark, AI suggestions; the export resumes after purchase.
- [ ] Restore purchases and Manage subscription work from Settings and the paywall.
- [ ] AI suggestions on an Apple Intelligence device; built-in suggestions on a device without it.
- [ ] Editing desk: import, trim, join, music, Turkish captions, 9 styles (Pro), free limit of 3 exports/day.
- [ ] Turkish and English UI; permission prompts read correctly; deny Photos → Open Settings button.
- [ ] `vidora://engine` opens the home screen (AI Studio unreachable).
- [ ] No crash in a 15-minute session; renders survive locking the screen.

## C. Accounts, agreements and money — **Owner**

- [ ] Paid Applications Agreement accepted (App Store Connect → Business), with **tax forms** (W-8BEN for US, Turkish tax info) and **bank account** (TRY account) completed. Subscriptions cannot be sold without it.
- [ ] Apply to the **App Store Small Business Program** (15% commission instead of 30%).
- [ ] Ask an accountant (mali müşavir) about the GVK 20/B exemption and DST handling (see pricing notes in `docs/store/app-store-metadata.md`).

## D. Subscriptions in App Store Connect — **Owner**

Values: `docs/store/app-store-metadata.md` → Subscriptions.
- [ ] Group "Vidora Pro": TR and EN group display names.
- [ ] Create `com.berkdemirok.vidora.pro.monthly` (1 month) in the group. Attach it to this version only if it is in the build (A).
- [ ] TR and EN display names and descriptions for weekly, monthly and yearly.
- [ ] Prices: Turkey base ₺299.99 / ₺799.99 / ₺4,999.99; US $9.99 / $24.99 / $129.99 (replaces $6.99 / $59.99).
- [ ] Introductory offer on yearly: free trial, 3 days, new subscribers, all countries.
- [ ] Review screenshot (paywall) and review note for each product.

## E. Web pages — **Owner**

- [x] Support email chosen (contact@example.com) and filled into `docs/store/privacy-policy.md` and `docs/store/support.md`; still to add to the ASC App Review contact.
- [ ] Remove the "PUBLISHING NOTES" comment blocks, then publish to https://berkdemirokk.github.io/vidora/privacy and https://berkdemirokk.github.io/vidora/support.
- [ ] Open both URLs on the phone and from inside the app (Settings and paywall links).

## F. Screenshots — **Owner**

Plan: `docs/store/screenshots.md`.
- [ ] Capture TR and EN sets on the device from the submission build.
- [ ] Compose 6 (or 7) images at 1320×2868 (6.9") and 1284×2778 (6.5"); no "Trendyol" text visible.
- [ ] Upload to Türkçe and English (U.S.) localizations.

## G. Version metadata in App Store Connect — **Owner**

Values: `docs/store/app-store-metadata.md` → Final copy.
- [ ] Add Turkish (tr) localization; set it as the primary language if the main market is Turkey.
- [ ] EU Digital Services Act: declare trader status in ASC (Business > Agreements / App Information), required while availability includes EU countries.
- [ ] TR and EN: name, subtitle, promotional text, keywords, description (replace the captions-only copy). Adjust the "weekly, monthly and yearly" sentence if monthly is not shipped.
- [ ] Support URL, Privacy Policy URL, copyright `2026 Berk Demirok`.
- [ ] Category Photo & Video (secondary Business); age rating questionnaire → 4+.
- [ ] App Privacy: "Data Not Collected" (already set; re-confirm).
- [ ] Export compliance: no non-exempt encryption (set by `usesNonExemptEncryption: false`).
- [ ] App Review information: sign-in not required; contact name, phone, contact@example.com; paste the review notes.
- [ ] Select the build; add the subscriptions to the version ("In-App Purchases and Subscriptions" section).
- [ ] Pricing: app price Free; availability all countries (already set).

## H. Submit — **Owner**

- [ ] Final read-through of every field in both languages against the build.
- [ ] Release option: manual release (recommended for the first version).
- [ ] Submit for Review.
- [ ] After approval: check the live listing, buy once with a real account (then refund/cancel) to confirm production StoreKit.

## Out of scope for this version

AI Studio / workstation pairing (off, disclosed in review notes), cloud tier "Vidora Studio AI" (stage 4), iPad. The in-app Licences screen (Settings > Licences) ships from build 13.
