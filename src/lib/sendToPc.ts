import { File, UploadTask, UploadType } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";

import { t } from "../i18n";
import { PHONE_CONNECT_PORT, startDesktopConnectListener } from "./phoneListen";
import { DEFAULT_PORT, withLocalWifiRoute } from "./filedrop";
import { listLocalIpv4, subnetPrefix } from "./networkIps";

export type SendFile = {
  id: string;
  name: string;
  uri: string;
  size: number;
  mimeType?: string;
};

export type PcReceiveReady = {
  baseUrl: string;
  receiveToken: string;
  extraBaseUrls?: string[];
};

export type SendSession = {
  token: string;
  files: SendFile[];
  qrValue: string;
  mobileIp?: string | null;
  connectPort?: number;
  waitForDesktop?: Promise<PcReceiveReady>;
  stopDesktopWait?: () => void;
};

export type SendProgress = {
  phase: "waiting" | "connecting" | "uploading" | "done" | "error";
  currentFile?: string;
  uploadedCount: number;
  totalCount: number;
  message?: string;
};

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 180000;
const UPLOAD_TIMEOUT_MS = 45000;
const STATUS_TIMEOUT_MS = 2500;

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36 FiloraMobile";

const REQUEST_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": USER_AGENT,
};

function randomToken(): string {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getCandidatePcHosts(): Promise<string[]> {
  const hosts = new Set<string>(["192.168.137.1", "192.168.43.1", "192.168.49.1"]);
  for (const localIp of await listLocalIpv4()) {
    const prefix = subnetPrefix(localIp);
    if (!prefix) {
      continue;
    }
    hosts.add(`${prefix}.1`);
    hosts.add(`${prefix}.254`);
  }
  return [...hosts];
}

/**
 * On a normal router the PC is rarely at x.x.x.1, so sweep the phone's own /24
 * to find whichever host is answering as Filora.
 */
async function scanSubnetForPc(token: string, signal: AbortSignal): Promise<PcReceiveReady | null> {
  const prefixes = new Set<string>();
  const localIps = await listLocalIpv4();
  for (const localIp of localIps) {
    const prefix = subnetPrefix(localIp);
    if (prefix) {
      prefixes.add(prefix);
    }
  }
  if (prefixes.size === 0) {
    ["192.168.43", "192.168.137", "192.168.49"].forEach((prefix) => prefixes.add(prefix));
  }

  const encoded = encodeURIComponent(token);
  const statusUrl = (host: string) =>
    `http://${host}:${DEFAULT_PORT}/api/send/${encoded}/status`;

  for (const prefix of prefixes) {
    const localHostsOnPrefix = new Set(
      localIps.filter((ip) => subnetPrefix(ip) === prefix).map((ip) => ip.split(".")[3]),
    );
    const targets: string[] = [];
    for (let host = 1; host <= 254; host += 1) {
      if (!localHostsOnPrefix.has(String(host))) {
        targets.push(`${prefix}.${host}`);
      }
    }

    const BATCH = 32;
    for (let i = 0; i < targets.length; i += BATCH) {
      if (signal.aborted) {
        return null;
      }
      const batch = targets.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((host) => fetchJsonStatus(statusUrl(host), 900)));
      const hit = results.find((item) => item);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

export function buildSendQrValue(
  token: string,
  fileCount: number,
  mobileIp?: string | null,
  port?: number,
): string {
  const params = new URLSearchParams({ v: "1", files: String(fileCount) });
  if (mobileIp) {
    params.set("ip", mobileIp);
  }
  if (port) {
    params.set("p", String(port));
  }
  return `filora://send/${token}?${params.toString()}`;
}

export async function createSendSession(files: SendFile[]): Promise<SendSession> {
  const token = randomToken();
  const localIps = await listLocalIpv4();
  const mobileIp = localIps[0] ?? null;
  let connectPort = PHONE_CONNECT_PORT;
  let waitForDesktop: Promise<PcReceiveReady> | undefined;
  let stopDesktopWait: (() => void) | undefined;
  try {
    const listener = await startDesktopConnectListener(token);
    connectPort = listener.port;
    waitForDesktop = listener.wait;
    stopDesktopWait = listener.stop;
  } catch {
    // Polling still works if the phone cannot listen.
  }
  return {
    token,
    files,
    mobileIp,
    connectPort,
    waitForDesktop,
    stopDesktopWait,
    qrValue: buildSendQrValue(token, files.length, mobileIp, connectPort),
  };
}

type StatusResponse = {
  status?: string;
  base_url?: string;
  baseUrl?: string;
  receive_token?: string;
  receiveToken?: string;
  upload_url?: string;
  uploadUrl?: string;
};

async function fetchJsonStatus(
  url: string,
  timeoutMs = STATUS_TIMEOUT_MS,
): Promise<PcReceiveReady | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: REQUEST_HEADERS,
    });
    clearTimeout(timer);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as StatusResponse;
    if (body.status !== "ready") {
      return null;
    }

    const baseUrl = (body.base_url || body.baseUrl || url.replace(/\/api\/.*$/, "")).replace(/\/$/, "");
    const receiveToken = body.receive_token || body.receiveToken;
    if (!receiveToken || !baseUrl) {
      return null;
    }
    return { baseUrl, receiveToken };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchSendStatus(host: string, port: number, token: string): Promise<PcReceiveReady | null> {
  const encoded = encodeURIComponent(token);
  const urls = [
    `http://${host}:${port}/api/send/${encoded}/status`,
    `http://${host}:${port}/api/send/ready`,
  ];
  for (const url of urls) {
    const ready = await fetchJsonStatus(url);
    if (ready) {
      return ready;
    }
  }
  return null;
}

async function findPcReceive(
  token: string,
  signal: AbortSignal,
  scanSubnet = false,
): Promise<PcReceiveReady | null> {
  const hosts = await getCandidatePcHosts();
  const found = await Promise.all(hosts.map((host) => fetchSendStatus(host, DEFAULT_PORT, token)));
  const ready = found.find((item) => item);
  if (ready) {
    return ready;
  }
  if (scanSubnet) {
    return scanSubnetForPc(token, signal);
  }
  return null;
}

/** Updates the UI once the desktop has scanned and claimed this send session. */
export async function watchDesktopScan(
  session: SendSession,
  signal: AbortSignal,
  onScanned: () => void,
): Promise<void> {
  let round = 0;
  while (!signal.aborted) {
    const ready = await findPcReceive(session.token, signal, round % 2 === 1);
    if (ready) {
      onScanned();
      return;
    }
    round += 1;
    if (round % 2 === 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

export async function waitForPcReceive(
  session: SendSession,
  signal: AbortSignal,
  onTick?: () => void,
  onScanned?: () => void,
): Promise<PcReceiveReady> {
  const token = session.token;
  const started = Date.now();

  // Phone-as-hotspot cannot receive the desktop callback; polling is the reliable path.
  session.stopDesktopWait?.();

  let round = 0;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    if (signal.aborted) {
      throw new Error(t("sendErr.cancelled"));
    }

    const ready = await findPcReceive(token, signal, round % 2 === 1);
    if (ready) {
      onScanned?.();
      return ready;
    }

    round += 1;
    onTick?.();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(t("sendErr.noResponse"));
}

async function uploadViaFetch(url: string, file: SendFile, signal: AbortSignal): Promise<void> {
  const body = new FormData();
  body.append(
    "file",
    {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || guessMimeType(file.name),
    } as unknown as Blob,
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body,
    signal,
  });

  if (response.ok) {
    return;
  }

  let detail = "";
  try {
    const json = (await response.json()) as { detail?: string; message?: string };
    detail = json.detail || json.message || "";
  } catch {
    // Ignore parse errors.
  }
  throw new Error(detail || t("sendErr.uploadFailedStatus", { status: response.status }));
}

async function uploadViaLegacy(url: string, file: SendFile): Promise<void> {
  const result = await LegacyFileSystem.uploadAsync(url, file.uri, {
    httpMethod: "POST",
    uploadType: LegacyFileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: file.mimeType || guessMimeType(file.name),
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(t("sendErr.uploadFailedStatus", { status: result.status }));
  }
}

async function uploadViaTask(url: string, uploadFile: File, file: SendFile, signal: AbortSignal): Promise<void> {
  const task = new UploadTask(uploadFile, url, {
    httpMethod: "POST",
    uploadType: UploadType.MULTIPART,
    fieldName: "file",
    mimeType: file.mimeType || guessMimeType(file.name),
    headers: REQUEST_HEADERS as Record<string, string>,
    signal,
  });
  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    throw new Error(t("sendErr.uploadFailedStatus", { status: result.status }));
  }
}

async function uploadOneFile(
  baseUrl: string,
  receiveToken: string,
  sendToken: string,
  file: SendFile,
  signal?: AbortSignal,
): Promise<void> {
  const uploadFile = new File(file.uri);
  if (!uploadFile.exists) {
    throw new Error(t("sendErr.couldNotRead", { name: file.name }));
  }

  const urls = [
    `${baseUrl}/api/r/${encodeURIComponent(receiveToken)}/upload`,
    `${baseUrl}/api/send/${encodeURIComponent(sendToken)}/upload`,
    `${baseUrl}/r/${encodeURIComponent(receiveToken)}/upload`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    const abortOnSignal = () => controller.abort();
    signal?.addEventListener("abort", abortOnSignal, { once: true });

    const attempts = [
      () => uploadViaFetch(url, file, controller.signal),
      () => uploadViaLegacy(url, file),
      () => uploadViaTask(url, uploadFile, file, controller.signal),
    ];

    try {
      for (const attempt of attempts) {
        try {
          await attempt();
          clearTimeout(timer);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(t("sendErr.uploadFailed"));
        }
        try {
          await withLocalWifiRoute(url, attempt);
          clearTimeout(timer);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(t("sendErr.uploadFailed"));
        }
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortOnSignal);
    }
  }

  throw lastError || new Error(t("sendErr.couldNotUpload", { name: file.name }));
}

function guessMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    pdf: "application/pdf",
    txt: "text/plain",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    zip: "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

export async function uploadFilesToPc(
  session: SendSession,
  receive: PcReceiveReady,
  onProgress?: (progress: SendProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const total = session.files.length;
  onProgress?.({ phase: "uploading", uploadedCount: 0, totalCount: total });
  const baseUrls = [receive.baseUrl, ...(receive.extraBaseUrls || [])].filter(Boolean);

  for (let i = 0; i < session.files.length; i += 1) {
    if (signal?.aborted) {
      throw new Error(t("sendErr.cancelled"));
    }
    const file = session.files[i];
    onProgress?.({
      phase: "uploading",
      currentFile: file.name,
      uploadedCount: i,
      totalCount: total,
    });
    let uploaded = false;
    let lastError: Error | null = null;
    for (const baseUrl of baseUrls) {
      try {
        await uploadOneFile(baseUrl, receive.receiveToken, session.token, file, signal);
        uploaded = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(t("sendErr.uploadFailed"));
      }
    }
    if (!uploaded) {
      throw lastError || new Error(t("sendErr.couldNotUpload", { name: file.name }));
    }
  }

  onProgress?.({ phase: "done", uploadedCount: total, totalCount: total });
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
