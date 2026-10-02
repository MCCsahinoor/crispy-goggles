import TcpSocket from "react-native-tcp-socket";

import { t } from "../i18n";

export const PHONE_CONNECT_PORT = 8766;
const CONNECT_PORTS = [8766, 8767, 8768, 18766];

export type DesktopReady = {
  baseUrl: string;
  receiveToken: string;
  extraBaseUrls?: string[];
};

type ConnectListener = {
  port: number;
  wait: Promise<DesktopReady>;
  stop: () => void;
};

function parseReadyPayload(body: string): DesktopReady | null {
  try {
    const json = JSON.parse(body) as {
      status?: string;
      base_url?: string;
      baseUrl?: string;
      base_urls?: string[];
      extraBaseUrls?: string[];
      receive_token?: string;
      receiveToken?: string;
    };
    const baseUrl = (json.base_url || json.baseUrl || "").replace(/\/$/, "");
    const receiveToken = json.receive_token || json.receiveToken;
    if (!baseUrl || !receiveToken) {
      return null;
    }
    const extra = [...(json.base_urls || []), ...(json.extraBaseUrls || [])]
      .map((url) => String(url).replace(/\/$/, ""))
      .filter((url) => url && url !== baseUrl);
    return { baseUrl, receiveToken, extraBaseUrls: extra };
  } catch {
    return null;
  }
}

function httpResponse(status: number, body: string): string {
  return (
    `HTTP/1.1 ${status} ${status === 200 ? "OK" : "Bad Request"}\r\n` +
    "Content-Type: application/json\r\n" +
    "Access-Control-Allow-Origin: *\r\n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
    "Access-Control-Allow-Headers: Content-Type, Accept\r\n" +
    "Connection: close\r\n" +
    `Content-Length: ${body.length}\r\n` +
    `\r\n${body}`
  );
}

function chunkToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data == null) {
    return "";
  }
  try {
    return new TextDecoder().decode(data as BufferSource);
  } catch {
    if (typeof (data as { toString?: Function }).toString === "function") {
      return (data as { toString: (enc?: string) => string }).toString("utf8");
    }
    return String(data);
  }
}

function handleSocket(
  socket: { on: Function; write: Function; end: Function; destroy: Function },
  expectedToken: string,
  onReady: (ready: DesktopReady) => void,
): void {
  let buffer = "";
  socket.on("data", (data: unknown) => {
    buffer += chunkToString(data);
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return;
    }
    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/content-length:\s*(\d+)/i);
    const contentLength = contentLengthMatch ? Number(contentLengthMatch[1]) : 0;
    const body = buffer.slice(headerEnd + 4);
    if (body.length < contentLength) {
      return;
    }

    const requestLine = header.split("\r\n")[0] || "";
    const [method = "", path = ""] = requestLine.split(" ");
    const route = path.split("?")[0];

    if (method === "OPTIONS") {
      socket.write(httpResponse(200, '{"ok":true}'));
      socket.end();
      return;
    }

    if (method === "GET" && (route === "/filora/ping" || route === "/")) {
      socket.write(httpResponse(200, '{"ok":true,"service":"filora-send"}'));
      socket.end();
      return;
    }

    if (method === "POST" && (route === "/filora/connect" || route === "/connect")) {
      const ready = parseReadyPayload(body.slice(0, contentLength || body.length));
      if (!ready) {
        socket.write(httpResponse(400, '{"ok":false}'));
        socket.end();
        return;
      }
      socket.write(httpResponse(200, '{"ok":true}'));
      socket.end();
      onReady(ready);
      return;
    }

    socket.write(httpResponse(404, '{"ok":false}'));
    socket.end();
  });
  socket.on("error", () => {
    try {
      socket.destroy();
    } catch {
      // Ignore.
    }
  });
}

function listenOnPort(port: number, expectedToken: string, onReady: (ready: DesktopReady) => void) {
  return new Promise<ReturnType<typeof TcpSocket.createServer>>((resolve, reject) => {
    const server = TcpSocket.createServer((socket) => {
      handleSocket(socket, expectedToken, onReady);
    });
    const onError = (error: Error) => {
      server.removeAllListeners();
      reject(error);
    };
    server.once("error", onError);
    server.listen({ port, host: "0.0.0.0", reuseAddress: true }, () => {
      server.removeListener("error", onError);
      resolve(server);
    });
  });
}

export async function startDesktopConnectListener(expectedToken: string): Promise<ConnectListener> {
  let settled = false;
  let server: ReturnType<typeof TcpSocket.createServer> | null = null;
  let resolveWait: (ready: DesktopReady) => void = () => {};
  const wait = new Promise<DesktopReady>((resolve) => {
    resolveWait = resolve;
  });

  const onReady = (ready: DesktopReady) => {
    if (settled) {
      return;
    }
    settled = true;
    resolveWait(ready);
  };

  let listenError: Error | null = null;
  let port = PHONE_CONNECT_PORT;
  for (const candidate of CONNECT_PORTS) {
    try {
      server = await listenOnPort(candidate, expectedToken, onReady);
      port = candidate;
      listenError = null;
      break;
    } catch (error) {
      listenError = error instanceof Error ? error : new Error(t("sendErr.couldNotListen"));
    }
  }
  if (!server) {
    throw listenError || new Error(t("sendErr.couldNotListenDesktop"));
  }

  const stop = () => {
    try {
      server?.close();
    } catch {
      // Ignore.
    }
  };

  return { port, wait, stop };
}
