import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { usePcSessionContext } from "@/features/filora/hooks/usePcSession";
import { t } from "@/i18n";
import {
  gradients,
  heading,
  para,
  radius,
  useTheme,
  useThemedStyles,
  type ThemeColors,
} from "@/theme";
import { Text, TextInput } from "@/utils/disableFontScaling";

// Step 2 (only when the share is password protected): unlock the files.
export default function PcPasswordPage() {
  const { password, setPassword, message, loading, resetSession, handleUnlock, showInterstitial } =
    usePcSessionContext();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} >
      <View style={styles.panel}>
        <Text style={styles.label}>{t("connect.accessPassword")}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t("connect.passwordPlaceholder")}
          placeholderTextColor={colors.textDim}
          secureTextEntry
          style={styles.input}
        />
        <Pressable style={({ pressed }) => [styles.unlockButton, pressed && styles.pressed]}
          onPress={() => {
            void (async () => {
              await showInterstitial();
              await handleUnlock();
            })();
          }}
          disabled={loading}
        >
          <LinearGradient colors={gradients.connect} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.unlockGradient} >
            <Text style={styles.unlockText}>{t("connect.unlockFiles")}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.linkButton}
          onPress={() => {
            void (async () => {
              await showInterstitial();
              resetSession();
            })();
          }}
        >
          <Text style={styles.linkButtonText}>{t("connect.useAnotherLink")}</Text>
        </Pressable>
      </View>

      {!!message && !loading && (
        <View style={[styles.statusBanner, styles.statusBannerWarning]}>
          <Text style={[styles.statusBannerText, styles.statusBannerWarningText]}> {message} </Text>
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 16,
    },
    panel: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      ...heading(),
      fontSize: 12,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    input: {
      ...para(),
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 14,
      backgroundColor: colors.inputBg,
      color: colors.text,
    },
    unlockButton: {
      borderRadius: radius.md,
      overflow: "hidden",
    },
    pressed: {
      opacity: 0.75,
    },
    unlockGradient: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    unlockText: {
      ...para(700),
      color: "#fff",
      fontSize: 15,
    },
    linkButton: {
      alignItems: "center",
      paddingVertical: 4,
    },
    linkButtonText: {
      ...para(600),
      color: colors.blueSoft,
      fontSize: 14,
    },
    statusBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(59,130,246,0.12)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: "rgba(59,130,246,0.28)",
      marginTop: 12,
    },
    statusBannerWarning: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningBorder,
    },
    statusBannerText: {
      ...para(500),
      flex: 1,
      color: colors.blueSoft,
      fontSize: 13,
      lineHeight: 18,
    },
    statusBannerWarningText: {
      color: colors.warning,
    },
  });
}
