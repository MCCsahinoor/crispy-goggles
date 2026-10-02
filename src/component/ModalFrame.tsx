import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "../i18n";
import { useLayout } from "../lib/responsive";
import { radius, useThemedStyles, type ThemeColors } from "../theme";

type ModalFrameProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pinned above the scrolling body. */
  header?: ReactNode;
  /** Pinned below the scrolling body (always visible). */
  footer?: ReactNode;
  /** Wrap the body in a ScrollView when it can be taller than the screen. Default true. */
  scroll?: boolean;
  /** Tapping the dimmed backdrop closes the dialog. Default true. */
  dismissOnBackdrop?: boolean;
  /** Extra space between body children. */
  gap?: number;
  cardStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Shared dialog shell: centered card that respects safe areas, caps its width on tablets,
 * caps its height on short / landscape screens, and scrolls the body instead of clipping it.
 */
export default function ModalFrame({
  visible,
  onClose,
  children,
  header,
  footer,
  scroll = true,
  dismissOnBackdrop = true,
  gap = 10,
  cardStyle,
  accessibilityLabel = t("common.close"),
}: ModalFrameProps) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  const verticalPad = 12;
  const maxCardHeight = Math.max(
    240,
    layout.height - insets.top - insets.bottom - verticalPad * 2,
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: insets.top + verticalPad,
            paddingBottom: insets.bottom + verticalPad,
            paddingLeft: Math.max(layout.gutter, insets.left),
            paddingRight: Math.max(layout.gutter, insets.right),
          },
        ]}
      >
        {dismissOnBackdrop ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel={accessibilityLabel}
          />
        ) : null}
        <View
          style={[
            styles.card,
            { width: "100%", maxWidth: layout.modalMaxWidth, maxHeight: maxCardHeight },
            cardStyle,
          ]}
        >
          {header}
          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={{ gap }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, { gap }]}>{children}</View>
          )}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 20,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden" as const,
      zIndex: 1,
      elevation: 8,
    },
    body: {
      flexGrow: 0,
      flexShrink: 1,
    },
  };
}
