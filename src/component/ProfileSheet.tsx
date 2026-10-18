/**
 * Bottom sheet for the phone's sharing profile: the handle other phones see (with a one-tap
 * generator) and the emoji that stands in for the phone icon.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "../i18n";
import { Text, TextInput } from "../lib/disableFontScaling";
import {
  PROFILE_EMOJIS,
  PROFILE_NAME_MAX,
  generateHandle,
  isValidHandle,
  sanitizeHandle,
  type Profile,
} from "../lib/profile";
import { heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import { Avatar } from "./PhoneShareUi";

type ProfileSheetProps = {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (next: Profile) => void;
};

const EMOJI_COLUMNS = 8;

/** The modal window is edge-to-edge, and often reports a 0 bottom inset: fall back like ModalFrame. */
function bottomInset(reported: number): number {
  if (reported > 0) {
    return reported;
  }
  const initial = initialWindowMetrics?.insets.bottom ?? 0;
  return initial > 0 ? initial : Platform.OS === "android" ? 48 : 0;
}

export default function ProfileSheet({ visible, profile, onClose, onSave }: ProfileSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [name, setName] = useState(profile.name);
  const [emoji, setEmoji] = useState(profile.emoji);
  // Cells are sized from the measured grid width: percentages round unevenly and drop a column.
  const [gridWidth, setGridWidth] = useState(0);
  const cell = gridWidth > 0 ? Math.floor(gridWidth / EMOJI_COLUMNS) : 0;

  // Start from the saved profile each time the sheet opens, dropping any abandoned edits.
  useEffect(() => {
    if (visible) {
      setName(profile.name);
      setEmoji(profile.emoji);
    }
  }, [visible, profile]);

  const valid = isValidHandle(name);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("common.close")} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { paddingBottom: 16 + bottomInset(insets.bottom), maxHeight: windowHeight - insets.top - 24 }]}>
            <View style={styles.grabber} />
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={styles.title}>{t("phone.profileTitle")}</Text>

            <View style={styles.preview}>
              <Avatar name={name || "?"} size={64} emoji={emoji} />
              <Text style={styles.previewName} numberOfLines={1}>@{name || "…"}</Text>
            </View>

            <Text style={styles.label}>{t("phone.profileName")}</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrap}>
                <Text style={styles.at}>@</Text>
                <TextInput
                  value={name}
                  onChangeText={(value) => setName(sanitizeHandle(value))}
                  maxLength={PROFILE_NAME_MAX}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="SunnyFox"
                  placeholderTextColor={colors.textDim}
                  style={styles.input}
                />
              </View>
              <Pressable
                onPress={() => setName(generateHandle())}
                accessibilityRole="button"
                accessibilityLabel={t("phone.newName")}
                style={({ pressed }) => [styles.shuffle, pressed && styles.pressed]}
              >
                <Ionicons name="shuffle" size={18} color={colors.blueSoft} />
                <Text style={styles.shuffleText} numberOfLines={1}>{t("phone.newName")}</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>{t("phone.profileHint")}</Text>

            <Text style={styles.label}>{t("phone.pickEmoji")}</Text>
            <View style={styles.emojiGrid} onLayout={(event) => setGridWidth(Math.floor(event.nativeEvent.layout.width))}>
              {cell > 0 && PROFILE_EMOJIS.map((item) => {
                const active = item === emoji;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setEmoji(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.emojiCell, { width: cell, height: cell }, active && styles.emojiActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.emoji, { fontSize: Math.min(24, Math.round(cell * 0.55)) }]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.note}>{t("phone.profileSeen")}</Text>
            </ScrollView>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={!valid}
                onPress={() => onSave({ name, emoji })}
                style={({ pressed }) => [styles.primary, !valid && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
    sheetWrap: { width: "100%" },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 10,
      gap: 10,
    },
    grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 2 },
    title: { ...heading(700), color: colors.text, fontSize: 18, textAlign: "center" },
    preview: { alignItems: "center", gap: 6, paddingVertical: 2 },
    previewName: { ...heading(700), color: colors.text, fontSize: 16, maxWidth: 260 },
    label: { ...para(700), color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
    inputRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
    inputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingLeft: 12,
    },
    at: { ...heading(700), color: colors.textMuted, fontSize: 17, marginRight: 2 },
    input: { ...para(600), flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10, paddingRight: 12 },
    shuffle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    shuffleText: { ...para(700), color: colors.text, fontSize: 12 },
    hint: { ...para(500), color: colors.textDim, fontSize: 11 },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { gap: 10 },
    emojiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
    emojiCell: { alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 2, borderColor: "transparent" },
    emojiActive: { backgroundColor: "rgba(168,85,247,0.14)", borderColor: colors.purple },
    emoji: { includeFontPadding: false, textAlign: "center" },
    note: { ...para(500), color: colors.textMuted, fontSize: 12, textAlign: "center" },
    actions: { flexDirection: "row", gap: 10, marginTop: 4 },
    primary: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 46, borderRadius: 999, backgroundColor: colors.purple },
    primaryText: { ...para(700), color: "#FFFFFF", fontSize: 15 },
    secondary: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    secondaryText: { ...para(700), color: colors.text, fontSize: 15 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.8 },
  });
}
