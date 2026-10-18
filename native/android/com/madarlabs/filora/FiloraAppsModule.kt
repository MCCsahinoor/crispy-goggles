package com.madarlabs.filora

import android.Manifest
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Installed apps for the phone-to-phone picker: label, icon, APK location and size, plus
 * exporting an app as a single file. Apps shipped as split APKs are zipped into an `.apks`
 * bundle (base + splits, stored uncompressed) so the receiving phone gets something it can install.
 */
class FiloraAppsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "FiloraApps"

  override fun invalidate() {
    executor.shutdownNow()
    super.invalidate()
  }

  @ReactMethod
  fun listInstalledApps(promise: Promise) {
    executor.execute {
      try {
        val context = reactApplicationContext
        val pm = context.packageManager
        val self = context.packageName
        val iconDir = File(context.cacheDir, "app-icons").apply { mkdirs() }
        val packages =
            if (Build.VERSION.SDK_INT >= 33) {
              pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(0L))
            } else {
              @Suppress("DEPRECATION") pm.getInstalledPackages(0)
            }
        val array = Arguments.createArray()
        for (info in packages) {
          val app = info.applicationInfo ?: continue
          if (info.packageName == self) {
            continue
          }
          val system = app.flags and ApplicationInfo.FLAG_SYSTEM != 0
          val updatedSystem = app.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0
          if (system && !updatedSystem) {
            continue
          }
          if (pm.getLaunchIntentForPackage(info.packageName) == null) {
            continue
          }
          val base = File(app.sourceDir ?: continue)
          if (!base.isFile) {
            continue
          }
          val splits = app.splitSourceDirs?.toList() ?: emptyList()
          var size = base.length()
          for (split in splits) {
            size += File(split).length()
          }
          val map = Arguments.createMap()
          map.putString("packageName", info.packageName)
          map.putString("label", pm.getApplicationLabel(app).toString())
          map.putString("versionName", info.versionName ?: "")
          map.putString("apkPath", base.absolutePath)
          map.putInt("splits", splits.size)
          map.putDouble("size", size.toDouble())
          map.putDouble("installedAt", info.firstInstallTime.toDouble())
          map.putDouble("updatedAt", info.lastUpdateTime.toDouble())
          map.putString("iconUri", iconFile(pm, app, info, iconDir)?.let { Uri.fromFile(it).toString() })
          array.pushMap(map)
        }
        promise.resolve(array)
      } catch (error: Exception) {
        promise.reject("apps", error.message, error)
      }
    }
  }

  /**
   * One sendable file for an app: the base APK itself when the app has no splits, otherwise an
   * `.apks` zip of base + splits built in the cache folder (reused until the app updates).
   */
  @ReactMethod
  fun exportApp(packageName: String, promise: Promise) {
    executor.execute {
      try {
        val context = reactApplicationContext
        val pm = context.packageManager
        val info =
            if (Build.VERSION.SDK_INT >= 33) {
              pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0L))
            } else {
              @Suppress("DEPRECATION") pm.getPackageInfo(packageName, 0)
            }
        val app = info.applicationInfo ?: throw IllegalStateException("no application info")
        val base = File(app.sourceDir)
        val splits = app.splitSourceDirs?.map { File(it) }?.filter { it.isFile } ?: emptyList()
        val map = Arguments.createMap()
        if (splits.isEmpty()) {
          map.putString("uri", Uri.fromFile(base).toString())
          map.putDouble("size", base.length().toDouble())
          map.putBoolean("bundle", false)
          promise.resolve(map)
          return@execute
        }
        val outDir = File(context.cacheDir, "apk-bundles").apply { mkdirs() }
        val out = File(outDir, "$packageName.apks")
        val fresh = out.isFile && out.length() > 0 && out.lastModified() >= info.lastUpdateTime
        if (!fresh) {
          val temp = File(outDir, "$packageName.apks.part")
          ZipOutputStream(BufferedOutputStream(FileOutputStream(temp))).use { zip ->
            zip.setLevel(Deflater.NO_COMPRESSION)
            addEntry(zip, base, "base.apk")
            for (split in splits) {
              addEntry(zip, split, split.name)
            }
          }
          if (out.exists()) {
            out.delete()
          }
          if (!temp.renameTo(out)) {
            throw IllegalStateException("could not write bundle")
          }
          out.setLastModified(System.currentTimeMillis())
        }
        map.putString("uri", Uri.fromFile(out).toString())
        map.putDouble("size", out.length().toDouble())
        map.putBoolean("bundle", true)
        promise.resolve(map)
      } catch (error: Exception) {
        promise.reject("apps", error.message, error)
      }
    }
  }

  // ---- APK files on storage ----

  /** Reading other apps' downloads needs "All files access" on Android 11+, READ_EXTERNAL_STORAGE before. */
  @ReactMethod
  fun hasAllFilesAccess(promise: Promise) {
    val granted =
        if (Build.VERSION.SDK_INT >= 30) {
          Environment.isExternalStorageManager()
        } else {
          ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.READ_EXTERNAL_STORAGE) ==
              PackageManager.PERMISSION_GRANTED
        }
    promise.resolve(granted)
  }

  /**
   * Opens the system "All files access" page for this app (Android 11+). Resolves `false` on older
   * versions, where the caller asks for the runtime storage permission instead.
   */
  @ReactMethod
  fun requestAllFilesAccess(promise: Promise) {
    if (Build.VERSION.SDK_INT < 30) {
      promise.resolve(false)
      return
    }
    val context = reactApplicationContext
    val intents =
        listOf(
            Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${context.packageName}")),
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION),
        )
    for (intent in intents) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        promise.resolve(true)
        return
      } catch (_: Exception) {
        // Try the next form of the settings screen.
      }
    }
    promise.reject("apps", "settings")
  }

  /** Every .apk / .apks / .xapk on internal storage and any SD card, with the app name and icon when readable. */
  @ReactMethod
  fun scanApkFiles(promise: Promise) {
    executor.execute {
      try {
        val context = reactApplicationContext
        val pm = context.packageManager
        val iconDir = File(context.cacheDir, "apk-icons").apply { mkdirs() }
        val found = ArrayList<File>()
        val visited = HashSet<String>()
        for (root in storageRoots()) {
          walk(root, 0, visited, found)
          if (found.size >= MAX_APK_FILES) {
            break
          }
        }
        found.sortByDescending { it.lastModified() }
        val array = Arguments.createArray()
        var parsed = 0
        for (file in found) {
          val map = Arguments.createMap()
          map.putString("path", file.absolutePath)
          map.putString("name", file.name)
          map.putDouble("size", file.length().toDouble())
          map.putDouble("modifiedAt", file.lastModified().toDouble())
          if (parsed < MAX_PARSED_APKS && file.name.endsWith(".apk", ignoreCase = true)) {
            parsed += 1
            describeApk(pm, file, iconDir, map)
          }
          array.pushMap(map)
        }
        promise.resolve(array)
      } catch (error: Exception) {
        promise.reject("apps", error.message, error)
      }
    }
  }

  private fun storageRoots(): List<File> {
    val roots = ArrayList<File>()
    val seen = HashSet<String>()
    fun add(dir: File?) {
      if (dir == null || !dir.isDirectory) {
        return
      }
      val key = try { dir.canonicalPath } catch (_: Exception) { dir.absolutePath }
      if (seen.add(key)) {
        roots.add(dir)
      }
    }
    @Suppress("DEPRECATION") add(Environment.getExternalStorageDirectory())
    // Secondary volumes (SD cards) show up as <volume>/Android/data/<package>/files.
    for (dir in reactApplicationContext.getExternalFilesDirs(null)) {
      var cursor: File? = dir
      while (cursor != null && cursor.name != "Android") {
        cursor = cursor.parentFile
      }
      add(cursor?.parentFile)
    }
    return roots
  }

  private fun walk(dir: File, depth: Int, visited: HashSet<String>, found: ArrayList<File>) {
    if (depth > MAX_SCAN_DEPTH || found.size >= MAX_APK_FILES) {
      return
    }
    val key = try { dir.canonicalPath } catch (_: Exception) { return }
    if (!visited.add(key)) {
      return
    }
    val children = dir.listFiles() ?: return
    for (child in children) {
      if (found.size >= MAX_APK_FILES) {
        return
      }
      val name = child.name
      if (name.startsWith(".")) {
        continue
      }
      if (child.isDirectory) {
        // App-private folders are not readable; skipping them also keeps the scan quick.
        if (depth == 1 && dir.name == "Android" && (name == "data" || name == "obb")) {
          continue
        }
        walk(child, depth + 1, visited, found)
      } else if (child.isFile && APK_EXTENSIONS.any { name.endsWith(it, ignoreCase = true) }) {
        found.add(child)
      }
    }
  }

  private fun describeApk(pm: PackageManager, file: File, iconDir: File, map: com.facebook.react.bridge.WritableMap) {
    try {
      val info =
          if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageArchiveInfo(file.absolutePath, PackageManager.PackageInfoFlags.of(0L))
          } else {
            @Suppress("DEPRECATION") pm.getPackageArchiveInfo(file.absolutePath, 0)
          } ?: return
      val app = info.applicationInfo ?: return
      app.sourceDir = file.absolutePath
      app.publicSourceDir = file.absolutePath
      map.putString("packageName", info.packageName)
      map.putString("versionName", info.versionName ?: "")
      map.putString("label", pm.getApplicationLabel(app).toString())
      val iconFile = File(iconDir, "${file.absolutePath.hashCode().toUInt()}-${file.lastModified()}.png")
      if (!(iconFile.isFile && iconFile.length() > 0)) {
        renderIcon(pm.getApplicationIcon(app), iconFile)
      }
      if (iconFile.isFile) {
        map.putString("iconUri", Uri.fromFile(iconFile).toString())
      }
    } catch (_: Exception) {
      // Not a readable APK; the row keeps the plain file name.
    }
  }

  private fun renderIcon(drawable: Drawable, file: File) {
    val size = 144
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(canvas)
    FileOutputStream(file).use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 90, stream) }
    bitmap.recycle()
  }

  private fun addEntry(zip: ZipOutputStream, file: File, name: String) {
    zip.putNextEntry(ZipEntry(name).apply { time = file.lastModified() })
    BufferedInputStream(FileInputStream(file)).use { input ->
      val buffer = ByteArray(256 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) {
          break
        }
        zip.write(buffer, 0, read)
      }
    }
    zip.closeEntry()
  }

  private fun iconFile(pm: PackageManager, app: ApplicationInfo, info: PackageInfo, dir: File): File? {
    val file = File(dir, "${info.packageName}.png")
    if (file.isFile && file.length() > 0 && file.lastModified() >= info.lastUpdateTime) {
      return file
    }
    return try {
      renderIcon(pm.getApplicationIcon(app), file)
      file.setLastModified(System.currentTimeMillis())
      file
    } catch (_: Exception) {
      null
    }
  }

  companion object {
    private val APK_EXTENSIONS = listOf(".apk", ".apks", ".xapk")
    private const val MAX_APK_FILES = 500
    private const val MAX_PARSED_APKS = 200
    private const val MAX_SCAN_DEPTH = 14
  }
}
