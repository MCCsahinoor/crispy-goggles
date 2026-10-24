import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, type DimensionValue } from "react-native";

import { Text } from "../../../utils/disableFontScaling";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../../../theme";

/** One grey block with a highlight band sliding across it, driven by a shared 0..1 value. */
function ShimmerBlock({
  progress,
  width,
  height,
  round = false,
  borderRadius = 8,
  style,
}: {
  progress: Animated.Value;
  width?: DimensionValue;
  height: number;
  round?: boolean;
  borderRadius?: number;
  style?: object;
}) {
  const { colors, scheme } = useTheme();
  const [measured, setMeasured] = useState(0);
  const band = Math.max(measured * 0.6, 40);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-band, measured + band] });
  const glow = scheme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.75)";
  return (
    <View
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius: round ? height / 2 : borderRadius,
          backgroundColor: colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {measured > 0 && (
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: band, transform: [{ translateX }] }}>
          <LinearGradient
            colors={["transparent", glow, "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Placeholder shown while a picker list loads: photo-shaped tiles for the grid, or file-row cards
 * for everything else. Mirrors the real layout so nothing jumps when the items arrive.
 */
export function ListShimmer({
  variant = "rows",
  tile = 100,
  columns = 3,
  gap = 4,
}: {
  variant?: "rows" | "grid";
  tile?: number;
  columns?: number;
  gap?: number;
}) {
  const styles = useThemedStyles(createPickerStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      { resetBeforeIteration: true },
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [progress]);

  if (variant === "grid") {
    return (
      <View style={{ paddingTop: 6, overflow: "hidden" }} accessibilityRole="progressbar">
        <ShimmerBlock progress={progress} width={110} height={12} style={{ marginBottom: 10 }} />
        {Array.from({ length: 6 }, (_, row) => (
          <View key={row} style={{ flexDirection: "row", gap, marginBottom: gap }}>
            {Array.from({ length: columns }, (_, column) => (
              <ShimmerBlock key={column} progress={progress} width={tile} height={tile} borderRadius={4} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 6, overflow: "hidden" }} accessibilityRole="progressbar">
      {Array.from({ length: 8 }, (_, row) => (
        <View key={row} style={styles.row}>
          <ShimmerBlock progress={progress} width={44} height={44} borderRadius={8} />
          <View style={styles.grow}>
            <ShimmerBlock progress={progress} width={row % 2 ? "55%" : "75%"} height={12} style={{ marginBottom: 8 }} />
            <ShimmerBlock progress={progress} width="35%" height={10} />
          </View>
          <ShimmerBlock progress={progress} width={22} height={22} round />
        </View>
      ))}
    </View>
  );
}

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
