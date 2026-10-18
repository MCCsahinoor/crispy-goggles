/**
 * SHAREit / Xender style building blocks for phone-to-phone sharing:
 * big round Send/Receive buttons, a pulsing radar with nearby phones as avatar bubbles,
 * and a sender -> receiver transfer header.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

import { Text } from "../lib/disableFontScaling";
import { heading, para, useTheme, useThemedStyles, type ThemeColors } from "../theme";

const AVATAR_GRADIENTS: readonly (readonly [string, string])[] = [
  ["#3B82F6", "#6366F1"],
  ["#A855F7", "#EC4899"],
  ["#10B981", "#0EA5E9"],
  ["#F59E0B", "#EF4444"],
  ["#06B6D4", "#3B82F6"],
  ["#8B5CF6", "#6366F1"],
];

function hashName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const first = Array.from(words[0])[0] ?? "";
  const second = words.length > 1 ? (Array.from(words[1])[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

type AvatarProps = {
  name: string;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  /** A profile emoji wins over the icon and the initials. */
  emoji?: string;
};

export function Avatar({ name, size = 52, icon, emoji }: AvatarProps) {
  const styles = useThemedStyles(createStyles);
  const colors = AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length];
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {emoji ? (
        <Text style={[styles.avatarEmoji, { fontSize: size * 0.5, lineHeight: size * 0.62 }]}>{emoji}</Text>
      ) : icon ? (
        <Ionicons name={icon} size={size * 0.46} color="#FFFFFF" />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
      )}
    </LinearGradient>
  );
}

type BigActionButtonProps = {
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string];
  glow: string;
  onPress: () => void;
};

/** Large round gradient button, as on the SHAREit / Xender home screen. */
export function BigActionButton({ label, caption, icon, gradient, glow, onPress }: BigActionButtonProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.bigWrap, pressed && styles.pressedScale]}
    >
      <View style={[styles.bigGlow, { backgroundColor: glow }]} />
      <LinearGradient colors={gradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.bigCircle}>
        <Ionicons name={icon} size={34} color="#FFFFFF" />
      </LinearGradient>
      <Text style={styles.bigLabel}>{label}</Text>
      <Text style={styles.bigCaption} numberOfLines={2}>{caption}</Text>
    </Pressable>
  );
}

type ActionCardProps = BigActionButtonProps & {
  /** Tint of the wave along the bottom edge, e.g. the gradient's first colour. */
  tint: string;
};

/**
 * Soft two-tone wave along the bottom edge of a card. The parent needs `overflow: "hidden"`;
 * `id` must be unique per card because the gradient is an SVG definition.
 */
type CardWaveProps = {
  tint: string;
  id: string;
  height?: number;
  /** 1 = the Send/Receive cards; lower values fade the wave for quieter cards. */
  strength?: number;
};

export function CardWave({ tint, id, height = 44, strength = 1 }: CardWaveProps) {
  const styles = useThemedStyles(createStyles);
  const waveId = `wave-${id.replace(/\W/g, "")}`;
  return (
    <View pointerEvents="none" style={[styles.wave, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 200 60" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id={waveId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={0.1 * strength} />
            <Stop offset="1" stopColor={tint} stopOpacity={0.34 * strength} />
          </SvgGradient>
        </Defs>
        <Path d="M0 38 C 40 18, 80 52, 120 30 S 180 22, 200 34 L200 60 L0 60 Z" fill={tint} opacity={0.12 * strength} />
        <Path d="M0 46 C 50 30, 90 58, 140 40 S 185 36, 200 44 L200 60 L0 60 Z" fill={`url(#${waveId})`} />
      </Svg>
    </View>
  );
}

/**
 * Send / Receive as a tall rounded card: round gradient button, label, caption, and a soft
 * two-tone wave along the bottom edge.
 */
export function ActionCard({ label, caption, icon, gradient, glow, tint, onPress }: ActionCardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressedScale]}
    >
      <View style={styles.actionBody}>
        <View style={styles.bigWrap}>
          <View style={[styles.cardGlow, { backgroundColor: glow }]} />
          <LinearGradient colors={gradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.cardCircle}>
            <Ionicons name={icon} size={22} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.bigLabel}>{label}</Text>
          <Text style={styles.bigCaption} numberOfLines={2}>{caption}</Text>
        </View>
      </View>
      <CardWave tint={tint} id={label} />
    </Pressable>
  );
}

