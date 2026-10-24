import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as VideoThumbnails from "expo-video-thumbnails";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { FlatList, Pressable, SectionList, StyleSheet, View } from "react-native";

import { t } from "../../../i18n";
import { Text } from "../../../utils/disableFontScaling";
import {
  dayKey,
  formatDuration,
  listFolders,
  listMedia,
  resolveMedia,
  type MediaAccess,
  type MediaFolder,
  type MediaItem,
  type MediaKind,
} from "../../../services/device/mediaLibrary";
import { useLayout } from "../../../utils/responsive";
import { formatBytes } from "../../../services/api/sendToPc";
import { para, radius, useTheme, useThemedStyles, type ThemeColors } from "../../../theme";
import { CheckCircle, EmptyState, ListHeading, ListShimmer, Segmented, createPickerStyles } from "./pickerUi";

export type MediaTabHandle = { handleBack: () => boolean };

type Props = {
  kind: MediaKind;
  query: string;
  selectedIds: ReadonlySet<string>;
  onToggle: (items: MediaItem[], select: boolean) => void;
  access: MediaAccess;
  onManageAccess: () => void;
  /** Bump to reload after the person changes which items are shared. */
  reloadKey: number;
};

type ViewMode = "all" | "folders";

type Section = { key: string; title: string; items: MediaItem[]; data: MediaItem[][] };

const PHOTO_GAP = 4;

// ---- Video thumbnails: generated on demand, two at a time, cached for the session. ----

const thumbCache = new Map<string, string | null>();
const thumbInflight = new Map<string, Promise<string | null>>();
const thumbQueue: (() => void)[] = [];
let thumbActive = 0;

function acquireThumbSlot(): Promise<void> {
  if (thumbActive < 2) {
    thumbActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    thumbQueue.push(() => {
      thumbActive += 1;
      resolve();
    });
  });
}

function releaseThumbSlot(): void {
  thumbActive -= 1;
  thumbQueue.shift()?.();
}

async function makeThumb(item: MediaItem): Promise<string | null> {
  await acquireThumbSlot();
  try {
    try {
      return (await VideoThumbnails.getThumbnailAsync(item.id, { time: 500, quality: 0.35 })).uri;
    } catch {
      // Some devices refuse content:// here; retry with the real file path.
      const { uri } = await resolveMedia(item.id);
      return (await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.35 })).uri;
    }
  } catch {
    return null;
  } finally {
    releaseThumbSlot();
  }
}

function loadThumb(item: MediaItem): Promise<string | null> {
  const cached = thumbCache.get(item.id);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const pending = thumbInflight.get(item.id);
  if (pending) {
    return pending;
  }
  const task = makeThumb(item).then((uri) => {
    thumbCache.set(item.id, uri);
    thumbInflight.delete(item.id);
    return uri;
  });
  thumbInflight.set(item.id, task);
  return task;
}

