const fs = require("fs");
const path = require("path");

const mappingSource = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "build",
  "outputs",
  "mapping",
  "release",
  "mapping.txt",
);

const releasesDir = path.join(__dirname, "..", "releases");
const mappingTarget = path.join(releasesDir, "mapping.txt");

if (!fs.existsSync(mappingSource)) {
  console.warn(
    "No ProGuard mapping file was generated. If minify is disabled, Play Console may still show a deobfuscation warning.",
  );
  process.exit(0);
}

fs.mkdirSync(releasesDir, { recursive: true });
fs.copyFileSync(mappingSource, mappingTarget);

console.log("");
console.log("Release mapping file copied to:");
console.log(`  ${mappingTarget}`);
console.log("");
console.log("Upload this file in Play Console:");
console.log("  Release > App bundle explorer > your version > Downloads > Upload ProGuard mapping file");
console.log("");
