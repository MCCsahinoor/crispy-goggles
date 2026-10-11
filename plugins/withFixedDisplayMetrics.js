const {
  withAndroidManifest,
  withMainActivity,
  withMainApplication,
} = require("expo/config-plugins");
const { addImports } = require("@expo/config-plugins/build/android/codeMod");

const MARKER = "BEGIN withFixedDisplayMetrics";

const SHARED_IMPORTS = [
  "android.content.Context",
  "android.content.res.Configuration",
  "android.content.res.Resources",
  "android.os.Build",
  "android.util.DisplayMetrics",
  "android.view.WindowManager",
];

const METRICS_HOLDER_IMPORT = "com.facebook.react.uimanager.DisplayMetricsHolder";

/**
 * Locks Android "Display size" for the app:
 *  - Context/Resources report the device's stable density (DENSITY_DEVICE_STABLE).
 *  - React Native's DisplayMetricsHolder (used for every dp<->px conversion, including Fabric's
 *    point scale factor) is forced to the same density. RN fills its *screen* metrics from
 *    Display.getRealMetrics(), which ignores Context overrides, so without this JS lays out
 *    at one density while native renders at another and the UI overflows.
 * System font size (fontScale) is intentionally left untouched.
 */
const ACTIVITY_METHODS = `
  // BEGIN withFixedDisplayMetrics
  private var fixedResources: Resources? = null
  private var fixedResourcesKey: Int = 0

  override fun attachBaseContext(newBase: Context) {
    super.attachBaseContext(applyFixedDisplayMetrics(newBase))
  }

  override fun applyOverrideConfiguration(overrideConfiguration: Configuration?) {
    if (overrideConfiguration != null) {
      applyFixedDisplaySize(overrideConfiguration)
      applyStableScreenDp(this, overrideConfiguration)
    }
    super.applyOverrideConfiguration(overrideConfiguration)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    applyFixedDisplaySize(newConfig)
    applyStableScreenDp(this, newConfig)
    fixedResources = null
    super.onConfigurationChanged(newConfig)
    lockReactDisplayMetrics()
    window?.decorView?.requestLayout()
  }

  override fun onResume() {
    super.onResume()
    lockReactDisplayMetrics()
  }

  override fun getResources(): Resources {
    val base = super.getResources()
    val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
    if (stableDpi <= 0 || base.configuration.densityDpi == stableDpi) {
      return base
    }
    val key = base.configuration.hashCode()
    val cached = fixedResources
    if (cached != null && fixedResourcesKey == key) {
      return cached
    }
    return try {
      val configuration = Configuration(base.configuration)
      applyFixedDisplaySize(configuration)
      applyStableScreenDp(this, configuration)
      val fixed = createConfigurationContext(configuration).resources
      fixedResources = fixed
      fixedResourcesKey = key
      fixed
    } catch (_: Throwable) {
      base
    }
  }

  /** Re-initialises React Native's display metrics and pins both to the stable density. */
  @Suppress("DEPRECATION")
  private fun lockReactDisplayMetrics() {
    try {
      DisplayMetricsHolder.initDisplayMetrics(this)
      val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
      if (stableDpi <= 0) {
        return
      }
      val density = stableDpi / 160f
      val fontScale = resources.configuration.fontScale

      val screen = DisplayMetrics()
      screen.setTo(DisplayMetricsHolder.getScreenDisplayMetrics())
      screen.densityDpi = stableDpi
      screen.density = density
      screen.scaledDensity = density * fontScale
      DisplayMetricsHolder.setScreenDisplayMetrics(screen)

      val windowMetrics = DisplayMetrics()
      windowMetrics.setTo(DisplayMetricsHolder.getWindowDisplayMetrics())
      windowMetrics.densityDpi = stableDpi
      windowMetrics.density = density
      windowMetrics.scaledDensity = density * fontScale
      DisplayMetricsHolder.setWindowDisplayMetrics(windowMetrics)
    } catch (_: Throwable) {
      // React Native not ready yet; onResume will retry.
    }
  }

  private fun applyFixedDisplayMetrics(context: Context): Context {
    return try {
      val configuration = Configuration(context.resources.configuration)
      applyFixedDisplaySize(configuration)
      applyStableScreenDp(context, configuration)
      context.createConfigurationContext(configuration)
    } catch (_: Throwable) {
      context
    }
  }

  private fun applyFixedDisplaySize(configuration: Configuration) {
    val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
    if (stableDpi > 0) {
      configuration.densityDpi = stableDpi
    }
  }

  private fun applyStableScreenDp(context: Context, configuration: Configuration) {
    try {
      val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val widthPx: Int
      val heightPx: Int
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val bounds = wm.maximumWindowMetrics.bounds
        widthPx = bounds.width()
        heightPx = bounds.height()
      } else {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        widthPx = metrics.widthPixels
        heightPx = metrics.heightPixels
      }
      val dpi = configuration.densityDpi
      if (dpi <= 0) {
        return
      }
      val density = dpi / 160f
      configuration.screenWidthDp = (widthPx / density).toInt()
      configuration.screenHeightDp = (heightPx / density).toInt()
      configuration.smallestScreenWidthDp =
        minOf(configuration.screenWidthDp, configuration.screenHeightDp)
    } catch (_: Throwable) {
      // keep existing configuration
    }
  }
  // END withFixedDisplayMetrics
`;

