// Pure: Turkish text for the native editor's English error messages.
// The bridge may wrap the message, so each pattern is searched, not matched.

const TABLE: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [
    /product-no-subject/,
    "Fotoğrafta ürün bulunamadı. Ürünü sade bir zeminde, kadrajı dolduracak şekilde çek.",
  ],
  [
    /product-unsupported/,
    "Ürünü arka plandan ayırmak için iOS 17 veya üstü gerekir.",
  ],
  [
    /product-scene-image/,
    "Videodaki bir fotoğraf açılamadı. Fotoğrafı yeniden seç.",
  ],
  [
    /product-unreadable.*scene image/,
    "Arka plan görseli okunamadı. Başka bir zemin ya da sahne seç.",
  ],
  [/product-unreadable/, "Fotoğraf okunamadı. Başka bir fotoğraf seç."],
  [
    /product-backgrounded/,
    "Video hazırlanırken uygulama arka plana alındı. Tekrar dene.",
  ],
  [
    /editor-backgrounded/,
    "Uygulama arka plana geçtiği için dışa aktarma durdu. Tekrar dene.",
  ],
  [
    /Another product video is already rendering/,
    "Başka bir ürün videosu hazırlanıyor.",
  ],
  [/The product video was cancelled/, "Ürün videosu iptal edildi."],
  [
    /The video length must be between 8 and 30 seconds/,
    "Video süresi 8 ile 30 saniye arasında olmalı.",
  ],
  [
    /Invalid product animation|Invalid camera movement|Invalid camera cut|The template has too many (elements|camera cuts)|A text in the template is invalid|A light sweep in the template is invalid|A scene in the template is invalid|Unsupported frame rate/,
    "Şablon ayarları geçersiz.",
  ],
  [/The system could not encode this video/, "Sistem bu videoyu kodlayamadı."],
  [/Another export is already in progress/, "Başka bir dışa aktarma sürüyor."],
  [/The export was cancelled/, "Dışa aktarma iptal edildi."],
  [/A clip has no visible video/, "Bir klipte görüntü yok."],
  [
    /A source file is missing or is not a local file/,
    "Bir kaynak dosya bulunamadı. Klibi kitaplıktan kaldırıp yeniden ekle.",
  ],
  [/Between 1 and 20 clips are required/, "1 ile 20 arasında klip gerekir."],
  [/Clip (\d+) has no video/, (m) => `${m[1]}. klipte görüntü yok.`],
  [
    /Invalid trim range for clip (\d+)/,
    (m) => `${m[1]}. klibin kırpma aralığı geçersiz.`,
  ],
  [
    /Trim range exceeds the length of clip (\d+)/,
    (m) => `${m[1]}. klibin kırpma aralığı klipten uzun.`,
  ],
  [
    /Trim range for clip (\d+) contains no video/,
    (m) => `${m[1]}. klibin seçili aralığında görüntü yok.`,
  ],
  [/Could not read the audio of this video/, "Bu videonun sesi okunamadı."],
  [/Could not read the video duration/, "Videonun süresi okunamadı."],
  [
    /Only local files are supported/,
    "Yalnızca cihazdaki dosyalar desteklenir.",
  ],
  [/The music file has no audio/, "Müzik dosyasında ses yok."],
  [/The music file is too short/, "Müzik dosyası çok kısa."],
  [/The title is longer than 100 characters/, "Başlık 100 karakterden uzun."],
  [
    /The (thumbnail )?destination( file)? already exists/,
    "Hedef dosya zaten var. Tekrar dene.",
  ],
  [
    /The destination must be a local (file|folder)/,
    "Dosya cihazda kaydedilemedi. Tekrar dene.",
  ],
  [/Unsupported frame shape/, "Bu video oranı desteklenmiyor."],
  [/Invalid preview times?\./, "Önizleme hazırlanamadı. Tekrar dene."],
  [/Invalid still time/, "Görsel hazırlanamadı. Tekrar dene."],
  [
    /Unsupported (aspect ratio|fit mode|quality|title position)/,
    "Bu ayar desteklenmiyor.",
  ],
  [/(Music volume|Volume) must be between 0 and 1/, "Ses düzeyi geçersiz."],
  [
    /Thumbnail time is outside the video|Invalid thumbnail time/,
    "Küçük resim oluşturulamadı.",
  ],
  [
    /No space left|out of space|NSFileWriteOutOfSpaceError|ENOSPC|disk is full/i,
    "Telefonda yer kalmadı. Biraz yer açıp tekrar dene.",
  ],
  [
    /saveToLibraryAsync|expo-media-library|PHPhotosErrorDomain|PHPhotosError|photo library|MediaLibrary|Failed to create asset|FailedToCreateAsset|Unable to create (?:image|video) asset/i,
    "Fotoğraflar'a kaydedilemedi. Fotoğraflar izninin açık olduğunu ve telefonda yer olduğunu kontrol edip tekrar dene.",
  ],
];

