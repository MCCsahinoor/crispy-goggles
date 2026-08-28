const { withProjectBuildGradle } = require("expo/config-plugins");

const FLAG = "-Xskip-metadata-version-check";

const BLOCK = `
subprojects { subproject ->
  subproject.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions.freeCompilerArgs.add("${FLAG}")
  }
}
`;

module.exports = function withKotlinMetadataCompat(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(FLAG)) {
      mod.modResults.contents += `\n${BLOCK}\n`;
    }
    return mod;
  });
};
