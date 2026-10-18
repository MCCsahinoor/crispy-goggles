import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import WifiManager from "react-native-wifi-reborn";

import { listLocalIpv4 } from "../lib/networkIps";
import { requestLocationPermission } from "../lib/permissions";
import {
  PHONE_PORTS,
  directNetworkName,
  isIpv4,
  parsePairingQr,
  randomLinkId,
  sanitizeEmoji,
  type PairingPayload,
} from "./protocol";

export type PhoneLinkMode = "hotspot" | "direct" | "lan";

export type PhoneLink = {
  transport: PhoneLinkMode;
  host: string;
  ssid?: string;
  password?: string;
  deviceAddress?: string;
  /** Set when the Wi-Fi Direct group carries the Filora network name senders can scan for. */
  linkId?: string;
};

type DirectGroup = { host?: string; deviceAddress?: string; ssid?: string; passphrase?: string };

type FiloraNetworkNative = {
  startLocalHotspot?: () => Promise<{ ssid?: string; password?: string }>;
  stopLocalHotspot?: () => Promise<void>;
  startWifiDirect?: (options: { networkName?: string; passphrase?: string; band?: "2.4" | "5" | "auto" }) => Promise<DirectGroup>;
  connectWifiDirect?: (deviceAddress: string) => Promise<{ host?: string }>;
  stopWifiDirect?: () => Promise<void>;
  getGatewayIpv4?: () => Promise<string | null>;
};

const native = NativeModules.FiloraNetwork as FiloraNetworkNative | undefined;
const MAC = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
/** The address a Wi-Fi Direct group owner gets on every Android build so far. */
const DIRECT_OWNER_HOST = "192.168.49.1";

/**
 * Passphrase of a Filora-named Wi-Fi Direct group, derived from its network name so a sender
 * can join from a Wi-Fi scan alone. The group is as open as the nearby broadcast already is;
 * the receiver's on-screen approval is what protects it.
 */
export async function directPassphrase(ssid: string): Promise<string> {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `filora-direct-v1:${ssid}`);
  return digest.slice(0, 16);
}

function nativeCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.message : "";
}

let joinedDirect = false;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function ensureRadioPermission(): Promise<void> {
  const location = await requestLocationPermission();
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    const nearby = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
    if (nearby === PermissionsAndroid.RESULTS.GRANTED) {
      return;
    }
  }
  if (!location) {
    throw new Error("permission");
  }
}

export async function isWifiOn(): Promise<boolean> {
  try {
    return await WifiManager.isEnabled();
  } catch {
    // Unknown counts as on: the link attempt itself will tell.
    return true;
  }
}

/** Show the system Wi-Fi switch. Android 10+ does not let an app flip it, only ask. */
export async function openWifiSwitch(): Promise<void> {
  try {
    await WifiManager.setEnabled(true);
  } catch {
    // The system panel may still have opened.
  }
}

/**
 * Make sure the Wi-Fi radio is on. On Android 10+ this can only open the system panel and wait a
 * moment; if the person leaves it off, this throws `wifi-off` so the screen can say so and offer
 * the switch again, rather than failing later with a vaguer error.
 */
export async function ensureWifiOn(): Promise<void> {
  if (await isWifiOn()) {
    return;
  }
  await openWifiSwitch();
  await delay(1500);
  if (await isWifiOn()) {
    return;
  }
  throw new Error("wifi-off");
}

async function waitForNewAddress(before: string[]): Promise<string | null> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const latest = await listLocalIpv4();
    const fresh = latest.find((ip) => !before.includes(ip));
    if (fresh) {
      return fresh;
    }
    await delay(500);
  }
  const latest = await listLocalIpv4();
  return latest.find((ip) => ip.startsWith("192.168.43.") || ip.startsWith("192.168.49.")) ?? null;
}

