import { Platform } from "react-native";
import WifiManager from "react-native-wifi-reborn";

import { t } from "../i18n";

export type ConnectionMode = "global" | "local";

export type ShareConnection = {
  baseUrl: string;
  token: string;
  port: number;
};

export type SharedFile = {
  id: string;
  name: string;
  size: number;
  size_label: string;
};

export type SessionInfo = {
  token: string;
  password_required: boolean;
  file_count: number;
  share_mode?: ConnectionMode;
  pc_host?: string;
  port?: number;
};

export type WifiCredentials = {
  ssid: string;
  password: string;
  security: string;
};

/** Message shown when the PC can't be reached. `local` picks the local-network variant. */
export function getUnreachableMessage(local: boolean): string {
  return local ? t("net.unreachableLocal") : t("net.unreachableGlobal");
}

let localWifiRouteDepth = 0;

function urlNeedsLocalWifiRoute(url: string): boolean {
  if (Platform.OS !== "android") {
    return false;
  }
  try {
    return isPrivateHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function beginLocalWifiRoute(url: string): Promise<void> {
  if (!urlNeedsLocalWifiRoute(url)) {
    return;
  }
  localWifiRouteDepth += 1;
  if (localWifiRouteDepth > 1) {
    return;
  }
  try {
    await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
  } catch {
    // Best effort — request may still work if Wi-Fi is the active route.
  }
}

async function endLocalWifiRoute(url: string): Promise<void> {
  if (!urlNeedsLocalWifiRoute(url)) {
    return;
  }
  localWifiRouteDepth = Math.max(0, localWifiRouteDepth - 1);
  if (localWifiRouteDepth > 0) {
    return;
  }
  try {
    await WifiManager.forceWifiUsageWithOptions(false, { noInternet: true });
  } catch {
    // Ignore cleanup errors.
  }
}

export async function withLocalWifiRoute<T>(url: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!urlNeedsLocalWifiRoute(url)) {
      throw error;
    }
  }

  await beginLocalWifiRoute(url);
  try {
    return await fn();
  } finally {
    await endLocalWifiRoute(url);
  }
}

/** Keep traffic on Wi-Fi (needed on Android hotspot with no internet). */
export async function runOnLocalWifi<T>(fn: () => Promise<T>): Promise<T> {
  if (Platform.OS !== "android") {
    return fn();
  }
  const probe = "http://192.168.137.1/";
  await beginLocalWifiRoute(probe);
  try {
    return await fn();
  } finally {
    await endLocalWifiRoute(probe);
  }
}

export const DEFAULT_PORT = 8765;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const REQUEST_HEADERS: Record<string, string> = {
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36 FiloraMobile",
};

/** Desktop reads x-filora-auth. Older builds used x-filedrop-auth. */
export const SHARE_AUTH_HEADER = "X-Filora-Auth";
const SHARE_AUTH_HEADER_LEGACY = "X-FileDrop-Auth";

export function isPrivateHost(host: string): boolean {
  const hostname = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }

  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

export function isLocalConnection(connection: ShareConnection): boolean {
  try {
    const host = new URL(connection.baseUrl).hostname;
    return isPrivateHost(host);
  } catch {
    return false;
  }
}

export function parseWifiQr(raw: string): WifiCredentials | null {
  const trimmed = raw.trim().replace(/\r\n/g, "").replace(/\n/g, "");
  const upper = trimmed.toUpperCase();
  
  // Support both "WIFI:" and "wifi:" prefixes
  const wifiIndex = upper.indexOf("WIFI:");
  if (wifiIndex === -1) {
    return null;
  }

  // Extract the content after "WIFI:"
  const content = trimmed.slice(wifiIndex + 5);
  
  // Parse key:value pairs, handling escaped characters
  const fields: Record<string, string> = {};
  let current = "";
  let key = "";
  let inValue = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === "\\" && i + 1 < content.length) {
      // Escaped character - include the next char literally
      current += content[i + 1];
      i++;
    } else if (char === ":" && !inValue) {
      key = current.toUpperCase().trim();
      current = "";
      inValue = true;
    } else if (char === ";") {
      if (key) {
        fields[key] = current;
      }
      key = "";
      current = "";
      inValue = false;
    } else {
      current += char;
    }
  }
  // Handle last field if no trailing semicolon
  if (key) {
    fields[key] = current;
  }

  // Check for SSID - it's required
  const ssid = fields.S;
  if (ssid === undefined) {
    // Fallback: try plain text format "SSID password" or "SSID\npassword"
    const plainText = raw.trim();
    const parts = plainText.split(/[\s\n]+/);
    if (parts.length >= 2) {
      return {
        ssid: parts[0],
        password: parts.slice(1).join(" "),
        security: "WPA",
      };
    }
    return null;
  }

  return {
    ssid: ssid,
    password: fields.P || "",
    security: fields.T || "WPA",
  };
}

