# Vidora: 0 masrafla rakiplerden iyi olma planı

Tarih: 2026-11-15. Bu belge dört araştırmanın sentezidir: telefonun kendi imkânları, ücretsiz AI kaynakları, rakip ve büyüme analizi, birim ekonomi. Genel pazar ve UI raporu için: [pazar-arastirmasi-ve-ui.md](pazar-arastirmasi-ve-ui.md).

> "Ölçülmedi" ve "tahmin" yazan rakamlar cihazda doğrulanmalı. Fiyatlar ve lisanslar entegrasyondan önce sağlayıcı sayfalarından yeniden kontrol edilmeli.

## 1. Temel gerçek

- **Bedava ve yasal bulut video yok.** Google'ın ücretsiz katmanında görsel ve video üretimi kapalı. Kling ve Hailuo'nun ücretsiz kredileri yalnızca kendi web sitelerinde. Hugging Face'in ZeroGPU'su günde 5 dakika. Pollinations ticari kullanıma uygun değil.
- **iPhone'da App Store'a çıkarılabilecek bir görselden videoya modeli yok.** SnapGen-V ve On-device Sora araştırma aşamasında ve metinden videoya çalışıyor. Apple SHARP'ın lisansı yalnızca araştırma için.
- **Bilgisayarındaki sistem** (Wan 2.2 5B) ölçülen haliyle 512×288 çözünürlükte, 1 saniyelik klibi 140–215 saniyede üretiyor. Canlı hizmet veremez.

**Strateji:** Rakiplerin bulutta para ödeyerek yaptığını telefonda **"stüdyo hareket grafiği"** olarak bedavaya yap. Bulut AI'yı yalnızca ödeme yapan kullanıcıya aç.

## 2. Neden kazanabiliriz

| Rakiplerin zaafı | Bizim cevabımız |
|---|---|
| Bulut AI ürünün şeklini, logosunu ve etiket yazısını bozuyor | Ürün, fotoğrafın kendisi olarak kalıyor. **Ürün sadakati %100** |
| Kredi sistemi, başarısız üretimin de kredi yemesi, "iki kez ödüyorum" hissi | Şablon render'ı sınırsız ve kredisiz. Başarısız üretim ücretsiz |
| Gizli fiyat, iptalin zorluğu (Photoroom ve Captions Trustpilot'ta 1,5) | "Tek dokunuşla iptal, sürpriz ücret yok" ana mesaj olur |
| TR'de fiyatlar çok yüksek (Zeely haftalık 999 TL, Pippit aylık 719 TL'den başlıyor) | Aylık 79–149 TL, yıllık 499–899 TL |
| TR'de kimse yok (Vmake 36, Pippit 1 değerlendirme) | Türkçe, TL fiyatlı, Trendyol'a hazır ilk uygulama |
| Videoyu bulutta bekletiyorlar | Telefonda 10–25 saniyede hazır (tahmin), internet gerekmiyor |
| Pazaryeri formatı yok | Trendyol'un 6 resmi video türü doğrudan şablon kategorisi |

## 3. Cihaz içi pipeline (her video için 0 $)

Minimum iOS 17. AI metin özelliği için iOS 26+ ve Apple Intelligence destekli cihaz.