/** Turkish text for a known native message, or null. */
export function nativeErrorTurkish(message: string): string | null {
  for (const [pattern, text] of TABLE) {
    const match = message.match(pattern);
    if (match) return typeof text === "string" ? text : text(match);
  }
  return null;
}

// English text for the product module. Its coded errors arrive as
// "product-code: reason", often inside the bridge's own wrapper text.
const ENGLISH: [RegExp, string][] = [
  [
    /product-no-subject/,
    "No product was found in the photo. Shoot it on a plain background so it fills the frame.",
  ],
  [
    /product-unsupported/,
    "Cutting the product out of the background requires iOS 17 or later.",
  ],
  [
    /product-scene-image/,
    "A photo in the video could not be opened. Choose it again.",
  ],
  [
    /product-unreadable.*scene image/,
    "The background image could not be read. Choose another backdrop or scene.",
  ],
  [/product-unreadable/, "The photo could not be read. Choose another photo."],
  [
    /product-backgrounded/,
    "The app went to the background while rendering. Try again.",
  ],
  [
    /editor-backgrounded/,
    "The export stopped because the app went to the background. Try again.",
  ],
  [
    /Another product video is already rendering/,
    "Another product video is being rendered.",
  ],
  [/The product video was cancelled/, "The product video was cancelled."],
  [
    /The video length must be between 8 and 30 seconds/,
    "The video must be between 8 and 30 seconds long.",
  ],
  [
    /Invalid product animation|Invalid camera movement|Invalid camera cut|The template has too many (elements|camera cuts)|A text in the template is invalid|A light sweep in the template is invalid|A scene in the template is invalid|Unsupported frame rate/,
    "The template settings are invalid.",
  ],
  [
    /The system could not encode this video/,
    "The system could not encode this video.",
  ],
  [/The music file has no audio/, "The music file has no audio."],
  [/The music file is too short/, "The music file is too short."],
  [/Music volume must be between 0 and 1/, "The music volume is not valid."],
  [/Unsupported frame shape/, "This video shape is not supported."],
  [/Invalid preview times?\./, "The preview could not be prepared. Try again."],
  [/Invalid still time/, "The image could not be prepared. Try again."],
  [
    /The (thumbnail )?destination( file)? already exists/,
    "The file already exists. Try again.",
  ],
  [
    /The destination must be a local (file|folder)/,
    "The file could not be saved on this device. Try again.",
  ],
  [
    /A source file is missing or is not a local file/,
    "A file is missing. Choose the photo or music again.",
  ],
  [
    /No space left|out of space|NSFileWriteOutOfSpaceError|ENOSPC|disk is full/i,
    "Your phone is out of space. Free some space and try again.",
  ],
  [
    /saveToLibraryAsync|expo-media-library|PHPhotosErrorDomain|PHPhotosError|photo library|MediaLibrary|Failed to create asset|FailedToCreateAsset|Unable to create (?:image|video) asset/i,
    "Could not save to Photos. Check that Photos access is on and the phone has space, then try again.",
  ],
];

/** Clean English text for a known product module message, or null. */
export function nativeErrorEnglish(message: string): string | null {
  for (const [pattern, text] of ENGLISH) if (pattern.test(message)) return text;
  return null;
}
