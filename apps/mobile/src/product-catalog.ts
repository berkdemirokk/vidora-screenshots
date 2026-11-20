/**
 * Seller-facing structure on top of the templates: product categories,
 * Trendyol video types and a ready-made Turkish/English copy bank that works
 * offline on every device. On-device AI suggestions (Apple Intelligence) are
 * parsed here too, so the result is the same shape either way.
 */
import type { PaletteId, TemplateId, VideoKind } from "./product-templates";

export type CategoryId =
  "cosmetics" | "jewellery" | "fashion" | "home" | "food" | "electronics";

type Copy = { tr: readonly string[]; en: readonly string[] };
export type Category = {
  id: CategoryId;
  tr: string;
  en: string;
  /** Palette picked when the category is chosen. */
  palette: PaletteId;
  /** Template picked when the category is chosen. */
  template: TemplateId;
  headlines: Copy;
  ctas: Copy;
  badges: Copy;
};

export const CATEGORIES: readonly Category[] = [
  {
    id: "cosmetics",
    tr: "Kozmetik ve parfüm",
    en: "Beauty and fragrance",
    palette: "blush",
    template: "showcase",
    headlines: {
      tr: [
        "Işıltını tamamla",
        "İmza kokun",
        "Bakım rutininin yeni yıldızı",
        "Gün boyu seninle",
        "Kendine küçük bir ödül",
        "Çantanın vazgeçilmezi",
      ],
      en: [
        "Complete your glow",
        "Your signature scent",
        "The new star of your routine",
        "With you all day",
        "A little treat for yourself",
        "Your everyday essential",
      ],
    },
    ctas: {
      tr: [
        "Hemen sipariş ver",
        "Sepete ekle",
        "Şimdi keşfet",
        "Tükenmeden al",
        "Mağazaya göz at",
      ],
      en: [
        "Order now",
        "Add to cart",
        "Discover now",
        "Get it before it's gone",
        "Visit the store",
      ],
    },
    badges: {
      tr: [
        "%20 indirim",
        "Kargo bedava",
        "Yeni ürün",
        "2. ürün %50",
        "Hediyeli",
        "Sınırlı stok",
      ],
      en: [
        "20% off",
        "Free shipping",
        "New in",
        "2nd item 50% off",
        "Free gift",
        "Limited stock",
      ],
    },
  },
  {
    id: "jewellery",
    tr: "Takı ve aksesuar",
    en: "Jewellery and accessories",
    palette: "noir",
    template: "turntable",
    headlines: {
      tr: [
        "Zamansız şıklık",
        "Her güne bir parıltı",
        "Sevdiklerine özel",
        "İnce işçilik, zarif duruş",
        "Kombinini tamamlayan detay",
        "Anlamlı bir hediye",
      ],
      en: [
        "Timeless elegance",
        "A sparkle for every day",
        "For someone special",
        "Fine craft, graceful look",
        "The detail that completes it",
        "A gift that means something",
      ],
    },
    ctas: {
      tr: [
        "Hemen sipariş ver",
        "Şimdi incele",
        "Hediye olarak gönder",
        "Stoklar sınırlı",
        "Koleksiyonu gör",
      ],
      en: [
        "Order now",
        "Take a look",
        "Send as a gift",
        "Limited stock",
        "See the collection",
      ],
    },
    badges: {
      tr: [
        "Hediye paketli",
        "Kargo bedava",
        "925 ayar gümüş",
        "El yapımı",
        "Yeni koleksiyon",
        "Kişiye özel",
      ],
      en: [
        "Gift wrapped",
        "Free shipping",
        "Sterling silver",
        "Handmade",
        "New collection",
        "Personalised",
      ],
    },
  },
  {
    id: "fashion",
    tr: "Giyim ve ayakkabı",
    en: "Clothing and shoes",
    palette: "ivory",
    template: "lightTour",
    headlines: {
      tr: [
        "Sezonun favorisi",
        "Rahatlık ve stil bir arada",
        "Yeni koleksiyon geldi",
        "Kombinin yıldızı",
        "Her bedene, her tarza",
        "Gardırobunun yeni gözdesi",
      ],
      en: [
        "Season favourite",
        "Comfort meets style",
        "The new collection is here",
        "The star of your outfit",
        "Every size, every style",
        "Your wardrobe's new favourite",
      ],
    },
    ctas: {
      tr: [
        "Bedenini seç",
        "Sepete ekle",
        "Hemen al",
        "Renkleri gör",
        "Tükenmeden yakala",
      ],
      en: [
        "Pick your size",
        "Add to cart",
        "Buy now",
        "See the colours",
        "Grab it before it's gone",
      ],
    },
    badges: {
      tr: [
        "Yeni sezon",
        "%30 indirim",
        "Ücretsiz iade",
        "Kargo bedava",
        "Son bedenler",
        "2 al 1 öde",
      ],
      en: [
        "New season",
        "30% off",
        "Free returns",
        "Free shipping",
        "Last sizes",
        "Buy 2 pay 1",
      ],
    },
  },
  {
    id: "home",
    tr: "Ev ve dekorasyon",
    en: "Home and decor",
    palette: "emerald",
    template: "lightTour",
    headlines: {
      tr: [
        "Evine sıcaklık kat",
        "Köşeni yenile",
        "Sade, şık, kullanışlı",
        "Her detayda özen",
        "Sofranı güzelleştir",
        "Yeni evine ilk hediye",
      ],
      en: [
        "Warm up your home",
        "Refresh your corner",
        "Simple, stylish, useful",
        "Care in every detail",
        "Dress up your table",
        "A first gift for a new home",
      ],
    },
    ctas: {
      tr: [
        "Hemen sipariş ver",
        "Sepete ekle",
        "Şimdi keşfet",
        "Renk seçeneklerini gör",
        "Takımı tamamla",
      ],
      en: [
        "Order now",
        "Add to cart",
        "Discover now",
        "See the colour options",
        "Complete the set",
      ],
    },
    badges: {
      tr: [
        "Kargo bedava",
        "%15 indirim",
        "Sınırlı üretim",
        "El yapımı",
        "Set fiyatına",
        "Yeni ürün",
      ],
      en: [
        "Free shipping",
        "15% off",
        "Limited run",
        "Handmade",
        "Set price",
        "New in",
      ],
    },
  },
  {
    id: "food",
    tr: "Gıda ve içecek",
    en: "Food and drink",
    palette: "noir",
    template: "campaign",
    headlines: {
      tr: [
        "Taptaze lezzet",
        "Geleneksel tarif",
        "Sofranın yıldızı",
        "Günlük üretim, taze teslim",
        "Bir tadan bir daha ister",
        "Çayın yanına çok yakışır",
      ],
      en: [
        "Fresh flavour",
        "A traditional recipe",
        "Star of the table",
        "Made daily, delivered fresh",
        "One taste and you'll want more",
        "Perfect with your tea",
      ],
    },
    ctas: {
      tr: [
        "Hemen sipariş ver",
        "Kapına gelsin",
        "Tadına bak",
        "Sepete ekle",
        "Bugün sipariş ver",
      ],
      en: [
        "Order now",
        "Delivered to you",
        "Have a taste",
        "Add to cart",
        "Order today",
      ],
    },
    badges: {
      tr: [
        "Aynı gün kargo",
        "2 al 1 öde",
        "Yerli üretim",
        "Kargo bedava",
        "Yeni hasat",
        "Ev yapımı",
      ],
      en: [
        "Same-day shipping",
        "Buy 2 pay 1",
        "Locally made",
        "Free shipping",
        "New harvest",
        "Homemade",
      ],
    },
  },
  {
    id: "electronics",
    tr: "Elektronik",
    en: "Electronics",
    palette: "ocean",
    template: "turntable",
    headlines: {
      tr: [
        "Akıllı ve hızlı",
        "Her an yanında",
        "Günlük hayatını kolaylaştırır",
        "Yeni nesil teknoloji",
        "Performans bir üst seviyede",
        "Güç cebinde",
      ],
      en: [
        "Smart and fast",
        "Always with you",
        "Makes every day easier",
        "Next-gen tech",
        "Performance, one level up",
        "Power in your pocket",
      ],
    },
    ctas: {
      tr: [
        "Hemen sipariş ver",
        "Sepete ekle",
        "Şimdi incele",
        "Özellikleri gör",
        "Stoklar sınırlı",
      ],
      en: [
        "Order now",
        "Add to cart",
        "Take a look",
        "See the specs",
        "Limited stock",
      ],
    },
    badges: {
      tr: [
        "2 yıl garanti",
        "Kargo bedava",
        "%10 indirim",
        "Aynı gün kargo",
        "Yeni model",
        "Orijinal ürün",
      ],
      en: [
        "2-year warranty",
        "Free shipping",
        "10% off",
        "Same-day shipping",
        "New model",
        "Genuine product",
      ],
    },
  },
];

