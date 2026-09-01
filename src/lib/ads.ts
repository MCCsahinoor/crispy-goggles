import { TestIds } from "react-native-google-mobile-ads";

export const ADMOB_IDS = {
  BANNER_TEST: TestIds.ADAPTIVE_BANNER,
  BANNER_PROD: "ca-app-pub-1175856783542792/3087037144",
  
  INTERSTITIAL_TEST: TestIds.INTERSTITIAL,
  INTERSTITIAL_PROD: "ca-app-pub-1175856783542792/3935767734",
};

export function getBannerUnitId(): string {
  const unitId = __DEV__ ? ADMOB_IDS.BANNER_TEST : ADMOB_IDS.BANNER_PROD;
  return unitId.trim();
}

export function getInterstitialUnitId(): string {
  const unitId = __DEV__ ? ADMOB_IDS.INTERSTITIAL_TEST : ADMOB_IDS.INTERSTITIAL_PROD;
  return unitId.trim();
}
