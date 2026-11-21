/**
 * File URIs of the editorial video's bundled sample (assets/editorial, our
 * own AI-generated shots, see docs/assets-src/SOURCES.md): "Örnekle dene" on
 * Home's Editoryal card and the QA build (EXPO_PUBLIC_QA_EDITORIAL=1) open
 * it without the network; the card's poster is drawn from it.
 */
import { Asset } from "expo-asset";
import flatlay from "../assets/editorial/flatlay.jpg";
import hand from "../assets/editorial/hand.jpg";
import macro from "../assets/editorial/macro.jpg";
import refLavanta from "../assets/editorial/ref-lavanta.jpg";
import refSpa from "../assets/editorial/ref-spa.jpg";
import vanity from "../assets/editorial/vanity.jpg";

/** Same order as EDITORIAL_SAMPLE in editorial-flow.ts. */
const AI = [refLavanta, hand, macro];
const PHOTOS = [flatlay, refSpa, vanity];

async function fileUri(module: number): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error("editorial sample has no local file");
  return uri;
}

let loaded: Promise<{ ai: string[]; photos: string[] }> | null = null;

/** The sample's AI shots [context, hand, macro] and seller photos. */
export function editorialSample(): Promise<{ ai: string[]; photos: string[] }> {
  loaded ??= Promise.all([
    Promise.all(AI.map(fileUri)),
    Promise.all(PHOTOS.map(fileUri)),
  ]).then(([ai, photos]) => ({ ai, photos }));
  // A failed load is tried again next time.
  loaded.catch(() => {
    loaded = null;
  });
  return loaded;
}
