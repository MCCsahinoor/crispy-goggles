import { File, UploadType } from "expo-file-system";

import { withLocalWifiRoute } from "../lib/filedrop";
import {
  APPROVAL_TIMEOUT_MS,
  PHONE_PROTOCOL_VERSION,
  isPairingFresh,
  parseTransferRequest,
  type ManifestFile,
  type PairingPayload,
  type TransferRequest,
} from "./protocol";

export type OutgoingFile = {
  id: string;
  name: string;
  uri: string;
  size: number;
  mimeType?: string;
};

export type SendProgress = {
  fileId: string;
  transferred: number;
  total: number;
  failed?: boolean;
};

const HELLO_TIMEOUT_MS = APPROVAL_TIMEOUT_MS + 15_000;
/**
 * `File.md5` hashes synchronously on the JS thread, on both phones. Past a few tens of MB that
 * freezes the UI and the receiver's socket loop for seconds, so big files go without a checksum
 * (the receiver still checks the byte count).
 */
const MD5_MAX_BYTES = 32 * 1024 * 1024;

/** Carried across the route retry so a second attempt resumes instead of starting over. */
type SendState = {
  /** The receiver already said yes; saying hello again would be answered with a conflict. */
  accepted: boolean;
  /** Files already settled (stored or failed) on the receiver. */
  done: Set<string>;
  ok: number;
  failed: number;
};

async function fetchWithTimeout(url: string, body: string, signal: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HELLO_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** How this phone introduces itself to the receiver. */
export type SenderIdentity = { name: string; emoji?: string };

export async function sendFilesToPhone(
  payload: PairingPayload,
  sender: SenderIdentity,
  files: OutgoingFile[],
  onProgress: (progress: SendProgress) => void,
  signal: AbortSignal,
): Promise<{ ok: number; failed: number }> {
  if (!isPairingFresh(payload)) {
    throw new Error("expired");
  }
  // Hashed once, up front: the route retry below must not redo this for a large batch.
  const request = parseTransferRequest({
    v: PHONE_PROTOCOL_VERSION,
    senderName: sender.name,
    senderEmoji: sender.emoji,
    files: buildManifest(files),
  });
  if (!request) {
    throw new Error("invalid");
  }
  const state: SendState = { accepted: false, done: new Set(), ok: 0, failed: 0 };
  return withLocalWifiRoute(`http://${payload.host}:${payload.port}/`, () =>
    sendFilesOnBoundNetwork(payload, request, files, onProgress, signal, state),
  );
}

function buildManifest(files: OutgoingFile[]): ManifestFile[] {
  return files.map((file) => {
    let md5: string | undefined;
    try {
      const hash = file.size <= MD5_MAX_BYTES ? new File(file.uri).md5?.toLowerCase() : undefined;
      if (hash && /^[0-9a-f]{32}$/.test(hash)) {
        md5 = hash;
      }
    } catch {
      md5 = undefined;
    }
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      md5,
    };
  });
}

const PROGRESS_POLL_MS = 300;

/**
 * The receiver's own write-to-disk progress for one file, polled on the side. The upload call's
 * own `onProgress` only reports how much this phone has handed to the OS socket buffer, which
 * races ahead of what the other phone has actually received and written — the two phones' screens
 * would show different percentages. Once this starts getting answers, it becomes the number shown
 * on this phone too, so both screens track the same thing.
 */
function pollReceiverProgress(
  root: string,
  payload: PairingPayload,
  fileId: string,
  onReceived: (bytes: number) => void,
  signal: AbortSignal,
): () => void {
  let stopped = false;
  let lastReported = -1;
  const tick = async () => {
    while (!stopped && !signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, PROGRESS_POLL_MS));
      if (stopped || signal.aborted) {
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`${root}/filora/phone/progress`, {
          method: "GET",
          headers: {
            "x-filora-token": payload.token,
            "x-filora-sid": payload.sid,
            "x-file-id": fileId,
          },
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as { received?: number };
          const received = Number(body.received);
          if (Number.isFinite(received) && received > lastReported) {
            lastReported = received;
            onReceived(received);
          }
        }
      } catch {
        // A missed poll just skips one UI update; the next tick retries.
      } finally {
        clearTimeout(timer);
      }
    }
  };
  void tick();
  return () => {
    stopped = true;
  };
}

