import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  getRequiredPermissions,
  openAppSettings,
  requestAppPermission,
  requestRequiredPermissions,
  subscribeToAppActive,
  type PermissionItem,
} from "../lib/permissions";
import {
  changeDownloadFolder,
  clearAppCache,
  DEFAULT_PUBLIC_DOWNLOAD_PATH,
  getDownloadFolderLabel,
} from "../lib/saveDownload";
import {
  radius,
  THEME_MODE_LABELS,
  useTheme,
  useThemedStyles,
  type ThemeColors,
  type ThemeMode,
} from "../theme";
import { checkAndPromptAppUpdate, getAppVersion } from "../lib/inAppUpdates";
import { Divider } from "./ui";

const THEME_OPTIONS: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: "system", icon: "phone-portrait-outline" },
  { mode: "light", icon: "sunny-outline" },
  { mode: "dark", icon: "moon-outline" },
];

type IoniconName = keyof typeof Ionicons.glyphMap;

type SettingsRowProps = {
  icon?: IoniconName;
  iconLabel?: string;
  title: string;
  subtitle?: string;
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

function SettingsRow({
  icon,
  iconLabel,
  title,
  subtitle,
  chevron,
  onPress,
  disabled,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}
    >
      {icon ? (
        <Ionicons name={icon} size={22} color={colors.text} />
      ) : (
        <Text style={styles.iconLabel}>{iconLabel ?? "#"}</Text>
      )}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {chevron && <Ionicons name="chevron-forward" size={16} color={colors.text} />}
    </Pressable>
  );
}

