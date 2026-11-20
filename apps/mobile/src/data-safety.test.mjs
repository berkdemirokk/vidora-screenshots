// Data-safety review (docs/qa/veri-guvenligi-incelemesi.md): one test per
// finding. draft-store.ts, media.ts and projects.ts run for real on an
// in-memory expo-file-system (src/test-support), with failures injected at
// the moment a full disk or a kill would hit.
// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

const { fs } = await import("./test-support/register.mjs");
const store = await import("./draft-store.ts");
const media = await import("./media.ts");
const projects = await import("./projects.ts");
const { defaultOptions } = await import("./project-state.ts");
const { commitRender, replaceTarget } = await import("./render-commit.ts");
const session = await import("./editor-session.ts");

const MEDIA = "file:///doc/KareviaMedia";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OLD = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const NEW = "16fd2706-8baf-433b-82eb-8c7fada847da";
const MUSIC_A = "a1b2c3d4-0000-4000-8000-00000000000a.m4a";
const MUSIC_B = "a1b2c3d4-0000-4000-8000-00000000000b.m4a";

let counter = 0;
/** A working cut-out in the cache, like the editor's. */
function cutout(content = "png-" + ++counter) {
  const uri = `file:///cache/vidora-cutout-${String(counter).padStart(8, "0")}.png`;
  fs.files.set(uri, content);
  return uri;
}
function mediaFile(name, content = "data") {
  if (!fs.dirs.has(MEDIA + "/")) fs.dirs.add(MEDIA + "/");
  fs.files.set(`${MEDIA}/${name}`, content);
}
const exists = (name) => fs.files.has(`${MEDIA}/${name}`);
const state = (over = {}) => ({
  template: "showcase",
  palette: "ivory",
  category: "cosmetics",
  styleChosen: true,
  headline: "Yaz Esintisi",
  price: "899 TL",
  badge: "",
  cta: "Hemen al",
  store: "",
  music: null,
  preset: "reels",
  quality: "1080p",
  scene: null,
  backdrop: "marble-white",
  ownBackdrop: null,
  ownActive: false,
  ratio: "9:16",
  fontStyle: null,
  oldPrice: "",
  cutout: { width: 800, height: 1000 },
  ...over,
});
const meta = (over = {}) => ({
  id: ID,
  created: 1000,
  sourceClip: null,
  ...over,
});
function fresh() {
  fs.reset();
}

// ---------------------------------------------------------------- 1
test("finding 1: a failed saveEdit after a render deletes nothing", async () => {
  fresh();
  const cut = cutout();
  store.saveDraft(meta({ sourceClip: OLD }), state(), cut);
  store.saveEdit(OLD, state({ headline: "Eski" }), cut);
  // The editor was left in the last moment: its working cut-out is gone,
  // so saving the new video's edit state throws.
  fs.files.delete(cut);
  const removed = [];
  const result = await commitRender(
    {
      clipId: NEW,
      state: state(),
      cutoutUri: cut,
      draftId: ID,
      replace: OLD,
    },
    {
      saveEdit: store.saveEdit,
      findClip: async (id) => ({ id }),
      removeClip: (clip) => removed.push(clip.id),
      removeEdit: store.removeEdit,
      deleteDraft: store.deleteDraft,
    },
  );
  assert.deepEqual(result, { saved: false, replaced: false });
  assert.deepEqual(removed, [], "the old video stays");
  assert.ok(store.loadDraft(ID), "the draft stays");
  assert.ok(store.loadEdit(OLD), "the old video's edit state stays");
  assert.equal(store.hasEdit(NEW), false);
});

