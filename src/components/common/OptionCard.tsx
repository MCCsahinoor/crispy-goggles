import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "@/theme";
import { Text } from "@/utils/disableFontScaling";

type OptionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  body: string;
  onPress: () => void;
};

export default function OptionCard({ icon, tint, title, body, onPress }: OptionCardProps) {
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
