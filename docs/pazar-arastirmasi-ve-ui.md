# Vidora: pazar araştırması ve UI yönü

Tarih: 2026-11-15. Ürün tanımı: kullanıcı **ürün fotoğrafını** yükler, uygulama ondan kısa bir **AI reklam ya da tanıtım videosu** üretir. Format 9:16, Reels, TikTok ve Trendyol için. Referans vibedesign.com'du; bu adres artık Picsart AI Assistant'a yönleniyor.

> Uyarı: Rakip fiyatlarının çoğu üçüncü taraf kaynaklardan geliyor ve kaynaklar birbiriyle çelişebiliyor. Fiyatlandırma kararı vermeden önce resmi sayfalardan doğrulayın. Kaynak linkleri tabloların içinde.

## 0. Depoyla çelişen iki nokta

1. `ROADMAP.md` 2026-11-15'te altyazı uygulamasına karar vermiş ve AI video üretimini v1'den çıkarmış (`FEATURES.aiStudio` kapalı). Bu ürün için yol haritasının yeniden yazılması gerekiyor.
2. "Sunucu maliyeti sıfır" kuralı bu üründe tutmaz. Her video ücretli bir API çağrısı demek. 8 GB VRAM'li yerel GPU yalnızca prototip ve prompt testi için kullanılabilir.

## 1. Rakipler

