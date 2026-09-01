import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { AdEventType, InterstitialAd } from "react-native-google-mobile-ads";

import { getInterstitialUnitId } from "../lib/ads";

export function useAppInterstitial() {
  const adRef = useRef<InterstitialAd | null>(null);

  useEffect(() => {
    const unitId = getInterstitialUnitId();
    if (!unitId) {
      return;
    }

    const interstitial = InterstitialAd.createForAdRequest(unitId);
    adRef.current = interstitial;
    interstitial.load();

    return () => {
      adRef.current = null;
    };
  }, []);

  return useCallback(() => {
    return new Promise<void>((resolve) => {
      const interstitial = adRef.current;
      if (!interstitial?.loaded) {
        resolve();
        return;
      }

      let finished = false;
      let sawBackground = false;
      let unsubscribeClosed: (() => void) | undefined;
      let appSub: { remove: () => void } | undefined;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        unsubscribeClosed?.();
        appSub?.remove();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        interstitial.load();
        resolve();
      };

      unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, finish);
      appSub = AppState.addEventListener("change", (state) => {
        if (state === "background" || state === "inactive") {
          sawBackground = true;
          return;
        }
        if (state === "active" && sawBackground) {
          finish();
        }
      });
      timeoutId = setTimeout(finish, 120000);

      interstitial.show().catch(() => finish());
    });
  }, []);
}
