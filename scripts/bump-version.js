const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid semver in app.json: ${version}`);
  }

  parts[2] += 1;
  return parts.join(".");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function updateBuildGradle(filePath, versionCode, versionName) {
  let contents = fs.readFileSync(filePath, "utf8");
  contents = contents.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  contents = contents.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  fs.writeFileSync(filePath, contents);
}

const appJsonPath = path.join(root, "app.json");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const buildGradlePath = path.join(root, "android", "app", "build.gradle");

const appJson = readJson(appJsonPath);
const currentVersion = appJson.expo.version;
const currentVersionCode = appJson.expo.android?.versionCode ?? 1;

const newVersion = bumpPatch(currentVersion);
const newVersionCode = currentVersionCode + 1;

appJson.expo.version = newVersion;
appJson.expo.android.versionCode = newVersionCode;
writeJson(appJsonPath, appJson);

const packageJson = readJson(packageJsonPath);
packageJson.version = newVersion;
writeJson(packageJsonPath, packageJson);

if (fs.existsSync(packageLockPath)) {
  const packageLock = readJson(packageLockPath);
  packageLock.version = newVersion;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = newVersion;
  }
  writeJson(packageLockPath, packageLock);
}

if (fs.existsSync(buildGradlePath)) {
  updateBuildGradle(buildGradlePath, newVersionCode, newVersion);
} else {
  console.warn("android/app/build.gradle not found. Run prebuild before building the AAB.");
}

console.log("");
console.log("Version bumped for release:");
console.log(`  versionName: ${currentVersion} -> ${newVersion}`);
console.log(`  versionCode: ${currentVersionCode} -> ${newVersionCode}`);
console.log("");
