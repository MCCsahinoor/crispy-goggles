import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, SectionList, StyleSheet, View } from "react-native";

import { t } from "../../../i18n";
import { Text } from "../../../utils/disableFontScaling";
import {
  APK_MIME,
  apkFileName,
  appsSupported,
  hasAllFilesAccess,
  listInstalledApps,
  requestAllFilesAccess,
  scanApkFiles,
  type ApkFile,
  type InstalledApp,
} from "../../../services/device/installedApps";
import { useLayout } from "../../../utils/responsive";
import { formatBytes } from "../../../services/api/sendToPc";
import type { OutgoingFile } from "../../../features/filora/services/phone/senderClient";
import { heading, para, useTheme, useThemedStyles, type ThemeColors } from "../../../theme";
import { ConnectButton } from "../ui";
import { CheckCircle, EmptyState, ListHeading, ListShimmer, Segmented, createPickerStyles } from "./pickerUi";

export const APP_PREFIX = "app:";
export const APK_DOC_PREFIX = "doc:apk:";

type Props = {
  query: string;
  selectedIds: ReadonlySet<string>;
  /** Picks for installed apps; `files` carry the app id and label, the real file comes on Next. */
  onToggleApps: (files: OutgoingFile[], select: boolean) => void;
  onAddFiles: (files: OutgoingFile[]) => void;
  onRemove: (ids: string[]) => void;
  /** Already-picked `.apk` files from the Packages view. */
  packages: OutgoingFile[];
  createId: () => string;
};

type ViewMode = "installed" | "packages";
type Section = { key: "new" | "all"; title: string; apps: InstalledApp[]; data: InstalledApp[][] };

