import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import WifiManager from "react-native-wifi-reborn";

import { WifiCredentials } from "../lib/filedrop";
import { radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import {
  ConnectButton,
  OrDivider,
  RouterHero,
  ScanActionCard,
  ShareLinkField,
  StepLabel,
} from "./ui";

type LocalConnectPanelProps = {
  wifiDetails: WifiCredentials | null;
  shareUrl: string;
  onShareUrlChange: (value: string) => void;
  onPasteUrl: () => void;
  onScanWifi: () => void;
  onScanShare: () => void;
  onConnect: () => void;
  onConnectToWifi: () => void | Promise<void>;
  connectError?: string;
  loading: boolean;
};

function maskPassword(password: string): string {
  if (!password) {
    return "(none)";
  }
  if (password.length <= 4) {
    return password;
  }
  return password.slice(0, 2) + "*".repeat(password.length - 4) + password.slice(-2);
}

function normalizeSsid(ssid: string): string {
  return ssid.replace(/^"|"$/g, "").trim();
}

export default function LocalConnectPanel({
  wifiDetails,
  shareUrl,
  onShareUrlChange,
  onPasteUrl,
  onScanWifi,
  onScanShare,
  onConnect,
  onConnectToWifi,
  connectError,
  loading,
}: LocalConnectPanelProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [isConnectedToTargetWifi, setIsConnectedToTargetWifi] = useState(false);

  const checkWifiConnection = useCallback(async () => {
    if (!wifiDetails) {
      setIsConnectedToTargetWifi(false);
      return;
    }

    if (Platform.OS !== "android") {
      setIsConnectedToTargetWifi(false);
      return;
    }

    try {
      const currentSSID = await WifiManager.getCurrentWifiSSID();
      setIsConnectedToTargetWifi(
        normalizeSsid(currentSSID) === normalizeSsid(wifiDetails.ssid),
      );
    } catch {
      setIsConnectedToTargetWifi(false);
    }
  }, [wifiDetails]);

  useEffect(() => {
    checkWifiConnection();
  }, [checkWifiConnection]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkWifiConnection();
      }
    });

    return () => subscription.remove();
  }, [checkWifiConnection]);

  const handleConnectToWifi = useCallback(async () => {
    await onConnectToWifi();
    await checkWifiConnection();
  }, [checkWifiConnection, onConnectToWifi]);

  return (
    <View style={styles.panel}>
      <View style={styles.heroRow}>
        <RouterHero compact />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Local network mode</Text>
          <Text style={styles.heroText}>
            Use when Filora Desktop is in Local network mode. Join the PC hotspot or same Wi-Fi.
          </Text>
        </View>
      </View>

      <View style={styles.stepBlock}>
        <StepLabel>Step 1 — Join PC network</StepLabel>
        <ScanActionCard
          icon="wifi-outline"
          iconColor={colors.purpleSoft}
          title="Scan Wi-Fi QR"
          subtitle="Scan the QR to join PC network."
          onPress={onScanWifi}
          disabled={loading}
        />
        {wifiDetails &&
          (isConnectedToTargetWifi ? (
            <View style={styles.wifiConnectedBox}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.wifiConnectedText}>{wifiDetails.ssid} network connected</Text>
            </View>
          ) : (
            <View style={styles.wifiBox}>
              <View style={styles.wifiDetailsRow}>
                <View style={styles.wifiDetailItemLeft}>
                  <Ionicons name="wifi" size={16} color={colors.purpleSoft} />
                  <Text style={styles.wifiLine} numberOfLines={1}>
                    {wifiDetails.ssid}
                  </Text>
                </View>
                <View style={styles.wifiDetailItemRight}>
                  <Ionicons name="lock-closed" size={15} color={colors.purpleSoft} />
                  <Text style={styles.wifiLine}>{maskPassword(wifiDetails.password)}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
                onPress={handleConnectToWifi}
              >
                <Text style={styles.linkButtonText}>Connect to {wifiDetails.ssid}</Text>
              </Pressable>
            </View>
          ))}
      </View>

      <View style={styles.stepBlock}>
        <StepLabel>Step 2 — Connect to PC</StepLabel>
        <ScanActionCard
          icon="qr-code-outline"
          iconColor={colors.purpleSoft}
          title="Scan Share QR"
          subtitle="Scan the QR from Filora Desktop."
          onPress={onScanShare}
          disabled={loading}
        />
      </View>
      <OrDivider />
      <ShareLinkField
        value={shareUrl}
        onChangeText={onShareUrlChange}
        onPaste={onPasteUrl}
        placeholder="http://192.168.137.1:8765/s/9GEL16siviA"
      />
      <ConnectButton onPress={onConnect} disabled={loading} />
      {!!connectError && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{connectError}</Text>
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
  stepBlock: {
    gap: 10,
  },
  wifiBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wifiConnectedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  wifiConnectedText: {
    flex: 1,
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  wifiDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wifiDetailItemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  wifiDetailItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  wifiLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  errorBanner: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  errorText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  linkButtonText: {
    color: colors.purpleSoft,
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
}
