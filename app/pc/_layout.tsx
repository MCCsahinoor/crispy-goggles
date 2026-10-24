import { LinearGradient } from "expo-linear-gradient";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import HowToUseModal from "@/components/filora/HowToUseModal";
import LoadingModal from "@/components/filora/LoadingModal";
import LocationRequiredModal from "@/components/filora/LocationRequiredModal";
import PcFooter from "@/components/filora/PcFooter";
import PcHeader from "@/components/filora/PcHeader";
import QrScanModal from "@/components/filora/QrScanModal";
import { PcSessionContext, usePcSession } from "@/features/filora/hooks/usePcSession";
import { type ThemeColors, useThemedStyles } from "@/theme";
import { useLayout } from "@/utils/responsive";

// Shell for the PC flow. The steps themselves are the sub-pages:
// index (connect), password and files. They share one session through context.
export default function PcLayout() {
  const session = usePcSession();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  const {
    screen,
    connectionMode,
    helpOpen,
    setHelpOpen,
    locationModalOpen,
    locationModalReason,
    enablingLocation,
    handleEnableLocation,
    handleConnectManually,
  } = session;

  const glowColor =
    connectionMode === "local" ? "rgba(168,85,247,0.16)" : "rgba(59,130,246,0.16)";
  const columnStyle = [
    styles.column,
    { maxWidth: layout.contentMaxWidth, paddingHorizontal: layout.gutter },
  ];

  return (
    <PcSessionContext.Provider value={session}>
      <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
        <StatusBar style="light" />
        <LinearGradient colors={[glowColor, "transparent"]} style={styles.ambientGlow} />

        <View style={columnStyle}>
          <PcHeader session={session} />
          <Slot />
        </View>

        {screen === "connect" && <PcFooter session={session} />}
      </SafeAreaView>

      <LocationRequiredModal
        visible={locationModalOpen}
        reason={locationModalReason}
        enabling={enablingLocation}
        onEnable={() => {
          void handleEnableLocation();
        }}
        onConnectManually={handleConnectManually}
      />
      <HowToUseModal visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <QrScanModal session={session} />
      <LoadingModal session={session} />
    </PcSessionContext.Provider>
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
  });
}
