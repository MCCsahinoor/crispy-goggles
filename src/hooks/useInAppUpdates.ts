import { useEffect } from "react";

import { checkOnAppLaunch } from "../services/updates/inAppUpdates";

export function useInAppUpdates() {
  useEffect(() => {
    checkOnAppLaunch();
  }, []);
}