test("finding 1: a saved render replaces only the target and drops the draft", async () => {
  fresh();
  const cut = cutout();
  store.saveDraft(meta({ sourceClip: OLD }), state(), cut);
  store.saveEdit(OLD, state(), cut);
  const removed = [];
  const result = await commitRender(
    { clipId: NEW, state: state(), cutoutUri: cut, draftId: ID, replace: OLD },
    {
      saveEdit: store.saveEdit,
      findClip: async (id) => ({ id }),
      removeClip: (clip) => removed.push(clip.id),
      removeEdit: store.removeEdit,
      deleteDraft: store.deleteDraft,
    },
  );
  assert.deepEqual(result, { saved: true, replaced: true });
  assert.deepEqual(removed, [OLD]);
  assert.ok(store.hasEdit(NEW));
  assert.equal(store.hasEdit(OLD), false);
  assert.equal(store.loadDraft(ID), null);
});

// ---------------------------------------------------------------- 2
test("finding 2: an interrupted save keeps the stored draft readable", () => {
  fresh();
  const cut = cutout();
  store.saveDraft(meta(), state({ headline: "Birinci" }), cut);
  // A full disk while the new cut-out is copied.
  const second = cutout();
  fs.fail = (op) => op === "copy";
  assert.throws(() =>
    store.saveDraft(meta(), state({ headline: "İkinci" }), second),
  );
  fs.fail = null;
  assert.equal(store.loadDraft(ID)?.draft.headline, "Birinci");
  // A kill while the JSON is written: the old JSON is untouched.
  fs.fail = (op, uri) => op === "write" && uri.endsWith(".json.tmp");
  assert.throws(() =>
    store.saveDraft(meta(), state({ headline: "Üçüncü" }), cut),
  );
  fs.fail = null;
  assert.equal(store.loadDraft(ID)?.draft.headline, "Birinci");
  assert.equal(store.listDrafts().length, 1);
  // A kill between removing the old JSON and moving the new one in: the
  // complete `.tmp` is read.
  fs.fail = (op, uri) => op === "move" && uri.endsWith(".json");
  assert.throws(() =>
    store.saveDraft(meta(), state({ headline: "Dördüncü" }), cut),
  );
  fs.fail = null;
  assert.equal(store.loadDraft(ID)?.draft.headline, "Dördüncü");
  assert.equal(store.listDrafts()[0].headline, "Dördüncü");
  // The next save completes normally over the leftover.
  store.saveDraft(meta(), state({ headline: "Beşinci" }), cut);
  assert.equal(store.loadDraft(ID)?.draft.headline, "Beşinci");
});

test("finding 2: an unchanged cut-out is not copied again", () => {
  fresh();
  const cut = cutout();
  store.saveDraft(meta(), state(), cut);
  const copies = [];
  fs.fail = (op, uri) => {
    if (op === "copy") copies.push(uri);
    return false;
  };
  store.saveDraft(meta(), state({ headline: "Yeni" }), cut);
  fs.fail = null;
  assert.deepEqual(copies, []);
  assert.equal(store.loadDraft(ID)?.draft.headline, "Yeni");
});

// ---------------------------------------------------------------- 3
test("finding 3: a second editor on the same draft never sweeps the first one's cut-out", () => {
  fresh();
  store.saveDraft(meta(), state(), cutout());
  const registry = session.createEditorRegistry();
  // Editor A opens the draft (sweeps, nothing else is mounted).
  const a = registry.enter();
  assert.equal(a.sweep, true);
  store.sweepEditorCache();
  const opened = store.loadDraft(ID);
  // Editor B opens the same draft on top: no sweep.
  const b = registry.enter();
  assert.equal(b.sweep, false);
  // A's working cut-out survives, so A can still save.
  assert.ok(fs.files.has(opened.cutoutUri));
  store.saveDraft(meta(), state({ headline: "A" }), opened.cutoutUri);
  // What the old unconditional sweep did: A's working cut-out is gone.
  store.sweepEditorCache();
  assert.equal(fs.files.has(opened.cutoutUri), false);
  // Even then A's next save keeps the stored draft (the unchanged cut-out
  // is not copied again), so the draft stays openable.
  store.saveDraft(meta(), state({ headline: "A2" }), opened.cutoutUri);
  assert.equal(store.loadDraft(ID)?.draft.headline, "A2");
  b.leave();
  a.leave();
  assert.equal(registry.mounted, 0);
});

