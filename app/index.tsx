import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import OptionCard from "@/components/common/OptionCard";
import { ROUTES } from "@/constants";
import { t, useI18n } from "@/i18n";
import { heading, para, useTheme, useThemedStyles, type ThemeColors } from "@/theme";
import { Text } from "@/utils/disableFontScaling";
import { useLayout } from "@/utils/responsive";

// Entry screen: choose between sharing with a PC or with another phone.
export default function EntryPage() {
  useI18n(); // re-render on language change
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <LinearGradient colors={["rgba(59,130,246,0.16)", "transparent"]} style={styles.ambientGlow} />
      <View
        style={[
          styles.screen,
          { maxWidth: layout.contentMaxWidth, paddingHorizontal: layout.gutter },
        ]}
      >
        <View style={styles.brand}>
          <Image
            source={require("../assets/logo.png")}
            style={styles.logo}
            accessibilityLabel="Filora"
          />
          <Text style={styles.brandName}>Filora</Text>
          <Text style={styles.prompt}>{t("launch.prompt")}</Text>
        </View>

        <View style={styles.options}>
          <OptionCard
            icon="desktop-outline"
            tint={colors.blueSoft}
            title={t("launch.pcTitle")}
            body={t("launch.pcBody")}
            onPress={() => router.push(ROUTES.pc)}
          />
          <OptionCard
            icon="phone-portrait-outline"
            tint={colors.purpleSoft}
            title={t("launch.phoneTitle")}
            body={t("launch.phoneBody")}
            onPress={() => router.push(ROUTES.phone)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: "center",
    },
    ambientGlow: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 260,
    },
    screen: {
      flex: 1,
      width: "100%",
      alignSelf: "center",
      justifyContent: "center",
      gap: 36,
    },
    brand: {
      alignItems: "center",
      gap: 8,
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 18,
      marginBottom: 4,
    },
    brandName: {
      ...heading(700),
      fontSize: 28,
      lineHeight: 34,
      color: colors.text,
    },
    prompt: {
      ...para(500),
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      textAlign: "center",
    },
    options: {
      gap: 12,
    },
  });
}
