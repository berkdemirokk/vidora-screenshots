# Vidora – App Store metadata

App Store Connect: app 6835087523, bundle `com.berkdemirok.vidora`, version 1.0. The live store text (bottom of this file) still describes the older captions-only version. The **final copy for the product-video version** below replaces it at submission. Keep this file in sync whenever store text changes.

Rule: describe only features that are in the build being submitted (build 11 or later). Everything below was checked against the source on 2026-11-15:
- `src/pro-rules.ts`: free templates = `showcase`, `campaign`, `store` (Vitrin, Kampanya, Mağaza); free quality 720p; free caption style Classic; 3 free editor exports a day.
- `app/create.tsx`: free renders use relief light off, 720p and the watermark; Pro templates, 1080p and "Yapay zekâyla öner" open the paywall for free users.
- `src/product-templates.ts`: 6 templates (Vitrin, Işık turu, Döner vitrin, Kampanya, Kutu açılışı, Mağaza).
- `src/captions.ts`: 9 caption styles.
- `src/config.ts`: `FEATURES.aiStudio = false`; `app/engine.tsx` redirects to `/`.

Trademark rule (Guideline 2.3.7): no "Trendyol", "TikTok", "Instagram" or "Reels" in name, subtitle or keywords. The description may say what the video is for ("pazaryeri", "Instagram Reels ve TikTok") but never implies an affiliation. The in-app export preset is labelled "Trendyol"; keep that label out of screenshots (see `docs/store/screenshots.md`).

---

## Final copy for the product-video version

### Türkçe (tr) — primary language

| Field | Value | Length |
|---|---|---|
| Ad (≤30) | `Vidora: Ürün Videosu Yap` | 24 chars |
| Alt başlık (≤30) | `Fotoğraftan reklam videosu` | 26 chars |
| Tanıtım metni (≤170) | `Tek ürün fotoğrafından saniyeler içinde stüdyo görünümlü dikey reklam videosu. Telefonunda hazırlanır, sunucularımıza yüklenmez.` | 128 chars |
| Anahtar kelimeler (≤100 bayt) | `tanıtım,e-ticaret,satıcı,arka plan silme,katalog,mağaza,vitrin,kampanya,kozmetik,takı,altyazı` | 100 bytes (93 chars; at the limit, do not add anything) |

Keywords do not repeat words already in the name or subtitle (Apple indexes those anyway): "ürün", "video", "reklam", "fotoğraf" are left out on purpose.

**Açıklama:**

```
Ürün fotoğrafını çek, Vidora onu stüdyo görünümlü bir reklam videosuna çevirsin. Pazaryeri ürün sayfaların, Instagram Reels ve TikTok için 9:16 dikey video, birkaç dokunuşta.

FOTOĞRAFTAN VİDEOYA
• Ürün arka plandan otomatik olarak ayrılır
• Stüdyo ışığı, gölge ve yansımalı zemin
• Ürünün değişmez: videoda senin çektiğin ürün görünür
• Videoyu oluşturmadan önce gerçek karelerle önizle
• İstersen kendi müziğini ekle

SATICILAR İÇİN HAZIR
• 6 kategori: kozmetik, takı, giyim, ev, gıda, elektronik
• Ürün tanıtımı, reklam, paketleme ve mağaza videoları için 6 şablon
• Hazır Türkçe başlık, rozet ve çağrı önerileri ("Kargo bedava", "Hemen sipariş ver")
• Destekleyen cihazlarda Apple Intelligence ile telefonda metin önerisi
• Pazaryeri için küçük dosya, sosyal medya için en yüksek kalite

KURGU MASASI
• Kendi videolarını kırp, birleştir, başlık ve müzik ekle
• Türkçe ve İngilizce otomatik altyazı, dokunarak düzelt

GİZLİLİK
• Fotoğrafların ve videoların telefonunda işlenir, sunucularımıza yüklenmez
• Hesap yok, reklam yok, takip yok

ÜCRETSİZ VE PRO
• Ücretsiz: 3 şablonla (Vitrin, Kampanya, Mağaza) sınırsız ürün videosu, 720p, küçük Vidora yazısı
• Vidora Pro: 6 şablonun tamamı, kabartma ışığı, yapay zekâ metin önerileri, filigransız 1080p, kurgu masasında sınırsız dışa aktarma ve 9 altyazı stili

Vidora Pro haftalık, aylık ve yıllık otomatik yenilenen abonelik olarak sunulur. Ödeme, satın alma onaylandığında Apple Hesabından alınır. Abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse otomatik olarak yenilenir. Ücretsiz deneme sunulan planlarda, deneme bitmeden iptal edilmezse ücretlendirme başlar. Aboneliği App Store hesap ayarlarından yönetebilir veya iptal edebilirsin.

Kullanım Koşulları: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Gizlilik Politikası: https://berkdemirokk.github.io/vidora/privacy
```

