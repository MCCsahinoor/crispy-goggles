import { Stack } from "expo-router";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { FontProvider } from "@/components/common/FontProvider";
import { useInAppUpdates } from "@/hooks/useInAppUpdates";
import { useMobileAds } from "@/hooks/useMobileAds";
import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/theme";

// App-wide side effects that used to live in the single root component.
function AppBootstrap() {
  useInAppUpdates();
  useMobileAds();
  return null;
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <FontProvider>
        <ThemeProvider>
          <SafeAreaProvider
            initialMetrics={
              initialWindowMetrics &&
              initialWindowMetrics.frame.width > 0 &&
              initialWindowMetrics.frame.height > 0
                ? initialWindowMetrics
                : undefined
            }
          >
            <AppBootstrap />
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </ThemeProvider>
      </FontProvider>
    </I18nProvider>
  );
}