export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/** Trendyol's seller video types; only kinds that have templates are offered. */
export const VIDEO_KINDS: readonly { id: VideoKind; tr: string; en: string }[] =
  [
    { id: "promotion", tr: "Ürün tanıtımı", en: "Product promotion" },
    { id: "advertisement", tr: "Reklam", en: "Advertisement" },
    { id: "packaging", tr: "Paketleme", en: "Packaging" },
    { id: "store", tr: "Mağaza tanıtımı", en: "Store promotion" },
    { id: "usage", tr: "Kullanım", en: "Usage" },
    { id: "assembly", tr: "Kurulum", en: "Assembly" },
  ];

/** Where the video goes; sets the bitrate and file size. */
export type ExportPreset = "trendyol" | "reels";
export const EXPORT_PRESETS: readonly {
  id: ExportPreset;
  tr: string;
  en: string;
  noteTr: string;
  noteEn: string;
}[] = [
  {
    id: "trendyol",
    tr: "Pazaryeri",
    en: "Marketplace",
    noteTr:
      "MP4, 8 saniyeden uzun, küçük dosya: ürün sayfasına yüklemeye hazır.",
    noteEn: "MP4, over 8 seconds, small file: ready for a product page.",
  },
  {
    id: "reels",
    tr: "Sosyal medya",
    en: "Social media",
    // The safe-area sentence is added by the Format panel at 9:16 only.
    noteTr: "MP4, en yüksek görüntü kalitesi.",
    noteEn: "MP4 at the highest quality.",
  },
];

