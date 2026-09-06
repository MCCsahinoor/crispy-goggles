const { withMainActivity, withMainApplication } = require("expo/config-plugins");
const { addImports } = require("@expo/config-plugins/build/android/codeMod");

const MARKER = "BEGIN withFixedDisplayMetrics";

const ACTIVITY_IMPORTS = [
  "android.content.Context",
  "android.content.res.Configuration",
  "android.util.DisplayMetrics",
];

const ACTIVITY_METHODS = `
  // BEGIN withFixedDisplayMetrics
  override fun attachBaseContext(newBase: Context) {
    super.attachBaseContext(applyFixedDisplayMetrics(newBase))
  }

  override fun applyOverrideConfiguration(overrideConfiguration: Configuration?) {
    if (overrideConfiguration != null) {
      applyFixedConfiguration(overrideConfiguration)
    }
    super.applyOverrideConfiguration(overrideConfiguration)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    applyFixedConfiguration(newConfig)
    super.onConfigurationChanged(newConfig)
  }

  private fun applyFixedDisplayMetrics(context: Context): Context {
    return try {
      val configuration = Configuration(context.resources.configuration)
      val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
      val alreadyFixed =
        configuration.fontScale == 1.0f &&
          (stableDpi <= 0 || configuration.densityDpi == stableDpi)
      if (alreadyFixed) {
        context
      } else {
        applyFixedConfiguration(configuration)
        context.createConfigurationContext(configuration)
      }
    } catch (_: Throwable) {
      context
    }
  }

  private fun applyFixedConfiguration(configuration: Configuration) {
    configuration.fontScale = 1.0f
    val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
    if (stableDpi > 0) {
      configuration.densityDpi = stableDpi
    }
  }
  // END withFixedDisplayMetrics
`;

function stripInjectedBlock(src) {
  src = src.replace(
    /\n  \/\/ BEGIN withFixedDisplayMetrics[\s\S]*?\/\/ END withFixedDisplayMetrics\n/,
    "\n",
  );
  src = src.replace(
    /\n  override fun attachBaseContext\((?:newBase|base): Context\) \{[\s\S]*?private fun applyFixed(?:DisplayMetrics|FontScale)\([^)]*\)[\s\S]*?\n  \}\n(?:\n  private fun applyFixedConfiguration\([^)]*\) \{[\s\S]*?\n  \}\n)?/,
    "\n",
  );
  src = src.replace(/\r?\nimport android\.util\.DisplayMetrics\r?\n/g, "\n");
  return src;
}

function restoreMainApplication(src) {
  src = stripInjectedBlock(src);
  src = src.replace(
    /override fun onConfigurationChanged\(newConfig: Configuration\) \{\s*applyFixedConfiguration\(newConfig\)\s*super\.onConfigurationChanged\(newConfig\)/,
    `override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)`,
  );
  src = src.replace(/\r?\nimport android\.content\.Context\r?\n/g, "\n");
  return src;
}

function patchMainActivity(src) {
  src = stripInjectedBlock(src);
  src = src.replace(/\r?\nimport android\.content\.Context\r?\n/g, "\n");
  src = src.replace(/\r?\nimport android\.content\.res\.Configuration\r?\n/g, "\n");
  if (src.includes(MARKER)) {
    return src;
  }
  src = addImports(src, ACTIVITY_IMPORTS, false);
  const close = src.lastIndexOf("}");
  if (close === -1) {
    return src;
  }
  return `${src.slice(0, close)}${ACTIVITY_METHODS}\n${src.slice(close)}`;
}

module.exports = function withFixedDisplayMetrics(config) {
  config = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error("withFixedDisplayMetrics expected Kotlin MainActivity");
    }
    mod.modResults.contents = patchMainActivity(mod.modResults.contents);
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      throw new Error("withFixedDisplayMetrics expected Kotlin MainApplication");
    }
    mod.modResults.contents = restoreMainApplication(mod.modResults.contents);
    return mod;
  });

  return config;
};