function extractUrlCandidate(raw: string): string | null {
  const trimmed = raw.trim().replace(/[<>"]/g, "");
  if (!trimmed) {
    return null;
  }

  const found = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (found) {
    return found[0].replace(/[.,);]+$/, "");
  }

  if (trimmed.startsWith("www.") || trimmed.includes("trycloudflare.com") || trimmed.includes("/s/")) {
    const withoutSlashes = trimmed.replace(/^\/+/, "");
    const hostPart = withoutSlashes.split("/")[0].split(":")[0];
    const scheme = isPrivateHost(hostPart) || hostPart === "localhost" ? "http" : "https";
    return `${scheme}://${withoutSlashes}`;
  }

  return trimmed;
}

export function parseShareUrl(raw: string): ShareConnection | null {
  const candidate = extractUrlCandidate(raw);
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    const match = url.pathname.match(/\/s\/([^/?#]+)/);
    if (!match) {
      return null;
    }

    const port = url.port
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : DEFAULT_PORT;
    return {
      baseUrl: `${url.protocol}//${url.host}`.replace(/\/$/, ""),
      token: decodeURIComponent(match[1]),
      port,
    };
  } catch {
    return null;
  }
}

export function parseLocalInputs(
  host: string,
  token: string,
  port: string,
): ShareConnection | null {
  const cleanedToken = token.trim();
  const cleanedHost = host
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
  const parsedPort = port.trim() ? Number(port.trim()) : DEFAULT_PORT;

  if (!cleanedHost || !cleanedToken || Number.isNaN(parsedPort)) {
    return null;
  }

  return {
    baseUrl: `http://${cleanedHost}:${parsedPort}`,
    token: cleanedToken,
    port: parsedPort,
  };
}

export function authHeaders(authToken?: string | null): Record<string, string> {
  if (!authToken) {
    return { ...REQUEST_HEADERS };
  }
  return {
    ...REQUEST_HEADERS,
    [SHARE_AUTH_HEADER]: authToken,
    [SHARE_AUTH_HEADER_LEGACY]: authToken,
  };
}

async function requestOnce(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...REQUEST_HEADERS,
          ...(init.headers || {}),
        },
      });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(t("net.timeout"));
      } else {
        lastError = new Error(getUnreachableMessage(true));
      }

      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError || new Error(getUnreachableMessage(true));
}

async function request(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await requestOnce(url, init);
  } catch (error) {
    if (!urlNeedsLocalWifiRoute(url)) {
      throw error;
    }
  }

  await beginLocalWifiRoute(url);
  try {
    return await requestOnce(url, init);
  } finally {
    await endLocalWifiRoute(url);
  }
}

async function readBody(response: Response): Promise<{ json?: any; html?: string }> {
  const text = await response.text();
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const trimmed = text.trim();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { json: JSON.parse(trimmed) };
    } catch {
      // Fall through and treat as HTML.
    }
  }
  return { html: text };
}

function isCloudflareChallenge(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("just a moment") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("attention required") ||
    (lower.includes("cloudflare") && lower.includes("challenge"))
  );
}

function isFileDropHtml(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes("filedrop") || lower.includes("your downloads") || lower.includes("password required");
}

function htmlNeedsPassword(html: string): boolean {
  return html.toLowerCase().includes("password required");
}

function parseFilesFromHtml(html: string): SharedFile[] {
  const files: SharedFile[] = [];
  const pattern =
    /\/download\/([^"'/?#]+)["'][\s\S]*?file-name">\s*([^<]+)\s*<[\s\S]*?file-size">\s*([^<]+)\s*</gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    files.push({
      id: decodeURIComponent(match[1]),
      name: match[2].trim(),
      size: 0,
      size_label: match[3].trim(),
    });
  }
  return files;
}

function reachError(connection: ShareConnection, extra?: string): Error {
  const base = getUnreachableMessage(isLocalConnection(connection));
  return new Error(extra ? `${base} ${extra}` : base);
}

