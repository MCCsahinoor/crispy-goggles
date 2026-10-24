const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require("expo/config-plugins");

/**
 * Keeps the Filora native modules (hotspot, Wi-Fi Direct, nearby discovery, installed apps) in git.
 * `/android` is generated and ignored, so the Kotlin sources live in `native/android` and are
 * copied in on every `expo prebuild`, then registered in MainApplication.
 */
const SOURCE_DIR = path.join("native", "android", "com", "axuasbiz", "filoraShare");
const FILES = ["FiloraNetworkModule.kt", "FiloraAppsModule.kt", "FiloraNetworkPackage.kt"];
const REGISTRATION = "add(FiloraNetworkPackage())";

function withFiloraNetworkSources(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const packagePath = (config.android?.package ?? "com.axuasbiz.filoraShare").split(".");
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...packagePath,
      );
      fs.mkdirSync(target, { recursive: true });
      for (const file of FILES) {
        fs.copyFileSync(path.join(projectRoot, SOURCE_DIR, file), path.join(target, file));
      }
      return mod;
    },
  ]);
}

function withFiloraNetworkPackage(config) {
  return withMainApplication(config, (mod) => {
    const contents = mod.modResults.contents;
    if (contents.includes(REGISTRATION)) {
      return mod;
    }
    const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
    if (!anchor.test(contents)) {
      throw new Error("withFiloraNetwork: could not find PackageList(this).packages.apply { in MainApplication");
    }
    mod.modResults.contents = contents.replace(anchor, (match) => `${match}\n          ${REGISTRATION}`);
    return mod;
  });
}

/**
 * The APK scan reads other apps' downloads. Android 11+ uses the "All files access" permission
 * (declared in app.json); Android 10 needs legacy storage, which this attribute turns on.
 */
function withLegacyStorageOnAndroid10(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$["android:requestLegacyExternalStorage"] = "true";
    return mod;
  });
}

module.exports = function withFiloraNetwork(config) {
  config = withFiloraNetworkSources(config);
  config = withFiloraNetworkPackage(config);
  config = withLegacyStorageOnAndroid10(config);
  return config;
};
