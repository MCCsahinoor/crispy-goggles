import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { t } from "@/i18n";
import type { ConnectionMode } from "@/services/api/filedrop";
import { para, radius, useTheme, useThemedStyles, type ThemeColors } from "@/theme";
import { Text } from "@/utils/disableFontScaling";

type Props = {
  mode: ConnectionMode;
  onSelect: (mode: ConnectionMode) => void;
};

// Global / Local switch shown above the connect panels.
export default function ConnectModeTabs({ mode, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.modeRow}>
      <Pressable
        style={[styles.modeTab, mode === "global" && styles.modeTabGlobal]}
        onPress={() => onSelect("global")}
      >
        <Ionicons name="globe-outline" size={16} color={mode === "global" ? colors.blueSoft : colors.textDim} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.modeTabText, mode === "global" && styles.modeTabTextGlobal]}>{t("mode.global")}</Text>
      </Pressable>
      <Pressable
        style={[styles.modeTab, mode === "local" && styles.modeTabLocal]}
        onPress={() => onSelect("local")}
      >
        <Ionicons name="wifi" size={16} color={mode === "local" ? colors.purpleSoft : colors.textDim} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.modeTabText, mode === "local" && styles.modeTabTextLocal]}>{t("mode.local")}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    modeRow: {
      flexDirection: "row",
      backgroundColor: colors.bgElevated,
      borderRadius: radius.xl,
      padding: 4,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    modeTab: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 8,
      flexDirection: "row",
      borderRadius: radius.md,
      paddingVertical: 5,
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
    modeTabText: {
      ...para(700),
      flexShrink: 1,
      color: colors.textDim,
      fontSize: 13,
      lineHeight: 18,
    },
    modeTabTextGlobal: {
      color: colors.blueSoft,
    },
    modeTabLocal: {
      borderWidth: 1,
      borderColor: colors.purple,
      backgroundColor: "rgba(168,85,247,0.08)",
    },
    modeTabTextLocal: {
      color: colors.purpleSoft,
    },
  });
}