| # | Adım | Teknoloji | Lisans / maliyet |
|---|---|---|---|
| 1 | Ürünü kesme | Vision `VNGenerateForegroundInstanceMaskRequest` + Metal ile kenar iyileştirme | Apple, 0 $ |
| 2 | Derinlik | Depth Anything V2 **Small** Core ML (yaklaşık 35 ms, 50 MB) + normal haritası | Apache-2.0. Base, Large ve Giant ticari kullanıma **kapalı** |
| 3 | Sahne | Uygulamaya gömülü 30–60 adet 9:16 HDR stüdyo arka planı (kategoriye göre), renk uyumlama, sentetik temas gölgesi ve yansıma | Bilgisayarında bir kere üretilir, 0 $ |
| 4 | Türkçe metin | Apple Foundation Models `@Generable`: hook, başlık, CTA, hashtag. Desteklenmeyen cihazda şablon metin | Ücretsiz, cihazda. Türkçe destekli; kalite test edilmeli |
| 5 | Seslendirme (isteğe bağlı) | `AVSpeechSynthesizer` tr-TR, dosyaya yazılır | Ücretsiz. Kalite "kabul edilebilir robotik" |
| 6 | Müzik | Pixabay Music. Beat ızgarası geliştirme aşamasında çıkarılıp JSON olarak gömülür; kesimler beat'e oturur | Ticari kullanım serbest, atıf yok. AI üretim kısmında kullanılmaz |
| 7 | Render | Mevcut Swift modülü + özel `AVVideoCompositing` + Metal shader'lar. Kinetik yazı için Lottie (Apache) | 1080×1920, 30/60 fps |

### İmza "wow" efektleri (şablon uygulamalarda yok)
1. **Derinlik kabartmalı 2.5D kamera ve akan ışık:** Ürün derinlikle kabartılır, kamera 10–20° döner, şişenin üzerinde parlama süzülür, gerçekçi gölge ve zemin yansıması oluşur.
2. **Hero reveal:** Ürün, maske kenarından doğan parçacıklar ve çözülme shader'ıyla belirir. Işık huzmeleri, lens parlaması ve bokeh eşlik eder, hepsi müziğin ritmine kilitli.
3. **3D kart turntable ve mürekkep geçişi:** Kalın siluet cam bir zemin üzerinde ±25° döner. Sahne geçişleri akışkan simülasyonuyla yapılır.

