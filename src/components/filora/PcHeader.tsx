import { View, Image, StyleSheet } from "react-native";

import { type PcSession } from "../../features/filora/hooks/usePcSession";
import { para, useThemedStyles, type ThemeColors } from "../../theme";
import { useLayout } from "../../utils/responsive";
import { AppHeader, HeaderIconButton } from "../common/ui";
import { goBack, openSettings } from "../../features/filora/utils/navigation";
import { Text } from "../../utils/disableFontScaling";
import { t } from "../../i18n";

export default function PcHeader({ session }: { session: PcSession }) {
  const { screen, setHelpOpen } = session;
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  return (
    <View style={{ marginHorizontal: -layout.gutter, marginBottom: 14 }}>
      <AppHeader
        title="Filora"
        subtitle="Connect to Filora on your PC"
        onBack={screen === "connect" ? goBack : undefined}
        leftAccessory={
          <Image
            source={require("../../../assets/logo.png")}
            style={styles.logo}
            accessibilityLabel="Filora"
          />
        }
        right={
          <View style={styles.headerRightRow}>
            {screen === "files" ? (
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedBadgeText}>{t("ui.connected")}</Text>
              </View>
            ) : (
              <HeaderIconButton icon="help-circle-outline" label="Help" onPress={() => setHelpOpen(true)} />
            )}
            <HeaderIconButton icon="settings-outline" label={t("tab.settings")} onPress={openSettings} />
          </View>
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    logo: {
      width: 34,
      height: 34,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      padding: 5,
      resizeMode: "contain" as const,
    },
    headerRightRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    connectedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.successBg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    connectedDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: colors.success,
    },
    connectedBadgeText: {
      ...para(700),
      fontSize: 12,
      color: colors.success,
      lineHeight: 16,
    },
  });
}
