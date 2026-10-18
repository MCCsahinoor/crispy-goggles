/**
 * Photos, videos and music from the device media store, for the phone-to-phone picker.
 *
 * Listing uses `Query.exeForMetadata()`, which is cheap for thousands of rows but has no file
 * path or size. `AssetMetadata.id` is a content:// URI on Android (ph:// on iOS), which images
 * and video thumbnails can render directly. Real file paths and sizes are resolved only for the
 * items the person picks, through `resolveMedia`.
 */
import { File } from "expo-file-system";
import {
  Album,
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
  type AssetMetadata,
} from "expo-media-library";
import { Platform } from "react-native";

export type MediaKind = "photo" | "video" | "audio";
export type MediaAccess = "all" | "limited" | "none";

export type MediaItem = {
  /** Media store id. Renders as an image source and re-creates the asset for resolving. */
  id: string;
  kind: MediaKind;
  name: string;
  /** Milliseconds since epoch; 0 when the store has no date. */
  createdAt: number;
  /** Seconds, or null for photos. */
  duration: number | null;
};

export type MediaFolder = {
  id: string;
  title: string;
  items: MediaItem[];
};

export type ResolvedMedia = { uri: string; size: number };

const KIND_TYPE: Record<MediaKind, MediaType> = {
  photo: MediaType.IMAGE,
  video: MediaType.VIDEO,
  audio: MediaType.AUDIO,
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  amr: "audio/amr",
  pdf: "application/pdf",
  zip: "application/zip",
  apk: "application/vnd.android.package-archive",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeFromName(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return undefined;
  }
  return EXTENSION_MIME[name.slice(dot + 1).toLowerCase()];
}

function toMillis(value: number | null): number {
  if (!value || !Number.isFinite(value)) {
    return 0;
  }
  // Some stores report seconds rather than milliseconds.
  return value < 1e11 ? value * 1000 : value;
}

function toSeconds(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  // Android's media store keeps durations in milliseconds; iOS reports seconds.
  return Platform.OS === "android" ? value / 1000 : value;
}

function toItem(kind: MediaKind, row: AssetMetadata): MediaItem {
  const tail = row.id.split("/").pop() ?? "";
  return {
    id: row.id,
    kind,
    name: row.filename?.trim() || `${kind}-${tail}`,
    createdAt: toMillis(row.creationTime ?? row.modificationTime),
    duration: kind === "photo" ? null : toSeconds(row.duration),
  };
}

function accessFrom(response: { granted: boolean; accessPrivileges?: "all" | "limited" | "none" }): MediaAccess {
  if (response.accessPrivileges === "limited") {
    return "limited";
  }
  return response.granted ? "all" : "none";
}

/** Check the current media permission, asking for it when `request` is set. */
export async function getMediaAccess(request: boolean): Promise<MediaAccess> {
  try {
    const response = request
      ? await requestPermissionsAsync(false, ["photo", "video", "audio"])
      : await getPermissionsAsync(false, ["photo", "video", "audio"]);
    return accessFrom(response);
  } catch {
    return "none";
  }
}

/** On Android 14+ with partial access, let the person widen the set of shared photos and videos. */
export async function manageLimitedAccess(): Promise<void> {
  try {
    await presentPermissionsPicker(["photo", "video"]);
  } catch {
    // Not available on this Android version.
  }
}

function newestFirst(kind: MediaKind): Query {
  return new Query()
    .eq(AssetField.MEDIA_TYPE, KIND_TYPE[kind])
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false });
}

/** Newest first. The store's own ordering is not always honoured, so sort here as well. */
function sortNewest(items: MediaItem[]): MediaItem[] {
  return items.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
}

export async function listMedia(kind: MediaKind): Promise<MediaItem[]> {
  const rows = await newestFirst(kind).exeForMetadata();
  return sortNewest(rows.map((row) => toItem(kind, row)));
}

/** Albums (photos) or folders (videos, music) that contain at least one item of this kind. */
export async function listFolders(kind: MediaKind): Promise<MediaFolder[]> {
  const albums = await Album.getAll();
  const folders: MediaFolder[] = [];
  for (const album of albums) {
    let rows: AssetMetadata[];
    try {
      rows = await newestFirst(kind).album(album).exeForMetadata();
    } catch {
      continue;
    }
    if (rows.length === 0) {
      continue;
    }
    let title = "";
    try {
      title = (await album.getTitle()).trim();
    } catch {
      title = "";
    }
    folders.push({
      id: album.id,
      title: title || "Untitled",
      items: sortNewest(rows.map((row) => toItem(kind, row))),
    });
  }
  folders.sort((left, right) => right.items.length - left.items.length || left.title.localeCompare(right.title));
  return folders;
}

const resolved = new Map<string, ResolvedMedia>();

/** File path and size for one media item; cached for the session. */
export async function resolveMedia(id: string): Promise<ResolvedMedia> {
  const hit = resolved.get(id);
  if (hit) {
    return hit;
  }
  const uri = await new Asset(id).getUri();
  let size = 0;
  try {
    size = new File(uri).size ?? 0;
  } catch {
    size = 0;
  }
  const entry = { uri, size };
  resolved.set(id, entry);
  return entry;
}

/** Resolve many items a few at a time, reporting progress; failures are returned as null. */
export async function resolveMany(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<(ResolvedMedia | null)[]> {
  const out: (ResolvedMedia | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < ids.length) {
      const index = next;
      next += 1;
      try {
        out[index] = await resolveMedia(ids[index]);
      } catch {
        out[index] = null;
      }
      done += 1;
      onProgress?.(done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return out;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "";
  }
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

/** Local calendar day as YYYY-MM-DD, for grouping; empty when the item has no date. */
export function dayKey(ms: number): string {
  if (!ms) {
    return "";
  }
  const date = new Date(ms);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
