import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
};

export default function ScreenContainer({
  children,
  scroll = false,
  padded = true,
  edges = ["top", "left", "right", "bottom"],
  style,
}: Props) {
  const { colors, scheme } = useTheme();
  const contentStyle = [padded ? styles.padded : null, style];

  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.grow, ...contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.grow, ...contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: spacing.lg },
});
