import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/common/ui";
import HowToUseModal from "@/components/filora/HowToUseModal";
import SettingsPanel from "@/components/filora/SettingsPanel";
import { t, useI18n } from "@/i18n";
import { type ThemeColors, useThemedStyles } from "@/theme";
import { useLayout } from "@/utils/responsive";

export default function SettingsPage() {
  useI18n(); // re-render on language change
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <StatusBar style="light" />
      <LinearGradient colors={["rgba(59,130,246,0.16)", "transparent"]} style={styles.ambientGlow} />
      <View style={[styles.column, { maxWidth: layout.contentMaxWidth, paddingHorizontal: layout.gutter }]}>
        <View style={{ marginHorizontal: -layout.gutter, marginBottom: 14 }}>
          <AppHeader
            title="Filora"
            subtitle={t("tab.settings")}
            onBack={() => router.back()}
            leftAccessory={
              <Image
                source={require("../../assets/logo.png")}
                style={styles.logo}
                accessibilityLabel="Filora"
              />
            }
          />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <SettingsPanel onOpenHowTo={() => setHelpOpen(true)} />
        </ScrollView>
      </View>
      <HowToUseModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
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
    column: {
      flex: 1,
      width: "100%",
      alignSelf: "center",
    },
    ambientGlow: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 260,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 16,
    },
    logo: {
      width: 34,
      height: 34,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      padding: 5,
      resizeMode: "contain" as const,
    },
  });
}