test("finding 3: the same work opens one editor", () => {
  assert.equal(session.editorSessionKey({ edit: OLD }), "clip:" + OLD);
  assert.equal(
    session.editorSessionKey({ draft: { id: ID, sourceClip: OLD } }),
    "clip:" + OLD,
    "a Düzenle draft and Düzenle on its video are the same work",
  );
  assert.equal(
    session.editorSessionKey({ draft: { id: ID, sourceClip: null } }),
    "draft:" + ID,
  );
  assert.equal(session.editorSessionKey({}), undefined);
  assert.equal(
    session.singularEditor("create", { session: "draft:" + ID }),
    "draft:" + ID,
  );
  assert.equal(session.singularEditor("video", { session: "x" }), undefined);
  let now = 0;
  const guard = session.createOpenGuard(1000, () => now);
  assert.equal(guard("draft:" + ID), true);
  now = 300;
  assert.equal(guard("draft:" + ID), false, "double tap ignored");
  assert.equal(guard("clip:" + OLD), true);
  now = 2000;
  assert.equal(guard("draft:" + ID), true);
});

// ---------------------------------------------------------------- 4
test("finding 4: a replaced music file survives until the draft stops naming it", () => {
  fresh();
  mediaFile(MUSIC_A);
  mediaFile(MUSIC_B);
  const cut = cutout();
  store.saveDraft(meta(), state({ music: { file: MUSIC_A, name: "A" } }), cut);
  const queue = session.createReleaseQueue();
  // The user picks music B; A is queued, not released.
  queue.music(MUSIC_A);
  // The app is killed before the next save: the stored draft still works.
  assert.ok(exists(MUSIC_A));
  assert.equal(store.loadDraft(ID)?.draft.music?.file, MUSIC_A);
  // Next visit: the save with B succeeds, then A goes.
  store.saveDraft(meta(), state({ music: { file: MUSIC_B, name: "B" } }), cut);
  queue.afterSave({
    music: (file) => store.releaseMusic(file),
    backdrop: (file) => store.releaseOwnBackdrop(file),
  });
  assert.equal(exists(MUSIC_A), false);
  assert.ok(exists(MUSIC_B));
});

test("finding 4: a replaced own photo survives until the draft stops naming it", () => {
  fresh();
  fs.files.set("file:///cache/picked-1.jpg", "photo-1");
  fs.files.set("file:///cache/picked-2.jpg", "photo-2");
  const first = store.importOwnBackdrop("file:///cache/picked-1.jpg");
  const second = store.importOwnBackdrop("file:///cache/picked-2.jpg");
  const own = (file) => ({
    file,
    width: 3000,
    height: 4000,
    scale: 1,
    offset: 0,
    text: "light",
  });
  const cut = cutout();
  store.saveDraft(meta(), state({ ownBackdrop: own(first) }), cut);
  const queue = session.createReleaseQueue();
  queue.backdrop(first);
  assert.ok(store.ownBackdropExists(first), "kept while the draft names it");
  store.saveDraft(meta(), state({ ownBackdrop: own(second) }), cut);
  queue.afterSave({
    music: (file) => store.releaseMusic(file),
    backdrop: (file) => store.releaseOwnBackdrop(file),
  });
  assert.equal(store.ownBackdropExists(first), false);
  assert.ok(store.ownBackdropExists(second));
  // Choosing the old file again takes it off the queue.
  queue.backdrop(second);
  queue.keep(second);
  assert.equal(queue.size, 0);
});

