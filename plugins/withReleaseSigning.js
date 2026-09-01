const { withAppBuildGradle } = require("expo/config-plugins");

const KEYSTORE_LOAD = `
def keystorePropertiesFile = rootProject.file("../credentials/keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_SIGNING = `
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile rootProject.file("../" + keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }`;

const RELEASE_BUILD_SIGNING =
  "signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes("keystorePropertiesFile")) {
      contents = contents.replace(
        /(def jscFlavor = 'io\.github\.react-native-community:jsc-android:[^']+'\r?\n)/,
        `$1${KEYSTORE_LOAD}`,
      );
    }

    if (!contents.includes("storeFile rootProject.file(\"../\" + keystoreProperties['storeFile'])")) {
      contents = contents.replace(
        /signingConfigs \{\r?\n        debug \{/,
        `signingConfigs {${RELEASE_SIGNING}\r\n        debug {`,
      );
    }

    const buildTypesStart = contents.indexOf("buildTypes {");
    if (buildTypesStart !== -1) {
      const buildTypesEnd = contents.indexOf("\n    packagingOptions", buildTypesStart);
      const buildTypesBlock =
        buildTypesEnd === -1
          ? contents.slice(buildTypesStart)
          : contents.slice(buildTypesStart, buildTypesEnd);

      let nextBlock = buildTypesBlock;
      nextBlock = nextBlock.replace(
        /(debug \{\r?\n\s+)signingConfig [^\r\n]+/,
        "$1signingConfig signingConfigs.debug",
      );
      nextBlock = nextBlock.replace(
        /(release \{[\s\S]*?\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\r?\n\s+)signingConfig signingConfigs\.debug/,
        `$1${RELEASE_BUILD_SIGNING}`,
      );

      if (nextBlock !== buildTypesBlock) {
        contents =
          contents.slice(0, buildTypesStart) +
          nextBlock +
          (buildTypesEnd === -1 ? "" : contents.slice(buildTypesEnd));
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
