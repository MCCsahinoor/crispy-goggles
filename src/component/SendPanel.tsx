import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import {
  createSendSession,
  formatBytes,
  SendFile,
  SendProgress,
  SendSession,
  uploadFilesToPc,
  waitForPcReceive,
} from "../lib/sendToPc";
import { gradients, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
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
  const [step, setStep] = useState<SendStep>("pick");
  const [files, setFiles] = useState<SendFile[]>([]);
  const [session, setSession] = useState<SendSession | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [waiting, setWaiting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("pick");
    setFiles([]);
    setSession(null);
    setProgress(null);
    setWaiting(false);
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
      onToast(error instanceof Error ? error.message : "Could not pick files.");
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
      onToast(error instanceof Error ? error.message : "Could not pick files.");
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
      onToast(`Sent ${files.length} file${files.length === 1 ? "" : "s"} to your PC.`);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "Send failed.";
      setProgress({ phase: "error", uploadedCount: 0, totalCount: files.length, message });
      onToast(message);
    } finally {
      setWaiting(false);
    }
  }, [files, onToast]);

  const qrColor = scheme === "dark" ? "#FFFFFF" : "#07080D";
  const qrBg = scheme === "dark" ? "#12141C" : "#FFFFFF";

  return (
    <View style={styles.panel}>
      <View style={styles.heroRow}>
        <View style={styles.heroIconWrap}>
          <LinearGradient colors={gradients.connect} style={styles.heroIcon}>
            <Ionicons name="cloud-upload-outline" size={28} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Send to PC</Text>
          <Text style={styles.heroText}>
            Select files on your phone, generate a QR code, then scan it from Filora Desktop to
            upload.
          </Text>
        </View>
      </View>

      {step === "pick" && (
        <>
          <StepLabel>Step 1 · Select files</StepLabel>
          <Pressable
            onPress={pickFiles}
            style={({ pressed }) => [styles.pickCard, pressed && styles.pressed]}
          >
            <View style={styles.pickIconWrap}>
              <Ionicons name="document-attach-outline" size={24} color={colors.blueSoft} />
            </View>
            <View style={styles.pickCopy}>
              <Text style={styles.pickTitle}>Choose files</Text>
              <Text style={styles.pickSubtitle}>Photos, documents, videos, and more</Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={colors.textDim} />
          </Pressable>
        </>
      )}

      {(step === "ready" || step === "qr" || step === "uploading") && files.length > 0 && (
        <>
          <StepLabel>{`Selected files (${files.length})`}</StepLabel>
          <ScrollView
            style={styles.fileList}
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
                <Text style={styles.linkButtonText}>Add more files</Text>
              </Pressable>
              <OrDivider />
              <StepLabel>Step 2 · Generate QR</StepLabel>
              <ConnectButton onPress={startSend} disabled={waiting} label="Generate QR" />
            </>
          )}
        </>
      )}

      {(step === "qr" || step === "uploading") && session && (
        <View style={styles.qrBlock}>
          <StepLabel>Step 3 · Scan from Filora Desktop</StepLabel>
          <View style={styles.qrWrap}>
            <QRCode value={session.qrValue} size={200} color={qrColor} backgroundColor={qrBg} />
          </View>
          <Text style={styles.qrHint}>
            On your PC, open Filora Desktop → Receive from phone → Scan this QR. Your phone will
            connect and upload automatically.
          </Text>
          {progress?.phase === "waiting" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>
                {files.length} file{files.length === 1 ? "" : "s"} ready — scan this QR on Filora
                Desktop
              </Text>
            </View>
          )}
          {progress?.phase === "connecting" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>
                Desktop scanned — uploading {files.length} file{files.length === 1 ? "" : "s"}…
              </Text>
            </View>
          )}
          {progress?.phase === "uploading" && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.blueSoft} />
              <Text style={styles.statusText}>
                Uploading {progress.uploadedCount + 1} of {progress.totalCount}
                {progress.currentFile ? `: ${progress.currentFile}` : ""}
              </Text>
            </View>
          )}
          {progress?.phase === "error" && (
            <Text style={styles.errorText}>{progress.message}</Text>
          )}
          <Pressable onPress={reset} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {step === "done" && (
        <View style={styles.doneBlock}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={styles.doneTitle}>Sent to PC</Text>
          <Text style={styles.doneText}>
            {files.length} file{files.length === 1 ? "" : "s"} uploaded successfully.
          </Text>
          <ConnectButton onPress={reset} label="Send more files" />
        </View>
      )}
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
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    heroText: {
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
      paddingHorizontal: 14,
      paddingVertical: 16,
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
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },
    pickSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
    },
    fileList: {
      maxHeight: 220,
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
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    fileSize: {
      color: colors.textMuted,
      fontSize: 12,
    },
    linkButton: {
      alignItems: "center",
      paddingVertical: 4,
    },
    linkButtonText: {
      color: colors.blueSoft,
      fontSize: 14,
      fontWeight: "600",
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
    qrHint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    statusText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    errorText: {
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
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
    },
    doneText: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      marginBottom: 8,
    },
    pressed: {
      opacity: 0.82,
    },
  });
}
