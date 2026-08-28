import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

import { getBannerUnitId } from "../lib/ads";
import { useThemedStyles, type ThemeColors } from "../theme";

export default function AdBanner() {
  const styles = useThemedStyles(createStyles);
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
