import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";

import { Text } from "../lib/disableFontScaling";
import type { LocationWifiReadiness } from "../lib/permissions";
import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import ModalFrame from "./ModalFrame";

type LocationBlockReason = Exclude<LocationWifiReadiness, "ready">;

type LocationRequiredModalProps = {
  visible: boolean;
  reason?: LocationBlockReason | null;
  enabling?: boolean;
  onEnable: () => void;
  onConnectManually: () => void;
};

const COPY: Record<
  LocationBlockReason,
  { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action: string }
> = {
  permission_denied: {
    icon: "location-outline",
    title: "Allow location access",
    body: "Filora uses location only to join your PC's Wi-Fi. It does not track you.",
    action: "Allow location",
  },
  services_off: {
    icon: "navigate-outline",
    title: "Turn on location",
    body: "Android needs location turned on so Filora can join your PC's Wi-Fi. Filora does not track you.",
    action: "Turn on location",
  },
};

export default function LocationRequiredModal({
  visible,
  reason = "permission_denied",
  enabling = false,
  onEnable,
  onConnectManually,
}: LocationRequiredModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = COPY[reason ?? "permission_denied"];

  return (
    <ModalFrame
      visible={visible}
      onClose={onConnectManually}
      accessibilityLabel="Dismiss location prompt"
      header={
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name={copy.icon} size={22} color={colors.blueSoft} />
          </View>
          <Text style={styles.title}>{copy.title}</Text>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <Pressable
            onPress={onEnable}
            disabled={enabling}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed, enabling && styles.disabled]}
          >
            <LinearGradient
              colors={gradients.connect}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.primaryGradient}
            >
              <Ionicons name="location" size={18} color="#FFFFFF" />
              <Text style={styles.primaryText} numberOfLines={1}>
                {enabling ? "Opening settings…" : copy.action}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={onConnectManually}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Connect manually</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.body}>{copy.body}</Text>
    </ModalFrame>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    header: {
      gap: 8,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      ...heading(600),
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
    },
    body: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    footer: {
      gap: 6,
      paddingTop: 4,
    },
    primary: {
      borderRadius: radius.md,
      overflow: "hidden" as const,
    },
    primaryGradient: {
      minHeight: 48,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
    },
    primaryText: {
      ...para(700),
      color: "#FFFFFF",
      fontSize: 16,
    },
    secondary: {
      paddingVertical: 8,
      alignItems: "center" as const,
    },
    secondaryText: {
      ...para(600),
      color: colors.textMuted,
      fontSize: 14,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.7,
    },
  };
}