const APPLICATION_METHODS = `
  // BEGIN withFixedDisplayMetrics
  private var fixedResources: Resources? = null
  private var fixedResourcesKey: Int = 0

  override fun attachBaseContext(base: Context) {
    super.attachBaseContext(applyFixedDisplayMetrics(base))
  }

  override fun getResources(): Resources {
    val base = super.getResources()
    val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
    if (stableDpi <= 0 || base.configuration.densityDpi == stableDpi) {
      return base
    }
    val key = base.configuration.hashCode()
    val cached = fixedResources
    if (cached != null && fixedResourcesKey == key) {
      return cached
    }
    return try {
      val configuration = Configuration(base.configuration)
      applyFixedDisplaySize(configuration)
      applyStableScreenDp(this, configuration)
      val fixed = createConfigurationContext(configuration).resources
      fixedResources = fixed
      fixedResourcesKey = key
      fixed
    } catch (_: Throwable) {
      base
    }
  }

  private fun applyFixedDisplayMetrics(context: Context): Context {
    return try {
      val configuration = Configuration(context.resources.configuration)
      applyFixedDisplaySize(configuration)
      applyStableScreenDp(context, configuration)
      context.createConfigurationContext(configuration)
    } catch (_: Throwable) {
      context
    }
  }

  private fun applyFixedDisplaySize(configuration: Configuration) {
    val stableDpi = DisplayMetrics.DENSITY_DEVICE_STABLE
    if (stableDpi > 0) {
      configuration.densityDpi = stableDpi
    }
  }

  private fun applyStableScreenDp(context: Context, configuration: Configuration) {
    try {
      val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val widthPx: Int
      val heightPx: Int
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val bounds = wm.maximumWindowMetrics.bounds
        widthPx = bounds.width()
        heightPx = bounds.height()
      } else {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        widthPx = metrics.widthPixels
        heightPx = metrics.heightPixels
      }
      val dpi = configuration.densityDpi
      if (dpi <= 0) {
        return
      }
      val density = dpi / 160f
      configuration.screenWidthDp = (widthPx / density).toInt()
      configuration.screenHeightDp = (heightPx / density).toInt()
      configuration.smallestScreenWidthDp =
        minOf(configuration.screenWidthDp, configuration.screenHeightDp)
    } catch (_: Throwable) {
      // keep existing configuration
    }
  }
  // END withFixedDisplayMetrics
`;

function stripInjectedBlock(src) {
  src = src.replace(
    /\n  \/\/ BEGIN withFixedDisplayMetrics[\s\S]*?\/\/ END withFixedDisplayMetrics\n/g,
    "\n",
  );
  for (const imp of [...SHARED_IMPORTS, METRICS_HOLDER_IMPORT]) {
    const escaped = imp.replace(/\./g, "\\.");
    src = src.replace(new RegExp(`\\r?\\nimport ${escaped}\\r?\\n`, "g"), "\n");
  }
  src = src.replace(
    /\r?\n\s*(?:DisplayMetricsHolder\.initDisplayMetrics\(this\)|lockReactDisplayMetrics\(\))\r?\n/g,
    "\n",
  );
  return src;
}

function injectDisplayMetricsInit(src) {
  if (src.includes("lockReactDisplayMetrics()")) {
    return src;
  }
  const replaced = src.replace(
    /(super\.onCreate\([^)]*\))/,
    "$1\n    lockReactDisplayMetrics()",
  );
  return replaced === src ? src : replaced;
}

function patchMainActivity(src) {
  src = stripInjectedBlock(src);
  if (src.includes(MARKER)) {
    return src;
  }
  src = addImports(src, [...SHARED_IMPORTS, METRICS_HOLDER_IMPORT], false);
  src = injectDisplayMetricsInit(src);
  const close = src.lastIndexOf("}");
  if (close === -1) {
    return src;
  }
  return `${src.slice(0, close)}${ACTIVITY_METHODS}\n${src.slice(close)}`;
}

function patchMainApplication(src) {
  src = stripInjectedBlock(src);
  if (src.includes(MARKER)) {
    return src;
  }
  src = addImports(src, SHARED_IMPORTS, false);
  const close = src.lastIndexOf("}");
  if (close === -1) {
    return src;
  }
  return `${src.slice(0, close)}${APPLICATION_METHODS}\n${src.slice(close)}`;
}

function addDisplaySizeConfigChanges(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application?.activity) {
    return androidManifest;
  }

  for (const activity of application.activity) {
    const name = activity.$?.["android:name"] ?? "";
    if (!name.includes("MainActivity")) {
      continue;
    }
    const current = activity.$["android:configChanges"] ?? "";
    const parts = new Set(current.split("|").filter(Boolean));
    parts.add("density");
    activity.$["android:configChanges"] = [...parts].join("|");
  }

  return androidManifest;
}

module.exports = function withFixedDisplayMetrics(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = addDisplaySizeConfigChanges(mod.modResults);
    return mod;
  });

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
    mod.modResults.contents = patchMainApplication(mod.modResults.contents);
    return mod;
  });

  return config;
};