async function startHotspot(): Promise<PhoneLink> {
  if (!native?.startLocalHotspot) {
    throw new Error("hotspot");
  }
  const before = await listLocalIpv4();
  let started: { ssid?: string; password?: string };
  try {
    started = await native.startLocalHotspot();
  } catch (error) {
    throw new Error(nativeCode(error) === "permission" ? "permission" : "hotspot");
  }
  const ssid = started.ssid?.replace(/^"|"$/g, "").trim() ?? "";
  const password = started.password?.replace(/^"|"$/g, "").trim() ?? "";
  if (!ssid || password.length < 8) {
    await native.stopLocalHotspot?.().catch(() => undefined);
    throw new Error("hotspot");
  }
  const host = await waitForNewAddress(before);
  if (!host) {
    await native.stopLocalHotspot?.().catch(() => undefined);
    throw new Error("no-address");
  }
  return { transport: "hotspot", host, ssid, password };
}

async function startDirect(deviceName: string): Promise<PhoneLink> {
  if (!native?.startWifiDirect) {
    throw new Error("direct");
  }
  // Ask for a scannable group name; the phone may still fall back to a plain group.
  const linkId = randomLinkId();
  const networkName = directNetworkName(deviceName, linkId);
  const passphrase = await directPassphrase(networkName);
  let started: DirectGroup;
  try {
    started = await native.startWifiDirect({ networkName, passphrase, band: "2.4" });
  } catch (error) {
    throw new Error(nativeCode(error) === "permission" ? "permission" : "direct");
  }
  const host = started.host?.trim() ?? "";
  const deviceAddress = started.deviceAddress?.trim().toLowerCase() ?? "";
  if (!isIpv4(host) || !MAC.test(deviceAddress)) {
    await native.stopWifiDirect?.().catch(() => undefined);
    throw new Error("direct");
  }
  const link: PhoneLink = { transport: "direct", host, deviceAddress };
  const ssid = started.ssid?.replace(/^"|"$/g, "").trim() ?? "";
  const password = started.passphrase?.trim() ?? "";
  if (ssid && password.length >= 8 && password.length <= 63) {
    // Any phone can join a group it knows the passphrase of, which is more dependable than WPS.
    link.ssid = ssid;
    link.password = password;
  }
  if (ssid === networkName && password === passphrase) {
    link.linkId = linkId;
  }
  return link;
}

/** Open the link the other phone will join, then return the address to advertise. */
export async function openPhoneLink(mode: PhoneLinkMode, deviceName = ""): Promise<PhoneLink> {
  await closePhoneLink();
  if (mode === "lan") {
    const host = (await listLocalIpv4())[0];
    if (!host) {
      throw new Error("no-address");
    }
    return { transport: "lan", host };
  }
  if (Platform.OS !== "android" || !native) {
    throw new Error(mode === "direct" ? "direct" : "hotspot");
  }
  await ensureRadioPermission();
  await ensureWifiOn();
  return mode === "hotspot" ? startHotspot() : startDirect(deviceName);
}

export async function closePhoneLink(): Promise<void> {
  await native?.stopLocalHotspot?.().catch(() => undefined);
  await native?.stopWifiDirect?.().catch(() => undefined);
}

