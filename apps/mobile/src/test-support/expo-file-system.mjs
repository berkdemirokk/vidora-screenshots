// In-memory stand-in for expo-file-system 58 for Node tests, with its iOS
// semantics (node_modules/expo-file-system/ios/*.swift): delete() throws when
// missing, create() throws when present, copy fails when the destination
// exists, writeSync replaces content non-atomically, moveSync with overwrite
// removes the destination first and then moves.
// `fs.fail(op, uri)` returning true makes that operation throw, to simulate
// a full disk or a kill at that point. Started from the data-safety review's
// replay script.
export const fs = {
  files: new Map(),
  dirs: new Set(["file:///doc/", "file:///cache/"]),
  fail: null,
  reset() {
    this.files.clear();
    this.dirs = new Set(["file:///doc/", "file:///cache/"]);
    this.fail = null;
  },
};
const dirUri = (u) => (u.endsWith("/") ? u : u + "/");
const fileUri = (u) => (u.endsWith("/") ? u.slice(0, -1) : u);
function join(parts) {
  let out = "";
  for (const p of parts) {
    const s = typeof p === "string" ? p : p.uri;
    if (!out) out = s;
    else out = dirUri(out) + s.replace(/^\/+/, "");
  }
  return out;
}
function hit(op, uri) {
  if (fs.fail && fs.fail(op, uri))
    throw new Error(`SIMULATED ${op} failure at ${uri}`);
}
export class Directory {
  constructor(...parts) {
    this.uri = dirUri(join(parts));
  }
  get name() {
    return this.uri.slice(0, -1).split("/").pop();
  }
  get exists() {
    return fs.dirs.has(this.uri);
  }
  create(options = {}) {
    if (this.exists) {
      if (options.idempotent) return;
      throw new Error("exists " + this.uri);
    }
    const parent =
      this.uri.slice(0, -1).split("/").slice(0, -1).join("/") + "/";
    if (!fs.dirs.has(parent)) {
      if (!options.intermediates) throw new Error("no parent " + parent);
      new Directory(parent).create({ intermediates: true, idempotent: true });
    }
    fs.dirs.add(this.uri);
  }
  list() {
    if (!this.exists) throw new Error("no dir " + this.uri);
    const out = [];
    for (const d of fs.dirs)
      if (
        d !== this.uri &&
        d.startsWith(this.uri) &&
        !d.slice(this.uri.length, -1).includes("/")
      )
        out.push(new Directory(d));
    for (const f of fs.files.keys())
      if (f.startsWith(this.uri) && !f.slice(this.uri.length).includes("/"))
        out.push(new File(f));
    return out;
  }
  delete() {
    if (!this.exists) throw new Error("path does not exist");
    hit("delete", this.uri);
    for (const d of [...fs.dirs]) if (d.startsWith(this.uri)) fs.dirs.delete(d);
    for (const f of [...fs.files.keys()])
      if (f.startsWith(this.uri)) fs.files.delete(f);
  }
}
export class File {
  constructor(...parts) {
    this.uri = fileUri(join(parts));
  }
  get name() {
    return this.uri.split("/").pop();
  }
  get exists() {
    return fs.files.has(this.uri);
  }
  get size() {
    return this.exists ? String(fs.files.get(this.uri)).length : 0;
  }
  create(options = {}) {
    if (this.exists && !options.overwrite)
      throw new Error("file exists " + this.uri);
    hit("create", this.uri);
    fs.files.set(this.uri, "");
  }
  delete() {
    if (!this.exists) throw new Error("path does not exist");
    hit("delete", this.uri);
    fs.files.delete(this.uri);
  }
  writeSync(content) {
    // Not atomic: the old content is gone before the new one lands.
    fs.files.set(this.uri, "");
    hit("write", this.uri);
    fs.files.set(this.uri, content);
  }
  async write(content) {
    this.writeSync(content);
  }
  textSync() {
    if (!this.exists) throw new Error("no file " + this.uri);
    return String(fs.files.get(this.uri));
  }
  async text() {
    return this.textSync();
  }
  copySync(dest, options = {}) {
    if (!this.exists) throw new Error("no source " + this.uri);
    const target = dest instanceof Directory ? new File(dest, this.name) : dest;
    if (target.exists) {
      if (!options.overwrite)
        throw new Error("destination exists " + target.uri);
      fs.files.delete(target.uri);
    }
    hit("copy", target.uri);
    fs.files.set(target.uri, fs.files.get(this.uri));
  }
  moveSync(dest, options = {}) {
    if (!this.exists) throw new Error("no source " + this.uri);
    const target = dest instanceof Directory ? new File(dest, this.name) : dest;
    if (target.exists) {
      if (!options.overwrite)
        throw new Error("destination exists " + target.uri);
      // FileManager.removeItem, then moveItem: a kill can land in between.
      hit("move-remove", target.uri);
      fs.files.delete(target.uri);
    }
    hit("move", target.uri);
    fs.files.set(target.uri, fs.files.get(this.uri));
    fs.files.delete(this.uri);
    this.uri = target.uri;
  }
}
export const Paths = {
  document: new Directory("file:///doc/"),
  cache: new Directory("file:///cache/"),
};
