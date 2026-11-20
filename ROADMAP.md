# Vidora yol haritası

Karar tarihi: 2026-11-15 (hibrit karar). Ürün: **Vidora** (`com.berkdemirok.vidora`, App Store Connect ID 6835087523).

Önceki "Türkçe altyazı uygulaması" kararının yerini bu karar aldı. Altyazı ve kurgu masası uygulamada kalıyor ama ürünün odağı değil.

## Konum

Türk satıcılar için ürün fotoğrafından reklam videosu ve kampanya görseli üreten mobil uygulama. Referanslar şunlar: vibedesignapp.com (web, AI moda fotoğrafçılığı, TL kredi paketleri) ve Folio AI (iOS, katalog ve mağaza).

**Hibrit model:**

- **Ücretsiz çekirdek (telefonda, 0 $):**
  - Vision ile ürün kesme ve şablonlu "stüdyo" videosu.
  - Ürün hiç bozulmaz, internet gerekmez, kredi yok, sınırsız.
  - Ücretsiz sürüm 720p ve filigranlı.
- **Pro (bulut AI, yalnızca ödeme yapana):**
  - 1080p ve filigransız çıktı.
  - Vibedesign tarzı özellikler: sanal manken, ürün giydirme, ürünü yeni sahneye yerleştirme, AI hareketli video.
  - Satın alma doğrulanmadan hiçbir API çağrısı yapılmaz.

Kurallar:

- Ücretsiz katmanın sunucu maliyeti sıfır.
- Bulut maliyeti yalnızca ücretli kullanıcıda oluşur. İlk aylarda Google for Startups kredisi hedeflenir.
- Para harcatan hiçbir adım (ücretli API, ücretli build, reklam) sahibin onayı olmadan atılmaz.

## Aşamalar

| # | Aşama | İçerik | Bitti sayılması için |
|---|---|---|---|
| 0 | Çalışan build | EAS build + TestFlight | Gerçek iPhone'da açılıyor |
| 1 | Cihaz içi ürün videosu | Kesme, 4 şablon (Vitrin, Işık turu, Döner vitrin, Kampanya), 5 renk, canlı önizleme, müzik, Metal ile render | 10 saniyelik 1080p video telefonda 30 saniyeden kısa sürede çıkıyor, ürün bozulmuyor |
| 2 | Türk satıcıya uyum | Trendyol'un 6 video türüne göre şablon setleri, kategori seçimi (takı, moda, kozmetik, ev), Foundation Models ile Türkçe metin önerisi, Trendyol ve Reels dışa aktarma ön ayarları, derinlik efekti | 5 satıcı gerçek ürünüyle deniyor |
| 3 | UI ve mağaza | Generic görünüme karşı UI yenilemesi (expo/skills, impeccable, SF Symbols, galeri), TL paywall, App Store metinleri | İncelemeye gönderildi |
| 4 | Pro bulut | Ürünü sahneye yerleştirme ve AI hareketli video; sonra sanal manken ve giydirme. Onay ekranı (5.1.2(i)), içerik filtresi, raporlama, "AI ile üretildi" etiketi | İlk ücretli abone |
| 5 | Büyüme | Toplu katalog üretimi, marka kiti, Türkçe hızlı komutlar ("daha lüks", "fiyatı büyüt"), featuring başvurusu, ASO | 100 ücretli abone |

## Fiyat (taslak)

- **Ücretsiz:** Sınırsız cihaz içi video, 720p, filigranlı.
- **Pro:** Aylık 99–149 TL veya yıllık 599–899 TL. Kapsam: 1080p, filigransız ve aylık bulut AI kotası.
- **Ek kredi:** Süresi dolmaz, başarısız üretim iade edilir.
- **App Store Connect:** Mevcut ürünler (haftalık 6,99 $, sınırsız yıllık 59,99 $) bu modele göre güncellenmeli.

Ayrıntılar için: [docs/sifir-maliyet-plani.md](docs/sifir-maliyet-plani.md), [docs/pazar-arastirmasi-ve-ui.md](docs/pazar-arastirmasi-ve-ui.md).

## Açık riskler

- Cihaz içi render süresi ve kesme kalitesi henüz gerçek cihazda ölçülmedi.
- Bulut AI'da ürün sadakati: rakiplerin en büyük şikayeti. Pro'da kesilen ürünün gerçek pikseli korunmalı (kompozit).
- Vibedesign ve Folio TR pazarında yerleşik. Farkımız mobil olmak, ücretsiz başlangıç ve şeffaf fiyat.
- Abonelik için App Store Connect'te ücretli uygulama sözleşmesi, banka ve vergi bilgileri tamamlanmış olmalı.