### English (en-US)

| Field | Value | Length |
|---|---|---|
| Name (≤30) | `Vidora: Product Video Maker` | 27 chars |
| Subtitle (≤30) | `Product photo to ad video` | 25 chars |
| Promotional text (≤170) | `Turn one product photo into a studio-style vertical ad video in seconds. Made on your phone, never uploaded to our servers.` | 123 chars |
| Keywords (≤100 bytes) | `ecommerce,seller,background remover,promo,catalog,showcase,shop,listing,cosmetics,jewelry,captions` | 98 bytes |

**Description:**

```
Shoot your product and let Vidora turn it into a studio-style ad. You get a 9:16 vertical video for marketplace listings, Instagram Reels and TikTok in a few taps.

PHOTO TO VIDEO
• The product is cut out from its background automatically
• Studio light, shadow and a reflective floor
• Your product is never altered: the video shows exactly what you shot
• Preview real frames before you render
• Add your own music if you like

READY FOR SELLERS
• 6 categories: beauty, jewellery, clothing, home, food, electronics
• 6 templates for product promotion, ads, packaging and store videos
• Ready-made headline, badge and call-to-action ideas
• On-device copy suggestions with Apple Intelligence on supported devices
• A small file for marketplaces, top quality for social media

EDITING DESK
• Trim and join your own clips, add a title and music
• Automatic captions in Turkish and English, fix any word with a tap

PRIVACY
• Photos and videos are processed on your phone and never uploaded to our servers
• No account, no ads, no tracking

FREE AND PRO
• Free: unlimited product videos with 3 templates (Showcase, Campaign, Store), 720p, small Vidora mark
• Vidora Pro: all 6 templates, relief light, AI copy suggestions, watermark-free 1080p, unlimited editor exports and 9 caption styles

Vidora Pro is offered as weekly, monthly and yearly auto-renewing subscriptions. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. If a plan includes a free trial, you are charged when the trial ends unless you cancel before then. Manage or cancel it in your App Store account settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://berkdemirokk.github.io/vidora/privacy
```

### Other version fields (both languages)

| Field | Value |
|---|---|
| Support URL | https://berkdemirokk.github.io/vidora/support |
| Marketing URL | (leave empty) |
| Privacy Policy URL | https://berkdemirokk.github.io/vidora/privacy |
| Copyright | `2026 Berk Demirok` |
| Version | 1.0 |
| What's New | not shown for a first release |
| Primary category | Photo & Video |
| Secondary category | Business |

If the monthly product does not ship in the build (see Subscriptions), replace "haftalık, aylık ve yıllık" with "haftalık ve yıllık" and "weekly, monthly and yearly" with "weekly and yearly" before saving.

---

## Subscriptions (App Store Connect → Monetization → Subscriptions)

Subscription group: reference name `Vidora Pro`. Group display name: TR `Vidora Pro`, EN `Vidora Pro`. All three products are in this one group so users can upgrade/downgrade. Suggested level order (top = highest): Yearly, Monthly, Weekly.

