/**
 * Nearby phone discovery.
 *
 * The receiver advertises a `_filora._tcp` DNS-SD record two ways:
 *   - mDNS (Android NSD) on whatever network it is on, for phones on the same Wi-Fi.
 *   - Wi-Fi Direct service discovery, for phones with no shared network at all.
 * The TXT record carries the pairing fields, so a sender can tap the phone instead of
 * scanning a QR code. Anyone nearby can see the record; the receiver still approves
 * every transfer on screen.
 *
 * Wi-Fi Direct service discovery is patchy between phone makers, so the sender also runs a
 * plain Wi-Fi scan: a receiver's group is named `DIRECT-FL-<name>-<link id>`, which any phone
 * can see and join (see localLink.joinDirectNetwork). The pairing record is fetched after joining.
 */
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import { enableLocationServices } from "../../../../services/device/permissions";
import { ensureRadioPermission, ensureWifiOn } from "./localLink";
import { isPairingFresh, parseDirectNetworkName, parsePairingQr, sanitizeEmoji, type PairingPayload } from "./protocol";

export const PEER_FOUND_EVENT = "FiloraPeerFound";
export const PEER_LOST_EVENT = "FiloraPeerLost";

/** Wi-Fi Direct records are not withdrawn when a phone leaves, so drop them after this long. */
const P2P_STALE_MS = 90_000;
/** Scan results linger in the system cache; a group missing from them this long is gone. */
const WIFI_STALE_MS = 45_000;
/** Cached scan results are cheap to read; Android allows about four fresh scans per two minutes. */
const WIFI_READ_MS = 5_000;
const WIFI_TRIGGER_MS = 30_000;

export type Availability = { nsd: boolean; p2p: boolean; wifi: boolean };

type NativeAvailability = { nsd: boolean; p2p: boolean };

type WifiNetwork = { ssid?: string; bssid?: string; level?: number; frequency?: number };

type DiscoveryNative = {
  startAdvertising?: (info: Record<string, string | number>, usePeerToPeer: boolean) => Promise<NativeAvailability>;
  stopAdvertising?: () => Promise<void>;
  startDiscovery?: () => Promise<NativeAvailability>;
  stopDiscovery?: () => Promise<void>;
  scanWifiNetworks?: (trigger: boolean) => Promise<WifiNetwork[]>;
};

const native = NativeModules.FiloraNetwork as DiscoveryNative | undefined;
const NONE: Availability = { nsd: false, p2p: false, wifi: false };

export type PeerSource = "nsd" | "p2p" | "wifi";

export type NearbyPeer = {
  /** One entry per receiving phone: the session id, or `w:<link id>` for a scanned group. */
  key: string;
  name: string;
  /** The receiver's profile emoji, when its record carried one. */
  emoji?: string;
  /** How it was found: "nsd" = same network, "p2p" = Wi-Fi Direct record, "wifi" = Wi-Fi scan. */
  source: PeerSource;
  /** Pairing details, when the record carried them. A scanned group hands them over after joining. */
  payload?: PairingPayload;
  /** Wi-Fi Direct group to join, for a scanned peer. */
  ssid?: string;
  /** Ties the same phone together across sources. */
  linkId?: string;
  seenAt: number;
};

export type DiscoverySession = Availability & {
  /** The Wi-Fi radio was off and stayed off after the system switch was shown. */
  wifiOff?: boolean;
  stop: () => Promise<void>;
};

/** Start advertising this receiver. Wi-Fi Direct advertising is only used for a Wi-Fi Direct link. */
export async function advertiseReceiver(
  payload: PairingPayload,
  deviceName: string,
  linkId?: string,
  emoji?: string,
): Promise<Availability> {
  if (Platform.OS !== "android" || !native?.startAdvertising) {
    return NONE;
  }
  const record: Record<string, string | number> = {
    v: payload.v,
    sid: payload.sid,
    tok: payload.token,
    exp: payload.exp,
    host: payload.host,
    port: payload.port,
    tr: payload.transport ?? "lan",
    n: deviceName.slice(0, 40),
  };
  if (linkId) {
    record.lid = linkId;
  }
  const safeEmoji = sanitizeEmoji(emoji);
  if (safeEmoji) {
    record.e = safeEmoji;
  }
  try {
    const visible = await native.startAdvertising(record, payload.transport === "direct");
    return { ...visible, wifi: Boolean(linkId) };
  } catch {
    return { ...NONE, wifi: Boolean(linkId) };
  }
}

export async function stopAdvertising(): Promise<void> {
  await native?.stopAdvertising?.().catch(() => undefined);
}

