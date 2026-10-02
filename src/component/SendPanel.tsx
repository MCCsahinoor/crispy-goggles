import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { t, tn } from "../i18n";
import { Text } from "../lib/disableFontScaling";

import {
  createSendSession,
  formatBytes,
  SendFile,
  SendProgress,
  SendSession,
  uploadFilesToPc,
  waitForPcReceive,
} from "../lib/sendToPc";
import { useLayout } from "../lib/responsive";
import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import { ConnectButton, OrDivider, StepLabel } from "./ui";

type SendPanelProps = {
  onToast: (message: string) => void;
};

type SendStep = "pick" | "ready" | "qr" | "uploading" | "done";

function mapPickedFiles(
  assets: DocumentPicker.DocumentPickerAsset[],
): SendFile[] {
  return assets.map((asset, index) => ({
    id: `${Date.now()}-${index}`,
    name: asset.name || `file-${index + 1}`,
    uri: asset.uri,
    size: asset.size ?? 0,
    mimeType: asset.mimeType ?? undefined,
  }));
}

export default function SendPanel({ onToast }: SendPanelProps) {
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  const [step, setStep] = useState<SendStep>("pick");
  const [files, setFiles] = useState<SendFile[]>([]);
  const [session, setSession] = useState<SendSession | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [qrZoomed, setQrZoomed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("pick");
    setFiles([]);
    setSession(null);
    setProgress(null);
    setWaiting(false);
    setQrZoomed(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const pickFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      setFiles(mapPickedFiles(result.assets));
      setStep("ready");
      setSession(null);
      setProgress(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : t("send.couldNotPick"));
    }
  }, [onToast]);

  const addMoreFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      setFiles((prev) => [...prev, ...mapPickedFiles(result.assets)]);
    } catch (error) {
      onToast(error instanceof Error ? error.message : t("send.couldNotPick"));
    }
  }, [onToast]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (next.length === 0) {
        setStep("pick");
        setSession(null);
      }
      return next;
    });
  }, []);

  const startSend = useCallback(async () => {
    if (files.length === 0) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setWaiting(true);
      const nextSession = await createSendSession(files);
      setSession(nextSession);
      setStep("qr");
      setProgress({ phase: "waiting", uploadedCount: 0, totalCount: files.length });

      const receive = await waitForPcReceive(nextSession, controller.signal, undefined, () => {
        setProgress((prev) =>
          prev?.phase === "waiting"
            ? { phase: "connecting", uploadedCount: 0, totalCount: files.length }
            : prev,
        );
      });
      setProgress({ phase: "uploading", uploadedCount: 0, totalCount: files.length });
      setStep("uploading");

      await uploadFilesToPc(nextSession, receive, setProgress, controller.signal);
      setStep("done");
      onToast(tn("send.toastSent", files.length));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : t("send.failed");
      setProgress({ phase: "error", uploadedCount: 0, totalCount: files.length, message });
      onToast(message);
    } finally {
      setWaiting(false);
    }
  }, [files, onToast]);

  const copySendCode = useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      await Clipboard.setStringAsync(session.qrValue);
      onToast(t("send.copied"));
    } catch {
      onToast(t("send.couldNotCopy"));
    }
  }, [onToast, session]);

  const qrColor = scheme === "dark" ? "#FFFFFF" : "#07080D";
  const qrBg = scheme === "dark" ? "#12141C" : "#FFFFFF";
  const fileListMaxHeight = Math.max(120, Math.min(320, Math.round(layout.height * 0.28)));

  return (
    <View style={styles.panel}>
      <View style={styles.heroRow}>
        <View style={styles.heroIconWrap}>
          <LinearGradient colors={gradients.connect} style={styles.heroIcon}>
            <Ionicons name="cloud-upload-outline" size={28} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{t("send.title")}</Text>
          <Text style={styles.heroText}>{t("send.hero")}</Text>
        </View>
      </View>

      {step === "pick" && (
        <>
          <StepLabel>{t("send.step1")}</StepLabel>
          <Pressable
            onPress={pickFiles}
            style={({ pressed }) => [styles.pickCard, pressed && styles.pressed]}
          >
            <View style={styles.pickIconWrap}>
              <Ionicons name="document-attach-outline" size={24} color={colors.blueSoft} />
            </View>
            <View style={styles.pickCopy}>
              <Text style={styles.pickTitle}>{t("send.chooseFiles")}</Text>
              <Text style={styles.pickSubtitle}>{t("send.chooseFilesSubtitle")}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={colors.textDim} />
          </Pressable>
        </>
      )}

      {(step === "ready" || step === "qr" || step === "uploading") && files.length > 0 && (
        <>
          <StepLabel>{t("send.selected", { count: files.length })}</StepLabel>
          <ScrollView
            style={[styles.fileList, { maxHeight: fileListMaxHeight }]}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {files.map((item) => (
              <View key={item.id} style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Ionicons name="document-outline" size={18} color={colors.blueSoft} />
                </View>
                <View style={styles.fileCopy}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>
                </View>
                {step === "ready" && (
                  <Pressable onPress={() => removeFile(item.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textDim} />
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>

          {step === "ready" && (
            <>
              <Pressable onPress={addMoreFiles} style={styles.linkButton}>
                <Text style={styles.linkButtonText}>{t("send.addMore")}</Text>
              </Pressable>
              <OrDivider />
              <StepLabel>{t("send.step2")}</StepLabel>
              <ConnectButton onPress={startSend} disabled={waiting} label={t("send.generateQr")} />
            </>
          )}
        </>
      )}

      {(step === "qr" || step === "uploading") && session && (
        <View style={styles.qrBlock}>
          <StepLabel>{t("send.step3")}</StepLabel>
          <Pressable
            onPress={() => setQrZoomed(true)}
            accessibilityRole="button"
            accessibilityLabel={t("send.zoomQr")}
            style={({ pressed }) => [styles.qrWrap, pressed && styles.pressed]}
          >
            <QRCode value={session.qrValue} size={layout.qrSize} color={qrColor} backgroundColor={qrBg} />
            <View style={styles.qrZoomBadge}>
              <Ionicons name="expand-outline" size={16} color={colors.textMuted} />
            </View>
          </Pressable>
          <Text style={styles.qrZoomCaption}>{t("send.tapToZoom")}</Text>
          <Text style={styles.qrHint}>{t("send.qrHint")}</Text>
          <View style={styles.codePath}>
            <OrDivider />
            <Text style={styles.codeLabel}>{t("send.noCamera")}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeValue} numberOfLines={2} selectable>
                {session.qrValue}
              </Text>
              <Pressable
                onPress={() => {
                  void copySendCode();
                }}
                accessibilityRole="button"
                accessibilityLabel={t("send.copyCodeLabel")}
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
              >
                <Ionicons name="copy-outline" size={14} color={colors.purpleSoft} />
                <Text style={styles.copyButtonText}>{t("common.copy")}</Text>
              </Pressable>
            </View>
            <Text style={styles.codeHint}>{t("send.pasteHint")}</Text>
          </View>
          {progress?.phase === "waiting" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>{tn("send.waiting", files.length)}</Text>
            </View>
          )}
          {progress?.phase === "connecting" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>{tn("send.connecting", files.length)}</Text>
            </View>
          )}
          {progress?.phase === "uploading" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>
                {progress.currentFile
                  ? t("send.uploadingFile", {
                      current: progress.uploadedCount + 1,
                      total: progress.totalCount,
                      file: progress.currentFile,
                    })
                  : t("send.uploading", {
                      current: progress.uploadedCount + 1,
                      total: progress.totalCount,
                    })}
              </Text>
            </View>
          )}
          {progress?.phase === "error" && (
            <Text style={styles.errorText}>{progress.message}</Text>
          )}
          <Pressable onPress={reset} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      )}

      {step === "done" && (
        <View style={styles.doneBlock}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={styles.doneTitle}>{t("send.doneTitle")}</Text>
          <Text style={styles.doneText}>{tn("send.doneBody", files.length)}</Text>
          <View style={styles.doneButtonWrap}>
            <ConnectButton onPress={reset} label={t("send.sendMore")} />
          </View>
        </View>
      )}

      <Modal
        transparent
        visible={qrZoomed && !!session}
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setQrZoomed(false)}
      >
        <Pressable style={styles.qrZoomBackdrop} onPress={() => setQrZoomed(false)}>
          <View style={styles.qrZoomCard} pointerEvents="none">
            {session ? (
              <QRCode
                value={session.qrValue}
                size={layout.qrZoomSize}
                color={qrColor}
                backgroundColor={qrBg}
              />
            ) : null}
          </View>
          <Text style={styles.qrZoomCloseHint}>{t("send.tapToClose")}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      gap: 16,
      paddingBottom: 8,
    },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 4,
    },
    heroIconWrap: {
      width: 56,
      height: 56,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    heroCopy: {
      flex: 1,
      gap: 6,
      minWidth: 0,
    },
    heroTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 16,
      lineHeight: 23,
    },
    heroText: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    pickCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    pickIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(59,130,246,0.14)",
    },
    pickCopy: {
      flex: 1,
      gap: 2,
    },
    pickTitle: {
      ...heading(600),
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    pickSubtitle: {
      ...para(500),
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    fileList: {
      flexGrow: 0,
    },
    fileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    fileIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bgElevated,
    },
    fileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    fileName: {
      ...para(600),
      color: colors.text,
      fontSize: 14,
    },
    fileSize: {
      ...para(),
      color: colors.textMuted,
      fontSize: 12,
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
    qrBlock: {
      gap: 12,
      alignItems: "center",
    },
    qrWrap: {
      padding: 16,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    qrZoomBadge: {
      position: "absolute",
      right: 10,
      bottom: 10,
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    qrZoomCaption: {
      ...para(500),
      color: colors.textDim,
      fontSize: 12,
      lineHeight: 16,
      marginTop: -4,
    },
    qrZoomBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      gap: 16,
    },
    qrZoomCard: {
      padding: 20,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    qrZoomCloseHint: {
      ...para(600),
      color: "#FFFFFF",
      fontSize: 14,
    },
    qrHint: {
      ...para(),
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
    },
    codePath: {
      alignSelf: "stretch",
      width: "100%",
      gap: 10,
    },
    codeLabel: {
      ...heading(),
      color: colors.textMuted,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    codeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingLeft: 12,
      paddingRight: 8,
      paddingVertical: 8,
      minHeight: 50,
    },
    codeValue: {
      ...para(),
      flex: 1,
      color: colors.text,
      fontSize: 12,
      lineHeight: 16,
    },
    copyButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.purple,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    copyButtonText: {
      ...para(700),
      color: colors.purpleSoft,
      fontSize: 12,
      lineHeight: 16,
    },
    codeHint: {
      ...para(),
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    statusText: {
      ...para(600),
      color: colors.text,
      fontSize: 13,
    },
    errorText: {
      ...para(),
      color: colors.danger,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    doneBlock: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
    },
    doneTitle: {
      ...heading(),
      color: colors.text,
      fontSize: 20,
    },
    doneText: {
      ...para(),
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      marginBottom: 8,
    },
    doneButtonWrap: {
      alignSelf: "stretch",
      width: "100%",
      marginTop: 4,
    },
    pressed: {
      opacity: 0.82,
    },
  });
}
