// Third-party content shipped inside the app binary, shown on the Licenses screen.
import type { LicenseTextId } from "./license-texts";

export { LICENSE_TEXTS, type LicenseTextId } from "./license-texts";

export type License = {
  /** Stable key for lists. */
  id: string;
  /** Plain name, or a two-language title for grouped entries. */
  name: string | { tr: string; en: string };
  /** What the component does in Vidora, in both languages. */
  use: { tr: string; en: string };
  /** One copyright line; grouped entries list theirs in `items`. */
  copyright?: string;
  /** Several components under one licence (e.g. the bundled fonts). */
  items?: readonly { name: string; copyright: string }[];
  license: string;
  /** Short plain-language summary of the license terms. */
  summary: { tr: string; en: string };
  /** Where the component can be found. */
  source?: string;
  /** The bundled full licence text (works offline). */
  text: LicenseTextId;
};

const APACHE_SUMMARY = {
  tr: 'Apache Lisansı 2.0 kapsamında lisanslanmıştır. Kullanım, değiştirme ve dağıtım serbesttir; telif ve lisans bildirimleri korunmalı, değiştirilen dosyalar belirtilmelidir. Yazılım "OLDUĞU GİBİ", hiçbir garanti olmadan sunulur.',
  en: 'Licensed under the Apache License, Version 2.0. Use, modification and distribution are permitted; copyright and license notices must be kept and modified files must be marked. Provided "AS IS", without warranties or conditions of any kind.',
};

const MIT_SUMMARY = {
  tr: 'MIT Lisansı kapsamında lisanslanmıştır. Telif ve izin bildirimi korunduğu sürece kullanım, kopyalama, değiştirme ve dağıtım serbesttir. Yazılım "OLDUĞU GİBİ", hiçbir garanti olmadan sunulur.',
  en: 'Licensed under the MIT License. Use, copying, modification and distribution are permitted as long as the copyright and permission notice is kept. Provided "AS IS", without warranty of any kind.',
};

const OFL_SUMMARY = {
  tr: 'SIL Open Font License 1.1 kapsamında lisanslanmıştır. Yazı tipi uygulamalarla birlikte serbestçe kullanılabilir ve dağıtılabilir; tek başına satılamaz ve telif bildirimi korunmalıdır. "OLDUĞU GİBİ", hiçbir garanti olmadan sunulur.',
  en: 'Licensed under the SIL Open Font License 1.1. The font may be used and distributed freely with software; it may not be sold on its own and the copyright notice must be kept. Provided "AS IS", without warranty of any kind.',
};
/** Fonts bundled in modules/karevia-editor/ios/fonts (OFL-*.txt next to them). */
const FONTS: License = {
  id: "fonts-ofl",
  name: { tr: "Videodaki yazı tipleri", en: "Typefaces in the video" },
  use: {
    tr: "Videodaki başlık, fiyat ve buton yazıları için yazı tipleri.",
    en: "Typefaces for the headline, price and button text in the video.",
  },
  items: [
    {
      name: "Manrope (Medium, Bold, ExtraBold)",
      copyright:
        "Copyright 2018 The Manrope Project Authors (https://github.com/googlefonts/manrope)",
    },
    {
      name: "Playfair Display (Medium, Bold)",
      copyright:
        'Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display"',
    },
    {
      name: "Cormorant Garamond (Medium, Bold)",
      copyright:
        "Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)",
    },
    {
      name: "Anton",
      copyright:
        "Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git)",
    },
    {
      name: "Archivo Black",
      copyright:
        "Copyright 2017 The Archivo Black Project Authors (https://github.com/Omnibus-Type/ArchivoBlack)",
    },
  ],
  license: "SIL Open Font License 1.1",
  summary: OFL_SUMMARY,
  source: "https://openfontlicense.org",
  text: "ofl-1.1",
};

export const LICENSES: readonly License[] = [
  {
    id: "depth-anything-v2-small",
    name: "Depth Anything V2 Small (Core ML)",
    use: {
      tr: "Stüdyo ışığı için ürün fotoğrafından cihaz üzerinde derinlik tahmini.",
      en: "On-device depth estimation from the product photo for the studio light.",
    },
    copyright:
      "Core ML model © Apple Inc. Original model © Lihe Yang, Bingyi Kang, Zilong Huang, Zhen Zhao, Xiaogang Xu, Jiashi Feng, Hengshuang Zhao (Depth Anything V2).",
    license: "Apache License 2.0",
    summary: APACHE_SUMMARY,
    source: "https://huggingface.co/apple/coreml-depth-anything-v2-small",
    text: "apache-2.0",
  },
  {
    id: "open-source-javascript",
    name: "React Native, Expo",
    use: {
      tr: "Uygulamanın arayüzü ve altyapısı, bunlara bağlı açık kaynak JavaScript kitaplıklarıyla birlikte.",
      en: "The app's interface and runtime, together with the open-source JavaScript libraries they depend on.",
    },
    copyright:
      "© Meta Platforms, Inc. and affiliates (React Native); © 650 Industries, Inc. (Expo); and the respective authors of each library.",
    license: "MIT License",
    summary: MIT_SUMMARY,
    source: "https://github.com/facebook/react-native",
    text: "mit",
  },
  FONTS,
];