function useVideoThumb(item: MediaItem): string | null | undefined {
  const [uri, setUri] = useState<string | null | undefined>(() => thumbCache.get(item.id));
  useEffect(() => {
    let alive = true;
    const cached = thumbCache.get(item.id);
    if (cached !== undefined) {
      setUri(cached);
      return;
    }
    setUri(undefined);
    void loadThumb(item).then((next) => {
      if (alive) {
        setUri(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [item]);
  return uri;
}

// Sizes are not in the media store metadata; they are filled in the background for list tabs.
const sizeCache = new Map<string, number>();

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

// ---- Rows ----

const PhotoTile = memo(function PhotoTile({
  item,
  selected,
  size,
  onPress,
}: {
  item: MediaItem;
  selected: boolean;
  size: number;
  onPress: (item: MediaItem) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={item.name}
      onPress={() => onPress(item)}
      style={{ width: size, height: size }}
    >
      <Image
        source={{ uri: item.id }}
        style={styles.photo}
        contentFit="cover"
        recyclingKey={item.id}
        cachePolicy="memory-disk"
        transition={0}
      />
      {selected && <View pointerEvents="none" style={styles.photoSelected} />}
      <View pointerEvents="none" style={styles.tileCheck}>
        <CheckCircle checked={selected} size={20} onDark />
      </View>
    </Pressable>
  );
});

const PhotoRow = memo(function PhotoRow({
  row,
  selectedKey,
  tile,
  onPress,
}: {
  row: MediaItem[];
  /** One character per tile: "1" selected, "0" not; keeps the memo cheap. */
  selectedKey: string;
  tile: number;
  onPress: (item: MediaItem) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: PHOTO_GAP, marginBottom: PHOTO_GAP }}>
      {row.map((item, index) => (
        <PhotoTile key={item.id} item={item} selected={selectedKey[index] === "1"} size={tile} onPress={onPress} />
      ))}
    </View>
  );
});

const VideoRow = memo(function VideoRow({
  item,
  selected,
  size,
  onPress,
}: {
  item: MediaItem;
  selected: boolean;
  size: number | undefined;
  onPress: (item: MediaItem) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const thumb = useVideoThumb(item);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => onPress(item)}
      style={[picker.row, selected && picker.rowSelected]}
    >
      <View style={styles.videoThumb}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} transition={0} />
        ) : (
          <Ionicons name="videocam" size={20} color="rgba(255,255,255,0.7)" />
        )}
        {item.duration !== null && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        )}
      </View>
      <View style={picker.grow}>
        <Text style={picker.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={picker.rowMeta}>{size === undefined ? "…" : formatBytes(size)}</Text>
      </View>
      <CheckCircle checked={selected} />
    </Pressable>
  );
});

const AudioRow = memo(function AudioRow({
  item,
  selected,
  size,
  onPress,
}: {
  item: MediaItem;
  selected: boolean;
  size: number | undefined;
  onPress: (item: MediaItem) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const { colors } = useTheme();
  const meta = [formatDuration(item.duration), size === undefined ? "…" : formatBytes(size)].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => onPress(item)}
      style={[picker.row, selected && picker.rowSelected]}
    >
      <View style={styles.audioTile}>
        <Ionicons name="musical-notes" size={20} color={colors.purpleSoft} />
      </View>
      <View style={picker.grow}>
        <Text style={picker.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={picker.rowMeta}>{meta}</Text>
      </View>
      <CheckCircle checked={selected} />
    </Pressable>
  );
});

function FolderCover({ kind, item }: { kind: MediaKind; item: MediaItem }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  if (kind === "audio") {
    return (
      <View style={[styles.folderCover, styles.audioTile]}>
        <Ionicons name="musical-notes" size={22} color={colors.purpleSoft} />
      </View>
    );
  }
  if (kind === "video") {
    return <VideoCover item={item} />;
  }
  return <Image source={{ uri: item.id }} style={styles.folderCover} contentFit="cover" recyclingKey={item.id} transition={0} />;
}

function VideoCover({ item }: { item: MediaItem }) {
  const styles = useThemedStyles(createStyles);
  const thumb = useVideoThumb(item);
  return (
    <View style={[styles.folderCover, styles.videoThumb]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} transition={0} />
      ) : (
        <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.7)" />
      )}
    </View>
  );
}

// ---- Tab ----

