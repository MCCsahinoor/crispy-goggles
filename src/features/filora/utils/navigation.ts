import { router } from "expo-router";

import { ROUTES } from "../../../constants";

export const openSettings = () => router.push(ROUTES.settings);

export const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(ROUTES.entry);
  }
};
