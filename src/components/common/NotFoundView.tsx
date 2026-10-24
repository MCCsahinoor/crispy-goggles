import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import ScreenContainer from "@/components/layout/ScreenContainer";
import { heading, para, useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { Text } from "@/utils/disableFontScaling";

export default function NotFoundView() {
  const { colors } = useTheme();

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.text }]}>This screen doesn't exist.</Text>
        <Link href="/" style={[styles.link, { color: colors.blue }]}>
          Go to the home screen
        </Link>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  title: { fontSize: 20, ...heading(700) },
  link: { fontSize: 15, ...para(600) },
});
