import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { t } from "../i18n";
import { Text } from "../lib/disableFontScaling";
import { useLayout } from "../lib/responsive";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";

type LaunchScreenProps = {
  onSelectPc: () => void;
  onSelectPhone: () => void;
};

type OptionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  body: string;
  onPress: () => void;
};

function OptionCard({ icon, tint, title, body, onPress }: OptionCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={28} color={tint} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </Pressable>
  );
}

export default function LaunchScreen({ onSelectPc, onSelectPhone }: LaunchScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();

  return (
    <View
      style={[
        styles.screen,
        { maxWidth: layout.contentMaxWidth, paddingHorizontal: layout.gutter },
      ]}
    >
      <View style={styles.brand}>
        <Image
          source={require("../../assets/logo.png")}
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
          onPress={onSelectPc}
        />
        <OptionCard
          icon="phone-portrait-outline"
          tint={colors.purpleSoft}
          title={t("launch.phoneTitle")}
          body={t("launch.phoneBody")}
          onPress={onSelectPhone}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    cardCopy: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    cardTitle: {
      ...heading(600),
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
    cardBody: {
      ...para(500),
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    pressed: {
      opacity: 0.75,
    },
  });
}