function text(event: Record<string, unknown>, key: string): string | undefined {
  const value = event[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Turn a native discovery event into a pairing payload the sender can use as-is. */
export function peerFromEvent(event: Record<string, unknown>, nowMs = Date.now()): NearbyPeer | null {
  const source = event.source === "p2p" ? "p2p" : event.source === "nsd" ? "nsd" : null;
  if (!source) {
    return null;
  }
  if (source === "p2p" && text(event, "tr") !== "direct") {
    // Only a Wi-Fi Direct group can be joined from a P2P record.
    return null;
  }
  const resolvedPort = Number(event.resolvedPort);
  const candidate = {
    v: Number(text(event, "v")),
    sid: text(event, "sid"),
    token: text(event, "tok"),
    exp: Number(text(event, "exp")),
    // Found over mDNS means both phones already share a network: use the address mDNS resolved.
    host: source === "nsd" ? (text(event, "resolvedHost") ?? text(event, "host")) : text(event, "host"),
    port: source === "nsd" && resolvedPort > 0 ? resolvedPort : Number(text(event, "port")),
    transport: source === "p2p" ? "direct" : "lan",
    deviceAddress: source === "p2p" ? text(event, "deviceAddress") : undefined,
  };
  const payload = parsePairingQr(JSON.stringify(candidate));
  if (!payload || !isPairingFresh(payload, nowMs)) {
    return null;
  }
  if (source === "p2p" && !payload.deviceAddress) {
    return null;
  }
  const name = (text(event, "n") ?? text(event, "deviceName") ?? "Phone").slice(0, 40);
  const lid = text(event, "lid");
  const linkId = lid && /^[0-9a-f]{4}$/.test(lid) ? lid : undefined;
  const emoji = sanitizeEmoji(text(event, "e"));
  return {
    key: payload.sid,
    name,
    source,
    payload,
    ...(linkId ? { linkId } : {}),
    ...(emoji ? { emoji } : {}),
    seenAt: nowMs,
  };
}

/** A scanned Filora group as a peer the sender can tap. */
export function peerFromWifiScan(ssid: string, nowMs = Date.now()): NearbyPeer | null {
  const network = parseDirectNetworkName(ssid);
  if (!network) {
    return null;
  }
  return { key: `w:${network.linkId}`, name: network.name, source: "wifi", ssid: network.ssid, linkId: network.linkId, seenAt: nowMs };
}

/** Same network beats a radio switch; a passphrase join beats the Wi-Fi Direct handshake. */
const RANK: Record<PeerSource, number> = { nsd: 3, wifi: 2, p2p: 1 };

/** Compare names the way a scanned Wi-Fi group spells them: letters and digits only. */
function simpleName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Same receiver seen again under another session id, source or (for a scan) a trimmed name. */
function samePhone(left: NearbyPeer, right: NearbyPeer): boolean {
  const a = simpleName(left.name);
  const b = simpleName(right.name);
  if (!a || !b) {
    return false;
  }
  if (left.emoji && right.emoji && left.emoji !== right.emoji) {
    return false;
  }
  if (a === b) {
    return true;
  }
  // A scanned group name is shortened, so it may be only the start of the full name.
  return (left.source === "wifi" || right.source === "wifi") && Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/**
 * A receiver that switches link type starts a new session, while its old Wi-Fi Direct record and
 * scan result linger for a minute. Show each phone once: the newest session wins, and within a
 * session the most dependable source.
 */
function uniquePhones(list: NearbyPeer[], firstSeen: Map<string, number>): NearbyPeer[] {
  const since = (peer: NearbyPeer) => firstSeen.get(peer.key) ?? peer.seenAt;
  const ordered = [...list].sort((left, right) => since(right) - since(left) || RANK[right.source] - RANK[left.source]);
  const kept: NearbyPeer[] = [];
  for (const peer of ordered) {
    if (!kept.some((other) => samePhone(other, peer))) {
      kept.push(peer);
    }
  }
  return kept;
}

/**
 * Look for receiving phones until `stop()` is called. `onChange` gets the full list each time.
 * The same phone can show up through several sources; the most dependable one is kept.
 */
export async function discoverNearby(onChange: (peers: NearbyPeer[]) => void): Promise<DiscoverySession> {
  const peers = new Map<string, NearbyPeer>();
  const nsdIds = new Map<string, string>();
  /** When each peer key first appeared; a newer session of the same phone replaces an older one. */
  const firstSeen = new Map<string, number>();
  let stopped = false;
  let wifiTimer: ReturnType<typeof setInterval> | null = null;

  const publish = () => {
    if (!stopped) {
      onChange(uniquePhones([...peers.values()], firstSeen).sort((left, right) => left.name.localeCompare(right.name)));
    }
  };

  /** Add a peer unless the same phone is already listed through a better source. */
  const offer = (peer: NearbyPeer): boolean => {
    const bySession = peers.get(peer.key);
    if (bySession && RANK[bySession.source] > RANK[peer.source]) {
      return false;
    }
    if (peer.linkId) {
      for (const [key, other] of peers) {
        if (key === peer.key || other.linkId !== peer.linkId) {
          continue;
        }
        if (RANK[other.source] > RANK[peer.source]) {
          return false;
        }
        // Same phone and session through a better source: keep when it was first seen.
        firstSeen.set(peer.key, Math.min(firstSeen.get(key) ?? peer.seenAt, firstSeen.get(peer.key) ?? peer.seenAt));
        peers.delete(key);
      }
    }
    if (!firstSeen.has(peer.key)) {
      firstSeen.set(peer.key, peer.seenAt);
    }
    peers.set(peer.key, peer);
    return true;
  };

  const found = DeviceEventEmitter.addListener(PEER_FOUND_EVENT, (event: Record<string, unknown>) => {
    const peer = peerFromEvent(event);
    if (!peer) {
      return;
    }
    if (peer.source === "nsd") {
      nsdIds.set(String(event.id), peer.key);
    }
    if (offer(peer)) {
      publish();
    }
  });

  const lost = DeviceEventEmitter.addListener(PEER_LOST_EVENT, (event: Record<string, unknown>) => {
    const key = nsdIds.get(String(event.id));
    if (key && peers.get(key)?.source === "nsd") {
      peers.delete(key);
      firstSeen.delete(key);
      publish();
    }
  });

  let lastTrigger = 0;
  const scanWifi = async () => {
    if (stopped || !native?.scanWifiNetworks) {
      return;
    }
    const now = Date.now();
    const trigger = now - lastTrigger >= WIFI_TRIGGER_MS;
    if (trigger) {
      lastTrigger = now;
    }
    let networks: WifiNetwork[];
    try {
      networks = await native.scanWifiNetworks(trigger);
    } catch {
      return;
    }
    if (stopped) {
      return;
    }
    let changed = false;
    for (const network of networks) {
      const peer = peerFromWifiScan(network.ssid ?? "", now);
      if (!peer) {
        continue;
      }
      const existing = peers.get(peer.key);
      if (existing?.source === "wifi") {
        existing.seenAt = now;
        continue;
      }
      if (offer(peer)) {
        changed = true;
      }
    }
    if (changed) {
      publish();
    }
  };

  const prune = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, peer] of peers) {
      const stale = peer.source === "wifi"
        ? now - peer.seenAt > WIFI_STALE_MS
        : !peer.payload || !isPairingFresh(peer.payload, now) || (peer.source === "p2p" && now - peer.seenAt > P2P_STALE_MS);
      if (stale) {
        peers.delete(key);
        firstSeen.delete(key);
        changed = true;
      }
    }
    if (changed) {
      publish();
    }
  }, 5000);

  const stop = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    found.remove();
    lost.remove();
    clearInterval(prune);
    if (wifiTimer) {
      clearInterval(wifiTimer);
      wifiTimer = null;
    }
    await native?.stopDiscovery?.().catch(() => undefined);
  };

  if (Platform.OS !== "android" || !native?.startDiscovery) {
    return { ...NONE, stop };
  }
  let radio = false;
  try {
    await ensureRadioPermission();
    radio = true;
  } catch {
    // Same-network discovery still works without the radio permission.
  }
  try {
    await ensureWifiOn();
  } catch {
    // Nothing can be found with the radio off; the screen offers the switch and retries.
    return { ...NONE, wifiOff: true, stop };
  }
  if (radio) {
    // Scan results and Wi-Fi Direct discovery are both empty while location is switched off.
    await enableLocationServices().catch(() => false);
  }
  if (stopped) {
    return { ...NONE, stop };
  }
  let available: NativeAvailability = { nsd: false, p2p: false };
  try {
    available = await native.startDiscovery();
  } catch {
    available = { nsd: false, p2p: false };
  }
  let wifi = false;
  if (radio && native.scanWifiNetworks) {
    try {
      await native.scanWifiNetworks(false);
      wifi = true;
    } catch {
      wifi = false;
    }
  }
  if (wifi && !stopped) {
    void scanWifi();
    wifiTimer = setInterval(() => {
      void scanWifi();
    }, WIFI_READ_MS);
  }
  return { ...available, wifi, stop };
}