export type CopySuggestions = { headlines: string[]; ctas: string[] };

/** Day of the month of the nth Sunday (month: 0 = January). */
function nthSunday(year: number, month: number, nth: number): number {
  const first = new Date(year, month, 1).getDay(); // 0 = Sunday
  return 1 + ((7 - first) % 7) + 7 * (nth - 1);
}

/** A selling season with its own template set (Turkish retail calendar only). */
export type SeasonId = "blackFriday" | "singles" | "mothers" | "ramadan";
export type SeasonSet = {
  id: SeasonId;
  testID: string;
  /** Chip label, badge, headline and call to action; no "official" claims. */
  label: string;
  badge: string;
  headline: string;
  cta: string;
};

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 86_400_000;

/** Friday after the fourth Thursday of November. */
function blackFridayOf(year: number): Date {
  const first = new Date(year, 10, 1).getDay(); // 0 = Sunday
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  return new Date(year, 10, thursday + 1);
}

/**
 * Ramazan: first day of fasting and the last day before Ramazan Bayramı, by
 * year (the lunar dates are listed, not computed; Diyanet's calendar). Years
 * outside the table get no Ramazan set.
 */
const RAMADAN: Record<number, [from: [number, number], to: [number, number]]> = {
  2026: [[2, 18], [3, 19]],
  2027: [[2, 8], [3, 9]],
  2028: [[1, 28], [2, 26]],
};

const SEASON_COPY: Record<SeasonId, Omit<SeasonSet, "id" | "testID">> = {
  blackFriday: {
    label: "Efsane Cuma",
    badge: "Efsane Cuma",
    headline: "Kara Cuma fırsatları",
    cta: "Fırsatı yakala",
  },
  singles: {
    label: "11.11",
    badge: "11.11 fırsatı",
    headline: "11.11'e özel fırsatlar",
    cta: "Hemen incele",
  },
  mothers: {
    label: "Anneler Günü",
    badge: "Anneler Günü",
    headline: "Anneler Günü'ne özel",
    cta: "Hediyeni seç",
  },
  ramadan: {
    label: "Ramazan",
    badge: "Ramazan'a özel",
    headline: "Hayırlı Ramazanlar",
    cta: "Hemen incele",
  },
};

/**
 * Seasonal template sets whose date window contains `today` (device calendar).
 * Turkish only: other languages get none. Windows: Efsane Cuma / Kara Cuma
 * from nine days before Black Friday to the Monday after; 11.11 from 4 to 11
 * November; Anneler Günü from 24 April to Mother's Day (second Sunday of
 * May); Ramazan from a week before the first fast to the last day.
 */
