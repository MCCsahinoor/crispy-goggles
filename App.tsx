import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "./src/lib/disableFontScaling";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import WifiManager from "react-native-wifi-reborn";

import AdBanner from "./src/component/AdBanner";
import { FontProvider } from "./src/component/FontProvider";
import FilesPanel from "./src/component/FilesPanel";
import GlobalConnectPanel from "./src/component/GlobalConnectPanel";
import HistoryPanel, { HistoryEntry } from "./src/component/HistoryPanel";
import HowToUseModal from "./src/component/HowToUseModal";
import LocationRequiredModal from "./src/component/LocationRequiredModal";
import LocalConnectPanel from "./src/component/LocalConnectPanel";
import SendPanel from "./src/component/SendPanel";
import SettingsPanel from "./src/component/SettingsPanel";
import {
  ConnectionMode,
  downloadUrl,
  FILEDROP_UNREACHABLE_MESSAGE,
  fetchFiles,
  fetchSessionInfo,
  parseShareUrl,
  parseWifiQr,
  SharedFile,
  ShareConnection,
  unlockSession,
  isLocalConnection,
  validateModeForConnection,
  authHeaders,
  WifiCredentials,
} from "./src/lib/filedrop";
import { useInAppUpdates } from "./src/hooks/useInAppUpdates";
import { useMobileAds } from "./src/hooks/useMobileAds";
import { useAppInterstitial } from "./src/hooks/useAppInterstitial";
import {
  enableLocationServices,
  getLocationWifiReadiness,
  requestLocationPermission,
} from "./src/lib/permissions";
import { saveFileToAppFolder } from "./src/lib/saveDownload";
import {
  gradients,
  heading,
  para,
  radius,
  ThemeProvider,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "./src/theme";

type Screen = "connect" | "password" | "files";
type ScanPurpose = "share" | "wifi";
type HomeTab = "connect" | "send" | "history" | "settings";

const TOAST_DURATION_MS = 3000;

export default function App() {
  return (
    <FontProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </FontProvider>
  );
}

function AppShell() {
  useInAppUpdates();
  useMobileAds();
  const showInterstitial = useAppInterstitial();
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [screen, setScreen] = useState<Screen>("connect");
  const [homeTab, setHomeTab] = useState<HomeTab>("connect");
  const [helpOpen, setHelpOpen] = useState(true);
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
        setBusyMessage("Loading files...");
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
            showToast("Could not unlock. Check the password and try again.");
          }
          return;
        }
        showToast(error instanceof Error ? error.message : "Something went wrong.");
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
      setBusyMessage("Connecting...");
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
            `PC is in ${info.share_mode === "global" ? "Global link" : "Local network"} mode. ` +
            `Switch the app to match Filora on your PC.`,
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
          setLocalConnectError(FILEDROP_UNREACHABLE_MESSAGE);
        } else {
          showToast(error instanceof Error ? error.message : "Could not connect.");
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
            ? "Paste a local link like http://192.168.137.1:8765/s/9GEL16siviA or scan Share QR."
            : "Paste a valid Filora global link or scan the Share QR.",
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
    setBusyMessage("Unlocking...");
    clearToast();
    try {
      const token = await unlockSession(connection, password);
      setAuthToken(token);
      await loadFiles(connection, token, false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unlock failed.");
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
            ? `Saved to Documents/Filora/${saved.fileName}`
            : `Saved to app Filora folder/${saved.fileName}`,
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Download failed.");
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
          showToast(`Invalid Wi-Fi QR format. Scanned: ${data.slice(0, 50)}`);
          return;
        }
        setWifiDetails(wifi);
        showToast(`Join "${wifi.ssid}" in phone Wi-Fi settings, then scan the Share QR.`);
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
    setLocationModalOpen(true);
  }, []);

  const handleEnableLocation = useCallback(async () => {
    setEnablingLocation(true);
    try {
      const permissionGranted = await requestLocationPermission();
      if (!permissionGranted) {
        showToast("Allow location for Filora in App permissions, then try again.");
        return;
      }
      const enabled = await enableLocationServices();
      if (!enabled) {
        showToast("Location is still off. Turn it on to join Wi-Fi automatically.");
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
            showToast("Camera permission is required to scan QR codes.");
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
    showToast("Nothing to paste from clipboard.");
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
        showToast("Enabling WiFi...");
        await WifiManager.setEnabled(true);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      showToast(`Connecting to ${wifiDetails.ssid}...`);

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
        showToast(`Connected to ${wifiDetails.ssid}! Now scan Share QR.`);
      } else {
        showToast("Connection initiated. Check WiFi settings if not connected.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      if (msg.toLowerCase().includes("location service")) {
        pendingLocationActionRef.current = performWifiConnect;
        setLocationModalOpen(true);
        return;
      }
      showToast(`WiFi error: ${msg}. Opening settings...`);
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
      ? "Scan Wi-Fi QR from Filora Desktop"
      : connectionMode === "local"
        ? "Scan local Share QR from Filora Desktop"
        : "Scan Filora Share QR";

  const glowColor =
    connectionMode === "local" ? "rgba(168,85,247,0.16)" : "rgba(59,130,246,0.16)";

  return (
    <SafeAreaProvider
      initialMetrics={
        initialWindowMetrics &&
        initialWindowMetrics.frame.width > 0 &&
        initialWindowMetrics.frame.height > 0
          ? initialWindowMetrics
          : undefined
      }
    >
      {scanning ? (
        <View style={styles.scanContainer}>
          <StatusBar style="light" />
          <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              scanning
                ? ({ data, raw }) => {
                  handleScanResult(raw ?? data);
                }
                : undefined
            }
          />
          <SafeAreaView edges={["bottom"]} style={styles.scanOverlay}>
            <Text style={styles.scanTitle}>{scanTitle}</Text>
            <Pressable style={({ pressed }) => [styles.scanCancel, pressed && styles.pressed]} onPress={() => setScanning(false)} >
              <Text style={styles.scanCancelText}>Cancel</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <LinearGradient colors={[glowColor, "transparent"]} style={styles.ambientGlow} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image
                source={require("./assets/logo.png")}
                style={styles.logo}
                accessibilityLabel="Filora"
              />
              <View style={styles.headerText}>
                <Text style={styles.title}>Filora</Text>
                <Text style={styles.subtitle}>Connect to Filora on your PC</Text>
              </View>
            </View>
            {screen === "files" ? (
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedBadgeText}>Connected</Text>
              </View>
            ) : (
              <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} style={({ pressed }) => pressed && styles.pressed} >
                <Ionicons name="help-circle-outline" size={26} color={colors.text} />
              </Pressable>
            )}
          </View>

          {screen === "connect" && (
            <>
              {homeTab === "connect" && (
                <View style={styles.modeRow}>
                  <Pressable style={[styles.modeTab, connectionMode === "global" && styles.modeTabGlobal]}
                    onPress={() => {
                      setConnectionMode("global");
                      setLocalConnectError("");
                      clearToast();
                    }}
                  >
                    <Ionicons name="globe-outline" size={16} color={connectionMode === "global" ? colors.blueSoft : colors.textDim} />
                    <Text style={[styles.modeTabText, connectionMode === "global" && styles.modeTabTextGlobal]}> Global link </Text>
                  </Pressable>
                  <Pressable style={[styles.modeTab, connectionMode === "local" && styles.modeTabLocal]}
                    onPress={() => {
                      setConnectionMode("local");
                      setLocalConnectError("");
                      clearToast();
                    }}
                  >
                    <Ionicons name="wifi" size={16} color={connectionMode === "local" ? colors.purpleSoft : colors.textDim} />
                    <Text style={[styles.modeTabText, connectionMode === "local" && styles.modeTabTextLocal]} > Local network </Text>
                  </Pressable>
                </View>
              )}

              <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} >
                {homeTab === "history" ? (
                  <HistoryPanel
                    entries={history}
                    onOpen={(entry) => {
                      setConnectionMode(entry.mode);
                      setShareUrl(entry.url);
                      setLocalConnectError("");
                      setHomeTab("connect");
                    }}
                  />
                ) : homeTab === "settings" ? (
                  <SettingsPanel onOpenHowTo={() => setHelpOpen(true)} />
                ) : homeTab === "send" ? (
                  <SendPanel onToast={showToast} />
                ) : connectionMode === "global" ? (
                  <GlobalConnectPanel
                    shareUrl={shareUrl}
                    onShareUrlChange={setShareUrl}
                    onPasteUrl={handlePasteShareUrl}
                    onConnect={() => connectWithUrl(shareUrl)}
                    onScanShare={() => startScanning("share")}
                    loading={loading}
                  />
                ) : (
                  <LocalConnectPanel
                    wifiDetails={wifiDetails}
                    shareUrl={shareUrl}
                    onShareUrlChange={(url) => {
                      setShareUrl(url);
                      setLocalConnectError("");
                    }}
                    onPasteUrl={handlePasteShareUrl}
                    onScanWifi={() => {
                      setLocalConnectError("");
                      startScanning("wifi");
                    }}
                    onScanShare={() => {
                      setLocalConnectError("");
                      startScanning("share");
                    }}
                    onConnect={() => connectWithUrl(shareUrl)}
                    onConnectToWifi={connectToWifiNetwork}
                    connectError={localConnectError}
                    loading={loading}
                  />
                )}

                {!!message && !loading && (homeTab === "connect" || homeTab === "send") && (
                  <View style={[styles.statusBanner, styles.statusBannerWarning]}>
                    <Text style={[styles.statusBannerText, styles.statusBannerWarningText]}> {message} </Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.adBleed}>
                <AdBanner />
              </View>

              <View style={styles.bottomBar}>
                <Pressable
                  style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
                  onPress={() => {
                    setHomeTab("connect");
                    setConnectionMode("global");
                    setLocalConnectError("");
                    clearToast();
                  }}
                >
                  <Ionicons name="cloud-download-outline" size={20} color={homeTab === "connect" ? colors.blueSoft : colors.textMuted} />
                  <Text style={[styles.bottomItemText, homeTab === "connect" && styles.bottomItemTextActive,]} > Received </Text>
                </Pressable>
                <View style={styles.bottomDivider} />
                <Pressable style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
                  onPress={() => {
                    setHomeTab("send");
                    clearToast();
                  }} >
                  <Ionicons name="cloud-upload-outline" size={20} color={homeTab === "send" ? colors.purpleSoft : colors.textMuted} />
                  <Text style={[styles.bottomItemText, homeTab === "send" && styles.bottomItemTextActive,]} > Send </Text>
                </Pressable>
                <View style={styles.bottomDivider} />
                {/* <Pressable style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]} onPress={() => setHomeTab("history")} >
                  <Ionicons name="time-outline" size={20} color={homeTab === "history" ? colors.blueSoft : colors.textMuted} />
                  <Text style={[ styles.bottomItemText, homeTab === "history" && styles.bottomItemTextActive, ]} > History </Text>
                </Pressable> */}
                <View style={styles.bottomDivider} />
                <Pressable style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]} onPress={() => setHomeTab("settings")} >
                  <Ionicons name="settings-outline" size={20} color={homeTab === "settings" ? colors.purpleSoft : colors.textMuted} />
                  <Text style={[styles.bottomItemText, homeTab === "settings" && styles.bottomItemTextActive]}> Settings </Text>
                </Pressable>
              </View>
            </>
          )}

          {screen === "password" && (
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} >
              <View style={styles.panel}>
                <Text style={styles.label}>Access password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password from PC"
                  placeholderTextColor={colors.textDim}
                  secureTextEntry
                  style={styles.input}
                />
                <Pressable style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed]}
                  onPress={() => {
                    void (async () => {
                      await showInterstitial();
                      await handleUnlock();
                    })();
                  }}
                  disabled={loading}
                >
                  <LinearGradient colors={gradients.connect} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.unlockGradient} >
                    <Text style={styles.unlockText}>Unlock files</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable style={styles.linkButton}
                  onPress={() => {
                    void (async () => {
                      await showInterstitial();
                      resetSession();
                    })();
                  }}
                >
                  <Text style={styles.linkButtonText}>Use another link</Text>
                </Pressable>
              </View>

              {!!message && !loading && (
                <View style={[styles.statusBanner, styles.statusBannerWarning]}>
                  <Text style={[styles.statusBannerText, styles.statusBannerWarningText]}> {message} </Text>
                </View>
              )}
            </ScrollView>
          )}

          {screen === "files" && (
            <FilesPanel
              connectionMode={connectionMode}
              shareUrl={shareUrl}
              files={files}
              message={message}
              loading={loading}
              savingFileId={savingFileId}
              onRefresh={() => connection && loadFiles(connection, authToken)}
              onDownload={handleDownload}
              onDisconnect={resetSession}
            />
          )}
        </SafeAreaView>
      )}

      <LocationRequiredModal
        visible={locationModalOpen}
        enabling={enablingLocation}
        onEnable={() => {
          void handleEnableLocation();
        }}
        onConnectManually={handleConnectManually}
      />

      <HowToUseModal visible={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal
        transparent
        visible={loading && !scanning}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { }}
      >
        <View style={styles.overlayLoaderBackdrop}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color={colors.blueSoft} />
            <Text style={styles.loaderText}>{busyMessage || "Working..."}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaProvider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
    },
    ambientGlow: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 260,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 6,
      paddingBottom: 14,
      gap: 12,
    },
    headerLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    logo: {
      width: 42,
      height: 42,
      borderRadius: 12,
      overflow: "hidden",
    },
    headerText: {
      flex: 1,
    },
    title: {
      ...heading(),
      fontSize: 18,
      color: colors.text, 
      lineHeight: 23,
    },
    subtitle: {
      ...para(500), 
      fontSize: 10,
      lineHeight: 14,
      color: colors.textMuted,
    },
    connectedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.successBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    connectedDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: colors.success,
    },
    connectedBadgeText: {
      ...para(700),
      fontSize: 12,
      color: colors.success,
      lineHeight: 16,
    },
    modeRow: {
      flexDirection: "row",
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      padding: 4,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    modeTab: {
      flex: 1,
      flexDirection: "row",
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: "transparent",
    },
    modeTabGlobal: {
      borderWidth: 1,
      borderColor: colors.blue,
      backgroundColor: "rgba(59,130,246,0.08)",
    },
    modeTabLocal: {
      borderWidth: 1,
      borderColor: colors.purple,
      backgroundColor: "rgba(168,85,247,0.08)",
    },
    modeTabText: {
      ...para(700),
      color: colors.textDim,
      fontSize: 13,
      lineHeight: 18,
    },
    modeTabTextGlobal: {
      color: colors.blueSoft,
    },
    modeTabTextLocal: {
      color: colors.purpleSoft,
    },
    panel: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      ...heading(),
      fontSize: 12,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    input: {
      ...para(),
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 14,
      backgroundColor: colors.inputBg,
      color: colors.text,
    },
    unlockButton: {
      borderRadius: radius.md,
      overflow: "hidden",
    },
    unlockGradient: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    unlockText: {
      ...para(700),
      color: "#fff",
      fontSize: 15,
    },
    linkButton: {
      alignItems: "center",
      paddingVertical: 4,
    },
    linkButtonText: {
      ...para(600),
      color: colors.blueSoft,
      fontSize: 14,
    },
    statusBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(59,130,246,0.12)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: "rgba(59,130,246,0.28)",
      marginTop: 12,
    },
    statusBannerWarning: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningBorder,
    },
    statusBannerText: {
      ...para(500),
      flex: 1,
      color: colors.blueSoft,
      fontSize: 13,
      lineHeight: 18,
    },
    statusBannerWarningText: {
      color: colors.warning,
    },
    adBleed: {
      marginHorizontal: -16,
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
      paddingBottom: 6,
    },
    bottomItem: {
      flex: 1,
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
    },
    bottomItemText: {
      ...para(700),
      color: colors.textMuted,
      fontSize: 12,
    },
    bottomItemTextActive: {
      color: colors.text,
    },
    bottomDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: colors.borderStrong,
    },
    overlayLoaderBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    loaderCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 32,
      paddingVertical: 28,
      alignItems: "center",
      gap: 16,
      minWidth: 220,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loaderText: {
      ...para(600),
      fontSize: 16,
      color: colors.text,
      textAlign: "center",
    },
    pressed: {
      opacity: 0.75,
    },
    camera: {
      flex: 1,
    },
    scanContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    scanOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    scanTitle: {
      ...heading(),
      color: "#fff",
      fontSize: 18,
      textAlign: "center",
      backgroundColor: "rgba(7, 8, 13, 0.7)",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
    },
    scanCancel: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 28,
      alignItems: "center",
      backgroundColor: colors.card,
    },
    scanCancelText: {
      ...para(700),
      color: colors.text,
      fontSize: 15,
    },
  });
}