/**
 * A dropped connection on the way back doesn't mean the file was lost — all the bytes can already
 * be written and verified on the receiver, just with the "200 OK" lost to the same blip. Ask the
 * receiver for its own verdict before trusting a broken upload call over it. A couple of retries
 * cover the receiver still being a beat behind in writing that verdict.
 */
async function confirmReceiverHasFile(
  root: string,
  payload: PairingPayload,
  fileId: string,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) {
      return false;
    }
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${root}/filora/phone/progress`, {
        method: "GET",
        headers: {
          "x-filora-token": payload.token,
          "x-filora-sid": payload.sid,
          "x-file-id": fileId,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const body = (await response.json()) as { done?: boolean; success?: boolean };
        if (body.done) {
          return body.success === true;
        }
      }
    } catch {
      // Try again — the receiver may still be mid-write or mid-verify.
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

async function sayHello(root: string, payload: PairingPayload, request: TransferRequest, signal: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${root}/filora/phone/hello`,
      JSON.stringify({
        v: PHONE_PROTOCOL_VERSION,
        sid: payload.sid,
        token: payload.token,
        senderName: request.senderName,
        senderEmoji: request.senderEmoji,
        files: request.files,
      }),
      signal,
    );
  } catch (error) {
    if (signal.aborted) {
      throw new Error("cancelled");
    }
    throw new Error(error instanceof Error && error.name === "AbortError" ? "expired" : "unreachable");
  }

  if (response.status === 403) {
    throw new Error("rejected");
  }
  if (response.status === 410) {
    throw new Error("expired");
  }
  if (response.status === 401 || response.status === 400) {
    throw new Error("invalid");
  }
  if (!response.ok) {
    throw new Error("unreachable");
  }
}

async function sendFilesOnBoundNetwork(
  payload: PairingPayload,
  request: TransferRequest,
  files: OutgoingFile[],
  onProgress: (progress: SendProgress) => void,
  signal: AbortSignal,
  state: SendState,
): Promise<{ ok: number; failed: number }> {
  const root = `http://${payload.host}:${payload.port}`;
  if (!state.accepted) {
    await sayHello(root, payload, request, signal);
    state.accepted = true;
  }

  for (const file of request.files) {
    if (signal.aborted) {
      throw new Error("cancelled");
    }
    if (state.done.has(file.id)) {
      continue;
    }
    const source = files.find((item) => item.id === file.id);
    if (!source) {
      state.done.add(file.id);
      state.failed += 1;
      continue;
    }
    let receiverReporting = false;
    const stopPoll = pollReceiverProgress(
      root,
      payload,
      file.id,
      (received) => {
        receiverReporting = true;
        onProgress({
          fileId: file.id,
          transferred: Math.min(received, file.size),
          total: file.size,
        });
      },
      signal,
    );
    try {
      const upload = await new File(source.uri).upload(`${root}/filora/phone/file`, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: "application/octet-stream",
        headers: {
          "x-filora-token": payload.token,
          "x-filora-sid": payload.sid,
          "x-file-id": file.id,
          "x-file-name": encodeURIComponent(file.name),
          ...(file.md5 ? { "x-file-md5": file.md5 } : {}),
        },
        signal,
        onProgress: ({ bytesSent }) => {
          // Early, local-only feedback so the bar isn't stuck at 0% during the first poll
          // interval; once the receiver starts answering, its byte count takes over.
          if (!receiverReporting) {
            onProgress({
              fileId: file.id,
              transferred: bytesSent,
              total: file.size,
            });
          }
        },
      });
      stopPoll();
      state.done.add(file.id);
      if (upload.status === 200 || (await confirmReceiverHasFile(root, payload, file.id, signal))) {
        state.ok += 1;
        onProgress({
          fileId: file.id,
          transferred: file.size,
          total: file.size,
        });
      } else {
        state.failed += 1;
        onProgress({ fileId: file.id, transferred: 0, total: file.size, failed: true });
      }
    } catch {
      stopPoll();
      if (signal.aborted) {
        throw new Error("cancelled");
      }
      state.done.add(file.id);
      if (await confirmReceiverHasFile(root, payload, file.id, signal)) {
        state.ok += 1;
        onProgress({
          fileId: file.id,
          transferred: file.size,
          total: file.size,
        });
      } else {
        state.failed += 1;
        onProgress({ fileId: file.id, transferred: 0, total: file.size, failed: true });
      }
    }
  }
  return { ok: state.ok, failed: state.failed };
}