// ---------------------------------------------------------------- 5
test("finding 5: a duplicate is written at once and survives deleting the original", () => {
  fresh();
  mediaFile(MUSIC_A);
  const cut = cutout();
  store.saveEdit(OLD, state({ music: { file: MUSIC_A, name: "A" } }), cut);
  // Çoğalt: the editor loads the video's state and (savedKey "") writes
  // its own draft on the first autosave, before any change.
  const loaded = store.loadEdit(OLD);
  store.saveDraft(meta({ id: NEW }), loaded.draft, loaded.cutoutUri);
  // The original video is deleted.
  store.removeEdit(OLD);
  const copy = store.loadDraft(NEW);
  assert.ok(copy, "the copy exists");
  assert.equal(copy.draft.music?.file, MUSIC_A);
  assert.ok(exists(MUSIC_A), "its music survives");
});

test("finding 5: Düzenle opens the draft that already re-edits the video", () => {
  fresh();
  const cut = cutout();
  store.saveEdit(OLD, state(), cut);
  store.saveDraft(meta({ sourceClip: OLD }), state({ headline: "Yarım" }), cut);
  assert.equal(store.draftForClip(OLD), ID);
  assert.equal(store.draftForClip(NEW), null);
});

// ---------------------------------------------------------------- 6
test("finding 6: only Düzenle in the same shape replaces a video", () => {
  assert.equal(replaceTarget({ clipId: OLD, ratio: "9:16" }, "9:16"), OLD);
  assert.equal(replaceTarget({ clipId: OLD, ratio: "9:16" }, "1:1"), null);
  assert.equal(replaceTarget(null, "9:16"), null, "new video or duplicate");
  fresh();
  store.saveEdit(OLD, state({ ratio: "4:5" }), cutout());
  assert.equal(store.editRatio(OLD), "4:5");
  assert.equal(store.editRatio(NEW), null);
});

// ---------------------------------------------------------------- 7
test("finding 7: continuous typing still autosaves within the max wait", () => {
  assert.equal(session.autosaveDelay(0, 0), session.AUTOSAVE_MS);
  // Typing for 3.5 s: the save comes at 4 s at the latest.
  assert.equal(session.autosaveDelay(0, 3500), 500);
  assert.equal(session.autosaveDelay(0, 9000), 0);
});

// ---------------------------------------------------------------- 8
test("finding 8: a missing music file or own photo is said once", () => {
  assert.equal(
    session.missingFilesNote({ music: false, backdrop: false }, "tr"),
    null,
  );
  assert.match(
    session.missingFilesNote({ music: true, backdrop: false }, "tr"),
    /müziği bulunamadı/,
  );
  assert.match(
    session.missingFilesNote({ music: false, backdrop: true }, "en"),
    /background photo/,
  );
  assert.match(
    session.missingFilesNote({ music: true, backdrop: true }, "tr"),
    /müziği ve arka plan/,
  );
});

// ---------------------------------------------------------------- 9
test("finding 9: erase-all also clears the app's caches", () => {
  fresh();
  store.saveDraft(meta(), state(), cutout());
  fs.dirs.add("file:///cache/vidora-posters/");
  fs.files.set("file:///cache/vidora-posters/showcase.jpg", "poster");
  fs.files.set("file:///cache/vidora-flip-1-2/frame-000.jpg", "frame");
  fs.dirs.add("file:///cache/vidora-flip-1-2/");
  fs.files.set("file:///cache/ImagePicker-x.jpg", "system");
  media.clear();
  const left = [...fs.files.keys()];
  assert.ok(!left.some((uri) => uri.includes("/vidora-")), left.join(", "));
  assert.ok(!left.some((uri) => uri.startsWith(MEDIA)));
  assert.ok(
    left.includes("file:///cache/ImagePicker-x.jpg"),
    "other caches stay",
  );
});

