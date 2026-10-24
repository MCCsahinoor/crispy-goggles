import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "../../i18n";
import { Text, TextInput } from "../../utils/disableFontScaling";

import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../../theme";

type ScanActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ScanActionCard({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  disabled,
}: ScanActionCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createUiStyles);
  const tint = iconColor ?? colors.blueSoft;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}
    >
      <View style={[styles.scanIconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.scanCopy}>
        <Text style={styles.scanTitle}>{title}</Text>
        <Text style={styles.scanSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
    </Pressable>
  );
}

type ShareLinkFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  onPaste: () => void;
  placeholder: string;
};

export function ShareLinkField({
  value,
  onChangeText,
  onPaste,
  placeholder,
}: ShareLinkFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createUiStyles);

  return (
    <View style={styles.shareBlock}>
      <View style={styles.shareHeader}>
        <Text style={styles.sectionLabel}>{t("ui.shareLink")}</Text>
        <Pressable
          onPress={onPaste}
          style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
        >
          <Ionicons name="clipboard-outline" size={14} color={colors.purpleSoft} />
          <Text style={styles.pasteText}>{t("ui.pasteUrl")}</Text>
        </Pressable>
      </View>
      <View style={styles.inputWrap}>
        <Ionicons name="link-outline" size={18} color={colors.textDim} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
    </View>
  );
}

type ConnectButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
};

export function ConnectButton({ onPress, disabled, label = t("common.connect") }: ConnectButtonProps) {
  const styles = useThemedStyles(createUiStyles);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: "rgba(255,255,255,0.18)" }}
      style={({ pressed }) => [
        styles.connectPressable,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <LinearGradient
        colors={gradients.connect}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.connectGradient}
      >
        <Ionicons name="link" size={18} color="#FFFFFF" />
        <Text style={styles.connectText} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

type AppHeaderProps = {
  /** Left-aligned, bold, white. */
  title: string;
  /** Second line under the title, dimmer white. */
  subtitle?: string;
  /** Shows a round white back button when provided. */
  onBack?: () => void;
  /** Rendered after the back button, before the title (e.g. a small logo). */
  leftAccessory?: ReactNode;
  /** Right-aligned content, e.g. a HeaderIconButton or a badge. */
  right?: ReactNode;
};

/** Rounded-bottom gradient bar used at the top of every screen: round back button, bold left-aligned title, optional right action. */
export function AppHeader({ title, subtitle, onBack, leftAccessory, right }: AppHeaderProps) {
  const styles = useThemedStyles(createUiStyles);
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={gradients.connect}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.appHeader, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.appHeaderRow}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.appHeaderCircle, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={17} color="#15202B" />
          </Pressable>
        )}
        {leftAccessory}
        <View style={styles.appHeaderCopy}>
          <Text style={styles.appHeaderTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.appHeaderSubtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

type HeaderIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
};

/** A plain white icon button for the right side of an AppHeader (no circle background). */
export function HeaderIconButton({ icon, onPress, label }: HeaderIconButtonProps) {
  const styles = useThemedStyles(createUiStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={({ pressed }) => pressed && styles.pressed}>
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
}

export function OrDivider() {
  const styles = useThemedStyles(createUiStyles);
  return (
    <View style={styles.orRow}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>{t("common.or")}</Text>
      <View style={styles.orLine} />
    </View>
  );
}

export function Divider() {
  const styles = useThemedStyles(createUiStyles);
  return <View style={styles.divider} />;
}

export function StepLabel({ children }: { children: string }) {
  const styles = useThemedStyles(createUiStyles);
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function GlobeHero({ compact = false }: { compact?: boolean }) {
  const styles = useThemedStyles(createUiStyles);
  const art = (
    <View style={styles.heroArt}>
      <View style={[styles.heroGlow, { backgroundColor: "rgba(59,130,246,0.22)" }]} />
      <View style={styles.orbit} />
      <LinearGradient
        colors={gradients.globe}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.globe}
      >
        <View style={styles.globeSheen} />
        <Ionicons name="globe-outline" size={52} color="rgba(255,255,255,0.95)" />
      </LinearGradient>
    </View>
  );

  if (!compact) {
    return art;
  }

  return <View style={styles.heroArtCompact}>{art}</View>;
}

export function RouterHero({ compact = false }: { compact?: boolean }) {
  const styles = useThemedStyles(createUiStyles);
  const art = (
    <View style={styles.heroArt}>
      <View style={[styles.heroGlow, { backgroundColor: "rgba(168,85,247,0.2)" }]} />
      <View style={styles.waveWell}>
        <View style={[styles.waveRing, styles.waveRingLarge]} />
        <View style={[styles.waveRing, styles.waveRingMid]} />
        <View style={[styles.waveRing, styles.waveRingSmall]} />
      </View>
      <LinearGradient
        colors={gradients.router}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.routerBody}
      >
        <View style={styles.routerFace}>
          <View style={styles.routerLed} />
          <View style={[styles.routerLed, { backgroundColor: "#A855F7" }]} />
          <View style={[styles.routerLed, { backgroundColor: "#60A5FA" }]} />
        </View>
        <View style={styles.antennaRow}>
          <View style={styles.antenna} />
          <View style={styles.antenna} />
        </View>
      </LinearGradient>
    </View>
  );

  if (!compact) {
    return art;
  }

  return <View style={styles.heroArtCompact}>{art}</View>;
}