### Bilinçli olarak kullanmadıklarımız
| Neden | Ne |
|---|---|
| Lisans | Apple SHARP (yalnızca araştırma), Depth Anything Base/Large, Flux dev/Kontext dev, aubio ve Piper/espeak (GPL-3) |
| iOS'ta API yok / deprecated | Image Playground `ImageCreator`, iOS Spatial Scene |
| Ağır ve pahalı | Cihazda IC-Light, cihazda FLUX (sadece A19 Pro'da deneysel olabilir) |
| Kullanma | Uppbeat, YouTube Audio Library |

## 4. Bulut AI: sadece ödeme yapana

| Katman | Kaynak | Maliyet |
|---|---|---|
| Ücretsiz kullanıcı | Telefondaki şablon pipeline'ı. Gerekirse Cloudflare Workers AI (flux-schnell / flux-2-klein) ile sahne görseli: günlük ücretsiz kotayla kabaca 80–170 görsel | 0 $ |
| Pro: "AI Sinematik" | MiniMax H3 Lite / Wan 2.2 Turbo 480–720p (5 sn klip yaklaşık 0,05–0,13 $). Premium için Seedance 2.5 Flash veya Veo 3.1 Lite | Abonelik karşılar |
| İlk aylar | **Google for Startups "Start" 2.000 $ kredisiyle** Veo ve Nano Banana. Şirket, web sitesi ve çalışan MVP gerekiyor | 0 $ |
| Örnek galeri ve şablon kütüphanesi | Bilgisayarında, gece toplu üretim: Wan 2.2 14B + lightx2v (480p, 5 sn klip yaklaşık 2–3 dk) ve Qwen-Image-Edit Lightning | Sadece elektrik |

**Kural:** Satın alma doğrulanmadan hiçbir API çağrısı yapılmaz. Yıllık plan aylık kredi tavanıyla satılır. Tahmini maliyet 100 kullanıcıda ayda 15–30 $, 1.000 kullanıcıda 150–300 $. Bunun neredeyse tamamı ücretli kullanıcılardan gelir ve abonelik gelirini aşmaz.

## 5. Ürün akışı (en fazla 4 dokunuş)

1. Fotoğraf çek ya da seç. Ürün otomatik kesilir.
2. Video türünü seç: **Tanıtım, Kullanım, Paketleme, Kurulum, Reklam, Mağaza** (Trendyol türleri). Kategori otomatik algılanır.
3. Türkçe metin önerilerinden birini seç ya da düzenle: fiyat, "%50 İndirim", "Kargo Bedava".
4. Dışa aktar: Trendyol (mp4, 9:16, 15–30 sn, küçük dosya, en az 8 sn), Reels/TikTok (1080×1920, metin güvenli alanda) ve kapak karesi.

Paywall ilk değerli önizlemeden **sonra** gelir, önce değil.

## 6. Fiyat (TL)

- **Ücretsiz:** Sınırsız şablon videosu, 720p, küçük "Vidora ile yapıldı" etiketi.
- **Pro:** Aylık 99–149 TL veya yıllık 599–899 TL, 3 günlük deneme. Kapsam: 1080p/60 fps, etiketsiz, tüm "wow" şablonları, seslendirme, toplu üretim ve aylık AI Sinematik kotası (örneğin 6–10 klip).
- **Ek AI kredi paketi:** İsteğe bağlı. Kredinin süresi dolmaz, başarısız üretim iade edilir.
- **Mevcut App Store Connect ürünleri** (haftalık 6,99 $, yıllık 59,99 $, sınırsız) bu modele göre güncellenmeli.

## 7. Sıfır maliyetli büyüme

1. **Türkçe ASO:** "trendyol video", "ürün videosu", "ürün reklamı", "reklam videosu yapma", "arka plan silme". 30 karakterlik alt başlığın tamamı kullanılmalı, ekran görüntüleri Türkçe olmalı.
2. **Apple featuring nomination:** Lansmandan 2–3 ay önce. Hikaye: "Türk KOBİ'leri için".
3. **Viral döngü:** Ücretsiz çıktıdaki etiket. Arkadaşını davet edene etiketsiz video.
4. **Build in public:** Gerçek satıcı ürünleriyle önce/sonra TikTok ve Reels içerikleri.
5. **Eğitimciler:** Trendyol eğitimi veren YouTuber'lara ücretsiz Pro karşılığında dürüst inceleme.
6. **Güven tasarımı:** Trendyol adıyla yapılan dolandırıcılık yaygın. Bu yüzden şeffaf fiyat ve "AI ile üretildi" etiketi kullanılmalı, spam yapılmamalı.

## 8. App Review

- **1.2:** İçerik filtresi, raporlama ve engelleme.
- **5.1.2(i):** Fotoğraf buluta gönderilmeden önce açık onay ekranı. Cihaz içi akışta buna gerek yok; bu da bir avantaj.
- **4.2 / 4.3:** Gerçek düzenleme araçları ve şablonlar "AI wrapper" riskini azaltır.
- **Gemini/Veo kullanılırsa:** 18+ şartı var, yaş sınırı buna göre ayarlanmalı.
- **Lisanslar:** OFL font lisansları ve CC-BY atıfları uygulamada gösterilmeli.

## 9. Yol haritası

| Aşama | İçerik | Bitti sayılması için |
|---|---|---|
| 0 | Mevcut kodun derlenmesi, TestFlight | Gerçek iPhone'da açılıyor |
| 1 | Cutout + derinlik + 1 kategori (parfüm/kozmetik) için 3 şablon + Metal render + Pixabay müzik | 15 saniyelik 1080p video telefonda 30 saniyeden kısa sürede çıkıyor, ürün bozulmuyor |
| 2 | 6 Trendyol türü × 5 kategori şablon, Foundation Models ile Türkçe metin, Trendyol/Reels export ön ayarları | 5 satıcı gerçek ürünüyle deniyor |
| 3 | UI yenilemesi (expo/skills, impeccable, SF Symbols, galeri), TL paywall, App Store | İncelemeye gönderildi |
| 4 | Pro "AI Sinematik" (bulut, sadece ödeme yapana), Google Start kredisi başvurusu | İlk ücretli abone |
| 5 | Toplu katalog üretimi, seslendirme, featuring başvurusu, ASO | 100 ücretli abone |

## 10. Doğrulanması gerekenler
- Trendyol satıcı panelinde video süre sınırı (60 mı, 120 sn mi) ve dosya boyutu sınırı.
- Hepsiburada video kuralları.
- Foundation Models'ın Türkçe metin kalitesi ve tr-TR enhanced ses kalitesi (cihazda).
- Pipeline'ın gerçek render süresi (A15, A17, A18 cihazlarda).
- Cloudflare'in ve flux-2-klein'ın ticari kullanım şartları; Mixkit'in uygulama içine gömmeye izin verip vermediği.
- TR anahtar kelime hacimleri (Appfigures veya Sensor Tower deneme sürümü).

## 11. Rakip incelemeleri (2026-11-15)

### vibedesign.app
Bu adreste bir ürün yok, alan adı satılık olarak park edilmiş:
- Adres Atom'un alan adı satış sayfasına yönleniyor. Alan adı 2026-03-10'da yeniden kaydedilmiş.
- 2025'te burada yalnızca "Coming Soon — VIBE Design" bekleme listesi sayfası vardı ve ürün hiç çıkmadı.
- vibedesign.com ise Picsart AI Assistant'a yönleniyor: sohbetle tasarım, video yok.

Buradan alınacak tek fikir "vibe design" yaklaşımı, yani **sohbetle düzeltme**. Bunu Vidora'ya Türkçe hızlı komutlar olarak ekleyeceğiz: "daha lüks", "yaz havası", "fiyatı büyüt". Komutlar cihazda şablon parametrelerine çevrilir, metin üretimi Foundation Models ile yapılır.

### Folio AI (Quantus Labs, App Store id6670756063): Türkiye'deki en doğrudan rakip
- **Konum:** TR'de 4,4★ ve 803 puan, Verimlilik kategorisinde #52. Türk satıcıları hedefliyor, yorumlara Türkçe yanıt veriyor.
- **Ürün:** Kategori "ajanları" (takı, moda, mobilya), görselden videoya ve akıllı mağaza linki. Ödeme iyzico üzerinden alınıyor.
- **Fiyat (TR):**

| Plan | Fiyat |
|---|---|
| Creator | haftalık ₺199,99 / yıllık ₺1.499,99 |
| Pro | aylık ₺1.499,99 |
| Max | aylık ₺4.999,99 |
| Ek kredi | 250 kredi ₺399,99 |

  Krediler sonraki aya devretmiyor.
- **Zaafları** (kullanıcı yorumlarından):
  - Ürün sadakati yok: "ancak yüzde yirmisi gerçek takıya benziyor".
  - Kredi hızla bitiyor ve kullanıcılar Pro aboneliğin üstüne jeton almak için de para ödemekten şikayet ediyor.
  - Uygulama çöküyor ve yavaş.
  - Çıktı boyutu seçilemiyor.
  - "Ürün videosu", "reklam" ve "Trendyol" anahtar kelimelerini kullanmıyor.

**Vidora'nın cevabı:**
- **Ürün sadakati:** Ürün kesilip gerçek pikseliyle kullanılıyor, AI ürünü değiştirmiyor.
- **Kredisiz sınırsız render:** Telefonda yapılan videolar için kredi yok.
- **Hız:** Saniyeler içinde, internetsiz, kuyruk yok.
- **Format:** Trendyol ve Reels ön ayarları.
- **ASO:** Fotoğraf ve Video kategorisinde "ürün videosu" ve "trendyol" kelimeleri.

**Fikir olarak alınacaklar (kopya değil):**
- Kategori seçince hazır şablon seti.
- Ürünü sesle anlatınca başlık ve CTA'nın çıkması (cihaz içi Speech).
- Çekim rehberi.
- Paywall'da maliyetin baştan net gösterilmesi.
- Yorumlara hızlı Türkçe yanıt.