// ---------------------------------------------------------------- 10
test("finding 10: a project save failure reaches the caller", () => {
  fresh();
  const id = "9b2f7c1e-1111-4222-8333-444455556666";
  const project = {
    version: 1,
    id,
    name: "Kurgu",
    updated: 1,
    clips: [],
    options: defaultOptions(),
  };
  projects.saveProject(project);
  assert.ok(
    fs.files.has(`file:///doc/KareviaProjects/${id}.project.json`),
    "written synchronously",
  );
  fs.fail = (op) => op === "write";
  assert.throws(() => projects.saveProject({ ...project, name: "Yeni" }));
  fs.fail = null;
  // The earlier project is still there and intact.
  const text = fs.files.get(`file:///doc/KareviaProjects/${id}.project.json`);
  assert.equal(JSON.parse(text).name, "Kurgu");
});

test("finding 10: a clip record is written aside and moved in", async () => {
  fresh();
  // A leftover temp from a killed write is ignored by the library list.
  mediaFile(NEW + ".json.tmp", "{");
  assert.deepEqual(await media.list(), []);
});

// ---------------------------------------------------------------- round 6
test("audit G32: a shared video gets a readable file name", () => {
  assert.equal(
    media.shareBaseName("Yaz Esintisi · Vitrin.mp4"),
    "Yaz Esintisi · Vitrin",
  );
  assert.equal(
    media.shareBaseName("Amber/Parfüm: %30?.mp4"),
    "Amber-Parfüm- %30-",
  );
  assert.equal(media.shareBaseName("kampanya-reels.mp4"), "kampanya");
  assert.equal(media.shareBaseName(".mp4"), "Vidora");
  assert.equal(media.shareBaseName("x".repeat(90) + ".mp4").length, 60);
});

test("coordinator 5: listSync matches list and the library version moves", async () => {
  fresh();
  const before = media.libraryVersion();
  mediaFile(NEW + ".mp4", "video");
  mediaFile(
    NEW + ".json",
    JSON.stringify({
      id: NEW,
      file: NEW + ".mp4",
      name: "Video.mp4",
      kind: "export",
      created: 5,
      duration: 9,
    }),
  );
  assert.deepEqual(media.listSync(), await media.list());
  // A draft save counts as a library change.
  store.saveDraft(meta(), state(), cutout());
  assert.ok(media.libraryVersion() > before);
});

// ---------------------------------------------------------------- several photos
test("extra photos are stored with the draft and a deleted one is dropped", () => {
  fresh();
  const photo = (n) => {
    const uri = `file:///cache/ImagePicker/p${n}.jpg`;
    fs.files.set(uri, "jpg-" + n);
    return uri;
  };
  const extras = [
    { source: photo(1), cutout: cutout(), width: 600, height: 900 },
    { source: photo(2) },
    { source: photo(3), cutout: cutout(), width: 500, height: 500 },
  ];
  store.saveDraft(meta(), state({ extraPhotos: extras }), cutout());
  for (const name of [`${ID}.x1.jpg`, `${ID}.x1c.png`, `${ID}.x2.jpg`, `${ID}.x3.jpg`])
    assert.ok(exists("drafts/" + name), name);
  const opened = store.loadDraft(ID);
  assert.equal(opened.photosMissing, false);
  assert.equal(opened.draft.extraPhotos.length, 3);
  assert.ok(opened.draft.extraPhotos.every((p) => p.source.startsWith("file:///cache/")));
  assert.equal(fs.files.get(opened.draft.extraPhotos[1].source), "jpg-2");
  assert.equal(opened.draft.extraPhotos[1].cutout, undefined);
  // Photo 2 deleted meanwhile: the draft opens with photos 1 and 3.
  fs.files.delete(`${MEDIA}/drafts/${ID}.x2.jpg`);
  const again = store.loadDraft(ID);
  assert.equal(again.photosMissing, true);
  assert.deepEqual(
    again.draft.extraPhotos.map((p) => fs.files.get(p.source)),
    ["jpg-1", "jpg-3"],
  );
  // Saving with one photo less removes the files it no longer names.
  store.saveDraft(meta(), state({ extraPhotos: [again.draft.extraPhotos[0]] }), opened.cutoutUri);
  assert.ok(exists(`drafts/${ID}.x1.jpg`));
  assert.equal(exists(`drafts/${ID}.x3.jpg`), false);
  assert.equal(exists(`drafts/${ID}.x3c.png`), false);
  // A one-photo draft has no extra files and no extraPhotos field.
  store.saveDraft(meta(), state(), opened.cutoutUri);
  assert.equal(exists(`drafts/${ID}.x1.jpg`), false);
  assert.equal(store.loadDraft(ID).draft.extraPhotos, undefined);
});

