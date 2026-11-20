import { File } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { PermissionError, addFileToPhotos } from "../media";
import { exportStill, saveStill as renderStill } from "../product";
import {
  buildMainImageSpec,
  type ProductVideoSpec,
} from "../product-templates";
import {
  MARKETPLACE_MAX_BYTES,
  type MarketplaceImage,
} from "../marketplace-images";

/**
 * The image was made but adding it to Photos failed. Lets the image set say
 * "Fotoğraflar'a kaydedilemedi" instead of "hazırlanamadı" (QA run 15).
 */
export class PhotosSaveError extends Error {
  constructor(readonly reason: unknown) {
    super(reason instanceof Error ? reason.message : String(reason));
    this.name = "PhotosSaveError";
  }
}

/** Add a file to Photos; a failure comes back as PhotosSaveError. */
async function addToPhotos(uri: string): Promise<void> {
  try {
    await addFileToPhotos(uri);
  } catch (error) {
    throw new PhotosSaveError(error);
  }
}

/** Asks once for add-only access to Photos; throws when it is refused. */
export async function ensurePhotosAccess(): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted)
    throw new PermissionError(
      "Fotoğraflar'a ekleme izni verilmedi. Ayarlar > Vidora > Fotoğraflar bölümünden izin verebilirsin.",
      "Permission to add to Photos was denied. You can allow it in Settings > Vidora > Photos.",
    );
}

/**
 * Render the end card of `spec` as a full-size image and add it to Photos;
 * access must already be granted (`ensurePhotosAccess`). The temporary file
 * is removed afterwards.
 */
export async function saveStill(spec: ProductVideoSpec): Promise<void> {
  // exportStill's default moment is the end card, where every text shows.
  const uri = await exportStill(spec);
  try {
    await addToPhotos(uri);
  } finally {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Only a leftover file in the cache.
    }
  }
}

/**
 * Render the end card of `spec` as a full-size image (the 1080p frame of the
 * chosen ratio when the spec says 1080p) and add it to Photos.
 */
export async function saveStillToPhotos(spec: ProductVideoSpec): Promise<void> {
  await ensurePhotosAccess();
  await saveStill(spec);
}

/**
 * A text-free marketplace image on pure white (`buildMainImageSpec`) at the
 * preset's exact pixel size, added to Photos. The engine lowers the JPEG
 * quality (down to 0.6) to stay under MARKETPLACE_MAX_BYTES; a file still
 * larger at that floor is saved anyway and `oversize` says so.
 */
export async function saveMarketplaceImage(
  preset: MarketplaceImage,
  product: string,
  productSize: { width: number; height: number },
): Promise<{ bytes: number; oversize: boolean }> {
  await ensurePhotosAccess();
  const spec = buildMainImageSpec({
    product,
    productSize,
    ratio: preset.ratio,
    fill: preset.fill,
  });
  const { uri, bytes } = await renderStill(spec, {
    time: 0,
    format: "jpg",
    width: preset.width,
    maxBytes: MARKETPLACE_MAX_BYTES,
  });
  try {
    await addToPhotos(uri);
  } finally {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Only a leftover file in the cache.
    }
  }
  return { bytes, oversize: bytes > MARKETPLACE_MAX_BYTES };
}