| Rakip | Platform | Fiyat | Not |
|---|---|---|---|
| Picsart | iOS + web | TR: haftalık ₺83,99–104,99, yıllık ₺999,99 ([App Store TR](https://apps.apple.com/tr/app/id587366035)) | Genel bir editör, ürün videosu onun araçlarından yalnızca biri. TR puanı 4,5 (76 bin oy) |
| Pippit (ByteDance) | web + iOS | Ücretsiz plan haftada 150 kredi; ücretli plan yaklaşık $21–36/ay ([affinco](https://affinco.com/pippit-ai-pricing/)) | Trustpilot puanı 1,8: modeller haber verilmeden kaldırılıyor ([trustpilot](https://ca.trustpilot.com/review/pippit.ai)) |
| Creatify | web | $39 / 100 kredi; kullanılmayan krediler 2 ayda bir siliniyor ([superscale](https://superscale.ai/alternatives/creatify/pricing)) | URL'den UGC reklam |
| Topview | web | yaklaşık $16/ay (yıllık ödemede) ([topview](https://www.topview.ai/pricing)) | Ürün videosu, avatar |
| Arcads | web | yaklaşık $110/ay ([eesel](https://eesel.ai/blog/arcads-ai-pricing)) | AI aktörlü UGC, pahalı |
| MakeUGC | web | $49 / 5 video ([superscale](https://superscale.ai/alternatives/makeugc/pricing)) | UGC avatar |
| Higgsfield Marketing Studio | web | $15 / 200 kredi; bir 1080p reklam 160 kredi ([higgsfield](https://higgsfield.ai/blog/higgsfield-pricing-explained)) | Ürün URL'sinden video |
| Captions | iOS + web | $24,99/ay ([novoads](https://novoads.ai/en/blog/captions-pricing)) | 4,7 (38,7 bin oy). Dışa aktarma paywall'u ve iptal zorluğu şikayet konusu |
| Zeely | iOS | $19,99/ay, $99,99/yıl ([similarweb](https://similarweb.com/app/apple/1586861768/vs/1667132875)) | 4,6 (17 bin oy). Reklam harcamasından yaklaşık %12 ücret alıyor |
| Vmake | iOS | $69,99/yıl, 3 gün deneme ([apppricinglab](https://apppricinglab.com/app/apple/6476962932)) | 4,8 (4,4 bin oy). En yakın mobil rakip |
| Photoroom | iOS + web | Video yalnızca Max planda ([photoroom](https://www.photoroom.com/en/pricing)) | Arka plan silme + video |
| Listify AI | iOS | S$39,98'den başlıyor ([App Store](https://apps.apple.com/sg/app/listify-ai/id6758052017)) | Ürün fotoğrafından görsel, video ve pazaryeri ilanı |
| Türk rakip | | Doğrulanmış yerli bir rakip bulunamadı | Yabancı araçlar sadece Türkçe sayfalarla geliyor |

**Rakiplerde en çok şikayet edilenler:** kredi sisteminin şeffaf olmaması, kredilerin süresinin dolması, fiyatın başta gizlenmesi ve yenilemede artması, iptalin zor olması.

## 2. Birim ekonomi (en kritik bölüm)

| Model (API) | Fiyat | 5 sn klip |
|---|---|---|
| Wan 2.6 Flash 720p (fal) | $0,05/sn ([fal](https://fal.ai/models/wan/v2.6/image-to-video/flash)) | $0,25 |
| Hailuo 02 Std (fal) | $0,045/sn | yaklaşık $0,23 |
| Runway Gen-4 Turbo | $0,05/sn | $0,25 |
| Veo 3.1 Lite / Fast / Std | $0,05 / $0,10 / $0,40 sn başına ([benchlm](https://benchlm.ai/media-pricing/veo)) | $0,25 / $0,50 / $2,00 |
| Kling 2.6 Pro (sessiz) | $0,07/sn ([fal](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video)) | $0,35 |
| Seedance 2.0 (fal) | yaklaşık $0,30/sn | yaklaşık $1,51 |
| Türkçe seslendirme (ElevenLabs) | 1.000 karakter yaklaşık $0,10 | önemsiz düzeyde |

**Varsayımlar:** Haftada 4 video, her biri 5 saniye. Başarısız denemeler ve yeniden üretimler için 1,5 kat çarpan. %60 brüt marj hedefi. Apple kesintisi Small Business Program ile %15, standartta ilk yıl %30.

| Senaryo | Haftalık maliyet | Min. haftalık fiyat (%15) | (%30) |
|---|---|---|---|
| Ekonomik model ($0,25) | $1,50 | $4,41 | $5,36 |
| Kling 2.6 Pro ($0,35) | $2,10 | $6,18 | $7,50 |
| Veo Fast ($0,50) | $3,00 | $8,82 | $10,71 |
| Seedance 2.0 ($1,51) | $9,06 | $26,6 | $32,4 |

**Sonuç:** Kotası sınırsız bir yıllık plan zarar ettirir. Yıllık fiyatın $79,99 olduğu durumda maliyete ayrılabilecek bütçe yaklaşık $27, bu da ayda yaklaşık 6 ekonomik video eder. Gelir TL, maliyet dolar olduğu için TR fiyatı kurla birlikte gözden geçirilmeli.

## 3. Türkiye

- **Fiyat normları:** Picsart haftalık ₺84–105, yıllık ₺400–1000. Dijital Hizmet Vergisi %5 ([donanimhaber](https://www.donanimhaber.com/apple-turkiye-app-store-fiyatlarina-vergi-duzenlemesi-yapti--201476)).
- **Satıcı kitlesi:** Trendyol'da 125 bini aşkın KOBİ yurt dışına satış yapıyor ([paradergi](https://www.paradergi.com.tr/sektorler/2025/12/26/made-in-turkiye-urunleri-trendyol-ile-dunya-pazarlarinda)). Toplam aktif satıcı sayısı resmi olarak açıklanmıyor; "230 bini aşkın" iddiası doğrulanmadı. Instagram'ın TR kullanıcı sayısı yaklaşık 57–62 milyon.
- **Ödeme istekliliği:** Ölçen bir veri bulunamadı. Fake-door ya da fiyat testiyle doğrulanmalı.
- **Boşluk:** Doğal Türkçe metin bindirme ("%50 İndirim", "Kargo Bedava", doğru İ/ı) ve Türkçe seslendirme.

## 4. Fırsatlar ve tehditler

**Fırsatlar**
- Ürün fotoğrafından videoya giden, mobilde çalışan ve Türkçe bir araç yok.
- Rakiplerin kredi sistemine güven düşük; şeffaf bir fiyat fark yaratır.
- Pazaryeri formatına uygun çıktı veren yok.

**Tehditler**
- TikTok Symphony ([link](https://ads.tiktok.com/business/en/blog/symphony-creative-studio)) ve Meta Advantage+ reklamverenlere ücretsiz video üretiyor.
- Pippit'in ücretsiz planı cömert.
- Picsart güçlü bir marka.
- Model fiyatları dalgalı, modeller kaldırılabiliyor.

## 5. Öneriler

**Konumlandırma:** "Türk satıcının cebindeki reklam stüdyosu: fotoğrafı çek, Trendyol/Reels videon hazır."

**Öne çıkarılacak 3 fark**
1. Türkçe öncelikli: hazır kampanya metinleri, Türkçe seslendirme.
2. Tek dokunuşla pazaryeri ve Reels'e hazır çıktı: 9:16, 1:1, kapak karesi.
3. Şeffaf fiyat: 1 video = 1 kredi, kredinin süresi dolmaz, fiyat baştan görünür.

**MVP sırası (etki/efor)**
1. Tek dokunuşla 9:16 + kategori şablonları (parfüm, sneaker, kozmetik, gıda, el yapımı)
2. Arka plan silme: iOS Vision `VNGenerateForegroundInstanceMaskRequest`, cihaz içinde ve ücretsiz
3. Türkçe metin bindirme (fiyat, indirim, CTA)
4. Telifsiz müzik
5. Önizleme ucuz modelle, nihai çıktı premium modelle
6. Türkçe seslendirme
7. Toplu katalog üretimi ve Trendyol formatı (V2)

**Fiyat:** Kredi tavanlı abonelik ile ek kredi paketleri birlikte. Örnek: haftalık $5,99–7,99 (yaklaşık 4 video), aylık yaklaşık $24,99 (16 video), yıllık $79,99 (ayda 6 video). Premium modeller 3–5 kredi tüketsin. Mevcut "yıllık $59,99, sınırsız" kurgusu bu ürün için zarar ettirir.

**GPU parası yakmayan deneme:** Örnek galerisi, filigranlı 3 saniyelik düşük çözünürlüklü klip, cihaz başına bir ücretsiz video (DeviceCheck ile kontrol).

**ASO anahtar kelimeleri**
- TR: ürün videosu, reklam videosu yapma, yapay zeka video, ürün tanıtım, trendyol satıcı, reels video, arka plan silme
- EN: product video maker, AI ad generator, photo to video, UGC ads, product showcase

**App Review**
- **1.2:** AI içerik uygulamaları kapsamda; içerik filtresi, raporlama ve engelleme şart ([Apple](https://developer.apple.com/news?id=vvzx6cul)).
- **5.1.2(i):** Fotoğraf ve prompt üçüncü taraf AI'ya gönderilmeden önce açık bir onay ekranı gerekiyor ([TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)).
- **4.2 / 4.3:** "AI wrapper" riski var; şablonlar ve düzenleme araçlarıyla gerçek değer sunulmalı.
- **Ek önlemler:** "Bu ürünün sahibiyim" onayı ve çıktıya "AI ile üretildi" etiketi.

## 6. UI: neden "AI yapmış gibi" duruyor

Mevcut koddan tespitler:
- **Renk:** Koyu yeşil-siyah zemin ve tek neon vurgu rengi (`src/ui.tsx` içindeki `Theme`). AI araçlarının klasik görünümü.
- **Navigasyon:** Her şey alt alta dizilmiş aynı `Button`. Tab bar, ikon ve SF Symbols yok. Her ekranın altında "Ana sayfa / Kitaplık" butonları tekrar ediyor.
- **Hareket:** Reanimated ve haptics yok, tipografi tercihi yok.
- **Vitrin:** Ana sayfada ürünle ilgisi olmayan bir kum tepesi görseli var. Üretilmiş örnek videolar yok.

### Kullanılacak GitHub repoları (2026-11-15 itibarıyla doğrulandı)

**Tasarım rehberleri ve agent skill'leri**

| Repo | ★ | Neden |
|---|---|---|
| [expo/skills](https://github.com/expo/skills) | 4.2k | `expo-design-system` doğrudan "AI ya da native olmayan görünen uygulamayı düzeltmek" için yazılmış. `expo-native-ui` ve `expo-animation` da var |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 110k | `critique`, `audit` ve `polish` komutları, 62 kurallı slop dedektörü, iOS/RN referansı (`ios.md`) |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | 57k | Animasyon ve detay zevki, `animate-expo` |
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 127k | Gerçek markaların DESIGN.md örnekleri |
| [google-labs-code/design.md](https://github.com/google-labs-code/design.md) | 29k | DESIGN.md formatının spesifikasyonu |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 116k | "AI tells" yasak listesi (web odaklı, RN'ye ancak ilke düzeyinde uyar) |

**React Native kütüphaneleri**

| Repo | Neden |
|---|---|
| [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) | Spring animasyonlar, paylaşılan öğe geçişleri |
| [react-native-skia](https://github.com/Shopify/react-native-skia) | "Üretiliyor" ekranı için shader, cutout maskesi, before/after |
| [react-native-gesture-handler](https://github.com/software-mansion/react-native-gesture-handler) | Before/after sürükleme, pinch-zoom |
| [expo/expo](https://github.com/expo/expo): expo-symbols, expo-glass-effect, expo-haptics | SF Symbols, iOS 26 liquid glass, haptik geri bildirim. Hepsi SDK 58'de var |
| [react-native-unistyles](https://github.com/jpudysz/react-native-unistyles) | Mevcut StyleSheet koduna tema ve token katmanı ekler |
| [AppAndFlow/react-native-ease](https://github.com/AppAndFlow/react-native-ease) | Core Animation ile hafif geçişler |

**AI üretim UX referansları**

| Repo | Neden |
|---|---|
| [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) | Higgsfield tarzı stüdyo akışları (MIT) |
| [fal-ai-community/video-starter-kit](https://github.com/fal-ai-community/video-starter-kit) | Üretim kuyruğu ve durum modeli |
| [Shopify/flash-list](https://github.com/Shopify/flash-list) v2 | Masonry video galerisi |
| [nandorojo/galeria](https://github.com/nandorojo/galeria) | Photos hissinde tam ekran geçiş |
| [react-native-vision-camera](https://github.com/margelo/react-native-vision-camera) | Uygulama içi ürün çekimi |
| [wide-trace/open-higgsfield](https://github.com/wide-trace/open-higgsfield) | Şablon kartları (lisanssız, yalnızca ilham) |

**İlham:** [bluesky-social/social-app](https://github.com/bluesky-social/social-app) (Expo, kendi tasarım sistemi), [enzomanuelmangano/demos](https://github.com/enzomanuelmangano/demos) (mikro-etkileşimler), [rainbow-me/rainbow](https://github.com/rainbow-me/rainbow) (GPL, yalnızca incele).

### Generic görünüme karşı kurallar
- **Tipografi:** Inter kullanma. Gövde metni SF Pro, başlıklar için tek bir karakterli display font. Hiyerarşi renkle değil ağırlık ve boyutla kurulsun.
- **Renk:** Semantik iOS renkleri kullan, açık ve koyu mod birlikte tasarlansın. Tek ve markaya özel bir vurgu rengi olsun; rengi üretilen videolar versin. Gradient blob kullanma.
- **Yerleşim:** Medya kenardan kenara aksın, iç içe kartlar olmasın, 4/8 tabanlı boşluklar, dokunma hedefleri en az 44pt.
- **Hareket:** Ease-out veya spring kullan. Ekran başına bir ya da iki anlamlı an yeterli. Haptik ekle, Reduce Motion ayarına uy.
- **İkonlar:** Emoji yok, yalnızca SF Symbols.
- **Kontroller:** Tek bir birincil CTA. Navigasyon tab bar ile, görevler sheet ile yapılsın.
- **Metin:** "Yapay zekanın gücünü keşfet" yerine "Ürün fotoğrafını yükle". İlerleme dürüst adımlarla gösterilsin ("Arka plan ayrılıyor, Sahne 2/4").

### İlk adım önerisi
1. Projeye expo/skills ve impeccable'ı kur; `DESIGN.md` ile tek bir `theme.ts` token dosyası çıkar.
2. Ekranları yeniden kurgula: Galeri (masonry) → Oluştur (fotoğraf → cutout → şablon/mood → üretiliyor → sonuç) → Kütüphane → Krediler.
3. "Üretiliyor" ekranını Skia ile imza anına dönüştür.
