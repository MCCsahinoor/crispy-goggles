import { Directory, File, FileMode, Paths, type FileHandle } from "expo-file-system";
import TcpSocket from "react-native-tcp-socket";

import { copyToPublicFiloraFolder } from "../../../../services/device/saveDownload";
import {
  APPROVAL_TIMEOUT_MS,
  MAX_JSON_BYTES,
  PHONE_PORTS,
  SessionTracker,
  createPairingPayload,
  pairingCode,
  parseTransferRequest,
  sanitizeFileName,
  tokensMatch,
  type PairingPayload,
  type TransferRequest,
} from "./protocol";

export type ReceiverFileResult = {
  fileId: string;
  name: string;
  ok: boolean;
  savedName?: string;
};

export type ReceiverController = {
  payload: PairingPayload;
  code: string;
  accept: () => void;
  reject: () => void;
  cancel: () => void;
  stop: () => void;
};

type ReceiverEvents = {
  onRequest: (request: TransferRequest) => void;
  onProgress: (update: { fileId: string; transferred: number; total: number }) => void;
  onFileResult: (result: ReceiverFileResult) => void;
  onComplete: (summary: { ok: number; failed: number }) => void;
  onError: (code: "listen" | "failed" | "cancelled") => void;
};

type HeaderMap = Record<string, string>;

type Connection = {
  header: Uint8Array;
  parsed: boolean;
  contentLength: number;
  received: number;
  method: string;
  path: string;
  headers: HeaderMap;
  json: Uint8Array;
  handle: FileHandle | null;
  file: File | null;
  fileId: string;
  settled: boolean;
};

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === "string") {
    const bytes = new Uint8Array(data.length);
    for (let index = 0; index < data.length; index += 1) {
      bytes[index] = data.charCodeAt(index) & 0xff;
    }
    return bytes;
  }
  if (data && typeof data === "object" && "buffer" in data) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array();
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) {
    return right;
  }
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function headerEnd(bytes: Uint8Array): number {
  for (let index = 0; index < bytes.length - 3; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}

function decodeAscii(bytes: Uint8Array): string {
  let text = "";
  for (const value of bytes) {
    text += String.fromCharCode(value);
  }
  return text;
}

/** UTF-8 decode for JSON bodies, which carry names and emoji; a bad sequence becomes U+FFFD. */
function decodeUtf8(bytes: Uint8Array): string {
  let text = "";
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index] ?? 0;
    if (lead < 0x80) {
      text += String.fromCharCode(lead);
      index += 1;
      continue;
    }
    let code = 0;
    let extra = 0;
    if ((lead & 0xe0) === 0xc0) {
      code = lead & 0x1f;
      extra = 1;
    } else if ((lead & 0xf0) === 0xe0) {
      code = lead & 0x0f;
      extra = 2;
    } else if ((lead & 0xf8) === 0xf0) {
      code = lead & 0x07;
      extra = 3;
    } else {
      text += "�";
      index += 1;
      continue;
    }
    let valid = index + extra < bytes.length;
    for (let offset = 1; valid && offset <= extra; offset += 1) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) {
        valid = false;
      } else {
        code = (code << 6) | (next & 0x3f);
      }
    }
    if (!valid || code > 0x10ffff) {
      text += "�";
      index += 1;
      continue;
    }
    text += String.fromCodePoint(code);
    index += extra + 1;
  }
  return text;
}

