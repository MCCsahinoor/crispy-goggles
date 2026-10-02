import Constants from "expo-constants";
import * as ExpoInAppUpdates from "expo-in-app-updates";
import { Alert, Platform } from "react-native";

import { t } from "../i18n";

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
    return t("update.availableVersion", { store: storeVersion, current });
  }
  return t("update.availableGeneric");
}

export function promptAppUpdate(storeVersion?: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(t("update.availableTitle"), updateMessage(storeVersion), [
      { text: t("update.notNow"), style: "cancel", onPress: () => resolve(false) },
      {
        text: t("update.action"),
        onPress: async () => {
          try {
            await startAppUpdate();
            resolve(true);
          } catch {
            Alert.alert(t("update.failedTitle"), t("update.couldNotOpen"));
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
        t("update.checkTitle"),
        __DEV__
          ? t("update.devBuild", { current: getAppVersion() })
          : t("update.usingVersion", { current: getAppVersion() }),
      );
    }
    return;
  }

  try {
    const result = await checkForAppUpdate();

    if (!result.updateAvailable) {
      if (options?.manual) {
        Alert.alert(t("update.checkTitle"), t("update.latest", { current: getAppVersion() }));
      }
      return;
    }

    if (Platform.OS === "android") {
      try {
        await startAppUpdate();
      } catch {
        if (options?.manual) {
          Alert.alert(t("update.failedTitle"), t("update.couldNotStart"));
        }
      }
      return;
    }

    await promptAppUpdate(result.storeVersion);
  } catch {
    if (options?.manual) {
      Alert.alert(
        t("update.checkTitle"),
        Platform.OS === "ios" ? t("update.couldNotCheckIos") : t("update.couldNotCheckAndroid"),
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