export default function SettingsPanel() {
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [language, setLanguage] = useState("English");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [downloadFolder, setDownloadFolder] = useState(
    Platform.OS === "android" ? DEFAULT_PUBLIC_DOWNLOAD_PATH : "Filora (app folder)",
  );
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);

  const loadFolder = useCallback(async () => {
    try {
      setDownloadFolder(await getDownloadFolderLabel());
    } catch {
      // Keep the default path if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    loadFolder();
  }, [loadFolder]);

  const loadPermissions = useCallback(async () => {
    try {
      setPermissions(await getRequiredPermissions());
    } catch {
      // Keep the last known permission state.
    }
  }, []);

  useEffect(() => {
    loadPermissions();
    const sub = subscribeToAppActive(loadPermissions);
    return () => sub.remove();
  }, [loadPermissions]);

  const handleDownloadFolder = useCallback(async () => {
    if (Platform.OS !== "android") {
      Alert.alert("Download folder", "Files are saved to the Filora folder in this app.");
      return;
    }
    try {
      setBusy(true);
      const next = await changeDownloadFolder();
      if (next) {
        setDownloadFolder(next);
      }
    } catch (error) {
      Alert.alert("Download folder", error instanceof Error ? error.message : "Could not change folder.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert("Clear cache", "Remove temporary files from this app?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await clearAppCache();
            Alert.alert("Cache cleared", "Temporary files were removed.");
          } catch (error) {
            Alert.alert("Clear cache", error instanceof Error ? error.message : "Could not clear cache.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, []);

  const handleCheckUpdates = useCallback(async () => {
    try {
      setBusy(true);
      await checkAndPromptAppUpdate({ manual: true });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDesktop = useCallback(() => {
    Alert.alert(
      "Get Filora Desktop",
      "Install Filora.exe on your Windows PC, then connect this phone with a share link or QR code.",
    );
  }, []);

  const handleRequestPermission = useCallback(
    async (id: PermissionItem["id"]) => {
      try {
        setBusy(true);
        await requestAppPermission(id);
        await loadPermissions();
      } catch (error) {
        Alert.alert("Permissions", error instanceof Error ? error.message : "Could not request permission.");
      } finally {
        setBusy(false);
      }
    },
    [loadPermissions],
  );

  const handleRequestRequiredPermissions = useCallback(async () => {
    try {
      setBusy(true);
      const result = await requestRequiredPermissions();
      await loadPermissions();
      Alert.alert(
        "Permissions",
        result.granted === result.total
          ? "All required permissions are allowed."
          : `${result.granted} of ${result.total} required permissions are allowed.`,
      );
    } catch (error) {
      Alert.alert("Permissions", error instanceof Error ? error.message : "Could not request permissions.");
    } finally {
      setBusy(false);
    }
  }, [loadPermissions]);

  const grantedCount = permissions.filter((item) => item.granted).length;
  const permissionSummary =
    permissions.length === 0
      ? "Camera, location, and storage"
      : grantedCount === permissions.length
        ? "All required permissions allowed"
        : `${grantedCount} of ${permissions.length} allowed`;

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        <SettingsRow
          icon="globe-outline"
          title="Language"
          subtitle={`🇬🇧 ${language}`}
          chevron
          onPress={() => setLanguageOpen(true)}
        />
        <SettingsRow
          icon="color-palette-outline"
          title="Theme"
          subtitle={THEME_MODE_LABELS[mode]}
          chevron
          onPress={() => setThemeOpen(true)}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage</Text>
        <SettingsRow
          icon="folder-outline"
          title="Download folder"
          subtitle={downloadFolder}
          chevron
          onPress={handleDownloadFolder}
          disabled={busy}
        />
        <SettingsRow
          icon="trash-outline"
          title="Clear cache"
          subtitle="Remove temporary files"
          onPress={handleClearCache}
          disabled={busy}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions <Text style={styles.sectionSubtitle}>({permissionSummary})</Text></Text>

        {permissions.map((item) => (
          <SettingsRow
            key={item.id}
            icon={
              item.id === "camera"
                ? "camera-outline"
                : item.id === "location"
                  ? "navigate-outline"
                  : "folder-outline"
            }
            title={item.title}
            subtitle={`${item.granted ? "Allowed" : "Not allowed"} · ${item.subtitle}`}
            chevron={!item.granted}
            onPress={item.granted ? undefined : () => handleRequestPermission(item.id)}
            disabled={busy}
          />
        ))}
        <SettingsRow
          icon="settings-outline"
          title="Open system settings"
          subtitle="Change permissions if the prompt is blocked"
          chevron
          onPress={openAppSettings}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <SettingsRow
          icon="information-circle-outline"
          title="Filora"
          subtitle="Fast & private local file transfer"
          onPress={() => setAboutOpen(true)}
        />
        <SettingsRow
          icon="shield-outline"
          title="Privacy policy"
          onPress={() => setPrivacyOpen(true)}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title="Check for updates"
          subtitle="See if a new version is available."
          onPress={handleCheckUpdates}
        />
        <SettingsRow
          icon="desktop-outline"
          title="Get Filora Desktop"
          subtitle="Download the desktop app for Windows"
          onPress={handleDesktop}
        />
        <SettingsRow iconLabel="#" title="Version" subtitle={getAppVersion()} />
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={colors.blueSoft} />
          <Text style={styles.busyText}>Working...</Text>
        </View>
      )}

      <Modal
        transparent
        visible={languageOpen}
        animationType="fade"
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLanguageOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <Text style={styles.modalTitle}>Language</Text>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setLanguage("English");
                setLanguageOpen(false);
              }}
            >
              <Text style={styles.optionText}>🇬🇧 English</Text>
              <Ionicons name="checkmark" size={18} color={colors.blueSoft} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={themeOpen}
        animationType="fade"
        onRequestClose={() => setThemeOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setThemeOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <Text style={styles.modalTitle}>Theme</Text>
            {THEME_OPTIONS.map((option) => {
              const selected = mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  style={styles.optionRow}
                  onPress={() => {
                    setMode(option.mode);
                    setThemeOpen(false);
                  }}
                >
                  <Ionicons name={option.icon} size={20} color={colors.text} />
                  <Text style={styles.optionText}>{THEME_MODE_LABELS[option.mode]}</Text>
                  {selected && <Ionicons name="checkmark" size={18} color={colors.blueSoft} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={aboutOpen}
        animationType="fade"
        onRequestClose={() => setAboutOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAboutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <Text style={styles.modalTitle}>Filora</Text>
            <Text style={styles.modalBody}>Filora is the phone companion for Filora on Windows. Connect to a share on your PC and save files to your phone — no account required.</Text>
            <Text style={styles.modalBody}>Use Global link when the PC is sharing over the internet. Paste the share URL or scan the Share QR. Mobile data works.</Text>
            <Text style={styles.modalBody}>Use Local network on the same Wi-Fi or PC hotspot. Scan the Wi-Fi QR to join the PC network, then scan the Share QR or paste the local link.</Text>
            <Text style={styles.modalBody}>If the share is password-protected, unlock it on your phone, browse the file list, and save files to your Filora folder. Light and dark themes, connection history, and permission controls are in Settings.</Text>
            <Text style={styles.modalBody}>Requires Filora running on your Windows PC with files added to the share.</Text>
            <Pressable style={styles.modalClose} onPress={() => setAboutOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={privacyOpen}
        animationType="fade"
        onRequestClose={() => setPrivacyOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPrivacyOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <Text style={styles.modalTitle}>Privacy policy</Text>
            <Text style={styles.modalBody}>
              Filora connects directly to Filora on your PC. It does not require an
              account. Share links you paste and files you download stay on this device unless you
              share them yourself.
            </Text>
            <Pressable style={styles.modalClose} onPress={() => setPrivacyOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    wrap: {
      gap: 22,
      paddingTop: 4,
      paddingBottom: 16,
    },
    section: {
      gap: 2,
    },
    sectionTitle: {
      color: colors.blueSoft,
      fontSize: 18,
      fontWeight: "800" as const,
      letterSpacing: 0.2,
      marginBottom: 4,
    },
    sectionSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 14,
      paddingVertical: 12,
    },
    rowCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "600" as const,
    },
    iconLabel: {
      width: 22,
      textAlign: "center" as const,
      color: colors.text,
      fontSize: 20,
      fontWeight: "700" as const,
    },
    rowSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    busyRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    busyText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center" as const,
      paddingHorizontal: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 20,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800" as const,
      marginBottom: 8,
    },
    modalBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    modalClose: {
      marginTop: 8,
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalCloseText: {
      color: colors.text,
      fontWeight: "700" as const,
    },
    optionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingVertical: 12,
    },
    optionText: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: "600" as const,
    },
    pressed: {
      opacity: 0.7,
    },
  };
}
