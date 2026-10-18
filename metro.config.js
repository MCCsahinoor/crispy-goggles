const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * Invalidate Metro's on-disk file map when Node or Metro versions change.
 * Prevents: "Unable to deserialize cloned data due to invalid or unsupported version."
 */
config.cacheVersion = "filora-v2";

// CMake writes broken directory names under android/app/.cxx (for example D_\CoDe).
// Metro's Windows watcher crashes with ENOENT if it tries to watch those folders.
config.resolver.blockList.push(/[/\\]\.cxx(?:[/\\]|$)/);

module.exports = config;