async function pingOnce(host: string, port: number, signal: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  try {
    const response = await fetch(`http://${host}:${port}/filora/phone/ping`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function waitUntilReachable(host: string, port: number, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error("cancelled");
    }
    if (await pingOnce(host, port, signal)) {
      return;
    }
    await delay(700, signal);
  }
  throw new Error("join");
}

async function bindWifi(): Promise<void> {
  try {
    await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
  } catch {
    // The request can still succeed when Wi-Fi is already the active route.
  }
}

async function joinHotspot(ssid: string, password: string, signal: AbortSignal): Promise<void> {
  await ensureRadioPermission();
  await ensureWifiOn();
  if (signal.aborted) {
    throw new Error("cancelled");
  }
  let current = "";
  try {
    current = await WifiManager.getCurrentWifiSSID();
  } catch {
    current = "";
  }
  const same = current.replace(/^"|"$/g, "").trim() === ssid;
  if (!same) {
    try {
      await WifiManager.disconnect();
    } catch {
      // The radio may already be disconnected.
    }
    await WifiManager.connectToProtectedSSID(ssid, password, false, false);
  }
}

function joinError(error: unknown): Error {
  if (error instanceof Error && (error.message === "cancelled" || error.message === "wifi-off")) {
    return error;
  }
  return new Error(nativeCode(error) === "permission" ? "permission" : "join");
}

/** Join the receiving phone's hotspot or Wi-Fi Direct group, then keep traffic on that radio. */
export async function joinPhoneLink(payload: PairingPayload, signal: AbortSignal): Promise<PairingPayload> {
  if (signal.aborted) {
    throw new Error("cancelled");
  }
  if ((payload.transport === "hotspot" || payload.transport === "direct") && payload.ssid && payload.password) {
    // A Wi-Fi Direct group with a known passphrase joins like a hotspot: no WPS handshake, and
    // the connect prompt shows on this phone, where the person is already looking.
    try {
      await joinHotspot(payload.ssid, payload.password, signal);
      await bindWifi();
      await waitUntilReachable(payload.host, payload.port, signal);
      return payload;
    } catch (error) {
      const wrapped = joinError(error);
      if (payload.transport !== "direct" || !payload.deviceAddress || wrapped.message !== "join") {
        throw wrapped;
      }
      // Fall through to the Wi-Fi Direct handshake.
    }
  }
  if (payload.transport === "direct" && payload.deviceAddress && native?.connectWifiDirect) {
    joinedDirect = true;
    let host = payload.host;
    try {
      await ensureRadioPermission();
      const connected = await native.connectWifiDirect(payload.deviceAddress);
      if (connected.host && isIpv4(connected.host)) {
        host = connected.host;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "cancelled") {
        throw error;
      }
      throw new Error(nativeCode(error) === "permission" ? "permission" : "join");
    }
    await bindWifi();
    const next = { ...payload, host };
    await waitUntilReachable(next.host, next.port, signal);
    return next;
  }
  return payload;
}

export type DirectJoin = { payload: PairingPayload; name: string; emoji?: string };

async function fetchPairingInfo(host: string, port: number, signal: AbortSignal): Promise<DirectJoin | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  try {
    const response = await fetch(`http://${host}:${port}/filora/phone/info`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Record<string, unknown>;
    const payload = parsePairingQr(JSON.stringify({ ...body, host, port }));
    if (!payload) {
      return null;
    }
    const name = typeof body.name === "string" ? body.name.slice(0, 40) : "";
    const emoji = sanitizeEmoji(body.emoji);
    return { payload: { ...payload, transport: "direct" }, name, ...(emoji ? { emoji } : {}) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Join a Filora-named Wi-Fi Direct group found in a Wi-Fi scan, then ask its owner for the
 * pairing record. Resolves with what a scanned QR code would have given.
 */
export async function joinDirectNetwork(ssid: string, signal: AbortSignal): Promise<DirectJoin> {
  if (signal.aborted) {
    throw new Error("cancelled");
  }
  const password = await directPassphrase(ssid);
  try {
    await joinHotspot(ssid, password, signal);
  } catch (error) {
    throw joinError(error);
  }
  await bindWifi();
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error("cancelled");
    }
    const hosts = [DIRECT_OWNER_HOST];
    const gateway = await native?.getGatewayIpv4?.().catch(() => null);
    if (gateway && isIpv4(gateway) && !hosts.includes(gateway)) {
      hosts.push(gateway);
    }
    const attempts: Promise<DirectJoin | null>[] = [];
    for (const host of hosts) {
      for (const port of PHONE_PORTS) {
        attempts.push(fetchPairingInfo(host, port, signal));
      }
    }
    const found = (await Promise.all(attempts)).find((result) => result !== null);
    if (found) {
      return found;
    }
    await delay(700, signal);
  }
  throw new Error("join");
}

/** Drop the process-wide Wi-Fi bind after a send. */
export async function releasePhoneRoute(): Promise<void> {
  try {
    await WifiManager.forceWifiUsageWithOptions(false, { noInternet: true });
  } catch {
    // The default network is already in use.
  }
  if (joinedDirect) {
    joinedDirect = false;
    await native?.stopWifiDirect?.().catch(() => undefined);
  }
}
