import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "../lib/disableFontScaling";

import { ConnectionMode } from "../lib/filedrop";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";

export type HistoryEntry = {
  url: string;
  mode: ConnectionMode;
  at: number;
};

type HistoryPanelProps = {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
};

function formatWhen(at: number): string {
  const delta = Date.now() - at;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return new Date(at).toLocaleDateString();
}

export default function HistoryPanel({ entries, onOpen }: HistoryPanelProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="time-outline" size={28} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No history yet</Text>
        <Text style={styles.emptyText}>
          Recent PC connections will show up here so you can reconnect faster.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {entries.map((entry) => (
        <Pressable
          key={`${entry.url}-${entry.at}`}
          onPress={() => onOpen(entry)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}>
            <Ionicons
              name={entry.mode === "local" ? "wifi-outline" : "globe-outline"}
              size={18}
              color={entry.mode === "local" ? colors.purpleSoft : colors.blueSoft}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {entry.url}
            </Text>
            <Text style={styles.rowMeta}>
              {entry.mode === "local" ? "Local network" : "Global link"} · {formatWhen(entry.at)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </Pressable>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    ...heading(),
    color: colors.text,
    fontSize: 18,
  },
  emptyText: {
    ...para(),
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  list: {
    gap: 10,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowTitle: {
    ...para(700),
    color: colors.text,
    fontSize: 13,
  },
  rowMeta: {
    ...para(),
    color: colors.textMuted,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.8,
  },
});
}
