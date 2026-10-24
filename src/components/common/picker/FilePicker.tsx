import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { t } from "../../../i18n";
import { Text, TextInput } from "../../../utils/disableFontScaling";
import {
  getMediaAccess,
  manageLimitedAccess,
  mimeFromName,
  resolveMany,
  type MediaAccess,
  type MediaItem,
  type MediaKind,
} from "../../../services/device/mediaLibrary";
import { useLayout } from "../../../utils/responsive";
import { formatBytes } from "../../../services/api/sendToPc";
import type { OutgoingFile } from "../../../features/filora/services/phone/senderClient";
import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../../../theme";
import { ConnectButton } from "../ui";
import { APK_MIME, exportApp, type ExportedApp } from "../../../services/device/installedApps";
import AppsTab, { APK_DOC_PREFIX, APP_PREFIX } from "./AppsTab";
import MediaTab, { type MediaTabHandle } from "./MediaTab";
import { CheckCircle, EmptyState, ListShimmer, createPickerStyles } from "./pickerUi";

export type FilePickerHandle = { handleBack: () => boolean };

type Tab = MediaKind | "apps" | "files";

type Props = {
  /** Current picks. Media picks carry the media-store id; documents carry a `doc:` id. */
  selected: OutgoingFile[];
  onChange: (next: OutgoingFile[]) => void;
  /** Called with real file paths and sizes, ready to send. */
  onNext: (files: OutgoingFile[]) => void;
  onBack: () => void;
  maxFiles: number;
};

const TOAST_MS = 2800;

const DOC_PREFIX = "doc:";

let idCounter = 0;

/** Ids the transfer protocol accepts: letters, digits, `_` and `-`, 6 to 80 characters. */
export function createTransferId(): string {
  idCounter += 1;
  return `f${Date.now().toString(16)}${idCounter.toString(16)}${Math.floor(Math.random() * 1_000_000).toString(16)}`;
}

function isDocument(file: OutgoingFile): boolean {
  return file.id.startsWith(DOC_PREFIX);
}

function isApp(file: OutgoingFile): boolean {
  return file.id.startsWith(APP_PREFIX);
}

function iconFor(file: OutgoingFile): keyof typeof Ionicons.glyphMap {
  const mime = file.mimeType ?? "";
  if (mime === APK_MIME) return "logo-android";
  if (mime.startsWith("image/")) return "image-outline";
  if (mime.startsWith("video/")) return "videocam-outline";
  if (mime.startsWith("audio/")) return "musical-notes-outline";
  return "document-outline";
}

