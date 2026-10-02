import { Camera } from "expo-camera";
import * as Location from "expo-location";
import {
  Alert,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  type Permission,
} from "react-native";

import { t } from "../i18n";
import { requestStoragePermission } from "./saveDownload";

export type PermissionId = "camera" | "location" | "storage";

export type PermissionItem = {
  id: PermissionId;
  title: string;
  subtitle: string;
  granted: boolean;
};

function androidSdk(): number {
  return typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);
}

async function isAndroidPermissionGranted(permission: Permission): Promise<boolean> {
  try {
    return await PermissionsAndroid.check(permission);
  } catch {
    return false;
  }
}

async function getCameraGranted(): Promise<boolean> {
  try {
    const result = await Camera.getCameraPermissionsAsync();
    if (result.granted) {
      return true;
    }
  } catch {
    // Fall through to the native Android check.
  }
  if (Platform.OS === "android") {
    return isAndroidPermissionGranted(PermissionsAndroid.PERMISSIONS.CAMERA);
  }
  return false;
}

async function getLocationGranted(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  const [fine, coarse] = await Promise.all([
    isAndroidPermissionGranted(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
    isAndroidPermissionGranted(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
  ]);
  return fine || coarse;
}

async function getStorageGranted(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  if (androidSdk() >= 30) {
    return true;
  }
  return isAndroidPermissionGranted(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
}

export async function getRequiredPermissions(): Promise<PermissionItem[]> {
  const items: PermissionItem[] = [
    {
      id: "camera",
      title: t("perm.camera.title"),
      subtitle: t("perm.camera.subtitle"),
      granted: await getCameraGranted(),
    },
  ];

  if (Platform.OS === "android") {
    items.push({
      id: "location",
      title: t("perm.location.title"),
      subtitle: t("perm.location.subtitle"),
      granted: await getLocationGranted(),
    });
    items.push({
      id: "storage",
      title: t("perm.storage.title"),
      subtitle: t("perm.storage.subtitle"),
      granted: await getStorageGranted(),
    });
  }

  return items;
}

export async function openAppInfo() {
  await Linking.openSettings();
}

export async function openAppSettings() {
  await openAppInfo();
}

export async function isLocationServicesEnabled(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

export async function enableLocationServices(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  try {
    if (await Location.hasServicesEnabledAsync()) {
      return true;
    }
    await Location.enableNetworkProviderAsync();
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

export type LocationWifiReadiness = "ready" | "permission_denied" | "services_off";

export async function getLocationWifiReadiness(): Promise<LocationWifiReadiness> {
  if (Platform.OS !== "android") {
    return "ready";
  }
  if (!(await getLocationGranted())) {
    return "permission_denied";
  }
  if (!(await isLocationServicesEnabled())) {
    return "services_off";
  }
  return "ready";
}

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    await openAppInfo();
    return false;
  }

  if (await getLocationGranted()) {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: t("perm.locationDialogTitle"),
      message: t("perm.locationDialogMessage"),
      buttonNegative: t("common.cancel"),
      buttonPositive: t("common.ok"),
    },
  );

  if (granted === PermissionsAndroid.RESULTS.GRANTED) {
    if (androidSdk() >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
    }
    return true;
  }

  if (await isAndroidPermissionGranted(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION)) {
    return true;
  }

  await openAppInfo();
  return false;
}

function promptOpenSettings(message: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(t("perm.needed"), message, [
      { text: t("common.notNow"), style: "cancel", onPress: () => resolve() },
      {
        text: t("common.openSettings"),
        onPress: () => {
          openAppInfo().finally(() => resolve());
        },
      },
    ]);
  });
}

export async function requestAppPermission(id: PermissionId): Promise<boolean> {
  if (id === "camera") {
    const result = await Camera.requestCameraPermissionsAsync();
    if (result.granted || (await getCameraGranted())) {
      return true;
    }
    if (!result.canAskAgain) {
      await promptOpenSettings(t("perm.cameraOff"));
    }
    return false;
  }

  if (id === "location") {
    return requestLocationPermission();
  }

  const granted = await requestStoragePermission();
  if (!granted) {
    await promptOpenSettings(t("perm.storageOff"));
  }
  return granted;
}

export async function requestRequiredPermissions(): Promise<{ granted: number; total: number }> {
  const items = await getRequiredPermissions();
  for (const item of items) {
    if (!item.granted) {
      await requestAppPermission(item.id);
    }
  }
  const next = await getRequiredPermissions();
  return {
    granted: next.filter((item) => item.granted).length,
    total: next.length,
  };
}

export function subscribeToAppActive(onActive: () => void) {
  return AppState.addEventListener("change", (state) => {
    if (state === "active") {
      onActive();
      setTimeout(onActive, 500);
    }
  });
}
