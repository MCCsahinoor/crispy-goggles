import { useEffect } from "react";
import mobileAds from "react-native-google-mobile-ads";

export function useMobileAds() {
  useEffect(() => {
    let cancelled = false;
    mobileAds()
      .setRequestConfiguration({
        testDeviceIdentifiers: __DEV__ ? ["EMULATOR"] : [],
      })
      .then(() => {
        if (cancelled) {
          return;
        }
        return mobileAds().initialize();
      })
      .catch(() => {
        // Ads stay hidden if the SDK cannot start.
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
