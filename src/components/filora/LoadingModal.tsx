import { Modal, View, ActivityIndicator, StyleSheet } from "react-native";

import { type PcSession } from "../../features/filora/hooks/usePcSession";
import { para, useTheme, useThemedStyles, type ThemeColors } from "../../theme";
import { useLayout } from "../../utils/responsive";
import { Text } from "../../utils/disableFontScaling";
import { t } from "../../i18n";

export default function LoadingModal({ session }: { session: PcSession }) {
  const { loading, busyMessage, scanning } = session;
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  return (
    <Modal
      transparent
      visible={loading && !scanning}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={() => { }}
    >
      <View style={styles.overlayLoaderBackdrop}>
        <View style={[styles.loaderCard, { maxWidth: layout.modalMaxWidth }]}>
          <ActivityIndicator size="large" color={colors.blueSoft} />
          <Text style={styles.loaderText}>{busyMessage || t("common.working")}</Text>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlayLoaderBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    loaderCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 32,
      paddingVertical: 28,
      alignItems: "center",
      gap: 16,
      minWidth: 200,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loaderText: {
      ...para(600),
      fontSize: 16,
      color: colors.text,
      textAlign: "center",
    },
  });
}
