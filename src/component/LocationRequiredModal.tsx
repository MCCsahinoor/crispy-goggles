import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, View } from "react-native";

import { Text } from "../lib/disableFontScaling";

import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";

type LocationRequiredModalProps = {
  visible: boolean;
  enabling?: boolean;
  onEnable: () => void;
  onConnectManually: () => void;
};

export default function LocationRequiredModal({
  visible,
  enabling = false,
  onEnable,
  onConnectManually,
}: LocationRequiredModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onConnectManually}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={40} color={colors.textDim} />
            <View style={styles.iconSlash} />
          </View>

          <Text style={styles.title}>Location permission not enabled</Text>
          <Text style={styles.body}>
            Turn on location so Filora can join your PC&apos;s Wi-Fi. Filora does not track you.
          </Text>

          <Pressable
            onPress={onEnable}
            disabled={enabling}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>
              {enabling ? "Opening location settings…" : "Enable device location"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onConnectManually}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Connect manually</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 32,
    },
    card: {
      width: "100%" as const,
      maxWidth: 300,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconWrap: {
      width: 52,
      height: 52,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: 10,
    },
    iconSlash: {
      position: "absolute" as const,
      width: 48,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: colors.danger,
      transform: [{ rotate: "-45deg" }],
    },
    title: {
      ...heading(),
      color: colors.text,
      fontSize: 16,
      textAlign: "center" as const,
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    body: {
      ...para(),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center" as const,
      marginBottom: 14,
    },
    primaryButton: {
      paddingVertical: 8,
      paddingHorizontal: 6,
      marginBottom: 0,
    },
    primaryText: {
      ...para(700),
      color: colors.success,
      fontSize: 15,
      textAlign: "center" as const,
    },
    secondaryButton: {
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    secondaryText: {
      ...para(600),
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center" as const,
    },
    pressed: {
      opacity: 0.75,
    },
  };
}
