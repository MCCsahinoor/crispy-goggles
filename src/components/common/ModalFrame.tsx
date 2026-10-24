import type { ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { t } from "../../i18n";
import { useLayout } from "../../utils/responsive";
import { radius, useThemedStyles, type ThemeColors } from "../../theme";

type ModalFrameProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  dismissOnBackdrop?: boolean;
  gap?: number;
  cardStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Modals often report 0 bottom inset; fall back to launch metrics or a nav-bar guess. */
function effectiveBottomInset(bottom: number): number {
  if (bottom > 0) {
    return bottom;
  }
  const initial = initialWindowMetrics?.insets.bottom ?? 0;
  if (initial > 0) {
    return initial;
  }
  return Platform.OS === "android" ? 48 : 0;
}

/**
 * Dialog shell with a height-bounded card (absolute frame). The middle section scrolls;
 * header and footer stay visible above the system navigation bar.
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

  const edge = 10;
  const bottomInset = effectiveBottomInset(insets.bottom);
  const padLeft = Math.max(layout.gutter, insets.left);
  const padRight = Math.max(layout.gutter, insets.right);
  const cardMaxWidth = Math.min(layout.modalMaxWidth, layout.width - padLeft - padRight);
  const cardPadding = layout.isCompact ? 14 : 20;

  const frameStyle = {
    top: insets.top + edge,
    bottom: bottomInset + edge,
    left: padLeft,
    right: padRight,
  };

  const bodyStyle = scroll ? styles.bodyScroll : styles.bodyStatic;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeRoot} edges={[]}>
        <View style={styles.backdrop}>
          {dismissOnBackdrop ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityLabel={accessibilityLabel}
            />
          ) : null}

          <View style={[styles.frame, frameStyle]} pointerEvents="box-none">
            <View
              style={[
                styles.card,
                { padding: cardPadding, maxWidth: cardMaxWidth },
                cardStyle,
              ]}
            >
              {header ? <View style={styles.headerShell}>{header}</View> : null}
              {scroll ? (
                <ScrollView
                  style={bodyStyle}
                  contentContainerStyle={{ gap, paddingBottom: 4 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                >
                  {children}
                </ScrollView>
              ) : (
                <ScrollView
                  style={bodyStyle}
                  contentContainerStyle={{ gap }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                >
                  {children}
                </ScrollView>
              )}
              {footer ? <View style={styles.footerShell}>{footer}</View> : null}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    safeRoot: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    frame: {
      position: "absolute" as const,
      alignItems: "center" as const,
      zIndex: 1,
    },
    card: {
      width: "100%" as const,
      height: "100%" as const,
      flexDirection: "column" as const,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden" as const,
      elevation: 8,
    },
    headerShell: {
      flexShrink: 0,
    },
    footerShell: {
      flexShrink: 0,
      paddingTop: 4,
    },
    bodyScroll: {
      flex: 1,
      minHeight: 0,
    },
    bodyStatic: {
      flex: 1,
      minHeight: 0,
    },
  };
}
