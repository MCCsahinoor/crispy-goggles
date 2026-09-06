import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { Text } from "../lib/disableFontScaling";

import { ConnectionMode, SharedFile } from "../lib/filedrop";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";

type FilesPanelProps = {
  connectionMode: ConnectionMode;
  shareUrl: string;
  files: SharedFile[];
  message: string;
  loading: boolean;
  savingFileId: string | null;
  onRefresh: () => void;
  onDownload: (file: SharedFile) => void;
  onDisconnect: () => void;
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return "FILE";
  }
  return name.slice(dot + 1, dot + 5).toUpperCase();
}

function extensionColor(ext: string, fallback: string): string {
  const palette: Record<string, string> = {
    PNG: "#A855F7",
    JPG: "#A855F7",
    JPEG: "#A855F7",
    GIF: "#A855F7",
    WEBP: "#A855F7",
    PDF: "#F87171",
    DOC: "#3B82F6",
    DOCX: "#3B82F6",
    TXT: "#9AA0B4",
    MP4: "#F59E0B",
    MP3: "#34D399",
    ZIP: "#64748B",
    RAR: "#64748B",
  };
  return palette[ext] ?? fallback;
}

export default function FilesPanel({
  connectionMode,
  shareUrl,
  files,
  message,
  loading,
  savingFileId,
  onRefresh,
  onDownload,
  onDisconnect,
}: FilesPanelProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const openShareUrl = async () => {
    if (!shareUrl.trim()) {
      return;
    }
    const canOpen = await Linking.canOpenURL(shareUrl);
    if (canOpen) {
      await Linking.openURL(shareUrl);
    }
  };

  return (
    <View style={styles.filesScreen}>
      <View style={styles.card}>
        <View style={styles.filesHeader}>
          <View style={styles.filesHeaderLeft}>
            <Text style={styles.filesTitle}>Shared files</Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>
                {connectionMode === "local" ? "Local" : "Global"}
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            onPress={onRefresh}
            disabled={loading}
          >
            <Text style={styles.iconButtonText}>Refresh</Text>
          </Pressable>
        </View>

        {!!shareUrl && (
          <Pressable
            style={({ pressed }) => [styles.shareUrlRow, pressed && styles.pressed]}
            onPress={openShareUrl}
          >
            <Ionicons name="link-outline" size={15} color={colors.blueSoft} />
            <Text style={styles.shareUrlText} numberOfLines={1}> {shareUrl} </Text>
            <Ionicons name="open-outline" size={15} color={colors.blueSoft} />
          </Pressable>
        )}

        <Text style={styles.filesCount}>
          {files.length} {files.length === 1 ? "file" : "files"} available
        </Text>

        <FlatList
          style={styles.fileList}
          data={files}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={files.length === 0 ? styles.emptyList : styles.fileListContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No files yet</Text>
              <Text style={styles.emptyText}>Add files on the PC, then tap Refresh.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const ext = fileExtension(item.name);
            const isSaving = savingFileId === item.id;
            return (
              <Pressable
                style={({ pressed }) => [styles.fileRow, pressed && styles.pressed]}
                onPress={() => onDownload(item)}
                disabled={loading || savingFileId !== null}
              >
                <View style={[styles.fileIcon, { backgroundColor: extensionColor(ext, colors.blue) }]}>
                  <Text style={styles.fileIconText}>{ext}</Text>
                </View>
                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileSize}>{item.size_label}</Text>
                </View>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.blueSoft} />
                ) : (
                  <View style={styles.downloadPill}>
                    <Text style={styles.downloadPillText}>Save</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />

        <View style={styles.filesFooter}>
          {!!message && !loading && (
            <View style={[styles.statusBanner, styles.statusBannerWarning]}>
              <Text
                style={[styles.statusBannerText, styles.statusBannerWarningText]}
                numberOfLines={2}
              >
                {message}
              </Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.disconnectButton, pressed && styles.pressed]}
            onPress={onDisconnect}
          >
            <Text style={styles.disconnectButtonText}>Disconnect</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  filesScreen: {
    flex: 1,
    paddingBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  filesHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  filesTitle: {
    ...heading(600),
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  modeBadge: {
    backgroundColor: "rgba(59,130,246,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
  },
  modeBadgeText: {
    ...para(700),
    fontSize: 10,
    lineHeight: 16,
    color: colors.blueSoft,
  },
  iconButton: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconButtonText: {
    ...para(700),
    color: colors.blueSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  shareUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginBottom: 8,
  },
  shareUrlText: {
    ...para(600),
    flex: 1,
    color: colors.blueSoft,
    fontSize: 10,
  },
  filesCount: {
    ...para(500),
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    marginBottom: 10,
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    paddingBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileIconText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    ...para(600),
    fontSize: 11,
    lineHeight: 16,
    color: colors.text, 
  },
  fileSize: {
    ...para(500),
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
  },
  downloadPill: {
    backgroundColor: "rgba(59,130,246,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
  },
  downloadPillText: {
    ...para(700),
    color: colors.blueSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  filesFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 10,
  },
  disconnectButton: {
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  disconnectButtonText: {
    ...para(700),
    color: colors.danger,
    fontSize: 14,
    lineHeight: 18,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    ...heading(600),
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
    marginBottom: 4,
  },
  emptyText: {
    ...para(500),
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14, 
  },
  statusBanner: {
    backgroundColor: "rgba(59,130,246,0.12)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.28)",
  },
  statusBannerWarning: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  statusBannerText: {
    ...para(500),
    color: colors.blueSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  statusBannerWarningText: {
    color: colors.warning,
  },
  pressed: {
    opacity: 0.75,
  },
});
}
