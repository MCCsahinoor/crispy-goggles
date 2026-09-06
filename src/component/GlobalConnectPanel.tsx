import {
  ConnectButton,
  GlobeHero,
  OrDivider,
  ScanActionCard,
  ShareLinkField,
} from "./ui";
import { StyleSheet, View } from "react-native";

import { Text } from "../lib/disableFontScaling";

import { heading, para, useThemedStyles, type ThemeColors } from "../theme";

type GlobalConnectPanelProps = {
  shareUrl: string;
  onShareUrlChange: (url: string) => void;
  onPasteUrl: () => void;
  onConnect: () => void;
  onScanShare: () => void;
  loading: boolean;
};

export default function GlobalConnectPanel({
  shareUrl,
  onShareUrlChange,
  onPasteUrl,
  onConnect,
  onScanShare,
  loading,
}: GlobalConnectPanelProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.panel}>
      <View style={styles.heroRow}>
        <GlobeHero compact />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Global link mode</Text>
          <Text style={styles.heroText}>
            Use this when Filora Desktop is in Global link mode. Phone can use mobile data.
          </Text>
        </View>
      </View>

      <ShareLinkField
        value={shareUrl}
        onChangeText={onShareUrlChange}
        onPaste={onPasteUrl}
        placeholder="https://aaaa.trycloudflare/s/..."
      />
      <ConnectButton onPress={onConnect} disabled={loading} />
      <OrDivider />
      <ScanActionCard
        icon="qr-code-outline"
        title="Scan Share QR"
        subtitle="Scan the QR code from Filora Desktop"
        onPress={onScanShare}
        disabled={loading}
      />
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
});
}