export function seasonalSets(today: Date, lang: "tr" | "en"): SeasonSet[] {
  if (lang !== "tr") return [];
  const now = day(today),
    year = today.getFullYear(),
    out: SeasonId[] = [];
  const inside = (from: Date, to: Date) => now >= day(from) && now <= day(to);
  const friday = blackFridayOf(year);
  if (inside(new Date(+friday - 9 * DAY_MS), new Date(+friday + 3 * DAY_MS)))
    out.push("blackFriday");
  if (inside(new Date(year, 10, 4), new Date(year, 10, 11))) out.push("singles");
  if (inside(new Date(year, 3, 24), new Date(year, 4, nthSunday(year, 4, 2))))
    out.push("mothers");
  const lunar = RAMADAN[year];
  if (lunar) {
    const start = new Date(year, lunar[0][0] - 1, lunar[0][1]);
    if (inside(new Date(+start - 7 * DAY_MS), new Date(year, lunar[1][0] - 1, lunar[1][1])))
      out.push("ramadan");
  }
  return out.map((id) => ({ id, testID: "season-" + id, ...SEASON_COPY[id] }));
}

/**
 * Badges for the selling season `today` falls in (at most two), in the
 * device's local calendar. Turkish follows the Turkish retail calendar;
 * English keeps to dates that are the same everywhere. Lunar holidays are
 * left out on purpose: their dates are not computed here.
 */
export function seasonalBadges(today: Date, lang: "tr" | "en"): string[] {
  const year = today.getFullYear(),
    at = (today.getMonth() + 1) * 100 + today.getDate(),
    out: string[] = seasonalSets(today, lang).map((set) => set.badge);
  const season = (from: number, to: number, tr: string, en: string | null) => {
    const text = lang === "tr" ? tr : en;
    if (text && at >= from && at <= to) out.push(text);
  };
  season(102, 124, "Kış indirimi", null);
  season(125, 214, "Sevgililer Günü", "Valentine's Day");
  season(301, 308, "8 Mart'a özel", null);
  season(424, 500 + nthSunday(year, 4, 2), "Anneler Günü", null);
  season(601, 600 + nthSunday(year, 5, 3), "Babalar Günü", null);
  season(701, 814, "Yaz indirimi", null);
  season(815, 920, "Okula dönüş", "Back to school");
  season(1101, 1130, "Kasım fırsatı", null);
  season(1110, 1124, "Öğretmenler Günü", null);
  season(1115, 1130, "", "Black Friday");
  season(1201, 1231, "Yılbaşına özel", "New Year special");
  return [...new Set(out)].slice(0, 2);
}

/**
 * The offline suggestions for a category. Badges start with the ones for the
 * current selling season, if any.
 */
export function bankSuggestions(
  category: CategoryId,
  lang: "tr" | "en",
  today: Date = new Date(),
): CopySuggestions & { badges: string[] } {
  const c = categoryById(category);
  return {
    headlines: [...c.headlines[lang]],
    ctas: [...c.ctas[lang]],
    badges: [...seasonalBadges(today, lang), ...c.badges[lang]],
  };
}

const MAX_HEADLINE = 40,
  MAX_CTA = 28;

function tidy(raw: string, max: number): string | null {
  const text = raw
    .replace(/^[\s\-–•*\d.)]+/, "")
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 2 || text.length > max) return null;
  return text;
}

/**
 * Parses the on-device model's answer. The prompt asks for lines starting
 * with "B:" (headline / başlık) and "Ç:" or "C:" (call to action / çağrı).
 * Anything malformed is dropped; at most three of each are kept.
 */
export function parseCopySuggestions(text: string): CopySuggestions {
  const headlines: string[] = [],
    ctas: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*•]\s*)?(B|H|Ç|C)\s*[:：]\s*(.+)$/i);
    if (!match) continue;
    const isHeadline = /^[bh]$/i.test(match[1]);
    const value = tidy(match[2], isHeadline ? MAX_HEADLINE : MAX_CTA);
    if (!value) continue;
    const list = isHeadline ? headlines : ctas;
    if (
      list.length < 3 &&
      !list.some((v) => v.toLowerCase() === value.toLowerCase())
    )
      list.push(value);
  }
  return { headlines, ctas };
}
