import { NativeModules, Platform } from "react-native";
import WifiManager from "react-native-wifi-reborn";

type FiloraNetworkNative = {
  getNetworkIpv4?: () => Promise<string[]>;
};

const native = NativeModules.FiloraNetwork as FiloraNetworkNative | undefined;

function usableIp(ip: string | null | undefined): ip is string {
  return Boolean(ip && ip !== "0.0.0.0" && !ip.startsWith("169.254."));
}

/** Every IPv4 on this device, including the hotspot AP address. */
export async function listLocalIpv4(): Promise<string[]> {
  const ips = new Set<string>();
  if (Platform.OS !== "android") {
    return [];
  }

  try {
    const wifiIp = await WifiManager.getIP();
    if (usableIp(wifiIp)) {
      ips.add(wifiIp);
    }
  } catch {
    // Ignore — hotspot mode often returns 0.0.0.0 here.
  }

  try {
    const listed = await native?.getNetworkIpv4?.();
    if (Array.isArray(listed)) {
      for (const ip of listed) {
        if (usableIp(ip)) {
          ips.add(ip);
        }
      }
    }
  } catch {
    // Ignore.
  }

  return [...ips];
}

export function subnetPrefix(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}
