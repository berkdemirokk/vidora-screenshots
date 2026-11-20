import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import {
  PROJECT_SUFFIX,
  cleanName,
  isUuid,
  parseProject,
  type Project,
} from "./project-state";
export type { Project } from "./project-state";

const directory = () => new Directory(Paths.document, "KareviaProjects");
function folder() {
  const dir = directory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
function projectFile(id: string) {
  if (!isUuid(id)) throw Error("Invalid project id");
  return new File(folder(), id + PROJECT_SUFFIX);
}

export function newProjectId(): string {
  return randomUUID();
}

export async function listProjects(): Promise<Project[]> {
  const files = folder()
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.name.endsWith(PROJECT_SUFFIX),
    );
  const projects = await Promise.all(
    files.map(async (file): Promise<Project | null> => {
      try {
        return parseProject(await file.text(), file.name);
      } catch {
        return null;
      }
    }),
  );
  return projects
    .filter((project): project is Project => project !== null)
    .sort((a, b) => b.updated - a.updated);
}

export async function loadProject(id: string): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const file = projectFile(id);
  if (!file.exists) return null;
  try {
    return parseProject(await file.text(), file.name);
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  const file = projectFile(project.id);
  const text = JSON.stringify(project);
  // Never persist something the loader would refuse to read back.
  if (!parseProject(text, file.name)) throw Error("Invalid project state");
  // Synchronous, so a failure reaches the caller (the async `write` of
  // expo-file-system 58 was not awaited); written aside, then moved in.
  const temp = new File(file.uri + ".tmp");
  if (temp.exists) temp.delete();
  temp.create();
  temp.writeSync(text);
  temp.moveSync(file, { overwrite: true });
}

export async function renameProject(
  id: string,
  name: string,
): Promise<Project | null> {
  const project = await loadProject(id);
  const cleaned = cleanName(name);
  if (!project || !cleaned) return null;
  const renamed: Project = { ...project, name: cleaned, updated: Date.now() };
  saveProject(renamed);
  return renamed;
}

export function removeProject(id: string): void {
  const file = projectFile(id);
  if (file.exists) file.delete();
}

export function clearProjects(): void {
  const dir = directory();
  if (dir.exists) dir.delete();
}
