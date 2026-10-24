import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { router, usePathname } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { Platform, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import WifiManager from "react-native-wifi-reborn";

import { ROUTES } from "../../../constants";
import { useI18n, t } from "../../../i18n";
import { useAppInterstitial } from "../../../hooks/useAppInterstitial";
import { HistoryEntry } from "../../../components/filora/HistoryPanel";
import {
  ConnectionMode,
  ShareConnection,
  WifiCredentials,
  SharedFile,
  fetchFiles,
  validateModeForConnection,
  fetchSessionInfo,
  isLocalConnection,
  getUnreachableMessage,
  parseShareUrl,
  unlockSession,
  downloadUrl,
  authHeaders,
  parseWifiQr,
} from "../../../services/api/filedrop";
import {
  type LocationWifiReadiness,
  getLocationWifiReadiness,
  requestLocationPermission,
  enableLocationServices,
} from "../../../services/device/permissions";
import { saveFileToAppFolder } from "../../../services/device/saveDownload";

type Screen = "connect" | "password" | "files";
type ScanPurpose = "share" | "wifi";
export type HomeTab = "connect" | "send" | "history";

const TOAST_DURATION_MS = 3000;

let pcHelpShown = false;

export function usePcSession() {
  useI18n(); // re-render on language change
  const showInterstitial = useAppInterstitial();
  // The current step is the current route: /pc, /pc/password or /pc/files.
  const pathname = usePathname();
  const screen: Screen = pathname.endsWith("/files")
    ? "files"
    : pathname.endsWith("/password")
      ? "password"
      : "connect";
  const setScreen = useCallback((next: Screen) => {
    router.replace(
      next === "files" ? ROUTES.pcFiles : next === "password" ? ROUTES.pcPassword : ROUTES.pc,
    );
  }, []);
  const [homeTab, setHomeTab] = useState<HomeTab>("connect");
  const [helpOpen, setHelpOpen] = useState(false);
  // Show the how-to once per app session, the first time the PC flow opens.
  useEffect(() => {
    if (!pcHelpShown) {
      pcHelpShown = true;
      setHelpOpen(true);
    }
  }, []);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("global");
  const [connection, setConnection] = useState<ShareConnection | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [wifiDetails, setWifiDetails] = useState<WifiCredentials | null>(null);
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [message, setMessage] = useState("");
  const [localConnectError, setLocalConnectError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPurpose, setScanPurpose] = useState<ScanPurpose>("share");
  const scanPurposeRef = useRef<ScanPurpose>("share");
  const pendingLocationActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalReason, setLocationModalReason] = useState<Exclude<LocationWifiReadiness, "ready">>("permission_denied");
  const [enablingLocation, setEnablingLocation] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rememberConnection = useCallback((url: string, mode: ConnectionMode) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    setHistory((prev) => [
      { url: trimmed, mode, at: Date.now() },
      ...prev.filter((entry) => entry.url !== trimmed),
    ].slice(0, 12));
  }, []);

  const clearToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setMessage("");
  }, []);

  const showToast = useCallback((text: string) => {
    setMessage(text);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setMessage("");
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const resetSession = useCallback(() => {
    setScreen("connect");
    setHomeTab("connect");
    setConnection(null);
    setAuthToken(null);
    setShareUrl("");
    setPassword("");
    setFiles([]);
    clearToast();
    setLoading(false);
    setBusyMessage("");
    setSavingFileId(null);
    setScanning(false);
    setScanPurpose("share");
    setWifiDetails(null);
    setLocalConnectError("");
  }, [clearToast]);

  const loadFiles = useCallback(
    async (active: ShareConnection, token?: string | null, manageLoading = true) => {
      if (manageLoading) {
        setLoading(true);
        setBusyMessage(t("connect.loadingFiles"));
      }
      clearToast();
      try {
        const nextFiles = await fetchFiles(active, token);
        setFiles(nextFiles);
        setScreen("files");
      } catch (error) {
        if (error instanceof Error && error.message === "PASSWORD_REQUIRED") {
          setScreen("password");
          if (token) {
            showToast(t("connect.unlockCheckPassword"));
          }
          return;
        }
        showToast(error instanceof Error ? error.message : t("connect.somethingWrong"));
      } finally {
        if (manageLoading) {
          setLoading(false);
          setBusyMessage("");
        }
      }
    },
    [clearToast, showToast],
  );

  const connectWithConnection = useCallback(
    async (parsed: ShareConnection, rawUrl?: string) => {
      const modeError = validateModeForConnection(connectionMode, parsed);
      if (modeError) {
        showToast(modeError);
        return;
      }

      setLoading(true);
      setBusyMessage(t("connect.connecting"));
      clearToast();
      setLocalConnectError("");
      if (rawUrl) {
        setShareUrl(rawUrl.trim());
      }
      setConnection(parsed);
      setAuthToken(null);
      setPassword("");

      try {
        const info = await fetchSessionInfo(parsed);
        if (
          info.share_mode &&
          info.share_mode !== connectionMode &&
          !(connectionMode === "global" && !isLocalConnection(parsed))
        ) {
          showToast(
            t("connect.pcModeMismatch", {
              mode: info.share_mode === "global" ? t("mode.global") : t("mode.local"),
            }),
          );
          setConnection(null);
          return;
        }
        rememberConnection(rawUrl?.trim() || shareUrl, connectionMode);
        if (info.password_required) {
          setScreen("password");
        } else {
          await loadFiles(parsed, null, false);
        }
      } catch (error) {
        setConnection(null);
        if (connectionMode === "local") {
          setLocalConnectError(getUnreachableMessage(true));
        } else {
          showToast(error instanceof Error ? error.message : t("connect.couldNotConnect"));
        }
      } finally {
        setLoading(false);
        setBusyMessage("");
      }
    },
    [clearToast, connectionMode, loadFiles, rememberConnection, shareUrl, showToast],
  );

  const connectWithUrl = useCallback(
    async (rawUrl: string) => {
      const parsed = parseShareUrl(rawUrl);
      if (!parsed) {
        showToast(
          connectionMode === "local"
            ? t("connect.pasteLocalHint")
            : t("connect.pasteGlobalHint"),
        );
        return;
      }
      await connectWithConnection(parsed, rawUrl);
    },
    [connectWithConnection, connectionMode, showToast],
  );

  const handleUnlock = useCallback(async () => {
    if (!connection) {
      return;
    }
    setLoading(true);
    setBusyMessage(t("connect.unlocking"));
    clearToast();
    try {
      const token = await unlockSession(connection, password);
      setAuthToken(token);
      await loadFiles(connection, token, false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("connect.unlockFailed"));
    } finally {
      setLoading(false);
      setBusyMessage("");
    }
  }, [clearToast, connection, loadFiles, password, showToast]);

  const handleDownload = useCallback(
    async (file: SharedFile) => {
      if (!connection || savingFileId) {
        return;
      }
      setSavingFileId(file.id);
      clearToast();
      try {
        const url = downloadUrl(connection, file.id);
        const saved = await saveFileToAppFolder(
          url,
          file.name,
          authToken ? authHeaders(authToken) : undefined,
          {
            onAwaitingUser: () => setSavingFileId(null),
          },
        );
        showToast(
          saved.publicCopy
            ? t("connect.savedPublic", { file: saved.fileName })
            : t("connect.savedApp", { file: saved.fileName }),
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : t("connect.downloadFailed"));
      } finally {
        setSavingFileId(null);
      }
    },
    [authToken, clearToast, connection, savingFileId, showToast],
  );

  const handleScanResult = useCallback(
    (data: string) => {
      setScanning(false);

      const upper = data.trim().toUpperCase();
      const isWifiScan = scanPurposeRef.current === "wifi" || upper.startsWith("WIFI:");

      if (isWifiScan) {
        const wifi = parseWifiQr(data);
        if (!wifi) {
          showToast(t("connect.invalidWifiQr", { data: data.slice(0, 50) }));
          return;
        }
        setWifiDetails(wifi);
        showToast(t("connect.joinWifi", { ssid: wifi.ssid }));
        return;
      }

      connectWithUrl(data);
    },
    [connectWithUrl, showToast],
  );

  const runAfterLocationReady = useCallback(async (action: () => void | Promise<void>) => {
    if (Platform.OS !== "android") {
      await action();
      return;
    }
    const readiness = await getLocationWifiReadiness();
    if (readiness === "ready") {
      await action();
      return;
    }
    pendingLocationActionRef.current = action;
    setLocationModalReason(readiness);
    setLocationModalOpen(true);
  }, []);

  const handleEnableLocation = useCallback(async () => {
    setEnablingLocation(true);
    try {
      const permissionGranted = await requestLocationPermission();
      if (!permissionGranted) {
        showToast(t("connect.allowLocationInSettings"));
        return;
      }
      const enabled = await enableLocationServices();
      if (!enabled) {
        showToast(t("connect.locationStillOff"));
        return;
      }
      setLocationModalOpen(false);
      const action = pendingLocationActionRef.current;
      pendingLocationActionRef.current = null;
      if (action) {
        await action();
      }
    } finally {
      setEnablingLocation(false);
    }
  }, [showToast]);

  const handleConnectManually = useCallback(() => {
    setLocationModalOpen(false);
    pendingLocationActionRef.current = null;
    if (Platform.OS === "android") {
      void Linking.sendIntent("android.settings.WIFI_SETTINGS");
    }
  }, []);

  const startScanning = useCallback(
    async (purpose: ScanPurpose) => {
      const beginScan = async () => {
        if (!permission?.granted) {
          const result = await requestPermission();
          if (!result.granted) {
            showToast(t("connect.cameraRequired"));
            return;
          }
        }
        scanPurposeRef.current = purpose;
        setScanPurpose(purpose);
        setScanning(true);
        clearToast();
      };

      if (purpose === "wifi") {
        await runAfterLocationReady(beginScan);
        return;
      }
      await beginScan();
    },
    [clearToast, permission, requestPermission, runAfterLocationReady, showToast],
  );

  const handlePasteShareUrl = useCallback(async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) {
      setShareUrl(text);
      setLocalConnectError("");
      clearToast();
      return;
    }
    showToast(t("connect.nothingToPaste"));
  }, [clearToast, showToast]);

  const performWifiConnect = useCallback(async () => {
    if (!wifiDetails) {
      return;
    }

    if (Platform.OS !== "android") {
      await Linking.openSettings();
      return;
    }

    try {
      const isEnabled = await WifiManager.isEnabled();
      if (!isEnabled) {
        showToast(t("connect.enablingWifi"));
        await WifiManager.setEnabled(true);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      showToast(t("connect.connectingTo", { ssid: wifiDetails.ssid }));

      try {
        await WifiManager.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      await WifiManager.connectToProtectedSSID(
        wifiDetails.ssid,
        wifiDetails.password,
        false,
        false,
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const currentSSID = await WifiManager.getCurrentWifiSSID();
      if (currentSSID === wifiDetails.ssid) {
        showToast(t("connect.connectedTo", { ssid: wifiDetails.ssid }));
      } else {
        showToast(t("connect.connectionInitiated"));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("connect.connectionFailed");
      if (msg.toLowerCase().includes("location service")) {
        pendingLocationActionRef.current = performWifiConnect;
        setLocationModalOpen(true);
        return;
      }
      showToast(t("connect.wifiError", { msg }));
      setTimeout(() => {
        Linking.sendIntent("android.settings.WIFI_SETTINGS");
      }, 1500);
    }
  }, [showToast, wifiDetails]);

  const connectToWifiNetwork = useCallback(async () => {
    if (!wifiDetails) {
      return;
    }
    await runAfterLocationReady(performWifiConnect);
  }, [performWifiConnect, runAfterLocationReady, wifiDetails]);

  const scanTitle =
    scanPurpose === "wifi"
      ? t("scan.wifiTitle")
      : connectionMode === "local"
        ? t("scan.localShareTitle")
        : t("scan.shareTitle");

  return {
    screen,
    setScreen,
    homeTab,
    setHomeTab,
    helpOpen,
    setHelpOpen,
    history,
    setHistory,
    connectionMode,
    setConnectionMode,
    connection,
    setConnection,
    authToken,
    setAuthToken,
    shareUrl,
    setShareUrl,
    wifiDetails,
    setWifiDetails,
    password,
    setPassword,
    files,
    setFiles,
    message,
    setMessage,
    localConnectError,
    setLocalConnectError,
    loading,
    setLoading,
    busyMessage,
    setBusyMessage,
    savingFileId,
    setSavingFileId,
    scanning,
    setScanning,
    scanPurpose,
    setScanPurpose,
    scanPurposeRef,
    pendingLocationActionRef,
    locationModalOpen,
    setLocationModalOpen,
    locationModalReason,
    setLocationModalReason,
    enablingLocation,
    setEnablingLocation,
    permission,
    requestPermission,
    toastTimerRef,
    rememberConnection,
    clearToast,
    showToast,
    resetSession,
    loadFiles,
    connectWithConnection,
    connectWithUrl,
    handleUnlock,
    handleDownload,
    handleScanResult,
    runAfterLocationReady,
    handleEnableLocation,
    handleConnectManually,
    startScanning,
    handlePasteShareUrl,
    performWifiConnect,
    connectToWifiNetwork,
    scanTitle,
    showInterstitial,
  };
}

export type PcSession = ReturnType<typeof usePcSession>;

// Shared by the /pc layout and its sub-pages so state survives moving between steps.
export const PcSessionContext = createContext<PcSession | null>(null);

export function usePcSessionContext(): PcSession {
  const session = useContext(PcSessionContext);
  if (!session) {
    throw new Error("usePcSessionContext must be used inside the /pc layout");
  }
  return session;
}
