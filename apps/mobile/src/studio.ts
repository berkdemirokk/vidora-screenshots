export type Lang = "tr" | "en";
export type Ratio = "16:9" | "9:16" | "1:1";
export type JobKind =
  "edit" | "text_to_video" | "image_to_video" | "transcribe";
export type Job = {
  id: string;
  project_id: string;
  kind: JobKind;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  created_at: string;
};
export type Project = { id: string; name: string; created_at: string };
export type Capabilities = {
  edit: boolean;
  text_to_video: boolean;
  image_to_video: boolean;
  transcribe?: boolean;
};
export type JobRequest = {
  kind: JobKind;
  media_id?: string;
  prompt?: string;
  aspect_ratio: Ratio;
  duration_seconds: number;
  start_seconds?: number;
  rights_confirmed: boolean;
  language?: "auto" | "tr" | "en";
};

/** Validate editable SRT without changing user text or ordering. */
export function validSrt(input: string): boolean {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > 2_000_000) return false;
  const timestamp =
    /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;
  return normalized.split(/\n\s*\n/).every((block) => {
    const lines = block.split("\n");
    const timingIndex = lines[0].includes("-->") ? 0 : 1;
    const match = timestamp.exec(lines[timingIndex] ?? "");
    if (!match || !lines.slice(timingIndex + 1).some((line) => line.trim()))
      return false;
    const n = match.slice(1).map(Number);
    if ([n[1], n[2], n[5], n[6]].some((part) => part > 59)) return false;
    const start = ((n[0] * 60 + n[1]) * 60 + n[2]) * 1000 + n[3];
    const end = ((n[4] * 60 + n[5]) * 60 + n[6]) * 1000 + n[7];
    return (
      Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start
    );
  });
}
export function endpoint(input: string): string {
  const u = new URL(input.trim());
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
      ))
  )
    throw Error("HTTPS endpoint required (HTTP is allowed on loopback).");
  return u.origin;
}
export function clipRange(start: string, end: string, duration: number) {
  const a = Number(start.replace(",", ".")),
    b = Number(end.replace(",", "."));
  if (
    !start.trim() ||
    !end.trim() ||
    !Number.isFinite(duration) ||
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a < 0 ||
    b <= a ||
    b > duration + 0.001
  )
    return null;
  return { start: a, end: b };
}
export function api(base: string, token: string) {
  const origin = endpoint(base);
  async function request(
    path: string,
    method = "GET",
    body?: BodyInit,
    contentType?: string,
  ) {
    const response = await fetch(origin + "/v1" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body,
      redirect: "error",
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    return response;
  }
  const json = async <T>(
    path: string,
    method?: string,
    body?: unknown,
  ): Promise<T> =>
    (
      await request(
        path,
        method,
        body === undefined ? undefined : JSON.stringify(body),
        "application/json",
      )
    ).json();
  const id = encodeURIComponent;
  return {
    caps: () => json<Capabilities>("/capabilities"),
    projects: () => json<Project[]>("/projects"),
    create: (name: string) => json<Project>("/projects", "POST", { name }),
    jobs: (project: string) =>
      json<Job[]>("/projects/" + id(project) + "/jobs"),
    submit: (project: string, spec: JobRequest) =>
      json<Job>("/projects/" + id(project) + "/jobs", "POST", spec),
    upload: async (
      project: string,
      body: BodyInit,
      type: string,
    ): Promise<{ id: string; kind: "image" | "video" }> =>
      (
        await request("/projects/" + id(project) + "/media", "POST", body, type)
      ).json(),
    cancel: (job: string) => json<Job>("/jobs/" + id(job) + "/cancel", "POST"),
    retry: (job: string) => json<Job>("/jobs/" + id(job) + "/retry", "POST"),
    output: (job: string) => request("/jobs/" + id(job) + "/output"),
    outputUrl: (job: string) => origin + "/v1/jobs/" + id(job) + "/output",
    remove: (project: string) => request("/projects/" + id(project), "DELETE"),
    erase: () => request("/account", "DELETE"),
  };
}
