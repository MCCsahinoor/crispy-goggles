import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import Share from "react-native-share";

import { t } from "../i18n";
import { FILORA_ANDROID_STORE_URL, FILORA_WEBSITE_URL } from "./links";

const SHARE_PROMO = require("../../assets/share-promo.jpg");

function shareUrl(): string {
  return Platform.OS === "android" ? FILORA_ANDROID_STORE_URL : FILORA_WEBSITE_URL;
}

/** Writable JPEG in cache for intents / FileProvider. */
async function ensureShareImageFile(): Promise<string> {
  const [asset] = await Asset.loadAsync(SHARE_PROMO);
  await asset.downloadAsync();
  const source = asset.localUri ?? asset.uri;
  if (!source) {
    throw new Error("Share image missing");
  }

  const dest = `${FileSystem.cacheDirectory ?? ""}filora-share-promo.jpg`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    // Ignore missing cache file.
  }

  try {
    await FileSystem.copyAsync({ from: source, to: dest });
  } catch {
    await FileSystem.downloadAsync(source, dest);
  }

  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists || (info.size ?? 0) < 64) {
    throw new Error("Share image not written");
  }

  return dest;
}

function fileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
}

async function shareWithReactNativeShare(imagePath: string, message: string, title: string): Promise<void> {
  const uri = fileUri(imagePath);

  if (Platform.OS === "android") {
    await Share.open({
      title,
      message,
      url: uri,
      type: "image/jpeg",
      filename: "filora-share-promo.jpg",
      useInternalStorage: true,
      failOnCancel: false,
    });
    return;
  }

  await Share.open({
    title,
    message,
    urls: [uri],
    type: "image/jpeg",
    failOnCancel: false,
  });
}

async function shareWithBase64(imagePath: string, message: string, title: string): Promise<void> {
  const base64 = await FileSystem.readAsStringAsync(imagePath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Share.open({
    title,
    message,
    url: `data:image/jpeg;base64,${base64}`,
    type: "image/jpeg",
    failOnCancel: false,
  });
}

/** Share promo image via expo-sharing (image only; link stays in the message for apps that support captions). */
async function shareImageOnly(imagePath: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing not available");
  }
  await Sharing.shareAsync(fileUri(imagePath), {
    mimeType: "image/jpeg",
    dialogTitle: title,
    UTI: "public.jpeg",
  });
}

/** Opens the system share sheet with the promo image and store / website link text. */
export async function shareFiloraApp(): Promise<void> {
  const message = t("settings.shareAppMessage", { url: shareUrl() });
  const title = t("settings.shareApp");
  const imagePath = await ensureShareImageFile();

  try {
    await shareWithReactNativeShare(imagePath, message, title);
    return;
  } catch {
    // Try base64 payload (some Android builds reject raw file:// URIs).
  }

  try {
    await shareWithBase64(imagePath, message, title);
    return;
  } catch {
    // Fall back to sharing the image file without react-native-share.
  }

  await shareImageOnly(imagePath, title);
}
