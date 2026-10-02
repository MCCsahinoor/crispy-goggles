import * as FileSystem from "expo-file-system/legacy";
import { Alert, PermissionsAndroid, Platform } from "react-native";

import { withLocalWifiRoute } from "./filedrop";

export const APP_DOWNLOAD_FOLDER = "Filora";

const DOWNLOAD_TIMEOUT_MS = 120000;
const PERMISSION_TIMEOUT_MS = 30000;

export type SaveProgressCallbacks = {
  onAwaitingUser?: () => void;
};

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

const SAF_URI_STORE = `${FileSystem.documentDirectory ?? ""}filedrop-saf-folder.txt`;

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || "download";
}

function splitName(fileName: string): { stem: string; ext: string } {
  const safe = sanitizeFileName(fileName);
  const dot = safe.lastIndexOf(".");
  if (dot <= 0) {
    return { stem: safe, ext: "" };
  }
  return { stem: safe.slice(0, dot), ext: safe.slice(dot) };
}

function mimeTypeForName(fileName: string): string {
  const ext = splitName(fileName).ext.replace(".", "").toLowerCase();
  const types: Record<string, string> = {
    // Text & Documents
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    pdf: "application/pdf",
    md: "text/markdown",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    log: "text/plain",
    // Code & Scripts
    js: "text/javascript",
    jsx: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    java: "text/x-java-source",
    kt: "text/x-kotlin",
    kts: "text/x-kotlin",
    swift: "text/x-swift",
    c: "text/x-c",
    h: "text/x-c",
    cpp: "text/x-c++src",
    hpp: "text/x-c++hdr",
    cs: "text/x-csharp",
    vb: "text/x-vb",
    php: "text/x-php",
    py: "text/x-python",
    rb: "text/x-ruby",
    go: "text/x-go",
    rs: "text/x-rust",
    dart: "text/x-dart",
    lua: "text/x-lua",
    r: "text/x-r",
    sql: "application/sql",
    asm: "text/x-asm",
    sh: "application/x-sh",
    bat: "application/x-msdos-program",
    ps1: "application/x-powershell",
    // Web & Markup
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    scss: "text/x-scss",
    sass: "text/x-sass",
    less: "text/x-less",
    xml: "application/xml",
    json: "application/json",
    yaml: "text/yaml",
    yml: "text/yaml",
    graphql: "application/graphql",
    gql: "application/graphql",
    svg: "image/svg+xml",
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    ico: "image/x-icon",
    tif: "image/tiff",
    tiff: "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
    raw: "image/x-raw",
    psd: "image/vnd.adobe.photoshop",
    ai: "application/postscript",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    m4a: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    wma: "audio/x-ms-wma",
    aiff: "audio/aiff",
    mid: "audio/midi",
    midi: "audio/midi",
    // Video
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    // Archives
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    tgz: "application/gzip",
    bz2: "application/x-bzip2",
    xz: "application/x-xz",
    iso: "application/x-iso9660-image",
    // Microsoft Office
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    pub: "application/vnd.ms-publisher",
    accdb: "application/msaccess",
    mdb: "application/msaccess",
    // Mobile Apps
    apk: "application/vnd.android.package-archive",
    aab: "application/x-authorware-bin",
    ipa: "application/octet-stream",
    aar: "application/vnd.android.aar",
    so: "application/x-sharedlib",
    dex: "application/vnd.android.dex",
    keystore: "application/x-java-keystore",
    jks: "application/x-java-keystore",
    // Configuration
    env: "text/plain",
    ini: "text/plain",
    conf: "text/plain",
    config: "text/plain",
    properties: "text/x-java-properties",
    toml: "application/toml",
    // Database
    db: "application/x-sqlite3",
    sqlite: "application/x-sqlite3",
    sqlite3: "application/x-sqlite3",
    dbf: "application/x-dbf",
    bak: "application/octet-stream",
    // Windows
    exe: "application/vnd.microsoft.portable-executable",
    msi: "application/x-msi",
    dll: "application/vnd.microsoft.portable-executable",
    sys: "application/octet-stream",
    com: "application/x-msdos-program",
    scr: "application/x-msdos-program",
    lnk: "application/x-ms-shortcut",
    // Apple / macOS
    dmg: "application/x-apple-diskimage",
    pkg: "application/vnd.apple.installer+xml",
    app: "application/octet-stream",
    plist: "application/x-plist",
    framework: "application/octet-stream",
    xcarchive: "application/octet-stream",
    // Certificates & Keys
    cer: "application/x-x509-ca-cert",
    crt: "application/x-x509-ca-cert",
    pem: "application/x-pem-file",
    p12: "application/x-pkcs12",
    pfx: "application/x-pkcs12",
    key: "application/x-pem-file",
    csr: "application/pkcs10",
    der: "application/x-x509-ca-cert",
  };
  return types[ext] || "application/octet-stream";
}