const GAP = 8;
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** What a pick of an installed app looks like before Next resolves it. */
export function appPick(app: InstalledApp): OutgoingFile {
  return {
    id: `${APP_PREFIX}${app.packageName}`,
    name: apkFileName(app.label, app.versionName, app.splits > 0),
    uri: `file://${app.apkPath}`,
    size: app.size,
    mimeType: APK_MIME,
  };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

const AppTile = memo(function AppTile({
  app,
  selected,
  width,
  onPress,
}: {
  app: InstalledApp;
  selected: boolean;
  width: number;
  onPress: (app: InstalledApp) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={app.label}
      onPress={() => onPress(app)}
      style={[styles.tile, { width }]}
    >
      <View style={styles.iconWrap}>
        {app.iconUri ? (
          <Image source={{ uri: app.iconUri }} style={styles.icon} contentFit="contain" recyclingKey={app.packageName} transition={0} />
        ) : (
          <View style={[styles.icon, styles.iconFallback]}>
            <Ionicons name="cube-outline" size={26} color={colors.textDim} />
          </View>
        )}
        <View style={styles.tileCheck}>
          <CheckCircle checked={selected} size={18} />
        </View>
      </View>
      <Text style={styles.label} numberOfLines={1}>{app.label}</Text>
      <Text style={styles.size} numberOfLines={1}>
        {formatBytes(app.size)}
        {app.splits > 0 ? " · apks" : ""}
      </Text>
    </Pressable>
  );
});

/** A pick of an APK file found on storage: a plain file, sent as-is. */
export function apkPick(file: ApkFile): OutgoingFile {
  return {
    id: `${APK_DOC_PREFIX}${file.path}`,
    name: file.name,
    uri: `file://${file.path}`,
    size: file.size,
    mimeType: APK_MIME,
  };
}

const ApkRow = memo(function ApkRow({
  file,
  selected,
  onPress,
}: {
  file: ApkFile;
  selected: boolean;
  onPress: (file: ApkFile) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const { colors } = useTheme();
  const title = file.label || file.name;
  const meta = [file.label ? file.name : null, formatBytes(file.size), file.versionName ? `v${file.versionName}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => onPress(file)}
      style={[picker.row, selected && picker.rowSelected]}
    >
      {file.iconUri ? (
        <Image source={{ uri: file.iconUri }} style={styles.rowIcon} contentFit="contain" recyclingKey={file.path} transition={0} />
      ) : (
        <View style={styles.browseIcon}>
          <Ionicons name="logo-android" size={20} color={colors.success} />
        </View>
      )}
      <View style={picker.grow}>
        <Text style={picker.rowName} numberOfLines={1}>{title}</Text>
        <Text style={picker.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <CheckCircle checked={selected} />
    </Pressable>
  );
});

const AppRow = memo(function AppRow({
  row,
  selectedKey,
  width,
  onPress,
}: {
  row: InstalledApp[];
  selectedKey: string;
  width: number;
  onPress: (app: InstalledApp) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: GAP, marginBottom: GAP }}>
      {row.map((app, index) => (
        <AppTile key={app.packageName} app={app} selected={selectedKey[index] === "1"} width={width} onPress={onPress} />
      ))}
    </View>
  );
});

export default function AppsTab({ query, selectedIds, onToggleApps, onAddFiles, onRemove, packages, createId }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const layout = useLayout();
  const [view, setView] = useState<ViewMode>("installed");
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!appsSupported()) {
      setFailed(true);
      return;
    }
    listInstalledApps()
      .then((list) => {
        if (alive) {
          setApps(list);
        }
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const contentWidth = Math.min(layout.width, layout.contentMaxWidth) - layout.gutter * 2;
  const columns = contentWidth >= 560 ? 6 : 4;
  const tileWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  const sections = useMemo<Section[]>(() => {
    const source = apps ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? source.filter((app) => app.label.toLowerCase().includes(needle) || app.packageName.toLowerCase().includes(needle))
      : source;
    const cutoff = Date.now() - NEW_WINDOW_MS;
    const fresh = filtered.filter((app) => app.installedAt >= cutoff).sort((left, right) => right.installedAt - left.installedAt);
    const rest = filtered.filter((app) => app.installedAt < cutoff);
    const out: Section[] = [];
    if (fresh.length > 0) {
      out.push({ key: "new", title: `${t("picker.newApps")} (${fresh.length})`, apps: fresh, data: chunk(fresh, columns) });
    }
    if (rest.length > 0 || fresh.length === 0) {
      out.push({ key: "all", title: `${t("picker.apps")} (${rest.length})`, apps: rest, data: chunk(rest, columns) });
    }
    return out;
  }, [apps, query, columns]);

  const visible = useMemo(() => sections.flatMap((section) => section.apps), [sections]);
  const allSelected = visible.length > 0 && visible.every((app) => selectedIds.has(`${APP_PREFIX}${app.packageName}`));

  const toggleOne = useCallback(
    (app: InstalledApp) => {
      onToggleApps([appPick(app)], !selectedIds.has(`${APP_PREFIX}${app.packageName}`));
    },
    [onToggleApps, selectedIds],
  );

  // ---- APK files on storage ----
  const [storageAccess, setStorageAccess] = useState<boolean | null>(null);
  const [apkFiles, setApkFiles] = useState<ApkFile[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const scanToken = useRef(0);

  const runScan = useCallback(async () => {
    const token = ++scanToken.current;
    setScanning(true);
    setScanFailed(false);
    try {
      const files = await scanApkFiles();
      if (token === scanToken.current) {
        setApkFiles(files);
      }
    } catch {
      if (token === scanToken.current) {
        setScanFailed(true);
        setApkFiles((current) => current ?? []);
      }
    } finally {
      if (token === scanToken.current) {
        setScanning(false);
      }
    }
  }, []);

  const checkStorageAccess = useCallback(async () => {
    const granted = await hasAllFilesAccess();
    setStorageAccess(granted);
    return granted;
  }, []);

  useEffect(() => {
    if (view !== "packages") {
      return;
    }
    let alive = true;
    void checkStorageAccess().then((granted) => {
      if (alive && granted && apkFiles === null) {
        void runScan();
      }
    });
    return () => {
      alive = false;
    };
  }, [view, checkStorageAccess, runScan, apkFiles]);

  // Coming back from the system settings page: pick up the new permission and scan.
  useEffect(() => {
    if (view !== "packages" || storageAccess) {
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkStorageAccess().then((granted) => {
          if (granted) {
            void runScan();
          }
        });
      }
    });
    return () => subscription.remove();
  }, [view, storageAccess, checkStorageAccess, runScan]);

  const askStorageAccess = useCallback(async () => {
    const result = await requestAllFilesAccess();
    if (result === "granted") {
      setStorageAccess(true);
      void runScan();
    }
  }, [runScan]);

  const visibleApks = useMemo(() => {
    const source = apkFiles ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return source;
    }
    return source.filter((file) => file.name.toLowerCase().includes(needle) || (file.label ?? "").toLowerCase().includes(needle));
  }, [apkFiles, query]);

  const allApksSelected = visibleApks.length > 0 && visibleApks.every((file) => selectedIds.has(apkPick(file).id));

  const toggleApkFiles = useCallback(
    (files: ApkFile[], select: boolean) => {
      const picks = files.map(apkPick);
      if (select) {
        onAddFiles(picks);
      } else {
        onRemove(picks.map((pick) => pick.id));
      }
    },
    [onAddFiles, onRemove],
  );

  const toggleApkFile = useCallback(
    (file: ApkFile) => {
      toggleApkFiles([file], !selectedIds.has(apkPick(file).id));
    },
    [selectedIds, toggleApkFiles],
  );

  const browseApk = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [APK_MIME, "application/octet-stream", "application/zip"],
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const known = new Set(packages.map((file) => file.uri));
      const picked: OutgoingFile[] = [];
      for (const asset of result.assets) {
        const name = asset.name ?? "";
        if (known.has(asset.uri) || !/\.(apk|apks|xapk)$/i.test(name)) {
          continue;
        }
        let size = asset.size ?? 0;
        if (size <= 0) {
          try {
            size = new File(asset.uri).size ?? 0;
          } catch {
            size = 0;
          }
        }
        picked.push({ id: `${APK_DOC_PREFIX}${createId()}`, name, uri: asset.uri, size, mimeType: APK_MIME });
      }
      onAddFiles(picked);
    } catch {
      // The picker was dismissed or refused.
    }
  }, [createId, onAddFiles, packages]);

  const segmented = (
    <Segmented
      options={[{ key: "installed", label: t("picker.installed") }, { key: "packages", label: t("picker.packages") }]}
      value={view}
      onChange={setView}
    />
  );

  if (view === "packages") {
    const browseCard = (
      <Pressable onPress={() => { void browseApk(); }} style={({ pressed }) => [styles.browse, pressed && picker.pressed]} accessibilityRole="button">
        <View style={styles.browseIcon}>
          <Ionicons name="logo-android" size={22} color={colors.success} />
        </View>
        <View style={picker.grow}>
          <Text style={picker.rowName}>{t("picker.browseApk")}</Text>
          <Text style={picker.rowMeta}>{t("picker.browseApkHint")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </Pressable>
    );

    if (storageAccess === null) {
      return (
        <View style={styles.fill}>
          {segmented}
          <ListShimmer variant="rows" />
        </View>
      );
    }

    if (!storageAccess) {
      // Without "All files access" Android hides other apps' downloads; offer the settings page
      // and the manual picker, and list whatever was picked that way.
      return (
        <View style={styles.fill}>
          {segmented}
          <View style={styles.permission}>
            <Ionicons name="folder-open-outline" size={30} color={colors.blueSoft} />
            <Text style={styles.permissionTitle}>{t("picker.storageTitle")}</Text>
            <Text style={styles.permissionBody}>{t("picker.storageBody")}</Text>
            <ConnectButton label={t("picker.storageAllow")} onPress={() => { void askStorageAccess(); }} />
          </View>
          {browseCard}
          <FlatList
            data={packages}
            keyExtractor={(file) => file.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: file }) => (
              <View style={[picker.row, picker.rowSelected]}>
                <View style={styles.browseIcon}>
                  <Ionicons name="logo-android" size={20} color={colors.success} />
                </View>
                <View style={picker.grow}>
                  <Text style={picker.rowName} numberOfLines={1}>{file.name}</Text>
                  <Text style={picker.rowMeta}>{formatBytes(file.size)}</Text>
                </View>
                <CheckCircle checked onPress={() => onRemove([file.id])} />
              </View>
            )}
          />
        </View>
      );
    }

    return (
      <View style={styles.fill}>
        {segmented}
        {apkFiles === null ? (
          <>
            <View style={styles.scanRow}>
              <Text style={picker.rowMeta}>{scanFailed ? t("picker.scanFailed") : t("picker.scanning")}</Text>
            </View>
            {!scanFailed && <ListShimmer variant="rows" />}
          </>
        ) : (
          <>
            <ListHeading
              title={`${t("picker.apkFiles")} (${visibleApks.length})`}
              selectAllLabel={t("picker.selectAll")}
              allSelected={allApksSelected}
              onToggleAll={visibleApks.length > 0 ? () => toggleApkFiles(visibleApks, !allApksSelected) : undefined}
            />
            <FlatList
              data={visibleApks}
              keyExtractor={(file) => file.path}
              extraData={selectedIds}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={14}
              windowSize={7}
              refreshing={scanning}
              onRefresh={() => { void runScan(); }}
              ListEmptyComponent={
                <EmptyState icon="logo-android" text={query.trim() ? t("picker.noResults", { query: query.trim() }) : t("picker.noApks")} />
              }
              renderItem={({ item: file }) => (
                <ApkRow file={file} selected={selectedIds.has(apkPick(file).id)} onPress={toggleApkFile} />
              )}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {segmented}
      {failed ? (
        <EmptyState icon="alert-circle-outline" text={t("picker.appsLoadFailed")} />
      ) : apps === null ? (
        <ListShimmer variant="rows" />
      ) : (
        <>
          <ListHeading
            title={`${t("picker.installed")} (${visible.length})`}
            selectAllLabel={t("picker.selectAll")}
            allSelected={allSelected}
            onToggleAll={visible.length > 0 ? () => onToggleApps(visible.map(appPick), !allSelected) : undefined}
          />
          <SectionList
            sections={sections}
            keyExtractor={(row) => row[0].packageName}
            extraData={selectedIds}
            stickySectionHeadersEnabled={false}
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState icon="apps-outline" text={query.trim() ? t("picker.noResults", { query: query.trim() }) : t("picker.empty")} />
            }
            renderSectionHeader={({ section }) => {
              const sectionAll = section.apps.length > 0 && section.apps.every((app) => selectedIds.has(`${APP_PREFIX}${app.packageName}`));
              return (
                <View style={picker.sectionRow}>
                  <Text style={picker.sectionTitle}>{section.title}</Text>
                  {section.apps.length > 0 && (
                    <Pressable onPress={() => onToggleApps(section.apps.map(appPick), !sectionAll)} hitSlop={8} style={picker.selectAll} accessibilityRole="button">
                      <Text style={picker.selectAllText}>{t("picker.selectAll")}</Text>
                      <CheckCircle checked={sectionAll} size={20} />
                    </Pressable>
                  )}
                </View>
              );
            }}
            renderItem={({ item: row }) => (
              <AppRow
                row={row}
                selectedKey={row.map((app) => (selectedIds.has(`${APP_PREFIX}${app.packageName}`) ? "1" : "0")).join("")}
                width={tileWidth}
                onPress={toggleOne}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, gap: 6 },
    spinner: { marginTop: 32 },
    listContent: { paddingBottom: 8 },
    tile: { alignItems: "center", gap: 3, paddingVertical: 4 },
    iconWrap: { width: 60, height: 60, marginBottom: 2 },
    icon: { width: 56, height: 56, borderRadius: 14 },
    iconFallback: { backgroundColor: colors.bgElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    tileCheck: { position: "absolute", right: -2, bottom: -2 },
    label: { ...para(600), color: colors.text, fontSize: 12, textAlign: "center", maxWidth: "100%" },
    size: { ...para(500), color: colors.textMuted, fontSize: 10, textAlign: "center" },
    browse: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 8 },
    browseIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(52,211,153,0.14)", alignItems: "center", justifyContent: "center" },
    rowIcon: { width: 40, height: 40, borderRadius: 10 },
    scanRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 10, paddingBottom: 4 },
    permission: { alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    permissionTitle: { ...heading(600), color: colors.text, fontSize: 14, textAlign: "center" },
    permissionBody: { ...para(500), color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  });
}
