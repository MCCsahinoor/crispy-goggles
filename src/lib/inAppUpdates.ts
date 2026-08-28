import Constants from "expo-constants";
import * as ExpoInAppUpdates from "expo-in-app-updates";
import { Alert, Platform } from "react-native";

export type AppUpdateInfo = Awaited<ReturnType<typeof ExpoInAppUpdates.checkForUpdate>>;

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "1.0.0";
}

export function isInAppUpdatesSupported(): boolean {
  return !__DEV__ && Platform.OS !== "web";
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo> {
  return ExpoInAppUpdates.checkForUpdate();
}

export async function startAppUpdate(immediate?: boolean): Promise<boolean> {
  return ExpoInAppUpdates.startUpdate(immediate);
}

function updateMessage(storeVersion?: string): string {
  const current = getAppVersion();
  if (storeVersion) {
    return `Version ${storeVersion} is available. You're on ${current}.`;
  }
  return "A new version of Filora is available with improvements and bug fixes.";
}

export function promptAppUpdate(storeVersion?: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert("Update available", updateMessage(storeVersion), [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      {
        text: "Update",
        onPress: async () => {
          try {
            await startAppUpdate();
            resolve(true);
          } catch {
            Alert.alert("Update failed", "Could not open the update. Try again from the Play Store or App Store.");
            resolve(false);
          }
        },
      },
    ]);
  });
}

export async function checkAndPromptAppUpdate(options?: {
  manual?: boolean;
}): Promise<void> {
  if (!isInAppUpdatesSupported()) {
    if (options?.manual) {
      Alert.alert(
        "Check for updates",
        __DEV__
          ? `You're using version ${getAppVersion()}. Update checks run in release builds installed from the store.`
          : `You're using version ${getAppVersion()}.`,
      );
    }
    return;
  }

  try {
    const result = await checkForAppUpdate();

    if (!result.updateAvailable) {
      if (options?.manual) {
        Alert.alert("Check for updates", `You're on the latest version (${getAppVersion()}).`);
      }
      return;
    }

    if (Platform.OS === "android") {
      try {
        await startAppUpdate();
      } catch {
        if (options?.manual) {
          Alert.alert("Update failed", "Could not start the update. Try again from Google Play.");
        }
      }
      return;
    }

    await promptAppUpdate(result.storeVersion);
  } catch {
    if (options?.manual) {
      Alert.alert(
        "Check for updates",
        Platform.OS === "ios"
          ? "Could not check the App Store. Add AppStoreID in app.json when the app is published."
          : "Could not check for updates. Make sure the app is installed from Google Play.",
      );
    }
  }
}

export async function checkOnAppLaunch(): Promise<void> {
  if (!isInAppUpdatesSupported()) {
    return;
  }

  try {
    if (Platform.OS === "android") {
      await ExpoInAppUpdates.checkAndStartUpdate();
      return;
    }

    const result = await checkForAppUpdate();
    if (!result.updateAvailable) {
      return;
    }

    await promptAppUpdate(result.storeVersion);
  } catch {
    // Ignore launch-time update errors so the app still opens normally.
  }
}