function createUiStyles(colors: ThemeColors) {
  return {
    scanCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    scanIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    scanCopy: {
      flex: 1,
      gap: 2,
    },
    scanTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    scanSubtitle: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    shareBlock: {
      gap: 10,
    },
    shareHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    sectionLabel: {
      ...heading(),
      color: colors.textDim,
      fontSize: 11,
      letterSpacing: 1.1,
      textTransform: "uppercase" as const,
    },
    pasteButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.purple,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    pasteText: {
      ...para(700),
      color: colors.purpleSoft,
      fontSize: 10,
      lineHeight: 14,
    },
    inputWrap: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      minHeight: 50,
    },
    input: {
      ...para(),
      flex: 1,
      color: colors.text,
      fontSize: 14,
      paddingVertical: 12,
    },
    connectPressable: {
      alignSelf: "stretch" as const,
      width: "100%" as const,
      borderRadius: radius.md,
      overflow: "hidden" as const,
    },
    connectGradient: {
      width: "100%" as const,
      minHeight: 52,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
    },
    connectText: {
      ...para(700),
      color: "#FFFFFF",
      fontSize: 16,
      backgroundColor: "transparent",
    },
    orRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      marginVertical: 2,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderStrong,
    },
    orText: {
      ...para(700),
      color: colors.textDim,
      fontSize: 12,
      letterSpacing: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderStrong,
      alignSelf: "stretch" as const,
    },
    heroArt: {
      width: 128,
      height: 128,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      alignSelf: "center" as const,
    },
    heroArtCompact: {
      transform: [{ scale: 0.7 }],
      marginHorizontal: -19,
      marginVertical: -19,
    },
    heroGlow: {
      position: "absolute" as const,
      width: 108,
      height: 108,
      borderRadius: 54,
    },
    orbit: {
      position: "absolute" as const,
      width: 118,
      height: 52,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: "rgba(147,197,253,0.55)",
      transform: [{ rotate: "-18deg" }],
    },
    globe: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
    },
    globeSheen: {
      position: "absolute" as const,
      top: 8,
      left: 14,
      width: 28,
      height: 18,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.22)",
    },
    waveWell: {
      position: "absolute" as const,
      top: 4,
      width: 90,
      height: 48,
      overflow: "hidden" as const,
      alignItems: "center" as const,
    },
    waveRing: {
      position: "absolute" as const,
      borderWidth: 3,
      backgroundColor: "transparent",
    },
    waveRingLarge: {
      bottom: -42,
      width: 84,
      height: 84,
      borderRadius: 42,
      borderColor: "rgba(96,165,250,0.28)",
    },
    waveRingMid: {
      bottom: -29,
      width: 58,
      height: 58,
      borderRadius: 29,
      borderColor: "rgba(168,85,247,0.5)",
    },
    waveRingSmall: {
      bottom: -17,
      width: 34,
      height: 34,
      borderRadius: 17,
      borderColor: "rgba(192,132,252,0.9)",
    },
    routerBody: {
      marginTop: 28,
      width: 78,
      height: 42,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingTop: 12,
      justifyContent: "space-between" as const,
      borderWidth: 1,
      borderColor: "rgba(165,180,252,0.25)",
    },
    routerFace: {
      flexDirection: "row" as const,
      gap: 6,
    },
    routerLed: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#34D399",
    },
    antennaRow: {
      position: "absolute" as const,
      top: -16,
      left: 16,
      right: 16,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
    },
    antenna: {
      width: 4,
      height: 18,
      borderRadius: 2,
      backgroundColor: "#818CF8",
    },
    pressed: {
      opacity: 0.82,
    },
    disabled: {
      opacity: 0.55,
    },
    appHeader: {
      paddingTop: 10,
      paddingBottom: 14,
      paddingHorizontal: 14,
    },
    appHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    appHeaderCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#FFFFFF",
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    appHeaderCopy: {
      flex: 1,
      gap: 1,
      justifyContent: "center" as const,
    },
    appHeaderTitle: {
      ...heading(700),
      color: "#FFFFFF",
      fontSize: 17,
      lineHeight: 20,
      textAlign: "left" as const,
    },
    appHeaderSubtitle: {
      ...para(500),
      color: "rgba(255,255,255,0.82)",
      fontSize: 10,
      lineHeight: 13,
    },
  };
}