| Product ID | Reference name | Duration | Status |
|---|---|---|---|
| `com.berkdemirok.vidora.pro.weekly` | Vidora Pro Weekly | 1 week | exists (price currently $6.99, must change) |
| `com.berkdemirok.vidora.pro.monthly` | Vidora Pro Monthly | 1 month | **create** |
| `com.berkdemirok.vidora.pro.yearly` | Vidora Pro Yearly | 1 year | exists (price currently $59.99, must change) |

**Code dependency:** from build 12, `apps/mobile/src/pro.ts` lists yearly, monthly and weekly (`PRO_PRODUCT_IDS`), so all three show on the paywall once they exist in ASC. Create the monthly product **and attach it to this version's submission** (an in-app purchase visible in the app but not submitted is a 2.1 rejection).

### Localized display names and descriptions

Limits: display name ≤35 characters, description ≤55 characters.

| Product | TR display name | TR description | EN display name | EN description |
|---|---|---|---|---|
| Weekly | `Vidora Pro Haftalık` (19) | `6 şablon, filigransız 1080p, yapay zekâ önerileri` (49) | `Vidora Pro Weekly` (17) | `All 6 templates, watermark-free 1080p, AI copy ideas` (52) |
| Monthly | `Vidora Pro Aylık` (16) | `6 şablon, filigransız 1080p, yapay zekâ önerileri` (49) | `Vidora Pro Monthly` (18) | `All 6 templates, watermark-free 1080p, AI copy ideas` (52) |
| Yearly | `Vidora Pro Yıllık` (17) | `3 gün ücretsiz, sonra tüm Pro özellikleri bir yıl` (49) | `Vidora Pro Yearly` (17) | `3 days free, then every Pro feature for a full year` (51) |

### Prices (pricing proposal v3)

Set Turkey as the base country with a manual price, then set the United States manually; let Apple equalize the other countries from the base. If an exact price point does not exist, take the nearest available one and update this table.

| Product | Turkey | United States | Introductory offer |
|---|---|---|---|
| Weekly | ₺299.99 | $9.99 | none |
| Monthly | ₺799.99 | $24.99 | none |
| Yearly | ₺4,999.99 | $129.99 | Free trial, 3 days, new subscribers, all countries |

Availability: all countries where the app is available. Family Sharing: off (can be turned on later, not off again).

### Review information for each subscription

- **Review screenshot (required, one per product):** a screenshot of the paywall (`app/paywall.tsx`) on a real device or simulator build, showing that product's row with its localized price, plus the Restore purchases, Terms of Use and Privacy Policy links. Any iPhone screenshot size is accepted (e.g. 1320×2868 or the device's native size); PNG or JPEG, RGB, no transparency. Take it as a non-subscriber with the sandbox account so the prices are visible. The same image may be used for weekly and yearly if both rows are visible; the yearly row must show the 3-day trial label once the offer is live.
- **Review notes (optional, same text for each):** `Unlocks all 6 product video templates, relief light, on-device AI copy suggestions, watermark-free 1080p, unlimited editing desk exports and 9 caption styles. Paywall: Create a product video > pick a Pro template (PRO badge) or tap "Suggest with AI".`

---

## Pricing proposal v3 (2026-11-15, owner: "like Vibedesign, higher, we also pay tax")

Reference: Vibedesign's web prices (vibedesignapp.com/checkout, VAT included, no auto-renew, read on 2026-11-15) are:

| Plan | Price | Credits | About |
|---|---|---|---|
| Access trial | 480 TL | 1,000 | 3 days, ≈6 images |
| Creator | 4,800 TL per month | 15,000 | ≈100 images |
| Professional | 12,800 TL per month | 45,000 | |
| Professional+ | 24,800 TL per month | 96,000 | |

Those prices pay for cloud AI on every image. Vidora Pro today is on-device, so a Vibedesign-level price is planned only for the stage 4 cloud tier.

