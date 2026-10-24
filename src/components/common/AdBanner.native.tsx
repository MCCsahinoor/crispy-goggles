import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

import { getBannerUnitId } from "../../services/ads/ads";
import { useLayout } from "../../utils/responsive";
import { useThemedStyles, type ThemeColors } from "../../theme";

export default function AdBanner() {
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  const [adFailed, setAdFailed] = useState(false);
  const unitId = getBannerUnitId();

  if (adFailed || !unitId) {
    return null;
  }

  return (
    <View style={styles.footer}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        // The SDK measures the device with the system density; pass our (display-size-locked)
        // layout width so the banner never ends up wider than the app.
        width={Math.floor(layout.width)}
        onAdFailedToLoad={() => setAdFailed(true)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    footer: {
      alignItems: "stretch" as const,
      justifyContent: "center" as const,
      alignSelf: "stretch" as const,
      width: "100%" as const,
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: colors.bg,
      overflow: "hidden" as const,
    },
  };
}