/** Byte length of a string once written as UTF-8: what Content-Length must say. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function parseHeaders(raw: string): { method: string; path: string; headers: HeaderMap } | null {
  const lines = raw.split("\r\n");
  const [method = "", path = ""] = (lines[0] ?? "").split(" ");
  if (!method || !path) {
    return null;
  }
  const headers: HeaderMap = {};
  for (const line of lines.slice(1)) {
    const splitAt = line.indexOf(":");
    if (splitAt > 0) {
      headers[line.slice(0, splitAt).trim().toLowerCase()] = line.slice(splitAt + 1).trim();
    }
  }
  return { method, path: path.split("?")[0] ?? path, headers };
}

function httpResponse(status: number, body: string): string {
  const reason = status === 200 ? "OK" : status === 403 ? "Forbidden" : "Error";
  return (
    `HTTP/1.1 ${status} ${reason}\r\n` +
    "Content-Type: application/json; charset=utf-8\r\n" +
    `Content-Length: ${utf8Length(body)}\r\n` +
    "Connection: close\r\n\r\n" +
    body
  );
}

function writeResponse(socket: { write: Function; end: Function }, status: number, body: unknown): void {
  try {
    socket.write(httpResponse(status, JSON.stringify(body)));
    socket.end();
  } catch {
    try {
      socket.end();
    } catch {
      // The peer already went away.
    }
  }
}

function discard(handle: FileHandle | null, file: File | null): void {
  try {
    handle?.close();
  } catch {
    // Already closed.
  }
  try {
    if (file?.exists) {
      file.delete();
    }
  } catch {
    // The partial file is already gone.
  }
}

function filoraFolder(): Directory {
  const folder = new Directory(Paths.document, "Filora");
  if (!folder.exists) {
    folder.create({ intermediates: true, idempotent: true });
  }
  return folder;
}

function cacheFolder(): Directory {
  const folder = new Directory(Paths.cache, "filora-phone");
  if (!folder.exists) {
    folder.create({ intermediates: true, idempotent: true });
  }
  return folder;
}

function publishFile(temp: File, displayName: string): string {
  const folder = filoraFolder();
  let name = sanitizeFileName(displayName);
  let suffix = 1;
  while (new File(folder, name).exists) {
    const dot = sanitizeFileName(displayName).lastIndexOf(".");
    const stem = dot > 0 ? sanitizeFileName(displayName).slice(0, dot) : sanitizeFileName(displayName);
    const ext = dot > 0 ? sanitizeFileName(displayName).slice(dot) : "";
    name = `${stem} (${suffix})${ext}`.slice(0, 120);
    suffix += 1;
  }
  temp.move(folder);
  if (temp.name !== name) {
    temp.rename(name);
  }
  // Same fallback chain as a "Connect to PC" download: direct write first, then a
  // remembered or freshly granted SAF folder. Fire-and-forget — the sandboxed copy above
  // already succeeded, so this never blocks the response back to the sender.
  void copyToPublicFiloraFolder(temp.uri, name).catch(() => undefined);
  return name;
}

async function listen(port: number, onSocket: (socket: { on: Function; write: Function; end: Function; destroy: Function }) => void) {
  return new Promise<ReturnType<typeof TcpSocket.createServer>>((resolve, reject) => {
    const server = TcpSocket.createServer((socket) => {
      onSocket(socket);
    });
    const fail = (error: Error) => {
      server.removeAllListeners();
      reject(error);
    };
    server.once("error", fail);
    server.listen({ port, host: "0.0.0.0", reuseAddress: true }, () => {
      server.removeListener("error", fail);
      resolve(server);
    });
  });
}

/** How this phone introduces itself to senders that ask (`/filora/phone/info`). */
export type ReceiverIdentity = { name: string; emoji?: string };