| Product (ASC) | Proposed TR | Proposed US | Net to owner per sale* |
|---|---|---|---|
| Vidora Pro Weekly | ₺299.99 | $9.99 | ≈ ₺172 (SBP) / ₺141 (30%) |
| Vidora Pro Monthly (new) | ₺799.99 | $24.99 | ≈ ₺458 / ₺377 |
| Vidora Pro Yearly, 3-day trial | ₺4,999.99 (≈ ₺96/week) | $129.99 | ≈ ₺2,860 / ₺2,355 |
| Vidora Studio AI Monthly (stage 4: cloud scene, model, motion; with quota) | ₺2,499.99 | $69.99 | ≈ ₺1,430 / ₺1,178 |

\*Net per sale is calculated as follows:
1. Start from the price and remove VAT (÷1.20).
2. Subtract the 5% digital service tax.
3. Subtract Apple's commission: 15% in the Small Business Program, or 30% in the first year without it.
4. Subtract the 15% withholding of GVK 20/B, which applies to app developers paid through a Turkish bank within the yearly limit.

The result is roughly **57% (SBP) or 47%** of the shelf price.

Unverified: the exact DST handling inside Apple's TR proceeds, and the current 20/B limit and conditions. Confirm both with an accountant (mali müşavir) before relying on these numbers. Join the App Store Small Business Program, because it is the single biggest lever on net revenue.

**Risks of the higher price:** the conversion rate drops. Mitigations:
- The 3-day trial.
- The paywall appears after the first preview, so the value is already visible.
- The narrowed free plan (implemented): 3 templates, no relief light, no AI copy, 720p with the watermark.
- A/B test weekly ₺299.99 against ₺199.99 once there is traffic.

---

## App Review information

**Sign-in required:** No (leave the demo account fields empty).
**Contact:** owner's first name, last name, phone (+90…) and `contact@example.com` — owner fills in ASC.

**Notes (EN), paste as is:**

```
Vidora turns one product photo into a 9:16 product ad video. Everything runs on the device. No account or login is required, and the app has no server of its own: it makes no network requests except StoreKit (Apple) and, for captions, Apple's Speech framework.

HOW TO TEST
1. Home > "Create a product video". Pick any product photo (a bottle or shoe on a plain table works best).
2. The product is cut out automatically (Apple Vision). Choose a category, a video type and a template; the free templates are Showcase (Vitrin), Campaign (Kampanya) and Store (Mağaza).
3. Optionally type a headline and price, pick a palette and music from Files, look at the preview frames, then tap "Create video". Save it to Photos or share it.
4. Editing desk: Home > "Editing desk", add a video with speech, tap "Generate captions", pick a style, export.

ON-DEVICE PROCESSING
- Cut-out: Apple Vision (foreground instance mask).
- Depth / relief light: a bundled Core ML model, Depth Anything V2 Small (Apache-2.0 licence), shipped inside the app. It is not downloaded.
- Rendering: AVFoundation, Core Graphics and Core Image (GPU) on the device.
- Copy suggestions ("Suggest with AI", Pro): Apple's on-device Foundation Models framework, only on devices with Apple Intelligence enabled. On other devices the app shows a built-in list of Turkish/English suggestions instead. The model only writes short headline, badge and call-to-action text for the product name the user typed.
- Captions: Apple Speech framework, on device where the language supports it; otherwise Apple's speech service processes the audio. The developer receives nothing.

SUBSCRIPTIONS (group "Vidora Pro")
Free: unlimited product videos with 3 templates, 720p with a small Vidora mark; editing desk with the Classic caption style, 720p, watermark, 3 exports per day.
Vidora Pro (weekly, monthly, yearly with a 3-day free trial): all 6 templates, relief light, AI copy suggestions, watermark-free 1080p, unlimited editing desk exports and all 9 caption styles.
To reach the paywall: on the Create screen tap a template with a PRO badge, tap "Suggest with AI", or choose 1080p and tap "Create video" (the paywall then also offers a free 720p export). The paywall shows the price, renewal terms, Restore purchases, Terms of Use (Apple standard EULA) and Privacy Policy. Purchases work with your sandbox Apple Account; no extra setup is needed. Pro is also listed in Settings, with Restore purchases and Manage subscription.

DISABLED CODE
The binary contains code for an experimental "AI Studio" that would connect to a user's own workstation. It is switched off for this release by a compile-time flag (FEATURES.aiStudio = false): no screen, button or setting links to it, and its route (vidora://engine) redirects to the home screen. No feature in this version depends on it.

PERMISSIONS
Photos: read to choose product photos and videos, add to save exports. Speech recognition: only when the user taps "Generate captions". Camera, microphone, location and tracking are not used.
```

