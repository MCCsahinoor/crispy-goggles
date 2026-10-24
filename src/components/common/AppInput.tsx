import type { ReactNode } from "react";
import { StyleSheet, View, type TextInputProps } from "react-native";

import { para, useTheme } from "@/theme";
import { borderRadius, spacing } from "@/theme/spacing";
import { Text, TextInput } from "@/utils/disableFontScaling";

type Props = TextInputProps & {
  label: string;
  error?: string;
  rightAccessory?: ReactNode;
};

export default function AppInput({ label, error, rightAccessory, style, ...rest }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.field,
          { backgroundColor: colors.inputBg, borderColor: error ? colors.danger : colors.inputBorder },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textDim}
          style={[styles.input, { color: colors.text }, style]}
          {...rest}
        />
        {rightAccessory}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontSize: 13, ...para(500) },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 48, fontSize: 16, ...para(400) },
  error: { fontSize: 12, ...para(400) },
});
