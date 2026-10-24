import { View, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { type PcSession } from "../../features/filora/hooks/usePcSession";
import { para, useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { useLayout } from "../../utils/responsive";
import AdBanner from "../common/AdBanner";
import { Text } from "../../utils/disableFontScaling";
import { t } from "../../i18n";
import { openSettings } from "../../features/filora/utils/navigation";

export default function PcFooter({ session }: { session: PcSession }) {
  const { homeTab, setHomeTab, setConnectionMode, setLocalConnectError, clearToast } = session;
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  // Same width/padding as the column but no flex, so the footer hugs the bottom edge.
  const footerStyle = [styles.footerColumn, { maxWidth: layout.contentMaxWidth, paddingHorizontal: layout.gutter }];
  return (
    <>
      <View style={styles.adBleed}>
        <AdBanner />
      </View>

      <View style={footerStyle}>
        <View style={styles.bottomBar}>
          <Pressable
            style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
            onPress={() => {
              setHomeTab("connect");
              setConnectionMode("global");
              setLocalConnectError("");
              clearToast();
            }}
          >
            <Ionicons name="cloud-download-outline" size={18} color={homeTab === "connect" ? colors.blueSoft : colors.textMuted} />
            <Text style={[styles.bottomItemText, homeTab === "connect" && styles.bottomItemTextActive]}>{t("tab.received")}</Text>
          </Pressable>
          <View style={styles.bottomDivider} />
          <Pressable
            style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
            onPress={() => {
              setHomeTab("send");
              clearToast();
            }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={homeTab === "send" ? colors.purpleSoft : colors.textMuted} />
            <Text style={[styles.bottomItemText, homeTab === "send" && styles.bottomItemTextActive]}>{t("tab.send")}</Text>
          </Pressable>
          <View style={styles.bottomDivider} />
          {/* <Pressable style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]} onPress={() => setHomeTab("history")} >
            <Ionicons name="time-outline" size={20} color={homeTab === "history" ? colors.blueSoft : colors.textMuted} />
            <Text style={[ styles.bottomItemText, homeTab === "history" && styles.bottomItemTextActive, ]} > History </Text>
          </Pressable> */}
          <View style={styles.bottomDivider} />
          <Pressable
            style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
            onPress={openSettings}
          >
            <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
            <Text style={styles.bottomItemText}>{t("tab.settings")}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    adBleed: {
      alignSelf: "stretch",
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      paddingBottom: 8,
    },
    bottomItem: {
      flex: 1,
      alignItems: "center",
      gap: 1,
      paddingVertical: 2,
    },
    pressed: {
      opacity: 0.75,
    },
    bottomItemText: {
      ...para(700),
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
    },
    bottomItemTextActive: {
      color: colors.text,
    },
    bottomDivider: {
      width: StyleSheet.hairlineWidth,
      height: 22,
      backgroundColor: colors.borderStrong,
    },
    footerColumn: {
      flexGrow: 0,
      flexShrink: 0,
      width: "100%",
      alignSelf: "center",
    },
  });
}