If the monthly product is not in the build, change "(weekly, monthly, yearly with a 3-day free trial)" to "(weekly, or yearly with a 3-day free trial)". Check that the button labels in step 1–4 still match the build being submitted (other sessions are redesigning the Create, Library and Paywall screens).

---

## App Privacy (App Store Connect → App Privacy)

**Answer: "No, we do not collect data from this app"** → shows as **Data Not Collected**.

Verified against the source on 2026-11-15:
- Dependencies (`apps/mobile/package.json`): Expo and React Native modules only. No analytics, crash reporting, advertising, attribution or tracking SDK.
- Network: the only `fetch` calls are in `src/pairing.ts` and `src/studio.ts`, used only by the disabled AI Studio (`app/engine.tsx`, redirected home). With `FEATURES.aiStudio = false` the app sends nothing to any developer server.
- Purchases: StoreKit 2 in `KareviaStoreModule.swift`, handled by Apple. No receipt is sent to a developer server.
- Copy suggestions: Foundation Models runs on the device.
- Captions: `SFSpeechRecognizer` uses on-device recognition when `supportsOnDeviceRecognition` is true; otherwise Apple processes the audio. Apple, not the developer, receives it, so it is not "collected" by the app in Apple's definition. The privacy policy and Settings text say so.
- Local storage only: media in the app container (excluded from iCloud backup), the free-export counter in the Keychain.
- Privacy manifest (`apps/mobile/app.json`): `NSPrivacyTracking` false, no tracking domains, no collected data types; required-reason APIs declared (file timestamp, UserDefaults, disk space, boot time).

Re-check this answer if any SDK, server or the AI Studio is turned on later.

## Age rating

Answer "None/No" to every content question (no violence, mature themes, gambling, unrestricted web access, user-generated content shared with others, messaging or chat). Copy suggestions are short product text from Apple's on-device model, not an open chat. Expected rating: **4+**.

## Export compliance

`ITSAppUsesNonExemptEncryption = false` (`usesNonExemptEncryption: false` in `app.json`). Only Apple's system encryption (HTTPS through iOS) is used.

## Licences

Depth Anything V2 Small: Apache-2.0. From build 13 the app has Settings > Licences (`apps/mobile/app/licenses.tsx`, data in `src/licenses.ts`) with the attribution and a link to the licence text; the support page carries it too. npm licences are listed in `docs/release/npm-licenses.json`.

---

## Live copy (captions version, currently in ASC — to be replaced)


### Türkçe (tr)