async function uniqueLocalPath(folderUri: string, fileName: string): Promise<string> {
  const { stem, ext } = splitName(fileName);
  let candidate = `${stem}${ext}`;
  let index = 1;
  while ((await FileSystem.getInfoAsync(`${folderUri}${candidate}`)).exists) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  return `${folderUri}${candidate}`;
}

async function ensureAppFileDropFolder(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error("Device storage is not available.");
  }
  const folderUri = `${root}${APP_DOWNLOAD_FOLDER}/`;
  const info = await FileSystem.getInfoAsync(folderUri);
  if (!info.exists || !info.isDirectory) {
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
  }
  return folderUri;
}

export async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }

  const sdk = typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);

  // Android 11+ uses scoped storage. Downloads go through SAF, which needs no media permissions.
  if (sdk >= 30) {
    return true;
  }

  try {
    const result = await withTimeout(
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]),
      PERMISSION_TIMEOUT_MS,
      "Storage permission request timed out.",
    );
    return (
      result[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED ||
      result[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    // Permission request timed out or failed; continue anyway since SAF will be used.
    return false;
  }
}

async function tryDirectPublicFileDrop(localUri: string, fileName: string): Promise<string | null> {
  const candidates = [
    "file:///storage/emulated/0/Documents/Filora/",
    "file:///storage/emulated/0/Filora/",
  ];

  for (const folder of candidates) {
    try {
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      const dest = `${folder}${fileName}`;
      await FileSystem.copyAsync({ from: localUri, to: dest });
      const copied = await FileSystem.getInfoAsync(dest);
      if (copied.exists) {
        return dest;
      }
    } catch {
      // Try the next public location.
    }
  }
  return null;
}

export const DEFAULT_PUBLIC_DOWNLOAD_PATH = "/storage/emulated/0/Documents/Filora";

function labelFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const primary = decoded.match(/primary:(.+)$/i);
  if (primary?.[1]) {
    return `/storage/emulated/0/${primary[1].replace(/\//g, "/")}`;
  }
  return DEFAULT_PUBLIC_DOWNLOAD_PATH;
}

async function getStoredSafFolder(): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(SAF_URI_STORE);
    if (!info.exists) {
      return null;
    }
    const uri = (await FileSystem.readAsStringAsync(SAF_URI_STORE)).trim();
    if (!uri) {
      return null;
    }
    await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
    return uri;
  } catch {
    return null;
  }
}

export async function getDownloadFolderLabel(): Promise<string> {
  if (Platform.OS !== "android") {
    return `${APP_DOWNLOAD_FOLDER} (app folder)`;
  }
  const stored = await getStoredSafFolder();
  if (stored) {
    return labelFromSafUri(stored);
  }
  return DEFAULT_PUBLIC_DOWNLOAD_PATH;
}

export async function changeDownloadFolder(): Promise<string | null> {
  if (Platform.OS !== "android") {
    return getDownloadFolderLabel();
  }

  const initial = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Documents");
  const permission = await withTimeout(
    FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initial),
    PERMISSION_TIMEOUT_MS,
    "Folder access timed out. Try again and pick Documents → Filora.",
  );
  if (!permission.granted) {
    return null;
  }

  let folderUri = permission.directoryUri;
  const decoded = decodeURIComponent(folderUri).toLowerCase();
  if (!decoded.includes("filora") && !decoded.includes("filedrop")) {
    try {
      folderUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
        permission.directoryUri,
        APP_DOWNLOAD_FOLDER,
      );
    } catch {
      folderUri = permission.directoryUri;
    }
  }

  await FileSystem.writeAsStringAsync(SAF_URI_STORE, folderUri);
  return labelFromSafUri(folderUri);
}