const MediaTab = forwardRef<MediaTabHandle, Props>(function MediaTab(
  { kind, query, selectedIds, onToggle, access, onManageAccess, reloadKey },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const picker = useThemedStyles(createPickerStyles);
  const layout = useLayout();
  const [view, setView] = useState<ViewMode>("all");
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [folders, setFolders] = useState<MediaFolder[] | null>(null);
  const [openFolder, setOpenFolder] = useState<MediaFolder | null>(null);
  const [failed, setFailed] = useState(false);
  const [sizeVersion, setSizeVersion] = useState(0);

  useImperativeHandle(ref, () => ({
    handleBack: () => {
      if (openFolder) {
        setOpenFolder(null);
        return true;
      }
      return false;
    },
  }), [openFolder]);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setFolders(null);
    setOpenFolder(null);
    setFailed(false);
    listMedia(kind)
      .then((list) => {
        if (alive) {
          setItems(list);
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
  }, [kind, reloadKey]);

  useEffect(() => {
    if (view !== "folders" || folders !== null) {
      return;
    }
    let alive = true;
    listFolders(kind)
      .then((list) => {
        if (alive) {
          setFolders(list);
        }
      })
      .catch(() => {
        if (alive) {
          setFolders([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [view, folders, kind, reloadKey]);

  // Fill in sizes for list tabs a few at a time without blocking scrolling.
  useEffect(() => {
    if (!items || kind === "photo") {
      return;
    }
    let alive = true;
    void (async () => {
      let touched = 0;
      for (const item of items) {
        if (!alive) {
          return;
        }
        if (sizeCache.has(item.id)) {
          continue;
        }
        try {
          sizeCache.set(item.id, (await resolveMedia(item.id)).size);
        } catch {
          sizeCache.set(item.id, 0);
        }
        touched += 1;
        if (touched % 20 === 0) {
          setSizeVersion((value) => value + 1);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (alive && touched > 0) {
        setSizeVersion((value) => value + 1);
      }
    })();
    return () => {
      alive = false;
    };
  }, [items, kind]);

  const contentWidth = Math.min(layout.width, layout.contentMaxWidth) - layout.gutter * 2;
  const columns = contentWidth >= 560 ? 5 : contentWidth >= 420 ? 4 : 3;
  const tile = Math.floor((contentWidth - PHOTO_GAP * (columns - 1)) / columns);

  const sections = useMemo<Section[]>(() => {
    const source = openFolder ? openFolder.items : items ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = needle ? source.filter((item) => item.name.toLowerCase().includes(needle)) : source;
    const now = Date.now();
    const todayKey = dayKey(now);
    const yesterdayKey = dayKey(now - 86_400_000);
    const groups = new Map<string, MediaItem[]>();
    for (const item of filtered) {
      const key = dayKey(item.createdAt) || "undated";
      const list = groups.get(key);
      if (list) {
        list.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    const perRow = kind === "photo" ? columns : 1;
    return [...groups.entries()].map(([key, list]) => ({
      key,
      title:
        key === todayKey
          ? t("picker.today")
          : key === yesterdayKey
            ? t("picker.yesterday")
            : key === "undated"
              ? t("picker.undated")
              : key,
      items: list,
      data: chunk(list, perRow),
    }));
  }, [items, openFolder, query, kind, columns]);

  const visible = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const allSelected = visible.length > 0 && visible.every((item) => selectedIds.has(item.id));

  const toggleOne = useCallback(
    (item: MediaItem) => {
      onToggle([item], !selectedIds.has(item.id));
    },
    [onToggle, selectedIds],
  );

  const kindLabel = kind === "photo" ? t("picker.photos") : kind === "video" ? t("picker.videos") : t("picker.songs");
  const folderLabel = kind === "photo" ? t("picker.albums") : t("picker.folders");
  const emptyIcon = kind === "photo" ? "images-outline" : kind === "video" ? "videocam-outline" : "musical-notes-outline";

  // Partial access only restricts photos and videos; music is all or nothing.
  const limitedBanner = access === "limited" && kind !== "audio" && (
    <Pressable onPress={onManageAccess} style={styles.limited}>
      <Ionicons name="lock-closed-outline" size={14} color={colors.warning} />
      <Text style={[styles.limitedText, picker.grow]}>{t("picker.limited")}</Text>
      <Text style={styles.limitedAction}>{t("picker.manage")}</Text>
    </Pressable>
  );

  if (failed) {
    return <EmptyState icon="alert-circle-outline" text={t("picker.loadFailed")} />;
  }

  if (view === "folders" && !openFolder) {
    return (
      <View style={styles.fill}>
        <Segmented
          options={[{ key: "all", label: kindLabel }, { key: "folders", label: folderLabel }]}
          value={view}
          onChange={setView}
        />
        {limitedBanner}
        {folders === null ? (
          <ListShimmer variant="rows" />
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(folder) => folder.id}
            extraData={selectedIds}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<EmptyState icon={emptyIcon} text={t("picker.empty")} />}
            renderItem={({ item: folder }) => {
              const folderAll = folder.items.every((item) => selectedIds.has(item.id));
              return (
                <Pressable onPress={() => setOpenFolder(folder)} style={picker.row} accessibilityRole="button">
                  <FolderCover kind={kind} item={folder.items[0]} />
                  <View style={picker.grow}>
                    <Text style={picker.rowName} numberOfLines={1}>{folder.title}</Text>
                    <Text style={picker.rowMeta}>{t("picker.itemCount", { count: folder.items.length })}</Text>
                  </View>
                  <CheckCircle checked={folderAll} onPress={() => onToggle(folder.items, !folderAll)} />
                  <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {!openFolder && (
        <Segmented
          options={[{ key: "all", label: kindLabel }, { key: "folders", label: folderLabel }]}
          value={view}
          onChange={setView}
        />
      )}
      {limitedBanner}
      <ListHeading
        title={`${openFolder ? openFolder.title : kindLabel} (${visible.length})`}
        selectAllLabel={t("picker.selectAll")}
        allSelected={allSelected}
        onToggleAll={visible.length > 0 ? () => onToggle(visible, !allSelected) : undefined}
        onBack={openFolder ? () => setOpenFolder(null) : undefined}
      />
      {items === null ? (
        <ListShimmer variant={kind === "photo" ? "grid" : "rows"} tile={tile} columns={columns} gap={PHOTO_GAP} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) => row[0].id}
          extraData={[selectedIds, sizeVersion]}
          stickySectionHeadersEnabled={false}
          initialNumToRender={kind === "photo" ? 10 : 14}
          maxToRenderPerBatch={kind === "photo" ? 8 : 12}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState icon={emptyIcon} text={query.trim() ? t("picker.noResults", { query: query.trim() }) : t("picker.empty")} />
          }
          renderSectionHeader={({ section }) => {
            const sectionAll = section.items.every((item) => selectedIds.has(item.id));
            return (
              <View style={picker.sectionRow}>
                <Text style={picker.sectionTitle}>{section.title}</Text>
                <CheckCircle checked={sectionAll} size={20} onPress={() => onToggle(section.items, !sectionAll)} />
              </View>
            );
          }}
          renderItem={({ item: row }) => {
            if (kind === "photo") {
              const key = row.map((item) => (selectedIds.has(item.id) ? "1" : "0")).join("");
              return <PhotoRow row={row} selectedKey={key} tile={tile} onPress={toggleOne} />;
            }
            const item = row[0];
            const selected = selectedIds.has(item.id);
            const size = sizeCache.get(item.id);
            return kind === "video" ? (
              <VideoRow item={item} selected={selected} size={size} onPress={toggleOne} />
            ) : (
              <AudioRow item={item} selected={selected} size={size} onPress={toggleOne} />
            );
          }}
        />
      )}
    </View>
  );
});

export default MediaTab;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, gap: 6 },
    spinner: { marginTop: 32 },
    listContent: { paddingBottom: 8 },
    photo: { width: "100%", height: "100%", borderRadius: 6, backgroundColor: colors.bgElevated },
    photoSelected: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, borderWidth: 2, borderColor: colors.blue, backgroundColor: "rgba(59,130,246,0.18)" },
    tileCheck: { position: "absolute", top: 5, right: 5 },
    videoThumb: { width: 76, height: 52, borderRadius: 6, backgroundColor: "#1F2430", overflow: "hidden", alignItems: "center", justifyContent: "center" },
    durationBadge: { position: "absolute", left: 4, bottom: 3, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    durationText: { ...para(600), color: "#FFFFFF", fontSize: 9 },
    audioTile: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(168,85,247,0.14)", alignItems: "center", justifyContent: "center" },
    folderCover: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.bgElevated },
    limited: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7 },
    limitedText: { ...para(500), color: colors.warning, fontSize: 11 },
    limitedAction: { ...para(700), color: colors.warning, fontSize: 11 },
  });
}
