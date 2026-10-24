import { Modal, View, Pressable, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";

import { type PcSession } from "../../features/filora/hooks/usePcSession";
import { para, heading, useThemedStyles, type ThemeColors } from "../../theme";
import { useLayout } from "../../utils/responsive";
import { Text } from "../../utils/disableFontScaling";
import { t } from "../../i18n";

export default function QrScanModal({ session }: { session: PcSession }) {
  const { scanning, setScanning, handleScanResult, scanTitle } = session;
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  return (
    <Modal
      visible={scanning}
      animationType="slide"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={() => setScanning(false)}
    >
      <View style={styles.scanContainer}>
        <StatusBar style="light" />
        {scanning && (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data, raw }) => {
              handleScanResult(raw ?? data);
            }}
          />
        )}
        <SafeAreaView
          edges={["top", "bottom", "left", "right"]}
          style={[styles.scanOverlay, { paddingHorizontal: layout.gutter }]}
        >
          <Text style={[styles.scanTitle, { maxWidth: layout.contentMaxWidth }]}>{scanTitle}</Text>
          <Pressable style={({ pressed }) => [styles.scanCancel, pressed && styles.pressed]} onPress={() => setScanning(false)} >
            <Text style={styles.scanCancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scanContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    camera: {
      flex: 1,
    },
    scanOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    scanTitle: {
      ...heading(),
      color: "#fff",
      fontSize: 18,
      textAlign: "center",
      backgroundColor: "rgba(7, 8, 13, 0.7)",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
    },
    scanCancel: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 28,
      alignItems: "center",
      backgroundColor: colors.card,
    },
    pressed: {
      opacity: 0.75,
    },
    scanCancelText: {
      ...para(700),
      color: colors.text,
      fontSize: 15,
    },
  });
}
