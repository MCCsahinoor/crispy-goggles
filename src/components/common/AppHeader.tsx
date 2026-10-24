import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { heading, para, useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { Text } from "@/utils/disableFontScaling";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
};

export default function AppHeader({ title, subtitle, showBack = false }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  texts: { flex: 1, gap: spacing.xs },
  title: { fontSize: 26, ...heading(700) },
  subtitle: { fontSize: 14, ...para(400) },
});
