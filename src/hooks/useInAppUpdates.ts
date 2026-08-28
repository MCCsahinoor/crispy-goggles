import { useEffect } from "react";

import { checkOnAppLaunch } from "../lib/inAppUpdates";

export function useInAppUpdates() {
  useEffect(() => {
    checkOnAppLaunch();
  }, []);
}
