import { ActivityIndicator, StyleSheet, View } from "react-native";

import { para, useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { Text } from "@/utils/disableFontScaling";

export default function Loader({ message }: { message?: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.blue} />
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  message: { fontSize: 14, ...para(400) },
});
