import "./src/utils/cryptoPolyfill";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 400,
  fade: true,
});

// Expo Router registers the root component; keep this import last.
import "expo-router/entry";
