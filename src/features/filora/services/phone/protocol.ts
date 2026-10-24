/**
 * Phone-to-phone pairing and session rules.
 *
 * Transport is local HTTP over the same Wi-Fi, a local hotspot, or Wi-Fi Direct.
 * The pairing token only identifies the session. The channel is not encrypted.
 */

export const PHONE_PROTOCOL_VERSION = 1;
export const PHONE_PORTS = [43821, 43822, 43823, 43824] as const;
export const PAIRING_TTL_SEC = 10 * 60;
export const APPROVAL_TIMEOUT_MS = 120_000;
export const MAX_FILES = 1000;
/** Only the JSON handshake is bounded; file bodies stream to disk and have no size cap. */
export const MAX_JSON_BYTES = 256 * 1024;

export type SessionPhase =
  | "idle"
  | "preparing"
  | "advertising"
  | "discovering"
  | "connecting"
  | "authenticating"
  | "waiting-approval"
  | "ready"
  | "transferring"
  | "verifying"
  | "completed"
  | "partial-failure"
  | "failed"
  | "cancelled"
  | "closing";

export type PairingPayload = {
  v: number;
  sid: string;
  host: string;
  port: number;
  token: string;
  exp: number;
  transport?: "hotspot" | "direct" | "lan";
  ssid?: string;
  password?: string;
  deviceAddress?: string;
};

export type ManifestFile = {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  md5?: string;
};

export type TransferRequest = {
  senderName: string;
  /** The sender's profile emoji, shown next to the name on the receiving phone. */
  senderEmoji?: string;
  files: ManifestFile[];
};

/**
 * Keep a peer-supplied emoji to a few printable code points. It is only ever rendered as text,
 * so this guards layout (no walls of glyphs), not security.
 */
export function sanitizeEmoji(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16 || /[\u0000-\u001f\u007f]/.test(trimmed) || Array.from(trimmed).length > 6) {
    return undefined;
  }
  return trimmed;
}

const OPEN_PHASES = new Set<SessionPhase>([
  "preparing",
  "advertising",
  "discovering",
  "connecting",
  "authenticating",
  "waiting-approval",
  "ready",
  "transferring",
  "verifying",
]);

const NEXT: Record<SessionPhase, readonly SessionPhase[]> = {
  idle: ["preparing"],
  preparing: ["advertising", "discovering"],
  advertising: ["authenticating", "connecting"],
  discovering: ["connecting"],
  connecting: ["authenticating"],
  authenticating: ["waiting-approval"],
  "waiting-approval": ["ready"],
  ready: ["transferring"],
  transferring: ["verifying"],
  verifying: ["completed", "partial-failure"],
  completed: [],
  "partial-failure": [],
  failed: [],
  cancelled: [],
  closing: ["idle"],
};

const TERMINAL = new Set<SessionPhase>(["completed", "partial-failure", "failed", "cancelled"]);

export function canTransition(from: SessionPhase, to: SessionPhase): boolean {
  if (from === to) {
    return true;
  }
  if ((to === "failed" || to === "cancelled") && OPEN_PHASES.has(from)) {
    return true;
  }
  if (to === "closing" && TERMINAL.has(from)) {
    return true;
  }
  return NEXT[from].includes(to);
}

