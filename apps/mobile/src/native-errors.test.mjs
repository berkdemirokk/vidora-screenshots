import assert from "node:assert/strict";
import test from "node:test";
import { nativeErrorEnglish, nativeErrorTurkish } from "./native-errors.ts";

test("native editor errors get Turkish text", () => {
  assert.equal(
    nativeErrorTurkish("Error: Trim range exceeds the length of clip 3."),
    "3. klibin kırpma aralığı klipten uzun.",
  );
  assert.equal(
    nativeErrorTurkish("The system could not encode this video."),
    "Sistem bu videoyu kodlayamadı.",
  );
  assert.equal(nativeErrorTurkish("Something unexpected"), null);
});

test("product module errors get clean English text without the code", () => {
  const wrapped =
    "Calling the 'cutout' function has failed\n→ Caused by: product-no-subject: No product was found in the photo.";
  const english = nativeErrorEnglish(wrapped);
  assert.equal(
    english,
    "No product was found in the photo. Shoot it on a plain background so it fills the frame.",
  );
  assert.ok(!english.includes("product-no-subject"));
  assert.equal(
    nativeErrorEnglish(
      "product-unsupported: Cutting out a product requires iOS 17 or later.",
    ),
    "Cutting the product out of the background requires iOS 17 or later.",
  );
  assert.equal(
    nativeErrorEnglish("product-unreadable: The photo could not be read."),
    "The photo could not be read. Choose another photo.",
  );
  assert.equal(
    nativeErrorEnglish("Another product video is already rendering."),
    "Another product video is being rendered.",
  );
  assert.equal(
    nativeErrorEnglish("Invalid camera movement."),
    "The template settings are invalid.",
  );
  assert.equal(nativeErrorEnglish("Something unexpected"), null);
});

test("every product message with English text also has Turkish text", () => {
  for (const message of [
    "product-no-subject: x",
    "product-unsupported: x",
    "product-unreadable: x",
    "product-backgrounded: x",
    "Another product video is already rendering.",
    "The product video was cancelled.",
    "The video length must be between 8 and 30 seconds.",
    "Unsupported frame rate.",
    "The system could not encode this video.",
  ]) {
    assert.ok(nativeErrorEnglish(message), message);
    assert.ok(nativeErrorTurkish(message), message);
  }
});

test("a render stopped by going to the background has its own message", () => {
  const wrapped =
    "Calling the 'render' function has failed\n→ Caused by: product-backgrounded: The product video was cancelled because the app went to the background.";
  assert.equal(
    nativeErrorTurkish(wrapped),
    "Video hazırlanırken uygulama arka plana alındı. Tekrar dene.",
  );
  assert.equal(
    nativeErrorEnglish(wrapped),
    "The app went to the background while rendering. Try again.",
  );
});

test("every message the Swift engine can throw has both texts", () => {
  for (const message of [
    "Unsupported frame shape.",
    "The template has too many camera cuts.",
    "Invalid camera cut.",
    "A light sweep in the template is invalid.",
    "Invalid preview time.",
    "Invalid preview times.",
    "Invalid still time.",
    "The destination must be a local file.",
    "The destination must be a local folder.",
    "The destination file already exists.",
    "The thumbnail destination already exists.",
  ]) {
    assert.ok(nativeErrorTurkish(message), message);
    assert.ok(nativeErrorEnglish(message), message);
  }
});

test("an unreadable scene image does not ask for another photo", () => {
  const scene = "product-unreadable: The scene image could not be read.";
  assert.match(nativeErrorTurkish(scene), /zemin ya da sahne/);
  assert.match(nativeErrorEnglish(scene), /backdrop or scene/);
  const photo = "product-unreadable: The photo could not be read.";
  assert.match(nativeErrorTurkish(photo), /Başka bir fotoğraf seç/);
  assert.match(nativeErrorEnglish(photo), /Choose another photo/);
});

test("a scene photo that cannot be opened asks to choose it again", () => {
  const wrapped =
    "Calling the 'render' function has failed\n→ Caused by: product-scene-image: A photo used in the video could not be opened.";
  assert.equal(
    nativeErrorTurkish(wrapped),
    "Videodaki bir fotoğraf açılamadı. Fotoğrafı yeniden seç.",
  );
  assert.equal(
    nativeErrorEnglish(wrapped),
    "A photo in the video could not be opened. Choose it again.",
  );
  for (const message of [
    "A scene in the template is invalid.",
    "The template has too many elements.",
  ]) {
    assert.equal(nativeErrorTurkish(message), "Şablon ayarları geçersiz.");
    assert.equal(nativeErrorEnglish(message), "The template settings are invalid.");
  }
});

test("saving to Photos and a full disk never show developer text (QA run 15)", () => {
  const deprecated =
    "Method saveToLibraryAsync imported from 'expo-media-library' is deprecated. Import the legacy API from 'expo-media-library/legacy'.";
  assert.match(
    nativeErrorTurkish(deprecated),
    /^Fotoğraflar'a kaydedilemedi\./,
  );
  assert.match(nativeErrorEnglish(deprecated), /^Could not save to Photos\./);
  assert.match(
    nativeErrorTurkish(
      "The operation couldn’t be completed. (PHPhotosErrorDomain error 3311.)",
    ),
    /Fotoğraflar'a kaydedilemedi/,
  );
  assert.match(nativeErrorTurkish("No space left on device"), /yer kalmadı/);
  for (const text of [
    nativeErrorTurkish(deprecated),
    nativeErrorEnglish(deprecated),
  ])
    assert.doesNotMatch(text, /saveToLibraryAsync|expo-media-library|legacy/);
});

test("the new Photos API's failures get the same plain sentence", () => {
  for (const message of [
    "Failed to create asset from file vidora-still-1.jpg",
    "Unable to create image asset request for vidora-still-1.jpg",
  ]) {
    assert.match(nativeErrorTurkish(message), /^Fotoğraflar'a kaydedilemedi/);
    assert.match(nativeErrorEnglish(message), /^Could not save to Photos/);
  }
});

test("a desk export stopped by going to the background has its own message", () => {
  const wrapped =
    "Calling the 'export' function has failed\n→ Caused by: editor-backgrounded: The export was cancelled because the app went to the background.";
  assert.equal(
    nativeErrorTurkish(wrapped),
    "Uygulama arka plana geçtiği için dışa aktarma durdu. Tekrar dene.",
  );
  assert.equal(
    nativeErrorEnglish(wrapped),
    "The export stopped because the app went to the background. Try again.",
  );
});

test("translation that cannot run on the device has a clear message", () => {
  const wrapped =
    "Calling the 'translateTexts' function has failed\n→ Caused by: product-translate-unavailable: Translation is not available on this device right now.";
  assert.equal(
    nativeErrorTurkish(wrapped),
    "Çeviri bu cihazda şu an kullanılamıyor.",
  );
  assert.equal(
    nativeErrorEnglish(wrapped),
    "Translation isn't available on this device right now.",
  );
});