export async function startPhoneReceiver(
  host: string,
  events: ReceiverEvents,
  identity: ReceiverIdentity = { name: "" },
): Promise<ReceiverController> {
  const session = new SessionTracker();
  session.move("preparing");

  let payload: PairingPayload | null = null;
  let server: ReturnType<typeof TcpSocket.createServer> | null = null;
  let listenError: Error | null = null;
  let stopped = false;
  let approved: TransferRequest | null = null;
  let pending: {
    request: TransferRequest;
    resolve: (accepted: boolean) => void;
  } | null = null;
  /** The in-flight accept/decline decision, so a repeated hello waits on it instead of failing. */
  let decision: Promise<boolean> | null = null;
  let results = new Map<string, boolean>();
  /** Bytes actually written to disk per file, so the sender can poll real progress instead of its own upload buffer. */
  const fileProgress = new Map<string, { received: number; total: number }>();

  const sameFiles = (a: TransferRequest, b: TransferRequest): boolean =>
    a.files.length === b.files.length && a.files.every((file, index) => file.id === b.files[index]?.id);
  let activeFile: File | null = null;
  let activeHandle: FileHandle | null = null;
  let completedNotified = false;

  const notifyComplete = () => {
    if (!approved || completedNotified || stopped || results.size < approved.files.length) {
      return;
    }
    completedNotified = true;
    let ok = 0;
    let failed = 0;
    for (const success of results.values()) {
      if (success) {
        ok += 1;
      } else {
        failed += 1;
      }
    }
    try {
      session.move("verifying");
      session.move(failed > 0 ? "partial-failure" : "completed");
      session.move("closing");
    } catch {
      // The session was already cancelled.
    }
    events.onComplete({ ok, failed });
  };

  const finish = (code: "failed" | "cancelled") => {
    if (stopped) {
      return;
    }
    stopped = true;
    pending?.resolve(false);
    pending = null;
    discard(activeHandle, activeFile);
    activeHandle = null;
    activeFile = null;
    try {
      if (session.phase !== "idle" && session.phase !== "closing") {
        session.move(code);
        session.move("closing");
      }
    } catch {
      // Ignore an already terminal session.
    }
    try {
      server?.close();
    } catch {
      // Ignore.
    }
    events.onError(code);
  };

  const onSocket = (socket: { on: Function; write: Function; end: Function; destroy: Function }) => {
    const connection: Connection = {
      header: new Uint8Array(),
      parsed: false,
      contentLength: 0,
      received: 0,
      method: "",
      path: "",
      headers: {},
      json: new Uint8Array(),
      handle: null,
      file: null,
      fileId: "",
      settled: false,
    };
    let lastProgress = 0;

    const failSocket = (status: number) => {
      connection.settled = true;
      discard(connection.handle, connection.file);
      connection.handle = null;
      connection.file = null;
      if (connection.fileId && approved && !results.has(connection.fileId)) {
        const manifest = approved.files.find((file) => file.id === connection.fileId);
        results.set(connection.fileId, false);
        events.onFileResult({ fileId: connection.fileId, name: manifest?.name ?? "file", ok: false });
        notifyComplete();
      }
      writeResponse(socket, status, { ok: false });
    };

    const finishPut = () => {
      const manifest = approved?.files.find((file) => file.id === connection.fileId);
      const temp = connection.file;
      try {
        connection.handle?.close();
      } catch {
        failSocket(500);
        return;
      }
      connection.handle = null;
      activeHandle = null;
      fileProgress.set(connection.fileId, { received: connection.received, total: connection.contentLength });
      if (!manifest || !temp?.exists || temp.size !== manifest.size) {
        discard(null, temp);
        activeFile = null;
        results.set(connection.fileId, false);
        events.onFileResult({ fileId: connection.fileId, name: manifest?.name ?? "file", ok: false });
        writeResponse(socket, 409, { ok: false });
        notifyComplete();
        return;
      }
      if (manifest.md5 && temp.md5?.toLowerCase() !== manifest.md5) {
        discard(null, temp);
        activeFile = null;
        results.set(connection.fileId, false);
        events.onFileResult({ fileId: connection.fileId, name: manifest.name, ok: false });
        writeResponse(socket, 409, { ok: false });
        notifyComplete();
        return;
      }
      try {
        const savedName = publishFile(temp, manifest.name);
        activeFile = null;
        results.set(connection.fileId, true);
        events.onFileResult({ fileId: connection.fileId, name: manifest.name, ok: true, savedName });
        writeResponse(socket, 200, { ok: true });
      } catch {
        discard(null, temp);
        activeFile = null;
        results.set(connection.fileId, false);
        events.onFileResult({ fileId: connection.fileId, name: manifest.name, ok: false });
        writeResponse(socket, 500, { ok: false });
      }
      notifyComplete();
    };

    const finishJson = async () => {
      const route = connection.path;
      if (connection.method === "GET" && route === "/filora/phone/ping") {
        writeResponse(socket, 200, { ok: true });
        return;
      }
      if (connection.method === "GET" && route === "/filora/phone/info") {
        // A sender that joined this phone's Wi-Fi Direct group from a scan has no pairing record
        // yet. This hands it the same fields the nearby broadcast carries; approval still gates.
        if (!payload || stopped) {
          writeResponse(socket, 409, { ok: false });
          return;
        }
        writeResponse(socket, 200, { ok: true, name: identity.name.slice(0, 40), emoji: identity.emoji ?? "", ...payload });
        return;
      }
      if (connection.method === "GET" && route === "/filora/phone/progress") {
        if (!payload || stopped) {
          writeResponse(socket, 409, { ok: false });
          return;
        }
        const token = connection.headers["x-filora-token"] ?? "";
        const sid = connection.headers["x-filora-sid"] ?? "";
        const fileId = connection.headers["x-file-id"] ?? "";
        if (sid !== payload.sid || !tokensMatch(token, payload.token)) {
          writeResponse(socket, 401, { ok: false });
          return;
        }
        // The PUT's own response can be lost to a brief Wi-Fi drop even after every byte landed
        // and passed verification. Once this phone has a final verdict, hand it over so the
        // sender can reconcile a broken upload connection against what actually arrived.
        if (results.has(fileId)) {
          const success = results.get(fileId) === true;
          const manifest = approved?.files.find((file) => file.id === fileId);
          writeResponse(socket, 200, {
            ok: true,
            done: true,
            success,
            received: success ? (manifest?.size ?? 0) : 0,
            total: manifest?.size ?? 0,
          });
          return;
        }
        const progress = fileProgress.get(fileId);
        if (!progress) {
          // Not started yet (or unknown id): the sender's own send-buffer progress is the best
          // guess until this phone has actually written a first byte.
          writeResponse(socket, 200, { ok: true, done: false, received: 0, total: 0 });
          return;
        }
        writeResponse(socket, 200, { ok: true, done: false, received: progress.received, total: progress.total });
        return;
      }
      if (connection.method === "GET" && route === "/filora/phone/state") {
        // Lets a sender tell "my hello never arrived" from "the person has not tapped Accept yet".
        if (!payload || stopped) {
          writeResponse(socket, 409, { ok: false });
          return;
        }
        const token = connection.headers["x-filora-token"] ?? "";
        const sid = connection.headers["x-filora-sid"] ?? "";
        if (sid !== payload.sid || !tokensMatch(token, payload.token)) {
          writeResponse(socket, 401, { ok: false });
          return;
        }
        writeResponse(socket, 200, { ok: true, pending: pending !== null, approved: approved !== null });
        return;
      }
      if (connection.method !== "POST" || route !== "/filora/phone/hello") {
        writeResponse(socket, 404, { ok: false });
        return;
      }
      if (!payload || stopped) {
        writeResponse(socket, 409, { ok: false });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(decodeUtf8(connection.json));
      } catch {
        writeResponse(socket, 400, { ok: false });
        return;
      }
      const record = parsed as { sid?: string; token?: string };
      if (record.sid !== payload.sid || !tokensMatch(String(record.token ?? ""), payload.token)) {
        writeResponse(socket, 401, { ok: false });
        return;
      }
      if (payload.exp * 1000 <= Date.now()) {
        writeResponse(socket, 410, { ok: false });
        return;
      }
      const request = parseTransferRequest(parsed);
      if (!request) {
        writeResponse(socket, 400, { ok: false });
        return;
      }
      // The sender retries hello when its first socket drops (route change, slow link, large
      // batch). Same session, same files: hand it the decision already made or in progress
      // instead of a 409 that would throw away an accepted transfer.
      if (approved) {
        const same = sameFiles(approved, request);
        writeResponse(socket, same ? 200 : 409, { ok: same });
        return;
      }
      if (pending && decision) {
        if (!sameFiles(pending.request, request)) {
          writeResponse(socket, 409, { ok: false });
          return;
        }
        const repeated = await decision;
        if (stopped) {
          return;
        }
        writeResponse(socket, repeated ? 200 : 403, { ok: repeated });
        return;
      }
      try {
        session.move("authenticating");
        session.move("waiting-approval");
      } catch {
        writeResponse(socket, 409, { ok: false });
        return;
      }
      let declineReason: "user" | "timeout" | null = null;
      decision = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          declineReason = "timeout";
          resolve(false);
        }, APPROVAL_TIMEOUT_MS);
        pending = {
          request,
          resolve: (value) => {
            clearTimeout(timer);
            declineReason = value ? null : "user";
            resolve(value);
          },
        };
        events.onRequest(request);
      });
      const accepted = await decision;
      pending = null;
      if (stopped) {
        return;
      }
      if (!accepted) {
        decision = null;
        if (declineReason === "timeout") {
          events.onError("failed");
        }
        try {
          session.move("cancelled");
          session.move("closing");
          session.move("idle");
          session.move("preparing");
          session.move("advertising");
        } catch {
          // Restart advertising after a decline.
        }
        writeResponse(socket, 403, { ok: false });
        return;
      }
      approved = request;
      results = new Map();
      try {
        session.move("ready");
        session.move("transferring");
      } catch {
        writeResponse(socket, 409, { ok: false });
        return;
      }
      writeResponse(socket, 200, { ok: true });
    };

    const openPut = () => {
      if (!payload || !approved) {
        failSocket(403);
        return;
      }
      const token = connection.headers["x-filora-token"] ?? "";
      const sid = connection.headers["x-filora-sid"] ?? "";
      const fileId = connection.headers["x-file-id"] ?? "";
      if (sid !== payload.sid || !tokensMatch(token, payload.token)) {
        failSocket(401);
        return;
      }
      const manifest = approved.files.find((file) => file.id === fileId);
      if (!manifest || connection.contentLength !== manifest.size || results.has(fileId)) {
        failSocket(400);
        return;
      }
      try {
        const temp = new File(cacheFolder(), `${fileId}.part`);
        connection.fileId = fileId;
        if (temp.exists) {
          temp.delete();
        }
        temp.create();
        connection.file = temp;
        connection.handle = temp.open(FileMode.WriteOnly);
        activeFile = temp;
        activeHandle = connection.handle;
        fileProgress.set(fileId, { received: 0, total: manifest.size });
      } catch {
        failSocket(500);
      }
    };

    const consumeBody = (chunk: Uint8Array) => {
      if (connection.settled) {
        return;
      }
      const needed = connection.contentLength - connection.received;
      const slice = chunk.length > needed ? chunk.subarray(0, needed) : chunk;
      connection.received += slice.length;
      if (connection.method === "PUT") {
        try {
          if (slice.length > 0) {
            connection.handle?.writeBytes(slice);
          }
        } catch {
          failSocket(500);
          return;
        }
        fileProgress.set(connection.fileId, { received: connection.received, total: connection.contentLength });
        const now = Date.now();
        if (connection.received >= connection.contentLength || now - lastProgress > 100) {
          lastProgress = now;
          events.onProgress({
            fileId: connection.fileId,
            transferred: connection.received,
            total: connection.contentLength,
          });
        }
        if (connection.received >= connection.contentLength) {
          connection.settled = true;
          finishPut();
        }
        return;
      }
      connection.json = concat(connection.json, slice);
      if (connection.json.length > MAX_JSON_BYTES) {
        failSocket(413);
        return;
      }
      if (connection.received >= connection.contentLength) {
        connection.settled = true;
        void finishJson();
      }
    };

    socket.on("data", (data: unknown) => {
      if (connection.settled || stopped) {
        return;
      }
      let chunk = toBytes(data);
      if (!connection.parsed) {
        connection.header = concat(connection.header, chunk);
        if (connection.header.length > 16 * 1024) {
          failSocket(431);
          return;
        }
        const end = headerEnd(connection.header);
        if (end < 0) {
          return;
        }
        const parsed = parseHeaders(decodeAscii(connection.header.subarray(0, end)));
        if (!parsed) {
          failSocket(400);
          return;
        }
        connection.parsed = true;
        connection.method = parsed.method;
        connection.path = parsed.path;
        connection.headers = parsed.headers;
        const length = Number(connection.headers["content-length"] ?? (parsed.method === "GET" ? "0" : ""));
        if (!Number.isInteger(length) || length < 0) {
          failSocket(411);
          return;
        }
        connection.contentLength = length;
        chunk = connection.header.subarray(end + 4);
        connection.header = new Uint8Array();
        if (parsed.method === "PUT" && parsed.path === "/filora/phone/file") {
          openPut();
          if (connection.settled) {
            return;
          }
        } else if (
          !(parsed.method === "POST" && parsed.path === "/filora/phone/hello") &&
          !(
            parsed.method === "GET" &&
            (parsed.path === "/filora/phone/ping" ||
              parsed.path === "/filora/phone/info" ||
              parsed.path === "/filora/phone/progress" ||
              parsed.path === "/filora/phone/state")
          )
        ) {
          failSocket(404);
          return;
        }
      }
      consumeBody(chunk);
      if (!connection.settled && connection.parsed && connection.received >= connection.contentLength && connection.method !== "PUT") {
        connection.settled = true;
        void finishJson();
      }
    });

    socket.on("error", () => {
      discard(connection.handle, connection.file);
      if (connection.fileId && approved && !results.has(connection.fileId)) {
        results.set(connection.fileId, false);
        events.onFileResult({ fileId: connection.fileId, name: "file", ok: false });
        notifyComplete();
      }
      try {
        socket.destroy();
      } catch {
        // Ignore.
      }
    });
  };

  for (const port of PHONE_PORTS) {
    try {
      server = await listen(port, onSocket);
      payload = createPairingPayload(host, port);
      listenError = null;
      break;
    } catch (error) {
      listenError = error instanceof Error ? error : new Error("listen");
    }
  }

  if (!server || !payload) {
    events.onError("listen");
    throw listenError ?? new Error("listen");
  }
  session.move("advertising");
  const activePayload = payload;

  return {
    payload: activePayload,
    code: pairingCode(activePayload),
    accept: () => pending?.resolve(true),
    reject: () => pending?.resolve(false),
    cancel: () => finish("cancelled"),
    stop: () => {
      stopped = true;
      pending?.resolve(false);
      pending = null;
      discard(activeHandle, activeFile);
      try {
        server?.close();
      } catch {
        // Ignore.
      }
    },
  };
}
