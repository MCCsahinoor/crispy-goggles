import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  View,
} from "react-native";

import { LANGUAGES, t, useI18n, type TranslationKey } from "../i18n";
import { Text } from "../lib/disableFontScaling";

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
  heading,
  para,
  radius,
  useTheme,
  useThemedStyles,
  type ThemeColors,
  type ThemeMode,
} from "../theme";
import { shareFiloraApp } from "../lib/shareApp";
import { checkAndPromptAppUpdate, getAppVersion } from "../lib/inAppUpdates";
import {
  FILORA_PRIVACY_URL,
  FILORA_WEBSITE_URL,
  FILORA_WINDOWS_DOWNLOAD_URL,
} from "../lib/links";
import ModalFrame from "./ModalFrame";
import { Divider } from "./ui";

const THEME_OPTIONS: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: "system", icon: "phone-portrait-outline" },
  { mode: "light", icon: "sunny-outline" },
  { mode: "dark", icon: "moon-outline" },
];

const THEME_LABEL_KEYS: Record<ThemeMode, TranslationKey> = {
  system: "settings.theme.system",
  light: "settings.theme.light",
  dark: "settings.theme.dark",
};

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

type SettingsPanelProps = {
  onOpenHowTo?: () => void;
};

export default function SettingsPanel({ onOpenHowTo }: SettingsPanelProps) {
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { language, setLanguage } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [downloadFolder, setDownloadFolder] = useState(
    Platform.OS === "android" ? DEFAULT_PUBLIC_DOWNLOAD_PATH : t("settings.folderIosPath"),
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
      Alert.alert(t("settings.downloadFolder"), t("settings.folderIosBody"));
      return;
    }
    try {
      setBusy(true);
      const next = await changeDownloadFolder();
      if (next) {
        setDownloadFolder(next);
      }
    } catch (error) {
      Alert.alert(t("settings.downloadFolder"), error instanceof Error ? error.message : t("settings.couldNotChangeFolder"));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(t("settings.clearCache"), t("settings.clearCacheConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.clear"),
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await clearAppCache();
            Alert.alert(t("settings.cacheCleared"), t("settings.cacheClearedBody"));
          } catch (error) {
            Alert.alert(t("settings.clearCache"), error instanceof Error ? error.message : t("settings.couldNotClearCache"));
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
    Linking.openURL(FILORA_WINDOWS_DOWNLOAD_URL);
  }, []);

  const handleRequestPermission = useCallback(
    async (id: PermissionItem["id"]) => {
      try {
        setBusy(true);
        await requestAppPermission(id);
        await loadPermissions();
      } catch (error) {
        Alert.alert(t("settings.permissions"), error instanceof Error ? error.message : t("settings.couldNotRequestPermission"));
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
        t("settings.permissions"),
        result.granted === result.total
          ? t("settings.allRequiredAllowed")
          : t("settings.someRequiredAllowed", { granted: result.granted, total: result.total }),
      );
    } catch (error) {
      Alert.alert(t("settings.permissions"), error instanceof Error ? error.message : t("settings.couldNotRequestPermissions"));
    } finally {
      setBusy(false);
    }
  }, [loadPermissions]);

  const grantedCount = permissions.filter((item) => item.granted).length;
  const permissionSummary =
    permissions.length === 0
      ? t("settings.permissionsNone")
      : grantedCount === permissions.length
        ? t("settings.permissionsAll")
        : t("settings.permissionsSome", { granted: grantedCount, total: permissions.length });

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.general")}</Text>
        <SettingsRow
          icon="help-circle-outline"
          title={t("settings.howTo")}
          subtitle={t("settings.howToSubtitle")}
          chevron
          onPress={onOpenHowTo}
        />
        <SettingsRow
          icon="globe-outline"
          title={t("settings.language")}
          subtitle={LANGUAGES.find((item) => item.code === language)?.label}
          chevron
          onPress={() => setLanguageOpen(true)}
        />
        <SettingsRow
          icon="color-palette-outline"
          title={t("settings.theme")}
          subtitle={t(THEME_LABEL_KEYS[mode])}
          chevron
          onPress={() => setThemeOpen(true)}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.storage")}</Text>
        <SettingsRow
          icon="folder-outline"
          title={t("settings.downloadFolder")}
          subtitle={downloadFolder}
          chevron
          onPress={handleDownloadFolder}
          disabled={busy}
        />
        <SettingsRow
          icon="trash-outline"
          title={t("settings.clearCache")}
          subtitle={t("settings.clearCacheSubtitle")}
          onPress={handleClearCache}
          disabled={busy}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.permissions")} <Text style={styles.sectionSubtitle}>({permissionSummary})</Text></Text>

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
            subtitle={`${item.granted ? t("settings.allowed") : t("settings.notAllowed")} · ${item.subtitle}`}
            chevron={!item.granted}
            onPress={item.granted ? undefined : () => handleRequestPermission(item.id)}
            disabled={busy}
          />
        ))}
        <SettingsRow
          icon="settings-outline"
          title={t("settings.openSystemSettings")}
          subtitle={t("settings.openSystemSettingsSubtitle")}
          chevron
          onPress={openAppSettings}
        />
      </View>

      <Divider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.about")}</Text>
        <SettingsRow
          icon="information-circle-outline"
          title="Filora"
          subtitle={t("settings.aboutTagline")}
          onPress={() => setAboutOpen(true)}
        />
        <SettingsRow
          icon="globe-outline"
          title={t("settings.website")}
          subtitle="filora-two.vercel.app"
          chevron
          onPress={() => Linking.openURL(FILORA_WEBSITE_URL)}
        />
        <SettingsRow
          icon="shield-outline"
          title={t("settings.privacy")}
          onPress={() => setPrivacyOpen(true)}
        />
        <SettingsRow
          icon="share-social-outline"
          title={t("settings.shareApp")}
          subtitle={t("settings.shareAppSubtitle")}
          chevron
          onPress={() => {
            void shareFiloraApp();
          }}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title={t("settings.checkUpdates")}
          subtitle={t("settings.checkUpdatesSubtitle")}
          onPress={handleCheckUpdates}
        />
        <SettingsRow
          icon="desktop-outline"
          title={t("settings.getDesktop")}
          subtitle={t("settings.getDesktopSubtitle")}
          chevron
          onPress={handleDesktop}
        />
        <SettingsRow iconLabel="#" title={t("settings.version")} subtitle={getAppVersion()} />
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={colors.blueSoft} />
          <Text style={styles.busyText}>{t("common.working")}</Text>
        </View>
      )}

      <ModalFrame
        visible={languageOpen}
        onClose={() => setLanguageOpen(false)}
        gap={4}
        scroll={false}
        accessibilityLabel={t("settings.closeLanguage")}
        header={<Text style={styles.modalTitle}>{t("settings.language")}</Text>}
      >
        <View style={styles.languageGrid}>
          {LANGUAGES.map((option) => {
            const selected = language === option.code;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.languageCard,
                  selected && styles.languageCardSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setLanguage(option.code);
                  setLanguageOpen(false);
                }}
              >
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.languageCopy}>
                  <Text style={styles.languageLabel} numberOfLines={1}>
                    {option.label}
                  </Text>
                  <Text style={styles.languageSubLabel} numberOfLines={1}>
                    {option.subLabel}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ModalFrame>

      <ModalFrame
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        gap={4}
        header={<Text style={styles.modalTitle}>{t("settings.theme")}</Text>}
      >
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
              <Text style={styles.optionText}>{t(THEME_LABEL_KEYS[option.mode])}</Text>
              {selected && <Ionicons name="checkmark" size={18} color={colors.blueSoft} />}
            </Pressable>
          );
        })}
      </ModalFrame>

      <ModalFrame
        visible={aboutOpen}
        onClose={() => setAboutOpen(false)}
        gap={8}
        header={<Text style={styles.modalTitle}>Filora</Text>}
        footer={
          <Pressable style={styles.modalClose} onPress={() => setAboutOpen(false)}>
            <Text style={styles.modalCloseText}>{t("common.close")}</Text>
          </Pressable>
        }
      >
        <Text style={styles.modalBody}>{t("settings.aboutP1")}</Text>
        <Text style={styles.modalBody}>{t("settings.aboutP2")}</Text>
        <Text style={styles.modalBody}>{t("settings.aboutP3")}</Text>
        <Text style={styles.modalBody}>{t("settings.aboutP4")}</Text>
        <Text style={styles.modalBody}>{t("settings.aboutP5")}</Text>
      </ModalFrame>

      <ModalFrame
        visible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        gap={8}
        header={<Text style={styles.modalTitle}>{t("settings.privacy")}</Text>}
        footer={
          <Pressable style={styles.modalClose} onPress={() => setPrivacyOpen(false)}>
            <Text style={styles.modalCloseText}>{t("common.close")}</Text>
          </Pressable>
        }
      >
        <Text style={styles.modalBody}>{t("settings.privacyBody")}</Text>
        <Pressable
          style={({ pressed }) => [styles.readMore, pressed && styles.pressed]}
          onPress={() => Linking.openURL(FILORA_PRIVACY_URL)}
        >
          <Text style={styles.readMoreText}>{t("common.readMore")}</Text>
          <Ionicons name="open-outline" size={15} color={colors.blueSoft} />
        </Pressable>
      </ModalFrame>
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
      ...heading(700),
      color: colors.blueSoft,
      fontSize: 16, 
      lineHeight: 23,
      marginBottom: 0,
    },
    sectionSubtitle: {
      ...para(),
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
      ...heading(500),
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    iconLabel: {
      width: 22,
      textAlign: "center" as const,
      color: colors.text,
      fontSize: 20,
      fontWeight: "700" as const,
    },
    rowSubtitle: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    busyRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    busyText: {
      ...para(),
      color: colors.textMuted,
      fontSize: 13,
    },
    modalTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
    },
    modalBody: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    readMore: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      alignSelf: "flex-start" as const,
      gap: 6,
      marginTop: 8,
      marginBottom: 4,
    },
    readMoreText: {
      ...para(700),
      color: colors.blueSoft,
      fontSize: 14,
    },
    modalClose: {
      marginTop: 4,
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalCloseText: {
      ...para(700),
      color: colors.text,
    },
    optionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingVertical: 12,
    },
    optionText: {
      ...para(600),
      flex: 1,
      color: colors.text,
      fontSize: 12,
      lineHeight: 16,
    },
    languageGrid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 10,
    },
    languageCard: {
      flexBasis: "47%" as const,
      flexGrow: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: "transparent",
      backgroundColor: colors.cardAlt,
    },
    languageCardSelected: {
      borderColor: colors.blueSoft,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.textDim,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    radioOuterSelected: {
      borderColor: colors.blueSoft,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.blueSoft,
    },
    languageCopy: {
      flex: 1,
      minWidth: 0,
    },
    languageLabel: {
      ...para(600),
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    languageSubLabel: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 15,
    },
    pressed: {
      opacity: 0.7,
    },
  };
}
