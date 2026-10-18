/**
 * Installed apps, for sending APKs phone to phone. Backed by the FiloraApps native module.
 */
import { NativeModules, PermissionsAndroid, Platform } from "react-native";

export type InstalledApp = {
  packageName: string;
  label: string;
  versionName: string;
  /** Path of base.apk. Readable by other apps, so it can be sent as-is when there are no splits. */
  apkPath: string;
  /** Number of split APKs; an app with splits is exported as an `.apks` bundle. */
  splits: number;
  /** Base plus splits, in bytes. */
  size: number;
  installedAt: number;
  updatedAt: number;
  iconUri: string | null;
};

export type ExportedApp = { uri: string; size: number; bundle: boolean };

/** An APK file found on storage. The app fields are present when the archive could be read. */
export type ApkFile = {
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
  packageName?: string;
  versionName?: string;
  label?: string;
  iconUri?: string;
};

type FiloraAppsNative = {
  listInstalledApps?: () => Promise<InstalledApp[]>;
  exportApp?: (packageName: string) => Promise<ExportedApp>;
  hasAllFilesAccess?: () => Promise<boolean>;
  requestAllFilesAccess?: () => Promise<boolean>;
  scanApkFiles?: () => Promise<ApkFile[]>;
};

const native = NativeModules.FiloraApps as FiloraAppsNative | undefined;

export const APK_MIME = "application/vnd.android.package-archive";

export function appsSupported(): boolean {
  return Platform.OS === "android" && typeof native?.listInstalledApps === "function";
}

export async function listInstalledApps(): Promise<InstalledApp[]> {
  if (!native?.listInstalledApps) {
    return [];
  }
  const apps = await native.listInstalledApps();
  return apps.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

/** The file to send for one app: base.apk, or an `.apks` bundle when the app is split. */
export async function exportApp(packageName: string): Promise<ExportedApp> {
  if (!native?.exportApp) {
    throw new Error("unsupported");
  }
  return native.exportApp(packageName);
}

/** Whether the APK scan can read the whole storage (All files access, or the legacy permission). */
export async function hasAllFilesAccess(): Promise<boolean> {
  if (!native?.hasAllFilesAccess) {
    return false;
  }
  try {
    return await native.hasAllFilesAccess();
  } catch {
    return false;
  }
}

/**
 * Ask for storage access. On Android 11+ this opens the system settings page and resolves once it
 * is open (the caller re-checks when the app comes back); before that it shows the runtime prompt.
 */
export async function requestAllFilesAccess(): Promise<"settings" | "granted" | "denied"> {
  if (!native?.requestAllFilesAccess) {
    return "denied";
  }
  try {
    if (await native.requestAllFilesAccess()) {
      return "settings";
    }
  } catch {
    return "denied";
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  return result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
}

export async function scanApkFiles(): Promise<ApkFile[]> {
  if (!native?.scanApkFiles) {
    return [];
  }
  return native.scanApkFiles();
}

/** `My App.apk` → safe, readable file name. */
export function apkFileName(label: string, versionName: string, bundle: boolean): string {
  const stem = `${label}${versionName ? `_${versionName}` : ""}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return `${stem || "app"}.${bundle ? "apks" : "apk"}`;
}