test("a full disk while copying an extra photo fails the save and keeps the stored copy", () => {
  fresh();
  const pick = (n) => {
    const uri = `file:///cache/ImagePicker/q${n}.jpg`;
    fs.files.set(uri, "jpg-" + n);
    return uri;
  };
  const cut = cutout();
  store.saveDraft(meta(), state({ headline: "Bir", extraPhotos: [{ source: pick(1) }] }), cut);
  assert.ok(exists(`drafts/${ID}.x1.jpg`));
  // A new photo 2 replaces photo 1; the copy hits a full disk.
  fs.fail = (op, uri) => op === "copy" && uri.includes(`${ID}.x1.jpg`);
  assert.throws(() =>
    store.saveDraft(meta(), state({ headline: "İki", extraPhotos: [{ source: pick(2) }] }), cut),
  );
  fs.fail = null;
  assert.equal(fs.files.get(`${MEDIA}/drafts/${ID}.x1.jpg`), "jpg-1", "stored copy kept");
  const opened = store.loadDraft(ID);
  assert.equal(opened.draft.headline, "Bir", "the old draft is intact");
  assert.equal(opened.draft.extraPhotos.length, 1);
  assert.equal(opened.photosMissing, false);
  // A picked file that is really gone is only left out.
  const gone = pick(3);
  fs.files.delete(gone);
  store.saveDraft(meta(), state({ headline: "Üç", extraPhotos: [{ source: gone }] }), cut);
  assert.equal(store.loadDraft(ID).draft.extraPhotos, undefined);
});

test("photo 1's original photo is stored with the draft and comes back", () => {
  fresh();
  const original = "file:///cache/ImagePicker/main.heic";
  fs.files.set(original, "heic-main");
  store.saveDraft(
    meta(),
    state({ variant: "indirim-1", photo: original }),
    cutout(),
  );
  assert.ok(exists(`drafts/${ID}.p.heic`));
  const opened = store.loadDraft(ID);
  assert.equal(opened.draft.variant, "indirim-1");
  assert.ok(opened.draft.photo.startsWith("file:///cache/vidora-photo-"));
  assert.equal(fs.files.get(opened.draft.photo), "heic-main");
  // Saved again from the reopened copy: same stored file, still there.
  store.saveDraft(meta(), state({ photo: opened.draft.photo }), opened.cutoutUri);
  assert.ok(exists(`drafts/${ID}.p.heic`));
  // The stored photo deleted meanwhile: the draft opens without it.
  fs.files.delete(`${MEDIA}/drafts/${ID}.p.heic`);
  const again = store.loadDraft(ID);
  assert.ok(again);
  assert.equal("photo" in again.draft, false);
  // A picked file that is really gone is only left out of the save.
  fs.files.delete(original);
  store.saveDraft(meta(), state({ photo: original }), opened.cutoutUri);
  assert.equal("photo" in store.loadDraft(ID).draft, false);
  // A draft without the photo removes the stored copy.
  fs.files.set(original, "heic-main");
  store.saveDraft(meta(), state({ photo: original }), opened.cutoutUri);
  assert.ok(exists(`drafts/${ID}.p.heic`));
  store.saveDraft(meta(), state(), opened.cutoutUri);
  assert.equal(exists(`drafts/${ID}.p.heic`), false);
  const plain = store.loadDraft(ID);
  assert.equal("photo" in plain.draft, false);
  assert.equal("variant" in plain.draft, false);
});