const FilePicker = forwardRef<FilePickerHandle, Props>(function FilePicker(
  { selected, onChange, onNext, onBack, maxFiles },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("photo");
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState<MediaAccess | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const mediaRef = useRef<MediaTabHandle>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "photo", label: t("picker.tabPhotos") },
    { key: "video", label: t("picker.tabVideos") },
    { key: "audio", label: t("picker.tabMusic") },
    { key: "apps", label: t("picker.tabApps") },
    { key: "files", label: t("picker.tabFiles") },
  ];

  useEffect(() => {
    let alive = true;
    void getMediaAccess(true).then((next) => {
      if (alive) {
        setAccess(next);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    handleBack: () => {
      if (sheetOpen) {
        setSheetOpen(false);
        return true;
      }
      if (preparing) {
        return true;
      }
      return mediaRef.current?.handleBack() ?? false;
    },
  }), [sheetOpen, preparing]);

  const selectedIds = useMemo(() => new Set(selected.map((file) => file.id)), [selected]);

  const addFiles = useCallback(
    (incoming: OutgoingFile[]) => {
      const fresh = incoming.filter((file) => !selectedIds.has(file.id));
      if (fresh.length === 0) {
        return;
      }
      const room = Math.max(0, maxFiles - selected.length);
      if (fresh.length > room) {
        onToast(t("picker.tooMany", { max: maxFiles }));
      }
      if (room === 0) {
        return;
      }
      onChange([...selected, ...fresh.slice(0, room)]);
    },
    [maxFiles, onChange, onToast, selected, selectedIds],
  );

  const removeIds = useCallback(
    (ids: Iterable<string>) => {
      const drop = new Set(ids);
      onChange(selected.filter((file) => !drop.has(file.id)));
    },
    [onChange, selected],
  );

  const toggleMedia = useCallback(
    (items: MediaItem[], select: boolean) => {
      if (!select) {
        removeIds(items.map((item) => item.id));
        return;
      }
      addFiles(items.map((item) => ({ id: item.id, name: item.name, uri: item.id, size: 0, mimeType: mimeFromName(item.name) })));
    },
    [addFiles, removeIds],
  );

  const browseDocuments = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const known = new Set(selected.map((file) => file.uri));
      const picked: OutgoingFile[] = [];
      for (const asset of result.assets) {
        if (known.has(asset.uri)) {
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
        picked.push({
          id: `${DOC_PREFIX}${createTransferId()}`,
          name: asset.name || `file-${picked.length + 1}`,
          uri: asset.uri,
          size,
          mimeType: asset.mimeType ?? mimeFromName(asset.name ?? ""),
        });
      }
      addFiles(picked);
    } catch {
      onToast(t("phone.couldNotPick"));
    }
  }, [addFiles, onToast, selected]);

  const handleManageAccess = useCallback(async () => {
    await manageLimitedAccess();
    setAccess(await getMediaAccess(false));
    setReloadKey((value) => value + 1);
  }, []);

  const handleNext = useCallback(async () => {
    if (selected.length === 0 || preparing) {
      return;
    }
    const mediaIds = selected.filter((file) => !isDocument(file) && !isApp(file)).map((file) => file.id);
    const apps = selected.filter(isApp);
    const total = mediaIds.length + apps.length;
    setPreparing({ done: 0, total });
    const resolved = await resolveMany(mediaIds, (done) => setPreparing({ done, total }));
    const byId = new Map(mediaIds.map((id, index) => [id, resolved[index]] as const));
    // Apps one at a time: a split app is zipped into an .apks bundle here, which is disk-heavy.
    const exported = new Map<string, ExportedApp | null>();
    let done = mediaIds.length;
    for (const app of apps) {
      try {
        exported.set(app.id, await exportApp(app.id.slice(APP_PREFIX.length)));
      } catch {
        exported.set(app.id, null);
      }
      done += 1;
      setPreparing({ done, total });
    }
    const out: OutgoingFile[] = [];
    let skipped = 0;
    for (const file of selected) {
      if (isDocument(file)) {
        out.push({ ...file, id: createTransferId() });
        continue;
      }
      if (isApp(file)) {
        const app = exported.get(file.id);
        if (!app) {
          skipped += 1;
          continue;
        }
        const stem = file.name.replace(/\.(apk|apks)$/i, "");
        out.push({ id: createTransferId(), name: `${stem}.${app.bundle ? "apks" : "apk"}`, uri: app.uri, size: app.size, mimeType: APK_MIME });
        continue;
      }
      const entry = byId.get(file.id);
      if (!entry) {
        skipped += 1;
        continue;
      }
      out.push({ id: createTransferId(), name: file.name, uri: entry.uri, size: entry.size, mimeType: file.mimeType });
    }
    setPreparing(null);
    if (skipped > 0) {
      onToast(t("picker.skipped", { count: skipped }));
    }
    if (out.length > 0) {
      onNext(out);
    }
  }, [onNext, onToast, preparing, selected]);

  const documents = useMemo(() => selected.filter((file) => isDocument(file) && !file.id.startsWith(APK_DOC_PREFIX)), [selected]);
  const packages = useMemo(() => selected.filter((file) => file.id.startsWith(APK_DOC_PREFIX)), [selected]);
  const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);

  // Photos, videos and music are picked with size 0 (the media store has no sizes). Look the real
  // size up in the background so the footer total is right before Next is pressed.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sizeTried = useRef(new Set<string>());
  const [sizing, setSizing] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const unsized = selected.filter((file) => file.size <= 0 && !isDocument(file) && !isApp(file) && !sizeTried.current.has(file.id));
  const unsizedKey = unsized.map((file) => file.id).join("|");

  useEffect(() => {
    if (!unsizedKey) {
      return;
    }
    const ids = unsizedKey.split("|");
    ids.forEach((id) => sizeTried.current.add(id));
    setSizing((count) => count + 1);
    // Not cancelled when the selection changes: the result is merged into the latest selection.
    void resolveMany(ids, undefined, 2).then((resolved) => {
      if (!mounted.current) {
        return;
      }
      setSizing((count) => Math.max(0, count - 1));
      const sizes = new Map<string, number>();
      ids.forEach((id, index) => {
        const size = resolved[index]?.size ?? 0;
        if (size > 0) {
          sizes.set(id, size);
        }
      });
      if (sizes.size === 0) {
        return;
      }
      // Items unpicked in the meantime are simply not in the latest list, so they stay gone.
      onChangeRef.current(selectedRef.current.map((file) => (sizes.has(file.id) ? { ...file, size: sizes.get(file.id) ?? file.size } : file)));
    });
  }, [unsizedKey]);

  const toggleApps = useCallback(
    (files: OutgoingFile[], select: boolean) => {
      if (select) {
        addFiles(files);
      } else {
        removeIds(files.map((file) => file.id));
      }
    },
    [addFiles, removeIds],
  );

  const renderBody = () => {
    if (tab === "apps") {
      return (
        <AppsTab
          query={query}
          selectedIds={selectedIds}
          onToggleApps={toggleApps}
          onAddFiles={addFiles}
          onRemove={removeIds}
          packages={packages}
          createId={createTransferId}
        />
      );
    }
    if (tab === "files") {
      return (
        <View style={styles.fill}>
          <Pressable onPress={() => { void browseDocuments(); }} style={({ pressed }) => [styles.browse, pressed && picker.pressed]} accessibilityRole="button">
            <View style={styles.browseIcon}>
              <Ionicons name="folder-open" size={22} color={colors.blueSoft} />
            </View>
            <View style={picker.grow}>
              <Text style={picker.rowName}>{t("picker.browse")}</Text>
              <Text style={picker.rowMeta}>{t("picker.browseHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
          <FlatList
            data={documents}
            keyExtractor={(file) => file.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState icon="document-outline" text={t("picker.filesEmpty")} />}
            renderItem={({ item: file }) => (
              <View style={[picker.row, picker.rowSelected]}>
                <Ionicons name={iconFor(file)} size={22} color={colors.textMuted} />
                <View style={picker.grow}>
                  <Text style={picker.rowName} numberOfLines={1}>{file.name}</Text>
                  <Text style={picker.rowMeta}>{formatBytes(file.size)}</Text>
                </View>
                <CheckCircle checked onPress={() => removeIds([file.id])} />
              </View>
            )}
          />
        </View>
      );
    }
    if (access === null) {
      return <ListShimmer variant="rows" />;
    }
    if (access === "none") {
      return (
        <View style={styles.permission}>
          <Ionicons name="images-outline" size={34} color={colors.blueSoft} />
          <Text style={styles.permissionTitle}>{t("picker.permissionTitle")}</Text>
          <Text style={styles.permissionBody}>{t("picker.permissionBody")}</Text>
          <ConnectButton label={t("picker.allow")} onPress={() => { void getMediaAccess(true).then(setAccess); }} />
          <Pressable onPress={() => { void Linking.openSettings(); }} hitSlop={8}>
            <Text style={styles.link}>{t("picker.openSettings")}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <MediaTab
        ref={mediaRef}
        kind={tab}
        query={query}
        selectedIds={selectedIds}
        onToggle={toggleMedia}
        access={access}
        onManageAccess={() => { void handleManageAccess(); }}
        reloadKey={reloadKey}
      />
    );
  };

  return (
    <View style={styles.fill}>
      {/* Same gradient banner as the other screens' AppHeader, running edge to edge. */}
      <View style={{ marginHorizontal: -layout.gutter, marginBottom: 8 }}>
      <LinearGradient
        colors={gradients.connect}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>{t("phone.headerSend")}</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.8)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("picker.search")}
            placeholderTextColor="rgba(255,255,255,0.7)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("phone.clear")}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}
        </View>
      </LinearGradient>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent} keyboardShouldPersistTaps="handled">
        {tabs.map((entry) => {
          const active = entry.key === tab;
          return (
            <Pressable
              key={entry.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(entry.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>{renderBody()}</View>

      {!!toast && <Text style={styles.toast}>{toast}</Text>}

      <View style={styles.footer}>
        <Pressable
          onPress={() => setSheetOpen(true)}
          disabled={selected.length === 0}
          style={({ pressed }) => [styles.countPill, selected.length === 0 && styles.countPillEmpty, pressed && picker.pressed]}
          accessibilityRole="button"
        >
          <Text style={[styles.countText, selected.length === 0 && styles.countTextEmpty]} numberOfLines={1}>
            {t("picker.selected", { count: selected.length })}
          </Text>
          {selected.length > 0 && (
            <Text style={styles.countMeta}>{sizing > 0 && totalBytes === 0 ? "…" : `${sizing > 0 ? "≥ " : ""}${formatBytes(totalBytes)}`}</Text>
          )}
        </Pressable>
        <View style={picker.grow}>
          <ConnectButton label={t("phone.next")} disabled={selected.length === 0 || preparing !== null} onPress={() => { void handleNext(); }} />
        </View>
      </View>

      <Modal transparent visible={sheetOpen} animationType="slide" statusBarTranslucent onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} accessibilityRole="button" />
        <View style={[styles.sheet, { maxWidth: layout.modalMaxWidth }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("picker.selected", { count: selected.length })} · {formatBytes(totalBytes)}</Text>
            <Pressable onPress={() => { onChange([]); setSheetOpen(false); }} hitSlop={8}>
              <Text style={styles.link}>{t("picker.clearAll")}</Text>
            </Pressable>
          </View>
          <FlatList
            data={selected}
            keyExtractor={(file) => file.id}
            style={styles.sheetList}
            renderItem={({ item: file }) => (
              <View style={styles.sheetRow}>
                <Ionicons name={iconFor(file)} size={20} color={colors.textMuted} />
                <View style={picker.grow}>
                  <Text style={picker.rowName} numberOfLines={1}>{file.name}</Text>
                  {file.size > 0 && <Text style={picker.rowMeta}>{formatBytes(file.size)}</Text>}
                </View>
                <Pressable onPress={() => removeIds([file.id])} hitSlop={8} accessibilityRole="button">
                  <Ionicons name="close" size={18} color={colors.textDim} />
                </Pressable>
              </View>
            )}
          />
        </View>
      </Modal>

      <Modal transparent visible={preparing !== null} animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
        <View style={styles.preparingBackdrop}>
          <View style={[styles.preparingCard, { maxWidth: layout.modalMaxWidth }]}>
            <ActivityIndicator size="large" color={colors.blueSoft} />
            <Text style={styles.preparingText}>
              {t("picker.preparing")}
              {preparing && preparing.total > 0 ? ` ${preparing.done}/${preparing.total}` : ""}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
});

export default FilePicker;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    spinner: { marginTop: 32 },
    listContent: { paddingBottom: 8 },
    header: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 14, paddingHorizontal: 14 },
    title: { ...heading(700), color: "#FFFFFF", fontSize: 18 },
    search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 6, minHeight: 36, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.32)", paddingHorizontal: 10 },
    searchInput: { ...para(), flex: 1, minWidth: 0, color: "#FFFFFF", fontSize: 13, paddingVertical: 6 },
    tabBar: { flexGrow: 0, flexShrink: 0, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
    tabBarContent: { gap: 4 },
    tab: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.blue },
    tabText: { ...para(600), color: colors.textMuted, fontSize: 13 },
    tabTextActive: { color: colors.blueSoft },
    body: { flex: 1 },
    toast: { ...para(500), color: colors.warning, fontSize: 12, textAlign: "center", paddingTop: 6 },
    footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 6 },
    countPill: { minWidth: 118, minHeight: 52, justifyContent: "center", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.blue, backgroundColor: colors.card, paddingHorizontal: 12 },
    countPillEmpty: { borderColor: colors.border },
    countText: { ...para(700), color: colors.blueSoft, fontSize: 13 },
    countTextEmpty: { color: colors.textDim },
    countMeta: { ...para(500), color: colors.textMuted, fontSize: 10 },
    link: { ...para(700), color: colors.blueSoft, fontSize: 13 },
    browse: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 8 },
    browseIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(59,130,246,0.12)", alignItems: "center", justifyContent: "center" },
    permission: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
    permissionTitle: { ...heading(600), color: colors.text, fontSize: 15, textAlign: "center" },
    permissionBody: { ...para(500), color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: { width: "100%", alignSelf: "center", maxHeight: "70%", backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 14, paddingBottom: 18, borderWidth: 1, borderColor: colors.border },
    sheetHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginVertical: 8 },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
    sheetTitle: { ...heading(600), color: colors.text, fontSize: 14 },
    sheetList: { flexGrow: 0 },
    sheetRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    preparingBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.overlay, padding: 24 },
    preparingCard: { width: "100%", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 22 },
    preparingText: { ...para(600), color: colors.text, fontSize: 14, textAlign: "center" },
  });
}
