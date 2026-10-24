import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PhoneShareFlow from "@/components/filora/PhoneShareFlow";
import { goBack, openSettings } from "@/features/filora/utils/navigation";
import { useI18n } from "@/i18n";
import { type ThemeColors, useThemedStyles } from "@/theme";

export default function PhonePage() {
  useI18n(); // re-render on language change
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <StatusBar style="light" />
      <LinearGradient colors={["rgba(59,130,246,0.16)", "transparent"]} style={styles.ambientGlow} />
      <PhoneShareFlow onBack={goBack} onOpenSettings={openSettings} />
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
  });
}
