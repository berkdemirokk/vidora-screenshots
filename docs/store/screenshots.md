# Vidora – App Store screenshot plan (version 1.0, product-video build)

Screenshots must show the real app, captured from a build of the submitted version (TestFlight build 14 or later) on a real iPhone. The Create, Library and Paywall screens were being redesigned on 2026-11-15; capture only from the final submission build and keep the shot list, adapting the framing to the new layout. There is no Mac, so no simulator: capture on the owner's iPhone (side button + volume up) and compose the store images on the PC.

## Required sizes

| Slot in ASC | Pixel size (portrait) | Needed | Notes |
|---|---|---|---|
| iPhone 6.9" | **1320 × 2868** | Yes (primary) | iPhone 16/17 Pro Max class. ASC scales it down for smaller iPhones. |
| iPhone 6.5" | **1284 × 2778** | Yes (upload to be safe) | Export the same composition at this size. |
| iPad | — | No | `supportsTablet: false`. |

Format: PNG or JPEG, RGB, no transparency, no alpha. 3 to 10 per localization; this plan uses 6. Upload a TR set (Turkish UI) under Türkçe and an EN set (English UI, switch in Settings) under English (U.S.).

## Composition

Each image = a background colour + a caption at the top + the real screen capture below it, scaled to fit (no frame needed). Keep the capture unedited except for scaling: do not paint over UI, do not fake results.
- Canvas 1320×2868 (6.9") / 1284×2778 (6.5"). Background `#131713` (app splash colour) or a palette colour from the video in that shot.
- Caption: top 22% of the canvas, white, bold, 2 lines max, centred, about 90–110 px type on the 6.9" canvas. A smaller second line (subcaption) is optional.
- Screen capture: scaled to about 82% of canvas width, centred, rounded corners 60 px, soft shadow.
- If the owner's iPhone is not 19.5:9 (all Face ID iPhones are), letterboxing is fine; never stretch.
- Status bar: full battery, Wi-Fi, no notifications, a clean time (9:41 is conventional). Turn on Do Not Disturb before capturing.

## Rules to avoid rejection

- **No third-party brand names in a screenshot** (Guideline 2.3.7: screenshots are metadata). From build 14 the export presets read "Pazaryeri" and "Sosyal medya", so the Create screen is safe; still keep TikTok/Instagram/Trendyol logos and names out of the product photo and texts.
- No sandbox or TestFlight banners, purchase sheets, debug text, error toasts, or placeholder text.
- Pro-only features may be shown, but their caption says "Pro" (shots 4 and 5). Capture those while subscribed with the sandbox account; capture shots 1–3 as a free user where noted, so the free result is shown honestly.
- Use a real product photo the owner has rights to (own product, own photo). No brand logos of other companies, no copyrighted music titles visible.
- Prices in the video: use plausible TL prices; the EN set may keep TL (Turkish sellers) or use $ — be consistent within a set.

## Sample content

Use the same product throughout so the set tells one story: a perfume bottle (category "Kozmetik ve parfüm"), photographed on a plain light table.
- Headline TR: `Yaz Esintisi EDP` / EN: `Summer Breeze EDP`
- Price: `₺899`; badge: `%30 İNDİRİM` / `30% OFF`; CTA: `Hemen sipariş ver` / `Order now`
- Store name (Mağaza template): `Lavin Butik`

## The set (order = upload order)

| # | Screen and exact state | TR caption (line 1 / line 2) | EN caption (line 1 / line 2) |
|---|---|---|---|
| 1 | **Finished video, Vitrin (Showcase) template.** After "Videoyu oluştur", the result player paused on the frame where the product, headline and price are all on screen. Palette Noir. Free user is fine (small Vidora mark visible). | **Tek fotoğraftan reklam videosu** / Saniyeler içinde, telefonunda | **One photo, one ad video** / In seconds, on your phone |
| 2 | **Create screen right after picking the photo:** the cut-out product shown on its own (background removed) at the top, category "Kozmetik ve parfüm" selected below. | **Arka plan otomatik silinir** / Ürünün olduğu gibi kalır | **Background removed automatically** / Your product stays exactly as shot |
| 3 | **Template and type choice:** video type row + the template list with "Kampanya" selected, and the live preview strip of three frames visible. Free user, so PRO badges show on the Pro templates (honest). | **Satıcılar için hazır şablonlar** / Vitrin, Kampanya, Mağaza ve fazlası | **Templates made for sellers** / Showcase, Campaign, Store and more |
| 4 | **Finished video, Kampanya (Campaign) template** paused on the frame with the `%30 İNDİRİM` badge, big price and CTA. Pro user, 1080p, no watermark. | **İndirim, fiyat ve çağrı tek dokunuşta** / Pro ile filigransız 1080p | **Discount, price and call to action** / Watermark-free 1080p with Pro |
| 5 | **AI copy suggestions:** Create screen text fields after tapping "Yapay zekâyla öner", with the suggestion chips filled in. Only if the owner's iPhone supports Apple Intelligence (iPhone 15 Pro or newer, iOS 26, Apple Intelligence on, device language supported); otherwise replace with a **Döner vitrin (Turntable)** result frame on the reflective floor, caption `Yansımalı zemin ve kabartma ışığı` / `Reflective floor and relief light` (Pro). | **Yapay zekâ metin önerir** / Apple Intelligence ile, telefonunda (Pro) | **AI writes your copy** / With Apple Intelligence, on device (Pro) |
| 6 | **Editing desk with captions:** a clip of someone talking about the product, captions generated, preview paused on a caption in a colourful style (e.g. Pop or Highlight), style picker visible. Pro user. | **Kurgu masası ve otomatik altyazı** / 9 altyazı stili, Türkçe ve İngilizce | **Editing desk with auto captions** / 9 caption styles, Turkish and English |

Optional 7th (privacy message, recommended for the Turkish market): **Settings screen** scrolled to the privacy paragraph ("Ürün fotoğrafların, videoların ve çıktıların yalnızca bu cihazda işlenir…"). Caption TR `Hesap yok, yükleme yok` / `Fotoğrafların telefonunda kalır`; EN `No account, no uploads` / `Your photos stay on your phone`.

## Capture checklist

1. Install TestFlight build 11+ on the iPhone. Sign in to the sandbox Apple Account (Settings > App Store > Sandbox Account).
2. TR set, free user: app language Türkçe, capture shots 1, 2, 3 (and 7).
3. Buy Pro with the sandbox account; capture shots 4, 5, 6.
4. Switch the app language to English in Settings; repeat (sandbox Pro can be reset in Settings > App Store > Sandbox Account > Manage to recapture free shots 1–3).
5. Transfer the raw PNGs to the PC as `docs/store/screenshots/raw/tr/1.png … 7.png` and `raw/en/1.png … 7.png` (numbers = rows of the set above), then run `python tools/compose_screenshots.py` from the repo root. It writes `docs/store/screenshots/out/<lang>/6.9in/<n>.png` (1320×2868) and `out/<lang>/6.5in/<n>.png` (1284×2778): RGB, no alpha, captions from this table, capture only scaled.
6. Final check on every image: correct size, no "Trendyol", no banners, captions spelled right (İ/ı, ş, ğ), Pro labels on Pro shots.
7. Also capture the **paywall** (non-subscriber) for the subscription review screenshots (see `app-store-metadata.md` → Subscriptions). Those are not store screenshots and need no caption.