export async function clearAppCache(): Promise<void> {
  const cache = FileSystem.cacheDirectory;
  if (!cache) {
    return;
  }
  const entries = await FileSystem.readDirectoryAsync(cache);
  await Promise.all(
    entries.map((name) => FileSystem.deleteAsync(`${cache}${name}`, { idempotent: true })),
  );
}

function confirmDocumentsFolder(onAwaitingUser?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    onAwaitingUser?.();
    Alert.alert(
      "Allow Filora folder",
      "Tap Allow for storage. If a folder screen opens, open Documents (not Download), then tap USE THIS FOLDER. Filora will be created automatically.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Allow", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function ensurePublicFileDropFolder(onAwaitingUser?: () => void): Promise<string | null> {
  if (Platform.OS !== "android") {
    return null;
  }

  const stored = await getStoredSafFolder();
  if (stored) {
    return stored;
  }

  const allowed = await confirmDocumentsFolder(onAwaitingUser);
  if (!allowed) {
    return null;
  }

  const initial = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Documents");
  const permission = await withTimeout(
    FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initial),
    PERMISSION_TIMEOUT_MS,
    "Folder access timed out. Try Save again and pick Documents → Filora.",
  );
  if (!permission.granted) {
    return null;
  }

  let folderUri = permission.directoryUri;
  const decoded = decodeURIComponent(folderUri).toLowerCase();
  if (!decoded.includes("filora") && !decoded.includes("filedrop")) {
    try {
      folderUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
        permission.directoryUri,
        APP_DOWNLOAD_FOLDER,
      );
    } catch {
      folderUri = permission.directoryUri;
    }
  }

  await FileSystem.writeAsStringAsync(SAF_URI_STORE, folderUri);
  return folderUri;
}

async function copyToSafFolder(folderUri: string, localUri: string, fileName: string): Promise<boolean> {
  try {
    const { stem } = splitName(fileName);
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      folderUri,
      stem,
      mimeTypeForName(fileName),
    );
    // copyAsync doesn't work with SAF URIs; read as base64 and write instead.
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return true;
  } catch {
    return false;
  }
}

export async function saveFileToAppFolder(
  url: string,
  fileName: string,
  headers?: Record<string, string>,
  callbacks?: SaveProgressCallbacks,
): Promise<{ folderName: string; fileName: string; uri: string; publicCopy: boolean }> {
  await requestStoragePermission();

  const folderUri = await ensureAppFileDropFolder();
  const destination = await uniqueLocalPath(folderUri, fileName);
  const savedName = destination.slice(folderUri.length);

  const result = await withLocalWifiRoute(url, () =>
    withTimeout(
      FileSystem.downloadAsync(url, destination, { headers }),
      DOWNLOAD_TIMEOUT_MS,
      "Download timed out. Check your connection and try again.",
    ),
  );
  if (result.status && result.status >= 400) {
    throw new Error(`Download failed (HTTP ${result.status}).`);
  }
  // Redirects (3xx) are not followed by downloadAsync; treat as failure.
  if (result.status && result.status >= 300 && result.status < 400) {
    throw new Error("Download was redirected. Please try scanning the QR code again.");
  }

  const written = await FileSystem.getInfoAsync(result.uri);
  if (!written.exists) {
    throw new Error("The file could not be saved to the Filora folder.");
  }
  // Check that the download has content.
  if (written.size === 0) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error("Download returned empty file. Check connection and try again.");
  }

  let publicCopy = false;
  const publicPath = await tryDirectPublicFileDrop(result.uri, savedName);
  if (publicPath) {
    publicCopy = true;
  } else {
    const safFolder = await ensurePublicFileDropFolder(callbacks?.onAwaitingUser);
    if (safFolder) {
      publicCopy = await copyToSafFolder(safFolder, result.uri, savedName);
    }
  }

  return {
    folderName: APP_DOWNLOAD_FOLDER,
    fileName: savedName,
    uri: publicPath || result.uri,
    publicCopy,
  };
}