/** Soft circles and a curved sweep behind a screen, as on the design mock. */
export function Backdrop({ tint = "#3B82F6", accent = "#A855F7" }: { tint?: string; accent?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <SvgGradient id="backdrop-sweep" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity="0" />
            <Stop offset="1" stopColor={accent} stopOpacity="0.1" />
          </SvgGradient>
        </Defs>
        <Path d="M0 860 C 140 640, 300 620, 400 500 L400 860 Z" fill="url(#backdrop-sweep)" />
        <Path d="M0 800 m-90 0 a 120 120 0 1 0 240 0 a 120 120 0 1 0 -240 0" fill={tint} opacity={0.05} />
        <Path d="M60 770 m-14 0 a 14 14 0 1 0 28 0 a 14 14 0 1 0 -28 0" fill={tint} opacity={0.08} />
        <Path d="M400 60 m-70 0 a 70 70 0 1 0 140 0 a 70 70 0 1 0 -140 0" fill={accent} opacity={0.05} />
      </Svg>
    </View>
  );
}

function Ripple({ delay, size, color }: { delay: number; size: number; color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: `${color}14`,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

/** How far the beam trails behind its leading edge, and how many stacked layers fade that trail. */
const SWEEP_TRAIL_DEG = 75;
const SWEEP_SLICES = 24;
/** Opacity of the beam right behind its leading edge; each layer adds a little to reach it. */
const SWEEP_PEAK = 0.34;

function sectorPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const from = (fromDeg * Math.PI) / 180;
  const to = (toDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(from);
  const y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to);
  const y2 = cy + r * Math.sin(to);
  return `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

/**
 * A radar beam: a bright leading edge pointing right (0°) with a wedge that fades out behind it.
 * The parent rotates it clockwise, so the trail sits at negative angles. SVG has no conic
 * gradient, so the fade is a stack of sectors that all end at the leading edge and start a
 * little later each: the deeper into the stack, the more layers overlap and the denser the tint.
 * Stacking, rather than tiling, leaves no seams between steps.
 */
function SweepSector({ size, color }: { size: number; color: string }) {
  const half = size / 2;
  const step = SWEEP_TRAIL_DEG / SWEEP_SLICES;
  const layerOpacity = 1 - Math.pow(1 - SWEEP_PEAK, 1 / SWEEP_SLICES);
  const layers = Array.from({ length: SWEEP_SLICES }, (_, index) => ({
    key: index,
    d: sectorPath(half, half, half, -SWEEP_TRAIL_DEG + index * step, 0),
  }));
  return (
    <Svg width={size} height={size} pointerEvents="none">
      {layers.map((item) => (
        <Path key={item.key} d={item.d} fill={color} opacity={layerOpacity} />
      ))}
      <Path d={`M${half},${half} L${size},${half}`} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
    </Svg>
  );
}

export type RadarPeer = {
  key: string;
  name: string;
  emoji?: string;
  caption?: string;
  onPress: () => void;
};

const BUBBLE_W = 70;
const BUBBLE_H = 72;
/** Fixed slots around the radar so bubbles never land on top of each other or the centre. */
const SLOT_ANGLES = [-60, 20, 140, -140, 80, 200];

function PeerBubble({ peer, x, y }: { peer: RadarPeer; x: number; y: number }) {
  const styles = useThemedStyles(createStyles);
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [appear]);
  return (
    <Animated.View
      style={[styles.bubble, { left: x - BUBBLE_W / 2, top: y - BUBBLE_H / 2 + 8, opacity: appear, transform: [{ scale: appear }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={peer.name}
        onPress={peer.onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.bubbleInner, pressed && styles.pressedScale]}
      >
        <View style={styles.bubbleRing}>
          <Avatar name={peer.name} size={40} emoji={peer.emoji} />
        </View>
        <Text style={styles.bubbleName} numberOfLines={1}>{peer.name}</Text>
        {!!peer.caption && <Text style={styles.bubbleCaption} numberOfLines={1}>{peer.caption}</Text>}
      </Pressable>
    </Animated.View>
  );
}

type RadarProps = {
  size: number;
  tint: string;
  center: ReactNode;
  peers?: RadarPeer[];
  scanning?: boolean;
};

/** Pulsing radar. The centre is this phone; nearby phones appear as bubbles on the outer ring. */
export function Radar({ size, tint, center, peers = [], scanning = true }: RadarProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const half = size / 2;
  const orbit = half * 0.7;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, sweep]);

  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={[styles.radar, { width: size, height: size }]}>
      {[1, 0.7, 0.4].map((ratio) => (
        <View
          key={ratio}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size * ratio,
              height: size * ratio,
              borderRadius: (size * ratio) / 2,
              borderColor: colors.border,
            },
          ]}
        />
      ))}
      {scanning && (
        <>
          <Ripple delay={0} size={size} color={tint} />
          <Ripple delay={800} size={size} color={tint} />
          <Ripple delay={1600} size={size} color={tint} />
          <Animated.View pointerEvents="none" style={[styles.sweepWrap, { width: size, height: size, transform: [{ rotate }] }]}>
            <SweepSector size={size} color={tint} />
          </Animated.View>
        </>
      )}
      <View style={styles.center}>{center}</View>
      {peers.slice(0, SLOT_ANGLES.length).map((peer, index) => {
        const angle = (SLOT_ANGLES[index] * Math.PI) / 180;
        return (
          <PeerBubble
            key={peer.key}
            peer={peer}
            x={half + orbit * Math.cos(angle)}
            y={half + orbit * Math.sin(angle)}
          />
        );
      })}
    </View>
  );
}

const SELF_AVATAR = 50;
/** Avatar plus the ring's padding and border: the only part of the badge that takes layout space. */
const SELF_RING = SELF_AVATAR + 2 * (4 + 2);

/**
 * Centre of the radar: this phone, with a soft pulse. Only the ring occupies layout space, so the
 * radar's rings and sweep stay centred on the avatar; the label hangs below it.
 */
export function SelfBadge({ name, label, tint, emoji }: { name: string; label: string; tint: string; emoji?: string }) {
  const styles = useThemedStyles(createStyles);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <View style={styles.selfWrap}>
      <Animated.View style={[styles.selfRing, { borderColor: tint, transform: [{ scale }] }]}>
        <Avatar name={name} size={SELF_AVATAR} icon="phone-portrait" emoji={emoji} />
      </Animated.View>
      <Text style={styles.selfLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function FlowDot({ delay, color, active }: { delay: number; color: string; active: boolean }) {
  const value = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0.25);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.25, duration: 350, useNativeDriver: true }),
        Animated.delay(900 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, delay, value]);
  return <Animated.View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, opacity: value }} />;
}

/** Diagonal highlight that sweeps across a card every couple of seconds, like glass catching light. */
function CardShine({ active }: { active: boolean }) {
  const styles = useThemedStyles(createStyles);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.delay(1400),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);
  const left = progress.interpolate({ inputRange: [0, 1], outputRange: ["-55%", "135%"] });
  return (
    <View pointerEvents="none" style={styles.shineClip}>
      <Animated.View style={[styles.shineBand, { left }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** A small file chip that flies from the sender card to the receiver card along the link. */
function FileFly({ active, color }: { active: boolean; color: string }) {
  const styles = useThemedStyles(createStyles);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);
  if (!active) {
    return null;
  }
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-22, 22] });
  const opacity = progress.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.7] });
  return (
    <Animated.View pointerEvents="none" style={[styles.fileFly, { opacity, transform: [{ translateX }, { scale }] }]}>
      <Ionicons name="document" size={13} color={color} />
    </Animated.View>
  );
}

type TransferPairProps = {
  from: string;
  to: string;
  active: boolean;
  fromEmoji?: string;
  toEmoji?: string;
  fromCaption?: string;
  toCaption?: string;
  /** Shown in place of initials when a side has no real name yet (e.g. a phone joined by code). */
  fromIcon?: keyof typeof Ionicons.glyphMap;
  toIcon?: keyof typeof Ionicons.glyphMap;
};

/** Two phone cards with a pulsing dotted link between them, shown while files are moving. */
export function TransferPair({ from, to, active, fromEmoji, toEmoji, fromCaption, toCaption, fromIcon, toIcon }: TransferPairProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.pair}>
      <View style={styles.pairCard}>
        <CardShine active={active} />
        <Avatar name={from} size={36} emoji={fromEmoji} icon={fromIcon} />
        <Text style={styles.pairName} numberOfLines={1}>{from}</Text>
        {!!fromCaption && <Text style={styles.pairCaption} numberOfLines={1}>{fromCaption}</Text>}
      </View>
      <View style={styles.pairLink}>
        <View pointerEvents="none" style={[styles.pairRing, { width: 44, height: 44, borderRadius: 22, borderColor: colors.border }]} />
        <View pointerEvents="none" style={[styles.pairRing, { width: 32, height: 32, borderRadius: 16, borderColor: colors.borderStrong }]} />
        <FileFly active={active} color={colors.purple} />
        <View style={styles.pairFlow}>
          <FlowDot delay={0} color={colors.blueSoft} active={active} />
          <FlowDot delay={150} color={colors.blueSoft} active={active} />
          <FlowDot delay={300} color={colors.blueSoft} active={active} />
          <View style={[styles.pairArrow, { borderColor: colors.blueSoft }]}>
            <Ionicons name="arrow-forward" size={11} color={colors.blueSoft} />
          </View>
          <FlowDot delay={450} color={colors.purpleSoft} active={active} />
          <FlowDot delay={600} color={colors.purpleSoft} active={active} />
          <FlowDot delay={750} color={colors.purpleSoft} active={active} />
        </View>
      </View>
      <View style={styles.pairCard}>
        <CardShine active={active} />
        <Avatar name={to} size={36} emoji={toEmoji} icon={toIcon} />
        <Text style={styles.pairName} numberOfLines={1}>{to}</Text>
        {!!toCaption && <Text style={styles.pairCaption} numberOfLines={1}>{toCaption}</Text>}
      </View>
    </View>
  );
}

type ProgressRingProps = {
  /** 0..1 */
  progress: number;
  /** Big figure in the middle, e.g. "70%". */
  value: string;
  /** Small line under the figure, e.g. "Waiting for acceptance". */
  label?: string;
  size?: number;
};

/** Gradient progress ring with the percentage and a short status underneath, in the middle. */
export function ProgressRing({ progress, value, label, size = 108 }: ProgressRingProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="progress-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.blue} />
            <Stop offset="1" stopColor={colors.purple} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {clamped > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#progress-ring)"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <Text style={styles.ringValue}>{value}</Text>
        {!!label && <Text style={styles.ringLabel} numberOfLines={2}>{label}</Text>}
      </View>
    </View>
  );
}

export type FileCardStatus = "waiting" | "transferring" | "completed" | "failed";

type FileCardProps = {
  name: string;
  size: string;
  status: FileCardStatus;
  /** Pill text, e.g. "Awaiting acceptance" or "Sending". */
  statusLabel: string;
  /** 0..1; omit to hide the bar. */
  progress?: number;
  mimeType?: string;
};

function fileIcon(name: string, mimeType?: string): keyof typeof Ionicons.glyphMap {
  const lower = name.toLowerCase();
  const type = mimeType?.toLowerCase() ?? "";
  if (lower.endsWith(".apk") || lower.endsWith(".apks") || type.includes("android.package")) return "logo-android";
  if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(lower)) return "image";
  if (type.startsWith("video/") || /\.(mp4|mkv|mov|webm|avi|3gp)$/.test(lower)) return "videocam";
  if (type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/.test(lower)) return "musical-notes";
  if (/\.(zip|rar|7z|tar|gz)$/.test(lower)) return "archive";
  if (lower.endsWith(".pdf")) return "document-text";
  return "document";
}

/** A file in a transfer: icon tile, name, size, status pill and a gradient progress bar. */
export function FileCard({ name, size, status, statusLabel, progress, mimeType }: FileCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const tone = status === "completed"
    ? { bg: colors.successBg, border: colors.successBorder, text: colors.success, icon: "checkmark-circle" as const }
    : status === "failed"
      ? { bg: colors.dangerBg, border: colors.dangerBorder, text: colors.danger, icon: "alert-circle" as const }
      : status === "transferring"
        ? { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.35)", text: colors.blueSoft, icon: "arrow-up-circle" as const }
        : { bg: colors.warningBg, border: colors.warningBorder, text: colors.warning, icon: "time-outline" as const };
  const width = progress === undefined ? 0 : Math.max(0, Math.min(100, progress * 100));
  return (
    <View style={styles.fileCard}>
      <View style={styles.fileCardRow}>
        <LinearGradient colors={["#6366F1", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fileTile}>
          <Ionicons name={fileIcon(name, mimeType)} size={20} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.fileCardCopy}>
          <Text style={styles.fileCardName} numberOfLines={1}>{name}</Text>
          <View style={styles.fileCardMetaRow}>
            <Text style={styles.fileCardSize}>{size}</Text>
            <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Ionicons name={tone.icon} size={10} color={tone.text} />
              <Text style={[styles.statusPillText, { color: tone.text }]} numberOfLines={1}>{statusLabel}</Text>
            </View>
          </View>
        </View>
      </View>
      {progress !== undefined && (
        <View style={styles.fileTrack}>
          <LinearGradient colors={[colors.blue, colors.purple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fileFill, { width: `${width}%` }]} />
        </View>
      )}
    </View>
  );
}

/** A soft card with a round icon and one line of advice. */
export function TipCard({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIcon}>
        <Ionicons name={icon} size={18} color={colors.blueSoft} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatar: { alignItems: "center", justifyContent: "center" },
    avatarText: { ...heading(700), color: "#FFFFFF" },
    avatarEmoji: { textAlign: "center", includeFontPadding: false },
    pressedScale: { opacity: 0.85, transform: [{ scale: 0.96 }] },

    bigWrap: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
    bigGlow: { position: "absolute", top: 0, width: 108, height: 108, borderRadius: 54 },
    bigCircle: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", overflow: "hidden", marginTop: 10, marginBottom: 8 },
    bigLabel: { ...heading(700), color: colors.text, fontSize: 15 },
    bigCaption: { ...para(500), color: colors.textMuted, fontSize: 10.5, lineHeight: 13, textAlign: "center", paddingHorizontal: 6 },

    actionCard: { flex: 1, minHeight: 142, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    actionBody: { flex: 1, paddingTop: 9, paddingBottom: 20, paddingHorizontal: 6 },
    cardGlow: { position: "absolute", top: 2, width: 66, height: 66, borderRadius: 33 },
    cardCircle: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", overflow: "hidden", marginTop: 8, marginBottom: 6 },
    wave: { position: "absolute", left: 0, right: 0, bottom: 0 },

    radar: { alignSelf: "center", alignItems: "center", justifyContent: "center" },
    ring: { position: "absolute", borderWidth: 1, borderStyle: "dashed" },
    sweepWrap: { position: "absolute", top: 0, left: 0 },
    center: { alignItems: "center", justifyContent: "center" },

    bubble: { position: "absolute", width: BUBBLE_W, height: BUBBLE_H, alignItems: "center" },
    bubbleInner: { alignItems: "center", gap: 3 },
    bubbleRing: { padding: 3, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    bubbleName: { ...para(700), color: colors.text, fontSize: 12, maxWidth: BUBBLE_W, textAlign: "center" },
    bubbleCaption: { ...para(500), color: colors.textMuted, fontSize: 10, maxWidth: BUBBLE_W, textAlign: "center" },

    selfWrap: { width: SELF_RING, height: SELF_RING, alignItems: "center", justifyContent: "center" },
    selfRing: { width: SELF_RING, height: SELF_RING, padding: 4, borderRadius: SELF_RING / 2, borderWidth: 2, backgroundColor: colors.card },
    selfLabel: { ...heading(600), position: "absolute", top: SELF_RING + 6, width: 150, color: colors.text, fontSize: 12, textAlign: "center" },

    pair: { flexDirection: "row", alignItems: "stretch", justifyContent: "center", gap: 3 },
    pairCard: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1, paddingTop: 9, paddingBottom: 8, paddingHorizontal: 6, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    pairName: { ...heading(700), color: colors.text, fontSize: 12, lineHeight: 15, textAlign: "center", marginTop: 4 },
    pairCaption: { ...para(500), color: colors.textMuted, fontSize: 10, lineHeight: 13, textAlign: "center" },
    pairLink: { width: 54, alignItems: "center", justifyContent: "center" },
    pairRing: { position: "absolute", borderWidth: 1, opacity: 0.6 },
    pairFlow: { flexDirection: "row", alignItems: "center", gap: 2.5 },
    pairArrow: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginHorizontal: 2, backgroundColor: colors.bgElevated },
    shineClip: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" },
    shineBand: { position: "absolute", top: -24, bottom: -24, width: 28, transform: [{ rotate: "18deg" }] },
    fileFly: { position: "absolute", top: -20 },

    ringWrap: { alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 6, marginBottom: 2 },
    ringCenter: { position: "absolute", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
    ringValue: { ...heading(800), color: colors.text, fontSize: 18, lineHeight: 22 },
    ringLabel: { ...para(600), color: colors.textMuted, fontSize: 9.5, lineHeight: 12, textAlign: "center", marginTop: 1 },

    fileCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    fileCardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    fileTile: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    fileCardCopy: { flex: 1, minWidth: 0, gap: 3 },
    fileCardName: { ...para(700), color: colors.text, fontSize: 13, lineHeight: 17 },
    fileCardMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    fileCardSize: { ...para(500), color: colors.textMuted, fontSize: 11, lineHeight: 14 },
    statusPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3, borderRadius: 999, borderWidth: 1, maxWidth: "70%" },
    statusPillText: { ...para(600), fontSize: 9, lineHeight: 12, flexShrink: 1 },
    fileTrack: { height: 5, borderRadius: 99, backgroundColor: colors.border, overflow: "hidden" },
    fileFill: { height: 5, borderRadius: 99 },

    tipCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
    tipIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(59,130,246,0.12)", borderWidth: 1, borderColor: "rgba(59,130,246,0.25)" },
    tipText: { ...para(500), color: colors.text, fontSize: 12.5, lineHeight: 17, flex: 1 },
  });
}
