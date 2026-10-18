import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { t } from "../i18n";
import { Text, TextInput } from "../lib/disableFontScaling";
import { useProfile } from "../lib/profile";
import { useLayout } from "../lib/responsive";
import { advertiseReceiver, discoverNearby, stopAdvertising, type NearbyPeer } from "../phone/discovery";
import FilePicker, { type FilePickerHandle } from "./picker/FilePicker";
import {
  closePhoneLink,
  isWifiOn,
  joinDirectNetwork,
  joinPhoneLink,
  openPhoneLink,
  openWifiSwitch,
  releasePhoneRoute,
  type PhoneLinkMode,
} from "../phone/localLink";
import {
  MAX_FILES,
  encodePairingQr,
  isPairingFresh,
  parsePairingCode,
  parsePairingQr,
  type PairingPayload,
  type TransferRequest,
} from "../phone/protocol";
import { startPhoneReceiver, type ReceiverController } from "../phone/receiverServer";
import { sendFilesToPhone, type OutgoingFile } from "../phone/senderClient";
import { formatBytes } from "../lib/sendToPc";
import { gradients, heading, para, radius, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import { ActionCard, Avatar, Backdrop, CardWave, FileCard, ProgressRing, Radar, SelfBadge, TipCard, TransferPair } from "./PhoneShareUi";
import ProfileSheet from "./ProfileSheet";
import { AppHeader, ConnectButton, HeaderIconButton } from "./ui";

type PhoneShareFlowProps = {
  onBack: () => void;
  /** Opens the shared Settings screen; shown as a gear icon on this flow's header. */
  onOpenSettings?: () => void;
};

type Step = "home" | "send" | "connect" | "receive" | "approval" | "transfer" | "done";
type Role = "send" | "receive";
type FileStatus = "waiting" | "transferring" | "completed" | "failed";

type PhoneFile = OutgoingFile & {
  status: FileStatus;
  transferred: number;
};

type Summary = { ok: number; failed: number };

function phoneName(): string {
  const name = Constants.deviceName?.trim();
  return name ? name.slice(0, 40) : "Filora phone";
}

/** Where a send is headed: a pairing record (QR, code, nearby record) or a scanned Wi-Fi Direct group. */
type SendTarget = { kind: "payload"; payload: PairingPayload } | { kind: "ssid"; ssid: string };

/** Offers the system Wi-Fi switch; shown under the radar whenever the radio is found off. */
function WifiOffButton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => { void openWifiSwitch(); }}
      style={({ pressed }) => [styles.wifiButton, pressed && styles.pressed]}
    >
      <Ionicons name="wifi" size={15} color="#FFFFFF" />
      <Text style={styles.wifiButtonText}>{t("phone.turnOnWifi")}</Text>
    </Pressable>
  );
}

function statusLabel(status: FileStatus, role: Role, awaitingAccept = false): string {
  if (status === "transferring") return role === "send" ? t("phone.statusSending") : t("phone.statusReceiving");
  if (status === "completed") return t("phone.statusDone");
  if (status === "failed") return t("phone.statusFailed");
  return awaitingAccept ? t("phone.awaitingAcceptance") : t("phone.statusWaiting");
}

