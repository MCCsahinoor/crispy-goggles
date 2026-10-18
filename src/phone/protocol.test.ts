import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransition,
  createPairingPayload,
  directNetworkName,
  encodePairingQr,
  fileNameWithSuffix,
  isPairingFresh,
  parseDirectNetworkName,
  parsePairingCode,
  parsePairingQr,
  parseTransferRequest,
  pairingCode,
  sanitizeEmoji,
  sanitizeFileName,
  SessionTracker,
  tokensMatch,
} from "./protocol.ts";

test("a sender's emoji rides along with the transfer request, junk does not", () => {
  const base = { v: 1, senderName: "SunnyFox", files: [{ id: "file_001", name: "a.txt", size: 1 }] };
  assert.equal(parseTransferRequest({ ...base, senderEmoji: "🦊" })?.senderEmoji, "🦊");
  assert.equal(parseTransferRequest({ ...base, senderEmoji: "🏔️" })?.senderEmoji, "🏔️");
  assert.equal(parseTransferRequest(base)?.senderEmoji, undefined);
  assert.equal(parseTransferRequest({ ...base, senderEmoji: "🦊🦊🦊🦊🦊🦊🦊🦊" })?.senderEmoji, undefined);
  assert.equal(sanitizeEmoji("a\u0000b"), undefined);
  assert.equal(sanitizeEmoji("  "), undefined);
  assert.equal(sanitizeEmoji(42), undefined);
});

test("direct group names fit Android's DIRECT-xy rule and round-trip", () => {
  const ssid = directNetworkName("moto edge 60 pro (Alice's)", "1a2b");
  assert.equal(ssid, "DIRECT-FL-motoedge60proAlic-1a2b");
  assert.ok(ssid.length <= 32);
  assert.match(ssid, /^DIRECT-[a-zA-Z0-9]{2}.*/);
  assert.deepEqual(parseDirectNetworkName(`"${ssid}"`), { ssid, name: "motoedge60proAlic", linkId: "1a2b" });
  assert.equal(directNetworkName("   ", "ffff"), "DIRECT-FL-Phone-ffff");
  assert.equal(parseDirectNetworkName("DIRECT-ab-Android_1234"), null);
  assert.equal(parseDirectNetworkName("DIRECT-FL-Phone-12345"), null);
  assert.equal(parseDirectNetworkName("mccap"), null);
});

test("session moves through the send and receive path", () => {
  const session = new SessionTracker();
  session.move("preparing");
  session.move("advertising");
  session.move("authenticating");
  session.move("waiting-approval");
  session.move("ready");
  session.move("transferring");
  session.move("verifying");
  session.move("completed");
  session.move("closing");
  session.move("idle");
  assert.equal(session.phase, "idle");
});

test("cancel and repeated cancel stay valid while a session is open", () => {
  assert.equal(canTransition("transferring", "cancelled"), true);
  assert.equal(canTransition("cancelled", "cancelled"), true);
  assert.equal(canTransition("completed", "transferring"), false);
  assert.equal(canTransition("idle", "transferring"), false);
});

test("pairing qr round-trips and rejects a bad token", () => {
  const payload = createPairingPayload("192.168.1.20", 43821, 1_700_000_000_000);
  const parsed = parsePairingQr(encodePairingQr(payload));
  assert.deepEqual(parsed, payload);
  assert.equal(parsePairingQr('{"v":1,"sid":"nope"}'), null);
  assert.equal(tokensMatch(payload.token, payload.token), true);
  // Flip the last character to one it is guaranteed not to be already.
  const flipped = payload.token.endsWith("0") ? "1" : "0";
  assert.equal(tokensMatch(payload.token, `${payload.token.slice(0, -1)}${flipped}`), false);
});

test("pairing qr keeps hotspot and wi-fi direct fields", () => {
  const payload = createPairingPayload("192.168.43.1", 43821, 1_700_000_000_000);
  const hotspot = parsePairingQr(encodePairingQr({
    ...payload,
    transport: "hotspot",
    ssid: "AndroidShare_1234",
    password: "correct horse",
  }));
  assert.equal(hotspot?.transport, "hotspot");
  assert.equal(hotspot?.ssid, "AndroidShare_1234");
  assert.equal(hotspot?.password, "correct horse");
  const direct = parsePairingQr(encodePairingQr({
    ...payload,
    transport: "direct",
    deviceAddress: "AA:BB:CC:DD:EE:FF",
    password: "short",
  }));
  assert.equal(direct?.transport, "direct");
  assert.equal(direct?.deviceAddress, "aa:bb:cc:dd:ee:ff");
  assert.equal(direct?.password, undefined);
});

test("manual pairing code includes session, token, and expiry", () => {
  const payload = createPairingPayload("10.0.0.8", 43822, 1_700_000_000_000);
  const parsed = parsePairingCode(pairingCode(payload), "10.0.0.9", 43822);
  assert.ok(parsed);
  assert.equal(parsed?.sid, payload.sid);
  assert.equal(parsed?.token, payload.token);
  assert.equal(parsed?.host, "10.0.0.9");
  assert.equal(isPairingFresh(payload, payload.exp * 1000 - 1000), true);
  assert.equal(isPairingFresh(payload, payload.exp * 1000 + 1000), false);
});

test("file names lose paths and traversal", () => {
  assert.equal(sanitizeFileName("..\\..\\secret.txt"), "secret.txt");
  assert.equal(sanitizeFileName("   "), "file");
  assert.equal(sanitizeFileName("a/b:c?.jpg"), "b_c_.jpg");
  assert.equal(fileNameWithSuffix("photo.jpg", 2), "photo (2).jpg");
});

test("transfer requests reject oversized or unnamed batches", () => {
  assert.equal(parseTransferRequest({ v: 1, senderName: "A", files: [] }), null);
  const parsed = parseTransferRequest({
    v: 1,
    senderName: "../PC",
    files: [
      { id: "file_001", name: "../notes.txt", size: 4, md5: "d41d8cd98f00b204e9800998ecf8427e" },
    ],
  });
  assert.equal(parsed?.senderName, "PC");
  assert.equal(parsed?.files[0]?.name, "notes.txt");
  assert.equal(parsed?.files[0]?.md5, "d41d8cd98f00b204e9800998ecf8427e");
});