export async function fetchSessionInfo(
  connection: ShareConnection,
): Promise<SessionInfo> {
  const urls = [
    `${connection.baseUrl}/s/${connection.token}?format=json`,
    `${connection.baseUrl}/api/s/${connection.token}/info`,
    `${connection.baseUrl}/s/${connection.token}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await request(url);
      const body = await readBody(response);

      if (body.json) {
        if (response.status === 404) {
          lastError = reachError(connection, t("net.sessionNotFound"));
          continue;
        }
        return {
          token: body.json.token || connection.token,
          password_required: Boolean(body.json.password_required),
          file_count: Number(body.json.file_count ?? body.json.files?.length ?? 0),
          share_mode: body.json.share_mode,
          pc_host: body.json.pc_host,
          port: body.json.port,
        };
      }

      if (body.html) {
        if (isCloudflareChallenge(body.html)) {
          throw new Error(t("net.cloudflareBlocked"));
        }
        if (response.ok && isFileDropHtml(body.html)) {
          return {
            token: connection.token,
            password_required: htmlNeedsPassword(body.html),
            file_count: parseFilesFromHtml(body.html).length,
            share_mode: isLocalConnection(connection) ? "local" : "global",
          };
        }
      }

      lastError = reachError(connection, `HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : reachError(connection);
    }
  }

  throw lastError || reachError(connection);
}

export async function fetchFiles(
  connection: ShareConnection,
  authToken?: string | null,
): Promise<SharedFile[]> {
  const urls = [
    `${connection.baseUrl}/api/s/${connection.token}/files`,
    `${connection.baseUrl}/s/${connection.token}?format=json`,
    `${connection.baseUrl}/s/${connection.token}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await request(url, { headers: authHeaders(authToken) });
      const body = await readBody(response);

      if (response.status === 401) {
        throw new Error("PASSWORD_REQUIRED");
      }

      if (Array.isArray(body.json?.files)) {
        if (body.json.password_required === true && body.json.files.length === 0) {
          throw new Error("PASSWORD_REQUIRED");
        }
        return body.json.files;
      }

      if (body.json?.password_required === true) {
        throw new Error("PASSWORD_REQUIRED");
      }

      if (body.html) {
        if (htmlNeedsPassword(body.html)) {
          throw new Error("PASSWORD_REQUIRED");
        }
        if (isFileDropHtml(body.html)) {
          return parseFilesFromHtml(body.html);
        }
      }

      lastError = new Error(t("net.couldNotLoadFiles"));
    } catch (error) {
      if (error instanceof Error && error.message === "PASSWORD_REQUIRED") {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(t("net.couldNotLoadFiles"));
    }
  }

  throw lastError || new Error(t("net.couldNotLoadFiles"));
}

export async function unlockSession(
  connection: ShareConnection,
  password: string,
): Promise<string | null> {
  const cleaned = password.trim();
  if (!cleaned) {
    throw new Error(t("net.enterPassword"));
  }

  try {
    const jsonResponse = await request(`${connection.baseUrl}/api/s/${connection.token}/unlock`, {
      method: "POST",
      headers: {
        ...REQUEST_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: cleaned }),
    });
    const jsonBody = await readBody(jsonResponse);
    if (jsonResponse.status === 401) {
      throw new Error(t("net.wrongPassword"));
    }
    if (jsonBody.json?.ok || jsonBody.json?.auth_token) {
      return jsonBody.json.auth_token ?? null;
    }
  } catch (error) {
    if (error instanceof Error && error.message === t("net.wrongPassword")) {
      throw error;
    }
  }

  const form = new URLSearchParams({ password: cleaned });
  const response = await request(`${connection.baseUrl}/s/${connection.token}/unlock`, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const body = await readBody(response);
  if (response.status === 401 || (body.html && htmlNeedsPassword(body.html) && body.html.toLowerCase().includes("wrong"))) {
    throw new Error(t("net.wrongPassword"));
  }
  if (!response.ok && response.status !== 303) {
    throw new Error(t("net.couldNotUnlock"));
  }
  return null;
}

export function downloadUrl(
  connection: ShareConnection,
  fileId: string,
): string {
  return `${connection.baseUrl}/s/${connection.token}/download/${fileId}`;
}

export function validateModeForConnection(
  mode: ConnectionMode,
  connection: ShareConnection,
): string | null {
  const local = isLocalConnection(connection);
  if (mode === "local" && !local) {
    return t("net.modeGlobalLink");
  }
  if (mode === "global" && local) {
    return t("net.modeLocalLink");
  }
  return null;
}
