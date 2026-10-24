import { getRandomValues } from "expo-crypto";

/**
 * React Native has no Web Crypto. Phone-to-phone pairing needs secure random tokens
 * (src/phone/protocol.ts), so expose expo-crypto's native generator as crypto.getRandomValues.
 */
const scope = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!scope.crypto) {
  scope.crypto = { getRandomValues };
} else if (typeof scope.crypto.getRandomValues !== "function") {
  scope.crypto.getRandomValues = getRandomValues;
}
