const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * Invalidate Metro's on-disk file map when Node or Metro versions change.
 * Prevents: "Unable to deserialize cloned data due to invalid or unsupported version."
 */
config.cacheVersion = "filora-v2";

module.exports = config;
