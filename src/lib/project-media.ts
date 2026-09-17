import { createServiceRoleClient } from "@/lib/supabase/service";
import { deleteFromR2 } from "@/lib/r2";

const CONTENT_FILTER = "script.not.is.null,audio_url.not.is.null,video_url.not.is.null";

function isHttpOrData(v: string): boolean {
  if (v.indexOf("http://") === 0) return true;
  if (v.indexOf("https://") === 0) return true;
  if (v.indexOf("data:") === 0) return true;
  return false;
}
export async function countContentProjects(column: string, value: string) {
  try {
    const supabase = createServiceRoleClient();
    const { count, error } = await supabase.from("projects").select("id",{ count: "exact", head: true }).or(CONTENT_FILTER).eq(column, value);
    if (error) return -1;
    return count ?? 0;
  } catch {
    return -1;
  }
}

export async function oldestContentProject(column: string, value: string) {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from("projects").select("id,title,created_at").or(CONTENT_FILTER).eq(column, value).order("created_at",{ ascending: true }).limit(1).maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function deleteProjectMedia(row: { video_url?: string | null; audio_url?: string | null; subtitle_url?: string | null } ) {
  const tasks: unknown[] = [];
  const video = row.video_url;
  if (video) {
    const key = extractR2Key(video);
    if (key) tasks.push(deleteFromR2(key));
  }
  if (row.audio_url) {
    if (isHttpOrData(row.audio_url) === false) tasks.push(removeStoragePath("acs-audio",row.audio_url));
  }
  if (row.subtitle_url) {
    if (isHttpOrData(row.subtitle_url) === false) tasks.push(removeStoragePath("acs-subtitles",row.subtitle_url));
  }
  await Promise.allSettled(tasks);
}

async function removeStoragePath(bucket: string, path: string) {
  try {
    await createServiceRoleClient().storage.from(bucket).remove([ path ]);
  } catch (e) {
    console.warn("[media]  Gagal hapus storage",(e as Error)?.message);
  }
}

function extractR2Key(url: string) {
  const base = process.env.R2_PUBLIC_URL;
  if (base) {
    if (url.indexOf(base) === 0) {
      let k = url.slice(base.length);
      while (k.charCodeAt(0) === 47) k = k.slice(1);
      if (k) return k;
    }
  }
  if (isHttpOrData(url) === false) return url;
  return null;
}