export function transition(from: SessionPhase, to: SessionPhase): SessionPhase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session transition ${from} -> ${to}`);
  }
  return to;
}

export class SessionTracker {
  phase: SessionPhase = "idle";

  move(to: SessionPhase): SessionPhase {
    this.phase = transition(this.phase, to);
    return this.phase;
  }
}

function randomHex(byteLength: number): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random is not available on this device.");
  }
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function isIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

export function createPairingPayload(host: string, port: number, nowMs = Date.now()): PairingPayload {
  if (!isIpv4(host)) {
    throw new Error("A local IPv4 address is required.");
  }
  return {
    v: PHONE_PROTOCOL_VERSION,
    sid: randomHex(8),
    host,
    port,
    token: randomHex(16),
    exp: Math.floor(nowMs / 1000) + PAIRING_TTL_SEC,
  };
}

export function pairingCode(payload: Pick<PairingPayload, "sid" | "token" | "exp">): string {
  return `${payload.sid}.${payload.token}.${payload.exp}`;
}

export function encodePairingQr(payload: PairingPayload): string {
  return JSON.stringify(payload);
}

export function tokensMatch(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function isPairingFresh(payload: PairingPayload, nowMs = Date.now()): boolean {
  return Number.isFinite(payload.exp) && payload.exp * 1000 > nowMs;
}

export function parsePairingQr(raw: string): PairingPayload | null {
  try {
    const json = JSON.parse(raw) as Partial<PairingPayload>;
    return normalizePairing(json);
  } catch {
    return null;
  }
}

export function parsePairingCode(code: string, host: string, port: number): PairingPayload | null {
  const parts = code.trim().split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [sid, token, expText] = parts;
  return normalizePairing({
    v: PHONE_PROTOCOL_VERSION,
    sid,
    token,
    exp: Number(expText),
    host: host.trim(),
    port,
  });
}

function normalizePairing(value: Partial<PairingPayload>): PairingPayload | null {
  const host = String(value.host ?? "").trim();
  const port = Number(value.port);
  const sid = String(value.sid ?? "").trim().toLowerCase();
  const token = String(value.token ?? "").trim().toLowerCase();
  const exp = Number(value.exp);
  if (value.v !== PHONE_PROTOCOL_VERSION) {
    return null;
  }
  if (!isIpv4(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  if (!/^[0-9a-f]{16}$/.test(sid) || !/^[0-9a-f]{32}$/.test(token)) {
    return null;
  }
  if (!Number.isFinite(exp)) {
    return null;
  }
  const payload: PairingPayload = { v: PHONE_PROTOCOL_VERSION, sid, host, port, token, exp };
  if (value.transport === "hotspot" || value.transport === "direct" || value.transport === "lan") {
    payload.transport = value.transport;
  }
  const ssid = typeof value.ssid === "string" ? value.ssid.trim() : "";
  if (ssid.length >= 1 && ssid.length <= 32 && !/[\u0000-\u001f]/.test(ssid)) {
    payload.ssid = ssid;
  }
  const password = typeof value.password === "string" ? value.password : "";
  if (password.length >= 8 && password.length <= 63 && !/[\u0000-\u001f]/.test(password)) {
    payload.password = password;
  }
  const deviceAddress = typeof value.deviceAddress === "string" ? value.deviceAddress.trim().toLowerCase() : "";
  if (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(deviceAddress)) {
    payload.deviceAddress = deviceAddress;
  }
  return payload;
}

/**
 * Wi-Fi Direct groups show up in a Wi-Fi scan under their network name. A receiver names its
 * group `DIRECT-FL-<name>-<link id>` so a sender can recognise it without a QR code. The group
 * passphrase is derived from the name (see localLink), so anyone nearby can join; the receiver
 * still approves every transfer on screen, exactly as with the broadcast pairing record.
 */
export const DIRECT_NETWORK_PREFIX = "DIRECT-FL-";
const DIRECT_NAME_MAX = 17;
const DIRECT_NETWORK = /^DIRECT-FL-([A-Za-z0-9]{1,17})-([0-9a-f]{4})$/;

export type DirectNetwork = { ssid: string; name: string; linkId: string };

export function directNetworkName(deviceName: string, linkId: string): string {
  const name = deviceName.replace(/[^A-Za-z0-9]/g, "").slice(0, DIRECT_NAME_MAX) || "Phone";
  return `${DIRECT_NETWORK_PREFIX}${name}-${linkId}`;
}

export function parseDirectNetworkName(ssid: string): DirectNetwork | null {
  const match = DIRECT_NETWORK.exec(ssid.replace(/^"|"$/g, "").trim());
  if (!match) {
    return null;
  }
  return { ssid: match[0], name: match[1] ?? "", linkId: match[2] ?? "" };
}

export function randomLinkId(): string {
  return randomHex(2);
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  const limited = cleaned.slice(0, 120);
  return limited || "file";
}

function uniqueName(name: string, used: Set<string>): string {
  const safe = sanitizeFileName(name);
  if (!used.has(safe.toLowerCase())) {
    used.add(safe.toLowerCase());
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let index = 1;
  let candidate = "";
  do {
    candidate = `${stem} (${index})${ext}`.slice(0, 120);
    index += 1;
  } while (used.has(candidate.toLowerCase()));
  used.add(candidate.toLowerCase());
  return candidate;
}

export function parseTransferRequest(body: unknown): TransferRequest | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as {
    v?: unknown;
    senderName?: unknown;
    senderEmoji?: unknown;
    files?: unknown;
  };
  if (record.v !== PHONE_PROTOCOL_VERSION || !Array.isArray(record.files)) {
    return null;
  }
  if (record.files.length < 1 || record.files.length > MAX_FILES) {
    return null;
  }
  const senderName = sanitizeFileName(String(record.senderName ?? "Phone")).slice(0, 40);
  const senderEmoji = sanitizeEmoji(record.senderEmoji);
  const used = new Set<string>();
  const files: ManifestFile[] = [];
  for (const item of record.files) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const file = item as { id?: unknown; name?: unknown; size?: unknown; mimeType?: unknown; md5?: unknown };
    const id = String(file.id ?? "");
    const size = Number(file.size);
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id) || !Number.isSafeInteger(size) || size < 0) {
      return null;
    }
    const md5 = typeof file.md5 === "string" ? file.md5.trim().toLowerCase() : "";
    files.push({
      id,
      name: uniqueName(String(file.name ?? "file"), used),
      size,
      mimeType: typeof file.mimeType === "string" ? file.mimeType.slice(0, 120) : undefined,
      md5: /^[0-9a-f]{32}$/.test(md5) ? md5 : undefined,
    });
  }
  return senderEmoji ? { senderName, senderEmoji, files } : { senderName, files };
}

export function fileNameWithSuffix(fileName: string, index: number): string {
  const safe = sanitizeFileName(fileName);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  return `${stem} (${index})${ext}`.slice(0, 120);
}
