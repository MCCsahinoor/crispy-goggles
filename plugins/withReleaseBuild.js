const { withAppBuildGradle } = require("expo/config-plugins");

const NDK_DEBUG_SYMBOLS = `
            ndk {
                debugSymbolLevel 'SYMBOL_TABLE'
            }`;

module.exports = function withReleaseBuild(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (!contents.includes("debugSymbolLevel")) {
      contents = contents.replace(
        /(release \{[\s\S]*?signingConfig[^\n]+\n)/,
        `$1${NDK_DEBUG_SYMBOLS}\n`,
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
