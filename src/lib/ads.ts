import { TestIds } from "react-native-google-mobile-ads";

export const ADMOB_IDS = {
  BANNER_TEST: TestIds.ADAPTIVE_BANNER,
  BANNER_PROD: "ca-app-pub-1175856783542792/3087037144",
};

export function getBannerUnitId(): string {
  const unitId = __DEV__ ? ADMOB_IDS.BANNER_TEST : ADMOB_IDS.BANNER_PROD;
  return unitId.trim();
}
