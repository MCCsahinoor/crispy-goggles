import { ScrollView, StyleSheet, View } from "react-native";

import ConnectModeTabs from "@/components/filora/ConnectModeTabs";
import GlobalConnectPanel from "@/components/filora/GlobalConnectPanel";
import HistoryPanel from "@/components/filora/HistoryPanel";
import LocalConnectPanel from "@/components/filora/LocalConnectPanel";
import SendPanel from "@/components/filora/SendPanel";
import { usePcSessionContext } from "@/features/filora/hooks/usePcSession";
import { para, useThemedStyles, type ThemeColors } from "@/theme";
import { Text } from "@/utils/disableFontScaling";

// Step 1: enter a share link or scan a QR code.
export default function PcConnectPage() {
  const {
    homeTab,
    setHomeTab,
    history,
    connectionMode,
    setConnectionMode,
    shareUrl,
    setShareUrl,
    wifiDetails,
    message,
    localConnectError,
    setLocalConnectError,
    loading,
    clearToast,
    showToast,
    connectWithUrl,
    startScanning,
    handlePasteShareUrl,
    connectToWifiNetwork,
  } = usePcSessionContext();
  const styles = useThemedStyles(createStyles);

  return (
    <>
      {homeTab === "connect" && (
        <ConnectModeTabs
          mode={connectionMode}
          onSelect={(mode) => {
            setConnectionMode(mode);
            setLocalConnectError("");
            clearToast();
          }}
        />
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} >
        {homeTab === "history" ? (
          <HistoryPanel
            entries={history}
            onOpen={(entry) => {
              setConnectionMode(entry.mode);
              setShareUrl(entry.url);
              setLocalConnectError("");
              setHomeTab("connect");
            }}
          />
        ) : homeTab === "send" ? (
          <SendPanel onToast={showToast} />
        ) : connectionMode === "global" ? (
          <GlobalConnectPanel
            shareUrl={shareUrl}
            onShareUrlChange={setShareUrl}
            onPasteUrl={handlePasteShareUrl}
            onConnect={() => connectWithUrl(shareUrl)}
            onScanShare={() => startScanning("share")}
            loading={loading}
          />
        ) : (
          <LocalConnectPanel
            wifiDetails={wifiDetails}
            shareUrl={shareUrl}
            onShareUrlChange={(url) => {
              setShareUrl(url);
              setLocalConnectError("");
            }}
            onPasteUrl={handlePasteShareUrl}
            onScanWifi={() => {
              setLocalConnectError("");
              startScanning("wifi");
            }}
            onScanShare={() => {
              setLocalConnectError("");
              startScanning("share");
            }}
            onConnect={() => connectWithUrl(shareUrl)}
            onConnectToWifi={connectToWifiNetwork}
            connectError={localConnectError}
            loading={loading}
          />
        )}

        {!!message && !loading && (homeTab === "connect" || homeTab === "send") && (
          <View style={[styles.statusBanner, styles.statusBannerWarning]}>
            <Text style={[styles.statusBannerText, styles.statusBannerWarningText]}> {message} </Text>
          </View>
        )}
      </ScrollView>
    </>
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