- **Ad:** Vidora: Otomatik Altyazı
- **Alt başlık:** Türkçe altyazı, tek dokunuş
- **Tanıtım metni:** Tek dokunuşla hareketli Türkçe altyazı. 9 stil, emoji ve anahtar kelime vurgusu, hepsi iPhone'unda.
- **Anahtar kelimeler:** `altyazı,otomatik altyazı,video,kurgu,düzenleme,kısa video,yazı ekle,karaoke,emoji,türkçe,kırp`
- **Abonelikler:** Vidora Pro Haftalık / Vidora Pro Yıllık — "Filigransız, 9 altyazı stili, 1080p, sınırsız"
- **Açıklama:**

  İzlenen altyazılar, tek dokunuşla. Vidora videodaki konuşmayı iPhone'unda kelime kelime hareketli altyazıya çevirir. Türkçe için tasarlandı.
  
  OTOMATİK ALTYAZI
  • Tek dokunuşla konuşmayı altyazıya çevir
  • Türkçe ve İngilizce
  • Yanlış kelimeyi satıra dokunarak düzelt
  • Uzun videoda istediğin an durdur
  
  9 ALTYAZI STİLİ
  • Klasik, Vurgulu, Pop, Kutu, Karaoke, Daktilo, Kontur, Neon ve Dev
  • 5 yazı tipi, satır başına kelime sayısı, konum ve vurgu rengi
  • Anahtar kelimeyi otomatik vurgula
  • Konuya uygun emoji ekle
  
  KURGU VE DIŞA AKTARMA
  • Fotoğraflar'dan veya Dosyalar'dan içe aktar
  • Sürükleyerek kırp, birden fazla klibi birleştir
  • 9:16, 1:1 ve 16:9; sığdır veya doldur
  • Başlık ve kendi müziğini ekle
  • 60 fps'e kadar MP4 dışa aktar, Fotoğraflar'a kaydet veya paylaş
  
  GİZLİLİK
  • Hesap yok, reklam yok, takip yok
  • Videoların iPhone'unda kalır; geliştirici veri toplamaz
  
  ÜCRETSİZ VE PRO
  • Ücretsiz: Klasik stil, 720p, filigranlı, günde 3 dışa aktarma
  • Vidora Pro: filigransız, 9 stilin tamamı, 1080p, sınırsız dışa aktarma
  
  Vidora Pro otomatik yenilenen bir aboneliktir. Ödeme, satın alma onaylandığında Apple Hesabından alınır. Abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse otomatik olarak yenilenir. Aboneliği App Store hesap ayarlarından yönetebilir veya iptal edebilirsin.
  
  Kullanım Koşulları: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
  Gizlilik Politikası: https://berkdemirokk.github.io/vidora/privacy/

### English (en-US)

- **Name:** Vidora: Video Editor
- **Subtitle:** Auto Captions for Reels
- **Promotional text:** One tap, animated captions. 9 styles, emoji and key word highlight, right on your iPhone.
- **Keywords:** `captions,subtitles,auto captions,subtitle maker,video editor,karaoke,emoji,trim,altyazi,shorts`
- **Subscriptions:** Vidora Pro Weekly / Vidora Pro Yearly — "No watermark, 9 caption styles, 1080p, unlimited"
- **Description:**

  Captions that get watched, in one tap. Vidora turns the speech in your video into animated, word-by-word captions right on your iPhone.
  
  AUTO CAPTIONS
  • One tap turns speech into captions
  • Works in Turkish and English
  • Fix any word by tapping the line
  • Stop at any time on long videos
  
  9 CAPTION STYLES
  • Classic, Highlight, Pop, Box, Karaoke, Typewriter, Outline, Neon and Impact
  • 5 fonts, words per line, position and accent color
  • Automatic key word highlight
  • Add a matching emoji
  
  EDIT AND EXPORT
  • Import from Photos or Files
  • Trim with a drag timeline, combine multiple clips
  • 9:16, 1:1 and 16:9 with fit or fill
  • Add a title and your own music
  • Export MP4 up to 60 fps, save to Photos or share
  
  PRIVATE BY DESIGN
  • No account, no ads, no tracking
  • Your videos stay on your iPhone; the developer collects no data
  
  FREE AND PRO
  • Free: Classic style, 720p, watermark, 3 exports a day
  • Vidora Pro: no watermark, all 9 styles, 1080p, unlimited exports
  
  Vidora Pro is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings.
  
  Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
  Privacy Policy: https://berkdemirokk.github.io/vidora/privacy/

