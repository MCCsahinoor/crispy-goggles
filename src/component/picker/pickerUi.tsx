import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "../../lib/disableFontScaling";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../../theme";

export function CheckCircle({
  checked,
  size = 22,
  onPress,
  onDark = false,
}: {
  checked: boolean;
  size?: number;
  onPress?: () => void;
  /** Drawn over a photo: a white ring instead of the grey border. */
  onDark?: boolean;
}) {
  const styles = useThemedStyles(createPickerStyles);
  const body = (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        onDark && styles.circleOnDark,
        checked && styles.circleChecked,
      ]}
    >
      {checked && <Ionicons name="checkmark" size={size * 0.72} color="#FFFFFF" />}
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      {body}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const styles = useThemedStyles(createPickerStyles);
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [styles.segmentItem, active && styles.segmentActive, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListHeading({
  title,
  selectAllLabel,
  allSelected,
  onToggleAll,
  onBack,
}: {
  title: string;
  selectAllLabel: string;
  allSelected: boolean;
  onToggleAll?: () => void;
  onBack?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createPickerStyles);
  return (
    <View style={styles.headingRow}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </Pressable>
      )}
      <Text style={[styles.headingTitle, styles.grow]} numberOfLines={1}>{title}</Text>
      {onToggleAll && (
        <Pressable onPress={onToggleAll} hitSlop={8} style={styles.selectAll} accessibilityRole="button">
          <Text style={styles.selectAllText}>{selectAllLabel}</Text>
          <CheckCircle checked={allSelected} size={20} />
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createPickerStyles);
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={colors.textDim} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function createPickerStyles(colors: ThemeColors) {
  return StyleSheet.create({
    grow: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.75 },

    circle: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: "rgba(255,255,255,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    circleOnDark: { borderColor: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.25)" },
    circleChecked: { borderColor: colors.blue, backgroundColor: colors.blue },

    segment: {
      flexDirection: "row",
      alignSelf: "center",
      backgroundColor: colors.bgElevated,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      minWidth: 220,
    },
    segmentItem: { flex: 1, minHeight: 30, alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 14 },
    segmentActive: { backgroundColor: colors.purple },
    segmentText: { ...para(700), color: colors.textMuted, fontSize: 12 },
    segmentTextActive: { color: "#FFFFFF" },

    headingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
    headingTitle: { ...heading(600), color: colors.text, fontSize: 14 },
    selectAll: { flexDirection: "row", alignItems: "center", gap: 8 },
    selectAllText: { ...para(600), color: colors.textMuted, fontSize: 12 },

    sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 6 },
    sectionTitle: { ...para(600), color: colors.textMuted, fontSize: 12 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 6,
    },
    rowSelected: { borderColor: colors.blue },
    rowName: { ...para(600), color: colors.text, fontSize: 13 },
    rowMeta: { ...para(500), color: colors.textMuted, fontSize: 11 },

    empty: { alignItems: "center", gap: 8, paddingVertical: 36 },
    emptyText: { ...para(500), color: colors.textDim, fontSize: 13, textAlign: "center" },
  });
}