export default function PhoneShareFlow({ onBack, onOpenSettings }: PhoneShareFlowProps) {
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const layout = useLayout();
  const [step, setStep] = useState<Step>("home");
  const [role, setRole] = useState<Role>("send");
  const [files, setFiles] = useState<PhoneFile[]>([]);
  // What the picker has selected; turned into `files` (with real paths and transfer ids) on Next.
  const [picked, setPicked] = useState<OutgoingFile[]>([]);
  const pickerRef = useRef<FilePickerHandle>(null);
  const [payload, setPayload] = useState<PairingPayload | null>(null);
  const [pairing, setPairing] = useState("");
  const [incoming, setIncoming] = useState<TransferRequest | null>(null);
  const [summary, setSummary] = useState<Summary>({ ok: 0, failed: 0 });
  const [notice, setNotice] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("43821");
  const [manualCode, setManualCode] = useState("");
  const [waitingAccept, setWaitingAccept] = useState(false);
  const [joining, setJoining] = useState(false);
  // Joining a Wi-Fi network makes Android ask on this phone; worth a line under the spinner.
  const [joinHint, setJoinHint] = useState(false);
  const scanLock = useRef(false);
  const receiverRef = useRef<ReceiverController | null>(null);
  const generation = useRef(0);
  // Wi-Fi Direct first: it is the link nearby senders can discover without a QR code.
  const linkMode = useRef<PhoneLinkMode>("direct");
  const abortRef = useRef<AbortController | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [nearby, setNearby] = useState<NearbyPeer[]>([]);
  const [nearbyOff, setNearbyOff] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [linkStarting, setLinkStarting] = useState(false);
  // The Wi-Fi radio is off and the person left it off; the screen offers the switch and retries.
  const [wifiOff, setWifiOff] = useState(false);
  // Bumped to run nearby discovery again, e.g. once Wi-Fi has been switched on.
  const [discoveryRun, setDiscoveryRun] = useState(0);
  const [showManual, setShowManual] = useState(false);
  // The receive screen opens with the connection details showing; the QR code swaps in on demand.
  const [showDetails, setShowDetails] = useState(true);
  const [peerName, setPeerName] = useState("");
  const [peerEmoji, setPeerEmoji] = useState("");
  const discoveryStop = useRef<(() => Promise<void>) | null>(null);
  // The handle and emoji other phones see; falls back to the device model until loaded.
  const { profile, save: saveProfile } = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);
  const me = profile.name || phoneName();

  useEffect(() => {
    return () => {
      generation.current += 1;
      receiverRef.current?.stop();
      abortRef.current?.abort();
      void stopAdvertising();
      void closePhoneLink();
    };
  }, []);

  // Sender: look for receiving phones while the connect step is open.
  useEffect(() => {
    if (step !== "connect") {
      return;
    }
    let cancelled = false;
    setNearby([]);
    setNearbyOff(false);
    setWifiOff(false);
    void discoverNearby((peers) => {
      if (!cancelled) {
        setNearby(peers);
      }
    }).then((session) => {
      if (cancelled) {
        void session.stop();
        return;
      }
      discoveryStop.current = session.stop;
      setWifiOff(Boolean(session.wifiOff));
      setNearbyOff(!session.nsd && !session.p2p && !session.wifi);
    });
    return () => {
      cancelled = true;
      const stop = discoveryStop.current;
      discoveryStop.current = null;
      void stop?.();
    };
  }, [step, discoveryRun]);

  // While Wi-Fi is off, watch the radio (the switch may be flipped in the system panel, the
  // quick-settings shade or Settings) and pick up where we left off as soon as it is on.
  useEffect(() => {
    if (!wifiOff) {
      return;
    }
    let busy = false;
    const timer = setInterval(() => {
      if (busy) {
        return;
      }
      busy = true;
      void isWifiOn()
        .then((on) => {
          if (!on) {
            return;
          }
          clearInterval(timer);
          setWifiOff(false);
          setNotice("");
          if (step === "receive") {
            void startReceive();
          } else if (step === "connect") {
            setDiscoveryRun((run) => run + 1);
          }
        })
        .finally(() => {
          busy = false;
        });
    }, 1500);
    return () => clearInterval(timer);
    // startReceive is recreated each render; the radio check only needs the current step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wifiOff, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  });

  const stopReceiver = () => {
    generation.current += 1;
    receiverRef.current?.stop();
    receiverRef.current = null;
    setDiscoverable(false);
    setLinkStarting(false);
    void stopAdvertising();
    void closePhoneLink();
  };

  const startReceive = async (mode?: PhoneLinkMode) => {
    const nextMode = mode ?? linkMode.current;
    const explicit = mode !== undefined;
    linkMode.current = nextMode;
    const ticket = ++generation.current;
    receiverRef.current?.stop();
    receiverRef.current = null;
    setDiscoverable(false);
    void stopAdvertising();
    setPayload(null);
    setPairing("");
    setShowQr(false);
    setNotice("");
    setWifiOff(false);
    // Shown as a status line under the radar until the link is up or has failed.
    setLinkStarting(true);
    let link;
    try {
      link = await openPhoneLink(nextMode, me);
    } catch (error) {
      if (ticket !== generation.current) {
        return;
      }
      const code = error instanceof Error ? error.message : "";
      if (code === "wifi-off") {
        // Every link needs the radio; no point falling back to a hotspot.
        setLinkStarting(false);
        setWifiOff(true);
        setNotice(t("phone.wifiOff"));
        return;
      }
      if (!explicit && nextMode === "direct" && code !== "permission") {
        // Some phones cannot host a Wi-Fi Direct group; a local hotspot plus QR still works.
        void startReceive("hotspot");
        return;
      }
      setLinkStarting(false);
      setNotice(
        code === "permission"
          ? t("phone.locationRequired")
          : code === "direct"
            ? t("phone.directFailed")
            : code === "no-address" && nextMode === "lan"
              ? t("phone.noAddress")
              : nextMode === "direct"
                ? t("phone.directFailed")
                : nextMode === "lan"
                  ? t("phone.noAddress")
                  : t("phone.hotspotFailed"),
      );
      return;
    }
    if (ticket !== generation.current) {
      await closePhoneLink();
      return;
    }
    const host = link.host;
    try {
      const controller = await startPhoneReceiver(host, {
        onRequest: (request) => {
          if (ticket !== generation.current) return;
          setIncoming(request);
          setFiles(request.files.map((file) => ({
            id: file.id,
            name: file.name,
            uri: "",
            size: file.size,
            mimeType: file.mimeType,
            status: "waiting",
            transferred: 0,
          })));
          setStep("approval");
        },
        onProgress: ({ fileId, transferred }) => {
          if (ticket !== generation.current) return;
          setFiles((current) => current.map((file) => (
            file.id === fileId ? { ...file, transferred, status: "transferring" } : file
          )));
        },
        onFileResult: (result) => {
          if (ticket !== generation.current) return;
          setFiles((current) => current.map((file) => (
            file.id === result.fileId
              ? { ...file, status: result.ok ? "completed" : "failed", transferred: result.ok ? file.size : file.transferred, name: result.savedName ?? file.name }
              : file
          )));
        },
        onComplete: (next) => {
          if (ticket !== generation.current) return;
          setSummary(next);
          setStep("done");
        },
        onError: (code) => {
          if (ticket !== generation.current || code === "cancelled" || code === "listen") {
            return;
          }
          setNotice(t("phone.expired"));
          setStep("receive");
        },
      }, { name: me, emoji: profile.emoji });
      if (ticket !== generation.current) {
        controller.stop();
        await closePhoneLink();
        return;
      }
      receiverRef.current = controller;
      const advertised: PairingPayload = {
        ...controller.payload,
        transport: link.transport,
        ...(link.ssid ? { ssid: link.ssid } : {}),
        ...(link.password ? { password: link.password } : {}),
        ...(link.deviceAddress ? { deviceAddress: link.deviceAddress } : {}),
      };
      setPayload(advertised);
      setPairing(controller.code);
      setLinkStarting(false);
      // Nearby discovery is the main path; the QR stays behind the "Show QR code" button.
      setShowQr(false);
      setNotice("");
      const visible = await advertiseReceiver(advertised, me, link.linkId, profile.emoji);
      if (ticket !== generation.current) {
        return;
      }
      // "Can be seen" only when a phone that has not joined anything yet can find us: the Wi-Fi
      // Direct record or a scannable group name, or mDNS on a network both phones already share.
      // A hotspot's mDNS only reaches phones that have joined it, so it does not count.
      setDiscoverable(visible.p2p || visible.wifi || (link.transport === "lan" && visible.nsd));
    } catch {
      if (ticket === generation.current) {
        setLinkStarting(false);
        setNotice(t("phone.couldNotListen"));
        void closePhoneLink();
      }
    }
  };

  const beginSend = async (target: SendTarget) => {
    if (target.kind === "payload" && !isPairingFresh(target.payload)) {
      setNotice(t("phone.expired"));
      return;
    }
    if (files.length === 0) {
      setNotice(t("phone.noFiles"));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRole("send");
    setJoining(true);
    setJoinHint(target.kind === "ssid" || Boolean(target.payload.ssid && target.payload.password));
    setWaitingAccept(false);
    setNotice("");
    setFiles((current) => current.map((file) => ({ ...file, status: "waiting", transferred: 0 })));
    setStep("transfer");
    try {
      let linked: PairingPayload;
      if (target.kind === "ssid") {
        const joined = await joinDirectNetwork(target.ssid, controller.signal);
        if (joined.name) {
          setPeerName(joined.name);
        }
        if (joined.emoji) {
          setPeerEmoji(joined.emoji);
        }
        linked = joined.payload;
      } else {
        linked = await joinPhoneLink(target.payload, controller.signal);
      }
      if (controller.signal.aborted) {
        return;
      }
      setJoining(false);
      setWaitingAccept(true);
      const result = await sendFilesToPhone(linked, { name: me, emoji: profile.emoji }, files, ({ fileId, transferred, failed }) => {
        // The first progress report means the other phone accepted and bytes are moving.
        setWaitingAccept(false);
        setFiles((current) => current.map((file) => {
          if (file.id !== fileId) {
            return file;
          }
          if (failed) {
            // senderClient reports 0 on failure (it doesn't track the receiver's last byte
            // count for a broken file); keep whatever this file last showed instead of
            // snapping its bar — and the overall ring, which sums every file's bytes — back.
            return { ...file, status: "failed" };
          }
          const done = file.size === 0 ? transferred === 0 : transferred >= file.size;
          return {
            ...file,
            transferred: Math.max(file.transferred, transferred),
            status: done ? "completed" : "transferring",
          };
        }));
      }, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      setFiles((current) => current.map((file) => (
        file.status === "completed" ? file : { ...file, status: file.transferred >= file.size ? "completed" : "failed" }
      )));
      setSummary(result);
      setStep("done");
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const code = error instanceof Error ? error.message : "unreachable";
      const message = code === "rejected"
        ? t("phone.rejected")
        : code === "expired"
          ? t("phone.expired")
          : code === "invalid"
            ? t("phone.invalidCode")
            : code === "permission"
              ? t("phone.locationRequired")
              : code === "wifi-off"
                ? t("phone.wifiOff")
                : code === "join"
                  ? t("phone.joinFailed")
                  : t("phone.unreachable");
      setNotice(message);
      // Back on the connect step, discovery runs again and re-checks the radio itself.
      setStep("connect");
    } finally {
      setJoining(false);
      setWaitingAccept(false);
      void releasePhoneRoute();
    }
  };

  const sendToPeer = async (peer: NearbyPeer) => {
    // Release the P2P radio from service discovery before Wi-Fi Direct tries to connect.
    const stop = discoveryStop.current;
    discoveryStop.current = null;
    await stop?.();
    setPeerName(peer.name);
    setPeerEmoji(peer.emoji ?? "");
    if (peer.payload) {
      await beginSend({ kind: "payload", payload: peer.payload });
    } else if (peer.ssid) {
      await beginSend({ kind: "ssid", ssid: peer.ssid });
    }
  };

  const handleBack = () => {
    if (scanning) {
      setScanning(false);
      return;
    }
    if (step === "home") {
      stopReceiver();
      onBack();
      return;
    }
    if (step === "transfer") {
      Alert.alert(t("phone.cancelTitle"), t("phone.cancelBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("phone.stop"),
          style: "destructive",
          onPress: () => {
            abortRef.current?.abort();
            if (role === "receive") {
              void startReceive();
              setStep("receive");
            } else {
              setStep("connect");
            }
          },
        },
      ]);
      return;
    }
    if (step === "approval") {
      receiverRef.current?.reject();
      setStep("receive");
      return;
    }
    if (step === "send") {
      if (pickerRef.current?.handleBack()) {
        return;
      }
      stopReceiver();
      setStep("home");
      return;
    }
    if (step === "receive" || step === "done") {
      stopReceiver();
      setStep("home");
      return;
    }
    setStep(step === "connect" ? "send" : "home");
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setNotice(t("phone.cameraRequired"));
        return;
      }
    }
    scanLock.current = false;
    setScanning(true);
    setNotice("");
  };

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const transferredBytes = files.reduce((sum, file) => sum + Math.min(file.transferred, file.size), 0);
  const fraction = totalBytes > 0 ? transferredBytes / totalBytes : waitingAccept ? 0 : 0;
  const qrSize = Math.min(220, layout.width - layout.gutter * 2 - 48);
  const radarSize = Math.max(200, Math.min(250, layout.width - layout.gutter * 2 - 40));

  if (scanning) {
    const windowSize = Math.min(260, Math.max(180, layout.width - 96));
    return (
      <View style={styles.scanner}>
        <StatusBar style="light" />
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (scanLock.current) {
              return;
            }
            const parsed = parsePairingQr(data);
            if (!parsed) {
              return;
            }
            scanLock.current = true;
            setScanning(false);
            setPeerName("");
            setPeerEmoji("");
            void beginSend({ kind: "payload", payload: parsed });
          }}
        />
        <View style={styles.scanFrame} pointerEvents="box-none">
          <View style={styles.scanDim} />
          <View style={[styles.scanRow, { height: windowSize }]}>
            <View style={styles.scanDim} />
            <View style={[styles.scanWindow, { width: windowSize, height: windowSize }]}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.scanDim} />
          </View>
          <View style={styles.scanFooter}>
            <Text style={styles.scanTitle}>{t("phone.scanHint")}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setScanning(false)}
              style={({ pressed }) => [styles.scanCancel, pressed && styles.pressed]}
            >
              <Text style={styles.scanCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (step === "send") {
    return (
      <View style={[styles.screen, { paddingHorizontal: layout.gutter, maxWidth: layout.contentMaxWidth }]}>
        <FilePicker
          ref={pickerRef}
          selected={picked}
          onChange={setPicked}
          maxFiles={MAX_FILES}
          onBack={() => {
            stopReceiver();
            setStep("home");
          }}
          onNext={(ready) => {
            setFiles(ready.map((file) => ({ ...file, status: "waiting", transferred: 0 })));
            setNotice("");
            setStep("connect");
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingHorizontal: layout.gutter, maxWidth: layout.contentMaxWidth }]}>
      {step === "home" && (
        <View pointerEvents="none" style={[styles.backdrop, { left: -layout.gutter, right: -layout.gutter }]}>
          <Backdrop tint={colors.blue} accent={colors.purple} />
        </View>
      )}
      <View style={{ marginHorizontal: -layout.gutter, marginBottom: 14 }}>
        <AppHeader
          title="Filora"
          subtitle={
            step === "receive" || step === "approval"
              ? t("phone.headerReceive")
              : step === "connect"
                ? t("phone.headerConnect")
                : step === "transfer"
                  ? role === "send"
                    ? (files.length === 1 ? t("phone.headerSendingOne") : t("phone.headerSending"))
                    : (files.length === 1 ? t("phone.headerReceivingOne") : t("phone.headerReceiving"))
                  : t("launch.phoneTitle")
          }
          onBack={handleBack}
          leftAccessory={
            <Image source={require("../../assets/logo.png")} style={styles.headerLogo} accessibilityLabel="Filora" />
          }
          right={
            <View style={styles.headerRightRow}>
              {step === "receive" && (
                <HeaderIconButton icon="refresh" label={t("phone.refresh")} onPress={() => { void startReceive(); }} />
              )}
              {onOpenSettings && (
                <HeaderIconButton icon="settings-outline" label={t("tab.settings")} onPress={onOpenSettings} />
              )}
            </View>
          }
        />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, step === "home" && styles.scrollContentCenter]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === "home" && (
          <View style={styles.homeStack}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("phone.editProfile")}
              onPress={() => setProfileOpen(true)}
              style={({ pressed }) => [styles.meRow, pressed && styles.pressed]}
            >
              <Avatar name={me} size={44} icon="phone-portrait" emoji={profile.emoji} />
              <View style={styles.fileCopy}>
                <Text style={styles.meLabel} numberOfLines={1}>{t("phone.yourDevice", { name: phoneName() })}</Text>
                <Text style={styles.meName} numberOfLines={1}>@{me}</Text>
              </View>
              <View style={styles.meEdit}>
                <Ionicons name="pencil" size={14} color={colors.blueSoft} />
              </View>
              <CardWave tint={colors.blue} id="profile" height={26} strength={0.5} />
            </Pressable>
            <ProfileSheet
              visible={profileOpen}
              profile={profile}
              onClose={() => setProfileOpen(false)}
              onSave={(next) => {
                setProfileOpen(false);
                void saveProfile(next);
              }}
            />
            <Text style={[styles.prompt, styles.centerText]}>{t("phone.prompt")}</Text>
            <View style={styles.bigRow}>
              <ActionCard
                label={t("phone.sendTitle")}
                caption={t("phone.sendBody")}
                icon="arrow-up"
                gradient={gradients.globe}
                glow="rgba(59,130,246,0.16)"
                tint={colors.blue}
                onPress={() => { setRole("send"); setNotice(""); setStep("send"); }}
              />
              <ActionCard
                label={t("phone.receiveTitle")}
                caption={t("phone.receiveBody")}
                icon="arrow-down"
                gradient={["#A855F7", "#7C3AED"]}
                glow="rgba(168,85,247,0.16)"
                tint={colors.purple}
                onPress={() => { setRole("receive"); setFiles([]); setShowQr(false); setShowDetails(true); setStep("receive"); void startReceive(); }}
              />
            </View>
            <View style={styles.note}>
              <View style={styles.noteIcon}>
                <Ionicons name="wifi" size={18} color={colors.blueSoft} />
              </View>
              <View style={styles.noteCopy}>
                <Text style={styles.noteTitle}>{t("phone.offlineTitle")}</Text>
                <Text style={styles.noteBody}>{t("phone.offlineBody")}</Text>
              </View>
            </View>
            <View style={styles.privacyRow}>
              <View style={styles.privacyIcon}>
                <Ionicons name="shield-checkmark-outline" size={13} color={colors.purpleSoft} />
              </View>
              <Text style={[styles.disclaimer, styles.flexText]}>{t("phone.notEncrypted")}</Text>
            </View>
          </View>
        )}

        {step === "connect" && (
          <View style={styles.stack}>
            <Radar
              size={radarSize}
              tint={colors.blueSoft}
              scanning={!nearbyOff}
              center={<SelfBadge name={me} label={t("phone.you")} tint={colors.blueSoft} emoji={profile.emoji} />}
              peers={nearby.map((peer) => ({
                key: peer.key,
                name: peer.name,
                emoji: peer.emoji,
                caption: peer.source === "nsd" ? t("phone.useLan") : t("phone.useDirect"),
                onPress: () => { void sendToPeer(peer); },
              }))}
            />
            <View style={styles.radarCaption}>
              {nearby.length === 0 && !nearbyOff && <ActivityIndicator size="small" color={colors.blueSoft} />}
              <Text style={[styles.hint, styles.centerText, styles.flexText]}>
                {wifiOff ? t("phone.wifiOff") : nearbyOff ? t("phone.nearbyOff") : nearby.length > 0 ? t("phone.tapToSend") : t("phone.nearbySearching")}
              </Text>
            </View>
            {wifiOff && <WifiOffButton styles={styles} />}
            <Text style={[styles.fileMeta, styles.centerText]}>
              {t("phone.selected", { count: files.length })} · {formatBytes(totalBytes)}
            </Text>
            <View style={styles.pillRow}>
              <Pressable onPress={() => { void openScanner(); }} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
                <Ionicons name="qr-code-outline" size={18} color={colors.blueSoft} />
                <Text style={styles.pillText}>{t("phone.scanQrShort")}</Text>
              </Pressable>
              <Pressable onPress={() => setShowManual((current) => !current)} style={({ pressed }) => [styles.pill, showManual && styles.pillActive, pressed && styles.pressed]}>
                <Ionicons name="keypad-outline" size={18} color={colors.purpleSoft} />
                <Text style={styles.pillText}>{t("phone.manualShort")}</Text>
              </Pressable>
            </View>
            {showManual && (
              <View style={styles.stack}>
                <Text style={styles.section}>{t("phone.manual")}</Text>
                <TextInput value={ip} onChangeText={setIp} placeholder={t("phone.ipPlaceholder")} placeholderTextColor={colors.textDim} autoCapitalize="none" autoCorrect={false} keyboardType="decimal-pad" style={styles.input} />
                <TextInput value={port} onChangeText={setPort} placeholder={t("phone.port")} placeholderTextColor={colors.textDim} keyboardType="number-pad" style={styles.input} />
                <TextInput value={manualCode} onChangeText={setManualCode} placeholder={t("phone.codePlaceholder")} placeholderTextColor={colors.textDim} autoCapitalize="none" autoCorrect={false} style={styles.input} />
              </View>
            )}
          </View>
        )}

        {step === "receive" && (
          <View style={styles.stack}>
            <Radar
              size={Math.min(radarSize, 200)}
              tint={colors.purpleSoft}
              scanning={!!payload}
              center={<SelfBadge name={me} label={me} tint={colors.purpleSoft} emoji={profile.emoji} />}
            />
            <View style={styles.statusRow}>
              {payload ? (
                <Text style={styles.heroTitle}>{t("phone.waiting")}</Text>
              ) : linkStarting ? (
                <>
                  <ActivityIndicator size="small" color={colors.purpleSoft} />
                  <Text style={[styles.heroTitle, styles.flexText]} numberOfLines={1}>
                    {linkMode.current === "hotspot" ? t("phone.hotspotStarting") : linkMode.current === "direct" ? t("phone.directStarting") : t("common.working")}
                  </Text>
                </>
              ) : wifiOff ? (
                <WifiOffButton styles={styles} />
              ) : null}
            </View>
            <View style={styles.chipRow}>
              {(["direct", "hotspot", "lan"] as const).map((mode) => {
                const active = payload?.transport === mode || (!payload && linkMode.current === mode);
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => { void startReceive(mode); }}
                    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
                  >
                    <Ionicons
                      name={mode === "direct" ? "swap-horizontal" : mode === "hotspot" ? "radio-outline" : "wifi"}
                      size={14}
                      color={active ? "#FFFFFF" : colors.textMuted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {mode === "direct" ? t("phone.useDirect") : mode === "hotspot" ? t("phone.hotspotName") : t("phone.useLan")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {(() => {
              // Explain whichever link is selected, whether or not it is up yet.
              const mode = payload?.transport ?? linkMode.current;
              return (
                <View style={styles.modeNote}>
                  <Ionicons
                    name={mode === "direct" ? "swap-horizontal" : mode === "hotspot" ? "radio-outline" : "wifi"}
                    size={16}
                    color={colors.purpleSoft}
                    style={styles.modeNoteIcon}
                  />
                  <Text style={[styles.modeNoteText, styles.flexText]}>
                    {mode === "direct" ? t("phone.modeDirect") : mode === "hotspot" ? t("phone.modeHotspot") : t("phone.modeLan")}
                  </Text>
                </View>
              );
            })()}
            {payload?.transport === "hotspot" && payload.ssid ? (
              <View style={styles.discoverRow}>
                <Ionicons name="radio-outline" size={14} color={colors.success} />
                <Text style={[styles.fileMeta, styles.flexText, { color: colors.success }]}>{t("phone.hotspotOn", { name: payload.ssid })}</Text>
              </View>
            ) : discoverable ? (
              <View style={styles.discoverRow}>
                <Ionicons name="radio-outline" size={14} color={colors.success} />
                <Text style={[styles.fileMeta, styles.flexText, { color: colors.success }]}>{t("phone.discoverable", { name: me })}</Text>
              </View>
            ) : null}
            <View style={styles.pillRow}>
              <Pressable
                disabled={!payload}
                onPress={() => {
                  // One panel at a time: the QR replaces the details, and hiding it brings them back.
                  const next = !showQr;
                  setShowQr(next);
                  setShowDetails(!next);
                }}
                style={({ pressed }) => [styles.pill, showQr && styles.pillActive, !payload && styles.pillDisabled, pressed && styles.pressed]}
              >
                <Ionicons name="qr-code-outline" size={18} color={colors.blueSoft} />
                <Text style={styles.pillText} numberOfLines={1}>{showQr ? t("phone.hideQr") : t("phone.showQr")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowQr(false);
                  setShowDetails((current) => !current);
                }}
                style={({ pressed }) => [styles.pill, showDetails && styles.pillActive, pressed && styles.pressed]}
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.purpleSoft} />
                <Text style={styles.pillText} numberOfLines={1}>{t("phone.details")}</Text>
              </Pressable>
            </View>
            {showQr && payload && (
              <View style={styles.qrWrap}>
                <QRCode value={encodePairingQr(payload)} size={qrSize} color={scheme === "dark" ? "#FFFFFF" : "#101A36"} backgroundColor={scheme === "dark" ? "#12141C" : "#FFFFFF"} />
              </View>
            )}
            {showDetails && (
            <View style={styles.infoCard}>
              <Text style={styles.fileMeta}>{t("phone.deviceName")}</Text>
              <Text style={styles.fileName}>{phoneName()}</Text>
              <Text style={styles.fileMeta}>{t("phone.ip")}</Text>
              <Text style={styles.fileName}>{payload?.host ?? "—"}</Text>
              <Text style={styles.fileMeta}>{t("phone.port")}</Text>
              <Text style={styles.fileName}>{payload?.port ?? "—"}</Text>
              {payload?.ssid ? (
                <>
                  <Text style={styles.fileMeta}>{t("phone.hotspotName")}</Text>
                  <Text selectable style={styles.fileName}>{payload.ssid}</Text>
                  {payload.password ? (
                    <>
                      <Text style={styles.fileMeta}>{t("phone.hotspotPassword")}</Text>
                      <Text selectable style={styles.fileName}>{payload.password}</Text>
                    </>
                  ) : null}
                </>
              ) : null}
              {!!pairing && (
                <>
                  <Text style={styles.fileMeta}>{t("phone.pairingCode")}</Text>
                  <Text selectable style={styles.code}>{pairing}</Text>
                  <Pressable onPress={() => { void Clipboard.setStringAsync(pairing).then(() => setNotice(t("phone.copied"))); }}>
                    <Text style={styles.link}>{t("phone.copy")}</Text>
                  </Pressable>
                </>
              )}
            </View>
            )}
            <Text style={[styles.disclaimer, styles.centerText]}>{t("phone.sameNetwork")}</Text>
          </View>
        )}

        {step === "approval" && incoming && (
          <View style={styles.stack}>
            <View style={styles.approvalHero}>
              <Avatar name={incoming.senderName} size={60} emoji={incoming.senderEmoji} />
              <Text style={styles.fileName}>{incoming.senderName}</Text>
            </View>
            <Text style={styles.heroTitle}>{t("phone.approvalTitle")}</Text>
            <Text style={[styles.hint, styles.centerText]}>
              {t("phone.approvalBody", {
                name: incoming.senderName,
                count: incoming.files.length,
                size: formatBytes(incoming.files.reduce((sum, file) => sum + file.size, 0)),
              })}
            </Text>
            {incoming.files.map((file) => (
              <View key={file.id} style={styles.fileRow}>
                <Ionicons name="document-outline" size={18} color={colors.textMuted} />
                <View style={styles.fileCopy}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileMeta}>{formatBytes(file.size)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {step === "transfer" && (
          <View style={styles.stack}>
            <TransferPair
              from={role === "send" ? me : incoming?.senderName ?? t("phone.otherPhone")}
              fromEmoji={role === "send" ? profile.emoji : incoming?.senderEmoji}
              fromIcon={role === "receive" && !incoming?.senderName ? "phone-portrait" : undefined}
              fromCaption={role === "send" ? t("phone.thisPhone") : t("phone.sendingPhone")}
              to={role === "send" ? peerName || t("phone.otherPhone") : me}
              toEmoji={role === "send" ? peerEmoji || undefined : profile.emoji}
              toIcon={role === "send" && !peerName ? "phone-portrait" : undefined}
              toCaption={role === "send" ? t("phone.receivingPhone") : t("phone.thisPhone")}
              active={!joining && !waitingAccept}
            />
            <ProgressRing
              progress={fraction}
              value={`${Math.round(fraction * 100)}%`}
              label={joining ? t("phone.joiningShort") : waitingAccept ? t("phone.waitingShort") : undefined}
            />
            <Text style={[styles.hint, styles.centerText]}>
              {joining
                ? t("phone.joining")
                : waitingAccept
                  ? (peerName ? t("phone.askAccept", { name: peerName }) : t("phone.askAcceptGeneric"))
                  : files.length === 1
                    ? t("phone.transferOne", { size: formatBytes(totalBytes) })
                    : t("phone.transferCount", { count: files.length, size: formatBytes(totalBytes) })}
            </Text>
            {joining && joinHint && (
              <Text style={[styles.fileMeta, styles.centerText]}>{t("phone.joinHint")}</Text>
            )}
            {files.map((file) => (
              <FileCard
                key={file.id}
                name={file.name}
                size={formatBytes(file.size)}
                mimeType={file.mimeType}
                status={file.status}
                statusLabel={statusLabel(file.status, role, waitingAccept)}
                progress={file.size > 0 ? file.transferred / file.size : file.status === "completed" ? 1 : 0}
              />
            ))}
            <TipCard icon="wifi" text={t("phone.keepNearby")} />
          </View>
        )}

        {step === "done" && (
          <View style={styles.stack}>
            <View style={[styles.heroIcon, summary.failed > 0 && styles.heroWarn]}>
              <Ionicons name={summary.failed > 0 ? "alert-circle-outline" : "checkmark-circle-outline"} size={36} color={summary.failed > 0 ? colors.warning : colors.success} />
            </View>
            <Text style={styles.heroTitle}>{summary.failed > 0 ? t("phone.partialTitle") : t("phone.doneTitle")}</Text>
            <Text style={styles.hint}>
              {summary.failed > 0
                ? t("phone.partial", { ok: summary.ok, failed: summary.failed })
                : role === "receive"
                  ? t("phone.doneSaved", { count: summary.ok })
                  : t("phone.doneSent", { count: summary.ok })}
            </Text>
            {role === "receive" && summary.ok > 0 && <Text style={styles.disclaimer}>{t("phone.savedFolder")}</Text>}
            {files.map((file) => (
              <FileCard
                key={file.id}
                name={file.name}
                size={formatBytes(file.size)}
                mimeType={file.mimeType}
                status={file.status}
                statusLabel={statusLabel(file.status, role)}
              />
            ))}
          </View>
        )}

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
      </ScrollView>

      {step === "connect" && showManual && (
        <ConnectButton
          label={t("phone.connectAction")}
          onPress={() => {
            const parsed = parsePairingCode(manualCode, ip, Number(port));
            if (!parsed) {
              setNotice(t("phone.invalidCode"));
              return;
            }
            setPeerName("");
            setPeerEmoji("");
            void beginSend({ kind: "payload", payload: parsed });
          }}
        />
      )}

      {step === "approval" && (
        <View style={styles.footerStack}>
          <ConnectButton label={t("phone.accept")} onPress={() => { receiverRef.current?.accept(); setDiscoverable(false); void stopAdvertising(); setRole("receive"); setStep("transfer"); }} />
          <Pressable onPress={() => { receiverRef.current?.reject(); setStep("receive"); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>{t("phone.decline")}</Text>
          </Pressable>
        </View>
      )}
      {step === "transfer" && (
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>{t("phone.cancel")}</Text>
        </Pressable>
      )}
      {step === "done" && (
        <View style={styles.footerStack}>
          <ConnectButton label={t("phone.done")} onPress={() => { stopReceiver(); setFiles([]); setPicked([]); setStep("home"); }} />
          <Pressable onPress={() => { stopReceiver(); setFiles([]); setPicked([]); setRole("send"); setStep("send"); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>{t("phone.sendMore")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, width: "100%", alignSelf: "center" },
    backdrop: { position: "absolute", top: 0, bottom: 0 },
    headerLogo: {
      width: 34,
      height: 34,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
      padding: 5,
      resizeMode: "contain" as const,
    },
    headerRightRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    header: { flexDirection: "row", alignItems: "center", paddingTop: 4, paddingBottom: 8, gap: 8 },
    headerTitle: { ...heading(600), flex: 1, textAlign: "left", color: colors.text, fontSize: 18 },
    headerSpacer: { width: 26 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 12, gap: 8 },
    scrollContentCenter: { flexGrow: 1, justifyContent: "center", paddingBottom: 40 },
    stack: { gap: 8 },
    prompt: { ...heading(600), color: colors.text, fontSize: 15.5, lineHeight: 19 },
    hint: { ...para(500), color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    action: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: 16 },
    actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    note: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 11 },
    noteCopy: { flex: 1, gap: 2 },
    noteTitle: { ...heading(600), color: colors.text, fontSize: 13.5 },
    noteBody: { ...para(500), color: colors.textMuted, fontSize: 11, lineHeight: 15 },
    disclaimer: { ...para(500), color: colors.textDim, fontSize: 10.5, lineHeight: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    category: { width: "30%", flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, gap: 5, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    categoryMuted: { opacity: 0.7 },
    categoryIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    categoryLabel: { ...para(600), color: colors.text, fontSize: 12, textAlign: "center" },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    section: { ...heading(600), color: colors.text, fontSize: 13 },
    link: { ...para(700), color: colors.blueSoft, fontSize: 13 },
    fileRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7 },
    fileCopy: { flex: 1, gap: 2, minWidth: 0 },
    fileName: { ...para(600), color: colors.text, fontSize: 13 },
    fileMeta: { ...para(500), color: colors.textMuted, fontSize: 11 },
    input: { ...para(), borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, backgroundColor: colors.inputBg, color: colors.text },
    centerText: { textAlign: "center" },
    flexText: { flexShrink: 1 },
    homeStack: { gap: 8, paddingTop: 2 },
    meRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 11, overflow: "hidden",marginBottom: 25 },
    meLabel: { ...para(500), color: colors.textMuted, fontSize: 11 },
    meName: { ...heading(700), color: colors.text, fontSize: 13.5 },
    meEdit: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(59,130,246,0.12)" },
    bigRow: { flexDirection: "row", gap: 8, alignItems: "stretch", marginBottom: 25 },
    noteIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(59,130,246,0.12)", alignItems: "center", justifyContent: "center" },
    privacyRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 },
    privacyIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(168,85,247,0.12)", alignItems: "center", justifyContent: "center" },
    radarCaption: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8 },
    pillRow: { flexDirection: "row", gap: 10 },
    pill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    pillActive: { borderColor: colors.purple },
    pillDisabled: { opacity: 0.45 },
    pillText: { ...para(700), color: colors.text, fontSize: 13 },
    chipRow: { flexDirection: "row", gap: 6, backgroundColor: colors.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 4 },
    chip: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 999 },
    chipActive: { backgroundColor: colors.purple },
    chipText: { ...para(700), color: colors.textMuted, fontSize: 11, flexShrink: 1 },
    chipTextActive: { color: "#FFFFFF" },
    discoverRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    modeNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
    modeNoteIcon: { marginTop: 1 },
    modeNoteText: { ...para(500), color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    approvalHero: { alignItems: "center", gap: 6, paddingTop: 4 },
    searchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12 },
    scanCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
    infoCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
    code: { ...para(500), color: colors.text, fontSize: 13, lineHeight: 18 },
    qrWrap: { alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
    heroIcon: { width: 84, height: 84, borderRadius: 42, alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,85,247,0.12)" },
    heroWarn: { backgroundColor: colors.warningBg },
    statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 28, marginTop: 6 },
    heroTitle: { ...heading(600), color: colors.text, fontSize: 17, textAlign: "center" },
    notice: { ...para(500), color: colors.warning, fontSize: 13, lineHeight: 18, textAlign: "center" },
    wifiButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.blue },
    wifiButtonText: { ...para(700), color: "#FFFFFF", fontSize: 12 },
    footerStack: { gap: 6, paddingBottom: 6 },
    secondaryButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    secondaryText: { ...para(700), color: colors.text, fontSize: 14 },
    cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.card, marginTop: 4, marginBottom: 14 },
    cancelText: { ...para(700), color: colors.text, fontSize: 14 },
    pressed: { opacity: 0.75 },
    scanner: {
      flex: 1,
      alignSelf: "stretch",
      width: "100%",
      backgroundColor: "#000",
    },
    camera: { flex: 1, width: "100%" },
    scanFrame: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    scanDim: { flex: 1, backgroundColor: "rgba(5, 8, 16, 0.62)" },
    scanRow: { flexDirection: "row" },
    scanWindow: { backgroundColor: "transparent" },
    corner: { position: "absolute", width: 28, height: 28, borderColor: "#FFFFFF" },
    cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
    cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
    scanFooter: { flex: 1, backgroundColor: "rgba(5, 8, 16, 0.62)", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 28, gap: 16 },
    scanTitle: { ...heading(600), color: "#FFFFFF", fontSize: 16, lineHeight: 22, textAlign: "center" },
    scanCancel: { minWidth: 160, minHeight: 48, paddingHorizontal: 28, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", backgroundColor: "rgba(18, 20, 28, 0.92)", alignItems: "center", justifyContent: "center" },
    scanCancelText: { ...para(700), color: "#FFFFFF", fontSize: 16 },
  });
}
