const { withAndroidManifest, withAndroidStyles, AndroidConfig } = require("expo/config-plugins");

/**
 * Play Console recommendations:
 *  - "deprecated APIs or parameters for edge-to-edge": android:statusBarColor and
 *    android:navigationBarColor in the theme are deprecated on Android 15+ (the bars are always
 *    transparent when edge-to-edge is enforced), so they are removed from AppTheme.
 *  - "Remove resizability and orientation restrictions": drops android:screenOrientation from the
 *    activity and declares the app resizable so tablets, foldables and desktop windows can resize it.
 */
const DEPRECATED_THEME_ITEMS = new Set(["android:statusBarColor", "android:navigationBarColor"]);

function withEdgeToEdgeTheme(config) {
  return withAndroidStyles(config, (mod) => {
    for (const style of mod.modResults.resources.style ?? []) {
      if (style.$?.name !== "AppTheme" || !style.item) {
        continue;
      }
      style.item = style.item.filter((item) => !DEPRECATED_THEME_ITEMS.has(item.$?.name));
    }
    return mod;
  });
}

function withResizableActivity(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$["android:resizeableActivity"] = "true";
    for (const activity of application.activity ?? []) {
      if (activity.$?.["android:name"]?.includes("MainActivity")) {
        delete activity.$["android:screenOrientation"];
      }
    }
    return mod;
  });
}

module.exports = function withEdgeToEdgeAndResizable(config) {
  config = withEdgeToEdgeTheme(config);
  config = withResizableActivity(config);
  return config;
};
